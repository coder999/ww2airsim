# Carrier and Airfield Operations — Plan 8 Design

Status: design approved in conversation 2026-09-18 (Mark: option 2 scope,
arcade trap zone, deck run, wind in the model, paddles cues). This document
is the written form of that approval; the implementation plan follows it.

## 1. What this builds, and what it is for

The pilot can begin and end a flight aboard the moving Essex-class carrier
that Plan 12 put in San Pedro Bay. Concretely:

- A new scenario, **deck quals**, spawns the player parked aft on the
  carrier's flight deck, sailing with the ship. Brakes off, full throttle,
  off the bow.
- Returning, with hook down, a touchdown inside the deck's trap zone arrests
  the airplane and ends the flight with a landing report that names the
  carrier. Outside the zone, or hook up, the airplane rolls and either flies
  off the bow or goes around.
- On final, a **paddles** cue tells the pilot what the landing signal officer
  would be signalling: high, low, fast, slow, roger, cut, wave-off.
- The world gains a **steady wind**, so a carrier steaming into it has wind
  over the deck, and the same weather block drives the sea state.

"Airfield operations" in the plan's title adds nothing beyond what Plans 11a,
11b and 12 already deliver ashore: the landing report already names the
airfield, and the meta-game (Plan 9) consumes it. Dulag works like Tacloban.

The engineering point is the moving reference frame. Plan 11 settled flare,
touchdown, roll-out and brakes against a fixed runway so that a defect here
has one candidate cause: the deck.

## 2. What exists today, measured 2026-09-18

| Fact | Value | Where |
| --- | --- | --- |
| Essex flight deck | 862 ft × 108 ft = **262.7 m × 32.9 m**, with a 4 ft 9 in ramp curving down at each end | globalsecurity.org CV-9 design page; Wikipedia "Essex-class aircraft carrier" (short-hull) |
| Essex length overall / max beam | 265.8 m / 45.0 m | `content/ships/essex-cv.json`, Wikipedia |
| Essex flight-deck height above the waterline | **17 m, ESTIMATE** — no freeboard figure in Wikipedia, globalsecurity or naval-encyclopedia; only the hangar's 17 ft 6 in overhead is published | `essex-cv.json` (Plan 12's flag stands) |
| Arresting gear | sixteen-wire Mk 4, "spaced from the stern to just aft of the island"; four cable barriers | globalsecurity.org CV-9 design page |
| Task-force speed on its racetrack | 7.717 m/s (15 kn), loop legs bearing about 162° / 342° (bearingTo is atan2(Δx, −Δz); corrected 2026-09-18 during planning) | `content/scenarios/free-flight.json` |
| F6F full-flap take-off roll, no wind | 236.1 m measured (755 ft = 230.1 m trial) | `content/aircraft/f6f-hellcat.json` reference note |
| Touchdown gates | sink ≤ 4.0 m/s; speed ≤ 1.42 × flap stall; `ARRIVAL_SINK_THRESHOLD_MPS` 0.1 | `src/sim/ground.ts` |
| Ship state | position, heading, speed; `stepShip` steps ships before aircraft | `src/sim/world/ships.ts`, `src/sim/loop.ts` |
| Ground lookup available to `step` | `SimContext.terrain?: TerrainField \| null`; `onGround`, `restOnSurface`, `supportedContact` read a scalar ground height | `src/sim/loop.ts`, `src/sim/ground.ts` |
| Wind in the flight model | none: `step()` reads ground velocity as airspeed (Plan 1 ruling R29); `SimContext` reserves the seam | `src/sim/flight/model.ts`, `loop.ts` header comment |
| Scenario schema | `player`, `airfields`, `aircraft[{id, spec, parkedAt{airfield, spot}, chocked}]`, `ships[{id, spec, waypoints, speedMps}]`; strict, no weather | `src/sim/scenario.ts` |
| Free key | `KeyH` unbound | `src/input/bindings.ts` |
| Approach autopilot | `approachControls(spec, state, target)` flies a runway approach to touchdown (11b: 1.47 m/s sink, 0.0 m off centerline) | `tools/autopilot/approach.ts` |

