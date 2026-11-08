# AXON — Stage 1.9: Payment & Infrastructure Foundation

База: main a3476347d8c1b854177df4ef63d41e81a1042fa6, опубликованный и принятый пользователем Stage 1.8. Эта ветка — разработка, не production. Метаданные подготовленной версии 1.9/0.9.0; действующий production остаётся 1.8/0.8.0. DEMO остаётся единственным режимом приложения; цены 170 ₽/30 дней и действующие настройки не изменены. Liquid Glass, бот, Premium-эмодзи, баннеры, auth, поддержка и admin сохранены.

## Что реализовано

PaymentFoundation хранит нормализованные доверенные тестовые события в payment_events до обработки. Повтор eventId+operationId возвращает ту же запись; другой digest под тем же ID отвергается. Ключ события scoped к операции, сама операция уникальна на заказ/платёж/provider+mode+externalId. Ошибочная сумма/валюта сохраняется как REJECTED, без активации. Нет публичного маршрута для sandbox webhook: классы доступны только серверному коду и изолированным тестам.

PaymentEventProcessing отделяет изменяемое состояние от неизменяемого evidence. Обработка выполняет payment/order transition, запись CAPTURE/REFUND/STATE и enqueue в одной PostgreSQL-транзакции. Уникальные CAPTURE и REFUND на операцию препятствуют двойному учёту; repeated success не продлевает подписку повторно. Возвраты пока только полные; частичные возвраты, chargeback, fees и double-entry бухгалтерия не реализованы. Это технический журнал тестовых операций, не фискальный учёт. PostgreSQL triggers запрещают UPDATE/DELETE evidence и ledger; владелец БД технически может снять триггер, поэтому это не независимое WORM-хранилище.

PENDING/UNKNOWN/SUCCEEDED/FAILED/CANCELLED/REFUNDED различаются. UNKNOWN не активирует услугу и не означает неуспешный платёж. Неизвестная/недоступная проверка провайдера не принимается за успех; observe() в offline-провайдерах возвращает null, ждёт аутентифицированного события. Поздние pending/failure после capture игнорируются. Refund до capture остаётся PENDING/CAPTURE_REQUIRED и перепроверяется recovery. Противоречащие финальные статусы требуют отдельной операторской сверки; автоматического финансового исправления нет.

DEMO-кнопки и endpoints сохранены: существующий SubscriptionEngine теперь атомарно пишет новые DEMO-переходы в тот же журнал, mode=DEMO/provider=DEMO_TEST. SANDBOX-регистрация запрещает обход через обычную DEMO confirm/refund-кнопку. Старые платежи не переписываются, исторический журнал не выдумывается и не backfill-ится. Для возврата старого платежа capture может отсутствовать в новом журнале: история остаётся в исходных Payment/Order/AuditLog, при сверке требуется legacy-aware анализ.

## Ресурсы и резервирование

ResourceFoundation — отдельный durable mock-протокол поверх существующего ServerProvider/SubscriptionEngine, не реальный Aeza adapter. PostgreSQL резервирует заказу место в существующем сервере или seat будущей операции. До трёх клиентов; HELD partial unique indexes запрещают двойное резервирование места/seat. Подготовка ресурса выполняется вне advisory-lock/DB transaction, со стабильным operationKey и fencing lease token. Результат сохраняется в PostgreSQL, после чего существующий engine создаёт подписку и отдельный demo credential.

RUNNING после истечения lease и UNKNOWN допускают только lookup исходного ключа. Даже ABSENT сейчас не вызывает повторное create: требуется операторское решение/подтверждённый контракт провайдера. Неопределённая операция продолжает удерживать резерв и бюджет. Успешный mock возвращает детерминированный demo:vps:UUID; его lookup — математическая имитация, а не доказательство состояния чужого API. Ошибка активации сохраняет ресурс/резерв для безопасного повтора; refund освобождает HELD, не удаляет общий сервер. Истечение одной подписки отзывает только её credential и освобождает её слот.

Budget — консервативный потолок ожидаемой месячной стоимости, по умолчанию 200000 minor RUB в серверном конструкторе; это 2000 ₽ условной модели, не разрешение потратить деньги. Учитываются ACTIVE/SUSPENDED/PROVISIONING RUB-серверы и PENDING/RUNNING/UNKNOWN новые операции; новая операция сверх лимита отклоняется. Это не фактический баланс/кошелёк, не контроллер сетевого списания и не модель валютного риска/почасовой аренды/повторного продления. Существующая модель виртуальной аренды остаётся прежней. Личный SWE-PROMO не упоминается ни в запросах к провайдеру, ни в runtime-конфигурации.

