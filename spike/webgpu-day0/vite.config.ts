import { defineConfig } from 'vite'

/**
 * Throwaway config for the day-0 probe.
 *
 * Binds loopback-only on purpose. Spec §2: `navigator.gpu` is exposed only in a
 * secure context, and a plain-HTTP LAN address such as http://192.168.0.50:5173
 * is not one -- so serving on 0.0.0.0 and browsing by IP would make WebGPU
 * unavailable before any other question could be asked. The dev loop is an SSH
 * tunnel from the Windows desktop, which makes the origin genuinely
 * trustworthy rather than flag-excepted:
 *
 *     ssh -L 5173:localhost:5173 nexus
 *     # then open http://localhost:5173 on Windows
 */
export default defineConfig({
  root: __dirname,
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
