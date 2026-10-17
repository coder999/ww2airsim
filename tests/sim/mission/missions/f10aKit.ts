/**
 * Shared by the F10A chapter tests (A1-A3): a chapter's world as the campaign draws it. A launch reads the stored `Campaign.world`
 * (`launchWindows`), so a chapter test builds the scenario in the windows the chapter is PLAYED in (`windowsForChapter`), not the
 * loader's default (`pre-invasion`), which would hand A2 and A3 a Japanese Tacloban.
 */
import { loadScenarioBundle } from '../../../../tools/content/load.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import { windowsForChapter } from '../../../../src/campaign/worldStates.js'
import type { TerrainField } from '../../../../src/sim/world/terrain.js'
import type { World } from '../../../../src/sim/loop.js'
import type { ChapterId } from '../../../../src/campaign/schema.js'

export const bundleOf = (scenarioId: string, chapter: ChapterId, windows: Readonly<Record<string, string>> = windowsForChapter(chapter)) =>
  loadScenarioBundle(scenarioId, windows)

export const worldOf = (scenarioId: string, chapter: ChapterId, terrain: TerrainField | null, windows?: Readonly<Record<string, string>>): World<undefined> =>
  worldFromScenario(bundleOf(scenarioId, chapter, windows), terrain)

/** Compass bearing, degrees in [0, 360): 0 north (-z), 90 east (+x). */
export const bearingDeg = (from: { readonly x: number; readonly z: number }, to: { readonly x: number; readonly z: number }): number =>
  ((Math.atan2(to.x - from.x, -(to.z - from.z)) * 180) / Math.PI + 360) % 360

export const MILE_M = 1609.344
