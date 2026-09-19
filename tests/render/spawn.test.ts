import { describe, it, expect } from 'vitest'
import { qFromAxisAngle, qIdentity, qRotate } from '../../src/sim/math/quat.js'
import { v3 } from '../../src/sim/math/vec3.js'
import {
  SCENARIO_PARAM,
  SPAWN_PARAMS,
  hasSpawnOverride,
  initialAircraftState,
  scenarioIdFromQuery,
  spawnPositionFromQuery,
} from '../../src/render/spawn.js'

/**
 * `spawn.ts` carries the `?spawnX/Y/Z` override Tier 2 uses to put the
 * airplane somewhere else entirely -- over Leyte at altitude, or over open
 * water -- and the pre-scenario spawn constructor `main.ts` still calls.
 * Where the airplane starts by DEFAULT is content now (Plan 12, Task 5):
 * `content/bases/tacloban.json`, tested in `tests/sim/world/airfields.test.ts`
 * and `tests/sim/scenario.test.ts`, not here. Tested here rather than only on
 * the GPU for the obvious reason -- it is pure -- and for a less obvious one:
 * a bug here does not make the Tier 2 terrain tests FAIL, it makes them pass
 * while flying over open water, which is the failure class this whole plan
 * keeps guarding against.
 */
const FALLBACK = v3(-29666, 1.9, -47605)

describe('hasSpawnOverride', () => {
  it('is false for an empty query string or one with unrelated parameters', () => {
    expect(hasSpawnOverride('')).toBe(false)
    expect(hasSpawnOverride('?')).toBe(false)
    expect(hasSpawnOverride('?debug=1&beaufort=6')).toBe(false)
  })

  it('is true if ANY of the three spawn parameters is present, even alone', () => {
    // Deliberately "any", not "all three" -- `tests/e2e/ocean.spec.ts` moves
    // only `spawnY` and still means "not the parked default".
    expect(hasSpawnOverride('?spawnX=0')).toBe(true)
    expect(hasSpawnOverride('?spawnY=600')).toBe(true)
    expect(hasSpawnOverride('?spawnZ=0')).toBe(true)
    expect(hasSpawnOverride('?spawnX=-45000&spawnY=100&spawnZ=-47605')).toBe(true)
  })

  it('reads the same SPAWN_PARAMS names spawnPositionFromQuery does', () => {
    // Guards the two functions' idea of "was this overridden" from drifting
    // apart if a parameter is ever renamed.
    for (const name of SPAWN_PARAMS) {
      expect(hasSpawnOverride(`?${name}=1`), name).toBe(true)
    }
  })
})

describe('spawnPositionFromQuery', () => {
  it('is the fallback when the query string is empty', () => {
    expect(spawnPositionFromQuery('', FALLBACK)).toEqual(FALLBACK)
    expect(spawnPositionFromQuery('?', FALLBACK)).toEqual(FALLBACK)
    // An unrelated parameter must not be read as a spawn coordinate.
    expect(spawnPositionFromQuery('?debug=1', FALLBACK)).toEqual(FALLBACK)
  })

  it('overrides each component independently, by its own parameter name', () => {
    // One component at a time, and each asserted against the OTHER two still
    // being the fallback: the bug this kills is an x/z transpose or a
    // copy-pasted `params.get('spawnX')` under the y branch, both of which
    // leave a test that only checks "all three at once" perfectly green.
    expect(spawnPositionFromQuery('?spawnX=-45000', FALLBACK)).toEqual({
      x: -45000,
      y: FALLBACK.y,
      z: FALLBACK.z,
    })
    expect(spawnPositionFromQuery('?spawnY=8000', FALLBACK)).toEqual({
      x: FALLBACK.x,
      y: 8000,
      z: FALLBACK.z,
    })
    expect(spawnPositionFromQuery('?spawnZ=-47605', FALLBACK)).toEqual({
      x: FALLBACK.x,
      y: FALLBACK.y,
      z: -47605,
    })
  })

  it('reads all three together, in any order, with a leading ? or without', () => {
    const expected = { x: -45000, y: 100, z: -47605 }
    expect(spawnPositionFromQuery('?spawnX=-45000&spawnY=100&spawnZ=-47605', FALLBACK)).toEqual(expected)
    expect(spawnPositionFromQuery('spawnZ=-47605&spawnX=-45000&spawnY=100', FALLBACK)).toEqual(expected)
  })

  it('accepts a negative, fractional and exponent-form coordinate', () => {
    // `-45000` and `-47605` are the real Tier 2 spawn; the rest are here
    // because `Number` accepts them and a hand-rolled parser might not.
    expect(spawnPositionFromQuery('?spawnX=-1.5&spawnY=1e3&spawnZ=+2', FALLBACK)).toEqual({ x: -1.5, y: 1000, z: 2 })
  })

  it('throws on a present-but-unparseable coordinate rather than falling back', () => {
    // The whole point: a silent fallback puts the airplane back at the
    // fallback -- parked at Tacloban, not wherever the test asked for --
    // where a terrain test reports zero validation errors because it never
    // saw the terrain it meant to fly over.
    for (const bad of ['', ' ', 'abc', 'NaN', 'Infinity', '1,5']) {
      expect(
        () => spawnPositionFromQuery(`?spawnY=${encodeURIComponent(bad)}`, FALLBACK),
        `spawnY=${JSON.stringify(bad)}`,
      ).toThrow(/spawnY/)
    }
  })

  it('names in SPAWN_PARAMS are the names it actually parses', () => {
    // Guards the one thing the tests above cannot: the exported list the
    // e2e helper builds URLs from drifting away from the strings this
    // function reads.
    expect(SPAWN_PARAMS).toEqual(['spawnX', 'spawnY', 'spawnZ'])
    for (const name of SPAWN_PARAMS) {
      expect(() => spawnPositionFromQuery(`?${name}=nonsense`, FALLBACK), name).toThrow(new RegExp(name))
    }
  })
})

