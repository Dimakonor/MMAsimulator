import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  HOUR,
  DAY,
  STYLE_INFO,
  TACTICS,
  THEME_IDS,
  advance,
  applyAction,
  canFight,
  continueFight,
  newFighter,
  nextOpponent,
  startFight,
  PVP,
  applyDefense,
  canPvp,
  makeGhost,
  pvpCard,
  refreshOffers,
  startPvp,
  type FighterState,
  type FightStep,
  type PvpCard,
  type Tactic,
} from '../src/index.js';

const T0 = Date.UTC(2026, 9, 12, 6, 0, 0);
const TL: Tactic[] = ['pressure', 'counter', 'takedown'];

function fightToEnd(s: FighterState, now: number, pick: (s: FighterState) => Tactic, seed = 1): FightStep {
  let st = startFight(s, 'Тест', seed, pick(s), now);
  if ('error' in st) throw new Error(st.error);
  while (!st.outcome) {
    const n = continueFight(st.state, 'Тест', pick(st.state), now);
    if ('error' in n) throw new Error(n.error);
    st = n;
  }
  return st;
}

/** «Умный» игрок: первый раунд — по стилю соперника, дальше — против его прошлой тактики. */
function smart(s: FighterState): Tactic {
  const last = s.activeFight?.rounds.at(-1);
  if (last) return TL.find((t) => TACTICS[t].beats === last.oTactic)!;
  const w = STYLE_INFO[nextOpponent(s).style].tactics;
  const likely = TL.reduce((a, b) => (w[b] > w[a] ? b : a));
  return TL.find((t) => TACTICS[t].beats === likely)!;
}

describe('уход за бойцом', () => {
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
    const r = applyAction({ ...newFighter(T0), freezes: 1 }, 'freeze', T0);
    expect(r.ok).toBe(true);
    expect(advance(r.state, T0 + 20 * HOUR).satiety).toBe(80);
  });

  it('сон восстанавливает энергию и сам заканчивается', () => {
    const r = applyAction({ ...newFighter(T0), energy: 20 }, 'sleep', T0);
    const s = advance(r.state, T0 + BALANCE.sleepDuration + HOUR);
    expect(s.sleepingUntil).toBeNull();
    expect(s.energy).toBeGreaterThan(90);
  });

  it('каждый тип тренировки качает свой навык', () => {
    for (const k of ['striking', 'grappling', 'cardio'] as const) {
      const s0 = newFighter(T0);
      const r = applyAction(s0, `train_${k}`, T0);
      expect(r.ok).toBe(true);
      expect(r.state.skills[k]).toBeGreaterThan(s0.skills[k]);
    }
  });

  it('кулдаун тренировки соблюдается', () => {
    const r1 = applyAction(newFighter(T0), 'train_striking', T0);
    expect(applyAction(r1.state, 'train_cardio', T0 + HOUR).ok).toBe(false);
  });
});

describe('весогонка', () => {
  // второй бой: через 72 ч после старта
  const fighter = () => ({ ...newFighter(T0 + 2 * DAY), fightsCount: 1, nextFightAt: T0 + 3 * DAY });
  const windowOpen = T0 + 3 * DAY - BALANCE.weightCut.window + HOUR;

  it('в первом бою весогонки нет', () => {
    expect(advance(newFighter(T0), T0 + BALANCE.firstFightDelay).weight).toBeNull();
  });

  it('окно открывается за сутки до боя', () => {
    expect(advance(fighter(), T0 + HOUR).weight).toBeNull();
    expect(advance(fighter(), windowOpen).weight?.over).toBe(BALANCE.weightCut.startOver);
  });

  it('две сауны — вес сделан, после этого еда не мешает', () => {
    let s = applyAction(fighter(), 'cut', windowOpen).state;
    s = applyAction(s, 'cut', windowOpen + 4 * HOUR).state;
    expect(s.weight?.made).toBe(true);
    s = applyAction({ ...s, satiety: 30 }, 'feed', windowOpen + 5 * HOUR).state;
    expect(s.weight?.made).toBe(true);
  });

  it('еда до сгонки прибавляет вес', () => {
    const s = applyAction({ ...fighter(), satiety: 30 }, 'feed', windowOpen).state;
    expect(s.weight?.over).toBe(BALANCE.weightCut.startOver + BALANCE.weightCut.feedGain);
  });
});

