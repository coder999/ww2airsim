// The drawn models against the specs that draw them: mains on gear.heightM, and, pitched by
// MODEL_STANCE, the tail resting on the ground. Measured on the glb, in the sim body frame the
// game draws it in. Mark's screenshots of 2026-09-28 (a Hellcat with its tailwheel 1.1 m in the
// air, a Wildcat 2.2 m above the strip) are what this exists to catch; only R3 models were held
// to gear.heightM before (aircraftRigs.test.ts), which is why the Wildcat never was.
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { MODEL_STANCE } from '../../../src/render/scene/stance.js'
import { drawnPoints } from './_drawnPoints.js'

const TOLERANCE_M = 0.05
const specs = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => loadAircraftSpec(f.replace(/\.json$/, '')))

describe('every drawn model stands on its spec (2026-09-28)', () => {
  it.each(specs.map((s) => [s.id, s] as const))('%s: mains on gear.heightM, tail on the ground at the stance pitch', async (_id, spec) => {
    const stance = MODEL_STANCE[spec.view.model]
    expect(stance, `${spec.view.model} has no MODEL_STANCE entry`).toBeDefined()
    const pts = await drawnPoints(spec.view.model)
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

  // W1 R5: the Wildcat's legs are lengthened to Grumman's 12°20' static ground angle ([DS] 116a), so
  // its measured first-touch angle -- the least nose-up pitch about the mains that brings a point aft
  // of them to the ground -- must be that angle, and MODEL_STANCE must say so.
  it("the Wildcat's drawn wheels give the sourced 12°20′ within 0.25 degrees", async () => {
    const pts = await drawnPoints('wildcat')
    const xs = pts.map((p) => p[0])
    const [lo, hi] = [xs.reduce((a, b) => Math.min(a, b)), xs.reduce((a, b) => Math.max(a, b))]
    const main = pts.filter((p) => p[0] > lo + 0.25 * (hi - lo)).reduce((a, p) => (p[1] < a[1] ? p : a))
    const touch = pts.filter((p) => p[0] < main[0] - 1).map(([x, y]) => Math.atan2(y - main[1], main[0] - x)).reduce((a, b) => Math.min(a, b))
    const deg = (r: number) => (r * 180) / Math.PI
    expect(Math.abs(deg(touch) - (12 + 20 / 60)), `first touch at ${deg(touch).toFixed(3)} deg`).toBeLessThanOrEqual(0.25)
    expect(Math.abs(deg(MODEL_STANCE['wildcat']!.tailDownPitchRad - touch)), 'MODEL_STANCE.wildcat against the drawing').toBeLessThanOrEqual(0.25)
  })
})
