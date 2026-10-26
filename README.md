# AXON · Shared VPS Platform · Stage 1.4

Существующий Fastify/Prisma/PostgreSQL и Vite/TypeScript monorepo: один кнопочный Telegram-бот и сайт с интерфейсом WebDemo. Только демонстрация: деньги не списываются, VPS виртуальные, доступ не является настоящим VPN.

Stage 1.3 опубликована на существующем Render (4acccb0). Stage 1.4 — отдельная ветка stage-1.4-axon-ui для согласуемого PR: AXON redesign, полный Mini App, профиль/dashboard, личная пагинация и улучшенный бот. Эта ветка сама не изменяет production.

**Начните с [облачного выпуска через браузер](docs/cloud-deployment.md).** Пользователю не нужно устанавливать Docker/Node.js или переносить исходники вручную. Сайт, API и webhook используют существующий Render shared-vps-api и Neon patient-queen-83814443.

## Возможности Stage 1.4

- Общий AXON-интерфейс: чёрно-белые темы, стеклянные панели, новая главная и dashboard, профиль, подключение, настройки и мобильные вкладки.
- Mini App: проверенный сервером initData, ready/expand, safe areas, native Back/Settings, тема и необязательный haptic feedback; обычный браузер сохраняет полноценный вход.
- История заказов, подписок и обращений использует существующую cursor-пагинацию.
- В существующем боте: /app, открытие полного Mini App, компактное контекстное меню, понятные статусы и сохранённые быстрые действия.

## Сохранено из Stage 1.3

- Сохранены каталог, демонстрационные заказы/платежи, покупки, продление, подписки, подключение, обращения и история.
- Общий SubscriptionEngine сохраняет транзакционное распределение мест, ограничения PostgreSQL, MockPaymentProvider и виртуальный server provider. Действующие тарифы и настройки не перезаписываются.
- Сохранены шесть основных кнопок бота, вход через подтверждение в боте, одноразовые ссылки/коды, проверенный Mini App initData и серверные HttpOnly-сессии.
- PostgreSQL jobs: отложенный запуск, bounded retry/backoff, lease fencing, DEAD и восстановление после перезапуска; бизнес-изменение и outbox согласованы транзакционно.
- Общий inline/standalone runtime. На Render Free работает внутри бодрствующего API; отдельный paid worker не создан и 24/7 не обещается.
- Уведомления о сроках, продлении и заказах с проверкой актуальности, opt-in настройками в боте/сайте, ограничением частоты и карантином неопределённых sends.
- ADMIN-списки с cursor-пагинацией, поиском, фильтрами, диагностикой и безопасным повтором задач. Пользовательские списки защищены проверкой владельца.
- Безопасные категории ошибок/request IDs, техническая очистка без удаления бизнес-истории, добавочная миграция и план восстановления Neon.

## Документация

- [Stage 1.4: дизайн, Mini App, бот и безопасный выпуск](docs/stage-1.4.md).
- [Проверки Stage 1.4](docs/verification-stage1.4.md), [изменённые файлы](docs/changes-stage1.4.md).

- [Stage 1.3: очередь, worker, уведомления, безопасность и хранение](docs/stage-1.3.md).
- [Архитектура](docs/architecture.md), [контракт пагинации](docs/pagination-stage1.3.md).
- [Резервирование и восстановление](docs/backup-recovery.md), [облачный выпуск](docs/cloud-deployment.md).
- [Проверки и ограничения](docs/verification-stage1.3.md), [изменённые файлы](docs/changes-stage1.3.md), [этапы](docs/stages.md).
- [Сохранённый вход Stage 1.2.5](docs/stage-1.2.5.md), [база](docs/database.md), [Telegram](docs/telegram.md).

## Команды разработчика и CI

Node 22.22.2, pnpm 10.34.4. Сохраняются pnpm build, pnpm typecheck, pnpm test, pnpm test:integration, pnpm db:validate, pnpm cloud:validate, pnpm verify:web-artifact. GitHub Actions выполняет их в облаке; интеграционные тесты используют изолированные схемы PostgreSQL 16.13, не production.

pnpm build:cloud:unified собирает API+сайт; node apps/api/dist/main.js запускает Render. BACKGROUND_MODE=inline — значение по умолчанию. Будущий отдельный процесс: pnpm build:cloud:worker, затем pnpm start:worker; перенос API на BACKGROUND_MODE=external согласуется при выборе хостинга. Старый apps/bot сохраняется как тестируемый фундамент, отдельный polling не запускается.

## Границы проверки

CI и изолированная миграция подтверждают автоматические сценарии, а не реальную production-доставку новых уведомлений. После согласованного выпуска нужны проверка админки/настроек и Telegram владельцем, включая ссылки, коды и Android/iOS. PITR-drill и длительный always-on нагрузочный тест отдельно не выполнялись. Точные результаты и ссылки находятся в отчёте проверок.
