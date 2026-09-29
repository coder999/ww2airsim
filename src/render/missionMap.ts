import { playerAircraft, type World } from '../sim/loop.js'
import { localToWorld } from '../sim/world/airfields.js'
import { heightAt, type TerrainField } from '../sim/world/terrain.js'
import { BINDINGS } from '../input/bindings.js'
import { keyLabel } from './legend.js'
import { objectiveMarks, objectiveRows } from './mission/chart.js'
import { figureRow, sectionTitle } from './ui/navalComms.js'

/** A point the Plan 14 navigation chart can draw from the live world. */
export type MapPointKind = 'player' | 'airfield' | 'carrier' | 'ship' | 'aircraft' | 'structure' | 'station'

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
  /** Set by an active mission objective (Task 7, spec §5): `destroy`/`deny`
   *  targets and `protect` targets get their marker colored accordingly. */
  readonly objective?: 'destroy' | 'protect' | 'station'
  /** A `station` point's ring radius, in world meters. */
  readonly radiusM?: number
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
  const marks = objectiveMarks(world)
  const objectiveOf = (id: string): { readonly objective: 'destroy' | 'protect' } | Record<string, never> => {
    const objective = marks.targets.get(id)
    return objective === undefined ? {} : { objective }
  }
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
      targetable: ship.spec.role === 'carrier' || marks.targets.has(ship.id),
      ...objectiveOf(ship.id),
    })),
    ...world.aircraft
      .filter((aircraft) => aircraft.id !== player.id)
      .map((aircraft) => ({
        id: `aircraft:${aircraft.id}`,
        kind: 'aircraft' as const,
        label: aircraft.id,
        x: aircraft.state.position.x,
        z: aircraft.state.position.z,
        targetable: marks.targets.has(aircraft.id),
        ...objectiveOf(aircraft.id),
      })),
    ...marks.structures,
    ...marks.stations,
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

/** The world rectangle the letterboxed viewport actually shows, which is
 * larger than `bounds` on whichever axis the viewport is longer. */
export function visibleBounds(bounds: ChartBounds, width: number, height: number): ChartBounds {
  const scale = Math.min(width / (bounds.maxX - bounds.minX), height / (bounds.maxZ - bounds.minZ))
  const halfX = width / scale / 2
  const halfZ = height / scale / 2
  const cx = (bounds.minX + bounds.maxX) / 2
  const cz = (bounds.minZ + bounds.maxZ) / 2
  return { minX: cx - halfX, maxX: cx + halfX, minZ: cz - halfZ, maxZ: cz + halfZ }
}

export type CoastSegment = readonly [x1: number, z1: number, x2: number, z2: number]

/** Any sample above this is land; the coast pass writes the shoreline at 0.3 m or more. */
const LAND_THRESHOLD_M = 0.15
const COAST_GRID_COLUMNS = 160

/**
 * The shoreline inside `area` as world-space line segments: marching squares
 * over `heightAt` at the land threshold, with each crossing interpolated
 * along its cell edge. No terrain, or all sea, gives no segments.
 */
export function coastSegments(terrain: TerrainField | null | undefined, area: ChartBounds): readonly CoastSegment[] {
  if (terrain === null || terrain === undefined) return []
  const cols = COAST_GRID_COLUMNS
  const rows = Math.max(1, Math.round((cols * (area.maxZ - area.minZ)) / (area.maxX - area.minX)))
  const dx = (area.maxX - area.minX) / cols
  const dz = (area.maxZ - area.minZ) / rows
  const heights: number[] = []
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) heights.push(heightAt(terrain, area.minX + c * dx, area.minZ + r * dz))
  }
  const at = (c: number, r: number): number => heights[r * (cols + 1) + c]!
  const cross = (a: number, b: number): number => (LAND_THRESHOLD_M - a) / (b - a)
  const out: CoastSegment[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tl = at(c, r)
      const tr = at(c + 1, r)
      const br = at(c + 1, r + 1)
      const bl = at(c, r + 1)
      const x0 = area.minX + c * dx
      const z0 = area.minZ + r * dz
      const top = { x: x0 + cross(tl, tr) * dx, z: z0 }
      const bottom = { x: x0 + cross(bl, br) * dx, z: z0 + dz }
      const left = { x: x0, z: z0 + cross(tl, bl) * dz }
      const right = { x: x0 + dx, z: z0 + cross(tr, br) * dz }
      const index =
        (tl > LAND_THRESHOLD_M ? 8 : 0) | (tr > LAND_THRESHOLD_M ? 4 : 0) |
        (br > LAND_THRESHOLD_M ? 2 : 0) | (bl > LAND_THRESHOLD_M ? 1 : 0)
      const link = (a: { x: number; z: number }, b: { x: number; z: number }): void => {
        out.push([a.x, a.z, b.x, b.z])
      }
      switch (index) {
        case 1: case 14: link(left, bottom); break
        case 2: case 13: link(bottom, right); break
        case 3: case 12: link(left, right); break
        case 4: case 11: link(top, right); break
        case 6: case 9: link(top, bottom); break
        case 7: case 8: link(left, top); break
        case 5: link(left, top); link(bottom, right); break
        case 10: link(top, right); link(left, bottom); break
        default: break
      }
    }
  }
  return out
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
const LABEL_DX = 10
const LABEL_FIRST_DY = -9
const LABEL_LINE_PX = 18
const LABEL_CHAR_PX = 9.5
const LABEL_EDGE_PX = 4

