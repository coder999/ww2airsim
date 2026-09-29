# Plan 7h — AI Takeoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An AI aircraft parked on an airfield runway can roll, rotate, climb out and then fly the ordinary AI (engage or loiter). Airfield Strike's two defenders scramble this way, off Dulag's runway, instead of appearing in mid air.

**Architecture:** One new pure module, `src/sim/ai/takeoff.ts`, owns the takeoff phase machine (`wait`, `roll`, `climb`) and its controls, the mirror of 7g's `recovery.ts`. `pilotTick` gets a new top-level mode, `takeoff`, that short-circuits the rescore the way `landed` does and hands off to `engage` when the climb is done. A held group may now park aircraft on an airfield (ruling R3 relaxed for that case only), and `spawnInto` settles a parked spawn onto the terrain, because the frame layer's `settleOnTerrain` runs only once at load.

**Tech Stack:** TypeScript, zod (scenario schema), vitest (Tier 1), Playwright on the reference GPU (Tier 2).

**Spec:** the **Design** section of this document (Mark asked for a plan, 2026-09-28: "Yes exactly"; there is no separate spec). It extends `docs/superpowers/specs/2026-09-27-ai-7g-landing-design.md` (park spots, `airborne`, the pilot-mode pattern) and §6 of `docs/superpowers/specs/2026-09-25-ai-7c-design.md`.

**Execution:** worktree, **ask Mark first** (worktree-vs-main is ask-first for this repo). Suggested branch `worktree-ai-7h-takeoff`, worktree `/home/mark/projects/ww2airsim-worktrees/ai-7h-takeoff`. Heavy suites go to ryzen via `remote-run` under the hwlock rules; named test files and `--maxWorkers=2` locally (parallel vitest OOM-killed nexus twice on 2026-09-25).

**Viewing checkpoint (Mark, 2026-09-28):** final product only, unattended run. Collect the Airfield Strike captures and the windomlane URL in the handoff; no task waits on him.

**Prerequisite (done 2026-09-28):** `content/scenarios/airfield-strike.json` has an *uncommitted* two-line change in the primary checkout, `f6f-hellcat` to `a6m2-zero` for `defender-1` and `defender-2` (Mark, 2026-09-28: "the enemy aircraft should be zeros"). Commit it to `main` before creating the worktree, or Task 4 must redo it. `GAMEPLAY.md` also has an uncommitted diff in the primary checkout that is not part of this work: do not stage it.

---

## Design

**Why.** Measured 2026-09-28 (Tier 1, player flying level at 500 m toward Dulag, defenders as Zeros, green): the scrambled defenders engage from the first tick but merge head-on at ~190 m without firing, overshoot, take about a minute to come back, and never catch a striker at 100 m/s. A mid-air spawn 4 km ahead, pointed at the player, cannot be fixed by tuning inside the scramble ring: every point in the ring is ahead of the player at the moment the trigger fires. Taking off from the field fixes the geometry and the story ("bandits scrambling off Dulag").

**Scenario.** A held group (or a start aircraft) may use `parkedAt: { airfield, spot }` with `chocked: false` and `pilot: { takeoff: true }`. Held groups keep rejecting ship parks and parks without `takeoff: true` (R3 stays for those). The spot is runway-local (`x` across, `z` along), as for the player.

**Spawn.** `spawnInto` receives the terrain and puts every parked aircraft of the group on `heightAt + spec.gear.heightM`, the way `settleOnTerrain` does at load. Without terrain the world does not tick (groundSpawn), so a spawn always has it.

**Pilot state.** New `PilotMode` `'takeoff'`. New `decision.takeoff?: TakeoffState`:

```ts
type TakeoffPhase = 'wait' | 'roll' | 'climb'
type TakeoffState = {
  readonly phase: TakeoffPhase
  readonly sinceS: number
  readonly headingRad: number | null   // runway heading, compass, latched on the first tick
  readonly pitchIntegral: number       // the climb-out hold's integral term
}
```

**Phases.**
- `wait`: brakes on, throttle 0. Leaves for `roll` when terrain exists and `takeoffClear` (below) holds.
- `roll`: throttle 1, brakes off, gear down, flaps per Task 2's measurement, yaw steers to the latched runway heading. Pitch 0 until airspeed reaches `TAKEOFF_ROTATE_STALL_MULTIPLE` x `effectiveStallSpeedMps`, then a nose-up demand. Ends when the wheels are `TAKEOFF_CLIMB_OUT_M` above the surface.
- `climb`: hold `TAKEOFF_CLIMB_DEG` flight-path angle (level below `TAKEOFF_CLIMB_MIN_STALL_MULTIPLE` x stall, to accelerate), wings level, gear up above `TAKEOFF_GEAR_UP_M`. Ends at `TAKEOFF_DONE_M` above ground. Then `takeoff` is cleared, the mode goes to `engage`, and `nextRescoreS = 0` makes the ordinary rescore choose engage or loiter on that tick.

**Order on the runway.** `takeoffClear`: a pilot may start its roll only when every lower-id aircraft that is still in `takeoff` mode and alive is airborne or at least `TAKEOFF_CLEAR_M` from it. A destroyed or impacted leader never blocks (Review Focus 3).

**While taking off** the pilot flies no target and does not fire, the safety floor does not apply (the roll and climb are below it by construction), and `airborne()` is false on the roll, so 7g's contact rule already keeps other AI from targeting it. The player can still hit it: it is a parked-state aircraft with a live hit record.

