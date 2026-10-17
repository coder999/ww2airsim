import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { windowsForChapter } from '../../src/campaign/worldStates.js'
import type { DiagWindow } from './harness.js'

// F10A (2026-10-17): the batch's capture sheet for Mark's checkpoint (his viewing is a checkpoint, never a gate; docs/testing.md): per
// chapter an opening still, a mid-mission still and a recovery still. The spawn queries are the DEV overlay's (he heads east when he
// respawns), so the stills show the place, not the approach. The per-key opening stills are scenesCapture.spec.ts's.
// Like the other capture tools, the ordinary suite skips it.
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')

const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/f10a'
type Shot = { readonly chapter: 'A1' | 'A2' | 'A3'; readonly scenario: string; readonly opening: string; readonly mid: readonly [number, number, number]; readonly recovery: readonly [number, number, number] }
const SHOTS: readonly Shot[] = [
  // A1: over the anchorage; astern of the Essex (-10925,-33721, steaming 342)
  { chapter: 'A1', scenario: 'a1-over-the-beaches', opening: 'a1-opening', mid: [-20203, 700, -47437], recovery: [-10700, 160, -32700] },
  // A2: over the Japanese side of the engagement; astern of Casablanca (75814,-78473, steaming 70)
  { chapter: 'A2', scenario: 'a2-taffy-3', opening: 'a2-opening', mid: [67814, 600, -86473], recovery: [75100, 160, -77900] },
  // A3: over the column's south end; four kilometers south of Tacloban's strip, heading north would be ideal (the overlay heads east)
  { chapter: 'A3', scenario: 'a3-the-long-column', opening: 'a3-opening', mid: [-78400, 450, -36500], recovery: [-29666, 300, -43600] },
]
const sites = (chapter: Shot['chapter']): string => Object.entries(windowsForChapter(chapter)).filter(([s]) => ['tacloban', 'dulag', 'landing-beaches'].includes(s)).map(([s, w]) => `${s}:${w}`).join(',')
const tick = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2?.tick() ?? 0)

for (const shot of SHOTS) {
  test(`${shot.chapter}: opening, mid-mission and recovery stills`, async ({ page }) => {
    test.setTimeout(300_000)
    mkdirSync(OUT, { recursive: true })
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)) })
    await page.setViewportSize({ width: 1920, height: 1080 })
    const base = `/?scenario=${shot.scenario}&launch&siteState=${sites(shot.chapter)}`
    await page.goto(`${base}&scene=${shot.opening}`)
    await page.waitForFunction(() => (window as DiagWindow).__ww2?.scene() != null, undefined, { timeout: 90_000 })
    const total = (await page.evaluate(() => (window as DiagWindow).__ww2!.scene()!.ticksLeft))
    await page.waitForFunction((t) => ((window as DiagWindow).__ww2?.scene()?.ticksLeft ?? 0) < t * 0.5, total, { timeout: 60_000 })
    await page.screenshot({ path: `${OUT}/${shot.chapter}-1-opening.png` })
    for (const [name, at] of [['2-mid-mission', shot.mid], ['3-recovery', shot.recovery]] as const) {
      await page.goto(`${base}&spawnX=${at[0]}&spawnY=${at[1]}&spawnZ=${at[2]}`)
      await page.waitForFunction(() => (window as DiagWindow).__ww2?.scenarioId() != null && (window as DiagWindow).__ww2?.tick() != null, undefined, { timeout: 90_000 })
      const t0 = await tick(page)
      await page.waitForFunction((t) => ((window as DiagWindow).__ww2?.tick() ?? 0) > t + 180, t0, { timeout: 60_000 })
      await page.screenshot({ path: `${OUT}/${shot.chapter}-${name}.png` })
    }
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
    expect(errors).toEqual([])
  })
}
