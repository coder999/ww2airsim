# Plan 6a — The cockpit panel: design

**Status:** implemented 2026-09-15. See the [handoff](../../handoff/2026-09-15-cockpit-panel.md)
for final decisions, verification, and screenshots. The design discussion below
is retained as history; its open questions are resolved in the handoff.

**Goal:** Turn the instrument panel from a strip floating in the middle of the
frame into a dashboard that reads as part of the airplane, carrying the
instruments the flight model can honestly drive — and holding space for the
ones Plan 6 will earn.

**Spec section:** master spec §3/§4. This is infrastructure for the cockpit,
not a numbered plan in the §15 table; it takes the suffix `6a` because it lands
before Plan 6 and its reserved slots are Plan 6's.

**Prompted by:** Mark flying the deployed build on 2026-09-15 and reporting a
panel "just floating in the middle of the screen", alongside a screenshot of
*Hellcats Over the Pacific* (1991). The screenshot is a layout reference only —
every shape here is generated from our own geometry, not traced from theirs.

---

## 1. What the flight model can honestly drive

`src/render/gauges.ts:8-16` refuses to fit an instrument the model does not
produce, and gives the tachometer as its worked example: "a needle driven by
`throttle * 2700` would be a lie rendered at 60 fps". That rule decides most of
this design's scope, so it is restated as a table rather than argued again.

| Instrument | Backing state | Verdict |
| --- | --- | --- |
| Airspeed, altitude, climb, fuel, slip | existing | keep, unchanged |
| Heading | existing | keep, as a tape (§3) |
| Attitude | `attitudeAngles` | keep, as a ball (§3) |
| **Throttle** | `Controls.throttle` | **ADD** — real, modelled, currently invisible |
| Radar | needs other aircraft | reserve space, draw nothing (§5) |
| Armament / ammo | needs weapons | reserve space, draw nothing (§5) |
| Landing gear | not modelled | defer to Plan 8 |
| Flaps | not modelled | defer — see below |
| Manifold pressure, RPM | not modelled | not fitted (Mark, 2026-09-15) |

**Flaps deserve their own note, because they look cheap and are not.** The
model has no high-lift devices, and that absence is load-bearing: the stall
test card compares against Patuxent's **clean, power-off** 98 mph figure
precisely because of it, and `content/aircraft/f6f-hellcat.json:63` records
that citing the 84.5 mph landing-configuration figure was a past error,
"unreachable for a model with no high-lift devices". So an inert flaps lever is
a lie on the panel, and a working one moves a cited number. Flaps are flight-
model work, not instrumentation.

## 2. The geometry budget, which decides the layout

This is the part that is arithmetic rather than taste, so it is settled here
and asserted in the plan.

The panel's vertical extent has almost no slack. Measured 2026-09-15 at
`PANEL_AHEAD_M` 0.6 and `CAMERA_VFOV_DEG` 60:

- Today's panel spans **7.8° to 26.9°** below the eye line.
- The frustum edge is **30°**. Margin: **3.1°**.

That margin is not spare room, it is the residue of the 2026-09-13 fix that
moved `PANEL_BELOW_M` from 0.35 to 0.19 after every label and readout fell
outside the frustum (`panel.ts:78-92`). Two full-height instrument rows need
**0.446 m** against a **0.315 m** budget, so the obvious moves all fail:

| Move | Outcome |
| --- | --- |
| Grow downward with instruments | bottom edge at **41.3°** — outside the frustum, I-7 on the other axis |
| Grow upward at 0.6 m | top edge **13.2° above** the eye line — covers the horizon |
| Push the panel to 1.0 m ahead | fits, but no F6F panel sits a metre from the pilot, and it voids the eye-point reasoning at `panel.ts:93-99` |

