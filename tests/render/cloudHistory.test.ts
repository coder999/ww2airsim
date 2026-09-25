import { describe, expect, it } from 'vitest'
import { Matrix4, PerspectiveCamera } from 'three'
import { reprojectUv, shouldResetHistory } from '../../src/render/scene/cloudHistory.js'

function viewProj(yawRad: number): number[] {
  const cam = new PerspectiveCamera(60, 16 / 9, 0.1, 100_000)
  cam.position.set(0, 0, 0); cam.rotation.set(0, yawRad, 0); cam.updateMatrixWorld()
  return new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).toArray()
}

describe('reprojectUv', () => {
  it('a point dead ahead with a still camera lands at the screen center', () => {
    const uv = reprojectUv({ dirWorld: { x: 0, y: 0, z: -1 }, depthM: 5000, eye: { x: 0, y: 1500, z: 0 }, prevEye: { x: 0, y: 1500, z: 0 }, prevViewProjection: viewProj(0) })!
    expect(uv.u).toBeCloseTo(0.5, 6); expect(uv.v).toBeCloseTo(0.5, 6)
  })
  it('eye translation shifts a near cloud more than a far one (parallax)', () => {
    const base = { dirWorld: { x: 0, y: 0, z: -1 }, eye: { x: 0, y: 1500, z: 0 }, prevEye: { x: -50, y: 1500, z: 0 }, prevViewProjection: viewProj(0) }
    const near = reprojectUv({ ...base, depthM: 500 })!, far = reprojectUv({ ...base, depthM: 50_000 })!
    expect(Math.abs(near.u - 0.5)).toBeGreaterThan(Math.abs(far.u - 0.5) * 10)
  })
  it('a point behind the previous camera is rejected', () => {
    expect(reprojectUv({ dirWorld: { x: 0, y: 0, z: 1 }, depthM: 1000, eye: { x: 0, y: 0, z: 0 }, prevEye: { x: 0, y: 0, z: 0 }, prevViewProjection: viewProj(0) })).toBeNull()
  })
})
describe('shouldResetHistory', () => {
  it('keeps history at flight speeds', () => {
    expect(shouldResetHistory({ eye: { x: 3, y: 0, z: 0 }, prevEye: { x: 0, y: 0, z: 0 }, frameSeconds: 1 / 60 })).toBe(false)
  })
  it('resets on a teleport', () => {
    expect(shouldResetHistory({ eye: { x: 5000, y: 0, z: 0 }, prevEye: { x: 0, y: 0, z: 0 }, frameSeconds: 1 / 60 })).toBe(true)
  })
  it('resets after a long stall (pause, tab switch)', () => {
    expect(shouldResetHistory({ eye: { x: 0, y: 0, z: 0 }, prevEye: { x: 0, y: 0, z: 0 }, frameSeconds: 0.5 })).toBe(true)
  })
})

// Conventions the TSL mirror relies on (Task 4 additions, 2026-09-24): `v`
// is TOP-origin, matching `screenCoordinate` and a WebGPU texture row 0, and
// a camera that was looking further left last frame saw today's straight-
// ahead point to the right of its center.
describe('reprojectUv conventions', () => {
  it('a point above the view axis has v < 0.5 (top origin)', () => {
    const uv = reprojectUv({ dirWorld: { x: 0, y: 0.2, z: -1 }, depthM: 5000, eye: { x: 0, y: 0, z: 0 }, prevEye: { x: 0, y: 0, z: 0 }, prevViewProjection: viewProj(0) })!
    expect(uv.v).toBeLessThan(0.5); expect(uv.u).toBeCloseTo(0.5, 6)
  })
  it('a camera that looked further left last frame saw a point dead ahead right of its center', () => {
    // Previous camera yawed +0.1 rad (three: +y rotation turns -z toward -x,
    // i.e. it looked LEFT). Today's straight-ahead point was right of its center.
    const uv = reprojectUv({ dirWorld: { x: 0, y: 0, z: -1 }, depthM: 5000, eye: { x: 0, y: 0, z: 0 }, prevEye: { x: 0, y: 0, z: 0 }, prevViewProjection: viewProj(0.1) })!
    expect(uv.u).toBeGreaterThan(0.5); expect(uv.v).toBeCloseTo(0.5, 6)
  })
})
describe('shouldResetHistory under time compression', () => {
  it('keeps history at 3x time at 180 m/s (540 m/s of eye travel in sim terms)', () => {
    expect(shouldResetHistory({ eye: { x: 9, y: 0, z: 0 }, prevEye: { x: 0, y: 0, z: 0 }, frameSeconds: 1 / 60, timeScale: 3 })).toBe(false)
  })
  it('the stall rule stays in real seconds under time compression', () => {
    expect(shouldResetHistory({ eye: { x: 0, y: 0, z: 0 }, prevEye: { x: 0, y: 0, z: 0 }, frameSeconds: 0.2, timeScale: 3 })).toBe(false)
  })
})
