# Flaps, approach and landing ashore — Plan 11b, 2026-09-17

The F6F can fly an approach into Tacloban and land on it, and a scripted
autopilot proves it on every commit instead of Mark crashing.

Master spec §15 has the plan numbering and ordering; this document does not
restate it.

## The two things that were actually hard

Neither was the aerodynamics.

### `aero.clMax` is inert, so the obvious flap model does nothing

Flaps raise maximum lift, so the natural change is to raise `clMax`. That
would have compiled, typechecked, passed every existing test, and done
**nothing at all**.

`liftCoefficient` has not read `clMax` since Plan 1's finding C1 rebuilt the
lift curve to take its post-stall peak from the attached-flow line at
`alphaCrit`. That function's own comment says so. Measured: the curve peaks at
**1.400013** against a `clMax` field of **1.4** — they agree to 1.3e-4 by
coincidence, which is exactly what would make the mistake look right.

Flaps instead shift `clAtZeroAlpha`, which is what added camber physically
does. **And the increment goes inside `liftCoefficient`'s `attached` closure,
not onto its result** — the post-stall branch reads that same closure, so
adding it outside would lift the attached branch, leave the peak behind, and
re-open finding C1's 0.2007 discontinuity (worth 1.17 g, in the direction of
*more* lift past the stall) only with the flaps down, which is where nobody
would look for it.

### The acceptance loop had closed back onto Mark

He asked to be kept out of the testing loop; that requirement drove the
three-tier design. Landing was the one subsystem where it had failed: the gates
were chosen by calculation, nothing flew an approach headlessly, and the only
signal the envelope was wrong was him crashing.

Master spec §11 has prescribed a scripted `approach` autopilot since before
Plan 1 and it had never been built. It is `tools/autopilot/approach.ts` now.

## The number that is derived rather than guessed

`f6f-hellcat.json`'s own `reference.source` already carried both figures, and
already said the second was out of reach:

> "The same table's landing-condition power-off stall is 84.5 mph (37.77 m/s)
> … it is unreachable for a model with no high-lift devices."

Stall speed goes as 1/√CLmax at fixed weight, so those two figures fix the
flap increment completely:

| Quantity | Value |
| --- | --- |
| Clean power-off stall | 43.81 m/s (98.0 mph), graded already |
| Landing power-off stall | 37.7749 m/s (84.5 mph), same trial table |
| Required CLmax ratio | ×1.3451 |
| Curve's actual peak | 1.400013 |
| **`flap.clIncrement`** | **+0.4831** |

84.5 mph is now `reference.stallSpeedFlapMps`, promoted out of prose because a
graded card cannot read prose.

## Measurements that matter

**The flap model validates better than the clean model does**, and the
comparison is the evidence, not the absolute error:

| Card | Measured | Trial | Error |
| --- | --- | --- | --- |
| clean stall | 45.38 m/s | 43.81 | +3.6% |
| **full-flap stall** | **38.96 m/s** | **37.775** | **+3.1%** |
| CLmax ratio achieved | 1.3566 | 1.3451 derived | +0.85% |

The flap figure is no worse than the clean one and biased the same direction,
so the flap model inherits this model's existing stall bias rather than adding
error of its own. A wrong flap model would show as a **divergence** between
those rows.

**The take-off card is like-for-like for the first time.** It grades against a
FULL-FLAPS trial run, and until today the model was flown against it with no
flaps and no ground effect — two errors of opposite sign cancelling, as
`f6f-hellcat.json` said of itself all along:

| Flaps | Roll | vs the 230.124 m trial |
| --- | --- | --- |
| 0 (as graded until today) | 228.738 m | −0.602% |
| 0.5 | 231.666 m | +0.670% |
| **1 (as the trial flew)** | **236.085 m** | **+2.590%** |

11a projected +4% and pre-authorised the re-measure. Tolerance went 2% → 4%.

**`flap.dragAreaM2` was deliberately NOT tuned to close that gap**, which
departs from this plan's own text. Fitting one free parameter to one trial
number makes the card tautological — guaranteed to agree, and therefore unable
to detect anything. 11a avoided exactly that by taking
`gear.rollingResistanceCoeff` from generic tire figures and *reporting* the
agreement. So 0.6 m² stands on independent grounds: twice the extended gear's
drag area, and 92% of the airframe's own 0.655 m² zero-lift drag area.

