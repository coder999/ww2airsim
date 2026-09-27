# R1: Roster pipeline and Library — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an original Blender model ship through `npm run models:build`, and let the Hangar draw a Library entry's own model, whether or not the object is in the game. Prove both with the M0 barrel-roof hangar, the first Blender model to reach `content/`.

**Architecture:** The model manifest gains a third source kind, `blender`. Its script writes a raw glb into the gitignored `tools/models/cache/`, and that glb then runs the same stages a Sketchfab download does. A Library entry gains an optional `model` reference. The Hangar draws that reference in place of the spec's `view.model`: aircraft through the airframe registry, ships through the ship registry, and buildings and vehicles through one new static-model registry. A Tier 1 allowlist names every entry still undrawable. It may only shrink, and R5 deletes it.

**Tech Stack:** TypeScript, glTF-Transform 4, Blender 5.0.1 headless (M0's `tools/models/blender/run.ts`), three.js (WebGPU), Zod 3, Vitest in Node, and Playwright Tier 2 on the Windows desktop's RX 6700 XT.

**Spec:** `docs/superpowers/specs/2026-09-26-model-roster-design.md`. Read it all, especially §4.1, §4.3, §5 and §7. The M0 handoff (`docs/handoff/2026-09-26-m0-blender-kit.md`) lists the Blender traps.

## Mark's decisions for this plan (2026-09-26, recorded here as given)

- **Name.** This is **R1**, the model-roster spec's "M1". The roster's plans are renamed R0–R5, because the missions track already has a finished M1, the mission engine. R0 is the M0 plan and handoff, which keep their file names. The spec and the master spec's §15 row carry the new names.
- **Where it runs:** its own git worktree, on branch `worktree-r1-roster`. Pushing the branch is fine. **Merging to `main` needs Mark's OK.** Never merge or push `main`.
- **Viewing checkpoint:** the final product only. The handoff carries Hangar captures taken on the reference GPU.
- **Attended or unattended:** unattended. Run to completion without stopping.
- **US spelling.**

## Where R1 starts (read on `main` at `76f93c8`, 2026-09-26)

Every claim below was read from code on 2026-09-26. The tasks depend on them.

- **The manifest** (`tools/models/manifest.ts`) has two source kinds in one discriminated union: `sketchfab` (the default for entries without `kind`) and `generated`. Its `superRefine` forbids `input`, `normalize`, `keep` and the other geometry fields to **every non-Sketchfab entry**, in one `else` branch. The output regex allows `content/(aircraft|ships|ordnance)/`, and `content/ordnance/` is generated-only.
- **The build** (`tools/models/build.ts`): `runPipeline` throws for any non-Sketchfab entry. It stamps provenance as `{ source: url, author, license }`, **in that key order**. `TOY_SHA256_BEFORE_O1` in `tests/tools/models/build.test.ts` pins the Sketchfab path's bytes, so the key order must not change. `runBuild` takes an injected `BuildDeps`. `tests/tools/models/shipStages.test.ts:129` builds its own `BuildDeps` literal, so a new required field breaks it.
- **Blender** (M0): `tools/models/blender/run.ts` exports:
  - `BLENDER_VERSION = '5.0.1'`
  - `HAVE_BLENDER`, computed once at import by spawning `blender --version`
  - `blenderPresent(bin)`
  - `runBlenderScript(script, out, args?, bin?, timeoutMs?)`, which asserts the version, deletes `out` first, and throws unless the run exits 0 **and** writes `out`

  `tools/models/blender/hangar.py` builds the barrel-roof hangar at Tacloban's 34 × 42 m footprint. As measured in M0 it has 356 triangles, 3 draw calls, no textures and 18,556 bytes, is byte-identical across runs, and has nodes `hangar_concrete`, `hangar_dark` and `hangar_steel` under a root `hangar`. **ryzen has no Blender**, so Blender tests are named skips there.
- **The Library** (`src/render/hangar/library.ts`): `LIBRARY_KINDS = ['aircraft', 'ship', 'building', 'ordnance']`. `catalog.ts`'s `subjectFor` returns `null` ("Not yet in service") for an entry with no `spec`. `models.ts`'s `loadHangarModel(entry, loadAirframe, loadShip, loadStore)` returns `null` for a null subject. The panel labels those entries "(not yet in service)" (`panel.ts:76`, `:92`).
- **Library entries**:
  - With a spec (11): 3 aircraft (`f4f-wildcat`, `f6f-hellcat`, `a6m-zero`), 3 ships (`essex-cv`, `fletcher-dd`, `type-b-maru`), 3 buildings (`hangar`, `tower`, `aaa`, all procedural boxes via `drawBuilding`) and 2 ordnance.
  - Without one (23): 9 aircraft, 7 ships and 7 buildings.
  - GAMEPLAY.md's "Vehicle roster" lists two vehicles with no entry: "Type 97 Chi-Ha medium tank" and "Willys MB jeep".
- **Registries.** `AIRFRAME_MODELS` in `src/render/scene/airframes.ts` has `wildcat` only. `SHIP_MODELS` in `src/render/scene/shipModels.ts` has the three S1 ships. Nothing registers a building or vehicle model.
- **The Hangar page** (`src/render/hangar/main.ts`) selects the first entry with a subject. `__hangar.entries()` returns the ids with a subject, and Tier 2's `tests/e2e/hangar.spec.ts` iterates exactly that list, so a newly drawable entry is picked up automatically.
- **The budget readout** (`budgets.ts`) counts only subtrees the model cache tagged with `userData.modelUrl`, and matches them to a manifest entry by output path. Anything loaded through `acquireModel` gets its budget line for free.
- **Credits** (`src/render/modelCredits.ts`) list CC-BY entries only. A `blender` entry (AGPL) is skipped with no change.
- **`copyContent`** (`vite.config.ts`) copies `content/` wholesale, so a new `content/buildings/` reaches `dist/`.

## Global Constraints

- **Worktree.** Everything happens in `.claude/worktrees/r1-roster` on branch `worktree-r1-roster` (Task 0). `git push -u origin worktree-r1-roster` is allowed. **Never** push, merge into or commit on `main`.
- **Tier 2 slot.** Use a free dev-server slot, `ww2airsim-3.windomlane.org` (port 5174) or `ww2airsim-2.windomlane.org` (port 5175). Check it first with `ss -ltnp | grep -E ':517[45] '`, and read the listener's cwd from `/proc/<pid>/cwd`. Never stop another worktree's server. The `vite.config.ts` edit that points at the slot is local scratch and is never staged.
- **Per-task checks.** Each task ends with:
  - `npx vitest run <the task's test files> --maxWorkers=2; echo "rc=$?"`
  - `npx tsc --noEmit`
  - `npx eslint <touched files> --max-warnings 0`
- **Full runs.** Run `npm run verify` only through `remote-run` (Task 9), capturing `rc=$?` directly. Never pipe a test command into `grep` before reading its exit status.
- **Blender runs on nexus only**, and one at a time. Tests that need it run on nexus by name: `npx vitest run tests/tools/models/blender tests/tools/models/blenderEntries.test.ts --maxWorkers=1`.
- **Byte identity.** Nothing already committed changes by a byte:
  - `TOY_SHA256_BEFORE_O1` still holds.
  - The generated identity block in `tests/tools/models/generatedModels.test.ts` still passes.
  - `content/aircraft/wildcat.glb` stays frozen.
  - No existing glb is rebuilt.
- **No game change.** `src/sim/**` is untouched. No `content/aircraft`, `content/ships` or `content/scenarios` file changes. The airfields keep their procedural boxes in the game (spec §6.3); only the Hangar draws the Blender hangar.
- **Never run `git clean -fdx`** (CLAUDE.md).
- **US spelling** in prose and identifiers. Escape `|` as `\|` inside markdown table cells.

## Review Focus

1. **A host with no Blender** (ryzen, or any clone without it). A bare `models:build` skips each `blender` entry and says why. `models:build -- <id>` exits 1 and writes nothing. The committed-output tests still run there, and only the rebuild test is a named skip. Pinned in Task 2 and Task 3.
2. **A Blender script that raises, or the wrong Blender version.** That entry is `FAILED`, nothing is written, and the committed glb is untouched. The other entries still build. Pinned in Task 2.
3. **A Library `model` that names nothing, or names a model of another kind.** Tier 1 fails, naming the entry and the id. Pinned in Task 5 (schema, kind mismatch) and Task 7 (resolution, with negative cases).
4. **An aircraft model with no spec.** It stands on the pad by its own bounds, hangs no stores, and never throws. Pinned in Task 6. It also gets no Cycle button, because `main.ts` offers Cycle only for an entry whose subject is an aircraft spec, and Task 6 leaves that line unchanged.
5. **An entry with both a spec and a model** (the hangar after Task 5). The Hangar draws the model, the card still shows the spec's figures, and the game still draws the spec's procedural boxes. Pinned in Task 6. Task 9's untouched-game check confirms the game side.

---

### Task 0: Worktree, slot and ledger (setup, no commit)

**Files:**
- Create: `.superpowers/sdd/r1/progress.md` (gitignored)

- [ ] **Step 1: Create the worktree.** From `/home/mark/projects/ww2airsim`:
  ```bash
  git worktree add -b worktree-r1-roster .claude/worktrees/r1-roster main
  cd .claude/worktrees/r1-roster && npm ci
  ```
  All later paths are relative to the worktree.

- [ ] **Step 2: Gitignored data the worktree lacks.** Link the terrain tiles and caches from the main checkout, read-only by convention:
  ```bash
  ln -s /home/mark/projects/ww2airsim/content/terrain/tiles content/terrain/tiles
  mkdir -p tools/terrain && ln -s /home/mark/projects/ww2airsim/tools/terrain/cache tools/terrain/cache
  mkdir -p tools/textures && ln -s /home/mark/projects/ww2airsim/tools/textures/cache tools/textures/cache
  head -c 60 content/terrain/L0.bin | grep -q "git-lfs" && echo "L0.bin is an LFS pointer: run git lfs pull" || echo "L0.bin ok"
  blender --version | head -1
  ```
  Expected: `L0.bin ok` and `Blender 5.0.1`. The textures cache link is what lets O1's generated byte-identity block run here instead of skipping.

- [ ] **Step 3: The ledger.** Create `.superpowers/sdd/r1/progress.md`. Its header names this plan, the branch, "unattended, final-product checkpoint", and the Tier 2 slot once Task 8 picks one. Append one line per completed task, and a `Ruling:` line for every departure from this plan.

- [ ] **Step 4: Baseline.**
  ```bash
  npx vitest run tests/tools/models tests/render/hangar tests/render/airframes.test.ts tests/render/shipModels.test.ts --maxWorkers=2; echo "rc=$?"
  ```
  Expected `rc=0`. Record the file and test counts in the ledger.

---

### Task 1: The manifest's `blender` source kind and the new output folders

**Files:**
- Modify: `tools/models/manifest.ts`
- Test: `tests/tools/models/manifest.test.ts`

**Interfaces:**
- Produces: `BlenderSource = { kind: 'blender'; script: string; dimensions: string; license: 'AGPL-3.0-or-later' }`. `ModelEntry['source']` now has three kinds. `output` may be `content/(aircraft|ships|ordnance|buildings|vehicles)/<id>.glb`.

- [ ] **Step 1: Write the failing tests.** Append to `tests/tools/models/manifest.test.ts`:
  ```ts
  const blender = {
    id: 'test-shed',
    output: 'content/buildings/test-shed.glb',
    source: { kind: 'blender', script: 'tools/models/blender/test-shed.py', dimensions: 'footprint from content/bases/x.json (read 2026-09-26)', license: 'AGPL-3.0-or-later' },
    textures: { maxSize: 512, format: 'webp' },
    budget: { maxBytes: 500_000, maxTriangles: 5000, maxDrawCalls: 4 },
  }

  describe('blender entries (R1, model-roster spec §4.1)', () => {
    it('accepts a blender entry with no input, and keeps the Sketchfab geometry fields open to it', () => {
      const e = parseModelEntry(blender)
      expect(e.source.kind).toBe('blender')
      expect(e.input).toBeUndefined()
      const withStages = parseModelEntry({ ...blender, normalize: valid.normalize, keep: [{ node: 'Prop' }], noseNode: 'Prop' })
      expect(withStages.keep).toHaveLength(1)
    })

    it('accepts content/buildings/ and content/vehicles/ outputs, from any source but generated', () => {
      expect(parseModelEntry({ ...blender, id: 'jeep', output: 'content/vehicles/jeep.glb' }).output).toBe('content/vehicles/jeep.glb')
      expect(parseModelEntry({ ...valid, id: 'tank', output: 'content/vehicles/tank.glb', split: [], remove: [] }).output).toBe('content/vehicles/tank.glb')
    })

    it.each([
      ['an input', { ...blender, input: 'tools/models/cache/test-shed.glb' }, /blender entry takes no input/],
      ['a script outside tools/models/blender/', { ...blender, source: { ...blender.source, script: 'tools/x.py' } }, /script must be tools\/models\/blender/],
      ['the kit module as its script', { ...blender, source: { ...blender.source, script: 'tools/models/blender/kit.py' } }, /kit module/],
      ['the preview module as its script', { ...blender, source: { ...blender.source, script: 'tools/models/blender/preview.py' } }, /kit module/],
      ['a CC license', { ...blender, source: { ...blender.source, license: 'CC-BY-4.0' } }, /license/],
      ['an ordnance output', { ...blender, id: 'b', output: 'content/ordnance/b.glb' }, /content\/ordnance/],
      ['an output folder that does not exist', { ...blender, id: 'p', output: 'content/props/p.glb' }, /output/],
    ])('rejects a blender entry with %s', (_label, raw, message) => {
      expect(() => parseModelEntry(raw)).toThrow(message)
    })

    it('still refuses geometry fields on a generated entry', () => {
      expect(() => parseModelEntry({ ...generated, keep: [{ node: 'A' }] })).toThrow(/takes no keep/)
    })
  })
  ```

- [ ] **Step 2: Run them.** `npx vitest run tests/tools/models/manifest.test.ts --maxWorkers=2`. Expected: FAIL. The union rejects `kind: 'blender'` with an "Invalid discriminator value" message, and the `content/buildings/` output fails the regex.

- [ ] **Step 3: Implement.** In `tools/models/manifest.ts`:
  - Add below `GeneratedSourceSchema`:
    ```ts
    /** An original model authored in Blender (model-roster spec §4.1). The script writes a raw glb
     *  to tools/models/cache/<id>.glb, which then runs the same stages a Sketchfab download does,
     *  so an entry may use normalize, keep, split and the rest. */
    const BlenderSourceSchema = z.object({
      kind: z.literal('blender'),
      script: z.string().regex(/^tools\/models\/blender\/[a-z0-9-]+\.py$/, { message: 'script must be tools/models/blender/<name>.py' }),
      dimensions: z.string().min(1),
      license: z.literal('AGPL-3.0-or-later'),
    }).strict()
    ```
  - In `SourceSchema`, set the union to `[SketchfabSourceSchema, GeneratedSourceSchema, BlenderSourceSchema]`. Below the existing exports, add `export type BlenderSource = z.infer<typeof BlenderSourceSchema>`.
  - Replace the `output` field and its comment:
    ```ts
    /** Committed. Aircraft to content/aircraft/, ships to content/ships/, ordnance to
     *  content/ordnance/ (generated only), and the Library-only buildings and vehicles to
     *  content/buildings/ and content/vehicles/ (R1). */
    output: z.string().regex(/^content\/(aircraft|ships|ordnance|buildings|vehicles)\/[a-z0-9-]+\.glb$/),
    ```
  - In `superRefine`, replace the `if (e.source.kind === 'sketchfab') { … } else { … }` block with:
    ```ts
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
    ```

- [ ] **Step 4: Run, check, commit.** Run `npx vitest run tests/tools/models --maxWorkers=2; echo "rc=$?"`. Expected `rc=0`, including "parses every committed Sketchfab entry exactly as before O1". Then run `npx tsc --noEmit`. It should be clean, because `build.ts` narrows on `kind === 'sketchfab'` and `'generated'`. If it reports errors in `tools/models/build.ts`, leave them for Task 2 and note them in the ledger. Fix any error anywhere else here. Then:
  ```bash
  npx eslint tools/models/manifest.ts tests/tools/models/manifest.test.ts --max-warnings 0
  git add tools/models/manifest.ts tests/tools/models/manifest.test.ts
  git commit -m "R1: manifest source.kind 'blender' and the content/buildings, content/vehicles output folders"
  ```

---

### Task 2: The build runs a Blender entry through the Sketchfab stages

**Files:**
- Modify: `tools/models/build.ts`
- Modify: `tests/tools/models/build.test.ts`
- Modify: `tests/tools/models/shipStages.test.ts:129-136` (its `BuildDeps` literal)

**Interfaces:**
- Consumes: `BlenderSource` (Task 1), and from `run.ts`: `runBlenderScript`, `blenderPresent` and `BLENDER_VERSION`.
- Produces:
  - `blenderIntermediate(id: string): string`, which returns `tools/models/cache/<id>.glb`.
  - `BuildDeps` gains `haveBlender(): boolean` and `blender(script: string, out: string): void`.
  - `nodeBuildDeps(): BuildDeps`, the real file-system deps. `main` uses it, and so does Task 3's rebuild test.
  - `runPipeline` accepts `sketchfab` and `blender` entries.

- [ ] **Step 1: Write the failing tests.** In `tests/tools/models/build.test.ts`:
  - Add `blenderIntermediate` to the import from `build.js`.
  - Replace `fakeDeps` with the version below. It adds `reads`, `blenderRuns` and a `haveBlender` switch.
  - Append the new `describe` block.
  ```ts
  function fakeDeps(present: string[], haveBlender = true) {
    const lines: string[] = [], written: string[] = [], generated: string[] = [], reads: string[] = [], blenderRuns: string[] = []
    const deps: BuildDeps = {
      exists: (p) => present.includes(p),
      read: async (p) => { reads.push(p); return toyPlane() },
      write: (p) => { written.push(p) },
      encode: (doc) => modelIO().writeBinary(doc),
      log: (l) => { lines.push(l) },
      generate: async () => { generated.push('called'); return toyBomb() },
      haveBlender: () => haveBlender,
      blender: (script, out) => { blenderRuns.push(`${script} -> ${out}`) },
    }
    return { deps, lines, written, generated, reads, blenderRuns }
  }
  ```
  ```ts
  const shedEntry = parseModelEntry({
    id: 'toy-shed', output: 'content/buildings/toy-shed.glb',
    source: { kind: 'blender', script: 'tools/models/blender/toy-shed.py', dimensions: 'test figures', license: 'AGPL-3.0-or-later' },
    textures: { maxSize: 512, format: 'webp' },
    budget: { maxBytes: 100_000, maxTriangles: 100, maxDrawCalls: 3 },
  })

  describe('blender entries in the build (R1)', () => {
    it('runs the script into tools/models/cache/<id>.glb, reads that file, and writes the output with its provenance', async () => {
      const f = fakeDeps([])
      expect(await runBuild([shedEntry], ['toy-shed'], f.deps)).toBe(0)
      expect(blenderIntermediate('toy-shed')).toBe('tools/models/cache/toy-shed.glb')
      expect(f.blenderRuns).toEqual(['tools/models/blender/toy-shed.py -> tools/models/cache/toy-shed.glb'])
      expect(f.reads).toEqual(['tools/models/cache/toy-shed.glb'])
      expect(f.written).toEqual(['content/buildings/toy-shed.glb'])
      const doc = await runPipeline(toyPlane(), shedEntry)
      expect(doc.getRoot().getAsset().extras).toMatchObject({ source: 'blender', script: 'tools/models/blender/toy-shed.py', dimensions: 'test figures', license: 'AGPL-3.0-or-later' })
    })

    it('with no Blender: a bare build skips it by name, an explicit one exits 1, and neither runs or writes anything', async () => {
      const bare = fakeDeps([], false)
      expect(await runBuild([shedEntry], [], bare.deps)).toBe(0)
      expect(bare.lines).toEqual(['skipped toy-shed: no blender on PATH; build it on a host with Blender 5.0.1 (nexus)'])
      const explicit = fakeDeps([], false)
      expect(await runBuild([shedEntry], ['toy-shed'], explicit.deps)).toBe(1)
      expect(explicit.lines[0]).toMatch(/^missing toy-shed: no blender on PATH/)
      expect([...bare.blenderRuns, ...explicit.blenderRuns, ...bare.written, ...explicit.written]).toEqual([])
    })

    it('a script that fails (a raise, or the wrong Blender) fails that entry by name, writes nothing, and the rest still build', async () => {
      const f = fakeDeps([entry.input!])
      f.deps.blender = () => { throw new Error('blender 4.2.3 found; models need exactly 5.0.1') }
      expect(await runBuild([shedEntry, entry], ['toy-shed', 'toy'], f.deps)).toBe(1)
      expect(f.lines[0]).toBe('FAILED toy-shed, nothing written: blender 4.2.3 found; models need exactly 5.0.1')
      expect(f.written).toEqual(['content/aircraft/toy.glb'])
    })

    it('Sketchfab and generated builds never run Blender', async () => {
      const f = fakeDeps([entry.input!])
      expect(await runBuild([entry, genEntry], ['toy', 'toy-bomb'], f.deps)).toBe(0)
      expect(f.blenderRuns).toEqual([])
    })
  })
  ```

- [ ] **Step 2: Run them.** `npx vitest run tests/tools/models/build.test.ts --maxWorkers=2`. Expected: FAIL. `blenderIntermediate` does not exist, and `tsc` rejects the two new `BuildDeps` fields.

- [ ] **Step 3: Implement.** In `tools/models/build.ts`:
  - Add to the imports:
    ```ts
    import { BLENDER_VERSION, blenderPresent, runBlenderScript } from './blender/run.js'
    import type { BlenderSource, SketchfabSource } from './manifest.js'
    ```
  - Below `partNames`, add:
    ```ts
    /** Where a blender entry's raw glb lands before the stages run (gitignored by /tools/**\/cache/). */
    export function blenderIntermediate(id: string): string {
      return `tools/models/cache/${id}.glb`
    }

    /** What travels inside the output file (checked by tests/tools/models/outputs.test.ts). The
     *  Sketchfab keys stay in their pre-R1 order: TOY_SHA256_BEFORE_O1 pins the bytes. */
    function provenance(s: SketchfabSource | BlenderSource): Record<string, string> {
      return s.kind === 'sketchfab'
        ? { source: s.url, author: s.author, license: s.license }
        : { source: 'blender', script: s.script, dimensions: s.dimensions, license: s.license }
    }
    ```
  - In `runPipeline`, replace the first line with:
    ```ts
    if (entry.source.kind === 'generated') throw new Error(`${entry.id}: runPipeline is for Sketchfab and Blender entries; a generated entry goes through finishGenerated`)
    ```
    Replace the provenance line near the end with:
    ```ts
    asset.extras = { ...(asset.extras ?? {}), ...provenance(entry.source) }
    ```
  - In `BuildDeps`, add:
    ```ts
    /** Whether a `blender` executable is on PATH (run.ts's blenderPresent). */
    haveBlender(): boolean
    /** Runs one Blender model script into `out` (run.ts's runBlenderScript). Throws on any failure. */
    blender(script: string, out: string): void
    ```
  - In `runBuild`, directly after the Sketchfab missing-input `if` block, add:
    ```ts
    if (entry.source.kind === 'blender' && !deps.haveBlender()) {
      deps.log(`${explicit ? 'missing' : 'skipped'} ${entry.id}: no blender on PATH; build it on a host with Blender ${BLENDER_VERSION} (nexus)`)
      if (explicit) failed = true
      continue
    }
    ```
    Replace the `doc = …` expression inside the `try` with:
    ```ts
    const source = entry.source
    if (source.kind === 'generated') {
      doc = await finishGenerated(await deps.generate(source.generator), entry)
    } else if (source.kind === 'blender') {
      // Blender runs are serial (spec §4.1): this loop awaits each entry before the next.
      deps.blender(source.script, blenderIntermediate(entry.id))
      doc = await runPipeline(await deps.read(blenderIntermediate(entry.id)), entry)
    } else {
      doc = await runPipeline(await deps.read(entry.input!), entry)
    }
    ```
  - Replace the `if (process.argv[1] === …)` block with:
    ```ts
    /** The real deps: the disk, the glTF writer, the generator registry and Blender. */
    export function nodeBuildDeps(): BuildDeps {
      const io = modelIO()
      return {
        exists: existsSync,
        read: async (p) => io.readBinary(new Uint8Array(readFileSync(p))),
        write: (p, bytes) => writeFileSync(p, bytes),
        encode: (doc) => io.writeBinary(doc),
        log: (line) => console.log(line),
        generate: async (g) => { const run = GENERATORS[g]; if (!run) throw new Error(`no generator registered for ${g} in tools/models/generated/registry.ts`); return run() },
        haveBlender: () => blenderPresent(),
        blender: (script, out) => runBlenderScript(script, out),
      }
    }

    if (process.argv[1] === fileURLToPath(import.meta.url)) {
      process.exit(await runBuild(loadModelEntries(), process.argv.slice(2), nodeBuildDeps()))
    }
    ```
  - Update the file's header comment. The first line becomes "raw download, a generator or a Blender script -> committed glb in content/aircraft/, ships/, ordnance/, buildings/ or vehicles/". Add a sentence: "A blender entry is skipped, and named, where no Blender is on PATH."
  - In `tests/tools/models/shipStages.test.ts`, add these two fields to the `BuildDeps` literal at line 129:
    ```ts
    haveBlender: () => false,
    blender: () => { throw new Error('not a blender entry') },
    ```

- [ ] **Step 4: Run, check, commit.**
  ```bash
  npx vitest run tests/tools/models --maxWorkers=2; echo "rc=$?"
  ```
  Expected `rc=0`. It must include "writes the synthetic airplane byte-identically to before O1", and the generated identity block must **not** be skipped (Task 0 linked the textures cache). Then run `npx tsc --noEmit` (now clean) and:
  ```bash
  npx eslint tools/models/build.ts tests/tools/models/build.test.ts tests/tools/models/shipStages.test.ts --max-warnings 0
  git add tools/models/build.ts tests/tools/models/build.test.ts tests/tools/models/shipStages.test.ts
  git commit -m "R1: models:build runs a blender entry's script into the cache, then the Sketchfab stages; skipped by name without Blender"
  ```

---

### Task 3: The hangar ships as the first Blender model

**Files:**
- Create: `tools/models/entries/hangar.json`
- Create: `content/buildings/hangar.glb` (built)
- Create: `tests/tools/models/blenderEntries.test.ts`
- Modify: `tests/tools/models/outputs.test.ts`
- Modify: `tests/build/dist.test.ts` (after the O1 generated loop)
- Modify: `ASSETS.md` ("3D models" table)
- Modify: `docs/models.md` ("Authoring in Blender")
- Modify: `tools/models/blender/cli.ts` (header comment)

**Interfaces:**
- Consumes: `nodeBuildDeps` and `runBuild` (Task 2), and `HAVE_BLENDER` (run.ts).
- Produces: the manifest entry `hangar`, with output `content/buildings/hangar.glb`. Task 4 registers it.

- [ ] **Step 1: The entry.** Create `tools/models/entries/hangar.json`:
  ```json
  {
    "id": "hangar",
    "output": "content/buildings/hangar.glb",
    "source": {
      "kind": "blender",
      "script": "tools/models/blender/hangar.py",
      "dimensions": "footprint 34 x 42 m from content/bases/tacloban.json, tacloban-hangar-1 (read 2026-09-26); wall height, roof rise and thicknesses are ESTIMATES from src/render/scene/buildings.ts, each labeled in the script's header",
      "license": "AGPL-3.0-or-later"
    },
    "textures": { "maxSize": 512, "format": "webp" },
    "budget": { "maxBytes": 500000, "maxTriangles": 5000, "maxDrawCalls": 4 }
  }
  ```
  The budget is spec §4.4's building row.

- [ ] **Step 2: Write the failing tests.** Create `tests/tools/models/blenderEntries.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest'
  import { createHash } from 'node:crypto'
  import { existsSync, readFileSync } from 'node:fs'
  import { getBounds } from '@gltf-transform/functions'
  import { loadModelEntries } from '../../../tools/models/manifest.js'
  import { nodeBuildDeps, runBuild } from '../../../tools/models/build.js'
  import { HAVE_BLENDER } from '../../../tools/models/blender/run.js'
  import { modelIO } from '../../../tools/models/document.js'

  const blenderEntries = loadModelEntries().filter((e) => e.source.kind === 'blender')
  const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')
  const within1pct = (got: number, want: number, label: string): void => {
    expect(Math.abs(got - want) / want, `${label}: measured ${got}, cited ${want}`).toBeLessThanOrEqual(0.01)
  }

  describe('blender entries (R1)', () => {
    it('there is at least one, and every script exists', () => {
      expect(blenderEntries.map((e) => e.id)).toContain('hangar')
      for (const e of blenderEntries) if (e.source.kind === 'blender') expect(existsSync(e.source.script), e.source.script).toBe(true)
    })

    it("the hangar's committed output fits Tacloban's cited footprint, measured without Blender (spec §7)", async () => {
      const tacloban = JSON.parse(readFileSync('content/bases/tacloban.json', 'utf8')) as { buildings: { id: string; widthM: number; lengthM: number }[] }
      const cited = tacloban.buildings.find((b) => b.id === 'tacloban-hangar-1')!
      const doc = await modelIO().readBinary(new Uint8Array(readFileSync('content/buildings/hangar.glb')))
      const bb = getBounds(doc.getRoot().listScenes()[0]!)
      // The slab is the footprint plus 1 m (hangar.py), and its top is the ground plane.
      within1pct(bb.max[0] - bb.min[0], cited.widthM + 1, 'slab width (x)')
      within1pct(bb.max[2] - bb.min[2], cited.lengthM + 1, 'slab length (z)')
      within1pct(bb.max[1], 5.5 + cited.widthM * 0.25, 'height: wall + rise')
      expect(bb.min[1]).toBeCloseTo(-0.3, 4)
    })
  })

  // A named skip where Blender is absent (ryzen): run on nexus by name (spec §7).
  describe.skipIf(!HAVE_BLENDER)('blender entries rebuild byte-identically to their committed output', () => {
    it.each(blenderEntries.map((e) => [e.id, e] as const))('%s', async (id, entry) => {
      const written = new Map<string, Uint8Array>()
      const deps = { ...nodeBuildDeps(), write: (p: string, b: Uint8Array) => { written.set(p, b) }, log: () => {} }
      expect(await runBuild([entry], [id], deps)).toBe(0)
      expect(sha(written.get(entry.output)!)).toBe(sha(new Uint8Array(readFileSync(entry.output))))
    }, 120_000)
  })
  ```
  In `tests/tools/models/outputs.test.ts`, add a `blender` branch to both existing branches.
  - In "carries its provenance inside the file", before the `else`:
    ```ts
    } else if (entry.source.kind === 'blender') {
      expect(extras).toMatchObject({ source: 'blender', script: entry.source.script, license: 'AGPL-3.0-or-later' })
    ```
  - In the ASSETS.md test, likewise:
    ```ts
    } else if (entry.source.kind === 'blender') {
      expect(row).toContain(entry.source.script)
      expect(row).toContain('AGPL-3.0-or-later')
    ```
  Run `npx vitest run tests/tools/models/blenderEntries.test.ts tests/tools/models/outputs.test.ts --maxWorkers=1`. Expected: FAIL, because `content/buildings/hangar.glb` does not exist.

- [ ] **Step 3: Build it (nexus).** Run `npm run models:build -- hangar; echo "rc=$?"`. Expected `rc=0`, and a log line `built hangar -> content/buildings/hangar.glb: N bytes, T triangles, D draw calls` with T around 356 and D = 3. Then run `npm run models:inspect -- content/buildings/hangar.glb`. Record bytes, triangles, draw calls and bounds in the ledger. If the triangle or draw-call count differs from M0's (356 / 3), write a `Ruling:` explaining why, for example that the join stage merged nodes. Do not change `hangar.py`.

- [ ] **Step 4: ASSETS.md, dist, docs.**
  - `ASSETS.md`: in the "3D models" table, after the `hvar.glb` row, add:
    ```
    | `content/buildings/hangar.glb` | authored in Blender by `tools/models/blender/hangar.py` from the cited footprint in its header (content/bases/tacloban.json); estimates from src/render/scene/buildings.ts, labeled there | authored for this project | AGPL-3.0-or-later |
    ```
  - `tests/build/dist.test.ts`: after the O1 generated loop (the one commented "O1: generated store models reach dist/ whole"), add:
    ```ts
    // R1: Blender models reach dist/ whole (copyContent copies content/buildings/ and content/vehicles/).
    for (const e of loadModelEntries().filter((x) => x.source.kind === 'blender')) {
      expect(statSync(join(outDir, e.output)).size, e.output).toBe(statSync(e.output).size)
    }
    ```
  - `docs/models.md`, "Authoring in Blender": replace the last sentence ("Until M1 adds … or the Hangar.") with:

    > A model ships through the manifest like any other (R1, 2026-09-26). Its entry has `source.kind: "blender"`, a `script`, a `dimensions` citation and `AGPL-3.0-or-later`, and no `input`. `npm run models:build -- <id>` runs the script into `tools/models/cache/<id>.glb`, then runs every stage a download does, so `normalize`, `keep` and `split` work the same way. Build it on nexus: without Blender, `models:build` skips it by name. `tests/tools/models/blenderEntries.test.ts` rebuilds every Blender entry and compares the bytes with the committed file. That check is a named skip on ryzen, so run it on nexus by name. To show the model in the Hangar, see §7 and §8.
  - `tools/models/blender/cli.ts`: in its header comment, replace "M0 only: M1's `blender` source kind moves building into `npm run models:build` (model-roster spec §4.1)." with "For iterating on a candidate. A shipped model builds through `npm run models:build` as a `blender` entry (R1, model-roster spec §4.1)."

- [ ] **Step 5: Run, check, commit.** Run the two test files above plus `tests/tools/models/blender --maxWorkers=1`. Expected `rc=0`, with the rebuild block **run, not skipped**, on nexus. Then:
  ```bash
  npx tsc --noEmit
  npx eslint tests/tools/models/blenderEntries.test.ts tests/tools/models/outputs.test.ts tests/build/dist.test.ts tools/models/blender/cli.ts --max-warnings 0
  git add tools/models/entries/hangar.json content/buildings/hangar.glb tests/tools/models/blenderEntries.test.ts tests/tools/models/outputs.test.ts tests/build/dist.test.ts ASSETS.md docs/models.md tools/models/blender/cli.ts
  git commit -m "R1: the barrel-roof hangar ships as content/buildings/hangar.glb, the first Blender model; byte-identical rebuild and cited-footprint checks"
  ```
  `tests/build/dist.test.ts` runs a full Vite build, so leave it to Task 9's `remote-run`.

---

### Task 4: The static-model registry for buildings and vehicles

**Files:**
- Create: `src/render/scene/staticModels.ts`
- Modify: `src/render/content.ts` (after `ordnanceModelUrl`)
- Test: `tests/render/staticModels.test.ts`

**Interfaces:**
- Produces:
  - `StaticModelKind = 'building' | 'vehicle'`
  - `staticModelPath(kind, id)`, which returns `content/buildings/<id>.glb` or `content/vehicles/<id>.glb`
  - `staticModelUrl(kind, id)`
  - `STATIC_MODELS: Record<StaticModelKind, Record<string, { url: string }>>`
  - `staticModelUrlFor(kind, id): string`, which throws on an unknown id

- [ ] **Step 1: Write the failing test.** Create `tests/render/staticModels.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest'
  import { existsSync } from 'node:fs'
  import { STATIC_MODELS, staticModelUrlFor } from '../../src/render/scene/staticModels.js'
  import { staticModelPath, staticModelUrl } from '../../src/render/content.js'
  import { loadModelEntries } from '../../tools/models/manifest.js'

  const entries = loadModelEntries()

  describe('the static-model registry (model-roster spec §4.3)', () => {
    it('every registered id has its manifest entry, writing to its own folder, and its committed glb', () => {
      for (const kind of ['building', 'vehicle'] as const) {
        for (const [id, { url }] of Object.entries(STATIC_MODELS[kind])) {
          const entry = entries.find((e) => e.id === id)
          expect(entry?.output, `${kind} ${id}`).toBe(staticModelPath(kind, id))
          expect(existsSync(staticModelPath(kind, id)), staticModelPath(kind, id)).toBe(true)
          expect(url).toBe(staticModelUrl(kind, id))
        }
      }
    })

    it('registers the hangar', () => {
      expect(staticModelUrlFor('building', 'hangar')).toBe(staticModelUrl('building', 'hangar'))
      expect(staticModelPath('vehicle', 'willys-mb-jeep')).toBe('content/vehicles/willys-mb-jeep.glb')
    })

    it('an unregistered or prototype-named id throws, naming the kind and the registry', () => {
      expect(() => staticModelUrlFor('building', 'nope')).toThrow(/no building model "nope" \(registered: hangar\)/)
      expect(() => staticModelUrlFor('vehicle', 'constructor')).toThrow(/no vehicle model "constructor" \(registered: none\)/)
    })
  })
  ```
  Run it. Expected: FAIL, because the module does not exist.

- [ ] **Step 2: Implement.** In `src/render/content.ts`, after `ordnanceModelUrl`:
  ```ts
  /** R1: a Library-only building or vehicle model (model-roster spec §4.3). */
  export const staticModelPath = (kind: 'building' | 'vehicle', id: string): string => `content/${kind}s/${id}.glb`
  export const staticModelUrl = (kind: 'building' | 'vehicle', id: string): string => `${import.meta.env.BASE_URL}${staticModelPath(kind, id)}`
  ```
  Create `src/render/scene/staticModels.ts`:
  ```ts
  import { staticModelUrl } from '../content.js'

  export type StaticModelKind = 'building' | 'vehicle'

  /**
   * Model id to committed glb, for the kinds with no sim module (model-roster spec §4.3): buildings
   * and vehicles, which the Hangar draws and the game does not (spec §6.3). The twin of
   * shipModels.ts's SHIP_MODELS. Each id equals its manifest entry's id;
   * tests/render/staticModels.test.ts checks that every id here has its entry and its committed glb.
   */
  export const STATIC_MODELS: Readonly<Record<StaticModelKind, Readonly<Record<string, { readonly url: string }>>>> = {
    building: {
      hangar: { url: staticModelUrl('building', 'hangar') },
    },
    vehicle: {},
  }

  export function staticModelUrlFor(kind: StaticModelKind, id: string): string {
    const table = STATIC_MODELS[kind]
    if (!Object.hasOwn(table, id)) {
      throw new Error(`no ${kind} model "${id}" (registered: ${Object.keys(table).join(', ') || 'none'}); register it in src/render/scene/staticModels.ts`)
    }
    return table[id]!.url
  }
  ```

- [ ] **Step 3: Run, check, commit.**
  ```bash
  npx vitest run tests/render/staticModels.test.ts --maxWorkers=2; echo "rc=$?"
  npx tsc --noEmit
  npx eslint src/render/scene/staticModels.ts src/render/content.ts tests/render/staticModels.test.ts --max-warnings 0
  git add src/render/scene/staticModels.ts src/render/content.ts tests/render/staticModels.test.ts
  git commit -m "R1: static-model registry for Library-only buildings and vehicles; the hangar registered"
  ```

---

### Task 5: The Library's `model` field, the `vehicle` kind and the two vehicle entries

**Files:**
- Modify: `src/render/hangar/library.ts`
- Modify: `src/render/hangar/panel.ts:14` (`KIND_LABEL`)
- Modify: `content/library/hangar.json` (adds `model`)
- Create: `content/library/type97-chi-ha.json`, `content/library/willys-mb-jeep.json`
- Test: `tests/render/hangar/library.test.ts`

**Interfaces:**
- Produces:
  - `LIBRARY_KINDS = ['aircraft', 'ship', 'building', 'vehicle', 'ordnance']`
  - `MODEL_KINDS = ['aircraft', 'ship', 'building', 'vehicle']` and `type ModelKind`
  - `interface ModelRef { readonly kind: ModelKind; readonly id: string }`
  - `LibraryEntry.model?: ModelRef`

- [ ] **Step 1: Write the failing tests.** In `tests/render/hangar/library.test.ts`:
  - In test 4 ("every row of GAMEPLAY.md's … rosters has an entry"), after the ordnance line, add:
    ```ts
    for (const row of rosterColumn(gameplay, 'Vehicle roster')) expect(named('vehicle'), row).toContain(row)
    ```
  - Rename the test to "every row of GAMEPLAY.md's aircraft, ship, building, ordnance and vehicle rosters has an entry".
  - In `describe('LibraryEntrySchema')`, add these rows to the `it.each` table:
    ```ts
    ['a model of another kind', { ...valid, model: { kind: 'aircraft', id: 'wildcat' } }, /entry's own kind "ship"/],
    ['a model with an unknown kind', { ...valid, model: { kind: 'tank', id: 'x' } }, /model/],
    ['a vehicle with a spec', { ...valid, kind: 'vehicle', spec: 'jeep' }, /no vehicle is in the sim/],
    ['a model on an ordnance entry', { ...valid, kind: 'ordnance', spec: 'an-m65', model: { kind: 'building', id: 'hangar' } }, /entry's own kind "ordnance"/],
    ```
  - Add a test:
    ```ts
    it('accepts a model of its own kind, with or without a spec', () => {
      expect(parseLibraryEntry({ ...valid, model: { kind: 'ship', id: 'essex-cv' } }).model).toEqual({ kind: 'ship', id: 'essex-cv' })
      expect(parseLibraryEntry({ ...valid, kind: 'vehicle', model: { kind: 'vehicle', id: 'jeep' } }).kind).toBe('vehicle')
    })
    ```
  Run the file. Expected: FAIL. The schema does not know `model` or `vehicle`, and test 4 finds no vehicle entries.

- [ ] **Step 2: Implement the schema.** In `src/render/hangar/library.ts`:
  - Replace `LIBRARY_KINDS` and add the model kinds below it:
    ```ts
    export const LIBRARY_KINDS = ['aircraft', 'ship', 'building', 'vehicle', 'ordnance'] as const
    export type LibraryKind = (typeof LIBRARY_KINDS)[number]
    /** The kinds that can carry their own model (model-roster spec §4.3). Ordnance draws its store
     *  model by its spec (O1), so it takes none. */
    export const MODEL_KINDS = ['aircraft', 'ship', 'building', 'vehicle'] as const
    export type ModelKind = (typeof MODEL_KINDS)[number]
    export interface ModelRef { readonly kind: ModelKind; readonly id: string }
    ```
  - In `LibraryEntrySchema`, after `spec`, add:
    ```ts
    /** A model the Hangar draws for this entry, in place of the spec's `view.model` (model-roster
     *  spec §4.3). With no `spec`, the entry is drawn but is "not in the game yet". The id resolves
     *  in AIRFRAME_MODELS, SHIP_MODELS or STATIC_MODELS by kind (tests/render/hangar/roster.test.ts). */
    model: z.object({ kind: z.enum(MODEL_KINDS), id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/) }).strict().optional(),
    ```
  - Update `spec`'s comment to: "Sim spec id: an aircraft or ship id, a building `kind`, or a store type id (ordnance). A vehicle never has one. Absent and no `model` = "Not yet in service" (§4.3)."
  - In `superRefine`, after the history check, add:
    ```ts
    if (e.model !== undefined && e.model.kind !== e.kind) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['model', 'kind'], message: `must be the entry's own kind "${e.kind}"` })
    if (e.kind === 'vehicle' && e.spec !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['spec'], message: 'no vehicle is in the sim: a vehicle entry takes no spec' })
    ```
    Zod runs `superRefine` only after the object parses. So the "unknown kind" row fails at the enum, and its message matches `/model/`, while the "model of another kind" row parses and then fails in the refinement.
  - In `panel.ts:14`, add `vehicle: 'Vehicles'` to `KIND_LABEL`, between `building` and `ordnance`.

- [ ] **Step 3: The content.**
  - In `content/library/hangar.json`, add `"model": { "kind": "building", "id": "hangar" }` after `"spec": "hangar",`. Leave the blurb and history alone. The history's "The hangars in this game are generic" stays true.
  - Create `content/library/type97-chi-ha.json`:
    ```json
    {
      "id": "type97-chi-ha",
      "name": "Type 97 Chi-Ha medium tank",
      "kind": "vehicle",
      "side": "japanese",
      "blurb": "An Imperial Japanese Army medium tank, listed as a future ground target. It is not in the game yet.",
      "history": "The Type 97 Chi-Ha was a medium tank of the Imperial Japanese Army, built from 1938 to 1943 by Mitsubishi Heavy Industries and Hitachi, with some built at the Army's Sagami Arsenal. It had a four-man crew, a short 57 mm gun and an air-cooled V-12 diesel engine. The improved Shinhoto Chi-Ha carried a new turret with a 47 mm gun.\n\nChi-Ha tanks fought in Malaya and at Singapore in 1941 and 1942, on Corregidor in the Philippines, and later on Saipan and Guam, where the 9th Tank Regiment's Type 97s made a large counterattack on Saipan in 1944.",
      "sources": [
        { "title": "Type 97 Chi-Ha", "url": "https://en.wikipedia.org/wiki/Type_97_Chi-Ha", "read": "2026-09-26" }
      ]
    }
    ```
  - Create `content/library/willys-mb-jeep.json`:
    ```json
    {
      "id": "willys-mb-jeep",
      "name": "Willys MB jeep",
      "kind": "vehicle",
      "side": "allied",
      "blurb": "The U.S. Army's small four-wheel-drive truck, listed as friendly airfield scenery. It is not in the game yet.",
      "history": "The Willys MB, officially the U.S. Army Truck, 1/4-ton, 4x4, Command Reconnaissance, was built from 1941 to 1945. Willys-Overland built it as the MB and Ford built it to the same design as the GPW, more than 359,000 and 277,000 respectively. It was powered by Willys' four-cylinder \"Go Devil\" engine.\n\nThe jeep served in every theater of the Second World War and again in Korea.",
      "sources": [
        { "title": "Willys MB", "url": "https://en.wikipedia.org/wiki/Willys_MB", "read": "2026-09-26" }
      ]
    }
    ```
  - Both histories were checked against their sources on 2026-09-26, when this plan was written. If a later reading of a source does not support a sentence, correct the sentence, set that source's `read` to the date of reading, and write a `Ruling:` line.
  - Both entries' `name` fields equal GAMEPLAY.md's Vehicle roster rows exactly, so neither needs a `rosterName`.

- [ ] **Step 4: Run, check, commit.**
  ```bash
  npx vitest run tests/render/hangar --maxWorkers=2; echo "rc=$?"
  ```
  Expected `rc=0`. The catalog test "aircraft then ships then buildings" still holds. Vehicles sort after buildings and before ordnance, and "ordnance sorts last" still holds. Then:
  ```bash
  npx tsc --noEmit
  npx eslint src/render/hangar/library.ts src/render/hangar/panel.ts tests/render/hangar/library.test.ts --max-warnings 0
  git add src/render/hangar/library.ts src/render/hangar/panel.ts content/library/hangar.json content/library/type97-chi-ha.json content/library/willys-mb-jeep.json tests/render/hangar/library.test.ts
  git commit -m "R1: Library entries may name their own model; a vehicle kind with the Chi-Ha and the jeep; the hangar entry names its Blender model"
  ```

---

### Task 6: The Hangar draws an entry's own model

**Files:**
- Modify: `src/render/hangar/catalog.ts`
- Modify: `src/render/hangar/models.ts`
- Modify: `src/render/hangar/panel.ts` (lines 76 and 92)
- Modify: `src/render/hangar/main.ts` (`select`, `entries`, `first`)
- Modify: `src/render/hangar/hooks.ts` (the `entries` doc comment)
- Modify: `src/render/hangar/stats.ts:47` (doc comment only)
- Test: `tests/render/hangar/catalog.test.ts`, `tests/render/hangar/models.test.ts`

**Interfaces:**
- Consumes: `ModelRef` (Task 5), `staticModelUrlFor` (Task 4), and `shipModelUrlFor` (existing).
- Produces:
  - `type Availability = 'in-game' | 'display-only' | 'not-drawn'`
  - `availability(e: CatalogEntry): Availability`
  - `drawable(e: CatalogEntry): boolean`
  - `listLabel(e: CatalogEntry): string`
  - `statusNote(e: CatalogEntry): string | null`
  - `displayModelUrl(ref: ModelRef): string`
  - `type LoadDisplay = (ref: ModelRef) => Promise<ModelInstance>`
  - `loadHangarModel` gains a fifth parameter, `loadDisplay: LoadDisplay`

- [ ] **Step 1: Write the failing tests.**
  - In `tests/render/hangar/catalog.test.ts`, add `availability, drawable, listLabel, statusNote` to the catalog import. Then append:
    ```ts
    describe('availability (R1, model-roster spec §4.3)', () => {
      const c = nodeHangarContent()
      const corsair = c.library.find((e) => e.id === 'f4u-corsair')!
      const withModel = { ...c, library: [...c.library.filter((e) => e.id !== 'f4u-corsair'), { ...corsair, model: { kind: 'aircraft' as const, id: 'wildcat' } }] }
      const cat = buildCatalog(withModel)
      const get = (id: string) => cat.find((e) => e.library.id === id)!

      it('a spec is in the game, a model alone is display-only, neither is not drawn', () => {
        expect(availability(get('f4f-wildcat'))).toBe('in-game')
        expect(availability(get('hangar'))).toBe('in-game') // a spec and a model: still in the game
        expect(availability(get('f4u-corsair'))).toBe('display-only')
        expect(availability(get('b-17-flying-fortress'))).toBe('not-drawn')
        expect([get('f4u-corsair'), get('b-17-flying-fortress')].map(drawable)).toEqual([true, false])
      })

      it('labels the list and the card by availability', () => {
        expect(listLabel(get('f4f-wildcat'))).toBe(get('f4f-wildcat').library.name)
        expect(listLabel(get('f4u-corsair'))).toBe(`${corsair.name} (not in the game yet)`)
        expect(listLabel(get('b-17-flying-fortress'))).toMatch(/ \(not yet in service\)$/)
        expect([statusNote(get('f4f-wildcat')), statusNote(get('f4u-corsair')), statusNote(get('b-17-flying-fortress'))])
          .toEqual([null, 'Not in the game yet', 'Not yet in service'])
      })

      it('sorts in the game, then display-only, then not drawn, within a kind', () => {
        const aircraft = cat.filter((e) => e.library.kind === 'aircraft').map(availability)
        const rank = { 'in-game': 0, 'display-only': 1, 'not-drawn': 2 }
        expect(aircraft.map((a) => rank[a])).toEqual([...aircraft.map((a) => rank[a])].sort((x, y) => x - y))
        expect(aircraft).toContain('display-only')
      })
    })
    ```
  - In `tests/render/hangar/models.test.ts`, add `displayModelUrl` to the models import, and add these imports:
    ```ts
    import { staticModelUrl, shipModelUrl } from '../../../src/render/content.js'
    import type { ModelInstance } from '../../../src/render/models/modelCache.js'
    ```
    Then append:
    ```ts
    describe("an entry's own model (R1)", () => {
      const instance = (h = 5): { inst: ModelInstance; released: () => number } => {
        let n = 0
        const root = new Group()
        root.add(new Mesh(new BoxGeometry(10, h, 10).translate(0, h / 2, 0), new MeshStandardMaterial()))
        return { inst: { root, node: () => root, release: () => { n++ } }, released: () => n }
      }

      it('the hangar, with a spec and a model, draws the model through the display loader, not drawBuilding, and releases it', async () => {
        const seen: unknown[] = []
        const { inst, released } = instance()
        const m = await loadHangarModel(byId('hangar'), undefined, undefined, undefined, async (ref) => { seen.push(ref); return inst })
        expect(seen).toEqual([{ kind: 'building', id: 'hangar' }])
        expect(m!.root).toBe(inst.root) // the display model itself stands on the pad; drawBuilding never ran
        expect(m!.parts).toEqual([])
        m!.dispose()
        expect(released()).toBe(1)
      })

      it('a spec-less aircraft model loads by its id with no stores, stands on the pad by its bounds, and has no mounts', async () => {
        const c = nodeHangarContent()
        const corsair = { ...c.library.find((e) => e.id === 'f4u-corsair')!, model: { kind: 'aircraft' as const, id: 'wildcat' } }
        const entry = buildCatalog({ ...c, library: [corsair] })[0]!
        const asked: [string, unknown][] = []
        const m = await loadHangarModel(entry, async (id, stores) => { asked.push([id, stores]); return createHellcat() })
        expect(asked).toEqual([['wildcat', undefined]])
        expect(new Box3().setFromObject(m!.root).min.y).toBeCloseTo(0, 6)
        expect(m!.mounts()).toEqual([])
        expect(m!.parts.find((p) => p.id === 'prop')!.modeled).toBe(true)
      })

      it('a ship model and a vehicle model go through the display loader too', async () => {
        const c = nodeHangarContent()
        const cruiser = { ...c.library.find((e) => e.id === 'cleveland-cl')!, model: { kind: 'ship' as const, id: 'essex-cv' } }
        const seen: unknown[] = []
        const entry = buildCatalog({ ...c, library: [cruiser] })[0]!
        await loadHangarModel(entry, undefined, undefined, undefined, async (ref) => { seen.push(ref); return instance().inst })
        expect(seen).toEqual([{ kind: 'ship', id: 'essex-cv' }])
      })

      it('displayModelUrl resolves ships and static models through their registries, and refuses an aircraft', () => {
        expect(displayModelUrl({ kind: 'ship', id: 'essex-cv' })).toBe(shipModelUrl('essex-cv'))
        expect(displayModelUrl({ kind: 'building', id: 'hangar' })).toBe(staticModelUrl('building', 'hangar'))
        expect(() => displayModelUrl({ kind: 'building', id: 'nope' })).toThrow(/no building model "nope"/)
        expect(() => displayModelUrl({ kind: 'aircraft', id: 'wildcat' })).toThrow(/airframe registry/)
      })
    })
    ```
    The existing test "'Not yet in service' loads nothing" picks `catalog.find((e) => e.subject === null)`, which is still a not-drawn entry, so it stays as written.

  Run both files. Expected: FAIL, because the new exports do not exist.

- [ ] **Step 2: Implement `catalog.ts`.**
  - Update `CatalogEntry.subject`'s comment to: "null = no sim spec: no figures. Drawable anyway if the entry has its own `model` (R1)."
  - Add below `buildCatalog`'s imports:
    ```ts
    /** How an entry stands in the Library (model-roster spec §4.3). */
    export type Availability = 'in-game' | 'display-only' | 'not-drawn'

    export function availability(e: CatalogEntry): Availability {
      if (e.subject !== null) return 'in-game'
      return e.library.model !== undefined ? 'display-only' : 'not-drawn'
    }

    /** The Hangar can draw it: a spec, or a model of its own. */
    export const drawable = (e: CatalogEntry): boolean => availability(e) !== 'not-drawn'

    const STATUS: Readonly<Record<Availability, string | null>> = {
      'in-game': null,
      'display-only': 'not in the game yet',
      'not-drawn': 'not yet in service',
    }

    /** The list button's text: the name, and the status of anything not in the game. */
    export function listLabel(e: CatalogEntry): string {
      const s = STATUS[availability(e)]
      return s === null ? e.library.name : `${e.library.name} (${s})`
    }

    /** The card's status note, capitalized; null in the game. */
    export function statusNote(e: CatalogEntry): string | null {
      const s = STATUS[availability(e)]
      return s === null ? null : `${s[0]!.toUpperCase()}${s.slice(1)}`
    }

    const AVAILABILITY_RANK: Readonly<Record<Availability, number>> = { 'in-game': 0, 'display-only': 1, 'not-drawn': 2 }
    ```
  - In `buildCatalog`:
    - Change the rank to `[LIBRARY_KINDS.indexOf(e.library.kind), AVAILABILITY_RANK[availability(e)], e.library.name]`.
    - Update its doc to "within a kind, in the game first, then display-only, then not drawn, then by name".
    - Its kinds line becomes "aircraft, ships, buildings, vehicles, ordnance".

- [ ] **Step 3: Implement `models.ts`.**
  - Add imports:
    ```ts
    import type { ModelRef } from './library.js'
    import { shipModelUrlFor } from '../scene/shipModels.js'
    import { staticModelUrlFor } from '../scene/staticModels.js'
    ```
    `loadRegisteredShipView` and `LoadShipView` are already imported from `../scene/shipModels.js`; merge the import lines.
  - Below `loadRegisteredStore`, add:
    ```ts
    /** Loads a ship, building or vehicle model named by an entry's own `model` (R1). */
    export type LoadDisplay = (ref: ModelRef) => Promise<ModelInstance>

    /** The committed glb a display model resolves to, through its kind's registry. */
    export function displayModelUrl(ref: ModelRef): string {
      if (ref.kind === 'ship') return shipModelUrlFor(ref.id)
      if (ref.kind === 'building' || ref.kind === 'vehicle') return staticModelUrlFor(ref.kind, ref.id)
      throw new Error(`displayModelUrl: aircraft model "${ref.id}" loads through the airframe registry, not as a static model`)
    }

    const loadRegisteredDisplay: LoadDisplay = (ref) => acquireModel(displayModelUrl(ref))

    /**
     * An entry's own model (model-roster spec §4.3), drawn in place of the spec's view.model, in the
     * Hangar only. It stands on the pad by its own bounds, not by a spec's gear height, because it is
     * not the model the spec flies, and it hangs no stores. Ships stand at their waterline origin, and
     * buildings and vehicles on their own y = 0 (the Blender kit's frame, spec §4.2).
     */
    async function displayModel(ref: ModelRef, loadAirframe: LoadAirframe, loadDisplay: LoadDisplay): Promise<HangarModel> {
      if (ref.kind === 'aircraft') {
        const model = aircraftModel(await loadAirframe(ref.id, undefined), 0, undefined)
        model.update(0)
        model.root.position.y = -new Box3().setFromObject(model.root).min.y
        return model
      }
      const instance = await loadDisplay(ref)
      return { ...staticModel(instance.root), dispose: () => instance.release() }
    }
    ```
  - Change `loadHangarModel`'s signature to add `loadDisplay: LoadDisplay = loadRegisteredDisplay` as a fifth parameter. Its first lines become:
    ```ts
    if (entry.library.model !== undefined) return displayModel(entry.library.model, loadAirframe, loadDisplay)
    const s = entry.subject
    if (s === null) return null
    ```
  - Extend its doc comment: "An entry's own `model` wins over its spec (R1). null = neither: 'Not yet in service'."

- [ ] **Step 4: Implement the page.**
  - `panel.ts`:
    - Import `listLabel` and `statusNote` from `./catalog.js`.
    - Line 76: `const b = el('button', 'ink-button', listLabel(e))`.
    - Line 92: `` el('div', 'fine-print', `${l.side === 'allied' ? 'Allied' : 'Japanese'} ${l.kind}${statusNote(entry) === null ? '' : ` · ${statusNote(entry)}`}`), ``
  - `main.ts`:
    - Import `drawable` from `./catalog.js`.
    - In `select`, call `loadHangarModel(entry, loadRegisteredAirframe, loadShips)` unchanged; the fifth parameter defaults.
    - `stage.show(model?.root ?? null, drawable(entry) ? entry.library.kind : null)`.
    - In the hooks, `entries: () => catalog.filter(drawable).map((e) => e.library.id)`.
    - `const first = catalog.find(drawable)`.
  - `hooks.ts`: change `entries()`'s comment to "Library ids the Hangar can draw: those with a spec, or with a model of their own (R1)."
  - `stats.ts:47`: change the doc comment to `[] for an entry with no sim spec, including a display-only model (R1).`

- [ ] **Step 5: Run, check, commit.**
  ```bash
  npx vitest run tests/render/hangar --maxWorkers=2; echo "rc=$?"
  ```
  Expected `rc=0`. Then:
  ```bash
  npx tsc --noEmit
  npx eslint src/render/hangar tests/render/hangar --max-warnings 0
  git add src/render/hangar tests/render/hangar/catalog.test.ts tests/render/hangar/models.test.ts
  git commit -m "R1: the Hangar draws an entry's own model (aircraft by the airframe registry, the rest by the display loader); list and card say 'not in the game yet'"
  ```

---

### Task 7: Done is an assertion: the allowlist and model resolution

**Files:**
- Create: `tests/render/hangar/roster.test.ts`

**Interfaces:**
- Consumes: `drawable` (Task 6), `STATIC_MODELS` (Task 4), `AIRFRAME_MODELS`, `SHIP_MODELS` and `loadModelEntries`.

- [ ] **Step 1: Write the test.** Create `tests/render/hangar/roster.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest'
  import { existsSync } from 'node:fs'
  import { buildCatalog, drawable } from '../../../src/render/hangar/catalog.js'
  import type { ModelRef } from '../../../src/render/hangar/library.js'
  import { AIRFRAME_MODELS } from '../../../src/render/scene/airframes.js'
  import { SHIP_MODELS } from '../../../src/render/scene/shipModels.js'
  import { STATIC_MODELS } from '../../../src/render/scene/staticModels.js'
  import { loadModelEntries, type ModelEntry } from '../../../tools/models/manifest.js'
  import { nodeHangarContent } from './content.js'

  /**
   * Library entries the Hangar cannot draw yet (model-roster spec §1: "done is an assertion").
   * Each roster plan removes the entries it models and lowers CEILING to match; R5 deletes both,
   * and this test then asserts none remain. The list may shrink, never grow.
   */
  const NOT_YET_DRAWN = [
    'ammunition-bunker', 'b-17-flying-fortress', 'b-29-superfortress', 'barracks-and-huts',
    'casablanca-cve', 'cleveland-cl', 'coastal-gun-battery', 'd3a-val', 'f4u-corsair',
    'fuel-tank-farm', 'g4m-betty', 'kagero-dd', 'ki-21-sally', 'ki-43-oscar', 'ki-84-frank',
    'mogami-ca', 'p-38-lightning', 'pennsylvania-bb', 'pier-and-warehouses',
    'radio-radar-station', 'revetment', 'shiratsuyu-dd', 'type97-chi-ha', 'willys-mb-jeep',
    'yamato-bb',
  ]
  const CEILING = 25

  const FOLDER: Readonly<Record<ModelRef['kind'], string>> = {
    aircraft: 'content/aircraft/', ship: 'content/ships/', building: 'content/buildings/', vehicle: 'content/vehicles/',
  }

  /** Why `ref` does not resolve to a registered model with its manifest entry and committed glb; null if it does. */
  function refProblem(ref: ModelRef, entries: readonly ModelEntry[]): string | null {
    const registered = ref.kind === 'aircraft' ? Object.hasOwn(AIRFRAME_MODELS, ref.id)
      : ref.kind === 'ship' ? Object.hasOwn(SHIP_MODELS, ref.id)
        : Object.hasOwn(STATIC_MODELS[ref.kind], ref.id)
    if (!registered) return `${ref.kind} model "${ref.id}" is not registered`
    const entry = entries.find((e) => e.id === ref.id)
    if (!entry) return `${ref.kind} model "${ref.id}" has no tools/models/entries/${ref.id}.json`
    if (!entry.output.startsWith(FOLDER[ref.kind])) return `${ref.kind} model "${ref.id}" writes ${entry.output}, not under ${FOLDER[ref.kind]}`
    if (!existsSync(entry.output)) return `${entry.output} is not committed`
    return null
  }

  const content = nodeHangarContent()
  const catalog = buildCatalog(content)
  const entries = loadModelEntries()

  describe('the roster is done when this list is empty (model-roster spec §1)', () => {
    it('exactly the allowlisted entries are the ones the Hangar cannot draw', () => {
      expect(catalog.filter((e) => !drawable(e)).map((e) => e.library.id).sort()).toEqual([...NOT_YET_DRAWN].sort())
    })

    it('the allowlist never grows', () => {
      expect(NOT_YET_DRAWN.length).toBeLessThanOrEqual(CEILING)
    })
  })

  describe("every Library entry's own model resolves (spec §4.3)", () => {
    it.each(content.library.filter((e) => e.model !== undefined).map((e) => [e.id, e.model!] as const))('%s', (_id, ref) => {
      expect(refProblem(ref, entries)).toBeNull()
    })

    it('names what is wrong with a bad reference', () => {
      expect(refProblem({ kind: 'building', id: 'nope' }, entries)).toBe('building model "nope" is not registered')
      expect(refProblem({ kind: 'vehicle', id: 'hangar' }, entries)).toBe('vehicle model "hangar" is not registered')
      expect(refProblem({ kind: 'aircraft', id: 'constructor' }, entries)).toBe('aircraft model "constructor" is not registered')
    })
  })
  ```

- [ ] **Step 2: Run it.** `npx vitest run tests/render/hangar/roster.test.ts --maxWorkers=2; echo "rc=$?"`. Expected `rc=0`, because Tasks 5 and 6 already made this true. **Check that it bites:**
  - Temporarily delete `"model"` from `content/library/hangar.json` and run the file. Expected: it still passes, because the hangar has a spec, so it stays drawable. That confirms availability counts a spec.
  - Temporarily remove `'revetment'` from `NOT_YET_DRAWN`. Expected: FAIL, naming `revetment`.
  - Restore both, confirm the file passes again, and run `git diff content/library/hangar.json` to confirm it matches Task 5's commit. Record both results in the ledger.

- [ ] **Step 3: Check and commit.**
  ```bash
  npx tsc --noEmit
  npx eslint tests/render/hangar/roster.test.ts --max-warnings 0
  git add tests/render/hangar/roster.test.ts
  git commit -m "R1: done is an assertion: the not-yet-drawn allowlist (25, may only shrink) and every Library model reference resolves"
  ```

---

### Task 8: Tier 2 on the reference GPU, and the checkpoint captures

**Files:**
- Modify: `tests/e2e/hangar.spec.ts` (check 10's registered list, and a new check 12)
- Local scratch, **never committed:** `vite.config.ts` (the slot)
- Create: `docs/handoff/<date>-r1-shots/` (captures)

- [ ] **Step 1: Extend the spec.**
  - In check 10, change the registered list to `['f4f-wildcat', 'essex-cv', 'fletcher-dd', 'type-b-maru', 'hangar']`. After that loop, add:
    ```ts
    // R1: the hangar is drawn from its Blender model, not drawBuilding's boxes.
    await select(page, 'hangar')
    expect((await page.evaluate(() => (window as HangarWindow).__hangar!.counts()))?.modelUrl ?? '').toMatch(/content\/buildings\/hangar\.glb$/)
    ```
  - Add, inside `test.describe('the Hangar', …)` after check 11:
    ```ts
    test('12. the list marks exactly the entries it cannot draw, and every other one is drawn (R1)', async ({ page }) => {
      const buttons = page.locator('ul[aria-label="Objects"] button')
      const all = await buttons.count()
      const notDrawn = await buttons.filter({ hasText: '(not yet in service)' }).count()
      const ids = await entries(page)
      expect(all - notDrawn).toBe(ids.length)
      for (const id of ids) await expect(page.locator(`ul[aria-label="Objects"] button[data-id="${id}"]`)).not.toContainText('(not yet in service)')
      expect(notDrawn).toBeGreaterThan(0)
    })
    ```
  - Update the file header's slot sentence to "Run on any free dev-server slot."

- [ ] **Step 2: Serve the worktree on a free slot.** Check which slots are free:
  ```bash
  for p in 5174 5175; do pid=$(ss -ltnp | grep ":$p " | grep -oP 'pid=\K[0-9]+' | head -1); echo "$p ${pid:+busy: $(readlink /proc/$pid/cwd)}"; done
  ```
  Pick a free one: `ww2airsim-3` for 5174, or `ww2airsim-2` for 5175. Edit `vite.config.ts` locally to set `TUNNEL_HOST` to that host and `server.port` to that port. **Never stage this file.** Then run, in the background:
  ```bash
  WW2AIRSIM_TUNNEL=1 npx vite --port <port>
  ```
  Assert it with `curl -sS -o /dev/null -w '%{http_code}\n' https://<host>/hangar.html`, which must print `200`. If both slots are busy, wait up to an hour, polling every five minutes. Do not stop another worktree's server. If neither frees, record a `Ruling:`, skip to Task 9, and mark Tier 2 NOT RUN in the handoff. Record the slot in the ledger.

