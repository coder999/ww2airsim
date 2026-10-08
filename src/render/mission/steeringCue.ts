import { playerAircraft, type World } from '../../sim/loop.js'
import { qRotate } from '../../sim/math/quat.js'
import { v3 } from '../../sim/math/vec3.js'
import { heightAt } from '../../sim/world/terrain.js'
import { mapPoints, selectedPoint, type MapPoint } from '../missionMap.js'
import { METERS_PER_MILE } from '../radar.js'
import { M_PER_FT } from './chartScale.js'

/** Read-only HUD guidance over the live world. It owns no navigation state:
 *  the chart selection remains render state, and mission progress remains in
 *  `World.mission`. Positive bearing is clockwise from the aircraft's nose. */
export type SteeringCue = {
  readonly label: string
  readonly bearingRad: number
  readonly rangeMi: number
  readonly relativeAltitudeFt: number
  readonly source: 'objective' | 'chart'
}

type SteeringTarget = {
  readonly point: MapPoint
  readonly label: string
  readonly source: SteeringCue['source']
}

const entityId = (point: MapPoint): string => point.id.slice(point.id.indexOf(':') + 1)

const groundHeight = <M>(world: World<M>, point: Pick<MapPoint, 'x' | 'z'>): number =>
  world.terrain === null ? 0 : Math.max(0, heightAt(world.terrain, point.x, point.z))

/** A point's useful vertical destination. A station with an altitude band
 *  asks only for the nearest edge when the player is outside it, and reads
 *  level while inside it. That makes the cue guidance rather than a command
 *  to chase an arbitrary midpoint. */
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
  else if (active.kind === 'land') point = pointForBase(points, active.at)
  else if (active.kind === 'reach' || active.kind === 'hold') point = points.find((p) => p.id === `station:${active.id}`) ?? null
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
  const nose = qRotate(player.state.attitude, v3(1, 0, 0))
  const flatLength = Math.hypot(nose.x, nose.z)
  const forwardX = flatLength > 1e-9 ? nose.x / flatLength : 0
  const forwardZ = flatLength > 1e-9 ? nose.z / flatLength : -1
  const rightX = -forwardZ
  const rightZ = forwardX
  const ahead = dx * forwardX + dz * forwardZ
  const right = dx * rightX + dz * rightZ
  const bearingRad = dx === 0 && dz === 0 ? 0 : Math.atan2(right, ahead)
  const y = targetAltitude(world, target.point, player.state.position.y)
  return {
    label: target.label,
    bearingRad,
    rangeMi: Math.hypot(dx, dz) / METERS_PER_MILE,
    relativeAltitudeFt: (y - player.state.position.y) / M_PER_FT,
    source: target.source,
  }
}

/** Rounded for a stable cockpit readout: range to a tenth of a mile and
 *  vertical separation to the nearest hundred feet. */
export function steeringCueLabel(cue: SteeringCue): string {
  const altitudeFt = Math.round(cue.relativeAltitudeFt / 100) * 100
  const altitude = altitudeFt === 0 ? '0' : `${altitudeFt > 0 ? '+' : '−'}${Math.abs(altitudeFt).toLocaleString('en-US')}`
  return `${cue.label.toUpperCase()} · ${cue.rangeMi.toFixed(1)} MI · ALT ${altitude} FT`
}
