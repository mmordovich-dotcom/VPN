# Изменения Stage 1.4

Основание — опубликованный Stage 1.3, main 4acccb010eb23ad88a937abe703cb458e825c21e. Stage 1.4 готовится отдельным PR, без изменения production.

## Реализация

- Единая AXON-система: монохромные темы, стеклянные панели, локальные SVG/CSS-графика и адаптивная навигация.
- Общие dashboard, каталог, подписки, продление, подключение, история заказов и подписок, поддержка, уведомления, профиль, вход и ADMIN-раздел для сайта и Mini App.
- Мини-приложение использует необязательный Telegram SDK bridge, safe areas, тему, native Back/Settings и haptics; обычный браузер сохраняет все допустимые действия.
- Проверка подписанного Telegram запуска даже при существующей cookie: личные экраны скрыты до проверки текущего аккаунта. Прежние бот-подтверждение, код и одноразовая ссылка сохраняются.
- Бот сохраняет быстрые покупки/продление/подключение/инструкции/поддержку в чате; добавлены /app, reply/inline вход в полное приложение, единые статусы и понятные ошибки.
- Админ-пагинация и диагностика Stage 1.3 остаются; формы настроек компактнее, статусы читаемее, таблицы доступны на мобильном экране.
- Тесты действующих бизнес-сценариев сохранены; добавлены SDK/bot/изолированные DB-сценарии и отдельные облачные Chromium-проверки.

## Граница изменений

Нет новой миграции, изменения schema.prisma, старых миграций, ядра SubscriptionEngine, jobs/inbox worker, backend auth/session validator, render.yaml, env или runtime-зависимостей. Новые файлы интерфейса заменяют представление, используя прежние API и серверную бизнес-логику. Изменения notifications.ts — только префикс текста; platform.ts — stage в публичном config.

bot-login.test.ts теперь ищет конкретный setWebhook среди вызовов, поскольку после него добавлен setChatMenuButton; проверка drop_pending_updates=false сохранена. unified.integration.test.ts проверяет понятный отказ для чужого заказа и отсутствие новых заказов/подписок. Эти проверки не удалены.

## Изменённые файлы

- [.github/workflows/axon-ui.yml](../.github/workflows/axon-ui.yml)
- [.gitignore](../.gitignore)
- [README.md](../README.md)
- [apps/api/src/bot-ui.ts](../apps/api/src/bot-ui.ts)
- [apps/api/src/notifications.ts](../apps/api/src/notifications.ts)
- [apps/api/src/platform.ts](../apps/api/src/platform.ts)
- [apps/api/src/telegram.ts](../apps/api/src/telegram.ts)
- [apps/api/tests/axon-bot.test.ts](../apps/api/tests/axon-bot.test.ts)
- [apps/api/tests/bot-login.test.ts](../apps/api/tests/bot-login.test.ts)
- [apps/web/index.html](../apps/web/index.html)
- [apps/web/public/assets/axon-mark.svg](../apps/web/public/assets/axon-mark.svg)
- [apps/web/src/account-lists.ts](../apps/web/src/account-lists.ts)
- [apps/web/src/admin-lists.ts](../apps/web/src/admin-lists.ts)
- [apps/web/src/axon-ui.ts](../apps/web/src/axon-ui.ts)
- [apps/web/src/mini-app.ts](../apps/web/src/mini-app.ts)
- [apps/web/src/styles/axon.css](../apps/web/src/styles/axon.css)
- [apps/web/src/unified.ts](../apps/web/src/unified.ts)
- [apps/web/tests/axon.test.ts](../apps/web/tests/axon.test.ts)
- [apps/web/tests/mini-app.test.ts](../apps/web/tests/mini-app.test.ts)
- [docs/architecture.md](../docs/architecture.md)
- [docs/changes-stage1.4.md](../docs/changes-stage1.4.md)
- [docs/cloud-deployment.md](../docs/cloud-deployment.md)
- [docs/miniapp.md](../docs/miniapp.md)
- [docs/stage-1.4.md](../docs/stage-1.4.md)
- [docs/stages.md](../docs/stages.md)
- [docs/telegram.md](../docs/telegram.md)
- [docs/verification-stage1.4.md](../docs/verification-stage1.4.md)
- [package.json](../package.json)
- [packages/database/tests/axon.integration.test.ts](../packages/database/tests/axon.integration.test.ts)
- [packages/database/tests/unified.integration.test.ts](../packages/database/tests/unified.integration.test.ts)
- [tests/ui/axon.spec.mjs](../tests/ui/axon.spec.mjs)
- [tests/ui/playwright.config.mjs](../tests/ui/playwright.config.mjs)

Результаты и границы проверки — [verification-stage1.4.md](verification-stage1.4.md).
