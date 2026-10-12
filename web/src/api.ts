import type { FighterState, FightResult, ProductId } from '@mma/shared';
import { tg } from './telegram';

export interface PublicFighter {
  name: string;
  look: number;
  state: FighterState;
  power: number;
  nextOpponent: { name: string; power: number } | null;
  ladderSize: number;
  serverNow: number;
}

export type Products = Record<ProductId, { title: string; description: string; stars: number }>;

async function call<T>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `tma ${tg?.initData ?? ''}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json;
}

export const api = {
  session: (writeAccess: boolean) =>
    call<{ fighter: PublicFighter | null; products: Products }>('/session', {
      tzOffsetMin: -new Date().getTimezoneOffset(),
      writeAccess,
    }),
  create: (name: string, look: number) => call<{ fighter: PublicFighter }>('/fighter', { name, look }),
  action: (action: string) => call<{ ok: boolean; message: string; fighter: PublicFighter }>('/action', { action }),
  fight: () => call<{ ok: boolean; message?: string; result?: FightResult; fighter: PublicFighter }>('/fight'),
  invoice: (product: ProductId) => call<{ link: string }>('/invoice', { product }),
  event: (name: string, props?: Record<string, unknown>) => call('/event', { name, props }).catch(() => {}),
};
