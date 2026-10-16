import type { FixedStepObservation, World } from '../sim/loop.js'
import { DT } from '../sim/flight/model.js'
import { isPilotJump } from '../sim/bailout.js'
import { perceptionAt } from '../sim/lights/perception.js'
import { worldChecksum, worldSummary } from './checksum.js'
import {
  FLIGHT_RECORD_FORMAT,
  FLIGHT_RECORD_VERSION,
  parseFlightRecord,
  type FlightRecordAction,
  type FlightRecordEvidence,
  type FlightRecordV1,
} from './schema.js'

export type FlightRecordHeader = Pick<FlightRecordV1, 'build' | 'content' | 'launch' | 'environment'>

export type DevFlightRecorder<M> = {
  readonly observe: (observation: FixedStepObservation<M>) => void
  note(action: FlightRecordAction): void
  invalidate(reason: string): void
  finish(world: World<M>, debrief?: unknown): FlightRecordV1
  snapshot(): FlightRecordV1
  readonly exported: () => boolean
  markExported(): void
}

const evidenceBetween = <M>(before: World<M>, after: World<M>): FlightRecordEvidence[] => {
  const evidence: FlightRecordEvidence[] = []
  const tick = after.tick
  const priorLog = before.mission?.log.length ?? 0
  for (const entry of after.mission?.log.slice(priorLog) ?? []) {
    evidence.push({
      tick,
      kind: entry.kind === 'objective' ? 'outcome' : entry.kind === 'landing' ? 'landing' : 'mission',
      detail: JSON.stringify(entry),
    })
  }
  const beforeIds = new Set([...before.aircraft, ...before.ships, ...before.vehicles].map((entity) => entity.id))
  for (const entity of [...after.aircraft, ...after.ships, ...after.vehicles]) {
    if (!beforeIds.has(entity.id)) evidence.push({ tick, kind: 'spawn', entity: entity.id, detail: 'spawned' })
  }
  // F6B: an AI pilot's target first becomes the player, at night: who saw you, how far, and the limit that applied.
  if (after.night !== undefined) {
    const seen = perceptionAt(before, DT)
    const me = after.aircraft.find((a) => a.id === after.player)
    for (const a of after.aircraft) {
      if (a.id === after.player || me === undefined || a.pilot?.decision.targetId !== after.player) continue
      if (before.aircraft.find((b) => b.id === a.id)?.pilot?.decision.targetId === after.player) continue
      const mi = Math.hypot(a.state.position.x - me.state.position.x, a.state.position.y - me.state.position.y, a.state.position.z - me.state.position.z) / 1609.344
      const limit = (seen?.rangeM[after.player] ?? 0) / 1609.344
      evidence.push({ tick, kind: 'sighted', entity: a.id, detail: `sees ${after.player} at ${mi.toFixed(1)} mi (limit ${limit.toFixed(1)} mi${me.lightsOff === true ? ', blacked out' : ''})` })
    }
  }
  for (const aircraft of after.aircraft) {
    const priorCombat = before.combat.aircraft[aircraft.id]
    const nextCombat = after.combat.aircraft[aircraft.id]
    if (priorCombat !== undefined && nextCombat !== undefined) {
      const bombs = nextCombat.bombsDropped - priorCombat.bombsDropped
      const rockets = nextCombat.rocketsFired - priorCombat.rocketsFired
      const torpedoes = nextCombat.torpedoesDropped - priorCombat.torpedoesDropped
      if (bombs > 0) {
        evidence.push({
          tick,
          kind: 'release',
          entity: aircraft.id,
          detail: torpedoes > 0 ? `torpedo x${torpedoes}` : `bomb x${bombs}`,
        })
      }
      if (rockets > 0) evidence.push({ tick, kind: 'release', entity: aircraft.id, detail: `rocket x${rockets}` })
    }
    const was = before.combat.aircraft[aircraft.id]?.damage.destroyedAt ?? null
    const now = after.combat.aircraft[aircraft.id]?.damage.destroyedAt ?? null
    if (was === null && now !== null) evidence.push({ tick, kind: 'destruction', entity: aircraft.id, detail: 'aircraft destroyed' })
    const priorImpact = before.aircraft.find((entry) => entry.id === aircraft.id)?.impact ?? null
    if (priorImpact === null && aircraft.impact !== null) evidence.push({ tick, kind: 'impact', entity: aircraft.id, detail: aircraft.impact.kind })
  }
  const priorParachutists = new Set((before.parachutists ?? []).map((entry) => entry.id))
  // F7B: a dropped trooper or bundle is not a bailout; the drop is in the world checksum, not the evidence list.
  for (const parachutist of (after.parachutists ?? []).filter(isPilotJump)) {
    if (!priorParachutists.has(parachutist.id)) {
      evidence.push({ tick, kind: 'bailout', entity: parachutist.sourceAircraft, detail: `${parachutist.id} separated` })
      continue
    }
    const prior = before.parachutists?.find((entry) => entry.id === parachutist.id)
    if (prior?.state.contact === null && parachutist.state.contact !== null) {
      evidence.push({ tick, kind: 'bailout', entity: parachutist.sourceAircraft, detail: `${parachutist.state.contact.surface} contact: ${parachutist.state.outcome ?? 'survived'}` })
    }
  }
  return evidence
}

