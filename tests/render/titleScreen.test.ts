import { describe, it, expect, expectTypeOf } from 'vitest'
import type { SortieChoice } from '../../src/sim/sortie.js'
import {
  titleModel, LOADOUT_OPTIONS, DEFAULT_LOADOUT, SCENARIO_OPTIONS, isKnownScenarioId,
  TITLE_FORMS, createTitleScreen,
  type CampaignSortie, type TitleScreenHandle,
} from '../../src/render/titleScreen.js'
import { creditsLine } from '../../src/render/legend.js'
import { SCENARIO_ID } from '../../src/render/content.js'
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

  it('names the Hangar button and links it to hangar.html under the base URL (Hangar spec §3)', () => {
    const m = titleModel()
    expect(m.hangar).toBe('Hangar')
    expect(m.hangarHref).toBe(`${import.meta.env.BASE_URL}hangar.html`)
  })

  it('names the Sounds button and links it to sounds.html under the base URL (2026-10-09)', () => {
    const m = titleModel()
    expect(m.sounds).toBe('Sounds')
    expect(m.soundsHref).toBe(`${import.meta.env.BASE_URL}sounds.html`)
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
    // The same catalog the About memo renders as links -- one copy, legend.ts.
    expect(m.credits).toBe(creditsLine())
    expect(m.licence).toContain('AGPL-3.0-or-later')
    expect(m.repository).toBe('https://github.com/coder999/ww2airsim')
    expect(text).toContain('Mark Tuttle')
    expect(text).toContain('Copyright (C) 2026')
    expect(m.website).toBe('https://marktuttle.dev')
  })
})

describe('the title screen loadout picker (Plan 6b Task 9, spec §1)', () => {
  // `createTitleScreen`'s DOM wiring is deliberately untested here, same as
  // `createCombatReadout`: the vitest environment is `node`
  // (no `document`, and neither `jsdom` nor `happy-dom` is a dependency), so
  // this pins the pure pieces the radio row is built from -- the same split
  // this file's own top comment describes ("a pure model the Node suite
  // asserts on, thin DOM under it").
  it('offers clean, bombs, rockets and both, in that order, defaulting to both', () => {
    expect(LOADOUT_OPTIONS.map((o) => o.value)).toEqual(['clean', 'bombs', 'torpedoes', 'rockets', 'both'])
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
      'free-flight', 'deck-quals', 'water-quals', 'gunnery-range', 'pursuit-range', 'pursuit-range-veteran', 'strike-range', 'furball-range',
      'recovery-range', 'takeoff-range', 'friendly-fire-range', 'damage-range', 'bomber-range', 'friendly-fire-field', 'range-test', 'night-range', 'night-field', 'night-bay', 'aa-range', 'gunnery-duel', 'attack-range', 'tutorial', 'torpedo-qualification', 'deck-quals-mission', 'airfield-strike', 'convoy-strike', 'tank-buster', 'combat-air-patrol', 'scramble', 'single-combat',
      'flattop-hunt', 'escort', 'surigao-strait', 'field-patrol', 'dev-mission-ui', 'dev-mission-circuit',
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
    expect(labels['water-quals']).toBe('Catalina Water Qualification')
    expect(labels['gunnery-range']).toBe('Gunnery Range')
    expect(labels['pursuit-range']).toBe('Air Combat')
    expect(labels['pursuit-range-veteran']).toBe('Air Combat: Veteran')
    expect(labels['strike-range']).toBe('Strike Range')
    expect(labels['furball-range']).toBe('Furball (dev)')
    expect(labels['friendly-fire-range']).toBe('Friendly Fire (dev)')
    expect(labels['friendly-fire-field']).toBe('Friendly Fire: Field (dev)')
    expect(labels['deck-quals-mission']).toBe('Carrier Qualification')
    expect(labels['airfield-strike']).toBe('Airfield Strike')
    expect(labels['convoy-strike']).toBe('Convoy Strike')
    expect(labels['tank-buster']).toBe('Tank Buster')
    expect(labels['combat-air-patrol']).toBe('Combat Air Patrol')
    expect(labels.tutorial).toBe('Basic Flying')
    expect(labels['torpedo-qualification']).toBe('Torpedo Qualification')
    expect(labels.scramble).toBe('Scramble')
    expect(labels['single-combat']).toBe('Single Combat')
    expect(labels['flattop-hunt']).toBe('Flattop Hunt')
    expect(labels.escort).toBe('Escort')
    expect(labels['surigao-strait']).toBe('Surigao Strait')
    expect(labels['field-patrol']).toBe('Field Patrol')
  })

  it('no other label contains "Deck Quals": e2e selectors match by substring (M3-R5)', () => {
    expect(SCENARIO_OPTIONS.filter((o) => o.label.includes('Deck Quals')).map((o) => o.value)).toEqual(['deck-quals'])
  })

  it('without Dev, exactly the B4, M3, M4, F2 and F5A (Field Patrol) missions, the tutorial first, each with its badge; every other row is a range (M2 R5, A1)', () => {
    expect(SCENARIO_OPTIONS.filter((o) => o.kind === 'mission' && !o.dev).map((o) => [o.value, o.badge]))
      .toEqual([
        ['water-quals', { id: 'water-qualified', name: 'Catalina Water Qualified' }],
        ['tutorial', { id: 'basic-flying', name: 'Basic Flying' }],
        ['torpedo-qualification', { id: 'torpedo-qualified', name: 'Torpedo Qualified' }],
        ['deck-quals-mission', { id: 'carrier-qualified', name: 'Carrier Qualified' }],
        ['airfield-strike', { id: 'airfield-strike', name: 'Airfield Strike' }],
        ['convoy-strike', { id: 'convoy-strike', name: 'Convoy Strike' }],
        ['tank-buster', { id: 'tank-buster', name: 'Tank Buster' }],
        ['combat-air-patrol', { id: 'combat-air-patrol', name: 'Combat Air Patrol' }],
        ['scramble', { id: 'scramble', name: 'Scramble' }],
        ['single-combat', { id: 'single-combat', name: 'Single Combat' }],
        ['flattop-hunt', { id: 'flattop-hunt', name: 'Flattop Hunt' }],
        ['escort', { id: 'escort', name: 'Escort' }],
        ['surigao-strait', { id: 'surigao-strait', name: 'Surigao Strait' }],
        ['field-patrol', { id: 'field-patrol', name: 'Field Patrol' }],
      ])
    expect(SCENARIO_OPTIONS.filter((o) => o.kind === 'range').some((o) => o.badge !== undefined)).toBe(false)
  })

  it('isKnownScenarioId accepts only ids the picker actually lists', () => {
    for (const option of SCENARIO_OPTIONS) {
      expect(isKnownScenarioId(option.value)).toBe(true)
    }
    // A well-formed id (passes scenarioIdFromQuery's character check) that
    // simply is not one of the scenarios the picker lists -- the case format
    // validation alone cannot catch, and the reason this function exists
    // rather than reusing scenarioIdFromQuery's regex a second time.
    expect(isKnownScenarioId('not-a-real-scenario')).toBe(false)
    expect(isKnownScenarioId('')).toBe(false)
  })
})

