# H1: the Hangar's library, catalog and viewer, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separate `hangar.html` page that lists every plane, ship and building the game has or plans. For each one it shows a card: its gameplay figures, read live from sim content, and a sourced historical note. Each object that is in service stands on a lit turntable, and a bench flag adds sliders that drive the landing gear and the propeller.

**Architecture:** One prose-only JSON file per object lives under `content/library/`. A Zod schema validates each file, and Node tests check every file against the sim content and against GAMEPLAY.md's roster tables. Pure modules turn that content into a catalog and into card figures: `catalog.ts`, `stats.ts`, `framing.ts` and `benchFlag.ts`. A single adapter, `models.ts`, builds the geometry. Aircraft come from Z1's airframe registry, ships from `createShipMesh`, and buildings from `drawBuilding`. The page reuses the game's renderer, lighting, exposure and frame pipeline. It never imports or touches the game's `main.ts`, and it never touches `src/sim/`.

**Tech Stack:** TypeScript (strict), three.js 0.186 (WebGPU, `OrbitControls` from `three/addons`), Vite (a second Rollup input, and `import.meta.glob`), Zod, vitest, Playwright (Tier 2).

**Spec:** `docs/superpowers/specs/2026-09-25-hangar-library-design.md`, approved by Mark on 2026-09-25 with every recommendation accepted. This plan is its §12 "H1". Read §2 to §10 and "Decisions" first.

**Where:** the worktree `/home/mark/projects/ww2airsim/.claude/worktrees/models-track`, branch `worktree-models-track`. The Models-track order is Z1, H1, S1, Z3, H2, S2, H3. **This plan starts after Z1 is complete on this branch** (`docs/superpowers/plans/2026-09-25-z1-model-pipeline.md`). Do not switch branches, and do not push.

## Open questions for Mark

Each question has a default, and the plan follows that default unless Mark says otherwise. Either answer is a one-task change.

1. **Roster names versus spec names.** Three shipped specs carry a variant name, and GAMEPLAY.md's rosters give a type name for the same object:
   - `Grumman F4F-4 Wildcat` against `Grumman F4F Wildcat`
   - `Grumman F6F-5 Hellcat` against `Grumman F6F Hellcat`
   - `Wartime Standard Type B cargo ship` against `Type B "Maru" transport`

   Z2's Zero will be a fourth: `Mitsubishi A6M2 Model 21 Zero` against `Mitsubishi A6M Zero`. The spec requires a library `name` to equal its spec's name (§4.1), and it also requires each roster row to match a library entry by name (§4.4). Both cannot hold for these entries.
   - **Default:** an optional `rosterName` field in the library schema, used only where the two names differ.
   - **Alternative:** rename those GAMEPLAY.md rows to the spec names, and drop the field.
2. **The side of a building kind.** Each library entry has exactly one `side`. The buildings stand at Tacloban and Dulag, which are friendly scenery in free flight but enemy targets in `strike-range` (`enemyAirfields: ["dulag"]`).
   - **Default:** `japanese` for all ten building entries. Both fields were Japanese-held until the landings, and the one scenario that scores buildings treats them as enemy.
   - **Alternative:** a third value, `"either"`. That is a schema change.

## Global Constraints

- `npm run verify` ends every task with `rc=0`. Capture it directly: `npm run verify; rc=$?; echo "rc=$rc"`. Never gate on a grepped pipeline.
- **Memory on nexus (22 GB total; `/tmp` is a 12 GB RAM-backed tmpfs).**
  - Never copy the repo or a model into `/tmp` or anywhere else.
  - Run at most one `npm run verify` on the machine at a time. Other sessions share the box.
  - `tests/build/dist.test.ts` builds twice into `os.tmpdir()`. While iterating, run only named files: `npx vitest run <file> --maxWorkers=2`.
  - To look at a real build, write it inside the worktree (`npx vite build --outDir .superpowers/h1-dist`) and delete it afterward.
- **`src/sim/` is not touched** (Hangar spec §2). Library content is render-side.
- **No edits to the game's `src/render/main.ts`** (§2).
- **A library file carries prose only.** Every figure comes from sim content at load time (§4.2), and a test rejects any number followed by a unit in a `blurb`.
- **Every `history` claim traces to a source read on the date recorded** in that file's `sources[].read` (§4.5). A stand-in is always disclosed on the card, never hidden.
- **Ownership (§13).**
  - This work owns `src/render/hangar/**`, `hangar.html`, `content/library/**`, `tests/render/hangar/**` and `tests/e2e/hangar.spec.ts`.
  - It shares these files, touching only what each item names:
    - `src/render/titleScreen.ts`: one button
    - `vite.config.ts`: one Rollup input
    - `tests/build/dist.test.ts`: two assertions
    - `src/render/debrief.ts`: two exports, no behavior change
    - GAMEPLAY.md: one section
  - It edits nothing under `tools/models/**` or `src/render/models/**`, and it does not change `Airframe`.
  - Re-diff every shared file against `HEAD` right before each commit.
- Tier 2 runs only in Task 10, on the `ww2airsim-3` slot (port 5174), per the repo `CLAUDE.md`. No dev server before that.
- US spelling in new prose and identifiers. Escape `|` as `\|` inside markdown table cells.
- End each commit message with the `Co-Authored-By` trailer your session's instructions specify.

## What H1 consumes from Z1, and where this plan departs from the spec's wording

The spec wrote H1 against "today's builders", because at the time Z1 did not exist. Mark's order puts Z1 first, so H1 builds on Z1 directly:

- **Aircraft load through Z1's registry.** `loadRegisteredAirframe(spec.view.model)` from `src/render/scenarioEntities.ts` builds them, which is exactly how the game builds them. The bench reads Z1's `Airframe.parts`, per Hangar decision 1. So spec §7's H1 and H2 aircraft paths merge into one. H2 keeps everything else in §12: flap and stores controls, Cycle, gizmos, wireframe, counts against the budget, Lane C ships, and `docs/models.md`.
- **The Z1 names this plan uses:**
  - `Airframe`, `PartId` and `AirframeUpdate` from `src/render/scene/airframe.ts`
  - `LoadAirframe` and `loadRegisteredAirframe` from `src/render/scenarioEntities.ts`
  - `disposeMeshTree` from `src/render/models/dispose.ts`

  If Z1's handoff names them differently, follow the handoff and note the difference in the progress ledger.
- **The target-type rule is mirrored, not shared.** The rule that decides which score row a kill lands in lives inline in `src/sim/weapons/combat.ts`. The spec keeps `src/sim/` untouched, so `stats.ts` holds a two-function copy of that rule (`shipTargetType` and `structureTargetType`), with a comment naming each source expression and a test that pins every case. The **points table** is not copied: `debrief.ts` exports `pointsForTargetType`, and a test checks that the hangar and the debrief agree for every target type.
- **Three hooks beyond the spec's list:**
  - `tick(frameS)`, so "two frames 1/60 s apart" is exact while the page is frozen
  - `setModelVisible(visible)`, which renders the empty frame that the pixel masks subtract
  - `current()`, which tells a check what the selected model's kind and parts are
- **`freeze()` also switches the frame pipeline to SMAA.** TRAA jitters the projection every frame, so two frozen frames would differ by the jitter alone.
- **Content is bundled with `import.meta.glob`, not fetched.** A browser cannot list `content/library/`. `dist/content/library/` still ships one file per entry through `copyContent`, and the dist test asserts that.
- **Task order.** The spec's Task 1 ("coverage tests, red at first") is folded into Tasks 1 to 3, so that every commit stays green. The schema and its unit tests come first. Coverage tests 1, 2, 3 and 5 arrive with the shipped entries. Coverage test 4, the roster check, arrives with the rest of the entries. Catalog (spec Task 5) comes before stats (spec Task 4), because the stats tests read the catalog.

## Measured before writing this plan (2026-09-25, this worktree at `d07f1cd`, the Z1 plan's commit)

- **The code in this plan was run before it was written down.** Z1's runtime changes were applied to this worktree temporarily, together with every H1 file in this plan and 32 draft library files. Everything checked out:
  - `tsc --noEmit` passed. `eslint --max-warnings 0` passed on the hangar modules, the Tier 2 spec and `titleScreen.ts`.
  - `depcruise` reported no violations across 176 modules.
  - The named test files passed: 64 tests in 8 files (`tests/render/hangar/` and `tests/render/titleScreen.test.ts`).
  - `npx vite build --outDir .superpowers/h1-probe/dist` took 4.1 s at a peak RSS of 537 MB. It produced `dist/hangar.html`, with all 32 library files under `dist/content/library/`, and the library prose was inside `assets/hangar-*.js`.

  The worktree was then restored, and `git status` came back clean. **Tier 2 was not run.** The Tier 2 spec was typechecked and linted only.
- **Rosters,** parsed from GAMEPLAY.md:
  - 12 aircraft rows
  - **10** ship rows. The spec's §1 says 9, but there are 10.
  - 5 shipped-building rows across 3 kinds (`hangar`, `tower`, `aaa`), and 7 candidate-building rows

  That makes 32 library files: 12 aircraft, 10 ships, 3 building kinds and 7 candidate buildings. The vehicle roster is out of scope, because §4.4 names three tables.
- **Spec names** (`jq .name`): `Grumman F4F-4 Wildcat`, `Grumman F6F-5 Hellcat`, `Essex-class fleet carrier`, `Fletcher-class destroyer` and `Wartime Standard Type B cargo ship`. Z2's plan names its Zero `Mitsubishi A6M2 Model 21 Zero`.
- **Building placements** (`content/bases`):
  - Tacloban has three hangars (120 HP each), a tower (40 HP) and an AAA battery (30 HP).
  - Dulag has two hangars, at 90 HP and 50 HP.
  - So the hangar card reads `50–120 HP` and `Dulag ×2, Tacloban ×3`.
- **The F6F's figures,** as the card computes them:
  - top speed 174.79 m/s × 3.6, which rounds to `629 km/h`, at 7,040.9 m, which rounds to `7,041 m`
  - 6 guns × 400 rounds
  - `structureHp` 120
- **The hangar sun.** `SUN_DIRECTION` is (0.4, 1, 0.3), which gives an elevation of atan2(1, 0.5) = 63.43°. `exposureFor` and `atmospherePalette` are evaluated at that elevation.

## Review Focus

Five things the spec implies but no test checks. Each one gets a test in the task that owns the code.

1. **A library entry that names a spec which does not exist,** for example a typo or a ship that was later renamed. The catalog throws, naming both the entry and the spec. The page shows the bad-content screen, never a blank card. (Task 4.)
2. **A building kind that stands at several airfields with different HP.** The card shows the range, and says where each placement stands. It must not show the first placement's HP as if it were the only one. (Task 5.)
3. **An aircraft whose model has no gear or flap geometry.** The row reads "not modeled", based on `Airframe.parts`, and there is no slider that moves nothing. (Task 8.)
4. **Two frozen frames that differ only by TRAA jitter.** Any pixel-mask check would then pass for the wrong reason. `freeze()` switches the pipeline to SMAA, and Tier 2 check 3 includes a zero-throttle control. (Task 10.)
5. **Z2 merges its Zero before or during H1.** Then `a6m2-zero.json` exists, and coverage test 3 fails until the Zero's library entry gains its `spec`. (Task 2 Step 1.)

---

## File structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/render/hangar/library.ts` | create | `LibraryEntrySchema`, `parseLibraryEntry`, `historyParagraphs`, `gameplayNumbersIn`, `rosterNameOf` |
| `content/library/*.json` | create | 32 prose files |
| `tests/render/hangar/content.ts` | create | the Node-side `HangarContent` loader and the GAMEPLAY.md roster-table reader |
| `src/render/hangar/catalog.ts` | create | `buildCatalog`, `filterCatalog`, `HangarContent`, `CatalogEntry` |
| `src/render/debrief.ts` | modify | export `pointsForTargetType` and `targetLabel` |
| `src/render/hangar/stats.ts` | create | `figuresFor`, `shipTargetType`, `structureTargetType` |
| `src/render/hangar/contentIndex.ts` | create | the page's glob-bundled content |
| `hangar.html`, `vite.config.ts` | create, modify | the second page and its Rollup input |
| `src/render/hangar/framing.ts`, `stage.ts` | create | turntable framing (pure), and the renderer, lights, grid, water and pad |
| `src/render/hangar/models.ts`, `bench.ts` | create | the one geometry adapter, and the bench rows |
| `src/render/hangar/panel.ts`, `benchFlag.ts`, `hooks.ts`, `main.ts` | create | the list, filters and card; the bench switch; `window.__hangar`; the page's boot |
| `src/render/titleScreen.ts` | modify | the "Library" button on Form 1 |
| `tests/render/hangar/*.test.ts`, `tests/e2e/hangar.spec.ts` | create | per task |
| `tests/build/dist.test.ts`, `tests/render/titleScreen.test.ts` | modify | per task |
| `GAMEPLAY.md`, master spec §15, `README.md`, `docs/handoff/` | modify, create | Task 10 |

---

### Task 1: The library schema

**Files:**
- Create: `src/render/hangar/library.ts`, `tests/render/hangar/content.ts`
- Test: `tests/render/hangar/library.test.ts`. This task writes only the `LibraryEntrySchema` block; Tasks 2 and 3 add the coverage block.

