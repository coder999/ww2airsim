# T1: Believable Ground Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tail-dragger taxi, take-off and landing that behave believably, on a gear-layout description standard enough that a tricycle P-38 or a bomber is data, not new code.

**Architecture:** `gear` gains a small layout block (main and third wheel positions, steering mode, brake and torque numbers). A new pure module `src/sim/gearContact.ts` derives the rest pitch and the wheel depth of a pitched body. `groundBodyRates` drives ground pitch toward a target (rest pitch tail-down, level tail-up, rotation on pull) and adds rudder, wheel-steering, differential-brake and torque yaw on top of the air yaw rate. The renderer's drawing-only stance is retired.

**Tech Stack:** TypeScript, vitest, zod (`.strict()` specs), three.js render layer, Playwright Tier 2.

**Spec:** `docs/superpowers/specs/2026-09-28-t1-ground-handling-design.md` (approved 2026-09-28; section 8 records four planning-time simplifications). Read it and the ground-handling map in section "Code map" below before Task 1.

**Ledger:** write `.superpowers/sdd/2026-09-28-t1-ground-handling/progress.md` (gitignored) and record every ruling in it, as `CLAUDE.md` requires.

**Viewing checkpoints (Mark decides at plan review):** proposed after Task 4 (Phase A: tail-up, rotation, rest attitude) and after Task 6 (Phase B: taxi and yaw). If Mark does not answer, run unattended and collect the captures in the handoff (`CLAUDE.md`, "How Mark works").

## Global Constraints

- `src/sim` never imports `render/`, `input/`, `assists/`, `audio/`, Node core or a rendering library (`tests/architecture/boundary.test.ts`).
- Aircraft schema objects are `.strict()`; every new field is required, no defaults that hide a missing value.
- Determinism: no `Math.random`, no wall clock in `src/sim`.
- Plan 11a rulings hold: `restOnSurface` never gains energy; `lateralGripSeconds` stays so a ground loop remains possible.
- R36: a gap against a graded card is reported, never closed by tuning a coefficient to pass it. Graded-card tolerances only tighten. Coefficients that no card grades (every new `gear` number below) are ESTIMATES and may be adjusted for feel, with the change recorded in the ledger.
- US spelling in new prose and identifiers.
- `npm run verify` ends every task: `rc=$?` captured directly, never gated on a grepped pipeline. Full suites and `verify` run through `remote-run` (`remote-run npm run verify`); on nexus run only the files you touch.
- Never `git clean -fdx` (275 MB of terrain data). Never push `main`, merge, or deploy unasked. A worktree branch may be pushed.
- Before writing any file under `docs/`, check the path and `git log` for it: a parallel session has overwritten a plan at the same path before.

## Review Focus

Failure modes the spec implies but no obvious task test exercises. Each has a test in the task named.

1. A non-finite ground speed, throttle or pitch input must fail toward tail down and no steering, never toward extra authority (Task 3, Task 5).
2. Touchdown at a pitch above the tail-strike limit must not snap the attitude in one tick (Task 3).
3. A tricycle layout (nose wheel ahead of the mains) must rest at level and not derive a nonsense angle (Task 1, Task 7).
4. A retracted-gear belly landing and a landing on water must not receive wheel steering or tail-up behavior (existing `wheelsDownStart`/`onLandStart` gate; Task 3 keeps a test).
5. Moving-deck contact must keep working, since the deck shares `supportedContact` (Task 2, carrier tests in Task 4).

## Code map (from the 2026-09-28 read)

- Gear schema: `src/sim/flight/schema.ts:308-364`. Gear blocks: `content/aircraft/{f6f-hellcat,a6m2-zero,f4f-wildcat}.json`.
- Ground physics: `src/sim/ground.ts`: `onGround` (108), `restOnSurface` (201), `supportedContact` (446), `groundBodyRates` (551), `lateralGripAfter` (602), `rollingResistanceN` (63).
- Where ground rates apply: `src/sim/flight/model.ts:663-665` (`groundBodyRates(spec, state, controls, ratesWithStall, startGround.velocity)`), gated on `startGround !== null && onGroundStart && wheelsDownStart && onLandStart`. Attitude is integrated from `bodyRates` by `qIntegrateBodyRates` (line 666). `DT = 1/60` is exported from `model.ts:33`.
- Callers of `gear.heightM` as wheel depth: `src/sim/ground.ts:109,207`, `src/sim/landing.ts:91`, `src/sim/paddles.ts:88`, `src/sim/mission/respot.ts:29`, `src/render/frame.ts:454`, `src/render/main.ts:2419`, `src/render/hangar/models.ts:217`, `tools/testcards/measure.ts:460`, `tools/soak/run.ts:563,672,756`, `tools/autopilot/approach.ts:131`.
- Parked attitude: `src/sim/world/airfields.ts:154` (`parkedAttitude`), used at `src/sim/scenario.ts:588`; `stateOnDeck` for decks.
- Render stance (to retire): `src/render/scene/stance.ts` (`MODEL_STANCE`, `tailDownFraction`, `stanceTiltRad`, `drawnPose`), used at `src/render/main.ts:2419`.
- Controls: `src/sim/flight/state.ts:4`. Pitch positive = nose up; yaw positive = nose right; `bodyRates` are `{x: roll, y: yaw, z: pitch}`, and rate `y` is NEGATIVE when yawing right; rate `z` positive = nose up. Nose-up pitch is rotation about body +Z (`qFromAxisAngle(v3(0,0,1), +θ)`); `attitudeAngles(state).pitchRad` is positive nose up.
- Bindings: `src/input/bindings.ts:91` (`brakes: ['KeyB']`); `E` is `fireRockets` and `Q` is mute, so differential brakes need other keys (Task 5 picks from the free list).
- Auto-rudder: `src/assists/index.ts:673` (`autoRudder(state, spec, controls, dt)`), called from `applyAssists` at ~line 348.

## File Structure

- Create `src/sim/gearContact.ts`: pure geometry (`restPitchRad`, `wheelDepthM`, `wheelDepthOf`). One responsibility, imported by ground physics, spawn and the checks.
- Modify `src/sim/flight/schema.ts`, the three aircraft JSONs: layout data.
- Modify `src/sim/ground.ts`: depth-aware `onGround`/`restOnSurface`; new `groundBodyRates`.
- Modify `src/sim/flight/model.ts`, `state.ts`: pass `dt`, brake channels.
- Modify the depth callers listed above.
- Modify `src/render/scene/stance.ts` (reduce to `MODEL_STANCE`), `src/render/main.ts`.
- Modify `src/input/bindings.ts`, `src/render/frame.ts`, `src/assists/index.ts`.
- Create `tests/sim/gearContact.test.ts`, `tests/sim/ground/conformance.test.ts`, `tests/sim/ground/fixtures.ts`, `tests/sim/ground/taxi.test.ts`.
- Modify docs: `docs/aircraft.md`, a new `docs/handoff/`, the spec section 15 row, README.

---

## Phase A: attitude

### Task 1: Gear layout data and pure geometry

**Files:**
- Create: `src/sim/gearContact.ts`
- Create: `tests/sim/gearContact.test.ts`
- Modify: `src/sim/flight/schema.ts:308-364` (gear block)
- Modify: `content/aircraft/f6f-hellcat.json:66-75`, `a6m2-zero.json:37-46`, `f4f-wildcat.json:78-87`
- Modify: `tests/sim/flight/schema.test.ts:35-36` (its gear fixture)
- Scratch (deleted before commit): `tests/tools/models/_tailpoint.scratch.test.ts`

**Interfaces:**
- Produces (used by Tasks 2-7):
  ```ts
  // src/sim/gearContact.ts
  import type { AircraftSpec } from './flight/schema.js'
  import type { AircraftState } from './flight/state.js'
  export type GearSpec = AircraftSpec['gear']
  export function restPitchRad(gear: GearSpec): number          // nose-up positive
  export function wheelDepthM(gear: GearSpec, pitchRad: number): number // metres below the body origin
  export function wheelDepthOf(spec: AircraftSpec, state: AircraftState): number
  ```
- New required `gear` fields (this task adds them and keeps the two old ones until Tasks 3 and 5 replace their readers):
  `layout: 'taildragger' | 'tricycle'`, `mainX: number`, `thirdX: number`, `thirdHeightM: number`, `thirdSteering: 'caster' | 'casterLock' | 'steered'`, `steerYawRateDegPerSec: number` (>= 0), `steerLockSpeedMps: number` (> 0), `differentialBrakes: boolean`, `brakeYawRateDegPerSec: number` (>= 0), `tailLiftSpeedMps: number` (> 0), `propWashSpeedMps: number` (>= 0), `torqueYawRateDegPerSec: number` (signed, positive swings the nose right).

