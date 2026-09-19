# Carrier and Airfield Operations Implementation Plan (Plan 8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The pilot can launch from and trap aboard the moving Essex-class carrier, with a steady scenario wind in the flight model and LSO paddles cues on final.

**Architecture:** Wind enters `SimContext` and `step` reads air-relative velocity for every aerodynamic term. A `Deck` is derived from each carrier after the ships step, and one `groundUnder` lookup returns height, surface kind and surface velocity so the existing ground constraint rests an airplane at the deck's velocity. The trap is a state flag on `AircraftState` set by `step` under an arcade rule; the landing report, the paddles cue and the deck plane are render-layer consumers of the same `Deck`.

**Tech Stack:** TypeScript, vitest (Node, Tier 1), Playwright against the Windows reference GPU (Tier 2), three.js WebGPU/TSL for the deck plane, zod for content schemas.

**Spec:** `docs/superpowers/specs/2026-09-18-carrier-ops-design.md`. Task 1 amends two of its numbers; the amendment is part of that task's commit.

## Global Constraints

- Work in the served nexus checkout on `main`, in place; no worktree (`CLAUDE.md`). Re-diff against `HEAD` immediately before every commit.
- Do not push or deploy.
- `src/sim/` never imports `render/`, `input/`, `assists/`, `audio/`, Node core or a rendering library; `tests/architecture/boundary.test.ts` and depcruise enforce it.
- `npm run verify; rc=$?` before every commit; capture `rc` directly, never gate on a grepped pipeline.
- Null-wind and zero-surface-velocity paths must be bit-identical to today: the golden trajectory, every test card, the 11b landing figures and the Plan 12 chock drift must not move. Task 1 pins this with exact-equality assertions that stay in the suite.
- `SimContext` additions are optional fields (`wind?`, `decks?`); the 51 construction sites in tests and tools are not edited.
- US spelling in new prose and identifiers; escape `|` as `\|` in Markdown table cells.
- Every number that is a guess is flagged in a `reference.source` string or a comment naming it an ESTIMATE, as the existing content records do.
- Update `.superpowers/sdd/2026-09-18-carrier-ops/progress.md` (gitignored) after every task; it is the executing ledger. Create it in Task 1.
- Tier 2 runs from nexus: `ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &` then `PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org npm run test:tier2`. The desktop's `playwright run-server` must be up with `--unsafe` (README, Tier 2). GPU numbers measured after 2026-09-18 are not comparable with earlier handoffs (`playwright.config.ts` comment); the 6.0 ms p95 ceiling stands.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/sim/loop.ts` (modify) | `SimContext.wind`, `SimContext.decks`; `World.wind`; `advance` derives decks after ships step; impact detection through `groundUnder` |
| `src/sim/flight/model.ts` (modify) | air-relative velocity for aerodynamics; ground constraint at surface velocity; the arrest rule |
| `src/sim/flight/state.ts` (modify) | `Controls.hookDown`; `AircraftState.arrested` |
| `src/sim/world/deck.ts` (create) | `Deck`, `deckOf`, `decksOf`, `deckLocal`, `deckWorld`, `insideDeck`, `insideTrapZone` — pure geometry |
| `src/sim/world/ground.ts` (create) | `GroundUnder`, `groundUnder(terrain, decks, x, z)` |
| `src/sim/ground.ts` (modify) | `supportedContact`, `restOnSurface`, `lateralGripAfter`, `groundBodyRates` take an optional surface velocity and surface kind |
| `src/sim/contact.ts` (modify) | `ContactSurface` gains `'deck'`; `contactOutcome` has an explicit deck arm |
| `src/sim/world/ships.ts` (modify) | `ShipSpec.flightDeck`, `trapZone`, `paddles` (optional blocks) |
| `src/sim/scenario.ts` (modify) | `weather` block; `parkedAt` airfield-or-ship union; ships built before aircraft |
| `src/sim/paddles.ts` (create) | `PaddlesCue`, `PaddlesParams`, `paddlesCue` |
| `src/sim/invariants.ts` (modify) | energy invariant passes the wind |
| `tools/content/load.ts`, `src/render/scenarioLoad.ts` (modify) | the airfields table reads only airfield-parked aircraft |
| `tools/autopilot/approach.ts` (modify) | approach flown in the target's heading frame with an optional surface velocity |
| `src/render/landing.ts` (modify) | `LandingReport.at`; deck-aware tracking; deck-relative roll-out |
| `src/render/frame.ts` (modify) | hook lever; decks to the landing tracker; `settleOnTerrain` via `groundUnder` |
| `src/render/debrief.ts` (modify) | "Landed at" reads `at` |
| `src/render/spawn.ts` (modify) | `SCENARIO_PARAM`, `scenarioIdFromQuery` |
| `src/render/ocean/weather.ts`, `src/render/ocean/beaufort.ts` (modify) | `beaufortFromQuery` returns `undefined` when absent; `beaufortFromWindMps` |
| `src/render/scene/ship.ts` (modify) | deck plane at `flightDeck.heightM`, trap band |
| `src/render/paddlesBadge.ts` (create) | the cue text, `pauseBadge.ts` pattern |
| `src/render/diagnostics.ts`, `src/render/main.ts` (modify) | hook latch, scenario selection, paddles per frame, `deck()`/`paddles()`/`wind()` getters |
| `src/input/bindings.ts`, `src/render/legend.ts` (modify) | `toggleHook: ['KeyH']`, `Hook` row |
| `content/ships/essex-cv.json`, `content/scenarios/free-flight.json`, `content/scenarios/deck-quals.json` (modify/create) | sourced deck geometry, weather, the deck-quals scenario |
| `tests/e2e/deckQuals.spec.ts` (create) | Tier 2 |
| `docs/handoff/2026-09-18-plan8-carrier-ops.md` (create) | handoff |

---

### Task 1: Wind in the simulation, and the bit-identity gate

**Files:**
- Modify: `src/sim/loop.ts:27-44` (SimContext), `:317-359` (World), `:448-483` (createWorldOf), `:529-549` (stepAircraftEntity)
- Modify: `src/sim/flight/model.ts:241-333`, `:498-510`
- Modify: `src/sim/invariants.ts:92-106`
- Modify: `src/sim/scenario.ts:17-53`, `:85-120`
- Modify: `content/scenarios/free-flight.json`
- Modify: `docs/superpowers/specs/2026-09-18-carrier-ops-design.md` §2 and §3 (bearing correction)
- Modify: `tests/sim/scenario.test.ts:126-128`
- Test: `tests/sim/wind.test.ts` (create), `tests/sim/golden/trajectory.test.ts` (add one case)

**Interfaces:**
- Produces: `SimContext.wind?: Vec3 | null`; `World.wind: Vec3 | null`; `createWorldOf({ ..., wind? })`; `Scenario.weather: { windFromDeg: number; windMps: number }`; `windVectorFrom(windFromDeg, windMps): Vec3` exported from `src/sim/scenario.ts`; `airVelocity(state, wind): Vec3` exported from `model.ts`.

- [ ] **Step 1: Correct the spec's bearing before anything is built on it**

`bearingTo` (`src/sim/world/ships.ts:94-99`) is `atan2(Δx, -Δz)`. The free-flight carrier's first leg is `(-19988, -44130) → (-15631, -30784)`, Δx = +4357, Δz = +13346, so the leg bears `atan2(4357, -13346)` = **161.9°**, and the return leg 341.9°. The spec's §2 table says 018°/198° and §3 says "15 kn from 018°". Edit both in `docs/superpowers/specs/2026-09-18-carrier-ops-design.md`:

- §2 row "Task-force speed on its racetrack": replace `about 018° / 198°` with `about 162° / 342° (bearingTo is atan2(Δx, −Δz); corrected 2026-09-18 during planning)`.
- §3: replace `about 15 kn from 018°, which is the bearing of the racetrack's long legs` with `about 15 kn from 342°, so the ship steams into it on the north-westbound long leg (corrected 2026-09-18 during planning: the legs bear 162°/342°, not 018°/198°)`.
- §5, third bullet: replace `deck-relative velocity decays linearly to zero over TRAP_DECEL_S = 2.0 s (about 1.7 g from 34 m/s` with `deck-relative velocity decays at a constant TRAP_DECEL_MPS2 = 17 m/s², which is 2.0 s and 34 m of run-out from a 34 m/s arrival (about 1.7 g` — a constant deceleration needs no memory of the arrival speed, and it is the same figure at approach speed.
- §10 table: the "Arrest run-out" row becomes `17 m/s² constant \| Choice, about 1.7 g; 2.0 s from approach speed.`

- [ ] **Step 2: Write the failing wind tests**

Create `tests/sim/wind.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { createState, step, airspeed, airVelocity, angleOfAttack, DT } from '../../src/sim/flight/model.js'
import { stepChecked } from '../../src/sim/invariants.js'
import { windVectorFrom } from '../../src/sim/scenario.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import { createTerrainField } from '../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../src/sim/world/schema.js'
import type { SimContext } from '../../src/sim/loop.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const RUNWAY_M = 1
const FLAT = createTerrainField(
  parseTerrainHeader({ centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000, finestSamples: 8193, levels: 13, encoding: 'int16-decimetres' }),
  12,
  new Int16Array(9).fill(RUNWAY_M * 10),
)
const FULL = { pitch: 0, roll: 0, yaw: 0, throttle: 1 }

/** Nose north (-z), the parked attitude on Tacloban's strip. */
const north = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2)

function takeoffRollM(wind: SimContext['wind']): { rollM: number; liftoffAirspeedMps: number } {
  let s = createState({ position: v3(0, RUNWAY_M + f6f.gear.heightM, 0), attitude: north, gearFraction: 1, flapFraction: 1 })
  const liftoff = 86.5 * 0.44704
  for (let tick = 1; tick < 60 * 120; tick++) {
    s = step(f6f, s, FULL, { dt: DT, tick, terrain: FLAT, wind })
    if (airspeed({ ...s, velocity: airVelocity(s, wind ?? null) }) >= liftoff) {
      return { rollM: Math.hypot(s.position.x, s.position.z), liftoffAirspeedMps: liftoff }
    }
  }
  throw new Error('never reached lift-off speed')
}

describe('windVectorFrom', () => {
  it('turns a meteorological "from" bearing into the velocity of the air', () => {
    // From 342° (NNW) the air moves toward 162° (SSE): +x east a little, +z south a lot.
    const w = windVectorFrom(342, 7.717)
    expect(w.x).toBeCloseTo(-Math.sin((342 * Math.PI) / 180) * 7.717, 9)
    expect(w.z).toBeCloseTo(Math.cos((342 * Math.PI) / 180) * 7.717, 9)
    expect(w.y).toBe(0)
    // From north the air blows south (+z); from east it blows west (-x).
    expect(windVectorFrom(0, 10).x).toBeCloseTo(0, 9)
    expect(windVectorFrom(0, 10).z).toBeCloseTo(10, 9)
    expect(windVectorFrom(90, 10).x).toBeCloseTo(-10, 9)
    expect(windVectorFrom(90, 10).z).toBeCloseTo(0, 9)
  })
  it('is calm at zero speed', () => {
    const w = windVectorFrom(123, 0)
    expect(Math.hypot(w.x, w.y, w.z)).toBe(0)
  })
})

describe('wind in step', () => {
  it('a null wind is the code path that exists today: bit-identical states', () => {
    let a = createState({ position: v3(0, 500, 0), velocity: v3(0, 0, -80), attitude: north })
    let b = a
    for (let tick = 1; tick <= 600; tick++) {
      a = step(f6f, a, { pitch: 0.1, roll: 0.05, yaw: 0, throttle: 0.6 }, { dt: DT, tick })
      b = step(f6f, b, { pitch: 0.1, roll: 0.05, yaw: 0, throttle: 0.6 }, { dt: DT, tick, wind: null })
    }
    expect(b).toEqual(a)
  })

  it('a headwind shortens the take-off roll and lift-off happens at the same AIRSPEED', () => {
    const calm = takeoffRollM(null)
    // 5 m/s from the north, straight down a northbound roll: the air moves south (+z).
    const headwind = takeoffRollM(windVectorFrom(0, 5))
    expect(headwind.rollM).toBeLessThan(calm.rollM * 0.85)
    expect(headwind.liftoffAirspeedMps).toBe(calm.liftoffAirspeedMps)
  })

  it('angle of attack and airspeed are measured against the air, not the ground', () => {
    // Flying north at 60 m/s ground speed into a 20 m/s headwind is 80 m/s of air.
    const s = createState({ position: v3(0, 500, 0), velocity: v3(0, 0, -60), attitude: north })
    const wind = windVectorFrom(0, 20)
    const air = { ...s, velocity: airVelocity(s, wind) }
    expect(airspeed(air)).toBeCloseTo(80, 9)
    expect(angleOfAttack(air)).toBeCloseTo(angleOfAttack(s), 9)
  })

  it('a hands-off airplane weathercocks into a crosswind', () => {
    // Nose north, 60 m/s ground speed, air arriving from the east at 15 m/s
    // (blowing west, -x): sideslip is positive, the nose must swing right (east).
    let s = createState({ position: v3(0, 1500, 0), velocity: v3(0, 0, -60), attitude: north })
    const wind = windVectorFrom(90, 15)
    const nose = (state: typeof s) => {
      const q = state.attitude
      // body +x in world: quaternion rotate of (1,0,0)
      const x = 1 - 2 * (q.y * q.y + q.z * q.z)
      const z = 2 * (q.x * q.z - q.w * q.y)
      return Math.atan2(x, -z) // compass heading, 0 north
    }
    const start = nose(s)
    for (let tick = 1; tick <= 60 * 5; tick++) s = step(f6f, s, { pitch: 0, roll: 0, yaw: 0, throttle: 0.5 }, { dt: DT, tick, wind })
    expect(nose(s)).toBeGreaterThan(start + 0.02)
  })

  it('the airmass-frame energy invariant holds at idle in a steady wind', () => {
    let s = createState({ position: v3(0, 2000, 0), velocity: v3(0, 0, -90), attitude: north })
    const wind = windVectorFrom(270, 12)
    for (let tick = 1; tick <= 60 * 20; tick++) {
      s = stepChecked(f6f, s, { pitch: 0.05, roll: 0.2, yaw: 0, throttle: 0 }, { dt: DT, tick, wind })
    }
    expect(Number.isFinite(s.position.y)).toBe(true)
  })
})
```

Add to `tests/sim/golden/trajectory.test.ts`, inside the existing `describe`:

```ts
  it('is bit-identical to the committed golden on this engine (Plan 8 wind gate)', () => {
    // Plan 8 threads a wind through `step`. The null-wind path must be the
    // exact code that recorded this file, not merely within tolerance of it.
    // If this ever fails while the tolerance case above passes, a physics
    // path changed under the flag that says it did not.
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as GoldenTrajectory
    expect(recordTrajectory(f6f).checkpoints).toEqual(golden.checkpoints)
  })
```

- [ ] **Step 3: Run the new tests and confirm they fail**

Run: `npx vitest run tests/sim/wind.test.ts tests/sim/golden/trajectory.test.ts`
Expected: `wind.test.ts` fails to compile (`airVelocity`, `windVectorFrom` not exported; `wind` not on `SimContext`). The golden bit-identity case PASSES already (nothing has changed yet) — that is the point: it stays green through the rest of this task.

- [ ] **Step 4: Add wind to SimContext and World**

In `src/sim/loop.ts`, extend `SimContext` (after `terrain`):

```ts
  /**
   * The velocity of the air, world frame, m/s -- Plan 8. `undefined` and
   * `null` both mean calm and select the exact code path that existed before
   * wind was coupled (the subtraction is skipped, not performed with zero).
   * Optional for the reason `terrain` is: one production construction site.
   */
  readonly wind?: Vec3 | null
```

Extend `World<M>` (after `terrain`):

```ts
  /** Scenario wind, the velocity of the air; `null` is calm. Static for the
   *  flight, in `World` because `advance` builds every `SimContext` from it. */
  readonly wind: Vec3 | null
```