**Interfaces:**
- Produces:
  - `LIBRARY_KINDS`, `type LibraryKind = 'aircraft' | 'ship' | 'building'`, `SIDES` and `type Side = 'allied' | 'japanese'`
  - `LibraryEntrySchema`, `type LibraryEntry`: `{ id, name, rosterName?, kind, side, spec?, blurb, history, sources: { title, url, read }[] }`
  - `parseLibraryEntry(raw)`, `historyParagraphs(history): string[]`, `gameplayNumbersIn(blurb): string[]` and `rosterNameOf(entry): string`
  - `HangarContent { library, aircraft, ships, airfields }`. It lives in `library.ts`, and `catalog.ts` re-exports it.
  - Test helpers: `libraryIds()`, `loadLibraryEntry(id)`, `nodeHangarContent(): HangarContent` and `rosterColumn(markdown, section, nth?, column?): string[]`.

- [ ] **Step 1: Write the helper and the failing schema test.** Create `tests/render/hangar/content.ts`. It is used from Task 2 on.

```ts
// tests/render/hangar/content.ts
import { readdirSync, readFileSync } from 'node:fs'
import { loadAircraftSpec, loadAirfield, loadShipSpec } from '../../../tools/content/load.js'
import { parseLibraryEntry, type HangarContent, type LibraryEntry } from '../../../src/render/hangar/library.js'

const ids = (dir: string): string[] => readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => f.replace(/\.json$/, ''))

export const LIBRARY_DIR = 'content/library'
export const libraryIds = (): string[] => ids(LIBRARY_DIR)
export const loadLibraryEntry = (id: string): LibraryEntry => parseLibraryEntry(JSON.parse(readFileSync(`${LIBRARY_DIR}/${id}.json`, 'utf8')))

/** The same `HangarContent` contentIndex.ts builds in the page, from disk. */
export function nodeHangarContent(): HangarContent {
  return {
    library: libraryIds().map(loadLibraryEntry),
    aircraft: ids('content/aircraft').map(loadAircraftSpec),
    ships: ids('content/ships').map(loadShipSpec),
    airfields: ids('content/bases').map(loadAirfield),
  }
}

/** First-column cells (or the `column`th) of the first `nth` markdown table in
 *  GAMEPLAY.md's `## <section>`, backticks stripped. Throws if the table is
 *  missing, so a reformat fails loudly (Hangar spec §14). */
