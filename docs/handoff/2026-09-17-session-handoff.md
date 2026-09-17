# Session handoff — 2026-09-17

Written for a fresh agent with no context. Tree is **clean** at `0ecf511`,
pushed. `npm run verify`: exit 0, **894 passed, 1 skipped**. `npm run build`:
exit 0.

**Read this first, then the two documents it points at.** Do not re-derive
anything below; every number here was measured today.

---

## THE ONE OPEN TASK: Mark's rudder is inadequate and blocked

This is what he wants next, and it is the only thing actively in flight.

### The symptom, in his words

> "releasing the rudder should not just return you to the original heading … a
> rudder should help you come to a new heading (albeit less quickly than a bank
> — I agree) and when the rudder is released you should stay on that heading."

### The metric that matters

**Heading retention.** Hold 5 s of full rudder at 50 m/s, release, fly 15 s
hands-off, and measure how much of the heading change survives once the
weathercock has returned the nose to the relative wind. Measured today:

| `aero.cySlopePerRad` | Held during input | After release | Retained |
| --- | --- | --- | --- |
| **0.10 (shipped now)** | 14.3° | 4.1° | **29%** |
| 0.50 | 14.9° | 8.5° | 57% |
| **0.90 (what it needs)** | 15.6° | 11.6° | **72%** |

Published Cy_beta for this class is 0.5–1.0/rad referenced to wing area, so
0.90 is inside the physical range and 0.10 is a ninth of where it belongs.

**Do not measure lateral displacement instead.** That was my first mistake: 3 s
of full rudder moves the airplane 0.4 m, and even at 0.9 it is under a metre. A
gentle bank moves it 2.8 m in 3 s. Mark explicitly agreed bank is the right way
to translate and is **not** asking for rudder to do it. He wants the heading to
stick.

### What is blocking it: `measureClimbRate` is path-dependent

> **Superseded later the same day.** Re-measured: the card is NOT
> path-dependent. Every attitude from 0 to 30 degrees settles to one state,
> wings level with zero sideslip, and reads identically at every
> `cySlopePerRad` (15.775 m/s at 24 degrees, to the last digit). From 32
> degrees up the airplane departs in the pitch-up transient, rolls through
> 180 degrees and is still tumbling when the sample window opens; a tumbling
> airplane is intermittently unstalled, so the stalled-sample filter let
> those windows through and their vertical speed was random (-29 to +23
> m/s). The "fast branch" was a departed sample on an upswing. Fixed by
> accepting only a steady sample -- see `STEADY_PITCH_ERR_RAD` in
> `tools/testcards/measure.ts` and the new "same climb rate at any
> lateral-force coefficient" card in `tests/sim/testcards/f6f.test.ts`. The
> section below is kept as the record of what was believed at hand-off.
> With the card fixed, `aero.cySlopePerRad` was raised to **0.90** in the
> commit after; the retention table above reproduced exactly (29 / 57 / 72%)
> before the change was made. Mark flew it that evening, liked the lateral
> movement, asked for **1.00**, then for ~90% heading retention and chose
> **2.00** from a measured grid (88%). That is what ships. The trade (about
> 5 g lateral at full rudder at 200 m/s, no cap applied) is recorded in the
> content file's `cySlopePerRad` note.


`tools/testcards/measure.ts`. At a held pitch attitude with the altitude
**pinned**, the airplane has a fast and a slow settling branch. Each is
genuinely converged — 20.5 m/s stable from 100 s through 400 s at the 24°
best-rate attitude — and any perturbation of the 120 s transient from the
103 m/s spawn decides which branch it reaches. The card then takes the best
over a 0–40° sweep.

Consequence, and the thing that makes this a defect rather than a tuning job:
**the card's pass/fail is NON-MONOTONIC in `cySlopePerRad`.**

| Coefficient | Climb card |
| --- | --- |
| 0.2 | fails (20.5 m/s) |
| 0.5 | **passes** |
| 0.7 | fails (22.1 m/s) |
| 0.9 | fails (22.9 m/s) |

