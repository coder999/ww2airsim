import { CircleGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, Vector3, type Camera } from 'three'
import type { AircraftSpec } from '../../sim/flight/schema.js'
import type { AircraftState } from '../../sim/flight/state.js'
import type { Vec3 } from '../../sim/math/vec3.js'
import type { Deck } from '../../sim/world/deck.js'
import type { TerrainField } from '../../sim/world/terrain.js'
import { predictImpact, type ImpactPrediction } from '../../sim/weapons/impactPrediction.js'
import type { StoresState } from '../../sim/weapons/stores.js'

/**
 * The impact marker (B2, Mark 2026-10-10): a ring on the ground (or sea) where a bomb or rocket pair
 * released now would land. An Assist, off by default, toggled with `U`. Like the gun pipper and the
 * steering cue it is a scene mesh drawn over everything (no depth test), so a marker behind a hill or a
 * cloud is still a marker; it is billboarded to the camera and held at a constant angular size, so it
 * reads at 300 m and at 3 miles alike. Render only: the prediction is `predictImpact`, a pure view of
 * the sim, and nothing here writes back.
 */

/** The ring's angular half-size at any range. */
const MARKER_DEG = 0.9
const METERS_PER_MILE = 1609.344

/** Statute miles, one decimal: the player-facing unit (AGENTS.md). */
export const milesOf = (m: number): number => m / METERS_PER_MILE

/**
 * The HUD badge text. `null` when the Assist is off; the bare name while it is on but there is nothing
 * to mark (no store, bay doors shut, on the ground, or no impact within the store's lifetime); with a
 * prediction, the store, the ground range from the airplane in miles, and whether the fuze will arm.
 */
export function impactLabel(on: boolean, prediction: ImpactPrediction | null, from: Vec3): string | null {
  if (!on) return null
  if (prediction === null) return 'IMPACT MARKER'
  const range = milesOf(Math.hypot(prediction.point.x - from.x, prediction.point.z - from.z))
  return `IMPACT ${prediction.kind === 'bomb' ? 'BOMB' : 'ROCKET'} ${range.toFixed(1)} MI${prediction.armed ? '' : ' · UNARMED'}`
}

/**
 * Whether the marker is drawn. The Assist must be on and there must be a prediction to show; the
 * caller supplies `live` for the cases the sim cannot see (a replay, the title screen, a debrief, a
 * crashed or destroyed airplane). `predictImpact` itself is already null for an empty store, closed
 * bay doors, an airplane on the ground, and a store that never lands within its lifetime.
 */
export const impactMarkerShown = (on: boolean, live: boolean, prediction: ImpactPrediction | null): boolean =>
  on && live && prediction !== null

/**
 * A memo of `predictImpact` keyed on object identity: the player's state, stores, terrain and wind only
 * change on a sim tick, so a 144 Hz frame between ticks costs a comparison, and with the Assist off the
 * predictor is never called at all.
 */
export function createImpactPredictor(): (
  on: boolean, spec: AircraftSpec, state: AircraftState, stores: StoresState,
  terrain: TerrainField | null, wind: Vec3 | null, decks: readonly Deck[],
) => ImpactPrediction | null {
  let last: { state: AircraftState; stores: StoresState; terrain: TerrainField | null; wind: Vec3 | null; spec: AircraftSpec; value: ImpactPrediction | null } | null = null
  return (on, spec, state, stores, terrain, wind, decks) => {
    if (!on) return null
    if (last !== null && last.state === state && last.stores === stores && last.terrain === terrain && last.wind === wind && last.spec === spec) return last.value
    const value = predictImpact(spec, state, stores, terrain, wind, decks)
    last = { state, stores, terrain, wind, spec, value }
    return value
  }
}

export type ImpactMarker = {
  readonly root: Group
  /** Poses the marker for this frame; returns the shown flag for diagnostics. */
  update(point: Vec3 | null, armed: boolean, camera: Camera, worldOffset: Vec3, shown: boolean): boolean
}

export function createImpactMarker(): ImpactMarker {
  const material = new MeshBasicMaterial({
    color: 0xff7a45, side: DoubleSide, depthTest: false, depthWrite: false, transparent: true, opacity: 0.92, fog: false,
  })
  const ring = new Mesh(new RingGeometry(0.72, 1, 40), material)
  const dot = new Mesh(new CircleGeometry(0.14, 16), material)
  ring.renderOrder = dot.renderOrder = 10
  const marker = new Group()
  marker.name = 'impactMarker'
  marker.add(ring, dot)
  const root = new Group()
  root.name = 'impactMarker:root'
  root.add(marker)
  root.visible = false
  const view = new Vector3()
  return {
    root,
    update(point, armed, camera, worldOffset, shown) {
      root.visible = shown && point !== null
      if (!root.visible || point === null) return false
      marker.position.set(point.x, point.y, point.z)
      // Range from the camera, in view space. The scene is shifted by `worldOffset` (floating origin), so
      // the point as the camera sees it is the world point plus that shift, as in steeringArrow.ts.
      camera.updateMatrixWorld()
      view.set(point.x + worldOffset.x, point.y + worldOffset.y, point.z + worldOffset.z).applyMatrix4(camera.matrixWorldInverse)
      marker.scale.setScalar(Math.max(1, view.length() * Math.tan((MARKER_DEG * Math.PI) / 180)))
      marker.quaternion.copy(camera.quaternion)
      // A dud-to-be reads dimmer; the point is still where it lands.
      material.opacity = armed ? 0.92 : 0.45
      return true
    },
  }
}