export function rosterColumn(markdown: string, section: string, nth = 0, column = 0): string[] {
  const body = markdown.split(/^## /m).find((s) => s.startsWith(`${section}\n`))
  if (body === undefined) throw new Error(`GAMEPLAY.md has no "## ${section}" section`)
  const tables: string[][] = []
  let current: string[] | null = null
  for (const line of body.split('\n')) {
    if (line.startsWith('|')) {
      if (current === null) { current = []; tables.push(current) }
      current.push(line)
    } else current = null
  }
  const table = tables[nth]
  if (table === undefined || table.length < 3) throw new Error(`"## ${section}" has no table #${nth + 1}`)
  return table.slice(2).map((row) => row.split('|')[column + 1]!.trim().replace(/`/g, ''))
}
```

Create `tests/render/hangar/library.test.ts` containing only the second `describe` of the final file, `LibraryEntrySchema`, with these imports:

```ts
import { describe, expect, it } from 'vitest'
import { gameplayNumbersIn, parseLibraryEntry } from '../../../src/render/hangar/library.js'
```

- [ ] **Step 2: Run it to see it fail.**

Run: `npx vitest run tests/render/hangar/library.test.ts --maxWorkers=2`
Expected: FAIL. `library.js` does not resolve.

- [ ] **Step 3: Implement** `src/render/hangar/library.ts`:

```ts
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
```

- [ ] **Step 4: Run it to see it pass.** Expected: PASS, 6 tests.

- [ ] **Step 5: Verify and commit.**

```bash
npm run verify; rc=$?; echo "rc=$rc"
git add src/render/hangar/library.ts tests/render/hangar/
git commit -m "Hangar: LibraryEntrySchema with the no-gameplay-numbers blurb rule (H1 Task 1)"
```

---

### Task 2: Library files for every shipped spec, and the coverage tests

**Files:**
- Create: 8 files in `content/library/`, listed below
- Test: `tests/render/hangar/library.test.ts` gains the coverage `describe`, with tests 1, 2, 3 and 5.

**Interfaces:**
- Consumes: Task 1.
- Produces: library files that the catalog (Task 4) resolves.

- [ ] **Step 1: Check for Z2's Zero.** Run `ls content/aircraft/`. If `a6m2-zero.json` is there, the `a6m-zero` entry from Task 3 moves into this task and changes in three ways:
  - it gains `"spec": "a6m2-zero"`
  - its `name` becomes the spec's `name` (read it with `jq -r .name content/aircraft/a6m2-zero.json`)
  - its `rosterName` becomes `"Mitsubishi A6M Zero"`

  Its blurb stays as given in Task 3.

- [ ] **Step 2: Write the failing coverage tests.** Replace `tests/render/hangar/library.test.ts` with the final file below, but **leave out test 4** (the roster test). Task 3 adds it.

```ts
// tests/render/hangar/library.test.ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { gameplayNumbersIn, parseLibraryEntry, rosterNameOf } from '../../../src/render/hangar/library.js'
import { libraryIds, loadLibraryEntry, nodeHangarContent, rosterColumn } from './content.js'

const content = nodeHangarContent()
const gameplay = readFileSync('GAMEPLAY.md', 'utf8')
const entries = content.library
const buildingKinds = [...new Set(content.airfields.flatMap((a) => a.buildings.map((b) => b.kind)))]

describe('content/library (Hangar spec §4.4)', () => {
  it('1. every file parses, and its id equals its basename', () => {
    for (const id of libraryIds()) expect(loadLibraryEntry(id).id, `${id}.json`).toBe(id)
  })

  it("2. every spec resolves, and a shipped aircraft's or ship's name equals its spec's", () => {
    for (const e of entries) {
      if (e.spec === undefined) continue
      if (e.kind === 'aircraft') expect(content.aircraft.find((a) => a.id === e.spec)?.name, e.id).toBe(e.name)
      if (e.kind === 'ship') expect(content.ships.find((s) => s.id === e.spec)?.name, e.id).toBe(e.name)
      if (e.kind === 'building') expect(buildingKinds, e.id).toContain(e.spec)
    }
  })

  it('3. every sim spec has exactly one library entry', () => {
    const count = (kind: string, spec: string) => entries.filter((e) => e.kind === kind && e.spec === spec).length
    for (const a of content.aircraft) expect(count('aircraft', a.id), `aircraft ${a.id}`).toBe(1)
    for (const s of content.ships) expect(count('ship', s.id), `ship ${s.id}`).toBe(1)
    for (const k of buildingKinds) expect(count('building', k), `building kind ${k}`).toBe(1)
  })

  it("4. every row of GAMEPLAY.md's aircraft, ship and building rosters has an entry", () => {
    const named = (kind: string) => new Set(entries.filter((e) => e.kind === kind).map(rosterNameOf))
    for (const row of rosterColumn(gameplay, 'Aircraft roster')) expect(named('aircraft'), row).toContain(row)
    for (const row of rosterColumn(gameplay, 'Ship roster')) expect(named('ship'), row).toContain(row)
    // The shipped-building table is placements of a kind: match its Kind column.
    const kinds = new Set(entries.filter((e) => e.kind === 'building').map((e) => e.spec))
    for (const kind of rosterColumn(gameplay, 'Building roster', 0, 1)) expect(kinds, kind).toContain(kind)
    for (const row of rosterColumn(gameplay, 'Building roster', 1)) expect(named('building'), row).toContain(row)
  })

  it('5. no blurb carries a gameplay number', () => {
    for (const e of entries) expect(gameplayNumbersIn(e.blurb), e.id).toEqual([])
  })
})

describe('LibraryEntrySchema', () => {
  const valid = {
    id: 'x', name: 'X', kind: 'ship', side: 'allied', blurb: 'A ship.', history: 'One.\n\nTwo.',
    sources: [{ title: 'T', url: 'https://en.wikipedia.org/wiki/X', read: '2026-09-25' }],
  }
  it.each([
    ['an unknown key', { ...valid, hp: 3 }, /hp/],
    ['a bad side', { ...valid, side: 'axis' }, /side/],
    ['four history paragraphs', { ...valid, history: 'a\n\nb\n\nc\n\nd' }, /1 to 3 paragraphs/],
    ['no sources', { ...valid, sources: [] }, /sources/],
    ['a read date that is not ISO', { ...valid, sources: [{ ...valid.sources[0], read: '25 Sep 2026' }] }, /read/],
  ])('rejects %s', (_l, raw, message) => {
    expect(() => parseLibraryEntry(raw)).toThrow(message)
  })

  it('gameplayNumbersIn catches a number with a unit, and only that', () => {
    expect(gameplayNumbersIn('It has 120 HP and makes 33 kn, or 17.0 m/s.')).toEqual(['120 HP', '33 kn', '17.0 m/s'])
    expect(gameplayNumbersIn('Commissioned in 1943, one of 175 ships; 18-inch guns.')).toEqual([])
  })
})
```

Run: `npx vitest run tests/render/hangar/library.test.ts --maxWorkers=2`
Expected: FAIL at test 3, because every sim spec lacks its entry.

- [ ] **Step 3: Write the eight files.** For each one, read the source URL that same day. Every URL in these two tables was checked against the Wikipedia API on 2026-09-25, following redirects, and all of them resolve. That check proves only that the pages exist; it is not a read of what they say. Write `history` in one to three short paragraphs, as plain facts, **only from what that page says**. Record the source with `"read": "<today>"`. Add a second source whenever a claim needs one, for example history.navy.mil or a museum page (§4.5). The `blurb` is given here exactly, and must not change: it describes the object in this game, and it contains no number with a unit.

| id | name | rosterName | kind | side | spec | blurb | source to read |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `f4f-wildcat` | Grumman F4F-4 Wildcat | Grumman F4F Wildcat | aircraft | allied | `f4f-wildcat` | The rendered airframe every aircraft in the game uses today. It flies the Hellcat's placeholder numbers until it has its own trial data. | https://en.wikipedia.org/wiki/Grumman_F4F_Wildcat |
| `f6f-hellcat` | Grumman F6F-5 Hellcat | Grumman F6F Hellcat | aircraft | allied | `f6f-hellcat` | The player's fighter, flown from the carrier and from Tacloban. It is drawn with the Wildcat model until a Hellcat model is built. | https://en.wikipedia.org/wiki/Grumman_F6F_Hellcat |
| `essex-cv` | Essex-class fleet carrier | — | ship | allied | `essex-cv` | The fleet carrier the player launches from and lands on. | https://en.wikipedia.org/wiki/Essex-class_aircraft_carrier |
| `fletcher-dd` | Fletcher-class destroyer | — | ship | allied | `fletcher-dd` | The escort that screens the carrier task force. It sails with the fleet and does not score when sunk. | https://en.wikipedia.org/wiki/Fletcher-class_destroyer |
| `type-b-maru` | Wartime Standard Type B cargo ship | Type B "Maru" transport | ship | japanese | `type-b-maru` | A hostile merchant transport, the target of strike missions. It does not score when sunk yet. | https://en.wikipedia.org/wiki/Japanese_cargo_ship_Mimasaka_Maru_(1944) (the page the spec itself cites) |
| `hangar` | Hangar | — | building | japanese | `hangar` | A barrel-roofed aircraft hangar at Tacloban and Dulag, a Building target at an enemy-held field. | https://en.wikipedia.org/wiki/Hangar |
| `tower` | Control tower | — | building | japanese | `tower` | The timber control tower at Tacloban, a Building target at an enemy-held field. | https://en.wikipedia.org/wiki/Air_traffic_control |
| `aaa` | Anti-aircraft battery | — | building | japanese | `aaa` | A gun emplacement at Tacloban. It scores as an AAA battery and does not fire back yet. | https://en.wikipedia.org/wiki/Anti-aircraft_warfare |

**Stand-in disclosures, required in `history` (§4.5):**
- `f6f-hellcat`: "In this game the Hellcat is drawn with the Wildcat's model."
- `f4f-wildcat`: "In this game the Wildcat's flight figures are placeholders borrowed from the Hellcat."
- `type-b-maru`: the in-game type is a generic wartime standard cargo ship, and the "Maru" suffix is the naming convention, not a single ship.
- `hangar`, `tower`, `aaa`: the history describes the type of structure generally, and says that the in-game versions are generic.

This is the finished `fletcher-dd.json`. Its facts come from the page it cites, which was read on 2026-09-25 while writing this plan. Re-read the page, and update `read` if you change anything:

```json
{
  "id": "fletcher-dd",
  "name": "Fletcher-class destroyer",
  "kind": "ship",
  "side": "allied",
  "spec": "fletcher-dd",
  "blurb": "The escort that screens the carrier task force. It sails with the fleet and does not score when sunk.",
  "history": "The Fletcher class was the U.S. Navy's most numerous destroyer design of the war: 175 ships were commissioned between 1942 and 1944, built at nine shipyards. Each carried five 5-inch guns in single mounts and ten 21-inch torpedo tubes in two quintuple mounts.\n\nThe class served almost entirely in the Pacific. Off Samar on 25 October 1944, during the Battle of Leyte Gulf, USS Johnston and USS Hoel were sunk by Japanese battleship gunfire, Yamato's among it, while covering the escort carriers.",
  "sources": [
    { "title": "Fletcher-class destroyer", "url": "https://en.wikipedia.org/wiki/Fletcher-class_destroyer", "read": "2026-09-25" }
  ]
}
```

- [ ] **Step 4: Run the tests to see them pass.** Expected: PASS for tests 1, 2, 3 and 5, and for the schema block.

- [ ] **Step 5: Verify and commit.**

```bash
npm run verify; rc=$?; echo "rc=$rc"
git add content/library/ tests/render/hangar/library.test.ts
git commit -m "Hangar: library entries for every shipped aircraft, ship and building kind, with sourced history (H1 Task 2)"
```

---

### Task 3: Library files for every remaining roster row ("Not yet in service")

**Files:**
- Create: 24 files in `content/library/` (23 if the Zero moved into Task 2)
- Modify: `tests/render/hangar/library.test.ts`, adding test 4

**Interfaces:**
- Produces: full roster coverage. From now on, a GAMEPLAY.md roster row added without a library file fails the suite.

- [ ] **Step 1: Add test 4**, which is `"4. every row of GAMEPLAY.md's aircraft, ship and building rosters has an entry"` from the final file shown in Task 2. Run it. Expected: FAIL on the first missing row, which is `Lockheed P-38 Lightning`.

- [ ] **Step 2: Write the files.** Follow the same procedure as Task 2 Step 3. None of these files has a `spec`, so each card reads "Not yet in service". Where a roster row carries a caveat about its source, keep the history to what the cited page states.

| id | name | rosterName | kind | side | spec | blurb | source to read |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `p-38-lightning` | Lockheed P-38 Lightning | — | aircraft | allied | — | A twin-boom Army fighter, planned as a player-flown and friendly type. | https://en.wikipedia.org/wiki/Lockheed_P-38_Lightning |
| `b-17-flying-fortress` | Boeing B-17 Flying Fortress | — | aircraft | allied | — | A four-engine heavy bomber, planned as the subject of escort missions. | https://en.wikipedia.org/wiki/Boeing_B-17_Flying_Fortress |
| `b-29-superfortress` | Boeing B-29 Superfortress | — | aircraft | allied | — | A pressurized heavy bomber, planned as an escort subject. | https://en.wikipedia.org/wiki/Boeing_B-29_Superfortress |
| `f4u-corsair` | Vought F4U Corsair | — | aircraft | allied | — | A gull-winged Navy and Marine fighter, planned as a player-flown and friendly type. | https://en.wikipedia.org/wiki/Vought_F4U_Corsair |
| `a6m-zero` | Mitsubishi A6M Zero | — | aircraft | japanese | — | The Imperial Navy's carrier fighter and the game's first hostile airframe. | https://en.wikipedia.org/wiki/Mitsubishi_A6M_Zero |
| `d3a-val` | Aichi D3A Val | — | aircraft | japanese | — | A fixed-gear carrier dive bomber, planned as a hostile type. | https://en.wikipedia.org/wiki/Aichi_D3A |
| `ki-43-oscar` | Nakajima Ki-43 Oscar | — | aircraft | japanese | — | The Imperial Army's light fighter, planned as a hostile type. | https://en.wikipedia.org/wiki/Nakajima_Ki-43_Hayabusa |
| `ki-84-frank` | Nakajima Ki-84 Frank | — | aircraft | japanese | — | A late-war Army fighter with higher performance, planned as a hostile type. | https://en.wikipedia.org/wiki/Nakajima_Ki-84_Hayate |
| `g4m-betty` | Mitsubishi G4M Betty | — | aircraft | japanese | — | A twin-engine land-based bomber with defensive gunners, planned as a hostile type. | https://en.wikipedia.org/wiki/Mitsubishi_G4M |
| `ki-21-sally` | Mitsubishi Ki-21 Sally | — | aircraft | japanese | — | An Army twin-engine bomber, planned as a hostile type. | https://en.wikipedia.org/wiki/Mitsubishi_Ki-21 |
| `casablanca-cve` | Casablanca-class escort carrier | — | ship | allied | — | A small, slow escort carrier, planned for the Battle off Samar. | https://en.wikipedia.org/wiki/Casablanca-class_escort_carrier |
| `cleveland-cl` | Cleveland-class light cruiser | — | ship | allied | — | A light cruiser, planned as a friendly escort. | https://en.wikipedia.org/wiki/Cleveland-class_cruiser |
| `pennsylvania-bb` | Pennsylvania-class battleship | — | ship | allied | — | One of the older battleships, planned for Surigao Strait. | https://en.wikipedia.org/wiki/Pennsylvania-class_battleship |
| `kagero-dd` | Kagero-class destroyer | — | ship | japanese | — | A fleet destroyer, planned as a hostile escort. | https://en.wikipedia.org/wiki/Kagerō-class_destroyer |
| `shiratsuyu-dd` | Shiratsuyu-class destroyer | — | ship | japanese | — | A fleet destroyer, planned as a hostile escort. | https://en.wikipedia.org/wiki/Shiratsuyu-class_destroyer |
| `mogami-ca` | Mogami-class heavy cruiser | — | ship | japanese | — | A heavy cruiser, planned as a hostile surface target. | https://en.wikipedia.org/wiki/Mogami-class_cruiser |
| `yamato-bb` | Yamato-class battleship | — | ship | japanese | — | The heaviest battleship afloat, planned as a hostile surface target. | https://en.wikipedia.org/wiki/Yamato-class_battleship |
| `fuel-tank-farm` | Fuel tank farm | — | building | japanese | — | A planned target that burns when destroyed. | https://en.wikipedia.org/wiki/Tank_farm |
| `ammunition-bunker` | Ammunition bunker | — | building | japanese | — | A planned target with a secondary explosion. | https://en.wikipedia.org/wiki/Magazine_(artillery) |
| `radio-radar-station` | Radio / radar station | — | building | japanese | — | A planned strike objective. | https://en.wikipedia.org/wiki/Radar |
| `barracks-and-huts` | Barracks and huts | — | building | japanese | — | Planned targets that score as buildings. | https://en.wikipedia.org/wiki/Barracks |
| `revetment` | Revetment | — | building | japanese | — | Planned cover for parked aircraft; not a target in itself. | https://en.wikipedia.org/wiki/Revetment_(aircraft) |
| `coastal-gun-battery` | Coastal gun battery | — | building | japanese | — | A planned hostile shore defence. | https://en.wikipedia.org/wiki/Coastal_artillery |
| `pier-and-warehouses` | Pier and warehouses | — | building | japanese | — | A planned harbour target at a port town. | https://en.wikipedia.org/wiki/Pier |

- [ ] **Step 3: Run the tests to see them pass.**

Run: `npx vitest run tests/render/hangar/library.test.ts --maxWorkers=2`
Expected: PASS, 11 tests.

- [ ] **Step 4: Verify and commit.**

```bash
npm run verify; rc=$?; echo "rc=$rc"
git add content/library/ tests/render/hangar/library.test.ts
git commit -m "Hangar: a library entry for every roster row; GAMEPLAY.md's rosters are now a checked index (H1 Task 3)"
```

---

### Task 4: The catalog

**Files:**
- Create: `src/render/hangar/catalog.ts`, which re-exports `HangarContent` from `library.ts`.
- Test: `tests/render/hangar/catalog.test.ts`

**Interfaces:**
- Produces:
  - `Placement`, `CatalogSubject` (`{ kind: 'aircraft', spec }`, `{ kind: 'ship', spec }` or `{ kind: 'building', buildingKind, placements }`) and `CatalogEntry { library, subject | null }`
  - `buildCatalog(content): CatalogEntry[]`, which throws on an unresolved spec
  - `filterCatalog(entries, { kind, side })`, `FILTER_KINDS` and `FILTER_SIDES`

- [ ] **Step 1: Write the failing test**, `tests/render/hangar/catalog.test.ts`:

```ts
// tests/render/hangar/catalog.test.ts
import { describe, expect, it } from 'vitest'
import { buildCatalog, filterCatalog } from '../../../src/render/hangar/catalog.js'
import { nodeHangarContent } from './content.js'

const content = nodeHangarContent()
const catalog = buildCatalog(content)

describe('buildCatalog', () => {
  it('covers every library entry, aircraft then ships then buildings, in-service first within a kind', () => {
    expect(catalog.map((e) => e.library.id).sort()).toEqual(content.library.map((e) => e.id).sort())
    const kinds = catalog.map((e) => e.library.kind)
    expect(kinds.indexOf('ship')).toBeGreaterThan(kinds.lastIndexOf('aircraft'))
    expect(kinds.indexOf('building')).toBeGreaterThan(kinds.lastIndexOf('ship'))
    const aircraft = catalog.filter((e) => e.library.kind === 'aircraft')
    const firstOut = aircraft.findIndex((e) => e.subject === null)
    expect(aircraft.slice(firstOut).every((e) => e.subject === null)).toBe(true)
  })

  it('resolves a building kind to every placement across content/bases', () => {
    const hangar = catalog.find((e) => e.library.spec === 'hangar')!.subject
    expect(hangar?.kind).toBe('building')
    if (hangar?.kind !== 'building') return
    const expected = content.airfields.flatMap((a) => a.buildings.filter((b) => b.kind === 'hangar')).length
    expect(hangar.placements).toHaveLength(expected)
  })

  it('an entry naming a spec that does not exist throws, naming both', () => {
    const bad = { ...content, library: [{ ...content.library[0]!, id: 'ghost', kind: 'ship' as const, spec: 'no-such-ship' }] }
    expect(() => buildCatalog(bad)).toThrow(/ghost.*no-such-ship/)
  })

  it('filters by kind and side', () => {
    const jp = filterCatalog(catalog, { kind: 'ship', side: 'japanese' })
    expect(jp.length).toBeGreaterThan(0)
    expect(jp.every((e) => e.library.kind === 'ship' && e.library.side === 'japanese')).toBe(true)
    expect(filterCatalog(catalog, { kind: 'all', side: 'all' })).toHaveLength(catalog.length)
  })
})
```

- [ ] **Step 2: Run it to see it fail.** Expected: FAIL, because `catalog.js` does not resolve.

- [ ] **Step 3: Implement** `src/render/hangar/catalog.ts`:

```ts
// src/render/hangar/catalog.ts
import type { AircraftSpec } from '../../sim/flight/schema.js'
import type { ShipSpec } from '../../sim/world/ships.js'
import type { Airfield, Building } from '../../sim/world/airfields.js'
import { LIBRARY_KINDS, SIDES, type HangarContent, type LibraryEntry, type LibraryKind, type Side } from './library.js'

export type { HangarContent }

export interface Placement { readonly airfield: Airfield; readonly building: Building }

export type CatalogSubject =
  | { readonly kind: 'aircraft'; readonly spec: AircraftSpec }
  | { readonly kind: 'ship'; readonly spec: ShipSpec }
  | { readonly kind: 'building'; readonly buildingKind: Building['kind']; readonly placements: readonly Placement[] }

export interface CatalogEntry {
  readonly library: LibraryEntry
  /** null = "Not yet in service": no spec, no model, no figures (§4.3). */
  readonly subject: CatalogSubject | null
}

function subjectFor(e: LibraryEntry, c: HangarContent): CatalogSubject | null {
  if (e.spec === undefined) return null
  if (e.kind === 'aircraft') {
    const spec = c.aircraft.find((a) => a.id === e.spec)
    if (!spec) throw new Error(`library ${e.id}: no aircraft spec "${e.spec}"`)
    return { kind: 'aircraft', spec }
  }
  if (e.kind === 'ship') {
    const spec = c.ships.find((s) => s.id === e.spec)
    if (!spec) throw new Error(`library ${e.id}: no ship spec "${e.spec}"`)
    return { kind: 'ship', spec }
  }
  const placements = c.airfields.flatMap((airfield) => airfield.buildings.filter((b) => b.kind === e.spec).map((building) => ({ airfield, building })))
  if (placements.length === 0) throw new Error(`library ${e.id}: no building of kind "${e.spec}" in any content/bases file`)
  return { kind: 'building', buildingKind: placements[0]!.building.kind, placements }
}

/** Every library entry with its resolved sim subject, ordered aircraft,
 *  ships, buildings; within a kind, in-service first, then by name. */
export function buildCatalog(c: HangarContent): CatalogEntry[] {
  const entries = c.library.map((library) => ({ library, subject: subjectFor(library, c) }))
  const rank = (e: CatalogEntry): [number, number, string] =>
    [LIBRARY_KINDS.indexOf(e.library.kind), e.subject === null ? 1 : 0, e.library.name]
  return entries.sort((a, b) => {
    const [ka, sa, na] = rank(a), [kb, sb, nb] = rank(b)
    return ka - kb || sa - sb || na.localeCompare(nb)
  })
}

export interface CatalogFilter { readonly kind: LibraryKind | 'all'; readonly side: Side | 'all' }

export function filterCatalog(entries: readonly CatalogEntry[], f: CatalogFilter): CatalogEntry[] {
  return entries.filter((e) => (f.kind === 'all' || e.library.kind === f.kind) && (f.side === 'all' || e.library.side === f.side))
}

export const FILTER_KINDS: readonly (LibraryKind | 'all')[] = ['all', ...LIBRARY_KINDS]
export const FILTER_SIDES: readonly (Side | 'all')[] = ['all', ...SIDES]
```

- [ ] **Step 4: Run it to see it pass.** Expected: PASS, 4 tests. The third test is Review Focus 1.

- [ ] **Step 5: Verify and commit.**

```bash
npm run verify; rc=$?; echo "rc=$rc"
git add src/render/hangar/catalog.ts tests/render/hangar/catalog.test.ts
git commit -m "Hangar: catalog of library entries resolved against sim content (H1 Task 4)"
```

---

### Task 5: Points from the debrief, and the card's figures

**Files:**
- Modify: `src/render/debrief.ts`. The only change is two exports.
- Create: `src/render/hangar/stats.ts`
- Test: `tests/render/hangar/stats.test.ts`, `tests/render/hangar/points.test.ts`

**Interfaces:**
- Produces:
  - `pointsForTargetType(t): number` and `targetLabel(t): string`, from `debrief.ts`
  - `Figure { label, value, note? }`, where `value` carries its unit
  - `figuresFor(entry): Figure[]`
  - `shipTargetType(role): TargetType | null` and `structureTargetType(kind): TargetType`

- [ ] **Step 1: Write the failing tests.** Create `tests/render/hangar/points.test.ts`:

```ts
// tests/render/hangar/points.test.ts
import { describe, expect, it } from 'vitest'
import { missionScore, pointsForTargetType, targetLabel } from '../../../src/render/debrief.js'
import { TARGET_TYPES, zeroKillsByType } from '../../../src/sim/weapons/targetType.js'

describe('the hangar and the debrief agree on points (Hangar spec §5)', () => {
  it.each(TARGET_TYPES)('%s: one kill in a landed debrief scores pointsForTargetType', (t) => {
    const kills = { ...zeroKillsByType(), [t]: 1 }
    const rows = missionScore(kills, 'landed').rows
    const row = rows.find((r) => r.destroyed === 1)
    expect(row?.score).toBe(pointsForTargetType(t))
    expect(row?.target).toBe(targetLabel(t))
  })
})
```

and `tests/render/hangar/stats.test.ts`:

```ts
// tests/render/hangar/stats.test.ts
import { describe, expect, it } from 'vitest'
import { buildCatalog } from '../../../src/render/hangar/catalog.js'
import { figuresFor, shipTargetType, structureTargetType } from '../../../src/render/hangar/stats.js'
import { pointsForTargetType } from '../../../src/render/debrief.js'
import { nodeHangarContent } from './content.js'

const catalog = buildCatalog(nodeHangarContent())
const byId = (id: string) => catalog.find((e) => e.library.id === id)!
const figure = (id: string, label: string) => figuresFor(byId(id)).find((f) => f.label === label)

describe('figuresFor (Hangar spec §5), against committed content', () => {
  it("the F6F: structure HP, top speed, guns and rounds, points, all read from f6f-hellcat.json", () => {
    expect(figure('f6f-hellcat', 'Structure')?.value).toBe('120 HP')
    expect(figure('f6f-hellcat', 'Top speed')?.value).toBe('629 km/h at 7,041 m')
    expect(figure('f6f-hellcat', 'Top speed')?.note).toBeUndefined()
    expect(figure('f6f-hellcat', 'Guns')?.value).toBe('6, 2,400 rounds')
    expect(figure('f6f-hellcat', 'Points when shot down')?.value).toBe(String(pointsForTargetType('fighter')))
  })

  it("the F4F's borrowed flight figures carry its own PLACEHOLDER text; its HP does not", () => {
    expect(figure('f4f-wildcat', 'Top speed')?.note).toBe('PLACEHOLDER, not F4F-4 data')
    expect(figure('f4f-wildcat', 'Load limit')?.note).toBe('PLACEHOLDER, not F4F-4 data')
    expect(figure('f4f-wildcat', 'Structure')?.note).toMatch(/gameplay value/)
  })

  it('a ship: hull, dimensions, speed in knots and m/s; an escort does not score', () => {
    expect(figure('essex-cv', 'Points when sunk')?.value).toBe(pointsForTargetType('carrier').toLocaleString('en-US'))
    expect(figure('fletcher-dd', 'Points when sunk')?.value).toBe('none')
    expect(figure('fletcher-dd', 'Top speed')?.value).toMatch(/^\d+\.\d kn \(\d+\.\d m\/s\)$/)
  })

  it('a building kind: HP range across placements and where it stands', () => {
    expect(figure('hangar', 'Hit points')?.value).toBe('50–120 HP')
    expect(figure('hangar', 'Where')?.value).toBe('Dulag ×2, Tacloban ×3')
    expect(figure('aaa', 'Points when destroyed')?.value).toBe(String(pointsForTargetType('aaa')))
  })

  it('"Not yet in service" has no figures', () => {
    const out = catalog.find((e) => e.subject === null)!
    expect(figuresFor(out)).toEqual([])
  })
})

describe('the target-type mirror of src/sim/weapons/combat.ts', () => {
  it('ships: only carrier, cruiser and battleship score', () => {
    expect(['carrier', 'cruiser', 'battleship', 'escort', 'merchant'].map((r) => shipTargetType(r as never)))
      .toEqual(['carrier', 'cruiser', 'battleship', null, null])
  })
  it("structures: 'aaa' scores as AAA, every other kind as Building", () => {
    expect(['hangar', 'tower', 'aaa'].map((k) => structureTargetType(k as never))).toEqual(['building', 'building', 'aaa'])
  })
})
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL, because `pointsForTargetType` is not exported and `stats.js` does not resolve.

- [ ] **Step 3: Export from `debrief.ts`.** Re-diff the file against `HEAD` first. Add this directly after the `POINTS_BY_TARGET_TYPE` object:

```ts
/** The point value of one kill of type `t`. Exported (Hangar spec §5) so the
 *  library's cards read THIS table rather than a copy of it. */
export function pointsForTargetType(t: TargetType): number {
  return POINTS_BY_TARGET_TYPE[t]
}
```

Add this directly after the `TARGET_LABEL` object:

```ts
/** The debrief's row label for type `t`, exported for the same reason. */
export function targetLabel(t: TargetType): string {
  return TARGET_LABEL[t]
}
```

- [ ] **Step 4: Implement** `src/render/hangar/stats.ts`:

```ts
// src/render/hangar/stats.ts
import { pointsForTargetType, targetLabel } from '../debrief.js'
import type { TargetType } from '../../sim/weapons/targetType.js'
import type { ShipSpec } from '../../sim/world/ships.js'
import type { Building } from '../../sim/world/airfields.js'
import type { CatalogEntry } from './catalog.js'

/** One line of an info card. `value` carries its unit; `note` qualifies it. */
export interface Figure { readonly label: string; readonly value: string; readonly note?: string }

const GAMEPLAY_VALUE = 'gameplay value, not a historical figure'
const KN_PER_MPS = 3600 / 1852

const int = (n: number): string => Math.round(n).toLocaleString('en-US')
const one = (n: number): string => n.toFixed(1)

/**
 * Which score row an object's destruction lands in. MIRRORS the sim's own
 * credit rules in src/sim/weapons/combat.ts: aircraft by `spec.role`
 * (`creditAircraftDamage`); ships by role, where only carrier, cruiser and
 * battleship score (the sinking loop); structures `aaa` -> 'aaa', every other
 * kind -> 'building' (`damageStructureAt`). The Hangar spec keeps src/sim/
 * untouched, so this is a copy of those three expressions; if combat.ts
 * changes one, change it here (tests/render/hangar/stats.test.ts pins each case).
 */
export function shipTargetType(role: ShipSpec['role']): TargetType | null {
  return role === 'carrier' || role === 'cruiser' || role === 'battleship' ? role : null
}
export function structureTargetType(kind: Building['kind']): TargetType {
  return kind === 'aaa' ? 'aaa' : 'building'
}

function pointsFigure(label: string, t: TargetType | null): Figure {
  if (t === null) return { label, value: 'none', note: 'this role does not score' }
  return { label, value: `${int(pointsForTargetType(t))}`, note: `scores as ${targetLabel(t)}` }
}

/** "PLACEHOLDER, not F4F-4 data" from a source string that starts "PLACEHOLDER, not F4F-4 data: ...". */
function placeholderNote(source: string): string | undefined {
  return source.startsWith('PLACEHOLDER') ? source.split(':')[0]!.trim() : undefined
}

function withNote(f: Omit<Figure, 'note'>, note: string | undefined): Figure {
  return note === undefined ? f : { ...f, note }
}

/** The card's figures, all read from sim content (Hangar spec §5). [] for "Not yet in service". */
export function figuresFor(entry: CatalogEntry): Figure[] {
  const s = entry.subject
  if (s === null) return []
  if (s.kind === 'aircraft') {
    const a = s.spec
    // The F4F's reference block says it covers aircraft/mass/engine/rates/limits/gear/flap.
    const flight = placeholderNote(a.reference.source)
    const out: Figure[] = []
    if (a.combat) {
      out.push({ label: 'Structure', value: `${int(a.combat.structureHp)} HP`, note: GAMEPLAY_VALUE })
      out.push({ label: 'Each subsystem', value: `${int(a.combat.subsystemHp)} HP`, note: GAMEPLAY_VALUE })
    }
    out.push(withNote({ label: 'Top speed', value: `${int(a.reference.topSpeedMps * 3.6)} km/h at ${int(a.reference.topSpeedAltitudeM)} m` }, flight))
    out.push(withNote({ label: 'Stall speed, clean', value: `${int(a.reference.stallSpeedMps * 3.6)} km/h` }, flight))
    out.push(withNote({ label: 'Load limit', value: `${one(a.limits.gLimit)} g` }, flight))
    if (a.combat) {
      const rounds = a.combat.guns.reduce((sum, g) => sum + g.rounds, 0)
      out.push({ label: 'Guns', value: `${a.combat.guns.length}, ${int(rounds)} rounds` })
    }
    if (a.stores) out.push({ label: 'Stores', value: `${a.stores.racks.length} bomb racks, ${a.stores.rails.length} rocket rails` })
    out.push(pointsFigure('Points when shot down', a.role))
    return out
  }
  if (s.kind === 'ship') {
    const sh = s.spec
    return [
      { label: 'Hull', value: `${int(sh.hullHp)} HP`, note: GAMEPLAY_VALUE },
      { label: 'Length', value: `${one(sh.lengthM)} m` },
      { label: 'Beam', value: `${one(sh.beamM)} m` },
      { label: 'Top speed', value: `${one(sh.maxSpeedMps * KN_PER_MPS)} kn (${one(sh.maxSpeedMps)} m/s)` },
      pointsFigure('Points when sunk', shipTargetType(sh.role)),
    ]
  }
  const hps = s.placements.map((p) => p.building.hp)
  const lo = Math.min(...hps), hi = Math.max(...hps)
  const counts = new Map<string, number>()
  for (const p of s.placements) counts.set(p.airfield.name, (counts.get(p.airfield.name) ?? 0) + 1)
  return [
    { label: 'Hit points', value: lo === hi ? `${int(lo)} HP` : `${int(lo)}–${int(hi)} HP`, note: GAMEPLAY_VALUE },
    { label: 'Where', value: [...counts].map(([name, n]) => `${name} ×${n}`).join(', ') },
    pointsFigure('Points when destroyed', structureTargetType(s.buildingKind)),
  ]
}
```

- [ ] **Step 5: Run them to see them pass.** Expected: PASS, 7 stats tests and 8 points tests. The building-range test is Review Focus 2.

- [ ] **Step 6: Verify and commit.**

```bash
git diff HEAD --stat -- src/render/debrief.ts   # exports only
npm run verify; rc=$?; echo "rc=$rc"
git add src/render/debrief.ts src/render/hangar/stats.ts tests/render/hangar/stats.test.ts tests/render/hangar/points.test.ts
git commit -m "Hangar: card figures read from sim content; points from the debrief's own table (H1 Task 5)"
```

---

### Task 6: `hangar.html`, the Rollup input, the page's content, and the dist assertions

**Files:**
- Create: `hangar.html`, `src/render/hangar/contentIndex.ts`, and a first `src/render/hangar/main.ts`, which Task 9 replaces
- Modify: `vite.config.ts` (the `build` block only), `tests/build/dist.test.ts`

**Interfaces:**
- Produces: `loadHangarContent(): HangarContent`. It is the page-side twin of `nodeHangarContent`, and parses through the game's own schemas.

- [ ] **Step 1: Write the failing dist assertions.** In `tests/build/dist.test.ts`, inside the first test, after the Wildcat byte-count line, add:

```ts
      // Hangar spec §3: the library page, and one file per library entry.
      // `copyContent` copies content/library/ like any other content; the
      // page itself bundles the same files (contentIndex.ts), so this pins
      // what a reader of dist/ can audit, not what the page fetches.
      expect(existsSync(join(outDir, 'hangar.html')), 'dist/hangar.html').toBe(true)
      const libraryFiles = readdirSync('content/library').filter((f) => f.endsWith('.json')).sort()
      expect(readdirSync(join(outDir, 'content/library')).filter((f) => f.endsWith('.json')).sort()).toEqual(libraryFiles)
```

- [ ] **Step 2: Create the page.** `hangar.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>ww2airsim · Library</title>
    <link rel="icon" href="data:," />
    <style>
      html, body { margin: 0; height: 100%; background: #0b0d10; overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/render/hangar/main.ts"></script>
  </body>
</html>
```

`src/render/hangar/contentIndex.ts`:

```ts
// src/render/hangar/contentIndex.ts
import { parseAircraftSpec } from '../../sim/content.js'
import { parseShipSpec } from '../../sim/world/ships.js'
import { parseAirfield } from '../../sim/world/airfields.js'
import { parseLibraryEntry } from './library.js'
import type { HangarContent } from './catalog.js'

/**
 * The page's content, bundled at build time by Vite's glob import rather
 * than fetched: a browser cannot list `content/library/`, and every file is
 * a few kilobytes of JSON. Parsed through the same Zod schemas the game uses,
 * so a malformed file fails here, loudly (main.ts shows the bad-content
 * screen). Node tests never import this module (import.meta.glob is Vite's);
 * they build `HangarContent` with tools/content/load.ts instead.
 */
const library = import.meta.glob('/content/library/*.json', { eager: true, import: 'default' })
const aircraft = import.meta.glob('/content/aircraft/*.json', { eager: true, import: 'default' })
const ships = import.meta.glob('/content/ships/*.json', { eager: true, import: 'default' })
const bases = import.meta.glob('/content/bases/*.json', { eager: true, import: 'default' })

function parseAll<T>(files: Record<string, unknown>, parse: (raw: unknown) => T): T[] {
  return Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([path, raw]) => {
    try {
      return parse(raw)
    } catch (e) {
      throw new Error(`${path}: ${e instanceof Error ? e.message : String(e)}`)
    }
  })
}

export function loadHangarContent(): HangarContent {
  return {
    library: parseAll(library, parseLibraryEntry),
    aircraft: parseAll(aircraft, parseAircraftSpec),
    ships: parseAll(ships, parseShipSpec),
    airfields: parseAll(bases, parseAirfield),
  }
}
```

A first `src/render/hangar/main.ts`. It parses the content and shows the bad-content screen on any failure, and it grows into the real page in Task 9:

```ts
import { showFailure } from '../failure.js'
import { buildCatalog } from './catalog.js'
import { loadHangarContent } from './contentIndex.js'

const root = document.getElementById('app')!
try {
  const catalog = buildCatalog(loadHangarContent())
  root.textContent = `${catalog.length} library entries`
} catch (e) {
  showFailure(root, 'bad-content', e instanceof Error ? e.message : String(e))
}
```

In `vite.config.ts`, add `import { fileURLToPath } from 'node:url'` beside the `node:path` import, and replace `build: { target: 'esnext' },` with:

```ts
  build: {
    target: 'esnext',
    // Two pages: the game, and the object library (Hangar spec §3). A
    // second page is a second Rollup input; each bundles only what it imports.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        hangar: fileURLToPath(new URL('./hangar.html', import.meta.url)),
      },
    },
  },
```

- [ ] **Step 3: Look at a real build once, inside the worktree, and then delete it.**

```bash
npx vite build --outDir .superpowers/h1-dist --emptyOutDir --logLevel warn
ls .superpowers/h1-dist/hangar.html && ls .superpowers/h1-dist/content/library | wc -l && grep -l "Fletcher-class destroyer" .superpowers/h1-dist/assets/hangar-*.js
rm -rf .superpowers/h1-dist
```

Expected: `hangar.html` exists, the count equals `ls content/library | wc -l`, and the hangar bundle is named by the grep. Measured on the prototype: 4.1 s and 537 MB peak.

- [ ] **Step 4: Verify and commit.** `verify` runs the dist test.

```bash
npm run verify; rc=$?; echo "rc=$rc"
git add hangar.html src/render/hangar/contentIndex.ts src/render/hangar/main.ts vite.config.ts tests/build/dist.test.ts
git commit -m "Hangar: hangar.html as a second Vite input; the page's content, and the dist assertions (H1 Task 6)"
```

---

### Task 7: The stage: renderer, lighting, turntable, grid, water and pad

**Files:**
- Create: `src/render/hangar/framing.ts`, `src/render/hangar/stage.ts`
- Test: `tests/render/hangar/framing.test.ts`

**Interfaces:**
- Produces:
  - `type CameraPreset = 'side' | 'front' | 'top' | 'three-quarter'`, `CAMERA_PRESETS`, `framingDistance(radius, vfovDeg, aspect, fill?)` and `presetDirection(preset)`
  - `HANGAR_SUN_ELEVATION_DEG` and `createStage(renderer, canvas): HangarStage`, where `HangarStage` is `{ show(model, kind), setPreset, freeze, setModelVisible, modelSize, render, resize }`

- [ ] **Step 1: Write the failing test**, `tests/render/hangar/framing.test.ts`:

```ts
// tests/render/hangar/framing.test.ts
import { describe, expect, it } from 'vitest'
import { CAMERA_PRESETS, framingDistance, presetDirection } from '../../../src/render/hangar/framing.js'

describe('framing', () => {
  it('a sphere at the framing distance subtends the fill fraction of the narrower half-angle', () => {
    const d = framingDistance(10, 35, 16 / 9, 0.8)
    expect(Math.asin(10 / d)).toBeCloseTo(0.8 * (35 * Math.PI) / 360, 10)
    // Portrait: the horizontal half-angle is narrower, so the camera backs off.
    expect(framingDistance(10, 35, 0.5)).toBeGreaterThan(d)
  })
  it('every preset is a unit vector; side looks at the right (+Z), front at the nose (+X)', () => {
    for (const p of CAMERA_PRESETS) expect(Math.hypot(...presetDirection(p))).toBeCloseTo(1, 12)
    expect(presetDirection('side')).toEqual([0, 0, 1])
    expect(presetDirection('front')).toEqual([1, 0, 0])
  })
})
```

- [ ] **Step 2: Run it to see it fail, then implement** `src/render/hangar/framing.ts`:

```ts
// src/render/hangar/framing.ts
/** Turntable framing, pure so it is a test (Hangar spec §6). */
export type CameraPreset = 'side' | 'front' | 'top' | 'three-quarter'
export const CAMERA_PRESETS: readonly CameraPreset[] = ['side', 'front', 'top', 'three-quarter']

/** Distance at which a sphere of `radius` fills `fill` of the smaller of the
 *  view's two angular extents. */
export function framingDistance(radius: number, vfovDeg: number, aspect: number, fill = 0.8): number {
  const halfV = (vfovDeg * Math.PI) / 360
  const halfH = Math.atan(Math.tan(halfV) * aspect)
  const half = Math.min(halfV, halfH)
  return radius / Math.sin(half * fill)
}

/** Unit direction from the target toward the camera, in the model frame
 *  (+X nose or bow, +Y up, +Z right). 'side' looks at the right side. */
export function presetDirection(p: CameraPreset): [number, number, number] {
  const n = (x: number, y: number, z: number): [number, number, number] => {
    const l = Math.hypot(x, y, z)
    return [x / l, y / l, z / l]
  }
  switch (p) {
    case 'side': return [0, 0, 1]
    case 'front': return [1, 0, 0]
    case 'top': return n(0, 1, 0.0001) // a hair off vertical so OrbitControls keeps an up vector
    case 'three-quarter': return n(1, 0.5, 1)
  }
}
```

- [ ] **Step 3: Implement** `src/render/hangar/stage.ts`. It uses:
  - the shared `createLighting` and `applySun`, at `SUN_DIRECTION`
  - `atmospherePalette` at eye altitude 0
  - `exposureFor` through the game's own `createFramePipeline`, so a model is lit and tone-mapped exactly as it is in flight (§6)
  - a meter grid, with 10 m major lines
  - water for ships and a pad for everything else

WebGPU cannot be exercised in Node, so Task 10's Tier 2 is this module's test.

```ts
// src/render/hangar/stage.ts
import { Box3, Color, GridHelper, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, Sphere, Vector3, type Object3D } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { applySun, createLighting, SUN_DIRECTION } from '../scene/lighting.js'
import { atmospherePalette, warmIrradianceTable } from '../sky/palette.js'
import { exposureFor } from '../exposure.js'
import { createFramePipeline } from '../pipeline.js'
import { disposeMeshTree } from '../models/dispose.js'
import type { LibraryKind } from './library.js'
import { framingDistance, presetDirection, type CameraPreset } from './framing.js'

/** The fixed midday sun the hangar lights every model with (Hangar spec §6):
 *  the game's default SUN_DIRECTION, and the elevation that direction implies. */
export const HANGAR_SUN_ELEVATION_DEG =
  (Math.atan2(SUN_DIRECTION.y, Math.hypot(SUN_DIRECTION.x, SUN_DIRECTION.z)) * 180) / Math.PI

const VFOV_DEG = 35
const AUTO_ROTATE_SPEED = 0.6

export interface HangarStage {
  /** Replaces what stands on the stage. `kind` picks the ground: water for ships, a pad otherwise. */
  show(model: Object3D | null, kind: LibraryKind | null): void
  setPreset(p: CameraPreset): void
  /** Stops the turntable and makes the frame repeatable (Tier 2). */
  freeze(): void
  setModelVisible(visible: boolean): void
  /** The standing model's bounding-box size, meters (x length, y height, z span). */
  modelSize(): { x: number; y: number; z: number } | null
  render(): void
  resize(width: number, height: number): void
}

export function createStage(renderer: WebGPURenderer, canvas: HTMLCanvasElement): HangarStage {
  const scene = new Scene()
  scene.background = new Color(0x2a2f36)
  warmIrradianceTable()
  const lights = createLighting()
  applySun(lights, atmospherePalette(0, HANGAR_SUN_ELEVATION_DEG), {
    x: SUN_DIRECTION.x, y: SUN_DIRECTION.y, z: SUN_DIRECTION.z,
  }, HANGAR_SUN_ELEVATION_DEG)
  scene.add(lights)

  const camera = new PerspectiveCamera(VFOV_DEG, canvas.clientWidth / Math.max(1, canvas.clientHeight), 0.1, 20_000)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.autoRotate = true
  controls.autoRotateSpeed = AUTO_ROTATE_SPEED
  // The turntable turns until the user takes hold of it.
  controls.addEventListener('start', () => { controls.autoRotate = false })

  const pipeline = createFramePipeline(renderer, scene, camera)
  pipeline.setExposure(exposureFor(HANGAR_SUN_ELEVATION_DEG))

  const ground = new Group()
  ground.name = 'hangar ground'
  scene.add(ground)
  const holder = new Group()
  holder.name = 'hangar model'
  scene.add(holder)
  let current: Object3D | null = null
  let radius = 10
  let preset: CameraPreset = 'three-quarter'

  const frame = (): void => {
    const d = framingDistance(radius, VFOV_DEG, camera.aspect)
    const [x, y, z] = presetDirection(preset)
    const target = controls.target
    camera.position.set(target.x + x * d, target.y + y * d, target.z + z * d)
    camera.near = Math.max(0.05, d / 1000)
    camera.far = d * 20
    camera.updateProjectionMatrix()
    controls.update()
  }

  const rebuildGround = (kind: LibraryKind | null, extent: number): void => {
    disposeMeshTree(ground)
    ground.clear()
    // Meter grid, 10 m major lines: a model at the wrong scale shows at a glance.
    const size = Math.max(20, Math.ceil((extent * 1.5) / 10) * 10)
    const grid = new GridHelper(size, size, 0xd8d2c0, 0x5a5f66)
    grid.position.y = 0.01
    const major = new GridHelper(size, size / 10, 0xf2e9d0, 0xf2e9d0)
    major.position.y = 0.02
    const plane = new Mesh(
      new PlaneGeometry(size * 4, size * 4).rotateX(-Math.PI / 2),
      new MeshStandardMaterial({ color: kind === 'ship' ? 0x1d3f57 : 0x8a8a84, roughness: 0.9 }),
    )
    ground.add(plane, grid, major)
  }

  return {
    show(model, kind): void {
      if (current) holder.remove(current)
      current = model
      if (model === null) {
        rebuildGround(null, 20)
        return
      }
      holder.add(model)
      const box = new Box3().setFromObject(model)
      const sphere = box.getBoundingSphere(new Sphere())
      radius = Math.max(1, sphere.radius)
      controls.target.copy(sphere.center)
      rebuildGround(kind, Math.max(box.max.x - box.min.x, box.max.z - box.min.z))
      frame()
    },
    setPreset(p): void {
      preset = p
      frame()
    },
    freeze(): void {
      controls.autoRotate = false
      controls.enableDamping = false
      controls.enabled = false
      pipeline.setAntiAliasing('smaa')
    },
    setModelVisible(visible): void { holder.visible = visible },
    modelSize() {
      if (!current) return null
      const s = new Box3().setFromObject(current).getSize(new Vector3())
      return { x: s.x, y: s.y, z: s.z }
    },
    render(): void {
      controls.update()
      pipeline.render()
    },
    resize(width, height): void {
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(1, height)
      camera.updateProjectionMatrix()
    },
  }
}
```

- [ ] **Step 4: Run the test, typecheck, verify and commit.**

```bash
npx vitest run tests/render/hangar/framing.test.ts --maxWorkers=2
npm run verify; rc=$?; echo "rc=$rc"
git add src/render/hangar/framing.ts src/render/hangar/stage.ts tests/render/hangar/framing.test.ts
git commit -m "Hangar: turntable stage with the game's lighting, exposure and frame pipeline (H1 Task 7)"
```

---

### Task 8: The model adapter, and a minimal bench

**Files:**
- Create: `src/render/hangar/models.ts`, `src/render/hangar/bench.ts`
- Test: `tests/render/hangar/models.test.ts`

**Interfaces:**
- Consumes: Z1's `LoadAirframe`, `loadRegisteredAirframe`, `Airframe` (`parts`, `update`, `dispose`) and `disposeMeshTree`, plus `createShipMesh`, `drawBuilding`, `makeCollector`, `batched`, `createBuildingMaterials` and `createTerrainField`.
- Produces:
  - `PartSpec { id: 'gear' | 'flaps' | 'prop'; label; kind: 'fraction' | 'rate'; range; modeled }` and `PartPose { gearFraction?; flapFraction?; throttle? }`
  - `HangarModel { root; parts; pose; update(frameS); counts(); dispose() }`
  - `partSpecsFor(parts)`, `sceneCounts(root)`, `flatField()`, `loadHangarModel(entry, loadAirframe?)` and `mountBench(slot, parts, onPose)`

  H2 swaps ships to Lane C's loader in this file and nowhere else.

- [ ] **Step 1: Write the failing test**, `tests/render/hangar/models.test.ts`:

```ts
// tests/render/hangar/models.test.ts
import { describe, expect, it, vi } from 'vitest'
import { buildCatalog } from '../../../src/render/hangar/catalog.js'
import { flatField, loadHangarModel, partSpecsFor } from '../../../src/render/hangar/models.js'
import { createHellcat } from '../../../src/render/scene/hellcat.js'
import { heightAt } from '../../../src/sim/world/terrain.js'
import { nodeHangarContent } from './content.js'

const catalog = buildCatalog(nodeHangarContent())
const byId = (id: string) => catalog.find((e) => e.library.id === id)!

describe('partSpecsFor', () => {
  it("reports every bench part, modeled only where the airframe's parts say so", () => {
    const rows = partSpecsFor(['prop', 'gear', 'stores'])
    expect(rows.map((r) => [r.id, r.modeled])).toEqual([['gear', true], ['flaps', false], ['prop', true]])
  })
})

describe('loadHangarModel (Node, with a stub airframe)', () => {
  it("an aircraft loads by its spec's view.model, stands at its gear height, and drives update", async () => {
    const hellcat = createHellcat()
    const update = vi.spyOn(hellcat, 'update')
    const asked: string[] = []
    const entry = byId('f6f-hellcat')
    const m = await loadHangarModel(entry, async (id) => { asked.push(id); return hellcat })
    expect(asked).toEqual(['wildcat'])
    expect(m!.root.position.y).toBe(entry.subject?.kind === 'aircraft' ? entry.subject.spec.gear.heightM : NaN)
    m!.pose({ throttle: 1 })
    m!.update(0.1)
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ throttle: 1, frameS: 0.1, gearFraction: 1 }))
    expect(m!.parts.find((p) => p.id === 'gear')!.modeled).toBe(false)
  })

  it('a ship and a building load with no articulated parts and a non-zero triangle count', async () => {
    for (const id of ['essex-cv', 'hangar']) {
      const m = await loadHangarModel(byId(id))
      expect(m!.parts, id).toEqual([])
      expect(m!.counts().triangles, id).toBeGreaterThan(0)
      m!.dispose()
    }
  })

  it('"Not yet in service" loads nothing', async () => {
    expect(await loadHangarModel(catalog.find((e) => e.subject === null)!)).toBeNull()
  })

  it('the flat field is height 0 everywhere', () => {
    const f = flatField()
    expect([heightAt(f, 0, 0), heightAt(f, 123.4, -56.7), heightAt(f, 5e5, 0)]).toEqual([0, 0, 0])
  })
})
```

- [ ] **Step 2: Run it to see it fail, then implement** `src/render/hangar/models.ts`:

```ts
// src/render/hangar/models.ts
import { Group, Mesh, type Object3D } from 'three'
import type { Airframe, PartId } from '../scene/airframe.js'
import { loadRegisteredAirframe, type LoadAirframe } from '../scenarioEntities.js'
import { createShipMesh } from '../scene/ship.js'
import { batched, createBuildingMaterials, drawBuilding, makeCollector } from '../scene/buildings.js'
import { disposeMeshTree } from '../models/dispose.js'
import { createTerrainField, type TerrainField } from '../../sim/world/terrain.js'
import type { CatalogEntry } from './catalog.js'

