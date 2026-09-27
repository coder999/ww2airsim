import { describe, it, expect } from 'vitest'
import { loadScenario, bundleForScenario } from '../../../tools/content/load.js'
import { loadTerrainHeader, loadTerrainLevel } from '../../../tools/terrain/load.js'
import { finestFetchedLevelFor, INTERIM_ASSET_QUALITY_TIER } from '../../../src/render/content.js'
import { createTerrainField } from '../../../src/sim/world/terrain.js'
import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { advance, playerAircraft, withAircraftState, withControls, type World } from '../../../src/sim/loop.js'
import { createState, DT, type Controls } from '../../../src/sim/flight/model.js'
import { deckOf, deckWorld, deckLocal } from '../../../src/sim/world/deck.js'
import { approachControls, VREF_STALL_MULTIPLE } from '../../../tools/autopilot/approach.js'
import { ticksFor, lastLanding, radioMessages } from '../../../src/sim/mission/state.js'
import { finalStatus } from '../../../src/sim/mission/outcome.js'
import { nextPass, NO_PASS, PASS_RESOLVE_S, WAVE_OFF_MESSAGE, type PassEvent, type PassTracking } from '../../../src/sim/mission/passes.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { missionWorld, progressOf, scenario, steps } from './fixture.js'

const RESOLVE = ticksFor(PASS_RESOLVE_S)

/** Feeds `nextPass` one tick per entry of `script` from tick 0: `w` in the
 *  window, `.` out of it, `L` out of it and landed at the pass's ship. */
function run(script: string): { readonly pass: PassTracking; readonly events: readonly { readonly tick: number; readonly event: PassEvent }[] } {
  let pass = NO_PASS
  const events: { tick: number; event: PassEvent }[] = []
  for (let tick = 0; tick < script.length; tick++) {
    const c = script[tick]!
    const r = nextPass(pass, c === 'w', c === 'L', tick)
    pass = r.pass
    if (r.event !== null) events.push({ tick, event: r.event })
  }
  return { pass, events }
}

describe('nextPass (Mark, 2026-09-26; M3-R4)', () => {
  it('in, out, then a landing inside PASS_RESOLVE_S: one trapped', () => {
    const r = run('..' + 'w'.repeat(30) + '.'.repeat(RESOLVE - 1) + 'L' + '.'.repeat(RESOLVE * 2))
    expect(r.events).toEqual([{ tick: 2 + 30 + RESOLVE - 1, event: 'trapped' }])
    expect(r.pass).toBe(NO_PASS)
  })

  it('in, out, PASS_RESOLVE_S with no landing: one missed, at exactly exitTick + ticksFor(PASS_RESOLVE_S)', () => {
    const exitTick = 2 + 30
    const r = run('..' + 'w'.repeat(30) + '.'.repeat(RESOLVE * 3))
    expect(r.events).toEqual([{ tick: exitTick + RESOLVE, event: 'missed' }])
    expect(r.pass).toBe(NO_PASS)
  })

  it('exit and re-enter inside 15 s is one pass, and a trap after it is never missed (Review Focus 4)', () => {
    const r = run('w'.repeat(20) + '.'.repeat(RESOLVE - 1) + 'w'.repeat(20) + '.'.repeat(RESOLVE - 1) + 'L' + '.'.repeat(RESOLVE * 2))
    expect(r.events.map((e) => e.event)).toEqual(['trapped'])
  })

  it('exit and re-enter restarts the clock: the miss is timed from the LAST exit', () => {
    const lastExit = 20 + (RESOLVE - 1) + 20
    const r = run('w'.repeat(20) + '.'.repeat(RESOLVE - 1) + 'w'.repeat(20) + '.'.repeat(RESOLVE * 2))
    expect(r.events).toEqual([{ tick: lastExit + RESOLVE, event: 'missed' }])
  })

  it('a landing with no open or pending pass: no event', () => {
    expect(run('..L..').events).toEqual([])
    // Nor one after the pass has already resolved as missed.
    expect(run('w' + '.'.repeat(RESOLVE + 5) + 'L').events.map((e) => e.event)).toEqual(['missed'])
  })

  it('a landing while still in the window resolves it trapped', () => {
    expect(nextPass({ open: true, exitTick: null }, false, true, 9)).toEqual({ pass: NO_PASS, event: 'trapped' })
  })

  it('never in the window: no event, and NO_PASS by identity', () => {
    const r = run('.'.repeat(RESOLVE * 2))
    expect(r.events).toEqual([])
    expect(r.pass).toBe(NO_PASS)
    // Staying in the window returns the same object: nothing changed.
    const open = nextPass(NO_PASS, true, false, 0).pass
    expect(nextPass(open, true, false, 1).pass).toBe(open)
  })
})

