# K Clouds v3 — full TSL port handoff

**Date:** 2026-10-11  
**Branch:** `clouds-v3-tsl-port`  
**Base:** `b8c17fb7`  
**Worktree:** `/home/mark/projects/ww2airsim-clouds-v3-tsl`  
**Disposition:** optimized promotion candidate; awaiting Mark's final edge checkpoint

## Outcome

The accepted Takram-derived plain-cloud renderer now has a complete parallel
Three Shader Language implementation behind the DEV-only selector
`?cloudRenderer=takram-tsl`. The density field, weather tiling, ray march,
lighting, 2×3 temporal reconstruction, broad soft-edge resolve and
reversed-depth scene composite are all TSL-generated. No cloud rendering stage
embeds hand-written WGSL.

The experiment succeeded technically, visually, and after a focused
optimization pass, in budget. Two clean interleaved reference-GPU runs put the
optimized TSL whole frame at 5.746–5.772 ms p95 versus a same-scene native
estimate of 5.890–5.915 ms. It therefore clears both the 8.33 ms game gate and
the plan's no-more-than-15%-slower promotion criterion.

This is still a research branch by Mark's ruling, not a replacement decision.
`legacy` remains the default; `takram` remains the preferred production
candidate until a separate promotion decision. Main, production and deployment
are unchanged.

## How to view it

- Full TSL: `https://ww2airsim-3.windomlane.org/?spawnX=289068&spawnY=1300&spawnZ=-55605&launch&cloudRenderer=takram-tsl&cloudTier=high`
- Native comparison: change `cloudRenderer=takram-tsl` to
  `cloudRenderer=takram`.

These URLs are the isolated worktree's temporary slot, not a deployment.

## Visual comparison

![Native WGSL at left and full TSL at right: below, in and above the cloud deck](img/2026-10-11-k-clouds-v3-tsl-native-vs-tsl.jpg)

The paired 2560×1440 Ryzen captures match in weather placement, silhouettes,
lighting direction, opacity, scene-depth ordering and soft-edge treatment. The
thin near-cloud stippling in this original pair is present in both columns. It
was a native artifact, not a regression introduced by TSL. The follow-up below
now reduces it identically in both implementations.

## Architecture

- `takramTslAssets.ts` loads the weather and turbulence maps as Three textures,
  keeps the shape, detail and STBN volumes in their source single-channel R8
  representation, and uploads the accepted averaged 3D shape mip chain.
- `takramTslCloudPass.ts` builds one laid-out density function per material,
  renders radiance/opacity plus representative depth into an MRT at one-sixth
  resolution, resolves into full-resolution ping-pong history, and composites
  against the game's reversed depth.
- `main.ts` loads and constructs this path only for `takram-tsl`; selecting
  `takram` still follows the untouched native implementation.
- Diagnostics and focused tests name the renderer explicitly, so native and
  TSL evidence cannot be confused.

## Correctness evidence

- Touched unit test: `tests/render/clouds.test.ts` — 10 passed.
- TypeScript typecheck — passed.
- Touched ESLint set with zero warnings — passed.
- Focused real-game TSL flight on the Ryzen WebGPU browser — passed in 12.1 s.
  It rendered clouds, composited into the game, reset history on a camera cut,
  and reported no console, page or WebGPU validation errors.
- The optimized path repeated that focused flight on nexus's real WebGPU in
  12.2 s with no console, page or validation errors. A focused timing-seam test
  also proved that direct march and temporal samples are present, finite and
  positive.
- Final native and TSL capture runs — one passed each, with no validation
  errors.

`npm run verify` was run twice through `remote-run`. Typecheck, zero-warning
lint, dependency cruise, production build/content checks, and 411 of 413 test
files passed both times. Two unrelated long-running simulation files hit the
suite-wide 30-second timeout under load: `aiLethality.test.ts` and the entity
case in `soak.test.ts`. Run alone immediately afterward, both files passed —
15 tests in 26.12 s, including the previously timed-out cases in 13.42 and
14.74 s. No cloud test or build check failed. This is recorded as a
load-sensitive full-suite timeout rather than claimed as a green `verify`
exit. The repository-wide Playwright suite was not run; it was not authorized
or needed for this isolated renderer experiment.

## Optimization and reference-GPU cost

The first port had two avoidable differences from native WGSL:

1. Three-owned shape, detail and STBN volumes expanded source R8 data to
   RGBA8. Keeping them as `RedFormat`/`UnsignedByteType` reduces those volumes
   from about 13.3 MiB to 3.3 MiB and improves texture-cache residency.
2. TSL always fetched four weather tiles. All those reads use an explicit LOD,
   so the optimized shader legally follows native WGSL's branch: one fetch in
   a tile interior, two at an edge and four at a corner (1.44 expected fetches
   for uniformly distributed positions versus 4 before).