**Out of scope.** Taxiing (not modeled anywhere), carrier takeoff for AI (`parkedAt` a ship stays rejected for held groups), a `home` for the defenders after the fight (they loiter or fight; 7g's idle return would work if a `home` is added later), non-runway parks.

## Global Constraints

- Headings are compass: 0 = north = -z, 90 = east = +x (`src/sim/scenario.ts` `buildAircraft`).
- Body +x is forward (`qRotate(attitude, v3(1, 0, 0))`, as `threatAstern` uses).
- Runway-local `x` is across, `z` along (`localToWorld`); the parked attitude faces down the runway (`parkedAttitude`).
- A pilot's decisions read only the start-of-tick snapshot (entities design §3). Nothing in `takeoff.ts` may read another aircraft's *current* tick.
- A world with no `takeoff` pilot is bit-identical to today's: `tests/sim/ai/determinism.test.ts` stays green untouched.
- Never sort by array position; take id order (7g spec §7 constraint).
- US spelling in prose and identifiers.
- Do not edit `vps-local/sites/`, `db/schema.sql`, or `GAMEPLAY.md` (someone else's diff).
- Check `git log` and `origin/main..main` right before any merge or push; verify the commit you push.

## Review Focus

1. **Runway too short.** A defender whose roll plus rotation runs off the end of the runway. Expect `runwayAheadM(spot) >= 1.5 x measured takeoff run` for every takeoff spot (Task 4 content test), for the wind in the scenario.
2. **Two aircraft on one runway.** The wingman rolls into the lead. Expect the pair never closer than 40 m on the ground (Task 3).
3. **Dead or wrecked leader.** The lead is shot on the ground or crashes on the roll and the wingman waits forever. Expect a destroyed or impacted lower-id pilot never blocks `takeoffClear` (Task 3).
4. **No terrain.** A takeoff pilot must not roll on a null heightfield: it stays in `wait` with the brakes on until terrain exists (Task 3).
5. **Climb-out into rising ground.** The safety floor is off until `TAKEOFF_DONE_M` (450 m AGL, amended 2026-09-28 after Task 3 measured the AI floor spinning slow pilots handed off at 150 m), so a hill ahead of the runway end is a crash the override will not catch. Expect the terrain for 5 km past the runway's end (the 10 degree path reaches 450 m about 2.6 km out) to stay below the climb path from the runway end (Task 4 content test).
6. **Bit-identity.** Adding a mode and a pilot field must not change any existing world (Task 3, determinism test).

---

## File Structure

- Create `src/sim/ai/takeoff.ts` — the phase machine, `startTakeoff`, `takeoffControls`, `takeoffClear`, and the tuned constants.
- Create `tests/sim/ai/takeoff.test.ts` — pure-function tests and the headless runway takeoffs.
- Modify `src/sim/ai/pilot.ts` — `PilotMode` gains `'takeoff'`; `PilotDecisionState` gains `takeoff?`; a re-export of the types.
- Modify `src/sim/ai/pilotTick.ts` — the `takeoff` short-circuit and hand-off.
- Modify `src/sim/scenario.ts` — `PilotObject.takeoff`, the relaxed R3 rule, `pilotAssignmentFrom` seeding.
- Modify `src/sim/mission/spawn.ts` and `src/sim/loop.ts` (the one `spawnInto` call) — terrain settle at spawn.
- Modify `src/render/diagnostics.ts`, `src/render/main.ts` — `takeoff` phase in `__ww2.aircraft()`.
- Modify `tests/sim/mission/fly.ts` — `settledAll`, a Tier 1 helper that settles every parked entity.
- Modify `content/scenarios/airfield-strike.json` — the defenders park on Dulag's runway and take off.
- Create `content/scenarios/takeoff-range.json` and `tests/e2e/takeoff.spec.ts` — Tier 2.
- Create `docs/handoff/2026-09-2x-plan7h-takeoff.md`; modify the §15 row in `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` and `README.md`.

---

### Task 1: Scenario schema, spawn settle, and the test helper

**Files:**
- Modify: `src/sim/scenario.ts` (`PilotObject` near line 68; `pilotAssignmentFrom` near line 98; the R3 check near line 403)
- Modify: `src/sim/mission/spawn.ts`, `src/sim/loop.ts:921`
- Modify: `tests/sim/mission/fly.ts`
- Test: `tests/sim/scenarioTakeoff.test.ts`

**Interfaces:**
- Consumes: `isParkedAircraft`, `isShipParked` (`src/sim/scenario.ts`), `heightAt` (`src/sim/world/terrain.ts`).
- Produces: `pilot.takeoff: true` in scenario JSON; `SpawnParts.terrain?: TerrainField | null`; `settledAll(w: World<undefined>): World<undefined>` in `tests/sim/mission/fly.ts`. The `PilotAssignment` a takeoff pilot gets has `decision.mode === 'takeoff'` and `decision.takeoff` seeded (type from Task 2, so this task lands the type declaration first, Step 1).

- [ ] **Step 1: Declare the types (no behavior)**

In `src/sim/ai/pilot.ts` add `'takeoff'` to `PilotMode`, and add to `PilotDecisionState`:

```ts
  /** 7h: the takeoff phase machine, present only in mode `takeoff`. */
  readonly takeoff?: TakeoffState
```

with `import type { TakeoffState } from './takeoff.js'` and a stub `src/sim/ai/takeoff.ts` that exports only the types from the Design section above.

- [ ] **Step 2: Write the failing tests** in `tests/sim/scenarioTakeoff.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { parseScenarioBundleForTest } from './scenarioFixtures.js'   // see note

describe('takeoff scenarios', () => {
  it('accepts a held aircraft parked on an airfield with pilot.takeoff', () => {
    expect(() => parseScenarioBundleForTest(heldTakeoff({ chocked: false, takeoff: true }))).not.toThrow()
  })
  it('still rejects a held aircraft parked without takeoff (R3)', () => {
    expect(() => parseScenarioBundleForTest(heldTakeoff({ chocked: false, takeoff: false }))).toThrow(/held aircraft must start airborne/)
  })
  it('rejects a held ship park even with takeoff', () => {
    expect(() => parseScenarioBundleForTest(heldTakeoff({ ship: 'cv-1', takeoff: true }))).toThrow(/held aircraft must start airborne/)
  })
  it('rejects a chocked takeoff pilot', () => {
    expect(() => parseScenarioBundleForTest(heldTakeoff({ chocked: true, takeoff: true }))).toThrow(/takeoff.*chocked/)
  })
  it('seeds mode takeoff and phase wait', () => {
    const w = worldFromScenario(bundleWithStartTakeoff(), null)
    const d = aircraftById(w, 'ai-1')!.pilot!.decision
    expect(d.mode).toBe('takeoff')
    expect(d.takeoff).toMatchObject({ phase: 'wait', headingRad: null })
  })
})
```

Note for the implementer: find how the existing scenario tests build a bundle from a literal (`grep -n "worldFromScenario\|loadScenarioBundle" tests/sim/scenario*.test.ts | head`) and copy that exact pattern; use `tests/fixtures/scenarios/*.json` as the literal's base. Do not invent `parseScenarioBundleForTest`; replace it with what the neighbors use. Write `heldTakeoff` and `bundleWithStartTakeoff` as small builders in the test file returning the JSON literal with one held group `spawned` by a trigger and one Tacloban-parked player.

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run tests/sim/scenarioTakeoff.test.ts`
Expected: FAIL (unknown key `takeoff`; R3 message on the first case).

- [ ] **Step 4: Implement the schema**

In `PilotObject` add `takeoff: z.literal(true).optional()` with a doc line, and add a refine so `takeoff` excludes `leader`:

```ts
}).refine((p) => p.takeoff === undefined || p.leader === undefined, {
  message: 'takeoff excludes leader: a wingman flies its leader\'s formation', path: ['takeoff'],
})
```

In `pilotAssignmentFrom`, when `pilot.takeoff === true`, set the mode to `'takeoff'` and add to the decision `takeoff: { phase: 'wait', sinceS: 0, headingRad: null, pitchIntegral: 0 }`. `initialDecision(id, 'takeoff')` already takes the mode; spread the `takeoff` field onto it.

Replace the R3 check at `src/sim/scenario.ts:403`:

```ts
      if (isParkedAircraft(a)) {
        if (isShipParked(a.parkedAt) || a.pilot?.takeoff !== true) {
          issue('a held aircraft must start airborne (airborneAt), plan ruling R3; the one exception is an airfield park with pilot.takeoff', [...path, 'parkedAt'])
        } else if (a.chocked) {
          issue('a takeoff pilot cannot be chocked', [...path, 'chocked'])
        }
      }
