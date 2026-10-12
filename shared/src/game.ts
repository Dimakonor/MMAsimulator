import { BALANCE as B, type ThemeId } from './config.js';
import type { ActiveFight, HistoryEntry } from './fight.js';

export interface Skills {
  striking: number;
  grappling: number;
  cardio: number;
}

export interface Record5 {
  w: number;
  l: number;
  ko: number; // победы KO/TKO
  sub: number;
  dec: number;
}

export interface FighterState {
  satiety: number; // 0..100
  energy: number; // 0..100
  form: number; // 0..100
  skills: Skills;
  sleepingUntil: number | null;
  frozenUntil: number | null;
  lastFedAt: number;
  lastTrainedAt: number;
  lastCutAt: number;
  lastTickAt: number;
  nextFightAt: number;
  rank: number; // индекс следующего соперника; >= 8 — чемпион
  defenses: number;
  record: Record5;
  fightsCount: number;
  // Весогонка: null — окно не открыто. over — кг сверх лимита.
  weight: { over: number; forFight: number; made: boolean } | null;
  activeFight: ActiveFight | null;
  history: HistoryEntry[];
  freezes: number;
  cosmetics: string[];
  starterPackBought: boolean;
  createdAt: number;
  theme: ThemeId;
  unlockedThemes: ThemeId[];
}

export type TrainKind = 'striking' | 'grappling' | 'cardio';
export type ActionType = 'feed' | 'train_striking' | 'train_grappling' | 'train_cardio' | 'sleep' | 'wake' | 'freeze' | 'cut';
export const ACTIONS: ActionType[] = ['feed', 'train_striking', 'train_grappling', 'train_cardio', 'sleep', 'wake', 'freeze', 'cut'];

export type ActionResult =
  | { ok: true; state: FighterState; message: string }
  | { ok: false; state: FighterState; error: string };

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));
export const round1 = (v: number) => Math.round(v * 10) / 10;

export function newFighter(now: number, theme: ThemeId = 'basement'): FighterState {
  return {
    satiety: 80,
    energy: 80,
    form: 50,
    skills: { ...B.startSkills },
    sleepingUntil: null,
    frozenUntil: null,
    lastFedAt: 0,
    lastTrainedAt: 0,
    lastCutAt: 0,
    lastTickAt: now,
    nextFightAt: now + B.firstFightDelay,
    rank: 0,
    defenses: 0,
    record: { w: 0, l: 0, ko: 0, sub: 0, dec: 0 },
    fightsCount: 0,
    weight: null,
    activeFight: null,
    history: [],
    freezes: 0,
    cosmetics: [],
    starterPackBought: false,
    createdAt: now,
    theme,
    unlockedThemes: [theme],
  };
}

export const totalSkill = (s: Skills) => s.striking + s.grappling + s.cardio;

/** Досчитывает состояние от lastTickAt до now. Время — только серверное. */
export function advance(s0: FighterState, now: number): FighterState {
  const s: FighterState = JSON.parse(JSON.stringify(s0)); // structuredClone нет в старых WebView
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
  // Окно весогонки (со второго боя — в первом новичку не до сауны)
  if (s.fightsCount >= 1 && !s.activeFight && now >= s.nextFightAt - B.weightCut.window && (!s.weight || s.weight.forFight !== s.fightsCount)) {
    s.weight = { over: B.weightCut.startOver, forFight: s.fightsCount, made: false };
  }
  s.satiety = round1(s.satiety);
  s.energy = round1(s.energy);
  s.form = round1(s.form);
  s.lastTickAt = now;
  return s;
}

export function inCutWindow(s: FighterState) {
  return s.weight !== null && s.weight.forFight === s.fightsCount && !s.activeFight;
}

const TRAIN_TEXT: Record<TrainKind, string[]> = {
  striking: ['Отбил лапы с тренером', 'Три раунда на мешке', 'Спарринг в стойке'],
  grappling: ['Отработал проходы в ноги', 'Борьба у сетки', 'Позиционка в партере'],
  cardio: ['Кросс в горку', 'Скакалка до потери пульса', 'Круговая на выносливость'],
};

