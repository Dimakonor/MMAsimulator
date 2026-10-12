import type { PublicFighter } from '../api';
import { art, html } from '../ui';
import type { Go } from '../app';

export function History({ f, go }: { f: PublicFighter; go: Go }) {
  const s = f.state;
  return html`<div class="screen history">
    <div class="topbar"><button class="icon" onClick=${() => go('gym')}>←</button><div class="tape-title">Послужной список</div><span></span></div>
    <div class="record big"><b>${s.record.w}-${s.record.l}</b><span>${s.record.ko} KO · ${s.record.sub} SUB · ${s.record.dec} DEC</span></div>
    ${s.history.length === 0 && html`<p class="muted center">Боёв пока не было. Первый — скоро.</p>`}
    <div class="hist">
      ${s.history.map(
        (h) => html`<div class="panel hist-row">
          <span class=${`res ${h.won ? 'w' : 'l'}`}>${h.won ? 'W' : 'L'}</span>
          <img src=${art(s.theme, `o${h.art}`)} alt="" />
          <div><b>${h.opp}</b><small>${h.method} · Р${h.round} ${h.time} · ${new Date(h.at).toLocaleDateString('ru-RU')}</small></div>
        </div>`,
      )}
    </div>
  </div>`;
}
