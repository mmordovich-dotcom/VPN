import type { FastifyInstance } from 'fastify';
import type { ApiConfig } from '@shared-vps/runtime';
import type { PrismaClient } from '@shared-vps/database';
import { Auth, digest } from './auth.js';
import { DomainError, fail, locked, SubscriptionEngine, subscriptionInclude } from './engine.js';
import { TelegramGateway } from './telegram.js';
import { BotLogin } from './bot-login.js';
import { botLoginRoutes } from './bot-login-routes.js';
const uuid = { type: 'string', format: 'uuid' } as const;
const orderBody = { type: 'object', additionalProperties: false, required: ['planId', 'operationKey'], properties: { planId: uuid, operationKey: { type: 'string', minLength: 8, maxLength: 120, pattern: '^[A-Za-z0-9:_-]+$' }, renewalId: uuid } } as const;
export async function platformRoutes(app: FastifyInstance, db: PrismaClient, config: ApiConfig) {
  const engine = new SubscriptionEngine(db); const auth = new Auth(db, config, engine);
  const telegram = new TelegramGateway(db, config, engine);
  const botLogin = new BotLogin(db, config, engine);
  // Mutation requests from browsers must prove an exact allowed origin and custom header.
  app.addHook('preHandler', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    if (req.method !== 'GET' && req.url !== '/api/v1/telegram/webhook') {
      if (!config.CORS_ORIGINS.includes(String(req.headers.origin)) || req.headers['x-shared-vps'] !== '1') fail(403, 'ORIGIN_REQUIRED');
    }
  });
  app.get('/api/v1/auth/config', async () => ({ botUsername: config.TELEGRAM_BOT_USERNAME ?? null, loginEnabled: botLogin.available(), loginMode: 'bot', stage: '1.2.5', demo: true }));
  botLoginRoutes(app, botLogin);
  app.post<{ Body: { initData: string } }>('/api/v1/auth/telegram', { schema: { body: { type: 'object', additionalProperties: false, required: ['initData'], properties: { initData: { type: 'string', maxLength: 12000 } } } } }, async (req, reply) => auth.login(req, reply, req.body));
  app.get('/api/v1/me', async req => { const u = await auth.user(req); return { id: u.id, role: u.role }; });
  app.post('/api/v1/auth/logout', async (req, reply) => { await db.session.deleteMany({ where: { tokenHash: digest(auth.token(req)) } }); await botLogin.cancelBrowser(req, reply); auth.cookie(reply, '', 0); return { ok: true }; });
  app.get('/api/v1/subscriptions', async req => engine.subscriptions((await auth.user(req)).id));
  app.get('/api/v1/orders', async req => db.order.findMany({ where: { userId: (await auth.user(req)).id }, include: { plan: true, payments: true }, orderBy: { createdAt: 'desc' }, take: 200 }));
  app.post<{ Body: { planId: string; operationKey: string; renewalId?: string } }>('/api/v1/orders', { schema: { body: orderBody } }, async req => engine.order((await auth.user(req)).id, req.body.planId, req.body.operationKey, req.body.renewalId));
  app.post<{ Params: { id: string }; Body: { event: 'confirm' | 'fail' | 'cancel' } }>('/api/v1/orders/:id/payment', { schema: { params: { type: 'object', required: ['id'], properties: { id: uuid } }, body: { type: 'object', additionalProperties: false, required: ['event'], properties: { event: { enum: ['confirm', 'fail', 'cancel'] } } } } }, async req => engine.payment((await auth.user(req)).id, req.params.id, req.body.event));
  app.post<{ Params: { id: string } }>('/api/v1/subscriptions/:id/cancel', { schema: { params: { type: 'object', required: ['id'], properties: { id: uuid } } } }, async req => engine.cancel((await auth.user(req)).id, req.params.id));
  app.get('/api/v1/support', async req => db.supportTicket.findMany({ where: { userId: (await auth.user(req)).id }, orderBy: { createdAt: 'desc' }, take: 100 }));
  app.post<{ Body: { text: string } }>('/api/v1/support', { schema: { body: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string', minLength: 5, maxLength: 4000 } } } } }, async req => db.supportTicket.create({ data: { userId: (await auth.user(req)).id, text: req.body.text } }));
  app.get('/api/v1/admin', async req => {
    await auth.user(req, true); await locked(db, tx => engine.expire(tx));
    const [users, servers, orders, subscriptions, tickets, plans, settings, rentals] = await Promise.all([
      db.user.findMany({ include: { identities: { select: { provider: true, providerUserId: true } }, subscriptions: { select: { id: true, status: true } } }, take: 500 }),
      db.server.findMany({ include: { slots: { include: { subscriptions: { where: { status: { in: ['ACTIVE', 'PENDING', 'SUSPENDED'] } }, select: { id: true, userId: true } } }, orderBy: { slotNumber: 'asc' } } }, take: 500 }),
      db.order.findMany({ include: { payments: true }, orderBy: { createdAt: 'desc' }, take: 500 }),
      db.subscription.findMany({ include: subscriptionInclude, orderBy: { createdAt: 'desc' }, take: 500 }),
      db.supportTicket.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }), db.plan.findMany(), db.setting.findMany(),
      db.auditLog.findMany({ where: { action: 'demo.server.renewed' }, select: { metadata: true } }),
    ]);
    const [userCount, activeCount, orderCount, serverCount, occupied, available, errors, revenue, initialExpense, telegramErrors] = await Promise.all([
      db.user.count(), db.subscription.count({ where: { status: 'ACTIVE' } }), db.order.count(), db.server.count(), db.serverSlot.count({ where: { status: 'OCCUPIED' } }), db.serverSlot.count({ where: { status: 'AVAILABLE' } }), db.order.count({ where: { lastError: { not: null } } }), db.payment.aggregate({ where: { status: 'SUCCEEDED' }, _sum: { amount: true } }), db.server.aggregate({ _sum: { monthlyCost: true } }), db.telegramUpdate.count({ where: { status: { not: 'DONE' }, attempts: { gte: 5 } } }),
    ]);
    return { demo: true, stats: { users: userCount, active: activeCount, orders: orderCount, servers: serverCount, occupied, available, errors: errors + telegramErrors, revenueMinor: revenue._sum.amount ?? 0, expenseMinor: (initialExpense._sum.monthlyCost ?? 0) + rentals.reduce((sum, r) => sum + Number((r.metadata as Record<string, unknown>).expenseMinor ?? 0), 0) }, users, servers, orders, subscriptions, tickets, plans, settings, listLimit: 500 };
  });
  app.post<{ Params: { id: string } }>('/api/v1/admin/orders/:id/retry', async req => { await auth.user(req, true); if (!await db.order.count({ where: { id: req.params.id, status: 'PAID' } })) fail(409, 'ORDER_NOT_RETRYABLE'); return engine.fulfill(req.params.id); });
  app.post<{ Params: { id: string } }>('/api/v1/admin/orders/:id/refund', async req => engine.payment((await auth.user(req, true)).id, req.params.id, 'refund', true));
  app.post<{ Params: { id: string }; Body: { status: string } }>('/api/v1/admin/support/:id', { schema: { body: { type: 'object', additionalProperties: false, required: ['status'], properties: { status: { enum: ['OPEN', 'IN_PROGRESS', 'CLOSED'] } } } } }, async req => { await auth.user(req, true); return db.supportTicket.update({ where: { id: req.params.id }, data: { status: req.body.status } }); });
  app.post<{ Params: { id: string }; Body: { price: number; durationDays: number; maxUsersPerServer: number; isActive: boolean } }>('/api/v1/admin/plans/:id', { schema: { body: { type: 'object', additionalProperties: false, required: ['price', 'durationDays', 'maxUsersPerServer', 'isActive'], properties: { price: { type: 'integer', minimum: 0, maximum: 10000000 }, durationDays: { type: 'integer', minimum: 1, maximum: 365 }, maxUsersPerServer: { type: 'integer', minimum: 1, maximum: 3 }, isActive: { type: 'boolean' } } } } }, async req => {
    const actor = await auth.user(req, true);
    return locked(db, async tx => { const plan = await tx.plan.update({ where: { id: req.params.id }, data: req.body }); await tx.auditLog.create({ data: { actorUserId: actor.id, action: 'admin.plan.updated', entityType: 'plan', entityId: plan.id } }); return plan; });
  });
  app.post<{ Body: { key: string; value: number } }>('/api/v1/admin/settings', { schema: { body: { type: 'object', additionalProperties: false, required: ['key', 'value'], properties: { key: { enum: ['server.monthly_cost_minor', 'server.rental_days', 'server.default_capacity'] }, value: { type: 'integer', minimum: 1, maximum: 10000000 } } } } }, async req => {
    const actor = await auth.user(req, true);
    if (req.body.key === 'server.default_capacity' && req.body.value > 3 || req.body.key === 'server.rental_days' && req.body.value > 365) fail(400, 'SETTING_OUT_OF_RANGE');
    return locked(db, async tx => { const result = await tx.setting.update({ where: { key: req.body.key }, data: { value: req.body.value } }); await tx.auditLog.create({ data: { actorUserId: actor.id, action: 'admin.setting.updated', entityType: 'setting', entityId: result.id } }); return result; });
  });
  app.post('/api/v1/telegram/webhook', async (req, reply) => {
    if (!telegram.authentic(String(req.headers['x-telegram-bot-api-secret-token'] ?? ''))) fail(401, 'INVALID_WEBHOOK');
    await telegram.accept(req.body); void run(); reply.code(200); return { ok: true };
  });
  app.post('/api/v1/admin/telegram/register', async req => { await auth.user(req, true); return telegram.register(); });
  app.get('/api/v1/admin/telegram/status', async req => { await auth.user(req, true); return telegram.status(); });
  let running: Promise<void> | undefined;
  let cleanedAt = 0;
  const run = () => { if (!running) running = (async () => { try { await engine.tick(); await telegram.drain(); if (Date.now() - cleanedAt > 3600000) { await botLogin.cleanup(); cleanedAt = Date.now(); } } catch { app.log.warn('Automation temporarily unavailable; persisted work will retry'); } })().finally(() => { running = undefined; }); return running; };
  const timer = setInterval(() => { void run(); }, 15000).unref();
  app.addHook('onClose', async () => { clearInterval(timer); if (running) await running; });
  // Tests may inject a deliberately limited DB; background work is started by the real entry point.
  return { engine, telegram, run };
}

