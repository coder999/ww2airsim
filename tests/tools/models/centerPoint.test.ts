// Every drawn model's wing quarter-chord sits at the sim body origin, x = 0 (W1, 2026-09-28):
// the origin stands for the center of gravity, which a WWII fighter carries near 25-30% MAC.
// Measured that day: Hellcat 0.04 m, Zero 0.11 m; the Wildcat was drawn 2.11 m forward.
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { sectionAtFor } from '../../../tools/models/mounts.js'

const TOLERANCE_M = 0.15
/** Semi-span fraction each section is cut at; 0.3 unless listed. The Corsair's main legs and their
 *  fairings (GearL/GearR, z 1.58 to 2.05 m) cross the 30% station (z 1.87 m), where the slice reads a
 *  leading edge 0.2 m too far forward (quarter-chord 0.175 m); the gull wing's outer panel at 40%
 *  (z 2.5 m) is clean and reads 0.02 m. Measured 2026-09-29 (F4U-1D onboarding). */
const STATION: Readonly<Record<string, number>> = { 'f4u-corsair': 0.4, 'g4m-betty': 0.2 }
/** The wing slice's trailing-edge clip, metres; the default (-2, WING_MIN_X_M) truncates the B-17's 4.9 m chord and reads
 *  a quarter-chord 0.35 m too far aft. Found and measured 2026-09-29 (B-17G onboarding): with -6 the drawn model reads 0.001 m
 *  after its entry's origin was moved 0.354 m forward. */
/** The G4M's default 0.3 station (z 3.7 m) cuts through the engine nacelle (quarter-chord 1.9 to 2.1 m); the clean wing at z 2.5 m (station 0.2) with minX -6 reads 0.000 m. Measured 2026-09-29 (G4M1 onboarding). */
const MIN_X: Readonly<Record<string, number>> = { 'b-17-flying-fortress': -6, 'g4m-betty': -6 }
const specs = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => loadAircraftSpec(f.replace(/\.json$/, '')))

describe('every drawn model is centered on its quarter-chord', () => {
  it.each(specs.map((s) => [s.id, s] as const))('%s', async (_id, spec) => {
    const at = await sectionAtFor(spec.view.model, MIN_X[spec.id])
    const s = at((STATION[spec.id] ?? 0.3) * spec.geometry.wingSpanM / 2)
    const qc = s.leadingX - 0.25 * (s.leadingX - s.trailingX)
    expect(Math.abs(qc), `${spec.id}: quarter-chord at x ${qc.toFixed(3)} m`).toBeLessThanOrEqual(TOLERANCE_M)
  })
})