/**
 * The three fields a spawn's KIND decides -- velocity, attitude and gear --
 * used to sit as three separate `groundSpawn ? ... : ...` ternaries inline in
 * `main.ts`'s `createState` call, where nothing could test them. They are one
 * decision, and three copies of a condition is three chances to update two of
 * them: the identity attitude among them was exactly that, left behind when
 * Task 14 moved the spawn onto a runway.
 *
 * Extracted here for the reason `frame.ts` gives for owning the
 * camera-relative arithmetic: coordinate and attitude logic in `main.ts` has
 * no tests, and both bugs the Plan 2 review found were of that shape.
 */
describe('initialAircraftState', () => {
  const at = v3(-29666, 1.673, -47605)

  it('parks a ground spawn: stopped, gear down, nose north', () => {
    const s = initialAircraftState(at, true)
    expect(s.position).toEqual(at)
    expect(s.velocity).toEqual(v3(0, 0, 0))
    expect(s.gearFraction).toBe(1)
    // The runway runs north-south, so a parked airplane faces along it --
    // the same quaternion `parkedAttitude(tacloban)` produces
    // (`tests/sim/world/airfields.test.ts` carries the measurements that
    // settle the axis).
    expect(s.attitude).toEqual(qFromAxisAngle(v3(0, 1, 0), Math.PI / 2))
    const nose = qRotate(s.attitude, v3(1, 0, 0))
    expect(nose.z).toBeCloseTo(-1, 12)
  })

  it('leaves an airborne override exactly as it was before Task 14', () => {
    // A DEV `?spawnX/Y/Z` spawn is already flying, and Tier 2's terrain and
    // ocean specs are written against this behavior: 120 m/s due EAST, gear
    // retracted, wings level. Turning those spawns north with the parked one
    // would silently move every Tier 2 flight path.
    const s = initialAircraftState(at, false)
    expect(s.velocity).toEqual(v3(120, 0, 0))
    expect(s.gearFraction).toBe(0)
    expect(s.attitude).toEqual(qIdentity())
  })

  it('never hands out a parked airplane with its gear up, or a flying one with it down', () => {
    // The property the three inline ternaries could violate and this cannot:
    // gear and velocity both read the ONE boolean.
    for (const groundSpawn of [true, false]) {
      const s = initialAircraftState(at, groundSpawn)
      const stopped = s.velocity.x === 0 && s.velocity.y === 0 && s.velocity.z === 0
      expect(stopped, `groundSpawn=${groundSpawn}`).toBe(groundSpawn)
      expect(s.gearFraction === 1, `groundSpawn=${groundSpawn}`).toBe(groundSpawn)
    }
  })
})

describe('scenarioIdFromQuery (Plan 8)', () => {
  it('falls back when absent, reads a present id, and throws on an empty one', () => {
    expect(scenarioIdFromQuery('', 'free-flight')).toBe('free-flight')
    expect(scenarioIdFromQuery(`?${SCENARIO_PARAM}=deck-quals`, 'free-flight')).toBe('deck-quals')
    expect(() => scenarioIdFromQuery(`?${SCENARIO_PARAM}=`, 'free-flight')).toThrow(/scenario/)
    expect(() => scenarioIdFromQuery(`?${SCENARIO_PARAM}=../x`, 'free-flight')).toThrow(/scenario/)
  })
})
