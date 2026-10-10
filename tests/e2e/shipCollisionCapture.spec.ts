import { mkdirSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { spawnUrl, snapshot, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

// Air-to-ship collision (docs/superpowers/plans/2026-10-10-ship-collision.md): the Range Test, the player
// flying level and low into the anchored carrier `ship-zuikaku-cv`, once without God mode (the airplane is
// destroyed and the carrier loses hull points) and once with it (the player bounces and the hull is untouched).
// A capture tool, not a test: skipped unless E2E_CAPTURE=1 (docs/testing.md). Run on the reference GPU.
// Read through `__ww2.aircraft()`, `__ww2.ships()` and `__ww2.combat()`, not the picture.
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/ship-collision'
test.setTimeout(120_000)

const SHIP = { x: -28416, z: -48605 }
const ID = 'ship-zuikaku-cv'

for (const god of [false, true]) {
  test(`range-test: a level low pass into the carrier, ${god ? 'God mode bounces' : 'the airplane is destroyed'}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
    await page.setViewportSize({ width: 1920, height: 1080 })
    // 1,000 ft west of the carrier at 33 ft, heading east at 120 m/s (the DEV spawn always heads east).
    await page.goto(withParams(spawnUrl({ x: SHIP.x - 300, y: 10, z: SHIP.z }), {
      scenario: 'range-test', launch: '1', aircraft: 'f6f-hellcat', loadout: 'clean', cloudTier: 'off', oceanTier: 'high', ...(god ? { god: '1' } : {}),
    }))
    await waitForTerrain(page)
    await page.keyboard.press('Slash')
    const read = () => page.evaluate((id) => {
      const w = (window as DiagWindow).__ww2!
      const me = w.aircraft().find((a) => a.id === 'player-1')!
      return { y: me.y, hp: w.ships().find((s) => s.id === id)!.hp, destroyed: w.combat()?.player.destroyed ?? false }
    }, ID)
    const hp0 = (await read()).hp
    let state = await read()
    let shot = 0
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(250)
      state = await read()
      if (i % 3 === 0 && shot < 4) await page.screenshot({ path: `${OUT}/${god ? 'god' : 'kill'}-${shot++}.png` })
      if (!god && state.destroyed) break
    }
    await page.screenshot({ path: `${OUT}/${god ? 'god' : 'kill'}-end.png` })
    test.info().annotations.push({ type: 'collision', description: `hp ${hp0} -> ${state.hp}, y ${state.y.toFixed(1)}, destroyed ${state.destroyed}` })
    if (god) {
      expect(state.destroyed, 'the God-mode player survives').toBe(false)
      expect(state.hp, 'the hull is untouched').toBe(hp0)
    } else {
      expect(state.destroyed, 'the airplane is destroyed').toBe(true)
      expect(state.hp, 'the carrier lost hull points').toBeLessThan(hp0)
    }
    expect((await snapshot(page)).errors).toEqual([])
    expect(errors).toEqual([])
  })
}
