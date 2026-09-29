import type { ContactKind, ContactSurface } from '../sim/contact.js'
import type { ClipId } from './assets.js'
import {
  ENGINE_FAILING_HEALTH, engineGainFor, engineHealthFactor, enginePlaybackRateFor, seaGainFor, type EngineFamily,
} from './mix.js'

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
  /** Height of the lowest wheel above the surface under the airplane, metres;
   *  `null` when there is no ground. Feeds the airborne latch for the
   *  touchdown squeak (`TOUCHDOWN_AIRBORNE_HEIGHT_M`). */
  readonly heightM: number | null
  /** Sink rate relative to the surface, m/s, positive DOWN (negative while
   *  climbing). Read one frame BEFORE contact, because the ground constraint
   *  zeroes the sink on the very tick that contact registers. */
  readonly sinkMps: number
  /** The simulation tick. Only ever compared with the previous one, to notice
   *  that it moved BACKWARDS -- see `nextAudio`. */
  readonly tick: number
  /**
   * The player's cumulative shot count (`World.combat`, Plan 6). Gun audio
   * follows THIS number rising, never the trigger: a held Space over empty
   * or shot-away guns emits no rounds, so it makes no noise, and a paused or
   * repeatedly-rendered frame leaves the count flat, so it replays nothing.
   */
  readonly shots: number
  /**
   * The player's cumulative bomb/rocket release counts (`World.combat`,
   * Plan 6b Task 6/10). Like `shots`, these follow a count that only ever
   * RISES -- never `stores`, which falls as ordnance leaves the racks/rails
   * and would read a release cue backwards.
   */
  readonly bombsDropped: number
  readonly rocketsFired: number
  /** Which engine recording the player's aircraft uses. */
  readonly engineFamily: EngineFamily
  /** The player's `Damage.structure` and `Damage.engine`, 1 = whole. A hit is
   *  `structure` FALLING; a failing engine is `engine` crossing
   *  `ENGINE_FAILING_HEALTH` downward. */
  readonly structure: number
  readonly engineHealth: number
  /** The pendant is on the hook (`AircraftState.arrested`). */
  readonly arrested: boolean
  /** The hook lever (`Controls.hookDown`). */
  readonly hookDown: boolean
  /** Horizontal distance to the nearest carrier deck edge, metres (0 on it);
   *  `null` when there is no carrier. */
  /** The newest bomb or rocket detonation near the player (any owner, any target), or `null`.
   *  Not positional yet: it plays at full level whatever the distance within range. */
  readonly ordnanceBlast: { readonly tick: number; readonly surface: string } | null
}

export type AudioMemory = {
  readonly wasOnGround: boolean | null
  readonly firedImpactTick: number | null
  readonly lastTick: number
  /** The shot count last seen, so a rise is an edge (Plan 6). */
  readonly lastShots: number
  /** The tick before which no further gun cue is due: a burst clip already
   *  covers the interval. 0 means one may fire on the next rising count. */
  readonly gunCueUntilTick: number
  /** The bomb/rocket counts last seen (Plan 6b Task 10), so each cue is its
   *  own rising edge with no interval gate -- a release is already
   *  edge-triggered once per key-down at the sim level. */
  readonly lastBombsDropped: number
  readonly lastRocketsFired: number
  /** The tick the airplane first got above `TOUCHDOWN_AIRBORNE_HEIGHT_M` in
   *  its current stretch of flight, or `null` while it is not above it. */
  readonly airborneSinceTick: number | null
  /** True once the airplane has held `TOUCHDOWN_AIRBORNE_HEIGHT_M` for
   *  `TOUCHDOWN_AIRBORNE_TICKS`; cleared by the first contact after it. */
  readonly airborneLatched: boolean
  /** `sinkMps` of the previous frame. */
  readonly lastSinkMps: number
  readonly lastStructure: number
  /** The tick before which no further hit cue is due (a burst lands many rounds in a few ticks). */
  readonly hitCueUntilTick: number
  readonly engineFailed: boolean
  readonly lastArrested: boolean
  readonly lastHookDown: boolean
}

