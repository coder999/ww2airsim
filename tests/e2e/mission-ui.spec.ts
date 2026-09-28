import { test, expect, type Locator, type Page } from '@playwright/test'
import { debriefDialog, hopClear, landAndStop, waitForScenario, type DiagWindow } from './harness.js'
import { loadScenario } from '../../tools/content/load.js'

/**
 * Tier 2, M2: the mission UI end to end on the reference GPU, against the
 * DEV fixtures (content/scenarios/dev-mission-*.json; M2 open question 1).
 * Real physics throughout: the takeoff and landings are hopClear/landAndStop's
 * measured hop (dossier.spec.ts, meta-game.spec.ts). From the gunnery spot,
 * 300 m south of the runway center, that hop touches down about 40 m past the
 * strip's north end -- an off-field landing, which completes no `land`
 * objective. So the fixtures park the player at 700 m south, 50 m inside the
 * south threshold (measured on the reference GPU 2026-09-26).
 */
test.setTimeout(300_000)
/** The fixture's wind as the briefing formats it: the fixture's own weather,
 *  through the briefing's own `conditionsFor` -- run in the page, because
 *  briefing.ts imports CSS through navalComms and Playwright's Node loader
 *  cannot, while the dev server serves the module as-is. So a change to the
 *  fixture's weather cannot leave a stale literal here. The fixtures are calm
 *  (ruling T8-R1, measured on the reference GPU 2026-09-26): a 12 kt
 *  crosswind from 090 weathervaned the takeoff roll off the runway into the
 *  sea, and the same wind as a pure headwind (from 000, down the strip) kept
 *  the hop from coming back down inside the harness's landing window. */
const fixtureWind = (page: Page) =>
  page.evaluate(async ([url, weather]) => {
    const { conditionsFor } = (await import(/* @vite-ignore */ url)) as typeof import('../../src/render/mission/briefing.js')
    return conditionsFor(weather).find((c) => c.label === 'Wind')!.value
  }, ['/src/render/mission/briefing.ts', loadScenario('dev-mission-ui').weather] as const)
/**
 * The hop is measured at the default loadout, Both (meta-game.spec.ts,
 * dossier.spec.ts). The fixtures recommend Clean, and a clean airplane is
 * light enough that the same hop balloons to 60-84 m and never comes back
 * down in the harness's window (measured on the reference GPU 2026-09-26).
 * So each test first proves the recommendation was applied, then changes it
 * (spec §3: "preselected and changeable") and flies with Both. Since the
 * sortie forms the loadout is on Form 4, so this walks there and launches.
 */
async function flyWithBoth(title: Locator) {
  await title.getByRole('button', { name: 'Next' }).click()
  await title.getByRole('button', { name: 'Next' }).click()
  const loadout = title.getByRole('radiogroup', { name: 'Loadout' })
  await expect(loadout.getByRole('radio', { name: 'Clean (recommended)' })).toHaveAttribute('aria-checked', 'true')
  await loadout.getByRole('radio', { name: 'Both' }).check()
  await expect(loadout.getByRole('radio', { name: 'Both' })).toHaveAttribute('aria-checked', 'true')
  await title.getByRole('button', { name: 'Launch' }).click()
}

/** Exact: the chart's objectives list is labeled `Objectives`, and a
 *  substring match would take both (a strict-mode violation). */
const objectiveLine = (page: Page) => page.getByLabel('Objective', { exact: true })
const mission = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.mission())

async function orders(page: Page, pilot: string) {
  await page.setViewportSize({ width: 2560, height: 1440 })
  // The fixtures are Dev-only (sortie spec A1); `recordDevSorties` (SF-R6)
  // keeps the badge and Dossier this spec proves.
  await page.goto('/?recordDevSorties')
  const title = page.getByRole('dialog', { name: 'Title' })
  await title.getByRole('button', { name: 'New pilot' }).click()
  await title.getByPlaceholder('Pilot name').fill(pilot)
  await title.getByRole('button', { name: 'Add' }).click()
  await title.getByRole('checkbox', { name: 'Dev — unlocks everything' }).check()
  await title.getByRole('button', { name: 'New game' }).click()
  return title
}

async function onStrip(page: Page, id: string) {
  await waitForScenario(page, id)
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 60_000 })
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.supportedContact()), { timeout: 20_000 }).toBe(true)
}

/**
 * Neither M2 element overlaps any other visible HUD element (open question
 * 2). The HUD is `#app`'s fixed-position children (main.ts's `root`), not
 * `body`'s (controller ruling PF2), and both M2 elements must be found and
 * visible first -- otherwise the loop below has nothing to compare and
 * passes vacuously. An empty (zero-area) element draws nothing, so it cannot
 * be overlapped.
 */
async function expectNoHudOverlap(page: Page) {
  const boxes = await page.evaluate(() => {
    const els = [...document.querySelectorAll<HTMLElement>('#app > *')].filter((e) => {
      const s = getComputedStyle(e)
      const r = e.getBoundingClientRect()
      return s.position === 'fixed' && s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 && r.width < innerWidth
    })
    return els.map((e) => ({ name: e.getAttribute('aria-label') ?? e.textContent?.slice(0, 20) ?? '', r: e.getBoundingClientRect().toJSON() as DOMRect }))
  })
  const mine = boxes.filter((b) => b.name === 'Objective' || b.name === 'Radio')
  expect(mine.map((b) => b.name).sort(), 'both M2 HUD elements are shown').toEqual(['Objective', 'Radio'])
  for (const a of mine) for (const b of boxes) {
    if (a === b) continue
    const hit = a.r.left < b.r.right && b.r.left < a.r.right && a.r.top < b.r.bottom && b.r.top < a.r.bottom
    expect(hit, `${a.name} overlaps ${b.name}`).toBe(false)
  }
}