**The residual has a named cause.** The model has ground effect's induced-drag
reduction but deliberately not its lift increase. The missing lift would take
weight off the wheels and reduce rolling friction, shortening a real roll — so
a model without it over-charges friction and rolls **long**, which is the sign
observed. Expect this figure to move again if anyone adds ground-effect lift.

**The wheels now go where they point.** Worst sideslip in a 20 s full-rudder
taxi turn at 12 m/s: **113.6° before, 2.7° after.**

**The first flown landing in this project:**

| Quantity | Value |
| --- | --- |
| touchdown sink | 1.47 m/s |
| touchdown speed | 38.4 m/s (85.9 mph; full-flap stall is 37.77) |
| touchdown point | 568 m in from the approach end |
| worst sink on the approach | 3.95 m/s |
| came to rest | 60 m past the strip centre, **0.0 m off the centreline** |

## Every number that is a guess

| Constant | Value | Notes |
| --- | --- | --- |
| `flap.clIncrement` | 0.4831 | **DERIVED** from two sourced stall speeds — the one figure here that is not a guess |
| `flap.travelSeconds` | 5 | Round figure for a hydraulic flap cycle |
| `flap.dragAreaM2` | 0.6 | Twice the gear's drag area, 92% of the airframe's own. NOT fitted to the take-off card — see above |
| `gear.lateralGripSeconds` | 1.5 | No trial measures how fast a tire kills sideways motion |
| `MAX_SUPPORTED_SINK_MPS` | 4.0 | **Mark's call.** See below |
| `MAX_SUPPORTED_SPEED_STALL_MULTIPLE` | 1.42 | **Mark's call**: 120 mph, ÷ the 84.5 mph landing stall |
| `FLARE_HEIGHT_M` | 12 | Autopilot tuning value |
| `VREF_STALL_MULTIPLE` | 1.3 | Conventional Vref multiple |
| Ground effect | — | **No fitted constant at all.** McCormick's φ |

### The two gates Mark decided, and one question left open

**The speed gate is 120 mph, his figure.** Stored as a multiple (1.42) of the
configuration's stall speed rather than as a speed, so the rule generalises to
aircraft with different stall speeds. **What the multiple form hides, and what
is genuinely unresolved:** with the flaps out the cap is exactly 120.0 mph, but
CLEAN it is 139.2 mph, because a clean wing stalls at 98 mph against 84.5 and
the same multiple is a higher absolute speed. If 120 mph should be absolute
regardless of configuration, this needs to become a speed rather than a
multiple. **Ask Mark before changing it.**

**The sink gate stays at 4.0 m/s**, and the reason it needed documenting is
that the question was asked badly. Mark read 4 m/s as a forward speed — "just
8.9 mph, that is very slow" — which is a fair reading of a bare number beside
an 85 mph approach. It is a *sink* rate: about 790 ft/min, where a normal
touchdown is 200–400. A flown approach arrives at 1.47 m/s, 2.7× inside it.
Kept on type grounds: the F6F was a carrier airplane stressed for 3–6 m/s deck
arrivals, and Plan 8 needs that headroom.

Graduated hard-landing damage was explicitly **not** recorded as a future item,
at Mark's request.

## Verification

- `npm run verify`: exit 0, **903 passed, 1 skipped**.
- **Tier 2: EXECUTED, which is new.** A Playwright server was running on the
  reference desktop, so the full suite ran on the real GPU: **23 of 24 passed
  on the first run**, the 24th failing on `net::ERR_QUIC_PROTOCOL_ERROR` during
  `page.goto` — a transport error, confirmed transient by re-running it green
  in isolation twice.
- **11a's `takeoff.spec.ts` ran for the first time and PASSES.** It was written
  and never executed; the whole Plan 11a production path is now confirmed end
  to end.
- `tests/e2e/approach.spec.ts` is new and passes. It deliberately does **not**
  fly an approach: the autopilot is a node-side instrument in `tools/` and
  cannot reach the browser, and hand-driving a 5 km approach through
  `page.keyboard` would test the harness rather than the game.
  `tests/sim/landing.test.ts` flies it headlessly every commit, which is the
  right tier. What only Tier 2 can prove is that the flap lever a pilot presses
  reaches `world.controls` in a real browser — the Plan 3 defect class.
