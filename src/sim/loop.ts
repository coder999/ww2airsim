import { createCombat, stepCombat, type CombatState } from './weapons/combat.js'
import { ageDamage, damagedSpec, type Damage } from './damage/model.js'
import { emptyStores, storesSpec, type StoresState } from './weapons/stores.js'
import type { AircraftSpec } from './flight/schema.js'
import type { AircraftState, Controls } from './flight/state.js'
import { airVelocity, DT, step } from './flight/model.js'
import type { TerrainField } from './world/terrain.js'
import type { Vec3 } from './math/vec3.js'
import { contactOutcome, type ContactSurface, type ContactKind } from './contact.js'
import { supportedContact } from './ground.js'
import type { ShipOrders, ShipSpec, ShipState } from './world/ships.js'
import { stepShip } from './world/ships.js'
import type { Airfield } from './world/airfields.js'
import type { Deck } from './world/deck.js'
import { decksOf } from './world/deck.js'
import { groundUnder } from './world/ground.js'
import { buildStructures, type StructureEntity } from './weapons/structures.js'
import type { PilotAssignment } from './ai/pursuit.js'
import { deriveFacts, decideManeuver, maneuverControls } from './ai/decision.js'

/**
 * The simulation's clock: the per-step context type, and the fixed-step
 * accumulator that decides when a step happens.
 *
 * `SimContext` exists because `step`'s signature is what every later plan has
 * to extend: terrain height queries, deck contact, a threaded RNG, a wind
 * vector. As a parameter list that is a change to every call site; as one
 * object it is a change to one interface (Plan 1 whole-branch review, highest
 * -risk structural finding).
 *
 * It carries `dt` and `tick` and NOTHING ELSE on purpose. The same review
 * flagged `speedOfSoundAt` as an export with no consumer; speculative
 * `wind`/`terrain`/`rng` fields would repeat exactly that. Later plans add a
 * field when they have a consumer for it.
 */
export interface SimContext {
  /** Seconds this step advances. Always `DT` in production; tests vary it. */
  readonly dt: number
  /** Monotonic simulation tick this step produces. Starts at 0. */
  readonly tick: number
  /**
   * The ground under the airplane this step, or `null` for "no ground".
   *
   * Added by Plan 11a, which is the consumer this field was waiting for: the
   * ground constraint and the weight-on-wheels regime both live in `step`, and
   * `step` cannot ask the world for anything it is not handed. Optional rather
   * than required deliberately — there are 51 `SimContext` construction sites
   * and exactly ONE of them is production (`advance`, below). A required field
   * would have edited 50 test and tool sites to say "no ground" out loud, for
   * no behavior. `undefined` and `null` both mean no ground.
   */
  readonly terrain?: TerrainField | null
  /**
   * The velocity of the air, world frame, m/s -- Plan 8. `undefined` and
   * `null` both mean calm and select the exact code path that existed before
   * wind was coupled (the subtraction is skipped, not performed with zero).
   * Optional for the reason `terrain` is: one production construction site.
   */
  readonly wind?: Vec3 | null
  /**
   * The carrier flight decks live this step, or `undefined`/an empty array
   * for "no decks" -- Plan 8. Derived by `advance` from `world.ships` AFTER
   * they step (see the comment on that call below), never stored on an
   * entity. Optional for the reason `terrain` and `wind` are: one production
   * construction site.
   */
  readonly decks?: readonly Deck[]
}

/**
 * The most steps one `advance` call may run.
 *
 * Without a cap, a frame that runs long owes more steps next frame, which makes
 * that frame longer still: the accumulator grows without bound and the game
 * locks up. Five steps is 83 ms of simulated time, comfortably more than any
 * healthy frame and far short of a freeze.
 */
export const MAX_STEPS_PER_FRAME = 5

/**
 * Tolerance, in steps, when counting whole steps owed. Half a step banked
 * plus half a step fed sums to 0.9999999999999998 steps in IEEE doubles
 * (measured 2026-09-12, Node 22), and a bare floor would owe zero and carry
 * a whole step of debt into the next frame. A millionth of a step is far
 * below anything a frame delta resolves and far above the rounding error.
 */
const STEP_EPSILON = 1e-6

/**
 * The most one call's `elapsedSeconds` is allowed to bank, seconds.
 *
 * A tab suspend or a debugger pause can hand `advance` an enormous delta.
 * Without this, an enormous-but-finite `elapsedSeconds` (e.g.
 * `Number.MAX_VALUE`) survives into `banked / DT`, which can itself overflow
 * to `Infinity` (measured 2026-09-12, Node 22). That poisons everything
 * downstream: `owed` becomes non-finite, `alpha` can come back `Infinity`
 * instead of in `[0, 1)`, and `accumulatorSeconds` can come back outside its
 * documented `[0, DT)` range and ride, poisoned, into every later `advance`
 * call on that world. Guarding at the input rather than clamping `owed`
 * afterward keeps every downstream field consistent by construction, rather
 * than requiring a second special case for each one individually.
 *
 * 60 seconds is comfortably beyond any real animation-frame stall (a tab
 * backgrounded for a few seconds, a GC pause, a debugger break) while being
 * astronomically far from where division by DT could overflow -- at this
 * bound, `banked / DT` is at most ~3600, nowhere near a double's range.
 * `MAX_STEPS_PER_FRAME` discards the excess regardless of how the input is
 * bounded, so this constant only decides how large `droppedSteps` can
 * honestly get for a delta that long, not whether the cap fires.
 */
