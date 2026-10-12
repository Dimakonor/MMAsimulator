import type { Bot } from 'grammy';
import { PRODUCTS, THEME_IDS, type FighterState, type ProductId, type ThemeId } from '@mma/shared';
import { sql, track } from './db.js';

export function isProduct(p: string): p is ProductId {
  return p in PRODUCTS;
}

function themeOf(p: ProductId): ThemeId | null {
  const t = p.startsWith('theme_') ? (p.slice(6) as ThemeId) : null;
  return t && THEME_IDS.includes(t) ? t : null;
}

/** Ссылка для Telegram.WebApp.openInvoice(). Валюта XTR = Stars, provider_token пустой. */
export async function createInvoiceLink(bot: Bot, userId: number, product: ProductId) {
  const p = PRODUCTS[product];
  const payload = JSON.stringify({ u: userId, p: product, n: Date.now() });
  return bot.api.createInvoiceLink(p.title, p.description, payload, '', 'XTR', [
    { label: p.title, amount: p.stars },
  ]);
}

function parsePayload(raw: string): { u: number; p: ProductId } | null {
  try {
    const j = JSON.parse(raw) as { u: number; p: string };
    return isProduct(j.p) ? { u: j.u, p: j.p } : null;
  } catch {
    return null;
  }
}

export function registerPaymentHandlers(bot: Bot) {
  // Обязателен ответ за 10 секунд. Здесь только быстрые проверки.
  bot.on('pre_checkout_query', async (ctx) => {
    const q = ctx.preCheckoutQuery;
    const pl = parsePayload(q.invoice_payload);
    if (!pl || pl.u !== q.from.id || q.currency !== 'XTR' || q.total_amount !== PRODUCTS[pl.p].stars) {
      return ctx.answerPreCheckoutQuery(false, { error_message: 'Заказ устарел, открой магазин ещё раз.' });
    }
    const [f] = await sql<{ state: FighterState }[]>`select state from fighters where user_id = ${pl.u}`;
    if (!f) return ctx.answerPreCheckoutQuery(false, { error_message: 'Сначала создай бойца.' });
    if (pl.p === 'starter_pack' && f.state.starterPackBought) {
      return ctx.answerPreCheckoutQuery(false, { error_message: 'Стартовый пак уже куплен.' });
    }
    const theme = themeOf(pl.p);
    if (theme && f.state.unlockedThemes.includes(theme)) {
      return ctx.answerPreCheckoutQuery(false, { error_message: 'Эта тема уже открыта.' });
    }
    return ctx.answerPreCheckoutQuery(true);
  });

  // Выдаём товар ТОЛЬКО по successful_payment и ровно один раз (charge_id — первичный ключ).
  bot.on('message:successful_payment', async (ctx) => {
    const sp = ctx.message.successful_payment;
    const pl = parsePayload(sp.invoice_payload);
    if (!pl) return;
    const granted = await sql.begin(async (tx) => {
      const ins = await tx`insert into payments (charge_id, user_id, product, stars)
                           values (${sp.telegram_payment_charge_id}, ${pl.u}, ${pl.p}, ${sp.total_amount})
                           on conflict (charge_id) do nothing returning charge_id`;
      if (ins.length === 0) return false;
      const [f] = await tx<{ id: number; state: FighterState }[]>`select id, state from fighters where user_id = ${pl.u} for update`;
      if (!f) return false;
      const s = { ...f.state, cosmetics: [...f.state.cosmetics] };
      if (pl.p === 'freeze') s.freezes += 1;
      if (pl.p === 'starter_pack') {
        s.freezes += 2;
        s.starterPackBought = true;
        if (!s.cosmetics.includes('gold_shorts')) s.cosmetics.push('gold_shorts');
      }
      const theme = themeOf(pl.p);
      if (theme && !s.unlockedThemes.includes(theme)) {
        s.unlockedThemes = [...s.unlockedThemes, theme];
        s.theme = theme; // сразу включаем купленное
      }
      await tx`update fighters set state = ${tx.json(s as never)}, updated_at = now() where id = ${f.id}`;
      return true;
    });
    if (granted) {
      await track(pl.u, 'purchase', { product: pl.p, stars: sp.total_amount });
      await ctx.reply('Оплата прошла, тренер. Всё уже в зале 💪');
    }
  });
}

/** Возврат (вручную, по запросу поддержки): bot.api.refundStarPayment(userId, chargeId). */
export async function refund(bot: Bot, chargeId: string) {
  const [p] = await sql<{ user_id: string }[]>`select user_id from payments where charge_id = ${chargeId}`;
  if (!p) throw new Error('payment not found');
  await bot.api.refundStarPayment(Number(p.user_id), chargeId);
  await sql`update payments set status = 'refunded' where charge_id = ${chargeId}`;
}
