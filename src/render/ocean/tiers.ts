export const OCEAN_TIERS = [
  {name:'high',cascades:3,n:256},
  {name:'medium',cascades:2,n:128},
  {name:'low',cascades:1,n:128},
] as const
export type OceanTier = typeof OCEAN_TIERS[number]
/** RX 6700 XT / Chromium D3D12, 1440p, Beaufort 6 at 600 m,
 * 2026-09-15: sum of render and per-cascade GPU timestamp percentiles:
 * high p50/p95 3.277/3.539 ms; medium 2.425/2.621; low 2.228/2.490.
 * These are unpaired pass percentiles, not wall-clock frame latency.
 * Keep high through 8 ms (below 8.33 ms at 120 Hz). Medium's measured
 * 0.741 cost ratio puts an 11 ms high frame near 8.15 ms; slower goes low.
 * This is a one-time downward selection, not a promise for every adapter.
 */
export function tierForFrameTimeMs(ms: number): OceanTier {
  return ms <= 8 ? OCEAN_TIERS[0] : ms <= 11 ? OCEAN_TIERS[1] : OCEAN_TIERS[2]
}
/** DEV-only override for measuring identical scenes at each quality. */
export function oceanTierFromQuery(search: string): OceanTier | undefined {
  const raw = new URLSearchParams(search).get('oceanTier')
  if (raw === null) return undefined
  const tier = OCEAN_TIERS.find(t => t.name === raw)
  if (!tier) throw new Error('ocean: invalid quality tier')
  return tier
}
