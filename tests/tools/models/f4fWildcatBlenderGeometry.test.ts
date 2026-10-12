// tests/tools/models/f4fWildcatBlenderGeometry.test.ts
// The first Blender Wildcat duplicate (2026-10-11) was a low wing 0.72 m under the thrust line, with the
// download's canopy (0.45 m wide at the top), no turtle deck and a trapezoid fin. These checks pin what Kaboldy's
// F4F-4 three-view on Wikimedia Commons shows, as re-read in tools/models/blender/f4f-wildcat-blender.py; they
// inspect the built GLB, not its source. Tolerances cover pixel reading (1 px = 3.5 mm) and loft sampling.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { modelIO } from '../../../tools/models/document.js'
import { worldPositions, type Vec3 } from '../../../tools/models/rig.js'

const GLB = 'content/aircraft/f4f-wildcat-blender.glb'
const NOSE_AFT_ORIGIN_M = 2.59 // the hub tip is 2.59 m ahead of the wing quarter chord at 30% semispan
const X = (aft: number) => NOSE_AFT_ORIGIN_M - aft

async function nodes(): Promise<(name: RegExp) => Vec3[]> {
  const doc = await modelIO().readBinary(new Uint8Array(readFileSync(GLB)))
  return (name) => {
    const found = doc.getRoot().listNodes().filter((n) => name.test(n.getName()))
    expect(found.length, `nodes ${name}`).toBeGreaterThan(0)
    return found.flatMap((n) => worldPositions(n))
  }
}

// Drawing heights above the propeller axis on the centerline: [m aft of the hub tip, top or bottom, height].
const PROFILE: readonly (readonly [number, 'top' | 'bottom', number])[] = [
  [1.10, 'top', 0.697], [2.50, 'top', 0.858], [3.50, 'top', 1.208], [4.25, 'top', 1.097], [5.50, 'top', 0.854], [6.00, 'top', 0.719],
  [1.10, 'bottom', -0.686], [2.62, 'bottom', -0.945], [3.50, 'bottom', -0.770], [5.10, 'bottom', -0.625], [6.50, 'bottom', -0.424],
]

describe('f4f-wildcat-blender follows the Commons three-view', () => {
  it('keeps the side profile: cowl, deck, hood, turtle deck, belly keel', async () => {
    const skin = (await nodes())(/^f4f_blueGray$/)
    for (const [aft, edge, h] of PROFILE) {
      const ring = skin.filter((p) => Math.abs(p[2]!) < 0.002 && Math.abs(p[0]! - X(aft)) <= 0.02).map((p) => p[1]!)
      expect(ring.length, `centerline points ${aft} m aft`).toBeGreaterThan(0)
      const got = edge === 'top' ? Math.max(...ring) : Math.min(...ring)
      expect(Math.abs(got - h), `${edge} ${got.toFixed(3)} at ${aft} m, drawing ${h}`).toBeLessThanOrEqual(0.03)
    }
  })

  // The wing is lofted with rings only at control ends and traced rows: z 3.59 m is the flap's outer end.
  it('is a mid wing: chord line +0.25 m at z 3.59 m (4.2 deg dihedral from the thrust line), leading edge 2.10 m aft of the hub tip', async () => {
    const skin = (await nodes())(/^f4f_blueGray$/)
    const section = skin.filter((p) => Math.abs(p[2]! - 3.59) <= 0.03)
    expect(section.length).toBeGreaterThan(20)
    const ys = section.map((p) => p[1]!)
    expect(Math.abs((Math.max(...ys) + Math.min(...ys)) / 2 - 0.253), 'mid-thickness height').toBeLessThanOrEqual(0.05)
    expect(Math.abs(Math.max(...section.map((p) => p[0]!)) - X(2.10)), 'leading edge').toBeLessThanOrEqual(0.04)
  })

  it('has the drawn hood: roof +1.236 m, 0.34 m half-width at the rails, narrow roof, windscreen base at 2.63 m', async () => {
    const skin = (await nodes())(/^f4f_blueGray$/)
    const hood = skin.filter((p) => p[0]! <= X(2.6) && p[0]! >= X(3.95) && Math.abs(p[2]!) < 0.4)
    expect(Math.max(...hood.map((p) => p[1]!))).toBeCloseTo(1.236, 1)
    const nearest = Math.max(...skin.filter((p) => p[1]! > 0.9 && Math.abs(p[2]!) < 0.3).map((p) => p[0]!))
    expect(Math.abs(nearest - X(2.70)), 'glass reaches forward to the windscreen').toBeLessThanOrEqual(0.10)
    const at = (y0: number, y1: number) => Math.max(...hood.filter((p) => p[1]! >= y0 && p[1]! <= y1 && Math.abs(p[0]! - X(3.35)) <= 0.05).map((p) => Math.abs(p[2]!)))
    expect(at(0.95, 1.0), 'half-width at +0.95 m (front view 0.245 m)').toBeLessThanOrEqual(0.27)
    expect(at(1.15, 1.25), 'half-width above +1.15 m (front view 0.154 m)').toBeLessThanOrEqual(0.17)
    // The turtle deck behind the hood is a narrow ridge, not the full fuselage width.
    const deck = skin.filter((p) => Math.abs(p[0]! - X(4.5)) <= 0.03 && p[1]! >= 0.95)
    expect(deck.length).toBeGreaterThan(0)
    expect(Math.max(...deck.map((p) => Math.abs(p[2]!)))).toBeLessThanOrEqual(0.22)
  })

  it('has the drawn tail: crown +1.90 m at 8.0-8.36 m, a curved fillet, rudder hinge at 8.10 m, 4.19 m tailplane', async () => {
    const get = await nodes()
    const skin = get(/^f4f_blueGray$/)
    const rudder = get(/^Rudder$/)
    const tail = [...skin, ...rudder].filter((p) => p[0]! < X(6.4))
    const crown = tail.reduce((a, p) => (p[1]! > a[1]! ? p : a))
    expect(crown[1]!).toBeCloseTo(1.90, 1)
    expect(crown[0]!).toBeLessThanOrEqual(X(7.95))
    expect(crown[0]!).toBeGreaterThanOrEqual(X(8.40))
    // The leading edge at +1.0 m (7.35 m) and +1.5 m (7.63 m): steep above the fillet, not one straight sweep.
    for (const [h, aft] of [[1.0, 7.347], [1.5, 7.634]] as const) {
      const row = tail.filter((p) => Math.abs(p[1]! - h) <= 0.02)
      expect(Math.abs(Math.max(...row.map((p) => p[0]!)) - X(aft)), `leading edge at +${h} m`).toBeLessThanOrEqual(0.05)
    }
    expect(Math.abs(Math.max(...rudder.map((p) => p[0]!)) - X(8.10)), 'rudder hinge').toBeLessThanOrEqual(0.03)
    expect(Math.max(...rudder.map((p) => p[1]!))).toBeCloseTo(1.75, 1)
    const half = Math.max(...[...skin.filter((p) => p[0]! < X(7.0)), ...get(/^Elevator[LR]$/)].map((p) => Math.abs(p[2]!)))
    expect(Math.abs(half - 2.095), 'tailplane half-span').toBeLessThanOrEqual(0.03)
  })
})