Reference is **13.51 m/s** at a 25% tolerance.

### Rules for whoever picks this up

- **Do not tune `cySlopePerRad` until the card passes.** 0.5 passing is luck.
  I nearly shipped it and stopped because a green suite would have been
  meaningless.
- **Do not widen the climb card's tolerance.** 13.51 m/s (2,660 ft/min) is a
  cited Patuxent trial figure. `tests/sim/testcards/f6f.test.ts`'s own rule is
  "tighten or re-measure as the model changes; never widen to whatever passes."
- **Do not add a stalled-point rejection and expect it to help.** I added one
  (it is still there, and it is correct on its own merits — a stalled airplane
  is not climbing). The winning sweep points are **not** stalled: alpha 4–6.5°,
  sideslip exactly 0.000, speed 57–71 m/s.
- The fix is to make the card measure a **defined condition** rather than
  whichever branch a transient reaches. That is re-deriving a graded test card
  and should be treated as real work, not a patch.

### Two false trails already eliminated

1. **The altitude-hold assist's departure test** was the first blocker. Mark
   had it deleted today (see below). Gone.
2. **Unbounded side force.** `sideForceN` now saturates at
   `SIDESLIP_CRIT_DEG` = 20° and fades out past the stall via
   `attachedFlowFraction`. Both were needed and both are measured in their doc
   comments — an unbounded version hit 2886 N in a departed state where
   `asin(dot(vdir, right))` reads −88.5°, which is not a sideslip in any useful
   sense.

---

## What shipped today

**Plan 11a completed and merged** (`a3e5e21`): the Tacloban runway strip, the
spawn turned north (it faced east, at water 900 m away), and the Tier 2
take-off spec — which **ran on the real GPU for the first time and passes.**

**Plan 11b complete** (`9e1cc4e`) — flaps, ground effect, lateral tire force,
the approach autopilot, tuned gates. Read
`docs/handoff/2026-09-17-plan11b-landing.md`; it is the authoritative record.
Headline: **the airplane lands.** Touchdown 1.47 m/s at 85.9 mph, 0.0 m off the
centreline. The flap lift increment is *derived* from two sourced stall speeds,
not estimated.

**The ocean was fixed after three wrong diagnoses.** `landWeight` demanded the
terrain DEM read 2 m below sea level before allowing waves; the DEM never goes
below 0 anywhere in the 200 km box, so it was a hard zero over all water since
Plan 5's last commit. See `cefb184` and the commits around it. The lesson is in
"How to work on this" below.

**Altitude hold deleted** (`0ecf511`) at Mark's request — he asked what it was
and established he had never requested it.

**Controls changed.** Yaw is now **Z / X**. Throttle is **`=` / `-`**
exclusively; Shift is no longer a throttle key, and every test and both Tier 2
specs were updated.

---

## Outstanding, in Mark's rough priority order

1. **The rudder.** Above. Blocked on the climb card.
2. **Tier 3 landing.** Nobody has hand-flown a landing to completion. He came
   within **0.8 mph** on his first attempt — impact at 54 m/s against a
   53.645 m/s gate, sink 2 m/s, bank −1°. The autopilot proves the envelope
   exists; it cannot say whether the flare *feels* right.
3. **Waves not visible far enough away.** His words: at cruise the ocean "looks
   essentially like a flat color". Diagnosed and deferred — the cascade set tops
   out at a 509 m patch whose shortest wavelength is 32 m, and the fade keys a
   cascade to its shortest component, so the whole 32–509 m band dies at once.
   The fix is a fourth long-wave cascade (~2 km patch banded to 256 m), costing
   an FFT pass and a GPU-budget re-measurement. Full diagnosis is in
   `docs/handoff/2026-09-15-plan5-ocean.md`.
