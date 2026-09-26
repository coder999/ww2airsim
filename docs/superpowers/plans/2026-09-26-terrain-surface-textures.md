# Terrain surface textures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the near ground real photographed texture: five CC0 materials (sand, grass, dirt, jungle floor, rock), each an albedo + normal pair, built to KTX2 by a new `tools/textures/` step and blended by the terrain's existing, unchanged weights.

**Architecture:** A build tool downloads five Poly Haven CC0 materials (MD5-pinned), resizes them with `sharp`, and encodes two 5-layer KTX2 array textures with a pinned KTX-Software 4.4.2 binary it fetches itself (SHA-1-pinned). At boot, three r186's `KTX2Loader` (which supports `WebGPURenderer` and array textures, verified) loads them before the terrain mesh is built. The texture *modulates* each existing procedural color by `texel / layerMean`, so every blend weight and the far-field hue stay exactly what they are today, and the detail fades out with eye distance. Normal maps add to the existing procedural detail slope under the existing 12° cap. The whole detail path turns off at scenery tier `low`, and there's a DEV query flag for A/B captures.

**Tech Stack:** TypeScript, three r186 `three/webgpu` + TSL, `three/addons/loaders/KTX2Loader.js`, `sharp` (already a devDependency), KTX-Software 4.4.2 `ktx create`, vitest (Tier 1), Playwright on the reference GPU (Tier 2).

**Spec:** `docs/superpowers/specs/2026-09-24-visual-realism-pass-design.md` §2 and §2.1 (and §6 for testing, §7 for the open items this plan settles). §1 (G-force toggle), §2.2/§2.3/§3 (trees, buildings, ships) are **out of scope** for this plan.

## What was established before writing (2026-09-25/26, nexus)

These are measured, not assumed. Don't re-derive them.

| Fact | How verified |
| --- | --- |
| three r186 `KTX2Loader.detectSupport(renderer)` has a `renderer.isWebGPURenderer` branch that reads `hasFeature('texture-compression-bc'/'-astc'/'-etc2')` | read `node_modules/three/examples/jsm/loaders/KTX2Loader.js:230-241` |
| `KTX2Loader` returns a `CompressedArrayTexture` when `layerCount > 1` | same file, `:447` |
| TSL `TextureNode` has `.depth(node)` for array layers | `node_modules/three/src/nodes/accessors/TextureNode.js:865` |
| three's `WebGPUBackend` requests **every** adapter-supported feature (`requiredFeatures: supportedFeatures`), so BC is on for the RX 6700 XT without any change to `src/render/renderer.ts` | `node_modules/three/src/renderers/webgpu/WebGPUBackend.js:244-248` |
| The ww2airsim nginx vhost sets no Content-Security-Policy, so the transcoder's wasm + Blob worker aren't blocked | `grep` of `vps-infra/sites/ww2airsim/nginx/conf.d/site.conf`: only `X-Robots-Tag` |
| KTX-Software **v4.4.2** Linux x86_64 tarball SHA-1 `c6b08c817f8c8dd299deccae4f2fbb8d55e9acd2`, and its `bin/ktx` runs without `LD_LIBRARY_PATH` (rpath) | downloaded; matched the release's own `.sha1`; `env -u LD_LIBRARY_PATH ktx --version` → `v4.4.2` |
| The five sources encode to **albedo 1,155,101 B** (1024², ETC1S/BasisLZ, 11 levels, 5 layers, 4.5 s) and **normal 1,614,032 B** (512², UASTC + zstd 18, 5 layers, 0.75 s): 2.77 MB total | encoded with the exact commands in Task 2 |
| Mean sRGB of each 1k albedo: beach 145/134/122, leafy grass 151/131/89, dirt 123/94/65, forest leaves 142/112/58, rocks 110/93/52 | `sharp().stats()` |
| The transcoder three ships: `examples/jsm/libs/basis/basis_transcoder.{js,wasm}`, 57,529 + 527,333 B, Apache-2.0 (Binomial) | `ls -la` |

**Sources (all Poly Haven, all CC0, 2k JPG, MD5 from `api.polyhaven.com/files/<id>`):**

| Layer | Poly Haven id | Author | Real size | Diffuse MD5 | nor_gl MD5 |
| --- | --- | --- | --- | --- | --- |
| sand | `aerial_beach_01` | Rob Tuytel | 30 m | `b06496ad69bc0587e03e9cbcf9a80d76` | `fdf59672f1e41cd406c2107f6cea538d` |
| grass | `leafy_grass` | Charlotte Baglioni | 2 m | `8014f4dace676a62ed71b3dd76119dae` | `ea5e91abe01dc5e5d7028c68c3bc9194` |
| dirt | `dirt_aerial_02` | Rob Tuytel | 20 m | `100d18e171bc3c4929a54bd1efe10755` | `bc6e87fda54e73ff8b9f15c56f4632b3` |
| jungle | `forest_leaves_02` | Rob Tuytel | 3 m | `b7837ba1c51fb0e11af36d6b4e225c20` | `f974000a2ddc7dcd22bc84c37aa5d7ce` |
| rock | `aerial_rocks_02` | Rob Tuytel | 50 m | `f493fa9b31911f8a30ecd1d41cbc6f3d` | `7c405cfd3308a2672c99b44e102c328e` |

Jungle floor was flagged in the spec as a likely AI-generated fallback. It wasn't needed: `forest_leaves_02` is real CC0 leaf litter. Diffuse URL pattern: `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/<id>/<id>_diff_2k.jpg`, **except** `forest_leaves_02`, whose file is `forest_leaves_02_diffuse_2k.jpg`. Normal: `.../<id>/<id>_nor_gl_2k.jpg`. The URLs are copied verbatim into Task 2's `sources.ts`.

## Rulings made in this plan (read before "fixing" any of them)

