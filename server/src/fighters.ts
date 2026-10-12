import {
  THEME_IDS,
  advance,
  applyAction,
  continueFight,
  newFighter,
  startFight,
  type ActionType,
  type FighterState,
  type FightStep,
  type Tactic,
  type ThemeId,
} from '@mma/shared';
import { sql, track } from './db.js';
import { scheduleReminder } from './reminders.js';

export interface FighterRow {
  id: number;
  user_id: number;
  name: string;
  look: number;
  state: FighterState;
}

type Tx = typeof sql;

export async function getFighter(userId: number, tx: Tx = sql, lock = false): Promise<FighterRow | null> {
  const rows = lock
    ? await tx<FighterRow[]>`select id, user_id, name, look, state from fighters where user_id = ${userId} for update`
    : await tx<FighterRow[]>`select id, user_id, name, look, state from fighters where user_id = ${userId}`;
  const row = rows[0];
  return row ? { ...row, id: Number(row.id), user_id: Number(row.user_id) } : null;
}

async function save(tx: Tx, f: FighterRow, state: FighterState) {
  await tx`update fighters set state = ${tx.json(state as never)}, elo = ${state.elo ?? 1000}, updated_at = now() where id = ${f.id}`;
}

export async function createFighter(userId: number, name: string, look: number, theme: ThemeId) {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 24);
  if (clean.length < 2) throw new Error('Имя слишком короткое');
  if (!THEME_IDS.includes(theme)) throw new Error('Нет такой темы');
  const state = newFighter(Date.now(), theme);
  await sql`insert into fighters (user_id, name, look, state) values (${userId}, ${clean}, ${look % 3}, ${sql.json(state as never)})
            on conflict (user_id) do nothing`;
  await track(userId, 'fighter_created', { look, theme });
  await scheduleReminder(userId);
}

export async function viewFighter(userId: number) {
  const f = await getFighter(userId);
  if (!f) return null;
  return { ...f, state: advance(f.state, Date.now()) };
}

/** Общая обёртка: блокировка строки, пересчёт, сохранение. */
async function mutate<T>(userId: number, fn: (f: FighterRow, now: number) => { state?: FighterState; result: T }) {
  return sql.begin(async (tx) => {
    const t = tx as unknown as Tx;
    const f = await getFighter(userId, t, true);
    if (!f) return { result: null as T | null, fighter: null };
    const { state, result } = fn(f, Date.now());
    if (state) await save(t, f, state);
    return { result, fighter: f };
  });
}

export async function doAction(userId: number, action: ActionType, via: 'app' | 'bot') {
  const { result } = await mutate(userId, (f, now) => {
    const r = applyAction(f.state, action, now);
    return r.ok ? { state: r.state, result: { ok: true as const, message: r.message } } : { result: { ok: false as const, error: r.error } };
  });
  if (!result) return { ok: false as const, error: 'Нет бойца' };
  if (result.ok) {
    await track(userId, 'action', { action, via });
    await scheduleReminder(userId);
  }
  return result;
}

export async function doFightStep(userId: number, tactic: Tactic, kind: 'start' | 'next') {
  const { result, fighter } = await mutate(userId, (f, now) => {
    if (kind === 'next' && f.state.activeFight?.mode === 'pvp') return { result: { error: 'Идёт бой на арене.' } as { error: string } | FightStep };
    const r = kind === 'start' ? startFight(f.state, f.name, f.id, tactic, now) : continueFight(f.state, f.name, tactic, now);
    if ('error' in r) return { result: { error: r.error } as { error: string } | FightStep };
    return { state: r.state, result: r as { error: string } | FightStep };
  });
  if (!result || !fighter) return { error: 'Нет бойца' };
  if ('error' in result) return result;
  if (result.outcome) {
    const o = result.outcome;
    await sql`insert into fights (fighter_id, won, result) values (${fighter.id}, ${o.won}, ${sql.json(o as never)})`;
    await track(userId, 'fight', { won: o.won, method: o.method, rank: result.state.rank, weightMade: o.weightMade, champion: o.becameChampion });
    await scheduleReminder(userId);
  } else if (kind === 'start') {
    await track(userId, 'fight_started', { tactic });
  }
  return result;
}

export async function setTheme(userId: number, theme: ThemeId) {
  const { result } = await mutate(userId, (f) => {
    if (!f.state.unlockedThemes.includes(theme)) return { result: { ok: false, error: 'Тема закрыта' } };
    return { state: { ...f.state, theme }, result: { ok: true, error: '' } };
  });
  return result ?? { ok: false, error: 'Нет бойца' };
}
