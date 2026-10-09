import { createRng } from '../rng.js'
import type { Controls } from '../flight/state.js'

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

/** One mulberry32 draw plus its advanced cursor -- the same cursor-
 *  threading contract `src/sim/weapons/combat.ts`'s own `randomFrom` uses,
 *  kept as a separate cursor space so this system's draw count can never
 *  perturb combat's (master spec §3's replay guarantee). */
function randomFrom(cursor: number): { readonly value: number; readonly state: number } {
  return { value: createRng(cursor)(), state: (cursor + 0x6d2b79f5) >>> 0 }
}

/** A standard-normal sample via Box-Muller, consuming two cursor draws.
 *  `Math.max(u1.value, 1e-12)` keeps `Math.log` away from `-Infinity` on the
 *  (rare, possible) exact-zero mulberry32 draw. */
function normalFrom(cursor: number): { readonly value: number; readonly state: number } {
  const u1 = randomFrom(cursor)
  const u2 = randomFrom(u1.state)
  const r = Math.sqrt(-2 * Math.log(Math.max(u1.value, 1e-12)))
  return { value: r * Math.cos(2 * Math.PI * u2.value), state: u2.state }
}

/** E1: a pilot's aim error for one rescore, `sigmaRad` per axis. Read off
 *  `cursor` without advancing it (salted, so it is not the next control-noise
 *  draw), so drawing it never moves the control noise. */
export function aimErrorDraw(cursor: number, sigmaRad: number): { readonly right: number; readonly up: number } {
  const right = normalFrom((cursor ^ 0x5bd1e995) >>> 0)
  const up = normalFrom(right.state)
  return { right: right.value * sigmaRad, up: up.value * sigmaRad }
}

/**
 * Deterministic, skill-scaled jitter on roll/pitch/yaw only -- never
 * throttle, gear, flaps, brake or fire (design §2's "wobbly, imprecise hand
 * on the stick," not a different decision). Always consumes exactly three
 * normal samples (six cursor draws) regardless of `noiseStdDev`, so the
 * cursor's advance rate never depends on skill -- only the jitter's
 * magnitude does.
 */
export function applyControlNoise(
  controls: Controls,
  noiseStdDev: number,
  cursor: number,
): { readonly controls: Controls; readonly cursor: number } {
  const roll = normalFrom(cursor)
  const pitch = normalFrom(roll.state)
  const yaw = normalFrom(pitch.state)
  return {
    controls: {
      ...controls,
      roll: clamp(controls.roll + roll.value * noiseStdDev, -1, 1),
      pitch: clamp(controls.pitch + pitch.value * noiseStdDev, -1, 1),
      yaw: clamp(controls.yaw + yaw.value * noiseStdDev, -1, 1),
    },
    cursor: yaw.state,
  }
}
