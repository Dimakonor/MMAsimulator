import { useState } from 'preact/hooks';
import { HOUR, PRODUCTS, THEMES, THEME_IDS, type ProductId, type ThemeId } from '@mma/shared';
import { api, type PublicFighter } from '../api';
import { applyTheme, art, html } from '../ui';
import { haptic } from '../telegram';
import type { Go } from '../app';

export function Shop({ f, setF, go, flash, refresh }: { f: PublicFighter; setF: (f: PublicFighter) => void; go: Go; flash: (m: string, bad?: boolean) => void; refresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const s = f.state;
  // Продажи — не в первый день: сначала привязанность
  const dayTwo = f.serverNow - s.createdAt > 20 * HOUR;

  const useTheme = async (t: ThemeId) => {
    const r = await api.theme(t);
    if (r.fighter) {
      setF(r.fighter);
      applyTheme(t);
      haptic.ok();
    } else flash(r.message, true);
  };

  const buy = async (p: ProductId) => {
    setBusy(true);
    api.event('shop_click', { product: p });
    const status = await api.buy(p);
    setBusy(false);
    if (status === 'paid') {
      haptic.ok();
      flash('Оплачено 💪');
      // successful_payment приходит боту асинхронно — перечитаем чуть позже
      setTimeout(refresh, api.demo ? 0 : 1500);
    }
  };

  return html`<div class="screen shop">
    <div class="topbar"><button class="icon" onClick=${() => go('gym')}>←</button><div class="tape-title">Угол тренера</div><span></span></div>

    <div class="kicker">Темы зала</div>
    <div class="theme-cards">
      ${THEME_IDS.map((t) => {
        const open = s.unlockedThemes.includes(t);
        const active = s.theme === t;
        return html`<div class=${`theme-card ${active ? 'sel' : ''} ${open ? '' : 'locked'}`} data-t=${t}>
          <img src=${art(t, 'bg')} alt="" loading="lazy" />
          <div class="theme-card-body">
            <b>${THEMES[t].title}</b>
            <span>${THEMES[t].tagline}</span>
          </div>
          <div class="theme-card-cta">
            ${active
              ? html`<span class="pill">Включена</span>`
              : open
                ? html`<button class="btn small" onClick=${() => useTheme(t)}>Включить</button>`
                : html`<button class="btn small primary" disabled=${busy} onClick=${() => buy(`theme_${t}`)}>⭐ ${THEMES[t].stars}</button><small>или за пояс</small>`}
          </div>
        </div>`;
      })}
    </div>

    <div class="kicker">Восстановление</div>
    <div class="panel item">
      <div><b>🩹 ${PRODUCTS.freeze.title}</b><span>${PRODUCTS.freeze.description}</span><small>Есть: ${s.freezes}</small></div>
      <button class="btn small primary" disabled=${busy} onClick=${() => buy('freeze')}>⭐ ${PRODUCTS.freeze.stars}</button>
    </div>
    ${dayTwo &&
    !s.starterPackBought &&
    html`<div class="panel item hot">
      <div><b>🎁 ${PRODUCTS.starter_pack.title}</b><span>${PRODUCTS.starter_pack.description}</span></div>
      <button class="btn small primary" disabled=${busy} onClick=${() => buy('starter_pack')}>⭐ ${PRODUCTS.starter_pack.stars}</button>
    </div>`}
  </div>`;
}
