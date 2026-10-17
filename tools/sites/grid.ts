// tsx tools/sites/grid.ts <cx> <cz> [headingDeg] [xHalf] : terrain heights (m) around a runway center, runway-local
// (rows z along the strip, cols x across; heading 0 unless given). F8B added the heading and the half-width.
import { heightAt } from '../../src/sim/world/terrain.js'
import { groundTruthTerrain } from './terrain.js'
const [cx, cz, hd = 0, xh = 600] = process.argv.slice(2).map(Number)
const t = groundTruthTerrain()
const h = (hd! * Math.PI) / 180, c = Math.cos(h), s = Math.sin(h)
const xs: number[] = []; for (let x = -xh!; x <= xh! / 2; x += 50) xs.push(x)
console.log('x:   ' + xs.map((x) => String(x).padStart(5)).join(''))
for (let z = -900; z <= 900; z += 100) console.log(String(z).padStart(5) + ' ' + xs.map((x) => heightAt(t, cx! + x * c - z * s, cz! + x * s + z * c).toFixed(0).padStart(5)).join(''))