## 3. Wind (first task, everything after it is measured with wind present)

`SimContext` gains `wind?: Vec3 | null` (m/s, world frame, the velocity of
the air; `undefined`/`null` mean calm, like `terrain`). `step` computes
`airVelocity = state.velocity - wind` once and every aerodynamic term that
today reads `state.velocity` (dynamic pressure, angle of attack, sideslip,
weathercock, lift and drag directions) reads `airVelocity` instead. Ground
rolling, gear, brakes and the ground constraint stay in the ground frame.

Bit-identity: with `wind` null the subtraction is skipped, not performed with
a zero vector, so the compiled path is the one that exists today. The golden
trajectory, every test card and the 11b landing figures must not move by a
bit; the plan's first task asserts exact equality.

Scenario content gains a `weather` block: `{ windFromDeg, windMps }`,
meteorological convention (the direction the wind blows FROM, true).
`worldFromScenario` converts it to the world-frame vector that `advance`
passes into `SimContext`. Free flight carries `windMps: 0`. Deck quals
carries about 15 kn from 342°, so the ship steams into it on the north-westbound
long leg (corrected 2026-09-18 during planning: the legs bear 162°/342°, not
018°/198°). The ocean
already takes a Beaufort number; the plan's renderer task derives that
number from `windMps` so sea and air agree, with the `?beaufort=` DEV
override still winning when present.

Not in scope: gusts, shear, turbulence, wind gradient with height.

## 4. The deck under the wheels

After ships step and before aircraft step, `advance` derives one `Deck` per
ship whose spec carries a `flightDeck`:

```ts
type Deck = {
  readonly shipId: string
  readonly center: Vec3        // world, deck height above sea level
  readonly headingRad: number  // ship heading
  readonly lengthM: number     // along the ship
  readonly widthM: number      // across
  readonly velocity: Vec3      // the ship's, world frame
  readonly trapFromSternM: number
  readonly trapToSternM: number
}
```

`SimContext` gains `decks?: readonly Deck[]`. A new pure function replaces
the scalar ground reads:

```ts
type GroundUnder = {
  readonly heightM: number
  readonly surface: 'land' | 'water' | 'deck'
  readonly velocity: Vec3      // zero for land and water
  readonly deck: Deck | null
}
function groundUnder(terrain: TerrainField | null, decks: readonly Deck[], x: number, z: number): GroundUnder
```

A point inside a deck's rectangle (rotate into ship frame, compare against
half length and half width) returns the deck height and the ship's velocity;
the deck wins over the water beneath it. Elsewhere it returns what
`heightAt` and `surfaceAt` return today.

`onGround`, `restOnSurface`, `supportedContact` and the rolling regime take a
`GroundUnder` (or its height and velocity) rather than a bare height. The
ground constraint rests the airplane at the surface velocity, not zero: a
chocked airplane sails with the ship; a rolling one has its ground-frame
velocity measured relative to the deck for brakes, rolling resistance and the
lateral grip constant. `ContactSurface` grows `'deck'`; `contactOutcome` on a
deck arrival outside the gates is `'destroyed'`, never `'ditched'`.

Deck edges are cliffs: a wheel past the rectangle is over water at sea level,
17 m down, and the existing water contact rules apply. There is no railing,
catwalk or island collision.

`World` does not change. Ships already carry everything a deck is derived
from; nothing is cached on an entity.

## 5. Trap

- Binding `toggleHook: ['KeyH']`, listed in the legend as `Hook`; a
  `hook` field on `Controls`/frame state alongside gear and flaps, with the
  same tap-latch handling. Hook travel is instantaneous (no time constant
  worth modelling at this scope).
- The carrier spec's `trapZone: { fromSternM, toSternM }` marks the arcade
  zone. Values are content: 30 m to 130 m from the stern, an estimate laid
  over "sixteen wires from the stern to just aft of the island" with the
  island near the deck's midpoint; flagged in §10.
