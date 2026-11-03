# AXON · Shared VPS Platform · Stage 1.6
Stage 1.5 опубликована на существующем Render: main/Live 947ca863096574fc8447065c3cebcbabb86d2b09 (проверено 01.11.2026). Stage 1.6 готовится в отдельной ветке/PR; без отдельного разрешения merge и deploy не выполняются.

Fastify + Prisma/PostgreSQL + Vite/TypeScript monorepo. Существующий @vpnaxon_bot становится основным интерфейсом, Mini App сохраняет полный функционал, обычный браузер показывает информационную витрину. Все интерфейсы используют общую базу и бизнес-логику. Только демонстрация: списание 0 ₽, виртуальные серверы, демонстрационные идентификаторы вместо настоящих VPN-ключей.

## Stage 1.6 · Telegram First
Пять вертикальных inline-действий, контекстные меню и безопасный возврат без перезаписи подтверждений. Динамический каталог, отдельные подготовка и подтверждение заказа, кабинет/история, полная переписка поддержки и инструкции в чате. Старая Reply Keyboard удаляется поддерживаемым механизмом. /start, /app, /login, /code и старые callbacks сохраняются.

PUBLIC_WEB_MODE=landing временно скрывает пользовательские веб-маршруты, сохраняя их код для будущего full. Mini App требует серверно проверенной initData-сессии; URL/SDK hints не дают права доступа. Защищённая браузерная админка остаётся доступной через /#/admin. Схема БД, SubscriptionEngine, queue/leases/retry/quarantine, уведомления и вместимость не переписываются.

## Документация
- [Stage 1.6](docs/stage-1.6.md), [проверки](docs/verification-stage1.6.md), [изменённые файлы](docs/changes-stage1.6.md), [контролируемый выпуск](docs/release-stage1.6.md).
- [Stage 1.5](docs/stage-1.5.md), [инструкции](docs/instructions-stage1.5.md), [поддержка](docs/support-stage1.5.md), [инциденты/компенсации](docs/incidents-stage1.5.md).
- [Вместимость/экономика](docs/capacity-economics-stage1.5.md), [официальные источники Aeza и открытые вопросы](docs/aeza-review-stage1.5.md).
- [Безопасность Stage 1.5](docs/security-stage1.5.md), [сохранение функций](docs/preservation-stage1.5.md), [критерии Demo Release 1.0](docs/demo-release-1.0.md).
- [Облачная схема](docs/cloud-deployment.md), [восстановление](docs/backup-recovery.md).
- История: [Stage 1.4](docs/stage-1.4.md), [Stage 1.3](docs/stage-1.3.md), [Stage 1.2.5](docs/stage-1.2.5.md).

## Проверки и эксплуатационные границы
Node 22.22.2 / pnpm 10.34.4. GitHub Actions выполняет build, typecheck, unit/integration/browser, Prisma/cloud validation и web artifact verification. PostgreSQL CI изолирован от production. Browser workflow использует реальный web artifact, API fixtures и имитацию Telegram SDK. Preview меню бота не выдаётся за настоящий Telegram-клиент. Пользователю не нужен локальный терминал.

Render shared-vps-api и Neon patient-queen-83814443 остаются существующими. Runtime DATABASE_URL — pooled; migration secret NEON_MIGRATION_DATABASE_URL — direct. Stage 1.6 не добавляет миграций или env. Секреты не публикуются. Capacity 3, gate 4 выключен; цены и production-данные не меняются.

Render Free может засыпать; inline tasks и доставка работают при запущенном API. Always-on SLA, настоящие платежи/VPS/VPN, новые платные ресурсы и коммерческий запуск не входят в этот этап. Реальная приёмка новой версии в Telegram и на устройствах выполняется после отдельно разрешённой публикации.

Дополнение Stage 1.6: [заменяемые баннеры и Premium-эмодзи бота](docs/stage-1.6-bot-visual.md) — отдельный PR, до согласованного выпуска не production.
