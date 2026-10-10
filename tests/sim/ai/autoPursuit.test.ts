import { describe, expect, it } from 'vitest'
import {
  AUTO_PURSUIT_FLOOR_AGL_M,
  autoPursuit,
  autoPursuitTarget,
  floorLimitedVelocity,
} from '../../../src/sim/ai/autoPursuit.js'
import { createState } from '../../../src/sim/flight/state.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { v3, type Vec3 } from '../../../src/sim/math/vec3.js'
import {
  advance, aircraftById, createWorldOf, playerAircraft, withAircraftState, withControls, type AircraftEntity, type World,
} from '../../../src/sim/loop.js'
import { loadAircraftSpec, bundleForScenario } from '../../../tools/content/load.js'
import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { GUN_AIRFRAMES, SPEED_FRACTIONS, runDamageRange, runEvader, runOverload } from '../../../tools/autopilot/pursuitProbe.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const entity = (
  id: string,
  position: Vec3,
  velocity = v3(120, 0, 0),
  extra: Partial<AircraftEntity<undefined>> = {},
): AircraftEntity<undefined> => {
  const state = createState({ position, velocity })
  return {
    id, spec: f6f, state, previous: state,
    controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 },
    assistMemory: undefined, impact: null, parked: false,
    ...extra,
  }
}
const worldOf = (...aircraft: AircraftEntity<undefined>[]): World<undefined> =>
  createWorldOf({ aircraft, player: aircraft[0]!.id })

const destroyed = (world: World<undefined>, id: string): World<undefined> => {
  const rec = world.combat.aircraft[id]!
  return {
    ...world,
    combat: {
      ...world.combat,
      aircraft: { ...world.combat.aircraft, [id]: { ...rec, damage: { ...rec.damage, destroyedAt: 1 } } },
    },
  }
}

describe('autoPursuitTarget', () => {
  it('picks the nearest aircraft that is not the player', () => {
    const world = worldOf(
      entity('player', v3(0, 2000, 0)),
      entity('far', v3(3000, 2000, 0)),
      entity('near', v3(800, 2000, 0)),
    )
    expect(autoPursuitTarget(world)?.id).toBe('near')
  })

  it('7e: ignores an aircraft on the player\'s own side (an allied wingman), however near', () => {
    const world = worldOf(
      entity('player', v3(0, 2000, 0)),
      { ...entity('wingman', v3(500, 2000, 0)), side: 'allied' as const },
      entity('bandit', v3(2000, 2000, 0)),
    )
    expect(autoPursuitTarget(world)?.id).toBe('bandit')
  })

  it('ignores a destroyed aircraft, so it never follows one going down', () => {
    const world = destroyed(
      worldOf(entity('player', v3(0, 2000, 0)), entity('near', v3(500, 2000, 0)), entity('far', v3(2000, 2000, 0))),
      'near',
    )
    expect(autoPursuitTarget(world)?.id).toBe('far')
  })

  it('ignores crashed aircraft, but not one merely flagged parked while actually airborne (7g spec §2)', () => {
    // `parked` here has no ground or deck under it (this world has neither
    // terrain nor ships), so by ground state it is flying and IS picked --
    // the flag alone no longer excludes it. `landedHostileWorld`-style cases
    // (genuinely resting on a deck or runway) are covered above and in
    // targeting.test.ts's "contacts are decided by ground state" block.
    const crashed = entity('crashed', v3(400, 2000, 0))
    const world = worldOf(
      entity('player', v3(0, 2000, 0)),
      entity('parked', v3(300, 2000, 0), v3(0, 0, 0), { parked: true }),
      { ...crashed, impact: { tick: 1, position: crashed.state.position } as never },
      entity('live', v3(2500, 2000, 0)),
    )
    expect(autoPursuitTarget(world)?.id).toBe('parked')
  })

  it('ignores an enemy below the altitude floor', () => {
    const world = worldOf(
      entity('player', v3(0, 2000, 0)),
      entity('low', v3(300, AUTO_PURSUIT_FLOOR_AGL_M - 1, 0)),
      entity('high', v3(2500, 1500, 0)),
    )
    expect(autoPursuitTarget(world)?.id).toBe('high')
  })

  it('returns null when nothing qualifies', () => {
    const world = worldOf(entity('player', v3(0, 2000, 0)), entity('low', v3(300, 50, 0)))
    expect(autoPursuitTarget(world)).toBeNull()
  })

  it('an AI that spawned parked on a runway is a target once airborne (7g spec §2: ground state, not the spawn flag)', () => {
    const scenario = parseScenario({
      id: 'auto-pursuit-launched-hostile', player: 'player', airfields: ['tacloban'],
      aircraft: [
        { id: 'player', spec: 'f6f-hellcat', side: 'allied', airborneAt: { position: [0, 2000, 0], headingDeg: 90, speedMps: 120 } },
        { id: 'axis-1', spec: 'f6f-hellcat', side: 'axis', parkedAt: { airfield: 'tacloban', spot: 'runwayCenter' }, chocked: false },
      ],
      ships: [],
      weather: { windFromDeg: 0, windMps: 0 },
    })
    let world = worldFromScenario(bundleForScenario(scenario), null)
    const axis = aircraftById(world, 'axis-1')!
    const airborneState = { ...axis.state, position: v3(axis.state.position.x, 800, axis.state.position.z) }
    world = withAircraftState(world, 'axis-1', airborneState)
    expect(aircraftById(world, 'axis-1')!.parked).toBe(true)
    expect(autoPursuitTarget(world)?.id).toBe('axis-1')
  })
})

