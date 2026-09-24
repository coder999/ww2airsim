# Plan 13d handoff — Dulag, villages and roads from OpenStreetMap

2026-09-23/24. Master spec §15's Plan 13d ("Dulag, villages and roads from
OpenStreetMap") is complete on `main`: real Overpass towns/roads replace the
prior placeholder scenery, Dulag carries its own smaller 1944 building
layout instead of Tacloban's table reused verbatim, and the whole result has
been screenshotted and frame-time-budgeted on the reference GPU.

## What landed, by task

- **Task 1 — Overpass extraction (`a710048`, `d4146d3`, plus two
  controller-authored ruling commits, `6ee3632`/`62d0294`).**
  `tools/scenery/build.ts` fetches towns (`place=city|town|municipality`)
  and the Maharlika Highway alignment (`highway=trunk|primary`) from the
  public Overpass API over the same bounding box the land-cover tiles use
  (`tools/landcover/fetch.ts`'s `COVER_BOX`), and writes
  `content/scenery/places.json` (108 towns/villages, 1,897 raw roads before
  Task 2's filtering). Town sizing is a two-name allowlist (only Tacloban
  and Ormoc are `'town'`; OSM itself tags 103 of the other 106 settlements
  `place=town` too, which would have misclassified nearly everything had the
  build trusted the tag). A road's display name falls back
  `name` → `ref` → a synthesized `Unnamed road ${id}` (54 of 1,897, 2.8%,
  needed the synthesized form) — cosmetic only, no effect on the rendered
  alignment. **`ROAD_WIDTH_M = 8`** (a two-lane unpaved 1944 provincial
  road) is an explicit, documented, non-surveyed assumption — the source
  data carries no road width the way it does for the two rivers Plan 13
  already shipped — recorded in both a code comment at its definition and
  `content/scenery/NOTICE.md`. The raw Overpass response
  (`tools/scenery/cache/places-overpass.json`, gitignored, matching the
  existing river-cache precedent) is required for the 5 of 8
  `tests/tools/sceneryBuild.test.ts` cases that call `buildPlaces()`
  directly; they skip-guard cleanly on a fresh clone or in CI, where that
  cache does not exist.
- **Task 2 — roads on the river mask's second channel (`969fa21`, plus
  controller-authored ruling commits `792798f`/`94682f5`).** This is the
  task with the real course-correction: a first attempt filtered roads by
  name/ref alone and measured a genuine 178.6 km span end-to-end, which even
  at 8192² gives ~44 m texels — failing the <38 m legibility bar the ruling
  set. The fix adds a second filter, an 80 km geographic radius around
  Tacloban's own sourced coordinate
  (`toLocal(11.228, 125.028)`, from `content/bases/tacloban.json`, not the
  separate 10.8°N/125.3°E tangent-plane origin) — re-measured independently
  after the fix, not just trusted: **178.6 km → 138.7 km combined
  river+road span, 8192² → 16.7–16.9 m texels**, inside the bar with real
  margin. The mask itself is `createRiverMask()`'s existing single texture
  with a second interleaved channel (`RGFormat` → river in `.r`, road in
  `.g`), **not** a second texture — an 8× memory increase from the
  originally-shipped 4096² single-channel baseline (16,777,216 bytes →
  134,217,728 bytes), which is why this plan's frame-time budget re-check
  below mattered. `surface.ts` blends `vec3(0.42, 0.36, 0.27)` (dry earth)
  over the ground wherever `smoothstep(0.05, 0.5, riverRoadMask.g)` says a
  road is present.
