import { z } from 'zod'

// Deliberately local: the ocean format is a rendering concern, independent
// of sim's terrain format. Measured GEBCO depths reach -7971 m in this box;
// int16 decimetres would overflow. Metres retain full range at the same size.
const finite = z.number().refine(Number.isFinite, { message: 'must be finite' })
const positive = finite.refine((v) => v > 0, { message: 'must be positive' })
const positiveInt = positive.refine(Number.isInteger, { message: 'must be an integer' })
export const oceanHeaderSchema = z.object({
  centreLatDeg: finite,
  centreLonDeg: finite,
  halfExtentM: positive,
  samples: positiveInt.refine((v) => v >= 3 && Number.isInteger(Math.log2(v - 1)), {
    message: 'samples must be 2^k + 1, k >= 1',
  }),
  encoding: z.literal('int16-metres'),
}).strict()

export type OceanHeader = z.infer<typeof oceanHeaderSchema>
export function parseOceanHeader(raw: unknown): OceanHeader {
  return oceanHeaderSchema.parse(raw)
}
