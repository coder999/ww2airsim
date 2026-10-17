import { expect, test, type Page } from '@playwright/test'
import { waitForScenario, type DiagWindow } from './harness.js'

/**
 * F10E (2026-10-17): the two finales through Headquarters. A fixture campaign standing at the chapter (every earlier chapter done, a Captain on the roster)
 * is imported through the real Import button; the finale is picked, the pilot assigned, the three launch memos answered and Launch pressed. Correctness only:
 * the chapter's opening scene plays on its own scenario, Esc skips it to the handoff, the flight is live in the chapter's site windows with the locked
 * populations present, and the campaign holds a pending sortie for the chapter. (The finale's cost is `finaleBudget.spec.ts`.)
 */
test.setTimeout(240_000)

const hqOf = (page: Page) => page.getByRole('dialog', { name: 'Headquarters' })
const titleOf = (page: Page) => page.getByRole('dialog', { name: 'Title' })
const campaign = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2?.campaign() ?? null)

/** A campaign standing at `chapter`: the earlier chapters done and a Captain in slot 0, built through the real reducers in the page and exported. */
async function standingAt(page: Page, faction: 'us' | 'ja', chapter: string): Promise<string> {
  return page.evaluate(async ([f, c]) => {
    const load = (url: string): Promise<any> => import(/* @vite-ignore */ url) // eslint-disable-line @typescript-eslint/no-explicit-any
    const core = await load('/src/campaign/index.ts')
    const fx = await load('/tests/fixtures/campaign.ts')
    const base = fx.raisePilotTo(fx.makeCampaign({ faction: f, tiers: [6, 6, 6, 6, 6], id: 'fx-finale' }), 0, core.PILOT_TIER_POINTS[5])
    const order = core.chaptersOf(f) as string[]
    return core.exportCampaign({ ...base, progress: { ...base.progress, completed: order.slice(0, order.indexOf(c)) } }) as string
  }, [faction, chapter] as const)
}

for (const f of [
  { faction: 'us' as const, chapter: 'A6', title: 'Battle for the Airfields', scenario: 'a6-battle-for-the-airfields', scene: 'a6-opening', home: 'tacloban', aircraft: ['p-38-lightning'] },
  { faction: 'ja' as const, chapter: 'J6', title: 'Operation Te-Go', scenario: 'j6-operation-te-go', scene: 'j6-opening', home: 'buri', aircraft: ['ki-43-oscar', 'a6m2-zero'] },
]) {
  test(`${f.chapter} ${f.title}: from Headquarters, the opening plays on its own scenario, skips to the handoff, and the finale population is in the air`, async ({ page }) => {
    await page.goto('/?hq')
    const hq = hqOf(page)
    await hq.waitFor({ timeout: 60_000 })
    const text = await standingAt(page, f.faction, f.chapter)
    const chooser = page.waitForEvent('filechooser')
    await hq.getByRole('button', { name: 'Import campaign' }).click()
    await (await chooser).setFiles({ name: 'fx.json', mimeType: 'application/json', buffer: Buffer.from(text) })
    await hq.getByRole('button', { name: /^Open Fixture/ }).click()
    await hq.getByText('Air Group Headquarters').waitFor()

    await hq.getByRole('button', { name: /Choose a mission/ }).click()
    await hq.getByRole('radio', { name: new RegExp(f.title) }).first().click()
    await hq.getByRole('button', { name: /Next: assign a pilot/ }).click()
    await hq.getByRole('button', { name: /^Assign / }).first().click()
    const title = titleOf(page)
    await title.getByRole('button', { name: 'Next' }).first().click()
    await title.getByRole('button', { name: 'Next' }).first().click()
    await title.getByRole('button', { name: 'Launch' }).click()

    // the opening plays on the chapter's own world
    await page.waitForFunction(() => (window as DiagWindow).__ww2?.scene() != null, undefined, { timeout: 120_000 })
    expect((await page.evaluate(() => (window as DiagWindow).__ww2!.scene()))?.id).toBe(f.scene)
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => (window as DiagWindow).__ww2?.scene() == null, undefined, { timeout: 10_000 })
    await waitForScenario(page, f.scenario)
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.tick())).toBeGreaterThanOrEqual(1200) // the 20 s pre-roll is behind us

    const c = await campaign(page)
    expect(c?.pending).toMatchObject({ missionId: f.scenario, chapterId: f.chapter })
    // the locked population is in play: the start set now, the held groups after their triggers (a minute on)
    const counts = await page.evaluate(() => (window as DiagWindow).__ww2!.entityCounts())
    expect(counts.ships).toBe(10)
    expect(counts.aircraft).toBeGreaterThanOrEqual(12)
    await page.waitForFunction(() => ((window as DiagWindow).__ww2?.entityCounts().aircraft ?? 0) >= 24, undefined, { timeout: 120_000 })
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.siteScenery().map((s) => s.airfield))).toContain(f.home)
  })
}
