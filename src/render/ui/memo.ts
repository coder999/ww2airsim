/**
 * Memo-sheet building blocks shared by the title's sortie forms and the headquarters screens (plan F5B Task 6).
 * Moved from `titleScreen.ts` unchanged; `titleScreen.ts` imports them from here.
 */
export { sectionTitle } from './navalComms.js'

/**
 * One memo panel: a `.naval-comms` wrapper around a `.sheet`.
 *
 * `.naval-comms`'s page-furniture rules (`naval-comms.css`'s own comment:
 * 40px padding and a centered flex column with a 28px gap) are meant for a
 * screen that IS the whole page -- these panels are sections of the title
 * screen's own flex column, over the title art. Overridden the same way
 * `settings.ts` overrides `position`/`background` for ITS layout:
 * `display:block` neutralizes `flex-direction`/`align-items`/`gap` (inert once
 * the container isn't a flex box), and `padding`/`background` are reset
 * directly so this reads as a full-width paper sheet against the art, not a
 * padded dark box inside a dark box.
 */
export function memoPanel(): { readonly panel: HTMLDivElement; readonly sheet: HTMLDivElement } {
  const panel = document.createElement('div')
  panel.className = 'naval-comms'
  panel.style.cssText = 'display:block;padding:0;background:transparent;width:min(900px,92vw);margin-bottom:2vh;flex:none'
  const sheet = document.createElement('div')
  sheet.className = 'sheet'
  panel.appendChild(sheet)
  return { panel, sheet }
}

/** A `.letterhead`: kicker over title, with an optional form number at the right. */
export function letterhead(kicker: string, title: string, number?: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'letterhead'
  const text = document.createElement('div')
  text.className = 'letterhead-text'
  const kickerEl = document.createElement('div')
  kickerEl.className = 'letterhead-kicker'
  kickerEl.textContent = kicker
  const titleEl = document.createElement('div')
  titleEl.className = 'letterhead-title'
  titleEl.textContent = title
  text.append(kickerEl, titleEl)
  el.appendChild(text)
  if (number !== undefined) {
    const numberEl = document.createElement('div')
    numberEl.className = 'form-number'
    numberEl.textContent = number
    el.appendChild(numberEl)
  }
  return el
}

export function inkButton(text: string, primary = false): HTMLButtonElement {
  const el = document.createElement('button')
  el.className = primary ? 'ink-button ink-button--primary' : 'ink-button'
  el.textContent = text
  return el
}

export function buttonRow(...buttons: HTMLButtonElement[]): HTMLDivElement {
  const row = document.createElement('div')
  row.className = 'button-row'
  row.style.justifyContent = 'flex-end'
  row.append(...buttons)
  return row
}

