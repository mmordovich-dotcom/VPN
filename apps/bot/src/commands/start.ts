import type { Bot } from 'grammy';
import { mainKeyboard } from '../keyboards/main.js';
export function registerStart(bot: Bot) {
  bot.command('start', ctx => ctx.reply('Добро пожаловать в Shared VPS Platform! Это демонстрационная версия системы.', { reply_markup: mainKeyboard }));
}
