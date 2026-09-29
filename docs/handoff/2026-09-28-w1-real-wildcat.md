# W1 handoff: the real F4F-4 Wildcat (2026-09-28)

W1 replaces the Wildcat's placeholder Hellcat numbers with a sourced F4F-4
flight model, draws it at its real span and Grumman's parked angle, gives it a
racks-only loadout, and onboards it through one generic graded card suite. The
spec is [`2026-09-28-w1-real-wildcat-design.md`](../superpowers/specs/2026-09-28-w1-real-wildcat-design.md)
and the plan is [`2026-09-28-w1-real-wildcat.md`](../superpowers/plans/2026-09-28-w1-real-wildcat.md).
The run was unattended, with the final product as the one checkpoint (the
captures below). It was interrupted twice at token limits and resumed from the
committed tasks; the ledger is `.superpowers/sdd/2026-09-28-w1-real-wildcat/progress.md`
(gitignored).

**Branch `worktree-w1-wildcat`, pushed, not merged.** Merging is Mark's call.

## What changed

- **One graded card suite** (`tests/sim/testcards/graded.test.ts`) grades every
  aircraft from its `reference`. The F6F and the Zero moved in as-is; their
  content is untouched.
- **The F4F-4 flight model**, `content/aircraft/f4f-wildcat.json`, sourced from
  the 1942 Anacostia trials and Grumman's detail specification. Every figure
  carries its source or a SOURCED/DERIVED/FITTED/ESTIMATE label.
- **The drawing**: rescaled to the real 11.582 m span and centered on its
  quarter-chord; the main legs lengthen at load so it parks at Grumman's
  12°20′ (the model's own legs give 7.43°). The stretch telescopes out over the
  last quarter of gear travel, so the stowed and mid-travel gear are the
  model's own (ruling C).
- **Guns, zones and a racks-only loadout**: six guns at 240 rounds each, zones
  fitted inside the airframe, no rockets (R3). `rails` may now be empty, and a
  no-rails aircraft flies with zero rockets and no throw. Wildcat forms offer
  Clean and Bombs only.
- **Docs**: [`docs/aircraft.md`](../aircraft.md) is the onboarding runbook.

## Measured figures (2026-09-28, held by the graded cards)

| Card | Result | Against |
| --- | --- | --- |
| Top speed, SL to 19.4k ft | +0.50% to +1.71% | Grumman trials, 7 altitudes |
| Climb, sea level | +16.84% | the F6F's own bias is +16.77% |
| Climb, 16,300 ft | +5.05% | sourced |
| Stall, clean / flaps | 41.302 m/s (+2.11%) / 35.988 m/s (+1.86%) | 40.45 / 35.33 |
| Take-off at 73 mph | 174.14 m clean (-16.72%), 179.16 m full flaps (-14.32%) | 209.1 m |
| Roll at reference speed | 67.998 deg/s | 68 |

The take-off gap is **reported, not tuned** (R36): the source states neither
its flap setting nor its lift-off speed, and it is graded at 20%.

## Captures

In [`2026-09-28-w1-shots/`](2026-09-28-w1-shots/), read 2026-09-28: the
Wildcat sits nose-high on all three wheels and is visibly smaller than the
Hellcat.

- `parked-f4f-wildcat-side.png` and `parked-f6f-hellcat-side.png`: Tacloban,
  same camera.
- `deck-wildcat.png`: on the Essex (`deck-quals`).
- `cockpit-wildcat.png`: the cockpit view.
- `flight-wildcat-1000m.png`: in flight, gear up (the readout's 3,251 ft is the
  1,000 m spawn).

**For Mark to judge:** the main strut roughly doubles in length at gear down
(ruling D). It is R5's arithmetic, not a defect, but it is the one thing in
the drawing that may look wrong to the eye.

## Tier 2

On nexus's 680M against a worktree dev server on localhost:5176 (port 5175 was
held by detail-pass): `wildcat.spec.ts`, `sortie.spec.ts`, `hangar.spec.ts`,
all green. Two Hangar checks were updated for the new model: check 9's gizmo
list gains the four strut and wheel nodes the stretch moves, and check 11 now
expects the 2 bomb racks.

## Open items

- **Recorded model gaps (not fixed):** the parked propeller hub sits 2.347 m
  high, against about 2.10 m derived from the detail specification; the model's
  wheelbase is 5.04 m against 5.46 m; its main-wheel track is 1.28 m against
  1.96 m.
- **T1, the tailwheel in the physics** (its own spec): contact points in each
  aircraft's spec, with the parked angle derived from them and the drawing held
  to them; tail-up and tail-down from moments instead of `tailUpSpeedMps`;
  taxi steering (a castering, lockable tailwheel, differential brakes, propeller
  wash, auto-rudder out of ground handling); the rest attitude moves into the
  sim and the drawing-only stance is retired; the take-off cards, landing
  rest-point pins and AI take-off/landing (7g) are re-read; T1 re-grades through
  the graded suite.
- **Also out of scope:** the FM-2 (R1), drop tanks, a sourced F4F-4 roll rate,
  and the F6F's and Zero's zones beyond the allowlist.
- **Deferred minors from review:** `engine.maxPowerW` is 1199.9 hp (plan
  literal, 0.004%); the graded suite carries a ~150-line moved F6F history
  comment inline; British "metres" in `wildcat.ts` and `wildcatFrame.ts`
  comments; `wildcatFrame.ts` cites a gitignored probe as its method; the
  `MEASURED` source label is outside the four-label vocabulary (house
  precedent in `a6m2-zero.json`).
