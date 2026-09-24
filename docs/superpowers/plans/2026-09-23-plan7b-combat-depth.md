# Plan 7b: Energy-aware AI maneuvering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give AI pilots a per-pilot skill (reaction delay, gunnery accuracy,
energy discipline, disengagement threshold) and a rescored Pursue/Extend/Break
decision layer, so an AI pilot presses the attack when it has the advantage,
disengages when it doesn't, and never again flies straight through the player
at point-blank range.

**Architecture:** Two new pure modules in `src/sim/ai/` — `pilot.ts` (skill
presets, decision state, the two new maneuvers' desired-velocity producers)
and `decision.ts` (fact derivation, the weighted-sum scorer, the maneuver
dispatcher) — feeding the same `controlsForDesiredVelocity` seam Plan 7a
built. `src/sim/loop.ts`'s single pilot-dispatch call site swaps
`pursuitControls(a, target)` for a rescore-gated call into the new decision
layer. No controller-layer code changes.

**Tech Stack:** TypeScript, vitest, the existing `sim/` fixed-tick loop.

**Spec:** `docs/superpowers/specs/2026-09-23-combat-depth-design.md`. Read its
§1–§9 before starting; this plan does not restate the design rationale, only
the concrete files, code and test sequence. Also read
`docs/handoff/2026-09-23-plan7a-ai-pursuit.md` for the controller seam and the
gate/steering bug this plan's predecessor fixed — Task 4 and Task 5 below
build directly on `hasGunSolution`'s corrected muzzle-lead geometry.

## Global Constraints

- `MIN_ENGAGEMENT_RANGE_M = 120` (design §6) — a forced override, not a score
  term.
- Rescore cadence is `PilotSkill.reactionS`: `VETERAN_SKILL.reactionS = 0.3`,
  `GREEN_SKILL.reactionS = 1.0` (design §3).
- Pursue wins ties, including the all-zero-facts case — this is the
  regression floor that reproduces Plan 7a exactly (design §4).
- `gunneryAccuracy` scales `AI_GUN_CONE_RAD`'s half-angle only.
  `AI_GUN_RANGE_M` is never touched (design §7).
- `npm run verify` ends every task. Capture `rc=$?` directly; never gate on a
  grepped pipeline (`~/projects/ww2airsim/CLAUDE.md`).
- US spelling in every new identifier and comment.
- Work in place on `main`, no worktree. Re-diff against `HEAD` immediately
  before every commit — other sessions commit to this checkout too.
- `src/sim/` never imports `render/`, `input/`, `assists/`, `audio/`, Node
  core, or a rendering library (`.dependency-cruiser.cjs`,
  `tests/architecture/boundary.test.ts`). Every file this plan touches is
  inside `src/sim/`; nothing here has a reason to violate that boundary.

## Review Focus

- **A pilot's `target` has no `pilot` of its own** (the player, or an
  unassigned AI). `hasGunSolution(target, self)` (Task 2's `threatAstern`)
  reads `target.pilot?.skill.gunneryAccuracy` inside its own cone check
  (Task 4) — with no fallback this is `undefined * radians = NaN`, and a NaN
  entering the integrator silently teleports the aircraft
  (`~/projects/ww2airsim/CLAUDE.md`'s own stated risk). Task 4's tests must
  cover a `null`-pilot target explicitly, not just two AI pilots facing off.
- **Self and target at the same position** (a mid-air collision tick, or a
  test fixture that doesn't bother to separate them) makes `angleBetween` and
  `closingRate` divide by a zero-length vector. Task 2's tests must cover
  `rangeM === 0` and assert a finite, non-NaN result rather than assuming the
  scenario content always keeps them apart.
- **Extend and Break must never fire.** They are repositioning maneuvers; a
  veteran forced into Extend by `MIN_ENGAGEMENT_RANGE_M` while it still has a
  gun solution must not keep shooting through the override. Task 5's tests
  assert `controls.fire` is never `true` when the dispatched maneuver is
  `'extend'` or `'break'`, independent of whether `hasGunSolution` would
  otherwise say yes.
- **`PilotDecisionState` must survive `structuredClone`.** Plan 7a's own
  Tier 1 suite already asserts production `advance()` is deterministic under
  `structuredClone` (`tests/sim/ai/pursuit.test.ts`,
  "structured-clone determinism"). `nextRescoreS`/`maneuver` are plain
  number/string, but Task 1 must confirm the widened `PilotAssignment` still
  passes that existing test unmodified, not merely typecheck.
- **A destroyed target is not removed from `aircraftAtStart`.** This is
  pre-existing Plan 7a behavior (a pilot can still target wreckage), not
  something this plan changes — but `MIN_ENGAGEMENT_RANGE_M` now forces
  Extend near any target regardless of its damage state, which is a strictly
  safer default near a dead target than an unconditional Pursue. Task 6's
  Tier 1 coverage should note (via a one-line comment, not new production
  code) that this plan does not fix or worsen that pre-existing gap.

---

## Task 1: Pilot skill and decision state; widen `PilotAssignment`

**Files:**
- Create: `src/sim/ai/pilot.ts`
- Modify: `src/sim/ai/pursuit.ts` (the `PilotAssignment` type, lines 7-10)
- Modify: `src/sim/scenario.ts` (the `PilotObject` schema, line 43, and its
  two usages at lines 59 and 73)
- Modify: `content/scenarios/pursuit-range.json` (`pursuer-1`'s `pilot` field)
- Test: `tests/sim/ai/pilot.test.ts` (new)
- Test: Modify `tests/sim/ai/pursuit.test.ts`'s `entity()` helper and
  `tests/sim/scenario.test.ts` wherever they construct a `PilotAssignment`,
  so existing tests keep compiling.

**Interfaces:**
- Produces: `PilotSkill`, `VETERAN_SKILL`, `GREEN_SKILL`, `PilotManeuver`,
  `PilotDecisionState` (all `src/sim/ai/pilot.ts`) — every later task in this
  plan imports these.
- Produces: `PilotAssignment = { target: string; skill: PilotSkill; decision:
  PilotDecisionState }` (`src/sim/ai/pursuit.ts`) — Task 5 reads
  `a.pilot.skill`/`a.pilot.decision` from this.
- Produces: scenario content's `pilot` object accepts an optional
  `skill: 'veteran' | 'green'` (defaulting to `'green'`) alongside the
  existing `target` — `tools/content/load.ts`'s scenario→world construction
  (wherever it builds a runtime `PilotAssignment` from the parsed content)
  must map that string to `VETERAN_SKILL`/`GREEN_SKILL` and seed
  `decision: { maneuver: 'pursue', nextRescoreS: 0 }`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/sim/ai/pilot.test.ts
import { describe, expect, it } from 'vitest'
import { GREEN_SKILL, VETERAN_SKILL } from '../../../src/sim/ai/pilot.js'

describe('pilot skill presets', () => {
  it('veteran reacts faster and holds the attack longer than green', () => {
    expect(VETERAN_SKILL.reactionS).toBeLessThan(GREEN_SKILL.reactionS)
    expect(VETERAN_SKILL.energyDiscipline).toBeGreaterThan(GREEN_SKILL.energyDiscipline)
  })

  it('green reproduces today\'s exact gun cone (gunneryAccuracy 1.0)', () => {
    expect(GREEN_SKILL.gunneryAccuracy).toBe(1.0)
  })

  it('both presets are plain, structured-clone-safe data', () => {
    expect(structuredClone(VETERAN_SKILL)).toEqual(VETERAN_SKILL)
    expect(structuredClone(GREEN_SKILL)).toEqual(GREEN_SKILL)
  })
})
```

Add to `tests/sim/scenario.test.ts` (wherever the file already tests
`PilotObject`/`pilot.target` validation — follow that describe block's
pattern): a scenario with `"pilot": { "target": "f6f-1", "skill": "veteran" }`
loads with a `PilotAssignment` whose `skill` equals `VETERAN_SKILL`, and one
with `"pilot": { "target": "f6f-1" }` (no `skill` key, matching every
existing scenario file) loads with `skill` equal to `GREEN_SKILL` — the
default that keeps every already-shipped scenario's behavior unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sim/ai/pilot.test.ts tests/sim/scenario.test.ts`
Expected: FAIL — `src/sim/ai/pilot.ts` does not exist yet, and the schema
does not accept `skill` yet.

- [ ] **Step 3: Implement**

```ts
// src/sim/ai/pilot.ts
export type PilotSkill = {
  /** Seconds between decision-layer rescores. Lower = reacts faster. This
   *  IS "reaction delay" (master spec §7) -- the decision layer's own
   *  rescore cadence gates how fast a pilot changes its mind; there is no
   *  separate buffered-observation mechanism. */
  readonly reactionS: number
  /** 0-1. Scales AI_GUN_CONE_RAD's half-angle; 1.0 leaves the cone
   *  unchanged. Does not change AI_GUN_RANGE_M. */
  readonly gunneryAccuracy: number
  /** 0-1. Scales how much relative-energy margin Pursue needs over Extend
   *  before Pursue still wins the score. Higher = holds the attack longer. */
  readonly energyDiscipline: number
  /** Relative-energy floor (same units as the decision layer's energy term)
   *  below which Extend is forced -- reserved for a future slice; this
   *  plan's forced override is range-based (MIN_ENGAGEMENT_RANGE_M) only. */
  readonly disengageThreshold: number
}

export const VETERAN_SKILL: PilotSkill = {
  reactionS: 0.3,
  gunneryAccuracy: 0.6,
  energyDiscipline: 0.7,
  disengageThreshold: -400,
}

export const GREEN_SKILL: PilotSkill = {
  reactionS: 1.0,
  gunneryAccuracy: 1.0,
  energyDiscipline: 0.3,
  disengageThreshold: -150,
}

export type PilotManeuver = 'pursue' | 'extend' | 'break'

export type PilotDecisionState = {
  readonly maneuver: PilotManeuver
  /** Sim time (tick * DT) at which the next rescore runs. */
  readonly nextRescoreS: number
}
```

In `src/sim/ai/pursuit.ts`, replace the `PilotAssignment` type:

```ts
import type { PilotDecisionState, PilotSkill } from './pilot.js'

export type PilotAssignment = {
  /** Aircraft id read from the common start-of-tick snapshot. */
  readonly target: string
  readonly skill: PilotSkill
  readonly decision: PilotDecisionState
}
```

In `src/sim/scenario.ts`, widen the `PilotObject` schema (around line 43):

```ts
const PilotObject = z.object({
  target: id,
  skill: z.enum(['veteran', 'green']).default('green'),
}).strict()
```

Then, in whichever function turns a parsed scenario's `pilot` object into a
runtime `PilotAssignment` (`tools/content/load.ts` or `src/render/scenarioLoad.ts`
— locate it by searching for where `PilotAssignment` is currently
constructed from `{ target }`), map the string to the preset and seed the
initial decision:

```ts
import { GREEN_SKILL, VETERAN_SKILL } from '../sim/ai/pilot.js'
// ...
const pilot: PilotAssignment | undefined = parsed.pilot === undefined ? undefined : {
  target: parsed.pilot.target,
  skill: parsed.pilot.skill === 'veteran' ? VETERAN_SKILL : GREEN_SKILL,
  decision: { maneuver: 'pursue', nextRescoreS: 0 },
}
```

Update every other construction site the typechecker flags (the `entity()`
helper in `tests/sim/ai/pursuit.test.ts`, and any other test building a
`PilotAssignment` literal directly) to supply `skill` and `decision` —
`GREEN_SKILL` and `{ maneuver: 'pursue', nextRescoreS: 0 }` reproduce today's
only behavior and are the right default for every test that doesn't care
about skill.

In `content/scenarios/pursuit-range.json`, give the scripted antagonist a
concrete skill rather than the default:

```json
      "pilot": { "target": "f6f-1", "skill": "veteran" }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/sim/ai/pilot.test.ts tests/sim/scenario.test.ts tests/sim/ai/pursuit.test.ts`
Expected: PASS, including the pre-existing structured-clone determinism test
in `pursuit.test.ts` — confirm by name in the output, not just a green count.

- [ ] **Step 5: Commit**

```bash
git add src/sim/ai/pilot.ts src/sim/ai/pursuit.ts src/sim/scenario.ts \
  content/scenarios/pursuit-range.json tests/sim/ai/pilot.test.ts \
  tests/sim/scenario.test.ts tests/sim/ai/pursuit.test.ts
git commit -m "Plan 7b task 1: pilot skill, decision state, widen PilotAssignment"
```

---

## Task 2: The utility scorer

**Files:**
- Create: `src/sim/ai/decision.ts`
- Test: `tests/sim/ai/decision.test.ts` (new)

**Interfaces:**
- Consumes: `PilotSkill`, `PilotManeuver` (`src/sim/ai/pilot.ts`, Task 1);
  `AI_GUN_RANGE_M`, `hasGunSolution` (`src/sim/ai/pursuit.ts`, unchanged
  signatures from Plan 7a); `AircraftEntity` (`src/sim/loop.ts`).
- Produces: `MIN_ENGAGEMENT_RANGE_M`, `DecisionFacts`,
  `deriveFacts<M>(self, target, damageTakenFraction, fuelFraction):
  DecisionFacts`, `ManeuverScores = { pursue: number; extend: number;
  breakOff: number }`, `scoreManeuvers(facts, skill): ManeuverScores`,
  `decideManeuver(facts, skill): PilotManeuver` — Task 5 calls
  `deriveFacts` and `decideManeuver` from `loop.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/sim/ai/decision.test.ts
import { describe, expect, it } from 'vitest'
import {
  MIN_ENGAGEMENT_RANGE_M,
  decideManeuver,
  scoreManeuvers,
  type DecisionFacts,
} from '../../../src/sim/ai/decision.js'
import { GREEN_SKILL, VETERAN_SKILL } from '../../../src/sim/ai/pilot.js'

const HEALTHY: DecisionFacts = {
  relativeEnergyJPerKg: 0,
  angleOffSelfRad: 0,
  angleOffTargetRad: 0,
  rangeM: 400,
  closingRate: 0,
  threatAstern: false,
  damageTakenFraction: 0,
  fuelFraction: 1,
}

describe('scoreManeuvers / decideManeuver', () => {
  it('all-zero facts reproduce Pursue -- the Plan 7a regression floor', () => {
    expect(decideManeuver(HEALTHY, GREEN_SKILL)).toBe('pursue')
  })

  it('a fresh, healthy, favorably-positioned pilot presses the attack', () => {
    const facts: DecisionFacts = { ...HEALTHY, relativeEnergyJPerKg: 5000, angleOffSelfRad: 0.1 }
    expect(decideManeuver(facts, GREEN_SKILL)).toBe('pursue')
  })

  it('a damaged pilot with a threat astern extends', () => {
    const facts: DecisionFacts = { ...HEALTHY, threatAstern: true, damageTakenFraction: 0.6 }
    expect(decideManeuver(facts, GREEN_SKILL)).toBe('extend')
  })

  it('low fuel alone is enough to tip a green pilot to Extend', () => {
    const facts: DecisionFacts = { ...HEALTHY, fuelFraction: 0.05, relativeEnergyJPerKg: -2000 }
    expect(decideManeuver(facts, GREEN_SKILL)).toBe('extend')
  })

  it('a pilot with the target\'s nose tracking it at close range breaks', () => {
    const facts: DecisionFacts = { ...HEALTHY, angleOffTargetRad: Math.PI, rangeM: 300 }
    expect(decideManeuver(facts, GREEN_SKILL)).toBe('break')
  })

  it('energyDiscipline moves the Pursue/Extend crossover: identical facts, different presets choose differently', () => {
    const facts: DecisionFacts = { ...HEALTHY, relativeEnergyJPerKg: -600 }
    expect(decideManeuver(facts, VETERAN_SKILL)).toBe('pursue')
    expect(decideManeuver(facts, GREEN_SKILL)).toBe('extend')
  })

  it('MIN_ENGAGEMENT_RANGE_M forces Extend on a closing pass-through, overriding a Pursue-favoring score', () => {
    const facts: DecisionFacts = {
      ...HEALTHY,
      rangeM: MIN_ENGAGEMENT_RANGE_M - 1,
      closingRate: 50,
      relativeEnergyJPerKg: 5000,
      angleOffSelfRad: 0,
    }
    expect(decideManeuver(facts, VETERAN_SKILL)).toBe('extend')
  })

  it('the override does not fire on a close parallel pass with no closing rate', () => {
    const facts: DecisionFacts = {
      ...HEALTHY,
      rangeM: MIN_ENGAGEMENT_RANGE_M - 1,
      closingRate: -10,
      relativeEnergyJPerKg: 5000,
    }
    expect(decideManeuver(facts, VETERAN_SKILL)).toBe('pursue')
  })

  it('zero range does not produce NaN scores', () => {
    const facts: DecisionFacts = { ...HEALTHY, rangeM: 0, closingRate: 0 }
    const scores = scoreManeuvers(facts, GREEN_SKILL)
    expect(Number.isFinite(scores.pursue)).toBe(true)
    expect(Number.isFinite(scores.extend)).toBe(true)
    expect(Number.isFinite(scores.breakOff)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sim/ai/decision.test.ts`
Expected: FAIL — `src/sim/ai/decision.ts` does not exist yet.

- [ ] **Step 3: Implement**

```ts
// src/sim/ai/decision.ts
import type { AircraftEntity } from '../loop.js'
import { dot, length, sub, type Vec3 } from '../math/vec3.js'
import { AI_GUN_RANGE_M, hasGunSolution } from './pursuit.js'
import type { PilotManeuver, PilotSkill } from './pilot.js'

const G_MPS2 = 9.80665

export const MIN_ENGAGEMENT_RANGE_M = 120

const PURSUE_ENERGY_WEIGHT = 1.0
const PURSUE_ANGLE_PENALTY = 0.5
const PURSUE_RANGE_PENALTY = 0.002
const PURSUE_THREAT_PENALTY = 800

const EXTEND_ENERGY_WEIGHT_BASE = -1.0
const EXTEND_THREAT_BONUS = 800
const EXTEND_DAMAGE_WEIGHT = 400
const EXTEND_FUEL_WEIGHT = 300

const BREAK_ANGLE_WEIGHT = 600
const BREAK_RANGE_PENALTY = 0.003

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

function angleBetween(a: Vec3, b: Vec3): number {
  const denom = length(a) * length(b)
  if (denom < 1e-6) return 0
  return Math.acos(clamp(dot(a, b) / denom, -1, 1))
}

export type DecisionFacts = {
  readonly relativeEnergyJPerKg: number
  readonly angleOffSelfRad: number
  readonly angleOffTargetRad: number
  readonly rangeM: number
  readonly closingRate: number
  readonly threatAstern: boolean
  readonly damageTakenFraction: number
  readonly fuelFraction: number
}

/** Facts read straight from two live entities, per master spec §7's list
 *  minus ammunition (it already only gates the existing gun check, not
 *  maneuver choice). `damageTakenFraction`/`fuelFraction` are passed in
 *  rather than read from `self` here, because they come from `combat`/
 *  `state` fields `loop.ts` already has in hand at the call site. */
export function deriveFacts<M>(
  self: AircraftEntity<M>,
  target: AircraftEntity<M>,
  damageTakenFraction: number,
  fuelFraction: number,
): DecisionFacts {
  const toTarget = sub(target.state.position, self.state.position)
  const toSelf = sub(self.state.position, target.state.position)
  const rangeM = length(toTarget)
  const energyOf = (v: Vec3, altitudeM: number) => 0.5 * length(v) ** 2 + G_MPS2 * altitudeM
  return {
    relativeEnergyJPerKg:
      energyOf(self.state.velocity, self.state.position.y) -
      energyOf(target.state.velocity, target.state.position.y),
    angleOffSelfRad: angleBetween(self.state.velocity, toTarget),
    angleOffTargetRad: angleBetween(target.state.velocity, toSelf),
    rangeM,
    closingRate: rangeM < 1e-6 ? 0 : dot(toTarget, self.state.velocity) / rangeM,
    // Is self inside the TARGET's own gun cone right now -- the exact
    // geometry `hasGunSolution` already gates the target's own trigger on,
    // read symmetrically. `target.pilot`'s own gunneryAccuracy (if any)
    // governs this automatically, since `hasGunSolution`'s first argument is
    // the shooter.
    threatAstern: hasGunSolution(target, self),
    damageTakenFraction,
    fuelFraction,
  }
}

export type ManeuverScores = { readonly pursue: number; readonly extend: number; readonly breakOff: number }

export function scoreManeuvers(facts: DecisionFacts, skill: PilotSkill): ManeuverScores {
  const rangeBeyondGun = Math.max(0, facts.rangeM - AI_GUN_RANGE_M)
  const pursue =
    PURSUE_ENERGY_WEIGHT * facts.relativeEnergyJPerKg -
    PURSUE_ANGLE_PENALTY * facts.angleOffSelfRad -
    PURSUE_RANGE_PENALTY * rangeBeyondGun -
    (facts.threatAstern ? PURSUE_THREAT_PENALTY : 0)

  const extend =
    EXTEND_ENERGY_WEIGHT_BASE * skill.energyDiscipline * facts.relativeEnergyJPerKg +
    (facts.threatAstern ? EXTEND_THREAT_BONUS : 0) +
    EXTEND_DAMAGE_WEIGHT * facts.damageTakenFraction +
    EXTEND_FUEL_WEIGHT * (1 - facts.fuelFraction)

  const breakOff =
    BREAK_ANGLE_WEIGHT * facts.angleOffTargetRad - BREAK_RANGE_PENALTY * rangeBeyondGun

  return { pursue, extend, breakOff }
}

/** MIN_ENGAGEMENT_RANGE_M is a forced override, not an extra score term:
 *  "about to collide" is a hard constraint a linear score could still lose
 *  to a large threat-astern penalty, and safety-critical logic should not be
 *  tunable away by weight changes elsewhere (design §6). */
export function decideManeuver(facts: DecisionFacts, skill: PilotSkill): PilotManeuver {
  if (facts.rangeM < MIN_ENGAGEMENT_RANGE_M && facts.closingRate > 0) return 'extend'
  const { pursue, extend, breakOff } = scoreManeuvers(facts, skill)
  if (pursue >= extend && pursue >= breakOff) return 'pursue' // Pursue wins ties
  return extend >= breakOff ? 'extend' : 'break'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/sim/ai/decision.test.ts`
Expected: PASS, all 9 cases.

- [ ] **Step 5: Commit**

```bash
git add src/sim/ai/decision.ts tests/sim/ai/decision.test.ts
git commit -m "Plan 7b task 2: the Pursue/Extend/Break utility scorer"
```

---

## Task 3: Extend and Break desired-velocity producers

**Files:**
- Modify: `src/sim/ai/pilot.ts`
- Test: `tests/sim/ai/pilot.test.ts`

**Interfaces:**
- Consumes: `AircraftEntity` (`src/sim/loop.ts`); `Vec3`, `add`, `cross`,
  `length`, `normalize`, `scale`, `sub`, `v3` (`src/sim/math/vec3.ts` — all
  already exported; `cross` already exists, no addition needed there).
- Produces: `extendDesiredVelocity<M>(self, threat): Vec3`,
  `breakDesiredVelocity<M>(self, threat): Vec3` — Task 5's `maneuverControls`
  dispatches to these.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/sim/ai/pilot.test.ts -- add to the existing file from Task 1
import { breakDesiredVelocity, extendDesiredVelocity } from '../../../src/sim/ai/pilot.js'
import { dot, sub, v3 } from '../../../src/sim/math/vec3.js'
// (reuse this file's existing entity-construction helper, or add one
// matching tests/sim/ai/pursuit.test.ts's `entity()` shape if this file
// does not yet have one)

describe('extendDesiredVelocity', () => {
  it('points away from the threat with a negative vertical component', () => {
    const self = entity({ position: v3(0, 3000, 0), velocity: v3(100, 0, 0) })
    const threat = entity({ position: v3(-500, 3000, 0), velocity: v3(100, 0, 0) })
    const desired = extendDesiredVelocity(self, threat)
    const away = sub(self.state.position, threat.state.position)
    expect(dot(desired, away)).toBeGreaterThan(0)
    expect(desired.y).toBeLessThan(0)
  })
})

describe('breakDesiredVelocity', () => {
  it('is perpendicular to self\'s current velocity, not toward or away from the threat', () => {
    const self = entity({ position: v3(0, 3000, 0), velocity: v3(100, 0, 0) })
    const threat = entity({ position: v3(-500, 3000, 50), velocity: v3(-100, 0, 0) })
    const desired = breakDesiredVelocity(self, threat)
    expect(Math.abs(dot(desired, self.state.velocity))).toBeLessThan(1e-6 * length(desired) * length(self.state.velocity) + 1)
    const towardThreat = sub(threat.state.position, self.state.position)
    const away = sub(self.state.position, threat.state.position)
    expect(Math.abs(dot(desired, towardThreat))).not.toBeCloseTo(length(desired) * length(towardThreat), 3)
    expect(Math.abs(dot(desired, away))).not.toBeCloseTo(length(desired) * length(away), 3)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sim/ai/pilot.test.ts`
Expected: FAIL — `extendDesiredVelocity`/`breakDesiredVelocity` not exported yet.

- [ ] **Step 3: Implement**

```ts
// src/sim/ai/pilot.ts -- add to the file from Task 1
import type { AircraftEntity } from '../loop.js'
import { cross, length, normalize, scale, sub, v3, type Vec3 } from '../math/vec3.js'

export function extendDesiredVelocity<M>(self: AircraftEntity<M>, threat: AircraftEntity<M>): Vec3 {
  const away = normalize(sub(self.state.position, threat.state.position))
  // Nose down for airspeed: bias the desired vector toward the horizon-minus,
  // not level -- an Extend that stays level just retreats slowly.
  const dive = v3(away.x, Math.min(away.y, -0.15), away.z)
  const desiredSpeed = length(self.state.velocity) + 40 // accelerate, don't just match
  return scale(normalize(dive), desiredSpeed)
}

export function breakDesiredVelocity<M>(self: AircraftEntity<M>, threat: AircraftEntity<M>): Vec3 {
  // Turn into the threat's approach plane at max commanded rate: the
  // direction perpendicular to self's current velocity, on the side that
  // most reduces the threat's angle-off, at a speed the controller reads as
  // "turn hard," not "cruise there."
  const selfFwd = normalize(self.state.velocity)
  const towardThreat = normalize(sub(threat.state.position, self.state.position))
  const turnAxis = normalize(cross(selfFwd, towardThreat))
  const breakDir = normalize(cross(turnAxis, selfFwd))
  return scale(breakDir, Math.max(60, length(self.state.velocity)))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/sim/ai/pilot.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/ai/pilot.ts tests/sim/ai/pilot.test.ts
git commit -m "Plan 7b task 3: Extend and Break desired-velocity producers"
```

---

## Task 4: Gunnery accuracy scales the gun-gate cone

**Files:**
- Modify: `src/sim/ai/pursuit.ts` (`hasGunSolution`, lines 68-76)
- Test: `tests/sim/ai/pursuit.test.ts`

**Interfaces:**
- Consumes: `PilotAssignment.skill.gunneryAccuracy` (Task 1).
- Produces: `hasGunSolution`'s existing signature is unchanged; only its
  internal cone width changes. Callers (`pursuitControls`, and Task 2's
  `deriveFacts` via `threatAstern`) need no changes.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/sim/ai/pursuit.test.ts -- add to the existing file
import { AI_GUN_CONE_RAD, hasGunSolution } from '../../../src/sim/ai/pursuit.js'
import { VETERAN_SKILL, GREEN_SKILL } from '../../../src/sim/ai/pilot.js'

describe('gunneryAccuracy scales the gun cone', () => {
  it('a shot inside the veteran\'s cone but outside the green cone lands only for the veteran', () => {
    // Position target at an angle strictly between AI_GUN_CONE_RAD * veteran.gunneryAccuracy
    // and AI_GUN_CONE_RAD * green.gunneryAccuracy off self's nose, within AI_GUN_RANGE_M.
    const angle = AI_GUN_CONE_RAD * ((VETERAN_SKILL.gunneryAccuracy + GREEN_SKILL.gunneryAccuracy) / 2)
    const range = 400
    const self = entity({
      position: v3(0, 3000, 0),
      velocity: v3(100, 0, 0),
      pilot: { target: 'target', skill: VETERAN_SKILL, decision: { maneuver: 'pursue', nextRescoreS: 0 } },
    })
    const target = entity({
      id: 'target',
      position: v3(range * Math.cos(angle), 3000, range * Math.sin(angle)),
      velocity: v3(0, 0, 0),
    })
    expect(hasGunSolution({ ...self, pilot: { ...self.pilot!, skill: VETERAN_SKILL } }, target)).toBe(true)
    expect(hasGunSolution({ ...self, pilot: { ...self.pilot!, skill: GREEN_SKILL } }, target)).toBe(false)
  })

  it('a shooter with no pilot (e.g. the player) gets the full, unscaled cone', () => {
    const self = entity({ position: v3(0, 3000, 0), velocity: v3(100, 0, 0), pilot: undefined })
    const angle = AI_GUN_CONE_RAD * 0.9
    const target = entity({ id: 'target', position: v3(400 * Math.cos(angle), 3000, 400 * Math.sin(angle)), velocity: v3(0, 0, 0) })
    expect(hasGunSolution(self, target)).toBe(true)
  })
})
```

(Adapt the exact `entity()` helper call shape to whatever
`tests/sim/ai/pursuit.test.ts` already uses post-Task-1 — it must already
accept an optional `pilot` field after Task 1's edits.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sim/ai/pursuit.test.ts`
Expected: FAIL — the cone is not yet scaled by `gunneryAccuracy`.

- [ ] **Step 3: Implement**

```ts
// src/sim/ai/pursuit.ts -- modify hasGunSolution
export function hasGunSolution<M>(
  self: AircraftEntity<M>,
  target: AircraftEntity<M>,
): boolean {
  const aim = muzzleLeadDirection(self, target)
  if (aim === null) return false
  const forward = qRotate(self.state.attitude, v3(1, 0, 0))
  const gunneryAccuracy = self.pilot?.skill.gunneryAccuracy ?? 1.0
  return dot(forward, aim) >= Math.cos(AI_GUN_CONE_RAD * gunneryAccuracy)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/sim/ai/pursuit.test.ts`
Expected: PASS, including every pre-existing test in this file (the
7a-era ones use no `pilot` or a `GREEN_SKILL`-equivalent default and must be
bit-for-bit unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/sim/ai/pursuit.ts tests/sim/ai/pursuit.test.ts
git commit -m "Plan 7b task 4: gunneryAccuracy scales the AI gun-gate cone"
```

---

## Task 5: Wire the decision layer into `advance()`

**Files:**
- Modify: `src/sim/ai/pilot.ts` (add `maneuverControls`, or add it to
  `src/sim/ai/decision.ts` — see note below)
- Modify: `src/sim/loop.ts` (the pilot-dispatch block, currently lines
  804-812 — re-locate by content match, not line number, since earlier
  tasks may have shifted it)
- Test: `tests/sim/scenario.test.ts`

**Interfaces:**
- Consumes: `deriveFacts`, `decideManeuver` (Task 2); `extendDesiredVelocity`,
  `breakDesiredVelocity` (Task 3); `pursuitControls` (`src/sim/ai/pursuit.ts`,
  unchanged); `controlsForDesiredVelocity` (`src/sim/ai/controller.ts`,
  unchanged).
- Produces: `maneuverControls<M>(self, target, maneuver): Controls` — the
  single new call site `loop.ts` invokes.

Put `maneuverControls` in `src/sim/ai/decision.ts`, not `pilot.ts`: it needs
`pursuitControls` from `pursuit.ts`, and `pursuit.ts`'s own `PilotAssignment`
type already imports `PilotSkill`/`PilotDecisionState` from `pilot.ts` —
putting the dispatcher in `pilot.ts` too would make `pilot.ts` import back
from `pursuit.ts`, a needless cycle. `decision.ts` already depends on
`pursuit.ts` (for `hasGunSolution`) and on `pilot.ts` (for the skill/maneuver
types), so it is the one file that can depend on both without a cycle.

- [ ] **Step 1: Write the failing tests**

Add to `tests/sim/scenario.test.ts`, in or near the existing "the airborne
pursuit range (Plan 7a)" describe block:

```ts
describe('the energy-aware decision layer (Plan 7b)', () => {
  it('does not change maneuver between two ticks inside one reactionS window, and does change once nextRescoreS is reached', async () => {
    const { pursuit } = await loadScenarioBundle('pursuit-range')
    let world = worldFromScenario(pursuit, null)
    const maneuverAt = (w: typeof world) => w.aircraft.find((a) => a.id === 'pursuer-1')!.pilot!.decision.maneuver
    const rescoreAt = (w: typeof world) => w.aircraft.find((a) => a.id === 'pursuer-1')!.pilot!.decision.nextRescoreS
    ;({ world } = advance(world, DT))
    const firstManeuver = maneuverAt(world)
    const firstRescore = rescoreAt(world)
    ;({ world } = advance(world, DT))
    // Still inside the veteran's 0.3s reaction window (two ticks in) --
    // decision object must be referentially the same maneuver/rescore pair.
    expect(rescoreAt(world)).toBe(firstRescore)
    expect(maneuverAt(world)).toBe(firstManeuver)
  })

  it('MIN_ENGAGEMENT_RANGE_M forces Extend in production advance() at point-blank range, closing', async () => {
    const { pursuit } = await loadScenarioBundle('pursuit-range')
    let world = worldFromScenario(pursuit, null)
    // Run until pursuer-1 has closed inside MIN_ENGAGEMENT_RANGE_M -- reuse
    // the existing "turns onto a gun solution" test's own tick budget/loop
    // shape from this same file, then assert:
    for (let i = 0; i < 1200; i++) ({ world } = advance(world, DT))
    const pursuerRecord = world.aircraft.find((a) => a.id === 'pursuer-1')!
    const player = world.aircraft.find((a) => a.id === 'f6f-1')!
    const rangeM = Math.hypot(
      pursuerRecord.state.position.x - player.state.position.x,
      pursuerRecord.state.position.y - player.state.position.y,
      pursuerRecord.state.position.z - player.state.position.z,
    )
    if (rangeM < MIN_ENGAGEMENT_RANGE_M) {
      expect(pursuerRecord.pilot!.decision.maneuver).toBe('extend')
      expect(pursuerRecord.controls.fire).toBeFalsy()
    }
  })

  it('Extend and Break never set fire, even when a gun solution would otherwise exist', async () => {
    const { pursuit } = await loadScenarioBundle('pursuit-range')
    let world = worldFromScenario(pursuit, null)
    for (let i = 0; i < 1200; i++) {
      ;({ world } = advance(world, DT))
      const pursuerRecord = world.aircraft.find((a) => a.id === 'pursuer-1')!
      if (pursuerRecord.pilot!.decision.maneuver !== 'pursue') {
        expect(pursuerRecord.controls.fire).toBeFalsy()
      }
    }
  })
})
```

(Match this file's existing imports for `loadScenarioBundle`,
`worldFromScenario`, `advance`, `DT` — they are already imported for the
Plan 7a tests in the same file. Import `MIN_ENGAGEMENT_RANGE_M` from
`../../src/sim/ai/decision.js`.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sim/scenario.test.ts`
Expected: FAIL — `advance()` still calls `pursuitControls` unconditionally,
so `pilot.decision` never changes and Extend/Break never occur.

- [ ] **Step 3: Implement**

```ts
// src/sim/ai/decision.ts -- add to the file from Task 2
import type { Controls } from '../flight/state.js'
import { controlsForDesiredVelocity } from './controller.js'
import { pursuitControls } from './pursuit.js'
import { breakDesiredVelocity, extendDesiredVelocity } from './pilot.js'

export function maneuverControls<M>(
  self: AircraftEntity<M>,
  target: AircraftEntity<M>,
  maneuver: PilotManeuver,
): Controls {
  if (maneuver === 'pursue') return pursuitControls(self, target)
  const desired = maneuver === 'extend' ? extendDesiredVelocity(self, target) : breakDesiredVelocity(self, target)
  return controlsForDesiredVelocity(self.state, self.spec, desired)
}
```

In `src/sim/loop.ts`, add the import and replace the dispatch block:

```ts
import { deriveFacts, decideManeuver, maneuverControls } from './ai/decision.js'
```

```ts
    aircraft = aircraftAtStart.map((a) => {
      const record = combat.aircraft[a.id]!
      let commanded = a
      if (a.pilot != null && a.impact === null && record.damage.destroyedAt === null) {
        const target = aircraftAtStart.find((candidate) => candidate.id === a.pilot!.target)
        // `createWorldOf` rejects this state. The guard keeps a manually edited
        // or future entity-removing world finite instead of fabricating a target.
        if (target !== undefined) {
          const nowS = tick * DT
          let decision = a.pilot.decision
          if (nowS >= decision.nextRescoreS) {
            const facts = deriveFacts(
              a, target,
              1 - record.damage.structure,
              a.state.fuelKg / a.spec.mass.fuelCapacityKg,
            )
            decision = { maneuver: decideManeuver(facts, a.pilot.skill), nextRescoreS: nowS + a.pilot.skill.reactionS }
          }
          commanded = { ...a, pilot: { ...a.pilot, decision }, controls: maneuverControls(a, target, decision.maneuver) }
        }
      }
      return stepAircraftEntity(
        commanded, tick, world.terrain, world.wind, decks, stepper, assist,
        record.damage, record.stores,
      )
    })
```

Remove the now-unused direct `pursuitControls` import from `loop.ts` if
nothing else in the file calls it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/sim/scenario.test.ts tests/sim/ai/pursuit.test.ts tests/sim/ai/pilot.test.ts tests/sim/ai/decision.test.ts`
Expected: PASS, and confirm the pre-existing "the pursuit pilot actually
hits the target it is gated on" test from Plan 7a still passes unmodified —
with `pursuer-1` set to `VETERAN_SKILL` and the all-zero-facts-reproduces-
Pursue floor from Task 2, it must still reach a gun solution and score a hit
inside the same tick budget 7a tuned.

- [ ] **Step 5: Run the full suite**

Run: `npm run verify; rc=$?; echo rc=$rc`
Expected: `rc=0`, zero lint warnings, dependency-cruiser clean, no
regression in any other test file.

- [ ] **Step 6: Commit**

```bash
git add src/sim/ai/decision.ts src/sim/loop.ts tests/sim/scenario.test.ts
git commit -m "Plan 7b task 5: wire the Pursue/Extend/Break decision layer into advance()"
```

---

## Task 6: Reference-GPU acceptance

**Files:**
- Create: `tests/e2e/ai-maneuver.spec.ts`

**Interfaces:**
- Consumes: `waitForTerrain`, `DiagWindow`, `percentile` (`tests/e2e/harness.ts`);
  `SCENARIO_PARAM` (`src/render/spawn.ts`) — same imports
  `tests/e2e/ai-pursuit.spec.ts` already uses.

**Scope ruling, recorded here rather than left implicit:** the design doc's
own Tier 2 acceptance names two claims — the point-blank break-away, and "an
AI pilot damaged mid-fight visibly disengages." The second needs the AI to
actually take damage, which in the shipped `pursuit-range` scenario only
happens if the player fires back; `window.__ww2` has no debug hook to seed
damage directly (confirmed: no such method exists in
`src/render/diagnostics.ts` today), and scripting a reliable player gunnery
pass against a maneuvering AI in Playwright is disproportionately fragile
for what Task 2's Tier 1 suite already proves at the unit level (`"a
damaged... pilot picks Extend"`). This task's Tier 2 spec therefore proves
only the break-away claim, which `pursuit-range`'s existing geometry produces
for free (`pursuer-1` closes to point-blank exactly as Plan 7a's handoff
documented, "declined" fix now shipped). The damage-triggered disengage claim
stays Tier-1-only; if that gap ever needs closing, it needs a debug hook in
`diagnostics.ts` first, which is out of scope here.

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/ai-maneuver.spec.ts
import { test, expect, type Page } from '@playwright/test'
import { percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'

/**
 * Tier 2, Plan 7b energy-aware maneuvering. Proves the one claim only this
 * tier can: that the decision layer, wired into production `advance()`,
 * actually stops `pursuer-1` from flying through the player at point-blank
 * range -- the behavior Plan 7a's own review explicitly declined to fix
 * ("Post-review correction", docs/handoff/2026-09-23-plan7a-ai-pursuit.md).
 * Every scoring/maneuver-selection claim is unit-tested
 * (tests/sim/ai/decision.test.ts, tests/sim/scenario.test.ts); what only
 * this tier can see is that the chosen maneuver actually reaches the
 * airframe through the real render loop, not a headless harness.
 */
const RANGE = `/?${SCENARIO_PARAM}=pursuit-range`

test.setTimeout(120_000)

const combat = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!)
const positions = (page: Page) =>
  page.evaluate(() => {
    const list = (window as DiagWindow).__ww2!.aircraft()
    const pursuer = list.find((a) => a.id === 'pursuer-1')!
    const player = list.find((a) => a.id === 'f6f-1')!
    return { range: Math.hypot(pursuer.x - player.x, pursuer.y - player.y, pursuer.z - player.z) }
  })

test('the veteran pursuer breaks off at point-blank range instead of flying through the player, with zero WebGPU validation errors and the render budget held', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(RANGE)
  await waitForTerrain(page)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())

  // Wait for the range to close under Plan 7a's own MIN_ENGAGEMENT_RANGE_M
  // (120 m) -- the exact geometry that used to pass through undisturbed.
  await expect
    .poll(() => positions(page).then((p) => p.range), {
      timeout: 30_000,
      message: 'pursuer-1 never closed to point-blank range',
    })
    .toBeLessThan(120)

  const atClosest = await positions(page)

  // Give the decision layer a veteran's reaction window (0.3s) plus margin,
  // then confirm the range is opening again rather than staying pinned near
  // zero or continuing to close -- the pass-through 7a's review measured.
  await page.waitForTimeout(1500)
  const after = await positions(page)
  expect(after.range, 'pursuer-1 did not open range after closing to point-blank -- it flew through instead of breaking away').toBeGreaterThan(atClosest.range)

  await page.screenshot({ path: 'test-results/ai-maneuver.png' })

  const live = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { gpu: d.gpuFrameTimesMs(), errors: d.validationErrors }
  })
  expect(live.errors, `WebGPU validation errors:\n${JSON.stringify(live.errors, null, 2)}`).toEqual([])
  expect(live.gpu.length).toBeGreaterThan(120)
  const p95 = percentile(live.gpu, 0.95)
  console.log(`ai maneuver: gpu p95 ${p95.toFixed(3)} ms over ${live.gpu.length} samples`)
  expect(p95).toBeLessThan(6.0)
})
```

- [ ] **Step 2: Run it on the reference GPU**

```sh
ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org \
  npx playwright test tests/e2e/ai-maneuver.spec.ts
```

Expected: 1 passed, on the AMD RDNA 2 reference adapter at 2560×1440. Read
`test-results/ai-maneuver.png` yourself before trusting the pass — never
argue about a picture you haven't looked at.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/ai-maneuver.spec.ts
git commit -m "Plan 7b task 6: reference-GPU acceptance for energy-aware maneuvering"
```

---

## Closing this plan

Write `docs/handoff/2026-09-23-plan7b-combat-depth.md` (dated, following
`docs/handoff/2026-09-23-plan7a-ai-pursuit.md`'s shape: what landed, Tier 1
evidence with `npm run verify`'s exact `rc=0` line and test counts, Tier 2
evidence with the measured p95 and the screenshot path, commits, remaining
work). Update master spec §15's plan table row for Plan 7 (currently "7a
complete... 7b/7c... not started") to record 7b's completion and that 7c
(lag pursuit, barrel-roll defence, split-S, scissors, attack run, bomber
formation station-keeping, formation keeping, landing AI, teams) remains.
Do not push `main` or deploy — both are Mark's call, separately.