Depth convention, used throughout: a wheel whose ground point is at body `(x, -h)` at level attitude sits `h*cos(θ) - x*sin(θ)` metres below the origin when the body is pitched nose-up by θ. The lowest wheel carries the airplane, so `wheelDepthM` is the max over the two. The angle at which both touch is `atan((hMain - hThird) / (xMain - xThird))`.

- [ ] **Step 1: Write the failing geometry test**

Create `tests/sim/gearContact.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { restPitchRad, wheelDepthM, type GearSpec } from '../../src/sim/gearContact.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { MODEL_STANCE } from '../../src/render/scene/stance.js'

const DEG = Math.PI / 180
const deg = (r: number) => r / DEG

const base = loadAircraftSpec('f6f-hellcat').gear
const tricycle: GearSpec = {
  ...base,
  layout: 'tricycle',
  mainX: -0.5,
  thirdX: 4,
  thirdHeightM: base.heightM,
  thirdSteering: 'steered',
}

describe('gear contact geometry', () => {
  it('a tricycle with equal wheel depths rests level', () => {
    expect(restPitchRad(tricycle)).toBeCloseTo(0, 12)
  })

  it('a tricycle with a shorter nose leg rests nose-down (negative)', () => {
    expect(restPitchRad({ ...tricycle, thirdHeightM: base.heightM - 0.2 })).toBeLessThan(0)
  })

  it('at the rest pitch both wheels are at the same depth', () => {
    const rest = restPitchRad(base)
    const main = base.heightM * Math.cos(rest) - base.mainX * Math.sin(rest)
    const third = base.thirdHeightM * Math.cos(rest) - base.thirdX * Math.sin(rest)
    expect(main).toBeCloseTo(third, 9)
    expect(wheelDepthM(base, rest)).toBeCloseTo(main, 9)
  })

  it('level, a taildragger stands on its mains: the depth is heightM', () => {
    expect(wheelDepthM(base, 0)).toBeCloseTo(base.heightM, 9)
  })

  it('pitched past the rest angle the tail wheel is the lowest point', () => {
    const past = restPitchRad(base) + 5 * DEG
    const third = base.thirdHeightM * Math.cos(past) - base.thirdX * Math.sin(past)
    expect(wheelDepthM(base, past)).toBeCloseTo(third, 9)
  })
})

describe.each([['f6f-hellcat', 'f6f-hellcat'], ['f4f-wildcat', 'wildcat'], ['a6m2-zero', 'a6m2-zero']] as const)(
  '%s layout against the drawing',
  (id, model) => {
    const gear = loadAircraftSpec(id).gear
    it('derives the rest pitch the drawn model measures, within 0.25 degrees', () => {
      expect(Math.abs(deg(restPitchRad(gear) - MODEL_STANCE[model]!.tailDownPitchRad))).toBeLessThanOrEqual(0.25)
    })
    it('puts the mains where the drawn model has them, within 0.05 m', () => {
      expect(Math.abs(gear.mainX - MODEL_STANCE[model]!.mainWheelXM)).toBeLessThanOrEqual(0.05)
    })
    it('has the center of gravity (the body origin) between the wheels', () => {
      expect(gear.thirdX).toBeLessThan(0)
      expect(gear.mainX).toBeGreaterThan(0)
    })
  },
)
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/sim/gearContact.test.ts`
Expected: FAIL, cannot resolve `../../src/sim/gearContact.js`.

- [ ] **Step 3: Write the module**

Create `src/sim/gearContact.ts`:

```ts
import { attitudeAngles } from './flight/attitude.js'
import type { AircraftSpec } from './flight/schema.js'
import type { AircraftState } from './flight/state.js'

export type GearSpec = AircraftSpec['gear']

const depthBelowOriginM = (xM: number, heightM: number, pitchRad: number): number =>
  heightM * Math.cos(pitchRad) - xM * Math.sin(pitchRad)

/** Nose-up pitch, radians, at which both the main wheels and the third wheel
 *  touch level ground; negative for a nose wheel on a shorter leg. Throws on a
 *  layout whose wheels share an x, which has no such angle. */
export function restPitchRad(gear: GearSpec): number {
  const run = gear.mainX - gear.thirdX
  if (run === 0) throw new Error('gear.mainX and gear.thirdX must differ')
  return Math.atan((gear.heightM - gear.thirdHeightM) / run)
}

/** Metres from the body origin down to the lowest wheel, with the body pitched
 *  nose-up by `pitchRad`. The lowest wheel is the one carrying the airplane. */
export function wheelDepthM(gear: GearSpec, pitchRad: number): number {
  return Math.max(
    depthBelowOriginM(gear.mainX, gear.heightM, pitchRad),
    depthBelowOriginM(gear.thirdX, gear.thirdHeightM, pitchRad),
  )
}

export function wheelDepthOf(spec: AircraftSpec, state: AircraftState): number {
  return wheelDepthM(spec.gear, attitudeAngles(state).pitchRad)
}
```

- [ ] **Step 4: Add the schema fields**

In `src/sim/flight/schema.ts`, inside the `gear: z.object({ ... }).strict()` block, after `heightM: positive,` add the fields below. First look at how the file defines `positive` and `finite` (line ~299) and add a `nonNegative` helper beside them if none exists (`const nonNegative = finite.refine((n) => n >= 0, { message: 'must not be negative' })`).

```ts
    /** Undercarriage layout. `taildragger`: third wheel behind the mains.
     *  `tricycle`: third (nose) wheel ahead of them. */
    layout: z.enum(['taildragger', 'tricycle']),
    /** Body-frame x, metres, of the main wheels' ground point. The body origin
     *  stands in for the center of gravity; `heightM` is their depth. */
    mainX: finite,
    /** Body-frame x, metres, of the tail or nose wheel's ground point. */
    thirdX: finite,
    /** Depth, metres below the body origin at level attitude, of the third
     *  wheel's ground point. With `mainX`/`heightM`/`thirdX` it fixes the
     *  parked pitch: `restPitchRad` in `src/sim/gearContact.ts`. */
    thirdHeightM: finite,
    /** `caster` swivels free and steers nothing; `casterLock` steers slowly and
     *  locks straight above `steerLockSpeedMps`; `steered` follows the rudder. */
    thirdSteering: z.enum(['caster', 'casterLock', 'steered']),
    /** Yaw rate, deg/s, of wheel steering at full rudder and rest. 0 for `caster`. */
    steerYawRateDegPerSec: nonNegative,
    /** Ground speed, m/s, above which a `casterLock` wheel is fully locked. */
    steerLockSpeedMps: positive,
    /** Whether the left and right brakes act separately. */
    differentialBrakes: z.boolean(),
    /** Yaw rate, deg/s, of one brake held fully at rest. */
    brakeYawRateDegPerSec: nonNegative,
    /** Effective airflow speed, m/s (ground speed combined with prop wash),
     *  at which the elevator can hold the tail fully up. A scale for a smooth
     *  curve, not a gate. */
    tailLiftSpeedMps: positive,
    /** Airflow speed the propeller adds over the tail at full throttle, m/s. */
    propWashSpeedMps: nonNegative,
    /** Yaw rate, deg/s, the engine torque swings the nose at full throttle and
     *  rest. Positive swings right; 0 for counter-rotating propellers. */
    torqueYawRateDegPerSec: finite,
```

Then add a gear-level check by changing `}).strict(),` for the gear object to `}).strict().superRefine((g, ctx) => { ... })`:

```ts
  .superRefine((g, ctx) => {
    const ok = g.layout === 'taildragger'
      ? g.thirdX < 0 && g.mainX > 0
      : g.mainX < 0 && g.thirdX > 0
    if (!ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `a ${g.layout} needs the body origin (the center of gravity) between its wheels, `
          + `with the third wheel ${g.layout === 'taildragger' ? 'behind' : 'ahead of'} the mains`,
      })
    }
  }),
```

- [ ] **Step 5: Measure the third wheel from the drawn models**

The drawn model is the only source for the third-wheel point (the specs carried none). Create the scratch test `tests/tools/models/_tailpoint.scratch.test.ts`:

```ts
import { it } from 'vitest'
import { drawnPoints } from './_drawnPoints.js'

it.each(['f6f-hellcat', 'wildcat', 'a6m2-zero'])('%s tail point', async (model) => {
  const pts = await drawnPoints(model)
  const xs = pts.map((p) => p[0])
  const [lo, hi] = [Math.min(...xs), Math.max(...xs)]
  const main = pts.filter((p) => p[0] > lo + 0.25 * (hi - lo)).reduce((a, p) => (p[1] < a[1] ? p : a))
  const aft = pts.filter((p) => p[0] < main[0] - 1)
  const touch = aft.reduce((a, p) => (Math.atan2(p[1] - main[1], main[0] - p[0]) < Math.atan2(a[1] - main[1], main[0] - a[0]) ? p : a))
  console.log(model, JSON.stringify({ mainX: +main[0].toFixed(3), mainDepth: +(-main[1]).toFixed(3), thirdX: +touch[0].toFixed(3), thirdHeightM: +(-touch[1]).toFixed(3) }))
})
```

