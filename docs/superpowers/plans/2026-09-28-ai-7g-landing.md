# Plan 7g — Landing AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI pilots with a `home` return to it when out of ammunition, damaged,
low on fuel or idle. They fly an approach to a runway or a moving carrier,
obey the LSO, go around when they must, land, and are respotted clear of the
landing area.

**Architecture:** One new pure module, `src/sim/ai/recovery.ts`, owns the
return-to-base decision and the phase machine (`transit`, `hold`, `join`,
`configure`, `final`, `go-around`, `rollout`, `landed`). `pilotTick` calls it
as a new top-level mode, `rtb`/`landed`. The approach autopilot is promoted
from `tools/` into `src/sim/ai/approach.ts` with three optional profile
fields. Park spots are pure geometry in `src/sim/ai/parkSpots.ts`. A pilot's
home is resolved to plain data when the world is built, so `loop.ts` is not
edited.

**Tech Stack:** TypeScript, zod (scenario schema), vitest (Tier 1),
Playwright on the reference GPU (Tier 2).

**Spec:** `docs/superpowers/specs/2026-09-27-ai-7g-landing-design.md`, which
amends §6 of `docs/superpowers/specs/2026-09-25-ai-7c-design.md`. Read both:
§6 of the older file for the base design, the newer one for what changed.

**Execution:** worktree (Mark, 2026-09-28). Branch `worktree-ai-7g-landing`,
worktree `/home/mark/projects/ww2airsim-worktrees/ai-7g-landing`.
**Viewing checkpoint:** final product only. **Run:** unattended (Mark,
2026-09-28). Collect the Tier 2 captures in the handoff.

**Ledger:** `.superpowers/sdd/2026-09-28-ai-7g-landing/progress.md` (gitignored). Write every
ruling there as you make it, with what it costs if reversed.

## Global Constraints

- Everything new under `src/sim/` imports only from `src/sim/`.
  `.dependency-cruiser.cjs` is untouched and
  `tests/architecture/boundary.test.ts` must still pass.
- Pure and deterministic. The only randomness is the existing per-pilot
  `noiseCursor`. Every new choice between aircraft breaks ties by id, never by
  array position.
- Every new field is plain data, so a `World` round-trips through
  `structuredClone`.
- Airframe-agnostic: no AI code names an airframe. Approach speed comes from
  `reference.stallSpeedFlapMps`/`effectiveStallSpeedMps`, and park spacing
  from `geometry.wingSpanM`.
- `loop.ts` is not edited (spec §7).
- Both landing tests' inline snapshots (`tests/sim/landing.test.ts`,
  `tests/sim/carrierLanding.test.ts`, `tests/tools/approach.test.ts`) stay
  bit-identical. They are the proof the runway profile did not move.
- Landing has no scoring effect.
- `npm run verify` ends every task, run as `remote-run npm run verify`. Capture
  `rc=$?` directly; never gate on a grepped pipeline. On nexus run only the
  files you touch: `npx vitest run <file>`.
- Tier 2 specs never import `src/render/content.ts` (it crashes Playwright's
  loader). Run a Tier 2 spec by path.
- US spelling.
- `src/render/main.ts` is also being edited by the Instant Replay work. Re-diff
  against `main`'s `HEAD` before the merge.

## Review Focus

1. **A recovery that starts while the target home is behind terrain or across
   the island.** `transit` flies straight at the initial point. Over Leyte
   that line can cross 1,000 m+ ridges. `transit` keeps the 400 m floor
   recovery, so a hill turns into a climb, not a crash. Task 5 flies a
   Dulag-to-Tacloban transit over real terrain and asserts `impact` stays
   null (skips without tiles).
2. **The carrier turns at a waypoint during the approach.** The deck heading
   changes under a pilot on final. The aim point, heading and fix are
   recomputed from the live deck every tick. Task 7's carrier test uses a
   ship whose next turn is far away, and Task 6 adds a case where the ship
   turns 30° while the pilot is at the fix: it must go around or land, never
   crash (`impact` null).
3. **Two AI with the same home trigger RTB on the same tick.** Id order must
   decide who approaches first, and the second must hold. Task 8's interval
   test starts them at the same distance and asserts the order by id, not by
   array position (it reverses the array and gets the same result).
4. **An AI in `rtb` is attacked.** A threat astern pre-empts the recovery
   (spec §6: RTB does not pre-empt `engage` when threatened). After the
   threat is gone, it must resume at `transit`, not mid-`final`. Task 4
   covers it.
5. **Home ship sunk or not in the world any more.** A held-group or sunk
   carrier leaves `home.id` pointing at nothing (`ctx.ships` without it, or
   `deckOf` null). The pilot must not throw: it drops `home` and loiters.
   Task 5 covers it.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/sim/ai/approach.ts` (new, promoted) | `approachControls`, `ApproachTarget` (+ 3 optional profile fields), `VREF_STALL_MULTIPLE` |
| `tools/autopilot/approach.ts` | becomes a one-line re-export |
| `src/sim/ai/airborne.ts` (new) | `airborne(entity, terrain, decks)`, moved from `formation.ts`'s `leaderAirborne` |
| `src/sim/ai/parkSpots.ts` (new) | `deckParkSpots`, `runwayParkSpots`, `parkedStateOnRunway` |
| `src/sim/ai/recovery.ts` (new) | RTB triggers, `RecoveryState`, phase machine, interval, capture window, go-around, respot |
| `src/sim/ai/pilot.ts` | `RecoveryHome`, `RecoveryPhase`, `RecoveryState`, `recovery` field on `PilotDecisionState`, `home` on `PilotAssignment` (type lives in `pursuit.ts`) |
| `src/sim/ai/pursuit.ts` | `PilotAssignment.home?` |
| `src/sim/ai/pilotTick.ts` | the `rtb`/`landed` modes, safety exemption |
| `src/sim/ai/targeting.ts`, `src/sim/ai/autoPursuit.ts` | ground state instead of `parked` |
| `src/sim/ai/formation.ts` | imports `airborne` |
| `src/sim/scenario.ts` | `pilot.home` schema, resolution, validation |
| `content/scenarios/recovery-range.json` (new) | dev scenario |
| `src/render/main.ts` | `recovery` phase in `__ww2.aircraft()` |
| `tests/sim/ai/recovery*.test.ts`, `tests/sim/ai/recoveryWorlds.ts`, `tests/sim/ai/parkSpots.test.ts`, `tests/sim/ai/approach.test.ts`, `tests/content/recoveryParkSpots.test.ts`, `tests/tier2/recovery.spec.ts` | tests |

---

### Task 0: Worktree and baseline

**Files:** none committed.

- [ ] **Step 1: Create the worktree from `main`**

```bash
cd /home/mark/projects/ww2airsim
git worktree add /home/mark/projects/ww2airsim-worktrees/ai-7g-landing -b worktree-ai-7g-landing main
cd /home/mark/projects/ww2airsim-worktrees/ai-7g-landing
npm ci
```

- [ ] **Step 2: Give the worktree the gitignored terrain data**

The landing tests need `content/terrain/tiles/` and the terrain levels. They
are gitignored and exist only in the primary checkout. Symlink what is missing,
never copy over and never `git clean`:

```bash
P=/home/mark/projects/ww2airsim
for d in content/terrain/tiles tools/terrain/cache; do
  [ -e "$d" ] || { [ -e "$P/$d" ] && ln -s "$P/$d" "$d"; }
done
ls content/terrain/ | head
```

- [ ] **Step 3: Baseline, and confirm the landing tests RUN rather than skip**

```bash
npx vitest run tests/sim/landing.test.ts tests/sim/carrierLanding.test.ts tests/tools/approach.test.ts --reporter=verbose; echo "rc=$?"
remote-run npm run verify; echo "rc=$?"
```

Expected: both `rc=0`, and the verbose run lists all three files as passed,
not skipped. Record the baseline test and skip counts in the ledger. If
`remote-run` reports named skips for terrain-backed tests that pass on nexus,
check `.remote-run-data` before going on.

---

### Task 1: Promote the approach autopilot, with an LSO profile

**Files:**
- Create: `src/sim/ai/approach.ts` (content moved from `tools/autopilot/approach.ts`)
- Modify: `tools/autopilot/approach.ts` (becomes a re-export)
- Test: `tests/sim/ai/approach.test.ts` (new)

**Interfaces:**
- Produces: `approachControls(spec, state, target: ApproachTarget): Controls`;
  `ApproachTarget` with new optional `approachSpeedMps?: number`,
  `glidePathRad?: number`, `flareHeightM?: number`; `VREF_STALL_MULTIPLE`;
  `DEFAULT_GLIDE_PATH_RAD` (exported, = 3°); `carrierApproachProfile(spec, deck, params)`
  returning `{ aimX, aimZ, runwayHeadingRad, touchdownElevationM, surfaceVelocity, hookDown: true, approachSpeedMps, glidePathRad, flareHeightM: 0 }` minus `windVelocity` (the caller adds it).

- [ ] **Step 1: Move the file with git so history follows it**

```bash
git mv tools/autopilot/approach.ts src/sim/ai/approach.ts
```

Fix its three imports from `../../src/sim/...` to `../flight/schema.js`,
`../flight/state.js`, `../math/vec3.js`. Rewrite the docstring paragraph that
begins "In `tools/` and not `src/`": it is now Plan 7g's AI approach, and
`tools/autopilot/approach.ts` re-exports it for the tests that already import
it. Keep the rest of the comments verbatim.

- [ ] **Step 2: Recreate `tools/autopilot/approach.ts` as a re-export**

```ts
/** Moved to src/sim/ai/approach.ts by Plan 7g (7c-7g design §6); kept so the
 *  landing tests and tools that import it stay put. */