describe('бой', () => {
  const fightTime = T0 + BALANCE.firstFightDelay;

  it('бой недоступен до назначенного времени', () => {
    expect(canFight(newFighter(T0), T0).ok).toBe(false);
    expect(canFight(newFighter(T0), fightTime).ok).toBe(true);
  });

  it('детерминирован: те же решения — тот же исход', () => {
    const s = newFighter(T0);
    const a = fightToEnd(s, fightTime, () => 'counter', 42);
    const b = fightToEnd(s, fightTime, () => 'counter', 42);
    expect(a.outcome).toEqual(b.outcome);
  });

  it('бой идёт по раундам и пишет рекорд и историю', () => {
    const r = fightToEnd(newFighter(T0), fightTime, () => 'pressure');
    const o = r.outcome!;
    expect(o.rounds.length >= 1 && o.rounds.length <= 3).toBe(true);
    expect(r.state.record.w + r.state.record.l).toBe(1);
    expect(r.state.history.length).toBe(1);
    expect(r.state.activeFight).toBeNull();
    if (o.method === 'DEC') expect(o.scorecards!.length).toBe(3);
  });

  it('во время боя действия заблокированы', () => {
    const st = startFight(newFighter(T0), 'Тест', 3, 'pressure', fightTime);
    if ('error' in st) throw new Error(st.error);
    if (!st.outcome) expect(applyAction(st.state, 'feed', fightTime).ok).toBe(false);
  });

  it('умный игрок в большинстве случаев берёт пояс за 35 дней', () => {
    let champions = 0;
    const runs = 150;
    for (let seed = 1; seed <= runs; seed++) {
      let s = newFighter(T0);
      const kinds = ['train_striking', 'train_grappling', 'train_cardio'] as const;
      let k = 0;
      for (let day = 0; day < 35 && s.rank < 8; day++) {
        for (const h of [9, 14, 21]) {
          const t = T0 + day * DAY + h * HOUR;
          if (s.weight && !s.weight.made) s = applyAction(s, 'cut', t).state;
          if (!(s.weight && !s.weight.made && s.satiety > 35)) s = applyAction(s, 'feed', t).state;
          const tr = applyAction(s, kinds[k % 3]!, t);
          if (tr.ok) {
            s = tr.state;
            k++;
          }
          if (canFight(s, t).ok) s = fightToEnd(s, t, smart, seed).state;
        }
        s = applyAction(s, 'sleep', T0 + day * DAY + 23 * HOUR).state;
      }
      if (s.rank >= 8) champions++;
    }
    expect(champions / runs).toBeGreaterThan(0.5);
  });

  it('пояс открывает все темы', () => {
    const s = { ...newFighter(T0), rank: 7 };
    // гоняем, пока не победим чемпиона (детерминированно по сиду)
    for (let seed = 1; seed < 200; seed++) {
      const r = fightToEnd({ ...s, skills: { striking: 80, grappling: 80, cardio: 60 } }, T0 + BALANCE.firstFightDelay, smart, seed);
      if (r.outcome!.won) {
        expect(r.outcome!.becameChampion).toBe(true);
        expect(r.state.unlockedThemes.length).toBe(THEME_IDS.length);
        return;
      }
    }
    throw new Error('ни разу не победил');
  });
});

describe('арена (PvP)', () => {
  const now = T0 + 2 * HOUR;
  const play = (s: FighterState, card: PvpCard, pick: Tactic) => {
    let st = startPvp(s, 'Я', 1, card, pick, now);
    if ('error' in st) throw new Error(st.error);
    while (!st.outcome) {
      const n = continueFight(st.state, 'Я', pick, now);
      if ('error' in n) throw new Error(n.error);
      st = n;
    }
    return st;
  };

  it('бой против живого игрока: ELO и рекорды зеркальны', () => {
    const me = newFighter(T0);
    const foe = { ...newFighter(T0), skills: { striking: 5, grappling: 5, cardio: 5 } };
    const card = pvpCard(foe, 2, 'Соперник', 1, now);
    const r = play(me, card, 'pressure');
    const o = r.outcome!;
    expect(o.pvp!.oppId).toBe(2);
    expect(r.state.pvp.w + r.state.pvp.l).toBe(1);
    expect(r.state.record.w + r.state.record.l).toBe(0); // карьера не тронута
    const def = applyDefense(foe, 'Я', 1, 0, o, now);
    expect(def.elo - 1000).toBe(-(r.state.elo - 1000));
    expect(def.pvpUnseen).toBe(1);
  });

  it('соперник дерётся строго по своему плану защиты', () => {
    const foe = { ...newFighter(T0), pvpPlan: ['takedown', 'takedown', 'takedown'] as Tactic[] };
    const r = play(newFighter(T0), pvpCard(foe, 2, 'Борец', 0, now), 'counter');
    for (const rd of r.outcome!.rounds) expect(rd.oTactic).toBe('takedown');
  });

  it('лимит боёв в день', () => {
    let s = newFighter(T0);
    for (let i = 0; i < PVP.perDay; i++) s = play({ ...s, energy: 100 }, makeGhost(s, 10 + i), 'pressure').state;
    expect(canPvp({ ...s, energy: 100 }, now).ok).toBe(false);
    expect(canPvp({ ...s, energy: 100 }, now + DAY).ok).toBe(true);
  });

  it('соперники обновляются ботами до трёх', () => {
    const s = refreshOffers(newFighter(T0), [], now, 5);
    expect(s.arenaOffers.length).toBe(PVP.offersCount);
    expect(s.arenaOffers.every((c) => c.ghost)).toBe(true);
  });
});