const MAX_ELAPSED_SECONDS = 60

/** The function that integrates one tick: `step` in production, `stepChecked`
 *  in development builds. Chosen by the caller, so `sim/` carries no build flag. */
export type Stepper = typeof step

/**
 * The function that turns the pilot's raw command into what the stepper
 * actually integrates, run once per fixed STEP inside `advance`'s loop below.
 *
 * Plan 3's assists layer (`src/assists/index.ts`'s `applyAssists`) implements
 * this signature, but `sim/` deliberately does not import it: `assists/`
 * depends on `sim/`'s types, and importing it back here would invert that
 * direction and put an assist's tuning inside the layer the master spec
 * requires to stay pure physics (spec §3; whole-branch review precedent --
 * `Stepper` above already establishes "the caller injects the function"
 * as this codebase's way of extending a fixed-step call without sim/
 * depending on whoever wrote the extension). The caller closes over whatever
 * `AssistSettings` it wants and hands `advance` a plain four-argument
 * function; `sim/` only ever sees this shape.
 *
 * Takes `state`, not the World: `applyAssists`'s `state` parameter is the
 * aircraft AT THE START of the step being computed, which is the entity's
 * `state` on THIS step, not the one it had when the frame began (those differ
 * from the second step of a multi-step frame onward). `raw` is the entity's
 * `controls`, held constant for every step in one `advance` call, and `dt` is always `DT` here -- an assist
 * that needs to know how much time actually passed must be able to answer
 * that without depending on frame rate (open item 5's whole complaint), and
 * the fixed step is the only quantity in this loop that is not.
 *
 * An assist may need to REMEMBER something across steps -- altitude hold's
 * captured altitude is the first, and "the altitude at some past tick" appears
 * in no other argument here. So the assist is a reducer rather than a plain
 * function: memory in, `{ controls, memory }` out, with the advanced memory
 * stored back into the returned `World`. `M` is a type parameter and `sim/`
 * never looks inside it, which is what lets the memory live in `World` without
 * `sim/` learning anything about assists (spec §3's boundary, and the reason
 * `assists/` can keep importing `sim/` rather than the reverse).
 *
 * Threading it, rather than letting the assist keep a closure over a mutable
 * local (which is what Plan 3 shipped), buys two things a closure cannot:
 *  - a `World` is now a COMPLETE description of the flight. Serialise it,
 *    rebuild it, carry on, and the trajectory is identical -- which a closure
 *    breaks silently, because the captured altitude is not in the object being
 *    saved. `tests/assists/worldMemory.test.ts` measures both halves.
 *  - N airplanes get N memories by construction rather than by every caller
 *    remembering to build one runner each (the combat plan).
 */
export type Assist<M> = (
  state: AircraftState,
  spec: AircraftSpec,
  raw: Controls,
  dt: number,
  memory: M,
) => AssistResult<M>

/** What an `Assist` hands back: what to fly this step, and what to remember
 *  for the next one. */
export interface AssistResult<M> {
  readonly controls: Controls
  readonly memory: M
}

/** No-op default: hands the stepper exactly what the pilot commanded and
 *  remembers exactly what it was told, so every existing call site and test
 *  that predates Plan 3 is unaffected. */
const identityAssist = <M>(
  _state: AircraftState,
  _spec: AircraftSpec,
  raw: Controls,
  _dt: number,
  memory: M,
): AssistResult<M> => ({ controls: raw, memory })

/**
 * Recorded once, on the first step where the airplane is at or below the
 * ground under it, and never cleared on later steps. `advance` applies no
 * bounce and no rest dynamics to the airplane's position or velocity once
 * this is set -- and for THIS airplane it ends the flight: `advance` skips an
 * aircraft entity that already carries one, so that entity's `state`,
 * `previous` and `impact` pass through every later step untouched. It stops
 * nothing else (spec §4): the other aircraft and the ships run on, and the
 * PLAYER's flight ends because the frame (`nextFrameState` in
 * src/render/frame.ts) holds the world at zero elapsed time while
 * `playerAircraft(world).impact` is set. `surface` and `kind` below are what
 * Plan 10 adds on top of that stop.
 */
export type Impact = {
  /** `SimContext.tick` of the step that first satisfied the impact test. */
  readonly tick: number
  /** The airplane's position on that step, world metres, +Y up. */
  readonly position: Vec3
  /** `velocity.y` on that step -- negative for a normal descent into terrain,
   *  but not asserted to be: an airplane can be at or below the ground with
   *  a non-negative vertical speed (e.g. it spawned there), and recording the
   *  true value rather than clamping it is what lets a caller tell the two
   *  cases apart later. */
  readonly verticalSpeedMps: number
  /** `groundUnder(terrain, decks, position.x, position.z)!.heightM` at the
   *  moment of impact -- a DECK's height when the airplane hit one, not the
   *  terrain's (Plan 8). Captured rather than left for the caller to
   *  recompute, since a later step's ground at the SAME (x, z) can differ
   *  once the airplane has moved on -- and a deck moves even when it has
   *  not. */
  readonly groundHeightM: number
  /** Which surface this was: `groundUnder`'s own `surface`, which is 'deck'
   *  for a carrier's flight deck and `surfaceAt(heightM)` elsewhere. */
  readonly surface: ContactSurface
  /** Whether the airplane survived it. See `contactOutcome`: the gear and the
   *  sink rate both enter, so a gentle arrival on wheels is not an impact at
   *  all and never reaches this type. */
  readonly kind: ContactKind
}

