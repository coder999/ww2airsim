import { playerAircraft, type World } from '../../sim/loop.js'
import { v3, type Vec3 } from '../../sim/math/vec3.js'
import { APPROACH_SPEED_STALL_MULTIPLE } from '../../sim/paddles.js'
import { effectiveStallSpeedMps } from '../../sim/ground.js'
import { nearestFriendlySite, siteUsableBy } from '../../sim/friendly.js'
import { deckAxes, deckLocal, deckOf, deckWorld } from '../../sim/world/deck.js'
import { heightAt } from '../../sim/world/terrain.js'
import { mapPoints, selectedPoint, type MapPoint } from '../missionMap.js'
import { METERS_PER_MILE } from '../radar.js'

/** Read-only guidance over the live world. It owns no navigation state:
 *  the chart selection remains render state, and mission progress remains in
 *  `World.mission`.
 *  `target` is the world point the 3D arrow and marker use (scene/steeringArrow.ts). */
export type SteeringCue = {
  readonly label: string
  readonly rangeMi: number
  readonly target: Vec3
  readonly source: 'objective' | 'chart'
}

type SteeringTarget = {
  readonly point: MapPoint
  readonly label: string
  readonly source: SteeringCue['source']
  /** A virtual approach point carries its own height instead of borrowing
   *  the carrier's waterline altitude from the chart point. */
  readonly altitudeM?: number
}

const entityId = (point: MapPoint): string => point.id.slice(point.id.indexOf(':') + 1)

const groundHeight = <M>(world: World<M>, point: Pick<MapPoint, 'x' | 'z'>): number =>
  world.terrain === null ? 0 : Math.max(0, heightAt(world.terrain, point.x, point.z))

/** A point's useful vertical destination. A station with an altitude band
 *  asks only for the nearest edge when the player is outside it, and reads
 *  level while inside it, so the arrow points at the band rather than an
 *  arbitrary midpoint. */
function targetAltitude<M>(world: World<M>, point: MapPoint, playerY: number): number {
  const id = entityId(point)
  if (point.kind === 'aircraft') return world.aircraft.find((a) => a.id === id)?.state.position.y ?? groundHeight(world, point)
  if (point.kind === 'ship' || point.kind === 'carrier') return world.ships.find((s) => s.id === id)?.state.position.y ?? 0
  if (point.kind === 'structure') return world.structures.find((s) => s.id === id)?.position.y ?? groundHeight(world, point)
  if (point.kind === 'station') {
    const objective = world.mission?.objectives.find((o) => o.id === id)
    if (objective !== undefined && (objective.kind === 'reach' || objective.kind === 'hold') && objective.altitudeM !== undefined) {
      const [low, high] = objective.altitudeM
      return Math.min(high, Math.max(low, playerY))
    }
  }
  return groundHeight(world, point)
}

function pointForBase(points: readonly MapPoint[], id: string): MapPoint | null {
  const airfield = points.find((point) => point.id === `airfield:${id}`)
  if (airfield !== undefined) return airfield
  return points.find((point) => point.id === `ship:${id}`) ?? null
}

const FT_PER_M = 1 / 0.3048
const MPH_PER_MPS = 3600 / METERS_PER_MILE

/**
 * A carrier recovery has two useful steering destinations, neither of which
 * is the carrier's chart marker:
 *
 * - outside the groove, a moving LINEUP point at 90% of Paddles' maximum
 *   range, on the real glideslope;
 * - once astern, inside Paddles' cone and closing, the trap-zone centre.
 *
 * This is render-only guidance over live sim geometry. It does not move the
 * ship, score a pass or fly the airplane. The 90% entry leaves a little
 * margin inside the Paddles window instead of asking the pilot to hit its
 * exact boundary.
 */
