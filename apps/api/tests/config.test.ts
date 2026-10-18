import { describe, it, expect } from 'vitest';
import { readApiConfig, readBotConfig } from '@shared-vps/runtime';
const base = { DATABASE_URL: 'postgresql://demo:demo@127.0.0.1:5432/demo' };
describe('environment validation', () => {
  it('applies defaults and parses port and origin lists', () => {
    const result = readApiConfig({ ...base, API_PORT: '3100', CORS_ORIGINS: 'http://localhost:5173, http://127.0.0.1:5173' });
    expect(result.API_PORT).toBe(3100); expect(result.CORS_ORIGINS).toHaveLength(2); expect(result.APP_MODE).toBe('demo');
  });
  it.each([{ API_PORT: 'invalid' }, { API_PORT: '65536' }, { DATABASE_URL: 'https://example.com' }, { CORS_ORIGINS: '*' }, { CORS_ORIGINS: 'http://localhost:5173/path' }, { APP_MODE: 'live' }])('rejects invalid config %j', invalid => {
    expect(() => readApiConfig({ ...base, ...invalid })).toThrow('Invalid environment variables');
  });
  it('never prints invalid secret input in validation errors', () => {
    expect(() => readApiConfig({ DATABASE_URL: 'top-secret-password' })).toThrow('Invalid environment variables: DATABASE_URL');
  });
  it('allows a disabled bot without database configuration', () => { expect(readBotConfig({}).TELEGRAM_BOT_TOKEN).toBe(''); });
});
