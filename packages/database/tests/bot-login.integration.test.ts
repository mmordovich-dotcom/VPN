import { randomUUID, createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../src/seed.js';
import { buildApp } from '../../../apps/api/src/app.js';
import { SubscriptionEngine } from '../../../apps/api/src/engine.js';
import { TelegramGateway } from '../../../apps/api/src/telegram.js';
import { digest } from '../../../apps/api/src/auth.js';
import { readApiConfig } from '@shared-vps/runtime';

const schema = `stage125_test_${randomUUID().replaceAll('-', '')}`;
const origin = 'https://platform.example.com';
let admin: PrismaClient; let db: PrismaClient; let app: Awaited<ReturnType<typeof buildApp>>;
let gateway: TelegramGateway; let engine: SubscriptionEngine; let config: ReturnType<typeof readApiConfig>;
let updateId = 0; let sent: { method: string; body: Record<string, unknown> }[] = [];
type Pending = { requestId: string; displayCode: string; expiresAt: string; deepLink: string };
function cookie(response: { headers: Record<string, unknown> }, name: string) {
  const raw = response.headers['set-cookie']; const values = Array.isArray(raw) ? raw : [raw];
  return String(values.find(value => typeof value === 'string' && value.startsWith(`${name}=`)) ?? '').split(';')[0]!;
}
const post = (path: string, payload: Record<string, unknown>, cookies = '') => app.inject({ method: 'POST', url: `/api/v1${path}`, headers: { origin, 'x-shared-vps': '1', cookie: cookies }, payload });
async function begin(cookies = '') {
  const response = await post('/auth/bot/request', {}, cookies); expect(response.statusCode).toBe(200);
  return { pending: response.json<Pending>(), proof: cookie(response, '__Host-sharedvps-login') };
}
async function send(text: string, senderId = 1001, callback = false) {
  const id = ++updateId;
  const message = { message_id: id, chat: { id: senderId, type: 'private' }, from: { id: senderId }, text };
  await gateway.accept(callback ? { update_id: id, callback_query: { id: String(id), from: { id: senderId }, data: text, message } } : { update_id: id, message });
  await gateway.drain(); return sent.at(-1)!.body;
}
const claim = (pending: Pending, id = 1001) => send(`/start ${new URL(pending.deepLink).searchParams.get('start')}`, id);
const confirm = (pending: Pending, id = 1001, yes = true) => send(`login:${yes ? 'yes' : 'no'}:${pending.requestId}`, id, true);
async function code(id = 1001) { const reply = await send('/code', id); const value = /Код входа: (\d{8})/.exec(String(reply.text))?.[1]; expect(value).toBeDefined(); return value!; }
async function link(id = 1001) { const reply = await send('/login', id); const keyboard = reply.reply_markup as { inline_keyboard: { url?: string }[][] }; return new URL(keyboard.inline_keyboard[0]![0]!.url!).hash.slice(7); }

describe.sequential('Stage 1.2.5 API + bot + PostgreSQL security', () => {
  beforeAll(async () => {
    const raw = process.env.TEST_DATABASE_URL; if (!raw) throw new Error('TEST_DATABASE_URL required');
    const parsed = new URL(raw); if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error('Local database required');
    admin = new PrismaClient({ datasources: { db: { url: raw } } }); await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    parsed.searchParams.set('schema', schema); const url = parsed.toString();
    execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url)), 'migrate', 'deploy'], { cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
    db = new PrismaClient({ datasources: { db: { url } } }); engine = new SubscriptionEngine(db);
    config = readApiConfig({ DATABASE_URL: url, NODE_ENV: 'production', LOG_LEVEL: 'silent', PUBLIC_ORIGIN: origin, CORS_ORIGINS: origin, TELEGRAM_BOT_TOKEN: '123456:fake-test-token', TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(40), TELEGRAM_BOT_USERNAME: 'vpnaxon_bot' });
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe(`TRUNCATE "${schema}".users, "${schema}".plans, "${schema}".settings, "${schema}".servers, "${schema}".telegram_updates, "${schema}".auth_limits RESTART IDENTITY CASCADE`);
    await seedDatabase(db); updateId = 0; sent = [];
    gateway = new TelegramGateway(db, config, engine, async (method, body) => { sent.push({ method, body }); return {}; });
    app = await buildApp(config, db);
  });
  afterAll(async () => { if (db) await db.$disconnect(); if (admin) { await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect(); } });
  // Each test closes its timer, avoiding background Telegram delivery in fixtures.
  async function run(test: () => Promise<void>) { try { await test(); } finally { await app.close(); } }

  it('registers from verified bot confirmation, binds the browser, creates a secure session once, and survives reload', () => run(async () => {
    const { pending, proof } = await begin();
    expect((await post('/auth/bot/complete', { requestId: pending.requestId }, proof)).statusCode).toBe(401);
    expect((await post('/auth/bot/status', { requestId: pending.requestId })).statusCode).toBe(401);
    const reply = await claim(pending); expect(reply.text).toContain(pending.displayCode);
    const stored = await db.telegramUpdate.findUniqueOrThrow({ where: { id: 1 } }); expect(JSON.stringify(stored.payload)).not.toContain(new URL(pending.deepLink).searchParams.get('start')!.slice(6));
    await confirm(pending);
    expect((await post('/auth/bot/status', { requestId: pending.requestId }, proof)).json()).toMatchObject({ status: 'APPROVED' });
    const response = await post('/auth/bot/complete', { requestId: pending.requestId }, proof); expect(response.statusCode).toBe(200);
    expect(String(response.headers['set-cookie'])).toContain('HttpOnly'); expect(String(response.headers['set-cookie'])).toContain('Secure'); expect(String(response.headers['set-cookie'])).toContain('SameSite=Lax');
    const session = cookie(response, '__Host-sharedvps');
    expect((await app.inject({ url: '/api/v1/me', headers: { cookie: session } })).json()).toMatchObject(response.json());
    expect(await db.user.count()).toBe(1); expect(await db.userIdentity.count()).toBe(1);
    expect((await post('/auth/bot/complete', { requestId: pending.requestId }, proof)).statusCode).toBe(401);
    expect(await db.session.count({ where: { userId: { not: null } } })).toBe(1);
  }));
  it('rejects identifier-only, another Telegram owner, another browser and client-provided identity', () => run(async () => {
    const first = await begin(); const other = await begin();
    await send(`/start login_${first.pending.requestId}`); await confirm(first.pending);
    expect((await db.loginRequest.findUniqueOrThrow({ where: { id: first.pending.requestId } })).status).toBe('PENDING');
    await claim(first.pending); await confirm(first.pending, 1002);
    expect((await db.loginRequest.findUniqueOrThrow({ where: { id: first.pending.requestId } })).status).toBe('CLAIMED');
    await confirm(first.pending);
    expect((await post('/auth/bot/complete', { requestId: first.pending.requestId }, other.proof)).statusCode).toBe(401);
    expect((await post('/auth/bot/complete', { requestId: first.pending.requestId, telegramId: '1001' }, first.proof)).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/v1/telegram/webhook', payload: { update_id: 999 } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/bot/request', payload: {} })).statusCode).toBe(403);
  }));
  it('keeps two concurrent requests independent and serializes one-time completion', () => run(async () => {
    const first = await begin(); const second = await begin(first.proof);
    expect(second.proof).toBe(first.proof); expect(first.pending.requestId).not.toBe(second.pending.requestId);
    await claim(first.pending); await claim(second.pending); await confirm(first.pending); await confirm(second.pending);
    const responses = await Promise.all([post('/auth/bot/complete', { requestId: first.pending.requestId }, first.proof), post('/auth/bot/complete', { requestId: first.pending.requestId }, first.proof)]);
    expect(responses.map(r => r.statusCode).sort()).toEqual([200, 401]);
    expect((await post('/auth/bot/status', { requestId: second.pending.requestId }, second.proof)).json()).toMatchObject({ status: 'APPROVED' });
    expect(await db.userIdentity.count()).toBe(1);
  }));
  it('handles cancellation and expiry without creating a browser session', () => run(async () => {
    const first = await begin(); await claim(first.pending); await confirm(first.pending, 1001, false);
    expect((await post('/auth/bot/status', { requestId: first.pending.requestId }, first.proof)).json()).toMatchObject({ status: 'CANCELLED' });
    expect((await post('/auth/bot/complete', { requestId: first.pending.requestId }, first.proof)).statusCode).toBe(401);
    const second = await begin(); await db.loginRequest.update({ where: { id: second.pending.requestId }, data: { expiresAt: new Date(0) } });
    await claim(second.pending); await confirm(second.pending);
    expect((await post('/auth/bot/status', { requestId: second.pending.requestId }, second.proof)).json()).toMatchObject({ status: 'EXPIRED' });
    expect(await db.session.count()).toBe(0);
  }));
  it('serializes cancellation against completion and revokes any session issued just before cancellation', () => run(async () => {
    const request = await begin(); await claim(request.pending); await confirm(request.pending);
    await Promise.all([post('/auth/bot/complete', { requestId: request.pending.requestId }, request.proof), post('/auth/bot/cancel', { requestId: request.pending.requestId }, request.proof)]);
    expect((await db.loginRequest.findUniqueOrThrow({ where: { id: request.pending.requestId } })).status).toBe('CANCELLED');
    expect(await db.session.count()).toBe(0);
  }));
  it('requires the link owner to confirm, consumes the link once and never creates a session just from opening it', () => run(async () => {
    const token = await link(); expect(await db.session.count()).toBe(0);
    const response = await post('/auth/link', { token }); expect(response.statusCode).toBe(200);
    const pending = response.json<Pending>(); const proof = cookie(response, '__Host-sharedvps-login');
    expect((await post('/auth/link', { token })).statusCode).toBe(401);
    await claim(pending, 1002); await confirm(pending, 1002);
    expect((await post('/auth/bot/complete', { requestId: pending.requestId }, proof)).statusCode).toBe(401);
    await claim(pending); await confirm(pending);
    expect((await post('/auth/bot/complete', { requestId: pending.requestId }, proof)).statusCode).toBe(200);
  }));
  it('stores only HMAC code hashes and never persists outgoing codes or link tokens', () => run(async () => {
    const value = await code(); const grant = await db.loginGrant.findFirstOrThrow();
    expect(grant.tokenHash).not.toBe(value); expect(grant.tokenHash).toHaveLength(64);
    expect((await db.telegramUpdate.findFirstOrThrow()).response).toBeNull();
    const responses = await Promise.all([post('/auth/code', { code: value }), post('/auth/code', { code: value })]);
    expect(responses.map(r => r.statusCode).sort()).toEqual([200, 401]); expect(await db.session.count()).toBe(1);
  }));
  it('invalidates old codes, rejects expiry/replay uniformly and accepts a newly requested code', () => run(async () => {
    const old = await code(); const current = await code();
    const invalid = await post('/auth/code', { code: old }); expect(invalid.statusCode).toBe(401);
    await db.loginGrant.updateMany({ where: { consumedAt: null }, data: { expiresAt: new Date(0) } });
    const expired = await post('/auth/code', { code: current }); expect(expired.statusCode).toBe(invalid.statusCode); expect(expired.json().error).toBe(invalid.json().error);
    const fresh = await code(); expect((await post('/auth/code', { code: fresh })).statusCode).toBe(200);
  }));
  it('rejects expired links with the same safe error as an unknown link', () => run(async () => {
    const token = await link(); await db.loginGrant.updateMany({ data: { expiresAt: new Date(0) } });
    const expired = await post('/auth/link', { token }); const invalid = await post('/auth/link', { token: 'X'.repeat(43) });
    expect(expired.statusCode).toBe(401); expect(expired.json().error).toBe(invalid.json().error);
  }));
  it('limits guessing per code, browser/IP and globally, without trusting forwarded IP headers', () => run(async () => {
    for (let i = 0; i < 5; i++) expect((await post('/auth/code', { code: '00000000' })).statusCode).toBe(401);
    expect((await post('/auth/code', { code: '00000000' })).statusCode).toBe(429);
    for (let i = 0; i < 2; i++) await post('/auth/code', { code: String(11111111 + i) });
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/code', headers: { origin, 'x-shared-vps': '1', 'x-forwarded-for': '203.0.113.9' }, payload: { code: '22222222' } });
    expect(response.statusCode).toBe(429); expect(await db.user.count()).toBe(0); expect(await db.session.count()).toBe(0);
    expect(await db.authLimit.count()).toBeGreaterThan(0);
  }));
  it('reuses one identity across bot, code and signed Mini App login, retaining orders and demo VPS', () => run(async () => {
    const value = await code(); const response = await post('/auth/code', { code: value }); const user = response.json<{ id: string }>();
    const plan = await db.plan.findFirstOrThrow(); const order = await engine.order(user.id, plan.id, randomUUID()); await engine.payment(user.id, order.id, 'confirm');
    const params = new URLSearchParams({ user: JSON.stringify({ id: 1001 }), auth_date: String(Math.floor(Date.now() / 1000)), query_id: randomUUID() });
    const data = [...params].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${k}=${v}`).join('\n');
    params.set('hash', createHmac('sha256', createHmac('sha256', 'WebAppData').update(config.TELEGRAM_BOT_TOKEN).digest()).update(data).digest('hex'));
    expect((await post('/auth/telegram', { initData: params.toString() })).json()).toMatchObject({ id: user.id });
    const first = await begin(); await claim(first.pending); await confirm(first.pending);
    expect((await post('/auth/bot/complete', { requestId: first.pending.requestId }, first.proof)).json()).toMatchObject({ id: user.id });
    expect(await db.user.count()).toBe(1); expect(await db.userIdentity.count()).toBe(1); expect(await db.order.count()).toBe(1); expect(await db.subscription.count()).toBe(1); expect(await db.server.count()).toBe(1);
  }));
  it('prevents silent account switching; logout revokes this session and outstanding browser requests', () => run(async () => {
    const first = await post('/auth/code', { code: await code() }); const session = cookie(first, '__Host-sharedvps');
    const otherCode = await code(1002); expect((await post('/auth/code', { code: otherCode }, session)).statusCode).toBe(409);
    expect((await app.inject({ url: '/api/v1/me', headers: { cookie: session } })).json()).toMatchObject(first.json());
    const pending = await begin(session); const logout = await post('/auth/logout', {}, `${session}; ${pending.proof}`);
    expect(logout.statusCode).toBe(200); expect(String(logout.headers['set-cookie'])).toContain('__Host-sharedvps-login=;'); expect(String(logout.headers['set-cookie'])).toContain('__Host-sharedvps=;');
    expect((await app.inject({ url: '/api/v1/me', headers: { cookie: session } })).statusCode).toBe(401);
    expect((await db.loginRequest.findUniqueOrThrow({ where: { id: pending.pending.requestId } })).status).toBe('CANCELLED');
  }));
});