/** Unique within a World, assigned by the scenario, never an array index: an
 *  index changes when an entity is removed (a shot-down aircraft, Plan 6), an
 *  id does not. `createWorldOf` rejects duplicates. */
export type EntityId = string

/**
 * One airplane. Everything `World` used to hold for its single airplane
 * (spec §2's table) lives here now, for exactly the reasons those fields'
 * comments gave: `controls` is held per `advance` call, `assistMemory` is
 * per airplane by construction, `impact` survives serialization.
 */
export interface AircraftEntity<M = undefined> {
  readonly id: EntityId
  /** The airplane's coefficient set. On the entity, not in `advance`'s
   *  parameter list: the design has later plans add fields to the world and
   *  its entities precisely so that `advance`'s signature never grows. */
  readonly spec: AircraftSpec
  readonly state: AircraftState
  /** The tick before `state`. Equal to it until the first step runs. */
  readonly previous: AircraftState
  /**
   * What the pilot is commanding, held constant for every step of one
   * `advance` call. The frame sets the player's (`withControls`); a Plan 7
   * pilot will set the others'.
   *
   * On the entity rather than in `advance`'s parameter list (whole-branch
   * review, finding I-5) for the reason that finding gave: the N-entity AI is
   * exactly the change `SimContext` was introduced to avoid having to make at
   * every call site, and it would have hit that parameter. The caller sets it
   * by rebuilding the world (`withControls`), which keeps `World` immutable
   * and `advance` a pure function of one object.
   */
  readonly controls: Controls
  /**
   * Whatever the injected `Assist` asked to remember, as of the last fixed
   * step run. `sim/` treats this as opaque -- it is carried from step to step
   * and stored back here, never read.
   *
   * In the ENTITY rather than in a closure the caller holds (Plan 3's shape,
   * replaced here) so that the `World` holding it is the WHOLE flight: a
   * world written to disk and read back flies on identically, where a
   * closure's contents would be silently missing from the save. This is also
   * what that comment promised the combat plan and Plan 12 delivered -- N
   * airplanes are N entity records, each with its own memory field, so two
   * airplanes cannot share one captured altitude even if they share an
   * assist function.
   *
   * "Written to disk and read back" means under a serialiser that preserves
   * this object's actual runtime types, not any serialiser -- `World.terrain`
   * is the field that makes the difference concrete: its
   * `heightsDm` is an `Int16Array`, which `structuredClone` reproduces
   * exactly (verified by `tests/sim/loop.test.ts`'s "survives
   * structuredClone" test -- the same algorithm IndexedDB and `postMessage`
   * use per spec, though nothing here exercises those two). Plain
   * `JSON.stringify`/`JSON.parse` does not: a typed array survives JSON only
   * as an object of numeric-string keys, which fails `instanceof Int16Array`
   * and has no `.length`, so `createTerrainField`'s own validation would
   * reject it on read-back.
   *
   * `undefined` for a world flown with no assist, which is what the default
   * type parameter says.
   */
  /**
   * **Currently always `undefined`, and deliberately kept.** Altitude hold was
   * the only assist with memory and was deleted on 2026-09-17 (Mark's call: he
   * had never asked for it -- it arrived as the master spec's "combat trim" --
   * and had already defaulted it off as unrealistic). So this channel, and
   * `Assist<M>`'s generic, are an extension point with nothing using them.
   *
   * They stay because the next stateful assist will want them and because
   * removing the generic would touch every `World` in the codebase for no
   * behaviour. What went with altitude hold is the only test that ever
   * exercised this: `tests/assists/worldMemory.test.ts`, which proved two
   * airplanes sharing one `assistFor` result cannot share a captured value.
   * **If a stateful assist is added, restore that file from git history rather
   * than writing a new one** -- it was built around a 25 m/s descent
   * specifically so a lost memory was visible, after a 6 m/s climb was tried
   * and separated a correct implementation from a broken one by only 2 m.
   */
  readonly assistMemory: M
  /**
   * This airplane's first contact, never overwritten. Per entity: one
   * airplane crashing does not stop the war (spec §4).
   *
   * In the entity, not a value `advance` merely returns alongside the world,
   * for the same completeness reason `assistMemory` is here rather than in a
   * caller's closure (see that field's comment): a world written to disk and
   * read back must still remember that this flight already crashed, not
   * silently re-open the possibility of a second "first" impact.
   */
  readonly impact: Impact | null
  /**
   * Spawned on its wheels rather than airborne, so this airplane's altitude is
   * a placeholder until real terrain arrives.
   *
   * Read by two places in `src/render/frame.ts` (Task 5): `initialFrameStateFor`
   * derives `FrameState.groundSpawn` from `world.aircraft.some((a) => a.parked)`
   * (any parked aircraft holds the whole world for terrain, not just the
   * player) and `gearDown` from `playerAircraft(world).parked` alone; and
   * `settleOnTerrain` iterates every entity with `parked` set, not the player
   * only, so a scenario with several parked aircraft -- a chocked wingman
   * beside the one the pilot flies -- settles all of them onto the real ground
   * the instant it arrives, rather than leaving the others at their
   * placeholder altitude.
   */
  readonly parked: boolean
  /**
   * Static Plan 7 pilot assignment. Its target is resolved from the common
   * start-of-tick aircraft snapshot before any entity moves; absent means the
   * caller-owned `controls` remain authoritative.
   */
  readonly pilot?: PilotAssignment | null
}

