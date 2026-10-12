import { Hono } from 'hono';
import {
  ACTIONS,
  PRODUCTS,
  THEME_IDS,
  cornerAdvice,
  pvpLeft,
  rating,
  taleOfTheTape,
  type ActionType,
  type Tactic,
  type ThemeId,
} from '@mma/shared';
import { validateInitData, type InitData } from './auth.js';
import { env } from './env.js';
import { sql, track } from './db.js';
import { createFighter, doAction, doFightStep, setTheme, viewFighter } from './fighters.js';
import { bot } from './bot.js';
import { createInvoiceLink, isProduct } from './payments.js';
import { scheduleReminder } from './reminders.js';
import { addChallenge, arenaView, pvpStep, savePlan } from './arena.js';

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

const TACTICS: Tactic[] = ['pressure', 'counter', 'takedown'];

/** То же самое отдаёт демо-режим фронта (web/src/demo.ts) — держать формы в синхроне. */
function publicState(f: NonNullable<Awaited<ReturnType<typeof viewFighter>>>) {
  const s = f.state;
  return {
    name: f.name,
    look: f.look,
    state: s,
    rating: rating(s),
    tape: taleOfTheTape(s),
    corner: s.activeFight ? cornerAdvice(s.activeFight) : null,
    pvpLeft: pvpLeft(s, Date.now()),
    myId: f.id,
    serverNow: Date.now(),
  };
}

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
  // Вызов друга (ch_<id>) или реванш (rv_<id>) — сразу кладём соперника на арену
  const m = /^(ch|rv)_(\d+)$/.exec(startParam ?? '');
  let challenge = null;
  if (f && m) {
    const r = await addChallenge(user.id, Number(m[2]));
    if ('card' in r) challenge = r.card;
  }
  const fresh = challenge ? await viewFighter(user.id) : f;
  return c.json({ fighter: fresh ? publicState(fresh) : null, products: PRODUCTS, challenge });
});

api.post('/fighter', async (c) => {
  const { user } = c.get('tg');
  const { name, look, theme } = await c.req.json<{ name: string; look: number; theme: ThemeId }>();
  try {
    await createFighter(user.id, String(name ?? ''), Number(look) || 0, theme);
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

// Бой по шагам: start — гейм-план (тактика 1-го раунда), next — совет угла (тактика следующего раунда)
api.post('/fight/:kind{start|next}', async (c) => {
  const { user } = c.get('tg');
  const kind = c.req.param('kind') as 'start' | 'next';
  const { tactic } = await c.req.json<{ tactic: Tactic }>();
  if (!TACTICS.includes(tactic)) return c.json({ error: 'bad tactic' }, 400);
  const r = await doFightStep(user.id, tactic, kind);
  const f = await viewFighter(user.id);
  if ('error' in r) return c.json({ ok: false, message: r.error, fighter: f && publicState(f) });
  return c.json({ ok: true, round: r.round, outcome: r.outcome, fighter: f && publicState(f) });
});

api.post('/theme', async (c) => {
  const { user } = c.get('tg');
  const { theme } = await c.req.json<{ theme: ThemeId }>();
  if (!THEME_IDS.includes(theme)) return c.json({ error: 'bad theme' }, 400);
  const r = await setTheme(user.id, theme);
  const f = await viewFighter(user.id);
  return c.json({ ok: r.ok, message: r.error, fighter: f && publicState(f) });
});

api.post('/invoice', async (c) => {
  const { user } = c.get('tg');
  const { product } = await c.req.json<{ product: string }>();
  if (!isProduct(product)) return c.json({ error: 'bad product' }, 400);
  const link = await createInvoiceLink(bot, user.id, product);
  await track(user.id, 'invoice_opened', { product });
  return c.json({ link });
});

api.post('/event', async (c) => {
  const { user } = c.get('tg');
  const { name, props } = await c.req.json<{ name: string; props?: Record<string, unknown> }>();
  if (!/^[a-z_]{2,40}$/.test(name)) return c.json({ error: 'bad event' }, 400);
  await track(user.id, `c_${name}`, props ?? {});
  return c.json({ ok: true });
});

// ---------- Арена ----------
api.post('/arena', async (c) => {
  const { user } = c.get('tg');
  const { refresh } = await c.req.json<{ refresh?: boolean }>().catch(() => ({}) as { refresh?: boolean });
  const a = await arenaView(user.id, !!refresh);
  if (!a) return c.json({ error: 'Нет бойца' }, 400);
  const f = await viewFighter(user.id);
  return c.json({ ...a, fighter: f && publicState(f) });
});

api.post('/arena/plan', async (c) => {
  const { user } = c.get('tg');
  const { plan } = await c.req.json<{ plan: Tactic[] }>();
  const r = await savePlan(user.id, plan);
  const f = await viewFighter(user.id);
  return c.json({ ok: 'ok' in r, message: 'error' in r ? r.error : 'План защиты сохранён', fighter: f && publicState(f) });
});

api.post('/arena/challenge', async (c) => {
  const { user } = c.get('tg');
  const { fighterId } = await c.req.json<{ fighterId: number }>();
  const r = await addChallenge(user.id, Number(fighterId));
  return c.json(r);
});

api.post('/pvp/:kind{start|next}', async (c) => {
  const { user } = c.get('tg');
  const kind = c.req.param('kind') as 'start' | 'next';
  const { tactic, oppId } = await c.req.json<{ tactic: Tactic; oppId?: number }>();
  if (!TACTICS.includes(tactic)) return c.json({ error: 'bad tactic' }, 400);
  const r = await pvpStep(user.id, kind, tactic, oppId);
  const f = await viewFighter(user.id);
  if ('error' in r) return c.json({ ok: false, message: r.error, fighter: f && publicState(f) });
  return c.json({ ok: true, round: r.round, outcome: r.outcome, fighter: f && publicState(f) });
});