export * from '../../src/sim/ai/approach.js'
```

- [ ] **Step 3: Run the three snapshot holders; they must pass unchanged**

```bash
npx vitest run tests/sim/landing.test.ts tests/sim/carrierLanding.test.ts tests/tools/approach.test.ts tests/sim/paddles.test.ts tests/sim/mission/passes.test.ts; echo "rc=$?"
```

Expected: `rc=0`, and no snapshot was written (`git status` shows no test file
modified).

- [ ] **Step 4: Write the failing profile tests**

`tests/sim/ai/approach.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadAircraftSpec, loadScenarioBundle } from '../../../tools/content/load.js'
import { worldFromScenario } from '../../../src/sim/scenario.js'
import { advance, playerAircraft, withAircraftState, withControls, type World } from '../../../src/sim/loop.js'
import { createState, DT } from '../../../src/sim/flight/model.js'
import { MAX_SUPPORTED_SINK_MPS } from '../../../src/sim/ground.js'
import { deckOf, deckWorld, deckLocal } from '../../../src/sim/world/deck.js'
import { approachControls, carrierApproachProfile, DEFAULT_GLIDE_PATH_RAD } from '../../../src/sim/ai/approach.js'
import { paddlesCue, type PaddlesCue } from '../../../src/sim/paddles.js'
import { v3, sub, length } from '../../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'

const f6f = loadAircraftSpec('f6f-hellcat')

describe('the carrier approach profile (7g spec §5)', () => {
  it('defaults reproduce the runway profile exactly', () => {
    const state = createState({ position: v3(0, 200, 4000), velocity: v3(0, -2.5, -49), gearFraction: 1, flapFraction: 1 })
    const base = { aimX: 0, aimZ: 0, runwayHeadingRad: 0, touchdownElevationM: 0 }
    expect(approachControls(f6f, state, { ...base, glidePathRad: DEFAULT_GLIDE_PATH_RAD }))
      .toEqual(approachControls(f6f, state, base))
  })

  it('flies the LSO numbers onto the deck: no wave-off before the cut, a trap in the zone, a supported sink', () => {
    // deck-quals, terrain null: the deck is the only ground this test needs.
    let world: World<undefined> = worldFromScenario(loadScenarioBundle('deck-quals'), null)
    const cv = world.ships.find((s) => s.id === 'cv-1')!
    const deck0 = deckOf(cv)!
    const wind = world.wind!
    const profile0 = carrierApproachProfile(f6f, deck0, cv.spec.paddles!)
    const along = v3(Math.sin(deck0.headingRad), 0, -Math.cos(deck0.headingRad))
    const start = { x: profile0.aimX - along.x * 4000, z: profile0.aimZ - along.z * 4000 }
    world = withAircraftState(world, world.player, createState({
      position: v3(start.x, deck0.center.y + f6f.gear.heightM + 4000 * Math.tan(profile0.glidePathRad), start.z),
      velocity: v3(along.x * (profile0.approachSpeedMps + 7.717), 0, along.z * (profile0.approachSpeedMps + 7.717)),
      attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - deck0.headingRad),
      gearFraction: 1, flapFraction: 1,
    }))
    world = { ...world, aircraft: world.aircraft.map((a) => (a.id === world.player ? { ...a, parked: false } : a)) }
    const cues: PaddlesCue[] = []
    let sink: number | null = null
    let stopped = false
    for (let i = 0; i < 60 * 300 && !stopped; i++) {
      const before = playerAircraft(world).state
      const deck = deckOf(world.ships.find((s) => s.id === 'cv-1')!)!
      const controls = approachControls(f6f, before, { ...carrierApproachProfile(f6f, deck, cv.spec.paddles!), windVelocity: wind })
      const cue = paddlesCue(f6f, before, controls, deck, cv.spec.paddles!, wind)
      if (cue !== null) cues.push(cue)
      world = advance(withControls(world, world.player, controls), DT).world
      const now = playerAircraft(world).state
      expect(playerAircraft(world).impact, `crashed at tick ${now.tick}`).toBeNull()
      const deckNow = deckOf(world.ships.find((s) => s.id === 'cv-1')!)!
      const wheels = now.position.y - f6f.gear.heightM - deckNow.center.y
      if (sink === null && wheels < 0.05) sink = -(before.velocity.y - deckNow.velocity.y)
      stopped = now.arrested && length(sub(now.velocity, deckNow.velocity)) < 1
    }
    const firstCut = cues.indexOf('cut')
    const firstWaveOff = cues.indexOf('wave-off')
    expect(firstCut, 'the LSO never gave the cut').toBeGreaterThanOrEqual(0)
    expect(firstWaveOff === -1 || firstWaveOff > firstCut, `wave-off at cue ${firstWaveOff} before the cut at ${firstCut}`).toBe(true)
    expect(stopped, 'never trapped').toBe(true)
    expect(sink!).toBeLessThan(MAX_SUPPORTED_SINK_MPS)
    const deckEnd = deckOf(world.ships.find((s) => s.id === 'cv-1')!)!
    const rest = deckLocal(deckEnd, playerAircraft(world).state.position.x, playerAircraft(world).state.position.z)
    const fromStern = rest.z + deckEnd.lengthM / 2
    expect(fromStern).toBeGreaterThan(deckEnd.trapFromSternM)
    expect(fromStern).toBeLessThan(deckEnd.trapToSternM + 40)
  })
})
```

- [ ] **Step 5: Run it and confirm it fails**

Run: `npx vitest run tests/sim/ai/approach.test.ts`
Expected: FAIL: `carrierApproachProfile` and `DEFAULT_GLIDE_PATH_RAD` are not exported.

- [ ] **Step 6: Implement the profile fields**

In `src/sim/ai/approach.ts`:

```ts
// On ApproachTarget, after hookDown:
  /** 7g spec §5: the approach speed (an airspeed). Default Vref,
   *  VREF_STALL_MULTIPLE x the full-flap stall. A carrier AI flies the LSO's
   *  APPROACH_SPEED_STALL_MULTIPLE instead. */
  readonly approachSpeedMps?: number
  /** 7g spec §5: the path angle. Default DEFAULT_GLIDE_PATH_RAD (3°). */
  readonly glidePathRad?: number
  /** 7g spec §5: wheel height at which the flare starts. Default
   *  FLARE_HEIGHT_M (12 m). 0 = no flare: fly the path onto the deck, as a
   *  carrier pilot does. */
  readonly flareHeightM?: number
```

Rename `GLIDE_PATH_RAD` to an exported `DEFAULT_GLIDE_PATH_RAD` (same value,
same comment). In `approachControls`, read the three fields once at the top:

```ts
  const vrefMps = target.approachSpeedMps ?? VREF_STALL_MULTIPLE * spec.reference.stallSpeedFlapMps
  const glidePathRad = target.glidePathRad ?? DEFAULT_GLIDE_PATH_RAD
  const flareHeightM = target.flareHeightM ?? FLARE_HEIGHT_M
```

and use `glidePathRad` in both `Math.tan(...)`/`Math.sin(...)` sites and
`flareHeightM` in the flare test. Absent fields give the same numbers through
the same operations, so the snapshots cannot move.

Then add, with its imports (`APPROACH_SPEED_STALL_MULTIPLE` from
`../paddles.js`, `effectiveStallSpeedMps` from `../ground.js`, `deckWorld`
and `Deck` from `../world/deck.js`, `PaddlesParams` from `../world/ships.js`):

```ts
/**
 * 7g spec §5: an approach to `deck` flown to the LSO's own numbers, so an AI
 * that obeys the wave-off can land. Measured 2026-09-28 (the spec's table):
 * today's runway profile draws 277 wave-off ticks before any cut; this one
 * draws none before the cut and traps 97 m from the stern. The aim is the
 * trap zone's CENTER, the point `paddlesCue` measures the glideslope to.
 * `windVelocity` is the caller's: the world's wind.
 */
export function carrierApproachProfile(spec: AircraftSpec, deck: Deck, paddles: PaddlesParams): Omit<Required<ApproachTarget>, 'windVelocity'> {
  const aim = deckWorld(deck, 0, -deck.lengthM / 2 + (deck.trapFromSternM + deck.trapToSternM) / 2)
  return {
    aimX: aim.x, aimZ: aim.z, runwayHeadingRad: deck.headingRad,
    touchdownElevationM: deck.center.y, surfaceVelocity: deck.velocity, hookDown: true,
    approachSpeedMps: APPROACH_SPEED_STALL_MULTIPLE * effectiveStallSpeedMps(spec, 1),
    glidePathRad: (paddles.glideslopeDeg * Math.PI) / 180,
    flareHeightM: 0,
  }
}
```

If `paddles.ts` importing nothing from `ai/` and `ai/approach.ts` importing
`paddles.ts` creates a cycle, depcruise will say so. It should not: `paddles.ts`
imports only flight, ground, world and math.

- [ ] **Step 7: Run the new test and the snapshot holders**

```bash
npx vitest run tests/sim/ai/approach.test.ts tests/sim/landing.test.ts tests/sim/carrierLanding.test.ts tests/tools/approach.test.ts; echo "rc=$?"
```

Expected: `rc=0`. If the carrier case fails on the rest position or sink,
record the measured numbers in the ledger and read the spec §5 table again
before changing anything. The probe measured this exact setup.

- [ ] **Step 8: verify and commit**

```bash
remote-run npm run verify; echo "rc=$?"
git add -A src/sim/ai/approach.ts tools/autopilot/approach.ts tests/sim/ai/approach.test.ts
git commit -m "7g Task 1: approach autopilot promoted to src/sim/ai, with the LSO's carrier profile"
```

---

### Task 2: Targeting reads ground state, not the spawn flag

**Files:**
- Create: `src/sim/ai/airborne.ts`
- Modify: `src/sim/ai/formation.ts:229` (`leaderAirborne` moves out), `src/sim/ai/pilotTick.ts` (import, `TargetingView` construction), `src/sim/ai/targeting.ts:52-58`, `src/sim/ai/autoPursuit.ts:51`
- Test: `tests/sim/ai/targeting.test.ts` (add cases), `tests/sim/ai/autoPursuit.test.ts` (add a case)

**Interfaces:**
- Produces: `airborne<M>(a: AircraftEntity<M>, terrain: TerrainField | null, decks: readonly Deck[]): boolean`.
  `TargetingView<M>` gains `readonly terrain: TerrainField | null; readonly decks: readonly Deck[]`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/sim/ai/targeting.test.ts`. Use the file's existing world
