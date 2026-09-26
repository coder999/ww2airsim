import { z } from 'zod'
import { type Quat, qFromAxisAngle } from '../math/quat.js'
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

const BuildingObject = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['hangar', 'tower', 'aaa']),
    x: finite,
    z: finite,
    widthM: positive,
    lengthM: positive,
    hp: positive,
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

export const insideRunway = (a: Airfield, x: number, z: number): boolean => insideRect(a, runwayRect(a), x, z)

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
export const parkedAttitude = (a: Airfield): Quat => qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - runwayHeadingRad(a))
