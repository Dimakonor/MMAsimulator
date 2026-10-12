import { BALANCE as B, LADDER } from './config.js';

export interface FighterState {
  satiety: number; // 0..100, больше = сытее
  energy: number; // 0..100
  form: number; // 0..100
  skill: number; // растёт от тренировок, не падает
  sleepingUntil: number | null; // epoch ms
  frozenUntil: number | null; // «больничный»
  lastFedAt: number;
  lastTrainedAt: number;
  lastTickAt: number; // до какого момента состояние досчитано
  nextFightAt: number;
  rank: number; // индекс следующего соперника в LADDER; === LADDER.length -> чемпион
  wins: number;
  losses: number;
  fightsCount: number;
  freezes: number; // купленные/подаренные больничные
  cosmetics: string[];
  starterPackBought: boolean;
  createdAt: number;
}

export type ActionType = 'feed' | 'train' | 'sleep' | 'wake' | 'freeze';

export type ActionResult =
  | { ok: true; state: FighterState; message: string }
  | { ok: false; state: FighterState; error: string };

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

export function newFighter(now: number): FighterState {
  return {
    satiety: 80,
    energy: 80,
    form: 50,
    skill: 0,
    sleepingUntil: null,
    frozenUntil: null,
    lastFedAt: 0,
    lastTrainedAt: 0,
    lastTickAt: now,
    nextFightAt: now + B.firstFightDelay,
    rank: 0,
    wins: 0,
    losses: 0,
    fightsCount: 0,
    freezes: 0,
    cosmetics: [],
    starterPackBought: false,
    createdAt: now,
  };
}

/**
 * Досчитывает состояние от lastTickAt до now. Время — только серверное.
 * Шаговая симуляция (а не формула), чтобы пороги «голоден/вымотан» работали
 * честно внутри длинного отсутствия.
 */
export function advance(s0: FighterState, now: number): FighterState {
  const s: FighterState = { ...s0, cosmetics: [...s0.cosmetics] };
  if (now <= s.lastTickAt) return s;

  let t = Math.max(s.lastTickAt, now - B.simMaxSpan);
  while (t < now) {
    const dtMs = Math.min(B.simStep, now - t);
    const dtH = dtMs / 3_600_000;
    const frozen = s.frozenUntil !== null && t < s.frozenUntil;
    const asleep = s.sleepingUntil !== null && t < s.sleepingUntil;

    if (!frozen) {
      s.satiety = clamp(s.satiety - B.satietyDecayPerHour * dtH);
      if (asleep) s.energy = clamp(s.energy + B.energyRegenPerHourAsleep * dtH);
      else s.energy = clamp(s.energy - B.energyDecayPerHour * dtH);

      const neglected = s.satiety < B.hungryThreshold || s.energy < B.exhaustedThreshold;
      if (neglected && s.form > B.formFloor) {
        s.form = Math.max(B.formFloor, s.form - B.formDecayPerHourNeglected * dtH);
      }
    }
    t += dtMs;
  }

  if (s.sleepingUntil !== null && now >= s.sleepingUntil) s.sleepingUntil = null;
  if (s.frozenUntil !== null && now >= s.frozenUntil) s.frozenUntil = null;
  s.satiety = round1(s.satiety);
  s.energy = round1(s.energy);
  s.form = round1(s.form);
  s.lastTickAt = now;
  return s;
}

export function applyAction(prev: FighterState, action: ActionType, now: number): ActionResult {
  const s = advance(prev, now);
  const asleep = s.sleepingUntil !== null;
  const fail = (error: string): ActionResult => ({ ok: false, state: s, error });

  switch (action) {
    case 'feed': {
      if (asleep) return fail('Спит. Разбудить или подождать.');
      if (now - s.lastFedAt < B.feed.cooldown) return fail('Уже ел недавно.');
      if (s.satiety >= 95) return fail('Не лезет, тренер.');
      s.satiety = round1(clamp(s.satiety + B.feed.satiety));
      s.lastFedAt = now;
      return { ok: true, state: s, message: 'Поел. Сытость +' + B.feed.satiety };
    }
    case 'train': {
      if (asleep) return fail('Спит. Разбудить или подождать.');
      if (now - s.lastTrainedAt < B.train.cooldown) return fail('Мышцы ещё не восстановились.');
      if (s.energy < B.train.minEnergy) return fail('Нет сил. Уложи спать.');
      if (s.satiety < B.train.minSatiety) return fail('На голодный желудок не тренируется.');
      const gain = round1(B.train.baseSkillGain * (0.5 + s.form / 100));
      s.energy = round1(clamp(s.energy - B.train.energyCost));
      s.satiety = round1(clamp(s.satiety - B.train.satietyCost));
      s.form = round1(clamp(s.form + B.train.formGain));
      s.skill = round1(s.skill + gain);
      s.lastTrainedAt = now;
      return { ok: true, state: s, message: `Отпахал. Навык +${gain}` };
    }
    case 'sleep': {
      if (asleep) return fail('Уже спит.');
      if (s.energy >= 90) return fail('Не хочет спать.');
      s.sleepingUntil = now + B.sleepDuration;
      return { ok: true, state: s, message: 'Уснул. Разбудит себя сам, когда выспится.' };
    }
    case 'wake': {
      if (!asleep) return fail('Не спит.');
      s.sleepingUntil = null;
      return { ok: true, state: s, message: 'Проснулся. Ворчит.' };
    }
    case 'freeze': {
      if (s.freezes <= 0) return fail('Нет больничных.');
      if (s.frozenUntil !== null) return fail('Больничный уже идёт.');
      s.freezes -= 1;
      s.frozenUntil = now + B.freezeDuration;
      return { ok: true, state: s, message: 'Больничный на 24 часа. Форма не упадёт.' };
    }
  }
}

export function fightPower(s: FighterState): number {
  return round1(s.skill + s.form * 0.3 + s.energy * 0.1 + s.satiety * 0.05);
}

export function isChampion(s: FighterState): boolean {
  return s.rank >= LADDER.length;
}

/** Через сколько мс сытость упадёт до уровня `level` (без учёта больничного). */
export function msUntilSatiety(s: FighterState, level: number): number {
  if (s.satiety <= level) return 0;
  return ((s.satiety - level) / B.satietyDecayPerHour) * 3_600_000;
}