describe('floorLimitedVelocity', () => {
  const forward = v3(1, 0, 0)

  it('leaves a level or climbing request alone', () => {
    const desired = v3(100, 10, 0)
    expect(floorLimitedVelocity(desired, forward, 500)).toEqual(desired)
  })

  it('limits the descent rate as the floor approaches, keeping the speed', () => {
    const desired = v3(0, -150, 50)
    const limited = floorLimitedVelocity(desired, forward, 60)
    expect(limited.y).toBeGreaterThan(desired.y)
    expect(limited.y).toBeLessThan(0)
    expect(Math.hypot(limited.x, limited.y, limited.z)).toBeCloseTo(Math.hypot(0, 150, 50), 6)
  })

  it('commands a climb below the floor, even for a target straight down', () => {
    const limited = floorLimitedVelocity(v3(0, -150, 0), forward, -20)
    expect(limited.y).toBeGreaterThan(0)
    // With no horizontal component to keep, it climbs out along the nose's heading.
    expect(limited.x).toBeGreaterThan(0)
  })
})

describe('autoPursuit', () => {
  it('levels off on the current heading with no target, rather than letting go in a dive', () => {
    // Nose 45 degrees down: a positive turn about body +Z pitches the nose up.
    const state = createState({ position: v3(0, 1000, 0), velocity: v3(90, -90, 0), attitude: qFromAxisAngle(v3(0, 0, 1), -Math.PI / 4) })
    const diving = { ...entity('player', v3(0, 1000, 0)), state, previous: state }
    const result = autoPursuit(worldOf(diving))!
    expect(result.target).toBeNull()
    expect(result.pitch).toBeGreaterThan(0.5)
  })

  it('is null while the player is on the ground', () => {
    const world = worldOf(entity('player', v3(0, 2, 0), v3(0, 0, 0)), entity('bandit', v3(800, 2000, 0)))
    expect(autoPursuit(world)).toBeNull()
  })

  it('banks right toward a target off the right wing', () => {
    const world = worldOf(entity('player', v3(0, 2000, 0)), entity('bandit', v3(1000, 2000, 1500)))
    const result = autoPursuit(world)!
    expect(result.target).toBe('bandit')
    expect(result.roll).toBeGreaterThan(0.5)
  })

  // Closed loop through the real `advance`, steering every frame the way
  // `frame.ts` does. The world has no terrain, so the diving target passes
  // through the sea and later climbs back out ~5 km away at ~400 m: the
  // pursuer then has to turn hard toward a target just above the floor.
  // Before the sink-rate recovery in `autoPursuit` that turn bottomed out at
  // 57 m (probed 2026-09-25); with it the minimum is 345 m.
  it('follows a diving target down, then turns back after it, without going through the floor', () => {
    const state = (p: Vec3, pitchRad: number) =>
      createState({ position: p, velocity: v3(130 * Math.cos(pitchRad), 130 * Math.sin(pitchRad), 0), attitude: qFromAxisAngle(v3(0, 0, 1), pitchRad) })
    const player = entity('player', v3(0, 700, 0), v3(130, 0, 0))
    const banditState = state(v3(700, 650, 100), -0.9)
    const bandit = { ...entity('bandit', v3(0, 0, 0)), state: banditState, previous: banditState, controls: { pitch: -0.3, roll: 0, yaw: 0, throttle: 1 } }
    let world = worldOf(player, bandit)
    let minAltitude = Infinity
    let chasedBelow = Infinity
    for (let frame = 0; frame < 60 * 40; frame++) {
      const ap = autoPursuit(world)!
      world = advance(withControls(world, 'player', { ...playerAircraft(world).controls, roll: ap.roll, pitch: ap.pitch, yaw: ap.yaw }), 1 / 60).world
      minAltitude = Math.min(minAltitude, playerAircraft(world).state.position.y)
      if (ap.target === 'bandit') chasedBelow = Math.min(chasedBelow, world.aircraft[1]!.state.position.y)
    }
    expect(playerAircraft(world).impact).toBeNull()
    expect(minAltitude).toBeGreaterThan(AUTO_PURSUIT_FLOOR_AGL_M)
    // It never chose the target while the target was under the floor.
    expect(chasedBelow).toBeGreaterThanOrEqual(AUTO_PURSUIT_FLOOR_AGL_M - 5)
  })
})

