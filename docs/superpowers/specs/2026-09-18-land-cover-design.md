# Plan 13b–13d: land cover, coastline and places — design

Written 2026-09-18 from a brainstorm with Mark on 2026-09-17, after Plan
13a hardened Codex's first surface-detail pass
([handoff](../../handoff/2026-09-17-plan13a-hardening.md)). Master spec
§15's table is the authoritative numbering; this document covers the three
remaining sub-plans of Plan 13 and nothing else. Every number here was
measured on 2026-09-17 unless it says otherwise; where a claim crosses into
another system it names the file that owns it.

## 1. What this builds, and the three decisions it rests on

Codex's pass (`daa1b39`) paints Leyte from noise and height: forest where a
2.8 km noise field says so and everywhere above 220 m, sand in a 0.4–2.3 m
height band, two rivers traced from OpenStreetMap, a base at Tacloban. It
looks like *an* island. Mark got airborne and could not find the airfield.

Three answers from Mark fix the shape of the remainder:

1. **13b's job is "navigable from the air."** Leyte should be recognisable at
   cruise: paddy plains, jungle hills, mangrove shore, cropland where it
   really is. Close-in flare texture is secondary and Codex's procedural
   detail already carries it.
2. **13c rebuilds the DEM coast so the simulation and the picture agree.**
   The simulation decides water against land from the same heightfield the
   renderer draws (`SEA_LEVEL_M` in `src/sim/world/terrain.ts`). A finer
   visual shoreline the simulation did not share would ditch the airplane on
   what looks like sand. So the shoreline moves in the data, once, offline.
3. **13d places are a 1944-plausible subset.** Municipal towns, the coastal
   highway, and a Dulag strip. Modern subdivisions and secondary roads are
   omitted.

One offline pipeline feeds all three (§3). Nothing here touches `src/sim/`
except through the heightfield it already reads.

## 2. The data

**ESA WorldCover 2021 v200**, 10 m, eleven classes, CC BY 4.0. Two tiles
cover the 200 km box centred on 10.8 N 125.3 E (master spec §4):
`N09E123` (30.9 MB) and `N09E126` (2.5 MB), fetched anonymously from
`https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/`, no
account needed (verified 2026-09-17 with a HEAD request; the deleted AWS
account is irrelevant to a public bucket). Cached under
`tools/landcover/cache/`, which `.gitignore`'s `/tools/**/cache/` already
covers, and digest-pinned the way `tests/tools/terrainBuild.test.ts` pins
the Copernicus tiles.

Measured over the box on 2026-09-17 at the tiles' 74 m overview:

| Class | Share of box |
| --- | --- |
| water (80) | 59.2% |
| tree cover (10) | 28.2% |
| no data (open ocean beyond coverage) | 7.9% |
| cropland (40) | 2.0% |
| grassland (30) | 1.7% |
| mangroves (95) | 0.7% |
| built-up (50) | 0.3% |
| bare, wetland, shrub | under 0.1% each |

A transect east from Tacloban airfield along 11.228 N reads built-up at the
airfield, then 26 samples of water across San Pedro Bay, then tree cover:
the water class is a clean shoreline at 10 m, roughly three times finer than
the 30 m DEM and finer than the 24.4 m terrain grid.

**The known compromise, from master spec §4, is applied at build time and
nowhere else:** the data is modern. Built-up pixels count as cropland,
because Leyte's towns sat in paddy country in 1944 and 0.3% of the box is
not worth a class of its own. No other class is altered.

Attribution, as CC BY 4.0 requires it and as `ASSETS.md` already promises
("to be recorded with the pipeline, before first use"): a
`content/landcover/NOTICE.md` with the exact wording ESA asks for, an
`ASSETS.md` row, and "ESA WorldCover" added to the credits line in the `/`
controls panel (`src/render/legend.ts`), which `d4639fc` created for the
OpenStreetMap rivers. Nothing on the play screen: Mark's rule.

## 3. The land pipeline: one reader, three consumers

`tools/landcover/build.ts`, run as `npm run landcover:build`, a sibling of
`terrain:build` and `bathy:build` and deliberately not folded into either.
It splits into:

- **`tools/landcover/sample.ts`** — reads the cached tiles with the `geotiff`
  package the terrain build already uses (`tools/terrain/build.ts`), indexes
  them in one global 10 m posting grid across the tile seam, and answers two
  questions for any tangent-plane cell: the fraction of each class inside it,
  and whether its water is **sea-connected** (§6). This is the only code that
  knows WorldCover's class numbers.
- **`tools/landcover/build.ts`** — writes the coverage raster (§4). Consumer
  one.
