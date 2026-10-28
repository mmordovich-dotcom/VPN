import { randomUUID } from 'node:crypto';
import { databaseNow, enqueue, JobQueue, JobFailure } from './job-queue.js';
import { scheduleReminders, notifyOrder, notifySubscription } from './notification-events.js';
import { Prisma, type PrismaClient } from '@shared-vps/database';

type Tx = Prisma.TransactionClient;
export class DomainError extends Error {
  constructor(public statusCode: number, public code: string) { super(code); }
}
export function fail(status: number, code: string): never { throw new DomainError(status, code); }
// A transaction-scoped database lock serializes all allocation and lifecycle changes,
// including requests handled by another process. SQL constraints remain the final guard.
export async function locked<T>(db: PrismaClient, fn: (tx: Tx) => Promise<T>) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(12002026)::text`;
    return fn(tx);
  }, { maxWait: 15000, timeout: 20000 });
}
const days = (n: number) => n * 86400000;
async function audit(tx: Tx, actorUserId: string | null, action: string, entityId: string, metadata: Prisma.InputJsonObject = {}) {
  await tx.auditLog.create({ data: { actorUserId, action, entityType: 'subscription-engine', entityId, metadata } });
}
export class MockPaymentProvider {
  create(orderId: string) { return `demo:payment:${orderId}`; }
  transition(current: string, event: 'confirm' | 'fail' | 'cancel' | 'refund') {
    if (event === 'refund') { if (!['SUCCEEDED', 'REFUNDED'].includes(current)) fail(409, 'PAYMENT_NOT_PAID'); return 'REFUNDED' as const; }
    const next = event === 'confirm' ? 'SUCCEEDED' : 'FAILED';
    if (current !== 'PENDING' && current !== next) fail(409, 'PAYMENT_FINAL');
    return next;
  }
}
export interface VirtualProvider { prepare(id: string): Promise<string> }
// Idempotent, deterministic adapter. PostgreSQL owns the server's durable state.
export const virtualProvider: VirtualProvider = { async prepare(id) { return `demo:vps:${id}`; } };
export const subscriptionInclude = { plan: true, credentials: true, serverSlot: { include: { server: true } } } as const;

export class SubscriptionEngine {
  constructor(public db: PrismaClient, private provider: VirtualProvider = virtualProvider) {}
  async identity(telegramId: string, admins: string[] = []) {
    if (!/^\d{1,16}$/.test(telegramId)) fail(401, 'INVALID_IDENTITY');
    return locked(this.db, async tx => {
      let identity = await tx.userIdentity.findUnique({ where: { provider_providerUserId: { provider: 'TELEGRAM', providerUserId: telegramId } }, include: { user: true } });
      if (!identity) identity = await tx.userIdentity.create({ data: { provider: 'TELEGRAM', providerUserId: telegramId, user: { create: { role: admins.includes(telegramId) ? 'ADMIN' : 'USER' } } }, include: { user: true } });
      if (identity.user.status !== 'ACTIVE') fail(403, 'ACCOUNT_BLOCKED');
      // Explicit server configuration may promote an existing identity, never client input.
      if (admins.includes(telegramId) && identity.user.role !== 'ADMIN') return tx.user.update({ where: { id: identity.userId }, data: { role: 'ADMIN' } });
      return identity.user;
    });
  }
  async expire(tx: Tx, now = new Date()) {
    const expired = await tx.subscription.findMany({ where: { status: { in: ['ACTIVE', 'SUSPENDED'] }, expiresAt: { lte: now } }, take: 100, orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }] });
    for (const sub of expired) {
      await tx.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } });
      await tx.accessCredential.updateMany({ where: { subscriptionId: sub.id, revokedAt: null }, data: { revokedAt: now } });
      if (sub.serverSlotId) await tx.serverSlot.update({ where: { id: sub.serverSlotId }, data: { status: 'AVAILABLE' } });
      await audit(tx, null, 'subscription.expired', sub.id);
      await notifySubscription(tx, 'EXPIRED', { ...sub, status: 'EXPIRED' }, `${sub.id}:${sub.expiresAt!.getTime()}`);
    }
    return expired.at(-1)?.id ?? null;
  }
  async order(userId: string, planId: string, operationKey: string, renewalId?: string) {
    if (!/^[A-Za-z0-9:_-]{8,120}$/.test(operationKey)) fail(400, 'INVALID_OPERATION_KEY');
    return locked(this.db, async tx => {
      await this.expire(tx);
      const key = `${userId}:${operationKey}`;
      const prior = await tx.order.findUnique({ where: { operationKey: key } });
      if (prior) { if (prior.planId !== planId || prior.renewalId !== (renewalId ?? null)) fail(409, 'KEY_REUSED'); return prior; }
      const plan = await tx.plan.findFirst({ where: { id: planId, isActive: true } });
      if (!plan) fail(404, 'PLAN_NOT_FOUND');
      if (renewalId) {
        const sub = await tx.subscription.findFirst({ where: { id: renewalId, userId, planId, status: { in: ['ACTIVE', 'EXPIRED'] } } });
        if (!sub) fail(404, 'SUBSCRIPTION_NOT_FOUND');
      } else if (await tx.subscription.count({ where: { userId, status: { in: ['PENDING', 'ACTIVE', 'SUSPENDED'] } } })) fail(409, 'USE_RENEWAL');
      const pending = await tx.order.findFirst({ where: { userId, status: { in: ['AWAITING_PAYMENT', 'PAID', 'PROCESSING'] } } });
      if (pending) { if (pending.planId !== planId || pending.renewalId !== (renewalId ?? null)) fail(409, 'ORDER_IN_PROGRESS'); return pending; }
      const order = await tx.order.create({ data: { userId, planId, operationKey: key, renewalId: renewalId ?? null, amount: plan.price, currency: plan.currency, periodDays: plan.durationDays } });
      await tx.payment.create({ data: { orderId: order.id, amount: order.amount, currency: order.currency, externalPaymentId: new MockPaymentProvider().create(order.id) } });
      await audit(tx, userId, 'demo.order.created', order.id);
      return order;
    });
  }
  async payment(userId: string, orderId: string, event: 'confirm' | 'fail' | 'cancel' | 'refund', admin = false) {
    await locked(this.db, async tx => {
      const order = await tx.order.findFirst({ where: { id: orderId, ...(admin ? {} : { userId }) }, include: { payments: true } });
      if (!order) fail(404, 'ORDER_NOT_FOUND');
      if (event === 'refund' && !admin) fail(403, 'ADMIN_REQUIRED');
      const payment = order.payments[0]; if (!payment) fail(409, 'PAYMENT_MISSING');
      const status = new MockPaymentProvider().transition(payment.status, event);
      if (payment.status === status && !(event === 'cancel' && order.status !== 'CANCELLED')) return;
      await tx.payment.update({ where: { id: payment.id }, data: { status } });
      const changed = await tx.order.update({ where: { id: order.id }, data: { status: status === 'SUCCEEDED' ? 'PAID' : event === 'fail' ? 'FAILED' : 'CANCELLED' } });
      await notifyOrder(tx, changed);
      if (status === 'SUCCEEDED') await enqueue(tx, 'FULFILL_ORDER', `fulfill:${order.id}`, { orderId: order.id });
      if (event === 'refund') {
        const sub = await tx.subscription.findUnique({ where: { orderId } });
        if (sub) await this.cancelIn(tx, sub.userId, sub.id);
        else if (order.renewalId) {
          const renewed = await tx.subscription.findUniqueOrThrow({ where: { id: order.renewalId } });
          if (renewed.status === 'ACTIVE' && renewed.expiresAt) {
            const expiry = new Date(renewed.expiresAt.getTime() - days(order.periodDays));
            if (expiry <= new Date()) await this.cancelIn(tx, renewed.userId, renewed.id);
            else { const changed = await tx.subscription.update({ where: { id: renewed.id }, data: { expiresAt: expiry } }); await scheduleReminders(tx, changed); }
          }
        }
      }
      await audit(tx, userId, `demo.payment.${event}`, order.id);
    });
    if (event === 'confirm') await this.fulfill(orderId);
    return this.db.order.findUniqueOrThrow({ where: { id: orderId }, include: { subscription: { include: subscriptionInclude } } });
  }
  async fulfill(orderId: string) {
    try {
      return await locked(this.db, async tx => {
        await this.expire(tx);
        const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { plan: true } });
        if (order.status !== 'PAID') return order;
        let sub = order.renewalId ? await tx.subscription.findUnique({ where: { id: order.renewalId } }) : null;
        if (sub && !['ACTIVE', 'EXPIRED'].includes(sub.status)) fail(409, 'RENEWAL_NOT_AVAILABLE');
        if (sub && sub.status === 'EXPIRED' && await tx.subscription.count({ where: { userId: sub.userId, status: { in: ['ACTIVE', 'PENDING', 'SUSPENDED'] } } })) fail(409, 'USE_CURRENT_SUBSCRIPTION');
        // Keep the expired subscription and its original slot in history.
        if (sub?.status === 'EXPIRED') sub = null;
        if (!sub && await tx.subscription.count({ where: { userId: order.userId, status: { in: ['ACTIVE', 'PENDING', 'SUSPENDED'] } } })) fail(409, 'USE_RENEWAL');
        const now = new Date();
        const expiry = new Date(Math.max(now.getTime(), sub?.status === 'ACTIVE' ? sub.expiresAt!.getTime() : 0) + days(order.periodDays));
        let slotId = sub?.status === 'ACTIVE' ? sub.serverSlotId : null;
        if (!slotId) {
          const settings = await tx.setting.findMany();
          const approved = settings.find(x => x.key === 'server.capacity4_approved')?.value === true;
          const setting = (key: string, fallback: number) => Number(settings.find(x => x.key === key)?.value ?? fallback);
          if (!Number.isInteger(order.plan.maxUsersPerServer) || order.plan.maxUsersPerServer < 1 || order.plan.maxUsersPerServer > 4) fail(409, 'INVALID_CAPACITY');
          const allocationLimit = Math.min(order.plan.maxUsersPerServer, approved ? 4 : 3);
          let slot = await tx.serverSlot.findFirst({ where: { status: 'AVAILABLE', server: { status: 'ACTIVE', capacity: { lte: allocationLimit } }, subscriptions: { none: { status: { in: ['PENDING', 'ACTIVE', 'SUSPENDED'] } } } }, orderBy: [{ serverId: 'asc' }, { slotNumber: 'asc' }] });
          if (!slot) {
            const requestedCapacity = setting('server.default_capacity', 3);
            if (!Number.isInteger(requestedCapacity) || requestedCapacity < 1 || requestedCapacity > 4) fail(409, 'INVALID_CAPACITY');
            const capacity = Math.min(allocationLimit, requestedCapacity);
            if (!Number.isInteger(capacity) || capacity < 1 || capacity > 4) fail(409, 'INVALID_CAPACITY');
            const id = randomUUID();
            const externalServerId = await this.provider.prepare(id);
            const server = await tx.server.create({ data: { id, externalServerId, status: 'ACTIVE', capacity, monthlyCost: setting('server.monthly_cost_minor', 20000), rentedAt: now, expiresAt: new Date(now.getTime() + days(setting('server.rental_days', 30))) } });
            await tx.serverSlot.createMany({ data: Array.from({ length: capacity }, (_, i) => ({ serverId: server.id, slotNumber: i + 1 })) });
            slot = await tx.serverSlot.findFirstOrThrow({ where: { serverId: server.id }, orderBy: { slotNumber: 'asc' } });
            await audit(tx, order.userId, 'demo.server.created', server.id);
          }
          slotId = slot.id;
          await tx.serverSlot.update({ where: { id: slotId }, data: { status: 'OCCUPIED' } });
        }
        if (sub) sub = await tx.subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE', serverSlotId: slotId, expiresAt: expiry, ...(sub.status === 'EXPIRED' ? { startedAt: now } : {}) } });
        else sub = await tx.subscription.create({ data: { userId: order.userId, planId: order.planId, orderId, serverSlotId: slotId, status: 'ACTIVE', startedAt: now, expiresAt: expiry } });
        const credential = await tx.accessCredential.findFirst({ where: { subscriptionId: sub.id, revokedAt: null } });
        if (!credential) await tx.accessCredential.create({ data: { subscriptionId: sub.id, demoIdentifier: `demo:access:${randomUUID()}`, metadata: { demonstration: true, functionalKey: false } } });
        await this.extendServer(tx, slotId, expiry);
        await audit(tx, order.userId, order.renewalId ? 'subscription.renewed' : 'subscription.activated', sub.id, { orderId, expiresAt: expiry.toISOString() });
        await scheduleReminders(tx, sub);
        if (order.renewalId) await notifySubscription(tx, 'RENEWED', sub, orderId);
        const completed = await tx.order.update({ where: { id: orderId }, data: { status: 'COMPLETED', lastError: null } });
        await notifyOrder(tx, completed);
        return completed;
      });
    } catch (error) {
      // Persist a safe failure marker, not provider exceptions or secrets. PAID is a durable retry queue.
      await this.db.order.updateMany({ where: { id: orderId, status: 'PAID' }, data: { attempts: { increment: 1 }, lastError: error instanceof DomainError ? error.code : 'PROVIDER_RETRY' } });
      throw error;
    }
  }
  async extendServer(tx: Tx, slotId: string, expiry: Date) {
    const slot = await tx.serverSlot.findUniqueOrThrow({ where: { id: slotId }, include: { server: true } });
    const setting = await tx.setting.findUnique({ where: { key: 'server.rental_days' } });
    const period = Number(setting?.value ?? 30);
    if (!Number.isInteger(period) || period < 1 || period > 365) fail(409, 'INVALID_RENTAL_PERIOD');
    let until = slot.server.expiresAt ?? new Date();
    let periods = 0;
    while (until < expiry) { until = new Date(until.getTime() + days(period)); periods++; }
    if (periods) {
      await tx.server.update({ where: { id: slot.serverId }, data: { expiresAt: until } });
      await audit(tx, null, 'demo.server.renewed', slot.serverId, { periods, expenseMinor: periods * slot.server.monthlyCost });
    }
  }
  async cancelIn(tx: Tx, userId: string, id: string) {
    const sub = await tx.subscription.findFirst({ where: { id, userId } }); if (!sub) fail(404, 'SUBSCRIPTION_NOT_FOUND');
    if (['CANCELLED', 'EXPIRED'].includes(sub.status)) return sub;
    await tx.accessCredential.updateMany({ where: { subscriptionId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    const cancelled = await tx.subscription.update({ where: { id }, data: { status: 'CANCELLED' } });
    if (sub.serverSlotId) await tx.serverSlot.update({ where: { id: sub.serverSlotId }, data: { status: 'AVAILABLE' } });
    await audit(tx, userId, 'subscription.cancelled', id);
    return cancelled;
  }
  cancel(userId: string, id: string) { return locked(this.db, tx => this.cancelIn(tx, userId, id)); }
  async subscriptions(userId: string) {
    await locked(this.db, tx => this.expire(tx));
    return this.db.subscription.findMany({ where: { userId }, include: subscriptionInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 });
  }
  async maintain(cursor?: string, root?: string) {
    return locked(this.db, async tx => {
      const now = await databaseNow(tx);
      const expired = await this.expire(tx, now);
      const active = await tx.subscription.findMany({ where: { status: 'ACTIVE', ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy:{id:'asc'}, take:100 });
      for (const sub of active) { if (sub.serverSlotId && sub.expiresAt) await this.extendServer(tx, sub.serverSlotId, sub.expiresAt); await scheduleReminders(tx, sub); }
      if (root && (active.length === 100 || expired)) {
        const next = active.length === 100 ? active.at(-1)!.id : cursor;
        await enqueue(tx,'LIFECYCLE',root+':'+(next??'end')+':'+(expired??'none'),{root,...(next?{cursor:next}:{})});
      }
    });
  }
  async recover(cursor?: string, root?: string) {
    await this.db.$transaction(async tx => {
      const orders = await tx.order.findMany({where:{status:'PAID',...(cursor?{id:{gt:cursor}}:{})},take:100,orderBy:{id:'asc'}});
      for (const order of orders) await enqueue(tx,'FULFILL_ORDER', 'fulfill:'+order.id,{orderId:order.id});
      if(root && orders.length===100) await enqueue(tx,'RECOVER',root+':'+orders.at(-1)!.id,{root,cursor:orders.at(-1)!.id});
    });
  }
  async tick() {
    // Compatibility entry point: same persisted queue as both production worker modes.
    await this.maintain(); await this.recover();
    await new JobQueue(this.db).drain(async job => { const body=job.payload as Record<string,unknown>; if(typeof body.orderId!=='string')throw new JobFailure('INVALID_ORDER_JOB',true); await this.fulfill(body.orderId); },undefined,20,['FULFILL_ORDER']);
  }
}
