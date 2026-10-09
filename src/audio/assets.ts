/**
 * The one table naming every sound file, its size, and how loud it is.
 *
 * Imports nothing at runtime but `import.meta.env.BASE_URL`, mirroring
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
import type { Bus } from './mix.js'

export type ClipId =
  | 'propeller'
  | 'explosion'
  | 'water_crash'
  | 'landing_squeak'
  | 'bombs_away'
  | 'machinegun'
  | 'rocket_whoosh'
  | 'engine_radial_small'
  | 'engine_radial_big'
  | 'engine_multi_heavy'
  | 'engine_allison_v12'
  | 'engine_sputter'
  | 'hit_taken'
  | 'sea_waves'
  | 'carrier_deck'
  | 'wire_catch'
  | 'flak_distant'
  | 'hook_clunk'
  | 'gear_cycle'
  | 'flaps_cycle'
  | 'flak_burst'
  | 'torpedo_splash'
  /** Synthesized at load (synth.ts), not a file: it is in no `AUDIO_ASSETS` row. */
  | 'motor'

export type AudioAsset = {
  readonly id: ClipId
  readonly path: string
  readonly bus: Bus
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
  { id: 'propeller', path: 'content/audio/propeller.wav', bus: 'engine', bytes: 1_536_770, peakFullScale: 0.8672, cueGain: 0.50 },
  { id: 'explosion', path: 'content/audio/explosion.wav', bus: 'sfx', bytes: 749_570, peakFullScale: 1.0000, cueGain: 0.60 },
  { id: 'water_crash', path: 'content/audio/water_crash.wav', bus: 'sfx', bytes: 749_570, peakFullScale: 0.9961, cueGain: 0.70 },
  { id: 'landing_squeak', path: 'content/audio/landing_squeak.wav', bus: 'sfx', bytes: 192_770, peakFullScale: 0.5508, cueGain: 1.00 },
  { id: 'bombs_away', path: 'content/audio/bombs_away.wav', bus: 'sfx', bytes: 192_770, peakFullScale: 0.8398, cueGain: 0.60 },
  { id: 'machinegun', path: 'content/audio/machinegun.wav', bus: 'sfx', bytes: 250_370, peakFullScale: 1.0000, cueGain: 0.50 },
  // ElevenLabs sound generation, 2026-10-09 (content/audio/NOTICE.md).
  { id: 'rocket_whoosh', path: 'content/audio/rocket_whoosh.wav', bus: 'sfx', bytes: 362_520, peakFullScale: 1.0000, cueGain: 0.55 },
  // Adobe Firefly, generated 2026-09-29 (content/audio/NOTICE.md). Wired
  // 2026-09-29 (flak_distant 2026-09-30, spatial) except the small radial loop,
  // which stays unused (propeller.wav serves single radials under 2,000 hp);
  // the big radial was wired 2026-10-08 for the 2,000 hp class (mix.ts).
  { id: 'engine_radial_small', path: 'content/audio/engine_radial_small.wav', bus: 'engine', bytes: 1_536_770, peakFullScale: 0.7305, cueGain: 0.50 },
  { id: 'engine_radial_big', path: 'content/audio/engine_radial_big.wav', bus: 'engine', bytes: 1_536_770, peakFullScale: 0.9844, cueGain: 0.50 },
  { id: 'engine_multi_heavy', path: 'content/audio/engine_multi_heavy.wav', bus: 'engine', bytes: 1_536_770, peakFullScale: 0.9609, cueGain: 0.50 },
  { id: 'engine_allison_v12', path: 'content/audio/engine_allison_v12.wav', bus: 'engine', bytes: 1_536_770, peakFullScale: 0.7617, cueGain: 0.50 },
  { id: 'engine_sputter', path: 'content/audio/engine_sputter.wav', bus: 'sfx', bytes: 903_170, peakFullScale: 0.7383, cueGain: 0.60 },
  { id: 'hit_taken', path: 'content/audio/hit_taken.wav', bus: 'sfx', bytes: 288_770, peakFullScale: 1.0000, cueGain: 0.60 },
  { id: 'sea_waves', path: 'content/audio/sea_waves.wav', bus: 'ambient', bytes: 2_765_570, peakFullScale: 0.5547, cueGain: 0.50 },
  { id: 'carrier_deck', path: 'content/audio/carrier_deck.wav', bus: 'ambient', bytes: 2_765_570, peakFullScale: 0.3359, cueGain: 0.50 },
  { id: 'wire_catch', path: 'content/audio/wire_catch.wav', bus: 'sfx', bytes: 250_370, peakFullScale: 1.0000, cueGain: 0.60 },
  { id: 'flak_distant', path: 'content/audio/flak_distant.wav', bus: 'sfx', bytes: 691_970, peakFullScale: 0.8984, cueGain: 0.60 },
  { id: 'hook_clunk', path: 'content/audio/hook_clunk.wav', bus: 'sfx', bytes: 192_770, peakFullScale: 0.9336, cueGain: 0.60 },
  // ElevenLabs, 2026-10-09 (content/audio/NOTICE.md): one hydraulic cycle Mark
  // picked to play for both gear up and gear down. Not wired until C1 moves the
  // gear. cueGain sits below the other one-shots because he asked for it a bit
  // quieter; the level is reasoned, not yet heard in flight.
  { id: 'gear_cycle', path: 'content/audio/gear_cycle.wav', bus: 'sfx', bytes: 789_892, peakFullScale: 0.8026, cueGain: 0.35 },
  // ElevenLabs, 2026-10-09, Mark's picks; neither is wired yet. flaps_cycle
  // plays for both flaps up and flaps down (with C1). flak_burst is the CLOSE
  // burst (flak_distant is the far one), normalized up from a quiet take, and
  // its cueGain is the loudest of the one-shots because Mark wants it loud
  // when it bursts near the airplane (M2 scales it down with distance). 0.80
  // failed the full-throttle headroom test (tests/audio/assets.test.ts).
  { id: 'flaps_cycle', path: 'content/audio/flaps_cycle.wav', bus: 'sfx', bytes: 812_076, peakFullScale: 0.6313, cueGain: 0.35 },
  { id: 'flak_burst', path: 'content/audio/flak_burst.wav', bus: 'sfx', bytes: 124_392, peakFullScale: 0.9700, cueGain: 0.75 },
  // ElevenLabs, 2026-10-09, Mark's pick: the torpedo hitting the water. Its
  // release reuses bombs_away. Unwired until the Avenger drops one.
  { id: 'torpedo_splash', path: 'content/audio/torpedo_splash.wav', bus: 'sfx', bytes: 369_544, peakFullScale: 0.9762, cueGain: 0.60 },
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
