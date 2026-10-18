import { it, expect, vi, afterEach } from 'vitest';
import { ApiClient } from '../src/services/api-client.js';
afterEach(() => vi.unstubAllGlobals());
it('uses the shared Backend API', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok', service: 'shared-vps-api', stage: '1.1' })));
  vi.stubGlobal('fetch', fetcher);
  expect((await new ApiClient('http://127.0.0.1:3000').health()).status).toBe('ok');
  expect(String(fetcher.mock.calls[0]?.[0])).toBe('http://127.0.0.1:3000/health');
});
it('rejects an unavailable backend', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
  await expect(new ApiClient('http://127.0.0.1:3000').health()).rejects.toThrow('Backend unavailable');
});