In `createWorldOf`, add `readonly wind?: Vec3 | null` to `parts` and `wind: parts.wind ?? null,` to the returned object. In `stepAircraftEntity`, thread it: add a `wind: Vec3 | null` parameter after `terrain`, build the context as `{ dt: DT, tick, terrain, wind }`, and in `advance` call `stepAircraftEntity(a, tick, world.terrain, world.wind, stepper, assist)`. Import `type Vec3` from `./math/vec3.js` if not already imported.

- [ ] **Step 5: Read air-relative velocity in step**

In `src/sim/flight/model.ts`, add after `airspeed` (line 38):

```ts
/**
 * The airplane's velocity through the AIR, world frame: ground velocity minus
 * the velocity of the air. With `wind` null the ground velocity is returned
 * as the same object, so the calm path performs no arithmetic at all and
 * stays bit-identical to the model before Plan 8 (the golden's exact-equality
 * case pins this).
 */
export function airVelocity(state: AircraftState, wind: Vec3 | null): Vec3 {
  return wind == null ? state.velocity : sub(state.velocity, wind)
}
```

Add `sub` to the `vec3.js` import. Inside `step`, immediately after `const mass = massKg(spec, state)`:

```ts
  // Every aerodynamic quantity below reads `air`, the state seen by the
  // airflow; integration, the ground constraint, rolling and tire grip keep
  // reading `state`, which is the ground frame. With no wind `air` IS `state`.
  const air = ctx.wind == null ? state : { ...state, velocity: airVelocity(state, ctx.wind) }
```

Then change these reads (and only these) from `state` to `air`:

- `const v = airspeed(state)` → `const v = airspeed(air)` (line 260)
- `const alpha = angleOfAttack(state)` → `angleOfAttack(air)` (line 264)
- `const thrustN = thrustMagnitude(spec, state, controls.throttle)` → `thrustMagnitude(spec, air, controls.throttle)`
- `const vdir = v > 1e-6 ? normalize(state.velocity) : forward` → `normalize(air.velocity)` (line 303)
- `const stalled = isStalled(spec, state)` → `isStalled(spec, air)` (line 511)

`vdir` feeds the drag direction, the lift direction, the sideslip and the weathercock, so those follow. The rolling-resistance `track` (line 416), the integration (437-439), and every `ground.ts` call keep `state`.

Where `ratesWithStall`/`commandedBodyRates` are computed inside `step` from `q`, nothing changes: `q` already comes from `v`.

- [ ] **Step 6: The invariant passes the wind**

In `src/sim/invariants.ts`, `stepChecked` becomes:

```ts
export function stepChecked(
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
  ctx: SimContext,
): AircraftState {
  const wind = ctx.wind ?? ZERO
  const before = specificEnergyAirmass(state, wind)
  const next = step(spec, state, controls, ctx)
  assertFinite(next, 'stepChecked')
  if (isIdleThrottle(controls)) {
    const after = specificEnergyAirmass(next, wind)
    assertNoEnergyGain(before, after, 'stepChecked')
  }
  return next
}
```

Replace the paragraph of its doc comment that begins "`step()` does not couple wind into the aerodynamics yet" with: "Plan 8 (2026-09-18) coupled wind into `step()`, so the airmass frame is now the frame the physics produces and this passes `ctx.wind` through. R29's measurement (a 130 m/s wind tripping the check by +0.104 J/kg) was of the OLD model; `tests/sim/wind.test.ts` runs 20 s at idle in a 12 m/s wind through this function."

- [ ] **Step 7: Scenario weather**

In `src/sim/scenario.ts`, add to `ScenarioObject` after `ships`:

```ts
  /** Steady wind, meteorological convention: the true bearing it blows FROM,
   *  and its speed. Plan 8. `windMps: 0` is calm, which `worldFromScenario`
   *  turns into a `null` world wind so the calm code path is selected. */
  weather: z.object({ windFromDeg: finite, windMps: finite.refine((n) => n >= 0, { message: 'must not be negative' }) }).strict(),
```

Add and export:

```ts
/**
 * The velocity of the air for a wind blowing FROM `windFromDeg` (true, 0 =
 * north, 90 = east) at `windMps`. Compass convention as `shipVelocity`:
 * +x east, +z south, north is -z. A wind FROM the north moves the air
 * TOWARD the south, +z.
 */
export function windVectorFrom(windFromDeg: number, windMps: number): Vec3 {
  const rad = (windFromDeg * Math.PI) / 180
  return v3(-Math.sin(rad) * windMps, 0, Math.cos(rad) * windMps)
}
```

In `worldFromScenario`, pass `wind: s.weather.windMps === 0 ? null : windVectorFrom(s.weather.windFromDeg, s.weather.windMps)` to `createWorldOf`. Update the file's header comment: remove `weather` from the list of things the scenario deliberately does not carry.

Add `"weather": { "windFromDeg": 0, "windMps": 0 }` to `content/scenarios/free-flight.json` (before the closing brace, after `ships`).

In `tests/sim/scenario.test.ts:127`, the unknown-key case: replace `{ ...raw, weather: {} }` with `{ ...raw, loadout: {} }` and the regex `/weather/` with `/loadout/`. Add beside it:

```ts
    expect(() => parseScenario({ ...raw, weather: { windFromDeg: 0, windMps: -1 } })).toThrow(/windMps/)
    expect(() => parseScenario({ ...raw, weather: { windFromDeg: 0 } })).toThrow(/windMps/)
```

- [ ] **Step 8: Run the suite**

Run: `npx vitest run tests/sim/wind.test.ts tests/sim/golden tests/sim/scenario.test.ts tests/sim/testcards tests/sim/landing.test.ts tests/render/frame.test.ts`
Expected: all pass, including the new exact-equality golden case. If the golden exact case fails, `air` is being read somewhere on the calm path; the only permitted difference is the `ctx.wind == null` branch.

Then `npm run verify; rc=$?; echo rc=$rc` → `rc=0`.

- [ ] **Step 9: Ledger and commit**

Create `.superpowers/sdd/2026-09-18-carrier-ops/progress.md` with a Decisions section recording: the bearing correction; the constant-deceleration arrest; that `World.wind` was added despite §4's "World does not change" because `advance` has to build every context from it.

```bash
git add src/sim/loop.ts src/sim/flight/model.ts src/sim/invariants.ts src/sim/scenario.ts content/scenarios/free-flight.json docs/superpowers/specs/2026-09-18-carrier-ops-design.md tests/sim/wind.test.ts tests/sim/golden/trajectory.test.ts tests/sim/scenario.test.ts
git commit -m "Couple a steady scenario wind into the flight model, bit-identical when calm"
```

---

### Task 2: The deck under the wheels

**Files:**
- Create: `src/sim/world/deck.ts`, `src/sim/world/ground.ts`
- Modify: `src/sim/world/ships.ts:21-40` (schema), `src/sim/contact.ts:11-25, 65-91`, `src/sim/ground.ts:189-224, 420-434, 522-537, 567-585`, `src/sim/flight/model.ts` (three terrain reads), `src/sim/loop.ts` (SimContext, advance, stepAircraftEntity), `content/ships/essex-cv.json`
- Test: `tests/sim/world/deck.test.ts` (create), `tests/sim/world/ground.test.ts` (create), `tests/sim/ground.test.ts` (add), `tests/sim/world/ships.test.ts` (add)

**Interfaces:**
- Consumes: `ShipEntity`, `ShipState.headingRad`, `shipVelocity` from Task 0 code.
- Produces:

```ts
// src/sim/world/deck.ts
export type Deck = {
  readonly shipId: string
  readonly center: Vec3          // world; y = SEA_LEVEL_M + flightDeck.heightM
  readonly headingRad: number
  readonly lengthM: number
  readonly widthM: number
  readonly velocity: Vec3
  readonly trapFromSternM: number
  readonly trapToSternM: number
}
export function deckOf(ship: ShipEntity): Deck | null
export function decksOf(ships: readonly ShipEntity[]): readonly Deck[]
/** Deck-local meters: x across to starboard, z along toward the bow. */
export function deckLocal(deck: Deck, x: number, z: number): { x: number; z: number }
export function deckWorld(deck: Deck, x: number, z: number): { x: number; z: number }
export function insideDeck(deck: Deck, x: number, z: number): boolean
export function insideTrapZone(deck: Deck, x: number, z: number): boolean
// src/sim/world/ground.ts
export type GroundUnder = { readonly heightM: number; readonly surface: ContactSurface; readonly velocity: Vec3; readonly deck: Deck | null }
export function groundUnder(terrain: TerrainField | null, decks: readonly Deck[], x: number, z: number): GroundUnder | null
```

`ShipSpec` gains optional `flightDeck: { lengthM, widthM, heightM }`, `trapZone: { fromSternM, toSternM }`, `paddles: PaddlesParams` (Task 6 defines the params; declare the schema here). `SimContext.decks?: readonly Deck[]`. `ContactSurface = 'water' | 'land' | 'deck'`.

- [ ] **Step 1: Failing tests for the deck geometry**

Create `tests/sim/world/deck.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { deckOf, decksOf, deckLocal, deckWorld, insideDeck, insideTrapZone } from '../../../src/sim/world/deck.js'
import { createShipState, shipVelocity } from '../../../src/sim/world/ships.js'
import { SEA_LEVEL_M } from '../../../src/sim/world/terrain.js'
import { loadShipSpec } from '../../../tools/content/load.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import type { ShipEntity } from '../../../src/sim/loop.js'

const cv = loadShipSpec('essex-cv')
const dd = loadShipSpec('fletcher-dd')

const ship = (spec: typeof cv, headingRad: number, x = 1000, z = -2000, speedMps = 7.717): ShipEntity => {
  const state = createShipState({ position: v3(x, SEA_LEVEL_M, z), headingRad, speedMps })
  return { id: spec.id === 'essex-cv' ? 'cv-1' : 'dd-1', spec, state, previous: state, orders: { waypoints: [{ x, z }, { x, z: z - 1 }], speedMps } }
}

describe('deckOf', () => {
  it('derives a deck from a carrier and nothing from an escort', () => {
    const deck = deckOf(ship(cv, 0))!
    expect(deck).not.toBeNull()
    expect(deck.shipId).toBe('cv-1')
    expect(deck.center).toEqual(v3(1000, SEA_LEVEL_M + cv.flightDeck!.heightM, -2000))
    expect(deck.lengthM).toBe(cv.flightDeck!.lengthM)
    expect(deck.widthM).toBe(cv.flightDeck!.widthM)
    expect(deck.velocity).toEqual(shipVelocity(0, 7.717))
    expect(deck.trapFromSternM).toBe(cv.trapZone!.fromSternM)
    expect(deckOf(ship(dd, 0))).toBeNull()
    expect(decksOf([ship(cv, 0), ship(dd, 0)])).toHaveLength(1)
  })
})

describe('deck frames', () => {
  it('local z runs toward the bow along the heading, local x to starboard, at every heading', () => {
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 2.8, -1.1]) {
      const deck = deckOf(ship(cv, heading))!
      const bow = deckWorld(deck, 0, 100)
      // 100 m toward the bow is 100 m along the heading: north is -z, east is +x.
      expect(bow.x - deck.center.x).toBeCloseTo(Math.sin(heading) * 100, 9)
      expect(bow.z - deck.center.z).toBeCloseTo(-Math.cos(heading) * 100, 9)
      const stbd = deckWorld(deck, 10, 0)
      // Starboard is the heading rotated a quarter turn clockwise seen from above.
      expect(stbd.x - deck.center.x).toBeCloseTo(Math.cos(heading) * 10, 9)
      expect(stbd.z - deck.center.z).toBeCloseTo(Math.sin(heading) * 10, 9)
      const back = deckLocal(deck, bow.x, bow.z)
      expect(back.x).toBeCloseTo(0, 9)
      expect(back.z).toBeCloseTo(100, 9)
    }
  })

  it('insideDeck is the rectangle, insideTrapZone the band measured from the stern', () => {
    const deck = deckOf(ship(cv, 1.0))!
    const half = deck.lengthM / 2
    const on = deckWorld(deck, 0, 0)
    expect(insideDeck(deck, on.x, on.z)).toBe(true)
    const offBow = deckWorld(deck, 0, half + 0.5)
    expect(insideDeck(deck, offBow.x, offBow.z)).toBe(false)
    const offSide = deckWorld(deck, deck.widthM / 2 + 0.5, 0)
    expect(insideDeck(deck, offSide.x, offSide.z)).toBe(false)
    // The trap zone: `fromSternM` to `toSternM` measured forward from the stern (local z = -half).
    const inZone = deckWorld(deck, 3, -half + (deck.trapFromSternM + deck.trapToSternM) / 2)
    expect(insideTrapZone(deck, inZone.x, inZone.z)).toBe(true)
    const shortOfZone = deckWorld(deck, 0, -half + deck.trapFromSternM - 1)
    expect(insideTrapZone(deck, shortOfZone.x, shortOfZone.z)).toBe(false)
    const pastZone = deckWorld(deck, 0, -half + deck.trapToSternM + 1)
    expect(insideTrapZone(deck, pastZone.x, pastZone.z)).toBe(false)
    expect(insideTrapZone(deck, offSide.x, offSide.z)).toBe(false)
  })
})
```

Create `tests/sim/world/ground.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { groundUnder } from '../../../src/sim/world/ground.js'
import { deckOf, deckWorld } from '../../../src/sim/world/deck.js'
import { createShipState, shipVelocity } from '../../../src/sim/world/ships.js'
import { createTerrainField, SEA_LEVEL_M } from '../../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../../src/sim/world/schema.js'
import { loadShipSpec } from '../../../tools/content/load.js'
import { v3, ZERO } from '../../../src/sim/math/vec3.js'
import type { ShipEntity } from '../../../src/sim/loop.js'

const cv = loadShipSpec('essex-cv')
const header = parseTerrainHeader({ centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000, finestSamples: 8193, levels: 13, encoding: 'int16-decimetres' })
const sea = createTerrainField(header, 12, new Int16Array(9).fill(0))
const land = createTerrainField(header, 12, new Int16Array(9).fill(10))

const carrier = (headingRad: number): ShipEntity => {
  const state = createShipState({ position: v3(500, SEA_LEVEL_M, 500), headingRad, speedMps: 7.717 })
  return { id: 'cv-1', spec: cv, state, previous: state, orders: { waypoints: [{ x: 500, z: 500 }, { x: 500, z: 0 }], speedMps: 7.717 } }
}

describe('groundUnder', () => {
  it('is null with no terrain and no decks, and terrain without decks is what heightAt says', () => {
    expect(groundUnder(null, [], 0, 0)).toBeNull()
    expect(groundUnder(sea, [], 0, 0)).toEqual({ heightM: 0, surface: 'water', velocity: ZERO, deck: null })
    expect(groundUnder(land, [], 0, 0)).toEqual({ heightM: 1, surface: 'land', velocity: ZERO, deck: null })
  })

  it('a deck wins over the water under it, with the ship velocity, and only inside its rectangle', () => {
    const deck = deckOf(carrier(0.7))!
    const on = deckWorld(deck, 5, -40)
    const g = groundUnder(sea, [deck], on.x, on.z)!
    expect(g.surface).toBe('deck')
    expect(g.heightM).toBe(SEA_LEVEL_M + cv.flightDeck!.heightM)
    expect(g.velocity).toEqual(shipVelocity(0.7, 7.717))
    expect(g.deck).toBe(deck)
    const off = deckWorld(deck, deck.widthM, 0)
    expect(groundUnder(sea, [deck], off.x, off.z)).toEqual({ heightM: 0, surface: 'water', velocity: ZERO, deck: null })
  })

  it('a deck exists even with no terrain field yet: a deck spawn needs no heightfield', () => {
    const deck = deckOf(carrier(0))!
    const on = deckWorld(deck, 0, 0)
    expect(groundUnder(null, [deck], on.x, on.z)!.surface).toBe('deck')
    expect(groundUnder(null, [deck], on.x + 1000, on.z)).toBeNull()
  })
})
```

Add to `tests/sim/world/ships.test.ts`:

