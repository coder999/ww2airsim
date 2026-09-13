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
 * `--use-angle=d3d12` is the day-0 spike's headed-Chrome finding, not yet
 * confirmed under headless: master spec §15 lists "the same adapter assertion
 * holds under headless Chromium" as an open day-0 question, and Task 15 (this
 * config) is the first attempt to run it headless at all -- unverified as of
 * 2026-09-13. If the adapter test fails on the reference platform, per the
 * task brief: try `headless: false` first, to tell "headless lost the
 * discrete GPU" apart from "this Chromium build has no WebGPU at all"; if it's
 * the former, try `--use-angle=d3d11` or `channel: 'chrome'` before anything
 * else. Whichever it turns out to be, record it here, dated, so this comment
 * stops being a guess.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    launchOptions: {
      // Headless is the likeliest place to silently lose the discrete GPU,
      // which is exactly what the adapter guard is watching for.
      args: ['--use-angle=d3d12', '--enable-unsafe-webgpu'],
    },
  },
  reporter: [['list']],
})
