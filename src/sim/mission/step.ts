import { airVelocity, DT } from '../flight/model.js'
import { length, v3 } from '../math/vec3.js'
import { qRotate, type Quat } from '../math/quat.js'
import { airborne } from '../ai/airborne.js'
import { nextLandingTracking, NO_LANDING, type LandingReport, type LandingTracking } from '../landing.js'
import type { AircraftEntity, EntityId, ShipEntity } from '../loop.js'
import type { VehicleEntity } from '../world/vehicles.js'
import type { CombatState } from '../weapons/combat.js'
import type { TerrainField } from '../world/terrain.js'
import type { Airfield } from '../world/airfields.js'
import { deckOf, type Deck } from '../world/deck.js'
import { paddlesWindow } from '../paddles.js'
import type { Vec3 } from '../math/vec3.js'
import { RESPOT_CLIMB_MESSAGE, RESPOT_DELAY_S, RESPOT_MESSAGE, type RespotOrder } from './respot.js'
import { nextPass, WAVE_OFF_MESSAGE, type PassEvent } from './passes.js'
import type { Gone, PlaneState, Station, TriggerWhen } from './schema.js'
import { ticksFor, type FieldOverride, type MissionLogEntry, type MissionState, type ObjectiveState, type ObjectiveStatus, type ResolvedObjective } from './state.js'
import { waterSurfaceContext } from '../waterSurface.js'
import { finalStatus } from './outcome.js'
import { friendlyBaseAt, type Anchorage, type FriendlyBase } from '../friendly.js'
import { effectiveFields, fieldMeets, fieldState } from './fields.js'
import type { StructureEntity } from '../weapons/structures.js'

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
  readonly vehicles: readonly VehicleEntity[]
  readonly combat: CombatState
  readonly terrain: TerrainField | null
  /** The world's wind (`null` is calm): the player's airspeed is air-relative (B4). */
  readonly wind: Vec3 | null
  readonly airfields: readonly Airfield[]
  readonly decks: readonly Deck[]
  /** F5C: who holds each airfield (its structures' side) and the declared anchorages, for the recovery rule. */
  readonly structures: readonly StructureEntity[]
  readonly anchorages?: readonly Anchorage[] | undefined
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
  const vehicle = t.combat.vehicles[id]
  if (vehicle !== undefined) return vehicle.destroyedTick !== null
  const structure = t.combat.structures[id]
  return structure !== undefined && structure.destroyedTick !== null
}

/** Whether aircraft `id` has released `store`, read from its own combat record (the same read the player's `release` objective makes). */
function hasReleased<M>(t: Pick<MissionTick<M>, 'combat'>, id: EntityId, store: 'bomb' | 'rocket' | 'torpedo'): boolean {
  const r = t.combat.aircraft[id]
  if (r === undefined) return false
  return store === 'rocket' ? r.rocketsFired > 0 : store === 'torpedo' ? r.torpedoesDropped > 0 : r.bombsDropped - r.torpedoesDropped > 0
}

const isPresent = <M>(t: MissionTick<M>, id: EntityId): boolean =>
  t.combat.aircraft[id] !== undefined || t.combat.ships[id] !== undefined || t.combat.vehicles[id] !== undefined || t.combat.structures[id] !== undefined

function positionOf<M>(t: MissionTick<M>, id: EntityId): Vec3 | null {
  return t.aircraft.find((a) => a.id === id)?.state.position ?? t.ships.find((s) => s.id === id)?.state.position ?? t.vehicles.find((v) => v.id === id)?.state.position ?? null
}

/** Horizontal circle, optional altitude band on world y (ruling R9). */
export function insideStation(s: Pick<Station, 'point' | 'radiusM' | 'altitudeM' | 'innerRadiusM'>, p: Vec3): boolean {
  const d = Math.hypot(p.x - s.point.x, p.z - s.point.z)
  if (d > s.radiusM || (s.innerRadiusM !== undefined && d < s.innerRadiusM)) return false
  return s.altitudeM === undefined || (p.y >= s.altitudeM[0] && p.y <= s.altitudeM[1])
}

