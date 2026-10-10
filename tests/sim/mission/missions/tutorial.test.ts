/**
 * Basic Flying (B4, docs/superpowers/plans/2026-10-10-b4-tutorial.md), flown
 * headless: a scripted pilot goes through every step of the tutorial in
 * production `advance`, and each step is shown to stay incomplete when the
 * player does the wrong thing.
 *
 * What is flown and what is staged, honestly:
 * - flown for real: the throttle lever, the take-off roll (`deckRun`), the gear
 *   coming up, the climb through the band, the final approach and landing
 *   (`fieldApproach`);
 * - staged with `hold` (the airplane pinned at a place, as Scramble's tests
 *   do): the leg to the marker over the bay and the join of the final, whose
 *   geography is what these stations test, not the airplane;
 * - injected with `destroyNow` (spec §5's injected hits): the strafing kills
 *   and the bomb hit. Gunnery and bombing themselves have their own suites.
 */
import { describe, it, expect } from 'vitest'
import { loadScenarioBundle } from '../../../../tools/content/load.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import { advance, playerAircraft, withControls, type World } from '../../../../src/sim/loop.js'
import { DT, type Controls } from '../../../../src/sim/flight/model.js'
import { attitudeAngles } from '../../../../src/sim/flight/attitude.js'
import { sub, length, v3 } from '../../../../src/sim/math/vec3.js'
import { ticksFor, radioMessages } from '../../../../src/sim/mission/state.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { progressOf } from '../fixture.js'
import { deckRun, destroyNow, fieldApproach, hold, levelAt, settledAll, stepsWithControls, terrainOrSkip } from '../fly.js'

const FIELD = { x: -29666, z: -47605 }
const MARKER = { x: FIELD.x + 4000, z: FIELD.z - 3000 }
const FINAL = { x: FIELD.x, z: FIELD.z + 4800 }
const FT = 0.3048
const MPH = 0.44704
const IDLE: Partial<Controls> = { throttle: 0 }

const terrain = terrainOrSkip()
const tutorial = (): World<undefined> => worldFromScenario(loadScenarioBundle('tutorial'), terrain)
/** The frame's `settleOnTerrain`: wheels on the strip, so a parked start can sit there for seconds. */
const parked = (): World<undefined> => settledAll(tutorial())
const status = (w: World<undefined>, id: string): string => progressOf(w, id).status
const statuses = (w: World<undefined>): Record<string, string> =>
  Object.fromEntries(w.mission!.objectives.map((o, i) => [o.id, w.mission!.progress[i]!.status]))
const texts = (w: World<undefined>): string[] => radioMessages(w.mission!).map((e) => e.text)
const MESSAGES = loadScenarioBundle('tutorial').scenario.triggers!.flatMap((t) => t.then.flatMap((a) => ('message' in a ? [a.message] : [])))

/** Wings level and a steady climb (the `deckRun` law), with the levers as asked. */
function climbOut(w: World<undefined>, lever: Partial<Controls>, until: (w: World<undefined>) => boolean, maxS = 120): World<undefined> {
  let world = w
  let integral = 0
  for (let i = 0; i < ticksFor(maxS); i++) {
    if (until(world)) return world
    const s = playerAircraft(world).state
    const air = length(sub(s.velocity, world.wind ?? v3(0, 0, 0)))
    const gammaDeg = (Math.atan2(s.velocity.y, Math.hypot(s.velocity.x, s.velocity.z)) * 180) / Math.PI
    const error = (air < 50 ? 0 : 10) - gammaDeg
    integral = Math.max(-0.5, Math.min(1, integral + (error * DT) / 40))
    world = withControls(world, world.player, {
      pitch: Math.max(-1, Math.min(1, error / 20 + integral)),
      roll: Math.max(-1, Math.min(1, -2 * attitudeAngles(s).rollRad)),
      yaw: 0, throttle: 1, ...lever,
    })
    world = advance(world, DT).world
    const impact = playerAircraft(world).impact
    if (impact !== null) throw new Error(`climbOut: impact (${impact.kind}) at tick ${impact.tick}`)
  }
  throw new Error(`climbOut: not done in ${maxS} s at tick ${world.tick}`)
}

// Worlds built once and shared: a World is immutable, so every test branches from them freely.
const memo = <T>(make: () => T): (() => T) => { let v: T | undefined; return () => (v ??= make()) }

