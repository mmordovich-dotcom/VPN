# Сохранение Stage 1.4

База сравнения: main 2017f96b992c321d408550117a47d152437acd3a. Исходный набор — 87 unit, 67 integration и 6 browser tests; он сохранён. Уточнены ожидаемая версия API, облачные фикстуры и переход покупки на проверенный экран результата.

| Функция | Что сохранено / как проверяется |
|---|---|
| Telegram login / сессии | Старые auth/bot-login реализации не переписываются; прежние тесты signature/replay/account binding/link/code/session |
| Bot / Mini App | Тот же бот, webhook, SDK bridge, ready/expand/back/settings, fallback обычного браузера; прежние 6 UI сценариев |
| Покупка / продление | Тот же SubscriptionEngine, MockPaymentProvider, transaction lock, idempotency, свободные места, история и срок; добавлены concurrency 3/4 и проверенный receipt |
| Очередь / worker | Те же jobs, leases, retry/backoff, runtime modes, durable inbox, quarantine; новые сообщения используют существующий NOTIFY |
| Уведомления | Прежние opt-in reminder/update и source-of-truth проверки; новые служебные ответы/компенсации/ADMIN alert сохраняют fencing/throttling |
| Пагинация | Существующие account/admin списки, поиск и cursor; добавлена собственная пагинация сообщений |
| Админка | Сохранены lists/filters/orders retry/demo refund/plans/settings/diagnostics; добавлены инструменты readiness |
| Данные | Добавочные поля/таблицы; старый text обращения переносится в первое сообщение; legacy migration test и контрольные суммы Neon-copy |
| Demo mode | Нет реального provider/payment/VPN adapter, покупки ресурсов или новых paid services |

Тесты выполняются с изолированными БД/мок-транспортом. Реальная работоспособность Stage 1.4 была подтверждена владельцем; новая Stage 1.5 до отдельного выпуска не объявляется проверенной на production.
