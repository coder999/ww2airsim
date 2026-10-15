import { Group, type MeshBasicMaterial, type Scene, type Vector3 } from 'three'
import { DT } from '../../sim/flight/model.js'
import type { World } from '../../sim/loop.js'
import { heightAt, SEA_LEVEL_M } from '../../sim/world/terrain.js'
import { v3, type Vec3 } from '../../sim/math/vec3.js'
import { navLightPose } from '../../sim/lights/airframeLights.js'
import { LIGHT_CAPS, lightsAt, type LightKind, type LightRuntime, type LightSpec, type LightWorld } from '../../sim/lights/lights.js'
import { acquireModel, type ModelInstance } from '../models/modelCache.js'
import { staticModelUrlFor } from '../scene/staticModels.js'
import { nightTuning } from '../sky/night.js'
import { selectLit, limitGlows } from './select.js'
import { writeLightUniforms } from './irradiance.js'
import { LIGHT_GAIN } from './irradiance.js'
import { createGlowBatch, type GlowBatch, type GlowInstance } from './glow.js'
import { aimSearchlight, emitterCentre, equipmentModelFor, lightLitMaterials, setLamp } from './equipment.js'
import { beamLength, createBeams, type BeamInstance, type Beams } from './beam.js'
import { Box3, Vector3 as V3 } from 'three'

/**
 * The renderer's half of the light contract (F6A): it owns the equipment
 * models and the glow batch for one scenario's `lights`, and every frame
 * draws what `lightsAt` says. It never mutates the world; `lightsAt` is a
 * pure function of tick and world state (src/sim/lights/lights.ts).
 *
 * LOOK CONSTANTS (tunable, starting values chosen by eye at CP1; the glow
 * must read against the night floor, plan §3.5a): the core radiance of each
 * kind (HDR, before exposure) and the halo's world diameter.
 */
export const GLOW_RADIANCE: Readonly<Record<LightKind, number>> = { pot: 26, fixture: 34, flare: 110, searchlight: 40, nav: 24 }
export const GLOW_SIZE_M: Readonly<Record<LightKind, number>> = { pot: 3, fixture: 4.5, flare: 75, searchlight: 4, nav: 1.6 }
/** Largest apparent diameter of a halo, radians (0.010 rad is about 0.6 degrees, 20 px at 1080p): without it a pot 50 m away is a 100 px blob. */
export const GLOW_MAX_ANGLE: Readonly<Record<LightKind, number>> = { pot: 0.010, fixture: 0.012, flare: 0.06, searchlight: 0.012, nav: 0.008 }
/** Equipment lit-node radiance: bright enough to bloom as a flame. */
const LAMP_RADIANCE = 8

/** FNV-1a of the id: a stable per-light phase, so flicker is render-only and never Math.random. */
export function idPhase(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) / 4294967296) * Math.PI * 2
}
/**
 * 1 when the eye is inside a directional light's visibility cone, falling to 0 over the 8 degrees
 * past its edge, 0 beyond (a red port light cannot be seen from the starboard side). Omnidirectional lights: 1.
 */
export function arcVisibility(l: LightRuntime, eye: Vec3): number {
  if (l.axis === undefined || l.coneHalfAngleRad === undefined) return 1
  const dx = eye.x - l.positionM.x, dy = eye.y - l.positionM.y, dz = eye.z - l.positionM.z
  const d = Math.hypot(dx, dy, dz)
  if (d === 0) return 1
  const c = (dx * l.axis.x + dy * l.axis.y + dz * l.axis.z) / d
  const edge = Math.cos(l.coneHalfAngleRad)
  const soft = edge - Math.cos(l.coneHalfAngleRad + (8 * Math.PI) / 180)
  return Math.min(1, Math.max(0, (c - (edge - soft)) / soft))
}
/** Render-only brightness wobble of a flame, 0.85 to 1.15, from id and render time. */
export function flicker(id: string, kind: LightKind, timeS: number): number {
  if (kind !== 'pot' && kind !== 'flare') return 1
  const p = idPhase(id)
  return 1 + 0.09 * Math.sin(timeS * 11.3 + p) + 0.06 * Math.sin(timeS * 23.7 + p * 2.1)
}

type Placed = {
  readonly spec: LightSpec
  readonly model: string | null
  readonly instance: ModelInstance | null
  readonly lamps: MeshBasicMaterial[]
  /** Glow anchor relative to the model root, metres. */
  readonly emitter: Vector3 | null
}