export type LabelPlacement = { readonly x: number; readonly y: number }

/**
 * Caption anchors for markers in draw order. Scenario spawns frequently share
 * an exact start position (the player, its wingman and the airfield they sit
 * on), so a caption whose estimated text box overlaps an already placed one
 * steps down a line; if that would leave the chart it steps up instead.
 * Width is estimated from the label length at the chart's 15 px monospace
 * face, generously, so a caption only stacks when it would really overlap
 * and otherwise stays beside its own marker. Marker positions never move.
 */
export function labelPlacements(
  captions: readonly (ChartProjection & { readonly label: string })[],
  height: number,
): readonly LabelPlacement[] {
  const placed: (LabelPlacement & { readonly width: number })[] = []
  const collides = (x: number, y: number, width: number): boolean =>
    placed.some(
      (other) => x < other.x + other.width && other.x < x + width && Math.abs(other.y - y) < LABEL_LINE_PX,
    )
  for (const caption of captions) {
    const x = caption.x + LABEL_DX
    const width = caption.label.length * LABEL_CHAR_PX
    const base = caption.y + LABEL_FIRST_DY
    let y = base
    let step = 0
    while (collides(x, y, width) && y + LABEL_LINE_PX <= height - LABEL_EDGE_PX) y = base + LABEL_LINE_PX * ++step
    if (y + LABEL_LINE_PX > height - LABEL_EDGE_PX || collides(x, y, width)) {
      y = base
      step = 0
      while (collides(x, y, width)) y = base - LABEL_LINE_PX * ++step
    }
    placed.push({ x, y, width })
  }
  return placed
}

/**
 * Marker glyphs in a 24 x 24 box centered on the point, drawn pointing
 * nowhere in particular: the chart has no heading for a base or ship.
 * `body` takes the selection/objective colors; `detail` is the dark relief.
 */
