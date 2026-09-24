# Cumulus Cloud Fidelity (Plan 16d) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Mark's "pixelated and banded... should be fluffy and vary in
shapes and distribution more" critique of the low cumulus deck, without
touching cirrus, by raising cumulus light/step counts, retiling the cumulus
detail-erosion noise for the up-close view, and adding a spatially-varying
cumulus coverage field.

**Architecture:** Four independent, additive changes inside the existing
raymarch technique (`src/render/scene/clouds.ts` marches; `cloudField.ts`
holds the noise volumes and the pure `density()` function both the dome and
the shadow pass read). Two are constant tweaks (`CLOUD_TIERS` step counts,
`DETAIL_TILE_M`). One adds a third noise asset — a 64x64 2D "weather map"
texture generated the same way `shape.bin.gz`/`detail.bin.gz` already are
(`tools/sky/noise.ts` → `tools/sky/build.ts` → gzip → committed under
`content/sky/`) — that spatially modulates the per-layer `coverage` scalar
inside `density()`'s existing cumulus branch, before it thresholds the shape
noise. Nothing about the raymarch loop, the shadow pass, or cirrus changes;
every edit is additive to the cumulus (`kind === KIND_CUMULUS`) path only.

**Tech Stack:** TypeScript, Three.js TSL (`three/webgpu`, `three/tsl`), Vite,
vitest, Playwright (Tier 2), Node's built-in `zlib` for the committed noise
assets.

**Spec:** `docs/superpowers/specs/2026-09-24-cumulus-cloud-fidelity-design.md`

## Global Constraints

- This plan touches only `KIND_CUMULUS`'s path: cirrus tier values, noise
  sampling, and coverage handling stay byte-for-byte unchanged (spec §1, §3).
- `CLOUD_TIER_PARAM`'s DEV-only `?cloudTier=` override, the per-pixel start
  dither, the two-noise-volume shape+detail technique, and `MAX_MARCH_M`
  capping are unchanged — this is tuning within the existing technique, not a
  rewrite of it (spec §3).
- `GPU_BUDGET_P95_MS = 6.0` (`tests/e2e/terrain.spec.ts`) is the project-wide
  regression tripwire and must never be raised. `tests/e2e/clouds.spec.ts`'s
  own `2.5` ms cumulus-specific delta budget is a *feature* allocation and
  may be raised, but only after a real Tier 2 measurement justifies it (see
  Task 5) — never guessed.
- `src/sim/` never imports `render/`, `input/`, `assists/`, `audio/`, Node
  core, or a rendering library (`.dependency-cruiser.cjs`,
  `tests/architecture/boundary.test.ts`). Not at risk here — every file this
  plan touches is under `src/render/`, `tools/`, or `tests/` — but stated
  because it is this repo's standing constraint.
- US spelling in new prose and identifiers.
- `npm run verify` (typecheck, lint at zero warnings, depcruise, tests) ends
  every task. Capture `rc=$?` directly; never gate on a grepped pipeline.
- Never run `git clean -fdx` — `content/terrain/tiles/` and
  `tools/terrain/cache/` are ~275 MB of gitignored data that exists nowhere
  else.
- **Execution happens on `main`, in place, in the primary checkout — not a
  worktree.** This plan document was drafted in an isolated worktree at
  Mark's explicit request for the *planning* step only; ww2airsim's own
  `CLAUDE.md` forbids worktrees for implementation because the vite dev
  server that shows Mark the running build can't reach one. Re-diff against
  `HEAD` right before every commit — other sessions commit to this checkout
  too.

## Review Focus

