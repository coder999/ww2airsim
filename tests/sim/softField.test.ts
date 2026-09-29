import { describe, it, expect } from 'vitest'
import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { supportedContact, rollingResistanceN, MAX_SUPPORTED_SINK_MPS, SOFT_FIELD_MAX_SINK_MPS, SOFT_FIELD_ROLLING_MULTIPLIER } from '../../src/sim/ground.js'
import { step } from '../../src/sim/flight/model.js'
import { createState } from '../../src/sim/flight/state.js'
import { nextLandingTracking, NO_LANDING } from '../../src/sim/landing.js'
import { groundUnder } from '../../src/sim/world/ground.js'
import { createTerrainField, type TerrainField } from '../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../src/sim/world/schema.js'
import {
  COVER_CHANNELS, COVER_SAMPLES, FOREST_COVER_FRACTION, coverByteLength, createCoverField, landClassAt, parseCoverHeader, quantize,
  type CoverField,
} from '../../src/sim/world/cover.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qIdentity } from '../../src/sim/math/quat.js'
import { loadAircraftSpec, loadAirfield } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const tacloban = loadAirfield('tacloban')
const DT = 1 / 60
const H = f6f.gear.heightM
const LAND_M = 100

const coverHeader = parseCoverHeader(JSON.parse(readFileSync('content/landcover/header.json', 'utf8')))
const shippedCover = new Uint8Array(gunzipSync(readFileSync('content/landcover/cover.bin.gz')))

/** A raster that is one cover mix everywhere. */
function uniform(mix: { tree?: number; crop?: number; mangrove?: number; open?: number }, airfields = [tacloban]): CoverField {
  const data = new Uint8Array(coverByteLength(coverHeader))
  const px = COVER_CHANNELS.map((c) => quantize(mix[c] ?? 0))
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 4; c++) data[i + c] = px[c]!
  return createCoverField(coverHeader, data, airfields)
}

const header = parseTerrainHeader({
  centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000, finestSamples: 8193, levels: 13, encoding: 'int16-decimetres',
})
const flat = createTerrainField(header, 12, new Int16Array(9).fill(LAND_M * 10))
const withCover = (cover: CoverField | null): TerrainField => (cover === null ? flat : { ...flat, cover })

const PADDY = { crop: 1 }
const FOREST = { tree: 1 }
const AWAY = { x: 5000, z: 5000 } // far from Tacloban's runway
const ON_RUNWAY = { x: tacloban.runway.center.x, z: tacloban.runway.center.z }

/** Wheels on the ground at `at`, gear down and flaps set, sinking `sink` m/s at 40 m/s. */
const arriving = (at: { x: number; z: number }, sink: number) =>
  createState({
    position: v3(at.x, LAND_M + H, at.z), velocity: v3(40, -sink, 0), attitude: qIdentity(), gearFraction: 1, flapFraction: 1,
  })
const contactOn = (cover: CoverField | null, at: { x: number; z: number }, sink: number): boolean => {
  const g = groundUnder(withCover(cover), [], at.x, at.z)!
  return supportedContact(f6f, arriving(at, sink), g.heightM, g.surface, g.velocity, g.landClass)
}

describe('land class at a point', () => {
  it('reads each cover mix, and the runway wins over the raster under it', () => {
    expect(landClassAt(uniform(FOREST), AWAY.x, AWAY.z)).toBe('forest')
    expect(landClassAt(uniform({ mangrove: 1 }), AWAY.x, AWAY.z)).toBe('forest')
    expect(landClassAt(uniform(PADDY), AWAY.x, AWAY.z)).toBe('soft')
    expect(landClassAt(uniform({ open: 1 }), AWAY.x, AWAY.z)).toBe('soft')
    expect(landClassAt(uniform(FOREST), ON_RUNWAY.x, ON_RUNWAY.z)).toBe('runway')
    expect(landClassAt(null, AWAY.x, AWAY.z)).toBe('unclassified')
  })

  it('splits woodland at the named fraction, tree and mangrove counted together', () => {
    const just = FOREST_COVER_FRACTION
    expect(landClassAt(uniform({ tree: just + 0.1, crop: 1 - just - 0.1 }), AWAY.x, AWAY.z)).toBe('forest')
    expect(landClassAt(uniform({ tree: just - 0.15, mangrove: 0, crop: 1 - just + 0.15 }), AWAY.x, AWAY.z)).toBe('soft')
    expect(landClassAt(uniform({ tree: 0.4, mangrove: 0.4, open: 0.2 }), AWAY.x, AWAY.z)).toBe('forest')
  })

  it('is what groundUnder reports for land, and unclassified over water and with no cover', () => {
    expect(groundUnder(withCover(uniform(PADDY)), [], AWAY.x, AWAY.z)!.landClass).toBe('soft')
    expect(groundUnder(withCover(null), [], AWAY.x, AWAY.z)!.landClass).toBe('unclassified')
    const sea = createTerrainField(header, 12, new Int16Array(9))
    expect(groundUnder({ ...sea, cover: uniform(FOREST) }, [], AWAY.x, AWAY.z)!.landClass).toBe('unclassified')
  })
})