/** A ship: kinematics on a waypoint loop, no aerodynamics, no impact. Steps
 *  BEFORE the aircraft within a tick (spec §3.4) so a future deck (Plan 8)
 *  reads the pose the ship has at the END of the tick. */
export interface ShipEntity {
  readonly id: EntityId
  readonly spec: ShipSpec
  readonly state: ShipState
  readonly previous: ShipState
  readonly orders: ShipOrders
}

export interface World<M = undefined> {
  readonly combat: CombatState
  /**
   * The world's clock. Every entity's `state.tick` equals this after a step;
   * `SimContext.tick` is `tick + 1`.
   *
   * It is the ONLY clock: `advance` counts from here, not from the tick of
   * whichever airplane it happens to be stepping. A world therefore starts at
   * 0 and `createWorldOf` requires every entity handed to it to be at tick 0
   * too -- it throws otherwise, because a world built at 0 from already-stepped
   * states would rewind every one of them on its first step.
   */
  readonly tick: number
  readonly aircraft: readonly AircraftEntity<M>[]
  readonly ships: readonly ShipEntity[]
  /** Strike targets derived once from `airfields` at world creation (spec
   *  §3.5): never stepped, so `advance` never reassigns this -- it stays
   *  the same reference for the whole flight. See `structures.ts`'s own
   *  docstring for why both friendly and enemy airfields are included. */
  readonly structures: readonly StructureEntity[]
  /** Which of `structures` count toward `RAZED` (spec §3.5: only structures
   *  at an `enemyAirfields` base). Computed once, alongside `structures`, by
   *  `createWorldOf` from its `enemyAirfields` parameter -- empty when that
   *  parameter is omitted, matching every world built before this field
   *  existed. `advance` threads this straight into `stepCombat`'s
   *  `enemyStructureIds` parameter every tick; `stepCombat` never learns
   *  where it came from. */
  readonly enemyStructureIds: ReadonlySet<string>
  /** The airplane the frame's keys drive and the camera follows. An id, not
   *  an index (see `EntityId`); present by construction. */
  readonly player: EntityId
  /** Static for the flight; in `World` because the landing report reads it
   *  and a World is a complete description of the flight. */
  readonly airfields: readonly Airfield[]
  /**
   * The ground every aircraft in this world can hit, or `null` for "no terrain
   * loaded". `sim/` may not import `tools/terrain/load.ts` (Node-only, and a
   * `src/sim/` file must load in a browser -- `.dependency-cruiser.cjs`,
   * `tests/architecture/boundary.test.ts`), so this arrives the same way
   * `Assist` does: the caller injects the value, `sim/` never learns where it
   * came from. In production that caller is the renderer, which has populated
   * a real field since Plan 10 (`src/render/main.ts`'s terrain-arrival
   * callback, through `withTerrain`); `null` is the pre-terrain state every
   * world starts in and the state most of the test suite, including the golden
   * trajectory, runs in throughout -- a world with neither a field NOR a
   * carrier deck under the airplane gets `null` from `groundUnder` and is
   * unaffected by the impact check entirely. `null` here alone is no longer
   * enough for that (Plan 8): a world whose `ships` carry a flight deck has
   * ground over the deck's rectangle whatever this field says, and the
   * impact check runs there.
   *
   * Carries an `Int16Array` (`TerrainField.heightsDm`), which is exactly the
   * case `assistMemory`'s comment above now qualifies: this field round-trips
   * under `structuredClone` but not under `JSON.stringify`/`JSON.parse` --
   * see that comment for why, and `tests/sim/loop.test.ts` for the pinned
   * assertion.
   */
  readonly terrain: TerrainField | null
  /** Scenario wind, the velocity of the air; `null` is calm. Static for the
   *  flight, in `World` because `advance` builds every `SimContext` from it. */
  readonly wind: Vec3 | null
  /** Unspent time, always in [0, DT). */
  readonly accumulatorSeconds: number
}

