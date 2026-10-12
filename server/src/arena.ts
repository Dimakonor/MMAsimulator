import { InlineKeyboard, GrammyError } from 'grammy';
import {
  HOUR,
  advance,
  applyDefense,
  continueFight,
  offersStale,
  pvpCard,
  refreshOffers,
  setPlan,
  startPvp,
  type FighterState,
  type FightStep,
  type PvpCard,
  type Tactic,
} from '@mma/shared';
import { sql, track } from './db.js';
import { env } from './env.js';
import { bot } from './bot.js';
import { getFighter, type FighterRow } from './fighters.js';

type Tx = typeof sql;

async function saveState(tx: Tx, id: number, state: FighterState) {
  await tx`update fighters set state = ${tx.json(state as never)}, elo = ${state.elo}, updated_at = now() where id = ${id}`;
}

/** Живые соперники около моего рейтинга; не те, кого я бил последние 12 часов. */
async function findReal(me: FighterRow, limit: number): Promise<PvpCard[]> {
  const rows = await sql<FighterRow[]>`
    select f.id, f.user_id, f.name, f.look, f.state from fighters f
     where f.id <> ${me.id}
       and abs(f.elo - ${me.state.elo}) < 250
       and not exists (select 1 from pvp_fights p where p.attacker_id = ${me.id} and p.defender_id = f.id and p.created_at > now() - interval '12 hours')
     order by abs(f.elo - ${me.state.elo}) + random() * 80
     limit ${limit}`;
  const now = Date.now();
  return rows.map((r) => pvpCard(r.state, Number(r.id), r.name, r.look, now));
}

export async function arenaView(userId: number, forceRefresh = false) {
  const res = await sql.begin(async (tx) => {
    const t = tx as unknown as Tx;
    const me = await getFighter(userId, t, true);
    if (!me) return null;
    const now = Date.now();
    let s = advance(me.state, now);
    const canManual = now - s.arenaOffersAt > HOUR;
    if (offersStale(s, now) || (forceRefresh && canManual)) {
      s = refreshOffers(s, await findReal(me, 3), now, me.id);
    }
    const seen = s.pvpUnseen;
    s.pvpUnseen = 0;
    await saveState(t, me.id, s);
    return { me, s, seen };
  });
  if (!res) return null;
  const top = await sql<{ id: string; name: string; look: number; elo: number; state: FighterState }[]>`
    select id, name, look, elo, state from fighters order by elo desc, id limit 50`;
  const [{ place }] = await sql<{ place: number }[]>`select count(*)::int + 1 as place from fighters where elo > ${res.s.elo}`;
  return {
    offers: res.s.arenaOffers,
    newDefenses: res.seen,
    place,
    myId: res.me.id,
    leaderboard: top.map((r) => ({ id: Number(r.id), name: r.name, look: r.look, elo: r.elo, w: r.state.pvp?.w ?? 0, l: r.state.pvp?.l ?? 0 })),
  };
}

export async function savePlan(userId: number, plan: Tactic[]) {
  return sql.begin(async (tx) => {
    const t = tx as unknown as Tx;
    const me = await getFighter(userId, t, true);
    if (!me) return { error: 'Нет бойца' };
    const r = setPlan(advance(me.state, Date.now()), plan);
    if ('error' in r) return r;
    await saveState(t, me.id, r);
    return { ok: true };
  });
}

/** Вызов по ссылке друга / реванш: добавить конкретного бойца в соперники. */
export async function addChallenge(userId: number, fighterId: number) {
  const target = (await sql<FighterRow[]>`select id, user_id, name, look, state from fighters where id = ${fighterId}`)[0];
  if (!target) return { error: 'Боец не найден' };
  return sql.begin(async (tx) => {
    const t = tx as unknown as Tx;
    const me = await getFighter(userId, t, true);
    if (!me) return { error: 'Сначала создай бойца' };
    if (me.id === Number(target.id)) return { error: 'Это твой боец 🙂' };
    const s = advance(me.state, Date.now());
    const card = pvpCard(target.state, Number(target.id), target.name, target.look, Date.now());
    s.arenaOffers = [card, ...s.arenaOffers.filter((c) => c.id !== card.id)].slice(0, 4);
    await saveState(t, me.id, s);
    return { ok: true, card };
  });
}

