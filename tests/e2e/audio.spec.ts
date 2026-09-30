import { test, expect } from '@playwright/test'
import { quickLaunch, debriefDialog, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { AUDIO_ASSETS } from '../../src/audio/assets.js'

/**
 * Tier 2 is `src/audio/webAudio.ts`'s only coverage, on purpose: the vitest
 * environment is `node`, which implements no Web Audio, and faking it to test
 * the file whose whole job is to call it would be a second implementation of
 * the API. These cases are the things no fake backend can know.
 *
 * Every case waits for `waitForTerrain` before pressing anything. `__ww2` is
 * published early in `boot()` but the keydown listener is attached hundreds of
 * lines later, so a key sent on `__ww2` alone lands before anything is
 * listening -- which is exactly how the first version of this file failed
 * (2026-09-18): the engine and mute cases read a throttle that never moved,
 * while the app itself was working correctly the whole time.
 */

test.skip('the audio context is suspended until a key is pressed', () => {
  // NOT IMPLEMENTED, and deliberately not made to pass. Measured 2026-09-18 on
  // the reference desktop: the context is ALREADY 'running' at boot, before
  // any gesture. That is not this app's doing and not the harness's --
  // `CHROMIUM_ARGS` in playwright.config.ts carries no autoplay override, and
  // playwright-core passes none either (grepped, 2026-09-18).
  //
  // The likely cause, UNVERIFIED: Chrome's Media Engagement Index grants
  // autoplay to an origin the user has used repeatedly, and this origin is one
  // Mark flies on that desktop. If so the precondition is a property of that
  // browser profile, so asserting it here would pass on a fresh profile and
  // fail on the reference runner -- a flake that says nothing about the code.
  //
  // What it costs: nothing automated proves a FIRST-TIME visitor hears
  // anything. `void audio.resume()` in main.ts's keydown listener is the code
  // that matters and it is exercised by the cases below; that it is reached
  // before the first sound is wanted has to be checked by hand, in a fresh
  // profile, once. Recorded in the handoff as an open item rather than hidden
  // behind a green test.
})

test('the context is running once the game has been played, and every clip decodes', async ({ page }) => {
  // The one thing a fake backend cannot know: whether a 48 kHz stereo WAV that
  // is the right number of bytes on disk is one `decodeAudioData` accepts.
  // Every clip `AUDIO_ASSETS` lists, from the URLs src/audio/assets.ts builds.
  // Launched past the title, whose keydown listener ignores keys, so the
  // gesture that resumes the context is the New game click itself.
  await quickLaunch(page, { scenario: 'free-flight' })
  await waitForTerrain(page)
  await expect
    .poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.audio().loaded.length), { timeout: 30_000 })
    .toBe(AUDIO_ASSETS.length)
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.audio().state), { timeout: 15_000 }).toBe('running')
  // None of them FAILED, which `loaded.length` alone cannot distinguish from a
  // clip that is merely slow.
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.audio().failed)).toEqual([])
})

test('the engine gain follows the throttle and falls to zero on the cut', async ({ page }) => {
  // Proves the wire, in the shipped app: `=` ramps over THROTTLE_SECONDS
  // (src/input/keyboard.ts), `M` chops it in one frame. Launched past the
  // title: behind it the audio is held silent by design (titleSwap.spec.ts).
  await quickLaunch(page, { scenario: 'free-flight' })
  await waitForTerrain(page)
  // The loop only starts once propeller.wav has decoded, and engine gain is
  // not written before it exists. Waiting on the rate -- which is non-zero at
  // idle -- is how this tells "not loaded yet" from "loaded and silent",
  // which is the distinction the zero-throttle decision makes load-bearing.
  await expect
    .poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.audio().enginePlaybackRate), { timeout: 30_000 })
    .toBeGreaterThan(0)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.audio().engineGain)).toBe(0)

  await page.keyboard.down('Equal')
  await expect
    .poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.audio().engineGain), { timeout: 15_000 })
    .toBeGreaterThan(0.1)
  await page.keyboard.up('Equal')
  await page.keyboard.press('KeyM')
  await expect
    .poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.audio().engineGain), { timeout: 15_000 })
    .toBe(0)
})

test('Q mutes by taking the master gain to zero, and unmutes', async ({ page }) => {
  await page.goto('/')
  await waitForTerrain(page)
  await page.keyboard.press('KeyQ')
  await expect
    .poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.audio().masterGain), { timeout: 15_000 })
    .toBe(0)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.audio().muted)).toBe(true)
  await page.keyboard.press('KeyQ')
  await expect
    .poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.audio().masterGain), { timeout: 15_000 })
    .toBeGreaterThan(0)
})

test('going into the sea fires ONE cue, and a restart fires none', async ({ page }) => {
  // Both of Mark's 2026-09-18 reports, as a count. He heard a touchdown squeak
  // AND an explosion on a water crash -- two cues where there should be one --
  // and another squeak on respawn. `cuesFired` alone therefore discriminates
  // both without needing to name the clip: 1 after the crash, still 1 after
  // the restart.
  const cues = () => page.evaluate(() => (window as DiagWindow).__ww2!.audio().cuesFired)
  await page.goto(spawnUrl({ x: 0, y: 120, z: 0 }))
  await waitForTerrain(page)
  expect(await cues(), 'nothing should have fired merely by spawning').toBe(0)

  await page.keyboard.down('ArrowUp')
  await debriefDialog(page).waitFor({ timeout: 20_000 })
  await page.keyboard.up('ArrowUp')
  await expect.poll(cues, { timeout: 10_000 }).toBe(1)

  // Restart puts a fresh airplane on the ground. The previous flight ended
  // AIRBORNE, so without the tick-backwards reset in cues.ts that parked spawn
  // reads as a false -> true transition and squeaks.
  await debriefDialog(page).getByRole('button', { name: 'Restart' }).click()
  await page.waitForTimeout(4000)
  expect(await cues(), 'a respawn is not a landing').toBe(1)
})

test('the engine layer starts, and the view follows the camera', async ({ page }) => {
  // The one thing no fake can know: the bus graph and cabin stage built by
  // src/audio/webAudio.ts accept the writes system.ts makes, in the shipped app.
  await page.goto('/')
  await waitForTerrain(page)
  // KeyY is unbound (KeyP now toggles the mission map, which swallows the KeyC below)
  await page.keyboard.press('KeyY')
  await expect
    .poll(() => page.evaluate(() => Object.keys((window as DiagWindow).__ww2!.audio().layers)), { timeout: 30_000 })
    .toContain('engine')

  // Every camera mode maps to cockpit or chase, so after a full cycle of KeyC
  // the snapshot's view has taken BOTH values at some point.
  const seen = new Set<string>()
  const initialMode = await page.evaluate(() => (window as DiagWindow).__ww2!.cameraMode())
  for (let i = 0; i < 8; i++) {
    await page.keyboard.down('KeyC')
    await page.waitForTimeout(400)
    await page.keyboard.up('KeyC')
    await page.waitForTimeout(300)
    const view = await page.evaluate(() => (window as DiagWindow).__ww2!.audio().view)
    if (view !== null) seen.add(view)
    if (seen.size === 2) break
    if ((await page.evaluate(() => (window as DiagWindow).__ww2!.cameraMode())) === initialMode && i > 0) break
  }
  expect([...seen].sort(), 'cycling the camera should reach both cabin presets').toEqual(['chase', 'cockpit'])
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.audio().failed)).toEqual([])
})
