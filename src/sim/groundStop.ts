/**
 * The ground stop (F5C D7, D8, D9, 2026-10-16): between two legs of a sortie the same aircraft and pilot are
 * refueled, repaired and rearmed to a chosen loadout, and put back at the start of a takeoff: no taxiing is modeled.
 * The mission clock, time of day, weather, AI and ships are untouched; only the player's aircraft and its combat
 * record change. Pure, and recorded as the flight record's `ground-stop` action so replay reproduces leg 1, the stop
 * and leg 2 exactly (`src/flightRecorder/verify.ts`).
 *
 * Where the aircraft goes (D8), by what it stopped on:
 * - a runway: the threshold of the end that faces the wind, stationary on its wheels, flaps up, brakes held, the same
 *   rest state `parkedAttitude` gives a scenario's parked aircraft;
 * - a carrier deck: the launch spot aft on the moving deck (`stateOnDeck`, the respot's own construction), bow into
 *   the wind the ship is steaming, moving with the deck; the carrier keeps steaming;
 * - water at an anchorage or alongside a friendly ship: on the water where it stopped, bow into the wind. If that
 *   spot is unsafe the result says why and the sortie can only end.
 */
import { friendlyBaseAt, type FriendlyBase } from './friendly.js'
import type { AircraftEntity, World } from './loop.js'
import { playerAircraft } from './loop.js'
import { DT } from './flight/model.js'
import { createState, type AircraftState, type Controls } from './flight/state.js'
import type { AircraftSpec } from './flight/schema.js'
import { restPitchRad, wheelDepthOf } from './gearContact.js'
import { healthyDamage } from './damage/model.js'
import { qFromAxisAngle, qMul } from './math/quat.js'
import { length, v3 } from './math/vec3.js'
import { stateOnDeck } from './mission/respot.js'
import { eligibleLoadouts } from './sortie.js'
import { storesFromLoadout, type Loadout } from './weapons/stores.js'
import { airfieldAt, localToWorld, runwayHeadingRad, type Airfield } from './world/airfields.js'
import { decksOf, type Deck } from './world/deck.js'
import { groundUnder } from './world/ground.js'
import { waterSurfaceAt, waterSurfaceContext } from './waterSurface.js'
import type { LandingAt } from './landing.js'

/** The carrier launch spot: this far forward of the stern, on the centerline. The scenarios park the player at -110 m on a
 *  262.7 m deck (21.35 m from the stern); this is that spot for any deck length. */
export const LAUNCH_SPOT_FROM_STERN_M = 21
/** The runway start: this far in from the threshold, so the main wheels stand on the pavement. */
export const THRESHOLD_MARGIN_M = 25
/** A ship closer than this to a stopped flying boat makes the relaunch unsafe. */
export const WATER_CLEARANCE_M = 300

export type StopPlacement = {
  readonly kind: 'runway' | 'carrier' | 'water'
  readonly base: FriendlyBase
  /** Where the aircraft goes, in the pilot's words ("Tacloban, runway 36"). */
  readonly description: string
}

export type GroundStopCheck =
  | { readonly ok: true; readonly placement: StopPlacement }
  | { readonly ok: false; readonly reason: string }

const NEUTRAL: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }
const DEG = 180 / Math.PI

/** What the aircraft is resting on, in landing-report terms. */
function restingOn(world: World<unknown>, a: AircraftEntity<unknown>): { at: LandingAt | null; deck: Deck | null; field: Airfield | null } {
  const decks = decksOf(world.ships)
  const g = groundUnder(world.terrain, decks, a.state.position.x, a.state.position.z, waterSurfaceContext(world.tick * DT, world.wind))
  if (g !== null && g.deck !== null) return { at: { kind: 'carrier', id: g.deck.shipId, name: g.deck.shipId }, deck: g.deck, field: null }
  if (g !== null && g.surface === 'water') return { at: { kind: 'water', id: 'open-water', name: 'Open water' }, deck: null, field: null }
  const field = airfieldAt(world.airfields, a.state.position.x, a.state.position.z)
  return { at: field === null ? null : { kind: 'airfield', id: field.id, name: field.name }, deck: null, field }
}

/** The compass heading (rad) the wind makes a takeoff face: against the air's velocity. `null` for calm. */
function headingIntoWind(world: World<unknown>): number | null {
  const w = world.wind
  if (w === null || length(w) < 1e-6) return null
  return Math.atan2(-w.x, w.z)
}

/** The nose's compass heading from an attitude (body +x, world +x east, north = -z). */
function headingOf(s: AircraftState): number {
  const { x, y, z, w } = s.attitude
  return Math.atan2(1 - 2 * (y * y + z * z), -(2 * (x * z - w * y)))
}

const attitudeFor = (headingRad: number, restPitch: number) =>
  qMul(qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - headingRad), qFromAxisAngle(v3(0, 0, 1), restPitch))

/** The runway end that faces the wind: heading and the start point at that threshold. */
export function runwayStart(world: World<unknown>, field: Airfield): { headingRad: number; x: number; z: number; end: string } {
  const h = runwayHeadingRad(field)
  const into = headingIntoWind(world)
  // Forward along heading h is local -z, so a takeoff on h starts at the +z end; the reciprocal starts at -z.
  const forward = into === null || Math.cos(into - h) >= 0
  const along = field.runway.lengthM / 2 - THRESHOLD_MARGIN_M
  const p = localToWorld(field, 0, forward ? along : -along)
  const headingRad = forward ? h : h + Math.PI
  const norm = ((Math.round(headingRad * DEG / 10) + 36) % 36) || 36
  return { headingRad, x: p.x, z: p.z, end: String(norm).padStart(2, '0') }
}

