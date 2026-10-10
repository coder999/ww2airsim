# K Phase 1 (edges): handoff, in progress

Plan: `docs/superpowers/plans/2026-10-10-k-cloud-edges-impostors-thunderheads.md`. Branch `k1-cloud-edges`
(worktree `~/projects/ww2airsim-k1`, slot `ww2airsim-3`). Attended: it stops at the end-of-phase checkpoint.

## Task 1.1: Blender round trip (Sonnet, reviewed, `50cad8c4`)

Works via Blender 5.0.1's bundled `openvdb` module; `tools/sky/blender/README.md` has the commands, the
asserts and the traps (Principled Volume needs an explicit Attribute node for a file grid; a Bake node with
no item writes nothing). The archetype renders in Cycles as a recognizable cumulus (7,178 covered pixels of
65,536 at 256x256).

## Task 1.2: the SH bake was measured and rejected (Sonnet, hard stop)

`lightbake.py` (not kept; a copy is in `/tmp/lb/` for the session) swept 128 Fibonacci hemisphere directions
through the archetype in cube units (validated against a brute-force march: mean error 0.00044, max 0.045)
and fitted order-2 real SH per voxel, least squares over the upper hemisphere. Errors after uint8
quantization, over the 241,965 voxels with density > 0.01, as Beer transmittance for a 1,300 x 800 m cloud
at `CUMULUS_SIGMA` 0.012:

| Fit | mean | p90 | p99 | max |
| --- | --- | --- | --- | --- |
| tau | 0.077 | 0.208 | 0.452 | 0.895 |
| log(tau + eps) | 0.046 | 0.112 | 0.270 | 0.750 |
| exp(-12 tau) (best) | 0.049 | 0.117 | 0.276 | 0.74 |

Restricting to sun elevations >= 15 deg did not change it: the failure is the lit/shadow terminator at
cloud edges and under overhangs, narrower than l <= 2 can hold. 2.6% of (voxel, direction) pairs exceed a
0.2 transmittance error. The 32-direction fallback interpolates across 45 deg of azimuth, which blurs the
same terminator. Peak RSS of the bake was 3.7 GB on nexus.

**Ruling (Claude, strong-model task 1.3, 2026-10-10): no direction bake.** The light march moves into the
archetype's cube space instead: after the weather decode, a few `texture3D(cumulus)` samples toward the sun
in cube coordinates, converted to meters per cloud. Exact for the archetype, zero new assets, no weather or
noise reads per light sample. This departs from R5's wording ("baked") but meets its intent (the full-field
light march goes from 6 steps to 0) and the plan's own risk line. Mark rules on it at the checkpoint.
