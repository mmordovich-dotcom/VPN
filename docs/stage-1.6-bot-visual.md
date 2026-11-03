# Stage 1.6 — AXON Bot Visual Design (дополнение, не опубликовано)

Исходная production-версия: 06b878d44483918c2a78295fcd8db7c6d4909530, PR №5. GitHub main и Render Live сверены 02.11.2026. Изменения готовятся в существующей stage-1.6-telegram-first, отдельно от production; нужны новое review и отдельное разрешение на merge/deploy.

## Сохранённые функции и режимы
Web UI, Auth, SubscriptionEngine, schema/migrations, цены, вместимость, очередь заказов и провайдеры не менялись. Обычный Chrome показывает AXON-витрину. Полный интерфейс и DEMO-оформление/продление остаются в Telegram Mini App с серверно проверенной initData-сессией. URL-параметр сам по себе не открывает кабинет. Существующий браузерный ADMIN-вход сохранён.

## Ресурсы и замена
- Исходник: assets/bot/source/axon-banner-v1.png, оригинальный AXON, создан встроенным Imagegen. 1774×887, PNG, менее 5 MB.
- Доставляемая копия: apps/web/public/assets/bot/axon-banner-v1.png; проверяется побайтное совпадение с исходником.
- Все пять разделов используют универсальный баннер, разные подписи и собственные прежние кнопки. Названия разделов и DEMO-условия не вписаны в изображение, чтобы их можно было обновлять независимо.
- apps/api/src/bot-visual-config.ts — только mediaEnabled, пути/revision и настройки emoji. Бизнес-действия не зависят от изображения, revision или Telegram file_id.
- Заменить исходник и публичную копию; для новой версии предпочесть новое имя файла и revision в manifest. Можно направить отдельные sections на отдельные изображения. Не менять engine, подписки, БД или callback IDs. Проверить CI, показать изображения владельцу и выпускать только после отдельного согласования.
- Путь ограничен /assets/bot/*.png|jpg|jpeg и собственным canonical HTTPS PUBLIC_ORIGIN. Случайных сторонних image URLs нет. PNG/JPEG отдаёт прежний безопасный /assets/* с корректным MIME.
- file_id — необязательный кэш в памяти процесса, ключ — asset URL с revision, изолирован по экземпляру бота. Он не зашит в код и не является идентификатором подписки. После перезапуска первая отправка использует собственный URL. Известный неверный cached ID сбрасывается, один раз проверяется URL; затем возможен текстовый fallback.
- Подготовленная delivery response хранится в существующем inbox как прежде, в том числе с выбранным изображением. Не удалять старые asset versions, пока соответствующие queued replies ещё ожидают отправки. Замена оформления не требует ручной правки БД или миграции.

## Отправка и навигация
Главное меню / каталог / кабинет / инструкции / список поддержки: sendPhoto + caption_entities + inline keyboard. Пять вертикальных главных действий, success у подключения, primary у приложения. Ошибки, уведомления, подтверждения покупки/отмены и длинные сообщения не получают новые фото.

При навигации используются editMessageCaption, editMessageMedia и editMessageReplyMarkup с учётом фактического типа сообщения. Фото никогда не редактируется через editMessageText. Длинная переписка не обрезается до caption limit: отправляется полноценным текстовым сообщением. Важные receipts продолжают открывать новое меню через o:, новые navigation callbacks n: редактируют меню. Старые команды/callbacks сохранены.

Из Telegram callback сохраняются только file_id исходной фотографии и хэши caption/entities, без эхоподписи/кодов. Эти внутренние признаки заново вычисляются из оригинальных полей Telegram; переданные photoFileId/captionDigest не принимаются на веру.

ReplyKeyboardRemove по-прежнему отправляется отдельно и durably checkpointed перед меню; continuation сохраняет весь prepared media reply. Перед каждой отправкой/безопасным повтором проверяется текущий lease. При неопределённом результате sendPhoto/edit* не выполняется альтернативная отправка: сохраняется quarantine. Текстовый fallback допустим только после подтверждённого отказа изображения; blocked chat и посторонние ошибки не маскируются. После успешной доставки и сбоя DB acknowledgement не рассылается дубликат.

## Настоящие custom emoji
Владелец выбрал https://t.me/addemoji/IslomjonAnimeEmoji (публичная страница: Mix Emoji). Конфигурация хранит setName и необязательные overrides IDs. Реальные ID берутся из getStickerSet; принимаются только custom_emoji stickers с действительными ID из ответа и подходящим Unicode emoji. Отдельно заданные IDs проверяются через getCustomEmojiStickers, а не считаются действительными по одному regex. В production-конфигурации выдуманных или демонстрационных ID нет.

Сообщения используют custom_emoji entities, фотографии — caption_entities, кнопки — icon_custom_emoji_id. emojiHtml поддерживает экранированный <tg-emoji emoji-id="…"> для проверенного ID; HTML никогда не помещается в label кнопки. Смещения/длины entities считаются в UTF-16. Unicode остаётся текстовой альтернативой, обычные клиенты/пользователи без Premium не должны терять смысл сообщения.

Если нужной иконки нет в наборе, нет доступа к набору, Premium недоступен или Telegram отверг optional formatting, применяется обычный Unicode. Подтверждённый отказ custom emoji отключает их в этом процессе; сообщение повторяется без необязательной разметки/иконок. Новых paid usernames/покупок нет. Наличие Premium у владельца принимается со слов владельца; реальная доступность для @vpnaxon_bot до отдельного выпуска не утверждается.

## Проверки и приёмка
Прежние 224 сценария сохраняются. Старые тесты бизнес/legacy text channel явно выбирают textOnlyBotVisuals; новый production media policy тестируется отдельно: 18 unit и 8 PostgreSQL integration сценариев. Прежний browser preview теперь показывает реальный подготовленный media payload/изображение в тёмной и светлой теме, на 390 и 320 px. Он подписан как preview, не настоящий Telegram, и не подделывает Premium-иконки. Существующий browser test покупки/продления Mini App остаётся в landing mode.

Результаты точного head — в CI нового PR. CI использует API/SDK fixtures и изолированный PostgreSQL, не production. Живые Android/iOS/Desktop, реальные Premium-ID из выбранного набора и доставки @vpnaxon_bot проверяются только после отдельного разрешения владельца на выпуск. Изображение показано владельцу до публикации и может быть заменено через assets/manifest без переделки этапа.

Официальные источники (сверены 02.11.2026):
- https://core.telegram.org/bots/api#sendphoto
- https://core.telegram.org/bots/api#editmessagecaption
- https://core.telegram.org/bots/api#editmessagemedia
- https://core.telegram.org/bots/api#editmessagereplymarkup
- https://core.telegram.org/bots/api#messageentity
- https://core.telegram.org/bots/api#inlinekeyboardbutton
- https://core.telegram.org/bots/api#getstickerset
- https://core.telegram.org/bots/api#getcustomemojistickers
- https://core.telegram.org/bots/api#html-style
- https://core.telegram.org/bots/api-changelog
