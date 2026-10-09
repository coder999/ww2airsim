// src/render/hangar/models.ts
import { Box3, Group, Mesh, Vector3, type Object3D } from 'three'
import type { Airframe, PartId } from '../scene/airframe.js'
import { loadRegisteredAirframe, type LoadAirframe } from '../scenarioEntities.js'
import { loadRegisteredShipView, shipModelUrlFor, type LoadShipView } from '../scene/shipModels.js'
import type { ShipMountView } from '../scene/ship.js'
import { batched, createBuildingMaterials, drawBuilding, makeCollector } from '../scene/buildings.js'
import { disposeMeshTree } from '../models/dispose.js'
import type { StoreMounts } from '../scene/stores.js'
import { createTerrainField, type TerrainField } from '../../sim/world/terrain.js'
import { acquireModel, type ModelInstance } from '../models/modelCache.js'
import { ordnanceModelUrl } from '../content.js'
import type { CatalogEntry } from './catalog.js'
import type { ModelRef } from './library.js'
import { staticModelUrlFor } from '../scene/staticModels.js'

/** What a bench row can drive (Hangar spec §8). H1 exposes gear, flaps and
 *  the propeller; H2 adds stores (and Cycle, in the bench); H3 turrets. */
export interface PartSpec {
  readonly id: 'gear' | 'flaps' | 'doors' | 'prop' | 'surfaces' | 'stores'
  readonly label: string
  /** `stick`: three sliders, roll, pitch and yaw, each over `range` (C1). */
  readonly kind: 'fraction' | 'rate' | 'toggle' | 'stick'
  readonly range: readonly [number, number]
  /** false = the model has no such geometry: the row reads "not modeled". */
  readonly modeled: boolean
}

export interface PartPose {
  readonly gearFraction?: number
  readonly flapFraction?: number
  /** Bomb-bay doors, 0 shut to 1 open (C2). */
  readonly bayDoorFraction?: number
  readonly throttle?: number
  /** The pilot's stick and rudder, each in [-1, 1], for the control surfaces (C1). */
  readonly roll?: number
  readonly pitch?: number
  readonly yaw?: number
  /** Bombs on the racks (true) or dropped (false); H2. */
  readonly bombs?: boolean
  /** Rockets on the rails (true) or fired (false); H2. */
  readonly rockets?: boolean
}

export interface HangarModel {
  readonly root: Object3D
  readonly parts: readonly PartSpec[]
  /** Nodes the bench actually moves (gear legs, propeller, flaps), found by probing; [] for ships and buildings. */
  readonly articulated: readonly Object3D[]
  /** Each hung store's mount id and world position (O1); [] for ships, buildings and ordnance. */
  mounts(): readonly { readonly id: string; readonly world: Vector3 }[]
  pose(p: PartPose): void
  /** Advances the model's own clock (propeller) by `frameS`. */
  update(frameS: number): void
  counts(): { readonly triangles: number; readonly drawCalls: number }
  /** A ship's instanced gun mounts (Track M, M1), each trainable alone; absent for everything else. */
  readonly gunMounts?: readonly ShipMountView[]
  dispose(): void
}

const BENCH_PARTS: readonly Omit<PartSpec, 'modeled'>[] = [
  { id: 'gear', label: 'Landing gear', kind: 'fraction', range: [0, 1] },
  { id: 'flaps', label: 'Flaps', kind: 'fraction', range: [0, 1] },
  { id: 'doors', label: 'Bay doors', kind: 'fraction', range: [0, 1] },
  { id: 'prop', label: 'Throttle (propeller)', kind: 'rate', range: [0, 1] },
  { id: 'surfaces', label: 'Control surfaces', kind: 'stick', range: [-1, 1] },
  { id: 'stores', label: 'Stores', kind: 'toggle', range: [0, 1] },
]

/** One row per bench part, `modeled` read off the airframe's own `parts`
 *  (Z1's `Airframe.parts`), so a missing part is reported, never hidden. */
export function partSpecsFor(parts: readonly PartId[]): PartSpec[] {
  return BENCH_PARTS.map((p) => ({ ...p, modeled: parts.includes(p.id) }))
}

/** Triangles and draw calls three.js issues for `root`: one draw per visible
 *  Mesh, or one per geometry group when its material is an array (three
 *  splits by group only then; a BoxGeometry's six groups under one material
 *  are one draw, which H1 counted as six until H2's budget readout, 2026-09-26). */
