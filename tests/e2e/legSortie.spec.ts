import { expect, test, type Page } from '@playwright/test'
import { debriefDialog, hopClear, landAndStop, quickLaunch, startCampaignGame, startGame, waitForScenario, type DiagWindow } from './harness.js'

/**
 * F5C (2026-10-16): multi-leg sorties in a real browser. A full stop at a friendly base raises the stop card (Continue
 * Sortie / End Sortie and a loadout choice) instead of ending the sortie; Continue refuels, rearms and repositions the
 * same aircraft with no clock jump; the next landing banks again; End Sortie closes the one log entry with its legs
 * inside. State is read from `__ww2`, never from pixels. The captures for the handoff are `legCapture.spec.ts`.
 */
test.setTimeout(300_000)

const campaign = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2?.campaign() ?? null)
const tick = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.tick())
const hqOf = (page: Page) => page.getByRole('dialog', { name: 'Headquarters' })

test('a scored hop: the landing banks a leg and raises the stop card; Continue repositions with no clock jump; a second landing banks again; End Sortie closes one entry with both legs', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  // A scored mission with the player parked on Tacloban's runway; the hop kills nothing, so each leg banks zero points.
  await startCampaignGame(page, { scenario: 'Airfield Strike' })
  await waitForScenario(page, 'airfield-strike')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 60_000 })
  const launched = await campaign(page)
  expect(launched?.pending).toMatchObject({ missionId: 'airfield-strike', legs: [], bankedPoints: 0 })

  await hopClear(page)
  await landAndStop(page, 'debrief')
  const card = debriefDialog(page)
  // The landing is a leg, not the end of the sortie (D2): the card offers both, and no Restart.
  await expect(card).toContainText('Stopped at Tacloban')
  await expect(card).toContainText('Campaign Ledger')
  await expect(card).toContainText('This landing (first)')
  await expect(card.getByRole('button', { name: 'Continue Sortie' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'End Sortie' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Restart' })).toHaveCount(0)
  await expect(card.getByRole('button', { name: 'Return to Headquarters' })).toHaveCount(0)
  const loadouts = card.getByRole('radiogroup', { name: 'Loadout for the next leg' })
  await expect(loadouts.getByRole('radio', { name: 'Both' })).toHaveAttribute('aria-checked', 'true') // the flown loadout
  await page.screenshot({ path: 'test-results/f5c-stop-card.png' })
  // Banked at the landing and the sortie is still open (D4): the denominator ticked once, at launch.
  const banked = await campaign(page)
  expect(banked?.pending?.legs).toEqual([{ place: 'Tacloban', points: 0 }])
  expect(banked?.human).toMatchObject({ sorties: 1, banked: 0 })

  // Continue with a new loadout: repositioned at the threshold, engine running, rearmed, and the clock did not jump.
  await loadouts.getByRole('radio', { name: 'Clean' }).click()
  const tickBefore = await tick(page)
  await card.getByRole('button', { name: 'Continue Sortie' }).click()
  await expect(card).toBeHidden()
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!.player.stores.bombs), { timeout: 10_000 }).toBe(0)
  const tickAfter = await tick(page)
  expect(tickAfter, 'the mission clock stopped').toBeGreaterThanOrEqual(tickBefore)
  expect(tickAfter - tickBefore, 'the mission clock jumped').toBeLessThan(60 * 20)
  const placed = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    const f = d.playerFlight()!
    const v = f.state.velocity
    return { speed: Math.hypot(v.x, v.y, v.z), onWheels: d.supportedContact(), gear: d.gearFraction(), pos: d.aircraftPositionM() }
  })
  expect(placed.onWheels).toBe(true)
  expect(placed.speed).toBeLessThan(2)
  expect(placed.gear).toBe(1)
  // Tacloban's threshold in calm air: 25 m in from the south end, 725 m south of the strip's centre.
  expect(Math.hypot(placed.pos.x - -29666, placed.pos.z - (-47605 + 725))).toBeLessThan(30)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.flightRecorder())).toMatchObject({ active: false })

  // Leg 2: another hop, another landing at a friendly base, another bank.
  await hopClear(page)
  await landAndStop(page, 'debrief')
  await expect(card).toContainText('This landing (number 2)')
  const two = await campaign(page)
  expect(two?.pending?.legs.map((l) => l.place)).toEqual(['Tacloban', 'Tacloban'])

  // End Sortie closes it: one entry, both landings inside, one sortie in the denominator (D10).
  await card.getByRole('button', { name: 'End Sortie' }).click()
  await expect(hqOf(page).getByText('Air Group Headquarters')).toBeVisible()
  const closed = await campaign(page)
  expect(closed?.pending).toBeNull()
  expect(closed?.human).toMatchObject({ sorties: 1, banked: 1, logLegs: [{ place: 'Tacloban', points: 0 }, { place: 'Tacloban', points: 0 }] })
})

