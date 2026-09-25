# Z1: the model pipeline and runtime foundation, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Wildcat-only model build with a manifest-driven pipeline, load every model through one reference-counted cache, give the `Airframe` interface a per-frame `update`, `dispose` and `parts`, and select each aircraft's model from its content file. Nothing Zero-specific ships.

**Architecture:** One JSON entry per model under `tools/models/entries/`, validated by a Zod `ModelEntrySchema`, drives a chain of glTF-Transform stages. Each stage is a function on a `Document`, tested on synthetic documents built in the test. `npm run models:build` writes a committed glb only after `checkOutput` passes its budget and extension checks. At runtime, `acquireModel(url)` parses each URL once and hands out clones that share geometry, materials and textures. An aircraft spec's new `view.model` names a key in an airframe registry, and `buildScenarioEntities` loads each aircraft through that registry.

**Tech Stack:** TypeScript (strict), three.js 0.186, Zod, vitest; new tooling-only devDependencies `@gltf-transform/core`, `/functions` and `/extensions` 4.5, `meshoptimizer` 1.2 and `sharp` 0.35.

**Spec:** `docs/superpowers/specs/2026-09-25-a6m-zero-design.md`, approved by Mark 2026-09-25 with every recommendation accepted. This plan is its §11 "Z1". Read §6, §7.1 to §7.3 and §10 first. Also see `docs/superpowers/specs/2026-09-25-hangar-library-design.md` "Decisions" item 1: Z1 adds `Airframe.parts`.

**Where:** the worktree `/home/mark/projects/ww2airsim/.claude/worktrees/models-track`, branch `worktree-models-track`. Mark set the Models-track order: Z1, then H1, S1, Z3, H2, S2 and H3. Do not switch branches, and do not push.

## Open questions for Mark

None. This plan changes several spec details at the implementation level. Each change, with its reason, is listed under "Where this plan departs from the spec's wording". None of them reverses a decision Mark made.

## Global Constraints

- `npm run verify` ends every task with `rc=0`. Capture the status directly: `npm run verify; rc=$?; echo "rc=$rc"`. Never gate on a grepped pipeline.
- **Memory on nexus (22 GB, `/tmp` is a 12 GB RAM-backed tmpfs).** Never copy the repo or a model into `/tmp` or anywhere else. Run at most one `npm run verify` on the machine at a time. Other sessions share this box. `tests/build/dist.test.ts` already builds twice into `os.tmpdir()`, and each build copies all of `content/` (200,905,633 bytes in this worktree, measured with `du -sb content` on 2026-09-25). While iterating, run only named files: `npx vitest run <file> --maxWorkers=2`.
- **No compression extension, ever.** Do not add `EXT_meshopt_compression` or Draco. `GLTFLoader` has no decoder wired in (`20bcaa4`). `checkOutput` rejects any `extensionsRequired` entry other than `EXT_texture_webp`.
- **`content/aircraft/wildcat.glb` keeps its bytes: 5,573,316.** `tests/build/dist.test.ts` pins that number. Z1 builds no model.
- **The F6F's flight numbers do not change.** The only content edit is the render-only `view.model` key.
- **Install dependencies only from the main checkout's shared `node_modules`** (Task 1). Never run a plain `npm install` inside a worktree. Every worktree's `node_modules` is a symlink to `/home/mark/projects/ww2airsim/node_modules`.
- `src/sim/` never imports `render/`, `input/`, `assists/`, `audio/`, Node core or a rendering library (`.dependency-cruiser.cjs`). `view.model` is a plain string in the sim's schema, in the same way `view.eyePointM` already is.
- **Ownership (spec §10).** This lane owns `tools/models/**`, `src/render/models/**`, `src/render/scene/{airframe,airframes,wildcat,hellcat,stores}.ts` and `src/render/airframeUpdate.ts`. Shared files, touched only where named: `src/render/scenarioEntities.ts` (the airframe half), `src/render/main.ts` (the per-aircraft loop only), `vite.config.ts` (the content filter only), `tests/build/dist.test.ts`, and the `view` block of `src/sim/flight/schema.ts` and `content/aircraft/*.json`. Re-diff every shared file against `HEAD` right before each commit.
- No Tier 2 run and no dev server before Task 8. Task 8 runs Tier 2 on a spare slot (`ww2airsim-2`, port 5175), per the repo `CLAUDE.md`.
- Put scratch probes under `.superpowers/` (gitignored). Never commit a probe.
- US spelling in new prose and identifiers. Escape `|` as `\|` inside markdown table cells.
- End each commit message with the `Co-Authored-By` trailer your session's instructions specify.

## Shared files, overlap and merge order

