# Stage 1.8 — Technical Readiness

Аудит 06.11.2026 (Asia/Hovd). Это PR, не production-релиз и не разрешение коммерческой эксплуатации. Исходный main: d14b2ec3ad9e9fe61e631e746d3eb7cf6525b07a (PR №8). Все 207 tracked files сверены с GitHub, включая сохранённые CRLF. Интерфейс Liquid Glass, баннеры, Premium-эмодзи, меню и пользовательские сценарии не изменяются.

## Реальное исходное состояние

Render shared-vps-api: Free, Virginia, Live deploy [dep-dbmp42gm7kps73bvuia0](https://dashboard.render.com/web/srv-dbaf1ueq1p3s73be6in0/deploys/dep-dbmp42gm7kps73bvuia0), точный SHA d14b2ec3ad9e9fe61e631e746d3eb7cf6525b07a. Build/start/health path совпали с облачной документацией. Настройки, secrets и Auto-Deploy не менялись. Публичные health/ready/auth config/instructions ответили 200; me/admin/diagnostics без сессии — 401. Config: demo=true, publicWebMode=landing, loginMode=bot, существующий vpnaxon_bot. Исходная серверная metadata всё ещё 1.6/0.6.0; PR исправляет её на 1.8/0.8.0. Это не свидетельство старого JS в production: deployed SHA проверен отдельно.

Neon patient-queen-83814443 / production br-rapid-butterfly-b4t863o9 / neondb: PG18, Free, 29 таблиц, пять завершённых миграций. Только SELECT и read-only inspect. Снимок агрегатов: 1 пользователь, 6 заказов, 3 подписки (включая историю), 1 обращение, 1 сообщение. Ноль дублей живых мест/пользователей/действующих credentials; ноль PAID-заказов, DEAD jobs, просроченных leases и задач старше пяти минут; stalled queries отсутствуют. Это точечное наблюдение маленькой DEMO-базы, не нагрузочный тест и не гарантия будущего отсутствия ошибок. Тариф basic: 17000 minor RUB, maxUsersPerServer=3; default_capacity=3, capacity4_approved=false. Эти значения не изменены.

## Матрица готовности

| Компонент | Проверенная реализация | Граница / риск реального запуска | Приоритет |
|---|---|---|---|
| API и конфигурация | Fastify schemas, ограничение body 64 KiB, safe errors/request ID; APP_MODE принимает только demo | Нет live mode; публичные GET не имеют общего edge rate limit; lock/DB могут стать узким местом | До commercial: нагрузка и ingress limits |
| Авторизация | HMAC initData, возраст 5 минут, безопасный ID, duplicate params/replay rejection; bot browser proof/одноразовые grants; проверка account switch | Настоящие Telegram-клиенты и политика third-party storage зависят от клиента; нет MFA админов | Сохранить регрессии, определить admin policy |
| Сессии/CSRF | hashed session tokens, host-only HttpOnly Secure SameSite=None Partitioned v2; legacy logout; exact Origin + custom header | Нет интерфейса завершения всех устройств; не обещаем абсолютную защиту от XSS | Cookie defect исправлен; device control позже |
| Mini App/витрина | Серверно проверенный miniApp context, landing обычного браузера, полные DEMO-сценарии внутри Telegram | SDK mocks и Chromium не равны Android/iOS/Web Telegram; preview не production | Ручная приёмка после разрешённого выпуска |
| Telegram webhook/бот | Secret header, persisted unique update_id, inbox lease/retry/fencing; bootstrap не перехватывает чужой webhook | Telegram delivery uncertain не имеет exactly-once гарантии; не делать массовый retry | Карантин и ручная сверка обязательны |
| Подписки/места | Глобальный advisory transaction lock; PAID→COMPLETED атомарно с местом и demo credential; независимые сроки | Общая блокировка ограничивает throughput; провайдер пока pure mock внутри DB transaction | Refund defect исправлен; remote orchestration блокирует live |
| PostgreSQL/Prisma | UNIQUE operation keys, provider/external IDs, order/sub owner-plan FK, RESTRICT; partial UNIQUE живого места; capacity triggers | One-live-per-user и active credential/sub обеспечиваются engine lock, не отдельными UNIQUE DB; обход ORM/SQL опасен | Все новые writers обязаны использовать engine; новые constraints только отдельной проверенной миграцией |
| Очередь/worker | SKIP LOCKED, DB clock, lease token fencing, retry/backoff, unique keys, business+job transaction; restart recovery | Dead job не сбрасывается recover; нуждается в наблюдении/ручном retry. Free sleep останавливает inline runtime | Always-on hosting и внешние alerts до paid launch |
| Уведомления | Opt-in, expiry snapshots, throttling, 429 retry, blocked handling; uncertain send quarantine | Сообщение может быть принято Telegram до DB ack; гарантированное exactly-once невозможно | Не повторять неизвестную отправку автоматически |
| Администрирование | DB role check на каждом запросе, scoped lists/pagination, diagnostics, incident/compensation audit | Админ-действия могут менять цену/вместимость; business constraints не заменяют организационное разграничение | Ограниченный состав админов и review изменений |
| Поддержка/инструкции | Владение ticket/thread, сообщения с operation keys, категории/status; четыре платформы, demo guidance | Нет опубликованной commercial offer/privacy/refund policy, дежурств и SLA; инструкции не создают VPN | Юридические документы/поддержка до денег |
| Платежи | TEST mock, кнопка confirm только DEMO, переходы final state, refund/audit | Нет доверенного финансового inbox/ledger/reconciliation/Stars flow; никаких реальных charge IDs | Блокер commercial |
| VPS/индивидуальный доступ | MOCK server IDs, уникальные demo identifiers, revoke/free slot | Нет реального provisioner, индивидуальных ключей, revoke verification, metering или доказанной изоляции трёх клиентов | Блокер commercial |
| Логи/данные | Запросы без query string, redaction secrets/cookies/initData; ошибки без stack/provider secrets; bounded tech cleanup | Audit не immutable financial ledger; PII остаётся в приватной БД/inbox; нет согласованной retention/export/deletion policy | Определить legal basis, сроки и доступ |
| CI/CD | Build, TS, Prisma, unit, integration, browser, web artifact и cloud validation; secretless isolated PG16.13 | Production PG18; нет полного provider sandbox/load/PITR-drill. Branch protection не подтверждена | До paid: PG18 parity и полный recovery drill |
| Резервирование | Neon history 21600 секунд; pre-release branch/runbook | 6h PITR не независимый backup; RPO/RTO не измерены; старый snapshot может потерять новые платежи | Блокер commercial |

## Реальные изменения

1. Refund оплаченного, но ещё не применённого продления больше не вычитает период из действующей подписки. Откат срока выполняется только когда исходный заказ был COMPLETED. PAID-заказ мог сохраниться после прерывания между commit оплаты и fulfill; его refund теперь сохраняет срок, место и credential. Повторный refund по-прежнему идемпотентен. Применённое продление откатывается один раз существующим сценарием.
2. appendCookie передаёт только новое значение: Fastify сам добавляет Set-Cookie. Старое ручное накопление давало 15 headers вместо четырёх при logout. Новый настоящий Fastify inject тест заменяет вводящий в заблуждение stub; DB integration требует ровно четыре clear headers. Политика безопасности cookie не ослаблена.
3. Regression tests: interrupted paid renewal→refund→restart; failed renewal не возвращается и не активируется; два независимых DB клиента занимают последнее место без overcapacity, четыре credentials различны, composite owner FK защищает чужую подписку. Существующие concurrency/retry/expiry/refund/queue/auth/browser проверки сохранены.
4. Серверная release metadata и root package version обновлены согласованно; архитектура и документы приведены к фактическому состоянию.

## Проверки и предел доказательств

Базовые 263 теста предыдущего выпуска не считаются результатом этого PR. Итоговые количества, точный SHA и ссылки GitHub Actions фиксируются в PR после облачных прогонов: Verify foundation (build/typecheck/Prisma/unit/integration/artifact/cloud) и AXON browser. Полные сборки и тесты выполняются в GitHub, без локального терминала пользователя. Три новых integration case ожидают регрессионный прогон; до зелёного результата код не объявляется проверенным.

Существующие tests/reliability покрывают business commit до queue ack, DB acknowledgement outage, restart, competing consumers, retry/backoff, unknown outgoing result quarantine и cleanup без удаления бизнеса. Это управляемые fault injections в изолированной БД, не эксперимент отключения production Neon. Реальный Telegram после нового кода ещё не проверен: в PR нет deploy. Предыдущая приёмка владельцем Telegram Web после PR №8 остаётся baseline, не новой приёмкой Stage 1.8.

## Что сохранено

Ноль новых миграций/env/dependencies. Старые пять миграций, Prisma schema, тарифы, стоимость/лимит серверов, DEMO gates, UI/JS/CSS Mini App, bot menus/visuals и third-party partitioned cookie tests сохраняются. Не создавались сервисы/боты/серверы/платежи; production не изменена. Рабочие данные не загружались в репозиторий.

Дальнейшие решения и коммерческие блокеры: [провайдеры, платежи, экономика и право](commercial-readiness-stage1.8.md). Порядок отдельного DEMO-выпуска: [release checklist](release-stage1.8.md).
