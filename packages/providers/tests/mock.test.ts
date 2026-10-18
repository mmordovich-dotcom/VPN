import { describe, expect, it } from 'vitest';
import { MockServerProvider, ServerNotFoundError } from '../src/index.js';
describe('MockServerProvider', () => {
  it('creates an isolated virtual server without connection credentials', async () => {
    const provider = new MockServerProvider();
    const server = await provider.createServer({ name: 'demo', capacity: 3 });
    expect(server).toMatchObject({ provider: 'MOCK', status: 'ACTIVE', capacity: 3 });
    expect(server.id).toMatch(/^mock-/); expect(server).not.toHaveProperty('ip'); expect(server).not.toHaveProperty('password');
  });
  it('returns a defensive copy of the created server', async () => {
    const provider = new MockServerProvider(); const server = await provider.createServer({ name: 'demo', capacity: 3 });
    const copy = await provider.getServer(server.id); copy.name = 'changed';
    expect((await provider.getServer(server.id)).name).toBe('demo');
  });
  it('throws for an unknown server', async () => { await expect(new MockServerProvider().getServer('missing')).rejects.toBeInstanceOf(ServerNotFoundError); });
  it('terminates idempotently and preserves the record', async () => {
    const provider = new MockServerProvider(); const server = await provider.createServer({ name: 'demo', capacity: 3 });
    await provider.terminateServer(server.id); await provider.terminateServer(server.id);
    expect((await provider.getServer(server.id)).status).toBe('TERMINATED');
    await expect(provider.terminateServer('missing')).rejects.toBeInstanceOf(ServerNotFoundError);
  });
  it.each([0, -1, 1.5, NaN])('rejects invalid capacity %s', async capacity => { await expect(new MockServerProvider().createServer({ name: 'demo', capacity })).rejects.toThrow('Invalid'); });
});
