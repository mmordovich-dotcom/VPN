import { RELEASE } from '@shared-vps/shared';
import type { FastifyInstance } from 'fastify';
import type { ApiDatabase } from '../plugins/database.js';
export async function healthRoutes(app: FastifyInstance, db: ApiDatabase) {
  app.get('/health', async () => ({ status: 'ok', service: 'shared-vps-api', ...RELEASE }));
  app.get('/ready', async (_request, reply) => {
    try { await db.$queryRaw`SELECT 1`; return { status: 'ok', database: 'available' }; }
    catch { return reply.code(503).send({ status: 'unavailable', error: 'Database unavailable' }); }
  });
}
