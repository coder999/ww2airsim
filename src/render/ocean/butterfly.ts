// src/render/ocean/butterfly.ts
export type Pair = { readonly a: number; readonly b: number; readonly twiddleIndex: number }
export type Stage = { readonly span: number; readonly pairs: readonly Pair[] }

/**
 * The index tables a radix-2 FFT walks: one `Stage` per doubling, each with
 * `n/2` disjoint index pairs and the twiddle each pair multiplies by.
 *
 * Separated from the arithmetic so that `wgsl.ts` (Task 8) generates the GPU
 * kernel from the SAME tables the reference walks. Two transforms that agree
 * about arithmetic but disagree about indexing produce a field that still
 * looks exactly like waves, which is why this is a module and not a loop.
 */
export function butterflyStages(n: number): readonly Stage[] {
  if (n < 2 || !Number.isInteger(Math.log2(n))) {
    throw new Error(`fft: ${n} is not a power of two`)
  }
  const stages: Stage[] = []
  for (let span = 1; span < n; span *= 2) {
    const pairs: Pair[] = []
    for (let start = 0; start < n; start += span * 2) {
      for (let k = 0; k < span; k++) {
        pairs.push({ a: start + k, b: start + k + span, twiddleIndex: (k * (n / (span * 2))) % n })
      }
    }
    stages.push({ span, pairs })
  }
  return stages
}