- **The heavier-overcast `deck-quals` scenario (`coverage: 0.55`, vs.
  `free-flight`'s `0.45`) is the likeliest scenario to blow the 6.0 ms
  ceiling even if `free-flight` measures comfortably** — `CLOUD_TIERS` is a
  global constant every scenario's clouds read, and a denser deck runs the
  light march on more pixels. Task 5 runs the *full* Tier 2 suite, not just
  `clouds.spec.ts`, specifically to catch this.
- **An empty cloud deck (`createCloudField([], noise)`) must still construct
  and dispose cleanly** with the new coverage texture in the mix — the
  existing "absent for a clear sky" test already exercises this shape for
  `shape`/`detail`; Task 4 extends it to `coverage` rather than assuming a
  third texture behaves the same as the first two.
- **A spatially-uniform (i.e. broken) coverage field would silently defeat
  the entire point of Task 3/4** while every *other* test still passes — the
  raw noise array could be fine but the modulation math could still clamp to
  a constant. Task 3 pins the raw array is non-constant; Task 5's screenshot
  step is what actually confirms the *rendered* cumulus varies, since no
  Tier 1 test runs the GPU shader.
- **The coverage field must drift with the same wind the cumulus shapes
  drift with**, or the clumping pattern will visibly slide against the cloud
  bodies it's supposed to gate. Task 4 reuses the cumulus branch's existing
  `warped` coordinate (already wind-drifted) for the coverage lookup rather
  than introducing a second, independently-drifting coordinate — a likely
  bug if a future edit "cleans up" the sampling by decoupling them.
- **Retiling `DETAIL_TILE_M` finer changes erosion strength, not just
  texel size**, and a thin cumulus layer (`deck-quals`'s is 800 m thick,
  `free-flight`'s 900 m) could erode to near-nothing if the new tile size
  interacts badly with `erode`'s existing `(1 - h)` falloff. Task 5's
  screenshot step checks the deck is still visibly present, not just
  "less blocky."

---

## Task 1: Raise cumulus step counts in `CLOUD_TIERS`

Targets the spec's strongest banding suspect: `lightSteps` at 2/2/1 across
high/medium/low means the internal light-vs-shadow gradient is computed from
1-2 samples, producing coarse discrete lighting steps. `cumulusSteps` at
48/32/20 is also on the low end for real-time volumetric marching (spec §1).
Both are cumulus-only in effect already: `lightSteps`' loop only runs inside
`If(isCirrus.not(), ...)` in `clouds.ts`, and `cumulusSteps` is selected only
when `kind` is cumulus (`isCirrus.select(cirrusSteps, cumulusSteps)`).

**Files:**
- Modify: `src/render/scene/clouds.ts:26-30` (`CLOUD_TIERS`)
- Test: `tests/render/clouds.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CLOUD_TIERS.{high,medium,low}.{cumulusSteps,lightSteps,cirrusSteps}` — unchanged shape, new numbers. `cirrusSteps` untouched (8/6/4). Read by `createClouds`' `setTier` and by `tests/e2e/clouds.spec.ts` via `CLOUD_TIER_PARAM`.

- [ ] **Step 1: Write the failing test**

Replace the whole `describe('clouds (Plan 16a)', ...)` block in `tests/render/clouds.test.ts` (renamed, with one new `it` inserted after the first):

```ts
describe('clouds (Plan 16a, tiers raised in 16d)', () => {
  it('has three tiers that march fewer steps as they descend', () => {
    expect(CLOUD_TIERS.high.cumulusSteps).toBeGreaterThan(CLOUD_TIERS.medium.cumulusSteps)
    expect(CLOUD_TIERS.medium.cumulusSteps).toBeGreaterThan(CLOUD_TIERS.low.cumulusSteps)
    expect(cloudTierFromQuery('?cloudTier=off')).toBe('off')
    expect(cloudTierFromQuery('?cloudTier=low')).toBe('low')
    expect(cloudTierFromQuery('?x=1')).toBeUndefined()
    expect(() => cloudTierFromQuery('?cloudTier=ultra')).toThrow(/cloudTier/)
  })
  it('also raises lightSteps by tier -- the strongest banding fix (design §1) -- strictly descending like cumulusSteps', () => {
    expect(CLOUD_TIERS.high.lightSteps).toBeGreaterThan(CLOUD_TIERS.medium.lightSteps)
    expect(CLOUD_TIERS.medium.lightSteps).toBeGreaterThan(CLOUD_TIERS.low.lightSteps)
  })
  it('drifts with the wind, the velocity of the air, and stands still in calm', () => {
    expect(cloudDriftM(null, 100)).toEqual({ x: 0, z: 0 })
    expect(cloudDriftM(v3(3, 0, -4), 10)).toEqual({ x: 30, z: -40 })
  })
  it('constructs for every shipped deck, drawn last with depth off, and is absent for a clear sky', () => {
    for (const id of ['free-flight', 'deck-quals']) {
      const clouds = createClouds(loadScenario(id).weather.clouds ?? [], noise)
      const mesh = clouds.object as Mesh
      expect(mesh.renderOrder).toBeGreaterThan(0)
      expect(mesh.visible).toBe(true)
      const material = mesh.material as { transparent: boolean; depthTest: boolean; depthWrite: boolean }
      expect(material.transparent).toBe(true)
      expect(material.depthTest).toBe(false)
      expect(material.depthWrite).toBe(false)
      clouds.setTier('low')
      clouds.update(v3(0, 1000, 0), 12, v3(5, 0, 0))
      clouds.dispose()
    }
    expect(createClouds([], noise).object.visible).toBe(false)
  })
  it('shares the terrain fog distance, so a cloud at the draw distance is exactly haze', () => {
    expect(LOD.drawDistanceM).toBe(FOG_DISTANCE_M)
  })
})
```

(Only the `describe` name and the second `it` are new; the other three `it` blocks are reproduced verbatim above, unchanged, so the file section can be replaced as a whole without hand-merging.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/render/clouds.test.ts`
Expected: FAIL on the new test — today's values are `high: 2, medium: 2, low: 1`, so `high.lightSteps > medium.lightSteps` is `2 > 2`, false.

- [ ] **Step 3: Raise the tier values**

Replace `src/render/scene/clouds.ts:26-30`:

```ts
/** Plan 16d: lightSteps (cumulus-only in effect -- cirrus skips the light
 *  march entirely via the `isCirrus.not()` guard below) raised from 2/2/1
 *  and cumulusSteps from 48/32/20, spending some of the ~2x-3x measured
 *  GPU headroom against the 6.0 ms `GPU_BUDGET_P95_MS` ceiling (design
 *  docs/superpowers/specs/2026-09-24-cumulus-cloud-fidelity-design.md §1-2,
 *  headroom re-measured 2026-09-24 in Plan 13d's final run: gpu p95 3.055 ms)
 *  on smoother internal cloud shading. cirrusSteps is untouched -- this is
 *  a cumulus-only fix. Re-measured in Plan 16d's Task 5; bisect these down
 *  first (lightSteps before cumulusSteps) if the GPU budget test fails. */
export const CLOUD_TIERS = {
  high: { cumulusSteps: 64, lightSteps: 6, cirrusSteps: 8 },
  medium: { cumulusSteps: 44, lightSteps: 4, cirrusSteps: 6 },
  low: { cumulusSteps: 24, lightSteps: 2, cirrusSteps: 4 },
} as const
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/render/clouds.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Run full verify**

Run: `npm run verify; rc=$?; echo "verify exit: $rc"`
Expected: `verify exit: 0`

- [ ] **Step 6: Commit**

```bash
git add src/render/scene/clouds.ts tests/render/clouds.test.ts
git commit -m "clouds: raise cumulus lightSteps/cumulusSteps per tier (Plan 16d)"
```

---

## Task 2: Retile cumulus detail noise for the up-close view

`DETAIL_TILE_M` is already cumulus-only in effect: `cloudField.ts`'s
`density()` only samples `detail` inside the cumulus (`Else`) branch — cirrus
never reads it. So "give cumulus its own finer detail tile" (spec §2's
cheaper option) is exactly this one constant, no duplication needed.

**Files:**
- Modify: `src/render/scene/cloudField.ts:18-21` (`DETAIL_TILE_M` and its
  doc comment)
- Test: `tests/render/cloudField.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `DETAIL_TILE_M = 150` (was `400`), same export, same type,
  consumed by `density()`'s existing `texture3D(detail, drifted.div(DETAIL_TILE_M))`.

- [ ] **Step 1: Write the failing test**

Add to `tests/render/cloudField.test.ts`, inside the existing
`describe('cloud field (Plan 16b, extracted from the dome)', ...)` block:

```ts
  it('retiles the cumulus-only detail volume finer for the up-close view (Plan 16d)', () => {
    // DETAIL_TILE_M is sampled only in density()'s cumulus branch -- cirrus
    // never reads `detail` -- so this is the whole fix for "pixelated up
    // close," not a partial one (design §2).
    expect(DETAIL_TILE_M).toBe(150)
  })
```

Add `DETAIL_TILE_M` to the existing import from `'../../src/render/scene/cloudField.js'` at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/render/cloudField.test.ts`
Expected: FAIL — `DETAIL_TILE_M` is currently `400`.

- [ ] **Step 3: Retile**

Replace `src/render/scene/cloudField.ts:18-21`:

```ts
/** Metres per repeat of the shape volume. Gameplay estimates (16a design
 *  §9): a 128-texel tile over 6 km is 47 m per texel. */
export const SHAPE_TILE_M = 6000
/** Metres per repeat of the detail volume -- cumulus-only in effect, since
 *  density() below samples `detail` only in the cumulus branch; cirrus never
 *  reads it. Retiled 400 -> 150 m (Plan 16d, design §2's "cheaper retiling
 *  option"): the erosion texel now spans ~4.7 m over the existing 32-texel
 *  volume, versus ~12.5 m before, for the "camera inside or just below the
 *  cumulus layer" case cirrus never hits. No new texture, no VRAM cost --
 *  see design §2 for why a genuinely finer volume is deferred until this is
 *  measured (Plan 16d Task 5). */
export const DETAIL_TILE_M = 150
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/render/cloudField.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full verify**

Run: `npm run verify; rc=$?; echo "verify exit: $rc"`
Expected: `verify exit: 0`

- [ ] **Step 6: Commit**

```bash
git add src/render/scene/cloudField.ts tests/render/cloudField.test.ts
git commit -m "clouds: retile cumulus detail noise 400m -> 150m (Plan 16d)"
```

---

## Task 3: Generate the cumulus coverage-modulation noise

A new, small (64x64), large-scale 2D Perlin fbm field — the "weather map"
this spec's §2 describes — generated the same way `shape.bin.gz`/
`detail.bin.gz` already are: a pure function in `tools/sky/noise.ts`, written
to a gzipped `.bin.gz` under `content/sky/` by `tools/sky/build.ts`, loaded by
`tools/sky/load.ts` (Node) and (Task 4) `src/render/sky/load.ts` (browser).
This task only builds and commits the asset and proves it varies spatially —
wiring it into the shader is Task 4, kept separate because it touches a
different, larger set of files and is independently risky (Review Focus).

**Files:**
- Modify: `src/render/sky/noise.ts` (add `COVERAGE_SIZE`, `coverageByteLength`)
- Modify: `tools/sky/noise.ts` (add `buildCoverage`)
- Modify: `tools/sky/load.ts` (add `coveragePath`, `loadCoverage`)
- Modify: `tools/sky/build.ts` (build and write the third file)
- Modify: `content/sky/NOTICE.md` (record the new generated file)
- Test: `tests/tools/skyNoise.test.ts`
- Generated (not hand-written): `content/sky/coverage.bin.gz`

**Interfaces:**
- Produces: `COVERAGE_SIZE = 64`, `coverageByteLength(): number`,
  `buildCoverage(size = COVERAGE_SIZE, seed = 1946): Uint8Array` (length
  `size * size`, values in `[0, 255]`), `coveragePath(): string`,
  `loadCoverage(): Uint8Array`. Task 4 consumes all of these.

- [ ] **Step 1: Write the failing tests**

Add to `tests/tools/skyNoise.test.ts`, after the existing
`describe('tileable noise (Plan 16a)', ...)` block:

```ts
describe('coverage noise (Plan 16d)', () => {
  it('tiles at its period and is not a constant field', () => {
    const n = 32
    const v = buildCoverage(n, 5)
    expect(v.length).toBe(n * n)
    const at = (x: number, y: number) => v[y * n + x]!
    // Same wrapping check as buildShape's: opposite edges are adjacent
    // samples under tiling, so they differ by one texel's worth, not a seam.
    let worst = 0
    for (let y = 0; y < n; y++) worst = Math.max(worst, Math.abs(at(0, y) - at(n - 1, y)))
    expect(worst).toBeLessThan(60)
    // The exact defect design §4 warns about: a constant field would
    // silently defeat spatial variation while every other test still passes.
    expect(Math.max(...v) - Math.min(...v)).toBeGreaterThan(80)
  })
})
```

Add `buildCoverage` to the existing import from `'../../tools/sky/noise.js'`.

Extend the existing `describe('the committed noise', ...)` block: add
`coverage.bin.gz` to the loop and its own length assertion. Replace the
whole block:

```ts
const COMMITTED_SHA256: Readonly<Record<string, string>> = {
  // Paste from `sha256sum content/sky/*.gz` after `npm run sky:build`; the
  // commit that changes these says what moved and why.
  'shape.bin.gz': 'ad7af382f211d5ba09eb365d28b70a7a05c11672f107774b6a6f2d7cca8c3fbd',
  'detail.bin.gz': '3291e29dd335627ee5f58d3c21afd1fd3e5a8fd7ce96f1df25895ee5930c81bd',
  'coverage.bin.gz': '', // filled in Step 4 below, after building the real file
}
describe('the committed noise', () => {
  it('has the size the loader expects and the hashes the build produced', () => {
    expect(loadShape().length).toBe(shapeByteLength())
    expect(loadDetail().length).toBe(detailByteLength())
    expect(loadCoverage().length).toBe(coverageByteLength())
    expect(SHAPE_SIZE).toBe(128)
    expect(DETAIL_SIZE).toBe(32)
    expect(COVERAGE_SIZE).toBe(64)
    for (const [name, path] of [
      ['shape.bin.gz', shapePath()], ['detail.bin.gz', detailPath()], ['coverage.bin.gz', coveragePath()],
    ] as const) {
      expect(createHash('sha256').update(readFileSync(path)).digest('hex'), name).toBe(COMMITTED_SHA256[name])
    }
  })
})
```

Update the file's imports accordingly: `coveragePath, loadCoverage` from
`'../../tools/sky/load.js'`; `COVERAGE_SIZE, coverageByteLength` from
`'../../src/render/sky/noise.js'`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tools/skyNoise.test.ts`
Expected: FAIL — `buildCoverage`, `coveragePath`, `loadCoverage`,
`COVERAGE_SIZE`, `coverageByteLength` do not exist yet, and
`content/sky/coverage.bin.gz` does not exist.

- [ ] **Step 3: Implement**

`src/render/sky/noise.ts` — replace the whole file:

```ts
/** Shape and detail volumes (Plan 16a design §3), and the cumulus coverage-
 *  modulation field (Plan 16d design §2): R8, tileable, committed under
 *  content/sky/. Sizes are here, importable by both the Node build and the
 *  browser loader, so the two cannot disagree about a byte count. */
export const SHAPE_SIZE = 128
export const DETAIL_SIZE = 32
export const COVERAGE_SIZE = 64
export const shapeByteLength = (): number => SHAPE_SIZE ** 3
export const detailByteLength = (): number => DETAIL_SIZE ** 3
export const coverageByteLength = (): number => COVERAGE_SIZE ** 2
```

`tools/sky/noise.ts` — change the import line and append `buildCoverage`
after `buildDetail`:

```ts
import { COVERAGE_SIZE, DETAIL_SIZE, SHAPE_SIZE } from '../../src/render/sky/noise.js'
```

```ts
/** Large-scale 2D Perlin fbm: the cumulus coverage-modulation "weather map"
 *  (design §2). Perlin alone, no Worley mix -- unlike buildShape this has no
 *  billowy cloud-body job to do, just smooth regional clumping/gapping of
 *  the per-layer coverage scalar. `base = 3` (vs. buildShape's 4) for even
 *  lower frequency: this is meant to vary over tens of kilometres. */
export function buildCoverage(size = COVERAGE_SIZE, seed = 1946): Uint8Array {
  const perm = createPermutation(seed)
  const out = new Uint8Array(size * size)
  const base = 3
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size
    let n = 0, amp = 0.5, freq = base
    for (let o = 0; o < 3; o++) {
      n += amp * perlinTileable(u * freq, v * freq, 0, freq, perm)
      amp *= 0.5
      freq *= 2
    }
    out[y * size + x] = quantize(n * 0.5 + 0.5)
  }
  return out
}
```

`tools/sky/load.ts` — replace the whole file:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { coverageByteLength, detailByteLength, shapeByteLength } from '../../src/render/sky/noise.js'

export const SKY_DIR = fileURLToPath(new URL('../../content/sky/', import.meta.url))
export const shapePath = (): string => join(SKY_DIR, 'shape.bin.gz')
export const detailPath = (): string => join(SKY_DIR, 'detail.bin.gz')
export const coveragePath = (): string => join(SKY_DIR, 'coverage.bin.gz')
const inflate = (path: string, expected: number): Uint8Array => {
  const data = new Uint8Array(gunzipSync(readFileSync(path)))
  if (data.length !== expected) throw new Error(`${path} inflates to ${data.length} bytes; expected ${expected}`)
  return data
}
/** The committed volumes, inflated; Node only. `src/render/sky/load.ts` is the browser twin. */
export const loadShape = (): Uint8Array => inflate(shapePath(), shapeByteLength())
export const loadDetail = (): Uint8Array => inflate(detailPath(), detailByteLength())
export const loadCoverage = (): Uint8Array => inflate(coveragePath(), coverageByteLength())
```

`tools/sky/build.ts` — replace the whole file:

```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { buildCoverage, buildDetail, buildShape } from './noise.js'
import { coveragePath, detailPath, shapePath, SKY_DIR } from './load.js'

mkdirSync(SKY_DIR, { recursive: true })
const shape = buildShape(), detail = buildDetail(), coverage = buildCoverage()
writeFileSync(shapePath(), gzipSync(shape, { level: 9 }))
writeFileSync(detailPath(), gzipSync(detail, { level: 9 }))
writeFileSync(coveragePath(), gzipSync(coverage, { level: 9 }))
console.log(`wrote ${shapePath()} (${shape.length} bytes raw), ${detailPath()} (${detail.length} bytes raw), and ${coveragePath()} (${coverage.length} bytes raw)`)
```

`content/sky/NOTICE.md` — append a paragraph:

```markdown

`coverage.bin.gz` (64² R8) is the cumulus coverage-modulation "weather map"
added in Plan 16d, built the same way and under the same license by the same
`npm run sky:build` command.
```

- [ ] **Step 4: Build the asset and pin its hash**

Run:

```bash
npm run sky:build
sha256sum content/sky/coverage.bin.gz
```

Copy the printed hash into `tests/tools/skyNoise.test.ts`'s
`COMMITTED_SHA256['coverage.bin.gz']`, replacing the empty string from Step 1.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/tools/skyNoise.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 6: Run full verify**

Run: `npm run verify; rc=$?; echo "verify exit: $rc"`
Expected: `verify exit: 0`

- [ ] **Step 7: Commit**

```bash
git add src/render/sky/noise.ts tools/sky/noise.ts tools/sky/load.ts tools/sky/build.ts \
  content/sky/NOTICE.md content/sky/coverage.bin.gz tests/tools/skyNoise.test.ts
git commit -m "sky: generate cumulus coverage-modulation noise (Plan 16d)"
```

---

## Task 4: Wire the coverage field into cumulus density, spatially

Loads the new asset through the same fetch-and-inflate path the shape/detail
volumes already use, then samples it inside `cloudField.ts`'s `density()`
cumulus branch to modulate the per-layer `coverage` scalar before it
thresholds the shape noise — replacing today's single uniform threshold with
one that varies across the sky (spec §2).

**Files:**
- Modify: `src/render/content.ts` (add `COVERAGE_NOISE_PATH`/`_URL`)
- Modify: `src/render/sky/load.ts` (extend `SkyNoise`, fetch the third file)
- Modify: `src/render/scene/cloudField.ts` (the actual sampling/modulation)
- Modify: `tests/render/skyLoad.test.ts`
- Modify: `tests/render/cloudField.test.ts`
- Modify: `tests/render/clouds.test.ts` (its `noise` literal needs `coverage` too)
- Modify: `tests/render/cloudShadow.test.ts` (same `noise` literal)
- Modify: `tests/build/dist.test.ts` (dist output must include the new file)

**Interfaces:**
- Consumes: `COVERAGE_SIZE`, `coverageByteLength` (Task 3, `src/render/sky/noise.ts`); `buildCoverage`/`loadCoverage` only via the already-committed asset, not called directly here.
- Produces: `SkyNoise` now has `readonly coverage: Uint8Array`. `CloudField` now has `readonly coverage: DataTexture` and `COVERAGE_TILE_M` is exported from `cloudField.ts` alongside `SHAPE_TILE_M`/`DETAIL_TILE_M`. `density()`'s signature and behavior for cirrus are unchanged; cumulus density now additionally depends on world XZ position via the coverage field.

- [ ] **Step 1: Write the failing tests**

`tests/render/skyLoad.test.ts` — replace the whole file:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadSkyNoise } from '../../src/render/sky/load.js'
import { COVERAGE_NOISE_URL, DETAIL_NOISE_URL, SHAPE_NOISE_URL } from '../../src/render/content.js'
import { coveragePath, detailPath, loadCoverage, loadDetail, loadShape, shapePath } from '../../tools/sky/load.js'

const fromDisk: typeof fetch = async (input) => {
  const url = String(input)
  const path = url.endsWith(SHAPE_NOISE_URL) ? shapePath()
    : url.endsWith(DETAIL_NOISE_URL) ? detailPath()
    : url.endsWith(COVERAGE_NOISE_URL) ? coveragePath()
    : null
  if (path === null) return new Response(null, { status: 404, statusText: 'not a sky file' })
  return new Response(readFileSync(path), { status: 200 })
}

describe('loadSkyNoise (Plan 16a, extended in 16d)', () => {
  it('inflates the committed volumes through the production path and agrees with the Node loader', async () => {
    const noise = await loadSkyNoise(fromDisk)
    expect(noise.shape).toEqual(loadShape())
    expect(noise.detail).toEqual(loadDetail())
    expect(noise.coverage).toEqual(loadCoverage())
  })
  it('refuses a missing file loudly', async () => {
    await expect(loadSkyNoise(async () => new Response(null, { status: 404, statusText: 'gone' }))).rejects.toThrow(/404/)
  })
})
```

In `tests/render/cloudField.test.ts`, `tests/render/clouds.test.ts`, and
`tests/render/cloudShadow.test.ts`, change the top-of-file:

```ts
const noise = { shape: loadShape(), detail: loadDetail() }
```

to:

```ts
const noise = { shape: loadShape(), detail: loadDetail(), coverage: loadCoverage() }
```

adding `loadCoverage` to each file's existing import from
`'../../tools/sky/load.js'`. (These three are a type-checker requirement,
not new test assertions — `SkyNoise` gains a required field in Step 3 below,
so these files fail to *compile* without this, which `npm run typecheck`
inside Step 5/6's `verify` will catch if missed.)

In `tests/render/cloudField.test.ts`, add a new test to the existing
`describe('cloud field (Plan 16b, extracted from the dome)', ...)` block:

```ts
  it('exposes a coverage field that spatially modulates cumulus (Plan 16d)', () => {
    const field = createCloudField(loadScenario('free-flight').weather.clouds ?? [], noise)
    expect(field.coverage.image.width).toBe(COVERAGE_SIZE)
    expect(field.coverage.image.height).toBe(COVERAGE_SIZE)
    const data = field.coverage.image.data as Uint8Array
    expect(Math.max(...data) - Math.min(...data)).toBeGreaterThan(80)
    expect(COVERAGE_TILE_M).toBe(60_000)
    field.dispose()
  })
```

Add `COVERAGE_TILE_M` to the file's existing import from
`'../../src/render/scene/cloudField.js'`, and `COVERAGE_SIZE` from a new
import `'../../src/render/sky/noise.js'`.

In `tests/build/dist.test.ts`, add `COVERAGE_NOISE_PATH` to the existing
import from `'../../src/render/content.js'` and add, next to the existing
`SHAPE_NOISE_PATH`/`DETAIL_NOISE_PATH` assertions:

```ts
      expect(existsSync(join(outDir, COVERAGE_NOISE_PATH)), COVERAGE_NOISE_PATH).toBe(true)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/render/skyLoad.test.ts tests/render/cloudField.test.ts`
Expected: FAIL to even compile — `COVERAGE_NOISE_URL`, `COVERAGE_TILE_M`,
`field.coverage` don't exist yet.

- [ ] **Step 3: Implement**

`src/render/content.ts` — add after the existing `DETAIL_NOISE_URL` line:

```ts
/** Plan 16d's cumulus coverage-modulation field, shipped the same way as
 *  the shape/detail volumes above. */
export const COVERAGE_NOISE_PATH = 'content/sky/coverage.bin.gz'
export const COVERAGE_NOISE_URL = `${import.meta.env.BASE_URL}${COVERAGE_NOISE_PATH}`
```

`src/render/sky/load.ts` — replace the whole file:

```ts
import { COVERAGE_NOISE_URL, DETAIL_NOISE_URL, SHAPE_NOISE_URL } from '../content.js'
import { coverageByteLength, detailByteLength, shapeByteLength } from './noise.js'
import { inflateIfGzipped } from '../gunzip.js'

export type SkyNoise = { readonly shape: Uint8Array; readonly detail: Uint8Array; readonly coverage: Uint8Array }

/** Fetches and inflates all three volumes; the length check makes a
 *  truncated or mis-built file fail here rather than as a sky full of
 *  garbage. Same gunzip path as landcover/load.ts (inflate only if the
 *  server did not), so the Node test runs the production code against the
 *  files on disk. */
export async function loadSkyNoise(fetchImpl: typeof fetch = fetch): Promise<SkyNoise> {
  const one = async (url: string, expected: number): Promise<Uint8Array> => {
    const res = await fetchImpl(url)
    if (!res.ok || res.body === null) throw new Error(`Failed to fetch cloud noise (${url}): ${res.status} ${res.statusText}`)
    const data = await inflateIfGzipped(await res.arrayBuffer())
    if (data.length !== expected) throw new Error(`${url} inflates to ${data.length} bytes; expected ${expected}`)
    return data
  }
  const [shape, detail, coverage] = await Promise.all([
    one(SHAPE_NOISE_URL, shapeByteLength()),
    one(DETAIL_NOISE_URL, detailByteLength()),
    one(COVERAGE_NOISE_URL, coverageByteLength()),
  ])
  return { shape, detail, coverage }
}
```

`src/render/scene/cloudField.ts` — this is the substantive edit. Replace the
whole file:

```ts
import { Data3DTexture, DataTexture, LinearFilter, RedFormat, RepeatWrapping, UnsignedByteType, Vector2, Vector3, Vector4 } from 'three'
import type { Node, UniformNode, UniformArrayNode } from 'three/webgpu'
import { Fn, If, clamp, float, max, mix, sin, smoothstep, texture, texture3D, uniform, uniformArray, vec3 } from 'three/tsl'
import { MAX_CLOUD_LAYERS, type CloudLayer } from '../../sim/scenario.js'
import type { Vec3 } from '../../sim/math/vec3.js'
import type { SkyNoise } from '../sky/load.js'
import { COVERAGE_SIZE, DETAIL_SIZE, SHAPE_SIZE } from '../sky/noise.js'

/**
 * The cloud FIELD: the two noise volumes, the coverage-modulation field, the
 * layer uniforms, the drift, and the density function (design 16a §4, 16d
 * §2). Extracted from the dome on 2026-09-19 for Plan 16b so the shadow pass
 * reads the same function the dome marches -- one field, two readers, and
 * the shadow cannot disagree with the cloud that casts it. `clouds.ts` keeps
 * the march; `cloudShadow.ts` integrates this along the sun. Nothing here
 * knows about a camera.
 */

/** Metres per repeat of the shape volume. Gameplay estimates (16a design
 *  §9): a 128-texel tile over 6 km is 47 m per texel. */
export const SHAPE_TILE_M = 6000
/** Metres per repeat of the detail volume -- cumulus-only in effect, since
 *  density() below samples `detail` only in the cumulus branch; cirrus never
 *  reads it. Retiled 400 -> 150 m (Plan 16d, design §2's "cheaper retiling
 *  option"): the erosion texel now spans ~4.7 m over the existing 32-texel
 *  volume, versus ~12.5 m before, for the "camera inside or just below the
 *  cumulus layer" case cirrus never hits. No new texture, no VRAM cost --
 *  see design §2 for why a genuinely finer volume is deferred until this is
 *  measured (Plan 16d Task 5). */
export const DETAIL_TILE_M = 150
/** Metres per repeat of the cumulus coverage-modulation field (Plan 16d
 *  design §2). Much larger than SHAPE_TILE_M on purpose: this is meant to
 *  read as broad, tens-of-kilometres regional weather variation, not
 *  per-cloud shape. 60 km against a 100 km `FOG_DISTANCE_M` draw distance
 *  keeps at most one visible repeat inside the fog. */
export const COVERAGE_TILE_M = 60_000
/** How far the coverage field can push a layer's configured coverage up or
 *  down: [0.4x, 1.6x], centred on 1x at a mid-value (0.5) sample so the
 *  configured `coverage` stays the deck's spatial average -- this only
 *  clumps and gaps it, it does not change the average cloudiness Mark
 *  configured per layer (design §2). Cumulus only; cirrus's threshold is
 *  untouched. */
const COVERAGE_MOD_MIN = 0.4
const COVERAGE_MOD_MAX = 1.6
/** Extinction per metre at full density; ~250 m to opaque for cumulus. */
export const CUMULUS_SIGMA = 0.012
/** The committed shape volume's value range, from `tests/tools/skyNoise.test.ts`'s
 *  measurement of the 128-cube (110..247 of 255). */
const SHAPE_MIN = 110 / 255
const SHAPE_MAX = 247 / 255
export const KIND_CUMULUS = 0
export const KIND_CIRRUS = 1

/** Where the noise has drifted to: the ground wind times simulated seconds. */
export function cloudDriftM(wind: Vec3 | null, seconds: number): { x: number; z: number } {
  return wind === null ? { x: 0, z: 0 } : { x: wind.x * seconds, z: wind.z * seconds }
}

export type CloudField = {
  readonly shape: Data3DTexture
  readonly detail: Data3DTexture
  /** The Plan 16d cumulus coverage-modulation field (design §2), 2D, tiled
   *  every `COVERAGE_TILE_M`. */
  readonly coverage: DataTexture
  /** [base, thickness, coverage, kind] per layer, padded to MAX_CLOUD_LAYERS, sorted by base. */
  readonly layerData: UniformArrayNode<string>
  readonly layerCount: UniformNode<'int', number>
  readonly eyeWorld: UniformNode<'vec3', Vector3>
  readonly drift: UniformNode<'vec2', Vector2>
  /** The sorted layers, for CPU-side questions (which is the lowest cumulus). */
  readonly layers: readonly CloudLayer[]
  /** Density in [0, 1] at a TRUE world point for one layer; 0 outside its slab. */
  density(p: Node<'vec3'>, base: Node<'float'>, thickness: Node<'float'>, coverage: Node<'float'>, kind: Node<'float'>): Node<'float'>
  /** Lowest cumulus layer's [base, top] in metres, or null when the deck has no cumulus. */
  lowestCumulus(): { baseM: number; topM: number } | null
  update(eye: Vec3, driftSeconds: number, wind: Vec3 | null): void
  dispose(): void
}

function volume(data: Uint8Array, size: number): Data3DTexture {
  const t = new Data3DTexture(data, size, size, size)
  t.format = RedFormat
  t.type = UnsignedByteType
  t.wrapS = t.wrapT = t.wrapR = RepeatWrapping
  t.minFilter = t.magFilter = LinearFilter
  t.unpackAlignment = 1
  t.needsUpdate = true
  return t
}

function plane(data: Uint8Array, size: number): DataTexture {
  const t = new DataTexture(data, size, size)
  t.format = RedFormat
  t.type = UnsignedByteType
  t.wrapS = t.wrapT = RepeatWrapping
  t.minFilter = t.magFilter = LinearFilter
  t.unpackAlignment = 1
  t.needsUpdate = true
  return t
}

export function createCloudField(layers: readonly CloudLayer[], noise: SkyNoise): CloudField {
  const sorted = [...layers].sort((a, b) => a.baseM - b.baseM)
  const shape = volume(noise.shape, SHAPE_SIZE)
  const detail = volume(noise.detail, DETAIL_SIZE)
  const coverageField = plane(noise.coverage, COVERAGE_SIZE)

  // Uniforms. Layers as [base, thickness, coverage, kind], padded to MAX.
  const layerData = uniformArray(
    Array.from({ length: MAX_CLOUD_LAYERS }, (_, i) => {
      const l = sorted[i]
      return l ? new Vector4(l.baseM, l.thicknessM, l.coverage, l.kind === 'cirrus' ? KIND_CIRRUS : KIND_CUMULUS) : new Vector4(0, 0, 0, 0)
    }),
    'vec4',
  )
  const layerCount = uniform(sorted.length, 'int')
  const eyeWorld = uniform(new Vector3())
  const drift = uniform(new Vector2())

  /** Density in [0, 1] at a world point for one layer; 0 outside the slab. */
  const density = Fn(([p, base, thickness, coverage, kind]: [Node<'vec3'>, Node<'float'>, Node<'float'>, Node<'float'>, Node<'float'>]) => {
    const h = p.y.sub(base).div(thickness)
    const inside = h.greaterThan(0).and(h.lessThan(1))
    const d = float(0).toVar()
    If(inside, () => {
      const drifted = vec3(p.x.add(drift.x), p.y, p.z.add(drift.y))
      // The committed volume spans 110..247 of 255 (the Perlin-Worley remap
      // lifts the low end on purpose); stretched back to 0..1 here so
      // `coverage` means the fraction of sky it names.
      const stretch = (v: Node<'float'>): Node<'float'> => clamp(v.sub(SHAPE_MIN).div(SHAPE_MAX - SHAPE_MIN), 0, 1)
      // Coverage thresholds the shape: what survives above 1 - coverage is
      // cloud. `cov` is a parameter now (Plan 16d), not the closed-over
      // layer scalar directly, so cumulus can pass a spatially-modulated
      // value while cirrus keeps passing the plain layer scalar unchanged.
      const threshold = (shapeValue: Node<'float'>, cov: Node<'float'>): Node<'float'> =>
        clamp(shapeValue.sub(float(1).sub(cov)).div(max(cov, 0.001)), 0, 1)
      // ONE branch samples, never both: a `mix` of the two kinds after
      // sampling cost every cumulus step three volume reads instead of one
      // (3.9 ms against the 2.5 ms budget, 2026-09-19).
      If(kind.greaterThan(0.5), () => {
        // Cirrus: the same volume stretched along the east axis over a tile
        // three times wider, times a second coarser sample so the 1.5 km
        // Worley cells cannot read as a grid from below. A thin band.
        // Untouched by Plan 16d: no coverage modulation for cirrus (spec §1).
        const streaks = texture3D(shape, drifted.mul(vec3(1 / (SHAPE_TILE_M * 9), 1 / SHAPE_TILE_M, 1 / (SHAPE_TILE_M * 3)))).r
        const sheet = texture3D(shape, drifted.mul(vec3(1 / (SHAPE_TILE_M * 4), 1 / (SHAPE_TILE_M * 2), 1 / (SHAPE_TILE_M * 5))).add(0.37)).r
        const gradient = smoothstep(0, 0.3, h).mul(smoothstep(1, 0.7, h))
        d.assign(threshold(stretch(streaks.mul(0.6).add(sheet.mul(0.4))), coverage).mul(gradient).mul(0.6))
      }).Else(() => {
        // Cumulus: flat-bottomed, rounded on top, edges eroded by the detail
        // volume, strongest near the base and the edge (Schneider 2015).
        // Slowly warp the horizontal coordinates at two unequal scales:
        // the same 6 km volume must not line up in repeating distant rows.
        const warped = vec3(
          drifted.x.add(sin(drifted.z.div(7300).add(drifted.x.div(17000))).mul(1800)),
          drifted.y,
          drifted.z.add(sin(drifted.x.div(9100).sub(drifted.z.div(13000))).mul(1800)),
        )
        const shapeValue = stretch(texture3D(shape, warped.div(SHAPE_TILE_M)).r)
        // Plan 16d: the coverage-modulation field, sampled at the SAME
        // warped XZ the shape volume uses -- already wind-drifted via
        // `drifted` -- so the clumping pattern never slides against the
        // cloud bodies it gates (Review Focus). Reading a bare `drifted.xz`
        // here instead would be the easy, wrong "simplification."
        const covNoise = texture(coverageField, warped.xz.div(COVERAGE_TILE_M)).r
        const effCoverage = clamp(coverage.mul(mix(float(COVERAGE_MOD_MIN), float(COVERAGE_MOD_MAX), covNoise)), 0, 1)
        const gradient = smoothstep(0, 0.1, h).mul(smoothstep(1, 0.55, h))
        const body = threshold(shapeValue, effCoverage).mul(gradient)
        const e = texture3D(detail, drifted.div(DETAIL_TILE_M)).r
        const erode = e.mul(float(1).sub(h)).mul(0.3)
        d.assign(clamp(body.sub(erode).div(max(float(1).sub(erode), 0.001)), 0, 1))
      })
    })
    return d
  })

  const firstCumulus = sorted.find((l) => l.kind === 'cumulus')
  return {
    shape, detail, coverage: coverageField, layerData, layerCount, eyeWorld, drift, layers: sorted,
    // A TSL `Fn` is callable but not typed as the method above; the closure
    // gives the handle a plain function type.
    density: (p, base, thickness, coverage, kind) => density(p, base, thickness, coverage, kind),
    lowestCumulus: () => (firstCumulus ? { baseM: firstCumulus.baseM, topM: firstCumulus.baseM + firstCumulus.thicknessM } : null),
    update(eye, driftSeconds, wind): void {
      eyeWorld.value.set(eye.x, eye.y, eye.z)
      const d = cloudDriftM(wind, driftSeconds)
      drift.value.set(d.x, d.z)
    },
    dispose(): void {
      shape.dispose()
      detail.dispose()
      coverageField.dispose()
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/render/skyLoad.test.ts tests/render/cloudField.test.ts tests/render/clouds.test.ts tests/render/cloudShadow.test.ts tests/build/dist.test.ts`
Expected: PASS, all tests in all five files.

- [ ] **Step 5: Run full verify**

Run: `npm run verify; rc=$?; echo "verify exit: $rc"`
Expected: `verify exit: 0`. Pay particular attention to `depcruise` and
`tests/architecture/boundary.test.ts` — this task adds no new imports across
the `sim/`↔`render/` boundary, but confirm rather than assume.

- [ ] **Step 6: Commit**

```bash
git add src/render/content.ts src/render/sky/load.ts src/render/scene/cloudField.ts \
  tests/render/skyLoad.test.ts tests/render/cloudField.test.ts tests/render/clouds.test.ts \
  tests/render/cloudShadow.test.ts tests/build/dist.test.ts
git commit -m "clouds: modulate cumulus coverage with a spatial weather field (Plan 16d)"
```

---

## Task 5: Tier 2 measurement, tuning, and handoff

Tasks 1-4 are all committed but unmeasured on real hardware. This task runs
the GPU harness, reads the new screenshots by eye (this repo's own rule:
never trust a picture nobody looked at), bisects the tier numbers down if the
budget test fails, and closes out the plan the way every other plan in this
repo does — a handoff document and an updated §15 row.

**Files:**
- Modify: `tests/e2e/clouds.spec.ts` (new low-altitude test; possibly the
  `2.5` ms delta-budget literal)
- Possibly modify: `src/render/scene/clouds.ts` (`CLOUD_TIERS`, if bisection
  is needed)
- Create: `docs/handoff/<today>-plan16d-cumulus-fidelity.md`
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (Plan 16's
  row in §15's table)

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: nothing further downstream — this is the plan's last task.

- [ ] **Step 1: Add the low-altitude cumulus screenshot test**

Add to `tests/e2e/clouds.spec.ts`, after the existing `'above the deck'` test
and before the `'budget: ...'` test:

```ts
test('low-altitude pass through the cumulus base: fluffy, varied edges, not banded or blocky (Plan 16d)', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  // free-flight's cumulus spans 1500-2400 m (tests/render/cloudField.test.ts).
  // Enter from just below the base and climb through it -- the "camera is
  // inside or just below the layer" case cirrus never hits (design §1),
  // which the existing wide establishing shots above never frame this close.
  await page.goto(spawnUrl({ ...OVER_GULF, y: 1400 }))
  await waitForTerrain(page)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'test-results/clouds-lowlevel-below.png' })
  await page.keyboard.down('Numpad8')
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'test-results/clouds-lowlevel-through.png' })
  await page.keyboard.up('Numpad8')
  expect(await errors(page)).toEqual([])
})
```

- [ ] **Step 2: Run the cloud and deck-quals Tier 2 specs**

Ensure `npm run dev:lan` is running in this checkout on nexus and the
Playwright tunnel to the Windows desktop is up (README's "Tier 2: the GPU
harness" is authoritative if either needs restarting), then run:

```bash
ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org \
  npx playwright test clouds.spec.ts deckQuals.spec.ts
```

Expected: all pass. Read the console output for the `clouds off p95 / high
p95 / cost` line from the existing budget test.

- [ ] **Step 3: Read the new screenshots**

Open `test-results/clouds-lowlevel-below.png` and
`test-results/clouds-lowlevel-through.png` directly. Confirm the cumulus
edges read as fluffy and varied rather than blocky or sharply banded near the
base. If they do not, that is a real signal to revisit Task 2's
`DETAIL_TILE_M` or Task 4's `COVERAGE_MOD_MIN`/`MAX`/`COVERAGE_TILE_M` before
proceeding — iterate Tasks 2/4 and re-run Step 2, rather than shipping a
change that does not visibly address Mark's original complaint.

- [ ] **Step 4: Resolve the budget test outcome**

From Step 2's two assertions (`high.p95 - off.p95 < 2.5`, `high.p95 < 6.0`):

- **Both pass:** no further action here; proceed to Step 5.
- **`high.p95 < 6.0` (the real ceiling) fails:** bisect down. First halve the
  *increase* to `lightSteps` at the tier(s) involved (e.g. high's `+4` over
  the old `2` becomes `+2`, i.e. `4`), re-run Step 2, repeat. Only touch
  `cumulusSteps` next if halving `lightSteps`'s increase twice still isn't
  enough. Never touch `cirrusSteps`, `MAX_MARCH_M`, or anything cirrus-side —
  out of scope (spec §3). Once passing, update `CLOUD_TIERS` in
  `src/render/scene/clouds.ts` (Task 1) to the final bisected numbers and
  update that constant's doc comment with the actual measured values and
  today's date.
- **Only `high.p95 - off.p95 < 2.5` fails, but `high.p95 < 6.0` still
  passes:** this is the deliberate spend of measured headroom the spec calls
  for (§2), not a regression. Raise the `2.5` literal in
  `tests/e2e/clouds.spec.ts`'s budget test to the new measured cost, rounded
  up to one decimal place, with a comment recording the date, the RX 6700 XT
  numbers, and a pointer to this plan — the same convention
  `GPU_BUDGET_P95_MS`'s own comment already uses for its derivation.

- [ ] **Step 5: Run the full Tier 2 suite**

```bash
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org npm run test:tier2
```

Expected: all pass, zero transport failures. This is not redundant with Step
2 — `CLOUD_TIERS` is a global constant every scenario's clouds read, and
`deck-quals`'s heavier 0.55-coverage deck (`content/scenarios/deck-quals.json`)
is the likeliest scenario to blow the 6.0 ms ceiling even where `free-flight`
measured fine (Review Focus). If anything in the full suite fails on the
budget, treat it exactly per Step 4's bisection procedure, using the failing
scenario's own numbers.

Also read the console output of the existing "distant cloud edges" pixel-
quality guard (inside `clouds.spec.ts`'s per-tier loop, `high`/`1300`): its
`residual < 3` and `range > 40` thresholds must still pass. If either
regresses, that is a real defect from the detail retile or coverage
modulation, not a threshold to loosen — go back to Tasks 2/4.

- [ ] **Step 6: Write the handoff document**

Create `docs/handoff/<today's date>-plan16d-cumulus-fidelity.md`, following
the shape of `docs/handoff/2026-09-19-plan16a-clouds.md`: what changed (the
four fixes), the final `CLOUD_TIERS` numbers and `DETAIL_TILE_M`/
`COVERAGE_TILE_M`/`COVERAGE_MOD_MIN`/`MAX` values (noting whether Step 4's
bisection changed any from this plan's starting values), before/after GPU
numbers from Steps 2 and 5, and the screenshot filenames from Step 1 with a
one-line description of what they show.

- [ ] **Step 7: Update §15's plan table**

In `docs/superpowers/specs/2026-09-12-ww2airsim-design.md`, find Plan 16's
row in §15's table (currently ending "...16c movable sun landed
2026-09-19 ([design](2026-09-19-sun-design.md),
[handoff](../../handoff/2026-09-19-plan16c-sun.md))"). Append, following the
exact same style: "; 16d cumulus fidelity (step counts, coverage field,
detail retile) landed `<date>` ([design](2026-09-24-cumulus-cloud-fidelity-design.md), [plan](../plans/2026-09-24-cumulus-cloud-fidelity.md), [handoff](../../handoff/`<date>`-plan16d-cumulus-fidelity.md))".

- [ ] **Step 8: Final verify and commit**

```bash
npm run verify; rc=$?; echo "verify exit: $rc"
```

```bash
git add tests/e2e/clouds.spec.ts src/render/scene/clouds.ts \
  docs/handoff/*-plan16d-cumulus-fidelity.md docs/superpowers/specs/2026-09-12-ww2airsim-design.md
git commit -m "clouds: Tier 2 measurement and handoff for cumulus fidelity (Plan 16d)"
```

---

## After this plan

Per ww2airsim's `CLAUDE.md`: email Mark this plan and its spec as HTML now
that the plan is written (`python3 tools/mail-doc.py <file> "<subject>"`,
never `--debug`'d afterward), and do not implement until he has reviewed it
and chosen an execution approach.
