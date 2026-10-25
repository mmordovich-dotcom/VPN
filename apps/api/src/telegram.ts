import type { PrismaClient, Prisma } from '@shared-vps/database';
import type { ApiConfig } from '@shared-vps/runtime';
import { equal } from './auth.js';
import { DomainError, fail, SubscriptionEngine } from './engine.js';
import { BotLogin } from './bot-login.js';
import { loginAction, type LoginAction } from './bot-login-updates.js';
type Update = { update_id: number; loginAction?: LoginAction; message?: { message_id: number; text?: string; from?: { id: number; is_bot?: boolean }; chat: { id: number; type: string } }; callback_query?: { id: string; data?: string; from: { id: number; is_bot?: boolean }; message?: { message_id: number; chat: { id: number; type: string } } } };
type Reply = { method: string; body: Record<string, unknown> };
const buttons = ['🛒 Купить подписку', '👤 Моя подписка', '🔌 Подключиться', '🔄 Продлить подписку', '📖 Инструкции', '💬 Поддержка'];
export const mainKeyboard = { keyboard: [buttons.slice(0, 2).map(text => ({ text })), buttons.slice(2, 4).map(text => ({ text })), buttons.slice(4).map(text => ({ text })), [{ text: 'Личный кабинет / Войти на сайт' }, { text: 'Получить код входа' }]], resize_keyboard: true };
const inline = (items: { text: string; callback_data?: string; web_app?: { url: string }; url?: string }[][]) => ({ inline_keyboard: items });
const back = { text: '← Назад', callback_data: 'menu' };
export class TelegramGateway {
  private login: BotLogin;
  constructor(private db: PrismaClient, private config: ApiConfig, private engine: SubscriptionEngine, private transport?: (method: string, body: Record<string, unknown>) => Promise<unknown>) { this.login = new BotLogin(db, config, engine); }
  authentic(secret: string) { return Boolean(this.config.TELEGRAM_BOT_TOKEN && this.config.TELEGRAM_WEBHOOK_SECRET && equal(secret, this.config.TELEGRAM_WEBHOOK_SECRET)); }
  async call(method: string, body: Record<string, unknown>) {
    if (this.transport) return this.transport(method, body);
    if (!this.config.TELEGRAM_BOT_TOKEN) return fail(503, 'BOT_NOT_CONFIGURED');
    const result = await fetch(`https://api.telegram.org/bot${this.config.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    const data = await result.json() as { ok: boolean; result?: unknown; description?: string };
    if (!result.ok || !data.ok) {
      if (method === 'editMessageText' && data.description?.includes('message is not modified')) return {};
      return fail(503, 'TELEGRAM_UNAVAILABLE');
    }
    return data.result;
  }
  async register() {
    const origin = this.config.PUBLIC_ORIGIN;
    if (!origin?.startsWith('https://') || !this.config.TELEGRAM_WEBHOOK_SECRET) fail(409, 'WEBHOOK_NOT_CONFIGURED');
    await this.call('setWebhook', { url: `${origin}/api/v1/telegram/webhook`, secret_token: this.config.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'], drop_pending_updates: false, max_connections: 4 });
    return { ok: true };
  }
  async status() {
    const result = await this.call('getWebhookInfo', {}) as { url?: string; pending_update_count?: number; last_error_date?: number };
    return { url: result.url, pending: result.pending_update_count, lastErrorAt: result.last_error_date ?? null };
  }
  async bootstrap() {
    if (!this.login.available() || !this.config.PUBLIC_ORIGIN) return;
    const bot = await this.call('getMe', {}) as { username?: string };
    if (bot.username?.toLowerCase() !== this.config.TELEGRAM_BOT_USERNAME?.toLowerCase()) fail(409, 'BOT_USERNAME_MISMATCH');
    const current = await this.status();
    if (current.url && current.url !== `${this.config.PUBLIC_ORIGIN}/api/v1/telegram/webhook`) fail(409, 'WEBHOOK_IN_USE');
    await this.register();
  }
  async accept(raw: unknown) {
    if (!raw || typeof raw !== 'object' || !Number.isInteger((raw as Update).update_id) || (raw as Update).update_id < 0) fail(400, 'INVALID_UPDATE');
    // The internal marker is recomputed, never trusted from an incoming JSON field.
    const { loginAction: _untrusted, ...update } = raw as Update;
    const action = loginAction(update.callback_query?.data ?? update.message?.text ?? '');
    const safe = { ...update, ...(action ? { loginAction: action } : {}),
      ...(action?.type === 'CLAIM' && update.message ? { message: { ...update.message, text: '/login-request' } } : {}) };
    await this.db.telegramUpdate.upsert({ where: { id: update.update_id }, update: {}, create: { id: update.update_id, payload: JSON.parse(JSON.stringify(safe)) as Prisma.InputJsonObject } });
  }
  private async loginReply(action: LoginAction, update: Update, senderId: number, messageId: number): Promise<Reply> {
    let text: string; let markup: object = inline([[back]]);
    if (action.type === 'CLAIM') {
      const request = await this.login.claim(action.tokenHash, String(senderId));
      text = `Подтвердите вход в Shared VPS Platform\n\nСверьте число на сайте: ${request.displayCode}\nПодтверждайте только запрос, который вы сами создали в своём браузере. Не подтверждайте просьбы других людей.`;
      markup = inline([[{ text: 'Подтвердить вход', callback_data: `login:yes:${request.requestId}` }], [{ text: 'Отменить вход', callback_data: `login:no:${request.requestId}` }]]);
    } else if (action.type === 'CONFIRM' || action.type === 'CANCEL') {
      await this.login.confirm(action.requestId, String(senderId), action.type === 'CONFIRM');
      text = action.type === 'CONFIRM' ? 'Вход подтверждён. Вернитесь в тот же браузер: личный кабинет откроется автоматически.' : 'Вход отменён. Можно создать новый запрос на сайте.';
    } else if (action.type === 'LINK' || action.type === 'CODE') {
      const credential = await this.login.issue(String(senderId), action.type, `telegram:${update.update_id}`);
      if (!credential) text = 'Запрос уже обработан. Для новой ссылки нажмите /login, для нового кода — /code.';
      else if ('code' in credential) {
        text = `Код входа: ${credential.code}\nДействует 5 минут, используется один раз. Введите его только на ${this.config.PUBLIC_ORIGIN}. Не пересылайте код и не сообщайте его другим людям. Новый код отменит предыдущий.`;
        markup = inline([[{ text: 'Получить новый код', callback_data: 'login:code' }], [back]]);
      } else {
        text = 'Откройте личный кабинет по одноразовой ссылке в течение 3 минут. На сайте нажмите «Продолжить», затем подтвердите вход здесь, сверив число. Не пересылайте ссылку.';
        markup = inline([[{ text: 'Открыть личный кабинет', url: credential.url }], [{ text: 'Новая ссылка', callback_data: 'login:link' }], [back]]);
      }
    } else text = 'Запрос входа недействителен. Начните вход заново на сайте.';
    return { method: update.callback_query ? 'editMessageText' : 'sendMessage', body: { chat_id: senderId, ...(update.callback_query ? { message_id: messageId } : {}), text, reply_markup: markup, link_preview_options: { is_disabled: true } } };
  }
  async render(update: Update): Promise<Reply | null> {
    const cb = update.callback_query; const msg = cb?.message ?? update.message; const sender = cb?.from ?? update.message?.from;
    if (!msg || !sender || sender.is_bot || !Number.isSafeInteger(sender.id) || sender.id <= 0 || msg.chat.type !== 'private' || msg.chat.id !== sender.id) return null;
    const authAction = update.loginAction ?? loginAction(cb?.data ?? update.message?.text ?? '');
    if (authAction) return this.loginReply(authAction, update, sender.id, msg.message_id);
    const user = await this.engine.identity(String(sender.id), this.config.ADMIN_TELEGRAM_IDS);
    const text = cb?.data ?? update.message?.text ?? '';
    let content = ''; let markup: object = mainKeyboard;
    const subscriptions = await this.engine.subscriptions(user.id);
    const active = subscriptions.find(s => s.status === 'ACTIVE');
    const last = active ?? subscriptions[0];
    if (text.startsWith('/start') || text === 'menu') content = 'Shared VPS Platform · ДЕМОНСТРАЦИЯ\nПокупки, серверы и доступы тестовые. Реальные деньги не списываются. Выберите действие:';
    else if (text === buttons[0] || text === 'buy' || text === buttons[3] || text === 'renew') {
      const renewal = text === buttons[3] || text === 'renew';
      const plan = renewal && last ? last.plan : await this.db.plan.findFirst({ where: { isActive: true }, orderBy: { code: 'asc' } });
      if (!plan || renewal && !last) content = 'Подписки нет. Сначала выберите «Купить подписку».';
      else if (!renewal && active) { content = 'Подписка уже активна. Для увеличения срока выберите продление.'; markup = inline([[{ text: 'Продлить', callback_data: 'renew' }], [back]]); }
      else {
        const order = await this.engine.order(user.id, plan.id, `telegram:${update.update_id}`, renewal ? last!.id : undefined);
        content = `${renewal ? 'Продление' : 'Тестовая покупка'}: ${plan.name}\n${order.amount / 100} ${order.currency} / ${order.periodDays} дней\nДенежная операция симулируется, списание 0 ₽. Подтвердить?`;
        markup = inline([[{ text: 'Подтвердить демо', callback_data: `confirm:${order.id}` }], [{ text: 'Отменить заказ', callback_data: `cancel:${order.id}` }], [back]]);
      }
    } else if (text.startsWith('confirm:') || text.startsWith('cancel:')) {
      const id = text.split(':')[1] ?? ''; if (!/^[0-9a-f-]{36}$/i.test(id)) fail(400, 'INVALID_BUTTON');
      const order = await this.db.order.findFirst({ where: { id, userId: user.id } });
      if (!order) fail(404, 'ORDER_NOT_FOUND');
      if (order.status === 'AWAITING_PAYMENT' && Date.now() - order.createdAt.getTime() > 1800000) { await this.engine.payment(user.id, id, 'cancel'); content = 'Кнопка устарела. Откройте покупку заново.'; }
      else { const result = await this.engine.payment(user.id, id, text.startsWith('confirm:') ? 'confirm' : 'cancel'); content = `Тестовый заказ: ${result.status}\n${result.status === 'COMPLETED' ? 'Подписка активирована. Все данные сохранены в PostgreSQL.' : 'Деньги не списывались.'}`; markup = inline([[{ text: 'Моя подписка', callback_data: 'subscription' }], [back]]); }
    } else if (text === buttons[1] || text === 'subscription') {
      content = last ? `${last.plan.name} · ${last.status}\nНачало: ${last.startedAt?.toISOString().slice(0, 10) ?? '—'}\nОкончание: ${last.expiresAt?.toISOString().slice(0, 10) ?? '—'}\nОсталось: ${Math.max(0, Math.ceil(((last.expiresAt?.getTime() ?? 0) - Date.now()) / 86400000))} дней\nВиртуальный VPS: ${last.serverSlot?.server.externalServerId ?? '—'}\nДемо-доступ: ${last.status === 'ACTIVE' ? last.credentials.find(c => !c.revokedAt)?.demoIdentifier ?? '—' : 'неактивен'}\nЭто не VPN-ключ.` : 'У вас пока нет подписок.';
      markup = inline([[{ text: 'Продлить', callback_data: 'renew' }, { text: 'Подключиться', callback_data: 'connect' }], [back]]);
    } else if (text === buttons[2] || text === 'connect') {
      content = 'Подключение в демо\n1. Проверьте активную подписку.\n2. Откройте её демонстрационный идентификатор.\n3. Настройка реального устройства не требуется: действующих VPN-ключей здесь нет.\nВыберите удобный способ:';
      markup = inline([[{ text: 'Инструкция в Telegram', callback_data: 'subscription' }], ...(this.config.PUBLIC_ORIGIN ? [[{ text: 'Открыть Mini App', web_app: { url: `${this.config.PUBLIC_ORIGIN}/#/connect` } }]] : []), [back]]);
    } else if (text === buttons[4] || text === 'help') {
      content = 'Инструкции'; markup = inline([['Подписка', 'Статус', 'Mini App', 'Продление', 'Вопросы'].map((title, i) => ({ text: title, callback_data: `help:${i}` })), [back]]);
    } else if (text.startsWith('help:')) {
      content = ['До трёх пользователей используют один виртуальный VPS. Четвёртый создаёт следующий. Всё демонстрационное.', 'Нажмите «Моя подписка»: информация поступает из общей PostgreSQL.', 'Нажмите «Подключиться», затем «Открыть Mini App». Все основные действия доступны и без сайта.', 'Нажмите «Продлить подписку». Активный срок увеличится от текущей даты окончания; истёкшая подписка получит новое свободное место.', 'Списаний и настоящих VPN-ключей нет. Сайт и бот используют один аккаунт Telegram. Бесплатный сервер может запускаться около минуты.'][Number(text.split(':')[1])] ?? 'Выберите раздел справки.';
      markup = inline([[{ text: 'Все инструкции', callback_data: 'help' }], [back]]);
    } else if (text === buttons[5] || text === 'support') {
      const tickets = await this.db.supportTicket.findMany({ where: { userId: user.id }, take: 5, orderBy: { createdAt: 'desc' } });
      content = `Поддержка\n${tickets.map(t => `№${t.number} · ${t.status}`).join('\n') || 'Обращений пока нет.'}`;
      markup = inline([[{ text: 'Открыть обращение', callback_data: 'support:new' }, { text: 'Обновить статус', callback_data: 'support' }], [back]]);
    } else if (text === 'support:new') {
      await this.db.botState.upsert({ where: { userId: user.id }, update: { awaitingSupport: true }, create: { userId: user.id, awaitingSupport: true } });
      content = 'Введите текст обращения (5–4000 символов). Для выхода нажмите /start.';
    } else {
      const state = await this.db.botState.findUnique({ where: { userId: user.id } });
      if (state?.awaitingSupport && text.length >= 5 && text.length <= 4000) {
        const ticket = await this.db.supportTicket.upsert({ where: { operationKey: `telegram:${update.update_id}` }, update: {}, create: { userId: user.id, text, operationKey: `telegram:${update.update_id}` } });
        await this.db.botState.update({ where: { userId: user.id }, data: { awaitingSupport: false } });
        content = `Обращение №${ticket.number} сохранено. Статус: ${ticket.status}.`;
      } else content = 'Выберите действие кнопкой меню. Для обращения введите от 5 до 4000 символов.';
    }
    if (text.startsWith('/start') || text === 'menu') await this.db.botState.upsert({ where: { userId: user.id }, update: { awaitingSupport: false }, create: { userId: user.id } });
    return { method: cb ? 'editMessageText' : 'sendMessage', body: { chat_id: sender.id, ...(cb ? { message_id: msg.message_id } : {}), text: content, reply_markup: cb && markup === mainKeyboard ? inline(buttons.map((title, i) => [{ text: title, callback_data: ['buy', 'subscription', 'connect', 'renew', 'help', 'support'][i]! }])) : markup } };
  }
  async drain() {
    if (!this.config.TELEGRAM_BOT_TOKEN && !this.transport) return;
    const pending = await this.db.telegramUpdate.findMany({ where: { status: { not: 'DONE' }, attempts: { lt: 5 } }, orderBy: { id: 'asc' }, take: 10 });
    for (const update of pending) {
      // A lease survives process crashes. A second replica can reclaim it after two minutes.
      const claimed = await this.db.telegramUpdate.updateMany({ where: { id: update.id, OR: [{ status: { in: ['PENDING', 'READY'] } }, { status: 'PROCESSING', updatedAt: { lt: new Date(Date.now() - 120000) } }] }, data: { status: 'PROCESSING', attempts: { increment: 1 } } });
      if (!claimed.count) continue;
      try {
        const raw = update.payload as unknown as Update;
        if (raw.callback_query) { try { await this.call('answerCallbackQuery', { callback_query_id: raw.callback_query.id }); } catch { /* Old callback acknowledgement does not block a durable operation. */ } }
        let response = update.response as unknown as Reply | null;
        if (!response) {
          try { response = await this.render(raw); }
          catch (error) {
            if (!(error instanceof DomainError) || error.statusCode >= 500) throw error;
            const cb = raw.callback_query; const msg = cb?.message ?? raw.message;
            if (msg) response = { method: cb ? 'editMessageText' : 'sendMessage', body: { chat_id: msg.chat.id, ...(cb ? { message_id: msg.message_id, reply_markup: inline([[back]]) } : { reply_markup: mainKeyboard }), text: `Действие недоступно (${error.code}). Вернитесь в меню. Данные сохранены.` } };
          }
          // Codes and links exist only in this send, never in durable response JSON or logs.
          if (response && !raw.loginAction && !loginAction(raw.callback_query?.data ?? raw.message?.text ?? '')) await this.db.telegramUpdate.update({ where: { id: update.id }, data: { response: JSON.parse(JSON.stringify(response)) as Prisma.InputJsonObject } });
        }
        if (response) await this.call(response.method, response.body);
        await this.db.telegramUpdate.update({ where: { id: update.id }, data: { status: 'DONE' } });
      } catch { await this.db.telegramUpdate.update({ where: { id: update.id }, data: { status: 'PENDING' } }); }
    }
  }
}

