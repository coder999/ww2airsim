import { test, expect } from '@playwright/test'
import { waitForTerrain, type DiagWindow } from './harness.js'

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
  // Six clips, from the URLs src/audio/assets.ts builds.
  await page.goto('/')
  await waitForTerrain(page)
  await page.keyboard.press('KeyP') // deliberately UNBOUND: a gesture that changes nothing
  await expect
    .poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.audio().loaded.length), { timeout: 30_000 })
    .toBe(6)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.audio().state)).toBe('running')
  // None of them FAILED, which `loaded.length` alone cannot distinguish from a
  // clip that is merely slow.
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.audio().failed)).toEqual([])
})

test('the engine gain follows the throttle and falls to zero on the cut', async ({ page }) => {
  // Proves the wire, in the shipped app: `=` ramps over THROTTLE_SECONDS
  // (src/input/keyboard.ts), `M` chops it in one frame.
  await page.goto('/')
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
