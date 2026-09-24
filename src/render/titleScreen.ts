import { ensureStampFilter } from './ui/navalComms.js'
import { creditsLine } from './legend.js'
import { TITLE_ART_URL } from './content.js'
import type { Loadout } from '../sim/weapons/stores.js'
import { createPilot, loadRoster, saveRoster, startSortie, type PilotRecord } from './roster.js'
import { createSettingsDialog, createSettingsModel, type SettingsDialogHandle, type SettingsModel } from './settings.js'

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
  readonly settings: string
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
    settings: 'Settings',
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
  // Whole-branch review M-1: a `kia` pilot was visually identical to an
  // `active` one in this list -- nothing distinguished a dead pilot a New
  // Game would resurrect (design §2) from one still flying. Appended, not a
  // separate figure, matching this label's existing terse "name — rank —
  // score" shape.
  const status = pilot.status === 'kia' ? ' — KIA' : ''
  return `${pilot.name} — ${pilot.rank.abbrev} — ${pilot.cumulativeScore}${status}`
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
  /**
   * The Settings dialog's model (`settings.ts`) -- the read/write surface
   * `main.ts` needs and the one thing here that OUTLIVES `hide()`/`show()`,
   * since the dialog's DOM is rebuilt with the rest of the overlay but the
   * player's choices are session state, not screen state.
   *
   * `main.ts` (Task 6) reads `snapshot()` at boot for the tiers, the asset
   * tier and `arcadeDamage`, pushes the GPU probe's result back in with
   * `setRecommendedTier`/`setCurrentQuality`, and checks `explicitChoiceMade`
   * before letting that probe overwrite anything. It gets the live change
   * callbacks from `src/render/bootQuality.ts`'s `createBootQuality()`, which
   * owns the one model of the page and the `SettingsCallbacks` that apply a
   * pick live, and hands it here as `createTitleScreen`'s fourth argument.
   * The default model built below still persists every pick; it just has
   * nobody listening to apply it until the next page load.
   */
  readonly settings: SettingsModel
  hide(): void
  /** Rebuilds the overlay fresh and re-reads `loadRoster()`; see the file's
   *  own top comment for why. `main.ts` calls this when a flight ends and
   *  the player is sent back to the title rather than straight to a new one.
   *
   *  `currentScenarioId` is what the scenario radiogroup preselects (Plan 9
   *  Task 7 bugfix). It is a PARAMETER here, not the constructor's own
   *  `currentScenarioId` closed over once, because `main.ts`'s
   *  `loadScenario` can swap scenarios in place after this title screen was
   *  first built -- a return-to-title flight following an in-session switch
   *  must show what is ACTUALLY loaded right now, which only `main.ts` still
   *  knows by the time `show()` is called; the constructor's own value is
   *  stale the instant a switch happens. `main.ts` passes its own live
   *  tracking variable (`requestedScenarioId`) on every call. */
  show(currentScenarioId: string): void
}

const BUTTON_STYLE =
  'padding:10px 22px;border:1px solid #2b3440;border-radius:4px;background:rgba(236,239,243,.94);' +
  'color:#151b22;font:14px ui-monospace,Menlo,monospace;letter-spacing:.08em;cursor:pointer'

// The roster step's own tokens (Task 7 restyle, naval-comms spec §3) --
// design-system colors/fonts via the `var(--...)` custom properties
// `naval-comms.css` declares on `:root` (available anywhere in the document,
// not just under `.naval-comms`), not the `#eceff3`-on-dark palette the rest
// of this screen (title art overlay, About panel) still uses.
const FLYING_AS_STYLE =
  'margin:14px 0 4px;min-height:1.4em;color:var(--ink-faint);font:12px var(--font-body);letter-spacing:.04em'
const NEW_PILOT_ERROR_STYLE =
  'display:none;margin:8px 0 0;color:var(--stamp-red);font:12px var(--font-body);letter-spacing:.02em'
// A native `<button>` reset to read as plain table-cell text while staying a
// real, clickable, keyboard-reachable control -- same "native control, not a
// styled div" convention the rest of this file follows (see the roster
// section's own comment below).
const ROW_SELECT_BUTTON_STYLE =
  'all:unset;display:block;width:100%;cursor:pointer;font:inherit;color:inherit;padding:2px 0'

