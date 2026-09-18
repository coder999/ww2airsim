# Plan 12: Entities, ships and airfields — design

**Status:** draft for Mark's review, written 2026-09-18. Not yet approved.
Master spec §15's table is the authoritative plan numbering and order; this
document takes the identity it already has there, **Plan 12, order 10, next**,
and restates neither.

Every number below was measured on **2026-09-18** against `main` at `7349f4b`
unless it says otherwise. The probe commands are in §12 so they can be re-run.

---

## 1. What this builds, and what it is for

Master spec §15, coupling 2, is the whole mandate and is quoted nowhere else on
purpose:

> The single-entity `World` has three consumers, not one. Enemy aircraft,
> projectiles and a sailing carrier all need it. `World.controls` in
> `src/sim/loop.ts` currently assigns that generalisation to the combat plan;
> Plan 12 takes it instead, because a shape derived from airplanes alone would
> have to be bent afterwards to carry a moving deck, which is a reference frame
> rather than another airplane.

So this plan is **not "add ships"**. It is: reshape `World` so that it holds N
things of more than one kind, prove the shape with the two kinds that exist
today's content can justify, and leave the three later consumers a seam each
rather than a rewrite. Concretely it delivers:

1. **A multi-entity `World`** — several aircraft, several ships, one clock, one
   accumulator, one player — with `advance` stepping all of them in a fixed,
   documented order. The player's own trajectory through the new loop is
   **bit-identical** to today's, asserted, not assumed (§10).
2. **Ships that sail.** A task force in San Pedro Bay — one Essex-class carrier
   and two Fletcher-class destroyers — steaming a closed racetrack at 15 knots,
   turn-rate limited, deterministic, and validated at load to be over water for
   the whole loop. Visible from the Tacloban runway after take-off.
3. **Airfields as content.** Tacloban and Dulag become records in
   `content/bases/`, schema-validated, that the simulation knows about: the
   spawn derives from Tacloban's record instead of a literal in `spawn.ts`, the
   runway and airfield meshes are built from a record rather than from
   constants, and the landing report names the base it happened at.
4. **A parked second Hellcat** on the Tacloban apron: the cheapest proof that
   two aircraft step and render, and the "parked aircraft" airfield content
   Plans 11a and 11b both deferred here.
5. **A scenario file** (`content/scenarios/free-flight.json`) that says where
   all of the above starts. It is the data contract Plan 14's map and Plan 9's
   mission selector will read.

### What it deliberately does not build

- **No deck contact.** A Hellcat flies through the carrier. The deck as a
  surface the wheels can rest on is Plan 8's, and §15's coupling 3 says why it
  waits: a fixed runway first, so a landing defect has one candidate cause.
- **No AI.** The parked Hellcat holds its brakes and does nothing. The seam an
  AI pilot plugs into is designed (§9) and not built, because nothing consumes
  it — the same rule `SimContext` was built under.
- **No collision with, or damage to, anything.** Plan 6.
- **No change to `step`, `ground.ts` or any aircraft physics.** Coupling 1:
  flight-model changes precede anything tuned against them, and this plan
  tunes nothing. That is what makes the bit-identity guarantee cheap.
- **No wave motion on ships.** Ships sit at mean sea level, exactly as the
  airplane's water contact is judged against `y = 0` (Plan 10 design §1). The
  FFT sea is GPU-only and the sim is headless; a ship that heaved with a wave
  the sim cannot see would be a second sea.
- **No Dulag buildings, towns or roads.** Plan 13d. This plan lays Dulag's
  strip only, because the strip is what the runway record describes and the
  mesh builder has to take a record anyway (§6).

---

## 2. What exists today, measured

`World` (`src/sim/loop.ts`) is exactly one airplane:

| Field | What it is | Why it is in `World` rather than a closure |
| --- | --- | --- |
| `spec` | the airplane's coefficient set | so `advance`'s signature never grows |
| `aircraft`, `previous` | the two most recent ticks | the renderer interpolates between them |
| `controls` | what the pilot commands, held for every step of one `advance` | moved here from `advance`'s parameter list precisely because "the combat plan's N-entity AI would have hit this parameter" |
| `assistMemory` | what the injected `Assist` remembers | "N airplanes are N worlds, or N entity records, each with its own memory field" |
| `terrain` | the ground, or `null` | serializable: an `Int16Array` survives `structuredClone` |
| `impact` | the first contact, never overwritten | "a world written to disk and read back must still remember that this flight already crashed" |
| `accumulatorSeconds` | unspent time in `[0, DT)` | the fixed-step contract |

