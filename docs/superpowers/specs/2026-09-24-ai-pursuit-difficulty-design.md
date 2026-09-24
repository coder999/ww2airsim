# AI pursuit difficulty — design

**Status: approved design, 2026-09-24.** Mark's critique: "the pursuit AI is
too strong — I can't ever get behind that pilot." A spike confirmed this
isn't a preset-tuning problem: flying against `green` (Plan 7b's easiest
preset) was reported as still "could almost never get behind the enemy
plane," which rules out "just flip the default scenario to an easier
preset" as a real fix.

## 1. Root cause, grounded in the actual code

`PilotSkill` (`reactionS`, `gunneryAccuracy`, `energyDiscipline`,
`disengageThreshold`) only ever affects **when** the AI reconsiders which
maneuver to fly and **how wide its gun cone is when firing** — it has zero
effect on how accurately the AI aims and flies once it has decided on a
maneuver. Traced through the actual call chain:

- **`leadPursuitVelocity`** (`src/sim/ai/pursuit.ts`) computes a
  mathematically exact intercept from the target's true, live position and
  velocity — no noise, no staleness, no "guessing wrong," for any skill.
- **`controlsForDesiredVelocity`** (`src/sim/ai/controller.ts`), the shared
  PD controller converting a desired velocity into stick inputs, uses fixed
  gains identical for every skill preset. It respects the aircraft's real
  physical limits (`MAX_BANK_RAD`, real body-rate physics), but within them
  it corrects with zero overshoot and zero hesitation, every tick.
- **`loop.ts`'s pilot dispatch** (confirmed by reading the code directly)
  calls `maneuverControls` — and therefore both functions above — **every
  single tick**, using the target's live state, regardless of skill. Only
  the *choice* of Pursue/Extend/Break is frozen between rescores
  (`nowS >= decision.nextRescoreS`); the steering math inside whichever
  maneuver is active is recomputed fresh from ground truth 60 times a
  second no matter the preset.

So a `green` pilot reacts slightly less often than `veteran`, but between
reactions it still flies a perfectly computed, perfectly executed intercept
— a much smaller real disadvantage than the preset names suggest. This is a
missing feature, not a miscalibrated one: skill was never wired to affect
accuracy, only decision cadence.

## 2. What this spec adds, and what it deliberately does not

Two mechanisms, chosen after evaluating three candidates (targeting error,
control noise, perception staleness) and explicitly ruling out targeting
error — Mark's read after the spike was that the AI's aim itself feels
fine; the problem is how relentlessly and precisely it flies and reacts.

**Perception staleness.** At the same rescore moment that already exists
(`nowS >= decision.nextRescoreS`, which already reads the target's live
state to build `DecisionFacts` and pick a maneuver), also capture that
target position/velocity into `PilotDecisionState` as an **observed
snapshot**. Between rescores, `maneuverControls` and everything it calls
(`leadPursuitVelocity`, `extendDesiredVelocity`, `breakDesiredVelocity`) use
this frozen snapshot instead of the target's live state. `reactionS` now
means "how outdated is my mental picture of the enemy," not just "how often
do I reconsider my plan" — a single, coherent cause for both effects. Own-
ship facts (fuel fraction, damage taken) stay live; only *perception of the
target* goes stale, matching what reaction time actually models.

**Control noise.** Deterministic, skill-scaled jitter applied to the final
clamped `Controls.roll/pitch/yaw` values `maneuverControls` returns — a
wobbly, imprecise hand on the stick, not a different (worse) target
calculation. Explicitly **not** detuned PD gains: badly-detuned gains risk
inducing real oscillation/overshoot, which reads as a bug, not as a human
pilot. Applying noise to the output preserves the controller's own stability
and just adds imprecision on top.

**Explicitly not doing:** any change to `leadPursuitVelocity`'s intercept
math, `hasGunSolution`'s gun-cone gate, or `gunneryAccuracy`'s existing
effect — those are judged fine as-is. No change to `energyDiscipline` or
`disengageThreshold`'s existing effects either.

## 3. New `PilotSkill` fields — naming chosen to avoid a repeat of a real
   bug from earlier tonight

Plan 7b shipped `gunneryAccuracy` with an inverted convention (lower number
= narrower/more-accurate cone), which caused a real backwards-formula bug
during that plan's execution. To avoid the same trap:

