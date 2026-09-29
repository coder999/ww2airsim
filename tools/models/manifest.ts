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

const SketchfabSourceSchema = z.object({
  kind: z.literal('sketchfab'),
  url: z.string().url().startsWith('https://sketchfab.com/3d-models/'),
  uid: z.string().regex(/^[0-9a-f]{32}$/),
  author: z.string().min(1),
  license: z.enum(['CC-BY-4.0', 'CC0-1.0']),
}).strict()

/** A model built by our own script from cited dimensions (O1, ordnance spec §2.2). The
 *  generator owns geometry, materials and textures; the entry names it and its citation. */
const GeneratedSourceSchema = z.object({
  kind: z.literal('generated'),
  generator: z.string().regex(/^tools\/models\/generated\/[a-z0-9-]+\.ts$/, { message: 'generator must be tools/models/generated/<name>.ts' }),
  dimensions: z.string().min(1),
  license: z.literal('AGPL-3.0-or-later'),
}).strict()

/** An original model authored in Blender (model-roster spec §4.1). The script writes a raw glb
 *  to tools/models/cache/<id>.glb, which then runs the same stages a Sketchfab download does,
 *  so an entry may use normalize, keep, split and the rest. */
const BlenderSourceSchema = z.object({
  kind: z.literal('blender'),
  script: z.string().regex(/^tools\/models\/blender\/[a-z0-9-]+\.py$/, { message: 'script must be tools/models/blender/<name>.py' }),
  dimensions: z.string().min(1),
  license: z.literal('AGPL-3.0-or-later'),
}).strict()

/** Entries written before O1 carry no `kind`: they are Sketchfab downloads. */
const SourceSchema = z.preprocess(
  (s) => (s !== null && typeof s === 'object' && !('kind' in s) ? { kind: 'sketchfab', ...s } : s),
  z.discriminatedUnion('kind', [SketchfabSourceSchema, GeneratedSourceSchema, BlenderSourceSchema]),
)
export type SketchfabSource = z.infer<typeof SketchfabSourceSchema>
export type GeneratedSource = z.infer<typeof GeneratedSourceSchema>
export type BlenderSource = z.infer<typeof BlenderSourceSchema>

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
  /** The raw download (Sketchfab entries only), gitignored by `/tools/**\/cache/`. */
  input: z.string().regex(/^tools\/models\/cache\/[^/]+\.glb$/).optional(),
  /** Committed. Aircraft to content/aircraft/, ships to content/ships/, ordnance to
   *  content/ordnance/ (generated only), and the Library-only buildings and vehicles to
   *  content/buildings/ and content/vehicles/ (R1). */
  output: z.string().regex(/^content\/(aircraft|ships|ordnance|buildings|vehicles)\/[a-z0-9-]+\.glb$/),
  source: SourceSchema,
  /** Why this entry's committed output must not be regenerated, if it must not. A frozen
   *  entry is skipped by a bare `models:build` and refused by `models:build -- <id>`
   *  unless `--force` is given. */
  frozen: z.string().min(1).optional(),
  normalize: z.object({
    forward: axis,
    up: axis,
    origin: vec3,
    /** R3: turns the whole source about `up` by this many degrees first (a showcase pose), so
     *  every other coordinate in the entry is in the turned frame (`models:inspect -- <glb> --yaw <deg>`). */
    yawDeg: finite.refine((v) => v !== 0 && v > -180 && v <= 180, { message: 'must be nonzero and in (-180, 180]' }).optional(),
    /** Turns the whole source about its lateral axis (forward x up) by this many degrees, right-handed
     *  (positive raises the nose), after `yawDeg` and before anything reads a coordinate: a download drawn
     *  in a sitting, tail-down pose is leveled to the airplane's thrust line. Every other coordinate in
     *  the entry is in the turned frame. */
    pitchDeg: finite.refine((v) => v !== 0 && v > -90 && v < 90, { message: 'must be nonzero and in (-90, 90)' }).optional(),
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
  /** R3: merge identical textures and materials before join (a download with one material per part). */
  dedupMaterials: z.literal(true).optional(),
  budget: z.object({ maxBytes: positiveInt, maxTriangles: positiveInt, maxDrawCalls: positiveInt }).strict(),
  /** An output node whose center must be the scene's max-X point. */
  noseNode: z.string().min(1).optional(),
  /** Ships only (ship-models spec §4.1). */
  ship: ShipSchema.optional(),
  /** DP0: the Blender script is skinned (`kit.Model(name, skin=<px>)`), and the build bakes its atlas. */
  skin: z.literal(true).optional(),
  /** DP2: a downloaded ship with no usable UVs is box-projected at world scale and skinned (spec §4, §8 Q1). */
  boxSkin: z.object({ atlasPx: z.union([z.literal(512), z.literal(1024), z.literal(2048)]) }).strict().optional(),
}).strict().superRefine((e, ctx) => {
  const fail = (path: (string | number)[], message: string): void => { ctx.addIssue({ code: z.ZodIssueCode.custom, path, message }) }
  if (e.output.replace(/^.*\//, '').replace(/\.glb$/, '') !== e.id) fail(['output'], `basename must equal id "${e.id}"`)
  if (e.source.kind === 'sketchfab') {
    if (!e.source.url.endsWith(e.source.uid)) fail(['source', 'uid'], 'must be the last segment of source.url')
    if (e.input === undefined) fail(['input'], 'a sketchfab entry needs its raw input')
  } else if (e.source.kind === 'generated') {
    for (const k of ['input', 'normalize', 'simplify', 'ship', 'noseNode', 'frozen'] as const) {
      if (e[k] !== undefined) fail([k], `a generated entry takes no ${k}: its generator owns the geometry`)
    }
    for (const k of ['keep', 'split', 'remove'] as const) {
      if (e[k].length > 0) fail([k], `a generated entry takes no ${k}: its generator owns the geometry`)
    }
  } else {
    if (e.input !== undefined) fail(['input'], 'a blender entry takes no input: the build writes its raw glb to tools/models/cache/<id>.glb')
    if (/\/(kit|preview)\.py$/.test(e.source.script)) fail(['source', 'script'], 'kit.py and preview.py are kit modules, not models')
  }
  if (e.output.startsWith('content/ordnance/') !== (e.source.kind === 'generated')) {
    fail(['output'], 'content/ordnance/ outputs are generated, and only generated entries write there (O1)')
  }
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
  if (e.skin && e.source.kind !== 'blender') fail(['skin'], 'skin: true is for Blender entries: only the kit writes the charts and sidecar it needs')
  // DP2 (Ruling S1): a skinned ship passes its one skin material through shipMaterials, so a
  // keep or mask rule (per source material) has nothing left to apply to.
  if (e.skin && e.ship) {
    for (const [k, v] of Object.entries(e.ship.materials)) if (v === 'keep' || v === 'mask') fail(['ship', 'materials', k], 'a skinned ship\'s one skin material replaces every role: keep and mask do not apply')
  }
  if (e.boxSkin) {
    if (e.source.kind !== 'sketchfab' || !e.ship) fail(['boxSkin'], 'boxSkin is for a downloaded ship: it projects the roles shipMaterials assigns')
    else {
      const rules = [...Object.values(e.ship.materials), e.ship.otherMaterials]
      if (rules.some((r) => r === 'keep' || r === 'mask')) fail(['boxSkin'], 'boxSkin needs every material classified or mapped to a role: a kept texture has its own UVs')
    }
    if (e.textures.maxSize !== e.boxSkin.atlasPx) fail(['boxSkin', 'atlasPx'], `must equal textures.maxSize (${e.textures.maxSize})`)
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
