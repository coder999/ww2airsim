import { Group, type MeshBasicMaterial, type Scene, type Vector3 } from 'three'
import { DT } from '../../sim/flight/model.js'
import type { World } from '../../sim/loop.js'
import { heightAt, SEA_LEVEL_M } from '../../sim/world/terrain.js'
import { v3, type Vec3 } from '../../sim/math/vec3.js'
import { lightsAt, type LightKind, type LightRuntime, type LightSpec, type LightWorld } from '../../sim/lights/lights.js'
import { acquireModel, type ModelInstance } from '../models/modelCache.js'
import { staticModelUrlFor } from '../scene/staticModels.js'
import { nightTuning } from '../sky/night.js'
import { createGlowBatch, type GlowBatch, type GlowInstance } from './glow.js'
import { emitterCentre, equipmentModelFor, lightLitMaterials, setLamp } from './equipment.js'

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
/** Equipment lit-node radiance: bright enough to bloom as a flame. */
const LAMP_RADIANCE = 8

/** FNV-1a of the id: a stable per-light phase, so flicker is render-only and never Math.random. */
export function idPhase(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) / 4294967296) * Math.PI * 2
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
  update(world: World<undefined>, timeS: number, pixelAngle: number): void
  /** The runtime lights of the last update, for tests and F6B-facing diagnostics. */
  lights(): readonly LightRuntime[]
  /** Where each drawn light's glow sits (world metres) as of the last update: the E2E contrast tests project these to pixels. */
  anchors(): readonly { readonly id: string; readonly kind: LightKind; readonly lit: boolean; readonly x: number; readonly y: number; readonly z: number }[]
  dispose(): void
}

export function createNightLights(scene: Scene): NightLights {
  const group = new Group()
  group.name = 'night lights'
  const glow: GlowBatch = createGlowBatch()
  group.add(glow.object)
  scene.add(group)
  let placed: Placed[] = []
  let last: readonly LightRuntime[] = []
  let anchorList: { id: string; kind: LightKind; lit: boolean; x: number; y: number; z: number }[] = []
  let generation = 0

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
    update(world, timeS, pixelAngle) {
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
        aircraftPoint: () => null, // aircraft fixture points arrive with Task 7
      }
      const specs = placed.map((p) => p.spec)
      last = lightsAt(specs, lw)
      const byId = new Map(last.map((l) => [l.id, l]))
      const glows: GlowInstance[] = []
      anchorList = []
      for (const p of placed) {
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
          }
        }
        anchorList.push({ id: l.id, kind: l.kind, lit, x: anchor.x, y: anchor.y, z: anchor.z })
        if (!lit) continue
        const k = GLOW_RADIANCE[l.kind] * nightTuning.glowScale * flicker(l.id, l.kind, timeS)
        glows.push({ x: anchor.x, y: anchor.y, z: anchor.z, sizeM: GLOW_SIZE_M[l.kind], r: l.color[0] * k, g: l.color[1] * k, b: l.color[2] * k })
      }
      glow.setPixelAngle(pixelAngle)
      glow.write(glows)
    },
    lights: () => last,
    anchors: () => anchorList,
    dispose() { generation++; clear(); group.remove(glow.object); scene.remove(group); glow.dispose() },
  }
}
