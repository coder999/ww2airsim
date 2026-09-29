import { describe, expect, it } from 'vitest'
import { contourLabelSites } from '../../../src/render/mission/chartLabels.js'

const horizontal = (y: number, length: number) => ({
  text: '500',
  points: [[0, y], [length / 2, y], [length, y]] as [number, number][],
})

describe('contourLabelSites', () => {
  it('labels the middle of a long line', () => {
    const sites = contourLabelSites([horizontal(50, 400)])
    expect(sites).toHaveLength(1)
    expect(sites[0]!.x).toBeCloseTo(200, 6)
    expect(sites[0]!.y).toBe(50)
  })

  it('skips short lines and two-point arcs shorter than the minimum', () => {
    expect(contourLabelSites([horizontal(50, 30)])).toEqual([])
    expect(contourLabelSites([{ text: '500', points: [[0, 0], [10, 0]] }])).toEqual([])
  })

  it('drops a label that would sit on top of an earlier one', () => {
    const sites = contourLabelSites([horizontal(50, 400), horizontal(60, 400)])
    expect(sites).toHaveLength(1)
  })

  it('keeps labels that are far enough apart', () => {
    expect(contourLabelSites([horizontal(50, 400), horizontal(200, 400)])).toHaveLength(2)
  })
})
