import { describe, expect, it } from 'vitest'
import { contourLabelSites } from '../../../src/render/mission/chartLabels.js'

const dense = (z: number, x0: number, x1: number, text = '500') => ({
  text,
  points: Array.from({ length: Math.floor((x1 - x0) / 5) + 1 }, (_, i) => [x0 + i * 5, z] as [number, number]),
})

describe('contourLabelSites (world coordinates, 1 m per pixel)', () => {
  it('labels a long line, on the line', () => {
    const sites = contourLabelSites([dense(50, 0, 400)])
    expect(sites.length).toBeGreaterThanOrEqual(1)
    for (const s of sites) expect(s.y).toBe(50)
  })

  it('skips lines shorter than the minimum', () => {
    expect(contourLabelSites([dense(50, 0, 30)])).toEqual([])
    expect(contourLabelSites([{ text: '500', points: [[0, 0], [10, 0]] }])).toEqual([])
  })

  it('drops a label that would sit on top of an earlier one', () => {
    const sites = contourLabelSites([dense(50, 0, 400), dense(60, 0, 400)])
    for (const a of sites) for (const b of sites) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(90)
  })

  it('keeps labels that are far enough apart', () => {
    const sites = contourLabelSites([dense(50, 0, 400), dense(400, 0, 400)])
    expect(sites.some((s) => s.y === 50)).toBe(true)
    expect(sites.some((s) => s.y === 400)).toBe(true)
  })

  it('does not move a label when a pan clips the same line differently', () => {
    const full = contourLabelSites([dense(50, -300, 700)])
    const clipped = contourLabelSites([dense(50, 100, 700)])
    const inBoth = full.filter((s) => s.x > 150)
    expect(inBoth.length).toBeGreaterThan(0)
    for (const s of inBoth) expect(clipped).toContainEqual(s)
  })

  it('scales its lattice with meters per pixel', () => {
    const a = contourLabelSites([dense(50, 0, 4000)], 10)
    expect(a.length).toBeGreaterThanOrEqual(1)
  })
})
