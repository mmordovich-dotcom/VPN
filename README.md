# AXON · Shared VPS Platform · Stage 1.5

Stage 1.4 опубликована на существующем Render. Stage 1.5 готовится в отдельной ветке/PR; без отдельного разрешения владельца merge и deploy не выполняются.

Fastify/Prisma/PostgreSQL + Vite/TypeScript monorepo. Сайт, существующий @vpnaxon_bot и полноценный Telegram Mini App используют один аккаунт, общую базу и бизнес-логику. Только демонстрация: списание 0 ₽, виртуальные серверы, демонстрационные идентификаторы вместо настоящих VPN-ключей.

## Stage 1.5

Общие инструкции до/после покупки; проверенный результат активации; переписка поддержки и категории; внутренние демо-инциденты, ручные провайдерские черновики, однократная компенсация временем; приватные пользовательские DTO; будущая вместимость 4 за выключенным разрешением при действующей модели 3; внутренний финансовый сценарий. Нового редизайна и реальных коммерческих интеграций нет.

Сохранены Telegram auth/сессии/одноразовые ссылки и коды, Mini App initData, покупки/продление/история, SubscriptionEngine с глобальной транзакционной блокировкой и SQL-инвариантами, PostgreSQL jobs/leases/retry/quarantine, уведомления, inline/standalone runtime, пагинация, админка, диагностика и техническая очистка без удаления бизнес-истории.

## Документация

- [Stage 1.5](docs/stage-1.5.md), [проверки](docs/verification-stage1.5.md), [изменённые файлы](docs/changes-stage1.5.md).
- [Инструкции](docs/instructions-stage1.5.md), [поддержка](docs/support-stage1.5.md), [инциденты/компенсации](docs/incidents-stage1.5.md).
- [Вместимость/экономика](docs/capacity-economics-stage1.5.md), [официальные источники Aeza и открытые вопросы](docs/aeza-review-stage1.5.md).
- [Безопасность](docs/security-stage1.5.md), [сохранение функций](docs/preservation-stage1.5.md), [критерии Demo Release 1.0](docs/demo-release-1.0.md).
- [План контролируемого выпуска](docs/release-stage1.5.md), [существующая облачная схема](docs/cloud-deployment.md), [восстановление](docs/backup-recovery.md).
- История: [Stage 1.4](docs/stage-1.4.md), [Stage 1.3](docs/stage-1.3.md), [Stage 1.2.5](docs/stage-1.2.5.md).

## Проверки в облаке

Node 22.22.2 / pnpm 10.34.4. GitHub Actions выполняет build, typecheck, unit/integration, Prisma validation, cloud validation и web artifact verification. Browser workflow проверяет реальный web artifact в Chromium с API fixtures и симуляцией Telegram SDK. Пользователю не нужен локальный терминал. Изолированные PostgreSQL-схемы CI не имеют доступа к production Neon.

Render shared-vps-api и Neon patient-queen-83814443 остаются существующими. Runtime DATABASE_URL — pooled; migration secret NEON_MIGRATION_DATABASE_URL — direct. Значения секретов не публикуются. Добавочная миграция Stage 1.5 сначала проверяется на отдельной ветке Neon. Reset/db push не применяются.

Render Free может засыпать; inline tasks и доставка работают при запущенном API. Always-on SLA, настоящие платежи/VPS/VPN и подтверждённая коммерческая модель не входят в демонстрационный выпуск. Реальная приёмка новой версии в Telegram и на устройствах выполняется после отдельно разрешённой публикации.
