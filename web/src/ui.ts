import { h } from 'preact';
import htm from 'htm';
import { THEMES, type ThemeId } from '@mma/shared';

/** JSX без сборщика: html`<div class=${x}>…</div>` */
export const html = htm.bind(h);

// База для картинок: в проде — /art/, в превью можно подменить через window.__ART_BASE__
const ART_BASE: string = (globalThis as { __ART_BASE__?: string }).__ART_BASE__ ?? './art/';
export const art = (theme: ThemeId, name: string) => `${ART_BASE}${THEMES[theme].art}_${name}.webp`;

export function applyTheme(theme: ThemeId) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.setProperty('--bg-url', `url("${art(theme, 'bg')}")`);
}

export function fmtIn(ms: number) {
  if (ms <= 0) return 'сейчас';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d > 0) return `${d} д ${h} ч`;
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
}

export function fmtClock(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(t / 3600)).padStart(2, '0');
  const mm = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
  const ss = String(t % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function Bar({ label, value, max = 100, hint }: { label: string; value: number; max?: number; hint?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const tone = pct < 25 ? 'bad' : pct < 55 ? 'mid' : 'good';
  return html`<div class="meter">
    <div class="meter-label"><span>${label}</span><b>${Math.round(value)}${hint ? html` <i>${hint}</i>` : ''}</b></div>
    <div class="meter-track"><div class=${`meter-fill ${tone}`} style=${{ width: `${pct}%` }}></div></div>
  </div>`;
}

/** Зеркальная полоса для Tale of the Tape: слева игрок, справа соперник. */
export function VsRow({ label, a, b }: { label: string; a: number; b: number }) {
  const max = Math.max(a, b, 1);
  return html`<div class="vsrow">
    <div class="vs-side l"><b class=${a >= b ? 'lead' : ''}>${Math.round(a)}</b><div class="vs-bar"><i style=${{ width: `${(a / max) * 100}%` }}></i></div></div>
    <div class="vs-label">${label}</div>
    <div class="vs-side r"><div class="vs-bar"><i style=${{ width: `${(b / max) * 100}%` }}></i></div><b class=${b > a ? 'lead' : ''}>${Math.round(b)}</b></div>
  </div>`;
}

export const METHOD_TITLE: Record<string, string> = {
  KO: 'НОКАУТ',
  TKO: 'ТЕХНИЧЕСКИЙ НОКАУТ',
  SUB: 'САБМИШН',
  DEC: 'РЕШЕНИЕ СУДЕЙ',
};
export const DECISION_TITLE: Record<string, string> = {
  UD: 'ЕДИНОГЛАСНЫМ РЕШЕНИЕМ',
  SD: 'РАЗДЕЛЬНЫМ РЕШЕНИЕМ',
  MD: 'РЕШЕНИЕМ БОЛЬШИНСТВА',
};
