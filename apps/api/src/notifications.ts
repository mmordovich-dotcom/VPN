import type { PrismaClient, BackgroundJob } from '@shared-vps/database';
import { databaseNow, DeferJob, JobFailure, JobQueue } from './job-queue.js';
import { TelegramFailure } from './telegram-errors.js';

const statuses: Record<string, string> = { PAID: 'подтверждён, ожидает активации', COMPLETED: 'выполнен', FAILED: 'отклонён', CANCELLED: 'отменён' };
export class Notifications {
  constructor(private db: PrismaClient, private send: (method: string, body: Record<string, unknown>) => Promise<unknown>) {}
  async deliver(job: BackgroundJob): Promise<boolean> {
    const body = job.payload as Record<string, unknown>;
    if (typeof body.userId !== 'string' || typeof body.event !== 'string') throw new JobFailure('INVALID_NOTIFICATION', true);
    const userId = body.userId; const event = body.event;
    const prepared = await this.db.$transaction(async tx => {
      // Serialize the per-user and global send reservations across API/standalone workers.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(13002026)::text`;
      const now = await databaseNow(tx);
      if (!await new JobQueue(this.db).owns(tx, job, now)) throw new JobFailure('LEASE_LOST', true);
      const user = await tx.user.findUnique({ where: { id: userId }, include: { identities: true, notificationPreference: true } });
      const transactional = ['SUPPORT_REPLY','COMPENSATION','INCIDENT_ALERT'].includes(event);
      if (!user || user.status !== 'ACTIVE') return null;
      const preference = user.notificationPreference ?? (transactional ? await tx.notificationPreference.upsert({where:{userId},update:{},create:{userId}}) : null);
      if (!preference || preference.telegramBlocked) return null;
      const reminder = event.startsWith('REMINDER') || event === 'EXPIRED';
      if (!transactional && (reminder ? !preference.remindersEnabled : !preference.updatesEnabled)) return null;
      const identity = user.identities.find(x => x.provider === 'TELEGRAM');
      if (!identity || !/^\d{1,16}$/.test(identity.providerUserId)) return null;
      let text = '';
      let buttons = [[{text:'Инструкция',callback_data:'help'},{text:'Моя подписка',callback_data:'subscription'}],[{text:'Поддержка',callback_data:'support'}]];
      if (event === 'SUPPORT_REPLY') {
        if(typeof body.messageId !== 'string' || now.getTime()-job.createdAt.getTime()>7*86400000) return null;
        const message=await tx.supportMessage.findFirst({where:{id:body.messageId,authorRole:'ADMIN',ticket:{userId}},include:{ticket:true}}); if(!message)return null;
        text='Ответ поддержки · №'+message.ticket.number+'\n'+message.text.slice(0,3000)+'\n\nПолная переписка доступна в обращении.';
        buttons=[[{text:'Открыть обращение',callback_data:'support:view:'+message.ticketId}]];
      } else if (event === 'COMPENSATION') {
        if(typeof body.compensationId !== 'string')return null;
        const credit=await tx.subscriptionCompensation.findFirst({where:{id:body.compensationId,subscription:{userId}}});if(!credit || now.getTime()-credit.createdAt.getTime()>7*86400000)return null;
        text='Срок демо-подписки увеличен на '+credit.hours+' ч. после проверки инцидента. Компенсация записана в историю; денежных операций нет.';
      } else if (event === 'INCIDENT_ALERT') {
        if(user.role!=='ADMIN' || typeof body.incidentId !== 'string')return null;
        const incident=await tx.serviceIncident.findFirst({where:{id:body.incidentId,status:'CONFIRMED',confirmedAt:{lte:new Date(now.getTime()-900000)}}});if(!incident)return null;
        text='ADMIN · Демо-инцидент длится более 15 минут. Компонент: '+incident.component+'. Проверьте историю наблюдений в админке. Автоматического обращения к провайдеру нет.';
      } else if (event === 'ORDER') {
        if(now.getTime()-job.createdAt.getTime()>86400000)return null;
        if (typeof body.orderId !== 'string') throw new JobFailure('INVALID_NOTIFICATION', true);
        const order = await tx.order.findFirst({ where: { id: body.orderId, userId } });
        if (!order || order.status !== body.expectedStatus || !statuses[order.status] || order.renewalId && order.status==='COMPLETED') return null;
        if(order.status==='COMPLETED'){const sub=await tx.subscription.findFirst({where:{orderId:order.id,userId,status:'ACTIVE',expiresAt:{gt:now}}});if(!sub)return null;}
        text = 'Демо-заказ '+order.id+': '+statuses[order.status]+'. Реального списания нет. Проверить: «Моя подписка».';
        if(order.status==='COMPLETED')text+=' Подписка активна. Пошаговая инструкция доступна кнопкой ниже.';
      } else {
        if (typeof body.subscriptionId !== 'string' || typeof body.expectedExpiry !== 'string') throw new JobFailure('INVALID_NOTIFICATION', true);
        const sub = await tx.subscription.findFirst({ where: { id: body.subscriptionId, userId } });
        if (!sub?.expiresAt || sub.expiresAt.toISOString() !== body.expectedExpiry) return null;
        const left = sub.expiresAt.getTime() - now.getTime();
        const newer = await tx.subscription.count({ where: { userId, id: { not: sub.id }, status: 'ACTIVE', expiresAt: { gt: now } } });
        if (event === 'REMINDER_3') { if (sub.status !== 'ACTIVE' || left <= 86400000 || left > 3 * 86400000) return null; text = 'Демо-подписка заканчивается менее чем через 3 дня.'; }
        else if (event === 'REMINDER_1') { if (sub.status !== 'ACTIVE' || left <= 0 || left > 86400000) return null; text = 'Демо-подписка заканчивается менее чем через сутки.'; }
        else if (event === 'EXPIRED') { if (sub.status !== 'EXPIRED' || left > 0 || left < -7 * 86400000 || newer) return null; text = 'Срок демо-подписки закончился. История сохранена, место освобождено.'; }
        else if (event === 'RENEWED') { if (sub.status !== 'ACTIVE' || left <= 0 || now.getTime() - job.createdAt.getTime() > 86400000) return null; text = 'Демонстрационное продление выполнено. Инструкция доступна кнопкой ниже.'; }
        else throw new JobFailure('INVALID_NOTIFICATION', true);
        text += ` Окончание: ${sub.expiresAt.toISOString().slice(0, 10)} (UTC). Действия доступны в меню подписки.`;
      }
      const throttle = await tx.deliveryThrottle.findUnique({ where: { key: 'notifications' } });
      const until = Math.max(preference.nextSendAt.getTime(), throttle?.nextAt.getTime() ?? 0);
      if (until > now.getTime()) throw new DeferJob(new Date(until));
      await tx.deliveryThrottle.upsert({ where: { key: 'notifications' }, update: { nextAt: new Date(now.getTime() + 1100) }, create: { key: 'notifications', nextAt: new Date(now.getTime() + 1100) } });
      await tx.notificationPreference.update({ where: { userId }, data: { nextSendAt: new Date(now.getTime() + 30000) } });
      const sendingAt=await databaseNow(tx);
      const owned=await tx.backgroundJob.updateMany({ where: { id:job.id,status:'PROCESSING',leaseToken:job.leaseToken,leaseUntil:{gt:sendingAt} }, data: { sendStartedAt:sendingAt,leaseUntil:new Date(sendingAt.getTime()+30000) } });
      if(!owned.count)throw new JobFailure('LEASE_LOST',true);
      return { chat_id: identity.providerUserId, text: `AXON · ${text}`, reply_markup:{inline_keyboard:buttons}, link_preview_options: { is_disabled: true } };
    });
    if (!prepared) return true;
    try { await this.send('sendMessage', prepared); }
    catch (error) {
      if (error instanceof TelegramFailure && error.code === 'TELEGRAM_BLOCKED') await this.db.notificationPreference.updateMany({ where: { userId }, data: { telegramBlocked: true } });
      if (error instanceof JobFailure) throw error;
      throw new TelegramFailure('TELEGRAM_DELIVERY_UNKNOWN');
    }
    return false;
  }
}
