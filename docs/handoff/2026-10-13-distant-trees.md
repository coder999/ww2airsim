# Distant tree stand-ins — October 13, 2026

Accepted by Mark after the visual check-in: "progress! i like it". The distant
stand-ins now default on in DEV and production builds alongside the accepted
soft fade. Work is isolated on `terrain-lighting`, served in slot 2. No merge
or deployment; `?distantTrees=off` remains a DEV comparison.

## Review

- [Fly with stand-ins](https://ww2airsim-2.windomlane.org/?spawnX=-36629&spawnY=457.2&spawnZ=-47829&sceneryView=1&look=0,-15&launch=1&timeOfDay=12&cloudTier=off&oceanTier=high&canopy=off&treeFade=soft&distantTrees=on)
- [Fly accepted baseline](https://ww2airsim-2.windomlane.org/?spawnX=-36629&spawnY=457.2&spawnZ=-47829&sceneryView=1&look=0,-15&launch=1&timeOfDay=12&cloudTier=off&oceanTier=high&canopy=off&treeFade=soft&distantTrees=off)
- Flight clips: [stand-ins on](2026-10-13-distant-tree-shots/moving-on.webm),
  [off](2026-10-13-distant-tree-shots/moving-off.webm).
- Ridge stills: [on](2026-10-13-distant-tree-shots/ridge-noon-on.jpg),
  [off](2026-10-13-distant-tree-shots/ridge-noon-off.jpg).

Press Escape to resume the live flight. Both clips follow the same 600-tick
flight from 1,500 ft at noon with clouds off. Recordings are 1280×720; FPS
overlays are not isolated budget evidence. The slot and on clip returned 200.

## What changed

The detailed trees keep their accepted appearance and soft fade. Beyond them,
each cheap crown uses two triangles, an analytic three-lobe silhouette, a soft
edge, and a rounded normal lit by the existing sun/sky. There are no added
texture assets, trunks, or shadow draws. One instanced draw submits the layer.

High extends from the old approximately 1.15-mile endpoint to 2.6 miles, with
an outer fade over roughly 1.1 miles. Medium ends at 1.7 miles; Low stays off.
The same deterministic placement function keeps both representations at the
same forest sites and respects land cover, shores, slopes, rivers, airfields
and hut exclusions. Initial load and tier/cover changes fill progressively,
at most four cells per update, stopping before another cell once a roughly
1 ms CPU slice is used. A single cell can exceed that soft limit.
Existing cells retain buffer slots across movement;
only entering cells are generated and only changed attribute ranges upload.

High reserves 437 cell slots, or 96,140 potential crowns. Position, size and
color attributes use 3,076,480 bytes on the CPU, approximately 2.93 MiB, plus
their GPU copies. Empty slots collapse to zero-size triangles; they still
consume vertex submissions. Populated-site diagnostics do not imply that only
those slots were submitted. Placement work is currently duplicated between
the near and distant caches.

Inspected ridge and flight-endpoint stills show forest coverage beyond the
previous boundary. **The stand-ins look rounder than the detailed trees.**
Their transition is not invisible, and the outer fade still ends at a finite
range. This experiment has not established that the border disappears.
Transparent instances are unsorted, and initial loading can be seen before
the distant layer finishes filling. Mark accepted the visual result with
these limits; it does not establish an invisible boundary from every viewpoint.

## Measurements

Reference Ryzen GPU, exclusive `ryzen-budget` lock, High/100%, 2560×1440, noon,
clouds off, canopy/terrain-lighting experiments off. Both variants use the
accepted soft fade. Three sample windows per trees-on/off state, alternating
visibility order and reversing variant order at the ridge. Wait for distant
loading before measuring. No concurrent captures or CPU tests; preflight GPU
check showed background video-codec activity, no unrelated 3D load.

Medians of three window statistics, milliseconds of full-frame GPU time:

| View | Off p50 | On p50 | Added p50 | Off p95 | On p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Low, 1,000 ft | 3.673 | 3.746 | 0.073 | 3.690 | 3.981 |
| Ridge, 6,000 ft | 3.578 | 3.801 | 0.223 | 4.096 | 4.347 |
| High, 13,000 ft | 2.950 | 3.243 | 0.293 | 3.195 | 4.510 |

All three measurement cases passed. All 36 windows had more than 100 samples
and p95 below 8.33 ms; the largest p95 was 4.567 ms. High-altitude tail cost
increased more than its median. Unlike the near trees, distant crowns can
still draw at 13,000 ft, and their submission is not free.

The first loader allowed four cells regardless of elapsed CPU time. Its
maximum observed update was 4.4 / 6.1 / 7.6 ms in the low / ridge / high
views, including initial loading. That prompted a roughly 1 ms loading slice,
checked between cells. The GPU table above measures the unchanged draw and
shader code with all cells loaded; only CPU scheduling changed afterward.
Final loading/capture diagnostics are stored beside the final screenshots.

After the loading-slice change, an exclusive-lock capture run observed maximum
CPU updates of **1.9 / 2.5 / 3.6 ms** at low / ridge / high views and **3.7 ms**
over the moving pass, including initial loading. Each fixed view finished with
no pending cells; the moving pass generated 508 cells and also ended with none
pending. These are observed high-water marks, not hard guarantees or CPU p95s.
Final CPU captures use 1920×1080 stills / 1280×720 video, distinct from the
2560×1440 GPU run. Per-view diagnostics: [low](2026-10-13-distant-tree-shots/low-noon-on.json),
[ridge](2026-10-13-distant-tree-shots/ridge-noon-on.json),
[high](2026-10-13-distant-tree-shots/high-noon-on.json),
[moving](2026-10-13-distant-tree-shots/moving-on.json).

Raw windows and matched screenshots: [low](2026-10-13-distant-tree-cost/low-1000ft.json),
[ridge](2026-10-13-distant-tree-cost/ridge-6000ft.json),
[high](2026-10-13-distant-tree-cost/high-13000ft.json).

## Test reconciliation

**Tests updated:** the existing terrain shader comparison now also enrolls
soft fade plus stand-ins, checks completion/nonzero distant trees, equal near
counts and no console/GPU errors. Shared cell selection moved to `treeCells.ts`
with the original exports preserved. New focused tests cover far-disc
completeness, bounded cell batches, stable slot reuse, clearing old slots,
quality switching, altitude culling and parent visibility. Existing capture
tools accept `DISTANT_TREES_CAPTURE=1` for matched on/off comparisons.

**Tests still valid:** detailed-tree art, placement/exclusions, tier behavior,
soft fade and production default, pixel coverage, canopy opt-in/fallback and
terrain lighting. The far layer calls the existing tested placement function.

Passed on Ryzen: typecheck, focused lint, 31 unit tests, dependency checks,
the expanded shader E2E, four on/off ridge/moving captures, refreshed on
captures after the camera-axis correction, and production build. The build
reported the existing large-chunk warning. Measurement results are above.
After adding the CPU slice: typecheck, focused lint, the two streaming tests
and all four on captures passed again, including zero console/GPU errors.
After acceptance: 32 focused tests, typecheck, lint and production build passed.
The new default test covers DEV opt-out and production enablement. The test
specifically covering the four near-tree meshes now explicitly disables the
distant layer; general scenery tests exercise the accepted default. Rendering
and streaming code are unchanged from the measured version.

**Known gaps:** transparent overlap, other viewing angles,
hardware/resolutions, and long-flight CPU/streaming behavior. No full-suite
merge gate was run for this checkpoint. The plan was emailed as required.
