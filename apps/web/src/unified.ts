import './styles/axon.css';
import { MiniAppBridge } from './mini-app.js';
import { AccountLists } from './account-lists.js';
import { icon, bottomTabs, routeNames, selectedTab, appRoute, statusBadge, daysRemaining, quickLink, publicHero } from './axon-ui.js';
import { AdminLists } from './admin-lists.js';
import { BotLoginView, takeLoginLink } from './bot-login.js';
const incomingLoginLink = import.meta.env.MODE === 'production' && new URL(__API_BASE_URL__).origin !== location.origin ? null : takeLoginLink(window.location, window.history);
type Plan = { id: string; name: string; price: number; currency: string; durationDays: number; maxUsersPerServer: number; isActive: boolean };
type Sub = { id: string; userId: string; status: string; plan: Plan; planId: string; startedAt: string | null; expiresAt: string | null; credentials: { demoIdentifier: string; revokedAt: string | null }[]; serverSlot: { server: { externalServerId: string } } | null };
type Order = { createdAt?: string; id: string; status: string; amount: number; currency: string; lastError: string | null; payments?: { status: string }[] };
type Ticket = { id: string; number: number; text: string; status: string };
type Admin = { stats: Record<string, number>; users: { id: string; role: string; identities: { providerUserId: string }[]; subscriptions: { status: string }[] }[]; servers: { externalServerId: string; expiresAt: string; slots: { slotNumber: number; status: string }[] }[]; orders: Order[]; subscriptions: Sub[]; tickets: Ticket[]; plans: Plan[]; settings: { key: string; value: unknown }[]; listLimit: number };
const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const e = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const money = (n: number, currency = 'RUB') => new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(n / 100);
const date = (v: string | null) => v ? new Date(v).toLocaleDateString('ru-RU') : '—';
const labels: Record<string, string> = { ACTIVE: 'Активна', EXPIRED: 'Истекла', CANCELLED: 'Отменена', COMPLETED: 'Завершён', PAID: 'Ожидает активации', AWAITING_PAYMENT: 'Ожидает подтверждения', FAILED: 'Ошибка', PENDING: 'Ожидание', OPEN: 'Открыто', CLOSED: 'Закрыто', IN_PROGRESS: 'В работе' };
const label = (s: string) => labels[s] ?? s;
class ApiError extends Error { constructor(public status: number, code: string) { super(code); } }
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/v1${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: body === undefined ? {} : { 'content-type': 'application/json', 'x-shared-vps': '1' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(45000) });
  const data = await r.json() as T & { error?: string }; if (!r.ok) throw new ApiError(r.status, data.error ?? 'API_ERROR'); return data;
}
const messages: Record<string, string> = { RATE_LIMITED:'Слишком много запросов. Подождите минуту и повторите.', JOB_NOT_RETRYABLE:'Эта задача требует проверки результата доставки; автоматический повтор недоступен.', LOGIN_REQUIRED: 'Войдите через Telegram.', ADMIN_REQUIRED: 'Этот раздел доступен только администратору.', USE_RENEWAL: 'У вас уже есть подписка. Выберите продление.', ORDER_IN_PROGRESS: 'Завершите текущий заказ в истории.', LOGIN_NOT_CONFIGURED: 'Telegram Login ещё не настроен администратором.', LOGIN_REPLAY: 'Вход уже использован. Откройте приложение заново.', INVALID_INIT_DATA: 'Срок авторизации истёк. Откройте Mini App заново из Telegram.', INVALID_LOGIN: 'Telegram не подтвердил вход. Повторите авторизацию.', PAYMENT_FINAL: 'Заказ уже обработан. Проверьте историю.', ORIGIN_REQUIRED: 'Откройте сайт по адресу Backend Render из инструкции.' };
Object.assign(messages, { BOT_LOGIN_NOT_CONFIGURED: 'Вход через бота ещё не подключён администратором.', AUTH_INVALID: 'Код или ссылка недействительны, истекли или уже использованы. Получите новые в боте.', AUTH_REQUEST_UNAVAILABLE: 'Запрос входа недоступен. Начните новый запрос в этом браузере.', AUTH_RATE_LIMITED: 'Слишком много попыток. Подождите 5 минут и запросите новый вход.', AUTH_LOGOUT_FIRST: 'Вы уже вошли в другой аккаунт. Сначала выйдите, затем начните новый вход.', AUTH_UNAVAILABLE: 'Вход временно недоступен. Повторите позже.' });
const errorText = (err: unknown) => err instanceof ApiError ? messages[err.message] ?? `Действие не выполнено (${err.message}). Проверьте историю заказов.` : 'Сервер временно недоступен или запускается после простоя. Подождите около минуты и повторите. Данные сохраняются.';
let me: { id: string; role: string } | null = null;
let authReady = false;
let needsLogout = false;
let config: { botUsername: string | null; loginEnabled: boolean } = { botUsername: null, loginEnabled: false };
let toastTimer: ReturnType<typeof setTimeout>;
function toast(s: string, kind: 'success' | 'error' = 'success') { mini.feedback(kind); $('#toast').textContent = s; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 10000); }
const nav = [['/', 'Главная'], ['/catalog', 'Каталог'], ['/subscriptions', 'Подписка'], ['/connect', 'Подключение'], ['/support', 'Поддержка'], ['/profile', 'Профиль'], ['/admin', 'Админка']];
$('#app').innerHTML = `<a class="skip-link" href="#page">К содержимому</a><div class="shell"><header><a class="brand" href="#/" aria-label="AXON — главная"><span class="brand-mark" aria-hidden="true">A</span><span>AXON<small>Shared VPS Platform</small></span></a><div class="header-actions"><span class="demo"><i></i> DEMO MODE</span><button id="theme" class="theme-button" aria-label="Переключить тему">◐</button></div></header><nav class="site-nav" aria-label="Основные разделы">${nav.map(([url, text]) => `<a href="#${url}" data-route="${url}" ${url === '/admin' ? 'data-admin-nav hidden' : ''}>${text}</a>`).join('')}</nav><div class="demo-toolbar"><span id="identity">Гостевой режим</span><button class="text-button" id="login">Войти через Telegram</button></div><main id="page" tabindex="-1"></main><footer><span>AXON / SHARED VPS · STAGE 1.4</span><span>Демонстрация. Списание 0 ₽. Виртуальные VPS. Демонстрационные идентификаторы не являются VPN-ключами.</span></footer></div><nav class="bottom-nav" aria-label="Мобильная навигация">${bottomTabs.map(([url,title,glyph])=>`<a href="#${url}" data-route="${url}">${icon(glyph)}<span>${title}</span></a>`).join('')}</nav><dialog id="dialog" class="dialog" aria-labelledby="dialog-title" aria-describedby="dialog-description"><span class="eyebrow">Демонстрационная операция</span><h2 id="dialog-title"></h2><p id="dialog-description"></p><div class="actions"><button class="secondary" id="dialog-cancel">Отмена</button><button class="primary" id="dialog-confirm">Подтвердить</button></div></dialog><div id="toast" class="toast" role="status" aria-live="polite" hidden></div>`;
let mini = new MiniAppBridge(undefined, document.documentElement, path => { location.hash = path; });
try { const saved = localStorage.getItem('shared-vps-theme'); document.documentElement.dataset.theme = saved === 'light' ? 'light' : 'dark'; } catch { document.documentElement.dataset.theme = 'dark'; }
$('#theme').onclick = () => { const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = theme; try { localStorage.setItem('shared-vps-theme', theme); } catch { /* Optional appearance only. */ } mini.feedback('selection'); };

