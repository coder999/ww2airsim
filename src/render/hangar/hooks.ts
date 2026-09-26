// src/render/hangar/hooks.ts
import type { PartPose, PartSpec } from './models.js'
import type { LibraryKind } from './library.js'
import type { CameraPreset } from './framing.js'
import type { BenchState, CyclePart } from './benchController.js'
import type { DebugToggle } from './bench.js'
import type { CountsReport } from './budgets.js'

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
  /** The bench's Cycle, as its button does (H2). */
  cycle(part: CyclePart): void
  /** The bench's state: fractions, stores, and which part is cycling (H2). */
  bench(): BenchState
  /** A debug toggle, as its checkbox does (H2). */
  setDebug(which: DebugToggle, on: boolean): void
  /** Names of the nodes carrying pivot gizmos; [] while gizmos are off (H2). */
  gizmoNodes(): string[]
  /** The selected model's counts against its manifest budget; null before the first select (H2). */
  counts(): CountsReport | null
  readonly validationErrors: string[]
}

export type HangarWindow = Window & { __hangar?: HangarHooks }

export function installHangarHooks(w: HangarWindow, hooks: HangarHooks): void {
  w.__hangar = hooks
}
