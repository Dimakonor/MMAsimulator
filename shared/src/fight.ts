import { BALANCE as B, LADDER } from './config.js';
import { advance, fightPower, isChampion, type FighterState } from './game.js';

export interface FightResult {
  won: boolean;
  opponent: string;
  playerPower: number;
  opponentPower: number;
  winChance: number;
  rounds: string[][]; // текст по раундам
  finish: string;
}

// Детерминированный ГПСЧ: один и тот же бой = один и тот же результат.
// Перезапросом не «перекрутить» исход.
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

const HITS_GOOD = [
  '{me} проводит двойку в челюсть',
  '{me} проходит в ноги и роняет соперника',
  '{me} бьёт лоу-кик, {op} хромает',
  '{me} ловит на встречном',
  '{me} забирает спину в партере',
];
const HITS_BAD = [
  '{op} пробивает тяжёлый правый',
  '{op} прижимает к сетке и душит коленями',
  '{op} перехватывает ногу и бросает',
  '{me} пропускает апперкот',
  '{op} отрабатывает граунд-энд-паунд',
];
const FINISH_WIN = ['Нокаут во {r}-м раунде!', 'Удушающий сзади во {r}-м раунде!', 'Победа решением судей.'];
const FINISH_LOSS = ['Технический нокаут во {r}-м раунде.', 'Сдался на рычаге во {r}-м раунде.', 'Поражение решением судей.'];

export function canFight(s: FighterState, now: number): { ok: boolean; reason?: string } {
  if (isChampion(s)) return { ok: false, reason: 'Ты уже чемпион. Защиты титула — в следующей версии.' };
  if (now < s.nextFightAt) return { ok: false, reason: 'Бой ещё не назначен.' };
  if (s.sleepingUntil !== null && now < s.sleepingUntil) return { ok: false, reason: 'Боец спит.' };
  return { ok: true };
}

export function runFight(
  prev: FighterState,
  fighterName: string,
  seedBase: number,
  now: number,
): { state: FighterState; result: FightResult } {
  const s = advance(prev, now);
  const opp = LADDER[s.rank]!;
  const rnd = mulberry32(seedBase * 1000 + s.fightsCount + 1);

  const playerPower = fightPower(s);
  const diff = playerPower - opp.power;
  const winChance = 1 / (1 + Math.exp(-diff / 10));
  const won = rnd() < winChance;

  const fill = (t: string) => t.replaceAll('{me}', fighterName).replaceAll('{op}', opp.name);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)]!;

  const finishRound = 1 + Math.floor(rnd() * 3);
  const decision = rnd() < 0.35;
  const lastRound = decision ? 3 : finishRound;
  const rounds: string[][] = [];
  for (let r = 1; r <= lastRound; r++) {
    const events: string[] = [];
    for (let i = 0; i < 3; i++) {
      // в целом раунды «склоняются» к итоговому победителю, но не всегда
      const goodMoment = rnd() < (won ? 0.65 : 0.35);
      events.push(fill(pick(goodMoment ? HITS_GOOD : HITS_BAD)));
    }
    rounds.push(events);
  }
  const finishTpl = decision
    ? won ? FINISH_WIN[2]! : FINISH_LOSS[2]!
    : pick((won ? FINISH_WIN : FINISH_LOSS).slice(0, 2));
  const finish = finishTpl.replace('{r}', String(finishRound));

  s.fightsCount += 1;
  if (won) {
    s.wins += 1;
    s.rank += 1;
  } else {
    s.losses += 1;
  }
  // бой выматывает
  s.energy = Math.max(0, Math.round((s.energy - 30) * 10) / 10);
  s.satiety = Math.max(0, Math.round((s.satiety - 20) * 10) / 10);
  s.nextFightAt = now + B.fightInterval;

  return {
    state: s,
    result: {
      won,
      opponent: opp.name,
      playerPower,
      opponentPower: opp.power,
      winChance: Math.round(winChance * 100) / 100,
      rounds,
      finish,
    },
  };
}
