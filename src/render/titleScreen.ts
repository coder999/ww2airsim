import { creditsLine } from './legend.js'
import { TITLE_ART_URL } from './content.js'
import type { Loadout } from '../sim/weapons/stores.js'
import { createPilot, loadRoster, saveRoster, startSortie, type PilotRecord } from './roster.js'

/**
 * The title screen (design: docs/superpowers/specs/2026-09-19-title-screen-design.md;
 * the roster step below: docs/superpowers/specs/2026-09-23-meta-game-design.md §3).
 * Split like `debrief.ts`: a pure model the Node suite asserts on, thin DOM
 * under it. Created FIRST in `boot()`, so the art is up while the renderer,
 * the ocean and the terrain load behind it; `main.ts` holds the world while
 * `up()` is true, exactly as it does for the open navigation chart.
 *
 * `show()` rebuilds the overlay from scratch rather than trying to reuse DOM
 * nodes an earlier `hide()` already removed -- simpler and safer -- and
 * re-reads `loadRoster()` on every call, so a score just banked by the
 * debrief that preceded it is on screen the moment the title comes back.
 */
export type TitleModel = {
  readonly newGame: string
  readonly about: string
  readonly close: string
  readonly aboutParagraphs: readonly string[]
  readonly credits: string
  readonly licence: string
  readonly repository: string
}

export function titleModel(): TitleModel {
  return {
    newGame: 'New game',
    about: 'About project',
    close: 'Close',
    aboutParagraphs: [
      'A WWII Pacific air combat simulator that runs in the browser. Fly an F6F ' +
        'Hellcat from carrier and land bases over a geographically real Leyte Gulf.',
      'Inspired by Hellcats Over the Pacific (Graphic Simulations, 1991) and its ' +
        'Missions at Leyte Gulf expansion. Clean-room: no original code, assets or ' +
        'mission text. WW2 AIRSIM is a working title.',
      'A technical playground: real terrain from the Copernicus DEM, a GEBCO sea ' +
        'floor, ESA WorldCover land cover, an FFT ocean and a deterministic flight ' +
        'model, all rendered with WebGPU.',
    ],
    credits: creditsLine(),
    licence: 'Source code: AGPL-3.0-or-later.',
    repository: 'https://github.com/coder999/ww2airsim',
  }
}

/**
 * The loadout picker's options (spec §1: "clean, bombs, rockets, both
 * (default both)"), a pure array so the Node suite can pin it the same way
 * `titleModel` pins the button text -- `createTitleScreen`'s radio row is
 * built straight off this and is otherwise untested here, for the reason
 * `createLegend`'s own comment gives: the vitest environment is `node`.
 */
export const LOADOUT_OPTIONS: readonly { readonly value: Loadout; readonly label: string }[] = [
  { value: 'clean', label: 'Clean' },
  { value: 'bombs', label: 'Bombs' },
  { value: 'rockets', label: 'Rockets' },
  { value: 'both', label: 'Both' },
]
export const DEFAULT_LOADOUT: Loadout = 'both'

/**
 * The scenario picker's options: every `content/scenarios/<id>.json` this
 * build ships, in the order shown. Player-facing labels, not the raw content
 * ids -- `pursuit-range` reads "Air Combat" here, matching how Mark actually
 * refers to it, not the file stem.
 *
 * This is what `?scenario=` (spawn.ts's `SCENARIO_PARAM`) was always meant
 * to be replaced by (that file's own doc comment named this exact picker).
 * `?scenario=<id>` still selects which scenario a fresh page load boots
 * into, but picking a DIFFERENT one from this picker no longer navigates
 * there (Plan 9 Task 7): `main.ts`'s `onNewGame` calls `loadScenario` to
 * swap the entity list (aircraft, ships) in place instead, disposing
 * whatever was loaded and rebuilding to the new scenario's counts -- see
 * that function's own doc comment for the reasoning and what stays put
 * (terrain, ocean, sky, the panel). `isKnownScenarioId` below is what makes
 * accepting `?scenario=` in a PRODUCTION build safe either way: unlike
 * `scenarioIdFromQuery`'s format check alone, it rejects any well-formed id
 * that is not actually one of these five.
 */
