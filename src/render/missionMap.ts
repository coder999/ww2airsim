import { playerAircraft, type World } from '../sim/loop.js'
import { localToWorld } from '../sim/world/airfields.js'

/** A point the Plan 14 navigation chart can draw from the live world. */
export type MapPointKind = 'player' | 'airfield' | 'carrier' | 'ship' | 'aircraft'

export type MapPoint = {
  /** Kind-prefixed rather than a raw entity id: a future base and ship may
   * legitimately share an id without making selection ambiguous. */
  readonly id: string
  readonly kind: MapPointKind
  readonly label: string
  readonly x: number
  readonly z: number
  /** Friendly recovery points are selectable; the initial scenario has no
   * enemy/objective content to pretend is a navigation target. */
  readonly targetable: boolean
}

/** Chart-space bounds in world meters. +x is east, +z is south. */
export type ChartBounds = {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}

export type ChartProjection = { readonly x: number; readonly y: number }

export type NavigationCourse = {
  /** Straight-line horizontal range, in world meters. */
  readonly distanceM: number
  /** True bearing clockwise from north, normalized to [0, 360). */
  readonly bearingDeg: number
}

const MIN_CHART_SPAN_M = 2_000
const CHART_PADDING_FRACTION = 0.12

/**
 * The chart's render-owned view of a live world. It names no coordinate or
 * entity literal: every point comes from the scenario-built world Plan 12
 * made authoritative, so a sailing carrier cannot disagree with its scene
 * mesh and a later scenario extends this list through data rather than UI
 * conditionals.
 */
export function mapPoints<M>(world: World<M>): readonly MapPoint[] {
  const player = playerAircraft(world)
  return [
    {
      id: `player:${player.id}`,
      kind: 'player',
      label: 'YOU',
      x: player.state.position.x,
      z: player.state.position.z,
      targetable: false,
    },
    ...world.airfields.map((airfield) => {
      const center = localToWorld(airfield, 0, 0)
      return {
        id: `airfield:${airfield.id}`,
        kind: 'airfield' as const,
        label: airfield.name,
        x: center.x,
        z: center.z,
        targetable: true,
      }
    }),
    ...world.ships.map((ship) => ({
      id: `ship:${ship.id}`,
      kind: ship.spec.role === 'carrier' ? 'carrier' as const : 'ship' as const,
      label: ship.spec.name,
      x: ship.state.position.x,
      z: ship.state.position.z,
      targetable: ship.spec.role === 'carrier',
    })),
    ...world.aircraft
      .filter((aircraft) => aircraft.id !== player.id)
      .map((aircraft) => ({
        id: `aircraft:${aircraft.id}`,
        kind: 'aircraft' as const,
        label: aircraft.id,
        x: aircraft.state.position.x,
        z: aircraft.state.position.z,
        targetable: false,
      })),
  ]
}

/** Returns a finite padded envelope; even one marker has a readable chart. */
export function chartBounds(points: readonly MapPoint[]): ChartBounds {
  if (points.length === 0) throw new Error('A navigation chart needs at least one point')
  const xs = points.map((point) => point.x)
  const zs = points.map((point) => point.z)
  const rawSpanX = Math.max(...xs) - Math.min(...xs)
  const rawSpanZ = Math.max(...zs) - Math.min(...zs)
  const span = Math.max(rawSpanX, rawSpanZ, MIN_CHART_SPAN_M)
  const padding = span * CHART_PADDING_FRACTION
  return {
    minX: Math.min(...xs) - padding,
    maxX: Math.max(...xs) + padding,
    minZ: Math.min(...zs) - padding,
    maxZ: Math.max(...zs) + padding,
  }
}

/**
 * Project with one meter-to-pixel scale on both axes. The unused part of a
 * nonmatching viewport is letterboxed, preserving the world rather than
 * stretching Leyte to fit an arbitrary browser rectangle.
 */
export function projectPoint(
  point: Pick<MapPoint, 'x' | 'z'>,
  bounds: ChartBounds,
  width: number,
  height: number,
): ChartProjection {
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error('Chart dimensions must be finite and positive')
  }
  const spanX = bounds.maxX - bounds.minX
  const spanZ = bounds.maxZ - bounds.minZ
  if (!(spanX > 0) || !(spanZ > 0) || !Number.isFinite(spanX) || !Number.isFinite(spanZ)) {
    throw new Error('Chart bounds must have finite positive spans')
  }
  const scale = Math.min(width / spanX, height / spanZ)
  const contentWidth = spanX * scale
  const contentHeight = spanZ * scale
  return {
    x: (width - contentWidth) / 2 + (point.x - bounds.minX) * scale,
    // +z is south, so it increases down the screen. North is therefore up.
    y: (height - contentHeight) / 2 + (point.z - bounds.minZ) * scale,
  }
}

/** Straight-line chart course from `from` to `to`, clockwise from north. */
export function courseTo(from: Pick<MapPoint, 'x' | 'z'>, to: Pick<MapPoint, 'x' | 'z'>): NavigationCourse {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const bearingDeg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360
  if (dx === 0 && dz === 0) return { distanceM: 0, bearingDeg: 0 }
  return { distanceM: Math.hypot(dx, dz), bearingDeg }
}

/** Only a targetable map point may become the selected navigation destination. */
export function selectedPoint(points: readonly MapPoint[], id: string | null): MapPoint | null {
  if (id === null) return null
  return points.find((point) => point.id === id && point.targetable) ?? null
}
