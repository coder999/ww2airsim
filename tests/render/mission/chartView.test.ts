import { describe, expect, it } from 'vitest'
import { MAX_ZOOM, panView, viewBounds, zoomView, type ChartView } from '../../../src/render/mission/chartView.js'

const base = { minX: -1000, maxX: 1000, minZ: -500, maxZ: 500 }
const W = 800
const H = 520
const fit: ChartView = { zoom: 1, cx: 0, cz: 0 }
const scaleOf = (b: typeof base): number => Math.min(W / (b.maxX - b.minX), H / (b.maxZ - b.minZ))

describe('the chart view', () => {
  it('shows the fitted bounds at zoom 1 and shrinks the span with zoom', () => {
    expect(viewBounds(base, fit)).toEqual(base)
    const b = viewBounds(base, { zoom: 4, cx: 100, cz: -50 })
    expect(b.maxX - b.minX).toBeCloseTo(500, 9)
    expect((b.minX + b.maxX) / 2).toBeCloseTo(100, 9)
  })

  it('zooms about the cursor: the world point under it stays put', () => {
    // Cursor at 75% across, 25% down the chart.
    const fx = 0.75, fz = 0.25
    const before = viewBounds(base, fit)
    const s0 = scaleOf(before)
    const px = (before.minX + before.maxX) / 2 + (fx - 0.5) * (W / s0)
    const pz = (before.minZ + before.maxZ) / 2 + (fz - 0.5) * (H / s0)
    const next = zoomView(base, fit, 2, fx, fz, W, H)
    const b = viewBounds(base, next)
    const s1 = scaleOf(b)
    const cxNow = (b.minX + b.maxX) / 2
    const czNow = (b.minZ + b.maxZ) / 2
    expect(cxNow + (fx - 0.5) * (W / s1)).toBeCloseTo(px, 6)
    expect(czNow + (fz - 0.5) * (H / s1)).toBeCloseTo(pz, 6)
    expect(next.zoom).toBeCloseTo(2, 12)
  })

  it('clamps zoom to [1, MAX_ZOOM]', () => {
    expect(zoomView(base, fit, 0.5, 0.5, 0.5, W, H).zoom).toBe(1)
    expect(zoomView(base, { ...fit, zoom: MAX_ZOOM }, 2, 0.5, 0.5, W, H).zoom).toBe(MAX_ZOOM)
  })

  it('pans opposite to the drag, in meters per pixel, and stays inside the world', () => {
    const z: ChartView = { zoom: 2, cx: 0, cz: 0 }
    const s = scaleOf(viewBounds(base, z))
    const p = panView(z, 40, -20, s)
    expect(p.cx).toBeCloseTo(-40 / s, 9)
    expect(p.cz).toBeCloseTo(20 / s, 9)
    const far = panView(z, -1e9, 1e9, s)
    expect(Math.abs(far.cx)).toBeLessThanOrEqual(100_000)
    expect(Math.abs(far.cz)).toBeLessThanOrEqual(100_000)
  })
})