describe('the title screen hosts the launch memos for a Headquarters sortie (plan F5B)', () => {
  // `createTitleScreen`'s DOM needs a `document`, which this suite's `node` environment lacks;
  // `tests/e2e/hqLaunch.spec.ts` drives it. What is pinned here is the contract between the headquarters and the title.
  it('onNewGame receives one SortieChoice: the pilot is the campaign\'s, not the title\'s (type-level contract)', () => {
    expectTypeOf<Parameters<typeof createTitleScreen>[2]>().toEqualTypeOf<(choice: SortieChoice) => void>()
  })

  it('a sortie begun from Headquarters carries its pilot label, gate, takeoff lock, launch and Back (type-level contract)', () => {
    expectTypeOf<CampaignSortie['aircraftGate']>().toEqualTypeOf<(specId: string) => { readonly ok: true } | { readonly ok: false; readonly text: string }>()
    expectTypeOf<CampaignSortie['lockedHour']>().toEqualTypeOf<number | null>()
    expectTypeOf<CampaignSortie['onLaunch']>().toEqualTypeOf<(choice: SortieChoice) => string | null>()
    expectTypeOf<TitleScreenHandle['beginSortie']>().toEqualTypeOf<(req: CampaignSortie) => void>()
  })

  it('show() requires the currently-loaded scenario id, not a zero-arg call (type-level contract, Plan 9 Task 7 bugfix)', () => {
    // `main.ts`'s `title.show(requestedScenarioId)` passes its own live tracking variable; a regression to a 0-arg
    // `show()` fails `tsc --noEmit` (part of `npm run verify`).
    const fakeShow: TitleScreenHandle['show'] = (currentScenarioId: string): void => {
      expect(typeof currentScenarioId).toBe('string')
    }
    fakeShow('gunnery-range')
  })
})

describe('the launch memos (sortie spec; plan F5B keeps Forms 4 to 6)', () => {
  // The DOM (step switching, Back, Enter) needs a `document`, which this
  // suite's `node` environment lacks; `tests/e2e/title.spec.ts` drives it.
  // What is pinned here is the text the two forms and the buttons that move
  // between them are built from, the same split as every block above.
  it('names the buttons that move between the forms, the one that launches, and the Dev checkbox', () => {
    const m = titleModel()
    expect(m.newGame).toBe('New game')
    expect(m.next).toBe('Next')
    expect(m.launch).toBe('Launch')
    expect(m.back).toBe('Back')
    expect(m.dev).toBe('Dev — unlocks everything')
  })

  it('keeps the three launch memos, numbered as their original forms, each with its own letterhead', () => {
    // Headquarters' picker replaced Squadron Roster, Flight Type and Sortie Orders (plan F5B, Mark's ruling Q3); a
    // headquarters sortie re-numbers these Step 3 to 5 of 5 (`CAMPAIGN_STEP` in titleScreen.ts).
    expect(Object.keys(TITLE_FORMS)).toEqual(['conditions', 'aircraft', 'ordnance'])
    expect(Object.values(TITLE_FORMS).map((f) => f.number)).toEqual(['Form 4 of 6', 'Form 5 of 6', 'Form 6 of 6'])
    expect(Object.values(TITLE_FORMS).map((f) => f.title)).toEqual(['Flight Conditions', 'Aircraft Assignment', 'Ordnance Requisition'])
  })

  it('gives the About memo its own letterhead', () => {
    const m = titleModel()
    expect(m.aboutKicker).not.toBe('')
    expect(m.aboutTitle).not.toBe('')
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
