# Контролируемый выпуск Stage 1.9 — только после отдельного разрешения

Сейчас задача заканчивается PR. Не выполнять merge, production migration или Render deploy автоматически. Существующий Live Stage 1.8/main a3476347d8c1b854177df4ef63d41e81a1042fa6 сохраняется.

1. Сверить PR head, green CI PostgreSQL 16/18 и browser, diff, mergeability, отсутствие новых секретов/ссылок оплаты и нежелательных UI изменений. Проверить docs/stage-1.9.md и оставшиеся ограничения.
2. После отдельного разрешения временно отключить Auto-Deploy существующего shared-vps-api. Merge только проверенного head, дождаться CI merge SHA.
3. До миграции подтвердить безопасную точку восстановления/backup и срок удержания на существующем patient-queen-83814443 / br-rapid-butterfly-b4t863o9. Снять read-only aggregate snapshots бизнес-данных. Сначала проверить миграцию на изолированном PostgreSQL 18/ветке, сравнить сохранность fixtures; production данные не использовать для разрушительных тестов.
4. Через существующий Cloud database workflow применить только шестую добавочную миграцию с direct NEON_MIGRATION_DATABASE_URL. Не reset, не db push, не менять цену/capacity/production данные. Проверить successful migration и aggregates. Runtime DATABASE_URL остаётся pooled. Никаких новых env для Stage 1.9.
5. Manual Deploy точного проверенного merge SHA существующего Render. Проверить health/ready/auth/config/landing/assets, protected APIs/admin, webhook protection и startup/background logs. DEMO purchase/renewal/refund и login в настоящем Telegram принять отдельно с владельцем. Не регистрировать реальные webhook payments, не отправлять Stars invoice и не вызывать Aeza.
6. Восстановить After CI Checks Pass только после успешных проверок. Записать SHA/deploy/CI/migration/данные/пользовательскую приёмку.

## При проблеме

Остановить выпуск и сохранить evidence. Добавочные таблицы не удалять: journal/events нельзя терять. До обработки новых foundation jobs возможен rollback к Stage 1.8 с сохранением новых таблиц и выключенным Auto-Deploy, но после появления PAYMENT_EVENT/FOUNDATION_FULFILL/PAYMENT_RECOVER старый worker их не понимает. Поэтому не откатывать слепо: остановить consumers и предпочтительно исправить roll-forward. Не reset/не down migration/не ручное удаление financial evidence. Неизвестный provider result сохраняет reserve+budget; ручной повтор create запрещён без проверки исходной операции.

Коммерческий LIVE и новые платные ресурсы запрещены независимо от зелёных CI.