builders if they fit. Otherwise build two raw-JSON scenarios with
`parseScenario` + `bundleForScenario` + `worldFromScenario` (the pattern in
`tests/sim/ai/formationWorlds.ts`):

```ts
describe('contacts are decided by ground state (7g spec §2)', () => {
  it('a hostile player who launched from a deck is a contact once airborne, though parked stays true', () => {
    // World: allied carrier cv-1 (essex-cv, still: two waypoints 20 km apart, speedMps 0.001),
    // player f6f-1 axis side, parkedAt the deck; one allied AI 'ai-1' airborne 3 km away at 1,000 m.
    // Then move the player 300 m above the deck with withAircraftState, leaving `parked: true`.
    const w = launchedPlayerWorld()
    const ai = aircraftById(w, 'ai-1')!
    const player = aircraftById(w, 'f6f-1')!
    expect(player.parked).toBe(true)
    const view = viewOf(w)
    expect(isContact(ai, player, view)).toBe(true)
  })

  it('a hostile standing on a runway or deck is not a contact, whatever parked says', () => {
    const w = landedHostileWorld() // an axis AI at rest on the deck, built airborne-spawned (parked: false) then placed with stateOnDeck
    const ai = aircraftById(w, 'ai-1')!
    const landed = aircraftById(w, 'axis-1')!
    expect(landed.parked).toBe(false)
    expect(isContact(ai, landed, viewOf(w))).toBe(false)
  })
})
```

with, in the same file:

```ts
const viewOf = (w: World<undefined>): TargetingView<undefined> => ({
  snapshot: w.aircraft, combat: w.combat.aircraft, sides: sidesOf(w, w.aircraft),
  terrain: w.terrain, decks: decksOf(w.ships),
})
```

Write `launchedPlayerWorld` and `landedHostileWorld` concretely in the test
file. The ship JSON form is in `content/scenarios/deck-quals.json`; `stateOnDeck`
is in `src/sim/mission/respot.ts`.

Add to `tests/sim/ai/autoPursuit.test.ts`: an axis AI that spawned parked on
Tacloban (`parkedAt`) and has been moved to 800 m altitude is returned by
`autoPursuitTarget`. Build it the same way.

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx vitest run tests/sim/ai/targeting.test.ts tests/sim/ai/autoPursuit.test.ts`
Expected: the new cases FAIL. The first two fail on `parked`, and TypeScript
rejects the `terrain`/`decks` fields on `TargetingView`.

- [ ] **Step 3: Implement**

`src/sim/ai/airborne.ts`:

```ts
import type { AircraftEntity } from '../loop.js'
import type { TerrainField } from '../world/terrain.js'
import type { Deck } from '../world/deck.js'
import { groundUnder } from '../world/ground.js'
import { onGround } from '../ground.js'

/**
 * Whether an aircraft is flying, decided from state. Never from
 * `AircraftEntity.parked`: that flag means "spawned on its wheels" and
 * nothing in the sim clears it, so a player who took off from a deck still
 * read as parked at 399 m (7f final review C1, 2026-09-27), and an AI that
 * landed would read as flying (7g spec §2).
 *
 * [Move the rest of `leaderAirborne`'s docstring here verbatim: the
 * `onGround`/`groundUnder` test, `GROUND_CONTACT_TOLERANCE_M`, and why
 * `groundUnder` null is airborne.]
 */
export function airborne<M>(a: AircraftEntity<M>, terrain: TerrainField | null, decks: readonly Deck[]): boolean {
  const under = groundUnder(terrain, decks, a.state.position.x, a.state.position.z)
  return under === null || !onGround(a.spec, a.state, under.heightM)
}
```

In `formation.ts`, delete `leaderAirborne` and its docstring. Keep a one-line
pointer: `// A parked leader: \`airborne\` (airborne.ts), shared with targeting (7g).`
Replace every `leaderAirborne(` caller (`pilotTick.ts`, tests) with
`airborne(`. Grep first: `grep -rn leaderAirborne src tests`.

`targeting.ts`: add the two fields to `TargetingView` with a doc line each,
and change `isContact`:

```ts
/** Opposite side, not down (destroyed or impacted), airborne by ground state
 *  (7g spec §2: never the spawn flag `parked`), and within
 *  `DETECTION_RANGE_M`. */
export function isContact<M>(self: AircraftEntity<M>, c: AircraftEntity<M>, view: TargetingView<M>): boolean {
  if (c.id === self.id) return false
  if (view.sides[c.id] === undefined || sameSide(view.sides, self.id, c.id)) return false
  if (isAircraftDown(view.combat, c)) return false
  if (!airborne(c, view.terrain, view.decks)) return false
  return length(sub(c.state.position, self.state.position)) <= DETECTION_RANGE_M
}
```

Order matters: `airborne` calls `groundUnder`, the costliest check, so it runs
after the cheap ones.

`pilotTick.ts`: `const view: TargetingView<M> = { snapshot, combat: ctx.combat.aircraft, sides: ctx.sides, terrain: ctx.terrain, decks: ctx.decks }`.

`autoPursuit.ts:51`: replace `a.parked ||` with a ground-state test:
`if (a.id === world.player || a.impact !== null) continue` followed by
`if (!airborne(a, world.terrain, decksOf(world.ships))) continue`. Hoist
`decksOf(world.ships)` out of the loop. Grep the whole repo for other
constructors of `TargetingView` (`grep -rn "TargetingView" src tests`) and
give each the two fields.

`holdFire.ts` is NOT changed: it must keep counting parked and landed
friendlies (spec §2).

- [ ] **Step 4: Run the AI suite on nexus, then verify**

```bash
npx vitest run tests/sim/ai/; echo "rc=$?"
remote-run npm run verify; echo "rc=$?"
```

Expected: `rc=0` both. If a furball or formation soak moves, that is a real
behavior change: record it in the ledger with before/after numbers. Do not
retune.

- [ ] **Step 5: Commit**

```bash
git add src/sim/ai/airborne.ts src/sim/ai/formation.ts src/sim/ai/pilotTick.ts src/sim/ai/targeting.ts src/sim/ai/autoPursuit.ts tests/sim/ai/
git commit -m "7g Task 2: targeting and auto-pursuit read ground state, not the parked spawn flag"
```

---

### Task 3: Park spots

**Files:**
- Create: `src/sim/ai/parkSpots.ts`
- Test: `tests/sim/ai/parkSpots.test.ts`

**Interfaces:**
- Produces:
  - `deckParkSpots(deck: Deck, wingSpanM: number): readonly { x: number; z: number }[]`, deck-local.
  - `runwayParkSpots(a: Airfield, wingSpanM: number): readonly { x: number; z: number }[]`, runway-local.
  - `parkedStateOnRunway(spec, a: Airfield, spot, groundHeightM, keep): AircraftState`.
  - Constants `PARK_BOW_MARGIN_M = 15`, `PARK_TRAP_CLEARANCE_M = 40`, `PARK_RUNWAY_OFFSET_M = 30`, `PARK_GAP_M = 3`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { loadAirfield, loadShipSpec, loadAircraftSpec } from '../../../tools/content/load.js'
import { deckParkSpots, runwayParkSpots, PARK_TRAP_CLEARANCE_M } from '../../../src/sim/ai/parkSpots.js'
import { insideRect, localToWorld } from '../../../src/sim/world/airfields.js'

const span = loadAircraftSpec('f6f-hellcat').geometry.wingSpanM
// A Deck needs a ship entity; build one from the spec the way tests/sim/world/deck.test.ts does.

describe('deck park (7g spec §3)', () => {
  it.each(['essex-cv', 'casablanca-cve'])('%s: every spot is on the deck, forward of the trap zone, and no two overlap', (shipId) => {
    const deck = deckFor(shipId)
    const spots = deckParkSpots(deck, span)
    expect(spots.length).toBeGreaterThanOrEqual(2)
    const trapForwardEdge = -deck.lengthM / 2 + deck.trapToSternM
    for (const s of spots) {
      expect(Math.abs(s.x) + span / 2).toBeLessThanOrEqual(deck.widthM / 2)
      expect(s.z).toBeLessThanOrEqual(deck.lengthM / 2 - span / 2)
      expect(s.z - span / 2).toBeGreaterThanOrEqual(trapForwardEdge + PARK_TRAP_CLEARANCE_M)
    }
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
      expect(Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.z - spots[j]!.z)).toBeGreaterThanOrEqual(span)
    }
  })
  it('fills from the bow: the first spot is the most forward', () => {
    const spots = deckParkSpots(deckFor('essex-cv'), span)
    expect(spots[0]!.z).toBe(Math.max(...spots.map((s) => s.z)))
  })
})