export function createTitleScreen(
  root: HTMLElement,
  /** Whichever scenario `main.ts` already resolved this boot with (`?scenario=`
   *  or the production default) -- what the FIRST build of the picker
   *  preselects. Reassigned by `show()` below on every later call (Plan 9
   *  Task 7 bugfix), since an in-session scenario switch can leave this
   *  initial value stale before a return-to-title ever shows the picker
   *  again -- see `TitleScreenHandle.show`'s own doc comment. */
  currentScenarioId: string,
  onNewGame: (loadout: Loadout, scenarioId: string, pilotId: string) => void,
  /** The Settings dialog's model. Optional so this file owns a working
   *  dialog on its own: with nothing passed, every pick still persists, it
   *  simply takes effect on the next page load rather than live. `main.ts`
   *  (Task 6) passes `createBootQuality().settings` (`bootQuality.ts`) so a
   *  tier click reaches the live cascades/clouds/vegetation -- see
   *  `TitleScreenHandle.settings`. `tests/render/bootQuality.test.ts` pins
   *  that this argument is actually passed, because omitting it is invisible
   *  on screen: the dialog looks and persists exactly the same. */
  settings: SettingsModel = createSettingsModel(),
): TitleScreenHandle {
  const m = titleModel()

  let isUp = false
  let onKey: ((e: KeyboardEvent) => void) | null = null
  // Rebuilt with the overlay on every `build()`; the MODEL above is not,
  // which is what makes a choice survive a return-to-title.
  let settingsDialog: SettingsDialogHandle | null = null

  const hide = (): void => {
    if (!isUp) return
    isUp = false
    // Before the overlay node goes: the dialog also owns a `window` keydown
    // listener for Esc, and one leaked per return-to-title would accumulate.
    // Closed first so a dialog left open when a flight starts is not still
    // open on the overlay the next `show()` builds.
    settings.close()
    settingsDialog?.destroy()
    settingsDialog = null
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

    // The roster step (design §3; restyled Task 7 into the Naval
    // Communications system -- naval-comms spec §3: letterhead, a ruled
    // `.form-table`, `.row-selected`). Every pilot `loadRoster()` returns,
    // plus a "New pilot" entry -- read fresh on every `build()` call so a
    // score just banked by the debrief that preceded this `show()` is what
    // the roster shows. Native `<button>` per selectable row, same reason
    // the scenario/loadout rows below lean on native controls rather than a
    // click handler on a styled `<div>`: free keyboard support.
    //
    // `ensureStampFilter()` runs before anything below can render the
    // corner "Confidential" `.stamp` -- see that function's own doc comment
    // (navalComms.ts): without the filter element Chromium silently paints an
    // unroughened stamp. Idempotent, so calling it again here is safe even
    // though `settings.ts`'s dialog also calls it.
    ensureStampFilter()
    const pilots: PilotRecord[] = [...loadRoster()]
    let selectedPilotId: string | null = null
    const pilotRows = new Map<string, { row: HTMLTableRowElement; selectButton: HTMLButtonElement }>()

    // `.naval-comms`'s page-furniture rules (`naval-comms.css`'s own comment:
    // 40px padding and a centered flex column with a 28px gap) are meant for
    // a screen that IS the whole page -- this
    // panel is one section of the title screen's own flex column, alongside
    // the scenario/loadout pickers and the New game/About/Settings row built
    // below, over the title art. Overridden here the same way `settings.ts`
    // overrides `position`/`background` for ITS layout: `display:block`
    // neutralizes `flex-direction`/`align-items`/`gap` (inert once the
    // container isn't a flex box), and `padding`/`background` are reset
    // directly so this reads as a full-width paper sheet against the art,
    // not a padded dark box inside a dark box.
    const rosterPanel = document.createElement('div')
    rosterPanel.className = 'naval-comms'
    rosterPanel.style.cssText =
      'display:block;padding:0;background:transparent;width:min(900px,92vw);margin-bottom:1.5vh'

    const sheet = document.createElement('div')
    sheet.className = 'sheet'

    const confidentialStamp = document.createElement('div')
    confidentialStamp.className = 'stamp stamp--violet stamp--sm stamp--rotate-2 stamp-corner'
    confidentialStamp.textContent = 'Confidential'
    sheet.appendChild(confidentialStamp)

    const letterhead = document.createElement('div')
    letterhead.className = 'letterhead'
    const letterheadText = document.createElement('div')
    letterheadText.className = 'letterhead-text'
    const letterheadKicker = document.createElement('div')
    letterheadKicker.className = 'letterhead-kicker'
    letterheadKicker.textContent = 'Bureau of Naval Personnel'
    const letterheadTitle = document.createElement('div')
    letterheadTitle.className = 'letterhead-title'
    letterheadTitle.textContent = 'Squadron Roster'
    letterheadText.append(letterheadKicker, letterheadTitle)
    letterhead.appendChild(letterheadText)
    sheet.appendChild(letterhead)

    // The pilot list itself, scrolled independently of the letterhead/enlist
    // form around it -- the same 22vh-ish scroll budget the previous button
    // list gave a long roster, just confined to the table body this time so
    // the form below stays reachable without scrolling past every pilot.
    const tableScroll = document.createElement('div')
    tableScroll.style.cssText = 'max-height:32vh;overflow-y:auto'
    const table = document.createElement('table')
    table.className = 'form-table'
    const thead = document.createElement('thead')
    const headRow = document.createElement('tr')
    for (const label of ['Name', 'Rank', 'Score', 'Sorties', 'Kills', 'Status']) {
      const th = document.createElement('th')
      th.textContent = label
      headRow.appendChild(th)
    }
    thead.appendChild(headRow)
    const tbody = document.createElement('tbody')
    table.append(thead, tbody)
    tableScroll.appendChild(table)
    sheet.appendChild(tableScroll)

    const flyingAs = document.createElement('p')
    flyingAs.style.cssText = FLYING_AS_STYLE
    sheet.appendChild(flyingAs)

    rosterPanel.appendChild(sheet)
    overlay.appendChild(rosterPanel)

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
    // Settings sits beside New game and About, NOT inside the roster/
    // scenario/loadout flow: it is session-wide state, not part of starting a
    // sortie, so it is reachable at every step including before a pilot is
    // picked (render-quality-selector spec §6).
    const settingsButton = document.createElement('button')
    settingsButton.textContent = m.settings
    settingsButton.style.cssText = BUTTON_STYLE
    row.append(newGame, about, settingsButton)
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

    // Inside the overlay, same as the About panel and for the same reason:
    // it can never outlive the screen it belongs to.
    settingsDialog = createSettingsDialog(overlay, settings)

    root.appendChild(overlay)

    const selectPilot = (pilot: PilotRecord): void => {
      selectedPilotId = pilot.id
      for (const [id, { row: pilotRow, selectButton }] of pilotRows) {
        const selected = id === pilot.id
        pilotRow.classList.toggle('row-selected', selected)
        selectButton.setAttribute('aria-pressed', String(selected))
      }
      flyingAs.textContent = selectedPilotLabel(pilot)
      scenarioRow.style.display = 'flex'
      loadoutRow.style.display = 'flex'
      newGame.disabled = false
      newGame.style.opacity = '1'
    }

    const totalKills = (pilot: PilotRecord): number =>
      Object.values(pilot.killsByType).reduce((sum, n) => sum + n, 0)

    // One `.form-table` row per pilot, columns matching `PilotRecord` (naval-
    // comms spec §3): name, rank, score, sorties, kills, status. The Name
    // cell's button is the row's select control -- a real `<button>` reset to
    // read as plain cell text (`ROW_SELECT_BUTTON_STYLE`), not a `role`
    // stuck on the `<tr>` itself, so the table keeps valid row/cell structure
    // while staying a native, keyboard-reachable control.
    //
    // Its accessible name is `pilotButtonLabel(pilot)` -- the SAME
    // name/rank/score(/KIA) string this screen has always used, unchanged
    // and still pinned by `titleScreen.test.ts` -- carried as `aria-label`
    // rather than visible text now that those fields each have their own
    // column, so a screen reader still hears the whole picture in one
    // announcement instead of just the name.
    const makePilotRow = (pilot: PilotRecord): HTMLTableRowElement => {
      const pilotRow = document.createElement('tr')

      const nameCell = document.createElement('td')
      const selectButton = document.createElement('button')
      selectButton.style.cssText = ROW_SELECT_BUTTON_STYLE
      selectButton.textContent = pilot.name
      selectButton.setAttribute('aria-label', pilotButtonLabel(pilot))
      selectButton.setAttribute('aria-pressed', 'false')
      selectButton.addEventListener('click', () => selectPilot(pilot))
      nameCell.appendChild(selectButton)

      const rankCell = document.createElement('td')
      rankCell.textContent = `${pilot.rank.abbrev}, ${pilot.rank.name}`

      const scoreCell = document.createElement('td')
      scoreCell.className = 'num'
      scoreCell.textContent = String(pilot.cumulativeScore)

      const sortiesCell = document.createElement('td')
      sortiesCell.className = 'num'
      sortiesCell.textContent = String(pilot.sorties)

      const killsCell = document.createElement('td')
      killsCell.className = 'num'
      killsCell.textContent = String(totalKills(pilot))

      // `.stamp-chip` -- unlike `.stamp`, it carries no `filter: url(...)`
      // reference (naval-comms.css), so it needs no `ensureStampFilter()`.
      const statusCell = document.createElement('td')
      statusCell.className = 'center'
      const statusChip = document.createElement('span')
      statusChip.className = 'stamp-chip'
      const isKia = pilot.status === 'kia'
      const statusColor = isKia ? '--stamp-red' : '--stamp-black'
      statusChip.style.cssText = `color:var(${statusColor});border-color:var(${statusColor})`
      statusChip.textContent = isKia ? 'K.I.A.' : 'Active'
      statusCell.appendChild(statusChip)

      pilotRow.append(nameCell, rankCell, scoreCell, sortiesCell, killsCell, statusCell)
      pilotRows.set(pilot.id, { row: pilotRow, selectButton })
      return pilotRow
    }

    for (const pilot of pilots) tbody.appendChild(makePilotRow(pilot))

    // "Enlist New Pilot" (naval-comms spec §3: no matching prototype example
    // for this control, a new composition within the design system) -- a
    // `.form-section-title` heading, a `.field-row`/`.typed-input` pair for
    // the name, and an `.ink-button` pair, all styled off `naval-comms.css`'s
    // existing classes rather than the ad-hoc inline styles this section used
    // before. Behavior is untouched: "New pilot" toggles to the inline form,
    // the same button text, placeholder and confirm label `tests/e2e/
    // scenarioPicker.spec.ts` already selects by.
    const enlistTitle = document.createElement('div')
    enlistTitle.className = 'form-section-title'
    enlistTitle.textContent = 'Enlist New Pilot'
    sheet.appendChild(enlistTitle)

    const newPilotButton = document.createElement('button')
    newPilotButton.className = 'ink-button'
    newPilotButton.textContent = 'New pilot'

    const newPilotForm = document.createElement('div')
    newPilotForm.style.cssText = 'display:none;flex-direction:column;gap:10px'
    const fieldRow = document.createElement('div')
    fieldRow.className = 'field-row'
    const fieldLabel = document.createElement('span')
    fieldLabel.className = 'field-label'
    fieldLabel.textContent = 'Name'
    const newPilotInput = document.createElement('input')
    newPilotInput.type = 'text'
    newPilotInput.placeholder = 'Pilot name'
    newPilotInput.className = 'typed-input'
    fieldRow.append(fieldLabel, newPilotInput)
    const confirmRow = document.createElement('div')
    confirmRow.className = 'button-row'
    const newPilotConfirm = document.createElement('button')
    newPilotConfirm.className = 'ink-button ink-button--primary'
    newPilotConfirm.textContent = 'Add'
    confirmRow.appendChild(newPilotConfirm)
    newPilotForm.append(fieldRow, confirmRow)

    const newPilotError = document.createElement('p')
    newPilotError.setAttribute('aria-live', 'polite')
    newPilotError.style.cssText = NEW_PILOT_ERROR_STYLE

    sheet.append(newPilotButton, newPilotForm, newPilotError)

    const openNewPilotForm = (): void => {
      newPilotButton.style.display = 'none'
      newPilotForm.style.display = 'flex'
      newPilotError.style.display = 'none'
      newPilotInput.value = ''
      newPilotInput.focus()
    }
    const closeNewPilotForm = (): void => {
      newPilotForm.style.display = 'none'
      newPilotButton.style.display = ''
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
      tbody.appendChild(makePilotRow(pilot))
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
    settingsButton.addEventListener('click', () => settingsDialog?.open())

    onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return
      if (aboutPanel.style.display !== 'none') return
      if (newPilotForm.style.display !== 'none') return
      // Enter must not launch a sortie out from under the Settings dialog.
      // Its own ballot rows already stop Enter propagating (settings.ts), but
      // Enter pressed with nothing in the dialog focused still reaches here.
      if (settingsDialog?.isOpen() === true) return
      e.preventDefault()
      start()
    }
    window.addEventListener('keydown', onKey)
    isUp = true
    newPilotButton.focus()
  }

  build()

  return {
    up: () => isUp,
    settings,
    hide,
    // Reassigns the parameter `build`'s closure already reads
    // (`currentScenarioId`, above) before rebuilding, rather than adding a
    // second variable -- `build`'s own scenario-radio and `start()`'s
    // fallback both close over this one binding by reference, so a
    // reassignment here is exactly what the next `build()` call sees (Plan 9
    // Task 7 bugfix).
    show: (nextScenarioId: string): void => {
      currentScenarioId = nextScenarioId
      build()
    },
  }
}
