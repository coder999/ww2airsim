# Renderer and Flight Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An F6F Hellcat you can fly from the keyboard over flat water at 60 Hz, viewed from a chase camera or the cockpit, rendered from the deterministic flight model Plan 1 built and validated but never once flew.

**Architecture:** A fixed-60 Hz accumulator in `src/sim/loop.ts` owns time and is the only thing that decides when a step happens; the renderer interpolates between the two most recent ticks and never writes back. All renderer *logic* — camera transforms, gauge needle angles, input mapping — is pure and lives outside Three.js objects, so it is testable headlessly on nexus; only drawing needs a GPU.

**Tech Stack:** TypeScript 5 (strict), Node 22, Vite 7, Three.js 0.186 `WebGPURenderer`, vitest, Zod, Playwright (Tier 2 only), dependency-cruiser, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-12-renderer-and-flight-controls-design.md`
(which is itself subordinate to `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` — where the two disagree, the master spec wins)

## Global Constraints

Every task's requirements implicitly include all of these. Values are copied verbatim from the spec.

- **`sim/` never imports `render/`, never imports `input/`, never touches a browser global, and never imports a Node core module.** The load-bearing constraint of the whole project (master spec §3), enforced by dependency-cruiser and ESLint, not by good intentions.
- **Fixed 60 Hz simulation timestep.** Render rate is independent. `DT = 1/60`.
- **No `Math.random` anywhere in `sim/`.** Single seeded PRNG only.
- **No wall-clock reads in `sim/`** (`Date.now`, `performance.now`).
- **All content JSON is Zod-validated at load**, `.strict()`, so an undeclared key fails loudly rather than being silently dropped.
- **Golden trajectories assert within tolerance, never exact equality.** Current tolerances: `POSITION_TOL_M = 1e-3`, `SPEED_TOL_MPS = 1e-5`.
- **Energy invariants are computed in the airmass frame.** `stepChecked` takes no wind parameter; wind is not coupled into `step()` in this plan.
- **TypeScript `strict: true`.** No `any` in committed code. `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on.
- **License AGPL-3.0.** Third-party code must be AGPL-compatible (MIT, BSD, Apache-2.0 are). Every bundled asset gets an `ASSETS.md` row before it is committed — this plan builds all geometry in code and therefore adds no rows.
- **Node 22 (`v22.22.1` on nexus). Package manager: npm.**
- **Every number written into a source comment must come from a run of the code, and carries its date.** A comment asserting something false about the system is a defect on par with a bug.
- **`npm run verify` must exit 0 at the end of every task.** Capture its status directly (`npm run verify > log 2>&1; rc=$?`), never through a pipe — a pipeline's exit status is the last command's, not the runner's.

## Starting State

`main` at `8495b9f`. `npm run verify` exits 0: 185 tests in 16 files. Plan 1 is merged; `src/sim/` holds the flight model, `tools/` holds the test-card, golden and soak harnesses.

**Existing signatures this plan consumes or changes** (copied exactly — do not guess these):

```ts
// src/sim/flight/state.ts
export type Controls = {
  readonly pitch: number; readonly roll: number
  readonly yaw: number;   readonly throttle: number
}
export type AircraftState = {
  readonly position: Vec3; readonly velocity: Vec3; readonly attitude: Quat
  readonly bodyRates: Vec3; readonly fuelKg: number
}
export const createState: (init?: Partial<AircraftState>) => AircraftState

// src/sim/flight/model.ts
export const DT = 1 / 60
export const airspeed: (state: AircraftState) => number
export const massKg: (spec: AircraftSpec, state: AircraftState) => number
export function angleOfAttack(state: AircraftState): number
export function isStalled(spec: AircraftSpec, state: AircraftState): boolean
export function step(spec: AircraftSpec, state: AircraftState, controls: Controls, dt: number): AircraftState

// src/sim/invariants.ts
export function stepChecked(spec: AircraftSpec, state: AircraftState, controls: Controls, dt: number): AircraftState
export function assertFinite(state: AircraftState, context: string): void

// src/sim/content.ts
export function parseAircraftSpec(raw: unknown): AircraftSpec   // pure, browser-safe

// src/sim/math/vec3.ts — v3, ZERO, add, sub, scale, dot, cross, length, normalize
// src/sim/math/quat.ts — Quat, qIdentity, qNormalize, qFromAxisAngle, qMul, qRotate, qIntegrateBodyRates
```

## File Structure

| File | Responsibility |
| --- | --- |
| `src/sim/loop.ts` | **New.** `SimContext`, `World`, `AdvanceResult`, `advance()`. Owns the fixed timestep and the spiral cap. |
| `src/sim/interpolate.ts` | **New.** Pure interpolation of two `AircraftState`s by alpha. |
| `src/sim/flight/state.ts` | Modify: `AircraftState.tick`. |
| `src/sim/flight/model.ts` | Modify: `step` takes `SimContext`. |
| `src/sim/invariants.ts` | Modify: `stepChecked` takes `SimContext`; `tick` in the finiteness check. |
| `src/sim/flight/schema.ts` | Modify: `view.eyePointM`. |
| `src/input/bindings.ts` | **New.** The key map, as one table. |
| `src/input/keyboard.ts` | **New.** `controlsFromKeys` — pure, with ramping. |
| `src/input/lookAround.ts` | **New.** `lookOffsetFromKeys` — pure body-frame yaw/pitch offset. |
| `src/render/adapterGuard.ts` | **New.** Pure verdict over `GPUAdapterInfo`. |
| `src/render/camera.ts` | **New.** `cameraTransformFor` — pure, all modes. |
| `src/render/gauges.ts` | **New.** `needleAngleFor` — pure, per gauge. |
| `src/render/scene/water.ts` | **New.** Flat plane with procedural detail. |
| `src/render/scene/sky.ts` | **New.** Gradient dome and horizon. |
| `src/render/scene/hellcat.ts` | **New.** Code-built low-poly airframe and prop. |
| `src/render/scene/markers.ts` | **New.** Boxes at a known spacing, so altitude is judgeable. |
| `src/render/scene/lighting.ts` | **New.** Sun and sky light. Without it every lit material is black. |
| `src/render/scene/panel.ts` | **New.** Cockpit panel and needle meshes. |
| `src/render/overlay.ts` | **New.** Dev overlay: frame time, rates, `droppedSteps`. |
| `src/render/failure.ts` | **New.** Visible failure states. Never a blank canvas. |
| `src/render/renderer.ts` | **New.** WebGPU bring-up and adapter judgement. |
| `src/render/frame.ts` | **New.** `nextFrameState` — the pure per-frame bookkeeping. |
| `src/render/main.ts` | **New.** Bootstrap and frame loop. The only file that wires the others together. |
| `src/render/placeholder.ts` | **Deleted** in Task 11; the render-boundary probe repoints to `failure.ts`. |
| `index.html`, `vite.config.ts` | **New.** App entry and dev server. |
| `tests/e2e/adapter.spec.ts`, `playwright.config.ts` | **New.** Tier 2: adapter guard and validation-error sweep. |

**Milestone:** Tasks 1–13 deliver a flyable aeroplane with chase and cockpit cameras. Tasks 14–15 add the instrument panel and the Tier 2 harness. If the plan has to stop early, stop after Task 13 — it is a coherent, shippable state, and it is the first point at which anyone has flown this flight model.

---

### Task 1: `SimContext` — replace `step`'s `dt` parameter

Plan 1's whole-branch review named `step(spec, state, controls, dt)` the highest-risk structural decision on the branch: every later plan needs something absent from it, and each addition touches every call site. This task makes that one-time change while there are ~40 call sites instead of hundreds.

**This task is behaviour-preserving.** Nothing about the physics changes. The golden trajectory and all 185 existing tests must pass **unchanged** — that is the whole safety property, and it is why this task goes first, while the golden is the only thing depending on it.

**Files:**
- Create: `src/sim/loop.ts` (the `SimContext` type only; `advance` arrives in Task 3)
- Modify: `src/sim/flight/model.ts` (`step`, `assertUsableDt`)
- Modify: `src/sim/invariants.ts` (`stepChecked`)
- Modify: `tools/testcards/measure.ts`, `tools/golden/record.ts`, `tools/soak/run.ts`
- Modify: every test calling `step`/`stepChecked`
- Test: `tests/sim/flight/integrator.test.ts`

**Interfaces:**
- Produces: `SimContext { readonly dt: number; readonly tick: number }` from `src/sim/loop.ts`; `step(spec, state, controls, ctx: SimContext)`; `stepChecked(spec, state, controls, ctx: SimContext)`

- [x] **Step 1: Write the failing test**

Add to `tests/sim/flight/integrator.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { step, DT } from '../../../src/sim/flight/model.js'
import { createState } from '../../../src/sim/flight/state.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import type { SimContext } from '../../../src/sim/loop.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const level = { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 }
const ctx = (dt: number, tick = 0): SimContext => ({ dt, tick })

describe('SimContext', () => {
  it('carries dt to the integrator exactly as the old parameter did', () => {
    const s = createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0) })
    const a = step(f6f, s, level, ctx(DT))
    // Same dt, same inputs -> bit-identical, since step is pure.
    const b = step(f6f, s, level, ctx(DT))
    expect(a).toEqual(b)
    expect(a.position.y).not.toBe(s.position.y)
  })

  it('still rejects an unusable dt, now from inside the context', () => {
    const s = createState({ velocity: v3(130, 0, 0) })
    for (const bad of [NaN, Infinity, -Infinity, 0, -DT]) {
      expect(() => step(f6f, s, level, ctx(bad))).toThrow(/dt/)
    }
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/flight/integrator.test.ts`
Expected: FAIL — `src/sim/loop.js` does not exist, so the import cannot resolve.

- [x] **Step 3: Create the context type**

Create `src/sim/loop.ts`:

```ts
/**
 * The simulation's clock and, in Task 3, its fixed-step accumulator.
 *
 * `SimContext` exists because `step`'s signature is what every later plan has
 * to extend: terrain height queries, deck contact, a threaded RNG, a wind
 * vector. As a parameter list that is a change to every call site; as one
 * object it is a change to one interface (Plan 1 whole-branch review, highest
 * -risk structural finding).
 *
 * It carries `dt` and `tick` and NOTHING ELSE on purpose. The same review
 * flagged `speedOfSoundAt` as an export with no consumer; speculative
 * `wind`/`terrain`/`rng` fields would repeat exactly that. Later plans add a
 * field when they have a consumer for it.
 */
export interface SimContext {
  /** Seconds this step advances. Always `DT` in production; tests vary it. */
  readonly dt: number
  /** Monotonic simulation tick this step produces. Starts at 0. */
  readonly tick: number
}
```

- [x] **Step 4: Change `step` to take the context**

In `src/sim/flight/model.ts`, change the signature and the guard. The body is otherwise untouched — every `dt` inside becomes `ctx.dt`:

```ts
import type { SimContext } from '../loop.js'

export function step(
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
  ctx: SimContext,
): AircraftState {
  assertUsableDt(ctx.dt)
  const dt = ctx.dt
  // ...rest of the existing body unchanged...
}
```

Do **not** rename or re-derive anything else in the body. A behaviour change here is the one failure mode this task cannot absorb.

- [x] **Step 5: Change `stepChecked` to match**

In `src/sim/invariants.ts`:

```ts
import type { SimContext } from './loop.js'

export function stepChecked(
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
  ctx: SimContext,
): AircraftState {
  const before = specificEnergyAirmass(state)
  const next = step(spec, state, controls, ctx)
  // ...rest unchanged...
}
```

- [x] **Step 6: Update every call site**

Mechanical. Find them all first:

```bash
grep -rn 'step(\|stepChecked(' src tests tools --include='*.ts' | grep -v 'function step'
```

At each, replace the trailing `DT` (or other dt argument) with `{ dt: DT, tick }`, where `tick` is the tick the step **produces**: one more than the state going in, so a spawn at tick 0 is at tick 1 after its first step. That is the convention `advance` (Task 3) uses, and it has to be the same everywhere or a replay's tick numbers will not line up with a live session's. In `tools/golden/record.ts` the loop variable `tick` is zero-based and labels the checkpoint taken *after* step `tick` — pass `tick: tick + 1` and leave the checkpoint label alone (the label is in the golden file; `state.tick` is not, so nothing the golden checks changes). In `tools/soak/run.ts` and `tools/testcards/measure.ts`, pass the inner loop counter plus one. In tests with no loop, `tick: 1`, or `0` where the test never reads it back.

- [x] **Step 7: Run the whole suite — it must be green and unchanged**

Run: `npm run verify > /tmp/v.log 2>&1; rc=$?; echo "exit=$rc"; tail -5 /tmp/v.log`
Expected: exit 0, **185 tests in 16 files plus the 2 new ones = 187**. The golden test in particular must pass without regenerating anything.

If the golden fails, **stop**. It means the refactor changed physics, which it must not. Do not regenerate the golden to make it pass — that would destroy the evidence that this task was safe.

- [x] **Step 8: Commit**

```bash
git add src/sim/loop.ts src/sim/flight/model.ts src/sim/invariants.ts tools tests
git commit -m "refactor: step() takes a SimContext instead of a bare dt

Plan 1's whole-branch review named step(spec, state, controls, dt) the branch's
highest-risk structural decision: terrain, deck contact, a threaded RNG and wind
each need something absent from it, and as parameters each addition touches every
call site. As one object they touch one interface.

SimContext carries dt and tick only. The same review flagged an export with no
consumer as a defect, so speculative fields would repeat it; later plans add a
field when they have a use for it.

Behaviour-preserving by construction: the golden trajectory passes unregenerated,
which is the evidence this was a signature change and not a physics change."
```

---

### Task 2: `AircraftState.tick`

**Files:**
- Modify: `src/sim/flight/state.ts`
- Modify: `src/sim/flight/model.ts` (`step` sets it)
- Modify: `src/sim/invariants.ts` (`FIELDS`)
- Test: `tests/sim/flight/integrator.test.ts`, `tests/sim/invariants.test.ts`

**Interfaces:**
- Produces: `AircraftState.tick: number`, set by `step` to `ctx.tick`.

- [x] **Step 1: Write the failing test**

Add to `tests/sim/flight/integrator.test.ts`:

```ts
describe('AircraftState.tick', () => {
  it('defaults to 0 and takes the tick the context supplies', () => {
    const s = createState({ velocity: v3(130, 0, 0) })
    expect(s.tick).toBe(0)
    const next = step(f6f, s, level, { dt: DT, tick: 41 })
    expect(next.tick).toBe(41)
  })

  it('is what lets a renderer tell two snapshots apart', () => {
    // Without a tick, a stale snapshot is indistinguishable from a fresh one
    // whose state happens to match -- the bug this field exists to make visible.
    const s = createState({ velocity: v3(130, 0, 0) })
    const a = step(f6f, s, level, { dt: DT, tick: 1 })
    const b = step(f6f, a, level, { dt: DT, tick: 2 })
    expect(b.tick - a.tick).toBe(1)
  })
})
```

Add to `tests/sim/invariants.test.ts`:

```ts
it('rejects a non-finite tick', () => {
  const s = { ...createState({ velocity: v3(130, 0, 0) }), tick: NaN }
  expect(() => assertFinite(s, 'test')).toThrow(/tick/)
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/sim/flight/integrator.test.ts tests/sim/invariants.test.ts`
Expected: FAIL — `Property 'tick' does not exist on type 'AircraftState'`.

- [x] **Step 3: Add the field**

In `src/sim/flight/state.ts`, add to the type and the factory:

```ts
export type AircraftState = {
  // ...existing fields...
  /** The simulation tick this state is the result of. Starts at 0.
   *  Master spec §3 has the renderer interpolating between the two most recent
   *  ticks, which needs each snapshot to say which tick it is. It also makes a
   *  stale-snapshot bug loud instead of silent: without it, yesterday's state
   *  and today's are indistinguishable whenever their values happen to agree. */
  readonly tick: number
}

export const createState = (init: Partial<AircraftState> = {}): AircraftState => ({
  // ...existing...
  tick: init.tick ?? 0,
})
```

- [x] **Step 4: Have `step` set it**

In `src/sim/flight/model.ts`, in the object `step` returns, add `tick: ctx.tick`.

- [x] **Step 5: Add it to the finiteness check**

In `src/sim/invariants.ts`, add `['tick', (s) => s.tick]` to the `FIELDS` array, following the existing entries' exact shape.

- [x] **Step 6: Run the suite**

Run: `npm run verify > /tmp/v.log 2>&1; rc=$?; echo "exit=$rc"; tail -5 /tmp/v.log`
Expected: exit 0. The golden still passes — `tick` is not one of the values the golden records.

- [x] **Step 7: Commit**

```bash
git add src/sim tests
git commit -m "feat: AircraftState carries the tick it belongs to

Master spec 3 has the renderer interpolating between the two most recent ticks,
and nothing recorded which tick a state was. It also turns a stale-snapshot bug
from silent into loud: without it, two snapshots whose values happen to agree
are indistinguishable."
```

---

### Task 3: The fixed-step accumulator

The seam. Everything downstream depends on this being right, and it is fully testable in Node.

**Files:**
- Modify: `src/sim/loop.ts`
- Test: `tests/sim/loop.test.ts`

**Interfaces:**
- Consumes: `SimContext` (Task 1), `AircraftState.tick` (Task 2), `step`/`stepChecked`.
- Produces: `World` (carries `spec`), `AdvanceResult`, `Stepper`, `advance(world, controls, elapsedSeconds, stepper?)`, `createWorld(spec, aircraft)`, `MAX_STEPS_PER_FRAME`.