/** What a bench row can drive (Hangar spec §8). H1 exposes gear, flaps and
 *  the propeller; H2 adds stores and Cycle, H3 turrets. */
export interface PartSpec {
  readonly id: 'gear' | 'flaps' | 'prop'
  readonly label: string
  readonly kind: 'fraction' | 'rate'
  readonly range: readonly [number, number]
  /** false = the model has no such geometry: the row reads "not modeled". */
  readonly modeled: boolean
}

export interface PartPose {
  readonly gearFraction?: number
  readonly flapFraction?: number
  readonly throttle?: number
}

export interface HangarModel {
  readonly root: Object3D
  readonly parts: readonly PartSpec[]
  pose(p: PartPose): void
  /** Advances the model's own clock (propeller) by `frameS`. */
  update(frameS: number): void
  counts(): { readonly triangles: number; readonly drawCalls: number }
  dispose(): void
}

const BENCH_PARTS: readonly Omit<PartSpec, 'modeled'>[] = [
  { id: 'gear', label: 'Landing gear', kind: 'fraction', range: [0, 1] },
  { id: 'flaps', label: 'Flaps', kind: 'fraction', range: [0, 1] },
  { id: 'prop', label: 'Throttle (propeller)', kind: 'rate', range: [0, 1] },
]

/** One row per bench part, `modeled` read off the airframe's own `parts`
 *  (Z1's `Airframe.parts`), so a missing part is reported, never hidden. */
