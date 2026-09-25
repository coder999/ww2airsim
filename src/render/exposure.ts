/**
 * Photoreal render pass, Phase A (spec §4.2): the output's tone curve and its
 * exposure. Exposure is a FIXED function of sun elevation -- a small table,
 * no histogram auto-exposure -- so a given time of day always looks the same
 * and a Tier 2 screenshot is reproducible.
 *
 * The keys are the same elevations `sky/palette.ts` keys its look on (30,
 * 10, 0, -6 degrees): the palette dims the lights toward dusk, and this lifts
 * the picture back by a photographer's stop or two so dusk reads as dim, not
 * black. Offsets are in EV (stops) and interpolated linearly in that log2
 * space, so the brightening is perceptually even across the transition.
 */

export const TONE_MAP_PARAM = 'toneMap'
export type ToneMapName = 'agx' | 'aces' | 'none'
const TONE_MAPS: readonly ToneMapName[] = ['agx', 'aces', 'none']

/** DEV `?toneMap=agx|aces|none`, for comparison screenshots. Throws on an
 *  unknown name, like `cloudTierFromQuery`: a typo should fail loudly, not
 *  silently show the default. */
export function toneMapFromQuery(search: string): ToneMapName | undefined {
  const raw = new URLSearchParams(search).get(TONE_MAP_PARAM)
  if (raw === null) return undefined
  if ((TONE_MAPS as readonly string[]).includes(raw)) return raw as ToneMapName
  throw new Error(`${TONE_MAP_PARAM}: ${JSON.stringify(raw)} is not a tone map (${TONE_MAPS.join(', ')})`)
}

/** [elevation degrees, EV offset], sorted by elevation, descending. Tuned by
 *  eye 2026-09-25 (Task 5) down from the plan's starting 0/0.4/1.0/2.0: at the
 *  `sunset` view (17.3 h, 8.1 deg) +0.5 EV pushed the palette's warm cloud
 *  light up AgX's path to white and the sunset read beige; +0.13 EV keeps
 *  it peach. Dusk (-6 deg and below) still lifts 1.5 EV (x2.8). */
const KEYS: readonly (readonly [number, number])[] = [[30, 0], [10, 0.1], [0, 0.5], [-6, 1.5]]
export const MAX_EXPOSURE = 4

/** Exposure multiplier for a sun elevation in degrees: monotonic
 *  non-increasing in elevation, 1 at >= 30 deg, capped at MAX_EXPOSURE at dusk. */
export function exposureFor(elevationDeg: number): number {
  if (elevationDeg >= KEYS[0]![0]) return 1
  const last = KEYS[KEYS.length - 1]!
  if (elevationDeg <= last[0]) return Math.min(2 ** last[1], MAX_EXPOSURE)
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [ea, va] = KEYS[i]!, [eb, vb] = KEYS[i + 1]!
    if (elevationDeg <= ea && elevationDeg > eb) {
      return Math.min(2 ** (va + (vb - va) * (ea - elevationDeg) / (ea - eb)), MAX_EXPOSURE)
    }
  }
  // Only NaN reaches here; a NaN exposure would blank the whole frame.
  return 1
}