export const NO_AUDIO_MEMORY: AudioMemory = {
  wasOnGround: null, firedImpactTick: null, lastTick: 0, lastShots: 0, gunCueUntilTick: 0,
  lastBombsDropped: 0, lastRocketsFired: 0, airborneSinceTick: null, airborneLatched: false, lastSinkMps: 0,
  lastStructure: 1, hitCueUntilTick: 0, engineFailed: false, lastArrested: false, lastHookDown: false,
}

/**
 * The touchdown squeak is for a real touchdown only (Mark, 2026-09-28: it
 * played during a plain take-off, and he asked for it silenced for that
 * purpose or for tail-wheel contact). `onGround` is a +/-0.25 m position band,
 * so a take-off that climbs slowly through it, or any rolling-contact chatter,
 * is a false -> true edge with no touchdown behind it. Three gates, none of
 * them per-wheel because the simulation has no per-wheel contact event:
 * the airplane held more than a metre of wheel height for half a second
 * (a take-off climbs through that and never comes back down; a hop does not
 * reach it), it arrived with a real sink rate, and the latch is spent by the
 * first contact so chatter after a touchdown cannot repeat it. On a taildragger
 * the mains are the front wheels, and a flown arrival contacts them first.
 */
export const TOUCHDOWN_AIRBORNE_HEIGHT_M = 1
export const TOUCHDOWN_AIRBORNE_TICKS = 30
export const TOUCHDOWN_MIN_SINK_MPS = 0.3

/**
 * How many ticks one `machinegun` cue covers before another may fire while
 * the count keeps rising. `content/audio/machinegun.wav` is 1.30 s (250,370
 * bytes of 48 kHz stereo 16-bit PCM, read off the header 2026-09-19), so 72
 * ticks (1.2 s at `DT`) re-cues just before the clip runs out: continuous
 * fire overlaps the tail rather than gapping, and a one-frame tap costs one
 * clip rather than one clip per round -- six guns at 800 rpm are 80 rounds a
 * second, and 80 overlapping one-shots would be noise, not gunfire.
 */
export const GUN_CUE_INTERVAL_TICKS = 72

/** One detonation cue per this many ticks, so a rocket salvo or bomb stick is one rumble. */
/** Damage landing this soon after a detonation is the blast's, not a round's. */
export const BLAST_DAMAGE_WINDOW_TICKS = 2
/** Detonations farther than this from the player are not cued (no positional audio yet). */
export const BLAST_AUDIBLE_M = 1500

/** `hit_taken.wav` is 1.5 s; a burst that lands a dozen rounds in a few ticks is one cue, not a dozen. */
export const HIT_CUE_INTERVAL_TICKS = 30

