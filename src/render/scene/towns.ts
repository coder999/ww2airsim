import { Group, type Object3D } from 'three'
import { heightAt, type TerrainField } from '../../sim/world/terrain.js'
import { toLocal } from '../../sim/world/projection.js'
import type { Airfield } from '../../sim/world/airfields.js'
import { inAirfieldClearing } from './airfield.js'
import { createRng } from '../../sim/rng.js'
import { batched, createBuildingMaterials, drawBuilding, makeCollector } from './buildings.js'

/**
 * Towns and villages as deterministic hut rings (Plan 13d Task 3, design doc
 * §7): "Rendered as a deterministic ring of huts reusing
 * `src/render/scene/airfield.ts`'s hut geometry (a `town` gets three rings, a
 * `village` one), seeded from the node id, on land (`heightAt > 0.5`), never
 * inside the airfield clearing, and each hut's footprint is cleared of trees
 * the way the airfield's is."
 *
 * Shape of `content/scenery/places.json`'s `towns` array -- imported raw in
 * `main.ts`, the same trust level `rivers.ts` already gives that file's
 * `roads`/rivers.json's own array (no zod schema; it is build-time content,
 * not user input). `size` only ever drives the `=== 'town'` check below, so
 * an unrecognised value degrades to the `village` ring count rather than
 * throwing.
 */
export type Town = {
  readonly name: string
  readonly lat: number
  readonly lon: number
  readonly size: 'town' | 'village'
  readonly source: string
}

/** A scattered village dwelling -- smaller than `AIRFIELD_HUTS`'s 12x28 m
 *  (those read more like long barracks halls at a working strip). */
const HUT_WIDTH_M = 5
const HUT_LENGTH_M = 6

/** Ring 0 sits 30 m out with 5 huts; each further ring adds 35 m of radius
 *  and 3 more huts (ring 1: 65 m/8 huts; ring 2: 100 m/11 huts) -- a
 *  village's one ring is a small cluster, a town's three read as a real
 *  built-up centre without huts overlapping. */
const RING_BASE_RADIUS_M = 30
const RING_RADIUS_STEP_M = 35
const RING_BASE_HUTS = 5
const RING_HUTS_STEP = 3
/** Jitter added to each hut's angle, radians -- keeps a ring from reading as
 *  a mechanically perfect polygon while staying deterministic (drawn from
 *  the town's own seeded stream, in placement order). */
const ANGLE_JITTER_RAD = 0.3

/** A hut's placed world-space footprint -- what `drawBuilding` needs to draw
 *  it, and also what `vegetation.ts`'s `treeSites` needs to keep a tree from
 *  growing through it (see `TownsHandle.hutFootprints`). */
export type HutFootprint = { readonly x: number; readonly z: number; readonly width: number; readonly length: number }

/** The OSM node id embedded in `source` (".../node/<id>") -- design §7's own
 *  seed, and the town's stable identity: same id, same ring every build. */
const idFrom = (source: string): number => Number(source.split('/').pop())

/**
 * Pure placement math, no Three.js: every hut footprint every settlement in
 * `places.towns` would draw, on land and outside every airfield's clearing.
 * Kept separate from `createTowns` so `main.ts` can hand the same list to
 * `createVegetation` -- huts are never inside an `Airfield.clearing` rect
 * (excluded right here), so nothing else already keeps trees off them the
 * way `inAirfieldClearing` incidentally keeps trees off `AIRFIELD_HUTS`.
 */
export function townHutFootprints(
  field: TerrainField,
  places: { readonly towns: readonly Town[] },
  airfields: readonly Airfield[],
): readonly HutFootprint[] {
  const footprints: HutFootprint[] = []
  for (const town of places.towns) {
    const centre = toLocal(town.lat, town.lon)
    if (heightAt(field, centre.x, centre.z) <= 0.5) continue // off-map or underwater node: skip rather than place in the sea
    const rng = createRng(idFrom(town.source))
    const rings = town.size === 'town' ? 3 : 1
    for (let ring = 0; ring < rings; ring++) {
      const radius = RING_BASE_RADIUS_M + ring * RING_RADIUS_STEP_M
      const hutsInRing = RING_BASE_HUTS + ring * RING_HUTS_STEP
      for (let i = 0; i < hutsInRing; i++) {
        // One rng() draw per hut, in ring-then-index order -- the sequence
        // (and so the whole layout) depends only on the town's own node id.
        const angle = (i / hutsInRing) * Math.PI * 2 + rng() * ANGLE_JITTER_RAD
        const x = centre.x + Math.cos(angle) * radius
        const z = centre.z + Math.sin(angle) * radius
        if (heightAt(field, x, z) <= 0.5) continue
        if (inAirfieldClearing(airfields, x, z)) continue
        footprints.push({ x, z, width: HUT_WIDTH_M, length: HUT_LENGTH_M })
      }
    }
  }
  return footprints
}

export type TownsHandle = {
  readonly object: Object3D
  /** Every hut's world-space footprint (see `townHutFootprints`) -- `main.ts`
   *  hands this to `createVegetation` so trees are kept off it, the same way
   *  `inAirfieldClearing` already keeps them off `AIRFIELD_HUTS`. Towns are
   *  never a strike target (design doc §10's non-goals), so unlike
   *  `AirfieldHandle` there is no `sync`/per-hut structure map here -- every
   *  hut goes straight into one shared merged batch, the same path
   *  `AIRFIELD_HUTS` already takes through `createAirfield`'s own `shared`
   *  collector. */
  readonly hutFootprints: readonly HutFootprint[]
}

export function createTowns(
  field: TerrainField,
  places: { readonly towns: readonly Town[] },
  airfields: readonly Airfield[],
): TownsHandle {
  const materials = createBuildingMaterials()
  const collector = makeCollector()
  const hutFootprints = townHutFootprints(field, places, airfields)
  for (const hut of hutFootprints) {
    drawBuilding(collector, { kind: 'hut', x: hut.x, z: hut.z, width: hut.width, length: hut.length }, field, materials)
  }
  const object = batched(new Group(), collector.batches)
  object.name = 'town and village huts'
  return { object, hutFootprints }
}
