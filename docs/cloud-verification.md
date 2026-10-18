> Исторический документ Stage 1.1/1.1.1. Для Stage 1.2 используйте [облачную инструкцию](cloud-deployment.md), [архитектуру](architecture.md) и [актуальные проверки](verification-stage1.2.md).

# Отчёт Stage 1.1.1 — Cloud Deployment & GitHub Integration

Дата проверки: 15 октября 2026. Подготовлен проект для публикации через браузер; реальное развёртывание в аккаунтах пользователя не выполнялось.

## Сохранность Stage 1.1

Основа получена распаковкой проверенного `SharedVPS-Stage1.1.zip` из предыдущего этапа. Все **87 исходных файлов** сохранены, удалённых нет. Выполнено побайтовое сравнение с архивом: Prisma schema и вся история миграций, SQL-ограничения, provider, bot, worker, все существующие тесты, CSS, theme и home/admin templates не изменены. Все четыре приложения и четыре общих пакета остаются в monorepo. Существующие HTTP-маршруты и их JSON-контракты сохранены, включая Stage 1.1 в health/system — это версия базового контракта, а облачная конфигурация описана отдельно.

## Изменённые файлы

- `.env.example`
- `.github/workflows/verify.yml`
- `.gitignore`
- `README.md`
- `apps/web/package.json`
- `apps/web/src/main.ts`
- `apps/web/src/services/api.ts`
- `apps/web/vite.config.ts`
- `docs/stages.md`
- `package.json`
- `packages/runtime/src/env.ts`
- `pnpm-lock.yaml`

Причины изменений: `runtime/env.ts` поддерживает PORT/0.0.0.0 и проверяет production CORS/SSL. Конфигурация Vite и API-клиент встраивают проверенный адрес API на этапе сборки. У web есть отдельная строгая production-сборка; прежняя общая сборка остаётся пригодна для локальной работы. В `main.ts` добавлено понятное сообщение о пробуждении и повторная загрузка тарифа по кнопке. Раньше эта кнопка повторяла только health, поэтому после холодного старта тариф мог оставаться в ошибке. Дизайн не менялся. Manifest/lockfile добавляют cloud-команды и только dev-инструменты YAML/Ajv; gitignore дополнен исключениями ключей/сертификатов. README, env example и roadmap объясняют облачный путь. CI дополняет прежние проверки и позволяет безопасно переиспользовать их перед ручной миграцией.

## Добавленные файлы

- `.github/workflows/cloud-database.yml`
- `apps/api/tests/cloud-config.test.ts`
- `apps/web/config/api-url.ts`
- `apps/web/src/vite-env.d.ts`
- `apps/web/tests/cloud-url.test.ts`
- `docs/cloud-architecture.md`
- `docs/cloud-deployment.md`
- `docs/cloud-quickstart.md`
- `docs/cloud-verification.md`
- `docs/schemas/README.md`
- `docs/schemas/render.schema.json`
- `render.yaml`
- `scripts/cloud-database-config.ts`
- `scripts/cloud-database.ts`
- `scripts/validate-cloud.ts`

`render.yaml` задаёт Free API и Static Site без Render БД, worker, cron и дисков. `cloud-database.yml` выполняется только вручную, вызывает прежние проверки на временной БД и передаёт Neon secret только миграционному шагу основной ветки. `cloud-database.ts` выполняет migrate deploy и повторяемый seed через direct URL, не выводит потенциально чувствительный текст ошибок и не делает reset. Новые тесты покрывают облачные настройки. `validate-cloud.ts` использует сохранённую официальную JSON Schema Render и проверяет наши правила конфигурации/CI. Новая документация содержит браузерные шаги, архитектуру, ограничения и этот отчёт.

## Локально выполненные проверки

Среда: Windows x64, Node.js **22.22.2**, pnpm **10.34.4**, Prisma **6.19.3**, настоящая временная локальная **PostgreSQL 18.4**. Для этой проверки не создавались платные сервисы и не использовалась рабочая Neon-база.