describe('supportedContact by land class', () => {
  it('destroys any gear contact in woodland, however gentle', () => {
    expect(contactOn(uniform(FOREST), AWAY, 0)).toBe(false)
    expect(contactOn(uniform({ mangrove: 1 }), AWAY, 0.1)).toBe(false)
    // The same touch on a paddy is fine, so the rejection is the woodland.
    expect(contactOn(uniform(PADDY), AWAY, 0.1)).toBe(true)
  })

  it('judges a soft field at the lower sink limit, on both sides of it', () => {
    expect(SOFT_FIELD_MAX_SINK_MPS).toBeLessThan(MAX_SUPPORTED_SINK_MPS)
    expect(contactOn(uniform(PADDY), AWAY, SOFT_FIELD_MAX_SINK_MPS - 0.01)).toBe(true)
    expect(contactOn(uniform(PADDY), AWAY, SOFT_FIELD_MAX_SINK_MPS + 0.01)).toBe(false)
    expect(contactOn(uniform({ open: 1 }), AWAY, SOFT_FIELD_MAX_SINK_MPS + 0.01)).toBe(false)
  })

  it('holds the runway to the old limit: 3.5 m/s is firm there and rejected on a paddy', () => {
    const cover = uniform(PADDY)
    expect(contactOn(cover, ON_RUNWAY, 3.5)).toBe(true)
    expect(contactOn(cover, AWAY, 3.5)).toBe(false)
    expect(contactOn(cover, ON_RUNWAY, MAX_SUPPORTED_SINK_MPS + 0.01)).toBe(false)
  })

  it('is exactly the old judgment with no cover data', () => {
    expect(contactOn(null, AWAY, 3.5)).toBe(true)
    expect(contactOn(null, AWAY, MAX_SUPPORTED_SINK_MPS + 0.01)).toBe(false)
  })

  it('keeps the speed gate on soft ground', () => {
    const fast = createState({
      position: v3(AWAY.x, LAND_M + H, AWAY.z), velocity: v3(200, -1, 0), attitude: qIdentity(), gearFraction: 1, flapFraction: 1,
    })
    const g = groundUnder(withCover(uniform(PADDY)), [], AWAY.x, AWAY.z)!
    expect(supportedContact(f6f, fast, g.heightM, g.surface, g.velocity, g.landClass)).toBe(false)
  })
})

describe('step(): the ground reaction follows the class', () => {
  /** Metres the wheels end below the surface after one step: a caught
   *  (supported) arrival is rested back onto it, an uncaught one is left to go
   *  through it for `advance` to record. */
  const belowGroundAfter = (cover: CoverField | null, at: { x: number; z: number }, sink: number): number => {
    const next = step(f6f, arriving(at, sink), { pitch: 0, roll: 0, yaw: 0, throttle: 0 }, { dt: DT, tick: 0, terrain: withCover(cover) })
    return LAND_M - (next.position.y - H)
  }

  it('a paddy arrival at 3.5 m/s is not caught; the same arrival on the runway is', () => {
    expect(belowGroundAfter(uniform(PADDY), AWAY, 3.5)).toBeGreaterThan(0.03)
    expect(belowGroundAfter(uniform(PADDY), ON_RUNWAY, 3.5)).toBeCloseTo(0, 6)
    expect(belowGroundAfter(uniform(FOREST), AWAY, 0.5)).toBeGreaterThan(0.005)
  })
})

