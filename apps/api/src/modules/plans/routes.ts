import type { FastifyInstance } from 'fastify';
import type { ApiDatabase } from '../../plugins/database.js';
export async function planRoutes(app: FastifyInstance, db: ApiDatabase) {
  app.get('/plans', async (_request, reply) => {
    try {
      return await db.plan.findMany({ where: { isActive: true }, orderBy: { price: 'asc' },
        select: { id: true, code: true, name: true, price: true, currency: true, durationDays: true } });
    } catch { return reply.code(503).send({ error: 'Catalog temporarily unavailable' }); }
  });
}