/** Parked, two seconds in: the welcome call has been made. */
const welcomed = memo(() => stepsWithControls(parked(), ticksFor(2), IDLE))
/** Full throttle and a take-off roll to 200 m over the strip; gear and flaps as `deckRun` leaves them (gear down, flaps up). */
const climbing = memo(() => deckRun(stepsWithControls(welcomed(), 1, { throttle: 1 }), { flaps: false, climbToM: 200 }))
/** Gear up for real, then climbed through the 1,500 ft floor. */
const gearUp = memo(() => climbOut(climbing(), { gearDown: false }, (w) => status(w, 'gear-up') === 'complete'))
const inBand = memo(() => climbOut(gearUp(), { gearDown: false }, (w) => status(w, 'climb') === 'complete'))
const atMarker = memo(() => hold(inBand(), levelAt(MARKER, 800, 100, 90), 2))
const strafed = memo(() => hold(destroyNow(atMarker(), ['target-1', 'target-2']), levelAt(MARKER, 800, 100, 90), 1))
const onFinal = memo(() => hold(strafed(), levelAt(FINAL, 300, 90, 0), 2))

describe('Basic Flying content', () => {
  const { scenario } = loadScenarioBundle('tutorial')
  const objectives = scenario.objectives!

  it('is a chain: every objective but the first two waits on an earlier one, and only the bomb run is secondary', () => {
    expect(objectives.map((o) => [o.id, o.kind, o.after ?? null, o.priority])).toEqual([
      ['throttle', 'state', null, 'primary'],
      ['up', 'takeoff', 'throttle', 'primary'],
      ['gear-up', 'state', 'up', 'primary'],
      ['climb', 'state', 'gear-up', 'primary'],
      ['marker', 'reach', 'climb', 'primary'],
      ['strafe', 'destroy', 'marker', 'primary'],
      ['bomb', 'destroy', 'strafe', 'secondary'],
      ['final', 'reach', 'strafe', 'primary'],
      ['config', 'state', 'final', 'primary'],
      ['land', 'land', 'config', 'primary'],
    ])
  })

  it('the numbers say what the labels and the radio say (imperial text, SI content)', () => {
    const o = (id: string) => objectives.find((x) => x.id === id)!
    expect((o('climb') as { altitudeM: number[] }).altitudeM[0]).toBeCloseTo(1500 * FT, 0)
    expect((o('config') as { airspeedMps: number[] }).airspeedMps[1]).toBeCloseTo(120 * MPH, 0)
    expect(o('config').label).toMatch(/120 mph/)
    expect(o('climb').label).toMatch(/1,500 ft/)
    expect((o('throttle') as { throttle: number[] }).throttle).toEqual([0.9, 1])
  })

  it('has one message per step, the first at 1 s, each one on the completion of the step before it', () => {
    const triggers = scenario.triggers!
    expect(triggers.map((t) => t.when)).toEqual([
      { at: 1 }, { completed: 'throttle' }, { completed: 'up' }, { completed: 'gear-up' }, { completed: 'climb' },
      { completed: 'marker' }, { completed: 'strafe' }, { completed: 'final' }, { completed: 'config' },
    ])
    expect(MESSAGES).toHaveLength(9)
    for (const m of MESSAGES) expect(m).toMatch(/^Instructor: /)
  })

  it('the targets are two parked enemy Hellcats and the ship is an enemy cargo ship, so strafing and bombing are legal objectives', () => {
    const w = tutorial()
    expect(w.mission!.objectives.find((o) => o.id === 'strafe')!.resolved).toEqual(['target-1', 'target-2'])
    expect(w.mission!.objectives.find((o) => o.id === 'bomb')!.resolved).toEqual(['maru-1'])
    expect(scenario.briefing!.loadout).toBe('bombs')
  })
})

