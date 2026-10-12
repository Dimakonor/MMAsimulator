import {
  applyAction,
  advance,
  canFight,
  newFighter,
  runFight,
  type ActionType,
  type FighterState,
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
  await tx`update fighters set state = ${tx.json(state as never)}, updated_at = now() where id = ${f.id}`;
}

export async function createFighter(userId: number, name: string, look: number) {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 24);
  if (clean.length < 2) throw new Error('Имя слишком короткое');
  const state = newFighter(Date.now());
  await sql`insert into fighters (user_id, name, look, state) values (${userId}, ${clean}, ${look % 3}, ${sql.json(state as never)})
            on conflict (user_id) do nothing`;
  await track(userId, 'fighter_created', { look });
  await scheduleReminder(userId);
}

/** Текущее состояние (досчитанное до now) без записи в БД. */
export async function viewFighter(userId: number) {
  const f = await getFighter(userId);
  if (!f) return null;
  return { ...f, state: advance(f.state, Date.now()) };
}

export async function doAction(userId: number, action: ActionType, via: 'app' | 'bot') {
  const res = await sql.begin(async (tx) => {
    const f = await getFighter(userId, tx as unknown as Tx, true);
    if (!f) return { ok: false as const, error: 'Нет бойца' };
    const r = applyAction(f.state, action, Date.now());
    if (r.ok) await save(tx as unknown as Tx, f, r.state);
    return r.ok ? { ok: true as const, message: r.message, state: r.state } : { ok: false as const, error: r.error };
  });
  if (res.ok) {
    await track(userId, 'action', { action, via });
    await scheduleReminder(userId);
  }
  return res;
}

export async function doFight(userId: number) {
  const res = await sql.begin(async (tx) => {
    const t = tx as unknown as Tx;
    const f = await getFighter(userId, t, true);
    if (!f) return { ok: false as const, error: 'Нет бойца' };
    const now = Date.now();
    const check = canFight(advance(f.state, now), now);
    if (!check.ok) return { ok: false as const, error: check.reason! };
    const { state, result } = runFight(f.state, f.name, f.id, now);
    await save(t, f, state);
    await t`insert into fights (fighter_id, won, result) values (${f.id}, ${result.won}, ${t.json(result as never)})`;
    return { ok: true as const, state, result };
  });
  if (res.ok) {
    await track(userId, 'fight', { won: res.result.won, rank: res.state.rank });
    await scheduleReminder(userId);
  }
  return res;
}
