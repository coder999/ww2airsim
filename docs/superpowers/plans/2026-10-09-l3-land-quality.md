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

## Direction (Mark, 2026-10-09)

**Accuracy is not a goal.** A plausible synthetic ground is acceptable if it looks as good as OpenSkyFlight. The bar is therefore a visual one, judged by Mark's eye at the final checkpoint, plus a hard GPU budget gate. Nothing below needs to match real Leyte.

What OpenSkyFlight's look is made of, read from its own screenshot at about 13,000 ft AGL: irregular mid-scale mottling, field and parcel patterns, inhabited clusters with roads, forest grain, and tonal drift with elevation and aspect. At that altitude 1 m detail does not resolve, so the target is **mid-scale variety first, close-range grain second**. That is also what a generator can fake convincingly.

## Phase 0b: define the gap against the best we already have

Before building, put three things side by side at three altitudes (about 1,000, 4,000 and 13,000 ft), same view, legend hidden, clouds off, Low/L1:

1. shipping terrain, 2. the best existing drape (`?drape=synthsr`, `docs/drape.md`), 3. an OpenSkyFlight frame at a comparable altitude and sun.

Write down the specific deficits of (2) against (3) per altitude band (for example "no parcel structure", "forests are flat color", "no settlements"). `drape.md` already says synthsr was "pretty good", so the work is the remaining gap, not a restart. This is a capture and a table, not code.

## Phase 2: plausible synthetic ground

Generate ground color from what we already have (DEM, slope, aspect, land-cover fractions, `places.json` towns and roads), making up everything below the data's resolution.

| Layer | Source of plausibility | Where Blender helps |
| --- | --- | --- |
| Parcels and paddies | Warped Voronoi or noise-driven field shapes, tinted per land-cover class; denser near towns and roads | Not needed; numpy is enough (the drape pipeline already does this) |
| Settlements | Procedural clusters grown from the existing town points along the existing roads: roofs, lots, tracks | Optional |
| Forest and canopy grain | A **top-down orthographic render of real 3D tree crowns, rocks and shadows**, scattered by cover fraction under the scene's sun | **Yes. This is where Blender beats noise**: crown shape and baked shadow give believable grain. Render tileable sets per class. |
| Mid-scale tone | Elevation, slope and aspect drive tone drift; low-frequency warped noise breaks repetition | Not needed |
| Close-range grain | A small tileable detail set per class, blended by cover | Yes, same render path as the canopy sets |

Delivery is the hard part, in this order of preference:

1. **Whole-map low-frequency base** (parcels, tone, settlements at coarse resolution, about the existing `synth` variant) **plus a fixed, small number of tileable detail taps** blended by cover. Scales to the whole 200 km with no patch edges. Mark: patches look bad, so this avoids them.
2. **Streamed tiles around the aircraft** only if (1) cannot reach the bar.

The GPU rule from this repo's own history applies: Plan 13a lost 3.15 to 11.3 ms to anisotropic sampling of one detail texture, 8.98 ms of it. Budget for **at most a handful of taps per fragment, no anisotropy**, and measure each added tap on the ryzen reference GPU before keeping it.

Pass:
- High at altitude stays under **8.33 ms p95** (currently 8.114 ms, so about 0.2 ms of headroom; anything added must be paid for).
- Mark's final-product viewing at the three altitudes, against the Phase 0b deficit list.
- Deterministic rebuild: same inputs, same bytes, with a test.

## Phase 3: the DEM. Closed.

Nothing to do. The measurements above show rivers are already valleys, canopy and kernel effects are a few feet on 80 ft posts, and the earlier L2 work removed the one DEM fault that was visible (the coast).

## Phase 4: tree and rock assets (separate track)

Authored in Blender, ingested per `docs/models.md` and vetted per `ASSETS.md`. Not started by this plan; listed so it is not forgotten. It is the largest visual change and the largest unknown, and it should not block Phases 1 to 3.

## Order and budget

0 and 0b first (measurement only), then 2, then final A/B at the three altitudes. Phase 4 stays a separate track. Every phase ends at the same gate: `npm run verify` through `remote-run`, and the budget specs under `hwlock ryzen-budget`, on the ryzen reference GPU. The suite is not allowed to become the only verification; the Phase 0 measurements are rerun at the end and must show the faults gone.

## Not doing

- Re-meshing the whole terrain in Blender: it grows triangles and draw calls on a High tier already at the budget limit, and L2 showed overlays do better.
- New elevation data: no free global source beats GLO-30 here. Anything that looks like added detail is invented, and is labelled as such.

## Open questions

- What exactly is missing from `?drape=synthsr` against OpenSkyFlight? (Phase 0b.)
- Can the whole-map base plus a few detail taps reach the bar within 0.2 ms of headroom, or does High need to give something up?
- Does a canopy render from real 3D crowns read better than the existing noise canopy? A 4 km patch A/B answers it before any whole-map work.
