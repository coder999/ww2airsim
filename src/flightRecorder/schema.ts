import { z } from 'zod'

export const FLIGHT_RECORD_FORMAT = 'ww2flight'
export const FLIGHT_RECORD_VERSION = 1

const finite = z.number().finite()
const jsonValue: z.ZodType<unknown> = z.lazy(() => z.union([
  z.null(), z.boolean(), finite, z.string(), z.array(jsonValue), z.record(jsonValue),
]))

const controls = z.object({
  pitch: finite.min(-1).max(1),
  roll: finite.min(-1).max(1),
  yaw: finite.min(-1).max(1),
  throttle: finite.min(0).max(1),
  fire: z.boolean().optional(),
  gearDown: z.boolean().optional(),
  brake: finite.min(0).max(1).optional(),
  flapDown: z.boolean().optional(),
  hookDown: z.boolean().optional(),
  bayDoorsOpen: z.boolean().optional(),
  dropBomb: z.boolean().optional(),
  fireRockets: z.boolean().optional(),
}).strict()

const action = z.discriminatedUnion('kind', [
  z.object({ tick: z.number().int().nonnegative(), kind: z.literal('pause'), paused: z.boolean() }).strict(),
  z.object({ tick: z.number().int().nonnegative(), kind: z.literal('time-scale'), scale: finite.positive() }).strict(),
  z.object({
    tick: z.number().int().nonnegative(),
    kind: z.literal('bailout'),
    aircraft: z.string().min(1),
    environment: z.object({ daylight: finite, visibility: finite, weather: finite, seaState: finite }).strict(),
  }).strict(),
  z.object({
    tick: z.number().int().nonnegative(), kind: z.literal('wingman-order'),
    command: z.enum(['attack', 'cover', 'form']), target: z.string().nullable().optional(),
  }).strict(),
  z.object({
    tick: z.number().int().nonnegative(), kind: z.literal('control'),
    control: z.enum(['gear', 'flaps', 'hook', 'bay-doors', 'bomb', 'rockets']), value: z.boolean(),
  }).strict(),
])

const evidence = z.object({
  tick: z.number().int().nonnegative(),
  kind: z.enum(['mission', 'spawn', 'destruction', 'impact', 'release', 'landing', 'bailout', 'outcome']),
  entity: z.string().optional(),
  detail: z.string(),
}).strict()

const summary = z.object({
  tick: z.number().int().nonnegative(),
  aircraft: z.array(z.object({ id: z.string(), spec: z.string(), destroyed: z.boolean(), impacted: z.boolean() }).strict()),
  ships: z.array(z.object({ id: z.string(), spec: z.string(), destroyed: z.boolean() }).strict()),
  vehicles: z.array(z.object({ id: z.string(), spec: z.string(), destroyed: z.boolean() }).strict()),
  missionComplete: z.boolean().nullable(),
}).strict()

export const FlightRecordV1Schema = z.object({
  format: z.literal(FLIGHT_RECORD_FORMAT),
  version: z.literal(FLIGHT_RECORD_VERSION),
  build: z.object({ id: z.string().min(1), dirty: z.boolean() }).strict(),
  content: z.object({ scenarioId: z.string().min(1), sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict(),
  launch: z.object({
    aircraftSpec: z.string().min(1),
    loadout: z.string().min(1),
    timeOfDay: finite,
    weather: jsonValue,
    difficulty: z.string().min(1),
    assists: z.object({ stallLimiter: z.boolean(), autoRudder: z.boolean() }).strict(),
    arcadeDamage: z.boolean(),
    dev: z.record(jsonValue),
  }).strict(),
  environment: z.object({
    browser: z.string(), os: z.string(), gpu: z.string(), graphics: z.record(jsonValue),
  }).strict(),
  initial: z.object({ checksum: z.string().regex(/^[0-9a-f]{16}$/), summary }).strict(),
  packets: z.array(z.object({
    tick: z.number().int().positive(), controls, actions: z.array(action), events: z.array(evidence),
    checksum: z.string().regex(/^[0-9a-f]{16}$/).optional(),
  }).strict()),
  valid: z.boolean(),
  issues: z.array(z.string()),
  final: z.object({
    checksum: z.string().regex(/^[0-9a-f]{16}$/), summary, debrief: jsonValue.nullable(),
  }).strict().nullable(),
}).strict()

export type FlightRecordV1 = z.infer<typeof FlightRecordV1Schema>
export type FlightTickPacket = FlightRecordV1['packets'][number]
export type FlightRecordAction = FlightTickPacket['actions'][number]
export type FlightRecordEvidence = FlightTickPacket['events'][number]

export function parseFlightRecord(value: unknown): FlightRecordV1 {
  const parsed = FlightRecordV1Schema.safeParse(value)
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'record'}: ${issue.message}`).join('; ')
    throw new Error(`Invalid .ww2flight record: ${detail}`)
  }
  const record = parsed.data
  let expected = record.initial.summary.tick + 1
  for (const packet of record.packets) {
    if (packet.tick !== expected) throw new Error(`Invalid .ww2flight record: packet tick ${packet.tick}; expected ${expected}`)
    expected++
    if (packet.actions.some((entry) => entry.tick !== packet.tick)) {
      throw new Error(`Invalid .ww2flight record: an action is not stamped with packet tick ${packet.tick}`)
    }
    if (packet.events.some((entry) => entry.tick !== packet.tick)) {
      throw new Error(`Invalid .ww2flight record: an event is not stamped with packet tick ${packet.tick}`)
    }
  }
  return record
}

