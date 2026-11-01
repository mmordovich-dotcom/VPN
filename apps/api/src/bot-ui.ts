export const appLabel = 'Открыть приложение';
export type BotButton = { text: string; callback_data?: string; web_app?: {url:string}; url?:string; style?:'primary'|'success'|'danger' };
export const inline = (items: BotButton[][]) => ({inline_keyboard:items});
export function miniAppButton(origin: string | undefined, path = '/') {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const route = ['/', '/connect', '/subscriptions', '/orders', '/support'].includes(path) ? path : '/';
    return { text:'Открыть Mini App · AXON', style:'primary' as const, web_app:{url:url.origin+'/#'+route} };
  } catch { return null; }
}
export function inlineMainMenu(origin:string|undefined) {
  const app=miniAppButton(origin);
  return inline([
    [{text:'⚡ Подключиться',callback_data:'n:buy',style:'success'}],
    [{text:'👤 Личный кабинет',callback_data:'n:account'}],
    [{text:'📖 Инструкции',callback_data:'n:help'}],
    [{text:'💬 Поддержка',callback_data:'n:support'}],
    ...(app?[[{...app,text:'📱 Открыть приложение'}]]:[[{text:'📱 Открыть приложение',callback_data:'n:app'}]]),
  ]);
}
/** Only new navigation messages use n:. Receipts and old messages open a NEW menu with o:. */
export function contextualKeyboard(markup:object, immutable=false):object {
  const rows=(markup as {inline_keyboard?:BotButton[][]}).inline_keyboard;
  if(!rows)return markup;
  return inline(rows.map(row=>row.map(button=>{
    const data=button.callback_data;
    if(data?.startsWith('n:')&&immutable)return {...button,callback_data:'o:'+data.slice(2)};
    if(!data || /^(n:|o:|checkout:|checkout-renew:|stop:|confirm:|cancel:|support:close:|login:)/.test(data))return button;
    return {...button,callback_data:(immutable?'o:':'n:')+data};
  })));
}
export function withoutButtonStyles(body:Record<string,unknown>) {
  const markup=body.reply_markup as {inline_keyboard?:BotButton[][]}|undefined;
  if(!markup?.inline_keyboard)return body;
  return {...body,reply_markup:inline(markup.inline_keyboard.map(row=>row.map(({style:_style,...button})=>button)))};
}
export const botStatus = (value: string) => ({ ACTIVE:'Активна', EXPIRED:'Срок закончился', CANCELLED:'Отменена', COMPLETED:'Завершён', PAID:'Ожидает активации', PROCESSING:'Выполняется', AWAITING_PAYMENT:'Ожидает подтверждения', OPEN:'Открыто', WAITING_ADMIN:'Ожидает ответа', WAITING_USER:'Нужен ваш ответ', WAITING_PROVIDER:'Проверяем инфраструктуру', IN_PROGRESS:'В работе', CLOSED:'Закрыто', FAILED:'Не выполнен' } as Record<string,string>)[value]??value;
export function botError(code:string) {
 return ({ORDER_NOT_FOUND:'Этот заказ недоступен. Откройте историю из кабинета.',INVALID_BUTTON:'Кнопка устарела. Начните действие заново из меню.',USE_RENEWAL:'У вас уже есть подписка. Выберите «Продлить».',ORDER_IN_PROGRESS:'У вас есть незавершённый заказ. Откройте историю.',PAYMENT_FINAL:'Заказ уже обработан. Результат сохранён в истории.',RATE_LIMITED:'Слишком много быстрых действий. Подождите минуту и повторите.',TICKET_CLOSED:'Обращение закрыто. История сохранена; при новом вопросе создайте обращение.',TICKET_NOT_FOUND:'Обращение недоступно. Откройте список своих обращений.'} as Record<string,string>)[code]??'Действие сейчас недоступно. Вернитесь в меню и проверьте актуальный статус. Данные сохранены.';
}

export function supportChunks(text:string){let cut=3000;const code=text.charCodeAt(cut-1);if(code>=0xD800&&code<=0xDBFF)cut--;return text.length>cut?[text.slice(0,cut),text.slice(cut)]:[text];}
