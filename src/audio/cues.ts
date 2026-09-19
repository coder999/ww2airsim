import type { ContactKind, ContactSurface } from '../sim/contact.js'
import type { ClipId } from './assets.js'
import { engineGainFor, enginePlaybackRateFor } from './mix.js'

/**
 * Every "fire once" decision the audio system makes, as a pure function.
 *
 * The renderer calls this 60+ times a second with the same `Impact` object
 * (the player aircraft entity's, `src/sim/loop.ts`), because that entity's
 * impact is never overwritten once it is set.
 * So "play the explosion" cannot be a reaction to a value being present -- it
 * has to be a reaction to an EDGE, and an edge needs memory. Keeping that
 * memory here, in a function with no clock, no audio device and no I/O,
 * is what makes the fire-once behaviour testable at all. Design §6.2.
 */

export type AudioInputs = {
  readonly throttle: number
  readonly engineRunning: boolean
  readonly impact: {
    readonly tick: number
    readonly kind: ContactKind
    /** Which cue fires. `kind` does NOT decide it: `contactOutcome` returns
     *  'destroyed' for a hard arrival on water as readily as on land
     *  (src/sim/contact.ts:69), so keying on `kind` played an EXPLOSION for a
     *  crash into the sea (heard 2026-09-18). */
    readonly surface: ContactSurface
  } | null
  /**
   * `null` means "no terrain yet", NOT "airborne".
   *
   * `onGround` needs a ground height, and the heightfield arrives seconds
   * after boot while the airplane sits parked on the Tacloban strip (a
   * ground spawn, `FrameState.groundSpawn`). Modelling that gap as `false`
   * would make the terrain's arrival a false -> true transition, and every
   * flight would open with a landing squeak before the pilot touched a key.
   */
  readonly onGround: boolean | null
  /** What is under the airplane, or `null` when there is no ground at all --
   *  no terrain field and no deck here, which is `groundUnder` returning
   *  `null` (src/render/audio.ts), not "no terrain" as such: a deck-parked
   *  airplane has ground from tick 0. Wheels do not squeak on the sea, and
   *  `onGround` alone cannot say so: the height over open water is
   *  SEA_LEVEL_M, so `onGround` goes true the moment the airplane reaches the
   *  surface -- one or more frames BEFORE `advance` registers the impact.
   *  Suppressing on `impact !== null` therefore missed it, which is the
   *  squeak Mark heard on every ditching. */
  readonly groundSurface: ContactSurface | null
  /** The simulation tick. Only ever compared with the previous one, to notice
   *  that it moved BACKWARDS -- see `nextAudio`. */
  readonly tick: number
}

export type AudioMemory = {
  readonly wasOnGround: boolean | null
  readonly firedImpactTick: number | null
  readonly lastTick: number
}

export const NO_AUDIO_MEMORY: AudioMemory = { wasOnGround: null, firedImpactTick: null, lastTick: 0 }

export type AudioFrame = {
  readonly memory: AudioMemory
  readonly cues: readonly ClipId[]
  readonly engine: { readonly gain: number; readonly playbackRate: number }
}

export function nextAudio(prev: AudioMemory, inputs: AudioInputs): AudioFrame {
  const cues: ClipId[] = []

  // Restart rebuilds the frame from `initialFrameState` with the boot aircraft
  // (main.ts's debrief callback), so the tick moves BACKWARDS. That is a new
  // flight, not something that happened during one: carrying the old flight's
  // ground state across it makes a parked spawn read as a touchdown, and
  // carrying its fired-impact tick would silence the new flight's own crash if
  // it happened at a tick the old one had already used.
  const restarted = inputs.tick < prev.lastTick
  const wasOnGround = restarted ? null : prev.wasOnGround

  // Impact first, so a wreck that also touches down reads in the order the
  // events actually happened.
  let firedImpactTick = restarted ? null : prev.firedImpactTick
  if (inputs.impact !== null && firedImpactTick !== inputs.impact.tick) {
    cues.push(inputs.impact.surface === 'water' ? 'water_crash' : 'explosion')
    firedImpactTick = inputs.impact.tick
  }

  // A transition needs two KNOWN values, so `null` on either side is not one.
  // Suppressed entirely once there is an impact: a wreck settling onto the
  // ground is not a landing, and squeaking over its own fireball would read
  // as a bug even though each rule fired correctly on its own.
  if (
    inputs.impact === null
    // Land OR a deck: both carry wheels, and only water does not (Plan 8
    // review, item 3 -- `ContactSurface` gained 'deck' in Plan 8's Task 2 and
    // this condition kept silencing every trap).
    && (inputs.groundSurface === 'land' || inputs.groundSurface === 'deck')
    && wasOnGround === false
    && inputs.onGround === true
  ) {
    cues.push('landing_squeak')
  }

  return {
    memory: { wasOnGround: inputs.onGround, firedImpactTick, lastTick: inputs.tick },
    cues,
    // Silent on a dead engine whatever the throttle says. `main.ts` already
    // gates the propeller MESH on the player's `impact === null` for the same
    // reason: an ungated spin leaves the propeller turning at full speed on a
    // wreck in its own fireball.
    engine: {
      gain: inputs.engineRunning ? engineGainFor(inputs.throttle) : 0,
      playbackRate: enginePlaybackRateFor(inputs.throttle),
    },
  }
}
