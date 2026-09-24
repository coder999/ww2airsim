# Combat depth: energy-aware maneuvering (Plan 7b)

2026-09-23. Builds on the controller seam Plan 7a shipped 2026-09-23
(`docs/superpowers/specs/2026-09-23-ai-pursuit-design.md`): a single
maneuver (lead pursuit) flown by every AI pilot regardless of the tactical
situation. That doc's own §5 "Deliberate boundary" named pilot skill,
reaction delay, energy-state utility scoring, disengagement and defensive
maneuvers as deferred to "Plan 7b/7c work built on this controller seam" —
this is that work, scoped to what a single slice can carry.

Master spec §7 ("AI") names three layers: a flight controller (done, 7a), a
maneuver library ("lead pursuit, lag pursuit, break turn, barrel-roll
defence, split-S, extend, scissors, bomber formation station-keeping,
attack run"), and a utility-scoring decision layer ("relative energy,
angle-off, range, ammunition, damage, threat astern, fuel... rescored every
0.5s"). It gives no algorithm for the scoring or the maneuvers beyond lead
pursuit — that is this document's job. It also says pilot skill "is purely
a parameter set — reaction delay, gunnery accuracy, energy discipline,
disengagement threshold," which this slice takes literally rather than as
a metaphor (§3 below).

## 1. Player-visible result

Today an AI pilot flies one script forever: close for a lead-pursuit gun
shot, regardless of energy state, angle, or what is on its own tail — Mark's
own playtest note was "plane shot at me, I evaded it and couldn't find the
plane again," i.e. the AI has no notion of losing. After this slice, an AI
pilot chooses between three maneuvers each rescore interval based on the
tactical picture: press the attack when it has the advantage, break off and
dive away when it doesn't (or when it is about to fly through its target at
point-blank range), and turn hard defensively when the player has the angle
on it. Two pilots flying the same scenario with different skill parameters
behave visibly differently — a veteran reacts and disengages sooner than a
green pilot.

## 2. Scope: three maneuvers, not the full library

The master-spec maneuver library names eight maneuvers. Building all eight
in one slice is architecturally larger than either of this session's other
two design efforts (13d, Plan 9) and would mean shipping a large
decision-layer rewrite with no way to see it working until the whole thing
lands. This slice builds exactly three:

- **Pursue** — today's lead pursuit (`leadPursuitVelocity`/
  `pursuitDesiredVelocity`, `src/sim/ai/pursuit.ts`), unchanged.
- **Extend** — dive away from the threat and build airspeed. New.
- **Break** — a hard turn into the threat's approach angle. New.

**Deliberately excluded, carried to a later slice (7c) unchanged from 7a's
own boundary:** lag pursuit, barrel-roll defence, split-S, scissors, attack
run, bomber formation station-keeping, formation keeping, landing AI, teams.
Extend and Break are the minimum pair that make the AI look like it is
fighting for survival (something to run to, something to do when cornered)
without building the full ACM maneuver set at once.

## 3. Persistent per-pilot state

`PilotAssignment` (`src/sim/ai/pursuit.ts:7-10`) is currently
`{ readonly target: string }` — no skill, no memory between ticks. It
widens:

```ts
// src/sim/ai/pilot.ts (new)
export type PilotSkill = {
  /** Seconds between decision-layer rescores. Lower = reacts faster.
   *  This IS "reaction delay" (master spec §7) -- read literally, not as a
   *  separate buffered-observation mechanism, since the decision layer's own
   *  rescore cadence already gates how fast a pilot changes its mind. */
  readonly reactionS: number
  /** 0-1. Scales AI_GUN_CONE_RAD's half-angle at 1.0 = unchanged, lower =
   *  a tighter, more accurate cone. Does not change AI_GUN_RANGE_M. */
  readonly gunneryAccuracy: number
  /** 0-1. Scales how much relative-energy margin Pursue needs over Extend
   *  before Pursue still wins the score -- see §4. Higher = holds the
   *  attack longer before bailing. */
  readonly energyDiscipline: number
  /** Relative-energy floor (same units as §4's energy term) below which
   *  Extend is FORCED regardless of score -- see §6. */
  readonly disengageThreshold: number
}

export const VETERAN_SKILL: PilotSkill = {
  reactionS: 0.3, gunneryAccuracy: 0.6, energyDiscipline: 0.7, disengageThreshold: -400,
}
export const GREEN_SKILL: PilotSkill = {
  reactionS: 1.0, gunneryAccuracy: 1.0, energyDiscipline: 0.3, disengageThreshold: -150,
}

export type PilotManeuver = 'pursue' | 'extend' | 'break'

export type PilotDecisionState = {
  readonly maneuver: PilotManeuver
  /** Sim time (tick * DT) at which the next rescore runs. */
  readonly nextRescoreS: number
}
```

