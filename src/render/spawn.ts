import { createState, type AircraftState } from '../sim/flight/state.js'
import { qFromAxisAngle, qIdentity } from '../sim/math/quat.js'
import { v3, type Vec3 } from '../sim/math/vec3.js'

/** The three query parameters this reads, in x/y/z order. Exported so the
 *  test can assert the names it builds URLs from are the names that are
 *  parsed, rather than restating three strings that could drift. */
export const SPAWN_PARAMS = ['spawnX', 'spawnY', 'spawnZ'] as const

/**
 * The spawn position for this page load: `fallback`, with any of
 * `?spawnX=`, `?spawnY=`, `?spawnZ=` (world metres, +x east, +y up, +z south)
 * overriding one component.
 *
 * `fallback` rather than a module constant (Plan 12): where a flight starts
 * by default lives in content (`content/scenarios/free-flight.json`, which
 * parks the player at `content/bases/tacloban.json`'s runway center), not in
 * this file. Since Task 7 `main.ts` passes exactly that -- the parked
 * position of the player entity `worldFromScenario` built -- so this
 * function's `fallback` is the real spawn, not a literal standing in for one,
 * and there is no second place where "where a flight starts" is written
 * down.
 *
 * **Why this exists, since a URL that moves the airplane is otherwise a
 * cheat.** Tier 2 has to fly over Leyte, and Leyte is not where the airplane
 * starts: the nearest land to the world origin is 23.1 km away, which is
 * three minutes at the spawn's 120 m/s and far past any test timeout. The
 * alternatives were worse. A setter on `window.__ww2` would be a second write
 * path into a live `FrameState`, bypassing `nextFrameState` -- the precise
 * thing `diagnostics.ts` argues against for the assists, and there is no
 * keyboard path to fall back on here. A second HTML entry point would be a
 * second copy of `boot`. This is instead an INPUT to the one existing boot
 * path: `main.ts` patches the player entity of the world the scenario built
 * (`withAircraftState`, `buildWorld`), and nothing downstream can tell where
 * the number came from.
 *
 * `main.ts` calls this behind `import.meta.env.DEV`, which Vite replaces with
 * the literal `false` in a production build, so the query string is inert in
 * anything that ships -- the same guard `__ww2` and `stepChecked` use.
 *
 * **A present-but-unparseable parameter throws rather than falling back.** A
 * silent fallback would put the airplane back at `fallback` -- parked at
 * Tacloban, not wherever the test asked for -- and a terrain test would then
 * report zero validation errors because it never saw the terrain it meant to
 * fly over -- indistinguishable from a passing run, which is the same trap
 * `adapter.spec.ts`'s `KeyC` check exists to close. `main.ts` routes the
 * throw to the failure screen, so it is visible rather than a console line.
 */
export function spawnPositionFromQuery(search: string, fallback: Vec3): Vec3 {
  const params = new URLSearchParams(search)
  const [x, y, z] = SPAWN_PARAMS.map((name, i) => {
    const raw = params.get(name)
    if (raw === null) return [fallback.x, fallback.y, fallback.z][i]!
    const value = Number(raw)
    // `Number('')` is 0 and `Number(' ')` is 0, which would silently accept
    // `?spawnY=` as "sea level" -- so the emptiness check is separate from
    // the finiteness one rather than folded into it.
    if (raw.trim() === '' || !Number.isFinite(value)) {
      throw new Error(`spawn: ${name}=${JSON.stringify(raw)} is not a finite number`)
    }
    return value
  }) as [number, number, number]
  return v3(x, y, z)
}

/**
 * Whether the query string carries any of `SPAWN_PARAMS` -- i.e. whether the
 * page was asked to start somewhere other than the default spawn.
 *
 * `main.ts` uses this to decide whether to fly the override at all (its
 * `override` const) without re-parsing the query string a second way that
 * could disagree with `spawnPositionFromQuery`'s own parsing -- reading
 * `SPAWN_PARAMS` here, rather than three string literals, is what keeps a
 * future rename of one of them from silently splitting the two functions'
 * idea of "was this overridden" apart.
 *
 * Deliberately "any of the three", not "all three": a partial override (e.g.
 * `?spawnY=600` alone, `tests/e2e/ocean.spec.ts`) still means the caller
 * wanted something other than the parked default, even though the other two
 * components fall back to the default's.
 */
