import { describe, expect, it } from 'vitest'
import { aircraftById, type World } from '../../../src/sim/loop.js'
import {
  CAPTURE_HEADING_RAD, CAPTURE_HEIGHT_M, CAPTURE_LATERAL_M, CAPTURE_SPEED_MPS, exemptFromFloor, FIX_DISTANCE_M, IP_DISTANCE_M, IP_HEIGHT_M,
  recoveryControls, startRecovery,
} from '../../../src/sim/ai/recovery.js'
import type { RecoveryPhase, RecoveryState } from '../../../src/sim/ai/pilot.js'
import { safetyOverride } from '../../../src/sim/ai/safety.js'
import { airVelocity } from '../../../src/sim/flight/model.js'
import { qRotate } from '../../../src/sim/math/quat.js'
import { length, v3 } from '../../../src/sim/math/vec3.js'
import { APPROACH_SPEED_STALL_MULTIPLE, paddlesCue } from '../../../src/sim/paddles.js'
import { effectiveStallSpeedMps, GEAR_DOWN_FRACTION } from '../../../src/sim/ground.js'
import { decksOf } from '../../../src/sim/world/deck.js'
import { approachFrame, buildRecovery, crashed, fly, homed, inRecovery, onApproach, phaseOf, STILL_CARRIER } from './recoveryWorlds.js'

type W = World<undefined>

/** The LSO's approach speed for ai-1 (7g spec §5): an airspeed. */
const vA = (w: W): number => APPROACH_SPEED_STALL_MULTIPLE * effectiveStallSpeedMps(aircraftById(w, 'ai-1')!.spec, 1)
const glideRad = (3.5 * Math.PI) / 180

const carrierWorld = (ships: unknown[] = [STILL_CARRIER]): W => buildRecovery([homed('ai-1', { ship: 'cv-1' }, [0, 1000, 20000])], { ships })

/** ai-1 at cv-1's IP, heading down the centerline at 110 m/s, in `join`. */
const atIpJoining = (ships?: unknown[]): W => {
  const w = carrierWorld(ships)
  return inRecovery(onApproach(w, 'ai-1', { alongM: IP_DISTANCE_M, wheelM: IP_HEIGHT_M, airspeedMps: 110 }), 'ai-1', 'join')
}

/** Every distinct phase in order, flown `seconds` or until `landed`. */
function phasesFlown(w: W, seconds: number, onTick: (w: W) => void = () => {}): RecoveryPhase[] {
  const phases: RecoveryPhase[] = []
  fly(w, seconds, (x) => {
    onTick(x)
    const p = phaseOf(x, 'ai-1')!
    if (phases.at(-1) !== p) phases.push(p)
    return p === 'landed'
  })
  return phases
}

const headingErr = (w: W, headingRad: number): number => {
  const f = qRotate(aircraftById(w, 'ai-1')!.state.attitude, v3(1, 0, 0))
  const d = Math.atan2(f.x, -f.z) - headingRad
  return Math.atan2(Math.sin(d), Math.cos(d))
}

