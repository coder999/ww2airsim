# Plan 13d: Dulag, villages and roads from OpenStreetMap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 1944-plausible set of Leyte towns/villages, the Maharlika
Highway alignment, and a real Dulag airstrip layout, sourced from OpenStreetMap
via Overpass and rendered with zero runtime network dependency.

**Architecture:** `tools/scenery/build.ts` grows a second Overpass-backed
extraction (mirroring its existing Nominatim-backed river extraction exactly)
that writes `content/scenery/places.json`. Roads rasterize into a new second
channel of the already-shipped river mask (`RGFormat`, still 4096², per
Mark's 2026-09-23 decision in the land-cover design doc). Towns render as
deterministic hut rings reusing the airfield renderer's own building-drawing
code, factored out to take world coordinates so it isn't airfield-local
anymore. Dulag's placeholder buildings (already checked in as an explicit
stand-in — see `content/bases/dulag.json`'s own `reference.source`) are
replaced with a real, smaller layout.

**Tech Stack:** TypeScript, vitest, `three` (`DataTexture`, `RGFormat`), the
existing `tools/*/build.ts` pipeline convention.

**Spec:** `docs/superpowers/specs/2026-09-18-land-cover-design.md`, §7 and
§9 (this plan implements those two sections only — §2-6, 8 belong to 13b/13c,
both already landed or abandoned). Read the whole document for context; this
plan does not restate its rationale.

## Ruling: the stale 13c dependency (read before Task 1)

The design doc's §1 and §12 say "13d last because its places must sit on
13c's shore." **13c was abandoned as designed on 2026-09-18** (master spec
§15's plan table): reshaping the coastline at the finest grid and letting
`buildPyramid` carry it down measured -6.6% to -88.9% land loss depending on
level and was scrapped; the blocky coast it existed to fix was actually L4's
391 m grid, fixed instead by shipping L2 at 98 m (`eef5b4d`). `tools/landcover/sea.ts`
and `tools/terrain/coast.ts` remain committed and reviewed but UNWIRED.
**This plan does not depend on 13c's mechanism at all** — §7's own scope
table lists only §7/§9 for 13d, and "on land" here means exactly what it
already means everywhere else in this codebase: `heightAt(field, x, z) >
0.5`, reading whatever heightfield is actually shipping today (post-`eef5b4d`),
not a hypothetical 13c-rebuilt one. Places sit on today's real shore because
that is the only shore that exists; there was never a second one to wait for.

## Global Constraints

- `npm run verify` ends every task. Capture `rc=$?` directly.
- **No network at runtime, and none at build time either once cached** — the
  rule 13b and the rivers pipeline already both follow. Overpass is fetched
  ONCE into `tools/scenery/cache/`, and the build reads only the cache from
  then on. **Ruling (controller, corrected from an earlier draft of this
  plan): the cache is gitignored, NOT committed** — confirmed directly:
  `/tools/**/cache/` in `.gitignore` covers `tools/scenery/cache/`, and
  `binahaan.json`/`daguitan.json` are themselves untracked (`git ls-files`
  returns nothing for that directory). `content/scenery/NOTICE.md`'s
  recorded query + rebuild instructions are what make the cache
  reproducible, not a committed copy of the raw response.
- US spelling in every new identifier/comment.
- Work in place on `main`, no worktree; re-diff against `HEAD` before every
  commit.
- `places.json` has no `airfields` key (design §7's own 2026-09-18 amendment,
  after Plan 12) — `content/bases/` stays the sole source of airfield
  records. This plan decorates `content/bases/dulag.json`'s existing record;
  it does not create a second one.
- Escape `\|` inside any markdown table cell this plan's own handoff writes.

## Review Focus

- **The river+road mask's bounding box grows.** `createRiverMask`'s extent is
  derived from whichever paths exist; today that's two short river segments
  near Tacloban. The Maharlika Highway spans both coasts of Leyte, tens of
  km — the combined bbox after Task 2 is materially larger than rivers alone,
  which coarsens the fixed 4096² grid's texel size. Task 2 must MEASURE the
  actual `stepX`/`stepZ` after adding roads and either confirm it still gives
  a usable river width in texels (the shipped rivers must not visibly
  thin or vanish) or fall back to the design's own named alternative (2048²
  is explicitly declined as the default, but the design doc keeps it as a
  recorded fallback if the combined cost doesn't fit once measured for
  real) — do not silently ship a coarsened river with no comparison.
