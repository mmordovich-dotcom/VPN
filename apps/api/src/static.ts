import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { LEGAL_PAGE_PATHS, LEGAL_DOCUMENTS, legalIdForPath, approvedLegal } from '@shared-vps/shared';
export async function staticRoutes(app: FastifyInstance) {
  const root = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg' };
  const serve = async (path: string) => {
    const absolute = resolve(root, path);
    if (!absolute.startsWith(root.endsWith(sep) ? root : root + sep) || !types[extname(path)] || path.includes('..')) return null;
    try { return { bytes: await readFile(absolute), type: types[extname(path)]! }; } catch { return null; }
  };
  const index = async (reply:FastifyReply) => {
    const file = await serve('index.html');
    if (!file) return reply.code(503).send({ error: 'Build the web workspace before serving the unified site' });
    reply.header('cache-control', 'no-store').header('x-content-type-options', 'nosniff').header('referrer-policy', 'no-referrer').header('cross-origin-opener-policy', 'same-origin-allow-popups');
    return reply.type(file.type).send(file.bytes);
  };
  app.get('/', async (_req, reply) => index(reply));
  for(const path of LEGAL_PAGE_PATHS){for(const route of [path,path+'/'])app.get(route,async(_req,reply)=>{
    const id=legalIdForPath(path),document=LEGAL_DOCUMENTS.find(d=>d.id===id);
    if(!document||!approvedLegal(document))reply.header('x-robots-tag','noindex, nofollow');
    return index(reply);
  });}
  app.get<{ Params: { '*': string } }>('/assets/*', async (req, reply) => {
    const file = await serve(`assets/${req.params['*']}`);
    if (!file) return reply.code(404).send({ error: 'Not found' });
    return reply.header('x-content-type-options', 'nosniff').type(file.type).send(file.bytes);
  });
}