```ts
export type PilotSkill = {
  readonly reactionS: number
  readonly gunneryAccuracy: number
  readonly energyDiscipline: number
  readonly disengageThreshold: number
  /** Standard deviation of noise added to each of roll/pitch/yaw, in the
   *  same [-1, 1] units `Controls` already uses. 0 = perfect (no jitter).
   *  HIGHER IS ALWAYS WORSE -- unlike `gunneryAccuracy`, chosen
   *  specifically so a future reader cannot get the direction backwards
   *  by pattern-matching on this file's other, inverted field. */
  readonly controlNoise: number
}
```

No new field for targeting error (`leadPursuitVelocity`'s intercept math) —
considered in §2 and explicitly rejected, not merely deferred.

`VETERAN_SKILL.controlNoise` stays at or near `0` (still sharp);
`GREEN_SKILL.controlNoise` gets a real, playtestable value. Exact magnitude
is a tuning question for the implementation plan (empirically measured
against a real flight, matching how every other AI constant in Plan 7b was
tuned) — this spec fixes the mechanism and the sign convention, not the
number.

`PilotDecisionState` gains the observed snapshot:

```ts
export type PilotDecisionState = {
  readonly maneuver: PilotManeuver
  readonly nextRescoreS: number
  /** The target's position/velocity as of the last rescore -- what the
   *  pilot is actually flying against between rescores. Captured
   *  alongside `decideManeuver`'s own facts-derivation, so there is one
   *  observation per rescore, not two independently-timed ones. */
  readonly observedTargetPosition: Vec3
  readonly observedTargetVelocity: Vec3
}
```

## 4. Determinism (a hard project-wide constraint)

`src/sim/` has a standing rule: a single seeded PRNG, `Math.random` nowhere
in the tree (master spec §3; `src/sim/world/ships.ts`'s own boundary
comment restates it). Golden-trajectory tests (`tests/sim/golden/
trajectory.test.ts`) require bit-identical replay from a seed. Control noise
**must** use this repo's existing `createRng`/mulberry32 discipline
(`src/sim/rng.ts`), the same pattern `weapons/combat.ts` already uses for a
serializable, replayable per-tick draw (a cursor integer carried in state,
advanced by recreating `createRng(cursor)()` rather than holding a live
closure — see `combat.ts`'s `randomFrom`). Exact plumbing (a cursor on
`PilotDecisionState` vs. reusing the world's existing combat `rngState`) is
an implementation-plan decision; the constraint is binding regardless of
which: whatever holds the cursor must be part of serializable World state,
and the same seed must reproduce the same flown path.

## 5. Testing

**Tier 1:**
- A test proving staleness: construct a scenario where the target changes
  velocity sharply between two rescores; assert the AI's steering during
  that window is computed against the *old* velocity, not the new one,
  until the next rescore fires.
- A test proving noise is deterministic: same seed, same inputs, twice →
  bit-identical `Controls` output, both times jittered (not silently zero).
- A test proving `veteran` still flies materially closer to the unjittered
  ideal than `green` (an assertion on the actual magnitude gap, not just
  "different").
- Existing golden-trajectory tests must still pass bit-identically once a
  seed is threaded through (they pin a specific seed already; confirm this
  addition doesn't change any currently-committed golden output for a seed
  that predates this feature, or update the golden file if it must, with
  a stated reason).

**Tier 2:** a real-GPU acceptance flight (extending or replacing
`tests/e2e/ai-maneuver.spec.ts`) proving a human-equivalent scripted
evasion pattern can now get behind `pursuer-1` at `green` skill within a
bounded time window, where it could not before this change — this is the
actual acceptance bar Mark's complaint sets, not just "some noise exists."

## 6. Open items for the implementation plan, not this spec

- Exact `controlNoise` magnitude for `green` (and confirming `veteran`'s
  near-zero value still holds up under real play) — a real-flight tuning
  question, per this plan's own established pattern.
- Where the RNG cursor lives (new `PilotDecisionState` field vs. shared
  world state) — an implementation detail, not a design question, per §4.
- Whether a third preset (between veteran and green) is worth adding once
  this mechanism exists — out of scope; two presets are what ship today.
