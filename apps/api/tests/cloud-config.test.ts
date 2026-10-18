import { describe, expect, it } from 'vitest';
import { readApiConfig } from '@shared-vps/runtime';
const database = 'postgresql://test:test@ep-example.eu-central-1.aws.neon.tech/demo?sslmode=require';
const production = { DATABASE_URL: database, NODE_ENV: 'production', CORS_ORIGINS: 'https://web.example.com' };
describe('Render configuration', () => {
  it('uses provider PORT before API_PORT and binds all interfaces in production', () => {
    const config = readApiConfig({ ...production, PORT: '12345', API_PORT: '3000' });
    expect(config.API_PORT).toBe(12345); expect(config.API_HOST).toBe('0.0.0.0');
  });
  it('keeps the original local defaults and respects explicit host', () => {
    expect(readApiConfig({ DATABASE_URL: database })).toMatchObject({ API_PORT: 3000, API_HOST: '127.0.0.1' });
    expect(readApiConfig({ ...production, API_HOST: '127.0.0.1' }).API_HOST).toBe('127.0.0.1');
  });
  it.each(['', '0', '65536', 'invalid'])('rejects invalid provider port %s', PORT => {
    expect(() => readApiConfig({ ...production, PORT })).toThrow('PORT');
  });
  it('requires production CORS origins and encrypted remote PostgreSQL', () => {
    expect(() => readApiConfig({ ...production, CORS_ORIGINS: '*' })).toThrow('CORS_ORIGINS');
    expect(() => readApiConfig({ DATABASE_URL: database, NODE_ENV: 'production' })).toThrow('CORS_ORIGINS');
    expect(() => readApiConfig({ ...production, DATABASE_URL: database.replace('?sslmode=require', '') })).toThrow('DATABASE_URL');
  });
});
