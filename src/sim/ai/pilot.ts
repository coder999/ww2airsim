import type { AircraftEntity } from '../loop.js'
import type { TakeoffState } from './takeoff.js'
import { cross, length, normalize, scale, sub, v3, ZERO, type Vec3 } from '../math/vec3.js'

export type PilotSkill = {
  /** Seconds between decision-layer rescores. Lower = reacts faster. This IS
   *  "reaction delay" (master spec §7), and since Plan 7d it carries TWO
   *  meanings off the one number: how often this pilot reconsiders its
   *  maneuver, and how outdated its mental picture of the enemy is allowed to
   *  get. A rescore both chooses the maneuver (from live facts, at that
   *  instant) and captures the target's position/velocity into
   *  `PilotDecisionState.observedTarget*`; all steering until the NEXT
   *  rescore flies against that frozen snapshot (`decision.ts`'s
   *  `maneuverControls`). So raising `reactionS` does not just slow the
   *  pilot's mind down, it also lets it aim at where the target used to be --
   *  up to `reactionS` ago. */
  readonly reactionS: number
  /** 0-1. Scales AI_GUN_CONE_RAD's half-angle; 1.0 leaves the cone
   *  unchanged. Does not change AI_GUN_RANGE_M. */
  readonly gunneryAccuracy: number
  /** 0-1. Scales how much relative-energy margin Pursue needs over Extend
   *  before Pursue still wins the score. Higher = holds the attack longer. */
  readonly energyDiscipline: number
  /** Relative-energy floor (same units as the decision layer's energy term)
   *  below which Extend is forced -- reserved for a future slice; this
   *  plan's forced override is range-based (MIN_ENGAGEMENT_RANGE_M) only. */
  readonly disengageThreshold: number
  /** Standard deviation of noise added to each of roll/pitch/yaw, in the
   *  same [-1, 1] units `Controls` already uses. 0 = perfect (no jitter).
   *  HIGHER IS ALWAYS WORSE -- unlike `gunneryAccuracy`, chosen
   *  specifically so a future reader cannot get the direction backwards by
   *  pattern-matching on this file's other, inverted field (Plan 7b's own
   *  gunneryAccuracy bug, spec §3). */
  readonly controlNoise: number
  /** Which named maneuvers this pilot flies (master spec §7: "green versus
   *  veteran is data"). The intent defaults are always flown, listed or not. */
  readonly repertoire: readonly ManeuverName[]
}

export const VETERAN_SKILL: PilotSkill = {
  reactionS: 0.3,
  gunneryAccuracy: 0.6,
  energyDiscipline: 0.7,
  disengageThreshold: -400,
  repertoire: ['lead-pursuit', 'lag-pursuit', 'high-yo-yo', 'low-yo-yo', 'attack-run', 'defensive-break', 'scissors', 'split-s', 'extend', 'immelmann'],
  // 7c (Mark's ruling 2026-09-25, "tone the veteran down"): 0.02 -> 0.01.
  // Measured 2026-09-25 through the production frame path against a passive
  // player on the tail-chase fixture (tests/render/aiLethality.test.ts, and
  // tools/ai/lethality.ts for the 128-run version). At 0.02 the veteran
  // killed the passive player before point-blank range in 4 of 128 runs,
  // including the reference GPU's red ai-maneuver run (`both` loadout, tick
  // 517). At 0.01 it killed none, with a mean of 0.04 hits. The lever is
  // this one because the AI's aim ignores gravity drop: a perfect aim streams
  // 2.2 m under the target, so a SHAKIER hand is deadlier (0.04 -> 11/32
  // kills, 0.08 -> 22/32). Green (0.15) is therefore the deadlier pilot
  // against a straight-flying target. That inversion is the gunnery-honesty
  // slice's to fix (spec Decisions, item 2). Still less than half of green's
  // noise, as noise.test.ts and pilot.test.ts require.
  controlNoise: 0.01,
}

