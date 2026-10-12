import { useEffect, useState } from 'preact/hooks';
import { PVP, TACTICS, canPvp, eloDelta, oppFromCard, totalSkill, type PvpCard, type Tactic } from '@mma/shared';
import { api, type ArenaResp, type PublicFighter, type StepResp } from '../api';
import { VsRow, art, html } from '../ui';
import { haptic, share } from '../telegram';
import { TacticPicker } from './tape';
import type { Go } from '../app';

const TL: Tactic[] = ['pressure', 'counter', 'takedown'];

export function Arena({ f, setF, go, flash, onFight, focusId }: {
  f: PublicFighter;
  setF: (f: PublicFighter) => void;
  go: Go;
  flash: (m: string, bad?: boolean) => void;
  onFight: (r: StepResp) => void;
  focusId: number | null;
}) {
  const [a, setA] = useState<ArenaResp | null>(null);
  const [tab, setTab] = useState<'fight' | 'top' | 'log'>('fight');
  const [pick, setPick] = useState<PvpCard | null>(null);
  const s = f.state;

  const load = async (refresh = false) => {
    const r = await api.arena(refresh);
    setA(r);
    if (r.fighter) setF(r.fighter);
    if (r.newDefenses > 0) flash(`Пока тебя не было, тебя вызвали ${r.newDefenses} раз(а)`);
    if (focusId) setPick(r.offers.find((c) => c.id === focusId) ?? null);
  };
  useEffect(() => void load(), []);

  if (!a) return html`<div class="screen center splash"><div class="loader"></div></div>`;
  if (pick) return html`<${PvpTape} f=${f} card=${pick} back=${() => setPick(null)} flash=${flash} onFight=${onFight} />`;

  const plan = s.pvpPlan;
  const cyclePlan = async (i: number) => {
    haptic.tap();
    const next = [...plan];
    next[i] = TL[(TL.indexOf(plan[i]!) + 1) % 3]!;
    const r = await api.plan(next);
    if (r.fighter) setF(r.fighter);
  };

  const invite = () => share(`🥊 Вызываю тебя на арене MMA Simulator. Мой боец «${f.name}», рейтинг ${s.elo}. Выходи — посмотрим, кто кого:`, api.inviteLink(f.myId));

  return html`<div class="screen arena">
    <div class="topbar"><button class="icon" onClick=${() => go('gym')}>←</button><div class="tape-title">Арена</div><button class="icon" onClick=${invite} aria-label="Вызвать друга">📨</button></div>

    <section class="panel arena-head">
      <div><span class="kicker">Рейтинг</span><b class="elo">${s.elo}</b></div>
      <div><span class="kicker">Место</span><b>#${a.place}</b></div>
      <div><span class="kicker">Арена</span><b>${s.pvp.w}-${s.pvp.l}</b></div>
      <div><span class="kicker">Боёв сегодня</span><b>${f.pvpLeft}/${PVP.perDay}</b></div>
    </section>

    <div class="tabs">
      ${(['fight', 'top', 'log'] as const).map(
        (t) => html`<button class=${`tab ${tab === t ? 'sel' : ''}`} onClick=${() => setTab(t)}>${t === 'fight' ? 'Соперники' : t === 'top' ? 'Топ-50' : 'Мои бои'}</button>`,
      )}
    </div>

    ${tab === 'fight' &&
    html`
      <section class="panel plan">
        <div class="kicker">План защиты — так твой боец дерётся, когда вызывают тебя</div>
        <div class="plan-row">
          ${plan.map(
            (t, i) => html`<button class="plan-chip" onClick=${() => cyclePlan(i)}><small>Р${i + 1}</small><b>${TACTICS[t].short}</b></button>`,
          )}
        </div>
        <p class="muted small">Тапни раунд, чтобы сменить тактику. Предсказуемый план читают.</p>
      </section>

      <div class="offers">
        ${a.offers.map((c) => {
          const win = eloDelta(s.elo, c.elo, true);
          const lose = eloDelta(s.elo, c.elo, false);
          return html`<div class="panel offer">
            <img src=${art(s.theme, c.portrait)} alt="" />
            <div class="offer-body">
              <b>${c.name}</b>
              <small>${c.ghost ? '🤖 спарринг (ИИ)' : '👤 игрок'} · рейтинг ${c.elo} · ${c.record.w}-${c.record.l}</small>
              <small>сила ~${Math.round(totalSkill(c.skills) + c.cond)} · <span class="good">+${win}</span> / <span class="bad">${lose}</span></small>
            </div>
            <button class="btn small primary" onClick=${() => (haptic.tap(), setPick(c))}>Вызвать</button>
          </div>`;
        })}
      </div>
      <div class="row">
        <button class="btn ghost grow" onClick=${() => load(true)}>Обновить</button>
        <button class="btn primary grow" onClick=${invite}>Вызвать друга</button>
      </div>
    `}

    ${tab === 'top' &&
    html`<div class="lb">
      ${a.leaderboard.map(
        (r, i) => html`<div class=${`panel lb-row ${r.id === a.myId ? 'me' : ''}`}>
          <span class="lb-place">${i + 1}</span>
          <b>${r.name}${r.ghost ? ' 🤖' : ''}</b>
          <small>${r.w}-${r.l}</small>
          <em>${r.elo}</em>
        </div>`,
      )}
    </div>`}

    ${tab === 'log' &&
    html`<div class="hist">
      ${s.pvpHistory.length === 0 && html`<p class="muted center">Ещё ни одного боя на арене.</p>`}
      ${s.pvpHistory.map(
        (h) => html`<div class="panel hist-row">
          <span class=${`res ${h.won ? 'w' : 'l'}`}>${h.won ? 'W' : 'L'}</span>
          <img src=${art(s.theme, h.portrait)} alt="" />
          <div>
            <b>${h.attacked ? '⚔️ ' : '🛡️ '}${h.opp}</b>
            <small>${h.method} · Р${h.round} · <span class=${h.eloDelta >= 0 ? 'good' : 'bad'}>${h.eloDelta >= 0 ? '+' : ''}${h.eloDelta}</span> · ${h.attacked ? 'ты вызвал' : 'вызвали тебя'}</small>
          </div>
        </div>`,
      )}
    </div>`}
  </div>`;
}

