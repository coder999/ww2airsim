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
/**
 * Chromium flags for the Tier 2 browser.
 *
 * The first two were already here and are about getting a real GPU at all
 * (see the block comment above).
 *
 * **The last two changed nothing, and are kept anyway. Do not read them as
 * load-bearing.** They were added in Task 11 expecting to uncap the frame
 * rate for a frame-time budget. They do not. Measured 2026-09-14 on a BLANK
 * page carrying no WebGPU at all -- no flags, `--disable-gpu-vsync` alone,
 * both of these, both plus `--disable-features=CalculateNativeWinOcclusion`,
 * and both plus `--disable-new-content-rendering-timeout` -- every one of the
 * five reported the same 9.9-10.0 ms median `requestAnimationFrame` interval.
 * The flags do reach the browser (`--disable-gpu` through this same header
 * made `navigator.gpu` vanish), so that is a real null result and not a
 * plumbing failure: the 10.0 ms cadence is Chromium's own and survives
 * removing both the GPU and the display. Design spec section 10.2 has the
 * evidence, including the 120 Hz the monitor actually runs at.
 *
 * They stay because they are free, correct, and may matter on a future
 * reference platform with a variable-refresh or windowed compositor. The
 * frame budget does NOT go through them: it is a WebGPU timestamp query on
 * the GPU's own clock (design spec section 10.3), which is why the cap being
 * immovable stopped mattering.
 *
 * NOTE these reach the browser ONLY through the `x-playwright-launch-options`
 * header below when `PW_REMOTE` is set. `use.launchOptions` is ignored on a
 * `connectOptions` run -- the remote server launches the browser, not this
 * process -- so anything that must apply to the reference platform has to be
 * in the header. Until Task 11, `--use-angle=d3d12` and
 * `--enable-unsafe-webgpu` were in `launchOptions` only and therefore were
 * NOT in force on the machine the whole suite exists to run on; the adapter
 * test passing without them is evidence they were never load-bearing there.
 */
const CHROMIUM_ARGS = [
  '--use-angle=d3d12',
  '--enable-unsafe-webgpu',
  '--disable-gpu-vsync',
  '--disable-frame-rate-limit',
]

export default defineConfig({
  testDir: 'tests/e2e',
  // Longer than the default per-action wait below (30s, left unchanged) so a
  // genuinely stalled `waitForFunction` reports its own specific timeout
  // message first, rather than the whole test being killed by the outer test
  // timeout at the same moment with a less specific one.
  timeout: 60_000,
  // One at a time. Every test here shares one GPU on one desktop, and the
  // frame-time budget in terrain.spec.ts measures that GPU: a second browser
  // rendering 1440p beside it is contention the number would silently absorb.
  // Playwright's default (half the CPU count) picked 2 on nexus, which is
  // also two Chromium windows fighting for the same foreground on the remote
  // machine. The suite is ~30 s serially, so this costs nothing worth having.
  workers: 1,
  use: {
    connectOptions: process.env.PW_REMOTE
      ? {
          wsEndpoint: process.env.PW_REMOTE,
          headers: {
            'x-playwright-launch-options': JSON.stringify({
              channel: 'chromium',
              headless: false,
              args: CHROMIUM_ARGS,
            }),
          },
        }
      : undefined,
    baseURL: 'http://localhost:5173',
    headless: true,
    channel: 'chromium',
    launchOptions: {
      // Headless is the likeliest place to silently lose the discrete GPU,
      // which is exactly what the adapter guard is watching for. Applies only
      // to a LOCAL run; see CHROMIUM_ARGS above for why the remote path needs
      // the same list in the header instead.
      args: CHROMIUM_ARGS,
    },
  },
  reporter: [['list']],
})