export const GREEN_SKILL: PilotSkill = {
  reactionS: 1.0,
  gunneryAccuracy: 1.0,
  energyDiscipline: 0.3,
  disengageThreshold: -150,
  // Measured 2026-09-24 on the reference GPU (pursuit-range, same tail-chase
  // flight as VETERAN_SKILL's comment, skill swapped to 'green' via a
  // temporary scenario edit and reverted after): the same headingRad
  // sampling shows a visibly wobbly path, not a clean turn -- sample-to-
  // sample deltas repeatedly reversed sign against the overall turn-in
  // trend (e.g. +0.248, +0.176 deg/500ms mixed into an otherwise negative
  // series), roughly 1.4x veteran's mean magnitude (0.258 vs. 0.185
  // deg/500ms) and 1.6x its max (0.589 vs. 0.365 deg/500ms). No stall or
  // spin: altitude/speed stayed on a normal pursuit-dive profile throughout
  // (no shipped camera follows an AI entity, so this was read from
  // telemetry, not a screenshot of the airframe itself -- see task-4-report.md).
  // Kept unchanged from Task 1's starting value; already >=2x
  // VETERAN_SKILL.controlNoise, as tests/sim/ai/noise.test.ts requires.
  controlNoise: 0.15,
  // 7c Task 8 (Mark, 2026-09-25: "green never goes vertical"): no yo-yo,
  // attack run, split-S or Immelmann. 7c Task 14 (Mark, 2026-09-26: "remove
  // lag pursuit from green pilots. green pilots should be beaten easily"): no
  // lag pursuit either, so green flies 7b's three intent defaults. With lag,
  // green selected it at 6.0 s and the 7d bar's scripted evasion never got
  // behind it at two of four noise cursors (final review, 2026-09-26).
  repertoire: ['lead-pursuit', 'defensive-break', 'extend'],
}

export type PilotManeuver = 'pursue' | 'extend' | 'break'

/** Which safety override flew this tick (7c spec §3.2; ruling R11). It never
 *  changes `maneuver`, the 7b intent; it only says the envelope took the
 *  stick. Plain data, for tests and diagnostics. */
export type SafetyMode = 'none' | 'recover' | 'overspeed'

/** A named maneuver (7c spec §3.5). Each belongs to one 7b intent
 *  (`INTENT_OF`). Tasks 8-11 of the 7c plan add the rest of the library. */
export type ManeuverName =
  | 'lead-pursuit' | 'defensive-break' | 'extend' | 'lag-pursuit' | 'high-yo-yo' | 'low-yo-yo' | 'attack-run'
  | 'scissors' | 'split-s' | 'immelmann'

export const DEFAULT_MANEUVER: Readonly<Record<PilotManeuver, ManeuverName>> = {
  pursue: 'lead-pursuit', break: 'defensive-break', extend: 'extend',
}
export const INTENT_OF: Readonly<Record<ManeuverName, PilotManeuver>> = {
  'lead-pursuit': 'pursue', 'defensive-break': 'break', extend: 'extend',
  'lag-pursuit': 'pursue', 'high-yo-yo': 'pursue', 'low-yo-yo': 'pursue', 'attack-run': 'pursue',
  scissors: 'break', 'split-s': 'break', immelmann: 'extend',
}

/**
 * A phased maneuver's memory (7c spec §3.5): once entered it holds until its
 * own end condition or LATCH_CAP_S, through rescores, so a split-S is not
 * re-decided halfway through every 0.3 s. Plain data. Nothing here refers to
 * the world clock at creation: `enteredAtS` is written only on entry.
 */
export type ManeuverLatch = {
  readonly name: ManeuverName
  readonly phase: number
  readonly enteredAtS: number
  /** atan2(v.z, v.x) of the velocity at entry. */
  readonly entryHeadingRad: number
  readonly entryAltitudeM: number
  /** Split-S and Immelmann: the loop's center, fixed at entry. ZERO otherwise. */
  readonly loopCenter: Vec3
  /** Scissors: roll-direction reversals so far, and the threat's last side (+1 right, -1 left, 0 unknown). */
  readonly reversals: number
  readonly lastSide: number
  /** Attack run: the lowest altitude reached, for the zoom's recovery. */
  readonly lowestAltitudeM: number
}

