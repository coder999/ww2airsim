# Incident 2026-09-20 — the forest vanished: the one-time quality check picks `low` in a real browser

**Status:** open, fix not started. Mark's call on the shape of the fix.
**Reported:** 2026-09-20 by Mark, "Why did all the trees disappear?", after flying the
Plan 16c close (`be69ab7`) on the desktop at ~21:00 MDT on 2026-09-19, and on
his iPhone and Surface the same evening.
**Diagnosed:** 2026-09-20 by Claude, reproduced in Mark's own Chrome on the desktop.

## What the pilot sees

Every tree is gone, on every device, from the first frame. Airfield tree
lines, the jungle, all of it. Everything else looks normal, so it reads as a
deleted feature rather than a settings change. It is a settings change.

## Root cause

`adaptOceanQuality` in `src/render/main.ts` samples GPU time once after 180
timed frames, picks an ocean tier from it (`tierForFrameTimeMs` in
`src/render/ocean/tiers.ts`: p95 ≤ 8 ms high, ≤ 11 ms medium, else low), and
the scenery, clouds and shadow pass follow that one tier.
`SCENERY_TIERS.low.treeFadeEndM = 0` (`src/render/scene/tiers.ts`, the 13a
ruling of 2026-09-17: a forest that ends sooner reads as haze, a forest with
gaps reads as a bug, zero means no trees) — so a session judged `low` draws no
forest at all, and the judgement is one-shot by design.

The measurement is wrong for a real browser, in two compounding ways:

1. **It runs on the title screen**, before New game, on a scene the pilot
   never flies.
2. **A vsynced browser reads ~3× the harness's numbers for the same work.**
   Chrome at 120 Hz lets the GPU idle between frames and clock down; the
   timestamp queries then span a slow, underclocked pass. The Tier 2 harness
   launches Chromium with `--disable-gpu-vsync --disable-frame-rate-limit`
   (`playwright.config.ts`), so every number it has ever recorded came from a
   GPU running flat out. The thresholds were calibrated on those.

Plan 16a's volumetric clouds (2026-09-19 morning) added the cost that crossed
the 11 ms line in a real browser. 16b and 16c, which landed the same day and
got the blame, contribute nothing measurable.

## Measured, 2026-09-20, RX 6700 XT, Mark's Chrome stable 153.0.8010.48

Launched through the desktop's `playwright run-server` with
`x-playwright-launch-options` = `{ channel: 'chrome', headless: false, args: [] }`,
i.e. Mark's installed browser with no harness flags, 2560 × 1440 viewport,
12 s after terrain load, title screen showing (`tick` 0):

| URL | GPU p50 | GPU p95 | Tier chosen | Forest |
| --- | --- | --- | --- | --- |
| `/` as shipped | 6.9 ms | **11.4 ms** | **low** | none |
| `/?cloudShadow=off` | 6.8 ms | 11.5 ms | low | none |
| `/?cloudTier=low` | 6.4 ms | 7.5 ms | medium | to 1,200 m |
| `/?cloudTier=off` | 3.5 ms | 3.5 ms | high | to 1,850 m |
| `/` at a 4K canvas (DPR 1.5, Mark's monitor is 3840 × 2160 @ 120 Hz) | — | 12.8 ms | low | none |

The same `/` through the harness's Chromium with `CHROMIUM_ARGS`, same
viewport: p95 **4.1 ms**, tier high, full forest. `?oceanTier=low` in that
browser removes every tree and changes nothing else visible, which is the
mechanism end to end. `validationErrors` was empty in every run: no pipeline
failed anywhere.

Devices: the desktop (`ryzen`, 192.168.0.72), Marks-iPhone (192.168.0.81) and
MarkSurfacePro (192.168.0.157) all loaded the closed build on the evening of
2026-09-19 (traefik access log on nexus). The phone and Surface land on `low`
for the ordinary reason; the desktop lands on it for the reason above.

A second, smaller change from the same day is worth knowing about because it
also thins the forest and is correct: `05ffc41` (2026-09-19 09:09) made the
land-cover raster actually decode in dev sessions, which had silently painted
the procedural everywhere-forest since 2026-09-18. CPU count of tree sites,
7 × 7 cells, with the raster vs procedural: Tacloban 415 vs 880, gulf north of
the strip 2,958 vs 8,823, the jungle spot at (−22300, 38817) 10,444 either way.

## Why no test caught it

- Tier 2 measures with the vsync-off flags, so its GPU numbers are not what a
  pilot's browser reads. The budget assertions are right for what they
  measure and blind to this.
- Nothing logs or shows the tier. `__ww2.oceanTier()` is the only signal, and
  no spec asserts the tier a bare page load ends up on.
- The check runs on the title screen, which no spec looks at for frame cost.

## Fix (not started)

The forest is not the defect; the verdict is. Candidate changes, for Mark to
choose among — they are not exclusive:

1. **Measure after New game**, on the scene the pilot flies, not on the title.
2. **Calibrate for a vsynced browser.** Either raise the thresholds from
   numbers read through `channel: 'chrome'` with no flags, or measure with
   vsync's idle removed (e.g. time only the render pass, or sample while the
   GPU is demonstrably busy).
3. **Print the verdict**: a console line, and the tier in the DEV diagnostics
   overlay, so a quality change never again masquerades as a bug.
4. **Assert it in Tier 2**: a case that loads `/` through Mark's Chrome
   (`channel: 'chrome'`, no args) and expects `high` on the reference GPU.
   Without this, any future cost regression repeats the incident silently.
5. Separately, and only if wanted: give `low` a short forest instead of none.
   That reverses the 13a ruling and is a look decision, not part of this fix.

## Reproduce

```sh
# nexus: tunnel to the desktop's run-server (start it there with the
# `playwright-run-server` scheduled task: schtasks /run /tn "\playwright-run-server")
ssh -N -L 39001:127.0.0.1:3000 ryzen &
```

```ts
// any .mts inside the repo, run with npx tsx
import { chromium } from '@playwright/test'
const browser = await chromium.connect('ws://localhost:39001/', {
  headers: { 'x-playwright-launch-options': JSON.stringify({ channel: 'chrome', headless: false, args: [] }) },
})
const page = await (await browser.newContext({ viewport: { width: 2560, height: 1440 } })).newPage()
await page.goto('https://ww2airsim.windomlane.org/')
await page.waitForFunction(() => ((window as any).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 60_000 })
await page.waitForTimeout(12_000)
console.log(await page.evaluate(() => (window as any).__ww2.oceanTier()))   // "low" on 2026-09-20
await browser.close()
```

Expected after the fix: `high` on the reference GPU, forest to 1,850 m, and the
same line printed in the console.
