# L3: land render quality, with Blender and the DEM both on the table

**Status:** proposed 2026-10-09, not started. **Revised the same day after Mark's correction: Phase 1 (rivers and roads as ribbons) is withdrawn.** Rivers and roads were already explored and gave no quality gain (below). What remains is unvalidated and needs Mark's direction before any work starts.
**Viewing checkpoint (Mark, 2026-10-09):** final product only.
**Run mode (Mark, 2026-10-09):** unattended. Run to completion; collect captures in the handoff.
**Location (Mark, 2026-10-09):** a worktree, never `main` in place.
**Precedent:** L2 curved beaches ([design](../specs/2026-10-09-curved-beaches-design.md), [handoff](../../handoff/2026-10-09-curved-beaches.md)). The lesson from L2 is that a render-only overlay beat touching the DEM for *silhouettes*. This plan does not assume that holds for everything: Phase 3 decides about the DEM on measurements.

## What is known (read from the repo 2026-10-09)

| Fact | Where | Why it matters |
| --- | --- | --- |
| Heights are Copernicus GLO-30 (98 ft native) resampled **bilinear** to an 80 ft grid | `docs/terrain.md`, `tools/terrain/build.ts` | No real detail below 98 ft exists. Bilinear resampling is the softest option; a better kernel is free. |
| Copernicus GLO-30 is a **surface** model (canopy and buildings included) | upstream dataset definition, not yet measured here | Forests may be bumps in the "ground". Needs a measurement, not an assumption. |
| Rivers and roads are a 8192 x 8192 two-channel mask painted on the CPU at boot | `src/render/terrain/rivers.ts` | About 134 MB (about 179 MB with mips) of texture for **8 rivers and 208 roads**. Texels are about 16 x 55 ft (4.9 x 16.9 m in the code), so non-square. |
| The same mask drives `nearRiver()` for tree placement | `rivers.ts` | Any replacement must keep a CPU-side "is this near water" answer. |
| Land cover is ESA WorldCover fractions at **1025 samples over 200 km** (about 640 ft cells) | `content/landcover/header.json` | The WorldCover source is 33 ft. We ship it 20x coarser, so cover boundaries cannot follow rivers or coasts. |
| `L0` is 134 MB and `L0`-`L3` are gitignored; source tiles are in `tools/terrain/cache` | `docs/terrain.md`, `AGENTS.md` | A DEM change is a regeneration of large local-only data. Never `git clean -fdx`. |
| High at altitude is at **8.114 ms p95 against an 8.33 ms gate** after L2 | L2 handoff | New geometry or textures must be paid for with something removed. |

## Context that changes the framing (found after the first draft)

The visual bar here is OpenSkyFlight, and the gap to it is **ground imagery resolution**, not geometry. It drapes satellite imagery at about 1 m per pixel (zoom 18) over Terrarium heights, which in much of the world is the same class of 30 m data we have. `docs/drape.md` (2026-09-29) already tried to close that gap: Sentinel-2 at 10 m ("not great"), synthetic ground from DEM and land cover, and Sentinel-2 plus Real-ESRGAN x4 plus synthetic canopy, which Mark called "pretty good" but not OpenSkyFlight level. Free imagery at 1 m does not exist for Leyte (OpenAerialMap covers only the Tacloban core, under 1% of the map), and buying it is over the $100 cap. Whether any drape ships as a tier is still open there. So Blender and the DEM are not the main lever for "looks like OpenSkyFlight". They are levers for relief, silhouettes and trees only.

## Phase 0: find the real faults (no code changes to the renderer)

A fix needs a test that can fail first. Capture a fixed set of views with the legend hidden (`/`) and default clouds off, using the `beachesCapture.spec.ts` pattern (`E2E_CAPTURE=1`, paused `sceneryView=1`), at Low/L1 and Medium/L0:

1. river mouth, 2. a river reach inland, 3. a road crossing flat land, 4. forested hills, 5. a ridgeline, 6. a flat plain with field-scale cover change.

Then measure, in a script, not by eye:

- **Canopy bias:** compare the DEM profile across a forest edge with the WorldCover tree fraction. A step in height that lines up with a cover boundary is canopy, not terrain.
- **River incision:** the OSM rivers are 125 to 150 ft wide, about 1.5 to 2 grid posts. Sample the DEM across each. A river that is not a visible valley in the heights is a render problem the ribbon can fix; one that is a valley is already in the data.
- **Resample kernel:** rebuild one tile with bicubic and difference it against the shipped bilinear result. If the difference is under about 3 ft RMS, kernel choice is not worth a regeneration.

Output: `docs/handoff/2026-10-xx-l3-phase0.md` with the captures and a go/no-go per phase below. **Each later phase runs only if Phase 0 shows its fault.**

## Phase 0 results: the three DEM measurements (run 2026-10-09, read-only, nothing changed)