Run: `npx vitest run tests/tools/models/_tailpoint.scratch.test.ts`
Expected: three lines of JSON. `mainDepth` must equal each spec's `gear.heightM` within 0.05 m (the existing `tests/tools/models/stance.test.ts` already holds that). Record all three lines in the ledger.

- [ ] **Step 6: Write the content**

In each aircraft JSON add the following inside `"gear"`, using the measured `mainX`, `thirdX`, `thirdHeightM` from Step 5 (round to 3 decimals) and the ESTIMATE values below. Do NOT delete `tailUpSpeedMps` or `tailwheelYawRateDegPerSec` yet.

| Field | F6F | F4F | A6M2 |
| --- | --- | --- | --- |
| layout | taildragger | taildragger | taildragger |
| mainX / thirdX / thirdHeightM | measured | measured | measured |
| thirdSteering | casterLock | caster | casterLock |
| steerYawRateDegPerSec | 20 | 0 | 5 |
| steerLockSpeedMps | 8 | 8 | 8 |
| differentialBrakes | true | true | true |
| brakeYawRateDegPerSec | 12 | 12 | 10 |
| tailLiftSpeedMps | 28 | 25 | 24 |
| propWashSpeedMps | 12 | 11 | 10 |
| torqueYawRateDegPerSec | -3 | -3.5 | -2.5 |

Each is an ESTIMATE except the three measured fields and the F4F's `caster` ([HB]: the F4F's tailwheel is not steerable). The torque sign follows a clockwise-from-cockpit propeller swinging the nose left; the Zero's direction is itself an ESTIMATE. Append a sentence to each file's `reference.source` string naming these fields as measured (with the date, 2026-09-28, and the method: `drawnPoints`, the first aft point to touch when pitched about the mains) or ESTIMATE. Do not restate the long existing text; append only.

Update `tests/sim/flight/schema.test.ts:35-36` so its gear fixture includes every new field (copy the F6F values above with `mainX: 0.62, thirdX: -5.0, thirdHeightM: 1.55` if the measured figures are not to hand).

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/sim/gearContact.test.ts tests/sim/flight/schema.test.ts tests/tools/models/stance.test.ts`
Expected: PASS. If `derives the rest pitch the drawn model measures` fails for the Zero by more than 0.25 degrees, the Zero's third wheel is measured wrongly (its tailwheel is 0.01 m deeper than the mains): report it in the ledger and fix the measurement, not the tolerance.

- [ ] **Step 8: Delete the scratch test and commit**

```bash
rm tests/tools/models/_tailpoint.scratch.test.ts
git add src/sim/gearContact.ts src/sim/flight/schema.ts content/aircraft tests/sim/gearContact.test.ts tests/sim/flight/schema.test.ts
git commit -m "T1: gear layout in the specs and the pure contact geometry

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: Contact height follows pitch; spawn at the rest attitude

**Files:**
- Modify: `src/sim/ground.ts:108-112` (`onGround`), `:201-260` (`restOnSurface`)
- Modify: `src/sim/landing.ts:91`, `src/sim/paddles.ts:88`, `src/sim/mission/respot.ts:29`, `tools/autopilot/approach.ts:131`, `tools/testcards/measure.ts:460`, `tools/soak/run.ts:563,672,756`, `src/render/frame.ts:454`
- Modify: `src/sim/world/airfields.ts:154` (`parkedAttitude`), `src/sim/scenario.ts:588` and the deck spawn (`stateOnDeck`), `src/render/spawn.ts`
- Test: `tests/sim/ground.test.ts`

**Interfaces:**
- Consumes: `wheelDepthOf`, `wheelDepthM`, `restPitchRad` (Task 1).
- Produces: `parkedAttitude(a: Airfield, restPitchRad: number): Quat` (yaw about +y, then nose-up pitch about body +z: `qMul(yaw, qFromAxisAngle(v3(0,0,1), restPitchRad))`).

Rule for every site: replace a wheel-height computation `state.position.y - spec.gear.heightM` with `state.position.y - wheelDepthOf(spec, state)`, and a spawn height `ground + spec.gear.heightM` with `ground + wheelDepthM(spec.gear, restPitchRad(spec.gear))` when the state is spawned at the rest attitude.

- [ ] **Step 1: Write the failing tests**

Append to `tests/sim/ground.test.ts` (it already imports `f6f`, `createState`, `v3`, `qFromAxisAngle`, `onGround`, `restOnSurface`):

```ts
import { restPitchRad, wheelDepthM } from '../../src/sim/gearContact.js'

describe('contact height follows pitch (T1)', () => {
  const rest = restPitchRad(f6f.gear)
  const restAttitude = qFromAxisAngle(v3(0, 0, 1), rest)
  const depthAtRest = wheelDepthM(f6f.gear, rest)

  it('an airplane parked at the rest attitude is on the ground at ground + the rest depth', () => {
    const parked = createState({ position: v3(0, depthAtRest, 0), attitude: restAttitude, gearFraction: 1 })
    expect(onGround(f6f, parked, 0)).toBe(true)
  })

  it('the same origin height is airborne once the tail is up, because the mains stand higher', () => {
    const level = createState({ position: v3(0, depthAtRest, 0), gearFraction: 1 })
    expect(wheelDepthM(f6f.gear, 0)).not.toBeCloseTo(depthAtRest, 3)
    expect(onGround(f6f, level, 0)).toBe(wheelDepthM(f6f.gear, 0) === depthAtRest)
  })

  it('restOnSurface seats a sinking airplane at the depth for its own pitch', () => {
    const sinking = createState({
      position: v3(0, depthAtRest - 0.1, 0),
      velocity: v3(20, -0.5, 0),
      attitude: restAttitude,
      gearFraction: 1,
    })
    const seated = restOnSurface(f6f, sinking, 0)
    expect(seated.position.y).toBeCloseTo(depthAtRest, 9)
    expect(seated.velocity.y).toBe(0)
  })

  it('never gains energy when the ground rises under it (unchanged rule)', () => {
    const s = createState({ position: v3(0, depthAtRest, 0), velocity: v3(30, 0, 0), attitude: restAttitude, gearFraction: 1 })
    const after = restOnSurface(f6f, s, 0.1)
    expect(length(after.velocity)).toBeLessThanOrEqual(length(s.velocity))
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/sim/ground.test.ts -t "contact height follows pitch"`
Expected: FAIL (`onGround` still uses `heightM`).

- [ ] **Step 3: Implement `onGround` and `restOnSurface`**

In `src/sim/ground.ts` add `import { wheelDepthOf } from './gearContact.js'` and change:

```ts
export function onGround(spec: AircraftSpec, state: AircraftState, groundHeightM: number): boolean {
  const contactHeightM = state.position.y - wheelDepthOf(spec, state)
  return contactHeightM - groundHeightM <= GROUND_CONTACT_TOLERANCE_M
    && contactHeightM - groundHeightM >= -GROUND_CONTACT_TOLERANCE_M
}
```

and in `restOnSurface`: `const contactTargetM = groundHeightM + wheelDepthOf(spec, state)`. Update the two doc comments that say `position.y - spec.gear.heightM` to say the wheel depth for the airplane's current pitch (`wheelDepthOf`), and that `gear.heightM` is the level-attitude depth.

- [ ] **Step 4: Run to verify the new tests pass**

Run: `npx vitest run tests/sim/ground.test.ts -t "contact height follows pitch"`
Expected: PASS.

- [ ] **Step 5: Update the other depth sites**

Apply the rule above at each site listed under Files. For `parkedAttitude`:

```ts
export const parkedAttitude = (a: Airfield, restPitchRad: number): Quat =>
  qMul(qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - runwayHeadingRad(a)), qFromAxisAngle(v3(0, 0, 1), restPitchRad))
```

(import `qMul`). Update `src/sim/scenario.ts:588` to `parkedAttitude(field, restPitchRad(spec.gear))`, and the deck spawn `stateOnDeck` and `src/sim/mission/respot.ts:29` to seat at `wheelDepthM(spec.gear, restPitchRad(spec.gear))` with the same nose-up pitch. Update the doc comment in `src/render/spawn.ts:113` that describes the literal attitude. Grep for every caller: `grep -rn "parkedAttitude" src tests tools` and fix each, including tests.

In `tools/testcards/measure.ts:460` spawn the airplane at the rest attitude: `...spawn(spec, RUNWAY_HEIGHT_M + wheelDepthM(spec.gear, rest), 0)` with `attitude: qFromAxisAngle(v3(0,0,1), rest)` where `rest = restPitchRad(spec.gear)`. Update its doc comment: the airplane no longer "never leaves level"; the sim now lifts the tail itself with the stick neutral (Task 3).

