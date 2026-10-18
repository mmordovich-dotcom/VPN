# Изменения Stage 1.2 относительно Stage 1.1.1

Это обновление того же monorepo. Исходные версии Stage 1.1.1 и standalone preview
сохранены отдельно и не редактировались. Корневая структура apps/packages, версии
инструментов, pnpm-lock.yaml, исходная миграция и её SQL-защита сохранены.

Главные новые файлы: engine.ts (подписки, mock-платежи и durable VPS), auth.ts
(OIDC/initData/сессии), platform.ts (пользовательские и ADMIN API), telegram.ts
(кнопочный webhook/inbox/outbox), static.ts (единый origin), web/src/unified.ts
(интерфейс), добавочная миграция и интеграционные тесты. CSS перенесён из WebDemo
с небольшими дополнениями для форм, меню и защищённого кабинета. Локальная бизнес-
модель WebDemo и переключатель пользователей не используются.

Из прежних тестов изменилось только ожидание старого отсутствующего admin endpoint:
теперь проверяется обязательная авторизация. Исправленный P2003-тест сохранён.
CI сохранён и дополнен проверкой собранного браузерного артефакта. Зависимости
и lockfile не менялись. Отдельный polling entry point больше не потребляет updates:
бот работает через тот же Fastify webhook. Старые модули/тесты bot сохранены.

## Точные пути изменённых и новых файлов

- `.env.example`
- `.github/workflows/verify.yml`
- `README.md`
- `apps/api/src/app.ts`
- `apps/api/src/auth.ts` — новый
- `apps/api/src/engine.ts` — новый
- `apps/api/src/main.ts`
- `apps/api/src/modules/admin/README.md`
- `apps/api/src/modules/orders/README.md`
- `apps/api/src/modules/payments/README.md`
- `apps/api/src/modules/plans/routes.ts`
- `apps/api/src/modules/servers/README.md`
- `apps/api/src/modules/subscriptions/README.md`
- `apps/api/src/modules/users/README.md`
- `apps/api/src/platform.ts` — новый
- `apps/api/src/plugins/database.ts`
- `apps/api/src/plugins/errors.ts`
- `apps/api/src/static.ts` — новый
- `apps/api/src/telegram.ts` — новый
- `apps/api/tests/app.test.ts`
- `apps/bot/README.md` — новый
- `apps/bot/src/main.ts`
- `apps/web/index.html`
- `apps/web/src/styles/main.css`
- `apps/web/src/unified.ts` — новый
- `apps/web/vite.config.ts`
- `apps/worker/src/main.ts`
- `docs/architecture.md`
- `docs/cloud-architecture.md`
- `docs/cloud-deployment.md`
- `docs/cloud-quickstart.md`
- `docs/cloud-verification.md`
- `docs/database.md`
- `docs/miniapp.md` — новый
- `docs/stages.md`
- `docs/telegram.md` — новый
- `docs/verification-stage1.2.md` — новый
- `docs/verification.md`
- `package.json`
- `packages/database/prisma/migrations/20261016000000_unified/migration.sql` — новый
- `packages/database/prisma/schema.prisma`
- `packages/database/tests/unified.integration.test.ts` — новый
- `packages/runtime/src/env.ts`
- `packages/runtime/src/logger.ts`
- `packages/runtime/tests/logger.test.ts` — новый
- `render.yaml`
- `scripts/validate-cloud.ts`
- `scripts/verify-web-artifact.ts` — новый
- `docs/changes-stage1.2.md` — этот отчёт
