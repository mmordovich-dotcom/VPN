# Telegram Web: embedded session compatibility

Причина: production SameSite=Lax cookies исключаются из cross-site iframe запросов Telegram Web. Подписанная initData может быть принята, но последующий запрос теряет session/proof cookie.

Production cookies v2 используют HttpOnly, Secure, SameSite=None, Partitioned, host-only __Host prefix и Path=/. Раздельное имя исключает конфликт partitioned и прежних unpartitioned cookie. Старые действительные browser sessions принимаются при отсутствии v2; malformed v2 не откатывается к legacy. Logout отзывает все предъявленные собственные session tokens и очищает v2/legacy session/proof cookies, сохраняя все Set-Cookie headers. Bot login proof требует свежий v2 запрос. Проверка exact Origin + x-shared-vps на POST, серверная initData-подпись, replay, account binding, RBAC и idempotency не меняются. Токены не выдаются JS/URL/localStorage.

Добавлены unit, обновлены production integration expectations; настоящие browser cross-site iframe tests используют production cookie builder, воспроизводят отказ Lax и проверяют CHIPS/HttpOnly/изоляцию разных top-level sites. Новых env/миграций нет. Результат зависит от поддержки partitioned cookies браузером; полная блокировка любого хранения клиентом не обходится.

Источники: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie и https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Privacy_sandbox/Partitioned_cookies . Это отдельный hotfix PR; публикация только после CI и отдельного контролируемого разрешения.

## Контролируемый выпуск и восстановление

После зелёных CI проверить последний PR head и отсутствие конфликтов, отключить Auto-Deploy, объединить PR, дождаться CI merge SHA и вручную опубликовать точный SHA существующего shared-vps-api. Миграции, новые env и изменения Telegram webhook не нужны. Проверить /health, /ready, /api/v1/auth/config, анонимную защиту admin/me, вход и выход в Telegram Web и обычную браузерную админку. Подписки и поддержка сохраняют прежние API. После технических проверок восстановить After CI Checks Pass.

При критической ошибке остановить выпуск; возврат на предыдущий Live SHA 9ba2c12ab95ffe002ffb48773a4b691d4cd4aa67 не требует отката БД. Новые v2 cookies после отката не читаются старой версией: потребуется повторный вход, а Telegram Web снова будет иметь исходное ограничение. Незавершённые legacy login requests нужно начинать заново; действительные legacy browser sessions сохраняются до штатного истечения или logout. Сессии Mini App в разных top-level contexts намеренно раздельные; выход отзывает токены текущего контекста, не обещает выход со всех устройств.

Browser CI uses pinned Playwright 1.56.1, whose combined default flag disables ThirdPartyStoragePartitioning. Only the two cookie-policy tests remove that combined flag to restore normal Chromium privacy defaults; the existing 24 UI tests keep their original configuration. The cookie tests also assert the browser-reported partitionKey, HttpOnly, Secure and SameSite=None. Upstream source: https://github.com/microsoft/playwright/blob/v1.56.1/packages/playwright-core/src/server/chromium/chromiumSwitches.ts .

The cookie-policy spec uses a real loopback HTTPS server in CI and three reserved .test hostnames, not response interception. OpenSSL generates a disposable certificate inside the runner; only this synthetic fixture context trusts it. The spec checks the actual Chromium command line to ensure storage partitioning is enabled, and inspects browser partitionKey plus real request cookie headers. Production TLS, browser settings and credentials are untouched.