/** Whether the player's stop can be turned into a relaunch, and where it would go. Pure; the stop card asks this. */
export function checkGroundStop(world: World<unknown>): GroundStopCheck {
  const a = playerAircraft(world)
  const rest = restingOn(world, a)
  const base = friendlyBaseAt(world, rest.at, a.state.position)
  if (base === null || rest.at === null) return { ok: false, reason: 'This is not a friendly base.' }
  if (rest.at.kind === 'carrier') return { ok: true, placement: { kind: 'carrier', base, description: `${base.name}, launch spot` } }
  if (rest.at.kind === 'airfield' && rest.field !== null) {
    const start = runwayStart(world, rest.field)
    return { ok: true, placement: { kind: 'runway', base, description: `${base.name}, runway ${start.end}` } }
  }
  // Water: a flying boat into the wind where it sits.
  if (a.spec.waterOperations === undefined) return { ok: false, reason: 'This aircraft cannot take off from the water.' }
  const near = world.ships.find((s) => Math.hypot(s.state.position.x - a.state.position.x, s.state.position.z - a.state.position.z) < WATER_CLEARANCE_M)
  if (near !== undefined) return { ok: false, reason: `Too close to ${near.spec.name} to take off from here.` }
  return { ok: true, placement: { kind: 'water', base, description: `${base.name}, on the water` } }
}

/** A loadout the aircraft really carries; Dev's Hellcat layout is already in the world's spec when it applies. */
export const loadoutIsCarried = (spec: AircraftSpec, loadout: Loadout): boolean => eligibleLoadouts(spec, false).includes(loadout)

export type GroundStopResult<M> =
  | { readonly ok: true; readonly world: World<M>; readonly placement: StopPlacement }
  | { readonly ok: false; readonly reason: string }

/**
 * Refuel, repair, rearm to `loadout` and reposition the player (D7, D8). Everything else in the world is the same
 * object it was, so the clock, the weather, the AI and the ships resume where they were.
 */
export function groundStop<M>(world: World<M>, loadout: Loadout): GroundStopResult<M> {
  const player = playerAircraft(world)
  if (!loadoutIsCarried(player.spec, loadout)) return { ok: false, reason: `${player.spec.name} does not carry that loadout.` }
  const check = checkGroundStop(world)
  if (!check.ok) return check
  const spec = player.spec
  const rest = restingOn(world, player)
  const fuelKg = spec.mass.fuelCapacityKg
  const tick = world.tick
  let state: AircraftState
  let controls: Controls

  if (check.placement.kind === 'carrier') {
    const deck = rest.deck!
    state = stateOnDeck(spec, deck, { x: 0, z: -deck.lengthM / 2 + LAUNCH_SPOT_FROM_STERN_M }, { fuelKg, flapFraction: 0, tick })
    // Deck speed plus wind is what the launch needs; hook up, brakes held until the throttle is opened.
    controls = { ...NEUTRAL, gearDown: true, brake: 1, flapDown: false, hookDown: false }
  } else if (check.placement.kind === 'runway') {
    const start = runwayStart(world, rest.field!)
    const rest0 = restPitchRad(spec.gear)
    const provisional = createState({
      position: v3(start.x, 0, start.z), attitude: attitudeFor(start.headingRad, rest0), gearFraction: 1, fuelKg, tick, engineRpm: player.state.engineRpm,
    })
    const ground = groundUnder(world.terrain, decksOf(world.ships), start.x, start.z, waterSurfaceContext(tick * DT, world.wind))
    // With no terrain loaded there is no ground to read; keep the height the landing ended at.
    const y = ground === null ? player.state.position.y : ground.heightM + wheelDepthOf(spec, provisional)
    state = { ...provisional, position: v3(start.x, y, start.z) }
    controls = { ...NEUTRAL, gearDown: true, brake: 1, flapDown: false, hookDown: false }
  } else {
    const wops = spec.waterOperations!
    const x = player.state.position.x, z = player.state.position.z
    const headingRad = headingIntoWind(world) ?? headingOf(player.state)
    const sea = waterSurfaceAt(waterSurfaceContext(tick * DT, world.wind), x, z)
    state = createState({
      position: v3(x, sea.heightM + wops.hullDepthM - wops.displacementDraftM, z),
      velocity: v3(0, sea.verticalSpeedMps, 0),
      attitude: attitudeFor(headingRad, wops.restPitchDeg / DEG),
      gearFraction: 0, flapFraction: 1, fuelKg, tick, engineRpm: player.state.engineRpm,
    })
    controls = { ...NEUTRAL, gearDown: false, flapDown: true, hookDown: false }
  }

  const aircraft = world.aircraft.map((a): AircraftEntity<M> => (a.id !== world.player ? a : {
    ...a, state, previous: state, controls, impact: null, assistMemory: a.assistMemory,
  }))
  const rec = world.combat.aircraft[world.player]!
  const stores = storesFromLoadout(spec, loadout)
  const combat = {
    ...world.combat,
    aircraft: {
      ...world.combat.aircraft,
      [world.player]: {
        ...rec, damage: healthyDamage(), stores,
        guns: rec.guns.map((g, i) => ({ ...g, ammo: spec.combat?.guns[i]?.rounds ?? g.ammo })),
      },
    },
  }
  return { ok: true, world: { ...world, aircraft, combat }, placement: check.placement }
}
