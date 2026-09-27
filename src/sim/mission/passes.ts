import { ticksFor } from './state.js'

/** One approach to a deck (Mark, 2026-09-26: "no wave-offs" counts passes
 *  that miss). Open while the player is in the Paddles window; pending
 *  once he leaves it; resolved by a landing on that ship, or by
 *  PASS_RESOLVE_S without one. */
export type PassTracking = { readonly open: boolean; readonly exitTick: number | null }
export const NO_PASS: PassTracking = Object.freeze({ open: false, exitTick: null })
/** Measured 2026-09-26 (M3 Task 3 Step 1): a clean trap's window exit comes
 *  1.53 s before its landing report. Twice that bounds this from below.
 *  (`.superpowers/m3/pass-gap.ts`: carrierLanding.test.ts's autopilot
 *  approach, one window entry at tick 2507, one exit at 6941, the report at
 *  7033.) */
export const PASS_RESOLVE_S = 15
export const WAVE_OFF_MESSAGE = 'Paddles: wave-off — go around.'
export type PassEvent = 'trapped' | 'missed' | null

/** Pure. One tick of the pass: `inWindow` is `paddlesWindow` for the pass's
 *  ship, `landedHere` a landing report at that ship this tick. Returns `p`
 *  itself when nothing changed (M3-R4). */
export function nextPass(p: PassTracking, inWindow: boolean, landedHere: boolean, tick: number): { readonly pass: PassTracking; readonly event: PassEvent } {
  const live = p.open || p.exitTick !== null
  if (landedHere && live) return { pass: NO_PASS, event: 'trapped' }
  if (inWindow) return p.open && p.exitTick === null ? { pass: p, event: null } : { pass: { open: true, exitTick: null }, event: null }
  if (p.open) return { pass: { open: false, exitTick: tick }, event: null }
  if (p.exitTick !== null && tick - p.exitTick >= ticksFor(PASS_RESOLVE_S)) return { pass: NO_PASS, event: 'missed' }
  return { pass: p, event: null }
}
