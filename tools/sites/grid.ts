// tsx tools/sites/grid.ts <cx> <cz> : terrain heights (m) around a runway center, runway-local (heading 0): rows z, cols x
import { heightAt } from '../../src/sim/world/terrain.js'
import { groundTruthTerrain } from './terrain.js'
const [cx, cz] = process.argv.slice(2).map(Number)
const t = groundTruthTerrain()
const xs: number[] = []; for (let x = -600; x <= 300; x += 50) xs.push(x)
console.log('x:   ' + xs.map((x) => String(x).padStart(5)).join(''))
for (let z = -900; z <= 900; z += 100) console.log(String(z).padStart(5) + ' ' + xs.map((x) => heightAt(t, cx! + x, cz! + z).toFixed(0).padStart(5)).join(''))
