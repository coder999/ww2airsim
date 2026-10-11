import { describe, expect, it } from 'vitest'
import { CLOUDINESS_OPTIONS, cloudLayersForCloudiness, randomCloudiness } from '../../src/render/cloudiness.js'
import type { CloudLayer } from '../../src/sim/scenario.js'

const combinedCumulusCoverage = (layers: readonly CloudLayer[]): number =>
  1 - layers.filter((layer) => layer.kind === 'cumulus').reduce((clear, layer) => clear * (1 - layer.coverage), 1)

describe('sortie cloudiness', () => {
  it('offers the four weather reports in increasing cloud-cover order', () => {
    expect(CLOUDINESS_OPTIONS.map(({ value, label }) => ({ value, label }))).toEqual([
      { value: 'sunny', label: 'Sunny' },
      { value: 'partly-cloudy', label: 'Partly Cloudy' },
      { value: 'cloudy', label: 'Cloudy' },
      { value: 'overcast', label: 'Overcast' },
    ])
    const coverages = CLOUDINESS_OPTIONS.map((option) => option.coverage)
    expect(coverages.every((coverage, i) => i === 0 || coverage > coverages[i - 1]!)).toBe(true)
  })

  it('maps one equal quarter of the roll to each report', () => {
    expect([0, 0.249, 0.25, 0.499, 0.5, 0.749, 0.75, 1].map((draw) => randomCloudiness(() => draw)))
      .toEqual(['sunny', 'sunny', 'partly-cloudy', 'partly-cloudy', 'cloudy', 'cloudy', 'overcast', 'overcast'])
  })

  it('preserves scenario weather when no title-screen choice exists', () => {
    const layers: readonly CloudLayer[] = [{ kind: 'cumulus', baseM: 1500, thicknessM: 900, coverage: 0.45 }]
    expect(cloudLayersForCloudiness(layers, undefined)).toBe(layers)
  })

  it('changes only cumulus coverage and reaches each selected combined sky coverage', () => {
    const layers: readonly CloudLayer[] = [
      { kind: 'cumulus', baseM: 900, thicknessM: 500, coverage: 0.2 },
      { kind: 'cumulus', baseM: 1700, thicknessM: 500, coverage: 0.35 },
      { kind: 'cirrus', baseM: 7000, thicknessM: 300, coverage: 0.35 },
    ]
    for (const option of CLOUDINESS_OPTIONS) {
      const adjusted = cloudLayersForCloudiness(layers, option.value)
      expect(combinedCumulusCoverage(adjusted)).toBeCloseTo(option.coverage, 12)
      expect(adjusted.map(({ kind, baseM, thicknessM }) => ({ kind, baseM, thicknessM })))
        .toEqual(layers.map(({ kind, baseM, thicknessM }) => ({ kind, baseM, thicknessM })))
      expect(adjusted.find((layer) => layer.kind === 'cirrus')).toBe(layers[2])
    }
  })

  it('gives a historically clear scenario a normal cumulus layer', () => {
    const cirrus: CloudLayer = { kind: 'cirrus', baseM: 7000, thicknessM: 300, coverage: 0.2 }
    const adjusted = cloudLayersForCloudiness([cirrus], 'cloudy')
    const target = CLOUDINESS_OPTIONS.find((option) => option.value === 'cloudy')!.coverage
    expect(adjusted).toHaveLength(2)
    expect(adjusted[0]).toMatchObject({ kind: 'cumulus' })
    expect(combinedCumulusCoverage(adjusted)).toBeCloseTo(target, 12)
    expect(adjusted[1]).toBe(cirrus)
  })
})