```ts
  it('carries the sourced flight deck, trap zone and paddles blocks on the carrier and none on the escort', () => {
    expect(cv.flightDeck).toEqual({ lengthM: 262.7, widthM: 32.9, heightM: 17 })
    expect(cv.trapZone).toEqual({ fromSternM: 30, toSternM: 130 })
    expect(cv.paddles).toBeDefined()
    expect(dd.flightDeck).toBeUndefined()
    expect(() => parseShipSpec({ ...raw, trapZone: { fromSternM: 130, toSternM: 30 } })).toThrow(/toSternM/)
  })
```

(`raw` is the carrier JSON the existing `parseShipSpec` cases in that file already use.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/sim/world/deck.test.ts tests/sim/world/ground.test.ts tests/sim/world/ships.test.ts`
Expected: FAIL — modules do not exist; `flightDeck` undefined on the spec.

- [ ] **Step 3: Schema and content**

In `src/sim/world/ships.ts`, add before `ShipSpecObject`:

```ts
/** LSO cue parameters; the function that reads them is `src/sim/paddles.ts`. */
const PaddlesObject = z
  .object({
    glideslopeDeg: positive,
    glideslopeToleranceDeg: positive,
    speedBandMps: positive,
    coneHalfAngleDeg: positive,
    maxRangeM: positive,
    cutRangeM: positive,
    waveOffRangeM: positive,
  })
  .strict()
```

and inside `ShipSpecObject` after `turnRateRadPerS`:

```ts
    /** The flight deck a Plan 8 `Deck` is derived from: a rectangle centered
     *  on the ship's position, `heightM` above the waterline. Carriers only. */
    flightDeck: z.object({ lengthM: positive, widthM: positive, heightM: positive }).strict().optional(),
    /** The arcade trap zone, meters forward of the stern. */
    trapZone: z
      .object({ fromSternM: finite.refine((n) => n >= 0, { message: 'must not be negative' }), toSternM: positive })
      .strict()
      .refine((z) => z.toSternM > z.fromSternM, { message: 'toSternM must exceed fromSternM', path: ['toSternM'] })
      .optional(),
    paddles: PaddlesObject.optional(),
```

Export `export type PaddlesParams = z.infer<typeof PaddlesObject>`.

Replace `content/ships/essex-cv.json` with:

```json
{
  "id": "essex-cv",
  "name": "Essex-class fleet carrier",
  "role": "carrier",
  "lengthM": 265.8,
  "beamM": 28.3,
  "deckWidthM": 45.0,
  "deckHeightM": 17,
  "maxSpeedMps": 17.0,
  "turnRateRadPerS": 0.01745,
  "flightDeck": { "lengthM": 262.7, "widthM": 32.9, "heightM": 17 },
  "trapZone": { "fromSternM": 30, "toSternM": 130 },
  "paddles": {
    "glideslopeDeg": 3.5,
    "glideslopeToleranceDeg": 0.7,
    "speedBandMps": 3,
    "coneHalfAngleDeg": 20,
    "maxRangeM": 2500,
    "cutRangeM": 120,
    "waveOffRangeM": 250
  },
  "reference": {
    "source": "lengthM (872 ft overall, short-hull group), beamM (93 ft waterline), deckWidthM (147 ft 6 in / 147.5 ft maximum beam at flight-deck level) and maxSpeedMps (33 kn) from the English Wikipedia article 'Essex-class aircraft carrier', read 2026-09-18. flightDeck.lengthM and widthM are the 862 ft x 108 ft flight deck of the early (short-hull) ships, from globalsecurity.org 'CV-9 Essex Class - Original Design' and the same Wikipedia article, read 2026-09-18 (Plan 8). flightDeck.heightM and deckHeightM are the SAME ESTIMATE of the flight deck above the waterline: searched 2026-09-18 (Wikipedia, globalsecurity.org, naval-encyclopedia.com), no freeboard figure was found, only the hangar's 17 ft 6 in overhead; it decides only where the surface is. trapZone is an ESTIMATE laid over globalsecurity's 'sixteen wire MK 4 arresting gear ... spaced from the stern to just aft of the island' with the island near the deck's midpoint (Plan 8 design section 10). paddles are CHOICES, tuned by flying (Plan 8 design section 7). turnRateRadPerS (1 deg/s, about a 440 m turning radius at 15 kn) is an ESTIMATE; no tactical diameter was found."
  }
}
```

- [ ] **Step 4: deck.ts and ground.ts**

Create `src/sim/world/deck.ts`:

```ts
import { v3, type Vec3 } from '../math/vec3.js'
import { shipVelocity } from './ships.js'
import type { ShipEntity } from '../loop.js'

/**
 * A carrier's flight deck as the ground constraint sees it this tick: a
 * rectangle in the ship's frame, at the flight deck's height, carrying the
 * ship's velocity. Derived by `advance` from `world.ships` AFTER they step
 * (entities design section 9), never stored on an entity, so it can never be
 * stale. Deck-local coordinates: `x` across to starboard, `z` along toward
 * the bow, both meters from the deck center.
 */
export type Deck = {
  readonly shipId: string
  readonly center: Vec3
  readonly headingRad: number
  readonly lengthM: number
  readonly widthM: number
  readonly velocity: Vec3
  readonly trapFromSternM: number
  readonly trapToSternM: number
}

export function deckOf(ship: ShipEntity): Deck | null {
  const fd = ship.spec.flightDeck
  if (fd === undefined) return null
  const zone = ship.spec.trapZone ?? { fromSternM: 0, toSternM: 0 }
  const { position, headingRad, speedMps } = ship.state
  return {
    shipId: ship.id,
    center: v3(position.x, position.y + fd.heightM, position.z),
    headingRad,
    lengthM: fd.lengthM,
    widthM: fd.widthM,
    velocity: shipVelocity(headingRad, speedMps),
    trapFromSternM: zone.fromSternM,
    trapToSternM: zone.toSternM,
  }
}

export function decksOf(ships: readonly ShipEntity[]): readonly Deck[] {
  const decks: Deck[] = []
  for (const s of ships) {
    const d = deckOf(s)
    if (d !== null) decks.push(d)
  }
  return decks
}

/** World offset of one meter toward the bow: the compass convention of
 *  `shipVelocity`, +x east, +z south, north = -z. */
const bowDir = (headingRad: number) => ({ x: Math.sin(headingRad), z: -Math.cos(headingRad) })
/** One meter to starboard: the bow direction turned a quarter turn clockwise seen from above. */
const starboardDir = (headingRad: number) => ({ x: Math.cos(headingRad), z: Math.sin(headingRad) })

export function deckWorld(deck: Deck, x: number, z: number): { x: number; z: number } {
  const b = bowDir(deck.headingRad), s = starboardDir(deck.headingRad)
  return { x: deck.center.x + s.x * x + b.x * z, z: deck.center.z + s.z * x + b.z * z }
}

export function deckLocal(deck: Deck, x: number, z: number): { x: number; z: number } {
  const b = bowDir(deck.headingRad), s = starboardDir(deck.headingRad)
  const dx = x - deck.center.x, dz = z - deck.center.z
  return { x: dx * s.x + dz * s.z, z: dx * b.x + dz * b.z }
}

export function insideDeck(deck: Deck, x: number, z: number): boolean {
  const l = deckLocal(deck, x, z)
  return Math.abs(l.x) <= deck.widthM / 2 && Math.abs(l.z) <= deck.lengthM / 2
}

/** Inside the rectangle AND between the trap zone's two stern distances. */
export function insideTrapZone(deck: Deck, x: number, z: number): boolean {
  if (!insideDeck(deck, x, z)) return false
  const fromStern = deckLocal(deck, x, z).z + deck.lengthM / 2
  return fromStern >= deck.trapFromSternM && fromStern <= deck.trapToSternM
}
```

Create `src/sim/world/ground.ts`:

```ts
import { ZERO, type Vec3 } from '../math/vec3.js'
import { heightAt, type TerrainField } from './terrain.js'
import { surfaceAt, type ContactSurface } from '../contact.js'
import { insideDeck, type Deck } from './deck.js'

/** What is under a point: its height, what kind of thing it is, and how fast
 *  it is moving. Land and water do not move; a deck moves with its ship. */
export type GroundUnder = {
  readonly heightM: number
  readonly surface: ContactSurface
  readonly velocity: Vec3
  readonly deck: Deck | null
}

/**
 * ONE ground lookup for the whole simulation (Plan 8). A deck wins over the
 * water beneath it; elsewhere this is exactly `heightAt` + `surfaceAt`.
 * `null` means "no ground": no terrain field yet and no deck here, which is
 * the state a parked airplane ashore is held in until its heightfield lands.
 */
export function groundUnder(terrain: TerrainField | null, decks: readonly Deck[], x: number, z: number): GroundUnder | null {
  for (const deck of decks) {
    if (insideDeck(deck, x, z)) return { heightM: deck.center.y, surface: 'deck', velocity: deck.velocity, deck }
  }
  if (terrain === null) return null
  const heightM = heightAt(terrain, x, z)
  return { heightM, surface: surfaceAt(heightM), velocity: ZERO, deck: null }
}
```

In `src/sim/contact.ts`: `export type ContactSurface = 'water' | 'land' | 'deck'`, update its comment (the union "grows with `'deck'` in Plan 8" sentence becomes "grew `'deck'` in Plan 8"), and in `contactOutcome` change the early-out to `if (surface === 'land' || surface === 'deck') return 'destroyed'` with a comment: "A deck arrival that failed `supportedContact`'s gates hit steel, not water."

- [ ] **Step 5: Run the geometry tests**

Run: `npx vitest run tests/sim/world/deck.test.ts tests/sim/world/ground.test.ts tests/sim/world/ships.test.ts`
Expected: PASS.

- [ ] **Step 6: Failing tests for the ground constraint at a surface velocity**

Add to `tests/sim/ground.test.ts`, a new `describe`:

```ts
describe('a moving surface (Plan 8)', () => {
  const DECK_M = 17
  const shipV = v3(7.717, 0, 0)
  const parkedOnDeck = createState({ position: v3(0, DECK_M + H, 0), velocity: shipV, gearFraction: 1 })

  it('supportedContact judges sink and speed RELATIVE to the surface and accepts a deck', () => {
    expect(supportedContact(f6f, parkedOnDeck, DECK_M, 'deck', shipV)).toBe(true)
    // The same airplane judged against a still surface is moving at 7.7 m/s but still supported (below every gate).
    expect(supportedContact(f6f, parkedOnDeck, DECK_M, 'land')).toBe(true)
    // Water is never a supported contact, deck or not.
    expect(supportedContact(f6f, parkedOnDeck, DECK_M, 'water', shipV)).toBe(false)
    // A deck arrival at exactly the ship's speed plus 1.5 x stall is too fast; at the ship's speed plus 1.3 x stall it is not.
    const stall = effectiveStallSpeedMps(f6f, 0)
    const fast = createState({ position: v3(0, DECK_M + H, 0), velocity: v3(7.717 + 1.5 * stall, -1, 0), gearFraction: 1 })
    const ok = createState({ position: v3(0, DECK_M + H, 0), velocity: v3(7.717 + 1.3 * stall, -1, 0), gearFraction: 1 })
    expect(supportedContact(f6f, fast, DECK_M, 'deck', shipV)).toBe(false)
    expect(supportedContact(f6f, ok, DECK_M, 'deck', shipV)).toBe(true)
  })

  it('restOnSurface stops the sink but keeps the surface velocity: a parked airplane sails with the ship', () => {
    const sinking = createState({ position: v3(0, DECK_M + H - 0.1, 0), velocity: v3(7.717, -0.5, 0), gearFraction: 1 })
    const rested = restOnSurface(f6f, sinking, DECK_M, shipV)
    expect(rested.position.y).toBe(DECK_M + H)
    expect(rested.velocity).toEqual(v3(7.717, 0, 0))
  })

  it('the zero-velocity default is the old function exactly', () => {
    const s = createState({ position: v3(0, 1 + H - 0.1, 0), velocity: v3(30, -0.5, 0), gearFraction: 1 })
    expect(restOnSurface(f6f, s, 1, ZERO)).toEqual(restOnSurface(f6f, s, 1))
    expect(lateralGripAfter(f6f, s, DT, ZERO)).toEqual(lateralGripAfter(f6f, s, DT))
    expect(groundBodyRates(f6f, s, { pitch: 0, roll: 0, yaw: 0.5, throttle: 0 }, v3(0, 0, 0), ZERO))
      .toEqual(groundBodyRates(f6f, s, { pitch: 0, roll: 0, yaw: 0.5, throttle: 0 }, v3(0, 0, 0)))
  })

  it('tire grip damps the velocity ACROSS the nose relative to the deck, not relative to the world', () => {
    // Nose north, ship moving east at 7.7: relative to the deck the airplane is still, so grip changes nothing.
    const still = createState({ position: v3(0, DECK_M + H, 0), velocity: shipV, attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2), gearFraction: 1 })
    expect(lateralGripAfter(f6f, still, DT, shipV)).toEqual(shipV)
  })
})
```

Add `ZERO` to that file's `vec3.js` import.

- [ ] **Step 7: Run to see them fail**

Run: `npx vitest run tests/sim/ground.test.ts -t "moving surface"`
Expected: FAIL (extra arguments ignored; deck surface rejected).

- [ ] **Step 8: Surface velocity through ground.ts**

In `src/sim/ground.ts`, import `ZERO, add` from `./math/vec3.js` and `type ContactSurface` from `./contact.js`.

`supportedContact`:

```ts
export function supportedContact(
  spec: AircraftSpec,
  state: AircraftState,
  groundHeightM: number,
  surface: ContactSurface = surfaceAt(groundHeightM),
  surfaceVelocity: Vec3 = ZERO,
): boolean {
  // Relative to the surface: a deck carries the airplane, and the gates are
  // about how it ARRIVES on what it lands on, not about the world (Plan 8).
  const rel = sub(state.velocity, surfaceVelocity)
  const speed = length(rel)
  const descending = rel.y < -ARRIVAL_SINK_THRESHOLD_MPS
  const stallMps = effectiveStallSpeedMps(spec, state.flapFraction)
  return (surface === 'land' || surface === 'deck')
    && onGround(spec, state, groundHeightM)
    && state.gearFraction >= GEAR_DOWN_FRACTION
    && Number.isFinite(rel.y) && rel.y >= -MAX_SUPPORTED_SINK_MPS
    && Number.isFinite(speed)
    && (!descending || speed <= MAX_SUPPORTED_SPEED_STALL_MULTIPLE * stallMps)
}
```

`restOnSurface(spec, state, groundHeightM, surfaceVelocity: Vec3 = ZERO)`: compute `const rel = sub(state.velocity, surfaceVelocity)` and use `rel` wherever the body reads `state.velocity`; where it writes a velocity, add the surface velocity back: the "sinking or level" branch returns `velocity: add(v3(rel.x, 0, rel.z), surfaceVelocity)`, the separating test is `if (rel.y > 0) return state`, and the climb-cost branch scales `rel` then adds `surfaceVelocity`. `lateralGripAfter(spec, state, dt, surfaceVelocity = ZERO)`: form `horizontal` from `rel`, and add `surfaceVelocity.x/z` back to the returned components. `groundBodyRates(spec, state, controls, airRates, surfaceVelocity = ZERO)`: `groundSpeed` from `rel`.

The zero default subtracts an exact zero and adds an exact zero, which is bit-identical in IEEE arithmetic; the test in Step 6 asserts it with `toEqual`.

- [ ] **Step 9: Decks through SimContext, step and advance**

`src/sim/loop.ts`: add `readonly decks?: readonly Deck[]` to `SimContext` (import `type Deck` from `./world/deck.js`, `decksOf` too, and `groundUnder` from `./world/ground.js`). In `advance`, after the ships map and before the aircraft map:

```ts
    // Decks, from the ships that have ALREADY moved this tick (spec §3.4):
    // an airplane on deck reads the pose the ship has at the end of the tick.
    const decks = decksOf(ships)
    aircraft = aircraft.map((a) => stepAircraftEntity(a, tick, world.terrain, world.wind, decks, stepper, assist))
