# C4 asymmetric engine-loss yaw: plan (2026-10-11)

MASTER_PLAN Track C4's remaining item: a multi-engine airplane whose engines no longer make equal
power yaws toward the weaker side instead of losing only the average share of its centerline thrust.

## Header

- **Branch:** `c4-engine-out-yaw`, worktree `/home/mark/projects/ww2airsim-c4-engine-out-yaw`,
  cut from `main` at `b8c17fb7`.
- **Viewing checkpoint:** final product only.
- **Run:** unattended, to completion.
- **Heavy jobs:** focused deterministic tests may run locally; the complete gate runs on ryzen as
  `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify`. No GPU work is planned.
- **Delivery:** commit and push this branch. Do not deploy or merge to `main`.

## Rulings (Mark, 2026-10-11)

- Preserve the simplified rate-command flight model. This is not an inertia or torque-model rewrite.
- Derive signed asymmetry from each engine's existing deterministic output and its indexed engine
  hit zone's lateral position. Use the natural arm-weighted severity; no per-airframe tuning table.
- The effect is airborne only. The existing wheel/ground rate regime remains the last word during
  take-off, landing and taxi.
- Existing auto-rudder and AI feedback may counter the yaw. Add no explicit engine-out trim logic.
- Defer windmilling-propeller drag, explicit AI engine-out behavior and ground/take-off asymmetry.
- Healthy, symmetric and single-engine flight must remain bit-identical.

## What is in the code

| Fact | Where | Consequence |
| --- | --- | --- |
| Multi-engine damage has one health and deterministic output per engine, indexed port to starboard. | `src/sim/damage/model.ts` | The source signal already exists, including independent sputter windows. |
| Each indexed engine hit zone has a measured body-frame center; body +Z is starboard. | `content/aircraft/*.json`, `src/sim/weapons/schema.ts` | The lateral thrust arm can be derived from existing content without adding a second engine-position list. |
| Production averages all engine outputs before calling `damagedSpec`; that derived spec scales the one summed engine. | `src/sim/loop.ts`, `src/sim/damage/model.ts` | The sign and arm are currently discarded at the damage/flight seam. |
| Flight moments are commanded body rates plus weathercock stability, not torque and angular acceleration. | `src/sim/flight/model.ts` | Asymmetric thrust must enter as a bounded rate bias to stay consistent with the chosen model. |
| On wheels, `groundBodyRates` replaces airborne roll and pitch but retains ordinary aerodynamic yaw. | `src/sim/flight/model.ts` | The new contribution needs an explicit airborne-only gate at that seam. |

## Design

`engineOutputs` remains the one deterministic source of per-engine power. `damagedSpec` accepts that
vector in addition to its existing scalar-compatible/default path, keeps scaling summed power by the
mean, and derives a transient flight-only asymmetry value on the returned `AircraftSpec`:

```text
arm imbalance = sum(engine lateral z * engine output)
                / sum(abs(engine lateral z))
```

The denominator is the healthy fleet's total absolute arm. Equal symmetric outputs cancel exactly.
A dead engine on a twin gives magnitude 0.5; losing a four-engine bomber's outer engine gives about
0.34 and an inner engine about 0.16. Positive body +Z thrust produces positive body +Y rotation,
which is nose-left in this coordinate system: the surviving starboard engine therefore yaws the nose
toward a dead port engine, and vice versa.

The transient value is added to `AircraftSpec`'s TypeScript-only extension, beside `storesLoad`; it is
not legal JSON content and adds no new duplicated engine-location data. `step` converts it to a yaw
rate by multiplying by throttle, existing yaw-rate authority and the aircraft's existing maximum yaw
rate. It then adds that rate beside the weathercock term, before the ground override. The existing
ground seam removes that contribution. The existing maximum yaw rate is also the bound: natural imbalance plus pilot rudder and weathercock cannot make
this simplified model rotate faster merely because a new contributor exists.

The effect uses actual per-tick engine outputs, so an independently sputtering engine produces a
deterministic intermittent yaw. At closed throttle the asymmetric-thrust rate is zero. No extra drag
is charged to a dead propeller in this plan.

## Tasks

1. Write this plan and email it as HTML with `tools/mail-doc.py`.
2. Add failing, table-enrolled deterministic tests for all five multi-engine airframes: symmetric
   output gives no bias; a port loss and a starboard loss give equal opposite signs; twin loss is
   stronger than either inner four-engine loss; outer four-engine loss is stronger than inner.
3. Add flight behavior tests: the nose yaws toward the dead engine, opposite rudder can counter it,
   closed throttle produces no asymmetric-thrust yaw, and the ground regime suppresses it.
4. Extend the TypeScript-only `AircraftSpec` shape with the transient asymmetry field.
5. Carry `engineOutputs` through `loop.ts`; derive the normalized signed arm imbalance in
   `damagedSpec`; add the bounded airborne rate in `flight/model.ts`.
6. Protect the unchanged paths: healthy/symmetric multi-engine, healthy single-engine and damaged
   single-engine behavior stay exact; determinism and finite-state tests stay green.
7. Update `docs/aircraft.md` D6 to describe summed baseline power plus independent engine damage and
   asymmetric handling. Close the C4 open item in `MASTER_PLAN.md` without duplicating the plan.
8. Run focused damage/flight tests, typecheck and lint as useful, then
   `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify`.
9. Write the dated handoff with measurements, remaining risks and deferred scope; email it.
10. Commit coherent changes and push `c4-engine-out-yaw`; no deployment and no merge.

## Acceptance

- All indexed multi-engine aircraft yaw toward the weaker engine in flight, with ordering determined
  by their real content arms and no per-airframe magic numbers.
- Equal left/right output, all single-engine aircraft and all wheel-contact cases have zero new bias.
- The same aircraft id, tick and damage produce the same output and yaw.
- The full deterministic gate passes on ryzen.
