// Арена: асинхронный PvP. Ты ведёшь бой сам (гейм-план + угол), соперник — живой игрок,
// который дерётся по своему «плану защиты», со своими навыками и формой на момент вызова.
import { DAY, HOUR } from './config.js';
import { advance, conditionPoints, round1, totalSkill, type FighterState, type Skills } from './game.js';
import { registerPvpFinalizer, stepFight, type ActiveFight, type FightOpp, type FightOutcome, type FightStep, type Judged } from './fight.js';
import type { Style, Tactic } from './opponents.js';

export const PVP = {
  perDay: 3,
  energyCost: 15,
  satietyCost: 10,
  minEnergy: 20,
  eloStart: 1000,
  k: 32,
  offersTtl: 6 * HOUR,
  offersCount: 3,
} as const;

export interface PvpCard {
  id: number; // id бойца; < 0 — спарринг-бот
  name: string;
  look: number;
  portrait: string; // f0..f2 у игроков, o0..o7 у ботов
  skills: Skills;
  cond: number;
  plan: Tactic[];
  elo: number;
  record: { w: number; l: number };
  ghost: boolean;
}

export interface PvpHistoryEntry {
  at: number;
  opp: string;
  oppId: number;
  portrait: string;
  won: boolean;
  method: string;
  round: number;
  eloDelta: number;
  attacked: boolean; // true — вызывал я; false — вызвали меня
}

const TL: Tactic[] = ['pressure', 'counter', 'takedown'];
export const dayKey = (now: number) => Math.floor(now / DAY);

