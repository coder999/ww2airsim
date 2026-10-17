// Counts per site-state: tsx tools/sites/counts.ts
import { readdirSync, readFileSync } from 'node:fs'
import { airfieldFor, parseSite, WINDOW_IDS } from '../../src/sim/world/sites.js'
import { clutterTotal } from '../../src/sim/world/clutter.js'
for (const f of readdirSync('content/sites').filter((n) => n.endsWith('.json'))) {
  const s = parseSite(JSON.parse(readFileSync(`content/sites/${f}`, 'utf8')))
  for (const w of WINDOW_IDS) {
    const a = airfieldFor(s, w), win = s.windows[w]!
    console.log(s.id.padEnd(9), w.padEnd(13), a === null ? 'no field' : `buildings ${String(a.buildings.length).padStart(2)} (hit boxes ${a.buildings.filter((b) => b.state !== 'destroyed').length}) vehicles ${String(win.vehicles.length).padStart(2)} parked ${win.parked.length} lights ${win.lights.length} clutter ${clutterTotal(a.clutter!)}`)
  }
}
