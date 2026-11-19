# Vastu Portal

A modern educational platform for Vastu courses.

## Features
- Student Dashboard
- Video Lessons
- Material Downloads
- Teacher Course Editor

## Tech Stack
- React + Vite
- Tailwind CSS
- Supabase (Auth + Database)

## Васту для бизнеса: продажа записи и чат поддержки

Курс «Васту для бизнеса» (`vastu-2`) продаётся в записи круглый год в двух тарифах с доступом на **6 месяцев с даты покупки** (`course_offers.access_from = 'purchase'`):

- **Самостоятельно** (`biz-self`, 35 000 ₽) — 6 месяцев доступа к курсу `vastu-2`, без чата поддержки.
- **С поддержкой** (`biz-support`, 50 000 ₽) — 6 месяцев доступа к курсу `vastu-2` и 6 месяцев поддержки в закрытом Telegram-чате (через таблицу `support_chat_access` и встроенного бота в `server.js`).

Пока переменные `BIZ_SELF_LAVA_OFFER` и `BIZ_SUPPORT_LAVA_OFFER` не заданы, оба тарифа скрыты в `/grant` и отклоняются в GetCourse через стандартный путь `unmapped` + алерт Тимуру.

### Переменные окружения

| Переменная | Назначение |
| --- | --- |
| `BIZ_SELF_LAVA_OFFER` | UUID оффера Lava для тарифа «Самостоятельно» (35 000 ₽) |
| `BIZ_SUPPORT_LAVA_OFFER` | UUID оффера Lava для тарифа «С поддержкой» (50 000 ₽) |
| `SUPPORT_CHAT` | Режим бота: `off` (по умолчанию) \| `dry-run` \| `live` |
| `SUPPORT_CHAT_BOT_TOKEN` | Токен отдельного бота чата поддержки (обязателен). Токен бота уроков `TELEGRAM_BOT_TOKEN` здесь не используется: вебхук, который сервер регистрирует при запуске, остановил бы его `getUpdates` |
| `SUPPORT_CHAT_BOT_USERNAME` | Username бота без `@` (для кнопки `https://t.me/<username>?start=<token>` в письме) |
| `SUPPORT_CHAT_ID` | ID закрытого Telegram-чата поддержки (например, `-1001234567890`) |
| `TELEGRAM_WEBHOOK_SECRET` | Необязательно. Секрет для заголовка `X-Telegram-Bot-Api-Secret-Token` на `POST /api/telegram/support-bot` (латиница, цифры, `_`, `-`). Если не задан, выводится из `SUPPORT_CHAT_BOT_TOKEN` |

Для рассрочки через GetCourse процесс должен передавать тариф явно: `tier=biz-self` или `tier=biz-support` (из названия позиций бизнес-тарифы не угадываются).

### Порядок включения

1. **Применить миграцию** [`supabase/migrations/20261119_biz_evergreen.sql`](supabase/migrations/20261119_biz_evergreen.sql) в Supabase SQL Editor (добавляет `course_offers.access_from`, `course_offers.support_chat_months` и таблицу `support_chat_access` с включённым RLS без политик).
2. **Заполнить и выполнить шаблон офферов** [`supabase/biz-evergreen-offers.template.sql`](supabase/biz-evergreen-offers.template.sql), подставив реальные UUID `<BIZ_SELF_LAVA_OFFER>` и `<BIZ_SUPPORT_LAVA_OFFER>` (и при необходимости product UUID из Lava).
3. **Добавить переменные окружения** на Render (`BIZ_SELF_LAVA_OFFER`, `BIZ_SUPPORT_LAVA_OFFER`, `SUPPORT_CHAT_BOT_TOKEN`, `SUPPORT_CHAT_BOT_USERNAME`, `SUPPORT_CHAT_ID`), временно выставив `SUPPORT_CHAT=dry-run`. Убедиться, что бот добавлен администратором в закрытый чат с правами создавать пригласительные ссылки и удалять участников.
4. **Вебхук Telegram** сервер регистрирует сам при каждом запуске (в логе `support chat webhook set: …`; если Telegram его не принял, приходит письмо на `ALERT_EMAIL`). Перерегистрировать вручную можно через админ-эндпоинт:
   ```bash
   curl -X POST https://<host>/api/admin/support-chat/set-webhook \
     -H "x-cron-secret: $CRON_SECRET" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```
   При необходимости можно передать свой URL: `-d '{"url":"https://<host>/api/telegram/support-bot"}'`. Вебхук регистрируется с `allowed_updates: ["message", "chat_member"]`.
5. **Проверить в режиме `SUPPORT_CHAT=dry-run`**:
   - статус и ближайшие 20 истечений (без токенов): `GET /api/admin/support-chat` с `x-cron-secret`;
   - пробный прогон крона (логирует действия, ничего не отправляет): `POST /api/cron/support-chat` с `x-cron-secret`.
6. **Переключить в боевой режим**: выставить `SUPPORT_CHAT=live` на Render. Почасовая проверка внутри сервера (тот же таймер, что у остальных задач; отдельного платного крона на Render нет) начнёт отправлять напоминание за 7 дней и выводить участников по истечении 6 месяцев (`banChatMember` + `unbanChatMember` с `only_if_banned=true`, не трогая владельца и админов чата).