Z2 (the Zero's flight model and guns, on `worktree-combat-track`) is the only parallel plan that touches Z1's files. Its plan (`docs/superpowers/plans/2026-09-25-z2-zero-flight-model.md`, committed on `worktree-combat-track` as `fd35c8c`) has a matching table, and the rule below agrees with its own.

| File | Z1's change | Z2's change | Overlap |
| --- | --- | --- | --- |
| `src/sim/flight/schema.ts` | required `view.model` in the `view` block | optional keys in `reference`, `rates`, `engine` | textual, different blocks |
| `tests/sim/flight/schema.test.ts` | `model` in the `valid` fixture's `view`, and in two eye-point literals | new `describe` blocks at the end | textual |
| `content/aircraft/a6m2-zero.json` | none, unless Z2 is on `main` first (see below) | creates it, with no `view.model` | **semantic** |
| `content/aircraft/f6f-hellcat.json`, `f4f-wildcat.json` | `"model": "wildcat"` | not edited | none |
| master spec §15 | adds or updates the "A6M Zero (Z1-Z3)" row | the same row | textual |
| `README.md` | one pointer paragraph | one pointer paragraph | textual |

**The `view.model` rule.** Z1 makes `view.model` required, and registers only `wildcat`. `a6m2-zero` is Z3's to register.

- **If Z2 reached `main` first**, `content/aircraft/a6m2-zero.json` exists with no `view.model`, and Z1's schema rejects it. Task 7 Step 1 checks for this and adds `"model": "wildcat"` to that file. Z3 flips it to `"a6m2-zero"`.
- **If Z1 reaches `main` first**, Z2's Task 8 adds `"model": "wildcat"` itself. Z2's plan says so.

Either way, `tests/render/airframes.test.ts`, the registry-coverage test, fails loudly until every aircraft file names a registered model.

**Merge order.** Z1 and Z2 have no code dependency in either direction. Merge them in whichever order they finish, and apply the rule above. **H1 and S1 build on Z1,** and the handoff (Task 8) names the interface they consume.

## Where this plan departs from the spec's wording

All of these were measured or found while drafting this plan. None changes a decision Mark made.

1. **A new `collapse` step.** In the Zero's file, a named part is a **group** node, and its mesh hangs one level down. For example, `Rotor` holds `Rotor_Rotor_0`, and `Corps` holds two nodes that are both named `Corps_Corps_0`. When an entry has `normalize`, each `keep` node's whole subtree becomes one leaf mesh node named `as`, before the pivot stage runs.
2. **`simplify` runs before collapse, normalize and join**, not sixth. Its `perNode` keys name source nodes (`Verriere`, `Rotor`), and collapse renames those nodes while join dissolves them.
3. **The budget is checked before anything is written.** The spec says to write, then check. A failed build now leaves the committed file untouched.
4. **A new optional entry field, `frozen`.** The main checkout holds the Wildcat's raw input (74,074,336 bytes in `tools/models/cache/`), so a bare `npm run models:build` there would rebuild `wildcat.glb` and break the byte pin. A frozen entry is skipped by a bare build, and `--force` is required to build it by id.
5. **The pivot axis travels in node extras** as `pivotAxis`, a unit vector in the output frame. `GLTFLoader` exposes it as `Object3D.userData.pivotAxis`. The spec did not say where the axis goes at runtime.
6. **Provenance is written into the file**, as `asset.extras.source`, `author` and `license`. The committed Wildcat already carries `source` and `license`. The ship spec's §9 test 1 reads these fields.
7. **`@gltf-transform/cli` is removed** from `devDependencies`. Its only caller was the deleted `buildWildcatModel`.
8. **`buildScenarioEntities` loads the new airframes before it releases the old ones**, so a model that both scenarios use keeps its one parse through the switch.
9. **The per-aircraft update rule is a pure function**, `airframeUpdateFor` in `src/render/airframeUpdate.ts`, so the "a wreck's propeller stops" rule has a test and is no longer only a comment in `main.ts`.
10. **Scope:** LOD (`pickLod`), the Zero's entries and `zero.ts` are Z3, per spec §11. `AirframeUpdate.cameraDistanceM` exists now, so Z3 does not have to change the interface.

## Measured before writing this plan (2026-09-25, this worktree at `1b8d80e`)

These are claims to re-check before relying on them.

- **The code in this plan was executed before it was written down.** The tool modules and their tests ran from a gitignored scratch directory, with glTF-Transform 4.5.0, meshoptimizer 1.2.0 and sharp 0.35.4 taken from the npx cache (`~/.npm/_npx/591c4055d7374c55`). Result: 37 tests passed in 6 files. `tsc --noEmit` passed under the repo's `tsconfig.json`, and eslint passed with zero warnings. The runtime changes (Tasks 5 to 7) were applied to this worktree temporarily. `tsc` passed, eslint passed, depcruise reported no violations, and the named test files passed (`npx vitest run <files> --maxWorkers=2`). The worktree was then restored: `git status` was clean. The executor still runs every step, since this is not a substitute for that.
- **The committed Wildcat**, read with a Python GLB-chunk reader: 5,573,316 bytes, 186 nodes, 47 mesh nodes, 47 draw calls, 100,886 triangles, 9 materials, 26 textures, all 1024×1024 WebP (read from each RIFF header), 1 animation (`Take 001`), `extensionsRequired` = `[EXT_texture_webp]`. `asset.extras.source` is the Sketchfab URL, and `asset.extras.license` is `CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)`. The draft `checkOutput` passes it against `entries/wildcat.json` below.
- **Dependencies:** none of `@gltf-transform/*` and none of `sharp` is in the shared `node_modules` (`ls node_modules/@gltf-transform` fails). `meshoptimizer@1.1.1` is there, but only as a dependency of `@types/three` (`npm ls meshoptimizer`). `@gltf-transform/cli@4.5.0` pins `meshoptimizer ~1.2.0` and `sharp ~0.35.3`, and this plan pins the same ranges.
- **glTF-Transform quirks this plan works around:**
  - `Texture.getSize()` and `ImageUtils.getSize()` return `null` for sharp's lossy WebP output, so `measure.ts` reads the RIFF header itself (`webpSize`).
  - `compactPrimitive` and `transformMesh` reorder vertices, so tests compare vertex sets without regard to order.
  - `join({ filter })` excludes the filtered nodes and merges only siblings.
- **The Zero candidate, #6, is not in this worktree.** It exists only in the main checkout, at `/home/mark/projects/ww2airsim/content/models/candidates/a6m2-zeke.glb` (16,138,556 bytes). **Z1 does not rely on it**, because no task reads a raw download. A read-only smoke run of the drafted pipeline on that file, never committed, confirmed the spec's §2 counts: 14 nodes, 6 meshes, 5 materials, 11 textures, 187,441 triangles and 0 animations. With a guessed CG x (150) and a guessed tailwheel box, the run produced:
  - 97,621 triangles, 7 draw calls and 5,580,404 bytes, within 19,596 bytes of the 5.6 MB budget
  - `extensionsRequired` = `[EXT_texture_webp]`, and a clean `checkOutput`
  - 2.1 s wall time and 361 MB peak RSS

  **For Z3:** the model measures 500.55 source units long against a 632.33-unit span. At a 12.0 m span that is 9.50 m long, against the A6M2's 9.06 m.
- **The candidate leak:** the main checkout's `content/models/` holds 131,197,993 bytes, and its `dist/content/models/` holds 132,303,700 bytes (`du -sb`). The spec's figure of 101,182,857 predates later downloads.
- **`main.ts` anchors at `1b8d80e`:**
  - `PROP_MAX_RAD_PER_SEC` is at lines 165-174
  - the `setGear` loop is at 1896-1901
  - the player `spinProp` block is at 2022-2032, inside the frame closure where `frameMs` is declared (line 1696)

  Re-find each one by its text, not by its line number.

## Review Focus

These are five inputs the spec implies but does not test. Each one has a test in the task that owns the code.

1. **A bare `npm run models:build` in the main checkout.** The Wildcat's raw input is present there, so a bare build must skip the frozen Wildcat and name it, not rewrite `wildcat.glb`. Task 4.
2. **Switching between two scenarios that both fly the Wildcat.** The model must be parsed once, and nothing still drawn may be freed. Task 6.
3. **One airframe's model fails to load during a switch** (a 404 or a bad glb). The airframes that did load are disposed, and the running scenario stays in the scene. Task 6.
4. **A wrecked AI aircraft.** Its propeller stops, just as the player's always did. Now that every propeller turns, that rule covers every aircraft. Task 6.
5. **An unregistered or prototype-named `view.model`** (`"a6m2-zero"` before Z3, or `"constructor"`). It throws an error that names the id and lists the registered ones. It must never call `undefined` or reach `Object.prototype`. Task 7.

---

## File structure

| File | Status | Responsibility |
| --- | --- | --- |
| `package.json`, `package-lock.json` | modify | new devDependencies, drop `@gltf-transform/cli`, `models:inspect` script |
| `tools/models/manifest.ts` | create | `ModelEntrySchema`, `parseModelEntry`, `loadModelEntries` |
| `tools/models/document.ts` | create | `modelIO`, node lookup, `ownMesh`, `moveToSceneRoot`, `disposeSubtree` |
| `tools/models/measure.ts` | create | `measureDocument`, triangle counts, `webpSize` |
| `tools/models/inspect.ts` | create | `inspectDocument` and the `models:inspect` CLI |
| `tools/models/stages/{remove,split,collapse,pivot,normalize,axes,geometry}.ts` | create | the geometry stages (Task 2) |
| `tools/models/stages/{simplify,join,textures,opaque}.ts` | create | the surface stages (Task 3) |
| `tools/models/build.ts` | rewrite | `runPipeline`, `checkOutput`, `runBuild` and the `models:build` CLI |
| `tools/models/entries/wildcat.json` | create | the Wildcat's entry, frozen |
| `tests/tools/models/*.test.ts`, `fixtures.ts` | create | per task |
| `tests/tools/modelsBuild.test.ts` | delete | superseded by `tests/tools/models/outputs.test.ts` |
| `vite.config.ts` | modify | `EXCLUDED_CONTENT_DIRS`, `contentCopyFilter` |
| `tests/build/contentFilter.test.ts` | create | the filter's truth table |
| `tests/build/dist.test.ts` | modify | `dist/content/models` absent |
| `src/render/models/dispose.ts` | create | `disposeMeshTree`, moved from `scenarioEntities.ts` |
| `src/render/models/modelCache.ts` | create | `createModelCache`, `acquireModel`, `ModelInstance` |
| `src/render/scene/airframe.ts` | rewrite | `Airframe` with `parts`/`update`/`dispose`, `AirframeUpdate`, `PartId`, `propAngle` |
| `src/render/scene/{wildcat,hellcat,stores}.ts` | modify | the new interface; the Wildcat loads through the cache |
| `src/render/scene/airframes.ts` | create | the `view.model` registry |
| `src/render/airframeUpdate.ts` | create | `airframeUpdateFor` |
| `src/render/scenarioEntities.ts` | modify | per-spec loading, dispose through `Airframe.dispose`, acquire before release |
| `src/render/main.ts` | modify | the per-aircraft loop, and nothing else |
| `src/sim/flight/schema.ts`, `content/aircraft/*.json` | modify | `view.model` |

---

### Task 1: Dependencies, the entry schema, and `models:inspect`

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `tools/models/manifest.ts`, `tools/models/document.ts`, `tools/models/measure.ts`, `tools/models/inspect.ts`
- Test: `tests/tools/models/fixtures.ts`, `tests/tools/models/manifest.test.ts`, `tests/tools/models/inspect.test.ts`

**Interfaces:**
- Produces:
  - `ModelEntrySchema`, `type ModelEntry`, `type Axis`, `type Pivot`, `parseModelEntry(raw): ModelEntry`, and `loadModelEntries(dir?): ModelEntry[]` (`tools/models/manifest.ts`)
  - `modelIO(): NodeIO`, `onlyScene(doc)`, `findNode(doc, name): Node` (throws unless there is exactly one), `subtree(node)`, `meshNodes(doc)`, `ownMesh(doc, node)`, `moveToSceneRoot(doc, node)` and `disposeSubtree(node)` (`tools/models/document.ts`)
  - `measureDocument(doc): ModelMeasure` (`{ triangles, drawCalls, textures, maxTextureSize, extensionsRequired, blendMaterials, animations, bounds }`), `nodeTriangles(node)`, `primitiveTriangles(prim)` and `webpSize(bytes)` (`tools/models/measure.ts`)
  - `inspectDocument(doc, label): string` (`tools/models/inspect.ts`)
  - the test fixtures `newDocument`, `addMeshNode`, `boxesPrimitive`, `gridPrimitive`, `worldPositions` and `boxArrays` (`tests/tools/models/fixtures.ts`)

- [ ] **Step 1: Record the dependencies in this branch's manifest without touching `node_modules`.** From the worktree:

```bash
npm install --save-dev --package-lock-only \
  @gltf-transform/core@^4.5.0 @gltf-transform/functions@^4.5.0 @gltf-transform/extensions@^4.5.0 \
  meshoptimizer@~1.2.0 sharp@~0.35.3
npm uninstall --save-dev --package-lock-only @gltf-transform/cli
git diff --stat package.json package-lock.json
```

Expected: `package.json` gains those five entries under `devDependencies` and loses `@gltf-transform/cli`. `ls -la node_modules` still shows the symlink.

- [ ] **Step 2: Install into the shared `node_modules`, from the main checkout.** First check whether another session is running `npm` there: `pgrep -af "npm (install|ci)"` must print nothing. Then run:

```bash
cd /home/mark/projects/ww2airsim && npm install --no-save \
  @gltf-transform/core@4.5.0 @gltf-transform/functions@4.5.0 @gltf-transform/extensions@4.5.0 \
  meshoptimizer@1.2.0 sharp@0.35.4
ls node_modules/@gltf-transform node_modules/sharp/package.json && npm ls meshoptimizer
```

Expected: `core extensions functions` is listed, and `meshoptimizer@1.2.0` sits at the top level, with `@types/three` either deduped onto it or keeping its own 1.1.1. This uses `--no-save` because `main`'s `package.json` gains these packages only when Z1 merges. **Until then, any `npm install` or `npm ci` on `main` prunes them.** If `ls node_modules/@gltf-transform` fails later, re-run this step, and note it in the progress ledger. Do not edit `main`'s `package.json`.

- [ ] **Step 3: Write the fixtures** in `tests/tools/models/fixtures.ts`:

```ts
// tests/tools/models/fixtures.ts
import { Document, type Material, type Node, type Primitive } from '@gltf-transform/core'

export type V3 = [number, number, number]

/** One closed box: 8 shared corners, 12 triangles, wound outward. */
export function boxArrays(min: V3, max: V3): { positions: number[]; indices: number[] } {
  const [x0, y0, z0] = min, [x1, y1, z1] = max
  const positions = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]
  const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]
  return { positions, indices }
}

/** One primitive holding every box given, as separate shells. */
export function boxesPrimitive(doc: Document, boxes: [V3, V3][], material?: Material): Primitive {
  const positions: number[] = [], indices: number[] = []
  for (const [min, max] of boxes) {
    const b = boxArrays(min, max)
    const base = positions.length / 3
    positions.push(...b.positions)
    indices.push(...b.indices.map((i) => i + base))
  }
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)))
  if (material) prim.setMaterial(material)
  return prim
}

/** An n x n grid of quads in the XZ plane at y = 0, 2n^2 triangles, with a gentle bump. */
export function gridPrimitive(doc: Document, n: number, size: number): Primitive {
  const positions: number[] = [], indices: number[] = []
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) positions.push((i / n) * size, 0, (j / n) * size)
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const a = i * (n + 1) + j, b = a + 1, c = a + n + 1, d = c + 1
    indices.push(a, b, d, a, d, c)
  }
  return doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)))
}

/** A new document with one scene and one buffer. */
export function newDocument(): Document {
  const doc = new Document()
  doc.createBuffer()
  doc.createScene('scene')
  return doc
}

/** Adds a mesh node (or a group holding one, Sketchfab-style) under `parent` or the scene. */
export function addMeshNode(doc: Document, name: string, prims: Primitive[], parent?: Node): Node {
  const mesh = doc.createMesh(name)
  for (const p of prims) mesh.addPrimitive(p)
  const node = doc.createNode(name).setMesh(mesh)
  if (parent) parent.addChild(node)
  else doc.getRoot().listScenes()[0]!.addChild(node)
  return node
}

/** World-space positions of every vertex under `node` (its own mesh only). */
export function worldPositions(node: Node): number[][] {
  const m = node.getWorldMatrix() as unknown as number[]
  const out: number[][] = []
  for (const prim of node.getMesh()?.listPrimitives() ?? []) {
    const p = prim.getAttribute('POSITION')!.getArray()!
    for (let i = 0; i < p.length / 3; i++) {
      const x = p[3 * i]!, y = p[3 * i + 1]!, z = p[3 * i + 2]!
      out.push([m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!])
    }
  }
  return out
}
```

- [ ] **Step 4: Write the failing tests.** `tests/tools/models/manifest.test.ts`:

```ts
// tests/tools/models/manifest.test.ts
import { describe, expect, it } from 'vitest'
import { parseModelEntry } from '../../../tools/models/manifest.js'

const valid = {
  id: 'test-plane',
  input: 'tools/models/cache/test-plane.glb',
  output: 'content/aircraft/test-plane.glb',
  source: { url: 'https://sketchfab.com/3d-models/test-plane-0123456789abcdef0123456789abcdef', uid: '0123456789abcdef0123456789abcdef', author: 'someone', license: 'CC-BY-4.0' },
  normalize: { forward: '+x', up: '+y', origin: [0, 0, 0], fit: { extent: 'span', meters: 12 } },
  keep: [{ node: 'Rotor', as: 'Prop', pivot: { point: [1, 2, 3], axis: '+x' } }],
  split: [{ name: 'Tank', select: 'triangles', boxMin: [0, 0, 0], boxMax: [1, 1, 1] }],
  remove: ['Tank'],
  textures: { maxSize: 1024, format: 'webp' },
  budget: { maxBytes: 1000, maxTriangles: 100, maxDrawCalls: 3 },
  noseNode: 'Prop',
}

describe('ModelEntrySchema', () => {
  it('accepts a complete entry and fills defaults', () => {
    const e = parseModelEntry({ ...valid, split: [], remove: [] })
    expect(e.opaque).toBe(true)
    expect(e.split).toEqual([])
    expect(parseModelEntry({ ...valid, split: [{ name: 'T', boxMin: [0, 0, 0], boxMax: [1, 1, 1] }], remove: [] }).split[0]!.select).toBe('components')
  })

  it.each([
    ['an unknown top-level key', { ...valid, outptu: 'x' }, /outptu/],
    ['an output basename that is not the id', { ...valid, output: 'content/aircraft/other.glb' }, /basename must equal id/],
    ['an input outside tools/models/cache/', { ...valid, input: 'content/models/candidates/x.glb' }, /input/],
    ['an output outside content/aircraft|ships', { ...valid, output: 'content/models/test-plane.glb' }, /output/],
    ['a uid that is not the url tail', { ...valid, source: { ...valid.source, uid: 'f'.repeat(32) } }, /last segment/],
    ['a ShareAlike license', { ...valid, source: { ...valid.source, license: 'CC-BY-SA-4.0' } }, /license/],
    ['forward parallel to up', { ...valid, normalize: { ...valid.normalize, up: '-x' } }, /parallel/],
    ['a split box with min >= max', { ...valid, split: [{ name: 'T', boxMin: [0, 0, 0], boxMax: [1, 0, 1] }], remove: [] }, /exceed boxMin/],
    ['a pivot without normalize', { ...valid, normalize: undefined }, /pivot needs normalize/],
    ['a name used twice', { ...valid, split: [{ name: 'Prop', boxMin: [0, 0, 0], boxMax: [1, 1, 1] }], remove: [] }, /used twice/],
    ['removing a kept node', { ...valid, remove: ['Rotor'] }, /also kept/],
    ['a noseNode that names no part', { ...valid, noseNode: 'Spinner' }, /noseNode/],
    ['a texture size that is not a power of two', { ...valid, textures: { maxSize: 1000, format: 'webp' } }, /power of two/],
    ['a zero budget', { ...valid, budget: { ...valid.budget, maxDrawCalls: 0 } }, /maxDrawCalls/],
  ])('rejects %s', (_label, raw, message) => {
    expect(() => parseModelEntry(raw)).toThrow(message)
  })
})
```

`tests/tools/models/inspect.test.ts`:

```ts
// tests/tools/models/inspect.test.ts
import { describe, expect, it } from 'vitest'
import { measureDocument } from '../../../tools/models/measure.js'
import { inspectDocument } from '../../../tools/models/inspect.js'
import { addMeshNode, boxesPrimitive, newDocument } from './fixtures.js'

describe('measureDocument / inspectDocument', () => {
  it('counts triangles and draw calls per mesh node and prints source-frame bounds', () => {
    const doc = newDocument()
    const group = doc.createNode('Rotor').setTranslation([100, 0, 0])
    doc.getRoot().listScenes()[0]!.addChild(group)
    addMeshNode(doc, 'Rotor_0', [boxesPrimitive(doc, [[[0, 0, 0], [1, 1, 1]]]), boxesPrimitive(doc, [[[2, 0, 0], [3, 1, 1]]])], group)
    const m = measureDocument(doc)
    expect(m.triangles).toBe(24)
    expect(m.drawCalls).toBe(2)
    expect(m.bounds.min).toEqual([100, 0, 0])
    const text = inspectDocument(doc, 'synthetic')
    expect(text).toContain('24 triangles, 2 draw calls')
    expect(text).toContain('"Rotor" 0/24')
    expect(text).toContain('min [100.000, 0.000, 0.000] max [103.000, 1.000, 1.000]')
  })
})
```

- [ ] **Step 5: Run them to see them fail.**

Run: `npx vitest run tests/tools/models/manifest.test.ts tests/tools/models/inspect.test.ts --maxWorkers=2`
Expected: FAIL, with `Failed to resolve import "../../../tools/models/manifest.js"`.

- [ ] **Step 6: Implement.** `tools/models/manifest.ts`:

```ts
// tools/models/manifest.ts
import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { z } from 'zod'

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
```

`tools/models/document.ts`:

```ts
// tools/models/document.ts
import { Node, NodeIO, type Document, type Mesh, type Scene } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

/** The one reader/writer every model tool uses. Every extension is registered, so a
 *  WebP- or KTX-textured input reads; the pipeline itself never adds a compression
 *  extension (A6M Zero spec §6.2: no decoder is wired into GLTFLoader). */
export function modelIO(): NodeIO {
  return new NodeIO().registerExtensions(ALL_EXTENSIONS)
}

/** The document's only scene. Every input this project uses has exactly one. */
export function onlyScene(doc: Document): Scene {
  const scenes = doc.getRoot().listScenes()
  if (scenes.length !== 1) throw new Error(`expected exactly one scene, found ${scenes.length}`)
  return scenes[0]!
}

/** Exactly one node named `name`, or a thrown error naming it. */
export function findNode(doc: Document, name: string): Node {
  const matches = doc.getRoot().listNodes().filter((n) => n.getName() === name)
  if (matches.length !== 1) throw new Error(`node "${name}": expected exactly one, found ${matches.length}`)
  return matches[0]!
}

/** `root` and every node below it, parents first. */
export function subtree(root: Node): Node[] {
  const out: Node[] = []
  root.traverse((n) => { out.push(n) })
  return out
}

/** Nodes reachable from the scene that carry a mesh. */
export function meshNodes(doc: Document): Node[] {
  const out: Node[] = []
  onlyScene(doc).traverse((n) => { if (n.getMesh()) out.push(n) })
  return out
}

/** Gives `node` a mesh, and primitives, that nothing else references, so a
 *  transform baked into it moves nothing else. Returns that mesh. */
export function ownMesh(doc: Document, node: Node): Mesh | null {
  const mesh = node.getMesh()
  if (!mesh) return null
  const users = mesh.listParents().filter((p) => p instanceof Node)
  const primsShared = mesh.listPrimitives().some((p) => p.listParents().filter((q) => q !== mesh && q.propertyType === 'Mesh').length > 0)
  if (users.length <= 1 && !primsShared) return mesh
  const copy = doc.createMesh(mesh.getName())
  for (const p of mesh.listPrimitives()) copy.addPrimitive(p.clone())
  node.setMesh(copy)
  return copy
}

/** Detaches `node` from wherever it hangs and hangs it directly under the scene. */
export function moveToSceneRoot(doc: Document, node: Node): void {
  const parent = node.getParentNode()
  if (parent) parent.removeChild(node)
  const scene = onlyScene(doc)
  if (!scene.listChildren().includes(node)) scene.addChild(node)
}

/** Disposes `root` and everything below it. */
export function disposeSubtree(root: Node): void {
  for (const n of subtree(root).reverse()) n.dispose()
}
```

`tools/models/measure.ts`:

```ts
// tools/models/measure.ts
import { getBounds } from '@gltf-transform/functions'
import type { Document, Node, Primitive } from '@gltf-transform/core'
import { meshNodes, onlyScene } from './document.js'

const TRIANGLES = 4

/** Triangles one primitive draws: index count / 3, or vertex count / 3 when
 *  unindexed. Points and lines draw none. */
export function primitiveTriangles(prim: Primitive): number {
  if (prim.getMode() !== TRIANGLES) return 0
  const indices = prim.getIndices()
  const count = indices ? indices.getCount() : (prim.getAttribute('POSITION')?.getCount() ?? 0)
  return Math.floor(count / 3)
}

export function nodeTriangles(node: Node): number {
  return node.getMesh()?.listPrimitives().reduce((sum, p) => sum + primitiveTriangles(p), 0) ?? 0
}

/** Width and height of a WebP image, read from its RIFF header (lossy `VP8 `,
 *  lossless `VP8L`, extended `VP8X`). glTF-Transform's `ImageUtils.getSize`
 *  returns null for sharp's lossy output (measured 2026-09-25, v4.5.0), so the
 *  budget check reads the header itself rather than trusting a null. */
export function webpSize(b: Uint8Array): [number, number] | null {
  const ascii = (o: number, n: number): string => String.fromCharCode(...b.subarray(o, o + n))
  if (b.length < 30 || ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP') return null
  const chunk = ascii(12, 4)
  if (chunk === 'VP8 ') return [(b[26]! | (b[27]! << 8)) & 0x3fff, (b[28]! | (b[29]! << 8)) & 0x3fff]
  if (chunk === 'VP8L') {
    const v = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)
    return [(v & 0x3fff) + 1, ((v >>> 14) & 0x3fff) + 1]
  }
  if (chunk === 'VP8X') return [(b[24]! | (b[25]! << 8) | (b[26]! << 16)) + 1, (b[27]! | (b[28]! << 8) | (b[29]! << 16)) + 1]
  return null
}

export interface ModelMeasure {
  /** Summed over every mesh-bearing node in the scene, so an instanced mesh counts once per node. */
  readonly triangles: number
  /** One per primitive per mesh-bearing node: what three.js issues. */
  readonly drawCalls: number
  readonly textures: number
  /** The largest width or height of any texture, 0 if there are none. */
  readonly maxTextureSize: number
  readonly extensionsRequired: readonly string[]
  readonly blendMaterials: readonly string[]
  readonly animations: number
  readonly bounds: { readonly min: readonly number[]; readonly max: readonly number[] }
}

export function measureDocument(doc: Document): ModelMeasure {
  const nodes = meshNodes(doc)
  const root = doc.getRoot()
  let maxTextureSize = 0
  for (const t of root.listTextures()) {
    const image = t.getImage()
    const size = t.getMimeType() === 'image/webp' && image ? webpSize(image) : t.getSize()
    if (!size) throw new Error(`texture "${t.getName() || t.getURI()}" (${t.getMimeType()}): size unreadable`)
    maxTextureSize = Math.max(maxTextureSize, size[0], size[1])
  }
  const bounds = getBounds(onlyScene(doc))
  return {
    triangles: nodes.reduce((sum, n) => sum + nodeTriangles(n), 0),
    drawCalls: nodes.reduce((sum, n) => sum + (n.getMesh()?.listPrimitives().length ?? 0), 0),
    textures: root.listTextures().length,
    maxTextureSize,
    extensionsRequired: root.listExtensionsUsed().filter((e) => e.isRequired()).map((e) => e.extensionName).sort(),
    blendMaterials: root.listMaterials().filter((m) => m.getAlphaMode() === 'BLEND').map((m) => m.getName()),
    animations: root.listAnimations().length,
    bounds: { min: [...bounds.min], max: [...bounds.max] },
  }
}
```

`tools/models/inspect.ts`:

```ts
// tools/models/inspect.ts
/**
 * `npm run models:inspect -- <file.glb>`: the node tree with per-node
 * triangle counts and bounds, materials, textures and animations. Every
 * coordinate it prints is in the file's SOURCE frame (world space, every node
 * matrix applied), which is the frame a `tools/models/entries/*.json` entry
 * is written in (A6M Zero spec §6.1).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getBounds } from '@gltf-transform/functions'
import type { Document, Node } from '@gltf-transform/core'
import { modelIO, onlyScene } from './document.js'
import { measureDocument, nodeTriangles, webpSize } from './measure.js'

const fmt = (v: readonly number[]): string => `[${v.map((x) => x.toFixed(3)).join(', ')}]`

function subtreeTriangles(node: Node): number {
  let sum = 0
  node.traverse((n) => { sum += nodeTriangles(n) })
  return sum
}

export function inspectDocument(doc: Document, label: string): string {
  const m = measureDocument(doc)
  const root = doc.getRoot()
  const lines: string[] = [
    `${label}: ${root.listNodes().length} nodes, ${root.listMeshes().length} meshes, ` +
      `${root.listMaterials().length} materials, ${m.textures} textures, ${m.animations} animations, ` +
      `${m.triangles} triangles, ${m.drawCalls} draw calls`,
    `bounds (source units): min ${fmt(m.bounds.min)} max ${fmt(m.bounds.max)}`,
    `extensionsRequired: ${m.extensionsRequired.join(', ') || '(none)'}`,
    'nodes (name, own triangles / subtree triangles, materials, bounds):',
  ]
  const walk = (node: Node, depth: number): void => {
    const mats = node.getMesh()?.listPrimitives().map((p) => p.getMaterial()?.getName() ?? '(none)') ?? []
    const b = getBounds(node)
    const bounds = Number.isFinite(b.min[0]) ? ` min ${fmt(b.min)} max ${fmt(b.max)}` : ''
    lines.push(`${'  '.repeat(depth + 1)}"${node.getName()}" ${nodeTriangles(node)}/${subtreeTriangles(node)}` +
      `${mats.length ? ` [${mats.join(', ')}]` : ''}${bounds}`)
    for (const c of node.listChildren()) walk(c, depth + 1)
  }
  for (const n of onlyScene(doc).listChildren()) walk(n, 0)
  lines.push('materials:')
  for (const mat of root.listMaterials()) lines.push(`  "${mat.getName()}" alpha=${mat.getAlphaMode()}`)
  lines.push('textures:')
  for (const t of root.listTextures()) {
    const img = t.getImage()
    const s = t.getMimeType() === 'image/webp' && img ? webpSize(img) : t.getSize()
    lines.push(`  "${t.getName() || t.getURI()}" ${t.getMimeType()} ${s ? `${s[0]}x${s[1]}` : '?'}`)
  }
  lines.push('animations:')
  for (const a of root.listAnimations()) lines.push(`  "${a.getName()}" ${a.listChannels().length} channels`)
  return lines.join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: npm run models:inspect -- <file.glb>')
    process.exit(2)
  }
  const doc = await modelIO().readBinary(new Uint8Array(readFileSync(file)))
  console.log(inspectDocument(doc, file))
}
```

Add the script to `package.json`, beside `models:build`:

```json
    "models:inspect": "tsx tools/models/inspect.ts",
```

- [ ] **Step 7: Run the tests, then inspect a real committed file.**

Run: `npx vitest run tests/tools/models/manifest.test.ts tests/tools/models/inspect.test.ts --maxWorkers=2`
Expected: PASS, 16 tests (15 and 1).

Run: `npm run models:inspect -- content/aircraft/wildcat.glb | head -3`
Expected: `content/aircraft/wildcat.glb: 186 nodes, 47 meshes, 9 materials, 26 textures, 1 animations, 100886 triangles, 47 draw calls`, then a bounds line, then `extensionsRequired: EXT_texture_webp`.

- [ ] **Step 8: Verify and commit.**

```bash
npm run verify; rc=$?; echo "rc=$rc"   # must print rc=0
git add package.json package-lock.json tools/models/manifest.ts tools/models/document.ts tools/models/measure.ts tools/models/inspect.ts tests/tools/models/
git commit -m "Models: entry schema, measure and models:inspect on glTF-Transform (Z1 Task 1)"
```

---

### Task 2: The geometry stages (remove, split, collapse, pivot, normalize)

**Files:**
- Create: `tools/models/stages/geometry.ts`, `axes.ts`, `remove.ts`, `split.ts`, `collapse.ts`, `pivot.ts`, `normalize.ts`
- Test: `tests/tools/models/geometryStages.test.ts`

**Interfaces:**
- Consumes: Task 1's `document.ts`, `measure.ts`, `manifest.ts` types, and the fixtures.
- Produces:
  - `removeNodes(doc, names)`
  - `splitByBox(doc, rule: SplitRule): Node`, where `SplitRule = { name, select: 'components' | 'triangles', boxMin, boxMax }`
  - `collapseKept(doc, { node, as? }): Node`
  - `pivotNode(doc, node, pivot: Pivot)`
  - `normalizeMatrix(normalize, sourceMin, sourceMax): mat4` and `normalizeDocument(doc, normalize)`
  - from `geometry.ts`: `ensureIndices`, `carve` and `applyMatrix`
  - from `axes.ts`: `axisVector`, `cross` and `dot`

  After these stages run, a part node sits at the scene root with only a translation, and carries `extras.pivotAxis` in the output frame.

- [ ] **Step 1: Write the failing test**, `tests/tools/models/geometryStages.test.ts`:

```ts
// tests/tools/models/geometryStages.test.ts
import { describe, expect, it } from 'vitest'
import { getBounds } from '@gltf-transform/functions'
import { findNode, meshNodes } from '../../../tools/models/document.js'
import type { ModelEntry } from '../../../tools/models/manifest.js'
import { nodeTriangles } from '../../../tools/models/measure.js'
import { removeNodes } from '../../../tools/models/stages/remove.js'
import { splitByBox } from '../../../tools/models/stages/split.js'
import { collapseKept } from '../../../tools/models/stages/collapse.js'
import { pivotNode } from '../../../tools/models/stages/pivot.js'
import { normalizeDocument, normalizeMatrix } from '../../../tools/models/stages/normalize.js'
import { addMeshNode, boxesPrimitive, newDocument, worldPositions } from './fixtures.js'

const close = (a: readonly number[], b: readonly number[], eps = 1e-4): boolean => a.every((v, i) => Math.abs(v - b[i]!) < eps)
/** Vertex sets compared order-free: compaction reorders vertices, and only positions matter. */
const sorted = (ps: number[][]): number[][] => [...ps].sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!)
const sameSet = (a: number[][], b: number[][], eps = 1e-4): boolean => {
  const sa = sorted(a), sb = sorted(b)
  return sa.length === sb.length && sa.every((p, i) => close(p, sb[i]!, eps))
}

