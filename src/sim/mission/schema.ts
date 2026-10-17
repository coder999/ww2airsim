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
  /** F10-0: the station is an annulus, so "outside the flare" is a station (J4). Measured horizontally like `radiusM`. */
  innerRadiusM: positive.optional(),
  altitudeM: z.tuple([finite, finite])
    .refine(([lo, hi]) => lo < hi, { message: 'altitudeM must be [min, max] with min < max' })
    .optional(),
}
export const innerBelowOuter = (s: { radiusM: number; innerRadiusM?: number | undefined }): boolean => s.innerRadiusM === undefined || s.innerRadiusM < s.radiusM
export const innerMessage = { message: 'innerRadiusM must be less than radiusM' }
export const StationObject = z.object(stationShape).strict().refine(innerBelowOuter, innerMessage)
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
  /** F10-0: the nose's compass heading in degrees (0 north, 90 east), as `[from, to]` clockwise; `from > to` runs through north (J5's corridor: `[350, 10]`). */
  headingDeg: z.tuple([finite, finite]).refine(([lo, hi]) => lo >= 0 && lo < 360 && hi >= 0 && hi < 360, { message: 'headingDeg must lie within [0, 360)' }).optional(),
  /** F10-0: speed over the ground (the world frame, so a floating airplane's drift counts), horizontal. */
  groundSpeedMps: range.refine(([lo]) => lo >= 0, { message: 'groundSpeedMps must not be negative' }).optional(),
}
/** The names `planeStateShape` declares, in a fixed order (for the empty check). */
export const PLANE_STATE_FIELDS = ['gear', 'flaps', 'bayDoors', 'airspeedMps', 'altitudeM', 'throttle', 'headingDeg', 'groundSpeedMps'] as const
const hasField = (o: Partial<Record<(typeof PLANE_STATE_FIELDS)[number], unknown>>): boolean => PLANE_STATE_FIELDS.some((k) => o[k] !== undefined)
const nonEmptyPlaneState = { message: 'a plane-state test needs at least one of gear, flaps, bayDoors, airspeedMps, altitudeM, throttle, headingDeg, groundSpeedMps' }

export const PlaneStateObject = z.object(planeStateShape).strict().refine(hasField, nonEmptyPlaneState)
export type PlaneState = z.infer<typeof PlaneStateObject>
export const planeStateIsEmpty = (o: Partial<Record<(typeof PLANE_STATE_FIELDS)[number], unknown>>): boolean => !hasField(o)

/** F10-0: a set of entities that has left play. Each target is destroyed, or (an aircraft) on the ground, or, when `awayFrom` and `beyondM`
 *  are given, farther than `beyondM` from that point or entity. An unspawned held entity has not left (A1's "raid withdraws", A6/J6's route-group admission). */
export const GoneObject = z.object({
  targets: refs,
  awayFrom: z.union([id, PointObject]).optional(),
  beyondM: positive.optional(),
}).strict().refine((g) => (g.awayFrom === undefined) === (g.beyondM === undefined), { message: 'awayFrom and beyondM go together' })
export type Gone = z.infer<typeof GoneObject>

/** F10D: the envelope a transport must be in at the instant it drops, every field given at once (J5's corridor). Same units and heading convention as a plane-state test. */
export const DropCorridorObject = z.object({
  airspeedMps: range.optional(),
  groundSpeedMps: range.refine(([lo]) => lo >= 0, { message: 'groundSpeedMps must not be negative' }).optional(),
  altitudeM: range.optional(),
  headingDeg: planeStateShape.headingDeg,
}).strict()
export type DropCorridor = z.infer<typeof DropCorridorObject>

export const TriggerWhenObject = z.union([
  z.object({ at: finite.refine((n) => n >= 0, { message: 'must not be negative' }) }).strict(),
  z.object({ completed: id }).strict(),
  z.object({ failed: id }).strict(),
  z.object({ enters: StationObject }).strict(),
  /** B4: the player's airplane matches (see `PlaneStateObject`). */
  z.object({ state: PlaneStateObject }).strict(),
  /** F10-0: the named entities have left play (see `GoneObject`). */
  z.object({ gone: GoneObject }).strict(),
])
export type TriggerWhen = z.infer<typeof TriggerWhenObject>

