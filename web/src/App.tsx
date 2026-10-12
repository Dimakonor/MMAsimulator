import { useEffect, useState } from 'react';
import type { FightResult, ProductId } from '@mma/shared';
import { api, type Products, type PublicFighter } from './api';
import { haptic, openInvoice, requestWriteAccess } from './telegram';

const LOOKS = ['🧔🏻', '👨🏽‍🦲', '🧑🏼‍🦰'];

function fmtIn(ms: number) {
  if (ms <= 0) return 'сейчас';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
}

function Bar({ label, value }: { label: string; value: number }) {
  const tone = value < 25 ? 'bad' : value < 55 ? 'mid' : 'good';
  return (
    <div className="bar">
      <div className="bar-label">
        <span>{label}</span>
        <span>{Math.round(value)}</span>
      </div>
      <div className="bar-track">
        <div className={`bar-fill ${tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function App() {
  const [fighter, setFighter] = useState<PublicFighter | null>(null);
  const [products, setProducts] = useState<Products | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [fight, setFight] = useState<FightResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Просим право писать в личку один раз — без него бот не сможет напоминать.
        const asked = localStorage.getItem('wa_asked');
        let wa = false;
        if (!asked) {
          wa = await requestWriteAccess();
          localStorage.setItem('wa_asked', '1');
        }
        const r = await api.session(wa);
        setFighter(r.fighter);
        setProducts(r.products);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const act = async (action: string) => {
    if (busy) return;
    setBusy(true);
    haptic.tap();
    try {
      const r = await api.action(action);
      setFighter(r.fighter);
      r.ok ? haptic.ok() : haptic.err();
      flash(r.message);
    } finally {
      setBusy(false);
    }
  };

  const startFight = async () => {
    setBusy(true);
    try {
      const r = await api.fight();
      setFighter(r.fighter);
      if (r.ok && r.result) {
        setFight(r.result);
        r.result.won ? haptic.ok() : haptic.err();
      } else flash(r.message ?? 'Не получилось');
    } finally {
      setBusy(false);
    }
  };

  const buy = async (p: ProductId) => {
    api.event('shop_click', { product: p });
    const { link } = await api.invoice(p);
    const status = await openInvoice(link);
    if (status === 'paid') {
      haptic.ok();
      flash('Оплачено 💪');
      // successful_payment приходит боту асинхронно — перечитаем состояние чуть позже
      setTimeout(async () => setFighter((await api.session(false)).fighter), 1500);
    }
  };

  if (loading) return <div className="center">Загрузка…</div>;
  if (error) return <div className="center">Открой игру из Telegram.<br /><small>{error}</small></div>;
  if (!fighter) return <Create onDone={setFighter} />;

  if (fight) return <FightScreen result={fight} name={fighter.name} onClose={() => setFight(null)} />;

  const s = fighter.state;
  const now = Date.now();
  const asleep = s.sleepingUntil !== null && s.sleepingUntil > now;
  const fightIn = s.nextFightAt - now;
  const champion = !fighter.nextOpponent;
  // Продажи — не в первый день: сначала привязанность (порог крутится в A/B)
  const dayTwoPlus = now - s.createdAt > 20 * 3_600_000;

  return (
    <div className="app">
      <header>
        <div className="avatar">{LOOKS[fighter.look] ?? LOOKS[0]}{asleep && <span className="zzz">💤</span>}</div>
        <div>
          <h1>{fighter.name}</h1>
          <div className="muted">
            {s.wins}-{s.losses} · сила {fighter.power} {s.cosmetics.includes('gold_shorts') && '· 🩳✨'}
          </div>
        </div>
      </header>

      <section className="card">
        <Bar label="Сытость" value={s.satiety} />
        <Bar label="Энергия" value={s.energy} />
        <Bar label="Форма" value={s.form} />
        <div className="muted small">Навык: {s.skill}</div>
        {s.frozenUntil && s.frozenUntil > now && <div className="pill">🩹 Больничный ещё {fmtIn(s.frozenUntil - now)}</div>}
      </section>

      <section className="actions">
        <button disabled={busy || asleep} onClick={() => act('feed')}>🍗<span>Покормить</span></button>
        <button disabled={busy || asleep} onClick={() => act('train')}>🥊<span>Тренировка</span></button>
        {asleep ? (
          <button disabled={busy} onClick={() => act('wake')}>⏰<span>Разбудить</span></button>
        ) : (
          <button disabled={busy} onClick={() => act('sleep')}>🛏️<span>Спать</span></button>
        )}
      </section>

      <section className="card fight">
        {champion ? (
          <div>🏆 Ты чемпион. Защиты пояса — скоро.</div>
        ) : (
          <>
            <div className="muted small">Следующий соперник · {s.rank + 1}/{fighter.ladderSize}</div>
            <div className="opp">{fighter.nextOpponent!.name}</div>
            <div className="muted small">сила {fighter.nextOpponent!.power} против твоих {fighter.power}</div>
            {fightIn <= 0 ? (
              <button className="primary" disabled={busy || asleep} onClick={startFight}>Выйти в клетку</button>
            ) : (
              <div className="pill">Бой через {fmtIn(fightIn)}</div>
            )}
          </>
        )}
      </section>

      {products && dayTwoPlus && (
        <section className="card shop">
          <div className="muted small">Угол тренера</div>
          {s.freezes > 0 && (
            <button onClick={() => act('freeze')}>🩹 Включить больничный (есть: {s.freezes})</button>
          )}
          {!s.starterPackBought && (
            <button onClick={() => buy('starter_pack')}>
              {products.starter_pack.title} — ⭐ {products.starter_pack.stars}
            </button>
          )}
          <button onClick={() => buy('freeze')}>
            {products.freeze.title} — ⭐ {products.freeze.stars}
          </button>
        </section>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Create({ onDone }: { onDone: (f: PublicFighter) => void }) {
  const [name, setName] = useState('');
  const [look, setLook] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    try {
      const r = await api.create(name, look);
      haptic.ok();
      onDone(r.fighter);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <div className="app create">
      <h1>Твой боец</h1>
      <p className="muted">Ему 19, он пришёл в зал с улицы. Через 24 часа — первый бой. Ты его тренер.</p>
      <div className="looks">
        {LOOKS.map((l, i) => (
          <button key={i} className={i === look ? 'sel' : ''} onClick={() => setLook(i)}>{l}</button>
        ))}
      </div>
      <input placeholder="Имя или прозвище" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
      {err && <div className="err">{err}</div>}
      <button className="primary" disabled={name.trim().length < 2} onClick={submit}>Взять под крыло</button>
    </div>
  );
}

function FightScreen({ result, name, onClose }: { result: FightResult; name: string; onClose: () => void }) {
  const [shown, setShown] = useState(0);
  const total = result.rounds.reduce((n, r) => n + r.length, 0);
  useEffect(() => {
    if (shown >= total) return;
    const t = setTimeout(() => setShown((x) => x + 1), 900);
    return () => clearTimeout(t);
  }, [shown, total]);

  let i = 0;
  return (
    <div className="app fightscreen">
      <h2>{name} vs {result.opponent}</h2>
      {result.rounds.map((r, ri) => (
        <div key={ri} className="round">
          <div className="muted small">Раунд {ri + 1}</div>
          {r.map((e) => {
            const idx = i++;
            return idx < shown ? <div key={idx} className="ev">{e}</div> : null;
          })}
        </div>
      ))}
      {shown >= total && (
        <div className={`verdict ${result.won ? 'win' : 'loss'}`}>
          <div>{result.won ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}</div>
          <div className="small">{result.finish}</div>
          <button className="primary" onClick={onClose}>В зал</button>
        </div>
      )}
    </div>
  );
}