describe('removeNodes', () => {
  it('drops a node and its subtree, and fails loudly on a name that is not there', () => {
    const doc = newDocument()
    const tank = addMeshNode(doc, 'Tank', [boxesPrimitive(doc, [[[0, 0, 0], [1, 1, 1]]])])
    addMeshNode(doc, 'TankStrap', [boxesPrimitive(doc, [[[0, 0, 0], [1, 1, 1]]])], tank)
    addMeshNode(doc, 'Body', [boxesPrimitive(doc, [[[0, 0, 0], [1, 1, 1]]])])
    removeNodes(doc, ['Tank'])
    expect(meshNodes(doc).map((n) => n.getName())).toEqual(['Body'])
    expect(() => removeNodes(doc, ['Pylon'])).toThrow(/"Pylon"/)
  })
})

describe('splitByBox', () => {
  it('components: takes a whole shell whose bounds lie inside the box, in world space, and leaves the rest', () => {
    const doc = newDocument()
    // Body shell at x 0..10, tailwheel shell at x 20..21, under a node translated +100 in x.
    const body = addMeshNode(doc, 'Corps', [boxesPrimitive(doc, [[[0, 0, 0], [10, 2, 2]], [[20, 0, 0], [21, 1, 1]]])])
    body.setTranslation([100, 0, 0])
    const wheel = splitByBox(doc, { name: 'Tailwheel', select: 'components', boxMin: [119, -1, -1], boxMax: [122, 3, 3] })
    expect(nodeTriangles(wheel)).toBe(12)
    expect(nodeTriangles(body)).toBe(12)
    const wb = getBounds(wheel)
    expect(close(wb.min, [120, 0, 0]) && close(wb.max, [121, 1, 1])).toBe(true)
    // A box that clips a shell does not take it.
    expect(() => splitByBox(doc, { name: 'Half', select: 'components', boxMin: [99, -1, -1], boxMax: [105, 3, 3] })).toThrow(/selected no triangles/)
  })

  it('triangles: takes each triangle whose centroid is inside the box, cutting through a shell', () => {
    const doc = newDocument()
    const body = addMeshNode(doc, 'Corps', [boxesPrimitive(doc, [[[0, 0, 0], [10, 2, 2]]])])
    const cut = splitByBox(doc, { name: 'Belly', select: 'triangles', boxMin: [-1, -1, -1], boxMax: [11, 0.5, 3] })
    expect(nodeTriangles(cut)).toBe(2) // the y = 0 face, whose centroids sit at y = 0
    expect(nodeTriangles(body)).toBe(10)
  })
})

describe('collapseKept + pivotNode + normalizeDocument', () => {
  /** A Sketchfab-shaped part: group `Rotor` (scaled x100, y and z swapped) holding mesh `Rotor_Rotor_0`. */
  function sketchfabDoc() {
    const doc = newDocument()
    const root = doc.createNode('Sketchfab_model').setRotation([-Math.SQRT1_2, 0, 0, Math.SQRT1_2])
    doc.getRoot().listScenes()[0]!.addChild(root)
    const rotor = doc.createNode('Rotor').setScale([100, 100, 100])
    root.addChild(rotor)
    addMeshNode(doc, 'Rotor_Rotor_0', [boxesPrimitive(doc, [[[2, -0.1, -1], [2.1, 0.1, 1]]])], rotor)
    const corps = doc.createNode('Corps').setScale([100, 100, 100])
    root.addChild(corps)
    addMeshNode(doc, 'Corps_Corps_0', [boxesPrimitive(doc, [[[-3, -0.5, -0.5], [2, 0.5, 0.5]], [[0, -0.1, -6], [1, 0.1, 6]]])], corps)
    return doc
  }

  it('collapse turns a group part into one scene-root leaf without moving a vertex', () => {
    const doc = sketchfabDoc()
    const before = worldPositions(findNode(doc, 'Rotor_Rotor_0'))
    const prop = collapseKept(doc, { node: 'Rotor', as: 'Prop' })
    expect(prop.getParentNode()).toBeNull()
    expect(() => findNode(doc, 'Rotor')).toThrow()
    expect(sameSet(worldPositions(prop), before)).toBe(true)
  })

  it('pivot moves the origin onto the stated point, not a vertex, and records the axis', () => {
    const doc = sketchfabDoc()
    const prop = collapseKept(doc, { node: 'Rotor', as: 'Prop' })
    const before = worldPositions(prop)
    pivotNode(doc, prop, { point: [205, 0, 0], axis: '+x' })
    expect(prop.getTranslation()).toEqual([205, 0, 0])
    expect(prop.getExtras()['pivotAxis']).toEqual([1, 0, 0])
    expect(sameSet(worldPositions(prop), before)).toBe(true)
  })

  it('normalize bakes forward/up/origin/fit: every vertex lands at M * source, parts keep only a translation', () => {
    const doc = sketchfabDoc()
    const prop = collapseKept(doc, { node: 'Rotor', as: 'Prop' })
    pivotNode(doc, prop, { point: [205, 0, 0], axis: '+x' })
    // Source frame after the root's -90 degree X rotation: nose +x, span along y... measure it rather than assume:
    const b = getBounds(doc.getRoot().listScenes()[0]!)
    const n: NonNullable<ModelEntry['normalize']> = { forward: '+x', up: '+z', origin: [0, 0, 0], fit: { extent: 'span', meters: 12 } }
    const m = normalizeMatrix(n, b.min, b.max)
    const sourceProp = worldPositions(prop)
    const sourceBody = worldPositions(findNode(doc, 'Corps_Corps_0'))
    normalizeDocument(doc, n)
    const apply = (p: number[]) => [0, 1, 2].map((r) => m[r]! * p[0]! + m[4 + r]! * p[1]! + m[8 + r]! * p[2]! + m[12 + r]!)
    expect(sameSet(worldPositions(findNode(doc, 'Prop')), sourceProp.map(apply))).toBe(true)
    expect(sameSet(worldPositions(findNode(doc, 'Corps_Corps_0')), sourceBody.map(apply))).toBe(true)
    // Span (output Z) is exactly 12 m; the part carries translation only; groups are gone.
    const out = getBounds(doc.getRoot().listScenes()[0]!)
    expect(out.max[2]! - out.min[2]!).toBeCloseTo(12, 6)
    const p = findNode(doc, 'Prop')
    expect(p.getParentNode()).toBeNull()
    expect(p.getRotation()).toEqual([0, 0, 0, 1])
    expect(p.getScale()).toEqual([1, 1, 1])
    expect(close(p.getTranslation(), apply([205, 0, 0]))).toBe(true)
    expect(p.getExtras()['pivotAxis']).toEqual([1, 0, 0])
    expect(() => findNode(doc, 'Sketchfab_model')).toThrow()
  })

  it('normalize maps forward -x / up +y onto +X / +Y, and right-handedness puts the source -z side on +Z', () => {
    const doc = newDocument()
    // Nose at source -x (x = -5), right wingtip at source -z.
    addMeshNode(doc, 'Body', [boxesPrimitive(doc, [[[-5, 0, -0.5], [5, 1, 0.5]], [[0, 0, -6], [1, 0.2, -5]]])])
    normalizeDocument(doc, { forward: '-x', up: '+y', origin: [0, 0, 0], fit: { extent: 'length', meters: 10 } })
    const b = getBounds(doc.getRoot().listScenes()[0]!)
    expect(b.max[0]).toBeCloseTo(5, 5) // the nose, now +X
    expect(b.max[2]).toBeCloseTo(6, 5) // (-x) x (+y) = +z... check: f=(-1,0,0), u=(0,1,0), r=f x u=(0,0,-1): source -z -> +Z
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `npx vitest run tests/tools/models/geometryStages.test.ts --maxWorkers=2`
Expected: FAIL, because the `tools/models/stages/*` imports do not resolve.

- [ ] **Step 3: Implement.** `tools/models/stages/geometry.ts`:

```ts
// tools/models/stages/geometry.ts
import type { Document, mat4, Primitive } from '@gltf-transform/core'
import { compactPrimitive, transformPrimitive } from '@gltf-transform/functions'

/** Gives an unindexed primitive a 0..n-1 index buffer, so every stage can treat
 *  triangles as index triples. */
export function ensureIndices(doc: Document, prim: Primitive): Uint32Array {
  const existing = prim.getIndices()
  if (existing) return Uint32Array.from(existing.getArray() as ArrayLike<number>)
  const n = prim.getAttribute('POSITION')!.getCount()
  const seq = Uint32Array.from({ length: n }, (_, i) => i)
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(seq))
  return seq
}

/** A copy of `prim` drawing only `indices`, with vertex streams of its own
 *  (nothing shared with `prim`), transformed by `matrix` if one is given. */
export function carve(doc: Document, prim: Primitive, indices: Uint32Array, matrix?: mat4): Primitive {
  const copy = prim.clone()
  copy.setIndices(doc.createAccessor().setType('SCALAR').setArray(indices))
  compactPrimitive(copy)
  if (matrix) transformPrimitive(copy, matrix)
  return copy
}

/** World-space position of vertex `i` of `positions` under column-major `m`. */
export function applyMatrix(m: readonly number[], positions: ArrayLike<number>, i: number): [number, number, number] {
  const x = positions[3 * i]!, y = positions[3 * i + 1]!, z = positions[3 * i + 2]!
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  ]
}
```

`tools/models/stages/axes.ts`:

```ts
// tools/models/stages/axes.ts
import type { Axis } from '../manifest.js'

export type Vec3 = [number, number, number]

export function axisVector(a: Axis): Vec3 {
  const v: Vec3 = [0, 0, 0]
  v['xyz'.indexOf(a[1]!)] = a[0] === '-' ? -1 : 1
  return v
}

export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
```

`tools/models/stages/remove.ts`:

```ts
// tools/models/stages/remove.ts
import type { Document } from '@gltf-transform/core'
import { disposeSubtree, findNode } from '../document.js'

/** Stage 1 (and again after `split`, for split names): drops each named node and
 *  everything below it. A name that matches no node fails the build. */
export function removeNodes(doc: Document, names: readonly string[]): void {
  for (const name of names) disposeSubtree(findNode(doc, name))
}
```

`tools/models/stages/split.ts`:

```ts
// tools/models/stages/split.ts
import type { Document, mat4, Node, Primitive } from '@gltf-transform/core'
import { compactPrimitive } from '@gltf-transform/functions'
import { meshNodes, onlyScene, ownMesh } from '../document.js'
import { applyMatrix, carve, ensureIndices } from './geometry.js'

export interface SplitRule {
  readonly name: string
  readonly select: 'components' | 'triangles'
  readonly boxMin: readonly [number, number, number]
  readonly boxMax: readonly [number, number, number]
}

const TRIANGLES = 4

function inside(p: readonly number[], min: readonly number[], max: readonly number[]): boolean {
  return p[0]! >= min[0]! && p[0]! <= max[0]! && p[1]! >= min[1]! && p[1]! <= max[1]! && p[2]! >= min[2]! && p[2]! <= max[2]!
}

/** Which triangles of one primitive the rule takes, as a boolean per triangle.
 *  `components` joins triangles that share a vertex POSITION (bit-identical
 *  float values, so a hard-edged CAD shell with split normals stays one
 *  shell) and takes a shell only if its whole bounding box is inside the box. */
function selectTriangles(indices: Uint32Array, positions: ArrayLike<number>, world: mat4, rule: SplitRule): boolean[] {
  const triCount = indices.length / 3
  const worldPos = (v: number) => applyMatrix(world, positions, v)
  if (rule.select === 'triangles') {
    return Array.from({ length: triCount }, (_, t) => {
      const a = worldPos(indices[3 * t]!), b = worldPos(indices[3 * t + 1]!), c = worldPos(indices[3 * t + 2]!)
      return inside([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3], rule.boxMin, rule.boxMax)
    })
  }
  // Union-find over position keys.
  const keyOf = new Map<string, number>()
  const parent: number[] = []
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]! } return i }
  const vertexKey = (v: number): number => {
    const k = `${positions[3 * v]},${positions[3 * v + 1]},${positions[3 * v + 2]}`
    let id = keyOf.get(k)
    if (id === undefined) { id = parent.length; parent.push(id); keyOf.set(k, id) }
    return id
  }
  const triKeys: number[] = []
  for (let t = 0; t < triCount; t++) {
    const ka = vertexKey(indices[3 * t]!), kb = vertexKey(indices[3 * t + 1]!), kc = vertexKey(indices[3 * t + 2]!)
    parent[find(kb)] = find(ka)
    parent[find(kc)] = find(ka)
    triKeys.push(ka)
  }
  const lo = new Map<number, number[]>(), hi = new Map<number, number[]>()
  for (let t = 0; t < triCount; t++) {
    const root = find(triKeys[t]!)
    for (let k = 0; k < 3; k++) {
      const p = worldPos(indices[3 * t + k]!)
      const l = lo.get(root) ?? [Infinity, Infinity, Infinity], h = hi.get(root) ?? [-Infinity, -Infinity, -Infinity]
      for (let a = 0; a < 3; a++) { l[a] = Math.min(l[a]!, p[a]!); h[a] = Math.max(h[a]!, p[a]!) }
      lo.set(root, l); hi.set(root, h)
    }
  }
  return Array.from({ length: triCount }, (_, t) => {
    const root = find(triKeys[t]!)
    return inside(lo.get(root)!, rule.boxMin, rule.boxMax) && inside(hi.get(root)!, rule.boxMin, rule.boxMax)
  })
}

/**
 * Stage 2: carves the geometry a rule selects out of every mesh in the scene
 * into ONE new node named `rule.name`, hung at the scene root with an
 * identity transform and its vertices in the source frame. What is left
 * behind stays where it was. A rule that selects nothing fails the build.
 */
export function splitByBox(doc: Document, rule: SplitRule): Node {
  const out = doc.createMesh(rule.name)
  for (const node of meshNodes(doc)) {
    const world = node.getWorldMatrix()
    const mesh = node.getMesh()!
    const hits: { prim: Primitive; take: Uint32Array; leave: Uint32Array }[] = []
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== TRIANGLES) continue
      const indices = prim.getIndices() ? Uint32Array.from(prim.getIndices()!.getArray() as ArrayLike<number>) : null
      const idx = indices ?? Uint32Array.from({ length: prim.getAttribute('POSITION')!.getCount() }, (_, i) => i)
      const chosen = selectTriangles(idx, prim.getAttribute('POSITION')!.getArray()!, world, rule)
      if (!chosen.includes(true)) continue
      const take: number[] = [], leave: number[] = []
      chosen.forEach((c, t) => (c ? take : leave).push(idx[3 * t]!, idx[3 * t + 1]!, idx[3 * t + 2]!))
      hits.push({ prim, take: Uint32Array.from(take), leave: Uint32Array.from(leave) })
    }
    if (hits.length === 0) continue
    const owned = ownMesh(doc, node)!
    const ownedPrims = owned.listPrimitives()
    const originalPrims = mesh.listPrimitives()
    for (const hit of hits) {
      const prim = ownedPrims[originalPrims.indexOf(hit.prim)]!
      ensureIndices(doc, prim)
      out.addPrimitive(carve(doc, prim, hit.take, world))
      if (hit.leave.length === 0) owned.removePrimitive(prim)
      else {
        prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(hit.leave))
        compactPrimitive(prim)
      }
    }
  }
  if (out.listPrimitives().length === 0) throw new Error(`split "${rule.name}": the box selected no triangles`)
  const node = doc.createNode(rule.name).setMesh(out)
  onlyScene(doc).addChild(node)
  return node
}
```

`tools/models/stages/collapse.ts`:

```ts
// tools/models/stages/collapse.ts
import type { Document, Node } from '@gltf-transform/core'
import { disposeSubtree, findNode, onlyScene, subtree } from '../document.js'
import { carve, ensureIndices } from './geometry.js'

/**
 * Runs only when an entry has `normalize`. Replaces a kept node's whole
 * subtree (a Sketchfab part is a GROUP node whose mesh hangs one level down,
 * e.g. `Rotor` > `Rotor_Rotor_0`, measured 2026-09-25) with ONE mesh node
 * named `as`, at the scene root, identity transform, vertices in the source
 * frame. `pivot` and `normalize` then see a flat leaf they can re-origin.
 */
export function collapseKept(doc: Document, keep: { readonly node: string; readonly as?: string | undefined }): Node {
  const top = findNode(doc, keep.node)
  const name = keep.as ?? keep.node
  const mesh = doc.createMesh(name)
  for (const n of subtree(top)) {
    const src = n.getMesh()
    if (!src) continue
    const world = n.getWorldMatrix()
    for (const prim of src.listPrimitives()) {
      const copy = prim.clone()
      const indices = ensureIndices(doc, copy)
      mesh.addPrimitive(carve(doc, copy, indices, world))
      copy.dispose()
    }
  }
  if (mesh.listPrimitives().length === 0) throw new Error(`keep "${keep.node}": no mesh under this node`)
  disposeSubtree(top)
  const node = doc.createNode(name).setMesh(mesh)
  onlyScene(doc).addChild(node)
  return node
}
```

`tools/models/stages/pivot.ts`:

```ts
// tools/models/stages/pivot.ts
import type { Document, Node } from '@gltf-transform/core'
import { transformMesh } from '@gltf-transform/functions'
import type { Pivot } from '../manifest.js'
import { ownMesh } from '../document.js'
import { axisVector } from './axes.js'

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

/**
 * Stage 3: moves a collapsed or split node's origin onto `pivot.point`
 * without moving any vertex in the world, and records the hinge axis in the
 * node's extras as `pivotAxis`. `normalize` rotates both into the output
 * frame; GLTFLoader surfaces extras as `Object3D.userData.pivotAxis`, which is
 * where an airframe module reads the axis a part turns about.
 */
export function pivotNode(doc: Document, node: Node, pivot: Pivot): void {
  const world = node.getWorldMatrix()
  if (world.some((v, i) => Math.abs(v - IDENTITY[i]!) > 1e-12) || node.getParentNode() !== null) {
    throw new Error(`pivot "${node.getName()}": expected a scene-root node with an identity transform (collapse or split it first)`)
  }
  const [px, py, pz] = pivot.point
  transformMesh(ownMesh(doc, node)!, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -px, -py, -pz, 1])
  node.setTranslation([px, py, pz])
  node.setExtras({ ...node.getExtras(), pivotAxis: axisVector(pivot.axis) })
}
```

`tools/models/stages/normalize.ts`:

```ts
// tools/models/stages/normalize.ts
import type { Document, mat4 } from '@gltf-transform/core'
import { getBounds, transformMesh } from '@gltf-transform/functions'
import type { ModelEntry } from '../manifest.js'
import { meshNodes, moveToSceneRoot, onlyScene, ownMesh, subtree } from '../document.js'
import { applyMatrix } from './geometry.js'
import { axisVector, cross, dot, type Vec3 } from './axes.js'

type Normalize = NonNullable<ModelEntry['normalize']>

/** Column-major 4x4 multiply, a * b. */
function mul(a: readonly number[], b: readonly number[]): mat4 {
  const out = new Array<number>(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!
  return out as unknown as mat4
}

/** The source-to-output matrix: translate `origin` to 0, rotate `forward` onto
 *  +X and `up` onto +Y (so forward x up lands on +Z, the sim's right), then
 *  scale uniformly so the fitted extent is `fit.meters`. */
export function normalizeMatrix(n: Normalize, sourceMin: readonly number[], sourceMax: readonly number[]): mat4 {
  const f = axisVector(n.forward), u = axisVector(n.up), r: Vec3 = cross(f, u)
  const fitAxis = n.fit.extent === 'span' ? r : f
  const k = fitAxis.findIndex((v) => v !== 0)
  const extent = sourceMax[k]! - sourceMin[k]!
  if (!(extent > 0)) throw new Error(`normalize: the model has no extent along the ${n.fit.extent} axis`)
  const s = n.fit.meters / extent
  // Rows of the rotation are f, u, r: output = (f.v, u.v, r.v).
  const rot = [f[0], u[0], r[0], 0, f[1], u[1], r[1], 0, f[2], u[2], r[2], 0, 0, 0, 0, 1]
  const scale = [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]
  const shift = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -n.origin[0], -n.origin[1], -n.origin[2], 1]
  return mul(scale, mul(rot, shift))
}

/**
 * Stage 4: bakes the source-to-output matrix into every mesh. Afterwards every
 * mesh node hangs directly under the scene with only a translation (its
 * origin, or its pivot, in output meters), every group node is gone, and a
 * `pivotAxis` extra is rotated into the output frame. Runtime applies no
 * basis or scale fix (A6M Zero spec §6.1).
 */
export function normalizeDocument(doc: Document, n: Normalize): void {
  const scene = onlyScene(doc)
  const b = getBounds(scene)
  const m = normalizeMatrix(n, b.min, b.max)
  const f = axisVector(n.forward), u = axisVector(n.up), r = cross(f, u)
  const nodes = meshNodes(doc)
  const plans = nodes.map((node) => {
    const world = node.getWorldMatrix()
    const t = applyMatrix(mul(m, world), [0, 0, 0], 0)
    return { node, world, t }
  })
  for (const { node, world, t } of plans) {
    const bake = mul([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -t[0], -t[1], -t[2], 1], mul(m, world))
    transformMesh(ownMesh(doc, node)!, bake)
    moveToSceneRoot(doc, node)
    node.setTranslation(t).setRotation([0, 0, 0, 1]).setScale([1, 1, 1])
    const axis = node.getExtras()['pivotAxis'] as number[] | undefined
    if (axis) node.setExtras({ ...node.getExtras(), pivotAxis: [dot(f, axis), dot(u, axis), dot(r, axis)] })
  }
  for (const child of scene.listChildren()) {
    for (const n2 of subtree(child).reverse()) if (!n2.getMesh() && n2.listChildren().length === 0) n2.dispose()
  }
}
```

- [ ] **Step 4: Run the test to see it pass.**

Run: `npx vitest run tests/tools/models/geometryStages.test.ts --maxWorkers=2`
Expected: PASS, 7 tests.

- [ ] **Step 5: Verify and commit.**

```bash
npm run verify; rc=$?; echo "rc=$rc"
git add tools/models/stages/ tests/tools/models/geometryStages.test.ts
git commit -m "Models: remove, split, collapse, pivot and normalize stages on synthetic documents (Z1 Task 2)"
```

---

### Task 3: The surface stages (simplify, join, textures, opaque)

**Files:**
- Create: `tools/models/stages/simplify.ts`, `join.ts`, `textures.ts`, `opaque.ts`
- Test: `tests/tools/models/surfaceStages.test.ts`

**Interfaces:**
- Consumes: Task 1's `document.ts` and `measure.ts`.
- Produces:
  - `simplifyDocument(doc, { ratio, error, perNode }): Promise<void>`
  - `joinExcept(doc, parts: ReadonlySet<string>): Promise<void>`
  - `compressTextures(doc, maxSize): Promise<void>`
  - `forceOpaque(doc)`

- [ ] **Step 1: Write the failing test**, `tests/tools/models/surfaceStages.test.ts`:

```ts
// tests/tools/models/surfaceStages.test.ts
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { findNode, modelIO } from '../../../tools/models/document.js'
import { measureDocument, nodeTriangles } from '../../../tools/models/measure.js'
import { simplifyDocument } from '../../../tools/models/stages/simplify.js'
import { joinExcept } from '../../../tools/models/stages/join.js'
import { compressTextures } from '../../../tools/models/stages/textures.js'
import { forceOpaque } from '../../../tools/models/stages/opaque.js'
import { addMeshNode, boxesPrimitive, gridPrimitive, newDocument } from './fixtures.js'

describe('simplifyDocument', () => {
  it('reduces a dense mesh, honors perNode by the nearest named ancestor, and fails on an unknown perNode name', async () => {
    const doc = newDocument()
    const canopy = doc.createNode('Verriere')
    doc.getRoot().listScenes()[0]!.addChild(canopy)
    const inner = addMeshNode(doc, 'Verriere_0', [gridPrimitive(doc, 40, 10)], canopy)
    const body = addMeshNode(doc, 'Corps', [gridPrimitive(doc, 40, 10)])
    expect(nodeTriangles(inner)).toBe(3200)
    await simplifyDocument(doc, { ratio: 1, error: 0.01, perNode: { Verriere: 0.1 } })
    expect(nodeTriangles(inner)).toBeLessThan(3200 * 0.2)
    expect(nodeTriangles(body)).toBe(3200)
    await expect(simplifyDocument(doc, { ratio: 1, error: 0.01, perNode: { Nope: 0.5 } })).rejects.toThrow(/"Nope"/)
  })
})

describe('joinExcept', () => {
  it('joins every same-material mesh except the parts, which survive by name', async () => {
    const doc = newDocument()
    const paint = doc.createMaterial('paint')
    addMeshNode(doc, 'Prop', [boxesPrimitive(doc, [[[5, 0, 0], [6, 1, 1]]], paint)])
    addMeshNode(doc, 'Wing', [boxesPrimitive(doc, [[[0, 0, -6], [1, 0.2, 6]]], paint)])
    addMeshNode(doc, 'Fuselage', [boxesPrimitive(doc, [[[-4, 0, 0], [4, 1, 1]]], paint)])
    await joinExcept(doc, new Set(['Prop']))
    const m = measureDocument(doc)
    expect(m.drawCalls).toBe(2)
    expect(m.triangles).toBe(36)
    expect(nodeTriangles(findNode(doc, 'Prop'))).toBe(12)
  })
})

describe('compressTextures + forceOpaque', () => {
  it('re-encodes as WebP no larger than maxSize, requires only EXT_texture_webp, and makes BLEND opaque', async () => {
    const doc = newDocument()
    const png = await sharp({ create: { width: 64, height: 32, channels: 4, background: { r: 40, g: 80, b: 30, alpha: 1 } } }).png().toBuffer()
    const tex = doc.createTexture('paint').setImage(new Uint8Array(png)).setMimeType('image/png')
    const mat = doc.createMaterial('hull').setBaseColorTexture(tex).setAlphaMode('BLEND')
    addMeshNode(doc, 'Body', [boxesPrimitive(doc, [[[0, 0, 0], [1, 1, 1]]], mat)])
    await compressTextures(doc, 16)
    forceOpaque(doc)
    const m = measureDocument(doc)
    expect(m.maxTextureSize).toBe(16)
    expect(doc.getRoot().listTextures()[0]!.getMimeType()).toBe('image/webp')
    expect(m.extensionsRequired).toEqual(['EXT_texture_webp'])
    expect(m.blendMaterials).toEqual([])
    // And it survives a write/read round trip.
    const io = modelIO()
    const again = await io.readBinary(await io.writeBinary(doc))
    expect(measureDocument(again).extensionsRequired).toEqual(['EXT_texture_webp'])
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `npx vitest run tests/tools/models/surfaceStages.test.ts --maxWorkers=2`
Expected: FAIL, because the imports do not resolve.

- [ ] **Step 3: Implement.** `tools/models/stages/simplify.ts`:

```ts
// tools/models/stages/simplify.ts
import type { Document, Node } from '@gltf-transform/core'
import { simplifyPrimitive, weldPrimitive } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import type { ModelEntry } from '../manifest.js'
import { findNode, meshNodes, ownMesh } from '../document.js'

type Simplify = NonNullable<ModelEntry['simplify']>

/** The ratio for one mesh node: the nearest ancestor-or-self named in
 *  `perNode`, else the entry-wide ratio. */
function ratioFor(node: Node, s: Simplify): number {
  for (let n: Node | null = node; n; n = n.getParentNode()) {
    const r = s.perNode[n.getName()]
    if (r !== undefined) return r
  }
  return s.ratio
}

/**
 * meshoptimizer's simplifier, geometry only, no compression. Runs BEFORE
 * collapse, normalize and join (this plan moves it up from the spec's step 6)
 * because `perNode` names SOURCE nodes, `Verriere` and `Rotor`, which
 * collapse renames and join dissolves. The error bound is relative to each
 * mesh's radius, so the source frame's units do not matter.
 */
export async function simplifyDocument(doc: Document, s: Simplify): Promise<void> {
  await MeshoptSimplifier.ready
  for (const name of Object.keys(s.perNode)) findNode(doc, name)
  for (const node of meshNodes(doc)) {
    const ratio = ratioFor(node, s)
    if (ratio >= 1) continue
    for (const prim of ownMesh(doc, node)!.listPrimitives()) {
      weldPrimitive(prim)
      simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: s.error, lockBorder: false })
    }
  }
}
```

`tools/models/stages/join.ts`:

```ts
// tools/models/stages/join.ts
import type { Document, Node } from '@gltf-transform/core'
import { join } from '@gltf-transform/functions'

/**
 * Stage 6: joins every mesh EXCEPT the named parts (and anything under them)
 * into as few primitives as materials allow, so draw calls come to roughly
 * materials + parts. glTF-Transform's `join` merges siblings, and after
 * `normalize` every mesh node is a sibling at the scene root.
 */
export async function joinExcept(doc: Document, parts: ReadonlySet<string>): Promise<void> {
  const isPart = (node: Node): boolean => {
    for (let n: Node | null = node; n; n = n.getParentNode()) if (parts.has(n.getName())) return true
    return false
  }
  await doc.transform(join({ keepMeshes: false, keepNamed: false, filter: (node) => !isPart(node) }))
}
```

`tools/models/stages/textures.ts`:

```ts
// tools/models/stages/textures.ts
import type { Document } from '@gltf-transform/core'
import { textureCompress } from '@gltf-transform/functions'
import sharp from 'sharp'

/** Stage 7: every texture re-encoded as WebP, no side over `maxSize`. */
export async function compressTextures(doc: Document, maxSize: number): Promise<void> {
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [maxSize, maxSize] }))
}
```

`tools/models/stages/opaque.ts`:

```ts
// tools/models/stages/opaque.ts
import type { Document } from '@gltf-transform/core'