const base = {
  id,
  /** Short: the HUD objective line and the debrief print it. */
  label: z.string().min(1),
  priority: z.enum(['primary', 'secondary']),
  /** Active only once this EARLIER objective completes (ruling R8). */
  after: id.optional(),
  /** F10-0: a window. While it is open the objective evaluates as usual; when this condition is met and the objective is still active it
   *  closes: a `protect`, `deny` or `atLeast` that has not failed completes, anything else fails. A window that never closes is today's behavior. */
  until: TriggerWhenObject.optional(),
}

export const ObjectiveObject = z.discriminatedUnion('kind', [
  /** `fresh` (F10-0): count only targets destroyed after this objective became active (an `after` objective), not since tick 0. */
  z.object({ ...base, kind: z.literal('destroy'), targets: refs, count: z.number().int().positive().optional(), fresh: z.boolean().optional() }).strict(),
  z.object({ ...base, kind: z.literal('protect'), targets: refs, maxLost: z.number().int().nonnegative().optional() }).strict(),
  z.object({ ...base, kind: z.literal('deny'), hostiles: refs, around: z.union([id, PointObject]), radiusM: positive }).strict(),
  z.object({ ...base, kind: z.literal('takeoff'), from: id }).strict(),
  /** `suggestedRecovery` (F5C D3, 2026-10-16): `at` is only the SUGGESTED recovery; a landing at ANY friendly base
   *  (`src/sim/friendly.ts`) completes the objective. Without it, `at` is a named place the exercise requires.
   *  `requires` (F10-0): the landing counts only while the named fields are (un)serviceable at that tick (J1: Bayug only if Buri is not). */
  z.object({
    ...base, kind: z.literal('land'), at: id, count: z.number().int().positive().optional(), respot: z.boolean().optional(), suggestedRecovery: z.boolean().optional(),
    requires: z.object({ serviceable: z.array(id).min(1).optional(), unserviceable: z.array(id).min(1).optional() }).strict()
      .refine((r) => r.serviceable !== undefined || r.unserviceable !== undefined, { message: 'requires needs serviceable or unserviceable' }).optional(),
  }).strict(),
  z.object({ ...base, kind: z.literal('reach'), ...stationShape }).strict(),
  /** `resetOnExit` (F10-0): leaving the station zeroes the accumulated time. `relativeTo` (F10-0): an entity id or tag; the station's `point` is then an
   *  offset from the centroid of the living, spawned members of that set, so an escort station follows its charges (A5, J6). */
  z.object({ ...base, kind: z.literal('hold'), ...stationShape, seconds: positive, resetOnExit: z.boolean().optional(), relativeTo: id.optional() }).strict(),
  /** B4: complete the first tick the player's airplane matches every field
   *  (gear, flaps, speed...). An empty one is rejected by `checkMission`.
   *  F10-0: `dwellS` requires the match to hold continuously for that long (a break zeroes it), and `failOnExit` fails the objective if a match
   *  that had begun breaks before the dwell is done (a corridor: J5; the slow dwells of A4). */
  z.object({ ...base, kind: z.literal('state'), ...planeStateShape, dwellS: positive.optional(), failOnExit: z.boolean().optional() }).strict(),
  /** Complete when the player releases the named store. A target supplies
   *  guidance only: practice hits and misses both count. */
  z.object({ ...base, kind: z.literal('release'), store: z.enum(['bomb', 'rocket', 'torpedo']), target: id.optional(), count: z.number().int().positive().optional() }).strict(),
  /** Passes at a ship's deck that miss (Mark, 2026-09-26; M3-R4): fails
   *  once more than `maxMissed` (default 0) do. One per mission, at a ship
   *  with Paddles (M3-R11). */
  z.object({ ...base, kind: z.literal('approaches'), at: id, maxMissed: z.number().int().nonnegative().optional() }).strict(),
  /** F10-0: at least `count` (default all) of the named AI entities have been inside the zone at some tick while alive (A5's rally gate, J1, J3). */
  z.object({ ...base, kind: z.literal('arrive'), targets: refs, count: z.number().int().positive().optional(), zone: StationObject }).strict(),
  /** F10-0: at least `count` (default all) of the named aircraft have released the store, read from each one's own combat record (A5, J6). */
  z.object({ ...base, kind: z.literal('released'), targets: refs, store: z.enum(['bomb', 'rocket', 'torpedo']), count: z.number().int().positive().optional() }).strict(),
  /** F10-0: at least `count` (default 1) of the named ships are below `belowHpFraction` of their hull points (a hit, not a sinking), or sunk (A2, J2, J4). */
  z.object({ ...base, kind: z.literal('damage'), targets: refs, belowHpFraction: z.number().gt(0).lte(1), count: z.number().int().positive().optional() }).strict(),
  /** F10-0: airfield state. `min` (default all) of the named fields are serviceable (and, with `heldBy`, held by the player's side or the enemy's).
   *  A positive test completes the first tick it holds. With `keep` it is a standing order, as `protect` is: it fails the moment fewer fields meet it
   *  and completes when its window closes or the mission ends (A6: keep two of three; J6: drive both to Japanese control, then hold them). */
  z.object({
    ...base, kind: z.literal('field'), airfields: z.array(id).min(1), min: z.number().int().positive().optional(),
    serviceable: z.boolean().optional(), heldBy: z.enum(['player', 'enemy']).optional(), keep: z.boolean().optional(),
  }).strict(),
  /** F10D: at least `count` (default all) of the named transports have made an EFFECTIVE drop: they released inside the `corridor` (doors open, in the
   *  envelope) and at least `minLanded` (default half the stick, 3) of their men came down alive on the ground inside `zone`. Read from the dropped
   *  rigs themselves (each carries its release envelope), so it works for the player and for the AI alike. */
  z.object({
    ...base, kind: z.literal('drop'), targets: refs, count: z.number().int().positive().optional(), zone: StationObject,
    corridor: DropCorridorObject.optional(), minLanded: z.number().int().positive().optional(),
  }).strict(),
  /** F10D: at least `min` supply bundles dropped by the named transports have landed inside `zone` (J5's secondary). */
  z.object({ ...base, kind: z.literal('bundles'), targets: refs, zone: StationObject, min: z.number().int().positive() }).strict(),
  /** F10-0: complete when at least `n` of the earlier objectives `of` are complete; fails once too many have failed for that to be possible.
   *  `any` is n = 1 and `all` is n = their number (J1: three of five groups intact; J2: a Maru or a half-hull Fletcher). */
  z.object({ ...base, kind: z.literal('atLeast'), n: z.number().int().positive(), of: z.array(id).min(1) }).strict(),
])
export type Objective = z.infer<typeof ObjectiveObject>

