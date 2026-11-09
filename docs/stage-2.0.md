# AXON Stage 2.0 · Final integrations

Основа: принятый владельцем Stage 1.9, main 8ae4832ec8dc1c88234c8b4c049df82ee22ca715. Отдельная ветка stage-2.0-final-integrations. Этот документ описывает код PR, НЕ опубликованный production.

## Реализовано
- Настоящие серверные HTTP-адаптеры официальных контрактов Telegram Stars TEST, RollyPay sandbox и резервного CloudPayments test terminal. Подписи/секрет, raw body, строгая сумма/валюта/order/user/environment, каналы Stars/website, hosted URLs с allowlist. Это исполняемый код, но аккаунты и внешние sandbox испытания ещё отсутствуют.
- IntegrationService использует существующие PaymentFoundation, immutable evidence/financial journal, задания и SubscriptionEngine; durable исходящие CREATE/REFUND с lease/fence, UNIQUE и UNKNOWN после потери ответа. Нет слепого повторного запроса при перезапуске. Read-only reconciliation; late paid и chargeback Rolly, Stars history и возврат, оригинальная test-транзакция CloudPayments. Полные capture/refund не выдаются дважды. Частичные refund и неподтверждённый Rolly refund API остаются блокерами, не имитацией реализованного LIVE.
- Добавочная миграция 20261109000000_integration_sandbox_legal: provider_attempts, legal_acceptances, расширение SANDBOX provider CHECK. Старые миграции/строки/enum/цены/вместимость неизменны. LIVE по-прежнему отвергается самой БД. Новая схема совместима со Stage 1.9; миграция только в изолированном CI до отдельного разрешения.
- Sandbox webhook harness отделён от production и не регистрируется buildApp. Production не получает checkout/refund внешних провайдеров и не меняет существующий Telegram webhook. Не добавлены внешние СБП ссылки в бота/Mini App. Сайт остаётся витриной.
- Aeza: явный заблокированный adapter, проверка quote/бюджета/владения scope и план независимых трёх доступов. Нет выдуманного текущего HTTP API, покупки/изменений/продления. SWE-PROMO запрещён. Существующий ResourceFoundation продолжает проверенный DEMO.
- Шесть явно обозначенных юридических черновиков в docs/legal. Витрина footer, Mini App профиль и бот /terms,/legal,/paysupport ведут в правовую информацию. Пока все DRAFT: ни body, ни дата действия, ни кнопка принятия коммерческой оферты не публикуются. Версия/digest/дата и immutable per-order acceptance подготовлены для будущего утверждённого текста.
- UptimeRobot: PAUSED план публичных checks и AXON Status, без включения keep-alive Render Free, аккаунта, уведомлений или выдуманных измерений. Защищённая внутренняя категорическая диагностика, no-store/401/503, optional bearer secret по умолчанию отсутствует.
- CI: существующие unit/PostgreSQL/browser плюс контракты, E2E-fixtures, fault/recovery, версии документов, изолированная миграция и синтетический pg_dump/pg_restore drill. Никаких реальных денег/пользовательских dump в artifacts.

## Реальная проверка и пределы
Production baseline 09.11.2026: браузер показал health Stage 1.9 DEMO, ready database available, auth config loginEnabled true/publicWebMode landing. Некоторые прямые HTTP-проверки из среды инструмента завершились таймаутом; это не объявляется падением сайта, браузерная проверка успешна. Production Neon/Render/bot не изменялись.
CI и browser результат последнего коммита фиксируется в verification-stage2.0.md. Provider contract fixtures — локальные детерминированные HTTP-ответы внутри облачного CI, НЕ настоящий sandbox провайдера. Внешние sandbox: НЕ ПРОВЕРЕНЫ (нет отдельно разрешённых аккаунтов/секретов/test endpoint). Реальные VPS/VPN, фискальные чеки/договора, LIVE, independent production backup/restore и доставленные UptimeRobot alerts НЕ ГОТОВЫ.

## Сохранено
Liquid Glass CSS, изображения, Premium-эмодзи, навигация основных разделов, auth/cookies, Mini App-покупки/продления, уведомления/очередь, бизнес-модель 170 ₽/30 дней и 3 клиента/VPS. Новый законный website checkout не включается через скрытый query flag; обычный Chrome по-прежнему витрина. Код старого DEMO не заменяется новыми внешними адаптерами.

## Подключение и выпуск
- [Точные действия по провайдерам](providers-stage2.0.md)
- [Операционная готовность и бюджет](operations-stage2.0.md)
- [Мониторинг](monitoring-stage2.0.md), [план мониторов](monitoring-uptimerobot-stage2.0.json)
- [Юридический пакет](legal/README.md)
- [Будущий отдельный DEMO выпуск](release-stage2.0.md)

Новая env только INTERNAL_MONITOR_TOKEN (необязательная, отсутствующая = 401). Provider credentials не добавляются в production env. Никаких секретов в браузерном коде или репозитории. Включение LIVE отсутствует, любой дальнейший платный/production шаг требует отдельного согласования.