```

Add the same chocked check for start aircraft with `pilot.takeoff` in the start-aircraft validation (find the neighboring per-aircraft loop at `src/sim/scenario.ts:320`). A `pilot.takeoff` on an airborne aircraft is also an issue: `'takeoff needs a parkedAt airfield'`.

- [ ] **Step 5: Settle at spawn**

`SpawnParts` gains `readonly terrain?: TerrainField | null`. In `spawnInto`, after restamping the tick:

```ts
    const settled = a.parked && parts.terrain != null
      ? { ...state, position: v3(state.position.x, heightAt(parts.terrain, state.position.x, state.position.z) + a.spec.gear.heightM, state.position.z) }
      : state
    return { ...a, state: settled, previous: settled }
```

`spawnHeldGroup(world, ...)` passes `terrain: world.terrain`; the `spawnInto` call at `src/sim/loop.ts:921` passes `terrain: world.terrain`. (Held ship parks are still rejected, so `heightAt` is right; no decks.)

- [ ] **Step 6: The Tier 1 helper**

In `tests/sim/mission/fly.ts`, add next to `settled`:

```ts
/** `settled`, for every parked entity: the frame layer's `settleOnTerrain`
 *  runs once at load, so a headless world with a parked AI needs this. */
export function settledAll(w: World<undefined>): World<undefined> {
  let world = w
  for (const a of w.aircraft) {
    if (!a.parked) continue
    const ground = groundUnder(w.terrain, decksOf(w.ships), a.state.position.x, a.state.position.z)
    if (ground === null) continue
    const pos = a.state.position
    world = withAircraftState(world, a.id, { ...a.state, position: v3(pos.x, ground.heightM + a.spec.gear.heightM, pos.z) })
  }
  return world
}
```

- [ ] **Step 7: A settle test** appended to `scenarioTakeoff.test.ts`

```ts
it.skipIf(terrain === null)('a spawned parked aircraft rests on the terrain', () => {
  let w = worldFromScenario(bundleWithHeldTakeoff(), terrain)
  w = spawnHeldGroup(w, 'defenders')
  const a = aircraftById(w, 'ai-1')!
  const ground = groundUnder(terrain, [], a.state.position.x, a.state.position.z)!
  expect(a.state.position.y).toBeCloseTo(ground.heightM + a.spec.gear.heightM, 6)
})
```

with `const terrain = terrainOrSkip()`.

- [ ] **Step 8: Run, type-check and commit**

Run: `npx vitest run tests/sim/scenarioTakeoff.test.ts tests/sim/scenario.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors (the new `PilotMode` member may make an exhaustive `switch` fail to compile; fix each by handling `'takeoff'` like `'loiter'` where it only reads the mode, and note each in the commit).

```bash
git add src/sim/ai/pilot.ts src/sim/ai/takeoff.ts src/sim/scenario.ts src/sim/mission/spawn.ts src/sim/loop.ts tests/sim/mission/fly.ts tests/sim/scenarioTakeoff.test.ts
git commit -m "7h Task 1: takeoff pilots, airfield-parked held groups, settle at spawn"
```

---

### Task 2: The takeoff controller, measured

**Files:**
- Create/replace: `src/sim/ai/takeoff.ts`
- Test: `tests/sim/ai/takeoff.test.ts`

**Interfaces:**
- Consumes: `airVelocity(state, wind)` (`src/sim/flight/model.ts`), `effectiveStallSpeedMps(spec, flapFraction)` (`src/sim/ground.ts`), `attitudeAngles` (`src/sim/flight/attitude.ts`), `heightAboveGround` (`src/sim/ai/safety.ts`), `DT`.
- Produces:

