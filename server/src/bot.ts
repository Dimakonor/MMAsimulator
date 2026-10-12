import { Bot, InlineKeyboard } from 'grammy';
import { env } from './env.js';
import { sql, track } from './db.js';
import { doAction } from './fighters.js';
import { registerPaymentHandlers } from './payments.js';

export const bot = new Bot(env.BOT_TOKEN);

bot.command('start', async (ctx) => {
  const from = ctx.from!;
  const source = ctx.match || null; // t.me/<bot>?start=v12
  await sql`insert into users (id, first_name, username, language_code, source, write_access)
            values (${from.id}, ${from.first_name}, ${from.username ?? null}, ${from.language_code ?? null}, ${source}, true)
            on conflict (id) do update set write_access = true, bot_blocked = false`;
  await track(from.id, 'bot_start', { source });
  const kb = env.WEBAPP_URL ? new InlineKeyboard().webApp('🥊 Открыть зал', env.WEBAPP_URL) : undefined;
  await ctx.reply('Тренер, ты вовремя. Мне нужен человек в углу. Открывай зал — знакомиться.', {
    reply_markup: kb,
  });
});

// Действие прямо из уведомления, без открытия Mini App: самый короткий путь возврата.
bot.callbackQuery(/^act:(feed)$/, async (ctx) => {
  const r = await doAction(ctx.from.id, 'feed', 'bot');
  await ctx.answerCallbackQuery({ text: r.ok ? 'Наелся! Спасибо, тренер.' : r.error });
  if (r.ok) await ctx.editMessageReplyMarkup().catch(() => {});
});

// Пользователь заблокировал / разблокировал бота
bot.on('my_chat_member', async (ctx) => {
  const status = ctx.myChatMember.new_chat_member.status;
  const blocked = status === 'kicked';
  await sql`update users set bot_blocked = ${blocked} where id = ${ctx.from.id}`;
  await track(ctx.from.id, blocked ? 'bot_blocked' : 'bot_unblocked', {});
});

registerPaymentHandlers(bot);

bot.catch((err) => console.error('bot error', err.error));
