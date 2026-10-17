import type { ContactSurface } from './contact.js'
import type { AircraftEntity, EntityId } from './loop.js'
import { qRotate } from './math/quat.js'
import { add, v3, type Vec3 } from './math/vec3.js'
import type { Side } from './sides.js'
import type { GroundUnder } from './world/ground.js'

import { BAILOUT_TUNING, RECOVERY_TUNING, openingSeconds, type BailoutTuning, type RecoveryTuning } from './bailoutTuning.js'



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
  /** F7B: a dropped man or supply bundle. Absent for a bailing pilot, so pre-F7B worlds and recordings stay
   * byte-identical. Only a pilot's jump gets the rescue roll and marks its airframe abandoned (`isPilotJump`). */
  readonly kind?: 'trooper' | 'bundle'
  /** F10D: the envelope the transport was in when this man or bundle left it, read by the `drop` objective (a drop counts only if the
   *  aircraft was inside the corridor). Present on every cargo drop, absent for a pilot's jump and for any pre-F10D world. */
  readonly release?: DropRelease
}

/** F10D: what the transport was doing at the instant of a cargo drop. Air-relative speed, ground speed, altitude above sea level, nose heading. */
export type DropRelease = {
  readonly airspeedMps: number
  readonly groundSpeedMps: number
  readonly altitudeM: number
  readonly headingDeg: number
}

/** F10D: one transport's cargo is six squad rigs and two supply bundles (F3 section 4, J5): 18 rigs and 6 bundles from three transports,
 *  inside the pooled view's 24 and 8. */
export const CARGO_DROP = Object.freeze({ men: 6, bundles: 2 })

/** The player's (or an AI pilot's) own bailout, as opposed to a dropped trooper or bundle. */
export const isPilotJump = (entry: ParachutistEntity): boolean => entry.kind === undefined

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
  tuning: BailoutTuning = BAILOUT_TUNING,
): BailoutEligibility {
  if (existing.some((entry) => entry.sourceAircraft === aircraft.id)) return { ok: false, reason: 'already-bailed' }
  if (aircraft.impact !== null || destroyed) return { ok: false, reason: 'aircraft-lost' }
  if (ground === null) return { ok: false, reason: 'ground-unavailable' }
  const aglM = aircraft.state.position.y - ground.heightM
  if (aircraft.parked || aglM <= tuning.airborneAglM) return { ok: false, reason: 'not-airborne', aglM }
  if (aglM < tuning.minExitAglM) return { ok: false, reason: 'too-low', aglM }
  return { ok: true, aglM, lowAltitude: aglM < tuning.safeOpenAglM }
}

