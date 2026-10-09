import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readWav } from '../../tools/audio/wav.js'

const repoPath = (rel: string): string => fileURLToPath(new URL(`../../${rel}`, import.meta.url))

// Enrolled from the prompt sheet, so a line added there is checked here with
// no edit to this file. Pinned at 68 (34 cues x US/JA) so a regex that stops
// matching fails instead of checking nothing.
const sheet = readFileSync(repoPath('docs/audio/firefly-prompt-sheet.md'), 'utf8')
const VOICE_FILES = [...sheet.matchAll(/^\| \d+ \| .+? \| (?:US English|Japanese) \| `(\w+\.wav)` \|/gm)].map((m) => m[1]!)

// The sheet's export rules (2026-10-08): leading silence under 50 ms, no
// clipping. 328 is about -40 dBFS, the threshold the ElevenLabs takes were
// trimmed at (content/audio/NOTICE.md).
const SILENCE = 328
const LEAD_MAX_S = 0.05
const CLIP = 32700

describe('the radio voice lines (content/audio/voice/)', () => {
  it('enrolls every line on the prompt sheet', () => {
    expect(VOICE_FILES).toHaveLength(68)
  })

  it('has each line as 48 kHz mono 16-bit, starting promptly and unclipped', () => {
    for (const name of VOICE_FILES) {
      const { sampleRate, channels, samples } = readWav(repoPath(`content/audio/voice/${name}`))
      expect([sampleRate, channels], name).toEqual([48_000, 1])
      const first = samples.findIndex((s) => Math.abs(s) > SILENCE)
      expect(first, `${name} is silent`).toBeGreaterThanOrEqual(0)
      expect(first / sampleRate, `${name} leading silence`).toBeLessThan(LEAD_MAX_S)
      let peak = 0
      for (const s of samples) peak = Math.max(peak, Math.abs(s))
      expect(peak, `${name} clips`).toBeLessThan(CLIP)
    }
  })
})