describe.skipIf(terrain === null)('Basic Flying, headless', () => {
  it('at the start only the throttle step is live; at 1 s the instructor welcomes the pilot', () => {
    const w0 = tutorial()
    expect(statuses(w0)).toEqual({
      throttle: 'active', up: 'inactive', 'gear-up': 'inactive', climb: 'inactive', marker: 'inactive',
      strafe: 'inactive', bomb: 'inactive', final: 'inactive', config: 'inactive', land: 'inactive',
    })
    expect(texts(w0)).toEqual([])
    expect(texts(welcomed())).toEqual([MESSAGES[0]])
  })

  describe('step 1, full throttle', () => {
    it('stays incomplete at idle, at half and at 0.89', () => {
      for (const throttle of [0, 0.5, 0.89]) {
        const w = stepsWithControls(welcomed(), ticksFor(3), { throttle })
        expect(status(w, 'throttle'), `throttle ${throttle}`).toBe('active')
        expect(status(w, 'up')).toBe('inactive')
      }
    })
    it('completes the tick the lever reaches 0.9, and the instructor says so', () => {
      const w = stepsWithControls(welcomed(), 1, { throttle: 0.9 })
      expect(status(w, 'throttle')).toBe('complete')
      expect(status(w, 'up')).toBe('active')
      expect(texts(w)).toEqual([MESSAGES[0], MESSAGES[1]])
    })
  })

  describe('step 2, take off', () => {
    it('is not met by sitting on the runway at full throttle for a few seconds with the brakes on', () => {
      const w = stepsWithControls(stepsWithControls(welcomed(), 1, { throttle: 1 }), ticksFor(4), { throttle: 1, brake: 1 })
      expect(status(w, 'up')).toBe('active')
      expect(playerAircraft(w).state.position.y).toBeLessThan(40)
    })
    it('is met by the take-off roll, which then opens the gear step', () => {
      const w = climbing()
      expect(status(w, 'up')).toBe('complete')
      expect(status(w, 'gear-up')).toBe('active')
      expect(texts(w).at(-1)).toBe(MESSAGES[2])
    })
  })

  describe('step 3, gear up', () => {
    it('is not met while the gear lever is left down, however long the climb', () => {
      const w = climbOut(climbing(), { gearDown: true }, (x) => x.tick >= climbing().tick + ticksFor(15))
      expect(playerAircraft(w).state.gearFraction).toBe(1)
      expect(status(w, 'gear-up')).toBe('active')
      expect(status(w, 'climb')).toBe('inactive')
    })
    it('is not met while the gear is still travelling', () => {
      let w = climbing()
      for (let i = 0; i < 2; i++) w = climbOut(w, { gearDown: false }, (x) => x.tick >= w.tick + 10, 5)
      const f = playerAircraft(w).state.gearFraction
      expect(f).toBeGreaterThan(0)
      expect(f).toBeLessThan(1)
      expect(status(w, 'gear-up')).toBe('active')
    })
    it('is met when the gear is fully retracted, and not before', () => {
      const w = gearUp()
      expect(playerAircraft(w).state.gearFraction).toBe(0)
      expect(status(w, 'gear-up')).toBe('complete')
      expect(texts(w).at(-1)).toBe(MESSAGES[3])
    })
  })

  describe('step 4, climb above 1,500 ft', () => {
    it('is not met below the band (the gear-up moment is still under 1,500 ft)', () => {
      expect(playerAircraft(gearUp()).state.position.y).toBeLessThan(1500 * FT)
      expect(status(gearUp(), 'climb')).toBe('active')
    })
    it('is not met above the band either', () => {
      const w = hold(gearUp(), levelAt({ x: FIELD.x, z: FIELD.z - 5000 }, 3000, 110, 0), 3)
      expect(status(w, 'climb')).toBe('active')
    })
    it('is met inside it, and the instructor points the pilot at the marker', () => {
      const w = inBand()
      expect(playerAircraft(w).state.position.y).toBeGreaterThanOrEqual(1500 * FT)
      expect(status(w, 'climb')).toBe('complete')
      expect(status(w, 'marker')).toBe('active')
      expect(texts(w).at(-1)).toBe(MESSAGES[4])
    })
  })

  describe('step 5, fly to the marker', () => {
    it('is not met by flying elsewhere, or by crossing the marker too low', () => {
      expect(status(hold(inBand(), levelAt({ x: FIELD.x - 6000, z: FIELD.z - 3000 }, 800, 100, 90), 3), 'marker')).toBe('active')
      expect(status(hold(inBand(), levelAt(MARKER, 60, 100, 90), 3), 'marker')).toBe('active')
    })
    it('is met over the bay at altitude; then the strafing step is live', () => {
      const w = atMarker()
      expect(status(w, 'marker')).toBe('complete')
      expect(status(w, 'strafe')).toBe('active')
      expect(texts(w).at(-1)).toBe(MESSAGES[5])
    })
  })

  describe('step 6, strafe the parked Hellcats', () => {
    it('is not met by flying past them', () => {
      const w = hold(atMarker(), levelAt({ x: FIELD.x, z: FIELD.z + 400 }, 120, 100, 180), 120)
      expect(status(w, 'strafe')).toBe('active')
      expect(progressOf(w, 'strafe').count).toBe(0)
    })
    it('is not met by one of the two', () => {
      const w = hold(destroyNow(atMarker(), ['target-1']), levelAt(MARKER, 800, 100, 90), 1)
      expect(status(w, 'strafe')).toBe('active')
      expect(progressOf(w, 'strafe').count).toBe(1)
    })
    it('is met by both; the bomb run and the final open together', () => {
      const w = strafed()
      expect(status(w, 'strafe')).toBe('complete')
      expect(status(w, 'bomb')).toBe('active')
      expect(status(w, 'final')).toBe('active')
      expect(texts(w).at(-1)).toBe(MESSAGES[6])
    })
  })

  describe('step 7, the bomb run is optional', () => {
    it('bombing the ship completes it', () => {
      const w = hold(destroyNow(strafed(), ['maru-1']), levelAt(MARKER, 800, 100, 90), 1)
      expect(status(w, 'bomb')).toBe('complete')
    })
  })

  describe('step 8, join the final', () => {
    it('is not met three miles to the side, or on the centerline at 3,000 ft', () => {
      expect(status(hold(strafed(), levelAt({ x: FINAL.x + 6000, z: FINAL.z }, 300, 90, 0), 3), 'final')).toBe('active')
      expect(status(hold(strafed(), levelAt(FINAL, 900, 90, 0), 3), 'final')).toBe('active')
    })
    it('is met on the centerline 3 miles out, which sets the landing check going', () => {
      const w = onFinal()
      expect(status(w, 'final')).toBe('complete')
      expect(status(w, 'config')).toBe('active')
      expect(texts(w).at(-1)).toBe(MESSAGES[7])
    })
  })

  describe('step 9, gear and flaps down, under 120 mph', () => {
    // The levers follow the surfaces, or the tick's own travel would move them.
    const at = (gear: number, flaps: number, speed: number) =>
      hold(withControls(onFinal(), 'f6f-1', { pitch: 0, roll: 0, yaw: 0, throttle: 0.3, gearDown: gear >= 0.5, flapDown: flaps >= 0.5 }),
        { ...levelAt(FINAL, 300, speed, 0), gearFraction: gear, flapFraction: flaps }, 1)
    it('needs all three: gear, flaps and speed', () => {
      expect(status(at(1, 1, 50), 'config'), 'all three').toBe('complete')
      expect(status(at(0, 1, 50), 'config'), 'gear up').toBe('active')
      expect(status(at(1, 0, 50), 'config'), 'flaps up').toBe('active')
      expect(status(at(1, 1, 65), 'config'), '145 mph').toBe('active')
      expect(status(at(0, 0, 90), 'config'), 'nothing set').toBe('active')
      expect(status(at(0.5, 0.5, 50), 'config'), 'in transit').toBe('active')
    })
    it('120 mph is the edge: 119 passes, 121 does not (air speed: the 3 m/s headwind adds to the ground speed flown)', () => {
      expect(status(at(1, 1, 119 * MPH - 3), 'config')).toBe('complete')
      expect(status(at(1, 1, 121 * MPH - 3), 'config')).toBe('active')
    })
    it('is read in the air, not over the ground: a 3 m/s headwind turns 52 m/s of ground speed into 55', () => {
      // The wind blows from 000, so a northbound airplane flies into it.
      expect(status(at(1, 1, 52), 'config')).toBe('active')
      expect(status(at(1, 1, 50), 'config')).toBe('complete')
    })
  })

  describe('step 10, land', () => {
    it('the whole sortie: every step in order, one instructor message each in order, and the badge', () => {
      const w = fieldApproach(onFinal(), 'tacloban')
      expect(statuses(w)).toMatchObject({ throttle: 'complete', up: 'complete', 'gear-up': 'complete', climb: 'complete', marker: 'complete', strafe: 'complete', final: 'complete', config: 'complete', land: 'complete', bomb: 'active' })
      expect(texts(w)).toEqual(MESSAGES)
      const out = missionOutcome(w.mission!, recoveryOf(w)!)
      expect(out).toMatchObject({ result: 'success', badge: { id: 'basic-flying' }, reasons: [] })
      expect(out.objectives.find((o) => o.id === 'bomb')).toMatchObject({ priority: 'secondary', final: 'incomplete' })
    })

    it('landing without ever setting up for it (config never met) is no landing credit: the land step is still waiting', () => {
      const w = hold(strafed(), levelAt(FINAL, 300, 90, 0), 2)
      expect(status(w, 'land')).toBe('inactive')
      const out = missionOutcome(w.mission!, { kind: 'landed', at: { kind: 'airfield', id: 'tacloban' } as never })
      expect(out.result).toBe('no-badge')
      expect(out.reasons).toEqual(expect.arrayContaining(['Gear and flaps down, under 120 mph: incomplete', 'Land: incomplete']))
    })
  })
})