```ts
export function startTakeoff(): TakeoffState                       // { phase: 'wait', sinceS: 0, headingRad: null, pitchIntegral: 0 }
export function takeoffControls<M>(
  a: AircraftEntity<M>, t: TakeoffState, ctx: TakeoffContext, snapshot: readonly AircraftEntity<M>[],
): { controls: Controls; takeoff: TakeoffState | null }           // null = the climb is done
export type TakeoffContext = Pick<PilotTickContext, 'nowS' | 'terrain' | 'decks' | 'wind' | 'combat'>
export function takeoffClear<M>(a: AircraftEntity<M>, snapshot: readonly AircraftEntity<M>[], ctx: Pick<TakeoffContext, 'terrain' | 'decks' | 'combat'>): boolean
```

The constants below are **starting values, from the player's `deckRun` law** (`tests/sim/mission/fly.ts`, F6F, Tacloban, measured 2026-09-26/27). **Step 1 measures the Zero and overwrites them.** The tests in Steps 4-6 are the acceptance criteria, not the numbers.

- [ ] **Step 1: Measure before writing constants**

Write a throwaway `tests/sim/ai/zz-takeoff-probe.test.ts` (delete it at the end of the task) that puts an `a6m2-zero` on Dulag's runway: build a world from `airfield-strike` with the Task 1 helper, replace the player state with `parkedStateOnRunway(spec, dulag, {x: 0, z: -650}, groundHeight)` (`src/sim/ai/parkSpots.ts`), and fly it with the law in Step 3 for 60 s, printing every 2 s: airspeed, wheels height, distance rolled, pitch angle, and heading error. Record, in the constants' comments with the date, for flaps up and flaps down: the airspeed at which the tail comes up, the roll distance to 10 m height, the time to 150 m AGL, and whether it holds heading with `TAKEOFF_STEER_GAIN`. Pick the flap setting with the shorter run that still holds the climb.

- [ ] **Step 2: Write the failing tests**

```ts
describe('takeoffControls (pure)', () => {
  it('waits on the brakes when there is no terrain', () => {
    const a = parkedZero()                       // a helper: an a6m2-zero AircraftEntity, parked state, no terrain
    const out = takeoffControls(a, startTakeoff(), ctx({ terrain: null }), [a])
    expect(out.takeoff!.phase).toBe('wait')
    expect(out.controls).toMatchObject({ throttle: 0, brake: 1, gearDown: true })
  })
  it('latches the runway heading from the parked attitude on the first tick', () => {
    const a = parkedZero({ headingDeg: 0 })
    const out = takeoffControls(a, startTakeoff(), ctx({ terrain }), [a])
    expect(out.takeoff!.headingRad).toBeCloseTo(0, 6)
  })
  it('goes to roll at full throttle with the brakes off', () => {
    const a = parkedZero()
    let t = takeoffControls(a, startTakeoff(), ctx({ terrain }), [a]).takeoff!
    const out = takeoffControls(a, t, ctx({ terrain }), [a])
    expect(out.takeoff!.phase).toBe('roll')
    expect(out.controls).toMatchObject({ throttle: 1, brake: 0, gearDown: true, pitch: 0 })
  })
  it('steers the nose toward the latched heading (positive yaw is nose right)', () => {
    const a = parkedZero({ headingDeg: 5 })      // nose 5 degrees right of a north-latched runway
    const t = { phase: 'roll' as const, sinceS: 1, headingRad: 0, pitchIntegral: 0 }
    expect(takeoffControls(a, t, ctx({ terrain }), [a]).controls.yaw).toBeLessThan(0)
  })
})
```

The `ctx` and `parkedZero` builders go in the test file: `ctx` returns `{ nowS: 0, terrain, decks: [], wind: null, combat }` with `combat` from `createCombat` of the one aircraft; `parkedZero` builds an entity from `loadAircraftSpec('a6m2-zero')` and `parkedStateOnRunway` on a hand-built `Airfield`, copying how `tests/sim/ai/recovery*.test.ts` builds its entities (`grep -n "parkedStateOnRunway" tests/sim/ai/*.test.ts`).

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run tests/sim/ai/takeoff.test.ts`
Expected: FAIL (`takeoffControls` is not a function, or the stub).

- [ ] **Step 4: Implement `takeoff.ts`**

```ts
import type { AircraftEntity } from '../loop.js'
import type { Controls } from '../flight/state.js'
import { airVelocity, DT } from '../flight/model.js'
import { attitudeAngles } from '../flight/attitude.js'
import { effectiveStallSpeedMps } from '../ground.js'
import { qRotate } from '../math/quat.js'
import { length, sub, v3 } from '../math/vec3.js'
import { isAircraftDown } from '../weapons/combat.js'
import { airborne } from './airborne.js'
import { heightAboveGround } from './safety.js'
import type { PilotTickContext } from './pilotTick.js'

export type TakeoffPhase = 'wait' | 'roll' | 'climb'
export type TakeoffState = {
  readonly phase: TakeoffPhase
  readonly sinceS: number
  readonly headingRad: number | null
  readonly pitchIntegral: number
}
export type TakeoffContext = Pick<PilotTickContext, 'nowS' | 'terrain' | 'decks' | 'wind' | 'combat'>

/** Starting values from `deckRun` (F6F); Task 2 Step 1 replaces each with the Zero's measured one. */
export const TAKEOFF_ROTATE_STALL_MULTIPLE = 1.1
export const TAKEOFF_ROTATE_PITCH = 0.6
export const TAKEOFF_CLIMB_OUT_M = 10
export const TAKEOFF_CLIMB_DEG = 10
export const TAKEOFF_CLIMB_MIN_STALL_MULTIPLE = 1.3
export const TAKEOFF_GEAR_UP_M = 30
export const TAKEOFF_DONE_M = 150
export const TAKEOFF_CLEAR_M = 400
export const TAKEOFF_STEER_GAIN = 2
export const TAKEOFF_FLAPS = false

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x))
const wrapPi = (x: number): number => Math.atan2(Math.sin(x), Math.cos(x))
const headingOf = (a: AircraftEntity<unknown>): number => {
  const f = qRotate(a.state.attitude, v3(1, 0, 0))
  return Math.atan2(f.x, -f.z)
}

