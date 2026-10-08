import { test, expect, type Locator, type Page } from '@playwright/test'
import { debriefDialog, diveToSea, hopClear, waitForScenario, type DiagWindow } from './harness.js'
import { loadScenario } from '../../tools/content/load.js'
import { BINDINGS } from '../../src/input/bindings.js'

/**
 * E2E, M3 and M4: the shipped missions end to end on the reference GPU.
 * Each test picks its mission on Sortie Orders with a new pilot, checks the
 * briefing, launches, checks the objective line, the opening radio call and
 * the chart, then ends the flight its own way and checks the debrief. The
 * nine captures (briefing, chart and debrief per mission) go to the M3
 * handoff for Mark's final look. M4 adds a fourth, Combat Air Patrol, whose
 * three captures go to the M4 handoff.
 *
 * Every expected string is read from the mission's own content file (the
 * situation, the objective labels, the `at: 1` message, the badge), so a
 * content edit cannot leave a stale literal here. The objective-line text
 * follows the format `tests/render/mission/hud.test.ts` pins.
 *
 * None of these flights earns a badge, on purpose: a successful strike or
 * three traps are flown headless (tests/sim/mission/missions/*.test.ts).
 * What only this tier proves is that the shipped files reach the screen.
 */
test.setTimeout(300_000)

type Id = 'deck-quals-mission' | 'airfield-strike' | 'convoy-strike' | 'combat-air-patrol'

const objectiveLine = (page: Page) => page.getByLabel('Objective', { exact: true })
const radioLine = (page: Page) => page.getByRole('status', { name: 'Radio' })
const mission = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.mission())

/** The same new-pilot path to Sortie Orders as mission-ui.spec.ts's. */
async function orders(page: Page, pilot: string): Promise<Locator> {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await title.getByRole('button', { name: 'New pilot' }).click()
  await title.getByPlaceholder('Pilot name').fill(pilot)
  await title.getByRole('button', { name: 'Add' }).click()
  await title.getByRole('button', { name: 'New game' }).click()
  return title
}

/** Every `figureRow` (src/render/ui/navalComms.ts: a div of a label span
 *  and a value strong) under `root`, as [label, value] pairs. Matching the
 *  pair, not a substring, is what makes "Launch is PRIMARY" an assertion:
 *  the situation paragraph also contains "Launch". */
const figureRows = (root: Locator) =>
  root.locator('div:has(> span + strong)').evaluateAll((rows) =>
    rows.map((r) => [r.querySelector(':scope > span')!.textContent ?? '', r.querySelector(':scope > strong')!.textContent ?? '']),
  )

/**
 * Picks the mission, asserts its briefing against the content file, and
 * captures it. The briefing is fetched after the pick (briefingRequest,
 * src/render/mission/briefing.ts), so the first assertion waits for it.
 */
async function briefingFor(page: Page, title: Locator, id: Id, label: string) {
  const s = loadScenario(id)
  await title.getByRole('radiogroup', { name: 'Scenario' }).getByRole('radio', { name: label, exact: true }).check()
  const briefing = title.getByRole('region', { name: 'Briefing' })
  const firstSentence = s.briefing!.situation.split(/(?<=\.) /)[0]!
  await expect(briefing).toContainText(firstSentence)
  await expect(briefing).toContainText('Background')
  await expect(briefing).toContainText('Sources:')
  const rows = await figureRows(briefing)
  for (const o of s.objectives!) {
    expect(rows, `briefing row for ${o.label}`).toContainEqual([o.label, o.priority === 'primary' ? 'PRIMARY' : 'SECONDARY'])
  }
  expect(rows).toContainEqual(['Badge', s.badge!.name])
  await page.screenshot({ path: `test-results/${shot(id, 'briefing')}` })
  return s
}

/** M3's captures are `m3-<id>-<what>.png`; M4's CAP captures are
 *  `m4-cap-<what>.png`, the names its plan and handoff use. */
