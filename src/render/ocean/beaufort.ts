// src/render/ocean/beaufort.ts
/**
 * The Beaufort scale, as a table.
 *
 * Source: Met Éireann Marine Beaufort Scale (retrieved 2026-09-15):
 * https://www.met.ie/forecasts/marine-inland-lakes/beaufort-scale
 * Wind entries are representative speeds within the published 10 m bands,
 * rather than a second measured column. Force 0 selects exact calm; force
 * 12 uses 34 m/s as a representative value in its unbounded hurricane band.
 * Wave heights are the unbracketed metre column; bracketed figures are
 * probable maxima. The service describes these heights as open-sea guides.
 *
 * The wave-height column is NOT what the renderer draws -- the spectrum in
 * `spectrum.ts` produces that. It is here as an independent cross-check on the
 * spectrum's parameterisation (see that module's test), which is the only way
 * to catch a spectrum that is internally consistent and physically wrong.
 */
const TABLE: readonly (readonly [windMps: number, waveM: number])[] = [
  [0.0, 0.0],   [1.0, 0.1],   [2.5, 0.2],   [4.4, 0.6],
  [6.7, 1.0],   [9.4, 2.0],   [12.3, 3.0],  [15.5, 4.0],
  [19.0, 5.5],  [22.6, 7.0],  [26.5, 9.0],  [30.6, 11.5],
  [34.0, 14.0],
]

export const BEAUFORT_MIN = 0
export const BEAUFORT_MAX = 12

function row(beaufort: number): readonly [number, number] {
  if (!Number.isFinite(beaufort)) throw new Error(`beaufort: ${beaufort} is not a finite number`)
  if (!Number.isInteger(beaufort)) throw new Error(`beaufort: ${beaufort} is not an integer`)
  if (beaufort < BEAUFORT_MIN || beaufort > BEAUFORT_MAX) {
    throw new Error(`beaufort: ${beaufort} is outside the scale, which runs 0 and 12 inclusive`)
  }
  return TABLE[beaufort]!
}

/** Mean wind speed at 10 m for a Beaufort force, m/s. */
export function windSpeedMps(beaufort: number): number {
  return row(beaufort)[0]
}

/** Probable significant wave height in the open sea for a Beaufort force, m.
 *  A cross-check on the spectrum, never an input to it. */
export function wmoWaveHeightM(beaufort: number): number {
  return row(beaufort)[1]
}

/** The force whose representative speed is nearest `mps` (Plan 8: scenario
 *  weather drives the sea). 15 kn (7.717 m/s) is force 4, which is also the
 *  development default, so deck quals' sea is the force 4 every scenario
 *  rendered before Plan 8. */
export function beaufortFromWindMps(mps: number): number {
  if (!Number.isFinite(mps) || mps < 0) throw new Error(`beaufort: wind ${mps} m/s is not a speed`)
  let best = 0
  for (let b = 1; b <= BEAUFORT_MAX; b++) {
    if (Math.abs(TABLE[b]![0] - mps) < Math.abs(TABLE[best]![0] - mps)) best = b
  }
  return best
}