export function createParachutist(
  aircraft: AircraftEntity<unknown>,
  side: Side,
  eligibility: Extract<BailoutEligibility, { readonly ok: true }>,
  recoverySeed: number,
  recoveryEnvironment: RecoveryEnvironment = DEFAULT_RECOVERY_ENVIRONMENT,
  tuning: BailoutTuning = BAILOUT_TUNING,
): ParachutistEntity {
  // Leave aft and slightly above the cockpit. This is a separation impulse,
  // not an ejection seat: most velocity is inherited from the airframe.
  const offset = qRotate(aircraft.state.attitude, v3(tuning.exitOffsetM.x, tuning.exitOffsetM.y, tuning.exitOffsetM.z))
  const impulse = qRotate(aircraft.state.attitude, v3(tuning.exitImpulseMps.x, tuning.exitImpulseMps.y, tuning.exitImpulseMps.z))
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

/**
 * F7B: a stick of `count` men (or bundles) leaving `aircraft` at its current tick. Pure and deterministic: the same
 * aircraft and tick always give the same stick. # ponytail: the whole stick is placed at once, strung out behind the
 * aircraft along its ground track as if it had flown straight and level while they left; it does not spread out in
 * a turn. Upgrade to one man per `dropIntervalS` tick if a scenario ever drops from a banking aircraft.
 */
export function dropStick(
  aircraft: AircraftEntity<unknown>,
  side: Side,
  count: number,
  kind: NonNullable<ParachutistEntity['kind']>,
  lowAltitude: boolean,
  release?: DropRelease,
  tuning: BailoutTuning = BAILOUT_TUNING,
): readonly ParachutistEntity[] {
  const { tick, position, velocity, attitude } = aircraft.state
  const door = add(position, qRotate(attitude, v3(tuning.exitOffsetM.x, tuning.exitOffsetM.y, tuning.exitOffsetM.z)))
  const out = add(velocity, qRotate(attitude, v3(tuning.exitImpulseMps.x, tuning.exitImpulseMps.y, tuning.exitImpulseMps.z)))
  const speed = Math.hypot(velocity.x, velocity.z)
  const along = speed < 0.1 ? v3(0, 0, 0) : v3(velocity.x / speed, 0, velocity.z / speed)
  const men: ParachutistEntity[] = []
  for (let i = 0; i < count; i++) {
    const id = `drop:${aircraft.id}:${tick}:${kind}:${i}`
    const trail = i * tuning.dropIntervalS * speed
    const scatter = (recoveryRoll(bailoutSeed(tick, id, door)) - 0.5) * 2 * tuning.dropLateralM
    const start = add(door, v3(-along.x * trail - along.z * scatter, 0, -along.z * trail + along.x * scatter))
    const state: ParachutistState = {
      tick, position: start, velocity: out, phase: 'separating', phaseStartedTick: tick,
      lowAltitude, contact: null, outcome: null,
    }
    men.push({
      id, sourceAircraft: aircraft.id, side, recoverySeed: bailoutSeed(tick, id, start),
      recoveryEnvironment: DEFAULT_RECOVERY_ENVIRONMENT, recovery: null, state, previous: state, kind,
      ...(release === undefined ? {} : { release }),
    })
  }
  return men
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
  tuning: BailoutTuning = BAILOUT_TUNING,
): ParachutistEntity {
  const before = entity.state
  if (before.phase === 'down' || before.phase === 'dead') return entity

  const ageS = (tick - before.phaseStartedTick) * dt
  let phase = before.phase
  let phaseStartedTick = before.phaseStartedTick
  if (phase === 'separating' && ageS >= tuning.separationSeconds) {
    phase = 'deploying'
    phaseStartedTick = tick
  } else if (phase === 'deploying' && ageS >= openingSeconds(tuning)) {
    phase = 'canopy'
    phaseStartedTick = tick
  }

  const air = wind ?? v3(0, 0, 0)
  const velocity = phase === 'canopy'
    ? v3(
        approach(before.velocity.x, air.x, dt * tuning.canopyHorizontalRate),
        approach(before.velocity.y, air.y - (entity.kind === 'bundle' ? tuning.bundleSinkMps : tuning.sinkMps), dt * tuning.canopyVerticalRate),
        approach(before.velocity.z, air.z, dt * tuning.canopyHorizontalRate),
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
    const survived = entity.kind === 'bundle' || (phase === 'canopy' && !before.lowAltitude && contact.verticalSpeedMps >= -tuning.survivableContactMps)
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

const miles = (m: number): string => `${(m / 1609.344).toFixed(m < 16_093 ? 1 : 0)} mi`

export function assessRecovery(facts: RecoveryFacts, tuning: RecoveryTuning = RECOVERY_TUNING): RecoveryAssessment {
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

  const t = tuning
  const factors: string[] = ['contested area', facts.surface]
  let probability = t.baseProbability
  if (facts.friendlySupportM !== null) {
    probability += Math.max(0, t.supportMax - facts.friendlySupportM / t.supportFadeM)
    factors.push(`friendly support ${miles(facts.friendlySupportM)}`)
  }
  if (facts.enemySupportM !== null) {
    probability -= Math.max(0, t.supportMax - facts.enemySupportM / t.supportFadeM)
    factors.push(`enemy support ${miles(facts.enemySupportM)}`)
  }
  probability += (clamp01(facts.daylight) - 0.5) * t.daylightWeight
  probability += (clamp01(facts.visibility) - 0.5) * t.visibilityWeight
  probability -= clamp01(facts.weather) * t.weatherWeight
  if (facts.surface === 'water') probability -= t.waterBase + clamp01(facts.seaState) * t.seaStateWeight
  if (facts.enemyPresence) { probability -= t.enemyPresencePenalty; factors.push('enemy presence') }
  factors.push(facts.daylight >= 0.5 ? 'daylight' : 'darkness')
  factors.push(facts.visibility >= 0.5 ? 'usable visibility' : 'poor visibility')
  return { cue: probability >= t.rescueLikelyAtLeast ? 'rescue-likely' : probability <= t.captureLikelyAtMost ? 'capture-likely' : 'contested', rescueProbability: clamp01(probability), factors }
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
  const surface = contact === null ? 'no surface contact' : `${contact.surface} contact at ${Math.abs(contact.verticalSpeedMps * 3.28084).toFixed(0)} ft/s`
  const result = entity.state.outcome ?? (entity.state.phase === 'down' ? 'awaiting recovery' : entity.state.phase)
  return `Bailout ${result}: ${surface}${factors.length === 0 ? '' : `; ${factors.join(', ')}`}`
}
