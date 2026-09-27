# Plan 7f: formation, wingmen and escort — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any aircraft (the player, a fighting AI, a raider on ingress) can lead up to three AI wingmen, who hold station, rejoin, and cover the leader against threats, all from scenario content alone.

**Architecture:** A new pure module, `src/sim/ai/formation.ts`, holds the station table, the one station-keeping law, the wingman's engage filter and the leader-lost handoff. `pilotTick` gains a `formation` branch that uses them. Content gains `pilot.leader` and `pilot.slot`, validated in `scenario.ts`. `loop.ts` and `targeting.ts` are not edited: 7e left the `formation` mode and the `leaderId` seam for this.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`), zod, vitest, Playwright (Tier 2 only).

**Spec:** `docs/superpowers/specs/2026-09-27-ai-7f-formation-design.md`. It amends §5 of `docs/superpowers/specs/2026-09-25-ai-7c-design.md`, whose §7 (cross-cutting constraints) still applies. Read both before Task 1.

**Worktree:** `/home/mark/projects/ww2airsim-worktrees/ai-7f-formation`, branch `worktree-ai-7f-formation`, cut from `main` at `134fe22`. Every command below runs from there.

**Execution (Mark, 2026-09-27):** subagent-driven. **Viewing checkpoint:** the final product only: Furball with Dev checked after Task 7, and Task 9's fixture once the sortie forms land. **Unattended:** run to completion without stopping; put the checkpoint captures in the handoff. The stop-and-report conditions in Tasks 3, 4 and 7 still apply. At one of those, finish the other tasks and report in the handoff.

## Global Constraints

- Everything new in `sim/` imports only from `sim/`. `.dependency-cruiser.cjs` is untouched and `tests/architecture/boundary.test.ts` must still pass.
- Deterministic: the only randomness is the existing per-pilot `noiseCursor`. New choices break ties by id, never by array position.
- Every new runtime field is plain data, so a `World` round-trips through `structuredClone`.
- Airframe-agnostic: no AI code names an airframe. Speeds come from `spec.reference.stallSpeedMps`, G from `spec.limits.gLimit`.
- No manual verification. Every acceptance item is an assertion. Tier 2 screenshots are read by the executing agent, not by Mark.
- **Do not edit** `src/sim/loop.ts`, the weights in `src/sim/ai/targeting.ts`, `src/render/titleScreen.ts`, aircraft specs in `content/aircraft/`, or anything under `tools/models/`. The sortie-forms and R4 sessions own those.
- `src/render/main.ts` is edited only in Task 9, only inside the `aircraft()` diagnostic, and re-diffed against `main` right before committing.
- **Tests on nexus:** run only the files you touch, with `--maxWorkers=2` (parallel full suites have OOM-killed nexus). Full suites and `npm run verify` go through `remote-run` (`remote-run npm run verify`). Capture `rc=$?` directly; never judge a run by a grepped pipeline.
- US spelling in prose and new identifiers.
- Tuning values are named `export const`s with a comment saying what measured them and when (2026-09-27 or later, and how).
- Commit after every task in the worktree. Never push `main`. The branch may be pushed.

## Review Focus

1. **A wingman ahead of its station** (or ahead of the leader): the law asks for less than the leader's speed. Expected: it never drops below 1.2× clean stall speed, and it drops back to its station. Pinned in Task 3.
2. **A leader with almost no horizontal velocity** (a vertical climb, a stall, a spawn at rest): the heading frame is undefined. Expected: the station falls back to the leader's body forward, with no NaN. Pinned in Task 2.
3. **Hostiles detected far off** (6 km, inside the 8 km detection range) while nothing is near: an escort must not leave its bomber to chase them. Pinned in Task 4.
4. **Array order:** a wingman listed before its leader in `world.aircraft`, or after. Expected: identical flights, because every pilot reads the start-of-tick snapshot. Pinned in Task 6.
5. **The leader is shot down while its wingman is mid-fight:** expected, it keeps fighting, then flies the leader's route (or loiters). No NaN, no floor or G violation. Pinned in Task 5.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/sim/ai/pilot.ts` (modify) | `FormationSlot`, `FormationOrders`; `coverUntilS?` on `PilotDecisionState` |
| `src/sim/ai/pursuit.ts` (modify) | `formation?: FormationOrders` on `PilotAssignment` |
| `src/sim/scenario.ts` (modify) | `pilot.leader` / `pilot.slot` schema, validation, mapping to `PilotAssignment` |
| `src/sim/ai/formation.ts` (create) | stations, station-keeping law, throttle, cover filter, leader-lost handoff |
| `src/sim/ai/pilotTick.ts` (modify) | the `formation` branch |
| `tests/sim/ai/formationWorlds.ts` (create) | raw-scenario builders for the Tier 1 cases |
| `tests/sim/ai/formationSchema.test.ts` (create) | content validation |
| `tests/sim/ai/formation.test.ts` (create) | pure geometry and law, no `advance` |
| `tests/sim/ai/formationFlight.test.ts` (create) | station, turn, rejoin, ahead-of-station, ingress follow |
| `tests/sim/ai/formationCover.test.ts` (create) | escort, sandwich, far hostiles, trail cover |
| `tests/sim/ai/formationLeader.test.ts` (create) | leader lost, parked leader |
| `tests/sim/ai/formationSoak.test.ts` (create) | determinism, array order, clone, safety invariants |
| `content/scenarios/furball-range.json` (modify) | `ally-1` becomes the player's wingman |
| Task 9 only: `content/scenarios/dev-formation.json`, `src/render/main.ts`, `tests/e2e/formation.spec.ts` | Tier 2 |

---

### Task 1: Content and runtime types for leader and slot

**Files:**
- Modify: `src/sim/ai/pilot.ts` (types near `IngressOrders`, ~line 132; `PilotDecisionState`, ~line 148)
- Modify: `src/sim/ai/pursuit.ts:8-17` (`PilotAssignment`)
- Modify: `src/sim/scenario.ts:69-98` (`PilotObject`, `pilotAssignmentFrom`), `:229-260` (first `superRefine`), `checkMission` held-group loop (~`:295-322`)
- Test: `tests/sim/ai/formationSchema.test.ts`

**Interfaces:**
- Produces: `type FormationSlot = 1 | 2 | 3`; `type FormationOrders = { readonly leader: string; readonly slot: FormationSlot }` (both in `pilot.ts`); `PilotAssignment.formation?: FormationOrders`; `PilotDecisionState.coverUntilS?: number`. A scenario wingman's initial `decision.mode` is `'formation'`.

- [x] **Step 1: Write the failing tests**

