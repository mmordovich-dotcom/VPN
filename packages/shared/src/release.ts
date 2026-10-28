export const RELEASE = { stage: '1.5', version: '0.5.0', demo: true } as const;
export const supportCategories = { SUBSCRIPTION: 'Подписка и продление', ACCOUNT: 'Вход и аккаунт', INSTRUCTIONS: 'Инструкции', UNAVAILABLE: 'Сервис недоступен', APP: 'Сайт или Mini App', OTHER: 'Другой вопрос' } as const;
export type SupportCategory = keyof typeof supportCategories;
export const supportStatuses = { OPEN: 'Новое', WAITING_ADMIN: 'Ожидает ответа поддержки', IN_PROGRESS: 'В работе', WAITING_PROVIDER: 'Уточняем у провайдера', WAITING_USER: 'Ожидает вашего ответа', CLOSED: 'Закрыто' } as const;
export type SupportStatus = keyof typeof supportStatuses;
export const instructionPlatforms = ['Android', 'iOS', 'Windows', 'macOS'] as const;
export const purchaseGuidance = 'После оформления вы получите пошаговую инструкцию в личном кабинете и Telegram-боте. Инструкцию можно открыть повторно в любое время.';
export const purchaseSteps = ['Подтвердите демонстрационный заказ: списание 0 ₽.', 'Дождитесь статуса «Подписка активна».', 'Откройте инструкцию и свою подписку.', 'Если возник вопрос, напишите в поддержку.'] as const;
export const demoInstructions = [
  { title: 'Откройте свою подписку', text: 'На сайте или в Mini App выберите «Подписка». В боте нажмите «Моя подписка».' },
  { title: 'Проверьте статус и срок', text: 'Демонстрационный доступ появляется только после активации. Если заказ ещё обрабатывается, обновите статус в истории.' },
  { title: 'Посмотрите демонстрационный идентификатор', text: 'Откройте «Подключение». Идентификатор обозначает вашу демо-подписку. Это не VPN-ключ; вставлять его в сторонние приложения не нужно.' },
  { title: 'Оставайтесь в AXON', text: 'На Android, iOS, Windows и macOS используйте сайт или существующего Telegram-бота. Устанавливать VPN-клиент, импортировать конфигурацию или менять сеть не требуется.' },
  { title: 'Поддержка рядом', text: 'Если статус или инструкция недоступны, откройте «Поддержка» и выберите тему. Не отправляйте пароли, токены и коды входа.' },
] as const;
export function instructionText(platform?: string) { return 'AXON · Инструкция' + (platform ? ' · ' + platform : '') + '\n\n' + demoInstructions.map((s, i) => (i + 1) + '. ' + s.title + '\n' + s.text).join('\n\n') + '\n\nДемо-режим: настоящих платежей, VPS и VPN-доступа нет.'; }
export type FinancialInput = { price: number; rent: number; users: number; capacity: number; otherCosts: number; reserve: number; budget: number };
export const financialDefaults: FinancialInput = { price: 17000, rent: 20000, users: 3, capacity: 3, otherCosts: 0, reserve: 0, budget: 30000 };
export function financialScenario(input: FinancialInput) {
  const { price, rent, users, capacity, otherCosts, reserve, budget } = input;
  if (Object.values(input).some(v => !Number.isSafeInteger(v) || v < 0 || v > 100000000) || ![3, 4].includes(capacity) || users > capacity) throw new Error('INVALID_SCENARIO');
  const revenue = price * users; const directCosts = rent; const remainingAfterRent = revenue - directCosts;
  const operatingResult = remainingAfterRent - otherCosts; const afterReserve = operatingResult - reserve;
  const breakEvenUsers = price === 0 ? null : Math.ceil((directCosts + otherCosts + reserve) / price);
  return { ...input, revenue, directCosts, remainingAfterRent, operatingResult, afterReserve, breakEvenUsers,
    feasible: breakEvenUsers !== null && breakEvenUsers <= capacity, startupGap: Math.max(0, directCosts + otherCosts - budget),
    nextMonthNeed: directCosts + otherCosts, nextMonthGap: Math.max(0, directCosts + otherCosts - Math.max(0, operatingResult)),
    underfill: Array.from({ length: capacity + 1 }, (_, count) => ({ users: count, revenue: count * price, afterReserve: count * price - directCosts - otherCosts - reserve })),
    note: 'Сценарий одного виртуального сервера. Аренда — неподтверждённое допущение, не цена Aeza. Остаток после аренды не является чистой прибылью. Налоги, комиссии и юридические расходы учитываются отдельно.' };
}
