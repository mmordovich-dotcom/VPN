# Проверки Stage 1.5

Подготовка ещё выполняется. Финальные CI-ссылки, количество тестов и точный SHA будут внесены после завершения проверки. Этот документ не означает публикацию в production.

## Выполнено реально

На отдельной ветке Neon stage15-release-readiness-validation-20261029 (br-wild-poetry-b4rb0m3q), родитель br-rapid-butterfly-b4t863o9 проекта patient-queen-83814443, применён точный SQL новой миграции одной транзакцией. Production не изменялась. Контрольные суммы и количества orders (3), subscriptions (2), servers (1), server_slots (3), payments (3) совпали до/после. Новые пять таблиц созданы; default_capacity=3, capacity4_approved=false. В этой копии нет старых обращений; их перенос проверяется отдельным CI-тестом с legacy-данными. SQL-применение через MCP не выдаётся за запуск production Prisma workflow.

Копия имеет read/write compute 0.25 CU в существующем Free-проекте. Попытка задать suspend timeout была отклонена аккаунтом; ветка создана без изменения этого параметра, с настройками аккаунта. Платный тариф не выбирался.

## Стенды

Verify foundation: сборка всех пакетов, typecheck и tests types, Prisma validation, unit, PostgreSQL integration в случайных локальных схемах облачного runner, production web build, проверка отсутствия секретов в artifact, cloud validation. New migration test сначала применяет прежние 4 миграции, создаёт реальные legacy-записи, затем применяет добавочный SQL и сравнивает данные.

AXON browser checks: реальный собранный web artifact в Chromium, изолированные API fixtures и симуляция Telegram SDK. Сохранены прежние сценарии, добавлены инструкция/устройства, проверенный результат и ожидание активации, переписка/экранирование, экономика. Это не реальный Telegram и не production API.

Синтаксис подготовленных TypeScript-файлов дополнительно проверен компиляторным API без локального терминала. Полная сборка и тесты выполняются только в облаке.

До отдельного выпуска не проверены реальные Stage 1.5 Telegram login/доставка/Mini App на устройствах, runtime Render с новой схемой, восстановление PITR, внешняя нагрузка/коммерческий провайдер. Stage 1.4 в production сохраняется.