export const MARKER_ICONS = {
  airfield: {
    body: 'M0,-10 A10,10 0 1 1 0,10 A10,10 0 1 1 0,-10 Z',
    detail: 'M-7,0 H7 M0,-7 V7',
  },
  carrier: {
    body: 'M-13,0 H13 L10,6 H-11 Z',
    detail: 'M4,-6 H8 V0 H4 Z M-10,-1.5 H2',
  },
  ship: {
    body: 'M-10,0 H10 L6,6 H-8 Z',
    detail: 'M-4,-4 H2 V0 H-4 Z M-1,-8 V-4',
  },
} as const

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

  const objectivesList = document.createElement('div')
  objectivesList.setAttribute('aria-label', 'Objectives')
  objectivesList.style.cssText = 'margin-top:10px'
  panel.appendChild(objectivesList)

  const drawMarker = <M>(
    world: World<M>,
    point: MapPoint,
    projection: ChartProjection,
    caption: LabelPlacement,
    selectedId: string | null,
    bounds: ChartBounds,
  ): void => {
    const marker = svgElement('g')
    const selected = point.id === selectedId
    const color =
      point.objective === 'destroy' ? '#ff8a6a' :
      point.objective === 'protect' ? '#ffd27a' :
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
      marker.setAttribute('pointer-events', 'none')
    }

    if (point.kind === 'station') {
      const edge = projectPoint({ x: point.x + (point.radiusM ?? 0), z: point.z }, bounds, CHART_WIDTH, CHART_HEIGHT)
      const ring = svgElement('circle')
      ring.setAttribute('cx', String(projection.x))
      ring.setAttribute('cy', String(projection.y))
      ring.setAttribute('r', String(edge.x - projection.x))
      ring.setAttribute('fill', 'none')
      ring.setAttribute('stroke', color)
      ring.setAttribute('stroke-width', selected ? '3' : '2')
      ring.setAttribute('stroke-dasharray', '6 5')
      marker.appendChild(ring)
    } else {
      const icon = point.kind === 'airfield' || point.kind === 'carrier' || point.kind === 'ship' ? MARKER_ICONS[point.kind] : null
      if (icon !== null) {
        const glyph = svgElement('g')
        glyph.setAttribute('transform', `translate(${projection.x} ${projection.y})`)
        const hit = svgElement('circle')
        hit.setAttribute('r', '14')
        hit.setAttribute('fill', 'transparent')
        glyph.appendChild(hit)
        const body = svgElement('path')
        body.setAttribute('d', icon.body)
        body.setAttribute('fill', color)
        body.setAttribute('stroke', selected ? '#ffffff' : '#0e151c')
        body.setAttribute('stroke-width', selected ? '3' : '1.5')
        body.setAttribute('stroke-linejoin', 'round')
        glyph.appendChild(body)
        const detail = svgElement('path')
        detail.setAttribute('d', icon.detail)
        detail.setAttribute('fill', 'none')
        detail.setAttribute('stroke', '#0e151c')
        detail.setAttribute('stroke-width', '1.5')
        glyph.appendChild(detail)
        marker.appendChild(glyph)
      } else {
        const dot = svgElement('circle')
        dot.setAttribute('cx', String(projection.x))
        dot.setAttribute('cy', String(projection.y))
        dot.setAttribute('r', point.kind === 'player' ? '8' : '6')
        dot.setAttribute('fill', color)
        dot.setAttribute('stroke', selected ? '#ffffff' : '#0e151c')
        dot.setAttribute('stroke-width', selected ? '4' : '2')
        marker.appendChild(dot)
      }
    }

    const label = svgElement('text')
    label.setAttribute('x', String(caption.x))
    label.setAttribute('y', String(caption.y))
    label.setAttribute('fill', '#f2f7fb')
    label.setAttribute('pointer-events', 'none')
    label.setAttribute('font-size', '15')
    label.setAttribute('font-weight', point.kind === 'player' || selected ? '700' : '400')
    label.textContent = point.label
    svg.appendChild(marker)
    svg.appendChild(label)
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

    const coast = coastSegments(world.terrain, visibleBounds(bounds, CHART_WIDTH, CHART_HEIGHT))
    if (coast.length > 0) {
      const path = svgElement('path')
      path.setAttribute(
        'd',
        coast
          .map(([x1, z1, x2, z2]) => {
            const a = projectPoint({ x: x1, z: z1 }, bounds, CHART_WIDTH, CHART_HEIGHT)
            const b = projectPoint({ x: x2, z: z2 }, bounds, CHART_WIDTH, CHART_HEIGHT)
            return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`
          })
          .join(''),
      )
      path.setAttribute('fill', 'none')
      path.setAttribute('stroke', '#a99f72')
      path.setAttribute('stroke-width', '1.5')
      path.setAttribute('stroke-linecap', 'round')
      path.setAttribute('pointer-events', 'none')
      svg.appendChild(path)
    }

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

    const projections = points.map((point) => projectPoint(point, bounds, CHART_WIDTH, CHART_HEIGHT))
    const captions = labelPlacements(
      projections.map((projection, index) => ({ ...projection, label: points[index]!.label })),
      CHART_HEIGHT,
    )
    points.forEach((point, index) => drawMarker(world, point, projections[index]!, captions[index]!, selected?.id ?? null, bounds))

    const rows = objectiveRows(world.mission)
    objectivesList.replaceChildren()
    if (rows.length > 0) {
      objectivesList.appendChild(sectionTitle('OBJECTIVES'))
      for (const row of rows) objectivesList.appendChild(figureRow(`${row.label} (${row.priority})`, row.status))
    }
  }
  let shownTick: number | null = null
  let shownSelectedId: string | null = null

  return {
    show<M>(world: World<M>, selectedId: string | null): void {
      const wasHidden = backdrop.style.display === 'none'
      if (shownTick !== world.tick || shownSelectedId !== selectedId) {
        draw(world, selectedId)
        shownTick = world.tick
        shownSelectedId = selectedId
      }
      backdrop.style.display = 'flex'
      if (wasHidden) close.focus()
    },
    hide(): void {
      backdrop.style.display = 'none'
    },
  }
}

/** Page-furniture state for the chart. It deliberately stays out of
 * `FrameState`: no replay or simulation behavior depends on whether a pilot
 * is reading a modal. */
export type NavigationMapState = {
  readonly open: boolean
  readonly selectedId: string | null
  /** The manual pause state to restore when a chart that forced a hold closes. */
  readonly pausedBeforeOpen: boolean
}

export const CLOSED_NAVIGATION_MAP: NavigationMapState = {
  open: false,
  selectedId: null,
  pausedBeforeOpen: false,
}

export function openNavigationMap(state: NavigationMapState, pausedBeforeOpen: boolean): NavigationMapState {
  return { ...state, open: true, pausedBeforeOpen }
}

export function closeNavigationMap(state: NavigationMapState): {
  readonly state: NavigationMapState
  readonly restorePaused: boolean
} {
  return {
    state: { ...state, open: false, pausedBeforeOpen: false },
    restorePaused: state.pausedBeforeOpen,
  }
}

export function selectNavigationDestination(state: NavigationMapState, id: string): NavigationMapState {
  return { ...state, selectedId: id }
}
