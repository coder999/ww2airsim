import { Box3, MeshBasicMaterial, Vector3, type Mesh, type Object3D } from 'three'
import type { LightKind, LightColor } from '../../sim/lights/lights.js'

/**
 * Which named nodes of each F4 equipment model are the lamp (plan §2.2 item 8):
 * the GLBs carry lit and unlit marker nodes as flat review colors, so a light's
 * state is a visibility swap and the lit node takes an HDR material. A model
 * that fails to carry a named node THROWS, naming the node, so a Blender
 * rename cannot silently turn a lamp off (tests/render/lights.test.ts enrolls
 * every entry against the committed glb).
 */
export type LampNodes = {
  /** Visible only while the light is lit. */
  readonly lit: readonly string[]
  /** Visible only while it is not. */
  readonly unlit: readonly string[]
  /** The lit node whose bounds centre is where the glow and the light's position sit. */
  readonly emitter: string
}

export const EQUIPMENT_LAMPS: Readonly<Record<string, LampNodes>> = {
  'portable-runway-flare-pot': { lit: ['LitMarker'], unlit: ['UnlitMarker'], emitter: 'LitMarker' },
  'panirugan-red-harbor-light': { lit: ['LensLit'], unlit: ['LensUnlit'], emitter: 'LensLit' },
  'ranger-temporary-nav-light': { lit: ['LensLit'], unlit: ['LensUnlit'], emitter: 'LensLit' },
  // A flare has no unlit state: it is dropped burning. Its canopy and lines ride with the flame.
  'm24-aircraft-parachute-flare': { lit: ['LampBurningMarker', 'CanopyDeployed', 'SuspensionLines'], unlit: [], emitter: 'LampBurningMarker' },
  'm1942-60in-searchlight': { lit: ['BeamMarker'], unlit: [], emitter: 'LampFace' },
}

/** The equipment model that draws a light of this kind and color. */
export function equipmentModelFor(kind: LightKind, color: LightColor): string | null {
  switch (kind) {
    case 'pot': return 'portable-runway-flare-pot'
    case 'fixture': return color === 'red' ? 'panirugan-red-harbor-light' : 'ranger-temporary-nav-light'
    case 'flare': return 'm24-aircraft-parachute-flare'
    case 'searchlight': return 'm1942-60in-searchlight'
    case 'nav': return null // an aircraft's own lights: drawn as glow only
  }
}

const need = (root: Object3D, model: string, name: string): Object3D => {
  const n = root.getObjectByName(name)
  if (n === undefined) throw new Error(`equipment ${model}: no node "${name}" (the lamp table in src/render/lights/equipment.ts names it)`)
  return n
}

/** Swaps the named lamp nodes for `lit`; every other node is left alone. */
export function setLamp(root: Object3D, model: string, lit: boolean): void {
  const lamp = EQUIPMENT_LAMPS[model]
  if (lamp === undefined) throw new Error(`no lamp table for equipment "${model}"`)
  for (const n of lamp.lit) need(root, model, n).visible = lit
  for (const n of lamp.unlit) need(root, model, n).visible = !lit
}

/** Model-space centre of the emitter node, for the glow anchor. */
export function emitterCentre(root: Object3D, model: string): Vector3 {
  const lamp = EQUIPMENT_LAMPS[model]!
  root.updateWorldMatrix(true, true)
  return new Box3().setFromObject(need(root, model, lamp.emitter)).getCenter(new Vector3())
}

/** The lit node draws unlit and bright (HDR), so it reads as a flame and blooms. Own materials: shared ones are never mutated. */
export function lightLitMaterials(root: Object3D, model: string, rgb: readonly [number, number, number], radiance: number): MeshBasicMaterial[] {
  const lamp = EQUIPMENT_LAMPS[model]!
  const made: MeshBasicMaterial[] = []
  for (const name of lamp.lit) {
    if (name === 'CanopyDeployed' || name === 'SuspensionLines') continue // fabric stays as authored
    need(root, model, name).traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      const m = new MeshBasicMaterial({ toneMapped: true })
      m.color.setRGB(rgb[0] * radiance, rgb[1] * radiance, rgb[2] * radiance)
      mesh.material = m
      made.push(m)
    })
  }
  return made
}

/**
 * Aims a 60-inch searchlight model at a compass azimuth and an elevation (radians). The model's lamp
 * looks along +X; `Train` turns about the vertical, and the lamp tilts about ITS OWN pivot (the
 * Hangar rig in vehicleRig.ts tilts about the model origin, which swings the lamp around the base, and
 * is a review pose, not an aim). Returns the lamp face's model-space centre.
 */
export const SEARCHLIGHT_PIVOT_Y = 1.1
export function aimSearchlight(root: Object3D, azimuthDeg: number, elevationDeg: number): void {
  const train = need(root, 'm1942-60in-searchlight', 'Train')
  const lamp = need(root, 'm1942-60in-searchlight', 'Lamp')
  // Reparent at rest (attach keeps world transforms, so doing it after turning would cancel the turn).
  if (lamp.parent !== train) train.attach(lamp)
  for (const n of ['LampFace', 'BeamMarker']) { const f = need(root, 'm1942-60in-searchlight', n); if (f.parent !== lamp) lamp.attach(f) }
  // Compass azimuth 0 is north (-z), 90 east (+x). +X rotated by theta about +Y goes to (cos, 0, -sin), so theta = 90 - azimuth.
  train.rotation.set(0, ((90 - azimuthDeg) * Math.PI) / 180, 0)
  const phi = (elevationDeg * Math.PI) / 180
  lamp.rotation.set(0, 0, phi)
  // Rotate about the lamp's pivot (0, SEARCHLIGHT_PIVOT_Y, 0): position = pivot - R * pivot.
  lamp.position.set(SEARCHLIGHT_PIVOT_Y * Math.sin(phi), SEARCHLIGHT_PIVOT_Y * (1 - Math.cos(phi)), 0)
}
