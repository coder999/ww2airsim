import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildPlaces, parsePlaceNode, parseWay, resolveWayCoordinates } from '../../tools/scenery/build.js'

// Structurally matches build.ts's own (unexported) OverpassNode/OverpassWay
// -- same reasoning as the synthetic fixtures below, which already pass
// inline object literals to these functions without importing the types.
type RawNode = { type: 'node'; id: number; lat: number; lon: number; tags?: Record<string, string> }
type RawWay = { type: 'way'; id: number; nodes: number[]; tags?: Record<string, string> }

// tools/scenery/cache/places-overpass.json is gitignored (see NOTICE.md and
// the river cache precedent this mirrors), so a fresh clone or CI has none.
// `describe.skipIf` prints a NAMED skip rather than vanishing, which is what
// keeps "green because it checked" distinguishable from "green because it
// did not" -- same shape as terrainBuild.test.ts's `haveSource` gate.
const CACHE_PATH = 'tools/scenery/cache/places-overpass.json'
const haveSource = existsSync(CACHE_PATH)
if (!haveSource) {
  console.warn(
    `[sceneryBuild.test.ts] ${CACHE_PATH} is absent -- the real-data places ` +
    `checks are SKIPPED. See content/scenery/NOTICE.md to fetch it.`,
  )
}

/** Raw Overpass elements plus a ready-built node index -- for the two tests
 *  below that need to call `parseWay` directly against a real way, bypassing
 *  `buildPlaces()`'s own name/80 km-radius road filter (I1 fix wave,
 *  2026-09-24), which now discards every "no name, no ref" and every
 *  "ref '1', out of radius" way before returning. */
function loadRawElements(): { elements: readonly (RawNode | RawWay)[]; nodesById: Map<number, RawNode> } {
  const raw = JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as { elements: readonly (RawNode | RawWay)[] }
  const nodesById = new Map<number, RawNode>()
  for (const el of raw.elements) if (el.type === 'node') nodesById.set(el.id, el)
  return { elements: raw.elements, nodesById }
}

describe.skipIf(!haveSource)('places extraction against the real Overpass cache (Plan 13d)', () => {
  it('includes Tacloban and Ormoc as towns, and at least one village', () => {
    const places = buildPlaces()
    const names = places.towns.map((t) => t.name)
    expect(names).toContain('Tacloban')
    expect(names).toContain('Ormoc')
    expect(places.towns.some((t) => t.size === 'town')).toBe(true)
    expect(places.towns.some((t) => t.size === 'village')).toBe(true)
    // Design §7's rule is a two-name allowlist: only Tacloban and Ormoc are 'town'.
    expect(places.towns.filter((t) => t.size === 'town').map((t) => t.name).sort()).toEqual(['Ormoc', 'Tacloban'])
  })

  it('includes the Maharlika Highway coastal alignment as a road, already filtered to the 208 the renderer ships', () => {
    const places = buildPlaces()
    // I1 fix wave (2026-09-24): `buildPlaces` now applies the name/80 km-
    // radius filter itself (formerly a runtime filter in rivers.ts), so the
    // committed places.json only ever carries the 208 roads that survive
    // it, not the Overpass query's raw 1,897 -- measured directly against
    // this real cache, not assumed.
    expect(places.roads.length).toBe(208)
    for (const road of places.roads) {
      expect(road.coordinates.length).toBeGreaterThan(1)
      expect(road.widthM).toBeGreaterThan(0)
    }
    expect(places.roads.some((r) => r.name === 'Maharlika Highway')).toBe(true)
  })

  it('falls back to a route reference for a real nameless Maharlika Highway (AH26) segment', () => {
    // AH26 is the Maharlika Highway's Asian Highway route number; several
    // real segments in the cached response carry `ref: '1'` and no `name`.
    // None of those 6 real ways happen to fall inside Tacloban's 80 km
    // radius (verified directly against this real cache, 2026-09-24), so
    // `buildPlaces()`'s now-filtered output (I1 fix wave) never contains
    // one -- this asserts against the raw cache directly, calling
    // `parseWay` on a real `ref: '1'`-only way, the same reasoning as the
    // "Unnamed road" case below.
    const { elements, nodesById } = loadRawElements()
    const refOnly = elements.find((el): el is RawWay =>
      el.type === 'way' && el.tags?.highway !== undefined && el.tags?.ref === '1' && el.tags?.name === undefined)
    expect(refOnly).toBeDefined()
    expect(parseWay(refOnly!, nodesById).name).toBe('1')
  })

  it('falls back to a synthesized placeholder for a real way with neither name nor ref, rather than throwing', () => {
    // Way 25654757 is a real `{"highway":"primary"}` way in the cached
    // response with no other tags at all -- one of 54 real ways with
    // neither `name` nor `ref` (round-2 finding that forced ruling 3). None
    // of those 54 can survive `buildPlaces()`'s road filter (I1 fix wave,
    // 2026-09-24): a synthesized `Unnamed road ${id}` name can never equal
    // '1' or match /maharlika/i by construction -- verified directly
    // against this real cache, not assumed (0 of the 208 filtered roads
    // are "Unnamed road ..."). So this asserts against the raw cache
    // directly, calling `parseWay` on the real way rather than going
    // through `buildPlaces()`'s now-filtered output, which no longer
    // contains it.
    const { elements, nodesById } = loadRawElements()
    const way = elements.find((el): el is RawWay => el.type === 'way' && el.id === 25654757)
    expect(way).toBeDefined()
    expect(parseWay(way!, nodesById).name).toBe('Unnamed road 25654757')
  })

  it('has no airfields key', () => {
    const places = buildPlaces() as unknown as Record<string, unknown>
    expect('airfields' in places).toBe(false)
  })
})

// Synthetic fixtures only -- no cache file touched, so these run unconditionally.
describe('places extraction: node/way parsing (synthetic fixtures)', () => {
  it('never throws on a road naming gap, only synthesizes a placeholder', () => {
    const way = { type: 'way' as const, id: 3, nodes: [], tags: { highway: 'primary' } }
    expect(() => parseWay(way, new Map())).not.toThrow()
    expect(parseWay(way, new Map()).name).toBe('Unnamed road 3')
  })

  it('throws on an Overpass node with no name tag, rather than emitting a blank town', () => {
    expect(() => parsePlaceNode({ type: 'node', id: 1, lat: 11, lon: 125, tags: { place: 'town' } })).toThrow(/1/)
  })

  it('throws on a way referencing a node id absent from the response, rather than emitting a road with a gap', () => {
    const way = { type: 'way' as const, id: 2, nodes: [999], tags: { highway: 'primary', name: 'Test Road' } }
    expect(() => resolveWayCoordinates(way, new Map())).toThrow(/999/)
  })
})
