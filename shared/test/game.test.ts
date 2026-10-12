import { describe, expect, it } from 'vitest';
import { BALANCE, HOUR, DAY, LADDER, advance, applyAction, canFight, newFighter, runFight } from '../src/index.js';

const T0 = Date.UTC(2026, 9, 12, 12, 0, 0);

describe('advance', () => {
  it('сытость падает линейно', () => {
    const s = advance(newFighter(T0), T0 + 5 * HOUR);
    expect(s.satiety).toBeCloseTo(80 - 5 * BALANCE.satietyDecayPerHour, 1);
  });

  it('форма не падает ниже пола при недельном забросе', () => {
    const s = advance(newFighter(T0), T0 + 7 * DAY);
    expect(s.satiety).toBe(0);
    expect(s.form).toBe(BALANCE.formFloor);
  });

  it('больничный замораживает статы', () => {
    const s0 = { ...newFighter(T0), freezes: 1 };
    const r = applyAction(s0, 'freeze', T0);
    expect(r.ok).toBe(true);
    const s = advance(r.state, T0 + 20 * HOUR);
    expect(s.satiety).toBe(80);
    expect(s.freezes).toBe(0);
  });

  it('сон восстанавливает энергию и сам заканчивается', () => {
    let s = { ...newFighter(T0), energy: 20 };
    const r = applyAction(s, 'sleep', T0);
    expect(r.ok).toBe(true);
    s = advance(r.state, T0 + BALANCE.sleepDuration + HOUR);
    expect(s.sleepingUntil).toBeNull();
    expect(s.energy).toBeGreaterThan(90);
  });

  it('повторный advance на тот же момент ничего не меняет', () => {
    const a = advance(newFighter(T0), T0 + 3 * HOUR);
    expect(advance(a, T0 + 3 * HOUR)).toEqual(a);
  });
});

describe('actions', () => {
  it('тренировка качает навык и тратит энергию', () => {
    const r = applyAction(newFighter(T0), 'train', T0);
    expect(r.ok).toBe(true);
    expect(r.state.skill).toBeGreaterThan(0);
    expect(r.state.energy).toBe(80 - BALANCE.train.energyCost);
  });

  it('кулдаун тренировки соблюдается', () => {
    const r1 = applyAction(newFighter(T0), 'train', T0);
    const r2 = applyAction(r1.state, 'train', T0 + HOUR);
    expect(r2.ok).toBe(false);
  });

  it('спящего нельзя кормить', () => {
    const s = { ...newFighter(T0), energy: 10 };
    const r = applyAction(applyAction(s, 'sleep', T0).state, 'feed', T0 + HOUR);
    expect(r.ok).toBe(false);
  });
});

describe('fight', () => {
  it('бой недоступен до назначенного времени', () => {
    expect(canFight(newFighter(T0), T0).ok).toBe(false);
    expect(canFight(newFighter(T0), T0 + BALANCE.firstFightDelay).ok).toBe(true);
  });

  it('детерминирован при одинаковом сиде', () => {
    const s = newFighter(T0);
    const now = T0 + BALANCE.firstFightDelay;
    const a = runFight(s, 'Вася', 42, now);
    const b = runFight(s, 'Вася', 42, now);
    expect(a.result).toEqual(b.result);
  });

  it('прилежный игрок в большинстве случаев становится чемпионом за 35 дней', () => {
    let champions = 0;
    const runs = 200;
    for (let seed = 1; seed <= runs; seed++) {
      let s = newFighter(T0);
      let t = T0;
      for (let day = 0; day < 35 && s.rank < LADDER.length; day++) {
        // 3 «захода» в день: утро, день, вечер
        for (const h of [9, 14, 21]) {
          t = T0 + day * DAY + h * HOUR;
          s = applyAction(s, 'feed', t).state;
          s = applyAction(s, 'train', t).state;
          if (canFight(s, t).ok) s = runFight(s, 'Тест', seed, t).state;
        }
        s = applyAction(s, 'sleep', T0 + day * DAY + 23 * HOUR).state;
      }
      if (s.rank >= LADDER.length) champions++;
    }
    expect(champions / runs).toBeGreaterThan(0.5);
  });
});
