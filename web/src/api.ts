import type { FighterState, FightOutcome, ProductId, RoundResult, Tactic, ThemeId, taleOfTheTape } from '@mma/shared';
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
  serverNow: number;
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
  session(writeAccess: boolean): Promise<{ fighter: PublicFighter | null; products: Products }>;
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
  async buy(product) {
    const { link } = await call<{ link: string }>('/invoice', { product });
    return openInvoice(link);
  },
  event: (name, props) => void call('/event', { name, props }).catch(() => {}),
};

/** В Telegram — настоящий сервер. В браузере — демо на той же логике из shared/. */
export const api: Api = tg ? httpApi : demoApi;