Three of those doc comments already describe the multi-entity version they
expect — `controls`, `assistMemory` and `impact` — and §3 keeps every one of
those arguments intact. The one property they all share is the constraint this
design is built around: **a `World` is a complete, serializable description of
the flight.** Nothing about an entity may live in a closure, a module variable
or the renderer.

The consumers that read `World`'s fields directly, counted by `grep` on
2026-09-18 (`world.aircraft|previous|spec|controls|impact|terrain|assistMemory|accumulatorSeconds`
plus `createWorld`):

| File | Sites | Lines in file |
| --- | --- | --- |
| `tests/render/frame.test.ts` | 45 | 536 |
| `src/render/main.ts` | 28 | 994 |
| `src/render/frame.ts` | 27 | 566 |
| `tests/sim/terrainContact.test.ts` | 22 | 231 |
| `tests/sim/loop.test.ts` | 22 | 393 |
| `tools/soak/run.ts` | 21 | 723 |
| `tests/sim/landing.test.ts`, `tests/render/terrainLoad.test.ts` | 7 each | |
| `tests/render/frameAssists.test.ts`, `tests/render/audioInputs.test.ts` | 6 each | |
| `tests/render/tripleTime.test.ts`, `tests/render/pause.test.ts`, `tests/render/landing.test.ts`, two Tier 2 specs, `diagnostics.ts`, `audio.ts`, `cues.ts` | 1–5 each | |

About 230 sites in 18 files. Every one of them is a **type error** under the
new shape, because `world.aircraft` stops being an `AircraftState` (§3.2), so
the migration is compiler-driven and cannot leave a silent survivor. That is
the price of generalizing rather than bolting on, and it is paid once.

Two things are cheaper than they look:

- **The golden trajectory does not go through `World` at all.**
  `tools/golden/record.ts` calls `step` directly. Only
  `tests/sim/loop.test.ts`'s "drives the golden through `advance`" case does,
  and it is the assertion §10 tightens to bit-exact for the migration.
- **`step` reads nothing this plan adds.** `SimContext` gains no field.

---

## 3. The shape

### 3.1 Three approaches, and the one taken

| Approach | Shape | Verdict |
| --- | --- | --- |
| **A. Per-kind arrays in one `World`** | `world.aircraft: AircraftEntity[]`, `world.ships: ShipEntity[]`, one `tick`, one accumulator, `player` by id | **Taken** |
| B. One `entities: Entity[]` discriminated union | one array, `kind` on each record | Rejected: aircraft and ships have different state types, steppers and render paths, so a union buys one loop and costs a type narrowing at every consumer; projectiles (spec §3: "plain typed arrays") would not fit the union anyway |
| C. Container of N single-aircraft `World`s plus a ship list | `advance` untouched, each airplane keeps its own accumulator | Rejected: N accumulators are N clocks that drift apart under `MAX_STEPS_PER_FRAME`, and a deck under an airplane has to be reached across two worlds — the exact "bend it afterwards" coupling 2 forbids |

A is also the shape spec §3's module list already names: `world/` holds
"terrain height queries, carrier and ship kinematics", and `entities` are
"plain typed arrays" — the per-kind field is where a typed-array projectile
pool goes when Plan 6 has one.

### 3.2 The types

```ts
/** Unique within a World, assigned by the scenario, never an array index:
 *  an index changes when an entity is removed (a shot-down aircraft, Plan 6),
 *  an id does not. Content validation rejects duplicates. */
export type EntityId = string

export interface AircraftEntity<M = undefined> {
  readonly id: EntityId
  readonly spec: AircraftSpec
  readonly state: AircraftState
  /** The tick before `state`. Equal to it until the first step runs. */
  readonly previous: AircraftState
  /** Held constant for every step of one `advance` call. The frame sets the
   *  player's; a Plan 7 pilot will set the others' (§9). */
  readonly controls: Controls
  readonly assistMemory: M
  /** This airplane's first contact, or `null`. Per entity: one airplane
   *  crashing does not stop the war (§4). */
  readonly impact: Impact | null
}

export interface ShipEntity {
  readonly id: EntityId
  readonly spec: ShipSpec
  readonly state: ShipState
  readonly previous: ShipState
  readonly orders: ShipOrders
}

export interface World<M = undefined> {
  /** The world's clock. Every entity's `state.tick` equals this after a step;
   *  the soak asserts it. `SimContext.tick` is `world.tick + 1`. */
  readonly tick: number
  readonly aircraft: readonly AircraftEntity<M>[]
  readonly ships: readonly ShipEntity[]
  /** The airplane the frame's keys drive, the camera follows and the debrief
   *  reports. An id, not an index (see `EntityId`). Validated present. */
  readonly player: EntityId
  /** Static for the flight. In `World` because the landing report reads it
   *  (§6) and "a World is a complete description of the flight". */
  readonly airfields: readonly Airfield[]
  readonly terrain: TerrainField | null
  readonly accumulatorSeconds: number
}
```

