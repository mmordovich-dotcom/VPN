import { config } from 'dotenv';
import { z } from 'zod';
config({ path: new URL('../../../.env', import.meta.url) });

function hasProtocol(value: string, protocols: string[]): boolean {
  try { return protocols.includes(new URL(value).protocol); } catch { return false; }
}
const httpUrl = z.string().url().refine(value => hasProtocol(value, ['http:', 'https:']));
const origin = httpUrl.refine(value => {
  try { return new URL(value).origin === value; } catch { return false; }
}, 'Expected an origin without path or trailing slash');
const dbUrl = z.string().url().refine(value => hasProtocol(value, ['postgresql:', 'postgres:']));
const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_MODE: z.literal('demo').default('demo'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});
const databaseSchema = baseSchema.extend({ DATABASE_URL: dbUrl });
const apiSchema = databaseSchema.extend({
  PUBLIC_ORIGIN: origin.optional(),
  TELEGRAM_BOT_TOKEN: z.string().trim().default(''),
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/).optional(),
  TELEGRAM_LOGIN_CLIENT_ID: z.string().regex(/^\d+$/).optional(),
  TELEGRAM_BOT_USERNAME: z.string().regex(/^[A-Za-z0-9_]{5,32}$/).optional(),
  ADMIN_TELEGRAM_IDS: z.string().default('').transform(v => v.split(',').map(x => x.trim()).filter(Boolean)),
  API_HOST: z.string().min(1).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173')
    .transform(value => value.split(',').map(item => item.trim()).filter(Boolean))
    .pipe(z.array(origin).min(1)),
});
const cloudApiSchema = apiSchema.superRefine((value, ctx) => {
  if (value.NODE_ENV !== 'production') return;
  if (value.PUBLIC_ORIGIN && (!value.PUBLIC_ORIGIN.startsWith('https://') || !value.CORS_ORIGINS.includes(value.PUBLIC_ORIGIN))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['PUBLIC_ORIGIN'], message: 'Canonical HTTPS origin must be explicitly allowed' });
  }
  if (value.CORS_ORIGINS.some(item => {
    try { return !item.startsWith('https://') || ['localhost', '127.0.0.1', '[::1]'].includes(new URL(item).hostname); }
    catch { return true; }
  })) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['CORS_ORIGINS'], message: 'Production requires explicit HTTPS browser origins' });
  }
  let url: URL;
  try { url = new URL(value.DATABASE_URL); } catch { return; }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !['require', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['DATABASE_URL'], message: 'Remote production database requires SSL' });
  }
}).transform(value => ({ ...value,
  API_PORT: value.PORT ?? value.API_PORT,
  API_HOST: value.API_HOST ?? (value.NODE_ENV === 'production' || value.PORT !== undefined ? '0.0.0.0' : '127.0.0.1'),
}));
const botSchema = baseSchema.extend({
  TELEGRAM_BOT_TOKEN: z.string().trim().default(''),
  API_BASE_URL: httpUrl.default('http://127.0.0.1:3000'),
  WEB_APP_URL: httpUrl.default('http://localhost:5173'),
});
function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, env: unknown): T {
  const result = schema.safeParse(env);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map(issue => issue.path.join('.')))];
    throw new Error(`Invalid environment variables: ${fields.join(', ')}`);
  }
  return result.data;
}
export const readApiConfig = (env: unknown = process.env) => parse(cloudApiSchema, env);
export const readDatabaseConfig = (env: unknown = process.env) => parse(databaseSchema, env);
export const readBotConfig = (env: unknown = process.env) => parse(botSchema, env);
export type ApiConfig = ReturnType<typeof readApiConfig>;
