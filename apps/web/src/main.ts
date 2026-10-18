import './styles/main.css';
import { renderHome } from './pages/home.js';
import { renderAdmin } from './pages/admin.js';
import { bindTheme } from './components/theme.js';
import { getHealth, getPlans } from './services/api.js';
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<div class="shell"><header><a class="brand" href="#/"><span class="brand-mark">S</span><span>Shared VPS <small>Platform</small></span></a><div class="header-actions"><span class="demo"><i></i> DEMO MODE</span><button id="theme" class="theme-button" aria-label="Переключить светлую и тёмную тему">◐</button></div></header><main id="page"></main><footer><span>Shared VPS Platform</span><span>Создаём основу. Двигаемся дальше.</span></footer></div>`;
bindTheme(document.querySelector<HTMLButtonElement>('#theme')!);
let generation = 0;
async function route() {
  const current = ++generation;
  const page = document.querySelector<HTMLElement>('#page')!;
  if (location.hash === '#/admin') { page.innerHTML = renderAdmin(); return; }
  page.innerHTML = renderHome();
  const notice = document.querySelector<HTMLElement>('#notice')!;
  const showNotice = (message: string) => { notice.textContent = message; notice.hidden = false; };
  document.querySelector('#subscription')!.addEventListener('click', () => showNotice('Личный кабинет и управление подпиской появятся на следующих этапах.'));
  document.querySelector('#catalog')!.addEventListener('click', () => { document.querySelector('#plan')!.scrollIntoView({ behavior: 'smooth', block: 'center' }); showNotice('Это демонстрационный тариф. Покупка подписок пока недоступна.'); });
  let checking = false;
  async function checkHealth() {
    if (checking) return;
    checking = true;
    const status = document.querySelector<HTMLElement>('#api-status')!;
    status.className = 'status loading'; status.textContent = 'Проверяем…';
    try { await getHealth(); if (generation === current) { status.className = 'status online'; status.textContent = 'Доступен'; } }
    catch { if (generation === current) { status.className = 'status offline'; status.textContent = 'Нет соединения'; showNotice('API временно недоступен или запускается после простоя. Подождите около минуты и нажмите «Проверить снова».'); } }
    finally { checking = false; }
  }
  document.querySelector('#refresh')!.addEventListener('click', () => { void checkHealth(); void loadPlans(); });
  void checkHealth();
  async function loadPlans() {
    const content = document.querySelector<HTMLElement>('#plan-content')!;
    try {
      const plans = await getPlans();
      if (generation !== current) return;
      const plan = plans.find(item => item.code === 'basic') ?? plans[0];
      if (!plan) { content.textContent = 'Активных тарифов пока нет.'; return; }
      content.innerHTML = '<h2></h2><div class="price"></div><p class="plan-period"></p><ul><li>Отдельный доступ для каждого пользователя</li><li>Независимый срок подписки</li><li class="capacity"></li></ul>';
      content.querySelector('h2')!.textContent = plan.name;
      content.querySelector('.price')!.textContent = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: plan.currency, maximumFractionDigits: 2 }).format(plan.price / 100);
      content.querySelector('.plan-period')!.textContent = `за ${plan.durationDays} дней`;
      content.querySelector('.capacity')!.textContent = `До ${plan.maxUsersPerServer} пользователей на сервер`;
    } catch { if (generation === current) content.textContent = 'Тариф пока недоступен. API может запускаться после простоя. Подождите около минуты и нажмите «Проверить снова».'; }
  }
  await loadPlans();
}
window.addEventListener('hashchange', () => { void route(); });
void route();