/** One ingress waypoint (7e spec §4.5), world meters. The altitude and
 *  speed are those of the leg flown TO it. */
export type IngressWaypoint = { readonly x: number; readonly z: number; readonly altitudeM: number; readonly speedMps: number }
/** Where an ingress ends: a ship, read live every tick, or a fixed point (an
 *  airfield's runway center, resolved when the world is built; ruling W6). */
export type IngressDestination = { readonly kind: 'ship'; readonly id: string } | { readonly kind: 'point'; readonly x: number; readonly z: number }
/** A raider's orders (7e spec §4.5): fly the route, then the destination,
 *  then orbit it; fight only what attacks or comes close. */
export type IngressOrders = { readonly route: readonly IngressWaypoint[]; readonly destination: IngressDestination | null }

/** 7g spec §7: a pilot's home, resolved to plain data by worldFromScenario.
 *  A runway's approach geometry is fixed; a ship is read live from ctx.ships. */
export type RecoveryHome =
  | {
      readonly kind: 'runway'; readonly airfieldId: string
      readonly aimX: number; readonly aimZ: number; readonly headingRad: number
      /** Runway-local park spot (for tests and diagnostics). */
      readonly parkSpot: { readonly x: number; readonly z: number }
      /** The same spot in world coordinates, facing down the runway: what the
       *  respot builds from, because ctx carries no airfields (spec §7). */
      readonly parkWorld: { readonly x: number; readonly z: number; readonly headingRad: number }
    }
  | { readonly kind: 'ship'; readonly id: string; readonly parkSpot: { readonly x: number; readonly z: number } }

/** 7f spec §1-2: a wingman's station number in its leader's formation. */
export type FormationSlot = 1 | 2 | 3
/** 7f spec §1: a wingman's orders. The leader is a same-side aircraft,
 *  possibly the player, that is not itself a wingman (no chains). */
export type FormationOrders = { readonly leader: string; readonly slot: FormationSlot }

/** What a pilot is doing at the top level (7e spec §4.1). 7e flies
 *  `engage`, `ingress` (§4.5) and `loiter`; 7f fills in `formation`, 7g
 *  `rtb` and `landed`. */
export type PilotMode = 'engage' | 'ingress' | 'formation' | 'rtb' | 'landed' | 'loiter' | 'takeoff'

/** 7g: the recovery phases (7c-7g §6, 7g spec). */
export type RecoveryPhase = 'transit' | 'hold' | 'join' | 'configure' | 'final' | 'go-around' | 'rollout' | 'landed'
/** 7g: written by recovery.ts only. Plain data. */
export type RecoveryState = {
  readonly phase: RecoveryPhase
  /** Sim time the phase began. */
  readonly sinceS: number
  /** The LSO gave `cut` on this pass: committed, a later wave-off is ignored (spec §5). */
  readonly cut: boolean
  /** Sim time `join` began on this pass; read by later arrivals for the interval. */
  readonly joinedAtS: number | null
  /** Sim time the aircraft came to rest; the respot is RESPOT_DELAY_S later. */
  readonly restAtS: number | null
  readonly respotted: boolean
}