4. **No navigation instrument.** He got airborne and could not find the
   airfield. The data strip shows speed, altitude, heading, gear and flaps but
   no position. I offered a bearing-and-distance-to-Tacloban readout in
   `flightData.ts` and he has not answered. Plan 14 is the map, deferred.
5. **Plan 12 is next in the roadmap** (spec §15): entities, ships and airfields.
6. **`?spawnX/Y/Z` is a trap for him.** Any spawn override turns the ground
   spawn OFF — airborne, 120 m/s east, gear up, 56 km from Tacloban. He spent a
   flight lost because a debug URL I gave him was still in his address bar.
   **Always tell him to use the bare URL** unless he wants to be airborne.

---

## How to work on this project

Learned expensively today; ignoring these cost several hours.

### Never reason about rendered output — look at it

Three consecutive wrong ocean diagnoses came from arguing about a picture I
could not see. The loop that works, once a Playwright server is running in
Mark's console session on the Windows desktop:

```sh
npm run dev:lan                              # on nexus
ssh -N -L 39001:127.0.0.1:3000 ryzen         # control tunnel
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org \
  npx playwright test tests/e2e/<spec>.spec.ts
```

A throwaway spec that navigates to `?spawnX/Y/Z&oceanTier=` and calls
`page.screenshot()` gets a PNG onto nexus, which you can then **read directly**
or analyse numerically (per-row texture energy turns "looks like a band" into a
number). `README.md`'s Tier 2 section is authoritative for the tunnels. The
tunnel on 39001 may still be up.

### Measure, then change. And measure the thing being complained about

Every good result today came from a measurement; every wrong turn came from
reasoning. I twice "fixed" the rudder while measuring the wrong quantity.

### Tests here encode decisions — read before changing

Several tests exist to prevent a specific named regression, with the
measurement in the comment. When one fails after a deliberate change:
**re-measure and record, never widen.** And check whether the property it
asserts actually holds elsewhere — widening the altitude-hold departure test to
four entry conditions showed it was already false at one of them with no side
force at all.

### `aero.clMax` is inert

`liftCoefficient` has not read it since Plan 1's finding C1. It agrees with the
curve's real peak to 1.3e-4 by coincidence. Changing it does nothing, and it
looks exactly like the right thing to change.

### Assert exact anchors when editing with scripts

A `str.replace` that silently does not match cost me a debugging cycle today.
`assert old in s` before every replace. And `tsc` is faster than a test at
finding a wrong call signature — `createWorld` needs controls, and `DT` lives in
`src/sim/flight/model.ts`, not `src/sim/loop.ts`.

### Mark's standing preferences

- **Keep him out of the test loop.** He wants to judge feel, not find bugs.
- **Email him plans and specs as HTML**: `python3 tools/mail-doc.py <file.md>
  "<subject>" [preamble.md]`. Plain text destroys the tables these documents
  are made of, and `marktuttle.dev` is blocked on his work network so email or
  a GitHub link is the only channel that reaches him there.
- Production deploys are manual: `gh workflow run deploy.yml --repo
  coder999/ww2airsim`. Production is currently on `549e272` — **behind main**,
  so landing and the rudder work are not deployed.
- He flies on `https://ww2airsim.windomlane.org` (nexus dev server, main
  checkout). Hard-reload after any push: WebGPU pipelines are built at boot.

---

## Housekeeping

- An orphaned `vite --port 5174` is still running on nexus from a worktree I
  removed. Harmless, serving a deleted directory, safe to kill.
- Tier 2 full suite: 23 of 24 passed on the first run today; the 24th failed on
  `net::ERR_QUIC_PROTOCOL_ERROR` during `page.goto` and passed on re-run twice.
  Transport flake, not a defect.
- The GPU frame-time budget was re-measured after the ocean mesh doubled to
  529,416 vertices: p50 3.211 ms, p95 3.277 ms at 1440p over Leyte. Within the
  figures in `tiers.ts`. That debt is closed.
