# Stage 2.0 · проверяемые результаты

## Контрольная точка CI
Код 388cb8a932508508c2b9090090d038604417a08d прошёл полный набор проверок 09.11.2026:
- [Verify foundation](https://github.com/mmordovich-dotcom/VPN/actions/runs/42618700107): PostgreSQL 16.13 и 18, оба job success.
- [Browser](https://github.com/mmordovich-dotcom/VPN/actions/runs/42618700111): success, 29/29.
- 169 unit + 158 PostgreSQL integration + 29 browser = 356 различных тестов; unit/integration дополнительно повторены на двух версиях PostgreSQL.
- build, typecheck, Prisma validate, cloud validate, production web build и browser artifact verification прошли.
- Миграция на заполненной Stage 1.9 в изолированной БД: 16 таблиц сохранены точно, цены 170 ₽ и вместимость 3 без изменений.
- pg_dump → отдельная БД → pg_restore: 14 таблиц совпали, восстановленная очередь/журнал не выдали вторую подписку.

Последняя небольшая стабилизация дополнительно отделяет заведомо неподдерживаемый Rolly sandbox refund от UNKNOWN и добавляет тест гонки двух worker при create. Ожидаемый итог — 169 unit + 159 integration + 29 browser = 357. Это ожидание НЕ доказательство: окончательный head SHA и фактические успешные CI фиксируются в описании [PR №11](https://github.com/mmordovich-dotcom/VPN/pull/11), [текущие Checks](https://github.com/mmordovich-dotcom/VPN/pull/11/checks). До их успеха PR остаётся Draft. Документация не заменяет проверку последнего SHA.

## Явные доказательства из CI
AXON_STAGE20_CONTRACT_E2E: externalSandbox=false, transport=OFFLINE_FIXTURE, mode=SANDBOX, captureCount=1, refundCount=1, realResources=0.
AXON_STAGE20_MIGRATION_PRESERVATION: isolated=true, tables=16, preserved=true.
AXON_STAGE20_RESTORE_DRILL: isolated=true, realUserData=false, tables=14, exactFingerprints=true, captureCount=1, subscriptionCount=1, productionBackupVerified=false.

## Что проверено
- Provider wire-контракты и подлинность Rolly HMAC/timestamp/test, CloudPayments encoded Content-HMAC/test original transaction, Stars webhook secret/user/payload/XTR и precheckout без выдачи доступа.
- Долговечные CREATE/REFUND attempts; повтор после перезапуска/истёкшей lease не создаёт второй запрос. Потеря ответа/ошибка записи → UNKNOWN; сверка или подписанное событие, без автоматического повторного списания.
- Поздний paid после expired; старое событие сверяется с текущим провайдерским состоянием; capture/refund журнала ровно по одному; отдельные DEMO и SANDBOX, LIVE запрещён БД.
- Новая схема на изолированных PostgreSQL, ограничения FK/unique/immutable и откат транзакции; старые функции Stage 1.9 продолжают проходить регрессионный набор.
- Юридические черновики не выдаются публично как утверждённые; нет даты вступления/акцепта для draft, версии и digest проверяются, acceptance неизменяем и привязан к владельцу заказа/каналу.
- /internal/monitor без bearer → 401, отказ БД/очереди/stale worker → 503, восстановление → 200; ошибки/PII/Neon URL/секреты не включены в ответ.
- Browser: обычный сайт-витрина, legal navigation/direct draft denial, Mini App профиль → legal → каталог, DEMO и отсутствие переполнения. SDK/cookies fixtures и прежние сценарии сохранены. Новые команды /terms,/paysupport проверяются через существующий TelegramGateway в CI.

## Реальные проверки и непроверенные части
Production baseline 09.11.2026: браузер показал /health Stage 1.9 DEMO, /ready database available, /api/v1/auth/config loginEnabled=true/publicWebMode=landing. Прямой транспорт инструмента ранее завершился timeout, поэтому результат не выдан за измерение uptime; браузер ответил штатно. Production не менялся.
Вход UptimeRobot: dashboard.uptimerobot.com/login требует email/авторизации. Мониторы PAUSED только в подготовленном плане; во внешнем аккаунте ничего не создано, alerts/status page не включены. Адрес оповещений не согласован, внешние down/up доставки не проверены.
Официальные provider sandbox транзакции НЕ ВЫПОЛНЕНЫ: нет отдельно разрешённых аккаунтов, test bot/token, merchant secrets и test HTTPS endpoint. Контрактные fixtures не подменяют этот пробел. Rolly sandbox не поддерживает refund; частичные возвраты, LIVE, финансовые settlement/фискальные требования и текущий Aeza API/control plane остаются блокерами. Нет реальной покупки/выдачи VPS/VPN, независимого production backup или restore.
Юридические тексты — 6 черновиков, не заключение юриста. Продавец/юрисдикция/адрес/налоговые реквизиты/контакты/сроки хранения/дата действия не заполнены; применимость норм РФ/СНГ и иностранной инфраструктуры требует проверки.

## Сохранность и выпуск
Liquid Glass CSS/изображения/эмодзи и работающая архитектура не переписываются. Main/Render/Neon/@vpnaxon_bot не изменены. Проверки на синтетических БД не являются новой проверкой всех production-данных; production-операции не выполнялись.
PR готов к техническому review только после зелёного последнего CI. Коммерческий запуск заблокирован перечисленными внешними/правовыми/эксплуатационными условиями. Merge, production migration, deploy, внешние секреты/мониторы и любые платные операции — только после отдельного разрешения. План: release-stage2.0.md; новые визуальные этапы не начаты.