| Проверка | Фактический результат |
| --- | --- |
| `pnpm install --frozen-lockfile` с доступным локальным кэшем (`--offline`) | Успешно, lockfile согласован; новые dev-зависимости ранее загружены из npm |
| `pnpm build` | Успешно для восьми workspace-компонентов |
| `pnpm typecheck` | Успешно для приложений, тестов и служебных скриптов |
| `pnpm db:validate` | Prisma schema valid |
| `pnpm test` | **48/48 unit-тестов**, 8 файлов, 0 ошибок; все 29 старых тестов сохранены |
| `pnpm test:integration` | **9/9**, 1 файл, 0 ошибок; миграция новой пустой схемы, seed и ограничения |
| `pnpm build:cloud:api` | Успешно, включая workspace-зависимости и Prisma generate |
| `pnpm build:cloud:web` с `https://api.example.com` | Успешно; это явно тестовый origin, не выдуманная ссылка на деплой |
| Production-сборка без VITE_API_BASE_URL | Отклонена с безопасной диагностикой, как и должно быть |
| `pnpm build:database` без DATABASE_URL в окружении | Успешно: секрет не требуется на этапе генерации/компиляции миграционного job |
| `pnpm cloud:validate` | YAML разобран; официальная JSON Schema Render пройдена; build-команды существуют, проверены ограничения manifest/workflows |
| Настоящий HTTP с NODE_ENV=production, PORT=43113, API_PORT=3000 | API слушает 0.0.0.0:43113; provider PORT имеет приоритет; четыре endpoint дают 200 |
| Настоящий HTTP CORS | Разрешённый HTTPS origin возвращается в allow-origin, посторонний — нет |
| Публичные операции изменения данных / debug | POST к plans/orders/admin/debug возвращает 404 |
| Настоящий отказ соединения PostgreSQL | `/ready` = безопасный 503; `/health` = 200 независимо от БД |
| Проверка production JS | Встроен заданный HTTPS origin; нет localhost, 127.0.0.1, PostgreSQL URL, Telegram token или случайного пароля тестовой БД |
| Сохранность исходников | Все старые файлы на месте; перечисленные защищённые части побайтово совпадают с Stage 1.1 |

Всего в этой версии успешно выполнены **57 автоматических тестов**. Интеграционные тесты были повторены после восстановления остановившейся временной PostgreSQL; выше приведён итоговый успешный результат, а не предположение по предыдущему этапу. Временные схемы удалены самими тестами. Предупреждение зависимости grammY о deprecated punycode не мешает выполнению.

## Статический анализ и границы подтверждения

Официальная JSON Schema загружена 2026-10-15 с https://render.com/schema/render.yaml.json и сохранена без правок. Проверены синтаксис, структура, supported fields и наши правила Free/monorepo/secrets/CI. Это **не** проверка через авторизованный Render API, не проверка доступности плана в конкретном аккаунте и не подтверждение успешного deploy на Linux-инфраструктуре Render. Начальная часть build-команды `corepack enable` проверена по документации провайдера; сами целевые pnpm build-команды выполнены локально.

CI использует только временный service container PostgreSQL 16.13; секрет Neon в обычном verify отсутствует. Миграции не выполняются в HTTP и не включены в start/build Render. `checksPass` — подготовленная защита автоматического обновления; у реальных сервисов пользователь должен подтвердить **After CI Checks Pass**, а у Blueprint — **Auto Sync No**. Ручной Deploy/Manual Sync и первое создание являются отдельными действиями оператора. При изменениях схемы/порционной загрузке Auto-Deploy сначала отключается по инструкции.

## Не выполнено в этом сеансе

- Создание/загрузка GitHub-репозитория и удалённый запуск GitHub Actions: аккаунт пользователя не подключался для этой операции.
- Создание Render API/Static Site, выдача фактических HTTPS доменов, проверка cold start и CI gate в настоящем Render аккаунте.
- Подключение настоящей Neon, применение миграций через ручной облачный workflow, SSL/pooled/direct соединения именно с её инфраструктурой.
- Docker service container PostgreSQL 16.13: Docker отсутствует, локальная проверка использовала PostgreSQL 18.4.
- Реальный Telegram polling и облачный bot/worker: не входят в обязательное развёртывание текущего этапа, код сохранён.
- Linux/macOS runtime, нагрузка и длительная эксплуатация.

Поэтому Stage 1.1.1 **подготовлен к облачной публикации на уровне исходного проекта и доступных проверок**. Финальная облачная приёмка остаётся отдельной. Рабочих публичных ссылок до создания ресурсов пользователем нет.

## Следующие действия пользователя

1. Загрузить исходники в корень GitHub main, дождаться успешного Verify foundation.
2. Создать Neon Free, сохранить direct URL в GitHub repository secret, запустить Cloud database - migrate and seed.
3. Создать Free API и Static Site в Render по cloud-deployment.md, ввести pooled URL только у API и связать фактические HTTPS адреса через VITE_API_BASE_URL/CORS_ORIGINS.
4. Проверить реальный CI gate, /health, /ready, /plans и сайт. Не подключать платные ресурсы для обхода квот.

Короткое руководство: cloud-quickstart.md. Подробные шаги и актуальные официальные источники по тарифам: cloud-deployment.md. Реальных платежей, VPS, VPN, debug/admin операций и keep-alive обходов не добавлено. Stage 1.2 не реализовывался.

## Архив

ZIP содержит исходники и конфигурацию, исключает node_modules/dist, настоящий .env, временные файлы, ключи и локальную PostgreSQL. После упаковки проверены CRC всех записей и побайтовое совпадение файлов с исходниками; дополнительно проверено отсутствие случайного секрета тестовой БД.
