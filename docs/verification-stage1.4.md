# Проверка Stage 1.4 — AXON

## Статус и доказательства

Stage 1.4 — отдельная ветка stage-1.4-axon-ui относительно опубликованного Stage 1.3 (main 4acccb010eb23ad88a937abe703cb458e825c21e). Подготовка PR не означает публикацию Render. Перед merge обязательны зелёные проверки последнего SHA; точный итоговый SHA и ссылки доступны в PR и отчёте владельцу.

Контрольные облачные прогоны с новой типографикой и проверкой 320 px:

- [Verify foundation](https://github.com/mmordovich-dotcom/VPN/actions/runs/40364250621): build, typecheck, Prisma validation, 87 unit- и 67 integration-тестов, production web build, проверка web artifact и cloud validation — success.
- [AXON browser checks](https://github.com/mmordovich-dotcom/VPN/actions/runs/40364250704): 6 Chromium-сценариев — success.
- Скриншоты и HTML-отчёт находятся в artifact axon-browser-proof каждого браузерного прогона; срок хранения в GitHub — 7 дней.

Вывод foundation:

```text
Tests 87 passed (87)
Tests 67 passed (67)
Browser artifact: no server secrets, loopback fallbacks or local business state.
Render YAML: official JSON Schema valid. Cloud build commands and workflow safety checks passed.
```

Вывод браузерного прогона: 6 passed. После визуальной приёмки добавлены карточки последних заказов, корректное скрытие skip-link вне фокуса и дополнительный снимок в размере экрана телефона. Последние push/PR checks повторяют оба набора на итоговом коде.

## Что проверяет CI

| Набор | Содержание |
|---|---|
| Unit (87) | Все прежние тесты плюс AXON routes/escaping, Mini App fallback/capabilities/theme/safe areas/cleanup и безопасные кнопки бота |
| Integration (67) | Настоящий PostgreSQL одноразового GitHub runner, четыре неизменённые миграции в изолированных схемах; прежние engine/auth/queue сценарии плюс новый бот/меню/идемпотентное продление |
| Browser (6) | Настоящий собранный frontend в Chromium; тестовые HTTP-ответы API и SDK вместо обращения к production |
| Cloud/artifact | Prisma schema, Render schema/команды/workflow safety, production build и отсутствие серверных секретов/loopback/local business state в browser bundle |

Браузерные сценарии:

1. Публичный desktop, тёмная/светлая темы, отсутствие SDK, доступный прежний вход по восьмизначному коду.
2. Mini App 390 px: автоматический вход, ready/expand, покупка, продление той же подписки, CSRF header, сохранение уведомлений, native Settings/Back.
3. Mobile 360/320 px: история, поиск, cursor, пустые состояния, личные разделы, отсутствие горизонтального переполнения, escaped support text, отправка обращения, отмена выхода через Escape и reduced motion.
4. Подмена текущего Telegram-аккаунта при существующей cookie скрывает данные и требует явного переключения; известный подписанный replay может повторно использовать совпадающую сессию.
5. ADMIN: диагностика/списки на маленьком экране; DELIVERY_UNKNOWN не получает кнопку опасного повтора.
6. USER: административный UI не загружается; задержанный ответ предыдущего маршрута не заменяет новый экран.

Фактическое сравнение с main сохраняет backend auth/session validator, SubscriptionEngine, workers/jobs/inbox и schema/migrations без изменений. В двух старых тестах изменена проверка представления: конкретный webhook-вызов вместо последнего transport-вызова, понятный отказ для чужого заказа плюс отсутствие новых бизнес-записей. Сценарии и проверки безопасности не удалены.

## Визуальная QA

Просмотрены облачные снимки главной в двух темах, Mini App dashboard/подписки, мобильного профиля и админки. По ним увеличен второстепенный текст, убрана рамка всего main после смены маршрута, сохранён фокус интерактивных элементов и исправлен skip-link. Снимки снимаются после завершения переходов. Фиксированная нижняя навигация видна в полной странице на позиции текущего viewport; это обычное поведение full-page capture, поэтому добавлен отдельный viewport-снимок Mini App.

## Исправленные ошибки подготовки

Первый workflow не дошёл до UI-сценариев из-за неподдерживаемого для pnpm add флага install. Флаг убран. Подготовка браузера через медленное зеркало Ubuntu заменена загрузкой Chromium в закреплённом Ubuntu 24.04 runner; необходимые библиотеки уже есть в runner, что подтверждено успешным запуском. Старые проверки webhook/текста адаптированы без ослабления бизнес- и защитных утверждений. Эти промежуточные неуспешные прогоны не являются релизом.

## Что пока не проверено реально

- Stage 1.4 не опубликован в production Render; /health, /ready, bot login и уведомления production Stage 1.3 не доказывают новую версию.
- Настоящий Telegram Android/iOS/Desktop, native safe areas/haptics/menu button, получение подписанного initData и вход владельца требуют приёмки после отдельно согласованного выпуска. SDK в браузерном CI имитируется; integration использует безопасный Telegram transport.
- Фактическая доставка новых текстов существующему Telegram-аккаунту, открытие Mini App из нового default menu, покупки/продление/уведомления через production-сессию — будущий smoke test с участием владельца.
- Clipboard зависит от разрешений клиента; предусмотрена понятная fallback-подсказка. Полный аудит screen reader/WebKit/Android и измерение производительности на слабом физическом телефоне не выполнялись.

## Готовность к выпуску

После зелёных проверок последнего PR SHA версия подходит для контролируемого демо-выпуска с приёмкой владельца. Нельзя называть её уже работающей на production. Нужны отдельное разрешение выпуска, временное отключение Auto-Deploy, merge, Manual Deploy точного SHA, endpoint/log smoke tests и настоящее Telegram-подтверждение. Возвращать After CI Checks Pass только после успеха.

Новая DB migration, env, бот, Neon/Render/GitHub проект и платные ресурсы не нужны. Production-данные не удаляются; Neon не изменяется. Реальные платежи/VPS/VPN не подключаются. Подробности: [Stage 1.4](stage-1.4.md), [изменённые файлы](changes-stage1.4.md), [выпуск](cloud-deployment.md).
