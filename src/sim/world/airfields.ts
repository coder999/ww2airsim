import { z } from 'zod'
import { type Quat, qFromAxisAngle, qMul } from '../math/quat.js'
import { v3 } from '../math/vec3.js'

/**
 * Airfields as content the simulation knows about (spec §6).
 *
 * World meters, not latitude/longitude: Tacloban's coordinate is pinned
 * verbatim (master spec §15) and stored here so the spawn, the runway mesh
 * and the landing report all read one record. Everything about a base is
 * expressed in a RUNWAY-LOCAL frame -- center-relative, `x` across the strip
 * and `z` along it, rotated by the runway heading -- so a base with a
 * different heading needs no second set of numbers.
 */

const finite = z.number().refine(Number.isFinite, { message: 'must be a finite number' })
const positive = finite.refine((n) => n > 0, { message: 'must be greater than zero' })

const RectObject = z.object({ x: finite, z: finite, widthM: positive, lengthM: positive }).strict()
export type Rect = z.infer<typeof RectObject>

/**
 * Every kind a base may place (F8A Task 3, 2026-10-16): the three the sim always had, then the other seven approved
 * R4 buildings and the four F8A models. A kind other than `hangar | tower | aaa` is also a model id of the same name
 * (`STATIC_MODELS.building`, enforced by tests/sim/world/buildingKinds.test.ts), so the renderer draws that glb.
 */
export const BUILDING_KINDS = [
  'hangar', 'tower', 'aaa',
  'ammunition-bunker', 'barracks-and-huts', 'coastal-gun-battery', 'fuel-tank-farm', 'pier-and-warehouses',
  'radio-radar-station', 'revetment',
  'quonset-hut-20x48', 'pontoon-pier-segment', 'jinamoc-seaplane-ramp', 'ormoc-customs-building',
  // F8C: the one placeable kind whose glb is an `equipment` model (a flying-boat mooring buoy), not a `building` one.
  'pby-mooring-buoy',
] as const
export type BuildingKind = typeof BUILDING_KINDS[number]

/** What a window says about one building (F8A, plan Design). Absent means `intact`. */
export const BUILDING_STATES = ['intact', 'damaged', 'destroyed', 'construction'] as const
export type BuildingState = typeof BUILDING_STATES[number]

const BuildingObject = z
  .object({
    id: z.string().min(1),
    kind: z.enum(BUILDING_KINDS),
    x: finite,
    z: finite,
    widthM: positive,
    lengthM: positive,
    hp: positive,
    /** F8A: rotation about +y relative to the runway frame, clockwise from above; absent is 0 (the runway's own frame). */
    headingDeg: finite.optional(),
    /** F8A: the window's say on this building. `destroyed` is rubble with no hit box; absent is `intact`. */
    state: z.enum(BUILDING_STATES).optional(),
    /** F8A: draw the glb whose model id is this `kind` (StaticModels `building`), not the procedural shape. A site's buildings
     *  say true; every base file in content/bases omits it and keeps its procedural look. */
    model: z.boolean().optional(),
    /** F8A: hit-box height. Absent keeps the generic 10 m every building had before F8A. */
    heightM: positive.optional(),
    /** F8C: the height of the model's origin above sea level, absolute. A waterfront building (pier, ramp, pontoon, buoy) is seated at the
     *  sea surface; absent keeps the rule every other building follows (the highest corner of its footprint). */
    seatM: finite.optional(),
    /** Mission group tags (spec 2026-09-25 §2.1, e.g. `dulag-hangars`), so an
     *  objective can name a set of buildings. Optional; no shipped base
     *  carried any before M3. */
    tags: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict()
export type Building = z.infer<typeof BuildingObject>

const AirfieldObject = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    runway: z
      .object({
        center: z.object({ x: finite, z: finite }).strict(),
        headingDeg: finite,
        lengthM: positive,
        widthM: positive,
      })
      .strict(),
    apron: RectObject.nullable(),
    /** The footprint kept free of trees; `null` means the strip alone. */
    clearing: RectObject.nullable(),
    /** Legitimate strike targets (Plan 6b, spec §2.3): local frame, same
     *  convention as `runway`/`apron`/`clearing`. Decorative huts are NOT
     *  here — see `AIRFIELD_HUTS` in `src/render/scene/airfield.ts`. */
    buildings: z.array(BuildingObject).min(1),
    /** Who holds the field, which every one of its `buildings` takes
     *  (friendly-fire spec §2, ruling FF-1). Absent means axis (`sideOf`'s
     *  default for anything not the player); a scenario may override it with
     *  `airfieldSides`. Read through `airfieldSideOf`, src/sim/sides.ts. */
    side: z.enum(['allied', 'axis']).optional(),
    /** F8A: whether the field may be recovered to. Absent means serviceable, as every base before F8A. */
    serviceable: z.boolean().optional(),
    /** F8C: a port, beach or anchorage, not a flying field. `runway` is then only the site's local frame (center and heading
     *  anchor every placement; length and width are nominal). Nothing lands on it, it draws no strip or huts, and it is never a
     *  recovery field, steering target, landing objective or AI home. `serviceable` still says whether the site is usable. */
    noStrip: z.boolean().optional(),
    /** F8A: procedural ground clutter (mats, tents, drums, ...), render only; see `src/sim/world/clutter.ts`. */
    clutter: z.object({
      seed: z.number().int().nonnegative(),
      areas: z.array(z.object({
        id: z.string().min(1), x: finite, z: finite, widthM: positive, lengthM: positive,
        density: z.record(z.string(), z.number().nonnegative()),
      }).strict()),
    }).strict().optional(),
    reference: z.object({ source: z.string().min(1) }).strict(),
  })
  .strict()

