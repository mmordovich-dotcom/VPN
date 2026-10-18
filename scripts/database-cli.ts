import { spawnSync } from 'node:child_process';
import { readDatabaseConfig } from '../packages/runtime/dist/index.js';
try {
  const config = readDatabaseConfig();
  const cli = new URL('../packages/database/node_modules/prisma/build/index.js', import.meta.url);
  const { fileURLToPath } = await import('node:url');
  const result = spawnSync(process.execPath, [fileURLToPath(cli), ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, DATABASE_URL: config.DATABASE_URL },
  });
  process.exitCode = result.status ?? 1;
} catch { console.error('Database configuration invalid. Check DATABASE_URL in the root .env.'); process.exitCode = 1; }
