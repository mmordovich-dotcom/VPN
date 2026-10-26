import { describe, it, expect } from 'vitest';
import { escapeHtml, selectedTab, appRoute, daysRemaining, publicHero, statusBadge } from '../src/axon-ui.js';
describe('AXON navigation and safe views', () => {
  it('maps secondary routes into the correct mobile tabs', () => { expect(selectedTab('/connect')).toBe('/subscriptions'); expect(selectedTab('/renew')).toBe('/subscriptions'); expect(selectedTab('/notifications')).toBe('/profile'); expect(selectedTab('/history')).toBe('/orders'); });
  it('keeps Telegram launch parameters out of the application route', () => { expect(appRoute('#/orders?tgWebAppData=fixture')).toBe('/orders'); expect(appRoute('#tgWebAppData=fixture')).toBe('/'); expect(appRoute('#/missing')).toBe('/missing'); });
  it('escapes data used in HTML, including status names', () => { expect(escapeHtml('<img src=x onerror="bad()">')).not.toContain('<img'); expect(statusBadge('<script>')).not.toContain('<script>'); });
  it('uses deterministic remaining days for missing, expired and extended subscriptions', () => { const now=Date.parse('2026-10-26T00:00:00Z'); expect(daysRemaining(null,now)).toBe(0); expect(daysRemaining('bad',now)).toBe(0); expect(daysRemaining('2026-10-25',now)).toBe(0); expect(daysRemaining('2026-12-25T00:00:00Z',now)).toBe(60); });
  it('makes the demonstration boundary visible without inventing a live VPN promise', () => { const html=publicHero('vpnaxon_bot'); expect(html).toContain('списание 0 ₽'); expect(html).toContain('виртуальные серверы'); expect(html).toContain('https://t.me/vpnaxon_bot'); expect(publicHero(null)).not.toContain('t.me/null'); });
});
