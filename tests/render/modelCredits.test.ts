// tests/render/modelCredits.test.ts
import { describe, expect, it } from 'vitest'
import { loadModelEntries } from '../../tools/models/manifest.js'
import { modelCreditParts, modelCredits, modelCreditsText } from '../../src/render/modelCredits.js'
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

  it('names an author once, in first-appearance order; several works become numbered links, one per work (Mark, 2026-09-27)', () => {
    const credits = modelCredits([src('https://a1', 'A'), src('https://b', 'B'), src('https://a2', 'A')])
    expect(modelCreditParts(credits)).toEqual([
      { text: 'A' }, { text: ' (' }, { text: '1', href: 'https://a1' }, { text: ' ' }, { text: '2', href: 'https://a2' }, { text: ')' },
      { text: ', ' }, { text: 'B', href: 'https://b' },
    ])
    expect(modelCreditsText(credits)).toBe('Models: A (1 2), B (CC BY 4.0)')
  })

  it('every CC BY work keeps its own link on the page', () => {
    const hrefs = modelCreditParts(MODEL_CREDITS).flatMap((p) => (p.href === undefined ? [] : [p.href]))
    expect(hrefs.sort()).toEqual(MODEL_CREDITS.map((c) => c.url).sort())
  })

  it('reads, after R5, with each author named once: KTKloss for five works, manilov.ap three, helijah two', () => {
    expect(modelCreditsText(MODEL_CREDITS)).toBe('Models: SavinienBerault, helijah (1 2), KTKloss (1 2 3 4 5), manilov.ap (1 2 3), JZHU, everlasting17th, AlanTinka, snrnsrk5, rojatsu, MattyNL (CC BY 4.0)')
  })
})
