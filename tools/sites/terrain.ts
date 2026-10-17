import { loadTerrainHeader, loadTerrainLevel } from '../terrain/load.js'
import { finestFetchedLevelFor, GROUND_TRUTH_TIER } from '../../src/render/fetchedLevel.js'
import { createTerrainField, type TerrainField } from '../../src/sim/world/terrain.js'

/** The ground the headless suite measures on (same level as the other world tests). Node only; needs content/terrain/tiles. */
export function groundTruthTerrain(): TerrainField {
  const header = loadTerrainHeader()
  const level = finestFetchedLevelFor(GROUND_TRUTH_TIER)
  return createTerrainField(header, level, loadTerrainLevel(level, header))
}
