import { describe, it, expect } from 'vitest'
import { formatPosition, perceptionLines } from '../../src/render/overlay.js'
import { toLocal } from '../../src/sim/world/projection.js'
import { SPAWN_PARAMS } from '../../src/render/spawn.js'

describe('overlay position line', () => {
  it('prints latitude, longitude, altitude in feet and the spawn query', () => {
    const [line1, line2] = formatPosition({ x: 0, y: 1000, z: 0 }).split('\n')
    expect(line1).toBe('10.8000N 125.3000E  3281 ft')
    expect(line2).toBe('?spawnX=0&spawnY=1000&spawnZ=0')
  })

  it('uses the parameter names spawn.ts reads, and round-trips through the projection', () => {
    const tac = toLocal(11.228, 125.028) // Tacloban airfield
    const q = formatPosition({ x: tac.x, y: 300, z: tac.z }).split('\n')[1]!
    const params = new URLSearchParams(q)
    for (const name of SPAWN_PARAMS) expect(params.has(name)).toBe(true)
    expect(Math.abs(Number(params.get('spawnX')) - tac.x)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(Number(params.get('spawnZ')) - tac.z)).toBeLessThanOrEqual(0.5)
  })

  it('marks the southern hemisphere', () => {
    // 2,000 km south-west of the world centre is far off the map, but the formatter is pure.
    // It is still east of Greenwich (about 107 E), so the longitude stays E.
    const line = formatPosition({ x: -2_000_000, y: 0, z: 2_000_000 }).split('\n')[0]!
    expect(line).toMatch(/S /)
    expect(line).toMatch(/E /)
  })
})

describe('perceptionLines (F6B DEV readout)', () => {
  const base = { night: true, playerLit: true, playerRangeM: 6000, rows: [{ id: 'zero-1', distanceM: 4828, sees: true, targetsPlayer: false }, { id: 'zero-2', distanceM: 800, sees: true, targetsPlayer: true }, { id: 'zero-3', distanceM: 9000, sees: false, targetsPlayer: false }] }
  it('is empty by day', () => { expect(perceptionLines({ ...base, night: false })).toBe('') })
  it('says lit or blacked out, the range in miles, and each enemy as chasing, seeing or blind', () => {
    const lit = perceptionLines(base).split('\n')
    expect(lit[0]).toBe('night: lights ON, seen out to 3.7 mi')
    expect(lit.slice(1)).toEqual(['  zero-1 3.0 mi sees you', '  zero-2 0.5 mi CHASING', '  zero-3 5.6 mi blind'])
    expect(perceptionLines({ ...base, playerLit: false, playerRangeM: 900 })).toContain('lights OFF (blacked out), seen out to 0.6 mi')
  })
})
