import { defineConfig } from '@playwright/test'

/**
 * Tier 2 only. Runs on the Windows reference platform, never in hosted CI --
 * there is no GPU there, and a software rasterizer would make every assertion
 * here meaningless while still passing some of them.
 *
 * baseURL is localhost on purpose: WebGPU needs a secure context and a
 * plain-HTTP LAN address is not one (master spec §2), so this expects the SSH
 * tunnel to nexus to be open (see README.md's Tier 2 section).
 *
 * `channel: 'chromium'` is the FIRST thing to suspect if the adapter test
 * fails here, ahead of anything about ANGLE backends below. Verified
 * 2026-09-13 against the installed playwright-core@1.63.0: with `headless:
 * true` and no `channel` set, Playwright resolves to the `chromium-headless-
 * shell` binary, the old headless mode, which has no GPU process at all --
 * `navigator.gpu` would simply be absent, for a reason that has nothing to do
 * with WebGPU itself (Task 15 review, round 1). `'chromium'` opts into
 * Chromium's newer headless mode instead, and is the exact binary the
 * README's `npx playwright install chromium` already installs.
 *
 * Beyond that: the day-0 spike ran in a headed Chrome tab; master spec §15
 * lists "the same adapter assertion holds under headless Chromium" as an open
 * day-0 question, and this config is the first attempt to run it headless at
 * all -- unverified as of 2026-09-13. If the adapter test still fails with
 * `channel: 'chromium'` in place, try `headless: false` next, to tell
 * "headless still lost the discrete GPU" apart from "this Chromium build has
 * no WebGPU at all"; if it's the former, try `--use-angle=d3d11` before
 * `d3d12`. `channel: 'chrome'` is a further option, but it needs a real
 * Google Chrome install on the reference platform -- the README's one-time
 * setup does not provide one, so do not reach for it before confirming Chrome
 * is actually there. Whichever of these turns out to matter, record it here,
 * dated, so this comment stops being a guess.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  // Longer than the default per-action wait below (30s, left unchanged) so a
  // genuinely stalled `waitForFunction` reports its own specific timeout
  // message first, rather than the whole test being killed by the outer test
  // timeout at the same moment with a less specific one.
  timeout: 60_000,
  use: {
    connectOptions: process.env.PW_REMOTE
      ? { wsEndpoint: process.env.PW_REMOTE, headers: { 'x-playwright-launch-options': JSON.stringify({ channel: 'chromium', headless: false }) } }
      : undefined,
    baseURL: 'http://localhost:5173',
    headless: true,
    channel: 'chromium',
    launchOptions: {
      // Headless is the likeliest place to silently lose the discrete GPU,
      // which is exactly what the adapter guard is watching for.
      args: ['--use-angle=d3d12', '--enable-unsafe-webgpu'],
    },
  },
  reporter: [['list']],
})
