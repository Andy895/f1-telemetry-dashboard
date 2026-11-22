import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const server = `http://localhost:${process.env.PORT ?? 8787}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': server,
      '/ws': { target: server.replace('http', 'ws'), ws: true },
    },
  },
});
