# Entity scaling: projectile-contact broad phase

Branch: `entity-contact-broadphase`

Status: implemented and measured; ready for review, not merged

This is the first implementation follow-up to the entity-scaling measurement in
[`2026-10-10-entity-scaling.md`](2026-10-10-entity-scaling.md). It addresses the simulation cliff in a tight
furball; it does not address the renderer's per-aircraft draw calls, which remain the next scaling item.

## What changed

- `segmentMovingSphere` computes the exact closest approach between a projectile segment and a sphere whose
  centre moves during the tick. It is allocation-free.
- Each aircraft combat spec gets a cached, rotation-invariant sphere enclosing every damage-zone corner.
- Aircraft, ships, vehicles and structures reject impossible contacts before quaternion transforms,
  trigonometry and per-zone box tests.
- A positive broad-phase result still runs the old exact `segmentBox` narrow phase. The broad phase cannot
  create a hit and its conservative bounds cannot reject a real hit.
- `nearestContact` keeps the nearest hit incrementally instead of allocating a candidates array for every
  projectile on every tick. Strict comparison preserves the old contact-kind and zone tie order.

## Measured result

Ryzen RX 6700 XT host, production `step`, bundled with esbuild, 5 seconds of simulation per point after the
existing 2-second warm-up, median of three interleaved repeats. Baseline and optimized runs used the same
checkout lineage and command; entity outcomes and rounds in flight were identical at every compared point.

| Layout and extra entities | Mean before | Mean after | Change | p95 before | p95 after | Change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| tight, 30 aircraft | 5.556 ms | 1.013 ms | -81.8% | 8.125 ms | 1.769 ms | -78.2% |
| tight, 60 aircraft | 19.968 ms | 2.695 ms | -86.5% | 35.206 ms | 4.209 ms | -88.0% |
| tight, 30 aircraft + 10 ships | 6.273 ms | 1.280 ms | -79.6% | 8.659 ms | 1.991 ms | -77.0% |
| tight, 60 aircraft + 20 ships | 22.942 ms | 4.321 ms | -81.2% | 39.205 ms | 6.957 ms | -82.3% |
| mission, 60 aircraft | 1.179 ms | 1.012 ms | -14.2% | 2.208 ms | 1.710 ms | -22.6% |
| mission, 60 aircraft + 20 ships | 1.357 ms | 1.299 ms | -4.3% | 2.391 ms | 2.114 ms | -11.6% |

The follow-up CPU profile moved `nearestContact` from 45-60% of sampled self time to 10.8% in tight 60 + 20;
it did not appear among the mission 60 + 20 profile's top functions. Total garbage-collector share was still
material in the tight profile, so removing the candidates array is not claimed to have solved general sim GC.

At 3x and 120 Hz, tight 30's mean simulation work per display frame fell from 8.33 to 1.52 ms. Tight 60 + 20
fell from 34.41 to 6.48 ms: under the 8.33 ms frame bar on mean work, though renderer cost and tail latency
still matter.

## Correctness and verification

- Unit coverage includes tangent, near-miss, stationary and moving-target sphere sweeps.
- Existing moving-aircraft, moving-vehicle, hull, structure, terrain ordering and nearest-hit tests retain the
  exact narrow phase.
- The deterministic furball, gunnery, AA, mission, replay and soak suites exercise unchanged outcomes.
- TypeScript, ESLint and dependency-boundary checks pass.
- Full verification completed with typecheck, lint and dependency boundaries green; 6,232 tests passed and
  11 skipped. Its two failures reproduce unchanged on `main`: Escort's easy/unescorted balance assertion
  loses one bomber while expecting more than one, and the ship-loader fallback test's pinned registry list
  predates three newly registered Blender comparison ships. Neither path is touched by this branch.

## Next scaling item

Reduce aircraft draw calls, then add distance LOD or impostors. That remains the main-thread and GPU limit in
the mission layout; this change deliberately affects simulation contact only.
