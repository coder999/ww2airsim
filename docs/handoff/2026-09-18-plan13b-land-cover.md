# Plan 13b — land cover from ESA WorldCover

Commits `ef8b326..402cb8d` on `main` (Tasks 1-8: raster format, header
validation, the offline build and pinned digests, attribution, the browser
loader, the terrain shader's class weights, and tree density from the tree
fraction), plus this task's commit wiring both consumers into boot,
updating the `terrain.spec.ts` budget table, and closing out the plan and
roadmap row.

## What Task 9 did

- `src/render/main.ts`: imports `loadCover` and `coverLookup`/`CoverLookup`.
  After `createTerrainMesh(TERRAIN_HEADER)`, kicks off `loadCover()`
  in parallel with everything else that boots; on success calls
  `terrain.setCover(data)` and, if vegetation already exists, `vegetation
  .setCover(cover)`. On failure, logs a warning and leaves the procedural
  paint (`surface.ts`'s `ready` uniform) and the daa1b39 forest in place —
  the raster racing terrain-level arrival and vegetation creation was the
  point: whichever finishes second finds the other ready, and a failed
  fetch is not fatal. In the `arrived` block (terrain level 4), added `if
  (cover !== null) vegetation.setCover(cover)` right after `vegetation
  .setTier(oceanTier.name)`, for the case where the raster lands before
  vegetation is created.
- `tests/e2e/terrain.spec.ts`: added a row to the budget-table doc comment
  for the land-cover raster's measured cost (`+ land cover raster (1
  sample/fragment, Plan 13b)  4.98  5.18`), following the existing
  `+ trees` row. The 6.0 ms budget constant itself did not move — the
  raster's measured p95 (5.177 ms) stayed comfortably under it.

## Verification

- `npm run verify`: exit 0. 84 test files passed, 954 tests passed, 1
  skipped (955 total).
- `npm run build`: exit 0. `vite build`, 97 modules, `dist/assets/index-*.js`
  1,110.00 kB (gzip 316.21 kB) — the >500 kB chunk-size warning is
  pre-existing, not new here.

## Tier 2, reference desktop (RX 6700 XT, Windows, through the tunnel)

First run: 22 passed, 2 failed, neither a land-cover regression:

- `ocean.spec.ts:98 ocean sweep 8000 m coast` — `net::ERR_QUIC_PROTOCOL_ERROR`
  at `page.goto`, the transport flake the brief anticipated. Passed alone
  on re-run.
- `ocean.spec.ts:8 GPU inverse FFT matches the CPU reference at N=64` —
  `Failed to fetch dynamically imported module .../renderer.ts`, the same
  class of tunnel network hiccup, not seen on N=128 or N=256 in the same
  run. Passed alone on re-run.

Both re-runs green, so the full 24 passed once the flakes are excluded.
Full log: `/tmp/tier2-13b.log`.

Budget line, verbatim:

```
frame-time budget: gpu p50 4.981 ms, p95 5.177 ms over 425 samples; rAF interval p95 10.100 ms
```

Under the 6.0 ms p95 budget; no bisection needed. p50 landed at 4.981 ms,
close to the ~5.1 ms the brief predicted from "one filtered sample per
fragment" (the river mask's identical sample measured 0.1 ms in 13a).

## Look at it (`tests/e2e/zz-look.spec.ts`, run then deleted, never committed)

Screenshots at `/tmp/ww2-13b-valley.png`, `/tmp/ww2-13b-shore.png`,
`/tmp/ww2-13b-cruise.png`, `/tmp/ww2-13b-nacolod.png` (paths only, per the
brief; not attached here).

- **Valley** (Dagami plain, 11.06 N 124.90 E): pale-olive, mottled
  cropland/grassland with a meandering river and no tree billboards
  anywhere in frame — matches "pale field colour and nearly treeless."
  The mottling reads as the crop/open class blend rather than a flat
  fill, which is expected texture, not a defect.
- **Shore** (San Juanico mangrove shore, 11.289 N 125.077 E): a dense
  cluster of tree instances covers the near-to-mid ground left of and
  below the aircraft, thinning toward its own edges into scattered
  individual trees, with open grass visible beside it and a light sand
  strip and blue water at the coastline in the frame's upper right —
  matches "trees at the waterline and a dark green band." The immediate
  patch directly under the aircraft is trees-over-grass rather than
  trees-over-sand, consistent with `sceneryView=1` framing the camera a
  short distance inland of the exact shoreline pixel.
- **Cruise** (the budget spawn, 9,795 ft, descending): a bay with sandy
  beaches and inlets, surrounded by mottled olive-and-dark-green terrain
  — not one uniform green, which is the stated bar, and it clears that
  bar. It does not read as pronounced forested hills; flagged in the
  original report and since resolved by the coordinator: the spawn
  round-trips to 11.228 N 124.887 E, coastal plain ~85 km north of Mt
  Nacolod (10.451 N), so low relief there is geographically correct and
  the brief's "forest hills with plains" was loosely worded about a spawn
  that isn't over the highlands. No change to Task 7's weights.
- **Nacolod** (Mt Nacolod, 10.450846 N 125.096068 E, added after the
  coordinator's review): tree instances form a dense, continuous carpet
  in the near field only — roughly the bottom third of the frame — ending
  at a fairly clear radius. Beyond that radius the hillside and mid-ground
  are bare of tree instances entirely: a uniform mid-green surface, not a
  thinning-out. That cutoff is the tree streaming disc (cached cells
  around the camera, `d0ddd04`, gated by quality tier, `6dea59b`):
  instances simply are not generated past it, and this is not a defect.
  Two things this view does show, both evidence for the land-cover raster
  rather than for placement mechanics: (1) within the disc, the carpet is
  denser and more continuous than the shore view's scattered mangrove
  band, consistent with the raster's tree fraction reading 1.0 at the one
  landmark it does; (2) the terrain *surface* beyond the disc — where no
  tree instance exists to explain it — is a uniform forest green with
  none of the valley's pale mottled field pattern, so the raster's forest
  class weight is driving the shader's paint out to the horizon even
  where there is nothing planted. (2) is the stronger evidence of the
  two, since it comes from the shader rather than the tree-placement
  rule. Distant coastline and two small islands are visible on the
  horizon under a clear sky, which is the expected view from altitude
  near a coastal peak, not a mirror symptom.

No sign of the mirror-world bug: the inland Dagami spawn shows no water or
coastline, the San Juanico spawn shows both trees and shoreline consistent
with its coordinates, and the Nacolod spawn (`spawnZ` positive, since
Nacolod is south of the world centre and +z is south) shows forested high
ground with the coast correctly distant rather than underfoot. All four
spawns round-trip to their stated landmarks.

## On disk

`content/landcover/cover.bin.gz`: 253,532 bytes (matches Task 4's exact
byte-count guard).

## Left for 13c

- The sampler's sea-connectivity is 13c's first task (coastline and
  beaches) — the land-cover raster does not itself know which water
  pixels connect to open ocean versus an inland lake, which 13c's design
  section covers.
- 13c and 13d remain not started; see the roadmap table in
  `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` §15.

## Deployed, 2026-09-18

The 15 commits this handoff describes (`ef8b326..617a444`) were pushed to
`origin/main` and deployed to production. Verified live against
`ww2airsim.marktuttle.dev` on 2026-09-18:

- `GET /content/landcover/cover.bin.gz` → 200, 253,532 bytes, sha256
  `5b08d4b415be448a4d35de690fda9dbe91eb78ba7b3acf192e567943b7e7fbe1`, matching
  `COMMITTED_SHA256['cover.bin.gz']` in
  `tests/tools/landcoverBuild.test.ts` — and, deliberately checked, **no**
  `Content-Encoding: gzip` response header, so `loadCover`'s
  `DecompressionStream('gzip')` receives the raw gzip bytes rather than
  double-decoding an already-decompressed response.
- `GET /content/landcover/header.json` → 200; `GET
  /content/landcover/NOTICE.md` → 200.
- The deployed bundle (`assets/index-CetMmXbj.js`) contains the `loadCover`/
  `DecompressionStream` loader path and the string `ESA WorldCover`, and the
  served `index.html` has no `map-credit` element (the watermark
  `dist.test.ts` refuses).

This closes the "not done, on purpose" note this section used to carry: that
note said production was still on `549e272` and that these commits were
local and unpushed, which was true when Task 9 finished and is no longer
true.
