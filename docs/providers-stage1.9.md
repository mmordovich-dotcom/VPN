# Подключение будущих провайдеров после Stage 1.9

Реальные провайдеры не подключены. Ни один из следующих шагов не разрешает реальные платежи/аренду. Нужны отдельное решение владельца, подтверждённый контракт, согласованные лимиты и sandbox proof.

## Платёжный сервис

1. Выбрать законного продавца, юрисдикцию, договор, правила возврата, фискализацию/поддержку и разрешённый канал продаж. Не регистрировать аккаунты и не присылать ключи в чат.
2. Для цифровых услуг внутри Telegram использовать Stars/XTR: [официальный процесс](https://core.telegram.org/bots/payments-stars). Наш STARS_TEST — offline fixture; настоящий successful_payment нужно получать через проверенный webhook существующего бота, сопоставлять buyer/invoice/order/amount/currency/charge ID и хранить evidence. pre_checkout approval и redirect не дают услугу. Добавить /paysupport и безопасный refundStarPayment только после подтверждения действующего контракта.
3. Для независимого сайта сравнить RollyPay/CloudPayments/YooKassa и СБП по договору, webhook authenticity, idempotency/retention, authoritative status query, refunds, receipts, limits, fees и sandbox. В Stage 1.9 vendor методы не придуманы; interfaces описывают только внутренний normalized protocol. Не добавлять внешнюю оплату цифровой услуги в боте как обход Stars.
4. Внешний adapter обязан проверять доверенный серверный источник до accept, не принимать client success как платеж. [YooKassa webhooks](https://yookassa.ru/developers/using-api/webhooks) требуют проверки актуального объекта/источника согласно их документации; test HMAC не выдаётся за реальную подпись YooKassa. Для RollyPay/CloudPayments сначала получить и проверить актуальную первичную документацию выбранного продукта.
5. LIVE сейчас отсутствует в DB CHECK/app mode/factory; одного env-флага недостаточно. Нужны отдельный reviewed PR, sandbox tests, mode-isolated records, quote/FX policy, charge/refund identity, partial refund/dispute handling, reconciliation scheduler и операторские полномочия. Credentials — только защищённые серверные переменные.

## Aeza и серверные операции

[Архив dev-docs AezaGroup](https://github.com/AezaGroup/dev-docs) не является подтверждением текущего API. Не копировать исторические endpoints в реализацию без проверки у провайдера. Не создавать новый аккаунт, ключ или сервер. Действующий личный SWE-PROMO категорически исключён.

До реализации HTTP adapter подтвердить allowed use/resale/правила сервиса, API scopes и sandbox; создание с stable idempotency key, поиск результата по тому же ключу, возможность доказать ABSENT, время хранения ключа, обработку timeout/5xx и квот, валюту/налоги/цену/почасовой расчёт, renewal/suspend/terminate/revoke и политику refunds. Результат UNKNOWN не разрешает повторную покупку.

Встраивать реальные вызовы только в отдельный durable protocol ResourceFoundation: reserve+budget transaction → external call без DB lock → fenced commit. Старые ServerProvider/VirtualProvider — DEMO совместимость; не вставлять HTTP в SubscriptionEngine.prepare. Отдельно реализовать durable renewal/termination и индивидуальное provision/revoke каждого клиента, сохранять общий сервер при окончании одного клиента. Перед LIVE нужны fault tests на реальном sandbox, cost reconciliation, hard per-operation budget, оплаченный лимит владельца и безопасный операторский recovery.

Источники проверены 08.11.2026; будущая реализация должна перепроверить договоры и API заново.
