import { windSpeedMps } from './beaufort.js'

/** Moderate breeze: about 1 m significant wave height in the PM reference.
 * Kept for the tests that pin it and the `?beaufort=` doc; nothing in
 * production reads it now that a scenario's `weather.windMps` decides
 * (Plan 8) -- 7.717 m/s (deck quals) rounds to this same force 4. */
export const DEFAULT_BEAUFORT = 4
export const BEAUFORT_PARAM = 'beaufort'

/** Call only behind import.meta.env.DEV; malformed overrides fail visibly.
 *  Absent is `undefined` so the scenario's weather decides. */
export function beaufortFromQuery(search: string): number | undefined {
  const raw = new URLSearchParams(search).get(BEAUFORT_PARAM)
  if (raw === null) return undefined
  if (raw.trim() === '') throw new Error('ocean weather: empty force')
  const value = Number(raw)
  windSpeedMps(value) // validates finite integer 0–12
  return value
}

export const OCEAN_TIME_PARAM = 'oceanTime'
/** DEV-only phase freeze for comparisons against the CPU oracle. */
export function oceanTimeFromQuery(search: string): number | undefined {
  const raw = new URLSearchParams(search).get(OCEAN_TIME_PARAM)
  if (raw === null) return undefined
  const value = Number(raw)
  if (raw.trim() === '' || !Number.isFinite(value) || value < 0) throw new Error('ocean weather: invalid phase time')
  return value
}