const within = (r: readonly [number, number], x: number): boolean => x >= r[0] && x <= r[1]

/** The nose's compass heading in degrees: 0 is north (-z), 90 east (+x), the same convention `headingDeg` uses in a scenario. */
export function noseHeadingDeg(attitude: Quat): number {
  const f = qRotate(attitude, v3(1, 0, 0))
  const h = (Math.atan2(f.x, -f.z) * 180) / Math.PI
  return h < 0 ? h + 360 : h
}
/** `[from, to]` clockwise; `from > to` runs through north. */
const headingWithin = (r: readonly [number, number], h: number): boolean => (r[0] <= r[1] ? h >= r[0] && h <= r[1] : h >= r[0] || h <= r[1])

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
  if (want.headingDeg !== undefined && !headingWithin(want.headingDeg, noseHeadingDeg(s.attitude))) return false
  if (want.groundSpeedMps !== undefined && !within(want.groundSpeedMps, Math.hypot(s.velocity.x, s.velocity.z))) return false
  return want.airspeedMps === undefined || within(want.airspeedMps, length(airVelocity(s, wind)))
}

/** The living, spawned members of `ids`, and the horizontal centroid of their positions (null when there are none). */
function centroidOf<M>(t: MissionTick<M>, ids: readonly EntityId[]): { readonly x: number; readonly z: number } | null {
  let n = 0
  let x = 0
  let z = 0
  for (const id of ids) {
    if (!isPresent(t, id) || isDestroyed(t, id)) continue
    const q = positionOf(t, id)
    if (q === null) continue
    n++
    x += q.x
    z += q.z
  }
  return n === 0 ? null : { x: x / n, z: z / n }
}

/** F10-0: whether every named entity has left play (see `GoneObject`). An unspawned held entity has not left. */
function isGone<M>(g: Gone, m: MissionState<M>, t: MissionTick<M>): boolean {
  const ids = g.targets.flatMap((ref) => m.refs[ref] ?? [])
  if (ids.length === 0) return false
  const center = g.awayFrom === undefined ? null : typeof g.awayFrom === 'string' ? positionOf(t, g.awayFrom) : g.awayFrom
  return ids.every((id) => {
    if (!isPresent(t, id)) return false
    if (isDestroyed(t, id)) return true
    const a = t.aircraft.find((x) => x.id === id)
    if (a !== undefined && !airborne(a, t.terrain, t.decks)) return true
    if (center === null || g.beyondM === undefined) return false
    const q = positionOf(t, id)
    return q !== null && Math.hypot(q.x - center.x, q.z - center.z) > g.beyondM
  })
}

type Context<M> = {
  readonly m: MissionState<M>
  /** An objective's status as the current pass stands (file order: an earlier objective's new status is already in). */
  readonly status: (id: string) => ObjectiveStatus
  readonly t: MissionTick<M>
  readonly player: AircraftEntity<M>
  /** Ruling R12: player-relative evaluation stops once this is false. */
  readonly alive: boolean
  readonly recovery: LandingTracking
  readonly landing: LandingReport | null
  /** F5C D3: the friendly base the landing came to rest on, or `null` (also `null` when there is no landing). */
  readonly base: FriendlyBase | null
  /** How the player's pass at the `approaches` ship resolved this tick. */
  readonly passEvent: PassEvent
}