- [x] **Step 1: Write the failing test**

Create `tests/sim/loop.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { advance, createWorld, MAX_STEPS_PER_FRAME } from '../../src/sim/loop.js'
import { createState } from '../../src/sim/flight/state.js'
import { DT, step } from '../../src/sim/flight/model.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const level = { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 }
const start = () => createWorld(f6f, createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0) }))

describe('advance', () => {
  it('runs no steps when less than one step of time has elapsed', () => {
    const r = advance(start(), level, DT / 2)
    expect(r.stepsRun).toBe(0)
    expect(r.droppedSteps).toBe(0)
    expect(r.alpha).toBeCloseTo(0.5, 10)
    expect(r.world.aircraft.tick).toBe(0)
  })

  it('runs exactly one step for exactly one step of time', () => {
    const r = advance(start(), level, DT)
    expect(r.stepsRun).toBe(1)
    expect(r.world.aircraft.tick).toBe(1)
    expect(r.alpha).toBeCloseTo(0, 9)
  })

  it('keeps the remainder rather than losing or double-counting it', () => {
    // 2.5 steps of time -> 2 steps run, half a step banked.
    const r = advance(start(), level, DT * 2.5)
    expect(r.stepsRun).toBe(2)
    expect(r.alpha).toBeCloseTo(0.5, 9)
    // Feeding the remaining half a step now completes the third.
    const r2 = advance(r.world, level, DT * 0.5)
    expect(r2.stepsRun).toBe(1)
    expect(r2.world.aircraft.tick).toBe(3)
  })

  it('advances ticks monotonically by one per step', () => {
    let w = start()
    const ticks: number[] = []
    for (let i = 0; i < 10; i++) {
      const r = advance(w, level, DT)
      w = r.world
      ticks.push(w.aircraft.tick)
    }
    expect(ticks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('exposes the previous tick for interpolation, and holds it on a no-step call', () => {
    const r = advance(start(), level, DT * 2)
    expect(r.world.previous.tick).toBe(1)
    expect(r.world.aircraft.tick).toBe(2)
    const held = advance(r.world, level, DT / 4)
    expect(held.world.previous.tick).toBe(1)
    expect(held.world.aircraft.tick).toBe(2)
  })

  it('caps the steps one call may run, and counts what it discarded', () => {
    // 20 steps of time owed; the cap is 5.
    const r = advance(start(), level, DT * 20)
    expect(r.stepsRun).toBe(MAX_STEPS_PER_FRAME)
    expect(r.droppedSteps).toBe(20 - MAX_STEPS_PER_FRAME)
    expect(r.world.aircraft.tick).toBe(MAX_STEPS_PER_FRAME)
  })

  it('does not spiral: a persistently overlong frame never accumulates debt', () => {
    // This is the property the cap exists for. Without it, the accumulator
    // grows without bound and every later call runs the cap again forever.
    let w = start()
    for (let i = 0; i < 5; i++) w = advance(w, level, DT * 50).world
    const r = advance(w, level, DT)
    expect(r.stepsRun).toBe(1)
    expect(r.droppedSteps).toBe(0)
  })

  it('ignores a non-finite or negative elapsed time instead of poisoning the clock', () => {
    // requestAnimationFrame deltas go strange across a tab suspend.
    for (const bad of [NaN, Infinity, -1]) {
      const r = advance(start(), level, bad)
      expect(r.stepsRun).toBe(0)
      expect(r.droppedSteps).toBe(0)
      expect(Number.isFinite(r.alpha)).toBe(true)
    }
  })

  it('runs the stepper it is given, once per step', () => {
    // Development builds pass stepChecked so Plan 1's invariants run in the
    // browser; production passes step. The caller chooses, so sim/ carries
    // no build flag.
    const spy = vi.fn(step)
    const r = advance(start(), level, DT * 3, spy)
    expect(r.stepsRun).toBe(3)
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('is pure: the world passed in is not mutated', () => {
    const w = start()
    const before = JSON.stringify(w)
    advance(w, level, DT * 3)
    expect(JSON.stringify(w)).toBe(before)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/loop.test.ts`
Expected: FAIL — `advance`, `createWorld`, `MAX_STEPS_PER_FRAME` are not exported.

- [x] **Step 3: Implement**

Append to `src/sim/loop.ts`:

```ts
import type { AircraftSpec } from './flight/schema.js'
import type { AircraftState, Controls } from './flight/state.js'
import { DT, step } from './flight/model.js'

/**
 * The most steps one `advance` call may run.
 *
 * Without a cap, a frame that runs long owes more steps next frame, which makes
 * that frame longer still: the accumulator grows without bound and the game
 * locks up. Five steps is 83 ms of simulated time, comfortably more than any
 * healthy frame and far short of a freeze.
 */
export const MAX_STEPS_PER_FRAME = 5

/**
 * Tolerance, in steps, when counting whole steps owed. Half a step banked
 * plus half a step fed sums to 0.9999999999999998 steps in IEEE doubles
 * (measured 2026-09-12, Node 22), and a bare floor would owe zero and carry
 * a whole step of debt into the next frame. A millionth of a step is far
 * below anything a frame delta resolves and far above the rounding error.
 */
const STEP_EPSILON = 1e-6

/** The function that integrates one tick: `step` in production, `stepChecked`
 *  in development builds. Chosen by the caller, so `sim/` carries no build flag. */
export type Stepper = typeof step

export interface World {
  /** The aeroplane's coefficient set. Here, not in `advance`'s parameter
   *  list: the design has later plans add fields to World precisely so
   *  that `advance`'s signature never grows. */
  readonly spec: AircraftSpec
  readonly aircraft: AircraftState
  /** The tick before `aircraft`. Equal to it until the first step runs. */
  readonly previous: AircraftState
  /** Unspent time, always in [0, DT). */
  readonly accumulatorSeconds: number
}

export interface AdvanceResult {
  readonly world: World
  /** Whole steps actually run, 0..MAX_STEPS_PER_FRAME. */
  readonly stepsRun: number
  /**
   * Steps owed but discarded to break a spiral. Non-zero means simulated time
   * was skipped, so this session is NOT reproducible from (seed, input log) --
   * master spec §3's replay guarantee. A replay asserts this stayed zero.
   */
  readonly droppedSteps: number
  /** Remainder as a fraction of a step: the renderer's interpolation factor. */
  readonly alpha: number
}

export const createWorld = (spec: AircraftSpec, aircraft: AircraftState): World => ({
  spec,
  aircraft,
  previous: aircraft,
  accumulatorSeconds: 0,
})

export function advance(
  world: World,
  controls: Controls,
  elapsedSeconds: number,
  stepper: Stepper = step,
): AdvanceResult {
  // A tab suspend, a debugger pause or a clock adjustment can hand us a delta
  // that is negative, enormous or not a number. Banking it would poison the
  // accumulator permanently, so it is dropped rather than clamped.
  const elapsed = Number.isFinite(elapsedSeconds) && elapsedSeconds > 0 ? elapsedSeconds : 0

  let banked = world.accumulatorSeconds + elapsed
  const owed = Math.floor(banked / DT + STEP_EPSILON)
  const stepsRun = Math.min(owed, MAX_STEPS_PER_FRAME)
  const droppedSteps = owed - stepsRun

  let current = world.aircraft
  let previous = world.previous
  for (let i = 0; i < stepsRun; i++) {
    previous = current
    current = stepper(world.spec, current, controls, { dt: DT, tick: current.tick + 1 })
  }

  // Discarded steps have their time discarded with them; otherwise the debt
  // survives into the next call and the cap achieves nothing.
  banked -= owed * DT
  if (banked < 0) banked = 0 // the epsilon can leave a rounding-sized negative

  return {
    world: { spec: world.spec, aircraft: current, previous, accumulatorSeconds: banked },
    stepsRun,
    droppedSteps,
    alpha: banked / DT,
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/loop.test.ts`
Expected: PASS, 10 tests.

- [x] **Step 5: Run the full pipeline and commit**

Run: `npm run verify > /tmp/v.log 2>&1; rc=$?; echo "exit=$rc"; tail -5 /tmp/v.log`
Expected: exit 0.

```bash
git add src/sim/loop.ts tests/sim/loop.test.ts
git commit -m "feat: fixed-60Hz accumulator with a counted spiral cap

advance() is the only thing in the codebase that decides when a step happens.
It banks real elapsed time, runs whole 60 Hz steps, and keeps the remainder as
the renderer's interpolation factor.

The five-step cap stops the spiral where a long frame owes more steps, which
makes the next frame longer. Capping means simulated time is skipped, which
quietly breaks master spec 3's promise that a replay is (seed, input log) -- so
the skipped steps are COUNTED rather than swallowed, and a replay can assert
droppedSteps stayed zero. The guarantee becomes checkable instead of false."
```

---

### Task 4: Interpolation

The renderer draws between ticks. Getting quaternion interpolation wrong produces a rare, ugly, hard-to-reproduce flip, so it gets its own tests.

**Files:**
- Create: `src/sim/interpolate.ts`
- Test: `tests/sim/interpolate.test.ts`

**Interfaces:**
- Produces: `interpolateAircraft(prev: AircraftState, curr: AircraftState, alpha: number): RenderState` where `RenderState = { position: Vec3; attitude: Quat }`; `qSlerp(a: Quat, b: Quat, t: number): Quat`.

- [x] **Step 1: Write the failing test**

Create `tests/sim/interpolate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { interpolateAircraft, qSlerp } from '../../src/sim/interpolate.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle, qIdentity, qRotate, type Quat } from '../../src/sim/math/quat.js'

const near = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps)

describe('qSlerp', () => {
  it('returns the endpoints exactly at t=0 and t=1', () => {
    const a = qIdentity()
    const b = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2)
    expect(qSlerp(a, b, 0)).toEqual(a)
    expect(qSlerp(a, b, 1)).toEqual(b)
  })

  it('takes the short way round when the inputs are in opposite hemispheres', () => {
    // Double cover: q and -q are the same rotation. Naive slerp between them
    // takes the 360-degree path, which shows up as a full spin at 60 Hz.
    const a = qFromAxisAngle(v3(0, 1, 0), 0.2)
    const negated: Quat = { x: -a.x, y: -a.y, z: -a.z, w: -a.w }
    const mid = qSlerp(a, negated, 0.5)
    // Halfway between a rotation and itself must be that rotation, not a
    // half-turn away from it.
    const p = qRotate(mid, v3(1, 0, 0))
    const q = qRotate(a, v3(1, 0, 0))
    near(p.x, q.x); near(p.y, q.y); near(p.z, q.z)
  })

  it('stays unit length across the sweep', () => {
    const a = qFromAxisAngle(v3(0.3, 0.9, 0.2), 0.7)
    const b = qFromAxisAngle(v3(-0.5, 0.4, 0.7), 2.4)
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const q = qSlerp(a, b, t)
      near(Math.hypot(q.x, q.y, q.z, q.w), 1, 1e-12)
    }
  })

  it('handles near-identical inputs without dividing by a vanishing sine', () => {
    const a = qFromAxisAngle(v3(0, 1, 0), 0.5)
    const b = qFromAxisAngle(v3(0, 1, 0), 0.5 + 1e-12)
    const q = qSlerp(a, b, 0.5)
    expect(Number.isFinite(q.x + q.y + q.z + q.w)).toBe(true)
    near(Math.hypot(q.x, q.y, q.z, q.w), 1, 1e-12)
  })
})

describe('interpolateAircraft', () => {
  it('lerps position and returns the endpoints at the bounds', () => {
    const prev = createState({ position: v3(0, 1000, 0), tick: 1 })
    const curr = createState({ position: v3(10, 1020, -4), tick: 2 })
    expect(interpolateAircraft(prev, curr, 0).position).toEqual(prev.position)
    expect(interpolateAircraft(prev, curr, 1).position).toEqual(curr.position)
    const mid = interpolateAircraft(prev, curr, 0.5).position
    near(mid.x, 5); near(mid.y, 1010); near(mid.z, -2)
  })

  it('clamps alpha rather than extrapolating past the newest tick', () => {
    // A frame that overruns must not invent a future the sim has not simulated.
    const prev = createState({ position: v3(0, 0, 0), tick: 1 })
    const curr = createState({ position: v3(10, 0, 0), tick: 2 })
    expect(interpolateAircraft(prev, curr, 1.7).position).toEqual(curr.position)
    expect(interpolateAircraft(prev, curr, -0.4).position).toEqual(prev.position)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/interpolate.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

Create `src/sim/interpolate.ts`:

```ts
import { type Vec3, v3 } from './math/vec3.js'
import { type Quat } from './math/quat.js'
import type { AircraftState } from './flight/state.js'

/** What the renderer needs to place an aeroplane. Not a simulation state: it
 *  belongs to no tick, because it is between two of them. */
export type RenderState = {
  readonly position: Vec3
  readonly attitude: Quat
}

/**
 * Shortest-arc spherical interpolation.
 *
 * Two corners that a naive implementation gets wrong, both of which produce
 * rare and ugly artefacts rather than obvious failures:
 *
 *  - Double cover: `q` and `-q` are the same rotation, so if the two inputs sit
 *    in opposite hemispheres the direct path is the LONG way round -- a visible
 *    full spin between two adjacent ticks. Negating one input fixes it.
 *  - Vanishing sine: as the inputs converge, `sin(theta)` goes to zero and the
 *    division blows up. Below the threshold, linear interpolation is both
 *    numerically safe and indistinguishable at this scale.
 */
export function qSlerp(a: Quat, b: Quat, t: number): Quat {
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w
  let bx = b.x, by = b.y, bz = b.z, bw = b.w

  if (dot < 0) {
    dot = -dot
    bx = -bx; by = -by; bz = -bz; bw = -bw
  }

  if (dot > 0.9995) {
    const x = a.x + (bx - a.x) * t
    const y = a.y + (by - a.y) * t
    const z = a.z + (bz - a.z) * t
    const w = a.w + (bw - a.w) * t
    const inv = 1 / Math.hypot(x, y, z, w)
    return { x: x * inv, y: y * inv, z: z * inv, w: w * inv }
  }

  const theta = Math.acos(dot)
  const sin = Math.sin(theta)
  const sa = Math.sin((1 - t) * theta) / sin
  const sb = Math.sin(t * theta) / sin
  return {
    x: a.x * sa + bx * sb,
    y: a.y * sa + by * sb,
    z: a.z * sa + bz * sb,
    w: a.w * sa + bw * sb,
  }
}

/**
 * Places the aeroplane between two simulated ticks.
 *
 * Alpha is clamped, not extrapolated: a frame that overran must not invent a
 * future the simulation has not computed. Standing still for one frame is a
 * far smaller error than guessing.
 */
