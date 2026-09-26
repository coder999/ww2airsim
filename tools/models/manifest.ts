// tools/models/manifest.ts
import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { z } from 'zod'
import { SHIP_PALETTES, SHIP_ROLES, type ShipPaletteId } from '../../src/render/scene/shipPalette.js'

/**
 * One JSON file per shipped model, under `tools/models/entries/`
 * (A6M Zero spec §6.1). Every object is `.strict()`, for the reason
 * `src/sim/flight/schema.ts` gives: a typo'd key must fail, not vanish.
 *
 * Every coordinate is in the INPUT's source frame: the world space of the
 * raw file's own scene, with every node matrix applied (Sketchfab's root
 * matrix included). That is the frame `npm run models:inspect` prints, so
 * nobody converts by hand.
 */

const finite = z.number().refine(Number.isFinite, { message: 'must be a finite number' })
const positive = finite.refine((n) => n > 0, { message: 'must be greater than zero' })
const fraction = finite.refine((n) => n > 0 && n <= 1, { message: 'must be in (0, 1]' })
const positiveInt = z.number().int().positive()
const vec3 = z.tuple([finite, finite, finite])

export const AXES = ['+x', '-x', '+y', '-y', '+z', '-z'] as const
export type Axis = (typeof AXES)[number]
const axis = z.enum(AXES)

const PivotSchema = z.object({ point: vec3, axis }).strict()
export type Pivot = z.infer<typeof PivotSchema>

const KeepSchema = z.object({
  /** A node in the input, group or mesh. Its whole subtree survives un-joined. */
  node: z.string().min(1),
  /** The output node's name. Defaults to `node`. */
  as: z.string().min(1).optional(),
  pivot: PivotSchema.optional(),
}).strict()

const SplitSchema = z.object({
  name: z.string().min(1),
  /** `components`: whole connected shells whose bounds lie inside the box.
   *  `triangles`: every triangle whose centroid lies inside the box. */
  select: z.enum(['components', 'triangles']).default('components'),
  boxMin: vec3,
  boxMax: vec3,
  pivot: PivotSchema.optional(),
}).strict()

const shipRole = z.enum(SHIP_ROLES)

/**
 * A ship's fit to its ShipSpec and its paint (ship-models spec §4.1). Only
 * `content/ships/` outputs carry it, and they must.
 */
const ShipSchema = z.object({
  /** The content/ships/<spec>.json the model is fitted to; the sim is authoritative (§4). */
  spec: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  /** `deck`: a carrier, fitted to flightDeck. `hull`: length from normalize, beam at the waterline. */
  fit: z.enum(['deck', 'hull']),
  /** `waterline`: cut flat at y = 0, gets a skirt. `full-hull`: keeps its own underwater hull. */
  kind: z.enum(['waterline', 'full-hull']),
  palette: z.enum(Object.keys(SHIP_PALETTES) as [ShipPaletteId, ...ShipPaletteId[]]),
  /** Per source material: a palette role, `keep` (its textures, metalness 0) or `mask` (a lattice, alpha MASK 0.5). */
  materials: z.record(z.string().min(1), z.union([shipRole, z.enum(['keep', 'mask'])])).default({}),
  /** Every material `materials` does not name. `classify`: split by geometry (§5.1). */
  otherMaterials: z.union([shipRole, z.enum(['classify', 'keep'])]),
  /** Fitted meters, +x bow: where the damage smoke rises (a funnel top). */
  smokeOrigin: vec3,
  /** How the output proves its bow is at +x (§4.2). A pinned ratio records a hull form the narrow-end rule cannot read. */
  bow: z.union([
    z.enum(['narrow-end', 'island-starboard']),
    z.object({ pinnedNarrowEnd: positive, evidence: z.string().min(1) }).strict(),
  ]),
  /** full-hull only: the keel's fitted depth, measured once and pinned, so a moved waterline origin fails. */
  keelM: finite.optional(),
}).strict()
export type ShipEntry = z.infer<typeof ShipSchema>

