/**
 * CPU oracle for the GPU readback tests, not a per-frame rendering path.
 * Convention: inverse transform, positive exponent, no 1/N scaling.
 * The radix-2 tables are decimation-in-time butterflies: bit-reverse input
 * before walking them. They are not Stockham autosort tables. GPU consumers
 * must preserve that permutation as well as the sign and normalization.
 */
import { butterflyStages } from './butterfly.js'
export { butterflyStages } from './butterfly.js'

/** Independent O(N²) definition of the one-dimensional inverse transform. */
export function naiveInverseDft(re: Float64Array, im: Float64Array): { re: Float64Array; im: Float64Array } {
  if (re.length !== im.length) throw new Error('fft: real and imaginary lengths differ')
  const n = re.length
  const outRe = new Float64Array(n)
  const outIm = new Float64Array(n)
  for (let x = 0; x < n; x++) for (let k = 0; k < n; k++) {
    const angle = 2 * Math.PI * x * k / n
    outRe[x] = outRe[x]! + re[k]! * Math.cos(angle) - im[k]! * Math.sin(angle)
    outIm[x] = outIm[x]! + re[k]! * Math.sin(angle) + im[k]! * Math.cos(angle)
  }
  return { re: outRe, im: outIm }
}

/** In-place N×N inverse FFT; arrays of length N select a single 1-D row. */
export function inverseFft2d(re: Float64Array, im: Float64Array, n: number): void {
  const stages = butterflyStages(n)
  if (re.length !== im.length || (re.length !== n && re.length !== n * n)) {
    throw new Error('fft: expected matching N or N×N arrays')
  }
  const bits = Math.log2(n)
  const transformLine = (offset: number, stride: number): void => {
    for (let i = 0; i < n; i++) {
      let reversed = 0
      let value = i
      for (let bit = 0; bit < bits; bit++) {
        reversed = reversed * 2 + value % 2
        value = Math.floor(value / 2)
      }
      if (i < reversed) {
        const a = offset + i * stride
        const b = offset + reversed * stride
        ;[re[a], re[b]] = [re[b]!, re[a]!]
        ;[im[a], im[b]] = [im[b]!, im[a]!]
      }
    }
    for (const stage of stages) for (const p of stage.pairs) {
      const a = offset + p.a * stride
      const b = offset + p.b * stride
      const angle = 2 * Math.PI * p.twiddleIndex / n
      const c = Math.cos(angle)
      const s = Math.sin(angle)
      const tr = c * re[b]! - s * im[b]!
      const ti = s * re[b]! + c * im[b]!
      const ar = re[a]!
      const ai = im[a]!
      re[a] = ar + tr
      im[a] = ai + ti
      re[b] = ar - tr
      im[b] = ai - ti
    }
  }
  const rows = re.length / n
  for (let z = 0; z < rows; z++) transformLine(z * n, 1)
  if (rows > 1) for (let x = 0; x < n; x++) transformLine(x, n)
}
