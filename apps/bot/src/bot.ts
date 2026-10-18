import { Bot } from 'grammy';
import { registerStart } from './commands/start.js';
import { registerMenu } from './handlers/menu.js';
import { ApiClient } from './services/api-client.js';
export function createBot(token: string, apiUrl: string, webUrl: string) {
  const bot = new Bot(token);
  registerStart(bot);
  registerMenu(bot, new ApiClient(apiUrl), webUrl);
  return bot;
}
