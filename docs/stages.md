# Этапы

- Stage 1.1 — monorepo, PostgreSQL/Prisma, ограничения и тесты.
- Stage 1.1.1 — GitHub/Render/Neon, CI и ручной workflow миграций.
- Standalone WebDemo — отдельный визуальный прототип с локальным состоянием.
- Stage 1.2 — общий сайт, бот, Mini App, SubscriptionEngine и защищённая админка.
- Stage 1.2.5 — опубликованная основа ed0b033056c937cbfe66daf4e13a173cd130ac83: bot login, ссылки, коды, серверные сессии. Настоящий вход через подтверждение в боте проверен владельцем.
- Stage 1.3 — ветка stage-1.3-reliability: PostgreSQL jobs, общий inline/standalone runtime, уведомления с opt-in, пагинация, диагностика, лимиты, техническая очистка и план восстановления. Подготовка через PR; production-релиз согласуется отдельно. Результаты — [verification-stage1.3.md](verification-stage1.3.md).

Наличие Stage 1.3 в GitHub не означает её выпуск на Render. Текущий Free не гарантирует 24/7. Новый paid worker, реальные платежи, VPS, Aeza и VPN требуют отдельного задания и разрешения.