// ---------------------------------------------------------------------------
// Integration: carrierLanding.test.ts's approach, flown through `advance` so
// the mission's own pass tracker sees it.

const LEVEL = finestFetchedLevelFor(INTERIM_ASSET_QUALITY_TIER)
const header = loadTerrainHeader()
const terrain = createTerrainField(header, LEVEL, loadTerrainLevel(LEVEL, header))

const TRAP = { id: 'trap', label: 'Trap', priority: 'primary', kind: 'land', at: 'cv-1' }
const CLEAN = { id: 'clean', label: 'No wave-offs', priority: 'secondary', kind: 'approaches', at: 'cv-1' }

/** deck-quals' ships, weather and player, with a trap and a no-wave-offs objective. */
function deckQualsMission(): World<undefined> {
  const raw = { ...loadScenario('deck-quals'), objectives: [TRAP, CLEAN] }
  return worldFromScenario(bundleForScenario(parseScenario(raw)), terrain)
}

type ApproachOptions = {
  /** Hook position from 4 km out; default true. */
  readonly hookDown?: boolean
  /** Raise the hook once the wheels are this far above the deck or lower
   *  (a pilot who has not armed his hook for the wires). */
  readonly hookUpBelowM?: number
  /** Go around inside this range of the aim point. */
  readonly goAroundAtM?: number
  /** On the first touch of the deck, full power and neutral pitch (a bolter). */
  readonly boltOnTouch?: boolean
  readonly seconds: number
}

/** The brief's go-around, `{ throttle: 1, pitch: 0.5, gearDown: false }`,
 *  with the pull released after GO_AROUND_PULL_S. Held, it goes vertical,
 *  stalls at 311 m and tail-slides into the sea 28.5 s after the switch
 *  (`.superpowers/m3/goaround.ts`, 2026-09-26); released after 2 s it
 *  climbs away at 18 m/s. */
const GO_AROUND: Controls = { pitch: 0.5, roll: 0, yaw: 0, throttle: 1, gearDown: false }
const GO_AROUND_PULL_S = 2

/**
 * carrierLanding.test.ts's approach: 4 km astern on the deck's heading, a
 * 3.5 degree slope to the trap zone's near edge, at vref plus the ship's
 * speed, flown by `approachControls` against the moving deck and the wind.
 * Runs `seconds`, stopping early only on a crash (which fails the test).
 */