test('briefing, objective line, radio line, held-group spawn, chart, debrief, badge, stamp and dossier', async ({ page }) => {
  const title = await orders(page, 'Mission UI Pilot')
  const scenario = title.getByRole('radiogroup', { name: 'Scenario' })
  await expect(scenario).toContainText('Missions')
  await expect(scenario).toContainText('Ranges')
  await scenario.getByRole('radio', { name: 'UI Fixture (dev)' }).check()
  const briefing = title.getByRole('region', { name: 'Briefing' })
  await expect(briefing).toContainText('DEV FIXTURE. Take off from Tacloban')
  for (const text of ['PRIMARY', 'Take off', 'Recover', 'SECONDARY', 'Target', '1400 local', await fixtureWind(page), 'Clear', 'UI Fixture Wings (dev)']) {
    await expect(briefing).toContainText(text)
  }
  await page.screenshot({ path: 'test-results/m2-briefing.png' })
  await flyWithBoth(title)
  await onStrip(page, 'dev-mission-ui')

  await expect(objectiveLine(page)).toHaveText('TAKE OFF')
  await expect(page.getByRole('status', { name: 'Radio' })).toHaveText('Tower: cleared for takeoff.', { timeout: 10_000 })
  expect((await mission(page))!.meshes).toEqual([{ id: 'drone-1', visible: false }])
  // Open question 2 promised both common desktop sizes (controller ruling PF3).
  await expectNoHudOverlap(page)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await expectNoHudOverlap(page)
  await page.setViewportSize({ width: 2560, height: 1440 })

  // Chart: objectives listed; the objective target is clickable for a course.
  await page.keyboard.press('KeyP')
  const chart = page.getByRole('dialog', { name: 'Navigation chart' })
  await expect(chart.getByLabel('Objectives')).toContainText('Take off')
  await expect(chart.getByLabel('Objectives')).toContainText('ACTIVE')
  await expect(chart.getByLabel('Objectives')).toContainText('PENDING')
  await chart.getByRole('button', { name: 'Set target-1 as navigation destination' }).click()
  await expect(chart).toContainText('Course')
  await page.screenshot({ path: 'test-results/m2-chart.png' })
  await page.keyboard.press('KeyP')
  await expect(chart).toBeHidden()

  await hopClear(page)
  await expect.poll(async () => (await mission(page))!.spawned, { timeout: 10_000 }).toEqual(['drone'])
  expect((await mission(page))!.meshes).toEqual([{ id: 'drone-1', visible: true }])
  await expect(objectiveLine(page)).toHaveText('RECOVER')
  await expect(page.getByRole('status', { name: 'Radio' })).toHaveText('Tower: a friendly is passing overhead.', { timeout: 15_000 })
  await page.screenshot({ path: 'test-results/m2-airborne.png' })

  await landAndStop(page, 'debrief')
  const debrief = debriefDialog(page)
  for (const text of ['Objectives', 'Take off', 'COMPLETE', 'Target (secondary)', 'INCOMPLETE', 'BADGE AWARDED: UI Fixture Wings (dev)']) {
    await expect(debrief).toContainText(text)
  }
  await page.screenshot({ path: 'test-results/m2-debrief.png' })

  await debrief.getByRole('button', { name: 'Return to title' }).click()
  await title.locator('button[aria-pressed]').first().click()
  await title.getByRole('button', { name: 'New game' }).click()
  await expect(title.getByRole('radiogroup', { name: 'Scenario' }).getByRole('radio', { name: 'UI Fixture (dev)' })).toContainText('AWARDED')
  await title.getByRole('button', { name: 'Back' }).click()
  await title.getByRole('button', { name: 'Dossier: Mission UI Pilot' }).click()
  await expect(page.getByRole('dialog', { name: 'Dossier: Mission UI Pilot' })).toContainText('UI Fixture Wings (dev)')
})

test('an intermediate landing shows on the radio line and the flight continues (spec §2.4)', async ({ page }) => {
  const title = await orders(page, 'Circuit Pilot')
  await title.getByRole('radiogroup', { name: 'Scenario' }).getByRole('radio', { name: 'Circuit Fixture (dev)' }).check()
  await flyWithBoth(title)
  await onStrip(page, 'dev-mission-circuit')
  await expect(objectiveLine(page)).toHaveText('CIRCUIT 0/2')

  await hopClear(page)
  await landAndStop(page, 'stopped')
  await expect(page.getByRole('status', { name: 'Radio' })).toHaveText('Circuit 1 of 2')
  await expect(objectiveLine(page)).toHaveText('CIRCUIT 1/2')
  const t0 = await page.evaluate(() => (window as DiagWindow).__ww2!.tick())
  await page.waitForTimeout(3000)
  await expect(debriefDialog(page)).toBeHidden()
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.tick()), 'the flight paused').toBeGreaterThan(t0)
  await page.screenshot({ path: 'test-results/m2-intermediate.png' })
})
