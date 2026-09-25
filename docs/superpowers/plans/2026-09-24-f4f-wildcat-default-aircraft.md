# F4F Wildcat Default Aircraft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the procedurally-built Hellcat mesh with a real, rigged, CC-BY-licensed glTF model of a Grumman F4F Wildcat as the one aircraft every scenario flies, with working gear-extension animation driven by the existing `gearFraction` simulation state.

**Architecture:** The sim is currently hardcoded to exactly one aircraft end-to-end: `content/aircraft/f6f-hellcat.json` (flight model) and `src/render/scene/hellcat.ts` (hand-built Three.js primitives, no gear/flap geometry at all). This plan adds a second content file (`f4f-wildcat.json`, numerically identical to the Hellcat's — see "Flight data" below) and a new render module (`wildcat.ts`) that loads a real `.glb` via `GLTFLoader`, corrects its native axis/scale to match this project's body-frame convention, and drives its actual rigged landing-gear nodes from `AircraftState.gearFraction`. The raw Sketchfab download (73.9 MB, almost entirely uncompressed textures) is compressed with `@gltf-transform/cli` into a committed ~few-MB asset, following the same "gitignored raw cache → committed derived output" split this repo already uses for terrain and land-cover data.

**Tech Stack:** Three.js 0.186 (`GLTFLoader`, already available under `three/examples/jsm/loaders/`, no new render dependency), `@gltf-transform/cli` (new devDependency, content-prep only), Vitest (`environment: 'node'`), the repo's existing Tier 2 Playwright/GPU harness for real-browser verification.

**Spec:** `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` §9 (aircraft roster — the Wildcat is already listed there as a future player-flown type) and §9's "Content and data" section (Zod-validated JSON, `content/aircraft/*.json` schema). This plan **deviates** from `docs/superpowers/specs/2026-09-24-post-overnight-critiques.md` item 6's recommendation to prefer hand-built geometry over licensed meshes — that recommendation was written before a genuinely CC-BY, actually-rigged Wildcat model was found and verified (session of 2026-09-24: node-by-node inspection confirmed real gear geometry, not a guess). The critique's underlying concern (gear/flaps need separately-addressable nodes) is satisfied by this specific model for gear; flaps are not (see Review Focus).

## Global Constraints

- Flight-model data (`aero`, `mass`, `engine`, `rates`, `limits`, `gear`, `flap`, `reference` blocks) is **reused verbatim from `content/aircraft/f6f-hellcat.json`**, per Mark's explicit decision 2026-09-24: this is a placeholder under the Wildcat's identity, not real F4F-4 performance-trial data, and every reused block must say so in its own `reference.source`-style text, not just once at the top of the file.
- `src/sim/` never imports `render/`, and no rendering library reaches `src/sim/`, `src/assists/`, or `src/audio/` (`.dependency-cruiser.cjs`). `GLTFLoader` usage stays entirely inside `src/render/`.
- Every third-party binary asset gets an `ASSETS.md` row with source URL, author, license, and retrieval date, before it is committed (root `CLAUDE.md`, `ASSETS.md`'s own header).
- `npm run verify` (typecheck, lint at zero warnings, depcruise, tests) ends every task. Capture `rc=$?` directly; never gate on a grepped pipeline.
- Work happens on `main`, in the served working copy, no worktrees (this repo's `CLAUDE.md`). Re-diff against `HEAD` immediately before every commit.
- Never run `git clean -fdx` — `content/terrain/tiles/` and `tools/terrain/cache/` are ~275 MB of gitignored data that exists nowhere else, and this plan adds a second such cache directory (`tools/models/cache/`) that the same rule now covers.

## Review Focus

- **A scenario with a wingman AI aircraft**: `world.aircraft` can hold more than one entry (`scenarioEntities.ts`'s own doc comment: "a scenario is free to list the wingman first"), and today `airframes = world.aircraft.map(() => createHellcat())` builds one mesh per entry. Switching to an async loader must still build one Wildcat per aircraft, not just the player's, and each one's own `gearFraction` (not just the player's) must drive its own gear pose — Task 6's per-frame loop must index `current.world.aircraft[i].state.gearFraction`, mirroring the existing `setStores` loop exactly (main.ts:1587-1590), not read the player's state for every airframe.
- **`gearFraction` mid-travel (0 < fraction < 1)**: the gear takes `content/aircraft/f6f-hellcat.json`'s `gear.travelSeconds` (7 s) to move, so the visible pose must be a continuous interpolation, not a snap at 0/1 — Task 5's `applyGearFraction` must be exercised at fraction values like 0.3 and 0.7 in its unit test, not just the two endpoints.
- **A scenario that never calls `loadScenario` again mid-session vs. one that does (scenario switch)**: `buildScenarioEntities`'s `previous` disposal path (`disposeMeshTree`) must still correctly free the new async-loaded Wildcat's GPU resources (geometry + materials under the loaded glTF scene, not just the hand-built primitives `disposeMeshTree` was written against) — Task 6 must verify `disposeMeshTree`'s `root.traverse` walk actually reaches every `Mesh` under a loaded glTF scene (it should, since it walks `Object3D` generically, but this needs an explicit assertion, not an assumption).
- **The compressed `.glb` losing its node names or animation data**: `@gltf-transform/cli optimize`'s default `prune`/`dedup` passes operate on data, not intentionally on names, but this is not guaranteed without checking — Task 1 must re-run this session's own node-name/animation-keyframe inspection against the *compressed* output, not just trust the pre-compression measurements.
- **Flaps**: this specific Wildcat model has no flap geometry at all (confirmed this session — no node name or visible geometry corresponds to a flap surface, unlike gear). This plan does not add flap animation for the Wildcat and must not claim to in any comment, commit message, or handoff doc — it is a carried-forward gap, not a regression (the Hellcat's procedural mesh had no flap geometry either).

---

## Task 1: Compress the Wildcat model into a committed content asset

**Files:**
- Move: `content/models/grumman_f4f_wildcat_airplane.glb` → `tools/models/cache/grumman_f4f_wildcat_airplane.glb`
- Create: `tools/models/build.ts`
- Create: `content/aircraft/wildcat.glb` (committed, generated — not hand-written)
- Modify: `.gitignore` (remove the now-unused `/content/models/` line, add `/tools/models/cache/`)
- Modify: `package.json` (add `@gltf-transform/cli` devDependency, add `models:build` script)
- Test: `tests/tools/modelsBuild.test.ts`

**Interfaces:**
- Produces: `content/aircraft/wildcat.glb` on disk, a real committed file every later task reads by that exact path.

- [x] **Step 1: Move the raw download into the cache convention**

```bash
mkdir -p tools/models/cache
git mv content/models/grumman_f4f_wildcat_airplane.glb tools/models/cache/grumman_f4f_wildcat_airplane.glb 2>/dev/null || \
  mv content/models/grumman_f4f_wildcat_airplane.glb tools/models/cache/grumman_f4f_wildcat_airplane.glb
rmdir content/models 2>/dev/null || true
```

Update `.gitignore`: remove the `/content/models/` line only. `/tools/**/cache/` already exists (confirmed 2026-09-24, it's what already covers `tools/terrain/cache/` and `tools/landcover/cache/`) and already matches `tools/models/cache/` — no new line needed.

- [x] **Step 2: Add `@gltf-transform/cli`**

```bash
npm install --save-dev @gltf-transform/cli@^4.5.0
```

- [x] **Step 3: Write the build script**

```ts
// tools/models/build.ts
/**
 * Compresses a raw, third-party glTF download (cached under tools/models/cache/,
 * gitignored, never committed) into the small, committed asset the browser
 * actually fetches. Mirrors tools/terrain/build.ts's raw-cache-to-committed-
 * output split: the input here is 73.9 MB, 99.8% of it uncompressed embedded
 * PNG/JPEG textures (measured 2026-09-24 -- 27 images, several 14-17 MB each),
 * and committing that raw would make this repo's single largest tracked file
 * by a wide margin for no reason texture recompression doesn't already fix.
 *
 * Texture-only pass deliberately: no --simplify or Draco geometry compression
 * yet, so the exact node names and animation keyframes this project's render
 * code depends on (src/render/scene/wildcat.ts) are as close to the source
 * download as possible. Re-run the node/animation inspection below after any
 * future change to this script's flags.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const INPUT = 'tools/models/cache/grumman_f4f_wildcat_airplane.glb'
const OUTPUT = 'content/aircraft/wildcat.glb'

export function buildWildcatModel(): void {
  if (!existsSync(INPUT)) {
    throw new Error(
      `${INPUT} is missing. It is a gitignored raw download (CC-BY 4.0, ` +
      'rojatsu, see ASSETS.md) and must be fetched by hand from Sketchfab ' +
      '(login required) before this script can run -- there is no automated ' +
      're-fetch path, unlike tools/terrain/fetch.ts.',
    )
  }
  mkdirSync(dirname(OUTPUT), { recursive: true })
  execFileSync(
    'npx',
    ['--yes', '@gltf-transform/cli', 'optimize', INPUT, OUTPUT,
      '--texture-compress', 'webp',
      '--texture-size', '1024x1024',
      '--no-simplify'],
    { stdio: 'inherit' },
  )
}

// Matches tools/terrain/build.ts's own entrypoint guard exactly (fileURLToPath
// against process.argv[1], not a raw file:// string comparison, which mishandles
// paths with spaces/special characters).
const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  buildWildcatModel()
}
```

Add to `package.json`'s `scripts`:

```json
"models:build": "tsx tools/models/build.ts"
```

(check whether `tsx` or `ts-node` is the existing runner for `terrain:build`/`landcover:build` in `package.json` and match it exactly rather than introducing a second one.)

- [x] **Step 2: Run it and measure the result**

```bash
npm run models:build
ls -la content/aircraft/wildcat.glb
```

Record the actual output byte size (do not guess it in advance) — it becomes the upper bound Step 4's test asserts.

- [x] **Step 3: Re-verify node names and gear keyframes survived compression**

Reuse this session's own inspection method (already proven against the raw file) against the *compressed* output:

```python
import struct, json
with open('content/aircraft/wildcat.glb', 'rb') as f:
    f.read(12)
    n, _ = struct.unpack('<II', f.read(8))
    doc = json.loads(f.read(n))
names = {n.get('name','') for n in doc.get('nodes', [])}
required = {'Helice', 'GRP_Rueda_Der', 'GRP_Rueda_Izq'}
missing = required - names
assert not missing, f"compression dropped required nodes: {missing}"
assert len(doc.get('animations', [])) == 1, "expected exactly the one baked clip to survive"
print("OK:", required, "all present;", len(doc['animations'][0]['channels']), "animation channels")
```

If any required name is missing, the `optimize` flags need adjusting (most likely `dedup` merging two identically-shaped meshes and dropping one's node name) before proceeding — do not continue to Task 5 on a compressed file that fails this check.

- [x] **Step 4: Write the regression test**

```ts
// tests/tools/modelsBuild.test.ts
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'

// Upper bound from Step 2's actual measured output size, rounded up --
// catches a future re-run of models:build silently ballooning back toward
// the 73.9 MB raw input (e.g. a flag typo dropping --texture-compress).
const MAX_BYTES = /* the real number from Step 2, e.g. 6_000_000 -- do not guess */

describe('content/aircraft/wildcat.glb', () => {
  it('is committed and under the compressed size budget', () => {
    expect(existsSync('content/aircraft/wildcat.glb')).toBe(true)
    expect(statSync('content/aircraft/wildcat.glb').size).toBeLessThan(MAX_BYTES)
  })

  it('still has the named nodes and baked animation wildcat.ts depends on', () => {
    const buf = readFileSync('content/aircraft/wildcat.glb')
    const jsonLength = buf.readUInt32LE(12)
    const doc = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'))
    const names = new Set((doc.nodes ?? []).map((n: { name?: string }) => n.name ?? ''))
    for (const required of ['Helice', 'GRP_Rueda_Der', 'GRP_Rueda_Izq']) {
      expect(names.has(required)).toBe(true)
    }
    expect(doc.animations).toHaveLength(1)
  })
})
```

- [x] **Step 5: Run the full verify gate and commit**

```bash
npm run verify; rc=$?
echo "rc=$rc"
```

```bash
git add tools/models/build.ts tests/tools/modelsBuild.test.ts content/aircraft/wildcat.glb package.json package-lock.json .gitignore
git commit -m "Add compressed, committed Wildcat glTF model via tools/models/build.ts"
```

(`tools/models/cache/` stays gitignored and uncommitted, matching `tools/terrain/cache/`.)

---

## Task 2: Record the model's provenance in ASSETS.md

**Files:**
- Modify: `ASSETS.md`

**Interfaces:**
- Consumes: nothing from other tasks (can run in parallel with Task 1, but do it right after so the license is on record before anything downstream references the file).

- [x] **Step 1: Add the row**

Add to the "3D models" table in `ASSETS.md`:

```markdown
| `content/aircraft/wildcat.glb` | https://sketchfab.com/3d-models/grumman-f4f-wildcat-airplane-ac26b8bf6be44ba7b903ca7fbdedf7e4 | rojatsu | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required |
```

Directly below the table (or in a new subsection), add the compression note so a future reader doesn't mistake the committed file for the untouched original:

```markdown
`content/aircraft/wildcat.glb` is a texture-recompressed derivative of the
Sketchfab download above, produced by `tools/models/build.ts` (`npm run
models:build`) via `@gltf-transform/cli`'s `optimize` command -- textures
resized to 1024x1024 and re-encoded as WebP, geometry untouched. Retrieved
and verified rigged (separate, named landing-gear nodes with baked
retraction keyframes) 2026-09-24. Node names used by
`src/render/scene/wildcat.ts`: `Helice` (propeller), `GRP_Rueda_Der` /
`GRP_Rueda_Izq` (main gear, right/left). The model has no flap geometry.
```

- [x] **Step 2: Commit**

```bash
git add ASSETS.md
git commit -m "Record Wildcat model provenance in ASSETS.md"
```

---

## Task 3: Add the Wildcat's content JSON (placeholder flight data)

**Files:**
- Create: `content/aircraft/f4f-wildcat.json`
- Test: `tests/content/aircraftSchema.test.ts` (extend if it exists; check first — `src/sim/flight/schema.ts`'s `AircraftSpecObject` is the Zod schema, and there is likely already a test asserting `f6f-hellcat.json` parses against it)

**Interfaces:**
- Produces: a second valid `AircraftSpec` JSON, parseable by the same `AircraftSpecObject` schema `f6f-hellcat.json` already uses (`src/sim/flight/schema.ts`, confirmed `id` is `z.string().min(1)` with no enum restriction — any id string validates).

- [x] **Step 1: Copy and re-flag the content file**

```bash
cp content/aircraft/f6f-hellcat.json content/aircraft/f4f-wildcat.json
```

Edit `content/aircraft/f4f-wildcat.json`:
- `id`: `"f4f-wildcat"`
- `name`: `"Grumman F4F-4 Wildcat"`
- Leave every field under `geometry`, `mass`, `aero`, `engine`, `rates`, `limits`, `gear`, `flap`, `combat`, `stores` numerically **unchanged** from the Hellcat's — this is the literal, whole-block reuse Mark chose, not a selective mix (see plan header). `combat.guns[].position` and `stores.racks`/`stores.rails` offsets stay as-is too: Task 5 reuses the same procedural store-mesh offsets against the new model's root, in the same body frame.
- Replace `reference.source`'s entire string with:

```
PLACEHOLDER, not F4F-4 data: every field in this aircraft/mass/engine/
rates/limits/gear/flap block is reused verbatim from
content/aircraft/f6f-hellcat.json's F6F-5 Patuxent River trial data (see
that file's own reference.source for the original citation). None of
testMassKg, topSpeedMps, climbRateMps, stallSpeedMps, stallSpeedFlapMps,
rollRateDegPerSec, takeoffDistanceM, or any aero/engine/rates/gear/flap
coefficient in this file is a real F4F-4 Wildcat figure. This was a
deliberate choice (Mark, 2026-09-24, docs/superpowers/plans/
2026-09-24-f4f-wildcat-default-aircraft.md): ship the real, rigged,
CC-BY Wildcat model now with borrowed flight data rather than block
shipping on sourcing a genuine F4F-4 performance trial, which is
follow-up work on the same footing this file's Hellcat original took
(a dedicated primary-source research pass, not a quick estimate).
```

Do not add a separate top-level `dataStatus` field. `AircraftSpecObject` is `.strict()` at every level (confirmed 2026-09-24, `src/sim/flight/schema.ts:5,46`), so an extra key needs a matching schema change for a field no code path would ever read — this file's own Hellcat original carries exactly this kind of annotation in `reference.source` alone, with no separate status field anywhere else in the schema; follow that precedent rather than adding a new one.

- [x] **Step 2: Verify it parses**

Find (or write, if none exists) the test that loads `f6f-hellcat.json` through `AircraftSpecObject.parse(...)`, and add the same assertion for `f4f-wildcat.json`:

```ts
it('content/aircraft/f4f-wildcat.json validates against AircraftSpecObject', () => {
  const raw = JSON.parse(readFileSync('content/aircraft/f4f-wildcat.json', 'utf8'))
  expect(() => AircraftSpecObject.parse(raw)).not.toThrow()
})
```

- [x] **Step 3: Run and commit**

```bash
npm run verify; rc=$?
echo "rc=$rc"
```

```bash
git add content/aircraft/f4f-wildcat.json tests/content/aircraftSchema.test.ts
git commit -m "Add f4f-wildcat.json content, flight data borrowed from f6f-hellcat as a flagged placeholder"
```

---

## Task 4: Extract shared store-mesh logic out of hellcat.ts

**Files:**
- Create: `src/render/scene/stores.ts`
- Modify: `src/render/scene/hellcat.ts`
- Test: `tests/render/stores.test.ts` (new — move the store-specific assertions currently in `tests/render/hellcat.test.ts`)

**Interfaces:**
- Produces: `attachStores(root: Object3D, material: MeshStandardMaterial): { setStores(bombsLeft: number, rocketsLeft: number): void }`, used by both `hellcat.ts` (Step 2) and `wildcat.ts` (Task 5).

- [x] **Step 1: Write the failing test for the extracted module**

```ts
// tests/render/stores.test.ts
import { describe, expect, it } from 'vitest'
import { Group, MeshStandardMaterial } from 'three'
import { attachStores, RACK_OFFSETS, RAIL_OFFSETS } from '../../src/render/scene/stores.js'

describe('attachStores', () => {
  it('adds one mesh per rack and rail to root', () => {
    const root = new Group()
    attachStores(root, new MeshStandardMaterial())
    expect(root.children).toHaveLength(RACK_OFFSETS.length + RAIL_OFFSETS.length)
  })

  it('setStores hides dropped bombs left-rack-first', () => {
    const root = new Group()
    const { setStores } = attachStores(root, new MeshStandardMaterial())
    setStores(1, RAIL_OFFSETS.length)
    const bomb0 = root.getObjectByName(RACK_OFFSETS[0]!.id)!
    const bomb1 = root.getObjectByName(RACK_OFFSETS[1]!.id)!
    expect(bomb0.visible).toBe(false)
    expect(bomb1.visible).toBe(true)
  })

  it('setStores hides fired rockets outermost-pair-first', () => {
    const root = new Group()
    const { setStores } = attachStores(root, new MeshStandardMaterial())
    setStores(RACK_OFFSETS.length, RAIL_OFFSETS.length - 2)
    // left-rail-3 (z=-5.0) has the largest |z| on the left side -- outermost,
    // fires first, matching RAIL_DROP_ORDER's descending-|z| sort. left-rail-1
    // (z=-3.6) is innermost, nearest the fuselage, fires last. (Corrected
    // 2026-09-24 during Task 4: an earlier draft of this test had these two
    // swapped -- verified against the real sort output and against the
    // existing, unchanged tests/render/hellcat.test.ts, which already
    // asserted the direction this corrected version now matches.)
    const outerLeft = root.getObjectByName('left-rail-3')!
    const innerLeft = root.getObjectByName('left-rail-1')!
    expect(outerLeft.visible).toBe(false)
    expect(innerLeft.visible).toBe(true)
  })
})
```

- [x] **Step 2: Run it to verify it fails**

```bash
npx vitest run tests/render/stores.test.ts
```

Expected: FAIL, `src/render/scene/stores.ts` does not exist.

- [x] **Step 3: Extract the module**

```ts
// src/render/scene/stores.ts
import { BoxGeometry, CylinderGeometry, Mesh, type MeshStandardMaterial, type Object3D } from 'three'

/**
 * Rack and rail offsets, body-frame metres, mirrored from
 * `content/aircraft/f6f-hellcat.json`'s `stores.racks`/`stores.rails` (read
 * 2026-09-22). Shared between every airframe module (hellcat.ts, wildcat.ts)
 * because both content files carry the identical offsets -- wildcat.ts's
 * content is a verbatim copy of the Hellcat's (Task 3) -- and both airframm
 * roots are posed in the same sim body frame (+X forward, +Y up, +Z right),
 * so the same offsets attach correctly regardless of which underlying mesh
 * the root wraps.
 */
export const RACK_OFFSETS: readonly { readonly id: string; readonly offset: readonly [number, number, number] }[] = [
  { id: 'left-rack', offset: [0.4, -0.55, -2.6] },
  { id: 'right-rack', offset: [0.4, -0.55, 2.6] },
]
export const RAIL_OFFSETS: readonly { readonly id: string; readonly offset: readonly [number, number, number] }[] = [
  { id: 'left-rail-1', offset: [0.4, -0.4, -3.6] },
  { id: 'left-rail-2', offset: [0.4, -0.4, -4.3] },
  { id: 'left-rail-3', offset: [0.4, -0.4, -5.0] },
  { id: 'right-rail-1', offset: [0.4, -0.4, 3.6] },
  { id: 'right-rail-2', offset: [0.4, -0.4, 4.3] },
  { id: 'right-rail-3', offset: [0.4, -0.4, 5.0] },
]
const RAIL_DROP_ORDER: readonly number[] = RAIL_OFFSETS
  .map((_, i) => i)
  .sort((x, y) => Math.abs(RAIL_OFFSETS[y]!.offset[2]) - Math.abs(RAIL_OFFSETS[x]!.offset[2]) || x - y)

/** Builds one bomb mesh per rack and one rocket mesh per rail, adds them all
 *  to `root`, and returns the same visibility-toggling `setStores` every
 *  airframe module exposes. `material` is the airframe's own dark trim
 *  material, passed in so stores match that aircraft's existing palette
 *  rather than hardcoding a second one here. */
export function attachStores(root: Object3D, material: MeshStandardMaterial): { setStores(bombsLeft: number, rocketsLeft: number): void } {
  const bombGeometry = new BoxGeometry(1.6, 0.5, 0.5)
  const bombMeshes = RACK_OFFSETS.map(({ id, offset }) => {
    const mesh = new Mesh(bombGeometry, material)
    mesh.name = id
    mesh.position.set(...offset)
    root.add(mesh)
    return mesh
  })
  const rocketGeometry = new CylinderGeometry(0.09, 0.09, 1.4, 8)
  rocketGeometry.rotateZ(Math.PI / 2)
  const rocketMeshes = RAIL_OFFSETS.map(({ id, offset }) => {
    const mesh = new Mesh(rocketGeometry, material)
    mesh.name = id
    mesh.position.set(...offset)
    root.add(mesh)
    return mesh
  })

  return {
    setStores(bombsLeft: number, rocketsLeft: number): void {
      const droppedBombs = RACK_OFFSETS.length - bombsLeft
      bombMeshes.forEach((mesh, i) => { mesh.visible = i >= droppedBombs })
      const firedRockets = RAIL_OFFSETS.length - rocketsLeft
      const hidden = new Set(RAIL_DROP_ORDER.slice(0, firedRockets))
      rocketMeshes.forEach((mesh, i) => { mesh.visible = !hidden.has(i) })
    },
  }
}
```

- [x] **Step 4: Update hellcat.ts to use it**

Replace `hellcat.ts`'s `RACK_OFFSETS`/`RAIL_OFFSETS`/`RAIL_DROP_ORDER` constants and the bomb/rocket mesh construction block (lines 1-36 and 98-118 of the current file) with:

```ts
import { attachStores } from './stores.js'
// ...
const { setStores } = attachStores(root, dark)
```

and delete the now-redundant `setStores` implementation from `createHellcat`'s returned object, returning the one `attachStores` produced instead.

- [x] **Step 5: Run tests, confirm the existing hellcat store behavior is unchanged**

```bash
npx vitest run tests/render/hellcat.test.ts tests/render/stores.test.ts
```

Expected: both pass, `tests/render/hellcat.test.ts`'s existing assertions about `setStores` still hold (they now exercise the same logic through `attachStores`).

- [x] **Step 6: Full verify and commit**

```bash
npm run verify; rc=$?
echo "rc=$rc"
```

```bash
git add src/render/scene/stores.ts src/render/scene/hellcat.ts tests/render/stores.test.ts tests/render/hellcat.test.ts
git commit -m "Extract attachStores from hellcat.ts so wildcat.ts can reuse it"
```

---

## Task 5: Build the Wildcat render module

**Files:**
- Create: `src/render/scene/airframe.ts`
- Create: `src/render/scene/wildcat.ts`
- Modify: `src/render/content.ts` (add `WILDCAT_MODEL_PATH`/`WILDCAT_MODEL_URL`, matching the existing `TITLE_ART_PATH`/`TITLE_ART_URL` pair exactly — `aircraftUrl()` is not usable here, it hardcodes a `.json` suffix for the JSON content files and would resolve to `content/aircraft/wildcat.json`, not the `.glb`)
- Test: `tests/render/wildcat.test.ts`

**Interfaces:**
- Consumes: `attachStores` from Task 4 (`src/render/scene/stores.ts`).
- Produces: `loadWildcat(): Promise<Airframe>` and the shared `Airframe` interface (also satisfied by `createHellcat`, Task 6 updates `hellcat.ts` to match):
  ```ts
  export interface Airframe {
    readonly root: Object3D
    setStores(bombsLeft: number, rocketsLeft: number): void
    spinProp(deltaRadians: number): void
    setGear(fraction: number): void
  }
  ```

- [x] **Step 1: Write the failing unit tests for the pure gear/orientation math**

These test the math directly, with no `GLTFLoader`/network involved — the loader itself is verified separately by Task 7's Tier 2 harness, for the reasons in this task's final note.

```ts
// tests/render/wildcat.test.ts
import { describe, expect, it } from 'vitest'
import { Object3D, Quaternion, Vector3 } from 'three'
import { applyGearFraction, GEAR_DOWN, GEAR_UP, WILDCAT_TO_SIM_ROTATION_Y, WILDCAT_SCALE } from '../../src/render/scene/wildcat.js'

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
```

- [x] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/render/wildcat.test.ts
```

Expected: FAIL, `src/render/scene/wildcat.ts` does not exist.

- [x] **Step 3: Create the shared `Airframe` type first**

`wildcat.ts` (Step 4 below) imports this, so it must exist first — do not write Step 4 before this step.

```ts
// src/render/scene/airframe.ts
import type { Object3D } from 'three'

/** Implemented by every airframe module (hellcat.ts, wildcat.ts). One
 *  content id, one mesh, one interface: main.ts and scenarioEntities.ts
 *  drive whichever concrete airframe a scenario names through this alone,
 *  so adding a third aircraft type later touches neither of those files'
 *  render-loop logic, only a new module satisfying this shape. */
export interface Airframe {
  readonly root: Object3D
  setStores(bombsLeft: number, rocketsLeft: number): void
  spinProp(deltaRadians: number): void
  setGear(fraction: number): void
}
```

- [x] **Step 4: Add the model's path/URL constants to content.ts**

```ts
// added to src/render/content.ts, next to TITLE_ART_PATH/TITLE_ART_URL --
// same pattern, same reason: a committed binary asset that is not one of
// the `aircraftUrl`/`shipUrl`/`airfieldUrl` JSON records, so it needs its
// own named constant rather than (mis)using a JSON-suffixed helper.
export const WILDCAT_MODEL_PATH = 'content/aircraft/wildcat.glb'
export const WILDCAT_MODEL_URL = `${import.meta.env.BASE_URL}${WILDCAT_MODEL_PATH}`
```

- [x] **Step 5: Implement wildcat.ts**

```ts
// src/render/scene/wildcat.ts
import { Group, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { attachStores } from './stores.js'
import { WILDCAT_MODEL_URL } from '../content.js'
import type { Airframe } from './airframe.js'

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

function required(scene: Object3D, name: string): Object3D {
  const found = scene.getObjectByName(name)
  if (!found) throw new Error(`Wildcat model: required node "${name}" not found -- content/aircraft/wildcat.glb may have been re-exported with different names (see ASSETS.md)`)
  return found
}

/** Matches hellcat.ts's `dark` material exactly (color, roughness) --
 *  deliberately its own instance, not a shared import: sharing one material
 *  object would mean a future recolor of the Hellcat's trim silently
 *  recolors the Wildcat's ordnance too, a surprising coupling for one line
 *  saved. */
const dark = new MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.5 })

export async function loadWildcat(): Promise<Airframe> {
  const gltf = await new GLTFLoader().loadAsync(WILDCAT_MODEL_URL)
  const scene = gltf.scene

  const gearDer = required(scene, 'GRP_Rueda_Der')
  const gearIzq = required(scene, 'GRP_Rueda_Izq')
  const helice = required(scene, 'Helice')

  // The basis/scale fix lives on one wrapper Group, isolating this model's
  // native-axis quirk from every consumer (scenarioEntities.ts, main.ts):
  // `root` below is posed directly in sim body-frame convention exactly the
  // way hellcat.ts's `root` always was, with zero further changes needed at
  // any call site for this specific concern.
  const correction = new Group()
  correction.rotation.y = WILDCAT_TO_SIM_ROTATION_Y
  correction.scale.setScalar(WILDCAT_SCALE)
  correction.add(scene)

  const root = new Group()
  root.add(correction)
  root.traverse((o) => { o.receiveShadow = true })

  const { setStores } = attachStores(root, dark)

  return {
    root,
    setStores,
    /** `deltaRadians` spins the propeller about ITS OWN native axis (local Z
     *  here, not the +X hellcat.ts's simple box uses) -- the axis knowledge
     *  stays inside this module so main.ts's one call site does not need to
     *  know which aircraft type it is driving. */
    spinProp(deltaRadians: number): void {
      helice.rotation.z += deltaRadians
    },
    setGear(fraction: number): void {
      applyGearFraction(gearDer, GEAR_DOWN.der, GEAR_UP.der, fraction)
      applyGearFraction(gearIzq, GEAR_DOWN.izq, GEAR_UP.izq, fraction)
    },
  }
}
```

- [x] **Step 6: Run the unit tests, verify they pass**

```bash
npx vitest run tests/render/wildcat.test.ts
```

Expected: PASS.

- [x] **Step 7: Full verify and commit**

```bash
npm run verify; rc=$?
echo "rc=$rc"
```

```bash
git add src/render/scene/wildcat.ts src/render/scene/airframe.ts src/render/content.ts tests/render/wildcat.test.ts
git commit -m "Add wildcat.ts: async glTF loader, basis/scale correction, gear animation"
```

**Why the loader itself isn't unit-tested here:** `GLTFLoader` decodes embedded JPEG/PNG textures via `createImageBitmap`/`Image`, which do not exist in Vitest's `environment: 'node'` (no jsdom/canvas polyfill in this project's config — confirmed 2026-09-24). Forcing the full loader through a Node unit test would mean adding a texture-decode polyfill this project has never needed anywhere else, for a check this repo already has a better tool for: Task 7's Tier 2 Playwright harness runs a real Chromium against the real dev server, which is exactly what "does `GLTFLoader` actually parse our committed file correctly" needs. The pure math above (gear interpolation, basis correction) is what's actually novel and risky enough to deserve a fast, isolated test; the loader call itself is one line (`new GLTFLoader().loadAsync(...)`) with no logic of this project's own to get wrong.

---

## Task 6: Wire the Wildcat in as the default aircraft

**Files:**
- Modify: `src/render/content.ts`
- Modify: `src/render/scene/hellcat.ts`
- Modify: `src/render/scenarioEntities.ts`
- Modify: `src/render/main.ts`
- Test: `tests/render/scenarioEntities.test.ts` (exists — confirmed 2026-09-24, a real 7-test suite exercising `buildScenarioEntities` against real shipped scenario content with 1-3 aircraft each. Needs a full rewrite, not a spot-check: see Step 6.)
- Test: `tests/build/dist.test.ts` (existing — must keep passing with the new `AIRCRAFT_CONTENT_PATH`)

**Interfaces:**
- Consumes: `Airframe`, `loadWildcat` (Task 5); `attachStores` (Task 4).
- Produces: `buildScenarioEntities` becomes `async` and takes an injectable `loadAirframe` parameter (default `loadWildcat`); `ScenarioEntities.player: Airframe` replaces the old `hellcatRoot`/`prop` pair.

**Why `loadAirframe` is injectable, not hardcoded to `loadWildcat`:** `tests/render/scenarioEntities.test.ts` (Step 6) calls `buildScenarioEntities` directly, repeatedly, against real multi-aircraft scenario content. If it always called the real `loadWildcat`, every one of those calls would run a real `GLTFLoader` parse of `content/aircraft/wildcat.glb` in Vitest's `environment: 'node'` — and Task 5's own design note already established that environment cannot decode the model's embedded textures (no `createImageBitmap`/`Image`, confirmed 2026-09-24). This is the same shape of problem `tools/terrain/load.ts`'s injectable `fetchImpl` already solves in this codebase for a different loader — follow that precedent rather than inventing a new one: an optional parameter, defaulted for production, substituted with a cheap synchronous stand-in (`createHellcat`, which produces a real, valid `Airframe` with no network or texture decode at all) in tests that only care about `buildScenarioEntities`'s own array-sizing/disposal/id-lookup logic, not which aircraft type is loaded.

- [x] **Step 1: Point content.ts at the Wildcat**

In `src/render/content.ts`, change:

```ts
export const AIRCRAFT_CONTENT_PATH = contentPath('aircraft', 'f6f-hellcat')
```

to:

```ts
export const AIRCRAFT_CONTENT_PATH = contentPath('aircraft', 'f4f-wildcat')
```

Update the doc comment immediately above it (currently says "The Hellcat's record on disk") to name the Wildcat instead, and update `main.ts`'s two comments that say "every scenario flies the one shipped `f6f-hellcat`" (lines 249, 276 per this session's read) to say `f4f-wildcat`.

- [x] **Step 2: Make hellcat.ts satisfy the shared `Airframe` interface**

`hellcat.ts` stays in the repo (it is still the design spec's own future-roster item for the Hellcat as a separate player-flyable type, and its tests still exercise it directly) but must satisfy the same `Airframe` shape Task 5 defined, so `scenarioEntities.ts` can hold either kind of airframe behind one type. Add to `createHellcat`'s returned object:

```ts
spinProp(deltaRadians: number): void {
  prop.rotation.x += deltaRadians
},
/** The procedural Hellcat mesh has no separate landing-gear geometry at all
 *  (this was the exact gap docs/superpowers/specs/2026-09-24-post-overnight-
 *  critiques.md item 7 named) -- a documented no-op, not a bug, until that
 *  geometry is built. */
setGear(_fraction: number): void {},
```

Change `createHellcat`'s return type annotation from the current inline object type to `Airframe` (import it from `./airframe.js`), and keep `prop` out of the returned object now that `spinProp` wraps it. Three real call sites read `.prop` today and all three need updating in this task: `main.ts` (Step 4), `tests/render/scenarioEntities.test.ts` (Step 6 — confirmed 2026-09-24, not "the only one" as an earlier draft of this plan assumed), and `tests/render/scene.test.ts` (Step 6).

- [x] **Step 3: Make buildScenarioEntities async and expose one `player: Airframe`**

In `src/render/scenarioEntities.ts`:

```ts
import { loadWildcat } from './scene/wildcat.js'
import type { Airframe } from './scene/airframe.js'
// remove: import { createHellcat } from './scene/hellcat.js'
```

```ts
export interface ScenarioEntities {
  readonly airframes: readonly Airframe[]
  readonly shipHandles: readonly ReturnType<typeof createShipMesh>[]
  readonly smokes: readonly ReturnType<typeof createEngineSmoke>[]
  readonly player: Airframe
}
```

```ts
export async function buildScenarioEntities(
  scene: Scene,
  world: Pick<World<undefined>, 'aircraft' | 'ships' | 'player'>,
  previous: ScenarioEntities | null,
  // Defaulted for production; tests substitute a cheap synchronous stand-in
  // (createHellcat) so they never run a real GLTFLoader parse in Node --
  // see this task's Files section for why that matters.
  loadAirframe: () => Promise<Airframe> = loadWildcat,
): Promise<ScenarioEntities> {
  if (previous !== null) {
    for (const handle of [...previous.airframes, ...previous.shipHandles]) {
      disposeMeshTree(handle.root)
      scene.remove(handle.root)
    }
  }

  // One airframe load per aircraft in the scenario (player and any wingman
  // alike -- Review Focus above), in parallel: a scenario with two entries
  // should not pay for two sequential network round-trips.
  const airframes = await Promise.all(world.aircraft.map(() => loadAirframe()))
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

- [x] **Step 4: Update main.ts's call site and per-frame loop**

`loadScenario`'s current line (main.ts:320, the closure `boot()` defines and awaits — already `async`, so this is the only change its signature needs):

```ts
scenarioEntities = buildScenarioEntities(scene, nextScenarioWorld, scenarioEntities)
```

becomes:

```ts
scenarioEntities = await buildScenarioEntities(scene, nextScenarioWorld, scenarioEntities)
```

In the render loop, the destructure:

```ts
const { airframes, shipHandles, smokes, hellcatRoot, prop } = scenarioEntities!
```

becomes:

```ts
const { airframes, shipHandles, smokes, player } = scenarioEntities!
```

Every remaining `hellcatRoot` reference (cockpit pose copy, visibility toggle) becomes `player.root`:

```ts
cockpit.position.copy(player.root.position)
cockpit.quaternion.copy(player.root.quaternion)
// ...
player.root.visible = visibility.hellcatVisible // consider renaming visibility.hellcatVisible -> visibility.airframeVisible in frame.ts while touching this line; not required, but the old name is misleading now
```

The prop-spin line:

```ts
prop.rotation.x += current.controls.throttle * PROP_MAX_RAD_PER_SEC * (frameMs / 1000)
```

becomes:

```ts
player.spinProp(current.controls.throttle * PROP_MAX_RAD_PER_SEC * (frameMs / 1000))
```

And add the gear-update step, in the same `current.world.aircraft.forEach` style the existing `setStores` loop already uses (main.ts:1587-1590) — read directly off `World.aircraft[i].state`, not the interpolated render pose, matching that same existing precedent exactly:

```ts
current.world.aircraft.forEach((a, i) => {
  airframes[i]!.setGear(a.state.gearFraction)
})
```

(Place this next to the existing `setStores` loop, not the pose-interpolation loop above it — same reasoning as that loop's own comment: gear travel is multi-second, so a non-interpolated per-tick read causes no visible jitter, unlike position.)

- [x] **Step 5: Fix every other `airframes[i]!.setStores` call site's type**

`airframes[i]!.setStores(...)` (main.ts:1589) already matches the new `Airframe` interface unchanged — no edit needed there, only confirm it still typechecks once `airframes`'s element type is `Airframe` rather than `ReturnType<typeof createHellcat>`.

- [x] **Step 6: Rewrite tests/render/scenarioEntities.test.ts to inject createHellcat, not the real loader**

`tests/render/cloudShadow.test.ts` calls `createHellcat()` directly for an unrelated assertion (shadow settings) and does not touch `.prop` — no change needed there.

`tests/render/scene.test.ts` (confirmed 2026-09-24) has two tests built on the now-removed `.prop` field, both needing a real rewrite, not a rename — `.prop` was the field these tests were ABOUT, so the replacement has to test the same real invariant through a different door:

```ts
// was: it('exposes the prop separately so it can be spun', () => {
//   const { root, prop } = createHellcat()
//   expect(prop).toBeDefined()
//   expect(root.getObjectById(prop.id)).toBeTruthy()
// })
// prop is no longer a field to find -- spinProp() is the only way to affect
// it now, so the test moves from "prop exists and is reachable" to "calling
// spinProp actually rotates exactly one thing inside root":
it('spinProp rotates one mesh inside root', () => {
  const { root, spinProp } = createHellcat()
  const before = new Map<number, number>()
  root.traverse((o) => before.set(o.id, o.rotation.x))
  spinProp(Math.PI / 4)
  let changed = 0
  root.traverse((o) => {
    if (Math.abs(o.rotation.x - (before.get(o.id) ?? 0)) > 1e-9) changed++
  })
  expect(changed).toBe(1)
})
```

```ts
// was: it('points +X forward, matching the sim body frame', () => {
//   const { prop } = createHellcat()
//   const p = new Vector3()
//   prop.getWorldPosition(p)
//   expect(p.x).toBeGreaterThan(2)
// })
// prop was standing in for "something at the nose is out past x=2" --
// find the same fact without a name for the specific mesh, by taking the
// furthest-forward point in the whole tree (the spinner/prop cluster at
// x=5.1-5.4 in hellcat.ts's own geometry, still the nose regardless of
// which named variable points at it):
it('points +X forward, matching the sim body frame', () => {
  const { root } = createHellcat()
  let maxX = -Infinity
  const p = new Vector3()
  root.traverse((o) => {
    o.getWorldPosition(p)
    if (p.x > maxX) maxX = p.x
  })
  expect(maxX).toBeGreaterThan(2)
})
```

Both keep the file's existing `import { Vector3 } from 'three'` (already imported, line 11) — no new import needed. Run `npx vitest run tests/render/scene.test.ts` after writing these and confirm both pass before moving on; the `toBeGreaterThan(2)` threshold is carried over unchanged from the original test since it is testing the identical geometry, but if it does not hold empirically (it should — hellcat.ts's spinner sits at local x=5.1, unchanged by this task), adjust the threshold to what the real geometry produces rather than force it.

`tests/render/scenarioEntities.test.ts` needs a real rewrite: every one of its 7 `it(...)` blocks calls `buildScenarioEntities` synchronously today, and two of them assert the now-removed `entities.hellcatRoot`/`entities.prop` fields directly. The fix is mechanical but touches every test in the file — do it as one pass, not a spot-fix:

1. Add the import and a tiny helper at the top:

```ts
import { createHellcat } from '../../src/render/scene/hellcat.js'
```

```ts
/** The stand-in `loadAirframe` every call in this file passes: real,
 *  synchronous, no network or texture decode, so this suite exercises
 *  buildScenarioEntities's OWN logic (array sizing, disposal, id lookup)
 *  without depending on GLTFLoader working in Vitest's `environment: 'node'`
 *  (it doesn't -- Task 5's wildcat.ts doc comment has the reason). Which
 *  aircraft type this resolves to is not what this suite is testing. */
const stubAirframe = async () => createHellcat()
```

2. Every `it(...)` callback that calls `buildScenarioEntities` becomes `async () => { ... }`, and every call becomes `await buildScenarioEntities(scene, <world>, <previous>, stubAirframe)` — the fourth argument, always. There are 8 call sites across the 7 tests (the `SHRINK`/`GROW`/no-ships tests each call it twice, `before`/`after`). Example, the first test:

```ts
it('sizes the mesh arrays to the world passed in: one airframe per aircraft, one hull per ship, one smoke per airframe', async () => {
  const scene = new Scene()
  const entities = await buildScenarioEntities(scene, deckQuals, null, stubAirframe)
  expect(entities.airframes).toHaveLength(deckQuals.aircraft.length)
  expect(entities.shipHandles).toHaveLength(deckQuals.ships.length)
  expect(entities.smokes).toHaveLength(deckQuals.aircraft.length)
  for (const handle of [...entities.airframes, ...entities.shipHandles]) {
    expect(scene.children).toContain(handle.root)
  }
})
```

Apply the same two changes (`async () => {`, `await buildScenarioEntities(..., stubAirframe)`) to every other `it` in the `describe('buildScenarioEntities', ...)` block and to `describe('disposeMeshTree', ...)`'s one call too.

3. Fix the `hellcatRoot`/`prop` assertion. The test titled `"picks the player's hellcatRoot/prop out by id, not index 0"` becomes:

```ts
it("picks the player's airframe out by id, not index 0", async () => {
  const scene = new Scene()
  const entities = await buildScenarioEntities(scene, deckQuals, null, stubAirframe)
  const playerIndex = deckQuals.aircraft.findIndex((a) => a.id === deckQuals.player)
  expect(entities.player).toBe(entities.airframes[playerIndex])
})
```

(`ScenarioEntities.player` is now the single `Airframe` object itself, not a root/prop pair picked out of it — this asserts the SAME identity guarantee the original two-field assertion did, in the shape `Airframe` actually has now.)

4. The suite's own doc comment (above `describe('buildScenarioEntities', ...)`) says "`hellcatRoot`/`prop`" — update it to say "`player`".

5. Run it:

```bash
npx vitest run tests/render/scenarioEntities.test.ts tests/render/scene.test.ts
```

Expected: PASS, all 7 (now-async) tests plus `disposeMeshTree`'s.

- [x] **Step 7: Run the full verify gate**

```bash
npm run verify; rc=$?
echo "rc=$rc"
```

Expected: PASS. `tests/build/dist.test.ts` in particular must still pass — it asserts `AIRCRAFT_CONTENT_PATH`'s file exists in a real build output, so this is the test that catches a typo'd id between Task 3's file name and Task 6 Step 1's constant.

- [x] **Step 8: Commit**

```bash
git add src/render/content.ts src/render/scene/hellcat.ts src/render/scenarioEntities.ts src/render/main.ts tests/render/
git commit -m "Wire the Wildcat in as the default flown/rendered aircraft"
```

---

## Task 7: Tier 2 verification — confirm it actually loads and animates in a real browser

**Files:**
- Modify: `src/render/diagnostics.ts` (add a `gearFraction` accessor to `Ww2Diagnostics`, mirroring `controls()`/`look()`)
- Modify: `src/render/main.ts` (wire the new accessor to the player's real state)
- Create: `tests/e2e/wildcat.spec.ts` (the repo's real Tier 2 directory — confirmed 2026-09-24 by reading `README.md`'s "Tier 2: the GPU harness" section and `tests/e2e/gunnery.spec.ts`/`adapter.spec.ts`, not guessed)

**Interfaces:**
- Consumes: `tests/e2e/harness.ts`'s `waitForTerrain(page)`, `DiagWindow` type; `src/render/spawn.js`'s `SPAWN_PARAMS`.
- Produces: `Ww2Diagnostics.gearFraction: () => number`.

This repo's Tier 2 tests **deliberately exclude screenshot goldens** (`adapter.spec.ts`'s own doc comment: "at a stage where the picture changes every commit they generate constant diffs that mean nothing, and they are the expensive half to maintain"). Every existing spec instead asserts on real state exposed through `window.__ww2` (`Ww2Diagnostics`, `src/render/diagnostics.ts`) — `combat()`, `cameraMode()`, `controls()` — proving a keypress actually reached the simulation, not just that nothing crashed. This task follows that exact convention rather than the screenshot-based check an earlier draft of this plan had: gear state gets the same kind of accessor `controls()` already has, for the same reason `controls()`'s own doc comment gives ("proves the... phase actually reached `frame.controls`, which `tick` advancing alone cannot").

- [x] **Step 1: Add the diagnostic accessor**

In `src/render/diagnostics.ts`, add to `Ww2Diagnostics`:

```ts
/** Added for the Wildcat gear animation (Plan: 2026-09-24-f4f-wildcat-
 *  default-aircraft): proves a `KeyG` press actually reached
 *  `AircraftState.gearFraction` and therefore `Airframe.setGear`, the same
 *  way `controls()` above proves a control key reached `frame.controls` --
 *  `tick()` advancing alone cannot show this. */
readonly gearFraction: () => number
```

In `main.ts`, the accessors are assigned at the `window.__ww2 = {...}` literal (confirmed 2026-09-24 at line 627), reading off the outer `let frame: FrameState | null = null` closure variable with an `??`/`?.` fallback for before the first frame exists — exactly the pattern `tick: () => frame?.world.tick ?? 0` and `cameraMode: () => frame?.cameraMode ?? 'chase'` (lines 643-644) already use. Add, in the same object literal, next to those two lines:

```ts
gearFraction: () => (frame ? playerAircraft(frame.world).state.gearFraction : 0),
```

`playerAircraft` is already imported in `main.ts` (used elsewhere in the render loop, e.g. `const player = playerAircraft(current.world)` in the frame loop below) — this is a second call against `frame` rather than `current`, matching the other diagnostics accessors' pre-first-frame safety, not the render loop's own per-tick `current`.

- [x] **Step 2: Write the spec**

```ts
// tests/e2e/wildcat.spec.ts
import { test, expect } from '@playwright/test'
import { waitForTerrain, type DiagWindow } from './harness.js'

/**
 * Tier 2. Confirms the Wildcat glTF actually loads and its real rigged gear
 * nodes actually move in the shipped app -- `wildcat.test.ts` (Task 5) only
 * proves the interpolation math in isolation, never a real GLTFLoader parse
 * of the committed file, and this repo's Node test environment cannot run
 * that parse itself (no image-decode polyfill; see wildcat.ts's own test
 * file for why). No screenshot goldens (see this repo's `adapter.spec.ts`)
 * -- gear state is asserted through `window.__ww2.gearFraction()` instead,
 * added alongside this spec.
 */
const gearFraction = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as DiagWindow).__ww2!.gearFraction())

test('Wildcat spawns gear-down, KeyG retracts it, no console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  await waitForTerrain(page)

  // Default spawn is parked on the runway: spawn.ts's initialAircraftState
  // sets gearFraction 1 (down) for a ground spawn specifically so
  // supportedContact reads the wheels as carrying the airplane -- confirmed
  // by reading that file this session, not assumed.
  expect(await gearFraction(page)).toBe(1)

  await page.keyboard.press('KeyG') // src/input/bindings.ts: toggleGear
  // gear.travelSeconds is 7 (content/aircraft/f4f-wildcat.json, reused from
  // the Hellcat's), so poll rather than a fixed wait.
  await expect.poll(() => gearFraction(page), { timeout: 10_000 }).toBeLessThan(0.05)

  expect(errors).toEqual([])
})
```

- [x] **Step 3: Run it against the real Tier 2 harness**

Follow `README.md`'s "Tier 2: the GPU harness" section exactly (from `~/projects/ww2airsim`, on nexus):

```sh
npm run dev:lan
ssh -N -L 39001:127.0.0.1:3000 ryzen &
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org npm run test:tier2
```

(the Windows desktop must already have `npx playwright run-server --port 3000 --host 127.0.0.1 --unsafe` running in the console session — README's own precondition, not something this task starts.)

- [x] **Step 4: One-time manual look, not a committed asset**

Per this repo's own root `CLAUDE.md`: "never argue about a picture you have not looked at." Take one throwaway screenshot by hand during this step (`await page.screenshot({ path: '/tmp/wildcat-check.png' })`, not committed, not part of the spec file) at `gearFraction() === 1` and again after the `KeyG` poll resolves, and look at both once to confirm by eye that this matches this session's own two reference renders (wheels extended vs. tucked into the wing) — then discard the file. This is a one-off sanity check, not the thing Step 2's spec asserts on.

- [x] **Step 5: Commit**

```bash
git add src/render/diagnostics.ts src/render/main.ts tests/e2e/wildcat.spec.ts
git commit -m "Expose gearFraction diagnostic and add Tier 2 verification for the Wildcat"
```

---

## Task 8: Handoff document and roster update

**Files:**
- Create: `docs/handoff/2026-09-24-f4f-wildcat-default-aircraft.md`
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§15's plan table, per this repo's own convention)

**Interfaces:**
- Consumes: nothing further; this is the closing task.

- [x] **Step 1: Write the handoff doc**

Cover, in this repo's established handoff style (see `docs/handoff/*.md` for the pattern): what changed (Wildcat is now the default, real rigged gear animation, Hellcat preserved but unwired), what's explicitly still a placeholder (all flight-model numbers, dated and reasoned per Task 3), what's explicitly still missing (flaps — no geometry exists on this model; the other 10 roster aircraft — no plan yet), and the exact measured numbers this plan's tasks produced (compressed file size from Task 1 Step 2, the two gear poses from Task 5).

- [x] **Step 2: Update §15's table**

Add a row for this plan, following the existing table's format exactly (check the table's own column headers before writing the row).

- [x] **Step 3: Email it**

Per root `CLAUDE.md`: email every finished plan/spec-adjacent document as HTML, unprompted.

```sh
python3 tools/mail-doc.py docs/handoff/2026-09-24-f4f-wildcat-default-aircraft.md "ww2airsim: F4F Wildcat is now the default aircraft"
```

- [x] **Step 4: Commit**

```bash
git add docs/handoff/2026-09-24-f4f-wildcat-default-aircraft.md docs/superpowers/specs/2026-09-12-ww2airsim-design.md
git commit -m "Handoff doc and roster update for the Wildcat default-aircraft plan"
```