- **`tools/terrain/build.ts`** — calls `sample.ts` between `resample` and
  `buildPyramid` to rebuild the coast (§6). Consumer two.
- **`tools/scenery/build.ts`** — unchanged by 13b; grows in 13d (§7).
  Consumer three only in the sense that its places must land on the same
  ground.

The runtime uses only bundled data. No network, no tiles, no COG reads in
the browser: the same rule the rivers follow.

## 4. The coverage raster

`content/landcover/cover.bin.gz` plus `content/landcover/header.json`, on the
terrain's tangent-plane grid with the terrain's conventions (row 0 north,
column 0 west, `tools/terrain/resample.ts`'s `gridToLocal`):

| Property | Value | Why |
| --- | --- | --- |
| Samples | 1025 × 1025 | 195 m per sample, the same grid as terrain L3 |
| Channels | 4 × 8-bit: tree, cropland, mangrove, open ground | Fractions of the 10 m pixels in the cell; open ground is grassland + shrubland + bare; cropland includes the corrected built-up; water is the remainder |
| Quantisation | 16 levels per channel | Compresses 3× better than 256 with no visible step at 195 m |
| Wire | 247.6 KiB gzipped (measured 2026-09-18, the shipped `cover.bin.gz`: 253,532 bytes); 4 MiB raw | Terrain's whole wire is 702 KiB; 2049² would be 823 KiB and was declined |
| Delivery | fetched like a terrain level (`src/render/content.ts`), inflated with `DecompressionStream('gzip')` | No nginx dependency; the served `.gz` is the committed file |

Fractions rather than a class index because they filter linearly: one
`texture()` sample per fragment with `LinearFilter` gives smooth class
blends at every zoom with no dither and no second sample. A class index
would need nearest sampling and a hand-rolled blend at every boundary.

Why 195 m and not 98 m: "navigable from the air" is decided by plains,
hillsides and shores that are kilometres across; the 2% of the box that is
cropland is the Leyte Valley and the coastal plain, not 100 m patches. Below
about 500 m Codex's procedural detail carries the picture and the raster
only chooses which detail. The 2049² option costs 3.2× the wire for detail
the pilot cannot use, and can be revisited with a one-line change to the
build if 13c's shore or 13d's roads want it.

GPU: one 1025² RGBA8 texture, 4 MiB, mipmapped. The CPU keeps the same
`Uint8Array` for tree placement, as `rivers.ts` keeps its mask for
`nearRiver`.

## 5. Materials and trees

`src/render/terrain/surface.ts` keeps everything Codex built as *texture
within a class* and takes the *class weights* from the raster instead of
from noise and height:

- forest weight = tree fraction (today: a 2.8 km noise threshold, or any
  height above 70–220 m);
- a cropland colour and a paddy grain (Codex's `patches` noise at a shorter
  scale) weighted by the cropland fraction — this is what makes the Leyte
  Valley read as fields;
- a mangrove colour, dark and wet, weighted by the mangrove fraction, which
  is what makes the shore south of Tacloban read as mangrove rather than
  beach;
- open ground stays Codex's sand or soil by height and slope; the beach band
  stays a height band, because after 13c the height *is* the shoreline.

The slope-driven rock and the no-snow-line rule are untouched. The river
mask stays as it is.

Tree placement (`src/render/scene/vegetation.ts`, `treeSites`) reads the
raster on the CPU: a candidate survives with probability equal to the
local tree fraction, so jungle is dense, paddies are bare and grassland is
sparse. Mangrove counts as tree cover for placement and its shore exclusion
is lifted: today `y < 3` forbids every tree within 3 m of sea level, which
is exactly where mangroves grow. The determinism the tests already pin
(same cell, same forest) is preserved because the raster is data, not
state.

Every one of these is verified against the Earth, not against the pipeline
(§9).

## 6. The coastline rebuild

**The hook.** `tools/terrain/build.ts:172-175` is the only seam between the
sampled finest grid and the mips: `const finest = resample(sample)` then
`buildPyramid(finest, GRID.samples)`. A `reshapeCoast(finest, sampler)` runs
between them and propagates into every level. No other terrain code changes.

**Sea-connectivity first.** WorldCover's water class includes rivers, lakes
and reservoirs. Setting inland water to sea level would dig Lake Danao, at
about 600 m, into a 600 m hole and hand the simulation a lake it thinks is
the sea. So `sample.ts` flood-fills water outward from the box boundary at
the tiles' 20 m overview (10,000 × 10,000, a `Uint8Array` queue, seconds in
node) and treats only water reached by that fill — plus no-data, which is
open ocean beyond coverage — as **sea**. Rivers and lakes keep the DEM's
heights and the river mask keeps drawing them.

