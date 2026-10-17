/**
 * Mission ribbons and rank insignia, drawn as inline SVG from constants only
 * (no pilot-supplied string reaches the markup; names go in through
 * `setAttribute`).
 *
 * Ribbons are invented, not real decorations (Mark, 2026-10-10): one per
 * mission badge in the WWII USN palette. Insignia are the 1944 USN officer
 * collar devices for `RANK_LADDER`, Commodore one star and Rear Admiral two
 * (GAMEPLAY.md, "Ranks").
 */
const NAVY = '#1b2a4e', GOLD = '#d4a52a', WHITE = '#f2efe6', SCARLET = '#b0232e', SKY = '#6f9fd0'
const GREEN = '#2f6b45', BROWN = '#7a5230', OLIVE = '#5d6532', BLUE = '#2a4f9a', ORANGE = '#d9822b'

type Stripe = readonly [color: string, width: number]
/** Edge to center, last entry is the center stripe; mirrored for the far half.
 *  Widths in 1/32 in, so 44 across matches a real 1 3/8 in ribbon. */
export const RIBBONS: Readonly<Record<string, readonly Stripe[]>> = {
  'basic-flying': [[GOLD, 2], [SKY, 4], [WHITE, 2], [SKY, 12], [NAVY, 4]],
  'torpedo-qualified': [[NAVY, 4], [WHITE, 2], [SKY, 3], [GOLD, 11], [SCARLET, 4]],
  'carrier-qualified': [[NAVY, 6], [GOLD, 2], [NAVY, 10], [WHITE, 2], [GOLD, 4]],
  'airfield-strike': [[GREEN, 3], [BROWN, 14], [SCARLET, 3], [WHITE, 4]],
  'convoy-strike': [[NAVY, 3], [GREEN, 14], [WHITE, 2], [NAVY, 2], [SCARLET, 2]],
  'tank-buster': [[OLIVE, 4], [BROWN, 6], [GOLD, 2], [GREEN, 8], [SCARLET, 4]],
  'combat-air-patrol': [[NAVY, 4], [SKY, 6], [WHITE, 2], [SKY, 8], [NAVY, 4]],
  'single-combat': [[SCARLET, 16], [WHITE, 2], [NAVY, 2], [GOLD, 4]],
  'scramble': [[GOLD, 4], [ORANGE, 12], [NAVY, 2], [ORANGE, 2], [WHITE, 4]],
  'flattop-hunt': [[NAVY, 12], [WHITE, 2], [SCARLET, 2], [WHITE, 2], [NAVY, 2], [SCARLET, 4]],
  'escort': [[OLIVE, 4], [SKY, 2], [OLIVE, 12], [GOLD, 2], [BLUE, 4]],
  'surigao-strait': [[NAVY, 4], [WHITE, 2], [SCARLET, 3], [GOLD, 2], [SKY, 10], [GOLD, 2]],
  'field-patrol': [[SCARLET, 4], [WHITE, 3], [NAVY, 3], [WHITE, 8], [SCARLET, 8]],
  'over-the-beaches': [[NAVY, 3], [SKY, 5], [WHITE, 2], [GOLD, 2], [SKY, 20]],
  'water-qualified': [[SKY, 7], [WHITE, 2], [NAVY, 6], [GOLD, 2], [SCARLET, 10]],
  'j1-defend-the-fields': [[SCARLET, 4], [GOLD, 2], [GREEN, 6], [WHITE, 2], [GREEN, 6], [NAVY, 4]],
  'j2-break-the-landing': [[NAVY, 2], [SKY, 8], [WHITE, 2], [SCARLET, 8], [GOLD, 4]],
  'j3-road-to-burauen': [[BROWN, 6], [GOLD, 2], [OLIVE, 10], [WHITE, 2], [SCARLET, 4]],
}
/** A badge with no design of its own (dev fixtures, a retired mission). */
const PLAIN_RIBBON: readonly Stripe[] = [[NAVY, 20], [GOLD, 4]]