export const TriggerActionObject = z.union([
  z.object({ spawn: id }).strict(),
  z.object({ message: z.string().min(1) }).strict(),
  /** F10-0: force an objective's status (a phase closes: complete or fail it). Ignored once the objective is complete or failed. */
  z.object({ complete: id }).strict(),
  z.object({ fail: id }).strict(),
  /** F10-0: mutable airfield state (T0.7). */
  z.object({ setServiceable: z.object({ airfield: id, value: z.boolean() }).strict() }).strict(),
  z.object({ setSide: z.object({ airfield: id, side: z.enum(['allied', 'axis']) }).strict() }).strict(),
])
export type TriggerAction = z.infer<typeof TriggerActionObject>

/** Fires once (spec §2.2). */
export const TriggerObject = z.object({ id, when: TriggerWhenObject, then: z.array(TriggerActionObject).min(1) }).strict()
export type Trigger = z.infer<typeof TriggerObject>

/** F10-0: a field is serviceable while at least `minFraction` of its named structures (ids or tags) are alive. A trigger's `setServiceable` overrides it. */
export const FieldRuleObject = z.object({ airfield: id, structures: refs, minFraction: z.number().gt(0).lte(1) }).strict()
export type FieldRule = z.infer<typeof FieldRuleObject>

export const BadgeObject = z.object({ id, name: z.string().min(1) }).strict()
export type Badge = z.infer<typeof BadgeObject>

/** The four loadouts the title offers (src/sim/weapons/stores.ts `Loadout`);
 *  `scenario.ts` asserts the two agree at the type level. */
export const LoadoutObject = z.enum(['clean', 'bombs', 'torpedoes', 'rockets', 'both'])

/** Display only (M2): what the title's orders memo shows for a mission.
 *  `loadout` is the recommended one, preselected but changeable (spec §3). */
export const BriefingObject = z.object({ situation: z.string().min(1), loadout: LoadoutObject }).strict()
export type Briefing = z.infer<typeof BriefingObject>

/** Display only (M2): a short historical-context paragraph written for the
 *  game, and its public-domain sources as citation strings (spec §6.3:
 *  "every historical note carries at least one citation"). */
export const HistoryObject = z.object({ text: z.string().min(1), sources: z.array(z.string().min(1)).min(1) }).strict()
export type History = z.infer<typeof HistoryObject>
