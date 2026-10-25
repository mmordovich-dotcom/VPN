import { digest } from './auth.js';
export type LoginAction = { type: 'CLAIM'; tokenHash: string } | { type: 'LINK' | 'CODE' | 'INVALID' } | { type: 'CONFIRM' | 'CANCEL'; requestId: string };
export function loginAction(text: string): LoginAction | undefined {
  const claim = /^\/start(?:@\w+)? login_([A-Za-z0-9_-]{43})$/.exec(text);
  if (claim) return { type: 'CLAIM', tokenHash: digest(claim[1]!) };
  if (/^\/start(?:@\w+)? login_/.test(text)) return { type: 'INVALID' };
  const callback = /^login:(yes|no):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(text);
  if (callback) return { type: callback[1] === 'yes' ? 'CONFIRM' : 'CANCEL', requestId: callback[2]! };
  if (/^\/login(?:@\w+)?$/.test(text) || ['/start cabinet', 'Личный кабинет / Войти на сайт', 'login:link'].includes(text)) return { type: 'LINK' };
  if (/^\/code(?:@\w+)?$/.test(text) || ['/start code', 'Получить код входа', 'login:code'].includes(text)) return { type: 'CODE' };
  return undefined;
}