Legacy VirtualProvider.prepare в прежнем DEMO engine остаётся тестовым/pure-mock seam для совместимости Stage 1.8, не местом для будущего HTTP/Aeza вызова. Новые сетевые адаптеры должны использовать durable protocol; вставлять их в legacy prepare запрещено. Foundation jobs используют отдельные kind и защищённые резервы; обычный fulfill не может обойти обязательное sandbox-резервирование.

## Фоновые задачи и восстановление

Новые kinds: PAYMENT_EVENT, FOUNDATION_FULFILL, PAYMENT_RECOVER. Existing outbox/leases/retry/unknown notification delivery сохранены. Раз в минуту bounded recovery повторяет PENDING events с курсором; PAID orders восстанавливают тот же уникальный fulfillment key, не сбрасывая DEAD/DONE jobs. DEAD после исчерпания попыток требует существующего административного retry; UNKNOWN ресурсы сначала lookup. Платёжное evidence и финансовый журнал не удаляются технической cleanup. На Render Free фоновые операции выполняются только при работающем API; always-on SLA не обещается.

## Адаптеры и изоляция

TestTelegramStarsProvider проверяет подписанный локальный fixture с successful_payment, invoice_payload, telegram_payment_charge_id, total_amount и XTR. pre_checkout/redirect не считаются capture. Цена XTR задаётся явной тестовой quote и хранится отдельно от RUB-заказа; конвертация RUB→XTR не выдумывается. Реальный Telegram webhook/payment methods не подключены. HMAC test-only — протокол offline fixtures, не подпись Telegram или YooKassa.

MockSbpProvider и EXTERNAL_TEST работают без HTTP, SDK и аккаунтов. RollyPayAdapterContract, CloudPaymentsAdapterContract и YooKassaAdapterContract — внутренние interfaces с contractVerified=false, без вымышленных vendor endpoints. LIVE factory, DB mode CHECK и runtime APP_MODE блокируют настоящие операции. Нет новых env или dependencies.

## Миграция и проверки

20261108000000_payment_infrastructure — шесть новых таблиц, индексы/append-only triggers и расширение CHECK списка job kinds. Нет ALTER существующих бизнес-полей, UPDATE, DELETE, backfill, enum change или изменения pricing/capacity. Применять сначала только в disposable CI PostgreSQL. Тест migration preservation разворачивает пять старых миграций, создаёт данные Stage 1.8, применяет шестую и сравнивает все снимки. Production Neon не используется тестами.

Автоматические проверки и окончательные CI-ссылки будут внесены после фактического прогона. Полный сценарий содержится в payment-infrastructure.integration.test.ts: заказ → подписанный SBP mock event → durable inbox → queue → резерв → mock preparation → ACTIVE subscription/demo credential → mock notification. Дополнительно покрываются дубли, отказ/отмена, возврат до/после capture, rollback, restart, UNKNOWN, lease fencing, конкуренция, бюджет и отдельное истечение клиента. Уведомления проверяются перехваченным transport, не настоящим Telegram.

## Готовность Stage 2.0

Готовность основы определяется зелёными CI и review; коммерческий запуск NO-GO. Не завершены: действующие договоры/юрисдикция продавца, подтверждённые API и sandbox провайдеров, реальные Stars invoices/charge reconciliation/refunds, partial refunds/disputes/fees/fiscal ledger, durable renewal/termination/revocation реальных ресурсов, индивидуальные реальные credentials, независимый backup restore drill, всегда работающий hosting/monitoring и нагрузочные SLO. Mock/fault tests доказывают только свойства нашей модели. Stage 2.0 не начинается автоматически.

## Совместимость PostgreSQL 18

CI дополнен matrix PostgreSQL 16.13 и 18. В PostgreSQL 18 прежний RESTRICT FK возвращает SQLSTATE 23001; Prisma 6.19.3 оставляет его PrismaClientUnknownRequestError вместо P2003. Три старых теста сохранности уточнены: допускают P2003 либо конкретный 23001 + subscriptions_server_slot_id_fkey, проверяют сохранность строки. Сама FK/бизнес-логика не менялась; произвольная ошибка не считается успехом проверки.
