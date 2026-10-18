# Telegram Stage 1.2

Рабочий webhook-контроллер: `../api/src/telegram.ts`. Использует общий
SubscriptionEngine и PostgreSQL. Отдельный polling не запускается.
Прежние createBot/commands/client сохранены с тестами как фундамент Stage 1.1;
они не являются production entry point Stage 1.2. См. ../../docs/telegram.md.