```

`stepAircraftEntity` gains `decks: readonly Deck[]` after `wind`, builds `{ dt: DT, tick, terrain, wind, decks }`, and its impact detection becomes:

```ts
  const ground = groundUnder(terrain, decks, current.position.x, current.position.z)
  if (ground !== null) {
    if (current.position.y <= ground.heightM && !supportedContact(entity.spec, current, ground.heightM, ground.surface, ground.velocity)) {
      const impact: Impact = {
        tick: current.tick,
        position: current.position,
        verticalSpeedMps: current.velocity.y,
        groundHeightM: ground.heightM,
        surface: ground.surface,
        kind: contactOutcome(entity.spec, current, ground.surface),
      }
      return { ...entity, state: current, previous: current, assistMemory: assisted.memory, impact }
    }
  }
```

`src/sim/flight/model.ts`: import `groundUnder` from `../world/ground.js` (and drop the now-unused `heightAt`/`surfaceAt` imports if nothing else uses them). Replace the three terrain reads:

(i) `startGroundHeightM`:
```ts
  const startGround = groundUnder(ctx.terrain ?? null, ctx.decks ?? [], state.position.x, state.position.z)
  const startGroundHeightM = startGround === null ? null : startGround.heightM
```
(ii) the pre-integration block: `if (startGround !== null)` with `onGroundStart = onGround(spec, state, startGround.heightM)`, `onLandStart = startGround.surface === 'land' || startGround.surface === 'deck'`, the support test `supportedContact(spec, state, startGround.heightM, startGround.surface, startGround.velocity)`, and the rolling-resistance `track` built from `sub(state.velocity, startGround.velocity)`.
(iii) the post-integration constraint:
```ts
  const ground = groundUnder(ctx.terrain ?? null, ctx.decks ?? [], position.x, position.z)
  if (ground !== null) {
    const integrated: AircraftState = { ...state, position, velocity }
    if (supportedContact(spec, integrated, ground.heightM, ground.surface, ground.velocity)) {
      const rested = restOnSurface(spec, integrated, ground.heightM, ground.velocity)
      position = rested.position
      velocity = lateralGripAfter(spec, { ...rested, velocity: rested.velocity }, dt, ground.velocity)
    }
  }
```
(iv) `groundBodyRates(spec, state, controls, ratesWithStall, startGround?.velocity ?? ZERO)` under the same gate, which now reads `startGround !== null && onGroundStart && ...`.

Where `groundUnder` returns `null` for "no terrain and no deck", every branch behaves as `ctx.terrain == null` did.

- [ ] **Step 10: The chock-on-deck test**

Add to `tests/sim/world/deck.test.ts`:

```ts
describe('an airplane on a moving deck', () => {
  it('a chocked airplane holds station on the deck through 60 s of sailing including a turn', async () => {
    const { advance, createWorldOf, withControls } = await import('../../../src/sim/loop.js')
    const { createState, DT } = await import('../../../src/sim/flight/model.js')
    const { loadAircraftSpec } = await import('../../../tools/content/load.js')
    const { qFromAxisAngle } = await import('../../../src/sim/math/quat.js')
    const f6f = loadAircraftSpec('f6f-hellcat')
    // A tight loop so the ship turns inside the minute: 1 deg/s is 60 deg.
    const state = createShipState({ position: v3(0, SEA_LEVEL_M, 0), headingRad: 0, speedMps: 7.717 })
    const carrier: ShipEntity = { id: 'cv-1', spec: cv, state, previous: state, orders: { waypoints: [{ x: 0, z: 0 }, { x: 3000, z: -3000 }, { x: 0, z: -6000 }], speedMps: 7.717 } }
    const deck = deckOf(carrier)!
    const spot = deckWorld(deck, 0, -110)
    const plane = createState({
      position: v3(spot.x, deck.center.y + f6f.gear.heightM, spot.z),
      velocity: deck.velocity,
      attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - deck.headingRad),
      gearFraction: 1,
    })
    let world = createWorldOf({
      aircraft: [{ id: 'f6f-1', spec: f6f, state: plane, previous: plane, controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0, gearDown: true, brake: 1 }, assistMemory: undefined, impact: null, parked: true }],
      ships: [carrier],
      player: 'f6f-1',
    })
    world = withControls(world, 'f6f-1', { pitch: 0, roll: 0, yaw: 0, throttle: 0, gearDown: true, brake: 1 })
    let worstDriftM = 0
    for (let i = 0; i < 60 * 60; i++) {
      world = advance(world, DT).world
      const ship = world.ships[0]!
      const now = deckOf(ship)!
      const p = world.aircraft[0]!.state.position
      const local = deckLocal(now, p.x, p.z)
      worstDriftM = Math.max(worstDriftM, Math.hypot(local.x - 0, local.z - -110))
      expect(world.aircraft[0]!.impact, `impact at tick ${world.tick}`).toBeNull()
    }
    expect(Math.abs(world.ships[0]!.state.headingRad)).toBeGreaterThan(0.5)
    expect(worstDriftM).toBeLessThan(1.0)
    expect(world.aircraft[0]!.state.position.y).toBeCloseTo(deck.center.y + f6f.gear.heightM, 3)
  })
})
```

Run: `npx vitest run tests/sim/world/deck.test.ts tests/sim/ground.test.ts`
Expected: PASS. If the drift exceeds 1 m, the likely cause is `restOnSurface` or `lateralGripAfter` adding the surface velocity on one branch and not another; a chocked airplane's world velocity must equal the deck's after every step.

- [ ] **Step 11: Verify and commit**

`npm run verify; rc=$?; echo rc=$rc` → `rc=0`. The golden exact case, the test cards and the Plan 12 chock test must still pass unchanged.

```bash
git add src/sim/world/deck.ts src/sim/world/ground.ts src/sim/world/ships.ts src/sim/contact.ts src/sim/ground.ts src/sim/flight/model.ts src/sim/loop.ts content/ships/essex-cv.json tests/sim/world/deck.test.ts tests/sim/world/ground.test.ts tests/sim/world/ships.test.ts tests/sim/ground.test.ts
git commit -m "Derive a moving deck from every carrier and rest the wheels at its velocity"
```

---

### Task 3: Parked on the deck: the deck-quals scenario and its selection

**Files:**
- Modify: `src/sim/scenario.ts` (parkedAt union, ships before aircraft), `tools/content/load.ts:58-70`, `src/render/scenarioLoad.ts:22-49`, `src/render/frame.ts:382-402` (settleOnTerrain), `src/render/spawn.ts`, `src/render/content.ts`, `src/render/main.ts:361`, `tests/build/dist.test.ts:94-110, 250-282`
- Create: `content/scenarios/deck-quals.json`
- Test: `tests/sim/scenario.test.ts` (add), `tests/render/frame.test.ts` (add), `tests/render/spawn.test.ts` (add)

**Interfaces:**
- Consumes: `deckOf`, `deckWorld`, `groundUnder`, `decksOf` (Task 2).
- Produces: `Scenario.aircraft[i].parkedAt: { airfield, spot } | { ship, spot: { x, z } }`; `SCENARIO_PARAM = 'scenario'` and `scenarioIdFromQuery(search: string, fallback: string): string` in `src/render/spawn.ts`; `content/scenarios/deck-quals.json`.

- [ ] **Step 1: Failing scenario tests**

Add to `tests/sim/scenario.test.ts` (a new `describe`, using the file's existing `bundle` and `withScenario` helpers):

```ts
describe('deck quals (Plan 8)', () => {
  const quals = loadScenarioBundle('deck-quals')

  it('parks the player on the carrier deck, sailing with the ship, nose along the deck', () => {
    const world = worldFromScenario(quals, null)
    const player = playerAircraft(world)
    const deck = deckOf(world.ships.find((s) => s.id === 'cv-1')!)!
    const local = deckLocal(deck, player.state.position.x, player.state.position.z)
    expect(local.x).toBeCloseTo(0, 6)
    expect(local.z).toBeCloseTo(-110, 6)
    expect(player.state.position.y).toBeCloseTo(deck.center.y + player.spec.gear.heightM, 9)
    expect(player.state.velocity).toEqual(deck.velocity)
    expect(player.parked).toBe(true)
    // Nose toward the bow: parkedAttitude's own rule against the ship's heading.
    expect(player.state.attitude).toEqual(qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - deck.headingRad))
    // The wingman is still ashore at Tacloban.
    const wingman = world.aircraft.find((a) => a.id === 'f6f-2')!
    expect(Math.hypot(wingman.state.position.x - -29666, wingman.state.position.z - -47605)).toBeLessThan(300)
    expect(world.wind).not.toBeNull()
  })

  it('rejects a deck spot off the deck, and a ship that has no flight deck', () => {
    const off = withScenario({ ...quals.scenario, aircraft: [{ ...quals.scenario.aircraft[0]!, parkedAt: { ship: 'cv-1', spot: { x: 0, z: -200 } } }] }, quals)
    expect(() => worldFromScenario(off, null)).toThrow(/off the deck/)
    const escort = withScenario({ ...quals.scenario, aircraft: [{ ...quals.scenario.aircraft[0]!, parkedAt: { ship: 'dd-1', spot: { x: 0, z: 0 } } }] }, quals)
    expect(() => worldFromScenario(escort, null)).toThrow(/dd-1.*flight deck/)
  })
})
```

If `withScenario` in that file takes only a patch against the free-flight bundle, add a second parameter `base = bundle` to it so the deck-quals bundle can be patched the same way. Import `deckOf`, `deckLocal` from `../../src/sim/world/deck.js` and `qFromAxisAngle` from `../../src/sim/math/quat.js`.

Add to `tests/render/frame.test.ts`, in the Plan 12 `describe`:

```ts
  it('settles a deck-parked player onto the deck, not the sea floor, and it sails with the ship (Plan 8)', () => {
    const quals = loadScenarioBundle('deck-quals')
    let f = settleOnTerrain(initialFrameStateFor(worldFromScenario(quals, terrain)), terrain)
    const deck = decksOf(f.world.ships)[0]!
    expect(f.render.position.y).toBeCloseTo(deck.center.y + playerAircraft(f.world).spec.gear.heightM, 6)
    const start = deckLocal(deck, f.render.position.x, f.render.position.z)
    for (let i = 0; i < 60 * 10; i++) f = nextFrameState(f, 1 / 60, new Set())
    const now = decksOf(f.world.ships)[0]!
    const end = deckLocal(now, f.render.position.x, f.render.position.z)
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThan(0.5)
    // and the ship really moved
    expect(Math.hypot(now.center.x - deck.center.x, now.center.z - deck.center.z)).toBeGreaterThan(60)
    expect(playerAircraft(f.world).impact).toBeNull()
  })