1. **Modulate, don't replace, the hue.** Each layer multiplies the existing procedural color by `texel / meanLinear` (per channel, clamped to ≤ 3). The literal reading of §2.1, replacing the flat color with the texture, would turn Leyte's forest **brown** from altitude, because leaf litter (mean 142/112/58) is what's under a canopy, not what the canopy looks like. It would also silently redo the land-cover calibration from Plans 13a/13b. With modulation, the spec's "blend weights unchanged" holds, the land cover keeps owning the far-field color, and the texture supplies the photographed structure. *Cost if reversed:* mean-matching each texture to its procedural color, re-judging every aerial view, and a canopy that has to come from somewhere else. **An eye-check question for Mark at handoff**, not a settled aesthetic.
2. **Anti-tiling = two scales + noise blend + distance fade, not triplanar** (settles spec §7 item 2). Each albedo layer is sampled at its real-world tile size and again at 7.3× that size, rotated 90° and offset. The two samples are blended by the existing 2800 m macro noise. Albedo detail fades 1 → 0 between 1.5 km and 6 km of eye distance, and normal detail fades with the existing `detailNormalFade` (500 m → 2 km). Triplanar is rejected for v1: it triples the samples, and the 98 m heightfield rarely exceeds the `bare` rock threshold's ~46° slope, where planar stretch is 1.45×. Revisit only if the Task 6 eye check shows smeared rock.
3. **One resolution at every Asset Quality tier** (albedo 1024², normal 512²). 2.77 MB is smaller than one terrain level, and gating it behind `medium` would hide it from every first visit (`INTERIM_ASSET_QUALITY_TIER` is `'low'`). The GPU-cost lever is **Render Quality → scenery tier**: at `low` the terrain uses a material with no texture nodes at all, not a zero-weighted one.
4. **Textures load before the terrain mesh, once per boot.** No mid-flight recompile when they arrive. A tier change recompiles the ring materials once (`material.needsUpdate`), which only happens from the Settings dialog. A failed load leaves the procedural surface, logged with `console.warn` (not `error`, so it doesn't trip the Tier 2 console guard). Land cover is a picture, and so is this.
5. **The Basis transcoder is vendored into `content/vendor/basis/`**, not imported through Vite. `KTX2Loader.setTranscoderPath` takes a directory and appends fixed file names, so a hashed `?url` import can't serve it. A Tier 1 test asserts that the vendored bytes equal `node_modules/three`'s, so a three upgrade that changes the transcoder fails loudly instead of desyncing from the loader.
6. **The normal maps are the OpenGL (`nor_gl`) variants.** With `uv = worldXZ / tileM`, +u is +x, and image-up (+G in GL convention) is −v, which is −z. So the tangent-space normal (nx, ny, nz) is world (nx, nz, −ny), and the slope is `dh/dx = −nx/nz`, `dh/dz = ny/nz`. `normalToSlope` (Task 4) is the CPU twin with a test, and the Task 6 low-sun capture is the GPU check.

## Global Constraints

- three stays at `^0.186.0`; no new runtime dependency. `KTX2Loader` comes from `three/addons/loaders/KTX2Loader.js`.
- Every bundled texture gets an `ASSETS.md` row (source URL, author, license) **in the same commit** that adds the file (spec §2: "before commit").
- **No anisotropic filtering on terrain textures** (`anisotropy` stays three's default 1). See `surface.ts` `createDetailTexture`: `anisotropy = 8` once cost two thirds of the frame.
- `GPU_BUDGET_P95_MS = 6.0` at 1440p (`tests/e2e/terrain.spec.ts:225`) must still pass with textures **on**.
- The blend weights and their operand order in `terrainSurfaceNode` don't change. Task 1 proves this with a CPU test before any texture exists.
- `src/sim/` is untouched. Dependency rules in `.dependency-cruiser.cjs` hold (`npm run depcruise`).
- US spelling in new prose and identifiers ("color", not "colour"). Existing identifiers like `roadColour` stay as they are.
- `npm run verify` ends **every** task (ww2airsim `CLAUDE.md`). Inside a task, run **named** test files with `--maxWorkers=2` (nexus OOM-killed twice on 2026-09-25 under parallel vitest). Run the end-of-task full verify on ryzen via `remote-run npm run verify` (`serverconfig/ryzen.md`), or on nexus only when `pgrep -af vitest` is empty. Always capture the runner's own exit status (`cmd; echo rc=$?`), never a grep'd pipeline's.
- Keep a rulings ledger at `.superpowers/sdd/2026-09-26-terrain-surface-textures/progress.md` (gitignored) for any decision made during execution.
- If executing on `main`, re-diff against `HEAD` right before every commit: other sessions commit to this checkout.
- Tier 2 runs on the reference GPU only, per `CLAUDE.md` "nexus is headless". Read every screenshot you cite.
- `git clean -fdx` is forbidden in the main checkout (275 MB of gitignored terrain).

## Review Focus

1. **Textures fail to load** (404, transcoder wasm blocked, offline): the game still boots on the procedural surface, `__ww2.terrainSurface()` reports `{ texturesLoaded: false, detail: false }`, and there's no console error. *Test: Task 5, route-abort e2e case.*
2. **Scenery tier changes mid-flight** (Settings → Render Quality low ↔ high): the terrain swaps between textured and procedural without a WebGPU validation error or a black frame. *Test: Task 5, the tier-toggle e2e case via `__ww2` + validation-error count.*
3. **Land cover hasn't arrived (or never does)** while textures are on: `composeSurface` must still produce the daa1b39 procedural blend, modulated. *Test: Task 1's reference comparison includes `ready = 0` samples. Task 4's composition keeps `cover.ready` in the weights.*
4. **Normal-map handedness wrong** (bumps lit from the side away from the sun): invisible at noon and obvious at a low sun. *Test: Task 4 `normalToSlope` unit cases, and Task 6's `timeOfDay=17` runway capture read against the sun direction.*
5. **Repetition visible from altitude**: a regular grid at `low-land-600`/`high-6000`. *Test: Task 6 captures at those views, on vs off, read by eye. The fade constants are the tuning knob, within the bounds Task 6 states.*

---

## File structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/render/terrain/surface.ts` | modify | split into `surfaceWeightNodes` (unchanged math) + generic `composeSurface`; `terrainSurfaceNode` gains an optional detail argument; export `clampSlopeNode` |
| `src/render/terrain/surfaceTextures.ts` | create | layer list, manifest schema, `loadSurfaceTextures`, `terrainTexturesFromQuery` |
| `src/render/terrain/surfaceDetail.ts` | create | TSL detail nodes (albedo ratio + normal slope per layer), CPU twins `albedoDetailFade`, `normalToSlope` |
| `src/render/terrain/mesh.ts` | modify | ring material takes textures; `setSurfaceDetail(enabled)` |
| `src/render/main.ts` | modify | load during boot, scenery-tier gating, query flag |
| `src/render/diagnostics.ts` | modify | `terrainSurface()` diagnostic |
| `tools/textures/sources.ts` | create | the five pinned sources |
| `tools/textures/ktxTool.ts` | create | fetch + verify KTX-Software 4.4.2 into `tools/textures/cache/` |
| `tools/textures/ktx2.ts` | create | pure KTX2 header/DFD reader (tests + build self-check) |
| `tools/textures/build.ts` | create | download, resize, mean, encode, manifest |
| `content/textures/terrain-albedo.ktx2`, `terrain-normal.ktx2`, `terrain.json` | create (generated, committed) | the assets + manifest |
| `content/vendor/basis/basis_transcoder.{js,wasm}` | create (copied) | transcoder served at a fixed path |
| `tests/render/terrainSurface.test.ts` | modify | composition equivalence + detail CPU twins |
| `tests/tools/textures.test.ts` | create | header, manifest, provenance, vendored transcoder |
| `tests/render/surfaceTextures.test.ts` | create | manifest parse, query flag |
| `tests/e2e/terrainTextures.spec.ts` | create | Tier 2: load, fallback, tier toggle, A/B, budget |
| `package.json` | modify | `"textures:build": "tsx tools/textures/build.ts"` |
| `ASSETS.md` | modify | five texture rows + transcoder row |

---

### Task 1: Separate the surface blend's weights from its composition (no visual change)

**Files:**
- Modify: `src/render/terrain/surface.ts` (the `terrainSurfaceNode` function, currently the last ~95 lines)
- Test: `tests/render/terrainSurface.test.ts`

**Interfaces:**
- Produces:
  - `export type SurfaceWeights<W> = { forest: W; soilPatch: W; crop: W; mangrove: W; beachToLand: W; bare: W; wetBank: W; water: W; road: W }`
  - `export type SurfaceLeaves<T> = { sand: T; grass: T; forest: T; soil: T; paddy: T; mangrove: T; rock: T; wetBank: T; water: T; road: T }`
  - `export function composeSurface<T, W>(leaves: SurfaceLeaves<T>, w: SurfaceWeights<W>, mixOp: (a: T, b: T, t: W) => T): T`
  - `export type SurfaceNoise = { readonly macro: Node<'float'>; readonly patches: Node<'float'> }` and `export function surfaceNoiseNodes(xz: Node<'vec2'>): SurfaceNoise`
  - `export function surfaceWeightNodes(xz: Node<'vec2'>, height: Node<'float'>, slope: Node<'float'>, cover: CoverNodes, noise: SurfaceNoise): SurfaceWeights<Node<'float'>>`
  - `export function terrainColorLeaves(xz: Node<'vec2'>, noise: SurfaceNoise): SurfaceLeaves<Node<'vec3'>>`
  - `export function clampSlopeNode(slope: Node<'vec2'>): Node<'vec2'>` (was module-private)
  - `terrainSurfaceNode(xz, height, slope, cover)`: same signature and same output as today

**Why this task exists:** no headless TSL evaluator exists here (see the comments in `surface.ts`), so "weights unchanged" can't be checked on the GPU. Making the composition generic over the mix operation lets a CPU test run the **same code** on numbers and compare it to a literal transcription of today's nested expression.

- [ ] **Step 1: Write the failing test.** Append to `tests/render/terrainSurface.test.ts`:

```ts
import { composeSurface, type SurfaceLeaves, type SurfaceWeights } from '../../src/render/terrain/surface.js'

describe('composeSurface (visual realism §2.1: weights unchanged)', () => {
  const mixN = (a: number, b: number, t: number): number => a + (b - a) * t
  // Seeded LCG: the same 500 cases every run.
  let s = 1944
  const rnd = (): number => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)

  /** A literal transcription of terrainSurfaceNode's nested mix() chain as of
   *  044dc75, BEFORE the split. If this and composeSurface ever disagree, the
   *  refactor changed the blend. */
  function before(l: SurfaceLeaves<number>, w: SurfaceWeights<number>): number {
    const grassOrForest = mixN(l.grass, l.forest, w.forest)
    const withSoilPatches = mixN(grassOrForest, l.soil, w.soilPatch)
    const land = mixN(mixN(withSoilPatches, l.paddy, w.crop), l.mangrove, w.mangrove)
    const ground = mixN(mixN(l.sand, land, w.beachToLand), l.rock, w.bare)
    const wet = mixN(ground, l.wetBank, w.wetBank)
    const withWater = mixN(wet, l.water, w.water)
    return mixN(withWater, l.road, w.road)
  }
  const leaves = (): SurfaceLeaves<number> => ({
    sand: rnd(), grass: rnd(), forest: rnd(), soil: rnd(), paddy: rnd(),
    mangrove: rnd(), rock: rnd(), wetBank: rnd(), water: rnd(), road: rnd(),
  })
  // `crop` and `mangrove` are `fraction * cover.ready`: include ready = 0,
  // the no-land-cover-yet state (Review Focus 3).
  const weights = (ready: number): SurfaceWeights<number> => ({
    forest: rnd(), soilPatch: rnd() * 0.45, crop: rnd() * ready, mangrove: rnd() * ready,
    beachToLand: rnd(), bare: rnd(), wetBank: rnd() * 0.8, water: rnd(), road: rnd(),
  })

  it('matches the pre-split nested blend exactly, with and without land cover', () => {
    for (let i = 0; i < 500; i++) {
      const l = leaves(), w = weights(i % 2)
      expect(composeSurface(l, w, mixN)).toBe(before(l, w))
    }
  })

  it('is a partition of unity: equal leaves give that value back for any weights', () => {
    // This is what makes a per-layer texel/mean ratio preserve the average color.
    for (let i = 0; i < 200; i++) {
      const v = rnd()
      const l: SurfaceLeaves<number> = { sand: v, grass: v, forest: v, soil: v, paddy: v, mangrove: v, rock: v, wetBank: v, water: v, road: v }
      expect(composeSurface(l, weights(1), mixN)).toBeCloseTo(v, 12)
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail.**
Run: `npx vitest run tests/render/terrainSurface.test.ts --maxWorkers=2; echo rc=$?`
Expected: FAIL, `composeSurface` is not exported. `rc=1`.

- [ ] **Step 3: Implement.** In `surface.ts`, add the types and `composeSurface` above `terrainSurfaceNode`:

```ts
/** Every weight the terrain blend uses, by name. `surfaceWeightNodes` builds
 *  them as TSL; tests build them as numbers. */
export type SurfaceWeights<W> = {
  readonly forest: W; readonly soilPatch: W; readonly crop: W; readonly mangrove: W
  readonly beachToLand: W; readonly bare: W; readonly wetBank: W; readonly water: W; readonly road: W
}
/** What the weights blend between. Colors in `terrainSurfaceNode`; detail
 *  slopes in mesh.ts (visual realism §2.1). */
export type SurfaceLeaves<T> = {
  readonly sand: T; readonly grass: T; readonly forest: T; readonly soil: T; readonly paddy: T
  readonly mangrove: T; readonly rock: T; readonly wetBank: T; readonly water: T; readonly road: T
}

/**
 * The terrain blend's ORDER, and only its order: the chain of mix() calls
 * that used to be written inline in `terrainSurfaceNode` (044dc75), operand
 * for operand. Generic over the mix so a CPU test runs this exact code on
 * numbers against a transcription of the old chain (terrainSurface.test.ts)
 * -- there is no headless TSL evaluator, so that is the only way to prove
 * the split changed nothing. Every weight is a lerp factor in [0, 1], which
 * makes the chain a partition of unity: equal leaves come back unchanged.
 * The texture detail relies on that (surfaceDetail.ts).
 */
export function composeSurface<T, W>(l: SurfaceLeaves<T>, w: SurfaceWeights<W>, mixOp: (a: T, b: T, t: W) => T): T {
  // Soil patches blend in AFTER the grass/forest mix -- see the history in
  // surfaceWeightNodes' `soilPatch` for why the order matters.
  const grassOrForest = mixOp(l.grass, l.forest, w.forest)
  const withSoilPatches = mixOp(grassOrForest, l.soil, w.soilPatch)
  const land = mixOp(mixOp(withSoilPatches, l.paddy, w.crop), l.mangrove, w.mangrove)
  const ground = mixOp(mixOp(l.sand, land, w.beachToLand), l.rock, w.bare)
  const wet = mixOp(ground, l.wetBank, w.wetBank)
  const withWater = mixOp(wet, l.water, w.water)
  // Road last: at the ~145 texels where the highway crosses a river the road
  // wins, which is what a bridge should look like (measured 2026-09-24).
  return mixOp(withWater, l.road, w.road)
}
```

Then split the body of `terrainSurfaceNode`. Move **every weight expression, byte for byte, together with every comment attached to it** (the node-centered UV essay, the forestWeight/mangrove double-count note, the soil-patch ordering note, the road/river crossing note) into `surfaceWeightNodes`. What's left in `terrainSurfaceNode` is the color leaves plus one `composeSurface` call:

```ts
export type SurfaceNoise = { readonly macro: Node<'float'>; readonly patches: Node<'float'> }
/** The two noise reads both the weights and the colors use. Built once per
 *  material: TSL dedupes by node identity, so building them twice would add
 *  two texture lookups per fragment. */
export function surfaceNoiseNodes(xz: Node<'vec2'>): SurfaceNoise {
  return { macro: groundNoise(xz, 2800).r, patches: groundNoise(vec2(xz.y.negate(), xz.x).add(173), 610).g }
}

export function surfaceWeightNodes(xz: Node<'vec2'>, height: Node<'float'>, slope: Node<'float'>, cover: CoverNodes, { macro, patches }: SurfaceNoise): SurfaceWeights<Node<'float'>> {
  // ...the existing UV comment block, verbatim...
  const uv = xz.add(cover.halfExtentM).div(cover.step).add(0.5).div(cover.samples)
  const fractions = texture(cover.texture, uv)
  // ...the existing forestWeight comment, verbatim...
  const proceduralForest = max(smoothstep(0.38, 0.64, macro), smoothstep(70, 220, height))
  const forest = mix(proceduralForest, fractions.r, cover.ready)
  // ...the existing soil-patch ordering comment, verbatim...
  const soilPatch = smoothstep(0.74, 0.9, patches).mul(float(1).sub(forest)).mul(0.45)
  // Tropical summits remain vegetated; steep faces expose rock. No snow line.
  const bare = max(smoothstep(0.48, 1.05, slope), smoothstep(950, 1400, height).mul(0.5))
  const beachToLand = smoothstep(0.4, 2.3, height.add(patches.sub(0.5).mul(0.6)))
  const rivers = riverMask()
  const riverUv = xz.sub(vec2(rivers.minX, rivers.minZ)).div(vec2(rivers.width, rivers.depth))
  const riverRoadMask = texture(rivers.texture, riverUv)
  // ...the existing road comment, verbatim...
  return {
    forest, soilPatch, bare, beachToLand,
    crop: fractions.g.mul(cover.ready),
    mangrove: fractions.b.mul(cover.ready),
    wetBank: smoothstep(0.05, 0.5, riverRoadMask.r).mul(0.8),
    water: smoothstep(0.45, 0.85, riverRoadMask.r),
    road: smoothstep(0.05, 0.5, riverRoadMask.g),
  }
}

export function terrainSurfaceNode(xz: Node<'vec2'>, height: Node<'float'>, slope: Node<'float'>, cover: CoverNodes): Node<'vec3'> {
  const noise = surfaceNoiseNodes(xz)
  return composeSurface(terrainColorLeaves(xz, noise), surfaceWeightNodes(xz, height, slope, cover, noise), (a, b, t) => mix(a, b, t))
}

/** The procedural colors, unchanged from 044dc75. */
export function terrainColorLeaves(xz: Node<'vec2'>, { macro, patches }: SurfaceNoise): SurfaceLeaves<Node<'vec3'>> {
  const canopy = groundNoise(xz, 180).g
  const grain = groundNoise(xz, 18).b
  return {
    sand: mix(color(0x958567), color(0xd6c49b), groundNoise(xz, 95).g).mul(grain.mul(0.16).add(0.92)),
    grass: mix(color(0x626746), color(0x89915b), patches).mul(grain.mul(0.15).add(0.94)),
    forest: mix(color(0x294534), color(0x546847), canopy).mul(macro.mul(0.4).add(0.8)),
    soil: mix(color(0x655644), color(0x8b795b), groundNoise(xz, 150).g),
    // Paddies: a pale yellow-green with the patch noise at field scale, so the
    // Leyte Valley reads as fields from 3,000 m, which is the job (design §1).
    paddy: mix(color(0x8a9a4e), color(0xb8b56a), groundNoise(vec2(xz.y, xz.x.negate()), 240).g),
    mangrove: color(0x24402a),
    rock: mix(color(0x696c62), color(0x9a9585), groundNoise(xz, 220).g).mul(groundNoise(xz, 26).g.mul(0.35).add(0.82)),
    wetBank: color(0x68664b),
    water: mix(color(0x345455), color(0x65796d), groundNoise(xz, 55).g),
    road: vec3(0.42, 0.36, 0.27), // dry earth, matching the design's own description
  }
}
```

**The sample count must not grow in this task**: `surfaceNoiseNodes` exists so `macro`/`patches` are read once.

The old wet-bank expression was `mix(ground, color(0x68664b), smoothstep(0.05, 0.5, mask).mul(0.8))`. That's `wetBank` leaf + `wetBank` weight above, same order. Also rename the private `clampSlopeNode` to an export (no body change).

- [ ] **Step 4: Run the tests.**
Run: `npx vitest run tests/render/terrainSurface.test.ts tests/render/scenery.test.ts --maxWorkers=2; echo rc=$?`
Expected: PASS, `rc=0`. `scenery.test.ts` holds the cover-UV and anisotropy guards, which must still pass untouched.

- [ ] **Step 5: Typecheck and lint the touched files.**
Run: `npx tsc --noEmit; echo rc=$?` then `npx eslint src/render/terrain tests/render/terrainSurface.test.ts --max-warnings 0; echo rc=$?`
Expected: both `rc=0`.

- [ ] **Step 6: Commit.**

```bash
git add src/render/terrain/surface.ts tests/render/terrainSurface.test.ts
git commit -m "Terrain textures Task 1: split the surface blend into named weights and a generic composeSurface, proven identical on the CPU"
```

---

### Task 2: The texture build: pinned sources, pinned encoder, committed KTX2 + manifest

**Files:**
- Create: `tools/textures/sources.ts`, `tools/textures/ktxTool.ts`, `tools/textures/ktx2.ts`, `tools/textures/build.ts`
- Create (generated): `content/textures/terrain-albedo.ktx2`, `content/textures/terrain-normal.ktx2`, `content/textures/terrain.json`
- Create (copied): `content/vendor/basis/basis_transcoder.js`, `content/vendor/basis/basis_transcoder.wasm`
- Modify: `package.json` (script), `ASSETS.md`
- Test: `tests/tools/textures.test.ts`

**Interfaces:**
- Produces:
  - `export const SURFACE_LAYERS = ['sand', 'grass', 'dirt', 'jungle', 'rock'] as const` and `export type SurfaceLayer = (typeof SURFACE_LAYERS)[number]`. Defined in `src/render/terrain/surfaceTextures.ts` (create the file here with just this export and the manifest schema below; Task 3 adds the loader), imported by the tool.
  - `export const surfaceManifestSchema` (zod) and `export type SurfaceManifest = { version: 1; albedo: string; normal: string; layers: { name: SurfaceLayer; source: string; tileM: number; meanLinear: [number, number, number] }[] }`, same file.
  - `readKtx2Header(bytes: Uint8Array): Ktx2Header` with `type Ktx2Header = { vkFormat: number; pixelWidth: number; pixelHeight: number; layerCount: number; faceCount: number; levelCount: number; supercompressionScheme: number; colorModel: number; transferFunction: number }` (`tools/textures/ktx2.ts`)
  - Manifest on disk at `content/textures/terrain.json`, layers in `SURFACE_LAYERS` order

- [ ] **Step 1: Write the failing test** `tests/tools/textures.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readKtx2Header } from '../../tools/textures/ktx2.js'
import { TEXTURE_SOURCES } from '../../tools/textures/sources.js'
import { SURFACE_LAYERS, surfaceManifestSchema } from '../../src/render/terrain/surfaceTextures.js'

const root = new URL('../../', import.meta.url)
const bytes = (p: string): Uint8Array => new Uint8Array(readFileSync(new URL(p, root)))
const manifest = surfaceManifestSchema.parse(JSON.parse(readFileSync(new URL('content/textures/terrain.json', root), 'utf8')))

// KHR Data Format constants (KTX2 spec / khr_df.h).
const MODEL_ETC1S = 163, MODEL_UASTC = 166, TF_LINEAR = 1, TF_SRGB = 2, SS_BASIS_LZ = 1, SS_ZSTD = 2

describe('committed terrain textures (visual realism §2.1)', () => {
  it('albedo: 1024² ETC1S/BasisLZ sRGB array, one layer per surface layer, full mip chain', () => {
    const h = readKtx2Header(bytes(`content/textures/${manifest.albedo}`))
    expect(h).toMatchObject({ vkFormat: 0, pixelWidth: 1024, pixelHeight: 1024, layerCount: SURFACE_LAYERS.length, faceCount: 1, levelCount: 11, supercompressionScheme: SS_BASIS_LZ, colorModel: MODEL_ETC1S, transferFunction: TF_SRGB })
  })
  it('normal: 512² UASTC/zstd LINEAR array (a normal map must not be sRGB-decoded)', () => {
    const h = readKtx2Header(bytes(`content/textures/${manifest.normal}`))
    expect(h).toMatchObject({ vkFormat: 0, pixelWidth: 512, pixelHeight: 512, layerCount: SURFACE_LAYERS.length, faceCount: 1, levelCount: 10, supercompressionScheme: SS_ZSTD, colorModel: MODEL_UASTC, transferFunction: TF_LINEAR })
  })
  it('manifest layers are SURFACE_LAYERS in order, with sane tiles and linear means', () => {
    expect(manifest.layers.map(l => l.name)).toEqual([...SURFACE_LAYERS])
    for (const l of manifest.layers) {
      expect(l.tileM).toBeGreaterThan(0)
      for (const c of l.meanLinear) { expect(c).toBeGreaterThan(0.01); expect(c).toBeLessThan(0.9) }
    }
  })
  it('every source is CC0 and has an ASSETS.md row naming its page', () => {
    const assets = readFileSync(new URL('ASSETS.md', root), 'utf8')
    for (const s of TEXTURE_SOURCES) {
      expect(s.license).toBe('CC0-1.0')
      const row = assets.split('\n').find(line => line.includes(`https://polyhaven.com/a/${s.id}`))
      expect(row, s.id).toBeDefined()
      expect(row).toContain('CC0')
      expect(row).toContain(s.author)
    }
  })
  it('the vendored Basis transcoder is byte-identical to the one three ships (loader and transcoder must match)', () => {
    for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
      expect(Buffer.compare(bytes(`content/vendor/basis/${f}`), bytes(`node_modules/three/examples/jsm/libs/basis/${f}`)), f).toBe(0)
    }
  })
})

