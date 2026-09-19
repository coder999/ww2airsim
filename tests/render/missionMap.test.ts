import { describe, expect, it } from 'vitest'
import { loadScenarioBundle } from '../../tools/content/load.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import {
  chartBounds,
  courseLabel,
  courseTo,
  mapPoints,
  projectPoint,
  selectedPoint,
  type MapPoint,
} from '../../src/render/missionMap.js'

const world = worldFromScenario(loadScenarioBundle('free-flight'), null)

const point = (x: number, z: number): MapPoint => ({
  id: `${x}:${z}`,
  kind: 'player',
  label: 'test',
  x,
  z,
  targetable: false,
})

describe('the Plan 14 navigation chart model', () => {
  it('reads every current marker from the real free-flight world', () => {
    const points = mapPoints(world)
    expect(points).toHaveLength(7)
    expect(points).toContainEqual(expect.objectContaining({ id: 'player:f6f-1', label: 'YOU', kind: 'player' }))
    expect(points).toContainEqual(expect.objectContaining({ id: 'airfield:tacloban', label: 'Tacloban', targetable: true }))
    expect(points).toContainEqual(expect.objectContaining({ id: 'airfield:dulag', label: 'Dulag', targetable: true }))
    expect(points).toContainEqual(expect.objectContaining({ id: 'ship:cv-1', kind: 'carrier', targetable: true }))
    expect(points).toContainEqual(expect.objectContaining({ id: 'ship:dd-1', kind: 'ship', targetable: false }))
    expect(points).toContainEqual(expect.objectContaining({ id: 'ship:dd-2', kind: 'ship', targetable: false }))
    expect(points).toContainEqual(expect.objectContaining({ id: 'aircraft:f6f-2', kind: 'aircraft', targetable: false }))
  })

  it('reads a carrier position from its live state, not a static waypoint', () => {
    const ships = world.ships.map((ship) =>
      ship.id === 'cv-1'
        ? { ...ship, state: { ...ship.state, position: v3(1234, 0, -5678) } }
        : ship,
    )
    const moved = { ...world, ships }
    expect(mapPoints(moved).find((p) => p.id === 'ship:cv-1')).toEqual(
      expect.objectContaining({ x: 1234, z: -5678 }),
    )
  })

  it('measures true bearings clockwise from north, including the wraparound', () => {
    expect(courseTo(point(0, 0), point(0, -100)).bearingDeg).toBeCloseTo(0, 12)
    expect(courseTo(point(0, 0), point(100, 0)).bearingDeg).toBeCloseTo(90, 12)
    expect(courseTo(point(0, 0), point(0, 100)).bearingDeg).toBeCloseTo(180, 12)
    expect(courseTo(point(0, 0), point(-100, 0)).bearingDeg).toBeCloseTo(270, 12)
    expect(courseTo(point(0, 0), point(-1, -100)).bearingDeg).toBeGreaterThan(359)
  })

  it('reports a horizontal zero-range course without a NaN', () => {
    expect(courseTo(point(4, -3), point(4, -3))).toEqual({ distanceM: 0, bearingDeg: 0 })
  })

  it('formats a padded true course with meters or kilometers', () => {
    expect(courseLabel(point(0, 0), point(0, -12_500))).toBe('Course 000° · 12.5 km')
    expect(courseLabel(point(4, -3), point(4, -3))).toBe('Course 000° · 0 m')
  })

  it('gives even one marker a finite padded chart', () => {
    const bounds = chartBounds([point(20, -30)])
    expect(bounds.maxX).toBeGreaterThan(bounds.minX)
    expect(bounds.maxZ).toBeGreaterThan(bounds.minZ)
    expect(Object.values(bounds).every(Number.isFinite)).toBe(true)
  })

  it('preserves the x:z scale and puts north above south', () => {
    const bounds = { minX: 0, maxX: 200, minZ: 0, maxZ: 100 }
    const origin = projectPoint(point(0, 0), bounds, 400, 400)
    const east = projectPoint(point(100, 0), bounds, 400, 400)
    const south = projectPoint(point(0, 100), bounds, 400, 400)
    expect(east.x - origin.x).toBeCloseTo(south.y - origin.y, 12)
    expect(south.y).toBeGreaterThan(origin.y)
  })

  it('selects only real recovery points and ignores stale or non-targetable ids', () => {
    const points = mapPoints(world)
    expect(selectedPoint(points, 'airfield:tacloban')).toEqual(expect.objectContaining({ label: 'Tacloban' }))
    expect(selectedPoint(points, 'ship:dd-1')).toBeNull()
    expect(selectedPoint(points, 'gone')).toBeNull()
    expect(selectedPoint(points, null)).toBeNull()
  })
})