describe('join, configure, final (7c-7g §6 phases 2-4, 7g spec §5)', () => {
  it('a clean join from the IP: configured before the fix, inside the capture window at it, onto final', () => {
    let atFix: { lateralM: number; headingErrRad: number; heightErrM: number; speedErrMps: number } | null = null
    let configuredBeforeFix: boolean | null = null
    let reachedFinal = false
    const w0 = atIpJoining()
    const approachMps = vA(w0)
    fly(w0, 240, (w) => {
      const a = aircraftById(w, 'ai-1')!
      const f = approachFrame(w, 'ai-1')
      if (configuredBeforeFix === null && f.alongM <= FIX_DISTANCE_M + 50) {
        configuredBeforeFix = a.state.gearFraction >= GEAR_DOWN_FRACTION && a.state.flapFraction >= 0.95 && a.controls.hookDown === true
      }
      if (atFix === null && f.alongM <= FIX_DISTANCE_M) {
        atFix = {
          lateralM: f.acrossM,
          headingErrRad: headingErr(w, f.geo.headingRad),
          heightErrM: f.wheelM - FIX_DISTANCE_M * Math.tan(glideRad),
          speedErrMps: length(airVelocity(a.state, w.wind)) - approachMps,
        }
      }
      reachedFinal = phaseOf(w, 'ai-1') === 'final'
      return reachedFinal
    })
    expect(configuredBeforeFix).toBe(true)
    expect(reachedFinal).toBe(true)
    expect(Math.abs(atFix!.lateralM)).toBeLessThan(CAPTURE_LATERAL_M)
    expect(Math.abs(atFix!.headingErrRad)).toBeLessThan(CAPTURE_HEADING_RAD)
    expect(Math.abs(atFix!.heightErrM)).toBeLessThan(CAPTURE_HEIGHT_M)
    expect(Math.abs(atFix!.speedErrMps)).toBeLessThan(CAPTURE_SPEED_MPS)
  })

  it('a deliberately bad join goes around once, then lands (7c-7g §6 acceptance)', () => {
    // Just short of the fix but 200 m right of the centerline and 150 m high.
    const w0 = carrierWorld()
    const w = inRecovery(onApproach(w0, 'ai-1', {
      alongM: FIX_DISTANCE_M + 20, acrossM: 200, wheelM: FIX_DISTANCE_M * Math.tan(glideRad) + 150, airspeedMps: vA(w0), configured: true,
    }), 'ai-1', 'configure')
    const phases = phasesFlown(w, 600, (x) => { expect(crashed(x, 'ai-1')).toBe(false) })
    expect(phases.filter((p) => p === 'go-around')).toHaveLength(1)
    expect(phases.at(-1)).toBe('landed')
  })

  it('a wave-off injected by geometry is obeyed before the cut', () => {
    // On final 600 m astern, 25 m above the 3.5° path: outside 0.7° of it, so
    // the LSO waves it off inside 250 m.
    const w0 = carrierWorld()
    const w = inRecovery(onApproach(w0, 'ai-1', {
      alongM: 600, wheelM: 600 * Math.tan(glideRad) + 25, airspeedMps: vA(w0), configured: true,
    }), 'ai-1', 'final')
    let cutAtGoAround: boolean | null = null
    const phases = phasesFlown(w, 60, (x) => {
      const r = aircraftById(x, 'ai-1')!.pilot!.decision.recovery!
      if (cutAtGoAround === null && r.phase === 'go-around') cutAtGoAround = r.cut
      expect(crashed(x, 'ai-1')).toBe(false)
    })
    expect(phases).toContain('go-around')
    expect(cutAtGoAround).toBe(false)
  })

  it('committed after the cut: a wave-off after it is ignored', () => {
    // 200 m astern and 40 m above the path: inside the wave-off range, off the slope.
    const w0 = carrierWorld()
    const placed = onApproach(w0, 'ai-1', { alongM: 200, wheelM: 200 * Math.tan(glideRad) + 40, airspeedMps: vA(w0), configured: true })
    const tickOnce = (cut: boolean) => {
      const w = inRecovery(placed, 'ai-1', 'final', cut)
      const a = aircraftById(w, 'ai-1')!
      const ctx = { nowS: 0, terrain: w.terrain, ships: w.ships, combat: w.combat, decks: decksOf(w.ships), wind: w.wind }
      const out = recoveryControls(a, a.pilot!, ctx, w.aircraft)
      const deck = approachFrame(w, 'ai-1').geo.deck!
      return { out, cue: paddlesCue(a.spec, a.state, out.controls, deck, w.ships[0]!.spec.paddles!, w.wind) }
    }
    const committed = tickOnce(true)
    expect(committed.cue).toBe('wave-off')
    expect(committed.out.recovery.phase).toBe('final')
    // The control case: the same wave-off before any cut is obeyed.
    expect(tickOnce(false).out.recovery.phase).toBe('go-around')
  })

  it('the whole approach is exempt from the 400 m floor; transit and hold are not (spec §6)', () => {
    const state = (phase: RecoveryPhase): RecoveryState => ({ ...startRecovery(0), phase })
    for (const p of ['join', 'configure', 'final', 'go-around', 'rollout', 'landed'] as const) expect(exemptFromFloor(state(p))).toBe(true)
    for (const p of ['transit', 'hold'] as const) expect(exemptFromFloor(state(p))).toBe(false)
    expect(exemptFromFloor(undefined)).toBe(false)
  })

  it('an exempt pilot keeps the overspeed guard and loses only the floor', () => {
    // Low on final, sinking: the floor would fire; exempt, nothing does.
    const w0 = carrierWorld()
    const low = aircraftById(onApproach(w0, 'ai-1', { alongM: 600, wheelM: 30, airspeedMps: vA(w0), configured: true }), 'ai-1')!
    const sinking = { ...low, state: { ...low.state, velocity: { ...low.state.velocity, y: -3 } } }
    expect(safetyOverride(sinking, w0.terrain, decksOf(w0.ships), w0.wind)?.mode).toBe('recover')
    expect(safetyOverride(sinking, w0.terrain, decksOf(w0.ships), w0.wind, Number.NEGATIVE_INFINITY)).toBeNull()
    // Diving past the dive limit at 200 m: overspeed still fires.
    const dive = { ...low, state: { ...low.state, velocity: v3(0, -0.96 * low.spec.limits.diveSpeedMps, 0) } }
    expect(safetyOverride(dive, w0.terrain, decksOf(w0.ships), w0.wind, Number.NEGATIVE_INFINITY)?.mode).toBe('overspeed')
  })

  it('the carrier turns 30° while the pilot is at the fix: it lands or goes around, never impacts (Review Focus 2)', () => {
    // The ship reaches its second waypoint (spec.lengthM early, `stepShip`)
    // as the pilot crosses the fix, then turns 30° to starboard at 1°/s.
    const turnAtM = TURN_AT_S * STILL_CARRIER.speedMps + 265.8
    const turn = (30 * Math.PI) / 180
    const turning = {
      ...STILL_CARRIER,
      waypoints: [[0, 0], [0, -turnAtM], [Math.sin(turn) * 60000, -turnAtM - Math.cos(turn) * 60000]],
    }
    const w0 = atIpJoining([turning])
    let headingAtFix: number | null = null
    let turnedBy = 0
    const phases = phasesFlown(w0, 400, (x) => {
      expect(crashed(x, 'ai-1')).toBe(false)
      const f = approachFrame(x, 'ai-1')
      if (headingAtFix === null && phaseOf(x, 'ai-1') === 'final') headingAtFix = f.geo.headingRad
      if (headingAtFix !== null) turnedBy = Math.max(turnedBy, Math.abs(f.geo.headingRad - headingAtFix))
    })
    expect(turnedBy).toBeGreaterThan((10 * Math.PI) / 180)
    expect(phases.includes('landed') || phases.includes('go-around')).toBe(true)
  })
})

/** Seconds from `atIpJoining` to the fix: 71.7, measured 2026-09-28 by the first case. */
const TURN_AT_S = 72
