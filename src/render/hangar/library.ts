// src/render/hangar/library.ts
import { z } from 'zod'
import type { AircraftSpec } from '../../sim/flight/schema.js'
import type { ShipSpec } from '../../sim/world/ships.js'
import type { Airfield } from '../../sim/world/airfields.js'

/**
 * One file per object, `content/library/<id>.json` (Hangar spec §4.1). Prose
 * only: every figure a card shows is read from sim content at load (§4.2,
 * `stats.ts`), so a gameplay rebalance can never leave the library wrong.
 */
export const LIBRARY_KINDS = ['aircraft', 'ship', 'building'] as const
export type LibraryKind = (typeof LIBRARY_KINDS)[number]
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
  /** Sim spec id: an aircraft or ship id, or a building `kind`. Absent = "Not yet in service" (§4.3). */
  spec: z.string().min(1).optional(),
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
}
