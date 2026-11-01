import { instructionText, instructionPlatforms, purchaseGuidance, purchaseSteps, supportCategories, supportStatuses, type SupportCategory } from '@shared-vps/shared';
import { SupportService } from './support.js';
import { appLabel, miniAppButton, inlineMainMenu, contextualKeyboard, withoutButtonStyles, supportChunks, inline, botStatus, botError } from './bot-ui.js';
import { randomUUID, createHash } from 'node:crypto';
import { backoff, databaseNow } from './job-queue.js';
import { TelegramFailure, telegramFailure } from './telegram-errors.js';
import type { PrismaClient, Prisma } from '@shared-vps/database';
import type { ApiConfig } from '@shared-vps/runtime';
import { equal } from './auth.js';
import { DomainError, fail, SubscriptionEngine } from './engine.js';
import { BotLogin } from './bot-login.js';
import { loginAction, type LoginAction } from './bot-login-updates.js';
type Update = { update_id: number; loginAction?: LoginAction; message?: { message_id: number; text?: string; from?: { id: number; is_bot?: boolean }; chat: { id: number; type: string } }; callback_query?: { id: string; data?: string; from: { id: number; is_bot?: boolean }; message?: { message_id: number; chat: { id: number; type: string } } } };
type Reply = { method: string; body: Record<string, unknown>; removeKeyboard?: boolean };
const buttons = ['🛒 Купить подписку', '👤 Моя подписка', '🔌 Подключиться', '🔄 Продлить подписку', '📖 Инструкции', '💬 Поддержка'];
// Compatibility export: never install a persistent Reply Keyboard again.
export const mainKeyboard = { remove_keyboard: true };
const back = { text: '← Назад', callback_data: 'menu' };
export class TelegramGateway {
  private login: BotLogin;
  private support: SupportService;
  constructor(private db: PrismaClient, private config: ApiConfig, private engine: SubscriptionEngine, private transport?: (method: string, body: Record<string, unknown>) => Promise<unknown>) { this.login = new BotLogin(db, config, engine); this.support = new SupportService(db); }
  authentic(secret: string) { return Boolean(this.config.TELEGRAM_BOT_TOKEN && this.config.TELEGRAM_WEBHOOK_SECRET && equal(secret, this.config.TELEGRAM_WEBHOOK_SECRET)); }
  async call(method: string, body: Record<string, unknown>): Promise<unknown> {
    if (this.transport) return this.transport(method, body);
    if (!this.config.TELEGRAM_BOT_TOKEN) return fail(503, 'BOT_NOT_CONFIGURED');
    let result: Response;
    try { result = await fetch(`https://api.telegram.org/bot${this.config.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(method === 'answerCallbackQuery' ? 1500 : 8000) }); } catch { throw new TelegramFailure(method === 'sendMessage' || method === 'editMessageText' ? 'TELEGRAM_DELIVERY_UNKNOWN' : 'TELEGRAM_RETRY'); }
    let data: { ok: boolean; result?: unknown; description?: string; error_code?: number; parameters?: { retry_after?: number } };
    try { data = await result.json() as typeof data; } catch { throw new TelegramFailure('TELEGRAM_DELIVERY_UNKNOWN'); }
    if (!result.ok || !data.ok) {
      if (method === 'editMessageText' && data.description?.includes('message is not modified')) return {};
      if (data.error_code === 400 && /style/i.test(data.description ?? '') && JSON.stringify(body.reply_markup ?? {}).includes('"style":')) return this.call(method, withoutButtonStyles(body));
      if (method === 'editMessageText' && data.error_code === 400 && /message to edit not found|message can.t be edited|message_id_invalid/i.test(data.description ?? '')) throw new TelegramFailure('TELEGRAM_EDIT_UNAVAILABLE');
      throw telegramFailure(data.error_code ?? result.status, data.parameters?.retry_after);
    }
    return data.result;
  }
  async register() {
    const origin = this.config.PUBLIC_ORIGIN;
    if (!origin?.startsWith('https://') || !this.config.TELEGRAM_WEBHOOK_SECRET) fail(409, 'WEBHOOK_NOT_CONFIGURED');
    await this.call('setWebhook', { url: `${origin}/api/v1/telegram/webhook`, secret_token: this.config.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'], drop_pending_updates: false, max_connections: 4 });
    return { ok: true };
  }
  async status() {
    const result = await this.call('getWebhookInfo', {}) as { url?: string; pending_update_count?: number; last_error_date?: number };
    return { url: result.url, pending: result.pending_update_count, lastErrorAt: result.last_error_date ?? null };
  }
  async bootstrap() {
    if (!this.login.available() || !this.config.PUBLIC_ORIGIN) return;
    const bot = await this.call('getMe', {}) as { username?: string };
    if (bot.username?.toLowerCase() !== this.config.TELEGRAM_BOT_USERNAME?.toLowerCase()) fail(409, 'BOT_USERNAME_MISMATCH');
    const current = await this.status();
    if (current.url && current.url !== `${this.config.PUBLIC_ORIGIN}/api/v1/telegram/webhook`) fail(409, 'WEBHOOK_IN_USE');
    await this.register();
    const app = miniAppButton(this.config.PUBLIC_ORIGIN);
    if (app) await this.call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'AXON', web_app: app.web_app } });
  }
  async accept(raw: unknown) {
    if (!raw || typeof raw !== 'object' || !Number.isInteger((raw as Update).update_id) || (raw as Update).update_id < 0) fail(400, 'INVALID_UPDATE');
    // The internal marker is recomputed, never trusted from an incoming JSON field.
    const { loginAction: _untrusted, ...update } = raw as Update;
    const action = loginAction(update.callback_query?.data ?? update.message?.text ?? '');
    const sender = (from: { id: number; is_bot?: boolean }) => ({ id: from.id, ...(from.is_bot === undefined ? {} : { is_bot: from.is_bot }) });
    const chat = (value: { id: number; type: string }) => ({ id: value.id, type: value.type });
    // Telegram echoes the original message (including codes/link buttons) in callbacks.
    // Store only fields needed to process the update, never the echoed credentials.
    const safe: Update = { update_id: update.update_id, ...(action ? { loginAction: action } : {}),
      ...(update.message ? { message: { message_id: update.message.message_id, chat: chat(update.message.chat),
        ...(update.message.from ? { from: sender(update.message.from) } : {}),
        ...(typeof update.message.text === 'string' ? { text: action?.type === 'CLAIM' ? '/login-request' : update.message.text } : {}) } } : {}),
      ...(update.callback_query ? { callback_query: { id: update.callback_query.id, ...(typeof update.callback_query.data === 'string' ? { data: update.callback_query.data } : {}), from: sender(update.callback_query.from),
        ...(update.callback_query.message ? { message: { message_id: update.callback_query.message.message_id, chat: chat(update.callback_query.message.chat) } } : {}) } } : {}) };
    await this.db.telegramUpdate.upsert({ where: { id: update.update_id }, update: { id:update.update_id }, create: { id: update.update_id, payload: JSON.parse(JSON.stringify(safe)) as Prisma.InputJsonObject } });
    // Acknowledge before queue/business work; a failed/expired ACK never repeats the action.
    if (safe.callback_query) try { await this.call('answerCallbackQuery', { callback_query_id: safe.callback_query.id, ...(!safe.callback_query.message ? {text:'Сообщение устарело. Откройте /start в личном чате.'} : {}) }); } catch { /* drain retries the acknowledgement as a recovery fallback */ }
  }
  private async loginReply(action: LoginAction, update: Update, senderId: number, messageId: number): Promise<Reply> {
    let text: string; let markup: object = inline([[back]]);
    if (action.type === 'CLAIM') {
      const request = await this.login.claim(action.tokenHash, String(senderId));
      text = `Подтвердите вход в AXON\n\nСверьте число на сайте: ${request.displayCode}\nПодтверждайте только запрос, который вы сами создали в своём браузере. Не подтверждайте просьбы других людей.`;
      markup = inline([[{ text: 'Подтвердить вход', callback_data: `login:yes:${request.requestId}` }], [{ text: 'Отменить вход', callback_data: `login:no:${request.requestId}` }]]);
    } else if (action.type === 'CONFIRM' || action.type === 'CANCEL') {
      await this.login.confirm(action.requestId, String(senderId), action.type === 'CONFIRM');
      text = action.type === 'CONFIRM' ? 'Вход подтверждён. Вернитесь в тот же браузер: разрешённый раздел откроется автоматически. Пользовательские функции доступны в Telegram.' : 'Вход отменён. Можно создать новый запрос на сайте.';
    } else if (action.type === 'LINK' || action.type === 'CODE') {
      const credential = await this.login.issue(String(senderId), action.type, `telegram:${update.update_id}`);
      if (!credential) text = 'Запрос уже обработан. Для новой ссылки нажмите /login, для нового кода — /code.';
      else if ('code' in credential) {
        text = `Код входа: ${credential.code}\nДействует 5 минут, используется один раз. Введите его только на ${this.config.PUBLIC_ORIGIN}. Не пересылайте код и не сообщайте его другим людям. Новый код отменит предыдущий.`;
        markup = inline([[{ text: 'Получить новый код', callback_data: 'login:code' }], [back]]);
      } else {
        text = 'Продолжите вход в браузере по одноразовой ссылке в течение 3 минут. Пользовательские функции сейчас доступны в Telegram, браузерная панель предназначена для администратора. На сайте нажмите «Продолжить», затем подтвердите вход здесь, сверив число. Не пересылайте ссылку.';
        markup = inline([[{ text: 'Открыть личный кабинет', url: credential.url }], [{ text: 'Новая ссылка', callback_data: 'login:link' }], [back]]);
      }
    } else text = 'Запрос входа недействителен. Начните вход заново на сайте.';
    return { method: update.callback_query ? 'editMessageText' : 'sendMessage', body: { chat_id: senderId, ...(update.callback_query ? { message_id: messageId } : {}), text, reply_markup: contextualKeyboard(markup,true), link_preview_options: { is_disabled: true } } };
  }
  async render(update: Update): Promise<Reply | null> {
    const cb = update.callback_query; const msg = cb?.message ?? update.message; const sender = cb?.from ?? update.message?.from;
    if (!msg || !sender || sender.is_bot || !Number.isSafeInteger(sender.id) || sender.id <= 0 || msg.chat.type !== 'private' || msg.chat.id !== sender.id) return null;
    const authAction = update.loginAction ?? loginAction(cb?.data ?? update.message?.text ?? '');
    if (authAction) return this.loginReply(authAction, update, sender.id, msg.message_id);
    const user = await this.engine.identity(String(sender.id), this.config.ADMIN_TELEGRAM_IDS);
    const rawText = cb?.data ?? update.message?.text ?? '';
    const normalized = rawText.replace(/^[no]:/, '');
    const commands:Record<string,string>={'/menu':'menu','/buy':'buy','/profile':'account','/subscription':'subscription','/renew':'renew','/connect':'connect','/instructions':'help','/help':'help','/support':'support','/orders':'orders'};
    const text = commands[normalized] ?? normalized;
    const navigation = Boolean(cb?.data?.startsWith('n:'));
    let immutable = false;
    let content = ''; let markup: object = inlineMainMenu(this.config.PUBLIC_ORIGIN);
    if (cb && !/^support:(category|reply):/.test(text)) await this.db.botState.updateMany({where:{userId:user.id,awaitingSupport:true},data:{awaitingSupport:false,activeTicketId:null}});
    const subscriptions = await this.engine.subscriptions(user.id);
    const active = subscriptions.find(s => s.status === 'ACTIVE');
    const last = active ?? subscriptions[0];
    if (text === appLabel || text === '/app' || text === 'app') {
      const button = miniAppButton(this.config.PUBLIC_ORIGIN);
      content = button ? 'AXON · Ваше пространство\n\nОткройте полное приложение внутри Telegram: каталог, подписка, история, поддержка и настройки. Быстрые действия по-прежнему доступны в чате.' : 'Приложение временно недоступно. Подписка, продление и поддержка доступны в меню бота.';
      markup = inline([...(button ? [[button]] : []), [back]]);
    } else if (text === '/notifications' || text === 'notifications' || /^notify:(reminders|updates):(on|off)$/.test(text)) {
      const match = /^notify:(reminders|updates):(on|off)$/.exec(text);
      const data = match ? { [match[1] === 'reminders' ? 'remindersEnabled' : 'updatesEnabled']: match[2] === 'on', telegramBlocked: false } : {};
      const preference = await this.db.notificationPreference.upsert({ where: { userId:user.id }, update:data, create:{userId:user.id,...data} });
      content = 'Уведомления\nНапоминания о сроке: ' + (preference.remindersEnabled ? 'включены' : 'выключены') + '\nСтатусы заказов и продления: ' + (preference.updatesEnabled ? 'включены' : 'выключены') + '\nИзменения не влияют на ответы бота и вход на сайт.';
      markup = inline([[{text:preference.remindersEnabled ? 'Выключить напоминания' : 'Включить напоминания',callback_data:'notify:reminders:'+(preference.remindersEnabled?'off':'on')}],[{text:preference.updatesEnabled ? 'Выключить статусы' : 'Включить статусы',callback_data:'notify:updates:'+(preference.updatesEnabled?'off':'on')}],[back]]);
    } else if (text.startsWith('/start') || text === 'menu') content = 'AXON\n\nУправляйте подпиской, просматривайте инструкции и получайте поддержку прямо в Telegram.\n\nДемонстрационная версия: списание 0 ₽. Реальные платежи и подключения пока недоступны.';
    else if (text === 'account') {
      content='Личный кабинет AXON\n\n'+(last?last.plan.name+' · '+botStatus(last.status)+'\nОкончание: '+(last.expiresAt?.toISOString().slice(0,10)??'—')+' UTC':'Подписки пока нет. Выберите тариф, чтобы познакомиться с демо.')+'\n\nВсе действия доступны здесь, без обязательного Mini App.';
      const app=miniAppButton(this.config.PUBLIC_ORIGIN);
      markup=inline([[{text:'📦 Моя подписка',callback_data:'subscription'}],[{text:last?'🔄 Продлить':'⚡ Выбрать подписку',callback_data:last?'renew':'buy'}],[{text:'📜 История заказов',callback_data:'orders'}],[{text:'🔔 Уведомления',callback_data:'notifications'}],...(app?[[app]]:[]),...(user.role==='ADMIN'?[[{text:'Вход администратора в браузере',callback_data:'login:link'}],[{text:'Получить код входа',callback_data:'login:code'}]]:[]),[back]]);
    }
    else if (text === 'orders' || text.startsWith('orders:')) {
      const cursor=text==='orders'?undefined:text.slice(7);
      if(cursor && (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor)||!await this.db.order.count({where:{id:cursor,userId:user.id}})))fail(404,'ORDER_NOT_FOUND');
      const rows=await this.db.order.findMany({where:{userId:user.id},include:{plan:true},orderBy:[{createdAt:'desc'},{id:'desc'}],take:6,...(cursor?{cursor:{id:cursor},skip:1}:{})});
      content='История заказов\n\n'+(rows.slice(0,5).map(o=>o.createdAt.toISOString().slice(0,10)+' · '+o.plan.name+'\n'+botStatus(o.status)+' · '+o.amount/100+' '+o.currency+' · '+o.periodDays+' дней\nСписание 0 ₽.').join('\n\n')||'Заказов пока нет. Выбор тарифа сам по себе заказ не создаёт.');
      markup=inline([...(rows.length>5?[[{text:'Ранее',callback_data:'orders:'+rows[4]!.id}]]:[]),[{text:'К подписке',callback_data:'subscription'}],[{text:'◀️ Личный кабинет',callback_data:'account'}],[back]]);
    }
    else if (text === buttons[0] || text === 'buy' || text.startsWith('catalog:')) {
      if(active){content='У вас уже есть активная подписка. Продление добавит срок к текущему окончанию.';markup=inline([[{text:'🔄 Продлить',callback_data:'renew'}],[{text:'Моя подписка',callback_data:'subscription'}],[back]]);}
      else {
        const cursor=text.startsWith('catalog:')?text.slice(8):undefined;
        if(cursor&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor))fail(400,'INVALID_BUTTON');
        const plans=await this.db.plan.findMany({where:{isActive:true},orderBy:[{code:'asc'},{id:'asc'}],take:9,...(cursor?{cursor:{id:cursor},skip:1}:{})});
        content='Выберите подписку AXON\n\n'+(plans.length?'Тарифы загружены из действующей базы. Откройте условия, затем подтвердите оформление отдельно.':'Сейчас нет доступных тарифов. Попробуйте позже или напишите в поддержку.')+'\n\nДемо-режим: реальные платежи и подключения недоступны.';
        markup=inline([...plans.slice(0,8).map(p=>[{text:p.name.slice(0,38)+' · '+p.price/100+' '+p.currency+' / '+p.durationDays+' дн.',callback_data:'plan:'+p.id}]),...(plans.length>8?[[{text:'Далее',callback_data:'catalog:'+plans[7]!.id}]]:[]),[{text:'📖 Инструкции',callback_data:'help'}],[back]]);
      }
    }
    else if (text.startsWith('plan:') || text === buttons[3] || text === 'renew') {
      const renewal=text===buttons[3]||text==='renew';
      const id=renewal?last?.planId:text.slice(5);
      if(id&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))fail(400,'INVALID_BUTTON');
      const plan=id?await this.db.plan.findUnique({where:{id}}):null;
      if(!plan?.isActive || renewal&&(!last||!['ACTIVE','EXPIRED'].includes(last.status))) {content='Подписка для продления недоступна. Откройте актуальный каталог.';markup=inline([[{text:'Выбрать подписку',callback_data:'buy'}],[back]]);}
      else {
        content=(renewal?'Продлить подписку AXON':'Подписка AXON')+'\n\n'+plan.name+'\n'+plan.price/100+' '+plan.currency+' / '+plan.durationDays+' дней\nФактическое списание: 0 ₽. Реального VPN-подключения нет.\n\n'+(renewal?'Период добавится к текущему сроку активной подписки либо начнётся заново после окончания.\n\n':'')+purchaseGuidance+'\n\nНажмите «Продолжить», чтобы подготовить заказ. На следующем шаге проверьте зафиксированные условия и подтвердите демо отдельно.';
        markup=inline([[{text:'Продолжить · 0 ₽',style:'success',callback_data:renewal?'checkout-renew:'+last!.id:'checkout:'+plan.id}],[{text:'📖 Что будет после оформления',callback_data:'help:after'}],[{text:'◀️ Назад',callback_data:renewal?'account':'buy'}]]);
      }
    }
    else if (text.startsWith('checkout:') || text.startsWith('checkout-renew:')) {
      if(!cb)fail(400,'INVALID_BUTTON');
      const renewal=text.startsWith('checkout-renew:');
      const id=text.slice(text.indexOf(':')+1);
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))fail(400,'INVALID_BUTTON');
      const sub=renewal?await this.db.subscription.findFirst({where:{id,userId:user.id}}):null;
      if(renewal&&!sub)fail(404,'SUBSCRIPTION_NOT_FOUND');
      const planId=renewal?sub!.planId:id;
      // Stable across distinct updates for the SAME button and across worker restarts.
      const key='telegram:checkout:'+createHash('sha256').update([sender.id,msg.message_id,planId,sub?.id??''].join(':')).digest('hex');
      const order=await this.engine.order(user.id,planId,key,sub?.id);
      immutable=true;
      content=order.status==='AWAITING_PAYMENT'?'Подтвердите демонстрационный заказ\n\n'+order.amount/100+' '+order.currency+' / '+order.periodDays+' дней\nСписание 0 ₽. Реального подключения нет.\n\n'+purchaseGuidance+'\n\nУсловия зафиксированы в заказе. Подтвердить или отменить?':'Заказ уже обработан: '+botStatus(order.status)+'.\nОткройте историю и актуальную подписку. Повторного оформления не произошло.';
      markup=inline([...(order.status==='AWAITING_PAYMENT'?[[{text:'Подтвердить демо · 0 ₽',style:'success' as const,callback_data:'confirm:'+order.id}],[{text:'Отменить заказ',callback_data:'cancel:'+order.id}]]:[]),[{text:'📖 Инструкция',callback_data:'help:after'}],[{text:'Моя подписка',callback_data:'subscription'}],[{text:'История заказов',callback_data:'orders'}],[back]]);
    }
    else if (text.startsWith('confirm:') || text.startsWith('cancel:')) {
      immutable=true;
      const id = text.split(':')[1] ?? ''; if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) fail(400, 'INVALID_BUTTON');
      const order = await this.db.order.findFirst({ where: { id, userId: user.id } });
      if (!order) fail(404, 'ORDER_NOT_FOUND');
      if (order.status === 'AWAITING_PAYMENT' && Date.now() - order.createdAt.getTime() > 1800000) { await this.engine.payment(user.id, id, 'cancel'); content = 'Кнопка устарела. Откройте покупку заново.'; }
      else { const result = await this.engine.payment(user.id, id, text.startsWith('confirm:') ? 'confirm' : 'cancel'); const activated = result.status === 'COMPLETED' && Boolean(await this.db.subscription.count({where:{userId:user.id,status:'ACTIVE',expiresAt:{gt:new Date()},OR:[{orderId:result.id},...(order.renewalId?[{id:order.renewalId}]:[])]}})); content = `Тестовый заказ: ${botStatus(result.status)}\n${activated ? 'Подписка активирована. Откройте пошаговую инструкцию кнопкой ниже.' : 'Деньги не списывались.'}`; markup = inline([[{text:'Инструкция',callback_data:'help'},{ text: 'Моя подписка', callback_data: 'subscription' }], [{text:'Поддержка',callback_data:'support'}], [back]]); }
    } else if (text === buttons[1] || text === 'subscription') {
      content = last ? `${last.plan.name} · ${botStatus(last.status)}\nНачало: ${last.startedAt?.toISOString().slice(0, 10) ?? '—'}\nОкончание: ${last.expiresAt?.toISOString().slice(0, 10) ?? '—'}\nОсталось: ${Math.max(0, Math.ceil(((last.expiresAt?.getTime() ?? 0) - Date.now()) / 86400000))} дней\nФормат: общая демонстрационная инфраструктура, индивидуальный срок\nДемо-доступ: ${last.status === 'ACTIVE' && last.expiresAt && last.expiresAt > new Date() ? last.credentials.find(c => !c.revokedAt)?.demoIdentifier ?? '—' : 'неактивен'}\nЭто не VPN-ключ.` : 'У вас пока нет подписок.';
      markup = inline([[{ text: 'Продлить', callback_data: 'renew' }, { text: 'Подключиться', callback_data: 'connect' }], [{ text: 'История заказов', callback_data: 'orders' }], [{ text: 'Уведомления', callback_data: 'notifications' }], [{text:'◀️ Личный кабинет',callback_data:'account'}], [back]]);
    } else if (text === buttons[2] || text === 'connect') {
      content = 'Подключение в демо\n1. Проверьте активную подписку.\n2. Откройте её демонстрационный идентификатор.\n3. Настройка реального устройства не требуется: действующих VPN-ключей здесь нет.\nВыберите удобный способ:';
      markup = inline([[{ text: 'Инструкция в Telegram', callback_data: 'help' }], ...(miniAppButton(this.config.PUBLIC_ORIGIN, '/connect') ? [[miniAppButton(this.config.PUBLIC_ORIGIN, '/connect')!]] : []), [back]]);
    } else if (text === buttons[4] || text === 'help') {
      content='Инструкции AXON\n\nВыберите тему. Демонстрационный идентификатор — не VPN-ключ; настройка настоящего VPN не требуется.';
      markup=inline([[{text:'Как работает AXON',callback_data:'help:about'}],[{text:'После оформления подписки',callback_data:'help:after'}],[{text:'Где посмотреть мои данные',callback_data:'help:data'}],[{text:'Проблемы и решения',callback_data:'help:troubles'}],[{text:'Связаться с поддержкой',callback_data:'support'}],[back]]);
    } else if (text.startsWith('help:platform:') || text === 'help:after') {
      const selected=text.startsWith('help:platform:')?text.split(':')[2]:undefined;
      content=instructionText(selected && instructionPlatforms.includes(selected as typeof instructionPlatforms[number])?selected:undefined);
      markup=inline([instructionPlatforms.slice(0,2).map(p=>({text:p,callback_data:'help:platform:'+p})),instructionPlatforms.slice(2).map(p=>({text:p,callback_data:'help:platform:'+p})),[{text:'Моя подписка',callback_data:'subscription'}],[{text:'Поддержка',callback_data:'support'}],[{text:'◀️ Все инструкции',callback_data:'help'}]]);
    } else if (text.startsWith('help:')) {
      content=text==='help:about'?'Как работает AXON\n\nВыберите тариф, прочитайте условия и подтвердите демо-оформление. После активации подписка и инструкция доступны здесь и в Mini App. Списание 0 ₽, реального подключения нет.':
        text==='help:data'?'Ваши данные\n\nЛичный кабинет → Моя подписка: статус, срок и демонстрационный идентификатор. История заказов сохраняется. Те же данные видны в Mini App.':
        text==='help:troubles'?'Проблемы и решения\n\nЕсли заказ ещё обрабатывается, проверьте историю, не создавайте повторный. После простоя бесплатный сервер может запускаться около минуты. При ошибке откройте поддержку. Не сообщайте пароли, коды и токены.':
        /^help:[0-4]$/.test(text)?instructionText():'Выберите раздел справки.';
      markup=inline([[{text:'Все инструкции',callback_data:'help'}],[{text:'Поддержка',callback_data:'support'}],[back]]);
    } else if (text === buttons[5] || text === 'support' || text.startsWith('support:list:')) {
      const cursor=text.startsWith('support:list:')?text.slice(13):undefined;
      if(cursor&&(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor)||!await this.db.supportTicket.count({where:{id:cursor,userId:user.id}})))fail(404,'TICKET_NOT_FOUND');
      const tickets=await this.db.supportTicket.findMany({where:{userId:user.id},take:6,orderBy:[{createdAt:'desc'},{id:'desc'}],...(cursor?{cursor:{id:cursor},skip:1}:{})});
      content='Поддержка\n\n'+(tickets.length?'Выберите обращение: здесь можно прочитать ответ, продолжить переписку и закрыть решённый вопрос.':'Обращений пока нет. Выберите «Новое обращение», затем тему и опишите вопрос.')+'\n\nПароли и коды присылать не нужно.';
      markup=inline([...tickets.slice(0,5).map(t=>[{text:'№'+t.number+' · '+(supportStatuses[t.status as keyof typeof supportStatuses]??t.status),callback_data:'support:view:'+t.id}]),...(tickets.length>5?[[{text:'Ранее',callback_data:'support:list:'+tickets[4]!.id}]]:[]),[{text:'Новое обращение',callback_data:'support:new'}],[back]]);
    } else if (text.startsWith('support:view:') || text.startsWith('support:page:') || text.startsWith('support:part:')) {
      const value=text.split(':')[2]??''; if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))fail(400,'INVALID_BUTTON');
      const isPart=text.startsWith('support:part:');const part=isPart?Number(text.split(':')[3]):0;
      if(!Number.isInteger(part)||part<0||part>1)fail(400,'INVALID_BUTTON');
      const anchor=text.startsWith('support:page:')||isPart?await this.db.supportMessage.findFirst({where:{id:value,ticket:{userId:user.id}}}):null;
      if(text.startsWith('support:page:')&&!anchor)fail(404,'TICKET_NOT_FOUND');
      const thread=await this.support.thread(user.id,anchor?.ticketId??value,text.startsWith('support:page:')?anchor?.id:undefined,false,1);
      const message=isPart&&anchor?anchor:thread.messages[0];
      const chunk=message?supportChunks(message.text)[part]??'':'Переписка пока пуста.';
      if(part && !chunk)fail(400,'INVALID_BUTTON');
      let older=thread.nextCursor;
      if(isPart&&anchor)older=await this.db.supportMessage.count({where:{ticketId:anchor.ticketId,OR:[{createdAt:{lt:anchor.createdAt}},{createdAt:anchor.createdAt,id:{lt:anchor.id}}]}})?anchor.id:null;
      content='Обращение №'+thread.ticket.number+' · '+(supportStatuses[thread.ticket.status as keyof typeof supportStatuses]??thread.ticket.status)+'\n'+(supportCategories[thread.ticket.category as SupportCategory]??'Другой вопрос')+'\n\n'+(message?(message.authorRole==='ADMIN'?'Поддержка':'Вы')+' · '+message.createdAt.toISOString().slice(0,16)+' UTC\n':'')+chunk+(message&&message.text.length>3000?'\n\nЧасть '+(part+1)+' из 2.':'');
      markup=inline([...(message&&part===0&&message.text.length>3000?[[{text:'Читать продолжение',callback_data:'support:part:'+message.id+':1'}]]:[]),...(isPart&&part===1?[[{text:'Начало сообщения',callback_data:'support:part:'+value+':0'}]]:[]),...(older?[[{text:'Предыдущее сообщение',callback_data:'support:page:'+older}]]:[]),...(thread.ticket.status!=='CLOSED'?[[{text:'Ответить',callback_data:'support:reply:'+thread.ticket.id}],[{text:'Вопрос решён · закрыть',callback_data:'support:close:'+thread.ticket.id}]]:[]),[{text:'Все обращения',callback_data:'support'}],[back]]);
    } else if (text.startsWith('support:reply:') || text.startsWith('support:close:')) {
      const id=text.split(':')[2]??''; if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))fail(400,'INVALID_BUTTON');
      const thread=await this.support.thread(user.id,id);
      if(text.startsWith('support:close:')) {immutable=true;await this.support.status(user.id,id,'CLOSED',thread.ticket.status);content='Обращение закрыто. Переписка сохранена.';markup=inline([[{text:'Все обращения',callback_data:'support'}],[back]]);}
      else {if(thread.ticket.status==='CLOSED')fail(409,'TICKET_CLOSED');await this.db.botState.upsert({where:{userId:user.id},update:{awaitingSupport:true,activeTicketId:id},create:{userId:user.id,awaitingSupport:true,activeTicketId:id}});content='Напишите ответ (1–4000 символов). /start — отмена.';markup=inline([[{text:'Отмена',callback_data:'support:view:'+id}]]);}
    } else if (text === 'support:new' || text.startsWith('support:category:')) {
      const category=(text.split(':')[2]??'OTHER') as SupportCategory;if(!Object.hasOwn(supportCategories,category))fail(400,'INVALID_CATEGORY');
      if(text==='support:new'){content='Новое обращение\n\nВыберите тему. На следующем шаге бот попросит описание.';markup=inline([...Object.entries(supportCategories).map(([key,title])=>[{text:title,callback_data:'support:category:'+key}]),[{text:'◀️ Обращения',callback_data:'support'}]]);}
      else {await this.db.botState.upsert({where:{userId:user.id},update:{awaitingSupport:true,activeTicketId:null,supportCategory:category},create:{userId:user.id,awaitingSupport:true,supportCategory:category}});content='Тема: '+supportCategories[category]+'.\nОтправьте описание (5–4000 символов). Пароли и коды не нужны. /start — отмена.';markup=inline([[{text:'Выбрать другую тему',callback_data:'support:new'}],[{text:'Отмена',callback_data:'support'}]]);}
    } else {
      const state=await this.db.botState.findUnique({where:{userId:user.id}});
      if(!cb && !text.startsWith('/') && state?.awaitingSupport && text.length >= (state.activeTicketId?1:5) && text.length<=4000){
        let id=state.activeTicketId;let number:number;
        if(id){const thread=await this.support.thread(user.id,id);await this.support.reply(user.id,id,text,'telegram:'+update.update_id);number=thread.ticket.number;}
        else {const ticket=await this.support.create(user.id,text,state.supportCategory as SupportCategory,'telegram:'+update.update_id);id=ticket.id;number=ticket.number;}
        await this.db.botState.update({where:{userId:user.id},data:{awaitingSupport:false,activeTicketId:null}});
        immutable=true;
        content='Обращение №'+number+' сохранено. Ответ появится в переписке и Telegram, если бот доступен.';
        markup=inline([[{text:'Открыть обращение',callback_data:'support:view:'+id}],[back]]);
      } else content=(cb?'Кнопка устарела. Откройте актуальное меню. ':'')+'Выберите действие кнопкой меню. Для нового обращения введите от 5 до 4000 символов.';
    }
    if (text.startsWith('/start') || text === 'menu') await this.db.botState.upsert({ where: { userId: user.id }, update: { awaitingSupport: false, activeTicketId: null }, create: { userId: user.id } });
    const edit=Boolean(cb&&navigation&&!immutable);
    return { method:edit?'editMessageText':'sendMessage', ...(!cb && (text.startsWith('/start') || buttons.includes(text) || text===appLabel) ? {removeKeyboard:true}:{}), body:{chat_id:sender.id,...(edit?{message_id:msg.message_id}:{}),text:content,reply_markup:contextualKeyboard(markup,immutable),link_preview_options:{is_disabled:true}} };
  }
  async drain(signal?: AbortSignal) {
    if (!this.config.TELEGRAM_BOT_TOKEN && !this.transport) return;
    for (let index = 0; index < 10 && !signal?.aborted; index++) {
      const update = await this.db.$transaction(async tx => {
        const now = await databaseNow(tx);
        const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM telegram_updates
          WHERE (status IN ('PENDING','READY') AND next_attempt_at <= ${now})
          OR (status='PROCESSING' AND COALESCE(lease_until, updated_at + interval '2 minutes') <= ${now})
          ORDER BY next_attempt_at, id FOR UPDATE SKIP LOCKED LIMIT 1`;
        if (!rows[0]) return null;
        const prior = await tx.telegramUpdate.findUniqueOrThrow({ where: { id: rows[0].id } });
        if (prior.attempts >= 5 || prior.status === 'PROCESSING' && prior.sendStartedAt) {
          await tx.telegramUpdate.update({ where: { id: prior.id }, data: { status: 'DEAD', lastError: prior.sendStartedAt ? 'DELIVERY_UNKNOWN' : 'ATTEMPTS_EXHAUSTED', finishedAt: now, leaseToken: null, leaseUntil: null } }); return null;
        }
        return tx.telegramUpdate.update({ where: { id: prior.id }, data: { status: 'PROCESSING', attempts: { increment: 1 }, leaseToken: randomUUID(), leaseUntil: new Date(now.getTime() + 60000) } });
      });
      if (!update) break;
      const owner = { id: update.id, status: 'PROCESSING', leaseToken: update.leaseToken };
      let deliverySucceeded = false;
      try {
        const raw = update.payload as unknown as Update;
        if (raw.callback_query) { try { await this.call('answerCallbackQuery', { callback_query_id: raw.callback_query.id }); } catch { /* An expired acknowledgement does not block the durable action. */ } }
        let response = update.response as unknown as Reply | null;
        if (!response) {
          try { response = await this.render(raw); }
          catch (error) {
            if (!(error instanceof DomainError) || error.statusCode >= 500) throw error;
            const cb = raw.callback_query; const msg = cb?.message ?? raw.message;
            if (msg) response = { method: cb && raw.callback_query?.data?.startsWith('n:') ? 'editMessageText' : 'sendMessage', body: { chat_id: msg.chat.id, ...(cb && raw.callback_query?.data?.startsWith('n:') ? { message_id: msg.message_id, reply_markup: contextualKeyboard(inline([[back]])) } : { reply_markup: contextualKeyboard(inline([[back]]),true) }), text: botError(error.code) } };
          }
          if (response && !raw.loginAction && !loginAction(raw.callback_query?.data ?? raw.message?.text ?? '')) {
            const now = await databaseNow(this.db);
            const saved = await this.db.telegramUpdate.updateMany({ where: { ...owner, leaseUntil: { gt: now } }, data: { response: JSON.parse(JSON.stringify(response)) as Prisma.InputJsonObject } });
            if (!saved.count) continue;
          }
        }
        if (response && (response.body.reply_markup as {keyboard?:unknown}|undefined)?.keyboard) response={...response,removeKeyboard:true,body:{...response.body,reply_markup:contextualKeyboard(inlineMainMenu(this.config.PUBLIC_ORIGIN),true)}};
        if (response) {
          const now = await databaseNow(this.db);
          const prepared = await this.db.telegramUpdate.updateMany({ where: { ...owner, leaseUntil: { gt: now } }, data: { sendStartedAt: now, leaseUntil: new Date(now.getTime() + 30000) } });
          if (!prepared.count) continue;
          if(response.removeKeyboard){
            // Telegram cannot combine ReplyKeyboardRemove and InlineKeyboardMarkup.
            // Acknowledge the compatibility notice durably BEFORE delivering the inline menu.
            await this.call('sendMessage',{chat_id:response.body.chat_id,text:'Теперь все действия — в кнопках под сообщением. Старую клавиатуру скрыли.',reply_markup:mainKeyboard});
            deliverySucceeded=true;
            const continuation:Reply={method:response.method,body:response.body};
            const checkpoint=await this.db.telegramUpdate.updateMany({where:{...owner,leaseUntil:{gt:await databaseNow(this.db)}},data:{response:JSON.parse(JSON.stringify(continuation)) as Prisma.InputJsonObject,sendStartedAt:null}});
            if(!checkpoint.count)continue;
            response=continuation;deliverySucceeded=false;
            const claimed=await this.db.telegramUpdate.updateMany({where:{...owner,leaseUntil:{gt:await databaseNow(this.db)}},data:{sendStartedAt:await databaseNow(this.db)}});if(!claimed.count)continue;
          }
          try {await this.call(response.method,response.body);} catch(error){
            if(response.method!=='editMessageText'||!(error instanceof TelegramFailure)||error.code!=='TELEGRAM_EDIT_UNAVAILABLE')throw error;
            const {message_id:_missing,...fresh}=response.body;await this.call('sendMessage',fresh);
          }
          deliverySucceeded=true;
        }
        const now = await databaseNow(this.db);
        await this.db.telegramUpdate.updateMany({ where: { ...owner, leaseUntil: { gt: now } }, data: { status: 'DONE', finishedAt: now, leaseToken: null, leaseUntil: null, lastError: null } });
      } catch (error) {
        // Leave a successful send leased if its database acknowledgement fails. Recovery quarantines it.
        if (deliverySucceeded) throw error;
        const failure = error instanceof TelegramFailure ? error : new TelegramFailure('TELEGRAM_RETRY');
        const now = await databaseNow(this.db);
        const terminal = failure.permanent || failure.ambiguous || update.attempts >= 5;
        await this.db.telegramUpdate.updateMany({ where: { ...owner, leaseUntil: { gt: now } }, data: { status: terminal ? 'DEAD' : 'PENDING', lastError: failure.code, finishedAt: terminal ? now : null, nextAttemptAt: new Date(now.getTime() + backoff(update.attempts, failure.retryAfterMs)), leaseToken: null, leaseUntil: null, ...(!failure.ambiguous ? { sendStartedAt: null } : {}) } });
        if (failure.code === 'TELEGRAM_BLOCKED') {
          const raw = update.payload as unknown as Update;
          const sender = raw.callback_query?.from ?? raw.message?.from;
          if (sender) await this.db.notificationPreference.updateMany({ where: { user: { identities: { some: { provider: 'TELEGRAM', providerUserId: String(sender.id) } } } }, data: { telegramBlocked: true } });
        }
      }
    }
  }
}