export const SCENARIO_OPTIONS: readonly { readonly value: string; readonly label: string }[] = [
  { value: 'free-flight', label: 'Free Flight' },
  { value: 'deck-quals', label: 'Deck Quals' },
  { value: 'gunnery-range', label: 'Gunnery Range' },
  { value: 'pursuit-range', label: 'Air Combat' },
  { value: 'strike-range', label: 'Strike Range' },
]

/** Whether `id` is one of `SCENARIO_OPTIONS` -- the whitelist that makes
 *  `?scenario=` safe to honor in production (main.ts), not just DEV. */
export function isKnownScenarioId(id: string): boolean {
  return SCENARIO_OPTIONS.some((option) => option.value === id)
}

/**
 * The text on each pilot's entry in the roster list (design §3: "a list...
 * plus a 'New pilot' entry"), so the Node suite can pin what a pilot button
 * says without a DOM -- same split as `LOADOUT_OPTIONS`/`SCENARIO_OPTIONS`
 * above, whose `label` this mirrors.
 */
export function pilotButtonLabel(pilot: PilotRecord): string {
  return `${pilot.name} — ${pilot.rank.abbrev} — ${pilot.cumulativeScore}`
}

/**
 * The header shown once a pilot is selected, above the scenario/loadout
 * pickers it reveals (design §3: "now labeled with that pilot's name and
 * rank").
 */
export function selectedPilotLabel(pilot: PilotRecord): string {
  return `Flying as ${pilot.name} (${pilot.rank.name})`
}

/**
 * Whether `name` is acceptable to pass to `createPilot` (roster.ts) -- the
 * same non-empty-after-trim rule `createPilot` itself enforces, duplicated
 * here so the DOM layer can reject an empty/whitespace name inline rather
 * than calling `createPilot` and letting its throw reach the DOM uncaught.
 */
export function isValidPilotName(name: string): boolean {
  return name.trim().length > 0
}

export type TitleScreenHandle = {
  /** Whether the title is still on screen; `main.ts` holds the world while it is. */
  readonly up: () => boolean
  hide(): void
  /** Rebuilds the overlay fresh and re-reads `loadRoster()`; see the file's
   *  own top comment for why. `main.ts` calls this when a flight ends and
   *  the player is sent back to the title rather than straight to a new one. */
  show(): void
}

const BUTTON_STYLE =
  'padding:10px 22px;border:1px solid #2b3440;border-radius:4px;background:rgba(236,239,243,.94);' +
  'color:#151b22;font:14px ui-monospace,Menlo,monospace;letter-spacing:.08em;cursor:pointer'

const ROSTER_ROW_STYLE =
  'display:block;width:100%;text-align:left;padding:8px 12px;border:1px solid #2b3440;border-radius:4px;' +
  'font:13px ui-monospace,Menlo,monospace;letter-spacing:.02em;cursor:pointer'
const ROSTER_BUTTON_STYLE = `${ROSTER_ROW_STYLE}background:rgba(236,239,243,.08);color:#eceff3`
const ROSTER_BUTTON_SELECTED_STYLE = `${ROSTER_ROW_STYLE}background:rgba(236,239,243,.94);color:#151b22`

