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
 * harmonics) with a slow brush flutter. Pure, so a Node test pins its loop seam and peak.
 */
export function motorSamples(sampleRate = SYNTH_SAMPLE_RATE): Float32Array {
  const out = new Float32Array(sampleRate)
  let peak = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate
    let v = 0
    for (let k = 1; k <= 4; k++) v += Math.sin(2 * Math.PI * MOTOR_HZ * k * t) / k
    v *= 1 + 0.15 * Math.sin(2 * Math.PI * 8 * t)
    out[i] = v
    peak = Math.max(peak, Math.abs(v))
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i]! / peak) * MOTOR_PEAK
  return out
}
