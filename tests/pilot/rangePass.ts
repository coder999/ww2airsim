import { loadScenarioBundle } from '../../tools/content/load.js'
import { loadTerrainHeader, loadTerrainLevel } from '../../tools/terrain/load.js'
import { finestFetchedLevelFor, INTERIM_ASSET_QUALITY_TIER } from '../../src/render/fetchedLevel.js'
import { createTerrainField, heightAt, type TerrainField } from '../../src/sim/world/terrain.js'
import { localToWorld, runwayHeadingRad } from '../../src/sim/world/airfields.js'
import { restPitchRad, wheelDepthM } from '../../src/sim/gearContact.js'
import { v3 } from '../../src/sim/math/vec3.js'
import type { StrafePass } from './strafePilot.js'

/**
 * The Tacloban range pass (gunnery-range and friendly-fire-field, plan
 * 2026-09-29-gunnery-range-strafing-pass), built in Node where the content and
 * the terrain are, and handed to the pilot in whichever tier flies it.
 *
 * Tuned in Deterministic on 2026-09-29 against the shipped start (1,500 m south of
 * the target at 70 m, 70 m/s): target-1 died 16-19 s in with 12 hits, the
 * pull-out cleared the targets by 13-16 m and the airplane came to rest
 * 480-530 m short of the north end of the runway, over start offsets of
 * +-100 m range, +-5 m height and +-4 m/s, and with the pilot updating every
 * frame at 60, 30 and 20 fps.
 * - `diveDeg` 9, `breakM` 200: tracking the sight from further out, or
 *   breaking at 120 m, bottomed the pull-out at 5.6 m over the targets.
 * - `fireM` 400: the six guns converge at 300 m; firing from 500 m scored
 *   nothing at all.
 * - the landing aim point 200 m past target-1 on a 5 degree path with the
 *   flare at 5 m: at the default 12 m flare height the pass arrives already
 *   below it and floats more than a kilometer, off the far end.
 */
export const RANGE_PASS = {
  cruiseHeightM: 70,
  diveDeg: 9,
  aimSpeedMps: 70,
  fireM: 400,
  fireDeg: 1,
  breakM: 200,
  landingPastTargetM: 200,
  glidePathDeg: 5,
  flareHeightM: 5,
} as const

/** The terrain a real page load flies over (`INTERIM_ASSET_QUALITY_TIER`). */
export function groundTruthTerrain(): TerrainField {
  const level = finestFetchedLevelFor(INTERIM_ASSET_QUALITY_TIER)
  const header = loadTerrainHeader()
  return createTerrainField(header, level, loadTerrainLevel(level, header))
}

/** The pass onto `targetId`, a parked aircraft in `scenarioId`. */
export function rangePass(scenarioId: string, targetId: string, terrain: TerrainField): StrafePass {
  const bundle = loadScenarioBundle(scenarioId)
  const entry = bundle.scenario.aircraft.find((a) => a.id === targetId)
  if (entry === undefined || !('parkedAt' in entry) || !('airfield' in entry.parkedAt) || typeof entry.parkedAt.spot === 'string') {
    throw new Error(`${scenarioId}: ${targetId} is not parked at a local spot`)
  }
  const field = bundle.airfields[entry.parkedAt.airfield]!
  const spec = bundle.aircraftSpecs[entry.spec]!
  const at = localToWorld(field, entry.parkedAt.spot.x, entry.parkedAt.spot.z)
  // Where `settleOnTerrain` puts it: the wheels on the ground at rest pitch.
  const target = v3(at.x, heightAt(terrain, at.x, at.z) + wheelDepthM(spec.gear, restPitchRad(spec.gear)), at.z)
  const aim = localToWorld(field, entry.parkedAt.spot.x, entry.parkedAt.spot.z - RANGE_PASS.landingPastTargetM)
  return {
    target,
    cruiseHeightM: RANGE_PASS.cruiseHeightM,
    diveDeg: RANGE_PASS.diveDeg,
    aimSpeedMps: RANGE_PASS.aimSpeedMps,
    fireM: RANGE_PASS.fireM,
    fireDeg: RANGE_PASS.fireDeg,
    breakM: RANGE_PASS.breakM,
    landing: {
      aimX: aim.x,
      aimZ: aim.z,
      runwayHeadingRad: runwayHeadingRad(field),
      touchdownElevationM: heightAt(terrain, aim.x, aim.z),
      glidePathRad: RANGE_PASS.glidePathDeg * Math.PI / 180,
      flareHeightM: RANGE_PASS.flareHeightM,
    },
  }
}

/**
 * A landing straight ahead on `airfieldId`'s runway from wherever the
 * airplane is: the aim point `aheadM` further along the runway axis than
 * `position`, on the centerline. Flown with the pilot started in its land
 * phase (`approachControls` only); the target is unused there, so it is the
 * aim point itself. Replaces `landAndStop`'s timed key script (2026-09-29).
 */
export function landingAhead(position: { readonly x: number; readonly z: number }, airfieldId: string, aheadM: number, terrain: TerrainField): StrafePass {
  const field = loadScenarioBundle('gunnery-range').airfields[airfieldId]
  if (field === undefined) throw new Error(`no airfield ${airfieldId} in the range bundle`)
  const h = runwayHeadingRad(field)
  // Along-runway distance of `position` from the runway center, northbound
  // positive for heading 0 (the `ApproachTarget` convention).
  const along = (position.x - field.runway.center.x) * Math.sin(h) - (position.z - field.runway.center.z) * Math.cos(h)
  const s = along + aheadM
  const aim = { x: field.runway.center.x + s * Math.sin(h), z: field.runway.center.z - s * Math.cos(h) }
  const elevation = heightAt(terrain, aim.x, aim.z)
  return {
    target: v3(aim.x, elevation, aim.z),
    cruiseHeightM: RANGE_PASS.cruiseHeightM,
    diveDeg: RANGE_PASS.diveDeg,
    aimSpeedMps: RANGE_PASS.aimSpeedMps,
    fireM: 0,
    fireDeg: 0,
    breakM: Number.POSITIVE_INFINITY,
    landing: {
      aimX: aim.x,
      aimZ: aim.z,
      runwayHeadingRad: h,
      touchdownElevationM: elevation,
      glidePathRad: RANGE_PASS.glidePathDeg * Math.PI / 180,
      flareHeightM: RANGE_PASS.flareHeightM,
    },
  }
}
