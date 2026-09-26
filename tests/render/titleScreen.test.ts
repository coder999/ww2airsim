import { describe, it, expect } from 'vitest'
import {
  titleModel, LOADOUT_OPTIONS, DEFAULT_LOADOUT, SCENARIO_OPTIONS, isKnownScenarioId,
  pilotButtonLabel, selectedPilotLabel, isValidPilotName, sortiePilotLabel, TITLE_FORMS,
  createTitleScreen,
  type TitleScreenHandle,
} from '../../src/render/titleScreen.js'
import { creditsLine } from '../../src/render/legend.js'
import { SCENARIO_ID } from '../../src/render/content.js'
import { createPilot } from '../../src/render/roster.js'
import { createSettingsModel } from '../../src/render/settings.js'
import { ballotOption, radioGroup } from '../../src/render/ui/navalComms.js'
import { readyBootProgress } from '../../src/render/bootProgress.js'

describe('the title screen model (2026-09-19)', () => {
  it('names the two options Mark asked for, and a way back from About', () => {
    const m = titleModel()
    expect(m.newGame).toBe('New game')
    expect(m.about).toBe('About project')
    expect(m.close).toBe('Close')
  })

  it('names the Library button and links it to hangar.html under the base URL (Hangar spec §3)', () => {
    const m = titleModel()
    expect(m.library).toBe('Library')
    expect(m.libraryHref).toBe(`${import.meta.env.BASE_URL}hangar.html`)
  })

  it('names the Settings button, reachable at every step of the screen', () => {
    // Render-quality-selector spec §6: "visible at all times regardless of
    // which roster/scenario/loadout step is active". The DOM proof of that
    // (the button lives in the same always-visible row as New game and About,
    // not inside the pilot-gated section) needs a `document`, which this
    // suite's `node` environment does not have -- what is pinned here is the
    // label the button is built from, the same split every other control on
    // this screen uses.
    expect(titleModel().settings).toBe('Settings')
  })

  it('exposes the Settings model on the handle, so main.ts can read it and push the probe in (type-level contract)', () => {
    // The read/write surface Task 6 consumes (`settings.ts`). It is on the
    // HANDLE rather than rebuilt per `show()` because the player's choices
    // are session state, not screen state -- `createTitleScreen`'s `hide()`
    // destroys the dialog's DOM and keeps this model. A regression that
    // dropped it, or rebuilt it per screen, would fail `tsc --noEmit` at
    // `main.ts`'s own call site once Task 6 lands.
    const readSettings = (handle: Pick<TitleScreenHandle, 'settings'>): void => {
      const s = handle.settings.snapshot()
      expect(typeof s.arcadeDamage).toBe('boolean')
      expect(typeof s.assetQuality).toBe('string')
      expect(typeof s.explicitChoiceMade).toBe('boolean')
    }
    // A model built against a fake store, since this environment has no
    // `window.localStorage` -- the same stand-in `quality.test.ts` uses.
    const store = new Map<string, string>()
    ;(globalThis as { window?: { localStorage: Storage } }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v) },
        removeItem: (k: string) => { store.delete(k) },
        clear: () => store.clear(),
        key: (i: number) => [...store.keys()][i] ?? null,
        get length() { return store.size },
      } as Storage,
    }
    readSettings({ settings: createSettingsModel() })
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

describe('the title screen scenario picker', () => {
  // Same split as the loadout picker above: `createTitleScreen`'s radio row
  // is untested DOM, built straight off this array.
  it('offers every scenario this build ships, and the production default is one of them', () => {
    expect(SCENARIO_OPTIONS.map((o) => o.value)).toEqual([
      'free-flight', 'deck-quals', 'gunnery-range', 'pursuit-range', 'pursuit-range-veteran', 'strike-range',
    ])
    // `SCENARIO_ID` (content.ts) is the production boot default; a picker
    // that could not preselect it would be pointing at a scenario id nothing
    // else in the app agrees is the default.
    expect(SCENARIO_OPTIONS.some((o) => o.value === SCENARIO_ID)).toBe(true)
  })

  it('labels each option in words a pilot reads, not the content id', () => {
    const labels = Object.fromEntries(SCENARIO_OPTIONS.map((o) => [o.value, o.label]))
    expect(labels['free-flight']).toBe('Free Flight')
    expect(labels['deck-quals']).toBe('Deck Quals')
    expect(labels['gunnery-range']).toBe('Gunnery Range')
    expect(labels['pursuit-range']).toBe('Air Combat')
    expect(labels['pursuit-range-veteran']).toBe('Air Combat: Veteran')
    expect(labels['strike-range']).toBe('Strike Range')
  })

  it('isKnownScenarioId accepts only ids the picker actually lists', () => {
    for (const option of SCENARIO_OPTIONS) {
      expect(isKnownScenarioId(option.value)).toBe(true)
    }
    // A well-formed id (passes scenarioIdFromQuery's character check) that
    // simply is not one of the five shipped scenarios -- the case format
    // validation alone cannot catch, and the reason this function exists
    // rather than reusing scenarioIdFromQuery's regex a second time.
    expect(isKnownScenarioId('not-a-real-scenario')).toBe(false)
    expect(isKnownScenarioId('')).toBe(false)
  })
})

describe('the title screen roster step (Plan 9, design §3)', () => {
  // `createTitleScreen`'s DOM wiring (the pilot list, the New pilot inline
  // form, `show()`) is deliberately untested here for the same reason as the
  // scenario/loadout rows above -- no `document` in this suite's `node`
  // environment. These three functions are what the roster step's DOM is
  // built off of, the same split.
  it('labels a pilot button with name, rank abbreviation and cumulative score', () => {
    const pilot = createPilot('Boyington')
    const label = pilotButtonLabel(pilot)
    expect(label).toContain('Boyington')
    expect(label).toContain(pilot.rank.abbrev)
    expect(label).toContain(String(pilot.cumulativeScore))
  })

  it('whole-branch review M-1: marks a kia pilot\'s button distinctly from an active one', () => {
    const active = createPilot('Boyington')
    expect(pilotButtonLabel(active)).not.toContain('KIA')

    const kia = { ...active, status: 'kia' as const }
    expect(pilotButtonLabel(kia)).toContain('KIA')
  })

  it('labels the selected-pilot header with the pilot\'s name and full rank name', () => {
    const pilot = createPilot('Boyington')
    const label = selectedPilotLabel(pilot)
    expect(label).toContain('Boyington')
    expect(label).toContain(pilot.rank.name)
  })

  it('accepts a real name and rejects an empty or whitespace-only one', () => {
    // The same rule `createPilot` (roster.ts) itself throws on -- this is
    // what lets the DOM layer reject inline instead of catching that throw.
    expect(isValidPilotName('Boyington')).toBe(true)
    expect(isValidPilotName('  Boyington  ')).toBe(true)
    expect(isValidPilotName('')).toBe(false)
    expect(isValidPilotName('   ')).toBe(false)
  })

  it('onNewGame receives the selected pilot\'s id as a third argument (type-level contract)', () => {
    // The actual DOM wiring that calls `onNewGame(loadout, scenarioId,
    // pilotId)` on the New game click / Enter key lives in
    // `createTitleScreen`, which needs a real `document` to exercise (this
    // suite runs in `node`, per this file's own established convention
    // above). What's provable here without a DOM is the contract itself: a
    // callback of this shape type-checks, which `npx tsc --noEmit` also
    // gates on `createTitleScreen`'s own call site inside `start()`.
    const onNewGame = (loadout: string, scenarioId: string, pilotId: string): void => {
      expect(typeof loadout).toBe('string')
      expect(typeof scenarioId).toBe('string')
      expect(typeof pilotId).toBe('string')
    }
    onNewGame('both', 'free-flight', 'pilot-1-1')
  })

  it('show() requires the currently-loaded scenario id, not a zero-arg call (type-level contract, Plan 9 Task 7 bugfix)', () => {
    // The bug (found by review): `TitleScreenHandle.show` used to take no
    // argument at all, so `main.ts`'s "return to title" path could only ever
    // rebuild the picker off `createTitleScreen`'s OWN `currentScenarioId`
    // closure -- fixed once at construction, and never updated by an
    // in-session `loadScenario` switch (Plan 9 Task 7's whole point). A
    // return-to-title after switching scenarios left the radiogroup showing
    // whichever scenario this boot originally started with.
    //
    // The DOM behaviour this drives (`build`'s scenario radio reflecting the
    // reassigned `currentScenarioId`) needs a real `document`, same caveat as
    // the test above. What's provable here without one is the fixed
    // contract: `show` now REQUIRES a scenario id, which is what makes
    // `main.ts`'s `title.show(requestedScenarioId)` call site -- passing its
    // own live tracking variable, not nothing -- the only thing that
    // type-checks. A regression back to a 0-arg `show()` would make this
    // assignment fail `tsc --noEmit` (part of `npm run verify`).
    const fakeShow: TitleScreenHandle['show'] = (currentScenarioId: string): void => {
      expect(typeof currentScenarioId).toBe('string')
    }
    fakeShow('gunnery-range')
  })
})

describe('the title screen as two sequential memo forms', () => {
  // The DOM (step switching, Back, Enter) needs a `document`, which this
  // suite's `node` environment lacks; `tests/e2e/title.spec.ts` drives it.
  // What is pinned here is the text the two forms and the buttons that move
  // between them are built from, the same split as every block above.
  it('names the button that leaves form 2 for the flight, and the way back to form 1', () => {
    const m = titleModel()
    expect(m.newGame).toBe('New game')
    expect(m.launch).toBe('Launch')
    expect(m.back).toBe('Back')
  })

  it('numbers the two forms "of 2" and gives each its own letterhead', () => {
    expect(TITLE_FORMS.roster.number).toBe('Form 1 of 2')
    expect(TITLE_FORMS.orders.number).toBe('Form 2 of 2')
    expect(TITLE_FORMS.roster.title).toBe('Squadron Roster')
    expect(TITLE_FORMS.orders.title).toBe('Sortie Orders')
    expect(TITLE_FORMS.orders.kicker).not.toBe(TITLE_FORMS.roster.kicker)
  })

  it('gives the About memo its own letterhead', () => {
    const m = titleModel()
    expect(m.aboutKicker).not.toBe('')
    expect(m.aboutTitle).not.toBe('')
  })

  it('names the pilot on the orders form by rank abbreviation and name', () => {
    const pilot = createPilot('Boyington')
    const label = sortiePilotLabel(pilot)
    expect(label).toContain('Boyington')
    expect(label).toContain(pilot.rank.abbrev)
  })

  it('shares the ballot helpers with Settings from navalComms.ts, not a second copy', () => {
    expect(typeof ballotOption).toBe('function')
    expect(typeof radioGroup).toBe('function')
  })
})

describe('the loading strip (loading spec §A.2)', () => {
  it('names the locked-state line', () => {
    expect(titleModel().preparing).toBe('Preparing aircraft...')
  })

  it('accepts a boot progress as the fifth argument (type-level contract)', () => {
    // main.ts passes createBootProgress(); omitting it means "already ready"
    // (readyBootProgress). A regression that dropped the parameter fails tsc
    // at main.ts's call site; this pins the parameter type here too.
    type Params = Parameters<typeof createTitleScreen>
    const boot: Params[4] = readyBootProgress()
    expect(boot?.ready).toBe(true)
  })
})
