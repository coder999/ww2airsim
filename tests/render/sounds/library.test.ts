// tests/render/sounds/library.test.ts
import { describe, expect, it } from 'vitest'
import { AUDIO_ASSETS } from '../../../src/audio/assets.js'
import { groupCandidates, type CandidateTake } from '../../../src/render/sounds/library.js'

const take = (clip: string, t: string, text: string | null = null): CandidateTake => ({ file: `${clip}__${t}.wav`, clip, take: t, note: '', text })

describe('groupCandidates (sounds.html, 2026-10-09)', () => {
  it('puts both languages and every take of a cue in one group', () => {
    const groups = groupCandidates([
      take('radio_paddles_cut_1_us', 'ml2', 'Cut.'),
      take('radio_paddles_cut_1_ja', 'ml2', '絞れ。'),
      take('radio_paddles_cut_1_us', 'v3tags', 'Cut.'),
      take('radio_tower_raid_clear_us', 'ml2'),
    ], AUDIO_ASSETS)
    expect(groups.map((g) => [g.cue, g.takes.length])).toEqual([['radio_paddles_cut_1', 3], ['radio_tower_raid_clear', 1]])
  })

  it('flags a cue that would replace a clip the game already ships, and only that one', () => {
    const groups = groupCandidates([take('rocket_whoosh', 'take1'), take('radio_paddles_cut_1_us', 'ml2')], AUDIO_ASSETS)
    expect(groups.map((g) => g.replaces)).toEqual(['rocket_whoosh', null])
  })
})
