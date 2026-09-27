/**
 * Deck Quals (Carrier Qualification), flown headless (spec §5; M3 Task 4).
 *
 * Tuning notes (M3-R9), 2026-09-27:
 *
 * - **The downwind gate, (-10726, -28752).** The Essex's position at
 *   t = 90 s, 1,500 m to port. Her first leg runs from (-9084, -28558)
 *   toward (-13444, -41903) at 7.717 m/s: heading vector (-0.3106, -0.9506),
 *   port (h.z, -h.x) = (-0.9506, 0.3106). Re-derived with `stepShip` for
 *   5,400 ticks from the scenario (`.superpowers/m3/t4/gate.ts`): the ship is
 *   at (-9299.7, -29218.2) on heading -18.09 deg, and the gate at
 *   (-10725.5, -28752.3), 0.6 m from the numbers in the file. The first
 *   test below re-derives it on every run and holds it to 50 m.
 * - **radiusM 1500.** A pilot turning downwind abeam flies somewhere between
 *   a tight and a lazy pattern; 1,500 m is the gate's own distance from the
 *   ship, so any abeam position from alongside to twice as wide counts. The
 *   ship moves on at 7.7 m/s (about 460 m a minute), so the gate is abeam
 *   for the first few minutes and astern of her after that, where the
 *   pattern still passes through it.
 * - **altitudeM [100, 450].** A carrier pattern flies low: the gate accepts
 *   anything from 100 m (about 330 ft, well clear of the water) to 450 m
 *   (about 1,500 ft). The staged run holds 300 m.
 * - **Nothing else needed tuning.** The success run, measured 2026-09-27 at
 *   terrain level `finestFetchedLevelFor(INTERIM_ASSET_QUALITY_TIER)`:
 *   Launch complete at tick 555 (the 10 m airborne latch), the deck run
 *   150 m up at tick 1556, Downwind at 1558 (staged), traps logged at ticks
 *   8592, 17365 and 26138, respots at 8772 and 17545 (the landing plus
 *   `ticksFor(RESPOT_DELAY_S)`), and three passes, all trapped. Aiming at
 *   the trap zone's near edge, as `carrierLanding.test.ts` does, trapped
 *   every time; no aim point or gate moved. (`deckRun` gained a climb-out
 *   hold above 10 m the same day; its doc comment says why. With the
 *   Measured law alone the same run passed, 150 m up at tick 962 at 28 m/s,
 *   below the stall.)
 */
import { describe, it, expect } from 'vitest'
import { loadScenarioBundle } from '../../../../tools/content/load.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import { playerAircraft, withAircraftState } from '../../../../src/sim/loop.js'
import { createState, DT } from '../../../../src/sim/flight/model.js'
import { stepShip } from '../../../../src/sim/world/ships.js'
import { heightAt } from '../../../../src/sim/world/terrain.js'
import { SEA_LEVEL_M } from '../../../../src/sim/world/terrain.js'
import { attitudeAngles } from '../../../../src/sim/flight/attitude.js'
import { ticksFor, lastLanding, radioMessages } from '../../../../src/sim/mission/state.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { RESPOT_DELAY_S, RESPOT_MESSAGE } from '../../../../src/sim/mission/respot.js'
import { WAVE_OFF_MESSAGE } from '../../../../src/sim/mission/passes.js'
import { qFromAxisAngle, qMul } from '../../../../src/sim/math/quat.js'
import { v3 } from '../../../../src/sim/math/vec3.js'
import { progressOf } from '../fixture.js'
import { carrierApproach, deckRun, headingAttitude, hold, levelAt, stepsWithControls, terrainOrSkip } from '../fly.js'

const DOWNWIND_GATE = { x: -10726, z: -28752 }
const ABEAM = 'Paddles: Abeam. Gear, flaps and hook down, and bring it aboard.'

describe('Deck Quals mission content', () => {
  it('the downwind gate is the Essex at t = 90 s, 1,500 m to port, within 50 m (stepShip, 5,400 ticks)', () => {
    const bundle = loadScenarioBundle('deck-quals-mission')
    const w = worldFromScenario(bundle, null)
    const cv = w.ships.find((s) => s.id === 'cv-1')!
    let st = cv.state
    for (let t = 0; t < 5400; t++) st = stepShip(cv.spec, st, cv.orders, { dt: DT, tick: t + 1 })
    // Port of a ship on compass heading h, whose bow is (sin h, -cos h).
    const port = { x: -Math.cos(st.headingRad), z: -Math.sin(st.headingRad) }
    const gate = { x: st.position.x + 1500 * port.x, z: st.position.z + 1500 * port.z }
    const downwind = bundle.scenario.objectives!.find((o) => o.id === 'downwind')!
    expect(downwind.kind).toBe('reach')
    if (downwind.kind !== 'reach') return
    expect(downwind.point).toEqual(DOWNWIND_GATE)
    expect(Math.hypot(gate.x - DOWNWIND_GATE.x, gate.z - DOWNWIND_GATE.z)).toBeLessThan(50)
  })
})

