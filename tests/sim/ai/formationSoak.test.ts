import { describe, expect, it } from 'vitest'
import { advance, aircraftById, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { stationErrorM } from '../../../src/sim/ai/formation.js'
import { PURSUIT_FLOOR_M } from '../../../src/sim/ai/safety.js'
import { PLAYER_EAST, PLAYER_FAR, buildFormation, formationLeader, wingman } from './formationWorlds.js'
import { runCanned, type ScriptedFlight } from './maneuverWorlds.js'

/** 7f spec, Acceptance: an ingress pair and a flight of four, 300 s, through
 *  production `advance`, plus the 7c-7g §7 invariants. */
const ROUTE = [
  { x: 20000, z: 0, altitudeM: 3000, speedMps: 120 },
  { x: 20000, z: 20000, altitudeM: 3500, speedMps: 130 },
  { x: 40000, z: 20000, altitudeM: 3000, speedMps: 120 },
]
const LEAD = { id: 'lead-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 }, pilot: { skill: 'green', ingress: { route: ROUTE } } }
const FLIGHT = [LEAD,
  wingman('w1', 'lead-1', 1, [-80, 3000, 100], 'axis', 'green'),
  wingman('w2', 'lead-1', 2, [-80, 3000, -100], 'axis', 'green'),
  wingman('w3', 'lead-1', 3, [-160, 3000, -200], 'axis', 'green')]
const steps = (w: World<undefined>, n: number) => { for (let i = 0; i < n; i++) w = advance(w, DT).world; return w }

describe('a flight of four follows an ingress leader (7f spec §3)', () => {
  // The brief's 360 s loop assumed the leader finishes the 3-leg, ~60 km
  // route (at 120-130 m/s) inside that window. Measured 2026-09-27
  // (tests/sim/ai/_measureLeg.test.ts, deleted after use): leg 0->1 at
  // 159.6 s, 1->2 at 317.1 s, and 2->4 (no destination point, so
  // `nextLegIndex` jumps straight to the orbit n+1=4, skipping n=3
  // entirely -- per this file's own header comment above) at 478.6 s. 520 s
  // gives that margin; the brief's own fallback note for reaching the
  // orbit inside the window applies (`toBeGreaterThanOrEqual(ROUTE.length)`).
  const SOAK_S = 520
  it('reaches the last leg with every wingman within 150 m of station on each leg end, no floor or G violation, no NaN', () => {
    let w = buildFormation([PLAYER_FAR, ...FLIGHT])
    let lastLeg = 0
    for (let i = 0; i < SOAK_S * 60; i++) {
      w = advance(w, DT).world
      const leg = aircraftById(w, 'lead-1')!.pilot!.decision.legIndex
      for (const id of ['w1', 'w2', 'w3']) {
        const a = aircraftById(w, id)!
        const s = a.state
        expect([s.position.x, s.position.y, s.position.z].every(Number.isFinite)).toBe(true)
        expect(s.position.y).toBeGreaterThan(PURSUIT_FLOOR_M)
        expect(w.combat.aircraft[id]!.stress.loadFactorG).toBeLessThanOrEqual(a.spec.limits.gLimit)
        if (leg !== lastLeg) expect(stationErrorM(a, aircraftById(w, 'lead-1')!, a.pilot!.formation!.slot), `${id} at leg ${lastLeg}`).toBeLessThan(150)
      }
      lastLeg = leg
    }
    expect(lastLeg).toBeGreaterThanOrEqual(ROUTE.length)
  })

  it('is bit-identical across runs, and with the aircraft array reversed (Review Focus 4)', () => {
    const a = steps(buildFormation([PLAYER_FAR, ...FLIGHT]), 60 * 60)
    const b = steps(buildFormation([PLAYER_FAR, ...FLIGHT]), 60 * 60)
    expect(b.aircraft).toEqual(a.aircraft)
    const r = steps(buildFormation([PLAYER_FAR, ...[...FLIGHT].reverse()]), 60 * 60)
    for (const id of ['lead-1', 'w1', 'w2', 'w3']) expect(aircraftById(r, id)!.state).toEqual(aircraftById(a, id)!.state)
  })

  it('a structuredClone taken mid-flight flies on identically', () => {
    const mid = steps(buildFormation([PLAYER_FAR, ...FLIGHT]), 90 * 60)
    expect(steps(structuredClone(mid), 600)).toEqual(steps(mid, 600))
  })
})

/**
 * Controller ruling (Task 6 dispatch, 2026-09-27): the formation law's
 * untested input is a leader that never settles -- a player jinking left and
 * right rather than the scripted leader's steady bank or level flight every
 * other 7f test uses. A wingman on the player (`PLAYER_EAST`, so the leader
 * id is `f6f-1`) rides out 60 s of a 60-degree bank reversing every 3 s, then
 * 30 s level. Bounds here are sanity/safety, not tuning targets: if either
 * fails, the numbers are reported and formation.ts is left alone (Task 3
 * already tuned it against the bounded tests above).
 */
describe('a wingman rides out a jinking player leader (Controller ruling, Task 6 dispatch)', () => {
  it('stays finite, above the pursuit floor and within its G limit through 60 s of jink, then rejoins to under 50 m in 30 s level', () => {
    const LEAD_110 = { ...PLAYER_EAST, airborneAt: { ...PLAYER_EAST.airborneAt, speedMps: 110 } }
    const wing = wingman('wing-1', 'f6f-1', 1, [-80, 3000, 100], 'allied', 'veteran', 110)
    const w0 = buildFormation([LEAD_110, wing])

    // Alternates a 60-degree left/right bank every 3 s, switching by world
    // time (`w.tick * DT`), as the brief's override specifies.
    const jink: ScriptedFlight = (a, w) => {
      const t = w.tick * DT
      const bankDeg = Math.floor(t / 3) % 2 === 0 ? 60 : -60
      return formationLeader(110, 3000, bankDeg)(a, w)
    }

    let maxStationErrorM = 0
    const settled = runCanned(w0, { 'f6f-1': jink }, 60, (x) => {
      const wg = aircraftById(x, 'wing-1')!
      const s = wg.state
      expect([s.position.x, s.position.y, s.position.z].every(Number.isFinite), 'position finite').toBe(true)
      expect([s.velocity.x, s.velocity.y, s.velocity.z].every(Number.isFinite), 'velocity finite').toBe(true)
      expect(s.position.y, 'above PURSUIT_FLOOR_M').toBeGreaterThan(PURSUIT_FLOOR_M)
      expect(x.combat.aircraft['wing-1']!.stress.loadFactorG, 'within gLimit').toBeLessThanOrEqual(wg.spec.limits.gLimit)
      maxStationErrorM = Math.max(maxStationErrorM, stationErrorM(wg, aircraftById(x, 'f6f-1')!, 1))
    })
    console.log(`jinking soak: max station error ${maxStationErrorM.toFixed(1)} m`)
    expect(maxStationErrorM, 'max station error during 60 s of jinking, m (sanity bound, not a tuning target)').toBeLessThan(400)

    const level = runCanned(settled, { 'f6f-1': formationLeader(110, 3000, 0) }, 30, () => {})
    const finalErrorM = stationErrorM(aircraftById(level, 'wing-1')!, aircraftById(level, 'f6f-1')!, 1)
    console.log(`jinking soak: station error after 30 s level ${finalErrorM.toFixed(1)} m`)
    expect(finalErrorM, 'station error after 30 s level flight, m').toBeLessThan(50)
  })
})
