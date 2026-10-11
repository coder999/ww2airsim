import { MAX_CLOUD_LAYERS, type CloudLayer } from '../sim/scenario.js'
import type { Cloudiness } from '../sim/sortie.js'

export type CloudinessOption = {
  readonly value: Cloudiness
  readonly label: string
  /** Combined cumulus sky coverage, seen from above. */
  readonly coverage: number
}

/** Form 2's player-facing weather roll, from fair weather through a broken deck. */
export const CLOUDINESS_OPTIONS: readonly CloudinessOption[] = [
  { value: 'sunny', label: 'Sunny', coverage: 0.1 },
  { value: 'partly-cloudy', label: 'Partly Cloudy', coverage: 0.25 },
  { value: 'cloudy', label: 'Cloudy', coverage: 0.42 },
  { value: 'overcast', label: 'Overcast', coverage: 0.58 },
]

const DEFAULT_CUMULUS: Omit<CloudLayer, 'coverage'> = {
  kind: 'cumulus',
  baseM: 1200,
  thicknessM: 700,
}

const optionFor = (cloudiness: Cloudiness): CloudinessOption =>
  CLOUDINESS_OPTIONS.find((option) => option.value === cloudiness)!

/** One uniform four-sided roll. Injecting the draw keeps the rule deterministic in tests. */
export function randomCloudiness(random: () => number = Math.random): Cloudiness {
  const draw = Math.max(0, Math.min(1 - Number.EPSILON, random()))
  return CLOUDINESS_OPTIONS[Math.floor(draw * CLOUDINESS_OPTIONS.length)]!.value
}

/**
 * Apply a player's cloudiness choice without flattening the scenario's
 * authored cloud bases, thicknesses, or cirrus. Multiple cumulus layers are
 * reweighted through their clear-sky fractions so their combined coverage is
 * exactly the selected target. A historically clear scenario receives one
 * ordinary Leyte cumulus layer; quick launches pass no choice and preserve
 * scenario weather byte-for-byte.
 */
export function cloudLayersForCloudiness(
  layers: readonly CloudLayer[],
  cloudiness: Cloudiness | undefined,
): readonly CloudLayer[] {
  if (cloudiness === undefined) return layers

  const target = optionFor(cloudiness).coverage
  const cumulus = layers.filter((layer) => layer.kind === 'cumulus')
  if (cumulus.length === 0) {
    return [...layers, { ...DEFAULT_CUMULUS, coverage: target }]
      .sort((a, b) => a.baseM - b.baseM)
      .slice(0, MAX_CLOUD_LAYERS)
  }

  const clearFraction = cumulus.reduce((clear, layer) => clear * (1 - layer.coverage), 1)
  const equalCoverage = 1 - (1 - target) ** (1 / cumulus.length)
  const exponent = clearFraction > 0 && clearFraction < 1
    ? Math.log(1 - target) / Math.log(clearFraction)
    : null

  return layers.map((layer) => {
    if (layer.kind !== 'cumulus') return layer
    const coverage = exponent === null ? equalCoverage : 1 - (1 - layer.coverage) ** exponent
    return { ...layer, coverage }
  })
}
