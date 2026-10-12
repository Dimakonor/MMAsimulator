import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // для теста в Telegram пробрасывай порт через cloudflared/ngrok (нужен https)
    proxy: { '/api': 'http://localhost:3000' },
    allowedHosts: true,
  },
});
