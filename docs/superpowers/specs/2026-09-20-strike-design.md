# Plan 6b — bombs and rockets against ships and land structures

2026-09-20. The second slice of Plan 6 (combat and damage, master spec §5
"Guns" and "Damage", §15 row 6). Mark chose the slice, the loadout picker, the
targets, the release scheme and the architecture in a brainstorm on 2026-09-20;
the choices and the alternatives set aside are recorded where they apply.
Torpedoes wait for a second airframe (the F6F never carried one in service);
structural-overload damage is still Plan 6's, later. AI is Plan 7.

## 1. What the pilot gets

- On the title screen, before New game, a loadout: **clean, bombs, rockets,
  both** (default both). The Hellcat then carries two 1,000 lb bombs on its
  wing racks and six 5-inch HVAR rockets on its rails, hung under the wings
  and gone one by one as released, with their mass and drag on the airplane.
- **V drops one bomb per press. E fires one pair of rockets per press.**
  Rockets follow the gunsight line; bombs are dive-bombed by eye with the nose
  as the reference, as the airplane was flown. No bomb pipper (Mark's call:
  a computed impact marker was offered and declined as a HUD element that did
  not exist in 1944).
- A new DEV scenario **`strike-range`**: parked at Tacloban, a Japanese
  Wartime Standard Type B cargo ship anchored in Leyte Gulf off Dulag, and
  Dulag enemy-held, its hangars and tower legitimate targets.
- **Ships take damage, burn and sink. Buildings take damage and collapse.**
  The readout counts `SUNK` and `RAZED` beside `KILLS`.

## 2. Content

All of it strict zod, failing loudly at load (master spec §9); every number
carries its source or the word ESTIMATE in the `source` string beside it.

### 2.1 Stores on the aircraft spec

`content/aircraft/f6f-hellcat.json` gains an optional strict `stores` block
beside `combat`:

```
stores: {
  racks: [ { id: 'left-rack',  offset: [0.4, -0.55, -2.6], store: 'an-m65' },
           { id: 'right-rack', offset: [0.4, -0.55,  2.6], store: 'an-m65' } ],
  rails: [ six entries, offset z = ±3.6, ±4.3, ±5.0, store: 'hvar' ],
  types: {
    'an-m65': { kind: 'bomb', massKg: 453.6, dragAreaM2: 0.09, fillerKg: 240.9,
                damage: 120, blastRadiusM: 30, armS: 0.5, lifetimeS: 60, dragPerM: 0.00002 },
    'hvar':   { kind: 'rocket', massKg: 61, dragAreaM2: 0.03, warheadKg: 20.6,
                damage: 40, blastRadiusM: 8, burnS: 1.0, burnDeltaVMps: 419,
                lifetimeS: 12, dragPerM: 0.00008 },
  },
  source: <the §2.1 sources below, verbatim, with each ESTIMATE named>
}
```

Rack and rail offsets are body-frame meters against the procedural mesh in
`src/render/scene/hellcat.ts` (wing box at x 0.4, y −0.25, span 13.06 m), the
same status the gun mounts have: placed on this mesh, not on a drawing.

Sources, to be repeated in the `source` string:

- Six HVARs, three under each wing; single bomb racks under each wing inboard
  of the undercarriage bays; 1,000 lb class per rack: English Wikipedia,
  "Grumman F6F Hellcat", read 2026-09-20.
- HVAR: 134 lb (61 kg) all-up, 45.5 lb (20.6 kg) warhead, 1,375 ft/s
  (419 m/s) plus the speed of the launching aircraft: English Wikipedia,
  "High Velocity Aircraft Rocket", read 2026-09-20; designation-systems.net
  "Air-Launched 5-Inch Rockets" gives 64 kg / 20 kg / 5 km range. **Burn time
  1.0 s is an ESTIMATE**: neither source states it.
- AN-M65 1,000 lb GP: 530 lb (240.9 kg) Amatol filler, 53 % of total weight,
  so 1,000 lb (453.6 kg) all-up: Australian War Memorial C285409 and
  bulletpicker.com "Bomb, 1000 lb GP, AN-M44, AN-M65, AN-M65A1", read
  2026-09-20.