export function createDevFlightRecorder<M>(header: FlightRecordHeader, initial: World<M>): DevFlightRecorder<M> {
  const packets: FlightRecordV1['packets'][number][] = []
  const issues: string[] = []
  const pendingActions: FlightRecordAction[] = []
  let previous = initial
  let final: FlightRecordV1['final'] = null
  let revision = 0
  let exportedRevision = -1

  const build = (includeBoundaryActions = false): FlightRecordV1 => {
    const snapshotPackets = packets.slice()
    const snapshotIssues = issues.slice()
    if (includeBoundaryActions && pendingActions.length > 0) {
      const boundary = pendingActions.filter((action) => action.kind === 'pause' || action.kind === 'time-scale')
      const unapplied = pendingActions.length - boundary.length
      const last = snapshotPackets.at(-1)
      if (boundary.length > 0 && last !== undefined) {
        snapshotPackets[snapshotPackets.length - 1] = {
          ...last,
          actions: [...last.actions, ...boundary.map((action) => ({ ...action, tick: last.tick }))],
        }
      } else if (boundary.length > 0) {
        snapshotIssues.push('record ended before a fixed tick could carry its pause/time-scale action')
      }
      if (unapplied > 0) snapshotIssues.push('record ended with actions that were never applied to a fixed tick')
    }
    return parseFlightRecord({
      format: FLIGHT_RECORD_FORMAT,
      version: FLIGHT_RECORD_VERSION,
      ...header,
      initial: { checksum: worldChecksum(initial), summary: worldSummary(initial) },
      packets: snapshotPackets,
      valid: snapshotIssues.length === 0,
      issues: snapshotIssues,
      final,
    })
  }

  return {
    observe({ tick, controls, world }) {
      if (tick !== previous.tick + 1) {
        issues.push(`fixed-tick gap: observed ${tick} after ${previous.tick}`)
      }
      const actions = pendingActions.splice(0).map((action): FlightRecordAction => {
        if (action.kind !== 'wingman-order' || action.command !== 'attack') return { ...action, tick }
        const order = world.aircraft.find((aircraft) =>
          aircraft.pilot?.formation?.leader === world.player && aircraft.pilot.formation.order?.kind === 'attack',
        )?.pilot?.formation?.order
        return { ...action, tick, target: order?.kind === 'attack' ? order.target : null }
      })
      const events = evidenceBetween(previous, world)
      const checkpoint = tick % 60 === 0 ? worldChecksum(world) : undefined
      packets.push({ tick, controls: { ...controls }, actions, events, ...(checkpoint === undefined ? {} : { checksum: checkpoint }) })
      previous = world
      final = null
      revision++
    },
    note(action) { pendingActions.push(action); revision++ },
    invalidate(reason) { if (!issues.includes(reason)) { issues.push(reason); revision++ } },
    finish(world, debrief = null) {
      if (pendingActions.length > 0) issues.push('record ended with actions that were never applied to a fixed tick')
      // The frame loop applies each frame's controls to the world BEFORE advancing, and a frame that runs
      // no fixed step (paused, holding after an impact, a sub-step frame) returns that world untouched. So
      // `world` here can carry controls newer than the last recorded tick, which the verifier cannot
      // know. The last observed world of the same tick is the simulation state to checksum.
      const settled = previous.tick === world.tick ? previous : world
      final = { checksum: worldChecksum(settled), summary: worldSummary(settled), debrief }
      revision++
      return build()
    },
    snapshot: () => build(true),
    exported: () => exportedRevision === revision,
    markExported() { exportedRevision = revision },
  }
}