export function createTitleScreen(
  root: HTMLElement,
  /** Whichever scenario `main.ts` already resolved this boot with (`?scenario=`
   *  or the production default) -- what the picker preselects, so a picker
   *  shown after a scenario-changing reload reflects what actually loaded
   *  rather than silently reverting to the production default. */
  currentScenarioId: string,
  onNewGame: (loadout: Loadout, scenarioId: string, pilotId: string) => void,
): TitleScreenHandle {
  const m = titleModel()

  let isUp = false
  let onKey: ((e: KeyboardEvent) => void) | null = null

  const hide = (): void => {
    if (!isUp) return
    isUp = false
    root.querySelector('[data-ww2-title]')?.remove()
    if (onKey) window.removeEventListener('keydown', onKey)
    onKey = null
  }

  // Rebuilds the whole overlay from nothing -- both the initial build below
  // and `show()` (TitleScreenHandle) run this same path, so there is exactly
  // one place the DOM gets constructed rather than an initial build and a
  // second, easily-diverging copy for the return trip.
  const build = (): void => {
    hide()
    const overlay = document.createElement('div')
    overlay.dataset.ww2Title = ''
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-label', 'Title')
    overlay.style.cssText =
      'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;' +
      `background:#0b0d10 url(${TITLE_ART_URL}) center/cover no-repeat;z-index:20`

    // The roster step (design §3): every pilot `loadRoster()` returns, plus a
    // "New pilot" entry -- read fresh on every `build()` call so a score just
    // banked by the debrief that preceded this `show()` is what the pilot's
    // button actually says. Native `<button>` per entry, same reason the
    // scenario/loadout rows below lean on native controls rather than a
    // click handler on a styled `<div>`: free keyboard support, and it is
    // this file's own convention (the mission chart's `role="button"`
    // marker exists only because SVG has no `<button>`; here we do).
    const pilots: PilotRecord[] = [...loadRoster()]
    let selectedPilotId: string | null = null
    const pilotButtons = new Map<string, HTMLButtonElement>()

    const rosterSection = document.createElement('div')
    rosterSection.style.cssText =
      'display:flex;flex-direction:column;gap:6px;width:280px;margin-bottom:1.5vh'
    const rosterLabel = document.createElement('div')
    rosterLabel.textContent = 'Pilot'
    rosterLabel.style.cssText =
      'color:#eceff3;font:13px ui-monospace,Menlo,monospace;letter-spacing:.04em;margin-bottom:2px'
    const rosterList = document.createElement('div')
    rosterList.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:22vh;overflow-y:auto'
    rosterSection.append(rosterLabel, rosterList)

    const flyingAs = document.createElement('div')
    flyingAs.style.cssText =
      'min-height:1.4em;color:#eceff3;font:13px ui-monospace,Menlo,monospace;letter-spacing:.04em;' +
      'margin-bottom:1vh'
    rosterSection.appendChild(flyingAs)
    overlay.appendChild(rosterSection)

    // The scenario picker: same native-radio pattern as the loadout picker
    // below and for the same reason (free keyboard group navigation). Picking
    // one and pressing New game navigates to `?scenario=<id>` (main.ts's
    // `onNewGame`) rather than changing anything in this file -- this row
    // only reports which value was checked. Hidden until a pilot is picked
    // (design §3: "selecting a pilot reveals today's scenario/loadout
    // pickers underneath").
    const scenarioRow = document.createElement('div')
    scenarioRow.setAttribute('role', 'radiogroup')
    scenarioRow.setAttribute('aria-label', 'Scenario')
    scenarioRow.style.cssText =
      'display:none;gap:16px;margin-bottom:2vh;color:#eceff3;font:13px ui-monospace,Menlo,monospace;' +
      'letter-spacing:.04em'
    const scenarioInputs = SCENARIO_OPTIONS.map((option) => {
      const label = document.createElement('label')
      label.style.cssText = 'display:flex;align-items:center;gap:5px;cursor:pointer'
      const input = document.createElement('input')
      input.type = 'radio'
      input.name = 'scenario'
      input.value = option.value
      input.checked = option.value === currentScenarioId
      label.append(input, option.label)
      scenarioRow.appendChild(label)
      return input
    })
    overlay.appendChild(scenarioRow)

    // The loadout picker (spec §1), above the New game button: native radio
    // inputs, so Tab/Shift-Tab and the arrow keys within the group work with
    // no listener of this file's own -- the same reason the rest of the
    // title screen leans on native `<button>` elements rather than a click
    // handler on a styled `<div>`. Hidden until a pilot is picked, same as
    // `scenarioRow` above.
    const loadoutRow = document.createElement('div')
    loadoutRow.setAttribute('role', 'radiogroup')
    loadoutRow.setAttribute('aria-label', 'Loadout')
    loadoutRow.style.cssText =
      'display:none;gap:16px;margin-bottom:2vh;color:#eceff3;font:13px ui-monospace,Menlo,monospace;' +
      'letter-spacing:.04em'
    const loadoutInputs = LOADOUT_OPTIONS.map((option) => {
      const label = document.createElement('label')
      label.style.cssText = 'display:flex;align-items:center;gap:5px;cursor:pointer'
      const input = document.createElement('input')
      input.type = 'radio'
      input.name = 'loadout'
      input.value = option.value
      input.checked = option.value === DEFAULT_LOADOUT
      label.append(input, option.label)
      loadoutRow.appendChild(label)
      return input
    })
    overlay.appendChild(loadoutRow)

    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:14px;margin-bottom:6vh'
    const newGame = document.createElement('button')
    newGame.textContent = m.newGame
    newGame.style.cssText = BUTTON_STYLE
    // Disabled until a pilot is selected -- `start()` also guards on
    // `selectedPilotId` so Enter (via `onKey`) can't bypass this.
    newGame.disabled = true
    newGame.style.opacity = '.45'
    const about = document.createElement('button')
    about.textContent = m.about
    about.style.cssText = BUTTON_STYLE
    row.append(newGame, about)
    overlay.appendChild(row)

    // The About panel lives inside the overlay so it can never outlive it.
    const aboutPanel = document.createElement('div')
    aboutPanel.setAttribute('role', 'dialog')
    aboutPanel.setAttribute('aria-label', 'About')
    aboutPanel.style.cssText =
      'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none;max-width:560px;' +
      'padding:18px 22px;border:1px solid #2b3440;border-radius:6px;background:#eceff3;color:#151b22;' +
      'font:13px/1.55 ui-monospace,Menlo,monospace;box-shadow:0 12px 40px rgba(0,0,0,.55)'
    for (const text of m.aboutParagraphs) {
      const p = document.createElement('p')
      p.style.cssText = 'margin:0 0 10px'
      p.textContent = text
      aboutPanel.appendChild(p)
    }
    const credits = document.createElement('p')
    credits.style.cssText = 'margin:0 0 4px;color:#55606b;font-size:12px'
    credits.textContent = m.credits
    const licence = document.createElement('p')
    licence.style.cssText = 'margin:0 0 12px;color:#55606b;font-size:12px'
    const repo = document.createElement('a')
    repo.href = m.repository
    repo.target = '_blank'
    repo.rel = 'noopener'
    repo.textContent = m.repository
    repo.style.color = 'inherit'
    licence.append(`${m.licence} `, repo)
    const close = document.createElement('button')
    close.textContent = m.close
    close.style.cssText = BUTTON_STYLE
    aboutPanel.append(credits, licence, close)
    overlay.appendChild(aboutPanel)
    root.appendChild(overlay)

    const selectPilot = (pilot: PilotRecord): void => {
      selectedPilotId = pilot.id
      for (const [id, button] of pilotButtons) {
        const selected = id === pilot.id
        button.style.cssText = selected ? ROSTER_BUTTON_SELECTED_STYLE : ROSTER_BUTTON_STYLE
        button.setAttribute('aria-pressed', String(selected))
      }
      flyingAs.textContent = selectedPilotLabel(pilot)
      scenarioRow.style.display = 'flex'
      loadoutRow.style.display = 'flex'
      newGame.disabled = false
      newGame.style.opacity = '1'
    }

    const makePilotButton = (pilot: PilotRecord): HTMLButtonElement => {
      const button = document.createElement('button')
      button.textContent = pilotButtonLabel(pilot)
      button.style.cssText = ROSTER_BUTTON_STYLE
      button.setAttribute('aria-pressed', 'false')
      button.addEventListener('click', () => selectPilot(pilot))
      pilotButtons.set(pilot.id, button)
      return button
    }

    const newPilotButton = document.createElement('button')
    newPilotButton.textContent = 'New pilot'
    newPilotButton.style.cssText = ROSTER_BUTTON_STYLE

    const newPilotForm = document.createElement('div')
    newPilotForm.style.cssText = 'display:none;gap:6px'
    const newPilotInput = document.createElement('input')
    newPilotInput.type = 'text'
    newPilotInput.placeholder = 'Pilot name'
    newPilotInput.style.cssText =
      'flex:1;min-width:0;padding:6px 8px;border:1px solid #2b3440;border-radius:4px;background:#eceff3;' +
      'color:#151b22;font:13px ui-monospace,Menlo,monospace'
    const newPilotConfirm = document.createElement('button')
    newPilotConfirm.textContent = 'Add'
    newPilotConfirm.style.cssText = BUTTON_STYLE
    newPilotForm.append(newPilotInput, newPilotConfirm)
    const newPilotError = document.createElement('p')
    newPilotError.setAttribute('aria-live', 'polite')
    newPilotError.style.cssText = 'display:none;margin:2px 0 0;color:#e2856b;font:12px ui-monospace,Menlo,monospace'

    for (const pilot of pilots) rosterList.appendChild(makePilotButton(pilot))
    rosterList.append(newPilotButton, newPilotForm, newPilotError)

    const openNewPilotForm = (): void => {
      newPilotButton.style.display = 'none'
      newPilotForm.style.display = 'flex'
      newPilotError.style.display = 'none'
      newPilotInput.value = ''
      newPilotInput.focus()
    }
    const closeNewPilotForm = (): void => {
      newPilotForm.style.display = 'none'
      newPilotButton.style.display = 'block'
      newPilotError.style.display = 'none'
    }
    // Rejects an empty/whitespace name here, inline -- `createPilot` (roster.ts)
    // throws on one by design, and letting that throw reach this click/keydown
    // handler uncaught is not this layer's job to recover from.
    const confirmNewPilot = (): void => {
      if (!isValidPilotName(newPilotInput.value)) {
        newPilotError.textContent = 'Enter a pilot name.'
        newPilotError.style.display = 'block'
        newPilotInput.focus()
        return
      }
      const pilot = createPilot(newPilotInput.value)
      pilots.push(pilot)
      saveRoster(pilots)
      rosterList.insertBefore(makePilotButton(pilot), newPilotButton)
      closeNewPilotForm()
      selectPilot(pilot)
    }
    newPilotButton.addEventListener('click', openNewPilotForm)
    newPilotConfirm.addEventListener('click', confirmNewPilot)
    newPilotInput.addEventListener('keydown', (e) => {
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return
      e.preventDefault()
      // Stops the keydown from bubbling to `window`'s `onKey` at all, rather
      // than relying on `onKey`'s own newPilotForm-open guard: the bubble
      // phase runs strictly AFTER this listener finishes, and
      // `confirmNewPilot` below can close the form and select a pilot
      // (enabling `newGame`) before that later phase runs -- so by the time
      // `onKey` would check `newPilotForm.style.display`, the form is
      // already hidden again and the guard no longer fires, letting Enter
      // fall through to `start()` and launch a flight unreviewed. Cutting
      // propagation here removes the ordering dependency entirely.
      e.stopPropagation()
      confirmNewPilot()
    })

    const start = (): void => {
      // Guards the disabled `newGame` button the same way for Enter (`onKey`
      // below): no pilot selected, no flight -- `pilotId` has nothing to be.
      if (selectedPilotId === null) return
      const pilotIndex = pilots.findIndex((p) => p.id === selectedPilotId)
      if (pilotIndex === -1) return // unreachable: selectedPilotId only ever comes from `pilots`
      // One of `loadoutInputs` is always checked -- `DEFAULT_LOADOUT` sets one
      // at creation and a native radio group never lets the user uncheck the
      // whole group, only move the checked mark between its members -- so the
      // fallback below is unreachable in a browser and exists only so this
      // reads as total rather than trusting that invariant silently.
      const loadout = loadoutInputs.find((input) => input.checked)?.value as Loadout | undefined
      // Same unreachable-in-a-browser fallback as `loadout` above, for the same
      // reason: a native radio group always has exactly one checked member.
      const scenarioId = scenarioInputs.find((input) => input.checked)?.value ?? currentScenarioId
      const pilotId = selectedPilotId
      // The resurrection (design §2): flipping a `kia` pilot back to `active`
      // and counting the resurrection happens exactly here, the moment New
      // game is pressed with that pilot selected -- not on selection, which
      // would count a pilot merely looked at.
      pilots[pilotIndex] = startSortie(pilots[pilotIndex]!)
      saveRoster(pilots)
      hide()
      onNewGame(loadout ?? DEFAULT_LOADOUT, scenarioId, pilotId)
    }
    newGame.addEventListener('click', start)
    about.addEventListener('click', () => {
      aboutPanel.style.display = 'block'
      close.focus()
    })
    close.addEventListener('click', () => {
      aboutPanel.style.display = 'none'
      about.focus()
    })

    onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return
      if (aboutPanel.style.display !== 'none') return
      if (newPilotForm.style.display !== 'none') return
      e.preventDefault()
      start()
    }
    window.addEventListener('keydown', onKey)
    isUp = true
    newPilotButton.focus()
  }

  build()

  return { up: () => isUp, hide, show: build }
}