export function partSpecsFor(parts: readonly PartId[]): PartSpec[] {
  return BENCH_PARTS.map((p) => ({ ...p, modeled: parts.includes(p.id) }))
}

/** Triangles and draw calls three.js issues for `root`: one draw per Mesh (per material group). */
export function sceneCounts(root: Object3D): { triangles: number; drawCalls: number } {
  let triangles = 0, drawCalls = 0
  root.traverse((o) => {
    if (!(o instanceof Mesh) || !o.visible) return
    const g = o.geometry
    const count = g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)
    triangles += Math.floor(count / 3)
    drawCalls += Math.max(1, g.groups.length)
  })
  return { triangles, drawCalls }
}

/** Height 0 everywhere, for `drawBuilding` on the hangar's flat pad (§6). */
export function flatField(): TerrainField {
  return createTerrainField(
    { centreLatDeg: 0, centreLonDeg: 0, halfExtentM: 100_000, finestSamples: 3, levels: 1, encoding: 'int16-decimetres' },
    0, new Int16Array(9),
  )
}

function staticModel(root: Object3D): HangarModel {
  return {
    root,
    parts: [],
    pose(): void {},
    update(): void {},
    counts: () => sceneCounts(root),
    dispose: () => disposeMeshTree(root),
  }
}

function aircraftModel(airframe: Airframe, gearHeightM: number): HangarModel {
  // The airframe's origin is its CG on the thrust line; the stand lifts it
  // by the spec's own gear height so the wheels meet the y = 0 grid. A model
  // whose wheels do not meet the grid is a finding, which is the point.
  const stand = new Group()
  stand.name = 'aircraft stand'
  stand.position.y = gearHeightM
  stand.add(airframe.root)
  let gearFraction = 1, flapFraction = 0, throttle = 0
  return {
    root: stand,
    parts: partSpecsFor(airframe.parts),
    pose(p): void {
      if (p.gearFraction !== undefined) gearFraction = p.gearFraction
      if (p.flapFraction !== undefined) flapFraction = p.flapFraction
      if (p.throttle !== undefined) throttle = p.throttle
    },
    update(frameS): void {
      airframe.update({ gearFraction, flapFraction, throttle, controls: { roll: 0, pitch: 0, yaw: 0 }, frameS, cameraDistanceM: 0 })
    },
    counts: () => sceneCounts(stand),
    dispose: () => airframe.dispose(),
  }
}