What moved where, against today's table in §2:

| Today | After | Note |
| --- | --- | --- |
| `spec`, `aircraft`, `previous`, `controls`, `assistMemory`, `impact` | `AircraftEntity` fields | `aircraft` is renamed `state` inside the entity so `world.aircraft` can be the array. Every consumer's `world.aircraft.position` becomes a type error, which is the point. |
| `terrain`, `accumulatorSeconds` | unchanged | |
| — | `tick`, `ships`, `player`, `airfields` | new |

`World<M>` keeps its generic and every aircraft entity carries `assistMemory:
M` — the same `M` for all aircraft, because one `Assist<M>` is injected and
applies to every aircraft (spec §3: the AI produces "player-identical control
vectors" and is "bound by the same physics", which includes the assists a
test chooses to run it under). `assistMemory` stays `undefined` everywhere
today, exactly as its comment records.

Accessors, so consumers do not each write the lookup:

```ts
playerAircraft(world): AircraftEntity<M>          // throws if absent -- malformed by construction, caught at scenario parse
withControls(world, id, controls): World<M>        // the frame's per-frame rebuild, today's `{ ...prev.world, controls }`
createWorld(spec, aircraft, controls, memory?)     // KEPT: the one-airplane convenience every pre-Plan-12 test builds; player id 'player'
createWorldOf({ aircraft, ships, player, airfields, terrain? })   // the general constructor the scenario uses
```

`createWorld` staying is not the "bent shape" coupling 2 warns about: the
**type** is general, and a convenience constructor that fills a one-airplane
world is what keeps ~50 test call sites to a one-line change each.

### 3.3 Serialization

Unchanged in kind: arrays of plain objects plus the one `Int16Array`.
`tests/sim/loop.test.ts`'s "survives `structuredClone`" case grows to a world
with two aircraft and three ships, and its deep-frozen purity case likewise.

### 3.4 The order of a tick

`advance` runs, per owed step:

1. `tick = world.tick + 1`.
2. **Ships step first**, in array order, each from its own `previous`/`state`
   and `orders`, reading nothing else. Ships are exogenous kinematics: nothing
   pushes back on a 27,000-ton hull.
3. **Aircraft step second**, in array order, each with
   `{ dt: DT, tick, terrain }` exactly as today. An aircraft that already
   carries an `impact` is skipped — its `state`, `previous` and `impact` pass
   through untouched.
4. The impact test runs per aircraft after its step, as today, and a newly
   impacted aircraft sets `previous = state` so the renderer interpolates to
   the exact contact point. **It no longer breaks the step loop**: the other
   entities complete this step and the remaining owed steps.

Two rules govern what an entity may read, stated now so later plans do not
each invent one:

- **Aircraft-to-aircraft reads (Plan 6 hits, Plan 7 targeting) use the
  start-of-tick state** — the `previous` world — never a state produced
  partway through the same tick. Array order then cannot change any result.
