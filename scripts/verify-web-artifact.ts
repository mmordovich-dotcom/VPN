import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = new URL('../apps/web/dist/', import.meta.url);
const files = (await readdir(new URL('assets/', root))).filter(x => /\.(js|css)$/.test(x));
assert(files.some(x => x.endsWith('.js')), 'Missing compiled JavaScript');
const data = (await Promise.all(files.map(x => readFile(new URL(`assets/${x}`, root), 'utf8')))).join('\n');
for (const secret of [process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_WEBHOOK_SECRET, process.env.DATABASE_URL]) {
  if (secret && secret.length > 10) assert(!data.includes(secret), 'Server secret found in browser artifact');
}
assert(!data.includes('initDataUnsafe'), 'Untrusted Mini App profile used');
assert(!/localStorage\.(?:setItem|getItem)\((?!["']shared-vps-theme["'])/.test(data), 'Unexpected localStorage business state');
assert(!data.includes('127.0.0.1') && !data.includes('localhost'), 'Loopback address found in cloud artifact');
console.log('Browser artifact: no server secrets, loopback fallbacks or local business state.');