function carrierRecoveryTarget<M>(
  world: World<M>,
  shipId: string,
  chartPoint: MapPoint,
): SteeringTarget | null {
  const ship = world.ships.find((candidate) => candidate.id === shipId)
  const deck = ship === undefined ? null : deckOf(ship)
  const paddles = ship?.spec.paddles
  if (ship === undefined || deck === null || paddles === undefined) return null

  const player = playerAircraft(world)
  const zoneZ = -deck.lengthM / 2 + (deck.trapFromSternM + deck.trapToSternM) / 2
  const local = deckLocal(deck, player.state.position.x, player.state.position.z)
  const asternM = zoneZ - local.z
  const rangeM = Math.hypot(asternM, local.x)
  const offAxisDeg = Math.abs(Math.atan2(local.x, asternM)) * 180 / Math.PI
  const { bow } = deckAxes(deck)
  const closingMps =
    (player.state.velocity.x - deck.velocity.x) * bow.x
    + (player.state.velocity.z - deck.velocity.z) * bow.z
  const inGroove =
    asternM > 0
    && rangeM <= paddles.maxRangeM
    && offAxisDeg <= paddles.coneHalfAngleDeg
    && closingMps > 0

  const approachMph = Math.round(
    APPROACH_SPEED_STALL_MULTIPLE * effectiveStallSpeedMps(player.spec, 1) * MPH_PER_MPS,
  )
  if (inGroove) {
    const trap = deckWorld(deck, 0, zoneZ)
    return {
      point: { ...chartPoint, x: trap.x, z: trap.z },
      label: `FINAL · ${approachMph} MPH · GEAR FLAPS HOOK`,
      source: 'objective',
      altitudeM: deck.center.y + player.spec.gear.heightM,
    }
  }

  const entryRangeM = paddles.maxRangeM * 0.9
  const entry = deckWorld(deck, 0, zoneZ - entryRangeM)
  const entryAltitudeM =
    deck.center.y
    + player.spec.gear.heightM
    + entryRangeM * Math.tan(paddles.glideslopeDeg * Math.PI / 180)
  const entryAltitudeFt = Math.round(entryAltitudeM * FT_PER_M / 50) * 50
  return {
    point: { ...chartPoint, x: entry.x, z: entry.z },
    label: `LINEUP · ${approachMph} MPH · ${entryAltitudeFt} FT`,
    source: 'objective',
    altitudeM: entryAltitudeM,
  }
}

/** The first active primary that is a finite destination. Protect, deny and
 *  approaches are standing orders (the objective line omits them too), so
 *  they must not mask a later recovery objective that is active at the same
 *  time. A destroy group follows its nearest live member. */
function objectiveTarget<M>(world: World<M>, points: readonly MapPoint[]): SteeringTarget | null {
  const mission = world.mission
  if (mission === null) return null
  const active = mission.objectives.find((objective, index) =>
    objective.priority === 'primary'
    && mission.progress[index]!.status === 'active'
    && objective.kind !== 'protect'
    && objective.kind !== 'deny'
    && objective.kind !== 'approaches')
  if (active === undefined) return null

  let point: MapPoint | null = null
  if (active.kind === 'takeoff') point = pointForBase(points, active.from)
  else if (active.kind === 'land' && active.suggestedRecovery === true) {
    // F5C D3: the authored base is only a suggestion; steer to the nearest friendly site this airplane can use.
    const player = playerAircraft(world)
    const site = nearestFriendlySite(world, player.state.position, siteUsableBy(player.spec))
    if (site === null) return null
    point = (site.kind === 'anchorage' ? null : pointForBase(points, site.id))
      ?? { id: `anchorage:${site.id}`, kind: 'station', label: site.name, x: site.x, z: site.z, targetable: false }
    const label = `${active.label}: ${site.name}`
    if (site.kind === 'carrier') {
      const recovery = carrierRecoveryTarget(world, site.id, point)
      if (recovery !== null) return recovery
    }
    return { point, label, source: 'objective' }
  }
  else if (active.kind === 'land') {
    point = pointForBase(points, active.at)
    if (point !== null) {
      const recovery = carrierRecoveryTarget(world, active.at, point)
      if (recovery !== null) return recovery
    }
  }
  else if (active.kind === 'reach' || active.kind === 'hold' || active.kind === 'pickup' || active.kind === 'landedNear') point = points.find((p) => p.id === `station:${active.id}`) ?? null
  else if (active.kind === 'release' && active.target !== undefined) point = points.find((p) => entityId(p) === active.target) ?? null
  else if (active.kind === 'destroy') {
    const ids = new Set(active.resolved)
    const player = playerAircraft(world).state.position
    point = points
      .filter((candidate) => candidate.objective === 'destroy' && ids.has(entityId(candidate)))
      .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0] ?? null
  }
  return point === null ? null : { point, label: active.label, source: 'objective' }
}

/** Chart selection wins while it remains targetable; if its entity vanished
 *  or was destroyed, guidance falls back to the current objective. */
export function steeringCueFor<M>(world: World<M>, selectedId: string | null): SteeringCue | null {
  const points = mapPoints(world)
  const selected = selectedPoint(points, selectedId)
  const target: SteeringTarget | null = selected === null
    ? objectiveTarget(world, points)
    : { point: selected, label: selected.label, source: 'chart' }
  if (target === null) return null

  const player = playerAircraft(world)
  const dx = target.point.x - player.state.position.x
  const dz = target.point.z - player.state.position.z
  const y = target.altitudeM ?? targetAltitude(world, target.point, player.state.position.y)
  return {
    label: target.label,
    rangeMi: Math.hypot(dx, dz) / METERS_PER_MILE,
    target: v3(target.point.x, y, target.point.z),
    source: target.source,
  }
}

/** The label beside the arrow or marker: name and range to a tenth of a
 *  mile. No altitude (Mark, 2026-10-09). */
export function steeringCueLabel(cue: Pick<SteeringCue, 'label' | 'rangeMi'>): string {
  return `${cue.label.toUpperCase()} · ${cue.rangeMi.toFixed(1)} MI`
}
