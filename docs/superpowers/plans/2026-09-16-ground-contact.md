# Ground and Water Contact Implementation Plan (Plan 10)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make contact with the ground or the sea end the flight — classified as a ditching or a wreck, frozen where it happened, and reported to the pilot in a debrief they can restart from.

**Architecture:** Contact is already detected in `advance` (`src/sim/loop.ts`). This plan classifies it and stops the simulation, as an **outcome on `World`** rather than a force in `step` — a crash is an end state, not a ground reaction. A new pure module `src/sim/contact.ts` judges severity; `advance` records the judgment onto `Impact` and then runs zero further steps; the renderer reads `world.impact` to fire an effect and raise a modal.

**Tech Stack:** TypeScript (strict), vitest, three.js `three/webgpu`, Playwright (Tier 2), dependency-cruiser.

**Spec:** `docs/superpowers/specs/2026-09-16-ground-contact-design.md`

## Global Constraints

- **`src/sim/` may not import `src/render/`, any rendering library, Node core, or `src/input/`.** Enforced by `.dependency-cruiser.cjs` and `tests/architecture/boundary.test.ts`. This is why Task 1 exists.
- **`src/sim/` must load in a browser.** No Node built-ins, even transitively.
- **Contact resolution goes in `advance`, never in `step`.** Contact *forces* are Plan 11's; adding them here would disturb the graded flight test cards, move the golden trajectory, and fight `assertNoEnergyGain` in `src/sim/invariants.ts`.
- **Do NOT add a terrain field to `SimContext`.** Its own comment states it "carries `dt` and `tick` and NOTHING ELSE on purpose… Later plans add a field when they have a consumer for it." Plan 11 adds it when wheels need it.
- **`advance` must stay pure.** `tests/sim/loop.test.ts` hands it a deep-frozen world. Never write into `world`.
- **Water is `groundHeightM <= SEA_LEVEL_M`**, where `SEA_LEVEL_M = 0` from `src/sim/world/terrain.js`. No second coastline map.
- **Water contact is against mean sea level, `y = 0`.** The FFT waves are GPU-only and the sim is headless; do not build a CPU wave model.
- **US spelling** in all comments, test names and docs (Mark, 2026-09-16): airplane, maneuver, behavior, modeled, license.
- **Escape `|` as `\|` inside markdown table cells**, including inside code spans.
- **Capture exit status directly** (`rc=$?` immediately after the command), never through a pipe into `grep`.
- Run `npm run verify` before every commit. It runs typecheck, lint, depcruise and the full vitest suite. Baseline at `d04b1c8`: **697 passed, 1 skipped, exit 0**.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/sim/flight/attitude.ts` | **New.** `attitudeAngles` moved out of `render/` so the contact judgment and the instruments share one bank derivation. |
| `src/render/gauges.ts` | Re-exports `attitudeAngles` from its new home; existing importers untouched. |
| `src/sim/contact.ts` | **New.** Pure: `surfaceAt`, `contactOutcome`, and the ditching gate constants. |
| `src/sim/loop.ts` | `Impact` gains `surface` and `kind`; `advance` records them, then freezes. |
| `tools/soak/run.ts` | Terrain soak cross-checks that every recorded contact carries a consistent outcome. |
| `src/render/debrief.ts` | **New.** Pure debrief model (headline, detail, contact figures, §8 score table at zero) plus a thin DOM modal with one Restart button. |
| `src/render/scene/impactEffect.ts` | **New.** A short-lived expanding billboard: white for a splash, orange for an explosion. |
| `src/render/main.ts` | Raises the debrief on contact, fires the effect, and restarts the frame. |
| `tests/e2e/contact.spec.ts` | **New.** Tier 2: a scripted dive into terrain and a scripted descent into water. |

---

### Task 1: Move `attitudeAngles` into `sim/`

The contact judgment needs bank and pitch. It lives in `src/sim/`, which may not import `src/render/`, where `attitudeAngles` currently sits. Copying the derivation would leave two bank-angle calculations that can disagree — the exact defect class this repo keeps finding. Move the one that exists.

**Files:**
- Create: `src/sim/flight/attitude.ts`
- Modify: `src/render/gauges.ts` (remove the implementation, re-export)
- Test: `tests/sim/flight/attitude.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `attitudeAngles(state: AircraftState): { readonly pitchRad: number; readonly rollRad: number }`, importable from `src/sim/flight/attitude.js`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/sim/flight/attitude.test.ts
import { describe, it, expect } from 'vitest'
import { attitudeAngles } from '../../../src/sim/flight/attitude.js'
import { createState } from '../../../src/sim/flight/state.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'

const deg = (rad: number): number => (rad * 180) / Math.PI

