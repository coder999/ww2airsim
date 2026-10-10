import { z } from 'zod'

/**
 * The mission vocabulary (spec 2026-09-25 §2): what a scenario may declare
 * about objectives and triggers. Zod objects only. Cross-references (after,
 * trigger targets, held groups) are checked by `checkMission` in
 * src/sim/scenario.ts, which can see the whole scenario; ids and tags are
 * resolved to entities by src/sim/mission/create.ts when the world is built,
 * because structure tags live in the airfields' content, not in the
 * scenario file (plan ruling R4).
 *
 * `HeldGroupObject` is NOT here though spec §1 lists it (ruling R6): it
 * reuses the scenario's own aircraft and ship objects, and scenario.ts
 * imports this file, so the reverse import would be a runtime cycle.
 */

const finite = z.number().refine(Number.isFinite, { message: 'must be a finite number' })
const positive = finite.refine((n) => n > 0, { message: 'must be greater than zero' })
const id = z.string().min(1)
/** Entity ids and/or group tags; resolved when the world is built. */
const refs = z.array(id).min(1)

export const PointObject = z.object({ x: finite, z: finite }).strict()
export type Point = z.infer<typeof PointObject>

/** A circle on the ground, measured horizontally (ruling R9), optionally
 *  limited to an altitude band in world meters. */
const stationShape = {
  point: PointObject,
  radiusM: positive,
  altitudeM: z.tuple([finite, finite])
    .refine(([lo, hi]) => lo < hi, { message: 'altitudeM must be [min, max] with min < max' })
    .optional(),
}
export const StationObject = z.object(stationShape).strict()
export type Station = z.infer<typeof StationObject>

/** A closed numeric range `[min, max]`, min below max. */
const range = z.tuple([finite, finite]).refine(([lo, hi]) => lo < hi, { message: 'must be [min, max] with min < max' })

/** The shape of a test on the player's own airplane (B4). Every field given must
 *  hold at once. SI like every content key; air-relative speed, altitude above sea level. */
const planeStateShape = {
  gear: z.enum(['up', 'down']).optional(),
  flaps: z.enum(['up', 'down']).optional(),
  bayDoors: z.enum(['shut', 'open']).optional(),
  airspeedMps: range.optional(),
  altitudeM: range.optional(),
  /** The throttle lever, 0 to 1. */
  throttle: range.refine(([lo, hi]) => lo >= 0 && hi <= 1, { message: 'throttle must lie within [0, 1]' }).optional(),
}
/** The names `planeStateShape` declares, in a fixed order (for the empty check). */
export const PLANE_STATE_FIELDS = ['gear', 'flaps', 'bayDoors', 'airspeedMps', 'altitudeM', 'throttle'] as const
const hasField = (o: Partial<Record<(typeof PLANE_STATE_FIELDS)[number], unknown>>): boolean => PLANE_STATE_FIELDS.some((k) => o[k] !== undefined)
const nonEmptyPlaneState = { message: 'a plane-state test needs at least one of gear, flaps, bayDoors, airspeedMps, altitudeM, throttle' }

export const PlaneStateObject = z.object(planeStateShape).strict().refine(hasField, nonEmptyPlaneState)
export type PlaneState = z.infer<typeof PlaneStateObject>
export const planeStateIsEmpty = (o: Partial<Record<(typeof PLANE_STATE_FIELDS)[number], unknown>>): boolean => !hasField(o)

const base = {
  id,
  /** Short: the HUD objective line and the debrief print it. */
  label: z.string().min(1),
  priority: z.enum(['primary', 'secondary']),
  /** Active only once this EARLIER objective completes (ruling R8). */
  after: id.optional(),
}

export const ObjectiveObject = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('destroy'), targets: refs, count: z.number().int().positive().optional() }).strict(),
  z.object({ ...base, kind: z.literal('protect'), targets: refs, maxLost: z.number().int().nonnegative().optional() }).strict(),
  z.object({ ...base, kind: z.literal('deny'), hostiles: refs, around: z.union([id, PointObject]), radiusM: positive }).strict(),
  z.object({ ...base, kind: z.literal('takeoff'), from: id }).strict(),
  z.object({ ...base, kind: z.literal('land'), at: id, count: z.number().int().positive().optional(), respot: z.boolean().optional() }).strict(),
  z.object({ ...base, kind: z.literal('reach'), ...stationShape }).strict(),
  z.object({ ...base, kind: z.literal('hold'), ...stationShape, seconds: positive }).strict(),
  /** B4: complete the first tick the player's airplane matches every field
   *  (gear, flaps, speed...). An empty one is rejected by `checkMission`. */
  z.object({ ...base, kind: z.literal('state'), ...planeStateShape }).strict(),
  /** Passes at a ship's deck that miss (Mark, 2026-09-26; M3-R4): fails
   *  once more than `maxMissed` (default 0) do. One per mission, at a ship
   *  with Paddles (M3-R11). */
  z.object({ ...base, kind: z.literal('approaches'), at: id, maxMissed: z.number().int().nonnegative().optional() }).strict(),
])
export type Objective = z.infer<typeof ObjectiveObject>

export const TriggerWhenObject = z.union([
  z.object({ at: finite.refine((n) => n >= 0, { message: 'must not be negative' }) }).strict(),
  z.object({ completed: id }).strict(),
  z.object({ failed: id }).strict(),
  z.object({ enters: StationObject }).strict(),
  /** B4: the player's airplane matches (see `PlaneStateObject`). */
  z.object({ state: PlaneStateObject }).strict(),
])
export type TriggerWhen = z.infer<typeof TriggerWhenObject>

export const TriggerActionObject = z.union([
  z.object({ spawn: id }).strict(),
  z.object({ message: z.string().min(1) }).strict(),
])
export type TriggerAction = z.infer<typeof TriggerActionObject>

/** Fires once (spec §2.2). */
export const TriggerObject = z.object({ id, when: TriggerWhenObject, then: z.array(TriggerActionObject).min(1) }).strict()
export type Trigger = z.infer<typeof TriggerObject>

export const BadgeObject = z.object({ id, name: z.string().min(1) }).strict()
export type Badge = z.infer<typeof BadgeObject>

/** The four loadouts the title offers (src/sim/weapons/stores.ts `Loadout`);
 *  `scenario.ts` asserts the two agree at the type level. */
export const LoadoutObject = z.enum(['clean', 'bombs', 'rockets', 'both'])

/** Display only (M2): what the title's orders memo shows for a mission.
 *  `loadout` is the recommended one, preselected but changeable (spec §3). */
export const BriefingObject = z.object({ situation: z.string().min(1), loadout: LoadoutObject }).strict()
export type Briefing = z.infer<typeof BriefingObject>

/** Display only (M2): a short historical-context paragraph written for the
 *  game, and its public-domain sources as citation strings (spec §6.3:
 *  "every historical note carries at least one citation"). */
export const HistoryObject = z.object({ text: z.string().min(1), sources: z.array(z.string().min(1)).min(1) }).strict()
export type History = z.infer<typeof HistoryObject>