- `dragAreaM2`, `dragPerM`, `damage`, `blastRadiusM`, `armS`, `lifetimeS`
  are ESTIMATES or gameplay choices, in the same standing as `combat`'s
  dispersion and HP figures. `dragPerM` for the bomb is chosen so a release at
  120 m/s from 1,500 m lands within about 1,200 m of the release point and
  reaches roughly 200 m/s; the plan measures and records the actual figure.

### 2.2 The target ship

`content/ships/type-b-maru.json`, role `merchant` (the `role` enum gains it):
`lengthM` 112.0, `beamM` 15.8, `deckHeightM` 6 (ESTIMATE, the escort's
figure; freeboard is not sourced), `maxSpeedMps` 6.2 (12 kn, ESTIMATE for the
class), `turnRateRadPerS` 0.02 (ESTIMATE), `hullHp` 240. Dimensions from the
English Wikipedia article "Japanese cargo ship Mimasaka Maru (1944)", one of
18 Wartime Standard Type B ships laid down 1943–44: 4,667 GRT, 112.00 m,
15.80 m beam, 9.10 m draught, read 2026-09-20. The ship renderer draws it as
it draws an escort: a box hull; the merchant gets a taller box amidships for a
superstructure so it is not a second destroyer at a glance.

`hullHp` is added to every ship spec: Essex 600, Fletcher 160, both gameplay
choices. Nothing in this slice can reach them but the player, which is
allowed, as strafing one's own deck already is.

### 2.3 Buildings become content

`content/bases/<id>.json` gains a required `buildings` array:
`{ id, kind: 'hangar' | 'tower', x, z, widthM, lengthM, hp }` in the
airfield's local frame, the frame `AIRFIELD_BUILDINGS` in
`src/render/scene/airfield.ts` uses today. Tacloban receives that table
verbatim (three hangars, one tower) so its look does not change; a Tier 1
test pins the moved table against the old constant until the constant is
deleted in the same task. Dulag receives the same table for now: the Dulag
content note says "Buildings are Plan 13d's", and 13d's real layout replaces
it. HP: hangar 120, tower 40 (gameplay choices).

The renderer's `createAirfield` reads the content list. The clearing test
`inAirfieldClearing` is unchanged.

### 2.4 The scenario

`content/scenarios/strike-range.json`: `player` parked at Tacloban's runway
center as `gunnery-range` does; ships `[ { id: 'maru-1', spec: 'type-b-maru',
waypoints: [[x, z]], speedMps: 0 } ]` anchored roughly 6 km east of Dulag in
open water (coordinates chosen from the depth field in the plan, deep enough
that the hull box never touches the seabed); airfields `['tacloban',
'dulag']`; `enemyAirfields: ['dulag']`; weather with `timeOfDay` 14. The
scenario schema changes: `waypoints` min length 1 when `speedMps` is 0, and
the new optional `enemyAirfields` list, each entry one of `airfields`.

`loadout` is NOT scenario content: it is the title screen's choice, carried
into `worldFromScenario` as an argument, absent meaning clean. (Alternatives
set aside: scenario-decided loadout with a DEV override; always armed.)

## 3. Simulation

`src/sim/` imports nothing from `render/` (the dependency cruiser proves it).
Everything below is pure, fixed-tick, deterministic from a saved clone.

### 3.1 Stores state, mass and drag

`AircraftCombat` gains `stores: { readonly bombs: number; readonly rockets:
number }`, set from the loadout at world creation and by restart. `massKg`
becomes `emptyKg + fuelKg + Σ store mass remaining`; the drag sum gains
`Σ store dragAreaM2 · q`, the term shape gear and flaps use. A clean airplane
(stores absent or both counts zero) adds exactly zero, so
`damagedSpec`-style identity holds and every golden and landing snapshot is
untouched. Stores are on the airplane's wings: a destroyed `leftGuns` or
`rightGuns` zone does not shed them (no per-side store loss; kept simple).

### 3.2 Release

`Controls` gains `dropBomb?: boolean` and `fireRockets?: boolean`,
edge-triggered in the frame path as `cycleCamera` is: one release per
key-down. A release is refused, silently, when the airplane is on the ground
below 2 m/s (a parked airplane cannot bomb its own strip; the guns, by
contrast, fire from the chocks by design), when paused, crashed or destroyed,
or when that store is empty. Bombs release alternately left then right;
rockets fire as the outermost remaining pair.