describe('readKtx2Header', () => {
  it('rejects a file that is not KTX2', () => {
    expect(() => readKtx2Header(new Uint8Array(80))).toThrow(/not a KTX2 file/)
  })
})
```

- [ ] **Step 2: Run it and watch it fail.**
Run: `npx vitest run tests/tools/textures.test.ts --maxWorkers=2; echo rc=$?`
Expected: FAIL on missing modules. `rc=1`.

- [ ] **Step 3: Write `src/render/terrain/surfaceTextures.ts` (layers + schema only for now):**

```ts
import { z } from 'zod'

/** The five terrain materials (visual realism §2.1), in the order of the
 *  KTX2 array layers. The build writes them in this order and the shader
 *  indexes them by position, so this list is the single source of truth. */
export const SURFACE_LAYERS = ['sand', 'grass', 'dirt', 'jungle', 'rock'] as const
export type SurfaceLayer = (typeof SURFACE_LAYERS)[number]

export const surfaceManifestSchema = z.object({
  version: z.literal(1),
  albedo: z.string().endsWith('.ktx2'),
  normal: z.string().endsWith('.ktx2'),
  layers: z.array(z.object({
    name: z.enum(SURFACE_LAYERS),
    source: z.string(),
    /** Real-world metres one texture repeat covers (the source's own scan size). */
    tileM: z.number().positive(),
    /** Mean of the 1024² albedo, linear RGB: the divisor that makes a texel a
     *  ratio around 1 (plan Ruling 1). */
    meanLinear: z.tuple([z.number(), z.number(), z.number()]),
  })).length(SURFACE_LAYERS.length),
}).refine(m => m.layers.every((l, i) => l.name === SURFACE_LAYERS[i]), 'layers must be in SURFACE_LAYERS order')
export type SurfaceManifest = z.infer<typeof surfaceManifestSchema>
```

- [ ] **Step 4: Write `tools/textures/ktx2.ts`:**

```ts
/** The fields of a KTX2 header and its basic data format descriptor that the
 *  terrain textures' tests and build self-check assert on. KTX2 spec §3. */