export type PilotDecisionState = {
  /** 7e. Written by `pilotTick` at every choice (rescore or forced). */
  readonly mode: PilotMode
  /** 7e. The aircraft this pilot is fighting, or `null`. Other pilots read
   *  it from the start-of-tick snapshot (the "already engaged" term). */
  readonly targetId: string | null
  /** 7e ingress progress (spec §4.5, ruling W7): the waypoint being flown
   *  to; `route.length` is the destination, `route.length + 1` the orbit. */
  readonly legIndex: number
  /** 7e: the heading (atan2(v.z, v.x)) and altitude a loiter holds, latched
   *  when it begins and cleared when a target is chosen; `null` otherwise. */
  readonly loiter: { readonly headingRad: number; readonly altitudeM: number } | null
  /** 7h: the takeoff phase machine, present only in mode `takeoff`. */
  readonly takeoff?: TakeoffState
  readonly maneuver: PilotManeuver
  /** The maneuver flown this tick, chosen at rescore within 'maneuver'. */
  readonly named: ManeuverName
  readonly latch: ManeuverLatch | null
  /** Sim time (tick * DT) at which the next rescore runs. */
  readonly nextRescoreS: number
  /** The target's position/velocity as of the last rescore -- what the
   *  pilot is actually flying (and aiming) against between rescores.
   *  Captured alongside `decideManeuver`'s own facts-derivation in
   *  `loop.ts`, so there is one observation per rescore. */
  readonly observedTargetPosition: Vec3
  readonly observedTargetVelocity: Vec3
  /** mulberry32 cursor for this pilot's control-noise draws (Task 3),
   *  independent of `weapons/combat.ts`'s own `rngState` cursor. Advances
   *  every tick, not just at rescore, since noise is applied to
   *  `maneuverControls`'s output every tick regardless of maneuver. */
  readonly noiseCursor: number
  /** This tick's safety override, or 'none'. Written every tick by pilotTick. */
  readonly safety: SafetyMode
  /** 7f spec §4: sim time until which a wingman flies trail cover, opened
   *  while its leader fires or engages. Absent (every non-wingman) means 0. */
  readonly coverUntilS?: number
  /** 7g: the recovery phase machine, present only in mode `rtb`/`landed`. */
  readonly recovery?: RecoveryState
  /** 7g spec §1: the last rescore at which any hostile was a contact.
   *  Written only for a pilot with a home, and seeded with the time of its
   *  first rescore (ruling P10), so the idle clock starts when the pilot
   *  does, not at 0 (a trigger-spawned pilot). */
  readonly lastContactS?: number
}

/** 32-bit FNV-1a of an entity id: the seed of that pilot's noise cursor
 *  (7e spec §4.5 item 2). Fixed, independent of spawn tick and array order,
 *  and the same whether the entity existed at world creation or was spawned
 *  by a trigger -- so two pilots spawned together no longer jitter in
 *  lockstep. */