export type NightLights = {
  setScenario(specs: readonly LightSpec[]): Promise<void>
  /** Draws the frame's lights. `timeS` is render time (flicker only). */
  update(world: World<undefined>, timeS: number, pixelAngle: number, eye: Vec3, cloudBaseM?: number | null, playerLightsOn?: boolean): void
  /** The beams drawn at the last update (origin at the lamp face, axis, length): for tests. */
  beamsDrawn(): readonly BeamInstance[]
  /** The runtime lights of the last update, for tests and F6B-facing diagnostics. */
  lights(): readonly LightRuntime[]
  /** Where each drawn light's glow sits (world metres) as of the last update: the E2E contrast tests project these to pixels. */
  /** The (at most 8) lights that illuminated the world at the last update. */
  selected(): readonly LightRuntime[]
  anchors(): readonly { readonly id: string; readonly kind: LightKind; readonly lit: boolean; readonly x: number; readonly y: number; readonly z: number }[]
  dispose(): void
}

export function createNightLights(scene: Scene): NightLights {
  const group = new Group()
  group.name = 'night lights'
  const glow: GlowBatch = createGlowBatch()
  group.add(glow.object)
  const beams: Beams = createBeams((m) => group.add(m), (m) => group.remove(m))
  const faceBox = new Box3(), faceCentre = new V3()
  let beamList: BeamInstance[] = []
  scene.add(group)
  let placed: Placed[] = []
  let last: readonly LightRuntime[] = []
  let anchorList: { id: string; kind: LightKind; lit: boolean; x: number; y: number; z: number }[] = []
  let generation = 0
  let litIds: ReadonlySet<string> = new Set()
  let selectedList: readonly LightRuntime[] = []

  const clear = (): void => {
    for (const p of placed) {
      if (p.instance !== null) { group.remove(p.instance.root); p.instance.release() }
      for (const m of p.lamps) m.dispose()
    }
    placed = []
  }

  return {
    async setScenario(specs) {
      const mine = ++generation
      const next: Placed[] = []
      for (const spec of specs) {
        const model = equipmentModelFor(spec.kind, spec.color)
        if (model === null) { next.push({ spec, model, instance: null, lamps: [], emitter: null }); continue }
        const instance = await acquireModel(staticModelUrlFor('equipment', model))
        const lamps = lightLitMaterials(instance.root, model, [1, 0.6, 0.25], LAMP_RADIANCE)
        instance.root.name = `light ${spec.id}`
        group.add(instance.root)
        next.push({ spec, model, instance, lamps, emitter: emitterCentre(instance.root, model) })
      }
      if (mine !== generation) { for (const p of next) { p.instance?.release(); for (const m of p.lamps) m.dispose() }; return }
      clear()
      placed = next
    },
    update(world, timeS, pixelAngle, eye, cloudBaseM = null, playerLightsOn = true) {
      const field = world.terrain
      const lw: LightWorld = {
        tick: world.tick, dtS: DT,
        groundHeightM: (x, z) => (field === null ? SEA_LEVEL_M : Math.max(SEA_LEVEL_M, heightAt(field, x, z))),
        shipPoint(shipId, o) {
          const s = world.ships.find((e) => e.id === shipId)
          if (s === undefined) return null
          const h = s.state.headingRad
          // Ship frame: x forward (bow), y up, z starboard.
          return v3(
            s.state.position.x + Math.sin(h) * o[0] + Math.cos(h) * o[2],
            s.state.position.y + o[1],
            s.state.position.z - Math.cos(h) * o[0] + Math.sin(h) * o[2],
          )
        },
        aircraftPoint(aircraftId, point) {
          const a = world.aircraft.find((e) => e.id === aircraftId)
          return a === undefined ? null : navLightPose(a.spec.id, point, a.state.position, a.state.attitude)
        },
      }
      // The player's lights switch (N): a nav light on the player's aircraft goes dark unless authored `blackoutExempt`.
      const specs = placed.map((p) => (!playerLightsOn && p.spec.kind === 'nav' && 'aircraft' in p.spec.at && p.spec.at.aircraft === world.player && p.spec.blackoutExempt !== true ? { ...p.spec, state: 'off' as const } : p.spec))
      last = lightsAt(specs, lw)
      const byId = new Map(last.map((l) => [l.id, l]))
      // The 8 lights that illuminate ground, sea and airframes (selection with hysteresis), as uniforms.
      const chosen = selectLit(last, eye, litIds)
      litIds = new Set(chosen.map((l) => l.id))
      selectedList = chosen
      writeLightUniforms(chosen, eye, LIGHT_GAIN * nightTuning.lightScale)
      const drawn = new Set(limitGlows(last, eye).map((l) => l.id))
      const glows: GlowInstance[] = []
      anchorList = []
      beamList = []
      // Aircraft position lights: sprites only, each drawn only from inside its visibility arc (a red port light is
      // not seen from the starboard side), fading at the arc's edge.
      for (const l of last) {
        if (l.kind !== 'nav') continue
        const lit = l.intensityCd > 0
        // `lit` here means "a visible glow this frame": burning, drawn (cap, range) and seen from inside its arc.
        const f = arcVisibility(l, eye)
        const seen = lit && drawn.has(l.id) && f > 0
        anchorList.push({ id: l.id, kind: l.kind, lit: seen, x: l.positionM.x, y: l.positionM.y, z: l.positionM.z })
        if (!seen) continue
        const k = GLOW_RADIANCE.nav * nightTuning.glowScale * f
        glows.push({ x: l.positionM.x, y: l.positionM.y, z: l.positionM.z, sizeM: GLOW_SIZE_M.nav, maxAngle: GLOW_MAX_ANGLE.nav, r: l.color[0] * k, g: l.color[1] * k, b: l.color[2] * k })
      }
      for (const p of placed) {
        if (p.spec.kind === 'nav') continue
        const l = byId.get(p.spec.id)
        if (l === undefined) { if (p.instance !== null) p.instance.root.visible = false; continue }
        const lit = l.intensityCd > 0
        let anchor: Vec3 = l.positionM
        if (p.instance !== null && p.model !== null) {
          const root = p.instance.root
          const e = p.emitter!
          if (p.spec.kind === 'flare') {
            root.visible = lit
            root.position.set(l.positionM.x - e.x, l.positionM.y - e.y, l.positionM.z - e.z)
            anchor = l.positionM
          } else {
            root.visible = true
            root.position.set(l.positionM.x, l.positionM.y, l.positionM.z)
            anchor = v3(l.positionM.x + e.x, l.positionM.y + e.y, l.positionM.z + e.z)
            setLamp(root, p.model, lit)
            if (p.spec.kind === 'searchlight' && l.axis !== undefined) {
              // Aim the model by the contract's axis; the beam and its glow leave the lamp face.
              const el = (Math.asin(Math.max(-1, Math.min(1, l.axis.y))) * 180) / Math.PI
              const az = (Math.atan2(l.axis.x, -l.axis.z) * 180) / Math.PI
              aimSearchlight(root, az, el)
              root.updateWorldMatrix(true, true)
              const face = root.getObjectByName('LampFace')!
              faceBox.setFromObject(face).getCenter(faceCentre)
              faceCentre.sub(scene.position) // back from the camera-relative scene to true world metres
              anchor = v3(faceCentre.x, faceCentre.y, faceCentre.z)
              if (lit && beamList.length < LIGHT_CAPS.searchlights) {
                const hit = beamLength(anchor, l.axis, lw.groundHeightM, cloudBaseM)
                beamList.push({ origin: anchor, axis: l.axis, lengthM: hit.lengthM, gain: nightTuning.glowScale })
                if (hit.hit !== null) {
                  const e = hit.lengthM
                  glows.push({ x: anchor.x + l.axis.x * e, y: anchor.y + l.axis.y * e, z: anchor.z + l.axis.z * e, sizeM: 90, maxAngle: 0.05, r: 14 * nightTuning.glowScale, g: 16 * nightTuning.glowScale, b: 18 * nightTuning.glowScale })
                }
              }
            }
          }
        }
        anchorList.push({ id: l.id, kind: l.kind, lit, x: anchor.x, y: anchor.y, z: anchor.z })
        if (!lit || !drawn.has(l.id)) continue
        const k = GLOW_RADIANCE[l.kind] * nightTuning.glowScale * flicker(l.id, l.kind, timeS)
        glows.push({ x: anchor.x, y: anchor.y, z: anchor.z, sizeM: GLOW_SIZE_M[l.kind], maxAngle: GLOW_MAX_ANGLE[l.kind], r: l.color[0] * k, g: l.color[1] * k, b: l.color[2] * k })
      }
      glow.setPixelAngle(pixelAngle)
      glow.write(glows)
      beams.update(beamList)
    },
    lights: () => last,
    beamsDrawn: () => beamList,
    anchors: () => anchorList,
    selected: () => selectedList,
    dispose() { generation++; clear(); beams.dispose(); group.remove(glow.object); scene.remove(group); glow.dispose() },
  }
}