describe('runway park (7g spec §3, §7)', () => {
  it('Tacloban: every spot is off the runway, on the apron side, and outside every building', () => {
    const a = loadAirfield('tacloban')
    const spots = runwayParkSpots(a, span)
    expect(spots.length).toBeGreaterThanOrEqual(2)
    for (const s of spots) {
      expect(Math.abs(s.x) - span / 2).toBeGreaterThan(a.runway.widthM / 2)
      expect(Math.sign(s.x)).toBe(Math.sign(a.apron!.x))
      const w = localToWorld(a, s.x, s.z)
      for (const b of a.buildings) expect(insideRect(a, b, w.x, w.z), `spot in ${b.id}`).toBe(false)
    }
  })
  it('an airfield with no apron parks on local -x', () => {
    const a = { ...loadAirfield('dulag'), apron: null }
    for (const s of runwayParkSpots(a, span)) expect(s.x).toBeLessThan(0)
  })
})
```

Write `deckFor(shipId)` concretely at the top of the file. Read
`tests/sim/world/deck.test.ts` for how it builds a `ShipEntity` for `deckOf`.

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run tests/sim/ai/parkSpots.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
import type { AircraftSpec } from '../flight/schema.js'
import { createState, type AircraftState } from '../flight/state.js'
import { localToWorld, parkedAttitude, insideRect, type Airfield } from '../world/airfields.js'
import type { Deck } from '../world/deck.js'
import { v3 } from '../math/vec3.js'

/** Tuning values, 7g spec §3. Clear of the bow's edge. */
export const PARK_BOW_MARGIN_M = 15
/** Clear of the trap zone's forward edge (a trapped airplane rolls a few meters past the wire it caught). */
export const PARK_TRAP_CLEARANCE_M = 40
/** From the runway's edge to the park row's centerline. */
export const PARK_RUNWAY_OFFSET_M = 30
/** Between wingtips. */
export const PARK_GAP_M = 3

/**
 * 7g spec §3: the deck park, deck-local (x starboard, z toward the bow).
 * Two columns abreast either side of the centerline, filling aft from
 * PARK_BOW_MARGIN_M behind the bow, every spot's aft wingtip
 * PARK_TRAP_CLEARANCE_M forward of the trap zone. Spot 0 is the most forward,
 * starboard first. Pure geometry: no content fields.
 */
export function deckParkSpots(deck: Deck, wingSpanM: number): readonly { x: number; z: number }[] {
  const pitch = wingSpanM + PARK_GAP_M
  const columnX = pitch / 2
  if (columnX + wingSpanM / 2 > deck.widthM / 2) return [] // a deck too narrow for two abreast parks nothing
  const aftLimit = -deck.lengthM / 2 + deck.trapToSternM + PARK_TRAP_CLEARANCE_M + wingSpanM / 2
  const spots: { x: number; z: number }[] = []
  for (let z = deck.lengthM / 2 - PARK_BOW_MARGIN_M - wingSpanM / 2; z >= aftLimit; z -= pitch) {
    spots.push({ x: columnX, z }, { x: -columnX, z })
  }
  return spots
}

/**
 * 7g spec §3, §7: one row parallel to the runway, runway-local (x across, z
 * along), on the apron's side (sign of `apron.x`), else local -x. Along the
 * apron's length when there is one, else the runway's. Spots inside a
 * building footprint are dropped here; the terrain check is a content test
 * (spec §7), because the heightfield is not loaded when this runs.
 */
export function runwayParkSpots(a: Airfield, wingSpanM: number): readonly { x: number; z: number }[] {
  const side = a.apron !== null && a.apron.x !== 0 ? Math.sign(a.apron.x) : -1
  const x = side * (a.runway.widthM / 2 + PARK_RUNWAY_OFFSET_M)
  const pitch = wingSpanM + PARK_GAP_M
  const [zFrom, zTo] = a.apron !== null
    ? [a.apron.z - a.apron.lengthM / 2 + wingSpanM / 2, a.apron.z + a.apron.lengthM / 2 - wingSpanM / 2]
    : [-a.runway.lengthM / 2 + wingSpanM / 2, a.runway.lengthM / 2 - wingSpanM / 2]
  const spots: { x: number; z: number }[] = []
  for (let z = zFrom; z <= zTo; z += pitch) {
    const w = localToWorld(a, x, z)
    if (a.buildings.some((b) => insideRect(a, b, w.x, w.z))) continue
    spots.push({ x, z })
  }
  return spots
}

/** An airplane at rest on runway-local `spot`, facing down the runway, gear
 *  down, wheels on `groundHeightM`. The airfield sibling of `stateOnDeck`
 *  (src/sim/mission/respot.ts). */
export function parkedStateOnRunway(
  spec: AircraftSpec, a: Airfield, spot: { readonly x: number; readonly z: number }, groundHeightM: number,
  keep: Partial<Pick<AircraftState, 'fuelKg' | 'flapFraction' | 'tick'>> = {},
): AircraftState {
  const w = localToWorld(a, spot.x, spot.z)
  return createState({
    position: v3(w.x, groundHeightM + spec.gear.heightM, w.z),
    velocity: v3(0, 0, 0),
    attitude: parkedAttitude(a),
    gearFraction: 1,
    ...keep,
  })
}
```

Check `insideRect`'s rect argument against a `Building` (both carry
`x, z, widthM, lengthM`). If the types disagree, pass
`{ x: b.x, z: b.z, widthM: b.widthM, lengthM: b.lengthM }`.

- [ ] **Step 4: Run, verify, commit**

```bash
npx vitest run tests/sim/ai/parkSpots.test.ts; echo "rc=$?"
remote-run npm run verify; echo "rc=$?"
git add src/sim/ai/parkSpots.ts tests/sim/ai/parkSpots.test.ts
git commit -m "7g Task 3: deck and runway park spots, pure geometry"
```

Record in the ledger how many spots Essex, Casablanca and Tacloban get.

---

### Task 4: `pilot.home` in content, resolved at build time

**Files:**
- Modify: `src/sim/ai/pilot.ts` (types), `src/sim/ai/pursuit.ts` (`PilotAssignment.home?`), `src/sim/scenario.ts` (schema, `pilotAssignmentFrom`, validation)
- Test: `tests/sim/ai/recoverySchema.test.ts` (new)

**Interfaces:**
- Produces, in `pilot.ts`:

```ts
/** 7g spec §7: a pilot's home, resolved to plain data by worldFromScenario.
 *  A runway's approach geometry is fixed; a ship is read live from ctx.ships. */
export type RecoveryHome =
  | {
      readonly kind: 'runway'; readonly airfieldId: string
      readonly aimX: number; readonly aimZ: number; readonly headingRad: number
      /** Runway-local park spot (for tests and diagnostics). */
      readonly parkSpot: { readonly x: number; readonly z: number }
      /** The same spot in world coordinates, facing down the runway: what the
       *  respot builds from, because ctx carries no airfields (spec §7). */
      readonly parkWorld: { readonly x: number; readonly z: number; readonly headingRad: number }
    }
  | { readonly kind: 'ship'; readonly id: string; readonly parkSpot: { readonly x: number; readonly z: number } }
```

  `PilotAssignment` gains `readonly home?: RecoveryHome`.
- `ctx` carries no airfields, so the respot builds the runway state from
  `parkWorld` with `createState` and `qFromAxisAngle(up, π/2 − headingRad)`,
  the attitude `parkedAttitude` builds. Assert that equivalence in this task's
  test.

- [ ] **Step 1: Write the failing schema tests**

`tests/sim/ai/recoverySchema.test.ts`: one test per rule, each asserting the
error message names the rule. Build scenarios as raw JSON through
`parseScenario`/`bundleForScenario`/`worldFromScenario`:

```ts
it.each([
  ['an unknown airfield', { airfield: 'nowhere' }, 'home airfield "nowhere" is not one of airfields'],
  ['an unknown ship', { ship: 'cv-9' }, 'home ship "cv-9" is not a starting ship'],
  ['a ship with no flight deck', { ship: 'dd-1' }, 'home ship "dd-1" has no flight deck'],
])('rejects %s', (_label, home, message) => {
  expect(() => build([{ ...aiAirborne('ai-1'), pilot: { home } }])).toThrow(message)
})

it('rejects more aircraft homed to one deck than it has park spots', () => {
  const n = deckParkSpots(deckFor('casablanca-cve'), span).length
  const many = Array.from({ length: n + 1 }, (_, i) => ({ ...aiAirborne(`ai-${i}`), pilot: { home: { ship: 'cve-1' } } }))
  expect(() => build(many, { ships: [cve('cve-1')] })).toThrow(`home ship "cve-1" parks ${n}`)
})

it('resolves a runway home to its approach geometry and the id-ranked park spot', () => {
  const w = build([
    { ...aiAirborne('ai-b'), pilot: { home: { airfield: 'tacloban' } } },
    { ...aiAirborne('ai-a'), pilot: { home: { airfield: 'tacloban' } } },
  ])
  const a = loadAirfield('tacloban')
  const spots = runwayParkSpots(a, span)
  const homeA = aircraftById(w, 'ai-a')!.pilot!.home!
  const homeB = aircraftById(w, 'ai-b')!.pilot!.home!
  expect(homeA).toMatchObject({ kind: 'runway', airfieldId: 'tacloban', parkSpot: spots[0] })
  expect(homeB).toMatchObject({ parkSpot: spots[1] }) // id order, not array order
  expect(homeA.kind === 'runway' && homeA.headingRad).toBe(runwayHeadingRad(a))
  const aim = localToWorld(a, 0, a.runway.lengthM / 4)
  expect(homeA.kind === 'runway' && [homeA.aimX, homeA.aimZ]).toEqual([aim.x, aim.z])
})

it('home is plain data: the world survives structuredClone', () => {
  const w = build([{ ...aiAirborne('ai-1'), pilot: { home: { airfield: 'tacloban' } } }])
  expect(structuredClone(w).aircraft[1]!.pilot!.home).toEqual(w.aircraft[1]!.pilot!.home)
})
```

