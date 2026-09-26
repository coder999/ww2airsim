// src/render/hangar/benchFlag.ts
/**
 * The ONE expression that decides whether the articulation bench shows
 * (Hangar spec §3). At v1.0, deleting the query clause hides the bench in
 * production builds; tests/render/hangar/benchFlag.test.ts pins the truth
 * table so that switch is deliberate.
 */
export function benchEnabled(dev: boolean, search: string): boolean {
  return dev || new URLSearchParams(search).has('bench')
}
