import { describe, expect, it } from 'vitest';
import { takeLoginLink, validPending } from '../src/bot-login.js';
describe('bot login browser recovery and credential removal', () => {
  it('removes a one-time link from the URL synchronously, before third-party loading', () => {
    const token = 'a'.repeat(43); const calls: string[] = [];
    expect(takeLoginLink({ hash: `#login=${token}`, pathname: '/', search: '' }, { replaceState(_data, _unused, url) { calls.push(url); } })).toBe(token);
    expect(calls).toEqual(['/#/login']); expect(calls.join()).not.toContain(token);
  });
  it('also strips malformed credentials, but preserves ordinary navigation', () => {
    const calls: string[] = []; const history = { replaceState(_data: unknown, _unused: string, url: string) { calls.push(url); } };
    expect(takeLoginLink({ hash: '#login=bad', pathname: '/', search: '' }, history)).toBe('');
    expect(takeLoginLink({ hash: '#/subscriptions', pathname: '/', search: '' }, history)).toBeNull();
    expect(calls).toEqual(['/#/login']);
  });
  it('restores only well-formed requests addressed to the configured bot', () => {
    const pending = { requestId: '11111111-1111-4111-8111-111111111111', displayCode: '123456', expiresAt: new Date(Date.now() + 300000).toISOString(), deepLink: `https://t.me/vpnaxon_bot?start=login_${'A'.repeat(43)}` };
    expect(validPending(pending, 'vpnaxon_bot')).toBe(true);
    for (const patch of [{ deepLink: 'javascript:alert(1)' }, { deepLink: pending.deepLink.replace('vpnaxon_bot', 'another_bot') }, { requestId: '<script>' }, { displayCode: '123' }, { expiresAt: 'invalid' }]) expect(validPending({ ...pending, ...patch }, 'vpnaxon_bot')).toBe(false);
    expect(validPending(pending, null)).toBe(false);
  });
});