Also check that `home` is allowed alongside `leader`/`slot` (a wingman has a
home) and alongside `ingress`. A raider may have a home. Reject nothing there.

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run tests/sim/ai/recoverySchema.test.ts`
Expected: FAIL. `home` is an unrecognized key under `.strict()`.

- [ ] **Step 3: Implement**

In `scenario.ts`:

```ts
// in PilotObject:
  /** 7g: where this pilot recovers. Resolved at build (spec §7). */
  home: z.union([z.object({ airfield: id }).strict(), z.object({ ship: id }).strict()]).optional(),
```

Validation goes in the existing `superRefine` block beside the ingress
destination checks, over the same `all` list (start and held aircraft). It
covers the unknown airfield and the unknown ship, with the exact messages
above. The "no flight deck" and park-count rules need ship specs and airfield
records, which the schema does not have. Put them in `worldFromScenario`,
where `checkSides` already runs load-time checks with the bundle, as a new
`checkHomes(s, bundle, ships)` that throws `Error` with the messages above.
The count message is
`home ship "<id>" parks <n> aircraft but <m> are homed to it` (and the same
shape for `home airfield`). Spots are counted with the largest wingspan among
the aircraft homed there.

Resolution in `pilotAssignmentFrom` needs the rank of this aircraft among
those homed to the same place. Compute a `Map<aircraftId, RecoveryHome>` once
in `worldFromScenario` (id-sorted per home, start and held aircraft together)
and pass it in, the way `bundle.airfields` is passed. Runway:

```ts
const a = lookup(bundle.airfields, home.airfield, 'airfield')
const aim = localToWorld(a, 0, a.runway.lengthM / 4)       // tests/sim/landing.test.ts's aim point
const spot = runwayParkSpots(a, maxSpan)[rank]!
const w = localToWorld(a, spot.x, spot.z)
return { kind: 'runway', airfieldId: a.id, aimX: aim.x, aimZ: aim.z, headingRad: runwayHeadingRad(a),
  parkSpot: spot, parkWorld: { x: w.x, z: w.z, headingRad: runwayHeadingRad(a) } }
```

Ship: `{ kind: 'ship', id, parkSpot: deckParkSpots(deck, maxSpan)[rank]! }`, with
the deck from the starting ship's spec. A held ship (`heldGroups`) is an
error for now: `home ship "<id>" is not a starting ship`.

- [ ] **Step 4: Run, verify, commit**

```bash
npx vitest run tests/sim/ai/recoverySchema.test.ts tests/sim/ai/formationSchema.test.ts tests/sim/scenario.test.ts; echo "rc=$?"
remote-run npm run verify; echo "rc=$?"
git add src/sim/ai/pilot.ts src/sim/ai/pursuit.ts src/sim/scenario.ts tests/sim/ai/recoverySchema.test.ts
git commit -m "7g Task 4: pilot.home in content, validated and resolved to plain data at build"
```

---

### Task 5: RTB decision, `transit` and `hold`

**Files:**
- Create: `src/sim/ai/recovery.ts`
- Modify: `src/sim/ai/pilot.ts` (`RecoveryState`, `PilotDecisionState.recovery?` and `lastContactS?`), `src/sim/ai/pilotTick.ts`
- Create: `tests/sim/ai/recoveryWorlds.ts`, `tests/sim/ai/recovery.test.ts`

**Interfaces:**
- Produces, in `pilot.ts`:

```ts
export type RecoveryPhase = 'transit' | 'hold' | 'join' | 'configure' | 'final' | 'go-around' | 'rollout' | 'landed'
/** 7g: written by recovery.ts only. Plain data. */
export type RecoveryState = {
  readonly phase: RecoveryPhase
  /** Sim time the phase began. */
  readonly sinceS: number
  /** The LSO gave `cut` on this pass: committed, a later wave-off is ignored (spec §5). */
  readonly cut: boolean
  /** Sim time `join` began on this pass; read by later arrivals for the interval. */
  readonly joinedAtS: number | null
  /** Sim time the aircraft came to rest; the respot is RESPOT_DELAY_S later. */
  readonly restAtS: number | null
  readonly respotted: boolean
}
```

  `PilotDecisionState` gains `readonly recovery?: RecoveryState` and
  `readonly lastContactS?: number` (the last rescore at which any hostile was
  a contact; absent reads as 0).
- Produces, in `recovery.ts`:
  - `shouldReturn(a, record: AircraftCombat, decision, nowS): boolean`
  - `threatAstern(a, view: TargetingView): boolean`
  - `recoveryGeometry(home, ctx): { aimX, aimZ, headingRad, touchdownM, deck: Deck | null, paddles: PaddlesParams | null } | null` (`null` when the home ship is gone)
  - `recoveryControls(a, pilot, ctx, snapshot): { controls: Controls; recovery: RecoveryState; state?: AircraftState }`: one tick of the phase machine; `state` is set only on the respot tick.
  - Constants: `RTB_FUEL_FRACTION = 0.25`, `RTB_STRUCTURE = 0.5`, `RTB_IDLE_S = 30`, `IP_DISTANCE_M = 8000`, `IP_HEIGHT_M = 600`, `IP_ARRIVAL_M = 1000`, `HOLD_RADIUS_M = 1500`, `THREAT_ASTERN_RANGE_M = 1500`, `THREAT_ASTERN_HALF_ANGLE_RAD = π/3`.

- [ ] **Step 1: Write the fixtures and the failing tests**

`tests/sim/ai/recoveryWorlds.ts`, in the style of `formationWorlds.ts`: raw
scenario JSON, parsed.

```ts
export const STILL_CARRIER = {
  id: 'cv-1', spec: 'essex-cv', side: 'allied',
  // Two waypoints 60 km apart on one heading: no turn for the length of any test.
  waypoints: [[0, 0], [0, -60000]], speedMps: 7.717,
}
/** Wind from the north at the ship's speed: 15.4 m/s over the deck, like deck-quals. */
export const DECK_WIND = { windFromDeg: 0, windMps: 7.717 }
export const PLAYER_FAR = { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [80000, 3000, 80000], headingDeg: 90, speedMps: 120 } }
export const homed = (id: string, home: { ship: string } | { airfield: string }, position: readonly [number, number, number], headingDeg = 0, speedMps = 110) =>
  ({ id, spec: 'f6f-hellcat', side: 'allied', airborneAt: { position, headingDeg, speedMps }, pilot: { skill: 'veteran', home } })
export function buildRecovery(aircraft: unknown[], extra: Record<string, unknown> = {}, terrain: TerrainField | null = null): World<undefined> {
  return worldFromScenario(bundleForScenario(parseScenario({
    id: 'recovery-test', player: 'f6f-1', airfields: ['tacloban', 'dulag'], aircraft: [PLAYER_FAR, ...aircraft],
    ships: [STILL_CARRIER], weather: DECK_WIND, ...extra,
  })), terrain)
}
/** Run `seconds`, calling `onTick` after every step. */
export function fly(w: World<undefined>, seconds: number, onTick: (w: World<undefined>) => boolean | void = () => {}): World<undefined> { /* advance(w, DT) loop; stop early when onTick returns true */ }
export const phaseOf = (w: World<undefined>, id: string) => aircraftById(w, id)!.pilot!.decision.recovery?.phase ?? null
```

`weather` is `{ windFromDeg, windMps }` plus optional `timeOfDay` and
`clouds` (checked against `deck-quals.json` 2026-09-28). A wind from 0° blows
toward the south, into the face of this northbound (-z) carrier.

`tests/sim/ai/recovery.test.ts`, first block:

```ts
describe('the return-to-base decision (7g spec §1)', () => {
  it('30 s without a contact sends a homed pilot home; a pilot without a home loiters', () => {
    const w0 = buildRecovery([homed('ai-1', { ship: 'cv-1' }, [0, 1500, 12000]), { ...homed('ai-2', { ship: 'cv-1' }, [500, 1500, 12000]), pilot: { skill: 'veteran' } }])
    const w = fly(w0, 31)
    expect(aircraftById(w, 'ai-1')!.pilot!.decision.mode).toBe('rtb')
    expect(aircraftById(w, 'ai-2')!.pilot!.decision.mode).toBe('loiter')
  })
  it.each([
    ['ammunition exhausted', (w: W) => withGunsEmpty(w, 'ai-1')],
    ['structure below 0.5', (w: W) => withStructure(w, 'ai-1', 0.49)],
  ])('%s sends it home at the next rescore, even with a hostile in range', (_label, set) => {
    // a hostile axis AI 3 km away, not pointing at ai-1 (no threat astern)
    const w = fly(set(worldWithHostileAbeam()), 2)
    expect(aircraftById(w, 'ai-1')!.pilot!.decision.mode).toBe('rtb')
  })
  it('the fuel trigger fires on a hand-set fuel load (practically dormant in play, spec §1)', () => {
    const w = fly(withFuel(worldWithHostileAbeam(), 'ai-1', 0.2), 2)
    expect(aircraftById(w, 'ai-1')!.pilot!.decision.mode).toBe('rtb')
  })
  it('a threat astern pre-empts the recovery; once clear it resumes at transit', () => {
    // ai-1 out of ammo; an axis veteran 600 m behind it with a gun solution.
    const w1 = fly(withGunsEmpty(worldWithHostileAstern(), 'ai-1'), 2)
    expect(aircraftById(w1, 'ai-1')!.pilot!.decision.mode).toBe('engage')
    const w2 = fly(withDestroyed(w1, 'axis-1'), 3)
    expect(aircraftById(w2, 'ai-1')!.pilot!.decision.mode).toBe('rtb')
    expect(phaseOf(w2, 'ai-1')).toBe('transit')
  })
})

