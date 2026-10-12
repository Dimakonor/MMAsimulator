import { useState } from 'preact/hooks';
import { THEMES, THEME_IDS, type ThemeId } from '@mma/shared';
import { api, type PublicFighter } from '../api';
import { applyTheme, art, html } from '../ui';
import { haptic } from '../telegram';

export function Create({ onDone }: { onDone: (f: PublicFighter) => void }) {
  const [step, setStep] = useState<'theme' | 'fighter'>('theme');
  const [theme, setTheme] = useState<ThemeId>('basement');
  const [look, setLook] = useState(0);
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pickTheme = (t: ThemeId) => {
    haptic.tap();
    setTheme(t);
    applyTheme(t);
  };

  const submit = async () => {
    setBusy(true);
    const r = await api.create(name, look, theme);
    setBusy(false);
    if (r.fighter) {
      haptic.ok();
      onDone(r.fighter);
    } else setErr(r.error ?? 'Ошибка');
  };

  if (step === 'theme') {
    return html`<div class="screen create">
      <div class="kicker">Шаг 1 из 2</div>
      <h1 class="title">Где начнётся легенда?</h1>
      <p class="muted">Одна тема — бесплатно навсегда. Остальные откроются за пояс чемпиона или за Stars.</p>
      <div class="theme-cards">
        ${THEME_IDS.map(
          (t) => html`<button class=${`theme-card ${t === theme ? 'sel' : ''}`} data-t=${t} onClick=${() => pickTheme(t)}>
            <img src=${art(t, 'bg')} alt="" loading="lazy" />
            <div class="theme-card-body">
              <b>${THEMES[t].title}</b>
              <span>${THEMES[t].tagline}</span>
            </div>
            ${t === theme && html`<i class="tick">✓</i>`}
          </button>`,
        )}
      </div>
      <button class="btn primary big" onClick=${() => setStep('fighter')}>Дальше</button>
    </div>`;
  }

  return html`<div class="screen create">
    <div class="kicker">Шаг 2 из 2 · ${THEMES[theme].title}</div>
    <h1 class="title">Твой боец</h1>
    <p class="muted">Ему 19, пришёл в зал с улицы. Через сутки — первый бой. Ты его тренер.</p>
    <div class="looks">
      ${[0, 1, 2].map(
        (i) => html`<button class=${`look ${i === look ? 'sel' : ''}`} onClick=${() => (haptic.tap(), setLook(i))}>
          <img src=${art(theme, `f${i}`)} alt="" />
        </button>`,
      )}
    </div>
    <input class="field" placeholder="Имя или прозвище" maxLength=${24} value=${name} onInput=${(e: Event) => setName((e.target as HTMLInputElement).value)} />
    ${err && html`<div class="err">${err}</div>`}
    <div class="row">
      <button class="btn ghost" onClick=${() => setStep('theme')}>Назад</button>
      <button class="btn primary big grow" disabled=${name.trim().length < 2 || busy} onClick=${submit}>Взять под крыло</button>
    </div>
  </div>`;
}
