import type {PublicWebMode} from '@shared-vps/shared';
export function applicationVisible(mode:PublicWebMode, telegramLaunch:boolean, verifiedMiniApp:boolean) {
  return mode==='full'||(telegramLaunch&&verifiedMiniApp);
}
export function administrativeRoute(path:string, hash:string, role:string|undefined) {
  if(path==='/admin'||path==='/login')return true;
  return path==='/support' && role==='ADMIN' && new URLSearchParams(hash.split('?')[1]??'').get('admin')==='1';
}
export function telegramLanding() {
  return '<section class="telegram-landing"><div class="landing-orbit" aria-hidden="true"><span>A</span></div><span class="eyebrow">AXON / TELEGRAM FIRST</span><h1>Всё необходимое.<br><span>Внутри Telegram.</span></h1><p class="lead">Управляйте подпиской, открывайте инструкции и обращайтесь в поддержку через бота или Mini App.</p><p class="landing-notice">Сейчас все пользовательские функции AXON доступны в Telegram. Полноценная веб-версия появится позже.</p><a class="link-primary landing-cta" href="https://t.me/vpnaxon_bot" target="_blank" rel="noopener noreferrer">Открыть AXON в Telegram <span aria-hidden="true">↗</span></a><div class="landing-features"><article class="panel"><span class="eyebrow">01 / БОТ</span><h2>Все действия в чате.</h2><p>Подписка, продление и поддержка — через понятное меню под сообщением.</p></article><article class="panel"><span class="eyebrow">02 / MINI APP</span><h2>Ваше пространство.</h2><p>Полный визуальный интерфейс внутри Telegram. Один аккаунт, общие подписки и история.</p></article><article class="panel"><span class="eyebrow">03 / ПОДДЕРЖКА</span><h2>Ответ остаётся рядом.</h2><p>Обращения, переписка и инструкции доступны в существующем @vpnaxon_bot.</p></article></div><div class="status-note">Демонстрационная версия. Списание 0 ₽. Реальные платежи и VPN-подключения недоступны. Эта страница пока не заменяет Telegram при его недоступности.</div></section>';
}
