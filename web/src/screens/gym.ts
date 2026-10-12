import { useEffect, useState } from 'preact/hooks';
import { STYLE_INFO, THEMES, inCutWindow, isChampion } from '@mma/shared';
import { api, type PublicFighter } from '../api';
import { Bar, art, fmtClock, fmtIn, html } from '../ui';
import { haptic } from '../telegram';
import type { Go } from '../app';

export function Gym({ f, setF, go, flash }: { f: PublicFighter; setF: (f: PublicFighter) => void; go: Go; flash: (m: string, bad?: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  void tick;

  const s = f.state;
  const clockSkew = f.serverNow - Date.now();
  const now = Date.now() + clockSkew;
  const asleep = s.sleepingUntil !== null && s.sleepingUntil > now;
  const frozen = s.frozenUntil !== null && s.frozenUntil > now;
  const cut = inCutWindow(s);
  const fightIn = s.nextFightAt - now;
  const opp = f.tape.opp;
  const champ = isChampion(s);
  const r = s.record;

  const act = async (action: string) => {
    if (busy) return;
    setBusy(true);
    haptic.tap();
    try {
      const res = await api.action(action);
      if (res.fighter) setF(res.fighter);
      res.ok ? haptic.ok() : haptic.err();
      flash(res.message, !res.ok);
    } finally {
      setBusy(false);
    }
  };

  const status = s.activeFight
    ? '🥊 в клетке'
    : asleep
      ? `💤 спит ещё ${fmtIn(s.sleepingUntil! - now)}`
      : frozen
        ? `🩹 больничный ${fmtIn(s.frozenUntil! - now)}`
        : cut && !s.weight!.made
          ? `⚖️ +${s.weight!.over} кг`
          : null;

  return html`<div class="screen gym">
    <div class="topbar">
      <button class="chip" onClick=${() => go('shop')}>🎨 ${THEMES[s.theme].title}</button>
      <div class="row tight">
        <button class="icon" onClick=${() => go('history')} aria-label="История">📜</button>
        <button class="icon" onClick=${() => go('shop')} aria-label="Магазин">⭐</button>
      </div>
    </div>

    <section class="hero">
      <div class="portrait">
        <img src=${art(s.theme, `f${f.look}`)} alt="" class=${asleep ? 'sleeping' : ''} />
        ${status && html`<span class="status">${status}</span>`}
        ${champ && html`<img class="belt-badge" src=${art(s.theme, 'belt')} alt="Пояс" />`}
      </div>
      <div class="hero-info">
        <div class="kicker">${champ ? `Чемпион · защит: ${s.defenses}` : `Рейтинг ${f.rating}`}</div>
        <h1 class="name">${f.name}</h1>
        <div class="record"><b>${r.w}-${r.l}</b><span>${r.ko} KO · ${r.sub} SUB · ${r.dec} DEC</span></div>
        <div class="skills">
          <span title="Ударка">👊 ${Math.round(s.skills.striking)}</span>
          <span title="Борьба">🤼 ${Math.round(s.skills.grappling)}</span>
          <span title="Кардио">🫁 ${Math.round(s.skills.cardio)}</span>
          ${s.cosmetics.includes('gold_shorts') && html`<span title="Золотые шорты">🩳✨</span>`}
        </div>
      </div>
    </section>

    <section class="panel meters">
      <${Bar} label="Сытость" value=${s.satiety} />
      <${Bar} label="Энергия" value=${s.energy} />
      <${Bar} label="Форма" value=${s.form} />
    </section>

    ${cut &&
    html`<section class=${`panel weigh ${s.weight!.made ? 'made' : ''}`}>
      ${s.weight!.made
        ? html`<b>✅ Вес сделан</b><span>Теперь можно есть. В бою +бонус к рейтингу.</span>`
        : html`<b>⚖️ Взвешивание через ${fmtIn(fightIn)}</b><span>Лишние ${s.weight!.over} кг. Каждая сауна −1.5 кг, еда +0.5 кг. Не сделаешь вес — штраф и минус выносливость.</span>`}
    </section>`}

    <section class="actions">
      <button class="act" disabled=${busy || asleep} onClick=${() => act('feed')}><i>🍗</i><span>Еда</span></button>
      <button class="act" disabled=${busy || asleep} onClick=${() => act('train_striking')}><i>👊</i><span>Ударка</span></button>
      <button class="act" disabled=${busy || asleep} onClick=${() => act('train_grappling')}><i>🤼</i><span>Борьба</span></button>
      <button class="act" disabled=${busy || asleep} onClick=${() => act('train_cardio')}><i>🏃</i><span>Кардио</span></button>
      ${asleep
        ? html`<button class="act" disabled=${busy} onClick=${() => act('wake')}><i>⏰</i><span>Разбудить</span></button>`
        : html`<button class="act" disabled=${busy} onClick=${() => act('sleep')}><i>🛏️</i><span>Сон</span></button>`}
      <button class=${`act ${cut && !s.weight!.made ? 'hot' : ''}`} disabled=${busy || !cut || s.weight!.made || asleep} onClick=${() => act('cut')}><i>🧖</i><span>Сауна</span></button>
    </section>

    <section class="panel fightcard" onClick=${() => go('tape')}>
      <img class="opp-thumb" src=${art(s.theme, `o${opp.art}`)} alt="" />
      <div class="fc-body">
        <div class="kicker">${opp.defense ? 'Защита титула' : `Соперник ${Math.min(s.rank + 1, 8)}/8`} · ${STYLE_INFO[opp.style].title}</div>
        <b class="fc-name">${opp.name}</b>
        <div class="fc-meta">рейтинг ${f.tape.oppRating} vs твои ${f.rating}</div>
      </div>
      <div class="fc-cta">
        ${s.activeFight
          ? html`<span class="btn primary">В клетку</span>`
          : fightIn <= 0
            ? html`<span class="btn primary pulse">К бою</span>`
            : html`<span class="clock">${fmtClock(fightIn)}</span><small>до боя</small>`}
      </div>
    </section>

    <button class="panel arena-cta" onClick=${() => go('arena')}>
      <div><b>⚔️ Арена</b><span>Бои с бойцами других игроков · рейтинг ${s.elo}</span></div>
      <div class="arena-cta-r">${s.pvpUnseen > 0 ? html`<em class="badge">${s.pvpUnseen}</em>` : ''}<small>${f.pvpLeft}/3 сегодня</small></div>
    </button>

    ${s.freezes > 0 &&
    !frozen &&
    html`<button class="btn ghost wide" onClick=${() => act('freeze')}>🩹 Включить больничный (есть: ${s.freezes})</button>`}
  </div>`;
}