```ts
// tests/sim/ai/formationSchema.test.ts
import { describe, expect, it } from 'vitest'
import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { aircraftById } from '../../../src/sim/loop.js'
import { bundleForScenario } from '../../../tools/content/load.js'
import { REACH_FAR, scenario } from '../mission/fixture.js'

/** 7f spec §1: `pilot.leader` and `pilot.slot`, each rule rejected by name. */
const PLAYER = { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 } }
const at = (x: number, z = 0) => ({ position: [x, 3000, z], headingDeg: 90, speedMps: 120 })
const wing = (id: string, pilot: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ id, spec: 'f6f-hellcat', side: 'allied', airborneAt: at(-100, 100), pilot: { skill: 'green', ...pilot }, ...extra })
const raw = (aircraft: unknown[]) => ({ id: 'formation-schema', player: 'f6f-1', airfields: ['tacloban'], aircraft, ships: [], weather: { windFromDeg: 0, windMps: 0 } })

describe('pilot.leader and pilot.slot (7f spec §1)', () => {
  it('accepts the player as leader and builds a formation pilot', () => {
    const w = worldFromScenario(bundleForScenario(parseScenario(raw([PLAYER, wing('wing-1', { leader: 'f6f-1', slot: 1 })]))), null)
    const p = aircraftById(w, 'wing-1')!.pilot!
    expect(p.formation).toEqual({ leader: 'f6f-1', slot: 1 })
    expect(p.target).toBeNull()
    expect(p.ingress).toBeUndefined()
    expect(p.decision.mode).toBe('formation')
  })

  it('accepts an AI leader with three wingmen in slots 1-3', () => {
    const lead = { id: 'lead-1', spec: 'f6f-hellcat', side: 'allied', airborneAt: at(-500), pilot: { skill: 'veteran' } }
    expect(() => parseScenario(raw([PLAYER, lead,
      wing('w1', { leader: 'lead-1', slot: 1 }), wing('w2', { leader: 'lead-1', slot: 2 }), wing('w3', { leader: 'lead-1', slot: 3 })]))).not.toThrow()
  })

  it('requires leader and slot together', () => {
    expect(() => parseScenario(raw([PLAYER, wing('w1', { leader: 'f6f-1' })]))).toThrow(/leader and slot go together/)
    expect(() => parseScenario(raw([PLAYER, wing('w1', { slot: 1 })]))).toThrow(/leader and slot go together/)
  })

  it('rejects a slot outside 1-3', () => {
    expect(() => parseScenario(raw([PLAYER, wing('w1', { leader: 'f6f-1', slot: 4 })]))).toThrow()
  })

  it('rejects leader with target or ingress', () => {
    const route = { route: [{ x: 0, z: -9000, altitudeM: 3000, speedMps: 120 }] }
    expect(() => parseScenario(raw([PLAYER, { ...wing('w1', { leader: 'f6f-1', slot: 1, target: 'b1' }) },
      { id: 'b1', spec: 'f6f-hellcat', airborneAt: at(5000) }]))).toThrow(/wingman goes where its leader goes/)
    expect(() => parseScenario(raw([PLAYER, wing('w1', { leader: 'f6f-1', slot: 1, ingress: route })]))).toThrow(/wingman goes where its leader goes/)
  })

  it('rejects a self-leading pilot, an unknown leader, a cross-side leader, a chain and a taken slot', () => {
    expect(() => parseScenario(raw([PLAYER, wing('w1', { leader: 'w1', slot: 1 })]))).toThrow(/cannot lead itself/)
    expect(() => parseScenario(raw([PLAYER, wing('w1', { leader: 'nobody', slot: 1 })]))).toThrow(/leader must name a starting aircraft/)
    expect(() => parseScenario(raw([PLAYER, { ...wing('w1', { leader: 'f6f-1', slot: 1 }), side: 'axis' }]))).toThrow(/leader must be on the same side/)
    expect(() => parseScenario(raw([PLAYER, wing('w1', { leader: 'f6f-1', slot: 1 }), wing('w2', { leader: 'w1', slot: 1 })]))).toThrow(/cannot itself be a wingman/)
    expect(() => parseScenario(raw([PLAYER, wing('w1', { leader: 'f6f-1', slot: 1 }), wing('w2', { leader: 'f6f-1', slot: 1 })]))).toThrow(/slot 1 of leader "f6f-1" is taken/)
  })

  it('lets a held wingman follow a starting leader or one in its own group, and nothing else', () => {
    const raider = (id: string, pilot: Record<string, unknown>) => ({ id, spec: 'f6f-hellcat', airborneAt: at(-20000), pilot: { skill: 'green', ...pilot } })
    const ok = scenario({ objectives: [REACH_FAR], heldGroups: [{ id: 'wave-1', aircraft: [raider('r1', {}), raider('r2', { leader: 'r1', slot: 1 })] }] })
    expect(() => parseScenario(ok)).not.toThrow()
    const other = scenario({ objectives: [REACH_FAR], heldGroups: [
      { id: 'wave-1', aircraft: [raider('r1', {})] }, { id: 'wave-2', aircraft: [raider('r2', { leader: 'r1', slot: 1 })] }] })
    expect(() => parseScenario(other)).toThrow(/held pilot's leader must be a starting aircraft or one in its own group/)
  })
})
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/sim/ai/formationSchema.test.ts --maxWorkers=2`
Expected: FAIL. `leader` is an unrecognized key under `.strict()`.

- [x] **Step 3: Add the runtime types**

In `src/sim/ai/pilot.ts`, after `IngressOrders`:

```ts
/** 7f spec §1-2: a wingman's station number in its leader's formation. */
export type FormationSlot = 1 | 2 | 3
/** 7f spec §1: a wingman's orders. The leader is a same-side aircraft,
 *  possibly the player, that is not itself a wingman (no chains). */
export type FormationOrders = { readonly leader: string; readonly slot: FormationSlot }
```

In `PilotDecisionState`, after `safety`:

```ts
  /** 7f spec §4: sim time until which a wingman flies trail cover, opened
   *  while its leader fires or engages. Absent (every non-wingman) means 0. */
  readonly coverUntilS?: number
```

In `src/sim/ai/pursuit.ts`, import `FormationOrders` alongside the existing type imports from `./pilot.js`, and add to `PilotAssignment` after `ingress`:

```ts
  /** 7f spec §1: a wingman's leader and slot. Excludes `target` and `ingress`. */
  readonly formation?: FormationOrders
```

- [x] **Step 4: Add the schema, the refines and the mapping**

In `src/sim/scenario.ts`, replace `PilotObject` with:

```ts
const PilotObject = z.object({
  /** A static target (7a/7b). Absent: the pilot chooses (7e spec §4.2). */
  target: id.optional(),
  skill: z.enum(['veteran', 'green']).default('green'),
  ingress: IngressObject.optional(),
  /** 7f spec §1: a same-side aircraft to fly formation on; the player may lead. */
  leader: id.optional(),
  slot: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
}).strict().refine((p) => p.target === undefined || p.ingress === undefined, {
  message: "ingress excludes target: a raider's target is chosen, never fixed", path: ['ingress'],
}).refine((p) => p.leader === undefined || (p.target === undefined && p.ingress === undefined), {
  message: 'leader excludes target and ingress: a wingman goes where its leader goes', path: ['leader'],
}).refine((p) => (p.leader === undefined) === (p.slot === undefined), {
  message: 'leader and slot go together', path: ['slot'],
})
```

In `pilotAssignmentFrom`, add the formation and the initial mode:

```ts
  const ingress = pilot.ingress === undefined ? {} : { ingress: ingressOrdersFrom(pilot.ingress, airfields) }
  const orders = pilot.leader === undefined || pilot.slot === undefined ? undefined : { leader: pilot.leader, slot: pilot.slot }
  const mode = orders !== undefined ? 'formation' : pilot.ingress === undefined ? 'engage' : 'ingress'
  return {
    target: pilot.target ?? null,
    ...ingress,
    ...(orders === undefined ? {} : { formation: orders }),
    skill: pilot.skill === 'veteran' ? VETERAN_SKILL : GREEN_SKILL,
    // (keep the existing comment)
    decision: initialDecision(id, mode),
  }
```

Add a leader checker above `ScenarioObject` and call it from both places:

```ts
type AnyAircraft = z.infer<typeof ScenarioAircraftObject>
/** 7f spec §1: every leader rule, reported by name. `visible` is what this
 *  list's pilots may name as leader; `path` locates each entry. */
function checkLeaders(
  s: z.infer<typeof ScenarioShape>, list: readonly (readonly [AnyAircraft, (string | number)[]])[],
  visible: ReadonlyMap<string, AnyAircraft>, unknownMessage: string,
  issue: (message: string, path: (string | number)[]) => void,
): void {
  const taken = new Set<string>()
  for (const [a, at] of list) {
    const leader = a.pilot?.leader
    if (leader === undefined) continue
    const path = [...at, 'pilot', 'leader']
    const named = visible.get(leader)
    if (leader === a.id) issue('a pilot cannot lead itself', path)
    else if (named === undefined) issue(unknownMessage, path)
    else if (sideOf(s, named) !== sideOf(s, a)) issue('pilot leader must be on the same side', path)
    else if (named.pilot?.leader !== undefined) issue(`leader "${leader}" cannot itself be a wingman: no chains`, path)
    const key = `${leader}#${a.pilot!.slot}`
    if (taken.has(key)) issue(`slot ${a.pilot!.slot} of leader "${leader}" is taken`, [...at, 'pilot', 'slot'])
    taken.add(key)
  }
}
```

In the first `superRefine` (after the ingress-destination loop), with `byId` already defined there:

```ts
    checkLeaders(s, s.aircraft.map((a, i) => [a, ['aircraft', i]] as const), byId,
      'pilot leader must name a starting aircraft',
      (message, path) => ctx.addIssue({ code: z.ZodIssueCode.custom, message, path }))
```

In `checkMission`'s held-group loop, after the `for (const [ai, a] ...)` loop and using that group's `visible` map:

```ts
    checkLeaders(s, (g.aircraft ?? []).map((a, ai) => [a, ['heldGroups', gi, 'aircraft', ai]] as const), visible,
      "a held pilot's leader must be a starting aircraft or one in its own group", issue)