- **Aircraft-to-ship reads (Plan 8's deck) use the ship's state as of the END
  of this tick**, which is why ships step first. A surface constraint projects
  the wheels onto where the deck *is* when the step ends; reading the deck's
  start-of-tick pose would leave a resting airplane one tick (0.13 m at 15
  knots) behind its own deck forever, which the ground constraint would then
  fight every step.

Neither read happens in Plan 12; the order is fixed so that adding them does
not change the trajectory of anything that exists today.

---

## 4. The clock, and how a flight ends

Today the end of a flight lives in `advance`: `if (world.impact !== null)
return { world, ... }`, so the whole simulation stops when the airplane hits
something. With N entities that is wrong twice over — the player's crash must
not stop the carrier, and an AI Zero's crash must not stop the player.

**`impact` becomes per aircraft, and `advance` stops nothing.** A crashed
entity is skipped (§3.4); everything else sails on.

**The player's end of flight moves to the frame, through the mechanism the
frame already has.** `nextFrameState` feeds `advance` zero elapsed seconds
while any of three things is true — paused, a ground spawn waiting for terrain,
or **the player has an impact** — and the third is new. Three reasons, one
mechanism, all Tier 1 testable; `main.ts` gains no logic. The debrief modal,
`shownImpactTick`, the impact effect and the audio cue all read
`playerAircraft(world).impact` where they read `world.impact` today.

One consequence to make exact: today a frozen world handed a thousand frames is
bit-identical to one handed a single frame, because the early return hands back
the same object. Feeding zero elapsed time through the accumulator instead
reproduces that in every case but one: an accumulator within 16.7 ns of `DT`
(`banked / DT + STEP_EPSILON` rounding up to 1) would run one step. So
`advance` gains a general, non-player rule in place of the impact rule: **zero
elapsed seconds owes zero steps and returns the world object unchanged.** That
also closes the same latent edge for pause and the terrain hold, which have
lived on it since 2026-09-17. The purity test's deep-frozen world still passes
through it.

`World.tick` exists so that `advance` has one clock rather than reading
`current.tick + 1` off the airplane it happens to be stepping. Every entity's
`state.tick` is set from `SimContext.tick` by its stepper; `stepChecked` in
development and the soak both assert they agree after every step. The audio
cue's "backwards tick means a new flight" rule reads `world.tick` instead of
the airplane's and behaves identically.

---

## 5. Ships

### 5.1 The model

`src/sim/world/ships.ts`, pure, no RNG, no wall clock:

```ts
export type ShipState = {
  readonly position: Vec3     // world meters; y is SEA_LEVEL_M, always
  readonly headingRad: number // compass: 0 north (-z), pi/2 east (+x) -- the gauges' atan2(fwd.x, -fwd.z)
  readonly speedMps: number
  readonly tick: number
}
export type ShipOrders = {
  readonly waypoints: readonly { x: number; z: number }[]   // a closed loop, visited in order, repeated
  readonly speedMps: number
}
export function stepShip(spec: ShipSpec, state: ShipState, orders: ShipOrders, ctx: SimContext): ShipState
```

Per step: the ship holds `orders.speedMps` (clamped to `spec.maxSpeedMps`),
turns toward the bearing of its current waypoint at no more than
`spec.turnRateRadPerS`, advances `speed * dt` along its heading in the x–z
plane, and switches to the next waypoint once within `spec.lengthM` of the
current one — a ship's length, so the switch never depends on a floating-point
equality and a turn-rate-limited hull that cannot reach the exact point does
not orbit it. The loop closes from the last waypoint to the first.

Why a racetrack rather than a straight course: a straight course at 15 knots
runs out of San Pedro Bay in about 40 minutes of simulated time, which is 13
minutes of real time under triple time — a session Mark actually flies. A
carrier on station steams a racetrack; the model matches the thing it stands
in for, and it is about forty lines.

Why not zig-zag, formation station-keeping, or an escort screen that follows
the carrier: no consumer. Each destroyer gets its own waypoint loop, offset
from the carrier's. Plan 8's "turn into wind for recovery" replaces `orders`
on one ship; that is a data change to a field this plan creates.

### 5.2 The heading convention, pinned

World coordinates are +x east, +y up, +z south (`29f5319`), and the compass is
`atan2(forward.x, -forward.z)` (`src/render/gauges.ts:205`). A ship's velocity
is therefore `speed * (sin h, 0, -cos h)`. A test asserts a ship on heading
`pi/2` moves +x and one on heading `0` moves -z, **and** that the heading the
gauge formula recovers from that velocity is the heading the ship was given.
Getting this wrong mirrors the task force's track east-west, which looks like
plausible seamanship rather than an obvious bug — the same failure shape
`heightAt`'s "reads north as -z" test exists for.

### 5.3 Content

`content/ships/<class>.json`, validated by a strict Zod schema in
`src/sim/world/ships.ts` following `flight/schema.ts`'s conventions (every
object `.strict()`, every number `finite`):

