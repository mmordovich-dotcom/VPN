import { describe, expect, it } from 'vitest';
import { loginAction } from '../src/bot-login-updates.js';
import { digest, equal } from '../src/auth.js';
import { TelegramGateway } from '../src/telegram.js';
import { SubscriptionEngine } from '../src/engine.js';
import { readApiConfig } from '@shared-vps/runtime';
import type { PrismaClient } from '@shared-vps/database';
describe('verified Telegram login command parsing', () => {
  it('hashes a deep-link capability before durable storage', () => {
    const token = 'A'.repeat(43);
    const action = loginAction(`/start login_${token}`);
    expect(action).toEqual({ type: 'CLAIM', tokenHash: digest(token) });
    expect(JSON.stringify(action)).not.toContain(token);
    expect(loginAction('/start login_bad')).toEqual({ type: 'INVALID' });
  });
  it('keeps login callbacks separate from demo-purchase callbacks', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(loginAction(`login:yes:${id}`)).toEqual({ type: 'CONFIRM', requestId: id });
    expect(loginAction(`login:no:${id}`)).toEqual({ type: 'CANCEL', requestId: id });
    expect(loginAction(`confirm:${id}`)).toBeUndefined();
    expect(loginAction('/start')).toBeUndefined();
    expect(loginAction('/start code')).toEqual({ type: 'CODE' });
    expect(loginAction('/login')).toEqual({ type: 'LINK' });
  });
  it('rejects mismatched webhook secrets without Unicode length exceptions', () => {
    expect(equal('é', 'a')).toBe(false); expect(equal('a', 'a')).toBe(true);
  });
});
describe('existing-bot webhook bootstrap', () => {
  const config = readApiConfig({ DATABASE_URL: 'postgresql://demo:demo@127.0.0.1:5432/demo', TELEGRAM_BOT_TOKEN: '123456:fake', TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(40), TELEGRAM_BOT_USERNAME: 'vpnaxon_bot', PUBLIC_ORIGIN: 'https://platform.example' });
  const db = {} as PrismaClient;
  it('does not replace an unrelated webhook or a mismatched bot', async () => {
    const calls: string[] = [];
    const gateway = new TelegramGateway(db, config, new SubscriptionEngine(db), async method => { calls.push(method); return method === 'getMe' ? { username: 'vpnaxon_bot' } : { url: 'https://another.example/webhook' }; });
    await expect(gateway.bootstrap()).rejects.toMatchObject({ code: 'WEBHOOK_IN_USE' });
    expect(calls).not.toContain('setWebhook');
    const wrong = new TelegramGateway(db, config, new SubscriptionEngine(db), async () => ({ username: 'other_bot' }));
    await expect(wrong.bootstrap()).rejects.toMatchObject({ code: 'BOT_USERNAME_MISMATCH' });
  });
  it('registers the existing bot without discarding pending updates', async () => {
    const calls: { method: string; body: Record<string, unknown> }[] = [];
    const gateway = new TelegramGateway(db, config, new SubscriptionEngine(db), async (method, body) => { calls.push({ method, body }); return method === 'getMe' ? { username: 'vpnaxon_bot' } : { url: '' }; });
    await gateway.bootstrap();
    expect(calls.at(-1)).toMatchObject({ method: 'setWebhook', body: { url: 'https://platform.example/api/v1/telegram/webhook', drop_pending_updates: false } });
  });
});
