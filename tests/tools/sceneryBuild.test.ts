import { describe, expect, it } from 'vitest'
import { buildPlaces, parsePlaceNode, parseWay, resolveWayCoordinates } from '../../tools/scenery/build.js'

describe('places extraction (Plan 13d)', () => {
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

  it('includes the Maharlika Highway coastal alignment as a road', () => {
    const places = buildPlaces()
    expect(places.roads.length).toBeGreaterThan(0)
    for (const road of places.roads) {
      expect(road.coordinates.length).toBeGreaterThan(1)
      expect(road.widthM).toBeGreaterThan(0)
    }
    expect(places.roads.some((r) => r.name === 'Maharlika Highway')).toBe(true)
  })

  it('falls back to a route reference for a real nameless Maharlika Highway (AH26) segment', () => {
    const places = buildPlaces()
    // AH26 is the Maharlika Highway's Asian Highway route number; several
    // real segments in the cached response carry `ref: '1'` and no `name`.
    expect(places.roads.some((r) => r.name === '1')).toBe(true)
  })

  it('falls back to a synthesized placeholder for a real way with neither name nor ref, rather than throwing', () => {
    const places = buildPlaces()
    // Way 25654757 is a real `{"highway":"primary"}` way in the cached
    // response with no other tags at all -- one of 54 real ways with
    // neither `name` nor `ref` (round-2 finding that forced ruling 3).
    expect(places.roads.some((r) => r.name === 'Unnamed road 25654757')).toBe(true)
  })

  it('never throws on a road naming gap, only synthesizes a placeholder', () => {
    const way = { type: 'way' as const, id: 3, nodes: [], tags: { highway: 'primary' } }
    expect(() => parseWay(way, new Map())).not.toThrow()
    expect(parseWay(way, new Map()).name).toBe('Unnamed road 3')
  })

  it('has no airfields key', () => {
    const places = buildPlaces() as unknown as Record<string, unknown>
    expect('airfields' in places).toBe(false)
  })

  it('throws on an Overpass node with no name tag, rather than emitting a blank town', () => {
    expect(() => parsePlaceNode({ type: 'node', id: 1, lat: 11, lon: 125, tags: { place: 'town' } })).toThrow(/1/)
  })

  it('throws on a way referencing a node id absent from the response, rather than emitting a road with a gap', () => {
    const way = { type: 'way' as const, id: 2, nodes: [999], tags: { highway: 'primary', name: 'Test Road' } }
    expect(() => resolveWayCoordinates(way, new Map())).toThrow(/999/)
  })
})