describe('transit and hold (7g spec, 7c-7g §6 phases 1)', () => {
  it('flies to the initial point 8 km astern of the deck at 600 m, and holds there when the approach is taken', () => { /* two homed to cv-1; the higher id holds; assert its distance to the IP stays under HOLD_RADIUS_M + 300 for 60 s */ })
  it('home ship gone: drops home and loiters, no throw', () => { /* build, then remove cv-1 from w.ships; fly 5 s; mode loiter */ })
  it('a Dulag-to-Tacloban transit over real terrain never impacts (Review Focus 1)', () => { /* skip by name without tiles, like landing.test.ts; homed to tacloban, start over Dulag at 500 m; fly 180 s; impact null */ })
})
```

Write each helper (`withGunsEmpty`, `withStructure`, `withFuel`,
`withDestroyed`, `worldWithHostileAbeam`, `worldWithHostileAstern`)
concretely in `recoveryWorlds.ts`. The combat record's shape is
`AircraftCombat` in `src/sim/weapons/combat.ts`: `guns[].ammo`,
`damage.structure`, `damage.destroyedAt`.

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run tests/sim/ai/recovery.test.ts`
Expected: FAIL: `recovery.ts` does not exist, and the mode stays `loiter`/`engage`.

- [ ] **Step 3: Implement the decision in `recovery.ts`**

```ts
/** 7c-7g §6 triggers, 7g spec §1. The fuel one is practically dormant:
 *  FUEL_KG_PER_JOULE (flight/model.ts) makes a full load last hours. */
export function shouldReturn<M>(a: AircraftEntity<M>, record: AircraftCombat, decision: PilotDecisionState, nowS: number): boolean {
  if (a.state.fuelKg / a.spec.mass.fuelCapacityKg <= RTB_FUEL_FRACTION) return true
  if (record.guns.length > 0 && record.guns.every((g) => g.ammo <= 0)) return true
  if (record.damage.structure < RTB_STRUCTURE) return true
  return nowS - (decision.lastContactS ?? 0) >= RTB_IDLE_S
}

/** A hostile contact inside THREAT_ASTERN_RANGE_M in my rear cone. */
export function threatAstern<M>(a: AircraftEntity<M>, view: TargetingView<M>): boolean {
  const back = scale(qRotate(a.state.attitude, v3(1, 0, 0)), -1)
  return view.snapshot.some((c) => {
    if (!isContact(a, c, view)) return false
    const to = sub(c.state.position, a.state.position)
    const r = length(to)
    return r <= THREAT_ASTERN_RANGE_M && dot(back, scale(to, 1 / r)) >= Math.cos(THREAT_ASTERN_HALF_ANGLE_RAD)
  })
}
```

`recoveryGeometry`: for a runway, `touchdownM = heightAt(ctx.terrain, aimX, aimZ)`.
It returns `null` for a runway while `ctx.terrain` is null (the pilot holds at
the IP, using sea level plus 600 m, until terrain arrives; 7c-7g §6). For a
ship, find it in `ctx.ships` and `deckOf` it. Missing ship or null deck →
`null`, and the caller drops `home`. The carrier aim is
`carrierApproachProfile`'s. The IP and the fix are on the extended centerline,
`bow = (sin h, 0, -cos h)`: `IP = aim - bow * IP_DISTANCE_M`,
`fix = aim - bow * 4000`.

`transit`: `controlsForDesiredVelocity` toward the IP at `IP_HEIGHT_M` above
`touchdownM`. Speed is the airframe's cruise: use
`0.6 * spec.limits.diveSpeedMps` unless `envelope.ts` already exposes a cruise
figure; check it first and record the choice. The throttle law is the one
`ingressThrottle` uses. Within `IP_ARRIVAL_M` of the IP → `hold` or `join`
(Task 6 owns `join`; in this task, always `hold`).

`hold`: orbit the IP at `HOLD_RADIUS_M`, turning left. The desired velocity is
tangent to the circle plus a radial correction, the same shape as
`ingressOrbitControls` (`ingress.ts`). Read it and reuse it if its signature
allows; do not copy it.

- [ ] **Step 4: Wire it into `pilotTick`**

At the rescore, after `chooseTarget`:

```ts
    const record = ctx.combat.aircraft[a.id]!
    const sawContact = snapshot.some((c) => isContact(a, c, view))
    if (sawContact) decision = { ...decision, lastContactS: ctx.nowS }
    const recovering = decision.mode === 'rtb' || decision.mode === 'landed'
    const goHome = pilot.home !== undefined && !recovering && shouldReturn(a, record, decision, ctx.nowS)
    // spec §6: RTB pre-empts engage unless a threat is astern.
    const rtb = pilot.home !== undefined && (recovering || goHome) && !(decision.mode !== 'landed' && threatAstern(a, view))
    const mode = decision.mode === 'landed' ? 'landed'
      : rtb ? 'rtb'
      : chosen !== null ? 'engage'
      : leader !== null && leaderFlying ? 'formation'
      : pilot.ingress !== undefined ? 'ingress' : 'loiter'
```

Entering `rtb` from anything else sets
`recovery = { phase: 'transit', sinceS: nowS, cut: false, joinedAtS: null, restAtS: null, respotted: false }`
and clears `targetId` and the latch. Leaving `rtb` for `engage` (a threat
astern) deletes `recovery`, so the resumption starts at `transit` (Review
Focus 4). Check `lastContactS` before the first rescore: `initialDecision`
does not set it, so absent means 0, and a pilot with no contacts for its first
30 s goes home at 30 s. That is the spec's rule.

Then, before the safety override, while `decision.mode` is `rtb` or `landed`:

```ts
  if (decision.mode === 'rtb' || decision.mode === 'landed') {
    const geo = recoveryGeometry(pilot.home!, ctx)
    if (geo === null && pilot.home!.kind === 'ship') {
      // Review Focus 5: the home ship is gone. Drop home and loiter from here.
      pilot = { ...pilot, home: undefined }
      decision = { ...decision, mode: 'loiter', recovery: undefined, loiter: loiterReference(a) }
    } else {
      // Tasks 5-8 fill this in: transit/hold here, the rest later.
    }
  }
```

The safety override runs as today in `transit` and `hold` (spec §6: they
keep the floor). `recoveryControls` output goes through `finishControls` like
every other branch.

- [ ] **Step 5: Run, verify, commit**

```bash
npx vitest run tests/sim/ai/recovery.test.ts tests/sim/ai/pilotTick.test.ts tests/sim/ai/formation*.test.ts tests/sim/ai/furball.test.ts; echo "rc=$?"
remote-run npm run verify; echo "rc=$?"
git add src/sim/ai/recovery.ts src/sim/ai/pilot.ts src/sim/ai/pilotTick.ts tests/sim/ai/recoveryWorlds.ts tests/sim/ai/recovery.test.ts
git commit -m "7g Task 5: return-to-base decision, transit to the initial point, hold"
```

No shipped scenario has a `home` yet, so every existing soak must be
bit-identical. If one is not, the `lastContactS` write or the view change
leaked. Find it before going on.

---

### Task 6: `join`, `configure`, `final`, capture window and go-around

**Files:**
- Modify: `src/sim/ai/recovery.ts`, `src/sim/ai/pilotTick.ts` (safety exemption)
- Test: `tests/sim/ai/recoveryApproach.test.ts` (new)

**Interfaces:**
- Consumes: `approachControls`, `carrierApproachProfile` (Task 1); `recoveryGeometry` (Task 5); `paddlesCue`.
- Produces: `CAPTURE_LATERAL_M = 60`, `CAPTURE_HEADING_RAD = 10° in rad`,
  `CAPTURE_HEIGHT_M = 40`, `CAPTURE_SPEED_MPS = 8`, `FIX_DISTANCE_M = 4000`,
  `CONFIGURE_FROM_M = 6000`, `GO_AROUND_HEIGHT_M = 300`,
  `CONFIGURE_SPEED_MARGIN_MPS = 15`; `exemptFromFloor(recovery?: RecoveryState): boolean`.

- [ ] **Step 1: Write the failing tests**

`tests/sim/ai/recoveryApproach.test.ts`. Each case starts the pilot already
in `rtb`. Add a fixture helper `inRecovery(w, id, phase)` that writes
`mode: 'rtb'` and a fresh `RecoveryState` into the decision.

```ts
it('a clean join from the IP: configured before the fix, inside the capture window at it, onto final', () => {
  // homed to cv-1, placed at the IP (from recoveryGeometry), heading down the centerline, 110 m/s, phase 'join'
  let atFix: { lateralM: number; headingErrRad: number; heightErrM: number; speedErrMps: number } | null = null
  let configuredBeforeFix = false
  fly(w, 240, (w) => { /* record gear/flap/hook at alongM <= FIX_DISTANCE_M + 50, sample the four errors when alongM crosses FIX_DISTANCE_M; stop at phase 'final' */ })
  expect(configuredBeforeFix).toBe(true)
  expect(Math.abs(atFix!.lateralM)).toBeLessThan(CAPTURE_LATERAL_M)
  expect(Math.abs(atFix!.headingErrRad)).toBeLessThan(CAPTURE_HEADING_RAD)
  expect(Math.abs(atFix!.heightErrM)).toBeLessThan(CAPTURE_HEIGHT_M)
  expect(Math.abs(atFix!.speedErrMps)).toBeLessThan(CAPTURE_SPEED_MPS)
})

it('a deliberately bad join goes around once, then lands (7c-7g §6 acceptance)', () => {
  // start at the fix but 200 m right of the centerline and 150 m high
  const phases: RecoveryPhase[] = []
  fly(w, 600, (w) => { const p = phaseOf(w, 'ai-1')!; if (phases.at(-1) !== p) phases.push(p); return p === 'landed' })
  expect(phases.filter((p) => p === 'go-around')).toHaveLength(1)
  expect(phases.at(-1)).toBe('landed')
})

it('a wave-off injected by geometry is obeyed before the cut', () => {
  // on final at 600 m astern, 25 m high (outside 0.7° of 3.5° at that range): the LSO says wave-off inside 250 m
  const phases = /* as above, 60 s */
  expect(phases).toContain('go-around')
})

it('committed after the cut: a wave-off after it is ignored', () => {
  // unit test on recoveryControls: a RecoveryState with cut: true and a state whose paddlesCue is 'wave-off' stays in 'final'
})

it('the whole approach is exempt from the 400 m floor; transit and hold are not (spec §6)', () => {
  for (const p of ['join', 'configure', 'final', 'go-around', 'rollout', 'landed'] as const) expect(exemptFromFloor(state(p))).toBe(true)
  for (const p of ['transit', 'hold'] as const) expect(exemptFromFloor(state(p))).toBe(false)
  expect(exemptFromFloor(undefined)).toBe(false)
})

it('the carrier turns 30° while the pilot is at the fix: it lands or goes around, never impacts (Review Focus 2)', () => {
  // a carrier whose second waypoint is 30° off its first leg, reached as the pilot crosses the fix
  fly(w, 400, (w) => { expect(aircraftById(w, 'ai-1')!.impact).toBeNull() })
})
```