function evaluate<M>(o: ResolvedObjective, p: ObjectiveState, c: Context<M>): ObjectiveState {
  const here = c.player.state.position
  switch (o.kind) {
    case 'destroy': {
      const base = p.base ?? 0
      const n = o.resolved.filter((id) => isDestroyed(c.t, id)).length - base
      const need = o.count ?? o.resolved.length - base
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
      // F5C D3: a suggested recovery is met by ANY friendly base; any other land objective names its place.
      if (c.landing === null || (o.suggestedRecovery === true ? c.base === null : c.landing.at?.id !== o.at)) return p
      // F10-0: the landing counts only while the fields it names are (un)serviceable at this tick.
      const need = o.requires
      if (need !== undefined) {
        if (need.serviceable?.some((id) => !fieldState(c.m, c.t, id).serviceable) === true) return p
        if (need.unserviceable?.some((id) => fieldState(c.m, c.t, id).serviceable) === true) return p
      }
      const n = p.count + 1
      return { ...p, count: n, status: n >= (o.count ?? 1) ? 'complete' : 'active' }
    }
    case 'reach':
      return c.alive && insideStation(o, here) ? { ...p, status: 'complete' } : p
    case 'hold': {
      if (!c.alive) return p
      const center = o.relativeTo === undefined ? null : centroidOf(c.t, c.m.refs[o.relativeTo] ?? [])
      // A relative station with no living member has nothing to follow: nobody is inside it.
      const inside = o.relativeTo === undefined
        ? insideStation(o, here)
        : center !== null && insideStation({ ...o, point: { x: center.x + o.point.x, z: center.z + o.point.z } }, here)
      if (!inside) return o.resetOnExit === true && p.heldTicks !== 0 ? { ...p, heldTicks: 0 } : p
      const held = p.heldTicks + 1
      return { ...p, heldTicks: held, status: held >= ticksFor(o.seconds) ? 'complete' : 'active' }
    }
    case 'state': {
      if (!c.alive) return p
      const holds = planeStateHolds(o, c.player, c.t.wind)
      if (o.dwellS === undefined) return holds ? { ...p, status: 'complete' } : p
      if (!holds) return p.heldTicks === 0 ? p : { ...p, heldTicks: 0, ...(o.failOnExit === true ? { status: 'failed' as const } : {}) }
      const held = p.heldTicks + 1
      return { ...p, heldTicks: held, status: held >= ticksFor(o.dwellS) ? 'complete' : 'active' }
    }
    case 'release': {
      const record = c.t.combat.aircraft[c.t.player]
      if (!c.alive || record === undefined) return p
      const n = o.store === 'rocket'
        ? record.rocketsFired
        : o.store === 'torpedo'
          ? record.torpedoesDropped
          : record.bombsDropped - record.torpedoesDropped
      const need = o.count ?? 1
      return n === p.count && n < need ? p : { ...p, count: n, status: n >= need ? 'complete' : 'active' }
    }
    case 'approaches': {
      if (c.passEvent !== 'missed') return p
      const missed = p.count + 1
      return { ...p, count: missed, status: missed > (o.maxMissed ?? 0) ? 'failed' : 'active' }
    }
    case 'arrive': {
      const seen = p.seen ?? []
      const fresh = o.resolved.filter((id) => !seen.includes(id) && isPresent(c.t, id) && !isDestroyed(c.t, id) && ((q) => q !== null && insideStation(o.zone, q))(positionOf(c.t, id)))
      if (fresh.length === 0) return p
      const all = [...seen, ...fresh]
      return { ...p, seen: all, count: all.length, status: all.length >= (o.count ?? o.resolved.length) ? 'complete' : 'active' }
    }
    case 'released': {
      const n = o.resolved.filter((id) => hasReleased(c.t, id, o.store)).length
      const need = o.count ?? o.resolved.length
      return n === p.count && n < need ? p : { ...p, count: n, status: n >= need ? 'complete' : 'active' }
    }
    case 'preventRelease': {
      // F10E: destroyed with nothing released is a stop; a release (even by one that then died) is a miss that can never be undone.
      const n = o.resolved.filter((id) => isDestroyed(c.t, id) && !hasReleased(c.t, id, o.store)).length
      const missed = o.resolved.filter((id) => hasReleased(c.t, id, o.store)).length
      const need = o.count ?? o.resolved.length
      if (n >= need) return { ...p, count: n, status: 'complete' }
      if (o.resolved.length - missed < need) return { ...p, count: n, status: 'failed' }
      return n === p.count ? p : { ...p, count: n }
    }
    case 'damage': {
      const n = o.resolved.filter((id) => {
        const d = c.t.combat.ships[id]
        const ship = c.t.ships.find((x) => x.id === id)
        return d !== undefined && ship !== undefined && (d.destroyedTick !== null || d.hp / ship.spec.hullHp < o.belowHpFraction)
      }).length
      const need = o.count ?? 1
      return n === p.count && n < need ? p : { ...p, count: n, status: n >= need ? 'complete' : 'active' }
    }
    case 'field': {
      const want = { serviceable: o.serviceable ?? true, heldBy: o.heldBy }
      const n = o.airfields.filter((id) => fieldMeets(c.m, c.t, id, want)).length
      const need = o.min ?? o.airfields.length
      if (o.keep === true) return n < need ? { ...p, count: n, status: 'failed' } : n === p.count ? p : { ...p, count: n }
      return n === p.count && n < need ? p : { ...p, count: n, status: n >= need ? 'complete' : 'active' }
    }
    case 'atLeast': {
      const done = o.of.filter((id) => c.status(id) === 'complete').length
      const failed = o.of.filter((id) => c.status(id) === 'failed').length
      if (done >= o.n) return { ...p, count: done, status: 'complete' }
      if (o.of.length - failed < o.n) return { ...p, count: done, status: 'failed' }
      return done === p.count ? p : { ...p, count: done }
    }
  }
}

