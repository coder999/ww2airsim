// src/render/hangar/benchController.ts
import type { AircraftSpec } from '../../sim/flight/schema.js'
import { gearAfter } from '../../sim/ground.js'
import { flapAfter } from '../../sim/flaps.js'
import type { PartPose } from './models.js'

/**
 * The bench's state (Hangar spec §8), kept apart from the DOM so Node can
 * test it. Cycle moves a part through the SIM's own transit functions, so
 * the Hangar shows exactly the timing the game flies: one full travel takes
 * the spec's `gear.travelSeconds` / `flap.travelSeconds`.
 */
export type CyclePart = 'gear' | 'flaps'

export interface BenchState {
  readonly gearFraction: number
  readonly flapFraction: number
  readonly throttle: number
  readonly bombs: boolean
  readonly rockets: boolean
  readonly cycling: CyclePart | null
}

export const REST: BenchState = { gearFraction: 1, flapFraction: 0, throttle: 0, bombs: true, rockets: true, cycling: null }

export interface BenchController {
  state(): BenchState
  /** A slider or toggle moved: applies it, cancels a cycle of the part it moves, returns the pose to hand the model. */
  set(p: PartPose): PartPose
  /** The Cycle button: runs the part to the far end; pressed mid-cycle, reverses. No-op without a spec. */
  startCycle(part: CyclePart): void
  /** One frame. Returns the pose to hand the model, or null when nothing moved. */
  advance(frameS: number): PartPose | null
}

export function createBenchController(spec: AircraftSpec | null): BenchController {
  let s: BenchState = REST
  let target: 0 | 1 = 0
  return {
    state: () => s,
    set(p) {
      const cancels = (p.gearFraction !== undefined && s.cycling === 'gear') || (p.flapFraction !== undefined && s.cycling === 'flaps')
      s = { ...s, ...p, cycling: cancels ? null : s.cycling }
      return p
    },
    startCycle(part) {
      if (spec === null) return
      const now = part === 'gear' ? s.gearFraction : s.flapFraction
      // Mid-cycle, a press reverses, like the lever; at rest, go to the far end.
      target = s.cycling === part ? (target === 1 ? 0 : 1) : now >= 0.5 ? 0 : 1
      s = { ...s, cycling: part }
    },
    advance(frameS) {
      if (spec === null || s.cycling === null) return null
      const part = s.cycling
      const down = target === 1
      const next = part === 'gear' ? gearAfter(spec, s.gearFraction, down, frameS) : flapAfter(spec, s.flapFraction, down, frameS)
      const cycling = next === target ? null : part
      s = part === 'gear' ? { ...s, gearFraction: next, cycling } : { ...s, flapFraction: next, cycling }
      return part === 'gear' ? { gearFraction: next } : { flapFraction: next }
    },
  }
}
