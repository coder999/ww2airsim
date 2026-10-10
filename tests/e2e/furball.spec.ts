import { test, expect, type Page } from '@playwright/test'
import { percentile, waitForTerrain, type DiagWindow, recordFrameTime } from './harness.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'

/**
 * E2E, Plan 7e (AI 7c spec §4.7): `furball-range` in the shipped app on the
 * reference GPU. What only this tier proves: six airframes on two sides flown
 * by five choosing pilots through the real frame loop, an AI hitting an AI on the
 * other side (not merely firing), with every airframe in the world. Since damage
 * stages round 2 (fighters 4x tougher, 2026-10-09) no AI-on-AI kill happens this
 * early, as in Deterministic's soak (`tests/sim/ai/furball.test.ts`); AI-on-AI
 * kills are pinned in the longer duels, `tests/sim/ai/gunnery.test.ts`.
 */
const FURBALL = `/?${SCENARIO_PARAM}=furball-range`

test.setTimeout(300_000)

const aircraft = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.aircraft())
const combat = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!)

/** Damaged AI aircraft whose last hit (`lastHitBy`) came from an AI on the other side. */
async function aiOnAiHits(page: Page): Promise<{ victim: string; by: string; structure: number }[]> {
  const [rows, c] = await Promise.all([aircraft(page), combat(page)])
  const byId = new Map(rows.map((r) => [r.id, r]))
  return c.aircraft.flatMap((r) => {
    const victim = byId.get(r.id)
    const by = r.lastHitBy === null ? undefined : byId.get(r.lastHitBy)
    return r.structure < 1 && victim?.mode != null && by?.mode != null && by.side !== victim.side
      ? [{ victim: r.id, by: by.id, structure: r.structure }] : []
  })
}

test('furball-range: an AI hits an AI on the other side, sides respected, zero validation errors', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(FURBALL)
  await waitForTerrain(page)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())

  const rows = await aircraft(page)
  expect(rows.map((r) => r.id).sort()).toEqual(['ally-1', 'bandit-1', 'bandit-2', 'bandit-3', 'bandit-4', 'f6f-1'])
  expect(Object.fromEntries(rows.map((r) => [r.id, r.side]))).toEqual({
    'f6f-1': 'allied', 'ally-1': 'allied', 'bandit-1': 'axis', 'bandit-2': 'axis', 'bandit-3': 'axis', 'bandit-4': 'axis',
  })

  await expect
    .poll(() => aiOnAiHits(page).then((h) => h.length), { timeout: 60_000, message: 'no AI hit an AI on the other side' })
    .toBeGreaterThan(0)
  console.log(`furball: AI-on-AI hits ${JSON.stringify(await aiOnAiHits(page))}`)
  await page.screenshot({ path: 'test-results/furball-hit.png' })

  // Keep flying for the frame-time sample, and read every pilot's choice: no AI ever
  // targets its own side.
  for (let i = 0; i < 20; i++) {
    const now = await aircraft(page)
    const side = new Map(now.map((r) => [r.id, r.side]))
    for (const r of now) {
      if (r.targetId !== null) expect(side.get(r.targetId), `${r.id} targets ${r.targetId}`).not.toBe(r.side)
    }
    await page.waitForTimeout(1_000)
  }
  const c = await combat(page)
  for (const r of c.aircraft) expect(r.friendlyKills, `${r.id} teamkilled`).toBe(0)
  await page.screenshot({ path: 'test-results/furball-late.png' })

  const live = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { gpu: d.gpuFrameTimesMs(), errors: d.validationErrors }
  })
  expect(live.errors, `WebGPU validation errors:\n${JSON.stringify(live.errors, null, 2)}`).toEqual([])
  expect(live.gpu.length).toBeGreaterThan(120)
  const p95 = percentile(live.gpu, 0.95)
  console.log(`furball: gpu p95 ${p95.toFixed(3)} ms over ${live.gpu.length} samples`)
  recordFrameTime(p95)
})