export type Ktx2Header = {
  readonly vkFormat: number; readonly pixelWidth: number; readonly pixelHeight: number
  readonly layerCount: number; readonly faceCount: number; readonly levelCount: number
  readonly supercompressionScheme: number
  /** DFD colorModel: 163 ETC1S, 166 UASTC. */
  readonly colorModel: number
  /** DFD transferFunction: 1 linear, 2 sRGB. */
  readonly transferFunction: number
}

const IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]

export function readKtx2Header(b: Uint8Array): Ktx2Header {
  if (b.length < 80 || IDENTIFIER.some((v, i) => b[i] !== v)) throw new Error('not a KTX2 file')
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const u32 = (o: number): number => v.getUint32(o, true)
  const dfd = u32(48) // dataFormatDescriptor.byteOffset
  // DFD: uint32 dfdTotalSize, then the basic block: word0 vendor/type, word1
  // version/size, word2 = colorModel | primaries << 8 | transfer << 16 | flags << 24.
  return {
    vkFormat: u32(12), pixelWidth: u32(20), pixelHeight: u32(24),
    layerCount: u32(32), faceCount: u32(36), levelCount: u32(40), supercompressionScheme: u32(44),
    colorModel: b[dfd + 12]!, transferFunction: b[dfd + 14]!,
  }
}
```

- [ ] **Step 5: Write `tools/textures/sources.ts`** with the five rows from the table at the top of this plan:

```ts
import type { SurfaceLayer } from '../../src/render/terrain/surfaceTextures.js'

export type TextureSource = {
  readonly layer: SurfaceLayer
  readonly id: string
  readonly author: string
  readonly license: 'CC0-1.0'
  readonly tileM: number
  readonly diffuse: { readonly url: string; readonly md5: string }
  readonly normal: { readonly url: string; readonly md5: string }
}

const PH = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k'

/** Poly Haven, 2k JPG, MD5s from api.polyhaven.com/files/<id> (2026-09-25).
 *  `tileM` is Poly Haven's own real-world scan size for the asset. In
 *  SURFACE_LAYERS order. */
export const TEXTURE_SOURCES: readonly TextureSource[] = [
  { layer: 'sand', id: 'aerial_beach_01', author: 'Rob Tuytel', license: 'CC0-1.0', tileM: 30,
    diffuse: { url: `${PH}/aerial_beach_01/aerial_beach_01_diff_2k.jpg`, md5: 'b06496ad69bc0587e03e9cbcf9a80d76' },
    normal: { url: `${PH}/aerial_beach_01/aerial_beach_01_nor_gl_2k.jpg`, md5: 'fdf59672f1e41cd406c2107f6cea538d' } },
  { layer: 'grass', id: 'leafy_grass', author: 'Charlotte Baglioni', license: 'CC0-1.0', tileM: 2,
    diffuse: { url: `${PH}/leafy_grass/leafy_grass_diff_2k.jpg`, md5: '8014f4dace676a62ed71b3dd76119dae' },
    normal: { url: `${PH}/leafy_grass/leafy_grass_nor_gl_2k.jpg`, md5: 'ea5e91abe01dc5e5d7028c68c3bc9194' } },
  { layer: 'dirt', id: 'dirt_aerial_02', author: 'Rob Tuytel', license: 'CC0-1.0', tileM: 20,
    diffuse: { url: `${PH}/dirt_aerial_02/dirt_aerial_02_diff_2k.jpg`, md5: '100d18e171bc3c4929a54bd1efe10755' },
    normal: { url: `${PH}/dirt_aerial_02/dirt_aerial_02_nor_gl_2k.jpg`, md5: 'bc6e87fda54e73ff8b9f15c56f4632b3' } },
  // Note `_diffuse_`, not `_diff_`: this asset's file name differs.
  { layer: 'jungle', id: 'forest_leaves_02', author: 'Rob Tuytel', license: 'CC0-1.0', tileM: 3,
    diffuse: { url: `${PH}/forest_leaves_02/forest_leaves_02_diffuse_2k.jpg`, md5: 'b7837ba1c51fb0e11af36d6b4e225c20' },
    normal: { url: `${PH}/forest_leaves_02/forest_leaves_02_nor_gl_2k.jpg`, md5: 'f974000a2ddc7dcd22bc84c37aa5d7ce' } },
  { layer: 'rock', id: 'aerial_rocks_02', author: 'Rob Tuytel', license: 'CC0-1.0', tileM: 50,
    diffuse: { url: `${PH}/aerial_rocks_02/aerial_rocks_02_diff_2k.jpg`, md5: 'f493fa9b31911f8a30ecd1d41cbc6f3d' },
    normal: { url: `${PH}/aerial_rocks_02/aerial_rocks_02_nor_gl_2k.jpg`, md5: '7c405cfd3308a2672c99b44e102c328e' } },
]
```

- [ ] **Step 6: Write `tools/textures/ktxTool.ts`:**

```ts
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const TEXTURE_CACHE = fileURLToPath(new URL('./cache/', import.meta.url)) // gitignored: /tools/**/cache/
const VERSION = '4.4.2'
const TARBALL = `KTX-Software-${VERSION}-Linux-x86_64.tar.bz2`
const URL_ = `https://github.com/KhronosGroup/KTX-Software/releases/download/v${VERSION}/${TARBALL}`
/** The release's own .sha1, checked 2026-09-25. */
const SHA1 = 'c6b08c817f8c8dd299deccae4f2fbb8d55e9acd2'

/** Path to a verified `ktx` 4.4.2 binary, downloading it once into the cache.
 *  Linux x86_64 only: the build is run on nexus. */
export async function ktxBinary(): Promise<string> {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error(`textures:build needs Linux x86_64 (KTX-Software ${VERSION} tarball); this is ${process.platform}/${process.arch}`)
  mkdirSync(TEXTURE_CACHE, { recursive: true })
  const bin = join(TEXTURE_CACHE, `KTX-Software-${VERSION}-Linux-x86_64`, 'bin', 'ktx')
  if (existsSync(bin)) return bin
  const tar = join(TEXTURE_CACHE, TARBALL)
  if (!existsSync(tar)) {
    const res = await fetch(URL_)
    if (!res.ok) throw new Error(`${URL_}: HTTP ${res.status}`)
    writeFileSync(tar, new Uint8Array(await res.arrayBuffer()))
  }
  const got = createHash('sha1').update(readFileSync(tar)).digest('hex')
  if (got !== SHA1) throw new Error(`${TARBALL}: sha1 ${got}, expected ${SHA1}`)
  execFileSync('tar', ['xjf', tar, '-C', TEXTURE_CACHE])
  const version = execFileSync(bin, ['--version'], { encoding: 'utf8' })
  if (!version.includes(`v${VERSION}`)) throw new Error(`ktx reports ${version.trim()}, expected v${VERSION}`)
  return bin
}
```

- [ ] **Step 7: Write `tools/textures/build.ts`:**

```ts
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { SURFACE_LAYERS, surfaceManifestSchema, type SurfaceManifest } from '../../src/render/terrain/surfaceTextures.js'
import { readKtx2Header } from './ktx2.js'
import { ktxBinary, TEXTURE_CACHE } from './ktxTool.js'
import { TEXTURE_SOURCES } from './sources.js'

const OUT = fileURLToPath(new URL('../../content/textures/', import.meta.url))
const VENDOR = fileURLToPath(new URL('../../content/vendor/basis/', import.meta.url))
const THREE_BASIS = fileURLToPath(new URL('../../node_modules/three/examples/jsm/libs/basis/', import.meta.url))
const ALBEDO_SIZE = 1024
const NORMAL_SIZE = 512

async function fetchPinned(url: string, md5: string): Promise<string> {
  const file = join(TEXTURE_CACHE, url.split('/').pop()!)
  if (!existsSync(file)) {
    const res = await fetch(url, { headers: { 'User-Agent': 'ww2airsim-textures-build' } })
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
    writeFileSync(file, new Uint8Array(await res.arrayBuffer()))
  }
  const got = createHash('md5').update(readFileSync(file)).digest('hex')
  if (got !== md5) throw new Error(`${file}: md5 ${got}, expected ${md5}`)
  return file
}

const toLinear = (c: number): number => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }

async function main(): Promise<void> {
  if (TEXTURE_SOURCES.map(s => s.layer).join() !== SURFACE_LAYERS.join()) throw new Error('TEXTURE_SOURCES is not in SURFACE_LAYERS order')
  mkdirSync(TEXTURE_CACHE, { recursive: true }); mkdirSync(OUT, { recursive: true }); mkdirSync(VENDOR, { recursive: true })
  const ktx = await ktxBinary()
  const albedoPngs: string[] = [], normalPngs: string[] = []
  const layers: SurfaceManifest['layers'] = []
  for (const s of TEXTURE_SOURCES) {
    const diff = await fetchPinned(s.diffuse.url, s.diffuse.md5)
    const nor = await fetchPinned(s.normal.url, s.normal.md5)
    const a = join(TEXTURE_CACHE, `${s.id}_albedo${ALBEDO_SIZE}.png`)
    const n = join(TEXTURE_CACHE, `${s.id}_normal${NORMAL_SIZE}.png`)
    await sharp(diff).resize(ALBEDO_SIZE, ALBEDO_SIZE).removeAlpha().ensureAlpha(1).png().toFile(a)
    await sharp(nor).resize(NORMAL_SIZE, NORMAL_SIZE).removeAlpha().ensureAlpha(1).png().toFile(n)
    const { data, info } = await sharp(a).raw().toBuffer({ resolveWithObject: true })
    const sum = [0, 0, 0]
    for (let i = 0; i < data.length; i += info.channels) for (let c = 0; c < 3; c++) sum[c]! += toLinear(data[i + c]!)
    const px = data.length / info.channels
    const round = (x: number): number => Math.round(x * 1e5) / 1e5
    layers.push({ name: s.layer, source: s.id, tileM: s.tileM, meanLinear: [round(sum[0]! / px), round(sum[1]! / px), round(sum[2]! / px)] })
    albedoPngs.push(a); normalPngs.push(n)
  }
  const albedo = join(OUT, 'terrain-albedo.ktx2'), normal = join(OUT, 'terrain-normal.ktx2')
  // Encoder settings measured 2026-09-25: 1,155,101 B / 1,614,032 B.
  execFileSync(ktx, ['create', '--format', 'R8G8B8A8_SRGB', '--assign-tf', 'srgb', '--encode', 'basis-lz', '--clevel', '2', '--qlevel', '192',
    '--generate-mipmap', '--layers', String(albedoPngs.length), ...albedoPngs, albedo], { stdio: 'inherit' })
  execFileSync(ktx, ['create', '--format', 'R8G8B8A8_UNORM', '--assign-tf', 'linear', '--encode', 'uastc', '--uastc-quality', '2', '--zstd', '18',
    '--generate-mipmap', '--layers', String(normalPngs.length), ...normalPngs, normal], { stdio: 'inherit' })
  for (const f of [albedo, normal]) {
    const h = readKtx2Header(new Uint8Array(readFileSync(f)))
    if (h.layerCount !== SURFACE_LAYERS.length) throw new Error(`${f}: ${h.layerCount} layers`)
  }
  const manifest = surfaceManifestSchema.parse({ version: 1, albedo: 'terrain-albedo.ktx2', normal: 'terrain-normal.ktx2', layers })
  writeFileSync(join(OUT, 'terrain.json'), JSON.stringify(manifest, null, 2) + '\n')
  for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) copyFileSync(join(THREE_BASIS, f), join(VENDOR, f))
  for (const f of [albedo, normal]) console.log(`${f}: ${readFileSync(f).length} bytes`)
}

await main()
```

Add to `package.json` scripts, after `"sky:build"`: `"textures:build": "tsx tools/textures/build.ts",`.

- [ ] **Step 8: Run the build.**
Run: `npm run textures:build; echo rc=$?`
Expected: `rc=0`. Two size lines within ±5% of 1,155,101 and 1,614,032 bytes (the encoder is the pinned version, so they should match). `content/textures/terrain.json` should have five layers whose `meanLinear` values are consistent with the sRGB means in the table above (e.g. sand ≈ [0.28, 0.23, 0.19]).

- [ ] **Step 9: Add the `ASSETS.md` rows.** In `## Textures and audio`, replace the sentence "The one bitmap asset is the title art below." with "Bitmap assets are the title art and the terrain textures below." Then add these rows to that section's table:

```markdown
| `content/textures/terrain-albedo.ktx2` + `terrain-normal.ktx2` layer 0 (sand), built by `tools/textures/build.ts` | https://polyhaven.com/a/aerial_beach_01 | Rob Tuytel | CC0 |
| layer 1 (grass) | https://polyhaven.com/a/leafy_grass | Charlotte Baglioni | CC0 |
| layer 2 (dirt) | https://polyhaven.com/a/dirt_aerial_02 | Rob Tuytel | CC0 |
| layer 3 (jungle floor) | https://polyhaven.com/a/forest_leaves_02 | Rob Tuytel | CC0 |
| layer 4 (rock) | https://polyhaven.com/a/aerial_rocks_02 | Rob Tuytel | CC0 |
| `content/vendor/basis/basis_transcoder.{js,wasm}` (copied from three r186 `examples/jsm/libs/basis/`) | https://github.com/BinomialLLC/basis_universal | Binomial LLC | Apache-2.0 |
```

- [ ] **Step 10: Run the tests.**
Run: `npx vitest run tests/tools/textures.test.ts --maxWorkers=2; echo rc=$?`
Expected: PASS, `rc=0`. If `levelCount` differs (the only encoder-dependent structural field), read `ktx info` on the file and fix the **test** only if the file is right: 1024² has 11 levels and 512² has 10.

- [ ] **Step 11: Commit (assets and their provenance together).**

```bash
git add tools/textures src/render/terrain/surfaceTextures.ts tests/tools/textures.test.ts content/textures content/vendor/basis package.json ASSETS.md
git commit -m "Terrain textures Task 2: textures:build, five CC0 Poly Haven materials as KTX2 arrays, vendored Basis transcoder"
```

---

### Task 3: Runtime loader and the DEV query flag

**Files:**
- Modify: `src/render/terrain/surfaceTextures.ts`
- Test: `tests/render/surfaceTextures.test.ts`

**Interfaces:**
- Consumes: `SURFACE_LAYERS`, `surfaceManifestSchema`, `SurfaceManifest` (Task 2)
- Produces:
  - `export type SurfaceTextures = { readonly manifest: SurfaceManifest; readonly albedo: Texture; readonly normal: Texture }`
  - `export async function loadSurfaceTextures(renderer: WebGPURenderer): Promise<SurfaceTextures>`, which rejects on any failure
  - `export const SURFACE_MANIFEST_URL: string`, `export const BASIS_TRANSCODER_DIR: string`
  - `export function terrainTexturesFromQuery(search: string): 'on' | 'off' | undefined`, which throws on any other value (the `cloudTierFromQuery` convention)

- [ ] **Step 1: Write the failing test** `tests/render/surfaceTextures.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BASIS_TRANSCODER_DIR, surfaceManifestSchema, terrainTexturesFromQuery } from '../../src/render/terrain/surfaceTextures.js'

describe('terrainTexturesFromQuery', () => {
  it('reads on/off, is undefined when absent, and throws on a typo', () => {
    expect(terrainTexturesFromQuery('')).toBeUndefined()
    expect(terrainTexturesFromQuery('?terrainTextures=off')).toBe('off')
    expect(terrainTexturesFromQuery('?terrainTextures=on')).toBe('on')
    expect(() => terrainTexturesFromQuery('?terrainTextures=of')).toThrow(/terrainTextures/)
  })
})

describe('surfaceManifestSchema', () => {
  const layer = (name: string) => ({ name, source: 'x', tileM: 10, meanLinear: [0.2, 0.2, 0.2] })
  const ok = { version: 1, albedo: 'a.ktx2', normal: 'n.ktx2', layers: ['sand', 'grass', 'dirt', 'jungle', 'rock'].map(layer) }
  it('accepts layers in SURFACE_LAYERS order and rejects any other order', () => {
    expect(surfaceManifestSchema.safeParse(ok).success).toBe(true)
    const swapped = { ...ok, layers: ['grass', 'sand', 'dirt', 'jungle', 'rock'].map(layer) }
    expect(surfaceManifestSchema.safeParse(swapped).success).toBe(false)
  })
})

describe('BASIS_TRANSCODER_DIR', () => {
  it('ends in a slash, because KTX2Loader appends file names to it', () => {
    expect(BASIS_TRANSCODER_DIR.endsWith('/content/vendor/basis/')).toBe(true)
  })
})
```

- [ ] **Step 2: Run it and watch it fail.**
Run: `npx vitest run tests/render/surfaceTextures.test.ts --maxWorkers=2; echo rc=$?`
Expected: FAIL, missing exports.

- [ ] **Step 3: Implement.** Append to `surfaceTextures.ts`:

```ts
import { RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'

export const SURFACE_MANIFEST_URL = `${import.meta.env.BASE_URL}content/textures/terrain.json`
/** Vendored copy of three's transcoder (plan Ruling 5); tests/tools/textures.test.ts
 *  keeps it byte-identical to node_modules/three. */
export const BASIS_TRANSCODER_DIR = `${import.meta.env.BASE_URL}content/vendor/basis/`

export type SurfaceTextures = { readonly manifest: SurfaceManifest; readonly albedo: Texture; readonly normal: Texture }

const PARAM = 'terrainTextures'
/** DEV A/B switch. A typo fails loudly, as `cloudTierFromQuery` does. */
export function terrainTexturesFromQuery(search: string): 'on' | 'off' | undefined {
  const raw = new URLSearchParams(search).get(PARAM)
  if (raw === null) return undefined
  if (raw === 'on' || raw === 'off') return raw
  throw new Error(`${PARAM}: ${JSON.stringify(raw)} is not on or off`)
}

/** Both KTX2 arrays, transcoded for this device (BC on the reference desktop;
 *  three requests every supported feature). Rejects on any failure; the
 *  caller falls back to the procedural surface (plan Ruling 4). */
export async function loadSurfaceTextures(renderer: WebGPURenderer): Promise<SurfaceTextures> {
  const res = await fetch(SURFACE_MANIFEST_URL)
  if (!res.ok) throw new Error(`${SURFACE_MANIFEST_URL}: HTTP ${res.status}`)
  const manifest = surfaceManifestSchema.parse(await res.json())
  const dir = `${import.meta.env.BASE_URL}content/textures/`
  const loader = new KTX2Loader().setTranscoderPath(BASIS_TRANSCODER_DIR).detectSupport(renderer)
  try {
    const [albedo, normal] = await Promise.all([loader.loadAsync(dir + manifest.albedo), loader.loadAsync(dir + manifest.normal)])
    for (const [name, t] of [['albedo', albedo], ['normal', normal]] as const) {
      const depth = (t.image as { depth?: number }).depth
      if (depth !== SURFACE_LAYERS.length) throw new Error(`terrain ${name}: ${depth} layers, expected ${SURFACE_LAYERS.length}`)
      t.wrapS = t.wrapT = RepeatWrapping
      // anisotropy stays 1 -- see createDetailTexture in surface.ts for the cost.
      t.name = `terrain-${name}`
      t.needsUpdate = true
    }
    // The albedo's DFD says sRGB (tests/tools/textures.test.ts), so the loader
    // must have tagged it; if not, the hardware would not linearize it and
    // every ratio would be wrong.
    if (albedo.colorSpace !== SRGBColorSpace) throw new Error(`terrain albedo colorSpace ${albedo.colorSpace}, expected sRGB`)
    return { manifest, albedo, normal }
  } finally {
    loader.dispose()
  }
}
```

