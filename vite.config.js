import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Vite rejects requests whose Host header it doesn't recognise, which otherwise blocks
    // any tunnel. The leading dot allows the domain and all its subdomains — Cloudflare
    // hands out a fresh random subdomain on every `cloudflared tunnel` run, so pinning one
    // exact hostname would break on the next start. Scoped to tunnel providers only, not
    // opened to everything.
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.io'],
    // The backend lives in server/ inside this Vite root, so its SQLite file (and the
    // -wal/-shm sidecars it rewrites on every insert) sit inside the watched tree.
    // Without this, submitting a checksheet touches the DB, Vite sees a "source" change,
    // and full-reloads the page — wiping React state mid-flow, which silently destroyed
    // the post-submit success screen. Backend code is watched by tsx, not Vite.
    watch: {
      ignored: ['**/server/data/**', '**/server/src/**', '**/*.db', '**/*.db-wal', '**/*.db-shm'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