function shot(id: Id, what: 'briefing' | 'chart' | 'debrief'): string {
  return id === 'combat-air-patrol' ? `m4-cap-${what}.png` : `m3-${id}-${what}.png`
}

/** After Launch: the scenario is live and the entities exist. `atOrdnance`
 *  runs on Form 4, before Launch (the loadout lives there since the sortie forms). */
async function launched(page: Page, title: Locator, id: Id, atOrdnance?: (title: Locator) => Promise<void>) {
  await title.getByRole('button', { name: 'Next' }).click()
  await title.getByRole('button', { name: 'Next' }).click()
  await atOrdnance?.(title)
  await title.getByRole('button', { name: 'Launch' }).click()
  await waitForScenario(page, id)
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 60_000 })
}

/** The `at: 1` trigger's message: the opening radio call. */
function openingCall(s: ReturnType<typeof loadScenario>): string {
  const t = s.triggers!.find((x) => 'at' in x.when && x.when.at === 1)!
  const m = t.then.find((a) => 'message' in a)!
  return (m as { message: string }).message
}

/** The chart (P) lists every objective; captured, then closed. */
async function chartListsObjectives(page: Page, s: ReturnType<typeof loadScenario>, id: Id) {
  await page.keyboard.press(BINDINGS.toggleMissionMap[0])
  const chart = page.getByRole('dialog', { name: 'Navigation chart' })
  const list = chart.getByLabel('Objectives')
  for (const o of s.objectives!) await expect(list).toContainText(o.label)
  await page.screenshot({ path: `test-results/${shot(id, 'chart')}` })
  await page.keyboard.press(BINDINGS.toggleMissionMap[0])
  await expect(chart).toBeHidden()
}

/** The debrief's objective rows and verdict, then the capture. */
async function debriefShows(page: Page, id: Id, expected: readonly (readonly [string, string])[]) {
  const debrief = debriefDialog(page)
  await expect(debrief).toBeVisible()
  const rows = await figureRows(debrief)
  for (const row of expected) expect(rows, `debrief row ${row[0]}`).toContainEqual([...row])
  await page.screenshot({ path: `test-results/${shot(id, 'debrief')}` })
  return rows
}

/**
 * The debrief's reason rows after the verdict (`plainRow`, src/render/debrief.ts:
 * a div with text and no children), in order.
 */
const reasonRows = (debrief: Locator) =>
  debrief.locator('div').evaluateAll((els) =>
    els.filter((e) => e.children.length === 0 && /: (incomplete|failed)$/.test(e.textContent ?? '')).map((e) => e.textContent ?? ''),
  )

/**
 * Airfield Strike ends in a dive, not a landing (controller ruling T8-R2,
 * 2026-09-27). The player parks at Tacloban's runway center with 750 m of
 * strip ahead, and the harness hop overruns it: measured on the reference
 * GPU, it lifts off about 455 m along and comes down about 410 m past the
 * north end, on the beach or in the surf. That ended Ditched, Killed, or a
 * crash before the wheels took weight (`landAndStop`'s "never came back
 * down"), so a `landAndStop` ending was flaky. A real recovery at Tacloban,
 * with the hangars standing, is flown headless in
 * tests/sim/mission/missions/airfield-strike.test.ts. This test keeps
 * `hopClear` so that the takeoff objective completes, then `diveToSea`.
 */
