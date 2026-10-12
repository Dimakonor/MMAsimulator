import { useEffect, useState } from 'preact/hooks';
import { TACTICS, type FightOutcome, type RoundResult, type Tactic } from '@mma/shared';
import { api, type PublicFighter, type StepResp } from '../api';
import { art, html } from '../ui';
import { haptic } from '../telegram';
import { TacticPicker } from './tape';

/**
 * Бой: раунд проигрывается построчно, между раундами — угол с одним решением.
 * Источник истины — сервер; здесь только подача.
 */
export function Fight({ f, first, onDone, setF }: { f: PublicFighter; first: StepResp | null; onDone: (o: FightOutcome) => void; setF: (f: PublicFighter) => void }) {
  const af = f.state.activeFight;
  // Если бой продолжается после перезахода — показываем уже сыгранные раунды
  const [rounds, setRounds] = useState<RoundResult[]>(first?.outcome ? first.outcome.rounds : af ? af.rounds : first?.round ? [first.round] : []);
  const [outcome, setOutcome] = useState<FightOutcome | null>(first?.outcome ?? null);
  const [shown, setShown] = useState(first ? 0 : 999);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<Tactic | null>(null);
  const [flashKo, setFlashKo] = useState(false);
  const opp = outcome?.opp ?? af?.opp ?? f.tape.opp;
  const pvpMode = !!opp.pvp;
  const theme = f.state.theme;

  const cur = rounds[rounds.length - 1];
  const lines = cur ? cur.events.length : 0;

  useEffect(() => {
    if (!cur || shown >= lines) return;
    const t = setTimeout(() => {
      const next = shown + 1;
      setShown(next);
      const line = cur.events[next - 1] ?? '';
      if (cur.finish && next === lines) {
        haptic.hit();
        setFlashKo(true);
        setTimeout(() => setFlashKo(false), 700);
      } else if (/НОКАУТ|СТУЧИТ|сдаётся/.test(line)) haptic.hit();
      else haptic.tap();
    }, shown === 0 ? 1100 : 950);
    return () => clearTimeout(t);
  }, [shown, cur, lines]);

  const next = async () => {
    if (!pick) return;
    setBusy(true);
    const r = pvpMode ? await api.pvp('next', pick) : await api.fight('next', pick);
    setBusy(false);
    if (r.fighter) setF(r.fighter);
    if (!r.ok || !r.round) return;
    setRounds((x) => [...x, r.round!]);
    if (r.outcome) setOutcome(r.outcome);
    setPick(null);
    setShown(0);
  };

  const pWon = rounds.filter((r) => r.winner === 'p').length;
  const oWon = rounds.filter((r) => r.winner === 'o').length;
  const revealDone = shown >= lines;
  const stam = cur ? [cur.pStamina, cur.oStamina] : [100, 100];

  return html`<div class=${`screen fight ${flashKo ? 'shake' : ''}`}>
    ${flashKo && html`<div class="ko-flash"></div>`}
    <header class="scoreboard">
      <div class="sb-side"><img src=${art(theme, `f${f.look}`)} alt="" /><b>${f.name}</b></div>
      <div class="sb-mid">
        <div class="sb-round">${cur ? `Р${cur.n}` : 'Р1'}</div>
        <div class="sb-dots">${[1, 2, 3].map((n) => {
          const r = rounds[n - 1];
          return html`<i class=${r ? (r.winner === 'p' ? 'p' : 'o') : ''}></i>`;
        })}</div>
        <small>${pWon}:${oWon}</small>
      </div>
      <div class="sb-side r"><img src=${art(theme, opp.portrait ?? `o${opp.art}`)} alt="" /><b>${opp.nick}</b></div>
    </header>

    <div class="stamina">
      <div class="st"><span>Дыхалка</span><div class="meter-track"><div class="meter-fill good" style=${{ width: `${stam[0]}%` }}></div></div></div>
      <div class="st r"><div class="meter-track"><div class="meter-fill bad" style=${{ width: `${stam[1]}%` }}></div></div><span>${opp.nick}</span></div>
    </div>

    ${cur &&
    html`<section class="round" key=${cur.n}>
      <div class="round-banner">РАУНД ${cur.n}</div>
      <div class="tac-line"><span>Ты: ${TACTICS[cur.pTactic].short}</span><span>${opp.nick}: ${TACTICS[cur.oTactic].short}</span></div>
      <div class="events">
        ${cur.events.slice(0, shown).map(
          (e, i) => html`<div class=${`ev ${cur.finish && i === lines - 1 ? 'finish' : ''} ${i === 0 && cur.edge !== 0 ? (cur.edge > 0 ? 'edge-good' : 'edge-bad') : ''}`}>${e}</div>`,
        )}
        ${!revealDone && html`<div class="ev typing"><i></i><i></i><i></i></div>`}
      </div>
      ${revealDone &&
      html`<div class="round-stats">
        <div><b>${cur.stats.strikes[0]}</b><span>удары</span><b>${cur.stats.strikes[1]}</b></div>
        <div><b>${cur.stats.td[0]}</b><span>тейкдауны</span><b>${cur.stats.td[1]}</b></div>
        <div><b>${cur.stats.kd[0]}</b><span>нокдауны</span><b>${cur.stats.kd[1]}</b></div>
        <div class="rs-win">${cur.finish ? 'Бой окончен' : cur.winner === 'p' ? 'Раунд твой' : `Раунд забирает ${opp.nick}`}</div>
      </div>`}
    </section>`}

    ${revealDone &&
    (outcome
      ? html`<button class="btn primary big wide" onClick=${() => onDone(outcome)}>${outcome.method === 'DEC' ? 'Слово судьям' : 'Итог'}</button>`
      : html`<section class="panel corner">
          <div class="kicker">Угол · перерыв 60 секунд</div>
          <p>${f.corner ?? ''}</p>
          <${TacticPicker} value=${pick} onPick=${setPick} />
          <button class="btn primary big wide" disabled=${!pick || busy} onClick=${next}>${pick ? `Раунд ${(cur?.n ?? 0) + 1}` : 'Что делаем?'}</button>
        </section>`)}
  </div>`;
}