```json
{
  "id": "essex-cv",
  "name": "Essex-class fleet carrier",
  "role": "carrier",
  "lengthM": 265.8,
  "beamM": 28.3,
  "flightDeckWidthM": 45.0,
  "flightDeckHeightM": 17,
  "maxSpeedMps": 17.0,
  "turnRateRadPerS": 0.0175,
  "reference": { "source": "the published figures and the read date; the estimates named as such (§11)" }
}
```

Two classes: `essex-cv` and `fletcher-dd`. The figures and which of them are
estimates are in §11, and `reference.source` carries the same text (ruling
R17: provenance that lives only in a document is provenance that is lost).

### 5.4 Validation at load: the track is water

A ship whose loop crosses land is malformed content, and the spec §9 rule
applies — fail loudly at load, never let the ship walk up the beach. The
scenario loader samples every leg of every ship's loop at 100 m against the
terrain field the physics gets and rejects any sample with
`heightAt > SEA_LEVEL_M`. The candidate loop in §7 was checked this way on
2026-09-18: 422 samples, maximum height 0 m.

That checks the ideal legs. The turn-rate limit cuts corners, so a Tier 1 test
also **flies one full loop of the shipped scenario** through `stepShip` against
the committed L2 field and asserts the same, on the track the ship actually
sails. It is cheap (a 42 km loop at 15 knots is ~330,000 steps, well under a
second) and it is the assertion that survives someone moving a waypoint.

---

## 6. Airfields

### 6.1 Content

`content/bases/<id>.json`, strict Zod schema in `src/sim/world/airfields.ts`:

```json
{
  "id": "tacloban",
  "name": "Tacloban",
  "runway": { "center": { "x": -29666, "z": -47605 }, "headingDeg": 0, "lengthM": 1500, "widthM": 45 },
  "apron": { "x": -116, "z": -60, "widthM": 158, "lengthM": 465 },
  "reference": { "source": "where the coordinate came from and the read date; the heading assumption named as such" }
}
```

World meters, not latitude and longitude, and the pinned literal
`(-29666, -47605)` verbatim — master spec §15 forbids re-deriving it, and
`tests/render/runway.test.ts`'s assertion on the literal moves to the content
test. Measured 2026-09-18: `toLocal(11.228, 125.028)` gives
`(-29666.45, -47604.86)`, so the two forms agree to under half a metre and a
test can pin that agreement too. Dulag: `(-31629, -16479)` from 13d's design,
heading north–south **as an assumption** carried in `reference.source` until a
period photograph says otherwise. Its length is also an estimate (§11).

`headingDeg` follows the compass convention in §5.2; Tacloban's strip is
north–south today, so it is `0` and nothing moves.

A stale-claim note for the plan: `src/render/scene/runway.ts`'s comment says
"the level the physics gets (L4)", which has been L2 since `eef5b4d`. It is
touched by this plan and gets corrected in passing.

### 6.2 What the sim does with an airfield

Pure geometry in `src/sim/world/airfields.ts`: `runwayCorners(airfield)` and
`insideRunway(airfield, x, z)` (a rotated rectangle test). The landing report
gains `airfield: string | null`: the name of the airfield whose runway the
touchdown point lies inside, else `null`. `tools/autopilot/approach.ts`'s
every-commit approach into Tacloban therefore asserts one more thing — that
the report says `"Tacloban"` — and a landing on the beach says `null`. This is
the number spec §8's recovery multiplier ("landed at carrier or airfield: 1.0")
reads when Plan 9 arrives, and it costs one field now.

### 6.3 What the renderer does with an airfield

`createRunway(field, airfield)` and `createAirfield(field, airfield)` take a
record instead of reading `RUNWAY_CENTRE`; the strip is rotated by
`headingDeg`; `inAirfieldClearing(x, z)` tests every airfield's strip and
apron so vegetation keeps clear of Dulag too. `main.ts` builds one runway per
`world.airfields` entry when terrain arrives, exactly where it builds one
today. Dulag gets a strip and its apron patch and **no buildings** — Plan 13d's
smaller building set stays 13d's, and `createAirfield`'s building table becomes
the parameter 13d's design already says it should be.

**Amendment to 13d's design, recorded here and to be written there in the
plan:** 13d §7's `places.json` carries an `airfields` array with Dulag's
coordinate and heading. That array is dropped; `content/bases/` is the one
source, and 13d's Dulag work reads it. Two files describing one airfield is
precisely the drift §15 warns about.

### 6.4 The spawn

