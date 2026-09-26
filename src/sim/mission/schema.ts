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
  z.object({ ...base, kind: z.literal('land'), at: id, count: z.number().int().positive().optional() }).strict(),
  z.object({ ...base, kind: z.literal('reach'), ...stationShape }).strict(),
  z.object({ ...base, kind: z.literal('hold'), ...stationShape, seconds: positive }).strict(),
])
export type Objective = z.infer<typeof ObjectiveObject>

export const TriggerWhenObject = z.union([
  z.object({ at: finite.refine((n) => n >= 0, { message: 'must not be negative' }) }).strict(),
  z.object({ completed: id }).strict(),
  z.object({ failed: id }).strict(),
  z.object({ enters: StationObject }).strict(),
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
