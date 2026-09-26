import { describe, expect, it } from 'vitest'
import { airframeEnvelope, relativeEnvelope } from '../../../src/sim/ai/envelope.js'
import { ATTACK_RUN_HEIGHT_M, ZOOM_END_VY_MPS, flyAttackRun } from '../../../src/sim/ai/maneuverFlight.js'
import { VETERAN_SKILL, type ManeuverLatch, type ManeuverName } from '../../../src/sim/ai/pilot.js'
import { createWorldOf, type World } from '../../../src/sim/loop.js'
import { v3, ZERO, type Vec3 } from '../../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { level, pilotFor, runCanned, straight, withRepertoire } from './maneuverWorlds.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const zero = loadAircraftSpec('a6m2-zero')
const self = (w: World<undefined>) => w.aircraft.find((a) => a.id === 'p')!

describe('attack run (7c spec §3.5)', () => {
  // Measured 2026-09-26 in this world (the Zero flies straight at 0.7
  // throttle, slowly descending). The pairing is boom-and-zoom (turn
  // advantage 0.627, dive advantage 1.296). Run 1: selected at tick 1 at
  // 4000 m; first shot in the dive at tick 564 (9.4 s); phase 0 ends level
  // with the target at tick 809, 198 m out; lowest point 2966.8 m (tick 853),
  // so 1033.2 m lost. The zoom, a pull up and over toward the target now
  // behind, is still climbing at 129 m/s when the 20 s latch cap closes it at
  // tick 1201 (3513 m, 0.529 of the loss). The climb carries on under lead
  // pursuit to 3864.2 m (tick 1442), and run 2 opens at tick 1443 once the
  // target is ahead again: run 1 regains 0.869. Over the 40 s: peak 6.58 g
  // against a 6.75 g budget, no safety override.
  //
  // Start geometry: 600 m behind, not the plan's 1,500 m. From 1,500 m the
  // pass never comes inside the 20 s latch cap: closure only reaches 74 m/s
  // (181 m/s against 110), the range is still 599 m at the cap, and the
  // first shot comes after it under lead pursuit. A faster dive cannot fix
  // that: the overspeed throttle cut is at 194 m/s and the range needs about
  // 82 m/s of closure on average. At 1,000 m above, run 1 regains 0.835 from
  // 500 m behind, 0.869 from 600 m and 0.822 from 700 m.
  it('a veteran Hellcat 1,000 m above a Zero (boom-and-zoom): selected, fires in the dive, zooms back at least 60% of the height lost', () => {
    const skill = withRepertoire(VETERAN_SKILL, ['lead-pursuit', 'attack-run', 'defensive-break', 'extend'] as ManeuverName[])
    const world = createWorldOf({
      aircraft: [
        level('p', f6f, v3(-600, 4000, 0), v3(130, 0, 0), pilotFor('t', skill)),
        level('t', zero, v3(0, 3000, 0), v3(110, 0, 0)),
      ],
      player: 't',
    })
    const [p0, t0] = [world.aircraft.find((a) => a.id === 'p')!, world.aircraft.find((a) => a.id === 't')!]
    expect(relativeEnvelope(airframeEnvelope(p0.spec, p0.state), airframeEnvelope(t0.spec, t0.state)).pairing).toBe('boom-and-zoom')

    // One entry per attack run, from its selection to the next run's entry
    // (a new latch) or the end of the window.
    type Run = { enteredAtS: number; entryY: number; lowest: number; highestAfterLowest: number; firedInDescent: boolean }
    const runs: Run[] = []
    let lastShots = 0
    runCanned(world, { t: straight }, 40, (w) => {
      const s = self(w)
      const d = s.pilot!.decision
      const y = s.state.position.y
      const shots = w.combat.aircraft['p']!.shots
      if (d.named === 'attack-run' && d.latch !== null && d.latch.enteredAtS !== runs.at(-1)?.enteredAtS) {
        runs.push({ enteredAtS: d.latch.enteredAtS, entryY: y, lowest: y, highestAfterLowest: -Infinity, firedInDescent: false })
      }
      const run = runs.at(-1)
      if (run !== undefined) {
        if (y < run.lowest) { run.lowest = y; run.highestAfterLowest = -Infinity } else run.highestAfterLowest = Math.max(run.highestAfterLowest, y)
        if (d.named === 'attack-run' && d.latch?.phase === 0 && s.state.velocity.y < 0 && shots > lastShots) run.firedInDescent = true
      }
      lastShots = shots
    })
    const first = runs[0]!
    expect(runs.length).toBeGreaterThanOrEqual(1)
    expect(first.firedInDescent).toBe(true)
    const lost = first.entryY - first.lowest
    expect(lost).toBeGreaterThan(0)
    expect(first.highestAfterLowest - first.lowest).toBeGreaterThanOrEqual(0.6 * lost)
  })
})

describe('flyAttackRun phase logic (fix round 1)', () => {
  const zoomLatch = (entryAltitudeM: number, phase: number, lowestAltitudeM: number): ManeuverLatch =>
    ({ name: 'attack-run', phase, enteredAtS: 0, entryHeadingRad: 0, entryAltitudeM, loopCenter: ZERO, reversals: 0, lastSide: 0, lowestAltitudeM })
  const at = (id: string, spec: typeof f6f, position: Vec3, velocity: Vec3) => level(id, spec, position, velocity)
  // The target 1,000 m below the entry altitude; the pilot zooming 400 m
  // above it, climbing at 60 m/s.
  const target = at('t', zero, v3(0, 3000, 0), v3(110, 0, 0))

  it('the zoom holds past ATTACK_RUN_HEIGHT_M above the target until the latched entry altitude is regained', () => {
    const climbing = at('p', f6f, v3(-200, 3000 + ATTACK_RUN_HEIGHT_M + 100, 0), v3(120, 60, 0))
    expect(flyAttackRun(climbing, target, zoomLatch(4000, 2, 2950)).latch).not.toBeNull()
    const regained = at('p', f6f, v3(-200, 4000, 0), v3(120, 60, 0))
    expect(flyAttackRun(regained, target, zoomLatch(4000, 2, 2950)).latch).toBeNull()
  })

  it('the zoom ends once the climb is spent, below ZOOM_END_VY_MPS', () => {
    const spent = at('p', f6f, v3(-200, 3500, 0), v3(120, ZOOM_END_VY_MPS - 0.1, 0))
    expect(flyAttackRun(spent, target, zoomLatch(4000, 2, 2950)).latch).toBeNull()
  })

  it('returns the same latch object while nothing in it changes', () => {
    const l = zoomLatch(4000, 2, 2950)
    expect(flyAttackRun(at('p', f6f, v3(-200, 3500, 0), v3(120, 60, 0)), target, l).latch).toBe(l)
    const dive = zoomLatch(4000, 0, 3000)
    expect(flyAttackRun(at('p', f6f, v3(-900, 3500, 0), v3(130, -10, 0)), target, dive).latch).toBe(dive)
  })
})