Each release advances the PRNG once (a dispersion draw for rockets, a null
draw for bombs so the cursor count per release is constant), which keeps
the "each shot advances it exactly twice" bookkeeping honest by extension:
the schema comment states the counts.

### 3.3 Ordnance flight

`Projectile` gains `kind: 'round' | 'bomb' | 'rocket'`, `ageS` and `owner`
already exists. `flyProjectile` is unchanged for rounds. A bomb starts at the
rack's world position with the airplane's velocity and flies under gravity
and its own `dragPerM`. A rocket starts at the rail with the airplane's
velocity, is accelerated along the gunsight line by `burnDeltaVMps / burnS`
for `burnS` seconds (exact closed form per tick, not Euler), then coasts with
its `dragPerM`. Rockets get the guns' dispersion draw; bombs none.

### 3.4 Detonation and blast

Ordnance detonates at the first contact the existing swept tests find:
terrain (`groundUnder`), sea level, a hull box, a structure box, or an
aircraft hit box, in the same nearest-contact order rounds use. A bomb
younger than `armS` that contacts anything is a dud: removed, no damage. On
detonation the direct target, if any, takes `damage`; then every structure,
hull and aircraft whose box center lies within `blastRadiusM` of the
detonation point takes `damage · (1 − d / blastRadiusM)`, the direct target
excluded from the blast. A bomb into the water beside a hull therefore still
hurts it. Blast on an aircraft applies to structure HP and no subsystem.

### 3.5 Structures

`World.structures: readonly StructureEntity[]`, built at world creation from
every airfield's `buildings` (both friendly and enemy; only content decides
what is worth bombing), each `{ id, airfield, spec: { kind, position,
headingRad, halfSize, hp }, state: { hp, destroyedTick, attacker } }`. Never
stepped: no motion, no aging. Rounds, blast and direct hits reduce `hp`; the
first tick at zero sets `destroyedTick` and `attacker` once, and a destroyed
structure keeps its slot and its box (rubble still stops rounds). Only
structures at an `enemyAirfields` base count toward `RAZED`; destroying your
own hangar costs nothing and awards nothing.

### 3.6 Ship damage

`ShipEntity` gains `damage: { hp, fire, destroyedTick, attacker,
sinkingFraction }`. Hits and blast reduce `hp`. `fire` is `max(0, 1 − hp /
(hullHp / 2))` clamped to one: a ship below half HP burns, harder as it
takes more. At `hp ≤ 0`, once: `destroyedTick` and `attacker` are set, the
ship's orders are replaced by hold-position (speed 0), and
`sinkingFraction` rises linearly to one over 90 s, after which the ship is
`sunk` and no longer blocks or takes anything; its slot remains. `shipsSunk`
and `structuresDestroyed` counters join `kills` on the attacker's record.

HP arithmetic, gameplay choices stated once here: bomb 120, rocket 40, round
4 (the round's existing 10 is against aircraft; ships and structures take a
`roundDamage` field of their own, so strafing a hangar for 30 rounds razes it
and 60 rounds only scratch the maru). Maru 240 = two bombs, or six rockets, or
one bomb and three rockets. Hangar 120 = one bomb or three rockets. Tower 40.

### 3.7 Order within a tick

Ships step; decks derive; damage ages; aircraft step with damage and stores
mass; combat steps: releases and shots emit, projectiles fly and resolve,
blast applies, ship and structure damage updates, sinking advances. Exactly
`advance`'s order today with ordnance inside `stepCombat`.

## 4. Rendering, readout and sound

- **Stores on the airframe**: small bodies at the rack and rail offsets on the
  Hellcat mesh, visible in both camera modes, each hidden when its count says
  it is gone (racks left-first, rails outermost-first, matching the sim).
- **Ordnance in flight**: one pooled `InstancedMesh` per kind, camera-relative
  like tracers; the rocket carries a short emissive flame while `ageS <
  burnS`. Pool bounds: 8 bombs, 32 rockets; the sim's pool bound covers the
  rest.
- **Impacts**: the round hit flash is unchanged; bombs and rockets get a
  fireball scaled by kind and a smoke column that lingers 20 s at the impact
  point, pooled (8 columns).
- **Structures**: a destroyed building swaps to a collapsed geometry of the
  same footprint (a low, broken box with the weathered material) and a smoke
  column that fades over 60 s.
