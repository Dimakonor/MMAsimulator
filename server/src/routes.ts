import { Hono } from 'hono';
import { LADDER, PRODUCTS, fightPower, type ActionType } from '@mma/shared';
import { validateInitData, type InitData } from './auth.js';
import { env } from './env.js';
import { sql, track } from './db.js';
import { createFighter, doAction, doFight, viewFighter } from './fighters.js';
import { bot } from './bot.js';
import { createInvoiceLink, isProduct } from './payments.js';
import { scheduleReminder } from './reminders.js';

type Vars = { Variables: { tg: InitData } };
export const api = new Hono<Vars>();

// Авторизация: заголовок `Authorization: tma <initData>`
api.use('*', async (c, next) => {
  const h = c.req.header('authorization') ?? '';
  const raw = h.startsWith('tma ') ? h.slice(4) : '';
  let tg = raw ? validateInitData(raw, env.BOT_TOKEN) : null;
  if (!tg && env.DEV_AUTH_BYPASS) {
    tg = { user: { id: 1, first_name: 'Dev' }, startParam: null, authDate: Date.now() / 1000 };
  }
  if (!tg) return c.json({ error: 'unauthorized' }, 401);
  c.set('tg', tg);
  await next();
});

const ACTIONS: ActionType[] = ['feed', 'train', 'sleep', 'wake', 'freeze'];

function publicState(f: NonNullable<Awaited<ReturnType<typeof viewFighter>>>) {
  const s = f.state;
  return {
    name: f.name,
    look: f.look,
    state: s,
    power: fightPower(s),
    nextOpponent: LADDER[s.rank] ?? null,
    ladderSize: LADDER.length,
    serverNow: Date.now(),
  };
}

// Вызывается при каждом открытии: апсерт юзера, таймзона, источник, write access
api.post('/session', async (c) => {
  const { user, startParam } = c.get('tg');
  const body = await c.req.json<{ tzOffsetMin?: number; writeAccess?: boolean }>().catch(() => ({}) as never);
  const tz = Number.isFinite(body.tzOffsetMin) ? Math.max(-720, Math.min(840, Math.round(body.tzOffsetMin!))) : 180;
  const [row] = await sql<{ inserted: boolean }[]>`
    insert into users (id, first_name, username, language_code, tz_offset_min, source, write_access)
    values (${user.id}, ${user.first_name ?? null}, ${user.username ?? null}, ${user.language_code ?? null}, ${tz}, ${startParam}, ${!!body.writeAccess})
    on conflict (id) do update set
      tz_offset_min = excluded.tz_offset_min,
      last_seen_at = now(),
      write_access = users.write_access or excluded.write_access
    returning (xmax = 0) as inserted`;
  await track(user.id, row?.inserted ? 'first_open' : 'app_open', { source: startParam });
  const f = await viewFighter(user.id);
  if (f) await scheduleReminder(user.id);
  return c.json({ fighter: f ? publicState(f) : null, products: PRODUCTS });
});

api.post('/fighter', async (c) => {
  const { user } = c.get('tg');
  const { name, look } = await c.req.json<{ name: string; look: number }>();
  try {
    await createFighter(user.id, String(name ?? ''), Number(look) || 0);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
  const f = await viewFighter(user.id);
  return c.json({ fighter: f && publicState(f) });
});

api.post('/action', async (c) => {
  const { user } = c.get('tg');
  const { action } = await c.req.json<{ action: ActionType }>();
  if (!ACTIONS.includes(action)) return c.json({ error: 'bad action' }, 400);
  const r = await doAction(user.id, action, 'app');
  const f = await viewFighter(user.id);
  return c.json({ ok: r.ok, message: r.ok ? r.message : r.error, fighter: f && publicState(f) });
});

api.post('/fight', async (c) => {
  const { user } = c.get('tg');
  const r = await doFight(user.id);
  const f = await viewFighter(user.id);
  if (!r.ok) return c.json({ ok: false, message: r.error, fighter: f && publicState(f) });
  return c.json({ ok: true, result: r.result, fighter: f && publicState(f) });
});

api.post('/invoice', async (c) => {
  const { user } = c.get('tg');
  const { product } = await c.req.json<{ product: string }>();
  if (!isProduct(product)) return c.json({ error: 'bad product' }, 400);
  const link = await createInvoiceLink(bot, user.id, product);
  await track(user.id, 'invoice_opened', { product });
  return c.json({ link });
});

// Клиентские события воронки (экран магазина открыт, шер нажат и т.п.)
api.post('/event', async (c) => {
  const { user } = c.get('tg');
  const { name, props } = await c.req.json<{ name: string; props?: Record<string, unknown> }>();
  if (!/^[a-z_]{2,40}$/.test(name)) return c.json({ error: 'bad event' }, 400);
  await track(user.id, `c_${name}`, props ?? {});
  return c.json({ ok: true });
});
