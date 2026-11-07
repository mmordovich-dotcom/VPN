# Контролируемый DEMO-выпуск Stage 1.8

Этот PR не разрешает merge/deploy. Для выпуска нужно отдельное подтверждение владельца на конкретный проверенный head. Реальные платежи, Aeza и VPN запрещены. Миграций, env и зависимостей нет; production database workflow запускать не требуется. Структура и данные Neon остаются прежними.

## До разрешения

- [ ] PR stage-1.8-technical-readiness → main, полный diff; нет изменений apps/web, bot visual/menu, Prisma schema/migrations, render.yaml, secrets и цен/capacity.
- [ ] Последний head и все CI зелёные: Verify foundation + AXON browser; записаны точные run URLs/SHA и числа unit/integration/browser.
- [ ] Основные regression: paid-unapplied renewal refund сохраняет expiry/slot/credential; completed renewal refund один раз; failed payment не активирует доступ; две DB-сессии конкурируют за последнее место; logout ровно четыре clear headers; partitioned iframe session tests сохранены.
- [ ] Проверена актуальность main и отсутствие конфликтов. Если main изменился, повторить проверку нового итогового diff и CI.
- [ ] Владелец видит [аудит](stage-1.8.md) и commercial NO-GO из [плана](commercial-readiness-stage1.8.md).

## После отдельного разрешения на DEMO production

1. Зафиксировать старый Live SHA/deploy, main/head, текущие агрегаты Neon и пять миграций; private screenshot/proof без credentials/PII. Проверить доступное окно восстановления и лимиты; при отсутствии schema changes не создавать новую ветку/backup ресурс автоматически. Независимое резервирование и drill — отдельный согласованный шаг.
2. В существующем shared-vps-api выключить Auto-Deploy (предыдущее значение сохранить). Ничего не менять в защищённых env. APP_MODE=demo, существующие pooled DATABASE_URL, bot и webhook остаются.
3. Merge только проверенного PR. Дождаться CI именно итогового merge SHA; при failure остановить выпуск. Не выполнять migrate/db push/db reset, seed или SQL business updates.
4. Manual Deploy точного merge SHA, а не произвольного Latest commit. Дождаться Live и проверить Last successfully deployed commit. Ошибка build/start — остановка, без платного upgrade/смены базы.
5. Health 200/demo 1.8/0.8.0; ready 200/database available; auth config bot/landing; instructions 200; unauth me/admin/diagnostics401, invalid webhook401; wrong-origin mutation403. Обычный Chrome показывает витрину. Не тестировать настоящий payment confirm как money.
6. Проверить assets/landing/Mini App без редизайна. В приватной админ-сессии: webhook ready без pending/error роста, workers/queue lag/DEAD, PAID lastError. Проверить logs без критических/secret ошибок. Сверить Neon агрегаты/индексы; рост от легитимных действий допустим, исчезновение бизнес-истории — стоп.
7. Владелец: Telegram Web + телефон /app, автоматический вход, reload сессии, Mini App subscriptions/catalog/demo purchase/renewal/history; /start, instructions/support/notifications; выход и новый вход, старый grant не принимается. Настоящие OTP/токены не отправляются в чат. Админку проверять своим подтверждённым аккаунтом. Stage 1.7/PR8 manual acceptance не подменяет эту проверку.
8. После успешной технической проверки восстановить After CI Checks Pass. Ручные результаты Telegram записать отдельно, непроверенное не объявлять пройденным. При critical failure Auto-Deploy не восстанавливать до разбирательства и отдельного решения.

## Восстановление

При кодовой ошибке prefer согласованный rollback на предыдущий Live d14b2ec3ad9e9fe61e631e746d3eb7cf6525b07a без отката БД: новая схема отсутствует. Перед rollback сверить main/auto-deploy, in-flight tasks и новые пользовательские записи; нельзя перезаписывать Neon старым состоянием. Не повторять DELIVERY_UNKNOWN. При подозрении на повреждение сохранить доказательства/приватную копию и следовать [backup runbook](backup-recovery.md), отдельное согласие на destructive restore обязательно.

## Commercial release: обязательные gates (отдельный выпуск)

- [ ] Законный владелец/юрисдикция/статус/договоры/KYC, допустимость услуги и перепродажи, terms/privacy/refunds/налоги и обработчики данных.
- [ ] Выбран платёжный канал по Telegram Stars policy; durable verified payment inbox/ledger/reconciliation/disputes + sandbox fault tests; success только server-verified event.
- [ ] Подтверждён действующий provider API и разрешённая нагрузка; durable provisioning/reconciliation без network calls под global DB lock; индивидуальные credentials/revoke; cost/budget caps и controlled termination.
- [ ] Реальная экономика по договорным ценам, commissions/Stars rewards, FX, underfill, infra, refunds/reserve/tax; согласованный рабочий капитал.
- [ ] Always-on compute и DB budget, external alerts/on-call, capacity/load tests, PG18 parity, backup/restore drill с измеренным RPO/RTO.
- [ ] Пользовательская приёмка в реальном Telegram и разрешение владельца на конкретный коммерческий rollout.

Ни один commercial gate не считается выполненным просто наличием этой галочки в документации. Сейчас коммерческий запуск заблокирован; самостоятельный DEMO-тест возможен после отдельно разрешённого выпуска.
