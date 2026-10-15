import type { ContactSurface } from './contact.js'
import type { AircraftEntity, EntityId } from './loop.js'
import { qRotate } from './math/quat.js'
import { add, v3, type Vec3 } from './math/vec3.js'
import type { Side } from './sides.js'
import type { GroundUnder } from './world/ground.js'

/** Gameplay estimates for the approved 28-foot wartime personnel canopy. */
export const BAILOUT_MIN_EXIT_AGL_M = 15
export const BAILOUT_SAFE_OPEN_AGL_M = 75
export const BAILOUT_DEPLOY_SECONDS = 2
export const PARACHUTE_SINK_MPS = 5.5

export type BailoutPhase = 'separating' | 'deploying' | 'canopy' | 'down' | 'dead'
export type BailoutOutcome = 'rescued' | 'captured' | 'killed'

export type RecoveryEnvironment = {
  readonly daylight: number
  readonly visibility: number
  readonly weather: number
  readonly seaState: number
}

export const DEFAULT_RECOVERY_ENVIRONMENT: RecoveryEnvironment = {
  daylight: 1,
  visibility: 0.8,
  weather: 0.1,
  seaState: 0.2,
}

export type BailoutContact = {
  readonly tick: number
  readonly position: Vec3
  readonly surface: Exclude<ContactSurface, 'deck'> | 'deck'
  readonly verticalSpeedMps: number
}

export type ParachutistState = {
  readonly tick: number
  readonly position: Vec3
  readonly velocity: Vec3
  readonly phase: BailoutPhase
  readonly phaseStartedTick: number
  readonly lowAltitude: boolean
  readonly contact: BailoutContact | null
  readonly outcome: BailoutOutcome | null
}

/** Generic now so F7B can spawn AI parachutists without another entity type. */
export type ParachutistEntity = {
  readonly id: EntityId
  readonly sourceAircraft: EntityId
  readonly side: Side
  /** Chosen at separation and carried in recorder/checksum state. */
  readonly recoverySeed: number
  /** Frozen at separation so replay and live recovery use identical weather. */
  readonly recoveryEnvironment: RecoveryEnvironment
  /** Exact resolver inputs and roll, populated at a survived surface contact. */
  readonly recovery: RecoveryRecord | null
  readonly state: ParachutistState
  readonly previous: ParachutistState
}

export type BailoutRejection =
  | 'already-bailed'
  | 'aircraft-lost'
  | 'ground-unavailable'
  | 'not-airborne'
  | 'too-low'

export type BailoutEligibility =
  | { readonly ok: true; readonly aglM: number; readonly lowAltitude: boolean }
  | { readonly ok: false; readonly reason: BailoutRejection; readonly aglM?: number }

export function bailoutEligibility(
  aircraft: AircraftEntity<unknown>,
  existing: readonly ParachutistEntity[],
  ground: GroundUnder | null,
  destroyed: boolean,
): BailoutEligibility {
  if (existing.some((entry) => entry.sourceAircraft === aircraft.id)) return { ok: false, reason: 'already-bailed' }
  if (aircraft.impact !== null || destroyed) return { ok: false, reason: 'aircraft-lost' }
  if (ground === null) return { ok: false, reason: 'ground-unavailable' }
  const aglM = aircraft.state.position.y - ground.heightM
  if (aircraft.parked || aglM <= 3) return { ok: false, reason: 'not-airborne', aglM }
  if (aglM < BAILOUT_MIN_EXIT_AGL_M) return { ok: false, reason: 'too-low', aglM }
  return { ok: true, aglM, lowAltitude: aglM < BAILOUT_SAFE_OPEN_AGL_M }
}