`DEFAULT_SPAWN_POSITION` in `src/render/spawn.ts` stops being a literal: the
scenario (§7) says the player starts parked at `tacloban`, and the position is
that record's runway centre with the placeholder `y` the existing comment
explains at length. `spawnPositionFromQuery`'s DEV override and
`hasSpawnOverride`'s "any override is airborne" rule are unchanged. The three
tests that pin the literal move to pin it on the content record.

---

## 7. The scenario file

`content/scenarios/free-flight.json`, strict schema in `src/sim/scenario.ts`,
and `worldFromScenario(scenario, content)` — pure — builds the initial
`World`. Restart rebuilds from the same function, keeping terrain and assists
exactly as `main.ts`'s restart callback does today.

```json
{
  "id": "free-flight",
  "player": "f6f-1",
  "airfields": ["tacloban", "dulag"],
  "aircraft": [
    { "id": "f6f-1", "spec": "f6f-hellcat", "parkedAt": { "airfield": "tacloban", "runwayCenter": true } },
    { "id": "f6f-2", "spec": "f6f-hellcat", "parkedAt": { "airfield": "tacloban", "apron": { "x": -90, "z": 100 } }, "chocked": true }
  ],
  "ships": [
    { "id": "cv-1", "spec": "essex-cv",    "waypoints": [[-19634, -44484], [-15277, -31138], [-8730, -28912], [-13090, -42257]], "speedMps": 7.717 },
    { "id": "dd-1", "spec": "fletcher-dd", "waypoints": "the carrier's loop offset 1 km to the north-east, chosen and water-checked in the plan", "speedMps": 7.717 },
    { "id": "dd-2", "spec": "fletcher-dd", "waypoints": "the carrier's loop offset 1 km to the south-west, likewise", "speedMps": 7.717 }
  ]
}
```

- **The task force** starts 10.5 km east-south-east of the Tacloban strip in
  San Pedro Bay, on a loop with legs of 14.0 km and 6.9 km (§12 has the
  probe). At 15 knots a lap is about 90 minutes simulated, 30 real under triple
  time. From a north-facing take-off it is off the right wing.
- **`chocked`** puts `brake: 1` in the parked aircraft's held controls. It is
  the honest model of wheel chocks, and without it a parked airplane on a
  0.03 % grade with `rollingResistanceCoeff` 0.02 stays put by a margin the
  plan should measure rather than assume. The player is not chocked: the
  pilot's own brakes key does that.
- **The apron spot** is chosen in the plan against `AIRFIELD_BUILDINGS` and
  pinned by a test that it lies inside the apron patch and outside every
  building footprint and the strip.
- **Every id is unique**, `player` names an aircraft that exists, every
  `spec` and `airfield` names a content file that exists, and every ship's
  loop is water (§5.4) — all rejected at parse, all tested.

What the file does **not** carry, so it is not drifted into: flights with
orders, targets, objectives, weather, time of day, loadout. Those are spec
§9's scenario fields and belong to the plans that consume them.

---

## 8. The renderer

`FrameState` gains two arrays and keeps `render`:

| Field | Meaning |
| --- | --- |
| `poses: readonly RenderState[]` | one interpolated pose per `world.aircraft`, same order |
| `shipPoses: readonly ShipRenderState[]` | one per `world.ships`, same order: position and heading, shortest-arc angle interpolation |
| `render: RenderState` | **the same object** as `poses[playerIndex]` — kept because the eye, the gauges, the cockpit group and the audio adapter all read it, and asserted identical so there is one computation, not two |

Interpolation stays in `frame.ts`, not `main.ts`, for the reason the 2026-09-13
review gave when it moved the camera arithmetic: a state transition nothing
tests is how this renderer got its last silent bugs.