/**
 * Stage 8: every material OPAQUE. The Wildcat's raw download marked its hull
 * and canopy BLEND over a baked AO mask in alpha, and GLTFLoader turned that
 * into a see-through hull (Mark, 2026-09-24). This replaces the binary patch
 * `forceOpaqueMaterials` did in the old build.ts.
 */
export function forceOpaque(doc: Document): void {
  for (const m of doc.getRoot().listMaterials()) m.setAlphaMode('OPAQUE')
}
```

- [ ] **Step 4: Run the test to see it pass.**

Run: `npx vitest run tests/tools/models/surfaceStages.test.ts --maxWorkers=2`
Expected: PASS, 3 tests.

- [ ] **Step 5: Verify and commit.**

```bash
npm run verify; rc=$?; echo "rc=$rc"
git add tools/models/stages/ tests/tools/models/surfaceStages.test.ts
git commit -m "Models: simplify, join-except-parts, WebP textures and opaque stages (Z1 Task 3)"
```

---

### Task 4: The `models:build` driver, the Wildcat's entry, and output tests on the committed file

**Files:**
- Rewrite: `tools/models/build.ts`. The hard-wired `buildWildcatModel`, its `npx` call and the binary-patch `forceOpaqueMaterials` are deleted.
- Create: `tools/models/entries/wildcat.json`
- Test: `tests/tools/models/build.test.ts`, `tests/tools/models/outputs.test.ts`
- Delete: `tests/tools/modelsBuild.test.ts`. Every check it made is now in `outputs.test.ts`: size (now the entry budget), named nodes, one animation, no meshopt, and no BLEND.

**Interfaces:**
- Consumes: every stage from Tasks 2 and 3.
- Produces:
  - `runPipeline(doc, entry): Promise<Document>`
  - `checkOutput(doc, byteLength, entry): string[]`, where empty means acceptable
  - `partNames(entry): string[]`
  - `ALLOWED_REQUIRED_EXTENSIONS`
  - `runBuild(entries, argv, deps: BuildDeps): Promise<number>`
  - the `npm run models:build -- [<id>...] [--force]` CLI

  **The stage order, for Lane C:** remove (source nodes), keep-presence check, split, remove (split names), simplify, then (with `normalize` only) collapse, pivot and normalize, then join, textures, opaque, prune, and provenance. S1's `shipFit` and `shipMaterials` insert after normalize and before join (ship spec §4.1).

- [ ] **Step 1: Write the failing tests.** `tests/tools/models/build.test.ts`:

```ts
// tests/tools/models/build.test.ts
import { describe, expect, it } from 'vitest'
import type { Document } from '@gltf-transform/core'
import { checkOutput, runBuild, runPipeline, type BuildDeps } from '../../../tools/models/build.js'
import { parseModelEntry, type ModelEntry } from '../../../tools/models/manifest.js'
import { findNode, modelIO } from '../../../tools/models/document.js'
import { measureDocument, nodeTriangles } from '../../../tools/models/measure.js'
import { addMeshNode, boxesPrimitive, newDocument } from './fixtures.js'

/** A Sketchfab-shaped toy airplane: nose +x, up +y, right +z, every part a group holding a mesh. */
function toyPlane(): Document {
  const doc = newDocument()
  const paint = doc.createMaterial('paint').setAlphaMode('BLEND')
  const root = doc.createNode('RootNode')
  doc.getRoot().listScenes()[0]!.addChild(root)
  const part = (name: string, boxes: Parameters<typeof boxesPrimitive>[1]) => {
    const g = doc.createNode(name)
    root.addChild(g)
    addMeshNode(doc, `${name}_${name}_0`, [boxesPrimitive(doc, boxes, paint)], g)
  }
  part('Rotor', [[[5, -1, -0.1], [5.2, 1, 0.1]]])
  part('Corps', [[[-4, -0.5, -0.5], [5, 0.5, 0.5]], [[0, -0.1, -6], [1, 0.1, 6]], [[-4.2, -0.8, -0.1], [-3.9, -0.6, 0.1]], [[1, -1, -0.3], [2, -0.6, 0.3]]])
  part('Verriere', [[[0, 0.5, -0.3], [1, 0.9, 0.3]]])
  return doc
}

const entry: ModelEntry = parseModelEntry({
  id: 'toy',
  input: 'tools/models/cache/toy.glb',
  output: 'content/aircraft/toy.glb',
  source: { url: 'https://sketchfab.com/3d-models/toy-0123456789abcdef0123456789abcdef', uid: '0123456789abcdef0123456789abcdef', author: 'tester', license: 'CC-BY-4.0' },
  normalize: { forward: '+x', up: '+y', origin: [0, 0, 0], fit: { extent: 'span', meters: 12 } },
  keep: [{ node: 'Rotor', as: 'Prop', pivot: { point: [5.1, 0, 0], axis: '+x' } }],
  split: [
    { name: 'Tailwheel', boxMin: [-4.5, -1, -0.5], boxMax: [-3.5, -0.55, 0.5], pivot: { point: [-4, -0.6, 0], axis: '+z' } },
    { name: 'DropTank', boxMin: [0.5, -1.5, -1], boxMax: [2.5, -0.55, 1] },
  ],
  remove: ['DropTank'],
  textures: { maxSize: 1024, format: 'webp' },
  budget: { maxBytes: 100_000, maxTriangles: 100, maxDrawCalls: 3 },
  noseNode: 'Prop',
})

describe('runPipeline on a synthetic airplane', () => {
  it('keeps and splits the parts, drops the tank, joins the rest, and meets its contract', async () => {
    const doc = await runPipeline(toyPlane(), entry)
    const io = modelIO()
    const bytes = await io.writeBinary(doc)
    expect(checkOutput(doc, bytes.byteLength, entry)).toEqual([])
    const m = measureDocument(doc)
    // Prop 12 + Tailwheel 12 + joined body (fuselage 12 + wing 12 + canopy 12) = 60; the tank's 12 are gone.
    expect(m.triangles).toBe(60)
    expect(m.drawCalls).toBe(3)
    expect(nodeTriangles(findNode(doc, 'Tailwheel'))).toBe(12)
    expect(m.blendMaterials).toEqual([])
    const again = await io.readBinary(bytes)
    const prop = findNode(again, 'Prop')
    expect(prop.getExtras()['pivotAxis']).toEqual([1, 0, 0])
    expect(prop.getTranslation()[0]).toBeCloseTo(5.1, 6) // span 12 over source span 12: scale 1
    expect(findNode(again, 'Tailwheel').getExtras()['pivotAxis']).toEqual([0, 0, 1])
    expect(again.getRoot().getAsset().extras).toMatchObject({ source: entry.source.url, license: 'CC-BY-4.0', author: 'tester' })
  })

  it('checkOutput names every broken limit with its measured value', async () => {
    const doc = await runPipeline(toyPlane(), entry)
    const tight = parseModelEntry({ ...entry, budget: { maxBytes: 10, maxTriangles: 59, maxDrawCalls: 2 } })
    const problems = checkOutput(doc, 5000, tight)
    expect(problems).toContain('5000 bytes > budget 10')
    expect(problems).toContain('60 triangles > budget 59')
    expect(problems).toContain('3 draw calls > budget 2')
  })

  it('fails the build when a listed part is missing from the input', async () => {
    const bad = parseModelEntry({ ...entry, keep: [{ node: 'Leg d', as: 'GearR' }], noseNode: undefined })
    await expect(runPipeline(toyPlane(), bad)).rejects.toThrow(/"Leg d"/)
  })
})

