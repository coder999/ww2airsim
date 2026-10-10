import { airVelocity } from '../flight/model.js'
import { length } from '../math/vec3.js'
import { nextLandingTracking, NO_LANDING, type LandingReport, type LandingTracking } from '../landing.js'
import type { AircraftEntity, EntityId, ShipEntity } from '../loop.js'
import type { CombatState } from '../weapons/combat.js'
import type { TerrainField } from '../world/terrain.js'
import type { Airfield } from '../world/airfields.js'
import { deckOf, type Deck } from '../world/deck.js'
import { paddlesWindow } from '../paddles.js'
import type { Vec3 } from '../math/vec3.js'
import { RESPOT_DELAY_S, RESPOT_MESSAGE, type RespotOrder } from './respot.js'
import { nextPass, WAVE_OFF_MESSAGE, type PassEvent } from './passes.js'
import type { PlaneState, Station, TriggerWhen } from './schema.js'
import { ticksFor, type MissionLogEntry, type MissionState, type ObjectiveState, type ResolvedObjective } from './state.js'

/**
 * What one tick of a mission reads: `advance`'s loop locals after combat has
 * resolved, not a `World` (plan ruling R5: loop.ts imports this module at
 * runtime, so it may import loop.ts for types only).
 */
export type MissionTick<M> = {
  readonly tick: number
  readonly player: EntityId
  readonly aircraft: readonly AircraftEntity<M>[]
  readonly ships: readonly ShipEntity[]
  readonly combat: CombatState
  readonly terrain: TerrainField | null
  /** The world's wind (`null` is calm): the player's airspeed is air-relative (B4). */
  readonly wind: Vec3 | null
  readonly airfields: readonly Airfield[]
  readonly decks: readonly Deck[]
}

/** The next mission state, and the held groups `advance` must spawn now,
 *  in order. `respot` is the order the deck crew just issued THIS tick, or
 *  `null` on every tick that issues none (M3-R2); `loop.ts` reads it once
 *  and never stores it. */
export type MissionStep<M> = { readonly mission: MissionState<M>; readonly spawns: readonly string[]; readonly respot: RespotOrder | null }

/** Ruling R13: an aircraft is destroyed by damage or by any impact; a ship
 *  or structure by its `destroyedTick`; an entity with no combat record (an
 *  unspawned held one) is not destroyed. Takes only the fields it reads
 *  (`combat`, `aircraft`), not a full `MissionTick`, so the M2 navigation
 *  chart (`src/render/mission/chart.ts`) can call it from a `World`, which
 *  has no `decks` field, without building a fake one. */
export function isDestroyed<M>(t: Pick<MissionTick<M>, 'combat' | 'aircraft'>, id: EntityId): boolean {
  const aircraft = t.combat.aircraft[id]
  if (aircraft !== undefined) {
    if (aircraft.damage.destroyedAt !== null) return true
    return t.aircraft.find((a) => a.id === id)?.impact != null
  }
  const ship = t.combat.ships[id]
  if (ship !== undefined) return ship.destroyedTick !== null
  const structure = t.combat.structures[id]
  return structure !== undefined && structure.destroyedTick !== null
}

const isPresent = <M>(t: MissionTick<M>, id: EntityId): boolean =>
  t.combat.aircraft[id] !== undefined || t.combat.ships[id] !== undefined || t.combat.structures[id] !== undefined

function positionOf<M>(t: MissionTick<M>, id: EntityId): Vec3 | null {
  return t.aircraft.find((a) => a.id === id)?.state.position ?? t.ships.find((s) => s.id === id)?.state.position ?? null
}

/** Horizontal circle, optional altitude band on world y (ruling R9). */
export function insideStation(s: Pick<Station, 'point' | 'radiusM' | 'altitudeM'>, p: Vec3): boolean {
  if (Math.hypot(p.x - s.point.x, p.z - s.point.z) > s.radiusM) return false
  return s.altitudeM === undefined || (p.y >= s.altitudeM[0] && p.y <= s.altitudeM[1])
}