- [ ] **Step 6: Run the touched suites**

Run: `npx vitest run tests/sim/ground.test.ts tests/sim/landing.test.ts tests/sim/paddles.test.ts tests/sim/scenario.test.ts tests/sim/carrierLanding.test.ts tests/sim/trap.test.ts tests/tools/approach.test.ts`
Expected: PASS except tests whose numbers move because a wheel height changed with pitch. Each failing assertion: read the delta. If it is under 0.1 m and explained by `wheelDepthOf` at that test's pitch, update the expected value and record the old and new numbers in the ledger. If it is larger or unexplained, stop and report; do not absorb it (R36).

- [ ] **Step 7: Commit**

```bash
git add -A src tests tools
git commit -m "T1: contact height follows pitch; spawn at the derived rest attitude

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: Ground pitch from airflow, stick and the rest attitude

**Files:**
- Modify: `src/sim/ground.ts:551-571` (`groundBodyRates` and its doc comment)
- Modify: `src/sim/flight/model.ts:663-665` (pass `dt`), and its two comments mentioning `tailUpSpeedMps` (lines ~170, ~650)
- Modify: `src/render/scene/stance.ts` (retire the tilt), `src/render/main.ts:2419` and `:2425` neighborhood
- Delete: the `tailDownFraction`/`stanceTiltRad`/`drawnPose` tests in `tests/render/stance.test.ts`
- Modify: `tests/sim/ground.test.ts` (control regime, lines ~325-398, 713)
- Modify: schema and JSONs: remove `tailUpSpeedMps`

**Interfaces:**
- Consumes: `restPitchRad` (Task 1), `attitudeAngles`.
- Produces: `groundBodyRates(spec, state, controls, airRates, dt, surfaceVelocity = ZERO): Vec3`, rates `{x: 0, y, z}`; `z` is the ground pitch rate. (Task 5 replaces the `y` computation.) `dt` is now the fifth parameter.

Pitch model, in words. `airflow = hypot(groundSpeed, propWashSpeedMps * throttle)`; `lift = min(1, (airflow / tailLiftSpeedMps)^2)`. Three rates add: `settle = (1 - lift) * 1.5 * (rest - pitch)` sinks the tail toward the rest attitude as airflow dies; `raise = -lift * (1 - pull) * 1.0 * pitch` (only while `pitch > 0`) lifts the tail toward level when the stick is not held back; `rotate = lift * pitchInput * maxPitchRate` rotates on the mains when the stick is pulled (or pushes the nose down). The result is limited so the pitch stays between `floor = min(rest, 0)` and `ceiling = rest` (taildragger) or `rest + 12 degrees` (tricycle), with any correction limited to 15 deg/s so a touchdown above the ceiling settles instead of snapping.

- [ ] **Step 1: Write the failing tests**

Replace the `describe('the ground control regime', ...)` pitch tests in `tests/sim/ground.test.ts` (keep the roll test; the yaw tests are replaced in Task 5). Add helpers and tests:

```ts
import { attitudeAngles } from '../../src/sim/flight/attitude.js'

const rest = restPitchRad(f6f.gear)
const atPitch = (pitchRad: number, speed: number) =>
  createState({
    position: v3(0, 0, 0),
    velocity: v3(speed, 0, 0),
    attitude: qFromAxisAngle(v3(0, 0, 1), pitchRad),
    gearFraction: 1,
  })
const neutral = { pitch: 0, roll: 0, yaw: 0, throttle: 1 }
const groundPitchRate = (pitchRad: number, speed: number, controls = neutral) =>
  groundBodyRates(f6f, atPitch(pitchRad, speed), controls, v3(0, 0, 0), DT).z

describe('ground pitch (T1)', () => {
  it('holds the rest attitude at a standstill on idle', () => {
    expect(groundPitchRate(rest, 0, { ...neutral, throttle: 0 })).toBeCloseTo(0, 9)
  })

  it('sinks a raised tail back toward the rest attitude when there is no airflow', () => {
    expect(groundPitchRate(rest - 0.05, 0, { ...neutral, throttle: 0 })).toBeGreaterThan(0)
  })

  it('lifts the tail at speed with the stick neutral', () => {
    expect(groundPitchRate(rest, f6f.gear.tailLiftSpeedMps * 1.2)).toBeLessThan(0)
  })

  it('a held-back stick keeps the tail down at speed (three-point take-off)', () => {
    expect(groundPitchRate(rest, f6f.gear.tailLiftSpeedMps * 1.2, { ...neutral, pitch: 1 })).toBeCloseTo(0, 9)
  })

  it('never pitches below level with the tail up, however hard the stick is pushed', () => {
    const rate = groundPitchRate(0, f6f.gear.tailLiftSpeedMps * 1.2, { ...neutral, pitch: -1 })
    expect(rate * DT).toBeGreaterThanOrEqual(-1e-12)
  })

  it('rotates on the mains when pulled with the tail already up', () => {
    expect(groundPitchRate(0, f6f.gear.tailLiftSpeedMps * 1.2, { ...neutral, pitch: 1 })).toBeGreaterThan(0)
  })

  it('cannot rotate past the tail-strike attitude', () => {
    const next = rest + groundPitchRate(rest, f6f.gear.tailLiftSpeedMps * 1.5, { ...neutral, pitch: 1 }) * DT
    expect(next).toBeLessThanOrEqual(rest + 1e-9)
  })

  it('a touchdown well above the tail-strike attitude settles at a bounded rate, not in one tick', () => {
    const rate = groundPitchRate(rest + 0.1, 30, { ...neutral, throttle: 0, pitch: 1 })
    expect(rate).toBeLessThan(0)
    expect(Math.abs(rate)).toBeLessThanOrEqual((15 * Math.PI) / 180 + 1e-9)
  })

  it('reads a non-finite speed, throttle or stick as tail down and no lift', () => {
    const nanSpeed = atPitch(rest - 0.05, Number.NaN)
    const rate = groundBodyRates(f6f, nanSpeed, neutral, v3(0, 0, 0), DT).z
    expect(rate).toBeGreaterThan(0)
    const noThrottle = groundBodyRates(f6f, atPitch(rest - 0.05, 0), { ...neutral, throttle: Number.NaN }, v3(0, 0, 0), DT).z
    expect(Number.isFinite(noThrottle)).toBe(true)
  })

  it('roll stays exactly zero', () => {
    expect(groundBodyRates(f6f, atPitch(0, 20), { ...neutral, roll: 1 }, v3(1.2, 0.4, 0.8), DT).x).toBe(0)
  })
})
```

Also update the two existing calls that pass `surfaceVelocity` positionally (line ~713): `groundBodyRates(f6f, s, controls, v3(0,0,0), DT, ZERO)` versus `groundBodyRates(f6f, s, controls, v3(0,0,0), DT)`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/sim/ground.test.ts -t "ground pitch"`
Expected: FAIL (signature, and the old pitch gate).

- [ ] **Step 3: Implement**

Replace `groundBodyRates` in `src/sim/ground.ts`. The yaw term is unchanged in this task except that the fade and the tailwheel term now read `tailLiftSpeedMps` in place of `tailUpSpeedMps`; Task 5 replaces it.

```ts
const GROUND_PITCH_SETTLE_PER_S = 1.5
const GROUND_PITCH_RAISE_PER_S = 1.0
const GROUND_PITCH_CORRECTION_MAX_RAD_PER_S = 15 * GROUND_DEG
const TRICYCLE_ROTATION_LIMIT_RAD = 12 * GROUND_DEG

const unit = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)
const signedUnit = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(-1, n)) : 0)

export function groundBodyRates(
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
  airRates: Vec3,
  dt: number,
  surfaceVelocity: Vec3 = ZERO,
): Vec3 {
  const { gear } = spec
  const rel = sub(state.velocity, surfaceVelocity)
  const groundSpeed = length(v3(rel.x, 0, rel.z))
  const validSpeed = Number.isFinite(groundSpeed)
  const speed = validSpeed ? groundSpeed : 0
  const throttle = unit(controls.throttle)
  const pitchInput = signedUnit(controls.pitch)
  const pull = Math.max(0, pitchInput)

  const airflowMps = Math.hypot(speed, gear.propWashSpeedMps * throttle)
  const lift = validSpeed ? Math.min(1, (airflowMps / gear.tailLiftSpeedMps) ** 2) : 0

  const rest = restPitchRad(gear)
  const floor = Math.min(rest, 0)
  const ceiling = gear.layout === 'tricycle' ? rest + TRICYCLE_ROTATION_LIMIT_RAD : rest
  const pitch = attitudeAngles(state).pitchRad

  const settle = (1 - lift) * GROUND_PITCH_SETTLE_PER_S * (rest - pitch)
  const raise = pitch > 0 ? -lift * (1 - pull) * GROUND_PITCH_RAISE_PER_S * pitch : 0
  const rotate = lift * pitchInput * spec.rates.maxPitchRateDegPerSec * GROUND_DEG
  let pitchRate = settle + raise + rotate

  const max = GROUND_PITCH_CORRECTION_MAX_RAD_PER_S
  if (pitch + pitchRate * dt > ceiling) pitchRate = Math.max(-max, (ceiling - pitch) / dt)
  if (pitch + pitchRate * dt < floor) pitchRate = Math.min(max, (floor - pitch) / dt)

  const fade = validSpeed ? Math.min(1, Math.max(0, 1 - groundSpeed / gear.tailLiftSpeedMps)) : 1
  const tailwheelYaw = -signedUnit(controls.yaw) * gear.tailwheelYawRateDegPerSec * GROUND_DEG * fade

  return v3(0, tailwheelYaw + airRates.y, pitchRate)
}
```

