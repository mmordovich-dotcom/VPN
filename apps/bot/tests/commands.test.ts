import { it, expect, vi, afterEach } from 'vitest';
import { createBot } from '../src/bot.js';
import type { Transformer } from 'grammy';

afterEach(() => vi.unstubAllGlobals());
async function receive(text: string) {
  const bot = createBot('123456:offline-test-token', 'http://127.0.0.1:3000', 'http://localhost:5173');
  bot.botInfo = { id: 123456, is_bot: true, first_name: 'Offline Test', username: 'offline_test_bot', can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false, allows_users_to_create_topics: false, can_manage_bots: false, supports_join_request_queries: false };
  const replies: Record<string, unknown>[] = [];
  // The fixture implements only sendMessage, guarded below; Telegram's generic
  // Transformer signature also permits methods this fixture must never call.
  const offlineTelegram = async (_previous: unknown, method: string, payload: unknown) => {
    if (method !== 'sendMessage') throw new Error('Unexpected Telegram API method');
    replies.push(payload as Record<string, unknown>);
    return { ok: true, result: { message_id: 2, date: 1, chat: { id: 1, type: 'private', first_name: 'Test' }, text: String((payload as Record<string, unknown>).text) } };
  };
  bot.api.config.use(offlineTelegram as Transformer);
  await bot.handleUpdate({ update_id: 1, message: { message_id: 1, date: 1, from: { id: 1, is_bot: false, first_name: 'Test' }, chat: { id: 1, type: 'private', first_name: 'Test' }, text,
    ...(text.startsWith('/') ? { entities: [{ type: 'bot_command' as const, offset: 0, length: text.length }] } : {}),
  } });
  return replies;
}
it('/start returns the welcome text and all four menu buttons offline', async () => {
  const replies = await receive('/start');
  expect(replies).toHaveLength(1);
  expect(replies[0]?.text).toBe('Добро пожаловать в Shared VPS Platform! Это демонстрационная версия системы.');
  expect(replies[0]?.reply_markup).toMatchObject({ keyboard: [[{ text: 'Каталог' }, { text: 'Моя подписка' }], [{ text: 'Открыть приложение' }, { text: 'Поддержка' }]] });
});
it('catalog handles Backend connection failure without a Telegram network request', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const replies = await receive('Каталог');
  expect(replies[0]?.text).toContain('Backend недоступен');
});
