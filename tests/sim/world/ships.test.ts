import { describe, it, expect } from 'vitest'
import {
  bearingTo,
  createShipState,
  parseShipSpec,
  shipVelocity,
  stepShip,
  wrapPi,
  assertLoopOverWater,
  type ShipOrders,
} from '../../../src/sim/world/ships.js'
import { DT } from '../../../src/sim/flight/model.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { createTerrainField, SEA_LEVEL_M } from '../../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../../src/sim/world/schema.js'
import { loadShipSpec } from '../../../tools/content/load.js'

const cv = loadShipSpec('essex-cv')
const dd = loadShipSpec('fletcher-dd')

/** The compass the gauges use: src/render/gauges.ts:205. Repeated here rather
 *  than imported, because sim/ may not import render/ and the point of the
 *  test is that the two agree. */
const compass = (vx: number, vz: number): number => Math.atan2(vx, -vz)

const straight = (x: number, z: number): ShipOrders => ({
  // Two waypoints far ahead on the same line, so the ship sails straight.
  waypoints: [{ x: x + 1e6, z }, { x: x + 2e6, z }],
  speedMps: 5,
})

describe('ship content', () => {
  it('loads both classes with the fields the sim reads', () => {
    for (const s of [cv, dd]) {
      expect(s.lengthM).toBeGreaterThan(s.beamM)
      expect(s.maxSpeedMps).toBeGreaterThan(10)
      expect(s.turnRateRadPerS).toBeGreaterThan(0)
      expect(s.reference.source.length).toBeGreaterThan(20)
    }
    expect(cv.role).toBe('carrier')
    expect(dd.role).toBe('escort')
  })

  it('rejects an unknown key, a NaN and a missing field', () => {
    const raw = JSON.parse(JSON.stringify(cv)) as Record<string, unknown>
    expect(() => parseShipSpec({ ...raw, extra: 1 })).toThrow(/extra/)
    expect(() => parseShipSpec({ ...raw, maxSpeedMps: NaN })).toThrow(/maxSpeedMps/)
    const noBeam = { ...raw }
    delete noBeam.beamM
    expect(() => parseShipSpec(noBeam)).toThrow(/beamM/)
  })

  it('carries the sourced flight deck, trap zone and paddles blocks on the carrier and none on the escort', () => {
    const raw = JSON.parse(JSON.stringify(cv)) as Record<string, unknown>
    expect(cv.flightDeck).toEqual({ lengthM: 262.7, widthM: 32.9, heightM: 17 })
    expect(cv.trapZone).toEqual({ fromSternM: 30, toSternM: 130 })
    expect(cv.paddles).toBeDefined()
    expect(dd.flightDeck).toBeUndefined()
    expect(() => parseShipSpec({ ...raw, trapZone: { fromSternM: 130, toSternM: 30 } })).toThrow(/toSternM/)
  })
})

describe('heading convention (spec §5.2)', () => {
  it('heading 0 moves north (-z) and pi/2 moves east (+x)', () => {
    const north = shipVelocity(0, 10)
    expect(north.x).toBeCloseTo(0, 12)
    expect(north.z).toBeCloseTo(-10, 12)
    const east = shipVelocity(Math.PI / 2, 10)
    expect(east.x).toBeCloseTo(10, 12)
    expect(east.z).toBeCloseTo(0, 12)
    expect(north.y).toBe(0)
  })

  it('the gauge compass recovers the heading the ship was given, on all four cardinals', () => {
    for (const h of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const v = shipVelocity(h, 7)
      expect(wrapPi(compass(v.x, v.z) - h)).toBeCloseTo(0, 12)
    }
  })

  it('bearingTo agrees with the same compass', () => {
    expect(bearingTo({ x: 0, z: 0 }, { x: 0, z: -100 })).toBeCloseTo(0, 12)
    expect(bearingTo({ x: 0, z: 0 }, { x: 100, z: 0 })).toBeCloseTo(Math.PI / 2, 12)
    expect(bearingTo({ x: 0, z: 0 }, { x: 0, z: 100 })).toBeCloseTo(Math.PI, 12)
  })

  it('wrapPi keeps angles in (-pi, pi]', () => {
    expect(wrapPi(3 * Math.PI)).toBeCloseTo(Math.PI, 12)
    expect(wrapPi(-3 * Math.PI)).toBeCloseTo(Math.PI, 12)
    expect(wrapPi(0.5)).toBe(0.5)
  })
})

