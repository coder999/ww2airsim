# Terrain lighting and surface quality

**Mode: attended.** Mark requested an isolated worktree and a dev-server slot,
and confirmed pauses at these visual checkpoints: mountain lighting,
canopy/surface improvements, final comparison. Automated checks finish before
each checkpoint; viewing is not a test gate.

**Checkout:** `terrain-lighting`, `ww2airsim-terrain-lighting`; slot 2, port 5175.
The Vite hostname/port edit is local scratch, never committed.

## Checkpoint 1 ruling and next comparison

**Distant-tree acceptance:** Mark reviewed the extended forest and replied,
"progress! i like it". Retain the measured crown stand-ins and bounded loader,
and enable them by default in DEV and production builds on this branch.
Keep the DEV off comparison. This does not request a merge or deployment.

**Distant-tree experiment (now accepted):** Mark asks whether cheap stand-ins can hide the
remaining tree border. Add opt-in `distantTrees=on`: two-triangle crown cards
at the same deterministic tree sites, existing sun/sky shading, continuous
blend from the accepted near trees, then a broad outer fade. Try High ending
at about 2.6 miles and Medium at 1.7 miles; Low stays off. Generate new cells
incrementally and retain stable buffer slots to avoid whole-forest repacking.
Compare on/off at the same noon ridge and moving views; measure isolated GPU
cost plus the CPU update high-water mark. Aim for a small added cost, roughly
0.3 ms or less, without treating the target as a measured claim. Verify
placement, buffer reuse, quality switching, culling and shader compilation.
The attended review is complete; the acceptance ruling above supersedes the
original opt-in default.

**Acceptance ruling:** Mark reviewed the soft fade and said, "it looks slightly
better. i think we keep it." Keep the measured soft implementation and make it
the default in DEV and production builds on this branch. Retain DEV comparison
queries, original tree art/range, altitude culling, and the opt-in status of
rejected terrain experiments. Record the accepted cost and remaining boundary
limitation. This approval does not request a merge or deployment.

**Latest dissolve ruling:** Mark sees a slight improvement but rejects the
visible pixelation, asking for a softer, coming-into-focus effect. Compare
`treeFade=soft` (continuous alpha blending only in the transition band, opaque
near trees) with `treeFade=pixel`. Keep original tree art/range and ground.
Check overlap artifacts in moving and ridge captures, measure the added draw
cost, then pause for the next attended review. This is a fade, not optical
defocus, and still does not add distant forest. Production stayed on `whole`
during that comparison; the acceptance ruling above supersedes it.

**Subsequent checkpoint 2 ruling:** Mark prefers the original close-range trees
and still sees popping and a tree boundary. He approved a narrower follow-up:
restore original tree shapes, palette and draw range; compare whole-tree
switching against a pixel-level dissolve at the same range. The canopy material
is now opt-in, and the rejected shorter-range tree treatment is removed. Both
fade variants retain altitude draw culling. Use `treeFade=whole|pixel`, original
ground (`canopy=off`), matched flight recordings and isolated GPU measurements.
Pause for his next attended check-in. This experiment targets popping, not
the still-missing distant tree representation.

Mark perceived no difference and asked to roll back any added GPU cost.
The prototype adds roughly 0.1–0.15 ms in stable reference-GPU comparisons;
it is now disabled by default, with no map downloads or shader sampling.
Explicit DEV opt-in is retained only for reproducing the rejected experiment.
Mark also identified noon as weakest and questioned the cost and moving
boundary of the nearby trees. [Tree measurements](../../handoff/2026-10-13-terrain-cost.md)
compare trees alone, leaving ground materials and other scenery unchanged.

Checkpoint 2 should prioritize noon: replace the repeated forest-floor pattern
with irregular canopy-scale detail, shade gaps between crowns, and carry a
consistent canopy appearance into the distance. Reuse or replace existing
surface samples before adding more passes. Compare with and without nearby
tree meshes; extending their draw distance is not the first remedy. The
current trees still ship unchanged; a DEV-only `trees=off` link makes that
choice reviewable. Verify any new canopy at the same low/middle/high views,
measure its GPU cost, then pause for Mark as already agreed.

Mark approved this canopy direction after reviewing the unchanged tree boundary.
The DEV prototype (`canopy=on`, default in this worktree; `off` restores the
previous surface and trees) replaces two forest texture reads with a packed
procedural material containing crown relief, tone and gap enclosure. High
nearby trees now blend over roughly 656–3,281 ft, with stable per-tree fade
seeds, matched darker colors, and conservative altitude culling. The canopy
surface continues beyond that band. Capture noon at the original three
altitudes and a moving pass, verify fallback and placement invariants, then
measure both modes under the exclusive GPU lock before checkpoint 2.

