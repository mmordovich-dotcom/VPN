import { escapeHtml as e, statusBadge } from './axon-ui.js';
type Api = <T>(path: string, body?: unknown) => Promise<T>;
type Row = { id: string; status: string; createdAt: string; amount?: number; currency?: string; expiresAt?: string; plan?: { name: string }; number?: number; text?: string };
type Page = { items: Row[]; nextCursor: string | null; total?: number };
export type AccountResource = 'orders' | 'subscriptions' | 'tickets';
const filters: Record<AccountResource, string[]> = {
  orders: ['AWAITING_PAYMENT', 'PAID', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'],
  subscriptions: ['ACTIVE', 'PENDING', 'EXPIRED', 'CANCELLED', 'SUSPENDED'],
  tickets: ['OPEN', 'IN_PROGRESS', 'CLOSED'],
};
const names: Record<string, string> = { AWAITING_PAYMENT: 'Ожидает подтверждения', PAID: 'Ожидает активации', PROCESSING: 'Выполняется', COMPLETED: 'Завершён', FAILED: 'Ошибка', CANCELLED: 'Отменён', ACTIVE: 'Активна', PENDING: 'Ожидание', EXPIRED: 'Истекла', SUSPENDED: 'Приостановлена', OPEN: 'Открыто', IN_PROGRESS: 'В работе', CLOSED: 'Закрыто' };
const date = (value?: string) => value ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export class AccountLists {
  private root: HTMLElement | null = null;
  private generation = 0;
  private cursor: string | undefined;
  private previous: (string | undefined)[] = [];
  private resource: AccountResource = 'orders';
  constructor(private api: Api, private errorText: (error: unknown) => string, private mutations: () => void) {}
  unmount() { this.generation++; this.root = null; }
  mount(root: HTMLElement, resource: AccountResource) {
    this.unmount(); this.root = root; this.resource = resource; this.cursor = undefined; this.previous = [];
    root.innerHTML = `<form class="list-filters" id="account-filters"><label>Поиск<input name="search" maxlength="80" placeholder="ID или текст"></label><label>Статус<select name="status"><option value="">Все статусы</option>${filters[resource].map(s => `<option value="${s}">${names[s]}</option>`).join('')}</select></label><label>Порядок<select name="sort"><option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option></select></label><button class="secondary">Применить</button></form><p id="account-info" role="status" aria-live="polite"></p><div id="account-records" class="history-cards"></div><div class="pager"><button id="account-prev" class="secondary" disabled>← Назад</button><span id="account-page"></span><button id="account-next" class="secondary" disabled>Далее →</button></div>`;
    root.querySelector<HTMLFormElement>('#account-filters')!.onsubmit = event => { event.preventDefault(); this.cursor = undefined; this.previous = []; void this.load(); };
    root.querySelector<HTMLButtonElement>('#account-prev')!.onclick = () => { this.cursor = this.previous.pop(); void this.load(); };
    void this.load();
  }
  private async load() {
    const root = this.root; if (!root) return;
    const generation = ++this.generation;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(root.querySelector<HTMLFormElement>('#account-filters')!)) if (typeof value === 'string' && value) params.set(key, value);
    params.set('limit', '12'); params.set('includeTotal', 'true'); if (this.cursor) params.set('cursor', this.cursor);
    const previous = root.querySelector<HTMLButtonElement>('#account-prev')!;
    const next = root.querySelector<HTMLButtonElement>('#account-next')!;
    const records = root.querySelector<HTMLElement>('#account-records')!;
    const info = root.querySelector<HTMLElement>('#account-info')!;
    previous.disabled = true; next.disabled = true; records.setAttribute('aria-busy', 'true'); info.textContent = 'Загружаем историю…';
    try {
      const page = await this.api<Page>(`/account/lists/${this.resource}?${params}`);
      if (generation !== this.generation || this.root !== root || !root.isConnected) return;
      records.innerHTML = page.items.map(row => this.card(row)).join('') || '<div class="empty-state"><h2>Здесь пока тихо</h2><p>Записей с такими параметрами нет. Попробуйте другой фильтр.</p></div>';
      info.textContent = `${page.items.length} записей на странице · всего ${page.total ?? '—'}`;
      root.querySelector('#account-page')!.textContent = `Страница ${this.previous.length + 1}`;
      previous.disabled = this.previous.length === 0; next.disabled = !page.nextCursor;
      next.onclick = () => { this.previous.push(this.cursor); this.cursor = page.nextCursor ?? undefined; void this.load(); };
      this.mutations();
    } catch (error) {
      if (generation !== this.generation || this.root !== root) return;
      info.textContent = this.errorText(error);
      records.innerHTML = '<div class="empty-state"><h2>История временно недоступна</h2><p>Ваши данные сохранены. Попробуйте ещё раз.</p><button class="secondary" id="account-retry">Повторить</button></div>';
      root.querySelector<HTMLButtonElement>('#account-retry')!.onclick = () => { void this.load(); };
    } finally { if (generation === this.generation && this.root === root) records.setAttribute('aria-busy', 'false'); }
  }
  private card(row: Row) {
    const title = this.resource === 'tickets' ? `Обращение №${row.number}` : row.plan?.name ?? 'Демонстрационный заказ';
    let content = '';
    if (this.resource === 'orders') {
      const amount = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: row.currency ?? 'RUB' }).format((row.amount ?? 0) / 100);
      content = `<p>${e(amount)} · фактическое списание 0 ₽</p>${row.status === 'AWAITING_PAYMENT' ? `<div class="actions"><button class="secondary" data-pay="${e(row.id)}">Подтвердить демо</button><button class="text-button" data-order-cancel="${e(row.id)}">Отменить заказ</button><button class="text-button" data-reject="${e(row.id)}">Демо-отказ</button></div>` : ''}`;
    } else if (this.resource === 'tickets') content = `<p>${e(row.text)}</p>`;
    else content = `<p>Окончание: ${e(date(row.expiresAt))}</p><a class="text-button" href="#/subscriptions">Текущая подписка →</a>`;
    return `<article class="history-card"><div class="card-top"><h3>${e(title)}</h3>${statusBadge(row.status)}</div><div class="history-meta"><span>${e(date(row.createdAt))}</span><span title="${e(row.id)}">ID ${e(row.id.slice(0, 8))}</span></div>${content}</article>`;
  }
}