function conditionMet<M>(w: TriggerWhen, m: MissionState<M>, progress: readonly ObjectiveState[], c: Context<M>): boolean {
  if ('at' in w) return c.t.tick - (m.clockOriginTick ?? 0) >= ticksFor(w.at)
  if ('completed' in w) {
    const id = w.completed
    return progress[m.objectives.findIndex((o) => o.id === id)]!.status === 'complete'
  }
  if ('failed' in w) {
    const id = w.failed
    return progress[m.objectives.findIndex((o) => o.id === id)]!.status === 'failed'
  }
  if ('state' in w) return c.alive && planeStateHolds(w.state, c.player, c.t.wind)
  if ('gone' in w) return isGone(w.gone, m, c.t)
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
    recovery = nextLandingTracking(
      player.spec,
      m.recovery,
      player.previous,
      player.state,
      t.terrain,
      t.airfields,
      t.decks,
      waterSurfaceContext(t.tick * DT, t.wind),
    )
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
  // F10-0: the recovery rule sees the field state as the mission has changed it (a bombed field, a captured one).
  const seen = effectiveFields(m, t)
  const base = landing === null ? null : friendlyBaseAt(
    { player: t.player, aircraft: t.aircraft, airfields: seen.airfields, structures: seen.structures, ships: t.ships, anchorages: t.anchorages },
    landing.at, player.state.position,
  )
  // 2. Objectives.
  let progress: ObjectiveState[] | null = null
  // F10-0 (Decision 13): once the mission has latched, only landings are tracked. A later stop still needs its log entry so the debrief and the
  // stop card read the right landing; nothing else changes, so Continue Sortie is a free sortie.
  if (m.latched === true) {
    if (recovery === m.recovery && landing === null) return { mission: m, spawns: [], respot: null }
    return {
      mission: {
        ...m, recovery,
        log: landing === null ? m.log : [...m.log, { tick: t.tick, kind: 'landing', at: landing.at, base, advanced: null, intermediate: false }],
      },
      spawns: [],
      respot: null,
    }
  }
  const c: Context<M> = {
    m, t, player, alive, recovery, landing, base, passEvent,
    status: (id) => (progress ?? m.progress)[m.objectives.findIndex((x) => x.id === id)]!.status,
  }
  let advanced: { readonly id: string; readonly label: string; readonly n: number; readonly count: number; readonly done: boolean } | null = null
  for (let i = 0; i < m.objectives.length; i++) {
    const o = m.objectives[i]!
    const before = (progress ?? m.progress)[i]!
    let p = before
    if (p.status === 'inactive') {
      const gate = (progress ?? m.progress)[m.objectives.findIndex((x) => x.id === o.after)]!
      if (gate.status !== 'complete') continue
      p = { ...p, status: 'active' }
      // F10-0 `fresh`: what was already destroyed when this objective woke up does not count.
      if (o.kind === 'destroy' && o.fresh === true) p = { ...p, base: o.resolved.filter((id) => isDestroyed(t, id)).length }
    }
    if (p.status === 'active') {
      let next = evaluate(o, p, c)
      // F10-0 window: still active when `until` is met closes it. A standing order that never failed completes; anything else fails.
      if (next.status === 'active' && o.until !== undefined && conditionMet(o.until, m, progress ?? m.progress, c)) {
        next = { ...next, status: o.kind === 'protect' || o.kind === 'deny' ? 'complete' : 'failed' }
      }
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
    added.push({ tick: t.tick, kind: 'landing', at: landing.at, base, advanced: advanced?.id ?? null, intermediate: advanced !== null && !advanced.done })
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
      added.push({ tick: t.tick, kind: 'message', text: RESPOT_CLIMB_MESSAGE })
    }
  }

  // 4. Triggers: after objectives, in file order, each once (spec §2.2).
  //    `then` runs in list order; spawns are applied by `advance`, in the
  //    order returned, at the end of this tick.
  let fired: string[] | null = null
  let fields = m.fields
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
      } else if ('message' in action) {
        added.push({ tick: t.tick, kind: 'message', text: action.message })
      } else if ('complete' in action || 'fail' in action) {
        // F10-0: a phase closes. Forcing an objective that is already complete or failed changes nothing.
        const id = 'complete' in action ? action.complete : action.fail
        const at = m.objectives.findIndex((x) => x.id === id)
        const now = (progress ?? m.progress)[at]!
        if (now.status === 'complete' || now.status === 'failed') continue
        const status = 'complete' in action ? 'complete' : 'failed'
        progress ??= [...m.progress]
        progress[at] = { ...now, status }
        added.push({ tick: t.tick, kind: 'objective', id, status })
        if (status === 'failed') added.push({ tick: t.tick, kind: 'message', text: `${m.objectives[at]!.label}: failed` })
      } else {
        // F10-0 mutable airfield state.
        const [id, set]: [string, FieldOverride] = 'setServiceable' in action
          ? [action.setServiceable.airfield, { serviceable: action.setServiceable.value }]
          : [action.setSide.airfield, { side: action.setSide.side }]
        fields = { ...(fields ?? {}), [id]: { ...(fields?.[id] ?? {}), ...set } }
      }
    }
  }

  // The landing that completes the mission (every primary done, at a friendly base) freezes it, when the scenario asked.
  const latch = m.freezeOnSuccess === true && m.egress === undefined && landing !== null && base !== null
    && m.objectives.every((o, i) => o.priority !== 'primary' || finalStatus(o, (progress ?? m.progress)[i]!) === 'complete')
  if (recovery === m.recovery && progress === null && fired === null && added.length === 0 && !latch
      && pendingRespotTick === m.pendingRespotTick && pass === m.pass && fields === m.fields) return { mission: m, spawns, respot: null }
  return {
    mission: {
      ...m,
      recovery,
      progress: progress ?? m.progress,
      fired: fired ?? m.fired,
      log: added.length > 0 ? [...m.log, ...added] : m.log,
      pendingRespotTick,
      pass,
      ...(fields === m.fields ? {} : { fields }),
      ...(latch ? { latched: true as const } : {}),
    },
    spawns,
    respot,
  }
}
