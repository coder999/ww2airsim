# A5: Render scale in Settings

**Status (2026-10-10):** built on the branch, not merged. Handoff `docs/handoff/2026-10-10-a5-render-scale.md`. Master plan item: Track A, A5. Branch `a5-render-scale`, cut from `main` `d2dc6f8e`, in its own worktree.
**Decisions (Mark, 2026-10-10):**
- Options **50%, 75% and 100%** of native resolution, applied on top of `devicePixelRatio` (which stays capped at 2).
- **Default 100%**, so nothing changes until a player picks a lower one. Persisted like the other settings.
- The DEV `?renderScale=` param stays, as an override.
- Applied live, without a reload, if the renderer allows it; otherwise the row says "Takes effect next sortie", as Asset Quality does.
- User-facing text in US spelling.

**Viewing checkpoint (Mark, 2026-10-10):** final product only.
**Run mode:** unattended. Captures go in the handoff.
**Heavy jobs:** tsc, eslint, tests and `npm run verify` on ryzen (`REMOTE_RUN_OVERFLOW=0 remote-run ...`); E2E on ryzen's GPU against this worktree on a dev slot.

## What is in the code (read 2026-10-10)

| Fact | Where | Consequence |
| --- | --- | --- |
| `initRenderer` sets `setPixelRatio(min(dpr, 2) * renderScale)` once, then `setSize(window)`. | `src/render/renderer.ts` | The math moves into one exported function a unit test can call. |
| three 0.186.0's `Renderer.setPixelRatio` hands off to `CanvasTarget.setPixelRatio`, which returns early on no change, stores the ratio and calls `setSize(width, height, false)`, which resizes the canvas backing store. | `Renderer.js` → `CanvasTarget.js` (three 0.186.0) | A live change is one call. No reload is needed. |
| `PassNode.updateBefore` resizes every pass target to `getDrawingBufferSize()` each frame. | `src/render/pipeline.ts` header | The post chain (TRAA included) follows a pixel-ratio change with nothing more. |
| The window `resize` handler calls only `setSize`. | `main.ts` | The ratio, and so the scale, survives a resize. |
| `renderScaleFromQuery` returns 1 when the param is absent. | `renderer.ts`, `tests/render/renderer.test.ts` | It returns `null` when absent, so "no override" can be told apart from `?renderScale=1`. |
| One settings model, built by `createBootQuality`, whose `bind` connects live setters. Damage Model is persisted in `settings.ts`. | `bootQuality.ts`, `settings.ts` | Render scale follows the Damage Model pattern: `settings.ts` persists it, and `bootQuality` exposes the value and a live setter. |
| A4's Render quality row on Form 4 lives in `titleScreen.ts`, which the b2 and m2 worktrees edit. | `titleScreen.ts:851` | **The row goes in the Settings dialog only**, under Render Quality. That is where A5's title puts it, and it keeps this branch out of `titleScreen.ts`. Form 4 can gain it later if Mark wants it there too. |

## Design

- **Options:** `RENDER_SCALE_OPTIONS`, listed worst to best like the quality row: 50%, 75%, 100%. Each note gives the pixel cost: 50% is a quarter of the pixels, 75% is 56%.
- **Persistence:** `ww2airsim.renderScale.v1` holds `0.5`, `0.75` or `1`. Anything else reads `null`, with a warning and no throw, as every other loader does. With nothing persisted the setting is 1.
- **Live apply:** `applyRenderScale(renderer, scale)` in `renderer.ts` calls `setPixelRatio(pixelRatioFor(dpr, scale))`. `bootQuality.bindRenderScale(set)` connects it and applies the current value at once, so a pick made during boot still lands. The fine print already says that settings "apply the moment you pick them", which is true for this row.
- **DEV override:** `?renderScale=` wins. With it present, `main.ts` neither reads the setting nor binds the live setter, so a pick is saved but not applied. This is the same rule as `?oceanTier=`.
- **Reset to auto-detect** leaves the scale alone. Nothing probes it, as with Asset Quality.
- **`main.ts`:** two lines change: the scale `initRenderer` receives, and one `bindRenderScale` call. Everything else is in `renderer.ts`, `settings.ts` and `bootQuality.ts`.

### Render scale and A4's probe

The probe times frame intervals in the first seconds of the first sortie. It measures **whatever scale is in force**: at 50% it sees a cheaper frame and may recommend a higher tier. That is the right answer for the configuration being flown. The scale is not reset or pinned for the probe.

- The probe runs once per browser and never overrides a pick, so a later scale change does not re-run it. "Reset to auto-detect" re-measures on the next sortie at the scale then in force.
- Mark's desktop reads 104 fps at 100% (A4 handoff), so on that machine the verdict is High at any scale.

## Tasks

1. **Renderer math.** Add `pixelRatioFor(dpr, scale)` and `applyRenderScale(renderer, scale)`. `renderScaleFromQuery` returns `null` when the param is absent. Unit tests in `tests/render/renderer.test.ts`: the cap at 2 survives the scale (dpr 3 at 50% gives 1), and absent or garbage returns `null`.
2. **Setting and model.** `RenderScale`, `RENDER_SCALE_OPTIONS`, load/save/clear, plus `renderScale` on the snapshot, `selectRenderScale`, and an `onRenderScaleChange` callback in `settings.ts`. Unit tests in `tests/render/settings.test.ts`: round-trip, junk ignored, default 1, a pick persists and is not an explicit quality choice.
3. **Boot wiring.** `bootQuality`: `renderScale()` and `bindRenderScale(set)`. `main.ts` gets the two lines. Unit tests in `tests/render/bootQuality.test.ts`: the persisted scale is read at boot, bind applies it at once, a live pick reaches the setter. A source pin that `main.ts` binds it.
4. **Dialog row.** A "Render Scale" radio group under Render Quality (and its Advanced panel).
5. **E2E.** Extend `tests/e2e/settingsUi.spec.ts`: the row exists, defaults to 100%, and each pick changes `canvas.width` live to `round(viewport × min(dpr, 2) × scale)` at 50%, 75% and 100%; a reload keeps 75%. `renderScale.spec.ts` (the DEV param) is unchanged.
6. **Verify and capture.** `npm run verify` on ryzen. The E2E spec on ryzen's GPU against slot 3 (`ww2airsim-3.windomlane.org`, port 5174). Screenshots of the row and of 50% against 100% in flight go in the handoff. A recorded, ungated frame-time sample at each scale only if ryzen is idle.
7. **Docs.** Handoff `docs/handoff/2026-10-10-a5-render-scale.md` and the A5 status line in `MASTER_PLAN.md`. Email the handoff.
