import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Offline extraction only. See content/scenery/NOTICE.md for the public
// Nominatim and Overpass queries used to populate these ignored caches.
// Preserve coordinates and OSM identifiers so the distributed derivatives
// remain inspectable. Nothing here makes a network call.

type RiverResult = {
  name: string; osm_type: string; osm_id: number
  geojson: { type: string; coordinates: number[][] | number[][][] }
}
export type RiverSection = { name: string; source: string; widthM: number; coordinates: number[][] }

export function buildRivers(): RiverSection[] {
  const rivers = ['binahaan', 'daguitan'].flatMap(name => {
    const results = JSON.parse(readFileSync(`tools/scenery/cache/${name}.json`, 'utf8')) as RiverResult[]
    return results.flatMap(r => {
      const lines = r.geojson.type === 'LineString' ? [r.geojson.coordinates as number[][]]
        : r.geojson.type === 'MultiLineString' ? r.geojson.coordinates as number[][][] : []
      return lines.map(coordinates => ({
        name: r.name, source: `https://www.openstreetmap.org/${r.osm_type}/${r.osm_id}`,
        // Visual widths, not surveyed measurements. Centre lines are the data.
        widthM: name === 'binahaan' ? 38 : 46, coordinates,
      }))
    })
  })
  if (rivers.length === 0) throw new Error('No river line geometry in cached inputs')
  return rivers
}

// --- Places (Plan 13d): towns, villages and the Maharlika Highway alignment,
// extracted from a single cached Overpass response. Design:
// docs/superpowers/specs/2026-09-18-land-cover-design.md §7.

type OverpassNode = { type: 'node'; id: number; lat: number; lon: number; tags?: Record<string, string> }
type OverpassWay = { type: 'way'; id: number; nodes: number[]; tags?: Record<string, string> }
type OverpassElement = OverpassNode | OverpassWay | { type: string; id: number }
type OverpassResponse = { elements: OverpassElement[] }

export type Town = { name: string; lat: number; lon: number; size: 'town' | 'village'; source: string }
export type Road = { name: string; widthM: number; coordinates: number[][]; source: string }
export type Places = { towns: Town[]; roads: Road[] }

// A two-lane unpaved 1944 provincial road. Not surveyed -- the design doc
// gives no source width for roads the way it does for rivers; 8 m matches
// the order of magnitude of the design doc's own JSON example.
const ROAD_WIDTH_M = 8

/** Node -> town record. Design §7's sizing rule is a two-name allowlist
 *  ("Tacloban and Ormoc are `town`, everything else `village`"), not an
 *  OSM `place` tag heuristic: against the real Overpass response every
 *  other municipality here is also tagged `place=town` in OSM, which a
 *  tag-based rule would misclassify as `'town'` (ruling, 2026-09-23/24). */
export function parsePlaceNode(node: OverpassNode): Town {
  const name = node.tags?.name
  if (!name) throw new Error(`Overpass node ${node.id} (place) has no name tag`)
  const size: Town['size'] = name === 'Tacloban' || name === 'Ormoc' ? 'town' : 'village'
  return { name, lat: node.lat, lon: node.lon, size, source: `https://www.openstreetmap.org/node/${node.id}` }
}

/** Resolves a way's member node ids to [lon, lat] pairs, throwing rather
 *  than emitting a road with a silent gap if a referenced node is missing
 *  from the cached response. */
export function resolveWayCoordinates(way: OverpassWay, nodesById: Map<number, OverpassNode>): number[][] {
  return way.nodes.map(id => {
    const node = nodesById.get(id)
    if (!node) throw new Error(`Way ${way.id} references node ${id}, not present in the cached response`)
    return [node.lon, node.lat]
  })
}

/** Way -> road record. `name` falls back to the route reference (`ref`),
 *  then to a synthesized placeholder -- never throws on a naming gap. 68 of
 *  1,897 real trunk/primary ways in the query box have no `name` tag
 *  (including real Maharlika Highway/AH26 segments explicitly tagged
 *  `noname=yes`, a legitimate OSM pattern for a numbered highway), and 54
 *  of those also lack `ref`: not rarities either way. A road's `name` has
 *  no effect on the rendered/rasterized alignment (only `coordinates`
 *  does) -- it is cosmetic/debugging metadata only, so there is no
 *  real-data-integrity reason to fail the whole build over it (ruling,
 *  2026-09-23/24, closing out two rounds of this assumption being wrong
 *  against real data). A missing member NODE, by contrast, still throws:
 *  that is a genuine gap in the returned geometry, not a labeling gap. */
export function parseWay(way: OverpassWay, nodesById: Map<number, OverpassNode>): Road {
  const name = way.tags?.name ?? way.tags?.ref ?? `Unnamed road ${way.id}`
  return { name, widthM: ROAD_WIDTH_M, coordinates: resolveWayCoordinates(way, nodesById), source: `https://www.openstreetmap.org/way/${way.id}` }
}

const isNode = (el: OverpassElement): el is OverpassNode => el.type === 'node'
const isWay = (el: OverpassElement): el is OverpassWay => el.type === 'way'

export function buildPlaces(): Places {
  const data = JSON.parse(readFileSync('tools/scenery/cache/places-overpass.json', 'utf8')) as OverpassResponse
  const nodesById = new Map<number, OverpassNode>()
  for (const el of data.elements) if (isNode(el)) nodesById.set(el.id, el)

  const towns = data.elements
    .filter(isNode)
    .filter(n => n.tags?.place !== undefined)
    .map(parsePlaceNode)
    .sort((a, b) => a.name.localeCompare(b.name))

  const roads = data.elements
    .filter(isWay)
    .filter(w => w.tags?.highway !== undefined)
    .map(w => parseWay(w, nodesById))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { towns, roads }
}

// Independent targets: a missing/un-fetched cache for one (e.g. the river
// Nominatim responses, gitignored and not always present locally) must not
// block regenerating the other.
function main(): void {
  mkdirSync('content/scenery', { recursive: true })
  let failed = false
  try {
    const rivers = buildRivers()
    writeFileSync('content/scenery/rivers.json', JSON.stringify(rivers) + '\n')
    console.log(`Wrote ${rivers.length} river sections`)
  } catch (err) {
    console.error('rivers build failed:', err)
    failed = true
  }
  try {
    const places = buildPlaces()
    writeFileSync('content/scenery/places.json', JSON.stringify(places) + '\n')
    console.log(`Wrote ${places.towns.length} towns and ${places.roads.length} roads`)
  } catch (err) {
    console.error('places build failed:', err)
    failed = true
  }
  if (failed) process.exit(1)
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) main()
