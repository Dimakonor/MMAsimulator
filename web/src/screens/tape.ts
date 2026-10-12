import { useState } from 'preact/hooks';
import { STYLE_INFO, TACTICS, canFight, type Tactic } from '@mma/shared';
import { api, type PublicFighter, type StepResp } from '../api';
import { VsRow, art, html } from '../ui';
import { haptic } from '../telegram';
import type { Go } from '../app';

const TL: Tactic[] = ['pressure', 'counter', 'takedown'];

export function TacticPicker({ value, onPick, ratings }: { value: Tactic | null; onPick: (t: Tactic) => void; ratings?: Record<Tactic, number> }) {
  return html`<div class="tactics">
    ${TL.map(
      (t) => html`<button class=${`tactic ${value === t ? 'sel' : ''}`} onClick=${() => (haptic.tap(), onPick(t))}>
        <b>${TACTICS[t].title}</b>
        <span>бьёт «${TACTICS[TACTICS[t].beats].short}»</span>
        ${ratings && html`<em>${ratings[t]}</em>`}
      </button>`,
    )}
  </div>`;
}

export function Tape({ f, go, onFight, flash }: { f: PublicFighter; go: Go; onFight: (r: StepResp) => void; flash: (m: string, bad?: boolean) => void }) {
  const [plan, setPlan] = useState<Tactic | null>(null);
  const [busy, setBusy] = useState(false);
  const s = f.state;
  const t = f.tape;
  const style = STYLE_INFO[t.opp.style];
  const now = f.serverNow + 0;
  const chk = canFight(s, now);

  const start = async () => {
    if (!plan) return;
    setBusy(true);
    haptic.hit();
    const r = await api.fight('start', plan);
    setBusy(false);
    if (!r.ok) return flash(r.message ?? 'Не получилось', true);
    onFight(r);
  };

  return html`<div class="screen tape">
    <div class="topbar"><button class="icon" onClick=${() => go('gym')}>←</button><div class="tape-title">TALE OF THE TAPE</div><span></span></div>

    <section class="vs">
      <div class="vs-fighter me"><img src=${art(s.theme, `f${f.look}`)} alt="" /><b>${f.name}</b><small>${s.record.w}-${s.record.l}</small></div>
      <div class="vs-mark">VS</div>
      <div class="vs-fighter opp"><img src=${art(s.theme, `o${t.opp.art}`)} alt="" /><b>«${t.opp.nick}»</b><small>${style.title}</small></div>
    </section>

    <section class="panel tape-rows">
      <${VsRow} label="Рейтинг" a=${f.rating} b=${t.oppRating} />
      <${VsRow} label="Ударка" a=${t.me.striking} b=${t.oppSkills.striking} />
      <${VsRow} label="Борьба" a=${t.me.grappling} b=${t.oppSkills.grappling} />
      <${VsRow} label="Кардио" a=${t.me.cardio} b=${t.oppSkills.cardio} />
    </section>

    <blockquote class="quote">«${t.opp.quote}» <cite>— ${t.opp.name}</cite></blockquote>

    <section class="panel corner">
      <div class="kicker">Угол говорит</div>
      <p>${style.hint}</p>
      <p class=${t.weightMade ? 'good' : 'bad'}>${t.weightMade ? '✅ Вес сделан: +бонус к рейтингу' : '❌ Вес не сделан: штраф и минус выносливость'}</p>
    </section>

    <div class="kicker center">Гейм-план на первый раунд</div>
    <${TacticPicker} value=${plan} onPick=${setPlan} ratings=${t.myRatings} />

    ${chk.ok
      ? html`<button class="btn primary big wide" disabled=${!plan || busy} onClick=${start}>${plan ? 'Выйти в клетку' : 'Выбери гейм-план'}</button>`
      : html`<div class="pill center">${chk.reason}</div>`}
  </div>`;
}
