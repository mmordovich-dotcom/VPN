import { describe, expect, it } from 'vitest';
import { TELEGRAM_LOGIN_ORIGIN, telegramLoginMessage, telegramLoginUrl } from '../src/telegram-login.js';

describe('Telegram popup protocol', () => {
  const page = { origin: 'https://platform.example', pathname: '/' };
  const nonce = 'a'.repeat(64);
  it('sends the required origin separately from the redirect URI and preserves the nonce', () => {
    const url = new URL(telegramLoginUrl('8352222648', nonce, page));
    expect(url.origin).toBe(TELEGRAM_LOGIN_ORIGIN);
    expect(url.pathname).toBe('/auth');
    expect(url.searchParams.get('origin')).toBe(page.origin);
    expect(url.searchParams.get('redirect_uri')).toBe(page.origin + '/');
    expect(url.searchParams.get('response_type')).toBe('post_message');
    expect(url.searchParams.get('scope')).toBe('openid profile');
    expect(url.searchParams.get('nonce')).toBe(nonce);
    expect(url.hash).toBe('');
  });
  it('rejects invalid caller configuration instead of opening an arbitrary destination', () => {
    for (const origin of ['javascript:alert(1)', 'https://user:pass@platform.example', 'https://platform.example/path']) {
      expect(() => telegramLoginUrl('8352222648', nonce, { ...page, origin })).toThrow();
    }
    expect(() => telegramLoginUrl('bad', nonce, page)).toThrow();
    expect(() => telegramLoginUrl('8352222648', 'bad', page)).toThrow();
    expect(() => telegramLoginUrl('8352222648', nonce, { ...page, pathname: '//other.example' })).toThrow();
  });
  it('ignores forged messages from other origins or other windows', () => {
    const popup = {};
    const event = { origin: TELEGRAM_LOGIN_ORIGIN, source: popup, data: { event: 'auth_result', result: 'signed.jwt.token' } };
    expect(telegramLoginMessage({ ...event, origin: 'https://attacker.example' }, popup)).toBeNull();
    expect(telegramLoginMessage({ ...event, source: {} }, popup)).toBeNull();
    expect(telegramLoginMessage(event, null)).toBeNull();
    expect(telegramLoginMessage(event, popup)).toEqual({ id_token: 'signed.jwt.token' });
  });
  it('accepts the official JSON message envelope but ignores malformed or unrelated messages', () => {
    const popup = {};
    const event = { origin: TELEGRAM_LOGIN_ORIGIN, source: popup, data: JSON.stringify({ event: 'auth_result', result: 'signed.jwt.token' }) };
    expect(telegramLoginMessage(event, popup)).toEqual({ id_token: 'signed.jwt.token' });
    for (const data of ['{', null, { event: 'other', result: 'token' }, { event: 'auth_result', result: {} }, { event: 'auth_result', result: 'x'.repeat(16001) }]) {
      expect(telegramLoginMessage({ ...event, data }, popup)).toBeNull();
    }
    expect(telegramLoginMessage({ ...event, data: { event: 'auth_result', error: 'cancelled' } }, popup)).toEqual({ error: 'Telegram login was not confirmed' });
  });
});
