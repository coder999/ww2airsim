// tests/render/modelCredits.test.ts
import { describe, expect, it } from 'vitest'
import { loadModelEntries } from '../../tools/models/manifest.js'
import { modelCredits, modelCreditsText } from '../../src/render/modelCredits.js'
import { MODEL_CREDITS } from '../../src/render/modelCreditsIndex.js'

const src = (url: string, author: string, license = 'CC-BY-4.0') => ({ source: { url, author, license } })

describe('the models credit line (ship-models spec §10)', () => {
  it('credits every CC BY entry once per source, in order, and nothing else', () => {
    const credits = modelCredits([src('https://a', 'A'), src('https://b', 'B', 'CC0-1.0'), src('https://a', 'A'), src('https://c', 'C')])
    expect(credits).toEqual([{ author: 'A', url: 'https://a' }, { author: 'C', url: 'https://c' }])
    expect(modelCreditsText(credits)).toBe('Models: A, C (CC BY 4.0)')
    expect(modelCreditsText([])).toBe('')
  })

  it("the page's bundled credits are exactly the entries on disk, so no model ships uncredited", () => {
    expect(MODEL_CREDITS).toEqual(modelCredits(loadModelEntries()))
    for (const e of loadModelEntries().filter((x) => x.source.kind === 'sketchfab' && x.source.license === 'CC-BY-4.0')) {
      if (e.source.kind === 'sketchfab') expect(MODEL_CREDITS.map((c) => c.url), e.id).toContain(e.source.url)
    }
  })

  it('reads, after R2, as one credit per CC BY work in entry-file order (an author with four works is credited four times, each linked to its own work)', () => {
    expect(modelCreditsText(MODEL_CREDITS)).toBe('Models: SavinienBerault, KTKloss, KTKloss, manilov.ap, manilov.ap, JZHU, KTKloss, everlasting17th, AlanTinka, rojatsu, KTKloss (CC BY 4.0)')
  })
})
