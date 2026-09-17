# Ground Handling, Gear and Take-off Implementation Plan (Plan 11a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The F6F starts on a runway at Tacloban, rolls, rotates and flies — and the graded historical take-off card measures real ground physics instead of a harness trick.

**Architecture:** A kinematic ground constraint inside `step`, plus a second control regime for weight-on-wheels. Terrain reaches `step` through `SimContext` — the field Plan 10 refused to add speculatively, now that this plan is its consumer. Gear is state; gear command and brakes are controls. The runway is a render-only strip on real terrain.

**Tech Stack:** TypeScript (strict), vitest, three.js `three/webgpu`, Playwright (Tier 2), dependency-cruiser.

**Spec:** `docs/superpowers/specs/2026-09-16-ground-handling-design.md`

## Global Constraints

- **`src/sim/` may not import `src/render/`, any rendering library, Node core, or `src/input/`.** Enforced by `.dependency-cruiser.cjs` and `tests/architecture/boundary.test.ts`.
- **The ground constraint must NEVER lift the airplane.** Killing vertical velocity removes energy and is safe; raising an airplane onto the surface adds `g·h` and trips `assertNoEnergyGain` at idle throttle (`src/sim/invariants.ts`). An airplane found *below* the surface is Plan 10's business — `advance` records an impact and freezes.
- **New fields on `SimContext` and `Controls` are OPTIONAL, never required.** There are 51 `{ dt:, tick: }` construction sites and only ONE of them is production (`src/sim/loop.ts:398`); a required field would churn 50 test and tool sites for no behavior. Same for `Controls`, whose literals appear throughout the suite.
- **`advance` must stay pure.** `tests/sim/loop.test.ts` hands it a deep-frozen world.
- **Gear defaults to UP.** `createState` with no gear argument must produce the airplane every existing test already has. Defaulting to down would add parasitic drag to the golden trajectory and every graded test card.
- **Do not re-derive Tacloban's coordinate.** It is `(-29666, 47605)`, in `tests/tools/terrainBuild.test.ts` and `tests/e2e/terrain.spec.ts`.
- **US spelling** in all comments, test names and docs: airplane, maneuver, behavior, modeled, license. Not aeroplane, manoeuvre, behaviour.
- **Escape `|` as `\|` inside markdown table cells**, including inside code spans.
- **Capture exit status directly** (`rc=$?`), never through a pipe into `grep`.
- Run `npm run verify` before every commit. Baseline at `5ca59d1`: **724 passed, 1 skipped, exit 0**.

---

## Measurements taken during planning, to be used rather than repeated

Probed against the committed heightfield on 2026-09-16, north–south through Tacloban over 1.8 km:

| Level | Sample spacing | Height range | Spread | Worst local grade |
| --- | --- | --- | --- | --- |
| L0 | 24 m | 0.28–2.01 m | 1.74 m | **2.12%** |
| L2 | 98 m | 1.03–1.83 m | 0.80 m | 0.18% |
| L4 | 391 m | 1.23–1.72 m | 0.49 m | 0.30% |

**This changes a design decision the spec left open.** The spec's §5 said the ground was "already a table" on the strength of the L4 figure. At L0 it is not: 2.12% is roughly half a metre of rise across one 24 m sample. An airplane rolling at 50 m/s crosses that in half a second.

Two consequences, both binding on this plan:

