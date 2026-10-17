// Prints each filled mission-fit row: tsx tools/sites/fitReport.ts
import { readdirSync } from 'node:fs'
import table from '../../content/campaign/mission-fit.json' with { type: 'json' }
import { loadSite } from '../content/load.js'
import { fitOf, type FilledRow } from './missionFit.js'
const sites = Object.fromEntries(readdirSync('content/sites').filter((f) => f.endsWith('.json')).map((f) => { const id = f.replace(/\.json$/, ''); return [id, loadSite(id)] }))
for (const r of table.rows.filter((x) => x.status === 'filled') as unknown as FilledRow[]) {
  const f = fitOf(r, sites)
  console.log(r.id, JSON.stringify({ taxiM: Math.round(f.taxiM), taxiS: Math.round(f.taxiS), takeoffS: f.takeoffS, flightM: Math.round(f.flightM), flightS: Math.round(f.flightS), totalS: Math.round(f.totalS), ceilingS: table.ceilingS, blocked: f.taxiBlockedBy }))
}