export const ModelEntrySchema = z.object({
  /** Unique, and the output file's basename. */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  /** The raw download, gitignored by `/tools/**\/cache/`. */
  input: z.string().regex(/^tools\/models\/cache\/[^/]+\.glb$/),
  /** Committed. Aircraft go to content/aircraft/, ships to content/ships/. */
  output: z.string().regex(/^content\/(aircraft|ships)\/[a-z0-9-]+\.glb$/),
  source: z.object({
    url: z.string().url().startsWith('https://sketchfab.com/3d-models/'),
    uid: z.string().regex(/^[0-9a-f]{32}$/),
    author: z.string().min(1),
    license: z.enum(['CC-BY-4.0', 'CC0-1.0']),
  }).strict(),
  /** Why this entry's committed output must not be regenerated, if it must not. A frozen
   *  entry is skipped by a bare `models:build` and refused by `models:build -- <id>`
   *  unless `--force` is given. */
  frozen: z.string().min(1).optional(),
  normalize: z.object({
    forward: axis,
    up: axis,
    origin: vec3,
    fit: z.object({ extent: z.enum(['span', 'length']), meters: positive }).strict(),
  }).strict().optional(),
  keep: z.array(KeepSchema).default([]),
  split: z.array(SplitSchema).default([]),
  remove: z.array(z.string().min(1)).default([]),
  simplify: z.object({
    ratio: fraction,
    error: positive,
    perNode: z.record(z.string().min(1), fraction).default({}),
  }).strict().optional(),
  textures: z.object({
    maxSize: positiveInt.refine((n) => (n & (n - 1)) === 0, { message: 'must be a power of two' }),
    format: z.literal('webp'),
  }).strict(),
  opaque: z.boolean().default(true),
  budget: z.object({ maxBytes: positiveInt, maxTriangles: positiveInt, maxDrawCalls: positiveInt }).strict(),
  /** An output node whose center must be the scene's max-X point. */
  noseNode: z.string().min(1).optional(),
  /** Ships only (ship-models spec §4.1). */
  ship: ShipSchema.optional(),
}).strict().superRefine((e, ctx) => {
  const fail = (path: (string | number)[], message: string): void => { ctx.addIssue({ code: z.ZodIssueCode.custom, path, message }) }
  if (e.output.replace(/^.*\//, '').replace(/\.glb$/, '') !== e.id) fail(['output'], `basename must equal id "${e.id}"`)
  if (!e.source.url.endsWith(e.source.uid)) fail(['source', 'uid'], 'must be the last segment of source.url')
  if (e.normalize && e.normalize.forward[1] === e.normalize.up[1]) fail(['normalize', 'up'], 'must not be parallel to forward')
  const outNames = [...e.keep.map((k) => k.as ?? k.node), ...e.split.map((s) => s.name)]
  const dup = outNames.find((n, i) => outNames.indexOf(n) !== i)
  if (dup !== undefined) fail(['keep'], `output name "${dup}" is used twice`)
  e.split.forEach((s, i) => {
    if (!s.boxMin.every((v, k) => v < s.boxMax[k]!)) fail(['split', i, 'boxMax'], 'must exceed boxMin on every axis')
  })
  if (!e.normalize) {
    e.keep.forEach((k, i) => { if (k.pivot) fail(['keep', i, 'pivot'], 'a pivot needs normalize: without it the hierarchy is left as authored') })
    e.split.forEach((s, i) => { if (s.pivot) fail(['split', i, 'pivot'], 'a pivot needs normalize: without it the hierarchy is left as authored') })
  }
  e.remove.forEach((r, i) => { if (e.keep.some((k) => k.node === r || k.as === r)) fail(['remove', i], `"${r}" is also kept`) })
  if (e.noseNode !== undefined && !outNames.includes(e.noseNode)) fail(['noseNode'], `"${e.noseNode}" is not a keep or split output name`)
  const toShips = e.output.startsWith('content/ships/')
  if (toShips && !e.ship) fail(['ship'], 'a content/ships/ output needs a ship block')
  if (e.ship) {
    if (!toShips) fail(['ship'], 'only a content/ships/ output takes a ship block')
    if (!e.normalize) fail(['normalize'], 'a ship needs normalize: the fit runs on its output')
    if (e.opaque) fail(['opaque'], 'must be false for a ship: shipMaterials owns alpha (§5.3)')
    if ((e.ship.fit === 'deck') !== (e.ship.bow === 'island-starboard')) fail(['ship', 'bow'], 'a carrier (fit "deck") proves its bow by "island-starboard", and only a carrier does')
    if ((e.ship.kind === 'full-hull') !== (e.ship.keelM !== undefined)) fail(['ship', 'keelM'], 'required for a full-hull model, and only for one')
  }
})

export type ModelEntry = z.infer<typeof ModelEntrySchema>

export const ENTRIES_DIR = 'tools/models/entries'

export function parseModelEntry(raw: unknown): ModelEntry {
  return ModelEntrySchema.parse(raw)
}

/** Every entry, validated, with the file basename checked against `id`. */
export function loadModelEntries(dir: string = ENTRIES_DIR): ModelEntry[] {
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const entry = parseModelEntry(JSON.parse(readFileSync(join(dir, f), 'utf8')))
    if (basename(f, '.json') !== entry.id) throw new Error(`${join(dir, f)}: file name must be ${entry.id}.json`)
    return entry
  })
}
