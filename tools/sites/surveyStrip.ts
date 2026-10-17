// Survey E-W (or any heading) strips of a given length near a lat/lon: tsx tools/sites/surveyStrip.ts <lat> <lon> <radiusM> <lengthM> <headings>
import { toLocal, toGeodetic } from '../../src/sim/world/projection.js'
import { heightAt } from '../../src/sim/world/terrain.js'
import { groundTruthTerrain } from './terrain.js'
const [lat, lon, radius = '2500', length = '1500', headings = '90'] = process.argv.slice(2)
const t = groundTruthTerrain()
const c = toLocal(Number(lat), Number(lon))
console.log('anchor local', Math.round(c.x), Math.round(c.z), 'h', heightAt(t, c.x, c.z).toFixed(1))
const half = Number(length) / 2
const rows: { x: number; z: number; h: number; spread: number; minH: number; lat: number; lon: number; d: number }[] = []
for (let dx = -Number(radius); dx <= Number(radius); dx += 50) for (let dz = -Number(radius); dz <= Number(radius); dz += 50) {
  for (const h of headings.split(',').map(Number)) {
    const r = (h * Math.PI) / 180
    const hs: number[] = []
    for (let s = -half; s <= half; s += 50) for (const w of [-25, 0, 25]) {
      hs.push(heightAt(t, c.x + dx + s * Math.sin(r) + w * Math.cos(r), c.z + dz - s * Math.cos(r) + w * Math.sin(r)))
    }
    const mx = Math.max(...hs), mn = Math.min(...hs)
    const g = toGeodetic(c.x + dx, c.z + dz)
    rows.push({ x: Math.round(c.x + dx), z: Math.round(c.z + dz), h, spread: mx - mn, minH: mn, lat: g.latDeg, lon: g.lonDeg, d: Math.hypot(dx, dz) })
  }
}
rows.filter((r) => r.minH > 2 && r.z < Number(process.env.ZMAX ?? 1e9) && r.z > Number(process.env.ZMIN ?? -1e9) && r.x > Number(process.env.XMIN ?? -1e9) && r.x < Number(process.env.XMAX ?? 1e9)).sort((a, b) => a.spread + a.d / 500 - (b.spread + b.d / 500)).slice(0, 10)
  .forEach((r) => console.log(JSON.stringify({ ...r, spread: +r.spread.toFixed(2), minH: +r.minH.toFixed(2), lat: +r.lat.toFixed(4), lon: +r.lon.toFixed(4), d: Math.round(r.d) })))
