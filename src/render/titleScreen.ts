import { creditsLine } from './legend.js'
import { TITLE_ART_URL } from './content.js'

/**
 * The title screen (design: docs/superpowers/specs/2026-09-19-title-screen-design.md).
 * Split like `debrief.ts`: a pure model the Node suite asserts on, thin DOM
 * under it. Created FIRST in `boot()`, so the art is up while the renderer,
 * the ocean and the terrain load behind it; `main.ts` holds the world while
 * `up()` is true, exactly as it does for the open navigation chart.
 *
 * There is no `show()`. Nothing in this slice returns to the title -- the
 * debrief's Restart rebuilds the flight -- and a method nothing calls is
 * how a stale document starts. Plan 9 adds the menu that comes back here.
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

export type TitleScreenHandle = {
  /** Whether the title is still on screen; `main.ts` holds the world while it is. */
  readonly up: () => boolean
  hide(): void
}

const BUTTON_STYLE =
  'padding:10px 22px;border:1px solid #2b3440;border-radius:4px;background:rgba(236,239,243,.94);' +
  'color:#151b22;font:14px ui-monospace,Menlo,monospace;letter-spacing:.08em;cursor:pointer'

export function createTitleScreen(root: HTMLElement, onNewGame: () => void): TitleScreenHandle {
  const m = titleModel()
  const overlay = document.createElement('div')
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', 'Title')
  overlay.style.cssText =
    'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;' +
    `background:#0b0d10 url(${TITLE_ART_URL}) center/cover no-repeat;z-index:20`

  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:14px;margin-bottom:6vh'
  const newGame = document.createElement('button')
  newGame.textContent = m.newGame
  newGame.style.cssText = BUTTON_STYLE
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

  let isUp = true
  const onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return
    if (aboutPanel.style.display !== 'none') return
    e.preventDefault()
    start()
  }
  const hide = (): void => {
    if (!isUp) return
    isUp = false
    overlay.remove()
    window.removeEventListener('keydown', onKey)
  }
  const start = (): void => {
    hide()
    onNewGame()
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
  window.addEventListener('keydown', onKey)
  newGame.focus()

  return { up: () => isUp, hide }
}