- A touchdown on a `'deck'` surface, hook down, main gear inside the trap
  zone, inside the existing sink and speed gates, is an **arrest**: from that
  step the airplane's deck-relative velocity decays at a constant
  `TRAP_DECEL_MPS2 = 17` m/s², which is 2.0 s and 34 m of run-out from a 34 m/s
  arrival (about 1.7 g, in the range of a real
  pendant run-out), the airplane rides the deck, and when deck-relative speed
  reaches zero the flight ends exactly as an ashore landing does today, with
  `landing.at = { kind: 'carrier', id }`. The landing report's existing
  `airfield` field becomes a discriminated `at` (Plan 9 is its consumer and
  is not written yet).
- Touching down hook up, or outside the zone, is an ordinary deck roll-out:
  brakes work, the deck carries you, and the bow is a cliff.
- A touchdown that fails the gates is a crash, as ashore.
- No barrier, no bolter mechanic beyond "you are still flying".

## 6. Launch: the deck quals scenario

`content/scenarios/deck-quals.json`: the same airfields, ships and specs as
free flight; the player's `parkedAt` becomes
`{ ship: 'cv-1', spot: { x: 0, z: -110 } }` (deck-local meters, `x` across to
starboard, `z` along the ship toward the bow, so 110 m aft of center on the
centerline; the scenario schema's `parkedAt` becomes a union of the airfield
form and the ship form). `chocked: false`. Heading equals the ship's. The
wingman stays parked at Tacloban. `weather` as in §3.

Scenario selection: `?scenario=deck-quals` in a DEV build, falling back to
`SCENARIO_ID`; production keeps the constant. The mission picker is Plan 9.

Deck run arithmetic, to be measured not assumed: 236 m roll ashore with no
wind, 262.7 m of deck, spot at 110 m aft of center leaves 241 m to the bow,
plus 7.7 m/s of ship speed and 7.7 m/s of wind over the deck at the start.
The plan's launch task records the measured lift-off point and margin.

## 7. Paddles

A pure function in `src/sim/paddles.ts`:

```ts
type PaddlesCue = 'high' | 'low' | 'fast' | 'slow' | 'roger' | 'cut' | 'wave-off'
function paddlesCue(spec: AircraftSpec, state: AircraftState, deck: Deck, params: PaddlesParams): PaddlesCue | null
```

`null` unless: gear down, hook down, inside the approach cone (behind the
stern, within `coneHalfAngleDeg` of the deck's reciprocal heading, within
`maxRangeM`). Otherwise, in priority order: `wave-off` if inside `waveOffRangeM`
and outside the glideslope or speed band; `cut` inside `cutRangeM` on
glideslope and speed; `high`/`low` by glideslope error beyond
`glideslopeToleranceDeg` (glideslope measured to the trap zone's center at
deck height); `fast`/`slow` by airspeed outside `speedBandMps` around the
approach speed (1.15 × flap stall, the 11b approach figure); else `roger`.

`PaddlesParams` live in the carrier spec: `{ glideslopeDeg: 3.5,
glideslopeToleranceDeg: 0.7, speedBandMps: 3, coneHalfAngleDeg: 20,
maxRangeM: 2500, cutRangeM: 120, waveOffRangeM: 250 }`. All estimates, §10.

Rendered as one short uppercase text cue in the cockpit HUD, near the
existing gauge strip, present only while the function returns a cue. No
lights, no figure on the deck, no audio in this plan.

## 8. Renderer

- The carrier mesh gains a flat deck plane at `flightDeck.heightM`, the
  trap zone painted as a lighter band, so what the eye lands on is what the
  sim thinks is there. Derived from the same spec numbers the sim reads.
- The player's rendered pose already comes from `World`; a parked airplane on
  a moving deck moves because the world says so. Nothing new.
- The paddles cue text (§7).
- The ocean's Beaufort derives from `weather.windMps` (§3).
- Nothing new for airfields.

## 9. Testing

Tier 1, headless, every commit:

