# Обновление Shared VPS Platform через браузер

Этот документ описывает выпуск Stage 1.2.5 в существующие GitHub, Render и Neon. Подробности входа и защиты — в [Stage 1.2.5](stage-1.2.5.md). Команды ниже являются значениями полей облака; запускать их на своём компьютере не нужно.

## GitHub

Репозиторий: https://github.com/mmordovich-dotcom/VPN. Изменения сначала публикуются в отдельную ветку и Pull Request. Дождитесь зелёного **Verify foundation** для последнего коммита, проверьте diff и только затем объединяйте с main. Тесты Stage 1.2 и новые проверки авторизации должны пройти вместе. Не загружайте .env, node_modules, dist, рабочие файлы или секреты.

Если подключение GitHub возвращает 403, обновите разрешения стандартным входом в GitHub Repositories через github.dev/vscode.dev или используйте Add file → Upload files в **нужной ветке и папке** сайта GitHub. Отсутствие доступа нельзя обходить извлечением токенов. Наличие локального кода не означает публикацию: проверьте commit/PR на GitHub.

## Миграция существующей Neon

Используется только проект **patient-queen-83814443**, production **br-rapid-butterfly-b4t863o9**, neondb. Другой старый проект не меняйте. До production проверьте миграцию на отдельной ветке этой production. Новая миграция **20261025000000_bot_login** только добавляет auth-таблицы; прежние данные и две исходные миграции сохраняются.

В GitHub → Settings → Secrets and variables → Actions уже предусмотрен **NEON_MIGRATION_DATABASE_URL**: direct Neon URL, SSL. Если секрет актуален, не меняйте его. Никогда не вставляйте строку подключения в код, PR или чат.

После merge: Actions → **Cloud database - migrate and seed** → Run workflow → main. Workflow сначала запускает все проверки, затем Prisma migrate deploy и повторяемый demo seed. При ошибке не используйте reset/db push и не публикуйте несовместимый API.

## Существующий Render Web Service

Сервис **shared-vps-api**, https://shared-vps-api.onrender.com, план Free. Перед первым выпуском новой схемы временно выключите Auto Deploy, чтобы дождаться миграции. Root Directory — пусто.

| Поле | Значение |
|---|---|
| Build Command | corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm build:cloud:unified |
| Start Command | node apps/api/dist/main.js |
| Health Check Path | /health |
| NODE_VERSION | 22.22.2 |

Сайт, API и Telegram webhook работают на одном origin. Дополнительный worker, отдельный бот или новая база не нужны. Старый Static Site можно сохранить как перенаправление на API/site origin.

В Render → Environment проверьте:

| Имя | Назначение |
|---|---|
| NODE_ENV | production |
| APP_MODE | demo |
| API_HOST | 0.0.0.0 |
| LOG_LEVEL | info |
| PUBLIC_ORIGIN | https://shared-vps-api.onrender.com |
| CORS_ORIGINS | https://shared-vps-api.onrender.com |
| DATABASE_URL | pooled URL той же новой Neon production, SSL, connect_timeout=15, connection_limit=3 |
| TELEGRAM_BOT_TOKEN | токен существующего vpnaxon_bot; только защищённое поле Render |
| TELEGRAM_WEBHOOK_SECRET | отдельный случайный секрет 32–256 символов A–Z/a–z/0–9/_/-; только поле Render |
| TELEGRAM_BOT_USERNAME | vpnaxon_bot, без @ |
| ADMIN_TELEGRAM_IDS | подтверждённые числовые ID администраторов через запятую; можно оставить пустым |

**TELEGRAM_LOGIN_CLIENT_ID и TELEGRAM_LOGIN_CLIENT_SECRET для нового входа не нужны.** PORT назначает Render. В VITE_* нет секретов. Оставьте Blueprint Auto Sync выключенным.

После успешной миграции выполните Manual Deploy проверенного коммита. При старте API сверяет username бота с токеном и регистрирует webhook, если текущий адрес пуст или уже совпадает с адресом этого API. Чужой webhook автоматически не заменяется. Pending updates не отбрасываются. Не запускайте параллельный polling-процесс.

## Проверка после публикации

Откройте /health, /ready и /api/v1/auth/config. Последний должен показывать stage 1.2.5 и loginMode bot. Затем /#/login: откройте бота, сравните число, подтвердите запрос и вернитесь в тот же браузер. Обновлять страницу вручную не требуется. Дополнительно проверьте /login и /code в боте, повторный вход в тот же UUID, выход, повторное использование и истечение ссылок/кодов.

При наличии ADMIN_TELEGRAM_IDS роль назначается при проверенном Telegram-контакте. Если потребуется первоначальное назначение роли владельцем базы, используйте только свой подтверждённый UUID и прежнюю административную процедуру; публичного API повышения роли нет.

Проверьте демонстрационную покупку и ту же подписку в боте, сохранение после перезагрузки и продление. Все деньги и VPS остаются демонстрационными. После успешных проверок можно вернуть Auto Deploy → After CI checks pass.

## Ограничения

Free Render может засыпать; холодный запуск задерживает страницу и ответы бота. Гарантии 24/7 нет, keep-alive обходы не добавляются. Если бот молчит, проверьте имена переменных, getWebhookInfo через админку, отсутствие старого polling и безопасные сообщения Render Logs. Не вставляйте Bot API token в URL браузера.

При сообщении Telegram webhook setup pending проверьте, что токен принадлежит vpnaxon_bot, PUBLIC_ORIGIN совпадает и существующий webhook не указывает на другое приложение. Тестовая доставка не доказывает работу реального Telegram: Android/iOS, компьютер + телефон и production-сессии проверяются отдельно владельцем. Итог выпуска должен содержать точные commit/PR/CI ссылки и список непроверенных сценариев.

