import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { waitForTerrain, type DiagWindow } from './harness.js'

// Final unattended L1/L2 checkpoint: deterministic A/B frames for Mark to
// inspect after the run. Correctness still belongs to the ordinary specs.
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/l1-l2'

const captures = [
  // Low, straight-east pass toward Tacloban's hangars. Keeping z aligned
  // with hangar 1 makes the material A/B legible instead of hiding the
  // buildings beneath the chase aircraft in the generic base overview.
  { name: 'airfield-legacy', url: '/?spawnX=-30600&spawnY=150&spawnZ=-47755&sceneryView=1&sceneryTextures=off&treeCrowns=legacy' },
  { name: 'airfield-l1', url: '/?spawnX=-30600&spawnY=150&spawnZ=-47755&sceneryView=1&sceneryTextures=on&treeCrowns=clusters' },
  { name: 'jungle-legacy', url: '/?spawnX=-40900&spawnY=260&spawnZ=-30666&sceneryView=1&sceneryTextures=off&treeCrowns=legacy' },
  { name: 'jungle-l1', url: '/?spawnX=-40900&spawnY=260&spawnZ=-30666&sceneryView=1&sceneryTextures=on&treeCrowns=clusters' },
  { name: 'shore-static', url: '/?spawnX=-24317&spawnY=600&spawnZ=-54383&sceneryView=1&shoreFx=off' },
  { name: 'shore-l2-phase-0', url: '/?spawnX=-24317&spawnY=600&spawnZ=-54383&sceneryView=1&shoreFx=on&shoreTime=0' },
  { name: 'shore-l2-phase-1', url: '/?spawnX=-24317&spawnY=600&spawnZ=-54383&sceneryView=1&shoreFx=on&shoreTime=1.5' },
] as const

for (const capture of captures) test(capture.name, async ({ page }) => {
  test.setTimeout(120_000)
  mkdirSync(OUT, { recursive: true })
  const errors: string[] = []
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text().slice(0, 400)) })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(capture.url)
  await waitForTerrain(page)
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/${capture.name}.png` })
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
  expect(errors).toEqual([])
})
