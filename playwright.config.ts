import { defineConfig } from '@playwright/test'
import { CAPTURE_TEST_FILES } from './tests/e2e/captureTools.js'

/**
 * E2E only. Runs on the Windows reference platform, never in hosted CI --
 * there is no GPU there, and a software rasterizer would make every assertion
 * here meaningless while still passing some of them.
 *
 * baseURL is localhost on purpose: WebGPU needs a secure context and a
 * plain-HTTP LAN address is not one (master spec §2), so this expects the SSH
 * tunnel to nexus to be open (see README.md's E2E section).
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
 * The headed console/RDP route and the headless session-0 route are both now
 * verified; their current launch recipes live in docs/testing.md. Session 0
 * needs its separate d3d11 flag below. Do not revive the older, contradictory
 * "unverified headless" guidance here.
 */
/**
 * Chromium flags for the E2E browser.
 *
 * The first two were already here and are about getting a real GPU at all
 * (see the block comment above).
 *
 * The vsync/frame-rate flags are load-bearing for comparable measurements.
 * Once the remote server was started with `--unsafe` and the args actually
 * reached Chromium on 2026-09-18, rAF p95 fell from 10.1 ms to 1.5 ms. GPU
 * numbers from before that correction are not comparable with later ones.
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
 * marker arg added for the test was not either. README's E2E section gives
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


/**
 * A LOCAL run on nexus reaches its Radeon 680M only through ANGLE's Vulkan
 * backend; without these two flags headless Chromium on Linux silently hands
 * WebGPU a SwiftShader fallback adapter. Measured 2026-09-27 on nexus
 * (Chromium 1246): with them `requestAdapter()` gives amd / rdna-2,
 * isFallbackAdapter false; without them google / swiftshader. The process also
 * needs the `render` group. Linux only: ANGLE backend flags broke the adapter
 * on the Windows reference platform (see `--use-angle=d3d12` above), and the
 * remote path never reads `launchOptions` anyway. The 680M is roughly a
 * quarter of the reference GPU, so a local run is for correctness and
 * screenshots; its budget numbers mean nothing. The app's adapter guard cannot
 * tell them apart: it reported the 680M as "Reference platform: amd rdna-2"
 * the same day, so a green adapter.spec.ts on nexus proves real hardware only.
 */
const LOCAL_LINUX_ARGS = process.platform === 'linux' ? ['--use-angle=vulkan', '--enable-features=Vulkan'] : []

/**
 * Budget tests are a separate, explicitly locked suite.  A normal E2E run is
 * correctness-only; setting E2E_BUDGET_RUN=1 selects the complementary set
 * and is accepted only inside `hwlock ryzen-budget`.  This makes an unlocked
 * frame-time run impossible to mistake for a trusted measurement, including
 * when somebody invokes Playwright directly instead of using the nightly.
 */
const BUDGET_TITLE_RE = /budget|p95|tripwire|frame time|\bHz\b/i
const CAPTURE_TEST_PATTERNS = CAPTURE_TEST_FILES.map(file =>
  new RegExp(`${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
)

export function createPlaywrightConfig(mode: 'test' | 'capture' = 'test') {
  const budgetRun = process.env.E2E_BUDGET_RUN === '1'
  const heldLocks = new Set((process.env.HWLOCK_HELD ?? '').split(/\s+/).filter(Boolean))
  if (budgetRun && !heldLocks.has('ryzen-budget')) {
    throw new Error(
      'E2E_BUDGET_RUN=1 requires the ryzen-budget lock; run '
      + '`hwlock ryzen-budget env E2E_BUDGET_RUN=1 npm run test:e2e`.',
    )
  }

  return defineConfig({
    testDir: 'tests/e2e',
    // Capture/measurement programs share the harness but are not tests. The
    // default suite excludes the manifest; the dedicated config selects it.
    ...(mode === 'capture'
      ? { testMatch: CAPTURE_TEST_PATTERNS }
      : {
          testIgnore: CAPTURE_TEST_PATTERNS,
          // Correctness is the safe default. The locked budget invocation
          // selects exactly the complementary title set.
          ...(budgetRun
            ? { grep: BUDGET_TITLE_RE }
            : { grepInvert: BUDGET_TITLE_RE }),
        }),
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
              'x-playwright-launch-options': JSON.stringify(
                process.env.PW_SESSION0
                  ? // A run-server in ryzen's session 0 (started over SSH, no console
                    // login): no display, so headless, and ANGLE's default backend gets
                    // no GPU there while d3d11 gets the real one. README's "E2E: the
                    // GPU harness" has the recipe and what it is (not) good for.
                    { channel: 'chromium', headless: true, args: [...CHROMIUM_ARGS, '--use-angle=d3d11'] }
                  : { channel: 'chromium', headless: false, args: CHROMIUM_ARGS },
              ),
            },
          }
        : undefined,
      baseURL: process.env.PW_BASE_URL ?? 'http://localhost:5173',
      // E2E_TREES=off saves the player's Trees setting (`ww2airsim.trees.v1`, src/render/settings.ts) as Off, so a
      // run measures everything but the forest. The nightly's budget phase uses it while the forest cost is
      // unexplained (docs/handoff/2026-10-16-forest-canopy.md; Mark, 2026-10-16). The correctness phase leaves
      // trees On, so the Trees setting and the tree layers stay tested.
      ...(process.env.E2E_TREES === 'off'
        ? { storageState: { cookies: [], origins: [{ origin: new URL(process.env.PW_BASE_URL ?? 'http://localhost:5173').origin, localStorage: [{ name: 'ww2airsim.trees.v1', value: 'off' }] }] } }
        : {}),
      headless: true,
      channel: 'chromium',
      launchOptions: {
        // Headless is the likeliest place to silently lose the discrete GPU,
        // which is exactly what the adapter guard is watching for. Applies only
        // to a LOCAL run; see CHROMIUM_ARGS above for why the remote path needs
        // the same list in the header instead.
        args: [...CHROMIUM_ARGS, ...LOCAL_LINUX_ARGS],
      },
    },
    reporter: [['list']],
  })
}

export default createPlaywrightConfig()