export const startTakeoff = (): TakeoffState => ({ phase: 'wait', sinceS: 0, headingRad: null, pitchIntegral: 0 })

export function takeoffClear<M>(
  a: AircraftEntity<M>, snapshot: readonly AircraftEntity<M>[], ctx: Pick<TakeoffContext, 'terrain' | 'decks' | 'combat'>,
): boolean {
  return !snapshot.some((c) => {
    if (c.id >= a.id || c.pilot?.decision.mode !== 'takeoff') return false
    if (c.impact !== null || isAircraftDown(ctx.combat.aircraft, c)) return false
    if (airborne(c, ctx.terrain, ctx.decks)) return false
    return length(sub(c.state.position, a.state.position)) < TAKEOFF_CLEAR_M
  })
}

export function takeoffControls<M>(
  a: AircraftEntity<M>, t: TakeoffState, ctx: TakeoffContext, snapshot: readonly AircraftEntity<M>[],
): { controls: Controls; takeoff: TakeoffState | null } {
  const held: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0, gearDown: true, flapDown: false, hookDown: false, brake: 1 }
  const headingRad = t.headingRad ?? headingOf(a)
  const s = a.state
  const now = ctx.nowS
  const wheelsM = heightAboveGround(s, ctx.terrain, ctx.decks) - a.spec.gear.heightM
  let next: TakeoffState = { ...t, headingRad }

  if (next.phase === 'wait') {
    if (ctx.terrain === null || !takeoffClear(a, snapshot, ctx)) return { controls: held, takeoff: next }
    next = { ...next, phase: 'roll', sinceS: now }
  }
  const air = length(airVelocity(s, ctx.wind))
  const stall = effectiveStallSpeedMps(a.spec, TAKEOFF_FLAPS ? 1 : 0)
  if (next.phase === 'roll' && wheelsM >= TAKEOFF_CLIMB_OUT_M) next = { ...next, phase: 'climb', sinceS: now }

  if (next.phase === 'roll') {
    const yaw = clamp(TAKEOFF_STEER_GAIN * wrapPi(headingRad - headingOf(a)), -1, 1)
    const pitch = air >= TAKEOFF_ROTATE_STALL_MULTIPLE * stall ? TAKEOFF_ROTATE_PITCH : 0
    return { controls: { pitch, roll: 0, yaw, throttle: 1, gearDown: true, flapDown: TAKEOFF_FLAPS, hookDown: false, brake: 0 }, takeoff: next }
  }
  // climb
  if (heightAboveGround(s, ctx.terrain, ctx.decks) >= TAKEOFF_DONE_M) return { controls: held, takeoff: null }
  const gammaDeg = (Math.atan2(s.velocity.y, Math.hypot(s.velocity.x, s.velocity.z)) * 180) / Math.PI
  const error = (air < TAKEOFF_CLIMB_MIN_STALL_MULTIPLE * stall ? 0 : TAKEOFF_CLIMB_DEG) - gammaDeg
  const pitchIntegral = clamp(next.pitchIntegral + (error * DT) / 40, -0.5, 1)
  const pitch = clamp(error / 20 + pitchIntegral, -1, 1)
  const roll = clamp(-2 * attitudeAngles(s).rollRad, -1, 1)
  const yaw = clamp(TAKEOFF_STEER_GAIN * wrapPi(headingRad - headingOf(a)), -1, 1)
  return {
    controls: { pitch, roll, yaw, throttle: 1, gearDown: wheelsM < TAKEOFF_GEAR_UP_M, flapDown: TAKEOFF_FLAPS, hookDown: false, brake: 0 },
    takeoff: { ...next, pitchIntegral },
  }
}
```

If Step 1 shows the roll needs a different steering law (a tailwheel swings; the F6F's `deckRun` used `yaw: 0`), change only `TAKEOFF_STEER_GAIN` and, if needed, add a rate term; record why in the constant's comment.

- [ ] **Step 5: Integration acceptance tests (headless runway takeoffs)** appended to `tests/sim/ai/takeoff.test.ts`

```ts
const terrain = terrainOrSkip()
describe.skipIf(terrain === null)('a Zero takes off from Dulag (Tier 1, real terrain)', () => {
  it('is 150 m up inside 60 s, never impacts, and stays on the runway', () => {
    let w = settledAll(worldFromScenario(loadScenarioBundle('takeoff-fixture'), terrain))
    const runwayEnd = runwayEndOf('dulag')
    let maxAcross = 0
    let up = -1
    for (let i = 0; i < 60 * 60; i++) {
      w = advance(w, DT).world
      const a = aircraftById(w, 'ai-1')!
      expect(a.impact).toBeNull()
      maxAcross = Math.max(maxAcross, acrossRunway(a, 'dulag'))
      if (up < 0 && a.pilot!.decision.mode !== 'takeoff') up = i * DT
    }
    expect(up).toBeGreaterThan(0)
    expect(up).toBeLessThan(60)
    expect(maxAcross).toBeLessThan(22.5)       // half the runway width
    expect(distanceRolled(w, 'ai-1')).toBeLessThan(runwayEnd)
  }, 60000)
})
```

`takeoff-fixture` is a small scenario in `tests/fixtures/scenarios/`: the Tacloban-parked player (copy `recovery-range`'s player entry) plus one start-parked Zero `ai-1` at Dulag `{x: 0, z: -650}` with `pilot: { takeoff: true }`, and `airfields: ["tacloban", "dulag"]`. `runwayEndOf`, `acrossRunway`, `distanceRolled` are local helpers using `localToWorld`, `runwayHeadingRad` (`src/sim/world/airfields.ts`) and the aircraft's initial position; write them in the test file. Add a second `it` for the F6F (`f6f-hellcat`) so the controller is not tuned to the Zero alone.

- [ ] **Step 6: Run, tune, repeat**

Run: `npx vitest run tests/sim/ai/takeoff.test.ts`
Expected: PASS. If a takeoff fails, change one constant at a time and record each change's effect in the constant's comment with today's date, as `recovery.ts` does.

- [ ] **Step 7: Commit**

```bash
rm tests/sim/ai/zz-takeoff-probe.test.ts
git add src/sim/ai/takeoff.ts tests/sim/ai/takeoff.test.ts tests/fixtures/scenarios/takeoff-fixture.json
git commit -m "7h Task 2: takeoff controller, measured on the Zero and the Hellcat"
```

---

### Task 3: `pilotTick` integration

**Files:**
- Modify: `src/sim/ai/pilotTick.ts` (after the `landed` short-circuit, near line 84)
- Modify: `src/render/diagnostics.ts` (near line 214), `src/render/main.ts` (near line 985)
- Test: `tests/sim/ai/takeoffPilot.test.ts`

**Interfaces:**
- Consumes: `takeoffControls`, `TakeoffState` (Task 2); `finishControls` (`src/sim/ai/safety.ts`).
- Produces: pilots in `takeoff` mode fly `takeoffControls` each tick and, when it returns `takeoff: null`, become ordinary `engage` pilots on that tick. `__ww2.aircraft()` rows gain `takeoff: TakeoffPhase | null`.

- [ ] **Step 1: Write the failing tests** in `tests/sim/ai/takeoffPilot.test.ts`

```ts
describe.skipIf(terrain === null)('takeoff mode in the pilot tick', () => {
  it('a pair takes off in id order and never closes inside 40 m on the ground (RF2)', () => {
    let w = settledAll(worldFromScenario(loadScenarioBundle('takeoff-pair-fixture'), terrain))
    let minSep = Infinity
    for (let i = 0; i < 90 * 60; i++) {
      w = advance(w, DT).world
      const a = aircraftById(w, 'ai-1')!, b = aircraftById(w, 'ai-2')!
      if (!airborne(a, terrain, []) || !airborne(b, terrain, [])) minSep = Math.min(minSep, dist(a, b))
    }
    expect(minSep).toBeGreaterThan(40)
    expect(aircraftById(w, 'ai-2')!.pilot!.decision.mode).not.toBe('takeoff')
  }, 90000)

  it('a leader destroyed on the ground does not block the wingman (RF3)', () => {
    let w = settledAll(worldFromScenario(loadScenarioBundle('takeoff-pair-fixture'), terrain))
    w = destroyNow(w, ['ai-1'])
    for (let i = 0; i < 60 * 60; i++) w = advance(w, DT).world
    expect(aircraftById(w, 'ai-2')!.pilot!.decision.mode).not.toBe('takeoff')
  }, 60000)

  it('holds on the brakes with no terrain (RF4)', () => {
    let w = worldFromScenario(loadScenarioBundle('takeoff-pair-fixture'), null)
    const a = aircraftById(w, 'ai-1')!
    const out = pilotTick(a, w.aircraft, tickCtx({ terrain: null, combat: w.combat }))
    expect(out.controls).toMatchObject({ throttle: 0, brake: 1 })
    expect(out.pilot!.decision.takeoff!.phase).toBe('wait')
  })

  it('takes no target and never fires while taking off', () => {
    let w = settledAll(worldFromScenario(loadScenarioBundle('takeoff-pair-fixture'), terrain))
    for (let i = 0; i < 20 * 60; i++) {
      w = advance(w, DT).world
      const a = aircraftById(w, 'ai-1')!
      if (a.pilot!.decision.mode === 'takeoff') { expect(a.pilot!.decision.targetId).toBeNull(); expect(a.controls.fire).toBeFalsy() }
    }
  }, 30000)
})
```

`takeoff-pair-fixture` is `takeoff-fixture` plus `ai-2` at `{x: 0, z: -750}`. Copy `tickCtx` from how `tests/sim/ai/recovery*.test.ts` builds a `PilotTickContext`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/sim/ai/takeoffPilot.test.ts`
Expected: FAIL (takeoff pilots fly the ordinary loiter and never roll).

