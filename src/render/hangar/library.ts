// src/render/hangar/library.ts
import { z } from 'zod'
import type { AircraftSpec } from '../../sim/flight/schema.js'
import type { ShipSpec } from '../../sim/world/ships.js'
import type { Airfield } from '../../sim/world/airfields.js'
import type { BudgetTable } from './budgets.js'
import type { ProvenanceTable } from './provenance.js'

/**
 * One file per object, `content/library/<id>.json` (Hangar spec §4.1). Prose
 * only: every figure a card shows is read from sim content at load (§4.2,
 * `stats.ts`), so a gameplay rebalance can never leave the library wrong.
 */
export const LIBRARY_KINDS = ['aircraft', 'ship', 'building', 'vehicle', 'ordnance'] as const
export type LibraryKind = (typeof LIBRARY_KINDS)[number]
/** The kinds that can carry their own model (model-roster spec §4.3). Ordnance in a spec draws its
 *  store model by that spec (O1); ordnance no spec carries yet (the torpedoes, V1) names its own. */
export const MODEL_KINDS = ['aircraft', 'ship', 'building', 'vehicle', 'ordnance'] as const
export type ModelKind = (typeof MODEL_KINDS)[number]
export interface ModelRef { readonly kind: ModelKind; readonly id: string }
export const SIDES = ['allied', 'japanese'] as const
export type Side = (typeof SIDES)[number]

export const LibraryEntrySchema = z.object({
  /** Unique; equals the file basename. */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  /** Display name. For a shipped aircraft or ship spec, a test asserts it equals the spec's `name`. */
  name: z.string().min(1),
  /** The GAMEPLAY.md roster row this entry covers, when that row's text is
   *  not `name` (the roster names a type, "Grumman F6F Hellcat"; the spec a
   *  variant, "Grumman F6F-5 Hellcat"). Absent = `name`. */
  rosterName: z.string().min(1).optional(),
  kind: z.enum(LIBRARY_KINDS),
  side: z.enum(SIDES),
  /** Sim spec id: an aircraft or ship id, a building `kind`, or a store type id (ordnance). A vehicle never has one. Absent and no `model` = "Not yet in service" (§4.3). */
  spec: z.string().min(1).optional(),
  /** A model the Hangar draws for this entry, in place of the spec's `view.model` (model-roster
   *  spec §4.3). With no `spec`, the entry is drawn but is "not in the game yet". The id resolves
   *  in AIRFRAME_MODELS, SHIP_MODELS, STATIC_MODELS or the generated ordnance entries by kind (tests/render/hangar/roster.test.ts). */
  model: z.object({ kind: z.enum(MODEL_KINDS), id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/) }).strict().optional(),
  /** One or two sentences: what it is in this game. Never a gameplay number (§4.2). */
  blurb: z.string().min(1),
  /** One to three short paragraphs, separated by a blank line: the real thing. */
  history: z.string().min(1),
  sources: z.array(z.object({
    title: z.string().min(1),
    url: z.string().url(),
    /** The date the source was read, ISO. */
    read: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).strict()).min(1),
}).strict().superRefine((e, ctx) => {
  const n = historyParagraphs(e.history).length
  if (n < 1 || n > 3) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['history'], message: `must be 1 to 3 paragraphs, found ${n}` })
  if (e.model !== undefined && e.model.kind !== e.kind) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['model', 'kind'], message: `must be the entry's own kind "${e.kind}"` })
  if (e.kind === 'vehicle' && e.spec !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['spec'], message: 'no vehicle is in the sim: a vehicle entry takes no spec' })
})

export type LibraryEntry = z.infer<typeof LibraryEntrySchema>

export function parseLibraryEntry(raw: unknown): LibraryEntry {
  return LibraryEntrySchema.parse(raw)
}

export function historyParagraphs(history: string): string[] {
  return history.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0)
}

/** A number followed by a unit, the thing §4.2 forbids in a blurb. */
const GAMEPLAY_NUMBER = /\d[\d,.]*\s*(?:hp|HP|m\/s|kn|knots|mph|km\/h|m|ft)(?![A-Za-z])/g

/** Every "number + unit" in `blurb`, for the test to report. Empty = clean. */
export function gameplayNumbersIn(blurb: string): string[] {
  return blurb.match(GAMEPLAY_NUMBER) ?? []
}

/** The roster row text an entry answers for. */
export const rosterNameOf = (e: LibraryEntry): string => e.rosterName ?? e.name

/** Everything the hangar reads, parsed. Node tests build it with
 *  tools/content/load.ts (tests/render/hangar/content.ts); the page builds it
 *  in contentIndex.ts. */
export interface HangarContent {
  readonly library: readonly LibraryEntry[]
  readonly aircraft: readonly AircraftSpec[]
  readonly ships: readonly ShipSpec[]
  readonly airfields: readonly Airfield[]
  /** Each shipped model's manifest budget, by output path (H2). */
  readonly budgets: BudgetTable
  /** Where each shipped model came from, by output path (the card's Model row). */
  readonly provenance: ProvenanceTable
}
