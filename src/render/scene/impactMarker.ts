import { BufferAttribute, BufferGeometry, CircleGeometry, DoubleSide, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, PlaneGeometry, RingGeometry, Vector3, type Camera } from 'three'
import type { AircraftSpec } from '../../sim/flight/schema.js'
import type { AircraftState } from '../../sim/flight/state.js'
import type { Vec3 } from '../../sim/math/vec3.js'
import type { Deck } from '../../sim/world/deck.js'
import type { TerrainField } from '../../sim/world/terrain.js'
import { predictImpact, predictTorpedoDrop, type ImpactPrediction, type TorpedoPrediction, type TorpedoReason } from '../../sim/weapons/impactPrediction.js'
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
  // F6B: a bomb's marker is the BOMBSIGHT (Lieutenant Commander and above in the campaign; Dev and Training always).
  return `${prediction.kind === 'bomb' ? 'BOMBSIGHT' : 'IMPACT ROCKET'} ${range.toFixed(1)} MI${prediction.armed ? '' : ' · UNARMED'}`
}

const MPH_PER_MPS = 2.2369363
const FEET_PER_METRE = 3.28084
const REASON_TEXT = (p: TorpedoPrediction): Readonly<Record<TorpedoReason, string>> => ({
  'too-fast': `TOO FAST ${Math.round(p.speedMps * MPH_PER_MPS)} MPH (MAX ${Math.round(p.maxSpeedMps * MPH_PER_MPS)})`,
  'too-high': `TOO HIGH ${Math.round(p.heightM * FEET_PER_METRE)} FT (MAX ${Math.round(p.maxHeightM * FEET_PER_METRE)})`,
  'not-over-sea': 'NOT OVER OPEN SEA',
  'doors-shut': 'BAY DOORS SHUT',
})
/** The torpedosight badge text (F6B): the verdict and the reason in words, never color alone; imperial units. */
export function torpedoLabel(on: boolean, p: TorpedoPrediction | null, from: Vec3): string | null {
  if (!on) return null
  if (p === null) return 'IMPACT MARKER'
  const entry = p.entry === null ? '' : ` · ENTRY ${milesOf(Math.hypot(p.entry.x - from.x, p.entry.z - from.z)).toFixed(1)} MI`
  const arms = ` · ARMS ${Math.round(p.armRunM * FEET_PER_METRE)} FT`
  if (p.valid) return `TORPEDOSIGHT DROP OK${entry}${arms}`
  const text = REASON_TEXT(p)
  return `TORPEDOSIGHT NO DROP: ${p.reasons.map((r) => text[r]).join(' / ')}${entry}${arms}`
}
/** What a screen reader hears, and the key that says when it has changed: the verdict and reasons only, never the changing miles. */
export function torpedoVerdict(p: TorpedoPrediction | null): { readonly key: string; readonly text: string } | null {
  if (p === null) return null
  if (p.valid) return { key: 'ok', text: 'Torpedo drop OK' }
  const words: Readonly<Record<TorpedoReason, string>> = { 'too-fast': 'too fast', 'too-high': 'too high', 'not-over-sea': 'not over open sea', 'doors-shut': 'bay doors shut' }
  return { key: p.reasons.join('+'), text: `Torpedo, no drop: ${p.reasons.map((r) => words[r]).join(', ')}` }
}
/** Announces a verdict only when it changes and at most once per `minGapMs` (a pilot flying an approach must not be chattered at). */
export function createAnnouncer(minGapMs = 1000): (v: { readonly key: string; readonly text: string } | null, nowMs: number) => string | null {
  let lastKey: string | null = null, lastAt = -Infinity
  return (v, nowMs) => {
    if (v === null) { lastKey = null; return null }
    if (v.key === lastKey || nowMs - lastAt < minGapMs) return null
    lastKey = v.key; lastAt = nowMs
    return v.text
  }
}
/** Memo of `predictTorpedoDrop`, as `createImpactPredictor` is for bombs: never called with the sight off, once per sim tick. */
export function createTorpedoPredictor(): (
  on: boolean, spec: AircraftSpec, state: AircraftState, stores: StoresState,
  terrain: TerrainField | null, wind: Vec3 | null, decks: readonly Deck[],
) => TorpedoPrediction | null {
  let last: { state: AircraftState; stores: StoresState; terrain: TerrainField | null; wind: Vec3 | null; spec: AircraftSpec; value: TorpedoPrediction | null } | null = null
  return (on, spec, state, stores, terrain, wind, decks) => {
    if (!on) return null
    if (last !== null && last.state === state && last.stores === stores && last.terrain === terrain && last.wind === wind && last.spec === spec) return last.value
    const value = predictTorpedoDrop(spec, state, stores, terrain, wind, decks)
    last = { state, stores, terrain, wind, spec, value }
    return value
  }
}
/** The arming bar is DASHED (this many dashes over 50 m) so it cannot be read as the invalid state's solid X. */
export const ARM_DASHES = 7
/** The marker's colors: bomb and rocket orange as before; a torpedo drop green when valid, red when not. */
export const SIGHT_COLORS = { plain: 0xff7a45, valid: 0x66f08a, invalid: 0xd92b22 } as const

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

