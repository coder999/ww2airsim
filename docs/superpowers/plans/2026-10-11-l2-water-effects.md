# L2 plan: breaking surf and shallow water

**Status:** implemented and verified on branch `l1-l2-visuals`, 2026-10-11.
Awaiting Mark's combined L1/L2 review and merge.

**Run:** unattended. Mark's checkpoint is the final combined L1/L2 result;
collect intermediate captures without stopping.

**Design:** `docs/superpowers/specs/2026-10-11-l2-water-effects-design.md`.

## Tasks

1. **Baseline.** Re-run the current beach unit tests and capture the existing
   close Tacloban, oblique shoreline and 6,000-foot views. Record the current
   affected 1440p High budget numbers under `hwlock ryzen-budget`.
2. **Pure wave model.** Define documented constants and a CPU twin for breaker
   position, whitening, breakup, backwash and cross-shore opacity. Test bounds,
   periodicity, shoreward direction, finite junk handling and pause stability.
3. **Animated material.** Build the same terms in TSL on `ShoreSurf`, add the
   shallow-water color gradient and preserve the existing illumination,
   transparency and horizon sink. Do not add geometry or draws.
4. **Clock and comparison seam.** Thread elapsed seconds through
   `Beaches.update`; freeze it while paused. Add DEV `?shoreFx=off`, validated
   like the existing beach A/B switch and absent from production output.
5. **Correctness and wiring.** Extend the beach render tests and diagnostics so
   the running game exposes that the animated path is active and its time moves
   only when expected. Run typecheck, lint and focused deterministic tests.
6. **Reference-GPU checkpoint.** Capture the three baseline views at multiple
   animation phases, plus the exact static/animated A/B. Read every frame for
   seams, lockstep pulsing, white slabs, ocean overlap and dusk behavior.
7. **Budget, gate and docs.** Run the affected locked High budget views and the
   full deterministic gate through `remote-run`. Update `MASTER_PLAN.md`,
   `docs/terrain.md`, `docs/testing.md` and the final L2 handoff with measured
   costs, captures and any rulings.

## Acceptance

- The shore visibly breaks and recedes along the curved coastline; shallow
  water has depth/color structure instead of a static white feather.
- Animation pauses with the game, the old static path remains available only
  for DEV comparison, and the production build contains no query-control text.
- No new meshes or draws, no simulation changes, no validation errors, and no
  new budget failure.

