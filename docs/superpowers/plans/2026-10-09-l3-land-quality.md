# L3: land render quality, with Blender and the DEM both on the table

**Status:** proposed 2026-10-09, not started.
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

In the L2 A/B captures I did **not** see a river at all. Whether rivers are a visible fault is unmeasured. Phase 0 settles that before anything is built.

## Phase 0: find the real faults (no code changes to the renderer)

A fix needs a test that can fail first. Capture a fixed set of views with the legend hidden (`/`) and default clouds off, using the `beachesCapture.spec.ts` pattern (`E2E_CAPTURE=1`, paused `sceneryView=1`), at Low/L1 and Medium/L0:

1. river mouth, 2. a river reach inland, 3. a road crossing flat land, 4. forested hills, 5. a ridgeline, 6. a flat plain with field-scale cover change.

Then measure, in a script, not by eye:

- **Canopy bias:** compare the DEM profile across a forest edge with the WorldCover tree fraction. A step in height that lines up with a cover boundary is canopy, not terrain.
- **River incision:** the OSM rivers are 125 to 150 ft wide, about 1.5 to 2 grid posts. Sample the DEM across each. A river that is not a visible valley in the heights is a render problem the ribbon can fix; one that is a valley is already in the data.
- **Resample kernel:** rebuild one tile with bicubic and difference it against the shipped bilinear result. If the difference is under about 3 ft RMS, kernel choice is not worth a regeneration.

Output: `docs/handoff/2026-10-xx-l3-phase0.md` with the captures and a go/no-go per phase below. **Phases 1 to 4 each run only if Phase 0 shows their fault.**

## Phase 1: rivers and roads as Blender ribbons (Blender, no DEM change)

Reuse the L2 pipeline: `tools/shoreline/` generates a deterministic GLB from committed data via `beaches.py`, rebuilt byte-for-byte in a test. Do the same for `rivers.json` and `places.json`.

- Smooth the polylines, drape them on the L1 contour heights, taper banks, and overlap more than one L1 cell each side (the L2 finding: a narrow smooth line does not hide the square terrain silhouette).
- Tile the GLB into draw calls the way beaches are (134 tiled draw calls at 11 MB). Rivers and roads are far smaller than the coast.
- **Remove the 8192 x 8192 mask** and its boot-time CPU paint, if the ribbons make it redundant. That frees about 179 MB of texture memory and is the budget payment for the new draw calls.
- Keep `nearRiver()` working: generate a small CPU lookup (a coarse grid or the polylines themselves) from the same source so tree placement is unchanged. A test asserts the same trees are excluded before and after.
- DEV switch `?ribbons=off` for exact A/B, as `?beaches=off`.

Pass: A/B at the six views, zero WebGPU validation errors, High at altitude still under 8.33 ms p95, and net texture memory down.

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

0, then 1 and 2 in parallel (independent), then 3 informed by 0 to 2, then final A/B. Every phase ends at the same gate: `npm run verify` through `remote-run`, and the budget specs under `hwlock ryzen-budget`, on the ryzen reference GPU. The suite is not allowed to become the only verification; the Phase 0 measurements are rerun at the end and must show the faults gone.

## Not doing

- Re-meshing the whole terrain in Blender: it grows triangles and draw calls on a High tier already at the budget limit, and L2 showed overlays do better.
- New elevation data: no free global source beats GLO-30 here. Anything that looks like added detail is invented, and is labelled as such.

## Open questions

- Is the river and road mask a **visible** problem, or only a memory one? (Phase 0.)
- Is the resample kernel worth a full regeneration of 13 levels? (Phase 0.)
- Acceptable `heightAt` movement for Phase 3? Needs a number from Mark before 3a to 3c merge.