describe('runBuild (the models:build driver)', () => {
  function fakeDeps(present: string[]) {
    const lines: string[] = [], written: string[] = []
    const deps: BuildDeps = {
      exists: (p) => present.includes(p),
      read: async () => toyPlane(),
      write: (p) => { written.push(p) },
      encode: (doc) => modelIO().writeBinary(doc),
      log: (l) => { lines.push(l) },
    }
    return { deps, lines, written }
  }
  const frozen = parseModelEntry({ ...entry, id: 'old', output: 'content/aircraft/old.glb', frozen: 'pinned bytes' })

  it('with no id: builds what it can, and names every skip and why', async () => {
    const missing = parseModelEntry({ ...entry, id: 'gone', output: 'content/aircraft/gone.glb', input: 'tools/models/cache/gone.glb' })
    const f = fakeDeps([entry.input, frozen.input])
    expect(await runBuild([entry, frozen, missing], [], f.deps)).toBe(0)
    expect(f.written).toEqual(['content/aircraft/toy.glb'])
    expect(f.lines.some((l) => l.startsWith('skipped old: frozen (pinned bytes)'))).toBe(true)
    expect(f.lines.some((l) => l.startsWith('skipped gone: raw input tools/models/cache/gone.glb'))).toBe(true)
  })

  it('an explicit frozen id is refused without --force and built with it', async () => {
    const a = fakeDeps([frozen.input])
    expect(await runBuild([frozen], ['old'], a.deps)).toBe(1)
    expect(a.written).toEqual([])
    const b = fakeDeps([frozen.input])
    expect(await runBuild([frozen], ['old', '--force'], b.deps)).toBe(0)
    expect(b.written).toEqual(['content/aircraft/old.glb'])
  })

  it('an unknown id, or an explicit id with no raw input, exits 1', async () => {
    expect(await runBuild([entry], ['nope'], fakeDeps([]).deps)).toBe(1)
    expect(await runBuild([entry], ['toy'], fakeDeps([]).deps)).toBe(1)
  })

  it('over budget: exits 1 and writes nothing', async () => {
    const tight = parseModelEntry({ ...entry, budget: { ...entry.budget, maxTriangles: 10 } })
    const f = fakeDeps([entry.input])
    expect(await runBuild([tight], ['toy'], f.deps)).toBe(1)
    expect(f.written).toEqual([])
    expect(f.lines[0]).toMatch(/^FAILED toy, nothing written: 60 triangles > budget 10/)
  })
})
```

`tests/tools/models/outputs.test.ts`:

```ts
// tests/tools/models/outputs.test.ts
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { checkOutput } from '../../../tools/models/build.js'
import { loadModelEntries } from '../../../tools/models/manifest.js'
import { modelIO } from '../../../tools/models/document.js'
import { measureDocument } from '../../../tools/models/measure.js'

const LICENSE_LABEL = { 'CC-BY-4.0': 'CC-BY 4.0', 'CC0-1.0': 'CC0 1.0' } as const
const entries = loadModelEntries()
const assets = readFileSync('ASSETS.md', 'utf8')

describe.each(entries.map((e) => [e.id, e] as const))('committed output %s', (_id, entry) => {
  it('exists, and meets its entry: budget, parts, extensions, materials, texture size, nose', async () => {
    expect(existsSync(entry.output), `${entry.output} is not committed`).toBe(true)
    const doc = await modelIO().readBinary(new Uint8Array(readFileSync(entry.output)))
    expect(checkOutput(doc, statSync(entry.output).size, entry)).toEqual([])
  })

  it('carries its provenance inside the file', async () => {
    const doc = await modelIO().readBinary(new Uint8Array(readFileSync(entry.output)))
    const extras = doc.getRoot().getAsset().extras as Record<string, unknown>
    expect(extras['source']).toBe(entry.source.url)
    expect(String(extras['license'])).toMatch(new RegExp(`^${entry.source.license}`))
  })

  it('has an ASSETS.md 3D-models row naming the same source and license', () => {
    const row = assets.split('\n').find((l) => l.startsWith(`| \`${entry.output}\` |`))
    expect(row, `no ASSETS.md row for ${entry.output}`).toBeDefined()
    expect(row).toContain(entry.source.url)
    expect(row).toContain(LICENSE_LABEL[entry.source.license])
  })
})

describe('the Wildcat specifically', () => {
  it('keeps its one baked clip, which wildcat.ts reads gear poses from', async () => {
    const doc = await modelIO().readBinary(new Uint8Array(readFileSync('content/aircraft/wildcat.glb')))
    expect(measureDocument(doc).animations).toBe(1)
  })
})
```

- [ ] **Step 2: Run them to see them fail.**

Run: `npx vitest run tests/tools/models/build.test.ts tests/tools/models/outputs.test.ts --maxWorkers=2`
Expected: FAIL. `runPipeline` is not exported by `tools/models/build.ts`, and `tools/models/entries` does not exist.

- [ ] **Step 3: Write the Wildcat's entry**, `tools/models/entries/wildcat.json`. It has no `normalize`, because `wildcat.ts` keeps its measured rotation and scale constants (spec §6.3). The budget is the committed file's measured figures, rounded up.

```json
{
  "id": "wildcat",
  "input": "tools/models/cache/grumman_f4f_wildcat_airplane.glb",
  "output": "content/aircraft/wildcat.glb",
  "source": {
    "url": "https://sketchfab.com/3d-models/grumman-f4f-wildcat-airplane-ac26b8bf6be44ba7b903ca7fbdedf7e4",
    "uid": "ac26b8bf6be44ba7b903ca7fbdedf7e4",
    "author": "rojatsu",
    "license": "CC-BY-4.0"
  },
  "frozen": "wildcat.ts poses GRP_Rueda_* with gear poses measured in this file's own node space (2026-09-24), and tests/build/dist.test.ts pins its 5,573,316 bytes; a rebuild through join would change both",
  "keep": [{ "node": "Helice" }, { "node": "GRP_Rueda_Der" }, { "node": "GRP_Rueda_Izq" }],
  "textures": { "maxSize": 1024, "format": "webp" },
  "budget": { "maxBytes": 5600000, "maxTriangles": 101000, "maxDrawCalls": 47 }
}
```

- [ ] **Step 4: Rewrite `tools/models/build.ts`:**

```ts
// tools/models/build.ts
/**
 * `npm run models:build -- [<id>...] [--force]`: raw download in
 * tools/models/cache/ (gitignored) -> committed glb in content/aircraft/ or
 * content/ships/, driven by one `tools/models/entries/<id>.json` per model
 * (A6M Zero spec §6).
 *
 * LOAD-BEARING: no stage compresses geometry. No EXT_meshopt_compression and
 * no Draco: GLTFLoader has no decoder wired in this project, and the
 * Wildcat's first build was unloadable at runtime for exactly that reason
 * (20bcaa4). `checkOutput` fails any output whose extensionsRequired holds
 * anything but EXT_texture_webp.
 *
 * With no id, builds every entry whose raw input exists locally, skips
 * frozen entries, and names every entry it skipped and why.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getBounds, prune } from '@gltf-transform/functions'
import { Logger, type Document } from '@gltf-transform/core'
import { loadModelEntries, type ModelEntry } from './manifest.js'
import { findNode, modelIO } from './document.js'
import { measureDocument, type ModelMeasure } from './measure.js'
import { removeNodes } from './stages/remove.js'
import { splitByBox } from './stages/split.js'
import { collapseKept } from './stages/collapse.js'
import { pivotNode } from './stages/pivot.js'
import { normalizeDocument } from './stages/normalize.js'
import { simplifyDocument } from './stages/simplify.js'
import { joinExcept } from './stages/join.js'
import { compressTextures } from './stages/textures.js'
import { forceOpaque } from './stages/opaque.js'

export const ALLOWED_REQUIRED_EXTENSIONS: readonly string[] = ['EXT_texture_webp']

/** The names of an entry's articulated output nodes: keep `as` names and
 *  split names that are not removed. */
export function partNames(entry: ModelEntry): string[] {
  return [
    ...entry.keep.map((k) => k.as ?? k.node),
    ...entry.split.map((s) => s.name).filter((n) => !entry.remove.includes(n)),
  ]
}

/** Every stage, in order, on a document already read. Mutates and returns it. */
export async function runPipeline(doc: Document, entry: ModelEntry): Promise<Document> {
  doc.setLogger(new Logger(Logger.Verbosity.WARN))
  const splitNames = new Set(entry.split.map((s) => s.name))
  // 1. remove (source nodes)
  removeNodes(doc, entry.remove.filter((n) => !splitNames.has(n)))
  // Presence of every kept node, before anything renames it.
  for (const k of entry.keep) findNode(doc, k.node)
  // 2. split, then drop the split names `remove` lists
  for (const s of entry.split) splitByBox(doc, s)
  removeNodes(doc, entry.remove.filter((n) => splitNames.has(n)))
  // simplify (moved ahead of join: see stages/simplify.ts)
  if (entry.simplify) await simplifyDocument(doc, entry.simplify)
  if (entry.normalize) {
    // collapse + 3. pivot + 4. normalize
    for (const k of entry.keep) {
      const node = collapseKept(doc, k)
      if (k.pivot) pivotNode(doc, node, k.pivot)
    }
    for (const s of entry.split) {
      if (s.pivot && !entry.remove.includes(s.name)) pivotNode(doc, findNode(doc, s.name), s.pivot)
    }
    normalizeDocument(doc, entry.normalize)
  }
  // 5. join everything except the parts
  await joinExcept(doc, new Set([...entry.keep.map((k) => k.as ?? k.node), ...entry.keep.map((k) => k.node), ...splitNames]))
  // 6. textures, 7. opaque
  await compressTextures(doc, entry.textures.maxSize)
  if (entry.opaque) forceOpaque(doc)
  await doc.transform(prune({ keepSolidTextures: true, keepLeaves: false }))
  // Provenance travels inside the file (checked by tests/tools/modelOutputs.test.ts).
  const asset = doc.getRoot().getAsset()
  asset.extras = { ...(asset.extras ?? {}), source: entry.source.url, author: entry.source.author, license: entry.source.license }
  return doc
}

/** Every way an output can break its entry's contract, as messages naming the
 *  measured value and the limit. Empty = acceptable. Used by the build (before
 *  anything is written) and by the committed-output tests. */
export function checkOutput(doc: Document, byteLength: number, entry: ModelEntry): string[] {
  const m: ModelMeasure = measureDocument(doc)
  const out: string[] = []
  const b = entry.budget
  if (byteLength > b.maxBytes) out.push(`${byteLength} bytes > budget ${b.maxBytes}`)
  if (m.triangles > b.maxTriangles) out.push(`${m.triangles} triangles > budget ${b.maxTriangles}`)
  if (m.drawCalls > b.maxDrawCalls) out.push(`${m.drawCalls} draw calls > budget ${b.maxDrawCalls}`)
  const badExt = m.extensionsRequired.filter((e) => !ALLOWED_REQUIRED_EXTENSIONS.includes(e))
  if (badExt.length) out.push(`extensionsRequired has ${badExt.join(', ')}: GLTFLoader has no decoder for it`)
  if (entry.opaque && m.blendMaterials.length) out.push(`BLEND materials: ${m.blendMaterials.join(', ')}`)
  if (m.maxTextureSize > entry.textures.maxSize) out.push(`a ${m.maxTextureSize}px texture > maxSize ${entry.textures.maxSize}`)
  const names = doc.getRoot().listNodes().map((n) => n.getName())
  for (const p of partNames(entry)) {
    const count = names.filter((n) => n === p).length
    if (count !== 1) out.push(`part "${p}": expected exactly one node, found ${count}`)
  }
  if (entry.noseNode !== undefined && names.includes(entry.noseNode)) {
    const centerX = (name: string): number => { const bb = getBounds(findNode(doc, name)); return (bb.min[0] + bb.max[0]) / 2 }
    const nose = centerX(entry.noseNode)
    const ahead = doc.getRoot().listNodes().filter((n) => n.getMesh() && n.getName() !== entry.noseNode && centerX(n.getName()) >= nose)
    if (ahead.length) out.push(`noseNode "${entry.noseNode}" is not the frontmost part: ${ahead.map((n) => n.getName()).join(', ')} center at or ahead of it`)
  }
  return out
}

export interface BuildDeps {
  exists(path: string): boolean
  read(path: string): Promise<Document>
  write(path: string, bytes: Uint8Array): void
  encode(doc: Document): Promise<Uint8Array>
  log(line: string): void
}

/** The driver, with its file system injected so tests never touch the disk.
 *  Returns the process exit code. */
export async function runBuild(entries: readonly ModelEntry[], argv: readonly string[], deps: BuildDeps): Promise<number> {
  const force = argv.includes('--force')
  const ids = argv.filter((a) => a !== '--force')
  const unknown = ids.filter((id) => !entries.some((e) => e.id === id))
  if (unknown.length) {
    deps.log(`unknown model id: ${unknown.join(', ')} (entries: ${entries.map((e) => e.id).join(', ')})`)
    return 1
  }
  const explicit = ids.length > 0
  const chosen = explicit ? entries.filter((e) => ids.includes(e.id)) : entries
  let failed = false
  for (const entry of chosen) {
    if (entry.frozen !== undefined && !(explicit && force)) {
      deps.log(`${explicit ? 'refused' : 'skipped'} ${entry.id}: frozen (${entry.frozen})${explicit ? '; pass --force to rebuild it anyway' : ''}`)
      if (explicit) failed = true
      continue
    }
    if (!deps.exists(entry.input)) {
      deps.log(`${explicit ? 'missing' : 'skipped'} ${entry.id}: raw input ${entry.input} is not here; re-fetch with tools/models/sketchfab-fetch.sh ${entry.source.uid} <name> and copy it there`)
      if (explicit) failed = true
      continue
    }
    const doc = await runPipeline(await deps.read(entry.input), entry)
    const bytes = await deps.encode(doc)
    const problems = checkOutput(doc, bytes.byteLength, entry)
    if (problems.length) {
      deps.log(`FAILED ${entry.id}, nothing written: ${problems.join('; ')}`)
      failed = true
      continue
    }
    deps.write(entry.output, bytes)
    const m = measureDocument(doc)
    deps.log(`built ${entry.id} -> ${entry.output}: ${bytes.byteLength} bytes, ${m.triangles} triangles, ${m.drawCalls} draw calls`)
  }
  return failed ? 1 : 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const io = modelIO()
  const code = await runBuild(loadModelEntries(), process.argv.slice(2), {
    exists: existsSync,
    read: async (p) => io.readBinary(new Uint8Array(readFileSync(p))),
    write: (p, bytes) => writeFileSync(p, bytes),
    encode: (doc) => io.writeBinary(doc),
    log: (line) => console.log(line),
  })
  process.exit(code)
}
```

- [ ] **Step 5: Delete the superseded test**, then run the new ones.

```bash
git rm tests/tools/modelsBuild.test.ts
npx vitest run tests/tools/models/ --maxWorkers=2
```

Expected: PASS, 37 tests in six files: manifest 15, inspect 1, geometryStages 7, surfaceStages 3, build 7, outputs 4.

- [ ] **Step 6: Prove that the driver refuses the frozen Wildcat**, which is Review Focus 1. This worktree has no raw input, so a bare build skips the Wildcat for two reasons. The frozen check comes first:

```bash
npm run models:build; echo "rc=$?"
npm run models:build -- wildcat; echo "rc=$?"
git status --short content/
```

Expected:
- The bare build prints `skipped wildcat: frozen (...)` and `rc=0`.
- The build by id prints `refused wildcat: frozen (...); pass --force to rebuild it anyway` and `rc=1`.
- `git status` shows nothing under `content/`.

Do **not** run it with `--force`.

- [ ] **Step 7: Verify and commit.**

```bash
npm run verify; rc=$?; echo "rc=$rc"
git add tools/models/build.ts tools/models/entries/wildcat.json tests/tools/models/build.test.ts tests/tools/models/outputs.test.ts
git commit -m "Models: manifest-driven models:build; the Wildcat's frozen entry and output tests on the committed glb (Z1 Task 4)"
```

---

### Task 5: Keep `content/models/` out of `dist/`

**Files:**
- Modify: `vite.config.ts` (the `copyContent` filter only)
- Modify: `tests/build/dist.test.ts` (one constant pair and one guarded assertion)
- Test: `tests/build/contentFilter.test.ts`

**Interfaces:**
- Produces: `EXCLUDED_CONTENT_DIRS` and `contentCopyFilter(contentRoot): (source) => boolean`, both exported from `vite.config.ts`. H1 adds a Rollup input to the same file and leaves both alone.

- [ ] **Step 1: Write the failing test**, `tests/build/contentFilter.test.ts`:

```ts
// tests/build/contentFilter.test.ts
import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { contentCopyFilter } from '../../vite.config.js'