test('Airfield Strike: briefing, TAKE OFF · HANGARS 0/2, tower call, chart; take off, then into the ground earns no badge', async ({ page }) => {
  const id = 'airfield-strike'
  const title = await orders(page, 'Airfield Strike Pilot')
  const s = await briefingFor(page, title, id, 'Airfield Strike')
  await launched(page, title, id, async (t) => {
    await expect(t.getByRole('radiogroup', { name: 'Loadout' }).getByRole('radio', { name: 'Both' })).toHaveAttribute('aria-checked', 'true')
  })
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.supportedContact()), { timeout: 20_000 }).toBe(true)

  await expect(objectiveLine(page)).toHaveText('TAKE OFF · HANGARS 0/2')
  await expect(radioLine(page)).toHaveText(openingCall(s), { timeout: 10_000 })
  await chartListsObjectives(page, s, id)

  await hopClear(page)
  await expect(objectiveLine(page)).toHaveText('HANGARS 0/2')
  await diveToSea(page)
  await page.keyboard.up(BINDINGS.throttleUp[0])
  await debriefShows(page, id, [
    ['Take off', 'COMPLETE'],
    ['Hangars', 'INCOMPLETE'],
    ['AAA (secondary)', 'INCOMPLETE'],
    ['Recover', 'INCOMPLETE'],
    ['Badge', 'Killed — no badge'],
  ])
  expect(await reasonRows(debriefDialog(page))).toEqual(['Hangars: incomplete', 'Recover: incomplete'])
})

test('Convoy Strike: briefing, CONVOY 0/2, the vector call, chart; into the sea earns no badge', async ({ page }) => {
  const id = 'convoy-strike'
  const title = await orders(page, 'Convoy Strike Pilot')
  const s = await briefingFor(page, title, id, 'Convoy Strike')
  await launched(page, title, id)

  await expect(objectiveLine(page)).toHaveText('CONVOY 0/2')
  await expect(radioLine(page)).toHaveText(openingCall(s), { timeout: 10_000 })
  await chartListsObjectives(page, s, id)

  await diveToSea(page)
  await debriefShows(page, id, [
    ['Convoy', 'INCOMPLETE'],
    ['Whole convoy (secondary)', 'INCOMPLETE'],
    ['Recover', 'INCOMPLETE'],
    // A steep dive is a crash, not a ditching (harness.ts, diveToSea).
    ['Badge', 'Killed — no badge'],
  ])
})

test('Carrier Qualification: briefing, LAUNCH, Paddles call, chart; a deck run to DOWNWIND, then into the sea', async ({ page }) => {
  const id = 'deck-quals-mission'
  const title = await orders(page, 'Carrier Qual Pilot')
  const s = await briefingFor(page, title, id, 'Carrier Qualification')
  await launched(page, title, id)
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.supportedContact()), { timeout: 20_000 }).toBe(true)
  expect((await page.evaluate(() => (window as DiagWindow).__ww2!.deck()))?.shipId).toBe('cv-1')

  await expect(objectiveLine(page)).toHaveText('LAUNCH')
  await expect(radioLine(page)).toHaveText(openingCall(s), { timeout: 10_000 })
  await chartListsObjectives(page, s, id)

  // The Measured deck run (globals.md): flaps down, full throttle, rotate
  // well along the deck -- deckQuals.spec.ts's timing, 241 m from the bow.
  await page.keyboard.press(BINDINGS.toggleFlaps[0])
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.controls().flapDown)).toBe(true)
  await page.keyboard.down(BINDINGS.throttleUp[0])
  await page.waitForTimeout(9000)
  await page.keyboard.down(BINDINGS.pitchUp[0])
  await page.waitForTimeout(1200)
  await page.keyboard.up(BINDINGS.pitchUp[0])
  await page.waitForFunction(
    () => ((window as DiagWindow).__ww2!.mission()?.log ?? []).some((e) => e.kind === 'objective' && e.id === 'up' && e.status === 'complete'),
    undefined,
    { timeout: 30_000 },
  )
  expect((await mission(page))!.log.some((e) => e.kind === 'objective' && e.id === 'up' && e.status === 'complete')).toBe(true)
  await expect(objectiveLine(page)).toHaveText('DOWNWIND')

  await diveToSea(page)
  await page.keyboard.up(BINDINGS.throttleUp[0])
  await debriefShows(page, id, [
    ['Launch', 'COMPLETE'],
    ['Downwind', 'INCOMPLETE'],
    ['Trap', 'INCOMPLETE'],
    ['Badge', 'Killed — no badge'],
  ])
})

