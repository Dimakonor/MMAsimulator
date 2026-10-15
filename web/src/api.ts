import type { FighterState, FightOutcome, ProductId, PvpCard, RoundResult, Tactic, ThemeId, taleOfTheTape } from '@mma/shared';
import { PRODUCTS } from '@mma/shared';
import { openInvoice, tg } from './telegram';
import { demoApi } from './demo';

export interface PublicFighter {
  name: string;
  look: number;
  state: FighterState;
  rating: number;
  tape: ReturnType<typeof taleOfTheTape>;
  corner: string | null;
  pvpLeft: number;
  myId: number;
  serverNow: number;
}

export interface ArenaResp {
  offers: PvpCard[];
  newDefenses: number;
  place: number;
  myId: number;
  leaderboard: { id: number; name: string; look: number; elo: number; w: number; l: number; ghost?: boolean }[];
  fighter: PublicFighter | null;
}

export interface ActionResp {
  ok: boolean;
  message: string;
  fighter: PublicFighter | null;
}

export interface StepResp {
  ok: boolean;
  message?: string;
  round?: RoundResult;
  outcome?: FightOutcome | null;
  fighter: PublicFighter | null;
}

export type Products = typeof PRODUCTS;

export interface Api {
  demo: boolean;
  session(writeAccess: boolean): Promise<{ fighter: PublicFighter | null; products: Products; challenge?: PvpCard | null }>;
  arena(refresh?: boolean): Promise<ArenaResp>;
  plan(plan: Tactic[]): Promise<ActionResp>;
  challenge(fighterId: number): Promise<{ ok?: boolean; error?: string; card?: PvpCard }>;
  pvp(kind: 'start' | 'next', tactic: Tactic, oppId?: number): Promise<StepResp>;
  /** Ссылка «вызови меня» для друга */
  inviteLink(myId: number): string;
  create(name: string, look: number, theme: ThemeId): Promise<{ fighter: PublicFighter | null; error?: string }>;
  action(action: string): Promise<ActionResp>;
  fight(kind: 'start' | 'next', tactic: Tactic): Promise<StepResp>;
  theme(theme: ThemeId): Promise<ActionResp>;
  buy(product: ProductId): Promise<string>;
  event(name: string, props?: Record<string, unknown>): void;
  // только демо
  travel?(ms: number): Promise<PublicFighter | null>;
  reset?(): void;
}

// Задаётся при сборке: VITE_APP_LINK=https://t.me/<bot>/<app>
const APP_LINK: string = (import.meta as { env?: Record<string, string> }).env?.VITE_APP_LINK ?? 'https://t.me/';

async function call<T>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `tma ${tg?.initData ?? ''}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok && json.error) throw new Error(json.error);
  return json;
}

const httpApi: Api = {
  demo: false,
  session: (writeAccess) => call('/session', { tzOffsetMin: -new Date().getTimezoneOffset(), writeAccess }),
  create: (name, look, theme) => call('/fighter', { name, look, theme }),
  action: (action) => call('/action', { action }),
  fight: (kind, tactic) => call(`/fight/${kind}`, { tactic }),
  theme: (theme) => call('/theme', { theme }),
  arena: (refresh) => call('/arena', { refresh }),
  plan: (plan) => call('/arena/plan', { plan }),
  challenge: (fighterId) => call('/arena/challenge', { fighterId }),
  pvp: (kind, tactic, oppId) => call(`/pvp/${kind}`, { tactic, oppId }),
  inviteLink: (id) => `${APP_LINK}?startapp=ch_${id}`,
  async buy(product) {
    const { link } = await call<{ link: string }>('/invoice', { product });
    return openInvoice(link);
  },
  event: (name, props) => void call('/event', { name, props }).catch(() => {}),
};

/**
 * Автономная сборка (GitHub Pages, tools/build-preview.mjs) ставит window.__STANDALONE__ = true:
 * тогда даже внутри Telegram игра работает локально, без сервера.
 * Обычная сборка: в Telegram — настоящий сервер, в браузере — демо на той же логике из shared/.
 */
export const STANDALONE = !!(globalThis as { __STANDALONE__?: boolean }).__STANDALONE__;
export const api: Api = tg && !STANDALONE ? httpApi : demoApi;