**The resolution is asymmetric bands** (Mark's choice, 2026-09-15): one
full-size row of round dials, plus a *shallow* upper band carrying the
instruments that were never round anyway — the heading tape is a strip, radar
is a square, armament and future gear/flaps are indicator lights. Verified to
fit on 2026-09-15, keeping 3° of sky clear below the eye line:

```
   heading tape strip           0.030
   gap                          0.006
   radar / armament / lights    0.062
   gutter                       0.010
   readout digits               0.022
   gap                          0.004
   dial (r = 0.060)             0.120
   gap                          0.004
   label text                   0.022
   TOTAL                        0.280   against a 0.315 budget   (+35 mm)
```

**Dials stay at r = 0.060, unchanged.** Design spec §7's "legibility beats
period authenticity" is why the shallow band was preferred over shrinking every
gauge by 27% to make two equal rows fit.

**The bezel grows down and is clipped by the frame** (Mark, 2026-09-15). The
instrument zone ends at 27.4°, but the backing plate continues past the 30°
frame edge instead of stopping short. This is the actual fix for "floating":
today there is sky visible below the panel on both sides, and a dashboard that
runs off the bottom of the frame is what a cockpit looks like. Nothing is lost
by the clip because nothing readable is placed below 30°.

Horizontally the panel becomes **full width**, its backing reaching the frame
edges. Instruments stay inside the readable zone `PANEL_MIN_ASPECT` already
guards; only the bezel extends past them.

## 3. Instruments that change form

**Heading becomes a sliding tape** and the round `heading` dial is **removed**
(Mark, 2026-09-15). A window of the compass rose slides behind a fixed index at
the top of the band, current heading centred. Removing the dial rather than
keeping both frees a full slot and avoids printing the same number twice.

**Attitude becomes a ball, and the horizon bar is removed** (Mark,
2026-09-15). The bar at `panel.ts:260-265` is replaced by a round indicator on
the dashboard. Two reasons beyond fidelity: the reticle added on 2026-09-15
sits directly on the bar and the two crowd each other, and an instrument on the
panel is where a pilot looks for attitude.

> **This deletes real, hard-won test coverage, and the plan must replace it
> before removing the bar.** `panel.test.ts` checks the bar against the TRUE
> horizon by projection, and that test exists because an earlier `-rollRad`
> read -30.00° against a true horizon of +30.00° (`panel.ts:337-348`). The
> ball's tests must make the same comparison — projected screen angle against a
> world quantity — not restate the renderer's convention back at itself.

**Throttle is a vertical column gauge**, per Mark's reference image: black
face, filled bar rising on the right, labels at 0 and 100 only, nine tick
marks. Table entry:

```ts
{ id: 'throttle', label: 'THROTTLE', unit: '%', kind: 'column',
  min: 0, max: 100, majorStep: 100, minorStep: 12.5,
  fromSI: 100, decimals: 0 }
```

## 4. Structural changes this forces

**`GaugeSpec` becomes a discriminated union.** It is entirely dial-shaped
today: `sweepRad` and `circular` have no meaning for a column or a tape.

```ts
type GaugeBase   = { id; label; unit; min; max; majorStep; minorStep; fromSI; decimals }
type DialSpec    = GaugeBase & { kind: 'dial';   sweepRad: number; circular: boolean }
type ColumnSpec  = GaugeBase & { kind: 'column' }
type TapeSpec    = GaugeBase & { kind: 'tape';   windowSpan: number }
export type GaugeSpec = DialSpec | ColumnSpec | TapeSpec
```

Under strict TypeScript this forces every consumer to handle each kind, rather
than letting a meaningless `sweepRad: 0` sit in the table. `tickMarksFor` gains
a `fraction` (0–1 position along a linear gauge) alongside `angleRad`.

**The panel needs the control vector.** Throttle lives in `Controls`, not
`AircraftState` (`src/sim/flight/state.ts:8`), so `updatePanel` and
`gaugeValue` take controls. This is free at the call site: `main.ts:500`
already has `current.controls` in scope to spin the propeller.

**Gauge sizes may vary** (Mark, 2026-09-15). `DIAL_RADIUS` stops being a single
constant and becomes per-instrument, which the band layout needs anyway.

## 5. Reserved slots: space, not empty bezels

Radar and armament get space allocated in the layout arithmetic and **nothing
drawn**. An unlit bezel that never fills reads as a broken instrument, and it
is the same claim-without-backing that `gauges.ts:8-16` refuses for the
tachometer.

Reserving now rather than later is the whole reason to do this once: layout is
where this panel's defects have actually lived (I-7 horizontally, the
`PANEL_BELOW_M` defect vertically). With the slots in the arithmetic, Plan 6
drops a mesh into an existing hole instead of re-deriving the geometry.

## 6. Verification

Assertions, in the project's existing style — `panel.test.ts` measures built
geometry against the camera's own exported field of view, so a defect fails the
suite rather than a screenshot.

1. **Vertical budget.** Every instrument's built extent sits between 3° and 30°
   below the eye line, measured against `CAMERA_VFOV_DEG`. This is the
   assertion the horizontal axis already has in `PANEL_MIN_ASPECT`, and the
   thing whose absence caused the 2026-09-13 defect.
2. **The bezel is clipped, deliberately.** The backing extends past 30° while
   no *readable* element does — so "clipped" cannot silently become "labels
   fell off the bottom" again.
3. **The attitude ball against the true horizon**, by projection, per §3.
4. **The tape** shows the heading it is given, wraps through 360/0 without a
   discontinuity, and centres the current value under the index.
5. **The throttle column** tracks `controls.throttle` at 0 / 50 / 100%.
6. **Reserved slots stay empty.** A count of drawn instruments, so a future
   placeholder cannot quietly appear.
7. Dial selection stays name-based (`dial:<id>`), added 2026-09-15 when the
   reticle was silently counted as a seventh dial.

Every new test must be proved to fail with the thing it guards removed, as
Plan 4 and Plan 5 did.

## 7. Out of scope, stated so it is not drifted into

- **No flight-model changes.** No `content/aircraft/f6f-hellcat.json` edits, so
  no golden regeneration and no test-card risk.
- **No weapons, no radar contacts, no AI.** Plan 6 and Plan 7.
- **No gear, no flaps.** §1.
- **No touch input.** Input remains keyboard-only; Mark flies from a desktop
  (2026-09-15).
- **No settings UI.** Unchanged from Plan 3's OPEN (D).

## 8. Open questions for the plan

1. **Where does the throttle column sit** — right edge of the dial row, or in
   the upper band? The reference puts it mid-panel beside the engine gauges we
   are not fitting, so the reference does not answer it.
2. **Does the heading tape keep a numeric readout?** Mark chose the tape to
   replace the dial; whether the exact heading still prints as digits above it,
   the way dials print readouts, is unsettled.
3. **How wide is the tape's window** (`windowSpan`)? A wider window is easier
   to fly a turn with and harder to read precisely.
4. **Does the reticle need to be bolder?** At 3° it is faint at 1600×1000
   (screenshot, 2026-09-15), and removing the horizon bar changes what it sits
   against.