function approach(w0: World<undefined>, o: ApproachOptions): { world: World<undefined>; rangeAtSwitch: number | null } {
  const f6f = playerAircraft(w0).spec
  const deck0 = deckOf(w0.ships.find((s) => s.id === 'cv-1')!)!
  const aimLocalZ = -deck0.lengthM / 2 + deck0.trapFromSternM
  const APPROACH_M = 4000
  const startLocal = deckWorld(deck0, 0, aimLocalZ - APPROACH_M)
  const vref = VREF_STALL_MULTIPLE * f6f.reference.stallSpeedFlapMps
  const along = v3(Math.sin(deck0.headingRad), 0, -Math.cos(deck0.headingRad))
  let world = withAircraftState(w0, w0.player, createState({
    position: v3(startLocal.x, deck0.center.y + f6f.gear.heightM + APPROACH_M * Math.tan((3.5 * Math.PI) / 180), startLocal.z),
    velocity: v3(along.x * (vref + 7.717), 0, along.z * (vref + 7.717)),
    attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - deck0.headingRad),
    gearFraction: 1,
    flapFraction: 1,
  }))
  world = { ...world, aircraft: world.aircraft.map((a) => (a.id === world.player ? { ...a, parked: false } : a)) }
  let goingAround = false
  let bolting = false
  let hookUp = o.hookDown === false
  let rangeAtSwitch: number | null = null
  let switchTick = 0
  for (let i = 0; i < ticksFor(o.seconds); i++) {
    const before = playerAircraft(world).state
    const deck = deckOf(world.ships.find((s) => s.id === 'cv-1')!)!
    const aim = deckWorld(deck, 0, aimLocalZ)
    const range = Math.hypot(before.position.x - aim.x, before.position.z - aim.z)
    const wheelsM = before.position.y - f6f.gear.heightM - deck.center.y
    if (o.goAroundAtM !== undefined && !goingAround && range <= o.goAroundAtM) { goingAround = true; rangeAtSwitch = range; switchTick = before.tick }
    if (o.hookUpBelowM !== undefined && !hookUp && wheelsM <= o.hookUpBelowM) { hookUp = true; rangeAtSwitch = range }
    if (o.boltOnTouch === true && !bolting && wheelsM <= 0.05) bolting = true
    const flown = approachControls(f6f, before, {
      aimX: aim.x, aimZ: aim.z, runwayHeadingRad: deck.headingRad,
      touchdownElevationM: deck.center.y, surfaceVelocity: deck.velocity,
      windVelocity: world.wind!, hookDown: !hookUp,
    })
    const pull = (before.tick - switchTick) * DT < GO_AROUND_PULL_S
    const controls: Controls = goingAround
      ? { ...GO_AROUND, pitch: pull ? GO_AROUND.pitch : 0 }
      : bolting ? { ...flown, throttle: 1, pitch: 0, hookDown: false } : flown
    world = advance(withControls(world, world.player, controls), DT).world
    expect(playerAircraft(world).impact, `crashed at tick ${world.tick}`).toBeNull()
  }
  return { world, rangeAtSwitch }
}

const passes = (w: World<undefined>) => w.mission!.log.filter((e) => e.kind === 'pass')
const texts = (w: World<undefined>) => radioMessages(w.mission!).map((e) => e.text)