Meshes: one `createHellcat()` per aircraft entity (the player's keeps the
propeller the throttle spins); `src/render/scene/ship.ts` builds a hull, a
flight deck and an island for a carrier, and a hull and superstructure for a
destroyer, from the class record's dimensions — code-built like the Hellcat,
AGPL, a row in `ASSETS.md`. All positioned in raw world meters as children of
`scene`, because `scene.position` already applies the camera-relative offset
once for every child (Plan 10's double-offset finding). Poses are set from
`frame.shipPoses`/`frame.poses` every frame, by index.

Cost: five small meshes. The Tier 2 spec measures it against the 6.0 ms p95
ceiling anyway; the expectation is no change from 5.177 ms.

`window.__ww2` (DEV only) gains `ships(): { id, x, z, headingRad }[]` and
`aircraft(): { id, x, y, z }[]`, for the Tier 2 spec and for the same reason
`aircraftPositionM` exists: proving the wire, not the picture.

---

## 9. What the later plans do with this shape

This section is the argument that the shape is general, written down so the
next plan can check it rather than re-derive it.

| Plan | Needs | Where it goes | What it must NOT need |
| --- | --- | --- | --- |
| **8 — carrier ops** | a deck under the wheels, moving | `SimContext` gains `decks?: readonly Deck[]`, derived by `advance` from `world.ships` **after** they step (§3.4 rule 2); `groundUnder(terrain, decks, x, z)` returns height, surface kind and surface velocity; `ContactSurface` grows `'deck'`; `restOnSurface` learns a surface velocity | any change to `World`. A parked airplane moving with the ship is the ground constraint resting it at the deck's velocity rather than zero — a `step` change under coupling 1, in Plan 8 |
| **7 — AI** | per-tick controls for non-player aircraft, reading the world | `advance` gains an injected `pilot?: (entity, world) => Controls` beside `assist`, run per step **before** the assist stack, from the start-of-tick world (§3.4 rule 1); each AI entity's `assistMemory` is already its own | a second `World` shape, or a privileged movement path — the AI writes `controls`, nothing else |
| **6 — combat** | projectiles, hits, removal | `world.projectiles` as a typed-array pool (spec §3), stepped between ships and aircraft; hit resolution reads start-of-tick aircraft; a destroyed aircraft is removed by id, and every consumer already looks up by id | index-as-identity anywhere |
| **14 — map** | points of interest | `world.airfields`, `world.ships`, `world.aircraft` are the legend; the scenario is the data contract | a second places file |
| **9 — meta-game** | "landed at carrier or airfield" | the landing report's `airfield` field (§6.2), and Plan 8's deck report | |

None of those five adds a field to `AircraftEntity` or `ShipEntity` that this
plan can name a consumer for today, so none of them is added now.

---

## 10. Testing

Tier 1, all headless, all on every commit:

- **Bit-identity of the player's trajectory across the migration.** The
  existing "drives the golden through `advance`" case keeps its cross-engine
  tolerance permanently (spec §3). The migration task additionally asserts
  **exact equality** of every checkpoint against the committed golden JSON on
  this engine — a temporary gate, removed once the task lands, recorded in the
  ledger. The approach autopilot's touchdown figures (1.47 m/s, 38.4 m/s,
  0.0 m off centerline), the take-off frame test's roll and the terrain-contact
  suite must all pass with no tolerance widened.
- **World shape.** `structuredClone` round-trip and deep-frozen purity with two
  aircraft and three ships; every entity's `tick` equals `world.tick` after
  every `advance`; a crashed aircraft is skipped while the others advance; a
  world advanced with zero elapsed seconds is the same object; `playerAircraft`
  and `withControls` behave.
- **Ships.** Heading convention (§5.2); straight-line distance equals
  `speed * t`; a course change is turn-rate limited to within one step; a loop
  is visited in order and repeats; `y` never leaves `SEA_LEVEL_M`; the shipped
  loop is water for one full lap on the real L2 field (§5.4); two runs are
  `toEqual`.
- **Airfields and scenario.** Strict schemas reject an unknown key, a
  duplicate id, a missing player, an unknown spec, a loop over land;
  `insideRunway` at the four corners and just outside; the landing report says
  `"Tacloban"` for the autopilot's approach and `null` for a beach; the parked
  Hellcat's apron spot is inside the apron and outside every building.
- **Frame.** `poses` aligns with `world.aircraft` and `render` is
  `poses[playerIndex]` by identity; the player's impact holds the world through
  the same path pause does; restart rebuilds every entity; the parked Hellcat
  has not moved more than 0.5 m after 60 s of simulated time on the real
  terrain (measured, then pinned).
- **Soak.** A fraction of iterations run the multi-entity scenario shape:
  ticks agree, ships on water, the chocked airplane stationary, determinism.
- **Boundary.** No new rule; `src/sim/world/ships.ts` and `airfields.ts` are
  under the existing `sim-must-not-import-*` rules and the probe test proves
  they bite there too.