export function interpolateAircraft(
  prev: AircraftState,
  curr: AircraftState,
  alpha: number,
): RenderState {
  const t = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha
  if (t === 0) return { position: prev.position, attitude: prev.attitude }
  if (t === 1) return { position: curr.position, attitude: curr.attitude }
  return {
    position: v3(
      prev.position.x + (curr.position.x - prev.position.x) * t,
      prev.position.y + (curr.position.y - prev.position.y) * t,
      prev.position.z + (curr.position.z - prev.position.z) * t,
    ),
    attitude: qSlerp(prev.attitude, curr.attitude, t),
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/interpolate.test.ts`
Expected: PASS, 6 tests.

- [x] **Step 5: Commit**

```bash
git add src/sim/interpolate.ts tests/sim/interpolate.test.ts
git commit -m "feat: tick interpolation with double-cover and small-angle handling

Two corners a naive slerp gets wrong, both of which produce rare ugly artefacts
rather than clean failures: q and -q are the same rotation, so inputs in
opposite hemispheres interpolate the long way round and show as a full spin
between adjacent ticks; and sin(theta) vanishing as the inputs converge divides
by nearly zero.

Alpha is clamped rather than extrapolated -- a frame that overran must not
invent a future the simulation has not computed."
```

---

### Task 5: Browser toolchain

`tsconfig.json` sets no explicit `lib`, and TypeScript's default for an ES2022 target already includes DOM — so `localStorage`, `fetch` and `requestAnimationFrame` inside `sim/` typecheck clean **today** (verified 2026-09-12: a probe file using all three, `tsc --noEmit` exit 0). The type checker has never guarded this boundary. Only the ESLint denylist does, and it names four globals; Plan 1's whole-branch review raised exactly this as finding **M5**. This task adds the WebGPU and Vite client types the renderer needs, makes `lib` explicit so the DOM dependency is visible rather than implied, and widens the denylist in the same commit.

The `sim/`-must-not-import-`input/` dependency-cruiser rule lives in Task 6, not here: its negative probe has to import a file that exists, and `src/input/` is empty until then. dependency-cruiser reports **no violation** for an unresolvable import (verified 2026-09-12 with the proposed rule against a probe importing a not-yet-created `src/input/keyboard.js`), so a probe written here would pass for the wrong reason.

**Files:**
- Modify: `tsconfig.json`, `eslint.config.js`, `package.json`
- Create: `index.html`, `vite.config.ts`, `src/render/main.ts`
- Test: `tests/architecture/boundary.test.ts`

**Interfaces:**
- Produces: `npm run dev`, `npm run build`; DOM, WebGPU and Vite client (`import.meta.env`) types available to `src/render/**` and `src/input/**`.

- [x] **Step 1: Write the failing test**

Add to the `sim/ forbids browser globals and nondeterminism` describe block in `tests/architecture/boundary.test.ts`, following the `lintText` pattern already there:

```ts
  it('reports an error for the storage, network and scheduling globals', async () => {
    // tsc has always accepted these in sim/ (its default lib includes DOM),
    // so this denylist is the only guard. A rule never seen to fail is
    // indistinguishable from one that matches nothing.
    const names = ['localStorage', 'sessionStorage', 'fetch', 'self', 'requestAnimationFrame', 'crypto', 'XMLHttpRequest']
    const eslint = new ESLint({})
    const results = await eslint.lintText(
      `export const bad = [${names.join(', ')}]\n`,
      { filePath: 'src/sim/__lint_probe__.ts' },
    )
    const flagged = results.flatMap((r) => r.messages).map((m) => m.message)
    for (const g of names) expect(flagged.some((m) => m.includes(g)), g).toBe(true)
  })
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/architecture/boundary.test.ts`
Expected: FAIL — none of the seven names is in the denylist yet, so no message names them.

- [x] **Step 3: Add DOM and WebGPU types**

```bash
npm install --save-dev @webgpu/types
```

In `tsconfig.json`, add `lib` and extend `types`:

```json
"lib": ["ES2022", "DOM", "DOM.Iterable"],
"types": ["node", "@webgpu/types", "vite/client"],
```

`vite/client` is what makes `import.meta.env.DEV` typecheck; Tasks 13 and 15 use it. Leave `include` as it is and add `"index.html"` to nothing — Vite reads the HTML directly.

- [x] **Step 4: Widen the ESLint denylist (finding M5)**

In `eslint.config.js`, inside the existing `files: ['src/sim/**/*.ts', 'tools/**/*.ts']` block, add to `no-restricted-globals`:

```js
{ name: 'localStorage', message: 'sim/ must not touch browser globals (spec §3).' },
{ name: 'sessionStorage', message: 'sim/ must not touch browser globals (spec §3).' },
{ name: 'fetch', message: 'sim/ must not touch browser globals (spec §3).' },
{ name: 'self', message: 'sim/ must not touch browser globals (spec §3).' },
{ name: 'requestAnimationFrame', message: 'sim/ must not touch browser globals (spec §3).' },
{ name: 'crypto', message: 'Use the seeded PRNG from src/sim/rng.ts (spec §3).' },
{ name: 'XMLHttpRequest', message: 'sim/ must not touch browser globals (spec §3).' },
```

Add a comment above the block recording why it grew:

```js
// This denylist is the ONLY guard between sim/ and a browser global. tsc has
// never been one: with no explicit `lib`, TypeScript's ES2022 default already
// includes DOM, and a sim/ file using localStorage typechecked clean before
// Plan 2 (verified 2026-09-12). Widened in Plan 2 from four names to the
// storage, network and scheduling globals (Plan 1 review, finding M5).
```

- [x] **Step 5: Add the app entry and dev server**

Create `index.html` at the repo root:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>ww2airsim</title>
    <link rel="icon" href="data:," />
    <style>
      html, body { margin: 0; height: 100%; background: #0b0d10; overflow: hidden; }
      canvas { display: block; width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/render/main.ts"></script>
  </body>
</html>
```

Create `vite.config.ts` at the repo root:

```ts
import { defineConfig } from 'vite'

/**
 * Loopback-only on purpose. `navigator.gpu` is exposed only in a secure
 * context, and a plain-HTTP LAN address is not one (master spec §2) -- so
 * serving on 0.0.0.0 and browsing by IP would make WebGPU unavailable before
 * anything else could be debugged. The dev loop is an SSH tunnel from the
 * Windows desktop:
 *
 *     ssh -L 5173:localhost:5173 nexus
 *     # then open http://localhost:5173 on Windows
 *
 * Verified working on the reference platform 2026-09-12 (day-0 spike).
 */
export default defineConfig({
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { target: 'esnext' },
})
```

Create `src/render/main.ts` as a placeholder the next tasks fill in:

```ts
/** Browser entry point. Wired up in Task 13. */
export {}
```

Add to `package.json` scripts:

```json
"dev": "vite",
"build": "vite build",
```

- [x] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/architecture/boundary.test.ts`
Expected: PASS. All seven names are now reported.

- [x] **Step 7: Run the full pipeline**

Run: `npm run verify > /tmp/v.log 2>&1; rc=$?; echo "exit=$rc"; tail -5 /tmp/v.log`
Expected: exit 0. If adding DOM surfaces new type errors anywhere in `src/sim` or `tools`, that is information — fix the code, do not narrow `lib`.

- [x] **Step 8: Commit**

```bash
git add tsconfig.json eslint.config.js package.json package-lock.json index.html vite.config.ts src/render/main.ts tests/architecture/boundary.test.ts
git commit -m "build: browser toolchain, and widen the sim/ global denylist

tsconfig set no explicit lib, and TypeScript's ES2022 default already includes
DOM, so a sim/ file using localStorage or fetch typechecked clean before this
commit: the type checker was never a guard on that boundary. Only the ESLint
denylist was, and it named four globals (Plan 1 whole-branch review, finding
M5). It widens here, with a negative test, in the commit that adds WebGPU and
Vite client types alongside an explicit lib.

Dev server binds loopback-only: WebGPU needs a secure context and a plain-HTTP
LAN address is not one, so the loop is an SSH tunnel (master spec 2, verified
on the reference platform by the day-0 spike)."
```

---

### Task 6: Keyboard input

**Files:**
- Create: `src/input/bindings.ts`, `src/input/keyboard.ts`
- Modify: `.dependency-cruiser.cjs`
- Test: `tests/input/keyboard.test.ts`, `tests/architecture/boundary.test.ts`

**Interfaces:**
- Produces: `BINDINGS`, `type PressedKeys = ReadonlySet<string>`, `controlsFromKeys(pressed: PressedKeys, dt: number, previous: Controls): Controls`, `RAMP_SECONDS`, `THROTTLE_SECONDS`, `NEUTRAL: Controls`; the `sim-must-not-import-input` dependency-cruiser rule.

- [ ] **Step 1: Write the failing test**

Create `tests/input/keyboard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { controlsFromKeys, NEUTRAL, RAMP_SECONDS, THROTTLE_SECONDS } from '../../src/input/keyboard.js'

const DT = 1 / 60
const keys = (...k: string[]) => new Set(k)
/** Run `seconds` of held input and return where the axes ended up. */
const hold = (held: string[], seconds: number, from = NEUTRAL) => {
  let c = from
  for (let t = 0; t < seconds; t += DT) c = controlsFromKeys(keys(...held), DT, c)
  return c
}

describe('controlsFromKeys', () => {
  it('ramps rather than snapping to full deflection', () => {
    // The decision that shapes feel: a key is binary, a stick is not. One
    // frame of "pull back" must not command full nose-up.
    const oneFrame = controlsFromKeys(keys('ArrowDown'), DT, NEUTRAL)
    expect(oneFrame.pitch).toBeGreaterThan(0)
    expect(oneFrame.pitch).toBeLessThan(0.1)
  })

  it('reaches full deflection after the ramp time', () => {
    expect(hold(['ArrowDown'], RAMP_SECONDS * 1.2).pitch).toBeCloseTo(1, 3)
  })

  it('never exceeds the axis limits however long a key is held', () => {
    const c = hold(['ArrowDown', 'ArrowRight'], RAMP_SECONDS * 5)
    expect(c.pitch).toBeLessThanOrEqual(1)
    expect(c.roll).toBeLessThanOrEqual(1)
  })

  it('springs back to centre on release', () => {
    const deflected = hold(['ArrowDown'], RAMP_SECONDS)
    let c = deflected
    for (let t = 0; t < RAMP_SECONDS * 1.2; t += DT) c = controlsFromKeys(keys(), DT, c)
    expect(c.pitch).toBeCloseTo(0, 3)
  })

  it('is symmetric: opposite keys ramp at the same rate', () => {
    const up = hold(['ArrowDown'], RAMP_SECONDS / 2).pitch
    const down = hold(['ArrowUp'], RAMP_SECONDS / 2).pitch
    expect(up).toBeCloseTo(-down, 9)
  })

  it('cancels to centre when both keys on an axis are held', () => {
    const c = hold(['ArrowLeft', 'ArrowRight'], RAMP_SECONDS)
    expect(c.roll).toBeCloseTo(0, 6)
  })

  it('holds throttle where it is left rather than springing back', () => {
    // Throttle is a lever, not a stick: releasing the key must not close it.
    const open = hold(['ShiftLeft'], RAMP_SECONDS / 2)
    expect(open.throttle).toBeGreaterThan(0)
    let c = open
    for (let t = 0; t < RAMP_SECONDS; t += DT) c = controlsFromKeys(keys(), DT, c)
    expect(c.throttle).toBeCloseTo(open.throttle, 9)
  })

  it('clamps throttle to [0,1]', () => {
    // Held past the full SWEEP time, not the stick ramp time: the constants
    // differ, and five ramp times is only 88% of the sweep.
    const full = hold(['ShiftLeft'], THROTTLE_SECONDS * 1.5)
    expect(full.throttle).toBe(1)
    expect(hold(['KeyZ'], THROTTLE_SECONDS * 1.5).throttle).toBe(0)
    expect(hold(['KeyZ'], THROTTLE_SECONDS * 1.5, full).throttle).toBe(0)
  })

  it('produces finite output for a nonsense dt', () => {
    // rAF deltas go strange across a tab suspend; input must not poison the
    // control vector, which would put a NaN straight into the integrator.
    for (const bad of [NaN, Infinity, -1]) {
      const c = controlsFromKeys(keys('ArrowDown'), bad, NEUTRAL)
      expect(Number.isFinite(c.pitch + c.roll + c.yaw + c.throttle)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/input/keyboard.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the bindings table**

Create `src/input/bindings.ts`:

```ts
/**
 * Every key the game reads, in one table, so rebinding is a data change.
 * Values are `KeyboardEvent.code` -- physical keys, so the map does not shift
 * under a non-QWERTY layout.
 */
export const BINDINGS = {
  pitchUp: ['ArrowDown', 'KeyS'],
  pitchDown: ['ArrowUp', 'KeyW'],
  rollLeft: ['ArrowLeft', 'KeyA'],
  rollRight: ['ArrowRight', 'KeyD'],
  yawLeft: ['KeyQ'],
  yawRight: ['KeyE'],
  throttleUp: ['ShiftLeft', 'ShiftRight', 'Equal'],
  // Not Ctrl, which the design first named: Ctrl+W closes the tab in Chrome
  // and preventDefault cannot stop it, so "nose down while throttling back"
  // on WASD would quit the game. Ctrl+T and Ctrl+N are the same.
  throttleDown: ['KeyZ', 'Minus'],
  cycleCamera: ['KeyC'],
} as const satisfies Record<string, readonly string[]>

export type BindingName = keyof typeof BINDINGS
```

- [ ] **Step 4: Forbid `sim/` from importing `input/`, and prove the rule bites**

Now that `src/input/bindings.ts` exists there is a real file for the negative probe to import. Add to `.dependency-cruiser.cjs`'s `forbidden`:

```js
{
  name: 'sim-must-not-import-input',
  comment:
    'Spec §3: input/ maps devices to the same Controls value the AI emits, so ' +
    'the simulation must depend on the shape, never on the device layer. ' +
    'Without this rule the dependency would be legal and nobody would notice.',
  severity: 'error',
  from: { path: '^src/sim' },
  to: { path: '^src/input' },
},
```

Add to the `architecture boundary` describe block in `tests/architecture/boundary.test.ts`, alongside the render probe:

```ts
  it('fails when sim/ imports input/', () => {
    // The probe imports a file that EXISTS. dependency-cruiser reports no
    // violation for an unresolvable import (verified 2026-09-12), so a probe
    // against a not-yet-written module passes for the wrong reason.
    writeFileSync(PROBE, "import { BINDINGS } from '../input/bindings.js'\nexport const probe = BINDINGS\n")
    const { code, output } = runDepcruise()
    expect(code).not.toBe(0)
    expect(output).toContain('sim-must-not-import-input')
  })
```

Run: `npx vitest run tests/architecture/boundary.test.ts`
Expected: PASS, including the new probe.

- [ ] **Step 5: Implement the mapping**

Create `src/input/keyboard.ts`:

```ts
import type { Controls } from '../sim/flight/state.js'
import { BINDINGS, type BindingName } from './bindings.js'

export type PressedKeys = ReadonlySet<string>

export const NEUTRAL: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }

/**
 * Seconds from centre to full deflection on a held key.
 *
 * This is the number that decides how the aeroplane feels, and it is a guess
 * until somebody flies it. A key is binary and a stick is not: mapping held
 * straight to +-1 gives bang-bang control that would make a model validated
 * against 1944 trial figures feel like a toy. Expect to tune this.
 */
export const RAMP_SECONDS = 0.35

/** Throttle is a lever: it stays where it is left. Full sweep in this long. */
export const THROTTLE_SECONDS = 2.0

const held = (pressed: PressedKeys, name: BindingName): boolean =>
  BINDINGS[name].some((code) => pressed.has(code))

/** -1, 0 or +1 from a pair of opposed keys. Both held cancels, which is why
 *  this subtracts rather than branching. */
const axis = (pressed: PressedKeys, neg: BindingName, pos: BindingName): number =>
  (held(pressed, pos) ? 1 : 0) - (held(pressed, neg) ? 1 : 0)

const clamp = (n: number, lo: number, hi: number): number =>
  n < lo ? lo : n > hi ? hi : n

/** Moves `current` toward `target` at `perSecond`, never overshooting. */
const approach = (current: number, target: number, perSecond: number, dt: number): number => {
  const maxStep = perSecond * dt
  const delta = target - current
  if (Math.abs(delta) <= maxStep) return target
  return current + Math.sign(delta) * maxStep
}

export function controlsFromKeys(
  pressed: PressedKeys,
  dt: number,
  previous: Controls,
): Controls {
  // A tab suspend can hand us a delta that is negative, enormous or NaN.
  // Letting it through would put a non-finite value into the control vector
  // and from there straight into the integrator.
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0

  const rate = 1 / RAMP_SECONDS
  const throttleRate = 1 / THROTTLE_SECONDS

  return {
    pitch: approach(previous.pitch, axis(pressed, 'pitchDown', 'pitchUp'), rate, step),
    roll: approach(previous.roll, axis(pressed, 'rollLeft', 'rollRight'), rate, step),
    yaw: approach(previous.yaw, axis(pressed, 'yawLeft', 'yawRight'), rate, step),
    // No target of its own: throttle integrates its key and holds.
    throttle: clamp(
      previous.throttle +
        axis(pressed, 'throttleDown', 'throttleUp') * throttleRate * step,
      0,
      1,
    ),
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/input/keyboard.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 7: Run the full pipeline and commit**

Run: `npm run verify > /tmp/v.log 2>&1; rc=$?; echo "exit=$rc"; tail -5 /tmp/v.log`

```bash
git add src/input tests/input .dependency-cruiser.cjs tests/architecture/boundary.test.ts
git commit -m "feat: keyboard input with ramped axes

Emits the same Controls value the AI will, per master spec 3's 'the AI is a
pilot, not a puppet' -- so the simulation depends on the shape and never on the
device layer.

Held keys ramp rather than snapping. A key is binary and a stick is not, and
mapping held straight to +-1 gives bang-bang control that would make a model
validated against 1944 trial figures feel like a toy. RAMP_SECONDS is the
number most worth tuning once the thing flies, so it is named and documented
rather than buried.

Throttle is a lever, not a stick: it integrates and holds where it is left.

Throttle-down is Z rather than the Ctrl the design named: Ctrl+W closes the
tab in Chrome and preventDefault cannot stop it.

Also adds the sim-must-not-import-input dependency-cruiser rule with a
negative probe, matching how the render boundary is proved. It lands here
rather than with the toolchain because the probe needs a real file under
src/input to import: depcruise passes an unresolvable import."
```

---

### Task 7: The adapter guard

Pure, so the logic is Tier 1 testable; the Tier 2 harness in Task 15 asserts it against a real adapter. The values come from the day-0 spike, measured on the reference platform.

**Files:**
- Create: `src/render/adapterGuard.ts`
- Test: `tests/render/adapterGuard.test.ts`

**Interfaces:**
- Produces: `type AdapterVerdict = { ok: boolean; severity: 'ok' | 'warn' | 'fail'; summary: string }`, `judgeAdapter(info: AdapterInfoLike): AdapterVerdict`, `type AdapterInfoLike`.

- [ ] **Step 1: Write the failing test**

Create `tests/render/adapterGuard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { judgeAdapter } from '../../src/render/adapterGuard.js'

/** Exactly what Chrome 152 returned on the reference platform, 2026-09-12. */
const REFERENCE = {
  vendor: 'amd',
  architecture: 'rdna-2',
  device: '',
  description: '',
  isFallbackAdapter: false,
}

describe('judgeAdapter', () => {
  it('accepts the reference platform as measured', () => {
    const v = judgeAdapter(REFERENCE)
    expect(v.ok).toBe(true)
    expect(v.severity).toBe('ok')
  })

  it('accepts the hyphenated architecture Chrome actually reports', () => {
    // The day-0 probe tested /rdna ?2/ and Chrome reports 'rdna-2', so a
    // correctly identified adapter was reported as unconfirmed. Cost one round
    // trip to the reference platform.
    expect(judgeAdapter({ ...REFERENCE, architecture: 'rdna 2' }).ok).toBe(true)
    expect(judgeAdapter({ ...REFERENCE, architecture: 'rdna-2' }).ok).toBe(true)
  })

  it('does not require device or description, which Chrome leaves empty', () => {
    // Master spec §11 says the guard should confirm vendor/device identify the
    // RX 6700 XT. Measured: Chrome returns both as empty strings for
    // fingerprinting reasons, so that guard is not implementable as written.
    expect(judgeAdapter({ ...REFERENCE, device: '', description: '' }).ok).toBe(true)
  })

  it('fails a fallback adapter even when the strings look right', () => {
    const v = judgeAdapter({ ...REFERENCE, isFallbackAdapter: true })
    expect(v.ok).toBe(false)
    expect(v.severity).toBe('fail')
  })

  it('fails a software rasterizer by name', () => {
    for (const s of ['SwiftShader', 'llvmpipe', 'Microsoft Basic Render Driver']) {
      const v = judgeAdapter({ ...REFERENCE, vendor: 'google', architecture: '', description: s })
      expect(v.ok).toBe(false)
      expect(v.severity).toBe('fail')
      expect(v.summary).toMatch(/software/i)
    }
  })

  it('warns rather than failing on an unrecognised real adapter', () => {
    // A laptop should still run the game. Only Tier 2 treats this as fatal.
    const v = judgeAdapter({ ...REFERENCE, vendor: 'intel', architecture: 'gen-12lp' })
    expect(v.ok).toBe(false)
    expect(v.severity).toBe('warn')
  })

  it('says what it saw, so a report is actionable', () => {
    expect(judgeAdapter({ ...REFERENCE, vendor: 'intel', architecture: 'gen-12lp' }).summary)
      .toMatch(/intel/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/render/adapterGuard.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/render/adapterGuard.ts`:

```ts
/**
 * Decides whether a WebGPU adapter is the reference platform, a different real
 * GPU, or a software rasterizer.
 *
 * Why this is not cosmetic: a software rasterizer can present as a non-fallback
 * adapter, and every frame-time number and golden screenshot taken from one is
 * worthless. Failing loudly is the only thing that stops a driver update or a
 * headless-flag change quietly corrupting the baselines (master spec §11).
 *
 * The master spec says this guard should confirm that `adapter.info` vendor and
 * device identify the RX 6700 XT. Measured on the reference platform
 * 2026-09-12: Chrome returns `device: ""` and `description: ""` -- it reports
 * deliberately coarse identifiers. Vendor plus architecture is the real
 * ceiling, and it still discharges the guard's actual purpose.
 */
export type AdapterInfoLike = {
  readonly vendor: string
  readonly architecture: string
  readonly device: string
  readonly description: string
  readonly isFallbackAdapter?: boolean | undefined
}

export type AdapterVerdict = {
  /** True only for the reference platform. */
  readonly ok: boolean
  /** `fail` is a software rasterizer; `warn` is a real but different GPU. */
  readonly severity: 'ok' | 'warn' | 'fail'
  readonly summary: string
}

const SOFTWARE = /swiftshader|llvmpipe|basic render|microsoft basic|software/i

export function judgeAdapter(info: AdapterInfoLike): AdapterVerdict {
  const haystack = `${info.vendor} ${info.architecture} ${info.device} ${info.description}`
  const seen = `vendor="${info.vendor}" architecture="${info.architecture}"`

  if (info.isFallbackAdapter === true || SOFTWARE.test(haystack)) {
    return {
      ok: false,
      severity: 'fail',
      summary:
        `This is a software rasterizer, not a GPU (${seen}). Frame times and ` +
        `screenshots taken here are meaningless.`,
    }
  }

  const isReference =
    /amd/i.test(info.vendor) && /rdna[ -]?2/i.test(info.architecture)

  return isReference
    ? { ok: true, severity: 'ok', summary: `Reference platform: ${seen}` }
    : {
        ok: false,
        severity: 'warn',
        summary:
          `Real GPU, but not the reference platform (${seen}). Performance ` +
          `figures and screenshots from here are not comparable.`,
      }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/render/adapterGuard.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/render/adapterGuard.ts tests/render/adapterGuard.test.ts
git commit -m "feat: adapter guard, sized to what adapter.info actually reports

A software rasterizer can present as a non-fallback adapter, and every frame
time and golden screenshot taken from one is worthless -- so this fails loudly
rather than letting a driver update quietly corrupt the baselines.

Master spec 11 specifies asserting that vendor/device identify the RX 6700 XT.
Measured on the reference platform 2026-09-12: Chrome returns device and
description as EMPTY strings, so that is not implementable as written. Vendor
plus architecture is the ceiling and still discharges the guard's purpose.

Three severities, because the same check wants different teeth in different
places: a real-but-different GPU warns so a laptop still runs the game, while
Tier 2 treats anything but ok as fatal."
```

---

### Task 8: Cameras — chase and first-person

Pure: maps sim state to an eye transform with no Three.js involved, so the behaviour most likely to be subtly wrong is Tier 1 testable.

**Files:**
- Create: `src/render/camera.ts`
- Modify: `src/sim/flight/schema.ts`, `content/aircraft/f6f-hellcat.json`
- Test: `tests/render/camera.test.ts`, `tests/sim/flight/schema.test.ts`

**Interfaces:**
- Consumes: `RenderState` (Task 4), `AircraftSpec`.
- Produces: `type CameraMode = 'chase' | 'cockpit'`, `type EyeTransform = { position: Vec3; attitude: Quat }`, `cameraTransformFor(mode, spec, render): EyeTransform`, `CHASE_OFFSET_M`, `CHASE_PITCH_FOLLOW`.
- Produces: `spec.view.eyePointM: readonly [number, number, number]`.

- [ ] **Step 1: Write the failing schema test**

Add to `tests/sim/flight/schema.test.ts`, extending the existing `valid` fixture with the new block and asserting it is required:

```ts
it('requires a view block with an eye point', () => {
  const { view: _omitted, ...withoutView } = valid
  expect(() => parseAircraftSpec(withoutView)).toThrow(/view/)
})

it('rejects an eye point that is not three finite numbers', () => {
  expect(() => parseAircraftSpec({ ...valid, view: { eyePointM: [0, 1] } })).toThrow(/eyePointM/)
  expect(() => parseAircraftSpec({ ...valid, view: { eyePointM: [0, 1, NaN] } })).toThrow(/eyePointM/)
})
```

Add `view: { eyePointM: [1.2, 0.9, 0] }` to the `valid` fixture in that file.

- [ ] **Step 2: Write the failing camera test**

Create `tests/render/camera.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { cameraTransformFor, CHASE_OFFSET_M } from '../../src/render/camera.js'
import { v3, length, sub } from '../../src/sim/math/vec3.js'
import { qIdentity, qFromAxisAngle, qRotate } from '../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const at = (pos = v3(0, 1000, 0), att = qIdentity()) => ({ position: pos, attitude: att })

describe('cockpit camera', () => {
  it('sits at the eye point, rigidly attached', () => {
    const r = at()
    const eye = cameraTransformFor('cockpit', f6f, r)
    const [ex, ey, ez] = f6f.view.eyePointM
    const expected = qRotate(r.attitude, v3(ex, ey, ez))
    expect(eye.position.x).toBeCloseTo(r.position.x + expected.x, 9)
    expect(eye.position.y).toBeCloseTo(r.position.y + expected.y, 9)
    expect(eye.position.z).toBeCloseTo(r.position.z + expected.z, 9)
  })

  it('tracks roll exactly — the horizon must rotate with you', () => {
    // Damping roll here would be a bug, not a comfort feature: from the
    // cockpit, the horizon turning over IS the information.
    const rolled = qFromAxisAngle(v3(1, 0, 0), Math.PI / 3)
    const eye = cameraTransformFor('cockpit', f6f, at(v3(0, 1000, 0), rolled))
    expect(eye.attitude).toEqual(rolled)
  })
})

describe('chase camera', () => {
  it('sits behind and above at the configured distance', () => {
    const r = at()
    const eye = cameraTransformFor('chase', f6f, r)
    const d = length(sub(eye.position, r.position))
    expect(d).toBeCloseTo(length(v3(...CHASE_OFFSET_M)), 6)
  })

  it('discards roll instead of tracking it', () => {
    // Plan 1's own golden trajectory is four continuous barrel rolls. A camera
    // welded to the roll axis through that is nauseating, and the flight model
    // gets blamed for a camera problem.
    const rolled = qFromAxisAngle(v3(1, 0, 0), Math.PI / 2)
    const eye = cameraTransformFor('chase', f6f, at(v3(0, 1000, 0), rolled))
    // Up stays near world-up rather than rotating 90 degrees with the aircraft.
    const up = qRotate(eye.attitude, v3(0, 1, 0))
    expect(up.y).toBeGreaterThan(0.9)
  })

  it('stays finite and upright through a full continuous roll', () => {
    let eye = cameraTransformFor('chase', f6f, at())
    for (let i = 0; i < 600; i++) {
      const angle = (i / 600) * Math.PI * 8
      const r = at(v3(i, 1000, 0), qFromAxisAngle(v3(1, 0, 0), angle))
      eye = cameraTransformFor('chase', f6f, r)
      const up = qRotate(eye.attitude, v3(0, 1, 0))
      expect(Number.isFinite(eye.position.x + up.y)).toBe(true)
      expect(up.y).toBeGreaterThan(0)
    }
  })

  it('follows heading, so the aeroplane stays in frame through a turn', () => {
    const yawed = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2)
    const eye = cameraTransformFor('chase', f6f, at(v3(0, 1000, 0), yawed))
    const fwd = qRotate(eye.attitude, v3(1, 0, 0))
    const toAircraft = sub(v3(0, 1000, 0), eye.position)
    const dotted = (fwd.x * toAircraft.x + fwd.y * toAircraft.y + fwd.z * toAircraft.z)
    expect(dotted).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/render/camera.test.ts tests/sim/flight/schema.test.ts`
Expected: FAIL — no `view` in the schema, no `camera.js`.

- [ ] **Step 4: Add the schema block and the content**

In `src/sim/flight/schema.ts`, add to the object (before the closing `.strict()`):

```ts
  /** Render-only data. `sim/` never reads this; it lives here because it is
   *  per-aircraft content and a second content file for one field would be
   *  over-engineering. Revisit if a second category of render-only data
   *  appears (Plan 2 design §6). */
  view: z.object({
    /** Pilot's eye, metres in body frame: +X forward, +Y up, +Z right. */
    eyePointM: z.tuple([finite, finite, finite]),
  }).strict(),
```

Use the file's existing `finite` helper if present; otherwise define it alongside the existing `positive` helper as `z.number().finite()`.

In `content/aircraft/f6f-hellcat.json`, add:

```json
"view": { "eyePointM": [1.2, 0.9, 0] }
```

That places the eye roughly 1.2 m forward of the reference point and 0.9 m above it. No primary source is needed for a number whose only job is to put a camera somewhere sensible; it is recorded as an estimate in the design's open items.

- [ ] **Step 5: Implement the cameras**

Create `src/render/camera.ts`:

```ts
import { type Vec3, v3, add } from '../sim/math/vec3.js'
import { type Quat, qFromAxisAngle, qMul, qRotate, qNormalize } from '../sim/math/quat.js'
import type { AircraftSpec } from '../sim/flight/schema.js'
import type { RenderState } from '../sim/interpolate.js'

export type CameraMode = 'chase' | 'cockpit'

export type EyeTransform = {
  readonly position: Vec3
  readonly attitude: Quat
}

/** Behind, above, and slightly off the centreline. Body frame. */
export const CHASE_OFFSET_M: readonly [number, number, number] = [-22, 6, 0]

/**
 * Fraction of the aircraft's pitch the chase camera follows. A little under
 * one, so a steep climb or dive keeps some horizon in frame.
 *
 * There is deliberately no roll constant. Roll is not damped, it is DISCARDED:
 * the chase attitude is rebuilt from heading and pitch only. Not a comfort
 * tweak -- Plan 1's golden trajectory is four continuous barrel rolls, and a
 * camera following roll through that is nauseating, with the flight model
 * getting the blame for a camera problem.
 */
export const CHASE_PITCH_FOLLOW = 0.92

/** Heading (yaw) of an attitude, radians, ignoring pitch and roll. */
function headingOf(q: Quat): number {
  const fwd = qRotate(q, v3(1, 0, 0))
  return Math.atan2(-fwd.z, fwd.x)
}

/** Pitch of an attitude, radians, positive nose-up. */
function pitchOf(q: Quat): number {
  const fwd = qRotate(q, v3(1, 0, 0))
  return Math.asin(Math.max(-1, Math.min(1, fwd.y)))
}

/**
 * Places the eye for a mode. A pure function of the current render state:
 * neither mode smooths over time, so there is no previous-eye or dt parameter
 * carried unused. A later smoothed mode (external orbit, padlock) adds them
 * when it has a consumer for them.
 */
export function cameraTransformFor(
  mode: CameraMode,
  spec: AircraftSpec,
  render: RenderState,
): EyeTransform {
  if (mode === 'cockpit') {
    const [ex, ey, ez] = spec.view.eyePointM
    return {
      position: add(render.position, qRotate(render.attitude, v3(ex, ey, ez))),
      // Rigid. Damping here would remove the information the view exists for.
      attitude: render.attitude,
    }
  }

  // Chase: follow position, heading and pitch; discard roll. Built from
  // heading and pitch rather than by damping the quaternion directly, because
  // blending toward level through an inverted attitude is ambiguous and can
  // flip -- this cannot.
  const heading = headingOf(render.attitude)
  const pitch = pitchOf(render.attitude) * CHASE_PITCH_FOLLOW
  const attitude = qNormalize(
    qMul(qFromAxisAngle(v3(0, 1, 0), heading), qFromAxisAngle(v3(0, 0, 1), pitch)),
  )

  const [ox, oy, oz] = CHASE_OFFSET_M
  const position = add(render.position, qRotate(attitude, v3(ox, oy, oz)))

  return { position, attitude }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/render/camera.test.ts tests/sim/flight/schema.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full pipeline and commit**

Run: `npm run verify > /tmp/v.log 2>&1; rc=$?; echo "exit=$rc"; tail -5 /tmp/v.log`

```bash
git add src/render/camera.ts src/sim/flight/schema.ts content/aircraft/f6f-hellcat.json tests
git commit -m "feat: chase and cockpit cameras, as pure transforms

Pure functions of sim state with no Three.js involved, so the behaviour most
likely to be subtly wrong -- stability through a sustained roll -- is Tier 1
testable on a headless box.

Roll is discarded for chase and rigid for cockpit, and that asymmetry is the
point: Plan 1's golden trajectory is four continuous barrel rolls, which a
rigidly-following chase camera makes nauseating, while damping the cockpit view
would remove the horizon information the view exists to give.

Chase attitude is rebuilt from heading and pitch rather than damped from the
quaternion, because blending toward level through an inverted attitude is
ambiguous and can flip."
```

---

### Task 9: Look-around

An offset layered on whichever mode is active, rather than a mode of its own — so it behaves identically from the cockpit and from chase, and snap views are presets of the same thing.

Keyboard hat only. The design's §6 also lists continuous mouse-look; it is **deferred**, not forgotten. Pointer-lock handling and a sensitivity constant nobody has flown with would be two more guesses stacked on `RAMP_SECONDS`, and the numpad hat answers the Plan 2 question (can you check your six). Recorded in Self-Review as a deviation, and in the design's non-goals.

**Files:**
- Create: `src/input/lookAround.ts`
- Modify: `src/input/bindings.ts`, `src/render/camera.ts`
- Test: `tests/input/lookAround.test.ts`

**Interfaces:**
- Produces: `type LookOffset = { yawRad: number; pitchRad: number }`, `LOOK_CENTRE: LookOffset`, `lookOffsetFromKeys(pressed, dt, previous): LookOffset`, `LOOK_LIMIT_RAD`.
- Changes: `cameraTransformFor(mode, spec, render, look: LookOffset)`.

- [ ] **Step 1: Write the failing test**

Create `tests/input/lookAround.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { lookOffsetFromKeys, LOOK_CENTRE, LOOK_LIMIT_RAD } from '../../src/input/lookAround.js'

const DT = 1 / 60
const keys = (...k: string[]) => new Set(k)
const hold = (held: string[], seconds: number) => {
  let o = LOOK_CENTRE
  for (let t = 0; t < seconds; t += DT) o = lookOffsetFromKeys(keys(...held), DT, o)
  return o
}

describe('lookOffsetFromKeys', () => {
  it('starts centred', () => {
    expect(LOOK_CENTRE).toEqual({ yawRad: 0, pitchRad: 0 })
  })

  it('snaps to a preset immediately, like a hat switch', () => {
    // A hat is not an analogue stick: looking left is instant, not a pan.
    const left = lookOffsetFromKeys(keys('Numpad4'), DT, LOOK_CENTRE)
    expect(left.yawRad).toBeCloseTo(Math.PI / 2, 6)
  })

  it('looks back over either shoulder at 180 degrees', () => {
    expect(Math.abs(lookOffsetFromKeys(keys('Numpad0'), DT, LOOK_CENTRE).yawRad))
      .toBeCloseTo(Math.PI, 6)
  })

  it('springs back to centre on release', () => {
    const looked = hold(['Numpad4'], 0.5)
    expect(looked.yawRad).not.toBe(0)
    expect(lookOffsetFromKeys(keys(), DT, looked)).toEqual(LOOK_CENTRE)
  })

  it('combines diagonals', () => {
    const o = lookOffsetFromKeys(keys('Numpad4', 'Numpad8'), DT, LOOK_CENTRE)
    expect(o.yawRad).toBeGreaterThan(0)
    expect(o.pitchRad).toBeGreaterThan(0)
  })

  it('clamps pitch so the view cannot invert through the vertical', () => {
    const o = hold(['Numpad8'], 2)
    expect(Math.abs(o.pitchRad)).toBeLessThanOrEqual(LOOK_LIMIT_RAD + 1e-9)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/input/lookAround.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Add the bindings**

In `src/input/bindings.ts`, add to `BINDINGS`:

```ts
  lookUp: ['Numpad8'],
  lookDown: ['Numpad2'],
  lookLeft: ['Numpad4'],
  lookRight: ['Numpad6'],
  lookCentre: ['Numpad5'],
  lookBack: ['Numpad0'],
```

- [ ] **Step 4: Implement**

Create `src/input/lookAround.ts`:

```ts
import { BINDINGS, type BindingName } from './bindings.js'
import type { PressedKeys } from './keyboard.js'

/**
 * Where the pilot's head is pointed, relative to straight ahead, in body
 * frame.
 *
 * This is an OFFSET layered on the active camera mode rather than a mode of
 * its own. That is the structural choice: it means looking around behaves
 * identically from the cockpit and from the chase camera, and the snap views
 * are presets of the same value instead of separate code paths.
 */
export type LookOffset = {
  /** Positive = left, radians. */
  readonly yawRad: number
  /** Positive = up, radians. */
  readonly pitchRad: number
}

export const LOOK_CENTRE: LookOffset = { yawRad: 0, pitchRad: 0 }

/** Stops the view tipping past vertical, where yaw and pitch become ambiguous. */
export const LOOK_LIMIT_RAD = Math.PI / 2.2

const QUARTER = Math.PI / 2

const held = (pressed: PressedKeys, name: BindingName): boolean =>
  BINDINGS[name].some((code) => pressed.has(code))

/**
 * Snap, not pan: a hat switch is instantaneous and springs back on release.
 * Ramping this would make checking your six a chore rather than a glance.
 */
export function lookOffsetFromKeys(
  pressed: PressedKeys,
  _dt: number,
  _previous: LookOffset,
): LookOffset {
  if (held(pressed, 'lookCentre')) return LOOK_CENTRE
  if (held(pressed, 'lookBack')) return { yawRad: Math.PI, pitchRad: 0 }

  const yawRad =
    (held(pressed, 'lookLeft') ? QUARTER : 0) - (held(pressed, 'lookRight') ? QUARTER : 0)
  const rawPitch =
    (held(pressed, 'lookUp') ? QUARTER : 0) - (held(pressed, 'lookDown') ? QUARTER : 0)
  const pitchRad = Math.max(-LOOK_LIMIT_RAD, Math.min(LOOK_LIMIT_RAD, rawPitch))

  return yawRad === 0 && pitchRad === 0 ? LOOK_CENTRE : { yawRad, pitchRad }
}
```

- [ ] **Step 5: Apply the offset in the camera**

In `src/render/camera.ts`, add the parameter and apply it to the returned attitude in **both** modes:

```ts
import type { LookOffset } from '../input/lookAround.js'

export function cameraTransformFor(
  mode: CameraMode,
  spec: AircraftSpec,
  render: RenderState,
  look: LookOffset = { yawRad: 0, pitchRad: 0 },
): EyeTransform {
  // ...compute `position` and `attitude` per mode as before, then:
  const looked =
    look.yawRad === 0 && look.pitchRad === 0
      ? attitude
      : qNormalize(
          qMul(
            attitude,
            qMul(
              qFromAxisAngle(v3(0, 1, 0), look.yawRad),
              qFromAxisAngle(v3(0, 0, 1), look.pitchRad),
            ),
          ),
        )
  return { position, attitude: looked }
}
```

Note the multiplication order: the look rotation is applied **after** the body attitude, so it is in body frame — turning your head is relative to the aeroplane, not to the world.

Add a camera test asserting exactly that:

```ts
it('applies look-around in body frame, not world frame', () => {
  const rolled = qFromAxisAngle(v3(1, 0, 0), Math.PI / 2)
  const straight = cameraTransformFor('cockpit', f6f, at(v3(0, 1000, 0), rolled))
  const left = cameraTransformFor('cockpit', f6f, at(v3(0, 1000, 0), rolled), {
    yawRad: Math.PI / 2, pitchRad: 0,
  })
  // Inverted 90 degrees, "look left" must swing the view about the aircraft's
  // own up axis, not the world's -- otherwise the head turns the wrong way
  // whenever the aeroplane is not level.
  const straightFwd = qRotate(straight.attitude, v3(1, 0, 0))
  const leftFwd = qRotate(left.attitude, v3(1, 0, 0))
  expect(Math.abs(leftFwd.y - straightFwd.y)).toBeGreaterThan(0.5)
})
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/input/lookAround.test.ts tests/render/camera.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full pipeline and commit**

Run: `npm run verify > /tmp/v.log 2>&1; rc=$?; echo "exit=$rc"; tail -5 /tmp/v.log`

```bash
git add src/input src/render/camera.ts tests
git commit -m "feat: hat-switch look-around as a body-frame offset

Layered on whichever camera mode is active rather than being a mode of its own.
That is what makes looking around behave identically from the cockpit and from
chase, and makes the snap views presets of one value instead of separate code.

Applied after the body attitude so it is in body frame: turning your head is
relative to the aeroplane, not the world, or the view swings the wrong way
whenever the aeroplane is not level. There is a test for exactly that, taken
inverted where the two frames disagree most."
```

---

### Task 10: Gauge values

Pure: state in, needle angle out. Fitted only where Plan 1's model produces the quantity — see the design's §7 on why a needle driven by a number the sim does not model is a lie rendered at 60 fps.

**Files:**
- Create: `src/render/gauges.ts`
- Test: `tests/render/gauges.test.ts`

**Interfaces:**
- Produces: `type GaugeId = 'airspeed' | 'altimeter' | 'verticalSpeed' | 'heading' | 'fuel' | 'slip'`, `GAUGES`, `gaugeValue(id, spec, state): number`, `needleAngleFor(id, spec, state): number`, `attitudeAngles(state): { pitchRad: number; rollRad: number }`.

- [ ] **Step 1: Write the failing test**

Create `tests/render/gauges.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { gaugeValue, needleAngleFor, attitudeAngles, GAUGES } from '../../src/render/gauges.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle, qIdentity } from '../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')

describe('gaugeValue', () => {
  it('reads airspeed from velocity magnitude', () => {
    const s = createState({ velocity: v3(100, 0, 0) })
    expect(gaugeValue('airspeed', f6f, s)).toBeCloseTo(100, 9)
  })

  it('reads altitude from position.y and vertical speed from velocity.y', () => {
    const s = createState({ position: v3(0, 1234, 0), velocity: v3(100, -7.5, 0) })
    expect(gaugeValue('altimeter', f6f, s)).toBeCloseTo(1234, 9)
    expect(gaugeValue('verticalSpeed', f6f, s)).toBeCloseTo(-7.5, 9)
  })

  it('reads fuel, which the model genuinely burns', () => {
    expect(gaugeValue('fuel', f6f, createState({ fuelKg: 300 }))).toBeCloseTo(300, 9)
  })

  it('reports heading in [0, 2pi) and increases it turning right', () => {
    const north = createState({ velocity: v3(100, 0, 0) })
    expect(gaugeValue('heading', f6f, north)).toBeCloseTo(0, 9)
    // A NEGATIVE rotation about body +Y swings the nose toward +Z, which is
    // right (see the sign note on Controls.yaw in state.ts). A compass reads
    // that as an increasing heading. Exact values, not not-equal: a
    // not-equal assertion here once let the gauge read backwards.
    const right = createState({ attitude: qFromAxisAngle(v3(0, 1, 0), -0.3) })
    expect(gaugeValue('heading', f6f, right)).toBeCloseTo(0.3, 6)
    const hardRight = createState({ attitude: qFromAxisAngle(v3(0, 1, 0), -Math.PI / 2) })
    expect(gaugeValue('heading', f6f, hardRight)).toBeCloseTo(Math.PI / 2, 6)
    const left = createState({ attitude: qFromAxisAngle(v3(0, 1, 0), 0.3) })
    expect(gaugeValue('heading', f6f, left)).toBeCloseTo(Math.PI * 2 - 0.3, 6)
  })

  it('reads zero slip in coordinated flight and non-zero in a skid', () => {
    const straight = createState({ velocity: v3(100, 0, 0) })
    expect(Math.abs(gaugeValue('slip', f6f, straight))).toBeLessThan(1e-9)
    const skidding = createState({ velocity: v3(100, 0, 20) })
    expect(Math.abs(gaugeValue('slip', f6f, skidding))).toBeGreaterThan(0.1)
  })
})

describe('needleAngleFor', () => {
  it('is monotonic across each gauge range', () => {
    for (const g of GAUGES) {
      const lo = needleAngleFor(g.id, f6f, g.sampleLow)
      const hi = needleAngleFor(g.id, f6f, g.sampleHigh)
      expect(hi).toBeGreaterThan(lo)
    }
  })

  it('clamps past the ends of the dial rather than spinning round', () => {
    // A needle that wraps reads as a plausible small value at a moment the
    // pilot most needs to see a pegged one.
    const fast = createState({ velocity: v3(10_000, 0, 0) })
    const stopped = createState({ velocity: v3(0, 0, 0) })
    const a = needleAngleFor('airspeed', f6f, fast)
    const b = needleAngleFor('airspeed', f6f, stopped)
    for (const x of [a, b]) expect(Number.isFinite(x)).toBe(true)
    expect(a).toBeGreaterThan(b)
    const faster = needleAngleFor('airspeed', f6f, createState({ velocity: v3(99_999, 0, 0) }))
    expect(faster).toBeCloseTo(a, 9)
  })

  it('stays finite for a degenerate state', () => {
    const still = createState({ velocity: v3(0, 0, 0), attitude: qIdentity() })
    for (const g of GAUGES) expect(Number.isFinite(needleAngleFor(g.id, f6f, still))).toBe(true)
  })
})

describe('attitudeAngles', () => {
  it('reports level flight as zero pitch and zero roll', () => {
    const a = attitudeAngles(createState({ velocity: v3(100, 0, 0) }))
    expect(a.pitchRad).toBeCloseTo(0, 9)
    expect(a.rollRad).toBeCloseTo(0, 9)
  })

  it('reports a right bank as positive roll', () => {
    const s = createState({ attitude: qFromAxisAngle(v3(1, 0, 0), Math.PI / 6) })
    expect(attitudeAngles(s).rollRad).toBeCloseTo(Math.PI / 6, 6)
  })

  it('reports nose-up as positive pitch', () => {
    const s = createState({ attitude: qFromAxisAngle(v3(0, 0, 1), Math.PI / 8) })
    expect(attitudeAngles(s).pitchRad).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/render/gauges.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/render/gauges.ts`:

```ts
import { v3, length, dot, normalize } from '../sim/math/vec3.js'
import { qFromAxisAngle, qRotate } from '../sim/math/quat.js'
import { airspeed } from '../sim/flight/model.js'
import { createState, type AircraftState } from '../sim/flight/state.js'
import type { AircraftSpec } from '../sim/flight/schema.js'

/**
 * Instruments fitted to the panel.
 *
 * Every one of these is backed by a quantity the flight model actually
 * produces. Deliberately absent: tachometer, manifold pressure, oil and
 * cylinder-head temperatures -- Plan 1's model has no engine RPM or thermal
 * state, and a needle driven by `throttle * 2700` would be a lie rendered at
 * 60 fps. This project treats a false claim in a comment as a defect; a gauge
 * is a louder claim than a comment. Each goes in when a plan models it.
 */
export type GaugeId =
  | 'airspeed'
  | 'altimeter'
  | 'verticalSpeed'
  | 'heading'
  | 'fuel'
  | 'slip'

type GaugeSpec = {
  readonly id: GaugeId
  readonly label: string
  readonly unit: string
  /** Dial ends, in the gauge's own unit. */
  readonly min: number
  readonly max: number
  /** Needle sweep, radians, from `min` to `max`. */
  readonly sweepRad: number
  /** Wraps rather than clamping (a compass rose). */
  readonly circular: boolean
  readonly sampleLow: AircraftState
  readonly sampleHigh: AircraftState
}

const TWO_PI = Math.PI * 2

export const GAUGES: readonly GaugeSpec[] = [
  {
    id: 'airspeed', label: 'AIRSPEED', unit: 'm/s',
    min: 0, max: 250, sweepRad: (TWO_PI * 3) / 4, circular: false,
    sampleLow: createState({ velocity: v3(20, 0, 0) }),
    sampleHigh: createState({ velocity: v3(200, 0, 0) }),
  },
  {
    id: 'altimeter', label: 'ALTITUDE', unit: 'm',
    min: 0, max: 10_000, sweepRad: (TWO_PI * 3) / 4, circular: false,
    sampleLow: createState({ position: v3(0, 100, 0) }),
    sampleHigh: createState({ position: v3(0, 8000, 0) }),
  },
  {
    id: 'verticalSpeed', label: 'CLIMB', unit: 'm/s',
    min: -25, max: 25, sweepRad: (TWO_PI * 3) / 4, circular: false,
    sampleLow: createState({ velocity: v3(100, -20, 0) }),
    sampleHigh: createState({ velocity: v3(100, 20, 0) }),
  },
  {
    id: 'heading', label: 'HEADING', unit: 'deg',
    min: 0, max: TWO_PI, sweepRad: TWO_PI, circular: true,
    // Heading reads attitude, not velocity. A velocity-only sample here left
    // both ends at 0 and the monotonic test comparing 0 > 0.
    sampleLow: createState({ attitude: qFromAxisAngle(v3(0, 1, 0), -0.2) }),
    sampleHigh: createState({ attitude: qFromAxisAngle(v3(0, 1, 0), -Math.PI / 2) }),
  },
  {
    id: 'fuel', label: 'FUEL', unit: 'kg',
    min: 0, max: 700, sweepRad: (TWO_PI * 3) / 4, circular: false,
    sampleLow: createState({ fuelKg: 50 }),
    sampleHigh: createState({ fuelKg: 650 }),
  },
  {
    id: 'slip', label: 'SLIP', unit: '', 
    min: -0.5, max: 0.5, sweepRad: Math.PI / 2, circular: false,
    sampleLow: createState({ velocity: v3(100, 0, -20) }),
    sampleHigh: createState({ velocity: v3(100, 0, 20) }),
  },
]

const byId = new Map(GAUGES.map((g) => [g.id, g]))

/** Pitch and roll as a human reads them off an attitude indicator. */
export function attitudeAngles(state: AircraftState): {
  readonly pitchRad: number
  readonly rollRad: number
} {
  const fwd = qRotate(state.attitude, v3(1, 0, 0))
  const up = qRotate(state.attitude, v3(0, 1, 0))
  const pitchRad = Math.asin(Math.max(-1, Math.min(1, fwd.y)))
  // Roll from where body-up sits relative to world-up, about the nose.
  const rollRad = Math.atan2(up.z, up.y)
  return { pitchRad, rollRad }
}

export function gaugeValue(id: GaugeId, _spec: AircraftSpec, state: AircraftState): number {
  switch (id) {
    case 'airspeed':
      return airspeed(state)
    case 'altimeter':
      return state.position.y
    case 'verticalSpeed':
      return state.velocity.y
    case 'fuel':
      return state.fuelKg
    case 'heading': {
      // Compass convention: clockwise seen from above, so a RIGHT turn increases
      // it. Body +Z is right, so the nose swinging toward +Z must read as an
      // increasing heading -- hence atan2(+z, x). A first draft had the sign
      // reversed and read backwards; the test pins it with exact values.
      const fwd = qRotate(state.attitude, v3(1, 0, 0))
      const h = Math.atan2(fwd.z, fwd.x)
      return h < 0 ? h + TWO_PI : h
    }
    case 'slip': {
      const v = length(state.velocity)
      if (v < 1e-6) return 0
      const vn = normalize(state.velocity)
      // Sideways component of the airflow in body frame: the ball's deflection.
      return dot(vn, qRotate(state.attitude, v3(0, 0, 1)))
    }
  }
}

/**
 * Needle angle, radians, clockwise from the dial's zero.
 *
 * Non-circular gauges CLAMP past their ends rather than wrapping. A needle
 * that wraps shows a plausible small value at exactly the moment the pilot
 * most needs to see a pegged one.
 */
export function needleAngleFor(
  id: GaugeId,
  spec: AircraftSpec,
  state: AircraftState,
): number {
  const g = byId.get(id)
  if (!g) throw new Error(`Unknown gauge: ${id}`)

  const value = gaugeValue(id, spec, state)
  if (!Number.isFinite(value)) return 0

  if (g.circular) return ((value % TWO_PI) + TWO_PI) % TWO_PI

  const t = (value - g.min) / (g.max - g.min)
  return (t < 0 ? 0 : t > 1 ? 1 : t) * g.sweepRad
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/render/gauges.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Run the full pipeline and commit**

Run: `npm run verify > /tmp/v.log 2>&1; rc=$?; echo "exit=$rc"; tail -5 /tmp/v.log`

```bash
git add src/render/gauges.ts tests/render/gauges.test.ts
git commit -m "feat: gauge values and needle angles, pure

State in, needle angle out, with no Three.js involved -- so every instrument is
verified headlessly and the panel geometry that comes later only has to be
pointed at the right number.

Fitted only where Plan 1's model produces the quantity. No tachometer, manifold
pressure or engine temperatures: the model has no RPM and no thermal state, and
a needle driven by throttle*2700 is a lie rendered at 60 fps. An empty
instrument hole is honest.

Non-circular gauges clamp rather than wrap, because a wrapped needle shows a
plausible small value exactly when the pilot needs to see a pegged one."
```

---

### Task 11: Renderer bootstrap and visible failure

First pixels. The day-0 spike is the reason this task exists separately: a page that fails silently costs a full round trip to the reference platform to diagnose, so every failure gets a visible, explanatory state before any scene content is built.

**Files:**
- Create: `src/render/failure.ts`, `src/render/overlay.ts`, `src/render/renderer.ts`
- Modify: `src/render/main.ts`, `tests/architecture/boundary.test.ts` (render probe repoints)
- Delete: `src/render/placeholder.ts` — its own docstring says Plan 2 replaces it, and this is the task that does
- Test: `tests/render/failure.test.ts`

**Interfaces:**
- Consumes: `judgeAdapter` (Task 7).
- Produces: `showFailure(root, kind, detail)`, `type FailureKind`, `createOverlay(root)`, `initRenderer(canvas)` returning `{ renderer, adapterVerdict }`.

- [ ] **Step 1: Write the failing test**

Create `tests/render/failure.test.ts`. This tests the message selection, which is pure — the DOM writing is a thin wrapper:

```ts
import { describe, it, expect } from 'vitest'
import { failureMessage } from '../../src/render/failure.js'

describe('failureMessage', () => {
  it('tells you what to do about a missing navigator.gpu, not just that it is missing', () => {
    const m = failureMessage('no-webgpu', '')
    expect(m.title).toMatch(/WebGPU/i)
    expect(m.detail).toMatch(/secure context|localhost|tunnel/i)
  })

  it('names the software rasterizer case as a distinct failure', () => {
    const m = failureMessage('software-adapter', 'vendor="google"')
    expect(m.title).toMatch(/software/i)
    expect(m.detail).toMatch(/vendor="google"/)
  })

  it('explains a lost device as recoverable rather than as a crash', () => {
    const m = failureMessage('device-lost', 'driver reset')
    expect(m.detail).toMatch(/reload|driver/i)
  })

  it('surfaces a content validation failure with the offending field', () => {
    const m = failureMessage('bad-content', 'aero.cd0: Required')
    expect(m.detail).toMatch(/aero\.cd0/)
  })

  it('never returns an empty message for any kind', () => {
    for (const k of ['no-webgpu', 'software-adapter', 'device-lost', 'bad-content', 'unknown'] as const) {
      const m = failureMessage(k, '')
      expect(m.title.length).toBeGreaterThan(0)
      expect(m.detail.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/render/failure.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the failure states**

Create `src/render/failure.ts`:

```ts
/**
 * Visible, explanatory failure states.
 *
 * The day-0 spike taught this expensively: the loop to the reference platform
 * is long -- nexus is headless, so a browser means walking to another machine
 * -- and a page that fails silently costs a whole round trip to diagnose. Every
 * failure therefore says what happened AND what to do about it. Never a blank
 * canvas.
 */
export type FailureKind =
  | 'no-webgpu'
  | 'software-adapter'
  | 'device-lost'
  | 'bad-content'
  | 'unknown'

export type FailureMessage = { readonly title: string; readonly detail: string }

export function failureMessage(kind: FailureKind, detail: string): FailureMessage {
  switch (kind) {
    case 'no-webgpu':
      return {
        title: 'WebGPU is not available',
        detail:
          'navigator.gpu is absent. It is exposed only in a secure context, and a ' +
          'plain-HTTP LAN address is not one — reach the dev server through the SSH ' +
          'tunnel at http://localhost:5173 rather than by IP. ' + detail,
      }
    case 'software-adapter':
      return {
        title: 'This is a software rasterizer, not a GPU',
        detail:
          'Rendering would work but every frame-time number and screenshot from it ' +
          'would be meaningless. ' + detail,
      }
    case 'device-lost':
      return {
        title: 'The GPU device was lost',
        detail:
          'Usually a driver reset (Windows TDR) after a long or hung GPU operation. ' +
          'Reload to recreate the device. ' + detail,
      }
    case 'bad-content':
      return {
        title: 'Aircraft content failed validation',
        detail:
          'Content is schema-validated at load so a malformed value fails here rather ' +
          'than becoming a NaN in the integrator. Offending field: ' + (detail || '(none reported)'),
      }
    case 'unknown':
      return {
        title: 'Startup failed',
        detail: detail || 'No further detail was captured. Check the browser console.',
      }
  }
}

/** Replaces the page with a failure report. Deliberately plain DOM: this must
 *  work when the renderer is exactly what is broken. */
export function showFailure(root: HTMLElement, kind: FailureKind, detail: string): void {
  const { title, detail: body } = failureMessage(kind, detail)
  root.innerHTML = ''
  const wrap = document.createElement('div')
  wrap.style.cssText =
    'position:fixed;inset:0;padding:2rem;background:#14171c;color:#dfe3e8;' +
    'font:14px/1.6 ui-monospace,Menlo,Consolas,monospace;overflow:auto'
  const h = document.createElement('h1')
  h.style.cssText = 'font-size:1.1rem;margin:0 0 .75rem;color:#f2686f'
  h.textContent = title
  const p = document.createElement('p')
  p.style.cssText = 'margin:0;max-width:70ch;white-space:pre-wrap'
  p.textContent = body
  wrap.append(h, p)
  root.appendChild(wrap)
}
```

- [ ] **Step 4: Implement the overlay and the renderer bootstrap**

Create `src/render/overlay.ts`:

```ts
/** Dev overlay: frame time, rates, and dropped steps. `droppedSteps` is here
 *  because a spiral is only obvious while it is happening. */
export type OverlayHandle = {
  update(stats: {
    frameMs: number
    fps: number
    stepsRun: number
    droppedSteps: number
    tick: number
    adapter: string
  }): void
}

export function createOverlay(root: HTMLElement): OverlayHandle {
  const el = document.createElement('pre')
  el.style.cssText =
    'position:fixed;top:8px;left:8px;margin:0;padding:8px 10px;border-radius:4px;' +
    'background:rgba(12,14,18,.72);color:#cfe3ff;font:12px/1.45 ui-monospace,Menlo,monospace;' +
    'pointer-events:none;white-space:pre'
  root.appendChild(el)
  let dropped = 0
  return {
    update(s) {
      dropped += s.droppedSteps
      el.textContent =
        `${s.fps.toFixed(0)} fps  ${s.frameMs.toFixed(1)} ms\n` +
        `tick ${s.tick}  steps/frame ${s.stepsRun}\n` +
        `dropped ${dropped}${dropped > 0 ? '  <-- replay invalid' : ''}\n` +
        `${s.adapter}`
    },
  }
}
```

Create `src/render/renderer.ts`:

```ts
import { WebGPURenderer } from 'three/webgpu'
import { judgeAdapter, type AdapterVerdict } from './adapterGuard.js'

export type RendererBundle = {
  readonly renderer: WebGPURenderer
  readonly adapterVerdict: AdapterVerdict
}

/**
 * Brings up WebGPU and judges the adapter.
 *
 * The guard warns here rather than failing: a laptop should still run the game.
 * Tier 2 treats the same verdict as fatal, because that is where a silent
 * fallback would corrupt frame budgets and goldens (master spec §11).
 */
export async function initRenderer(canvas: HTMLCanvasElement): Promise<RendererBundle> {
  if (!('gpu' in navigator)) throw new Error('no-webgpu')

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  if (!adapter) throw new Error('no-webgpu')

  const info = adapter.info
  const adapterVerdict = judgeAdapter({
    vendor: info?.vendor ?? '',
    architecture: info?.architecture ?? '',
    device: info?.device ?? '',
    description: info?.description ?? '',
    isFallbackAdapter: (info as unknown as { isFallbackAdapter?: boolean })?.isFallbackAdapter,
  })

  const renderer = new WebGPURenderer({ canvas, antialias: true })
  await renderer.init()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)

  return { renderer, adapterVerdict }
}
```

- [ ] **Step 5: Wire `main.ts` to show something**

Replace `src/render/main.ts` with a bootstrap that brings up the renderer, installs the `device.lost` and `uncapturederror` handlers, and clears to a colour. No scene content yet — that is Task 12.

```ts
import { initRenderer } from './renderer.js'
import { showFailure } from './failure.js'
import { createOverlay } from './overlay.js'

const root = document.getElementById('app')!

async function boot(): Promise<void> {
  const canvas = document.createElement('canvas')
  root.appendChild(canvas)

  const { renderer, adapterVerdict } = await initRenderer(canvas)

  if (adapterVerdict.severity === 'fail') {
    showFailure(root, 'software-adapter', adapterVerdict.summary)
    return
  }

  // A lost device is a driver reset, not a crash: say so rather than freezing.
  void renderer.backend?.device?.lost?.then((info: { message?: string }) => {
    showFailure(root, 'device-lost', info?.message ?? '')
  })

  const overlay = createOverlay(root)
  let last = performance.now()
  const frame = (now: number): void => {
    const frameMs = now - last
    last = now
    renderer.clear()
    overlay.update({
      frameMs, fps: 1000 / Math.max(frameMs, 0.001),
      stepsRun: 0, droppedSteps: 0, tick: 0,
      adapter: adapterVerdict.summary,
    })
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight)
  })
}

void boot().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e)
  showFailure(root, msg === 'no-webgpu' ? 'no-webgpu' : 'unknown', msg)
})
```

- [ ] **Step 6: Verify by eye, once**

Run `npm run dev` on nexus, tunnel from the Windows desktop (`ssh -L 5173:localhost:5173 nexus`), open `http://localhost:5173`.
Expected: a cleared canvas with the dev overlay top-left naming the adapter. This is one of the few steps in this plan that needs human eyes; from Task 15 the adapter half is automated.

- [ ] **Step 7: Retire the placeholder, run the full pipeline and commit**

`git rm src/render/placeholder.ts`, and in `tests/architecture/boundary.test.ts` change the render probe's import to `import { showFailure } from '../render/failure.js'` (and its export to `showFailure`). The probe still targets a real file, which is what makes it a probe.

Run: `npm run verify > /tmp/v.log 2>&1; rc=$?; echo "exit=$rc"; tail -5 /tmp/v.log`

```bash
git add src/render tests/render/failure.test.ts tests/architecture/boundary.test.ts
git commit -m "feat: renderer bootstrap, visible failures, dev overlay

Every failure state is visible and says what to do about it, before any scene
content exists. The day-0 spike is why this is its own task: the loop to the
reference platform is long, and a page that fails silently costs a full round
trip to diagnose.

Handles device.lost explicitly -- Windows TDR resets the driver after a GPU
hang, and a later plan's ocean compute pass is exactly what trips it. A few
lines now instead of an unexplained freeze later.

The adapter guard warns here and is fatal in Tier 2: the same check wants
different teeth where a laptop should still run than where a silent fallback
would corrupt the baselines."
```

---

### Task 12: Scene geometry

**Files:**
- Create: `src/render/scene/water.ts`, `src/render/scene/sky.ts`, `src/render/scene/lighting.ts`, `src/render/scene/hellcat.ts`, `src/render/scene/markers.ts`
- Test: `tests/render/scene.test.ts`

**Interfaces:**
- Produces: `createWater(): Object3D`, `createSky(): Object3D`, `createLighting(): Object3D`, `createHellcat(): { root: Object3D; prop: Object3D }`, `createMarkers(): Object3D`, `MARKER_SPACING_M`, `WATER_EXTENT_M`.

Three constructs geometry without a GPU, so shape is Tier 1 testable even though appearance is not.

- [ ] **Step 1: Write the failing test**

Create `tests/render/scene.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Box3, DirectionalLight, Mesh, Vector3 } from 'three'
import { createHellcat } from '../../src/render/scene/hellcat.js'
import { createMarkers, MARKER_SPACING_M } from '../../src/render/scene/markers.js'
import { createWater, WATER_EXTENT_M } from '../../src/render/scene/water.js'
import { createSky } from '../../src/render/scene/sky.js'
import { createLighting } from '../../src/render/scene/lighting.js'

describe('hellcat geometry', () => {
  it('is roughly F6F-sized: ~13 m span, ~10 m long', () => {
    // Not art direction -- scale is what makes altitude and speed readable
    // against the water. A model twice the right size reads as half the height.
    const { root } = createHellcat()
    const b = new Box3().setFromObject(root)
    const size = b.getSize(new Vector3())
    expect(size.z).toBeGreaterThan(11)
    expect(size.z).toBeLessThan(15)
    expect(size.x).toBeGreaterThan(8)
    expect(size.x).toBeLessThan(12)
  })

  it('is built around its origin, so it rotates about itself', () => {
    const { root } = createHellcat()
    const c = new Box3().setFromObject(root).getCenter(new Vector3())
    expect(Math.abs(c.x)).toBeLessThan(2)
    expect(Math.abs(c.y)).toBeLessThan(2)
    expect(Math.abs(c.z)).toBeLessThan(2)
  })

  it('exposes the prop separately so it can be spun', () => {
    const { root, prop } = createHellcat()
    expect(prop).toBeDefined()
    expect(root.getObjectById(prop.id)).toBeTruthy()
  })

  it('points +X forward, matching the sim body frame', () => {
    // sim/ body frame is +X forward, +Y up, +Z right. A model built down -X
    // flies backwards and every camera offset is wrong by 180 degrees.
    const { prop } = createHellcat()
    const p = new Vector3()
    prop.getWorldPosition(p)
    expect(p.x).toBeGreaterThan(2)
  })
})

describe('markers', () => {
  it('places markers at a known spacing so altitude is judgeable', () => {
    const m = createMarkers()
    expect(m.children.length).toBeGreaterThan(8)
    const xs = m.children.map((c) => c.position.x).sort((a, b) => a - b)
    const gaps = xs.slice(1).map((x, i) => x - xs[i]!).filter((g) => g > 1)
    for (const g of gaps) expect(g).toBeCloseTo(MARKER_SPACING_M, 0)
  })
})

describe('water', () => {
  it('extends past the draw distance so no edge is visible', () => {
    const w = createWater()
    const b = new Box3().setFromObject(w)
    const size = b.getSize(new Vector3())
    expect(size.x).toBeGreaterThanOrEqual(WATER_EXTENT_M)
    expect(size.z).toBeGreaterThanOrEqual(WATER_EXTENT_M)
  })
})

describe('sky', () => {
  it('uses a node material, the only kind WebGPURenderer draws as written', () => {
    // A GLSL ShaderMaterial is not in the WebGPU material library: the
    // renderer logs 'not compatible' and draws with a bare NodeMaterial, and
    // nothing headless would ever see it.
    const sky = createSky() as Mesh
    expect((sky.material as { isNodeMaterial?: boolean }).isNodeMaterial).toBe(true)
  })
})

describe('lighting', () => {
  it('parents the sun target with the sun, so camera-relative translation cannot bend it', () => {
    // A DirectionalLight points from its position to its target. The frame
    // loop translates the whole scene by -eye; a target left at the world
    // origin would then swing the sun around as the aeroplane moves.
    const l = createLighting()
    const sun = l.children.find((c): c is DirectionalLight => c instanceof DirectionalLight)
    expect(sun).toBeDefined()
    expect(l.children).toContain(sun!.target)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/render/scene.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Build the water**

Create `src/render/scene/water.ts`. A large plane with a repeating procedural normal pattern:

```ts
import { Mesh, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, DataTexture, RGBAFormat, type Object3D } from 'three'

/** Big enough that its edge never enters frame at this plan's altitudes. */
export const WATER_EXTENT_M = 40_000

/**
 * Flat water with procedural surface detail.
 *
 * The detail is not decoration and is not the ocean (that is Plan 4's FFT).
 * A uniform plane gives no motion parallax: at 170 m/s over featureless water
 * you cannot perceive speed, altitude or sink rate, which would leave this
 * plan unable to answer the only question it exists to answer -- how the
 * flight model feels.
 */
export function createWater(): Object3D {
  const size = 64
  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    // Deterministic value noise; no Math.random, matching the project rule
    // even though this is render-side and unsimulated.
    const x = i % size
    const y = (i / size) | 0
    const n = (Math.sin(x * 0.7) + Math.cos(y * 0.9) + Math.sin((x + y) * 0.3)) / 3
    const v = 128 + n * 40
    data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = 255; data[i * 4 + 3] = 255
  }
  const normalMap = new DataTexture(data, size, size, RGBAFormat)
  normalMap.wrapS = normalMap.wrapT = RepeatWrapping
  normalMap.repeat.set(WATER_EXTENT_M / 40, WATER_EXTENT_M / 40)
  normalMap.needsUpdate = true

  const mesh = new Mesh(
    new PlaneGeometry(WATER_EXTENT_M, WATER_EXTENT_M),
    new MeshStandardMaterial({ color: 0x18384f, roughness: 0.35, metalness: 0.1, normalMap }),
  )
  mesh.rotation.x = -Math.PI / 2
  return mesh
}
```

- [ ] **Step 4: Build the sky, the lighting and the markers**

Create `src/render/scene/sky.ts` — a large inverted sphere with a vertical gradient, giving a clean horizon to fly against. Not the scattering LUTs; those are a later plan. **TSL, not a GLSL `ShaderMaterial`:** WebGPURenderer converts classic mesh materials through its material library and `ShaderMaterial` is not in it (checked in three 0.186's `three.webgpu.js`, 2026-09-12).

```ts
import { BackSide, Mesh, SphereGeometry, type Object3D } from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { clamp, color, mix, positionLocal } from 'three/tsl'

/**
 * Gradient dome. Attitude is judged against a horizon, so this is not optional.
 *
 * Built with TSL rather than a GLSL ShaderMaterial: WebGPURenderer converts
 * the classic mesh materials to node materials through its material library,
 * and ShaderMaterial is not in that library (three 0.186, checked 2026-09-12).
 * It would log "not compatible" and draw with a bare NodeMaterial -- a
 * failure only visible on the reference platform.
 */
export function createSky(): Object3D {
  const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false })
  // 0 at the nadir, 1 at the zenith, in the dome's own frame.
  const h = clamp(positionLocal.normalize().y.mul(0.5).add(0.5), 0, 1)
  material.colorNode = mix(color(0x9eb8cc), color(0x29619f), h)
  return new Mesh(new SphereGeometry(45_000, 32, 16), material)
}
```

Create `src/render/scene/lighting.ts`. Every other material in the scene is a lit `MeshStandardMaterial`; with no light they all render black, and no Tier 1 test can see that.

```ts
import { DirectionalLight, Group, HemisphereLight, type Object3D } from 'three'

/**
 * A sun and a sky/sea bounce. The sun's target is parented alongside it: a
 * DirectionalLight points from its position to its target, and the frame
 * loop translates the whole scene by -eye for camera-relative rendering. A
 * target left at the default world origin would then swing the sun around
 * as the aeroplane moves.
 */
export function createLighting(): Object3D {
  const group = new Group()
  const sun = new DirectionalLight(0xfff2e0, 2.5)
  sun.position.set(0.4, 1, 0.3)
  sun.target.position.set(0, 0, 0)
  group.add(sun, sun.target)
  group.add(new HemisphereLight(0x9eb8cc, 0x18384f, 0.8))
  return group
}
```

Create `src/render/scene/markers.ts`:

```ts
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three'

/** Known spacing is what turns "something moved" into "I am 300 m up". */
export const MARKER_SPACING_M = 1000

export function createMarkers(): Object3D {
  const group = new Group()
  const geo = new BoxGeometry(12, 12, 12)
  const mat = new MeshStandardMaterial({ color: 0xd8552f, roughness: 0.6 })
  for (let i = -10; i <= 10; i++) {
    for (let j = -2; j <= 2; j++) {
      const m = new Mesh(geo, mat)
      m.position.set(i * MARKER_SPACING_M, 6, j * MARKER_SPACING_M)
      group.add(m)
    }
  }
  return group
}
```

- [ ] **Step 5: Build the Hellcat**

Create `src/render/scene/hellcat.ts`. Low-poly, built from primitives, **+X forward, +Y up, +Z right** to match the sim body frame. Dimensions from the content file: 13.06 m span, roughly 10.2 m long.

```ts
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three'

/**
 * A deliberately simple low-poly F6F, built in code.
 *
 * Master spec §10 allows either verifiable-licence assets or deliberately
 * simple models built by hand; this is the second, so there is no provenance
 * to audit and no ASSETS.md row. Dimensions follow the content file (13.06 m
 * span) because scale is what makes altitude and speed readable.
 *
 * Body frame matches sim/: +X forward, +Y up, +Z right.
 */
export function createHellcat(): { root: Object3D; prop: Object3D } {
  const root = new Group()
  const paint = new MeshStandardMaterial({ color: 0x2f4f6a, roughness: 0.7 })
  const dark = new MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.5 })

  const fuselage = new Mesh(new BoxGeometry(10.2, 1.5, 1.4), paint)
  root.add(fuselage)

  const wing = new Mesh(new BoxGeometry(2.6, 0.28, 13.06), paint)
  wing.position.set(0.4, -0.25, 0)
  root.add(wing)

  const tailplane = new Mesh(new BoxGeometry(1.3, 0.2, 5.2), paint)
  tailplane.position.set(-4.4, 0.25, 0)
  root.add(tailplane)

  const fin = new Mesh(new BoxGeometry(1.3, 2.0, 0.2), paint)
  fin.position.set(-4.6, 1.1, 0)
  root.add(fin)

  const canopy = new Mesh(new BoxGeometry(2.2, 0.7, 1.0), dark)
  canopy.position.set(0.9, 0.95, 0)
  root.add(canopy)

  const spinner = new Mesh(new CylinderGeometry(0.35, 0.5, 0.8, 12), dark)
  spinner.rotation.z = Math.PI / 2
  spinner.position.set(5.1, 0, 0)
  root.add(spinner)

  // Separate, so the frame loop can spin it with throttle -- free confirmation
  // that input is reaching the simulation.
  const prop = new Mesh(new BoxGeometry(0.12, 3.9, 0.3), dark)
  prop.position.set(5.4, 0, 0)
  root.add(prop)

  return { root, prop }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/render/scene.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 7: Run the full pipeline and commit**

Run: `npm run verify > /tmp/v.log 2>&1; rc=$?; echo "exit=$rc"; tail -5 /tmp/v.log`

```bash
git add src/render/scene tests/render/scene.test.ts
git commit -m "feat: water, sky, lighting, markers and a code-built Hellcat

The water carries procedural detail, which is an addition to the spec's 'flat
water' and the reason is load-bearing: a uniform plane gives no motion
parallax, so at 170 m/s you cannot perceive speed, altitude or sink rate -- and
this plan exists to answer how the model feels. Markers at a known 1 km spacing
give absolute scale.

The aeroplane is built from primitives in code, which master spec 10 permits
outright, so there is no asset provenance to audit and no ASSETS.md row.
Geometry is tested for scale and for pointing +X forward: a model built down -X
flies backwards and every camera offset is 180 degrees wrong.

The sky is TSL, not a GLSL ShaderMaterial, which WebGPURenderer's material
library does not convert. The sun's target is parented with the sun so the
camera-relative scene translation cannot bend it. Both failures would have
been invisible headless and found only on the reference platform."
```

---

### Task 13: Fly it

Wires the pieces together. **This is the milestone** — after this task there is an aeroplane you can fly.

**Files:**
- Modify: `src/render/main.ts`
- Create: `src/render/frame.ts`
- Test: `tests/render/frame.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–12.
- Produces: `initialFrameState(spec, aircraft)`, `nextFrameState(prev, elapsedSeconds, pressed, stepper?): FrameState` — the pure part of the frame, so the loop's bookkeeping is testable without a GPU.

- [ ] **Step 1: Write the failing test**

Create `tests/render/frame.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { nextFrameState, initialFrameState } from '../../src/render/frame.js'
import { airspeed } from '../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const keys = (...k: string[]) => new Set(k)
const start = () =>
  initialFrameState(f6f, createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) }))

describe('nextFrameState', () => {
  it('advances the simulation and produces an eye transform', () => {
    const f = nextFrameState(start(), 1 / 60, keys())
    expect(f.world.aircraft.tick).toBe(1)
    expect(Number.isFinite(f.eye.position.x)).toBe(true)
  })

  it('routes held keys into the control vector the sim consumes', () => {
    let f = start()
    for (let i = 0; i < 60; i++) f = nextFrameState(f, 1 / 60, keys('ArrowDown'))
    expect(f.controls.pitch).toBeGreaterThan(0.5)
  })

  it('cycles camera mode on a key edge, not on every frame it is held', () => {
    // Held for a second, a per-frame toggle would cycle 60 times and land
    // somewhere arbitrary.
    let f = start()
    const first = f.cameraMode
    for (let i = 0; i < 60; i++) f = nextFrameState(f, 1 / 60, keys('KeyC'))
    expect(f.cameraMode).not.toBe(first)
    const afterHold = f.cameraMode
    for (let i = 0; i < 60; i++) f = nextFrameState(f, 1 / 60, keys('KeyC'))
    expect(f.cameraMode).toBe(afterHold)
    f = nextFrameState(f, 1 / 60, keys())
    f = nextFrameState(f, 1 / 60, keys('KeyC'))
    expect(f.cameraMode).not.toBe(afterHold)
  })

  it('survives a long stalled frame without spiralling or going non-finite', () => {
    let f = start()
    f = nextFrameState(f, 2.0, keys())
    expect(f.droppedSteps).toBeGreaterThan(0)
    expect(Number.isFinite(f.world.aircraft.position.y)).toBe(true)
    const after = nextFrameState(f, 1 / 60, keys())
    expect(after.stepsRun).toBe(1)
  })

  it('flies: throttle reaches the engine, so full power ends faster than idle', () => {
    // Starting at 120 m/s, position moves forward whatever the throttle does,
    // so distance alone proves nothing. Airspeed after five seconds does.
    let open = start()
    let idle = start()
    for (let i = 0; i < 300; i++) {
      open = nextFrameState(open, 1 / 60, keys('ShiftLeft'))
      idle = nextFrameState(idle, 1 / 60, keys())
    }
    expect(airspeed(open.world.aircraft)).toBeGreaterThan(airspeed(idle.world.aircraft) + 5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/render/frame.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure frame step**

Create `src/render/frame.ts`:

```ts
import { advance, createWorld, type Stepper, type World } from '../sim/loop.js'
import { interpolateAircraft } from '../sim/interpolate.js'
import { controlsFromKeys, NEUTRAL, type PressedKeys } from '../input/keyboard.js'
import { lookOffsetFromKeys, LOOK_CENTRE, type LookOffset } from '../input/lookAround.js'
import { cameraTransformFor, type CameraMode, type EyeTransform } from './camera.js'
import { BINDINGS } from '../input/bindings.js'
import type { AircraftState, Controls } from '../sim/flight/state.js'
import type { AircraftSpec } from '../sim/flight/schema.js'

export type FrameState = {
  readonly world: World
  readonly controls: Controls
  readonly look: LookOffset
  readonly cameraMode: CameraMode
  readonly eye: EyeTransform
  readonly stepsRun: number
  readonly droppedSteps: number
  /** Whether the camera-cycle key was down last frame, for edge detection. */
  readonly cyclePressed: boolean
}

const MODES: readonly CameraMode[] = ['chase', 'cockpit']

export function initialFrameState(spec: AircraftSpec, aircraft: AircraftState): FrameState {
  return {
    world: createWorld(spec, aircraft),
    controls: NEUTRAL,
    look: LOOK_CENTRE,
    cameraMode: 'chase',
    eye: { position: aircraft.position, attitude: aircraft.attitude },
    stepsRun: 0,
    droppedSteps: 0,
    cyclePressed: false,
  }
}

/**
 * One frame's worth of state change, with no Three.js and no DOM.
 *
 * Everything here is bookkeeping that is easy to get subtly wrong and painful
 * to debug through a GPU: input routing, the camera-cycle edge, the accumulator
 * under a stalled frame. Keeping it pure is what makes those Tier 1 testable.
 */
export function nextFrameState(
  prev: FrameState,
  elapsedSeconds: number,
  pressed: PressedKeys,
  stepper?: Stepper,
): FrameState {
  const spec = prev.world.spec
  const controls = controlsFromKeys(pressed, elapsedSeconds, prev.controls)
  const look = lookOffsetFromKeys(pressed, elapsedSeconds, prev.look)

  // Edge-triggered: held for a second, a per-frame toggle would cycle 60 times.
  const cycleDown = BINDINGS.cycleCamera.some((c) => pressed.has(c))
  const cameraMode =
    cycleDown && !prev.cyclePressed
      ? MODES[(MODES.indexOf(prev.cameraMode) + 1) % MODES.length]!
      : prev.cameraMode

  const advanced = advance(prev.world, controls, elapsedSeconds, stepper)
  const render = interpolateAircraft(
    advanced.world.previous,
    advanced.world.aircraft,
    advanced.alpha,
  )
  const eye = cameraTransformFor(cameraMode, spec, render, look)

  return {
    world: advanced.world,
    controls,
    look,
    cameraMode,
    eye,
    stepsRun: advanced.stepsRun,
    droppedSteps: advanced.droppedSteps,
    cyclePressed: cycleDown,
  }
}
```

- [ ] **Step 4: Wire the browser loop**

Update `src/render/main.ts` to: fetch and `parseAircraftSpec` the F6F content; build the scene from Task 12, `createLighting()` included; track pressed keys from `keydown`/`keyup`, and **clear the set on `window` `blur`** (a `keyup` that fires while the tab is unfocused is never delivered, and the key stays down forever); re-centre the sky dome on the eye's x and z each frame so the horizon stays at eye level; call `nextFrameState` each frame; apply `frame.eye` to the Three camera **camera-relative** (translate the world so the eye sits at the origin); spin the prop by `controls.throttle`; and feed the overlay.

Camera-relative is the part to get right, since retrofitting it is what master spec §4 warns about:

```ts
// Camera-relative: the world moves, the camera stays at the origin. float32
// loses precision at 100 km, which shows as geometry jitter -- master spec §4
// requires this from the first commit because retrofitting it means touching
// every position in the renderer.
scene.position.set(-frame.eye.position.x, -frame.eye.position.y, -frame.eye.position.z)
camera.position.set(0, 0, 0)
camera.quaternion.set(frame.eye.attitude.x, frame.eye.attitude.y, frame.eye.attitude.z, frame.eye.attitude.w)
```

Pass `import.meta.env.DEV ? stepChecked : step` as `nextFrameState`'s `stepper` argument, which `advance` already accepts and tests (Task 3). Plan 1's invariants turn "the aeroplane teleported" into "a NaN entered at tick 4,102", and that is worth the per-step cost in development. The choice is made here, at the edge, so `sim/` carries no build flag; `import.meta.env` typechecks because Task 5 added `vite/client` to `types`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/render/frame.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Fly it**

`npm run dev` on nexus, tunnel, open `http://localhost:5173`.
Expected: an F6F over water, chase camera, arrow keys fly it, Shift opens the throttle, C switches to the cockpit, numpad looks around.

**This is the answer to the question Plan 1 could not ask.** Note what it feels like — particularly whether `RAMP_SECONDS` is right — but change nothing yet; tuning is worth its own commit with a reason.

- [ ] **Step 7: Run the full pipeline and commit**

Run: `npm run verify > /tmp/v.log 2>&1; rc=$?; echo "exit=$rc"; tail -5 /tmp/v.log`

```bash
git add src/render tests/render/frame.test.ts
git commit -m "feat: fly it — input, sim, camera and scene wired together

nextFrameState holds everything that is easy to get subtly wrong and painful to
debug through a GPU -- input routing, the camera-cycle edge, the accumulator
under a stalled frame -- as a pure function, so all of it is tested headlessly.
The browser loop is the thin part.

Camera-relative from this first commit, per master spec 4: float32 loses
precision at 100 km and shows it as geometry jitter, and retrofitting the fix
means touching every position in the renderer.

Plan 1 validated this flight model against 1944 trial figures and never flew
it. This is the first commit where somebody can."
```

---

### Task 14: The cockpit panel

Task 10 produced the needle angles; this puts real geometry behind them.

**Files:**
- Create: `src/render/scene/panel.ts`
- Modify: `src/render/main.ts`
- Test: `tests/render/panel.test.ts`

**Interfaces:**
- Consumes: `GAUGES`, `needleAngleFor`, `attitudeAngles` (Task 10); `spec.view.eyePointM` (Task 8).
- Produces: `createPanel(spec): { root: Object3D; needles: Map<GaugeId, Object3D>; horizon: Object3D }`, `updatePanel(panel, spec, state): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/render/panel.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Box3, Vector3 } from 'three'
import { createPanel, updatePanel } from '../../src/render/scene/panel.js'
import { GAUGES } from '../../src/render/gauges.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')

describe('panel', () => {
  it('has exactly one needle per fitted gauge, and none spare', () => {
    // A needle with no gauge behind it is the failure mode this plan is most
    // determined to avoid: an instrument that appears to mean something.
    const p = createPanel(f6f)
    expect(p.needles.size).toBe(GAUGES.length)
    for (const g of GAUGES) expect(p.needles.has(g.id)).toBe(true)
  })

  it('sits ahead of and below the eye point, where a panel actually is', () => {
    // Ahead of the EYE, not of the airframe origin. A two-metre tolerance here
    // once hid a panel sitting 0.65 m behind the pilot's head.
    const p = createPanel(f6f)
    const c = new Box3().setFromObject(p.root).getCenter(new Vector3())
    const [ex, ey] = f6f.view.eyePointM
    expect(c.x).toBeGreaterThan(ex + 0.3)
    expect(c.x).toBeLessThan(ex + 1.5)
    expect(c.y).toBeLessThan(ey)
    expect(ey - c.y).toBeLessThan(0.7)
  })

  it('turns needles when the state changes', () => {
    const p = createPanel(f6f)
    const slow = createState({ velocity: v3(40, 0, 0) })
    const fast = createState({ velocity: v3(180, 0, 0) })
    updatePanel(p, f6f, slow)
    const a = p.needles.get('airspeed')!.rotation.z
    updatePanel(p, f6f, fast)
    const b = p.needles.get('airspeed')!.rotation.z
    expect(b).not.toBeCloseTo(a, 6)
  })

  it('rolls the artificial horizon opposite the aircraft, as a real one does', () => {
    const p = createPanel(f6f)
    const level = createState({ velocity: v3(120, 0, 0) })
    updatePanel(p, f6f, level)
    const flat = p.horizon.rotation.z
    const banked = createState({
      velocity: v3(120, 0, 0),
      attitude: { x: Math.sin(Math.PI / 12), y: 0, z: 0, w: Math.cos(Math.PI / 12) },
    })
    updatePanel(p, f6f, banked)
    expect(p.horizon.rotation.z).not.toBeCloseTo(flat, 6)
  })

  it('stays finite for a degenerate state', () => {
    const p = createPanel(f6f)
    updatePanel(p, f6f, createState({ velocity: v3(0, 0, 0) }))
    for (const n of p.needles.values()) expect(Number.isFinite(n.rotation.z)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/render/panel.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/render/scene/panel.ts`. Build one dial per entry in `GAUGES`, laid out in a row below the eye line, each with a face and a needle pivoting about its own centre, plus a separate artificial-horizon element.

```ts
import { BoxGeometry, CircleGeometry, Group, Mesh, MeshBasicMaterial, type Object3D } from 'three'
import { GAUGES, needleAngleFor, attitudeAngles, type GaugeId } from '../gauges.js'
import type { AircraftState } from '../../sim/flight/state.js'
import type { AircraftSpec } from '../../sim/flight/schema.js'

export type Panel = {
  readonly root: Object3D
  readonly needles: Map<GaugeId, Object3D>
  readonly horizon: Object3D
}

/**
 * Deliberately oversized and high-contrast rather than period-accurate.
 *
 * Authenticity of APPEARANCE is traded away on purpose: faithful 1944 markings
 * that cannot be read at a realistic eye point would be accurate and useless,
 * and this plan exists to let a human judge how the aeroplane flies. What is
 * NOT traded away is the data -- every needle here is backed by a quantity the
 * flight model produces, which is why there is no tachometer.
 */
const DIAL_RADIUS = 0.085
const DIAL_GAP = 0.2
/** Panel centre relative to the pilot's eye, body frame. */
const PANEL_AHEAD_M = 0.6
const PANEL_BELOW_M = 0.35

export function createPanel(spec: AircraftSpec): Panel {
  const root = new Group()
  const needles = new Map<GaugeId, Object3D>()

  const faceMat = new MeshBasicMaterial({ color: 0x101418 })
  const needleMat = new MeshBasicMaterial({ color: 0xffd24a })

  GAUGES.forEach((g, i) => {
    const dial = new Group()
    const x = (i - (GAUGES.length - 1) / 2) * DIAL_GAP

    const face = new Mesh(new CircleGeometry(DIAL_RADIUS, 32), faceMat)
    dial.add(face)

    const needle = new Mesh(new BoxGeometry(0.008, DIAL_RADIUS * 1.5, 0.004), needleMat)
    // Offset so the mesh pivots about the dial centre rather than its own end.
    needle.geometry.translate(0, DIAL_RADIUS * 0.55, 0)
    dial.add(needle)
    needles.set(g.id, needle)

    dial.position.set(x, 0, 0)
    root.add(dial)
  })

  const horizon = new Mesh(
    new BoxGeometry(DIAL_RADIUS * 1.6, 0.01, 0.004),
    new MeshBasicMaterial({ color: 0x6fd3ff }),
  )
  horizon.position.set(0, DIAL_GAP * 0.9, 0.002)
  root.add(horizon)

  // Body frame, relative to the pilot's EYE rather than the airframe origin:
  // ahead and below it, faces toward the pilot (dial faces are built in +Z;
  // -pi/2 about Y turns +Z to -X, i.e. aft). An earlier draft used a fixed
  // airframe offset that put the panel 0.65 m behind the F6F eye point.
  const [ex, ey, ez] = spec.view.eyePointM
  root.position.set(ex + PANEL_AHEAD_M, ey - PANEL_BELOW_M, ez)
  root.rotation.y = -Math.PI / 2
  return { root, needles, horizon }
}

export function updatePanel(panel: Panel, spec: AircraftSpec, state: AircraftState): void {
  for (const g of GAUGES) {
    const needle = panel.needles.get(g.id)
    if (!needle) continue
    const angle = needleAngleFor(g.id, spec, state)
    // Negative: needle angles are clockwise from the dial's zero, and a
    // positive rotation about +Z in this frame is anticlockwise.
    needle.rotation.z = -angle
  }
  const { rollRad, pitchRad } = attitudeAngles(state)
  // A real artificial horizon stays level with the world while the aeroplane
  // rolls around it, so the instrument rotates opposite the aircraft.
  panel.horizon.rotation.z = -rollRad
  panel.horizon.position.y = DIAL_GAP * 0.9 + Math.max(-0.05, Math.min(0.05, pitchRad * 0.08))
}
```

- [ ] **Step 4: Attach it in the cockpit view**

In `src/render/main.ts`, put the panel in a `cockpit` `Group` that is given the same position and quaternion as the Hellcat root each frame, and **swap the two with camera mode**: cockpit mode shows the cockpit group and hides the external airframe; chase mode the reverse.

```ts
cockpit.visible = frame.cameraMode === 'cockpit'
hellcat.root.visible = !cockpit.visible
updatePanel(panel, spec, frame.world.aircraft)
```

Hiding the airframe is not optional. The code-built Hellcat is an *external* model: its fuselage box spans y ±0.75 m, so its top face lies between the eye (0.9 m) and the panel (0.55 m) and, being front-facing from above, would occlude the panel completely. Cockpit interior geometry is a later plan's; until then the panel floats in front of an invisible airframe, which is exactly the view a pilot has.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/render/panel.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Check legibility, once**

`npm run dev`, tunnel, press `C` for the cockpit.
Expected: gauges readable at a glance at 1440p. This is the check that the appearance-authenticity trade was made for — if they are not readable, raise `DIAL_RADIUS` and say so in the commit.

- [ ] **Step 7: Run the full pipeline and commit**

Run: `npm run verify > /tmp/v.log 2>&1; rc=$?; echo "exit=$rc"; tail -5 /tmp/v.log`

```bash
git add src/render tests/render/panel.test.ts
git commit -m "feat: cockpit instrument panel

3D geometry rather than a screen-space HUD, because a 2D overlay stays pinned
to the viewport while the cockpit swings past behind it during look-around --
which defeats the point of instruments being in the cockpit. Real meshes get
parallax and occlusion for free.

Oversized and high-contrast rather than period-accurate: faithful 1944 markings
that cannot be read at a realistic eye point would be authentic and useless.
Appearance is traded, data is not -- there is a test asserting one needle per
fitted gauge and none spare, because an instrument that appears to mean
something it does not is the failure this plan most wants to avoid."
```

---

### Task 15: Tier 2 harness

Automates the two checks that need a GPU and no human judgement. Deliberately **no screenshot goldens** — see the design's §8.

**Files:**
- Create: `tests/e2e/adapter.spec.ts`, `playwright.config.ts`
- Modify: `package.json`, `src/render/main.ts`
- Test: itself

**Interfaces:**
- Consumes: `judgeAdapter` (Task 7).
- Produces: `npm run test:tier2`; `window.__ww2` diagnostics hook.

- [ ] **Step 1: Expose a diagnostics hook**

In `src/render/main.ts`, after the renderer is up, publish what the harness needs. Guard it so it is absent from a production build:

```ts
if (import.meta.env.DEV) {
  ;(window as unknown as { __ww2: unknown }).__ww2 = {
    adapter: adapterVerdict,
    validationErrors,      // accumulated by the uncapturederror listener
    tick: () => frame.world.aircraft.tick,
  }
}
```

Accumulate validation errors from the existing `uncapturederror` handler into a module-level array, and add a `pushErrorScope('validation')` around the first frame so setup errors are captured too.

- [ ] **Step 2: Write the failing test**

Create `tests/e2e/adapter.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

/** What main.ts publishes on window.__ww2 in a dev build (Step 1). Typed here
 *  rather than reached through `any`: the project forbids `any`, and the lint
 *  step in `npm run verify` covers tests/. */
type Diagnostics = {
  adapter: { severity: 'ok' | 'warn' | 'fail'; summary: string }
  validationErrors: readonly string[]
  tick: () => number
}
type DiagWindow = Window & { __ww2?: Diagnostics }

/**
 * Tier 2. Requires a real GPU, so it runs on the Windows reference platform
 * against a dev server on nexus -- never in hosted CI, which has no GPU.
 *
 * These two checks are here because they need a GPU and need NO human
 * judgement. Screenshot goldens are deliberately excluded: at a stage where the
 * picture changes every commit they generate constant diffs that mean nothing,
 * and they are the expensive half to maintain.
 */
test('the adapter is the reference GPU, not a software rasterizer', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as DiagWindow).__ww2?.adapter !== undefined)
  const verdict = await page.evaluate(() => (window as DiagWindow).__ww2!.adapter)
  // Fatal here, unlike in the app, where an unrecognised GPU only warns: this
  // is where a silent fallback would corrupt every frame-time number.
  expect(verdict.severity, verdict.summary).toBe('ok')
})

test('a camera sweep produces zero WebGPU validation errors', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.tick() ?? 0) > 5)

  // Fly a scripted sweep: every camera mode, look-around in each direction,
  // full control deflection. Catches a large class of renderer bugs with no
  // screenshots and no judgement.
  for (const key of ['KeyC', 'Numpad4', 'Numpad6', 'Numpad8', 'Numpad2', 'Numpad5', 'KeyC']) {
    await page.keyboard.down(key)
    await page.waitForTimeout(400)
    await page.keyboard.up(key)
  }
  for (const key of ['ArrowDown', 'ArrowLeft', 'ShiftLeft']) {
    await page.keyboard.down(key)
    await page.waitForTimeout(600)
    await page.keyboard.up(key)
  }

  const errors = await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)
  expect(errors, `WebGPU validation errors:
${JSON.stringify(errors, null, 2)}`).toEqual([])
})
```

- [ ] **Step 3: Add the Playwright config**

```bash
npm install --save-dev @playwright/test
```

Create `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

/**
 * Tier 2 only. Runs on the Windows reference platform, never in hosted CI --
 * there is no GPU there, and a software rasterizer would make every assertion
 * here meaningless while still passing some of them.
 *
 * baseURL is localhost on purpose: WebGPU needs a secure context and a
 * plain-HTTP LAN address is not one (master spec §2), so this expects the SSH
 * tunnel to nexus to be open.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    launchOptions: {
      // Headless is the likeliest place to silently lose the discrete GPU,
      // which is exactly what the adapter guard is watching for.
      args: ['--use-angle=d3d12', '--enable-unsafe-webgpu'],
    },
  },
  reporter: [['list']],
})
```

Add to `package.json`:

```json
"test:tier2": "playwright test",
```

- [ ] **Step 4: Run it on the reference platform**

With `npm run dev` running on nexus and the tunnel open, from the Windows desktop:

```
npm run test:tier2
```

Expected: 2 passed. If the adapter test fails, read its summary before anything else — it is telling you the browser is not using the GPU you think it is.

**This is the first time headless has been tried.** The day-0 spike ran in a headed Chrome tab; master spec §15 lists "the same adapter assertion holds under headless Chromium" as a day-0 question, and it is still open. If the guard fails here, flip `headless: false` before touching anything else: that separates "headless lost the discrete GPU" (try `--use-angle=d3d11`, or `channel: 'chrome'` to run the installed Chrome instead of Playwright's bundled Chromium) from "this Chromium build has no WebGPU at all". Record which it was, dated, in the config comment.

The Windows side needs its own checkout of the repo with `npm ci` and `npx playwright install chromium` run once. The dev server is on nexus; the test runner has to be local to the GPU.

- [ ] **Step 5: Document the loop**

Add a short section to `README.md` under the existing dev instructions covering: `npm run dev` on nexus, the tunnel command, the one-time Windows setup (checkout, `npm ci`, `npx playwright install chromium`), and `npm run test:tier2` from Windows — plus the sentence that Tier 2 never runs in hosted CI and why.

- [ ] **Step 6: Run the full pipeline and commit**

Run: `npm run verify > /tmp/v.log 2>&1; rc=$?; echo "exit=$rc"; tail -5 /tmp/v.log`
Expected: exit 0. Tier 2 is deliberately **not** part of `verify` — nexus has no GPU, so including it would make the main pipeline fail on the machine it usually runs on.

```bash
git add tests/e2e playwright.config.ts package.json package-lock.json README.md src/render/main.ts
git commit -m "test: Tier 2 harness — adapter guard and validation-error sweep

The two checks that need a GPU and need no human judgement. A software
rasterizer can present as a non-fallback adapter, and every frame time and
screenshot taken afterwards would be silently worthless; a validation-error
sweep catches a large class of renderer bugs without a single screenshot.

No screenshot goldens, deliberately. They are the expensive half to maintain,
and at a stage where the picture changes every commit they would generate
constant diffs that mean nothing.

Not part of npm run verify: nexus is headless, so including it would make the
main pipeline fail on the machine it normally runs on."
```

---

## Self-Review

Checked after writing, per the writing-plans skill.

**Spec coverage.** Every section of the design maps to a task: §3 seam → Tasks 1–4; §4 input → Task 6; §5 render layer → Tasks 11–12; §6 cameras → Tasks 8–9; §7 instruments → Tasks 10, 14; §8 testing → pure-logic split throughout, Tier 2 in Task 15; §9 failure modes → Task 11, plus `stepChecked`-in-dev in Task 13. §2's spike findings are consumed by Task 7's adapter guard and Task 5's loopback-only dev server.

**One gap found and closed:** the design's §9 dev overlay and `droppedSteps` had no home until it was folded into Task 11, and the `stepChecked`-in-dev flag into Task 13 Step 4.

**Milestone numbering corrected.** The File Structure section originally said Tasks 1–11 deliver a flyable aeroplane; the real boundary is **Task 13**. Corrected in that section.

**Type consistency.** `SimContext`, `World`, `AdvanceResult`, `Stepper`, `RenderState`, `EyeTransform`, `LookOffset`, `FrameState`, `Panel`, `GaugeId` and `AdapterVerdict` are each defined once and referenced with the same names and shapes thereafter. `cameraTransformFor` gains its `look` parameter in Task 9 and every later call site passes it.

**Known deviation from the master spec, recorded deliberately:** §11's Tier 2 adapter guard is specified as confirming vendor *and device* identify the RX 6700 XT. Measured on the reference platform, Chrome returns `device` and `description` as empty strings, so Task 7 asserts vendor + architecture + `isFallbackAdapter` instead. The master spec should be corrected when a later plan touches §11.

## Revision 2026-09-12 — pre-execution review

A review pass ran the plan's own arithmetic and probes against the repo before any task was executed. What changed, so a reader of the diff knows why:

- **Tests that failed as written, now fixed.** Task 3's half-step remainder (two halves summed to 0.9999999999999998 steps; `advance` floors with an epsilon). Task 6's throttle clamp (five ramp times is 88% of the sweep; now holds past `THROTTLE_SECONDS`). Task 10's heading monotonic sample (set velocity, gauge reads attitude). Task 14's needle test (read `rotation.x`, code writes `rotation.z`). Task 5's `input/` probe (imported a file Task 6 creates; dependency-cruiser passes an unresolvable import, so the rule moved to Task 6). Task 15's `as any` (fails the lint step of `npm run verify`).
- **Would not have typechecked.** `import.meta.env` needs `vite/client` in `types` (Task 5).
- **False premise removed.** Task 5 claimed tsc excluded DOM and was itself a guard. Verified false: the default lib includes DOM and a sim/ probe using `localStorage` typechecks today. The ESLint denylist has always been the only guard. Comment and commit message rewritten to say so.
- **Would have rendered wrong, found only on the reference platform.** The sky used a GLSL `ShaderMaterial`, which WebGPURenderer's material library does not convert (now TSL, with a test). No task added a light, so every `MeshStandardMaterial` was black (Task 12 adds `lighting.ts`; the sun's target is parented with it so camera-relative translation cannot bend it). The panel sat 0.65 m behind the eye point and its test tolerated 2 m (now placed from `spec.view.eyePointM`, tolerance tightened). The external fuselage box would have occluded the panel from inside (cockpit mode hides the airframe).
- **Read backwards.** The heading gauge increased turning left. Compass convention pinned with exact-value tests.
- **Design deviations, now recorded rather than silent.** `advance` no longer takes `spec` — it lives in `World`, which is what the design's "add fields to World, not parameters to advance" means. Mouse-look deferred (Task 9). Throttle-down is Z, not Ctrl (Ctrl+W closes the tab). Chase roll is discarded, not damped; `CHASE_ROLL_DAMPING` was a pitch scale with a false docstring and is now `CHASE_PITCH_FOLLOW`; `cameraTransformFor` drops its unused `previousEye`/`dt`. The design doc carries matching dated amendments.
- **Specified where it was hand-waved.** The `stepChecked`-in-dev switch is a tested `stepper` argument on `advance` (Task 3), threaded through `nextFrameState` (Task 13). `placeholder.ts` is retired in Task 11 and the render probe repointed. The File Structure table now names the files the tasks actually create (`main.ts`, `renderer.ts`, `frame.ts`, `markers.ts`, `lighting.ts`), not `app.ts`.
- **Tick numbering.** One convention everywhere: the tick a step produces, so the first step from a tick-0 spawn yields 1 (Task 1 Step 6).
- **Smaller.** Pressed keys cleared on window blur. Sky dome re-centred on the eye. Task 13's "flies" test compares full throttle against idle instead of asserting forward motion an aircraft already at 120 m/s has anyway. Task 15 says headless adapter identity is still the unverified day-0 question and lists the Windows one-time setup.
