import { describe, expect, it } from 'vitest'
import { Group, Vector3 } from 'three'
import { BEAM_MAX_M, beamLength, createBeams } from '../../src/render/lights/beam.js'
import { aimSearchlight, SEARCHLIGHT_PIVOT_Y } from '../../src/render/lights/equipment.js'
import { aimAxis, LIGHT_CAPS } from '../../src/sim/lights/lights.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { staticModelPath } from '../../src/render/content.js'
import { glbScene } from './_wildcatCache.js'

describe('beam length', () => {
  const flat = (h: number) => () => h
  it('runs to its full length into a clear sky', () => {
    expect(beamLength(v3(0, 2, 0), v3(0, 1, 0), flat(0), null)).toEqual({ lengthM: BEAM_MAX_M, hit: null })
  })
  it('ends on the ground where it meets it: 45 degrees down from 100 m hits 100 m out, 141 m along', () => {
    const r = beamLength(v3(0, 100, 0), aimAxis(0, -45), flat(0), null)
    expect(r.hit).toBe('ground')
    expect(r.lengthM).toBeCloseTo(100 * Math.SQRT2, 1)
  })
  it('ends on a cloud base above it: straight up from 2 m to a 1,500 m base is 1,498 m, and a base below the lamp is ignored', () => {
    expect(beamLength(v3(0, 2, 0), v3(0, 1, 0), flat(0), 1500)).toEqual({ lengthM: 1498, hit: 'cloud' })
    expect(beamLength(v3(0, 2000, 0), v3(0, 1, 0), flat(0), 1500).hit).toBeNull()
  })
  it('a hill in the way ends it earlier than flat ground would', () => {
    const hill = (x: number) => (x > 300 ? 400 : 0)
    const r = beamLength(v3(0, 5, 0), aimAxis(90, 10), (x) => hill(x), null)
    expect(r.hit).toBe('ground')
    expect(r.lengthM).toBeLessThan(2500)
    expect(beamLength(v3(0, 5, 0), aimAxis(90, 10), flat(0), null).hit).toBeNull()
  })
})

describe('searchlight aim (beam axis equals the rig\'s train and elevation)', () => {
  const lampAxis = async (az: number, el: number) => {
    const root = new Group().add(...(await glbScene(staticModelPath('equipment', 'm1942-60in-searchlight'))).children)
    aimSearchlight(root, az, el)
    root.updateMatrixWorld(true)
    // The face centre and beam marker origin are model-origin nodes (their vertices carry the offsets), so measure the boxes.
    return root
  }
  it('the lamp face looks where the contract\'s axis points, for every azimuth and elevation tried', async () => {
    const { Box3 } = await import('three')
    for (const [az, el] of [[0, 0], [90, 0], [180, 45], [270, 70], [20, 70], [305, 12]] as const) {
      const root = await lampAxis(az, el)
      const centre = (n: string) => new Box3().setFromObject(root.getObjectByName(n)!).getCenter(new Vector3())
      const dir = centre('BeamMarker').sub(centre('LampFace')).normalize()
      const want = aimAxis(az, el)
      expect(dir.x, `az ${az} el ${el}`).toBeCloseTo(want.x, 3)
      expect(dir.y, `az ${az} el ${el}`).toBeCloseTo(want.y, 3)
      expect(dir.z, `az ${az} el ${el}`).toBeCloseTo(want.z, 3)
    }
  })
  it('the lamp tilts about its own pivot: the face stays the same distance from it', async () => {
    const { Box3 } = await import('three')
    const dist = async (el: number) => {
      const root = await lampAxis(0, el)
      const c = new Box3().setFromObject(root.getObjectByName('LampFace')!).getCenter(new Vector3())
      return Math.hypot(c.x, c.y - SEARCHLIGHT_PIVOT_Y, c.z)
    }
    expect(await dist(70)).toBeCloseTo(await dist(0), 3)
  })
})

describe('beam cap', () => {
  it('at most LIGHT_CAPS.searchlights beams are ever drawn', () => {
    const made: unknown[] = []
    const beams = createBeams((m) => made.push(m), () => undefined)
    expect(made.length).toBe(LIGHT_CAPS.searchlights)
    const five = Array.from({ length: 5 }, (_, i) => ({ origin: v3(i, 0, 0), axis: v3(0, 1, 0), lengthM: 1000, gain: 1 }))
    beams.update(five)
    expect(beams.group.filter((m) => m.visible).length).toBe(LIGHT_CAPS.searchlights)
    beams.update([])
    expect(beams.group.filter((m) => m.visible).length).toBe(0)
  })
})