| Question | Measured | Verdict |
| --- | --- | --- |
| Is the source a surface model? | Source files are named `Copernicus_DSM_COG_10_*` (DSM). | Yes, canopy is in the heights. |
| Are rivers already valleys in the DEM? | Centerline height minus bank height (average of both banks): 8 rivers, 1,939 points, sea-level reaches excluded. At a 490 ft offset the centerline is lower than the banks by a median of **25 ft (Binahaan, 1,027 points) and 43 ft (Daguitan, 675 points)** on the two long reaches, and 100 to 154 ft on short mountain reaches. | **Yes. Rivers are in the data as valleys.** River incision (3c) is not needed. |
| Does canopy show as roughness? | Post-to-post curvature (a 3x3 Laplacian, per 640 ft cover cell) at matched slope: on flat ground forest **3.0 ft vs 1.1 ft** for crop/open (0.92 vs 0.33 m); at 3 to 8% slope 5.4 vs 3.5 ft; at 8 to 15% slope 8.3 vs 6.8 ft. | **A real but small signal** (1 to 2 ft per post), confounded because forest also sits on rougher ground. De-canopy (3b) is low value. |
| Is the bilinear resample costing detail? | Bicubic minus bilinear over a 3.9 km square: **2.5 ft RMS, 12 ft max** in hilly terrain; 0.5 ft RMS on the coastal plain. Approximate: done in lat/lon source space at the same 80 ft spacing, not through the exact tangent-plane build. | **Not worth regenerating 13 levels** for 2.5 ft on 80 ft posts. 3a is dropped. |

Conclusion for Phase 3: **the DEM is not the weak link.** Of 3a to 3d, only render-only sub-posting detail (3d) is still open, and it belongs to the ground texture question, not the heights.

## Phase 1: WITHDRAWN (rivers and roads as ribbons)

Mark remembered correctly; this was explored and did not help:

- `docs/drape.md`, 2026-09: "Scrubbing built-up areas and drawing OSM roads helped little; extra roads were disliked."
- Plan 13a hardening (2026-09-17): the river mask measured **0.1 ms** on the GPU. The 3.15 to 11.3 ms regression of that period was texture anisotropy (8.98 ms of it), not rivers.
- Plan 13d (2026-09-23): growing the mask to 8192 squared added no discernible per-frame cost; the cost is a one-time **about 171 MiB GPU** upload, accepted at the time.

So the mask is cheap per frame, and ribbons would add draw calls and geometry to a High tier at 8.11 of 8.33 ms for no visible gain. The only argument left for ribbons is reclaiming that memory, which is not a quality fix and is not worth the risk on its own. The earlier version of this plan said otherwise because I read `rivers.ts` and did not read `docs/drape.md` or the 13a/13d handoffs first.

## Phase 2: land cover at the resolution it was sourced at (not Blender)

Re-bake WorldCover at 4x the current density (for example 4097 samples, about 160 ft) in the existing cover format, and measure the download and GPU cost. This is the cheapest fix for blobby biome boundaries and is independent of Blender. If the cost is too high, bake only a coastal and river-corridor band at high density. Blender is not the right tool here; plain resampling in `tools/` is.

## Phase 3: the DEM, decided by Phase 0 numbers

Mark's question: leave the DEM on the table if it works better. These are the options, in the order I would try them. All run **offline in `tools/terrain/`** (numpy/TypeScript); Blender adds nothing for a regular grid.

| Option | What it fixes | Cost / risk |
| --- | --- | --- |
| **3a. Bicubic or Lanczos resample** | Faceting from bilinear on a 98 ft to 80 ft up-sample | Regenerate all levels. Changes `heightAt` by feet, so physics and crash heights move. Only worth it if Phase 0's difference is real. |
| **3b. De-canopy** | Forests as bumps. Blend heights toward a bare-earth estimate where WorldCover says tree/built | Invented, but physically closer to ground truth. Needs the cover raster at Phase 2 density. Changes physics. |
| **3c. River incision** | Rivers that are not valleys in the data | Carve a channel and banks along the OSM paths, with a conservative depth. Invented. Changes physics only along the rivers. |
| **3d. Sub-posting detail** | Smoothness at close range | **Render-only first**: a tileable detail normal or height map, masked by slope and cover. Baking invented detail into `L0` would move physics for no gain, so it is the last resort. |

Rule for 3a to 3c: they are **offline, deterministic, committed as a build step with a test**, and every one moves `heightAt`. Each gets a measured before/after of max and RMS height change, and the existing terrain and ground-contact tests must still pass. If a change moves crash heights by more than the physics tolerance, it needs a decision from Mark before merging, not after.

## Phase 4: tree and rock assets (separate track)

Authored in Blender, ingested per `docs/models.md` and vetted per `ASSETS.md`. Not started by this plan; listed so it is not forgotten. It is the largest visual change and the largest unknown, and it should not block Phases 1 to 3.

## Order and budget

0, then 2, then 3 informed by 0 and 2, then final A/B. Every phase ends at the same gate: `npm run verify` through `remote-run`, and the budget specs under `hwlock ryzen-budget`, on the ryzen reference GPU. The suite is not allowed to become the only verification; the Phase 0 measurements are rerun at the end and must show the faults gone.

## Not doing

- Re-meshing the whole terrain in Blender: it grows triangles and draw calls on a High tier already at the budget limit, and L2 showed overlays do better.
- New elevation data: no free global source beats GLO-30 here. Anything that looks like added detail is invented, and is labelled as such.

## Open questions

- Is the resample kernel worth a full regeneration of 13 levels? (Phase 0.)
- Acceptable `heightAt` movement for Phase 3? Needs a number from Mark before 3a to 3c merge.