describe('attitudeAngles, in sim/ so the contact judgment can reach it', () => {
  it('reads a wings-level airplane as zero bank', () => {
    expect(deg(attitudeAngles(createState()).rollRad)).toBeCloseTo(0, 9)
  })

  it('reads a 30 degree right roll as 30 degrees of bank', () => {
    const q = qFromAxisAngle(v3(1, 0, 0), Math.PI / 6)
    expect(deg(attitudeAngles(createState({ attitude: q })).rollRad)).toBeCloseTo(30, 9)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/sim/flight/attitude.test.ts`
Expected: FAIL — `Cannot find module '../../../src/sim/flight/attitude.js'`

- [ ] **Step 3: Create the new module**

Move the body of `attitudeAngles` out of `src/render/gauges.ts` verbatim — including its whole doc comment — into `src/sim/flight/attitude.ts`, changing only the import paths (`./state.js`, `../math/vec3.js`, `../math/quat.js`). Add one sentence to the doc comment recording why it lives here:

```typescript
/**
 * … (the existing comment, unchanged) …
 *
 * In `sim/` rather than beside the instruments that first needed it (moved
 * 2026-09-16, Plan 10): the ditching judgment in `src/sim/contact.ts` needs
 * bank and pitch, and `sim/` may not import `render/`. Two derivations of the
 * same bank angle could disagree; one cannot.
 */
```

- [ ] **Step 4: Re-export from `gauges.ts` so no importer changes**

```typescript
// src/render/gauges.ts — where the function used to be defined
// Moved to sim/ in Plan 10 so `src/sim/contact.ts` can reach it; re-exported
// here because panel.ts, flightData.ts and tests/render/gauges.test.ts all
// import it from this module, and the move should be invisible to them.
export { attitudeAngles } from '../sim/flight/attitude.js'
```

- [ ] **Step 5: Run the full suite**

Run: `npm run verify`
Expected: exit 0, **699 passed, 1 skipped** (the baseline 697 plus this task's 2). `tests/render/gauges.test.ts`'s existing `attitudeAngles` and bank-reference-frame blocks must still pass untouched — they are the real proof the move changed nothing.

- [ ] **Step 6: Commit**

```bash
git add src/sim/flight/attitude.ts src/render/gauges.ts tests/sim/flight/attitude.test.ts
git commit -m "Move attitudeAngles into sim/, where the contact judgment can reach it"
```

---

### Task 2: Surface classification

**Files:**
- Create: `src/sim/contact.ts`
- Test: `tests/sim/contact.test.ts`

**Interfaces:**
- Consumes: `SEA_LEVEL_M` from `src/sim/world/terrain.js`.
- Produces: `type ContactSurface = 'water' | 'land'`; `surfaceAt(groundHeightM: number): ContactSurface`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/sim/contact.test.ts
import { describe, it, expect } from 'vitest'
import { surfaceAt } from '../../src/sim/contact.js'
import { SEA_LEVEL_M } from '../../src/sim/world/terrain.js'

describe('surfaceAt', () => {
  it('reads ground above sea level as land', () => {
    expect(surfaceAt(120)).toBe('land')
  })

  it('reads ground below sea level as water', () => {
    expect(surfaceAt(-5)).toBe('water')
  })

  it('reads exactly sea level as water, because the DEM zero IS the sea', () => {
    // heightAt returns SEA_LEVEL_M for open ocean and for every query outside
    // the world box, so this is the common case, not the edge case.
    expect(surfaceAt(SEA_LEVEL_M)).toBe('water')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/sim/contact.test.ts`
Expected: FAIL — `Cannot find module '../../src/sim/contact.js'`

- [ ] **Step 3: Write the minimal implementation**

```typescript
// src/sim/contact.ts
import { SEA_LEVEL_M } from './world/terrain.js'

/** Which kind of surface a contact happened against. `'land'` and `'water'`
 *  are the only two that exist; airplanes, ships and buildings are entities
 *  and arrive with Plan 12, which is when this type grows. */
export type ContactSurface = 'water' | 'land'

/**
 * The surface at a contact, from the ground height already captured on
 * `Impact`.
 *
 * At or below sea level is water. This deliberately reads the elevation data
 * that is already loaded rather than a second coastline map: one copy cannot
 * disagree with itself. `heightAt` returns `SEA_LEVEL_M` both for open ocean
 * and for any query outside the 200 km box, so "exactly zero" is the ordinary
 * case over the sea rather than a boundary curiosity.
 */
export function surfaceAt(groundHeightM: number): ContactSurface {
  return groundHeightM <= SEA_LEVEL_M ? 'water' : 'land'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run verify`
Expected: exit 0, **702 passed, 1 skipped**.

- [ ] **Step 5: Commit**

```bash
git add src/sim/contact.ts tests/sim/contact.test.ts
git commit -m "Classify a contact surface from the ground height already captured"
```

---

### Task 3: The ditching judgment

**Files:**
- Modify: `src/sim/contact.ts`
- Test: `tests/sim/contact.test.ts`

**Interfaces:**
- Consumes: `attitudeAngles` (Task 1), `surfaceAt` (Task 2), `AircraftSpec`, `AircraftState`, `length` from `src/sim/math/vec3.js`.
- Produces: `type ContactKind = 'ditched' | 'destroyed'`; `contactOutcome(spec: AircraftSpec, state: AircraftState, surface: ContactSurface): ContactKind`; and the exported gate constants `DITCH_MAX_BANK_RAD`, `DITCH_MAX_SINK_MPS`, `DITCH_MIN_PITCH_RAD`, `DITCH_MAX_PITCH_RAD`, `DITCH_MAX_SPEED_STALL_MULTIPLE`.

- [ ] **Step 1: Write the failing tests**

One case per gate, each failing for exactly one reason, so a mutant that drops a single gate cannot pass. Append to `tests/sim/contact.test.ts`:

```typescript
import { contactOutcome, DITCH_MAX_SPEED_STALL_MULTIPLE } from '../../src/sim/contact.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
/** Wings level, nose a little up, slow, sinking gently: a good ditching. */
const goodDitch = () =>
  createState({
    position: v3(0, 0, 0),
    velocity: v3(40, -1.5, 0),
    attitude: qFromAxisAngle(v3(0, 0, 1), (6 * Math.PI) / 180),
  })

describe('contactOutcome', () => {
  it('lets a wings-level, slow, gently sinking airplane ditch', () => {
    expect(contactOutcome(f6f, goodDitch(), 'water')).toBe('ditched')
  })

  it('destroys the same airplane on land, because it has no gear to land with', () => {
    expect(contactOutcome(f6f, goodDitch(), 'land')).toBe('destroyed')
  })

  it('destroys a ditching with a wing down, which cartwheels', () => {
    const banked = { ...goodDitch(), attitude: qFromAxisAngle(v3(1, 0, 0), (25 * Math.PI) / 180) }
    expect(contactOutcome(f6f, banked, 'water')).toBe('destroyed')
  })

  it('destroys a ditching that arrives sinking too fast', () => {
    const diving = { ...goodDitch(), velocity: v3(40, -12, 0) }
    expect(contactOutcome(f6f, diving, 'water')).toBe('destroyed')
  })

  it('destroys a ditching that arrives nose down', () => {
    const noseDown = { ...goodDitch(), attitude: qFromAxisAngle(v3(0, 0, 1), (-15 * Math.PI) / 180) }
    expect(contactOutcome(f6f, noseDown, 'water')).toBe('destroyed')
  })

  it('destroys a ditching that arrives too fast', () => {
    const fast = {
      ...goodDitch(),
      velocity: v3(f6f.reference.stallSpeedMps * DITCH_MAX_SPEED_STALL_MULTIPLE + 10, -1.5, 0),
    }
    expect(contactOutcome(f6f, fast, 'water')).toBe('destroyed')
  })

  it('destroys a contact whose state is not finite, rather than passing it', () => {
    // Every gate is written as a positive comparison precisely so NaN fails
    // it. A gate written as its negation (`if (Math.abs(roll) > limit) return
    // 'destroyed'`) would let a NaN state through as a successful ditching,
    // which is the wrong way for this to fail.
    const broken = { ...goodDitch(), velocity: v3(Number.NaN, Number.NaN, Number.NaN) }
    expect(contactOutcome(f6f, broken, 'water')).toBe('destroyed')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sim/contact.test.ts`
Expected: FAIL — `contactOutcome is not a function` (7 failures).

- [ ] **Step 3: Write the implementation**

```typescript
// src/sim/contact.ts — appended
import type { AircraftSpec } from './flight/schema.js'
import type { AircraftState } from './flight/state.js'
import { attitudeAngles } from './flight/attitude.js'
import { length } from './math/vec3.js'

/** What a contact did to the airplane. */
export type ContactKind = 'ditched' | 'destroyed'

/**
 * The ditching gates.
 *
 * These are the numbers that decide whether a water arrival is survivable, and
 * they are guesses until somebody flies them -- the same standing this
 * codebase gives `RAMP_SECONDS` in src/input/keyboard.ts. Getting them wrong
 * makes ditching too easy or impossible; it does not make anything incorrect.
 * Expect to tune them.
 */
export const DITCH_MAX_BANK_RAD = (10 * Math.PI) / 180
export const DITCH_MAX_SINK_MPS = 3.0
export const DITCH_MIN_PITCH_RAD = (-2 * Math.PI) / 180
export const DITCH_MAX_PITCH_RAD = (12 * Math.PI) / 180
/** Relative to the spec's stall speed, not absolute, so a second airplane in
 *  the roster gets a sane judgment without a second constant. For the F6F this
 *  is 1.2 * 43.81 = 52.6 m/s -- fast for a ditching, and honest: that is the
 *  CLEAN, power-off stall, because the model has no flaps and the trial's
 *  slower landing-condition figure is unreachable for it (see the `reference`
 *  block in content/aircraft/f6f-hellcat.json). */
export const DITCH_MAX_SPEED_STALL_MULTIPLE = 1.2

/**
 * Whether a contact is survivable.
 *
 * **On land, never.** The flight model has no landing gear, no flaps and no
 * rolling friction (`src/sim/flight/schema.ts`, the comment on
 * `takeoffDistanceM`), so there is nothing to land on land with and a
 * survivable land contact would be a fiction. Plan 11 adds gear-down and
 * runway-underneath as two more inputs HERE rather than inventing this
 * judgment somewhere else.
 *
 * Every gate is a positive comparison, so a non-finite state fails all of them
 * and comes back `'destroyed'`. Written as negations it would come back
 * `'ditched'`, which is the wrong way for a broken state to fail.
 */
export function contactOutcome(
  spec: AircraftSpec,
  state: AircraftState,
  surface: ContactSurface,
): ContactKind {
  if (surface === 'land') return 'destroyed'

  const { pitchRad, rollRad } = attitudeAngles(state)
  const wingsLevel = Math.abs(rollRad) <= DITCH_MAX_BANK_RAD
  const sinkingGently = state.velocity.y >= -DITCH_MAX_SINK_MPS
  const noseUp = pitchRad >= DITCH_MIN_PITCH_RAD && pitchRad <= DITCH_MAX_PITCH_RAD
  const slow =
    length(state.velocity) <= DITCH_MAX_SPEED_STALL_MULTIPLE * spec.reference.stallSpeedMps

  return wingsLevel && sinkingGently && noseUp && slow ? 'ditched' : 'destroyed'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run verify`
Expected: exit 0, **709 passed, 1 skipped**.

- [ ] **Step 5: Commit**

```bash
git add src/sim/contact.ts tests/sim/contact.test.ts
git commit -m "Judge whether a water contact is a ditching or a wreck"
```

---

### Task 4: `Impact` carries the outcome

**Files:**
- Modify: `src/sim/loop.ts`
- Test: `tests/sim/terrainContact.test.ts`

**Interfaces:**
- Consumes: `surfaceAt`, `contactOutcome`, `ContactKind`, `ContactSurface` from `src/sim/contact.js`.
- Produces: `Impact` with two new readonly fields, `surface: ContactSurface` and `kind: ContactKind`.

**Naming decision, settled here so it is not revisited mid-plan:** the type stays `Impact` and the field stays `World.impact`. A ditching is still an impact; `kind` says what the impact did. Renaming would churn the soak, the terrain tests and the e2e suite for no behavior.

- [ ] **Step 1: Write the failing tests**

Append to `tests/sim/terrainContact.test.ts` (the `plateau` field and `spec` are already defined at the top of that file):

```typescript
import { surfaceAt } from '../../src/sim/contact.js'

describe('a recorded impact says what it was', () => {
  it('records a high-speed dive into a 1000 m plateau as destroyed on land', () => {
    const start = createWorld(
      spec,
      createState({ position: v3(0, 1005, 0), velocity: v3(60, -30, 0) }),
      level,
    )
    let w: World<undefined> = { ...start, terrain: plateau }
    for (let i = 0; i < 60 && w.impact === null; i++) w = advance(w, DT, undefined).world
    expect(w.impact).not.toBeNull()
    expect(w.impact!.surface).toBe('land')
    expect(w.impact!.kind).toBe('destroyed')
  })

  it('agrees with surfaceAt on the height it captured', () => {
    // Cross-check by recomputation, the shape the terrain soak already uses:
    // the field on Impact must equal what the classifier says about the height
    // stored beside it, so the two can never drift apart silently.
    const start = createWorld(
      spec,
      createState({ position: v3(0, 1005, 0), velocity: v3(60, -30, 0) }),
      level,
    )
    let w: World<undefined> = { ...start, terrain: plateau }
    for (let i = 0; i < 60 && w.impact === null; i++) w = advance(w, DT, undefined).world
    expect(w.impact!.surface).toBe(surfaceAt(w.impact!.groundHeightM))
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sim/terrainContact.test.ts`
Expected: FAIL — `Property 'surface' does not exist on type 'Impact'` at typecheck, and `expected undefined to be 'land'` at runtime.

- [ ] **Step 3: Extend the type**

In `src/sim/loop.ts`, add to `Impact` (keeping its existing doc comment, but replacing the sentence that says `advance` "does not react to it… what happens to the airplane after a crash is Plan 8's subject" — that is no longer true, and Plan 10 is the plan that owns it):

```typescript
  /** Which surface this was, from `groundHeightM` — see `surfaceAt`. */
  readonly surface: ContactSurface
  /** Whether the airplane survived it. Land is always `'destroyed'`: there is
   *  no landing gear yet. See `contactOutcome`. */
  readonly kind: ContactKind
```

- [ ] **Step 4: Populate it where the impact is recorded**

Replace the `impact = { … }` assignment inside `advance`'s step loop:

```typescript
      if (current.position.y <= groundHeightM) {
        const surface = surfaceAt(groundHeightM)
        impact = {
          tick: current.tick,
          position: current.position,
          verticalSpeedMps: current.velocity.y,
          groundHeightM,
          surface,
          kind: contactOutcome(world.spec, current, surface),
        }
      }
```

- [ ] **Step 5: Run the full suite**

Run: `npm run verify`
Expected: exit 0, **711 passed, 1 skipped**. `tests/sim/loop.test.ts`'s `structuredClone` case must still pass — the two new fields are plain strings and clone fine.

- [ ] **Step 6: Commit**

```bash
git add src/sim/loop.ts tests/sim/terrainContact.test.ts
git commit -m "Record what an impact was, not just that it happened"
```

---

### Task 5: The freeze

**Files:**
- Modify: `src/sim/loop.ts`
- Test: `tests/sim/terrainContact.test.ts`

**Interfaces:**
- Produces: `advance` returns `stepsRun: 0` for any world that already has an impact, and stops its step loop on the step that records one.

**Two details that are easy to get wrong, and both are tested below:**

1. The existing loop stops *checking* once `impact !== null` but keeps *stepping*. So today the airplane can end a multi-step frame well past the ground. The loop must `break`.
2. On the breaking step, `previous` is set to the contact state as well, so `interpolateAircraft(previous, aircraft, alpha)` returns exactly the point of contact at any `alpha`. This matches `createWorld`'s own convention, where `previous` equals `aircraft` until a step runs.

- [ ] **Step 1: Write the failing tests**

```typescript
describe('the flight ends at the contact', () => {
  it('stops stepping on the step that hits, not at the end of the frame', () => {
    // Five steps are owed in one call; the plateau is one step away. Without
    // the break, `advance` runs the remaining four and the airplane ends the
    // frame buried far below the ground it hit.
    const start = createWorld(
      spec,
      createState({ position: v3(0, 1001, 0), velocity: v3(60, -60, 0) }),
      level,
    )
    const result = advance({ ...start, terrain: plateau }, DT * 5)
    expect(result.world.impact).not.toBeNull()
    expect(result.stepsRun).toBeLessThan(5)
    expect(result.world.aircraft.tick).toBe(result.world.impact!.tick)
    expect(result.world.aircraft.position).toEqual(result.world.impact!.position)
  })

  it('renders exactly at the point of contact, at any interpolation factor', () => {
    const start = createWorld(
      spec,
      createState({ position: v3(0, 1001, 0), velocity: v3(60, -60, 0) }),
      level,
    )
    const result = advance({ ...start, terrain: plateau }, DT * 5)
    expect(result.world.previous).toEqual(result.world.aircraft)
  })

  it('runs no further steps once the flight has ended', () => {
    const start = createWorld(
      spec,
      createState({ position: v3(0, 1001, 0), velocity: v3(60, -60, 0) }),
      level,
    )
    const ended = advance({ ...start, terrain: plateau }, DT * 5).world
    const after = advance(ended, DT * 10)
    expect(after.stepsRun).toBe(0)
    expect(after.world.aircraft).toEqual(ended.aircraft)
    expect(after.world.impact).toBe(ended.impact)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sim/terrainContact.test.ts`
Expected: FAIL — the first reports `stepsRun` 5 and a position below the plateau; the third reports `stepsRun` 5 rather than 0.

- [ ] **Step 3: Return early for a world whose flight has ended**

At the top of `advance`, immediately after the `elapsed` clamp:

```typescript
  // The flight is over: no further simulated time is owed, and nothing about
  // this world can change again. Returning here rather than letting the loop
  // below run zero times keeps `accumulatorSeconds` exactly as the ending
  // frame left it, so a frozen world handed a thousand frames is bit-identical
  // to one handed a single frame.
  if (world.impact !== null) {
    return { world, stepsRun: 0, droppedSteps: 0, alpha: world.accumulatorSeconds / DT }
  }
```

- [ ] **Step 4: Break the step loop on contact, and count the steps actually run**

Change the loop's accounting so `stepsRun` reports steps actually executed. Introduce `let ran = 0`, increment it after each `stepper` call, `return … stepsRun: ran`, and end the impact block with:

```typescript
        // Stop the frame here. Without this the loop runs its remaining owed
        // steps and the airplane ends up well below the ground it just hit --
        // the impact TICK would be right and the resting position wrong.
        // `previous` follows `current` so the renderer interpolates to exactly
        // the point of contact whatever `alpha` is, the same convention
        // `createWorld` uses before any step has run.
        previous = current
        break
```

Leave `banked -= owed * DT` as it is: the steps discarded by the break have their time discarded with them, and nothing will ever step this world again. Leave `droppedSteps` meaning exactly what it means today — time skipped to break a frame-rate spiral — so a crash never masquerades as a dropped frame.

- [ ] **Step 5: Run the full suite**

Run: `npm run verify`
Expected: exit 0, **714 passed, 1 skipped**. Watch two suites in particular: `tests/sim/loop.test.ts` (purity against a deep-frozen world, and the `[0, DT)` accumulator range) and `tests/sim/soak.test.ts` (the terrain soak's `terrainHits` floor of 100).

- [ ] **Step 6: Commit**

```bash
git add src/sim/loop.ts tests/sim/terrainContact.test.ts
git commit -m "End the flight at the contact instead of flying on through it"
```

---

### Task 6: The soak cross-checks the outcome

**Files:**
- Modify: `tools/soak/run.ts`
- Test: `tests/sim/soak.test.ts`

**Interfaces:**
- Consumes: `surfaceAt` from `src/sim/contact.js`.
- Produces: `runTerrainSoak` pushes a failure string for any contact whose outcome is inconsistent.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/sim/soak.test.ts — append inside the existing terrain soak describe block
it('finds every contact carrying a consistent outcome', () => {
  const result = runTerrainSoak(spec, 400, 20260916, terrain)
  expect(result.failures).toEqual([])
  expect(result.terrainHits).toBeGreaterThan(20)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/sim/soak.test.ts`
Expected: FAIL — `runTerrainSoak is not defined` in this block, or a seed mismatch. If it passes immediately, the assertion is not yet reaching the new code; add the check in Step 3 first and confirm it can fail by temporarily forcing `kind` to `'ditched'` in `advance`, then revert.

- [ ] **Step 3: Add the cross-check**

In `runTerrainSoak`, replace `if (world.impact !== null) terrainHits++` with:

```typescript
      if (world.impact !== null) {
        terrainHits++
        const hit = world.impact
        // Recomputed from outside `advance`, the same way this soak already
        // re-derives the ground height rather than trusting the one on the
        // world. A field that agrees with itself proves nothing.
        const expectedSurface = surfaceAt(hit.groundHeightM)
        if (hit.surface !== expectedSurface) {
          failures.push(
            `iteration ${n} (seed ${seed}): impact surface ${hit.surface} but groundHeightM ` +
              `${hit.groundHeightM} classifies as ${expectedSurface}`,
          )
        }
        // Land has no survivable outcome until Plan 11 adds landing gear. This
        // is the invariant most likely to be broken by accident when it does.
        if (hit.surface === 'land' && hit.kind !== 'destroyed') {
          failures.push(
            `iteration ${n} (seed ${seed}): land contact recorded as ${hit.kind}, ` +
              `but there is no landing gear to survive one with`,
          )
        }
      }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run verify`
Expected: exit 0, **715 passed, 1 skipped**.

- [ ] **Step 5: Commit**

```bash
git add tools/soak/run.ts tests/sim/soak.test.ts
git commit -m "Soak every contact's outcome against a recomputed surface"
```

---

### Task 7: The debrief model

**Files:**
- Create: `src/render/debrief.ts`
- Test: `tests/render/debrief.test.ts`

**Interfaces:**
- Consumes: `Impact` from `src/sim/loop.js`, `AircraftState`, `attitudeAngles`, `length`.
- Produces:
  - `type ScoreRow = { readonly target: string; readonly destroyed: number; readonly score: number }`
  - `missionScore(): { readonly rows: readonly ScoreRow[]; readonly total: number }`
  - `type DebriefFigure = { readonly label: string; readonly value: string }`
  - `type DebriefModel = { readonly headline: string; readonly detail: string; readonly figures: readonly DebriefFigure[]; readonly score: ReturnType<typeof missionScore> }`
  - `debriefModel(impact: Impact, state: AircraftState): DebriefModel`

**Decision made here, flagged in the spec's §10 as open:** the debrief **does** show the contact figures — impact speed, sink rate and bank. While there is no score to show, they are the only thing that tells a pilot why a ditching failed, and they come free from state already captured.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/render/debrief.test.ts
import { describe, it, expect } from 'vitest'
import { debriefModel, missionScore } from '../../src/render/debrief.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import type { Impact } from '../../src/sim/loop.js'

const impact = (over: Partial<Impact> = {}): Impact => ({
  tick: 1200,
  position: v3(0, 0, 0),
  verticalSpeedMps: -2,
  groundHeightM: 0,
  surface: 'water',
  kind: 'ditched',
  ...over,
})

describe('the debrief', () => {
  it('says the pilot survived a ditching', () => {
    const m = debriefModel(impact(), createState({ velocity: v3(40, -2, 0) }))
    expect(m.headline).toBe('DITCHED')
    expect(m.detail).toContain('survived')
  })

  it('says the pilot was killed by a wreck on land', () => {
    const m = debriefModel(
      impact({ surface: 'land', kind: 'destroyed', groundHeightM: 340 }),
      createState({ velocity: v3(150, -40, 0) }),
    )
    expect(m.headline).toBe('KILLED')
    expect(m.detail).toContain('Leyte')
  })

  it('says the pilot was killed going into the sea', () => {
    const m = debriefModel(
      impact({ kind: 'destroyed' }),
      createState({ velocity: v3(150, -40, 0) }),
    )
    expect(m.headline).toBe('KILLED')
    expect(m.detail).toContain('sea')
  })

  it('reports the figures that explain the outcome', () => {
    const m = debriefModel(impact(), createState({ velocity: v3(40, -2, 0) }))
    const labels = m.figures.map((f) => f.label)
    expect(labels).toContain('Impact speed')
    expect(labels).toContain('Sink rate')
    expect(labels).toContain('Bank')
  })

  it('scores nothing, because nothing can be destroyed yet', () => {
    // Plan 9 owns scoring (master spec §8). This stub is the single place it
    // replaces; the categories below are §8's own, so the table's shape is
    // already right when real numbers arrive.
    const score = missionScore()
    expect(score.total).toBe(0)
    expect(score.rows.every((r) => r.destroyed === 0 && r.score === 0)).toBe(true)
    expect(score.rows.map((r) => r.target)).toContain('Carrier')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/render/debrief.test.ts`
Expected: FAIL — `Cannot find module '../../src/render/debrief.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/render/debrief.ts
import type { Impact } from '../sim/loop.js'
import type { AircraftState } from '../sim/flight/state.js'
import { attitudeAngles } from '../sim/flight/attitude.js'
import { length } from '../sim/math/vec3.js'

export type ScoreRow = {
  readonly target: string
  readonly destroyed: number
  readonly score: number
}

/**
 * The mission's score.
 *
 * A stub, and deliberately the ONLY one: scoring is Plan 9's (master spec §8),
 * and nothing destructible exists yet, so every honest number here is zero.
 * The categories are §8's own table, so Plan 9 replaces this one function
 * rather than a scattering of assumptions spread through a dialog.
 */
export function missionScore(): { readonly rows: readonly ScoreRow[]; readonly total: number } {
  const targets = ['Fighter', 'Bomber', 'AAA Battery', 'Carrier', 'Battleship', 'Cruiser', 'Runway']
  return { rows: targets.map((target) => ({ target, destroyed: 0, score: 0 })), total: 0 }
}

export type DebriefFigure = { readonly label: string; readonly value: string }

export type DebriefModel = {
  readonly headline: string
  readonly detail: string
  readonly figures: readonly DebriefFigure[]
  readonly score: ReturnType<typeof missionScore>
}

/** What the debrief says about how a flight ended. Pure, so the node-environment
 *  suite can assert on all of it; the DOM in `createDebrief` renders it. */
export function debriefModel(impact: Impact, state: AircraftState): DebriefModel {
  const { rollRad } = attitudeAngles(state)
  const figures: DebriefFigure[] = [
    { label: 'Impact speed', value: `${Math.round(length(state.velocity))} m/s` },
    { label: 'Sink rate', value: `${Math.round(impact.verticalSpeedMps)} m/s` },
    { label: 'Bank', value: `${Math.round((rollRad * 180) / Math.PI)}°` },
  ]

  if (impact.kind === 'ditched') {
    return {
      headline: 'DITCHED',
      detail: 'You put her down on the water and survived. The airplane is lost.',
      figures,
      score: missionScore(),
    }
  }
  return {
    headline: 'KILLED',
    detail:
      impact.surface === 'water'
        ? 'You went into the sea. There was nothing left to recover.'
        : 'You went into Leyte. There was nothing left to recover.',
    figures,
    score: missionScore(),
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run verify`
Expected: exit 0, **720 passed, 1 skipped**.

- [ ] **Step 5: Commit**

```bash
git add src/render/debrief.ts tests/render/debrief.test.ts
git commit -m "Say what the flight's ending was, and score the nothing there is to score"
```

---

### Task 8: The debrief modal

**Files:**
- Modify: `src/render/debrief.ts`
- Test: none — DOM only, the same split `legend.ts` and `overlay.ts` already use (the vitest environment is `node`; everything worth asserting is in Task 7's pure functions). Task 11 covers it end to end.

**Interfaces:**
- Produces: `createDebrief(root: HTMLElement, onRestart: () => void): { show(model: DebriefModel): void; hide(): void }`

- [ ] **Step 1: Write the DOM**

```typescript
// src/render/debrief.ts — appended

export type DebriefHandle = {
  show(model: DebriefModel): void
  hide(): void
}

/**
 * The end-of-flight modal, over a scene that is still being drawn.
 *
 * It does NOT stop the simulation and must not learn how to: `advance` freezes
 * a world that has an impact (`src/sim/loop.ts`), and Plan 14's mission map
 * will want the same frozen-modal behavior without going through a debrief.
 * This module only renders.
 *
 * ONE button. "Resume" is meaningless after a death, and the 1991 original's
 * "End Mission" returns to a mission selector this game does not have -- a
 * button that goes nowhere is how a stale document starts. Plan 9 adds the
 * menu and the button that reaches it.
 */
export function createDebrief(root: HTMLElement, onRestart: () => void): DebriefHandle {
  const backdrop = document.createElement('div')
  backdrop.style.cssText =
    'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
    'background:rgba(8,10,14,.45);z-index:10'
  const panel = document.createElement('div')
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.style.cssText =
    'min-width:340px;max-width:560px;padding:18px 20px;border:1px solid #2b3440;' +
    'border-radius:6px;background:#eceff3;color:#151b22;' +
    'font:13px/1.5 ui-monospace,Menlo,monospace;box-shadow:0 12px 40px rgba(0,0,0,.45)'
  backdrop.appendChild(panel)
  root.appendChild(backdrop)

  const restart = document.createElement('button')
  restart.textContent = 'Restart'
  restart.style.cssText =
    'margin-top:14px;padding:6px 14px;border:1px solid #2b3440;border-radius:4px;' +
    'background:#fff;color:#151b22;font:12px ui-monospace,Menlo,monospace;cursor:pointer'
  restart.addEventListener('click', () => {
    restart.blur()
    onRestart()
  })

  return {
    show(model: DebriefModel): void {
      panel.textContent = ''
      const headline = document.createElement('div')
      headline.style.cssText = 'font-size:20px;font-weight:700;letter-spacing:.1em'
      headline.textContent = model.headline
      const detail = document.createElement('p')
      detail.style.cssText = 'margin:6px 0 12px'
      detail.textContent = model.detail
      panel.append(headline, detail)

      for (const figure of model.figures) {
        const row = document.createElement('div')
        row.style.cssText = 'display:flex;justify-content:space-between;gap:24px'
        const label = document.createElement('span')
        label.style.color = '#55606b'
        label.textContent = figure.label
        const value = document.createElement('strong')
        value.textContent = figure.value
        row.append(label, value)
        panel.appendChild(row)
      }

      const scoreHeading = document.createElement('div')
      scoreHeading.style.cssText = 'margin:14px 0 4px;font-weight:700'
      scoreHeading.textContent = `Targets destroyed — score ${model.score.total}`
      panel.appendChild(scoreHeading)
      for (const row of model.score.rows) {
        const line = document.createElement('div')
        line.style.cssText = 'display:flex;justify-content:space-between;gap:24px;color:#55606b'
        const target = document.createElement('span')
        target.textContent = row.target
        const count = document.createElement('span')
        count.textContent = `${row.destroyed}`
        line.append(target, count)
        panel.appendChild(line)
      }

      panel.appendChild(restart)
      backdrop.style.display = 'flex'
      restart.focus()
    },
    hide(): void {
      backdrop.style.display = 'none'
    },
  }
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run verify`
Expected: exit 0, **720 passed, 1 skipped** (no new tests; this step is proving the module compiles and lints).

- [ ] **Step 3: Commit**

```bash
git add src/render/debrief.ts
git commit -m "Raise a debrief over the frozen scene, with one button"
```

---

### Task 9: The splash and the explosion

**Files:**
- Create: `src/render/scene/impactEffect.ts`
- Test: `tests/render/impactEffect.test.ts`

**Interfaces:**
- Consumes: `ContactSurface` from `src/sim/contact.js`.
- Produces:
  - `effectAppearance(surface: ContactSurface): { readonly colorHex: number; readonly maxRadiusM: number; readonly lifetimeSeconds: number }`
  - `effectScaleAndOpacity(age: number, lifetimeSeconds: number, maxRadiusM: number): { readonly radiusM: number; readonly opacity: number }`
  - `createImpactEffect(): { readonly object: Object3D; fire(surface: ContactSurface): void; update(dtSeconds: number): void }`

**Provisional, by the spec's §10:** an expanding, fading camera-facing billboard is the cheapest honest thing. Whether it reads as a splash and an explosion is a Tier 3 answer; treat the first attempt as a draft.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/render/impactEffect.test.ts
import { describe, it, expect } from 'vitest'
import { effectAppearance, effectScaleAndOpacity } from '../../src/render/scene/impactEffect.js'

describe('the impact effect', () => {
  it('is white foam on water and fire on land', () => {
    expect(effectAppearance('water').colorHex).not.toBe(effectAppearance('land').colorHex)
  })

  it('starts small and opaque', () => {
    const at0 = effectScaleAndOpacity(0, 1.5, 30)
    expect(at0.radiusM).toBeGreaterThan(0)
    expect(at0.radiusM).toBeLessThan(30)
    expect(at0.opacity).toBeCloseTo(1, 6)
  })

  it('reaches full size and zero opacity at the end of its life', () => {
    const atEnd = effectScaleAndOpacity(1.5, 1.5, 30)
    expect(atEnd.radiusM).toBeCloseTo(30, 6)
    expect(atEnd.opacity).toBeCloseTo(0, 6)
  })

  it('stays clamped past the end of its life rather than growing forever', () => {
    // The renderer keeps running after the flight ends -- the scene is still
    // being drawn behind the modal -- so this function is called long past the
    // effect's lifetime and must not return a radius that keeps expanding.
    const after = effectScaleAndOpacity(600, 1.5, 30)
    expect(after.radiusM).toBeCloseTo(30, 6)
    expect(after.opacity).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/render/impactEffect.test.ts`
Expected: FAIL — `Cannot find module '../../src/render/scene/impactEffect.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/render/scene/impactEffect.ts
import { Mesh, MeshBasicMaterial, PlaneGeometry, type Object3D } from 'three'
import type { ContactSurface } from '../../sim/contact.js'

/** How each surface's effect looks. Provisional -- whether these read as a
 *  splash and an explosion is a Tier 3 question (spec §10, open question 1). */
export function effectAppearance(surface: ContactSurface): {
  readonly colorHex: number
  readonly maxRadiusM: number
  readonly lifetimeSeconds: number
} {
  return surface === 'water'
    ? { colorHex: 0xe8f4ff, maxRadiusM: 26, lifetimeSeconds: 1.8 }
    : { colorHex: 0xff7a2f, maxRadiusM: 34, lifetimeSeconds: 1.4 }
}

/**
 * The effect's size and opacity at a given age, seconds.
 *
 * Clamped at both ends. The renderer keeps drawing the scene behind the
 * debrief for as long as the pilot leaves it up, so this is called with ages
 * far past `lifetimeSeconds` and must settle rather than expand forever.
 */
export function effectScaleAndOpacity(
  age: number,
  lifetimeSeconds: number,
  maxRadiusM: number,
): { readonly radiusM: number; readonly opacity: number } {
  const t = age <= 0 ? 0 : age >= lifetimeSeconds ? 1 : age / lifetimeSeconds
  // Fast at first, then settling: the visible part of both a splash and a
  // fireball happens in the first third of its life.
  const grown = Math.sqrt(t)
  return {
    radiusM: Math.max(maxRadiusM * 0.08, maxRadiusM * grown),
    opacity: 1 - t,
  }
}

/**
 * A camera-facing quad that expands and fades once, where the airplane hit.
 *
 * `MeshBasicMaterial` rather than a node material: `panel.ts` already uses it
 * with `transparent: true` in this renderer, so this needs no new material
 * path. The caller positions `object` and keeps it facing the camera.
 */
export function createImpactEffect(): {
  readonly object: Object3D
  fire(surface: ContactSurface): void
  update(dtSeconds: number): void
} {
  const material = new MeshBasicMaterial({ transparent: true, depthWrite: false })
  const mesh = new Mesh(new PlaneGeometry(2, 2), material)
  mesh.visible = false

  let age = 0
  let appearance = effectAppearance('water')

  return {
    object: mesh,
    fire(surface: ContactSurface): void {
      appearance = effectAppearance(surface)
      material.color.setHex(appearance.colorHex)
      age = 0
      mesh.visible = true
    },
    update(dtSeconds: number): void {
      if (!mesh.visible) return
      age += dtSeconds
      const { radiusM, opacity } = effectScaleAndOpacity(
        age,
        appearance.lifetimeSeconds,
        appearance.maxRadiusM,
      )
      mesh.scale.setScalar(radiusM)
      material.opacity = opacity
      if (opacity <= 0) mesh.visible = false
    },
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run verify`
Expected: exit 0, **724 passed, 1 skipped**.

- [ ] **Step 5: Commit**

```bash
git add src/render/scene/impactEffect.ts tests/render/impactEffect.test.ts
git commit -m "Fire a splash on water and a fireball on land"
```

---

### Task 10: Wire it into the running game

**Files:**
- Modify: `src/render/main.ts`
- Test: none directly — `main.ts` is the untested shell by design in this repo (which is why `frame.ts` exists). Task 11 covers this end to end.

**Interfaces:**
- Consumes: `createDebrief`, `debriefModel` (Tasks 7-8), `createImpactEffect` (Task 9), `initialFrameState` and `withTerrain` from `src/render/frame.js`.

- [ ] **Step 1: Create the debrief and the effect alongside the legend**

Next to `const timeBadge = createTimeBadge(root)`:

```typescript
  // Restart rebuilds the frame from the spawn point rather than tearing
  // anything down: `initialFrameState` is pure, so the renderer, the terrain
  // and the ocean cascades all survive untouched.
  const debrief = createDebrief(root, () => {
    // `frame!.world.terrain` rather than a stored field: the heightfield
    // arrives over the network seconds after the first frame and is upgraded
    // again as finer levels load (`applyTerrainLevel`, further down this
    // file), so the CURRENT world holds the only up-to-date copy. Reading it
    // back means a restart keeps whatever level has loaded so far instead of
    // dropping back to none.
    frame = withTerrain(initialFrameState(spec, initialAircraft), frame!.world.terrain)
    debrief.hide()
    shownImpactTick = null
  })
  const impactEffect = createImpactEffect()
  scene.add(impactEffect.object)
  /** The tick of the impact the debrief is currently showing, so the modal is
   *  raised once rather than rebuilt sixty times a second. */
  let shownImpactTick: number | null = null
```

These are `main.ts`'s existing bindings, checked against the file at `d04b1c8`: `spec` (line 288), `initialAircraft` (368), `frame` (153), `scene` (297), `camera` (354). `withTerrain` and `initialFrameState` both come from `src/render/frame.js`; `withTerrain` is not yet imported there, so add it to the existing import.

- [ ] **Step 2: Raise the debrief and fire the effect, once**

In `frameFn`, after `flightData.update(...)` and `timeBadge.setScale(...)`:

```typescript
    const hit = current.world.impact
    if (hit !== null && shownImpactTick !== hit.tick) {
      shownImpactTick = hit.tick
      impactEffect.object.position.set(
        hit.position.x + offset.x,
        hit.position.y + offset.y,
        hit.position.z + offset.z,
      )
      impactEffect.fire(hit.surface)
      debrief.show(debriefModel(hit, current.world.aircraft))
    }
    impactEffect.object.quaternion.copy(camera.quaternion)
    impactEffect.update(frameMs / 1000)
```

The offset variable is `worldOffset`, computed at line 484 via `worldOffsetFor(current.eye.position)` — reuse it rather than recomputing, and place this block after it. Substitute `worldOffset` for `offset` in the code above. The effect is placed in the same frame as everything else, and faces the camera each frame because it is a flat quad.

- [ ] **Step 3: Build and check the bundle**

Run: `npm run build`
Expected: exit 0, only the existing chunk-size warning.

- [ ] **Step 4: Run the full suite**

Run: `npm run verify`
Expected: exit 0, **724 passed, 1 skipped**.

- [ ] **Step 5: Commit**

```bash
git add src/render/main.ts
git commit -m "Raise the debrief and fire the effect when the flight ends"
```

---

### Task 11: Tier 2 — it actually happens in a browser

**Files:**
- Create: `tests/e2e/contact.spec.ts`

**Interfaces:**
- Consumes: `spawnUrl`, `waitForTerrain`, `snapshot` from `tests/e2e/harness.js`.

Read `tests/e2e/terrain.spec.ts` first: it documents why the spawn is moved with `?spawnX/Y/Z`, and it already carries Tacloban's world coordinate `(-29666, 47605)` — **take the coordinate from there, do not re-derive it.**

- [ ] **Step 1: Write the test**

```typescript
// tests/e2e/contact.spec.ts
import { test, expect } from '@playwright/test'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'

/**
 * Tier 2, contact. Same platform and caveats as `adapter.spec.ts`.
 *
 * Both cases fly the airplane INTO something rather than constructing an
 * impact, because the thing under test is the whole production path --
 * `advance` classifying and freezing, `main.ts` raising the modal -- and a
 * constructed impact would skip most of it.
 */
test('going into the sea ends the flight and raises the debrief', async ({ page }) => {
  await page.goto(spawnUrl({ x: 0, y: 120, z: 0 }))
  await waitForTerrain(page)
  // Nose down, throttle closed, and wait: 120 m over open water at a steep
  // dive arrives in a few seconds.
  await page.keyboard.down('ArrowUp')
  await page.waitForSelector('[role="dialog"]', { timeout: 20000 })
  await page.keyboard.up('ArrowUp')

  const text = await page.locator('[role="dialog"]').innerText()
  expect(text).toContain('KILLED')
  expect(text).toContain('sea')

  const frozen = await page.evaluate(() => {
    const w = window as DiagWindow
    return w.__ww2?.frame?.()?.world?.impact ?? null
  })
  expect(frozen).not.toBeNull()
  expect(frozen!.surface).toBe('water')
})

test('restart puts a fresh airplane back in the air', async ({ page }) => {
  await page.goto(spawnUrl({ x: 0, y: 120, z: 0 }))
  await waitForTerrain(page)
  await page.keyboard.down('ArrowUp')
  await page.waitForSelector('[role="dialog"]', { timeout: 20000 })
  await page.keyboard.up('ArrowUp')

  await page.getByRole('button', { name: 'Restart' }).click()
  await expect(page.locator('[role="dialog"]')).toBeHidden()

  const after = await page.evaluate(() => {
    const w = window as DiagWindow
    return w.__ww2?.frame?.()?.world?.impact ?? null
  })
  expect(after).toBeNull()
})
```

- [ ] **Step 2: Confirm the diagnostics hook exposes the frame**

Check `src/render/diagnostics.ts` for whether `window.__ww2` already exposes the current `FrameState`. If it does not, add a `frame: () => FrameState` member beside the existing ones, guarded by `import.meta.env.DEV` exactly as the others are — `tests/build/dist.test.ts` asserts `__ww2` is absent from a production bundle, and that assertion must keep passing.

- [ ] **Step 3: Run the Tier 2 suite on the reference platform**

Run on the Windows desktop with the Playwright server in Mark's console session (see `docs/handoff/2026-09-15-cockpit-panel.md` for how the previous plan did this): `npx playwright test tests/e2e/contact.spec.ts`
Expected: 2 passed, no page errors, no WebGPU validation errors.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/contact.spec.ts src/render/diagnostics.ts
git commit -m "Tier 2: fly into the sea, get a debrief, restart"
```

---

### Task 12: Documentation

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-09-12-ww2airsim-design.md`
- Create: `docs/handoff/2026-09-16-plan10-contact.md`

- [ ] **Step 1: Update §15's status for Plan 10**

Change the Plan 10 row's Status to `Complete; [handoff](../../handoff/2026-09-16-plan10-contact.md)`, and move the `— next` marker in the Order column to Plan 11.

- [ ] **Step 2: Add a README paragraph**

After the triple-time paragraph. State what contact now does, that water can be survived and land cannot and why, and point at §15 rather than restating the roadmap. Escape any `|` in tables as `\|`. US spelling.

- [ ] **Step 3: Write the handoff**

Follow `docs/handoff/2026-09-15-cockpit-panel.md`'s shape: what shipped, the final numbers for every ditching gate, the verification evidence with real counts and exit statuses, and the non-blocking follow-ups. Record explicitly that the ditching gates are **untuned guesses** and that Tier 3 — whether the splash and the fireball read correctly — is Mark's outstanding step.

- [ ] **Step 4: Run the full suite one more time**

Run: `npm run verify`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/
git commit -m "Document Plan 10: what contact does, and what is still a guess"
```

---

## Self-review against the spec

| Spec section | Task |
| --- | --- |
| §1 what exists / what is missing | Context for all; no task |
| §2 outcome not force; no `SimContext` widening | Global Constraints; Tasks 4-5 |
| §3 surface from captured height | Task 2 |
| §4 severity, gates relative to the spec | Task 3 |
| §5 freezing; soak assertion | Tasks 5, 6 |
| §6 the debrief, §8's table, one button | Tasks 7, 8 |
| §7 restart from spawn | Task 10 |
| §8 verification tiers | Tasks 1-11 (Tier 1), 11 (Tier 2), 12 (Tier 3 recorded as outstanding) |
| §9 out of scope | Global Constraints |
| §10 open question 1 (the effect) | Task 9, marked provisional |
| §10 open question 2 (contact figures) | Task 7 — decided yes |
| §10 open question 3 (rename `Impact`) | Task 4 — decided no |

Task 1 is not in the spec: it fell out of the boundary rule once `contactOutcome` needed bank angle. It is recorded here rather than added silently.