`PilotAssignment` (`src/sim/ai/pursuit.ts`) becomes:

```ts
export type PilotAssignment = {
  readonly target: string
  readonly skill: PilotSkill
  readonly decision: PilotDecisionState
}
```

`AircraftEntity.pilot` (`src/sim/loop.ts:235-336`) is already
`PilotAssignment | null`; its shape change is the only edit that file's
type needs. The per-tick resolution in `advance()` (`src/sim/loop.ts`
around lines 800-817) currently does:

```ts
if (target !== undefined) commanded = { ...a, controls: pursuitControls(a, target) }
```

This becomes: read `a.pilot.decision`; if `tick * DT >= decision.nextRescoreS`,
run the utility scorer (§4) to pick a new `maneuver` and set
`nextRescoreS = tick * DT + a.pilot.skill.reactionS`; otherwise keep the
existing `decision` unchanged. Either way, dispatch to the chosen
maneuver's controls function (§5), and write the (possibly updated)
`decision` back onto the entity: `{ ...a, pilot: { ...a.pilot, decision },
controls }`. Same immutable-rebuild shape `advance()` already uses
everywhere else in this loop — no new mutation pattern.

Everything that constructs a `PilotAssignment` today (scenario loading,
tests) gains the two new required fields. `VETERAN_SKILL`/`GREEN_SKILL`
above are the two presets scenarios choose between; a scenario with mixed
skill (e.g. one ace among green pilots) sets `skill` per-entity, which the
type already allows.

## 4. Utility scoring

Runs once per pilot per rescore (§3), never every tick — that cadence is
itself the reaction-delay mechanism, so the scorer does not need its own
smoothing or hysteresis beyond what a fixed interval already provides.

Facts read, matching master spec §7's list minus ammunition (which already
only gates the existing gun check, not maneuver choice, since firing at a
target you can't hit is not a maneuver decision):

- **relative energy** — `(kineticSelf + potentialSelf) - (kineticTarget + potentialTarget)`,
  using `0.5 * mass * |velocity|^2` and `mass * g * altitude`, in joules per
  unit mass (mass cancels for a same-type matchup; kept in the formula so a
  future mixed-aircraft-type scenario is not silently wrong).
- **angle-off** — angle between self's velocity vector and the bearing to
  target (for Pursue/Extend scoring) and between target's velocity vector
  and the bearing to self (for Break scoring: is the target's nose tracking
  self).
- **range** — `|target.position - self.position|`.
- **threat-astern** — boolean: is self within the target's own gun cone
  (`AI_GUN_CONE_RAD`, `AI_GUN_RANGE_M`) right now. Reuses the existing gun
  gate's own geometry rather than a new cone definition.
- **damage** — self's `record.damage` fraction (already tracked per
  `AircraftCombat`, Plan 6).
- **fuel** — self's remaining fuel fraction (already tracked on
  `AircraftState`/stores).

Scores, each a plain weighted sum of the facts above (constants named, not
inlined, so a future tuning pass touches one block):

```ts
// src/sim/ai/decision.ts (new)
const PURSUE_ENERGY_WEIGHT = 1.0
const PURSUE_ANGLE_PENALTY = 0.5      // per radian of angle-off
const PURSUE_RANGE_PENALTY = 0.002    // per meter beyond AI_GUN_RANGE_M
const PURSUE_THREAT_PENALTY = 800     // flat, if threatASTern

const EXTEND_ENERGY_WEIGHT = -1.0 * energyDiscipline  // low energy -> high Extend score
const EXTEND_THREAT_BONUS = 800
const EXTEND_DAMAGE_WEIGHT = 400      // per damage fraction
const EXTEND_FUEL_WEIGHT = 300        // per (1 - fuel fraction)

const BREAK_ANGLE_WEIGHT = 600        // per radian the TARGET's nose is on self
const BREAK_RANGE_PENALTY = 0.003     // per meter beyond AI_GUN_RANGE_M (target's own gun range)
```

`decision.maneuver = argmax(pursueScore, extendScore, breakScore)`, with
Pursue winning ties (today's only behavior, so a scenario with all facts
at zero reproduces 7a exactly — the regression floor for this slice's
Tier 1 suite). `energyDiscipline` (skill parameter) scales
`EXTEND_ENERGY_WEIGHT`: a disciplined veteran needs a larger energy deficit
before Extend outscores Pursue.

## 5. Maneuver controls

Both new maneuvers produce a desired-velocity vector, fed through the same
`controlsForDesiredVelocity` seam 7a already built
(`src/sim/ai/controller.ts`) — no new controller-layer code, only two new
producers of its input, alongside `pursuitDesiredVelocity`.

