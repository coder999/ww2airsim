import { assistFor } from '../assists/index.js'
import { orderWingmen } from '../sim/ai/wingmanOrders.js'
import { DT } from '../sim/flight/model.js'
import type { Controls } from '../sim/flight/state.js'
import { advance, withControls, withPlayerLights, type Stepper, type World } from '../sim/loop.js'
import { worldChecksum, worldSummary } from './checksum.js'
import type { FlightRecordV1 } from './schema.js'

export type VerificationResult<M> =
  | { readonly ok: true; readonly world: World<M>; readonly ticks: number }
  | { readonly ok: false; readonly tick: number; readonly message: string; readonly expected?: string; readonly actual?: string }

export type VerificationOptions = {
  readonly buildId?: string
  readonly contentSha256?: string
  readonly allowMismatch?: boolean
  readonly stepper?: Stepper
  readonly endTick?: number
  readonly onWorld?: (world: World<undefined>) => void
}

const packetControls = (packet: FlightRecordV1['packets'][number]): Controls => ({
  pitch: packet.controls.pitch,
  roll: packet.controls.roll,
  yaw: packet.controls.yaw,
  throttle: packet.controls.throttle,
  ...(packet.controls.fire === undefined ? {} : { fire: packet.controls.fire }),
  ...(packet.controls.gearDown === undefined ? {} : { gearDown: packet.controls.gearDown }),
  ...(packet.controls.brake === undefined ? {} : { brake: packet.controls.brake }),
  ...(packet.controls.flapDown === undefined ? {} : { flapDown: packet.controls.flapDown }),
  ...(packet.controls.hookDown === undefined ? {} : { hookDown: packet.controls.hookDown }),
  ...(packet.controls.bayDoorsOpen === undefined ? {} : { bayDoorsOpen: packet.controls.bayDoorsOpen }),
  ...(packet.controls.dropBomb === undefined ? {} : { dropBomb: packet.controls.dropBomb }),
  ...(packet.controls.fireRockets === undefined ? {} : { fireRockets: packet.controls.fireRockets }),
})

export function verifyFlightRecord(
  record: FlightRecordV1,
  initial: World<undefined>,
  options: VerificationOptions = {},
): VerificationResult<undefined> {
  if (!record.valid) return { ok: false, tick: initial.tick, message: `record is invalid: ${record.issues.join('; ')}` }
  if (!options.allowMismatch && options.buildId !== undefined && options.buildId !== record.build.id) {
    return { ok: false, tick: initial.tick, message: `build mismatch: record needs ${record.build.id}; current build is ${options.buildId}` }
  }
  if (!options.allowMismatch && options.contentSha256 !== undefined && options.contentSha256 !== record.content.sha256) {
    return { ok: false, tick: initial.tick, message: `content mismatch: record needs ${record.content.sha256}; current content is ${options.contentSha256}` }
  }
  const initialHash = worldChecksum(initial)
  if (initialHash !== record.initial.checksum) {
    return { ok: false, tick: initial.tick, message: 'initial world mismatch', expected: record.initial.checksum, actual: initialHash }
  }

  let world = initial
  const assist = assistFor(record.launch.assists)
  let ticks = 0
  for (const packet of record.packets) {
    if (options.endTick !== undefined && packet.tick > options.endTick) break
    if (packet.tick !== world.tick + 1) return { ok: false, tick: packet.tick, message: `packet gap after tick ${world.tick}` }
    for (const action of packet.actions) {
      // F6B: the player's lights switch is sim input (the AI's perception reads it), so replay applies it, at the same
      // fixed tick the live frame did (`main.ts`).
      if (action.kind === 'control' && action.control === 'lights') { world = withPlayerLights(world, action.value); continue }
      if (action.kind !== 'wingman-order') continue
      world = orderWingmen(world, action.command === 'attack'
        ? { kind: 'attack', target: action.target ?? null }
        : { kind: action.command })
    }
    const result = advance(withControls(world, world.player, packetControls(packet)), DT, options.stepper, assist, record.launch.arcadeDamage)
    world = result.world
    ticks++
    options.onWorld?.(world)
    if (result.stepsRun !== 1 || result.droppedSteps !== 0) {
      return { ok: false, tick: packet.tick, message: `verification advanced ${result.stepsRun} steps and dropped ${result.droppedSteps}` }
    }
    if (packet.checksum !== undefined) {
      const actual = worldChecksum(world)
      if (actual !== packet.checksum) {
        const nearby = packet.events.map((event) => event.detail).join(', ')
        return {
          ok: false,
          tick: packet.tick,
          message: `first divergence at tick ${packet.tick}${nearby === '' ? '' : ` near ${nearby}`}`,
          expected: packet.checksum,
          actual,
        }
      }
    }
  }
  const reachedEnd = ticks === record.packets.length
  if (record.final !== null && reachedEnd) {
    const actual = worldChecksum(world)
    if (actual !== record.final.checksum) {
      // Name what differs so a final-only divergence (every one-second checkpoint matched) is actionable.
      const want = record.final.summary as Record<string, unknown>
      const got = worldSummary(world) as unknown as Record<string, unknown>
      const differs = Object.keys(want).filter((key) => JSON.stringify(want[key]) !== JSON.stringify(got[key]))
      const detail = differs.length === 0 ? 'summary matches; the difference is in detailed state' : `summary differs in ${differs.join(', ')}`
      return { ok: false, tick: world.tick, message: `final divergence at tick ${world.tick} (record's final tick ${record.final.summary.tick}; ${detail})`, expected: record.final.checksum, actual }
    }
  }
  return { ok: true, world, ticks }
}


/**
 * F6B: the AI's night perception reads the launch hour (it is in the world's `night` fact), so a reproduction in a
 * session at another hour would only report "initial world mismatch". Say what differs instead. Null when they agree
 * (or the record has no hour to compare).
 */
export function launchHourMismatch(record: FlightRecordV1, sessionTimeOfDay: number): string | null {
  const flown = record.launch.timeOfDay
  if (Math.abs(flown - sessionTimeOfDay) < 1e-9) return null
  return `Time-of-day mismatch: this record was flown at ${flown.toFixed(2)} (solar hours); this session is at ${sessionTimeOfDay.toFixed(2)}. Launch at the record's hour before reproducing it.`
}
