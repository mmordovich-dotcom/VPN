import { escapeHtml as e, icon, statusBadge } from './axon-ui.js';
/** Presentation only. No sessions, prices, mutations or Telegram identity are resolved here. */
export function liquidHero() {
 return '<section class="liquid-hero"><div class="liquid-hero-copy"><span class="eyebrow">AXON / ВАШ ЛИЧНЫЙ РИТМ</span><h1>Ваше<br><span>пространство.</span></h1><p>Всё важное — рядом.<br>Подписка, история и поддержка.</p><a class="hero-shortcut" href="#/instructions">Как это работает '+icon('arrow')+'</a></div><div class="liquid-sculpture" aria-hidden="true"><div class="sculpture-halo"></div><div class="sculpture-ring ring-back"></div><div class="sculpture-lens"><span>A</span></div><div class="sculpture-ring ring-front"></div><i class="sculpture-star"></i></div></section>';
}
export function dashboardStatus(s:{id:string;planId:string;name:string;status:string;days:number;expiry:string}|null) {
 return s ? '<article class="panel dashboard-status"><div class="card-top"><span class="eyebrow">ВАША ПОДПИСКА / '+e(s.name)+'</span>'+statusBadge(s.status)+'</div><div class="dashboard-time"><strong>'+s.days+'</strong><div><span>дней осталось</span><small>до '+e(s.expiry)+'</small></div><span class="time-symbol" aria-hidden="true">'+icon('layers')+'</span></div><div class="actions"><a class="link-primary" href="#/connect">Открыть подписку '+icon('arrow')+'</a><button class="secondary" data-renew="'+e(s.id)+'" data-plan="'+e(s.planId)+'" aria-label="Продлить демо">'+icon('renew')+'</button></div><p class="mini-demo-note">DEMO · Без реального VPN-подключения</p></article>' : '<article class="panel dashboard-status"><div class="card-top"><span class="eyebrow">НАЧНИТЕ С AXON</span><span class="badge">DEMO</span></div><h2>Ваш первый шаг.</h2><p>Выберите тариф и попробуйте весь путь.<br>Демонстрационное списание — 0 ₽.</p><a class="link-primary" href="#/catalog">Выбрать тариф '+icon('arrow')+'</a></article>';
}
export function catalogIntro() {
 return '<aside class="catalog-intro"><span class="catalog-glyph" aria-hidden="true">'+icon('spark')+'</span><div><strong>Полный опыт. Без списаний.</strong><p>Тариф показывает условия. В демо вы платите 0 ₽.</p></div></aside>';
}
