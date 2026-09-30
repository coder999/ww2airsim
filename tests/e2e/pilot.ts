import type { Page } from '@playwright/test'
import type { StrafePass } from '../pilot/strafePilot.js'

export type PilotTrace = {
  readonly end: 'stopped' | 'impact' | 'timeout'
  readonly seconds: number
  /** One sample a second: phase, height above the ground, speed, sink. */
  readonly samples: readonly string[]
}

/**
 * Fly `pass` in the page (plan 2026-09-29-gunnery-range-strafing-pass): the
 * same pure pilot Tier 1 flies (`tests/pilot/strafePilot.ts`), imported from
 * the dev server, run every animation frame, and turned into real keyboard
 * events by `tests/pilot/keys.ts`. Frame-rate control in the page, rather
 * than a Node loop polling over the remote WebSocket, is what makes a
 * closed-loop pass repeatable: the old `hopAndLand` pressed keys on a 300 ms
 * poll and replaced a measured script that stopped working when T1 changed
 * the take-off (traced 2026-09-29: it porpoised into the sea).
 *
 * Gear and flap keys are toggles read on their rising edge from the set of
 * held keys the frame samples, so a toggle is held across one frame and
 * released on the next. Resolves when the airplane is at rest on its wheels,
 * has an impact, or `maxS` runs out, with every key released.
 */
export async function flyPass(page: Page, pass: StrafePass, maxS = 90): Promise<PilotTrace> {
  const trace = await page.evaluate(async ({ pass, maxS }) => {
    // `new Function`, not `import()`: Playwright transpiles this file, and the
    // browser, not Node, must resolve the dev server's module URL.
    const load = new Function('u', 'return import(u)') as (u: string) => Promise<Record<string, unknown>>
    const { strafePilot } = await load('/tests/pilot/strafePilot.ts') as { strafePilot: (...a: unknown[]) => { controls: Record<string, unknown>; phase: string } }
    const { keysFor } = await load('/tests/pilot/keys.ts') as { keysFor: (...a: unknown[]) => { held: string[]; toggles: string[] } }
    // At rest the way the game decides it (the landing report, and the debrief after it).
    const { LANDED_SPEED_MPS } = await load('/src/sim/landing.ts') as { LANDED_SPEED_MPS: number }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (window as any).__ww2
    const key = (type: 'keydown' | 'keyup', code: string): void => { window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true })) }
    const down = new Set<string>()
    let toggled: string[] = []
    let phase = 'cruise'
    const samples: string[] = []
    const t0 = performance.now()
    let lastSample = -1
    return await new Promise<{ end: 'stopped' | 'impact' | 'timeout'; seconds: number; samples: string[] }>((resolve) => {
      const finish = (end: 'stopped' | 'impact' | 'timeout'): void => {
        for (const c of [...down, ...toggled]) key('keyup', c)
        resolve({ end, seconds: (performance.now() - t0) / 1000, samples })
      }
      const tick = (): void => {
        const s = (performance.now() - t0) / 1000
        for (const c of toggled) key('keyup', c)
        toggled = []
        const flight = d.playerFlight()
        if (flight === null) { requestAnimationFrame(tick); return }
        const v = flight.state.velocity
        const speed = Math.hypot(v.x, v.y, v.z)
        const ground = d.groundHeightM()
        if (Math.floor(s) > lastSample) {
          lastSample = Math.floor(s)
          samples.push(`t${lastSample} ${phase} agl${ground === null ? '?' : (flight.state.position.y - ground).toFixed(1)} v${speed.toFixed(0)} vs${v.y.toFixed(1)}`)
        }
        if (d.impact() !== null) { finish('impact'); return }
        if (phase === 'land' && d.supportedContact() && speed < LANDED_SPEED_MPS) { finish('stopped'); return }
        if (s > maxS) { finish('timeout'); return }
        const cmd = strafePilot(flight.spec, flight.state, pass, phase)
        phase = cmd.phase
        const controls = d.controls()
        const k = keysFor(cmd.controls, controls, controls.gearDown === true, controls.flapDown === true)
        const want = new Set(k.held)
        for (const c of [...down]) if (!want.has(c)) { key('keyup', c); down.delete(c) }
        for (const c of want) if (!down.has(c)) { key('keydown', c); down.add(c) }
        for (const c of k.toggles) key('keydown', c)
        toggled = k.toggles
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  }, { pass, maxS })
  console.log(`pilot: ${trace.end} after ${trace.seconds.toFixed(1)} s\n  ${trace.samples.join('\n  ')}`)
  return trace
}
