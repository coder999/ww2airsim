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
 *
 * **And the header only carries `args` if the server was started with
 * `--unsafe`.** playwright-core's `filterLaunchOptions` (1.63.0) drops
 * `args`, `ignoreDefaultArgs`, `executablePath` and `chromiumSandbox` from
 * the header otherwise; `channel`, `headless` and `proxy` survive. Measured
 * 2026-09-18 by reading `chrome://version` through a `run-server` started
 * without the flag: none of the args below were on the command line, and a
 * marker arg added for the test was not either. README's Tier 2 section gives
 * the `--unsafe` form; without it every entry in this list is a no-op on the
 * reference platform, which the adapter test cannot tell you.
 *
 * The last two args are for the LAN path to `ww2airsim.windomlane.org`. The
 * UniFi resolver overrides that name's A record to nexus but forwards
 * Cloudflare's auto-generated HTTPS (type 65) record, which advertises h3 and
 * an ECH config for Cloudflare's edge. Chromium then tries QUIC, and ECH,
 * against nexus's Traefik, which has neither, and intermittently fails the
 * navigation instead of falling back: `net::ERR_QUIC_PROTOCOL_ERROR`, or with
 * QUIC off, `net::ERR_ECH_FALLBACK_CERTIFICATE_INVALID`. Measured 2026-09-18
 * headless on the desktop, 30 fresh contexts each: 7/30 failed with no flags,
 * 5/30 with `--disable-quic` alone, 0/30 with both flags below. Cloudflare's
 * edge saw none of the failing loads and cloudflared on nexus logged nothing,
 * so neither is in the path. The resolver-side fix is a LAN answer with no
 * HTTPS record for that name; these flags make the harness independent of it.
 *
 * **2026-09-18, the day the args first applied: the "changed nothing" null
 * result above is void.** It was measured while `run-server` was silently
 * dropping every arg, so it measured nothing. With `--disable-gpu-vsync` and
 * `--disable-frame-rate-limit` actually in force the rAF interval p95 went
 * 10.1 ms -> 1.5 ms and the frame-time budget's gpu p95 read 1.377 ms against
 * the 5.177 ms every handoff up to Plan 14 recorded (entities 3.670 -> 0.890).
 * Whether the old figure included compositor wait inside the timestamp span
 * or the GPU simply clocks up when uncapped has not been separated. Treat
 * every GPU number dated before 2026-09-18 as measured under vsync and NOT
 * comparable with numbers after; the 6.0 ms ceiling stands until re-argued.
 */
const CHROMIUM_ARGS = [
  // `--use-angle=d3d12` was here from Task 11 to 2026-09-18 and was REMOVED
  // the day the args first actually reached the browser (see the `--unsafe`
  // note above): with it applied, `navigator.gpu.requestAdapter()` returns
  // null on the reference platform; each of the other args alone, and all of
  // them together without it, return the AMD rdna-2 adapter. Measured through
  // the run-server with a per-flag probe. Do not put it back to "fix" an
  // adapter failure; it is the cause of one.
  '--enable-unsafe-webgpu',
  '--disable-gpu-vsync',
  '--disable-frame-rate-limit',
  '--disable-quic',
  '--disable-features=UseDnsHttpsSvcb',
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
    baseURL: process.env.PW_BASE_URL ?? 'http://localhost:5173',
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
