import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readMigrationUrl } from './cloud-database-config.js';
// Explicitly invoked by the manual cloud workflow, never by HTTP or startup.
try {
  const url = readMigrationUrl(process.env);
  const env = { ...process.env, DATABASE_URL: url, APP_MODE: 'demo' };
  const cwd = fileURLToPath(new URL('../packages/database', import.meta.url));
  const cli = fileURLToPath(new URL('../packages/database/node_modules/prisma/build/index.js', import.meta.url));
  const migration = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], { cwd, env, encoding: 'utf8', timeout: 180000 });
  if (migration.status !== 0) throw new Error('Migration failed');
  console.log('Saved migrations deployed successfully.');
  const tsx = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
  const seed = spawnSync(process.execPath, [tsx, 'prisma/seed.ts'], { cwd, env, encoding: 'utf8', timeout: 60000 });
  if (seed.status !== 0) throw new Error('Seed failed');
  console.log('Demo seed completed. Existing plans and settings preserved.');
} catch {
  // Avoid echoing child output: driver errors may contain fragments of URLs.
  console.error('Cloud database step failed. Check the protected direct Neon URL, SSL, permissions and migration state. No reset was attempted.');
  process.exitCode = 1;
}
