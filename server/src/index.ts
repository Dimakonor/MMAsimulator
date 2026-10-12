import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { webhookCallback } from 'grammy';
import { env } from './env.js';
import { bot } from './bot.js';
import { api } from './routes.js';
import { startReminderWorker } from './reminders.js';

const app = new Hono();

app.get('/health', (c) => c.text('ok'));
app.route('/api', api);

if (env.PUBLIC_URL) {
  app.post(
    '/tg/webhook',
    webhookCallback(bot, 'hono', { secretToken: env.WEBHOOK_SECRET || undefined }),
  );
}

// Собранный фронт (npm run build) раздаём тем же процессом: один сервис = один деплой.
app.use('/*', serveStatic({ root: '../web/dist' }));
app.get('*', serveStatic({ path: '../web/dist/index.html' }));

serve({ fetch: app.fetch, port: env.PORT }, () => console.log(`http :${env.PORT}`));

if (env.PUBLIC_URL) {
  await bot.api.setWebhook(`${env.PUBLIC_URL}/tg/webhook`, {
    secret_token: env.WEBHOOK_SECRET || undefined,
    allowed_updates: ['message', 'callback_query', 'pre_checkout_query', 'my_chat_member'],
  });
  console.log('webhook set');
} else {
  await bot.api.deleteWebhook();
  void bot.start({ allowed_updates: ['message', 'callback_query', 'pre_checkout_query', 'my_chat_member'] });
  console.log('long polling');
}

startReminderWorker(bot);