/** A trigger's radio message, by trigger id, from the content file. */
function triggerCall(s: ReturnType<typeof loadScenario>, id: string): string {
  const t = s.triggers!.find((x) => x.id === id)!
  const m = t.then.find((a) => 'message' in a)!
  return (m as { message: string }).message
}

/**
 * M4 Task 2: Combat Air Patrol starts airborne on station (M4-R1), so there
 * is no takeoff: the hold counts from the first ticks. The objective line
 * follows `objectiveLineLabel`'s hold format, `CAP STATION 45/180 S`
 * (tests/render/mission/hud.test.ts), built here from the content's label
 * and seconds. Wave 1 spawns at 60 s (its `at` trigger), so this test waits
 * for it in real time, checks that only its two raiders are drawn, and that
 * the chart marks them as targets. A steep dive is a crash, not a ditching
 * (M3 T8-D1, controller ruling M4-PF3), so the badge row reads Killed. The
 * hold may or may not have finished by the dive, so the CAP station row is
 * asserted to be one of the two stamps, not a fixed one.
 */
test('Combat Air Patrol: briefing, CAP STATION n/180 S, CIC call, wave 1 spawns and is charted; into the sea earns no badge', async ({ page }) => {
  const id = 'combat-air-patrol'
  const title = await orders(page, 'Combat Air Patrol Pilot')
  const s = await briefingFor(page, title, id, 'Combat Air Patrol')
  await launched(page, title, id)

  const station = s.objectives!.find((o) => o.id === 'station')!
  if (station.kind !== 'hold') throw new Error(`station is a ${station.kind}, not a hold`)
  const holdLine = new RegExp(`^${station.label.toUpperCase()} (\\d+)/${station.seconds} S$`)
  await expect(objectiveLine(page)).toHaveText(holdLine)
  await expect(radioLine(page)).toHaveText(openingCall(s), { timeout: 10_000 })
  // The hold is counting on screen, not just shown at 0.
  await expect.poll(async () => Number(holdLine.exec((await objectiveLine(page).textContent()) ?? '')?.[1] ?? -1), { timeout: 20_000 }).toBeGreaterThan(0)

  await expect.poll(async () => (await mission(page))!.spawned, { timeout: 90_000 }).toEqual(['wave-1'])
  const meshes = (await mission(page))!.meshes
  expect(meshes).toContainEqual({ id: 'raid-1', visible: true })
  expect(meshes).toContainEqual({ id: 'raid-2', visible: true })
  expect(meshes).toContainEqual({ id: 'raid-3', visible: false })
  expect(meshes).toContainEqual({ id: 'raid-4', visible: false })
  await expect(radioLine(page)).toHaveText(triggerCall(s, 'wave-1'), { timeout: 10_000 })

  // The chart: every objective listed, wave 1's raiders marked as targets
  // (a `destroy`/`deny` mark makes an aircraft a clickable destination,
  // missionMap.ts), wave 2's not on it at all yet.
  await page.keyboard.press(BINDINGS.toggleMissionMap[0])
  const chart = page.getByRole('dialog', { name: 'Navigation chart' })
  const list = chart.getByLabel('Objectives')
  for (const o of s.objectives!) await expect(list).toContainText(o.label)
  for (const raider of ['raid-1', 'raid-2']) {
    await expect(chart.getByRole('button', { name: `Set ${raider} as navigation destination`, exact: true })).toBeVisible()
  }
  for (const raider of ['raid-3', 'raid-4']) {
    await expect(chart.getByRole('button', { name: `Set ${raider} as navigation destination`, exact: true })).toHaveCount(0)
  }
  await page.screenshot({ path: `test-results/${shot(id, 'chart')}` })
  await page.keyboard.press(BINDINGS.toggleMissionMap[0])
  await expect(chart).toBeHidden()

  await diveToSea(page)
  const rows = await debriefShows(page, id, [['Badge', 'Killed — no badge']])
  const cap = rows.filter(([label]) => label === station.label)
  expect(cap, 'one CAP station row').toHaveLength(1)
  expect(['COMPLETE', 'INCOMPLETE']).toContain(cap[0]![1])
})