```

Note: a slot taken by a starting wingman and again by a held wingman of the same starting leader is not caught, because each call keeps its own `taken` set. Accept this: no content does it, and the flight is still sane (two aircraft share a station, and collisions are not modeled).

- [x] **Step 5: Run the new tests, then the scenario and AI suites that parse content**

Run: `npx vitest run tests/sim/ai/formationSchema.test.ts tests/sim/scenario.test.ts tests/sim/ai/pilot.test.ts --maxWorkers=2; echo rc=$?`
Expected: all PASS, `rc=0`. If a message regex misses, fix the message in `scenario.ts`, not the test.

- [x] **Step 6: Commit**

```bash
git add src/sim/ai/pilot.ts src/sim/ai/pursuit.ts src/sim/scenario.ts tests/sim/ai/formationSchema.test.ts
git commit -m "7f Task 1: pilot.leader and pilot.slot, validated by name; FormationOrders"
```

---

### Task 2: Stations and the station-keeping law (pure)

**Files:**
- Create: `src/sim/ai/formation.ts`
- Test: `tests/sim/ai/formation.test.ts`

**Interfaces:**
- Consumes: `FormationSlot` (Task 1); `controlsForDesiredVelocity` (`controller.ts`); `AircraftEntity` (`loop.ts`).
- Produces:
  - `type Station = { readonly aftM: number; readonly rightM: number; readonly upM: number }`
  - `STATIONS: Readonly<Record<FormationSlot, Station>>`, `TRAIL_COVER: Station`
  - `stationPoint<M>(leader: AircraftEntity<M>, station: Station): Vec3`
  - `stationDesiredVelocity<M>(self: AircraftEntity<M>, leader: AircraftEntity<M>, station: Station): Vec3`
  - `formationThrottle<M>(self: AircraftEntity<M>, desired: Vec3): number`
  - `formationControls<M>(self: AircraftEntity<M>, leader: AircraftEntity<M>, slot: FormationSlot, cover: boolean): Controls`
  - `stationErrorM<M>(self: AircraftEntity<M>, leader: AircraftEntity<M>, slot: FormationSlot): number`
  - constants `CLOSURE_GAIN_PER_S`, `MAX_CLOSURE_MPS`, `MAX_FORMATION_VERTICAL_MPS`, `MIN_SPEED_STALL_FACTOR`, `FORMATION_THROTTLE_BASE`, `FORMATION_THROTTLE_GAIN`

- [x] **Step 1: Write the failing tests**

```ts
// tests/sim/ai/formation.test.ts
import { describe, expect, it } from 'vitest'
import { length, sub, v3 } from '../../../src/sim/math/vec3.js'
import { MAX_CLOSURE_MPS, MIN_SPEED_STALL_FACTOR, STATIONS, TRAIL_COVER, stationDesiredVelocity, stationErrorM, stationPoint } from '../../../src/sim/ai/formation.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { level } from './maneuverWorlds.js'

/** 7f spec §2-3: the geometry and the law, on static entities (no `advance`). */
const spec = loadAircraftSpec('f6f-hellcat')
const east = (x: number, z = 0, y = 3000, speed = 120) => level('x', spec, v3(x, y, z), v3(speed, 0, 0))

describe('stations in the leader heading frame (7f spec §2)', () => {
  it('puts slot 1 aft and right, slot 2 aft and left, heading east (+x; right is +z, south)', () => {
    const leader = east(0)
    expect(stationPoint(leader, STATIONS[1])).toEqual(v3(-80, 3000, 100))
    expect(stationPoint(leader, STATIONS[2])).toEqual(v3(-80, 3000, -100))
    expect(stationPoint(leader, TRAIL_COVER)).toEqual(v3(-500, 3200, 0))
  })

  it('ignores the leader climbing: the frame is the horizontal velocity', () => {
    const climbing = level('l', spec, v3(0, 3000, 0), v3(100, 60, 0))
    expect(stationPoint(climbing, STATIONS[1])).toEqual(v3(-80, 3000, 100))
  })

  it('falls back to the body forward with no horizontal velocity, and never returns NaN (Review Focus 2)', () => {
    const still = level('l', spec, v3(0, 3000, 0), v3(120, 0, 0))
    const hovering = { ...still, state: { ...still.state, velocity: v3(0, -3, 0) } }
    const p = stationPoint(hovering, STATIONS[1])
    expect([p.x, p.y, p.z].every(Number.isFinite)).toBe(true)
    expect(p).toEqual(v3(-80, 3000, 100))
  })
})

describe('the station-keeping law (7f spec §3)', () => {
  it('on station, asks for exactly the leader velocity', () => {
    const leader = east(0)
    const self = east(-80, 100)
    expect(stationDesiredVelocity(self, leader, STATIONS[1])).toEqual(v3(120, 0, 0))
    expect(stationErrorM(self, leader, 1)).toBe(0)
  })

  it('from 2 km astern, overtakes at no more than MAX_CLOSURE_MPS', () => {
    const d = stationDesiredVelocity(east(-2080, 100), east(0), STATIONS[1])
    expect(d.x - 120).toBeCloseTo(MAX_CLOSURE_MPS, 6)
    expect(Math.abs(d.z)).toBeLessThan(1e-9)
  })

  it('ahead of its station, never asks for less than MIN_SPEED_STALL_FACTOR x clean stall (Review Focus 1)', () => {
    const d = stationDesiredVelocity(east(2000, 100, 3000, 80), east(0, 0, 3000, 80), STATIONS[1])
    expect(length(d)).toBeGreaterThanOrEqual(MIN_SPEED_STALL_FACTOR * spec.reference.stallSpeedMps - 1e-9)
  })

  it('clamps the vertical correction', () => {
    const d = stationDesiredVelocity(east(-80, 100, 1000), east(0), STATIONS[1])
    expect(d.y).toBeLessThanOrEqual(10 + 1e-9)
    expect(length(sub(d, v3(120, 0, 0)))).toBeLessThanOrEqual(MAX_CLOSURE_MPS + 1e-9)
  })
})
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/sim/ai/formation.test.ts --maxWorkers=2`
Expected: FAIL, "Cannot find module .../formation.js".

- [x] **Step 3: Implement `formation.ts` (geometry and law only; Task 4 and 5 append to it)**

```ts
// src/sim/ai/formation.ts
import type { AircraftEntity } from '../loop.js'
import type { Controls } from '../flight/state.js'
import { qRotate } from '../math/quat.js'
import { add, length, scale, sub, v3, type Vec3 } from '../math/vec3.js'
import { controlsForDesiredVelocity } from './controller.js'
import type { FormationSlot } from './pilot.js'

/**
 * Formation flying (7f spec, 2026-09-27): stations in the leader's heading
 * frame, one station-keeping law that also rejoins, the wingman's engage
 * filter and the leader-lost handoff. Pure. Airframe-agnostic: the only
 * airframe figure read is `reference.stallSpeedMps`.
 */

/** A station, meters, in the leader's heading frame: behind, to the right
 *  (negative is left), above. */
export type Station = { readonly aftM: number; readonly rightM: number; readonly upM: number }

/** Loose cruise stations, a finger-four with the leader (spec §2). Tuning
 *  values. The data carries no chains: slot 2 leads its element only in
 *  the geometry. */
export const STATIONS: Readonly<Record<FormationSlot, Station>> = {
  1: { aftM: 80, rightM: 100, upM: 0 },
  2: { aftM: 80, rightM: -100, upM: 0 },
  3: { aftM: 160, rightM: -200, upM: 0 },
}
/** Trail cover while the leader fights (spec §4, from the 7c design §5). */
export const TRAIL_COVER: Station = { aftM: 500, rightM: 0, upM: 200 }

/** Desired closure per meter of station error, 1/s. Tuning value (Task 3 measures it). */
export const CLOSURE_GAIN_PER_S = 0.15
/** The closure the law may add to the leader's velocity (spec §3). */
export const MAX_CLOSURE_MPS = 40
/** The vertical part of the desired velocity is clamped to this, as ingress does. */
export const MAX_FORMATION_VERTICAL_MPS = 10
/** The desired speed never drops below this multiple of clean stall (Review Focus 1). */
export const MIN_SPEED_STALL_FACTOR = 1.3
/** throttle = base + gain x (desired speed - airspeed), like `ingressThrottle`. Tuning values (Task 3). */
export const FORMATION_THROTTLE_BASE = 0.7
export const FORMATION_THROTTLE_GAIN = 0.05

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

/** The leader's horizontal heading (unit x, z). Its body forward when it has
 *  (almost) no horizontal velocity, so a vertical leader never yields NaN. */
function headingOf<M>(leader: AircraftEntity<M>): { fx: number; fz: number } {
  const v = leader.state.velocity
  const h = Math.hypot(v.x, v.z)
  if (h > 1) return { fx: v.x / h, fz: v.z / h }
  const f = qRotate(leader.state.attitude, v3(1, 0, 0))
  const hf = Math.hypot(f.x, f.z)
  return hf > 1e-6 ? { fx: f.x / hf, fz: f.z / hf } : { fx: 1, fz: 0 }
}

