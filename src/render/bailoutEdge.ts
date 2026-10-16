/**
 * The browser-edge half of the bailout (plan F7A Tasks 6-7), pure so the Node suite drives it: the one place the
 * recovery environment is made (used by the key press, which RECORDS it, and by the pre-bailout cue, so the two cannot
 * disagree again), the seed, and the touchdown prediction behind the qualitative cue. None of it feeds the sim except
 * the environment and seed the press writes into the flight record.
 */
import { BAILOUT_TUNING, type BailoutTuning } from '../sim/bailoutTuning.js'
import { assessRecovery, bailoutSeed, type RecoveryCue, type RecoveryEnvironment } from '../sim/bailout.js'
import type { World } from '../sim/loop.js'
import { recoveryFactsAt } from '../sim/recovery.js'
import { v3, type Vec3 } from '../sim/math/vec3.js'
import type { GroundUnder } from '../sim/world/ground.js'
import { jumpPrompt } from './bailoutText.js'

export type EnvironmentInputs = { readonly sunElevationDeg: number; readonly cloudCoverages: readonly number[]; readonly beaufort: number }

/** Daylight from the sun (a little before sunrise still counts), visibility and weather from cloud cover, sea state from the Beaufort number. */
export function recoveryEnvironmentOf(i: EnvironmentInputs): RecoveryEnvironment {
  const cloudiness = i.cloudCoverages.reduce((sum, c) => sum + c, 0) / Math.max(1, i.cloudCoverages.length)
  return {
    daylight: Math.max(0, Math.min(1, (i.sunElevationDeg + 6) / 30)),
    visibility: Math.max(0, 1 - cloudiness * 0.6),
    weather: cloudiness,
    seaState: Math.max(0, Math.min(1, i.beaufort / 12)),
  }
}

/** The recorded seed, chosen at the key press. Replays read it from the flight record, never recompute it. */
export const pressSeed = bailoutSeed

const G = 9.80665

/**
 * Where the canopy would put the pilot down if the jump were made now: the fall during deployment, then the sink rate,
 * with the airframe's own horizontal speed bleeding off toward the wind at the canopy's settle rate. A prediction for a
 * qualitative cue only.
 */
export function predictedTouchdown(position: Vec3, velocity: Vec3, wind: Vec3 | null, aglM: number, t: BailoutTuning = BAILOUT_TUNING): Vec3 {
  const w = wind ?? v3(0, 0, 0)
  const fall = 0.5 * G * t.deploySeconds ** 2
  const seconds = t.deploySeconds + Math.max(0, aglM - fall) / t.sinkMps
  const k = t.canopyHorizontalRate
  const bleed = (1 - Math.exp(-k * Math.max(0, seconds - t.deploySeconds))) / k
  const open = Math.max(0, seconds - t.deploySeconds)
  return v3(
    position.x + velocity.x * t.deploySeconds + w.x * open + (velocity.x - w.x) * bleed,
    position.y,
    position.z + velocity.z * t.deploySeconds + w.z * open + (velocity.z - w.z) * bleed,
  )
}

export type BailoutCue = { readonly cue: RecoveryCue; readonly text: string }

const CUE_LABEL: Readonly<Record<RecoveryCue, string>> = { 'rescue-likely': 'RESCUE LIKELY', contested: 'CONTESTED', 'capture-likely': 'CAPTURE LIKELY' }

/**
 * The HUD line before a jump, or null when there is no ground to judge or the aircraft is below the refusal height.
 * Judged where the canopy would come down, in the SAME environment a press would record.
 */
export function bailoutCue<M>(
  world: World<M>,
  environment: RecoveryEnvironment,
  groundAt: (x: number, z: number) => GroundUnder | null,
  t: BailoutTuning = BAILOUT_TUNING,
): BailoutCue | null {
  const player = world.aircraft.find((a) => a.id === world.player)!
  const here = groundAt(player.state.position.x, player.state.position.z)
  if (here === null) return null
  const aglM = player.state.position.y - here.heightM
  if (aglM < t.minExitAglM) return null
  const down = predictedTouchdown(player.state.position, player.state.velocity, world.wind, aglM, t)
  const there = groundAt(down.x, down.z) ?? here
  const cue = assessRecovery(recoveryFactsAt(world, v3(down.x, there.heightM, down.z), there.surface, 0, environment)).cue
  return { cue, text: `${CUE_LABEL[cue]} · ${jumpPrompt(aglM, t)}` }
}