// B3 (2026-10-10): the pursuit autopilot is g-limited to each airframe's own
// `limits.gLimit` less a margin (`AUTO_PURSUIT_G_FRACTION`), so Shift never
// overstresses the player's airplane under Realistic damage. Measured at
// 91da48f0, before the limit (tools/autopilot/pursuitProbe.ts): Shift on a
// green Zero in the crossing geometry pulled 13.55 g and broke the F6F up in
// 4 of 4 cursors; with an enemy 800 m behind at 0.95 of dive speed the F6F,
// F4U, F4F and Ki-84 broke up at 10.9-11.5 g. Both were red before the fix.
describe('the pursuit autopilot stays inside the airframe limit (B3)', () => {
  it('enrolls every airframe with fixed guns', () => {
    expect(GUN_AIRFRAMES).toEqual([
      'a6m2-zero', 'd3a-val', 'f4f-wildcat', 'f4u-corsair', 'f6f-hellcat',
      'ki-43-oscar', 'ki-84-frank', 'p-38-lightning', 'tbm-3-avenger',
    ])
  })

  for (const spec of GUN_AIRFRAMES) {
    it(`${spec}: a reversal onto an enemy behind, from 0.6-0.95 of dive speed`, () => {
      const limit = loadAircraftSpec(spec).limits.gLimit
      for (const f of SPEED_FRACTIONS) {
        const r = runOverload(spec, f)
        expect(r.peakG, `${spec} at ${f} Vd`).toBeLessThanOrEqual(limit)
        expect(r.structure, `${spec} at ${f} Vd`).toBe(1)
      }
    })
  }

  it('Shift on a green Zero in the crossing geometry (the 13 g case) keeps the F6F whole', () => {
    for (const cursor of [0, 7919, 15838, 23757]) {
      const r = runEvader('crossing', 'green', cursor)
      expect(r.peakG, `cursor ${cursor}`).toBeLessThanOrEqual(f6f.limits.gLimit)
      expect(r.structure, `cursor ${cursor}`).toBe(1)
    }
  })

  // The limit must not cost the gun solution. Measured 2026-10-10, identical
  // before and after the limit: the Damage Range's first two 0.25 s taps land
  // 11 and 14 hits (the damage stages round 2 handoff's 11-18), the three
  // Zeros burn on taps 2, 12 and 12; head-on, Shift first holds the solution
  // on a veteran Zero at 9.8 s.
  it('keeps the gun solution: Damage Range taps, and the head-on pass', () => {
    const range = runDamageRange()
    expect(range.taps[0]).toBeGreaterThanOrEqual(11)
    expect(Object.values(range.tapsToBurn).every((n) => n !== null && n <= 12)).toBe(true)
    expect(runEvader('head-on', 'veteran', 0).firstSolutionS).toBeLessThanOrEqual(10)
  })
})
