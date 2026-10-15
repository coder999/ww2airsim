import type { AircraftSpec } from '../flight/schema.js'
import type { AircraftState } from '../flight/state.js'
import { DT } from '../flight/model.js'
import { onGround } from '../ground.js'
import { bayDoorsShut } from '../bayDoors.js'
import { qFromAxisAngle, qRotate } from '../math/quat.js'
import { add, length, normalize, scale, sub, v3, type Vec3 } from '../math/vec3.js'
import type { Deck } from '../world/deck.js'
import { groundUnder } from '../world/ground.js'
import type { TerrainField } from '../world/terrain.js'
import { burnedVelocity, flyProjectile, groundHit, railOrder, seaHit, storeTypeOf, torpedoDropOk, type Projectile } from './combat.js'
import { SEA_LEVEL_M } from '../world/terrain.js'
import { tupleVector } from './geometry.js'
import type { StoresState } from './stores.js'

/** Where the next store released NOW would land (B2). */
export type ImpactPrediction = {
  readonly kind: 'bomb' | 'rocket'
  /** World point where the store meets the ground or the sea. A rocket pair: the mean of the pair. */
  readonly point: Vec3
  /** Seconds from release to impact. */
  readonly timeS: number
  /** A bomb that meets the ground before its fuze arms (`armS`) is a dud in the sim: the point is
   *  still where it lands, but nothing detonates there. Always true for a rocket. */
  readonly armed: boolean
}

/** `ageS` is the store's age at the end of the tick that met the ground: what `armS` is judged against. */
type Flown = { readonly point: Vec3; readonly timeS: number; readonly ageS: number; /** The first contact was open sea (not land): what a torpedo needs to start its run. */ readonly sea: boolean }

/**
 * Flies one store with the sim's own step until it meets terrain or the sea.
 *
 * Mirrors the ordnance branch of `stepCombat`, tick for tick: the rocket's motor burn, then
 * `flyProjectile`, then `groundHit` and `seaHit` (whichever comes first along the segment). It leaves
 * out what the player cannot predict from the cockpit: other airplanes, hulls, decks and buildings
 * (a store over a ship marks the water beneath it) and the rocket's random dispersion cone
 * (0.12 deg on shipped content, about 3 m at a rocket's 1.5 km). Null when the store's lifetime
 * runs out in the air. `tests/sim/weapons/impactPrediction.test.ts` holds it to the real sim.
 */
function fly(first: Projectile, dragPerM: number, burn: { dv: number; s: number } | null, terrain: TerrainField | null, wind: Vec3 | null): Flown | null {
  let p = first
  while (p.lifeS > 1e-12) {
    const dt = Math.min(DT, p.lifeS)
    const burned = burn === null ? p : { ...p, velocity: burnedVelocity(p.velocity, burn.dv, burn.s, p.ageS, dt) }
    const flown = flyProjectile(burned, dt, wind, dragPerM)
    const ageBefore = p.ageS
    p = { ...flown, ageS: ageBefore + dt }
    const ground = groundHit(p.previous, p.position, terrain)
    const sea = seaHit(p.previous, p.position, terrain)
    const t = ground === null ? sea : sea === null ? ground : Math.min(ground, sea)
    if (t === null) continue
    return { point: add(p.previous, scale(sub(p.position, p.previous), t)), timeS: ageBefore + dt * t, ageS: p.ageS, sea: sea !== null && (ground === null || sea < ground) }
  }
  return null
}

/**
 * Where a bomb or rocket released this instant would land, by iterating the real projectile step.
 *
 * `state` is the airplane at the START of the tick the release is processed in: the sim launches a
 * store from `previous` (rack offset rotated by its attitude, its velocity), so the player's current
 * state is exactly that. Bombs are preferred when any are aboard and can leave (a bay load needs open
 * doors); otherwise the next rocket pair. Null when there is nothing releasable, the airplane is on
 * the ground or a deck, the store is a torpedo (its own drop envelope), or nothing is hit within the
 * store's lifetime. Pure: no effect on the flight (B2 is an Assist, off by default).
 */
