import { supportCategories, supportStatuses } from '@shared-vps/shared';
import { escapeHtml as e, statusBadge } from './axon-ui.js';
type Api = <T>(path: string, body?: unknown) => Promise<T>;
type Thread = { ticket: { id: string; number: number; category: string; status: string }; messages: { id: string; authorRole: string; text: string; createdAt: string }[]; nextCursor: string | null };
export class SupportView {
  private root: HTMLElement | null = null; private generation = 0;
  constructor(private api: Api, private errorText: (error: unknown) => string) {}
  unmount() { this.generation++; this.root = null; }
  mount(root: HTMLElement, id: string, admin = false) { this.unmount(); this.root = root; void this.load(id, admin); }
  private async load(id: string, admin: boolean, cursor?: string) {
    const root = this.root; if (!root) return; const generation = ++this.generation;
    const path = (admin ? '/admin' : '') + '/support/' + encodeURIComponent(id);
    root.innerHTML = '<p role="status">Загружаем переписку…</p>';
    try {
      const data = await this.api<Thread>(path + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
      if (generation !== this.generation || this.root !== root || !root.isConnected) return;
      const ticket = data.ticket;
      root.innerHTML = '<div class="card-top"><h2>Обращение №' + ticket.number + '</h2>' + statusBadge(ticket.status) + '</div><p>' + e(supportCategories[ticket.category as keyof typeof supportCategories] ?? 'Другой вопрос') + '</p><div class="thread-messages">' + data.messages.map(m => '<article class="thread-message ' + (m.authorRole === 'ADMIN' ? 'staff-message' : '') + '"><div class="history-meta"><strong>' + (m.authorRole === 'ADMIN' ? 'Поддержка' : 'Пользователь') + '</strong><time>' + e(new Date(m.createdAt).toLocaleString('ru-RU')) + '</time></div><p>' + e(m.text) + '</p></article>').join('') + '</div><div class="actions">' + (data.nextCursor ? '<button id="thread-older" class="secondary">Ранее</button>' : '') + (cursor ? '<button id="thread-latest" class="secondary">К последним сообщениям</button>' : '') + '</div>' + (ticket.status !== 'CLOSED' ? '<form id="thread-reply"><label>Ваш ответ<textarea name="text" required minlength="1" maxlength="4000" rows="4" placeholder="Пароли и коды присылать не нужно"></textarea></label><button class="primary">Отправить ответ</button></form>' : '<p class="status-note">Обращение закрыто. Переписка сохранена.</p>') + (admin ? '<form id="thread-status"><label>Статус<select name="status">' + Object.entries(supportStatuses).map(([key,title]) => '<option value="' + key + '" ' + (key === ticket.status ? 'selected' : '') + '>' + title + '</option>').join('') + '</select></label><button class="secondary">Сохранить статус</button></form>' : ticket.status !== 'CLOSED' ? '<button class="text-button" id="thread-close">Вопрос решён · закрыть обращение</button>' : '') + '<p id="thread-result" role="status" aria-live="polite"></p>';
      const run = async (button: HTMLButtonElement, body: unknown, suffix = '') => { button.disabled = true; try { await this.api(path + suffix, body); await this.load(id, admin); } catch (error) { if (this.root === root) { root.querySelector('#thread-result')!.textContent = this.errorText(error); button.disabled = false; } } };
      const reply = root.querySelector<HTMLFormElement>('#thread-reply'); const operationKey = crypto.randomUUID();
      if (reply) reply.onsubmit = event => { event.preventDefault(); void run(reply.querySelector('button')!, { text: new FormData(reply).get('text'), operationKey }, '/messages'); };
      const status = root.querySelector<HTMLFormElement>('#thread-status'); if (status) status.onsubmit = event => { event.preventDefault(); void run(status.querySelector('button')!, { status: new FormData(status).get('status'), expectedStatus: ticket.status }); };
      const close = root.querySelector<HTMLButtonElement>('#thread-close'); if (close) close.onclick = () => { void run(close, { status: 'CLOSED', expectedStatus: ticket.status }); };
      const older = root.querySelector<HTMLButtonElement>('#thread-older'); if (older) older.onclick = () => { void this.load(id, admin, data.nextCursor!); };
      const latest = root.querySelector<HTMLButtonElement>('#thread-latest'); if (latest) latest.onclick = () => { void this.load(id, admin); };
    } catch (error) { if (generation === this.generation && this.root === root) { root.innerHTML = '<p role="alert">' + e(this.errorText(error)) + '</p><button class="secondary" id="thread-retry">Повторить</button>'; root.querySelector<HTMLButtonElement>('#thread-retry')!.onclick = () => { void this.load(id, admin, cursor); }; } }
  }
}
