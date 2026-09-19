import { describe, it, expect } from 'vitest'
import { titleModel } from '../../src/render/titleScreen.js'
import { creditsLine } from '../../src/render/legend.js'

describe('the title screen model (2026-09-19)', () => {
  it('names the two options Mark asked for, and a way back from About', () => {
    const m = titleModel()
    expect(m.newGame).toBe('New game')
    expect(m.about).toBe('About project')
    expect(m.close).toBe('Close')
  })

  it('tells the visitor what this is, who owns the data, and where the code lives', () => {
    const m = titleModel()
    const text = m.aboutParagraphs.join(' ')
    expect(text).toContain('Leyte')
    expect(text).toContain('Hellcats Over the Pacific')
    expect(text).toContain('working title')
    // The same credits line the controls panel shows -- one copy, legend.ts.
    expect(m.credits).toBe(creditsLine())
    expect(m.licence).toContain('AGPL-3.0-or-later')
    expect(m.repository).toBe('https://github.com/coder999/ww2airsim')
  })
})
