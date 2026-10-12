// Тонкая обёртка над window.Telegram.WebApp с безопасными фолбэками
// (вне Telegram, в браузере для разработки).

type Haptic = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';

interface TgWebApp {
  initData: string;
  version: string;
  platform: string;
  ready(): void;
  expand(): void;
  isVersionAtLeast(v: string): boolean;
  disableVerticalSwipes?(): void;
  requestWriteAccess?(cb: (granted: boolean) => void): void;
  openInvoice?(url: string, cb: (status: 'paid' | 'cancelled' | 'failed' | 'pending') => void): void;
  HapticFeedback?: {
    impactOccurred(s: Haptic): void;
    notificationOccurred(t: 'error' | 'success' | 'warning'): void;
  };
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TgWebApp };
  }
}

export const tg: TgWebApp | undefined = window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : undefined;

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  // iOS: иначе свайп вниз сворачивает приложение посреди тапов (Bot API 7.7+)
  if (tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes?.();
  if (tg.isVersionAtLeast('6.1')) {
    tg.setHeaderColor?.('#0d0d0f');
    tg.setBackgroundColor?.('#0d0d0f');
  }
}

export const haptic = {
  tap: () => tg?.HapticFeedback?.impactOccurred('light'),
  ok: () => tg?.HapticFeedback?.notificationOccurred('success'),
  err: () => tg?.HapticFeedback?.notificationOccurred('error'),
};

/** Разрешение боту писать в личку. Нужно, если игра открыта по прямой ссылке без /start. */
export function requestWriteAccess(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!tg?.requestWriteAccess || !tg.isVersionAtLeast('6.9')) return resolve(false);
    tg.requestWriteAccess((granted) => resolve(granted));
  });
}

export function openInvoice(link: string): Promise<string> {
  return new Promise((resolve) => {
    if (!tg?.openInvoice) return resolve('failed');
    tg.openInvoice(link, (status) => resolve(status));
  });
}
