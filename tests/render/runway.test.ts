import { describe, it, expect } from 'vitest'
import { BufferGeometry, Mesh } from 'three'
import {
  RUNWAY_CENTRE,
  RUNWAY_LENGTH_M,
  RUNWAY_SURFACE_OFFSET_M,
  RUNWAY_WIDTH_M,
  createRunway,
  runwayCorners,
} from '../../src/render/scene/runway.js'
import { createTerrainField, heightAt } from '../../src/sim/world/terrain.js'
import { loadTerrainHeader, loadTerrainLevel, FIRST_COMMITTED_LEVEL } from '../../tools/terrain/load.js'
import { loadAirfield } from '../../tools/content/load.js'
import { GROUND_CONTACT_TOLERANCE_M } from '../../src/sim/ground.js'

/** The content record `RUNWAY_CENTRE` (src/render/scene/runway.ts) is
 *  supposed to agree with, until Task 7 makes `createRunway` take an
 *  `Airfield` directly and this whole file's `RUNWAY_CENTRE` import goes
 *  with it. */
const tacloban = loadAirfield('tacloban')

describe('the runway at Tacloban', () => {
  it('sits on the airfield coordinate this repo already carries', () => {
    // (-29666, -47605) is cross-checked against the Copernicus tiles in
    // tests/tools/terrainBuild.test.ts. Re-deriving it lands ~80 m away.
    expect(RUNWAY_CENTRE.x).toBe(-29666)
    expect(RUNWAY_CENTRE.z).toBe(-47605)
  })

  it('runs north-south, where the ground is flat', () => {
    const c = runwayCorners()
    const spanZ = Math.max(...c.map((p) => p.z)) - Math.min(...c.map((p) => p.z))
    const spanX = Math.max(...c.map((p) => p.x)) - Math.min(...c.map((p) => p.x))
    expect(spanZ).toBeCloseTo(RUNWAY_LENGTH_M, 6)
    expect(spanX).toBeCloseTo(RUNWAY_WIDTH_M, 6)
    expect(spanZ).toBeGreaterThan(spanX)
  })

  it('is long enough for the take-off roll it exists to serve', () => {
    // The graded trial figure is 230.124 m and this model runs longer than that
    // with rolling friction and no flaps. A strip that cannot contain the roll
    // the test card measures would be a strip you cannot take off from.
    expect(RUNWAY_LENGTH_M).toBeGreaterThan(3 * 230.124)
  })

  /**
   * Not in the plan, and the assertion that ties this module to `spawn.ts`.
   * Both files carry Tacloban's coordinate for their own reasons, and nothing
   * else would notice if one of them moved: a strip built 200 m away still
   * passes every test above, and the airplane would simply be parked on grass
   * beside its own runway.
   */
  it('has the parked airplane standing on it', () => {
    const c = runwayCorners()
    const withinX =
      tacloban.runway.center.x >= Math.min(...c.map((p) => p.x)) &&
      tacloban.runway.center.x <= Math.max(...c.map((p) => p.x))
    const withinZ =
      tacloban.runway.center.z >= Math.min(...c.map((p) => p.z)) &&
      tacloban.runway.center.z <= Math.max(...c.map((p) => p.z))
    expect(withinX, 'spawn is off the side of the strip').toBe(true)
    expect(withinZ, 'spawn is off the end of the strip').toBe(true)
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
    const object = createRunway(terrain)
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
    const object = createRunway(terrain)
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
    const object = createRunway(terrain)
    expect(object.position.x).toBe(0)
    expect(object.position.z).toBe(0)
    const position = ((object as Mesh).geometry as BufferGeometry).getAttribute('position')
    let minX = Infinity
    let maxZ = -Infinity
    for (let i = 0; i < position.count; i++) {
      minX = Math.min(minX, position.getX(i))
      maxZ = Math.max(maxZ, position.getZ(i))
    }
    expect(minX).toBeCloseTo(RUNWAY_CENTRE.x - RUNWAY_WIDTH_M / 2, 6)
    expect(maxZ).toBeCloseTo(RUNWAY_CENTRE.z + RUNWAY_LENGTH_M / 2, 6)
  })
})
