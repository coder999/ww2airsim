import { windSpeedMps } from './beaufort.js'

/** Moderate breeze: about 1 m significant wave height in the PM reference.
 * A development default until scenarios supply their weather (design §7). */
export const DEFAULT_BEAUFORT = 4
export const BEAUFORT_PARAM = 'beaufort'

/** Call only behind import.meta.env.DEV; malformed overrides fail visibly. */
export function beaufortFromQuery(search: string): number {
  const raw = new URLSearchParams(search).get(BEAUFORT_PARAM)
  if (raw === null) return DEFAULT_BEAUFORT
  if (raw.trim() === '') throw new Error('ocean weather: empty force')
  const value = Number(raw)
  windSpeedMps(value) // validates finite integer 0–12
  return value
}