export function createParachutist(
  aircraft: AircraftEntity<unknown>,
  side: Side,
  eligibility: Extract<BailoutEligibility, { readonly ok: true }>,
  recoverySeed: number,
  recoveryEnvironment: RecoveryEnvironment = DEFAULT_RECOVERY_ENVIRONMENT,
): ParachutistEntity {
  // Leave aft and slightly above the cockpit. This is a separation impulse,
  // not an ejection seat: most velocity is inherited from the airframe.
  const offset = qRotate(aircraft.state.attitude, v3(-2.2, 1.2, 0))
  const impulse = qRotate(aircraft.state.attitude, v3(-4, 1.5, 0))
  const state: ParachutistState = {
    tick: aircraft.state.tick,
    position: add(aircraft.state.position, offset),
    velocity: add(aircraft.state.velocity, impulse),
    phase: 'separating',
    phaseStartedTick: aircraft.state.tick,
    lowAltitude: eligibility.lowAltitude,
    contact: null,
    outcome: null,
  }
  return {
    id: `parachutist:${aircraft.id}`,
    sourceAircraft: aircraft.id,
    side,
    recoverySeed,
    recoveryEnvironment,
    recovery: null,
    state,
    previous: state,
  }
}

export function bailoutSeed(tick: number, aircraftId: string, position: Vec3): number {
  let seed = (tick ^ Math.round(position.x * 10) ^ Math.round(position.y * 10) ^ Math.round(position.z * 10)) | 0
  for (let i = 0; i < aircraftId.length; i++) seed = Math.imul(seed ^ aircraftId.charCodeAt(i), 16_777_619)
  return seed >>> 0
}

const approach = (from: number, to: number, fraction: number): number => from + (to - from) * Math.min(1, Math.max(0, fraction))

export function stepParachutist(
  entity: ParachutistEntity,
  tick: number,
  dt: number,
  wind: Vec3 | null,
  groundAt: (x: number, z: number) => GroundUnder | null,
): ParachutistEntity {
  const before = entity.state
  if (before.phase === 'down' || before.phase === 'dead') return entity

  const ageS = (tick - before.phaseStartedTick) * dt
  let phase = before.phase
  let phaseStartedTick = before.phaseStartedTick
  if (phase === 'separating' && ageS >= 0.75) {
    phase = 'deploying'
    phaseStartedTick = tick
  } else if (phase === 'deploying' && ageS >= BAILOUT_DEPLOY_SECONDS - 0.75) {
    phase = 'canopy'
    phaseStartedTick = tick
  }

  const air = wind ?? v3(0, 0, 0)
  const velocity = phase === 'canopy'
    ? v3(
        approach(before.velocity.x, air.x, dt * 0.9),
        approach(before.velocity.y, air.y - PARACHUTE_SINK_MPS, dt * 2.2),
        approach(before.velocity.z, air.z, dt * 0.9),
      )
    : v3(before.velocity.x, before.velocity.y - 9.80665 * dt, before.velocity.z)
  const position = add(before.position, v3(velocity.x * dt, velocity.y * dt, velocity.z * dt))
  const ground = groundAt(position.x, position.z)
  if (ground !== null && position.y <= ground.heightM) {
    const contact: BailoutContact = {
      tick,
      position: v3(position.x, ground.heightM, position.z),
      surface: ground.surface,
      verticalSpeedMps: velocity.y - ground.velocity.y,
    }
    const survived = phase === 'canopy' && !before.lowAltitude && contact.verticalSpeedMps >= -9
    const landed: ParachutistState = {
      ...before,
      tick,
      position: contact.position,
      velocity: ground.velocity,
      phase: survived ? 'down' : 'dead',
      phaseStartedTick: tick,
      contact,
      outcome: survived ? null : 'killed',
    }
    return { ...entity, previous: before, state: landed }
  }

  return {
    ...entity,
    previous: before,
    state: { ...before, tick, position, velocity, phase, phaseStartedTick },
  }
}

export type RecoveryControl = 'friendly' | 'contested' | 'enemy'
export type RecoveryCue = 'rescue-likely' | 'contested' | 'capture-likely'

export type RecoveryFacts = {
  readonly seed: number
  readonly surface: 'land' | 'water' | 'deck'
  readonly control: RecoveryControl
  readonly friendlySupportM: number | null
  readonly enemySupportM: number | null
  readonly friendlyRescuePresent: boolean
  readonly enemyPresence: boolean
  readonly daylight: number
  readonly visibility: number
  readonly weather: number
  readonly seaState: number
}

