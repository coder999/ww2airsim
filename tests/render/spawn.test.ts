import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SPAWN_IS_GROUND,
  DEFAULT_SPAWN_POSITION,
  SPAWN_PARAMS,
  hasSpawnOverride,
  spawnPositionFromQuery,
} from '../../src/render/spawn.js'

/**
 * `spawn.ts` carries two things: where the airplane starts by default (parked
 * at Tacloban since Task 14), and the `?spawnX/Y/Z` override Tier 2 uses to
 * put it somewhere else entirely -- over Leyte at altitude, or over open
 * water. Tested here rather than only on the GPU for the obvious reason --
 * it is pure -- and for a less obvious one: a bug here does not make the
 * Tier 2 terrain tests FAIL, it makes them pass while flying over open water
 * (or, since Task 14, while parked at the wrong point on land), which is the
 * failure class this whole plan keeps guarding against.
 */
describe('DEFAULT_SPAWN_POSITION and DEFAULT_SPAWN_IS_GROUND', () => {
  it('is Tacloban -- (x, z) taken from tests/tools/terrainBuild.test.ts, not re-derived here', () => {
    expect(DEFAULT_SPAWN_POSITION.x).toBe(-29666)
    expect(DEFAULT_SPAWN_POSITION.z).toBe(47605)
  })

  it('is a ground spawn', () => {
    expect(DEFAULT_SPAWN_IS_GROUND).toBe(true)
  })
})

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
    expect(hasSpawnOverride('?spawnX=-45000&spawnY=100&spawnZ=47605')).toBe(true)
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
  it('is the default spawn when the query string is empty', () => {
    expect(spawnPositionFromQuery('')).toEqual(DEFAULT_SPAWN_POSITION)
    expect(spawnPositionFromQuery('?')).toEqual(DEFAULT_SPAWN_POSITION)
    // An unrelated parameter must not be read as a spawn coordinate.
    expect(spawnPositionFromQuery('?debug=1')).toEqual(DEFAULT_SPAWN_POSITION)
  })

  it('overrides each component independently, by its own parameter name', () => {
    // One component at a time, and each asserted against the OTHER two still
    // being the default: the bug this kills is an x/z transpose or a
    // copy-pasted `params.get('spawnX')` under the y branch, both of which
    // leave a test that only checks "all three at once" perfectly green.
    expect(spawnPositionFromQuery('?spawnX=-45000')).toEqual({
      x: -45000,
      y: DEFAULT_SPAWN_POSITION.y,
      z: DEFAULT_SPAWN_POSITION.z,
    })
    expect(spawnPositionFromQuery('?spawnY=8000')).toEqual({
      x: DEFAULT_SPAWN_POSITION.x,
      y: 8000,
      z: DEFAULT_SPAWN_POSITION.z,
    })
    expect(spawnPositionFromQuery('?spawnZ=47605')).toEqual({
      x: DEFAULT_SPAWN_POSITION.x,
      y: DEFAULT_SPAWN_POSITION.y,
      z: 47605,
    })
  })

  it('reads all three together, in any order, with a leading ? or without', () => {
    const expected = { x: -45000, y: 100, z: 47605 }
    expect(spawnPositionFromQuery('?spawnX=-45000&spawnY=100&spawnZ=47605')).toEqual(expected)
    expect(spawnPositionFromQuery('spawnZ=47605&spawnX=-45000&spawnY=100')).toEqual(expected)
  })

  it('accepts a negative, fractional and exponent-form coordinate', () => {
    // `-45000` and `47605` are the real Tier 2 spawn; the rest are here
    // because `Number` accepts them and a hand-rolled parser might not.
    expect(spawnPositionFromQuery('?spawnX=-1.5&spawnY=1e3&spawnZ=+2')).toEqual({ x: -1.5, y: 1000, z: 2 })
  })

  it('throws on a present-but-unparseable coordinate rather than falling back', () => {
    // The whole point: a silent fallback puts the airplane back at
    // `DEFAULT_SPAWN_POSITION` -- parked at Tacloban, not wherever the test
    // asked for -- where a terrain test reports zero validation errors
    // because it never saw the terrain it meant to fly over.
    for (const bad of ['', ' ', 'abc', 'NaN', 'Infinity', '1,5']) {
      expect(
        () => spawnPositionFromQuery(`?spawnY=${encodeURIComponent(bad)}`),
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
      expect(() => spawnPositionFromQuery(`?${name}=nonsense`), name).toThrow(new RegExp(name))
    }
  })
})
