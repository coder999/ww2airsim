/**
 * Mip pyramid builder for the terrain grid.
 *
 * The finest grid produced by `resample.ts` is `(2^k)+1` samples on a side
 * (8193 = 2^13+1), row-major, row 0 = north edge, column 0 = west edge. That
 * orientation is load-bearing (a mirrored world looks like plausible terrain
 * rather than a bug), so `halve` must preserve it.
 *
 * Design §2 / coordinator ruling 2026-09-14: `halve` is a sample-aligned
 * tent filter with a mirror boundary, not a block average:
 *
 * - Coarse sample (i,j) sits ON fine sample (2i,2j) -- the coarse grid
 *   shares the fine grid's edge sample POSITIONS at every level, which is
 *   what keeps output row 0 pinned to fine row 0 (still north) and what a
 *   later task's level-12 3x3-at-100km-spacing field requires: a
 *   sample-aligned pyramid puts samples at exactly -100/0/+100 km, while a
 *   cell-centred (block-average) one would shift the grid by half a cell
 *   per level.
 * - Its value is the weighted mean over the 3x3 fine neighbourhood centred
 *   on (2i,2j), with weights [1,2,1] along each axis (a separable tent; the
 *   2D kernel is the outer product, total weight 16).
 * - Out-of-range taps MIRROR: index -1 reads index 1, index n reads index
 *   n-2. Mirroring folds weight that would fall outside the grid back onto
 *   an in-range sample, so the total weight is always 16 -- no special
 *   divisor at the edges.
 * - Divide by 16 and round half away from zero.
 *
 * At n=3 every output sample is a boundary sample on both axes, so mirroring
 * folds the dr=-1 (or dc=-1) tap onto dr=+1 (dc=+1) and the tent degenerates
 * to a plain mean of the 2x2 block -- which is why the brief's "averages the
 * four corners of each cell" description and its worked n=3 example still
 * hold exactly (verified: halve of [0 10 20/30 40 50/60 70 80] at n=3 is
 * [20,30,50,60], matching the brief's own numbers). It is only the interior
 * of a larger grid (n=5 and up) where the tent and a block average diverge;
 * see tests/tools/terrainMips.test.ts's n=5 column-ramp test.
 */

/** Mirror an out-of-range index back into `[0, n-1]`. Only ever needs to
 *  reflect once: `halve` only ever probes `2i-1` or `2i+1`, i.e. at most one
 *  step outside the grid. */
function mirrorIndex(x: number, n: number): number {
  if (x < 0) return -x
  if (x >= n) return 2 * (n - 1) - x
  return x
}

/** [1, 2, 1] tent weights, indexed by tap offset + 1 (offset -1, 0, 1). */
const TENT_WEIGHTS = [1, 2, 1] as const

/** Halve a square grid of `samples` x `samples` int16 decimetres to
 *  `(samples-1)/2 + 1` x `(samples-1)/2 + 1` via the sample-aligned tent
 *  filter with mirror boundary described above. `samples` must be of the
 *  form `(2^k)+1`. */
export function halve(level: Int16Array, samples: number): Int16Array {
  const outSamples = (samples - 1) / 2 + 1
  const out = new Int16Array(outSamples * outSamples)

  for (let outRow = 0; outRow < outSamples; outRow++) {
    for (let outCol = 0; outCol < outSamples; outCol++) {
      // Sum the weighted 3x3 neighbourhood as a plain integer before
      // dividing, so the average cannot drift through floating point
      // (Global Constraints).
      let sum = 0
      for (let dr = -1; dr <= 1; dr++) {
        const row = mirrorIndex(outRow * 2 + dr, samples)
        const wr = TENT_WEIGHTS[dr + 1]!
        for (let dc = -1; dc <= 1; dc++) {
          const col = mirrorIndex(outCol * 2 + dc, samples)
          const wc = TENT_WEIGHTS[dc + 1]!
          sum += wr * wc * level[row * samples + col]!
        }
      }
      // Round half away from zero, not JS Math.round's ties-toward-+Infinity,
      // so a negative and a positive tie round symmetrically (task-5-brief
      // step 3).
      const r = sum / 16
      out[outRow * outSamples + outCol] = r < 0 ? -Math.round(-r) : Math.round(r)
    }
  }

  return out
}

/** Build the full mip pyramid from the finest level down to 3x3, inclusive.
 *  `finest` must be `samples` x `samples`, `samples` of the form `(2^k)+1`.
 *  Level 0 is the finest (returned first); the pyramid stops at 3x3, not
 *  1x1 (task-5-brief: "the pyramid stops at 3x3, not 1x1"). */
export function buildPyramid(finest: Int16Array, samples: number): readonly Int16Array[] {
  const levels: Int16Array[] = [finest]
  let current = finest
  let currentSamples = samples

  while (currentSamples > 3) {
    current = halve(current, currentSamples)
    currentSamples = (currentSamples - 1) / 2 + 1
    levels.push(current)
  }

  return levels
}
