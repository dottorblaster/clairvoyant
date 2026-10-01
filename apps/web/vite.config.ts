import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The SPA talks ONLY to apps/api. In dev everything is proxied so the OAuth
// session cookie stays same-origin from the browser's point of view.
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind IPv4 loopback explicitly. The atproto loopback OAuth redirect and its
    // session cookie are pinned to 127.0.0.1, so the SPA must be reachable there.
    // The default `host: 'localhost'` binds only ::1 on systems where localhost
    // resolves to IPv6, which refuses 127.0.0.1 connections.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/oauth': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
