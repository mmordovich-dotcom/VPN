import { describe, it, expect, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { readApiConfig } from '@shared-vps/runtime';
import type { ApiDatabase } from '../src/plugins/database.js';

const config = readApiConfig({ DATABASE_URL: 'postgresql://demo:demo@127.0.0.1:5432/demo', LOG_LEVEL: 'silent' });
function fakeDb(failing = false): ApiDatabase {
  return { $queryRaw: failing ? vi.fn().mockRejectedValue(new Error('private-password')) : vi.fn().mockResolvedValue([{ one: 1 }]),
    $disconnect: vi.fn(), plan: { findMany: vi.fn().mockResolvedValue([]) } } as unknown as ApiDatabase;
}
describe('API foundation', () => {
  it('serves the exact health contract without a database query', async () => {
    const db = fakeDb();
    const app = await buildApp(config, db);
    try {
      const response = await app.inject('/health');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok', service: 'shared-vps-api', stage: '1.1' });
      expect(db.$queryRaw).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  it('checks the database for readiness', async () => {
    const db = fakeDb(); const app = await buildApp(config, db);
    try { expect((await app.inject('/ready')).statusCode).toBe(200); expect(db.$queryRaw).toHaveBeenCalledOnce(); }
    finally { await app.close(); }
  });
  it('returns safe 503 when the database is unavailable', async () => {
    const app = await buildApp(config, fakeDb(true));
    try { const response = await app.inject('/ready'); expect(response.statusCode).toBe(503); expect(response.json()).toEqual({ status: 'unavailable', error: 'Database unavailable' }); expect(response.body).not.toContain('private-password'); }
    finally { await app.close(); }
  });
  it('publishes only safe system information and protects the admin endpoint', async () => {
    const app = await buildApp(config, fakeDb());
    try {
      const response = await app.inject('/api/v1/system/info');
      expect(response.json()).toMatchObject({ name: 'Shared VPS Platform', stage: '1.1', mode: 'demo', components: { serverProvider: 'mock' } });
      expect(response.body).not.toContain('postgresql:');
      expect((await app.inject('/api/v1/admin')).statusCode).toBe(401);
    } finally { await app.close(); }
  });
  it('restricts CORS to configured browser origins', async () => {
    const app = await buildApp(config, fakeDb());
    try {
      const allowed = await app.inject({ url: '/health', headers: { origin: 'http://localhost:5173' } });
      const denied = await app.inject({ url: '/health', headers: { origin: 'https://untrusted.example' } });
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    } finally { await app.close(); }
  });
  it('sanitizes unexpected errors centrally', async () => {
    const app = await buildApp(config, fakeDb());
    app.get('/test-error', () => { throw new Error('sensitive database URL'); });
    try { const response = await app.inject('/test-error'); expect(response.statusCode).toBe(500); expect(response.json()).toMatchObject({ error: 'Internal server error' }); expect(response.body).not.toContain('sensitive'); }
    finally { await app.close(); }
  });
  it('loads active plans from the database', async () => {
    const db = fakeDb(); const app = await buildApp(config, db);
    try { expect((await app.inject('/api/v1/plans')).statusCode).toBe(200); expect(db.plan.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } })); }
    finally { await app.close(); }
  });
});