async function script(src: string) { await new Promise<void>((resolve, reject) => { const s = document.createElement('script'); const timeout = setTimeout(() => { s.remove(); reject(new Error('Script unavailable')); }, 8000); s.src = src; s.onload = () => { clearTimeout(timeout); resolve(); }; s.onerror = () => { clearTimeout(timeout); reject(new Error('Script unavailable')); }; document.head.append(s); }); }
function identity() { $('#identity').textContent = me ? `Telegram · ${me.role === 'ADMIN' ? 'Администратор' : 'Личный кабинет'}` : 'Гостевой режим'; $('#login').textContent = needsLogout ? 'Сменить аккаунт' : me ? 'Выйти' : 'Войти через Telegram'; document.querySelectorAll<HTMLElement>('[data-admin-nav]').forEach(el => { el.hidden = me?.role !== 'ADMIN'; }); }
async function action(button: HTMLButtonElement, fn: () => Promise<void>) { if (button.disabled) return; button.disabled = true; try { await fn(); } catch (err) { toast(errorText(err), 'error'); } finally { button.disabled = false; } }
const loginView = new BotLoginView(api, () => config.botUsername, () => config.loginEnabled, user => {
  me = user; identity(); toast('Вход выполнен.'); location.hash = '/'; void route();
}, errorText, incomingLoginLink);
$('#login').onclick = () => { if (!me && !needsLogout) { location.hash = '/login'; return; } confirmAction(needsLogout ? 'Подключить аккаунт Telegram?' : 'Выйти из аккаунта?', 'Подписки и история сохранятся. Для следующего входа понадобится подтверждение Telegram.', async () => { const switchAccount = needsLogout; await api('/auth/logout', {}); me = null; needsLogout = false; loginView.reset(); if (switchAccount && window.Telegram?.WebApp?.initData) me = await api('/auth/telegram', { initData: window.Telegram.WebApp.initData }); identity(); toast(switchAccount ? 'Аккаунт Telegram подключён.' : 'Вы вышли. История сохранена.'); location.hash = '/'; }); };
function confirmAction(title: string, text: string, fn: () => Promise<void>) {
  const dialog = $<HTMLDialogElement>('#dialog'); $('#dialog-title').textContent = title; $('#dialog-description').textContent = text;
  const cancel = $<HTMLButtonElement>('#dialog-cancel');
  dialog.oncancel = event => { if (dialog.dataset.busy === 'true') event.preventDefault(); };
  const yes = $<HTMLButtonElement>('#dialog-confirm'); yes.disabled = false; yes.onclick = () => { void action(yes, async () => { dialog.dataset.busy = 'true'; cancel.disabled = true; try { await fn(); dialog.close(); await route(); } finally { delete dialog.dataset.busy; cancel.disabled = false; } }); };
  $('#dialog-cancel').onclick = () => dialog.close(); dialog.showModal();
}
const heading = (title: string, description: string) => `<section class="page-heading"><span class="eyebrow">Shared VPS · Demo</span><h1>${title}</h1><p class="lead">${description}</p></section>`;
function planCard(p: Plan, renewal?: Sub) { return `<article class="panel plan"><div class="card-top"><span class="tag">AXON / ДЕМО-ТАРИФ</span><span class="badge">До ${p.maxUsersPerServer} на VPS</span></div><h2>${e(p.name)}</h2><div class="price">${money(p.price,p.currency)}</div><p class="plan-period">за ${p.durationDays} дней · фактическое списание 0 ₽</p><ul><li>Индивидуальный срок подписки</li><li>Место на общем виртуальном VPS</li><li>Сайт, бот и полноценный Mini App</li><li>История и управление уведомлениями</li></ul><button class="primary" ${renewal ? `data-renew="${renewal.id}" data-plan="${p.id}"` : `data-buy="${p.id}"`}>${renewal ? 'Продлить демо' : 'Оформить тестовую подписку'} ${icon('arrow')}</button><p class="plan-note">Только демо. Настоящих платежей и VPN-доступа нет.</p></article>`; }
function subCard(s: Sub, connect: boolean) {
  const identifier = s.status === 'ACTIVE' ? s.credentials.find(c => !c.revokedAt)?.demoIdentifier : undefined;
  return `<article class="panel subscription-hero"><div class="card-top"><span class="tag">${e(s.plan.name)}</span>${statusBadge(s.status)}</div><h2>${s.status === 'ACTIVE' ? 'Подписка под контролем.' : 'Ваша подписка.'}</h2><div class="days">${daysRemaining(s.expiresAt)} <small>дней осталось</small></div><div class="facts"><div class="fact"><span>Начало</span><strong>${date(s.startedAt)}</strong></div><div class="fact"><span>Окончание</span><strong>${date(s.expiresAt)}</strong></div><div class="fact"><span>Виртуальный VPS</span><strong>${e(s.serverSlot?.server.externalServerId ?? 'Ожидание активации')}</strong></div><div class="fact"><span>Формат</span><strong>Общий VPS · личный срок</strong></div></div>${connect ? `<div class="access-demo">Демонстрационный идентификатор<code>${e(identifier ?? 'Доступ неактивен')}</code><small>Это не VPN-ключ или конфигурация устройства.</small>${identifier ? `<button class="text-button" data-copy="${e(identifier)}">Скопировать демо-идентификатор</button>` : ''}</div>` : ''}<div class="actions">${['ACTIVE','EXPIRED'].includes(s.status) ? `<button class="primary" data-renew="${s.id}" data-plan="${s.planId}">Продлить демо ${icon('renew')}</button>` : ''}${!connect ? '<a class="link-secondary" href="#/connect">Подключение</a>' : ''}${s.status === 'ACTIVE' ? `<button class="text-button danger" data-cancel="${s.id}">Отменить подписку</button>` : ''}</div><p class="small">История сохранена. Все операции демонстрационные.</p></article>`;
}