function PvpTape({ f, card, back, flash, onFight }: { f: PublicFighter; card: PvpCard; back: () => void; flash: (m: string, bad?: boolean) => void; onFight: (r: StepResp) => void }) {
  const [plan, setPlan] = useState<Tactic | null>(null);
  const [busy, setBusy] = useState(false);
  const s = f.state;
  const opp = oppFromCard(card);
  const chk = canPvp(s, f.serverNow);
  const start = async () => {
    if (!plan) return;
    setBusy(true);
    haptic.hit();
    const r = await api.pvp('start', plan, card.id);
    setBusy(false);
    if (!r.ok) return flash(r.message ?? 'Не получилось', true);
    onFight(r);
  };
  return html`<div class="screen tape">
    <div class="topbar"><button class="icon" onClick=${back}>←</button><div class="tape-title">АРЕНА · ВЫЗОВ</div><span></span></div>
    <section class="vs">
      <div class="vs-fighter me"><img src=${art(s.theme, `f${f.look}`)} alt="" /><b>${f.name}</b><small>${s.elo}</small></div>
      <div class="vs-mark">VS</div>
      <div class="vs-fighter opp"><img src=${art(s.theme, card.portrait)} alt="" /><b>${card.name}</b><small>${card.elo}${card.ghost ? ' · ИИ' : ''}</small></div>
    </section>
    <section class="panel tape-rows">
      <${VsRow} label="Ударка" a=${s.skills.striking} b=${card.skills.striking} />
      <${VsRow} label="Борьба" a=${s.skills.grappling} b=${card.skills.grappling} />
      <${VsRow} label="Кардио" a=${s.skills.cardio} b=${card.skills.cardio} />
      <${VsRow} label="Форма" a=${f.rating - Math.round(totalSkill(s.skills))} b=${card.cond} />
    </section>
    <section class="panel corner">
      <div class="kicker">Угол говорит</div>
      <p>${card.ghost ? 'Спарринг-партнёр, но бьёт по-настоящему.' : 'Это живой игрок. Он заранее выбрал план на 3 раунда — читай его по ходу боя.'} По навыкам он ${opp.style === 'striker' ? 'ударник' : opp.style === 'wrestler' ? 'борец' : opp.style === 'grinder' ? 'грайндер' : 'универсал'}.</p>
    </section>
    <div class="kicker center">Гейм-план на первый раунд</div>
    <${TacticPicker} value=${plan} onPick=${setPlan} />
    ${chk.ok
      ? html`<button class="btn primary big wide" disabled=${!plan || busy} onClick=${start}>${plan ? 'В клетку' : 'Выбери гейм-план'}</button>`
      : html`<div class="pill center">${chk.reason}</div>`}
  </div>`;
}