Add imports: `attitudeAngles` from `./flight/attitude.js`, `restPitchRad` from `./gearContact.js`. Rewrite the function's doc comment: delete the paragraph that rules a speed gate over a moment model, and describe the three rates above plus the bounds; keep the roll paragraph and the "sum, not switch" continuity note for yaw.

In `src/sim/flight/model.ts:664` pass `dt`: `groundBodyRates(spec, state, controls, ratesWithStall, dt, startGround.velocity)`. Update the two comments that cite `tailUpSpeedMps` (lines ~170 and ~650) to say the ground pitch is driven toward the rest attitude and level by `groundBodyRates`.

- [ ] **Step 4: Run to verify the pitch tests pass**

Run: `npx vitest run tests/sim/ground.test.ts -t "ground pitch"`
Expected: PASS. If `holds the rest attitude at a standstill on idle` fails at ~1e-9, the rest pitch and the derived attitude disagree: check `restPitchRad` first; do not loosen the test.

- [ ] **Step 5: Retire the drawn stance**

The sim now carries the pitch, so the drawing draws the sim. In `src/render/scene/stance.ts` delete `TAIL_SETTLED_FRACTION`, `tailDownFraction`, `stanceTiltRad`, `drawnPose` and their imports, and rewrite the header comment to: "Each drawn model's measured ground stance, the reference `tests/tools/models/stance.test.ts` and `tests/sim/gearContact.test.ts` hold the specs' wheel layout to. The drawing itself is posed by the sim attitude (T1, 2026-09-28)." Keep `Stance` and `MODEL_STANCE`. In `src/render/main.ts` around line 2419 remove the `stanceTiltRad`/`drawnPose` use and draw the interpolated pose directly; remove now-unused imports. Delete the `tailDownFraction`, `stanceTiltRad` and `drawnPose` tests in `tests/render/stance.test.ts` (keep any that test `MODEL_STANCE` coverage: every spec's `view.model` has an entry).

- [ ] **Step 6: Remove `tailUpSpeedMps`**

Delete the field from the schema gear block, the three JSONs, the `schema.test.ts` fixture, and the comments referencing it in `tools/testcards/measure.ts:421`, `tests/sim/flight/negativeG.test.ts:67,85`. In `negativeG.test.ts`, read lines 60-90 first: it depends on pitch being zero below the gate; if the test now behaves differently, keep its intent (the airplane stays on the ground without the engine) and adjust the setup, recording the reason in the ledger.

- [ ] **Step 7: Typecheck and run the touched suites**

Run: `npx tsc --noEmit && npx vitest run tests/sim/ground.test.ts tests/render/stance.test.ts tests/sim/flight tests/render/frame.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A src content tests tools
git commit -m "T1: ground pitch from airflow, stick and the rest attitude; retire the drawn stance

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: Re-grade the cards and pins (Phase A gate)

**Files:**
- Modify: whatever the run shows moved, among `tests/sim/testcards/*.test.ts`, `tests/sim/landing.test.ts` (inline snapshot at ~197), `tests/sim/carrierLanding.test.ts`, `tests/sim/trap.test.ts`, `tests/sim/terrainContact.test.ts`, `tests/sim/soak.test.ts`, `tests/render/runway.test.ts`, `tests/e2e/takeoff.spec.ts`
- Modify: `tools/testcards/measure.ts` (comments only, if not done in Task 2)

- [ ] **Step 1: Run the full suite on ryzen**

Run: `remote-run npm run verify; echo rc=$?` (capture `rc` directly).
Expected: some failures. List every failing test in the ledger with old and new value.

- [ ] **Step 2: Triage each failure, one at a time**

For each: state the cause in the ledger, then choose exactly one of:
1. **Explained and small** (a wheel or origin height that moved by centimeters; a take-off roll that moved because the tail now rises from airflow): update the expected value and record old and new.
2. **A graded card** (`f6f.test.ts` take-off card 230.124 m at 2%, currently -0.605%; `f4f`, `a6m`): report the new gap and its direction in the ledger. Do NOT change any coefficient to pull it back inside tolerance (R36). If a card now fails, raise it with Mark at the checkpoint and leave the card failing on the branch only if he agrees; otherwise loosen nothing and report.
3. **Unexplained**, or in golden trajectory or replay tests: stop and report; a golden should not move.

`soak.test.ts` seed 7 is a known marginal failure and is not owned here; if it was failing at `32d8b68` it stays failing and is noted.

- [ ] **Step 3: Tier 2 take-off spec**

Run the take-off spec on nexus's own GPU (a non-measurement run): `sg render -c 'PW_BASE_URL=http://localhost:5176 npm run test:tier2 -- tests/e2e/takeoff.spec.ts'` with a dev server started from this worktree on a free port (`npx vite --port 5176`; check `ss -ltn | grep 5176` first and pick another if held). Expected: PASS. Take three captures for Mark's checkpoint: parked tail-down, mid-roll with the tail up, just after rotation. Save them under `docs/handoff/2026-09-28-t1-shots/`.

- [ ] **Step 4: Commit and, if Mark wants the Phase A checkpoint, send the host**

```bash
git add -A tests tools docs
git commit -m "T1 phase A: re-grade cards and pins for the derived rest attitude and airflow tail-up

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

If the run is attended, stop here: name the host (`ww2airsim.windomlane.org`, serving this worktree only if its vite is the one running there; assert `curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim.windomlane.org/` prints 200), send the captures, and wait. If unattended, continue.

---

## Phase B: steering

### Task 5: Yaw on the ground, differential brakes, torque, auto-rudder off

**Files:**
- Modify: `src/sim/ground.ts` (`groundBodyRates` yaw, `rollingResistanceN` caller)
- Modify: `src/sim/flight/state.ts:4-30` (Controls), `src/sim/flight/model.ts` (`clampFinite` channel list and the rolling-resistance call at ~512)
- Modify: `src/input/bindings.ts` (two new bindings), `src/render/frame.ts:594-611`
- Modify: `src/assists/index.ts:348,673`, and the caller that supplies ground knowledge (see Step 5)
- Modify: schema and JSONs: remove `tailwheelYawRateDegPerSec`
- Test: `tests/sim/ground.test.ts` (replace the yaw block ~355-398), `tests/assists/autoRudder.test.ts`, `tests/input/bindings.test.ts` if present

**Interfaces:**
- Consumes: Task 3's `groundBodyRates` shape.
- Produces: `Controls.brakeLeft?: number`, `Controls.brakeRight?: number` in [0, 1]; `undefined` reads as 0. `applyAssists` gains a ground flag (Step 5).

Yaw model, in words. All terms are in degrees per second, positive = nose right, then negated into the body-rate convention. Let `airflow` as in Task 3, `fade = max(0, 1 - groundSpeed / (1.5 * tailLiftSpeedMps))`. Then:
`rudder = min(1, airflow / tailLiftSpeedMps) * rates.maxYawRateDegPerSec`;
`steer = wheelSteerFraction * steerYawRateDegPerSec` where `wheelSteerFraction` is 1 for `steered`, `max(0, 1 - groundSpeed / steerLockSpeedMps)` for `casterLock`, 0 for `caster`;
`brakes = differentialBrakes ? (brakeRight - brakeLeft) * brakeYawRateDegPerSec : 0`;
`torque = torqueYawRateDegPerSec * throttle * (1 - min(1, groundSpeed / tailLiftSpeedMps))`.
`noseRight = fade * (yawInput * (rudder + steer) + brakes + torque)`; `yaw rate y = -noseRight * pi/180 + airRates.y`. The fade multiple 1.5 is an ESTIMATE; it makes ground yaw hand over to the aerodynamic rudder by about liftoff speed, continuous by construction because the air term is always added.

- [ ] **Step 1: Write the failing tests**

Replace the yaw tests in `tests/sim/ground.test.ts` (the `describe` block containing `fades to zero at tailUpSpeedMps` and its neighbors, lines ~355-398) with:

```ts
describe('ground yaw (T1)', () => {
  const rolling = (speed: number) => createState({ position: v3(0, 0, 0), velocity: v3(speed, 0, 0), attitude: qFromAxisAngle(v3(0, 0, 1), rest), gearFraction: 1 })
  const noAir = v3(0, 0, 0)
  const yawRate = (speed: number, controls: Partial<typeof neutral> & { brakeLeft?: number; brakeRight?: number }, spec = f6f) =>
    groundBodyRates(spec, rolling(speed), { ...neutral, ...controls }, noAir, DT).y
  const noseRightDeg = (y: number) => (-y * 180) / Math.PI

  it('steers at a standstill', () => {
    expect(noseRightDeg(yawRate(0, { yaw: 1, throttle: 0 }))).toBeGreaterThan(0)
    expect(noseRightDeg(yawRate(0, { yaw: -1, throttle: 0 }))).toBeLessThan(0)
  })

  it('does not collapse under power as speed builds (the measured 5.5 -> 1.5 deg/s failure)', () => {
    const at5 = noseRightDeg(yawRate(5, { yaw: 1, throttle: 0.6 }))
    const at15 = noseRightDeg(yawRate(15, { yaw: 1, throttle: 0.6 }))
    expect(at15).toBeGreaterThanOrEqual(3)
    expect(at15).toBeGreaterThan(0.4 * at5)
  })

  it('a locked caster wheel steers nothing above the lock speed; rudder still does', () => {
    const fast = f6f.gear.steerLockSpeedMps * 2
    const withRudder = noseRightDeg(yawRate(fast, { yaw: 1, throttle: 0.6 }))
    const without = noseRightDeg(yawRate(fast, { yaw: 0, throttle: 0.6 }))
    expect(withRudder).toBeGreaterThan(without)
  })

  it('a free caster (F4F) steers only through the rudder', () => {
    const f4f = loadAircraftSpec('f4f-wildcat')
    expect(f4f.gear.thirdSteering).toBe('caster')
    const still = noseRightDeg(groundBodyRates(f4f, rolling(0), { ...neutral, yaw: 1, throttle: 0 }, noAir, DT).y)
    expect(still).toBeCloseTo(0, 9)
  })

  it('differential brakes turn toward the braked side and do nothing on an aircraft without them', () => {
    expect(noseRightDeg(yawRate(4, { brakeRight: 1, throttle: 0 }))).toBeGreaterThan(0)
    expect(noseRightDeg(yawRate(4, { brakeLeft: 1, throttle: 0 }))).toBeLessThan(0)
    const noDiff = { ...f6f, gear: { ...f6f.gear, differentialBrakes: false } }
    expect(noseRightDeg(yawRate(4, { brakeRight: 1, throttle: 0 }, noDiff))).toBeCloseTo(0, 9)
  })

  it('engine torque swings the nose the way torqueYawRateDegPerSec says, and cancels at zero', () => {
    const swing = noseRightDeg(yawRate(2, { throttle: 1 }))
    expect(Math.sign(swing)).toBe(Math.sign(f6f.gear.torqueYawRateDegPerSec))
    const twin = { ...f6f, gear: { ...f6f.gear, torqueYawRateDegPerSec: 0 } }
    expect(noseRightDeg(yawRate(2, { throttle: 1 }, twin))).toBeCloseTo(0, 9)
  })

  it('is continuous with the air yaw rate: the ground terms are gone by the time it flies', () => {
    const air = v3(0, -0.05, 0)
    const fastEnough = f6f.gear.tailLiftSpeedMps * 1.6
    const y = groundBodyRates(f6f, rolling(fastEnough), { ...neutral, yaw: 1 }, air, DT).y
    expect(y).toBeCloseTo(air.y, 9)
  })

  it('reads a non-finite stick, speed or brake as no steering', () => {
    const y = groundBodyRates(f6f, rolling(Number.NaN), { ...neutral, yaw: Number.NaN, throttle: 0, brakeLeft: Number.NaN }, noAir, DT).y
    expect(Number.isFinite(y)).toBe(true)
    expect(y).toBeCloseTo(0, 9)
  })
})
```

In `tests/assists/autoRudder.test.ts` add (using the existing helpers in that file; read its imports first):

```ts
it('does nothing while the airplane is on the ground, so it never opposes the pilot', () => {
  const s = createState({ position: v3(0, 0, 0), velocity: v3(0, 0, 8), attitude: qIdentity(), gearFraction: 1 })
  const raw: Controls = { pitch: 0, roll: 0, yaw: 0.3, throttle: 0.5 }
  const out = applyAssists(s, spec, raw, DT, ONLY_AUTO_RUDDER(true), { onGround: true })
  expect(out.controls.yaw).toBe(0.3)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/sim/ground.test.ts tests/assists/autoRudder.test.ts -t "T1|ground"`
Expected: FAIL.

- [ ] **Step 3: Controls channels and the brake force**

In `src/sim/flight/state.ts` add after `brake?`:

```ts
  /** Left and right wheel brakes, [0, 1], for differential braking. Optional
   *  like `brake`; `undefined` reads as off. The symmetric drag is the larger
   *  of `brake` and the mean of the two. */
  readonly brakeLeft?: number
  readonly brakeRight?: number
```

In `src/sim/flight/model.ts` find `clampFinite`-based control sanitizing (`grep -n "brake" src/sim/flight/model.ts`) and treat the two channels exactly like `brake`. At the `rollingResistanceN` call (~line 512) pass `Math.max(unit(controls.brake), (unit(controls.brakeLeft) + unit(controls.brakeRight)) / 2)`; export `unit` from `ground.ts` (or reuse the existing finite-clamp helper the file uses) rather than duplicating it.

- [ ] **Step 4: Implement the yaw**

Replace the `fade` and `tailwheelYaw` lines at the end of `groundBodyRates` (Task 3) with:

```ts
  const GROUND_YAW_FADE_MULTIPLE = 1.5
  const yawInput = signedUnit(controls.yaw)
  const fade = validSpeed ? Math.max(0, 1 - groundSpeed / (GROUND_YAW_FADE_MULTIPLE * gear.tailLiftSpeedMps)) : 1
  const rudderDeg = Math.min(1, airflowMps / gear.tailLiftSpeedMps) * spec.rates.maxYawRateDegPerSec
  const wheelSteer =
    gear.thirdSteering === 'steered' ? 1
    : gear.thirdSteering === 'casterLock' ? Math.max(0, 1 - speed / gear.steerLockSpeedMps)
    : 0
  const steerDeg = wheelSteer * gear.steerYawRateDegPerSec
  const brakeDeg = gear.differentialBrakes
    ? (unit(controls.brakeRight ?? 0) - unit(controls.brakeLeft ?? 0)) * gear.brakeYawRateDegPerSec
    : 0
  const torqueDeg = gear.torqueYawRateDegPerSec * throttle * (1 - Math.min(1, speed / gear.tailLiftSpeedMps))
  const noseRightDeg = fade * (yawInput * (rudderDeg + steerDeg) + brakeDeg + torqueDeg)

  return v3(0, -noseRightDeg * GROUND_DEG + airRates.y, pitchRate)
```

Move `GROUND_YAW_FADE_MULTIPLE` to module level. Update the doc comment to the model in words above, keeping the sign paragraph. Remove `tailwheelYawRateDegPerSec` from the schema, JSONs and the `schema.test.ts` fixture; grep for stragglers: `grep -rn "tailwheelYawRateDegPerSec\|tailUpSpeedMps" src tools tests content` must print nothing except historical text inside `reference.source` strings, which you rewrite to say the field was replaced by the T1 layout fields (2026-09-28).

- [ ] **Step 5: Auto-rudder off on the ground**

`autoRudder` cannot see the terrain. Read `src/sim/loop.ts` `advance` and the place `applyAssists` is called to find where "on the ground" is already known for the player (`onGround`/`supportedContact` against `groundUnder`). Add a fourth parameter `context: { readonly onGround: boolean }` to `applyAssists` (`src/assists/index.ts`), pass it to `autoRudder` at ~line 348, and return `controls` unchanged when `context.onGround`. Update every `applyAssists` call site (`grep -rn "applyAssists(" src tests tools`) to pass the real value where the ground is known and `{ onGround: false }` in tests that fly in the air. `src/assists` may import from `src/sim`; the reverse is forbidden, so the flag flows in from the caller.

- [ ] **Step 6: Bindings for the two brakes**

In `src/input/bindings.ts` read the "free keys" list in the comments near `brakes` (line ~91) and pick two keys that list shows free, one for each brake (`brakeLeft`, `brakeRight`); `E` and `Q` are taken. Add both to `BINDINGS`, read them in `src/render/frame.ts:594-611` beside `brake` (`pressed.has` → 1 or 0), and add both to the controls object built there. Update the key documentation (`README` controls table, the `docs` control list, and any help overlay: `grep -rn "KeyB\|\"B\"" README.md docs src | head`). Add a test to the existing bindings test file (find it with `ls tests/input`) asserting the two keys are distinct from every other binding.

- [ ] **Step 7: Run the touched suites**

Run: `npx tsc --noEmit && npx vitest run tests/sim/ground.test.ts tests/assists tests/input tests/render/frame.test.ts tests/sim/flight`
Expected: PASS. If `does not collapse under power` fails, adjust the ESTIMATE values in the three JSONs (`propWashSpeedMps`, `steerYawRateDegPerSec`, `brakeYawRateDegPerSec`) or `GROUND_YAW_FADE_MULTIPLE`, not the test's thresholds, and record the values tried in the ledger.

- [ ] **Step 8: Commit**

```bash
git add -A src content tests
git commit -m "T1 phase B: rudder with prop wash, caster and lock, differential brakes, torque, auto-rudder off on the ground

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: The taxi regression, end to end

**Files:**
- Create: `tests/sim/ground/taxi.test.ts`
- Modify: `tools/testcards/measure.ts` if a shared flat-runway fixture is needed (export `FLAT_RUNWAY_FIELD` and `RUNWAY_HEIGHT_M`)

The unit tests in Task 5 pin the formula. This task pins the reported failure through the real `step`: Hellcat, 60% throttle, full rudder, from rest, on the flat runway, as measured on 2026-09-16 to 09-17 (5.5 deg/s falling to 1.5 deg/s, about 12 m lateral in 73 m).

- [ ] **Step 1: Write the test**

Create `tests/sim/ground/taxi.test.ts`. Read `tools/testcards/measure.ts:400-470` first; export what you need from it (`FLAT_RUNWAY_FIELD`, `RUNWAY_HEIGHT_M`, `spawn`, `stepChecked`, `holdMass`) rather than copying them.

```ts
import { describe, expect, it } from 'vitest'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { DT } from '../../../src/sim/flight/model.js'
import { attitudeAngles } from '../../../src/sim/flight/attitude.js'
import { restPitchRad, wheelDepthM } from '../../../src/sim/gearContact.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { FLAT_RUNWAY_FIELD, RUNWAY_HEIGHT_M, spawn, stepChecked, holdMass } from '../../../tools/testcards/measure.js'
import type { AircraftState, Controls } from '../../../src/sim/flight/state.js'

const yawRateDegPerSec = (before: AircraftState, after: AircraftState): number => {
  const heading = (s: AircraftState) => Math.atan2(-s.velocity.z, s.velocity.x)
  return ((heading(after) - heading(before)) * 180) / Math.PI / DT
}

function taxi(id: string, controls: Controls, seconds: number) {
  const spec = loadAircraftSpec(id)
  const rest = restPitchRad(spec.gear)
  let s: AircraftState = {
    ...spawn(spec, RUNWAY_HEIGHT_M + wheelDepthM(spec.gear, rest), 0),
    attitude: qFromAxisAngle(v3(0, 0, 1), rest),
    gearFraction: 1,
  }
  const trace: AircraftState[] = [s]
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    s = holdMass(spec, stepChecked(spec, s, controls, { dt: DT, tick: i + 1, terrain: FLAT_RUNWAY_FIELD }))
    trace.push(s)
  }
  return { spec, trace, rest }
}

describe('Hellcat taxi under power with full rudder (the 2026-09-17 failure)', () => {
  const controls: Controls = { pitch: 0, roll: 0, yaw: 1, throttle: 0.6, gearDown: true }
  const { trace } = taxi('f6f-hellcat', controls, 12)
  const speedAt = (s: AircraftState) => Math.hypot(s.velocity.x, s.velocity.z)

  it('is still turning at 15 m/s, not near zero', () => {
    const i = trace.findIndex((s) => speedAt(s) >= 15)
    expect(i, 'never reached 15 m/s').toBeGreaterThan(10)
    const rate = Math.abs(yawRateDegPerSec(trace[i - 10]!, trace[i]!)) * 1 // per second over ~10 ticks handled below
    expect(rate).toBeGreaterThanOrEqual(3)
  })

  it('stays on its wheels at the rest-to-level pitch range and never rolls', () => {
    for (const s of trace) {
      const a = attitudeAngles(s)
      expect(Math.abs(a.rollRad)).toBeLessThan(1e-6)
      expect(a.pitchRad).toBeGreaterThanOrEqual(-1e-6)
    }
  })
})

describe('take-off roll with the stick neutral', () => {
  const { trace, rest } = taxi('f6f-hellcat', { pitch: 0, roll: 0, yaw: 0, throttle: 1, gearDown: true }, 14)
  it('starts at the rest attitude and lifts the tail as the airplane accelerates', () => {
    expect(attitudeAngles(trace[0]!).pitchRad).toBeCloseTo(rest, 6)
    const last = attitudeAngles(trace[trace.length - 1]!).pitchRad
    expect(last).toBeLessThan(rest * 0.25)
  })

  it('swings a bounded amount at full power with no correction (torque), not a ground loop', () => {
    const end = trace[trace.length - 1]!
    const headingDeg = (Math.atan2(-end.velocity.z, end.velocity.x) * 180) / Math.PI
    expect(Math.abs(headingDeg)).toBeGreaterThan(0.5)
    expect(Math.abs(headingDeg)).toBeLessThan(30)
  })
})
```

Note: the first test's yaw-rate estimate divides a 10-tick heading change by one `DT` and would overstate by 10x. Fix it before running: compute `const rate = Math.abs(yawRateDegPerSec(trace[i - 10]!, trace[i]!)) / 10`. Then verify the number this measures against the unit-level `at15` and record both in the ledger.

- [ ] **Step 2: Run, fix the test's own arithmetic, then verify**

Run: `npx vitest run tests/sim/ground/taxi.test.ts`
Expected first run: PASS or fail on the thresholds. A threshold failure is information: record the measured yaw rate at 15 m/s, the pitch at the end of the roll and the heading swing in the ledger. If the tail does not lift, or the swing is outside 0.5-30 degrees, adjust the ESTIMATE coefficients in the three JSONs (never the tolerances above) and re-run; record each attempt.

- [ ] **Step 3: Re-run the Phase A guards and the cards**

Run: `npx vitest run tests/sim/testcards tests/sim/ground tests/sim/ground.test.ts`
Expected: PASS; any take-off card that moved with the torque swing is triaged as in Task 4 Step 2.

- [ ] **Step 4: Commit**

```bash
git add -A tests tools
git commit -m "T1 phase B: taxi and take-off roll regression through the real step

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: Conformance battery and synthetic fixtures

**Files:**
- Create: `tests/sim/ground/fixtures.ts`
- Create: `tests/sim/ground/conformance.test.ts`

**Interfaces:**
- Produces: `syntheticTricycle`, `syntheticTwin` (`AircraftSpec`), built from `loadAircraftSpec('f6f-hellcat')` with a replaced `gear` block, plus `allGroundSpecs` (the three real specs and the two fixtures).

- [ ] **Step 1: Write the fixtures**

Create `tests/sim/ground/fixtures.ts`:

```ts
import type { AircraftSpec } from '../../../src/sim/flight/schema.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const base = loadAircraftSpec('f6f-hellcat')

/** A single-engine tricycle. Fixture only: the layout is invented, not a real
 *  aircraft, and exists to prove the ground model needs no per-layout code. */
export const syntheticTricycle: AircraftSpec = {
  ...base,
  id: 'synthetic-tricycle',
  gear: {
    ...base.gear,
    layout: 'tricycle',
    mainX: -0.6,
    thirdX: 3.6,
    thirdHeightM: base.gear.heightM,
    thirdSteering: 'steered',
    steerYawRateDegPerSec: 25,
    torqueYawRateDegPerSec: -2,
  },
}

/** A twin with counter-rotating propellers (net torque 0) and no wheel
 *  steering beyond differential brakes, the P-38's shape. Fixture only. */
export const syntheticTwin: AircraftSpec = {
  ...syntheticTricycle,
  id: 'synthetic-twin',
  gear: { ...syntheticTricycle.gear, torqueYawRateDegPerSec: 0, thirdSteering: 'caster', steerYawRateDegPerSec: 0 },
}

export const realGroundSpecs: readonly AircraftSpec[] = ['f6f-hellcat', 'f4f-wildcat', 'a6m2-zero'].map(loadAircraftSpec)
export const allGroundSpecs: readonly AircraftSpec[] = [...realGroundSpecs, syntheticTricycle, syntheticTwin]
```

If `AircraftSpec` carries fields the spread does not satisfy (`id` may live elsewhere), fix the fixture to typecheck against the real type; run `npx tsc --noEmit`.

- [ ] **Step 2: Write the battery**

Create `tests/sim/ground/conformance.test.ts`. Reuse `FLAT_RUNWAY_FIELD`, `RUNWAY_HEIGHT_M`, `spawn`, `stepChecked`, `holdMass` from `tools/testcards/measure.ts` exactly as `taxi.test.ts` does; put the shared `run(spec, controls, seconds)` helper in `tests/sim/ground/run.ts` and import it from both files (move it out of `taxi.test.ts`).

```ts
import { describe, expect, it } from 'vitest'
import { attitudeAngles } from '../../../src/sim/flight/attitude.js'
import { restPitchRad, wheelDepthM } from '../../../src/sim/gearContact.js'
import { onGround } from '../../../src/sim/ground.js'
import { allGroundSpecs } from './fixtures.js'
import { run } from './run.js'
import { length, v3 } from '../../../src/sim/math/vec3.js'

describe.each(allGroundSpecs.map((s) => [s.id, s] as const))('ground conformance: %s', (_id, spec) => {
  it('1. the layout is valid: a rest pitch exists and both wheels touch at it', () => {
    const rest = restPitchRad(spec.gear)
    expect(Number.isFinite(rest)).toBe(true)
    const third = spec.gear.thirdHeightM * Math.cos(rest) - spec.gear.thirdX * Math.sin(rest)
    expect(wheelDepthM(spec.gear, rest)).toBeCloseTo(third, 9)
  })

  it('2. parked for 60 s on level ground it stays put', () => {
    const { trace } = run(spec, { pitch: 0, roll: 0, yaw: 0, throttle: 0, gearDown: true, brake: 1 }, 60)
    const end = trace[trace.length - 1]!
    expect(length(v3(end.position.x - trace[0]!.position.x, 0, end.position.z - trace[0]!.position.z))).toBeLessThan(0.05)
    expect(Math.abs(end.position.y - trace[0]!.position.y)).toBeLessThan(0.01)
    expect(onGround(spec, end, 1)).toBe(true)
  })

  it('3. idling straight it holds its heading over 100 m', () => {
    const { trace } = run(spec, { pitch: 0, roll: 0, yaw: 0, throttle: 0.3, gearDown: true }, 25)
    const head = (i: number) => Math.atan2(-trace[i]!.velocity.z, trace[i]!.velocity.x)
    const last = trace.findIndex((s) => s.position.x - trace[0]!.position.x >= 100)
    if (last > 0) expect(Math.abs(head(last) - head(Math.min(last, 60)))).toBeLessThan(0.1)
  })

  it('4. full power, stick neutral: the tail (or nose) settles to level and the roll ends in the air or at speed', () => {
    const { trace } = run(spec, { pitch: 0, roll: 0, yaw: 0, throttle: 1, gearDown: true }, 20)
    const end = trace[trace.length - 1]!
    expect(length(end.velocity)).toBeGreaterThan(spec.gear.tailLiftSpeedMps)
    expect(Math.abs(attitudeAngles(end).pitchRad)).toBeLessThan(0.05 + Math.max(0, restPitchRad(spec.gear)))
  })

  it('5. a wheel drop and a three-point drop settle without gaining energy', () => {
    const rest = restPitchRad(spec.gear)
    for (const pitch of [0, rest]) {
      const { trace } = run(spec, { pitch: 0, roll: 0, yaw: 0, throttle: 0, gearDown: true }, 8, { pitchRad: pitch, dropM: 0.3, speedMps: 35 })
      const energy = (i: number) => 0.5 * length(trace[i]!.velocity) ** 2 + 9.80665 * trace[i]!.position.y
      expect(energy(trace.length - 1)).toBeLessThanOrEqual(energy(0) + 1e-6)
    }
  })
})
```

Extend `run` with an optional `initial` (`{ pitchRad, dropM, speedMps }`): attitude pitched by `pitchRad`, height `RUNWAY_HEIGHT_M + wheelDepthM(...) + dropM`, forward speed `speedMps` (default 0), nose along +x. Test 3 is deliberately guarded (`if (last > 0)`) because an idle roll may not cover 100 m in 25 s for every fixture; change it to assert the distance is reached rather than skipping if it never is (`expect(last).toBeGreaterThan(0)`), and raise the run time until it is.

- [ ] **Step 3: Run**

Run: `npx vitest run tests/sim/ground/conformance.test.ts`
Expected: PASS for the three real aircraft. The two fixtures exercise the tricycle path (`layout: 'tricycle'` ceiling and floor) and the counter-rotating path; a failure there is a real defect in Task 3 or Task 5, not a fixture problem. Fix the code, and add a targeted regression test beside the ground tests.

- [ ] **Step 4: Commit**

```bash
git add -A tests
git commit -m "T1: ground conformance battery and synthetic tricycle and twin fixtures

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: Docs, handoff, verification

**Files:**
- Modify: `docs/aircraft.md` (new "Undercarriage" step)
- Create: `docs/handoff/2026-09-28-t1-ground-handling.md` (check the path and `git log` first)
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§15 row), `README.md` (a paragraph pointing at §15), `docs/models.md` if it mentions the drawn stance
- Modify: any doc or comment that still describes the retired drawn stance or the speed gate: `grep -rn "tailUpSpeed\|stanceTilt\|drawnPose\|tail-down stance" docs src README.md`

