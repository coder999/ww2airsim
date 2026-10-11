# Handoff: C4 asymmetric engine-loss yaw (2026-10-11)

**Merged:** feature branch `c4-engine-out-yaw` was integrated into `main` by
`4e5c2f61`; the final combined C4/Surigao/ground-vehicle integration is
`14c33607`. **Plan:**
`docs/superpowers/plans/2026-10-11-c4-asymmetric-engine-yaw.md`. **Run:** unattended;
final-product checkpoint only. No deployment was performed.

## What is there now

Every damageable multi-engine airplane now yaws toward its weaker engine in the air. Production keeps
the existing per-engine deterministic output through the damage/flight seam instead of reducing it to
the mean too early. `damagedSpec` still uses that mean for summed power, and separately derives a
signed, normalized moment from each indexed engine hit zone's lateral arm.

The rate-command flight model converts that fraction into a bounded yaw-rate contribution with the
undamaged maximum yaw rate, throttle and dynamic-pressure authority. The absolute bias and healthy
cap are captured before damage scales ordinary yaw-control authority, so coincident rudder/yaw damage
cannot reduce or erase engine-out thrust. Ordinary rudder, auto-rudder and AI feedback can oppose it.
The ground seam removes only the new engine-out contribution; ordinary aerodynamic/weathercock yaw
remains intact.

Fully healthy output returns the original spec object. Symmetric degraded output still derives its
existing mean-power spec but adds no yaw field. Production now passes the output vector for every
aircraft; a single-engine vector derives no bias and is regression-tested against the scalar direct
call for equal results. No JSON schema or duplicated engine-position list was added: the transient
`AircraftSpec.asymmetricThrustYaw` field is TypeScript-only.

## Measured result

These are the one-port-engine-dead fractions and corresponding rates at full throttle, reference
dynamic pressure and zero sideslip. The opposite side is equal and opposite.

| Aircraft | Outer fraction | Inner fraction | Outer rate | Inner rate |
| --- | ---: | ---: | ---: | ---: |
| B-17 | 0.3415 | 0.1585 | 2.73 deg/s | 1.27 deg/s |
| B-29 | 0.3302 | 0.1698 | 1.98 deg/s | 1.02 deg/s |
| G4M | 0.5000 | same engine pair | 5.00 deg/s | same |
| Ki-21 | 0.5000 | same engine pair | 5.00 deg/s | same |
| P-38 | 0.5000 | same engine pair | 6.00 deg/s | same |

The numbers come directly from the existing hit-zone centers: B-17 arms 6.53/3.03 m, B-29
14.2/7.3 m, and the symmetric twins' one surviving arm is half the total absolute arm. They are not a
new tuning table. At lower throttle or dynamic pressure the rates fall by the same existing authority
curves.

## Tests and verification

- `tests/sim/damage/stages.test.ts` enrolls all five multi-engine aircraft. It holds exact healthy
  identity, equal/opposite failed-side signs, outer-over-inner four-engine leverage, scalar/vector
  single-engine result equivalence, and the production `advance` wiring. Port and starboard losses
  retain the same signed bias with partial or zero yaw-control health.
- `tests/sim/flight/asymmetricThrust.test.ts` holds nose direction, exact opposite-rudder cancellation
  for a symmetric twin at zero sideslip, the healthy combined cap after yaw-control damage,
  closed-throttle suppression, absent-versus-zero bit identity, and airborne-only behavior at the
  wheel-contact seam.
- Tests-first checkpoint: the two focused files initially had 11 expected failures; after the
  implementation they pass 44/44.
- Review follow-up: new production regressions first failed on both port and starboard losses
  (40% yaw-control health reduced the bias to 40%; zero erased it). After separating the transient
  bias/bound from damaged control authority, the focused files pass **46/46**, including partial and
  zero yaw-control health; `npx tsc --noEmit`, focused ESLint and `git diff --check` also pass.
- `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify` was run twice. Typecheck, lint and depcruise
  were clean both times. Each full suite reached **5,708 passed, 11 skipped**, with no assertion
  failures, but the shared runner was concurrently rebuilding models and a different pair of
  30-second tests timed out on each run. First: two `attack.test.ts` cases; second:
  `aiLethality.test.ts` and the entity soak. All timeout files then passed alone: `attack.test.ts`
  30/30, `aiLethality.test.ts` plus `soak.test.ts` 15/15. This is recorded as runner contention,
  not a green full-gate claim.

## Scope deliberately left open

- No windmilling or feathered-prop drag beyond the pre-existing averaged-power loss.
- No explicit AI trim or engine-out maneuver logic. Existing pilot and auto-rudder feedback see and
  may counter the yaw.
- No asymmetric ground/take-off yaw.
- This remains the chosen simplified rate-command model, not individual engine forces, moments of
  inertia or angular acceleration.

Those boundaries are recorded in `docs/aircraft.md` D6 and `MASTER_PLAN.md` C4.

## Final integrated status

The merged main-tree verification at `14c33607` passed typecheck, lint,
dependency analysis, `git diff --check`, all 376 focused integration tests,
and all C4 coverage in the 5,959-test full run. The full run's only failure
was the pre-existing Escort easy/unescorted loss-count assertion, reproduced
unchanged on main before the ground-vehicle merge.
