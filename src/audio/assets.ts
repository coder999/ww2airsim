/**
 * The one table naming every sound file, its size, and how loud it is.
 *
 * Imports nothing but `import.meta.env.BASE_URL`, mirroring
 * `src/render/content.ts`: the build assertion in `tests/build/dist.test.ts`
 * checks where the file lands ON DISK, so a URL built any other way could 404
 * in the browser while that test still passed. Both the build assertion and
 * the runtime loader read this table, so they cannot name different files.
 *
 * `peakFullScale` is measured off the PCM by `tests/audio/assets.test.ts` to
 * four decimal places, not trusted: the gain budget in `src/audio/mix.ts` is
 * arithmetic on these numbers, so a replaced file with a hotter peak has to
 * fail there rather than distort in somebody's speakers.
 */
export type ClipId =
  | 'propeller'
  | 'explosion'
  | 'water_crash'
  | 'landing_squeak'
  | 'bombs_away'
  | 'machinegun'

export type AudioAsset = {
  readonly id: ClipId
  readonly path: string
  readonly bytes: number
  /** Largest |sample| in the file, as a fraction of full scale. */
  readonly peakFullScale: number
  /** Gain applied when this clip is fired as a one-shot. */
  readonly cueGain: number
}

export const AUDIO_ASSETS: readonly AudioAsset[] = [
  // The engine is a loop, never a one-shot, so its `cueGain` is never read.
  // It carries `ENGINE_GAIN_MAX`'s value (mix.ts) rather than being optional,
  // because `exactOptionalPropertyTypes` is on and an absent field would make
  // every consumer handle a case that cannot happen.
  { id: 'propeller', path: 'content/audio/propeller.wav', bytes: 1_536_770, peakFullScale: 0.8672, cueGain: 0.50 },
  { id: 'explosion', path: 'content/audio/explosion.wav', bytes: 749_570, peakFullScale: 1.0000, cueGain: 0.60 },
  { id: 'water_crash', path: 'content/audio/water_crash.wav', bytes: 749_570, peakFullScale: 0.9961, cueGain: 0.70 },
  { id: 'landing_squeak', path: 'content/audio/landing_squeak.wav', bytes: 192_770, peakFullScale: 0.5508, cueGain: 1.00 },
  { id: 'bombs_away', path: 'content/audio/bombs_away.wav', bytes: 192_770, peakFullScale: 0.8398, cueGain: 0.60 },
  { id: 'machinegun', path: 'content/audio/machinegun.wav', bytes: 250_370, peakFullScale: 1.0000, cueGain: 0.50 },
]

export function assetFor(id: ClipId): AudioAsset {
  const asset = AUDIO_ASSETS.find((a) => a.id === id)
  // Unreachable through `ClipId`, but a lookup that can return undefined and
  // is not checked becomes a confusing runtime error far from here.
  if (asset === undefined) throw new Error(`no audio asset named ${id}`)
  return asset
}

export function audioUrl(id: ClipId): string {
  return `${import.meta.env.BASE_URL}${assetFor(id).path}`
}
