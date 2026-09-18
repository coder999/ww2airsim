import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { AUDIO_ASSETS, assetFor } from '../../src/audio/assets.js'
import { ENGINE_GAIN_MAX, MASTER_GAIN, worstCaseAmplitude } from '../../src/audio/mix.js'
import { readWav } from '../../tools/audio/wav.js'

const repoPath = (rel: string): string => fileURLToPath(new URL(`../../${rel}`, import.meta.url))

describe('the audio asset table (design §3, §5.1)', () => {
  it('names a file that exists, at exactly the byte count it claims', () => {
    // The same argument dist.test.ts makes for depth.bin: a size that is
    // merely plausible cannot tell a truncated copy from a whole one.
    for (const clip of AUDIO_ASSETS) {
      expect(readFileSync(repoPath(clip.path)).length, clip.path).toBe(clip.bytes)
    }
  })

  it('records the peak each file actually reaches', () => {
    // Read off the PCM, not trusted: the gain budget below is arithmetic on
    // these numbers, so a replaced file with a hotter peak has to fail HERE
    // rather than distort in somebody's speakers.
    for (const clip of AUDIO_ASSETS) {
      const { samples } = readWav(repoPath(clip.path))
      let peak = 0
      for (const s of samples) { const a = Math.abs(s); if (a > peak) peak = a }
      expect(peak / 32768, clip.id).toBeCloseTo(clip.peakFullScale, 4)
    }
  })

  it('leaves headroom for every cue landing on a full-throttle engine', () => {
    const enginePeak = assetFor('propeller').peakFullScale
    for (const clip of AUDIO_ASSETS) {
      if (clip.id === 'propeller') continue
      const worst = MASTER_GAIN * worstCaseAmplitude(clip.cueGain, clip.peakFullScale, ENGINE_GAIN_MAX * enginePeak)
      expect(worst, `${clip.id} clips against a full-throttle engine`).toBeLessThanOrEqual(1)
    }
  })
})
