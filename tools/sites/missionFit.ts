import { localToWorld, type Airfield } from '../../src/sim/world/airfields.js'
import { buildStructures } from '../../src/sim/weapons/structures.js'
import { segmentBox } from '../../src/sim/weapons/geometry.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { airfieldFor, type Site } from '../../src/sim/world/sites.js'

/**
 * Mission-fit arithmetic (F8A Task 10): how long from a surface start to a mission's first action, at 1x, over the real
 * layout of a site. Pure; the table it reads is content/campaign/mission-fit.json and the test is
 * tests/sim/missionFit.test.ts. Every constant in a row is an ESTIMATE labeled in that file.
 */
export type FilledRow = {
  readonly id: string
  readonly status: 'filled'
  readonly aircraft: string
  readonly start: { readonly site: string; readonly window: string; readonly parked: string }
  readonly firstAction: { readonly site: string; readonly x: number; readonly z: number }
  readonly takeoffS: number
  readonly taxiMps: number
  readonly cruiseMps: number
}

export type Fit = {
  readonly taxiM: number; readonly taxiS: number; readonly takeoffS: number; readonly flightM: number; readonly flightS: number
  readonly totalS: number
  /** A building hit box on the straight taxi line from the spot to the strip, or null. */
  readonly taxiBlockedBy: string | null
}

/** Where the airplane starts, where it enters the strip, and where the first action is, from the site files. */
export function fitOf(row: FilledRow, sites: Readonly<Record<string, Site>>): Fit {
  const startSite = sites[row.start.site]
  const targetSite = sites[row.firstAction.site]
  if (startSite === undefined || targetSite === undefined) throw new Error(`${row.id}: site not loaded`)
  const field = airfieldFor(startSite, row.start.window)
  if (field === null) throw new Error(`${row.id}: ${row.start.site} has no field in ${row.start.window}`)
  const spot = startSite.windows[row.start.window]!.parked.find((p) => p.id === row.start.parked)
  if (spot === undefined) throw new Error(`${row.id}: no parked aircraft "${row.start.parked}" at ${row.start.site} in ${row.start.window}`)
  const from = localToWorld(field, spot.x, spot.z)
  // Entry: the strip's near edge level with the spot.
  const edge = Math.sign(spot.x) * field.runway.widthM / 2
  const entry = localToWorld(field, edge, spot.z)
  const taxiM = Math.hypot(entry.x - from.x, entry.z - from.z)
  const solid = buildStructures([field], null)
  const blocked = solid.find((s) => {
    const c = Math.cos(s.headingRad), sn = Math.sin(s.headingRad)
    const loc = (p: { x: number; z: number }) => v3((p.x - s.position.x) * c + (p.z - s.position.z) * sn, 3, -(p.x - s.position.x) * sn + (p.z - s.position.z) * c)
    return segmentBox(loc(from), loc(entry), v3(0, 0, 0), v3(s.halfSize.x, s.halfSize.y, s.halfSize.z)) !== null
  })
  const targetField = airfieldFor(targetSite, 'endgame') ?? airfieldFor(targetSite, row.start.window)
  const target = localToWorld(targetField ?? field, row.firstAction.x, row.firstAction.z)
  const flightM = Math.hypot(target.x - entry.x, target.z - entry.z)
  const taxiS = taxiM / row.taxiMps
  const flightS = flightM / row.cruiseMps
  return { taxiM, taxiS, takeoffS: row.takeoffS, flightM, flightS, totalS: taxiS + row.takeoffS + flightS, taxiBlockedBy: blocked?.id ?? null }
}

export type { Airfield }
