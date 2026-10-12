import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TgUser {
  id: number;
  first_name?: string;
  username?: string;
  language_code?: string;
}

export interface InitData {
  user: TgUser;
  startParam: string | null;
  authDate: number;
}

/**
 * Проверка Telegram.WebApp.initData по HMAC.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * Никогда не доверяй initDataUnsafe с клиента — только этой функции.
 */
export function validateInitData(raw: string, botToken: string, maxAgeSec = 24 * 3600): InitData | null {
  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;
  const user = JSON.parse(userRaw) as TgUser;
  return { user, startParam: params.get('start_param'), authDate };
}
