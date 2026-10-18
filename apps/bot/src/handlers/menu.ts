import type { Bot } from 'grammy';
import type { ApiClient } from '../services/api-client.js';
export function registerMenu(bot: Bot, api: ApiClient, webUrl: string) {
  bot.hears('Каталог', async ctx => {
    try { await api.health(); await ctx.reply('Backend доступен. Покупка подписок появится на следующем этапе.'); }
    catch { await ctx.reply('Сейчас Backend недоступен. Попробуйте позже.'); }
  });
  bot.hears('Моя подписка', ctx => ctx.reply('Управление подпиской появится на следующих этапах. Сейчас работает только демоверсия.'));
  bot.hears('Открыть приложение', ctx => ctx.reply(`Веб-приложение: ${webUrl}\nЛокальный адрес открывается на компьютере, где запущен проект.`));
  bot.hears('Поддержка', ctx => ctx.reply('Служба поддержки ещё не подключена. Инструкции находятся в README проекта.'));
}