Write the geometry helpers (`alongM`/`acrossM` against the live
`recoveryGeometry`) in `recoveryWorlds.ts`, not inline.

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run tests/sim/ai/recoveryApproach.test.ts`
Expected: FAIL. No `join` phase exists yet, so the pilot holds forever.

- [ ] **Step 3: Implement the phases in `recoveryControls`**

All in the approach frame of `recoveryGeometry`: `alongM` is the distance
short of the aim point, `acrossM` is starboard of the centerline, and both are
computed as `approachControls` computes them. On a deck the frame is
surface-relative: a moving deck's `alongM` shrinks by the ship's speed. The
approach speed `vA` is `carrierApproachProfile(...).approachSpeedMps` on a
deck and `VREF_STALL_MULTIPLE * stallSpeedFlapMps` on a runway.

- `hold` → `join` when the interval allows (Task 8; for now: always).
- `join`: fly `controlsForDesiredVelocity` toward a point 1,500 m further along
  the centerline than the aircraft's projection onto it. Height ramps from
  `IP_HEIGHT_M` at the IP to the path height at the fix
  (`FIX_DISTANCE_M * tan(glidePathRad)` above touchdown). Speed ramps from
  cruise to `vA + CONFIGURE_SPEED_MARGIN_MPS`. At `alongM <= CONFIGURE_FROM_M`
  → `configure`.
- `configure`: the same steering, with `gearDown`, `flapDown` and (deck)
  `hookDown` true. Speed ramps linearly from `vA + 15` at `CONFIGURE_FROM_M` to
  `vA` at `FIX_DISTANCE_M`. At `alongM <= FIX_DISTANCE_M` apply the capture
  window: all four within bounds → `final`; else → `go-around`.
- `final`: `approachControls(spec, state, target)` with the runway target
  (aim, heading, `touchdownM`, `windVelocity: ctx.wind ?? undefined`) or
  `{ ...carrierApproachProfile(spec, deck, paddles), windVelocity }`. On a deck
  each tick: `cue = paddlesCue(spec, state, controls, deck, paddles, ctx.wind)`;
  `cue === 'cut'` sets `recovery.cut = true`; `cue === 'wave-off' && !recovery.cut`
  → `go-around`. When the wheels are on the surface
  (`!airborne(a, ctx.terrain, ctx.decks)`) → `rollout`.
- `go-around`: throttle 1, gear and flaps up, hook up, wings level, climb
  straight ahead at a desired velocity of the current heading with
  `vy = +8 m/s`. At `GO_AROUND_HEIGHT_M` above touchdown → `transit` (back to
  the IP), with `cut: false` and `joinedAtS: null`.
- `rollout`: `approachControls` still (it brakes and steers on the wheels).
  When the speed relative to the surface is under `LANDED_SPEED_MPS`
  (`src/sim/landing.ts`) → `landed` with `restAtS = nowS`, and the pilot's
  mode becomes `landed`.
- `landed`: Task 7.

`exemptFromFloor(r) = r !== undefined && r.phase !== 'transit' && r.phase !== 'hold'`.
In `pilotTick`, skip the floor recovery when it is true but keep the
overspeed guard. Read `safetyOverride`'s structure first. If floor and
overspeed are not separable by a parameter, add one (`floor: boolean`,
default true) rather than duplicating the overspeed logic. Record the choice
in the ledger.

Every threshold above is a tuning value. If a test fails on one, measure
before changing it, and record the measurement next to the constant, dated,
in the style of `safety.ts`.

- [ ] **Step 4: Run, verify, commit**

```bash
npx vitest run tests/sim/ai/recoveryApproach.test.ts tests/sim/ai/recovery.test.ts tests/sim/ai/safety.test.ts tests/sim/ai/lowChase.test.ts; echo "rc=$?"
remote-run npm run verify; echo "rc=$?"
git add src/sim/ai/recovery.ts src/sim/ai/pilotTick.ts src/sim/ai/safety.ts tests/sim/ai/recoveryApproach.test.ts tests/sim/ai/recoveryWorlds.ts
git commit -m "7g Task 6: join, configure, final with the LSO, capture window and go-around"
```

---

### Task 7: Landing and the respot

**Files:**
- Modify: `src/sim/ai/recovery.ts`, `src/sim/ai/pilotTick.ts`
- Test: `tests/sim/ai/recoveryLanding.test.ts` (new)

**Interfaces:**
- Consumes: `stateOnDeck` (`src/sim/mission/respot.ts`), `RESPOT_DELAY_S`, `parkedStateOnRunway` or the `parkWorld` construction (Task 4).
- Produces: `recoveryControls` returns `state` on the respot tick; `pilotTick` returns `{ ...a, state, previous: state, controls, pilot }` then.

- [ ] **Step 1: Write the failing tests**

```ts
it('carrier: from the IP to an arrest inside the trap zone, at rest relative to the deck, with a roger (7c-7g §6 acceptance)', () => {
  const cues: PaddlesCue[] = []
  let arrestedLocalFromSternM: number | null = null
  const w = fly(atIp('ai-1', { ship: 'cv-1' }), 900, (w) => { /* sample paddlesCue for ai-1 each tick; record deck-local position on the first tick `arrested` is true; stop at phase 'landed' + RESPOT_DELAY_S + 1 */ })
  expect(cues).toContain('roger')
  expect(arrestedLocalFromSternM!).toBeGreaterThan(deck.trapFromSternM)
  expect(arrestedLocalFromSternM!).toBeLessThan(deck.trapToSternM)
  expect(aircraftById(w, 'ai-1')!.impact).toBeNull()
  expect(aircraftById(w, 'ai-1')!.pilot!.decision.mode).toBe('landed')
})

it('carrier: respotted to its park spot RESPOT_DELAY_S after rest, clear of the trap zone, hook up, and stays there relative to the deck', () => {
  // continue the world above 30 s; its deck-local position equals home.parkSpot within 0.5 m every tick after the respot
})

it('runway: touchdown inside the runway rectangle, sink under MAX_SUPPORTED_SINK_MPS, at rest on the runway, then respotted (skips without tiles)', () => {
  // homed to tacloban, from its IP, with real terrain as tests/sim/landing.test.ts loads it
})

it('a landed AI is not a contact for a hostile (spec §2, end to end)', () => {
  // an axis veteran with no other targets, 3 km away after ai-1 is respotted: its targetId stays null
})

it('structuredClone round-trips a world with a respotted AI', () => { /* equal after clone, and one more advance is equal from both */ })
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run tests/sim/ai/recoveryLanding.test.ts`
Expected: FAIL. The `landed` phase does nothing, so there is no respot.

- [ ] **Step 3: Implement `landed` and the respot**

`landed` controls:
`{ ...NEUTRAL, gearDown: true, flapDown: false, hookDown: deck !== null && !recovery.respotted, throttle: 0, brake: 1 }`.
Import `NEUTRAL` from wherever `scenario.ts` gets it.

When `!recovery.respotted && nowS - restAtS >= RESPOT_DELAY_S`:
- **Deck:** `state = stateOnDeck(a.spec, deck, home.parkSpot, { fuelKg: a.state.fuelKg, flapFraction: 0, tick: a.state.tick })`.
- **Runway:** build from `home.parkWorld` at `heightAt(ctx.terrain, x, z)`, the
  same `createState` fields as `parkedStateOnRunway`.

Set `respotted: true`.

Check `stateOnDeck`'s `arrested`: a fresh `createState` should have
`arrested: false`. If a respotted AI then rolls, the hook is up and brake 1
must hold it: Plan 8 keeps a braked airplane at rest relative to a moving
deck. The second test proves it.

In `pilotTick`, `mode === 'landed'` short-circuits before the rescore: no
target choice, no safety override, no noise. It returns the landed controls
(and the respot state on that one tick). A landed pilot never leaves `landed`.

- [ ] **Step 4: Run, verify, commit**

```bash
npx vitest run tests/sim/ai/recoveryLanding.test.ts tests/sim/ai/recoveryApproach.test.ts; echo "rc=$?"
remote-run npm run verify; echo "rc=$?"
git add src/sim/ai/recovery.ts src/sim/ai/pilotTick.ts tests/sim/ai/recoveryLanding.test.ts tests/sim/ai/recoveryWorlds.ts
git commit -m "7g Task 7: landing and the respot to a park spot"
```

---

### Task 8: The landing interval, and wingmen going home with their leader

**Files:**
- Modify: `src/sim/ai/recovery.ts`, `src/sim/ai/pilotTick.ts`
- Test: `tests/sim/ai/recoveryInterval.test.ts` (new)

**Interfaces:**
- Produces: `INTERVAL_S = 60`; `approachClear(a, home, snapshot, nowS): boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
it('two AI homed to one carrier trigger together: the lower id approaches first, the other holds, 60 s apart; array order does not matter (Review Focus 3)', () => {
  for (const order of [['ai-a', 'ai-b'], ['ai-b', 'ai-a']]) {
    // both 12 km out, same distance to the IP, mirrored about the centerline, out of ammo
    const joined: Record<string, number> = {}
    const landedAt: Record<string, number> = {}
    fly(worldFor(order), 1200, (w) => { /* record first tick each enters 'join' and 'landed'; stop when both landed + respotted */ })
    expect(joined['ai-a']!).toBeLessThan(joined['ai-b']!)
    expect(joined['ai-b']! - joined['ai-a']!).toBeGreaterThanOrEqual(INTERVAL_S * 60)
    // both at rest on distinct park spots, both clear of the trap zone (spec §3 acceptance)
  }
})

