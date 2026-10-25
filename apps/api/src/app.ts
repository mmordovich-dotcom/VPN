import { platformRoutes } from './platform.js';
import { staticRoutes } from './static.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createDatabase } from '@shared-vps/database';
import { loggerOptions } from '@shared-vps/runtime';
import type { ApiConfig } from '@shared-vps/runtime';
import type { ApiDatabase } from './plugins/database.js';
import { registerErrors } from './plugins/errors.js';
import { healthRoutes } from './routes/health.js';
import { systemRoutes } from './routes/system.js';
import { planRoutes } from './modules/plans/routes.js';
export async function buildApp(config: ApiConfig, injectedDb?: ApiDatabase) {
  const app = Fastify({ logger: { ...loggerOptions, level: config.LOG_LEVEL, serializers: { req: req => ({ method: req.method, url: String(req.url).split('?')[0] ?? '', hostname: req.hostname, remoteAddress: req.ip }) } }, ajv: { customOptions: { removeAdditional: false } }, requestTimeout: 10000, bodyLimit: 65536 });
  const db = injectedDb ?? createDatabase(config.DATABASE_URL);
  if (!injectedDb) app.addHook('onClose', async () => { await db.$disconnect(); });
  registerErrors(app);
  await app.register(cors, { origin: config.CORS_ORIGINS, methods: ['GET', 'POST'], credentials: true, allowedHeaders: ['content-type', 'x-shared-vps'] });
  await app.register(async routes => { await healthRoutes(routes, db); });
  await app.register(async routes => { await systemRoutes(routes); await planRoutes(routes, db); }, { prefix: '/api/v1' });
  const platform = await platformRoutes(app, db, config);
  await staticRoutes(app);
  app.decorate('automation', platform.run);
  app.decorate('telegramBootstrap', () => platform.telegram.bootstrap());
  return app;
}