export interface AdvanceResult<M = undefined> {
  readonly world: World<M>
  /** Whole steps run, 0..MAX_STEPS_PER_FRAME. Identical to the steps OWED
   *  since Plan 12: an impact no longer breaks the loop partway through (an
   *  impacted aircraft is skipped and everything else sails on, spec §4), so
   *  there is no path left on which the two differ. */
  readonly stepsRun: number
  /**
   * Steps owed but discarded to break a spiral. Non-zero means simulated time
   * was skipped, so this session is definitely NOT reproducible from
   * (seed, input log) -- master spec §3's replay guarantee.
   *
   * Zero does NOT currently mean the converse (whole-branch review, I-5's
   * sibling I-4; corrected 2026-09-13). It says the fixed-step integrator ran
   * every tick it was owed, and that much is true. But the CONTROLS fed to
   * those ticks are ramped at frame rate, not at DT: `nextFrameState` calls
   * `controlsFromKeys(pressed, elapsedSeconds, prev.controls)` with the
   * animation-frame delta, and that function integrates toward the target over
   * `RAMP_SECONDS`. So 60 Hz and 144 Hz replaying the same key log reach
   * different deflections at the same tick, and diverge, with `droppedSteps`
   * zero throughout.
   *
   * Ruling R18 fixed this comment and deliberately did NOT move the ramp inside
   * the fixed step: that changes control feel, and nobody has flown this yet.
   * The architectural half is an open item in the design doc. It gets harder
   * every plan; no plan uses replay yet.
   */
  readonly droppedSteps: number
  /** Remainder as a fraction of a step: the renderer's interpolation factor. */
  readonly alpha: number
}

/** The id `createWorld` gives its one airplane, and the one the frame drives. */
export const PLAYER_ID: EntityId = 'player'

/**
 * The one-airplane world every pre-Plan-12 test builds: id `PLAYER_ID`, no
 * ships, no airfields, not parked.
 *
 * Overloaded rather than given a defaulted generic parameter: `assistMemory`
 * has no sensible value to invent for an arbitrary `M`, and writing one
 * (`undefined as M`) would be a lie the type system then believes. Omitting
 * it says exactly what it means -- this world is flown with no assist, so
 * there is nothing to remember.
 */
export function createWorld(
  spec: AircraftSpec,
  aircraft: AircraftState,
  controls: Controls,
): World<undefined>
export function createWorld<M>(
  spec: AircraftSpec,
  aircraft: AircraftState,
  controls: Controls,
  assistMemory: M,
): World<M>
export function createWorld<M>(
  spec: AircraftSpec,
  aircraft: AircraftState,
  controls: Controls,
  assistMemory?: M,
): World<M | undefined> {
  return createWorldOf<M | undefined>({
    aircraft: [
      {
        id: PLAYER_ID,
        spec,
        state: aircraft,
        previous: aircraft,
        controls,
        assistMemory,
        impact: null,
        parked: false,
      },
    ],
    player: PLAYER_ID,
  })
}

/**
 * The general constructor: the scenario's, and the only way a world with more
 * than one entity is built. Rejects a duplicate id, a `player` that names no
 * aircraft, and an entity that is not at tick 0 (`World.tick`) -- here rather
 * than at the first lookup or the first step, so that `playerAircraft` is
 * total, an id collision cannot silently shadow an entity for a whole flight,
 * and no entity can be rewound by the world's own clock.
 */
export function createWorldOf<M>(parts: {
  readonly aircraft: readonly AircraftEntity<M>[]
  readonly ships?: readonly ShipEntity[]
  readonly player: EntityId
  readonly airfields?: readonly Airfield[]
  readonly terrain?: TerrainField | null
  readonly wind?: Vec3 | null
  /** Per-aircraft starting stores, by id (Task 7). An aircraft with no entry
   *  here gets `emptyStores`, matching every call site's behavior before
   *  this parameter existed -- `worldFromScenario` is the only caller that
   *  ever passes a non-empty entry, and only for the scenario's player. */
  readonly stores?: Readonly<Record<string, StoresState>>
  /** Which of `airfields` are hostile (Task 7 fix, spec §3.5): decides
   *  `World.enemyStructureIds`, the set `advance` narrows `stepCombat`'s
   *  `RAZED` counting to. Absent means none are -- matching every world
   *  built before this parameter existed, and every call site but
   *  `worldFromScenario`. */
  readonly enemyAirfields?: readonly string[] | undefined
}): World<M> {
  const ships = parts.ships ?? []
  const seen = new Set<EntityId>()
  for (const e of [...parts.aircraft, ...ships]) {
    if (seen.has(e.id)) throw new Error(`createWorldOf: duplicate entity id "${e.id}"`)
    seen.add(e.id)
    // A new world's clock is 0 (below), and `advance` steps every entity from
    // THAT clock rather than from the entity's own tick -- so an entity handed
    // in already stepped would silently have its tick rewound to 1 on the
    // first step, and the world clock and `state.tick` would disagree from
    // then on for that entity alone. Rejected here, where the scenario can be
    // named, rather than surfacing later as a tick that went backwards (which
    // the audio cue reads as a whole new flight).
    if (e.state.tick !== 0) {
      throw new Error(`createWorldOf: entity "${e.id}" is at tick ${e.state.tick}, but a new world starts at 0`)
    }
  }
  if (!parts.aircraft.some((a) => a.id === parts.player)) {
    throw new Error(`createWorldOf: player "${parts.player}" is not one of the aircraft`)
  }
  for (const a of parts.aircraft) {
    if (a.pilot == null) continue
    if (a.pilot.target === a.id) {
      throw new Error(`createWorldOf: pilot "${a.id}" cannot target itself`)
    }
    if (!parts.aircraft.some((candidate) => candidate.id === a.pilot!.target)) {
      throw new Error(`createWorldOf: pilot "${a.id}" targets missing aircraft "${a.pilot.target}"`)
    }
  }
  const structures = buildStructures(parts.airfields ?? [], parts.terrain ?? null)
  const enemyAirfields = parts.enemyAirfields ?? []
  const enemyStructureIds = new Set(structures.filter(s => enemyAirfields.includes(s.airfield)).map(s => s.id))
  return {
    tick: 0,
    combat: createCombat(
      parts.aircraft,
      // Task 7: the real per-aircraft loadout, threaded from
      // `worldFromScenario`'s `loadout` parameter through `parts.stores`.
      // An aircraft with no entry (every call site that predates Task 7,
      // and every non-player aircraft `worldFromScenario` builds) gets
      // `emptyStores`, exactly what this line always returned before.
      Object.fromEntries(parts.aircraft.map(a => [a.id, parts.stores?.[a.id] ?? emptyStores])),
      ships.map(s => ({ id: s.id, hullHp: s.spec.hullHp })),
      structures.map(s => ({ id: s.id, hp: s.hp })),
    ),
    aircraft: parts.aircraft,
    ships,
    structures,
    enemyStructureIds,
    player: parts.player,
    airfields: parts.airfields ?? [],
    terrain: parts.terrain ?? null,
    wind: parts.wind ?? null,
    accumulatorSeconds: 0,
  }
}

