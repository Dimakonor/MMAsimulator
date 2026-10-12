# MMA Simulator — Telegram Mini App

Растишь одного бойца с улицы до пояса. Кормишь, тренируешь ударку, борьбу и кардио, гоняешь вес перед взвешиванием. Каждые 3 дня выходишь в клетку: гейм-план, совет из угла между раундами, нокауты, сабмишны, судейские записки. Пояс примерно за 30 дней.

**Арена:** бои с бойцами других игроков (асинхронно), рейтинг ELO, топ-50, вызов друга по ссылке, реванш по уведомлению от бота.

Три темы на выбор, у каждой свой стиль: **Подвал** (пиксель-арт), **Горный лагерь** (комикс), **Неоновая арена** (постер турнира).

## Документы
- [`docs/01-concept-review.md`](docs/01-concept-review.md) — жёсткий разбор концепции
- [`docs/02-mvp-14-days.md`](docs/02-mvp-14-days.md) — скоуп MVP и план по дням
- [`docs/03-metrics-and-gates.md`](docs/03-metrics-and-gates.md) — метрики, пороги, SQL
- [`docs/04-tech-notes.md`](docs/04-tech-notes.md) — стек и подводные камни
- [`docs/05-game-design.md`](docs/05-game-design.md) — механика, соперники, бой, баланс, темы

## Структура
```
shared/      чистая игровая логика: уход, навыки, весогонка, пошаговый бой, соперники + тесты баланса
server/      Hono API + бот grammY + оплата Stars + напоминания (один процесс)
web/         Preact + htm Mini App (без JSX и плагинов), демо-режим вне Telegram
web/art-src/ арт в base64 (39 картинок, 3 темы) — распаковывается `npm run art`
tools/       unpack-art.mjs, build-preview.mjs (автономное превью без npm)
```

## Запуск
```bash
cp .env.example .env          # BOT_TOKEN, DATABASE_URL
npm install
npm run migrate
npm run dev:server            # API :3000, бот в long polling
npm run dev:web               # распакует арт, Vite :5173, /api → :3000
npm test                      # логика + симуляция баланса
```
Открытая в обычном браузере игра работает в **демо-режиме**: вся логика локально, внизу машина времени (+3ч, +1д, «к бою»). В Telegram — настоящий сервер.

Превью одним файлом без npm: `npm run preview` (нужен Node 22.7+), получится `preview.html`.

## Деплой (один сервис)
1. Postgres: Neon или Supabase → `DATABASE_URL`.
2. Railway или Fly: build `npm install && npm run build`, start `npm run migrate && npm start`.
3. Переменные: `BOT_TOKEN`, `DATABASE_URL`, `PUBLIC_URL`, `WEBAPP_URL`, `WEBHOOK_SECRET`.
4. @BotFather → Bot Settings → Configure Mini App → URL = `WEBAPP_URL`.
5. Для вызовов и реваншей: @BotFather → /newapp → получишь `https://t.me/<bot>/<app>`. Укажи его в `APP_LINK` (сервер) и в `VITE_APP_LINK` (при сборке фронта).
