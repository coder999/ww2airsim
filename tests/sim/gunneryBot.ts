import { assistFor, DEFAULT_ASSIST_SETTINGS } from '../../src/assists/index.js'
import { DT } from '../../src/sim/flight/model.js'
import type { Controls } from '../../src/sim/flight/state.js'
import { advance, withControls, type AircraftEntity, type World } from '../../src/sim/loop.js'
import { qRotate } from '../../src/sim/math/quat.js'
import { add, dot, length, normalize, scale, sub, v3, type Vec3 } from '../../src/sim/math/vec3.js'
import { inBody, tupleVector } from '../../src/sim/weapons/geometry.js'
import { gunHarmonization } from '../../src/sim/weapons/harmonization.js'

/**
 * A scripted player who flies the SHIPPED sight: it puts the target's center
 * on the harmonized reticle line (`gunHarmonization`, the same angle the
 * panel draws) and fires when it is within half a degree of it inside 400 m.
 * No lead: that is the pilot's craft, and a bot that led perfectly would say
 * more about the bot than about the scenario.
 *
 * The stick is the shootdown spike's "human" bot (2026-09-25): roll the lift
 * vector onto the target, pull toward ~6.5 G with some energy discipline,
 * fine-track with pitch and rudder once the target is within 4 degrees. Crude
 * -- it bleeds energy and flies worse than a practiced pilot -- so what it
 * achieves is a floor.
 */

const assist = assistFor(DEFAULT_ASSIST_SETTINGS)
const clamp = (n: number): number => Math.min(1, Math.max(-1, n))
const deg = (rad: number): number => rad * 180 / Math.PI

function stick(me: AircraftEntity<undefined>, dirBody: Vec3, gNow: number): Controls {
  const b = dirBody
  const off = Math.atan2(Math.hypot(b.y, b.z), b.x)
  const pitchErr = Math.atan2(b.y, b.x), yawErr = Math.atan2(b.z, b.x)
  const r = me.state.bodyRates
  let roll: number, pitch: number, yaw: number
  if (off > 4 * Math.PI / 180) {
    const phi = Math.atan2(b.z, b.y)
    roll = clamp(phi * 2.0 - r.x * 0.35)
    pitch = Math.abs(phi) < 0.6 ? 1 : Math.abs(phi) < 1.6 ? 0.5 : 0
    yaw = clamp(yawErr * 0.75 + r.y * 0.25)
  } else {
    roll = clamp(Math.atan2(b.z, Math.max(1e-3, b.y + 0.05)) * 0.8 - r.x * 0.35)
    pitch = clamp(pitchErr * 12 - r.z * 0.6)
    yaw = clamp(yawErr * 8 + r.y * 0.4)
  }
  if (gNow > 6.5 && pitch > 0) pitch *= 0.5
  const v = length(me.state.velocity)
  if (off > 4 * Math.PI / 180 && v < 95 && pitch > 0) pitch *= Math.max(0.2, (v - 60) / 35)
  return { roll, pitch, yaw, throttle: 1 }
}

export type BotRun = {
  /** Seconds from spawn until the target first sat within 2 degrees of the
   *  reticle inside 400 m -- the start of a firing chance. */
  readonly firstChanceS: number | null
  /** Total seconds inside that envelope. */
  readonly chanceS: number
  readonly hits: number
  readonly killS: number | null
  readonly playerLostS: number | null
}

export function flyGunneryBot(start: World<undefined>, targetId: string, maxS: number): BotRun {
  let w = start
  const player = w.player
  const me0 = w.aircraft.find((a) => a.id === player)!
  const combat = me0.spec.combat!
  const eye = tupleVector(me0.spec.view.eyePointM)
  const dep = gunHarmonization(combat, me0.spec.view.eyePointM).depressionRad
  // The reticle line in the body frame, and the nose offset that puts it on
  // a point: the reticle sits `dep` below the nose, so aim the nose `dep`
  // above the target.
  const sightBody = v3(Math.cos(dep), -Math.sin(dep), 0)
  let firstChanceS: number | null = null, chanceS = 0, killS: number | null = null, playerLostS: number | null = null
  for (let i = 0; i < maxS / DT; i++) {
    const t = i * DT
    const me = w.aircraft.find((a) => a.id === player)!
    const tgt = w.aircraft.find((a) => a.id === targetId)!
    const eyeWorld = add(me.state.position, qRotate(me.state.attitude, eye))
    const toTarget = sub(tgt.state.position, eyeWorld)
    const range = length(toTarget)
    const losBody = inBody(me.state.attitude, normalize(toTarget))
    const offSight = deg(Math.acos(Math.min(1, dot(losBody, sightBody))))
    const noseBody = normalize(add(losBody, scale(v3(0, 1, 0), Math.tan(dep))))
    const fire = range < 400 && offSight < 0.5
    const c = stick(me, noseBody, w.combat.aircraft[player]!.stress.loadFactorG)
    w = advance(withControls(w, player, { ...c, fire }), DT, undefined, assist).world
    if (range < 400 && offSight < 2) {
      chanceS += DT
      if (firstChanceS === null) firstChanceS = t
    }
    const cm = w.combat.aircraft
    if (cm[targetId]!.damage.destroyedAt !== null) { killS = t; break }
    const me2 = w.aircraft.find((a) => a.id === player)!
    if (cm[player]!.damage.destroyedAt !== null || me2.state.position.y < 0) { playerLostS = t; break }
  }
  return { firstChanceS, chanceS, hits: w.combat.aircraft[player]!.hits, killS, playerLostS }
}

/** Seed the pursuer's control-noise cursor, so a sweep samples the AI's own
 *  randomness rather than replaying one run eight times. */
export function withNoiseCursor(world: World<undefined>, cursor: number): World<undefined> {
  return {
    ...world,
    aircraft: world.aircraft.map((a) => a.pilot == null ? a
      : { ...a, pilot: { ...a.pilot, decision: { ...a.pilot.decision, noiseCursor: cursor } } }),
  }
}
