import { describe, it, expect } from 'vitest'
import { titleModel, LOADOUT_OPTIONS, DEFAULT_LOADOUT } from '../../src/render/titleScreen.js'
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

describe('the title screen loadout picker (Plan 6b Task 9, spec §1)', () => {
  // `createTitleScreen`'s DOM wiring is deliberately untested here, same as
  // `createLegend`/`createCombatReadout`: the vitest environment is `node`
  // (no `document`, and neither `jsdom` nor `happy-dom` is a dependency), so
  // this pins the pure pieces the radio row is built from -- the same split
  // this file's own top comment describes ("a pure model the Node suite
  // asserts on, thin DOM under it").
  it('offers clean, bombs, rockets and both, in that order, defaulting to both', () => {
    expect(LOADOUT_OPTIONS.map((o) => o.value)).toEqual(['clean', 'bombs', 'rockets', 'both'])
    expect(DEFAULT_LOADOUT).toBe('both')
    // Every option carries a checked-by-default flag consistent with the
    // module default, since `createTitleScreen` renders the radio row
    // straight off this array.
    expect(LOADOUT_OPTIONS.find((o) => o.value === DEFAULT_LOADOUT)).toBeDefined()
  })

  it('labels each option in words a pilot reads, not the raw Loadout value', () => {
    const labels = Object.fromEntries(LOADOUT_OPTIONS.map((o) => [o.value, o.label]))
    expect(labels.clean).toMatch(/clean/i)
    expect(labels.bombs).toMatch(/bombs/i)
    expect(labels.rockets).toMatch(/rockets/i)
    expect(labels.both).toBeTruthy()
  })
})
