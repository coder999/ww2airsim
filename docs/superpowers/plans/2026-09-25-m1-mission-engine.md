# M1: the mission engine, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the sim-side mission engine: objectives, triggers, held groups entering mid-flight, and the outcome and badge rules, all pure and headless. Every scenario without objectives stays bit-identical to today.

**Architecture:** A scenario that declares `objectives` gets a `World.mission` (`MissionState`). `advance` steps it once per tick after combat resolves, through `stepMission` in `src/sim/mission/`. `stepMission` reads a narrow view of the tick (`MissionTick`), not the `World`. It returns spawn requests, and `advance` applies them through the one insertion path, `spawnInto`/`spawnHeldGroup`. The landing tracker moves from `src/render/landing.ts` to `src/sim/landing.ts`. The render frame still runs it once per frame for the debrief, and the mission runs the same function once per tick. A Tier 1 test pins that the two agree on every recovery kind. With no objectives, `World.mission` is `null` and the new code path is skipped completely.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`), Zod 3.25 content schemas, vitest, `tsx` for scratch probes.

**Spec:** `docs/superpowers/specs/2026-09-25-missions-design.md`. Mark approved it on 2026-09-25, and its decisions (§0) are settled. This plan is the spec's §9 item 1, "M1 — engine: schema, state, step, outcome, `spawnHeldGroup`, recovery moved to the sim; Tier 1 only; bit-identity gate." Read §1, §2 and §5 before starting.

**Where:** the worktree `/home/mark/projects/ww2airsim/.claude/worktrees/missions-track`, branch `worktree-missions-track` (main plus the approved spec). Do not switch branches, and do not push. Merging to `main` is Mark's call.

**Open questions for Mark:** none. Every decision this plan needed is either settled in the spec's §0 or is an engineering ruling recorded under "Rulings this plan makes", each with what it costs if it is wrong.

## Global Constraints

- `npm run verify` ends every task with `rc=0`. Capture the status directly: `npm run verify; rc=$?; echo "rc=$rc"`. Never gate on a grepped pipeline.
- **Memory (2026-09-25):** a session crashed this 22 GB machine by running full vitest suites in parallel inside repo copies under `/tmp`, which is RAM-backed. So:
  - Never copy the repo anywhere.
  - Run at most one `npm run verify` at a time on the machine.
  - For one test file, use `npx vitest run <file> --maxWorkers=2`.
  - Other agents share this machine.
- **Bit-identity (spec §1, verbatim):** "A scenario without objectives must be **bit-identical to today** (golden and trajectory tests unchanged); this is an acceptance gate, not a hope." Tasks 1, 3 and 5 each re-run the digest probe (see "Measured") and must reproduce the baseline hashes exactly.
- Spec §0.2: objectives and triggers are "pure, deterministic code in `src/sim/mission/`, stepped with the world clock; the render side only displays."
- Spec §0.3: "No scripting language, no branching, no variables."
- Spec §2.1: "A tag that matches nothing is a **parse error**, not a silent empty set." Ruling R4 records where that error is raised.
- Spec §2.2: "Triggers are evaluated after objectives in the same tick, in file order."
- Spec §1: `spawnHeldGroup` "is the only way an entity appears after tick 0."
- Spec §0.5 and §2.4: only a LANDING with a non-null `at` earns the badge. §0.6: failure is announced, not enforced, except death.
- Spec §0.9: `hold` counts **accumulated** time inside the station.
- `src/sim/` never imports `render/`, `input/`, `assists/`, `audio/`, Node core or a rendering library (`.dependency-cruiser.cjs`). Its `no-circular` rule sees runtime imports only. `src/sim/mission/*` may import `../loop.js` **types only**.
- **Ownership (spec §8):**
  - This plan edits nothing under `src/sim/ai/**`.
  - It adds no `side` field and does not change `pilotAssignmentFrom`: pilot initialization at tick > 0 belongs to Lane A's 7e.
  - It touches no render pipeline, clouds, sky, ocean or terrain shading.
  - Its only render edits are the import path moves in Task 1 and the loader in Task 2.
- No new content under `content/scenarios/` and no Dulag AAA. Those are M3's. The fixtures are inline test data.
- No Tier 2, Playwright or dev servers. M1 is Tier 1 only (spec §9).
- Scratch probes go under `.superpowers/`, which is gitignored (`git check-ignore -v .superpowers/x` prints `.gitignore:33:.superpowers/`). Never commit a probe.
- US spelling. Escape `|` as `\|` inside markdown table cells.
- End every commit message with the Co-Authored-By trailer your session's instructions specify. Put no AI model names in commit bodies or docs.

## Shared files, overlap and merge order

| File | M1's change | Who else | Overlap |
| --- | --- | --- | --- |
| `src/sim/scenario.ts` | tags, mission keys, `checkMission`, builders extracted, held templates, `World.mission` wiring | 7e (`side`, optional `pilot.target`, id-seeded noise cursor in `pilotAssignmentFrom`) | textual; spec §8: whichever of M1 and 7e lands second rebases onto the other's `scenario.ts` |
| `src/sim/loop.ts` | `World.mission`, the `createWorldOf` `mission` part, the hook at the end of `advance`'s step loop | 7c/7e (the AI block inside the same loop) | textual; different lines of the loop body |
| `src/sim/world/airfields.ts` | optional `tags` on `BuildingObject` | M3 (Dulag AAA content) | none; M3 consumes it |
| `src/render/landing.ts` → `src/sim/landing.ts` | moved; `at` gains `id` | M2 (reads it) | none |
| `src/render/frame.ts`, `src/render/debrief.ts`, `src/render/audio.ts`, `tests/e2e/meta-game*.spec.ts` | import path or comment only | M2 | trivial |
| `tools/content/load.ts`, `src/render/scenarioLoad.ts` | spec-id lists include held groups | none known | textual |
| master spec §15, `README.md` | one row update, one paragraph | every plan | textual |

Z2 (`worktree-combat-track`) states that it touches neither `scenario.ts` nor `loop.ts`, so the two do not overlap. No other plan dated 2026-09-25 names `scenario.ts`, `loop.ts` or `landing.ts` (checked 2026-09-25 across `.claude/worktrees/*/docs/superpowers/plans/2026-09-25-*.md`).

## Rulings this plan makes

Every ruling is an engineering choice inside the approved spec. Each records what it costs if it turns out wrong.

- **R1. One tracker function, two runs.** `nextLandingTracking` moves to `src/sim/landing.ts`. The render frame keeps running it per frame, unchanged, for the debrief. The mission runs it per tick on the player's `previous → state`.
  - The alternative was one world-level tracker that the frame reads. It was rejected for M1 because it changes the frame's landing latch, `acknowledgeLanding` and the debrief's touchdown figures, which is M2's UI.
  - Cost if wrong: in a bounce case the two could disagree. The agreement test (Task 7) pins the six canonical kinds.
- **R2. `LandingReport.at` gains `id`.**
  - An airfield's `name` (`"Tacloban"`) is not its content id (`"tacloban"`), and `land.at` names ids. Measured: the probe below reports `{"kind":"airfield","name":"Tacloban"}`.
  - `name` is kept exactly as it is, so the debrief text does not change.
  - Cost if wrong: none found.
- **R3. Held aircraft must start airborne** (a parse error otherwise).
  - A parked spawn's altitude is a placeholder that only render's `settleOnTerrain` corrects (`PARKED_PLACEHOLDER_Y_M`).
  - A deck spot depends on where the ship is at spawn time.
  - None of the four missions needs a parked held aircraft: the Dulag defenders and the CAP raiders are airborne.
  - Cost if wrong: a later "scramble from the ground" needs spawn-time placement. The check is one line to lift.
- **R4. References to ids and tags resolve when the world is built.** A scenario file does not contain its airfields' buildings, so structure tags can only be checked in `worldFromScenario`, which throws.
  - Every loader's caller calls that at load, so a bad tag fails the load, never mid-flight.
  - Everything checkable from the file alone is checked by `parseScenario`.
  - `tests/sim/mission/content.test.ts` builds every shipped scenario on every run.
  - Cost if wrong: a bad tag fails at world build rather than at JSON parse. The message is the same.
- **R5. The step takes `MissionTick`, not `World`, and returns spawn requests.**
  - `loop.ts` imports the step at runtime, so the step may not import `loop.ts` at runtime (`no-circular`).
  - `stepMission` and `spawnInto` operate on the loop's local arrays, and `spawnHeldGroup(world, id)` is the world-level wrapper the spec names.
- **R6. `HeldGroupObject` lives in `scenario.ts`, not in `mission/schema.ts`** as spec §1 lists it. It reuses the scenario's aircraft and ship objects, and `scenario.ts` imports `mission/schema.ts`, so the reverse would be a runtime cycle. `mission/schema.ts` holds the objective, trigger, station and badge objects.
- **R7. Radio messages are an append-only, tick-stamped log** (`MissionState.log`, read through `radioMessages()`), not a queue that gets popped.
  - The render cannot pop a pure world without writing to it. M2 shows each entry for its few seconds, keyed by tick.
  - The engine writes two messages itself: `"<label>: failed"` when an objective fails, and `"<label> <n> of <count>"` for each landing counted toward a `land` objective with `count > 1`. That second one is spec §4.1's "Trap 1 of 3".
- **R8. `after` must name an earlier objective.** One file-order pass is then complete and cannot cycle. An objective activated earlier in the pass is evaluated in the same tick.
- **R9. Distances are horizontal.** `deny` radii, stations and `enters` regions measure distance in x and z. `altitudeM`, where given, is a separate band on world `y`.
- **R10. Time counts in ticks.**
  - `ticksFor(s) = ceil(s / DT - 1e-6)`.
  - `hold` counts ticks inside the station.
  - `when.at` fires on the first tick `>= ticksFor(at)`, so `at: 0` fires on tick 1, the first step.
- **R11. Impossible missions fail at parse.**
  - Each held group must be spawned by exactly one trigger action.
  - `when.failed` may only name a `protect` or `deny` objective, the only kinds that can fail.
  - `triggers`, `heldGroups` and `badge` need `objectives`.
- **R12. Player-relative evaluation stops when the player is gone.** Once the player is impacted or destroyed, landing tracking, `takeoff`, `reach`, `hold` and `enters` stop. The frame already holds such a world. This covers a headless caller that keeps advancing.
- **R13. What counts as destroyed.**
  - An aircraft is destroyed when its combat damage says so **or** it has an `impact`, so a ditched raider is lost.
  - A ship or structure is destroyed when its `destroyedTick` is set.
  - An unspawned held entity is neither destroyed nor present, so a `deny` hostile that does not exist yet cannot breach.
- **R14. One landing, every matching objective.** A landing advances every active `land` objective that names its base. The log entry names the first one.
- **R15. `briefing` and `history` keys belong to M2,** their first consumer. The scenario schema is strict, so M2 adds them in the same commit as the code that reads them. YAGNI.
- **R16. Outcome reasons** are short phrases in a fixed order:
  1. the recovery (`Killed`, `Ditched`, `Landed off-field`);
  2. each failed primary objective (`<label>: failed`);
  3. each incomplete primary objective (`<label>: incomplete`).

  M2 formats them, for example "Ditched — no badge".

## Review Focus

These are the five inputs the spec implies but no spec-listed test exercises, most likely first. Each has a test in the task that owns the code.

1. **A landing before its `land` objective is active does not count.** A pilot who traps before reaching the downwind gate gets a logged landing with `advanced: null` and no progress. Task 5, "a landing before the objective is active advances nothing".
2. **A reference that is ambiguous, matches nothing, or asks for more than exists fails at load and names the string:** an id that is also a tag, a tag nobody carries, `count: 3` of 2 targets, or a `land.at` ship with no flight deck. Task 3.
3. **A dead player progresses nothing.** When a headless caller keeps advancing after the player is destroyed, `hold` stops accumulating, `enters` never fires and the outcome is `Killed`. Tasks 5, 6 and 7.
4. **A spawn inside a multi-step `advance`.** In a five-step frame, a group spawned on step 2 is stepped on steps 3 to 5, and every entity's `state.tick` equals `world.tick` afterward. Task 6.
5. **A destroyed or unspawned hostile inside a `deny` ring does not fail it.** A wreck falling through the ring, and a raid member whose wave has not spawned yet, are not breaches. Task 5.

---

## File structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/sim/landing.ts` | moved from `src/render/landing.ts` | the pure landing tracker, `LandingReport` (now with `at.id`), `LandingAt` |
| `src/sim/mission/schema.ts` | create | Zod objects: station, objectives (7 kinds), triggers, badge |
| `src/sim/mission/state.ts` | create | `MissionState` and its parts, `ticksFor`, `radioMessages`, `lastLanding` |
| `src/sim/mission/create.ts` | create | `createMission`, `resolveRefs` (ids and tags to entity ids, load-time errors) |
| `src/sim/mission/spawn.ts` | create | `spawnInto` (loop-local) and `spawnHeldGroup(world, id)` |
| `src/sim/mission/step.ts` | create | `stepMission`, `MissionTick`, `isDestroyed`, `insideStation` |
| `src/sim/mission/outcome.ts` | create | `Recovery`, `recoveryOf`, `finalStatus`, `missionOutcome` |
| `src/sim/scenario.ts` | modify | tags, `objectives`/`triggers`/`heldGroups`/`badge`, `checkMission`, `buildShip`/`buildAircraft` extracted, held templates, mission creation, `scenarioAircraftSpecIds`/`scenarioShipSpecIds` |
| `src/sim/loop.ts` | modify | `World.mission`, `createWorldOf`'s `mission` part, the per-tick hook in `advance` |
| `src/sim/world/airfields.ts` | modify | optional `tags` on buildings |
| `tools/content/load.ts`, `src/render/scenarioLoad.ts` | modify | load held groups' specs |
| `src/render/frame.ts`, `src/render/debrief.ts`, `src/render/audio.ts`, `tests/e2e/meta-game.spec.ts`, `tests/e2e/meta-game-relaunch.spec.ts`, `tests/sim/landing.test.ts`, `tests/sim/carrierLanding.test.ts`, `tests/render/landing.test.ts`, `tests/render/debrief.test.ts` | modify | import path, `at.id` in expectations |
| `tests/sim/mission/fixture.ts` | create | a shared inline mission scenario and helpers (not a test file) |
| `tests/sim/mission/{schema,create,content,spawn,objectives,triggers,outcome,recoveryAgreement}.test.ts` | create | as named in each task |
| `tests/render/scenarioLoad.test.ts` | modify | the browser twin loads held specs |

## Measured before writing this plan (2026-09-25, node v22.22.1, this worktree at `96341b9`)

These are claims to re-check, not premises.

- **Baseline digests for the bit-identity gate.** The probe below builds every shipped scenario with `terrain` `null`, advances 1,800 ticks at `DT`, and hashes `{tick, aircraft, ships, combat, accumulatorSeconds}`. Two runs gave identical output (md5 of the whole output `5e0d2757926ad8764f925adf199455e2` both times).

  | Scenario | sha256 at tick 1800 |
  | --- | --- |
  | deck-quals | `b5f020f785220cf082bb553e2fc2636434682a362d9291f021a42525873ba138` |
  | free-flight | `d65f17b91698e3cafd425597c77a5f5e8f54e2fd00395bef1589c8c2b23c99cc` |
  | gunnery-range | `6299059e222112c1c47e22ab416333d1b71c0292d28235ff654030d41acee7d6` |
  | pursuit-range | `9c3eda2cec975dd742a8c50381bc420284b6414a3daceb3930952f44db649aad` |
  | pursuit-range-veteran | `90ff735cfef50146b501b66ed2f4e0fa4afadd3ce02c675b1109c8c432b3a2ec` |
  | strike-range | `be954f43d735ecef64fd38b88dacd32a0205c88cb9c5b152d72cada27593fd0f` |

  The probe (`.superpowers/m1/digest.ts`; run it with `npx tsx .superpowers/m1/digest.ts 1800`):

  ```ts
  import { createHash } from 'node:crypto'
  import { readdirSync } from 'node:fs'
  import { loadScenarioBundle } from '../../tools/content/load.js'
  import { worldFromScenario } from '../../src/sim/scenario.js'
  import { advance } from '../../src/sim/loop.js'
  import { DT } from '../../src/sim/flight/model.js'

  const TICKS = Number(process.argv[2] ?? 1800)
  const ids = readdirSync(new URL('../../content/scenarios/', import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
  for (const id of ids) {
    let world = worldFromScenario(loadScenarioBundle(id), null)
    for (let i = 0; i < TICKS; i++) world = advance(world, DT).world
    const { tick, aircraft, ships, combat, accumulatorSeconds } = world
    const json = JSON.stringify({ tick, aircraft, ships, combat, accumulatorSeconds }, (_k, v: unknown) => (v instanceof Set ? [...v] : v))
    console.log(id.padEnd(24), createHash('sha256').update(json).digest('hex'), `tick=${tick}`)
  }
  ```

  It hashes only the entities, the combat state, the clock and the accumulator. `World.mission` (new) and the entity specs' content are outside the gate's question. `tags` never reaches an entity, so every aircraft and ship record keeps its exact shape.
- **No shipped scenario declares an objective**, and Dulag's two buildings (`dulag-hangar-1`, `dulag-hangar-2`) carry no tags. Six scenario files. So M1 changes the behavior of no shipped scenario.
- **Recovery kinds through production `nextFrameState`.** Probe `.superpowers/m1-plan/recovery.ts`: the player's state is injected, then stepped at one tick per frame on a flat synthetic field. This is how `tests/render/landing.test.ts` does it. Heading north, flaps 1:

  | Case | Setup | Result |
  | --- | --- | --- |
  | airfield | field 100 m; at Tacloban's runway center; wheels 0.4 m up, 30 m/s, 1 m/s sink, gear down; then rest | touchdown after 7 frames; report `{"kind":"airfield","name":"Tacloban"}` |
  | off-field | same, at world (0, 0) | touchdown after 7 frames; report `null` |
  | carrier | terrain `null`; Essex anchored at (-25629, -16479), deck `y` = 17, heading 0; same approach over the deck center | touchdown after 7 frames; report `{"kind":"carrier","name":"cv-1"}` |
  | ditched | field 0 m (water); **body origin** 0.4 m up, 45 m/s, 1 m/s sink, gear up | impact `ditched`, `water`, after 16 frames |
  | killed | field 100 m; wheels 0.4 m up, 60 m/s, 20 m/s sink, gear up | impact `destroyed`, `land`, after 9 frames |

  The first ditch try placed the **wheels** 0.4 m up, which leaves the body origin 2.6 m up (`gear.heightM` is 2.2). It fell long enough to arrive `destroyed`. Ditching is judged at the body origin, so the fixture uses the origin height.
