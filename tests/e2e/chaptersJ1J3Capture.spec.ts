import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { waitForScenario, type DiagWindow } from './harness.js'

// F10C viewing checkpoint (Mark's viewing is a checkpoint, never a gate): a mid-mission and a recovery still for J1, J2 and J3, taken with the
// DEV respawn (`?spawnX=&spawnY=&spawnZ=`, heading east) at fixed world points. The openings are shot by scenesCapture.spec.ts (one still per
// camera key of every scene). Needs a real window for pixels: the ryzen console or RDP route (docs/testing.md); the session-0 route draws a blank
// canvas. The ordinary suite skips it. Run: npm run capture:e2e -- chaptersJ1J3Capture
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')

const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/chapters-j1-j3'
/** Buri (-41025,-22005) heading 80; Bayug (-45100,-20700) heading 0; the beaches' shipping near (-26300,-40250); the J2 gate (-46500,-41000). */
const SHOTS = [
  { id: 'j1-mid', scenario: 'j1-defend-the-fields', at: [-37000, 800, -22000], waitS: 135, why: '4 km east of Buri, after the first wave has spawned (120 s)' },
  { id: 'j1-recovery', scenario: 'j1-defend-the-fields', at: [-42995, 120, -21658], waitS: 4, why: 'on the approach to Buri, 2,000 m west of the runway center' },
  { id: 'j2-mid', scenario: 'j2-break-the-landing', at: [-26300, 400, -40250], waitS: 4, why: 'over the invasion shipping and the shuttling LCVPs' },
  { id: 'j2-recovery', scenario: 'j2-break-the-landing', at: [-46500, 1500, -41000], waitS: 4, why: 'at the western egress gate' },
  { id: 'j3-mid', scenario: 'j3-road-to-burauen', at: [-45300, 250, -21320], waitS: 4, why: 'over the head of the road column' },
  { id: 'j3-recovery', scenario: 'j3-road-to-burauen', at: [-45100, 120, -18700], waitS: 4, why: 'south of Bayug, 2,000 m from the strip' },
] as const

for (const shot of SHOTS) {
  test(`${shot.id}: ${shot.why}`, async ({ page }) => {
    test.setTimeout(shot.waitS * 1000 + 180_000)
    mkdirSync(OUT, { recursive: true })
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)) })
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto(`/?scenario=${shot.scenario}&launch&spawnX=${shot.at[0]}&spawnY=${shot.at[1]}&spawnZ=${shot.at[2]}`)
    await waitForScenario(page, shot.scenario)
    await page.waitForFunction((s) => ((window as DiagWindow).__ww2?.tick() ?? 0) > s * 60, shot.waitS, { timeout: shot.waitS * 1000 + 120_000 })
    await page.screenshot({ path: `${OUT}/${shot.id}.png` })
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
    expect(errors).toEqual([])
  })
}