- **Task 3 — towns as deterministic hut rings (`a7a0687`).**
  `src/render/scene/towns.ts`'s `townHutFootprints` places every settlement
  as a ring of huts (5 m × 6 m, smaller than the airfield's 12×28 m halls) —
  a `'town'` gets 3 rings (24 huts total: 5/8/11 per ring, 30–100 m radius),
  a `'village'` gets 1 ring (5 huts, 30 m radius) — seeded from the
  settlement's own OSM node id so the layout is deterministic and stable
  across rebuilds, skipped on land below `heightAt <= 0.5` (off-map/
  underwater), and never placed inside an airfield's clearing.
  `TownsHandle.hutFootprints` feeds `createVegetation` the same way
  `AIRFIELD_HUTS` already excludes trees from the runway's own huts, so no
  tree can grow through a hut roof.
- **Task 4 — Dulag's real 1944 building layout (`b285621`).**
  `content/bases/dulag.json`'s 4-building placeholder (Tacloban's own table,
  reused verbatim: 3 hangars + a control tower) is replaced with 2 small
  buildings of Dulag's own — one 22×28 m hangar (hp 90), one smaller
  12×16 m maintenance shed (hp 50), no control tower, no AAA — matching the
  Wikipedia source's "hastily-established fighter strip" framing (475th
  Fighter Group, 28 October 1944). Both reuse the old placeholder's first
  two x/z offsets deliberately, since those are the only two Dulag
  coordinates an existing test already confirmed sit on real land
  (`groundHeightM > 10`). `airfield.ts`'s taxiway/clutter gate generalized
  from a Tacloban-specific id check to `airfield.apron !== null`, which
  stays correctly silent for Dulag without new special-casing.
- **Task 5 — reference-GPU acceptance (`8f7b666`, this task).** See below.

## Task 5: what was checked, and two real defects found building the check

`tests/e2e/terrain.spec.ts` grew a `places:` describe block: three
screenshots (Tacloban, Tanauan — "the Leyte Valley," almost exactly midway
between Tacloban and Dulag on the same highway — and Dulag), spawned exactly
at each settlement's own centre (`content/scenery/places.json` read live,
not pinned as literals, so a future Overpass re-run cannot silently
screenshot the wrong point) and shot with a held look-down key.

**Two real bugs in the spec itself, not the shipped code, found only
because something actually ran on the reference GPU:**

1. The title-frozen positioning trick `clouds.spec.ts` uses for its own
   screenshots (hide the title dialog via CSS, position stays exactly at
   spawn) cannot combine with look-around: `main.ts`'s render loop feeds the
   frame `NO_KEYS` whenever `title.up()`, by design, so `Numpad2` never
   reaches `lookOffsetFromKeys` no matter how long it is held. The first
   version of this spec hung for 60 s on all three places before this was
   found and the spec switched to a real, running flight.
2. A real flight needs `waitForTerrain` (clicks "New game"), and a first
   fix assumed the airplane holds its spawn's 120 m/s — it does not, with no
   throttle input it glides. Spawning 7 km west of each settlement and
   waiting out the distance at an assumed constant 120 m/s let the airplane
   glide, unpowered, for ~58 s, landing at a stable trimmed glide (~100 m,
   141 mph, measured identically on all three places) nowhere near the
   intended settlement — all three screenshots came back with no road, no
   huts, nothing but scattered trees over open grass. Fixed by spawning
   directly at each settlement's centre and shooting ~800 ms later, keeping
   the unpowered glide too short to matter (measured final position: 2–8 m
   off centre, altitude still the intended 500 m, on the corrected run).

**What the corrected screenshots show, read directly (never argued about a
picture not looked at):**

- **Tacloban** (`test-results/places-tacloban.png`): the coastline, a clean
  hut cluster (visibly more huts than Dulag's, consistent with `'town'`'s 3
  rings), no tree over any hut roof. The Maharlika Highway segment through
  Tacloban (locally named "Magsaysay Boulevard" in the source data, with
  over a dozen points within 90 m of the town's own OSM node — confirmed by
  querying `places.json` directly, not assumed) does **not** read as a
  visually distinct line in this shot: zoomed inspection shows the dry-earth
  road color and the sandy coastal-beach cover color are close enough in hue
  that the two blend at this specific vantage. This is a real, worth-noting
  visibility nuance, not a broken mask — the mechanism is proven functional
  by both the geometric proximity data and the Tanauan shot below.
