import { BINDINGS } from '../input/bindings.js'
import type { World } from '../sim/loop.js'
import { TARGET_TYPES, type TargetType } from '../sim/weapons/targetType.js'
import { keyLabel, legendEntries } from './legend.js'
import { renderBriefing, type BriefingModel } from './mission/briefing.js'
import { objectiveRows } from './mission/chart.js'
import { createMissionMap } from './missionMap.js'
import { createSettingsDialog, type SettingsModel } from './settings.js'
import { ensureStampFilter, sectionTitle } from './ui/navalComms.js'

export type PauseScreenSnapshot<M> = {
  readonly pilotName: string
  readonly currentKills: Readonly<Record<TargetType, number>>
  readonly careerKills: Readonly<Record<TargetType, number>>
  readonly world: World<M>
  readonly selectedNavigationId: string | null
  readonly briefing: BriefingModel
}

export type PauseScreenOptions<M> = {
  readonly snapshot: () => PauseScreenSnapshot<M>
  readonly onResume: () => void
  readonly onRestart: () => void
  readonly onAbort: () => void
  readonly onSelectNavigation: (id: string) => void
}

export type PauseScreenHandle = {
  /** Open the dossier on a specific tab. Keyboard shortcuts use this as a
   *  deep link; ordinary Escape pause opens on the Tally. */
  show(tab?: PauseScreenTab): void
  hide(): void
  readonly isOpen: () => boolean
  readonly settingsOpen: () => boolean
}

export type PauseScreenTab = 'tally' | 'map' | 'mission' | 'controls' | 'quality'
type Confirmation = 'restart' | 'abort'

const TARGET_LABELS: Readonly<Record<TargetType, string>> = {
  fighter: 'Fighters',
  bomber: 'Bombers',
  cruiser: 'Cruisers',
  battleship: 'Battleships',
  destroyer: 'Destroyers',
  transport: 'Transports',
  aaa: 'Anti-aircraft',
  runway: 'Runways',
  building: 'Buildings',
  tank: 'Tanks',
  carrier: 'Carriers',
}

const totalKills = (kills: Readonly<Record<TargetType, number>>): number =>
  TARGET_TYPES.reduce((total, type) => total + kills[type], 0)

/** A live operations folder, not an after-action report. Its paper and ink
 * vocabulary matches the debrief, while every figure comes from the held
 * World and the selected pilot's roster record. */