```

Add to `tests/render/spawn.test.ts`:

```ts
describe('scenarioIdFromQuery (Plan 8)', () => {
  it('falls back when absent, reads a present id, and throws on an empty one', () => {
    expect(scenarioIdFromQuery('', 'free-flight')).toBe('free-flight')
    expect(scenarioIdFromQuery(`?${SCENARIO_PARAM}=deck-quals`, 'free-flight')).toBe('deck-quals')
    expect(() => scenarioIdFromQuery(`?${SCENARIO_PARAM}=`, 'free-flight')).toThrow(/scenario/)
    expect(() => scenarioIdFromQuery(`?${SCENARIO_PARAM}=../x`, 'free-flight')).toThrow(/scenario/)
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/sim/scenario.test.ts tests/render/frame.test.ts tests/render/spawn.test.ts`
Expected: FAIL — no `deck-quals` content, schema rejects `ship`, `scenarioIdFromQuery` missing.

- [ ] **Step 3: The scenario file**

Create `content/scenarios/deck-quals.json`:

```json
{
  "id": "deck-quals",
  "player": "f6f-1",
  "airfields": ["tacloban", "dulag"],
  "aircraft": [
    { "id": "f6f-1", "spec": "f6f-hellcat", "parkedAt": { "ship": "cv-1", "spot": { "x": 0, "z": -110 } }, "chocked": false },
    { "id": "f6f-2", "spec": "f6f-hellcat", "parkedAt": { "airfield": "tacloban", "spot": { "x": -90, "z": 100 } }, "chocked": true }
  ],
  "ships": [
    { "id": "cv-1", "spec": "essex-cv",    "waypoints": [[-13444, -41903], [-19988, -44130], [-15631, -30784], [-9084, -28558]], "speedMps": 7.717 },
    { "id": "dd-1", "spec": "fletcher-dd", "waypoints": [[-13232, -42115], [-19776, -44342], [-15419, -30996], [-8872, -28770]], "speedMps": 7.717 },
    { "id": "dd-2", "spec": "fletcher-dd", "waypoints": [[-13656, -41691], [-20200, -43918], [-15843, -30572], [-9296, -28346]], "speedMps": 7.717 }
  ],
  "weather": { "windFromDeg": 342, "windMps": 7.717 }
}
```

The waypoint lists are the free-flight loops rotated one step so the ships start on the leg from waypoint 3 to waypoint 0 of free flight, `(-13444, -41903) → (-19988, -44130)`, which bears `atan2(-6544, 2227)` = 251°... — NO. Stop and check: the leg that bears 342° is `(-9084, -28558) → (-13444, -41903)`: Δx = −4360, Δz = −13345, `atan2(-4360, 13345)` = **−18.1°** = 341.9°. So the loop must start at `(-9084, -28558)` steering for `(-13444, -41903)`. Use this rotation instead:

```json
    { "id": "cv-1", "spec": "essex-cv",    "waypoints": [[-9084, -28558], [-13444, -41903], [-19988, -44130], [-15631, -30784]], "speedMps": 7.717 },
    { "id": "dd-1", "spec": "fletcher-dd", "waypoints": [[-8872, -28770], [-13232, -42115], [-19776, -44342], [-15419, -30996]], "speedMps": 7.717 },
    { "id": "dd-2", "spec": "fletcher-dd", "waypoints": [[-9296, -28346], [-13656, -41691], [-20200, -43918], [-15843, -30572]], "speedMps": 7.717 }
```

The scenario test's `assertLoopOverWater` case runs over every scenario's ships; a rotated loop is the same loop, so it passes. The leg is 14.0 km long, 30 minutes at 15 kn: the deck is into the wind for the whole first leg.

- [ ] **Step 4: Schema, loaders, world builder**

`src/sim/scenario.ts`, `parkedAt` becomes:

```ts
    parkedAt: z.union([
      z.object({
        airfield: id,
        /** `'runwayCenter'`, or a runway-local spot (meters, `x` across, `z` along). */
        spot: z.union([z.literal('runwayCenter'), z.object({ x: finite, z: finite }).strict()]),
      }).strict(),
      /** On a carrier's flight deck (Plan 8): deck-local meters, `x` across
       *  to starboard, `z` along toward the bow, from the deck center. */
      z.object({ ship: id, spot: z.object({ x: finite, z: finite }).strict() }).strict(),
    ]),
```

Export a type guard: `export const isShipParked = (p: Scenario['aircraft'][number]['parkedAt']): p is { ship: string; spot: { x: number; z: number } } => 'ship' in p`.

In `worldFromScenario`, move the `ships` construction above the `aircraft` construction, then in the aircraft map:

```ts
    if (isShipParked(a.parkedAt)) {
      const ship = ships.find((sh) => sh.id === a.parkedAt.ship)
      if (ship === undefined) throw new Error(`scenario parks "${a.id}" on ship "${a.parkedAt.ship}", which is not in the scenario`)
      const deck = deckOf(ship)
      if (deck === null) throw new Error(`scenario parks "${a.id}" on "${ship.id}", which has no flight deck`)
      const { x, z } = a.parkedAt.spot
      if (Math.abs(x) > deck.widthM / 2 || Math.abs(z) > deck.lengthM / 2) {
        throw new Error(`scenario parks "${a.id}" off the deck of "${ship.id}": spot (${x}, ${z}) on a ${deck.widthM} x ${deck.lengthM} m deck`)
      }
      const at = deckWorld(deck, x, z)
      const state = createState({
        position: v3(at.x, deck.center.y + spec.gear.heightM, at.z),
        velocity: deck.velocity,
        attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - deck.headingRad),
        gearFraction: 1,
      })
      const controls: Controls = a.chocked ? { ...NEUTRAL, gearDown: true, brake: 1 } : NEUTRAL
      return { id: a.id, spec, state, previous: state, controls, assistMemory: undefined, impact: null, parked: true }
    }
```

with the existing airfield branch unchanged below it. Import `deckOf`, `deckWorld` from `./world/deck.js` and `qFromAxisAngle` from `./math/quat.js`. `deck.center.y` is `SEA_LEVEL_M + heightM`, a real height, so no placeholder is needed for a deck spawn.

`tools/content/load.ts:66` and `src/render/scenarioLoad.ts:46`: replace `scenario.aircraft.map((a) => a.parkedAt.airfield)` with `scenario.aircraft.flatMap((a) => (isShipParked(a.parkedAt) ? [] : [a.parkedAt.airfield]))` in both, importing `isShipParked` from the scenario module.

- [ ] **Step 5: Settle on the deck**

`src/render/frame.ts`, `settleOnTerrain`:

```ts
export function settleOnTerrain(frame: FrameState, terrain: TerrainField): FrameState {
  let world = frame.world
  let playerDeltaY = 0
  const decks = decksOf(world.ships)
  for (const a of frame.world.aircraft) {
    if (!a.parked) continue
    // `groundUnder` with a real field never returns null (Plan 8): a deck
    // wins where there is one, and a deck-parked airplane settles onto
    // steel rather than onto the sea floor `heightAt` would have named.
    const ground = groundUnder(terrain, decks, a.state.position.x, a.state.position.z)!
    const contactHeightM = ground.heightM + a.spec.gear.heightM
    if (a.id === world.player) playerDeltaY = contactHeightM - a.state.position.y
    const settled = { ...a.state, position: v3(a.state.position.x, contactHeightM, a.state.position.z) }
    world = withAircraftState(world, a.id, settled)
  }
  ...
```

Import `decksOf` from `../sim/world/deck.js` and `groundUnder` from `../sim/world/ground.js`.

- [ ] **Step 6: Scenario selection in DEV**

`src/render/spawn.ts`, add:

```ts
/** `?scenario=<id>`: which `content/scenarios/<id>.json` to boot (Plan 8).
 *  DEV only at the call site, like `SPAWN_PARAMS`; the mission picker that
 *  replaces it is Plan 9's. */
export const SCENARIO_PARAM = 'scenario'

export function scenarioIdFromQuery(search: string, fallback: string): string {
  const raw = new URLSearchParams(search).get(SCENARIO_PARAM)
  if (raw === null) return fallback
  // A present-but-bad value throws rather than falling back, for the reason
  // `spawnPositionFromQuery` gives: a silent fallback passes for the wrong
  // reason. Ids are file stems, so only the characters a stem may carry.
  if (!/^[a-z0-9-]+$/.test(raw)) throw new Error(`scenario: ${JSON.stringify(raw)} is not a scenario id`)
  return raw
}
```

`src/render/main.ts:361`: `bundle = await loadScenarioBundle(import.meta.env.DEV ? scenarioIdFromQuery(window.location.search, SCENARIO_ID) : SCENARIO_ID)`, importing `scenarioIdFromQuery` from `./spawn.js`.

`tests/build/dist.test.ts`: add `'content/scenarios/deck-quals.json'` to the content list (line 94-110) and `expect(bundle).not.toContain(JSON.stringify(SCENARIO_PARAM))` beside the `BEAUFORT_PARAM` line, importing `SCENARIO_PARAM` from `../../src/render/spawn.js`.

- [ ] **Step 7: Run, verify, commit**

Run: `npx vitest run tests/sim/scenario.test.ts tests/render/frame.test.ts tests/render/spawn.test.ts tests/build/dist.test.ts` → PASS.
`npm run verify; rc=$?; echo rc=$rc` → `rc=0`.

Then look at it: `curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim.windomlane.org/?scenario=deck-quals` → `200`, and the Tier 2 in Task 8 proves the rest.

```bash
git add src/sim/scenario.ts tools/content/load.ts src/render/scenarioLoad.ts src/render/frame.ts src/render/spawn.ts src/render/main.ts content/scenarios/deck-quals.json tests/sim/scenario.test.ts tests/render/frame.test.ts tests/render/spawn.test.ts tests/build/dist.test.ts
git commit -m "Park the player on the carrier: the deck-quals scenario, chosen by ?scenario= in a dev build"
```

---

### Task 4: The hook and the trap

**Files:**
- Modify: `src/input/bindings.ts`, `src/render/legend.ts:24-46`, `src/sim/flight/state.ts`, `src/sim/flight/model.ts`, `src/render/frame.ts` (hook lever; decks to the tracker), `src/render/landing.ts`, `src/render/debrief.ts:43-64`, `src/render/main.ts` (pendingHook)
- Test: `tests/render/legend.test.ts` (add), `tests/sim/trap.test.ts` (create), `tests/render/landing.test.ts` (modify), `tests/render/debrief.test.ts` (modify), `tests/sim/landing.test.ts:178` (modify), `tests/render/frame.test.ts` (add)

**Interfaces:**
- Produces: `BINDINGS.toggleHook: ['KeyH']`; `Controls.hookDown?: boolean`; `AircraftState.arrested: boolean`; `TRAP_DECEL_MPS2 = 17` exported from `model.ts`; `LandingReport.at: { kind: 'airfield' | 'carrier'; name: string } | null` replacing `airfield`; `nextLandingTracking(spec, prev, before, after, terrain, airfields, decks = [])`; `FrameState.hookDown`, `FrameState.hookPressed`.

- [ ] **Step 1: Failing binding and legend tests**

Add to `tests/render/legend.test.ts`:

```ts
it('binds H only to the hook (Plan 8)', () => {
  expect(BINDINGS.toggleHook).toEqual(['KeyH'])
  for (const [name, codes] of Object.entries(BINDINGS).filter(([name]) => name !== 'toggleHook')) {
    expect(codes, `${name} claims KeyH`).not.toContain('KeyH')
  }
  expect(legendLines().find((line) => line.startsWith('Hook'))).toContain('H')
})
```

Run: `npx vitest run tests/render/legend.test.ts` → FAIL (`toggleHook` undefined; the exhaustiveness case also fails once the binding exists until the row is added).

- [ ] **Step 2: Binding and legend row**

`src/input/bindings.ts`, after `toggleFlaps`:

```ts
  // Plan 8. `H` for hook; free as of 2026-09-18 (the corrected list above).
  toggleHook: ['KeyH'],
```

`src/render/legend.ts`, after the Flaps row: `{ label: 'Hook', bindings: ['toggleHook'] },`.

Run the legend test → PASS.

- [ ] **Step 3: Failing trap tests**

Create `tests/sim/trap.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadAircraftSpec, loadShipSpec } from '../../tools/content/load.js'
import { createState, step, DT, TRAP_DECEL_MPS2, type AircraftState, type Controls } from '../../src/sim/flight/model.js'
import { deckOf, deckWorld, deckLocal, type Deck } from '../../src/sim/world/deck.js'
import { createShipState } from '../../src/sim/world/ships.js'
import { SEA_LEVEL_M } from '../../src/sim/world/terrain.js'
import { v3, sub, length } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import type { ShipEntity } from '../../src/sim/loop.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const cv = loadShipSpec('essex-cv')

const carrier = (): ShipEntity => {
  const state = createShipState({ position: v3(0, SEA_LEVEL_M, 0), headingRad: 0, speedMps: 7.717 })
  return { id: 'cv-1', spec: cv, state, previous: state, orders: { waypoints: [{ x: 0, z: 0 }, { x: 0, z: -9000 }], speedMps: 7.717 } }
}

/** Wheels just touching the deck at `fromSternM` forward of the stern, rolling toward the bow at `relMps` over the deck. */
const arriving = (deck: Deck, fromSternM: number, relMps: number, sinkMps = 1.0): AircraftState => {
  const at = deckWorld(deck, 0, -deck.lengthM / 2 + fromSternM)
  return createState({
    position: v3(at.x, deck.center.y + f6f.gear.heightM + 0.05, at.z),
    velocity: v3(deck.velocity.x, -sinkMps, deck.velocity.z - relMps),
    attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2),
    gearFraction: 1,
    flapFraction: 1,
  })
}

const HOOK: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0, gearDown: true, flapDown: true, hookDown: true }
const NO_HOOK: Controls = { ...HOOK, hookDown: false }

function run(state: AircraftState, controls: Controls, seconds: number): { state: AircraftState; ticks: number } {
  const deck = deckOf(carrier())!
  let s = state
  let tick = 0
  for (; tick < 60 * seconds; tick++) {
    s = step(f6f, s, controls, { dt: DT, tick: tick + 1, decks: [deck] })
    if (s.arrested && length(sub(s.velocity, deck.velocity)) < 0.05) break
  }
  return { state: s, ticks: tick }
}

describe('the arcade trap (Plan 8)', () => {
  it('hook down inside the zone arrests: deck-relative speed decays at TRAP_DECEL_MPS2 to rest on the deck', () => {
    const deck = deckOf(carrier())!
    const { state, ticks } = run(arriving(deck, 60, 34), HOOK, 10)
    expect(state.arrested).toBe(true)
    expect(length(sub(state.velocity, deck.velocity))).toBeLessThan(0.05)
    expect(ticks / 60).toBeCloseTo(34 / TRAP_DECEL_MPS2, 0)
    const local = deckLocal(deck, state.position.x, state.position.z)
    expect(local.z + deck.lengthM / 2).toBeLessThan(deck.trapToSternM + 40)
    expect(Math.abs(local.x)).toBeLessThan(2)
  })

  it('hook up rolls: no arrest, and full throttle takes it off the bow', () => {
    const deck = deckOf(carrier())!
    const { state } = run(arriving(deck, 60, 34), { ...NO_HOOK, throttle: 1 }, 6)
    expect(state.arrested).toBe(false)
    const local = deckLocal(deck, state.position.x, state.position.z)
    expect(local.z).toBeGreaterThan(deck.lengthM / 2)
  })

  it('hook down but short of the zone rolls into it and traps there; past the zone never traps', () => {
    const deck = deckOf(carrier())!
    const short = run(arriving(deck, 10, 34), HOOK, 10)
    expect(short.state.arrested).toBe(true)
    const past = run(arriving(deck, deck.trapToSternM + 5, 34), HOOK, 4)
    expect(past.state.arrested).toBe(false)
  })

  it('an arrival outside the sink gate is not a trap', () => {
    const deck = deckOf(carrier())!
    const s = step(f6f, arriving(deck, 60, 34, 6.0), HOOK, { dt: DT, tick: 1, decks: [deck] })
    expect(s.arrested).toBe(false)
  })

  it('leaving the deck clears the arrest flag', () => {
    const deck = deckOf(carrier())!
    const trapped = run(arriving(deck, 60, 34), HOOK, 10).state
    // Teleport the trapped airplane's position off the side: the rule is about where the wheels are.
    const side = deckWorld(deck, deck.widthM, 0)
    const off = step(f6f, { ...trapped, position: v3(side.x, trapped.position.y + 5, side.z) }, HOOK, { dt: DT, tick: 9999, decks: [deck] })
    expect(off.arrested).toBe(false)
  })
})
```

Run: `npx vitest run tests/sim/trap.test.ts` → FAIL (`arrested`, `hookDown`, `TRAP_DECEL_MPS2` missing).

- [ ] **Step 4: State, controls, the arrest rule in step**

`src/sim/flight/state.ts`: add to `Controls`:

```ts
  /** The tailhook lever. Optional like `gearDown`; `undefined` reads as up.
   *  No travel is modelled (Plan 8 design section 5). */
  readonly hookDown?: boolean
```

and to `AircraftState` (after `flapFraction`), with `arrested: init.arrested ?? false` in `createState`:

```ts
  /** The pendant is on the hook (Plan 8): set by `step` when the arcade trap
   *  rule holds, cleared when the wheels leave the deck. While set, the
   *  deck-relative velocity decays at `TRAP_DECEL_MPS2`. */
  readonly arrested: boolean
```

`src/sim/flight/model.ts`, export `export const TRAP_DECEL_MPS2 = 17` with the comment "Constant deceleration of an arrested airplane relative to the deck: 2.0 s and 34 m of run-out from a 34 m/s arrival, about 1.7 g, in the range of a real pendant run-out (design section 5, amended during planning to a constant so the rule needs no memory of the arrival speed)."

Inside `step`, after the post-integration ground constraint block (Task 2 step 9 (iii)) and before the body-rates section, add:

```ts
  // The arcade trap (Plan 8). Engages on the first step the wheels are
  // supported on a deck inside its trap zone with the hook down; holds while
  // the wheels stay on that deck; drops the instant they are not. While
  // engaged the deck-relative horizontal velocity decays at a constant rate,
  // whatever the throttle is doing -- a pendant does not care.
  let arrested = false
  if (ground !== null && ground.deck !== null) {
    const integrated: AircraftState = { ...state, position, velocity }
    const onDeckWheels = supportedContact(spec, integrated, ground.heightM, ground.surface, ground.velocity)
    const engages = controls.hookDown === true && onDeckWheels && insideTrapZone(ground.deck, position.x, position.z)
    arrested = onDeckWheels && (state.arrested || engages)
    if (arrested) {
      const rel = sub(velocity, ground.velocity)
      const relFlat = v3(rel.x, 0, rel.z)
      const relSpeed = length(relFlat)
      const drop = Math.min(relSpeed, TRAP_DECEL_MPS2 * dt)
      const kept = relSpeed > 1e-9 ? scale(relFlat, (relSpeed - drop) / relSpeed) : ZERO
      velocity = v3(ground.velocity.x + kept.x, velocity.y, ground.velocity.z + kept.z)
    }
  }
```

Import `insideTrapZone` from `../world/deck.js`. `ground` is the post-integration lookup from Task 2. Add `arrested` to the returned state literal at the end of `step`. Note `state.arrested` on the calm path: an airplane that never touches a deck has `ground.deck === null`, so `arrested` stays `false` and the returned literal gains one boolean; the golden JSON records positions and speeds only, so the exact-equality case is unaffected. `invariants.ts`'s `FIELDS` is numeric fields only; leave it.

Run: `npx vitest run tests/sim/trap.test.ts` → PASS. If "past the zone" traps, check that `engages` uses the post-integration `position`, not the start-of-step one.

- [ ] **Step 5: The hook lever in the frame**

`src/render/frame.ts`: add `readonly hookDown: boolean` and `readonly hookPressed: boolean` to `FrameState` after `flapPressed`, with the comment "The tailhook lever, edge-triggered exactly like the flap lever (Plan 8)." In `initialFrameStateFor`: `hookDown: false, hookPressed: false,`. In `nextFrameState` after the flap block:

```ts
  // The tailhook lever, edge-triggered identically (Plan 8).
  const hookKeyDown = BINDINGS.toggleHook.some((c) => pressed.has(c))
  const hookDown =
    hookKeyDown && !prev.hookPressed ? !prev.hookDown : prev.hookDown
```

and `const controls: Controls = { ...controlsAxes, gearDown, flapDown, hookDown, brake }`, and in the returned literal `hookDown, hookPressed: hookKeyDown,`. `acknowledgeLanding` and `withPaused` spread the frame, so nothing else changes.

`src/render/main.ts`: `let pendingHook = false` beside `pendingFlaps`; add `pendingHook = false` to `clearMapInput` and the blur handler (and add the missing `pendingTripleTime = false` to the blur handler while there, with a one-line comment that it was omitted before); keydown: `if (BINDINGS.toggleHook.includes(e.code as never) && !e.repeat) pendingHook = true`; the latch list: `if (pendingHook) latched.push(BINDINGS.toggleHook[0])`; `inputFrame`: `hookPressed: pendingHook ? false : frame!.hookPressed,`; and `pendingHook = false` in the post-frame reset.

Add to `tests/render/frame.test.ts` beside the gear readback case (line 230):

```ts
  it('H toggles the hook and the command reaches the player entity (Plan 8)', () => {
    let f = start()
    expect(f.hookDown).toBe(false)
    f = nextFrameState(f, 1 / 60, new Set(BINDINGS.toggleHook))
    expect(f.hookDown).toBe(true)
    expect(playerAircraft(f.world).controls.hookDown).toBe(true)
    f = nextFrameState(f, 1 / 60, new Set(BINDINGS.toggleHook))
    expect(f.hookDown).toBe(true) // held, not re-toggled
    f = nextFrameState(f, 1 / 60, new Set())
    f = nextFrameState(f, 1 / 60, new Set(BINDINGS.toggleHook))
    expect(f.hookDown).toBe(false)
  })
```

(`start()` is whatever helper the neighbouring gear test uses to build its initial frame.)

- [ ] **Step 6: The landing report names the carrier**

`src/render/landing.ts`: replace `airfield: string | null` on `LandingReport` with:

```ts
  /** Where the flight ended: the airfield whose runway the touchdown lies
   *  inside, the carrier whose deck it was arrested on, or `null` off-field.
   *  Master spec section 8's recovery multiplier reads this in Plan 9. */
  readonly at: { readonly kind: 'airfield' | 'carrier'; readonly name: string } | null
```

Add to `Touchdown`: `readonly deck: Deck | null` (the deck under the wheels at touchdown, or null). Change the two helpers and the function:

```ts
const groundFor = (terrain: TerrainField | null, decks: readonly Deck[], s: AircraftState) =>
  groundUnder(terrain, decks, s.position.x, s.position.z)

const wheelHeightM = (spec: AircraftSpec, s: AircraftState, g: GroundUnder): number =>
  s.position.y - spec.gear.heightM - g.heightM

const supported = (spec: AircraftSpec, s: AircraftState, g: GroundUnder | null): boolean =>
  g !== null && supportedContact(spec, s, g.heightM, g.surface, g.velocity)

export function nextLandingTracking(
  spec: AircraftSpec,
  prev: LandingTracking,
  before: AircraftState,
  after: AircraftState,
  terrain: TerrainField | null,
  airfields: readonly Airfield[],
  decks: readonly Deck[] = [],
): LandingTracking {
  if (prev.report !== null) return prev
  const gAfter = groundFor(terrain, decks, after)
  if (gAfter === null) return prev

  const height = wheelHeightM(spec, after, gAfter)
  const airborne = prev.airborne || height > AIRBORNE_LATCH_M
  const onWheelsNow = supported(spec, after, gAfter)

  let touchdown = prev.touchdown
  if (height > AIRBORNE_LATCH_M) {
    touchdown = null
  } else if (airborne && touchdown === null && onWheelsNow && !supported(spec, before, groundFor(terrain, decks, before))) {
    touchdown = {
      sinkMps: -(before.velocity.y - gAfter.velocity.y),
      speedMps: airspeed({ ...before, velocity: sub(before.velocity, gAfter.velocity) }),
      x: after.position.x,
      z: after.position.z,
      tick: after.tick,
      deck: gAfter.deck,
    }
  }

  // At rest RELATIVE to what it landed on: a trapped airplane sails at 15 kn.
  const restSpeed = length(sub(after.velocity, gAfter.velocity))
  const report =
    touchdown !== null && onWheelsNow && restSpeed < LANDED_SPEED_MPS
      ? {
          touchdownSinkMps: touchdown.sinkMps,
          touchdownSpeedMps: touchdown.speedMps,
          rollOutM: rollOutM(touchdown, after, gAfter),
          tick: after.tick,
          at: landedAt(touchdown, airfields, gAfter),
        }
      : null
  ...
}

/** Roll-out in the frame of the surface: on a deck, the deck-local distance,
 *  so the ship's own travel is not counted. */
function rollOutM(touchdown: Touchdown, after: AircraftState, g: GroundUnder): number {
  if (touchdown.deck !== null && g.deck !== null && g.deck.shipId === touchdown.deck.shipId) {
    const a = deckLocal(touchdown.deck, touchdown.x, touchdown.z)
    const b = deckLocal(g.deck, after.position.x, after.position.z)
    return Math.hypot(b.x - a.x, b.z - a.z)
  }
  return Math.hypot(after.position.x - touchdown.x, after.position.z - touchdown.z)
}

function landedAt(touchdown: Touchdown, airfields: readonly Airfield[], g: GroundUnder): LandingReport['at'] {
  if (g.deck !== null && touchdown.deck !== null) return { kind: 'carrier', name: g.deck.shipId }
  const field = airfieldAt(airfields, touchdown.x, touchdown.z)
  return field === null ? null : { kind: 'airfield', name: field.name }
}
```

The deck-local roll-out uses the touchdown deck's pose at touchdown for `a` and the current deck's pose for `b`: both are the same ship, so the two local frames coincide up to the ship's motion between, which is exactly what a deck-relative distance should ignore. The carrier is named by its ship id (`cv-1`) here; the debrief looks its display name up from the world's ships in the next step. Imports: `groundUnder, type GroundUnder` from `../sim/world/ground.js`, `deckLocal, type Deck` from `../sim/world/deck.js`, `sub, length` from `../sim/math/vec3.js`.

`src/render/frame.ts`: call `nextLandingTracking(spec, prev.landing, player.state, advancedPlayer.state, advanced.world.terrain, advanced.world.airfields, decksOf(advanced.world.ships))`. The old `terrain === null` early return is now "no ground under the airplane" which, with a deck-parked spawn and no terrain, is false on the deck: a deck-parked flight can report a landing before terrain arrives, which is correct.

`src/render/debrief.ts:53`: `{ label: 'Landed at', value: report.at === null ? 'off-field' : report.at.kind === 'carrier' ? `${report.at.name} (carrier)` : report.at.name },`. `landingModel` takes a second optional parameter `shipNames: Readonly<Record<string, string>> = {}` and renders `shipNames[report.at.name] ?? report.at.name` for a carrier; `main.ts` passes `Object.fromEntries(current.world.ships.map((s) => [s.id, s.spec.name]))`.

Repoint the existing tests: `tests/sim/landing.test.ts:178` → `expect(tracking.report!.at).toEqual({ kind: 'airfield', name: 'Tacloban' })`; `tests/render/landing.test.ts:147,152` → `.at` `toEqual({ kind: 'airfield', name: 'Tacloban' })` / `toBeNull()`; the `landingModel` literals in `tests/render/landing.test.ts:158` and `tests/render/debrief.test.ts:64,69` replace `airfield: 'Tacloban'` with `at: { kind: 'airfield', name: 'Tacloban' }` and `airfield: null` with `at: null`. Add to `tests/render/debrief.test.ts`:

```ts
  it('names the carrier a trap was aboard, by the ship class name when it is known', () => {
    const m = landingModel({ touchdownSinkMps: 2.1, touchdownSpeedMps: 36, rollOutM: 34, tick: 1, at: { kind: 'carrier', name: 'cv-1' } }, { 'cv-1': 'Essex-class fleet carrier' })
    expect(m.figures.find((f) => f.label === 'Landed at')!.value).toBe('Essex-class fleet carrier (carrier)')
  })
```

- [ ] **Step 7: Run, verify, commit**

Run: `npx vitest run tests/sim/trap.test.ts tests/render tests/sim/landing.test.ts` → PASS.
`npm run verify; rc=$?; echo rc=$rc` → `rc=0`.

```bash
git add src/input/bindings.ts src/render/legend.ts src/sim/flight/state.ts src/sim/flight/model.ts src/render/frame.ts src/render/landing.ts src/render/debrief.ts src/render/main.ts tests/render/legend.test.ts tests/sim/trap.test.ts tests/render/landing.test.ts tests/render/debrief.test.ts tests/sim/landing.test.ts tests/render/frame.test.ts
git commit -m "Bind the hook to H and arrest a hook-down arrival inside the trap zone"
```

---

### Task 5: The approach autopilot traps aboard

**Files:**
- Modify: `tools/autopilot/approach.ts:12-20, 116-181`
- Test: `tests/sim/carrierLanding.test.ts` (create), `tests/sim/landing.test.ts` (add the bit-identity pin)

**Interfaces:**
- Consumes: `deckOf`, `deckWorld`, `deckLocal`, `insideTrapZone`, `decksOf`, `nextLandingTracking` with decks, `Controls.hookDown`.
- Produces: `ApproachTarget` gains `readonly surfaceVelocity?: Vec3` and `readonly hookDown?: boolean`; `approachControls` steers in the frame of `runwayHeadingRad`.

- [ ] **Step 1: Pin the ashore landing before touching the autopilot**

Add to `tests/sim/landing.test.ts`, at the end of the existing test:

```ts
    // Plan 8 generalizes the autopilot to a heading frame and a moving target.
    // Tacloban's heading is 0, and rotating by zero must be exact, so these
    // figures are pinned EXACTLY, not within tolerance: any change means the
    // northbound path is no longer the code that measured them. vitest fills
    // the snapshot in on the first run and compares with `Object.is` after.
    expect({ touchdownSinkMps, touchdownSpeedMps, restX: rest.position.x, restZ: rest.position.z }).toMatchInlineSnapshot()
```

Run: `npx vitest run tests/sim/landing.test.ts` once; vitest writes the four values into the file. Run it again: PASS. Commit that filled-in snapshot with this task; it is the gate the rest of the task is measured against.

- [ ] **Step 2: Failing carrier landing test**

Create `tests/sim/carrierLanding.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadAircraftSpec, loadScenarioBundle } from '../../tools/content/load.js'
import { loadTerrainHeader, loadTerrainLevel, FIRST_COMMITTED_LEVEL } from '../../tools/terrain/load.js'
import { createTerrainField } from '../../src/sim/world/terrain.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { advance, playerAircraft, withAircraftState, withControls, type World } from '../../src/sim/loop.js'
import { createState, DT } from '../../src/sim/flight/model.js'
import { MAX_SUPPORTED_SINK_MPS } from '../../src/sim/ground.js'
import { deckOf, deckWorld, deckLocal, decksOf } from '../../src/sim/world/deck.js'
import { approachControls, VREF_STALL_MULTIPLE } from '../../tools/autopilot/approach.js'
import { nextLandingTracking, NO_LANDING } from '../../src/render/landing.js'
import { v3, sub, length } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'

