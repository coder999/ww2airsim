// tests/tools/models/a6m2ZeroBlenderGeometry.test.ts
// The A6M2 duplicate against Kaboldy's Commons three-view as re-read 2026-10-11 (a6m2-zero-blender.py header).
// The first pass read the top view at its own scale, 7% small: half-widths 7% narrow, the origin 0.14 m too far
// forward, the tail cone pinched, a straight trapezoid fin crowned 0.3 m aft and a 4.0 m square-tipped tailplane 0.13 m
// high. These pin drawing-measured features of the built GLB, not its source.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { modelIO } from '../../../tools/models/document.js'
import { worldPositions } from '../../../tools/models/rig.js'

const X = (aft: number) => 2.36 - aft // the wing quarter chord at 30% semispan is 2.36 m aft of the spinner tip

async function skin(): Promise<readonly (readonly number[])[]> {
  const doc = await modelIO().readBinary(new Uint8Array(readFileSync('content/aircraft/a6m2-zero-blender.glb')))
  const points = doc.getRoot().listNodes().filter((n) => n.getName() === 'a6m2b_dark').flatMap((n) => worldPositions(n))
  expect(points.length, 'the A6M2 whole-skin node').toBeGreaterThan(1_000)
  return points
}
const max = (values: number[]) => values.reduce((a, b) => Math.max(a, b), -Infinity)
const min = (values: number[]) => values.reduce((a, b) => Math.min(a, b), Infinity)

describe('a6m2-zero-blender follows the Commons three-view', () => {
  it('keeps the drawn side ordinates and plan half-widths on the cowl and aft body', async () => {
    const points = await skin()
    // (m aft of the spinner, top, bottom above the propeller axis, half-width)
    for (const [aft, top, bottom, half] of [
      [0.80, 0.588, -0.648, 0.572], [1.00, 0.601, -0.655, 0.572], [5.00, 0.595, -0.551, 0.463],
      [5.50, 0.561, -0.521, 0.433], [6.00, 0.525, -0.488, 0.393], [6.50, 0.482, -0.445, 0.345],
    ] as const) {
      const ring = points.filter((p) => Math.abs(p[0]! - X(aft)) < 0.002)
      const center = ring.filter((p) => Math.abs(p[2]!) < 0.002)
      expect(center.length, `centerline ring ${aft} m aft`).toBeGreaterThanOrEqual(2)
      expect(max(center.map((p) => p[1]!)), `top ${aft} m aft`).toBeCloseTo(top, 2)
      expect(min(center.map((p) => p[1]!)), `bottom ${aft} m aft`).toBeCloseTo(bottom, 2)
      expect(max(ring.map((p) => Math.abs(p[2]!))), `half-width ${aft} m aft`).toBeCloseTo(half, 2)
    }
  })

  it('puts the canopy roof at +1.005 m from 2.8 to 3.35 m and closes it on the deck by 4.75 m', async () => {
    const points = await skin()
    const top = (from: number, to: number) => max(points.filter((p) => p[0]! <= X(from) && p[0]! >= X(to) && Math.abs(p[2]!) < 0.5).map((p) => p[1]!))
    expect(top(2.85, 3.30)).toBeGreaterThanOrEqual(1.0)
    expect(top(2.85, 3.30)).toBeLessThanOrEqual(1.03) // frame bars stand 0.022 m proud
    expect(top(4.40, 4.50)).toBeCloseTo(0.72, 1) // the sloping rear glazing's 4.45 m section and frame
    expect(top(4.80, 5.40)).toBeLessThanOrEqual(0.61)
  })

  it('has the drawn fin: a rounded crown +1.645 m at 8.12 m on a straight-then-curved leading edge', async () => {
    const tail = (await skin()).filter((p) => p[0]! < X(6.6))
    const crown = tail.reduce((a, p) => (p[1]! > a[1]! ? p : a))
    expect(crown[1]!).toBeCloseTo(1.645, 1)
    expect(Math.abs(crown[0]! - X(8.12))).toBeLessThanOrEqual(0.08)
    for (const [height, leading] of [[1.0, 7.351], [1.6, 7.917]] as const) {
      const row = tail.filter((p) => Math.abs(p[1]! - height) <= 0.01)
      expect(Math.abs(max(row.map((p) => p[0]!)) - X(leading)), `fin leading edge at +${height} m`).toBeLessThanOrEqual(0.04)
    }
  })

  it('has the drawn 4.65 m tailplane on a +0.12 m chord line and a rounded wingtip', async () => {
    const points = await skin()
    const tailplane = points.filter((p) => p[0]! < X(6.6) && Math.abs(p[1]! - 0.12) < 0.1)
    expect(max(tailplane.map((p) => Math.abs(p[2]!)))).toBeCloseTo(2.32, 1)
    const section = tailplane.filter((p) => Math.abs(Math.abs(p[2]!) - 1.25) < 0.01)
    expect((max(section.map((p) => p[1]!)) + min(section.map((p) => p[1]!))) / 2).toBeCloseTo(0.12, 1)
    // 97% semispan: the drawn tip has 0.65 of the straight-taper chord (1.24 m), so about 0.80 m.
    const tip = points.filter((p) => Math.abs(p[2]! - 5.82) < 0.01)
    expect(max(tip.map((p) => p[0]!)) - min(tip.map((p) => p[0]!))).toBeCloseTo(0.80, 1)
  })
})