- [ ] **Step 3: Run Tier 2.** The desktop must have `playwright run-server` up in Mark's console session. From the worktree:
  ```bash
  ss -ltn | grep -q ':39001 ' || (ssh -N -L 39001:127.0.0.1:3000 ryzen &)
  PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://<host> npx playwright test tests/e2e/hangar.spec.ts; echo "rc=$?"
  ```
  Expected `rc=0`. Copy every `console.log` line into the ledger, especially check 10's hangar counts and check 8's hangar wireframe share. The hangar must pass check 1 (mask 2–80%), check 8 and check 10. If check 1's mask share for the Blender hangar falls outside 2–80% at the three-quarter preset, that is a framing finding, not a model defect. Record it as a `Ruling:` with the share, and do not change the bounds.

- [ ] **Step 4: Checkpoint captures.** Mark views the final product only, unattended, so collect the captures now. Write a throwaway spec, `tests/e2e/r1-checkpoint.spec.ts`, which is **never committed**. Copy the shape of O1's checkpoint spec: 2560 × 1440, open `/hangar.html?bench`, wait for `ready`, and `freeze`. Save canvas screenshots to `docs/handoff/<date>-r1-shots/`:
  - `hangar-three-quarter.png`, `hangar-front.png` and `hangar-top.png`: select `hangar` with each preset.
  - `library-vehicles.png`: a screenshot of the panel (`.hangar-panel`) after selecting "Vehicles" in the Kind filter (`select[aria-label="Kind"]`). Both entries must read "(not yet in service)".
  - `library-hangar-card.png`: the panel with `hangar` selected, showing the card's figures and the budget line.

  **Look at every capture** before the handoff describes it. Keep each PNG under 1.5 MB, downscaling with `sharp` if needed.