describe('stepShip', () => {
  it('sails a straight course at the ordered speed: distance equals speed * t', () => {
    let s = createShipState({ position: v3(0, 0, 0), headingRad: Math.PI / 2, speedMps: 0 })
    const orders = straight(0, 0)
    for (let i = 0; i < 600; i++) s = stepShip(dd, s, orders, { dt: DT, tick: i + 1 })
    expect(s.position.x).toBeCloseTo(5 * 600 * DT, 6)
    expect(s.position.z).toBeCloseTo(0, 6)
    expect(s.position.y).toBe(SEA_LEVEL_M)
    expect(s.tick).toBe(600)
    expect(s.speedMps).toBe(5)
  })

  it('clamps the ordered speed to the class maximum and treats a non-finite order as stopped', () => {
    const s0 = createShipState({ position: v3(0, 0, 0), headingRad: 0 })
    const fast = stepShip(dd, s0, { ...straight(0, 0), speedMps: 1000 }, { dt: DT, tick: 1 })
    expect(fast.speedMps).toBe(dd.maxSpeedMps)
    const nan = stepShip(dd, s0, { ...straight(0, 0), speedMps: NaN }, { dt: DT, tick: 1 })
    expect(nan.speedMps).toBe(0)
    expect(nan.position).toEqual(v3(0, 0, 0))
  })

  it('turns toward the waypoint no faster than the turn rate, and settles on its bearing', () => {
    // Waypoint due east of a ship pointing north: a 90 degree turn.
    let s = createShipState({ position: v3(0, 0, 0), headingRad: 0, speedMps: 5 })
    const orders: ShipOrders = { waypoints: [{ x: 1e6, z: 0 }, { x: 2e6, z: 0 }], speedMps: 5 }
    const first = stepShip(dd, s, orders, { dt: DT, tick: 1 })
    expect(first.headingRad).toBeCloseTo(dd.turnRateRadPerS * DT, 12)
    const ticksToTurn = Math.ceil((Math.PI / 2) / (dd.turnRateRadPerS * DT))
    for (let i = 0; i < ticksToTurn + 5; i++) s = stepShip(dd, s, orders, { dt: DT, tick: i + 1 })
    // Precision 3, not 6: by now the ship has drifted 100-150 m off the
    // waypoint line, which over a 1e6 m leg is a 1e-4 rad bearing change.
    expect(s.headingRad).toBeCloseTo(Math.PI / 2, 3)
  })

  it('turns the short way round', () => {
    // Heading just west of north, waypoint just east of north: must turn right, not 350 degrees left.
    const s = createShipState({ position: v3(0, 0, 0), headingRad: -0.1, speedMps: 5 })
    const orders: ShipOrders = { waypoints: [{ x: Math.sin(0.1) * 1e6, z: -Math.cos(0.1) * 1e6 }, { x: 0, z: -2e6 }], speedMps: 5 }
    const next = stepShip(dd, s, orders, { dt: DT, tick: 1 })
    expect(next.headingRad).toBeGreaterThan(-0.1)
  })

  it('visits a square loop in order and repeats it', () => {
    const side = 2000
    const orders: ShipOrders = {
      waypoints: [{ x: 0, z: 0 }, { x: side, z: 0 }, { x: side, z: side }, { x: 0, z: side }],
      speedMps: dd.maxSpeedMps,
    }
    let s = createShipState({ position: v3(0, 0, 0), headingRad: Math.PI / 2, speedMps: dd.maxSpeedMps, waypoint: 1 })
    const visited: number[] = [1]
    // Long enough for more than one lap at 18.8 m/s over an 8 km perimeter.
    for (let i = 0; i < 60 * 1200; i++) {
      s = stepShip(dd, s, orders, { dt: DT, tick: i + 1 })
      if (s.waypoint !== visited[visited.length - 1]) visited.push(s.waypoint)
    }
    expect(visited.slice(0, 6)).toEqual([1, 2, 3, 0, 1, 2])
    // A Fletcher at 18.8 m/s and 3 deg/s has a 359 m turning radius and
    // legitimately swings out past each corner.
    expect(Math.abs(s.position.x - side / 2)).toBeLessThan(side / 2 + 2 * dd.maxSpeedMps / dd.turnRateRadPerS)
  })

  it('is deterministic: two runs of the same orders are equal', () => {
    const run = () => {
      let s = createShipState({ position: v3(10, 0, 20), headingRad: 1, speedMps: 3 })
      for (let i = 0; i < 300; i++) s = stepShip(cv, s, straight(10, 20), { dt: DT, tick: i + 1 })
      return s
    }
    expect(run()).toEqual(run())
  })
})

describe('assertLoopOverWater', () => {
  const header = parseTerrainHeader({
    centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000,
    finestSamples: 8193, levels: 13, encoding: 'int16-decimetres',
  })
  // 3x3 field: land (+50 m) in the north-west sample only, sea elsewhere.
  const heights = new Int16Array(9)
  heights[0] = 500
  const field = createTerrainField(header, 12, heights)

  it('accepts a loop that stays at sea', () => {
    expect(() =>
      assertLoopOverWater('dd-1', { waypoints: [{ x: 50000, z: 50000 }, { x: 60000, z: 50000 }], speedMps: 5 }, field),
    ).not.toThrow()
  })

  it('names the ship, the leg and the sample that touches land', () => {
    expect(() =>
      assertLoopOverWater('dd-1', { waypoints: [{ x: -99000, z: -99000 }, { x: 0, z: 0 }], speedMps: 5 }, field),
    ).toThrow(/dd-1.*leg 0/)
  })
})


describe('carrier content consistency', () => {
  it('rejects inverted cue ranges and accepts equal boundaries', () => {
    expect(() => parseShipSpec({ ...cv, paddles: { ...cv.paddles!, cutRangeM: cv.paddles!.waveOffRangeM + 1 } })).toThrow(/cutRangeM.*waveOffRangeM/)
    expect(() => parseShipSpec({ ...cv, paddles: { ...cv.paddles!, waveOffRangeM: cv.paddles!.maxRangeM + 1 } })).toThrow(/waveOffRangeM.*maxRangeM/)
    expect(() => parseShipSpec({ ...cv, paddles: { ...cv.paddles!, cutRangeM: 100, waveOffRangeM: 100, maxRangeM: 100 } })).not.toThrow()
  })

  it('requires the hull and flight deck to agree on height', () => {
    expect(() => parseShipSpec({ ...cv, flightDeck: { ...cv.flightDeck!, heightM: cv.deckHeightM + 1 } })).toThrow(/flightDeck.heightM.*deckHeightM/)
    expect(() => parseShipSpec(cv)).not.toThrow()
    expect(() => parseShipSpec(dd)).not.toThrow()
  })
})
