# Mini App и Telegram Login

Mini App — дополнительная страница `/#/connect`: подписка, демо-доступ,
инструкция, статус и ссылка возврата в Telegram. У него общие API и PostgreSQL
с сайтом/ботом. Без действительного входа защищённые данные не показываются.

Mini App использует Telegram.WebApp.initData, переданный backend POST-запросом.
Backend проверяет HMAC-SHA256 по официальной процедуре с ключом WebAppData,
целостность всех полей (кроме hash), дубли параметров, auth_date (5 минут,
допуск будущего 30 секунд) и числовую identity пользователя. initDataUnsafe
не используется как доказательство. Хэш входа одноразовый. Повторный initData
отклоняется; обычное обновление использует действующую серверную cookie. После
выхода/истечения cookie Mini App следует открыть заново из Telegram.

В обычном браузере — актуальная библиотека Telegram Login:
`https://oauth.telegram.org/js/telegram-login.js`, метод Login.auth, scope profile.
Сервер выдаёт nonce и привязывает его к временной HttpOnly cookie. Подписанный
id_token проверяется на сервере по официальному JWKS: RS256, подпись, kid,
issuer, audience, nonce, iat, exp и числовой Telegram id из profile claim.
Для этого потока popup SDK Client Secret не нужен и не передаётся браузеру.
Выбирайте RS256 (по умолчанию) в BotFather. Другие алгоритмы не включены.
Это не старый iframe Login Widget и не доверие JSON-профилю от клиента.

Сессия живёт 7 дней. Cookie production: __Host-sharedvps, Secure, HttpOnly,
SameSite=Lax, Path=/, без Domain. Все browser-изменения требуют точного Origin
из CORS_ORIGINS и заголовка X-Shared-VPS: 1. Logout отзывает серверную сессию.
ADMIN определяется только users.role в базе. ADMIN_TELEGRAM_IDS может явно
повысить подтверждённую identity; для отзыва измените роль в базе и уберите ID
из конфигурации, иначе он снова повысится при Telegram-входе.

Используйте один origin сайта и API. Не размещайте защищённый кабинет напрямую
на другом onrender.com origin: браузеры ограничивают сторонние cookies.
Старый Static Site может только перенаправлять на канонический Web Service.

Источники: [Mini Apps validation](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app),
[Telegram Login/OIDC](https://core.telegram.org/bots/telegram-login). Проверено 16.10.2026.