- [ ] **Step 5: Commit** the spec and captures only. `git diff --cached --stat` must not list `vite.config.ts` or the throwaway spec.
  ```bash
  git add tests/e2e/hangar.spec.ts docs/handoff/*-r1-shots/
  git diff --cached --stat
  git commit -m "R1: Tier 2 hangar check 12 (the list marks what it cannot draw), the Blender hangar in check 10; checkpoint captures"
  ```

---

### Task 9: Full verification and the completion ritual

**Files:**
- Create: `docs/handoff/<date>-r1-roster-pipeline.md` (the real date of execution)
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§15 "Model roster (R0-R5)" row)
- Modify: `README.md` (one paragraph)
- Modify: `.superpowers/sdd/r1/progress.md` (gitignored, final entry)

- [ ] **Step 1: Full verification on ryzen.** From the worktree root:
  ```bash
  remote-run npm run verify; rc=$?; echo "rc=$rc"
  ```
  Expected `rc=0`.
  - The Blender suites and `blenderEntries.test.ts`'s rebuild block are named skips on ryzen.
  - `blenderEntries.test.ts`'s footprint test and `outputs.test.ts`'s `hangar` block must **run** there, because they need no Blender.
  - O1's generated identity block must not be skipped.
  - Compare the skip count with the O1 handoff's (21).

  Then run the Blender-only checks on nexus by name:
  ```bash
  npx vitest run tests/tools/models/blender tests/tools/models/blenderEntries.test.ts --maxWorkers=1; echo "rc=$?"
  ```
  Expected `rc=0`, with nothing skipped. Record both counts in the ledger.