export function aircraftById<M>(world: World<M>, id: EntityId): AircraftEntity<M> | undefined {
  return world.aircraft.find((a) => a.id === id)
}

/** Present by construction: `createWorldOf` refuses a world without it. */
export function playerAircraft<M>(world: World<M>): AircraftEntity<M> {
  const p = aircraftById(world, world.player)
  if (p === undefined) throw new Error(`world has no aircraft "${world.player}"`)
  return p
}

/** Rebuilds the world with one aircraft entity patched and every other entity
 *  the SAME object, so a consumer can tell what this call touched by identity. */
function withAircraft<M>(
  world: World<M>,
  id: EntityId,
  patch: (a: AircraftEntity<M>) => AircraftEntity<M>,
): World<M> {
  let found = false
  const aircraft = world.aircraft.map((a) => {
    if (a.id !== id) return a
    found = true
    return patch(a)
  })
  if (!found) throw new Error(`world has no aircraft "${id}"`)
  return { ...world, aircraft }
}

/** What the frame does every frame: the pilot's new command, nothing else. */
export const withControls = <M>(world: World<M>, id: EntityId, controls: Controls): World<M> =>
  withAircraft(world, id, (a) => ({ ...a, controls }))

/** Replaces `state` AND `previous`: this is a respawn or a DEV spawn
 *  override, not a step, and the renderer must not interpolate from wherever
 *  the airplane used to be. */
export const withAircraftState = <M>(world: World<M>, id: EntityId, state: AircraftState): World<M> =>
  withAircraft(world, id, (a) => ({ ...a, state, previous: state }))

/**
 * One aircraft, one tick. This is today's loop body, verbatim in call order:
 * `assist` before `stepper`, then the impact test on the result. A crashed
 * entity is returned unchanged -- `previous` was set to `state` on the tick
 * it hit, so the renderer interpolates to the exact contact point.
 */
