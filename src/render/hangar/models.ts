// src/render/hangar/models.ts
import { Group, Mesh, type Object3D } from 'three'
import type { Airframe, PartId } from '../scene/airframe.js'
import { loadRegisteredAirframe, type LoadAirframe } from '../scenarioEntities.js'
import { loadRegisteredShipView, type LoadShipView } from '../scene/shipModels.js'
import { batched, createBuildingMaterials, drawBuilding, makeCollector } from '../scene/buildings.js'
import { disposeMeshTree } from '../models/dispose.js'
import { createTerrainField, type TerrainField } from '../../sim/world/terrain.js'
import type { CatalogEntry } from './catalog.js'

/** What a bench row can drive (Hangar spec §8). H1 exposes gear, flaps and
 *  the propeller; H2 adds stores and Cycle, H3 turrets. */
export interface PartSpec {
  readonly id: 'gear' | 'flaps' | 'prop'
  readonly label: string
  readonly kind: 'fraction' | 'rate'
  readonly range: readonly [number, number]
  /** false = the model has no such geometry: the row reads "not modeled". */
  readonly modeled: boolean
}

export interface PartPose {
  readonly gearFraction?: number
  readonly flapFraction?: number
  readonly throttle?: number
}

export interface HangarModel {
  readonly root: Object3D
  readonly parts: readonly PartSpec[]
  pose(p: PartPose): void
  /** Advances the model's own clock (propeller) by `frameS`. */
  update(frameS: number): void
  counts(): { readonly triangles: number; readonly drawCalls: number }
  dispose(): void
}

const BENCH_PARTS: readonly Omit<PartSpec, 'modeled'>[] = [
  { id: 'gear', label: 'Landing gear', kind: 'fraction', range: [0, 1] },
  { id: 'flaps', label: 'Flaps', kind: 'fraction', range: [0, 1] },
  { id: 'prop', label: 'Throttle (propeller)', kind: 'rate', range: [0, 1] },
]

/** One row per bench part, `modeled` read off the airframe's own `parts`
 *  (Z1's `Airframe.parts`), so a missing part is reported, never hidden. */
export function partSpecsFor(parts: readonly PartId[]): PartSpec[] {
  return BENCH_PARTS.map((p) => ({ ...p, modeled: parts.includes(p.id) }))
}

/** Triangles and draw calls three.js issues for `root`: one draw per Mesh (per material group). */
export function sceneCounts(root: Object3D): { triangles: number; drawCalls: number } {
  let triangles = 0, drawCalls = 0
  root.traverse((o) => {
    if (!(o instanceof Mesh) || !o.visible) return
    const g = o.geometry
    const count = g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)
    triangles += Math.floor(count / 3)
    drawCalls += Math.max(1, g.groups.length)
  })
  return { triangles, drawCalls }
}

/** Height 0 everywhere, for `drawBuilding` on the hangar's flat pad (§6). */
export function flatField(): TerrainField {
  return createTerrainField(
    { centreLatDeg: 0, centreLonDeg: 0, halfExtentM: 100_000, finestSamples: 3, levels: 1, encoding: 'int16-decimetres' },
    0, new Int16Array(9),
  )
}

function staticModel(root: Object3D): HangarModel {
  return {
    root,
    parts: [],
    pose(): void {},
    update(): void {},
    counts: () => sceneCounts(root),
    dispose: () => disposeMeshTree(root),
  }
}

function aircraftModel(airframe: Airframe, gearHeightM: number): HangarModel {
  // The airframe's origin is its CG on the thrust line; the stand lifts it
  // by the spec's own gear height so the wheels meet the y = 0 grid. A model
  // whose wheels do not meet the grid is a finding, which is the point.
  const stand = new Group()
  stand.name = 'aircraft stand'
  stand.position.y = gearHeightM
  stand.add(airframe.root)
  let gearFraction = 1, flapFraction = 0, throttle = 0
  const apply = (frameS: number): void => {
    airframe.update({ gearFraction, flapFraction, throttle, controls: { roll: 0, pitch: 0, yaw: 0 }, frameS, cameraDistanceM: 0 })
  }
  return {
    root: stand,
    parts: partSpecsFor(airframe.parts),
    // Applied at once with frameS 0 (the propeller does not advance), so a
    // pose shows on a frozen page too; before this, it waited for the next
    // update, which a frozen page never runs (H1 Tier 2 check 2, 2026-09-25).
    pose(p): void {
      if (p.gearFraction !== undefined) gearFraction = p.gearFraction
      if (p.flapFraction !== undefined) flapFraction = p.flapFraction
      if (p.throttle !== undefined) throttle = p.throttle
      apply(0)
    },
    update(frameS): void {
      apply(frameS)
    },
    counts: () => sceneCounts(stand),
    dispose: () => airframe.dispose(),
  }
}

/**
 * The ONLY module that knows where geometry comes from (Hangar spec §7).
 * Aircraft load through Z1's registry, by `spec.view.model`, exactly as the
 * game does; ships through the ship-models loader (S1), also exactly as the
 * game does, boxes included when a spec has no model; buildings through
 * `drawBuilding` on a flat field. null = "Not yet in service".
 */
export async function loadHangarModel(entry: CatalogEntry, loadAirframe: LoadAirframe = loadRegisteredAirframe, loadShip: LoadShipView = loadRegisteredShipView): Promise<HangarModel | null> {
  const s = entry.subject
  if (s === null) return null
  if (s.kind === 'aircraft') {
    const airframe = await loadAirframe(s.spec.view.model)
    const model = aircraftModel(airframe, s.spec.gear.heightM)
    model.update(0)
    return model
  }
  if (s.kind === 'ship') {
    // Through the view's own dispose: a model view releases its shared instance.
    const view = await loadShip(s.spec)
    return { ...staticModel(view.root), dispose: () => view.dispose() }
  }
  // The largest footprint of this kind stands for all of them.
  const b = [...s.placements].sort((x, y) => y.building.widthM * y.building.lengthM - x.building.widthM * x.building.lengthM)[0]!.building
  const collector = makeCollector()
  drawBuilding(collector, { kind: b.kind, x: 0, z: 0, width: b.widthM, length: b.lengthM }, flatField(), createBuildingMaterials())
  return staticModel(batched(new Group(), collector.batches))
}
