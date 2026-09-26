// src/render/scene/airframe.ts
import type { Object3D } from 'three'

/** A part an airframe module can articulate. `parts` lists only the ones its
 *  model actually has, so the Hangar bench can show the rest as "not
 *  modeled" instead of a slider that moves nothing (Hangar spec §7, Mark's
 *  decision 1, 2026-09-25). */
export type PartId = 'prop' | 'gear' | 'flaps' | 'stores'

/** Everything one airframe needs to pose itself for one rendered frame. */
export interface AirframeUpdate {
  /** `AircraftState.gearFraction`: 1 = down, 0 = up. */
  readonly gearFraction: number
  /** `AircraftState.flapFraction`: 0 = up, 1 = fully down. */
  readonly flapFraction: number
  /** [0, 1]. Pass 0 for a wreck, so its propeller stops. */
  readonly throttle: number
  /** The pilot's command, for control surfaces where a model has them. */
  readonly controls: { readonly roll: number; readonly pitch: number; readonly yaw: number }
  /** Seconds since the last rendered frame. */
  readonly frameS: number
  /** Eye to this aircraft, meters: what a level-of-detail switch reads (Z3). */
  readonly cameraDistanceM: number
}

/** Implemented by every airframe module (hellcat.ts, wildcat.ts, and each
 *  model the registry in airframes.ts names). main.ts and scenarioEntities.ts
 *  drive whichever concrete airframe a spec's `view.model` names through this
 *  alone (A6M Zero spec §7.3). */
export interface Airframe {
  readonly root: Object3D
  readonly parts: readonly PartId[]
  setStores(bombsLeft: number, rocketsLeft: number): void
  /** One call per aircraft per rendered frame. Replaces spinProp/setGear (Z1). */
  update(u: AirframeUpdate): void
  /** Frees what this airframe owns and releases its model instances. Idempotent. */
  dispose(): void
}

/** Purely visual: gauges.ts explains why no tachometer is fitted -- there is
 *  no modeled engine RPM to drive it honestly. The prop turns at an arbitrary
 *  rate scaled by throttle; it confirms throttle reaches the frame state, not
 *  that it reaches the simulation (Task 13 review, measured 2026-09-13).
 *  Moved here from main.ts (Z1) when every aircraft's prop started turning. */
export const PROP_MAX_RAD_PER_SEC = 40

/** The propeller angle one frame later, wrapped to [0, 2 pi). Pure, so the rate is a test, not a claim. */
export function propAngle(prevRad: number, throttle: number, frameS: number): number {
  const next = prevRad + throttle * PROP_MAX_RAD_PER_SEC * frameS
  const turn = 2 * Math.PI
  return ((next % turn) + turn) % turn
}