export function applyAction(prev: FighterState, action: ActionType, now: number): ActionResult {
  const s = advance(prev, now);
  const asleep = s.sleepingUntil !== null;
  const fail = (error: string): ActionResult => ({ ok: false, state: s, error });
  if (s.activeFight) return fail('Боец в клетке. Сначала досмотри бой.');

  switch (action) {
    case 'feed': {
      if (asleep) return fail('Спит. Разбуди или подожди.');
      if (now - s.lastFedAt < B.feed.cooldown) return fail('Уже ел недавно.');
      if (s.satiety >= 95) return fail('Не лезет, тренер.');
      s.satiety = round1(clamp(s.satiety + B.feed.satiety));
      s.lastFedAt = now;
      if (inCutWindow(s) && !s.weight!.made) {
        s.weight!.over = round1(s.weight!.over + B.weightCut.feedGain);
        return { ok: true, state: s, message: `Поел. Но вес +${B.weightCut.feedGain} кг — завтра взвешивание` };
      }
      return { ok: true, state: s, message: 'Поел. Сытость +' + B.feed.satiety };
    }
    case 'train_striking':
    case 'train_grappling':
    case 'train_cardio': {
      const kind = action.slice(6) as TrainKind;
      if (asleep) return fail('Спит. Разбуди или подожди.');
      if (now - s.lastTrainedAt < B.train.cooldown) return fail('Мышцы ещё не восстановились.');
      if (s.energy < B.train.minEnergy) return fail('Нет сил. Уложи спать.');
      if (s.satiety < B.train.minSatiety) return fail('На голодный желудок не тренируется.');
      const gain = round1(B.train.baseSkillGain * (0.5 + s.form / 100));
      s.energy = round1(clamp(s.energy - B.train.energyCost));
      s.satiety = round1(clamp(s.satiety - B.train.satietyCost));
      s.form = round1(clamp(s.form + B.train.formGain));
      s.skills[kind] = round1(s.skills[kind] + gain);
      s.lastTrainedAt = now;
      const txt = TRAIN_TEXT[kind][Math.floor(now / 1000) % 3]!;
      return { ok: true, state: s, message: `${txt}. +${gain}` };
    }
    case 'sleep': {
      if (asleep) return fail('Уже спит.');
      if (s.energy >= 90) return fail('Не хочет спать.');
      s.sleepingUntil = now + B.sleepDuration;
      return { ok: true, state: s, message: 'Уснул. Проснётся сам, когда выспится.' };
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
    case 'cut': {
      if (!inCutWindow(s)) return fail('Весогонка — только за сутки до боя.');
      if (asleep) return fail('Спит. Разбуди или подожди.');
      if (s.weight!.made) return fail('Вес уже сделан. Можно есть.');
      if (now - s.lastCutAt < B.weightCut.cooldown) return fail('Отдохни после сауны.');
      if (s.energy < B.weightCut.energyCost) return fail('Нет сил на сауну.');
      s.weight!.over = round1(Math.max(-0.5, s.weight!.over - B.weightCut.perCut));
      s.energy = round1(clamp(s.energy - B.weightCut.energyCost));
      s.lastCutAt = now;
      const left = s.weight!.over;
      if (left <= 0) s.weight!.made = true;
      return {
        ok: true,
        state: s,
        message: left <= 0 ? 'Сауна. ВЕС СДЕЛАН! Теперь можно есть 💧' : `Сауна. Осталось согнать ${left} кг`,
      };
    }
  }
}

/** «Кондиции» — то, что игрок даёт бойцу уходом. Добавляется к рейтингу в бою. */
export function conditionPoints(s: Pick<FighterState, 'form' | 'energy' | 'satiety'>) {
  return s.form * 0.3 + s.energy * 0.1 + s.satiety * 0.05;
}

/** Общий рейтинг для UI: навыки + кондиции. */
export function rating(s: FighterState) {
  return Math.round(totalSkill(s.skills) + conditionPoints(s));
}

export function isChampion(s: FighterState) {
  return s.rank >= 8;
}

export function msUntilSatiety(s: FighterState, level: number): number {
  if (s.satiety <= level) return 0;
  return ((s.satiety - level) / B.satietyDecayPerHour) * 3_600_000;
}