/**
 * The ONLY module that knows where geometry comes from (Hangar spec §7).
 * Aircraft load through Z1's registry, by `spec.view.model`, exactly as the
 * game does; ships through `createShipMesh`; buildings through
 * `drawBuilding` on a flat field. H2 swaps ships to Lane C's loader here and
 * nowhere else. null = "Not yet in service".
 */
export async function loadHangarModel(entry: CatalogEntry, loadAirframe: LoadAirframe = loadRegisteredAirframe): Promise<HangarModel | null> {
  const s = entry.subject
  if (s === null) return null
  if (s.kind === 'aircraft') {
    const airframe = await loadAirframe(s.spec.view.model)
    const model = aircraftModel(airframe, s.spec.gear.heightM)
    model.update(0)
    return model
  }
  if (s.kind === 'ship') return staticModel(createShipMesh(s.spec).root)
  // The largest footprint of this kind stands for all of them.
  const b = [...s.placements].sort((x, y) => y.building.widthM * y.building.lengthM - x.building.widthM * x.building.lengthM)[0]!.building
  const collector = makeCollector()
  drawBuilding(collector, { kind: b.kind, x: 0, z: 0, width: b.widthM, length: b.lengthM }, flatField(), createBuildingMaterials())
  return staticModel(batched(new Group(), collector.batches))
}
```

and `src/render/hangar/bench.ts`:

```ts
// src/render/hangar/bench.ts
import type { PartPose, PartSpec } from './models.js'

/**
 * The articulation bench, behind `benchEnabled` (Hangar spec §8). H1 drives
 * the landing gear and the propeller; a part the model does not have reads
 * "not modeled", greyed, rather than offering a slider that moves nothing.
 * H2 adds stores, Cycle, gizmos, wireframe and the budget readout.
 */
export function mountBench(slot: HTMLElement, parts: readonly PartSpec[], onPose: (p: PartPose) => void): void {
  slot.replaceChildren()
  if (parts.length === 0) return
  const title = document.createElement('div')
  title.className = 'form-section-title'
  title.textContent = 'Test bench'
  slot.appendChild(title)
  for (const part of parts) {
    const row = document.createElement('label')
    row.style.cssText = 'display:flex;gap:8px;align-items:center;margin:4px 0'
    const name = document.createElement('span')
    name.textContent = part.label
    name.style.minWidth = '150px'
    row.appendChild(name)
    if (!part.modeled) {
      row.style.opacity = '.45'
      const note = document.createElement('span')
      note.textContent = 'not modeled'
      row.appendChild(note)
    } else {
      const input = document.createElement('input')
      input.type = 'range'
      input.min = String(part.range[0])
      input.max = String(part.range[1])
      input.step = '0.01'
      input.value = part.id === 'gear' ? '1' : '0'
      input.setAttribute('aria-label', part.label)
      input.addEventListener('input', () => {
        const v = Number(input.value)
        onPose(part.id === 'gear' ? { gearFraction: v } : part.id === 'flaps' ? { flapFraction: v } : { throttle: v })
      })
      row.appendChild(input)
    }
    slot.appendChild(row)
  }
}
```

- [ ] **Step 3: Run it to see it pass.** Expected: PASS, 5 tests. The first `partSpecsFor` case is Review Focus 3.

- [ ] **Step 4: Verify and commit.**

```bash
npm run verify; rc=$?; echo "rc=$rc"
git add src/render/hangar/models.ts src/render/hangar/bench.ts tests/render/hangar/models.test.ts
git commit -m "Hangar: one model adapter (aircraft via the airframe registry, ships, buildings) and a gear/prop bench (H1 Task 8)"
```

---

### Task 9: The panel, the bench flag, the hooks, the page, and the title's Library button

**Files:**
- Create: `src/render/hangar/panel.ts`, `benchFlag.ts`, `hooks.ts`
- Replace: `src/render/hangar/main.ts`
- Modify: `src/render/titleScreen.ts` (one button), `tests/render/titleScreen.test.ts`
- Test: `tests/render/hangar/benchFlag.test.ts`

**Interfaces:**
- Produces:
  - `benchEnabled(dev, search)`
  - `createPanel(root, catalog, onSelect): HangarPanel` (`{ showCard, benchSlot }`)
  - `HangarHooks` and `installHangarHooks`, with `window.__hangar = { ready, entries, select, pose, tick, camera, freeze, setModelVisible, current, validationErrors }`
  - `TitleModel.library` and `libraryHref`

- [ ] **Step 1: Write the failing tests.** Create `tests/render/hangar/benchFlag.test.ts`:

```ts
// tests/render/hangar/benchFlag.test.ts
import { describe, expect, it } from 'vitest'
import { benchEnabled } from '../../../src/render/hangar/benchFlag.js'