export async function pvpStep(userId: number, kind: 'start' | 'next', tactic: Tactic, oppId?: number) {
  const r = await sql.begin(async (tx) => {
    const t = tx as unknown as Tx;
    const me = await getFighter(userId, t, true);
    if (!me) return { error: 'Нет бойца' } as const;
    const now = Date.now();
    let step: FightStep | { error: string };
    if (kind === 'start') {
      const card = me.state.arenaOffers.find((c) => c.id === oppId);
      if (!card) return { error: 'Соперник ушёл. Обнови список.' } as const;
      // живого соперника берём свежим: вдруг он подкачался
      let fresh = card;
      if (!card.ghost) {
        const d = (await t<FighterRow[]>`select id, user_id, name, look, state from fighters where id = ${card.id}`)[0];
        if (d) fresh = pvpCard(d.state, Number(d.id), d.name, d.look, now);
      }
      step = startPvp(me.state, me.name, me.id, fresh, tactic, now);
    } else {
      if (me.state.activeFight?.mode !== 'pvp') return { error: 'Боя на арене нет.' } as const;
      step = continueFight(me.state, me.name, tactic, now);
    }
    if ('error' in step) return step;
    await saveState(t, me.id, step.state);

    let defender: { userId: number; name: string } | null = null;
    const o = step.outcome;
    if (o?.pvp) {
      const defId = o.pvp.ghost ? null : o.pvp.oppId;
      if (defId) {
        const d = (await t<FighterRow[]>`select id, user_id, name, look, state from fighters where id = ${defId} for update`)[0];
        if (d) {
          await saveState(t, Number(d.id), applyDefense(d.state, me.name, me.id, me.look, o, now));
          defender = { userId: Number(d.user_id), name: d.name };
        }
      }
      await t`insert into pvp_fights (attacker_id, defender_id, attacker_won, elo_delta, result)
              values (${me.id}, ${defId}, ${o.won}, ${o.pvp.eloDelta}, ${t.json(o as never)})`;
    }
    return { step, me, defender };
  });
  if ('error' in r) return r;
  const o = r.step.outcome;
  if (o?.pvp) {
    await track(userId, 'pvp_fight', { won: o.won, method: o.method, ghost: o.pvp.ghost, delta: o.pvp.eloDelta });
    if (r.defender) void notifyDefender(r.defender.userId, r.me.name, r.me.id, o.won, o.method, o.round, -o.pvp.eloDelta);
  } else if (kind === 'start') await track(userId, 'pvp_started', { tactic, oppId });
  return r.step;
}

/** «Тебя вызвали» — главный крючок арены. Не чаще раза в 2 часа, остальное покажем в игре. */
async function notifyDefender(userId: number, attacker: string, attackerId: number, attackerWon: boolean, method: string, round: number, delta: number) {
  const [u] = await sql<{ write_access: boolean; bot_blocked: boolean; last: Date | null }[]>`
    select write_access, bot_blocked, last_pvp_notified_at as last from users where id = ${userId}`;
  if (!u || !u.write_access || u.bot_blocked) return;
  if (u.last && Date.now() - u.last.getTime() < 2 * HOUR) return;
  const how = method === 'DEC' ? 'решением судей' : `${method} в ${round}-м раунде`;
  const text = attackerWon
    ? `🩸 Тренер, на нас вышел ${attacker} и победил ${how}. Рейтинг ${delta}.\nЯ хочу реванш.`
    : `🛡️ ${attacker} вызвал нас — и лёг ${how}. Рейтинг +${delta}. План защиты работает 💪`;
  const kb = new InlineKeyboard();
  if (env.APP_LINK) kb.url(attackerWon ? '⚔️ Реванш' : '🥊 На арену', `${env.APP_LINK}?startapp=rv_${attackerId}`);
  else if (env.WEBAPP_URL) kb.webApp(attackerWon ? '⚔️ Реванш' : '🥊 На арену', `${env.WEBAPP_URL}?rv=${attackerId}`);
  try {
    await bot.api.sendMessage(userId, text, { reply_markup: kb });
    await sql`update users set last_pvp_notified_at = now() where id = ${userId}`;
    await track(userId, 'pvp_notified', { attackerWon });
  } catch (e) {
    if (e instanceof GrammyError && e.error_code === 403) await sql`update users set bot_blocked = true where id = ${userId}`;
  }
}
