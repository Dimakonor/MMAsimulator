# Деплой: от нуля до игры в Telegram

Есть два уровня. Тестовая версия поднимается за 5 минут без сервера, полная — примерно за 30 минут.

## Уровень 1. Тестовая версия (без сервера) — GitHub Pages
Игра целиком в одном `index.html` (ветка `gh-pages`), прогресс хранится в браузере игрока. Подходит, чтобы показать игру друзьям и проверить, как она выглядит в Telegram. **Оплаты Stars, арена с живыми людьми и напоминания бота здесь не работают.**

1. Уже работает: Pages раздаёт `index.html` из корня ветки `main` → `https://dimakonor.github.io/MMAsimulator/`. (Ветка `gh-pages` содержит то же самое — запасной вариант.)
2. Если адрес не открывается: Settings → Pages → Source: *Deploy from a branch* → `main`, `/(root)`.
3. Telegram → **@BotFather** → `/newbot` → получаешь бота и токен (токен никому не показывай).
4. @BotFather → `/newapp` → выбери бота → название, описание, картинка 640×360 → URL: адрес из шага 2 → короткое имя (например `play`). Получишь ссылку `https://t.me/<бот>/play`: это и есть игра.
5. Опционально: @BotFather → Bot Settings → Menu Button → тот же URL, чтобы у бота появилась кнопка «Играть».

Пересобрать тестовую версию: `node tools/build-preview.mjs <папка с webp> > index.html` и закоммитить в `gh-pages`.

## Уровень 2. Полная версия — Railway + Neon
1. **База:** neon.tech → New project → скопируй connection string (`postgres://…?sslmode=require`).
2. **Хостинг:** railway.app → New Project → Deploy from GitHub → `Dimakonor/MMAsimulator`, ветка `main`. Railway подхватит `Dockerfile` из корня.
3. **Переменные** (Railway → Variables):
   | Переменная | Значение |
   |---|---|
   | `BOT_TOKEN` | токен из @BotFather |
   | `DATABASE_URL` | строка из Neon |
   | `PUBLIC_URL` | `https://<проект>.up.railway.app` (Railway → Settings → Networking → Generate Domain) |
   | `WEBAPP_URL` | то же, что `PUBLIC_URL` |
   | `WEBHOOK_SECRET` | любая длинная случайная строка |
   | `APP_LINK` | `https://t.me/<бот>/play` (из `/newapp`) |
   | `VITE_APP_LINK` | то же, что `APP_LINK` (нужно при сборке фронта) |
4. Деплой. При старте контейнер сам применяет миграции и ставит вебхук бота на `PUBLIC_URL/tg/webhook`.
5. @BotFather → `/myapps` → твоё приложение → **Edit Web App URL** → `PUBLIC_URL` (вместо адреса GitHub Pages).
6. Проверка:
   - открыть `PUBLIC_URL/health` → `ok`;
   - написать боту `/start` → кнопка «Открыть зал»;
   - создать бойца, потренировать;
   - купить «Больничный» за ⭐25 (реальные Stars; вернуть можно командой из `server/src/payments.ts → refund`);
   - со второго аккаунта открыть ссылку «Вызвать друга», провести бой, убедиться, что первому пришло «🩸 Реванш».

## Стоимость
Neon free + Railway Hobby (~$5/мес) или VPS Hetzner (~€5). Serverless (Vercel/Netlify Functions) **не подходит**: холодный старт ломает 10-секундный лимит на `pre_checkout_query`, а воркеру напоминаний нужен постоянный процесс.