export function noiseSeedFor(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** A fresh pilot's decision state: rescore on the first tick
 *  (`nextRescoreS: 0` is always <= the first tick's time), so the placeholder
 *  observations are never flown against. The one source for scenario.ts and
 *  the tests. With `id` the noise cursor is seeded from it (every
 *  scenario-built pilot); without, it is 0, so hand-built test pilots keep
 *  their exact pre-7e flight (ruling W10). Nothing here refers to the world
 *  clock, so a pilot created at any tick is correct (spec §4.5 item 3). */
export function initialDecision(id?: string, mode: PilotMode = 'engage'): PilotDecisionState {
  return {
    mode, targetId: null, legIndex: 0, loiter: null,
    maneuver: 'pursue', named: 'lead-pursuit', latch: null, nextRescoreS: 0,
    observedTargetPosition: ZERO, observedTargetVelocity: ZERO,
    noiseCursor: id === undefined ? 0 : noiseSeedFor(id), safety: 'none',
  }
}

/** Beyond this separation, Extend has done its job -- see this file's Task 3
 *  "Ruling": without a terminal state, the original always-away formula let
 *  a pursuer dive indefinitely and never return to the fight. A literal,
 *  not `2 * AI_GUN_RANGE_M` imported from `pursuit.ts`: `pursuit.ts` already
 *  imports types from this file (Task 1), and pilot.ts importing a VALUE
 *  back from pursuit.ts would be a real runtime circular dependency, not
 *  just a type-only one that erases at compile time. */
export const SAFE_SEPARATION_M = 1100 // 2x AI_GUN_RANGE_M (550m) as of this plan

/** Extend's rejoin asks for at least the threat's speed plus this, so the
 *  throttle law (`0.65 + (desired - current) x 0.012`) goes to full power
 *  instead of settling at 0.65 while climbing. At 0.65 the rejoin decayed to
 *  84 m/s and never closed (7c plan, "Measured", 2026-09-25). */
export const REJOIN_OVERTAKE_MPS = 30

/** Desired velocity for a pilot choosing to Extend: run away from the threat
 *  and trade altitude for airspeed rather than retreating level. Once
 *  safely clear (see SAFE_SEPARATION_M), rejoin the fight on a shallow
 *  climb instead of diving away forever. */
export function extendDesiredVelocity<M>(self: AircraftEntity<M>, threat: AircraftEntity<M>): Vec3 {
  const separation = sub(self.state.position, threat.state.position)
  if (length(separation) > SAFE_SEPARATION_M) {
    // Safely clear: rejoin on a shallow climb rather than diving away
    // forever. The decision layer's own per-rescore scoring (unchanged)
    // still decides what happens once back in range -- this only stops an
    // indefinite, physically nonsensical dive.
    const toward = normalize(sub(threat.state.position, self.state.position))
    const climb = v3(toward.x, Math.max(toward.y, 0.1), toward.z)
    return scale(normalize(climb), Math.max(length(self.state.velocity), length(threat.state.velocity) + REJOIN_OVERTAKE_MPS))
  }
  const away = normalize(separation)
  // Nose down for airspeed: bias the desired vector toward the horizon-minus,
  // not level -- an Extend that stays level just retreats slowly.
  const dive = v3(away.x, Math.min(away.y, -0.15), away.z)
  const desiredSpeed = length(self.state.velocity) + 40 // accelerate, don't just match
  return scale(normalize(dive), desiredSpeed)
}

/** Below this cross-product magnitude, selfFwd and towardThreat are close
 *  enough to collinear that `cross` is numerically degenerate -- see this
 *  file's finding-1 fix below. */
const HEAD_ON_EPSILON = 1e-6

/** Desired velocity for a pilot choosing to Break: turn hard perpendicular to
 *  self's current velocity, into the plane containing the threat, at a speed
 *  the flight controller reads as a max-rate turn rather than a cruise. */
export function breakDesiredVelocity<M>(self: AircraftEntity<M>, threat: AircraftEntity<M>): Vec3 {
  // Turn into the threat's approach plane at max commanded rate: the
  // direction perpendicular to self's current velocity, on the side that
  // most reduces the threat's angle-off, at a speed the controller reads as
  // "turn hard," not "cruise there."
  const selfFwd = normalize(self.state.velocity)
  const towardThreat = normalize(sub(threat.state.position, self.state.position))
  const rawAxis = cross(selfFwd, towardThreat)
  // Finding 1 (final whole-branch review): in a head-on merge -- selfFwd and
  // towardThreat nearly antiparallel, exactly the geometry the Break-angle
  // fix now correctly triggers Break in -- `rawAxis` approaches the zero
  // vector, and `normalize(ZERO)` is ZERO (src/sim/math/vec3.ts). A 1mm
  // vertical perturbation then flips the commanded break direction between
  // full-up and full-down, and exact collinearity commands nothing at all.
  // Fall back to a stable, arbitrary perpendicular axis: world-up crossed
  // with selfFwd. (If selfFwd itself is nearly vertical this could also
  // degenerate, but that is not the geometry in question here -- a known,
  // accepted edge case, not this fix's job.)
  const turnAxis = normalize(
    length(rawAxis) < HEAD_ON_EPSILON ? cross(v3(0, 1, 0), selfFwd) : rawAxis,
  )
  const breakDir = normalize(cross(turnAxis, selfFwd))
  return scale(breakDir, Math.max(60, length(self.state.velocity)))
}