const f6f = loadAircraftSpec('f6f-hellcat')

describe('an approach flown to the moving deck (Plan 8)', () => {
  it('traps: hook down, inside the zone, within the ashore gates, and comes to rest relative to the deck', () => {
    const header = loadTerrainHeader()
    const terrain = createTerrainField(header, FIRST_COMMITTED_LEVEL, loadTerrainLevel(FIRST_COMMITTED_LEVEL, header))
    const bundle = loadScenarioBundle('deck-quals')
    let world: World<undefined> = worldFromScenario(bundle, terrain)
    const cv = world.ships.find((s) => s.id === 'cv-1')!
    const deck0 = deckOf(cv)!

    // Start 4 km astern on the deck's heading, on a 3.5 degree slope to the zone center, at vref plus the ship's speed.
    const APPROACH_M = 4000
    const zoneCenter = -deck0.lengthM / 2 + (deck0.trapFromSternM + deck0.trapToSternM) / 2
    const startLocal = deckWorld(deck0, 0, zoneCenter - APPROACH_M)
    const vref = VREF_STALL_MULTIPLE * f6f.reference.stallSpeedFlapMps
    const along = v3(Math.sin(deck0.headingRad), 0, -Math.cos(deck0.headingRad))
    world = withAircraftState(world, world.player, createState({
      position: v3(startLocal.x, deck0.center.y + f6f.gear.heightM + APPROACH_M * Math.tan((3.5 * Math.PI) / 180), startLocal.z),
      velocity: v3(along.x * (vref + 7.717), 0, along.z * (vref + 7.717)),
      attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - deck0.headingRad),
      gearFraction: 1,
      flapFraction: 1,
    }))
    world = { ...world, aircraft: world.aircraft.map((a) => (a.id === world.player ? { ...a, parked: false } : a)) }

    let tracking = NO_LANDING
    let touchdownSink: number | null = null
    let touchdownRel: number | null = null
    let stopped = false
    for (let i = 0; i < 60 * 300 && !stopped; i++) {
      const before = playerAircraft(world).state
      const deck = deckOf(world.ships.find((s) => s.id === 'cv-1')!)!
      const aim = deckWorld(deck, 0, zoneCenter)
      const controls = approachControls(f6f, before, {
        aimX: aim.x, aimZ: aim.z, runwayHeadingRad: deck.headingRad,
        touchdownElevationM: deck.center.y, surfaceVelocity: deck.velocity, hookDown: true,
      })
      world = advance(withControls(world, world.player, controls), DT).world
      const now = playerAircraft(world).state
      const deckNow = deckOf(world.ships.find((s) => s.id === 'cv-1')!)!
      tracking = nextLandingTracking(f6f, tracking, before, now, terrain, world.airfields, decksOf(world.ships))
      if (tracking.touchdown !== null && touchdownSink === null) {
        touchdownSink = tracking.touchdown.sinkMps
        touchdownRel = tracking.touchdown.speedMps
      }
      expect(playerAircraft(world).impact, `crashed at tick ${now.tick}`).toBeNull()
      stopped = now.arrested && length(sub(now.velocity, deckNow.velocity)) < 1
    }
    const rest = playerAircraft(world).state
    const deckEnd = deckOf(world.ships.find((s) => s.id === 'cv-1')!)!
    const local = deckLocal(deckEnd, rest.position.x, rest.position.z)
    console.log(`carrier landing: touchdown sink ${touchdownSink?.toFixed(2)} m/s at ${touchdownRel?.toFixed(1)} m/s over the deck; at rest ${(local.z + deckEnd.lengthM / 2).toFixed(0)} m from the stern, ${local.x.toFixed(1)} m off the centerline`)
    expect(touchdownSink, 'never touched down').not.toBeNull()
    expect(touchdownSink!).toBeLessThan(MAX_SUPPORTED_SINK_MPS)
    expect(stopped, 'never trapped').toBe(true)
    expect(Math.abs(local.x)).toBeLessThan(deckEnd.widthM / 4)
    expect(local.z + deckEnd.lengthM / 2).toBeLessThan(deckEnd.trapToSternM + 40)
    expect(tracking.report).not.toBeNull()
    expect(tracking.report!.at).toEqual({ kind: 'carrier', name: 'cv-1' })
    expect(tracking.report!.rollOutM).toBeLessThan(60)
  })
})
```

Run: `npx vitest run tests/sim/carrierLanding.test.ts` → FAIL (the autopilot steers on raw world z/x and knows no surface velocity, so the airplane misses the deck).

- [ ] **Step 3: Generalize the autopilot**

`tools/autopilot/approach.ts`: extend `ApproachTarget`:

```ts
export type ApproachTarget = {
  readonly aimX: number
  readonly aimZ: number
  /** Radians, compass, 0 = northbound (-z). The approach is flown in this
   *  frame: "along" is distance short of the aim point against the heading,
   *  "across" is starboard of the centerline. Rotating by 0 is exact, so
   *  the Tacloban landing is bit-identical to before Plan 8 (pinned). */
  readonly runwayHeadingRad: number
  readonly touchdownElevationM: number
  /** The surface's velocity (a deck's); speeds and sink are flown relative to it. Default still. */
  readonly surfaceVelocity?: Vec3
  /** Whether to fly with the hook down. Default up. */
  readonly hookDown?: boolean
}
```

and in `approachControls` replace the `alongM`/`acrossM`/`speedMps`/`sinkMps` lines with:

```ts
  const h = target.runwayHeadingRad
  const bx = Math.sin(h), bz = -Math.cos(h)      // toward the far end of the runway
  const sx = Math.cos(h), sz = Math.sin(h)       // starboard
  const dx = state.position.x - target.aimX, dz = state.position.z - target.aimZ
  const alongM = finite(-(dx * bx + dz * bz))    // positive short of the aim point
  const acrossM = finite(dx * sx + dz * sz)
  const surface = target.surfaceVelocity ?? ZERO
  const rel = sub(state.velocity, surface)
  const speedMps = finite(length(rel))
  const configured = { gearDown: true, flapDown: true, hookDown: target.hookDown === true }
  const yaw = clamp(-acrossM * YAW_PER_OFFSET_M, -1, 1)
