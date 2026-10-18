import { createDatabase } from '../src/index.js';
import { seedDatabase } from '../src/seed.js';
import { readDatabaseConfig, createLogger } from '@shared-vps/runtime';
const log = createLogger('seed');
async function main() {
  const config = readDatabaseConfig();
  log.level = config.LOG_LEVEL;
  const db = createDatabase(config.DATABASE_URL);
  try { const plan = await seedDatabase(db); log.info({ code: plan.code }, 'Demo data ready'); }
  finally { await db.$disconnect(); }
}
main().catch(() => { log.error('Seed failed. Check local database availability and migrations.'); process.exitCode = 1; });
