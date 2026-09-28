// The drawn models against the specs that draw them: mains on gear.heightM, and, pitched by
// MODEL_STANCE, the tail resting on the ground. Measured on the glb, in the sim body frame the
// game draws it in. Mark's screenshots of 2026-09-28 (a Hellcat with its tailwheel 1.1 m in the
// air, a Wildcat 2.2 m above the strip) are what this exists to catch; only R3 models were held
// to gear.heightM before (aircraftRigs.test.ts), which is why the Wildcat never was.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { modelIO } from '../../../tools/models/document.js'
import { worldPositions } from '../../../tools/models/rig.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { MODEL_STANCE } from '../../../src/render/scene/stance.js'
import { wildcatToSimMatrix } from '../../../src/render/scene/wildcatFrame.js'
import { WILDCAT_MODEL_PATH } from '../../../src/render/content.js'

const TOLERANCE_M = 0.05
const specs = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => loadAircraftSpec(f.replace(/\.json$/, '')))

async function simFramePoints(model: string): Promise<[number, number, number][]> {
  const path = model === 'wildcat' ? WILDCAT_MODEL_PATH : `content/aircraft/${model}.glb`
  const m = model === 'wildcat' ? wildcatToSimMatrix() : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  const doc = await modelIO().readBinary(new Uint8Array(readFileSync(path)))
  const out: [number, number, number][] = []
  for (const n of doc.getRoot().listNodes()) {
    if (!n.getMesh()) continue
    for (const [x, y, z] of worldPositions(n)) {
      out.push([m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!])
    }
  }
  return out
}

describe('every drawn model stands on its spec (2026-09-28)', () => {
  it.each(specs.map((s) => [s.id, s] as const))('%s: mains on gear.heightM, tail on the ground at the stance pitch', async (_id, spec) => {
    const stance = MODEL_STANCE[spec.view.model]
    expect(stance, `${spec.view.model} has no MODEL_STANCE entry`).toBeDefined()
    const pts = await simFramePoints(spec.view.model)
    // The mains are the lowest point of the forward three quarters: the Zero's tailwheel is
    // 0.01 m lower still, so the lowest point overall is not always a main wheel.
    const xs = pts.map((p) => p[0])
    const [lo, hi] = [xs.reduce((a, b) => Math.min(a, b)), xs.reduce((a, b) => Math.max(a, b))]
    const main = pts.filter((p) => p[0] > lo + 0.25 * (hi - lo)).reduce((a, p) => (p[1] < a[1] ? p : a))
    expect(Math.abs(main[1] + spec.gear.heightM), `${spec.id}: mains ${(-main[1]).toFixed(3)} m below the origin, gear.heightM ${spec.gear.heightM}`).toBeLessThanOrEqual(TOLERANCE_M)
    expect(Math.abs(main[0] - stance!.mainWheelXM), `${spec.id}: mains at x ${main[0].toFixed(3)}`).toBeLessThanOrEqual(TOLERANCE_M)
    // Pitch every point aft of the mains nose-up about the contact; the lowest must sit on the ground.
    const [c, s] = [Math.cos(stance!.tailDownPitchRad), Math.sin(stance!.tailDownPitchRad)]
    const lowestAft = pts.filter((p) => p[0] < main[0] - 1).map(([x, y]) => main[1] + (x - main[0]) * s + (y - main[1]) * c).reduce((a, b) => Math.min(a, b))
    expect(Math.abs(lowestAft - main[1]), `${spec.id}: tail ${(lowestAft - main[1]).toFixed(3)} m off the ground`).toBeLessThanOrEqual(TOLERANCE_M)
  })
})
