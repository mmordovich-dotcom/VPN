import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import type { FastifyInstance } from 'fastify';
export async function staticRoutes(app: FastifyInstance) {
  const root = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
  const serve = async (path: string) => {
    const absolute = resolve(root, path);
    if (!absolute.startsWith(root.endsWith(sep) ? root : root + sep) || !types[extname(path)] || path.includes('..')) return null;
    try { return { bytes: await readFile(absolute), type: types[extname(path)]! }; } catch { return null; }
  };
  app.get('/', async (_req, reply) => {
    const file = await serve('index.html');
    if (!file) return reply.code(503).send({ error: 'Build the web workspace before serving the unified site' });
    reply.header('cache-control', 'no-store').header('x-content-type-options', 'nosniff').header('referrer-policy', 'no-referrer').header('cross-origin-opener-policy', 'same-origin-allow-popups');
    return reply.type(file.type).send(file.bytes);
  });
  app.get<{ Params: { '*': string } }>('/assets/*', async (req, reply) => {
    const file = await serve(`assets/${req.params['*']}`);
    if (!file) return reply.code(404).send({ error: 'Not found' });
    return reply.header('x-content-type-options', 'nosniff').type(file.type).send(file.bytes);
  });
}