test('a Dev fixture is unscored: the same stop card, nothing banked either way, and one continuous flight record across the stop', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  await startGame(page, { scenario: 'UI Fixture (dev)', dev: true, loadout: 'Both' })
  await waitForScenario(page, 'dev-mission-ui')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 60_000 })
  await hopClear(page)
  await landAndStop(page, 'debrief')
  const card = debriefDialog(page)
  await expect(card).toContainText('Stopped at Tacloban')
  await expect(card).toContainText('BADGE AWARDED: UI Fixture Wings (dev)')
  await expect(card.getByText('Campaign Ledger')).toHaveCount(0)
  await expect(card.getByRole('button', { name: 'Continue Sortie' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Restart' })).toHaveCount(0)
  const recorded = await page.evaluate(() => (window as DiagWindow).__ww2!.flightRecorder())
  expect(recorded).toMatchObject({ active: true, completed: true, valid: true })
  const packetsAtStop = recorded.packetCount

  await card.getByRole('button', { name: 'Continue Sortie' }).click()
  await expect(card).toBeHidden()
  // The same recorder keeps going across the stop: one file per sortie (D9), still valid.
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.flightRecorder().packetCount), { timeout: 10_000 }).toBeGreaterThan(packetsAtStop)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.flightRecorder())).toMatchObject({ active: true, valid: true })
  expect(await campaign(page)).toMatchObject({ pending: null, human: { banked: 0 } })

  await hopClear(page)
  await landAndStop(page, 'debrief')
  await card.getByRole('button', { name: 'End Sortie' }).click()
  await expect(page.getByRole('dialog', { name: 'Headquarters' }).getByText('Air Group Headquarters')).toBeVisible()
  expect(await campaign(page)).toMatchObject({ pending: null, human: { banked: 0, sorties: 0 } })
})

test('the ground stop repositions on a runway, on a moving carrier deck and on the water (DEV hook, no landing needed)', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  const placeAt = async (scenario: string, aircraft: string) => {
    await page.goto('/')
    await quickLaunch(page, { scenario, aircraft, loadout: 'both' })
    await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 60_000 })
    const before = await tick(page)
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.groundStop('clean'))).toBe(true)
    await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!.player.stores.bombs), { timeout: 10_000 }).toBe(0)
    expect((await tick(page)) - before, 'no clock jump').toBeLessThan(600)
    return page.evaluate(() => {
      const d = (window as DiagWindow).__ww2!
      const f = d.playerFlight()!
      const v = f.state.velocity
      return { speed: Math.hypot(v.x, v.z), pos: d.aircraftPositionM(), onWheels: d.supportedContact() }
    })
  }

  const runway = await placeAt('free-flight', 'f6f-hellcat')
  expect(runway.onWheels).toBe(true)
  expect(runway.speed).toBeLessThan(2)

  // The carrier steams at deck-quals' speed, so the aircraft starts moving WITH the deck.
  const deck = await placeAt('deck-quals-mission', 'f6f-hellcat')
  expect(deck.onWheels).toBe(true)
  expect(deck.speed).toBeGreaterThan(3)

  const water = await placeAt('water-quals', 'pby-5a-catalina')
  expect(water.speed).toBeLessThan(3)
})
