import { InlineKeyboard, GrammyError, type Bot } from 'grammy';
import { BALANCE as B, advance, HOUR, msUntilSatiety, type FighterState } from '@mma/shared';
import { sql, track } from './db.js';
import { env } from './env.js';

// Правила напоминаний — главное, что отделяет «удержание» от «бота заблокировали».
const MIN_GAP = 8 * HOUR; // не чаще ~2 раз в сутки
const QUIET_FROM = 23; // локальное время
const QUIET_TO = 9;
const HUNGRY_LEVEL = 30;

/** Переносит момент из «тихих часов» пользователя на ближайшие QUIET_TO:00. */
export function outOfQuietHours(ts: number, tzOffsetMin: number): number {
  const local = new Date(ts + tzOffsetMin * 60_000);
  const h = local.getUTCHours();
  if (h >= QUIET_TO && h < QUIET_FROM) return ts;
  const target = new Date(local);
  if (h >= QUIET_FROM) target.setUTCDate(target.getUTCDate() + 1);
  target.setUTCHours(QUIET_TO, 0, 0, 0);
  return target.getTime() - tzOffsetMin * 60_000;
}

export function computeNextReminder(
  state: FighterState,
  now: number,
  lastNotifiedAt: number | null,
  tzOffsetMin: number,
): number {
  const s = advance(state, now);
  const frozenTill = s.frozenUntil ?? now;
  const hungryAt = Math.max(frozenTill, now + msUntilSatiety(s, HUNGRY_LEVEL));
  const fightAt = s.nextFightAt;
  // окно весогонки (со второго боя): напомнить через 2 ч после открытия
  const weighAt = s.fightsCount >= 1 && !(s.weight?.made) ? s.nextFightAt - B.weightCut.window + 2 * HOUR : Infinity;
  let at = Math.min(hungryAt, fightAt, weighAt > now ? weighAt : Infinity);
  if (lastNotifiedAt) at = Math.max(at, lastNotifiedAt + MIN_GAP);
  at = Math.max(at, now + 30 * 60_000);
  return outOfQuietHours(at, tzOffsetMin);
}

export async function scheduleReminder(userId: number) {
  const [row] = await sql<
    { state: FighterState; tz_offset_min: number; last_notified_at: Date | null }[]
  >`select f.state, u.tz_offset_min, u.last_notified_at
      from users u join fighters f on f.user_id = u.id where u.id = ${userId}`;
  if (!row) return;
  const at = computeNextReminder(row.state, Date.now(), row.last_notified_at?.getTime() ?? null, row.tz_offset_min);
  await sql`update users set next_reminder_at = ${new Date(at)} where id = ${userId}`;
}

// Сообщения — голосом бойца, а не системы. Это и есть «привязанность».
function messageFor(name: string, s: FighterState, now: number): { text: string; kind: string } {
  if (s.activeFight) {
    return { kind: 'fight_paused', text: `Тренер, я в клетке! Угол пустой — ты где?\n— ${name}` };
  }
  if (now >= s.nextFightAt) {
    return { kind: 'fight_ready', text: `🥊 Тренер, бой назначен. Я готов. Выходим в клетку.\n— ${name}` };
  }
  if (s.weight && !s.weight.made && s.weight.forFight === s.fightsCount) {
    return { kind: 'weigh_in', text: `⚖️ Завтра взвешивание, а я на ${s.weight.over} кг тяжелее. Гони меня в сауну, тренер.\n— ${name}` };
  }
  if (s.satiety < 15) {
    return { kind: 'starving', text: `Тренер… я ел последний раз вчера. Форма уходит.\n— ${name}` };
  }
  return { kind: 'hungry', text: `Тренер, я проголодался. Без еды завтра на тренировке буду как варёный.\n— ${name}` };
}

export function startReminderWorker(bot: Bot) {
  const tick = async () => {
    const due = await sql<
      { id: string; name: string; state: FighterState; tz_offset_min: number }[]
    >`select u.id, f.name, f.state, u.tz_offset_min
        from users u join fighters f on f.user_id = u.id
       where u.write_access and not u.bot_blocked and u.next_reminder_at <= now()
       order by u.next_reminder_at limit 25`;

    for (const u of due) {
      const userId = Number(u.id);
      const now = Date.now();
      const s = advance(u.state, now);
      const { text, kind } = messageFor(u.name, s, now);
      const kb = new InlineKeyboard();
      if (kind === 'hungry' || kind === 'starving') kb.text('🍗 Покормить', 'act:feed');
      if (kind === 'weigh_in') kb.text('🧖 В сауну', 'act:cut');
      if (env.WEBAPP_URL) kb.webApp('Открыть', env.WEBAPP_URL);
      try {
        await bot.api.sendMessage(userId, text, { reply_markup: kb });
        await sql`update users set last_notified_at = now() where id = ${userId}`;
        await track(userId, 'reminder_sent', { kind });
      } catch (e) {
        if (e instanceof GrammyError && e.error_code === 403) {
          await sql`update users set bot_blocked = true where id = ${userId}`;
          await track(userId, 'bot_blocked', {});
        } else if (e instanceof GrammyError && e.error_code === 429) {
          return; // флуд-лимит — продолжим на следующем тике
        } else {
          console.error('reminder failed', userId, e);
        }
      }
      await scheduleReminder(userId);
      await new Promise((r) => setTimeout(r, 50)); // ≪ 30 msg/s глобального лимита
    }
  };
  setInterval(() => tick().catch((e) => console.error('reminder tick', e)), 60_000);
}