**The rule**, per finest-grid sample (24.4 m, about six 10 m pixels per
cell), with `w` the sea fraction of its pixels and `h` the DEM height in
metres:

| Condition | Result |
| --- | --- |
| `w ≥ 0.5` | 0 (sea) |
| `w < 0.5` and `h > 0` | `h`, unchanged |
| `w < 0.5` and `h ≤ 0` | `0.3 + 1.5 × (1 − w)` metres: about 1 m at the waterline, 1.8 m inland |

The third row is the DEM's zero-elevation land, which today the ocean
draws over (Plan 5's land weight demands terrain above 0). It becomes a low
shore inside the existing 0.4–2.3 m beach band, so it reads as sand. **No
negative height is ever written**, so the "L4 holds no negative values"
premise of the anti-mirror argument in `tests/tools/terrainBuild.test.ts`
stays true and the ocean's `Math.min(0, …)` depth clamp is unaffected.

**Fallout, each re-recorded rather than widened** (the pipeline survey of
2026-09-17 listed the pinning tests; this is that list with its outcome):

| What is pinned | Where | Outcome |
| --- | --- | --- |
| SHA-256 of `header.json` and nine committed levels | `tests/tools/terrainBuild.test.ts` `COMMITTED_SHA256` | Regenerated by the build; the commit that changes them says what moved |
| Sign of the four landmark heights | same file, lines 39–70 | Unchanged: Tacloban is built-up (land), the gulf and Surigao Strait are sea, Nacolod is inland |
| Tacloban ground 1.673 m | `tests/render/spawn.test.ts`, `ocean/mesh.test.ts`, `runway.test.ts` flatness | Re-measured; expected unchanged, the strip is land in both datasets |
| Per-ring LOD error tables | `tests/render/terrainLod.test.ts` | Re-run; a shore that changed by under 2 m cannot move a ring's worst error by a quantisation step, and if it does the number is re-recorded |
| Take-off and landing cards, the approach flown into Tacloban | `tests/sim/testcards/*`, `tests/sim/landing.test.ts` | Re-run unchanged; they touch only the strip |
| Local L0–L3 tiles (171 MB, gitignored) | `content/terrain/tiles/` | Rebuilt by `npm run terrain:build`; the deploy workflow's "tiles absent from dist" assertion is unaffected |

The ocean needs no change: its land weight reads terrain height
(`src/render/ocean/mesh.ts`), so waves stop at the new shore automatically.

**What 13c does not do.** It does not carve rivers, add bathymetry inshore
of the GEBCO grid, or reshape the coast beyond WorldCover's 10 m line. The
coast's *shape* becomes WorldCover's; its *heights* remain Copernicus's.

## 7. Places

Data comes from cached Overpass responses, exactly as the rivers came from
cached Nominatim responses: the queries are recorded verbatim in
`content/scenery/NOTICE.md`, the responses live in `tools/scenery/cache/`,
and `tools/scenery/build.ts` makes no network calls. Output is
`content/scenery/places.json`, which is also the data contract Plan 14's
map will read:

```json
{ "towns": [{ "name": "…", "lat": 0, "lon": 0, "size": "town" | "village", "source": "https://www.openstreetmap.org/node/…" }],
  "roads": [{ "name": "…", "widthM": 8, "coordinates": [[lon, lat], …], "source": "…" }],
  "airfields": [{ "name": "Dulag", "lat": 10.94806, "lon": 125.01028, "headingDeg": 0, "source": "…" }] }
```

**Towns.** OSM `place=city|town|municipality` nodes inside the box. Leyte's
municipalities are Spanish-era and predate the war; barangay villages are
excluded by not querying `place=village|hamlet`. Two sizes: Tacloban and
Ormoc are `town`, everything else `village`. Rendered as a deterministic
ring of huts reusing `src/render/scene/airfield.ts`'s hut geometry (a
`town` gets three rings, a `village` one), seeded from the node id, on land
(`heightAt > 0.5`), never inside the airfield clearing, and each hut's
footprint is cleared of trees the way the airfield's is.

**Roads.** OSM `highway=trunk|primary` ways inside the box: the Maharlika
Highway alignment, Tacloban – Palo – Tanauan – Dulag – Abuyog on the east
coast and the Ormoc side on the west, which follows the pre-war coastal
road. Rasterised by the river mask's capsule code into a **second channel**
of the same texture (`RGFormat` instead of `RedFormat`). That doubles the
mask's 16 MiB CPU and ~22 MiB GPU; the alternative — dropping both to
2048², 17 m texels, which still gives a 38 m river two texels — is
measured in 13d before choosing. Roads draw as a dry earth colour with a
soft edge; they cost nothing per frame beyond the channel read.