/** Where `station` is now, in world meters. Right of the track is
 *  cross(track, up), as in `ingressOrbitControls`: (-fz, fx). */
export function stationPoint<M>(leader: AircraftEntity<M>, station: Station): Vec3 {
  const { fx, fz } = headingOf(leader)
  const p = leader.state.position
  return v3(p.x - station.aftM * fx - station.rightM * fz, p.y + station.upM, p.z - station.aftM * fz + station.rightM * fx)
}

/** The leader's velocity plus a clamped proportional pull toward the station
 *  (spec §3). The same law rejoins from far away. */
export function stationDesiredVelocity<M>(self: AircraftEntity<M>, leader: AircraftEntity<M>, station: Station): Vec3 {
  const err = sub(stationPoint(leader, station), self.state.position)
  let pull = scale(err, CLOSURE_GAIN_PER_S)
  const n = length(pull)
  if (n > MAX_CLOSURE_MPS) pull = scale(pull, MAX_CLOSURE_MPS / n)
  const lv = leader.state.velocity
  let desired = add(lv, v3(pull.x, clamp(pull.y, -MAX_FORMATION_VERTICAL_MPS - lv.y, MAX_FORMATION_VERTICAL_MPS - lv.y), pull.z))
  const minSpeed = MIN_SPEED_STALL_FACTOR * self.spec.reference.stallSpeedMps
  const speed = length(desired)
  if (speed < minSpeed) desired = speed > 1e-6 ? scale(desired, minSpeed / speed) : scale(headingVec(leader), minSpeed)
  return desired
}

const headingVec = <M>(leader: AircraftEntity<M>): Vec3 => {
  const { fx, fz } = headingOf(leader)
  return v3(fx, 0, fz)
}

export function formationThrottle<M>(self: AircraftEntity<M>, desired: Vec3): number {
  return clamp(FORMATION_THROTTLE_BASE + FORMATION_THROTTLE_GAIN * (length(desired) - length(self.state.velocity)), 0.2, 1)
}

/** The controls for one tick on station, or on trail cover (spec §3-4). */
export function formationControls<M>(self: AircraftEntity<M>, leader: AircraftEntity<M>, slot: FormationSlot, cover: boolean): Controls {
  const desired = stationDesiredVelocity(self, leader, cover ? TRAIL_COVER : STATIONS[slot])
  return { ...controlsForDesiredVelocity(self.state, self.spec, desired), throttle: formationThrottle(self, desired) }
}

/** Distance from this wingman to its own slot's station (tests, `__ww2`). */
export function stationErrorM<M>(self: AircraftEntity<M>, leader: AircraftEntity<M>, slot: FormationSlot): number {
  return length(sub(stationPoint(leader, STATIONS[slot]), self.state.position))
}
```

Check the "clamps the vertical correction" test against the code: the vertical clamp limits `lv.y + pull.y` to ±10 m/s. If a test expectation and the code disagree, the spec wins (§3: clamped like ingress). Fix whichever one departs from it.

- [x] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/sim/ai/formation.test.ts --maxWorkers=2; echo rc=$?`
Expected: PASS, `rc=0`.

- [x] **Step 5: Commit**

```bash
git add src/sim/ai/formation.ts tests/sim/ai/formation.test.ts
git commit -m "7f Task 2: stations in the leader heading frame and the one station-keeping law"
```

---

### Task 3: Wingmen fly formation in `pilotTick`

**Files:**
- Modify: `src/sim/ai/pilotTick.ts`
- Create: `tests/sim/ai/formationWorlds.ts`
- Test: `tests/sim/ai/formationFlight.test.ts`

**Interfaces:**
- Consumes: `formationControls`, `stationErrorM` (Task 2); `FormationOrders` (Task 1).
- Produces: `pilotTick` flies `mode: 'formation'`. `formationWorlds.ts` exports `buildFormation(aircraft: unknown[], extra?: Record<string, unknown>): World<undefined>`, `PLAYER_EAST`, `wingman(id, leader, slot, pos, side?)`, `rmsStationError(world, scripts, seconds, id, leaderId, slot, fromS)`. Later tasks import these.

- [x] **Step 1: Write the fixture module**

```ts
// tests/sim/ai/formationWorlds.ts
import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { aircraftById, type World } from '../../../src/sim/loop.js'
import { stationErrorM } from '../../../src/sim/ai/formation.js'
import type { FormationSlot } from '../../../src/sim/ai/pilot.js'
import { bundleForScenario } from '../../../tools/content/load.js'
import { runCanned, type ScriptedFlight } from './maneuverWorlds.js'

/**
 * 7f's Tier 1 worlds (spec, Acceptance): raw scenario JSON, parsed, so every
 * case also exercises the content path. Inline; nothing ships. The sea is
 * the ground (terrain null).
 */
export const PLAYER_EAST = { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 } }
export const PLAYER_FAR = { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [60000, 3000, 60000], headingDeg: 90, speedMps: 120 } }

export const wingman = (id: string, leader: string, slot: FormationSlot, position: readonly [number, number, number],
  side: 'allied' | 'axis' = 'allied', skill: 'green' | 'veteran' = 'veteran') =>
  ({ id, spec: 'f6f-hellcat', side, airborneAt: { position, headingDeg: 90, speedMps: 120 }, pilot: { skill, leader, slot } })

export function buildFormation(aircraft: unknown[], extra: Record<string, unknown> = {}): World<undefined> {
  return worldFromScenario(bundleForScenario(parseScenario({
    id: 'formation-test', player: 'f6f-1', airfields: ['tacloban'], aircraft, ships: [], weather: { windFromDeg: 0, windMps: 0 }, ...extra,
  })), null)
}

/** RMS of the wingman's station error over [fromS, seconds]. */
export function rmsStationError(world: World<undefined>, scripts: Readonly<Record<string, ScriptedFlight>>, seconds: number,
  id: string, leaderId: string, slot: FormationSlot, fromS: number): { rms: number; world: World<undefined> } {
  let sum = 0
  let n = 0
  let t = 0
  const end = runCanned(world, scripts, seconds, (w) => {
    t += 1 / 60
    if (t < fromS) return
    const e = stationErrorM(aircraftById(w, id)!, aircraftById(w, leaderId)!, slot)
    sum += e * e
    n++
  })
  return { rms: Math.sqrt(sum / Math.max(1, n)), world: end }
}
```

- [x] **Step 2: Write the failing flight tests**

```ts
// tests/sim/ai/formationFlight.test.ts
import { describe, expect, it } from 'vitest'
import { aircraftById } from '../../../src/sim/loop.js'
import { length } from '../../../src/sim/math/vec3.js'
import { stationErrorM } from '../../../src/sim/ai/formation.js'
import { holdHeight, levelTurn, runCanned } from './maneuverWorlds.js'
import { PLAYER_EAST, buildFormation, rmsStationError, wingman } from './formationWorlds.js'

/** 7f spec, Acceptance, Tier 1: station, turn, rejoin, ahead of station.
 *  The player is the leader, flown by script. */
const HOLD = { 'f6f-1': holdHeight(3000, null, 6, 120) }

describe('a wingman holds station on the player (7f spec §3)', () => {
  for (const slot of [1, 2, 3] as const) {
    it(`slot ${slot}: straight and level, RMS error under 25 m after 20 s`, () => {
      const w = buildFormation([PLAYER_EAST, wingman('wing-1', 'f6f-1', slot, [-300, 3000, 0])])
      expect(aircraftById(w, 'wing-1')!.pilot!.decision.mode).toBe('formation')
      const { rms, world } = rmsStationError(w, HOLD, 60, 'wing-1', 'f6f-1', slot, 20)
      expect(rms).toBeLessThan(25)
      expect(aircraftById(world, 'wing-1')!.pilot!.decision.mode).toBe('formation')
    })
  }

  it('through a sustained 30-degree-bank turn (n = 1.155), RMS under 60 m for slots 1 and 2', () => {
    for (const slot of [1, 2] as const) {
      const w = buildFormation([PLAYER_EAST, wingman('wing-1', 'f6f-1', slot, [-80, 3000, slot === 1 ? 100 : -100])])
      const settled = runCanned(w, HOLD, 20, () => {})
      const { rms } = rmsStationError(settled, { 'f6f-1': levelTurn(1.155, 1) }, 60, 'wing-1', 'f6f-1', slot, 0)
      expect(rms, `slot ${slot}`).toBeLessThan(60)
    }
  })

  it('rejoins from 2 km astern to within 50 m in under 90 s', () => {
    const w = buildFormation([PLAYER_EAST, wingman('wing-1', 'f6f-1', 1, [-2080, 3000, 100])])
    let joinedAt: number | null = null
    let t = 0
    runCanned(w, HOLD, 120, (x) => {
      t += 1 / 60
      if (joinedAt === null && stationErrorM(aircraftById(x, 'wing-1')!, aircraftById(x, 'f6f-1')!, 1) < 50) joinedAt = t
    })
    expect(joinedAt).not.toBeNull()
    expect(joinedAt!).toBeLessThan(90)
  })

  it('from 1.5 km ahead, drops back to station without falling below 1.2x clean stall (Review Focus 1)', () => {
    const w = buildFormation([PLAYER_EAST, wingman('wing-1', 'f6f-1', 1, [1500, 3000, 100])])
    let minSpeed = Infinity
    const end = runCanned(w, HOLD, 120, (x) => { minSpeed = Math.min(minSpeed, length(aircraftById(x, 'wing-1')!.state.velocity)) })
    const spec = aircraftById(end, 'wing-1')!.spec
    expect(minSpeed).toBeGreaterThan(1.2 * spec.reference.stallSpeedMps)
    expect(stationErrorM(aircraftById(end, 'wing-1')!, aircraftById(end, 'f6f-1')!, 1)).toBeLessThan(50)
  })
})
```