export type AudioFrame = {
  readonly memory: AudioMemory
  readonly cues: readonly ClipId[]
  readonly engine: { readonly gain: number; readonly playbackRate: number }
  /** Which engine layer to drive (`ENGINE_LAYER_FOR`). */
  readonly engineFamily: EngineFamily
  /** Continuous ambience gains, 0 = silent. */
  readonly ambient: { readonly sea: number }
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
  // The airborne latch (see `TOUCHDOWN_AIRBORNE_HEIGHT_M`), advanced every
  // frame and read from the PREVIOUS value below, so a contact frame cannot
  // arm and spend it in one go.
  const airborneLatchedBefore = restarted ? false : prev.airborneLatched
  const lastSinkMps = restarted ? 0 : prev.lastSinkMps
  let airborneSinceTick = restarted ? null : prev.airborneSinceTick
  let airborneLatched = airborneLatchedBefore
  if (inputs.heightM !== null && inputs.heightM > TOUCHDOWN_AIRBORNE_HEIGHT_M) {
    airborneSinceTick = airborneSinceTick ?? inputs.tick
    if (inputs.tick - airborneSinceTick >= TOUCHDOWN_AIRBORNE_TICKS) airborneLatched = true
  } else {
    airborneSinceTick = null
  }
  if (inputs.onGround === true) airborneLatched = false

  if (
    inputs.impact === null
    // Land OR a deck: both carry wheels, and only water does not (Plan 8
    // review, item 3 -- `ContactSurface` gained 'deck' in Plan 8's Task 2 and
    // this condition kept silencing every trap).
    && (inputs.groundSurface === 'land' || inputs.groundSurface === 'deck')
    && wasOnGround === false
    && inputs.onGround === true
    && airborneLatchedBefore
    && lastSinkMps >= TOUCHDOWN_MIN_SINK_MPS
  ) {
    cues.push('landing_squeak')
  }

  // Gunfire (Plan 6). An edge on the SHOT COUNT, rate-limited by tick so the
  // clip is re-cued at most once per `GUN_CUE_INTERVAL_TICKS` while rounds
  // keep leaving the guns. A restart zeroes both memories along with the
  // count itself, so the new flight's first burst is heard.
  const lastShots = restarted ? 0 : prev.lastShots
  let gunCueUntilTick = restarted ? 0 : prev.gunCueUntilTick
  if (inputs.shots > lastShots && inputs.tick >= gunCueUntilTick) {
    cues.push('machinegun')
    gunCueUntilTick = inputs.tick + GUN_CUE_INTERVAL_TICKS
  }

  // Bomb/rocket release (Plan 6b Task 10). A bare rising edge on each
  // cumulative count, deliberately WITHOUT the gunfire block's interval
  // gate: `dropBomb`/`fireRockets` are already edge-triggered once per
  // key-down at the sim level (Task 4/6's `advance`), so nothing here can
  // re-fire the same release the way held-trigger gunfire can.
  const lastBombsDropped = restarted ? 0 : prev.lastBombsDropped
  const lastRocketsFired = restarted ? 0 : prev.lastRocketsFired
  if (inputs.bombsDropped > lastBombsDropped) cues.push('bombs_away')
  if (inputs.rocketsFired > lastRocketsFired) cues.push('rocket_whoosh')

  // Damage and carrier edges. Each is a bare edge on a value the sim already
  // holds, so a replay scrub (`prime`) advances past them silently.
  // Blast damage to the player is not gunfire. The detonation itself is heard through spatial.ts.
  const blastDamage = inputs.ordnanceBlast !== null && inputs.tick - inputs.ordnanceBlast.tick <= BLAST_DAMAGE_WINDOW_TICKS
  let hitCueUntilTick = restarted ? 0 : prev.hitCueUntilTick
  if (inputs.structure < (restarted ? 1 : prev.lastStructure) && inputs.tick >= hitCueUntilTick && !blastDamage) {
    cues.push('hit_taken')
    hitCueUntilTick = inputs.tick + HIT_CUE_INTERVAL_TICKS
  }
  const failing = inputs.engineHealth < ENGINE_FAILING_HEALTH
  const wasFailed = restarted ? false : prev.engineFailed
  if (failing && !wasFailed && inputs.engineRunning) cues.push('engine_sputter')
  if (inputs.arrested && !(restarted ? false : prev.lastArrested)) cues.push('wire_catch')
  if (inputs.hookDown && !(restarted ? false : prev.lastHookDown)) cues.push('hook_clunk')

  return {
    memory: {
      wasOnGround: inputs.onGround, firedImpactTick, lastTick: inputs.tick, lastShots: inputs.shots, gunCueUntilTick,
      lastBombsDropped: inputs.bombsDropped, lastRocketsFired: inputs.rocketsFired,
      airborneSinceTick, airborneLatched, lastSinkMps: inputs.sinkMps,
      lastStructure: inputs.structure, hitCueUntilTick, engineFailed: failing,
      lastArrested: inputs.arrested, lastHookDown: inputs.hookDown,
    },
    cues,
    // Silent on a dead engine whatever the throttle says. `main.ts` already
    // gates the propeller MESH on the player's `impact === null` for the same
    // reason: an ungated spin leaves the propeller turning at full speed on a
    // wreck in its own fireball.
    engine: {
      gain: inputs.engineRunning ? engineGainFor(inputs.throttle) * engineHealthFactor(inputs.engineHealth) : 0,
      playbackRate: enginePlaybackRateFor(inputs.throttle),
    },
    engineFamily: inputs.engineFamily,
    ambient: { sea: seaGainFor(inputs.groundSurface, inputs.heightM) },
  }
}