const SVG_NS = 'http://www.w3.org/2000/svg'
function svg(viewW: number, viewH: number, heightPx: number, markup: string, label: string): SVGSVGElement {
  const s = document.createElementNS(SVG_NS, 'svg')
  s.setAttribute('viewBox', `0 0 ${viewW} ${viewH}`)
  s.setAttribute('height', String(heightPx))
  s.setAttribute('width', String(Math.round(heightPx * viewW / viewH)))
  s.setAttribute('role', 'img')
  s.setAttribute('aria-label', label)
  s.style.verticalAlign = 'middle'
  s.innerHTML = markup
  const title = document.createElementNS(SVG_NS, 'title')
  title.textContent = label
  s.prepend(title)
  return s
}

/** The full edge-to-edge stripe list for a badge id. */
export function ribbonStripes(badgeId: string): readonly Stripe[] {
  const half = RIBBONS[badgeId] ?? PLAIN_RIBBON
  return [...half, ...half.slice(0, -1).reverse()]
}

/** A ribbon, `heightPx` tall at the real 44:12 proportion. */
export function ribbonElement(badgeId: string, name: string, heightPx = 16): SVGSVGElement {
  let x = 0
  let rects = ''
  for (const [color, w] of ribbonStripes(badgeId)) {
    rects += `<rect x="${x}" y="0" width="${w}" height="12" fill="${color}"/>`
    x += w
  }
  // A faint top light and a dark edge, so it reads as cloth on paper.
  rects += `<rect x="0" y="0" width="${x}" height="5" fill="#fff" opacity=".07"/>`
  rects += `<rect x=".25" y=".25" width="${x - 0.5}" height="11.5" fill="none" stroke="#1a1712" stroke-width=".5" opacity=".7"/>`
  return svg(x, 12, heightPx, rects, `${name} ribbon`)
}

const GOLD_METAL = 'fill="#d1a93a" stroke="#6e5313" stroke-width="1"'
const SILVER_METAL = 'fill="#c9cdd2" stroke="#5b6168" stroke-width="1"'
const bar = (x: number, metal: string): string => `<rect x="${x}" y="3" width="10" height="34" rx="1.5" ${metal}/>`
const OAK_LEAF = 'M20 2C24 4 25 7 23 9C27 8 30 10 28 14C32 13 35 16 31 20C35 21 36 25 31 27C33 30 30 33 25 31'
  + 'C24 33 22 34 21 34L21 38L19 38L19 34C18 34 16 33 15 31C10 33 7 30 9 27C4 25 5 21 9 20C5 16 8 13 12 14'
  + 'C10 10 13 8 17 9C15 7 16 4 20 2Z'
const oakLeaf = (metal: string): string =>
  `<path d="${OAK_LEAF}" ${metal}/><path d="M20 6V34M20 14L25 11M20 14L15 11M20 21L27 17M20 21L13 17M20 27L26 25M20 27L14 25" stroke="rgba(0,0,0,.35)" stroke-width=".8" fill="none"/>`
const EAGLE = `<g ${SILVER_METAL} stroke-linejoin="round">`
  + '<path d="M20 18C15 12 9 7 2 3L4 8L1 9L5 12L2 14L7 16L4 19L10 20L8 23L16 23Z"/>'
  + '<path d="M28 18C33 12 39 7 46 3L44 8L47 9L43 12L46 14L41 16L44 19L38 20L40 23L32 23Z"/>'
  + '<path d="M20.5 29L17 38L21 35.5L24 39L27 35.5L31 38L27.5 29Z"/>'
  + '<path d="M19 14C19 11 21.5 10 24 10C26.5 10 29 11 29 14L28.5 26C28 29 26 31 24 31C22 31 20 29 19.5 26Z"/>'
  + '<circle cx="22.5" cy="8" r="3.6"/><path d="M19.3 7L15.5 9L19.6 10.2Z"/></g>'
  + '<path d="M18 19L5 8M18 21L6 13M18 22L8 18M30 19L43 8M30 21L42 13M30 22L40 18" stroke="rgba(0,0,0,.35)" stroke-width=".8" fill="none"/>'