```

with `const sinkMps = finite(-rel.y)` where `sinkMps` was computed, and the rolling branch's speed test on `speedMps` (already relative). Import `sub, length, ZERO, type Vec3` from `../../src/sim/math/vec3.js`. For `h = 0`: `bx = 0`, `bz = -1`, `sx = 1`, `sz = 0`, so `alongM = -(dx*0 + dz*-1) = dz` and `acrossM = dx`: the products by 0 and 1 and the subtraction of an exact zero are exact, which is why Step 1's pin holds. Verify the pin: `npx vitest run tests/sim/landing.test.ts` → PASS with the exact figures.

The yaw sign: for a northbound runway `acrossM = dx` as before, so the sign convention is unchanged; at other headings the same lateral law applies in the rotated frame.

- [ ] **Step 4: Run the carrier landing**

Run: `npx vitest run tests/sim/carrierLanding.test.ts`
Expected: PASS, with a printed line like `carrier landing: touchdown sink 1.x m/s at 3x m/s over the deck; at rest ~9x m from the stern`. If the airplane lands long, the aim point is the zone center; the autopilot's 3° `GLIDE_PATH_RAD` against the paddles' 3.5° is fine for the autopilot (it has its own law). If it lands short of the zone, the trap still engages when it rolls into the zone (Task 4's "short of the zone" case). If it misses the deck laterally, the `acrossM` sign is wrong for non-zero headings: test the sign with a heading of π/2 by hand. Record the printed figures in the ledger.

- [ ] **Step 5: Verify and commit**

`npm run verify; rc=$?; echo rc=$rc` → `rc=0`.

```bash
git add tools/autopilot/approach.ts tests/sim/carrierLanding.test.ts tests/sim/landing.test.ts
git commit -m "Fly the approach autopilot at the moving deck until it traps, with the ashore landing pinned bit-for-bit"
```

---

### Task 6: Paddles

**Files:**
- Create: `src/sim/paddles.ts`, `src/render/paddlesBadge.ts`
- Modify: `src/render/main.ts` (create the badge, update per frame), `src/render/diagnostics.ts`
- Test: `tests/sim/paddles.test.ts` (create), `tests/render/paddlesBadge.test.ts` (create)

**Interfaces:**
- Consumes: `PaddlesParams` (Task 2), `Deck`, `deckLocal`, `effectiveStallSpeedMps`, `airspeed`, `Controls.hookDown`.
- Produces:

```ts
// src/sim/paddles.ts
export type PaddlesCue = 'high' | 'low' | 'fast' | 'slow' | 'roger' | 'cut' | 'wave-off'
export const APPROACH_SPEED_STALL_MULTIPLE = 1.15
export function paddlesCue(spec: AircraftSpec, state: AircraftState, controls: Controls, deck: Deck, params: PaddlesParams, wind: Vec3 | null): PaddlesCue | null
// src/render/paddlesBadge.ts
export function paddlesLabel(cue: PaddlesCue | null): string | null
export function createPaddlesBadge(root: HTMLElement): { setCue(cue: PaddlesCue | null): void }
```

- [ ] **Step 1: Failing paddles tests**

Create `tests/sim/paddles.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadAircraftSpec, loadShipSpec } from '../../tools/content/load.js'
import { paddlesCue, APPROACH_SPEED_STALL_MULTIPLE } from '../../src/sim/paddles.js'
import { deckOf, deckWorld, type Deck } from '../../src/sim/world/deck.js'
import { createShipState } from '../../src/sim/world/ships.js'
import { createState, type Controls } from '../../src/sim/flight/model.js'
import { SEA_LEVEL_M } from '../../src/sim/world/terrain.js'
import { effectiveStallSpeedMps } from '../../src/sim/ground.js'
import { v3 } from '../../src/sim/math/vec3.js'
import type { ShipEntity } from '../../src/sim/loop.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const cv = loadShipSpec('essex-cv')
const params = cv.paddles!
const HEADING = 0.3

const deck: Deck = (() => {
  const state = createShipState({ position: v3(0, SEA_LEVEL_M, 0), headingRad: HEADING, speedMps: 7.717 })
  const ship: ShipEntity = { id: 'cv-1', spec: cv, state, previous: state, orders: { waypoints: [{ x: 0, z: 0 }, { x: 0, z: -1 }], speedMps: 7.717 } }
  return deckOf(ship)!
})()
const zoneCenterZ = -deck.lengthM / 2 + (deck.trapFromSternM + deck.trapToSternM) / 2
const CONFIGURED: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.3, gearDown: true, flapDown: true, hookDown: true }
const approachMps = APPROACH_SPEED_STALL_MULTIPLE * effectiveStallSpeedMps(f6f, 1)

/** An airplane `rangeM` astern of the zone center, `offsetDeg` off the glideslope, `lateralDeg` off the wake,
 *  flying at `speedMps` of AIRSPEED toward the deck (calm air, so that is its ground velocity too; the
 *  ship's own speed is not added: the LSO reads the wing, not the deck). */
function onFinal(rangeM: number, offsetDeg = 0, lateralDeg = 0, speedMps = approachMps) {
  const lat = (lateralDeg * Math.PI) / 180
  const local = { x: Math.sin(lat) * rangeM, z: zoneCenterZ - Math.cos(lat) * rangeM }
  const at = deckWorld(deck, local.x, local.z)
  const heightM = deck.center.y + rangeM * Math.tan(((params.glideslopeDeg + offsetDeg) * Math.PI) / 180)
  const toward = v3(Math.sin(deck.headingRad), 0, -Math.cos(deck.headingRad))
  return createState({
    position: v3(at.x, heightM + f6f.gear.heightM, at.z),
    velocity: v3(toward.x * speedMps, -speedMps * Math.sin((params.glideslopeDeg * Math.PI) / 180), toward.z * speedMps),
    gearFraction: 1, flapFraction: 1,
  })
}

describe('paddlesCue', () => {
  it('is silent with gear or hook up, outside the cone, or beyond max range', () => {
    expect(paddlesCue(f6f, onFinal(1000), { ...CONFIGURED, hookDown: false }, deck, params, null)).toBeNull()
    expect(paddlesCue(f6f, { ...onFinal(1000), gearFraction: 0 }, CONFIGURED, deck, params, null)).toBeNull()
    expect(paddlesCue(f6f, onFinal(1000, 0, params.coneHalfAngleDeg + 5), CONFIGURED, deck, params, null)).toBeNull()
    expect(paddlesCue(f6f, onFinal(params.maxRangeM + 100), CONFIGURED, deck, params, null)).toBeNull()
    // Ahead of the ship is not "on final".
    const ahead = onFinal(1000)
    const bow = deckWorld(deck, 0, deck.lengthM)
    expect(paddlesCue(f6f, { ...ahead, position: v3(bow.x, ahead.position.y, bow.z) }, CONFIGURED, deck, params, null)).toBeNull()
  })

  it('reads roger on slope and speed, high and low off slope, fast and slow off speed', () => {
    expect(paddlesCue(f6f, onFinal(1000), CONFIGURED, deck, params, null)).toBe('roger')
    expect(paddlesCue(f6f, onFinal(1000, params.glideslopeToleranceDeg + 0.3), CONFIGURED, deck, params, null)).toBe('high')
    expect(paddlesCue(f6f, onFinal(1000, -(params.glideslopeToleranceDeg + 0.3)), CONFIGURED, deck, params, null)).toBe('low')
    expect(paddlesCue(f6f, onFinal(1000, 0, 0, approachMps + params.speedBandMps + 1), CONFIGURED, deck, params, null)).toBe('fast')
    expect(paddlesCue(f6f, onFinal(1000, 0, 0, approachMps - params.speedBandMps - 1), CONFIGURED, deck, params, null)).toBe('slow')
  })

  it('cuts inside cut range when on, waves off inside wave-off range when not', () => {
    expect(paddlesCue(f6f, onFinal(params.cutRangeM - 10), CONFIGURED, deck, params, null)).toBe('cut')
    expect(paddlesCue(f6f, onFinal(params.waveOffRangeM - 10, 2), CONFIGURED, deck, params, null)).toBe('wave-off')
    expect(paddlesCue(f6f, onFinal(params.waveOffRangeM - 10, 0, 0, approachMps + 10), CONFIGURED, deck, params, null)).toBe('wave-off')
    // Between wave-off and cut range, on and on: still roger, not yet cut.
    expect(paddlesCue(f6f, onFinal((params.cutRangeM + params.waveOffRangeM) / 2), CONFIGURED, deck, params, null)).toBe('roger')
  })

  it('judges speed through the AIR: a headwind down the deck reads as more airspeed', () => {
    const wind = v3(-Math.sin(deck.headingRad) * 8, 0, Math.cos(deck.headingRad) * 8) // from ahead of the ship
    // Ground speed exactly at the approach speed plus 8 m/s of headwind is 8 m/s fast through the air.
    expect(paddlesCue(f6f, onFinal(1000, 0, 0, approachMps), CONFIGURED, deck, params, wind)).toBe('fast')
    expect(paddlesCue(f6f, onFinal(1000, 0, 0, approachMps - 8), CONFIGURED, deck, params, wind)).toBe('roger')
  })
})
```

Create `tests/render/paddlesBadge.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { paddlesLabel } from '../../src/render/paddlesBadge.js'

describe('paddlesLabel', () => {
  it('is null with no cue and the signal in capitals otherwise', () => {
    expect(paddlesLabel(null)).toBeNull()
    expect(paddlesLabel('roger')).toBe('PADDLES: ROGER')
    expect(paddlesLabel('wave-off')).toBe('PADDLES: WAVE OFF')
    expect(paddlesLabel('cut')).toBe('PADDLES: CUT')
  })
})
```

Run both → FAIL (modules missing).

- [ ] **Step 2: paddles.ts**

Create `src/sim/paddles.ts`:

```ts
import type { AircraftSpec } from './flight/schema.js'
import type { AircraftState, Controls } from './flight/state.js'
import { airVelocity } from './flight/model.js'
import { effectiveStallSpeedMps, GEAR_DOWN_FRACTION } from './ground.js'
import { deckLocal, type Deck } from './world/deck.js'
import { length, sub, type Vec3 } from './math/vec3.js'
import type { PaddlesParams } from './world/ships.js'

/** What the landing signal officer is holding up (Plan 8 design section 7). */
export type PaddlesCue = 'high' | 'low' | 'fast' | 'slow' | 'roger' | 'cut' | 'wave-off'

/** The approach speed the cue is judged around: 1.15 x the full-flap stall,
 *  the 11b approach figure. Airspeed, not deck-relative: the wing flies
 *  through the air, and the LSO reads the airplane's attitude for it. */
export const APPROACH_SPEED_STALL_MULTIPLE = 1.15

const DEG = Math.PI / 180

/**
 * Pure. `null` unless the airplane is configured (gear and hook down),
 * astern of the deck inside the approach cone, and inside `maxRangeM`.
 * Glideslope is measured to the trap zone's center at deck height; range is
 * the horizontal distance to that point. Priority: wave-off, cut, high/low,
 * fast/slow, roger.
 */
export function paddlesCue(
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
  deck: Deck,
  params: PaddlesParams,
  wind: Vec3 | null,
): PaddlesCue | null {
  if (controls.hookDown !== true || state.gearFraction < GEAR_DOWN_FRACTION) return null
  const local = deckLocal(deck, state.position.x, state.position.z)
  const zoneZ = -deck.lengthM / 2 + (deck.trapFromSternM + deck.trapToSternM) / 2
  const asternM = zoneZ - local.z
  if (asternM <= 0) return null
  const rangeM = Math.hypot(asternM, local.x)
  if (rangeM > params.maxRangeM) return null
  const offAxisDeg = Math.abs(Math.atan2(local.x, asternM)) / DEG
  if (offAxisDeg > params.coneHalfAngleDeg) return null

  const wheelsAboveDeckM = state.position.y - spec.gear.heightM - deck.center.y
  const slopeDeg = Math.atan2(wheelsAboveDeckM, rangeM) / DEG
  const slopeError = slopeDeg - params.glideslopeDeg
  const onSlope = Math.abs(slopeError) <= params.glideslopeToleranceDeg

  const approachMps = APPROACH_SPEED_STALL_MULTIPLE * effectiveStallSpeedMps(spec, state.flapFraction)
  const speedError = length(airVelocity(state, wind)) - approachMps
  const onSpeed = Math.abs(speedError) <= params.speedBandMps

  if (rangeM <= params.waveOffRangeM && !(onSlope && onSpeed)) return 'wave-off'
  if (rangeM <= params.cutRangeM) return 'cut'
  if (!onSlope) return slopeError > 0 ? 'high' : 'low'
  if (!onSpeed) return speedError > 0 ? 'fast' : 'slow'
  return 'roger'
}
```

`paddles.ts` imports from `model.ts` (`airVelocity`); `model.ts` must not import `paddles.ts` (it does not). Run `npx depcruise src --config .dependency-cruiser.cjs` to confirm no cycle.

- [ ] **Step 3: The badge**

Create `src/render/paddlesBadge.ts`, copying `pauseBadge.ts`'s shape:

```ts
/**
 * The landing signal officer's cue, as one line of text (Plan 8 design
 * section 7). Split like `pauseBadge.ts`: a pure label the Node suite
 * asserts on, thin DOM under it. Placed low center, above the gauge strip,
 * where a pilot on final is already looking; the pause badge owns 40%.
 */
import type { PaddlesCue } from '../sim/paddles.js'

const WORDS: Readonly<Record<PaddlesCue, string>> = {
  high: 'HIGH', low: 'LOW', fast: 'FAST', slow: 'SLOW', roger: 'ROGER', cut: 'CUT', 'wave-off': 'WAVE OFF',
}

export function paddlesLabel(cue: PaddlesCue | null): string | null {
  return cue === null ? null : `PADDLES: ${WORDS[cue]}`
}

export type PaddlesBadgeHandle = { setCue(cue: PaddlesCue | null): void }

export function createPaddlesBadge(root: HTMLElement): PaddlesBadgeHandle {
  const el = document.createElement('div')
  el.setAttribute('aria-live', 'polite')
  el.style.cssText =
    'position:fixed;left:50%;top:68%;transform:translate(-50%,-50%);padding:8px 16px;' +
    'border:1px solid #2b3440;border-radius:6px;background:rgba(12,14,18,.78);color:#ffe16a;' +
    'font:18px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;' +
    'pointer-events:none;display:none;z-index:9'
  root.appendChild(el)
  let shown: string | null = null
  return {
    setCue(cue: PaddlesCue | null): void {
      const label = paddlesLabel(cue)
      if (label === shown) return
      shown = label
      el.textContent = label ?? ''
      el.style.display = label === null ? 'none' : 'block'
    },
  }
}
```

- [ ] **Step 4: Per frame, and the diagnostics**

`src/render/main.ts`: `const paddlesBadge = createPaddlesBadge(root)` beside `pauseBadge`; a helper above the frame function:

```ts
  /** The LSO's cue for the player this frame, from the first carrier with paddles parameters. */
  const paddlesFor = (f: FrameState): PaddlesCue | null => {
    const player = playerAircraft(f.world)
    for (const ship of f.world.ships) {
      if (ship.spec.paddles === undefined) continue
      const deck = deckOf(ship)
      if (deck === null) continue
      return paddlesCue(player.spec, player.state, f.controls, deck, ship.spec.paddles, f.world.wind)
    }
    return null
  }
