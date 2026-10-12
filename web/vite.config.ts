import { defineConfig } from 'vite';

export default defineConfig({
  // Preact + htm: JSX не нужен, плагины не нужны
  server: {
    // для теста в Telegram пробрасывай порт через cloudflared/ngrok (нужен https)
    proxy: { '/api': 'http://localhost:3000' },
    allowedHosts: true,
  },
});
