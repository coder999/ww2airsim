import { z } from 'zod'
import { CHAPTER_IDS } from '../../campaign/schema.js'

/**
 * The scene file (F9 plan 2026-10-17, decisions 1-5): camera keyframes, scene-only orders and the
 * handoff, laid over a mission's own scenario. Keyframes carry no roll and no FOV (Mark, 2026-10-17:
 * scenes never use the cockpit or HUD view, so the camera stays at the fixed vertical FOV).
 *
 * `world` is a union so later sources (a fresh world, a mission world with edits) can be added
 * without changing the file format; only `mission` exists now.
 *
 * `order` carries the AI order verbatim; Task 3 narrows `order` to the existing AI vocabulary and
 * checks entity ids against the scenario at load.
 */

const finite = z.number().refine(Number.isFinite, { message: 'must be a finite number' })
const id = z.string().min(1)

const Vec3 = z.tuple([finite, finite, finite])

export const KeyframeObject = z.object({
  t: finite.refine((n) => n >= 0, { message: 't must be >= 0' }),
  position: Vec3,
  yawDeg: finite,
  pitchDeg: finite.refine((n) => n >= -90 && n <= 90, { message: 'pitchDeg must lie within [-90, 90]' }),
  ease: z.enum(['linear', 'inOut']).default('inOut'),
}).strict()
export type Keyframe = z.infer<typeof KeyframeObject>

const OrderCue = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('message'), text: id }).strict(),
  z.object({ kind: z.literal('order'), entity: id, order: z.record(z.unknown()) }).strict(),
  z.object({ kind: z.literal('fx'), effect: id, at: Vec3 }).strict(),
  z.object({ kind: z.literal('spawn'), group: id }).strict(),
])
export type SceneOrder = z.infer<typeof OrderCue>

export const CueObject = z.object({ t: finite.refine((n) => n >= 0), order: OrderCue }).strict()
export type Cue = z.infer<typeof CueObject>

const sorted = (xs: readonly { t: number }[]): boolean => xs.every((x, i) => i === 0 || xs[i - 1]!.t <= x.t)

export const SceneObject = z.object({
  id,
  chapter: z.enum(CHAPTER_IDS),
  kind: z.enum(['opening', 'victory']),
  durationS: finite.refine((n) => n > 0, { message: 'durationS must be > 0' }),
  world: z.discriminatedUnion('source', [z.object({ source: z.literal('mission'), scenario: id }).strict()]),
  camera: z.array(KeyframeObject).min(1).refine(sorted, { message: 'camera keyframes must be sorted by t' }),
  cues: z.array(CueObject).refine(sorted, { message: 'cues must be sorted by t' }),
  handoff: z.object({ player: z.enum(['held', 'ai']) }).strict(),
}).strict().refine((s) => s.camera.every((k) => k.t <= s.durationS) && s.cues.every((c) => c.t <= s.durationS), {
  message: 'keyframes and cues must lie within durationS',
})
export type Scene = z.infer<typeof SceneObject>

export function parseScene(raw: unknown): Scene {
  return SceneObject.parse(raw)
}
