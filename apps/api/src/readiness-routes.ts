import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@shared-vps/database';
import { demoInstructions, instructionPlatforms, purchaseGuidance, purchaseSteps, supportCategories, supportStatuses, financialDefaults, financialScenario, type SupportCategory, type SupportStatus, type FinancialInput } from '@shared-vps/shared';
import type { Auth } from './auth.js';
import { fail, locked, subscriptionInclude, SubscriptionEngine } from './engine.js';
import { publicOrder, publicSubscription } from './presenters.js';
import { SupportService, actor, recordAudit, draftHash } from './support.js';
import { IncidentService } from './incidents.js';
const uuid = { type: 'string', format: 'uuid' } as const;
const params = { type: 'object', required: ['id'], additionalProperties: false, properties: { id: uuid } } as const;
const key = { type: 'string', minLength: 8, maxLength: 120, pattern: '^[A-Za-z0-9:_-]+$' } as const;
const text = { type: 'string', minLength: 1, maxLength: 4000 } as const;
export function readinessRoutes(app: FastifyInstance, db: PrismaClient, auth: Auth, engine: SubscriptionEngine) {
  const support = new SupportService(db); const incidents = new IncidentService(db, engine);
  app.get('/api/v1/instructions', async () => ({ platforms: instructionPlatforms, steps: demoInstructions, purchaseGuidance, purchaseSteps, demo: true }));
  app.get<{ Params: { id: string } }>('/api/v1/orders/:id', { schema: { params } }, async req => {
    const user = await auth.user(req); const order = await db.order.findFirst({ where: { id: req.params.id, userId: user.id }, include: { plan: true, payments: true, subscription: { include: subscriptionInclude }, renewal: { include: subscriptionInclude } } }); if (!order) fail(404, 'ORDER_NOT_FOUND');
    const candidate = order.subscription ?? order.renewal; const sub = candidate?.userId === user.id ? candidate : null; const activated = order.status === 'COMPLETED' && sub?.status === 'ACTIVE' && Boolean(sub.expiresAt && sub.expiresAt > new Date());
    return { order: publicOrder(order), activated, subscription: sub ? publicSubscription(sub) : null };
  });
  app.get('/api/v1/account/compensations', async req => db.subscriptionCompensation.findMany({ where: { subscription: { userId: (await auth.user(req)).id } }, select: { id: true, hours: true, reason: true, previousExpiry: true, newExpiry: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 50 }));
  app.get('/api/v1/account/service-status', async req => {
    const user = await auth.user(req); const affected = await db.serviceIncident.count({ where: { status: 'CONFIRMED', OR: [{ serverId: null }, { server: { slots: { some: { subscriptions: { some: { userId: user.id, status: 'ACTIVE' } } } } } }] } });
    return { status: affected ? 'CHECKING' : 'NO_CONFIRMED_INCIDENT', demo: true, message: affected ? 'Проверяем доступность части сервиса. Если нужна помощь, напишите в поддержку.' : 'Для вашего аккаунта нет подтверждённого инцидента. Это не гарантия доступности: при проблеме обратитесь в поддержку.' };
  });
  app.post<{ Body: { text: string; category?: SupportCategory; operationKey?: string } }>('/api/v1/support', { schema: { body: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { ...text, minLength: 5 }, category: { enum: Object.keys(supportCategories) }, operationKey: key } } } }, async req => support.create((await auth.user(req)).id, req.body.text, req.body.category ?? 'OTHER', req.body.operationKey ?? randomUUID()));
  for (const admin of [false, true]) {
    const root = admin ? '/api/v1/admin/support/:id' : '/api/v1/support/:id';
    app.get<{ Params: { id: string }; Querystring: { cursor?: string } }>(root, { schema: { params, querystring: { type: 'object', additionalProperties: false, properties: { cursor: uuid } } } }, async req => support.thread((await auth.user(req, admin)).id, req.params.id, req.query.cursor, admin));
    app.post<{ Params: { id: string }; Body: { text: string; operationKey: string } }>(root + '/messages', { schema: { params, body: { type: 'object', additionalProperties: false, required: ['text', 'operationKey'], properties: { text, operationKey: key } } } }, async req => support.reply((await auth.user(req, admin)).id, req.params.id, req.body.text, req.body.operationKey, admin));
    app.post<{ Params: { id: string }; Body: { status: SupportStatus; expectedStatus?: string } }>(root, { schema: { params, body: { type: 'object', additionalProperties: false, required: ['status'], properties: { status: { enum: admin ? Object.keys(supportStatuses) : ['CLOSED'] }, expectedStatus: { enum: Object.keys(supportStatuses) } } } } }, async req => support.status((await auth.user(req, admin)).id, req.params.id, req.body.status, req.body.expectedStatus, admin));
  }
  app.get('/api/v1/admin/readiness', async req => {
    await auth.user(req, true); const [capacity, incidentsList, compensations, defaultCapacity] = await Promise.all([
      db.setting.findUnique({ where: { key: 'server.capacity4_approved' } }),
      db.serviceIncident.findMany({ orderBy: { createdAt: 'desc' }, take: 20, include: { observations: { orderBy: { checkedAt: 'desc' }, take: 10 }, escalations: true } }),
      db.subscriptionCompensation.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }),
      db.setting.findUnique({where:{key:'server.default_capacity'}}),
    ]); return { demo: true, capacity4Approved: capacity?.value === true, defaultCapacity: Number(defaultCapacity?.value ?? 3), financialDefaults, incidents: incidentsList.map(i => ({ ...i, durationSeconds: Math.max(0, Math.floor(((i.resolvedAt ?? new Date()).getTime() - i.startedAt.getTime()) / 1000)), escalations: i.escalations.map(e => ({ ...e, hash: draftHash(e.draft) })) })), compensations };
  });
  app.post<{ Body: FinancialInput }>('/api/v1/admin/finance/scenario', { schema: { body: { type: 'object', additionalProperties: false, required: Object.keys(financialDefaults), properties: Object.fromEntries(Object.keys(financialDefaults).map(k => [k, { type: 'integer', minimum: 0, maximum: 100000000 }])) } } }, async req => { await auth.user(req, true); try { return financialScenario(req.body); } catch { fail(400, 'INVALID_SCENARIO'); } });
  app.post<{ Body: { approved: boolean; evidence: string } }>('/api/v1/admin/capacity', { schema: { body: { type: 'object', additionalProperties: false, required: ['approved', 'evidence'], properties: { approved: { type: 'boolean' }, evidence: { type: 'string', minLength: 20, maxLength: 500 } } } } }, async req => {
    const user = await auth.user(req, true); return locked(db, async tx => {
      await actor(tx, user.id, true); const setting = await tx.setting.upsert({ where: { key: 'server.capacity4_approved' }, create: { key: 'server.capacity4_approved', valueType: 'BOOLEAN', value: req.body.approved }, update: { value: req.body.approved } });
      await recordAudit(tx, user.id, 'capacity.approval_changed', 'setting', setting.id, { approved: req.body.approved, evidence: req.body.evidence }); return { approved: req.body.approved, futureOnly: true };
    });
  });
  app.post<{ Body: { component: string; operationKey: string; serverId?: string } }>('/api/v1/admin/incidents', { schema: { body: { type: 'object', additionalProperties: false, required: ['component', 'operationKey'], properties: { component: { enum: ['WEB','API','POSTGRES','TELEGRAM','PROVIDER','UNKNOWN'] }, operationKey: key, serverId: uuid } } } }, async req => incidents.create((await auth.user(req, true)).id, req.body.component, req.body.operationKey, req.body.serverId));
  app.post<{ Params: { id: string }; Body: { result: string; operationKey: string } }>('/api/v1/admin/incidents/:id/observations', { schema: { params, body: { type: 'object', additionalProperties: false, required: ['result','operationKey'], properties: { result: { enum: ['SUCCESS','FAILURE','UNKNOWN'] }, operationKey: key } } } }, async req => incidents.observe((await auth.user(req, true)).id, req.params.id, req.body.result, req.body.operationKey));
  app.post<{ Params: { id: string }; Body: { status: 'CONFIRMED' | 'RESOLVED' } }>('/api/v1/admin/incidents/:id/status', { schema: { params, body: { type: 'object', additionalProperties: false, required: ['status'], properties: { status: { enum: ['CONFIRMED','RESOLVED'] } } } } }, async req => incidents.transition((await auth.user(req, true)).id, req.params.id, req.body.status));
  app.post<{ Params: { id: string }; Body: { ticketId: string } }>('/api/v1/admin/incidents/:id/escalations', { schema: { params, body: { type: 'object', additionalProperties: false, required: ['ticketId'], properties: { ticketId: uuid } } } }, async req => incidents.escalate((await auth.user(req, true)).id, req.params.id, req.body.ticketId));
  app.post<{ Params: { id: string }; Body: { draft?: string; review?: boolean; expectedHash?: string; waiting?: boolean; providerReply?: string } }>('/api/v1/admin/escalations/:id', { schema: { params, body: { type: 'object', additionalProperties: false, minProperties: 1, properties: { draft: { ...text, minLength: 5 }, review: { const: true }, expectedHash: { type: 'string', pattern: '^[a-f0-9]{64}$' }, waiting: { const: true }, providerReply: text } } } }, async req => incidents.updateEscalation((await auth.user(req, true)).id, req.params.id, req.body));
  app.post<{ Params: { id: string }; Body: { subscriptionId: string; hours: number; reason: string; operationKey: string } }>('/api/v1/admin/incidents/:id/compensations', { schema: { params, body: { type: 'object', additionalProperties: false, required: ['subscriptionId','hours','reason','operationKey'], properties: { subscriptionId: uuid, hours: { type: 'integer', minimum: 1, maximum: 168 }, reason: { type: 'string', minLength: 5, maxLength: 500 }, operationKey: key } } } }, async req => incidents.compensate((await auth.user(req, true)).id, req.params.id, req.body.subscriptionId, req.body.hours, req.body.reason, req.body.operationKey));
}
