// Survey a strip candidate: tsx tools/sites/survey.ts <lat> <lon> [radiusM]
// Prints, for each heading, the height spread along a 1500 m x 45 m strip centered on each grid point.
import { toLocal, toGeodetic } from '../../src/sim/world/projection.js'
import { heightAt } from '../../src/sim/world/terrain.js'
import { groundTruthTerrain } from './terrain.js'

const [lat, lon, radius = '3000'] = process.argv.slice(2)
const t = groundTruthTerrain()
const c = toLocal(Number(lat), Number(lon))
const rows: { x: number; z: number; h: number; spread: number; minH: number; lat: number; lon: number }[] = []
for (let dx = -Number(radius); dx <= Number(radius); dx += 100) for (let dz = -Number(radius); dz <= Number(radius); dz += 100) {
  for (const h of (process.env.HEADINGS ?? "0,45,90,135").split(",").map(Number)) {
    const r = (h * Math.PI) / 180
    const hs: number[] = []
    for (let s = -1000; s <= 1000; s += 50) for (const w of [-60, 0, 60]) {
      const x = c.x + dx + s * Math.sin(r) + w * Math.cos(r), z = c.z + dz - s * Math.cos(r) + w * Math.sin(r)
      hs.push(heightAt(t, x, z))
    }
    const mx = Math.max(...hs), mn = Math.min(...hs)
    const g = toGeodetic(c.x + dx, c.z + dz)
    rows.push({ x: Math.round(c.x + dx), z: Math.round(c.z + dz), h, spread: mx - mn, minH: mn, lat: g.latDeg, lon: g.lonDeg })
  }
}
rows.filter((r) => r.minH > 2).sort((a, b) => a.spread - b.spread).slice(0, 12)
  .forEach((r) => console.log(JSON.stringify({ ...r, spread: +r.spread.toFixed(2), minH: +r.minH.toFixed(2), lat: +r.lat.toFixed(4), lon: +r.lon.toFixed(4) })))
