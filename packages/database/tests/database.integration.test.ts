import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';
import { seedDatabase } from '../src/seed.js';
import { buildApp } from '../../../apps/api/src/app.js';
import { readApiConfig } from '@shared-vps/runtime';

const schema = `stage11_test_${randomUUID().replaceAll('-', '')}`;
let admin: PrismaClient | undefined;
let db: PrismaClient;
let planId: string;
let testUrl: string;
async function order() {
  const user = await db.user.create({ data: {} });
  return db.order.create({ data: { userId: user.id, planId, amount: 17000, currency: 'RUB' } });
}
async function slot() {
  const server = await db.server.create({ data: { monthlyCost: 20000, capacity: 3 } });
  return db.serverSlot.create({ data: { serverId: server.id, slotNumber: 1 } });
}
describe.sequential('PostgreSQL migrations and invariants', () => {
  beforeAll(async () => {
    const raw = process.env.TEST_DATABASE_URL;
    if (!raw) throw new Error('Set TEST_DATABASE_URL for a local PostgreSQL database; see README.');
    const parsed = new URL(raw);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) throw new Error('Integration tests require a local PostgreSQL host.');
    admin = new PrismaClient({ datasources: { db: { url: raw } } });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const tables = await admin.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM information_schema.tables WHERE table_schema = ${schema}`;
    expect(Number(tables[0]?.count)).toBe(0);
    parsed.searchParams.set('schema', schema);
    testUrl = parsed.toString();
    const cli = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url));
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, DATABASE_URL: testUrl }, stdio: 'pipe',
    });
    db = new PrismaClient({ datasources: { db: { url: testUrl } } });
  });
  afterAll(async () => {
    if (db) await db.$disconnect();
    if (admin) { await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect(); }
  });
  it('applies the initial migration to an empty schema', async () => {
    const tables = await db.$queryRaw<{ table_name: string }[]>`SELECT table_name FROM information_schema.tables WHERE table_schema = ${schema}`;
    expect(tables.map(table => table.table_name)).toEqual(expect.arrayContaining(['users', 'user_identities', 'plans', 'orders', 'payments', 'servers', 'server_slots', 'subscriptions', 'access_credentials', 'audit_logs', 'settings']));
  });
  it('creates Basic, seed is repeatable and preserves adjusted prices', async () => {
    const first = await seedDatabase(db); const second = await seedDatabase(db);
    planId = first.id;
    expect(first.id).toBe(second.id); expect(second.price).toBe(17000); expect(second.durationDays).toBe(30);
    expect(await db.plan.count({ where: { code: 'basic' } })).toBe(1);
    expect(await db.setting.count()).toBe(6); expect((await db.setting.findUniqueOrThrow({where:{key:'server.capacity4_approved'}})).value).toBe(false);
    await db.plan.update({ where: { id: planId }, data: { price: 18000 } });
    await seedDatabase(db); expect((await db.plan.findUniqueOrThrow({ where: { id: planId } })).price).toBe(18000);
  });
  it('checks readiness and retrieves seeded tariff through the real API', async () => {
    const app = await buildApp(readApiConfig({ DATABASE_URL: testUrl, LOG_LEVEL: 'silent' }));
    try {
      expect((await app.inject('/ready')).statusCode).toBe(200);
      expect((await app.inject('/api/v1/plans')).json()).toEqual([expect.objectContaining({ code: 'basic', price: 18000, durationDays: 30 })]);
    } finally { await app.close(); }
  });
  it('deduplicates identities within a provider', async () => {
    const first = await db.user.create({ data: {} }); const second = await db.user.create({ data: {} });
    await db.userIdentity.create({ data: { userId: first.id, provider: 'TELEGRAM', providerUserId: '123' } });
    await expect(db.userIdentity.create({ data: { userId: second.id, provider: 'TELEGRAM', providerUserId: '123' } })).rejects.toMatchObject({ code: 'P2002' });
  });
  it('deduplicates external payments per provider', async () => {
    const source = await order();
    const data = { orderId: source.id, amount: 17000, provider: 'TEST' as const, externalPaymentId: 'test-payment-1', status: 'SUCCEEDED' as const };
    await db.payment.create({ data });
    await expect(db.payment.create({ data })).rejects.toMatchObject({ code: 'P2002' });
  });
  it('limits slot numbers and prevents shrinking capacity over existing slots', async () => {
    const seat = await slot();
    await expect(db.serverSlot.create({ data: { serverId: seat.serverId, slotNumber: 4 } })).rejects.toThrow();
    await db.serverSlot.create({ data: { serverId: seat.serverId, slotNumber: 3 } });
    await expect(db.server.update({ where: { id: seat.serverId }, data: { capacity: 2 } })).rejects.toThrow();
    await expect(db.serverSlot.create({ data: { serverId: seat.serverId, slotNumber: 1 } })).rejects.toMatchObject({ code: 'P2002' });
  });
  it('rejects simultaneous live assignments, then reuses a slot with history intact', async () => {
    const seat = await slot(); const a = await order(); const b = await order();
    const results = await Promise.allSettled([a, b].map(source => db.subscription.create({ data: {
      userId: source.userId, planId, orderId: source.id, serverSlotId: seat.id, status: 'ACTIVE',
      startedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86400000),
    } })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const assigned = await db.subscription.findFirstOrThrow({ where: { serverSlotId: seat.id } });
    await db.subscription.update({ where: { id: assigned.id }, data: { status: 'EXPIRED' } });
    const remaining = assigned.orderId === a.id ? b : a;
    await db.subscription.create({ data: { userId: remaining.userId, planId, orderId: remaining.id, serverSlotId: seat.id } });
    const slotBefore = await db.serverSlot.findUniqueOrThrow({ where: { id: seat.id } });
    const historyBefore = await db.subscription.findMany({ where: { serverSlotId: seat.id }, orderBy: { id: 'asc' } });
    expect(historyBefore).toHaveLength(2);
    expect(historyBefore).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: assigned.id, status: 'EXPIRED', serverSlotId: seat.id }),
      expect.objectContaining({ orderId: remaining.id, status: 'PENDING', serverSlotId: seat.id }),
    ]));

    // Assert Prisma's structured foreign-key error, not its formatted message.
    // Reuse one promise so the deletion is attempted exactly once.
    const deletion = Promise.resolve(db.serverSlot.delete({ where: { id: seat.id } }));
    await expect(deletion).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    await expect(deletion).rejects.toMatchObject({ code: 'P2003' });

    expect(await db.serverSlot.findUniqueOrThrow({ where: { id: seat.id } })).toEqual(slotBefore);
    expect(await db.subscription.findMany({ where: { serverSlotId: seat.id }, orderBy: { id: 'asc' } })).toEqual(historyBefore);
  });
  it('enforces the subscription owner and plan from its order', async () => {
    const source = await order(); const other = await db.user.create({ data: {} });
    await expect(db.subscription.create({ data: { orderId: source.id, userId: other.id, planId } })).rejects.toMatchObject({ code: 'P2003' });
  });
  it('rejects negative money, invalid periods and mismatched setting types', async () => {
    await expect(db.plan.create({ data: { code: 'bad', name: 'Bad', price: -1, durationDays: 30, maxUsersPerServer: 3 } })).rejects.toThrow();
    await expect(db.setting.create({ data: { key: 'test.bad', valueType: 'INTEGER', value: 'text' } })).rejects.toThrow();
    const source = await order(); const seat = await slot();
    await expect(db.subscription.create({ data: { orderId: source.id, userId: source.userId, planId, serverSlotId: seat.id, status: 'ACTIVE', startedAt: new Date(), expiresAt: new Date(0) } })).rejects.toThrow();
  });
});
