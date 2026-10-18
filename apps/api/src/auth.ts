import { createHash, createHmac, randomBytes, timingSafeEqual, createPublicKey, verify } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiConfig } from '@shared-vps/runtime';
import type { PrismaClient } from '@shared-vps/database';
import { fail, SubscriptionEngine } from './engine.js';
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function validateInitData(raw: string, token: string, now = Date.now()) {
  if (!token || raw.length > 12000) fail(401, 'INVALID_INIT_DATA');
  const params = new URLSearchParams(raw);
  if (new Set(params.keys()).size !== [...params.keys()].length) fail(401, 'INVALID_INIT_DATA');
  const hash = params.get('hash') ?? ''; params.delete('hash');
  const data = [...params].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${k}=${v}`).join('\n');
  const key = createHmac('sha256', 'WebAppData').update(token).digest();
  const signature = createHmac('sha256', key).update(data).digest('hex');
  const age = Math.floor(now / 1000) - Number(params.get('auth_date'));
  if (!/^[a-f0-9]{64}$/.test(hash) || !equal(hash, signature) || !Number.isFinite(age) || age < -30 || age > 300) fail(401, 'INVALID_INIT_DATA');
  let user: { id?: number; is_bot?: boolean };
  try { user = JSON.parse(params.get('user') ?? '{}') as typeof user; } catch { return fail(401, 'INVALID_INIT_DATA'); }
  if (!Number.isSafeInteger(user.id) || user.id! <= 0 || user.is_bot) fail(401, 'INVALID_INIT_DATA');
  return String(user.id);
}
let cachedKeys: { until: number; keys: JsonWebKey[] } | undefined;
export async function validateLoginJwt(token: string, audience: string, nonce: string, keys?: JsonWebKey[]) {
  if (token.length > 16000) fail(401, 'INVALID_LOGIN');
  try {
    const parts = token.split('.'); if (parts.length !== 3) fail(401, 'INVALID_LOGIN');
    const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString()) as { alg?: string; kid?: string };
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') fail(401, 'INVALID_LOGIN');
    if (!keys) {
      if (!cachedKeys || cachedKeys.until < Date.now()) {
        const result = await fetch('https://oauth.telegram.org/.well-known/jwks.json', { signal: AbortSignal.timeout(8000) });
        if (!result.ok) fail(503, 'LOGIN_UNAVAILABLE');
        cachedKeys = { until: Date.now() + 3600000, keys: ((await result.json()) as { keys: JsonWebKey[] }).keys };
      }
      keys = cachedKeys.keys;
    }
    const key = keys.find(k => (k as JsonWebKey & { kid?: string }).kid === header.kid && k.kty === 'RSA');
    if (!key || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: key as import('node:crypto').JsonWebKey, format: 'jwk' }), Buffer.from(parts[2]!, 'base64url'))) fail(401, 'INVALID_LOGIN');
    const claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString()) as Record<string, unknown>;
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== 'https://oauth.telegram.org' || claims.aud !== audience || claims.nonce !== nonce || typeof claims.exp !== 'number' || claims.exp <= now || typeof claims.iat !== 'number' || claims.iat > now + 30 || now - claims.iat > 300 || !Number.isSafeInteger(claims.id) || Number(claims.id) <= 0 || typeof claims.sub !== 'string') fail(401, 'INVALID_LOGIN');
    return String(claims.id);
  } catch { return fail(401, 'INVALID_LOGIN'); }
}
export class Auth {
  constructor(private db: PrismaClient, private config: ApiConfig, private engine: SubscriptionEngine) {}
  cookieName() { return this.config.NODE_ENV === 'production' ? '__Host-sharedvps' : 'sharedvps'; }
  token(req: FastifyRequest) {
    const value = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(`${this.cookieName()}=`))?.split('=')[1] ?? '';
    return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : '';
  }
  cookie(reply: FastifyReply, token: string, maxAge = 604800) {
    reply.header('set-cookie', `${this.cookieName()}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${this.config.NODE_ENV === 'production' ? '; Secure' : ''}`);
  }
  async user(req: FastifyRequest, admin = false) {
    if (!this.token(req)) return fail(401, 'LOGIN_REQUIRED');
    const session = await this.db.session.findUnique({ where: { tokenHash: digest(this.token(req)) }, include: { user: true } });
    if (!session?.user || session.expiresAt < new Date() || session.user.status !== 'ACTIVE') return fail(401, 'LOGIN_REQUIRED');
    if (admin && session.user.role !== 'ADMIN') return fail(403, 'ADMIN_REQUIRED');
    return session.user;
  }
  async challenge(reply: FastifyReply) {
    if (!this.config.TELEGRAM_LOGIN_CLIENT_ID) fail(503, 'LOGIN_NOT_CONFIGURED');
    const token = randomBytes(32).toString('base64url'); const nonce = randomBytes(32).toString('hex');
    await this.db.session.create({ data: { tokenHash: digest(token), nonce, expiresAt: new Date(Date.now() + 300000) } });
    this.cookie(reply, token, 300);
    return { nonce, clientId: this.config.TELEGRAM_LOGIN_CLIENT_ID };
  }
  async login(req: FastifyRequest, reply: FastifyReply, body: { initData?: string; idToken?: string }) {
    const tokenHash = digest(this.token(req));
    let telegramId: string;
    let replayHash: string;
    if (body.initData) { telegramId = validateInitData(body.initData, this.config.TELEGRAM_BOT_TOKEN); replayHash = digest(body.initData); }
    else {
      const session = await this.db.session.findUnique({ where: { tokenHash } });
      if (!session?.nonce || session.expiresAt < new Date() || !body.idToken || !this.config.TELEGRAM_LOGIN_CLIENT_ID) return fail(401, 'INVALID_LOGIN');
      telegramId = await validateLoginJwt(body.idToken, this.config.TELEGRAM_LOGIN_CLIENT_ID, session.nonce);
      replayHash = digest(body.idToken);
    }
    const user = await this.engine.identity(telegramId, this.config.ADMIN_TELEGRAM_IDS);
    const token = randomBytes(32).toString('base64url');
    try {
      await this.db.$transaction(async tx => {
        await tx.authReplay.create({ data: { hash: replayHash, expiresAt: new Date(Date.now() + 600000) } });
        if (!body.initData) { const removed = await tx.session.deleteMany({ where: { tokenHash, nonce: { not: null } } }); if (!removed.count) fail(401, 'LOGIN_REPLAY'); }
        await tx.session.create({ data: { tokenHash: digest(token), userId: user.id, expiresAt: new Date(Date.now() + 604800000) } });
      });
    } catch { return fail(401, 'LOGIN_REPLAY'); }
    this.cookie(reply, token); return { id: user.id, role: user.role };
  }
}
