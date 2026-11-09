# Контролируемый будущий выпуск Stage 2.0 · DEMO ONLY

Этот PR НЕ разрешает merge/deploy/production migration. Нужен отдельный запрос владельца с утверждённым head SHA.
1. Проверить последний main, PR head, diff, конфликты и все CI: PostgreSQL 16.13/18, build/typecheck/unit/integration, Prisma, restore drill, cloud/artifact и browser. Старые миграции неизменны, новая только 20261109000000_integration_sandbox_legal.
2. В существующем Render shared-vps-api временно Auto-Deploy Disabled. Не менять plan, env/Neon/bot token/webhook/тарифы/места.
3. Merge проверенного PR; дождаться зелёного CI точного merge SHA.
4. Подготовить безопасную бесплатную точку восстановления существующей Neon patient-queen-83814443/br-rapid-butterfly-b4t863o9 при доступной квоте. Не удалять старые snapshots, не покупать ресурсы, не менять late-butterfly-12751417. Снять fingerprints существующих пользователей/заказов/платежей/подписок/доступов/обращений/настроек и immutable журналов.
5. Отдельно согласованная добавочная миграция через существующий Cloud database - migrate and seed на main, direct NEON_MIGRATION_DATABASE_URL. Никакого reset/push/ручного удаления. Убедиться в сохранении всех fingerprints и цен/вместимости. Старое приложение совместимо с новой схемой.
6. Manual Deploy точного merge SHA в существующем shared-vps-api. DATABASE_URL остаётся pooled. Новые provider credentials НЕ задавать; текущий buildApp не устанавливает sandbox routes и не отправляет внешние платежи/Aeza.
7. Проверить /health,/ready,/api/v1/auth/config,/api/v1/legal, витрину и /#/legal, запрет direct draft body, private/admin 401, /internal/monitor без токена 401, существующий Telegram webhook и отсутствие критических ошибок. Дизайн/баннеры/эмодзи не меняются.
8. Владелец в настоящем Telegram проверяет /app/автовход/reload/подписку/DEMO-продление/историю/поддержку, /terms,/paysupport и правовую информацию. Автоматические fixtures не заменяют этот шаг.
9. После успешных технических проверок восстановить Auto-Deploy After CI Checks Pass; записать точный SHA/deploy URL/CI/миграцию и ручную приёмку. Если сбой критический — остановить выпуск, оставить Auto-Deploy Disabled до расследования и отчёта; не пытаться бесконтрольно повторять операции.

## Восстановление
Старые таблицы/строки не удаляются и не перекодируются. При проблеме приложения вернуть предыдущий проверенный Render SHA (Stage 1.9: 8ae4832ec8dc1c88234c8b4c049df82ee22ca715), сохранив добавочные таблицы. Не делать rollback SQL или restore поверх production без отдельного решения и понимания новых записей. При сомнительном платеже — UNKNOWN/reconcile, не повторный create/refund. LIVE платежей/VPS этим выпуском не существует.
