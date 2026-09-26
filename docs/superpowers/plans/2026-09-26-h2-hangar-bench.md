# H2: the Hangar's full articulation bench — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Hangar bench (spec §8): stores toggles, a Cycle button for gear and flaps that runs the spec's own transit, pivot gizmos, wireframe, a turntable toggle, and a triangle/draw-call readout against each model's manifest budget; then the model-ingest runbook `docs/models.md`.

**Architecture:** Three pure modules carry the logic so Node can test it: `benchController.ts` (bench state, Cycle through the sim's own `gearAfter`/`flapAfter`), `budgets.ts` (manifest budgets and the counts report) and helpers in `models.ts`/`stage.ts` (the articulated-node probe, wireframe, gizmo sync). `bench.ts` renders DOM from them; `main.ts` wires them; `hooks.ts` exposes them to Tier 2.

**Tech Stack:** TypeScript, three.js (WebGPU renderer, `AxesHelper`), Zod, Vite `import.meta.glob`, Vitest (Node, no DOM), Playwright Tier 2 on the Windows desktop's RX 6700 XT.

**Spec:** `docs/superpowers/specs/2026-09-25-hangar-library-design.md` (§7, §8, §10, §11, §12 "H2"). Read it first.

## Where H2 starts (measured on `main` at `3a74e37`, 2026-09-26)

The spec's H2 list has six items. Two are already done and are NOT tasks here:

- **H2 item 1** (`models.ts` on `airframes.ts` and `Airframe.parts`): done in H1. `src/render/hangar/models.ts` loads aircraft through `loadRegisteredAirframe(spec.view.model)` and builds bench rows from `airframe.parts` (`partSpecsFor`).
- **H2 item 4** (ships through Lane C's loader): done in S1. `main.ts` passes `makeShipViewLoader(...)` to `loadHangarModel`.

What exists: `bench.ts` renders one slider per part (gear, flaps, prop) with "not modeled" rows; `stage.ts` has `freeze()` for Tier 2 only; `HangarModel.counts()` returns scene totals and nothing reads it; `hangar.spec.ts` has checks 1–3 and 5.

Facts the tasks depend on (all read from the code, 2026-09-26):

- `Airframe` (`src/render/scene/airframe.ts`): `parts: readonly PartId[]` with `PartId = 'prop' | 'gear' | 'flaps' | 'stores'`; `setStores(bombsLeft, rocketsLeft)`; `update(AirframeUpdate)`.
- The Wildcat's `parts` are `['prop', 'gear', 'stores']` (no flap geometry). Its articulated nodes are `Helice`, `GRP_Rueda_Der` and `GRP_Rueda_Izq` (`wildcat.ts`). The Hellcat stub (`createHellcat()`) has `['prop', 'stores']`.
- Stores are `attachStores` meshes named after `RACK_OFFSETS` / `RAIL_OFFSETS` ids (`src/render/scene/stores.ts`, both exported), all visible when built.
- Gear and flap transits: `gearAfter(spec, fraction, gearDown, dt)` in `src/sim/ground.ts` and `flapAfter(spec, fraction, flapDown, dt)` in `src/sim/flaps.ts`, each moving `dt / travelSeconds` per call, clamped to [0, 1]. The F4F, F6F and Zero specs all have `gear.travelSeconds` and `flap.travelSeconds`.
- Budgets exist only in `tools/models/entries/<id>.json` as `budget: { maxBytes, maxTriangles, maxDrawCalls }`. `tools/models/manifest.ts` imports `node:fs`, so the page cannot import it. Each entry's `output` (e.g. `content/aircraft/wildcat.glb`) is exactly the path the runtime fetches (`WILDCAT_MODEL_PATH`, `shipModelPath(id)` in `src/render/content.ts`), prefixed with `import.meta.env.BASE_URL`.
- The model cache (`src/render/models/modelCache.ts`) clones one parse per URL with `source.clone(true)`: **clones share materials**, so a material flag set on one instance is set on the cached source and on the next instance of that URL.
- Vitest runs with `environment: 'node'`: no DOM. The DOM half of the bench is covered by Tier 2; its logic lives in the pure modules.

## Global Constraints

- The bench shows only when `benchEnabled(import.meta.env.DEV, location.search)` is true (`benchFlag.ts`); do not change that expression.
- `src/sim/**` is not modified. `src/render/hangar/**` may import from `src/sim/**` (render → sim is allowed).
- The only edit outside `src/render/hangar/**`, the hangar tests and docs is the one-line `userData.modelUrl` tag in `modelCache.ts` (Task 1). `Airframe`, `airframes.ts`, `wildcat.ts`, `ship.ts` and `shipModels.ts` are not edited.
- A part with `modeled: false` shows greyed and reads "not modeled" (spec §8); never offer a control that moves nothing.
- The counts readout turns red only when the model is over its manifest budget; a model with no budget reads "no manifest budget", never red.
- US spelling in prose and identifiers.
- Every task ends with its named test files green (`npx vitest run <files> --maxWorkers=2`), `npx tsc --noEmit`, and `npx eslint <touched files> --max-warnings 0`. Full suites run only through `remote-run npm run verify` (CLAUDE.md), and only in Task 7. Capture `rc=$?` directly.
- The work is on `main`, in place (Mark, 2026-09-26). Re-diff against `HEAD` before every commit; other sessions commit to `main` too. Never push.

## Review Focus

1. **Switching models while a Cycle runs.** The new model must not inherit the old one's cycle: it starts at rest (gear down, flaps up, stores on). Pinned in Task 2's `createBenchController` test and by Task 5's rule that `select` builds a fresh controller.
2. **Wireframe survives a switch in both directions.** Clones share materials, so wireframe must be applied explicitly (on OR off) to every model shown. Otherwise re-selecting the same model after turning wireframe off shows a stale wireframe, or a new model ignores it. Pinned in Task 4's `applyWireframe` test, and in Task 5, where `show` re-applies the current flag.
3. **A model with no budget** (a building, or a ship drawn as the box fallback) reads "no manifest budget", is not red, and does not throw. Pinned in Task 1's `countsReport` test.
4. **The articulated-node probe must leave the model at rest.** It poses gear up and flaps down to find what moves, and must restore gear down and flaps up, or the first frame shows the gear retracted. Pinned in Task 3's probe test.
5. **Moving a slider during a Cycle cancels that part's cycle** instead of fighting it frame by frame. Pinned in Task 2's test.

---

### Task 1: Manifest budgets in the page, and the counts report

**Files:**
- Modify: `src/render/models/modelCache.ts` (tag each instance root)
- Create: `src/render/hangar/budgets.ts`
- Modify: `src/render/hangar/contentIndex.ts` (glob the entries)
- Modify: `src/render/hangar/catalog.ts` (`HangarContent` gains `budgets`)
- Modify: `tests/render/hangar/content.ts` (Node twin of the glob)
- Modify: `tests/render/modelCache.test.ts`
- Create: `tests/render/hangar/budgets.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // budgets.ts
  export interface ModelBudget { readonly maxBytes: number; readonly maxTriangles: number; readonly maxDrawCalls: number }
  export interface Counts { readonly triangles: number; readonly drawCalls: number }
  /** output path (e.g. 'content/aircraft/wildcat.glb') -> budget */
  export type BudgetTable = ReadonlyMap<string, ModelBudget>
  export function parseBudgets(files: Record<string, unknown>): BudgetTable
  export function budgetForUrl(table: BudgetTable, url: string): ModelBudget | null
  export interface CountsReport {
    readonly scene: Counts            // everything under the model root that is visible
    readonly model: Counts | null     // only the subtrees tagged with userData.modelUrl; null if none
    readonly modelUrl: string | null  // the single tagged URL, or null (none, or more than one)
    readonly budget: ModelBudget | null
    readonly over: boolean            // model exceeds budget on triangles or draw calls
  }
  export function countsReport(root: Object3D, table: BudgetTable): CountsReport
  export function countsText(r: CountsReport): { readonly lines: readonly string[]; readonly over: boolean }
  ```
  `HangarContent.budgets: BudgetTable`. `ModelInstance.root.userData.modelUrl === url` for every acquired instance.
- Consumes: `sceneCounts(root)` from `src/render/hangar/models.ts` (existing: one draw per visible `Mesh` per material group, triangles from index or position count).

- [ ] **Step 1: Write the failing tests.**

  Append to `tests/render/modelCache.test.ts` (follow the file's existing stub-parse pattern; it already builds a cache with `createModelCache(async () => someObject3D)`):

  ```ts
  it('tags every instance root with the URL it was acquired from (Hangar budgets, H2)', async () => {
    const cache = createModelCache(async () => new Group())
    const a = await cache.acquire('/content/aircraft/wildcat.glb')
    const b = await cache.acquire('/content/aircraft/wildcat.glb')
    expect(a.root.userData.modelUrl).toBe('/content/aircraft/wildcat.glb')
    expect(b.root.userData.modelUrl).toBe('/content/aircraft/wildcat.glb')
    a.release(); b.release()
  })
  ```
  (Import `Group` from `three` if the file does not already.)

  Create `tests/render/hangar/budgets.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest'
  import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
  import { readFileSync, readdirSync } from 'node:fs'
  import { loadModelEntries } from '../../../tools/models/manifest.js'
  import { budgetForUrl, countsReport, countsText, parseBudgets } from '../../../src/render/hangar/budgets.js'
  import { WILDCAT_MODEL_PATH, shipModelPath } from '../../../src/render/content.js'
  import { SHIP_MODELS } from '../../../src/render/scene/shipModels.js'

  const entryFiles = (): Record<string, unknown> => Object.fromEntries(
    readdirSync('tools/models/entries').filter((f) => f.endsWith('.json'))
      .map((f) => [`/tools/models/entries/${f}`, JSON.parse(readFileSync(`tools/models/entries/${f}`, 'utf8'))]),
  )
  const box = (): Mesh => new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()) // 12 triangles, 1 draw

  describe('parseBudgets', () => {
    it("agrees with the build's own manifest parse, entry for entry", () => {
      const table = parseBudgets(entryFiles())
      const expected = new Map(loadModelEntries().map((e) => [e.output, e.budget]))
      expect(new Map(table)).toEqual(expected)
    })

    it('finds a budget for every model the runtime can load', () => {
      const table = parseBudgets(entryFiles())
      for (const path of [WILDCAT_MODEL_PATH, ...Object.keys(SHIP_MODELS).map(shipModelPath)]) {
        expect(budgetForUrl(table, `/${path}`), path).not.toBeNull()
      }
    })

    it('names the file when an entry has no budget', () => {
      expect(() => parseBudgets({ '/tools/models/entries/x.json': { output: 'content/ships/x.glb' } })).toThrow(/x\.json/)
    })
  })

  describe('countsReport', () => {
    const table = parseBudgets({ '/e/a.json': { output: 'content/aircraft/a.glb', budget: { maxBytes: 1, maxTriangles: 24, maxDrawCalls: 2 } } })

    it('counts the tagged model apart from runtime additions, against its budget', () => {
      const model = new Group(); model.userData.modelUrl = '/content/aircraft/a.glb'
      model.add(box(), box())
      const root = new Group(); root.add(model, box()) // the third box is a runtime store
      const r = countsReport(root, table)
      expect(r.scene).toEqual({ triangles: 36, drawCalls: 3 })
      expect(r.model).toEqual({ triangles: 24, drawCalls: 2 })
      expect(r.modelUrl).toBe('/content/aircraft/a.glb')
      expect(r.over).toBe(false)
      model.add(box())
      expect(countsReport(root, table).over).toBe(true)
    })

    it('a model with no tag or no budget reads "no manifest budget" and is never over', () => {
      const root = new Group(); root.add(box())
      const r = countsReport(root, table)
      expect(r).toMatchObject({ model: null, modelUrl: null, budget: null, over: false })
      expect(countsText(r)).toEqual({ lines: ['Scene 12 triangles, 1 draw calls', 'No manifest budget'], over: false })
    })

    it('reads model against budget in the text', () => {
      const model = new Group(); model.userData.modelUrl = '/content/aircraft/a.glb'; model.add(box())
      const root = new Group(); root.add(model)
      expect(countsText(countsReport(root, table)).lines).toEqual([
        'Scene 12 triangles, 1 draw calls',
        'Model 12 / 24 triangles, 1 / 2 draw calls',
      ])
    })
  })
  ```

- [ ] **Step 2: Run them to see them fail.**

  Run: `npx vitest run tests/render/modelCache.test.ts tests/render/hangar/budgets.test.ts --maxWorkers=2`
  Expected: FAIL. `budgets.js` does not exist, and `userData.modelUrl` is `undefined`.

- [ ] **Step 3: Tag the instance.** In `modelCache.ts`, right after `const root = source.clone(true)`:

  ```ts
      // Which glb this subtree came from: the Hangar's budget readout counts
      // these subtrees apart from runtime additions such as stores (H2).
      root.userData.modelUrl = url
  ```

- [ ] **Step 4: Write `src/render/hangar/budgets.ts`.**

  ```ts
  // src/render/hangar/budgets.ts
  import { z } from 'zod'
  import type { Object3D } from 'three'
  import { sceneCounts } from './models.js'

  /**
   * Each shipped model's manifest budget (A6M Zero spec §6.1), read from
   * tools/models/entries/*.json, the same files `npm run models:build`
   * enforces. The page cannot import tools/models/manifest.ts (it reads the
   * disk with node:fs), so this parses only the two fields the readout needs;
   * tests/render/hangar/budgets.test.ts pins the result to the manifest's own
   * parse, so the two cannot drift.
   */
  export interface ModelBudget { readonly maxBytes: number; readonly maxTriangles: number; readonly maxDrawCalls: number }
  export interface Counts { readonly triangles: number; readonly drawCalls: number }
  export type BudgetTable = ReadonlyMap<string, ModelBudget>

  const EntryBudget = z.object({
    output: z.string(),
    budget: z.object({ maxBytes: z.number().int().positive(), maxTriangles: z.number().int().positive(), maxDrawCalls: z.number().int().positive() }).strict(),
  })

  export function parseBudgets(files: Record<string, unknown>): BudgetTable {
    const table = new Map<string, ModelBudget>()
    for (const [path, raw] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
      const r = EntryBudget.safeParse(raw)
      if (!r.success) throw new Error(`${path}: ${r.error.message}`)
      table.set(r.data.output, r.data.budget)
    }
    return table
  }

  /** `url` is what the cache fetched: BASE_URL + the entry's output path. */
  export function budgetForUrl(table: BudgetTable, url: string): ModelBudget | null {
    for (const [output, budget] of table) if (url === output || url.endsWith(`/${output}`)) return budget
    return null
  }

  export interface CountsReport {
    readonly scene: Counts
    readonly model: Counts | null
    readonly modelUrl: string | null
    readonly budget: ModelBudget | null
    readonly over: boolean
  }

  export function countsReport(root: Object3D, table: BudgetTable): CountsReport {
    const tagged: Object3D[] = []
    const find = (o: Object3D): void => {
      if (typeof o.userData.modelUrl === 'string') { tagged.push(o); return }
      o.children.forEach(find)
    }
    find(root)
    const scene = sceneCounts(root)
    if (tagged.length === 0) return { scene, model: null, modelUrl: null, budget: null, over: false }
    let triangles = 0, drawCalls = 0
    for (const t of tagged) { const c = sceneCounts(t); triangles += c.triangles; drawCalls += c.drawCalls }
    const urls = [...new Set(tagged.map((t) => t.userData.modelUrl as string))]
    const modelUrl = urls.length === 1 ? urls[0]! : null
    const budget = modelUrl === null ? null : budgetForUrl(table, modelUrl)
    const over = budget !== null && (triangles > budget.maxTriangles || drawCalls > budget.maxDrawCalls)
    return { scene, model: { triangles, drawCalls }, modelUrl, budget, over }
  }

  export function countsText(r: CountsReport): { readonly lines: readonly string[]; readonly over: boolean } {
    const lines = [`Scene ${r.scene.triangles} triangles, ${r.scene.drawCalls} draw calls`]
    if (r.model === null || r.budget === null) lines.push('No manifest budget')
    else lines.push(`Model ${r.model.triangles} / ${r.budget.maxTriangles} triangles, ${r.model.drawCalls} / ${r.budget.maxDrawCalls} draw calls`)
    return { lines, over: r.over }
  }
  ```

  If `sceneCounts` importing from `models.ts` creates a cycle once Task 3 imports `budgets.ts` from `models.ts` (depcruise's `no-circular` will say so), move `sceneCounts` into `budgets.ts` and re-export it from `models.ts` for its existing callers.

- [ ] **Step 5: Carry the table in `HangarContent`.** In `catalog.ts`, add `readonly budgets: BudgetTable` to `HangarContent` (import the type from `./budgets.js`). In `contentIndex.ts`:

  ```ts
  const modelEntries = import.meta.glob('/tools/models/entries/*.json', { eager: true, import: 'default' })
  ```
  and add `budgets: parseBudgets(modelEntries)` to the object `loadHangarContent` returns. In `tests/render/hangar/content.ts`'s `nodeHangarContent`, add `budgets: parseBudgets(Object.fromEntries(readdirSync('tools/models/entries').filter((f) => f.endsWith('.json')).map((f) => [f, JSON.parse(readFileSync(\`tools/models/entries/${f}\`, 'utf8'))])))`.

- [ ] **Step 6: Run the tests, typecheck and lint.**

  Run: `npx vitest run tests/render/modelCache.test.ts tests/render/hangar/ --maxWorkers=2 && npx tsc --noEmit && npx eslint src/render/models/modelCache.ts src/render/hangar tests/render/hangar tests/render/modelCache.test.ts --max-warnings 0 && npx depcruise src --config .dependency-cruiser.cjs`
  Expected: PASS, no warnings, no violations.

- [ ] **Step 7: Commit.**
  ```bash
  git diff HEAD --stat   # only this task's files
  git add src/render/models/modelCache.ts src/render/hangar/budgets.ts src/render/hangar/contentIndex.ts src/render/hangar/catalog.ts tests/render/hangar/content.ts tests/render/hangar/budgets.test.ts tests/render/modelCache.test.ts
  git commit -m "H2: manifest budgets in the Hangar, the counts report, and the cache's modelUrl tag (H2 Task 1)"
  ```

---

### Task 2: The bench controller — state, Cycle and stores

**Files:**
- Create: `src/render/hangar/benchController.ts`
- Create: `tests/render/hangar/benchController.test.ts`
- Modify: `src/render/hangar/models.ts` (`PartPose` gains `bombs` and `rockets`)

**Interfaces:**
- Consumes: `gearAfter` (`src/sim/ground.ts`), `flapAfter` (`src/sim/flaps.ts`), `AircraftSpec` (`src/sim/flight/schema.ts`).
- Produces:
  ```ts
  // models.ts
  export interface PartPose { readonly gearFraction?: number; readonly flapFraction?: number; readonly throttle?: number; readonly bombs?: boolean; readonly rockets?: boolean }
  // benchController.ts
  export type CyclePart = 'gear' | 'flaps'
  export interface BenchState { readonly gearFraction: number; readonly flapFraction: number; readonly throttle: number; readonly bombs: boolean; readonly rockets: boolean; readonly cycling: CyclePart | null }
  export const REST: BenchState  // gear 1, flaps 0, throttle 0, bombs true, rockets true, cycling null
  export interface BenchController {
    state(): BenchState
    /** A slider or toggle moved: applies it, cancels a cycle of the part it moves, returns the pose to hand the model. */
    set(p: PartPose): PartPose
    /** The Cycle button: runs the part to the far end; pressed mid-cycle, reverses. No-op without a spec. */
    startCycle(part: CyclePart): void
    /** One frame. Returns the pose to hand the model, or null when nothing moved. */
    advance(frameS: number): PartPose | null
  }
  export function createBenchController(spec: AircraftSpec | null): BenchController
  ```

- [ ] **Step 1: Write the failing test.** `tests/render/hangar/benchController.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest'
  import { createBenchController, REST } from '../../../src/render/hangar/benchController.js'
  import { loadAircraftSpec } from '../../../tools/content/load.js'

  const f4f = loadAircraftSpec('f4f-wildcat')
  const run = (c: ReturnType<typeof createBenchController>, seconds: number, hz = 60): void => {
    for (let i = 0; i < Math.round(seconds * hz); i++) c.advance(1 / hz)
  }

  describe('createBenchController', () => {
    it('starts at rest: gear down, flaps up, stores on, nothing cycling', () => {
      expect(createBenchController(f4f).state()).toEqual(REST)
      expect(REST).toEqual({ gearFraction: 1, flapFraction: 0, throttle: 0, bombs: true, rockets: true, cycling: null })
    })

    it("Cycle runs the gear up over the spec's own travelSeconds, as the sim's gearAfter does", () => {
      const c = createBenchController(f4f)
      c.startCycle('gear')
      run(c, f4f.gear.travelSeconds - 0.1)
      expect(c.state().gearFraction).toBeGreaterThan(0)
      expect(c.state().cycling).toBe('gear')
      run(c, 0.2)
      expect(c.state()).toMatchObject({ gearFraction: 0, cycling: null })
      expect(c.advance(1 / 60)).toBeNull()
    })

    it('a second press mid-cycle reverses it; a Cycle from up goes back down', () => {
      const c = createBenchController(f4f)
      c.startCycle('flaps')
      run(c, 1)
      const mid = c.state().flapFraction
      c.startCycle('flaps')
      run(c, 0.5)
      expect(c.state().flapFraction).toBeLessThan(mid)
      run(c, f4f.flap.travelSeconds)
      expect(c.state()).toMatchObject({ flapFraction: 0, cycling: null })
    })

    it('moving the slider cancels that part cycle instead of fighting it', () => {
      const c = createBenchController(f4f)
      c.startCycle('gear')
      run(c, 1)
      expect(c.set({ gearFraction: 0.8 })).toEqual({ gearFraction: 0.8 })
      expect(c.state()).toMatchObject({ gearFraction: 0.8, cycling: null })
      expect(c.advance(1 / 60)).toBeNull()
    })

    it('advance hands the model the moving part only', () => {
      const c = createBenchController(f4f)
      c.startCycle('gear')
      const p = c.advance(1 / 60)!
      expect(Object.keys(p)).toEqual(['gearFraction'])
      expect(p.gearFraction).toBeCloseTo(1 - 1 / 60 / f4f.gear.travelSeconds, 12)
    })

    it('stores toggles are state, and a fresh controller (a new model) has them back on', () => {
      const c = createBenchController(f4f)
      expect(c.set({ bombs: false })).toEqual({ bombs: false })
      expect(c.state().bombs).toBe(false)
      expect(createBenchController(f4f).state().bombs).toBe(true)
    })

    it('with no spec (a ship or a building) Cycle does nothing', () => {
      const c = createBenchController(null)
      c.startCycle('gear')
      expect(c.state().cycling).toBeNull()
      expect(c.advance(1)).toBeNull()
    })
  })
  ```

- [ ] **Step 2: Run it to see it fail.** `npx vitest run tests/render/hangar/benchController.test.ts --maxWorkers=2`. Expected: FAIL, module not found.

- [ ] **Step 3: Add `bombs` and `rockets` to `PartPose`** in `models.ts`, each with a one-line doc comment: `/** Stores on the racks (true) or dropped (false); H2. */`.

- [ ] **Step 4: Write `benchController.ts`.**

  ```ts
  // src/render/hangar/benchController.ts
  import type { AircraftSpec } from '../../sim/flight/schema.js'
  import { gearAfter } from '../../sim/ground.js'
  import { flapAfter } from '../../sim/flaps.js'
  import type { PartPose } from './models.js'

  /**
   * The bench's state (Hangar spec §8), kept apart from the DOM so Node can
   * test it. Cycle moves a part through the SIM's own transit functions, so
   * the Hangar shows exactly the timing the game flies: one full travel takes
   * the spec's `gear.travelSeconds` / `flap.travelSeconds`.
   */
  export type CyclePart = 'gear' | 'flaps'
  export interface BenchState {
    readonly gearFraction: number
    readonly flapFraction: number
    readonly throttle: number
    readonly bombs: boolean
    readonly rockets: boolean
    readonly cycling: CyclePart | null
  }
  export const REST: BenchState = { gearFraction: 1, flapFraction: 0, throttle: 0, bombs: true, rockets: true, cycling: null }

  export interface BenchController {
    state(): BenchState
    set(p: PartPose): PartPose
    startCycle(part: CyclePart): void
    advance(frameS: number): PartPose | null
  }

  export function createBenchController(spec: AircraftSpec | null): BenchController {
    let s: BenchState = REST
    let target: 0 | 1 = 0
    return {
      state: () => s,
      set(p) {
        const cancels = (p.gearFraction !== undefined && s.cycling === 'gear') || (p.flapFraction !== undefined && s.cycling === 'flaps')
        s = { ...s, ...p, cycling: cancels ? null : s.cycling }
        return p
      },
      startCycle(part) {
        if (spec === null) return
        const now = part === 'gear' ? s.gearFraction : s.flapFraction
        // Mid-cycle, a press reverses, like the lever; at rest, go to the far end.
        target = s.cycling === part ? (target === 1 ? 0 : 1) : now >= 0.5 ? 0 : 1
        s = { ...s, cycling: part }
      },
      advance(frameS) {
        if (spec === null || s.cycling === null) return null
        const part = s.cycling
        const down = target === 1
        const next = part === 'gear' ? gearAfter(spec, s.gearFraction, down, frameS) : flapAfter(spec, s.flapFraction, down, frameS)
        const done = next === target
        s = part === 'gear' ? { ...s, gearFraction: next, cycling: done ? null : part } : { ...s, flapFraction: next, cycling: done ? null : part }
        return part === 'gear' ? { gearFraction: next } : { flapFraction: next }
      },
    }
  }
  ```

- [ ] **Step 5: Run it, typecheck, lint.** `npx vitest run tests/render/hangar/benchController.test.ts --maxWorkers=2 && npx tsc --noEmit && npx eslint src/render/hangar tests/render/hangar --max-warnings 0`. Expected: PASS.

  If "runs the gear up ... travelSeconds" fails by one frame of floating-point accumulation (fraction ~1e-15 above 0 after exactly `travelSeconds`), that is why the test stops 0.1 s short and then runs 0.2 s; do not loosen it further. Report anything else red.

- [ ] **Step 6: Commit.** `git add src/render/hangar/benchController.ts src/render/hangar/models.ts tests/render/hangar/benchController.test.ts && git commit -m "H2: the bench controller: Cycle through the sim's own gear and flap transit, stores toggles (H2 Task 2)"`

---

### Task 3: The model adapter — stores, the articulated-node probe

**Files:**
- Modify: `src/render/hangar/models.ts`
- Modify: `tests/render/hangar/models.test.ts`

**Interfaces:**
- Consumes: `PartPose` with `bombs`/`rockets` (Task 2); `RACK_OFFSETS`, `RAIL_OFFSETS` (`src/render/scene/stores.ts`).
- Produces:
  ```ts
  export interface PartSpec {
    readonly id: 'gear' | 'flaps' | 'prop' | 'stores'
    readonly label: string
    readonly kind: 'fraction' | 'rate' | 'toggle'
    readonly range: readonly [number, number]
    readonly modeled: boolean
  }
  export interface HangarModel {
    // existing members unchanged, plus:
    /** Nodes the bench actually moves (gear legs, propeller, flaps), found by probing; [] for ships and buildings. */
    readonly articulated: readonly Object3D[]
  }
  export function probeArticulated(root: Object3D, drive: (u: { gearFraction: number; flapFraction: number; throttle: number; frameS: number }) => void): Object3D[]
  ```
  `partSpecsFor(parts)` returns four rows in the order gear, flaps, prop, stores.

- [ ] **Step 1: Write the failing tests.** In `tests/render/hangar/models.test.ts`:
  - Update the existing `partSpecsFor` expectation to `[['gear', true], ['flaps', false], ['prop', true], ['stores', true]]`.
  - Add:

  ```ts
  import { Group, Object3D } from 'three'
  import { probeArticulated } from '../../../src/render/hangar/models.js'
  import { RACK_OFFSETS, RAIL_OFFSETS } from '../../../src/render/scene/stores.js'

  describe('probeArticulated', () => {
    it('finds exactly the nodes a pose moves, and leaves the model at rest', () => {
      const root = new Group()
      const leg = new Object3D(); leg.name = 'leg'
      const prop = new Object3D(); prop.name = 'prop'
      const still = new Object3D(); still.name = 'still'
      const child = new Object3D(); child.name = 'child-of-leg' // moves in world, not locally
      leg.add(child); root.add(leg, prop, still)
      let rest = true
      const drive = (u: { gearFraction: number; flapFraction: number; throttle: number; frameS: number }): void => {
        leg.position.y = u.gearFraction
        prop.rotation.z += u.throttle * u.frameS * 40
        rest = u.gearFraction === 1 && u.flapFraction === 0
      }
      expect(probeArticulated(root, drive).map((o) => o.name).sort()).toEqual(['leg', 'prop'])
      expect(rest).toBe(true)
      expect(leg.position.y).toBe(1)
    })
  })

  describe('stores on the bench', () => {
    it('toggles hand setStores full racks or empty ones', async () => {
      const hellcat = createHellcat()
      const setStores = vi.spyOn(hellcat, 'setStores')
      const m = await loadHangarModel(byId('f6f-hellcat'), async () => hellcat)
      m!.pose({ bombs: false })
      expect(setStores).toHaveBeenLastCalledWith(0, RAIL_OFFSETS.length)
      m!.pose({ rockets: false, bombs: true })
      expect(setStores).toHaveBeenLastCalledWith(RACK_OFFSETS.length, 0)
    })

    it('an aircraft reports what its probe found; a ship reports nothing', async () => {
      const m = await loadHangarModel(byId('f6f-hellcat'), async () => createHellcat())
      expect(m!.articulated.length).toBeGreaterThan(0) // the stub's propeller
      const s = await loadHangarModel(byId('essex-cv'), undefined, async (spec) => createShipMesh(spec))
      expect(s!.articulated).toEqual([])
    })
  })
  ```

- [ ] **Step 2: Run to see them fail.** `npx vitest run tests/render/hangar/models.test.ts --maxWorkers=2`. Expected: FAIL (`probeArticulated` not exported, the stores row missing).

- [ ] **Step 3: Implement in `models.ts`.**
  - Extend `PartSpec` as in Interfaces, and add `{ id: 'stores', label: 'Stores', kind: 'toggle', range: [0, 1] }` as the last `BENCH_PARTS` row. Update the `PartSpec` doc comment: "H2 adds stores; H3 turrets."
  - Add:

  ```ts
  /**
   * The nodes a pose actually moves (the bench's pivot gizmos, spec §8): every
   * node's LOCAL transform is read at rest (gear down, flaps up), again with
   * gear up, flaps down and a propeller step, and the ones that changed are
   * returned. Probing what moves, rather than trusting a name list, is the
   * point: a wrong pivot shows as a gizmo in the wrong place. Leaves gear and
   * flaps at rest; the propeller keeps its advanced angle, which is cosmetic.
   */
  export function probeArticulated(root: Object3D, drive: (u: { gearFraction: number; flapFraction: number; throttle: number; frameS: number }) => void): Object3D[] {
    const read = (): Map<Object3D, string> => {
      const m = new Map<Object3D, string>()
      root.traverse((o) => m.set(o, [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()].map((v) => v.toFixed(6)).join(',')))
      return m
    }
    drive({ gearFraction: 1, flapFraction: 0, throttle: 0, frameS: 0 })
    const before = read()
    drive({ gearFraction: 0, flapFraction: 1, throttle: 1, frameS: 0.05 })
    const after = read()
    drive({ gearFraction: 1, flapFraction: 0, throttle: 0, frameS: 0 })
    return [...before].filter(([o, k]) => after.get(o) !== k).map(([o]) => o)
  }
  ```
  - In `aircraftModel`: track `bombs = true, rockets = true`; in `pose`, when `p.bombs` or `p.rockets` is defined, update them and call `airframe.setStores(bombs ? RACK_OFFSETS.length : 0, rockets ? RAIL_OFFSETS.length : 0)`. Compute `articulated` once, before returning: `const articulated = probeArticulated(airframe.root, (u) => airframe.update({ ...u, controls: { roll: 0, pitch: 0, yaw: 0 }, cameraDistanceM: 0 }))`, then `apply(0)` so the model's own state (gear 1, flaps 0) is what shows. Add `articulated` to the returned object.
  - `staticModel` returns `articulated: []`.

- [ ] **Step 4: Run, typecheck, lint.** `npx vitest run tests/render/hangar/ --maxWorkers=2 && npx tsc --noEmit && npx eslint src/render/hangar tests/render/hangar --max-warnings 0`. Expected: PASS.

- [ ] **Step 5: Commit.** `git add src/render/hangar/models.ts tests/render/hangar/models.test.ts && git commit -m "H2: stores on the bench, and the articulated-node probe behind the pivot gizmos (H2 Task 3)"`

---

### Task 4: The stage — wireframe, gizmos, turntable

**Files:**
- Modify: `src/render/hangar/stage.ts`
- Create: `tests/render/hangar/stage.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function applyWireframe(root: Object3D, on: boolean): void
  export function createGizmos(nodes: readonly Object3D[], size: number): Group   // one AxesHelper per node, named after it
  export function syncGizmos(gizmos: Group, nodes: readonly Object3D[]): void     // world position + orientation, scale 1
  // HangarStage gains:
  setWireframe(on: boolean): void    // applied now, and to every later show()
  setGizmos(nodes: readonly Object3D[] | null): void  // null = off
  setAutoRotate(on: boolean): void
  ```
  `createStage` itself needs WebGPU and stays Tier 2 only; the three pure functions above are what Node tests.

- [ ] **Step 1: Write the failing test.** `tests/render/hangar/stage.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest'
  import { AxesHelper, BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D } from 'three'
  import { applyWireframe, createGizmos, syncGizmos } from '../../../src/render/hangar/stage.js'

  describe('applyWireframe', () => {
    it('sets and clears every mesh material, arrays included, because clones share them', () => {
      const shared = new MeshStandardMaterial()
      const a = new Mesh(new BoxGeometry(), shared)
      const b = new Mesh(new BoxGeometry(), [new MeshStandardMaterial(), shared])
      const root = new Group(); root.add(a, b)
      applyWireframe(root, true)
      expect([shared.wireframe, (b.material as MeshStandardMaterial[])[0]!.wireframe]).toEqual([true, true])
      applyWireframe(root, false)
      expect([shared.wireframe, (b.material as MeshStandardMaterial[])[0]!.wireframe]).toEqual([false, false])
    })
  })

  describe('gizmos', () => {
    it('one axes helper per node, following its world transform', () => {
      const parent = new Group(); parent.position.set(10, 0, 0); parent.scale.setScalar(0.1)
      const node = new Object3D(); node.name = 'Helice'; node.position.set(0, 20, 0)
      parent.add(node)
      const g = createGizmos([node], 2)
      expect(g.children).toHaveLength(1)
      expect(g.children[0]).toBeInstanceOf(AxesHelper)
      expect(g.children[0]!.name).toBe('gizmo Helice')
      syncGizmos(g, [node])
      expect(g.children[0]!.position.toArray()).toEqual([10, 2, 0])
      expect(g.children[0]!.scale.toArray()).toEqual([1, 1, 1])
    })
  })
  ```

- [ ] **Step 2: Run to see it fail.** `npx vitest run tests/render/hangar/stage.test.ts --maxWorkers=2`. Expected: FAIL (not exported).

- [ ] **Step 3: Implement in `stage.ts`.**

  ```ts
  /** Every mesh material under `root`, on or off. Explicit both ways: the
   *  model cache's clones share materials, so a model shown after wireframe
   *  was turned off could otherwise still be wireframe (H2). */
  export function applyWireframe(root: Object3D, on: boolean): void {
    root.traverse((o) => {
      if (!(o instanceof Mesh)) return
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if ('wireframe' in m) m.wireframe = on
    })
  }

  /** Pivot gizmos (spec §8): an axes helper at each articulated node's origin,
   *  drawn over the model so a pivot inside the fuselage still shows. */
  export function createGizmos(nodes: readonly Object3D[], size: number): Group {
    const g = new Group()
    g.name = 'hangar gizmos'
    for (const n of nodes) {
      const h = new AxesHelper(size)
      h.name = `gizmo ${n.name}`
      const mat = h.material as LineBasicMaterial
      mat.depthTest = false
      h.renderOrder = 999
      g.add(h)
    }
    return g
  }

  const _p = new Vector3(), _q = new Quaternion(), _s = new Vector3()
  export function syncGizmos(gizmos: Group, nodes: readonly Object3D[]): void {
    nodes.forEach((n, i) => {
      const h = gizmos.children[i]
      if (!h) return
      n.updateWorldMatrix(true, false)
      n.matrixWorld.decompose(_p, _q, _s)
      h.position.copy(_p)
      h.quaternion.copy(_q)
    })
  }
  ```
  Add `AxesHelper, LineBasicMaterial, Quaternion` to the `three` import.

  In `createStage`: keep `let wireframe = false`, `let gizmoNodes: readonly Object3D[] = []`, `let gizmos: Group | null = null`.
  - `show(model, kind)`: after `holder.add(model)`, call `applyWireframe(model, wireframe)`. Before a model is removed (`if (current) holder.remove(current)`), call `applyWireframe(current, false)` so a released source never keeps the flag. Then drop the gizmos (`setGizmos(null)`); `main.ts` re-requests them for the new model.
  - `setWireframe(on)`: `wireframe = on; if (current) applyWireframe(current, on)`.
  - `setGizmos(nodes)`: remove and `disposeMeshTree` the old group; if `nodes` is non-null and non-empty, `gizmos = createGizmos(nodes, radius * 0.08)`, `scene.add(gizmos)`, `gizmoNodes = nodes`.
  - `setAutoRotate(on)`: `controls.autoRotate = on`.
  - `render()`: `if (gizmos) syncGizmos(gizmos, gizmoNodes)` before `pipeline.render()`.
  - `setModelVisible(v)` also sets `gizmos.visible = v` when gizmos exist, so the Tier 2 empty frame holds no gizmo.
  Add the three members to the `HangarStage` interface with one-line doc comments.

- [ ] **Step 4: Run, typecheck, lint.** `npx vitest run tests/render/hangar/stage.test.ts --maxWorkers=2 && npx tsc --noEmit && npx eslint src/render/hangar tests/render/hangar --max-warnings 0`. Expected: PASS. (Importing `stage.ts` in Node pulls `pipeline.ts`, `OrbitControls` and the lighting modules; if that import fails in Node, move the three pure functions to a new `src/render/hangar/stageHelpers.ts`, import them from there in both `stage.ts` and the test, and record the move in the ledger.)

- [ ] **Step 5: Commit.** `git add src/render/hangar/stage.ts tests/render/hangar/stage.test.ts && git commit -m "H2: wireframe, pivot gizmos and the turntable switch on the stage (H2 Task 4)"`

---

### Task 5: The bench panel and the page wiring

**Files:**
- Modify: `src/render/hangar/bench.ts` (rewrite)
- Modify: `src/render/hangar/main.ts`
- Modify: `src/render/hangar/hooks.ts`

**Interfaces:**
- Consumes: `BenchController`, `BenchState`, `CyclePart`, `REST` (Task 2); `PartSpec` (Task 3); `countsReport`, `countsText`, `CountsReport` (Task 1); `HangarStage.setWireframe/setGizmos/setAutoRotate` (Task 4); `HangarContent.budgets`.
- Produces:
  ```ts
  // bench.ts
  export type DebugToggle = 'wireframe' | 'gizmos' | 'turntable'
  export interface BenchHandlers {
    onPose(p: PartPose): void
    onCycle(part: CyclePart): void
    onDebug(which: DebugToggle, on: boolean): void
  }
  export interface BenchHandle { sync(s: BenchState): void; setCounts(r: CountsReport): void }
  export function mountBench(slot: HTMLElement, parts: readonly PartSpec[], cycleable: boolean, debug: Readonly<Record<DebugToggle, boolean>>, h: BenchHandlers): BenchHandle
  // hooks.ts: HangarHooks gains
  cycle(part: CyclePart): void
  bench(): BenchState
  setDebug(which: DebugToggle, on: boolean): void
  gizmoNodes(): string[]           // names of the gizmo'd nodes of the selected model, [] when gizmos are off
  counts(): CountsReport | null
  ```

- [ ] **Step 1: Rewrite `bench.ts`.** Structure, top to bottom inside `slot`:
  1. Title "Test bench".
  2. One row per `PartSpec`:
     - not modeled: the label and "not modeled", opacity .45 (as today);
     - `fraction` (gear, flaps): a range input (aria-label = label, value from state) and, when `cycleable`, a `<button>` whose text is "Cycle" and whose `aria-label` is `Cycle ${label.toLowerCase()}` (so Tier 2 finds "Cycle landing gear"), calling `h.onCycle(id)`;
     - `rate` (prop): the range input, as today;
     - `toggle` (stores): two checkboxes, "Bombs" and "Rockets" (aria-labels exactly those), calling `h.onPose({ bombs })` / `h.onPose({ rockets })`.
  3. A "Debug" row with three checkboxes: "Pivot gizmos", "Wireframe", "Turntable" (aria-labels exactly those; initial values from `debug`), calling `h.onDebug`.
  4. A counts block: one `<div>` per line of `countsText(r).lines`, colored `#c0392b` when `over`, with `data-over="true|false"` on the block for Tier 2.
  - `sync(s)` sets each range input's value from `s` (gear → `gearFraction`, flaps → `flapFraction`, prop → `throttle`) and each store checkbox's `checked`, WITHOUT dispatching events.
  - `setCounts(r)` replaces the counts block's lines.
  - The debug row and counts block show for every model (ships and buildings too); the part rows only for parts that exist. Update the file's doc comment: H2 complete, H3 adds turret rows.

- [ ] **Step 2: Extend `hooks.ts`** with the five members in Interfaces, each with a one-line doc comment. Import `CyclePart`, `BenchState` from `./benchController.js`, `DebugToggle` from `./bench.js` and `CountsReport` from `./budgets.js` (all `import type`).

- [ ] **Step 3: Wire `main.ts`.**
  - Keep `content` (the `loadHangarContent()` result) so `content.budgets` is reachable.
  - State: `let controller = createBenchController(null)`, `let benchUi: BenchHandle | null = null`, `const debug = { wireframe: false, gizmos: false, turntable: true }`.
  - `applyPose(p)`: `const q = controller.set(p); model?.pose(q); benchUi?.sync(controller.state()); refreshCounts()`.
  - `refreshCounts()`: `if (model) benchUi?.setCounts(countsReport(model.root, content.budgets))`.
  - In `select`, after the model is shown: `controller = createBenchController(entry.subject?.kind === 'aircraft' ? entry.subject.spec : null)`; `stage.setGizmos(debug.gizmos ? model?.articulated ?? [] : null)`; and when `bench` is on, `benchUi = mountBench(panel.benchSlot, model?.parts ?? [], entry.subject?.kind === 'aircraft', debug, { onPose: applyPose, onCycle: (part) => controller.startCycle(part), onDebug })`, then `refreshCounts()`.
  - `onDebug(which, on)`: set `debug[which] = on`; wireframe → `stage.setWireframe(on)`; gizmos → `stage.setGizmos(on ? model?.articulated ?? [] : null)`; turntable → `stage.setAutoRotate(on)`.
  - A per-frame `step(frameS)`: `const p = controller.advance(frameS); if (p) { model?.pose(p); benchUi?.sync(controller.state()) }; model?.update(frameS)`. The animation loop calls `step` when not frozen, replacing its bare `model?.update(...)`. The `tick` hook calls `step(frameS)`, so a frozen page advances a Cycle exactly.
  - The existing `pose` hook becomes `applyPose`.
  - New hooks: `cycle: (part) => controller.startCycle(part)`, `bench: () => controller.state()`, `setDebug: onDebug`, `gizmoNodes: () => (debug.gizmos ? (model?.articulated ?? []).map((o) => o.name) : [])`, `counts: () => (model ? countsReport(model.root, content.budgets) : null)`.
  - `freeze()` keeps its meaning (Tier 2): it also sets `debug.turntable = false`.

- [ ] **Step 4: Typecheck, lint, run the hangar tests.** `npx tsc --noEmit && npx eslint src/render/hangar --max-warnings 0 && npx vitest run tests/render/hangar/ --maxWorkers=2`. Expected: PASS.

- [ ] **Step 5: Look at it.** With the primary dev server up (`curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim.windomlane.org/hangar.html` → `200`), write a throwaway spec under `tests/e2e/_probe/` that opens `/hangar.html?bench`, selects `f4f-wildcat`, turns on gizmos and wireframe, and saves `page.screenshot()` to `test-results/h2-bench-wildcat.png`; one more for `essex-cv`. Run it on the reference GPU (the command is in Task 6, Step 2). **Read both PNGs.** Check: the bench shows Landing gear with Cycle, Flaps "not modeled", Throttle, Bombs and Rockets, the Debug row, and the counts lines; three gizmos sit at the two wheel legs and the propeller hub; the carrier's counts read against its budget. Delete `tests/e2e/_probe/` afterwards.

- [ ] **Step 6: Commit.** `git diff HEAD --stat` (only these three files), then `git add src/render/hangar/bench.ts src/render/hangar/main.ts src/render/hangar/hooks.ts && git commit -m "H2: the full bench panel (Cycle, stores, gizmos, wireframe, turntable, counts against budget) and its hooks (H2 Task 5)"`

---

### Task 6: Tier 2 checks 6–10 on the reference GPU

**Files:**
- Modify: `tests/e2e/hangar.spec.ts`

**Interfaces:**
- Consumes: the Task 5 hooks and the bench's aria-labels ("Cycle landing gear", "Bombs", "Rockets").

- [ ] **Step 1: Add the checks** inside `test.describe('the Hangar', ...)`, reusing the file's `view`, `masks`, `shot`, `select`, `current`, `pose`, `visible` and `hasPart` helpers. Add `const setDebug = (page: Page, w: string, on: boolean) => page.evaluate(([x, y]) => (window as HangarWindow).__hangar!.setDebug(x as 'wireframe' | 'gizmos' | 'turntable', y as boolean), [w, on] as const)`.

  ```ts
  test('6. every modeled stores part shows: stores on and off differ (front view)', async ({ page }) => {
    for (const id of await entries(page)) {
      await select(page, id)
      if (!hasPart(await current(page), 'stores')) continue
      const { empty, model: on } = await view(page, id, 'front', { bombs: true, rockets: true })
      await pose(page, { bombs: false, rockets: false })
      const off = await shot(page)
      const m = await masks(page, empty, [on, off])
      console.log(`stores ${id}: xor ${m.xor01} of ${m.areas[0]} (${((100 * m.xor01) / m.areas[0]!).toFixed(2)}%)`)
      expect(m.xor01 / m.areas[0]!, id).toBeGreaterThanOrEqual(0.005)
    }
  })

  test("7. Cycle (the real button) takes the gear up over the spec's travel, ending where the slider's up end does", async ({ page }) => {
    for (const id of await entries(page)) {
      await select(page, id)
      if (!hasPart(await current(page), 'gear')) continue
      const { empty, model: down } = await view(page, id, 'front', { gearFraction: 1 })
      await pose(page, { gearFraction: 0 })
      const up = await shot(page)
      await pose(page, { gearFraction: 1 })
      await page.getByRole('button', { name: 'Cycle landing gear' }).click()
      // 10 s at 60 Hz covers every shipped spec's gear.travelSeconds (7 s).
      await page.evaluate(() => { for (let i = 0; i < 600; i++) (window as HangarWindow).__hangar!.tick(1 / 60) })
      expect(await page.evaluate(() => (window as HangarWindow).__hangar!.bench())).toMatchObject({ gearFraction: 0, cycling: null })
      const cycled = await shot(page)
      const vsUp = await masks(page, empty, [cycled, up])
      const vsDown = await masks(page, empty, [cycled, down])
      expect(vsUp.xor01 / vsUp.areas[1]!, `${id} vs up`).toBeLessThanOrEqual(0.002)
      expect(vsDown.xor01 / vsDown.areas[1]!, `${id} vs down`).toBeGreaterThanOrEqual(0.01)
    }
  })

  test('8. wireframe changes every model, and switching models keeps the setting', async ({ page }) => {
    const ids = await entries(page)
    for (const id of ids) {
      const { empty, model: solid } = await view(page, id, 'three-quarter')
      await setDebug(page, 'wireframe', true)
      const wire = await shot(page)
      await setDebug(page, 'wireframe', false)
      const m = await masks(page, empty, [solid, wire])
      expect(m.xor01 / m.areas[0]!, id).toBeGreaterThanOrEqual(0.05)
    }
    // Clones share materials: off must really be off after a round trip.
    const { empty, model: first } = await view(page, ids[0]!, 'three-quarter')
    await setDebug(page, 'wireframe', true)
    await select(page, ids[1]!)
    await setDebug(page, 'wireframe', false)
    const { model: again } = await view(page, ids[0]!, 'three-quarter')
    const m = await masks(page, empty, [first, again])
    expect(m.xor01 / m.areas[0]!).toBeLessThanOrEqual(0.002)
    expect(await page.evaluate(() => (window as HangarWindow).__hangar!.validationErrors)).toEqual([])
  })

  test("9. the Wildcat's pivot gizmos are its two wheel legs and its propeller, and they draw", async ({ page }) => {
    const { empty, model: plain } = await view(page, 'f4f-wildcat', 'three-quarter')
    await setDebug(page, 'gizmos', true)
    expect((await page.evaluate(() => (window as HangarWindow).__hangar!.gizmoNodes())).sort()).toEqual(['GRP_Rueda_Der', 'GRP_Rueda_Izq', 'Helice'])
    const withGizmos = await shot(page)
    const m = await masks(page, empty, [plain, withGizmos])
    expect(m.xor01).toBeGreaterThan(0)
    await setDebug(page, 'gizmos', false)
    expect(await page.evaluate(() => (window as HangarWindow).__hangar!.validationErrors)).toEqual([])
  })

  test('10. every committed model is inside its manifest budget as drawn, and the readout says so', async ({ page }) => {
    for (const id of await entries(page)) {
      await select(page, id)
      const r = await page.evaluate(() => (window as HangarWindow).__hangar!.counts())
      console.log(`counts ${id}: ${JSON.stringify(r)}`)
      if (r?.budget) {
        expect(r.over, id).toBe(false)
        expect(await page.locator('[data-over]').getAttribute('data-over'), id).toBe('false')
      }
    }
    // The four registered models have budgets; the Zero draws as the Wildcat.
    for (const id of ['f4f-wildcat', 'essex-cv', 'fletcher-dd', 'type-b-maru']) {
      await select(page, id)
      expect((await page.evaluate(() => (window as HangarWindow).__hangar!.counts()))?.budget, id).not.toBeNull()
    }
  })
  ```
  Confirm the library ids used above (`f4f-wildcat`, `essex-cv`, `fletcher-dd`, `type-b-maru`) with `ls content/library/` before running. If one differs, use the real id and record the correction in the ledger.

- [ ] **Step 2: Run on the reference GPU.** The Hangar page loads no clouds or terrain, so the primary slot is fine (the game page's 25–45 s cloud-shader load, see the S1 handoff, does not apply here). Assert `https://ww2airsim.windomlane.org/hangar.html` returns `200` and that `ss -ltn | grep 39001` shows the Playwright tunnel, then:
  ```sh
  flock -w 600 /tmp/ww2airsim-tier2.lock env PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org \
    npx playwright test tests/e2e/hangar.spec.ts --reporter=list; echo "rc=$?"
  ```
  Expected: checks 1–3, 5 and 6–10 pass, with the layout and Library-button tests. Record every logged number (stores xor %, counts per model) in the ledger.

- [ ] **Step 3: If a check is red, report it with its numbers.** Do not lower a threshold to pass. The thresholds were chosen before measuring: 0.5% for stores (the eight stores are small against the airframe from the front), 1% and 0.2% for Cycle (check 2's 1% gear floor, and a tolerance for anti-aliasing noise between two renders of the same pose), and 5% for wireframe. If a measured value misses one, stop and ask Mark with the number in hand.

- [ ] **Step 4: Commit.** `git add tests/e2e/hangar.spec.ts && git commit -m "H2: Tier 2 checks 6-10: stores, Cycle, wireframe, gizmos and budgets on the reference GPU (H2 Task 6)"`

---

### Task 7: The runbook, the pointers, the handoff

**Files:**
- Create: `docs/models.md`
- Modify: `CLAUDE.md` ("Fetching third-party models": one line)
- Modify: `docs/superpowers/specs/2026-09-25-hangar-library-design.md` (§12 H2: mark items 1 and 4 done, per this plan's "Where H2 starts")
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§15 Hangar row)
- Modify: `README.md` (one paragraph pointing at §15)
- Create: `docs/handoff/2026-09-26-h2-hangar-bench.md` (use the real date when executed)

- [ ] **Step 1: `docs/models.md`**, the nine steps of spec §11, each naming the real command or file. Verify each exists before writing it: `tools/models/sketchfab-fetch.sh`, `npm run models:inspect`, `npm run models:build -- <id>` (`grep '"models:' package.json`), `tools/models/entries/`, `src/render/scene/airframes.ts` (aircraft `view.model` registry), `src/render/scene/shipModels.ts`'s `SHIP_MODELS` (ships: the spec §11 text says `content/ships/models.json`, which does not exist; S1 registered ships in `SHIP_MODELS`, so write that and say so in one line), `content/library/`, `hangar.html?bench`, `tests/e2e/hangar.spec.ts`. Link `tools/models/manifest.ts` and `docs/superpowers/specs/2026-09-25-a6m-zero-design.md` §6 for the entry fields instead of restating them. Add a "Check" line saying Tier 2 check 10 fails a model drawn over its manifest budget. Date the file's claims ("verified <date>").

- [ ] **Step 2: CLAUDE.md**: at the end of "Fetching third-party models", add: `The whole ingest, from search to a Hangar check, is docs/models.md.`

- [ ] **Step 3: The Hangar spec §12 H2**: after items 1 and 4, add `Done in H1 (2026-09-25).` and keep S1's existing note on item 4.

- [ ] **Step 4: Full verification.** `remote-run npm run verify; echo "rc=$?"`. Expected `rc=0`. If a test outside `src/render/hangar` fails, check it against `main` before this plan (see the S1 handoff for the known terrainLoad timeout, now fixed) and report it.

- [ ] **Step 5: The handoff** `docs/handoff/<date>-h2-hangar-bench.md`: what shipped, the Tier 2 numbers from Task 6, departures, traps (clones share materials; the probe leaves the prop angle advanced; the budget table is the page's own parse, pinned by `budgets.test.ts`), and what H3 consumes (`PartSpec.kind`, `BenchHandle`, `HangarModel.articulated`, `setDebug`). **§15's Hangar row**: "H2 complete <date> with Tier 1 and reference-GPU Tier 2 (checks 1–3, 5–10)", with plan and handoff links; H3 (turrets) open. **README**: one paragraph pointing at §15 and the handoff.

- [ ] **Step 6: Commit and email.**
  ```bash
  git diff HEAD --stat
  git add docs/models.md CLAUDE.md docs/superpowers/specs/2026-09-25-hangar-library-design.md docs/superpowers/specs/2026-09-12-ww2airsim-design.md README.md docs/handoff/
  git commit -m "H2: docs/models.md, the CLAUDE.md pointer, handoff, §15 row (H2 Task 7)"
  python3 tools/mail-doc.py docs/handoff/<date>-h2-hangar-bench.md "ww2airsim: H2 Hangar bench handoff"
  ```
  Do not push.