- [x] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/sim/ai/formationFlight.test.ts --maxWorkers=2`
Expected: FAIL. The wingman's first rescore sets its mode to `loiter` (no target, no ingress), so the mode assertion or the RMS fails.

- [x] **Step 4: Add the formation branch to `pilotTick`**

In `src/sim/ai/pilotTick.ts`, import `formationControls` from `./formation.js`. Then make three edits.

(a) Resolve the leader before the choice, right after `const view = ...`:

```ts
  // 7f spec §3: a wingman's leader, read from the start-of-tick snapshot.
  // A down or missing leader is Task 5's; until then it is simply absent.
  const leaderEntity = pilot.formation === undefined ? undefined : snapshot.find((c) => c.id === pilot.formation!.leader)
  const leader = leaderEntity !== undefined && !isAircraftDown(ctx.combat.aircraft, leaderEntity) ? leaderEntity : null
```

(b) Replace the `const mode = ...` line in the choice block:

```ts
    const mode = chosen !== null ? 'engage'
      : leader !== null && !leader.parked ? 'formation'
      : pilot.ingress !== undefined ? 'ingress' : 'loiter'
```

(c) After the safety-override block and before `if (target === null) {`, add:

```ts
  // 7f spec §3: on station, by the one law that also rejoins.
  if (target === null && decision.mode === 'formation' && leader !== null && !leader.parked) {
    const base = formationControls(a, leader, pilot.formation!.slot, (decision.coverUntilS ?? 0) > ctx.nowS)
    const { controls, cursor } = finishControls(a, base, pilot.skill.controlNoise, decision.noiseCursor, ctx.wind)
    return { ...a, pilot: { ...pilot, decision: { ...decision, safety: 'none', latch: null, noiseCursor: cursor } }, controls }
  }
```

Update the doc comment's numbered list: step 4 gains "or, for a wingman with no target, its station (7f)".

- [x] **Step 5: Run and tune against the spec's bounds**

Run: `npx vitest run tests/sim/ai/formationFlight.test.ts tests/sim/ai/formation.test.ts --maxWorkers=2; echo rc=$?`

If a bound fails, tune `CLOSURE_GAIN_PER_S` and `FORMATION_THROTTLE_*` in `formation.ts`, never the bound. Write a throwaway probe under `.superpowers/7f/` (gitignored) that prints RMS and join time per gain. Once all pass, update each constant's comment with the measured values and the date, e.g. `// Measured 2026-09-2x: slot 1 straight RMS 11 m, turn RMS 34 m, rejoin 52 s.` If no gain meets a bound after an honest sweep (at least 3 values per constant), stop and report the measured table. Do not loosen a bound unasked.

- [x] **Step 6: Run the AI suite files most likely to move**

Run: `npx vitest run tests/sim/ai/pilotTick.test.ts tests/sim/ai/sidesTick.test.ts tests/sim/ai/ingress.test.ts --maxWorkers=2; echo rc=$?`
Expected: PASS. No existing content has a wingman, so nothing else changes.

- [x] **Step 7: Commit**

```bash
git add src/sim/ai/pilotTick.ts src/sim/ai/formation.ts tests/sim/ai/formationWorlds.ts tests/sim/ai/formationFlight.test.ts
git commit -m "7f Task 3: wingmen hold station, turn and rejoin through pilotTick"
```

---

### Task 4: Cover: when a wingman fights

**Files:**
- Modify: `src/sim/ai/formation.ts` (append), `src/sim/ai/pilotTick.ts` (`chooseTarget`, cover latch)
- Test: `tests/sim/ai/formationCover.test.ts`

**Interfaces:**
- Consumes: `hasGunSolution` (`pursuit.ts`), `RECENT_HIT_S` (`ingress.ts`), `AircraftCombat` (`weapons/combat.ts`), `DT` (`flight/model.ts`).
- Produces: `COVER_RANGE_M`, `COVER_RELEASE_RANGE_M`, `COVER_LATCH_S`; `wingmanAccepts<M>(self, leader, record: AircraftCombat, current: string | null, nowS: number): (c: AircraftEntity<M>, rangeM: number) => boolean`; `leaderIsFighting<M>(leader): boolean`.

- [x] **Step 1: Write the failing tests**

```ts
// tests/sim/ai/formationCover.test.ts
import { describe, expect, it } from 'vitest'
import { aircraftById, type World } from '../../../src/sim/loop.js'
import { length, sub } from '../../../src/sim/math/vec3.js'
import { stationErrorM, stationPoint, TRAIL_COVER } from '../../../src/sim/ai/formation.js'
import { chase, holdHeight, runCanned, straight } from './maneuverWorlds.js'
import { PLAYER_EAST, PLAYER_FAR, buildFormation, wingman } from './formationWorlds.js'

/** 7f spec §4: the cover trigger reads the threat to the leader, not its mode. */
const ROUTE = [{ x: 60000, z: 0, altitudeM: 3000, speedMps: 110 }]
/** An axis raider pair on ingress east: the escort case, a fighter standing in for a bomber. */
const LEAD = { id: 'lead-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 110 }, pilot: { skill: 'green', ingress: { route: ROUTE } } }
const WING = wingman('wing-1', 'lead-1', 1, [-80, 3000, 100], 'axis', 'veteran')
const range = (w: World<undefined>, a: string, b: string) => length(sub(aircraftById(w, a)!.state.position, aircraftById(w, b)!.state.position))

describe('escort: a leader that never engages is still covered (7f spec §4)', () => {
  it('holds station until the attacker is within cover range, then targets it within one reactionS, closes, and hits it', () => {
    // The player attacks the raider leader from 5 km astern at full chase.
    const attacker = { ...PLAYER_EAST, airborneAt: { position: [-5000, 3000, 0], headingDeg: 90, speedMps: 150 } }
    let w = buildFormation([attacker, LEAD, WING])
    let enteredAt: number | null = null
    let targetedAt: number | null = null
    let minRange = Infinity
    let t = 0
    w = runCanned(w, { 'f6f-1': chase('lead-1') }, 120, (x) => {
      t += 1 / 60
      const d = aircraftById(x, 'wing-1')!.pilot!.decision
      if (enteredAt === null && range(x, 'f6f-1', 'lead-1') <= 3000) enteredAt = t
      if (enteredAt === null) expect(d.mode, `t=${t.toFixed(2)}`).toBe('formation')
      if (targetedAt === null && d.targetId === 'f6f-1') targetedAt = t
      if (targetedAt !== null) minRange = Math.min(minRange, range(x, 'wing-1', 'f6f-1'))
    })
    expect(enteredAt).not.toBeNull()
    expect(targetedAt).not.toBeNull()
    expect(targetedAt! - enteredAt!).toBeLessThanOrEqual(0.3 + 1 / 60)
    expect(minRange).toBeLessThan(600)
    expect(w.combat.aircraft['f6f-1']!.lastHitBy).toBe('wing-1')
  })

  it('does not leave station for hostiles 6 km off (Review Focus 3)', () => {
    const far = { id: 'b-far', spec: 'f6f-hellcat', side: 'allied', airborneAt: { position: [0, 3000, 6000], headingDeg: 90, speedMps: 110 } }
    const w = buildFormation([PLAYER_FAR, LEAD, WING, far])
    runCanned(w, { 'b-far': straight }, 30, (x) => {
      expect(aircraftById(x, 'wing-1')!.pilot!.decision.targetId).toBeNull()
    })
  })
})

describe('the sandwich (7f spec §4)', () => {
  it('picks the hostile on the leader tail over the leader own target', () => {
    const lead = { id: 'lead-1', spec: 'f6f-hellcat', side: 'allied', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 }, pilot: { skill: 'veteran', target: 'bandit-a' } }
    const wing = wingman('wing-1', 'lead-1', 1, [-80, 3000, 100], 'allied', 'veteran')
    const a = { id: 'bandit-a', spec: 'f6f-hellcat', airborneAt: { position: [400, 3000, 0], headingDeg: 90, speedMps: 120 } }
    const b = { id: 'bandit-b', spec: 'f6f-hellcat', airborneAt: { position: [-300, 3000, 0], headingDeg: 90, speedMps: 130 } }
    const w = buildFormation([PLAYER_FAR, lead, wing, a, b])
    const end = runCanned(w, { 'bandit-a': straight, 'bandit-b': chase('lead-1') }, 1, () => {})
    expect(aircraftById(end, 'wing-1')!.pilot!.decision.targetId).toBe('bandit-b')
  })
})

describe('the player leads: fire opens trail cover (7f spec §4)', () => {
  it('moves to trail cover while the player fires with nothing near, and back to slot 1 after', () => {
    const w = buildFormation([PLAYER_EAST, wingman('wing-1', 'f6f-1', 1, [-80, 3000, 100])])
    const hold = holdHeight(3000, null, 6, 120)
    const firing = runCanned(w, { 'f6f-1': (s, x) => ({ ...hold(s, x), fire: true }) }, 30, () => {})
    const me = aircraftById(firing, 'wing-1')!
    expect(me.pilot!.decision.coverUntilS!).toBeGreaterThan(firing.tick / 60)
    expect(length(sub(stationPoint(aircraftById(firing, 'f6f-1')!, TRAIL_COVER), me.state.position))).toBeLessThan(100)
    const after = runCanned(firing, { 'f6f-1': hold }, 60, () => {})
    expect(stationErrorM(aircraftById(after, 'wing-1')!, aircraftById(after, 'f6f-1')!, 1)).toBeLessThan(50)
  })
})
```

Note on the escort's last assertion: AI gunnery against a target that is not flying straight is weak today (furball ruling R-F1; the gunnery-honesty slice is not 7f). The attacker here is chasing straight, which is the geometry today's AI can hit. If every other assertion passes and `lastHitBy` is still not `'wing-1'` after 120 s, **do not tune AI gunnery.** Record the closest range and the shots fired, and stop and report. Mark decides whether the spec's "takes hits" becomes "fires within gun solution".

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/sim/ai/formationCover.test.ts --maxWorkers=2`
Expected: FAIL. With no filter, the wingman takes the 6 km contact, and nothing opens the cover latch.

- [x] **Step 3: Append the cover rule to `formation.ts`**

The four `import` lines go into the file's top import block, merged with the existing ones. The rest is appended.

```ts
import { DT } from '../flight/model.js'
import type { AircraftCombat } from '../weapons/combat.js'
import { RECENT_HIT_S } from './ingress.js'
import { hasGunSolution } from './pursuit.js'

/** A hostile this close to the leader or the wingman is engaged (spec §4).
 *  The same scale as INGRESS_ENGAGE_RANGE_M; tuning value. */
export const COVER_RANGE_M = 3000
/** The current target stays eligible out to here, as ingress does. */
export const COVER_RELEASE_RANGE_M = 1.5 * COVER_RANGE_M
/** How long trail cover holds after the leader last fired or engaged (spec §4). */
export const COVER_LATCH_S = 5

/** The player fires (`controls.fire`), or an AI leader is engaging. */
export function leaderIsFighting<M>(leader: AircraftEntity<M>): boolean {
  return leader.controls.fire === true || leader.pilot?.decision.mode === 'engage'
}

/**
 * The wingman's engage rule, as `selectTarget`'s `accept` (spec §4): a threat
 * to the leader or to me (gun cone, or within COVER_RANGE_M of either), a
 * recent hitter, or the leader's own target. Everything else in detection
 * range is left alone, so an escort stays with its bomber.
 */
export function wingmanAccepts<M>(
  self: AircraftEntity<M>, leader: AircraftEntity<M>, record: AircraftCombat, current: string | null, nowS: number,
): (contact: AircraftEntity<M>, rangeM: number) => boolean {
  return (c, rangeM) => {
    if (c.id === current && rangeM <= COVER_RELEASE_RANGE_M) return true
    if (rangeM <= COVER_RANGE_M || length(sub(c.state.position, leader.state.position)) <= COVER_RANGE_M) return true
    if (hasGunSolution(c, self) || hasGunSolution(c, leader)) return true
    if (leader.pilot?.decision.targetId === c.id) return true
    return record.lastHitBy === c.id && record.lastHit !== null && nowS - record.lastHit.tick * DT <= RECENT_HIT_S
  }
}
```

Check `formation.ts` → `ingress.ts` → `pursuit.ts` for an import cycle with `npx depcruise src --config .dependency-cruiser.cjs` in Step 5. `ingress.ts` does not import `formation.ts`, so there should be none.

- [x] **Step 4: Wire the rule and the latch into `pilotTick`**

Give `chooseTarget` a `leader` parameter and use the filter:

```ts
function chooseTarget<M>(
  a: AircraftEntity<M>, pilot: PilotAssignment, current: string | null, view: TargetingView<M>, nowS: number,
  leader: AircraftEntity<M> | null,
): string | null {
  if (pilot.target !== null) { /* unchanged */ }
  // 7f spec §4: a wingman fights what threatens its leader or itself, and
  // passes the leader so 7e's LEADER_THREAT_BONUS_M applies.
  if (leader !== null) {
    return selectTarget(a, view, { current, leaderId: leader.id, accept: wingmanAccepts(a, leader, view.combat[a.id]!, current, nowS) })
  }
  /* the ingress / free cases, unchanged */
}
```

Pass `leader` at the call site. Right after `let decision = pilot.decision`, open the latch:

```ts
  // 7f spec §4: trail cover holds COVER_LATCH_S past the leader's last shot or engagement.
  if (leader !== null && leaderIsFighting(leader)) decision = { ...decision, coverUntilS: ctx.nowS + COVER_LATCH_S }
```

- [x] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/sim/ai/formationCover.test.ts tests/sim/ai/formationFlight.test.ts tests/sim/ai/targeting.test.ts --maxWorkers=2; echo rc=$?; npx depcruise src --config .dependency-cruiser.cjs; echo depcruise rc=$?`
Expected: PASS, both `rc=0` (subject to the escort-hits note above).

- [x] **Step 6: Commit**

```bash
git add src/sim/ai/formation.ts src/sim/ai/pilotTick.ts tests/sim/ai/formationCover.test.ts
git commit -m "7f Task 4: cover triggers on a threat to the leader; escort, sandwich, trail cover"
```

---

### Task 5: Leader lost, and a parked leader

**Files:**
- Modify: `src/sim/ai/formation.ts` (append), `src/sim/ai/pilotTick.ts`
- Test: `tests/sim/ai/formationLeader.test.ts`

**Interfaces:**
- Produces: `leaderlessPilot<M>(pilot: PilotAssignment, leader: AircraftEntity<M> | undefined, nowS: number): PilotAssignment`.

- [x] **Step 1: Write the failing tests**

```ts
// tests/sim/ai/formationLeader.test.ts
import { describe, expect, it } from 'vitest'
import { aircraftById, type World } from '../../../src/sim/loop.js'
import { length, sub } from '../../../src/sim/math/vec3.js'
import { PURSUIT_FLOOR_M } from '../../../src/sim/ai/safety.js'
import { chase, runCanned } from './maneuverWorlds.js'
import { PLAYER_EAST, PLAYER_FAR, buildFormation, wingman } from './formationWorlds.js'

/** 7f spec §4: leader lost; parked leader. */
const ROUTE = [
  { x: 20000, z: 0, altitudeM: 3000, speedMps: 120 },
  { x: 20000, z: 20000, altitudeM: 3200, speedMps: 120 },
  { x: 40000, z: 20000, altitudeM: 3000, speedMps: 120 },
]
const LEAD = { id: 'lead-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 }, pilot: { skill: 'green', ingress: { route: ROUTE } } }
const WING = wingman('wing-1', 'lead-1', 1, [-80, 3000, 100], 'axis', 'green')

/** Down the leader now, as a kill would (destroyedAt is a tick). */
function destroy(w: World<undefined>, id: string): World<undefined> {
  const rec = w.combat.aircraft[id]!
  return { ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, [id]: { ...rec, damage: { ...rec.damage, destroyedAt: w.tick } } } } }
}

describe('leader lost (7f spec §4)', () => {
  it('a raider wingman takes on the route at the leader legIndex and finishes it', () => {
    let w = buildFormation([PLAYER_FAR, LEAD, WING])
    w = runCanned(w, {}, 200, () => {}) // past the first waypoint
    const leg = aircraftById(w, 'lead-1')!.pilot!.decision.legIndex
    expect(leg).toBeGreaterThanOrEqual(1)
    w = destroy(w, 'lead-1')
    w = runCanned(w, {}, 1, () => {})
    const p = aircraftById(w, 'wing-1')!.pilot!
    expect(p.formation).toBeUndefined()
    expect(p.ingress?.route).toEqual(ROUTE)
    expect(p.decision.legIndex).toBeGreaterThanOrEqual(leg)
    w = runCanned(w, {}, 400, () => {})
    expect(aircraftById(w, 'wing-1')!.pilot!.decision.legIndex).toBe(ROUTE.length + 1)
  })

  it('a wingman whose leader dies mid-fight keeps fighting, then flies on sane (Review Focus 5)', () => {
    const attacker = { ...PLAYER_EAST, airborneAt: { position: [-1500, 3000, 0], headingDeg: 90, speedMps: 150 } }
    let w = buildFormation([attacker, LEAD, WING])
    w = runCanned(w, { 'f6f-1': chase('lead-1') }, 10, () => {})
    expect(aircraftById(w, 'wing-1')!.pilot!.decision.targetId).toBe('f6f-1')
    w = destroy(w, 'lead-1')
    let minY = Infinity
    w = runCanned(w, { 'f6f-1': chase('wing-1') }, 60, (x) => {
      const s = aircraftById(x, 'wing-1')!.state
      expect([s.position.x, s.position.y, s.position.z].every(Number.isFinite)).toBe(true)
      minY = Math.min(minY, s.position.y)
      expect(x.combat.aircraft['wing-1']!.stress.loadFactorG).toBeLessThanOrEqual(aircraftById(x, 'wing-1')!.spec.limits.gLimit)
    })
    expect(minY).toBeGreaterThan(PURSUIT_FLOOR_M)
    expect(aircraftById(w, 'wing-1')!.pilot!.formation).toBeUndefined()
  })
})

describe('a parked leader (7f spec §4)', () => {
  it('the wingman loiters while the player is parked on the deck (the CAP launch case)', () => {
    // A deck park works with terrain null (tests/sim/mission/objectives.test.ts does the same).
    const parked = { id: 'f6f-1', spec: 'f6f-hellcat', parkedAt: { ship: 'cv-1', spot: { x: 0, z: -110 } }, chocked: true }
    const cv = { id: 'cv-1', spec: 'essex-cv', side: 'allied', waypoints: [[0, 0]], speedMps: 0 }
    const w = buildFormation([parked, wingman('wing-1', 'f6f-1', 1, [0, 2000, -3000])], { ships: [cv] })
    const end = runCanned(w, {}, 20, (x) => {
      expect(aircraftById(x, 'wing-1')!.pilot!.decision.mode).toBe('loiter')
    })
    expect(length(sub(aircraftById(end, 'wing-1')!.state.position, aircraftById(w, 'wing-1')!.state.position))).toBeGreaterThan(0)
  })
})
```

The parked case covers "loiters while parked". "Joins once airborne" is covered by the mode rule (`!leader.parked`, Task 3) plus Task 3's rejoin test. A take-off script here would be a second test of 11a's ground physics.

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/sim/ai/formationLeader.test.ts --maxWorkers=2`
Expected: FAIL. The wingman keeps `formation` and never takes on the route.

- [x] **Step 3: Append `leaderlessPilot` to `formation.ts`**

The `import type` line goes into the top import block.

```ts
import type { PilotAssignment } from './pursuit.js'

/**
 * A wingman whose leader is down or gone flies on alone (spec §4). It takes
 * on the leader's ingress orders, if any, at the leader's legIndex, so a
 * raider pair that loses its leader still reaches the carrier. A choice is
 * forced this tick (`nextRescoreS = nowS`).
 */
export function leaderlessPilot<M>(pilot: PilotAssignment, leader: AircraftEntity<M> | undefined, nowS: number): PilotAssignment {
  const decision = { ...pilot.decision, nextRescoreS: nowS }
  const orders = leader?.pilot?.ingress
  const alone: PilotAssignment = { target: pilot.target, skill: pilot.skill, decision }
  return orders === undefined ? alone : { ...alone, ingress: orders, decision: { ...decision, legIndex: leader!.pilot!.decision.legIndex } }
}
```

- [x] **Step 4: Use it at the top of `pilotTick`**

Change `const pilot = a.pilot` to `let pilot = a.pilot`. Replace Task 3's leader resolution (a) with:

```ts
  // 7f spec §3-4: a wingman's leader, from the start-of-tick snapshot. A
  // down or missing leader hands the wingman its own orders (spec §4).
  let leader: AircraftEntity<M> | null = null
  if (pilot.formation !== undefined) {
    const l = snapshot.find((c) => c.id === pilot!.formation!.leader)
    if (l === undefined || isAircraftDown(ctx.combat.aircraft, l)) pilot = leaderlessPilot(pilot, l, ctx.nowS)
    else leader = l
  }
```

It must run before `let decision: PilotDecisionState = pilot.decision`, so the forced rescore is read. Type narrowing: after the early `return a`, TypeScript keeps `pilot` as `PilotAssignment` through the reassignment. If it widens, annotate `let pilot: PilotAssignment = a.pilot` after the guard.

- [x] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/sim/ai/formationLeader.test.ts tests/sim/ai/formationCover.test.ts tests/sim/ai/formationFlight.test.ts --maxWorkers=2; echo rc=$?`
Expected: PASS, `rc=0`.

- [x] **Step 6: Commit**

```bash
git add src/sim/ai/formation.ts src/sim/ai/pilotTick.ts tests/sim/ai/formationLeader.test.ts
git commit -m "7f Task 5: a wingman whose leader is lost takes on its route; a parked leader means loiter"
```

---

### Task 6: Following an ingress leader; determinism, order, clone and safety soak

**Files:**
- Test: `tests/sim/ai/formationSoak.test.ts`

**Interfaces:**
- Consumes: the Task 3 fixtures. No production change is expected. If one is needed, it belongs to the task whose behavior it fixes; amend that commit's area and say so in this commit's message.

- [x] **Step 1: Write the tests**

```ts
// tests/sim/ai/formationSoak.test.ts
import { describe, expect, it } from 'vitest'
import { advance, aircraftById, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { stationErrorM } from '../../../src/sim/ai/formation.js'
import { PURSUIT_FLOOR_M } from '../../../src/sim/ai/safety.js'
import { PLAYER_FAR, buildFormation, wingman } from './formationWorlds.js'

/** 7f spec, Acceptance: an ingress pair and a flight of four, 300 s, through
 *  production `advance`, plus the 7c-7g §7 invariants. */
const ROUTE = [
  { x: 20000, z: 0, altitudeM: 3000, speedMps: 120 },
  { x: 20000, z: 20000, altitudeM: 3500, speedMps: 130 },
  { x: 40000, z: 20000, altitudeM: 3000, speedMps: 120 },
]
const LEAD = { id: 'lead-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 }, pilot: { skill: 'green', ingress: { route: ROUTE } } }
const FLIGHT = [LEAD,
  wingman('w1', 'lead-1', 1, [-80, 3000, 100], 'axis', 'green'),
  wingman('w2', 'lead-1', 2, [-80, 3000, -100], 'axis', 'green'),
  wingman('w3', 'lead-1', 3, [-160, 3000, -200], 'axis', 'green')]
const steps = (w: World<undefined>, n: number) => { for (let i = 0; i < n; i++) w = advance(w, DT).world; return w }

describe('a flight of four follows an ingress leader (7f spec §3)', () => {
  it('reaches the last leg with every wingman within 150 m of station on each leg end, no floor or G violation, no NaN', () => {
    let w = buildFormation([PLAYER_FAR, ...FLIGHT])
    let lastLeg = 0
    for (let i = 0; i < 360 * 60; i++) {
      w = advance(w, DT).world
      const leg = aircraftById(w, 'lead-1')!.pilot!.decision.legIndex
      for (const id of ['w1', 'w2', 'w3']) {
        const a = aircraftById(w, id)!
        const s = a.state
        expect([s.position.x, s.position.y, s.position.z].every(Number.isFinite)).toBe(true)
        expect(s.position.y).toBeGreaterThan(PURSUIT_FLOOR_M)
        expect(w.combat.aircraft[id]!.stress.loadFactorG).toBeLessThanOrEqual(a.spec.limits.gLimit)
        if (leg !== lastLeg) expect(stationErrorM(a, aircraftById(w, 'lead-1')!, a.pilot!.formation!.slot), `${id} at leg ${lastLeg}`).toBeLessThan(150)
      }
      lastLeg = leg
    }
    expect(lastLeg).toBe(ROUTE.length)
  })

  it('is bit-identical across runs, and with the aircraft array reversed (Review Focus 4)', () => {
    const a = steps(buildFormation([PLAYER_FAR, ...FLIGHT]), 60 * 60)
    const b = steps(buildFormation([PLAYER_FAR, ...FLIGHT]), 60 * 60)
    expect(b.aircraft).toEqual(a.aircraft)
    const r = steps(buildFormation([PLAYER_FAR, ...[...FLIGHT].reverse()]), 60 * 60)
    for (const id of ['lead-1', 'w1', 'w2', 'w3']) expect(aircraftById(r, id)!.state).toEqual(aircraftById(a, id)!.state)
  })

  it('a structuredClone taken mid-flight flies on identically', () => {
    const mid = steps(buildFormation([PLAYER_FAR, ...FLIGHT]), 90 * 60)
    expect(steps(structuredClone(mid), 600)).toEqual(steps(mid, 600))
  })
})
```

`lastLeg` ends at `ROUTE.length`, meaning heading for the destination. With no destination, `nextLegIndex` jumps to `n + 1` at the last waypoint. If the leader reaches the orbit (`n + 1`) inside 360 s, assert `toBeGreaterThanOrEqual(ROUTE.length)` instead. Measure first; write down which one it was.

- [x] **Step 2: Run**

Run: `npx vitest run tests/sim/ai/formationSoak.test.ts --maxWorkers=2; echo rc=$?`
Expected: PASS. If the 150 m bound at a leg end fails, the cause is the turn at a waypoint. Tune it in `formation.ts` as in Task 3 Step 5, re-run Task 3's tests, and record the measurement.

- [x] **Step 3: Commit**

```bash
git add tests/sim/ai/formationSoak.test.ts
git commit -m "7f Task 6: a flight of four follows an ingress leader; determinism, order, clone, safety"
```

---

### Task 7: `furball-range`: `ally-1` becomes the player's wingman

**Files:**
- Modify: `content/scenarios/furball-range.json`
- Test: `tests/sim/ai/furball.test.ts` (unchanged; must stay green), `tests/sim/ai/formationSchema.test.ts` (add one case)

- [x] **Step 1: Add a content assertion to `formationSchema.test.ts`**

```ts
import { loadScenarioBundle } from '../../../tools/content/load.js'

it('furball-range: ally-1 flies as the player wingman (7f spec, Acceptance)', () => {
  const w = worldFromScenario(loadScenarioBundle('furball-range'), null)
  expect(aircraftById(w, 'ally-1')!.pilot!.formation).toEqual({ leader: 'f6f-1', slot: 1 })
})
```

Run it and expect FAIL.

- [x] **Step 2: Edit the content**

In `content/scenarios/furball-range.json`, change `ally-1`'s pilot from `{"skill": "veteran"}` to `{"skill": "veteran", "leader": "f6f-1", "slot": 1}`. Change nothing else.

- [x] **Step 3: Run the furball soak and the schema tests**

Run: `npx vitest run tests/sim/ai/furball.test.ts tests/sim/ai/formationSchema.test.ts --maxWorkers=2; echo rc=$?`

Expected: PASS, including "the wingman kills bandit-2 in every loadout" (furball ruling R-F1). `bandit-2` starts 280 m ahead of `ally-1` and within 3 km of the player, so the cover filter accepts it and its score still wins.

**If that kill moves** (a different victim, a different killer, or none), stop. Do not change the scenario's geometry or the test. That kill is a recorded ruling (R-F1) and the Tier 2 `furball.spec.ts` asserts it too. Revert the content edit, commit the tests without it, and report the measured outcome per loadout to Mark in the handoff (Task 8).

- [x] **Step 4: Commit**

```bash
git add content/scenarios/furball-range.json tests/sim/ai/formationSchema.test.ts
git commit -m "7f Task 7: furball-range's ally-1 flies as the player's wingman"
```

---

### Task 8: Full verify on ryzen, docs, handoff

**Files:**
- Create: `docs/handoff/2026-09-2x-plan7f-formation.md` (the real date)
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§15, Plan 7 row only: "7f ... not started" → complete, with plan/spec/handoff links)
- Modify: this plan's checkboxes (tick as each task lands, in that task's commit)