- **`nearRiver`'s existing test** (`tests/render/scenery.test.ts`, "places
  rivers north and west of the gulf origin without transposing the texture
  axes") reads the mask's data array directly by flat index. Once the data
  becomes interleaved RG, that test's assertions must still pass unmodified
  test CODE (not just concept) — a channel-count change that silently breaks
  `nearRiver`'s existing callers (`vegetation.ts`'s tree exclusion) would be
  invisible until someone reads a screenshot.
- **A town or the highway landing on the runway or inside the clearing.**
  The design's own placement rule ("never inside the airfield clearing")
  needs the SAME clearing-exclusion test shape `scenery.test.ts` already
  applies to trees/huts at Tacloban — apply it to the new town rings and to
  every sampled point along the road polyline near an airfield, not only to
  town centres (a road can clip a clearing's edge even when its endpoints
  don't).
- **Overpass elements missing tags or geometry.** A `place=town` node with
  no `name` tag, or a `highway=trunk` way whose member nodes weren't
  returned by the query (an incomplete `out body; >; out skel qt;` result),
  must fail the build loudly (per this repo's own "malformed content does
  not throw, it produces NaN" risk) rather than emit a town with an empty
  name or a road with a gap. Task 1's tests must cover both.
- **Dulag's placeholder content is silently correct today** (it validates
  and renders, just with the wrong buildings) — a test asserting only "the
  Dulag content is valid" would not catch a Task 4 that never actually
  changes the placeholder. Task 4's tests must assert the NEW building
  layout differs from Tacloban's (e.g. building count or ids), not just
  that some layout parses.

---

## Task 1: Overpass extraction — towns, roads, `places.json`

**Files:**
- Create: `tools/scenery/cache/places-overpass.json` (gitignored, fetched
  once by this task — NOT committed, matching `binahaan.json`/
  `daguitan.json`'s actual existing precedent; see the Global Constraints
  ruling above)
- Modify: `tools/scenery/build.ts`
- Modify: `content/scenery/NOTICE.md`
- Create: `content/scenery/places.json` (generated by the build; commit the
  output like `rivers.json`)
- Test: `tests/tools/sceneryBuild.test.ts` (create if the existing rivers
  build has no dedicated test file — locate by searching for
  `RIVER_PATHS`/`tools/scenery/build` coverage first)

**Interfaces:**
- Produces: `content/scenery/places.json` matching design §7's contract:
  `{ towns: [{ name, lat, lon, size: 'town'|'village', source }],
  roads: [{ name, widthM, coordinates: [[lon,lat],...], source }] }` — Task 2
  reads `roads`, Task 3 reads `towns`.

- [ ] **Step 1: Fetch and cache the Overpass response**

Query, matching design §7 exactly (`place=city|town|municipality` nodes,
`highway=trunk|primary` ways, both inside the box) and reusing the SAME
bounding box `tools/landcover/fetch.ts`'s `COVER_BOX` already defines for
the ESA WorldCover tiles — do not hand-derive a second box:

```ts
import { COVER_BOX } from '../landcover/fetch.js' // { latMin, latMax, lonMin, lonMax }
const { latMin: south, lonMin: west, latMax: north, lonMax: east } = COVER_BOX
const query = `[out:json][timeout:180];
(
  node["place"~"^(city|town|municipality)$"](${south},${west},${north},${east});
  way["highway"~"^(trunk|primary)$"](${south},${west},${north},${east});
);
out body;
>;
out skel qt;`
```

POST this to `https://overpass-api.de/api/interpreter` (body: `data=<url-encoded query>`,
verified reachable from nexus 2026-09-23) and save the raw JSON response
verbatim to `tools/scenery/cache/places-overpass.json`. Record the exact
query text and this instruction in `content/scenery/NOTICE.md`, in the same
format the existing Nominatim entries there already use (read that file
first and match its structure exactly — one entry per source query, with
the URL/query, the cache file it produced, and the rebuild command).

- [ ] **Step 2: Write the failing tests**

```ts
// tests/tools/sceneryBuild.test.ts (extend or create)
import { describe, expect, it } from 'vitest'
import { buildPlaces } from '../../tools/scenery/build.js' // exported name to confirm/adjust to this file's actual export convention

describe('places extraction (Plan 13d)', () => {
  it('includes Tacloban and Ormoc as towns, and at least one village', () => {
    const places = buildPlaces()
    const names = places.towns.map((t) => t.name)
    expect(names).toContain('Tacloban')
    expect(places.towns.some((t) => t.size === 'town')).toBe(true)
    expect(places.towns.some((t) => t.size === 'village')).toBe(true)
  })

  it('includes the Maharlika Highway coastal alignment as a road', () => {
    const places = buildPlaces()
    expect(places.roads.length).toBeGreaterThan(0)
    for (const road of places.roads) {
      expect(road.coordinates.length).toBeGreaterThan(1)
      expect(road.widthM).toBeGreaterThan(0)
    }
  })

  it('has no airfields key', () => {
    const places = buildPlaces() as unknown as Record<string, unknown>
    expect('airfields' in places).toBe(false)
  })

  it('throws on an Overpass node with no name tag, rather than emitting a blank town', () => {
    // Construct a minimal synthetic Overpass response (one place=town node,
    // tags: {} -- no name) and feed it to whatever function build.ts
    // factors the node -> town-record parsing into; assert it throws rather
    // than producing { name: undefined } or { name: '' }.
  })

  it('throws on a way referencing a node id absent from the response, rather than emitting a road with a gap', () => {
    // Synthetic response: one way with a node id not present among the
    // returned nodes -- assert the coordinate-resolution step throws.
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/tools/sceneryBuild.test.ts`
Expected: FAIL — `places.json` does not exist and `buildPlaces` is not
exported yet.

- [ ] **Step 4: Implement**

Extend `tools/scenery/build.ts` (read its existing river-extraction code
first and match its structure/style exactly — variable naming, how it reads
its cache file, how it writes its output) with a parallel `places` path:

- Read `tools/scenery/cache/places-overpass.json`.
- Index every returned `node` by its Overpass id (needed to resolve a
  `way`'s `nodes: [id, ...]` array into actual lat/lon pairs).
- For each `place` node: require `tags.name` (throw with the node id in the
  message if absent); `size = (name === 'Tacloban' || name === 'Ormoc') ?
  'town' : 'village'` — **ruling below explains why this is by NAME, not by
  OSM tag**; `source = `https://www.openstreetmap.org/node/${id}``.
- For each `highway` way: `name = tags.name ?? tags.ref ?? \`Unnamed road
  ${id}\`` — **never throws on a naming gap; ruling below (item 3) explains
  why, after two rounds of this assumption being wrong against real data**;
  resolve every member node id through the id index (throw naming the
  missing id if any lookup misses — this ​IS still a real anomaly: a way
  Overpass returned but didn't include all the nodes for); `widthM`: use a
  reasonable fixed value for a 1944 provincial highway (design doc does not
  specify one for roads the way it does for rivers — 8 m, a two-lane
  unpaved provincial road, is the same order of magnitude the design doc's
  own JSON example uses (`"widthM": 8`) — record this as a documented
  assumption in `places.json`'s own generation comment, the same way
  Dulag's heading assumption is recorded); `source =
  `https://www.openstreetmap.org/way/${id}``.

**Ruling (controller, overnight run, 2026-09-23/24, found against the REAL
Overpass response, not a hypothetical):**

1. **Town/village sizing is by name, not by OSM tag.** The original rule
   (`place === 'city' || 'town' ? 'town' : 'village'`) was a mistranscription
   of design §7's own literal words — "Tacloban and Ormoc are `town`,
   everything else `village`" is an explicit two-name allowlist, not a
   tag-based heuristic. Against the real query result (108 place nodes),
   the tag-based version classified EVERY node as `'town'` (0 villages) —
   caught by the implementer before writing any code, not discovered as a
   test failure after the fact. Fixed to match by name.
2. **A road's `name` falls back to its route reference (`ref`), and only
   throws if both are absent.** 68 of 1,897 real highway ways in the query
   result (3.6%) have no `name` tag, including real segments of AH26 (the
   Maharlika Highway's Asian Highway route number) explicitly tagged
   `noname=yes` — a legitimate, common OSM pattern for a numbered highway,
   not a data anomaly. The original "throw if no name" rule would make this
   task unbuildable against real data. `ref` (when present) is exactly the
   right fallback identity for these segments — design §7 itself calls the
   whole alignment "the Maharlika Highway alignment," and AH26 *is* that
   highway's own route number.

3. **A road with neither `name` nor `ref` gets a synthesized placeholder
   name instead of throwing — no more unconditional throws on road naming,
   period.** Ruling 2's "only throws if both are absent" premise was tested
   against real data and found wrong too: 54 of 1,897 real ways (2.8%, not
   a rarity) have neither tag. Since the original rule aborts the ENTIRE
   build on the first occurrence, this meant `buildPlaces()` could never
   complete — zero roads would ever render, not "less-precisely-labeled"
   ones. A road's NAME has no effect on the rendered/rasterized alignment
   (which uses only its `coordinates`); it only affects `source`/debugging
   text and the (never-shipped) label in `places.json`. There is no
   remaining real-data-integrity reason to fail the build over a naming
   gap, so this closes the pattern rather than narrowing it a third time.

**Cost if wrong:** (1) is a one-line predicate change, isolated to this
build step; a wrong village/town split shows up immediately and visibly in
Tier 2 screenshots (the wrong two settlements get three-ring treatment).
(2)/(3) only affect a road's stored NAME, never its geometry — a road that
gets `"Unnamed road ${id}"` instead of a real name still rasterizes into
the mask exactly where OSM says it is; the field is cosmetic/debugging-only
metadata, not load-bearing for anything Tier 2 screenshots or gameplay can
observe.
- Write `content/scenery/places.json` with `{ towns, roads }`, sorted
  deterministically (by name) so regenerating the build from the same cache
  produces byte-identical output — match whatever sort/format convention
  `rivers.json`'s own build step already uses.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/tools/sceneryBuild.test.ts && npm run verify; rc=$?; echo rc=$rc`
Expected: `rc=0`.

- [ ] **Step 6: Commit**

```bash
git add tools/scenery/build.ts \
  content/scenery/NOTICE.md content/scenery/places.json \
  tests/tools/sceneryBuild.test.ts
# NOT tools/scenery/cache/places-overpass.json -- gitignored, matching
# binahaan.json/daguitan.json's existing precedent.
git commit -m "Plan 13d task 1: Overpass extraction -- towns, roads, places.json"
```

---

## Task 2: Roads on the river mask's second channel

**Files:**
- Modify: `src/render/terrain/rivers.ts`
- Modify: `src/render/terrain/surface.ts`
- Test: `tests/render/scenery.test.ts` (extend the existing river-mask
  coverage; do not duplicate a new file for this)

**Interfaces:**
- Consumes: `content/scenery/places.json`'s `roads` array (Task 1).
- Produces: `ROAD_PATHS` (mirroring `RIVER_PATHS`'s existing shape exactly);
  `createRiverMask()`'s returned `texture` becomes `RGFormat`; `nearRiver`
  keeps its exact existing signature and behavior, now reading channel 0 of
  an interleaved array.

- [ ] **Step 1: Write the failing tests**

Add to `tests/render/scenery.test.ts`, right after the existing "places
rivers north and west of the gulf origin" test:

```ts
it('places roads without disturbing nearRiver -- Plan 13d widens the mask, it does not move the rivers', () => {
  // Re-run the EXACT same assertions the existing river-placement test
  // above makes (river points read true, their mirror reads false, the
  // Tacloban runway centre reads false) -- if this test and the one above
  // it both pass, the channel-count change did not regress river placement.
})

it('reads the road channel at a known Maharlika Highway point, and false off it', () => {
  const m = riverMask()
  const [lon, lat] = /* the first coordinate of any road in RIVER_PATHS-equivalent ROAD_PATHS */
  const p = toLocal(lat, lon)
  // assert the mask's green channel at p is above the same threshold
  // nearRiver uses for red (24), and near-zero far from any road
})

it('measures the combined mask\'s texel size and asserts it is still finer than a 38 m river\'s two-texel minimum', () => {
  const m = riverMask()
  expect(Math.max(m.stepX, m.stepZ) * 2).toBeLessThan(38)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/render/scenery.test.ts`
Expected: FAIL — no road channel exists yet.

- [ ] **Step 3: Implement**

```ts
// src/render/terrain/rivers.ts
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGFormat } from 'three'
import { toLocal } from '../../sim/world/projection.js'
import riverData from '../../../content/scenery/rivers.json'
import placesData from '../../../content/scenery/places.json'

export const RIVER_PATHS = riverData.map(r => ({
  name: r.name, widthM: r.widthM,
  points: r.coordinates.map(p => toLocal(p[1]!, p[0]!)),
}))

export const ROAD_PATHS = placesData.roads.map(r => ({
  name: r.name, widthM: r.widthM,
  points: r.coordinates.map(p => toLocal(p[1]!, p[0]!)),
}))

function paint(
  paths: readonly { readonly widthM: number; readonly points: readonly { x: number; z: number }[] }[],
  data: Uint8Array, channel: 0 | 1, size: number,
  minX: number, minZ: number, stepX: number, stepZ: number, bankM: number,
): void {
  for (const path of paths) for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1]!, b = path.points[i]!
    const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz
    if (len2 === 0) continue
    const radius = path.widthM / 2 + bankM
    const c0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - radius - minX) / stepX))
    const c1 = Math.min(size - 1, Math.ceil((Math.max(a.x, b.x) + radius - minX) / stepX))
    const r0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - radius - minZ) / stepZ))
    const r1 = Math.min(size - 1, Math.ceil((Math.max(a.z, b.z) + radius - minZ) / stepZ))
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const px = minX + (c + 0.5) * stepX - a.x, pz = minZ + (r + 0.5) * stepZ - a.z
      const t = Math.max(0, Math.min(1, (px * dx + pz * dz) / len2))
      const distance = Math.hypot(px - t * dx, pz - t * dz)
      const value = Math.round(255 * Math.max(0, Math.min(1, (radius - distance) / bankM)))
      const index = (r * size + c) * 2 + channel
      data[index] = Math.max(data[index]!, value)
    }
  }
}

export function createRiverMask(size = 4096) {
  const allPoints = [...RIVER_PATHS, ...ROAD_PATHS].flatMap(r => r.points)
  const minX = Math.min(...allPoints.map(p => p.x)) - 256
  const minZ = Math.min(...allPoints.map(p => p.z)) - 256
  const width = Math.max(...allPoints.map(p => p.x)) + 256 - minX
  const depth = Math.max(...allPoints.map(p => p.z)) + 256 - minZ
  const stepX = width / size, stepZ = depth / size
  const data = new Uint8Array(size * size * 2)
  const bankM = Math.max(stepX, stepZ) * 1.5
  paint(RIVER_PATHS, data, 0, size, minX, minZ, stepX, stepZ, bankM)
  paint(ROAD_PATHS, data, 1, size, minX, minZ, stepX, stepZ, bankM)
  const texture = new DataTexture(data, size, size, RGFormat)
  texture.name = 'Leyte-river-road-surface-mask'
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return { texture, minX, minZ, width, depth, stepX, stepZ, size, data }
}

let mask: ReturnType<typeof createRiverMask> | undefined
export function riverMask(): ReturnType<typeof createRiverMask> {
  return mask ??= createRiverMask()
}

export function nearRiver(x: number, z: number): boolean {
  const m = riverMask()
  const col = Math.floor((x - m.minX) / m.stepX), row = Math.floor((z - m.minZ) / m.stepZ)
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const c = col + dc, r = row + dr
    if (c >= 0 && c < m.size && r >= 0 && r < m.size && m.data[(r * m.size + c) * 2]! > 24) return true
  }
  return false
}
```

Update the doc comment on the old `bankM` line (design §7's own quality
concern): once real numbers exist, replace "texels are about 9 x 8 m" with
the actually-measured `stepX`/`stepZ` over the combined river+road extent —
do not leave the old, now-possibly-wrong figure standing (this repo's own
rule on dated, re-measured claims).

In `src/render/terrain/surface.ts`, near the existing river-mask sample
(around line 156-158), add the road read and a dry-earth blend:

```ts
  const rivers = riverMask()
  const uv = xz.sub(vec2(rivers.minX, rivers.minZ)).div(vec2(rivers.width, rivers.depth))
  const mask = texture(rivers.texture, uv)
  // existing river blend using mask.r stays exactly as it is; add:
  const roadWeight = mask.g
  const roadColour = vec3(0.42, 0.36, 0.27) // dry earth, matching the design's own description
  // blend roadColour into the terrain colour by roadWeight, at whatever
  // point in this function the existing river blend happens, following the
  // same mix() pattern already used for forest/cropland/mangrove weights
  // above it in this file rather than introducing a new blending style
```

(Read `surface.ts`'s existing river-blend code in full before this edit —
the sketch above shows the sampling and colour only; match the exact `mix`/
ordering convention already used a few lines above for `fractions.r`/
`fractions.b`/`fractions.g` so the road blend composites correctly with
whatever the river blend already contributes at the same pixel.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run verify; rc=$?; echo rc=$rc`
Expected: `rc=0`. If the texel-size assertion in Step 1 fails (the combined
extent coarsens texels past the 38 m/2 threshold), do NOT loosen the test —
switch `createRiverMask`'s default `size` argument to a larger value first
(the design's own fallback is dropping to 2048² for a DIFFERENT reason,
smaller memory footprint at the cost of resolution; if the actual problem
measured here is resolution, not memory, a larger size is the correct fix
and keeps the resolution decision Mark actually made). Record whichever
number ships, and why, in this task's commit message.

- [ ] **Step 5: Commit**

```bash
git add src/render/terrain/rivers.ts src/render/terrain/surface.ts \
  tests/render/scenery.test.ts
git commit -m "Plan 13d task 2: roads on the river mask's second channel"
```

---

## Task 3: Towns as deterministic hut rings

**Files:**
- Modify: `src/render/scene/airfield.ts` (extract `drawBuilding` to take
  world coordinates instead of airfield-local ones via its closure-captured
  `at()`)
- Create: `src/render/scene/buildings.ts` (the extracted, shared
  `drawBuilding`)
- Create: `src/render/scene/towns.ts`
- Modify: `src/render/main.ts` (construct town handles alongside
  `airfieldHandles`, around line 1549)
- Test: `tests/render/scenery.test.ts`

**Interfaces:**
- Produces: `drawBuilding(collector, b: { kind: 'hangar'|'tower'|'hut'|'aaa'; x: number; z: number; width: number; length: number }, field: TerrainField): number`
  (world-space `x`/`z` now, not airfield-local) — `createAirfield` and
  `createTowns` both call this.
- Produces: `createTowns(field: TerrainField, places: { towns: readonly Town[] }, airfields: readonly Airfield[]): TownsHandle` —
  called once from `main.ts` alongside `createAirfield`.

- [ ] **Step 1: Write the failing tests**

```ts
// add to tests/render/scenery.test.ts
describe('towns (Plan 13d)', () => {
  it('places every town/village on land, outside every airfield clearing, deterministically by node id', () => {
    // Build twice from the same places.json + field; assert every hut
    // position is identical between runs (seeded from the OSM node id, not
    // Math.random), heightAt(field, hut.x, hut.z) > 0.5 for every hut, and
    // no hut falls inside any airfield's clearing rect.
  })

  it('gives a town three rings and a village one', () => {
    // Count hut instances per settlement size and assert the 3:1 ratio
    // design §7 specifies.
  })

  it('clears trees from each hut footprint, the same way the airfield\'s huts already do', () => {
    // Mirror whatever assertion tests/render/scenery.test.ts already makes
    // for Tacloban's own AIRFIELD_HUTS tree-clearing, applied to a town hut.
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/render/scenery.test.ts`
Expected: FAIL — `createTowns` does not exist yet.

- [ ] **Step 3: Implement**

Read `src/render/scene/airfield.ts`'s `drawBuilding` (lines 180-252) and its
closure-captured `at()`/`field` in full before editing. Move it to
`src/render/scene/buildings.ts`, changing its signature to take world `x`/`z`
directly (the caller does the airfield-local-to-world transform via `at()`
BEFORE calling, rather than `drawBuilding` doing it internally) and to take
`field: TerrainField` as an explicit parameter instead of a closure capture
(needed for `heightAt` inside it). Update `createAirfield`'s own call sites
to pass `at(b.x, b.z)`'s result and `field` explicitly. Widen the parameter
type to include `'aaa'` too if Plan 9 (which runs before this plan in
tonight's order) has not already done so — check `Building`'s current kind
union in `src/sim/world/airfields.ts` before deciding whether this is
already done.

```ts
// src/render/scene/towns.ts
import type { TerrainField } from '../../sim/world/terrain.js'
import { heightAt } from '../../sim/world/terrain.js'
import { toLocal } from '../../sim/world/projection.js'
import type { Airfield } from '../../sim/world/airfields.js'
import { drawBuilding } from './buildings.js'
// ...makeCollector / batched / whatever createAirfield already imports for
// merged-mesh construction -- reuse the SAME helpers, do not reimplement.

export type Town = { readonly name: string; readonly lat: number; readonly lon: number; readonly size: 'town' | 'village'; readonly source: string }

/** A small, seeded PRNG so hut placement is deterministic across builds --
 *  mulberry32, the same generator `src/sim/rng.ts` already uses elsewhere in
 *  this codebase, seeded from the settlement's own OSM node id (design §7:
 *  "seeded from the node id"). */
function seededRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const inClearing = (x: number, z: number, airfields: readonly Airfield[]): boolean =>
  airfields.some((a) => a.clearing !== null &&
    Math.abs(x - a.clearing.x) < a.clearing.widthM / 2 &&
    Math.abs(z - a.clearing.z) < a.clearing.lengthM / 2)

export function createTowns(field: TerrainField, places: { readonly towns: readonly Town[] }, airfields: readonly Airfield[]) {
  // Extract the OSM node id from each town's `source` URL
  // (".../node/<id>") -- the same id design §7 already uses as the hut
  // ring's seed and as the town's own stable identity.
  const idFrom = (source: string): number => Number(source.split('/').pop())

  for (const town of places.towns) {
    const centre = toLocal(town.lat, town.lon)
    if (heightAt(field, centre.x, centre.z) <= 0.5) continue // off-map or underwater node: skip rather than place in the sea
    const rng = seededRng(idFrom(town.source))
    const rings = town.size === 'town' ? 3 : 1
    for (let ring = 0; ring < rings; ring++) {
      const radius = 30 + ring * 35
      const hutsInRing = 5 + ring * 3
      for (let i = 0; i < hutsInRing; i++) {
        const angle = (i / hutsInRing) * Math.PI * 2 + rng() * 0.3
        const x = centre.x + Math.cos(angle) * radius
        const z = centre.z + Math.sin(angle) * radius
        if (heightAt(field, x, z) <= 0.5) continue
        if (inClearing(x, z, airfields)) continue
        drawBuilding(/* collector */ undefined as never, { kind: 'hut', x, z, width: 5, length: 6 }, field)
        // (wire into the same makeCollector/batched/tree-clearing pattern
        // createAirfield already uses for its own huts -- read that
        // function's surrounding code, since the exact collector/handle
        // plumbing is established there and must be mirrored, not
        // reinvented.)
      }
    }
  }
}
```

(The `drawBuilding(undefined as never, ...)` line above is a placeholder for
the real collector wiring — replace it with the actual `makeCollector`/
merged-mesh/tree-clearing sequence `createAirfield` already establishes,
read in full during Step 3 before this function is finished. This plan
specifies the placement math and the reuse target precisely; the merged-mesh
plumbing itself must be copied from the working example already in this
file, not invented fresh.)

Wire into `src/render/main.ts` alongside the existing
`createAirfield`/`createRunway` construction (line 1549):

```ts
      const towns = createTowns(arrived, placesData, next.world.airfields)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run verify; rc=$?; echo rc=$rc`
Expected: `rc=0`.

- [ ] **Step 5: Commit**

```bash
git add src/render/scene/airfield.ts src/render/scene/buildings.ts \
  src/render/scene/towns.ts src/render/main.ts tests/render/scenery.test.ts
git commit -m "Plan 13d task 3: towns as deterministic hut rings"
```

---

## Task 4: Dulag's real buildings

**Files:**
- Modify: `content/bases/dulag.json`
- Test: `tests/render/scenery.test.ts`

**Interfaces:**
- Modifies content only; no signature changes. `createRunway`/`createAirfield`
  already take an `Airfield` record generically (confirmed: neither is
  Tacloban-specific today) — this task supplies real data, not new code.

- [ ] **Step 1: Write the failing test**

```ts
it('Dulag has its own real building layout, not Tacloban\'s copied one (Plan 13d)', () => {
  const dulab = /* load content/bases/dulag.json */
  const tacloban = /* load content/bases/tacloban.json */
  const dulagIds = new Set(dulab.buildings.map((b: { id: string }) => b.id))
  const taclobanIds = new Set(tacloban.buildings.map((b: { id: string }) => b.id))
  expect([...dulagIds].some((id) => taclobanIds.has(id))).toBe(false)
  expect(dulab.buildings.length).toBeLessThan(tacloban.buildings.length) // "a smaller set", design §7
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/render/scenery.test.ts`
Expected: FAIL — `dulag.json`'s buildings are still Tacloban's, verbatim.

- [ ] **Step 3: Implement**

Replace `content/bases/dulag.json`'s `buildings` array with a smaller,
Dulag-appropriate set (a hastily-established fighter strip per the design's
own citation — the 475th Fighter Group arrived 28 October 1944 "shortly
after the Leyte Landing" — so one or two small hangars/maintenance huts and
no control tower is the historically plausible minimum, not a full base):

```json
  "buildings": [
    { "id": "dulag-hangar-1", "kind": "hangar", "x": -110, "z": -60, "widthM": 22, "lengthM": 28, "hp": 90 },
    { "id": "dulag-hut-1", "kind": "hut", "x": -95, "z": -20, "widthM": 5, "lengthM": 6, "hp": 20 }
  ],
```

Leave `dulag.json`'s `apron`/`clearing` fields as `null` if they are
already `null` (confirm by reading the file first) — a hastily-built 1944
strip plausibly had no paved apron, which is also what keeps
`airfield.ts`'s taxiway/clutter code correctly silent for Dulag without
needing a Tacloban-specific id check (that gate, per its own "13d
parameterizes them" comment, should already read `airfield.apron !== null`
rather than `airfield.id !== 'tacloban'` once Task 3 or this task updates
it — confirm which task actually made that change, since Task 3's own scope
was towns, not this gate; if neither task touched it, do it here, since this
is the task that actually has a second airfield to prove it against).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run verify; rc=$?; echo rc=$rc`
Expected: `rc=0`. Confirm `tests/render/scenery.test.ts`'s existing "draws
its own buildings and huts, but not Tacloban's taxiways, stores or
windsock" test for Dulag still passes — Dulag should still show no
taxiways/clutter, now because `apron === null` generically, not because of
a hardcoded id check.

- [ ] **Step 5: Commit**

```bash
git add content/bases/dulag.json src/render/scene/airfield.ts tests/render/scenery.test.ts
git commit -m "Plan 13d task 4: Dulag's real 1944 building layout"
```

---

## Task 5: Reference-GPU acceptance

**Files:**
- Extend or create a `tests/e2e/` spec, per design §9 Tier 2

**Interfaces:** none new; this task only observes.

- [ ] **Step 1: Capture screenshots**

Per design §9 Tier 2: screenshots of the Tacloban shore, the Leyte Valley
and Dulag, and the serialized render budget after this plan lands (into
`tests/e2e/terrain.spec.ts`'s existing table, per design §8, if that table
already exists and this plan's changes are cheap enough not to need a new
row — a filtered texture read and some extra static merged-mesh geometry,
same order of cost the design doc itself estimates in §8). Read
`tests/e2e/terrain.spec.ts` first to match its existing screenshot/budget
pattern exactly rather than inventing a new spec file for this.

```sh
ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org \
  npx playwright test tests/e2e/terrain.spec.ts
```

- [ ] **Step 2: Read the screenshots yourself**

Per this repo's own rule and this project's "keep Mark out of the loop"
convention (`~/projects/ww2airsim/CLAUDE.md`): the executing agent reads
every screenshot itself before claiming success — roads visible as a dry
earth line along the coast, huts clustered at Tacloban/Ormoc/villages,
Dulag showing its own smaller building set, no tree floating over a hut
roof, no visible river regression from Task 2's channel widening.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/terrain.spec.ts
git commit -m "Plan 13d task 5: reference-GPU acceptance for places"
```

---

## Closing this plan

Write `docs/handoff/2026-09-23-plan13d-places.md` (what landed, Tier 1
`rc=0` evidence, Tier 2 screenshots and the measured budget row, commits,
remaining work — explicitly note the road-width assumption from Task 1 and
the mask-resolution outcome from Task 2's Review Focus item). Update master
spec §15's Plan 13d row (currently "Not started") to record completion.
Do not push `main` or deploy.
