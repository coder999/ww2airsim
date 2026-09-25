import { describe, expect, it } from 'vitest'
import { Group, Vector3 } from 'three'
import { createPanel } from '../../src/render/scene/panel.js'
import { cameraTransformFor } from '../../src/render/camera.js'
import { advance, createWorldOf, withControls, type AircraftEntity, type Stepper, type World } from '../../src/sim/loop.js'
import { DT } from '../../src/sim/flight/model.js'
import { createState, type AircraftState, type Controls } from '../../src/sim/flight/state.js'
import { add, normalize, scale, sub, v3, type Vec3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle, qRotate } from '../../src/sim/math/quat.js'
import { inBody } from '../../src/sim/weapons/geometry.js'
import { gunHarmonization } from '../../src/sim/weapons/harmonization.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

/**
 * The claim a reflector sight makes: put the target on the reticle and the
 * rounds hit it. Checked through the PRODUCTION panel geometry (where the
 * reticle is actually drawn) and the PRODUCTION `stepCombat` (where the rounds
 * actually go), so neither half can drift from the other.
 *
 * Before 2026-09-25 the reticle sat on the eye's own boresight, 0.9 m above
 * the line the guns aim along and with no allowance for drop, so a target
 * centered on it took ZERO hits at every range from 100 to 400 m (the
 * shootdown spike, re-measured here: the rounds passed 1.13-1.90 m below the
 * aim point, and the F6F's hit box reaches only 0.85 m below its center).
 *
 * The world is a co-moving tail chase: both airplanes level at 120 m/s along
 * body +x, stepped at constant velocity rather than through the flight model
 * (`cruise` below), so there is no deflection and the only question is the
 * sight's harmonization.
 */

const f6f = loadAircraftSpec('f6f-hellcat')
const SPEED_MPS = 120
const ATTITUDE = qFromAxisAngle(v3(0, 1, 0), 0) // body +x = world +x
const START = v3(0, 3000, 0)
const FIRE: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.7, fire: true }
const HOLD: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 }
const deg = (rad: number): number => rad * 180 / Math.PI

const cruise: Stepper = (_spec, state, _controls, ctx) =>
  ({ ...state, position: add(state.position, scale(state.velocity, ctx.dt)), tick: ctx.tick })

const stateAt = (position: Vec3): AircraftState =>
  createState({ position, velocity: v3(SPEED_MPS, 0, 0), attitude: ATTITUDE })

const entity = (id: string, state: AircraftState): AircraftEntity<undefined> =>
  ({ id, spec: f6f, state, previous: state, controls: HOLD, assistMemory: undefined, impact: null, parked: false })

/** The reticle's line of sight, world frame, read off the built panel posed
 *  on the airframe exactly as main.ts poses it (`cockpit` group). */
function reticleLine(state: AircraftState): { eye: Vec3; direction: Vec3 } {
  const panel = createPanel(f6f, () => null)
  const cockpit = new Group()
  cockpit.add(panel.root)
  cockpit.position.set(state.position.x, state.position.y, state.position.z)
  cockpit.quaternion.set(state.attitude.x, state.attitude.y, state.attitude.z, state.attitude.w)
  cockpit.updateMatrixWorld(true)
  const eye = cameraTransformFor('cockpit', f6f, { position: state.position, attitude: state.attitude }).position
  const at = new Vector3().setFromMatrixPosition(panel.reticle.matrixWorld)
  return { eye, direction: normalize(sub(v3(at.x, at.y, at.z), eye)) }
}

/** Fire a 1 s burst at a target whose body origin sits `rangeM` down the
 *  reticle line, then let the rounds fly out. */
function burstOnReticle(rangeM: number): { hits: number; shots: number; killS: number | null } {
  const shooter = stateAt(START)
  const { eye, direction } = reticleLine(shooter)
  const target = stateAt(add(eye, scale(direction, rangeM)))
  let world: World<undefined> = createWorldOf({ aircraft: [entity('f6f-1', shooter), entity('target', target)], player: 'f6f-1' })
  let killS: number | null = null
  for (let i = 0; i < 150; i++) {
    world = advance(withControls(world, 'f6f-1', i < 60 ? FIRE : HOLD), DT, cruise).world
    if (killS === null && world.combat.aircraft['target']!.damage.destroyedAt !== null) killS = (i + 1) * DT
  }
  const me = world.combat.aircraft['f6f-1']!
  return { hits: me.hits, shots: me.shots, killS }
}

describe('the gunsight is harmonized with the guns (2026-09-25)', () => {
  it.each([100, 200, 300, 400])('a target centered on the reticle at %i m is hit and killed by a 1 s burst', (rangeM) => {
    const r = burstOnReticle(rangeM)
    expect(r.hits, `${rangeM} m: hits`).toBeGreaterThanOrEqual(12)
    expect(r.killS, `${rangeM} m: time to kill`).not.toBeNull()
  })

  it('the reticle marks the mean impact of production rounds at convergence, within 0.02 degrees', () => {
    // No target this time: fly a 1 s burst out through stepCombat and take
    // the mean of where each round crosses convergence range in the
    // shooter's co-moving body frame.
    const shooter = stateAt(START)
    let world: World<undefined> = createWorldOf({ aircraft: [entity('f6f-1', shooter)], player: 'f6f-1' })
    const range = f6f.combat!.convergenceM
    const last = new Map<number, Vec3>()
    const crossings: Vec3[] = []
    for (let i = 0; i < 90; i++) {
      world = advance(withControls(world, 'f6f-1', i < 60 ? FIRE : HOLD), DT, cruise).world
      const me = world.aircraft[0]!.state
      for (const p of world.combat.projectiles) {
        const body = inBody(me.attitude, sub(p.position, me.position))
        const before = last.get(p.id)
        if (before !== undefined && before.x < range && body.x >= range) {
          crossings.push(add(before, scale(sub(body, before), (range - before.x) / (body.x - before.x))))
        }
        last.set(p.id, body)
      }
    }
    expect(crossings.length).toBeGreaterThan(60)
    const meanY = crossings.reduce((s, c) => s + c.y, 0) / crossings.length
    const [ex, ey] = f6f.view.eyePointM
    const impactDeg = deg(Math.atan2(ey - meanY, range - ex))

    const { direction } = reticleLine(shooter)
    const body = inBody(shooter.attitude, direction)
    const reticleDeg = deg(Math.atan2(-body.y, body.x))
    expect(Math.abs(body.z)).toBeLessThan(1e-9)
    expect(Math.abs(reticleDeg - impactDeg)).toBeLessThan(0.02)
    // And both agree with the pure function the panel draws from.
    expect(reticleDeg).toBeCloseTo(deg(gunHarmonization(f6f.combat!, f6f.view.eyePointM).depressionRad), 4)
  })

  it('stays fixed to the airframe: the same body-frame angle whatever the attitude', () => {
    const level = inBody(ATTITUDE, reticleLine(stateAt(START)).direction)
    for (const [axis, angleDeg] of [[v3(0, 0, 1), 20], [v3(1, 0, 0), 60], [v3(0, 1, 0), -110]] as const) {
      const attitude = qFromAxisAngle(axis, angleDeg * Math.PI / 180)
      const s = createState({ position: START, velocity: qRotate(attitude, v3(SPEED_MPS, 0, 0)), attitude })
      const body = inBody(attitude, reticleLine(s).direction)
      expect(body.x).toBeCloseTo(level.x, 9)
      expect(body.y).toBeCloseTo(level.y, 9)
      expect(body.z).toBeCloseTo(level.z, 9)
    }
  })
})