- [ ] **Step 3: Implement the short-circuit**

In `pilotTick`, after the `landed` block:

```ts
  // 7h: a takeoff is flown before any rescore: no target, no fire, no floor.
  if (pilot.decision.mode === 'takeoff' && pilot.decision.takeoff !== undefined) {
    const flown = takeoffControls(a, pilot.decision.takeoff, ctx, snapshot)
    if (flown.takeoff !== null) {
      // Noise only in the climb: a rolling tailwheel does not want jitter.
      const noisy = flown.takeoff.phase === 'climb'
        ? finishControls(a, flown.controls, pilot.skill.controlNoise, pilot.decision.noiseCursor, ctx.wind)
        : { controls: flown.controls, cursor: pilot.decision.noiseCursor }
      return {
        ...a, controls: noisy.controls,
        pilot: { ...pilot, decision: { ...pilot.decision, takeoff: flown.takeoff, safety: 'none', latch: null, noiseCursor: noisy.cursor } },
      }
    }
    // Climb done: an ordinary pilot from this tick; the rescore below chooses engage or loiter.
    const { takeoff: _done, ...rest } = pilot.decision
    pilot = { ...pilot, decision: { ...rest, mode: 'engage', nextRescoreS: 0 } }
  }
```

Import `takeoffControls` from `./takeoff.js`. The `a` used below still holds the old `pilot` field, so return through the existing paths, which read the local `pilot` and `decision`: verify with the final test in Step 1 that the hand-off tick returns a `mode` other than `takeoff`.

