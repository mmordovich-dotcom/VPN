type User = { id: string; role: string };
type Api = <T>(path: string, body?: unknown) => Promise<T>;
type Pending = { requestId: string; displayCode: string; expiresAt: string; deepLink: string };
const storageKey = 'shared-vps-pending-login';
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function validPending(value: unknown, username: string | null): value is Pending {
  if (!value || typeof value !== 'object' || !username) return false;
  const p = value as Pending;
  return typeof p.requestId === 'string' && /^[0-9a-f-]{36}$/i.test(p.requestId)
    && typeof p.displayCode === 'string' && /^\d{6}$/.test(p.displayCode)
    && typeof p.expiresAt === 'string' && Number.isFinite(Date.parse(p.expiresAt))
    && typeof p.deepLink === 'string' && p.deepLink.startsWith(`https://t.me/${username}?start=login_`)
    && /^[A-Za-z0-9_-]{43}$/.test(p.deepLink.slice(`https://t.me/${username}?start=login_`.length));
}
/** Fragments never reach the server. Strip the credential before any third-party script loads. */
export function takeLoginLink(page: { hash: string; pathname: string; search: string }, history: { replaceState(data: unknown, unused: string, url: string): void }): string | null {
  if (!page.hash.startsWith('#login=')) return null;
  const token = page.hash.slice(7);
  history.replaceState(null, '', `${page.pathname}${page.search}#/login`);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : '';
}
export class BotLoginView {
  private root: HTMLElement | null = null;
  private pending: Pending | null = null;
  private linkToken: string | null;
  private mode: 'telegram' | 'code' = 'telegram';
  private message = '';
  private busy = false;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private api: Api, private username: () => string | null, private enabled: () => boolean,
    private success: (user: User) => void, private errorText: (error: unknown) => string, linkToken: string | null) { this.linkToken = linkToken; if (linkToken !== null) { try { sessionStorage.removeItem(storageKey); } catch { /* No previous request recovery for a fresh link. */ } } }
  unmount() { this.generation++; clearTimeout(this.timer); this.root = null; }
  reset() { this.unmount(); this.remember(null); this.linkToken = null; this.message = ''; }
  receiveLink(token: string) { this.reset(); this.linkToken = token; this.mode = 'telegram'; }
  mount(root: HTMLElement) {
    this.unmount(); this.root = root;
    if (!this.pending && this.linkToken === null) { try { const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null'); if (validPending(saved, this.username())) this.pending = saved; } catch { /* Optional recovery. */ } }
    this.render();
    if (this.pending && this.mode === 'telegram') void this.poll(this.generation);
    else if (this.linkToken === null && this.mode === 'telegram' && this.enabled()) void this.begin();
  }
  private remember(pending: Pending | null) {
    this.pending = pending;
    try { if (pending) sessionStorage.setItem(storageKey, JSON.stringify(pending)); else sessionStorage.removeItem(storageKey); } catch { /* Current login still works without storage. */ }
  }
  private async begin() {
    if (this.busy) return;
    this.busy = true; this.message = ''; this.render();
    const generation = this.generation;
    try {
      const pending = this.linkToken !== null ? await this.api<Pending>('/auth/link', { token: this.linkToken }) : await this.api<Pending>('/auth/bot/request', {});
      this.linkToken = null;
      if (!validPending(pending, this.username())) throw new Error('Invalid login response');
      this.remember(pending);
      if (generation === this.generation) { this.render(); void this.poll(generation); }
    } catch (error) { this.linkToken = null; this.message = this.errorText(error); }
    finally { this.busy = false; this.render(); if (generation !== this.generation && this.root?.isConnected && this.pending && this.mode === 'telegram') void this.poll(this.generation); }
  }
  private async poll(generation: number) {
    const pending = this.pending;
    if (!pending || generation !== this.generation || !this.root?.isConnected) return;
    if (Date.parse(pending.expiresAt) <= Date.now()) { this.remember(null); this.message = 'Запрос истёк. Начните вход заново.'; this.render(); return; }
    try {
      const result = await this.api<{ status: string }>('/auth/bot/status', { requestId: pending.requestId });
      if (generation !== this.generation || !this.root?.isConnected) return;
      if (result.status === 'APPROVED') {
        this.message = 'Вход подтверждён. Открываем личный кабинет…'; this.render();
        const user = await this.api<User>('/auth/bot/complete', { requestId: pending.requestId });
        this.remember(null); this.success(user); return;
      }
      if (result.status === 'CONSUMED') { const user = await this.api<User>('/me'); this.remember(null); this.success(user); return; }
      if (['EXPIRED', 'CANCELLED'].includes(result.status)) { this.remember(null); this.message = result.status === 'EXPIRED' ? 'Запрос истёк. Начните вход заново.' : 'Вход отменён. Можно повторить попытку.'; this.render(); return; }
      this.message = 'Ожидаем подтверждение в Telegram.'; this.render();
    } catch (error) {
      if (generation !== this.generation) return;
      this.message = this.errorText(error); this.render();
      const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
      if ([401, 403, 404, 409].includes(Number(status))) { this.remember(null); this.render(); return; }
    }
    if (generation === this.generation) this.timer = setTimeout(() => { void this.poll(generation); }, 3000);
  }
  private async cancel() {
    if (this.pending) { try { await this.api('/auth/bot/cancel', { requestId: this.pending.requestId }); } catch { /* Expiry and browser binding still protect the abandoned request. */ } }
    clearTimeout(this.timer); this.generation++; this.remember(null); this.message = 'Вход отменён.'; this.render();
  }
  private render() {
    if (!this.root?.isConnected) return;
    const username = this.username();
    if (!this.enabled() || !username) { this.root.innerHTML = '<section class="panel auth-card"><h2>Вход временно недоступен</h2><p>Администратору нужно подключить существующего бота. Публичный каталог доступен.</p></section>'; return; }
    let content: string;
    if (this.mode === 'code') content = `<form id="login-code-form"><h2>Войти по коду</h2><p>Получите код в нашем боте. Он действует 5 минут и используется один раз.</p><a class="link-secondary" href="https://t.me/${escape(username)}?start=code" target="_blank" rel="noopener noreferrer">Получить новый код в Telegram</a><label for="login-code">8 цифр из бота</label><input id="login-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" minlength="8" maxlength="8" required placeholder="00000000"><button class="primary" ${this.busy ? 'disabled' : ''}>Войти</button></form>`;
    else if (this.linkToken !== null) content = '<h2>Одноразовая ссылка</h2><p>Чтобы войти в свой кабинет, продолжите и подтвердите запрос в боте. Пересланная ссылка не даёт доступа к чужому аккаунту.</p><button class="primary" id="login-begin">Продолжить</button>';
    else if (this.pending) content = `<h2>Подтвердите вход в Telegram</h2><p>Откройте нашего бота, сравните число и нажмите «Подтвердить вход». Затем вернитесь на эту страницу.</p><div class="auth-match" aria-label="Число для сверки">${escape(this.pending.displayCode)}</div><a class="link-primary" href="${escape(this.pending.deepLink)}" target="_blank" rel="noopener noreferrer">Войти через Telegram</a><p class="small">Запрос действует до ${escape(new Date(this.pending.expiresAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }))}. Страница обновится автоматически. Подтверждайте только собственный вход.</p><button class="text-button" id="login-cancel">Отменить вход</button>`;
    else content = `<h2>Войти через Telegram</h2><p>Сайт и бот используют один аккаунт. Подписки и история сохраняются.</p><button class="primary" id="login-begin" ${this.busy ? 'disabled' : ''}>${this.busy ? 'Готовим безопасный вход…' : 'Повторить попытку'}</button>`;
    this.root.innerHTML = `<section class="panel auth-card"><div class="auth-methods"><button class="${this.mode === 'telegram' ? 'primary' : 'secondary'}" id="login-method-telegram">Через Telegram</button><button class="${this.mode === 'code' ? 'primary' : 'secondary'}" id="login-method-code">Войти по коду</button></div>${content}<p class="auth-status" role="status" aria-live="polite">${escape(this.message)}</p></section>`;
    this.root.querySelector('#login-begin')?.addEventListener('click', () => { void this.begin(); });
    this.root.querySelector('#login-cancel')?.addEventListener('click', () => { void this.cancel(); });
    this.root.querySelector('#login-method-telegram')?.addEventListener('click', () => { this.generation++; clearTimeout(this.timer); this.mode = 'telegram'; this.render(); if (this.pending) void this.poll(this.generation); else if (this.linkToken === null) void this.begin(); });
    this.root.querySelector('#login-method-code')?.addEventListener('click', () => { this.generation++; clearTimeout(this.timer); this.mode = 'code'; this.render(); });
    this.root.querySelector<HTMLFormElement>('#login-code-form')?.addEventListener('submit', event => {
      event.preventDefault(); if (this.busy) return;
      const code = this.root!.querySelector<HTMLInputElement>('#login-code')!.value;
      this.busy = true; this.message = 'Проверяем код…'; this.render();
      void this.api<User>('/auth/code', { code }).then(user => { this.remember(null); this.success(user); }).catch(error => { this.message = this.errorText(error); }).finally(() => { this.busy = false; this.render(); });
    });
  }
}
