import type { FastifyInstance } from 'fastify';
import { PROJECT_NAME, STAGE } from '@shared-vps/shared';
import type { SystemInfo } from '@shared-vps/shared';
export async function systemRoutes(app: FastifyInstance) {
  app.get('/system/info', async (): Promise<SystemInfo> => ({
    name: PROJECT_NAME, stage: STAGE, mode: 'demo',
    components: { api: 'available', database: 'check-ready', web: 'foundation', bot: 'optional', worker: 'foundation', serverProvider: 'mock' },
  }));
}