- [ ] **Step 2: No game change.** Run `git diff main...HEAD --stat -- src/sim content/aircraft content/ships content/scenarios content/bases src/render/scene/airfield.ts src/render/scene/buildings.ts`. Expected: empty. Record it.

- [ ] **Step 3: The handoff** `docs/handoff/<date>-r1-roster-pipeline.md`, in the house shape (see `docs/handoff/2026-09-26-o1-ordnance-models.md`):
  - **What shipped:**
    - the `blender` kind, and how a Blender entry builds
    - the new output folders
    - the hangar as the first Blender model, with its bytes, triangles, draw calls and the build's own log line
    - the Library `model` field
    - the `vehicle` kind and the two entries
    - the static-model registry
    - the display path, with its three labels
    - the allowlist (25), and how the next plan shrinks it
  - **Tier 1:** the `remote-run` rc and counts, and the nexus Blender run's.
  - **Tier 2:** checks 1, 8 and 10 for `hangar`, check 12, and the rc.
  - **Mark's checkpoint:** the Task 8 captures as relative links, and the live host (up only while the worktree's dev server runs; say so, with the `curl`).
  - **For R2:**
    - how to add a ship (content spec, entry, `SHIP_MODELS`, and the Library `model` or `spec`)
    - that `NOT_YET_DRAWN` and `CEILING` both go down
    - that R0's kit still lacks the hull part (M0 handoff's rulings)
  - **Open:** anything the ledger's rulings leave open.
  - **Departures:** the ledger's `Ruling:` lines, summarized.

