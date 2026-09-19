# Title screen — 2026-09-19

Mark's Adobe Firefly title art is the home screen, with **New game** and
**About project**. Design: [title screen design](../superpowers/specs/2026-09-19-title-screen-design.md);
plan: [implementation plan](../superpowers/plans/2026-09-19-title-screen.md).
This is the first slice of Plan 9 landing ahead of the rest of it; the pilot
roster, mission select and a return to the title from the debrief remain.
Three commits on `main` (`e3f24b8`, `e81f21e`, and the one carrying this
document). Nothing pushed, nothing deployed.

## What landed

- `content/art/title.png`, shipped as supplied (1408 x 768, 2,077,706 bytes,
  not re-encoded), with its `ASSETS.md` row and `content/art/NOTICE.md`;
  `tests/build/dist.test.ts` pins the byte count in `dist/`.
- `src/render/titleScreen.ts`: a pure `titleModel()` (labels, About text, the
  credits line from `legend.ts`, licence, repository link) and a
  full-viewport overlay with the art cover-fit, a low-center button row, an
  About panel with Close, and Enter as New game. `hide()` is final; there is
  no `show()`.
- `main.ts` creates the title before the renderer, so the adapter, ocean and
  terrain load behind it. While it is up the frame loop holds the world the
  way it does for the open navigation chart (no keys, paused), and the
  keydown listener returns early. New game releases the pause and calls
  `audio.resume()` on the click.
- `tests/e2e/harness.ts`: `startGame(page)` presses New game; `waitForTerrain`
  calls it, so every existing spec passes through the shipped title. The
  three `ocean.spec.ts` budget cases wait on the tick directly and call
  `startGame` themselves.

## Measured, reference GPU, 2026-09-19

Windows desktop, RX 6700 XT, 2560 x 1440, through the run-server.

| Run | Result |
| --- | --- |
| Full Tier 2 suite, first pass | 36 passed, 3 failed, 1 skipped, 6.9 min. The failures were the three ocean budget cases, which never call `waitForTerrain` and sat under the held title until their 60 s timeout |
| `ocean.spec.ts` after adding `startGame` | 14 passed, 1.5 min |
| `title.spec.ts` | passed, 6.3 s: title and both buttons visible on load; tick unchanged over 1 s with terrain landed; About opens with the repository link and closes; New game hides the title, the tick advances, `audio().state` is `running`; zero validation errors |

Both 1440p screenshots were read (`test-results/title-screen.png`,
`test-results/title-about.png`): the art fills the viewport with the badge
centered and nothing of it cropped; the two buttons sit low center below the
anchor; the About panel reads cleanly over the badge. The buttons are modest
at 1440p (14 px monospace) -- a size to revisit if Mark finds them small.

Tier 1: `npm run verify` exits 0 at the final commit, 112 files / 1,177
tests / 1 pre-existing skip.

## Traps for the next session

- **Any new spec that waits on `tick()` without `waitForTerrain` sits under
  the title forever.** Call `startGame(page)` after `page.goto`. This is the
  only way the ocean cases failed.
- **The title's own listener owns Enter.** `main.ts`'s keydown handler
  returns early while `title.up()`, so no binding fires under the art; the
  `pressed` set stays empty, so nothing is latched on release.
- **New game is the audio gesture.** The first-visit autoplay question from
  `docs/handoff/2026-09-18-plan15-audio.md` is closed by construction: the
  click resumes the context before any sound is wanted. The `test.skip` in
  `audio.spec.ts` about the suspended-until-gesture precondition still
  stands, for the reason it records (the reference profile is already
  `running` at boot).
- **A boot failure empties `#app`**, and the overlay is a child of it, so a
  failure screen is never masked. If the title ever moves outside `#app`,
  that guarantee goes with it.
- **The `<title>` tag still says `ww2airsim`**; the art says WW2 AIRSIM and
  the About text calls that a working title. Naming is still Mark's call.