describe('benchEnabled (Hangar spec §3): the one switch v1.0 flips', () => {
  it.each([
    [true, '', true],
    [true, '?bench', true],
    [false, '', false],
    [false, '?bench', true],
    [false, '?bench=1', true],
    [false, '?benchmark=1', false],
  ])('dev=%s search=%j -> %s', (dev, search, expected) => {
    expect(benchEnabled(dev, search)).toBe(expected)
  })
})
```

In `tests/render/titleScreen.test.ts`, directly before `'names the Settings button, reachable at every step of the screen'`, add:

```ts
  it('names the Library button and links it to hangar.html under the base URL (Hangar spec §3)', () => {
    const m = titleModel()
    expect(m.library).toBe('Library')
    expect(m.libraryHref).toBe(`${import.meta.env.BASE_URL}hangar.html`)
  })
```

Run: `npx vitest run tests/render/hangar/benchFlag.test.ts tests/render/titleScreen.test.ts --maxWorkers=2`
Expected: FAIL.

- [ ] **Step 2: Implement.** `src/render/hangar/benchFlag.ts`:

```ts
// src/render/hangar/benchFlag.ts
/**
 * The ONE expression that decides whether the articulation bench shows
 * (Hangar spec §3). At v1.0, deleting the query clause hides the bench in
 * production builds; tests/render/hangar/benchFlag.test.ts pins the truth
 * table so that switch is deliberate.
 */
export function benchEnabled(dev: boolean, search: string): boolean {
  return dev || new URLSearchParams(search).has('bench')
}
```

`src/render/hangar/hooks.ts`:

```ts
// src/render/hangar/hooks.ts
import type { PartPose, PartSpec } from './models.js'
import type { LibraryKind } from './library.js'
import type { CameraPreset } from './framing.js'

/**
 * `window.__hangar`, present in every build, the same policy as the game's
 * `__ww2` (Hangar spec §10). Tier 2 (tests/e2e/hangar.spec.ts) drives the
 * page only through this. `tick` and `setModelVisible` are additions to the
 * spec's list: `tick` makes "two frames 1/60 s apart" exact while frozen,
 * `setModelVisible` renders the empty frame the pixel masks subtract, and
 * `current` tells a check which parts the selected model has.
 */
export interface HangarHooks {
  readonly ready: Promise<void>
  /** Library ids that have a spec, and therefore a model. */
  entries(): string[]
  select(id: string): Promise<void>
  pose(p: PartPose): void
  /** Advances the model's own clock by exactly `frameS`; while frozen, nothing else moves it. */
  tick(frameS: number): void
  camera(preset: CameraPreset): void
  freeze(): void
  setModelVisible(visible: boolean): void
  /** The selected entry's id, kind and bench parts; null before the first select. */
  current(): { readonly id: string; readonly kind: LibraryKind; readonly parts: readonly PartSpec[] } | null
  readonly validationErrors: string[]
}

export type HangarWindow = Window & { __hangar?: HangarHooks }

export function installHangarHooks(w: HangarWindow, hooks: HangarHooks): void {
  w.__hangar = hooks
}
```

`src/render/hangar/panel.ts`:

```ts
// src/render/hangar/panel.ts
import { ensureStampFilter } from '../ui/navalComms.js'
import { filterCatalog, FILTER_KINDS, FILTER_SIDES, type CatalogEntry, type CatalogFilter } from './catalog.js'
import { historyParagraphs } from './library.js'
import type { Figure } from './stats.js'

export interface HangarPanel {
  /** Shows the info card for `entry` with its computed figures. */
  showCard(entry: CatalogEntry, figures: readonly Figure[], modelSize: { x: number; y: number; z: number } | null): void
  /** The element the bench (bench.ts) mounts into, under the card. */
  readonly benchSlot: HTMLElement
}

const KIND_LABEL: Readonly<Record<string, string>> = { all: 'All', aircraft: 'Aircraft', ship: 'Ships', building: 'Buildings' }
const SIDE_LABEL: Readonly<Record<string, string>> = { all: 'Both sides', allied: 'Allied', japanese: 'Japanese' }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

/**
 * The list, its two filters and the info card (Hangar spec §2), in the
 * Naval Communications style the title screen uses. `onSelect` is called with
 * a library id; main.ts loads the model and calls `showCard`.
 */
export function createPanel(root: HTMLElement, catalog: readonly CatalogEntry[], onSelect: (id: string) => void): HangarPanel {
  ensureStampFilter()
  const panel = el('div', 'naval-comms hangar-panel')
  panel.setAttribute('role', 'region')
  panel.setAttribute('aria-label', 'Library')
  const sheet = el('div', 'sheet')
  sheet.style.cssText = 'height:100%;box-sizing:border-box;overflow-y:auto;padding:14px 16px'
  panel.appendChild(sheet)

  const header = el('div', 'letterhead')
  header.append(el('div', 'letterhead-kicker', 'Bureau of Aeronautics'), el('div', 'letterhead-title', 'Library'))
  const back = el('a', 'ink-button', 'Back to title')
  back.href = import.meta.env.BASE_URL
  sheet.append(header, back)

  let filter: CatalogFilter = { kind: 'all', side: 'all' }
  const filters = el('div')
  filters.style.cssText = 'display:flex;gap:8px;margin:10px 0'
  const select = (options: readonly string[], labels: Readonly<Record<string, string>>, name: string, onChange: (v: string) => void) => {
    const s = el('select')
    s.setAttribute('aria-label', name)
    for (const o of options) {
      const opt = el('option', undefined, labels[o] ?? o)
      opt.value = o
      s.appendChild(opt)
    }
    s.addEventListener('change', () => onChange(s.value))
    return s
  }
  filters.append(
    select(FILTER_KINDS, KIND_LABEL, 'Kind', (v) => { filter = { ...filter, kind: v as CatalogFilter['kind'] }; renderList() }),
    select(FILTER_SIDES, SIDE_LABEL, 'Side', (v) => { filter = { ...filter, side: v as CatalogFilter['side'] }; renderList() }),
  )
  const list = el('ul')
  list.setAttribute('aria-label', 'Objects')
  list.style.cssText = 'list-style:none;margin:0;padding:0'
  const card = el('div', 'hangar-card')
  const benchSlot = el('div', 'hangar-bench')
  sheet.append(filters, list, card, benchSlot)
  root.appendChild(panel)

  function renderList(): void {
    list.replaceChildren(...filterCatalog(catalog, filter).map((e) => {
      const li = el('li')
      const b = el('button', 'ink-button', e.subject === null ? `${e.library.name} (not yet in service)` : e.library.name)
      b.dataset['id'] = e.library.id
      b.style.cssText = 'width:100%;text-align:left;margin:2px 0'
      b.addEventListener('click', () => onSelect(e.library.id))
      li.appendChild(b)
      return li
    }))
  }
  renderList()

  return {
    benchSlot,
    showCard(entry, figures, modelSize): void {
      const l = entry.library
      const rows: HTMLElement[] = [
        el('div', 'form-section-title', l.name),
        el('div', 'fine-print', `${l.side === 'allied' ? 'Allied' : 'Japanese'} ${l.kind}${entry.subject === null ? ' · Not yet in service' : ''}`),
        el('p', undefined, l.blurb),
      ]
      if (figures.length > 0) {
        const table = el('table', 'form-table')
        table.setAttribute('aria-label', 'Figures')
        for (const f of figures) {
          const tr = el('tr')
          tr.append(el('th', undefined, f.label), el('td', undefined, f.note ? `${f.value} (${f.note})` : f.value))
          table.appendChild(tr)
        }
        if (modelSize) {
          const tr = el('tr')
          tr.append(el('th', undefined, 'Model size'), el('td', undefined, `${modelSize.x.toFixed(1)} × ${modelSize.z.toFixed(1)} × ${modelSize.y.toFixed(1)} m (length × width × height)`))
          table.appendChild(tr)
        }
        rows.push(table)
      }
      for (const para of historyParagraphs(l.history)) rows.push(el('p', undefined, para))
      const sources = el('div', 'fine-print')
      for (const s of l.sources) {
        const a = el('a', undefined, s.title)
        a.href = s.url
        a.target = '_blank'
        a.rel = 'noopener'
        a.style.color = 'inherit'
        sources.append(a, ` (read ${s.read}) `)
      }
      rows.push(sources)
      card.replaceChildren(...rows)
    },
  }
}
```

Replace `src/render/hangar/main.ts` with:

```ts
// src/render/hangar/main.ts
import { initRenderer, normalizeGpuError } from '../renderer.js'
import { showFailure, type FailureKind } from '../failure.js'
import { buildCatalog, type CatalogEntry } from './catalog.js'
import { loadHangarContent } from './contentIndex.js'
import { loadHangarModel, type HangarModel, type PartPose } from './models.js'
import { figuresFor } from './stats.js'
import { createStage } from './stage.js'
import { createPanel } from './panel.js'
import { mountBench } from './bench.js'
import { benchEnabled } from './benchFlag.js'
import { installHangarHooks, type HangarWindow } from './hooks.js'

/**
 * hangar.html's entry: the object library and articulation bench (Hangar
 * spec). Never imports the game's main.ts; loads no terrain, sky, clouds or
 * sim loop.
 */
const root = document.getElementById('app')!

async function boot(): Promise<void> {
  const validationErrors: string[] = []
  let resolveReady!: () => void
  const ready = new Promise<void>((r) => { resolveReady = r })

  let catalog: CatalogEntry[]
  try {
    catalog = buildCatalog(loadHangarContent())
  } catch (e) {
    showFailure(root, 'bad-content', e instanceof Error ? e.message : String(e))
    return
  }

  root.style.cssText = 'display:grid;grid-template-columns:380px 1fr;height:100%'
  const canvas = document.createElement('canvas')
  canvas.id = 'hangar-canvas'
  canvas.style.cssText = 'width:100%;height:100%;display:block'
  const { renderer, adapterVerdict } = await initRenderer(canvas)
  if (adapterVerdict.severity === 'fail') {
    showFailure(root, 'software-adapter', adapterVerdict.summary)
    return
  }
  renderer.onError = (info) => { validationErrors.push(normalizeGpuError(info)) }

  let model: HangarModel | null = null
  let selected: CatalogEntry | null = null
  let frozen = false
  const bench = benchEnabled(import.meta.env.DEV, location.search)
  const pose = (p: PartPose): void => { model?.pose(p) }

  const select = async (id: string): Promise<void> => {
    const entry = catalog.find((e) => e.library.id === id)
    if (!entry) throw new Error(`hangar: no library entry "${id}"`)
    const next = await loadHangarModel(entry)
    model?.dispose()
    model = next
    selected = entry
    stage.show(model?.root ?? null, entry.subject === null ? null : entry.library.kind)
    panel.showCard(entry, figuresFor(entry), stage.modelSize())
    if (bench) mountBench(panel.benchSlot, model?.parts ?? [], pose)
  }

  const panel = createPanel(root, catalog, (id) => {
    select(id).catch((e: unknown) => validationErrors.push(e instanceof Error ? e.message : String(e)))
  })
  root.appendChild(canvas)
  const stage = createStage(renderer, canvas)
  const fit = (): void => stage.resize(canvas.clientWidth, canvas.clientHeight)
  window.addEventListener('resize', fit)
  fit()

  installHangarHooks(window as HangarWindow, {
    ready,
    entries: () => catalog.filter((e) => e.subject !== null).map((e) => e.library.id),
    select,
    pose,
    tick: (frameS) => model?.update(frameS),
    camera: (p) => stage.setPreset(p),
    freeze: () => { frozen = true; stage.freeze() },
    setModelVisible: (v) => stage.setModelVisible(v),
    current: () => (selected ? { id: selected.library.id, kind: selected.library.kind, parts: model?.parts ?? [] } : null),
    validationErrors,
  })

  const first = catalog.find((e) => e.subject !== null)
  if (first) await select(first.library.id)

  let last = performance.now()
  renderer.setAnimationLoop(() => {
    const now = performance.now()
    if (!frozen) model?.update((now - last) / 1000)
    last = now
    stage.render()
  })
  resolveReady()
}

void boot().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e)
  const kind: FailureKind = msg === 'no-webgpu' ? 'no-webgpu' : msg === 'no-adapter' ? 'no-adapter' : 'unknown'
  showFailure(root, kind, msg)
})
```

In `src/render/titleScreen.ts`, re-diff against `HEAD` first, then make three edits:
- Add `library: string` and `libraryHref: string` to `TitleModel`, after `about`, with the doc comment `/** Form 1's link to the object library, hangar.html (Hangar spec §3). */`.
- Add ``library: 'Library', libraryHref: `${import.meta.env.BASE_URL}hangar.html`,`` to `titleModel()`, after `about`.
- Replace `rosterSheet.appendChild(buttonRow(newGame))` with:

```ts
    // A plain link, not a mode: the library is its own page (Hangar spec §3),
    // and navigating away drops this page's state the same way a reload does.
    const library = inkButton(m.library)
    library.addEventListener('click', () => { window.location.href = m.libraryHref })
    rosterSheet.appendChild(buttonRow(library, newGame))