describe('rolling resistance on soft ground', () => {
  it('multiplies the free-rolling drag and leaves firm ground and no-data alone', () => {
    const firm = rollingResistanceN(f6f, 5600, 0)
    expect(rollingResistanceN(f6f, 5600, 0, 'unclassified')).toBe(firm)
    expect(rollingResistanceN(f6f, 5600, 0, 'runway')).toBe(firm)
    expect(SOFT_FIELD_ROLLING_MULTIPLIER).toBeGreaterThan(1)
    expect(rollingResistanceN(f6f, 5600, 0, 'soft')).toBeCloseTo(firm * SOFT_FIELD_ROLLING_MULTIPLIER, 6)
  })

  it('leaves the brakes working: fully braked is no weaker than unbraked, and no drag is lost', () => {
    const softRoll = rollingResistanceN(f6f, 5600, 0, 'soft')
    expect(rollingResistanceN(f6f, 5600, 1, 'soft')).toBeGreaterThanOrEqual(softRoll)
    expect(rollingResistanceN(f6f, 5600, 1, 'soft')).toBeCloseTo(rollingResistanceN(f6f, 5600, 1), 6)
  })

  it('slows a rolling airplane harder on a paddy than on a runway, in step()', () => {
    const speedAfter = (cover: CoverField | null, at: { x: number; z: number }): number => {
      let s = createState({ position: v3(at.x, LAND_M + H, at.z), velocity: v3(10, 0, 0), attitude: qIdentity(), gearFraction: 1, flapFraction: 1 })
      // Half a second is ~5 m: short enough to stay on the runway rectangle.
      for (let i = 0; i < 30; i++) s = step(f6f, s, { pitch: 0, roll: 0, yaw: 0, throttle: 0 }, { dt: DT, tick: i, terrain: withCover(cover) })
      return s.velocity.x
    }
    const paddy = speedAfter(uniform(PADDY), AWAY)
    const runway = speedAfter(uniform(PADDY), ON_RUNWAY)
    const none = speedAfter(null, AWAY)
    expect(runway).toBeCloseTo(none, 6)
    expect(paddy).toBeLessThan(runway - 0.1)
  })
})

describe('the landing report records the surface', () => {
  const land = (cover: CoverField | null, at: { x: number; z: number }) => {
    const terrain = withCover(cover)
    const at0 = (h: number, speed: number, sink = 0) =>
      createState({ position: v3(at.x, LAND_M + H + h, at.z), velocity: v3(speed, -sink, 0), attitude: qIdentity(), gearFraction: 1, flapFraction: 1 })
    let t = nextLandingTracking(f6f, NO_LANDING, at0(50, 40), at0(50, 40), terrain, [tacloban])
    t = nextLandingTracking(f6f, t, at0(0.5, 40, 1), at0(0, 40), terrain, [tacloban])
    return nextLandingTracking(f6f, t, at0(0, 5), at0(0, 0.5), terrain, [tacloban])
  }
  it('on a paddy, a runway, and with no data', () => {
    expect(land(uniform(PADDY), AWAY).report!.landClass).toBe('soft')
    expect(land(uniform(PADDY), ON_RUNWAY).report!.landClass).toBe('runway')
    expect(land(null, AWAY).report!.landClass).toBe('unclassified')
    expect(land(uniform(PADDY), AWAY).touchdown!.landClass).toBe('soft')
  })
})

describe('the shipped land-cover raster, decoded by the sim', () => {
  const cover = createCoverField(coverHeader, shippedCover, [tacloban])

  it('has the length its header promises', () => {
    expect(shippedCover.length).toBe(COVER_SAMPLES * COVER_SAMPLES * 4)
  })

  it('calls Tacloban runway; the raster alone would call it soft, so the airfield rule is what holds it', () => {
    expect(landClassAt(cover, ON_RUNWAY.x, ON_RUNWAY.z)).toBe('runway')
    expect(landClassAt(createCoverField(coverHeader, shippedCover, []), ON_RUNWAY.x, ON_RUNWAY.z)).toBe('soft')
  })

  // Found by scanning the shipped raster for a full-canopy cell whose four
  // neighbours are too, above 400 m (2026-09-28): 684 m up in the Leyte hills.
  it('calls a forested hill forest and a paddy soft', () => {
    expect(landClassAt(cover, -57031.25, -25781.25)).toBe('forest')
    expect(landClassAt(cover, -33593.75, 5468.75)).toBe('soft')
  })
})
