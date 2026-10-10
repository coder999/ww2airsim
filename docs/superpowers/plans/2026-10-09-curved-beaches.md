# Curved beaches — implementation plan

**Design:** `docs/superpowers/specs/2026-10-09-curved-beaches-design.md`

**Execution:** worktree `l2-curved-beaches`; unattended.  Visual checkpoints:
Tacloban prototype and final integrated coastline, both collected in the
handoff.  Nexus is authoritative for source and deterministic generation;
Ryzen supplies the reference-GPU captures and final budget run.

## Task 1 — Pin the contour and ribbon math

- Add a shore builder module that reads L1, traces the existing land threshold,
  smooths/resamples closed and world-edge polylines, determines the land side,
  and emits cross-shore lanes.
- Test synthetic islands, bays, holes and world-edge contours.  Assert finite
  points, closure, lane ordering and that land-facing samples are actually on
  land.
- Measure the real-world loop/point counts and dropped-small-loop threshold.

## Task 2 — Script the Blender surface

- Add a deterministic Blender 5.0.1 script consuming the generated JSON.
- Build tiled dry, wet and surf meshes with shared material roles and cross-
  shore UVs; include the submerged edge.
- Add a build command and a content test that checks names, bounds, triangle
  count, finite attributes and byte-identical rebuilds.

## Task 3 — Tacloban prototype checkpoint

- Build only the Tacloban-area tiles behind a build option.
- Load them in a small renderer harness or temporary DEV wiring.
- Capture the same low and high coastal viewpoints before and after on Ryzen.
- Record whether the initial 100-foot/150-foot cross-section hides both L1 and
  L0 edges; adjust only from the observed seam, documenting the measurement.

## Task 4 — Runtime beach renderer

- Add `src/render/scene/beaches.ts`: load, role validation, terrain-compatible
  dry/wet materials, feathered surf material, shared curvature and disposal.
- Unit-test loading with an injected scene and assert that every authored role
  receives the intended shared runtime material.
- Add a small diagnostics seam for loaded tile/triangle counts; test behavior,
  not source text.

## Task 5 — Wire the full coastline

- Build and commit the full tiled glTF and its compact metadata.
- Load it during the surface boot phase, add it under the camera-relative scene,
  and update eye/time once per frame.  A missing optional visual logs and leaves
  the existing terrain, but a malformed loaded asset fails loudly.
- Ensure Low and High Asset Quality use the same curve and that the old
  height-based sand remains only as the inland material underneath the ribbon.

## Task 6 — Automated verification

- Run the touched unit/content files on Nexus as they are developed.
- Run typecheck, lint and dependency boundaries.
- Run the full `npm run verify` through the repository's remote-run path rather
  than loading Nexus with a parallel full suite.
- Build production output and verify the beach asset ships once and no temporary
  JSON or Blender files enter `dist/`.

## Task 7 — Final visual and GPU checkpoint

- Capture Tacloban at low altitude and from the established higher coast view,
  at both Low and High Asset Quality, on Ryzen.
- Run the existing High 1440p budget views under `hwlock ryzen-budget`; record
  all p95 values and compare the worst view with the branch baseline.
- Fix visible seams, self-intersections, surf sorting or a gate failure before
  handoff.  Do not widen a budget.

## Task 8 — Handoff

- Update `docs/terrain.md` with the standing generator/runtime facts and traps.
- Write `docs/handoff/2026-10-09-curved-beaches.md` with commits, generated
  counts/bytes, verification, budget figures and before/after captures.
- Update Track L2 in `MASTER_PLAN.md` with the completed slice and what remains
  (ocean-side foam/whitening only if it did not land here).
- Email this plan, its design and the final handoff as HTML per `AGENTS.md`.

