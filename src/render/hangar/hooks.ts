// src/render/hangar/hooks.ts
import type { PartPose, PartSpec } from './models.js'
import type { LibraryKind } from './library.js'
import type { CameraPreset } from './framing.js'

/**
 * `window.__hangar`, present in every build, the same policy as the game's
 * `__ww2` (Hangar spec §10). Tier 2 (tests/e2e/hangar.spec.ts) drives the
 * page only through this. `tick` and `setModelVisible` are additions to the
 * spec's list: `tick` makes "two frames 1/60 s apart" exact while frozen,
 * `setModelVisible` renders the empty frame the pixel masks subtract, and
 * `current` tells a check which parts the selected model has.
 */
export interface HangarHooks {
  readonly ready: Promise<void>
  /** Library ids that have a spec, and therefore a model. */
  entries(): string[]
  select(id: string): Promise<void>
  pose(p: PartPose): void
  /** Advances the model's own clock by exactly `frameS`; while frozen, nothing else moves it. */
  tick(frameS: number): void
  camera(preset: CameraPreset): void
  freeze(): void
  setModelVisible(visible: boolean): void
  /** The selected entry's id, kind and bench parts; null before the first select. */
  current(): { readonly id: string; readonly kind: LibraryKind; readonly parts: readonly PartSpec[] } | null
  readonly validationErrors: string[]
}

export type HangarWindow = Window & { __hangar?: HangarHooks }

export function installHangarHooks(w: HangarWindow, hooks: HangarHooks): void {
  w.__hangar = hooks
}
