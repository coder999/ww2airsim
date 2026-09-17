# Approach and Landing Ashore Implementation Plan (Plan 11b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The F6F can fly an approach and land back on the Tacloban runway, and a scripted autopilot proves it every commit instead of Mark crashing.

**Architecture:** Flaps as a camber shift with one derived constant; ground effect as a published induced-drag factor with no fitted parameter; a lateral tire force shaped like 11a's velocity projection; and a scripted `approach` autopilot in `tools/` that measures the landing envelope so the gates can be tuned against numbers.

**Tech Stack:** TypeScript (strict), vitest, three.js `three/webgpu`, Playwright (Tier 2), dependency-cruiser.

**Spec:** `docs/superpowers/specs/2026-09-17-approach-and-landing-design.md`

## Global Constraints

- **`src/sim/` may not import `src/render/`, any rendering library, Node core, or `src/input/`.** Enforced by `.dependency-cruiser.cjs` and `tests/architecture/boundary.test.ts`.
- **New fields on `SimContext` and `Controls` are OPTIONAL, never required.** `Controls` literals appear throughout the suite and `undefined` must keep meaning "unchanged".
- **`AircraftState.flapFraction` defaults to 0.** `createState` with no flap argument must produce the airplane every existing test already has, exactly as `gearFraction` does.
- **New `liftCoefficient` / `dragCoefficient` parameters default to the current behaviour**, so no existing caller changes.
- **`advance` must stay pure.** `tests/sim/loop.test.ts` hands it a deep-frozen world.
- **`aero.clMax` is inert — do not use it.** `liftCoefficient` has not read it since Plan 1's finding C1. Raising it does nothing. See spec §1.
- **Do not re-derive Tacloban's coordinate.** It is `(-29666, 47605)`, in `tests/tools/terrainBuild.test.ts`.
- **US spelling** in all comments, test names and docs: airplane, maneuver, behavior, modeled, labeled. Not aeroplane, manoeuvre, behaviour, modelled, labelled.
- **Escape `|` as `\|` inside markdown table cells**, including inside code spans.
- **Capture exit status directly** (`rc=$?`), never through a pipe into `grep`.
- Run `npm run verify` before every commit. Baseline at `27d12bc`: **846 passed, 1 skipped, exit 0**.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/sim/flaps.ts` | **New.** Pure: flap travel, the lift increment it buys, the drag it costs. Mirrors `ground.ts`'s shape. |
| `src/sim/aero.ts` | `liftCoefficient` takes a Cl increment; `dragCoefficient` takes an induced-drag scale; `groundEffectFactor` is new. |
| `src/sim/flight/state.ts` | `AircraftState.flapFraction`; `Controls.flapDown?`. |
| `src/sim/flight/schema.ts` | `AircraftSpec.flap` block; `reference.stallSpeedFlapMps`; `gear.lateralGripSeconds`. |
| `content/aircraft/f6f-hellcat.json` | The flap figures and the sourced full-flap stall speed. |
| `src/sim/flight/model.ts` | `step` applies flap lift and drag, ground effect, and flap travel. |
| `src/sim/ground.ts` | `lateralGripAfter` — the wheels resist going sideways. |
| `src/input/bindings.ts`, `src/render/legend.ts` | `F` for flaps, with a legend row. |
| `src/render/frame.ts`, `src/render/flightData.ts` | Flap toggle into `Controls`; flap state shown to the pilot. |
| `tools/autopilot/approach.ts` | **New.** The scripted approach — spec §11's item 2, and this plan's acceptance instrument. |
| `tools/testcards/measure.ts` | `measureStallSpeed` takes a flap setting; `measureTakeoffRun` flies the card with flaps. |
| `tools/soak/run.ts` | Landing cohorts in the soak. |

---

### Task 1: Flaps as state and command

**Files:**
- Create: `src/sim/flaps.ts`
- Modify: `src/sim/flight/state.ts`, `src/sim/flight/schema.ts`, `content/aircraft/f6f-hellcat.json`
- Test: `tests/sim/flaps.test.ts`

**Interfaces:**
- Produces: `flapAfter(spec: AircraftSpec, flapFraction: number, flapDown: boolean | undefined, dt: number): number`; `AircraftState.flapFraction: number`; `Controls.flapDown?: boolean`; `spec.flap.travelSeconds`, `spec.flap.dragAreaM2`, `spec.flap.clIncrement`.

Deliberately a copy of `gearAfter`'s shape rather than a shared generic "actuator": two call sites do not justify an abstraction, and the gear's own doc comment explains the `undefined`-means-hold rule this follows.

- [x] **Step 1: Write the failing test**

```typescript
// tests/sim/flaps.test.ts
import { describe, it, expect } from 'vitest'
import { flapAfter } from '../../src/sim/flaps.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')