function stepAircraftEntity<M>(
  entity: AircraftEntity<M>,
  tick: number,
  terrain: TerrainField | null,
  wind: Vec3 | null,
  decks: readonly Deck[],
  stepper: Stepper,
  assist: Assist<M>,
  damage: Damage,
  stores: StoresState,
): AircraftEntity<M> {
  if (damage.destroyedAt !== null) return entity
  if (entity.impact !== null) return entity

  // `assist` runs once per fixed STEP, here, and BEFORE `stepper` -- not
  // once per `advance` call and not on the entity's `controls` directly.
  // Hoisting it above the step loop would run it once per frame instead of
  // once per step, at the frame's dt rather than DT, reproducing exactly the
  // frame-rate dependence `AdvanceResult.droppedSteps`'s doc already flags
  // as open item 5's defect for the input ramp. Running it inside means an
  // assist reacting to the airplane's stall margin sees the STATE that
  // margin actually applied to on this tick (`entity.state` as of THIS step,
  // which is stale from the second step of a multi-step frame onward unless
  // the entity is rebuilt each step -- and it is).
  //
  // The state handed to `assist` is the AIR-RELATIVE one (whole-branch review
  // of Plan 8, 2026-09-19), for the same reason `step` builds `air` before
  // touching an aerodynamic quantity: both assists read the airflow, not the
  // ground track. `autoRudder` takes its sideslip from `state.velocity` and
  // `stallLimiter` its angle of attack from `angleOfAttack(state)`, so in a
  // crosswind a perfectly coordinated airplane read as sideslipping by the
  // crosswind's own angle and the rudder assist fought it every tick. Only
  // the VELOCITY differs: `position` and `attitude` are world-frame facts
  // that the airmass does not move, and an assist returns controls and
  // memory only, so nothing this state touches reaches the integration.
  // With no wind this IS `entity.state`, the same object, so the calm path
  // is bit-identical (`tests/assists/windFrame.test.ts` pins the identity).
  const airState = wind == null ? entity.state : { ...entity.state, velocity: airVelocity(entity.state, wind) }
  const assisted = assist(airState, entity.spec, entity.controls, DT, entity.assistMemory)
  let current = stepper(storesSpec(damagedSpec(entity.spec, damage), stores), entity.state, assisted.controls, { dt: DT, tick, terrain, wind, decks })
  if (damage.fuel < 1 && entity.spec.combat !== undefined) {
    current = { ...current, fuelKg: Math.max(0, current.fuelKg - (1 - damage.fuel) * entity.spec.combat.fuelLeakKgPerS * DT) }
  }

  // Checked after EVERY step in a multi-step frame, not just the last one --
  // a frame that owes several steps (a stalled tab, `MAX_STEPS_PER_FRAME` up
  // to 5) can cross the ground partway through, and checking only the final
  // state would silently skip that tick's impact, moving `impact.tick` and
  // `impact.position` to a later, already-through-the-ground state.
  // `groundUnder` returning `null` ("no terrain and no deck here") short-
  // circuits this block entirely on the (overwhelmingly common, pre-Task-8)
  // no-terrain path, and the early return at the top of this function makes
  // the first recorded impact permanent, matching `AircraftEntity.impact`'s
  // "never overwritten". `<=`, not `<`: `ground.heightM` is a real number
  // for any finite (x, z), including exactly on the ground, and a strict `<`
  // would let the airplane sit buried at exactly ground level forever
  // with no impact ever recorded (proved to bite in this task's commit).
  // `current.position.y` cannot be NaN here without `stepper` itself
  // already having produced one (spec §9's hazard, and this check does not
  // introduce a new path to it: a NaN position makes this comparison false
  // by IEEE 754 rules, so it is read-only and skips silently rather than
  // fabricating an impact).
  //
  // `&& !supportedContact(...)` (Task 5b): an airplane resting on its
  // wheels is on the ground on purpose, and this geometric `<=` test alone
  // cannot tell that apart from a crash -- `step` had already clamped a
  // supported airplane to exactly `ground.heightM`, so without this guard
  // every tick of a normal landing or a parked take-off roll re-triggered
  // this branch and ended the flight, making take-off impossible. Plan 8
  // passes `ground.surface`/`ground.velocity` through so a deck's own
  // velocity is what a deck arrival is judged and rested relative to.
  //
  // `current.position.y` DELIBERATELY, not `current.position.y -
  // spec.gear.heightM` (Task 15): `position.y` is the airplane's BODY
  // ORIGIN, and `restOnSurface`/`onGround`/`supportedContact` all now
  // compare the GEAR-OFFSET height for CONTACT purposes (a resting
  // airplane's origin sits `spec.gear.heightM` above the ground it is
  // parked on). This check answers a different question -- has the
  // airframe itself, the thing `position` actually names, passed through
  // the terrain -- and the answer to that does not depend on where the
  // wheels are: an origin below the ground is a crash whatever the gear is
  // doing (Plan 10's geometric test, unchanged by Task 15). Do not "fix"
  // this asymmetry by subtracting the gear offset here; that would let an
  // airplane belly-flop into the runway with its wheels still notionally
  // above ground and have it read as a normal landing.
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
      // `previous` follows `current` so the renderer interpolates to exactly
      // the point of contact whatever `alpha` is, the same convention
      // `createWorld` uses before any step has run. The entity is then
      // skipped by every later step (the early return above), which is what
      // stops it at the contact point now that the step loop no longer breaks.
      return { ...entity, state: current, previous: current, assistMemory: assisted.memory, impact }
    }
  }
  return { ...entity, state: current, previous: entity.state, assistMemory: assisted.memory }
}

/** `controls` with the one-shot release pulse REMOVED, every held control --
 *  `fire` above all -- left exactly as it was. Removed rather than set false
 *  because `Controls.dropBomb` is documented as present only when it is
 *  asking for a release. See its only caller, in `advance`. */
function spendRelease(controls: Controls): Controls {
  const spent: { -readonly [K in keyof Controls]: Controls[K] } = { ...controls }
  delete spent.dropBomb
  delete spent.fireRockets
  return spent
}

