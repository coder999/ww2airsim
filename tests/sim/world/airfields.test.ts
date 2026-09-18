import { describe, it, expect } from 'vitest'
import {
  airfieldAt,
  insideRunway,
  insideRect,
  localToWorld,
  parkedAttitude,
  parseAirfield,
  runwayCorners,
  worldToLocal,
} from '../../../src/sim/world/airfields.js'
import { toLocal } from '../../../src/sim/world/projection.js'
import { qRotate } from '../../../src/sim/math/quat.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { loadAirfield } from '../../../tools/content/load.js'

const tacloban = loadAirfield('tacloban')
const dulag = loadAirfield('dulag')

describe('content', () => {
  it('Tacloban carries the pinned coordinate verbatim -- master spec §15, never re-derived', () => {
    expect(tacloban.runway.center).toEqual({ x: -29666, z: -47605 })
    expect(tacloban.runway.headingDeg).toBe(0)
    expect(tacloban.runway.lengthM).toBe(1500)
    expect(tacloban.runway.widthM).toBe(45)
  })

  it('the pinned literal is the projection of the geodetic point tests/tools/terrainBuild.test.ts holds, to under a meter', () => {
    const p = toLocal(11.228, 125.028)
    expect(Math.abs(p.x - tacloban.runway.center.x)).toBeLessThan(1)
    expect(Math.abs(p.z - tacloban.runway.center.z)).toBeLessThan(1)
  })

  it('Dulag is where the 13d design put it, 31 km south of Tacloban', () => {
    expect(dulag.runway.center).toEqual({ x: -31629, z: -16479 })
    const d = Math.hypot(dulag.runway.center.x - tacloban.runway.center.x, dulag.runway.center.z - tacloban.runway.center.z)
    expect(d).toBeGreaterThan(30_000)
    expect(d).toBeLessThan(32_000)
    expect(dulag.reference.source).toMatch(/assum/i)
  })

  it('rejects an unknown key and a non-finite coordinate', () => {
    const raw = JSON.parse(JSON.stringify(tacloban)) as Record<string, unknown>
    expect(() => parseAirfield({ ...raw, elevation: 3 })).toThrow(/elevation/)
    expect(() => parseAirfield({ ...raw, runway: { ...(raw.runway as object), center: { x: Infinity, z: 0 } } })).toThrow(/center/)
  })
})

describe('the runway-local frame', () => {
  it('is the identity at heading 0', () => {
    expect(localToWorld(tacloban, 10, -20)).toEqual({ x: tacloban.runway.center.x + 10, z: tacloban.runway.center.z - 20 })
    expect(worldToLocal(tacloban, tacloban.runway.center.x + 10, tacloban.runway.center.z - 20)).toEqual({ x: 10, z: -20 })
  })

  it('at heading 90 the north end of the strip lies to the east', () => {
    const east = parseAirfield({ ...tacloban, runway: { ...tacloban.runway, headingDeg: 90 } })
    const northEnd = localToWorld(east, 0, -east.runway.lengthM / 2)
    expect(northEnd.x - east.runway.center.x).toBeCloseTo(east.runway.lengthM / 2, 6)
    expect(northEnd.z - east.runway.center.z).toBeCloseTo(0, 6)
  })

  it('round-trips at an arbitrary heading', () => {
    const skew = parseAirfield({ ...tacloban, runway: { ...tacloban.runway, headingDeg: 37 } })
    const w = localToWorld(skew, 123, -456)
    const l = worldToLocal(skew, w.x, w.z)
    expect(l.x).toBeCloseTo(123, 9)
    expect(l.z).toBeCloseTo(-456, 9)
  })
})

describe('insideRunway and airfieldAt', () => {
  it('holds at the center, just inside each corner, and fails just outside', () => {
    const c = tacloban.runway.center
    expect(insideRunway(tacloban, c.x, c.z)).toBe(true)
    for (const corner of runwayCorners(tacloban)) {
      const towardCenter = { x: corner.x + Math.sign(c.x - corner.x), z: corner.z + Math.sign(c.z - corner.z) }
      const awayFromCenter = { x: corner.x - Math.sign(c.x - corner.x), z: corner.z - Math.sign(c.z - corner.z) }
      expect(insideRunway(tacloban, towardCenter.x, towardCenter.z)).toBe(true)
      expect(insideRunway(tacloban, awayFromCenter.x, awayFromCenter.z)).toBe(false)
    }
  })

  it('runwayCorners spans length along z and width along x at heading 0', () => {
    const corners = runwayCorners(tacloban)
    const xs = corners.map((p) => p.x), zs = corners.map((p) => p.z)
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(tacloban.runway.lengthM, 6)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(tacloban.runway.widthM, 6)
  })

  it('names the airfield under a point, or null', () => {
    const both = [tacloban, dulag]
    expect(airfieldAt(both, tacloban.runway.center.x, tacloban.runway.center.z)?.id).toBe('tacloban')
    expect(airfieldAt(both, dulag.runway.center.x, dulag.runway.center.z)?.id).toBe('dulag')
    expect(airfieldAt(both, 0, 0)).toBeNull()
  })

  it('insideRect works on the Tacloban apron', () => {
    expect(tacloban.apron).not.toBeNull()
    expect(insideRect(tacloban, tacloban.apron!, tacloban.runway.center.x - 116, tacloban.runway.center.z - 60)).toBe(true)
    expect(insideRect(tacloban, tacloban.apron!, tacloban.runway.center.x, tacloban.runway.center.z)).toBe(false)
  })
})

describe('parkedAttitude', () => {
  it('points the nose north down Tacloban, wings level -- the same quaternion DEFAULT_SPAWN_ATTITUDE was', () => {
    const q = parkedAttitude(tacloban)
    const nose = qRotate(q, v3(1, 0, 0))
    expect(nose.x).toBeCloseTo(0, 12)
    expect(nose.z).toBeCloseTo(-1, 12)
    const up = qRotate(q, v3(0, 1, 0))
    expect(up.y).toBeCloseTo(1, 12)
  })

  it('points east for a heading of 90', () => {
    const east = parseAirfield({ ...tacloban, runway: { ...tacloban.runway, headingDeg: 90 } })
    const nose = qRotate(parkedAttitude(east), v3(1, 0, 0))
    expect(nose.x).toBeCloseTo(1, 12)
    expect(nose.z).toBeCloseTo(0, 12)
  })
})
