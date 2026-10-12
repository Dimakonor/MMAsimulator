import { BALANCE as B, THEME_IDS } from './config.js';
import { advance, conditionPoints, round1, totalSkill, type FighterState, type Skills } from './game.js';
import { STYLE_INFO, TACTICS, fullName, opponentFor, type Style, type Tactic } from './opponents.js';

export type Method = 'KO' | 'TKO' | 'SUB' | 'DEC';
export type Side = 'p' | 'o';

export interface RoundStats {
  strikes: [number, number]; // [игрок, соперник]
  td: [number, number];
  ctrl: [number, number]; // секунды контроля
  kd: [number, number];
}

export interface Finish {
  by: Side;
  method: 'KO' | 'TKO' | 'SUB';
  time: string; // «2:41»
  text: string;
}

export interface RoundResult {
  n: number;
  pTactic: Tactic;
  oTactic: Tactic;
  edge: 1 | 0 | -1; // чья тактика «сыграла»
  winner: Side;
  diff: number; // разница рейтингов в раунде (в пользу игрока, может быть < 0)
  events: string[];
  stats: RoundStats;
  finish: Finish | null;
  pStamina: number;
  oStamina: number;
}

export interface FightOpp {
  name: string;
  nick: string;
  style: Style;
  power: number;
  art: number;
  quote: string;
  defense: boolean;
}

export interface ActiveFight {
  opp: FightOpp;
  seed: number;
  rounds: RoundResult[];
  pStamina: number;
  oStamina: number;
  weightMade: boolean;
  cond: number; // кондиции игрока, зафиксированные на старте
  skills: Skills; // снимок навыков на старте
  startedAt: number;
}

export interface FightOutcome {
  won: boolean;
  method: Method;
  decision: 'UD' | 'SD' | 'MD' | null;
  round: number;
  time: string;
  scorecards: [number, number][] | null; // по судьям: [игрок, соперник]
  opp: FightOpp;
  rounds: RoundResult[];
  weightMade: boolean;
  becameChampion: boolean;
  defended: boolean;
  record: FighterState['record'];
}

export interface HistoryEntry {
  at: number;
  opp: string;
  art: number;
  won: boolean;
  method: Method;
  round: number;
  time: string;
}

// ---------- ГПСЧ: один и тот же бой с теми же решениями = тот же исход ----------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const TACTIC_LIST: Tactic[] = ['pressure', 'counter', 'takedown'];
/** «Кондиции» соперника: у слабых меньше, у топов — как у ухоженного бойца. Рейтинг соперника = его power. */
const oppCond = (power: number) => Math.min(35, power * 0.45);
const logistic = (x: number) => 1 / (1 + Math.exp(-x));

/** Рейтинг в конкретной тактике: опыт (сумма навыков) × насколько навыки заточены под тактику. */
export function tacticRating(sk: Skills, tactic: Tactic): number {
  const T = totalSkill(sk);
  if (T <= 0) return 0;
  const primary = tactic === 'takedown' ? sk.grappling : sk.striking;
  return T * (0.7 + 0.9 * (primary / T));
}

function staminaDrop(sk: Skills, tactic: Tactic): number {
  const base = tactic === 'pressure' ? 32 : tactic === 'counter' ? 18 : 26;
  const T = totalSkill(sk) || 1;
  const k = Math.min(1.3, Math.max(0.35, 1.3 - 1.8 * (sk.cardio / T)));
  return base * k;
}

const stamFactor = (st: number) => 0.65 + 0.35 * (st / 100);

export function oppSkills(opp: Pick<FightOpp, 'power' | 'style'>): Skills {
  const T = Math.max(3, opp.power - oppCond(opp.power));
  const sh = STYLE_INFO[opp.style].share;
  return { striking: T * sh.s, grappling: T * sh.g, cardio: T * sh.c };
}