1. **The take-off test card runs on synthetic flat ground, not on Tacloban.** The card grades the flight model against a Patuxent River trial figure measured on a flat airfield. Running it over real Leyte would make a *historical grading number* depend on which terrain level the test happened to load — L0 and L4 are different runways. Use a flat synthetic field, exactly as `tests/sim/terrainContact.test.ts` builds its `plateau`.
2. **The runway is still a visual strip on real ground** (Mark's decision, 2026-09-16) and the undulation is accepted, not flattened. But the plan must say so out loud in the handoff, because "the runway is bumpier in the main checkout than in a fresh clone" is exactly the kind of environment-dependent surprise this project keeps writing down.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/sim/loop.ts` | `SimContext` gains an optional terrain field; `advance` threads `world.terrain` into it. |
| `src/sim/flight/state.ts` | `AircraftState` gains `gearFraction`; `Controls` gains optional `gearDown` and `brake`. |
| `src/sim/flight/schema.ts` | `AircraftSpec` gains the gear block: drag area, travel time, geometry for the wheels. |
| `content/aircraft/f6f-hellcat.json` | The F6F's gear figures, sourced or honestly labeled as estimates. |
| `src/sim/ground.ts` | **New.** Pure: weight-on-wheels, the constraint, rolling friction, and the ground rate regime. |
| `src/sim/flight/model.ts` | `step` applies gear drag, the constraint, and the ground regime. |
| `src/input/bindings.ts`, `src/render/legend.ts` | `G` for gear, `B` for brakes, with legend rows. |
| `src/render/frame.ts` | Gear toggle edge and brake input into `Controls`. |
| `src/render/flightData.ts` | Gear state shown to the pilot. |
| `src/render/scene/runway.ts` | **New.** The visual strip at Tacloban. |
| `tools/testcards/measure.ts` | `measureTakeoffRun` loses its fake ground. |
| `tools/soak/run.ts` | Soak covers an airplane that ends up on its wheels. |

---

### Task 1: Terrain reaches `step`

The spec's open question 1. Plan 10 refused to add this field speculatively, on `SimContext`'s own rule that "later plans add a field when they have a consumer for it." This plan is that consumer.

**Files:**
- Modify: `src/sim/loop.ts`
- Test: `tests/sim/loop.test.ts`

**Interfaces:**
- Produces: `SimContext.terrain?: TerrainField | null`, threaded by `advance` from `world.terrain`.

**Why optional:** there are 51 `{ dt:, tick: }` sites and exactly one is production. Verified during planning: `src/sim/loop.ts:398` is the only construction site under `src/`. A required field would edit 50 test and tool call sites to say "no ground" explicitly, for no behavior.

- [x] **Step 1: Write the failing test**

```typescript
// tests/sim/loop.test.ts — append inside the existing describe for advance
it('threads the world terrain into the context every step, so step can see the ground', () => {
  // Without this, the whole ground-handling layer is inert in production while
  // every unit test of it still passes, because those call the ground functions
  // directly. That is precisely how Plan 3's assists layer shipped unwired.
  const seen: (TerrainField | null | undefined)[] = []
  const spy: Stepper = (spec, state, controls, ctx) => {
    seen.push(ctx.terrain)
    return step(spec, state, controls, ctx)
  }
  const world = { ...createWorld(f6f, createState({ position: v3(0, 3000, 0), velocity: v3(120, 0, 0) }), NEUTRAL), terrain: plateau }
  advance(world, DT * 3, spy)
  expect(seen).toHaveLength(3)
  expect(seen.every((t) => t === plateau)).toBe(true)
})

it('passes null terrain through rather than undefined, so "no ground" is explicit', () => {
  const seen: (TerrainField | null | undefined)[] = []
  const spy: Stepper = (spec, state, controls, ctx) => { seen.push(ctx.terrain); return step(spec, state, controls, ctx) }
  advance(createWorld(f6f, createState({ position: v3(0, 3000, 0), velocity: v3(120, 0, 0) }), NEUTRAL), DT, spy)
  expect(seen).toEqual([null])
})
```

Use whatever `f6f`, `plateau` and `NEUTRAL` bindings that file already has; if it has no flat synthetic field, build one the way `tests/sim/terrainContact.test.ts` builds `plateau` and say so in the test.

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/sim/loop.test.ts`
Expected: FAIL — `Property 'terrain' does not exist on type 'SimContext'` at typecheck.

- [x] **Step 3: Add the field**

```typescript
  /**
   * The ground under the airplane this step, or `null` for "no ground".
   *
   * Added by Plan 11a, which is the consumer this field was waiting for: the
   * ground constraint and the weight-on-wheels regime both live in `step`, and
   * `step` cannot ask the world for anything it is not handed. Optional rather
   * than required deliberately — there are 51 `SimContext` construction sites
   * and exactly ONE of them is production (`advance`, below). A required field
   * would have edited 50 test and tool sites to say "no ground" out loud, for
   * no behavior. `undefined` and `null` both mean no ground.
   */
  readonly terrain?: TerrainField | null
```

- [x] **Step 4: Thread it in `advance`**

At the single production construction site, change `{ dt: DT, tick: current.tick + 1 }` to `{ dt: DT, tick: current.tick + 1, terrain: world.terrain }`.

- [x] **Step 5: Run the full suite**

Run: `npm run verify`
Expected: exit 0, **726 passed, 1 skipped**. Nothing else moves: `step` does not read the field yet.

- [x] **Step 6: Commit**

```bash
git add src/sim/loop.ts tests/sim/loop.test.ts
git commit -m "Hand step the ground, now that something needs it"
```

---

### Task 2: Gear as state, and its command

**Files:**
- Modify: `src/sim/flight/state.ts`
- Create: `src/sim/ground.ts`
- Test: `tests/sim/ground.test.ts`

**Interfaces:**
- Produces: `AircraftState.gearFraction: number` (0 = up, 1 = down); `Controls.gearDown?: boolean`; `gearAfter(spec, gearFraction, gearDown, dt): number` from `src/sim/ground.js`.

**Gear defaults to UP.** `createState` with no argument must produce exactly the airplane every existing test has. Down-by-default would add parasitic drag to the golden trajectory and every graded card.

- [x] **Step 1: Write the failing tests**

```typescript
// tests/sim/ground.test.ts
import { describe, it, expect } from 'vitest'
import { gearAfter } from '../../src/sim/ground.js'
import { createState } from '../../src/sim/flight/state.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const DT = 1 / 60

describe('landing gear', () => {
  it('starts up, so no existing flight gains drag it did not have', () => {
    expect(createState().gearFraction).toBe(0)
  })

  it('takes the spec travel time to come down, not one tick', () => {
    let g = 0
    for (let i = 0; i < 60 * f6f.gear.travelSeconds; i++) g = gearAfter(f6f, g, true, DT)
    expect(g).toBeCloseTo(1, 6)
  })

  it('is still on its way down halfway through the travel time', () => {
    let g = 0
    for (let i = 0; i < 30 * f6f.gear.travelSeconds; i++) g = gearAfter(f6f, g, true, DT)
    expect(g).toBeGreaterThan(0.3)
    expect(g).toBeLessThan(0.7)
  })

  it('retracts on the same travel time', () => {
    let g = 1
    for (let i = 0; i < 60 * f6f.gear.travelSeconds; i++) g = gearAfter(f6f, g, false, DT)
    expect(g).toBeCloseTo(0, 6)
  })

  it('never leaves [0, 1], whatever dt it is handed', () => {
    expect(gearAfter(f6f, 0.9, true, 100)).toBe(1)
    expect(gearAfter(f6f, 0.1, false, 100)).toBe(0)
  })

  it('holds position for a non-finite dt rather than poisoning the state', () => {
    // Every other dt consumer in this codebase guards this; a NaN reaching
    // gearFraction would reach drag and from there the integrator.
    expect(gearAfter(f6f, 0.5, true, Number.NaN)).toBe(0.5)
  })
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sim/ground.test.ts`
Expected: FAIL — `Cannot find module '../../src/sim/ground.js'`, and `spec.gear` does not exist.

- [x] **Step 3: Add the state and control fields**

In `src/sim/flight/state.ts`, add to `AircraftState`:

```typescript
  /** Gear travel, 0 = fully retracted, 1 = fully extended. A fraction rather
   *  than a boolean because a Hellcat's gear takes seconds to move and the
   *  drag changes across that interval, not in one tick. Defaults to 0 so that
   *  every flight predating Plan 11a is unchanged. */
  readonly gearFraction: number
```

and to `Controls`:

```typescript
  /** What the pilot is asking the gear to do, not where it is. Optional for
   *  the same reason `SimContext.terrain` is: `Controls` literals appear
   *  throughout the suite, and `undefined` reads as "unchanged", which is what
   *  every one of them means. */
  readonly gearDown?: boolean
```

Give `createState` a `gearFraction: init.gearFraction ?? 0` line.

- [x] **Step 4: Write `gearAfter`**

```typescript
// src/sim/ground.ts
import type { AircraftSpec } from './flight/schema.js'

/**
 * Gear travel after one step.
 *
 * `gearDown === undefined` means the pilot said nothing this step, which for a
 * lever that stays where it is left means "keep moving toward wherever it was
 * last commanded" — so `undefined` is treated as the current target, i.e. hold.
 * A non-finite `dt` holds position rather than moving by NaN, the same guard
 * `controlsFromKeys` applies for the same reason.
 */
export function gearAfter(
  spec: AircraftSpec,
  gearFraction: number,
  gearDown: boolean | undefined,
  dt: number,
): number {
  if (gearDown === undefined) return gearFraction
  const step = Number.isFinite(dt) && dt > 0 ? dt / spec.gear.travelSeconds : 0
  const next = gearDown ? gearFraction + step : gearFraction - step
  return next < 0 ? 0 : next > 1 ? 1 : next
}
```

- [x] **Step 5: Add the spec block**

In `src/sim/flight/schema.ts`, add a `gear` object with `travelSeconds: positive` and `dragAreaM2: positive`, both `.strict()`. In `content/aircraft/f6f-hellcat.json` add the values with a comment in the `reference.source` string, or a sibling note, stating plainly whether each is sourced or estimated. **An estimate labeled as an estimate is fine; an estimate presented as a trial figure is not** — the existing `rollRateDegPerSec` entry is the precedent for how this file says so.

- [x] **Step 6: Run the full suite**

Run: `npm run verify`
Expected: exit 0, **732 passed, 1 skipped**. If any existing test moves, STOP — gear defaulting to up means nothing should.

- [x] **Step 7: Commit**

```bash
git add src/sim/ground.ts src/sim/flight/state.ts src/sim/flight/schema.ts content/aircraft/f6f-hellcat.json tests/sim/ground.test.ts
git commit -m "Landing gear that takes time to move"
```

---

### Task 3: Gear drag

**Files:**
- Modify: `src/sim/ground.ts`, `src/sim/flight/model.ts`
- Test: `tests/sim/ground.test.ts`, `tests/sim/flight/forces.test.ts`

**Interfaces:**
- Consumes: `AircraftState.gearFraction`, `spec.gear.dragAreaM2`.
- Produces: `gearDragN(spec, gearFraction, dynamicPressureQ): number` from `src/sim/ground.js`.

- [x] **Step 1: Write the failing tests**

```typescript
// tests/sim/ground.test.ts — append
import { gearDragN } from '../../src/sim/ground.js'

describe('gear drag', () => {
  it('is nothing with the gear up', () => {
    expect(gearDragN(f6f, 0, 5000)).toBe(0)
  })

  it('scales with how far the gear has travelled', () => {
    const half = gearDragN(f6f, 0.5, 5000)
    const full = gearDragN(f6f, 1, 5000)
    expect(half).toBeCloseTo(full / 2, 9)
    expect(full).toBeGreaterThan(0)
  })

  it('scales with dynamic pressure, like every other drag term here', () => {
    expect(gearDragN(f6f, 1, 10000)).toBeCloseTo(2 * gearDragN(f6f, 1, 5000), 9)
  })
})
```

```typescript
// tests/sim/flight/forces.test.ts — append
it('flies slower with the gear down than with it up, all else equal', () => {
  // The whole point of the drag term: it must actually reach the integrator.
  // A term added to ground.ts but never called from step would pass every test
  // above and change nothing about the airplane.
  const base = createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) })
  const up = step(f6f, base, { pitch: 0, roll: 0, yaw: 0, throttle: 0 }, { dt: DT, tick: 1 })
  const down = step(f6f, { ...base, gearFraction: 1 }, { pitch: 0, roll: 0, yaw: 0, throttle: 0 }, { dt: DT, tick: 1 })
  expect(length(down.velocity)).toBeLessThan(length(up.velocity))
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sim/ground.test.ts tests/sim/flight/forces.test.ts`
Expected: FAIL — `gearDragN is not a function`, and the forces case sees identical velocities.

- [x] **Step 3: Write the drag term**

```typescript
/**
 * Parasitic drag from extended gear, newtons.
 *
 * `dragAreaM2` is a drag AREA (Cd·A), so it multiplies dynamic pressure
 * directly and needs no separate coefficient — the same shape the wing's
 * `q * wingAreaM2 * cd` takes in `step`, with the coefficient already folded
 * in. Linear in travel: a gear halfway down is treated as half the drag,
 * which is a simplification and is not worth more than that at this model's
 * fidelity.
 */
export function gearDragN(spec: AircraftSpec, gearFraction: number, q: number): number {
  return q * spec.gear.dragAreaM2 * gearFraction
}
```

- [x] **Step 4: Apply it in `step`**

In `src/sim/flight/model.ts`, after `dragN` is computed, add the gear term into the drag applied along `vdir`. Do not add a fourth force vector — fold it into the existing drag so there is one drag direction, and add a one-line comment saying gear drag is parasitic and acts with the rest of the drag.

- [x] **Step 5: Run the full suite**

Run: `npm run verify`
Expected: exit 0, **736 passed, 1 skipped**. The golden trajectory and every test card must be UNMOVED: they all fly with `gearFraction` 0, where this term is exactly zero. If any of them moves, the default is wrong — stop and report rather than re-baselining.

- [x] **Step 6: Commit**

```bash
git add src/sim/ground.ts src/sim/flight/model.ts tests/
git commit -m "Gear costs you speed while it is hanging out"
```

---

### Task 4: Weight on wheels

**Files:**
- Modify: `src/sim/ground.ts`
- Test: `tests/sim/ground.test.ts`

**Interfaces:**
- Produces: `GROUND_CONTACT_TOLERANCE_M`, and `onGround(state, groundHeightM): boolean` from `src/sim/ground.js`.

A derived predicate, never a stored flag: a flag can disagree with the state it describes, and this one is read by five different consumers.

**Deliberately not gated on gear.** A belly landing is still on the ground. Whether the airplane survives being there is Plan 10's `contactOutcome`, not this predicate's business, and conflating them would make "is it touching" depend on "is it flyable".

- [x] **Step 1: Write the failing tests**

```typescript
// tests/sim/ground.test.ts — append
import { onGround, GROUND_CONTACT_TOLERANCE_M } from '../../src/sim/ground.js'
import { v3 } from '../../src/sim/math/vec3.js'

describe('weight on wheels', () => {
  const at = (y: number) => createState({ position: v3(0, y, 0) })

  it('is false well above the ground', () => {
    expect(onGround(at(500), 0)).toBe(false)
  })

  it('is true resting exactly on it', () => {
    expect(onGround(at(0), 0)).toBe(true)
  })

  it('is true within the contact tolerance', () => {
    expect(onGround(at(GROUND_CONTACT_TOLERANCE_M * 0.5), 0)).toBe(true)
  })

  it('is false just outside it', () => {
    expect(onGround(at(GROUND_CONTACT_TOLERANCE_M * 2), 0)).toBe(false)
  })

  it('reads a hilltop as ground, not sea level', () => {
    expect(onGround(at(1000), 1000)).toBe(true)
    expect(onGround(at(1000), 0)).toBe(false)
  })

  it('is false for a non-finite position rather than true', () => {
    // Written as a positive comparison so NaN fails it, the same posture
    // `contactOutcome` takes: a broken state must not be reported as safely
    // on the ground, where the constraint would then act on it.
    expect(onGround(at(Number.NaN), 0)).toBe(false)
  })
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sim/ground.test.ts`
Expected: FAIL — `onGround is not a function`.

- [x] **Step 3: Write it**

```typescript
/**
 * How close to the surface counts as resting on it, metres.
 *
 * Wanted because the constraint below must not fight the integrator: an
 * airplane rolling at 50 m/s over ground that rises 2.12% (measured at L0
 * through Tacloban, 2026-09-16) climbs about 1.8 cm per step, and a tolerance
 * tighter than that would have it flicker between airborne and grounded every
 * tick. Loose enough to absorb that, tight enough that an airplane a wingspan
 * up is unambiguously flying.
 */
export const GROUND_CONTACT_TOLERANCE_M = 0.25

/**
 * Whether the airplane is resting on the surface beneath it.
 *
 * Derived, never stored: five consumers read this, and a stored flag is one
 * that can disagree with the state it claims to describe.
 *
 * Deliberately NOT gated on the gear being down — a belly landing is still on
 * the ground. Whether the airplane survives being there is
 * `contactOutcome`'s judgment (Plan 10), and folding it in here would make
 * "is it touching" depend on "is it flyable".
 *
 * Written as a positive comparison so a non-finite position comes back
 * `false`: a broken state must not be handed to the constraint.
 */
export function onGround(state: AircraftState, groundHeightM: number): boolean {
  return state.position.y - groundHeightM <= GROUND_CONTACT_TOLERANCE_M
    && state.position.y - groundHeightM >= -GROUND_CONTACT_TOLERANCE_M
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npm run verify`
Expected: exit 0, **742 passed, 1 skipped**.

- [x] **Step 5: Commit**

```bash
git add src/sim/ground.ts tests/sim/ground.test.ts
git commit -m "Know when the wheels are carrying the weight"
```

---

### Task 5: The constraint

**Files:**
- Modify: `src/sim/ground.ts`, `src/sim/flight/model.ts`
- Test: `tests/sim/ground.test.ts`, `tests/sim/invariants.test.ts`

**Interfaces:**
- Produces: `restOnSurface(state, groundHeightM): AircraftState` from `src/sim/ground.js`, applied by `step` after integration when `onGround` holds.

**The hazard, restated because it is the one thing that must not be got wrong:** the constraint must never LIFT. Killing vertical velocity removes energy; raising the airplane adds `g·h` and trips `assertNoEnergyGain` at idle throttle. An airplane below the surface is Plan 10's — `advance` records an impact and freezes — so this function clamps DOWN to the surface and never up.

- [x] **Step 1: Write the failing tests**

```typescript
// tests/sim/ground.test.ts — append
import { restOnSurface } from '../../src/sim/ground.js'

describe('the ground constraint', () => {
  it('kills the sink rate of an airplane settling onto the surface', () => {
    const s = createState({ position: v3(0, 0.1, 0), velocity: v3(50, -2, 0) })
    const r = restOnSurface(s, 0)
    expect(r.velocity.y).toBe(0)
    expect(r.velocity.x).toBe(50)
  })

  it('places it exactly on the surface', () => {
    expect(restOnSurface(createState({ position: v3(0, 0.1, 0) }), 0).position.y).toBe(0)
  })

  it('NEVER lifts an airplane that is below the surface', () => {
    // Raising it would add g*h and trip assertNoEnergyGain at idle throttle.
    // Below the surface is Plan 10's business, not this function's.
    const below = createState({ position: v3(0, -5, 0), velocity: v3(50, -2, 0) })
    expect(restOnSurface(below, 0).position.y).toBe(-5)
  })

  it('leaves a climbing airplane alone, vertical velocity included', () => {
    // On the take-off roll the airplane is within tolerance of the ground while
    // rotating; clamping a positive climb rate to zero would pin it to the
    // runway and it would never fly.
    const r = restOnSurface(createState({ position: v3(0, 0.1, 0), velocity: v3(60, 3, 0) }), 0)
    expect(r.velocity.y).toBe(3)
  })
})
```

```typescript
// tests/sim/invariants.test.ts — append
it('the ground constraint never increases specific energy', () => {
  // The invariant this whole design is arranged around. Sweep the constraint
  // across the tolerance band and assert energy is non-increasing every time.
  for (let dy = -GROUND_CONTACT_TOLERANCE_M; dy <= GROUND_CONTACT_TOLERANCE_M; dy += 0.01) {
    for (const vy of [-8, -2, -0.1, 0, 0.1, 2, 8]) {
      const s = createState({ position: v3(0, dy, 0), velocity: v3(60, vy, 0) })
      const before = specificEnergyAirmass(s)
      const after = specificEnergyAirmass(restOnSurface(s, 0))
      expect(after, `dy=${dy} vy=${vy}`).toBeLessThanOrEqual(before + 1e-9)
    }
  }
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sim/ground.test.ts tests/sim/invariants.test.ts`
Expected: FAIL — `restOnSurface is not a function`.

- [x] **Step 3: Write it**

Clamp `position.y` DOWN to `groundHeightM` only when it is above it and within tolerance; clamp `velocity.y` up to 0 only when it is negative. Both one-directional, for the reason the tests state. Write the doc comment naming `assertNoEnergyGain` as the constraint that makes it one-directional.

- [x] **Step 4: Apply it in `step`**

After the integration produces `position` and `velocity`, if `ctx.terrain` is non-null and `onGround` holds for the integrated state, pass the state through `restOnSurface`. `ctx.terrain` being null must short-circuit before `heightAt` is called, exactly as `advance`'s impact check does.

- [x] **Step 5: Run the full suite**

Run: `npm run verify`
Expected: exit 0, **747 passed, 1 skipped**. The golden trajectory flies with `terrain: null` so it cannot be reached — confirm that rather than assume it, and if the golden moves, STOP and report: it means the null short-circuit is wrong.

- [x] **Step 6: Commit**

```bash
git add src/sim/ground.ts src/sim/flight/model.ts tests/
git commit -m "Rest on the ground instead of sinking through it"
```

---

### Task 6: Rolling friction and brakes

**Files:**
- Modify: `src/sim/ground.ts`, `src/sim/flight/model.ts`, `src/sim/flight/state.ts`, `src/sim/flight/schema.ts`, `content/aircraft/f6f-hellcat.json`
- Test: `tests/sim/ground.test.ts`

**Interfaces:**
- Consumes: `onGround` (Task 4).
- Produces: `Controls.brake?: number` (0–1); `rollingResistanceN(spec, massKg, brake): number` from `src/sim/ground.js`.

- [x] **Step 1: Write the failing tests**

```typescript
// tests/sim/ground.test.ts — append
import { rollingResistanceN } from '../../src/sim/ground.js'

describe('rolling resistance', () => {
  it('opposes the roll even with the brakes off', () => {
    expect(rollingResistanceN(f6f, 5600, 0)).toBeGreaterThan(0)
  })

  it('grows with braking', () => {
    expect(rollingResistanceN(f6f, 5600, 1)).toBeGreaterThan(rollingResistanceN(f6f, 5600, 0))
  })

  it('scales with weight, because it is a friction coefficient times weight', () => {
    expect(rollingResistanceN(f6f, 11200, 0)).toBeCloseTo(2 * rollingResistanceN(f6f, 5600, 0), 6)
  })

  it('treats a missing or non-finite brake input as brakes off', () => {
    expect(rollingResistanceN(f6f, 5600, undefined)).toBe(rollingResistanceN(f6f, 5600, 0))
    expect(rollingResistanceN(f6f, 5600, Number.NaN)).toBe(rollingResistanceN(f6f, 5600, 0))
  })
})
```

- [x] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/sim/ground.test.ts`
Expected: FAIL — `rollingResistanceN is not a function`.

- [x] **Step 3: Implement**

Add `readonly brake?: number` to `Controls` with the same "optional because literals are everywhere" comment `gearDown` carries. Add `spec.gear.rollingResistanceCoeff` and `spec.gear.brakingResistanceCoeff` to the schema and content file, labeled sourced or estimated. `rollingResistanceN` returns `(rolling + brake * (braking - rolling)) * massKg * G`, with brake clamped to `[0, 1]` and a non-finite brake treated as 0.

- [x] **Step 4: Apply in `step`**

When `onGround` holds, add the resistance as a force opposing the **ground track** — the horizontal component of velocity — not along `vdir`, which includes any vertical component. A stationary airplane must get zero resistance rather than a NaN direction; guard the normalize exactly as `step` already guards `vdir` with `v > 1e-6`.

- [x] **Step 5: Run the full suite**

Run: `npm run verify`
Expected: exit 0, **751 passed, 1 skipped**.

- [x] **Step 6: Commit**

```bash
git add src/sim/ tests/sim/ content/aircraft/f6f-hellcat.json
git commit -m "The runway drags on the wheels, and the brakes drag harder"
```

---

### Task 7: The ground control regime

**The heart of this plan.** Everything before it was forces; this is the part the spec calls the actually-hard bit. The model commands *rates*, not moments, so bolting ground reaction onto the existing rate command gives an airplane that barrel-rolls down the runway.

**Files:**
- Modify: `src/sim/ground.ts`, `src/sim/flight/model.ts`, `src/sim/flight/schema.ts`, `content/aircraft/f6f-hellcat.json`
- Test: `tests/sim/ground.test.ts`

**Interfaces:**
- Produces: `groundBodyRates(spec, state, controls, airRates): Vec3` from `src/sim/ground.js` — takes the rates the air would have commanded and returns what the airplane on its wheels actually does.

**Ruling taken here rather than left open (spec §9 question 3):** the tail comes up on a **speed gate**, `spec.gear.tailUpSpeedMps`. The alternative — elevator authority against a moment arm — reintroduces moments this model does not have and would be more detailed than the airframe it acts on. Whether the gate feels arbitrary is a Tier 3 question, and the handoff must say so.

- [x] **Step 1: Write the failing tests**

```typescript
// tests/sim/ground.test.ts — append
import { groundBodyRates } from '../../src/sim/ground.js'
import { v3 } from '../../src/sim/math/vec3.js'

const airRates = v3(1.2, 0.4, 0.8) // roll, yaw, pitch — arbitrary nonzero
const rolling = (speed: number) => createState({ position: v3(0, 0, 0), velocity: v3(speed, 0, 0) })
const stick = { pitch: 1, roll: 1, yaw: 1, throttle: 1 }

describe('the ground control regime', () => {
  it('allows NO roll at all, however hard the stick is held', () => {
    // Not reduced -- zero. The gear holds the airframe; the ailerons move and
    // the airplane does not. This is the case that makes an airplane barrel-roll
    // down the runway if it is got wrong.
    expect(groundBodyRates(f6f, rolling(20), stick, airRates).x).toBe(0)
  })

  it('allows no pitch below the speed the tail can be lifted at', () => {
    expect(groundBodyRates(f6f, rolling(1), stick, airRates).z).toBe(0)
  })

  it('allows the full commanded pitch rate once the tail is up', () => {
    const fast = rolling(f6f.gear.tailUpSpeedMps * 1.5)
    expect(groundBodyRates(f6f, fast, stick, airRates).z).toBeCloseTo(airRates.z, 9)
  })

  it('still yaws when stopped, because that is the tailwheel and not the rudder', () => {
    expect(Math.abs(groundBodyRates(f6f, rolling(0), stick, airRates).y)).toBeGreaterThan(0)
  })

  it('yaws the way the pilot asked', () => {
    const right = groundBodyRates(f6f, rolling(5), { ...stick, yaw: 1 }, airRates).y
    const left = groundBodyRates(f6f, rolling(5), { ...stick, yaw: -1 }, airRates).y
    expect(Math.sign(right)).toBe(-Math.sign(left))
  })
})
```

- [x] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/sim/ground.test.ts`
Expected: FAIL — `groundBodyRates is not a function`.

- [x] **Step 3: Implement**

Return a `Vec3` in the same `{ x: roll, y: yaw, z: pitch }` convention `ratesFromDynamicPressure` uses:
- **x (roll): always 0.**
- **z (pitch):** `airRates.z` once ground speed is at or above `spec.gear.tailUpSpeedMps`, otherwise 0. Use the horizontal speed, not `airspeed`, and write it as a positive comparison so a non-finite speed gives 0.
- **y (yaw):** a tailwheel rate proportional to `controls.yaw`, up to `spec.gear.tailwheelYawRateDegPerSec`, available at any speed including zero. **Sign convention matters and is easy to invert** — `ratesFromDynamicPressure` negates the yaw command because a positive rotation about body +Y turns the nose left while `Controls.yaw > 0` means nose right. Match that, and let the sign test above catch you if you don't.

Add `tailUpSpeedMps` and `tailwheelYawRateDegPerSec` to the schema's `gear` block and the content file, labeled sourced or estimated.

- [x] **Step 4: Apply in `step`**

Where `step` currently assigns `bodyRates = ratesFromDynamicPressure(...)`, route it through `groundBodyRates` when `ctx.terrain` is non-null and `onGround` holds for the state at the START of the step. Use the start-of-step state, not the integrated one: the rates command this step's rotation, and rotating as though already airborne on the step you leave the ground is a half-step error that shows up as a twitch at rotation.

- [x] **Step 5: Run the full suite**

Run: `npm run verify`
Expected: exit 0, **756 passed, 1 skipped**. The golden trajectory must not move — it has `terrain: null`.

- [x] **Step 6: Commit**

```bash
git add src/sim/ src/sim/flight/ tests/sim/ content/aircraft/f6f-hellcat.json
git commit -m "On the wheels you cannot roll, and the tail comes up when it is ready"
```

---

### Task 8: The controls a pilot needs

**Files:**
- Modify: `src/input/bindings.ts`, `src/render/legend.ts`, `src/render/frame.ts`
- Test: `tests/render/frame.test.ts`

**Interfaces:**
- Produces: `FrameState.gearDown: boolean` and `FrameState.gearPressed: boolean`, threaded into `Controls.gearDown` and `Controls.brake`.

`G` and `B` are both free — verified during planning against `BINDINGS`, which currently binds A, C, D, E, H, I, L, Q, R, S, T, W and Z. `legend.test.ts` fails the build if a binding ships without a legend row, so both need rows.

- [x] **Step 1: Write the failing tests**

```typescript
// tests/render/frame.test.ts — append
describe('gear and brakes', () => {
  it('starts with the gear down, because the airplane starts on a runway', () => {
    expect(start().gearDown).toBe(true)
  })

  it('toggles the gear on the key edge, not every frame it is held', () => {
    let f = start()
    for (let i = 0; i < 60; i++) f = nextFrameState(f, 1 / 60, keys('KeyG'))
    expect(f.gearDown).toBe(false)
    for (let i = 0; i < 60; i++) f = nextFrameState(f, 1 / 60, keys('KeyG'))
    expect(f.gearDown).toBe(false)
    f = nextFrameState(f, 1 / 60, keys())
    f = nextFrameState(f, 1 / 60, keys('KeyG'))
    expect(f.gearDown).toBe(true)
  })

  it('puts the gear command where the simulation reads it', () => {
    // The Plan 3 defect: a control that never reaches `world.controls` is
    // inert in the browser while every unit test of it still passes.
    const f = nextFrameState(start(), 1 / 60, keys('KeyG'))
    expect(f.world.controls.gearDown).toBe(f.gearDown)
  })

  it('brakes while the key is held and releases when it is not', () => {
    const held = nextFrameState(start(), 1 / 60, keys('KeyB'))
    expect(held.controls.brake).toBeGreaterThan(0)
    expect(nextFrameState(held, 1 / 60, keys()).controls.brake).toBe(0)
  })
})
```

- [x] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/render/frame.test.ts`
Expected: FAIL — `gearDown` does not exist on `FrameState`.

- [x] **Step 3: Implement**

Add `toggleGear: ['KeyG']` and `brakes: ['KeyB']` to `BINDINGS`, each with a comment in that file's voice saying why the letter was chosen; add a legend row for each. In `frame.ts`, add `gearDown` (defaulting **true** — the airplane starts on a runway) and `gearPressed` to `FrameState`, toggle on the rising edge exactly as `cyclePressed` and the assist toggles already do, and thread both `gearDown` and `brake` into the `Controls` object that goes into the world.

Brakes are on/off from a keyboard: 1 while held, 0 otherwise. Note in a comment that the schema's `brake` is 0–1 so a future axis input needs no type change.

- [x] **Step 4: Run the full suite**

Run: `npm run verify`
Expected: exit 0, **760 passed, 1 skipped**.

- [x] **Step 5: Commit**

```bash
git add src/input/bindings.ts src/render/legend.ts src/render/frame.ts tests/render/frame.test.ts
git commit -m "G for gear, B for brakes"
```

---

### Task 9: The take-off card stops faking the ground

The acceptance test for this whole plan.

**Files:**
- Modify: `tools/testcards/measure.ts`, and the F6F card's tolerance in `tests/sim/testcards/f6f.test.ts`
- Test: the existing card

**Interfaces:**
- Consumes: everything above.

`measureTakeoffRun` currently pins `position.y` and `velocity.y` to zero after every step because the model has no ground. Delete that pin and give the card a flat synthetic terrain field instead.

**Binding decision from the planning measurements:** the card runs on **synthetic flat ground at sea level**, NOT on Tacloban. It grades the flight model against a Patuxent River figure measured on a flat airfield; running it over real Leyte would make a historical grading number depend on which terrain level the test loaded, and L0 and L4 are measurably different runways (2.12% vs 0.30% worst local grade). Build the field the way `tests/sim/terrainContact.test.ts` builds its `plateau`.

- [x] **Step 1: Delete the fake and give the card real ground**

Remove the `position: v3(next.position.x, 0, next.position.z)` / `velocity: v3(next.velocity.x, 0, next.velocity.z)` clamp. Spawn the airplane with `gearFraction: 1` — it is on its wheels — and pass a flat synthetic `TerrainField` at sea level through `SimContext`.

- [x] **Step 2: Run the card and RECORD what it now measures**

Run: `npx vitest run <the f6f test card file>`
Expect it to FAIL against the current tolerance, and that is the point. Record the new roll distance to three decimal places. Do not change anything yet.

- [x] **Step 3: Restate the tolerance with evidence**

The cited figure is 755 ft = 230.124 m, and `content/aircraft/f6f-hellcat.json` already records that the model runs short of it because it has no flaps, no rolling friction and no ground effect. This plan adds rolling friction, which makes the roll **longer**; flaps and ground effect stay absent until 11b.

Update the tolerance to the measured value with a comment that states: the measured distance, the date, that rolling friction now applies and flaps and ground effect still do not, and the direction the remaining gap runs. **Do not widen the tolerance to whatever passes.** If the roll has moved FURTHER from the trial figure than before, say so plainly — that is a real result about a full-flaps trial figure and a no-flaps airplane, and it belongs in the handoff.

- [x] **Step 4: Run the full suite**

Run: `npm run verify`
Expected: exit 0. Report the count; it should be unchanged from Task 8 unless you added a case.

- [x] **Step 5: Commit**

```bash
git add tools/testcards/measure.ts tests/
git commit -m "The take-off card measures real ground now, not a pinned state"
```

---

### Task 10: The soak covers an airplane on its wheels

**Files:**
- Modify: `tools/soak/run.ts`
- Test: `tests/sim/soak.test.ts`

Today `runTerrainSoak` stops each flight at first contact. With a ground constraint, an airplane can now legitimately arrive and stay. Add an assertion over the existing 200-iteration run — **do not add a second soak run**, for the reason the Plan 10 ledger recorded: the existing test already asserts `failures` is empty and a second run triples cost for no coverage.

- [x] **Step 1: Add the assertion**

For any flight whose airplane ends within the contact tolerance of the ground, assert `position.y >= groundHeightM - GROUND_CONTACT_TOLERANCE_M` — i.e. the constraint never let it sink through — and that specific energy did not rise across the contact step. Push failures into the existing `failures` array with iteration and seed, matching the file's existing message shape.

- [x] **Step 2: Prove the check can fire**

Temporarily invert the constraint so it lifts instead of clamps, run `npx vitest run tests/sim/soak.test.ts`, confirm the soak FAILS with one of your new messages, record the message, then **revert completely** and confirm green. Verify with `git diff` before committing that only the intended change is staged.

- [x] **Step 3: Run the full suite and commit**

Run: `npm run verify`
Expected: exit 0.

```bash
git add tools/soak/run.ts tests/sim/soak.test.ts
git commit -m "Soak the ground constraint over real terrain"
```

---

### Task 11: The runway

**Files:**
- Create: `src/render/scene/runway.ts`
- Modify: `src/render/main.ts`
- Test: `tests/render/runway.test.ts`

Render-only. Nothing in `src/sim/` knows it exists; the physics reads `heightAt` as it does everywhere else.

**Facts to use, not re-derive:** Tacloban is at world `(-29666, 47605)`, from `tests/tools/terrainBuild.test.ts`. The strip runs **north–south** — east–west through the airfield has 3.1 m of spread because the coastline falls to the sea, while north–south has 0.49 m at L4 and 1.74 m at L0.

- [x] **Step 1: Write the failing tests**

Pure geometry only, in the node environment, following how `tests/render/terrainLod.test.ts` and the panel tests assert on geometry without a GPU:

```typescript
// tests/render/runway.test.ts
import { describe, it, expect } from 'vitest'
import { RUNWAY_CENTRE, runwayCorners, RUNWAY_LENGTH_M, RUNWAY_WIDTH_M } from '../../src/render/scene/runway.js'

describe('the runway at Tacloban', () => {
  it('sits on the airfield coordinate this repo already carries', () => {
    // (-29666, 47605) is cross-checked against the Copernicus tiles in
    // tests/tools/terrainBuild.test.ts. Re-deriving it lands ~80 m away.
    expect(RUNWAY_CENTRE.x).toBe(-29666)
    expect(RUNWAY_CENTRE.z).toBe(47605)
  })

  it('runs north-south, where the ground is flat', () => {
    const c = runwayCorners()
    const spanZ = Math.max(...c.map((p) => p.z)) - Math.min(...c.map((p) => p.z))
    const spanX = Math.max(...c.map((p) => p.x)) - Math.min(...c.map((p) => p.x))
    expect(spanZ).toBeCloseTo(RUNWAY_LENGTH_M, 6)
    expect(spanX).toBeCloseTo(RUNWAY_WIDTH_M, 6)
    expect(spanZ).toBeGreaterThan(spanX)
  })

  it('is long enough for the take-off roll it exists to serve', () => {
    // The graded trial figure is 230.124 m and this model runs longer than that
    // with rolling friction and no flaps. A strip that cannot contain the roll
    // the test card measures would be a strip you cannot take off from.
    expect(RUNWAY_LENGTH_M).toBeGreaterThan(3 * 230.124)
  })
})
```

- [x] **Step 2: Run to verify they fail, then implement**

Expected: FAIL — module not found. Then build the strip: a geometry following the terrain height along its length so it does not float or bury, in a surface treatment distinct from the terrain shading. Add it to the scene in `main.ts` in raw world coordinates — **`scene.position` applies the camera-relative shift; do not add `worldOffset` yourself.** That mistake was a Critical finding on Plan 10 and the comment on the impact effect in `main.ts` explains it.

- [x] **Step 3: Run the full suite, build, and commit**

Run: `npm run verify` (exit 0) and `npm run build` (exit 0, only the pre-existing chunk-size warning).

```bash
git add src/render/scene/runway.ts src/render/main.ts tests/render/runway.test.ts
git commit -m "A strip at Tacloban, on the ground that is already there"
```

---

### Task 12: The pilot can see the gear

**Not in the spec** — a gap found during planning. §6 gives the gear a key and says nothing about indication, so as written a pilot can raise the gear and have no way to know. Recorded here rather than added silently.

**Files:**
- Modify: `src/render/flightData.ts`
- Test: `tests/render/debrief.test.ts` or the existing flight-data tests — find where `flightDataItems` is already covered.

Add a gear field to the follow-view numeric strip: UP, DOWN, or a travelling state, derived from `state.gearFraction`. Follow the existing items' shape exactly. A cockpit annunciator is 11b's, with the flaps indicator beside it.

- [x] **Step 1: Write the failing test, covering all three states**
- [x] **Step 2: Run to verify it fails**
- [x] **Step 3: Implement**
- [x] **Step 4: `npm run verify` exits 0; commit**

```bash
git add src/render/flightData.ts tests/
git commit -m "Say whether the gear is down"
```

---

### Task 13: Tier 2 and documentation

**Files:**
- Create: `tests/e2e/takeoff.spec.ts`, `docs/handoff/2026-09-16-plan11a-ground-handling.md`
- Modify: `README.md`, `docs/superpowers/specs/2026-09-12-ww2airsim-design.md`

- [ ] **Step 1: Write the Tier 2 spec**

Spawn on the runway with `?spawnX/Y/Z` at Tacloban's coordinate, hold full throttle, and assert the airplane leaves the ground: altitude climbs above the contact tolerance and stays there. Read state through the granular `__ww2` getters — Plan 10 added `impact()`; add a gear or on-ground getter the same way if needed, **never a whole-frame getter**, and keep it inside the `import.meta.env.DEV` guard so `tests/build/dist.test.ts` keeps passing.

- [ ] **Step 2: Do NOT run Playwright; say so**

Tier 2 needs the Windows reference desktop with a Playwright server in Mark's console session. Verify everything you can — typecheck, lint, `npm run verify`, `npm run build` — and record Tier 2 as outstanding with the exact command. Do not fabricate a run.

- [ ] **Step 3: Update §15 and the README**

Plan 11a's row to Complete with a handoff link; the `— next` marker to 11b. README paragraph on what take-off now does, pointing at §15 rather than restating it.

- [x] **Step 4: Write the handoff**

Follow `docs/handoff/2026-09-16-plan10-contact.md`'s shape. It must record, accurately:
- The take-off card's new measured distance and restated tolerance, and which way the gap to the 755 ft trial figure runs.
- Every gear and ground figure that is an **estimate rather than a sourced value**.
- That the tail-up speed gate was chosen over elevator-authority modeling, and that whether it feels right is a Tier 3 question.
- That the runway is **bumpier in the main checkout than in a fresh clone** — 2.12% worst local grade at L0 against 0.30% at L4 — because the fine tiles are optional and gitignored.
- Tier 2 and Tier 3 both outstanding, with the Tier 2 command.

- [ ] **Step 5: `npm run verify` exits 0; commit**

---

## Self-review against the spec

| Spec section | Task |
| --- | --- |
| §1 the rate-command problem | Task 7 |
| §2 constraint not spring; the energy hazard | Tasks 5, 10 |
| §3 weight on wheels | Task 4 |
| §4 gear, travel, drag, severity | Tasks 2, 3 |
| §5 the runway, taken from the existing coordinate | Task 11 |
| §6 controls | Task 8 |
| §7 verification, the un-faked card | Tasks 9, 10, 13 |
| §8 out of scope | Global Constraints |
| §9 q1 terrain in `SimContext` | Task 1 — added deliberately, optional, one production site |
| §9 q2 whether the golden moves | Tasks 5, 7 — both require confirming it does not, and STOPPING if it does |
| §9 q3 how the tail comes up | Task 7 — ruled: speed gate, feel is Tier 3 |

Two items are not in the spec and are recorded rather than added silently:
- **Task 12**, a gear indicator. §6 gives the gear a key and no indication.
- **The take-off card runs on synthetic flat ground, not Tacloban** (Task 9). The spec's §5 called the real ground "already a table" on the strength of an L4 measurement; at L0 it has a 2.12% local grade, and a historical grading number must not depend on which terrain level a test loaded.
