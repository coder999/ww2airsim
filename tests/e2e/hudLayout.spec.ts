import { expect, test, type Page } from '@playwright/test'
import { startGame, waitForScenario, type DiagWindow } from './harness.js'

/**
 * F6B HUD layout (Mark 2026-10-15): the sight badge sat UNDER the tutorial instruction ("CLIMB ABOVE 1,500 FT") and
 * overlapped it. With the objective line, the sight badge and the DEV overlay all visible, no two boxes may intersect,
 * at 16:9 and at a narrow 4:3. Boxes are read from the DOM (`getBoundingClientRect`), never from pixels.
 */
test.setTimeout(240_000)
type Box = { name: string; x: number; y: number; w: number; h: number }
const boxes = (page: Page): Promise<Box[]> => page.evaluate(() => {
  const pick = (name: string, el: Element | null): Box | null => {
    if (el === null) return null
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el)
    return cs.display === 'none' || r.width === 0 ? null : { name, x: r.x, y: r.y, w: r.width, h: r.height }
  }
  return [
    pick('objective', document.querySelector('[aria-label="Objective"]')),
    pick('sight badge', document.querySelector('.ww2-sight-badge')),
    pick('dev overlay', document.querySelector('[data-ww2-overlay]')),
    pick('radio', document.querySelector('[aria-label="Radio"]')),
  ].filter((b): b is Box => b !== null)
})
const hits = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

for (const size of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }]) {
  test(`the sight badge, the tutorial instruction and the DEV overlay never overlap at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size)
    await page.goto('/')
    await startGame(page, { scenario: 'Basic Flying', loadout: 'Bombs' })
    await waitForScenario(page, 'tutorial')
    await page.waitForFunction(() => ((window as DiagWindow).__ww2?.tick() ?? 0) > 60, undefined, { timeout: 90_000 })
    await page.keyboard.press('KeyU')
    await page.waitForFunction(() => (window as DiagWindow).__ww2!.impactMarker().on, undefined, { timeout: 10_000 })
    // Bombs aboard on the ground: the sight shows its bare name, which is enough to occupy the badge's place.
    await page.waitForFunction(() => document.querySelector('.ww2-sight-badge') !== null && getComputedStyle(document.querySelector('.ww2-sight-badge')!).display !== 'none', undefined, { timeout: 10_000 })
    const all = await boxes(page)
    const names = all.map((b) => b.name)
    expect(names, 'the instruction and the badge are both visible (else this proves nothing)').toEqual(expect.arrayContaining(['objective', 'sight badge']))
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      expect(hits(all[i]!, all[j]!), `${all[i]!.name} ${JSON.stringify(all[i])} vs ${all[j]!.name} ${JSON.stringify(all[j])}`).toBe(false)
    }
  })
}
