export const TELEGRAM_LOGIN_ORIGIN = 'https://oauth.telegram.org';

export function telegramLoginUrl(clientId: string, nonce: string, page: { origin: string; pathname: string }): string {
  const origin = new URL(page.origin);
  if (origin.origin !== page.origin || !['https:', 'http:'].includes(origin.protocol)
    || !/^\d+$/.test(clientId) || !/^[a-f0-9]{64}$/.test(nonce)
    || !page.pathname.startsWith('/') || page.pathname.startsWith('//') || /[?#]/.test(page.pathname)) {
    throw new Error('Invalid Telegram login configuration');
  }
  const url = new URL('/auth', TELEGRAM_LOGIN_ORIGIN);
  url.search = new URLSearchParams({ response_type: 'post_message', client_id: clientId,
    origin: page.origin, redirect_uri: page.origin + page.pathname,
    scope: 'openid profile', nonce, lang: 'ru' }).toString();
  return url.toString();
}

type LoginResult = { id_token: string } | { error: string };
export function telegramLoginMessage(event: { origin: string; source: unknown; data: unknown }, popup: unknown): LoginResult | null {
  if (!popup || event.origin !== TELEGRAM_LOGIN_ORIGIN || event.source !== popup) return null;
  let data: unknown = event.data;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return null; } }
  if (!data || typeof data !== 'object' || !('event' in data) || data.event !== 'auth_result') return null;
  if ('error' in data && typeof data.error === 'string') return { error: 'Telegram login was not confirmed' };
  if (!('result' in data) || typeof data.result !== 'string' || !data.result || data.result.length > 16000) return null;
  return { id_token: data.result };
}

export function openTelegramLogin(clientId: string, nonce: string, callback: (result: { id_token?: string }) => void): boolean {
  const url = telegramLoginUrl(clientId, nonce, window.location);
  let popup: Window | null = null;
  let timer: number | undefined;
  let finished = false;
  const deadline = Date.now() + 300000;
  const cleanup = () => { window.removeEventListener('message', receive); if (timer !== undefined) window.clearInterval(timer); };
  const finish = (result: { id_token?: string }) => { if (finished) return; finished = true; cleanup(); popup?.close(); callback(result); };
  const receive = (event: MessageEvent) => {
    const result = telegramLoginMessage(event, popup);
    if (result) finish('id_token' in result ? result : {});
  };
  window.addEventListener('message', receive);
  popup = window.open(url, 'shared-vps-telegram-login', 'width=550,height=650,status=0,menubar=0,toolbar=0');
  if (!popup) { cleanup(); return false; }
  timer = window.setInterval(() => { if (popup?.closed || Date.now() >= deadline) finish({}); }, 500);
  return true;
}
