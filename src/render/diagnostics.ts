import type { AdapterVerdict } from './adapterGuard.js'
import type { CameraMode } from './camera.js'
import type { Controls } from '../sim/flight/state.js'
import type { LookOffset } from '../input/lookAround.js'
import type { AssistSettings } from '../assists/index.js'

/**
 * The shape `window.__ww2` has in a DEV build. `main.ts` writes it, and
 * `tests/e2e/adapter.spec.ts` (Tier 2) reads it -- both sides import this one
 * type rather than each declaring their own copy.
 *
 * Task 15 review, round 1: the two sides previously typed this independently
 * (`main.ts` cast through `unknown`, the spec file redeclared the same shape
 * by hand), so renaming or dropping a field typechecked clean on both sides
 * and only failed at runtime, on the one machine here that cannot run it.
 * Sharing this type turns that into a `tsc --noEmit` error instead.
 *
 * Not present at all outside a DEV build -- see the `import.meta.env.DEV`
 * guard at the call site in `main.ts` for why, and `.gitignore`/the
 * production bundle check in the Task 15 report for confirmation it does
 * not survive `npm run build`.
 */
export type Ww2Diagnostics = {
  readonly adapter: AdapterVerdict
  readonly validationErrors: readonly string[]
  readonly tick: () => number
  readonly cameraMode: () => CameraMode
  /** Added in round 1 review: proves the control-deflection phase of the
   *  camera sweep actually reached `frame.controls`, which `tick` advancing
   *  alone cannot (the render loop ticks from `requestAnimationFrame`
   *  regardless of whether a single key was ever delivered). */
  readonly controls: () => Controls
  /** Added in round 1 review: `lookOffsetFromKeys` is a pure snapshot that
   *  snaps back to centre the instant a look key is released
   *  (src/input/lookAround.ts), so proving a look key took effect has to
   *  read this while the key is still held, not after. */
  readonly look: () => LookOffset
  /**
   * Which assists are on (Plan 3 Task 5). Read-only on purpose: Tier 2 flips
   * them the way a pilot does, by pressing the toggle keys in
   * `src/input/bindings.ts`, and reads this to confirm the press landed --
   * exactly the pattern the camera sweep already uses for `KeyC` and
   * `cameraMode()`. A setter here would be a second write path into
   * `FrameState`, bypassing `nextFrameState`, which is the one function that
   * owns how a frame becomes the next frame; the keyboard path is also the one
   * a real pilot uses, so testing it tests something that ships.
   */
  readonly assists: () => AssistSettings
}