- [ ] **Step 4: Diagnostics**

`src/render/diagnostics.ts` next to `recovery: RecoveryPhase | null` (line 215): add `readonly takeoff: TakeoffPhase | null` (doc: "Plan 7h: the takeoff phase for an AI on its takeoff, else `null`"), and in `src/render/main.ts` next to line 985 set `takeoff: a.pilot?.decision.takeoff?.phase ?? null`.

- [ ] **Step 5: Run the new tests plus the gates**

Run: `npx vitest run tests/sim/ai/takeoffPilot.test.ts tests/sim/ai/determinism.test.ts tests/sim/ai/recovery.test.ts && npx tsc --noEmit`
Expected: PASS. `determinism.test.ts` untouched and green is Review Focus 6.

- [ ] **Step 6: Commit**

```bash
git add src/sim/ai/pilotTick.ts src/render/diagnostics.ts src/render/main.ts tests/sim/ai/takeoffPilot.test.ts tests/fixtures/scenarios/takeoff-pair-fixture.json
git commit -m "7h Task 3: takeoff mode in pilotTick, ordered on the runway, diagnostics"
```

---

### Task 4: Airfield Strike, the defenders scramble

**Files:**
- Modify: `content/scenarios/airfield-strike.json` (`heldGroups[0]`)
- Modify: `tests/sim/mission/missions/airfield-strike.test.ts` (the content test at line 50 pins "spawn inside the ring", which no longer applies to parked defenders)
- Test: same file

**Interfaces:**
- Consumes: Tasks 1-3; `runwayHeadingRad`, `localToWorld`, `loadAirfield`.
- Produces: defenders parked on Dulag's runway (Zeros), spawned by the existing `scramble` trigger, that take off and attack.

- [ ] **Step 1: Write the failing tests**

Replace the first content test with:

```ts
it('the defenders are Zeros parked on Dulag\'s runway and scramble on takeoff', () => {
  const { scenario } = loadScenarioBundle('airfield-strike')
  const group = scenario.heldGroups!.find((g) => g.id === 'defenders')!
  expect(group.aircraft ?? []).toHaveLength(2)
  for (const a of group.aircraft ?? []) {
    expect(a.spec).toBe('a6m2-zero')
    if (!('parkedAt' in a) || 'ship' in a.parkedAt) throw new Error(`${a.id} is not parked on an airfield`)
    expect(a.parkedAt.airfield).toBe('dulag')
    expect(a.chocked).toBe(false)
    expect(a.pilot?.takeoff).toBe(true)
  }
})

it('each takeoff spot leaves 1.5x the measured Zero takeoff run ahead of it (RF1)', () => {
  const field = loadAirfield('dulag')
  const fwd = { x: Math.sin(runwayHeadingRad(field)), z: -Math.cos(runwayHeadingRad(field)) }
  const end = { x: field.runway.center.x + fwd.x * field.runway.lengthM / 2, z: field.runway.center.z + fwd.z * field.runway.lengthM / 2 }
  for (const a of defenderSpots()) {
    const w = localToWorld(field, a.x, a.z)
    expect((end.x - w.x) * fwd.x + (end.z - w.z) * fwd.z).toBeGreaterThanOrEqual(1.5 * ZERO_TAKEOFF_RUN_M)
  }
})

it.skipIf(terrain === null)('the ground ahead of the runway end stays under the climb path (RF5)', () => {
  // sample heightAt every 100 m for 3 km past the end along the heading; assert
  // height <= runwayElevation + 100 + tan(TAKEOFF_CLIMB_DEG) * distance
})
```

`ZERO_TAKEOFF_RUN_M` is the roll distance to 10 m height recorded in Task 2 Step 1, as a constant in the test with its date. Write the RF5 body out in full (loop with `heightAt(terrain, x, z)`); the comment above is the assertion.

The behavior test (the regression for Mark's report), extending the success test's staging:

```ts
it.skipIf(terrain === null)('the scrambled defenders take off, engage the striker and fire (regression, 2026-09-28)', () => {
  let w = settledAll(worldFromScenario(loadScenarioBundle('airfield-strike'), terrain))
  const start = levelAt({ x: DULAG.x, z: DULAG.z - 7900 }, 400, 100, 180)
  const engaged = new Set<string>(), fired = new Set<string>()
  let airborneAtS = Infinity
  for (let i = 0; i < 120 * 60; i++) {
    const p = i === 0 ? start : aircraftById(w, w.player)!.state
    w = withAircraftState(w, w.player, { ...p, tick: w.tick })
    w = advance(w, DT).world
    for (const id of DEFENDERS) {
      const d = aircraftById(w, id)
      if (d === undefined) continue
      if (d.pilot!.decision.mode === 'engage' && d.pilot!.decision.targetId === w.player) engaged.add(id)
      if (d.controls.fire) fired.add(id)
      if (d.pilot!.decision.mode !== 'takeoff' && airborneAtS === Infinity) airborneAtS = i * DT
    }
  }
  expect(airborneAtS).toBeLessThan(60)
  expect([...engaged].sort()).toEqual(DEFENDERS)
  expect(fired.size).toBeGreaterThan(0)
}, 120000)
```

Note the player is pinned only on its first tick and flies its own state afterward, as in the 2026-09-28 probe, so it descends about 25 m per 3 s: the assertion is about the defenders' behavior against a striker that keeps coming, not a flying test of the player.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/sim/mission/missions/airfield-strike.test.ts`
Expected: FAIL (the defenders still spawn airborne, and are still Hellcats if the prerequisite commit was skipped).

- [ ] **Step 3: Edit the scenario**

In `content/scenarios/airfield-strike.json`, replace each defender's `airborneAt` with a `parkedAt`:

```json
{
  "id": "defender-1",
  "spec": "a6m2-zero",
  "tags": ["defenders"],
  "parkedAt": { "airfield": "dulag", "spot": { "x": 0, "z": -650 } },
  "chocked": false,
  "pilot": { "skill": "green", "takeoff": true }
}
```

`defender-2` at `{ "x": 0, "z": -750 }`. If RF1's ahead-run test says both spots face the short end, negate both `z`. Leave the `scramble` trigger and message as they are.

- [ ] **Step 4: Run, then tune only with data**

Run: `npx vitest run tests/sim/mission/missions/airfield-strike.test.ts`
Expected: PASS. If the behavior test fails because the Zeros merge head-on again without firing (their runway heading is north, toward an arriving striker), the knobs in the order to try are: (1) enlarge the `scramble` ring's `radiusM` so they are airborne and turned before the striker arrives (this changes the pinned ring in the trigger, so update the content test that pins `enters: { point: DULAG, radiusM: 8000 }` and the file's header note); (2) move the spots to the runway's far end so they reach altitude over the striker's track; (3) only then consider the AI's head-on firing window, which is a separate plan. Record each try and its measured firing time in the test file's header note, as the M3 tuning notes do.

