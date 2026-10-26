import { describe, it, expect } from 'vitest';
import pino from 'pino';
import { loggerOptions } from '../src/logger.js';
describe('server secret redaction', () => {
  it('redacts session cookies, webhook headers, signed auth and configured secrets from structured logs', () => {
    const output: string[] = [];
    const secret = 'private-canary-never-log';
    const log = pino({ ...loggerOptions, base: null, timestamp: false }, { write(chunk: string) { output.push(chunk); } });
    log.info({ req: { headers: { authorization: secret, cookie: secret, 'x-telegram-bot-api-secret-token': secret }, body: { token: secret, code: secret } }, res: { headers: { 'set-cookie': secret } }, token: secret, leaseToken: secret, payload: { private:secret }, code: secret, password: secret, DATABASE_URL: secret, TELEGRAM_BOT_TOKEN: secret, TELEGRAM_WEBHOOK_SECRET: secret, idToken: secret, initData: secret }, 'safe status');
    expect(output.join('')).not.toContain(secret);
    expect(output.join('')).toContain('[REDACTED]');
    expect(output.join('')).toContain('safe status');
  });
});

