# AI 7e: sides, target selection, the ingress pilot and many-vs-many, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Viewing checkpoints (Mark, 2026-09-26):** final product only.
**Attended:** no, unattended. Open questions get a sensible default, recorded as a dated ruling here and in the ledger; the run stops only for a question that would materially change the approved design.
**Execution:** native (the writer executes), then one fresh whole-branch reviewer.

**Goal:** Give every aircraft a side, let an AI pilot choose (and re-choose) its own opposite-side target, stop the AI shooting through friendlies and stop teamkills from scoring, add the ingress pilot that the missions spec's Combat Air Patrol (M4) needs, and ship a `furball-range` development scenario in which AI fights AI to real kills.

**Architecture:**
- A side is content (`"side": "allied" | "axis"`, optional) read through one function, `sideOf(world, entity)` in a new `src/sim/sides.ts`. Absent, the player is `allied` and everything else `axis`, which reproduces every shipped scenario.
- `advance` computes the side table once per tick and hands the same table to the pilots (`PilotTickContext.sides`) and to kill credit (`stepCombat`, `creditDownedAircraft`). Those are the only `loop.ts` edits.
- Target choice is a pure scorer over the start-of-tick snapshot (`src/sim/ai/targeting.ts`). `pilotTick` runs it at rescore, re-checks the target's validity every tick, and flies loiter or the ingress route when there is no target. The ingress route is `src/sim/ai/ingress.ts`; the hold-fire gate is `src/sim/ai/holdFire.ts`.
- Nothing new names an airframe, draws a random number, or depends on array order.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`), zod, vitest, `tsx` for scratch probes, Playwright for Tier 2. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-25-ai-7c-design.md` §4 (Plan 7e, including §4.5 the ingress pilot and §4.7 acceptance), §7 (cross-cutting constraints) and §8 (file ownership). Also read: master spec §15; `docs/superpowers/specs/2026-09-25-missions-design.md` §1 ("Held groups enter mid-flight"), §2.1 (`deny`), §5 item 4 (Combat Air Patrol) and §8; `docs/handoff/2026-09-26-ai-7c.md` §7 open item 4 and §8 "For 7e".