- **Tanauan / "Leyte Valley"** (`test-results/places-leyte-valley.png`): the
  clearest evidence the road mask itself is correct — a clean, constant-
  width dry-earth line crossing the frame with roadside trees, no seams or
  artifacts from the 8192² mask, and the village's own smaller hut cluster
  sitting in a visible tree-free clearing beside it.
- **Dulag** (`test-results/places-dulag.png`): exactly 5 huts in a single
  ring (matching `'village'`), visibly smaller than Tacloban's cluster, no
  floating trees, coastline visible at the frame's edge.

**Frame-time budget, re-measured after this plan's full 8× road-mask memory
increase:** `frame-time budget: gpu p50 2.957 ms, p95 3.307 ms over 312
samples; rAF interval p95 1.400 ms` — comfortably inside the existing 6.0 ms
ceiling (55%), confirming the mask's memory growth is a one-time upload with
no per-frame GPU-time cost, exactly as design §8 predicted. Recorded as a
dated row in `terrain.spec.ts`'s own measurement table rather than as a new
GPU_BUDGET_P95_MS tripwire, since this plan added no discernible per-frame
cost (a static texture read and a merged static hut mesh, the same order of
cost as the existing river-mask read and airfield-hut batch already in the
budget). The measured value is lower than the last documented row (land
cover raster: p95 5.18 ms) despite this plan adding rendering work, not
removing it — noted in the file as more likely a lighter-loaded run on the
shared reference desktop than a genuine speedup.

## Tier 1 evidence

```
npm run verify; rc=$?; echo rc=$rc
```

Result: `rc=0`. Typecheck, ESLint (zero warnings), dependency-cruiser (136
modules, 399 dependencies, no violations) clean; 137 test files, 1,451
tests passed, 1 pre-existing skip.

## Reference-GPU evidence

`PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org
npx playwright test tests/e2e/terrain.spec.ts` — **7/7 passed** (58.7 s):
the three existing camera sweeps (100/3,000/8,000 m, zero WebGPU validation
errors each), the frame-time budget (above), and the three new `places:`
screenshots (zero WebGPU validation errors on all three).

## Commits

`6ee3632..8f7b666` on `main`, 10 commits: two controller-authored ruling
commits before Task 1's implementation, Task 1 (`a710048`) plus its
skip-guard fix (`d4146d3`), two controller-authored ruling commits before
Task 2's implementation, Task 2 (`969fa21`), Task 3 (`a7a0687`), Task 4
(`b285621`), Task 5 (`8f7b666`, this task). Full list via
`git log --oneline 6ee3632..8f7b666`. Not pushed, not deployed — both are
Mark's call, separately, per this repo's own convention.

## Remaining work / open items

- **The road-width assumption from Task 1** (`ROAD_WIDTH_M = 8`, a two-lane
  unpaved 1944 provincial road) is not surveyed — the source data has no
  width for roads the way it does for the two rivers Plan 13 already
  shipped. Documented in both a code comment and `content/scenery/
  NOTICE.md`; revisit only if a better source surfaces.
- **The mask-resolution outcome from Task 2's Review Focus item**: shipped
  at 8192² (not the originally-assumed 4096²), an 8× memory increase from
  the pre-Plan-13d baseline, justified by a real measured 138.7 km combined
  river+road span giving 16.7–16.9 m texels — inside the <38 m (road) / <19
  m (river) legibility bars with real margin. This task's frame-time
  re-measurement confirms that memory increase cost nothing in per-frame GPU
  time, as expected for a static texture upload.
- **Tacloban's coastal road is functionally present but visually
  low-contrast** against the sandy beach cover in a straight-down view —
  see Task 5's screenshot notes above. Not a defect; flagged in case a
  future pass wants a more contrasting road color specifically near
  coastline cover.
- Coverage is limited to the Overpass query's bounding box and the moment it
  was retrieved (2026-09-24 UTC) — later OSM edits are not reflected;
  `content/scenery/places.json` is a snapshot, same precedent as the
  existing river data.