Three's render-context timestamps now expose the TSL march and temporal passes
separately. The composite remains fused into the game's final Three pass.

RX 6700 XT, 2560×1440, High, under `hwlock ryzen-budget`:

| Variant/run | Three with native p95 | Native raw pass p95 | Native estimated total p95 | TSL total p95 | TSL march p95 | TSL temporal p95 | TSL/native |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Before 1 | 3.881 ms | 2.010 ms | 5.891 ms | 7.001 ms | 2.839 ms | 0.228 ms | 1.188× |
| Before 2 | 3.902 ms | 2.020 ms | 5.922 ms | 7.016 ms | 2.820 ms | 0.229 ms | 1.185× |
| Optimized 1 | 3.864 ms | 2.026 ms | 5.890 ms | 5.746 ms | 1.537 ms | 0.230 ms | 0.976× |
| Optimized 2 | 3.883 ms | 2.032 ms | 5.915 ms | 5.772 ms | 1.542 ms | 0.229 ms | 0.976× |

The same-scene native estimate adds the native-cloud scene's Three p95 to the
raw pass's direct p95, because raw WebGPU work is outside Three's timestamp
pool. The earlier handoff added the raw pass to the clouds-off scene instead;
that omitted cloud-shadow and graph work shared by both real renderers and
overstated the TSL penalty. Clouds-off remains recorded as a stability control,
not the comparator.

The two fixes together cut march p95 by 45–46% and whole-frame TSL p95 by about
18%. P50 tells the same story: before TSL was 18.9–19.2% slower; after it was
1.8–2.0% faster. One additional optimized attempt was rejected rather than
averaged in: an unrelated `remote-run npm run verify` started during the run,
native raw p95 jumped from about 2.02 to 7.04 ms, and the existing 4 ms native
sanity gate failed. This directly confirms that concurrent Ryzen work can
contaminate budget tests even though `hwlock ryzen-budget` excludes other
budget tests.

### Follow-up edge-stability pass

Mark's normal flight exposed two distinct effects in screenshots at
`?spawnX=298545&spawnY=1825&spawnZ=-60447`:

- thin/low-opacity cloud edges retained a visible, flickering 2×3 lattice;
- a gray strip crossed the sea horizon.

The horizon strip reproduces with `?cloudTier=off`, so it belongs to the
existing atmosphere/ocean horizon treatment and was not hidden in the cloud
shader. The cloud fix instead targets the real temporal cause. Previously the
five non-current pixels in each six-phase cycle carried history unchanged.
They now accept the same near/far-weighted bilinear reconstruction as the exact
phase. A one-pixel cross average runs only when low-opacity neighboring alpha
disagrees, ahead of the existing broad feather; dense interiors keep their
existing value. Native WGSL and full TSL received the same algorithm.

Evidence:

- typecheck and zero-warning lint passed through `remote-run`;
- the focused native and TSL Ryzen/WebGPU flight test passed (2/2), including
  camera-cut history resets and no console, page or validation errors;
- locked RX 6700 XT, 2560×1440 High: native estimated whole-frame p95
  **5.737 ms**, TSL whole-frame p95 **5.522 ms**, TSL march **1.521 ms** and
  temporal **0.173 ms**. TSL/native was 0.963×;
- a preceding attempt stopped at the harness's sample-count guard (88 native
  scene samples, minimum >120) and produced no budget claim. The clean repeat
  collected 253 native-scene and 238 TSL samples.

The branch is ready for Mark's attended visual checkpoint. Promotion and merge
remain intentionally unperformed until that verdict.

## TSL traps found

1. MRT render-target texture names must exactly match the keys passed to
   `mrt(...)`; a mismatch generated an empty output struct and a black frame.
2. Pass-owned mutable values must be TSL `uniform(...)` nodes. `reference(...)`
   is appropriate for real object properties such as camera near/far, not for
   a standalone mutable holder.
3. The averaged shape mip chain can remain byte-identical to the native source:
   let Three allocate and bind the 3D texture, then upload every prepared mip
   explicitly through the native device queue.
4. Explicit-LOD texture reads may be placed in non-uniform control flow. The
   implicit-derivative restriction does not require unconditional
   `textureSampleLevel` reads.
5. Compare split native timing against the same cloud-on scene. Clouds-off is
   not an equivalent base because it also removes shadow and graph work.

## Deliberately unchanged

- No default selector changed.
- Density, lighting and march behavior were not rewritten; native WGSL and TSL
  temporal/composite reconstruction changed together to preserve parity.
- Thunderheads and the Takram cirrus layer remain deferred.
- No deployment, merge to `main`, public fork or upstream pull request was
  made.