**Dulag.** `createRunway` in `src/render/scene/runway.ts` is generalised
from a Tacloban constant to a centre and heading, and `airfield.ts`'s
buildings become a parameter list so Dulag gets a smaller set. Coordinate
10.94806 N 125.01028 E, world (−31629, −16479), 31 km south of Tacloban,
from the English Wikipedia article on Dulag Airfield (read 2026-09-17),
which records it seized "shortly after the Leyte Landing" with the 475th
Fighter Group arriving 28 October 1944. **The heading is an assumption**:
the article gives none, and north–south along the coastal plain is used
until a period photograph says otherwise; it is recorded as such in the
places file's comment. The spawn, the approach autopilot and every test
card stay at Tacloban.

## 8. Tiers and the budget

13a's serialized sampler (`src/render/main.ts`) is the only instrument
trusted for these numbers. Expected costs, to be measured at 1440p over
Leyte and recorded in `tests/e2e/terrain.spec.ts`'s table:

- the raster is one filtered sample per fragment; the river mask, the same
  kind of sample, measured 0.1 ms;
- tree density changes the instance count both ways (denser jungle, empty
  paddies); the 69-cell disc's cap is unchanged;
- huts and a second strip are static merged meshes like the Tacloban base,
  which measured under the sampler's resolution.

The 6.0 ms budget stands unless a measurement says otherwise, and then it is
re-derived with the table, never widened to pass. Scenery tiers
(`src/render/scene/tiers.ts`) gain nothing: no new cost here scales.

## 9. Testing

The rule from 13a and from the mirror: **compare the pipeline with the
Earth, not with itself.** Every coordinate below is sourced independently
of the pipeline and cited in the test.

Tier 1 (`npm run verify`):

- `tests/tools/landcoverBuild.test.ts`: the raster at Tacloban airfield is
  open ground, not tree; a Leyte Valley point is cropland-dominant; a point
  in the hills is tree-dominant; a point on the mangrove shore south of
  Tacloban has mangrove above zero; open water is all-zero. Digest of the
  committed raster pinned like the terrain's.
- `tests/tools/terrainBuild.test.ts`: the coast rule on a synthetic grid (the
  three rows of §6's table); sea-connectivity keeps a synthetic lake; on
  the real build, a point WorldCover calls sea and the old DEM called land
  reads 0, and Lake Danao's height is unchanged from the previous build.
- `tests/render/scenery.test.ts`: tree survival tracks the raster (a paddy
  cell yields fewer sites than a jungle cell); places are on land, off the
  runway, and deterministic; the Dulag strip's centre projects to the
  sourced coordinate.
- `tests/build/dist.test.ts`: the raster and notice ship, the places file
  ships, the play screen has no credit.

Tier 2 (reference desktop, through the tunnel in `README.md`):

- the serialized budget after each sub-plan, numbers into the table;
- the validation-error sweeps, which are what caught 13a's invisible trees;
- screenshots of the Tacloban shore, the Leyte Valley and Dulag that the
  executing agent reads itself. Mark stays out of the loop; he flies it when
  he wants to.

## 10. Non-goals

Stated so they are not drifted into:

- No ESA WorldCover at 10 m on the GPU. 195 m is the design; §4 says how to
  change it.
- No inland water surface: rivers and lakes are colour, as today.
- No collision, damage or gameplay for huts, roads or the Dulag base; that
  is Plan 12's entity work.
- No modern places: subdivisions, secondary roads, the modern city extent.
- No re-tuning of the flight model or the test cards; 13c only moves the
  shore.

## 11. Assumptions recorded

- Dulag's runway heading (§7).
- The built-up-to-cropland correction (§2) is the only 1944 correction.
- The shore height formula (§6) is a reading convention for the beach band,
  not a measurement; if the Tier 2 screenshots show a visible step at the
  waterline it is re-derived there.

## 12. The three sub-plans

Each gets its own implementation plan via the writing-plans skill, is
executed and merged before the next starts, and ends with a Tier 2 run and
a dated handoff:

| Sub-plan | Delivers | Sections |
| --- | --- | --- |
| 13b | `tools/landcover/`, the raster, NOTICE and credit, materials and tree density | §2–5, §8–9 |
| 13c | the terrain hook, the rebuilt coast, regenerated digests and goldens, the re-run cards | §6, §9 |
| 13d | Overpass extraction, places file, towns, roads, Dulag | §7, §9 |

13b before 13c because the sampler 13c needs is 13b's; 13d last because its
places must sit on 13c's shore and 13b's fields.
