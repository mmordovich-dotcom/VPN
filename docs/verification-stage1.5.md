# Проверки Stage 1.5

Реализационный коммит: abbbaca5609f13e4477837db57a51ab05a423d72 (29.10.2026 Asia/Hovd). Все проверки этой реализации прошли. Последующие правки отчёта не меняют исходники; точный head PR и его checks проверяются перед передачей владельцу. Stage 1.5 не опубликована в production.

| Проверка | Результат | Доказательство |
|---|---|---|
| Build / typecheck | PASS | [Verify foundation](https://github.com/mmordovich-dotcom/VPN/actions/runs/40740402559) |
| Unit | 93 PASS | тот же run, job 123000813525 |
| PostgreSQL integration | 83 PASS в 6 suites | тот же run, включая старые сценарии и legacy migration |
| Prisma validation | PASS | The schema at prisma/schema.prisma is valid |
| Production web build / artifact | PASS | Browser artifact: no server secrets, loopback fallbacks or local business state |
| Cloud validation | PASS | Render YAML / build commands / workflow safety checks |
| Chromium browser | 10 PASS | [AXON browser checks](https://github.com/mmordovich-dotcom/VPN/actions/runs/40740403098), job 123000312133 |
| Neon isolated migration | PASS | br-wild-poetry-b4rb0m3q, см. ниже |

Итого 186 автоматических тестов (93 + 83 + 10). Сохранены прежние 87 unit, 67 integration и 6 browser tests; добавлены 6 / 16 / 4 соответственно. Проверки ролей, владельца, транзакций и повторов не отключены. Уточнены версия, число настроек с новым gate и недопустимая вместимость 5; собственные user/order ID сохранены, инфраструктурные поля скрыты.

Промежуточные ошибки были исправлены: exact optional Prisma field; совместимость DTO; стартовая задержка первого служебного send; область обработчика статуса обращения, который не должен вызываться при ответе пользователя. Визуально проверены инструкции, мобильная переписка и админка на снимках реального собранного web artifact. Новая browser-регрессия запрещает любые admin-запросы из пользовательского ответа. Итоговый снимок переписки не содержит ошибочной плашки. Снимки доступны в artifact axon-browser-proof (7 дней).

## Выполнено реально

На отдельной ветке Neon stage15-release-readiness-validation-20261029 (br-wild-poetry-b4rb0m3q), родитель br-rapid-butterfly-b4t863o9 проекта patient-queen-83814443, применён точный SQL новой миграции одной транзакцией. Production не изменялась. Контрольные суммы и количества orders (3), subscriptions (2), servers (1), server_slots (3), payments (3) совпали до/после. Новые пять таблиц созданы; default_capacity=3, capacity4_approved=false. В этой копии нет старых обращений; их перенос проверяется отдельным CI-тестом с legacy-данными. SQL-применение через MCP не выдаётся за запуск production Prisma workflow.

Копия имеет read/write compute 0.25 CU в существующем Free-проекте. Попытка задать suspend timeout была отклонена аккаунтом; ветка создана без изменения этого параметра, с настройками аккаунта. Платный тариф не выбирался.

## Стенды

Verify foundation: сборка всех пакетов, typecheck и tests types, Prisma validation, unit, PostgreSQL integration в случайных локальных схемах облачного runner, production web build, проверка отсутствия секретов в artifact, cloud validation. New migration test сначала применяет прежние 4 миграции, создаёт реальные legacy-записи, затем применяет добавочный SQL и сравнивает данные.

AXON browser checks: реальный собранный web artifact в Chromium, изолированные API fixtures и симуляция Telegram SDK. Сохранены прежние сценарии, добавлены инструкция/устройства, проверенный результат и ожидание активации, переписка/экранирование, экономика. Это не реальный Telegram и не production API.

Синтаксис подготовленных TypeScript-файлов дополнительно проверен компиляторным API без локального терминала. Полная сборка и тесты выполняются только в облаке.

До отдельного выпуска не проверены реальные Stage 1.5 Telegram login/доставка/Mini App на устройствах, runtime Render с новой схемой, восстановление PITR, внешняя нагрузка/коммерческий провайдер. Stage 1.4 в production сохраняется.

## Существующий production

Render live: dep-dbh156rl550s738de3e0 / 2017f96b992c321d408550117a47d152437acd3a, Stage 1.4. Настройки проверены только чтением: Free, branch main, Auto-Deploy After CI Checks Pass, PR Previews Off. /health, /ready, /api/v1/auth/config реально вернули HTTP 200. В старом production health ещё показывает legacy 1.1, auth config — 1.4; унификация 1.5 находится только в этом PR. Нового deploy не было. Production Neon: 4 завершённые миграции, новых Stage 1.5 таблиц нет, default capacity 3.