## Direction

Make Leyte's mountains and ground read as a real landscape. Mark did not find
the previous drape substantially better and authorizes keeping or replacing it
on visual merit. Start with shipping terrain, without a drape. Preserve the
sim's elevation/contact surface and existing atmosphere. Work stays isolated
until reviewed; no production deployment.

## Work and checkpoints

1. Establish slot, matched views and a reproducible baseline.
2. Derive directional terrain horizons and sky visibility from the existing
   DEM. Sun visibility affects direct light; enclosure affects diffuse sky
   light. Keep both independent of albedo and cloud shadow. Prototype uses a
   whole-world raster with a documented resolution and memory cost; measure
   narrow-valley limitations before choosing final resolution.
3. Verify flat-ground/ridge/hollow behavior, shader compilation, asset loading
   and matched GPU captures at morning/noon/afternoon. **Checkpoint 1:** send
   working slot links and inspected before/after captures; pause for Mark.
4. Following his feedback, replace conspicuous repetition and forest-floor
   detail with irregular canopy-scale structure. Evaluate existing synthetic
   work as evidence, not as a prerequisite. **Checkpoint 2:** matched low,
   middle and high-altitude views; pause.
5. Integrate accepted choices, measure GPU cost against the reference budget,
   check shoreline/material transitions and changing sun. Existing terrain,
   surface and sun tests remain the starting coverage; add behavior tests for
   new horizon math, not snapshots of tuning constants.
6. Reconcile affected tests, update standing terrain documentation and record
   limitations and measured resource costs. **Checkpoint 3:** final live
   comparison and captures; pause before closeout decisions.

## First experiment

Precompute horizon elevation in 16 azimuth directions, plus a diffuse
sky-visibility estimate normalized against the local slope. Runtime reads
neighboring directions and blends them for a changing sun, with a softened
transition. A DEV-only comparison switch allows `off`, `sky`, `sun`, and `on`.
This separates changes in lighting from the subsequent surface work.

CPU baking/tests go through `remote-run` with overflow disabled. GPU captures
use the Ryzen Playwright server; GPU budget measurements take the exclusive
`ryzen-budget` lock. Leave shared tunnels and Playwright servers running.


## Long-distance forest experiment (October 13)

Attended checkpoint remains in force. Mark requests a farther forest with
cost measured against the accepted soft trees and 2.6-mile crown stand-ins.
Prototype a sparse crown-group layer to about 11 miles on High (about 6.8 on
Medium), then a shaded terrain canopy extending into the distant landscape.
Use actual camera distance for transitions so altitude also reduces fidelity.
Keep near ground unchanged and the entire extension DEV opt-in with
`forestDistance=long`. No production/default change before visual review.

Reuse two-triangle cards, stable cell slots, incremental loading, canonical
placement and exclusions. Coarse cells contain 16 original cells with 14
candidates each: 224 possible groups, compared with 220 individual crowns per
original cell. Group radius is three times an individual stand-in's radius.
Land-cover masking and mipmapped canopy shading provide the farthest stage;
this is not individual 3D trees all the way to the horizon.

Capture matched low, ridge, high and moving comparisons. Verify placement,
quality/reset/culling behavior, production isolation and shader compilation.
Measure three repeated GPU windows per view at 1440p on the exclusive Ryzen
budget lock, against the accepted forest. Report full-scene cost separately
from geometry-only tree visibility toggles, since those toggles cannot remove
the new terrain shading. Send inspected captures and the live slot, then pause.


## Acceptance and Trees setting (October 13)

Mark passed the long-forest visual checkpoint and requested keeping it with
an independent Trees control for slower GPUs. Enable the accepted extension
by default on this isolated branch, retaining the DEV shorter-range comparison.
Add On/Off in both title Settings and the pause Visual Quality tab. Apply
immediately, persist per browser, preserve the choice across quality changes,
and stop hidden-tree streaming. Low scenery continues to draw no trees.
The prior Ryzen GPU budget misses remain documented; visual acceptance does
not turn them into passes. Verify storage/boot wiring, all-layer visibility,
quality interactions, reload and keyboard behavior, and inspect both layouts.
Mark subsequently requested merge, push, documentation/test reconciliation, CI
and branch/worktree cleanup. Production deployment remains separate.
