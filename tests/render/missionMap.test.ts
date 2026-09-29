import { describe, expect, it } from 'vitest'
import { loadScenarioBundle } from '../../tools/content/load.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import {
  chartBounds,
  chartNeedsRedraw,
  visibleBounds,
  MARKER_ICONS,
  courseLabel,
  courseTo,
  labelPlacements,
  CLOSED_NAVIGATION_MAP,
  closeNavigationMap,
  openNavigationMap,
  selectNavigationDestination,
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

  it('marks an active destroy objective\'s resolved target, and leaves a mission-less world unchanged', () => {
    const missionWorld = worldFromScenario(loadScenarioBundle('dev-mission-ui'), null)
    const points = mapPoints(missionWorld)
    expect(points).toContainEqual(expect.objectContaining({ id: 'aircraft:target-1', objective: 'destroy', targetable: true }))

    // free-flight has no mission: today's exact expectations still pass, untouched.
    expect(mapPoints(world)).toHaveLength(7)
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

  it('formats a padded true course in nautical miles or feet', () => {
    expect(courseLabel(point(0, 0), point(0, -12_500))).toBe('Course 000° · 6.7 nm')
    expect(courseLabel(point(4, -3), point(4, -3))).toBe('Course 000° · 0 ft')
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

  it('stacks captions only where they would overlap and keeps every caption inside the chart', () => {
    const height = 520
    const at = (x: number, y: number, label = 'label'): { x: number; y: number; label: string } => ({ x, y, label })
    const apart = labelPlacements([at(100, 100), at(400, 300)], height)
    expect(apart.map((caption) => caption.y)).toEqual([91, 291])

    // A short caption beside a longer one to its right does not stack: no overlap.
    const beside = labelPlacements([at(100, 100, 'YOU'), at(160, 104, 'Essex-class fleet carrier')], height)
    expect(beside.map((caption) => caption.y)).toEqual([91, 95])

    // Three spawns on one spot near the top edge: the free-flight parking case.
    const top = labelPlacements([at(100, 30), at(100, 30), at(100, 30)], height)
    const topYs = top.map((caption) => caption.y)
    expect(new Set(topYs).size).toBe(3)
    for (const y of topYs) expect(y).toBeGreaterThanOrEqual(12)
    for (let i = 1; i < topYs.length; i++) expect(Math.abs(topYs[i]! - topYs[i - 1]!)).toBeGreaterThanOrEqual(18)

    // The same cluster on the bottom edge steps upward instead of leaving the chart.
    const bottom = labelPlacements([at(100, 512), at(100, 512), at(100, 512)], height)
    for (const caption of bottom) {
      expect(caption.y).toBeLessThanOrEqual(height - 4)
      expect(caption.y).toBeGreaterThanOrEqual(12)
    }
    expect(new Set(bottom.map((caption) => caption.y)).size).toBe(3)

    // The real world: every caption fits the chart, and the wingman, parked on
    // the player's spot, is captioned within three lines of the player.
    const points = mapPoints(world)
    const bounds = chartBounds(points)
    const live = labelPlacements(
      points.map((point) => ({ ...projectPoint(point, bounds, 800, height), label: point.label })),
      height,
    )
    expect(live).toHaveLength(points.length)
    for (const caption of live) {
      expect(caption.y).toBeGreaterThanOrEqual(12)
      expect(caption.y).toBeLessThanOrEqual(height - 4)
    }
    const playerIndex = points.findIndex((point) => point.kind === 'player')
    const wingmanIndex = points.findIndex((point) => point.kind === 'aircraft')
    expect(wingmanIndex).toBeGreaterThan(-1)
    expect(Math.abs(live[wingmanIndex]!.y - live[playerIndex]!.y)).toBeLessThanOrEqual(3 * 18)
  })

  it('preserves a running or manually paused frame state across a chart modal', () => {
    const running = openNavigationMap(CLOSED_NAVIGATION_MAP, false)
    expect(closeNavigationMap(running)).toEqual({
      state: { open: false, selectedId: null, pausedBeforeOpen: false }, restorePaused: false,
    })

    const paused = selectNavigationDestination(openNavigationMap(CLOSED_NAVIGATION_MAP, true), 'airfield:tacloban')
    expect(closeNavigationMap(paused)).toEqual({
      state: { open: false, selectedId: 'airfield:tacloban', pausedBeforeOpen: false }, restorePaused: true,
    })
  })
})

describe('the chart frame', () => {
  it('reports the letterboxed world rectangle the viewport shows', () => {
    const wide = visibleBounds({ minX: 0, maxX: 1000, minZ: 0, maxZ: 1000 }, 800, 520)
    expect(wide.maxX - wide.minX).toBeCloseTo(1000 * (800 / 520), 6)
    expect(wide.maxZ - wide.minZ).toBeCloseTo(1000, 6)
  })

  it('has a distinct icon for bases, carriers and other ships', () => {
    expect(new Set(Object.values(MARKER_ICONS).map((icon) => icon.body)).size).toBe(3)
  })
})

describe('when an open chart redraws', () => {
  const shown = { tick: 5, selectedId: null, terrain: world.terrain }

  it('holds still for the same tick, selection and terrain', () => {
    expect(chartNeedsRedraw(shown, { tick: 5, selectedId: null, terrain: world.terrain })).toBe(false)
  })

  it('redraws when terrain or cover attaches to a held world (same tick)', () => {
    const attached = { ...world.terrain! }
    expect(chartNeedsRedraw(shown, { tick: 5, selectedId: null, terrain: attached })).toBe(true)
  })

  it('redraws on a new tick, a new selection, or a first draw', () => {
    expect(chartNeedsRedraw(shown, { tick: 6, selectedId: null, terrain: world.terrain })).toBe(true)
    expect(chartNeedsRedraw(shown, { tick: 5, selectedId: 'a', terrain: world.terrain })).toBe(true)
    expect(chartNeedsRedraw(null, shown)).toBe(true)
  })
})