- **Wind.** With `wind` null, the golden trajectory's checkpoints, the take-off
  card, the climb card and the 11b touchdown figures are bit-identical to
  their committed values. With a 5 m/s headwind, the take-off roll shortens
  and the measured airspeed at lift-off is unchanged; with a crosswind, a
  hands-off airplane weathercocks into it; the airmass-frame energy invariant
  holds at idle.
- **Deck.** `groundUnder` returns deck height and ship velocity inside the
  rectangle at every heading, water outside it; a chocked airplane on the
  deck of the free-flight carrier drifts under 0.5 m relative to the deck in
  60 s of sailing including a turn (the Plan 12 chock test, on a moving
  surface); a rolling airplane's brakes bring it to rest relative to the
  deck, not the world.
- **Trap.** The resolver on synthetic geometry: in-zone hook-down traps,
  hook-up rolls, out-of-zone rolls, gate failures crash; the arrest decays to
  zero deck-relative speed within `TRAP_DECEL_S` and the report names the
  carrier. The 11b approach autopilot, retargeted at the moving deck, flies to
  a trap: sink, speed and centerline at touchdown recorded and gated at the
  11b tolerances.
- **Paddles.** Every cue on synthetic states; `null` outside the cone or with
  gear or hook up; priority order.
- **Scenario.** Deck-quals parses; a ship-parked player spawns at the deck
  spot at deck height with the ship's heading; the schema rejects a spot off
  the deck.
- **Architecture.** `src/sim/` still imports nothing from `render/`.

Tier 2, reference GPU, 1440p: deck quals loads with the player parked on a
moving deck (position advances with `cv-1` across real time); a scripted
deck run gets airborne with zero validation errors; the frame budget with the
deck plane and cue in view; the chart names the carrier as before.

## 10. Every number that is a guess

| Value | Figure | Standing |
| --- | --- | --- |
| Flight-deck height above waterline | 17 m | Estimate; searched 2026-09-18, no primary figure found. Affects only where the surface is. |
| Trap zone | 30–130 m from the stern | Estimate from "16 wires from the stern to just aft of the island". |
| Arrest run-out | 17 m/s² constant | Choice, about 1.7 g; 2.0 s from approach speed. |
| Paddles parameters | §7 values | Choices; tune by flying. |
| Deck-quals wind | 15 kn from 018° | Content choice matching the racetrack legs. |
| Deck spot | 110 m aft of center | Choice; measured against the deck run. |
| Essex turn rate | 1°/s | Plan 12 estimate, unchanged; no tactical diameter found. |

## 11. Explicit non-goals

Catapult; barrier; gusts, shear or turbulence; deck crew, deck park or
elevators; wake, roll, pitch or ship motion in the waves (the ship stays at
mean sea level); angled deck or mirror; island or superstructure collision;
scoring, recovery multiplier, badges, mission picker (Plan 9); AI wingman
(Plan 7); audio for the trap or the LSO (Plan 15's seam).

## 12. Later seams

- Plan 9 reads `landing.at` for "landed at carrier or airfield".
- Plan 7's AI pilots fly `paddlesCue` directly; it is already pure.
- Gusts enter as a time-varying `wind` in `SimContext` with no other change.
- Ship motion in the sea enters through `Deck.center` and a deck pitch/roll,
  which `groundUnder` would then rotate by; nothing else needs to know.
- Clouds (requested 2026-09-18, next design) drift with `weather`.

## 13. The shape of the plan

1. Wind in `SimContext` and `step`; scenario `weather`; bit-identity gate.
2. `Deck`, `groundUnder`, surface velocity through the ground constraint;
   the chock-on-deck test.
3. Ship-parked spawn, deck-quals scenario, `?scenario=` selection.
4. Hook binding and the trap resolver; landing report `at`.
5. Autopilot trap: the approach autopilot to the moving deck.
6. Paddles function and HUD cue.
7. Deck plane and trap band in the renderer; Beaufort from wind.
8. Tier 2, handoff, §15 row, README.