describe('flapAfter', () => {
  it('takes the specified time to travel fully down', () => {
    let f = 0
    for (let i = 0; i < 60 * f6f.flap.travelSeconds; i++) f = flapAfter(f6f, f, true, 1 / 60)
    expect(f).toBeCloseTo(1, 6)
  })

  it('holds position when the pilot says nothing', () => {
    // `undefined` is "no command this step", and a flap lever stays where it
    // is left -- the same rule `gearAfter` documents for the gear.
    expect(flapAfter(f6f, 0.42, undefined, 1 / 60)).toBe(0.42)
  })

  it('clamps at both ends rather than running past them', () => {
    expect(flapAfter(f6f, 1, true, 10)).toBe(1)
    expect(flapAfter(f6f, 0, false, 10)).toBe(0)
  })

  it('holds position on a non-finite step instead of moving by NaN', () => {
    expect(flapAfter(f6f, 0.5, true, NaN)).toBe(0.5)
    expect(flapAfter(f6f, 0.5, true, Infinity)).toBe(0.5)
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/sim/flaps.test.ts`
Expected: FAIL — `Cannot find module '../../src/sim/flaps.js'`.

- [x] **Step 3: Add the schema block and the content values**

In `src/sim/flight/schema.ts`, beside the `gear` block:

```typescript
  /** Trailing-edge flaps: travel time, the drag they cost, and the lift they
   *  buy. Separate from `gear` because they are a separate device with a
   *  separate lever, even though both are actuators with travel time. */
  flap: z.object({
    /** Seconds for the flaps to travel fully up-to-down or down-to-up. */
    travelSeconds: positive,
    /** Drag AREA (Cd·A) of fully extended flaps, m^2 -- multiplies dynamic
     *  pressure directly, the same shape `gear.dragAreaM2` takes. */
    dragAreaM2: positive,
    /**
     * Lift-coefficient increment at full extension, added to
     * `aero.clAtZeroAlpha` (a camber shift, which is what flaps physically
     * are). NOT applied to `aero.clMax`, which `liftCoefficient` has not read
     * since Plan 1's finding C1 -- raising that field does nothing at all.
     *
     * DERIVED, not estimated: stall speed goes as 1/sqrt(CLmax), and this
     * airplane's own `reference.source` carries both the clean power-off stall
     * (98.0 mph) and the landing-condition power-off stall (84.5 mph) from the
     * same trial table. See `reference.stallSpeedFlapMps`.
     */
    clIncrement: positive,
  }).strict(),
```

In the same file's `reference` block:

```typescript
    /**
     * Power-off stall speed in the LANDING configuration, m/s. Graded by
     * `tests/sim/testcards/f6f.test.ts` with the flaps set.
     *
     * Promoted out of `reference.source`'s prose on 2026-09-17 because a
     * graded card cannot read prose -- the figure sat in that string, flagged
     * as "unreachable for a model with no high-lift devices", for two plans.
     */
    stallSpeedFlapMps: positive,
```

In `content/aircraft/f6f-hellcat.json`:

```json
  "flap": {
    "travelSeconds": 5,
    "dragAreaM2": 0.6,
    "clIncrement": 0.4831
  },
```

and inside `reference`, beside `stallSpeedMps`:

```json
    "stallSpeedFlapMps": 37.7749,
```

Append to `reference.source`, replacing the sentence that says the landing stall is unreachable:

```
The same table's landing-condition power-off stall is 84.5 mph = 37.7749 m/s, now carried as reference.stallSpeedFlapMps and graded with the flaps set (Plan 11b, 2026-09-17) -- it was unreachable while the model had no high-lift devices, which is what that figure's earlier note in this string recorded. flap.clIncrement = 0.4831 is DERIVED from those two stall speeds rather than estimated: stall speed goes as 1/sqrt(CLmax) at fixed weight, so (43.81/37.7749)^2 = 1.3451 is the CLmax ratio full flaps must produce, the shipped lift curve peaks at 1.400013 (measured, at +15.5 deg), and 1.400013 * 1.3451 - 1.400013 = 0.4831 is the increment on clAtZeroAlpha that gets there. flap.travelSeconds = 5 and flap.dragAreaM2 = 0.6 are NOT corroborated by this source and are estimates of the same status as gear.travelSeconds and gear.dragAreaM2 -- 5 s is a round figure for a hydraulic flap cycle on a fighter of this class, and 0.6 sq m is twice the extended gear's drag area, full flaps being the draggier device. dragAreaM2 is additionally CHARACTERISED by the take-off card, which grades against this table's own FULL-FLAPS 755 ft figure: with the flap lift increment derived and ground effect carrying no fitted parameter, flap drag area is the only unknown entering that measurement -- exactly the role gear.rollingResistanceCoeff already plays. Read the agreement as a characterisation lock, not as evidence of flap fidelity.
```

- [x] **Step 4: Add the state fields**

In `src/sim/flight/state.ts`, on `AircraftState`:

```typescript
  /** Flap travel, 0 = fully retracted, 1 = fully extended. A fraction rather
   *  than a boolean for the same reason `gearFraction` is one: the travel
   *  takes seconds and the lift and drag change across it. Defaults to 0 so
   *  every flight predating Plan 11b is unchanged. */
  readonly flapFraction: number
```

and on `Controls`:

```typescript
  /** What the pilot is asking the flaps to do, not where they are. Optional
   *  for the same reason `gearDown` is: `Controls` literals appear throughout
   *  the suite and `undefined` reads as "unchanged". */
  readonly flapDown?: boolean
```

and in `createState`:

```typescript
  flapFraction: init.flapFraction ?? 0,
```

- [x] **Step 5: Write `flapAfter`**

```typescript
// src/sim/flaps.ts
import type { AircraftSpec } from './flight/schema.js'

/**
 * Flap travel after one step.
 *
 * `flapDown === undefined` means the pilot said nothing this step, which for a
 * lever that stays where it is left means hold. A non-finite `dt` holds
 * position rather than moving by NaN. Both rules, and the reasons for them,
 * are `gearAfter`'s in `ground.ts` -- this is deliberately its twin rather
 * than a shared generic actuator, because two call sites do not justify the
 * abstraction.
 */
export function flapAfter(
  spec: AircraftSpec,
  flapFraction: number,
  flapDown: boolean | undefined,
  dt: number,
): number {
  if (flapDown === undefined) return flapFraction
  const step = Number.isFinite(dt) && dt > 0 ? dt / spec.flap.travelSeconds : 0
  const next = flapDown ? flapFraction + step : flapFraction - step
  return next < 0 ? 0 : next > 1 ? 1 : next
}
```

- [x] **Step 6: Run the full suite**

Run: `npm run verify` — exit 0. Every existing test must still pass: `flapFraction` defaults to 0 and `flapDown` is optional, so nothing else changes.

- [x] **Step 7: Commit**

```bash
git add src/sim/flaps.ts src/sim/flight/state.ts src/sim/flight/schema.ts content/aircraft/f6f-hellcat.json tests/sim/flaps.test.ts docs/superpowers/plans/2026-09-17-approach-and-landing.md
git commit -m "Flaps as state and a command, with a derived lift increment"
```

---

### Task 2: Flap lift — a camber shift the stall follows

**Files:**
- Modify: `src/sim/aero.ts`, `src/sim/flaps.ts`, `src/sim/flight/model.ts`
- Test: `tests/sim/aero.test.ts`, `tests/sim/flaps.test.ts`

**Interfaces:**
- Consumes: `spec.flap.clIncrement` (Task 1).
- Produces: `flapClIncrement(spec: AircraftSpec, flapFraction: number): number`; `liftCoefficient(spec, alphaRad, clIncrement?)`.

**The subtlety that makes or breaks this task:** the increment must go into the `attached` line *inside* `liftCoefficient`, not be added to its result. The post-stall branch takes its peak from `attached(sign * alphaCrit)` — that is what makes the two branches meet, and Plan 1's finding C1 was a 1.17 g discontinuity at exactly that join. Adding the increment outside would lift the attached branch and leave the post-stall peak behind, re-opening that discontinuity with flaps down.

- [x] **Step 1: Write the failing tests**

```typescript
// tests/sim/aero.test.ts — append
import { liftCoefficient, alphaCritRad } from '../../src/sim/aero.js'

describe('liftCoefficient with a flap increment', () => {
  it('shifts the whole attached branch up by the increment', () => {
    for (const alphaDeg of [-15, -8, 0, 5, 15]) {
      const a = (alphaDeg * Math.PI) / 180
      expect(liftCoefficient(f6f, a, 0.4831) - liftCoefficient(f6f, a, 0)).toBeCloseTo(0.4831, 9)
    }
  })

  it('carries the increment into the post-stall peak, so the branches still meet', () => {
    // Plan 1's finding C1 was a 1.17 g step at exactly this join. Adding the
    // increment to liftCoefficient's RESULT instead of to its attached line
    // would re-open it with the flaps down.
    const crit = alphaCritRad(f6f)
    const inside = liftCoefficient(f6f, crit - 1e-9, 0.4831)
    const outside = liftCoefficient(f6f, crit + 1e-9, 0.4831)
    expect(Math.abs(outside - inside)).toBeLessThan(1e-6)
  })

  it('is unchanged from the no-flap curve when the increment is zero or omitted', () => {
    for (const alphaDeg of [-180, -90, -15.5, 0, 15.5, 90, 180]) {
      const a = (alphaDeg * Math.PI) / 180
      expect(liftCoefficient(f6f, a, 0)).toBe(liftCoefficient(f6f, a))
    }
  })
})
```

```typescript
// tests/sim/flaps.test.ts — append
import { flapClIncrement } from '../../src/sim/flaps.js'

describe('flapClIncrement', () => {
  it('is the full increment at full extension and nothing retracted', () => {
    expect(flapClIncrement(f6f, 1)).toBeCloseTo(f6f.flap.clIncrement, 9)
    expect(flapClIncrement(f6f, 0)).toBe(0)
  })

  it('is linear across travel, like the gear drag is', () => {
    expect(flapClIncrement(f6f, 0.5)).toBeCloseTo(f6f.flap.clIncrement / 2, 9)
  })

  it('is zero for a non-finite fraction rather than propagating it into the lift', () => {
    expect(flapClIncrement(f6f, NaN)).toBe(0)
  })
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sim/aero.test.ts tests/sim/flaps.test.ts`
Expected: FAIL — `flapClIncrement is not a function`, and the increment tests return 0 difference because `liftCoefficient` ignores a third argument.

- [x] **Step 3: Write both**

In `src/sim/flaps.ts`:

```typescript
/**
 * Lift-coefficient increment from the flaps at their current travel.
 *
 * Linear in travel, the same simplification `gearDragN` makes and for the same
 * reason: a partially extended flap is treated as a fraction of a fully
 * extended one, which is not worth more than that at this model's fidelity.
 *
 * A non-finite fraction reads as retracted -- the safe direction, since the
 * alternative is a NaN reaching the lift curve and from there the integrator,
 * which is master spec §9's named hazard.
 */
export function flapClIncrement(spec: AircraftSpec, flapFraction: number): number {
  if (!Number.isFinite(flapFraction)) return 0
  const f = flapFraction < 0 ? 0 : flapFraction > 1 ? 1 : flapFraction
  return spec.flap.clIncrement * f
}
```

In `src/sim/aero.ts`, change `liftCoefficient`'s signature and its `attached` closure only:

```typescript
export function liftCoefficient(spec: AircraftSpec, alphaRad: number, clIncrement = 0): number {
  const { clSlopePerRad, clAtZeroAlpha } = spec.aero
  const alphaCrit = alphaCritRad(spec)
  /** The attached-flow line, valid for signed alpha in [-alphaCrit, alphaCrit].
   *  `clIncrement` (flaps, `src/sim/flaps.ts`) belongs HERE and not on this
   *  function's result: the post-stall branch below takes its peak from this
   *  same closure, which is what makes the two branches meet. Adding the
   *  increment outside would lift the attached branch and leave the peak
   *  behind, re-opening Plan 1's finding C1 discontinuity with flaps down. */
  const attached = (a: number) => clAtZeroAlpha + clIncrement + clSlopePerRad * a
  // ... rest unchanged
```

In `src/sim/flight/model.ts`'s `step`, replace the `cl` line:

```typescript
  const cl = liftCoefficient(spec, alpha, flapClIncrement(spec, state.flapFraction))
```

and thread flap travel where gear travel is already threaded, beside the `gearAfter` call:

```typescript
  const flapFraction = flapAfter(spec, state.flapFraction, controls.flapDown, ctx.dt)
```

carrying `flapFraction` into the returned state exactly as `gearFraction` is.

- [x] **Step 4: Run the full suite**

Run: `npm run verify` — exit 0. The golden trajectory must be untouched: it flies with `flapFraction` 0, so `flapClIncrement` returns 0 and `liftCoefficient` takes its default.

- [x] **Step 5: Commit**

```bash
git add src/sim/aero.ts src/sim/flaps.ts src/sim/flight/model.ts tests/sim/aero.test.ts tests/sim/flaps.test.ts
git commit -m "Flap lift as a camber shift, carried into the post-stall peak"
```

---

### Task 3: Flap drag

**Files:**
- Modify: `src/sim/flaps.ts`, `src/sim/flight/model.ts`
- Test: `tests/sim/flaps.test.ts`

**Interfaces:**
- Produces: `flapDragN(spec: AircraftSpec, flapFraction: number, q: number): number`.

- [x] **Step 1: Write the failing tests**

```typescript
// tests/sim/flaps.test.ts — append
import { flapDragN } from '../../src/sim/flaps.js'

describe('flapDragN', () => {
  it('is the drag area times dynamic pressure at full extension', () => {
    expect(flapDragN(f6f, 1, 1000)).toBeCloseTo(1000 * f6f.flap.dragAreaM2, 9)
  })

  it('is nothing retracted, whatever the speed', () => {
    expect(flapDragN(f6f, 0, 50_000)).toBe(0)
  })

  it('is linear across travel', () => {
    expect(flapDragN(f6f, 0.5, 1000)).toBeCloseTo(500 * f6f.flap.dragAreaM2, 9)
  })

  it('never returns a non-finite force', () => {
    for (const [f, q] of [[NaN, 1000], [0.5, NaN], [Infinity, 1000]] as const) {
      expect(Number.isFinite(flapDragN(f6f, f, q))).toBe(true)
    }
  })
})
```

- [x] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/sim/flaps.test.ts`
Expected: FAIL — `flapDragN is not a function`.

- [x] **Step 3: Implement**

```typescript
/**
 * Parasitic drag from extended flaps, newtons.
 *
 * `dragAreaM2` is a drag AREA (Cd·A), so it multiplies dynamic pressure
 * directly with the coefficient already folded in -- the same shape
 * `gearDragN` takes, and the same reason it is added outside the wing-area
 * product in `step` rather than inside it.
 */
export function flapDragN(spec: AircraftSpec, flapFraction: number, q: number): number {
  if (!Number.isFinite(q)) return 0
  if (!Number.isFinite(flapFraction)) return 0
  const f = flapFraction < 0 ? 0 : flapFraction > 1 ? 1 : flapFraction
  return q * spec.flap.dragAreaM2 * f
}
```

- [x] **Step 4: Apply it in `step`**

Add to the `dragN` sum in `src/sim/flight/model.ts`, extending the comment above it that already enumerates the parasitic terms:

```typescript
  const dragN =
    q * spec.geometry.wingAreaM2 * (cd + windmillDragCd0(spec, controls.throttle)) +
    gearDragN(spec, state.gearFraction, q) +
    flapDragN(spec, state.flapFraction, q)
```

- [x] **Step 5: Run the full suite**

Run: `npm run verify` — exit 0.

- [x] **Step 6: Commit**

```bash
git add src/sim/flaps.ts src/sim/flight/model.ts tests/sim/flaps.test.ts
git commit -m "Flaps cost drag while they are hanging out"
```

---

### Task 4: The graded flap stall card

**Files:**
- Modify: `tools/testcards/measure.ts`, `tests/sim/testcards/f6f.test.ts`
- Test: `tests/sim/testcards/f6f.test.ts`

**Interfaces:**
- Consumes: `reference.stallSpeedFlapMps` (Task 1), `flapClIncrement` (Task 2).
- Produces: `measureStallSpeed(spec, altitudeM, flapFraction?)`.

**This is the acceptance test for Tasks 1–3, and it is a sourced historical figure rather than a self-consistency check.** It reuses `measureStallSpeed` rather than adding a second stall measurement — that function already carries the hard-won part, including its refusal to report "whatever the airspeed happened to be" when the wing never stalls inside the run.

- [x] **Step 1: Write the failing test**

```typescript
// tests/sim/testcards/f6f.test.ts — append
it('matches the trial landing-configuration power-off stall with the flaps down', () => {
  // 84.5 mph from the same Patuxent table that gives the clean 98.0 mph stall
  // this file already grades. The clean figure is a like-for-like comparison
  // for a wing with no high-lift devices; this one only became reachable when
  // Plan 11b gave the wing flaps.
  const measured = measureStallSpeed(f6f, 0, 1)
  const trial = f6f.reference.stallSpeedFlapMps
  const errorFraction = Math.abs(measured - trial) / trial
  console.log(
    `flap stall card: measured ${measured.toFixed(3)} m/s against ${trial.toFixed(3)} m/s ` +
      `(${(100 * (measured - trial) / trial).toFixed(3)}%)`,
  )
  expect(errorFraction).toBeLessThan(0.02)
})

it('stalls slower with the flaps down than clean, by about the derived ratio', () => {
  // The direction is the point: if `flap.clIncrement` were wired to
  // `aero.clMax` -- the obvious mistake, since that field exists and looks
  // load-bearing -- both numbers would come out identical and the card above
  // would fail without saying why.
  const clean = measureStallSpeed(f6f, 0, 0)
  const flapped = measureStallSpeed(f6f, 0, 1)
  expect(flapped).toBeLessThan(clean)
  expect((clean / flapped) ** 2).toBeCloseTo(1.3451, 1)
})
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/sim/testcards/f6f.test.ts`
Expected: FAIL — `measureStallSpeed` takes two arguments, so the flap setting is ignored and both stall speeds come out equal.

- [x] **Step 3: Thread a flap setting through the card**

In `tools/testcards/measure.ts`:

```typescript
/**
 * Idle throttle, flight path held level until the wing stalls; report the
 * airspeed at that moment. This is a 1-g stall.
 *
 * `flapFraction` defaults to 0, the clean configuration every caller before
 * Plan 11b measured. Pass 1 for the landing-configuration card: the flaps are
 * held at that travel for the whole run rather than being lowered during it,
 * because the card measures a configuration, not a transition.
 */
export function measureStallSpeed(spec: AircraftSpec, altitudeM: number, flapFraction = 0): number {
  let s = { ...spawn(spec, altitudeM, spec.rates.rateRefSpeedMps), flapFraction }
  let tick = 0
  for (let i = 0; i < 60 * STALL_MAX_S; i++) {
    tick++
    // `flapDown` is left undefined so `flapAfter` holds the travel where this
    // function set it -- see `flapAfter`'s doc comment on the hold rule.
    s = holdMass(spec, stepChecked(spec, s, holdLevelFlight(spec, s, 0, altitudeM), { dt: DT, tick }))
    if (isStalled(spec, s)) return airspeed(s)
  }
  throw new Error(
    `measureStallSpeed for "${spec.id}" at altitude ${altitudeM} m with flaps at ` +
      `${flapFraction} never stalled within ${STALL_MAX_S} s of simulated time ` +
      `(airspeed ${airspeed(s).toFixed(3)} m/s at that point)`,
  )
}
```

**If the measured figure misses 2%:** the lever is `flap.clIncrement`, and it is re-derived rather than nudged — recompute it from the two sourced stall speeds and the curve's actual peak, and record the new arithmetic in `reference.source`. Do NOT widen the tolerance; the whole value of this card is that it grades against a number nobody in this project chose.

- [x] **Step 4: Run the full suite**

Run: `npm run verify` — exit 0.

- [x] **Step 5: Commit**

```bash
git add tools/testcards/measure.ts tests/sim/testcards/f6f.test.ts
git commit -m "Grade the flaps against the trial landing-configuration stall"
```

---

### Task 5: Ground effect

**Files:**
- Modify: `src/sim/aero.ts`, `src/sim/flight/model.ts`
- Test: `tests/sim/aero.test.ts`

**Interfaces:**
- Produces: `groundEffectFactor(spec: AircraftSpec, wingHeightM: number): number`; `dragCoefficient(spec, cl, alphaRad?, inducedFactorScale?)`.

**Which height feeds this, stated so the implementer does not have to choose:** the WING's height above the terrain, which is `state.position.y - groundHeightM`. `position.y` is the body origin and the wing sits essentially at it (`src/render/scene/hellcat.ts` puts the wing at -0.25 m of a 1.5 m fuselage); the wheels are `gear.heightM` = 2.2 m BELOW that. Using the wheel height instead is a 2.2 m error, which is a factor of 1.4 on induced drag in the flare — where it matters most — and would read as a tuning problem rather than a bug.

- [x] **Step 1: Write the failing tests**

```typescript
// tests/sim/aero.test.ts — append
import { groundEffectFactor, dragCoefficient, inducedDragFactor } from '../../src/sim/aero.js'

describe('groundEffectFactor', () => {
  it('matches McCormick at the heights that matter, on this airplane', () => {
    // phi = (16h/b)^2 / (1 + (16h/b)^2), b = geometry.wingSpanM = 13.06 m.
    // Computed 2026-09-17; these are the numbers the design table carries.
    expect(groundEffectFactor(f6f, 1)).toBeCloseTo(0.600, 3)
    expect(groundEffectFactor(f6f, 2)).toBeCloseTo(0.857, 3)
    expect(groundEffectFactor(f6f, 3)).toBeCloseTo(0.931, 3)
  })

  it('is effectively absent a wingspan up, so it cannot affect cruise', () => {
    expect(groundEffectFactor(f6f, f6f.geometry.wingSpanM)).toBeGreaterThan(0.99)
    expect(groundEffectFactor(f6f, 10 * f6f.geometry.wingSpanM)).toBeGreaterThan(0.999)
  })

  it('never returns a value outside [0, 1], including below the ground', () => {
    for (const h of [-100, -1, 0, NaN, Infinity, 1e9]) {
      const phi = groundEffectFactor(f6f, h)
      expect(Number.isFinite(phi), `h=${h}`).toBe(true)
      expect(phi).toBeGreaterThanOrEqual(0)
      expect(phi).toBeLessThanOrEqual(1)
    }
  })
})

describe('dragCoefficient with an induced-drag scale', () => {
  it('scales only the induced term, never the parasitic one', () => {
    const cl = 1.0
    const full = dragCoefficient(f6f, cl, 0, 1)
    const halved = dragCoefficient(f6f, cl, 0, 0.5)
    expect(full - halved).toBeCloseTo(0.5 * inducedDragFactor(f6f) * cl * cl, 12)
    // At zero lift there is no induced drag to scale, so the two agree.
    expect(dragCoefficient(f6f, 0, 0, 1)).toBeCloseTo(dragCoefficient(f6f, 0, 0, 0.1), 12)
  })

  it('is unchanged when the scale is omitted', () => {
    expect(dragCoefficient(f6f, 0.8, 0.1)).toBe(dragCoefficient(f6f, 0.8, 0.1, 1))
  })
})
```

- [x] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/sim/aero.test.ts`
Expected: FAIL — `groundEffectFactor is not a function`, and `dragCoefficient` ignores a fourth argument so `full - halved` is 0.

- [x] **Step 3: Implement both**

```typescript
/**
 * Induced-drag multiplier in ground effect: McCormick's
 * `phi = (16h/b)^2 / (1 + (16h/b)^2)`, where `h` is the WING's height above
 * the surface and `b` is the span.
 *
 * Within about a wingspan of the ground the trailing vortex system is
 * constrained and induced drag falls. **No fitted constant**, which is
 * load-bearing beyond tidiness: it is what leaves `flap.dragAreaM2` as the
 * only unknown entering the graded take-off card, so that card characterises
 * flap drag instead of characterising a pair of guesses against each other.
 *
 * The lift INCREASE in ground effect is deliberately not modeled -- the
 * induced-drag reduction is the dominant and best-published half, and the
 * published forms of the lift half disagree more.
 *
 * Returns 0 at or below the surface (the formula's own limit) and is clamped
 * into [0, 1] for any non-finite input, because this multiplies a drag term
 * that reaches the integrator.
 */
export const groundEffectFactor = (spec: AircraftSpec, wingHeightM: number): number => {
  if (!Number.isFinite(wingHeightM) || wingHeightM <= 0) return 0
  const ratio = (16 * wingHeightM) / spec.geometry.wingSpanM
  const x = ratio * ratio
  const phi = x / (1 + x)
  return phi < 0 ? 0 : phi > 1 ? 1 : phi
}
```

```typescript
export function dragCoefficient(
  spec: AircraftSpec,
  cl: number,
  alphaRad = 0,
  inducedFactorScale = 1,
): number {
  // `inducedFactorScale` is ground effect (`groundEffectFactor`) and defaults
  // to 1, so every caller predating Plan 11b is unchanged. It scales the
  // INDUCED term alone: ground effect constrains the vortex system, and has no
  // business touching `cd0`.
  const cdAttached = spec.aero.cd0 + inducedDragFactor(spec) * inducedFactorScale * cl * cl
  // ... rest unchanged
```

- [x] **Step 4: Apply it in `step`**

In `src/sim/flight/model.ts`, where `ctx.terrain` is already consulted (11a added the field and the short-circuit; follow the existing guard so a null terrain costs nothing):

```typescript
  // Ground effect needs to know where the ground is, so it is only available
  // when a terrain field was supplied. `ctx.terrain` being null short-circuits
  // before `heightAt` is called, exactly as the existing ground code does --
  // 50 of the 51 SimContext construction sites pass no terrain.
  const groundEffect =
    ctx.terrain !== null && ctx.terrain !== undefined
      ? groundEffectFactor(spec, state.position.y - heightAt(ctx.terrain, state.position.x, state.position.z))
      : 1
  const cd = dragCoefficient(spec, cl, alpha, groundEffect)
```

- [x] **Step 5: Run the full suite**

Run: `npm run verify` — exit 0. Note the golden trajectory flies with no terrain field, so `groundEffect` is 1 and it cannot move.

- [x] **Step 6: Commit**

```bash
git add src/sim/aero.ts src/sim/flight/model.ts tests/sim/aero.test.ts
git commit -m "Ground effect: less induced drag within a wingspan of the surface"
```

---

### Task 6: The take-off card stops being two errors cancelling

**Files:**
- Modify: `tools/testcards/measure.ts`, `tests/sim/testcards/f6f.test.ts`, `content/aircraft/f6f-hellcat.json`
- Test: `tests/sim/testcards/f6f.test.ts`

**Interfaces:**
- Consumes: `flapDragN` (Task 3), `groundEffectFactor` (Task 5).
- Produces: `measureTakeoffRun(spec, liftoffSpeedMps, flapFraction?)`.

**What this task is really doing.** `reference.takeoffDistanceM` = 230.124 m is a **full-flaps** figure, and the model currently matches it to −0.605% with no flaps and no ground effect — `f6f-hellcat.json` says so itself: no flaps "pushes a simulated roll shorter", no ground effect "pushes it longer". Two errors of opposite sign, cancelling. 11a declared the re-measure pre-authorised. The distinction that matters: the tolerance is **recomputed from what the model now does**, never relaxed until it passes.

- [x] **Step 1: Write the failing test**

```typescript
// tests/sim/testcards/f6f.test.ts — modify the existing take-off card
it('matches the trial take-off run, flown as the trial was: full flaps', () => {
  // The trial figure is FULL FLAPS at 86.5 mph and 2700 RPM. Until Plan 11b
  // the model had no flaps and no ground effect and was graded against it
  // anyway -- two errors of opposite sign that happened to cancel to -0.605%.
  // This now measures the same configuration the trial did.
  const measured = measureTakeoffRun(f6f, 86.5 * 0.44704, 1)
  const trial = f6f.reference.takeoffDistanceM
  const errorFraction = Math.abs(measured - trial) / trial
  console.log(
    `take-off card, full flaps: ${measured.toFixed(3)} m against ${trial.toFixed(3)} m ` +
      `(${(100 * (measured - trial) / trial).toFixed(3)}%)`,
  )
  expect(errorFraction).toBeLessThan(0.02)
})
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/sim/testcards/f6f.test.ts`
Expected: FAIL — `measureTakeoffRun` takes two arguments, so the flap setting is ignored.

- [x] **Step 3: Thread flaps through the card, and give it real ground effect**

In `tools/testcards/measure.ts`, `measureTakeoffRun` gains a third parameter defaulting to 0 and sets `flapFraction` on its initial state, exactly as `measureStallSpeed` does in Task 4. Its synthetic flat field already reaches `step` through `SimContext.terrain` (11a), so `groundEffectFactor` applies with no further wiring — confirm that by asserting the roll changes when the flaps change, in the next step.

- [x] **Step 4: Characterise `flap.dragAreaM2` against the card**

Run the card and read the printed figure. If it sits outside 2%, tune **`flap.dragAreaM2`** — it is the only unknown left, because the flap lift increment is derived (Task 1) and ground effect carries no fitted parameter (Task 5). Then:

1. Record the new value and the measured percentage in `reference.source`, replacing the 0.6 estimate's sentence.
2. Add, in the same commit, the sentence that keeps this honest: the agreement is a **characterisation lock on `flap.dragAreaM2`**, not evidence of flap fidelity — the same status `gear.rollingResistanceCoeff` already has.
3. Re-run the whole suite: `measureTakeoffRun` also feeds `tests/render/frame.test.ts`'s reported roll distance, which is not pinned but is printed.

- [x] **Step 5: Run the full suite and commit**

Run: `npm run verify` — exit 0.

```bash
git add tools/testcards/measure.ts tests/sim/testcards/f6f.test.ts content/aircraft/f6f-hellcat.json
git commit -m "The take-off card flies the configuration the trial flew"
```

---

### Task 7: Lateral tire force — the wheels resist going sideways

**Files:**
- Modify: `src/sim/ground.ts`, `src/sim/flight/schema.ts`, `content/aircraft/f6f-hellcat.json`, `src/sim/flight/model.ts`
- Test: `tests/sim/ground.test.ts`

**Interfaces:**
- Produces: `lateralGripAfter(spec: AircraftSpec, state: AircraftState, dt: number): Vec3`; `spec.gear.lateralGripSeconds`.

**A first-order decay, not a rail.** Removing the sideways component outright would make a **ground loop impossible**, and a ground loop is the characteristic hazard of a taildragger rather than an edge case. A time constant lets a mishandled touchdown skid and swap ends while a competent one tracks straight. The form follows `rates.weathercockSeconds`, which is already a seconds-valued time constant in this spec.

**Why it cannot break the energy invariant:** it only ever scales a velocity component down. `assertNoEnergyGain` (`src/sim/invariants.ts`) is the check, and Task 11's soak is where it gets proven rather than argued.

- [x] **Step 1: Write the failing tests**

```typescript
// tests/sim/ground.test.ts — append
import { lateralGripAfter } from '../../src/sim/ground.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'

describe('lateralGripAfter', () => {
  const rollingNorth = qFromAxisAngle(v3(0, 1, 0), -Math.PI / 2) // nose +z

  it('leaves a roll straight down the wheels alone', () => {
    const s = createState({ velocity: v3(0, 0, 40), attitude: rollingNorth })
    const after = lateralGripAfter(f6f, s, 1 / 60)
    expect(after.z).toBeCloseTo(40, 9)
    expect(after.x).toBeCloseTo(0, 9)
  })

  it('bleeds a sideways component away with the specified time constant', () => {
    const s = createState({ velocity: v3(10, 0, 40), attitude: rollingNorth })
    let v = s.velocity
    for (let i = 0; i < 60 * f6f.gear.lateralGripSeconds; i++) {
      v = lateralGripAfter(f6f, { ...s, velocity: v }, 1 / 60)
    }
    // One time constant: about 1/e of the sideways speed is left.
    expect(v.x).toBeCloseTo(10 / Math.E, 1)
    // And the along-track component is untouched by it.
    expect(v.z).toBeCloseTo(40, 6)
  })

  it('never gains speed, which is what keeps the energy invariant true', () => {
    for (const vel of [v3(10, 0, 40), v3(-30, 0, 5), v3(0, -3, 0), v3(25, 2, -25)]) {
      const s = createState({ velocity: vel, attitude: rollingNorth })
      const after = lateralGripAfter(f6f, s, 1 / 60)
      expect(length(after)).toBeLessThanOrEqual(length(vel) + 1e-9)
    }
  })

  it('leaves the vertical component completely alone', () => {
    const s = createState({ velocity: v3(10, -2.5, 40), attitude: rollingNorth })
    expect(lateralGripAfter(f6f, s, 1 / 60).y).toBe(-2.5)
  })

  it('holds the velocity unchanged for a non-finite step or a vertical nose', () => {
    const s = createState({ velocity: v3(10, 0, 40), attitude: rollingNorth })
    expect(lateralGripAfter(f6f, s, NaN)).toEqual(s.velocity)
    // Nose straight up: no rolling direction exists, so there is nothing to
    // resolve against and the honest answer is to change nothing.
    const noseUp = createState({ velocity: v3(10, 0, 40), attitude: qFromAxisAngle(v3(0, 0, 1), Math.PI / 2) })
    expect(lateralGripAfter(f6f, noseUp, 1 / 60)).toEqual(noseUp.velocity)
  })
})
```

- [x] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/sim/ground.test.ts`
Expected: FAIL — `lateralGripAfter is not a function`.

- [x] **Step 3: Add the constant**

In `src/sim/flight/schema.ts`, inside the `gear` block:

```typescript
    /** Seconds for the wheels to bleed away a sideways velocity component, as
     *  a first-order time constant. A DECAY and not a removal on purpose: a
     *  rail would make a ground loop impossible, and a ground loop is the
     *  characteristic taildragger hazard. Form follows
     *  `rates.weathercockSeconds`. */
    lateralGripSeconds: positive,
```

In `content/aircraft/f6f-hellcat.json`'s `gear` block: `"lateralGripSeconds": 1.5,` and append to `reference.source`:

```
gear.lateralGripSeconds = 1.5 is an ESTIMATE of the same status as the other gear figures -- no trial in this source measures how quickly a tire kills sideways motion. It is a placeholder for Mark to retune once he has flown roll-outs; 11a measured a taxi turn reaching 113.6 degrees of sideslip with no lateral force at all, which is the behaviour this replaces.
```

- [x] **Step 4: Implement**

```typescript
/**
 * The velocity after one step of tire grip: the component across the wheels
 * decays toward zero, the component along them and the vertical are untouched.
 *
 * 11a measured a taxi turn reaching **113.6 degrees of sideslip** because
 * nothing made the airplane travel where its wheels pointed. Its handoff also
 * rejected the cheap fix and said why, and that ruling stands: restoring the
 * fin's weathercock term models the wrong SIGN of the right effect, because a
 * real taildragger is directionally unstable on the ground and the term would
 * fight the tailwheel.
 *
 * A projection rather than a spring, for the reason 11a's surface constraint
 * is one: a spring-damper tire would be more physically detailed than an
 * airframe that carries no moments of inertia. And a first-order DECAY rather
 * than outright removal, so a ground loop stays possible.
 *
 * **Structurally cannot add energy**: it only ever scales one component down.
 */
export function lateralGripAfter(spec: AircraftSpec, state: AircraftState, dt: number): Vec3 {
  if (!Number.isFinite(dt) || dt <= 0) return state.velocity
  // The wheels roll along the body's nose, projected flat onto the ground.
  const nose = qRotate(state.attitude, v3(1, 0, 0))
  const flat = v3(nose.x, 0, nose.z)
  const flatLen = length(flat)
  // A vertical nose has no rolling direction to resolve against.
  if (!Number.isFinite(flatLen) || flatLen < 1e-6) return state.velocity
  const dir = scale(flat, 1 / flatLen)

  const horizontal = v3(state.velocity.x, 0, state.velocity.z)
  const alongScalar = dot(horizontal, dir)
  const along = scale(dir, alongScalar)
  const across = sub(horizontal, along)

  const keep = Math.exp(-dt / spec.gear.lateralGripSeconds)
  const damped = scale(across, keep)
  return v3(along.x + damped.x, state.velocity.y, along.z + damped.z)
}
```

Add `dot`, `sub` and `qRotate` to `ground.ts`'s imports.

- [x] **Step 5: Apply it in `step`, on supported contact only**

In `src/sim/flight/model.ts`, inside the branch that already runs when `supportedContact` holds — the wheels only grip when they are carrying the airplane:

```typescript
    // Only while the wheels are carrying it. An airplane in the air has no
    // tires on anything, and one arriving too fast (`supportedContact`'s own
    // gates) has not landed yet.
    velocity = lateralGripAfter(spec, { ...state, velocity }, ctx.dt)
```

- [x] **Step 6: Run the full suite and commit**

Run: `npm run verify` — exit 0. `tests/sim/invariants.test.ts` and the soak must both stay green; if `assertNoEnergyGain` fires, the bug is in the branch placement, not in this function.

```bash
git add src/sim/ground.ts src/sim/flight/schema.ts src/sim/flight/model.ts content/aircraft/f6f-hellcat.json tests/sim/ground.test.ts
git commit -m "The wheels go where they point: lateral tire grip on the ground"
```

---

### Task 8: The pilot can work and see the flaps

**Files:**
- Modify: `src/input/bindings.ts`, `src/render/legend.ts`, `src/render/frame.ts`, `src/render/flightData.ts`
- Test: `tests/input/bindings.test.ts`, `tests/render/frameAssists.test.ts` or the existing frame-control tests, `tests/render/legend.test.ts`

**Interfaces:**
- Consumes: `Controls.flapDown` (Task 1).
- Produces: `FrameState.flapDown`, `FrameState.flapPressed`, a `toggleFlaps` binding on `KeyF`.

11a bound `G` for gear and `B` for brakes and recorded that "a cockpit annunciator is 11b's, with the flaps indicator beside it". This is that debt. A pilot who cannot see the flap position cannot fly a repeatable approach, so it is not cosmetic.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/input/bindings.test.ts — append
it('binds F to the flaps', () => {
  expect(BINDINGS.toggleFlaps).toContain('KeyF')
})
```

```typescript
// tests/render/frame.test.ts — append inside the nextFrameState describe
it('lowers and raises the flaps on an F press, latching like the gear lever', () => {
  let f = start()
  expect(f.world.controls.flapDown ?? false).toBe(false)
  // Held for several frames: one press is one command, not sixty.
  for (let i = 0; i < 10; i++) f = nextFrameState(f, 1 / 60, keys('KeyF'))
  expect(f.flapDown).toBe(true)
  for (let i = 0; i < 10; i++) f = nextFrameState(f, 1 / 60, keys())
  expect(f.flapDown).toBe(true)
  for (let i = 0; i < 10; i++) f = nextFrameState(f, 1 / 60, keys('KeyF'))
  expect(f.flapDown).toBe(false)
})

it('extends the flaps over time rather than in one tick', () => {
  let f = start()
  for (let i = 0; i < 10; i++) f = nextFrameState(f, 1 / 60, keys('KeyF'))
  const early = f.world.aircraft.flapFraction
  for (let i = 0; i < 60; i++) f = nextFrameState(f, 1 / 60, keys())
  expect(f.world.aircraft.flapFraction).toBeGreaterThan(early)
  expect(f.world.aircraft.flapFraction).toBeLessThanOrEqual(1)
})
```

```typescript
// tests/render/debrief.test.ts (or wherever flightDataItems is covered) — append
it('says where the flaps are, in all three states', () => {
  const label = (flapFraction: number) =>
    flightDataItems(f6f, { ...baseState, flapFraction }, baseControls).find((i) => i.label === 'FLAP')?.value
  expect(label(0)).toBe('UP')
  expect(label(1)).toBe('DOWN')
  expect(label(0.4)).toMatch(/MOV|\d/)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/input/bindings.test.ts tests/render/frame.test.ts`
Expected: FAIL — no `toggleFlaps` binding, `f.flapDown` undefined, no `FLAP` item.

- [ ] **Step 3: Implement**

`src/input/bindings.ts`, beside `toggleGear`:

```typescript
  toggleFlaps: ['KeyF'],
```

`src/render/frame.ts` — two fields on `FrameState`, mirroring `gearDown`/`gearPressed`:

```typescript
  /** Where the flap lever is. Threaded into `Controls.flapDown` every frame,
   *  for the reason the `gearDown` field's comment gives: a lever the
   *  simulation is not told about every step does not move. */
  readonly flapDown: boolean
  /** Whether the flap key was down last frame, for edge detection -- a lever
   *  that stays where it is left, not a switch that flips 60 times a second. */
  readonly flapPressed: boolean
```

in `initialFrameState`: `flapDown: false,` and `flapPressed: false,` — flaps up on every spawn, including the parked one, because a real airplane is not left with flaps hanging.

in `nextFrameState`, beside the gear's edge detection:

```typescript
  const flapKeyDown = isBindingDown(keysDown, 'toggleFlaps')
  const flapDown = flapKeyDown && !frame.flapPressed ? !frame.flapDown : frame.flapDown
```

and `flapDown` into the controls the world is stepped with, exactly as `gearDown` is.

`src/render/legend.ts`, beside the gear row: `{ keys: 'F', label: 'Flaps' },`

`src/render/flightData.ts`, beside the gear item:

```typescript
  // Thresholds match the gear item's, and `GEAR_DOWN_FRACTION` is why 0.95 is
  // the DOWN boundary rather than 1: that is the travel at which the
  // simulation starts treating the device as deployed.
  {
    label: 'FLAP',
    value: state.flapFraction >= 0.95 ? 'DOWN' : state.flapFraction <= 0.05 ? 'UP' : 'MOVING',
  },
```

- [ ] **Step 4: Run the full suite and commit**

Run: `npm run verify` — exit 0.

```bash
git add src/input/bindings.ts src/render/legend.ts src/render/frame.ts src/render/flightData.ts tests/
git commit -m "F for flaps, and say where they are"
```

---

### Task 9: The approach autopilot

**Files:**
- Create: `tools/autopilot/approach.ts`
- Test: `tests/tools/approach.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `approachControls(spec: AircraftSpec, state: AircraftState, target: ApproachTarget): Controls`; `type ApproachTarget = { readonly aimX: number; readonly aimZ: number; readonly runwayHeadingRad: number; readonly touchdownElevationM: number }`.

**In `tools/`, not `src/`.** Master spec §11 lists the scripted autopilot (item 2) and the AI pilot controller (item 3) as different things: item 3 is Plan 7's and flies the player's seat in a mission. Putting this in `src/` would ship a mission AI two plans early.

This is a controller, not a script of timed inputs: it reads the state and returns a `Controls` every tick, so it can be dropped into any harness that already drives `step`.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/tools/approach.test.ts
import { describe, it, expect } from 'vitest'
import { approachControls } from '../../tools/autopilot/approach.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const target = { aimX: -29666, aimZ: 47605, runwayHeadingRad: 0, touchdownElevationM: 1.673 }

describe('approachControls', () => {
  it('configures the airplane for landing: gear and flaps down', () => {
    const s = createState({ position: v3(-29666, 300, 46000), velocity: v3(0, -3, 50) })
    const c = approachControls(f6f, s, target)
    expect(c.gearDown).toBe(true)
    expect(c.flapDown).toBe(true)
  })

  it('adds throttle when slow and takes it off when fast', () => {
    const slow = createState({ position: v3(-29666, 300, 46000), velocity: v3(0, -3, 30) })
    const fast = createState({ position: v3(-29666, 300, 46000), velocity: v3(0, -3, 90) })
    expect(approachControls(f6f, slow, target).throttle)
      .toBeGreaterThan(approachControls(f6f, fast, target).throttle)
  })

  it('pitches up when below the glide path and down when above it', () => {
    const low = createState({ position: v3(-29666, 40, 46000), velocity: v3(0, 0, 50) })
    const high = createState({ position: v3(-29666, 400, 46000), velocity: v3(0, 0, 50) })
    expect(approachControls(f6f, low, target).pitch)
      .toBeGreaterThan(approachControls(f6f, high, target).pitch)
  })

  it('closes the throttle and holds nose-up in the flare', () => {
    // A few metres over the aim point: the flare is the one phase where the
    // controller stops chasing the glide path and just arrests the sink.
    const flaring = createState({
      position: v3(-29666, target.touchdownElevationM + 4, 47605),
      velocity: v3(0, -1.5, 40),
    })
    const c = approachControls(f6f, flaring, target)
    expect(c.throttle).toBeLessThan(0.05)
    expect(c.pitch).toBeGreaterThan(0)
  })

  it('brakes once it is rolling and not before', () => {
    const rolling = createState({
      position: v3(-29666, target.touchdownElevationM + f6f.gear.heightM, 47605),
      velocity: v3(0, 0, 25),
      gearFraction: 1,
    })
    const airborne = createState({ position: v3(-29666, 200, 46000), velocity: v3(0, -3, 50) })
    expect(approachControls(f6f, rolling, target).brake ?? 0).toBeGreaterThan(0.2)
    expect(approachControls(f6f, airborne, target).brake ?? 0).toBe(0)
  })

  it('returns finite, in-range controls for every state it is handed', () => {
    // It runs thousands of times per landing and feeds `step` directly.
    for (const y of [0, 5, 50, 500, 5000]) {
      for (const vz of [-100, 0, 30, 120]) {
        const c = approachControls(f6f, createState({ position: v3(-29666, y, 46000), velocity: v3(0, -3, vz) }), target)
        for (const v of [c.pitch, c.roll, c.yaw, c.throttle, c.brake ?? 0]) {
          expect(Number.isFinite(v)).toBe(true)
        }
        expect(c.throttle).toBeGreaterThanOrEqual(0)
        expect(c.throttle).toBeLessThanOrEqual(1)
        expect(Math.abs(c.pitch)).toBeLessThanOrEqual(1)
      }
    }
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/tools/approach.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// tools/autopilot/approach.ts
import type { AircraftSpec } from '../../src/sim/flight/schema.js'
import type { AircraftState, Controls } from '../../src/sim/flight/state.js'
import { airspeed } from '../../src/sim/flight/model.js'

export type ApproachTarget = {
  readonly aimX: number
  readonly aimZ: number
  readonly runwayHeadingRad: number
  readonly touchdownElevationM: number
}

/** Vref: the conventional 1.3 times the stalling speed in the landing
 *  configuration. A TUNING value, not a measurement -- the first number to
 *  change if the autopilot cannot hold the path. */
const VREF_STALL_MULTIPLE = 1.3
/** Standard 3-degree approach path. Tuning value. */
const GLIDE_PATH_RAD = (3 * Math.PI) / 180
/** Height above the touchdown elevation at which the controller stops chasing
 *  the path and starts arresting the sink. Tuning value. */
const FLARE_HEIGHT_M = 5
/** Nose-up held through the flare. BOUNDED on purpose: a full, indefinitely
 *  held deflection over-rotates into a stall and porpoises, which
 *  `tests/render/frame.test.ts` records observing. Tuning value. */
const FLARE_PITCH = 0.35
/** Wheel braking during the roll-out. Tuning value. */
const ROLLOUT_BRAKE = 0.6
/** Gains, all tuning values. Proportional only: the plant is a rate-commanded
 *  airplane, and an integrator here would need anti-windup to be honest. */
const PITCH_PER_PATH_ERROR_RAD = 3.0
const THROTTLE_PER_MPS = 0.05
const YAW_PER_OFFSET_M = 0.01

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/**
 * The controls an approach wants, this tick. Master spec §11's item 2.
 *
 * A pure function of the state rather than a script of timed inputs and with
 * no stored phase, so a harness can drop it into any loop that already drives
 * `step`, restart it anywhere, and get the same answer for the same state.
 * The AI pilot controller of §11's item 3 is a different thing and is Plan 7's.
 */
export function approachControls(spec: AircraftSpec, state: AircraftState, target: ApproachTarget): Controls {
  const vrefMps = VREF_STALL_MULTIPLE * spec.reference.stallSpeedFlapMps
  const heightM = state.position.y - spec.gear.heightM - target.touchdownElevationM
  const alongM = target.aimZ - state.position.z
  const acrossM = state.position.x - target.aimX
  const speedMps = airspeed(state)

  // Configured for landing throughout: the gear and flaps take seconds to
  // travel, so asking early is the whole point.
  const configured = { gearDown: true, flapDown: true }

  // Rolling: on the wheels and slow enough that this is a roll-out, not a
  // touch-and-go. Steer with the rudder and brake.
  if (heightM <= 0.1 && speedMps < vrefMps) {
    return {
      ...configured,
      pitch: 0,
      roll: 0,
      yaw: clamp(-acrossM * YAW_PER_OFFSET_M, -1, 1),
      throttle: 0,
      brake: ROLLOUT_BRAKE,
    }
  }

  // Flare: stop chasing the path, close the throttle, hold a bounded nose-up.
  if (heightM <= FLARE_HEIGHT_M) {
    return { ...configured, pitch: FLARE_PITCH, roll: 0, yaw: clamp(-acrossM * YAW_PER_OFFSET_M, -1, 1), throttle: 0, brake: 0 }
  }

  // On the path: pitch corrects the path error, throttle holds Vref. Splitting
  // them this way is the conventional pairing and keeps each loop readable;
  // it is not claimed to be optimal.
  const wantedHeightM = Math.max(0, alongM) * Math.tan(GLIDE_PATH_RAD)
  const pathErrorRad = Math.atan2(wantedHeightM - heightM, Math.max(Math.abs(alongM), 1))
  return {
    ...configured,
    pitch: clamp(pathErrorRad * PITCH_PER_PATH_ERROR_RAD, -1, 1),
    roll: 0,
    yaw: clamp(-acrossM * YAW_PER_OFFSET_M, -1, 1),
    throttle: clamp((vrefMps - speedMps) * THROTTLE_PER_MPS + 0.3, 0, 1),
    brake: 0,
  }
}
```

**Sign conventions to check against the repo before trusting the gains:**
`Controls.pitch` is positive nose-up and `Controls.yaw` positive nose-right
(`src/sim/flight/state.ts`), and `bodyRates.y` is NEGATIVE when yawing right —
do not read that field's sign off `Controls.yaw`. The `yaw` term above assumes
a northbound runway; Task 10 flies exactly that, and generalising it to
`target.runwayHeadingRad` is work for whoever lands on a second strip.

- [ ] **Step 4: Run the tests to verify they pass, then the full suite**

Run: `npx vitest run tests/tools/approach.test.ts` then `npm run verify` — both exit 0.

- [ ] **Step 5: Commit**

```bash
git add tools/autopilot/approach.ts tests/tools/approach.test.ts
git commit -m "An autopilot that can fly an approach, so Mark does not have to"
```

---

### Task 10: The landing, asserted end to end

**Files:**
- Create: `tests/sim/landing.test.ts`
- Test: itself

**Interfaces:**
- Consumes: `approachControls` (Task 9), the real committed terrain.

**This is the deliverable of the whole plan.** It flies the autopilot into Tacloban over the real heightfield and asserts the airplane comes to rest on the strip — which is what Task 7 bought and what nothing currently checks.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/sim/landing.test.ts
import { describe, it, expect } from 'vitest'
import { approachControls } from '../../tools/autopilot/approach.js'
import { advance, createWorld, DT } from '../../src/sim/loop.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import { createTerrainField, heightAt } from '../../src/sim/world/terrain.js'
import { loadTerrainHeader, loadTerrainLevel, FIRST_COMMITTED_LEVEL } from '../../tools/terrain/load.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { supportedContact, GROUND_CONTACT_TOLERANCE_M, MAX_SUPPORTED_SINK_MPS } from '../../src/sim/ground.js'
import { RUNWAY_LENGTH_M, RUNWAY_WIDTH_M, RUNWAY_CENTRE } from '../../src/render/scene/runway.js'
import { airspeed } from '../../src/sim/flight/model.js'

const f6f = loadAircraftSpec('f6f-hellcat')

describe('an approach flown into Tacloban', () => {
  it('touches down gently, tracks the strip, and comes to rest on it', () => {
    const header = loadTerrainHeader()
    const terrain = createTerrainField(header, FIRST_COMMITTED_LEVEL, loadTerrainLevel(FIRST_COMMITTED_LEVEL, header))
    const elevation = heightAt(terrain, RUNWAY_CENTRE.x, RUNWAY_CENTRE.z)
    const target = {
      aimX: RUNWAY_CENTRE.x,
      aimZ: RUNWAY_CENTRE.z - RUNWAY_LENGTH_M / 4,
      runwayHeadingRad: 0,
      touchdownElevationM: elevation,
    }

    // Five km south of the aim point on a 3-degree path, lined up north, at
    // the approach speed the autopilot is going to try to hold.
    const startZ = target.aimZ - 5000
    let world = {
      ...createWorld(
        f6f,
        createState({
          position: v3(RUNWAY_CENTRE.x, elevation + 5000 * Math.tan((3 * Math.PI) / 180), startZ),
          velocity: v3(0, 0, 1.3 * f6f.reference.stallSpeedFlapMps),
          attitude: qFromAxisAngle(v3(0, 1, 0), -Math.PI / 2),
          gearFraction: 1,
          flapFraction: 1,
        }),
      ),
      terrain,
    }

    let touchdownSinkMps: number | null = null
    let worstSinkMps = 0
    const MAX_S = 300
    for (let i = 0; i < 60 * MAX_S; i++) {
      const before = world.aircraft
      const ground = heightAt(terrain, before.position.x, before.position.z)
      const wasSupported = supportedContact(f6f, before, ground)
      // `advance(world, elapsed, stepper?, assist?)` takes NO controls -- they
      // live on `World.controls` and are set before stepping, and it returns an
      // `AdvanceResult`, so the world comes off `.world`.
      world = advance({ ...world, controls: approachControls(f6f, before, target) }, DT).world
      const now = world.aircraft
      const nowGround = heightAt(terrain, now.position.x, now.position.z)
      const nowSupported = supportedContact(f6f, now, nowGround)
      if (!wasSupported && nowSupported && touchdownSinkMps === null) {
        touchdownSinkMps = -before.velocity.y
      }
      worstSinkMps = Math.max(worstSinkMps, -now.velocity.y)
      expect(world.impact, `crashed at tick ${now.tick}`).toBeNull()
      if (nowSupported && airspeed(now) < 1) break
    }

    expect(touchdownSinkMps, 'never touched down').not.toBeNull()
    console.log(
      `landing: touchdown sink ${touchdownSinkMps!.toFixed(2)} m/s, worst sink ` +
        `${worstSinkMps.toFixed(2)} m/s, came to rest at ` +
        `(${world.aircraft.position.x.toFixed(0)}, ${world.aircraft.position.z.toFixed(0)})`,
    )

    // Gentle enough that 11a's gates called it a landing rather than a crash.
    expect(touchdownSinkMps!).toBeLessThan(MAX_SUPPORTED_SINK_MPS)
    // Stopped, and stopped ON the strip -- this is what the lateral tire force
    // buys, and a roll-out that slid off the side would pass a sink-rate-only
    // assertion while being no landing at all.
    expect(airspeed(world.aircraft)).toBeLessThan(1)
    expect(Math.abs(world.aircraft.position.x - RUNWAY_CENTRE.x)).toBeLessThan(RUNWAY_WIDTH_M / 2)
    expect(Math.abs(world.aircraft.position.z - RUNWAY_CENTRE.z)).toBeLessThan(RUNWAY_LENGTH_M / 2)
    // Still on its wheels at rest, not resting on something else.
    const restGround = heightAt(terrain, world.aircraft.position.x, world.aircraft.position.z)
    expect(world.aircraft.position.y - f6f.gear.heightM - restGround).toBeLessThan(GROUND_CONTACT_TOLERANCE_M)
  })
})
```

Note the import of `RUNWAY_*` from `src/render/`: this is a TEST, so it may cross the boundary `src/sim/` may not. If `.dependency-cruiser.cjs` objects, move the three runway constants' assertions to comparing against the literal `(-29666, 47605)` with a comment pointing at `runway.ts`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/sim/landing.test.ts`
Expected: FAIL. **Which way it fails is the information**: "never touched down" means the autopilot cannot fly the path; a crash means the gates or the flare are wrong; sliding off the strip means Task 7 is not applying.

- [ ] **Step 3: Iterate on the autopilot until it lands**

Tune only `tools/autopilot/approach.ts` here — its gains, its Vref multiple, its flare height. **Do not touch the gates in `src/sim/ground.ts` in this task**; that is Task 11, and doing it here would hide a flying problem behind a widened gate. Record what each change bought in the commit message.

- [ ] **Step 4: Run the full suite and commit**

Run: `npm run verify` — exit 0.

```bash
git add tests/sim/landing.test.ts tools/autopilot/approach.ts
git commit -m "It lands: an approach flown into Tacloban, asserted end to end"
```

---

### Task 11: Tune the landing gates against what a flown approach produces

**Files:**
- Modify: `src/sim/ground.ts`, `content/aircraft/f6f-hellcat.json`
- Test: `tests/sim/ground.test.ts`, `tests/sim/landing.test.ts`

**Interfaces:**
- Consumes: the numbers Task 10's test prints.

11a shipped four constants deciding whether an arrival is a landing or a crash, all chosen before anything could fly an approach:

| Constant | 11a value | What this task does with it |
| --- | --- | --- |
| `MAX_SUPPORTED_SINK_MPS` | 4.0 | **Mark's call — see the note below.** |
| `MAX_SUPPORTED_SPEED_STALL_MULTIPLE` | 1.6 | Re-examine: it multiplies `stallSpeedMps`, and Task 2 lowered the effective stall speed 34.5% with flaps out. A constant expressed as a multiple of a number this plan changed has already changed. |
| `ARRIVAL_SINK_THRESHOLD_MPS` | 0.1 | Confirm it still separates an arrival from a roll now that roll-outs happen. |
| `GEAR_DOWN_FRACTION` | 0.95 | Unchanged unless the autopilot's gear timing argues otherwise. |

> **Stop and ask Mark before changing `MAX_SUPPORTED_SINK_MPS`.** No source settles it. Task 10 can report what sink rate a flown approach *produces*; only Mark can say what should break the airplane. Report the measured touchdown sink and the worst sink on the approach, and propose a value — do not pick one silently.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/sim/ground.test.ts — append
describe('the landing gates admit a flown approach and reject an arrival that should hurt', () => {
  it('accepts the sink rate a flown approach actually produces', () => {
    // The figure Task 10 prints. A gate that rejects a competently flown
    // approach is the defect; a gate that accepts everything is worse, for the
    // reason 11a recorded when its soak assertions shipped covering zero ticks.
    const gentle = createState({
      position: v3(0, 10 + f6f.gear.heightM, 0),
      velocity: v3(0, -1.5, 40),
      gearFraction: 1,
      flapFraction: 1,
    })
    expect(supportedContact(f6f, { ...gentle, position: v3(0, 10 + f6f.gear.heightM, 0) }, 10)).toBe(true)
  })

  it('still rejects an arrival nobody would call a landing', () => {
    const dropped = createState({
      position: v3(0, 10 + f6f.gear.heightM, 0),
      velocity: v3(0, -25, 40),
      gearFraction: 1,
    })
    expect(supportedContact(f6f, dropped, 10)).toBe(false)
  })

  it('rejects a fast arrival scaled to the FLAPPED stall speed, not the clean one', () => {
    // MAX_SUPPORTED_SPEED_STALL_MULTIPLE multiplies `stallSpeedMps`, which is
    // the CLEAN figure. With flaps the airplane stalls 34.5% slower, so the cap
    // is 34.5% more generous than it reads -- this asserts whichever resolution
    // this task takes, deliberately, rather than leaving it implicit.
    const fast = createState({
      position: v3(0, 10 + f6f.gear.heightM, 0),
      velocity: v3(0, -2, 3 * f6f.reference.stallSpeedFlapMps),
      gearFraction: 1,
      flapFraction: 1,
    })
    expect(supportedContact(f6f, fast, 10)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails, and read HOW**

Run: `npx vitest run tests/sim/ground.test.ts`
Expected: at least the third case fails, because the speed cap currently reads the clean stall speed.

- [ ] **Step 3: Report the measurements and get Mark's decision on the sink gate**

Run Task 10's landing test and collect its printed figures. Then stop and put them to Mark with a proposal.

- [ ] **Step 4: Implement the agreed gates**

Change only what was agreed, and put the measured evidence in the comment on each constant, dated — the values are then re-checkable rather than timeless.

- [ ] **Step 5: Run the full suite and commit**

Run: `npm run verify` — exit 0.

```bash
git add src/sim/ground.ts content/aircraft/f6f-hellcat.json tests/sim/ground.test.ts
git commit -m "Tune the landing gates against a flown approach"
```

---

### Task 12: Soak the landing, write the Tier 2 spec, and hand off

**Files:**
- Modify: `tools/soak/run.ts`, `tests/sim/soak.test.ts`, `README.md`, `docs/superpowers/specs/2026-09-12-ww2airsim-design.md`
- Create: `tests/e2e/approach.spec.ts`, `docs/handoff/2026-09-17-plan11b-landing.md`

- [ ] **Step 1: Add landing cohorts to the soak, with a floor on how often they fire**

11a's own lesson applies directly and is the reason this step exists: its new soak assertions shipped covering `supportedContact` on **0 of 417,539 ticks**, and breaking the ground constraint left the suite green. Add a cohort that flies `approachControls` at a spread of seeds, and assert a floor on the number of ticks that reached a roll-out — the same medicine the existing `terrainHits > 100` floor applies for the same reason.

- [ ] **Step 2: Write the Tier 2 spec**

`tests/e2e/approach.spec.ts`, following `tests/e2e/takeoff.spec.ts`'s shape: spawn airborne on approach with `?spawnX/Y/Z`, drive it with keyboard input, and assert through the granular `__ww2` getters that the airplane ends up supported and stopped. Add a getter only if one is genuinely missing, never a whole-frame getter.

- [ ] **Step 3: Do NOT run Playwright unless it is actually available, and say which**

Tier 2 needs the Windows reference desktop. **As of this plan's writing a Playwright server IS reachable** — the loop is in `README.md`'s Tier 2 section (`npm run dev:lan`, `ssh -N -L 39001:127.0.0.1:3000 ryzen`, then `PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org npx playwright test`). If it answers, run the spec and record the result. If it does not, record Tier 2 as outstanding with the exact command. **Do not fabricate a run** — and note that 11a's `takeoff.spec.ts` is still unexecuted, so check that too while the server is up.

- [ ] **Step 4: Update spec §15 and the README**

11b's row to Complete with a handoff link, the `— next` marker to Plan 12, and a README paragraph on what landing now does, pointing at §15 rather than restating it.

- [ ] **Step 5: Write the handoff**

Follow `docs/handoff/2026-09-16-plan11a-ground-handling.md`'s shape. It must record, accurately:

- The flap stall card's measured figure against the 84.5 mph trial, and that `flap.clIncrement` is DERIVED from two sourced stall speeds rather than estimated.
- The take-off card's new measured distance with flaps and ground effect, and that `flap.dragAreaM2` is **characterised** by it rather than validated against it.
- Every flap and gear figure that is an estimate rather than a sourced value, in a table.
- The landing envelope the autopilot measures: touchdown sink, speed, roll-out distance.
- That `MAX_SUPPORTED_SINK_MPS` was Mark's judgement and on what evidence.
- Tier 2's status, honestly, for both this plan and 11a's outstanding take-off spec.
- Anything left undone, with what it would cost.

- [ ] **Step 6: `npm run verify` exits 0; commit**

```bash
git add tools/soak/run.ts tests/sim/soak.test.ts tests/e2e/approach.spec.ts README.md docs/
git commit -m "Soak the landing, spec Tier 2, and hand off Plan 11b"
```

---

## Self-review against the spec

| Spec section | Task |
| --- | --- |
| §1 `clMax` is inert | Task 2 (the increment goes into `attached`, not onto `clMax`) |
| §1 acceptance loop is Mark | Tasks 9, 10 |
| §2 flaps as a camber shift, derived increment | Tasks 1, 2, 4 |
| §2 `flapFraction` mirrors `gearFraction` | Task 1 |
| §2 the 84.5 mph figure must become a field | Task 1, graded in Task 4 |
| §2 flap drag is the free parameter | Tasks 3, 6 |
| §3 ground effect, no fitted constant | Task 5 |
| §3 which height feeds it | Task 5, stated in the task |
| §4 lateral tire force as a decay | Task 7 |
| §5 the approach autopilot, in `tools/` | Task 9 |
| §6 the four gates | Task 11 |
| §7 the take-off card re-measure | Task 6 |
| §8 controls and indication | Task 8 |
| §9 verification, all tiers | Tasks 4, 6, 10, 12 |
| §11 q1 `MAX_SUPPORTED_SINK_MPS` is Mark's | Task 11, with an explicit stop |
| §11 q2 downhill rolling costs energy | **Not scoped.** Pre-existing; Task 10's roll-out is on near-flat ground at Tacloban, so it should not bind. Record it again in Task 12's handoff rather than silently dropping it. |
| §11 q3 held nose-up porpoises | Task 9's bounded flare input works around it; not fixed |
| §11 q4 ocean waves unverified from the runway | **Not scoped.** Recorded in the ocean handoff (`cefb184`) |
| §11 q5 which height feeds ground effect | Task 5 |