Tier 2, on the reference desktop: `tests/e2e/entities.spec.ts` spawns airborne
over San Pedro Bay, waits for terrain, reads `ships()` twice a few seconds
apart and asserts each moved by `speed * elapsed` within a step, asserts zero
WebGPU validation errors across the camera sweep, records gpu p95 against the
6.0 ms ceiling, and screenshots the task force for the handoff.

Tier 3: Mark flies it. Nothing here asks him to check anything; the ships are
off the right wing after take-off and the second Hellcat is on the apron.

---

## 11. Every number that is a guess

All labeled in the content files' `reference.source`, following
`f6f-hellcat.json`'s convention.

| Value | Figure | Standing |
| --- | --- | --- |
| Essex-class length overall | 265.8 m | published figure, cite the article and read date in the content file |
| Essex-class waterline beam / flight deck width | 28.3 m / 45.0 m | published figures, cite |
| Essex-class flight deck height above waterline | 17 m | **estimate**; Plan 8 needs it exactly and sources it then |
| Essex-class maximum speed | 17.0 m/s (33 kn) | published, cite |
| Essex-class turn rate | 1°/s | **estimate** (a 440 m radius at 15 kn); Plan 8 tunes against a sourced tactical diameter |
| Fletcher-class length / beam / speed | 114.7 m / 12.1 m / 18.8 m/s (36.5 kn) | published, cite |
| Fletcher-class turn rate | 3°/s | **estimate** |
| Task force speed | 7.717 m/s (15 kn) | a choice, not a fact |
| Dulag runway length / width | 1500 m / 45 m | **estimates**, Tacloban's carried over; heading north–south is 13d's stated assumption |
| Chocked-airplane creep bound | 0.5 m in 60 s | a tolerance to be measured and then pinned, not a figure |

Ship names are deliberately class names only. Whether to give them hull
numbers and names is Mark's (§13).

---

## 12. Probes to re-run

```sh
# Tacloban: the pinned world literal is the projection of the geodetic point
npx tsx -e "import('./src/sim/world/projection.js').then(m => console.log(m.toLocal(11.228, 125.028)))"
# -> { x: -29666.45, z: -47604.86 }

# San Pedro Bay racetrack: every 100 m of every leg is water on the committed L2 field
# (the script that produced "422 samples, max height 0" is reproduced in the plan's Task for §5.4;
#  it loads level 2 via tools/terrain/load.ts, projects the four waypoints, and samples heightAt)
```

---

## 13. Open questions for Mark

1. **The task force.** One carrier and two destroyers in San Pedro Bay, 10.5 km
   off the strip, on a racetrack at 15 knots. Fine, or somewhere else, or more
   ships? Named hulls (USS *Essex*?) or class names only?
2. **The parked second Hellcat** on the apron as the two-aircraft proof: yes?
   The alternative proof is a wingman flying a scripted level circuit, which
   needs the Plan 7 pilot seam built early and was rejected here as a seam with
   no real consumer.
3. **Dulag as a strip only** in this plan, buildings in 13d — and 13d's
   `airfields` key in `places.json` dropped for `content/bases/` (§6.3).
4. **Ships at mean sea level**, through the waves, until there is a sea the sim
   can see. Accept as the visual compromise it is?
5. **Flying through a carrier** is possible until Plan 8 (deck) and Plan 6
   (damage). Same class as flying through the Tacloban hangars today.

---

## 14. The shape of the plan

Ten to twelve tasks, in the order the dependencies force:

1. Ship kinematics, schema, content and tests (leaf; nothing depends on it).
2. Airfield schema, content, geometry and tests (leaf).
3. Scenario schema, `worldFromScenario`, content and validation (depends 1, 2).
4. `World` reshape and `advance` (§3, §4), with the bit-identity gate (§10)
   and every `src/sim` and `tools/` consumer migrated — one commit, green.
5. `frame.ts`: poses, the player-impact hold, restart; tests.
6. Landing report names the airfield; the autopilot asserts it.
7. Renderer: runway and airfield from records, ship meshes, second Hellcat,
   `main.ts` wiring, diagnostics.
8. Soak extension.
9. Tier 2 spec and the reference-desktop run.
10. Docs: §15 row, README paragraph, 13d amendment, stale-comment sweep
    (`contact.ts`'s "arrive with Plan 12", `runway.ts`'s "L4"), handoff.

Task 4 is the one that touches ~230 sites and it is dispatched alone, on the
strongest model available, with the exact-equality gate as its acceptance
criterion.