export function predictImpact(
  spec: AircraftSpec, state: AircraftState, stores: StoresState,
  terrain: TerrainField | null, wind: Vec3 | null, decks: readonly Deck[] = [],
): ImpactPrediction | null {
  const s = spec.stores
  if (s === undefined) return null
  const under = groundUnder(terrain, decks, state.position.x, state.position.z)
  if (under !== null && onGround(spec, state, under.heightM)) return null

  const bombType = storeTypeOf(spec, 'bomb')
  if (stores.bombs > 0 && bombType !== null && bombType.kind === 'bomb' && !bayDoorsShut(spec, state.bayDoorFraction)) {
    // The rack `releaseBomb` takes: counting down from a full load alternates sides.
    const rack = s.racks[(s.racks.length - stores.bombs) % s.racks.length]!
    const position = add(state.position, qRotate(state.attitude, tupleVector(rack.offset)))
    const hit = fly(
      { owner: '', id: 0, position, previous: position, velocity: state.velocity, lifeS: bombType.lifetimeS, tracer: false, kind: 'bomb', ageS: 0 },
      bombType.dragPerM, null, terrain, wind,
    )
    return hit === null ? null : { kind: 'bomb', point: hit.point, timeS: hit.timeS, armed: hit.ageS >= (bombType.armS ?? 0) }
  }

  const combat = spec.combat
  const rocketType = storeTypeOf(spec, 'rocket')
  if (stores.rockets > 0 && combat !== undefined && rocketType !== null) {
    // Mirrors `releaseRockets`: the outermost remaining pair, launched down the gunsight line (raised by
    // the rail's elevation) at the airplane's speed. Dispersion is a draw; the prediction is its centre.
    const order = railOrder(s.rails)
    const fired = s.rails.length - stores.rockets
    const speed = length(state.velocity)
    const hits: Flown[] = []
    for (let k = 0; k < Math.min(2, stores.rockets); k++) {
      const rail = s.rails[order[fired + k] ?? -1]
      if (rail === undefined) continue
      const origin = tupleVector(rail.offset)
      const sightLine = normalize(sub(v3(combat.convergenceM, 0, 0), origin))
      const raised = rocketType.railElevationDeg === undefined
        ? sightLine
        : qRotate(qFromAxisAngle(v3(0, 0, 1), (rocketType.railElevationDeg * Math.PI) / 180), sightLine)
      const position = add(state.position, qRotate(state.attitude, origin))
      const velocity = speed < 1e-9 ? state.velocity : scale(qRotate(state.attitude, raised), speed)
      const hit = fly(
        { owner: '', id: 0, position, previous: position, velocity, lifeS: rocketType.lifetimeS, tracer: false, kind: 'rocket', ageS: 0 },
        rocketType.dragPerM, { dv: rocketType.burnDeltaVMps ?? 0, s: rocketType.burnS ?? 1 }, terrain, wind,
      )
      if (hit === null) return null
      hits.push(hit)
    }
    if (hits.length === 0) return null
    const mean = scale(hits.reduce((a, h) => add(a, h.point), v3(0, 0, 0)), 1 / hits.length)
    return { kind: 'rocket', point: mean, timeS: hits.reduce((a, h) => a + h.timeS, 0) / hits.length, armed: true }
  }
  return null
}

export type TorpedoReason = 'too-fast' | 'too-high' | 'not-over-sea' | 'doors-shut'
/** Where the next torpedo released NOW would meet the water, and whether the sim would let it run (F6B torpedosight). */
export type TorpedoPrediction = {
  /** World point where it meets the water (or land); null when nothing is met within its lifetime. */
  readonly entry: Vec3 | null
  readonly timeS: number
  /** Every one of the sim's drop rules holds: no reasons. */
  readonly valid: boolean
  readonly reasons: readonly TorpedoReason[]
  readonly speedMps: number
  readonly maxSpeedMps: number
  /** Release height above the sea (the rack, as the sim judges it). */
  readonly heightM: number
  readonly maxHeightM: number
  readonly armRunM: number
  readonly runRangeM: number
  /** Horizontal unit vector of the run after entry (the drop heading). */
  readonly runDir: Vec3
}

/**
 * The torpedosight's prediction: the real projectile step (`fly`) from the rack the release would use, and the sim's
 * own drop envelope (`torpedoDropOk`, shared with `releaseBomb`). Hulls, decks and buildings under the entry point are
 * not modeled (like `predictImpact`; a drop onto a ship reads green and breaks up). Null when there is no torpedo to
 * drop: no stores, on the ground, none aboard, or the next store is a bomb.
 */
export function predictTorpedoDrop(
  spec: AircraftSpec, state: AircraftState, stores: StoresState,
  terrain: TerrainField | null, wind: Vec3 | null, decks: readonly Deck[] = [],
): TorpedoPrediction | null {
  const s = spec.stores
  if (s === undefined || stores.bombs <= 0) return null
  const under = groundUnder(terrain, decks, state.position.x, state.position.z)
  if (under !== null && onGround(spec, state, under.heightM)) return null
  const rack = s.racks[(s.racks.length - stores.bombs) % s.racks.length]!
  const type = s.types[rack.store]
  if (type === undefined || type.kind !== 'torpedo') return null
  const position = add(state.position, qRotate(state.attitude, tupleVector(rack.offset)))
  const speedMps = length(state.velocity)
  const heightM = position.y - SEA_LEVEL_M
  const reasons: TorpedoReason[] = []
  // The verdict is the sim's own (`torpedoDropOk`); the two comparisons only say WHICH limit was broken.
  if (!torpedoDropOk(type, speedMps, heightM)) {
    if (speedMps > type.maxDropSpeedMps!) reasons.push('too-fast')
    if (heightM > type.maxDropHeightM!) reasons.push('too-high')
  }
  const hit = fly(
    { owner: '', id: 0, position, previous: position, velocity: state.velocity, lifeS: type.lifetimeS, tracer: false, kind: 'torpedo', ageS: 0 },
    type.dragPerM, null, terrain, wind,
  )
  if (hit === null || !hit.sea) reasons.push('not-over-sea')
  if (bayDoorsShut(spec, state.bayDoorFraction)) reasons.push('doors-shut')
  const h = Math.hypot(state.velocity.x, state.velocity.z)
  return {
    entry: hit === null ? null : hit.point, timeS: hit === null ? 0 : hit.timeS, valid: reasons.length === 0, reasons,
    speedMps, maxSpeedMps: type.maxDropSpeedMps!, heightM, maxHeightM: type.maxDropHeightM!, armRunM: type.armRunM!, runRangeM: type.runRangeM!,
    runDir: h < 1e-6 ? v3(1, 0, 0) : v3(state.velocity.x / h, 0, state.velocity.z / h),
  }
}
