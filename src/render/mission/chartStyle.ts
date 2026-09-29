const SVG_NS = 'http://www.w3.org/2000/svg'

/** Chart-only colors. Paper, ink and stamp colors come from `naval-comms.css`. */
export const CHART = {
  water: '#cdd8d4',
  waterLining: '#9fbac4',
  wash: '#f0e8cb',
  woodland: '#7f9a5b',
  woodlandEdge: '#5b7a3f',
  cropHatch: '#8a9a5a',
  swamp: '#4f7a6a',
  contour: '#9a6a3a',
} as const

export const PATTERN_CROP = 'chart-pat-crop'
export const PATTERN_SWAMP = 'chart-pat-swamp'
const DEFS_ID = 'chart-pattern-defs'

export function paint(el: SVGElement, css: Record<string, string>): void {
  for (const [property, value] of Object.entries(css)) el.style.setProperty(property, value)
}

/**
 * The hatch and tuft fills live in one hidden document-level SVG so the chart
 * and its legend swatches (separate <svg> elements) can both reference them;
 * `url(#id)` resolves against the whole document. Idempotent.
 */
export function ensurePatternDefs(): void {
  if (document.getElementById(DEFS_ID) !== null) return
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.id = DEFS_ID
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.setAttribute('aria-hidden', 'true')
  svg.style.cssText = 'position:absolute'
  svg.innerHTML =
    `<defs>` +
    `<pattern id="${PATTERN_CROP}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<line x1="0" y1="0" x2="0" y2="6" stroke="${CHART.cropHatch}" stroke-width="1.1"/></pattern>` +
    `<pattern id="${PATTERN_SWAMP}" width="10" height="8" patternUnits="userSpaceOnUse">` +
    `<path d="M2 6V3M4 6V2M6 6V3M1 6.5H7" stroke="${CHART.swamp}" stroke-width="1" fill="none"/></pattern>` +
    `</defs>`
  document.body.appendChild(svg)
}

const el = (name: string, attrs: Record<string, string> = {}): SVGElement => {
  const node = document.createElementNS(SVG_NS, name)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}
const text = (content: string, x: number, y: number, size: number, anchor: string): SVGElement => {
  const t = el('text', { x: String(x), y: String(y), 'font-size': String(size), 'text-anchor': anchor })
  paint(t, { fill: 'var(--ink)', 'font-family': 'var(--font-body)', 'pointer-events': 'none' })
  t.textContent = content
  return t
}

export function compassRose(cx: number, cy: number): SVGElement {
  const g = el('g', { transform: `translate(${cx} ${cy})` })
  const ring = el('circle', { r: '20', fill: 'none' })
  paint(ring, { stroke: 'var(--ink)', 'stroke-width': '1' })
  const star = el('path', { d: 'M0,-26 L4,-4 L26,0 L4,4 L0,26 L-4,4 L-26,0 L-4,-4 Z' })
  paint(star, { fill: 'var(--ink)', 'fill-opacity': '0.85' })
  const north = el('path', { d: 'M0,-26 L4,-4 L0,0 L-4,-4 Z' })
  paint(north, { fill: 'var(--paper)' })
  g.append(ring, star, north, text('N', 0, -32, 14, 'middle'))
  return g
}

export function scaleBarGroup(x: number, y: number, bar: { nmi: number; px: number; label: string }): SVGElement {
  const g = el('g', { transform: `translate(${x} ${y})` })
  const plate = el('rect', { x: '-8', y: '-16', width: String(bar.px + 16), height: '46' })
  paint(plate, { fill: 'var(--paper)', 'fill-opacity': '0.75' })
  const half = bar.px / 2
  const a = el('rect', { x: '0', y: '0', width: String(half), height: '5' })
  paint(a, { fill: 'var(--ink)', stroke: 'var(--ink)', 'stroke-width': '1' })
  const b = el('rect', { x: String(half), y: '0', width: String(half), height: '5' })
  paint(b, { fill: 'var(--paper)', stroke: 'var(--ink)', 'stroke-width': '1' })
  g.append(
    plate, a, b,
    text('0', 0, 18, 11, 'middle'),
    text(String(bar.nmi / 2), half, 18, 11, 'middle'),
    text(String(bar.nmi), bar.px, 18, 11, 'middle'),
    text(bar.label, 0, -4, 10, 'start'),
  )
  return g
}