export type Airfield = z.infer<typeof AirfieldObject>

export function parseAirfield(raw: unknown): Airfield {
  const result = AirfieldObject.safeParse(raw)
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid airfield: ${detail}`)
  }
  return result.data
}

export const runwayHeadingRad = (a: Airfield): number => (a.runway.headingDeg * Math.PI) / 180

/**
 * Runway-local to world. The local frame is the world frame rotated about +y
 * by the compass heading, so at heading 0 it is the identity, and at heading
 * 90 the strip's north end (local -z) lies to the east (world +x). The same
 * rotation ships use: a heading h points along (sin h, -cos h).
 */
export function localToWorld(a: Airfield, x: number, z: number): { x: number; z: number } {
  const h = runwayHeadingRad(a)
  const c = Math.cos(h), s = Math.sin(h)
  return { x: a.runway.center.x + x * c - z * s, z: a.runway.center.z + x * s + z * c }
}

export function worldToLocal(a: Airfield, x: number, z: number): { x: number; z: number } {
  const h = runwayHeadingRad(a)
  const c = Math.cos(h), s = Math.sin(h)
  const dx = x - a.runway.center.x, dz = z - a.runway.center.z
  return { x: dx * c + dz * s, z: -dx * s + dz * c }
}

export function insideRect(a: Airfield, rect: Rect, x: number, z: number): boolean {
  const l = worldToLocal(a, x, z)
  return Math.abs(l.x - rect.x) <= rect.widthM / 2 && Math.abs(l.z - rect.z) <= rect.lengthM / 2
}

export const runwayRect = (a: Airfield): Rect => ({ x: 0, z: 0, widthM: a.runway.widthM, lengthM: a.runway.lengthM })

export const insideRunway = (a: Airfield, x: number, z: number): boolean => a.noStrip !== true && insideRect(a, runwayRect(a), x, z)

/** The strip's four corners in world meters, north-west first, clockwise
 *  seen from above at heading 0. */
export function runwayCorners(a: Airfield): readonly { x: number; z: number }[] {
  const hw = a.runway.widthM / 2, hl = a.runway.lengthM / 2
  return [
    localToWorld(a, -hw, -hl),
    localToWorld(a, hw, -hl),
    localToWorld(a, hw, hl),
    localToWorld(a, -hw, hl),
  ]
}

/** The airfield whose runway a point lies inside, or `null`. First match
 *  wins; runways do not overlap. */
export function airfieldAt(airfields: readonly Airfield[], x: number, z: number): Airfield | null {
  for (const a of airfields) if (insideRunway(a, x, z)) return a
  return null
}

/**
 * Parked, nose down the strip toward its heading, wings level. The body
 * nose is +x and world +x is east, so a heading h is a yaw of pi/2 - h about
 * +y: heading 0 (Tacloban's) gives pi/2 -- north, down the strip -- which is
 * what the pre-Plan-12 `DEFAULT_SPAWN_ATTITUDE` (`src/render/spawn.ts`,
 * deleted Task 5) hardcoded for that one airfield.
 *
 * The strip's axis is not a taste call; it is the ground. Measured on the
 * committed L4 field -- the finest level a clone had at the time (before
 * Task 2, 2026-09-24, moved that boundary to L0; `physicsFieldFor` takes its
 * finest level as a caller-supplied parameter now, not a fixed one) --
 * from Tacloban's `runway.center`, sampling every 30 m (2026-09-17, carried
 * forward from the deleted `DEFAULT_SPAWN_ATTITUDE` comment when Task 5
 * moved the spawn onto content):
 *
 * | Direction | Height spread over +/-900 m | Sea ahead of the nose |
 * | --- | --- | --- |
 * | east, the old identity nose | 3.23 m | 900 m |
 * | north | 0.49 m | none within 900 m |
 *
 * East is worse on both counts, and the second one had already bitten: the
 * roll to liftoff over real terrain is 410-453 m (Plan 11a's handoff), which
 * left about 450 m of margin and is why `tests/sim/soak.test.ts` carries a
 * case for Mark driving off the end of the runway onto the ocean. Any later
 * airfield's `headingDeg` gets the same reasoning for free through the
 * formula above, rather than a second hand-measured table.
 */
export const parkedAttitude = (a: Airfield, restPitchRad: number): Quat =>
  qMul(qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - runwayHeadingRad(a)), qFromAxisAngle(v3(0, 0, 1), restPitchRad))