describe('passes through advance (M3-R4)', () => {
  it('the autopilot trap: one trapped pass, none missed, No wave-offs not failed', () => {
    // 150 s: the approach traps at ~117 s (Step 1 probe: report at tick 7033),
    // and 30 s more is past PASS_RESOLVE_S, so a stray miss would show.
    const { world } = approach(deckQualsMission(), { seconds: 150 })
    expect(lastLanding(world.mission!)?.at?.id).toBe('cv-1')
    expect(passes(world).map((e) => e.kind === 'pass' && e.result)).toEqual(['trapped'])
    expect(progressOf(world, 'clean')).toMatchObject({ status: 'active', count: 0 })
    expect(texts(world)).not.toContain(WAVE_OFF_MESSAGE)
    const i = world.mission!.objectives.findIndex((o) => o.id === 'clean')
    expect(finalStatus(world.mission!.objectives[i]!, world.mission!.progress[i]!)).toBe('complete')
  })

  it('a go-around at 400 m: one missed pass, the wave-off call, No wave-offs failed', () => {
    const { world, rangeAtSwitch } = approach(deckQualsMission(), { goAroundAtM: 400, seconds: 150 })
    expect(rangeAtSwitch).not.toBeNull()
    expect(lastLanding(world.mission!)).toBeUndefined()
    expect(passes(world).map((e) => e.kind === 'pass' && e.result)).toEqual(['missed'])
    expect(progressOf(world, 'clean')).toMatchObject({ status: 'failed', count: 1 })
    expect(texts(world)).toContain(WAVE_OFF_MESSAGE)
    expect(texts(world)).toContain('No wave-offs: failed')
    // The wave-off is called before the objective's failure, on the same tick.
    const log = world.mission!.log
    const miss = log.find((e) => e.kind === 'pass')!
    expect(log.filter((e) => e.tick === miss.tick && e.kind === 'message').map((e) => e.kind === 'message' && e.text))
      .toEqual(['No wave-offs: failed', WAVE_OFF_MESSAGE])
  })

  it('a bolter (Review Focus 2): hook raised on short final, the wheels touch, full power off the bow -> missed, no landing', () => {
    // The brief's "hookDown: false all the way" never opens a pass at all
    // (the hook-up test below): paddlesCue's gate needs the hook down. A
    // bolter here is a pass flown hook-down that meets the deck hook-up.
    // Measured 2026-09-26: the wheels touch 90 m from the stern, and it is
    // off the bow and climbing by 215 m.
    const { world } = approach(deckQualsMission(), { hookUpBelowM: 3, boltOnTouch: true, seconds: 150 })
    expect(lastLanding(world.mission!)).toBeUndefined()
    expect(passes(world).map((e) => e.kind === 'pass' && e.result)).toEqual(['missed'])
    expect(progressOf(world, 'clean')).toMatchObject({ status: 'failed', count: 1 })
    expect(texts(world)).toContain(WAVE_OFF_MESSAGE)
  })

  it('hook raised on short final but no power on the deck: it stops (brakes and all), so it is a landing and the pass traps', () => {
    // Measured 2026-09-26: the autopilot's roll-out stops it 161 m from the
    // stern, 31 m short of the bow, hook up. The landing tracker calls that a
    // landing at cv-1; a deck landing is not a wave-off.
    const { world } = approach(deckQualsMission(), { hookUpBelowM: 3, seconds: 150 })
    expect(lastLanding(world.mission!)?.at?.id).toBe('cv-1')
    expect(passes(world).map((e) => e.kind === 'pass' && e.result)).toEqual(['trapped'])
    expect(progressOf(world, 'clean')).toMatchObject({ status: 'active', count: 0 })
  })

  it('hook up the whole way: the window never opens, so no pass is flown at all', () => {
    const { world } = approach(deckQualsMission(), { hookDown: false, seconds: 150 })
    expect(passes(world)).toEqual([])
    expect(progressOf(world, 'clean')).toMatchObject({ status: 'active', count: 0 })
  })

  it('parked on the stern spot with gear and hook down, then a deck run: no pass (the window is an approach, not the deck)', () => {
    let w = deckQualsMission()
    const p = playerAircraft(w)
    const deck = deckOf(w.ships.find((s) => s.id === 'cv-1')!)!
    // The start spot (and the respot spot) is astern of the zone center, so a
    // roll from it with the hook down is inside paddlesCue's gate.
    expect(deckLocal(deck, p.state.position.x, p.state.position.z).z).toBeCloseTo(-110, 0)
    w = withControls(w, w.player, { pitch: 0, roll: 0, yaw: 0, throttle: 0, gearDown: true, hookDown: true, brake: 1 })
    w = steps(w, 120)
    w = withControls(w, w.player, { pitch: 0, roll: 0, yaw: 0, throttle: 1, gearDown: true, hookDown: false })
    w = steps(w, ticksFor(PASS_RESOLVE_S) + 120)
    expect(w.mission!.pass).toBe(NO_PASS)
    expect(passes(w)).toEqual([])
    expect(progressOf(w, 'clean')).toMatchObject({ status: 'active', count: 0 })
  })
})

