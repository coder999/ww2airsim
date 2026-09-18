import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'

// Offline extraction only. See content/scenery/NOTICE.md for the two public
// Nominatim queries used to populate this ignored cache. Preserve coordinates
// and OSM identifiers so the distributed derivative remains inspectable.
type Result = {
  name: string; osm_type: string; osm_id: number
  geojson: { type: string; coordinates: number[][] | number[][][] }
}
const rivers = ['binahaan', 'daguitan'].flatMap(name => {
  const results = JSON.parse(readFileSync(`tools/scenery/cache/${name}.json`, 'utf8')) as Result[]
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
mkdirSync('content/scenery', { recursive: true })
writeFileSync('content/scenery/rivers.json', JSON.stringify(rivers) + '\n')
console.log(`Wrote ${rivers.length} river sections`)
