import { initialFrameStateFor, nextFrameState, type FrameState } from '../../src/render/frame.js'
import { worldFromScenario, type ScenarioBundle } from '../../src/sim/scenario.js'
import type { AircraftEntity, World } from '../../src/sim/loop.js'
import type { Loadout } from '../../src/sim/weapons/stores.js'
import type { PilotSkill } from '../../src/sim/ai/pilot.js'
import { MIN_ENGAGEMENT_RANGE_M } from '../../src/sim/ai/decision.js'
import { qRotate } from '../../src/sim/math/quat.js'
import { length, sub, v3 } from '../../src/sim/math/vec3.js'
// Type-only: tools/ never imports a test module at runtime.
import type { AircraftDiag } from '../../tests/e2e/pursuitGeometry.js'

/**
 * Tier 1 replicas of the Plan 7 Tier 2 specs (7c spec §1.1, §3.1). They drive
 * the production frame path -- `initialFrameStateFor`, then `nextFrameState(f,
 * 1/60, keys)` with default assists -- the path `main.ts` runs, headless.
 * Measured 2026-09-25: this reproduces the reference GPU's red
 * `ai-maneuver.spec.ts` run to the tick (the `both` loadout, player destroyed
 * at tick 517, 386 m). Every Tier 1 world is otherwise built `clean`; the
 * browser flies the title screen's DEFAULT_LOADOUT, `both`.
 */
export const LOADOUTS: readonly Loadout[] = ['clean', 'bombs', 'rockets', 'both']
/** Four noise cursors, the spec §3.1 set. */
export const CURSORS_4: readonly number[] = [0, 7919, 15838, 23757]
export const FRAME_S = 1 / 60

export type KeyScript = (tS: number) => ReadonlySet<string>
const NO_KEYS: ReadonlySet<string> = new Set()
export const passive: KeyScript = () => NO_KEYS

/** `bundle`'s world with the player's `loadout`, every pilot's noise cursor
 *  set to `cursor`, and every pilot's skill optionally replaced. */
export function replicaWorld(bundle: ScenarioBundle, loadout: Loadout, cursor: number, skill?: PilotSkill): World<undefined> {
  const w = worldFromScenario(bundle, null, loadout)
  return {
    ...w,
    aircraft: w.aircraft.map((a) => a.pilot == null ? a : {
      ...a,
      pilot: { ...a.pilot, skill: skill ?? a.pilot.skill, decision: { ...a.pilot.decision, noiseCursor: cursor } },
    }),
  }
}

export const aircraftOf = (f: FrameState, id: string): AircraftEntity<undefined> =>
  f.world.aircraft.find((a) => a.id === id)!
export const rangeBetween = (f: FrameState, a: string, b: string): number =>
  length(sub(aircraftOf(f, a).state.position, aircraftOf(f, b).state.position))
export const playerDestroyed = (f: FrameState): boolean =>
  f.world.combat.aircraft[f.world.player]!.damage.destroyedAt !== null

/** Frames of 1/60 s. `keys` is sampled at the END of each frame's time
 *  (frame i covers t = i/60), matching the probes this plan was measured
 *  with. `onFrame` returns true to stop. */
export function flyFrames(
  world: World<undefined>, keys: KeyScript, maxS: number,
  onFrame: (f: FrameState, frame: number) => boolean,
): FrameState {
  let f = initialFrameStateFor(world)
  const frames = Math.round(maxS / FRAME_S)
  for (let i = 1; i <= frames; i++) {
    f = nextFrameState(f, FRAME_S, keys(i * FRAME_S))
    if (onFrame(f, i)) break
  }
  return f
}

export type PassiveCloseRun = {
  readonly outcome: 'killed' | 'point-blank' | 'timeout'
  readonly tick: number
  readonly pursuerHits: number
}

/** The scripted evasion `ai-pursuit-difficulty.spec.ts` flies: roll left and
 *  pull for 4 s, reverse for 3 s, then hands off. */
export const EVASION: KeyScript = (t) =>
  t <= 4 ? new Set(['ArrowLeft', 'ArrowDown']) : t <= 7 ? new Set(['ArrowRight', 'ArrowDown']) : NO_KEYS

/** `window.__ww2.aircraft()`'s shape, with `headingRad` built the way
 *  `main.ts` builds it: `atan2(forward.x, -forward.z)`. */
export function diagOf(a: AircraftEntity<undefined>): AircraftDiag {
  const f = qRotate(a.state.attitude, v3(1, 0, 0))
  return { id: a.id, x: a.state.position.x, y: a.state.position.y, z: a.state.position.z, headingRad: Math.atan2(f.x, -f.z) }
}

/** Spec §1.2's instrument: a passive player, flown until the pursuer is inside
 *  MIN_ENGAGEMENT_RANGE_M, the player dies, or `maxS` runs out. */
export function passiveClose(world: World<undefined>, pursuerId: string, maxS = 60): PassiveCloseRun {
  const m: { outcome: PassiveCloseRun['outcome'] } = { outcome: 'timeout' }
  const f = flyFrames(world, passive, maxS, (fr) => {
    if (playerDestroyed(fr)) { m.outcome = 'killed'; return true }
    if (rangeBetween(fr, fr.world.player, pursuerId) < MIN_ENGAGEMENT_RANGE_M) { m.outcome = 'point-blank'; return true }
    return false
  })
  return { outcome: m.outcome, tick: f.world.tick, pursuerHits: f.world.combat.aircraft[pursuerId]!.hits }
}
