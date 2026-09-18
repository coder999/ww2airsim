import { describe, it, expect } from 'vitest'
import { BINDINGS, type BindingName } from '../../src/input/bindings.js'
import { LEGEND_ROWS, OSM_COPYRIGHT_URL, creditsLine, keyLabel, legendLines } from '../../src/render/legend.js'

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
    // The point of this case is that throttle DOWN is legible at all -- it
    // shipped invisible once. The key it names changed on 2026-09-17 (Z became
    // yaw-left, throttle moved to `=` and `-` exclusively), so it asserts the
    // current down key rather than being deleted along with the old one.
    const throttle = legendLines().find((l) => l.toLowerCase().includes('throttle'))
    expect(throttle).toBeDefined()
    expect(throttle).toContain('-')
    expect(throttle).toContain('=')
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

  it('ends with the ODbL credit for the rivers, linked to the OSM copyright page', () => {
    // `content/scenery/rivers.json` is OpenStreetMap data, and the ODbL wants
    // the attribution where a user of the produced work sees it. Codex put it
    // on the play screen as a fixed watermark (daa1b39); Mark did not
    // authorize that, so it lives here, as the panel's last line, and the
    // panel is the only place it is allowed to be -- `dist.test.ts` refuses a
    // `map-credit` element in the shipped `index.html`.
    expect(creditsLine()).toContain('© OpenStreetMap contributors')
    expect(OSM_COPYRIGHT_URL).toBe('https://www.openstreetmap.org/copyright')
  })

  it('credits ESA WorldCover alongside the other data sources', () => {
    // CC BY 4.0 wants attribution in a reasonable manner; the panel's
    // credits line is where every dataset is named. NOTICE.md and
    // ASSETS.md carry the full strings.
    expect(creditsLine()).toContain('ESA WorldCover')
    expect(creditsLine()).toContain('© OpenStreetMap contributors')
  })
})

it('binds F to the flaps, beside G for the gear', () => {
  // The legend exhaustiveness test above is what forces a row to exist for it;
  // this pins the key itself, and that it is not shared with another control.
  expect(BINDINGS.toggleFlaps).toContain('KeyF')
  expect(BINDINGS.toggleGear).not.toContain('KeyF')
})

it('puts yaw on Z and X, and throttle on = and - plus their keypad twins, nothing else', () => {
  // Mark's layout, 2026-09-17: yaw left/right on Z/X, and "throttle up and
  // down move completely to + and - exclusively". Z was throttle-down and had
  // to give it up; Shift was throttle-up and gives it up too. Later the same
  // day he added the keypad's + and - ("where available"): the same two
  // levers from the other side of the keyboard, and still nothing else --
  // Shift in particular stays unbound.
  expect(BINDINGS.yawLeft).toEqual(['KeyZ'])
  expect(BINDINGS.yawRight).toEqual(['KeyX'])
  expect(BINDINGS.throttleUp).toEqual(['Equal', 'NumpadAdd'])
  expect(BINDINGS.throttleDown).toEqual(['Minus', 'NumpadSubtract'])
  // Nothing else may claim a throttle or yaw key: a key that does two things
  // is the conflict this layout change existed to remove.
  const others = Object.entries(BINDINGS).filter(
    ([name]) => !['yawLeft', 'yawRight', 'throttleUp', 'throttleDown'].includes(name),
  )
  for (const [name, codes] of others) {
    for (const code of codes as readonly string[]) {
      expect(['KeyZ', 'KeyX', 'Equal', 'Minus'], `${name} claims ${code}`).not.toContain(code)
    }
  }
})
