import { expect } from 'vitest'
import { nextFrameState, type FrameState } from '../../../src/render/frame.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { withAircraftState } from '../../../src/sim/loop.js'
import { createState } from '../../../src/sim/flight/state.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { NORTH } from './fixture.js'

/** Frame-level landing helpers shared by the recovery-agreement and leg tests (moved out of recoveryAgreement.test.ts, F5C). */
export const GEAR_M = loadAircraftSpec('f6f-hellcat').gear.heightM
export const FRAME = 1 / 60
export const NO_KEYS: ReadonlySet<string> = new Set()

/** The player's body origin at (x, originY, z), north at `speed`, sinking at `sink`. */
export function put(f: FrameState, x: number, originY: number, z: number, speed: number, sink: number, gear: number): FrameState {
  return { ...f, world: withAircraftState(f.world, f.world.player, createState({
    position: v3(x, originY, z), velocity: v3(0, -sink, -speed), attitude: NORTH, gearFraction: gear, flapFraction: 1, tick: f.world.tick,
  })) }
}

export const frames = (f: FrameState, stop: (f: FrameState) => boolean): FrameState => {
  let g = f
  for (let i = 0; i < 120 && !stop(g); i++) g = nextFrameState(g, FRAME, NO_KEYS)
  return g
}

/** Latch airborne, settle from 0.4 m (wheels), come to rest: as measured 2026-09-25. */
export function land(f: FrameState, x: number, groundY: number, z: number): FrameState {
  let g = nextFrameState(put(f, x, groundY + GEAR_M + 50, z, 45, 0, 1), FRAME, NO_KEYS)
  g = frames(put(g, x, groundY + GEAR_M + 0.4, z, 30, 1, 1), (h) => h.landing.touchdown !== null)
  expect(g.landing.touchdown, 'no touchdown').not.toBeNull()
  g = nextFrameState(put(g, x, groundY + GEAR_M, z, 0, 0, 1), FRAME, NO_KEYS)
  expect(g.landing.report, 'no landing report').not.toBeNull()
  return g
}

