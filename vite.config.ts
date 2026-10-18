import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { lanAddresses } from './tools/start/lan.mjs';

/**
 * Serves `/__tide/lan` -> { ips: string[] } so the lobby can point phone QR
 * codes at the laptop's LAN address even when the arena is opened at localhost.
 */
function lanEndpoint(): Plugin {
  const handler = (_req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ ips: lanAddresses() }));
  };
  return {
    name: 'tide-lan',
    configureServer(server) {
      server.middlewares.use('/__tide/lan', handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/__tide/lan', handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), lanEndpoint()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true, // expose on LAN so phones on the hotspot can reach the dev server
    port: 5173,
    strictPort: true, // phones + `npm run wired` assume 5173
  },
  preview: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  // keep GLSL importable as raw strings
  assetsInclude: ['**/*.glsl'],
});