export function createPauseScreen<M>(
  root: HTMLElement,
  settings: SettingsModel,
  options: PauseScreenOptions<M>,
): PauseScreenHandle {
  ensureStampFilter()

  const backdrop = document.createElement('div')
  backdrop.dataset.ww2PauseMenu = ''
  backdrop.style.cssText =
    'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
    'padding:20px 12px;background:rgba(8,10,14,.48);z-index:10'

  const folder = document.createElement('section')
  folder.className = 'naval-comms'
  folder.setAttribute('role', 'dialog')
  folder.setAttribute('aria-modal', 'true')
  folder.setAttribute('aria-label', 'Pause menu')
  folder.style.cssText =
    'display:block;padding:0;background:transparent;width:min(920px,96vw);max-height:92vh;overflow-y:auto'

  const tabStrip = document.createElement('div')
  tabStrip.setAttribute('role', 'tablist')
  tabStrip.setAttribute('aria-label', 'Pause dossier sections')
  tabStrip.style.cssText = 'display:flex;align-items:flex-end;gap:3px;padding:0 14px;overflow-x:auto'

  const sheet = document.createElement('div')
  sheet.className = 'sheet'
  sheet.style.cssText =
    'position:relative;background:#d9c69b;border-color:#9c8559;box-shadow:0 12px 34px rgba(0,0,0,.34)'

  const activeStamp = document.createElement('div')
  activeStamp.className = 'stamp stamp--lg stamp-corner stamp--blue stamp--rotate-1'
  activeStamp.textContent = 'SORTIE ACTIVE'
  sheet.appendChild(activeStamp)

  const letterhead = document.createElement('div')
  letterhead.className = 'letterhead'
  const letterheadText = document.createElement('div')
  letterheadText.className = 'letterhead-text'
  const kicker = document.createElement('div')
  kicker.className = 'letterhead-kicker'
  kicker.textContent = 'Flight status — world held'
  const title = document.createElement('div')
  title.className = 'letterhead-title'
  title.textContent = 'Mission Paused'
  letterheadText.append(kicker, title)
  const formNumber = document.createElement('div')
  formNumber.className = 'form-number'
  formNumber.textContent = 'FORM OPS-5'
  letterhead.append(letterheadText, formNumber)
  sheet.appendChild(letterhead)

  const contents = document.createElement('div')
  contents.style.cssText = 'min-height:360px'
  sheet.appendChild(contents)

  const definitions: readonly { readonly id: PauseScreenTab; readonly label: string }[] = [
    { id: 'tally', label: 'Tally' },
    { id: 'map', label: 'Map' },
    { id: 'mission', label: 'Mission Description' },
    { id: 'controls', label: 'Controls' },
    { id: 'quality', label: 'Visual Quality' },
  ]
  const tabButtons = new Map<PauseScreenTab, HTMLButtonElement>()
  const tabPanels = new Map<PauseScreenTab, HTMLElement>()
  let shownSnapshot: PauseScreenSnapshot<M> | null = null

  for (const definition of definitions) {
    const tab = document.createElement('button')
    tab.id = `pause-tab-${definition.id}`
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-controls', `pause-panel-${definition.id}`)
    tab.className = 'ink-button'
    tab.textContent = definition.label
    tab.style.cssText =
      'flex:0 0 auto;border-bottom:0;border-radius:5px 5px 0 0;background:#c8b17d;' +
      'padding:9px 14px;transform:translateY(1px)'
    tab.addEventListener('click', () => activateTab(definition.id, true))
    tabStrip.appendChild(tab)
    tabButtons.set(definition.id, tab)

    const panel = document.createElement('section')
    panel.id = `pause-panel-${definition.id}`
    panel.setAttribute('role', 'tabpanel')
    panel.setAttribute('aria-labelledby', tab.id)
    panel.style.display = 'none'
    contents.appendChild(panel)
    tabPanels.set(definition.id, panel)
  }

  const tallyPanel = tabPanels.get('tally')!
  const pilotLine = document.createElement('p')
  pilotLine.style.cssText = 'margin:0 0 10px;font-size:13px;color:var(--ink-faint)'
  const tallyTable = document.createElement('table')
  tallyTable.className = 'form-table'
  tallyTable.setAttribute('aria-label', 'Kill tally')
  const tallyHead = document.createElement('thead')
  const tallyHeadRow = document.createElement('tr')
  for (const [text, numeric] of [['Target', false], ['This sortie', true], ['Career', true]] as const) {
    const heading = document.createElement('th')
    if (numeric) heading.className = 'num'
    heading.textContent = text
    tallyHeadRow.appendChild(heading)
  }
  tallyHead.appendChild(tallyHeadRow)
  const tallyBody = document.createElement('tbody')
  tallyTable.append(tallyHead, tallyBody)
  const objectives = document.createElement('div')
  objectives.setAttribute('aria-label', 'Mission objectives')
  objectives.style.marginTop = '18px'
  tallyPanel.append(sectionTitle('Combat Tally'), pilotLine, tallyTable, objectives)

  // This is the existing Plan 14 chart renderer, mounted inline. It retains
  // the same terrain, objective marks, course selection, pan, zoom and live
  // navigation callback as the standalone chart opened by P.
  const mapPanel = tabPanels.get('map')!
  mapPanel.appendChild(sectionTitle('Mission Map'))
  const mapHost = document.createElement('div')
  mapPanel.appendChild(mapHost)
  const embeddedMap = createMissionMap(mapHost, {
    embedded: true,
    onClose: () => undefined,
    onSelect: (id) => {
      if (shownSnapshot !== null) shownSnapshot = { ...shownSnapshot, selectedNavigationId: id }
      options.onSelectNavigation(id)
    },
  })

  const missionPanel = tabPanels.get('mission')!
  const controlsPanel = tabPanels.get('controls')!
  controlsPanel.appendChild(sectionTitle('Keyboard Controls'))
  const controlsTable = document.createElement('table')
  controlsTable.className = 'form-table'
  const controlsHead = document.createElement('thead')
  const controlsHeadRow = document.createElement('tr')
  const controlHeading = document.createElement('th')
  controlHeading.textContent = 'Control'
  const keyHeading = document.createElement('th')
  keyHeading.className = 'num'
  keyHeading.textContent = 'Key'
  controlsHeadRow.append(controlHeading, keyHeading)
  controlsHead.appendChild(controlsHeadRow)
  const controlsBody = document.createElement('tbody')
  for (const entry of legendEntries()) {
    const row = document.createElement('tr')
    const label = document.createElement('td')
    label.textContent = entry.label
    const keys = document.createElement('td')
    keys.className = 'num'
    keys.textContent = entry.keys
    row.append(label, keys)
    controlsBody.appendChild(row)
  }
  controlsTable.append(controlsHead, controlsBody)
  controlsPanel.appendChild(controlsTable)

  const qualityPanel = tabPanels.get('quality')!
  qualityPanel.appendChild(sectionTitle('Visual Quality'))
  const qualityCopy = document.createElement('p')
  qualityCopy.style.cssText = 'margin:0 0 14px;max-width:620px;line-height:1.55'
  qualityCopy.textContent =
    'Rendering changes apply immediately to the held mission and use the same settings as the main menu.'
  qualityPanel.appendChild(qualityCopy)

  // The title-screen Settings controls themselves, scoped to rows that are
  // safe to change in a held sortie. Inline avoids stacking a modal over the
  // pause dossier while keeping one implementation and one live model.
  const settingsSurface = createSettingsDialog(qualityPanel, settings, { scope: 'live', presentation: 'inline' })

  const button = (label: string, primary: boolean, run: () => void): HTMLButtonElement => {
    const el = document.createElement('button')
    el.className = primary ? 'ink-button ink-button--primary' : 'ink-button'
    el.textContent = label
    el.addEventListener('click', () => {
      el.blur()
      run()
    })
    return el
  }

  const footer = document.createElement('div')
  footer.className = 'button-row'
  footer.style.cssText = 'position:sticky;bottom:0;margin-top:18px;padding-top:12px;background:#d9c69b'
  const resume = button('Resume', true, () => {
    backdrop.style.display = 'none'
    embeddedMap.hide()
    options.onResume()
  })
  const restart = button('Restart Mission', false, () => showConfirmation('restart'))
  const abort = button('Abort Mission', false, () => showConfirmation('abort'))
  footer.append(resume, restart, abort)
  sheet.appendChild(footer)

  const finePrint = document.createElement('div')
  finePrint.className = 'fine-print'
  const status = document.createElement('span')
  status.textContent = 'Live operations record — no debrief has been filed.'
  const esc = document.createElement('span')
  esc.textContent = `${keyLabel(BINDINGS.pause[0])} to resume`
  finePrint.append(status, esc)
  sheet.appendChild(finePrint)
  folder.append(tabStrip, sheet)

  const confirmationPanel = document.createElement('section')
  confirmationPanel.className = 'naval-comms'
  confirmationPanel.setAttribute('role', 'alertdialog')
  confirmationPanel.setAttribute('aria-modal', 'true')
  confirmationPanel.setAttribute('aria-label', 'Mission action confirmation')
  confirmationPanel.style.cssText =
    'display:none;padding:0;background:transparent;width:min(680px,94vw);max-height:88vh;overflow-y:auto'
  const confirmationSheet = document.createElement('div')
  confirmationSheet.className = 'sheet'
  const warningStamp = document.createElement('div')
  warningStamp.className = 'stamp stamp--lg stamp-corner stamp--red stamp--rotate-2'
  warningStamp.textContent = 'CONFIRM'
  const confirmationLetterhead = document.createElement('div')
  confirmationLetterhead.className = 'letterhead'
  const confirmationLetterheadText = document.createElement('div')
  confirmationLetterheadText.className = 'letterhead-text'
  const confirmationKicker = document.createElement('div')
  confirmationKicker.className = 'letterhead-kicker'
  const confirmationTitle = document.createElement('div')
  confirmationTitle.className = 'letterhead-title'
  confirmationLetterheadText.append(confirmationKicker, confirmationTitle)
  const confirmationForm = document.createElement('div')
  confirmationForm.className = 'form-number'
  confirmationForm.textContent = 'FORM OPS-7'
  confirmationLetterhead.append(confirmationLetterheadText, confirmationForm)
  const confirmationDetail = document.createElement('p')
  confirmationDetail.style.cssText = 'margin:0 0 8px;line-height:1.55'
  const confirmationButtons = document.createElement('div')
  confirmationButtons.className = 'button-row'
  let pendingConfirmation: Confirmation = 'restart'
  const keepFlying = button('Keep Flying', true, () => hideConfirmation())
  const confirmAction = button('Restart Mission', false, () => {
    backdrop.style.display = 'none'
    embeddedMap.hide()
    if (pendingConfirmation === 'restart') options.onRestart()
    else options.onAbort()
  })
  confirmationButtons.append(keepFlying, confirmAction)
  const confirmationFinePrint = document.createElement('div')
  confirmationFinePrint.className = 'fine-print'
  const discardNote = document.createElement('span')
  discardNote.textContent = 'This action cannot be undone.'
  const confirmationEsc = document.createElement('span')
  confirmationEsc.textContent = `${keyLabel(BINDINGS.pause[0])} to cancel`
  confirmationFinePrint.append(discardNote, confirmationEsc)
  confirmationSheet.append(
    warningStamp,
    confirmationLetterhead,
    confirmationDetail,
    sectionTitle('Confirm Action'),
    confirmationButtons,
    confirmationFinePrint,
  )
  confirmationPanel.appendChild(confirmationSheet)
  backdrop.append(folder, confirmationPanel)
  root.appendChild(backdrop)

  function renderSnapshot(snapshot: PauseScreenSnapshot<M>): void {
    shownSnapshot = snapshot
    pilotLine.textContent = `Pilot: ${snapshot.pilotName}`
    tallyBody.replaceChildren()
    for (const type of TARGET_TYPES) {
      const row = document.createElement('tr')
      const target = document.createElement('td')
      target.textContent = TARGET_LABELS[type]
      const current = document.createElement('td')
      current.className = 'num'
      current.textContent = String(snapshot.currentKills[type])
      const career = document.createElement('td')
      career.className = 'num'
      career.textContent = String(snapshot.careerKills[type])
      row.append(target, current, career)
      tallyBody.appendChild(row)
    }
    const total = document.createElement('tr')
    const totalLabel = document.createElement('th')
    totalLabel.scope = 'row'
    totalLabel.textContent = 'Total'
    const currentTotal = document.createElement('td')
    currentTotal.className = 'num'
    currentTotal.textContent = String(totalKills(snapshot.currentKills))
    const careerTotal = document.createElement('td')
    careerTotal.className = 'num'
    careerTotal.textContent = String(totalKills(snapshot.careerKills))
    total.append(totalLabel, currentTotal, careerTotal)
    tallyBody.appendChild(total)

    objectives.replaceChildren(sectionTitle('Mission Objectives'))
    const rows = objectiveRows(snapshot.world.mission)
    if (rows.length === 0) {
      const none = document.createElement('p')
      none.textContent = 'No formal objectives assigned.'
      objectives.appendChild(none)
    } else {
      const table = document.createElement('table')
      table.className = 'form-table'
      const body = document.createElement('tbody')
      for (const objective of rows) {
        const row = document.createElement('tr')
        const label = document.createElement('td')
        label.textContent = objective.label
        const priority = document.createElement('td')
        priority.textContent = objective.priority.toUpperCase()
        const objectiveStatus = document.createElement('td')
        objectiveStatus.className = 'num'
        objectiveStatus.textContent = objective.status
        row.append(label, priority, objectiveStatus)
        body.appendChild(row)
      }
      table.appendChild(body)
      objectives.appendChild(table)
    }
    renderBriefing(missionPanel, snapshot.briefing)
  }

  function activateTab(id: PauseScreenTab, focus: boolean): void {
    for (const definition of definitions) {
      const selected = definition.id === id
      const tab = tabButtons.get(definition.id)!
      tab.setAttribute('aria-selected', String(selected))
      tab.tabIndex = selected ? 0 : -1
      tab.style.background = selected ? '#d9c69b' : '#c8b17d'
      tab.style.fontWeight = selected ? '700' : '400'
      tabPanels.get(definition.id)!.style.display = selected ? 'block' : 'none'
    }
    if (id === 'map' && shownSnapshot !== null) {
      embeddedMap.show(shownSnapshot.world, shownSnapshot.selectedNavigationId)
    } else {
      embeddedMap.hide()
    }
    if (focus) tabButtons.get(id)!.focus()
  }

  function showConfirmation(kind: Confirmation): void {
    pendingConfirmation = kind
    confirmationKicker.textContent = kind === 'restart' ? 'Sortie restart request' : 'Sortie termination request'
    confirmationTitle.textContent = kind === 'restart' ? 'Restart This Mission?' : 'Abort This Mission?'
    confirmationDetail.textContent = kind === 'restart'
      ? 'Current mission progress and kills will be lost. The mission will restart from the beginning.'
      : 'Current mission progress and kills will be lost. The sortie will end without a debrief or score.'
    confirmAction.textContent = kind === 'restart' ? 'Restart Mission' : 'Abort Mission'
    folder.style.display = 'none'
    confirmationPanel.style.display = 'block'
    keepFlying.focus()
  }

  function hideConfirmation(): void {
    confirmationPanel.style.display = 'none'
    folder.style.display = 'block'
    const returnTo = pendingConfirmation === 'restart' ? restart : abort
    returnTo.focus()
  }

  // A destructive confirmation owns Escape, returning to the folder rather
  // than reaching the flight-level handler and resuming the mission.
  window.addEventListener('keydown', (event) => {
    if (
      event.code !== 'Escape' ||
      backdrop.style.display === 'none' ||
      confirmationPanel.style.display === 'none'
    ) return
    event.preventDefault()
    event.stopImmediatePropagation()
    hideConfirmation()
  }, true)

  activateTab('tally', false)
  return {
    show(tab: PauseScreenTab = 'tally'): void {
      settingsSurface.close()
      confirmationPanel.style.display = 'none'
      folder.style.display = 'block'
      renderSnapshot(options.snapshot())
      activateTab(tab, false)
      backdrop.style.display = 'flex'
      if (tab === 'tally') resume.focus()
      else tabButtons.get(tab)!.focus()
    },
    hide(): void {
      settingsSurface.close()
      confirmationPanel.style.display = 'none'
      folder.style.display = 'block'
      embeddedMap.hide()
      backdrop.style.display = 'none'
    },
    isOpen: () => backdrop.style.display !== 'none',
    settingsOpen: settingsSurface.isOpen,
  }
}