export function canFight(s: FighterState, now: number): { ok: boolean; reason?: string } {
  if (s.activeFight) return { ok: true }; // бой уже идёт — можно продолжать
  if (now < s.nextFightAt) return { ok: false, reason: 'Бой ещё не назначен.' };
  if (s.sleepingUntil !== null && now < s.sleepingUntil) return { ok: false, reason: 'Боец спит. Разбуди — и в клетку.' };
  return { ok: true };
}

export function nextOpponent(s: FighterState): FightOpp {
  const o = opponentFor(s.rank, s.defenses);
  return { name: fullName(o), nick: o.nick, style: o.style, power: o.power, art: o.art, quote: o.quote, defense: o.defense };
}

/** Данные для экрана Tale of the Tape. */
export function taleOfTheTape(s: FighterState) {
  const opp = nextOpponent(s);
  const os = oppSkills(opp);
  const weightMade = !s.weight || s.weight.forFight !== s.fightsCount || s.weight.made;
  return {
    opp,
    oppSkills: os,
    style: STYLE_INFO[opp.style],
    me: s.skills,
    myRatings: Object.fromEntries(TACTIC_LIST.map((t) => [t, Math.round(tacticRating(s.skills, t) + conditionPoints(s))])) as Record<Tactic, number>,
    oppRating: Math.round(totalSkill(os) + oppCond(opp.power)),
    weightMade,
  };
}

// ---------- Тексты ----------
// Имена бойцов — только в именительном падеже: склонять произвольные имена нельзя.
const T_GOOD: Record<Tactic, string[]> = {
  pressure: ['{A} идёт вперёд и загоняет соперника к сетке', '{A} режет октагон — {B} не успевает продохнуть', '{A} пробивает тяжёлый лоу-кик, {B} хромает', '{A} давит серией, {B} пятится'],
  counter: ['{A} ловит встречным на входе', '{A} пробивает чистый джеб-кросс', '{A} уходит с линии и бьёт апперкот', '{A} наказывает каждую атаку', '{B} проваливается, {A} встречает хуком'],
  takedown: ['{A} проходит в две ноги — {B} на спине', '{A} забирает спину у сетки', '{A} держит сверху и работает локтями', '{A} переводит, {B} не может встать'],
};
const FIN: Record<'KO' | 'TKO' | 'SUB', string[]> = {
  KO: ['НОКАУТ! {A} выключает соперника правым прямым!', 'НОКАУТ! {A} бьёт хай-кик — {B} падает как подкошенный!', 'НОКАУТ! Левый хук — {B} без сознания, {A} празднует!'],
  TKO: ['Рефери останавливает! {A} добивает в партере!', '{A} забивает у сетки, {B} не отвечает. ТЕХНИЧЕСКИЙ НОКАУТ!', 'Врач останавливает бой: {B} с рассечением, победа — {A}!'],
  SUB: ['{B} СТУЧИТ! {A} душит сзади!', '{A} ловит рычаг локтя — {B} сдаётся!', '{A} затягивает гильотину — {B} стучит!', '{A} закрывает треугольник — {B} стучит!'],
};