export function advance<M>(
  world: World<M>,
  elapsedSeconds: number,
  stepper: Stepper = step,
  assist: Assist<M> = identityAssist,
): AdvanceResult<M> {
  // A tab suspend, a debugger pause or a clock adjustment can hand us a delta
  // that is negative or not a number; banking either would poison the
  // accumulator permanently, so those are dropped here. A delta that is
  // positive and finite but enormous is instead clamped to
  // MAX_ELAPSED_SECONDS -- see that constant for why clamping the input,
  // rather than anything computed from it, is what keeps `owed`, `alpha`
  // and `accumulatorSeconds` all well-formed together.
  const elapsed =
    Number.isFinite(elapsedSeconds) && elapsedSeconds > 0
      ? Math.min(elapsedSeconds, MAX_ELAPSED_SECONDS)
      : 0

  // No time in, no steps out, and the SAME object back (spec §4). This is
  // what makes a held world -- paused, waiting for terrain, or the player
  // having crashed -- bit-identical whether it is handed one frame or a
  // thousand: the accumulator cannot creep, and an accumulator within
  // STEP_EPSILON of DT cannot round up into a step. It replaced the
  // impact early-return that used to live here: with several aircraft, one
  // crashing must not stop the others, so the hold is the frame's decision
  // (`nextFrameState`) and this function stops nothing.
  if (elapsed === 0) {
    return { world, stepsRun: 0, droppedSteps: 0, alpha: world.accumulatorSeconds / DT }
  }

  let banked = world.accumulatorSeconds + elapsed
  const owed = Math.floor(banked / DT + STEP_EPSILON)
  const owedSteps = Math.min(owed, MAX_STEPS_PER_FRAME)
  const droppedSteps = owed - owedSteps

  let tick = world.tick
  let aircraft = world.aircraft
  let ships = world.ships
  const structures = world.structures
  let combat = world.combat
  for (let i = 0; i < owedSteps; i++) {
    tick += 1
    // Ships first (spec §3.4): exogenous kinematics, reading nothing else --
    // except a destroyed ship's own orders, overridden here to hold position
    // and heading rather than sail on with no hull left (Task 6 is what can
    // actually destroy one; this reads last tick's `combat.ships`, i.e. the
    // value `combat` still carries from the PREVIOUS iteration, before this
    // iteration's `stepCombat` runs below).
    ships = ships.map((s) => {
      const dmg = combat.ships[s.id]
      const orders = dmg && dmg.destroyedTick !== null
        ? { waypoints: [{ x: s.state.position.x, z: s.state.position.z }], speedMps: 0 }
        : s.orders
      return { ...s, previous: s.state, state: stepShip(s.spec, s.state, orders, { dt: DT, tick }) }
    })
    // Decks, from the ships that have ALREADY moved this tick (spec §3.4):
    // an airplane on deck reads the pose the ship has at the end of the tick.
    const decks = decksOf(ships)
    combat = { ...combat, aircraft: Object.fromEntries(aircraft.map(a => {
      const rec = combat.aircraft[a.id]!
      return [a.id, { ...rec, damage: ageDamage(a.spec, rec.damage, DT) }]
    })) }
    // Every AI reads this SAME start-of-tick array. Commands are derived before
    // any aircraft is stepped, so reversing the entity array cannot let one
    // pilot see another aircraft one tick into the future (entities design §3).
    const aircraftAtStart = aircraft
    aircraft = aircraftAtStart.map((a) => {
      const record = combat.aircraft[a.id]!
      let commanded = a
      if (a.pilot != null && a.impact === null && record.damage.destroyedAt === null) {
        const target = aircraftAtStart.find((candidate) => candidate.id === a.pilot!.target)
        // `createWorldOf` rejects this state. The guard keeps a manually edited
        // or future entity-removing world finite instead of fabricating a target.
        if (target !== undefined) {
          const nowS = tick * DT
          let decision = a.pilot.decision
          if (nowS >= decision.nextRescoreS) {
            const facts = deriveFacts(
              a, target,
              1 - record.damage.structure,
              a.state.fuelKg / a.spec.mass.fuelCapacityKg,
            )
            decision = { maneuver: decideManeuver(facts, a.pilot.skill), nextRescoreS: nowS + a.pilot.skill.reactionS }
          }
          commanded = { ...a, pilot: { ...a.pilot, decision }, controls: maneuverControls(a, target, decision.maneuver) }
        }
      }
      return stepAircraftEntity(
        commanded, tick, world.terrain, world.wind, decks, stepper, assist,
        record.damage, record.stores,
      )
    })
    combat = stepCombat(combat, aircraft, ships, structures, world.terrain, world.wind, decks, tick, DT, world.enemyStructureIds)
    // `dropBomb`/`fireRockets` are a ONE-SHOT pulse: `frame.ts` edge-triggers
    // them once per RENDERED frame, but this loop can run up to
    // MAX_STEPS_PER_FRAME substeps against that one frame's controls. Nothing
    // else consumes the pulse, so without this a hitch that owes three ticks
    // would release three bombs -- and drain three stores -- from a single
    // key-down. Spend it here, on the substep that just ran, so every later
    // substep of THIS call sees it gone. Only the pulse: `fire` is a HELD
    // level that must be re-read every substep, and clearing it would stop
    // the guns mid-frame. Nothing leaks into the next call either -- the
    // render loop rebuilds `controls` before every `advance`.
    aircraft = aircraft.map((a) =>
      a.controls.dropBomb === undefined && a.controls.fireRockets === undefined
        ? a
        : { ...a, controls: spendRelease(a.controls) })
  }

  // Discarded steps have their time discarded with them; otherwise the debt
  // survives into the next call and the cap achieves nothing.
  banked -= owed * DT
  if (banked < 0) banked = 0 // the epsilon can leave a rounding-sized negative

  return {
    world: { ...world, tick, aircraft, ships, structures, combat, accumulatorSeconds: banked },
    stepsRun: owedSteps,
    droppedSteps,
    alpha: banked / DT,
  }
}
