import { createHmac, randomBytes, randomInt } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient, Prisma } from '@shared-vps/database';
import type { ApiConfig } from '@shared-vps/runtime';
import { Auth, digest, equal } from './auth.js';
import { fail, SubscriptionEngine } from './engine.js';

type Tx = Prisma.TransactionClient;
const lifetime = 300000;
const validToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);
const cookieValue = (req: FastifyRequest, name: string) => req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? '';

/** Called only by the secret-authenticated Telegram webhook, never with a browser-supplied identity. */
export class BotLogin {
  private auth: Auth;
  constructor(private db: PrismaClient, private config: ApiConfig, private engine: SubscriptionEngine) { this.auth = new Auth(db, config, engine); }
  available() { return Boolean(this.config.TELEGRAM_BOT_TOKEN && this.config.TELEGRAM_WEBHOOK_SECRET && this.config.TELEGRAM_BOT_USERNAME); }
  proofName() { return this.config.NODE_ENV === 'production' ? '__Host-sharedvps-login' : 'sharedvps-login'; }
  proof(req: FastifyRequest) { const token = cookieValue(req, this.proofName()); return validToken(token) ? token : ''; }
  bind(req: FastifyRequest, reply: FastifyReply) {
    const token = this.proof(req) || randomBytes(32).toString('base64url');
    reply.header('set-cookie', `${this.proofName()}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${this.config.NODE_ENV === 'production' ? '; Secure' : ''}`);
    return digest(token);
  }
  requireProof(req: FastifyRequest) { const token = this.proof(req); if (!token) fail(401, 'AUTH_REQUEST_UNAVAILABLE'); return digest(token); }
  private enabled() { if (!this.available()) fail(503, 'BOT_LOGIN_NOT_CONFIGURED'); }
  private async lock<T>(fn: (tx: Tx) => Promise<T>) {
    return this.db.$transaction(async tx => { await tx.$queryRaw`SELECT pg_advisory_xact_lock(12502026)::text`; return fn(tx); }, { maxWait: 10000, timeout: 15000 });
  }
  // Persistent atomic counters apply across restarts/replicas. Never trust client X-Forwarded-For.
  private async limit(scopes: { scope: string; max: number; window: number }[]) {
    const now = Date.now();
    const counters = await Promise.all(scopes.map(({ scope, window }) => this.db.authLimit.upsert({
      where: { key: digest(`${scope}:${Math.floor(now / window)}`) },
      update: { attempts: { increment: 1 } },
      create: { key: digest(`${scope}:${Math.floor(now / window)}`), attempts: 1, expiresAt: new Date(now + window) },
    })));
    if (counters.some((counter, i) => counter.attempts > scopes[i]!.max)) fail(429, 'AUTH_RATE_LIMITED');
  }
  private async browserLimit(req: FastifyRequest, purpose: string, max: number, window = lifetime) {
    await this.limit([{ scope: `${purpose}:ip:${req.ip}`, max, window }, { scope: `${purpose}:browser:${this.proof(req) || req.ip}`, max, window }]);
  }
  private async createRequest(tx: Tx, browserHash: string, expected?: { userId: string; telegramId: string }) {
    const token = randomBytes(32).toString('base64url');
    const request = await tx.loginRequest.create({ data: { tokenHash: digest(token), browserHash, displayCode: String(randomInt(100000, 1000000)),
      ...(expected ?? {}), status: expected ? 'CLAIMED' : 'PENDING', expiresAt: new Date(Date.now() + lifetime) } });
    return { requestId: request.id, displayCode: request.displayCode, expiresAt: request.expiresAt.toISOString(),
      deepLink: `https://t.me/${this.config.TELEGRAM_BOT_USERNAME}?start=login_${token}` };
  }
  async request(req: FastifyRequest, reply: FastifyReply) {
    this.enabled(); await this.browserLimit(req, 'create', 10);
    const binding = this.bind(req, reply);
    return this.lock(tx => this.createRequest(tx, binding));
  }
  async status(req: FastifyRequest, id: string) {
    const binding = this.requireProof(req);
    await this.browserLimit(req, 'poll', 120, 60000);
    const request = await this.db.loginRequest.findUnique({ where: { id } });
    if (!request || !equal(request.browserHash, binding)) fail(404, 'AUTH_REQUEST_UNAVAILABLE');
    return { status: request.expiresAt <= new Date() ? 'EXPIRED' : request.status, displayCode: request.displayCode, expiresAt: request.expiresAt.toISOString() };
  }
  async cancel(req: FastifyRequest, id: string) {
    const binding = this.requireProof(req);
    await this.lock(async tx => {
      const request = await tx.loginRequest.findUnique({ where: { id } });
      if (!request || !equal(request.browserHash, binding)) return;
      if (request.sessionHash) await tx.session.deleteMany({ where: { tokenHash: request.sessionHash } });
      await tx.loginRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
    });
    return { ok: true };
  }
  async cancelBrowser(req: FastifyRequest, reply: FastifyReply) {
    if (this.proof(req)) await this.lock(async tx => {
      const browserHash = digest(this.proof(req));
      const issued = await tx.loginRequest.findMany({ where: { browserHash, sessionHash: { not: null } }, select: { sessionHash: true } });
      const hashes = issued.flatMap(row => row.sessionHash ? [row.sessionHash] : []);
      if (hashes.length) await tx.session.deleteMany({ where: { tokenHash: { in: hashes } } });
      await tx.loginRequest.updateMany({ where: { browserHash, status: { in: ['PENDING', 'CLAIMED', 'APPROVED', 'CONSUMED'] } }, data: { status: 'CANCELLED' } });
    });
    reply.header('set-cookie', [`${this.proofName()}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${this.config.NODE_ENV === 'production' ? '; Secure' : ''}`]);
  }
  async claim(tokenHash: string, telegramId: string) {
    const user = await this.engine.identity(telegramId, this.config.ADMIN_TELEGRAM_IDS);
    return this.lock(async tx => {
      const request = await tx.loginRequest.findUnique({ where: { tokenHash } });
      if (!request || request.expiresAt <= new Date() || !['PENDING', 'CLAIMED'].includes(request.status)
        || request.telegramId && request.telegramId !== telegramId) fail(409, 'AUTH_REQUEST_UNAVAILABLE');
      await tx.loginRequest.update({ where: { id: request.id }, data: { status: 'CLAIMED', telegramId, userId: user.id } });
      return { requestId: request.id, displayCode: request.displayCode };
    });
  }
  async confirm(id: string, telegramId: string, approved: boolean) {
    return this.lock(async tx => {
      const request = await tx.loginRequest.findUnique({ where: { id } });
      if (!request || request.expiresAt <= new Date() || request.telegramId !== telegramId
        || !['CLAIMED', 'APPROVED'].includes(request.status)) fail(409, 'AUTH_REQUEST_UNAVAILABLE');
      await tx.loginRequest.update({ where: { id }, data: { status: approved ? 'APPROVED' : 'CANCELLED' } });
      return { approved };
    });
  }
  private async session(tx: Tx, req: FastifyRequest, userId: string, token: string) {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') fail(401, 'AUTH_INVALID');
    const current = this.auth.token(req) ? await tx.session.findUnique({ where: { tokenHash: digest(this.auth.token(req)) } }) : null;
    if (current?.userId && current.expiresAt > new Date() && current.userId !== userId) fail(409, 'AUTH_LOGOUT_FIRST');
    await tx.session.create({ data: { tokenHash: digest(token), userId, expiresAt: new Date(Date.now() + 604800000) } });
    // Rotation revokes only the session presented by this browser, keeping other devices signed in.
    if (current?.userId) await tx.session.deleteMany({ where: { tokenHash: current.tokenHash } });
    return { id: user.id, role: user.role };
  }
  async complete(req: FastifyRequest, reply: FastifyReply, id: string) {
    const binding = this.requireProof(req); await this.browserLimit(req, 'complete', 15);
    const token = randomBytes(32).toString('base64url');
    const user = await this.lock(async tx => {
      const request = await tx.loginRequest.findUnique({ where: { id } });
      if (!request || !equal(request.browserHash, binding) || request.expiresAt <= new Date() || request.status !== 'APPROVED' || !request.userId) fail(401, 'AUTH_INVALID');
      const result = await this.session(tx, req, request.userId, token);
      await tx.loginRequest.update({ where: { id }, data: { status: 'CONSUMED', sessionHash: digest(token) } });
      return result;
    });
    this.auth.cookie(reply, token); return user;
  }
  codeHash(code: string) { return createHmac('sha256', this.config.TELEGRAM_BOT_TOKEN).update(`shared-vps-login-code:${code}`).digest('hex'); }
  async issue(telegramId: string, kind: 'LINK' | 'CODE', operationKey: string) {
    this.enabled();
    if (!this.config.PUBLIC_ORIGIN) fail(503, 'BOT_LOGIN_NOT_CONFIGURED');
    await this.limit([{ scope: `issue:${kind}:${telegramId}`, max: 3, window: lifetime }]);
    const user = await this.engine.identity(telegramId, this.config.ADMIN_TELEGRAM_IDS);
    return this.lock(async tx => {
      if (await tx.loginGrant.findUnique({ where: { operationKey } })) return null;
      let secret = ''; let tokenHash = '';
      for (let attempt = 0; attempt < 10; attempt++) {
        secret = kind === 'CODE' ? String(randomInt(0, 100000000)).padStart(8, '0') : randomBytes(32).toString('base64url');
        tokenHash = kind === 'CODE' ? this.codeHash(secret) : digest(secret);
        if (!await tx.loginGrant.findUnique({ where: { tokenHash } })) break;
        if (attempt === 9) fail(503, 'AUTH_UNAVAILABLE');
      }
      await tx.loginGrant.updateMany({ where: { userId: user.id, kind, consumedAt: null }, data: { consumedAt: new Date() } });
      await tx.loginGrant.create({ data: { tokenHash, userId: user.id, kind, operationKey, expiresAt: new Date(Date.now() + (kind === 'LINK' ? 180000 : lifetime)) } });
      return kind === 'CODE' ? { code: secret } : { url: `${this.config.PUBLIC_ORIGIN}/#login=${secret}` };
    });
  }
  async code(req: FastifyRequest, reply: FastifyReply, code: string) {
    this.enabled();
    await this.browserLimit(req, 'code', 8);
    await this.limit([{ scope: `code:value:${this.codeHash(code)}`, max: 5, window: lifetime }, { scope: 'code:global', max: 100, window: lifetime }]);
    if (!/^\d{8}$/.test(code)) fail(401, 'AUTH_INVALID');
    const token = randomBytes(32).toString('base64url');
    const user = await this.lock(async tx => {
      const grant = await tx.loginGrant.findUnique({ where: { tokenHash: this.codeHash(code) } });
      if (!grant || grant.kind !== 'CODE' || grant.consumedAt || grant.expiresAt <= new Date()) fail(401, 'AUTH_INVALID');
      const result = await this.session(tx, req, grant.userId, token);
      await tx.loginGrant.update({ where: { id: grant.id }, data: { consumedAt: new Date() } });
      return result;
    });
    this.auth.cookie(reply, token); return user;
  }
  async link(req: FastifyRequest, reply: FastifyReply, token: string) {
    this.enabled(); await this.browserLimit(req, 'link', 8);
    if (!validToken(token)) fail(401, 'AUTH_INVALID');
    const binding = this.bind(req, reply);
    return this.lock(async tx => {
      const grant = await tx.loginGrant.findUnique({ where: { tokenHash: digest(token) }, include: { user: { include: { identities: true } } } });
      if (!grant || grant.kind !== 'LINK' || grant.consumedAt || grant.expiresAt <= new Date() || grant.user.status !== 'ACTIVE') fail(401, 'AUTH_INVALID');
      const telegramId = grant.user.identities.find(i => i.provider === 'TELEGRAM')?.providerUserId;
      if (!telegramId) fail(401, 'AUTH_INVALID');
      await tx.loginGrant.update({ where: { id: grant.id }, data: { consumedAt: new Date() } });
      return this.createRequest(tx, binding, { userId: grant.userId, telegramId });
    });
  }
  async cleanup() {
    const before = new Date(Date.now() - 86400000);
    await this.db.authLimit.deleteMany({ where: { expiresAt: { lt: before } } });
    await this.db.loginRequest.deleteMany({ where: { expiresAt: { lt: before } } });
    await this.db.loginGrant.deleteMany({ where: { expiresAt: { lt: before } } });
  }
}
