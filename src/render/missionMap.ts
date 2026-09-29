import { playerAircraft, type World } from '../sim/loop.js'
import { localToWorld } from '../sim/world/airfields.js'
import type { TerrainField } from '../sim/world/terrain.js'
import { BINDINGS } from '../input/bindings.js'
import { keyLabel } from './legend.js'
import { objectiveMarks, objectiveRows } from './mission/chart.js'
import { pathData } from './mission/chartIso.js'
import { buildChartLayers, type ChartLayers } from './mission/chartLayers.js'
import { CHART, ensurePatternDefs, paint, PATTERN_CROP, PATTERN_SWAMP } from './mission/chartStyle.js'
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
const MARGIN_L = 52
const MARGIN_T = 14
const MARGIN_R = 14
const MARGIN_B = 30

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
  ensurePatternDefs()
  const backdrop = document.createElement('div')
  backdrop.style.cssText =
    'position:fixed;inset:0;display:none;overflow-y:auto;background:rgba(8,10,14,.58);z-index:11'
  const frame = document.createElement('div')
  frame.className = 'naval-comms'
  frame.style.cssText = 'padding:24px 16px 40px'
  const panel = document.createElement('section')
  panel.className = 'sheet'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-label', 'Navigation chart')
  frame.appendChild(panel)
  backdrop.appendChild(frame)
  root.appendChild(backdrop)

  const letterhead = document.createElement('div')
  letterhead.className = 'letterhead'
  const letterheadText = document.createElement('div')
  letterheadText.className = 'letterhead-text'
  const kicker = document.createElement('div')
  kicker.className = 'letterhead-kicker'
  kicker.textContent = 'Theater chart — Leyte Gulf'
  const heading = document.createElement('h2')
  heading.className = 'letterhead-title'
  heading.textContent = 'Navigation Chart'
  heading.style.fontWeight = 'normal'
  letterheadText.append(kicker, heading)
  const formNumber = document.createElement('div')
  formNumber.className = 'form-number'
  formNumber.textContent = 'FORM NAV-1'
  const close = document.createElement('button')
  close.className = 'ink-button'
  close.textContent = `Close (${keyLabel(BINDINGS.toggleMissionMap[0])})`
  close.setAttribute('aria-label', 'Close navigation chart')
  close.addEventListener('click', () => options.onClose())
  letterhead.append(letterheadText, formNumber, close)
  panel.appendChild(letterhead)

  const detail = document.createElement('div')
  detail.setAttribute('aria-live', 'polite')
  detail.style.cssText = 'min-height:22px;margin:0 0 8px;color:var(--ink);font-size:14px'
  panel.appendChild(detail)

  const svg = svgElement('svg')
  svg.setAttribute('viewBox', `0 0 ${CHART_WIDTH + MARGIN_L + MARGIN_R} ${CHART_HEIGHT + MARGIN_T + MARGIN_B}`)
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', 'Navigation chart, north at the top')
  svg.setAttribute('width', '100%')
  svg.style.cssText = 'display:block;background:var(--paper-deep);border:1px solid var(--paper-edge);max-height:66vh'
  panel.appendChild(svg)

  const legend = document.createElement('div')
  legend.style.cssText =
    'display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:8px;font-size:11.5px;color:var(--ink-faint)'
  panel.appendChild(legend)

  const instruction = document.createElement('p')
  instruction.style.cssText = 'margin:8px 0 0;color:var(--ink-faint);font-size:12px'
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
    layer: SVGElement,
  ): void => {
    const marker = svgElement('g')
    const selected = point.id === selectedId
    const color =
      point.objective === 'destroy' ? 'var(--stamp-red)' :
      point.objective === 'protect' ? 'var(--stamp-violet)' :
      point.kind === 'player' ? 'var(--stamp-red)' :
      point.kind === 'airfield' ? 'var(--ink)' :
      point.kind === 'carrier' ? 'var(--stamp-blue)' : 'var(--ink-faint)'

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
      paint(ring, { fill: 'none', stroke: color, 'stroke-width': selected ? '3' : '2', 'stroke-dasharray': '6 5' })
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
        paint(body, {
          fill: color,
          stroke: selected ? 'var(--stamp-red)' : 'var(--paper)',
          'stroke-width': selected ? '3' : '1.5',
          'stroke-linejoin': 'round',
        })
        glyph.appendChild(body)
        const detail = svgElement('path')
        detail.setAttribute('d', icon.detail)
        paint(detail, { fill: 'none', stroke: 'var(--paper)', 'stroke-width': '1.5' })
        glyph.appendChild(detail)
        marker.appendChild(glyph)
      } else {
        const dot = svgElement('circle')
        dot.setAttribute('cx', String(projection.x))
        dot.setAttribute('cy', String(projection.y))
        dot.setAttribute('r', point.kind === 'player' ? '8' : '6')
        paint(dot, { fill: color, stroke: selected ? 'var(--stamp-red)' : 'var(--paper)', 'stroke-width': selected ? '4' : '2' })
        marker.appendChild(dot)
      }
    }

    const label = svgElement('text')
    label.setAttribute('x', String(caption.x))
    label.setAttribute('y', String(caption.y))
    paint(label, {
      fill: 'var(--ink)',
      stroke: 'var(--paper)',
      'stroke-width': '3',
      'paint-order': 'stroke',
      'font-family': 'var(--font-body)',
      'pointer-events': 'none',
    })
    label.setAttribute('font-size', '15')
    label.setAttribute('font-weight', point.kind === 'player' || selected ? '700' : '400')
    label.textContent = point.label
    layer.appendChild(marker)
    layer.appendChild(label)
  }

  let layerCache: { terrain: TerrainField | null | undefined; key: string; layers: ChartLayers } | null = null

  const draw = <M>(world: World<M>, selectedId: string | null): void => {
    svg.replaceChildren()
    const points = mapPoints(world)
    const bounds = chartBounds(points)
    const player = points.find((point) => point.kind === 'player')!
    const selected = selectedPoint(points, selectedId)
    const project = (x: number, z: number): ChartProjection => projectPoint({ x, z }, bounds, CHART_WIDTH, CHART_HEIGHT)
    const area = visibleBounds(bounds, CHART_WIDTH, CHART_HEIGHT)
    const key = `${area.minX}|${area.maxX}|${area.minZ}|${area.maxZ}|${world.terrain?.cover === undefined ? 0 : 1}`
    if (layerCache === null || layerCache.terrain !== world.terrain || layerCache.key !== key) {
      layerCache = { terrain: world.terrain, key, layers: buildChartLayers(world.terrain, area) }
    }
    const layers = layerCache.layers

    const clip = svgElement('clipPath')
    clip.id = 'chart-clip'
    const clipRect = svgElement('rect')
    clipRect.setAttribute('width', String(CHART_WIDTH))
    clipRect.setAttribute('height', String(CHART_HEIGHT))
    clip.appendChild(clipRect)
    svg.appendChild(clip)

    const sheet = svgElement('g')
    sheet.setAttribute('transform', `translate(${MARGIN_L} ${MARGIN_T})`)
    svg.appendChild(sheet)
    const water = svgElement('rect')
    water.setAttribute('width', String(CHART_WIDTH))
    water.setAttribute('height', String(CHART_HEIGHT))
    water.setAttribute('fill', CHART.water)
    sheet.appendChild(water)
    const content = svgElement('g')
    content.setAttribute('clip-path', 'url(#chart-clip)')
    sheet.appendChild(content)

    const addPath = (lines: ChartLayers['land'], css: Record<string, string>): void => {
      const d = pathData(lines, project)
      if (d === '') return
      const path = svgElement('path')
      path.setAttribute('d', d)
      paint(path, { 'pointer-events': 'none', ...css })
      content.appendChild(path)
    }
    // Water-lining first: the land wash then covers its inland half.
    addPath(layers.coast, { fill: 'none', stroke: CHART.waterLining, 'stroke-width': '7', opacity: '0.55', 'stroke-linejoin': 'round' })
    addPath(layers.land, { fill: CHART.wash, 'fill-rule': 'evenodd' })
    addPath(layers.crop, { fill: `url(#${PATTERN_CROP})`, 'fill-rule': 'evenodd' })
    addPath(layers.woodland, { fill: CHART.woodland, 'fill-opacity': '0.5', stroke: CHART.woodlandEdge, 'stroke-width': '0.7', 'fill-rule': 'evenodd' })
    addPath(layers.mangrove, { fill: `url(#${PATTERN_SWAMP})`, 'fill-rule': 'evenodd' })
    for (const contour of layers.contours) {
      addPath(contour.lines, { fill: 'none', stroke: CHART.contour, 'stroke-width': contour.index ? '1.1' : '0.5', 'stroke-linejoin': 'round' })
    }
    addPath(layers.coast, { fill: 'none', stroke: 'var(--ink)', 'stroke-width': '1.3', 'stroke-linejoin': 'round' })

    if (selected !== null) {
      const from = project(player.x, player.z)
      const to = project(selected.x, selected.z)
      const line = svgElement('line')
      line.setAttribute('x1', String(from.x))
      line.setAttribute('y1', String(from.y))
      line.setAttribute('x2', String(to.x))
      line.setAttribute('y2', String(to.y))
      paint(line, { stroke: 'var(--stamp-red)', 'stroke-width': '2.5', 'stroke-dasharray': '8 6' })
      content.appendChild(line)
      detail.textContent = `${selected.label} — ${courseLabel(player, selected)}`
    } else {
      detail.textContent = 'Select a friendly recovery point.'
    }

    const projections = points.map((point) => projectPoint(point, bounds, CHART_WIDTH, CHART_HEIGHT))
    const captions = labelPlacements(
      projections.map((projection, index) => ({ ...projection, label: points[index]!.label })),
      CHART_HEIGHT,
    )
    points.forEach((point, index) =>
      drawMarker(world, point, projections[index]!, captions[index]!, selected?.id ?? null, bounds, content),
    )

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
      backdrop.style.display = 'block'
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
