# Long-distance forest checkpoint — October 13, 2026

DEV opt-in experiment on `terrain-lighting`, slot 2. Mark requested a much
farther forest with cheaper representations selected by actual viewer distance,
including altitude. Awaiting attended visual review. No default change, merge
or deployment.

## Review

- [Fly the extension](https://ww2airsim-2.windomlane.org/?spawnX=-36629&spawnY=457.2&spawnZ=-47829&sceneryView=1&look=0,-15&launch=1&timeOfDay=12&cloudTier=off&oceanTier=high&canopy=off&treeFade=soft&distantTrees=on&forestDistance=long)
- [Fly the accepted forest](https://ww2airsim-2.windomlane.org/?spawnX=-36629&spawnY=457.2&spawnZ=-47829&sceneryView=1&look=0,-15&launch=1&timeOfDay=12&cloudTier=off&oceanTier=high&canopy=off&treeFade=soft&distantTrees=on&forestDistance=off)
- Flight clips: [extended](2026-10-13-long-forest-shots/moving-on.webm),
  [accepted](2026-10-13-long-forest-shots/moving-off.webm).
- Ridge stills: [extended](2026-10-13-long-forest-shots/ridge-noon-on.jpg),
  [accepted](2026-10-13-long-forest-shots/ridge-noon-off.jpg).
- High-altitude stills: [extended](2026-10-13-long-forest-shots/high-noon-on.jpg),
  [accepted](2026-10-13-long-forest-shots/high-noon-off.jpg).

Press Escape to fly. Clips start at 1,500 ft and follow at least 600 simulation
ticks; capture polling can overshoot by a few ticks. Stills are 1920×1080,
clips 1280×720. Their FPS overlays are not isolated GPU measurements.

The inspected ridge and forward-flight frames retain trees across terrain
that was bare beyond the accepted border. At 13,000 ft the terrain retains
coarse forest structure. The low downward view is unchanged. **Distant groups
look like larger, rounder clumps** and transitions are still approximations.
This is a visual experiment, not a demonstrated invisible border.

## Representation and resources

Accepted detailed trees and individual crown stand-ins remain. The new layer
adds sparse, lit crown groups, fading in as individual crowns fade out.
High reaches about 11.2 miles, with a long outer fade starting near 5 miles;
Medium reaches 6.8 miles; Low draws no tree geometry. Fades use 3D camera
distance. Climbing therefore removes detailed trees, then individual crowns,
then groups, just as increasing lateral separation does.

A distance-blended, mipmapped terrain canopy continues beyond the group layer.
It uses the existing original procedural asset, requires terrain texture detail,
and preserves accepted near ground. The farthest stage has no individual tree
silhouettes. The visible horizon varies with altitude, haze and terrain: this
is not a claim of full 3D trees to a fixed fraction of the horizon.

One additional transparent draw uses two triangles per group, no trunks or
shadow draws. The group layer shares the accepted sun/sky material and uses soft
transparency. Fully faded nonempty cards still incur geometry work. Canonical
placement candidates and existing land-cover/exclusion tests choose centers. Broader footprints can extend beyond
a center's clearing or shore boundary; they are approximate groves.

High reserves 497 coarse cells × 224 candidates = **111,328 instance slots**.
Position/size/color attributes add **3,562,496 bytes (3.40 MiB)** on the CPU plus
GPU copies. Empty slots still submit collapsed vertices. The reusable canopy
adds a 4 MiB CPU texture and approximately 5.33 MiB on the GPU with mipmaps,
plus its approximately 3.6 MiB compressed download if uncached. These are
allocation estimates, not measured total GPU residency.

Coarse cells retain stable buffer slots and load incrementally, with their own
roughly 1 ms CPU slice checked between cells. A cell is atomic and can exceed
that limit. The accepted layer has a separate slice, so these are not a single
combined 1 ms limit. Final visual captures observed coarse-update maxima of
1.6 / 1.9 / 2.7 ms at low / ridge / high views and 2.8 ms during the moving pass,
including initial load. These are high-water marks, not CPU percentiles. The
short moving pass stays within one coarse cell; coarse boundary reuse is
covered by the unit test, not a long-flight capture.

## GPU measurements

Reference Ryzen GPU, exclusive `ryzen-budget` lock, High/100%, 2560×1440,
noon, clouds off. Both variants use accepted soft trees and individual distant
crowns. Three repeated windows per state, alternating tree visibility and
reversing variant order at the ridge. Wait for both tree layers and canopy
loading before measurement. CPU tests and other captures were finished;
preflight checks found background video-codec activity but no unrelated 3D load.

The retained version uses the same material as individual crowns. A subsequent
trial used diffuse-only lighting and collapsed fully faded cards in the vertex
stage. It did not reliably improve performance or clear the target, so that
trial was reverted. The table below measures the retained implementation.
The [reverted trial's raw windows](2026-10-13-long-forest-cost/diffuse-trial/ridge-6000ft.json)
and its screenshots remain separately labeled. Its extended p95 medians were
8.25 / 12.90 / 10.88 / 13.22 ms at low / ridge / high / forward views. Baseline
timings also varied between runs, including forward p95 exceeding the target
in the second run, so these results do not establish a precise causal gain or
loss from the shader substitution. They do establish that neither trial
consistently met the target in these measurements.

Medians of three window statistics, full-frame GPU milliseconds:

| View | Accepted p50 | Extended p50 | Added p50 | Accepted p95 | Extended p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Low, 1,000 ft | 3.740 | 3.890 | 0.150 | 3.989 | 3.911 |
| Ridge, 6,000 ft | 4.082 | 5.680 | 1.599 | 5.774 | 14.798 |
| High, 13,000 ft | 3.254 | 3.995 | 0.741 | 4.638 | 10.391 |
| Forward, 1,500 ft | 3.903 | 4.434 | 0.531 | 4.997 | 10.819 |

All 48 windows had more than 100 samples. **7 windows exceeded the 8.33 ms p95 target**; the maximum was 15.348 ms. These failures were in the extended tree-visible states. The prototype is not recommended as a default at this cost.

Tables compare the complete scenes with trees visible. The separate tree-hidden
windows remove all tree geometry but retain terrain canopy shading. Their
cross-variant difference estimates the ground-material increment; subtracting
those from tree-visible windows helps distinguish geometry cost. This is a
controlled estimate, not a per-draw GPU profiler.

Raw windows for the retained version:
[low](2026-10-13-long-forest-cost/low-1000ft.json),
[ridge](2026-10-13-long-forest-cost/ridge-6000ft.json),
[high](2026-10-13-long-forest-cost/high-13000ft.json),
[forward](2026-10-13-long-forest-cost/forward-1500ft.json).

## Test reconciliation

**Tests updated:** existing streaming lifecycle tests enroll both individual
crowns and coarse groups, covering stable slots, incremental load, clearing,
quality changes, parent visibility and altitude culling. The placement suite
checks that sparse candidates remain a nonempty subset of the canonical
forest. Query tests preserve accepted defaults and keep this trial DEV-only.
The existing shader comparison enrolls the new mode, checks loading and
nonzero groups, equal near-tree counts and no GPU/console errors. The existing
trees-visible test now checks distant-layer visibility explicitly instead of
comparing asynchronous loader counters as if they were static.

**Tests still valid:** accepted tree art, fade, near placement/exclusions,
production defaults, full-canopy loading/fallback and experimental terrain
lighting. Capture and cost tools gained `FOREST_DISTANCE_CAPTURE=1`; the cost
tool adds a forward-looking fourth view for this experiment.

Passed on Ryzen: 34 focused unit tests, typecheck, lint, dependency checks,
production build, three shader/visibility/fallback E2E cases, and matched
captures. On captures were refreshed after restoring the measured material.
The production build retains its existing large-chunk warning. No full-suite
merge gate was run for this attended checkpoint.

**Known gaps:** unsorted transparent overlaps, coarse-looking groups, broader
footprints at forest edges, other hardware/resolutions, other sun angles,
long flights and initial-load visibility. Low/Medium controller behavior is
unit-tested; visual and GPU measurements are High. No claim that every border
or pop disappears. Plan emailed using the repository's required workflow.