```

The button is in production builds (Hangar decision 3). The bench stays behind `?bench`.

- [ ] **Step 3: Run the tests to see them pass.** Expected: PASS, 6 bench-flag cases plus the title test.

- [ ] **Step 4: Verify and commit.**

```bash
git diff HEAD --stat -- src/render/titleScreen.ts   # one button, two model fields
npm run verify; rc=$?; echo "rc=$rc"
git add src/render/hangar/ src/render/titleScreen.ts tests/render/titleScreen.test.ts tests/render/hangar/benchFlag.test.ts
git commit -m "Hangar: the library page (list, filters, card, bench behind ?bench, __hangar hooks) and the title's Library button (H1 Task 9)"
```

---

### Task 10: Tier 2, GAMEPLAY.md's Library section, the handoff, §15 and README

**Files:**
- Create: `tests/e2e/hangar.spec.ts`, `docs/handoff/<today>-h1-hangar-library.md`
- Modify: `GAMEPLAY.md`, `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§15), `README.md`

- [ ] **Step 1: Write the Tier 2 spec**, `tests/e2e/hangar.spec.ts`. It covers the spec's checks 1, 2, 3 and 5; check 4 (turrets) is H3's. It also covers the title's Library button.

```ts
// tests/e2e/hangar.spec.ts
import { test, expect, type Page } from '@playwright/test'
import type { HangarWindow } from '../../src/render/hangar/hooks.js'
import type { PartPose } from '../../src/render/hangar/models.js'
import type { CameraPreset } from '../../src/render/hangar/framing.js'

/**
 * Tier 2, the Hangar (spec §10): every model "renders, articulates and is
 * lit sanely", by pixel masks against an empty frame with the camera frozen.
 * Only the canvas is captured (`#hangar-canvas`); the panel sits beside it,
 * not over it. Run on the ww2airsim-3 slot (Hangar spec §13). Nothing here is
 * a timing budget.
 */

type Frame = Buffer

async function openHangar(page: Page): Promise<void> {
  await page.goto('/hangar.html?bench')
  await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
  await page.evaluate(() => (window as HangarWindow).__hangar!.ready)
  await page.evaluate(() => (window as HangarWindow).__hangar!.freeze())
}

type Current = { readonly id: string; readonly kind: string; readonly parts: readonly { readonly id: string; readonly modeled: boolean }[] }
const entries = (page: Page) => page.evaluate(() => (window as HangarWindow).__hangar!.entries())
const select = (page: Page, id: string) => page.evaluate((i) => (window as HangarWindow).__hangar!.select(i), id)
const current = (page: Page) => page.evaluate(() => (window as HangarWindow).__hangar!.current()) as Promise<Current>
const pose = (page: Page, p: PartPose) => page.evaluate((q) => (window as HangarWindow).__hangar!.pose(q), p)
const visible = (page: Page, v: boolean) => page.evaluate((x) => (window as HangarWindow).__hangar!.setModelVisible(x), v)
const hasPart = (c: Current, id: string) => c.parts.some((p) => p.id === id && p.modeled)

/** Three animation frames, so a pose or camera change has reached the canvas. */
const settle = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))))

async function shot(page: Page): Promise<Frame> {
  await settle(page)
  return page.locator('#hangar-canvas').screenshot()
}

async function view(page: Page, id: string, preset: CameraPreset, p: PartPose = {}): Promise<{ empty: Frame; model: Frame }> {
  await select(page, id)
  await page.evaluate((c) => (window as HangarWindow).__hangar!.camera(c), preset)
  await pose(page, p)
  await visible(page, false)
  const empty = await shot(page)
  await visible(page, true)
  return { empty, model: await shot(page) }
}

/**
 * Masks of `frames` against `empty` (a pixel is in a mask when its summed
 * RGB difference exceeds 24), decoded in the browser to avoid a PNG
 * dependency (cloudShadow.spec.ts pattern). Returns each mask's area and the
 * mean linear luminance inside it, the frame's pixel count, and the number of
 * pixels in exactly one of the first two masks.
 */
async function masks(page: Page, empty: Frame, frames: Frame[]): Promise<{ areas: number[]; luminance: number[]; total: number; xor01: number }> {
  return page.evaluate(async ({ empty64, frames64 }) => {
    const decode = async (b64: string): Promise<Uint8ClampedArray> => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
      const c = document.createElement('canvas')
      c.width = bitmap.width
      c.height = bitmap.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close()
      return ctx.getImageData(0, 0, c.width, c.height).data
    }
    const lin = (v: number): number => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
    const e = await decode(empty64)
    const total = e.length / 4
    const sets: Uint8Array[] = []
    const areas: number[] = [], luminance: number[] = []
    for (const f64 of frames64) {
      const f = await decode(f64)
      const m = new Uint8Array(total)
      let area = 0, lum = 0
      for (let p = 0; p < total; p++) {
        const d = Math.abs(f[p * 4]! - e[p * 4]!) + Math.abs(f[p * 4 + 1]! - e[p * 4 + 1]!) + Math.abs(f[p * 4 + 2]! - e[p * 4 + 2]!)
        if (d > 24) {
          m[p] = 1
          area++
          lum += 0.2126 * lin(f[p * 4]!) + 0.7152 * lin(f[p * 4 + 1]!) + 0.0722 * lin(f[p * 4 + 2]!)
        }
      }
      sets.push(m)
      areas.push(area)
      luminance.push(area ? lum / area : 0)
    }
    let xor01 = 0
    if (sets.length >= 2) for (let p = 0; p < total; p++) if (sets[0]![p] !== sets[1]![p]) xor01++
    return { areas, luminance, total, xor01 }
  }, { empty64: empty.toString('base64'), frames64: frames.map((f) => f.toString('base64')) })
}

test.describe('the Hangar', () => {
  test.beforeEach(async ({ page }) => { await openHangar(page) })

  test('1. every in-service entry renders: its mask covers 2% to 80% of the frame, with no validation errors', async ({ page }) => {
    const ids = await entries(page)
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) {
      const v = await view(page, id, 'three-quarter')
      const m = await masks(page, v.empty, [v.model])
      const share = m.areas[0]! / m.total
      expect(share, `${id} mask share`).toBeGreaterThan(0.02)
      expect(share, `${id} mask share`).toBeLessThan(0.8)
    }
    expect(await page.evaluate(() => (window as HangarWindow).__hangar!.validationErrors)).toEqual([])
  })

  test('2. every modeled landing gear visibly moves between down and up (front view)', async ({ page }) => {
    for (const id of await entries(page)) {
      await select(page, id)
      if (!hasPart(await current(page), 'gear')) continue
      const down = await view(page, id, 'front', { gearFraction: 1 })
      await pose(page, { gearFraction: 0 })
      const up = await shot(page)
      const m = await masks(page, down.empty, [down.model, up])
      expect(m.xor01 / m.areas[0]!, `${id} gear-down vs gear-up`).toBeGreaterThanOrEqual(0.01)
    }
  })

  test('3. every modeled propeller turns: two frames 1/60 s apart at full throttle differ', async ({ page }) => {
    for (const id of await entries(page)) {
      await select(page, id)
      if (!hasPart(await current(page), 'prop')) continue
      const a = await view(page, id, 'front', { throttle: 1 })
      await page.evaluate(() => (window as HangarWindow).__hangar!.tick(1 / 60))
      const b = await shot(page)
      const m = await masks(page, a.empty, [a.model, b])
      expect(m.xor01, `${id} prop frames`).toBeGreaterThan(0)
    }
  })

  test("5. every aircraft is lit sanely: in-mask luminance within 0.5x to 1.5x of the Wildcat's", async ({ page }) => {
    const ref = await view(page, 'f4f-wildcat', 'three-quarter')
    const refLum = (await masks(page, ref.empty, [ref.model])).luminance[0]!
    for (const id of await entries(page)) {
      await select(page, id)
      if ((await current(page)).kind !== 'aircraft') continue
      const v = await view(page, id, 'three-quarter')
      const lum = (await masks(page, v.empty, [v.model])).luminance[0]!
      expect(lum / refLum, `${id} luminance ratio`).toBeGreaterThanOrEqual(0.5)
      expect(lum / refLum, `${id} luminance ratio`).toBeLessThanOrEqual(1.5)
    }
  })
})

test("the title's Library button opens the hangar", async ({ page }) => {
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title).toBeVisible()
  await title.getByRole('button', { name: 'Library' }).click()
  await page.waitForURL(/hangar\.html$/)
  await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
})
```

- [ ] **Step 2: Run Tier 2 on the `ww2airsim-3` slot** (Hangar spec §13). The procedure is in the repo `CLAUDE.md`, under "GPU work", and README's "Tier 2: the GPU harness" is the authority.
  1. In this worktree, set `vite.config.ts`'s `TUNNEL_HOST` to `ww2airsim-3.windomlane.org` and `server.port` to `5174`. This is local scratch and is never committed.
  2. Run:

```bash
WW2AIRSIM_TUNNEL=1 npx vite --port 5174 &
curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim-3.windomlane.org/hangar.html   # 200
ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-3.windomlane.org npx playwright test tests/e2e/hangar.spec.ts; rc=$?; echo "rc=$rc"
```

  3. Expected: `rc=0`.
  4. Stop the server and restore `vite.config.ts`. `git diff vite.config.ts` must show only Task 6's hunk.
  5. Look at `test-results/` PNGs, or take one throwaway `page.screenshot()` of the Wildcat card and one of the Essex card, and **look at them** (repo `CLAUDE.md`).
  6. If a check fails, record it red, with its numbers, in the handoff. Never loosen a threshold to make it pass.

  Also add a zero-throttle control to check 3: at `throttle: 0`, `tick(1/60)` must leave the xor at 0. This is Review Focus 4. If it is not 0, the frame is not frozen, and check 3 proves nothing.

- [ ] **Step 3: GAMEPLAY.md.** Add a `## Library` section directly before `## Aircraft roster`:

```markdown
## Library

`hangar.html` ("Library" on the title's first form) shows every aircraft,
ship and building in the rosters below: a turntable model, the gameplay
figures (hit points, speed, armament, points), read live from the game's own
content so they cannot go stale, and a short sourced history of the real
thing. A roster row with no game content yet shows as **Not yet in
service**, with its history and no model or figures; the card fills in when
its spec and model land. Stand-ins are disclosed on the card.

The rosters below are checked against `content/library/` by a test: a row
added here without a library file fails the suite. Design:
[hangar spec](docs/superpowers/specs/2026-09-25-hangar-library-design.md).
```

- [ ] **Step 4: Write the handoff**, `docs/handoff/<today>-h1-hangar-library.md`. Include:
  1. The Tier 2 results, with their numbers.
  2. The answers to Open questions 1 and 2, if Mark has given them. If not, say that the defaults stand.
  3. What H2 inherits:
     - flaps and stores controls, and Cycle
     - gizmos, wireframe, and counts against the manifest budget
     - ships through Lane C's loader
     - `docs/models.md` and the pointer to it in `CLAUDE.md`

     Also say that the aircraft path already uses Z1's registry.
  4. The traps:
     - The `stats.ts` target-type mirror must follow `combat.ts`.
     - `import.meta.glob` bundles the content into the page.
     - `freeze()` switches to SMAA.
  5. Where this plan departed from the spec. Point at this plan's section; do not restate it.

- [ ] **Step 5: §15 and README.** Add a row after the A6M Zero row:

`| Hangar (H1-H3) | any | Object library and articulation test bench: hangar.html | §8, §9 | H1 complete YYYY-MM-DD with Tier 1 and reference-GPU Tier 2 ([design](2026-09-25-hangar-library-design.md), [plan](../plans/2026-09-25-h1-hangar-library.md), [handoff](../../handoff/YYYY-MM-DD-h1-hangar-library.md)): 32-entry library checked against GAMEPLAY.md's rosters, live figures, turntable, gear/prop bench behind ?bench. H2 (full bench) and H3 (turrets) open |`

In README, add one paragraph pointing at the Library section in GAMEPLAY.md and at master spec §15. Do not restate the order.

- [ ] **Step 6: Verify and commit.**

```bash
npm run verify; rc=$?; echo "rc=$rc"
git add tests/e2e/hangar.spec.ts GAMEPLAY.md docs/handoff/ docs/superpowers/specs/2026-09-12-ww2airsim-design.md README.md
git commit -m "Hangar H1: Tier 2 masks, GAMEPLAY.md Library section, handoff, §15 row and README pointer"
```

---

## Self-review against the spec (done while writing)

| Spec §12 H1 item | Task |
| --- | --- |
| 1. `LibraryEntrySchema`, loader, coverage tests (§4.4) | 1, 2, 3 |
| 2. Library files for every shipped spec: 2 aircraft, 3 ships, 3 building kinds | 2 |
| 3. Every remaining roster row, "Not yet in service"; §4.4 green | 3 |
| 4. `pointsForTargetType` from `debrief.ts`; `stats.ts` with tests | 5 |
| 5. `catalog.ts` | 4 |
| 6. `hangar.html`, the Vite input, `dist.test.ts` | 6 |
| 7. `stage.ts`: renderer, lighting, turntable, grid, water, pad | 7 |
| 8. `models.ts`, and a minimal bench driving gear and prop | 8 |
| 9. `panel.ts`, the title button, the bench flag | 9 |
| 10. `hooks.ts`, Tier 2 checks 1 to 3 and 5, the GAMEPLAY.md section, handoff | 9 (hooks), 10 |
| §3 bench-flag truth table; §4.2 blurb rule; §5 PLACEHOLDER note from `f4f-wildcat.json`'s own text; points agreement | 9, 1, 5, 5 |
| Hangar decision 3: Library button in production | 9 |
