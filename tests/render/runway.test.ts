import { describe, it, expect } from 'vitest'
import { BufferGeometry, Mesh } from 'three'
import { RUNWAY_SURFACE_OFFSET_M, createRunway } from '../../src/render/scene/runway.js'
import { createTerrainField, heightAt } from '../../src/sim/world/terrain.js'
import { loadTerrainHeader, loadTerrainLevel, FIRST_COMMITTED_LEVEL } from '../../tools/terrain/load.js'
import { loadAirfield } from '../../tools/content/load.js'
import { parseAirfield, runwayCorners } from '../../src/sim/world/airfields.js'
import { GROUND_CONTACT_TOLERANCE_M } from '../../src/sim/ground.js'

/**
 * The strip is content now (Plan 12 Task 7): `createRunway` takes an
 * `Airfield` record and this file holds no coordinate of its own. The two
 * claims that used to live here -- that the centre is the pinned
 * `(-29666, -47605)`, and that the parked airplane stands on its own strip --
 * moved to the places that own them, `tests/sim/world/airfields.test.ts` and
 * `tests/sim/scenario.test.ts`. They were drift checks between two literals;
 * there is one literal now, so there is nothing left to drift.
 */
const tacloban = loadAirfield('tacloban')

describe('the runway at Tacloban', () => {
  it('runs north-south, where the ground is flat', () => {
    const c = runwayCorners(tacloban)
    const spanZ = Math.max(...c.map((p) => p.z)) - Math.min(...c.map((p) => p.z))
    const spanX = Math.max(...c.map((p) => p.x)) - Math.min(...c.map((p) => p.x))
    expect(spanZ).toBeCloseTo(tacloban.runway.lengthM, 6)
    expect(spanX).toBeCloseTo(tacloban.runway.widthM, 6)
    expect(spanZ).toBeGreaterThan(spanX)
  })

  it('is long enough for the take-off roll it exists to serve', () => {
    // The graded trial figure is 230.124 m and this model runs longer than that
    // with rolling friction and no flaps. A strip that cannot contain the roll
    // the test card measures would be a strip you cannot take off from.
    expect(tacloban.runway.lengthM).toBeGreaterThan(3 * 230.124)
  })

  /**
   * The strip is raised a hair above the terrain so it does not z-fight with
   * it. That offset is a LIE of exactly its own size, because the physics
   * reads `heightAt` and knows nothing about this mesh -- so it has to stay
   * far inside the tolerance that decides whether the wheels are on the
   * ground at all, or the airplane will look like it is floating above its
   * own runway by an amount the simulation disagrees with.
   */
  it('is lifted clear of z-fighting by far less than the contact tolerance', () => {
    expect(RUNWAY_SURFACE_OFFSET_M).toBeGreaterThan(0)
    expect(RUNWAY_SURFACE_OFFSET_M).toBeLessThan(GROUND_CONTACT_TOLERANCE_M / 4)
  })
})

describe('createRunway', () => {
  const header = loadTerrainHeader()
  const terrain = createTerrainField(header, FIRST_COMMITTED_LEVEL, loadTerrainLevel(FIRST_COMMITTED_LEVEL, header))

  it('follows the real ground rather than floating over it or burying itself', () => {
    // Tacloban is a table north-south (0.49 m of spread over 1.8 km) but not
    // a flat one, and a strip laid at one constant height would bury its
    // north end or float its south. Every vertex is checked against the same
    // `heightAt` the physics uses -- the one function that decides where the
    // ground is.
    const object = createRunway(terrain, tacloban)
    const geometry = (object as Mesh).geometry as BufferGeometry
    const position = geometry.getAttribute('position')
    expect(position.count).toBeGreaterThan(8)

    let worstM = 0
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i)
      const y = position.getY(i)
      const z = position.getZ(i)
      worstM = Math.max(worstM, Math.abs(y - (heightAt(terrain, x, z) + RUNWAY_SURFACE_OFFSET_M)))
    }
    expect(worstM).toBeLessThan(1e-6)
  })

  it('faces up, so the pilot can see it', () => {
    // Winding is not checkable by reading it: getting the triangle order
    // backwards yields a strip that is invisible from the cockpit and
    // perfectly visible from underneath, which is a defect only Tier 3 would
    // ever find. Tacloban is near-flat, so every normal should be within a
    // few degrees of straight up.
    const object = createRunway(terrain, tacloban)
    const normal = ((object as Mesh).geometry as BufferGeometry).getAttribute('normal')
    expect(normal.count).toBeGreaterThan(8)
    let worstUp = Infinity
    for (let i = 0; i < normal.count; i++) worstUp = Math.min(worstUp, normal.getY(i))
    expect(worstUp).toBeGreaterThan(0.99)
  })

  it('is built in raw world metres, so the camera-relative shift is applied once', () => {
    // `scene.position` is set to `worldOffsetFor(eye)` every frame and applies
    // to every child, so adding the offset here too would apply it twice --
    // the Critical finding on Plan 10, whose comment lives on the impact
    // effect in `main.ts`. Tacloban is 29.7 km west and 47.6 km north of the
    // world origin, so a runway built around the origin instead would be
    // unmissable here.
    const object = createRunway(terrain, tacloban)
    expect(object.position.x).toBe(0)
    expect(object.position.z).toBe(0)
    const position = ((object as Mesh).geometry as BufferGeometry).getAttribute('position')
    let minX = Infinity
    let maxZ = -Infinity
    for (let i = 0; i < position.count; i++) {
      minX = Math.min(minX, position.getX(i))
      maxZ = Math.max(maxZ, position.getZ(i))
    }
    expect(minX).toBeCloseTo(tacloban.runway.center.x - tacloban.runway.widthM / 2, 6)
    expect(maxZ).toBeCloseTo(tacloban.runway.center.z + tacloban.runway.lengthM / 2, 6)
  })

  it('a strip at heading 90 runs east-west', () => {
    // Every airfield in `content/bases/` is north-south today, so nothing
    // that ships exercises the rotation -- and a `createRunway` that ignored
    // `headingDeg` entirely would pass every other case in this file. Dulag's
    // heading is an assumption (`content/bases/dulag.json`) and 13d may move
    // it, so this is the check that the record's heading actually reaches the
    // mesh.
    const east = parseAirfield({ ...tacloban, runway: { ...tacloban.runway, headingDeg: 90 } })
    const geometry = (createRunway(terrain, east) as Mesh).geometry as BufferGeometry
    const p = geometry.getAttribute('position')
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (let i = 0; i < p.count; i++) {
      minX = Math.min(minX, p.getX(i)); maxX = Math.max(maxX, p.getX(i))
      minZ = Math.min(minZ, p.getZ(i)); maxZ = Math.max(maxZ, p.getZ(i))
    }
    expect(maxX - minX).toBeCloseTo(east.runway.lengthM, 6)
    expect(maxZ - minZ).toBeCloseTo(east.runway.widthM, 6)
  })
})