- [ ] **Step 4: §15 and README.**
  - In the master spec §15 table, update the "Model roster (R0-R5)" row's status cell. Keep the R0 text, and append: "R1 complete <date> on branch `worktree-r1-roster` (not merged; merging is Mark's call): the manifest's `blender` kind builds through `models:build`, Library entries draw their own models, a `vehicle` kind, and the barrel-roof hangar is the first Blender model in `content/`; the not-yet-drawn allowlist stands at 25. [plan](../plans/2026-09-26-r1-roster-pipeline.md), [handoff](../../handoff/<date>-r1-roster-pipeline.md). R2-R5 not started." Replace the row's "R1-R5 not started" wording accordingly.
  - README: add one paragraph after the O1 paragraph: "**R1 roster pipeline landed <date> on a branch awaiting merge:** an original Blender model now ships through `npm run models:build`, and the Hangar draws any Library entry's own model, in the game or not. The first is the barrel-roof hangar. The [handoff](docs/handoff/<date>-r1-roster-pipeline.md) records what was measured; master spec §15 holds the status."

- [ ] **Step 5: The ledger.** Append the final entry to `.superpowers/sdd/r1/progress.md`: the verify rc and counts, the nexus Blender rc, the Tier 2 rc, the commit range (`git log --oneline main..HEAD`), and "handoff written".

- [ ] **Step 6: Commit, push the branch, email.**
  ```bash
  git diff HEAD --stat
  git add docs/handoff/ docs/superpowers/specs/2026-09-12-ww2airsim-design.md README.md
  git commit -m "R1: handoff, §15 row, README pointer"
  git push -u origin worktree-r1-roster
  python3 tools/mail-doc.py docs/handoff/<date>-r1-roster-pipeline.md "ww2airsim: R1 roster pipeline handoff (branch, not merged)"
  ```
  Do not merge, and do not touch `main`. Leave the slot's dev server running only if the handoff promises it is up. Leave `vite.config.ts`'s local edit unstaged; it is discarded with the worktree.
