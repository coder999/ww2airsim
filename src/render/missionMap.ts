import { playerAircraft, type World } from '../sim/loop.js'
import { localToWorld } from '../sim/world/airfields.js'
import { BINDINGS } from '../input/bindings.js'
import { keyLabel } from './legend.js'

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

/** Human-readable true course and horizontal range for the chart status line. */
export function courseLabel(from: Pick<MapPoint, 'x' | 'z'>, to: Pick<MapPoint, 'x' | 'z'>): string {
  const course = courseTo(from, to)
  const bearing = Math.round(course.bearingDeg) % 360
  const range =
    course.distanceM >= 1_000
      ? `${(course.distanceM / 1_000).toFixed(1)} km`
      : `${Math.round(course.distanceM)} m`
  return `Course ${String(bearing).padStart(3, '0')}° · ${range}`
}

export type MissionMapHandle = {
  /** Rebuild from the supplied live world; no entity coordinate is cached. */
  show<M>(world: World<M>, selectedId: string | null): void
  hide(): void
}

export type MissionMapOptions = {
  readonly onClose: () => void
  readonly onSelect: (id: string) => void
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const CHART_WIDTH = 800
const CHART_HEIGHT = 520

const svgElement = (name: string): SVGElement => document.createElementNS(SVG_NS, name)

/**
 * The thin DOM half of the navigation chart. All geography is already pure
 * above; this function only turns its model into an accessible modal. It owns
 * no flight state and its selection callback is intentionally the entry
 * point's responsibility, so a click cannot write into `World`.
 */
export function createMissionMap(root: HTMLElement, options: MissionMapOptions): MissionMapHandle {
  const backdrop = document.createElement('div')
  backdrop.style.cssText =
    'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
    'background:rgba(8,10,14,.58);z-index:11'
  const panel = document.createElement('section')
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-label', 'Navigation chart')
  panel.style.cssText =
    'width:min(900px,calc(100vw - 32px));padding:16px 18px;border:1px solid #5a7188;' +
    'border-radius:6px;background:#101820;color:#e7f0fa;font:13px/1.45 ui-monospace,Menlo,monospace;' +
    'box-shadow:0 12px 40px rgba(0,0,0,.55)'
  backdrop.appendChild(panel)
  root.appendChild(backdrop)

  const heading = document.createElement('h2')
  heading.textContent = 'NAVIGATION CHART'
  heading.style.cssText = 'margin:0;font:700 18px/1.2 ui-monospace,Menlo,monospace;letter-spacing:.1em'
  panel.appendChild(heading)

  const close = document.createElement('button')
  close.textContent = `Close (${keyLabel(BINDINGS.toggleMissionMap[0])})`
  close.setAttribute('aria-label', 'Close navigation chart')
  close.style.cssText =
    'float:right;margin-top:-25px;padding:5px 10px;border:1px solid #7d93a8;border-radius:4px;' +
    'background:#e7f0fa;color:#101820;font:12px ui-monospace,Menlo,monospace;cursor:pointer'
  close.addEventListener('click', () => options.onClose())
  panel.appendChild(close)

  const detail = document.createElement('div')
  detail.setAttribute('aria-live', 'polite')
  detail.style.cssText = 'min-height:22px;margin:8px 0;color:#b9d3e8'
  panel.appendChild(detail)

  const svg = svgElement('svg')
  svg.setAttribute('viewBox', `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`)
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', 'Navigation chart, north at the top')
  svg.setAttribute('width', '100%')
  svg.style.cssText = 'display:block;border:1px solid #50677e;background:#16232e;max-height:62vh'
  panel.appendChild(svg)

  const instruction = document.createElement('p')
  instruction.style.cssText = 'margin:8px 0 0;color:#a9bac8'
  instruction.textContent = 'Select an airfield or carrier for course and range. North is up.'
  panel.appendChild(instruction)

  const drawMarker = <M>(world: World<M>, point: MapPoint, selectedId: string | null): void => {
    const points = mapPoints(world)
    const projection = projectPoint(point, chartBounds(points), CHART_WIDTH, CHART_HEIGHT)
    const marker = svgElement('g')
    const selected = point.id === selectedId
    const color =
      point.kind === 'player' ? '#ffe16a' : point.kind === 'airfield' ? '#7ce0a3' : point.kind === 'carrier' ? '#89c7ff' : '#c3cbd4'

    if (point.targetable) {
      marker.setAttribute('role', 'button')
      marker.setAttribute('tabindex', '0')
      marker.setAttribute('aria-label', `Set ${point.label} as navigation destination`)
      marker.style.cursor = 'pointer'
      const select = (): void => {
        options.onSelect(point.id)
        draw(world, point.id)
      }
      marker.addEventListener('click', select)
      marker.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          select()
        }
      })
    } else {
      marker.setAttribute('aria-label', point.label)
    }

    const dot = svgElement(point.kind === 'airfield' ? 'rect' : 'circle')
    if (point.kind === 'airfield') {
      dot.setAttribute('x', String(projection.x - 6))
      dot.setAttribute('y', String(projection.y - 6))
      dot.setAttribute('width', '12')
      dot.setAttribute('height', '12')
    } else {
      dot.setAttribute('cx', String(projection.x))
      dot.setAttribute('cy', String(projection.y))
      dot.setAttribute('r', point.kind === 'player' ? '8' : '6')
    }
    dot.setAttribute('fill', color)
    dot.setAttribute('stroke', selected ? '#ffffff' : '#0e151c')
    dot.setAttribute('stroke-width', selected ? '4' : '2')
    marker.appendChild(dot)

    const label = svgElement('text')
    label.setAttribute('x', String(projection.x + 10))
    label.setAttribute('y', String(projection.y - 9))
    label.setAttribute('fill', '#f2f7fb')
    label.setAttribute('font-size', '15')
    label.setAttribute('font-weight', point.kind === 'player' || selected ? '700' : '400')
    label.textContent = point.label
    marker.appendChild(label)
    svg.appendChild(marker)
  }

  const draw = <M>(world: World<M>, selectedId: string | null): void => {
    svg.replaceChildren()
    const points = mapPoints(world)
    const bounds = chartBounds(points)
    const player = points.find((point) => point.kind === 'player')!
    const selected = selectedPoint(points, selectedId)

    const north = svgElement('text')
    north.setAttribute('x', '18')
    north.setAttribute('y', '30')
    north.setAttribute('fill', '#a9bac8')
    north.setAttribute('font-size', '15')
    north.textContent = 'N ↑'
    svg.appendChild(north)

    if (selected !== null) {
      const from = projectPoint(player, bounds, CHART_WIDTH, CHART_HEIGHT)
      const to = projectPoint(selected, bounds, CHART_WIDTH, CHART_HEIGHT)
      const line = svgElement('line')
      line.setAttribute('x1', String(from.x))
      line.setAttribute('y1', String(from.y))
      line.setAttribute('x2', String(to.x))
      line.setAttribute('y2', String(to.y))
      line.setAttribute('stroke', '#ffe16a')
      line.setAttribute('stroke-width', '3')
      line.setAttribute('stroke-dasharray', '8 6')
      svg.appendChild(line)
      detail.textContent = `${selected.label} — ${courseLabel(player, selected)}`
    } else {
      detail.textContent = 'Select a friendly recovery point.'
    }

    for (const point of points) drawMarker(world, point, selected?.id ?? null)
  }

  return {
    show<M>(world: World<M>, selectedId: string | null): void {
      draw(world, selectedId)
      backdrop.style.display = 'flex'
      close.focus()
    },
    hide(): void {
      backdrop.style.display = 'none'
    },
  }
}