const table = (headers: string[], rows: string[][]) => `<div class="table-wrap"><table><thead><tr>${headers.map(x => `<th>${e(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${headers.length}">Записей пока нет</td></tr>`}</tbody></table></div>`;
function ordersTable(orders: Order[], admin = false) { return table(['Заказ / дата', 'Сумма демо', 'Статус', 'Действие'], orders.map(o => [`${e(o.id.slice(0,8))}<br><small>${date(o.createdAt ?? null)}</small>`, money(o.amount, o.currency), `${statusBadge(o.status)}${o.lastError ? `<br>${e(o.lastError)}` : ''}`, o.status === 'AWAITING_PAYMENT' && !admin ? `<button class="secondary" data-pay="${o.id}">Подтвердить</button><button class="text-button" data-reject="${o.id}">Отказ</button><button class="text-button" data-order-cancel="${o.id}">Отмена</button>` : admin && o.status === 'PAID' ? `<button class="secondary" data-retry="${o.id}">Повторить активацию</button>` : admin && o.payments?.some(p => p.status === 'SUCCEEDED') ? `<button class="danger" data-refund="${o.id}">Демо-возврат</button>` : '—'])); }
let generation = 0;
const adminLists = new AdminLists(api, errorText, bind);
const accountLists = new AccountLists(api, errorText, bind);
function loading() { return '<div class="loading-panel" role="status"><span class="sr-only">Загружаем данные…</span><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>'; }
function empty(title: string, description: string, path = '/catalog', actionText = 'Открыть каталог') { return `<div class="empty-state panel">${icon('layers')}<h2>${e(title)}</h2><p>${e(description)}</p><a class="link-primary" href="#${e(path)}">${e(actionText)} ${icon('arrow')}</a></div>`; }
function instructions() { return heading('Всё на своих местах.', 'Короткий маршрут по AXON. На этом этапе все серверы и операции демонстрационные.') + `<div class="cards two"><article class="panel"><span class="eyebrow">01 / НАЧАЛО</span><h2>От тарифа до подписки</h2><ol class="instructions"><li><strong>Войдите через Telegram</strong>В Mini App аккаунт определяется автоматически. На сайте подтвердите вход в боте, сверив число.</li><li><strong>Выберите тариф</strong>Каталог показывает действующие параметры базы. Перед операцией есть подтверждение, списание 0 ₽.</li><li><strong>Следите за сроком</strong>Активное продление добавляет период к текущему окончанию. История сохраняется.</li></ol></article><article class="panel"><span class="eyebrow">02 / В TELEGRAM</span><h2>Бот и полное приложение</h2><p>В @${e(config.botUsername ?? 'vpnaxon_bot')} нажмите «Открыть приложение». Внутри доступны каталог, подписки, история, профиль и поддержка. Бот сохраняет быстрые действия прямо в чате.</p><p>Коды и одноразовые ссылки берите только у существующего бота. Подтверждайте только свой запрос входа.</p>${config.botUsername ? `<a class="link-secondary" href="https://t.me/${e(config.botUsername)}" target="_blank" rel="noopener noreferrer">Открыть бота ↗</a>` : ''}</article></div><div class="status-note">Реальных VPN-конфигураций, платежей и аренды VPS здесь нет. Бесплатный Render может засыпать; после простоя запуск занимает около минуты.</div>`; }
async function route() {
  loginView.unmount(); adminLists.unmount(); accountLists.unmount();
  const current = ++generation; const path = appRoute(location.hash); const page = $('#page');
  if (!authReady && (me || !['/','/catalog','/instructions'].includes(path))) { page.innerHTML = loading(); return; }
  mini.route(path);
  document.title = `${routeNames[path] ?? 'Страница не найдена'} · AXON`;
  document.querySelectorAll<HTMLElement>('[data-route]').forEach(el => { const active = el.getAttribute('data-route') === (el.closest('.bottom-nav') ? selectedTab(path) : path); el.classList.toggle('active', active); if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
  window.scrollTo(0, 0); page.setAttribute('aria-busy', 'true'); page.classList.remove('route-enter'); page.innerHTML = loading();
  try {
    let html = '';
    if (path === '/' && me) {
      const [subs, recent] = await Promise.all([api<Sub[]>('/subscriptions'), api<{ items: Order[] }>('/account/lists/orders?limit=3')]);
      const active = subs.find(s => s.status === 'ACTIVE');
      html = heading('Ваше пространство.', 'Сроки, подписка и быстрые действия — в одном месте.') + `<div class="cards two"><div>${active ? subCard(active, false) : empty('Всё начинается с выбора.', 'Подписки пока нет. Выберите демо-тариф и пройдите весь путь без списаний.')}</div><section class="quick-links" aria-label="Быстрые действия">${quickLink('/renew','Продлить подписку','Добавить период без потери оставшихся дней','renew')}${quickLink('/connect','Подключение','Статус, демо-доступ и инструкция','link')}${quickLink('/notifications','Уведомления','Ваши настройки для сайта и бота','bell')}${quickLink('/support','Мы на связи','Обращения и помощь без лишних шагов','chat')}</section></div><div class="section-heading"><h2>Последние действия</h2><a class="text-button" href="#/orders">Вся история →</a></div>${recent.items.length ? ordersTable(recent.items) : '<p class="empty-state">Заказов пока нет. Новые действия появятся здесь.</p>'}`;
    } else if (path === '/' || path === '/catalog') {
      const [plans, currentSubs] = await Promise.all([api<Plan[]>('/plans'), me ? api<Sub[]>('/subscriptions') : Promise.resolve([])]);
      const showPlan = (plan: Plan) => planCard(plan, currentSubs.find(sub => sub.planId === plan.id && sub.status === 'ACTIVE'));
      html = path === '/' ? publicHero(config.botUsername) + `<div class="section-heading"><div><span class="eyebrow">ПОНЯТНЫЕ УСЛОВИЯ</span><h2>Попробуйте весь путь.</h2></div><a class="text-button" href="#/catalog">Все тарифы →</a></div><div class="cards two">${plans[0] ? showPlan(plans[0]) : empty('Пауза в каталоге','Сейчас нет активных тарифов. Загляните позже.','/support','Связаться с поддержкой')}<article class="panel status-panel"><span class="eyebrow">SHARED SPACE / PERSONAL TIME</span><h2>Общее пространство.<br>Индивидуальный срок.</h2><p>Количество мест определяется тарифом и настройками платформы. В действующей демо-модели три пользователя делят виртуальный VPS; следующий занимает новый.</p><div class="status-row"><span>Данные сайта и Telegram</span><span>Один аккаунт</span></div><p class="demo-disclaimer">Все операции тестовые. Настоящая инфраструктура не арендуется.</p></article></div>` : heading('Выберите свой ритм.', 'Тарифы из действующей базы. Прозрачные условия, независимый срок и списание 0 ₽.') + `<div class="cards two">${plans.map(showPlan).join('') || empty('Нет доступных тарифов','Вернитесь позже или напишите в поддержку.','/support','Поддержка')}</div>`;
    } else if (path === '/instructions') html = instructions();
    else if (!routeNames[path]) html = heading('Такой страницы нет.', 'Вернитесь в знакомое пространство.') + empty('Продолжим с главной?','Ваши данные остаются на сервере.','/','На главную');
    else if (needsLogout) html = heading('Подключим ваш Telegram.', 'В браузере была сессия другого аккаунта или требуется новый вход.') + '<div class="panel"><p>Смените аккаунт, чтобы открыть данные текущего Telegram. Коды и ссылки пересылать не нужно.</p><button class="primary" data-logout>Подключить текущий аккаунт</button></div>';
    else if (!me) html = heading('Добро пожаловать в AXON.', 'Один Telegram-аккаунт для сайта, бота и Mini App.') + '<div id="auth-panel"></div>';
    else if (path === '/login') html = heading('Вы уже дома.', 'Ваш аккаунт подключён, история и подписки сохранены.') + quickLink('/','Открыть кабинет','Перейти к подписке и быстрым действиям','home');
    else if (['/subscriptions', '/connect', '/renew'].includes(path)) {
      const subs = await api<Sub[]>('/subscriptions');
      const shown = path === '/renew' ? subs.filter(s => ['ACTIVE','EXPIRED'].includes(s.status)) : subs;
      html = heading(path === '/connect' ? 'Подключение без лишнего.' : path === '/renew' ? 'Продолжайте свой ритм.' : 'Ваша подписка.', path === '/connect' ? 'Статус и демонстрационный доступ. Настройка настоящего VPN не требуется.' : 'Срок, история и управление — под вашим контролем.') + `<div class="actions"><a class="text-button" href="#/history">История подписок</a><a class="text-button" href="#/notifications">${icon('bell')} Настройки уведомлений</a></div><div class="cards two">${shown.map(s => subCard(s, path === '/connect')).join('') || empty('Пока нет подписок.','Выберите тариф, подтвердите демонстрационную операцию и возвращайтесь сюда.')}</div>`;
      if (path === '/connect') html += `<article class="panel"><h2>Три простых шага</h2><ol class="instructions"><li><strong>Проверьте статус и срок</strong>Демо-доступ доступен только для активной подписки.</li><li><strong>Найдите свой идентификатор</strong>Он обозначает демонстрационный доступ и не работает как VPN-ключ.</li><li><strong>Продолжите в удобном формате</strong>Статус и продление доступны также в Telegram-боте.</li></ol><div class="actions"><a class="link-secondary" href="#/instructions">Все инструкции</a>${config.botUsername ? `<a class="text-button" href="https://t.me/${e(config.botUsername)}" target="_blank" rel="noopener noreferrer">Вернуться в Telegram ↗</a>` : ''}</div></article>`;
    } else if (path === '/notifications') {
      const preference = await api<{ remindersEnabled: boolean; updatesEnabled: boolean }>('/notifications');
      html = heading('Только нужные сигналы.', 'Управляйте уведомлениями здесь или командой /notifications в боте.') + `<form id="notification-form" class="panel"><label><input type="checkbox" name="remindersEnabled" ${preference.remindersEnabled ? 'checked' : ''}><span><strong>Напоминания о подписке</strong><small> За 3 дня, за сутки и после окончания срока.</small></span></label><label><input type="checkbox" name="updatesEnabled" ${preference.updatesEnabled ? 'checked' : ''}><span><strong>Заказы и продления</strong><small> Важные изменения статусов без повторных сообщений.</small></span></label><p class="small">Необязательные уведомления включаются только по вашему выбору. Ответы бота и сообщения для входа работают независимо.</p><button class="primary">Сохранить настройки</button></form>`;
    } else if (path === '/orders' || path === '/history') html = heading(path === '/orders' ? 'История без пробелов.' : 'История подписок.', 'Поиск, статусы и стабильная постраничная загрузка ваших записей.') + `<div class="actions"><a class="text-button" href="#/orders">Заказы</a><a class="text-button" href="#/history">Подписки</a></div><section class="panel" id="account-list" data-resource="${path === '/orders' ? 'orders' : 'subscriptions'}"></section>`;
    else if (path === '/support') html = heading('Мы на связи.', 'Опишите вопрос. Обращение будет доступно здесь и в Telegram.') + '<form id="support-form" class="panel"><label for="support-text">Чем можем помочь?</label><textarea id="support-text" name="text" required minlength="5" maxlength="4000" rows="4" placeholder="Опишите ситуацию. Пароли и коды входа присылать не нужно."></textarea><button class="primary">Отправить обращение</button><p class="small">От 5 до 4000 символов. Ответы и статусы — в общей истории.</p></form><div class="section-heading"><h2>Ваши обращения</h2></div><section class="panel" id="account-list" data-resource="tickets"></section>';
    else if (path === '/profile') html = heading('Это ваше пространство.', 'Аккаунт, настройки и полезные разделы.') + `<div class="cards two"><article class="panel"><div class="profile-avatar">${icon('user')}</div><span class="eyebrow">TELEGRAM / ПРОВЕРЕННЫЙ АККАУНТ</span><h2>Вы подключены.</h2><p>Сайт и Mini App используют серверную сессию одного аккаунта. Подписки и история сохраняются между устройствами.</p><p class="profile-id">ID аккаунта: ${e(me.id)}</p><p class="small">Роль: ${me.role === 'ADMIN' ? 'Администратор' : 'Пользователь'}</p><button class="text-button" data-logout>Выйти из аккаунта</button></article><div class="quick-links">${quickLink('/notifications','Уведомления','Выберите нужные сообщения','bell')}${quickLink('/history','История подписок','Предыдущие сроки и статусы','clock')}${quickLink('/instructions','Инструкции','Подключение, Mini App и ответы','shield')}${quickLink('/support','Поддержка','Ваши обращения в одном месте','chat')}${me.role === 'ADMIN' ? quickLink('/admin','Администрирование','Диагностика, записи и настройки','grid') : ''}</div></div>`;
    else if (path === '/admin') { if (me.role !== 'ADMIN') throw new ApiError(403,'ADMIN_REQUIRED'); html = adminPage(await api<Admin>('/admin')); }
    if (current !== generation) return;
    page.innerHTML = html; bind();
    const adminRoot = document.querySelector<HTMLElement>('#admin-lists'); if (adminRoot) adminLists.mount(adminRoot);
    const accountRoot = document.querySelector<HTMLElement>('#account-list'); if (accountRoot) accountLists.mount(accountRoot, accountRoot.dataset.resource as 'orders' | 'subscriptions' | 'tickets');
    const authPanel = document.querySelector<HTMLElement>('#auth-panel'); if (authPanel) loginView.mount(authPanel);
    page.classList.add('route-enter');
  } catch (err) {
    if (current !== generation) return;
    if (err instanceof ApiError && err.status === 401) { me = null; identity(); }
    page.innerHTML = `<div class="empty-state panel">${icon('shield')}<h2>${err instanceof ApiError && err.status === 403 ? 'Доступ ограничен' : 'Небольшая пауза.'}</h2><p>${e(errorText(err))}</p><div class="actions"><button id="reload" class="secondary">Повторить</button>${!me ? '<a class="link-primary" href="#/login">Войти через Telegram</a>' : ''}</div></div>`;
    $('#reload').onclick = () => { void route(); };
  } finally { if (current === generation) { page.setAttribute('aria-busy', 'false'); page.focus({ preventScroll: true }); } }
}

function adminPage(a: Admin) {
 const stats:Record<string,string>={users:'Пользователей',active:'Активных подписок',orders:'Заказов',servers:'VPS',occupied:'Занято мест',available:'Свободно мест',errors:'Ошибок',revenueMinor:'Демо-выручка',expenseMinor:'Демо-расходы'};
 return heading('Админ-панель','Серверная пагинация и диагностика. Доступ проверяет Backend.')+`<div class="stats">${Object.entries(a.stats).map(([k,v])=>`<div class="stat"><strong>${k.endsWith('Minor')?money(v):v}</strong><span>${stats[k]??e(k)}</span></div>`).join('')}</div><div id="admin-lists"></div><details class="panel admin-settings"><summary>Тарифы и параметры новых VPS</summary><div class="cards two">${a.plans.map(p => `<form class="panel plan-form" data-plan="${p.id}"><h3>${e(p.name)}</h3><label>Цена, копейки<input name="price" type="number" min="0" max="10000000" value="${p.price}" required></label><label>Дней<input name="durationDays" type="number" min="1" max="365" value="${p.durationDays}" required></label><label>Мест на VPS (1–3)<input name="maxUsersPerServer" type="number" min="1" max="3" value="${p.maxUsersPerServer}" required></label><label><input name="isActive" type="checkbox" ${p.isActive ? 'checked' : ''}> Тариф активен</label><button class="primary">Сохранить тариф</button></form>`).join('')}<form id="settings-form" class="panel"><h3>Параметры новых VPS</h3>${a.settings.filter(s => ['server.monthly_cost_minor', 'server.rental_days', 'server.default_capacity'].includes(s.key)).map(s => `<label>${e(({ 'server.monthly_cost_minor': 'Аренда, копейки', 'server.rental_days': 'Период аренды, дней', 'server.default_capacity': 'Мест на новом VPS' } as Record<string, string>)[s.key])}<input name="${s.key}" type="number" min="1" max="${s.key.endsWith('capacity') ? 3 : s.key.endsWith('days') ? 365 : 10000000}" value="${Number(s.value)}" required></label>`).join('')}<button class="primary">Сохранить параметры</button></form></div></details>`;
}

function bind() {
  document.querySelectorAll<HTMLButtonElement>('[data-logout]').forEach(button => button.onclick = () => $('#login').click());
  document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(button => button.onclick = () => { void action(button, async () => { try { if (!navigator.clipboard) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(button.dataset.copy ?? ''); toast('Демо-идентификатор скопирован.'); } catch { toast('Скопировать не удалось. Выделите демо-идентификатор в карточке вручную.', 'error'); } }); });

 const notificationForm=document.querySelector<HTMLFormElement>('#notification-form');if(notificationForm)notificationForm.onsubmit=event=>{event.preventDefault();const data=new FormData(notificationForm);void action(notificationForm.querySelector('button')!,async()=>{await api('/notifications',{remindersEnabled:data.has('remindersEnabled'),updatesEnabled:data.has('updatesEnabled')});toast('Настройки уведомлений сохранены.');});};
  document.querySelectorAll<HTMLButtonElement>('[data-buy],[data-renew]').forEach(btn => btn.onclick = () => {
    if (!me) { location.hash = '/login'; return; }
    const operationKey = crypto.randomUUID();
    confirmAction(btn.dataset.renew ? 'Продлить подписку?' : 'Оформить тестовую подписку?', 'Платёж симулируется. Списание 0 ₽. При активной подписке период добавится к текущему окончанию.', async () => {
      const order = await api<Order>('/orders', { planId: btn.dataset.buy ?? btn.dataset.plan, operationKey, ...(btn.dataset.renew ? { renewalId: btn.dataset.renew } : {}) });
      await api(`/orders/${order.id}/payment`, { event: 'confirm' }); toast('Тестовая операция сохранена.'); location.hash = '/subscriptions';
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-cancel]').forEach(btn => btn.onclick = () => confirmAction('Отменить подписку?', 'Место освободится, история сохранится. Все суммы демонстрационные.', async () => { await api(`/subscriptions/${btn.dataset.cancel}/cancel`, {}); }));
  document.querySelectorAll<HTMLButtonElement>('[data-pay],[data-reject],[data-order-cancel],[data-retry],[data-refund]').forEach(btn => btn.onclick = () => confirmAction('Выполнить тестовую операцию?', 'Операция не связана с реальными деньгами.', async () => {
    if (btn.dataset.retry) await api(`/admin/orders/${btn.dataset.retry}/retry`, {});
    else if (btn.dataset.refund) await api(`/admin/orders/${btn.dataset.refund}/refund`, {});
    else await api(`/orders/${btn.dataset.pay ?? btn.dataset.reject ?? btn.dataset.orderCancel}/payment`, { event: btn.dataset.pay ? 'confirm' : btn.dataset.reject ? 'fail' : 'cancel' });
  }));
  const support = document.querySelector<HTMLFormElement>('#support-form');
  if (support) support.onsubmit = ev => { ev.preventDefault(); void action(support.querySelector('button')!, async () => { const t = await api<Ticket>('/support', { text: new FormData(support).get('text') }); toast(`Обращение №${t.number} сохранено`); await route(); }); };
  document.querySelectorAll<HTMLSelectElement>('[data-ticket]').forEach(select => select.onchange = () => { select.disabled = true; void api(`/admin/support/${select.dataset.ticket}`, { status: select.value }).then(() => toast('Статус сохранён')).catch(err => { toast(errorText(err)); void route(); }).finally(() => { select.disabled = false; }); });
  document.querySelectorAll<HTMLFormElement>('.plan-form').forEach(form => form.onsubmit = ev => { ev.preventDefault(); const data = new FormData(form); void action(form.querySelector('button')!, async () => { await api(`/admin/plans/${form.dataset.plan}`, { price: Number(data.get('price')), durationDays: Number(data.get('durationDays')), maxUsersPerServer: Number(data.get('maxUsersPerServer')), isActive: data.has('isActive') }); toast('Тариф сохранён.'); }); });
  const settings = document.querySelector<HTMLFormElement>('#settings-form');
  if (settings) settings.onsubmit = ev => { ev.preventDefault(); void action(settings.querySelector('button')!, async () => { for (const [key, value] of new FormData(settings)) await api('/admin/settings', { key, value: Number(value) }); toast('Параметры сохранены'); }); };
  const register = document.querySelector<HTMLButtonElement>('#register-webhook');
  if (register) register.onclick = () => { void action(register, async () => { await api('/admin/telegram/register', {}); toast('Webhook зарегистрирован'); }); };
  const status = document.querySelector<HTMLButtonElement>('#webhook-status');
  if (status) status.onclick = () => { void action(status, async () => { $('#webhook-result').textContent = JSON.stringify(await api('/admin/telegram/status'), null, 2); }); };
  document.querySelectorAll<HTMLAnchorElement>('.admin-tabs a').forEach(a => a.onclick = ev => { ev.preventDefault(); document.getElementById(a.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }); });
}
window.addEventListener('hashchange', () => { const token = takeLoginLink(window.location, window.history); if (token !== null) loginView.receiveLink(token); mini.feedback('selection'); void route(); });
window.addEventListener('pageshow', event => { if (event.persisted) { mini.start(); void route(); } });
window.addEventListener('pagehide', () => { loginView.unmount(); adminLists.unmount(); accountLists.unmount(); mini.destroy(); });
async function start() {
  // Preserve the canonical same-origin session and strip login fragments before loading Telegram.
  if (import.meta.env.MODE === 'production' && new URL(__API_BASE_URL__).origin !== location.origin) { location.replace(`${__API_BASE_URL__}/${location.hash}`); return; }
  try {
    config = await api('/auth/config');
    try { me = await api('/me'); } catch (err) { if (!(err instanceof ApiError) || err.status !== 401) throw err; }
    // Public browser pages become usable while the optional SDK is loading.
    if (!me && !window.Telegram?.WebApp?.initData && !location.hash.includes('tgWebApp') && ['/', '/catalog', '/instructions'].includes(appRoute(location.hash))) { identity(); await route(); }
    try { await script('https://telegram.org/js/telegram-web-app.js'); } catch { /* Browser fallback remains fully usable. */ }
    const telegram = window.Telegram?.WebApp;
    mini = new MiniAppBridge(telegram, document.documentElement, path => { location.hash = path; }); mini.start();
    // Telegram has already read its signed launch parameters. Keep them out of visible route/history.
    if (mini.active && location.hash.includes('tgWebApp')) history.replaceState(null, '', `${location.pathname}${location.search}#${appRoute(location.hash)}`);
    if (telegram?.initData) {
      try { me = await api('/auth/telegram', { initData: telegram.initData }); }
      catch (error) {
        // Auth validates signature and account binding before its replay check. Only that known replay can reuse the verified cookie.
        if (!(me && error instanceof ApiError && error.status === 401 && error.message === 'LOGIN_REPLAY')) { needsLogout = Boolean(me); me = null; throw error; }
      }
    }
  } catch (err) { toast(errorText(err), 'error'); }
  authReady = true; identity(); await route();
}
document.querySelector<HTMLAnchorElement>('.skip-link')!.onclick = event => { event.preventDefault(); $('#page').focus(); };
$('#page').innerHTML = loading();
void start();
