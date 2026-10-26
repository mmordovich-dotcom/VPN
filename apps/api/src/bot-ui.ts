export const appLabel = 'Открыть приложение';
export function miniAppButton(origin: string | undefined, path = '/') {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const route = ['/', '/connect', '/subscriptions', '/orders', '/support'].includes(path) ? path : '/';
    return { text: 'Открыть Mini App · AXON', web_app: { url: `${url.origin}/#${route}` } };
  } catch { return null; }
}
export function inlineMainMenu(origin: string | undefined) {
  const app = miniAppButton(origin);
  return { inline_keyboard: [
    [{ text: 'Купить подписку', callback_data: 'buy' }, { text: 'Моя подписка', callback_data: 'subscription' }],
    [{ text: 'Подключиться', callback_data: 'connect' }, { text: 'Продлить', callback_data: 'renew' }],
    [{ text: 'Инструкции', callback_data: 'help' }, { text: 'Поддержка', callback_data: 'support' }],
    ...(app ? [[app]] : []),
    [{ text: 'Войти на сайт', callback_data: 'login:link' }, { text: 'Получить код', callback_data: 'login:code' }],
    [{ text: 'Уведомления', callback_data: 'notifications' }],
  ] };
}
export const botStatus = (value: string) => ({ ACTIVE: 'Активна', EXPIRED: 'Срок закончился', CANCELLED: 'Отменена', COMPLETED: 'Завершён', PAID: 'Ожидает активации', PROCESSING: 'Выполняется', AWAITING_PAYMENT: 'Ожидает подтверждения', OPEN: 'Открыто', IN_PROGRESS: 'В работе', CLOSED: 'Закрыто', FAILED: 'Не выполнен' } as Record<string,string>)[value] ?? value;
export function botError(code: string) {
  return ({ ORDER_NOT_FOUND: 'Этот заказ недоступен. Откройте актуальную подписку из меню.', INVALID_BUTTON: 'Кнопка устарела. Начните действие заново из меню.', USE_RENEWAL: 'У вас уже есть подписка. Для увеличения срока выберите «Продлить подписку».', ORDER_IN_PROGRESS: 'У вас есть незавершённый заказ. Проверьте его статус перед новой покупкой.', PAYMENT_FINAL: 'Заказ уже обработан. Его результат сохранён в истории.', RATE_LIMITED: 'Слишком много быстрых действий. Подождите минуту и повторите.' } as Record<string,string>)[code] ?? 'Действие сейчас недоступно. Вернитесь в меню и проверьте актуальный статус. Данные сохранены.';
}