- [ ] **Step 1: `docs/aircraft.md`**

Add an "Undercarriage" step to the onboarding runbook: author `layout`, `mainX`, `heightM`, `thirdX`, `thirdHeightM` from the drawn model (the scratch-measurement method in Task 1 Step 5), label the steering and brake numbers ESTIMATE or cite them, then run `npx vitest run tests/sim/ground/conformance.test.ts tests/sim/gearContact.test.ts tests/tools/models/stance.test.ts`. A new aircraft passes them or does not ship. Point at the spec rather than restating it.

- [ ] **Step 2: Handoff**

Write `docs/handoff/2026-09-28-t1-ground-handling.md`: what shipped by phase; the ledger's card deltas (old and new, cause); the ESTIMATE coefficients and every value tried; the open items (seed-7 soak still marginal and not owned here; hand-flown landing still to be judged by Mark; AI take-off/landing 7g now has a sound base; P-38 and bomber content are data plus the conformance battery); the `MODEL_STANCE` reference now used only by tests. Link the captures.

- [ ] **Step 3: §15 row and README**

Add the T1 row to §15's table with today's date and status, and a README paragraph that points at §15 instead of restating the order. Escape `|` as `\|` in table cells.

- [ ] **Step 4: Full verification**

Run: `remote-run npm run verify; echo rc=$?`
Expected: `rc=0`, or only the failures already recorded in the ledger as pre-existing (seed-7 soak; a load-timeout such as `skyLoad` passes when re-run alone and is not tracked). Report anything else.

