import { loadScenarioBundle } from '../../tools/content/load.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { playerAircraft } from '../../src/sim/loop.js'
import { nextLandingTracking, NO_LANDING, type LandingReport } from '../../src/sim/landing.js'
import type { TerrainField } from '../../src/sim/world/terrain.js'
import { initialFrameStateFor, nextFrameState, settleOnTerrain, type FrameState } from '../../src/render/frame.js'
import { strafePilot, type PilotPhase, type StrafePass } from './strafePilot.js'
import { keysFor } from './keys.js'

export type PassRun = {
  readonly frame: FrameState
  /** Seconds from the start at which the target was destroyed, or null. */
  readonly killS: number | null
  readonly landing: LandingReport | null
  readonly crashed: boolean
  readonly hits: number
}

const FRAME_S = 1 / 60

/**
 * Fly `pass` in `scenarioId` the way the browser does: the frame pipeline
 * (`initialFrameStateFor`, `settleOnTerrain`, `nextFrameState` with the
 * default assists), fed each frame the keys `keysFor` turns the pilot's
 * command into -- held axes, throttle, trigger and brakes, and a gear or flap
 * key on the one frame it has to toggle. Stops when the airplane has come to
 * rest (a landing report), has crashed, or `maxS` has run out.
 */
export function flyPass(scenarioId: string, targetId: string, pass: StrafePass, terrain: TerrainField, maxS = 90): PassRun {
  const bundle = loadScenarioBundle(scenarioId)
  let f = settleOnTerrain(initialFrameStateFor(worldFromScenario(bundle, terrain)), terrain)
  const airfields = Object.values(bundle.airfields)
  let phase: PilotPhase = 'cruise'
  let track = NO_LANDING
  let killS: number | null = null
  for (let i = 0; i * FRAME_S < maxS; i++) {
    const me = playerAircraft(f.world)
    const cmd = strafePilot(me.spec, me.state, pass, phase)
    phase = cmd.phase
    const k = keysFor(cmd.controls, me.controls, me.controls.gearDown === true, me.controls.flapDown === true)
    const before = me.state
    f = nextFrameState(f, FRAME_S, new Set([...k.held, ...k.toggles]))
    const after = playerAircraft(f.world)
    track = nextLandingTracking(after.spec, track, before, after.state, terrain, airfields)
    if (killS === null && f.world.combat.aircraft[targetId]!.damage.destroyedAt !== null) killS = i * FRAME_S
    if (after.impact !== null || track.report !== null) break
  }
  const me = playerAircraft(f.world)
  return { frame: f, killS, landing: track.report, crashed: me.impact !== null, hits: f.world.combat.aircraft[me.id]!.hits }
}