/**
 * The staged ditch: 1 m over the water, wings level, nose 5 deg up, 45 m/s,
 * throttle closed. The brief's staging (5 m, nose down 20 deg, 60 m/s) is not
 * a ditching: `contactOutcome` (src/sim/contact.ts) calls a water contact a
 * ditching only with pitch in [-2, 12] deg, sink at most 3 m/s and speed at
 * most 1.2 x the clean stall (52.6 m/s), so it hits the water "destroyed"
 * (measured 2026-09-27: 15.3 m/s of sink), which `recoveryOf` reads as
 * Killed. From 5 m even this attitude arrives at 3.55 m/s of sink
 * (destroyed); from 2 m at 2.78 m/s; from 1 m at 2.19 m/s (ditched, the
 * margin kept).
 */
const DITCH = { heightM: 1, speedMps: 45, sinkMps: 0, pitchDeg: 5 }

const terrain = terrainOrSkip()

describe.skipIf(terrain === null)('Deck Quals mission, headless (spec §5)', () => {
  it('success: launch, downwind, three traps with two respots, no wave-offs, badge', () => {
    let w = worldFromScenario(loadScenarioBundle('deck-quals-mission'), terrain)
    w = deckRun(w)
    expect(progressOf(w, 'up').status).toBe('complete')
    w = hold(w, levelAt(DOWNWIND_GATE, 300, 120), 2) // staged: inside the gate
    expect(progressOf(w, 'downwind').status).toBe('complete')
    for (let trap = 1; trap <= 3; trap++) {
      w = carrierApproach(w, 'cv-1')
      const landing = lastLanding(w.mission!)!
      expect(landing.at?.id).toBe('cv-1')
      expect(landing.intermediate).toBe(trap < 3)
      if (trap < 3) {
        w = stepsWithControls(w, ticksFor(RESPOT_DELAY_S), { throttle: 0, hookDown: true, gearDown: true, brake: 1 })
        expect(w.mission!.log.filter((e) => e.kind === 'respot')).toHaveLength(trap)
        w = deckRun(w)
      }
    }
    const texts = radioMessages(w.mission!).map((e) => e.text)
    expect(texts).toEqual(expect.arrayContaining(['Trap 1 of 3', 'Trap 2 of 3', RESPOT_MESSAGE, ABEAM]))
    expect(texts).not.toContain(WAVE_OFF_MESSAGE)
    expect(w.mission!.log.filter((e) => e.kind === 'pass').map((e) => e.kind === 'pass' && e.result))
      .toEqual(['trapped', 'trapped', 'trapped'])
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'success', badge: { id: 'carrier-qualified' }, reasons: [] })
    expect(out.objectives.find((o) => o.id === 'clean')!.final).toBe('complete')
  })

  it('failure: a go-around fails No wave-offs (the badge is still possible), then a ditching ends it with no badge', () => {
    let w = worldFromScenario(loadScenarioBundle('deck-quals-mission'), terrain)
    w = deckRun(w)
    w = hold(w, levelAt(DOWNWIND_GATE, 300, 120), 2)
    w = carrierApproach(w, 'cv-1', { goAroundAtM: 400 })
    expect(lastLanding(w.mission!)).toBeUndefined()
    const texts = radioMessages(w.mission!).map((e) => e.text)
    expect(texts).toContain(WAVE_OFF_MESSAGE)
    expect(texts).toContain('No wave-offs: failed')
    expect(progressOf(w, 'clean').status).toBe('failed')
    expect(progressOf(w, 'traps').status).toBe('active')
    // The secondary alone never gates the badge: were he to trap three times
    // from here, the outcome would still be success.

    // Staged ditch (DITCH says why it is not the brief's), over open water
    // 3 km west of the gate.
    const at = { x: DOWNWIND_GATE.x - 3000, z: DOWNWIND_GATE.z }
    expect(heightAt(terrain!, at.x, at.z)).toBeLessThanOrEqual(SEA_LEVEL_M)
    w = withAircraftState(w, w.player, createState({
      position: v3(at.x, SEA_LEVEL_M + DITCH.heightM, at.z),
      velocity: v3(0, -DITCH.sinkMps, -DITCH.speedMps),
      attitude: qMul(headingAttitude(0), qFromAxisAngle(v3(0, 0, 1), (DITCH.pitchDeg * Math.PI) / 180)),
      tick: w.tick,
    }))
    expect(attitudeAngles(playerAircraft(w).state).pitchRad * 180 / Math.PI).toBeCloseTo(DITCH.pitchDeg, 6)
    for (let i = 0; i < 600 && playerAircraft(w).impact === null; i++) w = stepsWithControls(w, 1, { throttle: 0 })
    expect(playerAircraft(w).impact?.kind).toBe('ditched')
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'no-badge', badge: null, reasons: ['Ditched', 'Trap: incomplete'] })
  })
})