- **Ships**: the hull settles by `sinkingFraction` (sinks one hull height,
  lists 8° to a fixed side) and is hidden when sunk; a burning ship carries a
  smoke plume scaled by `fire`, the engine-smoke curve reused.
- **Title screen**: a loadout row of four radio buttons above New game,
  keyboard-reachable; the choice is passed to the boot path.
- **Readout and legend**: `SUNK n` and `RAZED n` appear when non-zero; two
  legend rows, `Bombs  V` and `Rockets  E`, and the stores remaining
  (`B 2  R 6`) in the readout while any are carried.
- **Audio**: a release thump and a rocket motor whoosh, cued from count changes
  as the gun clip is, so pause, repeated frames and restart stay silent.
- Nothing here touches a scene an existing Tier 2 budget case measures; the
  strike scenario gets its own budget case.

## 5. Acceptance

**Tier 1** (`tests/sim/stores.test.ts`, `tests/sim/strike.test.ts`,
`tests/sim/structures.test.ts`, extensions to `scenario.test.ts`,
`ships.test.ts`, `combat.test.ts`, `tests/render/airfield.test.ts`):

- Malformed `stores`, `buildings`, `hullHp`, a zero-speed ship with no
  waypoint, and an `enemyAirfields` entry not in `airfields` are rejected
  with the field named.
- A clean airplane steps through the identical spec object; the goldens and
  landing snapshots are bit-identical. With both stores, mass is
  `empty + fuel + 2·453.6 + 6·61` and drag rises by the summed area times q.
- V and E are edge-triggered: a held key releases once; releases are refused
  when parked below 2 m/s, paused, crashed, destroyed or empty; bombs
  alternate sides, rockets fire outermost pairs; counts never rise.
- Bomb and rocket flight match closed forms over one tick and over many; the
  rocket reaches launch speed + 419 m/s at `burnS` within 1 %.
- A bomb contacting anything before `armS` is removed without damage.
- Nearest contact wins among terrain, sea, hull, structure and aircraft;
  blast falls linearly and excludes the direct target; a bomb in the water
  10 m from the maru's box center takes two thirds of its damage off the
  hull.
- Structure and ship destruction happen once at a stable tick with a stable
  attacker; rubble and a sinking hull still block rounds; a sunk ship blocks
  and takes nothing; only enemy-airfield structures count toward `RAZED`.
- A saved clone continues identically through a release, a detonation and a
  sinking; a random soak of releases is deterministic.
- The moved Tacloban building table equals the old constant.
- Restart rebuilds stores from the same loadout and restores every structure
  and hull.

**Tier 2** (`tests/e2e/strike.spec.ts`, reference GPU at 1440p, screenshots
READ): load `?scenario=strike-range` with both stores selected through the
title screen; the stores are visible under the wings in chase view; from a
spawn override 1,500 m over the maru in a 45° dive press V and watch the
maru's HP fall and the fireball; from 800 m on final to Dulag press E three
times and watch a hangar's HP reach zero and the collapse; GPU p95 under
6 ms with all stores hanging and two smoke columns up; both camera modes;
zero validation errors; pause with V held changes nothing; restart clears
everything. `__ww2.combat()` grows `stores`, `shipsSunk`,
`structuresDestroyed`; `__ww2.ships()` reports HP and sinking fraction;
`__ww2.structures()` reports HP.

`npm run verify` exits 0 (captured directly) and a dated handoff records
every number, the bomb-drag calibration actually measured, the images read,
and the remaining Plan 6 scope.

## 6. Risks and contingencies

- **Bomb drag is an estimate**; if a dive release lands absurdly, `dragPerM`
  is the one lever, retuned once against the measured figure.
- **A zero-speed ship** touches Plan 8's steering: `stepShip` must hold
  heading and position with one waypoint rather than divide by a zero
  leg. Pinned by a test before anything else uses it.
- **Buildings into content** is the one change that can alter Tacloban's
  look; the table-equality test and a Tier 2 screenshot from the chocks guard
  it.
- **Smoke columns and fireballs are new GPU work** in the strike scene only;
  the strike budget case measures them. If they cost more than 1 ms at
  1440p, the column count is the lever.
- **The title-screen picker is throwaway** in the sense §8 replaces it; it
  is kept to one row and one field so the replacement is a deletion.
