import { describe, it, expect } from 'vitest'
import { BINDINGS, type BindingName } from '../../src/input/bindings.js'
import { LEGEND_ROWS, keyLabel, legendLines } from '../../src/render/legend.js'

describe('the control legend (2026-09-15)', () => {
  it('names every binding exactly once, so a new key cannot ship undocumented', () => {
    // This is the whole reason the legend is derived rather than typed out.
    // Mark could not find the throttle-down key on 2026-09-15 and asked for one
    // to be ADDED -- `Z` and `-` had been bound since Plan 1 and simply were
    // not written down anywhere a pilot could see. A hand-maintained list would
    // drift back into that state the first time a binding was added; this case
    // fails instead.
    const listed = LEGEND_ROWS.flatMap((r) => r.bindings)
    const declared = Object.keys(BINDINGS) as BindingName[]

    expect([...listed].sort()).toEqual([...declared].sort())
  })

  it('shows the throttle-down keys, the ones that were invisible', () => {
    const throttle = legendLines().find((l) => l.toLowerCase().includes('throttle'))
    expect(throttle).toBeDefined()
    expect(throttle).toContain('Z')
  })

  it('never shows a bound key as its raw DOM code', () => {
    // The case above only checks the codes someone thought to list, which is
    // exactly how `Slash` shipped reading "Controls  Slash" in the 2026-09-15
    // screenshot: it was added to BINDINGS, had no entry in NAMED, and fell
    // through to `return code`. This sweeps every key actually bound, so the
    // next one added is covered whether or not anyone remembers to list it.
    for (const [name, codes] of Object.entries(BINDINGS)) {
      for (const code of codes) {
        const label = keyLabel(code)
        if (code.length === 1) continue
        expect(label, `${name}: ${code} is shown to the pilot unchanged`).not.toBe(code)
      }
    }
  })

  it('prints key codes the way a keyboard is labelled, not the way the DOM is', () => {
    // `KeyboardEvent.code` is what BINDINGS stores, and printing it raw gives a
    // pilot "Numpad8" and "ShiftLeft" to hunt for on a keycap.
    expect(keyLabel('KeyZ')).toBe('Z')
    expect(keyLabel('ArrowDown')).toBe('Down')
    expect(keyLabel('ShiftLeft')).toBe('Shift')
    expect(keyLabel('Numpad8')).toBe('Num 8')
    expect(keyLabel('Minus')).toBe('-')
    expect(keyLabel('Equal')).toBe('=')
  })
})

it('binds F to the flaps, beside G for the gear', () => {
  // The legend exhaustiveness test above is what forces a row to exist for it;
  // this pins the key itself, and that it is not shared with another control.
  expect(BINDINGS.toggleFlaps).toContain('KeyF')
  expect(BINDINGS.toggleGear).not.toContain('KeyF')
})