export function sceneCounts(root: Object3D): { triangles: number; drawCalls: number } {
  let triangles = 0, drawCalls = 0
  root.traverse((o) => {
    if (!(o instanceof Mesh) || !o.visible) return
    const g = o.geometry
    const count = g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)
    triangles += Math.floor(count / 3)
    drawCalls += Array.isArray(o.material) ? Math.max(1, g.groups.length) : 1
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

/**
 * The nodes a pose actually moves (the bench's pivot gizmos, spec §8): every
 * node's LOCAL transform is read at rest (gear down, flaps up), again with
 * gear up, flaps down and a propeller step, and the ones that changed are
 * returned. Probing what moves, rather than trusting a name list, is the
 * point: a wrong pivot shows as a gizmo in the wrong place. Leaves gear and
 * flaps at rest; the propeller keeps its advanced angle, which is cosmetic.
 */
export function probeArticulated(root: Object3D, drive: (u: { gearFraction: number; flapFraction: number; bayDoorFraction: number; throttle: number; controls: { roll: number; pitch: number; yaw: number }; frameS: number }) => void): Object3D[] {
  const read = (): Map<Object3D, string> => {
    const m = new Map<Object3D, string>()
    root.traverse((o) => m.set(o, [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()].map((v) => v.toFixed(6)).join(',')))
    return m
  }
  const still = { roll: 0, pitch: 0, yaw: 0 }
  drive({ gearFraction: 1, flapFraction: 0, bayDoorFraction: 0, throttle: 0, controls: still, frameS: 0 })
  const before = read()
  // frameS 0 would leave the propeller still; at 0.05 s the control surfaces slew a third of the way (C1), enough to show.
  drive({ gearFraction: 0, flapFraction: 1, bayDoorFraction: 1, throttle: 1, controls: { roll: 1, pitch: 1, yaw: 1 }, frameS: 0.05 })
  const after = read()
  drive({ gearFraction: 1, flapFraction: 0, bayDoorFraction: 0, throttle: 0, controls: still, frameS: 0 })
  return [...before].filter(([o, k]) => after.get(o) !== k).map(([o]) => o)
}

function staticModel(root: Object3D): HangarModel {
  return {
    root,
    parts: [],
    articulated: [],
    mounts: () => [],
    pose(): void {},
    update(): void {},
    counts: () => sceneCounts(root),
    dispose: () => disposeMeshTree(root),
  }
}

function aircraftModel(airframe: Airframe, gearHeightM: number, mounts: StoreMounts | undefined): HangarModel {
  // The airframe's origin is its CG on the thrust line; the stand lifts it
  // by the spec's own gear height so the wheels meet the y = 0 grid. A model
  // whose wheels do not meet the grid is a finding, which is the point.
  const stand = new Group()
  stand.name = 'aircraft stand'
  stand.position.y = gearHeightM
  stand.add(airframe.root)
  let gearFraction = 1, flapFraction = 0, bayDoorFraction = 0, throttle = 0
  let controls = { roll: 0, pitch: 0, yaw: 0 }
  let bombs = true, rockets = true
  const apply = (frameS: number): void => {
    airframe.update({ gearFraction, flapFraction, bayDoorFraction, throttle, controls, frameS, cameraDistanceM: 0 })
  }
  const articulated = probeArticulated(airframe.root, (u) => airframe.update({ ...u, cameraDistanceM: 0 }))
  apply(0)
  return {
    root: stand,
    parts: partSpecsFor(airframe.parts),
    articulated,
    mounts: () => [...(mounts?.racks ?? []), ...(mounts?.rails ?? [])].flatMap((m) => {
      const o = airframe.root.getObjectByName(m.id)
      return o ? [{ id: m.id, world: o.getWorldPosition(new Vector3()) }] : []
    }),
    // Applied at once with frameS 0 (the propeller does not advance), so a
    // pose shows on a frozen page too; before this, it waited for the next
    // update, which a frozen page never runs (H1 E2E check 2, 2026-09-25).
    pose(p): void {
      if (p.gearFraction !== undefined) gearFraction = p.gearFraction
      if (p.flapFraction !== undefined) flapFraction = p.flapFraction
      if (p.bayDoorFraction !== undefined) bayDoorFraction = p.bayDoorFraction
      if (p.throttle !== undefined) throttle = p.throttle
      controls = { roll: p.roll ?? controls.roll, pitch: p.pitch ?? controls.pitch, yaw: p.yaw ?? controls.yaw }
      if (p.bombs !== undefined || p.rockets !== undefined) {
        bombs = p.bombs ?? bombs
        rockets = p.rockets ?? rockets
        airframe.setStores(bombs ? mounts?.racks.length ?? 0 : 0, rockets ? mounts?.rails.length ?? 0 : 0)
      }
      apply(0)
    },
    update(frameS): void {
      apply(frameS)
    },
    counts: () => sceneCounts(stand),
    dispose: () => airframe.dispose(),
  }
}

/** Loads a store's own model by its store type id (O1). */
export type LoadStore = (storeId: string) => Promise<ModelInstance>

const loadRegisteredStore: LoadStore = (id) => acquireModel(ordnanceModelUrl(id))

/** Loads a ship, building or vehicle model named by an entry's own `model` (R1). */
export type LoadDisplay = (ref: ModelRef) => Promise<ModelInstance>

/** The committed glb a display model resolves to, through its kind's registry. */
export function displayModelUrl(ref: ModelRef): string {
  if (ref.kind === 'ship') return shipModelUrlFor(ref.id)
  if (ref.kind === 'building' || ref.kind === 'vehicle') return staticModelUrlFor(ref.kind, ref.id)
  throw new Error(`displayModelUrl: aircraft model "${ref.id}" loads through the airframe registry, not as a static model`)
}

const loadRegisteredDisplay: LoadDisplay = (ref) => acquireModel(displayModelUrl(ref))

/**
 * An entry's own model (model-roster spec §4.3), drawn in place of the spec's view.model, in the
 * Hangar only. It stands on the pad by its own bounds, not by a spec's gear height, because it
 * need not be the model the spec flies (the Hellcat's is, since sortie forms A4), and it hangs no stores. Ships stand at their waterline origin, and
 * buildings and vehicles on their own y = 0 (the Blender kit's frame, spec §4.2).
 */
async function displayModel(ref: ModelRef, loadAirframe: LoadAirframe, loadDisplay: LoadDisplay): Promise<HangarModel> {
  if (ref.kind === 'aircraft') {
    const model = aircraftModel(await loadAirframe(ref.id, undefined), 0, undefined)
    model.update(0)
    model.root.position.y = -new Box3().setFromObject(model.root).min.y
    return model
  }
  const instance = await loadDisplay(ref)
  return { ...staticModel(instance.root), dispose: () => instance.release() }
}

/**
 * The ONLY module that knows where geometry comes from (Hangar spec §7).
 * Aircraft load through Z1's registry, by `spec.view.model`, exactly as the
 * game does; ships through the ship-models loader (S1), also exactly as the
 * game does, boxes included when a spec has no model; buildings through
 * `drawBuilding` on a flat field; ordnance through the model cache, exactly
 * as the game's in-flight pools do (O1). An entry's own `model` wins over its
 * spec (R1). null = neither: "Not yet in service".
 */
export async function loadHangarModel(entry: CatalogEntry, loadAirframe: LoadAirframe = loadRegisteredAirframe, loadShip: LoadShipView = loadRegisteredShipView, loadStore: LoadStore = loadRegisteredStore, loadDisplay: LoadDisplay = loadRegisteredDisplay): Promise<HangarModel | null> {
  if (entry.library.model !== undefined) return displayModel(entry.library.model, loadAirframe, loadDisplay)
  const s = entry.subject
  if (s === null) return null
  if (s.kind === 'aircraft') {
    const airframe = await loadAirframe(s.spec.view.model, s.spec.stores)
    const model = aircraftModel(airframe, s.spec.gear.heightM, s.spec.stores)
    model.update(0)
    return model
  }
  if (s.kind === 'ship') {
    // Through the view's own dispose: a model view releases its shared instance.
    const view = await loadShip(s.spec)
    return { ...staticModel(view.root), gunMounts: view.mounts, dispose: () => view.dispose() }
  }
  if (s.kind === 'ordnance') {
    // Its origin is the suspension point with the body below it: stand it clear of the pad.
    const instance = await loadStore(s.storeId)
    const stand = new Group()
    stand.name = 'ordnance stand'
    stand.add(instance.root)
    stand.position.y = -new Box3().setFromObject(instance.root).min.y + 0.2
    return { ...staticModel(stand), dispose: () => instance.release() }
  }
  // The largest footprint of this kind stands for all of them.
  const b = [...s.placements].sort((x, y) => y.building.widthM * y.building.lengthM - x.building.widthM * x.building.lengthM)[0]!.building
  const collector = makeCollector()
  drawBuilding(collector, { kind: b.kind, x: 0, z: 0, width: b.widthM, length: b.lengthM }, flatField(), createBuildingMaterials())
  return staticModel(batched(new Group(), collector.batches))
}
