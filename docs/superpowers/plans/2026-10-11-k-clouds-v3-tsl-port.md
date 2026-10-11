# K Clouds v3 — full TSL port plan

**Date:** 2026-10-11

**Branch/worktree:** `clouds-v3-tsl-port` in `/home/mark/projects/ww2airsim-clouds-v3-tsl`

**Run:** unattended; Mark's “Go for it” authorizes the experimental branch, not a default change or deployment

**Viewing checkpoint:** first complete TSL cloud frame and final WGSL/TSL parity pair; neither is a test gate

**Baseline:** `b8c17fb7`; the accepted native WebGPU renderer selected by `?cloudRenderer=takram` remains untouched

**Delivery:** a parallel `?cloudRenderer=takram-tsl` implementation, automated evidence, reference-GPU measurements, and a committed branch

## Goal

Port the accepted Takram-derived cloud renderer from hand-written WGSL to Three.js TSL without risking the working native implementation. The port is a complete experiment: cloud density, ray march, lighting, temporal reconstruction, scene-depth composite, and game wiring. It earns no default or upstream status merely by compiling.

## Guardrails

- `legacy` stays the no-query and production default.
- `takram` continues to mean the accepted native WGSL renderer and is not edited to support the port.
- `takram-tsl` is a distinct DEV-only selector and implementation.
- Both Takram paths consume the same game camera, sun, scenario coverage/base, and source assets.
- No visual retuning until the TSL image first matches the native reference closely enough to compare like for like.
- No deployment and no upstream publication in this plan.

## Tasks

### 1. Freeze the comparison contract

- Add parser coverage for `takram-tsl` while preserving `legacy` and `takram` behavior.
- Name the native path explicitly in diagnostics so captures cannot confuse WGSL and TSL.
- Record fixed camera/weather inputs and a small set of numeric density/lighting reference samples derived from the accepted implementation.

### 2. Give TSL native Three textures

- Load the weather, averaged shape mip chain, detail, turbulence, and STBN assets into Three textures with the same dimensions, wrap, filtering, color-space, and mip semantics as the native loader.
- Keep ownership separate: selecting one renderer loads only that renderer's resources.
- Prove volume dimensions, mip levels, and query routing with deterministic seam tests.

### 3. Port density and weather math

- Implement Takram's continuous tiled weather field, height profiles, averaged shape LOD, detail erosion, turbulence, and coverage response as per-material TSL functions.
- Parameterize the Leyte origin and basis at the adapter boundary rather than embedding them in density math.
- Follow the three r186 rules in `docs/clouds.md`: one laid-out function set per material, no captured uniforms in laid-out bodies, unconditional texture sampling, and named loops.

### 4. Port ray marching and lighting

- Reproduce the accepted ray/layer intersection, jitter, adaptive sampling, transmittance, direct light march, phase functions, multiple scattering approximation, and representative front depth.
- Render the low-resolution cloud radiance/opacity and cloud depth through Three's node render-target path.
- Keep the game's atmosphere, exposure, and tone mapping authoritative.

### 5. Port temporal reconstruction

- Recreate the accepted 2×3 phase schedule, full-resolution ping-pong history, reprojection, depth agreement, and camera-cut invalidation in TSL.
- Preserve the broad conditional soft edge accepted by Mark; do not reopen its dense-core softness during the parity stage.
- Add a pure-JS mirror only where it gives an external truth for reprojection or scheduling.

### 6. Port scene composite and game adapter

- Composite against Three's scene color and reversed depth using node depth helpers where possible.
- Preserve aircraft, cockpit, terrain, effects, horizon, pause, teleport, camera-cut, restart, resize, and scenario-switch ordering.
- Expose the same lifecycle interface as the native Takram pass so `main.ts` only selects implementations.

### 7. Verify parity and cost

- Run touched deterministic files after each stage and the full `npm run verify` gate through `remote-run` once the branch is integrated.
- Run the focused Takram game-flight E2E for both selectors and assert zero WebGPU/browser errors and correct history resets.
- Capture fixed WGSL/TSL pairs at near edge, dense center, far field, below deck, and in-cloud views.
- Under `hwlock ryzen-budget`, compare native WGSL and TSL GPU p50/p95 at 2560×1440 High. The TSL candidate must not replace native WGSL unless it is visually equivalent and no more than 15% slower.

### 8. Document the result

- Update `docs/clouds.md` with the TSL architecture, measurements, traps, and an honest disposition: parity, useful partial port, or failed experiment.
- Add a dated handoff with commands, captures, timings, and exact URLs.
- Update Track K in `MASTER_PLAN.md` only with achieved facts.
- Email the plan and final handoff as HTML per repository instructions.

## Acceptance

- `?cloudRenderer=takram` is byte-for-byte or behaviorally unchanged from `b8c17fb7`.
- `?cloudRenderer=takram-tsl` renders the complete game with TSL-generated shaders and no hand-written WGSL cloud stages.
- Fixed views show the same weather placement, silhouettes, lighting direction, opacity, depth ordering, and temporal stability within documented tolerances.
- Native and TSL timings are measured exclusively on the reference GPU.
- The branch is committed and clean; `main`, production defaults, and deployment remain unchanged.

## Stop conditions

Keep a partial port rather than disguising a dead end if Three r186 cannot express a required texture, multi-render-target, temporal-history, or render-graph operation without embedding WGSL. Record the exact limitation and leave the native renderer intact. A hybrid that still embeds the cloud stages as WGSL does not satisfy this plan's full-port goal.

## Optimization addendum — 2026-10-11

**Run:** unattended; Mark approved proceeding on the existing research branch

**Viewing checkpoint:** final native/TSL comparison only; automated image and GPU evidence remain the gates

The first complete port established visual parity but not cost parity. Optimize
the TSL implementation without changing either default or the accepted native
renderer:

1. Read Three's per-render-context timestamp results so the TSL march and
   temporal pass have direct GPU samples; retain whole-frame timing for the
   fused composite.
2. Change the shape, detail and STBN volumes from expanded RGBA8 back to their
   source R8 representation while keeping Three ownership and the averaged
   shape mip chain.
3. Restore the native shader's conditional 1/2/4-sample weather-tile path.
   These are explicit-LOD samples, so they do not rely on implicit derivatives
   inside non-uniform control flow.
4. Measure the baseline and each retained lever at 2560x1440 High under
   `hwlock ryzen-budget`, interleaving native and TSL where practical. Reject a
   lever that causes validation errors, visible placement/edge regressions, or
   no repeatable gain.
5. If those parity fixes do not reach the original <=15% promotion criterion,
   inspect generated WGSL and pass scheduling before considering visible
   approximations. Do not weaken the accepted soft edge merely to hit a number.

No merge, deployment, upstream publication or production-default change is in
scope. Update the existing handoff and standing cloud reference with measured
results, then commit and push the research branch.