function star(cx: number): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 9.5 : 4.2
    const a = -Math.PI / 2 + i * Math.PI / 5
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(20 + r * Math.sin(a)).toFixed(2)}`)
  }
  return `<polygon points="${pts.join(' ')}" ${SILVER_METAL} stroke-linejoin="round"/>`
}
const stars = (n: number): readonly [number, string] =>
  [n * 20, Array.from({ length: n }, (_, i) => star(10 + i * 20)).join('')]

/** viewBox width and markup per rank abbrev; the art is 40 units tall. */
export const INSIGNIA: Readonly<Record<string, readonly [number, string]>> = {
  ENS: [16, bar(3, GOLD_METAL)],
  LTJG: [16, bar(3, SILVER_METAL)],
  LT: [28, bar(3, SILVER_METAL) + bar(15, SILVER_METAL) + `<rect x="13" y="10" width="2" height="3" ${SILVER_METAL}/><rect x="13" y="27" width="2" height="3" ${SILVER_METAL}/>`],
  LCDR: [40, oakLeaf(GOLD_METAL)],
  CDR: [40, oakLeaf(SILVER_METAL)],
  CAPT: [48, EAGLE],
  COMO: stars(1),
  RADM: stars(2),
  VADM: stars(3),
  ADM: stars(4),
}

// ---- Rank devices by (faction, tier): F5B Task 5 ------------------------------------------------

/** The USN device for each campaign tier (the old ladder's first six are the same collar devices). */
const USN_BY_TIER = ['ENS', 'LTJG', 'LT', 'LCDR', 'CDR', 'CAPT'] as const

const BOARD_NAVY = '#1b2a4e', LACE_GOLD = '#d9b44a'
function blossom(cx: number, cy: number, r: number): string {
  let s = ''
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5
    s += `<circle cx="${(cx + r * 0.95 * Math.cos(a)).toFixed(1)}" cy="${(cy + r * 0.95 * Math.sin(a)).toFixed(1)}" r="${(r * 0.62).toFixed(1)}" fill="${LACE_GOLD}"/>`
  }
  return `${s}<circle cx="${cx}" cy="${cy}" r="${(r * 0.4).toFixed(1)}" fill="${BOARD_NAVY}"/>`
}

/**
 * Original IJN-style officer devices, tiers 1 to 6 (Kaigun Shoi .. Taisa). A dark-blue board with gold lace
 * stripes and gold cherry-blossom (sakura) stars, the way the IJN marked officer grade: stripe count by grade
 * band, blossom count by step within the band. **The exact counts per rank are an ESTIMATE**, a legible
 * simplification, not copied from a chart (docs/superpowers/plans/2026-10-15-f5b-headquarters.md, D9;
 * ASSETS.md records the source check). Tiers 1 to 3: one stripe and one to three blossoms; tiers 4 to 6: two
 * stripes and one to three blossoms. Drawn by the author as plain vector shapes, traced from nothing.
 */
export const JA_DEVICES: readonly (readonly [number, string])[] = [1, 2, 3, 4, 5, 6].map((tier) => {
  const twoStripes = tier >= 4
  const blossoms = ((tier - 1) % 3) + 1
  let s = `<rect x="0" y="0" width="46" height="22" rx="2" fill="${BOARD_NAVY}" stroke="#0b1226"/>`
  for (const y of twoStripes ? [4, 9] : [6]) s += `<rect x="3" y="${y}" width="40" height="3" fill="${LACE_GOLD}"/>`
  for (let i = 0; i < blossoms; i++) s += blossom(12 + i * 11, twoStripes ? 18 : 13, twoStripes ? 2.6 : 3.2)
  // The shared `svg()` helper draws a 40-unit-tall field: scale the 46x22 board up and centre it.
  return [60, `<g transform="translate(0 5.5) scale(1.3)">${s}</g>`] as const
})

/** The rank device for a campaign tier: the USN collar device for `us`, the IJN-style board for `ja`. */
export function rankDevice(faction: 'us' | 'ja', tier: 1 | 2 | 3 | 4 | 5 | 6, heightPx = 20, name = ''): SVGSVGElement {
  const art = faction === 'us' ? INSIGNIA[USN_BY_TIER[tier - 1]!]! : JA_DEVICES[tier - 1]!
  return svg(art[0], 40, heightPx, art[1], `${name === '' ? `Tier ${tier}` : name} insignia`)
}

/** The markup alone (no DOM), so the Node suite can enroll every device. */
export const rankDeviceMarkup = (faction: 'us' | 'ja', tier: number): string =>
  (faction === 'us' ? INSIGNIA[USN_BY_TIER[tier - 1]!]! : JA_DEVICES[tier - 1]!)[1]
