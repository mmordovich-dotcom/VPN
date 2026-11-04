# Stage 1.7 — AXON Liquid Glass Mini App (PR, не production)

База: опубликованный Stage 1.6, c077e563032318c5eb018abbcaaabda41271f1e3. Отдельная ветка stage-1.7-liquid-glass. Merge и Render deploy требуют отдельного разрешения владельца.

## Дизайн
Telegram Mini App получает собственную visual system: чёрно-синий фон, холодные голубые акценты, крупная типографика, слоистые стеклянные панели и мягкие блики. Главная — новый hero с CSS-скульптурой AXON, компактный статус подписки и сетка быстрых действий. Каталог — объёмная карточка тарифа с настоящими ценой/сроком из API, честным списанием 0 ₽ и прежним отдельным подтверждением операции. Подписка, история, профиль, поддержка/переписка, уведомления, инструкции, loading/empty/error/success и dialog используют общий язык.

Нижняя навигация — floating capsule, пять прежних маршрутов, подвижный индикатор active route, aria-current и micro-interactions. Safe areas Telegram/env учитываются снаружи dock; контент имеет запас снизу. С открытой клавиатурой dock скрывается как прежде. Кнопки сохраняют исходные действия и ID.

## Технические границы эффектов
Это CSS-приближение Liquid Glass, не системный iOS shader и не физическое преломление. Используются полупрозрачные градиенты, inset highlights, backdrop-filter blur/saturate и ограниченные тени. Нет WebGL/canvas, тяжёлого видео-фона, нового шрифта/CDN, animation-библиотеки или постоянного pointer tracking. Списки/вложенные quick cards не умножают backdrop blur. Движение короткое и относится к переходам/dock/loading; prefers-reduced-motion отключает его. prefers-reduced-transparency и отсутствие blur дают непрозрачные панели; forced-colors сохраняет active indicator. Светлая тема остаётся доступной. Цвет Telegram chrome соответствует теме.

## Сохранение Stage 1.6
CSS scoped к data-mini-app=true. PublicWebMode=landing и server-verified identity checks остаются прежними. Обычный браузер остаётся AXON-витриной, браузерный ADMIN login сохранён. Изменения unified.ts — импорты оформления, композиция главной/каталога и визуальное состояние dock; api/start/bind/confirmAction сессии, idempotency keys и бизнес-действия сохраняются. API, бот/баннеры/Premium конфигурация, SubscriptionEngine, jobs/leases/retries, Prisma schema/migrations, цены/вместимость, env и Render/Neon настройки не меняются. Миграция не нужна, новых зависимостей/env нет. Release stage/version на сервере остаётся 1.6/0.6.0 до отдельно согласованного выпуска, визуальный PR не подделывает production version.

## Проверка
Все прежние 250 сценариев остаются. Добавлены шесть browser tests: dark/light screens на 320/360/390 px, safe-area dock/active route/reachable footer, cancellation/focus/single mutation в confirmation sheet, reduced motion/transparency, loading/error и empty dashboard. Существующая DEMO purchase/renewal проверка выполняется с landing mode и SDK emulation. Скриншоты сохраняются в CI artifact axon-browser-proof. Результаты точного итогового SHA и ссылки на CI будут указаны в PR/финальном отчёте после выполнения; этот документ сам по себе не означает PASS.

Настоящие Android/iOS/Desktop Telegram и GPU/WebView performance нельзя подтвердить fixtures. Пользовательская приёмка требует отдельно разрешённого выпуска. При review смотреть viewport и full-page screenshot отдельно; проверить яркость/читаемость на собственном телефоне, dock и клавиатуру. Тесты не отправляют production Telegram сообщения и не используют Neon production.
