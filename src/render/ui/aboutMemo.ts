import { CREDITS, OSM_COPYRIGHT_URL, WORLDCOVER_LICENCE_URL } from '../legend.js'
import { MODEL_CREDITS } from '../modelCreditsIndex.js'
import { modelCreditParts } from '../modelCredits.js'
import type { TitleModel } from '../titleScreen.js'
import { buttonRow, inkButton, letterhead } from './memo.js'

/**
 * The About memo (popup): project text, data and model credits, licence. Shared by the title overlay and the
 * headquarters (plan F5B), whose overlay covers the title's own Administration memo. The caller appends `panel`
 * to its overlay, shows it with `display:flex`, and wires `close`.
 */
export function createAboutPanel(m: TitleModel): { readonly panel: HTMLDivElement; readonly close: HTMLButtonElement } {
  const aboutPanel = document.createElement('div')
  aboutPanel.className = 'naval-comms'
  aboutPanel.setAttribute('role', 'dialog')
  aboutPanel.setAttribute('aria-modal', 'true')
  aboutPanel.setAttribute('aria-label', 'About')
  aboutPanel.style.cssText =
    'position:absolute;inset:0;display:none;overflow-y:auto;background:rgba(11,13,16,.82);z-index:30'
  const aboutSheet = document.createElement('div')
  aboutSheet.className = 'sheet'
  aboutSheet.style.maxWidth = '640px'
  aboutSheet.appendChild(letterhead(m.aboutKicker, m.aboutTitle, 'FORM INFO-1'))
  for (const text of m.aboutParagraphs) {
    const p = document.createElement('p')
    p.style.cssText = 'margin:0 0 10px;font-size:13px;line-height:1.55'
    p.textContent = text
    aboutSheet.appendChild(p)
  }
  const aboutFinePrint = document.createElement('div')
  aboutFinePrint.className = 'fine-print'
  const creditsSpan = document.createElement('span')
  const creditLink = (text: string, href: string): HTMLAnchorElement => {
    const link = document.createElement('a')
    link.href = href
    link.target = '_blank'
    link.rel = 'noopener'
    link.textContent = text
    link.style.color = 'inherit'
    return link
  }
  creditsSpan.append(
    CREDITS.before,
    creditLink(CREDITS.worldCover, WORLDCOVER_LICENCE_URL),
    CREDITS.between,
    creditLink(CREDITS.link, OSM_COPYRIGHT_URL),
  )
  // The flight overlay used to carry these links. Keep every CC BY work and
  // both data attributions reachable after removing that redundant panel.
  if (MODEL_CREDITS.length > 0) {
    creditsSpan.append(document.createElement('br'), 'Models: ')
    for (const part of modelCreditParts(MODEL_CREDITS)) {
      creditsSpan.append(part.href === undefined ? part.text : creditLink(part.text, part.href))
    }
    creditsSpan.append(' (', creditLink('CC BY 4.0', WORLDCOVER_LICENCE_URL), ')')
  }
  const licenceSpan = document.createElement('span')
  const repo = document.createElement('a')
  repo.href = m.repository
  repo.target = '_blank'
  repo.rel = 'noopener'
  repo.textContent = 'Source repository'
  repo.style.color = 'inherit'
  const website = document.createElement('a')
  website.href = m.website
  website.target = '_blank'
  website.rel = 'noopener'
  website.textContent = 'marktuttle.dev'
  website.style.color = 'inherit'
  licenceSpan.append(`${m.licence} `, repo, ' · ', website)
  aboutFinePrint.append(creditsSpan, licenceSpan)
  aboutSheet.appendChild(aboutFinePrint)
  const close = inkButton(m.close, true)
  aboutSheet.appendChild(buttonRow(close))
  aboutPanel.appendChild(aboutSheet)
  return { panel: aboutPanel, close }
}
