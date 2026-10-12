// Демо-режим: вся игра в браузере на той же логике, что и сервер (shared/).
// Состояние в localStorage, есть «машина времени», чтобы прогнать сутки за минуту.
import {
  PRODUCTS,
  advance,
  applyAction,
  continueFight,
  cornerAdvice,
  newFighter,
  rating,
  startFight,
  taleOfTheTape,
  type ActionType,
  type FighterState,
  type ProductId,
  type ThemeId,
} from '@mma/shared';
import type { Api, PublicFighter } from './api';
import { store } from './storage';

const KEY = 'mma_demo_v2';
interface Saved {
  name: string;
  look: number;
  state: FighterState;
}

let offset = Number(store.get(KEY + '_offset') ?? 0);
let db: Saved | null = (() => {
  try {
    return JSON.parse(store.get(KEY) ?? 'null') as Saved | null;
  } catch {
    return null;
  }
})();

const now = () => Date.now() + offset;
const persist = () => {
  store.set(KEY, JSON.stringify(db));
  store.set(KEY + '_offset', String(offset));
};

function pub(): PublicFighter | null {
  if (!db) return null;
  const s = advance(db.state, now());
  return {
    name: db.name,
    look: db.look,
    state: s,
    rating: rating(s),
    tape: taleOfTheTape(s),
    corner: s.activeFight ? cornerAdvice(s.activeFight) : null,
    serverNow: now(),
  };
}

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 120));

export const demoApi: Api = {
  demo: true,
  session: () => wait({ fighter: pub(), products: PRODUCTS }),
  create(name, look, theme: ThemeId) {
    const clean = name.trim().slice(0, 24);
    if (clean.length < 2) return wait({ fighter: null, error: 'Имя слишком короткое' });
    db = { name: clean, look, state: newFighter(now(), theme) };
    persist();
    return wait({ fighter: pub() });
  },
  action(action) {
    if (!db) return wait({ ok: false, message: 'Нет бойца', fighter: null });
    const r = applyAction(db.state, action as ActionType, now());
    if (r.ok) {
      db.state = r.state;
      persist();
    }
    return wait({ ok: r.ok, message: r.ok ? r.message : r.error, fighter: pub() });
  },
  fight(kind, tactic) {
    if (!db) return wait({ ok: false, message: 'Нет бойца', fighter: null });
    const r = kind === 'start' ? startFight(db.state, db.name, db.state.createdAt % 100_003, tactic, now()) : continueFight(db.state, db.name, tactic, now());
    if ('error' in r) return wait({ ok: false, message: r.error, fighter: pub() });
    db.state = r.state;
    persist();
    return wait({ ok: true, round: r.round, outcome: r.outcome, fighter: pub() });
  },
  theme(theme) {
    if (!db) return wait({ ok: false, message: 'Нет бойца', fighter: null });
    if (!db.state.unlockedThemes.includes(theme)) return wait({ ok: false, message: 'Тема закрыта', fighter: pub() });
    db.state = { ...db.state, theme };
    persist();
    return wait({ ok: true, message: '', fighter: pub() });
  },
  async buy(product: ProductId) {
    if (!db) return 'failed';
    const ok = safeConfirm(`ДЕМО: «${PRODUCTS[product].title}» за ⭐${PRODUCTS[product].stars}. В Telegram здесь откроется оплата Stars. Засчитать покупку?`);
    if (!ok) return 'cancelled';
    const s = db.state;
    if (product === 'freeze') s.freezes += 1;
    if (product === 'starter_pack') {
      s.freezes += 2;
      s.starterPackBought = true;
      if (!s.cosmetics.includes('gold_shorts')) s.cosmetics.push('gold_shorts');
    }
    if (product.startsWith('theme_')) {
      const t = product.slice(6) as ThemeId;
      if (!s.unlockedThemes.includes(t)) s.unlockedThemes.push(t);
      s.theme = t;
    }
    persist();
    return 'paid';
  },
  event: () => {},
  async travel(ms) {
    offset += ms;
    persist();
    return pub();
  },
  reset() {
    db = null;
    offset = 0;
    store.del(KEY);
    store.del(KEY + '_offset');
  },
};

function safeConfirm(msg: string) {
  try {
    return window.confirm(msg);
  } catch {
    return true; // в песочнице диалоги запрещены — засчитываем
  }
}
