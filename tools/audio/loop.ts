import { fileURLToPath } from 'node:url'
import { AUDIO_ASSETS, assetFor } from '../../src/audio/assets.js'
import { LOOP_END_FRAME, LOOP_START_FRAME } from '../../src/audio/mix.js'
import { readWav } from './wav.js'

/**
 * Re-runs every measurement the audio design rests on, so none of them has to
 * be taken on faith: the per-clip table in design §3, and the propeller loop
 * points in §4.1.
 *
 * Run: `npx tsx tools/audio/loop.ts`
 */

const repoPath = (rel: string): string => fileURLToPath(new URL(`../../${rel}`, import.meta.url))

/** What a click is made of: the value step across the splice, plus the slope
 *  mismatch, summed over both channels. Proximity to zero is irrelevant --
 *  the chosen pair sits near -0.38 full scale and still splices silently. */
function seamStep(s: Int16Array, ch: number, start: number, end: number): number {
  let total = 0
  for (let c = 0; c < ch; c++) {
    total += Math.abs(s[end * ch + c]! - s[start * ch + c]!)
    total += Math.abs(
      (s[end * ch + c]! - s[(end - 1) * ch + c]!) - (s[start * ch + c]! - s[(start - 1) * ch + c]!),
    )
  }
  return total
}

for (const clip of AUDIO_ASSETS) {
  const { sampleRate, channels, frames, samples } = readWav(repoPath(clip.path))
  let peak = 0
  for (const s of samples) { const a = Math.abs(s); if (a > peak) peak = a }
  console.log(
    `${clip.id.padEnd(15)} ${sampleRate} Hz  ${channels}ch  ${String(frames).padStart(6)} frames  ` +
    `${(frames / sampleRate).toFixed(3).padStart(6)} s  peak ${String(peak).padStart(5)} (${(peak / 32768).toFixed(4)})`,
  )
}

// The loop search, coarse then fine. An exhaustive sweep of every (start, end)
// pair in the first and last second is 2.3e9 evaluations; a stride-16 pass
// followed by a +/-32 refinement around its winner is about 9e6 and lands on
// the same optimum, which is deep and narrow rather than flat.
const prop = readWav(repoPath(assetFor('propeller').path))
const { samples, channels, frames } = prop
const START_LO = 1, START_HI = prop.sampleRate
const END_LO = frames - prop.sampleRate, END_HI = frames - 1

let best = { start: START_LO, end: END_HI, seam: Infinity }
const sweep = (s0: number, s1: number, e0: number, e1: number, stride: number): void => {
  for (let start = Math.max(1, s0); start <= s1; start += stride) {
    for (let end = Math.max(start + 1, e0); end <= e1; end += stride) {
      const seam = seamStep(samples, channels, start, end)
      if (seam < best.seam) best = { start, end, seam }
    }
  }
}
sweep(START_LO, START_HI, END_LO, END_HI, 16)
sweep(best.start - 32, best.start + 32, best.end - 32, best.end + 32, 1)

const naive = seamStep(samples, channels, 1, frames - 1)
const committed = seamStep(samples, channels, LOOP_START_FRAME, LOOP_END_FRAME)
console.log(
  `best loop: start ${best.start} (${(best.start / prop.sampleRate).toFixed(6)} s)  ` +
  `end ${best.end} (${(best.end / prop.sampleRate).toFixed(6)} s)  seam ${best.seam}  naive ${naive}`,
)
console.log(`committed constants: start ${LOOP_START_FRAME} end ${LOOP_END_FRAME} seam ${committed}`)
