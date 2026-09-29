// tests/tools/models/combatFit.test.ts
// Every gun and hit zone a spec's `combat` block carries must lie inside the drawn airframe it
// flies on -- the same drawing stance.test.ts holds gear.heightM to (W1 Task 4, 2026-09-28), read
// through drawnPoints (W1 ruling B), the propeller excluded so a spinning blade's sweep cannot
// paper over a zone that pokes outside the fuselage/wing.
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { drawnPoints } from './_drawnPoints.js'

const EXCLUDE_PROP = /Prop|Helice/

/** How far a box (center +/- halfSize) sits outside `bounds`, in meters; 0 or negative means fully inside. */
function overshoot(center: readonly [number, number, number], halfSize: readonly [number, number, number], bounds: { min: readonly number[]; max: readonly number[] }): number {
  let worst = -Infinity
  for (let i = 0; i < 3; i++) {
    worst = Math.max(worst, bounds.min[i]! - (center[i]! - halfSize[i]!))
    worst = Math.max(worst, (center[i]! + halfSize[i]!) - bounds.max[i]!)
  }
  return worst
}

/** How far a single point sits outside `bounds`. */
function pointOvershoot(p: readonly [number, number, number], bounds: { min: readonly number[]; max: readonly number[] }): number {
  let worst = -Infinity
  for (let i = 0; i < 3; i++) {
    worst = Math.max(worst, bounds.min[i]! - p[i]!)
    worst = Math.max(worst, p[i]! - bounds.max[i]!)
  }
  return worst
}

/**
 * Measured 2026-09-28 (W1 Task 4): the F6F and Zero hit zones predate this test and were never
 * refit to their drawn models, so their `engine` and `rudder` boxes run past the propeller-
 * excluded airframe by this many meters. The list only shrinks -- `aircraftRigs.test.ts`'s
 * THROUGH_SKIN rule applies here too: a listed entry that no longer overshoots is stale and must
 * be deleted, not kept "just in case". The Wildcat, refit in this same task, gets no entry.
 */
const KNOWN_OVERSHOOT_M: Readonly<Record<string, number>> = {
  'f6f-hellcat/engine': 1.53, 'f6f-hellcat/rudder': 0.2,
  'a6m2-zero/engine': 1.83,
}

const specs = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => loadAircraftSpec(f.replace(/\.json$/, '')))
  .filter((s) => s.combat !== undefined)

describe('combat guns and zones lie inside the drawn airframe (W1 Task 4, Review Focus 3)', () => {
  it.each(specs.map((s) => [s.id, s] as const))('%s: every zone box and gun position is inside the drawn, propeller-excluded bounds', async (id, spec) => {
    const pts = await drawnPoints(spec.view.model, EXCLUDE_PROP)
    const bounds = {
      min: [0, 1, 2].map((i) => pts.reduce((m, p) => Math.min(m, p[i]!), Infinity)),
      max: [0, 1, 2].map((i) => pts.reduce((m, p) => Math.max(m, p[i]!), -Infinity)),
    }
    for (const g of spec.combat!.guns) {
      const excess = pointOvershoot(g.position, bounds)
      expect(excess, `${id}: gun at ${JSON.stringify(g.position)} sits ${excess.toFixed(3)} m outside the drawn airframe`).toBeLessThanOrEqual(0)
    }
    for (const z of spec.combat!.zones) {
      const excess = overshoot(z.center, z.halfSize, bounds)
      const known = KNOWN_OVERSHOOT_M[`${id}/${z.id}`]
      const msg = `${id}/${z.id}: zone sits ${excess.toFixed(3)} m outside the drawn airframe`
      if (known === undefined) {
        expect(excess, msg).toBeLessThanOrEqual(0)
      } else {
        expect(excess, `${msg}: a KNOWN_OVERSHOOT_M entry that no longer overshoots must be deleted (stale, THROUGH_SKIN rule)`).toBeGreaterThan(0)
        expect(excess, msg).toBeLessThanOrEqual(known + 0.01)
      }
    }
  })

  it('the Wildcat has no allowlist entry: its zones and guns were refit in this task', () => {
    expect(Object.keys(KNOWN_OVERSHOOT_M).some((k) => k.startsWith('f4f-wildcat/'))).toBe(false)
  })
})