it('a wingman flies formation home and peels off at the IP into its own recovery', () => {
  // leader ai-1 homed to cv-1 out of ammo; wingman ai-2 slot 1 homed to cv-1
  // assert: ai-2 is in mode 'formation' while ai-1 is in 'transit'; ai-2 enters 'rtb' within 5 s of ai-1 reaching 'hold' or 'join'; both land
})

it('the same interval ashore (skips without tiles)', () => { /* two homed to tacloban; distinct runway park spots */ })
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run tests/sim/ai/recoveryInterval.test.ts`
Expected: FAIL. Both join at once, and the wingman goes straight home alone.

- [ ] **Step 3: Implement**

`approachClear`: `true` iff for every other aircraft `o` in the start-of-tick
snapshot with the same home (same `kind` and same `airfieldId`/`id`), not
down:
- `o` is not in `join`, `configure`, `final`, `go-around` or `rollout`;
- `o.recovery.joinedAtS` is null or `nowS - joinedAtS >= INTERVAL_S`;
- `o` is not in `hold` or `transit` with an id `<` mine (ties broken by id,
  string compare, never array position).

`hold → join` only when `approachClear`. `joinedAtS = nowS` on entering `join`.

A wingman whose leader is in `rtb` phase `transit` does not trigger its own
RTB: it stays in `formation` (the leader's recovery drives it home). When the
leader leaves `transit`, the wingman enters `rtb` at phase `hold` if it has a
home (the IP is where it is), else it loiters. Put that rule in `pilotTick`'s
mode chain, above the `shouldReturn` check, and cite 7c-7g §6 ("Wingmen go
home in formation with their leader").

- [ ] **Step 4: Run, verify, commit**

```bash
npx vitest run tests/sim/ai/recoveryInterval.test.ts tests/sim/ai/recovery*.test.ts tests/sim/ai/formation*.test.ts; echo "rc=$?"
remote-run npm run verify; echo "rc=$?"
git add src/sim/ai/recovery.ts src/sim/ai/pilotTick.ts tests/sim/ai/recoveryInterval.test.ts tests/sim/ai/recoveryWorlds.ts
git commit -m "7g Task 8: 60 s landing interval in id order; wingmen go home in formation"
```

---

### Task 9: `recovery-range`, the park-spot content test, determinism

**Files:**
- Create: `content/scenarios/recovery-range.json`, `tests/content/recoveryParkSpots.test.ts`
- Modify: `tests/sim/ai/determinism.test.ts` (add recovery-range)
- Test: `tests/sim/ai/recoveryRange.test.ts` (new)

- [ ] **Step 1: Write the scenario**

7c-7g §6: two allied AI with low fuel start 15 km out, one homed to
`tacloban` and one to `cv-1`. Copy `deck-quals.json`'s `cv-1` and the wind
over the deck, but give the carrier a long first leg (no turn for 15 min).
The player is parked on Tacloban's apron, chocked, allied, so nothing
attacks the AI and the viewer can watch the runway arrival. Each AI:
`"pilot": { "skill": "veteran", "home": {...} }`, airborne at 1,500 m, heading
toward its home. Fuel is not scenario content: low fuel is not settable from
JSON, so the AI go home by the 30 s idle rule. Say so in the scenario's
description field if it has one, and in the handoff. Give the scenario the
fields the title screen needs (read `furball-range.json` for the dev-scenario
shape and whether dev scenarios are listed or `?scenario=`-only).

- [ ] **Step 2: Write the tests**

`tests/sim/ai/recoveryRange.test.ts`: loads `recovery-range` with
`loadScenarioBundle` and real terrain (skip by name without tiles). Flies
until both are `landed` and respotted or 20 min pass. Asserts both landed, no
impact, and each on its park spot.

`tests/content/recoveryParkSpots.test.ts` (spec §7): for every shipped
scenario, for every AI with a `home` airfield, and for each of that airfield's
first `n` park spots (`n` = aircraft homed there): terrain there is land
(`heightAt > 0.5`, the shore threshold 13d uses), and within 2 m of
`heightAt` at the runway aim point. Skip by name without tiles.

Add `recovery-range` to `determinism.test.ts`'s scenario list: two runs of N
ticks are identical, and so is a run from a `structuredClone`d mid-flight
world.

- [ ] **Step 3: Run, verify, commit**

```bash
npx vitest run tests/sim/ai/recoveryRange.test.ts tests/content/recoveryParkSpots.test.ts tests/sim/ai/determinism.test.ts tests/content/; echo "rc=$?"
remote-run npm run verify; echo "rc=$?"
git add content/scenarios/recovery-range.json tests/sim/ai/recoveryRange.test.ts tests/content/recoveryParkSpots.test.ts tests/sim/ai/determinism.test.ts
git commit -m "7g Task 9: recovery-range scenario, park-spot terrain check, determinism"
```

If a content test enumerates every shipped scenario (a scenario catalog or a
title-screen list test), it fails here until `recovery-range` is registered.
Register it the way `furball-range` is.

---

### Task 10: Diagnostic and Tier 2 on the reference GPU

**Files:**
- Modify: `src/render/main.ts` (the `aircraft()` diagnostic, near line 955)
- Create: `tests/tier2/recovery.spec.ts`

- [ ] **Step 1: The diagnostic**

Beside `mode:` in `__ww2.aircraft()`:

```ts
            // Plan 7g: the recovery phase for an AI with a home, else null.
            recovery: a.pilot?.decision.recovery?.phase ?? null,
```

Run the render unit tests that pin the diagnostic's shape, if any:
`grep -rln "aircraft()" tests/render tests/tier2`.

- [ ] **Step 2: The Tier 2 spec**

Model it on the newest AI Tier 2 spec (`tests/tier2/furball.spec.ts`).
Boot `?scenario=recovery-range` (and whatever `?launch`/Dev flags the sortie
forms require; read `tests/tier2/` for the current boot helper). Wait for
terrain. Run the sim at the harness's time scale until
`__ww2.aircraft().find(a => a.id === <carrier AI>).mode === 'landed'`, polling.
Then assert:
- zero WebGPU validation errors (the harness's existing check);
- gpu p95 under 6.0 ms over the harness's budget window;
- `page.screenshot()` of the chase view on the landed carrier AI (use the
  harness's camera-target helper, if one exists, to look at an AI).

Save the screenshot under `test-results/` and **read it**. Record what it
shows in the ledger.

- [ ] **Step 3: Run it on the reference GPU**

Use a free dev slot for this worktree (`ww2airsim-2` or `-3`; curl both
first, and a 200 means some session is using it). Edit this worktree's
`vite.config.ts` `TUNNEL_HOST`/`server.port` locally, never committed, then
follow the repo CLAUDE.md "GPU work" recipe. Correctness first, on the
session-0 server; the budget under `hwlock ryzen` only if the first run's
budget fails.

- [ ] **Step 4: verify, commit**

```bash
remote-run npm run verify; echo "rc=$?"
git add src/render/main.ts tests/tier2/recovery.spec.ts
git commit -m "7g Task 10: recovery phase in __ww2.aircraft(); recovery-range Tier 2 on the reference GPU"
```

---

### Task 11: Handoff, §15, README, final review

**Files:**
- Create: `docs/handoff/2026-09-28-plan7g-landing.md`
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§15, Plan 7's row), `README.md`

- [ ] **Step 1: Whole-branch review**

Dispatch a fresh reviewer over `main..HEAD` with this plan, both specs and the
ledger. Fix what it confirms. Log what it raises and you decline, with the
reason, in the ledger.

- [ ] **Step 2: Handoff**

In the style of `docs/handoff/2026-09-27-plan7f-formation.md`:
- what landed, with the measured numbers (touchdown sink, arrest point from
  the stern, rest positions, the interval measured, the Tier 2 p95);
- the rulings;
- open items. At least these:
  - fuel is not scenario content, so the fuel trigger is dormant;
  - AI takeoff is its own later plan (Mark, 2026-09-27);
  - taxiing is not modeled, the respot stands in;
  - a held-group home ship is rejected;
- Mark's viewing steps for the final checkpoint: the windomlane dev-slot URL
  with `?scenario=recovery-range`, what to watch, and how long it takes;
- the Tier 2 captures.

- [ ] **Step 3: §15 and README**

In §15's Plan 7 row, change "7g (landing AI) not started" to a sentence in
the row's style with design, plan and handoff links, and "complete on branch
`worktree-ai-7g-landing`, not yet merged". Also change the 7f open item
"AI target selection may skip a player who took off from a deck or runway" to
say it was fixed by 7g (spec §2). Escape `|` as `\|` inside cells. README: one
paragraph pointing at §15.

- [ ] **Step 4: Final verify, push the branch, email the handoff**

```bash
remote-run npm run verify; echo "rc=$?"
git add docs/ README.md
git commit -m "7g Task 11: handoff, section 15 row, README"
git push -u origin worktree-ai-7g-landing
python3 tools/mail-doc.py docs/handoff/2026-09-28-plan7g-landing.md "ww2airsim 7g landing AI: handoff"
```

Do **not** merge into `main` or push `main`: those are Mark's call.