- [ ] **Step 1: Full verify through ryzen**

Run: `remote-run npm run verify; echo rc=$?`
Expected: `rc=0`. On failure, fix it in the task that owns the failing behavior. Never judge the run by grepping its output.

- [ ] **Step 2: Write the handoff**

Follow the house form in `docs/handoff/2026-09-26-plan7e-sides.md`: what shipped (per task, with commit ids), every tuning constant with its measured value and date, the escort-hits outcome from Task 4, the furball outcome from Task 7, and **Open for Mark**:
- Tier 2 (Task 9) waits on the sortie forms;
- mission content follow-ups: CAP raider pairs, and a player wingman in CAP;
- wingman commands are still unbuilt (7c-7g design, Open item 5).

- [ ] **Step 3: Update the §15 row**

In the Plan 7 row, replace `7f (formation), 7g (landing AI) not started` with a 7f clause in the same style as 7e's: what landed, "Tier 1 only; Tier 2 waits on the sortie forms", and links to the [spec](2026-09-27-ai-7f-formation-design.md), plan and handoff. Keep `7g (landing AI) not started`.

Also update README's paragraph for the AI plans. It points at §15 and does not restate the order (repo `CLAUDE.md`, Conventions).

- [ ] **Step 4: Commit, push the branch, email the handoff**