```

and in the per-frame update block: `paddlesBadge.setCue(paddlesFor(current))`. Imports: `paddlesCue, type PaddlesCue` from `../sim/paddles.js`, `deckOf, decksOf` from `../sim/world/deck.js`.

`src/render/diagnostics.ts`, three granular getters after `oceanLandWeight`, each with the `null`-before-frame guard the others carry:

```ts
  /** The LSO cue for the player, or `null` when there is nothing to signal (Plan 8). */
  readonly paddles: () => PaddlesCue | null
  /** The deck under the player's wheels, or `null` (Plan 8). */
  readonly deck: () => { readonly shipId: string; readonly heightM: number; readonly velocity: Vec3 } | null
  /** The world wind, the velocity of the air; `null` is calm (Plan 8). */
  readonly wind: () => Vec3 | null
```

implemented in `main.ts` as `paddles: () => (frame ? paddlesFor(frame) : null)`, `deck: () => { if (!frame) return null; const p = playerAircraft(frame.world).state; const g = groundUnder(frame.world.terrain, decksOf(frame.world.ships), p.position.x, p.position.z); return g?.deck ? { shipId: g.deck.shipId, heightM: g.heightM, velocity: g.velocity } : null }`, `wind: () => frame?.world.wind ?? null`. Also change the existing `supportedContact` and `groundHeightM` getters to read through `groundUnder(frame.world.terrain, decksOf(frame.world.ships), x, z)` so Tier 2's `waitForTerrain` and the take-off spec's wheel-height check see the deck: `groundHeightM` returns `g?.heightM ?? null` — on a deck spawn with no terrain yet that is the deck height, which is honest; `supportedContact` passes `g.surface, g.velocity`.

- [ ] **Step 5: Run, verify, commit**

Run: `npx vitest run tests/sim/paddles.test.ts tests/render/paddlesBadge.test.ts` → PASS.
`npm run verify; rc=$?; echo rc=$rc` → `rc=0`.

```bash
git add src/sim/paddles.ts src/render/paddlesBadge.ts src/render/main.ts src/render/diagnostics.ts tests/sim/paddles.test.ts tests/render/paddlesBadge.test.ts
git commit -m "Paddles: the LSO's cue on final, a pure function and one line of text"
```

---

### Task 7: The deck you can see, and the sea that matches the wind

**Files:**
- Modify: `src/render/scene/ship.ts`, `src/render/ocean/weather.ts`, `src/render/ocean/beaufort.ts`, `src/render/main.ts:144` and the ocean creation, `tests/render/ocean/weather.test.ts:6-8`
- Test: `tests/render/ship.test.ts` (add), `tests/render/ocean/beaufort.test.ts` (add)

**Interfaces:**
- Produces: `beaufortFromWindMps(mps: number): number`; `beaufortFromQuery(search): number | undefined`.

- [ ] **Step 1: Failing tests**

Add to `tests/render/ship.test.ts`:

```ts
  it('the carrier deck plane sits exactly at flightDeck.heightM with the flight deck dimensions, and carries a trap band (Plan 8)', () => {
    const mesh = createShipMesh(cv)
    const plane = mesh.getObjectByName('flight deck') as Mesh
    expect(plane).toBeDefined()
    plane.geometry.computeBoundingBox()
    const box = plane.geometry.boundingBox!
    // Local: bow along +x, waterline at y = 0. The TOP of the slab is the deck height.
    expect(box.max.y + plane.position.y).toBeCloseTo(cv.flightDeck!.heightM, 6)
    expect(box.max.x - box.min.x).toBeCloseTo(cv.flightDeck!.lengthM, 6)
    expect(box.max.z - box.min.z).toBeCloseTo(cv.flightDeck!.widthM, 6)
    const band = mesh.getObjectByName('trap zone') as Mesh
    band.geometry.computeBoundingBox()
    const bb = band.geometry.boundingBox!
    // From the stern (-x) forward: fromSternM..toSternM.
    expect(bb.min.x + band.position.x).toBeCloseTo(-cv.flightDeck!.lengthM / 2 + cv.trapZone!.fromSternM, 6)
    expect(bb.max.x + band.position.x).toBeCloseTo(-cv.flightDeck!.lengthM / 2 + cv.trapZone!.toSternM, 6)
    expect(bb.max.y + band.position.y).toBeGreaterThan(cv.flightDeck!.heightM)
  })
```

(`cv` is the carrier spec the file already loads; import `Mesh` from `three`.)

Create or add to `tests/render/ocean/beaufort.test.ts`:

```ts
describe('beaufortFromWindMps (Plan 8)', () => {
  it('picks the nearest force by representative speed, so 15 kn is force 4, the shipped default', () => {
    expect(beaufortFromWindMps(0)).toBe(0)
    expect(beaufortFromWindMps(7.717)).toBe(4)
    expect(beaufortFromWindMps(9.4)).toBe(5)
    expect(beaufortFromWindMps(12.3)).toBe(6)
    expect(beaufortFromWindMps(100)).toBe(12)
    expect(() => beaufortFromWindMps(NaN)).toThrow()
    expect(() => beaufortFromWindMps(-1)).toThrow()
  })
})
```

`tests/render/ocean/weather.test.ts:6-8`: the absent case becomes `expect(beaufortFromQuery('')).toBeUndefined()` with the title "is undefined when the parameter is absent, so scenario weather can decide".

Run: `npx vitest run tests/render/ship.test.ts tests/render/ocean` → FAIL.

- [ ] **Step 2: Deck plane and trap band**

`src/render/scene/ship.ts`, replace the carrier branch:

```ts
  if (spec.role === 'carrier' && spec.flightDeck !== undefined) {
    // What the eye lands on is what the sim thinks is there (Plan 8): the
    // slab's TOP is at `flightDeck.heightM`, the exact `Deck.center.y` the
    // ground constraint rests the wheels on, with the sourced 862 x 108 ft
    // planform rather than the hull's maximum beam.
    const { lengthM, widthM, heightM } = spec.flightDeck
    const slabM = 1.2
    const flightDeck = new Mesh(new BoxGeometry(lengthM, slabM, widthM), deck)
    flightDeck.name = 'flight deck'
    flightDeck.position.set(0, heightM - slabM / 2, 0)
    root.add(flightDeck)
    if (spec.trapZone !== undefined) {
      const { fromSternM, toSternM } = spec.trapZone
      const band = new Mesh(new BoxGeometry(toSternM - fromSternM, 0.05, widthM * 0.9), new MeshStandardMaterial({ color: 0x6b7480, roughness: 0.9 }))
      band.name = 'trap zone'
      band.position.set(-lengthM / 2 + (fromSternM + toSternM) / 2, heightM + 0.025, 0)
      root.add(band)
    }
    const island = new Mesh(new BoxGeometry(spec.lengthM * 0.12, 14, 6), grey)
    island.position.set(spec.lengthM * 0.05, heightM + 7, widthM / 2 + 3)
    root.add(island)
  } else if (spec.role === 'carrier') {
    // A carrier record without a flight deck block: the pre-Plan-8 slab.
    const flightDeck = new Mesh(new BoxGeometry(spec.lengthM * 0.98, 1.2, spec.deckWidthM), deck)
    flightDeck.position.set(0, spec.deckHeightM + 0.6, 0)
    root.add(flightDeck)
  } else {
```

keeping the escort branch. The island moves outboard of the flight deck's edge so it does not sit on the runway.

- [ ] **Step 3: Beaufort from the wind**

`src/render/ocean/beaufort.ts`:

```ts
/** The force whose representative speed is nearest `mps` (Plan 8: scenario
 *  weather drives the sea). 15 kn (7.717 m/s) is force 4, which is also the
 *  development default, so deck quals' sea looks like free flight's. */
export function beaufortFromWindMps(mps: number): number {
  if (!Number.isFinite(mps) || mps < 0) throw new Error(`beaufort: wind ${mps} m/s is not a speed`)
  let best = 0
  for (let b = 1; b <= BEAUFORT_MAX; b++) {
    if (Math.abs(TABLE[b]![0] - mps) < Math.abs(TABLE[best]![0] - mps)) best = b
  }
  return best
}
```

`src/render/ocean/weather.ts`: `beaufortFromQuery` returns `number | undefined`, `undefined` when absent (delete the `return DEFAULT_BEAUFORT` line, change the signature); its doc gains "absent is `undefined` so the scenario's weather decides".

`src/render/main.ts`: delete line 144's `const beaufort = ...`; after `bundle` is loaded (line ~381) add:

```ts
  // Sea state from the scenario's wind (Plan 8), with the DEV `?beaufort=`
  // override winning when present. Below the bundle on purpose: the wind is
  // scenario content.
  const beaufort =
    (import.meta.env.DEV ? beaufortFromQuery(window.location.search) : undefined) ??
    beaufortFromWindMps(bundle.scenario.weather.windMps)
```

`DEFAULT_BEAUFORT` stays exported for the tests that use it and the `?beaufort=` doc; nothing in production reads it now, so update its comment.

- [ ] **Step 4: Run, verify, commit**

Run: `npx vitest run tests/render/ship.test.ts tests/render/ocean tests/build` → PASS (`dist.test.ts`'s `BEAUFORT_PARAM` no-leak check still holds because the query read is behind `import.meta.env.DEV`).
`npm run verify; rc=$?; echo rc=$rc` → `rc=0`.

```bash
git add src/render/scene/ship.ts src/render/ocean/weather.ts src/render/ocean/beaufort.ts src/render/main.ts tests/render/ship.test.ts tests/render/ocean/beaufort.test.ts tests/render/ocean/weather.test.ts
git commit -m "Draw the deck where the sim puts it, and let the scenario wind choose the sea state"
```

---

### Task 8: Tier 2, handoff, roadmap

**Files:**
- Create: `tests/e2e/deckQuals.spec.ts`, `docs/handoff/2026-09-18-plan8-carrier-ops.md`
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` §15 rows 8 and (next), `README.md` (controls, if it lists keys; the `?scenario=` parameter beside `?spawnX`)

- [ ] **Step 1: The Tier 2 spec**

Create `tests/e2e/deckQuals.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { debriefDialog, percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'
import { GROUND_CONTACT_TOLERANCE_M } from '../../src/sim/ground.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const URL = `/?${SCENARIO_PARAM}=deck-quals`

test.setTimeout(180_000)

test('deck quals: the player is parked on the moving deck and sails with the carrier', async ({ page }) => {
  await page.goto(URL)
  await waitForTerrain(page)
  const read = () => page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { deck: d.deck(), me: d.aircraft().find((a) => a.id === 'f6f-1')!, cv: d.ships().find((s) => s.id === 'cv-1')!, tick: d.tick(), wind: d.wind(), errors: d.validationErrors }
  })
  const a = await read()
  expect(a.deck?.shipId).toBe('cv-1')
  expect(a.wind).not.toBeNull()
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.supportedContact()), { timeout: 20_000 }).toBe(true)
  await page.waitForTimeout(5000)
  const b = await read()
  const elapsedS = (b.tick - a.tick) / 60
  expect(elapsedS).toBeGreaterThan(3)
  const shipMoved = Math.hypot(b.cv.x - a.cv.x, b.cv.z - a.cv.z)
  const meMoved = Math.hypot(b.me.x - a.me.x, b.me.z - a.me.z)
  expect(shipMoved).toBeGreaterThan(7.717 * elapsedS * 0.9)
  // Parked: carried by the deck, to within a meter of the ship's own travel.
  expect(Math.abs(meMoved - shipMoved)).toBeLessThan(1)
  expect(b.deck?.shipId).toBe('cv-1')
  expect(b.errors).toEqual([])
  await page.screenshot({ path: 'test-results/deck-quals-parked.png' })
})

test('deck quals: a full-throttle deck run gets airborne off the bow with the trap zone and cue in view', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(URL)
  await waitForTerrain(page)
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.supportedContact()), { timeout: 20_000 }).toBe(true)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
  await page.keyboard.down('Equal')
  // Rotate once the run is well along; the deck is 262.7 m and the spot 241 m from the bow.
  await page.waitForTimeout(9000)
  await page.keyboard.down('ArrowDown')
  await page.waitForTimeout(1200)
  await page.keyboard.up('ArrowDown')
  await page.waitForFunction(
    ([gearHeightM, toleranceM]) => {
      const d = (window as DiagWindow).__ww2!
      const groundM = d.groundHeightM()
      if (groundM === null) return false
      return !d.supportedContact() && d.aircraftPositionM().y - gearHeightM - groundM > toleranceM
    },
    [f6f.gear.heightM, GROUND_CONTACT_TOLERANCE_M] as const,
    { timeout: 30_000 },
  )
  await page.waitForTimeout(2000)
  const after = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { supported: d.supportedContact(), impact: d.impact(), deck: d.deck(), errors: d.validationErrors, gpu: d.gpuFrameTimesMs() }
  })
  expect(after.supported).toBe(false)
  expect(after.impact, 'the deck run ended in an impact').toBeNull()
  expect(after.deck).toBeNull()
  expect(after.errors).toEqual([])
  expect(after.gpu.length).toBeGreaterThan(120)
  const p95 = percentile(after.gpu, 0.95)
  console.log(`deck quals gpu p95 ${p95.toFixed(3)} ms over ${after.gpu.length} samples`)
  expect(p95).toBeLessThan(6.0)
  await page.keyboard.up('Equal')
  await page.screenshot({ path: 'test-results/deck-quals-airborne.png' })
})

test('H toggles the hook and is listed in the legend', async ({ page }) => {
  await page.goto(URL)
  await waitForTerrain(page)
  await page.keyboard.press('KeyH')
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.controls().hookDown)).toBe(true)
  await expect(page.getByText(/Hook\s+H/)).toBeVisible()
  await expect(debriefDialog(page)).toBeHidden()
})
```

If the run does not get airborne within the 241 m: the plan's arithmetic (236 m ashore, less the 7.7 m/s head start and 7.7 m/s of wind over the deck) is measured, not assumed, by Task 5's Node `takeoffRollM`-style loop: before touching the spec, run a Node measurement of the roll from the deck spot with the scenario wind and record it in the ledger; if it exceeds the deck, move the spot aft in `deck-quals.json` (down to `z: -125`) and record why.

- [ ] **Step 2: Run Tier 2**

Run: `PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org npx playwright test tests/e2e/deckQuals.spec.ts` then the whole suite `... npm run test:tier2`. Look at both screenshots. Record the gpu p95 and the run in the ledger. A `net::ERR_QUIC_PROTOCOL_ERROR` at `page.goto` is the LAN DNS issue documented in `playwright.config.ts`; with `--unsafe` on the server it should not recur, and if it does, re-run the affected spec alone.

- [ ] **Step 3: Handoff, roadmap, README**

Write `docs/handoff/2026-09-18-plan8-carrier-ops.md` in the shape of `docs/handoff/2026-09-18-plan14-mission-map.md`: commits table; measurements (the wind headwind roll from Task 1, the chock-on-deck drift, the carrier landing's printed figures, the deck-run lift-off point, Tier 2 gpu p95 noting the post-2026-09-18 baseline); controls and data contract (`H`, `?scenario=`, the `flightDeck`/`trapZone`/`paddles`/`weather` blocks, `landing.at`); decisions made while executing (from the ledger); every number that is a guess (from spec §10 plus anything added); later seams (spec §12).

Master spec §15: row 8 → `| 8 | 12 | Carrier and airfield operations | §4, §8 | Complete 2026-09-18; [handoff](../../handoff/2026-09-18-plan8-carrier-ops.md) |` and move `— next` to the following row in the Order column (Plan 6, order 13). README: where the DEV query parameters are listed, add `?scenario=deck-quals`; where the keys are listed, if anywhere, add `H` hook.

- [ ] **Step 4: Verify, commit, email**

`npm run verify; rc=$?; echo rc=$rc` → `rc=0`. Re-diff against `HEAD`.

```bash
git add tests/e2e/deckQuals.spec.ts docs/handoff/2026-09-18-plan8-carrier-ops.md docs/superpowers/specs/2026-09-12-ww2airsim-design.md README.md
git commit -m "Close Plan 8: deck quals on the reference GPU, handoff, and the roadmap"
python3 tools/mail-doc.py docs/handoff/2026-09-18-plan8-carrier-ops.md "ww2airsim Plan 8 handoff: carrier operations complete"
```

Do not push or deploy.