- **Seconds and ticks.** `DT = 1/60` (`src/sim/flight/model.ts:32`). Adding `DT` 10,800 times gives `180.00000000003539`. `180 / DT` gives exactly `10800`, `60 / DT` gives `3600`, `0.5 / DT` gives `30`, and `ceil(0.001 / DT - 1e-6)` gives `1`. Hence R10's integer ticks.
- **World literals.** `accumulatorSeconds: ` appears in exactly 3 places in `src tests tools`, all in `src/sim/loop.ts`. So adding `World.mission` touches only `createWorldOf`, and `advance`'s `{ ...world, ... }` carries it.
- **Runtime importers of `loop.js` under `src/sim`:** only `scenario.ts`. `ai/*`, `world/ships.ts`, `world/deck.ts`, `flight/model.ts` and `invariants.ts` import it for types only. So `loop → mission/step → landing → …` has no runtime cycle, provided the mission modules also import `loop.js` for types only.
- **`LandingReport.at` importers:** `src/render/debrief.ts:154-162`. The expectations to update are at `tests/render/landing.test.ts:149,161,188`, `tests/render/debrief.test.ts:95,111,123`, `tests/sim/landing.test.ts:187` and `tests/sim/carrierLanding.test.ts:114`.
- **Render is index-based over `world.aircraft`.** `src/render/scenarioEntities.ts:102` builds one airframe per entity at load, and `src/render/main.ts:1881-1883` indexes `smokes[i]!`. A spawned aircraft, appended at the end, has no mesh and would throw there. No shipped scenario spawns anything in M1. This is a forward note for M2 (see Task 8's handoff).

---

### Task 1: Recovery tracking moves into the sim

**Files:**
- Move: `src/render/landing.ts` → `src/sim/landing.ts` (`git mv`)
- Modify: `src/sim/landing.ts` (imports, `LandingAt`, `landedAt`, the `LandingTracking` docstring)
- Modify: `src/render/frame.ts:29`, `src/render/debrief.ts:6` and `:142-146` (comment), `src/render/audio.ts:26` (comment)
- Modify: `tests/render/landing.test.ts:3,149,161,188`, `tests/render/debrief.test.ts:95,111,123`, `tests/sim/landing.test.ts:12,187`, `tests/sim/carrierLanding.test.ts:12,114`, `tests/e2e/meta-game.spec.ts:4`, `tests/e2e/meta-game-relaunch.spec.ts:4`

**Interfaces:**
- Produces: `src/sim/landing.ts` exports everything `src/render/landing.ts` did (`Touchdown`, `LandingReport`, `LandingTracking`, `NO_LANDING`, `AIRBORNE_LATCH_M`, `LANDED_SPEED_MPS`, `nextLandingTracking`), plus:
  - `export type LandingAt = { readonly kind: 'airfield' | 'carrier'; readonly id: string; readonly name: string }`
  - `LandingReport.at: LandingAt | null`
  - For an airfield, `id` is the content id and `name` the display name. For a carrier, both are the ship id.

- [ ] **Step 1: Write the failing expectations.** In `tests/render/landing.test.ts`:
  - line 149: `expect(stopped.report?.at).toEqual({ kind: 'airfield', id: 'tacloban', name: 'Tacloban' })`
  - line 188: `expect(same.report!.at).toEqual({ kind: 'carrier', id: 'cv-1', name: 'cv-1' })`
  - line 161: the fixture's `at` becomes `{ kind: 'airfield', id: 'tacloban', name: 'Tacloban' }`.

  Make the same `id` additions in `tests/render/debrief.test.ts:95` (`id: 'tacloban'`) and `:111,123` (`id: 'cv-1'`), `tests/sim/landing.test.ts:187` and `tests/sim/carrierLanding.test.ts:114`.

- [ ] **Step 2: Run to verify they fail.**

  Run: `npx vitest run tests/render/landing.test.ts --maxWorkers=2`
  Expected: FAIL. The `toEqual` calls report a missing `id`.

- [ ] **Step 3: Move the module.**

  ```bash
  git mv src/render/landing.ts src/sim/landing.ts
  ```

  In `src/sim/landing.ts`, rewrite the imports from `../sim/...` to `./...`:

  ```ts
  import { supportedContact } from './ground.js'
  import { airspeed } from './flight/model.js'
  import type { AircraftState } from './flight/state.js'
  import type { AircraftSpec } from './flight/schema.js'
  import { airfieldAt, type Airfield } from './world/airfields.js'
  import { groundUnder, type GroundUnder } from './world/ground.js'
  import { deckLocal, type Deck } from './world/deck.js'
  import type { TerrainField } from './world/terrain.js'
  import { sub, length } from './math/vec3.js'
  ```

  Replace the `LandingReport.at` field and add `LandingAt` above `LandingReport`:

  ```ts
  /** Where a landing ended. `id` is what content names (`land.at` in a
   *  mission, spec 2026-09-25 §2.1): an airfield's content id, or a carrier's
   *  ship id. `name` is what the debrief prints: the airfield's display name,
   *  or the ship id again. The two differ for airfields ("tacloban" /
   *  "Tacloban", measured 2026-09-25), which is why both are carried. */
  export type LandingAt = { readonly kind: 'airfield' | 'carrier'; readonly id: string; readonly name: string }
  ```

  ```ts
    /** Where the flight ended: the airfield whose runway the touchdown lies
     *  inside, the carrier whose deck it was arrested on, or `null` off-field.
     *  The recovery multiplier and a mission's `land` objectives read this. */
    readonly at: LandingAt | null
  ```

  Replace `landedAt`'s two return statements:

  ```ts
  function landedAt(touchdown: Touchdown, airfields: readonly Airfield[], g: GroundUnder): LandingAt | null {
    if (g.deck !== null && touchdown.deck !== null && g.deck.shipId === touchdown.deck.shipId) {
      return { kind: 'carrier', id: g.deck.shipId, name: g.deck.shipId }
    }
    const field = airfieldAt(airfields, touchdown.x, touchdown.z)
    return field === null ? null : { kind: 'airfield', id: field.id, name: field.name }
  }
  ```

  Replace the second paragraph of `LandingTracking`'s docstring ("Lives in the render layer, not `sim/`, on purpose: …" through "… Nothing in the sim changes because a landing was noticed."), which is now false, with:

  ```ts
   * In `sim/` since missions M1 (2026-09-25), and still pure: ONE function with
   * two callers. The render frame (`nextFrameState`, src/render/frame.ts) runs
   * it once per frame for the debrief; the mission engine
   * (src/sim/mission/step.ts) runs it once per tick for `land` and `takeoff`
   * objectives and the badge rule. `tests/sim/mission/recoveryAgreement.test.ts`
   * pins that the two agree on every recovery kind. No force or state in the
   * flight dynamics reads it: an `AircraftEntity`'s `impact` stops the entity,
   * a landing stops nothing.
  ```

- [ ] **Step 4: Repoint every importer.**
  - `src/render/frame.ts:29`: `import { nextLandingTracking, NO_LANDING, type LandingTracking } from '../sim/landing.js'`
  - `src/render/debrief.ts:6`: `import type { LandingReport } from '../sim/landing.js'`. In the `landingModel` docstring (`:144-146`), change "`landing.ts` names a carrier by id" to "`src/sim/landing.ts` names a carrier by its ship id".
  - `src/render/audio.ts:26`: in the comment, `` `src/render/landing.ts` `` becomes `` `src/sim/landing.ts` ``.
  - `tests/render/landing.test.ts:3`, `tests/sim/landing.test.ts:12` and `tests/sim/carrierLanding.test.ts:12`: `from '../../src/sim/landing.js'`.
  - `tests/e2e/meta-game.spec.ts:4` and `tests/e2e/meta-game-relaunch.spec.ts:4`: `import { AIRBORNE_LATCH_M } from '../../src/sim/landing.js'`.

  Then run `grep -rn "render/landing" src tests tools README.md docs/superpowers/specs`. Expected: no output. Dated handoffs may keep the old path; they are history.

- [ ] **Step 5: Run the touched files.**

  ```bash
  npx vitest run tests/render/landing.test.ts tests/render/debrief.test.ts --maxWorkers=2
  npx vitest run tests/sim/landing.test.ts tests/sim/carrierLanding.test.ts --maxWorkers=2
  ```

  Expected: PASS.

- [ ] **Step 6: Bit-identity.** Create `.superpowers/m1/digest.ts` from "Measured" if it is absent. Run `npx tsx .superpowers/m1/digest.ts 1800`. Expected: the six hashes in the baseline table, character for character.

- [ ] **Step 7: Verify and commit.**

  ```bash
  npm run verify; rc=$?; echo "rc=$rc"   # rc=0
  git add -A src/render/landing.ts src/sim/landing.ts src/render/frame.ts src/render/debrief.ts src/render/audio.ts tests/render/landing.test.ts tests/render/debrief.test.ts tests/sim/landing.test.ts tests/sim/carrierLanding.test.ts tests/e2e/meta-game.spec.ts tests/e2e/meta-game-relaunch.spec.ts
  git commit -m "M1 Task 1: landing tracking moves to src/sim/landing.ts; LandingReport.at carries the content id"
  ```

---

### Task 2: The mission vocabulary in the scenario schema

**Files:**
- Create: `src/sim/mission/schema.ts`
- Modify: `src/sim/scenario.ts`:
  - `:16-23`: the header docstring
  - `:80-105`: tags on both aircraft objects
  - `:107-157`: the ship object extracted, the held group, the new keys, `checkMission`
  - new exports `scenarioAircraftSpecIds` and `scenarioShipSpecIds`
- Modify: `src/sim/world/airfields.ts:22-32` (`BuildingObject`)
- Modify: `tools/content/load.ts:65-78`, `src/render/scenarioLoad.ts:23-52`
- Create: `tests/sim/mission/fixture.ts`, `tests/sim/mission/schema.test.ts`
- Modify: `tests/render/scenarioLoad.test.ts` (append)

**Interfaces:**
- Produces (`src/sim/mission/schema.ts`):
  - `StationObject`, `ObjectiveObject`, `TriggerObject` and `BadgeObject`
  - the types `Point`, `Station`, `Objective`, `Trigger`, `TriggerWhen`, `TriggerAction` and `Badge`
  - `Objective` is a union discriminated on `kind` (`'destroy' | 'protect' | 'deny' | 'takeoff' | 'land' | 'reach' | 'hold'`)
- Produces (`src/sim/scenario.ts`):
  - `Scenario` gains the optional fields `objectives`, `triggers`, `heldGroups` and `badge`
  - scenario aircraft and ships gain optional `tags: string[]`
  - exported types `ScenarioShip` and `ScenarioHeldGroup`
  - `scenarioAircraftSpecIds(s: Scenario): string[]` and `scenarioShipSpecIds(s: Scenario): string[]`
- Produces (`src/sim/world/airfields.ts`): `Building` gains optional `tags: string[]`.
- Produces (`tests/sim/mission/fixture.ts`): `BASE`, `scenario(patch)`, `REACH_FAR` and `flatField(heightM)`.

- [ ] **Step 1: Write the shared fixture.** Create `tests/sim/mission/fixture.ts`:

  ```ts
  import { createTerrainField, type TerrainField } from '../../../src/sim/world/terrain.js'
  import { parseTerrainHeader } from '../../../src/sim/world/schema.js'

  /**
   * One small mission world, inline so a test can read it on one screen. Not
   * shipped content (content/scenarios/ gets its missions in M3).
   *
   * - the player flies east from the origin at 3,000 m
   * - `bandit-1` (tag `raid`) flies east 20 km north of it, so the two never meet
   * - an Essex (`cv-1`) and two marus (tag `convoy`) lie at anchor
   * - Tacloban and Dulag are both loaded, so structure ids resolve
   * - no pilots: the controls are authoritative, so no AI moves anything
   *   unasked
   */
  export const BASE = {
    id: 'mission-fixture',
    player: 'f6f-1',
    airfields: ['tacloban', 'dulag'],
    aircraft: [
      { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 } },
      { id: 'bandit-1', spec: 'f6f-hellcat', tags: ['raid'], airborneAt: { position: [0, 3000, -20000], headingDeg: 90, speedMps: 120 } },
    ],
    ships: [
      { id: 'cv-1', spec: 'essex-cv', waypoints: [[-25629, -16479]], speedMps: 0 },
      { id: 'maru-1', spec: 'type-b-maru', tags: ['convoy'], waypoints: [[-25000, -10000]], speedMps: 0 },
      { id: 'maru-2', spec: 'type-b-maru', tags: ['convoy'], waypoints: [[-25000, -9000]], speedMps: 0 },
    ],
    weather: { windFromDeg: 0, windMps: 0 },
  }

  /** `BASE` with top-level keys replaced. Returns raw JSON for `parseScenario`. */
  export const scenario = (patch: Record<string, unknown>): Record<string, unknown> => ({ ...BASE, ...patch })

  /** An objective the player never completes (a station 90 km away). For
   *  tests that need a mission to exist without anything happening in it. */
  export const REACH_FAR = { id: 'far', label: 'Far', priority: 'primary', kind: 'reach', point: { x: 90000, z: 90000 }, radiusM: 100 }

  /** A terrain field flat at `heightM` over the whole 200 km box: 0 is sea,
   *  100 is land. The same construction as tests/render/landing.test.ts. */
  export function flatField(heightM: number): TerrainField {
    return createTerrainField(
      parseTerrainHeader({ centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000, finestSamples: 8193, levels: 13, encoding: 'int16-decimetres' }),
      12,
      new Int16Array(9).fill(heightM * 10),
    )
  }
  ```

- [ ] **Step 2: Write the failing schema tests.** Create `tests/sim/mission/schema.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest'
  import { parseScenario, scenarioAircraftSpecIds, scenarioShipSpecIds } from '../../../src/sim/scenario.js'
  import { parseAirfield } from '../../../src/sim/world/airfields.js'
  import { bundleForScenario, loadAirfield } from '../../../tools/content/load.js'
  import { BASE, REACH_FAR, scenario } from './fixture.js'

  const WAVE = { id: 'wave-1', aircraft: [{ id: 'raid-2', spec: 'f6f-hellcat', tags: ['raid'], airborneAt: { position: [-20000, 3000, -16479], headingDeg: 90, speedMps: 130 } }] }
  const SPAWN_WAVE = { id: 'launch', when: { at: 60 }, then: [{ spawn: 'wave-1' }] }
  const parse = (patch: Record<string, unknown>) => parseScenario(scenario(patch))

  describe('the mission vocabulary (spec 2026-09-25 §2)', () => {
    it('accepts every objective kind, every trigger condition, held groups, a badge and tags', () => {
      const s = parse({
        objectives: [
          { id: 'up', label: 'Launch', priority: 'primary', kind: 'takeoff', from: 'cv-1' },
          { id: 'gate', label: 'Gate', priority: 'primary', kind: 'reach', point: { x: 1000, z: 0 }, radiusM: 500, altitudeM: [100, 600], after: 'up' },
          { id: 'cap', label: 'CAP', priority: 'primary', kind: 'hold', point: { x: 0, z: 0 }, radiusM: 3000, seconds: 180, after: 'gate' },
          { id: 'convoy', label: 'Convoy', priority: 'primary', kind: 'destroy', targets: ['convoy'], count: 2 },
          { id: 'hangars', label: 'Hangars', priority: 'secondary', kind: 'destroy', targets: ['dulag-hangar-1'] },
          { id: 'carrier', label: 'Carrier', priority: 'primary', kind: 'protect', targets: ['cv-1'], maxLost: 0 },
          { id: 'screen', label: 'Screen', priority: 'primary', kind: 'deny', hostiles: ['raid'], around: 'cv-1', radiusM: 5000 },
          { id: 'trap', label: 'Trap', priority: 'primary', kind: 'land', at: 'cv-1', count: 3 },
        ],
        triggers: [
          SPAWN_WAVE,
          { id: 'well-done', when: { completed: 'convoy' }, then: [{ message: 'Convoy stopped' }] },
          { id: 'lost', when: { failed: 'carrier' }, then: [{ message: 'Carrier lost' }] },
          { id: 'over-dulag', when: { enters: { point: { x: -31629, z: -16479 }, radiusM: 3000 } }, then: [{ message: 'Bandits scrambling' }] },
        ],
        heldGroups: [WAVE],
        badge: { id: 'carrier-qualified', name: 'Carrier Qualified' },
        aircraft: [{ id: 'f6f-1', spec: 'f6f-hellcat', parkedAt: { ship: 'cv-1', spot: { x: 0, z: -110 } }, chocked: false }, BASE.aircraft[1]],
      })
      expect(s.objectives).toHaveLength(8)
      expect(s.heldGroups![0]!.aircraft![0]!.tags).toEqual(['raid'])
      expect(s.ships.find((sh) => sh.id === 'maru-1')!.tags).toEqual(['convoy'])
    })

    it('a scenario without objectives parses exactly as before, with no mission keys', () => {
      const s = parse({})
      expect(s.objectives).toBeUndefined()
      expect(s.triggers).toBeUndefined()
    })

    it.each([
      ['triggers without objectives', { triggers: [SPAWN_WAVE] }, /triggers need objectives/],
      ['a badge without objectives', { badge: { id: 'b', name: 'B' } }, /badge needs objectives/],
      ['a duplicate objective id', { objectives: [REACH_FAR, REACH_FAR] }, /duplicate objective id "far"/],
      ['after naming a later objective', { objectives: [{ ...REACH_FAR, after: 'near' }, { ...REACH_FAR, id: 'near' }] }, /after must name an earlier objective/],
      ['after naming nothing', { objectives: [{ ...REACH_FAR, after: 'nope' }] }, /after must name an earlier objective/],
      ['takeoff from where the player is not', { objectives: [{ id: 'up', label: 'Up', priority: 'primary', kind: 'takeoff', from: 'cv-1' }] }, /takeoff\.from must be where the player starts \(airborne\)/],
      ['land at an unknown base', { objectives: [{ id: 'home', label: 'Home', priority: 'primary', kind: 'land', at: 'henderson' }] }, /land\.at "henderson" is neither one of airfields nor a starting ship/],
      ['deny around an unknown entity', { objectives: [{ id: 'd', label: 'D', priority: 'primary', kind: 'deny', hostiles: ['raid'], around: 'cv-9', radiusM: 5000 }] }, /deny\.around "cv-9" is not a starting aircraft or ship/],
      ['an inverted altitude band', { objectives: [{ ...REACH_FAR, altitudeM: [3000, 2000] }] }, /altitudeM must be \[min, max\] with min < max/],
      ['an unknown objective key', { objectives: [{ ...REACH_FAR, radius: 5 }] }, /Unrecognized key/],
      ['an unknown objective kind', { objectives: [{ ...REACH_FAR, kind: 'escort' }] }, /kind/],
      ['a completed trigger naming nothing', { objectives: [REACH_FAR], triggers: [{ id: 't', when: { completed: 'nope' }, then: [{ message: 'x' }] }] }, /when\.completed names "nope", which is not an objective/],
      ['a failed trigger naming a kind that cannot fail', { objectives: [REACH_FAR], triggers: [{ id: 't', when: { failed: 'far' }, then: [{ message: 'x' }] }] }, /when\.failed names "far", a reach objective, which can never fail/],
      ['a spawn naming no held group', { objectives: [REACH_FAR], triggers: [{ id: 't', when: { at: 1 }, then: [{ spawn: 'wave-9' }] }] }, /spawn names "wave-9", which is not a held group/],
      ['a held group nothing spawns', { objectives: [REACH_FAR], heldGroups: [WAVE] }, /held group "wave-1" is spawned by 0 trigger actions/],
      ['a held group spawned twice', { objectives: [REACH_FAR], heldGroups: [WAVE], triggers: [SPAWN_WAVE, { ...SPAWN_WAVE, id: 'again' }] }, /held group "wave-1" is spawned by 2 trigger actions/],
      ['a held id reusing a starting id', { objectives: [REACH_FAR], triggers: [SPAWN_WAVE], heldGroups: [{ id: 'wave-1', ships: [{ id: 'maru-1', spec: 'type-b-maru', waypoints: [[0, 0]], speedMps: 0 }] }] }, /entity id "maru-1" is already used/],
      ['a parked held aircraft', { objectives: [REACH_FAR], triggers: [SPAWN_WAVE], heldGroups: [{ id: 'wave-1', aircraft: [{ id: 'raid-2', spec: 'f6f-hellcat', parkedAt: { airfield: 'dulag', spot: 'runwayCenter' }, chocked: false }] }] }, /a held aircraft must start airborne/],
      ['a held pilot targeting an unknown aircraft', { objectives: [REACH_FAR], triggers: [SPAWN_WAVE], heldGroups: [{ id: 'wave-1', aircraft: [{ ...WAVE.aircraft[0], pilot: { target: 'nobody' } }] }] }, /a held pilot must target a starting aircraft or one in its own group/],
      ['a starting pilot targeting a held aircraft', { objectives: [REACH_FAR], triggers: [SPAWN_WAVE], heldGroups: [WAVE], aircraft: [BASE.aircraft[0], { ...BASE.aircraft[1], pilot: { target: 'raid-2' } }] }, /pilot target must name an aircraft in this scenario/],
      ['an empty held group', { objectives: [REACH_FAR], triggers: [SPAWN_WAVE], heldGroups: [{ id: 'wave-1' }] }, /a held group must hold at least one aircraft or ship/],
    ])('rejects %s', (_name, patch, message) => {
      expect(() => parse(patch)).toThrow(message)
    })

    it('a held pilot may target a starting aircraft or its own groupmate', () => {
      const twoShip = { id: 'wave-1', aircraft: [{ ...WAVE.aircraft[0], pilot: { target: 'f6f-1' } }, { ...WAVE.aircraft[0], id: 'raid-3', pilot: { target: 'raid-2' } }] }
      expect(() => parse({ objectives: [REACH_FAR], triggers: [SPAWN_WAVE], heldGroups: [twoShip] })).not.toThrow()
    })

    it('an airfield building may carry tags', () => {
      const dulag = loadAirfield('dulag')
      const tagged = parseAirfield({ ...dulag, buildings: dulag.buildings.map((b) => ({ ...b, tags: ['dulag-hangars'] })) })
      expect(tagged.buildings.every((b) => b.tags?.[0] === 'dulag-hangars')).toBe(true)
      expect(() => parseAirfield({ ...dulag, buildings: dulag.buildings.map((b) => ({ ...b, tags: [] })) })).toThrow()
    })

    it('the bundle loads the specs a held group names, even ones no starting entity uses', () => {
      const s = parse({
        objectives: [REACH_FAR],
        triggers: [{ id: 't', when: { at: 1 }, then: [{ spawn: 'escort' }] }],
        heldGroups: [{ id: 'escort', ships: [{ id: 'dd-9', spec: 'fletcher-dd', waypoints: [[-24000, -9000], [-23000, -9000]], speedMps: 7 }] }],
      })
      expect(scenarioShipSpecIds(s)).toContain('fletcher-dd')
      expect(scenarioAircraftSpecIds(s)).toEqual(['f6f-hellcat', 'f6f-hellcat'])
      expect(bundleForScenario(s).shipSpecs['fletcher-dd']).toBeDefined()
    })
  })
  ```

- [ ] **Step 3: Run to verify it fails.**

  Run: `npx vitest run tests/sim/mission/schema.test.ts --maxWorkers=2`
  Expected: FAIL. The import of `scenarioAircraftSpecIds` does not exist yet, and the mission keys are rejected as unrecognized.

- [ ] **Step 4: Create `src/sim/mission/schema.ts`.**

  ```ts
  import { z } from 'zod'

  /**
   * The mission vocabulary (spec 2026-09-25 §2): what a scenario may declare
   * about objectives and triggers. Zod objects only. Cross-references (after,
   * trigger targets, held groups) are checked by `checkMission` in
   * src/sim/scenario.ts, which can see the whole scenario; ids and tags are
   * resolved to entities by src/sim/mission/create.ts when the world is built,
   * because structure tags live in the airfields' content, not in the
   * scenario file (plan ruling R4).
   *
   * `HeldGroupObject` is NOT here though spec §1 lists it (ruling R6): it
   * reuses the scenario's own aircraft and ship objects, and scenario.ts
   * imports this file, so the reverse import would be a runtime cycle.
   */

  const finite = z.number().refine(Number.isFinite, { message: 'must be a finite number' })
  const positive = finite.refine((n) => n > 0, { message: 'must be greater than zero' })
  const id = z.string().min(1)
  /** Entity ids and/or group tags; resolved when the world is built. */
  const refs = z.array(id).min(1)

  export const PointObject = z.object({ x: finite, z: finite }).strict()
  export type Point = z.infer<typeof PointObject>

  /** A circle on the ground, measured horizontally (ruling R9), optionally
   *  limited to an altitude band in world meters. */
  const stationShape = {
    point: PointObject,
    radiusM: positive,
    altitudeM: z.tuple([finite, finite])
      .refine(([lo, hi]) => lo < hi, { message: 'altitudeM must be [min, max] with min < max' })
      .optional(),
  }
  export const StationObject = z.object(stationShape).strict()
  export type Station = z.infer<typeof StationObject>

  const base = {
    id,
    /** Short: the HUD objective line and the debrief print it. */
    label: z.string().min(1),
    priority: z.enum(['primary', 'secondary']),
    /** Active only once this EARLIER objective completes (ruling R8). */
    after: id.optional(),
  }

  export const ObjectiveObject = z.discriminatedUnion('kind', [
    z.object({ ...base, kind: z.literal('destroy'), targets: refs, count: z.number().int().positive().optional() }).strict(),
    z.object({ ...base, kind: z.literal('protect'), targets: refs, maxLost: z.number().int().nonnegative().optional() }).strict(),
    z.object({ ...base, kind: z.literal('deny'), hostiles: refs, around: z.union([id, PointObject]), radiusM: positive }).strict(),
    z.object({ ...base, kind: z.literal('takeoff'), from: id }).strict(),
    z.object({ ...base, kind: z.literal('land'), at: id, count: z.number().int().positive().optional() }).strict(),
    z.object({ ...base, kind: z.literal('reach'), ...stationShape }).strict(),
    z.object({ ...base, kind: z.literal('hold'), ...stationShape, seconds: positive }).strict(),
  ])
  export type Objective = z.infer<typeof ObjectiveObject>

  export const TriggerWhenObject = z.union([
    z.object({ at: finite.refine((n) => n >= 0, { message: 'must not be negative' }) }).strict(),
    z.object({ completed: id }).strict(),
    z.object({ failed: id }).strict(),
    z.object({ enters: StationObject }).strict(),
  ])
  export type TriggerWhen = z.infer<typeof TriggerWhenObject>

  export const TriggerActionObject = z.union([
    z.object({ spawn: id }).strict(),
    z.object({ message: z.string().min(1) }).strict(),
  ])
  export type TriggerAction = z.infer<typeof TriggerActionObject>

  /** Fires once (spec §2.2). */
  export const TriggerObject = z.object({ id, when: TriggerWhenObject, then: z.array(TriggerActionObject).min(1) }).strict()
  export type Trigger = z.infer<typeof TriggerObject>

  export const BadgeObject = z.object({ id, name: z.string().min(1) }).strict()
  export type Badge = z.infer<typeof BadgeObject>
  ```

- [ ] **Step 5: Tag buildings.** In `src/sim/world/airfields.ts`, add this to `BuildingObject`'s fields after `hp: positive,`:

  ```ts
      /** Mission group tags (spec 2026-09-25 §2.1, e.g. `dulag-hangars`), so an
       *  objective can name a set of buildings. Optional; no shipped base
       *  carried any before M3. */
      tags: z.array(z.string().min(1)).min(1).optional(),
  ```

- [ ] **Step 6: Extend `src/sim/scenario.ts`.**

  1. Replace the header docstring (lines 16-23) with:

     ```ts
     /**
      * A scenario says where everything starts (spec §7). It is the data contract
      * Plan 14's map and Plan 9's mission selector read. `weather` is Plan 8's
      * (steady wind only; see `windVectorFrom`), clouds (16a) and time of day
      * (16c). A scenario that declares `objectives` is a MISSION (missions
      * design 2026-09-25): its `triggers`, `heldGroups` and `badge` are that
      * spec's, validated here by `checkMission` and run by src/sim/mission/.
      * A scenario without objectives is exactly what it was before M1.
      */
     ```

  2. Add the imports:

     ```ts
     import { BadgeObject, ObjectiveObject, TriggerObject } from './mission/schema.js'
     ```

  3. After `const id = z.string().min(1)`, add:

     ```ts
     /** Mission group tags (spec 2026-09-25 §2.1). Never copied onto an entity:
      *  src/sim/mission/create.ts reads them from the scenario when the world
      *  is built, so every entity record keeps its exact pre-M1 shape. */
     const tagList = z.array(id).min(1).optional()
     ```

  4. Add `tags: tagList,` after `chocked: z.boolean(),` in `ParkedAircraftObject`, and after `}).strict(),` (the `airborneAt` object) in `AirborneAircraftObject`.

  5. Extract the ship object out of `ScenarioObject`, keeping its doc comment, and add the held group after `ScenarioAircraftObject`:

     ```ts
     /** A ship on a closed waypoint loop, OR -- when `speedMps` is 0 -- a single
      *  anchored point (Plan 6b's maru): the loop-closing second waypoint has no
      *  meaning for a ship that never moves, so only a moving ship needs two. */
     const ScenarioShipObject = z.object({
       id,
       spec: id,
       waypoints: z.array(z.tuple([finite, finite])).min(1),
       speedMps: finite,
       tags: tagList,
     }).strict().refine((s) => s.speedMps === 0 || s.waypoints.length >= 2, {
       message: 'waypoints must have at least 2 entries unless speedMps is 0', path: ['waypoints'],
     })

     /** Entities not placed at start (spec §2.3); a trigger's `spawn` brings the
      *  group in mid-flight through `spawnHeldGroup`. Same entity schema as the
      *  scenario's own lists; `checkMission` requires held aircraft to start
      *  airborne (plan ruling R3). */
     const HeldGroupObject = z.object({
       id,
       aircraft: z.array(ScenarioAircraftObject).optional(),
       ships: z.array(ScenarioShipObject).optional(),
     }).strict().refine((g) => (g.aircraft?.length ?? 0) + (g.ships?.length ?? 0) > 0, {
       message: 'a held group must hold at least one aircraft or ship',
     })
     ```

  6. Rename `const ScenarioObject = z.object({` to `const ScenarioShape = z.object({`. In it:
     - `ships: z.array(z.object({ … })),` becomes `ships: z.array(ScenarioShipObject),`
     - before `weather`, add:

     ```ts
       /** Missions (spec 2026-09-25 §2). Present together or not at all:
        *  `checkMission` rejects triggers, held groups or a badge without
        *  objectives. */
       objectives: z.array(ObjectiveObject).min(1).optional(),
       triggers: z.array(TriggerObject).min(1).optional(),
       heldGroups: z.array(HeldGroupObject).min(1).optional(),
       badge: BadgeObject.optional(),
     ```

     Close it with `}).strict()`. Then start the refined object with the existing `.refine` and `.superRefine` chain unchanged, plus one more:

     ```ts
     const ScenarioObject = ScenarioShape
       .refine((s) => (s.enemyAirfields ?? []).every((e) => s.airfields.includes(e)), {
         message: 'every enemyAirfields entry must be one of airfields', path: ['enemyAirfields'],
       })
       .superRefine((s, ctx) => {
         // ... the existing pilot-target check, unchanged ...
       })
       .superRefine(checkMission)
     ```

  7. After the `isShipParked` export, add the types, the check and the spec-id helpers. `checkMission` is a function declaration and is only called at parse time, so its use above its definition is safe.

     ```ts
     export type ScenarioShip = z.infer<typeof ScenarioShipObject>
     export type ScenarioHeldGroup = z.infer<typeof HeldGroupObject>

     /**
      * Every mission reference checkable from the file alone (spec 2026-09-25
      * §2; plan rulings R3, R8, R11). Ids and tags that name ENTITIES are
      * resolved later, by src/sim/mission/create.ts, when the airfields'
      * buildings are in hand (ruling R4).
      */
     function checkMission(s: z.infer<typeof ScenarioShape>, ctx: z.RefinementCtx): void {
       const issue = (message: string, path: (string | number)[]): void => {
         ctx.addIssue({ code: z.ZodIssueCode.custom, message, path })
       }
       if (s.objectives === undefined) {
         if (s.triggers !== undefined) issue('triggers need objectives: a scenario without objectives is not a mission', ['triggers'])
         if (s.heldGroups !== undefined) issue('heldGroups need objectives: a scenario without objectives is not a mission', ['heldGroups'])
         if (s.badge !== undefined) issue('badge needs objectives: a scenario without objectives is not a mission', ['badge'])
         return
       }
       const objectives = s.objectives
       const triggers = s.triggers ?? []
       const held = s.heldGroups ?? []
       const dupes = (ids: readonly string[], what: string, key: string): void => {
         ids.forEach((x, i) => { if (ids.indexOf(x) !== i) issue(`duplicate ${what} id "${x}"`, [key, i, 'id']) })
       }
       dupes(objectives.map((o) => o.id), 'objective', 'objectives')
       dupes(triggers.map((t) => t.id), 'trigger', 'triggers')
       dupes(held.map((g) => g.id), 'held group', 'heldGroups')

       const startAircraft = new Set(s.aircraft.map((a) => a.id))
       const startShips = new Set(s.ships.map((sh) => sh.id))
       const used = new Set([...startAircraft, ...startShips])
       for (const [gi, g] of held.entries()) {
         const groupAircraft = new Set((g.aircraft ?? []).map((a) => a.id))
         for (const [ai, a] of (g.aircraft ?? []).entries()) {
           const path = ['heldGroups', gi, 'aircraft', ai]
           if (used.has(a.id)) issue(`entity id "${a.id}" is already used; ids are unique across the whole scenario`, [...path, 'id'])
           used.add(a.id)
           if (isParkedAircraft(a)) issue('a held aircraft must start airborne (airborneAt), plan ruling R3', [...path, 'parkedAt'])
           const target = a.pilot?.target
           if (target !== undefined && (target === a.id || (!startAircraft.has(target) && !groupAircraft.has(target)))) {
             issue('a held pilot must target a starting aircraft or one in its own group', [...path, 'pilot', 'target'])
           }
         }
         for (const [si, sh] of (g.ships ?? []).entries()) {
           if (used.has(sh.id)) issue(`entity id "${sh.id}" is already used; ids are unique across the whole scenario`, ['heldGroups', gi, 'ships', si, 'id'])
           used.add(sh.id)
         }
       }

       const player = s.aircraft.find((a) => a.id === s.player)
       const playerStart = player !== undefined && isParkedAircraft(player)
         ? (isShipParked(player.parkedAt) ? player.parkedAt.ship : player.parkedAt.airfield)
         : null
       objectives.forEach((o, i) => {
         const path = ['objectives', i]
         if (o.after !== undefined && !objectives.slice(0, i).some((x) => x.id === o.after)) {
           issue(`after must name an earlier objective; "${o.after}" is not one`, [...path, 'after'])
         }
         if (o.kind === 'takeoff' && o.from !== playerStart) {
           issue(`takeoff.from must be where the player starts (${playerStart ?? 'airborne'}), not "${o.from}"`, [...path, 'from'])
         }
         if (o.kind === 'land' && !s.airfields.includes(o.at) && !startShips.has(o.at)) {
           issue(`land.at "${o.at}" is neither one of airfields nor a starting ship`, [...path, 'at'])
         }
         if (o.kind === 'deny' && typeof o.around === 'string' && !startAircraft.has(o.around) && !startShips.has(o.around)) {
           issue(`deny.around "${o.around}" is not a starting aircraft or ship`, [...path, 'around'])
         }
       })

       const byId = new Map(objectives.map((o) => [o.id, o]))
       const spawnCount = new Map(held.map((g) => [g.id, 0]))
       triggers.forEach((t, i) => {
         const path = ['triggers', i]
         if ('completed' in t.when && !byId.has(t.when.completed)) {
           issue(`when.completed names "${t.when.completed}", which is not an objective`, [...path, 'when', 'completed'])
         }
         if ('failed' in t.when) {
           const o = byId.get(t.when.failed)
           if (o === undefined) issue(`when.failed names "${t.when.failed}", which is not an objective`, [...path, 'when', 'failed'])
           else if (o.kind !== 'protect' && o.kind !== 'deny') issue(`when.failed names "${o.id}", a ${o.kind} objective, which can never fail`, [...path, 'when', 'failed'])
         }
         t.then.forEach((a, ai) => {
           if (!('spawn' in a)) return
           const n = spawnCount.get(a.spawn)
           if (n === undefined) issue(`spawn names "${a.spawn}", which is not a held group`, [...path, 'then', ai, 'spawn'])
           else spawnCount.set(a.spawn, n + 1)
         })
       })
       held.forEach((g, gi) => {
         const n = spawnCount.get(g.id) ?? 0
         if (n !== 1) issue(`held group "${g.id}" is spawned by ${n} trigger actions; it must be exactly one`, ['heldGroups', gi, 'id'])
       })
     }

     /** Every aircraft spec a scenario can put in the world, held groups
      *  included: both loaders (tools/content/load.ts and its browser twin
      *  src/render/scenarioLoad.ts) fetch exactly these. */
     export const scenarioAircraftSpecIds = (s: Scenario): string[] =>
       [...s.aircraft, ...(s.heldGroups ?? []).flatMap((g) => g.aircraft ?? [])].map((a) => a.spec)

     /** The ship twin of `scenarioAircraftSpecIds`. */
     export const scenarioShipSpecIds = (s: Scenario): string[] =>
       [...s.ships, ...(s.heldGroups ?? []).flatMap((g) => g.ships ?? [])].map((sh) => sh.spec)
     ```

- [ ] **Step 7: Both loaders read the helpers.**
  - In `tools/content/load.ts` `bundleForScenario`, `table(scenario.aircraft.map((a) => a.spec), loadAircraftSpec)` becomes `table(scenarioAircraftSpecIds(scenario), loadAircraftSpec)`.
  - `table(scenario.ships.map((s) => s.spec), loadShipSpec)` becomes `table(scenarioShipSpecIds(scenario), loadShipSpec)`.
  - Add both names to the import from `../../src/sim/scenario.js`.
  - Make the same two replacements in `src/render/scenarioLoad.ts` (the arguments `aircraftUrl, parseAircraftSpec` and `shipUrl, parseShipSpec` are unchanged), and add the two names to its import.

- [ ] **Step 8: The browser twin loads held specs too.** Append to `tests/render/scenarioLoad.test.ts`, inside its `describe`:

  ```ts
    it('loads the specs a held group names (missions M1)', async () => {
      const heldScenario = {
        id: 'held-twin', player: 'f6f-1', airfields: ['tacloban'],
        aircraft: [{ id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 } }],
        ships: [],
        weather: { windFromDeg: 0, windMps: 0 },
        objectives: [{ id: 'far', label: 'Far', priority: 'primary', kind: 'reach', point: { x: 90000, z: 90000 }, radiusM: 100 }],
        triggers: [{ id: 't', when: { at: 1 }, then: [{ spawn: 'escort' }] }],
        heldGroups: [{ id: 'escort', ships: [{ id: 'dd-9', spec: 'fletcher-dd', waypoints: [[-24000, -9000], [-23000, -9000]], speedMps: 7 }] }],
      }
      const withHeld: typeof fetch = async (input) =>
        String(input).endsWith('scenarios/held-twin.json') ? new Response(JSON.stringify(heldScenario), { status: 200 }) : diskFetch(input)
      const bundle = await loadScenarioBundle('held-twin', withHeld)
      expect(Object.keys(bundle.shipSpecs)).toEqual(['fletcher-dd'])
    })
  ```

- [ ] **Step 9: Run the touched tests.**

  ```bash
  npx vitest run tests/sim/mission/schema.test.ts tests/render/scenarioLoad.test.ts --maxWorkers=2
  npx vitest run tests/sim/scenario.test.ts tests/sim/world/airfields.test.ts --maxWorkers=2
  ```

  Expected: PASS.

- [ ] **Step 10: Verify and commit.**

  ```bash
  npm run verify; rc=$?; echo "rc=$rc"   # rc=0
  git add src/sim/mission/schema.ts src/sim/scenario.ts src/sim/world/airfields.ts tools/content/load.ts src/render/scenarioLoad.ts tests/sim/mission/fixture.ts tests/sim/mission/schema.test.ts tests/render/scenarioLoad.test.ts
  git commit -m "M1 Task 2: the mission vocabulary in the scenario schema, checked at parse"
  ```

---

### Task 3: `MissionState`, reference resolution, and `World.mission`

**Files:**
- Create: `src/sim/mission/state.ts`, `src/sim/mission/create.ts`
- Modify: `src/sim/loop.ts`:
  - `:351-414`: the `World` interface
  - `:503-576`: `createWorldOf`
- Modify: `src/sim/scenario.ts:241-324`: `buildShip` and `buildAircraft` extracted; held templates, entity tags and the mission built
- Create: `tests/sim/mission/create.test.ts`, `tests/sim/mission/content.test.ts`
- Modify: `tests/sim/mission/fixture.ts` (append)

**Interfaces:**
- Consumes: Task 2's `Objective`, `Trigger`, `Badge`, `Scenario` and `ScenarioShip`, and Task 1's `LandingTracking`, `LandingAt` and `NO_LANDING`.
- Produces (`src/sim/mission/state.ts`):
  - `ticksFor(seconds: number): number`
  - `ObjectiveStatus`
  - `ObjectiveState = { status, count, heldTicks }`
  - `ResolvedObjective = Objective & { resolved: readonly EntityId[] }`
  - `HeldGroup<M> = { id, aircraft: readonly AircraftEntity<M>[], ships: readonly ShipEntity[] }`
  - `MissionLogEntry`, a union over `kind`: `'objective' | 'trigger' | 'spawn' | 'message' | 'landing'`
  - `MissionState<M>`
  - `radioMessages(m)` and `lastLanding(m)`
- Produces (`src/sim/mission/create.ts`):
  - `Taggable = { id, tags }`
  - `resolveRefs(scenarioId, where, refs, entities): EntityId[]`
  - `createMission<M>(input): MissionState<M>`
- Produces (`src/sim/loop.ts`): `World<M>.mission: MissionState<M> | null`, and `createWorldOf`'s optional `mission` part.
- Produces (fixture): `missionWorld(patch, terrain?)`, `steps(world, n)`, `progressOf(world, id)`, and `deepFreeze`.

- [ ] **Step 1: Extend the fixture.** Append to `tests/sim/mission/fixture.ts`, and add to its imports:

  ```ts
  import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
  import { bundleForScenario } from '../../../tools/content/load.js'
  import { advance, type World } from '../../../src/sim/loop.js'
  import { DT } from '../../../src/sim/flight/model.js'
  import type { ObjectiveState } from '../../../src/sim/mission/state.js'

  /** The world `worldFromScenario` builds for `BASE` + `patch`. */
  export function missionWorld(patch: Record<string, unknown>, terrain: TerrainField | null = null): World<undefined> {
    return worldFromScenario(bundleForScenario(parseScenario(scenario(patch))), terrain)
  }

  /** `n` production ticks, one `advance(world, DT)` each. */
  export function steps<M>(world: World<M>, n: number): World<M> {
    let w = world
    for (let i = 0; i < n; i++) w = advance(w, DT).world
    return w
  }

  export function progressOf<M>(world: World<M>, id: string): ObjectiveState {
    const m = world.mission!
    return m.progress[m.objectives.findIndex((o) => o.id === id)]!
  }

  /** As tests/sim/loop.test.ts: `advance` must not write into what it is handed. */
  export function deepFreeze<T>(value: T): T {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value) && !ArrayBuffer.isView(value)) {
      Object.freeze(value)
      for (const key of Object.getOwnPropertyNames(value)) deepFreeze((value as Record<string, unknown>)[key])
    }
    return value
  }
  ```

- [ ] **Step 2: Write the failing tests.** Create `tests/sim/mission/create.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest'
  import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
  import { bundleForScenario } from '../../../tools/content/load.js'
  import { ticksFor } from '../../../src/sim/mission/state.js'
  import { NO_LANDING } from '../../../src/sim/landing.js'
  import { BASE, REACH_FAR, missionWorld, scenario } from './fixture.js'

  const destroy = (targets: string[], count?: number) =>
    ({ id: 'kill', label: 'Kill', priority: 'primary', kind: 'destroy', targets, ...(count === undefined ? {} : { count }) })

  describe('createMission (spec 2026-09-25 §1, §2)', () => {
    it('a scenario without objectives gets no mission', () => {
      expect(missionWorld({}).mission).toBeNull()
    })

    it('resolves ids and tags, across ships, aircraft and airfield structures, in first-seen order', () => {
      const w = missionWorld({ objectives: [destroy(['convoy', 'dulag-hangar-2', 'raid', 'maru-1'])] })
      expect(w.mission!.objectives[0]!.resolved).toEqual(['maru-1', 'maru-2', 'dulag-hangar-2', 'bandit-1'])
    })

    it('resolves a structure tag carried by the base content', () => {
      const bundle = bundleForScenario(parseScenario(scenario({ objectives: [destroy(['dulag-hangars'])] })))
      const dulag = bundle.airfields['dulag']!
      const tagged = { ...bundle, airfields: { ...bundle.airfields, dulag: { ...dulag, buildings: dulag.buildings.map((b) => ({ ...b, tags: ['dulag-hangars'] })) } } }
      expect(worldFromScenario(tagged, null).mission!.objectives[0]!.resolved).toEqual(['dulag-hangar-1', 'dulag-hangar-2'])
    })

    it('fails the load when a tag or id matches nothing (spec §2.1: a parse error, not an empty set)', () => {
      expect(() => missionWorld({ objectives: [destroy(['dulag-aaa'])] }))
        .toThrow('scenario "mission-fixture": objective "kill" names "dulag-aaa", which matches no entity id or tag')
    })

    it('fails the load when a string is both an id and a tag', () => {
      const aircraft = [BASE.aircraft[0], { ...BASE.aircraft[1], tags: ['maru-1'] }]
      expect(() => missionWorld({ aircraft, objectives: [destroy(['maru-1'])] }))
        .toThrow('objective "kill" names "maru-1", which is both an entity id and a tag')
    })

    it('fails the load when destroy asks for more than exist', () => {
      expect(() => missionWorld({ objectives: [destroy(['convoy'], 3)] })).toThrow('objective "kill" asks for 3 of 2 targets')
    })

    it('fails the load when land.at names a ship with no flight deck', () => {
      expect(() => missionWorld({ objectives: [{ id: 'home', label: 'Home', priority: 'primary', kind: 'land', at: 'maru-1' }] }))
        .toThrow('objective "home" lands on "maru-1", which has no flight deck')
    })

    it('a held entity resolves before it exists', () => {
      const w = missionWorld({
        objectives: [destroy(['raid'])],
        triggers: [{ id: 'launch', when: { at: 60 }, then: [{ spawn: 'wave-1' }] }],
        heldGroups: [{ id: 'wave-1', aircraft: [{ id: 'raid-2', spec: 'f6f-hellcat', tags: ['raid'], airborneAt: { position: [-20000, 3000, -16479], headingDeg: 90, speedMps: 130 } }] }],
      })
      expect(w.mission!.objectives[0]!.resolved).toEqual(['bandit-1', 'raid-2'])
      expect(w.aircraft.map((a) => a.id)).toEqual(['f6f-1', 'bandit-1'])
      expect(w.mission!.held[0]!.aircraft[0]!.id).toBe('raid-2')
      expect(w.combat.aircraft['raid-2']).toBeUndefined()
    })

    it('starts every objective active unless it waits on another, with nothing logged', () => {
      const w = missionWorld({ objectives: [REACH_FAR, { ...REACH_FAR, id: 'next', after: 'far' }], badge: { id: 'b', name: 'B' } })
      const m = w.mission!
      expect(m.progress).toEqual([
        { status: 'active', count: 0, heldTicks: 0 },
        { status: 'inactive', count: 0, heldTicks: 0 },
      ])
      expect(m.badge).toEqual({ id: 'b', name: 'B' })
      expect(m.recovery).toBe(NO_LANDING)
      expect(m.log).toEqual([])
      expect(m.fired).toEqual([])
      expect(m.spawned).toEqual([])
    })

    it('a mission world survives structuredClone, as every World must', () => {
      const w = missionWorld({ objectives: [REACH_FAR] })
      expect(structuredClone(w)).toEqual(w)
    })
  })

  describe('ticksFor (plan ruling R10)', () => {
    it('counts whole ticks, rounding up, without float drift', () => {
      expect(ticksFor(180)).toBe(10800)
      expect(ticksFor(60)).toBe(3600)
      expect(ticksFor(0.5)).toBe(30)
      expect(ticksFor(0.001)).toBe(1)
      expect(ticksFor(0)).toBe(0)
    })
  })
  ```

  Create `tests/sim/mission/content.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest'
  import { readdirSync } from 'node:fs'
  import { worldFromScenario } from '../../../src/sim/scenario.js'
  import { loadScenarioBundle } from '../../../tools/content/load.js'

  const IDS = readdirSync(new URL('../../../content/scenarios/', import.meta.url))
    .filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()

  /** Spec 2026-09-25 §5: "Every scenario file parses; every tag and objective
   *  reference resolves." Resolution happens at world build (plan ruling R4),
   *  so this builds every shipped scenario, missions included once M3 adds
   *  them, on every run. */
  describe('every shipped scenario', () => {
    it('is found (six before M3)', () => {
      expect(IDS.length).toBeGreaterThanOrEqual(6)
    })

    it.each(IDS)('%s builds, and has a mission exactly when it declares objectives', (id) => {
      const bundle = loadScenarioBundle(id)
      const world = worldFromScenario(bundle, null)
      expect(world.mission === null).toBe(bundle.scenario.objectives === undefined)
    })
  })
  ```

- [ ] **Step 3: Run to verify they fail.**

  Run: `npx vitest run tests/sim/mission/create.test.ts tests/sim/mission/content.test.ts --maxWorkers=2`
  Expected: FAIL. `src/sim/mission/state.js` does not exist, and `world.mission` is `undefined`.

- [ ] **Step 4: Create `src/sim/mission/state.ts`.**

  ```ts
  import { DT } from '../flight/model.js'
  import type { LandingAt, LandingTracking } from '../landing.js'
  import type { AircraftEntity, EntityId, ShipEntity } from '../loop.js'
  import type { Badge, Objective, Trigger } from './schema.js'

  /**
   * A mission in flight (spec 2026-09-25 §1): the resolved definition, which
   * never changes, plus the progress `stepMission` advances once per tick.
   * Plain data, so a `World` holding it is still the whole flight under
   * `structuredClone` (tests/sim/mission/create.test.ts).
   *
   * Imports `loop.js` for TYPES only: loop.ts imports the mission step at
   * runtime, and `.dependency-cruiser.cjs`'s `no-circular` sees runtime edges.
   */

  /** Far below one tick (1/60 s), far above float noise: 60 / DT is exactly
   *  3600 in IEEE doubles (measured 2026-09-25, node v22.22.1). */
  const TICK_EPSILON = 1e-6

  /** Whole ticks in `seconds`, rounded up (plan ruling R10). `hold` and
   *  `when.at` count ticks, not summed seconds: adding DT 10,800 times gives
   *  180.00000000003539 (measured 2026-09-25). */
  export const ticksFor = (seconds: number): number => Math.ceil(seconds / DT - TICK_EPSILON)

  export type ObjectiveStatus = 'inactive' | 'active' | 'complete' | 'failed'

  export type ObjectiveState = {
    readonly status: ObjectiveStatus
    /** destroy: targets destroyed; protect: targets lost; land: landings
     *  counted. 0 for every other kind. */
    readonly count: number
    /** hold: ticks spent inside the station while active, accumulated
     *  (spec §0.9). 0 for every other kind. */
    readonly heldTicks: number
  }

  /** An objective with its `targets`/`hostiles` resolved to entity ids when
   *  the world was built. `[]` for kinds with no entity set. */
  export type ResolvedObjective = Objective & { readonly resolved: readonly EntityId[] }

  /** A held group's entities, built at world creation exactly as
   *  `worldFromScenario` builds start entities, at tick 0. `spawnInto`
   *  restamps the tick. Held aircraft are airborne (plan ruling R3), so
   *  nothing in them depends on when they spawn. */
  export type HeldGroup<M> = {
    readonly id: string
    readonly aircraft: readonly AircraftEntity<M>[]
    readonly ships: readonly ShipEntity[]
  }

  /** One line of the mission's history, tick-stamped. The log is what M2's
   *  radio line and debrief read, and what the determinism test compares. */
  export type MissionLogEntry =
    | { readonly tick: number; readonly kind: 'objective'; readonly id: string; readonly status: 'complete' | 'failed' }
    | { readonly tick: number; readonly kind: 'trigger'; readonly id: string }
    | { readonly tick: number; readonly kind: 'spawn'; readonly group: string }
    | { readonly tick: number; readonly kind: 'message'; readonly text: string }
    | {
        readonly tick: number
        readonly kind: 'landing'
        readonly at: LandingAt | null
        /** The first `land` objective this landing advanced, or `null`. */
        readonly advanced: string | null
        /** It advanced a `land` objective that is still incomplete (spec §2.4
         *  "Intermediate landings": a radio line, no debrief). */
        readonly intermediate: boolean
      }

  export type MissionState<M> = {
    readonly scenarioId: string
    readonly objectives: readonly ResolvedObjective[]
    readonly triggers: readonly Trigger[]
    readonly badge: Badge | null
    readonly held: readonly HeldGroup<M>[]
    /** Parallel to `objectives`. */
    readonly progress: readonly ObjectiveState[]
    /** Trigger ids in the order they fired; each fires once (spec §2.2). */
    readonly fired: readonly string[]
    /** Held group ids in the order they spawned. */
    readonly spawned: readonly string[]
    /** The player's landing tracker, stepped per tick (plan ruling R1) and
     *  reset to `NO_LANDING` after each landing it records. */
    readonly recovery: LandingTracking
    readonly log: readonly MissionLogEntry[]
  }

  type Message = Extract<MissionLogEntry, { kind: 'message' }>
  type Landing = Extract<MissionLogEntry, { kind: 'landing' }>

  /** The radio line's source (plan ruling R7): every message, oldest first. */
  export const radioMessages = <M>(m: MissionState<M>): readonly Message[] =>
    m.log.filter((e): e is Message => e.kind === 'message')

  /** The most recent landing the mission recorded, if any. */
  export function lastLanding<M>(m: MissionState<M>): Landing | undefined {
    for (let i = m.log.length - 1; i >= 0; i--) {
      const e = m.log[i]!
      if (e.kind === 'landing') return e
    }
    return undefined
  }
  ```

- [ ] **Step 5: Create `src/sim/mission/create.ts`.**

  ```ts
  import { NO_LANDING } from '../landing.js'
  import type { EntityId } from '../loop.js'
  import type { Badge, Objective, Trigger } from './schema.js'
  import type { HeldGroup, MissionState, ObjectiveState, ResolvedObjective } from './state.js'

  /** Anything an objective may name: an aircraft or ship (start or held) or
   *  an airfield structure, with its group tags. */
  export type Taggable = { readonly id: EntityId; readonly tags: readonly string[] }

  /**
   * `refs` (entity ids and/or tags) to entity ids, deduplicated in first-seen
   * order. Throws, naming the scenario and the string, for a string that
   * matches nothing (spec §2.1: "a parse error, not a silent empty set") or
   * that is both an id and a tag (Review Focus 2).
   */
  export function resolveRefs(scenarioId: string, where: string, refs: readonly string[], entities: readonly Taggable[]): EntityId[] {
    const out: EntityId[] = []
    for (const ref of refs) {
      const byId = entities.some((e) => e.id === ref)
      const byTag = entities.filter((e) => e.tags.includes(ref)).map((e) => e.id)
      if (byId && byTag.length > 0) throw new Error(`scenario "${scenarioId}": ${where} names "${ref}", which is both an entity id and a tag`)
      const hits = byId ? [ref] : byTag
      if (hits.length === 0) throw new Error(`scenario "${scenarioId}": ${where} names "${ref}", which matches no entity id or tag`)
      for (const h of hits) if (!out.includes(h)) out.push(h)
    }
    return out
  }

  export function createMission<M>(input: {
    readonly scenarioId: string
    readonly objectives: readonly Objective[]
    readonly triggers: readonly Trigger[]
    readonly badge: Badge | null
    readonly held: readonly HeldGroup<M>[]
    readonly entities: readonly Taggable[]
  }): MissionState<M> {
    const resolve = (where: string, refs: readonly string[]) => resolveRefs(input.scenarioId, where, refs, input.entities)
    const objectives: ResolvedObjective[] = input.objectives.map((o) => {
      const where = `objective "${o.id}"`
      switch (o.kind) {
        case 'destroy': {
          const resolved = resolve(where, o.targets)
          if (o.count !== undefined && o.count > resolved.length) {
            throw new Error(`scenario "${input.scenarioId}": ${where} asks for ${o.count} of ${resolved.length} targets`)
          }
          return { ...o, resolved }
        }
        case 'protect': return { ...o, resolved: resolve(where, o.targets) }
        case 'deny': return { ...o, resolved: resolve(where, o.hostiles) }
        default: return { ...o, resolved: [] }
      }
    })
    return {
      scenarioId: input.scenarioId,
      objectives,
      triggers: input.triggers,
      badge: input.badge,
      held: input.held,
      // Annotated: without it the literal widens to `string` inside `map`.
      progress: objectives.map((o): ObjectiveState => ({ status: o.after === undefined ? 'active' : 'inactive', count: 0, heldTicks: 0 })),
      fired: [],
      spawned: [],
      recovery: NO_LANDING,
      log: [],
    }
  }
  ```

- [ ] **Step 6: `World.mission`.** In `src/sim/loop.ts`:
  - Add `import type { MissionState } from './mission/state.js'`.
  - In `interface World<M>`, before `accumulatorSeconds`, add:

  ```ts
    /**
     * The mission in flight (spec 2026-09-25 §1), or `null` for a scenario
     * with no objectives. `null` selects the exact pre-M1 code path in
     * `advance`: the per-tick mission hook is skipped, not run as a no-op,
     * which is what the bit-identity gate (the digest probe in
     * docs/superpowers/plans/2026-09-25-m1-mission-engine.md) measures.
     */
    readonly mission: MissionState<M> | null
  ```

  - In `createWorldOf`'s `parts`, after `enemyAirfields`, add:

  ```ts
    /** The mission, built by `worldFromScenario` when its scenario declares
     *  objectives. Absent means `null`, matching every world built before M1
     *  and every call site but `worldFromScenario`. */
    readonly mission?: MissionState<M> | null
  ```

  - In its returned object, after `wind: parts.wind ?? null,`, add `mission: parts.mission ?? null,`.

- [ ] **Step 7: Build the mission in `worldFromScenario`.** In `src/sim/scenario.ts`:

  1. Add the imports:

     ```ts
     import { createMission, type Taggable } from './mission/create.js'
     import type { HeldGroup, MissionState } from './mission/state.js'
     ```

  2. Move the two `.map` bodies out of `worldFromScenario` **verbatim** into two functions above it. Keep every comment inside them.
     - `buildShip(bundle: ScenarioBundle, sh: ScenarioShip, terrain: TerrainField | null): ShipEntity` holds the ship body. It reads `bundle`, `sh` and `terrain`.
     - `buildAircraft(bundle: ScenarioBundle, a: ScenarioAircraft, ships: readonly ShipEntity[]): AircraftEntity<undefined>` holds the aircraft body. It reads `bundle`, `a` and `ships`.
     - In `worldFromScenario` the two lists become `const ships: ShipEntity[] = s.ships.map((sh) => buildShip(bundle, sh, terrain))` and `const aircraft: AircraftEntity<undefined>[] = s.aircraft.map((a) => buildAircraft(bundle, a, ships))`.

  3. Add `missionEntities` beside them:

     ```ts
     /** Everything a mission objective may name (spec §2.1): start and held
      *  aircraft and ships with their scenario tags, and every building of the
      *  scenario's `airfields` (the ones `buildStructures` turns into world
      *  structures) with its base-content tags. */
     function missionEntities(bundle: ScenarioBundle): Taggable[] {
       const s = bundle.scenario
       const heldAircraft = (s.heldGroups ?? []).flatMap((g) => g.aircraft ?? [])
       const heldShips = (s.heldGroups ?? []).flatMap((g) => g.ships ?? [])
       const buildings = s.airfields.flatMap((a) => lookup(bundle.airfields, a, 'airfield').buildings)
       return [...s.aircraft, ...heldAircraft, ...s.ships, ...heldShips, ...buildings]
         .map((e) => ({ id: e.id, tags: e.tags ?? [] }))
     }
     ```

  4. At the end of `worldFromScenario`, replace the `return createWorldOf({ … })` with:

     ```ts
       // Missions (spec 2026-09-25). Held groups are built NOW, by the same
       // functions as the start entities, so a spawn is exactly what
       // `worldFromScenario` would have built (spec §1); a scenario without
       // objectives builds none of this and passes `mission: null`.
       let mission: MissionState<undefined> | null = null
       if (s.objectives !== undefined) {
         for (const o of s.objectives) {
           if (o.kind !== 'land') continue
           const ship = ships.find((sh) => sh.id === o.at)
           if (ship !== undefined && deckOf(ship) === null) {
             throw new Error(`scenario "${s.id}": objective "${o.id}" lands on "${o.at}", which has no flight deck`)
           }
         }
         const held: HeldGroup<undefined>[] = (s.heldGroups ?? []).map((g) => ({
           id: g.id,
           aircraft: (g.aircraft ?? []).map((a) => buildAircraft(bundle, a, ships)),
           ships: (g.ships ?? []).map((sh) => buildShip(bundle, sh, terrain)),
         }))
         mission = createMission<undefined>({
           scenarioId: s.id,
           objectives: s.objectives,
           triggers: s.triggers ?? [],
           badge: s.badge ?? null,
           held,
           entities: missionEntities(bundle),
         })
       }
       return createWorldOf({ aircraft, ships, player: s.player, airfields, terrain, wind, stores, enemyAirfields: s.enemyAirfields, mission })
     ```

- [ ] **Step 8: Run the tests.**

  ```bash
  npx vitest run tests/sim/mission/create.test.ts tests/sim/mission/content.test.ts --maxWorkers=2
  npx vitest run tests/sim/scenario.test.ts tests/sim/loop.test.ts --maxWorkers=2
  ```

  Expected: PASS.

- [ ] **Step 9: Bit-identity.** Run `npx tsx .superpowers/m1/digest.ts 1800`. Expected: the six baseline hashes, unchanged.

- [ ] **Step 10: Verify and commit.**

  ```bash
  npm run verify; rc=$?; echo "rc=$rc"   # rc=0
  git add src/sim/mission/state.ts src/sim/mission/create.ts src/sim/loop.ts src/sim/scenario.ts tests/sim/mission/fixture.ts tests/sim/mission/create.test.ts tests/sim/mission/content.test.ts
  git commit -m "M1 Task 3: MissionState, load-time reference resolution, World.mission"
  ```

---

### Task 4: `spawnHeldGroup`, the one mid-flight insertion path

**Files:**
- Create: `src/sim/mission/spawn.ts`
- Create: `tests/sim/mission/spawn.test.ts`

**Interfaces:**
- Consumes: `MissionState`, `HeldGroup` (Task 3), and `createCombat` from `src/sim/weapons/combat.ts`.
- Produces:
  - `SpawnParts<M> = { tick, aircraft, ships, combat, mission }`
  - `spawnInto<M>(parts: SpawnParts<M>, groupId: string): SpawnParts<M>`
  - `spawnHeldGroup<M>(world: World<M>, groupId: string): World<M>`
  - Spawned entities are **appended** after the existing ones, so every existing index is unchanged.
  - Throws on an unknown group, a group that has already spawned, and a world with no mission.

- [ ] **Step 1: Write the failing tests.** Create `tests/sim/mission/spawn.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest'
  import { spawnHeldGroup } from '../../../src/sim/mission/spawn.js'
  import { aircraftById } from '../../../src/sim/loop.js'
  import { BASE, REACH_FAR, missionWorld, steps } from './fixture.js'

  const RAID_2 = { id: 'raid-2', spec: 'f6f-hellcat', tags: ['raid'], airborneAt: { position: [-20000, 3000, -16479], headingDeg: 90, speedMps: 130 }, pilot: { target: 'f6f-1' } }
  const DD_9 = { id: 'dd-9', spec: 'fletcher-dd', waypoints: [[-24000, -9000], [-23000, -9000]], speedMps: 7 }
  const HELD = {
    objectives: [REACH_FAR],
    // Far in the future, so a direct spawn below never collides with it.
    triggers: [{ id: 'launch', when: { at: 100000 }, then: [{ spawn: 'wave-1' }] }],
    heldGroups: [{ id: 'wave-1', aircraft: [RAID_2], ships: [DD_9] }],
  }

  describe('spawnHeldGroup (spec 2026-09-25 §1)', () => {
    it('builds exactly what worldFromScenario builds for the same entity at start', () => {
      const spawned = spawnHeldGroup(missionWorld(HELD), 'wave-1')
      const atStart = missionWorld({ aircraft: [...BASE.aircraft, RAID_2], ships: [...BASE.ships, DD_9] })
      expect(aircraftById(spawned, 'raid-2')).toEqual(aircraftById(atStart, 'raid-2'))
      expect(spawned.ships.find((s) => s.id === 'dd-9')).toEqual(atStart.ships.find((s) => s.id === 'dd-9'))
      expect(spawned.combat.aircraft['raid-2']).toEqual(atStart.combat.aircraft['raid-2'])
      expect(spawned.combat.ships['dd-9']).toEqual(atStart.combat.ships['dd-9'])
    })

    it('stamps the world tick, starts at rest in time (previous = state), and appends after existing entities', () => {
      const before = steps(missionWorld(HELD), 600)
      const w = spawnHeldGroup(before, 'wave-1')
      expect(w.aircraft.map((a) => a.id)).toEqual(['f6f-1', 'bandit-1', 'raid-2'])
      expect(w.ships.map((s) => s.id)).toEqual(['cv-1', 'maru-1', 'maru-2', 'dd-9'])
      const raid = aircraftById(w, 'raid-2')!
      expect(raid.state.tick).toBe(600)
      expect(raid.previous).toBe(raid.state)
      expect(w.ships.at(-1)!.state.tick).toBe(600)
      expect(w.mission!.spawned).toEqual(['wave-1'])
      // Everything else is the same object: the spawn touched nothing else.
      expect(w.aircraft[0]).toBe(before.aircraft[0])
      expect(w.combat.projectiles).toBe(before.combat.projectiles)
    })

    it('the spawned group steps on the world clock from the next tick', () => {
      const w = steps(spawnHeldGroup(steps(missionWorld(HELD), 600), 'wave-1'), 1)
      for (const e of [...w.aircraft, ...w.ships]) expect(e.state.tick, e.id).toBe(601)
      expect(aircraftById(w, 'raid-2')!.state.position).not.toEqual(aircraftById(w, 'raid-2')!.previous.position)
    })

    it('refuses an unknown group, a second spawn, and a world with no mission', () => {
      const w = missionWorld(HELD)
      expect(() => spawnHeldGroup(w, 'wave-9')).toThrow('spawnHeldGroup: no held group "wave-9"')
      expect(() => spawnHeldGroup(spawnHeldGroup(w, 'wave-1'), 'wave-1')).toThrow('spawnHeldGroup: held group "wave-1" has already spawned')
      expect(() => spawnHeldGroup(missionWorld({}), 'wave-1')).toThrow('spawnHeldGroup: this world has no mission')
    })
  })
  ```

- [ ] **Step 2: Run to verify it fails.**

  Run: `npx vitest run tests/sim/mission/spawn.test.ts --maxWorkers=2`
  Expected: FAIL. Cannot resolve `src/sim/mission/spawn.js`.

- [ ] **Step 3: Create `src/sim/mission/spawn.ts`.**

  ```ts
  import { createCombat, type CombatState } from '../weapons/combat.js'
  import type { AircraftEntity, ShipEntity, World } from '../loop.js'
  import type { MissionState } from './state.js'

  /** The slice of a world a spawn changes. `advance` holds these as loop
   *  locals between steps, which is why the spawn works on them rather than on
   *  a `World` (plan ruling R5). */
  export type SpawnParts<M> = {
    readonly tick: number
    readonly aircraft: readonly AircraftEntity<M>[]
    readonly ships: readonly ShipEntity[]
    readonly combat: CombatState
    readonly mission: MissionState<M>
  }

  /**
   * Brings held group `groupId` into the world at `parts.tick` (spec §1: the
   * ONLY way an entity appears after tick 0).
   *
   * The entities were built at world creation by `worldFromScenario`'s own
   * builders, so this only restamps `state.tick` to the world clock and sets
   * `previous = state` (a spawn is not a step; the renderer must not
   * interpolate from anywhere). Combat records come from `createCombat`, the
   * function that made every start entity's, with the same defaults: empty
   * stores for aircraft, full hull for ships. Appended, so every existing
   * entity keeps its index (the render layer indexes by position).
   *
   * Pilot initialization at tick > 0 is Lane A's (7e): a spawned pilot keeps
   * `pilotAssignmentFrom`'s seed, whose `nextRescoreS: 0` rescores on its
   * first tick.
   */
  export function spawnInto<M>(parts: SpawnParts<M>, groupId: string): SpawnParts<M> {
    const m = parts.mission
    const group = m.held.find((g) => g.id === groupId)
    if (group === undefined) throw new Error(`spawnHeldGroup: no held group "${groupId}"`)
    if (m.spawned.includes(groupId)) throw new Error(`spawnHeldGroup: held group "${groupId}" has already spawned`)
    const aircraft = group.aircraft.map((a) => {
      const state = { ...a.state, tick: parts.tick }
      return { ...a, state, previous: state }
    })
    const ships = group.ships.map((s) => {
      const state = { ...s.state, tick: parts.tick }
      return { ...s, state, previous: state }
    })
    const fresh = createCombat(aircraft, {}, ships.map((s) => ({ id: s.id, hullHp: s.spec.hullHp })), [])
    return {
      tick: parts.tick,
      aircraft: [...parts.aircraft, ...aircraft],
      ships: [...parts.ships, ...ships],
      combat: {
        ...parts.combat,
        aircraft: { ...parts.combat.aircraft, ...fresh.aircraft },
        ships: { ...parts.combat.ships, ...fresh.ships },
      },
      mission: { ...m, spawned: [...m.spawned, groupId] },
    }
  }

  /** `spawnInto` for a whole `World`: the entry point tests and Lane A's 7e
   *  use. Inside `advance`, triggers call `spawnInto` on the loop's locals. */
  export function spawnHeldGroup<M>(world: World<M>, groupId: string): World<M> {
    if (world.mission === null) throw new Error('spawnHeldGroup: this world has no mission')
    const r = spawnInto({ tick: world.tick, aircraft: world.aircraft, ships: world.ships, combat: world.combat, mission: world.mission }, groupId)
    return { ...world, aircraft: r.aircraft, ships: r.ships, combat: r.combat, mission: r.mission }
  }
  ```

- [ ] **Step 4: Run to verify it passes.**

  Run: `npx vitest run tests/sim/mission/spawn.test.ts --maxWorkers=2`
  Expected: PASS.

- [ ] **Step 5: Verify and commit.**

  ```bash
  npm run verify; rc=$?; echo "rc=$rc"   # rc=0
  git add src/sim/mission/spawn.ts tests/sim/mission/spawn.test.ts
  git commit -m "M1 Task 4: spawnHeldGroup, the one mid-flight insertion path"
  ```

---

### Task 5: `stepMission` evaluates objectives every tick

**Files:**
- Create: `src/sim/mission/step.ts`
- Modify: `src/sim/loop.ts`: imports, `advance`'s locals (`:790-795`), the end of its step loop (`:865-869`) and its return (`:877`)
- Create: `tests/sim/mission/objectives.test.ts`
- Modify: `tests/sim/mission/fixture.ts` (append)

**Interfaces:**
- Consumes: `MissionState`, `ObjectiveState`, `ticksFor` (Task 3); `spawnInto` (Task 4); `nextLandingTracking` and `NO_LANDING` (Task 1).
- Produces:
  - `MissionTick<M> = { tick, player, aircraft, ships, combat, terrain, airfields, decks }`
  - `MissionStep<M> = { mission: MissionState<M>; spawns: readonly string[] }`
  - `stepMission<M>(m, t): MissionStep<M>`
  - `isDestroyed(t, id)` and `insideStation(station, position)`
  - `advance` runs the step after `stepCombat` and the release-pulse spend, then applies `spawns` in order.
- Produces (fixture): `NORTH`, `putPlayer(world, position, speed, sink, gear?)`, `moveAircraft(world, id, position)`, `destroyShip`, `destroyAircraft`, `destroyStructure`, and `landOnce(world, x, groundY, z)`.

- [ ] **Step 1: Extend the fixture.** Append to `tests/sim/mission/fixture.ts`, and add to its imports:

  ```ts
  import { withAircraftState } from '../../../src/sim/loop.js'
  import { createState } from '../../../src/sim/flight/state.js'
  import { v3, type Vec3 } from '../../../src/sim/math/vec3.js'
  import { qFromAxisAngle } from '../../../src/sim/math/quat.js'
  ```

  ```ts
  /** Nose north (-z): a yaw of pi/2 about +y, as `worldFromScenario` does. */
  export const NORTH = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2)

  /** Replaces the player's state (and `previous`): flying north at `speed`,
   *  sinking at `sink`, gear and flaps at `gear` (1 down, 0 up). */
  export function putPlayer<M>(w: World<M>, position: Vec3, speed: number, sink: number, gear = 0): World<M> {
    return withAircraftState(w, w.player, createState({
      position, velocity: v3(0, -sink, -speed), attitude: NORTH, gearFraction: gear, flapFraction: gear, tick: w.tick,
    }))
  }

  /** Places aircraft `id` at `position`, level, flying north at 120 m/s. */
  export function moveAircraft<M>(w: World<M>, id: string, position: Vec3): World<M> {
    return withAircraftState(w, id, createState({ position, velocity: v3(0, 0, -120), attitude: NORTH, tick: w.tick }))
  }

  export function destroyShip<M>(w: World<M>, id: string): World<M> {
    const rec = w.combat.ships[id]!
    return { ...w, combat: { ...w.combat, ships: { ...w.combat.ships, [id]: { ...rec, hp: 0, destroyedTick: w.tick, attacker: 'f6f-1' } } } }
  }

  export function destroyStructure<M>(w: World<M>, id: string): World<M> {
    const rec = w.combat.structures[id]!
    return { ...w, combat: { ...w.combat, structures: { ...w.combat.structures, [id]: { ...rec, hp: 0, destroyedTick: w.tick, attacker: 'f6f-1' } } } }
  }

  export function destroyAircraft<M>(w: World<M>, id: string): World<M> {
    const rec = w.combat.aircraft[id]!
    return { ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, [id]: { ...rec, damage: { ...rec.damage, destroyedAt: w.tick, attacker: 'f6f-1' } } } } }
  }

  /**
   * One landing at (x, z) on ground `groundY`, stepped through production
   * `advance` the way tests/render/landing.test.ts steps it through the frame
   * (measured 2026-09-25: a touchdown after 7 ticks on land and on the Essex):
   * latch airborne 50 m up; settle from 0.4 m (wheels) at 30 m/s and 1 m/s
   * sink; then come to rest. Returns the world one tick after the rest, when
   * the mission has recorded the landing.
   */
  export function landOnce<M>(w: World<M>, x: number, groundY: number, z: number): World<M> {
    const gearM = w.aircraft.find((a) => a.id === w.player)!.spec.gear.heightM
    let world = steps(putPlayer(w, v3(x, groundY + gearM + 50, z), 45, 0, 1), 1)
    world = putPlayer(world, v3(x, groundY + gearM + 0.4, z), 30, 1, 1)
    for (let i = 0; i < 120 && world.mission!.recovery.touchdown === null; i++) world = steps(world, 1)
    if (world.mission!.recovery.touchdown === null) throw new Error('landOnce: no touchdown within 120 ticks')
    return steps(putPlayer(world, v3(x, groundY + gearM, z), 0, 0, 1), 1)
  }
  ```

- [ ] **Step 2: Write the failing tests.** Create `tests/sim/mission/objectives.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest'
  import { advance, type World } from '../../../src/sim/loop.js'
  import { DT } from '../../../src/sim/flight/model.js'
  import { v3 } from '../../../src/sim/math/vec3.js'
  import { deckOf, deckWorld } from '../../../src/sim/world/deck.js'
  import { radioMessages } from '../../../src/sim/mission/state.js'
  import { loadAirfield } from '../../../tools/content/load.js'
  import {
    BASE, REACH_FAR, deepFreeze, destroyAircraft, destroyShip, destroyStructure, flatField, landOnce,
    missionWorld, moveAircraft, progressOf, putPlayer, steps,
  } from './fixture.js'

  const CV = { x: -25629, z: -16479 }
  const station = { point: { x: 0, z: 0 }, radiusM: 2000 }
  const cvDeck = (w: World<undefined>) => deckOf(w.ships.find((s) => s.id === 'cv-1')!)!
  const entries = (w: World<undefined>) => w.mission!.log

  describe('destroy', () => {
    it('counts destroyed targets across ships and structures and completes at count', () => {
      let w = missionWorld({ objectives: [{ id: 'kill', label: 'Kill', priority: 'primary', kind: 'destroy', targets: ['convoy', 'dulag-hangar-1'], count: 2 }] })
      w = steps(destroyShip(w, 'maru-1'), 1)
      expect(progressOf(w, 'kill')).toEqual({ status: 'active', count: 1, heldTicks: 0 })
      w = steps(destroyStructure(w, 'dulag-hangar-1'), 1)
      expect(progressOf(w, 'kill')).toEqual({ status: 'complete', count: 2, heldTicks: 0 })
      expect(entries(w)).toEqual([{ tick: w.tick, kind: 'objective', id: 'kill', status: 'complete' }])
    })

    it('defaults count to all, and counts a crashed or shot-down aircraft (ruling R13)', () => {
      let w = missionWorld({ objectives: [{ id: 'kill', label: 'Kill', priority: 'primary', kind: 'destroy', targets: ['raid'] }] })
      w = steps(destroyAircraft(w, 'bandit-1'), 1)
      expect(progressOf(w, 'kill').status).toBe('complete')
    })

    it('a held target counts as not destroyed until it exists (spec §2.3)', () => {
      const w = steps(missionWorld({
        objectives: [{ id: 'kill', label: 'Kill', priority: 'primary', kind: 'destroy', targets: ['raid-2'] }],
        triggers: [{ id: 'launch', when: { at: 100000 }, then: [{ spawn: 'wave-1' }] }],
        heldGroups: [{ id: 'wave-1', aircraft: [{ id: 'raid-2', spec: 'f6f-hellcat', airborneAt: { position: [-20000, 3000, -16479], headingDeg: 90, speedMps: 130 } }] }],
      }), 60)
      expect(progressOf(w, 'kill')).toEqual({ status: 'active', count: 0, heldTicks: 0 })
    })
  })

  describe('protect', () => {
    it('fails the moment losses exceed maxLost, announces it, and the flight goes on (spec §0.6)', () => {
      let w = missionWorld({ objectives: [
        { id: 'convoy', label: 'Convoy', priority: 'primary', kind: 'protect', targets: ['convoy'], maxLost: 1 },
        { ...REACH_FAR },
      ] })
      w = steps(destroyShip(w, 'maru-1'), 1)
      expect(progressOf(w, 'convoy')).toEqual({ status: 'active', count: 1, heldTicks: 0 })
      w = steps(destroyShip(w, 'maru-2'), 1)
      expect(progressOf(w, 'convoy').status).toBe('failed')
      expect(radioMessages(w.mission!).map((m) => m.text)).toEqual(['Convoy: failed'])
      const later = steps(w, 60)
      expect(later.tick).toBe(w.tick + 60)
      expect(progressOf(later, 'far').status).toBe('active')
    })
  })

  describe('deny', () => {
    const DENY = { id: 'screen', label: 'Screen', priority: 'primary', kind: 'deny', hostiles: ['raid'], around: 'cv-1', radiusM: 5000 }

    it('fails when a live hostile comes inside the radius, measured horizontally (ruling R9)', () => {
      let w = missionWorld({ objectives: [DENY] })
      w = steps(moveAircraft(w, 'bandit-1', v3(CV.x + 6000, 9000, CV.z)), 1)
      expect(progressOf(w, 'screen').status).toBe('active')
      w = steps(moveAircraft(w, 'bandit-1', v3(CV.x + 4000, 9000, CV.z)), 1)
      expect(progressOf(w, 'screen').status).toBe('failed')
    })

    it('a destroyed hostile inside the ring is not a breach (Review Focus 5)', () => {
      let w = missionWorld({ objectives: [DENY] })
      w = destroyAircraft(w, 'bandit-1')
      w = steps(moveAircraft(w, 'bandit-1', v3(CV.x + 1000, 3000, CV.z)), 30)
      expect(progressOf(w, 'screen').status).toBe('active')
    })

    it('an unspawned hostile is not a breach, whatever its template says (Review Focus 5)', () => {
      const w = steps(missionWorld({
        objectives: [DENY],
        triggers: [{ id: 'launch', when: { at: 100000 }, then: [{ spawn: 'wave-1' }] }],
        heldGroups: [{ id: 'wave-1', aircraft: [{ id: 'raid-2', spec: 'f6f-hellcat', tags: ['raid'], airborneAt: { position: [CV.x + 100, 3000, CV.z], headingDeg: 90, speedMps: 130 } }] }],
      }), 30)
      expect(progressOf(w, 'screen').status).toBe('active')
    })

    it('accepts a fixed point as the center', () => {
      let w = missionWorld({ objectives: [{ ...DENY, around: { x: 0, z: -20000 } }] })
      w = steps(w, 1)
      expect(progressOf(w, 'screen').status).toBe('failed') // bandit-1 starts on that point
    })
  })

  describe('reach and hold', () => {
    it('reach completes on the first tick inside, altitude band included', () => {
      let w = missionWorld({ objectives: [{ id: 'gate', label: 'Gate', priority: 'primary', kind: 'reach', ...station, altitudeM: [100, 600] }] })
      w = steps(putPlayer(w, v3(0, 3000, 0), 120, 0), 1)
      expect(progressOf(w, 'gate').status).toBe('active') // inside the circle, above the band
      w = steps(putPlayer(w, v3(0, 400, 0), 120, 0), 1)
      expect(progressOf(w, 'gate').status).toBe('complete')
    })

    it('hold accumulates time inside across an excursion (spec §0.9) and completes on the exact tick', () => {
      let w = missionWorld({ objectives: [{ id: 'cap', label: 'CAP', priority: 'primary', kind: 'hold', ...station, seconds: 1 }] })
      const inside = v3(0, 3000, 0)
      const outside = v3(0, 3000, 5000)
      for (let i = 0; i < 30; i++) w = steps(putPlayer(w, inside, 120, 0), 1)
      expect(progressOf(w, 'cap')).toEqual({ status: 'active', count: 0, heldTicks: 30 })
      for (let i = 0; i < 10; i++) w = steps(putPlayer(w, outside, 120, 0), 1)
      expect(progressOf(w, 'cap').heldTicks).toBe(30)
      for (let i = 0; i < 29; i++) w = steps(putPlayer(w, inside, 120, 0), 1)
      expect(progressOf(w, 'cap')).toEqual({ status: 'active', count: 0, heldTicks: 59 })
      w = steps(putPlayer(w, inside, 120, 0), 1)
      expect(progressOf(w, 'cap')).toEqual({ status: 'complete', count: 0, heldTicks: 60 })
    })

    it('a destroyed player accumulates nothing more (Review Focus 3)', () => {
      let w = missionWorld({ objectives: [{ id: 'cap', label: 'CAP', priority: 'primary', kind: 'hold', ...station, seconds: 10 }] })
      w = steps(putPlayer(w, v3(0, 3000, 0), 120, 0), 10)
      const held = progressOf(w, 'cap').heldTicks
      w = steps(destroyAircraft(w, 'f6f-1'), 120)
      expect(progressOf(w, 'cap').heldTicks).toBe(held)
    })
  })

  describe('after', () => {
    it('gates an objective, and one activated this tick is evaluated this tick, in file order (ruling R8)', () => {
      let w = missionWorld({ objectives: [
        { id: 'gate', label: 'Gate', priority: 'primary', kind: 'reach', ...station },
        { id: 'kill', label: 'Kill', priority: 'primary', kind: 'destroy', targets: ['maru-1'], after: 'gate' },
      ] })
      w = steps(putPlayer(destroyShip(w, 'maru-1'), v3(0, 3000, 9000), 120, 0), 1)
      expect(progressOf(w, 'kill')).toEqual({ status: 'inactive', count: 0, heldTicks: 0 })
      w = steps(putPlayer(w, v3(0, 3000, 0), 120, 0), 1)
      expect(entries(w)).toEqual([
        { tick: w.tick, kind: 'objective', id: 'gate', status: 'complete' },
        { tick: w.tick, kind: 'objective', id: 'kill', status: 'complete' },
      ])
    })
  })

  describe('takeoff and land (the recovery signal, ruling R1)', () => {
    const TRAPS = { id: 'trap', label: 'Trap', priority: 'primary', kind: 'land', at: 'cv-1', count: 2 }

    it('takeoff completes once the player is airborne off the deck it started on', () => {
      let w = missionWorld({
        aircraft: [{ id: 'f6f-1', spec: 'f6f-hellcat', parkedAt: { ship: 'cv-1', spot: { x: 0, z: -110 } }, chocked: false }, BASE.aircraft[1]],
        objectives: [{ id: 'up', label: 'Launch', priority: 'primary', kind: 'takeoff', from: 'cv-1' }],
      })
      w = steps(w, 5)
      expect(progressOf(w, 'up').status).toBe('active')
      const d = cvDeck(w)
      const p = deckWorld(d, 0, 0)
      w = steps(putPlayer(w, v3(p.x, d.center.y + 50, p.z), 60, 0), 1)
      expect(progressOf(w, 'up').status).toBe('complete')
    })

    it('counts traps on the named deck, logs each landing, and says "Trap n of 2" (spec §2.4)', () => {
      let w = missionWorld({ objectives: [TRAPS] })
      const d = cvDeck(w)
      const p = deckWorld(d, 0, 0)
      w = landOnce(w, p.x, d.center.y, p.z)
      expect(progressOf(w, 'trap')).toEqual({ status: 'active', count: 1, heldTicks: 0 })
      const first = entries(w).find((e) => e.kind === 'landing')
      expect(first).toEqual({ tick: expect.any(Number), kind: 'landing', at: { kind: 'carrier', id: 'cv-1', name: 'cv-1' }, advanced: 'trap', intermediate: true })
      w = landOnce(w, p.x, d.center.y, p.z)
      expect(progressOf(w, 'trap')).toEqual({ status: 'complete', count: 2, heldTicks: 0 })
      const landings = entries(w).filter((e) => e.kind === 'landing')
      expect(landings.map((e) => (e.kind === 'landing' ? e.intermediate : null))).toEqual([true, false])
      expect(radioMessages(w.mission!).map((m) => m.text)).toEqual(['Trap 1 of 2', 'Trap 2 of 2'])
    })

    it('a landing before the objective is active advances nothing (Review Focus 1)', () => {
      let w = missionWorld({ objectives: [{ ...REACH_FAR, id: 'gate' }, { ...TRAPS, after: 'gate' }] })
      const d = cvDeck(w)
      const p = deckWorld(d, 0, 0)
      w = landOnce(w, p.x, d.center.y, p.z)
      expect(progressOf(w, 'trap')).toEqual({ status: 'inactive', count: 0, heldTicks: 0 })
      expect(entries(w).filter((e) => e.kind === 'landing')).toEqual([
        { tick: expect.any(Number), kind: 'landing', at: { kind: 'carrier', id: 'cv-1', name: 'cv-1' }, advanced: null, intermediate: false },
      ])
    })

    it('an airfield landing counts for land at that airfield; an off-field one does not', () => {
      const tac = loadAirfield('tacloban').runway.center
      const home = { id: 'home', label: 'Home', priority: 'primary', kind: 'land', at: 'tacloban' }
      let w = missionWorld({ ships: [], objectives: [home] }, flatField(100))
      w = landOnce(w, 0, 100, 0)
      expect(progressOf(w, 'home').status).toBe('active')
      w = landOnce(w, tac.x, 100, tac.z)
      expect(progressOf(w, 'home').status).toBe('complete')
    })
  })

  describe('the engine and the world', () => {
    it('a mission that never progresses leaves every entity and the combat state identical (spec §1 gate)', () => {
      const plain = steps(missionWorld({}), 600)
      const withMission = steps(missionWorld({ objectives: [REACH_FAR] }), 600)
      expect(withMission.aircraft).toEqual(plain.aircraft)
      expect(withMission.ships).toEqual(plain.ships)
      expect(withMission.combat).toEqual(plain.combat)
      expect(plain.mission).toBeNull()
    })

    it('advance does not write into a frozen mission world', () => {
      const w = deepFreeze(missionWorld({ objectives: [REACH_FAR, { id: 'kill', label: 'Kill', priority: 'primary', kind: 'destroy', targets: ['convoy'] }] }))
      expect(() => advance(w, 5 * DT)).not.toThrow()
    })

    it('an unchanged tick returns the same mission object', () => {
      const w = steps(missionWorld({ objectives: [REACH_FAR] }), 1)
      expect(advance(w, DT).world.mission).toBe(w.mission)
    })
  })
  ```

- [ ] **Step 3: Run to verify it fails.**

  Run: `npx vitest run tests/sim/mission/objectives.test.ts --maxWorkers=2`
  Expected: FAIL. Progress never changes, because `advance` does not step missions yet.

- [ ] **Step 4: Create `src/sim/mission/step.ts`.**

  ```ts
  import { nextLandingTracking, NO_LANDING, type LandingReport, type LandingTracking } from '../landing.js'
  import type { AircraftEntity, EntityId, ShipEntity } from '../loop.js'
  import type { CombatState } from '../weapons/combat.js'
  import type { TerrainField } from '../world/terrain.js'
  import type { Airfield } from '../world/airfields.js'
  import type { Deck } from '../world/deck.js'
  import type { Vec3 } from '../math/vec3.js'
  import type { Station } from './schema.js'
  import { ticksFor, type MissionLogEntry, type MissionState, type ObjectiveState, type ResolvedObjective } from './state.js'

  /**
   * What one tick of a mission reads: `advance`'s loop locals after combat has
   * resolved, not a `World` (plan ruling R5: loop.ts imports this module at
   * runtime, so it may import loop.ts for types only).
   */
  export type MissionTick<M> = {
    readonly tick: number
    readonly player: EntityId
    readonly aircraft: readonly AircraftEntity<M>[]
    readonly ships: readonly ShipEntity[]
    readonly combat: CombatState
    readonly terrain: TerrainField | null
    readonly airfields: readonly Airfield[]
    readonly decks: readonly Deck[]
  }

  /** The next mission state, and the held groups `advance` must spawn now,
   *  in order. */
  export type MissionStep<M> = { readonly mission: MissionState<M>; readonly spawns: readonly string[] }

  /** Ruling R13: an aircraft is destroyed by damage or by any impact; a ship
   *  or structure by its `destroyedTick`; an entity with no combat record (an
   *  unspawned held one) is not destroyed. */
  export function isDestroyed<M>(t: MissionTick<M>, id: EntityId): boolean {
    const aircraft = t.combat.aircraft[id]
    if (aircraft !== undefined) {
      if (aircraft.damage.destroyedAt !== null) return true
      return t.aircraft.find((a) => a.id === id)?.impact != null
    }
    const ship = t.combat.ships[id]
    if (ship !== undefined) return ship.destroyedTick !== null
    const structure = t.combat.structures[id]
    return structure !== undefined && structure.destroyedTick !== null
  }

  const isPresent = <M>(t: MissionTick<M>, id: EntityId): boolean =>
    t.combat.aircraft[id] !== undefined || t.combat.ships[id] !== undefined || t.combat.structures[id] !== undefined

  function positionOf<M>(t: MissionTick<M>, id: EntityId): Vec3 | null {
    return t.aircraft.find((a) => a.id === id)?.state.position ?? t.ships.find((s) => s.id === id)?.state.position ?? null
  }

  /** Horizontal circle, optional altitude band on world y (ruling R9). */
  export function insideStation(s: Pick<Station, 'point' | 'radiusM' | 'altitudeM'>, p: Vec3): boolean {
    if (Math.hypot(p.x - s.point.x, p.z - s.point.z) > s.radiusM) return false
    return s.altitudeM === undefined || (p.y >= s.altitudeM[0] && p.y <= s.altitudeM[1])
  }

  type Context<M> = {
    readonly t: MissionTick<M>
    readonly player: AircraftEntity<M>
    /** Ruling R12: player-relative evaluation stops once this is false. */
    readonly alive: boolean
    readonly recovery: LandingTracking
    readonly landing: LandingReport | null
  }

  function evaluate<M>(o: ResolvedObjective, p: ObjectiveState, c: Context<M>): ObjectiveState {
    const here = c.player.state.position
    switch (o.kind) {
      case 'destroy': {
        const n = o.resolved.filter((id) => isDestroyed(c.t, id)).length
        const need = o.count ?? o.resolved.length
        if (n === p.count && n < need) return p
        return { ...p, count: n, status: n >= need ? 'complete' : 'active' }
      }
      case 'protect': {
        const lost = o.resolved.filter((id) => isDestroyed(c.t, id)).length
        if (lost === p.count) return p
        return { ...p, count: lost, status: lost > (o.maxLost ?? 0) ? 'failed' : 'active' }
      }
      case 'deny': {
        const center = typeof o.around === 'string' ? positionOf(c.t, o.around) : o.around
        if (center === null) return p
        const breached = o.resolved.some((id) => {
          if (!isPresent(c.t, id) || isDestroyed(c.t, id)) return false
          const q = positionOf(c.t, id)
          return q !== null && Math.hypot(q.x - center.x, q.z - center.z) <= o.radiusM
        })
        return breached ? { ...p, status: 'failed' } : p
      }
      case 'takeoff':
        return c.alive && (c.recovery.airborne || c.landing !== null) ? { ...p, status: 'complete' } : p
      case 'land': {
        if (c.landing === null || c.landing.at?.id !== o.at) return p
        const n = p.count + 1
        return { ...p, count: n, status: n >= (o.count ?? 1) ? 'complete' : 'active' }
      }
      case 'reach':
        return c.alive && insideStation(o, here) ? { ...p, status: 'complete' } : p
      case 'hold': {
        if (!c.alive || !insideStation(o, here)) return p
        const held = p.heldTicks + 1
        return { ...p, heldTicks: held, status: held >= ticksFor(o.seconds) ? 'complete' : 'active' }
      }
    }
  }

  /**
   * One tick of a mission (spec 2026-09-25 §1-§2), run by `advance` after
   * `stepCombat`. Pure. In order:
   *  1. the player's landing tracker (ruling R1), reset after each landing;
   *  2. objectives, one pass in file order (ruling R8);
   *  3. the landing's log entry and progress message (ruling R7).
   * Returns the SAME mission object when nothing changed.
   */
  export function stepMission<M>(m: MissionState<M>, t: MissionTick<M>): MissionStep<M> {
    const player = t.aircraft.find((a) => a.id === t.player)
    if (player === undefined) throw new Error(`stepMission: no player aircraft "${t.player}"`)
    const record = t.combat.aircraft[t.player]
    const alive = player.impact === null && (record === undefined || record.damage.destroyedAt === null)
    const added: MissionLogEntry[] = []

    // 1. Recovery, on the player's own step: `previous` is its state before
    //    this tick, `state` after (loop.ts `stepAircraftEntity`).
    let recovery = m.recovery
    let landing: LandingReport | null = null
    if (alive) {
      recovery = nextLandingTracking(player.spec, m.recovery, player.previous, player.state, t.terrain, t.airfields, t.decks)
      if (recovery.report !== null) {
        landing = recovery.report
        recovery = NO_LANDING
      }
    }
    const c: Context<M> = { t, player, alive, recovery, landing }

    // 2. Objectives.
    let progress: ObjectiveState[] | null = null
    let advanced: { readonly id: string; readonly label: string; readonly n: number; readonly count: number; readonly done: boolean } | null = null
    for (let i = 0; i < m.objectives.length; i++) {
      const o = m.objectives[i]!
      const before = (progress ?? m.progress)[i]!
      let p = before
      if (p.status === 'inactive') {
        const gate = (progress ?? m.progress)[m.objectives.findIndex((x) => x.id === o.after)]!
        if (gate.status !== 'complete') continue
        p = { ...p, status: 'active' }
      }
      if (p.status === 'active') {
        const next = evaluate(o, p, c)
        if (o.kind === 'land' && next.count > p.count) {
          advanced ??= { id: o.id, label: o.label, n: next.count, count: o.count ?? 1, done: next.status === 'complete' }
        }
        if (next.status === 'complete') added.push({ tick: t.tick, kind: 'objective', id: o.id, status: 'complete' })
        if (next.status === 'failed') {
          added.push({ tick: t.tick, kind: 'objective', id: o.id, status: 'failed' })
          added.push({ tick: t.tick, kind: 'message', text: `${o.label}: failed` })
        }
        p = next
      }
      if (p !== before) {
        progress ??= [...m.progress]
        progress[i] = p
      }
    }

    // 3. The landing's own entry, then "Trap n of count" (spec §4.1).
    if (landing !== null) {
      added.push({ tick: t.tick, kind: 'landing', at: landing.at, advanced: advanced?.id ?? null, intermediate: advanced !== null && !advanced.done })
      if (advanced !== null && advanced.count > 1) added.push({ tick: t.tick, kind: 'message', text: `${advanced.label} ${advanced.n} of ${advanced.count}` })
    }

    if (recovery === m.recovery && progress === null && added.length === 0) return { mission: m, spawns: [] }
    return {
      mission: { ...m, recovery, progress: progress ?? m.progress, log: added.length > 0 ? [...m.log, ...added] : m.log },
      spawns: [],
    }
  }
  ```

  Note on `advanced`: TypeScript narrows a `let` assigned inside a `for` loop correctly. That is why this is a `for` loop and not `forEach`.

- [ ] **Step 5: Hook the step into `advance`.** In `src/sim/loop.ts`:
  - Add `import { stepMission } from './mission/step.js'` and `import { spawnInto } from './mission/spawn.js'`.
  - After `let combat = world.combat`, add `let mission = world.mission`.
  - After the `aircraft = aircraft.map((a) => … spendRelease …)` statement, **inside** the step loop, add:

  ```ts
      // Missions (spec 2026-09-25 §1): once per tick, after combat has
      // resolved and the release pulse is spent, so objectives read this
      // tick's damage and positions. A world with no mission skips this
      // block entirely -- the bit-identity gate -- rather than running a
      // no-op. Spawns land at the END of the tick with `state.tick = tick`
      // and step from the next iteration, like every other entity.
      if (mission !== null) {
        const stepped = stepMission(mission, {
          tick, player: world.player, aircraft, ships, combat,
          terrain: world.terrain, airfields: world.airfields, decks,
        })
        mission = stepped.mission
        for (const groupId of stepped.spawns) {
          const spawned = spawnInto({ tick, aircraft, ships, combat, mission }, groupId)
          aircraft = spawned.aircraft
          ships = spawned.ships
          combat = spawned.combat
          mission = spawned.mission
        }
      }
  ```

  - In the return, `world: { ...world, tick, aircraft, ships, structures, combat, accumulatorSeconds: banked }` becomes `world: { ...world, tick, aircraft, ships, structures, combat, mission, accumulatorSeconds: banked }`.

- [ ] **Step 6: Run the tests.**

  ```bash
  npx vitest run tests/sim/mission/objectives.test.ts tests/sim/mission/spawn.test.ts --maxWorkers=2
  npx vitest run tests/sim/loop.test.ts tests/sim/entities.test.ts --maxWorkers=2
  ```

  Expected: PASS. If a `landOnce` call throws "no touchdown within 120 ticks", do not widen the loop. Print the tracker (`world.mission!.recovery`) and the player's wheel height on each of the first 20 ticks. The probe measured 7, so any failure is a real difference between the frame path and the tick path, and it is worth understanding before going on.

- [ ] **Step 7: Bit-identity.** Run `npx tsx .superpowers/m1/digest.ts 1800`. Expected: the six baseline hashes, unchanged.

- [ ] **Step 8: Verify and commit.**

  ```bash
  npm run verify; rc=$?; echo "rc=$rc"   # rc=0
  git add src/sim/mission/step.ts src/sim/loop.ts tests/sim/mission/fixture.ts tests/sim/mission/objectives.test.ts
  git commit -m "M1 Task 5: stepMission evaluates all seven objective kinds every tick"
  ```

---

### Task 6: Triggers

**Files:**
- Modify: `src/sim/mission/step.ts`: `stepMission`'s tail (from `// 3.` to the end)
- Create: `tests/sim/mission/triggers.test.ts`

**Interfaces:**
- Consumes: Task 5's `stepMission`, `insideStation`, `Context`, and `ticksFor`.
- Produces: `stepMission` now fires triggers after objectives, in file order, each once. It appends `trigger`, `message` and `spawn` log entries in the order of its `then` list, and returns `spawns` in the same order.

- [ ] **Step 1: Write the failing tests.** Create `tests/sim/mission/triggers.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest'
  import { advance, aircraftById } from '../../../src/sim/loop.js'
  import { DT } from '../../../src/sim/flight/model.js'
  import { v3 } from '../../../src/sim/math/vec3.js'
  import { radioMessages } from '../../../src/sim/mission/state.js'
  import { REACH_FAR, destroyAircraft, destroyShip, missionWorld, putPlayer, steps } from './fixture.js'

  const RAID_2 = { id: 'raid-2', spec: 'f6f-hellcat', tags: ['raid'], airborneAt: { position: [-20000, 3000, -16479], headingDeg: 90, speedMps: 130 }, pilot: { target: 'f6f-1' } }
  const station = { point: { x: 0, z: 0 }, radiusM: 2000 }

  describe('triggers (spec 2026-09-25 §2.2)', () => {
    it('when.at fires on the exact tick (ruling R10), exactly once', () => {
      let w = missionWorld({ objectives: [REACH_FAR], triggers: [{ id: 'one', when: { at: 1 }, then: [{ message: 'one second' }] }] })
      w = steps(w, 59)
      expect(w.mission!.fired).toEqual([])
      w = steps(w, 1)
      expect(w.mission!.log).toEqual([
        { tick: 60, kind: 'trigger', id: 'one' },
        { tick: 60, kind: 'message', text: 'one second' },
      ])
      w = steps(w, 200)
      expect(w.mission!.fired).toEqual(['one'])
      expect(w.mission!.log).toHaveLength(2)
    })

    it('when.completed fires in the same tick as the objective, after it (objectives first)', () => {
      let w = missionWorld({
        objectives: [{ id: 'kill', label: 'Kill', priority: 'primary', kind: 'destroy', targets: ['maru-1'] }],
        triggers: [{ id: 'well-done', when: { completed: 'kill' }, then: [{ message: 'Maru sunk' }] }],
      })
      w = steps(destroyShip(w, 'maru-1'), 1)
      expect(w.mission!.log.map((e) => e.kind)).toEqual(['objective', 'trigger', 'message'])
      expect(new Set(w.mission!.log.map((e) => e.tick))).toEqual(new Set([w.tick]))
    })

    it('when.failed fires on a protect failure, after the failure announcement', () => {
      let w = missionWorld({
        objectives: [{ id: 'carrier', label: 'Carrier', priority: 'primary', kind: 'protect', targets: ['cv-1'] }],
        triggers: [{ id: 'lost', when: { failed: 'carrier' }, then: [{ message: 'Carrier lost' }] }],
      })
      w = steps(destroyShip(w, 'cv-1'), 1)
      expect(radioMessages(w.mission!).map((m) => m.text)).toEqual(['Carrier: failed', 'Carrier lost'])
    })

    it('when.enters fires when the player enters, and never for a dead player (Review Focus 3)', () => {
      const trig = { objectives: [REACH_FAR], triggers: [{ id: 'overhead', when: { enters: station }, then: [{ message: 'Overhead' }] }] }
      let w = missionWorld(trig)
      w = steps(putPlayer(w, v3(0, 3000, 5000), 120, 0), 1)
      expect(w.mission!.fired).toEqual([])
      w = steps(putPlayer(w, v3(0, 3000, 0), 120, 0), 1)
      expect(w.mission!.fired).toEqual(['overhead'])

      let dead = destroyAircraft(missionWorld(trig), 'f6f-1')
      dead = steps(putPlayer(dead, v3(0, 3000, 0), 120, 0), 30)
      expect(dead.mission!.fired).toEqual([])
    })

    it('fires two triggers of one tick in file order', () => {
      let w = missionWorld({ objectives: [REACH_FAR], triggers: [
        { id: 'b', when: { at: 0.5 }, then: [{ message: 'first' }] },
        { id: 'a', when: { at: 0.5 }, then: [{ message: 'second' }] },
      ] })
      w = steps(w, 30)
      expect(w.mission!.fired).toEqual(['b', 'a'])
      expect(radioMessages(w.mission!).map((m) => m.text)).toEqual(['first', 'second'])
    })

    it('spawn brings the group in on its tick; the spawned pilot flies from the next', () => {
      let w = missionWorld({
        objectives: [REACH_FAR],
        triggers: [{ id: 'launch', when: { at: 0.5 }, then: [{ message: 'Bandits inbound' }, { spawn: 'wave-1' }] }],
        heldGroups: [{ id: 'wave-1', aircraft: [RAID_2] }],
      })
      w = steps(w, 30)
      expect(w.mission!.log).toEqual([
        { tick: 30, kind: 'trigger', id: 'launch' },
        { tick: 30, kind: 'message', text: 'Bandits inbound' },
        { tick: 30, kind: 'spawn', group: 'wave-1' },
      ])
      expect(aircraftById(w, 'raid-2')!.state.tick).toBe(30)
      w = steps(w, 1)
      expect(aircraftById(w, 'raid-2')!.state.tick).toBe(31)
    })

    it('a spawn inside a five-step advance is stepped by the rest of that call (Review Focus 4)', () => {
      let w = missionWorld({
        objectives: [REACH_FAR],
        triggers: [{ id: 'launch', when: { at: 0.5 }, then: [{ spawn: 'wave-1' }] }],
        heldGroups: [{ id: 'wave-1', aircraft: [RAID_2] }],
      })
      w = steps(w, 28)
      const r = advance(w, 5 * DT)
      expect(r.stepsRun).toBe(5)
      expect(r.world.tick).toBe(33)
      for (const e of [...r.world.aircraft, ...r.world.ships]) expect(e.state.tick, e.id).toBe(33)
      const raid = aircraftById(r.world, 'raid-2')!
      expect(raid.state.position).not.toEqual(r.world.mission!.held[0]!.aircraft[0]!.state.position)
    })

    it('two runs of the same inputs write identical logs and worlds', () => {
      const run = () => {
        let w = missionWorld({
          objectives: [
            { id: 'kill', label: 'Kill', priority: 'primary', kind: 'destroy', targets: ['raid'] },
            { id: 'convoy', label: 'Convoy', priority: 'secondary', kind: 'protect', targets: ['convoy'] },
          ],
          triggers: [
            { id: 'launch', when: { at: 0.5 }, then: [{ spawn: 'wave-1' }, { message: 'Inbound' }] },
            { id: 'lost', when: { failed: 'convoy' }, then: [{ message: 'Convoy hit' }] },
          ],
          heldGroups: [{ id: 'wave-1', aircraft: [RAID_2] }],
        })
        w = steps(w, 40)
        w = steps(destroyShip(w, 'maru-2'), 200)
        return w
      }
      const a = run()
      const b = run()
      expect(a.mission!.log).toEqual(b.mission!.log)
      expect(a.aircraft).toEqual(b.aircraft)
      expect(a.mission!.log.length).toBeGreaterThanOrEqual(6)
    })
  })
  ```

  The ordering test names its triggers `b` then `a` on purpose: firing as `['b', 'a']` proves file order, not id order.

- [ ] **Step 2: Run to verify it fails.**

  Run: `npx vitest run tests/sim/mission/triggers.test.ts --maxWorkers=2`
  Expected: FAIL. `fired` stays `[]`.

- [ ] **Step 3: Implement triggers.** In `src/sim/mission/step.ts`:
  - Add `import type { TriggerWhen } from './schema.js'`.
  - Add, above `stepMission`:

  ```ts
  function conditionMet<M>(w: TriggerWhen, m: MissionState<M>, progress: readonly ObjectiveState[], c: Context<M>): boolean {
    if ('at' in w) return c.t.tick >= ticksFor(w.at)
    if ('completed' in w) {
      const id = w.completed
      return progress[m.objectives.findIndex((o) => o.id === id)]!.status === 'complete'
    }
    if ('failed' in w) {
      const id = w.failed
      return progress[m.objectives.findIndex((o) => o.id === id)]!.status === 'failed'
    }
    return c.alive && insideStation(w.enters, c.player.state.position)
  }
  ```

  Replace everything in `stepMission` from the final `if (recovery === m.recovery && …` to the end of the function with:

  ```ts
    // 4. Triggers: after objectives, in file order, each once (spec §2.2).
    //    `then` runs in list order; spawns are applied by `advance`, in the
    //    order returned, at the end of this tick.
    let fired: string[] | null = null
    const spawns: string[] = []
    for (const trigger of m.triggers) {
      if ((fired ?? m.fired).includes(trigger.id)) continue
      if (!conditionMet(trigger.when, m, progress ?? m.progress, c)) continue
      fired ??= [...m.fired]
      fired.push(trigger.id)
      added.push({ tick: t.tick, kind: 'trigger', id: trigger.id })
      for (const action of trigger.then) {
        if ('spawn' in action) {
          spawns.push(action.spawn)
          added.push({ tick: t.tick, kind: 'spawn', group: action.spawn })
        } else {
          added.push({ tick: t.tick, kind: 'message', text: action.message })
        }
      }
    }

    if (recovery === m.recovery && progress === null && fired === null && added.length === 0) return { mission: m, spawns }
    return {
      mission: {
        ...m,
        recovery,
        progress: progress ?? m.progress,
        fired: fired ?? m.fired,
        log: added.length > 0 ? [...m.log, ...added] : m.log,
      },
      spawns,
    }
  ```

  Update `stepMission`'s docstring list with `4. triggers, in file order, each once (spec §2.2).`

- [ ] **Step 4: Run the tests.**

  ```bash
  npx vitest run tests/sim/mission/triggers.test.ts tests/sim/mission/objectives.test.ts --maxWorkers=2
  ```

  Expected: PASS.

- [ ] **Step 5: Verify and commit.**

  ```bash
  npm run verify; rc=$?; echo "rc=$rc"   # rc=0
  git add src/sim/mission/step.ts tests/sim/mission/triggers.test.ts
  git commit -m "M1 Task 6: triggers fire once, in file order, after objectives"
  ```

---

### Task 7: Outcome, badge rule, and the one-signal agreement test

**Files:**
- Create: `src/sim/mission/outcome.ts`
- Create: `tests/sim/mission/outcome.test.ts`, `tests/sim/mission/recoveryAgreement.test.ts`

**Interfaces:**
- Consumes: `MissionState`, `lastLanding` (Task 3); `LandingAt` (Task 1); `World` (type only).
- Produces:
  - `Recovery = { kind: 'landed'; at: LandingAt | null } | { kind: 'ditched' } | { kind: 'killed' }`. The `kind`s match `RecoveryOutcome` in `src/render/debrief.ts` word for word.
  - `recoveryOf<M>(world: World<M>): Recovery | null`. Its contract: call it when the frame shows a debrief.
  - `FinalStatus = 'complete' | 'incomplete' | 'failed'` and `finalStatus(o, p)`.
  - `ObjectiveResult = { id, label, priority, final }`
  - `MissionOutcome = { result: 'success' | 'no-badge'; badge: Badge | null; reasons: readonly string[]; objectives: readonly ObjectiveResult[] }`
  - `missionOutcome<M>(m, recovery): MissionOutcome`

- [ ] **Step 1: Write the failing outcome tests.** Create `tests/sim/mission/outcome.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest'
  import { createMission } from '../../../src/sim/mission/create.js'
  import { missionOutcome } from '../../../src/sim/mission/outcome.js'
  import type { Objective } from '../../../src/sim/mission/schema.js'
  import type { MissionState, ObjectiveState } from '../../../src/sim/mission/state.js'

  const OBJECTIVES: Objective[] = [
    { id: 'kill', label: 'Hangars', priority: 'primary', kind: 'destroy', targets: ['h'] },
    { id: 'carrier', label: 'Carrier', priority: 'primary', kind: 'protect', targets: ['cv-1'] },
    { id: 'aaa', label: 'AAA', priority: 'secondary', kind: 'destroy', targets: ['a'] },
  ]
  const BADGE = { id: 'strike', name: 'Airfield Strike' }
  const at = { kind: 'airfield', id: 'tacloban', name: 'Tacloban' } as const
  const s = (status: ObjectiveState['status']): ObjectiveState => ({ status, count: 0, heldTicks: 0 })

  function mission(progress: ObjectiveState[], badge: typeof BADGE | null = BADGE): MissionState<undefined> {
    const m = createMission<undefined>({
      scenarioId: 'unit', objectives: OBJECTIVES, triggers: [], badge, held: [],
      entities: [{ id: 'h', tags: [] }, { id: 'cv-1', tags: [] }, { id: 'a', tags: [] }],
    })
    return { ...m, progress }
  }

  describe('missionOutcome (spec 2026-09-25 §2.4)', () => {
    it('a landing at a named base with every primary done earns the badge; a live protect counts as held', () => {
      const o = missionOutcome(mission([s('complete'), s('active'), s('active')]), { kind: 'landed', at })
      expect(o).toEqual({
        result: 'success', badge: BADGE, reasons: [],
        objectives: [
          { id: 'kill', label: 'Hangars', priority: 'primary', final: 'complete' },
          { id: 'carrier', label: 'Carrier', priority: 'primary', final: 'complete' },
          { id: 'aaa', label: 'AAA', priority: 'secondary', final: 'incomplete' },
        ],
      })
    })

    it('ditching banks nothing toward a badge, and says why', () => {
      const o = missionOutcome(mission([s('complete'), s('active'), s('complete')]), { kind: 'ditched' })
      expect(o.result).toBe('no-badge')
      expect(o.badge).toBeNull()
      expect(o.reasons).toEqual(['Ditched'])
    })

    it('an off-field landing earns no badge', () => {
      expect(missionOutcome(mission([s('complete'), s('active'), s('active')]), { kind: 'landed', at: null }).reasons).toEqual(['Landed off-field'])
    })

    it('a failed primary blocks the badge even after a good landing; reasons in fixed order (ruling R16)', () => {
      const o = missionOutcome(mission([s('active'), s('failed'), s('failed')]), { kind: 'landed', at: null })
      expect(o.reasons).toEqual(['Landed off-field', 'Carrier: failed', 'Hangars: incomplete'])
      expect(o.objectives.map((x) => x.final)).toEqual(['incomplete', 'failed', 'failed'])
    })

    it('death is terminal: killed, no badge', () => {
      expect(missionOutcome(mission([s('complete'), s('active'), s('active')]), { kind: 'killed' }).reasons).toEqual(['Killed'])
    })

    it('an objective still waiting on after is incomplete, even a protect', () => {
      const m = mission([s('complete'), s('inactive'), s('active')])
      expect(missionOutcome(m, { kind: 'landed', at }).reasons).toEqual(['Carrier: incomplete'])
    })

    it('a mission with no badge can still succeed', () => {
      const o = missionOutcome(mission([s('complete'), s('active'), s('active')], null), { kind: 'landed', at })
      expect(o.result).toBe('success')
      expect(o.badge).toBeNull()
    })
  })
  ```

- [ ] **Step 2: Write the failing agreement test.** Create `tests/sim/mission/recoveryAgreement.test.ts`. It reuses the measured setups from "Measured", stepped through production `nextFrameState`:

  ```ts
  import { describe, it, expect } from 'vitest'
  import { initialFrameStateFor, nextFrameState, type FrameState } from '../../../src/render/frame.js'
  import { debriefModel, destructionModel, landingModel } from '../../../src/render/debrief.js'
  import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
  import { bundleForScenario, loadAircraftSpec, loadAirfield } from '../../../tools/content/load.js'
  import { playerAircraft, withAircraftState } from '../../../src/sim/loop.js'
  import { createState } from '../../../src/sim/flight/state.js'
  import { v3 } from '../../../src/sim/math/vec3.js'
  import { deckOf, deckWorld } from '../../../src/sim/world/deck.js'
  import type { TerrainField } from '../../../src/sim/world/terrain.js'
  import { zeroKillsByType } from '../../../src/sim/weapons/targetType.js'
  import type { LandingAt } from '../../../src/sim/landing.js'
  import { missionOutcome, recoveryOf } from '../../../src/sim/mission/outcome.js'
  import { NORTH, flatField } from './fixture.js'

  /**
   * Spec 2026-09-25 §1: "A Tier 1 test pins that the render banking path and
   * the mission outcome agree on every recovery kind." The render path is
   * what main.ts banks from: `frame.landing.report` into `landingModel`, or
   * the player's `impact` into `debriefModel`, or combat destruction into
   * `destructionModel`. Each builder's `outcome` must equal the kind
   * `recoveryOf` reads off the same world, and for a landing, `at` must be
   * the same place.
   */
  const GEAR_M = loadAircraftSpec('f6f-hellcat').gear.heightM
  const TAC = loadAirfield('tacloban').runway.center
  const CV_1 = { id: 'cv-1', spec: 'essex-cv', waypoints: [[-25629, -16479]], speedMps: 0 }
  const FRAME = 1 / 60
  const NO_KEYS: ReadonlySet<string> = new Set()
  const kills = zeroKillsByType()

  function frameFor(ships: unknown[], landAt: string, terrain: TerrainField | null): FrameState {
    const raw = {
      id: 'agreement', player: 'f6f-1', airfields: ['tacloban'],
      aircraft: [{ id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [TAC.x, 500, TAC.z], headingDeg: 0, speedMps: 60 } }],
      ships, weather: { windFromDeg: 0, windMps: 0 },
      objectives: [{ id: 'home', label: 'Recover', priority: 'primary', kind: 'land', at: landAt }],
    }
    return initialFrameStateFor(worldFromScenario(bundleForScenario(parseScenario(raw)), terrain))
  }

  /** The player's body origin at (x, originY, z), north at `speed`, sinking at `sink`. */
  function put(f: FrameState, x: number, originY: number, z: number, speed: number, sink: number, gear: number): FrameState {
    return { ...f, world: withAircraftState(f.world, f.world.player, createState({
      position: v3(x, originY, z), velocity: v3(0, -sink, -speed), attitude: NORTH, gearFraction: gear, flapFraction: 1, tick: f.world.tick,
    })) }
  }

  const frames = (f: FrameState, stop: (f: FrameState) => boolean): FrameState => {
    let g = f
    for (let i = 0; i < 120 && !stop(g); i++) g = nextFrameState(g, FRAME, NO_KEYS)
    return g
  }

  /** Latch airborne, settle from 0.4 m (wheels), come to rest: as measured 2026-09-25. */
  function land(f: FrameState, x: number, groundY: number, z: number): FrameState {
    let g = nextFrameState(put(f, x, groundY + GEAR_M + 50, z, 45, 0, 1), FRAME, NO_KEYS)
    g = frames(put(g, x, groundY + GEAR_M + 0.4, z, 30, 1, 1), (h) => h.landing.touchdown !== null)
    expect(g.landing.touchdown, 'no touchdown').not.toBeNull()
    g = nextFrameState(put(g, x, groundY + GEAR_M, z, 0, 0, 1), FRAME, NO_KEYS)
    expect(g.landing.report, 'no landing report').not.toBeNull()
    return g
  }

  function expectLandedAgreement(f: FrameState, at: LandingAt | null): void {
    const report = f.landing.report!
    expect(report.at).toEqual(at)
    const recovery = recoveryOf(f.world)
    expect(recovery).toEqual({ kind: 'landed', at })
    expect(landingModel(report, kills).outcome).toBe(recovery!.kind)
  }

  describe('the render banking path and the mission outcome agree (spec §1, §5)', () => {
    it('landed at an airfield: same base, and the badge rule sees the landing', () => {
      const f = land(frameFor([], 'tacloban', flatField(100)), TAC.x, 100, TAC.z)
      expectLandedAgreement(f, { kind: 'airfield', id: 'tacloban', name: 'Tacloban' })
      expect(missionOutcome(f.world.mission!, recoveryOf(f.world)!).result).toBe('success')
    })

    it('landed on a carrier', () => {
      const f0 = frameFor([CV_1], 'cv-1', null)
      const deck = deckOf(f0.world.ships[0]!)!
      const p = deckWorld(deck, 0, 0)
      const f = land(f0, p.x, deck.center.y, p.z)
      expectLandedAgreement(f, { kind: 'carrier', id: 'cv-1', name: 'cv-1' })
      expect(missionOutcome(f.world.mission!, recoveryOf(f.world)!).result).toBe('success')
    })

    it('landed off-field', () => {
      const f = land(frameFor([], 'tacloban', flatField(100)), 0, 100, 0)
      expectLandedAgreement(f, null)
      expect(missionOutcome(f.world.mission!, recoveryOf(f.world)!).reasons).toEqual(['Landed off-field', 'Recover: incomplete'])
    })

    it('ditched', () => {
      let f = nextFrameState(put(frameFor([], 'tacloban', flatField(0)), 0, 50, 0, 45, 0, 1), FRAME, NO_KEYS)
      f = frames(put(f, 0, 0.4, 0, 45, 1, 0), (g) => playerAircraft(g.world).impact !== null)
      const impact = playerAircraft(f.world).impact!
      expect(impact.kind).toBe('ditched')
      expect(debriefModel(impact, playerAircraft(f.world).state, kills).outcome).toBe('ditched')
      expect(recoveryOf(f.world)).toEqual({ kind: 'ditched' })
      expect(missionOutcome(f.world.mission!, recoveryOf(f.world)!).badge).toBeNull()
    })

    it('killed by impact', () => {
      let f = nextFrameState(put(frameFor([], 'tacloban', flatField(100)), 0, 100 + GEAR_M + 50, 0, 45, 0, 1), FRAME, NO_KEYS)
      f = frames(put(f, 0, 100 + GEAR_M + 0.4, 0, 60, 20, 0), (g) => playerAircraft(g.world).impact !== null)
      const impact = playerAircraft(f.world).impact!
      expect(impact.kind).toBe('destroyed')
      expect(debriefModel(impact, playerAircraft(f.world).state, kills).outcome).toBe('killed')
      expect(recoveryOf(f.world)).toEqual({ kind: 'killed' })
    })

    it('destroyed in the air', () => {
      const f = frameFor([], 'tacloban', null)
      const rec = f.world.combat.aircraft['f6f-1']!
      const world = { ...f.world, combat: { ...f.world.combat, aircraft: { ...f.world.combat.aircraft, 'f6f-1': { ...rec, damage: { ...rec.damage, destroyedAt: 5, attacker: 'bandit' } } } } }
      expect(destructionModel(playerAircraft(world).state, 'bandit', kills).outcome).toBe('killed')
      expect(recoveryOf(world)).toEqual({ kind: 'killed' })
      expect(missionOutcome(world.mission!, recoveryOf(world)!).reasons).toEqual(['Killed', 'Recover: incomplete'])
    })
  })
  ```

- [ ] **Step 3: Run to verify they fail.**

  Run: `npx vitest run tests/sim/mission/outcome.test.ts tests/sim/mission/recoveryAgreement.test.ts --maxWorkers=2`
  Expected: FAIL. Cannot resolve `src/sim/mission/outcome.js`.

- [ ] **Step 4: Create `src/sim/mission/outcome.ts`.**

  ```ts
  import type { LandingAt } from '../landing.js'
  import type { World } from '../loop.js'
  import type { Badge } from './schema.js'
  import { lastLanding, type MissionState, type ObjectiveState, type ResolvedObjective } from './state.js'

  /** How the flight ended. The kinds are `RecoveryOutcome`'s words in
   *  src/render/debrief.ts, so the debrief and the badge rule cannot drift
   *  apart silently (tests/sim/mission/recoveryAgreement.test.ts). */
  export type Recovery =
    | { readonly kind: 'landed'; readonly at: LandingAt | null }
    | { readonly kind: 'ditched' }
    | { readonly kind: 'killed' }

  /**
   * The recovery the mission sees for the player right now, read from the
   * same world the frame debriefs from: an impact (ditched or killed), combat
   * destruction (killed), else the mission's most recent landing. Call it
   * when the frame shows a debrief; `null` means still flying with no
   * landing recorded (or no mission, for a landing).
   */
  export function recoveryOf<M>(world: World<M>): Recovery | null {
    const player = world.aircraft.find((a) => a.id === world.player)
    if (player === undefined) throw new Error(`recoveryOf: no player aircraft "${world.player}"`)
    if (player.impact !== null) return { kind: player.impact.kind === 'ditched' ? 'ditched' : 'killed' }
    if (world.combat.aircraft[world.player]?.damage.destroyedAt != null) return { kind: 'killed' }
    const landing = world.mission === null ? undefined : lastLanding(world.mission)
    return landing === undefined ? null : { kind: 'landed', at: landing.at }
  }

  export type FinalStatus = 'complete' | 'incomplete' | 'failed'

  /** As the debrief stamps it. `protect` and `deny` complete "when the
   *  mission ends" without failing (spec §2.1), so a live one reads
   *  complete; one still waiting on `after` does not. */
  export function finalStatus(o: ResolvedObjective, p: ObjectiveState): FinalStatus {
    if (p.status === 'failed') return 'failed'
    if (p.status === 'complete') return 'complete'
    if (p.status === 'active' && (o.kind === 'protect' || o.kind === 'deny')) return 'complete'
    return 'incomplete'
  }

  export type ObjectiveResult = {
    readonly id: string
    readonly label: string
    readonly priority: 'primary' | 'secondary'
    readonly final: FinalStatus
  }

  export type MissionOutcome = {
    readonly result: 'success' | 'no-badge'
    /** The scenario's badge on success, else `null`. */
    readonly badge: Badge | null
    /** Why not, in fixed order (ruling R16); empty on success. */
    readonly reasons: readonly string[]
    readonly objectives: readonly ObjectiveResult[]
  }

  /**
   * Spec §2.4. Success, and the badge, need BOTH every primary objective
   * complete AND a landing with a non-null `at`. Ditching, an off-field
   * landing, a failed or incomplete primary and death each earn no badge;
   * secondary objectives never gate it.
   */
  export function missionOutcome<M>(m: MissionState<M>, recovery: Recovery): MissionOutcome {
    const objectives: ObjectiveResult[] = m.objectives.map((o, i) => ({
      id: o.id, label: o.label, priority: o.priority, final: finalStatus(o, m.progress[i]!),
    }))
    const reasons: string[] = []
    if (recovery.kind === 'killed') reasons.push('Killed')
    else if (recovery.kind === 'ditched') reasons.push('Ditched')
    else if (recovery.at === null) reasons.push('Landed off-field')
    const primary = objectives.filter((o) => o.priority === 'primary')
    for (const o of primary) if (o.final === 'failed') reasons.push(`${o.label}: failed`)
    for (const o of primary) if (o.final === 'incomplete') reasons.push(`${o.label}: incomplete`)
    const success = reasons.length === 0
    return { result: success ? 'success' : 'no-badge', badge: success ? m.badge : null, reasons, objectives }
  }
  ```

- [ ] **Step 5: Run to verify they pass.**

  Run: `npx vitest run tests/sim/mission/outcome.test.ts tests/sim/mission/recoveryAgreement.test.ts --maxWorkers=2`
  Expected: PASS.

- [ ] **Step 6: Verify and commit.**

  ```bash
  npm run verify; rc=$?; echo "rc=$rc"   # rc=0
  git add src/sim/mission/outcome.ts tests/sim/mission/outcome.test.ts tests/sim/mission/recoveryAgreement.test.ts
  git commit -m "M1 Task 7: mission outcome and badge rule; render and mission agree on every recovery kind"
  ```

---

### Task 8: Handoff, §15 row, README

**Files:**
- Create: `docs/handoff/<YYYY-MM-DD>-m1-mission-engine.md`, named with the date the work completes
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (the Plan 9 row of the §15 table)
- Modify: `README.md` (one paragraph in `## Status`, beside the other plan paragraphs that point at §15)

- [ ] **Step 1: Re-measure the gate one last time.** Run `npx tsx .superpowers/m1/digest.ts 1800` and `node --version`. Record both in the handoff.

- [ ] **Step 2: Write the handoff.** In this order:
  1. **What changed:** one bullet per commit, with its SHA.
  2. **The bit-identity evidence:** the six baseline hashes and the six final hashes (they must match), the node version, and which tasks re-ran the probe.
  3. **The rulings** R1-R16, by number, one line each, pointing at this plan for the reasoning. Also the ones the executor added in `.superpowers/sdd/m1-mission-engine/progress.md`.
  4. **Forward notes for M2, stated plainly:**
     - **Spawned entities have no mesh.** `src/render/scenarioEntities.ts:102` builds one airframe per `world.aircraft` entry at load, and `main.ts` indexes `smokes[i]!`. A spawned aircraft, appended at the end, would throw there. M2 must build meshes for held groups at load, hidden until spawned, before any mission with a held group ships. M3's Airfield Strike is the first.
     - **Intermediate landings.** The frame's tracker still latches `frame.landing.report` until `acknowledgeLanding`. M2 reads `lastLanding(world.mission)`: when `intermediate` is `true`, it shows the radio line and acknowledges instead of opening the debrief.
     - **Recovery.** Call `recoveryOf(world)` at the moment the frame shows a debrief, then `missionOutcome(mission, recovery)` for the objectives block, the badge and `reasons`.
     - **The radio line** reads `radioMessages(mission)`, keyed by `tick` (R7).
     - **`briefing` and `history`** keys are M2's to add (R15).
  5. **Forward notes for M3:**
     - Deck Quals' secondary objective, "no wave-offs", has **no objective kind** in spec §2.1's vocabulary. M3's plan must decide how to express it, and must first confirm that the Paddles `wave-off` cue can be counted by its edges (spec §4.1). Adding a kind is a vocabulary change under spec §0.3's "objectives + simple triggers".
     - Dulag's buildings need `tags` (`dulag-hangars`, `dulag-aaa`) when M3 adds its AAA content.
     - `tests/sim/mission/content.test.ts` will build each new mission file automatically.
  6. **For Lane A (7e):** `spawnHeldGroup(world, groupId)` is the insertion path its "spawn a pilot at tick 3,000" test needs. `pilotAssignmentFrom` is unchanged.
  7. **No Tier 2,** and why: M1 is Tier 1 only (spec §9), and nothing in it is visible in a browser.

- [ ] **Step 3: Update the §15 Plan 9 row.** In `docs/superpowers/specs/2026-09-12-ww2airsim-design.md`, in the `| 9 | 15 | Meta-game |` row's Status cell:
  - Replace "Open: roster export/import has no UI caller yet (a replace-vs-merge design decision is needed first); badge content (no scenario declares an objective yet)" with:

  `Missions: M1, the sim-side engine (objectives, triggers, held groups, outcome and badge rule), complete YYYY-MM-DD, Tier 1 only ([design](2026-09-25-missions-design.md), [plan](../plans/2026-09-25-m1-mission-engine.md), [handoff](../../handoff/YYYY-MM-DD-m1-mission-engine.md)); M2 (UI), M3 (Deck Quals, Airfield Strike, Convoy Strike) and M4 (Combat Air Patrol, after 7e) not started, so no shipped scenario declares an objective yet. Open: roster export/import has no UI caller yet (a replace-vs-merge design decision is needed first)`

  Re-diff that row against `HEAD` first; another plan may have edited it.

- [ ] **Step 4: Add a README paragraph** in `## Status`, beside the other plan paragraphs:

  `**Missions have an engine, headless (M1, YYYY-MM-DD):** a scenario that declares objectives now runs them in the sim every tick. There are seven objective kinds, triggers that fire once, and held groups that enter mid-flight, and only a landing at a named base earns a badge. No shipped scenario uses it until M3, and nothing shows it until M2. See the [handoff](docs/handoff/YYYY-MM-DD-m1-mission-engine.md); master spec §15 holds the status.`

- [ ] **Step 5: Verify and commit.**

  ```bash
  npm run verify; rc=$?; echo "rc=$rc"   # rc=0
  git add docs/handoff/*-m1-mission-engine.md docs/superpowers/specs/2026-09-12-ww2airsim-design.md README.md
  git commit -m "M1 handoff: the mission engine, headless and bit-identical"
  ```

  Email the handoff to Mark once: `python3 tools/mail-doc.py docs/handoff/<file>.md "ww2airsim handoff: M1 mission engine"`. Exit 0 means it was sent. Never re-run it with `--debug`.

---

## Self-review

**Spec coverage (spec §9 item 1, and the §5 Tier 1 bullets that M1 owns):**

| Spec item | Where |
| --- | --- |
| §1 `src/sim/mission/` schema, state, step, outcome | Tasks 2, 3, 5 and 6, and 7 |
| §1 `World.mission` `null` without objectives; bit-identity gate | Task 3 (field and `null`), Tasks 1, 3 and 5 (digest probe), Task 5 (in-process identity test) |
| §1 recovery moves into the sim; one signal; agreement test | Task 1 (move, `at.id`), Task 5 (per-tick tracking), Task 7 (agreement over six kinds) |
| §1 `spawnHeldGroup`, the only post-tick-0 path | Task 4; used by triggers in Tasks 5 and 6 |
| §2.1 seven objective kinds, `after`, priorities, `count` defaults | Task 2 (schema), Task 5 (behavior) |
| §2.1 tags on entities and structures; a tag matching nothing is an error | Task 2 (schema), Task 3 (resolution and errors) |
| §2.2 triggers: four conditions, spawn and message, once, file order | Task 2 (schema), Task 6 |
| §2.3 held groups: unique ids, referenced before spawn | Task 2 (ids), Task 3 (resolution before spawn), Task 5 (unspawned target and hostile) |
| §2.4 outcome: success, ditched, failure announced and non-terminal, killed, secondaries, intermediate landings | Task 5 (announcement, non-terminal, intermediate flag), Task 7 (the rules) |
| §5 every scenario parses; references resolve | Task 3 `content.test.ts` |
| §5 triggers once; identical logs across runs | Task 6 |
| §5 roster round-trip with badges; headless mission runs; Tier 2; content checks | **Not M1.** The roster badge write is M2 (§9), headless mission runs and Tier 2 specs are M3, and content and ASSETS checks come with M3's content |

**Placeholder scan.** The only fill-ins are the handoff's completion date (`YYYY-MM-DD`, filled when the work completes) and the commit SHAs it lists. Task 5's `landOnce` failure advice is a diagnostic instruction, not an unfilled step.

**Type consistency.** These names are used identically in every task:
- `MissionState<M>`, `ObjectiveState {status, count, heldTicks}`, `ResolvedObjective.resolved`, `HeldGroup<M>`
- `MissionLogEntry` kinds `objective`/`trigger`/`spawn`/`message`/`landing`
- `MissionTick<M>`, `MissionStep<M>.spawns`, `SpawnParts<M>`
- `spawnInto(parts, groupId)`, `spawnHeldGroup(world, groupId)`, `createMission<M>(input)`, `resolveRefs(scenarioId, where, refs, entities)`, `ticksFor(seconds)`
- `recoveryOf(world)`, `missionOutcome(mission, recovery)`, `finalStatus(o, p)`
- `LandingAt {kind, id, name}`
- `scenarioAircraftSpecIds`, `scenarioShipSpecIds`

The fixture helpers `missionWorld`, `steps`, `progressOf`, `putPlayer`, `moveAircraft`, `destroyShip`/`destroyAircraft`/`destroyStructure`, `landOnce`, `flatField`, `NORTH`, `REACH_FAR` and `deepFreeze` are each defined once, in the task that first needs them.

**Review Focus coverage:**

| Item | Test |
| --- | --- |
| 1 | Task 5, "a landing before the objective is active advances nothing" |
| 2 | Task 3, the four "fails the load when …" tests |
| 3 | Task 5, "a destroyed player accumulates nothing more"; Task 6, `enters` "never for a dead player"; Task 7, "destroyed in the air" |
| 4 | Task 6, "a spawn inside a five-step advance is stepped by the rest of that call" |
| 5 | Task 5, "a destroyed hostile inside the ring…" and "an unspawned hostile…" |