/** The torpedosight's look: `valid` null is the plain bomb marker; a run line goes from the entry point along `dir`. */
export type SightStyle = { readonly valid: boolean | null; readonly run?: { readonly dir: Vec3; readonly armM: number; readonly lengthM: number } | null }
export type ImpactMarker = {
  readonly root: Group
  /** Poses the marker for this frame; returns the shown flag for diagnostics. */
  update(point: Vec3 | null, armed: boolean, camera: Camera, worldOffset: Vec3, shown: boolean, style?: SightStyle): boolean
}

export function createImpactMarker(): ImpactMarker {
  const material = new MeshBasicMaterial({
    color: 0xff7a45, side: DoubleSide, depthTest: false, depthWrite: false, transparent: true, opacity: 0.92, fog: false,
  })
  const ring = new Mesh(new RingGeometry(0.72, 1, 40), material)
  const dot = new Mesh(new CircleGeometry(0.14, 16), material)
  ring.renderOrder = dot.renderOrder = 10
  // A crossbar (an X) inside the ring when a torpedo drop is NOT valid: color is never the only signal.
  const bar = (angle: number): Mesh => { const m = new Mesh(new PlaneGeometry(1.7, 0.16), material); m.rotation.z = angle; m.renderOrder = 10; return m }
  const cross = new Group()
  cross.add(bar(Math.PI / 4), bar(-Math.PI / 4))
  cross.visible = false
  // The run after entry: a line along the drop heading with a tick at the arming distance (a hit before it is a dud).
  const lineMaterial = new LineBasicMaterial({ color: SIGHT_COLORS.valid, depthTest: false, depthWrite: false, transparent: true, opacity: 0.92, fog: false })
  const lineGeometry = new BufferGeometry()
  lineGeometry.setAttribute('position', new BufferAttribute(new Float32Array(3 * (2 + 2 * ARM_DASHES)), 3))
  const runLine = new LineSegments(lineGeometry, lineMaterial)
  runLine.renderOrder = 10
  runLine.frustumCulled = false
  runLine.visible = false
  const marker = new Group()
  marker.name = 'impactMarker'
  marker.add(ring, dot, cross)
  const root = new Group()
  root.name = 'impactMarker:root'
  root.add(marker, runLine)
  root.visible = false
  const view = new Vector3()
  return {
    root,
    update(point, armed, camera, worldOffset, shown, style) {
      root.visible = shown && point !== null
      if (!root.visible || point === null) return false
      const valid = style?.valid ?? null
      const color = valid === null ? SIGHT_COLORS.plain : valid ? SIGHT_COLORS.valid : SIGHT_COLORS.invalid
      material.color.setHex(color)
      lineMaterial.color.setHex(color)
      cross.visible = valid === false
      const run = style?.run ?? null
      runLine.visible = run !== null
      if (run !== null) {
        const a = lineGeometry.getAttribute('position') as BufferAttribute
        const d = run.dir, px = -d.z, pz = d.x // perpendicular, in the water plane
        const put = (i: number, x: number, z: number): void => { a.setXYZ(i, x, point.y + 0.5, z) }
        put(0, point.x, point.z); put(1, point.x + d.x * run.lengthM, point.z + d.z * run.lengthM)
        const tx = point.x + d.x * run.armM, tz = point.z + d.z * run.armM
        // Dashes across the run at the arming distance: 50 m wide, every other 50/(2n-1) m drawn.
        const unit = 50 / (2 * ARM_DASHES - 1)
        for (let k = 0; k < ARM_DASHES; k++) {
          const a0 = -25 + 2 * k * unit, a1 = a0 + unit
          put(2 + 2 * k, tx + px * a0, tz + pz * a0); put(3 + 2 * k, tx + px * a1, tz + pz * a1)
        }
        a.needsUpdate = true
      }
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