const within = (r: readonly [number, number], x: number): boolean => x >= r[0] && x <= r[1]

/**
 * B4: whether the player's airplane matches every field of `want` this tick.
 * Reads the same numbers the cockpit shows: the gear, flap and door travel
 * (`up`/`shut` is fully retracted, `down`/`open` fully extended, so a gear
 * still in transit is neither), the throttle lever, altitude above sea level
 * and air-relative speed (`gauges.ts` 'airspeed'). Pure.
 */
export function planeStateHolds<M>(want: PlaneState, p: AircraftEntity<M>, wind: Vec3 | null): boolean {
  const s = p.state
  if (want.gear !== undefined && !(want.gear === 'down' ? s.gearFraction >= 1 : s.gearFraction <= 0)) return false
  if (want.flaps !== undefined && !(want.flaps === 'down' ? s.flapFraction >= 1 : s.flapFraction <= 0)) return false
  if (want.bayDoors !== undefined && !(want.bayDoors === 'open' ? s.bayDoorFraction >= 1 : s.bayDoorFraction <= 0)) return false
  if (want.altitudeM !== undefined && !within(want.altitudeM, s.position.y)) return false
  if (want.throttle !== undefined && !within(want.throttle, p.controls.throttle)) return false
  return want.airspeedMps === undefined || within(want.airspeedMps, length(airVelocity(s, wind)))
}

type Context<M> = {
  readonly t: MissionTick<M>
  readonly player: AircraftEntity<M>
  /** Ruling R12: player-relative evaluation stops once this is false. */
  readonly alive: boolean
  readonly recovery: LandingTracking
  readonly landing: LandingReport | null
  /** How the player's pass at the `approaches` ship resolved this tick. */
  readonly passEvent: PassEvent
}

function evaluate<M>(o: ResolvedObjective, p: ObjectiveState, c: Context<M>): ObjectiveState {
  const here = c.player.state.position
  switch (o.kind) {
    case 'destroy': {
      const n = o.resolved.filter((id) => isDestroyed(c.t, id)).length
      const need = o.count ?? o.resolved.length
      if (n === p.count && n < need) return p
      return { ...p, count: n, status: n >= need ? 'complete' : 'active' }
    }
    case 'protect': {
      const lost = o.resolved.filter((id) => isDestroyed(c.t, id)).length
      if (lost === p.count) return p
      return { ...p, count: lost, status: lost > (o.maxLost ?? 0) ? 'failed' : 'active' }
    }
    case 'deny': {
      const center = typeof o.around === 'string' ? positionOf(c.t, o.around) : o.around
      if (center === null) return p
      const breached = o.resolved.some((id) => {
        if (!isPresent(c.t, id) || isDestroyed(c.t, id)) return false
        const q = positionOf(c.t, id)
        return q !== null && Math.hypot(q.x - center.x, q.z - center.z) <= o.radiusM
      })
      return breached ? { ...p, status: 'failed' } : p
    }
    case 'takeoff':
      return c.alive && (c.recovery.airborne || c.landing !== null) ? { ...p, status: 'complete' } : p
    case 'land': {
      if (c.landing === null || c.landing.at?.id !== o.at) return p
      const n = p.count + 1
      return { ...p, count: n, status: n >= (o.count ?? 1) ? 'complete' : 'active' }
    }
    case 'reach':
      return c.alive && insideStation(o, here) ? { ...p, status: 'complete' } : p
    case 'hold': {
      if (!c.alive || !insideStation(o, here)) return p
      const held = p.heldTicks + 1
      return { ...p, heldTicks: held, status: held >= ticksFor(o.seconds) ? 'complete' : 'active' }
    }
    case 'state':
      return c.alive && planeStateHolds(o, c.player, c.t.wind) ? { ...p, status: 'complete' } : p
    case 'approaches': {
      if (c.passEvent !== 'missed') return p
      const missed = p.count + 1
      return { ...p, count: missed, status: missed > (o.maxMissed ?? 0) ? 'failed' : 'active' }
    }
  }
}