- [ ] **Step 5: Commit and email**

```bash
git add -A docs README.md
git commit -m "T1: onboarding step, handoff, §15 row

Co-Authored-By: Claude Code <noreply@anthropic.com>"
python3 tools/mail-doc.py docs/handoff/2026-09-28-t1-ground-handling.md "ww2airsim T1 handoff: believable ground handling"
```

A worktree branch may be pushed: `git push -u origin worktree-t1-tailwheel`. Do not merge into `main` and do not push `main`; that is Mark's call.

---

## Self-review notes (2026-09-28)

- **Spec coverage:** intent 1 (taxi) Tasks 5-6; 2 (take-off) Tasks 3, 6; 3 (landing) Tasks 3, 7 (drop cases); 4 (rest attitude in the sim, renderer follows) Tasks 1-3; 5 (synthetic fixtures) Task 7. Section 2 layout table Task 1; behavior model Tasks 3, 5; phases A and B Tasks 1-4 and 5-6; checks Task 7; `docs/aircraft.md` Task 8. Section 8 amendments are honored (`heightM` kept, `tailLiftSpeedMps`, single torque number, optional brake channels).
- **Known soft spots, deliberate:** the `wheelDepthOf` change moves landing and carrier metrics by centimeters (Task 2 Step 6 triages each); ESTIMATE coefficients are tuned for feel in Tasks 5-6 and recorded; the auto-rudder ground flag threads through `applyAssists` (Task 5 Step 5) and its call sites are found by grep, not enumerated here because the loop code was not fully read.
- **Names used across tasks:** `restPitchRad`, `wheelDepthM`, `wheelDepthOf`, `parkedAttitude(a, restPitchRad)`, `groundBodyRates(spec, state, controls, airRates, dt, surfaceVelocity)`, `tailLiftSpeedMps`, `propWashSpeedMps`, `steerYawRateDegPerSec`, `steerLockSpeedMps`, `thirdSteering`, `differentialBrakes`, `brakeYawRateDegPerSec`, `torqueYawRateDegPerSec`, `Controls.brakeLeft`/`brakeRight`, `run(...)` in `tests/sim/ground/run.ts`.