```bash
git add docs/ README.md
git commit -m "7f Task 8: handoff, §15 row, README"
git push -u origin worktree-ai-7f-formation
python3 tools/mail-doc.py docs/handoff/<file>.md "ww2airsim: Plan 7f handoff"
```

Merging into `main` is Mark's call. Before merging, run `git log origin/main..main` and re-run the touched suites on the merged tree (the sortie-forms session commits to `main` too).

---

### Task 9 (blocked until the sortie forms land on `main`): Tier 2 on the reference GPU

**Precondition:** `git log main --oneline | grep -i 'sortie'` shows the forms implementation merged, not just its spec, and `titleScreen.ts` carries per-option `dev` flags. Until then, leave this task unchecked. 7f may merge without it.

**Files:**
- Create: `content/scenarios/dev-formation.json`, `tests/e2e/formation.spec.ts`
- Modify: the scenario option table (wherever the sortie forms put it, `dev: true`); `src/render/main.ts`, the `aircraft()` diagnostic only

- [ ] **Step 1: The fixture.** Model it on `furball-range.json`: the player airborne at 3,000 m heading east at 120 m/s, and one allied veteran `wing-1` with `leader: "f6f-1", slot: 1`, starting 300 m behind. No hostiles. Register it as a Dev-only option (`dev: true`) in the sortie forms' option table.

