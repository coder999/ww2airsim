/**
 * Every number between the throttle and the speakers, and nothing else.
 *
 * This module imports NOTHING. It is pure arithmetic so that the decisions in
 * it -- silent at idle, how hard the propeller may be resampled, how much
 * headroom a cue leaves -- are checkable by a plain unit test rather than
 * asserted in prose. Design §4.1 and §4.2.
 *
 * The four tuning gains were chosen on 2026-09-18 and have the same standing
 * as `RAMP_SECONDS` and the `DITCH_*` gates elsewhere in this repo: reasoned
 * guesses until somebody flies them.
 */

/** Master output gain. Leaves headroom for a cue on top of the engine; the
 *  budget is asserted in tests/audio/assets.test.ts, not just stated here. */
export const MASTER_GAIN = 0.80

/** Engine gain at full throttle. */
export const ENGINE_GAIN_MAX = 0.50

/** Playback-rate range for the propeller loop. The ratio is kept under 2
 *  (asserted): resampling a recording much harder than an octave stops
 *  sounding like the same engine and starts sounding like a broken sampler. */
export const ENGINE_RATE_MIN = 0.75
export const ENGINE_RATE_MAX = 1.15

/**
 * Time constant for `setTargetAtTime` on the engine's gain and rate.
 *
 * `controls.throttle` normally ramps over `THROTTLE_SECONDS` (2.0 s), so it
 * needs no smoothing -- except `M`, throttle cut, which zeroes it in a single
 * frame. A one-frame step on an AudioParam is an audible click, so every
 * engine parameter glides instead of being assigned.
 */
export const ENGINE_GLIDE_TAU_S = 0.02

/** `propeller.wav`'s sample rate, asserted against the file itself. */
export const PROPELLER_SAMPLE_RATE = 48_000

/**
 * The propeller loop, in FRAMES of the source file.
 *
 * Stated in frames rather than seconds because frames are what the file has;
 * seconds are derived below. Mark's ruling 2026-09-18: set loop points in code
 * via `AudioBufferSourceNode.loopStart`/`loopEnd` rather than re-cutting the
 * committed WAV -- neither ffmpeg nor sox is installed on this host, and a
 * constant in a reviewed file is inspectable in a way a replaced binary is not.
 *
 * Measured 2026-09-18 (`npx tsx tools/audio/loop.ts`): this pair splices with a
 * total step of 64 across both channels, against 12,050 for the default
 * whole-file wrap -- a 188x reduction. They are NOT zero crossings; both sit
 * near -0.38 full scale. Continuity across the seam is what a click is made of,
 * not proximity to zero.
 *
 * The optimum is not unique. An independent stride-16-then-refine sweep of the
 * same file finds (22289, 347632) at a seam of 32 -- marginally better, and
 * inaudibly so: both are a fraction of a least-significant bit against a 28,416
 * peak. These constants are kept because they are the measured, reviewed and
 * tested pair; the alternative is recorded so a future re-run that lands on it
 * is recognised as a tie, not a regression.
 */
export const LOOP_START_FRAME = 24_276
export const LOOP_END_FRAME = 361_360

export function loopStartSeconds(): number {
  return LOOP_START_FRAME / PROPELLER_SAMPLE_RATE
}

export function loopEndSeconds(): number {
  return LOOP_END_FRAME / PROPELLER_SAMPLE_RATE
}

/** Throttle, clamped into [0, 1], with any non-finite value read as zero.
 *  Every gate is a positive comparison, so NaN fails all of them and falls
 *  through to 0 -- the same fail-quiet posture `src/sim/contact.ts` uses. A
 *  non-finite value reaching an AudioParam throws inside the render loop. */
function throttleFraction(throttle: number): number {
  if (!(throttle > 0)) return 0
  return throttle < 1 ? throttle : 1
}

/** Engine gain. EXACTLY zero at zero throttle: Mark chose silence at idle
 *  over an idle floor, so this is `toBe(0)` in the test, not `toBeCloseTo`. */
export function engineGainFor(throttle: number): number {
  return ENGINE_GAIN_MAX * throttleFraction(throttle)
}

export function enginePlaybackRateFor(throttle: number): number {
  return ENGINE_RATE_MIN + (ENGINE_RATE_MAX - ENGINE_RATE_MIN) * throttleFraction(throttle)
}

/**
 * Worst-case linear sum when a one-shot lands on top of the engine: both at
 * their peak, in phase, in the same sample. Pessimistic on purpose -- real
 * peaks rarely coincide, and a budget that assumed they do not would be a
 * budget that permits clipping on the day they do.
 */
export function worstCaseAmplitude(cueGain: number, cuePeak: number, enginePeak: number): number {
  return cueGain * cuePeak + enginePeak
}

/** Per-bus output gain, applied in the audio graph after each bus's sources.
 *  `engine` and `sfx` are 1 so today's mix is unchanged (the gain budget in
 *  tests/audio/assets.test.ts is arithmetic on exactly those); `ambient` and
 *  `radio` are reasoned guesses until somebody flies them. */
export const BUS_GAIN = { engine: 1, sfx: 1, ambient: 0.6, radio: 0.9 } as const

export type Bus = keyof typeof BUS_GAIN

/** A lowpass at this frequency is inaudible: the "open" position of every
 *  per-layer filter. */
export const FILTER_OPEN_HZ = 20_000

/** Q for lowpass/highpass biquads is read in dB; -3.0103 dB is Butterworth-flat (linear 1/sqrt(2)), no resonant bump. */
export const BIQUAD_FLAT_Q_DB = -3.0103

/** The radio chain's pass band (spec §5.3) and how hard its soft clipper is
 *  driven. */
export const RADIO_BAND_LOW_HZ = 400
export const RADIO_BAND_HIGH_HZ = 3_200
export const RADIO_DRIVE = 2

export type View = 'cockpit' | 'chase'

/** What the cabin stage does to the mix in one view (spec §2). The world
 *  buses go through one lowpass and gain; the radio through its own. The
 *  chase world stage is fully open at unity gain (the previous sound; the default
 *  view is chase), while the cockpit numbers are reasoned guesses until Mark has
 *  flown and tuned them. */
export type CabinPreset = {
  readonly worldLowpassHz: number
  readonly worldGain: number
  /** Linear multipliers on the engine and sfx buses ahead of the world stage.
   *  The lowpass cannot separate the views for the engine (the propeller clip
   *  has under 0.1% of its energy above 9 kHz), so level is the lever. */
  readonly engineTrim: number
  readonly sfxTrim: number
  readonly radioLowpassHz: number
  readonly radioGain: number
}

export const CABIN_PRESETS: Readonly<Record<View, CabinPreset>> = {
  cockpit: { worldLowpassHz: 9_000, worldGain: 1, engineTrim: 1.4, sfxTrim: 0.7, radioLowpassHz: 20_000, radioGain: 1 },
  chase: { worldLowpassHz: FILTER_OPEN_HZ, worldGain: 1, engineTrim: 0.7, sfxTrim: 1, radioLowpassHz: 2_200, radioGain: 0.7 },
}

/** Crossfade time constant when the view changes. */
export const CABIN_GLIDE_TAU_S = 0.25

/** Distance at which a positioned one-shot is at its recorded level; beyond it
 *  the panner's inverse-distance model attenuates. Placeholder until
 *  sub-project 5 tunes rolloff by flying it. */
export const PANNER_REF_DISTANCE_M = 100
