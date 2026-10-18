import { randomUUID, createHmac, randomBytes, generateKeyPairSync, sign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../src/seed.js';
import { SubscriptionEngine } from '../../../apps/api/src/engine.js';
import { digest, validateInitData, validateLoginJwt } from '../../../apps/api/src/auth.js';
import { TelegramGateway } from '../../../apps/api/src/telegram.js';
import { buildApp } from '../../../apps/api/src/app.js';
import { readApiConfig } from '@shared-vps/runtime';
const schema = `stage12_test_${randomUUID().replaceAll('-', '')}`;
let admin: PrismaClient; let db: PrismaClient; let url: string; let planId: string; let engine: SubscriptionEngine;
const config = () => readApiConfig({ DATABASE_URL: url, LOG_LEVEL: 'silent', TELEGRAM_BOT_TOKEN: '123456:fake-test-token', TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(40), PUBLIC_ORIGIN: 'https://platform.example.com' });
async function user() { return db.user.create({ data: {} }); }
async function purchase(id: string, key = randomUUID()) { const order = await engine.order(id, planId, key); await engine.payment(id, order.id, 'confirm'); return db.subscription.findFirstOrThrow({ where: { userId: id, status: 'ACTIVE' }, include: { serverSlot: true } }); }
async function cookie(id: string) { const token = randomBytes(32).toString('base64url'); await db.session.create({ data: { tokenHash: digest(token), userId: id, expiresAt: new Date(Date.now() + 3600000) } }); return `sharedvps=${token}`; }
const headers = (cookie: string) => ({ cookie, origin: 'http://localhost:5173', 'x-shared-vps': '1' });
function initData(id = 123, authDate = Math.floor(Date.now() / 1000)) {
  const p = new URLSearchParams({ user: JSON.stringify({ id, first_name: 'Test' }), auth_date: String(authDate), query_id: randomUUID() });
  const data = [...p].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  p.set('hash', createHmac('sha256', createHmac('sha256', 'WebAppData').update(config().TELEGRAM_BOT_TOKEN).digest()).update(data).digest('hex')); return p.toString();
}
describe.sequential('Stage 1.2 real PostgreSQL, shared API and Telegram', () => {
  beforeAll(async () => {
    const raw = process.env.TEST_DATABASE_URL; if (!raw) throw new Error('TEST_DATABASE_URL required');
    const parsed = new URL(raw); if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error('Local database required');
    admin = new PrismaClient({ datasources: { db: { url: raw } } }); await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    parsed.searchParams.set('schema', schema); url = parsed.toString();
    execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url)), 'migrate', 'deploy'], { cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
    db = new PrismaClient({ datasources: { db: { url } } }); engine = new SubscriptionEngine(db);
  });
  beforeEach(async () => {
    // Disposable, randomized test schema only. Never executes against public/runtime tables.
    await db.$executeRawUnsafe(`TRUNCATE "${schema}".users, "${schema}".plans, "${schema}".servers, "${schema}".settings, "${schema}".telegram_updates, "${schema}".auth_replays RESTART IDENTITY CASCADE`);
    planId = (await seedDatabase(db)).id;
  });
  afterAll(async () => { if (db) await db.$disconnect(); if (admin) { await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect(); } });
  it('allocates first three to one VPS and fourth to another; repeats create/payment safely', async () => {
    const ids = await Promise.all(Array.from({ length: 4 }, () => user()));
    const subs = [];
    for (const u of ids) subs.push(await purchase(u.id));
    expect(new Set(subs.slice(0, 3).map(s => s.serverSlot!.serverId)).size).toBe(1);
    expect(subs[3]!.serverSlot!.serverId).not.toBe(subs[0]!.serverSlot!.serverId);
    await engine.payment(ids[0]!.id, subs[0]!.orderId, 'confirm');
    expect(await db.order.count()).toBe(4); expect(await db.server.count()).toBe(2); expect(await db.subscription.count()).toBe(4);
  });
  it('serializes concurrent purchases, no overcapacity or duplicate VPS; deduplicates operation key', async () => {
    const buyers = await Promise.all(Array.from({ length: 10 }, () => user()));
    await Promise.all(buyers.map(u => purchase(u.id)));
    expect(await db.server.count()).toBe(4);
    for (const server of await db.server.findMany({ include: { slots: { include: { subscriptions: { where: { status: 'ACTIVE' } } } } } })) expect(server.slots.reduce((n, s) => n + s.subscriptions.length, 0)).toBeLessThanOrEqual(3);
    const extra = await user();
    const orders = await Promise.all([engine.order(extra.id, planId, 'same-operation'), engine.order(extra.id, planId, 'same-operation')]);
    expect(orders[0]!.id).toBe(orders[1]!.id);
    await expect(engine.order(buyers[0]!.id, planId, 'new-operation')).rejects.toMatchObject({ code: 'USE_RENEWAL' });
  });
  it('cancellation frees and reuses the slot, preserving history and revoking access', async () => {
    const a = await user(); const s = await purchase(a.id); await engine.cancel(a.id, s.id);
    const b = await purchase((await user()).id);
    expect(b.serverSlotId).toBe(s.serverSlotId); expect(await db.server.count()).toBe(1);
    expect(await db.subscription.findUnique({ where: { id: s.id } })).toMatchObject({ status: 'CANCELLED', serverSlotId: s.serverSlotId });
    expect((await db.accessCredential.findFirstOrThrow({ where: { subscriptionId: s.id } })).revokedAt).not.toBeNull();
    expect(await db.order.count()).toBe(2);
    await expect(db.serverSlot.delete({ where: { id: s.serverSlotId! } })).rejects.toMatchObject({ code: 'P2003' });
  });
  it('renewal adds one period exactly once and extends the virtual server rental independently', async () => {
    const u = await user(); const s = await purchase(u.id); const other = await purchase((await user()).id);
    const renewal = await engine.order(u.id, planId, 'renewal-operation', s.id);
    await Promise.all([engine.payment(u.id, renewal.id, 'confirm'), engine.payment(u.id, renewal.id, 'confirm')]);
    const renewed = await db.subscription.findUniqueOrThrow({ where: { id: s.id } });
    expect(renewed.expiresAt!.getTime() - s.expiresAt!.getTime()).toBe(30 * 86400000);
    expect((await db.subscription.findUniqueOrThrow({ where: { id: other.id } })).expiresAt).toEqual(other.expiresAt);
    const server = await db.server.findFirstOrThrow(); expect(server.expiresAt!.getTime()).toBeGreaterThanOrEqual(renewed.expiresAt!.getTime());
    expect(await db.subscription.count()).toBe(2);
  });
  it('expiry releases only its own slot; expired reactivation keeps the old historical record', async () => {
    const a = await user(); const s = await purchase(a.id); const b = await purchase((await user()).id);
    await db.subscription.update({ where: { id: s.id }, data: { startedAt: new Date(Date.now() - 40 * 86400000), expiresAt: new Date(Date.now() - 1000) } });
    await engine.tick(); expect((await db.subscription.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('ACTIVE');
    const renew = await engine.order(a.id, planId, 'reactivation-key', s.id); await engine.payment(a.id, renew.id, 'confirm');
    expect((await db.subscription.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('EXPIRED');
    expect(await db.subscription.count({ where: { userId: a.id } })).toBe(2);
    expect((await engine.subscriptions(a.id)).filter(s => s.status === 'ACTIVE')).toHaveLength(1);
  });
  it('provider failure leaves durable PAID work, retries survive engine/client restart, no duplicate job effects', async () => {
    const u = await user(); const order = await engine.order(u.id, planId, 'failure-operation');
    const broken = new SubscriptionEngine(db, { async prepare() { throw new Error('private-provider-secret'); } });
    await expect(broken.payment(u.id, order.id, 'confirm')).rejects.toThrow('private-provider-secret');
    expect(await db.server.count()).toBe(0); expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: 'PAID', lastError: 'PROVIDER_RETRY' });
    const second = new PrismaClient({ datasources: { db: { url } } });
    try { const restarted = new SubscriptionEngine(second); await restarted.tick(); await restarted.tick(); expect(await second.subscription.count()).toBe(1); expect(await second.server.count()).toBe(1); } finally { await second.$disconnect(); }
  });
  it('mock failure/cancel/refund and duplicated events retain records', async () => {
    const a = await user(); const first = await engine.order(a.id, planId, 'failed-payment-key'); await engine.payment(a.id, first.id, 'fail'); await engine.payment(a.id, first.id, 'fail');
    await expect(engine.payment(a.id, first.id, 'confirm')).rejects.toMatchObject({ code: 'PAYMENT_FINAL' });
    const cancelled = await engine.order(a.id, planId, 'cancel-payment-key'); await engine.payment(a.id, cancelled.id, 'cancel');
    const s = await purchase(a.id); await expect(engine.payment(a.id, s.orderId, 'refund')).rejects.toMatchObject({ code: 'ADMIN_REQUIRED' });
    await engine.payment(a.id, s.orderId, 'refund', true); await engine.payment(a.id, s.orderId, 'refund', true);
    expect(await db.payment.count({ where: { status: 'REFUNDED' } })).toBe(1); expect(await db.order.count()).toBe(3); expect((await db.subscription.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('CANCELLED');
  });
  it('API catalog, authenticated purchase, reload/restart, own data, role checks and CSRF', async () => {
    let app = await buildApp(config()); const u = await user(); const other = await user(); const session = await cookie(u.id); const h = headers(session);
    try {
      expect((await app.inject('/api/v1/plans')).json()).toEqual([expect.objectContaining({ id: planId })]);
      expect((await app.inject('/api/v1/subscriptions')).statusCode).toBe(401);
      expect((await app.inject({ url: '/api/v1/admin', headers: h })).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url: '/api/v1/orders', headers: { cookie: session }, payload: { planId, operationKey: 'http-order-key' } })).statusCode).toBe(403);
      const created = await app.inject({ method: 'POST', url: '/api/v1/orders', headers: h, payload: { planId, operationKey: 'http-order-key' } }); expect(created.statusCode).toBe(200); const order = created.json() as OrderShape;
      const wrong = await app.inject({ method: 'POST', url: `/api/v1/orders/${order.id}/payment`, headers: headers(await cookie(other.id)), payload: { event: 'confirm' } }); expect(wrong.statusCode).toBe(404);
      expect((await app.inject({ method: 'POST', url: `/api/v1/orders/${order.id}/payment`, headers: h, payload: { event: 'confirm' } })).statusCode).toBe(200);
      await app.close(); app = await buildApp(config());
      expect((await app.inject({ url: '/api/v1/subscriptions', headers: h })).json()).toHaveLength(1);
      expect((await app.inject({ url: '/api/v1/subscriptions', headers: headers(await cookie(other.id)) })).json()).toEqual([]);
      await db.user.update({ where: { id: u.id }, data: { role: 'ADMIN' } });
      const dashboard = await app.inject({ url: '/api/v1/admin', headers: h }); expect(dashboard.statusCode).toBe(200); expect(dashboard.json().stats.active).toBe(1);
      const changed = await app.inject({ method: 'POST', url: `/api/v1/admin/plans/${planId}`, headers: h, payload: { price: 19000, durationDays: 30, maxUsersPerServer: 3, isActive: true } }); expect(changed.statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url: '/api/v1/admin/settings', headers: h, payload: { key: 'server.default_capacity', value: 4 } })).statusCode).toBe(400);
    } finally { await app.close(); }
  });
  it('signed Mini App login shares bot identity; rejects forgery, stale data and replay, uses HttpOnly cookie', async () => {
    const app = await buildApp(config());
    try {
      const data = initData(); expect(validateInitData(data, config().TELEGRAM_BOT_TOKEN)).toBe('123');
      const request = (initData: string) => app.inject({ method: 'POST', url: '/api/v1/auth/telegram', headers: headers(''), payload: { initData } });
      expect((await request(data.replace('123', '456'))).statusCode).toBe(401);
      expect((await request(initData(123, Math.floor(Date.now() / 1000) - 600))).statusCode).toBe(401);
      expect((await request('user=%7B%22id%22%3A123%7D')).statusCode).toBe(401);
      const response = await request(data); expect(response.statusCode).toBe(200); expect(response.headers['set-cookie']).toContain('HttpOnly'); expect(response.headers['set-cookie']).toContain('SameSite=Lax');
      const botUser = await engine.identity('123'); expect(response.json().id).toBe(botUser.id);
      expect((await request(data)).statusCode).toBe(401);
    } finally { await app.close(); }
  });
  it('validates OIDC signature, issuer, audience, nonce, time and numeric Telegram identity', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 }); const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key' };
    const claims = { iss: 'https://oauth.telegram.org', aud: '123456', sub: 'oidc-subject', id: 123, nonce: 'server-nonce', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 };
    const jwt = (overrides = {}) => { const a = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString('base64url'); const b = Buffer.from(JSON.stringify({ ...claims, ...overrides })).toString('base64url'); return `${a}.${b}.${sign('RSA-SHA256', Buffer.from(`${a}.${b}`), privateKey).toString('base64url')}`; };
    expect(await validateLoginJwt(jwt(), '123456', 'server-nonce', [jwk])).toBe('123');
    for (const overrides of [{ aud: 'other' }, { iss: 'https://evil.example' }, { nonce: 'wrong' }, { exp: 1 }, { iat: 1 }, { id: '123' }]) await expect(validateLoginJwt(jwt(overrides), '123456', 'server-nonce', [jwk])).rejects.toMatchObject({ code: 'INVALID_LOGIN' });
    await expect(validateLoginJwt(jwt().slice(0, -8) + 'abcdefgh', '123456', 'server-nonce', [jwk])).rejects.toMatchObject({ code: 'INVALID_LOGIN' });
  });
  it('button bot start/buy/confirm/my-sub/connect/support share PostgreSQL and deduplicate updates', async () => {
    const sent: { method: string; body: Record<string, unknown> }[] = [];
    const gateway = new TelegramGateway(db, config(), engine, async (method, body) => { sent.push({ method, body }); return {}; });
    let updateId = 1;
    const message = async (text: string) => { const update = { update_id: updateId++, message: { message_id: updateId, text, from: { id: 777 }, chat: { id: 777, type: 'private' } } }; await gateway.accept(update); await gateway.accept(update); await gateway.drain(); };
    const callback = async (data: string, id = 777) => { await gateway.accept({ update_id: updateId++, callback_query: { id: String(updateId), data, from: { id }, message: { message_id: 5, chat: { id, type: 'private' } } } }); await gateway.drain(); };
    await message('/start'); expect(JSON.stringify(sent.at(-1))).toContain('Купить подписку'); expect(sent.filter(s => s.method === 'sendMessage')).toHaveLength(1);
    await message('🛒 Купить подписку'); const order = await db.order.findFirstOrThrow(); expect(JSON.stringify(sent.at(-1))).toContain('Подтвердить');
    await callback(`confirm:${order.id}`); await callback(`confirm:${order.id}`); expect(await db.subscription.count()).toBe(1); expect(await db.order.count()).toBe(1);
    await callback('subscription'); const s = await db.subscription.findFirstOrThrow(); expect(JSON.stringify(sent.at(-1))).toContain(s.expiresAt!.toISOString().slice(0, 10));
    await callback('connect'); expect(JSON.stringify(sent.at(-1))).toContain('Mini App'); expect(JSON.stringify(sent.at(-1))).toContain('Инструкция в Telegram');
    await callback(`confirm:${order.id}`, 888); expect(JSON.stringify(sent.at(-1))).toContain('ORDER_NOT_FOUND');
    await callback('support:new'); await message('Нужна помощь с демонстрационной подпиской'); expect(await db.supportTicket.count()).toBe(1); await callback('support'); expect(JSON.stringify(sent.at(-1))).toContain('№1');
    await gateway.drain(); expect(await db.subscription.count()).toBe(1);
  });
  it('webhook rejects invalid secret and accepts/stores a duplicate only once', async () => {
    const app = await buildApp(config()); const payload = { update_id: 42 };
    try { expect((await app.inject({ method: 'POST', url: '/api/v1/telegram/webhook', payload })).statusCode).toBe(401); for (let n = 0; n < 2; n++) expect((await app.inject({ method: 'POST', url: '/api/v1/telegram/webhook', headers: { 'x-telegram-bot-api-secret-token': 'a'.repeat(40) }, payload })).statusCode).toBe(200); expect(await db.telegramUpdate.count()).toBe(1); } finally { await app.close(); }
  });
  it('recovers Telegram response delivery after restart without repeating activation; website sees the same record', async () => {
    const owner = await engine.identity('900'); const order = await engine.order(owner.id, planId, 'telegram-recovery');
    const update = { update_id: 91, callback_query: { id: 'cb91', data: `confirm:${order.id}`, from: { id: 900 }, message: { message_id: 19, chat: { id: 900, type: 'private' } } } };
    const failed = new TelegramGateway(db, config(), engine, async method => { if (method === 'editMessageText') throw new Error('transport offline'); return {}; });
    await failed.accept(update); await failed.drain(); expect(await db.subscription.count()).toBe(1);
    expect(await db.telegramUpdate.findUniqueOrThrow({ where: { id: 91 } })).toMatchObject({ status: 'PENDING', attempts: 1 });
    const replies: unknown[] = []; const restarted = new TelegramGateway(db, config(), new SubscriptionEngine(db), async (_method, body) => { replies.push(body); return {}; });
    await restarted.accept(update); await restarted.drain(); await restarted.drain(); expect(await db.subscription.count()).toBe(1); expect(await db.server.count()).toBe(1);
    expect(await db.telegramUpdate.findUniqueOrThrow({ where: { id: 91 } })).toMatchObject({ status: 'DONE', attempts: 2 });
    const app = await buildApp(config()); try { const response = await app.inject({ url: '/api/v1/subscriptions', headers: headers(await cookie(owner.id)) }); expect(response.json()).toEqual([expect.objectContaining({ userId: owner.id, orderId: order.id })]); } finally { await app.close(); }
  });
  it('support records are private and administrator can update status; refund reverses a renewal once', async () => {
    const owner = await user(); const stranger = await user(); const app = await buildApp(config()); const h = headers(await cookie(owner.id));
    try {
      const ticket = await app.inject({ method: 'POST', url: '/api/v1/support', headers: h, payload: { text: 'Private support text' } }); expect(ticket.statusCode).toBe(200);
      expect((await app.inject({ url: '/api/v1/support', headers: headers(await cookie(stranger.id)) })).json()).toEqual([]);
      expect((await app.inject({ method: 'POST', url: `/api/v1/admin/support/${ticket.json().id}`, headers: h, payload: { status: 'CLOSED' } })).statusCode).toBe(403);
      await db.user.update({ where: { id: owner.id }, data: { role: 'ADMIN' } });
      expect((await app.inject({ method: 'POST', url: `/api/v1/admin/support/${ticket.json().id}`, headers: h, payload: { status: 'CLOSED' } })).statusCode).toBe(200);
      const sub = await purchase(owner.id); const renewal = await engine.order(owner.id, planId, 'refund-renewal-key', sub.id); await engine.payment(owner.id, renewal.id, 'confirm');
      expect((await engine.order(owner.id, planId, 'refund-renewal-key', sub.id)).id).toBe(renewal.id);
      await engine.payment(owner.id, renewal.id, 'refund', true); await engine.payment(owner.id, renewal.id, 'refund', true);
      expect((await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).expiresAt).toEqual(sub.expiresAt);
    } finally { await app.close(); }
  });
  it('upgrades a populated foundation schema without losing subscriptions/history or weakening RESTRICT', async () => {
    const upgradeSchema = `stage12_upgrade_${randomUUID().replaceAll('-', '')}`;
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${upgradeSchema}"`);
    const target = new URL(url); target.searchParams.set('schema', upgradeSchema);
    const cli = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url));
    const cliRun = (args: string[]) => execFileSync(process.execPath, [cli, ...args], { cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, DATABASE_URL: target.toString() }, stdio: 'pipe' });
    const old = new PrismaClient({ datasources: { db: { url: target.toString() } } });
    try {
      cliRun(['db', 'execute', '--file', 'prisma/migrations/20261015000000_foundation/migration.sql', '--schema', 'prisma/schema.prisma']);
      cliRun(['migrate', 'resolve', '--applied', '20261015000000_foundation']);
      const original = await old.user.create({ data: {} }); const p = await seedDatabase(old); const orderId = randomUUID();
      await old.$executeRaw`INSERT INTO orders (id,user_id,plan_id,status,amount,currency,updated_at) VALUES (${orderId}::uuid,${original.id}::uuid,${p.id}::uuid,'COMPLETED',17000,'RUB',now())`;
      const server = await old.server.create({ data: { monthlyCost: 20000, capacity: 3, status: 'ACTIVE' } });
      const slot = await old.serverSlot.create({ data: { serverId: server.id, slotNumber: 1, status: 'OCCUPIED' } });
      const sub = await old.subscription.create({ data: { userId: original.id, planId: p.id, orderId, serverSlotId: slot.id, status: 'ACTIVE', startedAt: new Date(), expiresAt: new Date(Date.now() + 86400000) } });
      const credential = await old.accessCredential.create({ data: { subscriptionId: sub.id, demoIdentifier: 'demo:upgrade-preserved' } });
      cliRun(['migrate', 'deploy']);
      expect(await old.subscription.findUniqueOrThrow({ where: { id: sub.id } })).toEqual(sub);
      expect(await old.accessCredential.findUniqueOrThrow({ where: { id: credential.id } })).toEqual(credential);
      expect(await old.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ status: 'COMPLETED', operationKey: null, periodDays: 30 });
      await expect(old.serverSlot.delete({ where: { id: slot.id } })).rejects.toMatchObject({ code: 'P2003' });
      expect(await old.serverSlot.findUniqueOrThrow({ where: { id: slot.id } })).toEqual(slot);
    } finally { await old.$disconnect(); await admin.$executeRawUnsafe(`DROP SCHEMA "${upgradeSchema}" CASCADE`); }
  });
});
type OrderShape = { id: string };
