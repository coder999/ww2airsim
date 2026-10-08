/**
 * GA4 custom events (MASTER_PLAN J). `gtag` exists only where the build's tag
 * loaded it (vite.config.ts `gaTag`: production hosts only), so everywhere
 * else -- dev, tests, a local preview -- this is a no-op.
 */
type Gtag = (command: 'event', name: string, params: Record<string, string | number | boolean>) => void

export function track(name: string, params: Record<string, string | number | boolean> = {}): void {
  const gtag = (globalThis as { gtag?: Gtag }).gtag
  if (typeof gtag === 'function') gtag('event', name, params)
}