- **The GPU frame-time budget re-measurement owed since this morning is done:**
  gpu p50 **3.211 ms**, p95 **3.277 ms** at 1440p over Leyte, against the
  3.277/3.539 ms in `tiers.ts`. Doubling the ocean mesh to 529,416 vertices
  cost nothing measurable.
- **Tier 3: not done.** Mark has not hand-flown a landing.

## What is not done

- **Tier 3.** Nobody has flown an approach by hand. The autopilot proves the
  envelope exists; it cannot say whether the flare *feels* right, which is the
  only question left about it.
- **A newly reachable pre-existing soak failure, recorded rather than hidden.**
  Seed 7 now reports 1 failure in 200 flights: iteration 62, tick 1777, the
  wheels 0.253 m below a 0.25 m tolerance —

  ```
  runTerrainSoak(f6f, 200, 7, terrain)   // iteration 62, spawn x -14671 z -36033 alt 206
  ```

  **Bisected the same day.** Disabling the lateral grip alone returns seed 7 to
  exactly 11a's figures: 300 contact ticks, 0 failures. With it, 16,438 ticks
  and that one failure. So the grip added no vertical mechanism — it kept the
  airplane rolling 55× longer and made a pre-existing marginal case in
  `restOnSurface` reachable, at 1 tick in 16,438. `restOnSurface` is Plan 10/11a
  code that 11b never touched. Seed 1337, the committed configuration, is clean.
  The likely mechanism is ground rising faster than `GROUND_CONTACT_TOLERANCE_M`
  in one tick under a resting airplane, on terrain steeper than Tacloban's.
- **A clean-configuration touchdown is allowed up to 139.2 mph**, per the gate
  question above.
- **Ground-effect lift** and **flap-induced stall-angle reduction** are both
  deliberately unmodeled; each is named at its own definition.
- **Downhill rolling still costs energy** — 11a's finding, pre-existing,
  unchanged. Tacloban is flat enough that it did not bind on the landing test.
- **A held full nose-up still over-rotates into a stall and porpoises.** The
  autopilot works around it with a bounded flare input rather than fixing it.
- **A player-facing approach assist** was left out on purpose. Plan 3 owns
  assists; if landing proves too hard by hand it is that plan's addition.
- **Carrier landings** are Plan 8, by §15's own coupling: a fixed runway first
  so a landing defect has one candidate cause.

## The record

Three defects were found by *flying* the landing rather than by reading code,
and they are the part of this process worth keeping:

1. `createWorld` requires controls; passing two arguments stepped the whole
   flight with `undefined`, and the test's only complaint was "never touched
   down". `tsc` named it precisely.
2. `DT` lives in `src/sim/flight/model.ts`, not `src/sim/loop.ts`. The import
   resolved to `undefined`, `advance(world, undefined)` advanced nothing, and
   the airplane sat still for 300 simulated seconds.
3. The autopilot's path loop normalised its height error by the distance to the
   aim point, so a 10 m error at 5 km produced `atan2(10, 5000)` = 0.002 rad
   and a pitch command of 0.006. It was effectively open-loop, built a 5.28 m/s
   sink on a path that wants 2.57, and drove the wheels 2.21 m underground.
   Replaced with a cascade — height error sets a sink target, sink error sets
   pitch — and the flare height went 5 m → 12 m, because at 49 m/s five metres
   is **one tenth of a second** in which to arrest a sink. The original number
   was written without doing that arithmetic.

One existing test had to change, and the reason is worth keeping too:
`tests/sim/ground.test.ts` asserted a gear-up airplane at ground level steps
identically with and without terrain. Ground effect is a terrain-dependent
branch that is deliberately gear-**agnostic** — it is about the wing, and a
belly landing gets it too — so that claim became false for a good reason. It is
now three assertions instead of one, and the out-of-ground-effect case is a
bound rather than an equality, because McCormick's φ approaches 1 only
asymptotically (0.9999976 at 40 wingspans) and bit-identity was never
achievable.
