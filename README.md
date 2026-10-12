# MMA Simulator — Telegram Mini App

Растишь одного бойца: кормишь, тренируешь, укладываешь спать. Каждые 3 дня — бой с лестницей соперников. Цель — пояс примерно за 30 дней. Бот напоминает голосом бойца, кормить можно прямо из чата.

## Документы
- [`docs/01-concept-review.md`](docs/01-concept-review.md) — жёсткий разбор концепции: дыры, улучшения, монетизация, ролики
- [`docs/02-mvp-14-days.md`](docs/02-mvp-14-days.md) — что включить, что не делать, план по дням
- [`docs/03-metrics-and-gates.md`](docs/03-metrics-and-gates.md) — метрики, пороги, точки решения, SQL
- [`docs/04-tech-notes.md`](docs/04-tech-notes.md) — стек и подводные камни (Stars, бот, iOS/Android)

## Структура
```
shared/   чистая игровая логика: шкалы, действия, бой, баланс (config.ts) + тесты
server/   Hono API + бот grammY + оплата Stars + воркер напоминаний (один процесс)
web/      React + Vite Mini App
```

## Запуск локально
```bash
cp .env.example .env          # BOT_TOKEN, DATABASE_URL
npm install
npm run migrate
npm run dev:server            # API :3000, бот в long polling
npm run dev:web               # Vite :5173, /api проксируется на :3000
cloudflared tunnel --url http://localhost:5173   # https-URL -> @BotFather -> Mini App URL, и в WEBAPP_URL
npm test                      # тесты логики и баланса
```

## Деплой (один сервис)
1. Postgres: Neon или Supabase → `DATABASE_URL`.
2. Railway или Fly: build `npm install && npm run build`, start `npm run migrate && npm start`.
3. Переменные: `BOT_TOKEN`, `DATABASE_URL`, `PUBLIC_URL=https://<домен>`, `WEBAPP_URL=https://<домен>`, `WEBHOOK_SECRET`.
4. В @BotFather: Bot Settings → Configure Mini App → URL = `WEBAPP_URL`.

С заданным `PUBLIC_URL` сервер сам ставит вебхук на `/tg/webhook`. Без него бот работает через long polling.

## Баланс
Все числа лежат в `shared/src/config.ts`. Тест `shared/test/game.test.ts` симулирует игрока, поэтому после правок запускай `npm test`. Текущий баланс: 3 захода в день — чемпион примерно за 31 день, 2 захода — примерно за 43.