describe('contentCopyFilter (vite.config.ts)', () => {
  const root = resolve('/repo/content')
  const copies = contentCopyFilter(root)
  it.each([
    ['content/models', false],
    ['content/models/candidates/a6m2-zeke.glb', false],
    ['content/terrain/tiles', false],
    ['content/terrain/tiles/L0/0_0.bin', false],
    ['content/aircraft/wildcat.glb', true],
    ['content/terrain/L1.bin', true],
    ['content/models-notes/readme.md', true],
  ])('%s -> copied: %s', (path, expected) => {
    expect(copies(resolve('/repo', path))).toBe(expected)
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `npx vitest run tests/build/contentFilter.test.ts --maxWorkers=2`
Expected: FAIL, because `contentCopyFilter` is not exported.

- [ ] **Step 3: Implement.** In `vite.config.ts`, insert the following immediately above `function copyContent(): Plugin {`:

```ts
/**
 * Gitignored directories under `content/` that must never reach `dist/`:
 * `terrain/tiles/` (above), and `models/`, the staging area
 * `tools/models/sketchfab-fetch.sh` downloads candidates into
 * (131,197,993 bytes in the main checkout, measured 2026-09-25; A6M Zero
 * spec §6.4). Committed models live in `content/aircraft/` and
 * `content/ships/`, which are copied.
 */
export const EXCLUDED_CONTENT_DIRS: readonly string[] = ['terrain/tiles', 'models']

/** `cp`'s filter for `contentRoot`. Returning false for a directory already
 *  stops `cp` descending into it; the prefix test is the belt to those
 *  braces, and is written against `dir + sep` so a sibling that merely starts
 *  with the same name (`models-notes/`) is still copied. */
export function contentCopyFilter(contentRoot: string): (source: string) => boolean {
  const excluded = EXCLUDED_CONTENT_DIRS.map((d) => resolve(contentRoot, ...d.split('/')))
  return (source) => !excluded.some((dir) => source === dir || source.startsWith(dir + sep))
}
```

Then replace the body of `closeBundle` with:

```ts
    async closeBundle(): Promise<void> {
      await cp(
        resolve(config.root, 'content'),
        resolve(config.root, config.build.outDir, 'content'),
        { recursive: true, filter: contentCopyFilter(resolve(config.root, 'content')) },
      )
    },
```

- [ ] **Step 4: Add the build assertion.** In `tests/build/dist.test.ts`, directly under `const REPO_TERRAIN_TILES_DIR = ...`, add:

```ts
/** The gitignored candidate-model staging area (`tools/models/sketchfab-fetch.sh`
 *  writes there). Same guard as the tiles: asserted only where the source
 *  directory exists, so a fresh clone cannot pass it for the wrong reason;
 *  tests/build/contentFilter.test.ts pins the filter itself everywhere. */
const CANDIDATE_MODELS_PATH = 'content/models'
const REPO_CANDIDATE_MODELS_DIR = fileURLToPath(new URL(`../../${CANDIDATE_MODELS_PATH}`, import.meta.url))
```

After the existing `if (existsSync(REPO_TERRAIN_TILES_DIR)) { ... }` block, add:

```ts
      if (existsSync(REPO_CANDIDATE_MODELS_DIR)) {
        expect(
          existsSync(join(outDir, CANDIDATE_MODELS_PATH)),
          'the build shipped content/models/, the gitignored candidate staging area (vite.config.ts EXCLUDED_CONTENT_DIRS)',
        ).toBe(false)
      }
```

- [ ] **Step 5: Run the filter test, then verify.** `dist.test.ts` runs inside `verify`. Do not run it separately as well, because each run writes two builds into tmpfs.

```bash
npx vitest run tests/build/contentFilter.test.ts --maxWorkers=2
npm run verify; rc=$?; echo "rc=$rc"
```

Expected: 7 filter cases pass, and `rc=0`.

- [ ] **Step 6: Commit.**

```bash
git add vite.config.ts tests/build/contentFilter.test.ts tests/build/dist.test.ts
git commit -m "Build: keep the gitignored content/models/ candidates out of dist/ (Z1 Task 5)"
```

---

### Task 6: The model cache, `Airframe.update`/`dispose`/`parts`, and one update per aircraft per frame

**Files:**
- Create: `src/render/models/dispose.ts`. `disposeMeshTree` moves here from `scenarioEntities.ts`, which re-exports it so existing imports keep working.
- Create: `src/render/models/modelCache.ts`
- Rewrite: `src/render/scene/airframe.ts`
- Modify: `src/render/scene/wildcat.ts`, `src/render/scene/hellcat.ts`, `src/render/scene/stores.ts`, and `src/render/scenarioEntities.ts` (the airframe half: disposal and ordering)
- Create: `src/render/airframeUpdate.ts`
- Modify: `src/render/main.ts`, in three places only: the `PROP_MAX_RAD_PER_SEC` block (deleted), the `setGear` loop (replaced) and the player `spinProp` block (deleted)
- Test: `tests/render/modelCache.test.ts` and `tests/render/airframeUpdate.test.ts` (create). Modify `tests/render/wildcat.test.ts`, `tests/render/scene.test.ts` and `tests/render/scenarioEntities.test.ts`.

**Interfaces:**
- Produces:
  - `ModelInstance { root; node(name): Object3D; release(): void }`, `type ParseModel`, `parseGltf`, `createModelCache(parse?): ModelCache` (`{ acquire(url); refCount(url) }`) and `acquireModel(url)` (`src/render/models/modelCache.ts`)
  - `disposeMeshTree(root)` (`src/render/models/dispose.ts`)
  - `type PartId = 'prop' | 'gear' | 'flaps' | 'stores'`, `interface AirframeUpdate { gearFraction; flapFraction; throttle; controls: { roll; pitch; yaw }; frameS; cameraDistanceM }`, `interface Airframe { root; parts; setStores; update(u); dispose() }`, `PROP_MAX_RAD_PER_SEC = 40` and `propAngle(prevRad, throttle, frameS)` (`src/render/scene/airframe.ts`)
  - `loadWildcat(acquire?)`, which sets `parts` to `['prop', 'gear', 'stores']`
  - `createHellcat()`, which sets `parts` to `['prop', 'stores']`
  - `attachStores(...)`, which now also returns `dispose()`

  - `airframeUpdateFor(aircraft, playerControls | null, position, eye, frameS): AirframeUpdate` (`src/render/airframeUpdate.ts`)

  `spinProp` and `setGear` are **gone**. Their one caller, `main.ts`, changes in Step 9, the same commit.

- [ ] **Step 1: Write the failing tests.** Create `tests/render/modelCache.test.ts`:

```ts
// tests/render/modelCache.test.ts
import { describe, expect, it, vi } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture, type Object3D } from 'three'
import { createModelCache } from '../../src/render/models/modelCache.js'

/** A synthetic "parsed glTF": a group holding a named prop mesh with a textured material. */
function syntheticModel() {
  const map = new Texture()
  const material = new MeshStandardMaterial({ map })
  const geometry = new BoxGeometry(1, 1, 1)
  const root = new Group()
  const prop = new Mesh(geometry, material)
  prop.name = 'Prop'
  root.add(prop)
  return { root, map, material, geometry }
}

function countingParse() {
  const made: ReturnType<typeof syntheticModel>[] = []
  const parse = vi.fn(async (_url: string): Promise<Object3D> => {
    const m = syntheticModel()
    made.push(m)
    return m.root
  })
  return { parse, made }
}

describe('createModelCache', () => {
  it('parses a URL once, however many instances, concurrent or later', async () => {
    const { parse } = countingParse()
    const cache = createModelCache(parse)
    const [a, b] = await Promise.all([cache.acquire('zero.glb'), cache.acquire('zero.glb')])
    const c = await cache.acquire('zero.glb')
    expect(parse).toHaveBeenCalledTimes(1)
    expect(cache.refCount('zero.glb')).toBe(3)
    expect(new Set([a.root, b.root, c.root]).size).toBe(3)
  })

  it('instances share geometry and material by identity, and pose independently', async () => {
    const cache = createModelCache(countingParse().parse)
    const a = await cache.acquire('zero.glb')
    const b = await cache.acquire('zero.glb')
    const pa = a.node('Prop') as Mesh, pb = b.node('Prop') as Mesh
    expect(pa).not.toBe(pb)
    expect(pa.material).toBe(pb.material)
    expect(pa.geometry).toBe(pb.geometry)
    pa.rotation.x = 1
    expect(pb.rotation.x).toBeCloseTo(0, 12)
  })

  it('node() throws naming the model and the node', async () => {
    const cache = createModelCache(countingParse().parse)
    const a = await cache.acquire('zero.glb')
    expect(() => a.node('Tailwheel')).toThrow(/zero\.glb.*"Tailwheel"/)
  })

  it('disposes geometry, material and texture only on the LAST release, and a double release counts once', async () => {
    const { parse, made } = countingParse()
    const cache = createModelCache(parse)
    const a = await cache.acquire('zero.glb')
    const b = await cache.acquire('zero.glb')
    const { geometry, material, map } = made[0]!
    const spies = [vi.spyOn(geometry, 'dispose'), vi.spyOn(material, 'dispose'), vi.spyOn(map, 'dispose')]
    a.release()
    a.release()
    expect(cache.refCount('zero.glb')).toBe(1)
    for (const s of spies) expect(s).not.toHaveBeenCalled()
    b.release()
    expect(cache.refCount('zero.glb')).toBe(0)
    for (const s of spies) expect(s).toHaveBeenCalledTimes(1)
  })

  it('after the last release, the next acquire parses afresh rather than reuse freed GPU resources', async () => {
    const { parse } = countingParse()
    const cache = createModelCache(parse)
    ;(await cache.acquire('zero.glb')).release()
    await cache.acquire('zero.glb')
    expect(parse).toHaveBeenCalledTimes(2)
  })

  it('a failed parse rejects every waiter, holds no reference, and is retried by the next acquire', async () => {
    let fail = true
    const parse = vi.fn(async (_url: string): Promise<Object3D> => {
      if (fail) throw new Error('404 zero.glb')
      return syntheticModel().root
    })
    const cache = createModelCache(parse)
    await expect(Promise.all([cache.acquire('zero.glb'), cache.acquire('zero.glb')])).rejects.toThrow('404 zero.glb')
    expect(cache.refCount('zero.glb')).toBe(0)
    fail = false
    await expect(cache.acquire('zero.glb')).resolves.toBeDefined()
    expect(parse).toHaveBeenCalledTimes(2)
  })

  it('different URLs are different parses', async () => {
    const { parse } = countingParse()
    const cache = createModelCache(parse)
    await cache.acquire('zero.glb')
    await cache.acquire('zero-lod1.glb')
    expect(parse).toHaveBeenCalledTimes(2)
  })
})
```

Replace `tests/render/wildcat.test.ts` with the following. Its first two `describe` blocks are unchanged; the imports grow and a third block is added:

```ts
// tests/render/wildcat.test.ts
import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three'
import { applyGearFraction, GEAR_DOWN, GEAR_UP, loadWildcat, WILDCAT_TO_SIM_ROTATION_Y, WILDCAT_SCALE } from '../../src/render/scene/wildcat.js'
import { createModelCache } from '../../src/render/models/modelCache.js'
import { WILDCAT_MODEL_URL } from '../../src/render/content.js'

describe('applyGearFraction', () => {
  it('fraction 1 (extended) matches the measured gear-down pose', () => {
    const node = new Object3D()
    applyGearFraction(node, GEAR_DOWN.der, GEAR_UP.der, 1)
    expect(node.position.distanceTo(GEAR_DOWN.der.pos)).toBeLessThan(1e-6)
    expect(node.quaternion.angleTo(GEAR_DOWN.der.quat)).toBeLessThan(1e-6)
  })

  it('fraction 0 (retracted) matches the measured gear-up pose', () => {
    const node = new Object3D()
    applyGearFraction(node, GEAR_DOWN.der, GEAR_UP.der, 0)
    expect(node.position.distanceTo(GEAR_UP.der.pos)).toBeLessThan(1e-6)
    expect(node.quaternion.angleTo(GEAR_UP.der.quat)).toBeLessThan(1e-6)
  })

  it('interpolates continuously mid-travel (gear.travelSeconds is 7s, not instant)', () => {
    const node = new Object3D()
    applyGearFraction(node, GEAR_DOWN.der, GEAR_UP.der, 0.3)
    const at30 = node.position.clone()
    applyGearFraction(node, GEAR_DOWN.der, GEAR_UP.der, 0.7)
    const at70 = node.position.clone()
    // 0.7 is closer to the down (fraction=1) pose than 0.3 is
    expect(at70.distanceTo(GEAR_DOWN.der.pos)).toBeLessThan(at30.distanceTo(GEAR_DOWN.der.pos))
    expect(at30.distanceTo(GEAR_UP.der.pos)).toBeLessThan(at70.distanceTo(GEAR_UP.der.pos))
  })
})

describe('basis correction constants', () => {
  it('maps the model\'s native +Z (nose) onto sim +X forward', () => {
    const v = new Vector3(0, 0, 1).applyAxisAngle(new Vector3(0, 1, 0), WILDCAT_TO_SIM_ROTATION_Y)
    expect(v.distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-6)
  })

  it('scales the model\'s native 15.658 m wingspan down to the content wingSpanM (13.06 m)', () => {
    expect(WILDCAT_SCALE * 15.658001068688918).toBeCloseTo(13.06, 3)
  })
})

describe('loadWildcat through the model cache (Z1)', () => {
  /** A cache whose "parse" is a synthetic scene holding the three nodes wildcat.ts requires. */
  function syntheticCache() {
    return createModelCache(async () => {
      const root = new Group()
      for (const name of ['Helice', 'GRP_Rueda_Der', 'GRP_Rueda_Izq']) {
        const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
        m.name = name
        root.add(m)
      }
      root.getObjectByName('Helice')!.rotation.z = 0.25
      return root
    })
  }
  const still = { roll: 0, pitch: 0, yaw: 0 }

  it('declares prop, gear and stores, and no flaps', async () => {
    const cache = syntheticCache()
    const a = await loadWildcat((url) => cache.acquire(url))
    expect(a.parts).toEqual(['prop', 'gear', 'stores'])
  })

  it('update turns the prop from its authored angle and poses both gear legs', async () => {
    const cache = syntheticCache()
    const a = await loadWildcat((url) => cache.acquire(url))
    a.update({ gearFraction: 0, flapFraction: 0, throttle: 1, controls: still, frameS: 0.01, cameraDistanceM: 50 })
    expect(a.root.getObjectByName('Helice')!.rotation.z).toBeCloseTo(0.25 + 0.4, 12)
    expect(a.root.getObjectByName('GRP_Rueda_Der')!.position.distanceTo(GEAR_UP.der.pos)).toBeLessThan(1e-6)
    expect(a.root.getObjectByName('GRP_Rueda_Izq')!.position.distanceTo(GEAR_UP.izq.pos)).toBeLessThan(1e-6)
  })

  it('two Wildcats share one parse; disposing one releases only its own instance, once', async () => {
    const cache = syntheticCache()
    const a = await loadWildcat((url) => cache.acquire(url))
    const b = await loadWildcat((url) => cache.acquire(url))
    expect(cache.refCount(WILDCAT_MODEL_URL)).toBe(2)
    a.dispose()
    a.dispose()
    expect(cache.refCount(WILDCAT_MODEL_URL)).toBe(1)
    b.dispose()
    expect(cache.refCount(WILDCAT_MODEL_URL)).toBe(0)
  })
})
```

In `tests/render/scene.test.ts`, replace the `spinProp rotates one mesh inside root` test's first five lines with:

```ts
  it('update with throttle rotates exactly one mesh inside root (the prop)', () => {
    const { root, update } = createHellcat()
    const before = new Map<number, number>()
    root.traverse((o) => before.set(o.id, o.rotation.x))
    update({ gearFraction: 1, flapFraction: 0, throttle: 1, controls: { roll: 0, pitch: 0, yaw: 0 }, frameS: 0.01, cameraDistanceM: 10 })
```

The rest of that test, the `changed === 1` count, stays as it is.

Append the following to `tests/render/scenarioEntities.test.ts`, adding `import { loadWildcat } from '../../src/render/scene/wildcat.js'`, `import { createModelCache } from '../../src/render/models/modelCache.js'` and `import { WILDCAT_MODEL_URL } from '../../src/render/content.js'` to its imports:

```ts
describe('buildScenarioEntities and the model cache (Z1)', () => {
  it('a switch disposes every previous airframe through its own dispose(), and its smoke', async () => {
    const scene = new Scene()
    const before = await buildScenarioEntities(scene, deckQuals, null, stubAirframe)
    const disposeSpies = before.airframes.map((a) => vi.spyOn(a, 'dispose'))
    const smokeMeshes: Mesh[] = []
    for (const s of before.smokes) s.object.traverse((n) => { if (n instanceof Mesh) smokeMeshes.push(n) })
    const smokeSpies = smokeMeshes.map((m) => vi.spyOn(m.geometry, 'dispose'))
    await buildScenarioEntities(scene, strikeRange, before, stubAirframe)
    for (const spy of disposeSpies) expect(spy).toHaveBeenCalledTimes(1)
    for (const spy of smokeSpies) expect(spy).toHaveBeenCalled()
  })

  it('if one airframe fails to load, the ones that loaded are disposed and the previous scenario is untouched', async () => {
    const scene = new Scene()
    const before = await buildScenarioEntities(scene, strikeRange, null, stubAirframe)
    const disposeSpies: ReturnType<typeof vi.fn>[] = []
    let calls = 0
    const flaky = async () => {
      calls++
      if (calls === 2) throw new Error('model fetch 404')
      const a = createHellcat()
      const spy = vi.fn(a.dispose)
      disposeSpies.push(spy)
      return { ...a, dispose: spy }
    }
    await expect(buildScenarioEntities(scene, deckQuals, before, flaky)).rejects.toThrow('model fetch 404')
    expect(disposeSpies.length).toBe(deckQuals.aircraft.length - 1)
    for (const spy of disposeSpies) expect(spy).toHaveBeenCalledTimes(1)
    for (const h of [...before.airframes, ...before.shipHandles]) expect(scene.children).toContain(h.root)
  })

  it('switching between two scenarios that both fly the Wildcat parses it once and frees nothing still drawn', async () => {
    let parses = 0
    const cache = createModelCache(async () => {
      parses++
      const root = new Group()
      for (const name of ['Helice', 'GRP_Rueda_Der', 'GRP_Rueda_Izq']) {
        const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
        m.name = name
        root.add(m)
      }
      return root
    })
    const load = () => loadWildcat((url) => cache.acquire(url))
    const scene = new Scene()
    const first = await buildScenarioEntities(scene, deckQuals, null, load)
    const second = await buildScenarioEntities(scene, strikeRange, first, load)
    expect(parses).toBe(1)
    expect(cache.refCount(WILDCAT_MODEL_URL)).toBe(second.airframes.length)
  })
})
```

- [ ] **Step 2: Run them to see them fail.**

Run: `npx vitest run tests/render/modelCache.test.ts tests/render/wildcat.test.ts tests/render/scene.test.ts tests/render/scenarioEntities.test.ts --maxWorkers=2`
Expected: FAIL. `modelCache.js` does not resolve, `loadWildcat` takes no argument, and `update` is not a function.

- [ ] **Step 3: Implement the cache.** `src/render/models/dispose.ts`:

```ts
// src/render/models/dispose.ts
import { Mesh, type Material, type Object3D, type Texture } from 'three'

/** Every texture-valued property `MeshStandardMaterial` (or a sibling
 *  material type) can carry. `Material.dispose()` frees the material's own
 *  GPU program/uniform state but explicitly does NOT dispose the textures it
 *  references (Three.js's own documented behaviour), so a loaded glTF's
 *  textures leak unless this list is walked (found in review, F4F Task 6).
 *  Moved here from scenarioEntities.ts (Z1), because the model cache disposes
 *  a loaded model's shared parse the same way. */
const TEXTURE_PROPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap', 'displacementMap'] as const

function disposeMaterialTextures(material: Material): void {
  for (const prop of TEXTURE_PROPS) {
    const tex = (material as unknown as Record<string, Texture | null>)[prop]
    if (tex) tex.dispose()
  }
}

/**
 * Frees the GPU resources a mesh subtree holds -- every `Mesh`'s geometry
 * buffer, material(s), and the textures those materials reference -- and
 * leaves `root` itself for the caller to remove from the scene graph.
 *
 * Only for subtrees that own what they draw: procedural hulls, smoke, the
 * Hellcat stand-in, and the model cache's own parsed source once its last
 * instance is released. NEVER call it on a `ModelInstance.root`: an instance
 * shares geometry, materials and textures with every other instance of the
 * same URL (modelCache.ts), and this would free them under the others.
 */
export function disposeMeshTree(root: Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return
    node.geometry.dispose()
    const material = node.material
    const materials = Array.isArray(material) ? material : [material]
    for (const m of materials) {
      disposeMaterialTextures(m)
      m.dispose()
    }
  })
}
```

`src/render/models/modelCache.ts`:

```ts
// src/render/models/modelCache.ts
import type { Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { disposeMeshTree } from './dispose.js'

/**
 * One loaded model, as one aircraft or ship sees it (A6M Zero spec §7.1).
 * `root` is this instance's own clone of the scene graph: posing it, hiding
 * it and re-parenting it are the caller's business. Geometry, materials and
 * textures are SHARED with every other instance of the same URL, so an
 * instance must never mutate a material (a test pins `===` identity).
 */
export interface ModelInstance {
  readonly root: Object3D
  /** The named node inside THIS instance's clone. Throws, naming the model and the node, if absent. */
  node(name: string): Object3D
  /** Idempotent. The last release of a URL disposes its geometry, materials and textures. */
  release(): void
}

/** Parses a URL into a scene graph. Injectable so Node tests never run GLTFLoader. */
export type ParseModel = (url: string) => Promise<Object3D>

export const parseGltf: ParseModel = async (url) => (await new GLTFLoader().loadAsync(url)).scene

export interface ModelCache {
  acquire(url: string): Promise<ModelInstance>
  /** Instances of `url` acquired and not yet released (in-flight acquires included). 0 once disposed. */
  refCount(url: string): number
}

interface Entry {
  readonly source: Promise<Object3D>
  refs: number
}

/**
 * One parse per URL; every acquire clones. Before this (Z1), each aircraft
 * ran its own `GLTFLoader.loadAsync`, so every Wildcat uploaded its own 26
 * textures, about 139 MiB of VRAM each (spec §2).
 */
export function createModelCache(parse: ParseModel = parseGltf): ModelCache {
  const entries = new Map<string, Entry>()
  return {
    async acquire(url: string): Promise<ModelInstance> {
      let entry = entries.get(url)
      if (entry === undefined) {
        const created: Entry = { source: parse(url), refs: 0 }
        // A failed parse is forgotten, so the next acquire retries it rather than replaying the rejection forever.
        created.source.catch(() => { if (entries.get(url) === created) entries.delete(url) })
        entries.set(url, created)
        entry = created
      }
      const held = entry
      // Counted before the await: a sibling instance released while this parse is in flight must not dispose it.
      held.refs++
      let source: Object3D
      try {
        source = await held.source
      } catch (error) {
        held.refs--
        throw error
      }
      const root = source.clone(true)
      let released = false
      return {
        root,
        node(name: string): Object3D {
          const found = root.getObjectByName(name)
          if (!found) throw new Error(`model ${url}: required node "${name}" not found (re-exported with different names? see ASSETS.md and tools/models/entries/)`)
          return found
        },
        release(): void {
          if (released) return
          released = true
          held.refs--
          if (held.refs === 0 && entries.get(url) === held) {
            entries.delete(url)
            disposeMeshTree(source)
          }
        },
      }
    },
    refCount(url: string): number {
      return entries.get(url)?.refs ?? 0
    },
  }
}

const shared = createModelCache()

/** The page-wide cache every airframe and ship module loads through. */
export function acquireModel(url: string): Promise<ModelInstance> {
  return shared.acquire(url)
}
```

- [ ] **Step 4: Implement the interface and the airframes.** Replace `src/render/scene/airframe.ts` with:

```ts
// src/render/scene/airframe.ts
import type { Object3D } from 'three'

/** A part an airframe module can articulate. `parts` lists only the ones its
 *  model actually has, so the Hangar bench can show the rest as "not
 *  modeled" instead of a slider that moves nothing (Hangar spec §7, Mark's
 *  decision 1, 2026-09-25). */
export type PartId = 'prop' | 'gear' | 'flaps' | 'stores'

/** Everything one airframe needs to pose itself for one rendered frame. */
export interface AirframeUpdate {
  /** `AircraftState.gearFraction`: 1 = down, 0 = up. */
  readonly gearFraction: number
  /** `AircraftState.flapFraction`: 0 = up, 1 = fully down. */
  readonly flapFraction: number
  /** [0, 1]. Pass 0 for a wreck, so its propeller stops. */
  readonly throttle: number
  /** The pilot's command, for control surfaces where a model has them. */
  readonly controls: { readonly roll: number; readonly pitch: number; readonly yaw: number }
  /** Seconds since the last rendered frame. */
  readonly frameS: number
  /** Eye to this aircraft, meters: what a level-of-detail switch reads (Z3). */
  readonly cameraDistanceM: number
}

/** Implemented by every airframe module (hellcat.ts, wildcat.ts, and each
 *  model the registry in airframes.ts names). main.ts and scenarioEntities.ts
 *  drive whichever concrete airframe a spec's `view.model` names through this
 *  alone (A6M Zero spec §7.3). */
export interface Airframe {
  readonly root: Object3D
  readonly parts: readonly PartId[]
  setStores(bombsLeft: number, rocketsLeft: number): void
  /** One call per aircraft per rendered frame. Replaces spinProp/setGear (Z1). */
  update(u: AirframeUpdate): void
  /** Frees what this airframe owns and releases its model instances. Idempotent. */
  dispose(): void
}

/** Purely visual: gauges.ts explains why no tachometer is fitted -- there is
 *  no modeled engine RPM to drive it honestly. The prop turns at an arbitrary
 *  rate scaled by throttle; it confirms throttle reaches the frame state, not
 *  that it reaches the simulation (Task 13 review, measured 2026-09-13).
 *  Moved here from main.ts (Z1) when every aircraft's prop started turning. */
export const PROP_MAX_RAD_PER_SEC = 40

/** The propeller angle one frame later, wrapped to [0, 2 pi). Pure, so the rate is a test, not a claim. */
export function propAngle(prevRad: number, throttle: number, frameS: number): number {
  const next = prevRad + throttle * PROP_MAX_RAD_PER_SEC * frameS
  const turn = 2 * Math.PI
  return ((next % turn) + turn) % turn
}
```

In `src/render/scene/stores.ts`, make `attachStores` also return `dispose`. Its return type becomes `{ setStores(bombsLeft: number, rocketsLeft: number): void; dispose(): void }`, and it gains this member after `setStores`:

```ts
    /** Frees the two store geometries this call built. `material` is the
     *  caller's, so it is the caller's to free. */
    dispose(): void {
      bombGeometry.dispose()
      rocketGeometry.dispose()
    },
```

Replace `src/render/scene/hellcat.ts` with the version below. Only the imports and the returned object change:

```ts
// src/render/scene/hellcat.ts
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { attachStores } from './stores.js'
import { propAngle, type Airframe } from './airframe.js'
import { disposeMeshTree } from '../models/dispose.js'

/**
 * A deliberately simple low-poly F6F, built in code.
 *
 * Master spec §10 allows either verifiable-licence assets or deliberately
 * simple models built by hand; this is the second, so there is no provenance
 * to audit and no ASSETS.md row.
 *
 * Dimensions and where each came from:
 * - The 13.06 m wingspan (the `wing` box's z-size below) is
 *   `content/aircraft/f6f-hellcat.json`'s `geometry.wingSpanM`, read directly
 *   off that file 2026-09-13 -- not invented, since scale is what makes
 *   altitude and speed readable against the water and markers.
 * - The ~10.2 m fuselage length (the `fuselage` box's x-size) is NOT in that
 *   content file: `geometry` there holds only `wingAreaM2` and `wingSpanM`
 *   (confirmed by reading `src/sim/flight/schema.ts`'s `AircraftSpecObject`,
 *   which has no length field at all). It is the real F6F-5's published
 *   overall length, ~33 ft 7 in / 10.24 m, rounded for this low-poly build;
 *   it is a historical-reference figure, not a project-content one, and is
 *   recorded here as such rather than misattributed to the JSON.
 *
 * Body frame matches sim/: +X forward, +Y up, +Z right.
 */
export function createHellcat(): Airframe {
  const root = new Group()
  const paint = new MeshStandardMaterial({ color: 0x2f4f6a, roughness: 0.7 })
  const dark = new MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.5 })

  const fuselage = new Mesh(new BoxGeometry(10.2, 1.5, 1.4), paint)
  root.add(fuselage)

  const wing = new Mesh(new BoxGeometry(2.6, 0.28, 13.06), paint)
  wing.position.set(0.4, -0.25, 0)
  root.add(wing)

  const tailplane = new Mesh(new BoxGeometry(1.3, 0.2, 5.2), paint)
  tailplane.position.set(-4.4, 0.25, 0)
  root.add(tailplane)

  const fin = new Mesh(new BoxGeometry(1.3, 2.0, 0.2), paint)
  fin.position.set(-4.6, 1.1, 0)
  root.add(fin)

  const canopy = new Mesh(new BoxGeometry(2.2, 0.7, 1.0), dark)
  canopy.position.set(0.9, 0.95, 0)
  root.add(canopy)

  const spinner = new Mesh(new CylinderGeometry(0.35, 0.5, 0.8, 12), dark)
  spinner.rotation.z = Math.PI / 2
  spinner.position.set(5.1, 0, 0)
  root.add(spinner)

  // Separate, so the frame loop can spin it with throttle. This confirms
  // throttle reaches the frame state, not that it reaches the simulation --
  // a bug that stops `frame.controls` from reaching `advance` would leave
  // the prop spinning at the correct rate with nothing driving the
  // airplane (Task 13 review, measured 2026-09-13).
  const prop = new Mesh(new BoxGeometry(0.12, 3.9, 0.3), dark)
  prop.position.set(5.4, 0, 0)
  root.add(prop)

  // Stores (Plan 6b Task 8 / Task 4): extract shared store-mesh logic into
  // stores.ts so wildcat.ts can reuse it.
  const { setStores } = attachStores(root, dark)

  // Plan 16b: the sun's custom shadow node reaches only receivers (cloudShadow.ts).
  root.traverse((o) => { o.receiveShadow = true })
  let propRad = 0
  return {
    root,
    /** No gear and no flaps: the procedural mesh has no such geometry at all
     *  (docs/superpowers/specs/2026-09-24-post-overnight-critiques.md item 7). */
    parts: ['prop', 'stores'],
    setStores,
    update(u): void {
      propRad = propAngle(propRad, u.throttle, u.frameS)
      prop.rotation.x = propRad
    },
    /** Everything here is this call's own: geometry, both materials, the stores. */
    dispose(): void {
      disposeMeshTree(root)
    },
  }
}
```

Replace `src/render/scene/wildcat.ts` with the version below. The measured constants, `applyGearFraction` and `dark` are unchanged. `required()` is deleted, because `instance.node` throws the same way. `loadWildcat` loads through the cache:

```ts
// src/render/scene/wildcat.ts
import { Group, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three'
import { attachStores } from './stores.js'
import { WILDCAT_MODEL_URL } from '../content.js'
import { propAngle, type Airframe } from './airframe.js'
import { acquireModel, type ModelInstance } from '../models/modelCache.js'

/**
 * The Wildcat model (content/aircraft/wildcat.glb, ASSETS.md) is authored
 * with local +Z as the nose -- confirmed 2026-09-24 by reading the world
 * position of the `Helice` (propeller) node (+Z) against `Timon_Prof` (the
 * tail/elevator, -Z) after a real Three.js load, not by assumption. Sim body
 * frame is +X forward (hellcat.ts's own doc comment). Rotating +90 degrees
 * about Y sends local (0,0,1) to world (1,0,0) -- verified against the same
 * measurement: it also sends the model's local +X (where `GRP_Rueda_Der`,
 * "right" in Spanish, sits at negative local X) to world -Z, i.e. sim's
 * right-hand side (+Z), matching hellcat.ts's stated "+Z right" convention.
 */
export const WILDCAT_TO_SIM_ROTATION_Y = Math.PI / 2

/** content/aircraft/f4f-wildcat.json's geometry.wingSpanM (Task 3 -- reused
 *  verbatim from the Hellcat's; this constant must be kept in sync with that
 *  file by hand, the same way hellcat.ts's own wing box hardcodes it, since
 *  this module has no content-loading path of its own either. */
const TARGET_WINGSPAN_M = 13.06
/** The model's own native wingspan, measured 2026-09-24 via
 *  `new THREE.Box3().setFromObject(scene)` on a real load (not a guess, and
 *  not derived from the raw glTF accessor bytes, which are in a different,
 *  pre-hierarchy unit space) -- see this plan's Task 5 for the method. */
const WILDCAT_NATIVE_WINGSPAN_M = 15.658001068688918
export const WILDCAT_SCALE = TARGET_WINGSPAN_M / WILDCAT_NATIVE_WINGSPAN_M

interface GearPose { readonly pos: Vector3; readonly quat: Quaternion }
interface GearPair { readonly der: GearPose; readonly izq: GearPose }

/**
 * Both poses read directly off the model's own baked "Take 001" clip via
 * `AnimationMixer`/`AnimationAction.time`, NOT the raw accessor bytes (which
 * are in the same pre-hierarchy unit space `WILDCAT_NATIVE_WINGSPAN_M`'s doc
 * comment warns about) -- and NOT trusted from node names alone: t=0 vs
 * t=8.333 (the clip's full duration) were each rendered and screenshotted
 * 2026-09-24, confirming t=0 shows the wheels/struts extended below the
 * fuselage (gear DOWN) and t=8.333 shows them tucked flush into the wing
 * (gear UP). `AircraftState.gearFraction` (state.ts): 1 = extended (down),
 * 0 = retracted (up) -- so GEAR_DOWN below is the fraction=1 endpoint.
 *
 * The clip's *_CTRL locator nodes (Aleron_*_CTRL, Timon_*_CTRL,
 * Tren_aterrizaje_CTRL) barely move at all in this clip (all under 1e-17
 * radians -- floating-point noise, not real animation) despite their names
 * suggesting aileron/rudder/gear controls; the real, substantial motion is
 * entirely on GRP_Rueda_Der/Izq (translation + rotation) and Ctrl_Rota_
 * Rueda_Der/Izq (which duplicates GRP_Rueda's own rotation exactly, so only
 * GRP_Rueda_* needs to be driven directly). This clip has no usable flap or
 * aileron animation at all -- see this plan's Review Focus on flaps.
 */
export const GEAR_DOWN: GearPair = {
  der: { pos: new Vector3(-41.522, 7.8395, 188.651), quat: new Quaternion(0, 0, 0, 1) },
  izq: { pos: new Vector3(39.910, 7.8386, 186.271), quat: new Quaternion(0, 0, 0, 1) },
}
export const GEAR_UP: GearPair = {
  der: { pos: new Vector3(-41.459, 70.991, 188.651), quat: new Quaternion(0, 0, 0.23524, 0.97194) },
  izq: { pos: new Vector3(40.033, 70.809, 186.271), quat: new Quaternion(0, 0, -0.21691, 0.97619) },
}

/** fraction 1 = down (GEAR_DOWN), fraction 0 = up (GEAR_UP) -- matches
 *  AircraftState.gearFraction's own documented convention exactly. */
export function applyGearFraction(node: Object3D, down: GearPose, up: GearPose, fraction: number): void {
  node.position.lerpVectors(up.pos, down.pos, fraction)
  node.quaternion.slerpQuaternions(up.quat, down.quat, fraction)
}

/** Matches hellcat.ts's `dark` material exactly (color, roughness) --
 *  deliberately its own instance, not a shared import: sharing one material
 *  object would mean a future recolor of the Hellcat's trim silently
 *  recolors the Wildcat's ordnance too, a surprising coupling for one line
 *  saved. */
const dark = new MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.5 })

/**
 * One Wildcat. Loads through the shared model cache (A6M Zero spec §7.1): the
 * first call parses wildcat.glb, every later call clones that parse, and all
 * of them share its geometry, materials and 26 textures. `acquire` is
 * injectable so Node tests can hand in a synthetic instance.
 */
export async function loadWildcat(acquire: (url: string) => Promise<ModelInstance> = acquireModel): Promise<Airframe> {
  const instance = await acquire(WILDCAT_MODEL_URL)
  const scene = instance.root

  const gearDer = instance.node('GRP_Rueda_Der')
  const gearIzq = instance.node('GRP_Rueda_Izq')
  const helice = instance.node('Helice')
  // The prop turns about ITS OWN native axis (local Z here, not the +X
  // hellcat.ts's box uses), from whatever angle the file authored it at.
  const heliceRestZ = helice.rotation.z
  let propRad = 0

  // The basis/scale fix lives on one wrapper Group, isolating this model's
  // native-axis quirk from every consumer (scenarioEntities.ts, main.ts):
  // `root` below is posed directly in sim body-frame convention exactly the
  // way hellcat.ts's `root` always was.
  const correction = new Group()
  correction.rotation.y = WILDCAT_TO_SIM_ROTATION_Y
  correction.scale.setScalar(WILDCAT_SCALE)
  correction.add(scene)

  const root = new Group()
  root.add(correction)
  root.traverse((o) => { o.receiveShadow = true })

  const stores = attachStores(root, dark)
  let disposed = false

  return {
    root,
    /** This model has no flap geometry at all (ASSETS.md, F4F plan Review Focus). */
    parts: ['prop', 'gear', 'stores'],
    setStores: stores.setStores,
    update(u): void {
      propRad = propAngle(propRad, u.throttle, u.frameS)
      helice.rotation.z = heliceRestZ + propRad
      applyGearFraction(gearDer, GEAR_DOWN.der, GEAR_UP.der, u.gearFraction)
      applyGearFraction(gearIzq, GEAR_DOWN.izq, GEAR_UP.izq, u.gearFraction)
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      stores.dispose()
      instance.release()
    },
  }
}
```

- [ ] **Step 5: Change the airframe half of `scenarioEntities.ts`.** Replace the import block and everything from `/** Every texture-valued property` up to the start of `buildScenarioEntities`'s doc comment with the following. The registry arrives in Task 7:

```ts
import type { Scene } from 'three'
import { createShipMesh } from './scene/ship.js'
import { createEngineSmoke } from './scene/smoke.js'
import { loadWildcat } from './scene/wildcat.js'
import type { Airframe } from './scene/airframe.js'
import { disposeMeshTree } from './models/dispose.js'
import type { World } from '../sim/loop.js'

export { disposeMeshTree }
```

Keep the `ScenarioEntities` interface as it is. In `buildScenarioEntities`'s doc comment, replace the `previous` paragraph with:

```ts
 * `previous`, when given, is torn down AFTER the new airframes have loaded:
 * each airframe through its own `dispose()` (which releases its shared model
 * instance, never walks it -- modelCache.ts), each smoke trail and hull
 * through `disposeMeshTree`. Loading first means a model both scenarios use
 * keeps its one parse through the switch, and a load that fails leaves the
 * running scenario exactly as it was.
```

Replace the function itself with:

```ts
export async function buildScenarioEntities(
  scene: Scene,
  world: Pick<World<undefined>, 'aircraft' | 'ships' | 'player'>,
  previous: ScenarioEntities | null,
  // Defaulted for production; tests substitute a cheap synchronous stand-in
  // (createHellcat) so they never run a real GLTFLoader parse in Node.
  loadAirframe: () => Promise<Airframe> = loadWildcat,
): Promise<ScenarioEntities> {
  const settled = await Promise.allSettled(world.aircraft.map(() => loadAirframe()))
  const failed = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed !== undefined) {
    for (const r of settled) if (r.status === 'fulfilled') r.value.dispose()
    throw failed.reason
  }
  const airframes = settled.map((r) => (r as PromiseFulfilledResult<Airframe>).value)

  if (previous !== null) {
    previous.airframes.forEach((a, i) => {
      scene.remove(a.root)
      disposeMeshTree(previous.smokes[i]!.object)
      a.dispose()
    })
    for (const handle of previous.shipHandles) {
      disposeMeshTree(handle.root)
      scene.remove(handle.root)
    }
  }

  for (const a of airframes) scene.add(a.root)
  const smokes = airframes.map((a) => {
    const smoke = createEngineSmoke()
    a.root.add(smoke.object)
    return smoke
  })
  const playerIndex = world.aircraft.findIndex((a) => a.id === world.player)
  const player = airframes[playerIndex]!
  const shipHandles = world.ships.map((ship) => createShipMesh(ship.spec))
  for (const h of shipHandles) scene.add(h.root)

  return { airframes, shipHandles, smokes, player }
}
```

- [ ] **Step 6: Run the tests to see them pass.**

Run: `npx vitest run tests/render/modelCache.test.ts tests/render/wildcat.test.ts tests/render/scene.test.ts tests/render/scenarioEntities.test.ts tests/render/hellcat.test.ts tests/render/cloudShadow.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Write the failing test for the per-aircraft update rule**, `tests/render/airframeUpdate.test.ts`:

```ts
// tests/render/airframeUpdate.test.ts
import { describe, expect, it } from 'vitest'
import { airframeUpdateFor } from '../../src/render/airframeUpdate.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import type { AircraftEntity } from '../../src/sim/loop.js'

const aiControls = { pitch: 0.1, roll: -0.2, yaw: 0.3, throttle: 0.6 }
const alive = { state: createState({ gearFraction: 0.25, flapFraction: 0.5 }), controls: aiControls, impact: null }
const wreck = { ...alive, impact: {} as NonNullable<AircraftEntity['impact']> }
const origin = v3(0, 0, 0)

describe('airframeUpdateFor', () => {
  it("an AI aircraft reads its own entity's controls, gear and flaps", () => {
    const u = airframeUpdateFor(alive, null, v3(3, 4, 12), origin, 0.016)
    expect(u).toEqual({ gearFraction: 0.25, flapFraction: 0.5, throttle: 0.6, controls: { roll: -0.2, pitch: 0.1, yaw: 0.3 }, frameS: 0.016, cameraDistanceM: 13 })
  })

  it("the player's aircraft reads the frame's raw controls instead", () => {
    const player = { pitch: 0, roll: 0, yaw: 0, throttle: 1 }
    expect(airframeUpdateFor(alive, player, origin, origin, 0.016).throttle).toBe(1)
  })

  it('a wreck, player or AI, gets throttle 0 so its propeller stops', () => {
    expect(airframeUpdateFor(wreck, null, origin, origin, 0.016).throttle).toBe(0)
    expect(airframeUpdateFor(wreck, { pitch: 0, roll: 0, yaw: 0, throttle: 1 }, origin, origin, 0.016).throttle).toBe(0)
  })
})
```

Run: `npx vitest run tests/render/airframeUpdate.test.ts --maxWorkers=2`
Expected: FAIL, because the import does not resolve.

- [ ] **Step 8: Implement** `src/render/airframeUpdate.ts`:

```ts
// src/render/airframeUpdate.ts
import type { AirframeUpdate } from './scene/airframe.js'
import type { AircraftEntity } from '../sim/loop.js'
import type { Controls } from '../sim/flight/state.js'
import type { Vec3 } from '../sim/math/vec3.js'

/**
 * What one aircraft's airframe is told for one rendered frame (main.ts's
 * per-aircraft loop, A6M Zero spec §7.3). Pure, so the rules are tests:
 * - the player's airframe reads `playerControls`, the frame's raw input,
 *   which is what its propeller always read; every other aircraft reads its
 *   own entity's `controls`, which its AI pilot sets
 * - a wreck gets throttle 0, so its propeller stops (whole-branch review
 *   I-1: an ungated spin left it turning at full speed in its own fireball)
 */
export function airframeUpdateFor(
  aircraft: Pick<AircraftEntity, 'state' | 'controls' | 'impact'>,
  playerControls: Controls | null,
  position: Vec3,
  eye: Vec3,
  frameS: number,
): AirframeUpdate {
  const controls = playerControls ?? aircraft.controls
  return {
    gearFraction: aircraft.state.gearFraction,
    flapFraction: aircraft.state.flapFraction,
    throttle: aircraft.impact === null ? controls.throttle : 0,
    controls: { roll: controls.roll, pitch: controls.pitch, yaw: controls.yaw },
    frameS,
    cameraDistanceM: Math.hypot(position.x - eye.x, position.y - eye.y, position.z - eye.z),
  }
}
```

- [ ] **Step 9: Edit `main.ts` in exactly three places.** `spinProp` and `setGear` no longer exist, so until this step `npx tsc --noEmit` fails, and only in `main.ts`. Re-diff it against `HEAD` first (`git diff HEAD -- src/render/main.ts` must be empty), because other sessions edit this file.

1. Delete the `PROP_MAX_RAD_PER_SEC` doc comment and constant. It now lives in `scene/airframe.ts`.
2. Replace the gear loop, which starts `// Gear travel is multi-second` and ends at its `airframes[i]!.setGear(a.state.gearFraction)` loop, with:

```ts
    // One `update` per aircraft per frame (A6M Zero spec §7.3): gear, flaps,
    // propeller, and from Z3 the level of detail. Gear and flap travel are
    // multi-second, so a per-tick read off `World.aircraft[i].state` causes
    // no visible jitter -- same reasoning as the `setStores` loop above.
    // `airframeUpdateFor` owns the rules: the player's airframe reads the raw
    // frame controls, every other its own pilot's, and a wreck's prop stops.
    current.world.aircraft.forEach((a, i) => {
      const playerControls = a.id === current.world.player ? current.controls : null
      airframes[i]!.update(airframeUpdateFor(a, playerControls, current.poses[i]!.position, current.eye.position, frameMs / 1000))
    })
```

3. Delete the whole block that starts `// Gated on the flight still being live (whole-branch review I-1)` and ends with the `playerAirframe.spinProp(...)` `if`. `airframeUpdateFor` and its test now enforce that rule for every aircraft.

Add `import { airframeUpdateFor } from './airframeUpdate.js'` beside the `./scenarioEntities.js` import.

- [ ] **Step 10: Typecheck, run the named tests, verify and commit.**

```bash
npx tsc --noEmit; echo "rc=$?"   # rc=0
npx vitest run tests/render/airframeUpdate.test.ts tests/render/modelCache.test.ts tests/render/scenarioEntities.test.ts tests/render/wildcat.test.ts tests/render/scene.test.ts --maxWorkers=2
git diff HEAD --stat -- src/render/main.ts   # only this task's three hunks
npm run verify; rc=$?; echo "rc=$rc"
git add src/render/models/ src/render/scene/airframe.ts src/render/scene/wildcat.ts src/render/scene/hellcat.ts src/render/scene/stores.ts \
  src/render/scenarioEntities.ts src/render/airframeUpdate.ts src/render/main.ts \
  tests/render/modelCache.test.ts tests/render/wildcat.test.ts tests/render/scene.test.ts tests/render/scenarioEntities.test.ts tests/render/airframeUpdate.test.ts
git commit -m "Shared model cache; Airframe.update/dispose/parts; every propeller turns with its own throttle (Z1 Task 6)"
```

---

### Task 7: `view.model`, the airframe registry, and per-spec selection

**Files:**
- Modify: `src/sim/flight/schema.ts` (the `view` block), `content/aircraft/f6f-hellcat.json`, `content/aircraft/f4f-wildcat.json`, `tests/sim/flight/schema.test.ts`
- Create: `src/render/scene/airframes.ts`
- Modify: `src/render/scenarioEntities.ts` (the loader signature, two lines)
- Test: `tests/render/airframes.test.ts` (create), `tests/render/scenarioEntities.test.ts` (one test)

**Interfaces:**
- Consumes: Task 6's `Airframe` and `loadWildcat`.
- Produces:
  - `AircraftSpec['view']['model']: string`, required, matching `/^[a-z0-9][a-z0-9-]*$/`
  - `AIRFRAME_MODELS: Readonly<Record<string, AirframeLoader>>`, which is `{ wildcat }` for now
  - `airframeFor(modelId): AirframeLoader`, which throws for an unknown id or a prototype key
  - `type LoadAirframe = (modelId: string) => Promise<Airframe>` and `loadRegisteredAirframe` (`scenarioEntities.ts`)

  H1's hangar and Z3's `zero.ts` register through `AIRFRAME_MODELS`.

- [ ] **Step 1: Apply the Z2 rule** ("Shared files" above). Check both this branch and `main`:

```bash
ls content/aircraft/a6m2-zero.json; git cat-file -e main:content/aircraft/a6m2-zero.json && echo "on main"
```

- If the file is in this branch, add `"model": "wildcat"` inside its `view` block, in this task's commit.
- If it is only on `main`, the merge of this branch into `main` must add it, because the coverage test fails on the merged tree until that is done. Record this in the handoff's first paragraph.
- If neither holds, Z2 has not landed, and its own Task 8 applies the rule.

- [ ] **Step 2: Write the failing tests.** Create `tests/render/airframes.test.ts`:

```ts
// tests/render/airframes.test.ts
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { AIRFRAME_MODELS, airframeFor } from '../../src/render/scene/airframes.js'
import { propAngle, PROP_MAX_RAD_PER_SEC } from '../../src/render/scene/airframe.js'

const aircraftIds = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))

describe('the airframe registry (A6M Zero spec §7.2)', () => {
  it('finds at least the two shipped aircraft files', () => {
    expect(aircraftIds).toEqual(expect.arrayContaining(['f6f-hellcat', 'f4f-wildcat']))
  })

  it.each(aircraftIds)('content/aircraft/%s.json names a registered view.model', (id) => {
    const model = loadAircraftSpec(id).view.model
    expect(Object.keys(AIRFRAME_MODELS), `${id}.json names "${model}"`).toContain(model)
  })

  it('an unregistered id throws naming the id and the registered ones, including prototype keys', () => {
    expect(() => airframeFor('a6m2-zero')).toThrow(/"a6m2-zero".*registered: wildcat/)
    expect(() => airframeFor('constructor')).toThrow(/"constructor"/)
  })
})

describe('propAngle', () => {
  it('advances by throttle * PROP_MAX_RAD_PER_SEC * frameS and wraps to [0, 2 pi)', () => {
    expect(propAngle(0, 0.5, 0.1)).toBeCloseTo(0.5 * PROP_MAX_RAD_PER_SEC * 0.1, 12)
    expect(propAngle(0, 0, 5)).toBe(0)
    const a = propAngle(6, 1, 0.1)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(2 * Math.PI)
    expect(a).toBeCloseTo((6 + 4) % (2 * Math.PI), 12)
  })
})
```

Append to `tests/render/scenarioEntities.test.ts`:

```ts
describe('per-spec model selection (Z1)', () => {
  it("loads each aircraft by its own spec's view.model", async () => {
    const asked: string[] = []
    await buildScenarioEntities(new Scene(), deckQuals, null, async (id) => { asked.push(id); return createHellcat() })
    expect(asked).toEqual(deckQuals.aircraft.map((a) => a.spec.view.model))
  })
})
```

In `tests/sim/flight/schema.test.ts`, make the `valid` fixture's `view` block `{ eyePointM: [1.2, 0.9, 0], model: 'wildcat' }`. Also add `model: 'wildcat'` to the two `view: { eyePointM: ... }` literals in `rejects an eye point that is not three finite numbers`, so that each of those still fails only on `eyePointM`. Then add:

```ts
  it('requires view.model, a lowercase model id', () => {
    expect(() => parseAircraftSpec({ ...valid, view: { eyePointM: [1.2, 0.9, 0] } })).toThrow(/model/)
    expect(() => parseAircraftSpec({ ...valid, view: { eyePointM: [1.2, 0.9, 0], model: 'Wildcat' } })).toThrow(/lowercase model id/)
  })
```

- [ ] **Step 3: Run them to see them fail.**

Run: `npx vitest run tests/render/airframes.test.ts tests/sim/flight/schema.test.ts tests/render/scenarioEntities.test.ts --maxWorkers=2`
Expected: FAIL. `airframes.js` does not resolve, `view.model` is an unknown key, and the new test sees the no-argument loader.

- [ ] **Step 4: Implement.** In `src/sim/flight/schema.ts`, replace the `view` object with:

```ts
  view: z.object({
    /** Pilot's eye, metres in body frame: +X forward, +Y up, +Z right. */
    eyePointM: z.tuple([finite, finite, finite]),
    /** Which 3D model draws this aircraft: a key of
     *  `src/render/scene/airframes.ts`'s registry (A6M Zero spec §7.2).
     *  Required, so a spec cannot silently render as some other airplane;
     *  tests/render/airframes.test.ts checks every content file names a
     *  registered id. */
    model: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, { message: 'must be a lowercase model id' }),
  }).strict(),
```

In both `content/aircraft/f6f-hellcat.json` and `content/aircraft/f4f-wildcat.json`, make the `view` block:

```json
  "view": {
    "eyePointM": [
      1.2,
      0.9,
      0
    ],
    "model": "wildcat"
  },
```

For the F6F this states today's behavior honestly (spec §7.2).

Create `src/render/scene/airframes.ts`:

```ts
// src/render/scene/airframes.ts
import type { Airframe } from './airframe.js'
import { loadWildcat } from './wildcat.js'

/** Builds one airframe. Called once per aircraft in a scenario. */
export type AirframeLoader = () => Promise<Airframe>

/**
 * Model id (an aircraft spec's `view.model`) to the module that builds it
 * (A6M Zero spec §7.2). A loader runs only when a scenario names its id, so a
 * scenario that flies no Zero never fetches the Zero. Every
 * `content/aircraft/*.json` must name an id here; tests/render/airframes.test.ts
 * checks that.
 */
export const AIRFRAME_MODELS: Readonly<Record<string, AirframeLoader>> = {
  wildcat: () => loadWildcat(),
}

export function airframeFor(modelId: string): AirframeLoader {
  if (!Object.hasOwn(AIRFRAME_MODELS, modelId)) {
    throw new Error(`no airframe module for view.model "${modelId}" (registered: ${Object.keys(AIRFRAME_MODELS).join(', ')}); register it in src/render/scene/airframes.ts`)
  }
  return AIRFRAME_MODELS[modelId]!
}
```

In `src/render/scenarioEntities.ts`:
- Replace the `loadWildcat` import with `import { airframeFor } from './scene/airframes.js'`.
- Add the following above `buildScenarioEntities`'s doc comment:

```ts
/** Builds the airframe a spec's `view.model` names. Injectable so tests
 *  substitute a cheap synchronous stand-in and never run GLTFLoader in Node. */
export type LoadAirframe = (modelId: string) => Promise<Airframe>

export const loadRegisteredAirframe: LoadAirframe = (modelId) => airframeFor(modelId)()
```

- Make the parameter `loadAirframe: LoadAirframe = loadRegisteredAirframe`.
- Make the load line `const settled = await Promise.allSettled(world.aircraft.map((a) => loadAirframe(a.spec.view.model)))`.

Scenarios that name no Zero now never fetch one, by construction.

- [ ] **Step 5: Run the tests to see them pass, including every content file.**

Run: `npx vitest run tests/render/airframes.test.ts tests/sim/flight/schema.test.ts tests/render/scenarioEntities.test.ts tests/sim/testcards/f6f.test.ts --maxWorkers=2`
Expected: PASS. The F6F cards are unchanged, because `view` is render-only.

- [ ] **Step 6: Verify and commit.**

```bash
npm run verify; rc=$?; echo "rc=$rc"
git add src/sim/flight/schema.ts content/aircraft/*.json tests/sim/flight/schema.test.ts \
  src/render/scene/airframes.ts src/render/scenarioEntities.ts tests/render/airframes.test.ts tests/render/scenarioEntities.test.ts
git commit -m "Aircraft view.model and the airframe registry: each aircraft loads the model its spec names (Z1 Task 7)"
```

---

### Task 8: Tier 2 on the reference GPU, the handoff, the §15 row and the README

**Files:**
- Create: `docs/handoff/YYYY-MM-DD-z1-model-pipeline.md`
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§15), `README.md`

- [ ] **Step 1: Run Tier 2 on a spare slot.** The steps are in the repo `CLAUDE.md`, "GPU work", with `README.md`'s "Tier 2: the GPU harness" as the authority. In this worktree, point `vite.config.ts`'s `TUNNEL_HOST` at `ww2airsim-2.windomlane.org` and set `server.port` to `5175`. That is local scratch: never commit it, and `git diff vite.config.ts` must show only Task 5's hunks when you finish. Then:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim-2.windomlane.org/   # 200 once the server below is up
WW2AIRSIM_TUNNEL=1 npx vite --port 5175 &
ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-2.windomlane.org npx playwright test tests/e2e/wildcat.spec.ts tests/e2e/entities.spec.ts; rc=$?; echo "rc=$rc"
```

Expected: `rc=0`, meaning the gear cycles with no page or WebGPU errors, the task force sails, and the entities' GPU budget holds at 1440p. Stop the dev server and restore `vite.config.ts` afterward. If a spec fails, report it red with its numbers in the handoff. Do not re-tune anything to make it pass.

- [ ] **Step 2: Write the handoff**, `docs/handoff/<today>-z1-model-pipeline.md`. It must contain:
  1. **First paragraph:** the `view.model` state, meaning whether `a6m2-zero.json` existed at Task 7 and which value it got.
  2. **The Lane C / H1 interface**, as exact names with file paths:
     - `ModelEntrySchema` and its optional `frozen`
     - the stage order, and where S1's `shipFit` and `shipMaterials` go (after `normalizeDocument`, before `joinExcept`, in `runPipeline`)
     - `checkOutput` and `ALLOWED_REQUIRED_EXTENSIONS`
     - that `prune` already runs with `keepSolidTextures: true`
     - `acquireModel`, `createModelCache`, `ModelInstance` and `disposeMeshTree`'s new home
     - `Airframe` (`parts`, `update`, `dispose`), `AirframeUpdate`, `PartId` and `propAngle`
     - `AIRFRAME_MODELS` and `airframeFor`
     - `LoadAirframe` and the load-before-release order
     - `userData.pivotAxis`
     - `asset.extras` provenance
  3. The Tier 2 results with their numbers.
  4. What changed visibly: AI propellers now turn.
  5. The traps, one line each:
     - the `npm install --no-save` state of the shared `node_modules` until merge
     - `Texture.getSize()` returning null for WebP
     - that `models:build -- wildcat --force` would change the pinned bytes
  6. The "departs from the spec's wording" list, pointing at this plan rather than restating it.

- [ ] **Step 3: Update master spec §15.** If Z2 has already added the "A6M Zero (Z1-Z3)" row, add Z1's status to it, and add §4 and §10 to its Sections. Otherwise add this row directly after the "F4F Wildcat" row:

`| A6M Zero (Z1-Z3) | any | Second airframe: model pipeline and runtime (Z1), graded A6M2 flight model and mixed armament (Z2), the Zero on screen (Z3) | §4, §5, §7, §10 | Z1 complete YYYY-MM-DD with Tier 1 and reference-GPU Tier 2 ([design](2026-09-25-a6m-zero-design.md), [plan](../plans/2026-09-25-z1-model-pipeline.md), [handoff](../../handoff/YYYY-MM-DD-z1-model-pipeline.md)): manifest-driven models:build, shared model cache, per-spec view.model; no new asset. Z2 and Z3: see their own plans |`

Adjust the Z2 wording to whatever its state on `main` is at merge time.

- [ ] **Step 4: README.** Add one paragraph after the F4F Wildcat paragraph. It says that models build from `tools/models/entries/*.json` with `npm run models:build` and are inspected with `npm run models:inspect`, and it points at the A6M Zero spec §6 and master spec §15 for status. Do not restate the order.

- [ ] **Step 5: Verify and commit.**

```bash
npm run verify; rc=$?; echo "rc=$rc"
git add docs/handoff/ docs/superpowers/specs/2026-09-12-ww2airsim-design.md README.md
git commit -m "Z1 handoff: model pipeline and runtime foundation; §15 row and README pointer"
```

---

## Self-review against the spec (done while writing)

| Spec §11 Z1 item | Task |
| --- | --- |
| 1. DevDependencies (installed from `main`), `ModelEntrySchema`, `models:inspect` on a synthetic document | 1 |
| 2. The stages (`remove`, `split`, `normalize`, `join`, `simplify`, textures, `opaque`) and the budget check | 2, 3, 4 (`checkOutput`) |
| 3. The `models:build` driver and `entries/wildcat.json`; delete `buildWildcatModel`; output tests on the committed `wildcat.glb`, bytes unchanged | 4 |
| 4. The `copyContent` filter and the dist assertion | 5 |
| 5. `acquireModel` with reference-counted disposal and material-identity tests | 6 |
| 6. `wildcat.ts` on `acquireModel`, `Airframe.update`/`dispose`, the `main.ts` loop changed once, AI props spin | 6 |
| 7. `view.model`: schema, content, registry, per-spec selection, coverage test | 7 |
| 8. Tier 2 `wildcat.spec.ts` and `entities.spec.ts`, and a handoff naming the Lane C interface | 8 |
| Hangar decision 1: `Airframe.parts` | 6 |
| §6.2: no meshopt and no Draco; `extensionsRequired` ⊆ {`EXT_texture_webp`} | 4 (`checkOutput`), 3 (test) |
| §6.1: `noseNode` | 4 (`checkOutput`, build test) |
| §7.1: "instances never mutate a shared material" | 6 (`===` test) |
