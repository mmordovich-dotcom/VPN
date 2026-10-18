import { createDatabase } from '@shared-vps/database';
import { createLogger, readDatabaseConfig } from '@shared-vps/runtime';
import { runTasks } from './runner.js';
const log = createLogger('worker');
async function main() {
  const config = readDatabaseConfig();
  log.level = config.LOG_LEVEL;
  const db = createDatabase(config.DATABASE_URL);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await db.$connect();
    await db.$queryRaw`SELECT 1`;
    await runTasks([], controller.signal);
    log.info('Database connected. Stage 1.2 recovery runs inside the API service; standalone legacy worker finished.');
  } finally { await db.$disconnect(); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}
main().catch(() => { log.error('Worker startup failed. Check DATABASE_URL and PostgreSQL.'); process.exitCode = 1; });