export type RecoveryAssessment = {
  readonly cue: RecoveryCue
  readonly rescueProbability: number
  readonly factors: readonly string[]
}

export type RecoveryRecord = {
  readonly facts: RecoveryFacts
  readonly cue: RecoveryCue
  readonly rescueProbability: number
  readonly factors: readonly string[]
  readonly roll: number | null
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

export function assessRecovery(facts: RecoveryFacts): RecoveryAssessment {
  if (facts.friendlyRescuePresent || (facts.control === 'friendly' && facts.surface !== 'water')) {
    return {
      cue: 'rescue-likely',
      rescueProbability: 1,
      factors: [facts.friendlyRescuePresent ? 'friendly rescue coverage' : 'friendly-controlled area', facts.surface],
    }
  }
  if (facts.surface === 'water' && !facts.friendlyRescuePresent) {
    return { cue: 'capture-likely', rescueProbability: 0, factors: ['no friendly rescue coverage', 'water'] }
  }
  if (facts.control === 'enemy' && !facts.friendlyRescuePresent) {
    return { cue: 'capture-likely', rescueProbability: 0, factors: ['enemy-controlled area', facts.surface] }
  }

  const factors: string[] = ['contested area', facts.surface]
  let probability = 0.5
  if (facts.friendlySupportM !== null) {
    probability += Math.max(0, 0.2 - facts.friendlySupportM / 100_000)
    factors.push(`friendly support ${Math.round(facts.friendlySupportM / 1000)} km`)
  }
  if (facts.enemySupportM !== null) {
    probability -= Math.max(0, 0.2 - facts.enemySupportM / 100_000)
    factors.push(`enemy support ${Math.round(facts.enemySupportM / 1000)} km`)
  }
  probability += (clamp01(facts.daylight) - 0.5) * 0.16
  probability += (clamp01(facts.visibility) - 0.5) * 0.2
  probability -= clamp01(facts.weather) * 0.12
  if (facts.surface === 'water') probability -= 0.12 + clamp01(facts.seaState) * 0.12
  if (facts.enemyPresence) { probability -= 0.18; factors.push('enemy presence') }
  factors.push(facts.daylight >= 0.5 ? 'daylight' : 'darkness')
  factors.push(facts.visibility >= 0.5 ? 'usable visibility' : 'poor visibility')
  return { cue: probability >= 0.67 ? 'rescue-likely' : probability <= 0.33 ? 'capture-likely' : 'contested', rescueProbability: clamp01(probability), factors }
}

/** Stable 32-bit mix; the recorded seed is the only random input. */
export function recoveryRoll(seed: number): number {
  let x = seed | 0
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d)
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b)
  x ^= x >>> 16
  return (x >>> 0) / 0x1_0000_0000
}

export function resolveRecovery(facts: RecoveryFacts): { readonly outcome: Exclude<BailoutOutcome, 'killed'>; readonly assessment: RecoveryAssessment; readonly roll: number | null } {
  const assessment = assessRecovery(facts)
  if (assessment.rescueProbability === 1) return { outcome: 'rescued', assessment, roll: null }
  if (assessment.rescueProbability === 0) return { outcome: 'captured', assessment, roll: null }
  const roll = recoveryRoll(facts.seed)
  return { outcome: roll < assessment.rescueProbability ? 'rescued' : 'captured', assessment, roll }
}

export const bailoutEvidence = (entity: ParachutistEntity, factors: readonly string[] = []): string => {
  const contact = entity.state.contact
  const surface = contact === null ? 'no surface contact' : `${contact.surface} contact at ${contact.verticalSpeedMps.toFixed(1)} m/s`
  const result = entity.state.outcome ?? (entity.state.phase === 'down' ? 'awaiting recovery' : entity.state.phase)
  return `Bailout ${result}: ${surface}${factors.length === 0 ? '' : `; ${factors.join(', ')}`}`
}