function conditionMet<M>(w: TriggerWhen, m: MissionState<M>, progress: readonly ObjectiveState[], c: Context<M>): boolean {
  if ('at' in w) return c.t.tick >= ticksFor(w.at)
  if ('completed' in w) {
    const id = w.completed
    return progress[m.objectives.findIndex((o) => o.id === id)]!.status === 'complete'
  }
  if ('failed' in w) {
    const id = w.failed
    return progress[m.objectives.findIndex((o) => o.id === id)]!.status === 'failed'
  }
  if ('state' in w) return c.alive && planeStateHolds(w.state, c.player, c.t.wind)
  return c.alive && insideStation(w.enters, c.player.state.position)
}

/**
 * One tick of a mission (spec 2026-09-25 §1-§2), run by `advance` after
 * `stepCombat`. Pure. In order:
 *  1. the player's landing tracker (ruling R1), reset after each landing,
 *     then his pass at the `approaches` ship (M3-R4);
 *  2. objectives, one pass in file order (ruling R8);
 *  3. the landing's log entry and progress message (ruling R7), and the
 *     pass's;
 *  4. triggers, in file order, each once (spec §2.2).
 * Returns the SAME mission object when nothing changed.
 */
export function stepMission<M>(m: MissionState<M>, t: MissionTick<M>): MissionStep<M> {
  const player = t.aircraft.find((a) => a.id === t.player)
  if (player === undefined) throw new Error(`stepMission: no player aircraft "${t.player}"`)
  const record = t.combat.aircraft[t.player]
  const alive = player.impact === null && (record === undefined || record.damage.destroyedAt === null)
  const added: MissionLogEntry[] = []

  // 1. Recovery, on the player's own step: `previous` is its state before
  //    this tick, `state` after (loop.ts `stepAircraftEntity`).
  let recovery = m.recovery
  let landing: LandingReport | null = null
  if (alive) {
    recovery = nextLandingTracking(player.spec, m.recovery, player.previous, player.state, t.terrain, t.airfields, t.decks)
    if (recovery.report !== null) {
      landing = recovery.report
      recovery = NO_LANDING
    }
  }

  // 1b. The pass (M3-R4), only while the `approaches` objective is active.
  //     `recovery.airborne` keeps the window to approaches: the start and
  //     respot spot near the stern is astern of the zone center, so a deck
  //     roll from there with the hook down is inside paddlesCue's gate (M3
  //     Task 3, measured 2026-09-26; at rest it is not, since ruling F-I2
  //     needs closure on the deck), and a deck roll is not a pass. It is false from spawn or a landing until the wheels
  //     have been 10 m clear, so it never closes a pass before touchdown.
  let pass = m.pass
  let passEvent: PassEvent = null
  const approachAt = m.objectives.findIndex((o) => o.kind === 'approaches')
  const approach = approachAt < 0 ? undefined : m.objectives[approachAt]
  if (approach?.kind === 'approaches' && m.progress[approachAt]!.status === 'active' && alive) {
    const ship = t.ships.find((s) => s.id === approach.at)
    const deck = ship === undefined ? null : deckOf(ship)
    const paddles = ship?.spec.paddles
    const inWindow = recovery.airborne && deck !== null && paddles !== undefined
      && paddlesWindow(player.spec, player.state, player.controls, deck, paddles)
    const r = nextPass(pass, inWindow, landing !== null && landing.at?.id === approach.at, t.tick)
    pass = r.pass
    passEvent = r.event
  }
  const c: Context<M> = { t, player, alive, recovery, landing, passEvent }

  // 2. Objectives.
  let progress: ObjectiveState[] | null = null
  let advanced: { readonly id: string; readonly label: string; readonly n: number; readonly count: number; readonly done: boolean } | null = null
  for (let i = 0; i < m.objectives.length; i++) {
    const o = m.objectives[i]!
    const before = (progress ?? m.progress)[i]!
    let p = before
    if (p.status === 'inactive') {
      const gate = (progress ?? m.progress)[m.objectives.findIndex((x) => x.id === o.after)]!
      if (gate.status !== 'complete') continue
      p = { ...p, status: 'active' }
    }
    if (p.status === 'active') {
      const next = evaluate(o, p, c)
      if (o.kind === 'land' && next.count > p.count) {
        advanced ??= { id: o.id, label: o.label, n: next.count, count: o.count ?? 1, done: next.status === 'complete' }
      }
      if (next.status === 'complete') added.push({ tick: t.tick, kind: 'objective', id: o.id, status: 'complete' })
      if (next.status === 'failed') {
        added.push({ tick: t.tick, kind: 'objective', id: o.id, status: 'failed' })
        added.push({ tick: t.tick, kind: 'message', text: `${o.label}: failed` })
      }
      p = next
    }
    if (p !== before) {
      progress ??= [...m.progress]
      progress[i] = p
    }
  }

  // 3. The landing's own entry, then "Trap n of count" (spec §4.1).
  if (landing !== null) {
    added.push({ tick: t.tick, kind: 'landing', at: landing.at, advanced: advanced?.id ?? null, intermediate: advanced !== null && !advanced.done })
    if (advanced !== null && advanced.count > 1) added.push({ tick: t.tick, kind: 'message', text: `${advanced.label} ${advanced.n} of ${advanced.count}` })
  }
  if (passEvent !== null) {
    added.push({ tick: t.tick, kind: 'pass', result: passEvent })
    if (passEvent === 'missed') added.push({ tick: t.tick, kind: 'message', text: WAVE_OFF_MESSAGE })
  }

  // M3-R2: after an intermediate landing that advances a `respot` land
  // objective, arm the timer; when it comes due (and the player is still
  // alive), issue the respot order and log it plus the radio line.
  let pendingRespotTick = m.pendingRespotTick
  const byLanding = advanced === null ? undefined : m.objectives.find((o) => o.id === advanced.id)
  if (landing !== null && advanced !== null && !advanced.done && m.respot !== null
      && byLanding?.kind === 'land' && byLanding.respot === true) {
    pendingRespotTick = t.tick + ticksFor(RESPOT_DELAY_S)
  }
  let respot: RespotOrder | null = null
  if (pendingRespotTick !== null && t.tick >= pendingRespotTick) {
    pendingRespotTick = null
    if (alive) {
      respot = m.respot
      added.push({ tick: t.tick, kind: 'respot' })
      added.push({ tick: t.tick, kind: 'message', text: RESPOT_MESSAGE })
    }
  }

  // 4. Triggers: after objectives, in file order, each once (spec §2.2).
  //    `then` runs in list order; spawns are applied by `advance`, in the
  //    order returned, at the end of this tick.
  let fired: string[] | null = null
  const spawns: string[] = []
  for (const trigger of m.triggers) {
    if ((fired ?? m.fired).includes(trigger.id)) continue
    if (!conditionMet(trigger.when, m, progress ?? m.progress, c)) continue
    fired ??= [...m.fired]
    fired.push(trigger.id)
    added.push({ tick: t.tick, kind: 'trigger', id: trigger.id })
    for (const action of trigger.then) {
      if ('spawn' in action) {
        spawns.push(action.spawn)
        added.push({ tick: t.tick, kind: 'spawn', group: action.spawn })
      } else {
        added.push({ tick: t.tick, kind: 'message', text: action.message })
      }
    }
  }

  if (recovery === m.recovery && progress === null && fired === null && added.length === 0
      && pendingRespotTick === m.pendingRespotTick && pass === m.pass) return { mission: m, spawns, respot: null }
  return {
    mission: {
      ...m,
      recovery,
      progress: progress ?? m.progress,
      fired: fired ?? m.fired,
      log: added.length > 0 ? [...m.log, ...added] : m.log,
      pendingRespotTick,
      pass,
    },
    spawns,
    respot,
  }
}
