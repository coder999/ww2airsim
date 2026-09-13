import { defineConfig } from 'vite'

/**
 * Loopback-only on purpose. `navigator.gpu` is exposed only in a secure
 * context, and a plain-HTTP LAN address is not one (master spec §2) -- so
 * serving on 0.0.0.0 and browsing by IP would make WebGPU unavailable before
 * anything else could be debugged. The dev loop is an SSH tunnel from the
 * Windows desktop:
 *
 *     ssh -L 5173:localhost:5173 nexus
 *     # then open http://localhost:5173 on Windows
 *
 * Verified working on the reference platform 2026-09-12 (day-0 spike).
 */
export default defineConfig({
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { target: 'esnext' },
})