export function hasSpawnOverride(search: string): boolean {
  const params = new URLSearchParams(search)
  return SPAWN_PARAMS.some((name) => params.has(name))
}

/**
 * The airplane `main.ts` boots with: parked at `position` facing down the
 * runway, or already flying, according to the one `groundSpawn` boolean.
 *
 * **Why this is a function and not three ternaries at the call site.** Until
 * 2026-09-17 it was three -- `velocity: groundSpawn ? v3(0,0,0) : v3(120,0,0)`,
 * `gearFraction: groundSpawn ? 1 : 0`, and a flat `attitude: qIdentity()` --
 * inline in `main.ts`'s `createState` call, which no Tier 1 test can reach.
 * The attitude was the one that rotted: it predates Task 14 moving the spawn
 * onto a runway, and it was still correct for the airborne spawn it was
 * written for, which is why nothing flagged it. Three copies of a condition
 * are three chances to update two of them. `frame.ts` owns the
 * camera-relative arithmetic for the same reason.
 *
 * An AIRBORNE spawn is deliberately left byte-for-byte as it was: 120 m/s due
 * east, gear retracted, wings level. Tier 2's terrain and ocean specs fly
 * `?spawnX/Y/Z` paths chosen against that heading (`tests/e2e/terrain.spec.ts`
 * picks a point due west of Tacloban), so turning those north along with the
 * parked one would move every Tier 2 flight path without any test saying so.
 *
 * `bodyRates` is not set here on purpose: since Task 8 it is a pure output of
 * `step`, recomputed every frame, and anything passed in is overwritten on
 * the first tick (see `AircraftState.bodyRates`).
 *
 * The parked attitude below is the literal `parkedAttitude(tacloban)` would
 * produce (`src/sim/world/airfields.ts`) -- north, down the strip, wings
 * level -- but cannot actually call it: that function takes an `Airfield`,
 * and this one has no airfield to hand it, only a bare position.
 *
 * **Since Task 7, `main.ts` reaches only the `groundSpawn: false` branch**,
 * and only for a DEV `?spawnX/Y/Z` override
 * (`initialAircraftState(spawnPosition, false)` inside `buildWorld`). A
 * normal production boot never calls this function at all: the parked
 * airplane comes from `worldFromScenario`, which sets each parked entity's
 * attitude from the real airfield record. The parked branch here is therefore
 * reached only by tests that call this function directly, and it is kept
 * because those tests are the one-airplane Tier 1 cases `initialFrameState`
 * still serves -- not because anything that ships uses it.
 */
export function initialAircraftState(position: Vec3, groundSpawn: boolean): AircraftState {
  return createState({
    position,
    velocity: groundSpawn ? v3(0, 0, 0) : v3(120, 0, 0),
    // Parked: pointing down the strip. Flying: the pre-Task-14 identity, whose
    // nose is +X, i.e. east -- which is the direction the 120 m/s above is in.
    attitude: groundSpawn ? qFromAxisAngle(v3(0, 1, 0), Math.PI / 2) : qIdentity(),
    // Gear already extended rather than mid-travel, so `supportedContact`
    // (src/sim/ground.ts) reads the wheels as carrying the airplane the
    // instant real terrain lands.
    gearFraction: groundSpawn ? 1 : 0,
  })
}

/**
 * `?scenario=<id>`: which `content/scenarios/<id>.json` to boot (Plan 8).
 *
 * Reaches production now (corrected: this used to be DEV-only, like
 * `SPAWN_PARAMS` still is). The title screen's scenario picker
 * (`titleScreen.ts`'s `SCENARIO_OPTIONS`) is a real, shipped UI over this
 * exact parameter -- picking a scenario there navigates to `?scenario=<id>`
 * rather than swapping entities in place (main.ts's `onNewGame` has the
 * reasoning), so this query string is the actual mechanism, not a DEV
 * shortcut standing in for one. What makes that safe in production is
 * `isKnownScenarioId` (titleScreen.ts): `scenarioIdFromQuery` below only
 * checks the id is well-FORMED, and `main.ts` separately rejects anything
 * well-formed that is not one of the five scenarios this build actually
 * ships, before any content fetch starts.
 */
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