If `tsc` complains that `three/addons/loaders/KTX2Loader.js` has no types, check `node_modules/@types/three/examples/jsm/loaders/KTX2Loader.d.ts`. If it exists, the `three/addons/*` path mapping already works (`pipeline.ts` imports `three/addons/tsl/display/BloomNode.js` the same way). The `detectSupport` parameter type in `@types/three` 0.186 accepts `WebGPURenderer`. If it doesn't, cast at the call site with a one-line comment citing `KTX2Loader.js:232`.

- [ ] **Step 4: Run the tests, typecheck, lint, depcruise.**
Run: `npx vitest run tests/render/surfaceTextures.test.ts tests/tools/textures.test.ts --maxWorkers=2; echo rc=$?`, then `npx tsc --noEmit; echo rc=$?`, then `npm run depcruise; echo rc=$?`
Expected: all `rc=0`.

- [ ] **Step 5: Commit.**

```bash
git add src/render/terrain/surfaceTextures.ts tests/render/surfaceTextures.test.ts
git commit -m "Terrain textures Task 3: KTX2 loader for the surface arrays and the ?terrainTextures DEV flag"
```

---

### Task 4: Detail nodes and the ring material

**Files:**
- Create: `src/render/terrain/surfaceDetail.ts`
- Modify: `src/render/terrain/surface.ts` (`terrainSurfaceNode` gains an optional `detail`), `src/render/terrain/mesh.ts` (`createRingMaterial`, `createTerrainMesh`, `TerrainMesh`)
- Test: `tests/render/terrainSurface.test.ts`

**Interfaces:**
- Consumes: `composeSurface`, `surfaceWeightNodes(xz, height, slope, cover, noise)`, `terrainColorLeaves(xz, noise)`, `surfaceNoiseNodes`, `clampSlopeNode`, `detailSlopeNode`, `detailNormalFadeNode`, `groundNoise` (Task 1 / existing); `SurfaceTextures`, `SURFACE_LAYERS`, `SurfaceLayer` (Tasks 2–3)
- Produces:
  - `export type SurfaceDetailNodes = { ratio(layer: SurfaceLayer): Node<'vec3'>; slope(layer: SurfaceLayer): Node<'vec2'> }`
  - `export function surfaceDetailNodes(t: SurfaceTextures, xz: Node<'vec2'>, eyeDistanceM: Node<'float'>): SurfaceDetailNodes`
  - `export const ALBEDO_DETAIL_NEAR_M = 1500`, `ALBEDO_DETAIL_FAR_M = 6000`, `MACRO_TILE_FACTOR = 7.3`, `DETAIL_RATIO_MAX = 3`
  - CPU twins: `export function albedoDetailFade(distanceM: number): number` and `export function normalToSlope(rgb: readonly [number, number, number]): [number, number]` (input is the 0–1 texel)
  - `terrainSurfaceNode(xz, height, slope, cover)` unchanged (wrapper over `terrainSurface`)
  - `export function terrainSurface(xz, height, slope, cover, detail?: SurfaceDetailNodes): TerrainSurface` with `type TerrainSurface = { albedo: Node<'vec3'>; detailSlope: Node<'vec2'> | null }` (surface.ts). Weights are built once and feed both.
  - `createTerrainMesh(header, finestFetchedLevel, shadow?, textures?: SurfaceTextures | null)`
  - `TerrainMesh.setSurfaceDetail(enabled: boolean): void` and `TerrainMesh.surfaceDetail: boolean` (getter: true only when textures exist **and** detail is enabled)

- [ ] **Step 1: Write the failing CPU-twin tests.** Append to `tests/render/terrainSurface.test.ts`:

```ts
import { albedoDetailFade, normalToSlope, ALBEDO_DETAIL_NEAR_M, ALBEDO_DETAIL_FAR_M } from '../../src/render/terrain/surfaceDetail.js'

describe('albedoDetailFade', () => {
  it('is 1 near, 0 far, monotone between, finite for junk', () => {
    expect(albedoDetailFade(0)).toBe(1)
    expect(albedoDetailFade(ALBEDO_DETAIL_NEAR_M)).toBe(1)
    expect(albedoDetailFade(ALBEDO_DETAIL_FAR_M)).toBe(0)
    expect(albedoDetailFade(1e7)).toBe(0)
    expect(albedoDetailFade(Number.NaN)).toBe(1)
    let prev = 1
    for (let d = ALBEDO_DETAIL_NEAR_M; d <= ALBEDO_DETAIL_FAR_M; d += 100) { const f = albedoDetailFade(d); expect(f).toBeLessThanOrEqual(prev); prev = f }
  })
})

describe('normalToSlope (plan Ruling 6: OpenGL normal maps, uv = worldXZ / tileM)', () => {
  // A flat texel is (0.5, 0.5, 1).
  it('flat texel -> zero slope', () => {
    const [sx, sz] = normalToSlope([0.5, 0.5, 1])
    expect(sx).toBeCloseTo(0, 6); expect(sz).toBeCloseTo(0, 6)
  })
  it('a normal leaning toward +x means the ground falls toward +x (dh/dx < 0)', () => {
    expect(normalToSlope([0.75, 0.5, 0.95])[0]).toBeLessThan(0)
  })
  it('a normal leaning image-up (+G, which is -z) means the ground rises toward +z (dh/dz > 0)', () => {
    expect(normalToSlope([0.5, 0.75, 0.95])[1]).toBeGreaterThan(0)
  })
  it('a grazing texel stays finite (nz floored)', () => {
    const [sx, sz] = normalToSlope([1, 0.5, 0.5])
    expect(Number.isFinite(sx) && Number.isFinite(sz)).toBe(true)
  })
})
```

- [ ] **Step 2: Run it and watch it fail.**
Run: `npx vitest run tests/render/terrainSurface.test.ts --maxWorkers=2; echo rc=$?`
Expected: FAIL, missing module.

- [ ] **Step 3: Write `src/render/terrain/surfaceDetail.ts`:**

```ts
import { float, int, max, min, mix, smoothstep, texture, vec2, vec3 } from 'three/tsl'
import type { Node } from 'three/webgpu'
import { detailNormalFadeNode, groundNoise } from './surface.js'
import { SURFACE_LAYERS, type SurfaceLayer, type SurfaceTextures } from './surfaceTextures.js'

/**
 * Real-texture detail for the terrain (visual realism §2.1; plan Rulings 1, 2, 6).
 *
 * `ratio` is texel / layer mean, so multiplying a procedural color by it
 * keeps that color on average (composeSurface is a partition of unity) and
 * adds the photographed structure. It fades to exactly 1 with eye distance,
 * and beyond ALBEDO_DETAIL_FAR_M the terrain is the pre-texture terrain.
 *
 * Anti-tiling: each layer is read at its real scan size and again at
 * MACRO_TILE_FACTOR times that, rotated a quarter turn and offset, blended by
 * the 2800 m macro noise. 7.3 is deliberately not an integer, so the two
 * repeats never realign.
 */
export const ALBEDO_DETAIL_NEAR_M = 1500
export const ALBEDO_DETAIL_FAR_M = 6000
export const MACRO_TILE_FACTOR = 7.3
export const DETAIL_RATIO_MAX = 3
/** Floor on the tangent-space z before dividing: a grazing texel would
 *  otherwise give an unbounded slope. The result is clamped to 12 deg later anyway. */
const MIN_NZ = 0.2

export type SurfaceDetailNodes = {
  ratio(layer: SurfaceLayer): Node<'vec3'>
  slope(layer: SurfaceLayer): Node<'vec2'>
}

export function albedoDetailFade(distanceM: number): number {
  if (!(distanceM > ALBEDO_DETAIL_NEAR_M)) return 1
  const t = Math.min(1, (distanceM - ALBEDO_DETAIL_NEAR_M) / (ALBEDO_DETAIL_FAR_M - ALBEDO_DETAIL_NEAR_M))
  return 1 - t * t * (3 - 2 * t)
}

/** CPU twin of the slope node: tangent (nx, ny, nz) is world (nx, nz, -ny)
 *  for an OpenGL normal map with uv = worldXZ / tileM, so dh/dx = -nx/nz and
 *  dh/dz = ny/nz. */
export function normalToSlope([r, g, b]: readonly [number, number, number]): [number, number] {
  const nx = r * 2 - 1, ny = g * 2 - 1, nz = Math.max(b * 2 - 1, MIN_NZ)
  return [-nx / nz, ny / nz]
}

export function surfaceDetailNodes(t: SurfaceTextures, xz: Node<'vec2'>, eyeDistanceM: Node<'float'>): SurfaceDetailNodes {
  const albedoFade = float(1).sub(smoothstep(ALBEDO_DETAIL_NEAR_M, ALBEDO_DETAIL_FAR_M, eyeDistanceM))
  const macroBlend = smoothstep(0.3, 0.7, groundNoise(xz, 2800).r)
  const rotated = vec2(xz.y.negate(), xz.x).add(97)
  const index = (layer: SurfaceLayer): number => SURFACE_LAYERS.indexOf(layer)
  const ratios = new Map<SurfaceLayer, Node<'vec3'>>()
  const slopes = new Map<SurfaceLayer, Node<'vec2'>>()
  return {
    ratio(layer) {
      let n = ratios.get(layer)
      if (!n) {
        const i = index(layer)
        const { tileM, meanLinear } = t.manifest.layers[i]!
        const near = texture(t.albedo, xz.div(tileM)).depth(int(i)).rgb
        const far = texture(t.albedo, rotated.div(tileM * MACRO_TILE_FACTOR)).depth(int(i)).rgb
        const r = min(mix(near, far, macroBlend).div(vec3(...meanLinear)), vec3(DETAIL_RATIO_MAX))
        n = mix(vec3(1), r, albedoFade)
        ratios.set(layer, n)
      }
      return n
    },
    slope(layer) {
      let n = slopes.get(layer)
      if (!n) {
        const i = index(layer)
        const nrm = texture(t.normal, xz.div(t.manifest.layers[i]!.tileM)).depth(int(i)).xyz.mul(2).sub(1)
        n = vec2(nrm.x.negate(), nrm.y).div(max(nrm.z, MIN_NZ))
        slopes.set(layer, n)
      }
      return n
    },
  }
}
```

The memo maps matter: `grass` feeds both the grass and paddy leaves, `jungle` both forest and mangrove, `dirt` both soil and road. Without the memo, each is sampled twice. Total: 10 albedo + 5 normal array samples + 1 noise sample.

