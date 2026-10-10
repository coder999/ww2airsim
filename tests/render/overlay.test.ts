import { describe, it, expect } from 'vitest'
import { formatPosition } from '../../src/render/overlay.js'
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
