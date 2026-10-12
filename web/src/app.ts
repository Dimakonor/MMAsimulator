import { useEffect, useState } from 'preact/hooks';
import { DAY, HOUR, type FightOutcome } from '@mma/shared';
import { api, type PublicFighter, type StepResp } from './api';
import { applyTheme, html } from './ui';
import { requestWriteAccess, setChrome } from './telegram';
import { store } from './storage';
import { Create } from './screens/create';
import { Gym } from './screens/gym';
import { Tape } from './screens/tape';
import { Fight } from './screens/fight';
import { Verdict } from './screens/verdict';
import { Shop } from './screens/shop';
import { History } from './screens/history';

export type Screen = 'gym' | 'tape' | 'fight' | 'verdict' | 'shop' | 'history';
export type Go = (s: Screen) => void;

const CHROME: Record<string, string> = { basement: '#101211', mountain: '#f3ead7', arena: '#07060b' };

export function App() {
  const [f, setF] = useState<PublicFighter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('gym');
  const [first, setFirst] = useState<StepResp | null>(null);
  const [outcome, setOutcome] = useState<FightOutcome | null>(null);
  const [toast, setToast] = useState<{ m: string; bad: boolean } | null>(null);

  const flash = (m: string, bad = false) => {
    setToast({ m, bad });
    setTimeout(() => setToast(null), 2400);
  };

  const refresh = async () => {
    const r = await api.session(false);
    setF(r.fighter);
  };

  useEffect(() => {
    (async () => {
      try {
        let wa = false;
        if (!api.demo && !store.get('wa_asked')) {
          wa = await requestWriteAccess();
          store.set('wa_asked', '1');
        }
        const r = await api.session(wa);
        setF(r.fighter);
        // незаконченный бой — сразу в клетку
        if (r.fighter?.state.activeFight) setScreen('fight');
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const t = f?.state.theme ?? document.documentElement.dataset.theme ?? 'basement';
    applyTheme(t as never);
    setChrome(CHROME[t] ?? '#000');
  }, [f?.state.theme]);

  useEffect(() => window.scrollTo(0, 0), [screen]);

  const go: Go = (s) => setScreen(s);

  let body;
  if (loading) body = html`<div class="center splash"><div class="loader"></div></div>`;
  else if (error) body = html`<div class="center splash">Не достучались до зала.<br /><small>${error}</small></div>`;
  else if (!f) body = html`<${Create} onDone=${(nf: PublicFighter) => (setF(nf), setScreen('gym'))} />`;
  else if (screen === 'tape') body = html`<${Tape} f=${f} go=${go} flash=${flash} onFight=${(r: StepResp) => (r.fighter && setF(r.fighter), setFirst(r), setScreen('fight'))} />`;
  else if (screen === 'fight')
    body = html`<${Fight}
      f=${f}
      first=${first}
      setF=${setF}
      onDone=${(o: FightOutcome) => (setOutcome(o), setFirst(null), setScreen('verdict'))}
    />`;
  else if (screen === 'verdict' && outcome) body = html`<${Verdict} f=${f} o=${outcome} onClose=${() => (setOutcome(null), refresh(), setScreen('gym'))} />`;
  else if (screen === 'shop') body = html`<${Shop} f=${f} setF=${setF} go=${go} flash=${flash} refresh=${refresh} />`;
  else if (screen === 'history') body = html`<${History} f=${f} go=${go} />`;
  else body = html`<${Gym} f=${f} setF=${setF} go=${go} flash=${flash} />`;

  return html`<div class="app">
    <div class="bg" aria-hidden="true"></div>
    ${body}
    ${toast && html`<div class=${`toast ${toast.bad ? 'bad' : ''}`}>${toast.m}</div>`}
    ${api.demo && html`<${DemoBar} f=${f} setF=${setF} />`}
  </div>`;
}

/** Только вне Telegram: машина времени, чтобы прогнать игру за минуту. */
function DemoBar({ f, setF }: { f: PublicFighter | null; setF: (f: PublicFighter | null) => void }) {
  const travel = async (ms: number) => setF((await api.travel!(ms)) ?? null);
  const toFight = () => f && travel(Math.max(0, f.state.nextFightAt - f.serverNow) + 1000);
  return html`<div class="demobar">
    <span>ДЕМО</span>
    <button onClick=${() => travel(3 * HOUR)}>+3ч</button>
    <button onClick=${() => travel(DAY)}>+1д</button>
    <button onClick=${toFight} disabled=${!f}>К бою</button>
    <button onClick=${() => (api.reset!(), location.reload())}>Сброс</button>
  </div>`;
}
