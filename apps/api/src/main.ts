import { readApiConfig } from './config/index.js';
import { buildApp } from './app.js';
async function main() {
  const config = readApiConfig();
  const app = await buildApp(config);
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 25000).unref();
    try { await app.close(); } finally { clearTimeout(deadline); }
  };
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
  try {
    await app.listen({ host: config.API_HOST, port: config.API_PORT });
    void (app as unknown as { telegramBootstrap: () => Promise<void> }).telegramBootstrap().catch(() => app.log.warn('Telegram webhook setup pending; check configured bot and existing webhook'));
    void (app as unknown as { automation: () => Promise<void> }).automation();
  }
  catch { await app.close(); throw new Error('API startup failed. Check configured host and port.'); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'API startup failed'); process.exitCode = 1; });