```ts
// src/sim/ai/pilot.ts
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
  // most reduces the threat's angle-off, at a speed the controller will
  // read as "turn hard," not "cruise there."
  const selfFwd = normalize(self.state.velocity)
  const towardThreat = normalize(sub(threat.state.position, self.state.position))
  const turnAxis = normalize(cross(selfFwd, towardThreat))
  const breakDir = normalize(cross(turnAxis, selfFwd))
  return scale(breakDir, Math.max(60, length(self.state.velocity)))
}
```

(`cross` joins `add`/`dot`/`length`/`normalize`/`scale`/`sub` as an export
from `src/sim/math/vec3.ts` if not already present — a one-line addition,
verified against that file during implementation.)

## 6. Minimum engagement range (the point-blank fix)

7a's own review found the AI flies straight through the player at close
range with no recovery — explicitly ruled at the time as "disengagement...
territory," declined for that slice on purpose. This slice closes it: in
§4's scoring step, before computing the three scores, check range against
a constant `MIN_ENGAGEMENT_RANGE_M = 120` (comfortably inside typical WWII
gun range, chosen so the override fires only in the pass-through case, not
during a normal firing pass) with closing rate positive
(`dot(normalize(sub(target.position, self.position)), self.velocity) > 0`).
If both hold, force `maneuver = 'extend'` for this rescore regardless of
the computed scores. This is a forced override, not an extra term in the
weighted sum, because "about to collide" is a hard constraint a linear
score could still lose to a large threat-astern penalty — safety-critical
logic should not be tunable away by weight changes elsewhere.

## 7. Gunnery accuracy

`AI_GUN_CONE_RAD` (`src/sim/ai/pursuit.ts:12`, currently a fixed
`3 * Math.PI / 180`) becomes the *veteran* value; the gun gate reads
`AI_GUN_CONE_RAD * self.pilot.skill.gunneryAccuracy` instead of the raw
constant. `gunneryAccuracy: 1.0` (green) reproduces today's exact behavior;
`< 1.0` (veteran) is a tighter, more accurate cone. `AI_GUN_RANGE_M` is
unchanged — accuracy is about cone width, not engagement range, keeping
this a one-line change to an existing, already-tested gate rather than new
gate logic.

## 8. Deliberate boundary

Not in this slice, all carried forward from 7a's own boundary and now also
named in master spec §7's maneuver list: lag pursuit, barrel-roll defence,
split-S, scissors, attack run, bomber formation station-keeping. Also not
in this slice: formation keeping, landing AI, multi-pilot team coordination
(7c's territory, unchanged from 7a's scoping). A pilot's `skill` is chosen
per-scenario today (§3's two presets); a UI for choosing it, or tying it to
the Plan 9 pilot roster's rank, is out of scope here and would double-count
work Plan 9's own design already claims for the *player's* roster — this
slice's `PilotSkill` is for AI-controlled entities only.

## 9. Acceptance

### Tier 1

- Utility scorer against constructed fact tuples: each of the three
  maneuvers winning in the situation §4 says it should (a fresh, healthy,
  favorably-positioned pilot picks Pursue; a damaged, low-fuel, or
  low-energy pilot picks Extend; a pilot with the target's nose tracking it
  at close range picks Break); the all-zero-facts case reproduces Pursue
  (the 7a regression floor).
- `energyDiscipline` changing the Pursue/Extend crossover point between the
  two skill presets (a veteran and a green pilot given the identical
  tactical facts choose differently at the boundary).
- `MIN_ENGAGEMENT_RANGE_M` override: forces Extend even when scoring alone
  would pick Pursue, only when closing rate is positive (a pilot flying
  parallel at close range does not get force-disengaged).
- `gunneryAccuracy` scaling the gun-gate cone: a shot that lands inside the
  veteran's cone but outside the green pilot's (or vice versa) is asserted
  directly against `AI_GUN_CONE_RAD * skill.gunneryAccuracy`.
- `extendDesiredVelocity`/`breakDesiredVelocity` unit tests: Extend's
  result points away from the threat with a negative vertical component;
  Break's result is perpendicular to self's current velocity, not toward
  or away from the threat.
- Rescore cadence: a pilot's `decision.maneuver` does not change between
  two ticks inside one `reactionS` window even if the underlying facts
  would flip the score, and does change once `nextRescoreS` is reached.

### Tier 2

- The reference-GPU scenario used for 7a's own playtest (`pursuit-range`,
  or `air-combat-test` per the scenario picker's label): confirm visually
  and via `__ww2.aircraft()` that an AI pilot which closes to point-blank
  range breaks away instead of flying through the player, and that an AI
  pilot damaged mid-fight visibly disengages (increasing range instead of
  continuing to close) rather than pressing the attack to destruction.
- Zero WebGPU validation errors across a full engagement (closer to the
  existing 7a Tier 2 spec's own pass/fail shape than a new mechanism).