describe('a pass needs closure on the deck (ruling F-I2)', () => {
  it('flying AWAY astern through the cone, gear and hook down: no pass opens and no miss is recorded', () => {
    // A tight downwind extended astern: 1,500 m astern of the trap zone on
    // the wake, 150 m up, flying the reciprocal of the deck's heading at
    // 60 m/s, staged tick by tick (position advanced kinematically) for 60 s.
    // Before the fix this opened a pass on the first tick, left the 2,500 m
    // range at about 15 s (the ship steams the other way), and scored a miss
    // 15 s after that, at tick 1787 (measured 2026-09-27).
    let w = deckQualsMission()
    const deck0 = deckOf(w.ships.find((s) => s.id === 'cv-1')!)!
    const zoneCenterZ = -deck0.lengthM / 2 + (deck0.trapFromSternM + deck0.trapToSternM) / 2
    const start = deckWorld(deck0, 0, zoneCenterZ - 1500)
    const away = v3(-Math.sin(deck0.headingRad) * 60, 0, Math.cos(deck0.headingRad) * 60)
    const s0 = createState({
      position: v3(start.x, deck0.center.y + 150, start.z),
      velocity: away,
      attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - (deck0.headingRad + Math.PI)),
      gearFraction: 1,
      flapFraction: 1,
    })
    w = { ...w, aircraft: w.aircraft.map((a) => (a.id === w.player ? { ...a, parked: false } : a)) }
    w = withControls(w, w.player, { pitch: 0, roll: 0, yaw: 0, throttle: 0.5, gearDown: true, flapDown: true, hookDown: true })
    const t0 = w.tick
    let everOpen = false
    for (let i = 0; i < ticksFor(60); i++) {
      const t = (w.tick - t0) * DT
      w = withAircraftState(w, w.player, { ...s0, position: v3(s0.position.x + away.x * t, s0.position.y, s0.position.z + away.z * t), tick: w.tick })
      w = advance(w, DT).world
      if (w.mission!.pass.open) everOpen = true
    }
    expect(everOpen).toBe(false)
    expect(w.mission!.pass).toBe(NO_PASS)
    expect(passes(w)).toEqual([])
    expect(progressOf(w, 'clean')).toMatchObject({ status: 'active', count: 0 })
    expect(texts(w)).not.toContain(WAVE_OFF_MESSAGE)
  })
})

describe('approaches content rules (M3-R11)', () => {
  it('at a ship without Paddles (maru-1) is a load error', () => {
    const at = { ...CLEAN, at: 'maru-1' }
    expect(() => missionWorld({ objectives: [at] })).toThrow('scenario "mission-fixture": objective "clean" names "maru-1", which has no Paddles')
  })

  it('at a name that is no ship is a load error', () => {
    expect(() => missionWorld({ objectives: [{ ...CLEAN, at: 'tacloban' }] })).toThrow(/names "tacloban", which has no Paddles/)
  })

  it('two approaches objectives are a parse error', () => {
    expect(() => parseScenario(scenario({ objectives: [CLEAN, { ...CLEAN, id: 'clean-2' }] })))
      .toThrow(/a mission may declare one approaches objective \(M3-R11\)/)
  })

  it('maxMissed must be a non-negative integer', () => {
    expect(() => parseScenario(scenario({ objectives: [{ ...CLEAN, maxMissed: -1 }] }))).toThrow()
    expect(() => parseScenario(scenario({ objectives: [{ ...CLEAN, maxMissed: 1.5 }] }))).toThrow()
    expect(() => missionWorld({ objectives: [{ ...CLEAN, maxMissed: 2 }] })).not.toThrow()
  })

  it('a trigger may fire on its failure', () => {
    const when = { id: 'scold', when: { failed: 'clean' }, then: [{ message: 'Again.' }] }
    expect(() => parseScenario(scenario({ objectives: [CLEAN], triggers: [when] }))).not.toThrow()
  })

  it('a new mission starts with no pass', () => {
    expect(missionWorld({ objectives: [CLEAN] }).mission!.pass).toBe(NO_PASS)
  })
})