- [ ] **Step 2: The diagnostic.** In `src/render/main.ts`'s `aircraft()`, add two fields after `targetId`:

```ts
            // Plan 7f: the leader, and this wingman's distance from its station.
            leader: a.pilot?.formation?.leader ?? null,
            stationErrorM: (() => {
              const f = a.pilot?.formation
              const l = f === undefined ? undefined : frame!.world.aircraft.find((x) => x.id === f.leader)
              return f === undefined || l === undefined ? null : stationErrorM(a, l, f.slot)
            })(),
```

Import `stationErrorM` from `../sim/ai/formation.js`. Run `git diff main -- src/render/main.ts` right before committing. Only these lines may differ.

- [ ] **Step 3: The spec.** Model `tests/e2e/formation.spec.ts` on `tests/e2e/furball.spec.ts`: launch `dev-formation` the way the sortie forms' URL quick launch (A6) documents, fly hands-off 40 s in the chase view, and assert that `__ww2.aircraft()`'s `wing-1` has `mode === 'formation'` and `stationErrorM < 50`. Also assert zero WebGPU validation errors, and take a screenshot. Read the screenshot yourself: the wingman should be visible to the player's right and aft.

- [ ] **Step 4: Run on the reference GPU** from a free dev-server slot (`ww2airsim-2`/`-3`, see `CLAUDE.md`), never overlapping another session's budget measurement. Run at 1440p. Expected: PASS.

- [ ] **Step 5: Commit, then update the handoff and the §15 row** ("Tier 2 green").
