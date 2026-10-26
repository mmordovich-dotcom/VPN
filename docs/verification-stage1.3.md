# Проверки Stage 1.3 — 26.10.2026

Разработка в stage-1.3-reliability от опубликованного ed0b033056c937cbfe66daf4e13a173cd130ac83. Проверки выполнены GitHub Actions, а не локальным терминалом владельца. Production-миграция, merge и новый Render deploy не выполнялись.

## Подтверждённый облачный прогон

[Verify foundation №67](https://github.com/mmordovich-dotcom/VPN/actions/runs/40283720641), [проверенный код 07b4fc9](https://github.com/mmordovich-dotcom/VPN/commit/07b4fc9babbc256fe3f73f0d9e88d47c0313e575). Полный цикл завершён SUCCESS. После обновления документации итоговый SHA и повторный CI проверяются в PR; выпускать следует только его последний зелёный commit.

| Проверка | Результат |
|---|---|
| Frozen lockfile install | PASS |
| pnpm build, включая apps/worker | PASS |
| pnpm typecheck, включая тесты | PASS |
| pnpm db:validate | PASS |
| Обычные тесты | 70 PASS — прежние 62 + 8 новых |
| Интеграционные тесты | 62 PASS — прежние 36 + 26 новых |
| Production web build с не секретным fixture origin | PASS |
| pnpm verify:web-artifact | PASS: нет server secrets, loopback fallbacks, локальной бизнес-модели |
| pnpm cloud:validate | PASS: официальный Render schema, команды и безопасность workflows |

Итого 132 теста. Старые наборы не удалены: 15 unified, 12 bot-login, 9 database. В прежнем retry-тесте проверена сохранённая задержка, затем тестовым SQL продвинуто nextAttemptAt вместо ожидания реального backoff.

## Новые интеграционные сценарии

1. Сохранение отложенной задачи при новом подключении к PostgreSQL.
2. Конкурентный claim двумя потребителями и fencing старой lease.
3. Сбой после бизнес-commit до queue acknowledgement без повторного выделения места.
4. Bounded exponential retry и окончательный DEAD после восьми попыток.
5. Постоянная ошибка и defer без расхода попытки ошибки.
6. Карантин неопределённой отправки после истечения lease.
7. Совместный rollback бизнес-изменения и outbox.
8. Трёхдневное напоминание один раз после повторного запуска потребителя.
9. Запрет преждевременного reminder.
10. Напоминание за сутки в актуальном окне.
11. Пропуск старого reminder после продления.
12. Отключённые настройки и блокировка Telegram-получателя.
13. Сбой acknowledgement уведомления после успешного send без повторной отправки.
14. Сбой acknowledgement Telegram inbox после успешного send без повтора.
15. Throttle откладывает второе сообщение без расхода retry.
16. Одновременная доставка одного update и два inbox-потребителя: одна подписка и один ответ.
17. Истёкшая send lease inbox: DEAD, без повторной отправки.
18. BACKGROUND_MODE=external отключает inline claims.
19. Bot blocked переводит отправку в DEAD, остальные бизнес-задачи доступны.
20. Telegram 429/retry_after сохраняет ограниченную задержку.
21. После простоя истекает подписка, освобождается место, история сохраняется.
22. Одновременные INLINE/STANDALONE: уникальные задания планировщика и корректный close/heartbeat.
23. Настройки в Telegram с явной кнопкой включения.
24. Cursor при равных timestamps, user scope, запрет чужого cursor/userId.
25. Защита diagnostics ADMIN, поиск/статус/сортировка и максимальный limit.
26. Cleanup удаляет только истёкшую техническую запись, сохраняя business/audit.

Обычные тесты дополнительно проверяют backoff, классификацию Telegram, безопасные ошибки, валидацию cursor/filter/limit. Canary логирования расширен на payload и leaseToken. Старые конкурентные покупки, вместимость, продление, auth и replay checks проходят вместе с новыми.

## Изолированная Neon-проверка

Проект patient-queen-83814443, PostgreSQL 18. От production br-rapid-butterfly-b4t863o9 создана приватная validation-ветка stage13-reliability-validation-20261026 (br-small-sunset-b4q8zdtb). На ней применён SQL новой миграции 20261026000000_reliability и проверена совместимость с копией существующих данных. Это SQL-проверка; _prisma_migrations вручную не редактировалась. Полное prisma migrate deploy всех четырёх миграций проверено CI на изолированных схемах PostgreSQL 16.13.

До/после на validation: users=1, plans=1, orders=0, subscriptions=0. Созданы 4 новые таблицы, 10 индексов пагинации, поля lease/retry inbox; его check допускает прежние состояния и DEAD. Compute тестовой ветки отключён после проверки, данные ветки сохранены. Production при отдельной read-only проверке: прежние 3 завершённые миграции, таблицы background_jobs нет. Бизнес-данные не удалены и не экспортированы.

Free Neon при инспекции имеет history_retention_seconds=21600 (6 часов). Retention, тариф и платные snapshots не менялись. Это не полный PITR-drill: см. [план восстановления](backup-recovery.md).

## Найденные и исправленные проблемы

- Конкурентный Prisma upsert с пустым update мог эмулировать create и давать P2002. Outbox enqueue заменён атомарным INSERT ON CONFLICT DO NOTHING; повторный inbox upsert тоже запрашивает native conflict path.
- Сбой DB acknowledgement после успешной отправки мог превратиться в новую отправку. Отделены обработка и подтверждение; неопределённый send остаётся leased и карантинируется после expiry.
- Старый inbox status CHECK запрещал DEAD. Новая добавочная миграция расширяет этот CHECK до обработки exhausted updates; старые миграции не правились.
- Исправлены даты истёкшей тестовой подписки и формат cookie fixture по действующим ограничениям. Ошибка fault injection в Prisma proxy устранена query extension, а не ослаблением проверок.

## Что ещё не подтверждено

Telegram Bot API в новых integration tests заменён transport-имитацией. Новые reminders, блокировка реального бота и настройки не испытывались на production, поскольку Stage 1.3 ещё не опубликована. Настоящий bot-confirm login Stage 1.2.5 ранее проверен владельцем; одноразовая ссылка, код, Android/iOS остаются отдельной пользовательской приёмкой.

Перезапуск проверяется новым DB-клиентом, повторным потребителем, expired leases и инъекцией сбоя между commit/ack. Отдельный hosted standalone worker, настоящее OS kill/SIGTERM испытание, длительный нагрузочный тест, визуальная приёмка новой админки и полный restore-drill не выполнялись. CI build/typecheck и тест runtime.close не являются их заменой.

Render остаётся на Stage 1.2.5; Auto-Deploy After CI Checks Pass не переключался в ходе разработки ветки. Ни новых paid ресурсов, ни реальных платежей/VPS/VPN нет. Для окончательного выпуска нужны разрешение владельца и [согласованная последовательность](cloud-deployment.md): свежая защита данных → Auto-Deploy off → merge → миграция → Manual Deploy → production-проверки и Telegram владельца → Auto-Deploy on.