/** Снимок бойца для чужого вызова. Ухоженный боец и защищается лучше. */
export function pvpCard(state: FighterState, id: number, name: string, look: number, now: number): PvpCard {
  const s = advance(state, now);
  return {
    id,
    name,
    look,
    portrait: `f${look % 3}`,
    skills: { ...s.skills },
    cond: round1(conditionPoints(s)),
    plan: [...s.pvpPlan],
    elo: s.elo,
    record: { ...s.pvp },
    ghost: false,
  };
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const G_FIRST = ['Макс', 'Артём', 'Ислам', 'Денис', 'Егор', 'Руслан', 'Никита', 'Тагир', 'Илья', 'Жека', 'Саня', 'Бахтияр', 'Гоша', 'Лёха', 'Марат'];
const G_NICK = ['Кувалда', 'Тихоход', 'Сквозняк', 'Ледокол', 'Шатун', 'Паяльник', 'Борода', 'Каток', 'Пружина', 'Сфинкс', 'Гвоздь', 'Мясорубка', 'Батон', 'Буран', 'Прораб'];

/** Спарринг-бот уровня игрока: нужен, пока живых соперников мало. Честно помечен как ИИ. */
export function makeGhost(me: FighterState, seed: number): PvpCard {
  const r = rng(seed);
  const T = Math.max(6, totalSkill(me.skills) * (0.8 + r() * 0.4));
  const a = 0.15 + r() * 0.5;
  const b = 0.15 + r() * (0.85 - a - 0.1);
  const skills = { striking: round1(T * a), grappling: round1(T * b), cardio: round1(T * (1 - a - b)) };
  const plan = [0, 1, 2].map(() => TL[Math.floor(r() * 3)]!);
  return {
    id: -(seed % 1_000_000) - 1,
    name: `${G_FIRST[Math.floor(r() * G_FIRST.length)]} «${G_NICK[Math.floor(r() * G_NICK.length)]}»`,
    look: 0,
    portrait: `o${Math.floor(r() * 8)}`,
    skills,
    cond: round1(20 + r() * 18),
    plan,
    elo: Math.round(me.elo + (r() - 0.5) * 120),
    record: { w: Math.floor(r() * 12), l: Math.floor(r() * 8) },
    ghost: true,
  };
}

/** Стиль соперника по его навыкам — нужен углу для подсказок. */
export function styleOf(sk: Skills): Style {
  const T = totalSkill(sk) || 1;
  if (sk.striking / T > 0.45) return 'striker';
  if (sk.grappling / T > 0.45) return 'wrestler';
  if (sk.cardio / T > 0.45) return 'grinder';
  return 'allround';
}

export function eloDelta(my: number, opp: number, won: boolean) {
  const exp = 1 / (1 + 10 ** ((opp - my) / 400));
  return Math.round(PVP.k * ((won ? 1 : 0) - exp));
}

/** Сколько боёв на арене осталось сегодня. */
export function pvpLeft(s: FighterState, now: number) {
  return s.pvpDay === dayKey(now) ? Math.max(0, PVP.perDay - s.pvpToday) : PVP.perDay;
}

export function canPvp(s: FighterState, now: number): { ok: boolean; reason?: string } {
  if (s.activeFight) return { ok: false, reason: 'Сначала закончи текущий бой.' };
  if (s.sleepingUntil !== null && now < s.sleepingUntil) return { ok: false, reason: 'Боец спит.' };
  if (s.energy < PVP.minEnergy) return { ok: false, reason: 'Мало энергии. Уложи спать.' };
  if (pvpLeft(s, now) <= 0) return { ok: false, reason: 'На сегодня боёв хватит. Завтра снова.' };
  return { ok: true };
}

export function setPlan(s: FighterState, plan: Tactic[]): FighterState | { error: string } {
  if (plan.length !== 3 || plan.some((t) => !TL.includes(t))) return { error: 'Нужен план на 3 раунда.' };
  return { ...s, pvpPlan: [...plan] };
}

export function oppFromCard(c: PvpCard): FightOpp {
  return {
    name: c.name,
    nick: c.name,
    style: styleOf(c.skills),
    power: Math.round(totalSkill(c.skills) + c.cond),
    art: 0,
    quote: c.ghost ? 'Спарринг-партнёр (ИИ). Бьёт по-настоящему.' : `Рейтинг ${c.elo}. Дерётся по своему плану защиты.`,
    defense: false,
    portrait: c.portrait,
    pvp: { id: c.id, skills: c.skills, cond: c.cond, plan: c.plan, elo: c.elo, ghost: c.ghost },
  };
}

/** Начать бой на арене. Гейм-план = тактика первого раунда. */
export function startPvp(prev: FighterState, pName: string, myId: number, card: PvpCard, tactic: Tactic, now: number): FightStep | { error: string } {
  const s = advance(prev, now);
  const chk = canPvp(s, now);
  if (!chk.ok) return { error: chk.reason! };
  if (card.id === myId) return { error: 'С собой не дерутся.' };
  if (s.pvpDay !== dayKey(now)) {
    s.pvpDay = dayKey(now);
    s.pvpToday = 0;
  }
  s.pvpToday += 1;
  const af: ActiveFight = {
    opp: oppFromCard(card),
    seed: (Math.abs(myId) * 2654435761 + Math.abs(card.id) * 40503 + now / 1000) >>> 0,
    rounds: [],
    pStamina: 100,
    oStamina: 100,
    weightMade: true,
    cond: round1(conditionPoints(s)),
    skills: { ...s.skills },
    startedAt: now,
    mode: 'pvp',
  };
  s.activeFight = af;
  return stepFight(s, pName, tactic, now);
}

registerPvpFinalizer((s: FighterState, af: ActiveFight, r: Judged, now: number): FightOutcome => {
  const pv = af.opp.pvp!;
  const delta = eloDelta(s.elo, pv.elo, r.won);
  s.elo = Math.max(100, s.elo + delta);
  if (r.won) s.pvp.w += 1;
  else s.pvp.l += 1;
  s.pvpHistory.unshift({
    at: now,
    opp: af.opp.name,
    oppId: pv.id,
    portrait: af.opp.portrait ?? 'o0',
    won: r.won,
    method: r.method,
    round: r.last.n,
    eloDelta: delta,
    attacked: true,
  });
  s.pvpHistory = s.pvpHistory.slice(0, 30);
  s.arenaOffers = s.arenaOffers.filter((c) => c.id !== pv.id);
  s.energy = Math.max(0, round1(s.energy - PVP.energyCost));
  s.satiety = Math.max(0, round1(s.satiety - PVP.satietyCost));
  s.activeFight = null;
  return {
    won: r.won,
    method: r.method,
    decision: r.decision,
    round: r.last.n,
    time: r.time,
    scorecards: r.cards,
    opp: af.opp,
    rounds: af.rounds,
    weightMade: true,
    becameChampion: false,
    defended: false,
    record: { ...s.record },
    pvp: { eloDelta: delta, elo: s.elo, oppId: pv.id, ghost: pv.ghost, record: { ...s.pvp } },
  };
});

/** Защитнику: записать бой, в котором вызвали его. */
export function applyDefense(def: FighterState, attackerName: string, attackerId: number, attackerLook: number, o: FightOutcome, now: number): FighterState {
  const s: FighterState = advance(def, now);
  const delta = -(o.pvp?.eloDelta ?? 0);
  s.elo = Math.max(100, s.elo + delta);
  if (o.won) s.pvp.l += 1;
  else s.pvp.w += 1;
  s.pvpHistory.unshift({
    at: now,
    opp: attackerName,
    oppId: attackerId,
    portrait: `f${attackerLook % 3}`,
    won: !o.won,
    method: o.method,
    round: o.round,
    eloDelta: delta,
    attacked: false,
  });
  s.pvpHistory = s.pvpHistory.slice(0, 30);
  s.pvpUnseen += 1;
  return s;
}

/** Обновить соперников: живые (сервер подставит) + боты до нужного числа. */
export function refreshOffers(s: FighterState, real: PvpCard[], now: number, seed: number): FighterState {
  const offers = real.slice(0, PVP.offersCount);
  let i = 0;
  while (offers.length < PVP.offersCount) offers.push(makeGhost(s, (seed * 7919 + dayKey(now) * 31 + i++ * 104729) >>> 0));
  return { ...s, arenaOffers: offers, arenaOffersAt: now };
}

export function offersStale(s: FighterState, now: number) {
  return s.arenaOffers.length === 0 || now - s.arenaOffersAt > PVP.offersTtl;
}
