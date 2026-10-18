import { describe, expect, it } from 'vitest';
import { resolveApiBaseUrl } from '../config/api-url.js';
import { readMigrationUrl } from '../../../scripts/cloud-database-config.js';
describe('cloud URL boundaries', () => {
  it('keeps local development defaults', () => { expect(resolveApiBaseUrl(undefined, false)).toBe('http://127.0.0.1:3000'); });
  it('accepts a public HTTPS API origin', () => { expect(resolveApiBaseUrl('https://api.example.com/', true)).toBe('https://api.example.com'); });
  it.each([undefined, 'http://api.example.com', 'https://localhost', 'https://127.0.0.1:3000', 'https://10.0.0.1', 'https://host.docker.internal', 'https://api.example.com/path', 'https://user:secret@api.example.com', 'https://api.example.com?token=secret'])('rejects unsafe production API URL %s', value => {
    expect(() => resolveApiBaseUrl(value, true)).toThrow('VITE_API_BASE_URL');
  });
  it('requires direct SSL-enabled Neon migration access without leaking input', () => {
    const direct = 'postgresql://user:fake-secret@ep-demo.eu-central-1.aws.neon.tech/demo?sslmode=require';
    expect(readMigrationUrl({ MIGRATION_DATABASE_URL: direct })).toBe(direct);
    for (const value of [undefined, direct.replace('ep-demo.', 'ep-demo-pooler.'), direct.replace('?sslmode=require', ''), 'postgresql://user:private@localhost/demo']) {
      expect(() => readMigrationUrl({ MIGRATION_DATABASE_URL: value })).toThrow('Set MIGRATION_DATABASE_URL');
    }
  });
});
