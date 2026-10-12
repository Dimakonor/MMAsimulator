import type { FightOutcome } from '@mma/shared';
import type { PublicFighter } from '../api';
import { DECISION_TITLE, METHOD_TITLE, art, html } from '../ui';
import { share } from '../telegram';

export function Verdict({ f, o, onClose }: { f: PublicFighter; o: FightOutcome; onClose: () => void }) {
  const theme = f.state.theme;
  const sum = (k: 'strikes' | 'td' | 'kd', i: 0 | 1) => o.rounds.reduce((a, r) => a + r.stats[k][i], 0);
  const methodLine =
    o.method === 'DEC'
      ? `${o.won ? 'Победа' : 'Поражение'} ${DECISION_TITLE[o.decision ?? 'UD']?.toLowerCase()}`
      : `${METHOD_TITLE[o.method]} · раунд ${o.round}, ${o.time}`;
  const how = o.method === 'DEC' ? 'решение судей' : `${METHOD_TITLE[o.method].toLowerCase()}, ${o.round}-й раунд`;
  const shareText = o.won
    ? `🥊 ${f.name} vs «${o.opp.nick}»: ПОБЕДА (${how}). Рекорд ${o.record.w}-${o.record.l}.${o.becameChampion ? ' 🏆 НОВЫЙ ЧЕМПИОН!' : ''} Вырасти своего бойца:`
    : `🥊 ${f.name} vs «${o.opp.nick}»: поражение (${how}). Реванш будет. Вырасти своего бойца:`;

  return html`<div class="screen verdict">
    ${o.becameChampion &&
    html`<div class="confetti">${Array.from({ length: 36 }, (_, i) => html`<i style=${{ left: `${(i * 2.8) % 100}%`, animationDelay: `${(i % 9) * 0.18}s` }}></i>`)}</div>`}

    <div class=${`verdict-banner ${o.won ? 'win' : 'loss'}`}>
      <div class="kicker">${o.won ? 'Рефери поднимает руку' : 'Сегодня не твой день'}</div>
      <h1>${o.won ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}</h1>
      <div class="method">${methodLine}</div>
    </div>

    ${o.becameChampion &&
    html`<section class="panel belt">
      <img src=${art(theme, 'belt')} alt="Пояс чемпиона" />
      <h2>И НОВЫЙ ЧЕМПИОН!</h2>
      <p>Все темы открыты. Теперь к тебе придут за поясом.</p>
    </section>`}
    ${o.defended && html`<section class="panel belt"><img src=${art(theme, 'belt')} alt="" /><h2>Пояс остаётся у тебя</h2></section>`}

    ${o.scorecards &&
    html`<section class="panel cards">
      ${o.scorecards.map((c, i) => html`<div class="card"><span>Судья ${i + 1}</span><b>${c[0]}–${c[1]}</b></div>`)}
    </section>`}

    <section class="panel totals">
      <div><b>${sum('strikes', 0)}</b><span>значимые удары</span><b>${sum('strikes', 1)}</b></div>
      <div><b>${sum('td', 0)}</b><span>тейкдауны</span><b>${sum('td', 1)}</b></div>
      <div><b>${sum('kd', 0)}</b><span>нокдауны</span><b>${sum('kd', 1)}</b></div>
      <div class=${o.weightMade ? 'good' : 'bad'}>${o.weightMade ? '✅ Вес был сделан' : '❌ Промах с весом'}</div>
    </section>

    <div class="record big"><b>${o.record.w}-${o.record.l}</b><span>${o.record.ko} KO · ${o.record.sub} SUB · ${o.record.dec} DEC</span></div>

    <div class="row">
      <button class="btn ghost grow" onClick=${() => share(shareText)}>Поделиться</button>
      <button class="btn primary grow" onClick=${onClose}>В зал</button>
    </div>
  </div>`;
}
