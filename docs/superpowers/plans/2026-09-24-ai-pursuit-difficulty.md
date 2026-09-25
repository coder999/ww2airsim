# AI Pursuit Difficulty (Plan 7d) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the AI pursuit pilot two new, skill-scaled weaknesses —
perception staleness (steers against a snapshot of the target taken at the
last rescore, not live ground truth) and control noise (deterministic jitter
on the final roll/pitch/yaw output) — so a `green`-skill pursuer is
genuinely beatable, closing the gap Mark's own play found: "I can't ever get
behind that pilot," confirmed to persist even at the easiest existing preset.

**Architecture:** Two independent additions to the existing Plan 7a/7b AI
stack, both gated by `PilotSkill` and both keyed to `src/sim/`'s single
seeded-PRNG discipline. Perception staleness is captured once per rescore
(`src/sim/loop.ts`'s existing `nowS >= decision.nextRescoreS` branch) and
consumed by `decision.ts`'s `maneuverControls` via a substituted "perceived
target" entity, so `pursuit.ts`'s and `pilot.ts`'s own desired-velocity
functions need no changes at all — they simply receive a different `target`
argument. Control noise is a new pure function
(`src/sim/ai/noise.ts`) applied to `maneuverControls`'s final output,
carrying its own RNG cursor on `PilotDecisionState` (independent of
`weapons/combat.ts`'s own `rngState` cursor, so neither system's draw count
can perturb the other's).

**Tech Stack:** TypeScript, vitest (Tier 1), Playwright against the
reference GPU (Tier 2).

**Spec:** `docs/superpowers/specs/2026-09-24-ai-pursuit-difficulty-design.md`

## Global Constraints

- `src/sim/` has a single seeded PRNG; `Math.random` appears nowhere in
  that tree (master spec §3). Every new random draw uses this repo's
  existing `createRng`/mulberry32 cursor-threading pattern
  (`src/sim/rng.ts`, `src/sim/weapons/combat.ts`'s `randomFrom`) — a
  serializable integer cursor advanced by re-deriving `createRng(cursor)()`,
  never a held closure.
- The same seed must reproduce the same flown path: golden-trajectory tests
  (`tests/sim/golden/trajectory.test.ts`) must still pass bit-identically
  (that suite never constructs a `PilotAssignment`, so this should be a
  no-op confirmation, not a code change — verified, not assumed, in Task 4).
- `npm run verify` (typecheck, ESLint zero-warnings, depcruise, vitest) ends
  every task. Capture `rc=$?` directly; never gate on a grepped pipeline.
- US spelling in new prose/identifiers.
- No change to `leadPursuitVelocity`'s intercept math, `hasGunSolution`'s
  gun-cone gate/`gunneryAccuracy`'s effect, `energyDiscipline`, or
  `disengageThreshold` — all explicitly out of scope (spec §2).
- Self's own facts (fuel fraction, damage taken) stay live; only the AI's
  *perception of the target* goes stale.
- Every completed plan ends with a dated `docs/handoff/` document, an
  updated master spec §15 row, and a README paragraph pointing at §15.
- Escape `|` as `\|` inside markdown table cells.

## Review Focus

- **Perception staleness must not widen `MIN_ENGAGEMENT_RANGE_M`'s safety
  window.** That override only re-evaluates at a rescore (`decideManeuver`
  is called exclusively from the rescore branch, unchanged by this plan),
  so a target that closes to point-blank range *between* rescores is
  invisible to it for up to a full `reactionS` — a real, if small,
  regression risk this plan introduces by pairing staleness with an
  existing safety-critical override. Task 2 re-runs the existing
  point-blank break-off coverage as a regression gate, not just the new
  staleness unit test.
- **The firing gate now evaluates against the perceived (stale) target
  too**, since `maneuverControls`'s Pursue branch substitutes the same
  perceived entity into `pursuitControls` (and therefore `hasGunSolution`).
  A pilot who last saw the target somewhere it no longer is could fire at
  empty air more, or land fewer hits within `scenario.test.ts`'s existing
  tick budget. Task 2 re-runs that exact existing hit-budget test as a
  regression gate.
- **`applyControlNoise` must never produce NaN/Infinity**, including the
  Box-Muller `Math.log(0)` edge case a mulberry32 draw of exactly `0` would
  trigger. Task 3 adds a fuzz-style test over many cursor values, not just
  one hand-picked seed.
- **The golden-trajectory suite must stay bit-identical** — confirmed by
  actually running it (Task 4), not assumed from "the AI code isn't in that
  path."
- **Every existing `PilotDecisionState` object literal across the test
  suite must gain the new required fields**, or `npm run verify`'s
  typecheck fails immediately on Task 1 — `tests/sim/ai/pursuit.test.ts`,
  `tests/sim/entities.test.ts`, and `tests/sim/scenario.test.ts` (three
  separate `.toEqual`/literal sites) all construct
  `{ maneuver, nextRescoreS }` object literals today.

---

### Task 1: Widen the types, seed the new fields, keep the suite green

**Files:**
- Modify: `src/sim/ai/pilot.ts` (`PilotSkill.controlNoise`,
  `PilotDecisionState`'s three new fields, `VETERAN_SKILL`/`GREEN_SKILL`)
- Modify: `src/sim/scenario.ts` (`pilotAssignmentFrom` seeds the new fields)
- Modify: `src/sim/loop.ts` (the rescore branch around line 816-824: spread
  the previous `decision` instead of replacing it with a fresh literal, so
  the new fields survive a rescore unchanged — this task does not populate
  them with real data yet, Tasks 2/3 do)
- Modify: `tests/sim/ai/pilot.test.ts`
- Modify: `tests/sim/ai/pursuit.test.ts` (`PURSUE_NOW`, line 111)
- Modify: `tests/sim/entities.test.ts` (`PURSUE_NOW` line 16,
  `RESCORED_PURSUE` line 23)
- Modify: `tests/sim/scenario.test.ts` (three `.toEqual`/literal sites:
  lines 118, 131, 139)

**Interfaces:**
- Produces: `PilotSkill.controlNoise: number`; `PilotDecisionState`'s
  `observedTargetPosition: Vec3`, `observedTargetVelocity: Vec3`,
  `noiseCursor: number` — consumed by Task 2 (snapshot) and Task 3 (noise).
- Consumes: nothing new.

- [x] **Step 1: Extend `PilotSkill` and `PilotDecisionState` in `src/sim/ai/pilot.ts`**

```ts
export type PilotSkill = {
  readonly reactionS: number
  readonly gunneryAccuracy: number
  readonly energyDiscipline: number
  readonly disengageThreshold: number
  /** Standard deviation of noise added to each of roll/pitch/yaw, in the
   *  same [-1, 1] units `Controls` already uses. 0 = perfect (no jitter).
   *  HIGHER IS ALWAYS WORSE -- unlike `gunneryAccuracy`, chosen
   *  specifically so a future reader cannot get the direction backwards by
   *  pattern-matching on this file's other, inverted field (Plan 7b's own
   *  gunneryAccuracy bug, spec §3). */
  readonly controlNoise: number
}

export const VETERAN_SKILL: PilotSkill = {
  reactionS: 0.3,
  gunneryAccuracy: 0.6,
  energyDiscipline: 0.7,
  disengageThreshold: -400,
  // Starting value; Task 4 retunes against a real flight on the reference
  // GPU and replaces this comment with the measured result.
  controlNoise: 0.02,
}

export const GREEN_SKILL: PilotSkill = {
  reactionS: 1.0,
  gunneryAccuracy: 1.0,
  energyDiscipline: 0.3,
  disengageThreshold: -150,
  // Starting value; Task 4 retunes against a real flight on the reference
  // GPU and replaces this comment with the measured result.
  controlNoise: 0.15,
}

export type PilotDecisionState = {
  readonly maneuver: PilotManeuver
  readonly nextRescoreS: number
  /** The target's position/velocity as of the last rescore -- what the
   *  pilot is actually flying (and aiming) against between rescores.
   *  Captured alongside `decideManeuver`'s own facts-derivation in
   *  `loop.ts`, so there is one observation per rescore. */
  readonly observedTargetPosition: Vec3
  readonly observedTargetVelocity: Vec3
  /** mulberry32 cursor for this pilot's control-noise draws (Task 3),
   *  independent of `weapons/combat.ts`'s own `rngState` cursor. Advances
   *  every tick, not just at rescore, since noise is applied to
   *  `maneuverControls`'s output every tick regardless of maneuver. */
  readonly noiseCursor: number
}
```

Import `Vec3` (already imported in this file as a type via
`'../math/vec3.js'`; add `ZERO` to that same import for Step 2).

- [x] **Step 2: Seed the new fields in `src/sim/scenario.ts`**

```ts
import { ZERO } from './math/vec3.js' // add to this file's existing vec3 import

function pilotAssignmentFrom(pilot: z.infer<typeof PilotObject> | undefined): PilotAssignment | null {
  if (pilot === undefined) return null
  return {
    target: pilot.target,
    skill: pilot.skill === 'veteran' ? VETERAN_SKILL : GREEN_SKILL,
    decision: {
      maneuver: 'pursue',
      nextRescoreS: 0,
      // Immediately overwritten at the first rescore (nextRescoreS: 0
      // guarantees tick 1 triggers one) -- a fixed, knowable seed, same
      // convention as nextRescoreS's own starting value.
      observedTargetPosition: ZERO,
      observedTargetVelocity: ZERO,
      noiseCursor: 0,
    },
  }
}
```

- [x] **Step 3: Keep `src/sim/loop.ts`'s rescore branch type-correct without changing its behavior**

Around the existing block (confirmed at lines 815-824 as of 2026-09-24):

```ts
let decision = a.pilot.decision
if (nowS >= decision.nextRescoreS) {
  const facts = deriveFacts(
    a, target,
    1 - record.damage.structure,
    a.state.fuelKg / a.spec.mass.fuelCapacityKg,
  )
  decision = {
    ...decision,
    maneuver: decideManeuver(facts, a.pilot.skill),
    nextRescoreS: nowS + a.pilot.skill.reactionS,
  }
}
commanded = { ...a, pilot: { ...a.pilot, decision }, controls: maneuverControls(a, target, decision.maneuver) }
```

The only change from today is `{ ...decision, maneuver: ..., nextRescoreS: ... }` replacing the previous fresh two-field literal, so `observedTargetPosition`/`observedTargetVelocity`/`noiseCursor` survive a rescore unchanged. Nothing yet reads or updates them with real data.

- [x] **Step 4: Update every existing `PilotDecisionState` literal to compile**

In `tests/sim/ai/pursuit.test.ts` (line 111):

```ts
const PURSUE_NOW = {
  maneuver: 'pursue' as const, nextRescoreS: 0,
  observedTargetPosition: ZERO, observedTargetVelocity: ZERO, noiseCursor: 0,
}
```

(add `import { ZERO } from '../../../src/sim/math/vec3.js'` alongside the existing `v3` import from that module.)

In `tests/sim/entities.test.ts` (lines 16, 23) — same shape for `PURSUE_NOW`; `RESCORED_PURSUE` gets the same three new fields at the same seed values, since Task 1's loop.ts change does not yet populate them with anything else:

```ts
const PURSUE_NOW = {
  maneuver: 'pursue' as const, nextRescoreS: 0,
  observedTargetPosition: ZERO, observedTargetVelocity: ZERO, noiseCursor: 0,
}
const RESCORED_PURSUE = {
  maneuver: 'pursue' as const, nextRescoreS: DT + GREEN_SKILL.reactionS,
  observedTargetPosition: ZERO, observedTargetVelocity: ZERO, noiseCursor: 0,
}
```

(add `import { ZERO } from '../../src/sim/math/vec3.js'` to this file's existing `v3` import.)

In `tests/sim/scenario.test.ts` (lines 118, 131, 139), all three sites become:

```ts
decision: { maneuver: 'pursue', nextRescoreS: 0, observedTargetPosition: ZERO, observedTargetVelocity: ZERO, noiseCursor: 0 },
```

(add the same `ZERO` import to this file.)

- [x] **Step 5: Extend `tests/sim/ai/pilot.test.ts` for the new field**

```ts
it('green jitters materially more than veteran (higher is always worse)', () => {
  expect(GREEN_SKILL.controlNoise).toBeGreaterThan(VETERAN_SKILL.controlNoise)
})
```

(The existing `structuredClone(VETERAN_SKILL)).toEqual(VETERAN_SKILL)` case already covers the new field automatically — no change needed there.)

- [x] **Step 6: Run the full suite and verify**

```bash
npm run verify; rc=$?; echo rc=$rc
```

Expected: `rc=0`. This task changes no runtime behavior (Task 1's loop.ts
edit is a type-preserving refactor); every currently-passing test must
still pass with identical assertions on `maneuver`/`nextRescoreS`.

- [x] **Step 7: Commit**

```bash
git add src/sim/ai/pilot.ts src/sim/scenario.ts src/sim/loop.ts \
  tests/sim/ai/pilot.test.ts tests/sim/ai/pursuit.test.ts \
  tests/sim/entities.test.ts tests/sim/scenario.test.ts
git commit -m "Widen PilotSkill/PilotDecisionState for control noise and perception staleness (no behavior change)"
```

---

### Task 2: Perception staleness

**Files:**
- Modify: `src/sim/loop.ts` (capture the observed snapshot at rescore)
- Modify: `src/sim/ai/decision.ts` (`maneuverControls` takes `decision`
  instead of a bare `maneuver`, builds a "perceived" target entity from the
  snapshot)
- Test: `tests/sim/ai/decision.test.ts` (new cases)

**Interfaces:**
- Consumes: Task 1's `PilotDecisionState` fields.
- Produces: `maneuverControls<M>(self, target, decision): Controls` (new
  signature, replacing the old `(self, target, maneuver)` — Task 3 extends
  this again to add a `skill` parameter and change the return type).

- [x] **Step 1: Write the failing tests**

```ts
// tests/sim/ai/decision.test.ts (new cases)
import { maneuverControls } from '../../../src/sim/ai/decision.js'
import { pursuitControls } from '../../../src/sim/ai/pursuit.js'
import type { PilotDecisionState } from '../../../src/sim/ai/pilot.js'
import { v3 } from '../../../src/sim/math/vec3.js'

// This file's own existing `entityAt` helper (used by the "coincident
// positions" describe block above) hardcodes id 'e' for both arguments,
// which is wrong for a test needing two distinct, independently-named
// entities -- a local helper here instead of forcing a shared one into a
// shape it wasn't built for.
const entity = (id: string, position: ReturnType<typeof v3>, velocity: ReturnType<typeof v3>): AircraftEntity<undefined> => {
  const state = createState({ position, velocity })
  return {
    id, spec: f6f, state, previous: state,
    controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 },
    assistMemory: undefined, impact: null, parked: false,
  }
}

describe('maneuverControls steers against the observed snapshot, not live target state', () => {
  const self = entity('self', v3(0, 3000, 0), v3(100, 0, 0))

  it('ignores a sharp live-velocity change until the next rescore', () => {
    const snapshotVelocity = v3(0, 0, 100) // observed heading 90 degrees from live
    const decision: PilotDecisionState = {
      maneuver: 'pursue', nextRescoreS: 999,
      observedTargetPosition: v3(500, 3000, 0), observedTargetVelocity: snapshotVelocity,
      noiseCursor: 0,
    }
    // Live target now flies a completely different heading than the snapshot.
    const liveTarget = entity('target', v3(500, 3000, 0), v3(100, 0, 0))
    const staleControls = maneuverControls(self, liveTarget, decision)

    // Compare against what steering the LIVE state would have produced, by
    // building a second decision whose snapshot matches the live state
    // exactly -- if staleness works, these two differ.
    const liveDecision: PilotDecisionState = { ...decision, observedTargetVelocity: v3(100, 0, 0) }
    const freshControls = maneuverControls(self, liveTarget, liveDecision)
    expect(staleControls).not.toEqual(freshControls)
  })

  it('reproduces today\'s exact steering when the snapshot equals live state', () => {
    const target = entity('target', v3(500, 3000, 0), v3(100, 0, 0))
    const decision: PilotDecisionState = {
      maneuver: 'pursue', nextRescoreS: 999,
      observedTargetPosition: target.state.position, observedTargetVelocity: target.state.velocity,
      noiseCursor: 0,
    }
    expect(maneuverControls(self, target, decision)).toEqual(pursuitControls(self, target))
  })
})
```

- [x] **Step 2: Run to verify failure**

```bash
npx vitest run tests/sim/ai/decision.test.ts
```

Expected: FAIL — `maneuverControls` does not yet accept a `decision` argument.

- [x] **Step 3: Implement the perceived-target substitution in `src/sim/ai/decision.ts`**

```ts
export function maneuverControls<M>(
  self: AircraftEntity<M>,
  target: AircraftEntity<M>,
  decision: PilotDecisionState,
): Controls {
  const perceived: AircraftEntity<M> = {
    ...target,
    state: { ...target.state, position: decision.observedTargetPosition, velocity: decision.observedTargetVelocity },
  }
  if (decision.maneuver === 'pursue') return pursuitControls(self, perceived)
  const desired = decision.maneuver === 'extend'
    ? extendDesiredVelocity(self, perceived)
    : breakDesiredVelocity(self, perceived)
  return controlsForDesiredVelocity(self.state, self.spec, desired)
}
```

Import `PilotDecisionState` as a type alongside this file's existing
`PilotManeuver`/`PilotSkill` import from `./pilot.js`.

- [x] **Step 4: Wire the snapshot capture into `src/sim/loop.ts`**

Extend Task 1's rescore branch to also capture the snapshot, and update the
call site:

```ts
let decision = a.pilot.decision
if (nowS >= decision.nextRescoreS) {
  const facts = deriveFacts(
    a, target,
    1 - record.damage.structure,
    a.state.fuelKg / a.spec.mass.fuelCapacityKg,
  )
  decision = {
    ...decision,
    maneuver: decideManeuver(facts, a.pilot.skill),
    nextRescoreS: nowS + a.pilot.skill.reactionS,
    observedTargetPosition: target.state.position,
    observedTargetVelocity: target.state.velocity,
  }
}
commanded = { ...a, pilot: { ...a.pilot, decision }, controls: maneuverControls(a, target, decision) }
```

`deriveFacts` still reads the LIVE `target` (decision-making cadence is
unchanged, per spec §2); only `maneuverControls`'s steering now goes
through the snapshot.

- [x] **Step 5: Run the new tests, verify pass**

```bash
npx vitest run tests/sim/ai/decision.test.ts
```

- [x] **Step 6: Run the Review Focus regression gates**

```bash
npx vitest run tests/sim/scenario.test.ts tests/sim/entities.test.ts
```

Expected: PASS, including "the pursuit pilot actually hits the target it is
gated on" (hit-budget test) and "MIN_ENGAGEMENT_RANGE_M forces Extend in
production advance() at point-blank range" — both must still pass within
their existing tick budgets. If either regresses, stop and investigate
before proceeding (per this Review Focus item) rather than loosening the
budget to make it pass.

- [x] **Step 7: Run `npm run verify`**

```bash
npm run verify; rc=$?; echo rc=$rc
```

Expected: `rc=0`.

- [x] **Step 8: Commit**

```bash
git add src/sim/ai/decision.ts src/sim/loop.ts tests/sim/ai/decision.test.ts
git commit -m "Perception staleness: steer between rescores against the last-observed target snapshot"
```

---

### Task 3: Control noise

**Files:**
- Create: `src/sim/ai/noise.ts`
- Test: `tests/sim/ai/noise.test.ts`
- Modify: `src/sim/ai/decision.ts` (`maneuverControls` gains a `skill`
  parameter, applies noise, returns `{ controls, decision }`)
- Modify: `src/sim/loop.ts` (call-site update for the new return shape)
- Modify: `tests/sim/ai/decision.test.ts` (Task 2's two new cases called
  `maneuverControls` expecting a bare `Controls` return — update for the
  new `{ controls, decision }` shape)

**Interfaces:**
- Consumes: `src/sim/rng.ts`'s `createRng`; Task 1's
  `PilotDecisionState.noiseCursor`/`PilotSkill.controlNoise`.
- Produces: `applyControlNoise(controls, noiseStdDev, cursor): { controls, cursor }`,
  consumed only by `decision.ts` in this plan; `maneuverControls`'s new
  return shape `{ controls: Controls; decision: PilotDecisionState }`,
  consumed by `loop.ts`.

- [x] **Step 1: Write the failing tests**

```ts
// tests/sim/ai/noise.test.ts
import { describe, expect, it } from 'vitest'
import { applyControlNoise } from '../../../src/sim/ai/noise.js'
import { GREEN_SKILL, VETERAN_SKILL } from '../../../src/sim/ai/pilot.js'

const BASE = { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 }

describe('applyControlNoise', () => {
  it('is deterministic: same seed, same inputs, twice -> bit-identical output', () => {
    expect(applyControlNoise(BASE, 0.2, 12345)).toEqual(applyControlNoise(BASE, 0.2, 12345))
  })

  it('actually jitters -- roll/pitch/yaw move off the unjittered baseline', () => {
    const { controls } = applyControlNoise(BASE, 0.2, 12345)
    expect(controls.roll).not.toBe(0)
    expect(controls.pitch).not.toBe(0)
    expect(controls.yaw).not.toBe(0)
  })

  it('never touches throttle, gearDown, flapDown, brake or fire', () => {
    const withExtras = { ...BASE, gearDown: true, flapDown: true, brake: 0.5, fire: true }
    const { controls } = applyControlNoise(withExtras, 0.5, 999)
    expect(controls.throttle).toBe(0.7)
    expect(controls.gearDown).toBe(true)
    expect(controls.flapDown).toBe(true)
    expect(controls.brake).toBe(0.5)
    expect(controls.fire).toBe(true)
  })

  it('0 noise contributes exactly 0 but still advances the cursor by a fixed amount', () => {
    const zero = applyControlNoise(BASE, 0, 12345)
    expect(zero.controls).toEqual(BASE)
    const nonZero = applyControlNoise(BASE, 0.2, 12345)
    expect(zero.cursor).toBe(nonZero.cursor)
  })

  it('clamps to [-1, 1] even with a large noiseStdDev against a near-limit baseline', () => {
    const { controls } = applyControlNoise({ ...BASE, roll: 0.95, pitch: -0.95 }, 5, 42)
    expect(controls.roll).toBeLessThanOrEqual(1)
    expect(controls.roll).toBeGreaterThanOrEqual(-1)
    expect(controls.pitch).toBeLessThanOrEqual(1)
    expect(controls.pitch).toBeGreaterThanOrEqual(-1)
  })

  it('never produces NaN/Infinity across a wide range of cursors (Box-Muller log(0) edge case)', () => {
    for (let cursor = 0; cursor < 5000; cursor += 37) {
      const { controls } = applyControlNoise(BASE, 0.3, cursor)
      expect(Number.isFinite(controls.roll)).toBe(true)
      expect(Number.isFinite(controls.pitch)).toBe(true)
      expect(Number.isFinite(controls.yaw)).toBe(true)
    }
  })

  it('green (higher controlNoise) jitters materially more than veteran on average', () => {
    const meanAbsRoll = (noiseStdDev: number): number => {
      let cursor = 777, sum = 0
      const N = 500
      for (let i = 0; i < N; i++) {
        const draw = applyControlNoise(BASE, noiseStdDev, cursor)
        sum += Math.abs(draw.controls.roll)
        cursor = draw.cursor
      }
      return sum / N
    }
    expect(meanAbsRoll(VETERAN_SKILL.controlNoise)).toBeLessThan(meanAbsRoll(GREEN_SKILL.controlNoise) * 0.5)
  })
})
```

- [x] **Step 2: Run to verify failure**

```bash
npx vitest run tests/sim/ai/noise.test.ts
```

Expected: FAIL — `src/sim/ai/noise.ts` does not exist yet.

- [x] **Step 3: Implement `src/sim/ai/noise.ts`**

```ts
import { createRng } from '../rng.js'
import type { Controls } from '../flight/state.js'

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

/** One mulberry32 draw plus its advanced cursor -- the same cursor-
 *  threading contract `src/sim/weapons/combat.ts`'s own `randomFrom` uses,
 *  kept as a separate cursor space so this system's draw count can never
 *  perturb combat's (master spec §3's replay guarantee). */
function randomFrom(cursor: number): { readonly value: number; readonly state: number } {
  return { value: createRng(cursor)(), state: (cursor + 0x6d2b79f5) >>> 0 }
}

/** A standard-normal sample via Box-Muller, consuming two cursor draws.
 *  `Math.max(u1.value, 1e-12)` keeps `Math.log` away from `-Infinity` on the
 *  (rare, possible) exact-zero mulberry32 draw. */
function normalFrom(cursor: number): { readonly value: number; readonly state: number } {
  const u1 = randomFrom(cursor)
  const u2 = randomFrom(u1.state)
  const r = Math.sqrt(-2 * Math.log(Math.max(u1.value, 1e-12)))
  return { value: r * Math.cos(2 * Math.PI * u2.value), state: u2.state }
}

/**
 * Deterministic, skill-scaled jitter on roll/pitch/yaw only -- never
 * throttle, gear, flaps, brake or fire (design §2's "wobbly, imprecise hand
 * on the stick," not a different decision). Always consumes exactly three
 * normal samples (six cursor draws) regardless of `noiseStdDev`, so the
 * cursor's advance rate never depends on skill -- only the jitter's
 * magnitude does.
 */
export function applyControlNoise(
  controls: Controls,
  noiseStdDev: number,
  cursor: number,
): { readonly controls: Controls; readonly cursor: number } {
  const roll = normalFrom(cursor)
  const pitch = normalFrom(roll.state)
  const yaw = normalFrom(pitch.state)
  return {
    controls: {
      ...controls,
      roll: clamp(controls.roll + roll.value * noiseStdDev, -1, 1),
      pitch: clamp(controls.pitch + pitch.value * noiseStdDev, -1, 1),
      yaw: clamp(controls.yaw + yaw.value * noiseStdDev, -1, 1),
    },
    cursor: yaw.state,
  }
}
```

- [x] **Step 4: Run the noise tests, verify pass**

```bash
npx vitest run tests/sim/ai/noise.test.ts
```

- [x] **Step 5: Wire noise into `maneuverControls` (`src/sim/ai/decision.ts`)**

```ts
export function maneuverControls<M>(
  self: AircraftEntity<M>,
  target: AircraftEntity<M>,
  decision: PilotDecisionState,
  skill: PilotSkill,
): { readonly controls: Controls; readonly decision: PilotDecisionState } {
  const perceived: AircraftEntity<M> = {
    ...target,
    state: { ...target.state, position: decision.observedTargetPosition, velocity: decision.observedTargetVelocity },
  }
  const base = decision.maneuver === 'pursue'
    ? pursuitControls(self, perceived)
    : controlsForDesiredVelocity(
        self.state, self.spec,
        decision.maneuver === 'extend' ? extendDesiredVelocity(self, perceived) : breakDesiredVelocity(self, perceived),
      )
  const { controls, cursor } = applyControlNoise(base, skill.controlNoise, decision.noiseCursor)
  return { controls, decision: { ...decision, noiseCursor: cursor } }
}
```

Import `applyControlNoise` from `./noise.js`.

- [x] **Step 6: Update the call site in `src/sim/loop.ts`**

```ts
const { controls, decision: steered } = maneuverControls(a, target, decision, a.pilot.skill)
commanded = { ...a, pilot: { ...a.pilot, decision: steered }, controls }
```

- [x] **Step 7: Update Task 2's two `decision.test.ts` cases for the new return shape and signature**

Both now read `.controls` off the result and pass a `skill` argument (use
`GREEN_SKILL` with `controlNoise: 0` overridden to isolate the staleness
assertion from noise — `{ ...GREEN_SKILL, controlNoise: 0 }`):

```ts
const NO_NOISE = { ...GREEN_SKILL, controlNoise: 0 }
// ...
const staleControls = maneuverControls(self, liveTarget, decision, NO_NOISE).controls
// ...
const freshControls = maneuverControls(self, liveTarget, liveDecision, NO_NOISE).controls
expect(staleControls).not.toEqual(freshControls)
// ...
expect(maneuverControls(self, target, decision, NO_NOISE).controls).toEqual(pursuitControls(self, target))
```

- [x] **Step 8: Run the full AI test suite, verify pass**

```bash
npx vitest run tests/sim/ai tests/sim/scenario.test.ts tests/sim/entities.test.ts
```

- [x] **Step 9: Run `npm run verify`**

```bash
npm run verify; rc=$?; echo rc=$rc
```

Expected: `rc=0`.

- [x] **Step 10: Commit**

```bash
git add src/sim/ai/noise.ts src/sim/ai/decision.ts src/sim/loop.ts \
  tests/sim/ai/noise.test.ts tests/sim/ai/decision.test.ts
git commit -m "Control noise: deterministic skill-scaled jitter on final roll/pitch/yaw"
```

---

### Task 4: Empirical tuning and golden-trajectory confirmation

**Files:**
- Modify: `src/sim/ai/pilot.ts` (`GREEN_SKILL.controlNoise` and
  `VETERAN_SKILL.controlNoise`'s final values and comments)
- No test files created; this task re-runs existing suites as verification.

**Interfaces:**
- Consumes: Task 3's `applyControlNoise`; the reference-GPU harness
  (`ww2airsim.windomlane.org`, per this repo's README "Tier 2: the GPU
  harness").
- Produces: nothing new for later tasks.

- [x] **Step 1: Confirm the golden-trajectory suite is untouched**

```bash
npx vitest run tests/sim/golden/trajectory.test.ts
```

Expected: PASS, bit-identical, unchanged from before this plan —
`recordTrajectory` never constructs a `PilotAssignment`, so this suite
never exercises any code this plan touches. If this fails, stop and
investigate before touching the golden file; do not assume the failure is
unrelated.

- [x] **Step 2: Fly the `pursuit-range` scenario at `green` skill on the reference GPU and observe the jitter**

```bash
ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org \
npx playwright test tests/e2e/ai-pursuit.spec.ts tests/e2e/ai-maneuver.spec.ts
```

Watch (or screenshot) `pursuer-1`'s flown path at the current `GREEN_SKILL.controlNoise`
value (0.15 from Task 1). Read the result directly rather than trusting a
number — per this repo's standing "never argue about a picture nobody
looked at" rule.

- [x] **Step 3: Adjust `GREEN_SKILL.controlNoise`/`VETERAN_SKILL.controlNoise` based on what was observed**

If `green`'s pursuer flies visibly smoothly (no perceptible wobble) or
absurdly erratically (over-corrects into its own stall/spin), adjust the
constant and re-run Step 2. Record the final chosen value with a dated,
measured comment matching this repo's own convention for tuned constants
(e.g. `SAFE_SEPARATION_M`'s "2x AI_GUN_RANGE_M (550m) as of this plan"
comment style):

```ts
// Measured 2026-09-24 on the reference GPU: 0.XX produces a visibly
// wobbly, human-scale flight path for `green` without inducing a stall;
// veteran's 0.0Y stays imperceptible in the same flight.
```

- [x] **Step 4: Run `npm run verify`**

```bash
npm run verify; rc=$?; echo rc=$rc
```

Expected: `rc=0`.

- [x] **Step 5: Commit**

```bash
git add src/sim/ai/pilot.ts
git commit -m "Tune controlNoise magnitudes against a real flight on the reference GPU"
```

---

### Task 5: Reference-GPU acceptance — the actual complaint this plan fixes

**Files:**
- Create: `tests/e2e/ai-pursuit-difficulty.spec.ts`

**Interfaces:**
- Consumes: everything above, plus `src/render/diagnostics.ts`'s
  `aircraft()` (`{ id, x, y, z, headingRad }`) and `src/input/bindings.ts`'s
  key bindings (`rollLeft`/`rollRight`: `ArrowLeft`/`ArrowRight`;
  `pitchUp`/`pitchDown`: `ArrowDown`/`ArrowUp`).

- [x] **Step 1: Write the Tier 2 spec**

```ts
// tests/e2e/ai-pursuit-difficulty.spec.ts
import { test, expect, type Page } from '@playwright/test'
import { percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'

/**
 * Tier 2, Plan 7d. The actual acceptance bar Mark's complaint sets: not
 * "some noise exists" but "a human-equivalent scripted evasion pattern can
 * now get behind pursuer-1 at green skill within a bounded time window,
 * where it could not before this change" (spec §5).
 */
const RANGE = `/?${SCENARIO_PARAM}=pursuit-range`

test.setTimeout(120_000)

type AircraftDiag = { readonly id: string; readonly x: number; readonly y: number; readonly z: number; readonly headingRad: number }

const aircraft = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.aircraft())

/** True when `player` is within `withinDeg` of directly behind `enemy`'s
 *  tail and inside `withinM` -- an approximation of "got behind it" using
 *  only the horizontal heading diagnostics already exposes (no full 3D
 *  attitude is available from `aircraft()`), which is the geometry this
 *  scenario's own combat plane is flown in. */
function isBehind(player: AircraftDiag, enemy: AircraftDiag, withinM: number, withinDeg: number): boolean {
  const dx = player.x - enemy.x, dz = player.z - enemy.z
  const rangeM = Math.hypot(dx, dz, player.y - enemy.y)
  if (rangeM > withinM) return false
  const bearingToPlayer = Math.atan2(dx, dz)
  const angleOff = Math.abs(Math.atan2(Math.sin(bearingToPlayer - enemy.headingRad), Math.cos(bearingToPlayer - enemy.headingRad)))
  return (angleOff * 180) / Math.PI < withinDeg
}

test('a scripted evasion-and-reversal lets the player get behind a green pursuer within a bounded window, where it could not before this plan', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  // green is this scenario's default skill (scenario.ts: `skill` defaults
  // to 'green' when the content omits it) -- pursuit-range's own content
  // omits it, so no URL override is needed here.
  await page.goto(RANGE)
  await waitForTerrain(page)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())

  // A hard break turn, sustained, then a reversal -- the textbook response
  // to a relentless six-o'clock pursuer: force an overshoot, then cut back
  // across its turn circle onto its tail. Held via keyboard.down/up, this
  // repo's existing e2e input-simulation convention (tests/e2e/gunnery.spec.ts,
  // approach.spec.ts).
  await page.keyboard.down('ArrowLeft')
  await page.keyboard.down('ArrowDown') // pitchUp binding is ArrowDown (src/input/bindings.ts)
  await page.waitForTimeout(4000)
  await page.keyboard.up('ArrowLeft')
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(3000)
  await page.keyboard.up('ArrowRight')
  await page.keyboard.up('ArrowDown')

  await expect
    .poll(
      async () => {
        const list = await aircraft(page)
        const player = list.find((a) => a.id === 'f6f-1')!
        const pursuer = list.find((a) => a.id === 'pursuer-1')!
        return isBehind(player, pursuer, 400, 45)
      },
      { timeout: 40_000, message: 'player never got behind pursuer-1 within the bounded window' },
    )
    .toBe(true)

  await page.screenshot({ path: 'test-results/ai-pursuit-difficulty.png' })

  const live = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { gpu: d.gpuFrameTimesMs(), errors: d.validationErrors }
  })
  expect(live.errors, `WebGPU validation errors:\n${JSON.stringify(live.errors, null, 2)}`).toEqual([])
  expect(live.gpu.length).toBeGreaterThan(120)
  const p95 = percentile(live.gpu, 0.95)
  console.log(`ai pursuit difficulty: gpu p95 ${p95.toFixed(3)} ms over ${live.gpu.length} samples`)
  expect(p95).toBeLessThan(6.0)
})
```

- [x] **Step 2: Run against the reference GPU**

```bash
ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org \
npx playwright test tests/e2e/ai-pursuit-difficulty.spec.ts
```

Expected: PASS. If the scripted evasion pattern does not work (the pursuer
still runs it down every time), that is real information, not a test bug —
read the screenshot, and consider whether Task 4's tuning needs revisiting
before editing the timing/pattern in this spec to make it pass artificially.

- [x] **Step 3: Commit**

```bash
git add tests/e2e/ai-pursuit-difficulty.spec.ts
git commit -m "Reference-GPU acceptance: a scripted evasion can now get behind a green pursuer"
```

---

## Closing (per this repo's own convention)

- [x] Write `docs/handoff/2026-09-24-plan7d-ai-pursuit-difficulty.md`
- [x] Update master spec §15's existing Plan 7 row (currently "7 | 14 —
  7a/7b complete | AI | §7 | ..."), appending a 7d entry in the same style
  as the existing 7a/7b sentences, linking this design doc, this plan, and
  the new handoff
- [x] Add a README paragraph pointing at §15
- [x] Not pushed/deployed without being asked, per standing convention
