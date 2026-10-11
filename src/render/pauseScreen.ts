import { BINDINGS } from '../input/bindings.js'
import { keyLabel } from './legend.js'
import { createSettingsDialog, type SettingsModel } from './settings.js'
import { ensureStampFilter, sectionTitle } from './ui/navalComms.js'

export type PauseScreenOptions = {
  readonly onResume: () => void
  readonly onRestart: () => void
  readonly onViewMap: () => void
}

export type PauseScreenHandle = {
  show(): void
  hide(): void
  readonly isOpen: () => boolean
  readonly settingsOpen: () => boolean
}

/**
 * The manual-pause surface. It uses the same paper, letterhead, stamp and
 * ink-button vocabulary as the debrief, but its copy is deliberately about
 * a live sortie: no outcome, figures, score or Action Report language.
 *
 * Visual Quality is the real Settings dialog in its rendering-only scope,
 * backed by the same live model the title screen uses. There is no second
 * set of quality controls to drift away from the main menu.
 */
export function createPauseScreen(
  root: HTMLElement,
  settings: SettingsModel,
  options: PauseScreenOptions,
): PauseScreenHandle {
  ensureStampFilter()

  const backdrop = document.createElement('div')
  backdrop.dataset.ww2PauseMenu = ''
  backdrop.style.cssText =
    'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
    'background:rgba(8,10,14,.45);z-index:10'

  const panel = document.createElement('div')
  panel.className = 'naval-comms'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-label', 'Pause menu')
  panel.style.cssText =
    'display:block;padding:0;background:transparent;width:min(720px,94vw);' +
    'max-height:88vh;overflow-y:auto'

  const sheet = document.createElement('div')
  sheet.className = 'sheet'

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

  const detail = document.createElement('p')
  detail.style.cssText = 'margin:0 0 8px'
  detail.textContent = 'The mission is still in progress. Resume this sortie, consult the chart, or adjust visual quality.'
  sheet.appendChild(detail)
  sheet.appendChild(sectionTitle('Sortie Controls'))

  const buttons = document.createElement('div')
  buttons.className = 'button-row'
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

  const resume = button('Resume', true, () => {
    backdrop.style.display = 'none'
    options.onResume()
  })
  const viewMap = button('View Map', false, () => {
    backdrop.style.display = 'none'
    options.onViewMap()
  })
  const visualQuality = button('Visual Quality', false, () => settingsDialog.open())
  const restart = button('Restart Mission', false, () => {
    backdrop.style.display = 'none'
    options.onRestart()
  })
  buttons.append(resume, viewMap, visualQuality, restart)
  sheet.appendChild(buttons)

  const finePrint = document.createElement('div')
  finePrint.className = 'fine-print'
  const status = document.createElement('span')
  status.textContent = 'No debrief has been filed. This sortie remains active.'
  const esc = document.createElement('span')
  esc.textContent = `${keyLabel(BINDINGS.pause[0])} to resume`
  finePrint.append(status, esc)
  sheet.appendChild(finePrint)

  panel.appendChild(sheet)
  backdrop.appendChild(panel)
  root.appendChild(backdrop)

  // A child of the pause backdrop so closing it reveals the pause sheet, not
  // the running flight. Its controls are built by settings.ts, exactly as on
  // the title screen; only non-visual rows are omitted in this context.
  const settingsDialog = createSettingsDialog(backdrop, settings, { scope: 'visual' })

  return {
    show(): void {
      backdrop.style.display = 'flex'
      resume.focus()
    },
    hide(): void {
      settingsDialog.close()
      backdrop.style.display = 'none'
    },
    isOpen: () => backdrop.style.display !== 'none',
    settingsOpen: settingsDialog.isOpen,
  }
}