**Where:** worktree `/home/mark/projects/ww2airsim/.claude/worktrees/ai-7e`, branch `worktree-ai-7e`, cut from `main` at `242c35e`. The branch may be pushed; `main` is never merged into, pushed or deployed (Mark's call).

## Global Constraints

- **Resource rules.** On nexus run only named test files: `npx vitest run <files> --maxWorkers=2`. Full suites and `npm run verify` go through `remote-run npm run verify` (ryzen, serialized). Capture `rc=$?` directly; never gate on a grepped pipeline. No `npm install`, no `git clean -fdx`.
- `src/sim/` never imports `render/`, `input/`, `assists/`, `audio/`, Node core or a rendering library. `src/sim/sides.ts` imports nothing, so `weapons/` and `ai/` can both read it without a cycle.
- **No AI code names an airframe** (spec §7). `tests/sim/ai/envelope.test.ts`'s content-id scan covers every new file under `src/sim/ai/`.
- **Determinism.** The only randomness is the per-pilot `noiseCursor`. Target ties break by id (string `<`), never by array position. Every new field is plain data that survives `structuredClone`.
- **Snapshot discipline.** Everything a pilot reads about other aircraft comes from the start-of-tick array and the start-of-tick combat record, including other pilots' `decision.targetId`.
- **Bit-identity.** The four scenarios without a pilot (`deck-quals`, `free-flight`, `gunnery-range`, `strike-range`) keep their **stripped** digests from `.superpowers/7e/hash.ts` through every task. "Stripped" drops only the keys 7e adds (`friendlyHits`, `friendlyKills`, `mode`, `targetId`, `legIndex`, `side`), so a shape change is told apart from a behavior change. Baseline (2026-09-26, node v22.22.1, `242c35e`, 1,800 ticks):

  | Scenario | stripped | motion |
  | --- | --- | --- |
  | deck-quals | `f5be48c2c641bea5` | `7f4c3d1cf6dedf23` |
  | free-flight | `1bf07decdd1d0f54` | `4e0adbda05f8b7bb` |
  | gunnery-range | `acb6072ebe4b353f` | `23b35004d989ced8` |
  | strike-range | `ace29a5a21bac2bf` | `70d665f20e4daa95` |
  | pursuit-range | `77d2aa0036653895` | `74e3044c5aca0da8` |
  | pursuit-range-veteran | `e2a415b9edebf448` | `8b13fabaf287bcfd` |
  | fx:pursuit-tail-chase | `61230f7ef91ab487` | `44837cd07e585ae5` |
  | fx:zero-merge | `72d328d8eccbccb1` | `f0a944751d0b1efb` |

  The four piloted rows are expected to move **only** in Task 3 (the id-seeded noise cursor), and must be unchanged by every other task. The golden trajectory and both landing snapshots stay bit-identical (none has a pilot).
- **Tuning values are measured, not guessed.** Every constant this plan introduces says where its number came from; the ones marked "measured in Task N" are set by that task's probe and recorded in its commit and the ledger.
- **"Fires" is not "hits"** (7a). Every many-vs-many claim is asserted on damage and credited kills, never on rounds fired.
- Scratch probes live under `.superpowers/7e/` (gitignored). Never commit a probe.
- US spelling. Escape `|` as `\|` in table cells. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Tick the task's checkboxes in the same commit as the task.

## Shared files, overlap and merge order

E1 (effects) and O1 (ordnance models) execute in parallel from the same `242c35e`. 7e keeps its edits in shared files small and in blocks E1's plan does not name.

| File | 7e's change | E1/O1 change | Overlap |
| --- | --- | --- | --- |
| `src/sim/loop.ts` | `AircraftEntity.side?`; the static-target side check in `createWorldOf`; one `sides` table per tick passed to `pilotContext`, `stepCombat` and `creditDownedAircraft` | E1: none named in its plan | none expected |
| `src/sim/weapons/combat.ts` | `AircraftCombat.friendlyHits/friendlyKills`; the record literal in `createCombat`; a trailing `sides` parameter on `stepCombat`; `creditAircraftDamage`; `creditDownedAircraft` | E1 Task 1: `CombatState.impacts`, `createCombat`'s return (the `impacts: []` line), `Contact`, `nearestContact`, the shot loop, the return | textual in `createCombat` only (different lines of the same literal); resolve by keeping both |
| `src/render/main.ts` | `__ww2.aircraft()` gains `side`, `mode`, `maneuver`, `targetId` | E1 Tasks 7, 9, 10: quality binding, fx wiring | different blocks; re-diff before merging |
| `src/render/diagnostics.ts` | the `aircraft()` row type | E1 Task 9: `Ww2Diagnostics` gains fx members | same type, different members |
| `src/render/radar.ts`, `src/render/scene/radarScope.ts` | the `friendly` flag and its tint | none | none |
| `src/render/combatReadout.ts` | `CombatDiagnostics.aircraft` rows gain `kills`, `friendlyKills`, `attacker` | none named | none |
| `src/render/titleScreen.ts` | `furball-range` in `SCENARIO_OPTIONS` | none | none |
| `src/sim/scenario.ts` | schema (`side`, optional `target`, `ingress`), `pilotAssignmentFrom` | M2/M4 later | M4 rebases onto 7e (missions spec §8) |
| `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` §15, `README.md` | Plan 7 row, one paragraph | E1 adds its own row and paragraph | textual; keep both |

## Review Focus

1. **The player's Shift pursuit autopilot chases an allied wingman.** `autoPursuitTarget` treats every other airborne aircraft as the enemy ("the world has no friend/foe field", now false). In `furball-range` the nearest aircraft at spawn is the allied AI. Expected: it picks only opposite-side aircraft. Task 8.
2. **A static target that dies.** Before 7e the pilot chased the wreck (7c handoff open item 4). Expected: no target, mode `loiter`, level flight above the floor, and no rounds at the wreck. Task 5.
3. **A friendly between shooter and target.** Expected: no round leaves the gun while any same-side aircraft is within twice the gun cone and not beyond the target plus 100 m; firing resumes once it clears. Task 6.
4. **A raider spawned mid-mission, at tick > 0, next to a twin.** Expected: its first commanded tick flies a real snapshot (never the `ZERO` placeholder), and two raiders spawned on the same tick do not jitter in lockstep. Task 7.
5. **A world saved mid-furball resumes identically, and the array order does not matter.** Expected: a `structuredClone` mid-engagement flies on bit-identically, and reversing the aircraft array gives the same per-id states. Tasks 5 and 9.

---

## File structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/sim/sides.ts` | create (Task 1) | `Side`, `sideOf`, `sidesOf`, `sameSide` |
| `src/sim/ai/targeting.ts` | create (Task 4) | `DETECTION_RANGE_M`, score weights, `isContact`, `contactScore`, `selectTarget` |
| `src/sim/ai/holdFire.ts` | create (Task 6) | `friendlyInLineOfFire` |
| `src/sim/ai/ingress.ts` | create (Task 7) | route progress, the route/orbit desired velocity, `ingressAccepts` |
| `src/sim/ai/pilot.ts` | modify (Tasks 3, 7) | `PilotMode`, `targetId`/`mode`/`legIndex`, `noiseSeedFor`, `initialDecision(id?, mode?)`, `IngressOrders` |
| `src/sim/ai/pursuit.ts` | modify (Tasks 1, 7) | `PilotAssignment.target: string \| null`, `ingress?` |
| `src/sim/ai/pilotTick.ts` | modify (Tasks 5, 6, 7) | target validity, choice, loiter, ingress, hold fire |
| `src/sim/ai/autoPursuit.ts` | modify (Task 8) | skip same-side aircraft |
| `src/sim/loop.ts` | modify (Tasks 1, 2, 5) | `side?`, static-target side check, the per-tick `sides` table |
| `src/sim/weapons/combat.ts` | modify (Task 2) | friendly credit |
| `src/sim/scenario.ts` | modify (Tasks 1, 3, 7) | schema, assignment |
| `content/scenarios/furball-range.json` | create (Task 9) | the development furball |
| `src/render/titleScreen.ts` | modify (Task 9) | picker entry |
| `src/render/radar.ts`, `src/render/scene/radarScope.ts` | modify (Task 10) | friendly flag and tint |
| `src/render/main.ts`, `src/render/diagnostics.ts`, `src/render/combatReadout.ts` | modify (Task 10) | diagnostics |
| `tests/sim/sides.test.ts`, `tests/sim/weapons/friendlyCredit.test.ts`, `tests/sim/ai/targeting.test.ts`, `tests/sim/ai/sidesTick.test.ts`, `tests/sim/ai/holdFire.test.ts`, `tests/sim/ai/ingress.test.ts`, `tests/sim/ai/furball.test.ts` | create | per-task tests |
| `tests/e2e/furball.spec.ts` | create (Task 11) | Tier 2 |

## Rulings made while writing (2026-09-26, Mark's defaults for an unattended run)

- **W1. Friendly hits and kills count only in `friendlyHits`/`friendlyKills`.** Not in `hits`, `kills` or `killsByType`. The spec names only `killsByType` as excluded; excluding `hits` and `kills` too keeps the HUD's kill count and the player's accuracy statistic honest ("all hits" in the §4.7 gate is `hits + friendlyHits`). Cost if wrong: the HUD would have to add the two back; one line in `combatReadout.ts`.
- **W2. Self-inflicted blast damage is same-side.** An aircraft caught in its own bomb's blast is credited, if at all, as a friendly hit or kill. Before 7e it was credited as a kill of its own role. No shipped scenario does this (the stripped digests prove it). Cost if wrong: none measurable.
- **W3. A static target keeps its 7a/7b meaning exactly:** any aircraft in the snapshot that is not down, at any range, parked or not. It is never replaced by a chosen one; when it goes down the pilot loiters. This is what keeps `pursuit-range`'s trajectory identical except for the noise cursor.
- **W4. Selection is forced, not merely re-scored, when the target goes down.** The pilot also refreshes its perception and intent that tick, and clears any latch, because a latch and a snapshot taken against the dead aircraft are meaningless against the new one. The same applies whenever a rescore changes the target.
- **W5. Hold fire uses the unscaled cone**, `2 × AI_GUN_CONE_RAD` (6°), not the skill-scaled one, measured from the aircraft's nose, against live snapshot positions, and it counts the player and parked friendlies. A friendly that is down does not block.
- **W6. The ingress pilot's destination is resolved at build time** for an airfield (its runway center) and read live every tick for a ship (`PilotTickContext.ships`). A destination ship must be a starting ship of the scenario.
- **W7. `legIndex` runs past the route.** `0 … route.length − 1` flies to that waypoint; `route.length` flies to the destination; `route.length + 1` orbits (the destination, or the last waypoint when there is none). Plain data, so a saved raider resumes.
- **W8. The "leave" rule for an ingress pilot is part of selection:** its current target stays eligible out to `1.5 × INGRESS_ENGAGE_RANGE_M` = 4,500 m; any other contact must meet the engage rule. Beyond that the raider resumes at its current `legIndex`.
- **W9. `furball-range` is in the title-screen picker** as "Furball (dev)", because `?scenario=` accepts only picker ids in production and the viewing checkpoint needs a URL. Cost if wrong: one line to remove.
- **W10. `initialDecision()` without an id keeps cursor 0**, so the hand-built test pilots stay bit-identical. Only `pilotAssignmentFrom` (every scenario-built pilot, including held groups) seeds from the id.

---

### Task 1: Sides — `sideOf`, content, and the static-target check

**Files:**
- Create: `src/sim/sides.ts`, `tests/sim/sides.test.ts`
- Modify: `src/sim/loop.ts` (`AircraftEntity`, `createWorldOf`'s pilot loop), `src/sim/ai/pursuit.ts` (`PilotAssignment.target`), `src/sim/ai/pilotTick.ts` (null-target guard), `src/sim/scenario.ts` (schema, `buildAircraft`)
- Test: `tests/sim/sides.test.ts`, `tests/sim/scenario.test.ts`

**Interfaces:**
- Produces: `type Side = 'allied' | 'axis'`; `sideOf(world: { readonly player: string }, a: Sided): Side`; `sidesOf(world, aircraft: readonly Sided[]): Readonly<Record<string, Side>>`; `sameSide(sides, a: string, b: string): boolean`; `AircraftEntity.side?: Side`; `PilotAssignment.target: string | null`.

- [x] **Step 1: Write the failing tests** (`tests/sim/sides.test.ts`)

```ts
import { describe, expect, it } from 'vitest'
import { sameSide, sideOf, sidesOf } from '../../src/sim/sides.js'
import { parseScenario, worldFromScenario } from '../../src/sim/scenario.js'
import { createWorldOf } from '../../src/sim/loop.js'
import { loadScenarioBundle } from '../../tools/content/load.js'

describe('sides (7e spec §4.1)', () => {
  it('defaults: the player is allied, every other aircraft axis', () => {
    const w = { player: 'p' }
    expect(sideOf(w, { id: 'p' })).toBe('allied')
    expect(sideOf(w, { id: 'x' })).toBe('axis')
    expect(sideOf(w, { id: 'x', side: 'allied' })).toBe('allied')
    expect(sideOf(w, { id: 'p', side: 'axis' })).toBe('axis')
  })
  it('reproduces every shipped scenario: the player allied, all others axis', () => {
    for (const id of ['deck-quals', 'free-flight', 'gunnery-range', 'strike-range', 'pursuit-range', 'pursuit-range-veteran']) {
      const world = worldFromScenario(loadScenarioBundle(id), null)
      const sides = sidesOf(world, world.aircraft)
      for (const a of world.aircraft) expect(sides[a.id]).toBe(a.id === world.player ? 'allied' : 'axis')
    }
  })
  it('sameSide is false for an unknown id', () => {
    expect(sameSide({ a: 'axis' }, 'a', 'zz')).toBe(false)
  })
  it('rejects a static target on its own side, in the schema and in createWorldOf', () => { /* see Step 3 */ })
})
```

The last case parses a two-aircraft scenario whose AI says `"side": "allied"` and targets the player, and expects `Invalid scenario: aircraft.1.pilot.target: pilot target must be on the opposite side`. It then calls `createWorldOf` with the same pair built by hand and expects `createWorldOf: pilot "ai" targets "p" on its own side`.

- [x] **Step 2: Run to verify it fails** — `npx vitest run tests/sim/sides.test.ts --maxWorkers=2`, expect "Cannot find module .../sides.js".

- [x] **Step 3: Implement.** `src/sim/sides.ts`:

```ts
/** Sides (AI 7c spec §4.1, Plan 7e). The mission engine reads `side` and
 *  never redefines it (spec §8). */
export type Side = 'allied' | 'axis'
export type Sided = { readonly id: string; readonly side?: Side }

/** Absent `side`, the player is allied and every other aircraft axis: the
 *  rule that reproduces every scenario shipped before 7e. */
export function sideOf(world: { readonly player: string }, a: Sided): Side {
  return a.side ?? (a.id === world.player ? 'allied' : 'axis')
}
export function sidesOf(world: { readonly player: string }, aircraft: readonly Sided[]): Readonly<Record<string, Side>> {
  const out: Record<string, Side> = {}
  for (const a of aircraft) out[a.id] = sideOf(world, a)
  return out
}
export function sameSide(sides: Readonly<Record<string, Side>>, a: string, b: string): boolean {
  const s = sides[a]
  return s !== undefined && s === sides[b]
}
```

`AircraftEntity` gains `readonly side?: Side` (doc: optional so hand-built entities stay valid; read through `sideOf`). `PilotAssignment.target` becomes `string | null` ("null: the pilot chooses, Task 5"). `pilotTick` returns `a` when `pilot.target === null` until Task 5 replaces that guard. `createWorldOf`'s pilot loop skips the target checks when `target === null` and adds the side check. `scenario.ts`: both aircraft objects gain `side: z.enum(['allied', 'axis']).optional()`; `PilotObject.target` becomes optional; the target superRefine adds the opposite-side check using the default rule over the start aircraft; the held-group check does the same over start + group aircraft; `buildAircraft` spreads `side` only when present (so a scenario without it builds byte-identical entities); `pilotAssignmentFrom` maps an absent target to `null`.

- [x] **Step 4: Run** `tests/sim/sides.test.ts tests/sim/scenario.test.ts tests/sim/entities.test.ts tests/sim/mission/schema.test.ts` — PASS. Typecheck. Run the digest probe: all eight rows unchanged.

- [x] **Step 5: Commit** `7e Task 1: sides -- sideOf, the side field, and the opposite-side static-target check`.

### Task 2: Friendly fire stays physical; teamkills never score

**Files:**
- Modify: `src/sim/weapons/combat.ts` (`AircraftCombat`, `createCombat`'s record literal, `stepCombat`'s trailing parameter, `creditAircraftDamage`, `creditDownedAircraft`), `src/sim/loop.ts` (one `sides` table per tick)
- Test: `tests/sim/weapons/friendlyCredit.test.ts`

**Interfaces:**
- Produces: `AircraftCombat.friendlyHits: number`, `AircraftCombat.friendlyKills: number`; `stepCombat(..., arcadeDamage = false, sides: Readonly<Record<string, Side>> | null = null)`; `creditDownedAircraft(before, after, beforeAircraft, afterAircraft, sides = null)`.

- [x] **Step 1: Failing tests.** In a hand-built world, an AI with `side: 'allied'` sits 200 m ahead of the player on the player's nose; the player holds the trigger through production `advance`. Assert: the ally's `damage.structure` falls (the round is physical), the player's `friendlyHits > 0`, `hits === 0`, and after the ally is destroyed `friendlyKills === 1`, `kills === 0` and every `killsByType` entry 0. Then `missionScore(player.killsByType, 'landed').total === 0` (Plan 9's score adds nothing, spec §4.7). A mirror case with the target on the axis side credits `hits`, `kills` and `killsByType.fighter` exactly as before. A crash-after-friendly-hit case (`creditDownedAircraft`) credits `friendlyKills`, not `kills`. With `sides === null` (the hand-built `stepCombat` callers) credit is unchanged.
- [x] **Step 2: Run to verify it fails.**
- [x] **Step 3: Implement.** In `creditAircraftDamage(before_, after, owner, round, targetType, targetId)`: `const friendly = sides !== null && sameSide(sides, owner, targetId)`; a friendly event adds to `friendlyHits`/`friendlyKills` and returns. `creditDownedAircraft` applies the same test to `rec.lastHitBy`. In `advance`, once per tick after the pilots and before combat: `const sides = sidesOf(world, aircraft)`, passed to both calls.
- [x] **Step 4: Run** the new file, `tests/sim/weapons/*.test.ts`, `tests/sim/strike.test.ts`, `tests/render/debrief.test.ts`. Digest probe: stripped digests unchanged in all eight rows.
- [x] **Step 5: Commit** `7e Task 2: same-side hits and kills count in friendlyHits/friendlyKills, never killsByType`.

### Task 3: Pilot state for 7e and the id-seeded noise cursor

**Files:**
- Modify: `src/sim/ai/pilot.ts`, `src/sim/scenario.ts` (`pilotAssignmentFrom(id, pilot, …)`)
- Test: `tests/sim/ai/pilot.test.ts`, `tests/sim/scenario.test.ts`

**Interfaces:**
- Produces: `type PilotMode = 'engage' | 'ingress' | 'formation' | 'rtb' | 'landed' | 'loiter'`; `PilotDecisionState.mode`, `.targetId: string | null`, `.legIndex: number`; `noiseSeedFor(id: string): number` (FNV-1a, 32-bit); `initialDecision(id?: string, mode: PilotMode = 'engage')`.

- [x] **Step 1: Failing tests:** `noiseSeedFor` is a fixed function of the id (pin two values), differs for `bandit-1`/`bandit-2`, and returns an unsigned 32-bit integer; `initialDecision()` keeps cursor 0; a scenario-built pilot's cursor is `noiseSeedFor(id)`, its `targetId` is `null`, `legIndex` 0 and mode `engage`.
- [x] **Step 2: Run to verify it fails.**
- [x] **Step 3: Implement** (7c spec §4.5 "Spawning at tick > 0", items 2 and 3).
- [x] **Step 4: Re-run the gates the cursor moves** (7c handoff §8): `tests/render/aiLethality.test.ts`, `tests/render/aiReengage.test.ts`, `tests/render/aiSafety.test.ts`, `tests/sim/pursuitMerge.test.ts`, `tests/sim/zeroMerge.test.ts`, `tests/sim/ai/lowChase.test.ts` on ryzen (`remote-run npx vitest run <files>`). Then run item 3 of `aiLethality.test.ts` once at `pursuer-1`'s new cursor with a probe (`.superpowers/7e/item3-cursor.ts`) and record the time-behind in the ledger. Digest probe: only the piloted rows' full and motion digests move.
- [x] **Step 5: Commit** `7e Task 3: targetId, mode and legIndex; the noise cursor is seeded from the entity id`.

### Task 4: Target selection

**Files:**
- Create: `src/sim/ai/targeting.ts`, `tests/sim/ai/targeting.test.ts`

**Interfaces:**
- Produces:

```ts
export const DETECTION_RANGE_M = 8000
export const THREAT_BONUS_M = 3000        // contact has me in its gun cone
export const LEADER_THREAT_BONUS_M = 2000 // contact has my leader in its gun cone (7f wires the leader)
export const TAIL_BONUS_M = 1000          // x (angle off the contact's tail toward me) / pi
export const ENGAGED_PENALTY_M = 1500     // per same-side pilot already targeting it
export const STICKY_BONUS_M = 1000        // my current target (hysteresis)
export type TargetingView<M> = {
  readonly snapshot: readonly AircraftEntity<M>[]
  readonly combat: CombatState['aircraft']
  readonly sides: Readonly<Record<string, Side>>
}
export type TargetingOptions<M> = {
  readonly current: string | null
  readonly leaderId: string | null
  readonly accept?: (contact: AircraftEntity<M>, rangeM: number) => boolean
}
export function isContact<M>(self: AircraftEntity<M>, c: AircraftEntity<M>, view: TargetingView<M>): boolean
export function contactScore<M>(self: AircraftEntity<M>, c: AircraftEntity<M>, view: TargetingView<M>, opts: TargetingOptions<M>): number
export function selectTarget<M>(self: AircraftEntity<M>, view: TargetingView<M>, opts: TargetingOptions<M>): string | null
```

The weights are in meters of range, so a contact's score reads "how much nearer it is worth". Candidates: opposite side, not down (`isAircraftDown`), not parked, within `DETECTION_RANGE_M`. Ties break by id.

- [x] **Step 1: Failing tests, one per score term** (spec §4.7), each built as two otherwise-symmetric contacts where only that term differs, asserting the pick flips when the term is present: nearer; threat (the farther contact has me in its cone); leader threat; tail toward me; engaged-by-friendlies penalty; stickiness. Plus: same side, down, impacted, parked and out-of-range contacts are never picked; an exact tie picks the smaller id; reversing the snapshot changes nothing.
- [x] **Step 2: Run to verify it fails.**
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** — PASS.
- [x] **Step 5: Commit** `7e Task 4: target selection -- five score terms plus stickiness, ties by id`.

### Task 5: The pilot chooses, re-checks and loiters

**Files:**
- Modify: `src/sim/ai/pilotTick.ts`, `src/sim/loop.ts` (`pilotContext` gains `sides`, `ships`)
- Test: `tests/sim/ai/sidesTick.test.ts`, `tests/sim/ai/pilotTick.test.ts`

**Interfaces:**
- Consumes: Task 4's `selectTarget`; Task 3's decision fields.
- Produces: `PilotTickContext.sides: Readonly<Record<string, Side>>`, `PilotTickContext.ships: readonly ShipEntity[]`; `LOITER` flight = level flight along the current track at the current speed (never below `1.3 × reference.stallSpeedMps`), under the §3.2 safety envelope.

Order inside `pilotTick` each tick:
1. **Validity** (every tick): a `targetId` that is down or missing forces selection now (ruling W4).
2. **Choice** (on rescore or when forced): static target (W3), else ingress rules (Task 7), else `selectTarget` with `current = targetId`. A changed target clears the latch.
3. **Rescore with a target:** unchanged 7b/7c code (facts, intent, perception snapshot, maneuver selection).
4. **Flight:** safety override first, then the maneuver (target) or loiter/ingress (no target).

- [x] **Step 1: Failing tests:** (a) a dynamic pilot among two hostiles picks one on tick 1 and `mode === 'engage'`; (b) **retarget within one tick of a death**: destroy the target through the combat record at tick N, and at tick N+1 `targetId` names the other hostile and the perception snapshot is the new one's; (c) a static target that dies: `targetId` null, mode `loiter`, `fire` never true afterwards, altitude held within 150 m over 20 s and never below `FLOOR_M`; (d) **order independence** with N = 6 dynamic pilots on two sides, 20 s through `advance`: reversing the array gives identical per-id state; (e) a `structuredClone` of that world at 10 s flies on bit-identically; (f) a dynamic pilot with nothing within 8 km loiters.
- [x] **Step 2: Run to verify it fails.**
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** the new file plus `tests/sim/ai/*.test.ts`, `tests/sim/entities.test.ts`, `tests/sim/scenario.test.ts`. Digest probe: all eight rows equal Task 3's.
- [x] **Step 5: Commit** `7e Task 5: pilots choose their target, re-check it every tick, and loiter without one`.

### Task 6: Hold fire

**Files:**
- Create: `src/sim/ai/holdFire.ts`, `tests/sim/ai/holdFire.test.ts`
- Modify: `src/sim/ai/pilotTick.ts`

**Interfaces:**
- Produces: `HOLD_FIRE_CONE_RAD = 2 * AI_GUN_CONE_RAD`, `HOLD_FIRE_BEYOND_TARGET_M = 100`, `friendlyInLineOfFire(self, targetRangeM, view): boolean`.

- [x] **Step 1: Failing tests:** unit cases (ahead in cone, beside the cone, beyond target + 100 m, a down friendly, an enemy in the cone); and **a friendly that crosses the line of fire** in production `advance`: a veteran on a straight target's tail, gun solution held, and an allied aircraft flown across between them. Assert the shooter's `shots` stop rising for the ticks the crosser is inside the cone, rise again after, and the crosser takes zero hits and `friendlyHits` stays 0.
- [x] **Step 2: Run to verify it fails.**
- [x] **Step 3: Implement** in `pilotTick`: after `maneuverControls`, if `controls.fire` and `friendlyInLineOfFire(...)`, clear `fire`.
- [x] **Step 4: Run.** Digests equal Task 5's (no shipped scenario has a friendly AI).
- [x] **Step 5: Commit** `7e Task 6: hold fire while a same-side aircraft is in the line of fire`.

### Task 7: The ingress pilot

**Files:**
- Create: `src/sim/ai/ingress.ts`, `tests/sim/ai/ingress.test.ts`
- Modify: `src/sim/ai/pilot.ts` (`IngressOrders`), `src/sim/ai/pursuit.ts` (`PilotAssignment.ingress?`), `src/sim/ai/pilotTick.ts`, `src/sim/scenario.ts` (schema, destination validation, assignment)

**Interfaces:**

```ts
export type IngressWaypoint = { readonly x: number; readonly z: number; readonly altitudeM: number; readonly speedMps: number }
export type IngressDestination = { readonly kind: 'ship'; readonly id: string } | { readonly kind: 'point'; readonly x: number; readonly z: number }
export type IngressOrders = { readonly route: readonly IngressWaypoint[]; readonly destination: IngressDestination | null }
// ingress.ts
export const WAYPOINT_REACHED_M = 1000
export const INGRESS_ENGAGE_RANGE_M = 3000
export const INGRESS_RELEASE_RANGE_M = 1.5 * INGRESS_ENGAGE_RANGE_M
export const RECENT_HIT_S = 10
export const MAX_VERTICAL_MPS = 10
export const ORBIT_RADIUS_M = 1500
export function nextLegIndex<M>(self: AircraftEntity<M>, orders: IngressOrders, legIndex: number, ships: readonly ShipEntity[]): number
export function ingressDesiredVelocity<M>(self: AircraftEntity<M>, orders: IngressOrders, legIndex: number, ships: readonly ShipEntity[]): Vec3
export function ingressAccepts<M>(self: AircraftEntity<M>, record: AircraftCombat, current: string | null, nowS: number): (c: AircraftEntity<M>, rangeM: number) => boolean
```

Content (spec §4.5): `pilot.ingress = { route: [{ x, z, altitudeM, speedMps }, …], destination?: { ship } | { airfield } }`; `ingress` excludes `target` (schema).

- [x] **Step 1: Failing tests** (spec §4.5 acceptance): (a) a raider with no opposition flies a three-leg route: each waypoint reached in order, each leg ends within 100 m of its altitude and 10 m/s of its speed, and it ends orbiting the moving carrier (the last 60 s inside 500-3,000 m of the carrier, with the bearing from the carrier sweeping more than 180°); (b) an interceptor attacking it mid-route turns it to `engage` within one `reactionS` of the interceptor's gun solution; when the interceptor is destroyed it resumes at the same `legIndex`; (c) a hostile flying a parallel track 6 km off the route never pulls it off (mode stays `ingress` throughout); (d) **spawn at tick 3,000**: a held raider spawned through `spawnHeldGroup` at tick 3,000 has, after one tick, a perception snapshot equal to its target's start-of-tick position (never `ZERO`) when a hostile is in range, and a finite, route-directed command otherwise; (e) **two raiders spawned on the same tick jitter differently** (their `noiseCursor`s differ and so do their first commanded roll/pitch/yaw); (f) schema: `ingress` with `target` is rejected; an unknown destination ship or airfield is rejected; a `structuredClone` mid-route resumes identically.
- [x] **Step 2: Run to verify it fails.**
- [x] **Step 3: Implement.** Flight: vertical = `clamp(ALTITUDE_GAIN × error, ±MAX_VERTICAL_MPS)`, horizontal toward the goal at `sqrt(speed² − vy²)`, flown through `controlsForDesiredVelocity`; its throttle is replaced by an ingress speed law if the probe shows the controller's P-only throttle leaves more than 10 m/s of steady error (measured in this task). Orbit: tangent plus a radial correction toward `ORBIT_RADIUS_M`.
- [x] **Step 4: Run** the new file and `tests/sim/mission/*.test.ts`. Digests equal Task 6's.
- [x] **Step 5: Commit** `7e Task 7: the ingress pilot -- route, engage-if-attacked, resume, orbit; spawn at tick > 0`.

### Task 8: The Shift pursuit autopilot ignores friendlies

**Files:** Modify `src/sim/ai/autoPursuit.ts`; Test `tests/sim/ai/autoPursuit.test.ts`.

- [x] **Step 1: Failing test:** an allied AI 500 m away and an axis one 2 km away: `autoPursuitTarget` returns the axis one.
- [x] **Step 2: Run to verify it fails.**
- [x] **Step 3: Implement** with `sideOf`; fix the header comment that says the world has no friend/foe field.
- [x] **Step 4: Run.** Digests unchanged.
- [x] **Step 5: Commit** `7e Task 8: the pursuit autopilot chases only the other side`.

### Task 9: `furball-range` and the furball soak

**Files:**
- Create: `content/scenarios/furball-range.json`, `tests/sim/ai/furball.test.ts`
- Modify: `src/render/titleScreen.ts` (`SCENARIO_OPTIONS`), and any test enumerating shipped scenarios (`tests/build/dist.test.ts`, `tests/render/titleScreen.test.ts`)

Content (spec §4.6): the player plus one allied AI against two axis pairs (each a veteran with a green), all airborne at 3,500 m over the gulf, every airframe `f6f-hellcat` until the Zero's content is swapped in. Every AI omits `target`, so every AI chooses.

- [x] **Step 1: Failing test, the 120 s furball soak** through production `advance` with a hands-off player at the scenario's spawn throttle (spec §4.7): two runs bit-identical; no NaN in any state; for every AI the §3.6 invariants (structure 1 unless hit, never below `FLOOR_M` unless pursuing, where the pursuit floor applies, no sea impact; peak `stress.loadFactorG` ≤ `limits.gLimit`); **at least one AI-on-AI kill by hits** (a destroyed AI whose `damage.attacker` is another AI); every credited kill's shooter on the opposite side of its victim; `friendlyKills` = 0 and `friendlyHits` under 5% of all hits; p95 tick cost reported and under the 2 ms sanity ceiling.
- [x] **Step 2: Run to verify it fails** (no scenario yet).
- [x] **Step 3: Write the content**; if the geometry produces no AI-on-AI kill in 120 s, adjust spawn geometry (never the AI) and record the measurement.
- [x] **Step 4: Run** the soak on nexus alone, then the title-screen and dist tests.
- [x] **Step 5: Commit** `7e Task 9: furball-range and the 120 s furball soak`.

### Task 10: Radar friendly flag and the diagnostics

**Files:**
- Modify: `src/render/radar.ts` (`RadarContact.friendly`), `src/render/scene/radarScope.ts` (a second tint), `src/render/main.ts` (`aircraft()` rows), `src/render/diagnostics.ts` (row type), `src/render/combatReadout.ts` (rows gain `kills`, `friendlyKills`, `attacker`)
- Test: `tests/render/radar.test.ts`, `tests/render/combatReadout.test.ts`

- [x] **Step 1: Failing tests:** `radarContacts` marks an allied contact `friendly: true` and an axis one `false`, relative to the player's own side; `combatDiagnosticsFor` rows carry `kills`, `friendlyKills`, `attacker`.
- [x] **Step 2: Run to verify it fails.**
- [x] **Step 3: Implement.** The scope keeps green for hostiles and draws friendlies cyan (`0.35, 0.8, 1.0`); `readAt` still returns the green channel. `__ww2.aircraft()` rows gain `side`, `mode`, `maneuver`, `targetId` (null without a pilot).
- [x] **Step 4: Run** radar, radarScope, combatReadout tests; typecheck.
- [x] **Step 5: Commit** `7e Task 10: radar friendly tint and 7e diagnostics`.

### Task 11: Tier 2, verify, docs, review

**Files:**
- Create: `tests/e2e/furball.spec.ts`, `docs/handoff/2026-09-26-plan7e-sides.md`
- Modify: master spec §15 row 7, `README.md`, 7c spec §4 only if a ruling changed its text

- [ ] **Step 1: Tier 2 spec** (spec §4.7): `furball-range` boots; `__ww2.combat()` shows at least one kill between two AI aircraft (a destroyed AI whose `attacker` is another AI, opposite side); zero validation errors; gpu p95 < 6.0 ms at 2560×1440 with every airframe drawn.
- [ ] **Step 2: Run it** on a free dev slot (`ss -ltnp` first; the `vite.config.ts` edit is local scratch), plus `ai-pursuit`, `ai-maneuver`, `ai-pursuit-difficulty` and `radar`, since the cursor and the radar moved.
- [ ] **Step 3: `remote-run npm run verify`**, `rc=$?`.
- [ ] **Step 4: Whole-branch review** by a fresh subagent; fix what it finds; re-verify.
- [ ] **Step 5: Handoff, §15, README**; leave `furball-range` serving on the slot and assert 200; push the branch; email the handoff; append to the parallel-tracks ledger.
