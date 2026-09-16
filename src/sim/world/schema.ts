import { z, type ZodType } from 'zod'

/**
 * On-disk terrain header. Follows the Zod conventions established in
 * `src/sim/flight/schema.ts`:
 *
 * - Every object is `.strict()`. Zod strips unknown keys by default, which
 *   previously let a content typo (`"cdO"` next to a real `cd0`) validate
 *   clean and silently vanish. Spec §9 requires malformed content to fail
 *   loudly, and an unknown key is malformed content.
 * - Numeric fields are never bare `z.number()`, which accepts NaN and
 *   Infinity -- a NaN reaching the integrator (here: the terrain sampler) is
 *   the exact hazard spec §9 warns about. All numeric fields build on
 *   `finite` below.
 *
 * This file lives under `src/sim/`, which must also load in a browser and
 * may not import Node core modules, `src/render/`, `src/input/`,
 * `src/assists/`, or a rendering library (enforced by
 * `.dependency-cruiser.cjs` and tests/architecture/boundary.test.ts). `zod`
 * is fine -- already a dependency, used by the sibling flight schema.
 */

/** Rejects NaN and Infinity, same rationale as flight/schema.ts's `finite`. */
const finite = z.number().refine(Number.isFinite, { message: 'must be a finite number' })
const positive = finite.refine((n) => n > 0, { message: 'must be greater than zero' })
const positiveInt = positive.refine((n) => Number.isInteger(n), { message: 'must be an integer' })

/** log2 of an integer that is exactly a power of two, or undefined if it
 *  is not. Used to check `finestSamples` is `(2^k)+1` and to derive `k`. */
function log2ExactPowerOfTwo(n: number): number | undefined {
  if (n < 1 || !Number.isInteger(n)) return undefined
  const k = Math.round(Math.log2(n))
  return 2 ** k === n ? k : undefined
}

const TerrainHeaderObject = z.object({
  centreLatDeg: finite,
  centreLonDeg: finite,
  halfExtentM: positive,
  finestSamples: positiveInt,
  levels: positiveInt,
  encoding: z.literal('int16-decimetres'),
}).strict()

/**
 * Cross-field: `levels` must agree with the grid the pyramid `buildPyramid`
 * (tools/terrain/mips.ts) actually produces from `finestSamples`.
 *
 * `buildPyramid` halves an `n = (2^k)+1` sample level down to 3x3 inclusive,
 * which is `k` levels (level 0 is `2^k+1`, the last is `2^1+1 = 3`, one
 * level per decrement of the exponent). So `finestSamples` must itself be
 * `(2^k)+1` for some integer k, and `levels` must equal that k exactly --
 * neither more (there is no such level; the pyramid stops at 3x3, not 1x1)
 * nor fewer (a header that disagrees with its own grid is malformed content,
 * spec §9). This is on the whole object, not a `.refine` on `finestSamples`
 * alone, because it has to see `levels` too.
 */
export const terrainHeaderSchema: ZodType<TerrainHeader> = TerrainHeaderObject.refine(
  (h) => {
    const k = log2ExactPowerOfTwo(h.finestSamples - 1)
    return k !== undefined && k === h.levels
  },
  (h) => ({
    message:
      `levels (${h.levels}) disagrees with finestSamples (${h.finestSamples}): ` +
      `finestSamples must be (2^k)+1 and levels must equal k`,
    path: ['levels'],
  }),
)

export type TerrainHeader = {
  readonly centreLatDeg: number
  readonly centreLonDeg: number
  readonly halfExtentM: number
  readonly finestSamples: number
  readonly levels: number
  readonly encoding: 'int16-decimetres'
}

/** Parse and validate a terrain header, throwing on anything malformed
 *  (spec §9: malformed content must fail loudly, not produce a NaN that
 *  teleports the airplane). */
export function parseTerrainHeader(raw: unknown): TerrainHeader {
  return terrainHeaderSchema.parse(raw)
}

/** Sample count on a side at the given pyramid level (0 = finest, matching
 *  `buildPyramid`'s order). Mirrors `halve`'s `(n-1)/2 + 1` exactly, applied
 *  `level` times, without materialising the grid. */
export function samplesAtLevel(header: TerrainHeader, level: number): number {
  let samples = header.finestSamples
  for (let i = 0; i < level; i++) {
    samples = (samples - 1) / 2 + 1
  }
  return samples
}
