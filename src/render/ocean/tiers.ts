export const OCEAN_TIERS = [
  {name:'high',cascades:3,n:256},
  {name:'medium',cascades:2,n:128},
  {name:'low',cascades:1,n:128},
] as const
export type OceanTier = typeof OCEAN_TIERS[number]
/**
 * A4: the one-time quality verdict, from the frame intervals of the first
 * seconds of flight at the tier in force (`main.ts`'s probe).
 *
 * Frame RATE, not GPU time, and that is the whole fix for incident
 * 2026-09-20: a vsynced browser lets the GPU idle and clock down between
 * frames, so a timestamp span reads about 3x the same work under the Tier 2
 * harness (Mark's desktop read 11.4 ms at p95 and got Low), while the frame
 * rate is what the pilot sees. The median, so one hitch (a shader compile, a
 * terrain tile) cannot decide it. High at 50 fps or better, Medium at 30,
 * else Low: the old no-timestamp fallback's thresholds (18 and 34 ms at the
 * p95), now the only rule.
 */
export const PROBE_HIGH_MS = 20
export const PROBE_MEDIUM_MS = 1000 / 30
export function tierForFrameIntervalsMs(intervals: readonly number[]): { readonly tier: OceanTier; readonly medianMs: number } {
  if (intervals.length === 0) throw new Error('quality probe: no frame intervals')
  const sorted = [...intervals].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  const medianMs = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
  const tier = medianMs <= PROBE_HIGH_MS ? OCEAN_TIERS[0] : medianMs <= PROBE_MEDIUM_MS ? OCEAN_TIERS[1] : OCEAN_TIERS[2]
  return { tier, medianMs }
}
/** DEV-only override for measuring identical scenes at each quality. */
export function oceanTierFromQuery(search: string): OceanTier | undefined {
  const raw = new URLSearchParams(search).get('oceanTier')
  if (raw === null) return undefined
  const tier = OCEAN_TIERS.find(t => t.name === raw)
  if (!tier) throw new Error('ocean: invalid quality tier')
  return tier
}
