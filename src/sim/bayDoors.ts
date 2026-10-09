import type { AircraftSpec } from './flight/schema.js'

/**
 * Bomb-bay doors (C2): a lever with travel, the flaps' twin (`flapAfter`'s rules, and the reason
 * it is a twin rather than a shared actuator, are in src/sim/flaps.ts). An airplane with no
 * `spec.bayDoors` has none: its fraction stays 0 and nothing here gates or drags it.
 */
export function bayDoorsAfter(spec: AircraftSpec, fraction: number, open: boolean | undefined, dt: number): number {
  if (spec.bayDoors === undefined || open === undefined) return fraction
  const step = Number.isFinite(dt) && dt > 0 ? dt / spec.bayDoors.travelSeconds : 0
  const next = open ? fraction + step : fraction - step
  return next < 0 ? 0 : next > 1 ? 1 : next
}

/** Parasitic drag from open doors, newtons: `flapDragN`'s shape, and 0 on any non-finite input. */
export function bayDoorDragN(spec: AircraftSpec, fraction: number, q: number): number {
  if (spec.bayDoors === undefined || !Number.isFinite(q) || Number.isNaN(fraction)) return 0
  const f = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction
  return q * spec.bayDoors.dragAreaM2 * f
}

/** Whether a bomb is held in the bay: the airplane has doors and they are not fully open. A NaN
 *  fraction reads as shut, so "I do not know" never drops a bomb through closed doors. */
export function bayDoorsShut(spec: AircraftSpec, fraction: number): boolean {
  return spec.bayDoors !== undefined && !(fraction >= 1)
}