function fmtTime(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function pickTactic(style: Style, prev: RoundResult | null, rnd: () => number): Tactic {
  const prevPlayer = prev ? prev.pTactic : null;
  // выиграл раунд — чаще повторяет то же самое
  if (prev && prev.winner === 'o' && style !== 'allround' && rnd() < 0.5) return prev.oTactic;
  if (style === 'allround' && prevPlayer && rnd() < 0.55) {
    // универсал читает игрока: выбирает то, что бьёт его прошлую тактику
    return TACTIC_LIST.find((t) => TACTICS[t].beats === prevPlayer)!;
  }
  const w = STYLE_INFO[style].tactics;
  let r = rnd();
  for (const t of TACTIC_LIST) {
    r -= w[t];
    if (r <= 0) return t;
  }
  return 'pressure';
}

function resolveRound(af: ActiveFight, pName: string, pTactic: Tactic): RoundResult {
  const n = af.rounds.length + 1;
  const rnd = mulberry32(af.seed * 31 + n * 7919 + TACTIC_LIST.indexOf(pTactic) * 104729);
  const prev = af.rounds.length ? af.rounds[af.rounds.length - 1]! : null;
  const oTactic = pickTactic(af.opp.style, prev, rnd);
  const os = oppSkills(af.opp);

  const edge: 1 | 0 | -1 = TACTICS[pTactic].beats === oTactic ? 1 : TACTICS[oTactic].beats === pTactic ? -1 : 0;
  let rp = tacticRating(af.skills, pTactic) * stamFactor(af.pStamina) + af.cond;
  let ro = tacticRating(os, oTactic) * stamFactor(af.oStamina) + oppCond(af.opp.power);
  if (edge === 1) rp *= 1.3;
  if (edge === -1) ro *= 1.3;
  const diff = round1(rp - ro);

  const pWin = logistic(diff / 9);
  const winner: Side = rnd() < pWin ? 'p' : 'o';
  const wTactic = winner === 'p' ? pTactic : oTactic;
  const adv = winner === 'p' ? diff : -diff;

  // Финиш
  let finishChance = Math.min(0.55, 0.06 + Math.max(0, adv) * 0.012);
  const bjjTrap = winner === 'o' && af.opp.style === 'bjj' && pTactic === 'takedown';
  if (bjjTrap) finishChance += 0.2;
  const loserStam = winner === 'p' ? af.oStamina : af.pStamina;
  if (loserStam < 25) finishChance += 0.1;

  let finish: Finish | null = null;
  if (rnd() < finishChance) {
    let method: Finish['method'];
    const r = rnd();
    if (bjjTrap) method = 'SUB';
    else if (wTactic === 'takedown') method = r < 0.55 ? 'SUB' : 'TKO';
    else if (wTactic === 'counter') method = r < 0.75 ? 'KO' : 'TKO';
    else method = r < 0.6 ? 'KO' : 'TKO';
    const sec = 20 + Math.floor(rnd() * 280);
    const tpl = FIN[method][Math.floor(rnd() * FIN[method].length)]!;
    const A = winner === 'p' ? pName : af.opp.nick;
    const Bn = winner === 'p' ? af.opp.nick : pName;
    finish = { by: winner, method, time: fmtTime(sec), text: tpl.replaceAll('{A}', A).replaceAll('{B}', Bn) };
  }

  // События раунда
  const fill = (t: string, a: Side) =>
    t.replaceAll('{A}', a === 'p' ? pName : af.opp.nick).replaceAll('{B}', a === 'p' ? af.opp.nick : pName);
  const events: string[] = [];
  if (edge === 1) events.push(`План сработал: ${TACTICS[pTactic].why.toLowerCase()}`);
  if (edge === -1) events.push(`${af.opp.nick} читает план: ${TACTICS[oTactic].why.toLowerCase()}`);
  const lines = finish ? 2 : 3;
  const used = new Set<string>();
  for (let i = 0; i < lines; i++) {
    const side: Side = rnd() < (winner === 'p' ? 0.68 : 0.32) ? 'p' : 'o';
    const tac = side === 'p' ? pTactic : oTactic;
    const pool = T_GOOD[tac].filter((t) => !used.has(side + t));
    const tpl = pool[Math.floor(rnd() * pool.length)] ?? T_GOOD[tac][0]!;
    used.add(side + tpl);
    events.push(fill(tpl, side));
  }
  if (finish) events.push(finish.text);

  // Статистика
  const perf = (side: Side) => (side === winner ? 0.62 + rnd() * 0.2 : 0.3 + rnd() * 0.15);
  const strikeBase = (t: Tactic) => (t === 'pressure' ? 26 : t === 'counter' ? 18 : 10);
  const timeShare = finish ? (parseInt(finish.time) * 60 + parseInt(finish.time.split(':')[1]!)) / 300 : 1;
  const st = (side: Side, t: Tactic) => Math.round(strikeBase(t) * (0.5 + perf(side)) * timeShare);
  const td = (side: Side, t: Tactic) => (t === 'takedown' ? (side === winner ? 1 + Math.floor(rnd() * 2) : Math.floor(rnd() * 1.4)) : 0);
  const kdP = winner === 'p' && pTactic !== 'takedown' && adv > 6 && rnd() < 0.45 ? 1 : 0;
  const kdO = winner === 'o' && oTactic !== 'takedown' && adv > 6 && rnd() < 0.45 ? 1 : 0;
  const tdP = td('p', pTactic);
  const tdO = td('o', oTactic);
  const stats: RoundStats = {
    strikes: [st('p', pTactic), st('o', oTactic)],
    td: [tdP, tdO],
    ctrl: [tdP ? Math.round((40 + rnd() * 120) * timeShare) : 0, tdO ? Math.round((40 + rnd() * 120) * timeShare) : 0],
    kd: [kdP + (finish?.by === 'p' && finish.method === 'KO' ? 1 : 0), kdO + (finish?.by === 'o' && finish.method === 'KO' ? 1 : 0)],
  };

  const pStamina = Math.round(Math.max(0, af.pStamina - staminaDrop(af.skills, pTactic)));
  const oStamina = Math.round(Math.max(0, af.oStamina - staminaDrop(os, oTactic)));
  return { n, pTactic, oTactic, edge, winner, diff, events, stats, finish, pStamina, oStamina };
}

function scorecards(rounds: RoundResult[], rnd: () => number): [number, number][] {
  const cards: [number, number][] = [];
  for (let j = 0; j < 3; j++) {
    let p = 0;
    let o = 0;
    for (const r of rounds) {
      let w = r.winner;
      if (Math.abs(r.diff) < 4 && rnd() < 0.25) w = w === 'p' ? 'o' : 'p'; // спорный раунд
      const dominant = Math.abs(r.diff) > 14 && r.stats.kd[w === 'p' ? 0 : 1] > 0;
      if (w === 'p') {
        p += 10;
        o += dominant ? 8 : 9;
      } else {
        o += 10;
        p += dominant ? 8 : 9;
      }
    }
    cards.push([p, o]);
  }
  return cards;
}

export interface FightStep {
  state: FighterState;
  round: RoundResult;
  outcome: FightOutcome | null;
}

/** Старт боя: гейм-план = тактика первого раунда. */
export function startFight(prev: FighterState, pName: string, seedBase: number, tactic: Tactic, now: number): FightStep | { error: string } {
  const s = advance(prev, now);
  if (s.activeFight) return { error: 'Бой уже идёт.' };
  const chk = canFight(s, now);
  if (!chk.ok) return { error: chk.reason! };

  const opp = nextOpponent(s);
  const weightMade = !s.weight || s.weight.forFight !== s.fightsCount || s.weight.made;
  const cond = conditionPoints(s) + (weightMade ? B.weightCut.madeBonus : -B.weightCut.missPenalty);
  s.activeFight = {
    opp,
    seed: (seedBase * 1009 + s.fightsCount * 7 + 1) >>> 0,
    rounds: [],
    pStamina: weightMade ? 100 : 80,
    oStamina: 100,
    weightMade,
    cond: round1(cond),
    skills: { ...s.skills },
    startedAt: now,
  };
  return step(s, pName, tactic, now);
}

/** Следующий раунд: совет из угла = тактика раунда. */
export function continueFight(prev: FighterState, pName: string, tactic: Tactic, now: number): FightStep | { error: string } {
  const s = advance(prev, now);
  if (!s.activeFight) return { error: 'Боя нет.' };
  return step(s, pName, tactic, now);
}

function step(s: FighterState, pName: string, tactic: Tactic, now: number): FightStep {
  const af = s.activeFight!;
  const r = resolveRound(af, pName, tactic);
  af.rounds.push(r);
  af.pStamina = r.pStamina;
  af.oStamina = r.oStamina;
  if (!r.finish && af.rounds.length < B.rounds) return { state: s, round: r, outcome: null };
  return { state: s, round: r, outcome: finalize(s, now) };
}

function finalize(s: FighterState, now: number): FightOutcome {
  const af = s.activeFight!;
  const last = af.rounds[af.rounds.length - 1]!;
  let won: boolean;
  let method: Method;
  let decision: FightOutcome['decision'] = null;
  let cards: [number, number][] | null = null;
  let time = '5:00';

  if (last.finish) {
    won = last.finish.by === 'p';
    method = last.finish.method;
    time = last.finish.time;
  } else {
    method = 'DEC';
    cards = scorecards(af.rounds, mulberry32(af.seed ^ 0x9e3779b9));
    const pj = cards.filter(([p, o]) => p > o).length;
    const oj = cards.filter(([p, o]) => o > p).length;
    if (pj === oj) {
      // ничьих не держим: решает статистика ударов
      const sp = af.rounds.reduce((a, r) => a + r.stats.strikes[0], 0);
      const so = af.rounds.reduce((a, r) => a + r.stats.strikes[1], 0);
      won = sp >= so;
      decision = 'SD';
    } else {
      won = pj > oj;
      const maj = Math.max(pj, oj);
      decision = maj === 3 ? 'UD' : pj + oj === 2 ? 'MD' : 'SD';
    }
  }

  const wasChampion = s.rank >= 8;
  s.fightsCount += 1;
  if (won) {
    s.record.w += 1;
    if (method === 'DEC') s.record.dec += 1;
    else if (method === 'SUB') s.record.sub += 1;
    else s.record.ko += 1;
    if (wasChampion) s.defenses += 1;
    else s.rank += 1;
  } else {
    s.record.l += 1;
    if (wasChampion) {
      // потерял пояс — назад к претенденту №7
      s.rank = 7;
    }
  }
  const becameChampion = !wasChampion && s.rank >= 8;
  if (becameChampion) {
    for (const t of THEME_IDS) if (!s.unlockedThemes.includes(t)) s.unlockedThemes.push(t);
    if (!s.cosmetics.includes('belt')) s.cosmetics.push('belt');
  }

  s.history.unshift({ at: now, opp: af.opp.name, art: af.opp.art, won, method, round: last.n, time });
  s.history = s.history.slice(0, 20);
  s.energy = Math.max(0, round1(s.energy - 30));
  s.satiety = Math.max(0, round1(s.satiety - 20));
  s.nextFightAt = now + B.fightInterval;
  s.weight = null;
  s.activeFight = null;

  return {
    won,
    method,
    decision,
    round: last.n,
    time,
    scorecards: cards,
    opp: af.opp,
    rounds: af.rounds,
    weightMade: af.weightMade,
    becameChampion,
    defended: wasChampion && won,
    record: { ...s.record },
  };
}

/** Подсказка угла между раундами: что видно по ходу боя. */
export function cornerAdvice(af: ActiveFight): string {
  const last = af.rounds[af.rounds.length - 1];
  const style = STYLE_INFO[af.opp.style];
  if (!last) return style.hint;
  const lines: string[] = [];
  if (last.winner === 'o' && last.edge === 1) lines.push('Раунд его, но план работает — он просто сильнее. Не сворачивай.');
  else if (last.winner === 'o') lines.push('Этот раунд его. Меняем план.');
  else if (last.edge === -1) lines.push('Раунд наш, но он тебя читает — повезло.');
  else lines.push('Раунд наш. Не расслабляйся.');
  lines.push(`Он шёл на «${TACTICS[last.oTactic].short.toLowerCase()}». ${style.hint}`);
  if (af.pStamina < 40) lines.push('Ты подсдох — давить сейчас дорого.');
  if (af.oStamina < 35) lines.push('Он сдох! Дави — он не выдержит темп.');
  return lines.join(' ');
}