- [ ] **Step 4: Thread detail through `surface.ts`.** Add `terrainSurface`, which builds the noise and the weights **once** and returns both the albedo and (when there's detail) the texture slope blended by those same weights. Keep `terrainSurfaceNode` as a thin wrapper so existing callers and tests don't change:

```ts
import type { SurfaceDetailNodes } from './surfaceDetail.js' // type-only: no runtime cycle

export type TerrainSurface = { readonly albedo: Node<'vec3'>; readonly detailSlope: Node<'vec2'> | null }

export function terrainSurface(xz: Node<'vec2'>, height: Node<'float'>, slope: Node<'float'>, cover: CoverNodes, detail?: SurfaceDetailNodes): TerrainSurface {
  const noise = surfaceNoiseNodes(xz)
  const w = surfaceWeightNodes(xz, height, slope, cover, noise)
  const c = terrainColorLeaves(xz, noise)
  const mixNode = <T extends Node<'vec2'> | Node<'vec3'>>(a: T, b: T, t: Node<'float'>): T => mix(a, b, t) as T
  if (!detail) return { albedo: composeSurface(c, w, mixNode), detailSlope: null }
  // Plan Ruling 1: the texture modulates, it does not replace. Leaves that
  // share a material share its texture (paddy is grass, mangrove is jungle,
  // the road is dirt); the river's wet bank and water stay procedural.
  const albedo = composeSurface({
    ...c,
    sand: c.sand.mul(detail.ratio('sand')), grass: c.grass.mul(detail.ratio('grass')),
    forest: c.forest.mul(detail.ratio('jungle')), soil: c.soil.mul(detail.ratio('dirt')),
    paddy: c.paddy.mul(detail.ratio('grass')), mangrove: c.mangrove.mul(detail.ratio('jungle')),
    rock: c.rock.mul(detail.ratio('rock')), road: c.road.mul(detail.ratio('dirt')),
  }, w, mixNode)
  // The texture normals, blended by the SAME weights as the albedo.
  const zero = vec2(0, 0)
  const detailSlope = composeSurface<Node<'vec2'>, Node<'float'>>({
    sand: detail.slope('sand'), grass: detail.slope('grass'), forest: detail.slope('jungle'), soil: detail.slope('dirt'),
    paddy: detail.slope('grass'), mangrove: detail.slope('jungle'), rock: detail.slope('rock'),
    wetBank: zero, water: zero, road: detail.slope('dirt'),
  }, w, mixNode)
  return { albedo, detailSlope }
}

export function terrainSurfaceNode(xz: Node<'vec2'>, height: Node<'float'>, slope: Node<'float'>, cover: CoverNodes): Node<'vec3'> {
  return terrainSurface(xz, height, slope, cover).albedo
}
```

(If TSL's `mix` typing rejects the generic `mixNode`, use two concrete lambdas, one for `vec3` and one for `vec2`. The runtime behavior is identical.) 
- [ ] **Step 5: Wire `mesh.ts`.** In `createRingMaterial`, add a `textures: SurfaceTextures | null` parameter. Build the two color graphs lazily and swap them:

```ts
  // Visual realism §2.1: two color graphs, the procedural one and the
  // textured one, built on demand and swapped by `setDetail` -- a real swap
  // (the procedural graph has no texture nodes at all), so scenery `low`
  // pays nothing for the textures (plan Ruling 3). A swap recompiles the
  // pipeline once; it happens only from the Settings dialog.
  const colorFor = (detail: SurfaceDetailNodes | null): Node<'vec3'> => { /* the existing body from `const albedo = ...` down to the `Fn(() => { Discard(...); return painted })()` */ }
```

Inside `colorFor`:
- `const surf = terrainSurface(varying(worldXZ), varying(heightM), varying(slope), cover, detail ?? undefined)`, and `albedo` is `surf.albedo`.
- The shading slope becomes:

```ts
  const procedural = detailSlopeNode(varying(worldXZ))
  const summed = surf.detailSlope ? procedural.add(surf.detailSlope) : procedural
  const detailSlope = clampSlopeNode(summed).mul(detailNormalFadeNode(varying(eyeDistanceM)))
```

`detailSlopeNode` already clamps its own sum, so clamping again after adding the texture slope keeps the combined tilt ≤ 12°. The procedural-only path is then `clamp(clamp(x)) = clamp(x)`, unchanged. The detail nodes use `surfaceDetailNodes(textures, varying(worldXZ), varying(eyeDistanceM))`.

Return a handle:

```ts
  let procedural: Node<'vec3'> | null = null, textured: Node<'vec3'> | null = null
  const setDetail = (on: boolean): void => {
    const next = on && textures ? (textured ??= colorFor(surfaceDetailNodes(textures, varying(worldXZ), varying(eyeDistanceM)))) : (procedural ??= colorFor(null))
    if (material.colorNode !== next) { material.colorNode = next; material.needsUpdate = true }
  }
  setDetail(textures !== null)
  return { material, setDetail }
```

Update the ring-material caller(s) accordingly. `createTerrainMesh(header, finestFetchedLevel, shadow?, textures: SurfaceTextures | null = null)` passes `textures` to every ring, and adds to the returned object:

```ts
    setSurfaceDetail(enabled: boolean): void { detailEnabled = enabled; for (const r of ringMaterials) r.setDetail(enabled) },
    get surfaceDetail(): boolean { return detailEnabled && textures !== null },
```

with `let detailEnabled = true` (the default, because a null `textures` already makes the getter false), and the `TerrainMesh` type gaining `setSurfaceDetail(enabled: boolean): void` and `readonly surfaceDetail: boolean`.

- [ ] **Step 6: Run the tests, typecheck, lint, depcruise.**
Run: `npx vitest run tests/render/terrainSurface.test.ts tests/render/scenery.test.ts tests/render/terrainLod.test.ts tests/render/terrainLoad.test.ts --maxWorkers=2; echo rc=$?`, then `npx tsc --noEmit; echo rc=$?`, `npx eslint src/render/terrain --max-warnings 0; echo rc=$?`, `npm run depcruise; echo rc=$?`
Expected: all `rc=0`. Existing callers of `createTerrainMesh` compile unchanged, because the new parameter is optional.

- [ ] **Step 7: Commit.**

```bash
git add src/render/terrain tests/render/terrainSurface.test.ts
git commit -m "Terrain textures Task 4: texel/mean albedo detail and texture normals, blended by the unchanged weights; ring materials swap graphs by setSurfaceDetail"
```

---

### Task 5: Boot wiring, tier gating, diagnostics, and the Tier 2 behavior spec

**Files:**
- Modify: `src/render/main.ts` (near `loadSkyNoise()` ≈ line 996; `createTerrainMesh` ≈ line 1040; `applySceneryTier` ≈ line 1140; the diagnostics object ≈ line 870), `src/render/diagnostics.ts`
- Test: `tests/e2e/terrainTextures.spec.ts` (Tier 2)

**Interfaces:**
- Consumes: `loadSurfaceTextures`, `terrainTexturesFromQuery`, `TerrainMesh.setSurfaceDetail`/`surfaceDetail`
- Produces: `Ww2Diagnostics.terrainSurface: () => { readonly texturesLoaded: boolean; readonly detail: boolean }`

- [ ] **Step 1: Diagnostics type.** In `src/render/diagnostics.ts`, beside `clouds`:

```ts
  /** Visual realism §2.1: whether the terrain textures loaded this boot, and
   *  whether the ring materials are drawing them (false at scenery `low`,
   *  under `?terrainTextures=off`, or after a failed load). */
  readonly terrainSurface: () => { readonly texturesLoaded: boolean; readonly detail: boolean }
```

- [ ] **Step 2: Boot.** In `main.ts`, right after `skyNoiseLoading.catch(() => undefined)`:

```ts
  // Visual realism §2.1 (plan Ruling 4): the terrain textures load before the
  // terrain mesh is built, so the ring materials compile once with them. A
  // failure is a warning and the procedural surface -- never fatal.
  const forcedTerrainTextures = import.meta.env.DEV ? terrainTexturesFromQuery(location.search) : undefined
  const surfaceTexturesLoading: Promise<SurfaceTextures | null> = forcedTerrainTextures === 'off'
    ? Promise.resolve(null)
    : loadSurfaceTextures(renderer).catch((err: unknown) => { console.warn('terrain textures unavailable; drawing the procedural surface:', err); return null })
```

Then replace `const terrain = createTerrainMesh(TERRAIN_HEADER, finestFetchedLevel, shadow)` with:

```ts
  const surfaceTextures = await surfaceTexturesLoading
  const terrain = createTerrainMesh(TERRAIN_HEADER, finestFetchedLevel, shadow, surfaceTextures)
  // Scenery `low` draws the procedural surface (plan Ruling 3). `?terrainTextures=on`
  // holds the textures on whatever the tier.
  terrain.setSurfaceDetail(forcedTerrainTextures === 'on' || sceneryTier !== 'low')
```

Check that `sceneryTier` has already been resolved at that point (`sceneryTier = forcedSceneryTier ?? quality.current().scenery` is at ≈ line 1016, before 1040). If a later edit reorders them, move the `setSurfaceDetail` call after it. In `applySceneryTier`, after `vegetation?.setTier(name)`, add:

```ts
    if (forcedTerrainTextures === undefined) terrain.setSurfaceDetail(name !== 'low')
```

`forcedTerrainTextures` and `terrain` must be in scope there. If `applySceneryTier` is defined before `terrain`, move the line into whichever closure runs after `terrain` exists, and say so in the commit message. Also note the existing early `return` for `forcedSceneryTier`: under `?oceanTier=`, scenery is held, so the textures are held too, which is correct. Add the diagnostic beside `clouds:`:

```ts
      terrainSurface: () => ({ texturesLoaded: surfaceTextures !== null, detail: terrain.surfaceDetail }),
```

(If the diagnostics object is built before `terrain` exists, follow the `let`-and-null pattern the object already uses for late values such as `cloudPass`.)

- [ ] **Step 3: Tier 1 gate.**
Run: `npx tsc --noEmit; echo rc=$?`, `npx eslint src --max-warnings 0; echo rc=$?`, `npm run depcruise; echo rc=$?`, then `npx vitest run tests/render tests/tools/textures.test.ts --maxWorkers=2; echo rc=$?`
Expected: all `rc=0`.

- [ ] **Step 4: Write the Tier 2 spec** `tests/e2e/terrainTextures.spec.ts`. Import from `./harness.js` exactly as `tests/e2e/terrain.spec.ts` does (`waitForTerrain`, `spawnUrl`, `percentile`, `type DiagWindow`). Read `terrain.spec.ts:240-308` first and reuse its GPU-sampling sequence (`resetFrameTimes`, settle, read `gpuFrameTimesMs`, `percentile(…, 95)`) verbatim rather than inventing a new one.

```ts
import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import { percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { VIEWS } from './views.js'

const surface = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as DiagWindow).__ww2!.terrainSurface())
const errors = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)
const view = (name: string): string => VIEWS.find(v => v.name === name)!.url
const withQuery = (url: string, q: string): string => url + (url.includes('?') ? '&' : '?') + q

test.describe('terrain textures (visual realism §2.1)', () => {
  test('load at the default tier and draw with zero validation errors', async ({ page }) => {
    await page.goto(view('runway')); await waitForTerrain(page)
    expect(await surface(page)).toEqual({ texturesLoaded: true, detail: true })
    expect(await errors(page)).toEqual([])
  })

  test('a failed texture fetch boots on the procedural surface (Review Focus 1)', async ({ page }) => {
    await page.route('**/content/textures/**', r => r.abort())
    await page.goto(view('runway')); await waitForTerrain(page)
    expect(await surface(page)).toEqual({ texturesLoaded: false, detail: false })
    expect(await errors(page)).toEqual([])
  })

  test('?terrainTextures=off changes the near ground and nothing breaks', async ({ page }) => {
    const shot = async (url: string): Promise<Buffer> => {
      await page.goto(url); await waitForTerrain(page); await page.waitForTimeout(1500)
      return page.screenshot()
    }
    const on = await shot(view('runway'))
    const off = await shot(withQuery(view('runway'), 'terrainTextures=off'))
    expect(await surface(page)).toEqual({ texturesLoaded: false, detail: false })
    // Bottom third of the frame is near ground in the runway view.
    const crop = async (b: Buffer) => {
      const m = await sharp(b).metadata()
      return sharp(b).extract({ left: 0, top: Math.floor(m.height! * 2 / 3), width: m.width!, height: Math.floor(m.height! / 3) }).raw().toBuffer()
    }
    const [a, b] = await Promise.all([crop(on), crop(off)])
    let sum = 0; for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!)
    // Measured in Task 6 Step 1; the value here is a floor, not a target.
    expect(sum / a.length).toBeGreaterThan(1.0)
  })

  test('scenery tier low <-> high swaps the terrain graph without validation errors (Review Focus 2)', async ({ page }) => {
    // The Settings dialog opens from the title screen, which is up at '/'
    // (the same path tests/e2e/settingsUi.spec.ts drives).
    await page.setViewportSize({ width: 2560, height: 1440 })
    await page.goto('/'); await waitForTerrain(page)
    await page.getByRole('dialog', { name: 'Title' }).getByRole('button', { name: 'Settings' }).click()
    const dlg = page.getByRole('dialog', { name: 'Settings' })
    await dlg.getByRole('button', { name: /Advanced/ }).click()
    const scenery = dlg.getByRole('radiogroup', { name: 'Scenery quality' })
    await scenery.getByRole('radio', { name: /Low\b/ }).click()
    await page.waitForTimeout(1500) // one pipeline recompile per ring
    expect(await surface(page)).toEqual({ texturesLoaded: true, detail: false })
    await scenery.getByRole('radio', { name: /High\b/ }).click()
    await page.waitForTimeout(1500)
    expect(await surface(page)).toEqual({ texturesLoaded: true, detail: true })
    expect(await errors(page)).toEqual([])
  })

  // terrain.spec.ts's sampling sequence (SETTLE 1.5 s, reset, 5 s window,
  // p95), at the two views where the near ground fills the most frame.
  for (const name of ['runway', 'low-land-600'] as const) {
    test(`GPU p95 at 1440p with textures on stays inside 6.0 ms at ${name}; on/off delta recorded`, async ({ page }) => {
      await page.setViewportSize({ width: 2560, height: 1440 })
      const p95 = async (url: string): Promise<number> => {
        await page.goto(url); await waitForTerrain(page)
        await page.waitForTimeout(1500)
        await page.evaluate(() => { (window as DiagWindow).__ww2!.resetFrameTimes() })
        await page.waitForTimeout(5000)
        const gpu = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
        expect(gpu.length, 'too few GPU timestamp samples to take a percentile').toBeGreaterThan(100)
        return percentile(gpu, 0.95)
      }
      const on = await p95(view(name))
      expect(await surface(page)).toEqual({ texturesLoaded: true, detail: true })
      const off = await p95(withQuery(view(name), 'terrainTextures=off'))
      const detail = `${name}: textures on p95 ${on.toFixed(3)} ms, off ${off.toFixed(3)} ms, delta ${(on - off).toFixed(3)} ms`
      // Printed on a pass too: the handoff quotes this line (terrain.spec.ts's convention).
      console.log(`terrain textures budget: ${detail}`)
      test.info().annotations.push({ type: 'budget', description: detail })
      expect(on, detail).toBeLessThanOrEqual(6.0)
      expect(await errors(page)).toEqual([])
    })
  }
})
```

`percentile(values, 0.95)` takes a fraction, as `terrain.spec.ts` calls it. The `VIEWS` URL for `runway` is bare `/`, so `withQuery` produces `/?terrainTextures=off`.

- [ ] **Step 4b: Make the Settings copy honest.** `RENDER_QUALITY_OPTIONS`'s Low note in `src/render/settings.ts` says "Fastest. Reduced ocean and cloud detail, and no trees at all." Low now also drops the ground textures, so change it to `'Fastest. Reduced ocean and cloud detail, no trees and plain ground.'` Update any test that pins the old string (`grep -rn "no trees at all" tests`).

- [ ] **Step 5: Run Tier 2 on the reference GPU** (the recipe in `CLAUDE.md`):

```bash
ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &
curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim.windomlane.org/   # expect 200; start `npm run dev:lan` if not
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org npx playwright test tests/e2e/terrainTextures.spec.ts tests/e2e/terrain.spec.ts; echo rc=$?
```

Expected: `rc=0`. A `net::ERR_QUIC_PROTOCOL_ERROR` at page load is the known windomlane flake. Re-run that test once and note it; don't change the harness.

- [ ] **Step 6: Commit.**

```bash
git add src/render/main.ts src/render/diagnostics.ts src/render/settings.ts tests/e2e/terrainTextures.spec.ts tests/
git commit -m "Terrain textures Task 5: load before the terrain, scenery-low and ?terrainTextures gating, __ww2.terrainSurface, Tier 2 behavior spec"
```

---

### Task 6: Measure and look: budget, tiling, handedness

**Files:**
- Modify (tuning only, if the evidence requires it): `src/render/terrain/surfaceDetail.ts` constants
- Create: `docs/handoff/<date>-terrain-textures-shots/` (screenshots cited by the handoff)

The acceptance evidence for spec §6's "frame-time re-measurement against the existing 6.0 ms budget" and for the spec's named risk (tiling at 200 km scale). **Read every image you cite.**

- [ ] **Step 1: Budget.** Run `tests/e2e/terrain.spec.ts` (1440p budget) and `tests/e2e/budget4k.spec.ts` on the reference GPU with textures on (the default), then again with `?terrainTextures=off` appended to the spawn URLs those specs use. If they don't take a query, do the on/off comparison through `terrainTextures.spec.ts`'s budget test at both views. Record a table: view × resolution × on/off × p95.
  - **Pass:** 1440p p95 ≤ 6.0 ms with textures on, at every view measured.
  - **If the on-vs-off delta at 1440p exceeds 1.0 ms, or any view fails:** apply these levers in order, re-measuring after each, and stop at the first that passes: (a) drop the `far` albedo sample and use `near` only, with the macro noise modulating ratio contrast instead (5 fewer samples); (b) sample normals only for `sand`, `dirt`, `rock` (the three with meter-scale relief), leaving `grass`/`jungle` slopes at zero. Record which lever shipped and its numbers.
- [ ] **Step 2: Look.** Capture on and off at `runway`, `photo`, `low-land-600`, `high-6000`, and a low-sun runway (`withParams('/', { timeOfDay: '17' })`), 1440p, into the shots directory. For each pair, write one line in the handoff saying what you see. Specifically:
  - **Tiling** (Review Focus 5): no visible regular grid at `low-land-600`/`high-6000`. If there is one, first lower `ALBEDO_DETAIL_FAR_M` (floor 3000), then raise `MACRO_TILE_FACTOR` (ceiling 11.3, keep it non-integer).
  - **Handedness** (Review Focus 4): at `timeOfDay=17`, bumps are lit on their sun-facing side. If they read inverted, the fix is the sign in `normalToSlope` **and** its node twin together, plus flipping the matching unit test's expectation, with the capture as evidence.
  - **Hue** (Ruling 1): the forest still reads green from `low-land-600`; paddies still read as fields.
- [ ] **Step 3: Re-run Tier 1 for anything tuned.**
Run: `npx vitest run tests/render/terrainSurface.test.ts --maxWorkers=2; echo rc=$?` → `rc=0`.
- [ ] **Step 4: Commit** (only if constants changed or shots were added):

```bash
git add src/render/terrain/surfaceDetail.ts docs/handoff/
git commit -m "Terrain textures Task 6: reference-GPU budget and look captures; <lever/tuning, or 'no tuning needed'>"
```

---

### Task 7: Handoff, status row, full verify

**Files:**
- Create: `docs/handoff/<date>-terrain-textures.md`
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§15 table, a new row after the `UI realism` row), `README.md` (the pointer list, if it has one for handoffs, as prior plans added)

- [ ] **Step 1: Full verify on ryzen.** Per `serverconfig/ryzen.md`: `remote-run npm run verify`, capturing the exit status as that doc says (`exit $LASTEXITCODE` on the PowerShell side). Expected: exit 0. If ryzen is unavailable, run `npm run verify; echo rc=$?` on nexus **only** when no other session is running vitest (`pgrep -af vitest` is empty), and say that in the handoff.
- [ ] **Step 2: Handoff doc** with: what shipped (commits), the Task 6 budget table and look notes with image paths, which Task 6 lever (if any) shipped, the six Rulings restated as one line each, and **open questions for Mark**: (1) Ruling 1, modulate vs replace hue: does the near ground now read as real material, or does he want the texture's own color? (2) Should `high`/`ultra` Asset Quality buy 2048² albedo later (a build-flag change plus a second file pair)? (3) Next in the spec's priority order: §2.2 tree textures, which need §3.1's crown geometry first.
- [ ] **Step 3: §15 row.** Add a row matching the table's format:

`| Visual realism §2.1 | any | Terrain surface textures | §4 | Landed <date>: five CC0 Poly Haven materials as KTX2 arrays (2.77 MB), texel/mean modulation under unchanged blend weights, off at scenery low ([spec](2026-09-24-visual-realism-pass-design.md), [plan](../plans/2026-09-26-terrain-surface-textures.md), [handoff](../../handoff/<date>-terrain-textures.md)). Open: hue modulate-vs-replace is Mark's eye call; §2.2/§2.3/§3 not started. |`

- [ ] **Step 4: Commit and push.**

```bash
git add docs/handoff docs/superpowers/specs/2026-09-12-ww2airsim-design.md README.md
git commit -m "Terrain textures: handoff, §15 status row"
git push -u origin HEAD
```

Pushing doesn't deploy (projects `CLAUDE.md`). Tell Mark the textures are visible at `https://ww2airsim.windomlane.org/` (the dev server, off the working copy) once `curl` returns 200, and email the handoff with `python3 tools/mail-doc.py docs/handoff/<file>.md "<subject>"`.
