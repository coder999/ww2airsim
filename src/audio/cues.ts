import type { ContactKind } from '../sim/contact.js'
import type { ClipId } from './assets.js'
import { engineGainFor, enginePlaybackRateFor } from './mix.js'

/**
 * Every "fire once" decision the audio system makes, as a pure function.
 *
 * The renderer calls this 60+ times a second with the same `World.impact`
 * object, because `src/sim/loop.ts` never overwrites an impact once it is set.
 * So "play the explosion" cannot be a reaction to a value being present -- it
 * has to be a reaction to an EDGE, and an edge needs memory. Keeping that
 * memory here, in a function with no clock, no `AudioContext` and no I/O,
 * is what makes the fire-once behaviour testable at all. Design §6.2.
 */

export type AudioInputs = {
  readonly throttle: number
  readonly engineRunning: boolean
  readonly impact: { readonly tick: number; readonly kind: ContactKind } | null
  /**
   * `null` means "no terrain yet", NOT "airborne".
   *
   * `onGround` needs a ground height, and the heightfield arrives seconds
   * after boot while the airplane sits parked on the Tacloban strip
   * (`DEFAULT_SPAWN_IS_GROUND`). Modelling that gap as `false` would make the
   * terrain's arrival a false -> true transition, and every flight would open
   * with a landing squeak before the pilot touched a key.
   */
  readonly onGround: boolean | null
}

export type AudioMemory = {
  readonly wasOnGround: boolean | null
  readonly firedImpactTick: number | null
}

export const NO_AUDIO_MEMORY: AudioMemory = { wasOnGround: null, firedImpactTick: null }

export type AudioFrame = {
  readonly memory: AudioMemory
  readonly cues: readonly ClipId[]
  readonly engine: { readonly gain: number; readonly playbackRate: number }
}

export function nextAudio(prev: AudioMemory, inputs: AudioInputs): AudioFrame {
  const cues: ClipId[] = []

  // Impact first, so a wreck that also touches down reads in the order the
  // events actually happened.
  let firedImpactTick = prev.firedImpactTick
  if (inputs.impact !== null && firedImpactTick !== inputs.impact.tick) {
    cues.push(inputs.impact.kind === 'ditched' ? 'water_crash' : 'explosion')
    firedImpactTick = inputs.impact.tick
  }

  // A transition needs two KNOWN values, so `null` on either side is not one.
  // Suppressed entirely once there is an impact: a wreck settling onto the
  // ground is not a landing, and squeaking over its own fireball would read
  // as a bug even though each rule fired correctly on its own.
  if (inputs.impact === null && prev.wasOnGround === false && inputs.onGround === true) {
    cues.push('landing_squeak')
  }

  return {
    memory: { wasOnGround: inputs.onGround, firedImpactTick },
    cues,
    // Silent on a dead engine whatever the throttle says. `main.ts` already
    // gates the propeller MESH on `world.impact === null` for the same
    // reason: an ungated spin leaves the propeller turning at full speed on a
    // wreck in its own fireball.
    engine: {
      gain: inputs.engineRunning ? engineGainFor(inputs.throttle) : 0,
      playbackRate: enginePlaybackRateFor(inputs.throttle),
    },
  }
}
