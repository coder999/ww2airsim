/**
 * Sounds made in code at load instead of fetched (C2): the actuator motor, the first of Track I1's
 * synthesized mechanicals. A synthesized clip is an ordinary `ClipId` whose buffer comes from here,
 * so it loops through `LAYERS` like any recording and no frame needs a new backend verb. I1's gear
 * and flap motors drive the same `motor` layer (or a pitch-shifted copy of it) rather than adding one.
 */

/** Sample rate the motor is rendered at. Matches the recordings' 48 kHz (layers.ts). */
export const SYNTH_SAMPLE_RATE = 48_000

/** The motor's fundamental, Hz: an electric actuator's whine. A tuning value for Mark's ear. */
export const MOTOR_HZ = 110
/** Largest |sample|; the cue gain budget (mix.ts) reads recordings at their measured peaks, so the
 *  synth states its own. */
export const MOTOR_PEAK = 0.5

/**
 * One second of motor, a seamless loop: a whole number of cycles of a band-limited sawtooth (four
 * harmonics) with a slow brush flutter. Pure, so a Node test pins its loop seam and peak. `hz` must
 * be a whole number for the loop to be seamless; I1's stall buzzer is this at `BUZZ_HZ`.
 */
export function motorSamples(sampleRate = SYNTH_SAMPLE_RATE, hz = MOTOR_HZ): Float32Array {
  const out = new Float32Array(sampleRate)
  let peak = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate
    let v = 0
    for (let k = 1; k <= 4; k++) v += Math.sin(2 * Math.PI * hz * k * t) / k
    v *= 1 + 0.15 * Math.sin(2 * Math.PI * 8 * t)
    out[i] = v
    peak = Math.max(peak, Math.abs(v))
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i]! / peak) * MOTOR_PEAK
  return out
}

// ---- I1: the rest of the synthesized mechanicals (plan 2026-10-09-i1-synth-sounds.md).

/** The stall warning buzzer's pitch, Hz. A tuning value for Mark's ear. */
export const BUZZ_HZ = 240

/** Every synthesized clip's largest |sample|, which the headroom test (tests/audio/assets.test.ts)
 *  multiplies by each layer's max gain, as it does a recording's measured peak. */
export const SYNTH_PEAK = { motor: MOTOR_PEAK, buzz: MOTOR_PEAK, noise: 0.5, buffet: 0.5, creak: 0.5 } as const
export type SynthClip = keyof typeof SYNTH_PEAK

/** A seeded uniform PRNG (mulberry32), so every synthesized clip is the same on every load. */
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const normalized = (out: Float32Array, peak: number): Float32Array => {
  let m = 0
  for (const v of out) m = Math.max(m, Math.abs(v))
  for (let i = 0; i < out.length; i++) out[i] = (out[i]! / m) * peak
  return out
}

/** One-pole lowpass run twice round the buffer, so the filter's state at the wrap is the state it
 *  would have had in a longer run: the loop seam stays as smooth as anywhere inside it. */
function lowpassLooped(x: Float32Array, hz: number, sampleRate: number): Float32Array {
  const a = Math.exp((-2 * Math.PI * hz) / sampleRate)
  const out = new Float32Array(x.length)
  let y = 0
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < x.length; i++) { y = (1 - a) * x[i]! + a * y; out[i] = y }
  }
  return out
}

/** Two seconds of white noise. Uncorrelated, so its wrap is no more audible than any other sample
 *  pair. The wind, the wheels and the radio static are all this, through their layer's lowpass. */
export function noiseSamples(sampleRate = SYNTH_SAMPLE_RATE): Float32Array {
  const r = random(1)
  const out = new Float32Array(sampleRate * 2)
  for (let i = 0; i < out.length; i++) out[i] = r() * 2 - 1
  return normalized(out, SYNTH_PEAK.noise)
}

/** One second of stall buffet: low noise (120 Hz) shaken by three whole-number rates (9, 11, 13 Hz),
 *  so it shudders irregularly and still loops. */
export function buffetSamples(sampleRate = SYNTH_SAMPLE_RATE): Float32Array {
  const r = random(2)
  const raw = new Float32Array(sampleRate)
  for (let i = 0; i < raw.length; i++) raw[i] = r() * 2 - 1
  const low = lowpassLooped(raw, 120, sampleRate)
  for (let i = 0; i < low.length; i++) {
    const t = i / sampleRate
    const shake = Math.sin(2 * Math.PI * 9 * t) + Math.sin(2 * Math.PI * 11 * t + 1) + Math.sin(2 * Math.PI * 13 * t + 2)
    low[i] = low[i]! * (1 + shake / 3)
  }
  return normalized(low, SYNTH_PEAK.buffet)
}

/** Two seconds of overspeed creak: a 70 Hz groan whose pitch wanders once per loop (so its phase
 *  closes), under a rasp of 900 Hz-lowpassed noise that swells with it. */
export function creakSamples(sampleRate = SYNTH_SAMPLE_RATE): Float32Array {
  const r = random(3)
  const n = sampleRate * 2
  const raw = new Float32Array(n)
  for (let i = 0; i < n; i++) raw[i] = r() * 2 - 1
  const rasp = lowpassLooped(raw, 900, sampleRate)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate
    const swell = 0.5 - 0.5 * Math.cos(Math.PI * t) // one rise and fall per 2 s loop
    const phase = 2 * Math.PI * (70 * t + (6 / (2 * Math.PI * 0.5)) * Math.sin(2 * Math.PI * 0.5 * t))
    out[i] = swell * (Math.sin(phase) + 0.4 * Math.sin(2 * phase) + 3 * rasp[i]!)
  }
  return normalized(out, SYNTH_PEAK.creak)
}

/** Each synthesized clip's samples, for `system.load`. */
export const SYNTH_CLIPS: Readonly<Record<SynthClip, (sampleRate: number) => Float32Array>> = {
  motor: (sr) => motorSamples(sr),
  buzz: (sr) => motorSamples(sr, BUZZ_HZ),
  noise: noiseSamples,
  buffet: buffetSamples,
  creak: creakSamples,
}
