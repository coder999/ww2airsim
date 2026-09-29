import { fileURLToPath } from 'node:url'
import { assetFor, type ClipId } from '../../src/audio/assets.js'
import { readWav } from './wav.js'

/** Seamless-loop search for one clip: `npx tsx tools/audio/findloop.ts <clipId>`. */
const id = process.argv[2] as ClipId | undefined
if (id === undefined) throw new Error('usage: findloop.ts <clipId>')
const { samples, channels, frames, sampleRate } = readWav(fileURLToPath(new URL(`../../${assetFor(id).path}`, import.meta.url)))
const seamStep = (start: number, end: number): number => {
  let total = 0
  for (let c = 0; c < channels; c++) {
    total += Math.abs(samples[end * channels + c]! - samples[start * channels + c]!)
    total += Math.abs((samples[end * channels + c]! - samples[(end - 1) * channels + c]!) - (samples[start * channels + c]! - samples[(start - 1) * channels + c]!))
  }
  return total
}
let best = { start: 1, end: frames - 1, seam: Infinity }
const sweep = (s0: number, s1: number, e0: number, e1: number, stride: number): void => {
  for (let start = Math.max(1, s0); start <= s1; start += stride) {
    for (let end = Math.max(start + 1, e0); end <= e1; end += stride) {
      const seam = seamStep(start, end)
      if (seam < best.seam) best = { start, end, seam }
    }
  }
}
sweep(1, sampleRate, frames - sampleRate, frames - 1, 16)
sweep(best.start - 32, best.start + 32, best.end - 32, best.end + 32, 1)
console.log(`${id}: start ${best.start} end ${best.end} seam ${best.seam} naive ${seamStep(1, frames - 1)} frames ${frames}`)
