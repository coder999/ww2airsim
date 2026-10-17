// Ground in a site's local frame, with the layout over it (F8C). Usage:
//   tsx tools/sites/localMap.ts <cx> <cz> <headingDeg> <halfXm> <halfZm> <cellM>            ground only
//   tsx tools/sites/localMap.ts --site <id> <window> <halfXm> <halfZm> <cellM>                the site's own frame and layout
// Ground: '~' sea (<0.5 m), '.' <3 m, ':' <10 m, 'o' <30 m, 'O' <100 m, '#' above. Layout: buildings by kind letter (H hangar, T tower, A aaa, B bunker,
// R barracks, C coastal battery, F fuel, P pier, X radio, V revetment, Q quonset, N pontoon, J ramp, K customs, b buoy), v vehicle, a aircraft, * light.
import { localToWorld, worldToLocal, type Airfield } from '../../src/sim/world/airfields.js'
import { toLocal, toGeodetic } from '../../src/sim/world/projection.js'
import { heightAt } from '../../src/sim/world/terrain.js'
import { airfieldFor } from '../../src/sim/world/sites.js'
import { loadSite } from '../content/load.js'
import { groundTruthTerrain } from './terrain.js'

const t = groundTruthTerrain()
const args = process.argv.slice(2)
let frame: Airfield, halfX: number, halfZ: number, cell: number
let overlay: ReturnType<typeof loadSite> | null = null, window = ''
if (args[0] === '--site') {
  overlay = loadSite(args[1]!); window = args[2]!
  frame = airfieldFor(overlay, window) ?? airfieldFor(overlay, 'endgame')!
  ;[halfX, halfZ, cell] = args.slice(3).map(Number) as [number, number, number]
} else {
  const [cx, cz, h, hx, hz, c] = args.map(Number) as [number, number, number, number, number, number]
  frame = { id: 'x', name: 'x', runway: { center: { x: cx!, z: cz! }, headingDeg: h!, lengthM: 2, widthM: 2 }, apron: null, clearing: null, buildings: [{ id: 'b', kind: 'aaa', x: 0, z: 0, widthM: 1, lengthM: 1, hp: 1 }], reference: { source: '' } } as Airfield
  ;[halfX, halfZ, cell] = [hx!, hz!, c!]
}
const LETTER: Record<string, string> = { hangar: 'H', tower: 'T', aaa: 'A', 'ammunition-bunker': 'B', 'barracks-and-huts': 'R', 'coastal-gun-battery': 'C', 'fuel-tank-farm': 'F', 'pier-and-warehouses': 'P', 'radio-radar-station': 'X', revetment: 'V', 'quonset-hut-20x48': 'Q', 'pontoon-pier-segment': 'N', 'jinamoc-seaplane-ramp': 'J', 'ormoc-customs-building': 'K', 'pby-mooring-buoy': 'b' }
const marks = new Map<string, string>()
const key = (x: number, z: number): string => `${Math.round(x / cell)},${Math.round(z / cell)}`
if (overlay !== null) {
  const f = airfieldFor(overlay, window)
  const w = overlay.windows[window]!
  if (f !== null) {
    for (const b of f.buildings) {
      for (let dx = -b.widthM / 2; dx <= b.widthM / 2; dx += cell / 2) for (let dz = -b.lengthM / 2; dz <= b.lengthM / 2; dz += cell / 2) {
        const r = ((b.headingDeg ?? 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
        marks.set(key(b.x + dx * c - dz * s, b.z + dx * s + dz * c), b.state === 'destroyed' ? 'x' : LETTER[b.kind] ?? '?')
      }
    }
    for (const v of w.vehicles) marks.set(key(v.x, v.z), 'v')
    for (const p of w.parked) marks.set(key(p.x, p.z), 'a')
    for (const l of w.lights) marks.set(key((l.at as { x: number }).x, (l.at as { z: number }).z), '*')
  }
}
const o = frame.runway.center, g = toGeodetic(o.x, o.z)
console.log(`frame center (${o.x}, ${o.z}) = ${g.latDeg.toFixed(4)}N ${g.lonDeg.toFixed(4)}E, heading ${frame.runway.headingDeg}; local +x right, +z down (south at heading 0); cell ${cell} m`)
for (let z = -halfZ; z <= halfZ; z += cell) {
  let row = String(Math.round(z)).padStart(6) + ' '
  for (let x = -halfX; x <= halfX; x += cell) {
    const m = marks.get(key(x, z))
    if (m !== undefined) { row += m; continue }
    const w = localToWorld(frame, x, z), v = heightAt(t, w.x, w.z)
    row += v < 0.5 ? '~' : v < 3 ? '.' : v < 10 ? ':' : v < 30 ? 'o' : v < 100 ? 'O' : '#'
  }
  console.log(row)
}
void toLocal; void worldToLocal
