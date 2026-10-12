function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const env = {
  BOT_TOKEN: req('BOT_TOKEN'),
  DATABASE_URL: req('DATABASE_URL'),
  // Публичный https-адрес сервера. Если пусто — бот работает через long polling (локальная разработка).
  PUBLIC_URL: process.env.PUBLIC_URL ?? '',
  // URL Mini App (обычно = PUBLIC_URL). Используется в web_app-кнопках бота.
  WEBAPP_URL: process.env.WEBAPP_URL ?? process.env.PUBLIC_URL ?? '',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET ?? '',
  PORT: Number(process.env.PORT ?? 3000),
  // В dev можно отключить проверку initData и подставлять фиктивного юзера
  DEV_AUTH_BYPASS: process.env.DEV_AUTH_BYPASS === '1',
};
