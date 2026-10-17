import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { parseScene } from '../../src/sim/scene/schema.js'
import type { DiagWindow } from './harness.js'
import { windowsForChapter } from '../../src/campaign/worldStates.js'

// F9 Task 8: a still at each camera keyframe of every shipped scene, for Mark's review (his viewing is a checkpoint, never a
// gate; docs/testing.md). Opens each scene in director mode and selects the keys, so it shoots exactly what the author sees.
// Like the other capture tools, the ordinary suite skips it.
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')

const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/scenes'
const dir = new URL('../../content/scenes/', import.meta.url)
const scenes = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => parseScene(JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as unknown))

/** F10A (2026-10-17): a chapter scene is shot in the windows its chapter is played in (A3's Tacloban landing is refused in the default window), for the sites its scenario names. */
const siteQuery = (scene: (typeof scenes)[number]): string => {
  if (scene.id.startsWith('demo-')) return ''
  const named = (JSON.parse(readFileSync(new URL(`../../content/scenarios/${scene.world.scenario}.json`, import.meta.url), 'utf8')) as { sites?: string[] }).sites ?? []
  const windows = windowsForChapter(scene.chapter)
  return named.length === 0 ? '' : `&siteState=${named.map((s) => `${s}:${windows[s]}`).join(',')}`
}

for (const scene of scenes) {
  test(`${scene.id}: one still per camera key`, async ({ page }) => {
    test.setTimeout(180_000)
    mkdirSync(OUT, { recursive: true })
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)) })
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto(`/?scenario=${scene.world.scenario}&launch&director=${scene.id}${siteQuery(scene)}`)
    const bar = page.locator('[data-director]')
    await expect(bar).toBeVisible({ timeout: 90_000 })
    for (const [i, key] of scene.camera.entries()) {
      await bar.locator('.director-key').nth(i).click()
      // the world catches up to the bar at up to 120 ticks a frame
      await page.waitForTimeout(1500 + key.t * 80)
      await bar.evaluate((el) => { (el as HTMLElement).style.visibility = 'hidden' })
      await page.screenshot({ path: `${OUT}/${scene.id}-${String(i + 1).padStart(2, '0')}-t${key.t.toFixed(1)}.png` })
      await bar.evaluate((el) => { (el as HTMLElement).style.visibility = '' })
    }
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
    expect(errors).toEqual([])
  })
}
