# Проверки Stage 1.6
Первый полный зелёный коммит: 9820f08038e51078c74bfe3ff97e40b8bd4167cb (01.11.2026, Asia/Hovd). 105 unit + 100 PostgreSQL integration + 17 Chromium browser = **222 PASS**. Окончательный head после записи этого отчёта проверяется перед передачей владельцу; точный SHA и текущий CI приведены также в [PR №5](https://github.com/mmordovich-dotcom/VPN/pull/5/checks). Stage 1.6 не опубликована.

| Проверка | Результат | Доказательство |
|---|---|---|
| Build / typecheck | PASS | [Verify foundation](https://github.com/mmordovich-dotcom/VPN/actions/runs/41297987116), job 124822826457 |
| Unit | 105 PASS, 18 suites | тот же run |
| PostgreSQL integration | 100 PASS, 7 suites | тот же run, изолированные CI schemas |
| Prisma validation | PASS | The schema at prisma/schema.prisma is valid |
| Production web / artifact | PASS | нет server secrets, loopback fallback или local business state |
| Cloud validation | PASS | официальный Render YAML schema / commands / workflow safety |
| Chromium browser | 17 PASS | [AXON browser checks](https://github.com/mmordovich-dotcom/VPN/actions/runs/41297987146), job 124822796415 |

Добавлены 12 unit, 17 integration и 7 browser сценариев поверх 186 сценариев Stage 1.5. Визуально просмотрены собранные тёмная/светлая desktop-витрины, мобильная витрина 320 px, Mini App и preview inline-меню. Снимки приложены к PR; CI artifact axon-browser-proof хранится 7 дней.

Первый прогон выявил и исправил ограничение SupportService.thread: для полного текста в чате нужен разрешённый bounded page size 1 наряду с прежними 5/30. В старых тестах уточнены отдельно единственная отправка удаления клавиатуры и единственная отправка inline-меню при сбое DB acknowledgement, а legacy confirmation учитывает сохранение важного сообщения через sendMessage. Новый браузерный тест исправлен на фактический путь Профиль → Поддержка. Проверки не отключались.

## Сохранение сценариев
Сохранены все 186 тестовых сценариев Stage 1.5. Ожидания версии, структуры меню, явного перехода от preview к сохранённому заказу и безопасной доставки адаптированы к согласованному UX. Защита владельца, ролей, повторов, лимитов, вместимости, миграций и старых confirm callbacks не отключена.

Добавлены проверки вертикального меню, style fallback, unknown delivery, missing edit target, ACK до engine, отсутствующего исходного сообщения, старого queued Reply Keyboard, повторных кнопок, зафиксированных условий и срока старого подтверждения, полной переписки, общей базы бота/Mini App, server-verified Mini App context, CSRF/RBAC и поведения витрины.

Прежние пользовательские веб-экраны проверяются с fixture publicWebMode=full, подтверждая сохранённые компоненты. Отдельные сценарии проверяют реальный default landing и защищённую админку. Telegram SDK и network transport в CI имитируются; HMAC initData и cookie/session/RBAC проверяются настоящим backend на изолированном PostgreSQL.

## Реальная исходная среда — 01.11.2026
- GitHub main и Render Live: 947ca863096574fc8447065c3cebcbabb86d2b09 / Stage 1.5.
- /health, /ready, /api/v1/auth/config: HTTP 200; demo=true, бот vpnaxon_bot.
- Neon patient-queen-83814443 / br-rapid-butterfly-b4t863o9: пять успешных миграций, пользователи 1, заказы 3, подписки 2, обращения 0, capacity 3, approval false.
- Stage 1.6 не опубликована. Production-данные, конфигурация Render и Telegram-бота не менялись.

## Границы проверки
Настоящие Telegram Android/iOS/Desktop и системная экранная клавиатура не считаются проверенными через Chromium/SDK fixtures. Нативные цвета и размеры кнопок определяет клиент. Screenshot bot menu preview — визуализация фактического Bot API payload, не снимок настоящего Telegram. Реальные вход/покупка/поддержка/уведомления новой версии требуют отдельной приёмки после согласованного выпуска.