- [ ] **Step 5: Whole mission suite, then commit**

Run: `npx vitest run tests/sim/mission/missions/airfield-strike.test.ts tests/content && npx tsc --noEmit`
Expected: PASS.

```bash
git add content/scenarios/airfield-strike.json tests/sim/mission/missions/airfield-strike.test.ts
git commit -m "7h Task 4: Airfield Strike defenders scramble off Dulag's runway"
```

---

### Task 5: Tier 2, handoff and docs

**Files:**
- Create: `content/scenarios/takeoff-range.json`, `tests/e2e/takeoff.spec.ts`
- Create: `docs/handoff/2026-09-2x-plan7h-takeoff.md` (use the real date)
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§15 row), `README.md`

- [ ] **Step 1: The Tier 2 scenario and spec**

`takeoff-range.json`: copy `content/scenarios/recovery-range.json`, remove its AI entries, and add two start-parked Zeros on Dulag (`spot` z -650 and -750, `chocked: false`, `pilot: { takeoff: true }`) with `airfields: ["tacloban", "dulag"]`. `tests/e2e/takeoff.spec.ts`: copy `tests/e2e/recovery.spec.ts`'s structure (viewport, `waitForTerrain`, `aircraft(page)` via `__ww2.aircraft()`, triple time, `setTimeout`). Assertions: both Zeros' `takeoff` rows leave `roll` and become `null` within 90 s of sim time; `f6f-1` (the parked player) is untouched; zero validation errors; and the frame budget held, with the same statistic `recovery.spec.ts` uses. There is no camera that follows an AI, so the check is numeric, as in 7g.

- [ ] **Step 2: Run Tier 2 on the reference GPU**

Run via the repo's documented route (`docs/handoff/2026-09-28-plan7g-landing.md` lists it; take the ryzen hwlock if `hwlock status` shows it required). Expected: PASS. Known open item, not this plan's: the 1440p budget was already red at baseline (7-8 ms against 6.0); record the takeoff run's number next to it in the handoff without treating it as a regression.

- [ ] **Step 3: Docs**

Handoff: what shipped, the measured Zero constants, the tuning trail for Airfield Strike, the open items (taxiing, AI carrier takeoff, a `home` for defenders, the head-on firing window), and the Tier 2 numbers. §15: one row for 7h in the status table's existing style. README: one line where 7g is listed.

- [ ] **Step 4: Full verification and commit**

Run: `remote-run npm run verify`
Expected: exit 0 (capture `rc=$?` before any filtering: never gate on a piped grep).

```bash
git add content/scenarios/takeoff-range.json tests/e2e/takeoff.spec.ts docs README.md
git commit -m "7h Task 5: Tier 2 takeoff range, handoff, section 15"
```

---

## Self-review

- **Spec coverage:** scenario (Task 1), spawn settle (Task 1), phase machine and constants (Task 2), pilot mode and ordering (Task 3), Airfield Strike content and Mark's regression (Task 4), Tier 2 and docs (Task 5). Out-of-scope items are listed in Design.
- **Review Focus mapping:** RF1 and RF5 are Task 4 content tests; RF2, RF3, RF4 are Task 3 tests; RF6 is Task 3 Step 5.
- **Type consistency:** `TakeoffState` fields (`phase`, `sinceS`, `headingRad`, `pitchIntegral`) are the same in the Design, Task 1 Step 1, Task 1 Step 4 and Task 2; `startTakeoff()` matches the seeded value in Task 1; `takeoffControls` returns `takeoff: null` on completion in Task 2 and is consumed as such in Task 3.
- **Known unknowns, all resolved by a measurement step, not a guess:** the Zero's rotate speed, flap choice, steering gain, takeoff run and climb (Task 2 Step 1); whether Dulag's spot `z` sign is right (Task 4 Step 1's RF1 test); whether the head-on merge returns (Task 4 Step 4's ranked knobs).

---

## Amendments (controller rulings during execution, 2026-09-28)

- Dulag spots are runway-local **z +650 (ai-1) and z +750 (ai-2)**, not -650/-750: heading 000 makes local -z the departure end, so -650 leaves 100 m ahead. ai-1 is then ahead and has the lower id. Task 4 uses these; RF1 requires at least 1.5 x `ZERO_TAKEOFF_RUN_M` (267 m calm, 244 m in Airfield Strike's 3 m/s headwind; exported from `takeoff.ts`) ahead of each spot.
- `TAKEOFF_DONE_M` is **450 m**, not 150 m. Defenders become ordinary pilots about 50 s after brakes off, not about 27 s. Task 4's behavior test must use a horizon that allows this (its `airborneAtS < 60` is tight; use 75 s) and its scramble geometry (ring radius, spot end) must account for the later hand-off.
- Task 3 also covers an F6F and an engage hand-off (no crash 90 s past hand-off). Task 4 adds a check with the real striker in range at hand-off.
