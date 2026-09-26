import { describe, expect, it } from 'vitest'
import { airframeEnvelope } from '../../../src/sim/ai/envelope.js'
import { IMMELMANN_MIN_PATH_RAD } from '../../../src/sim/ai/maneuvers.js'
import { SAFE_SEPARATION_M, VETERAN_SKILL, type ManeuverName } from '../../../src/sim/ai/pilot.js'
import { pilotTick } from '../../../src/sim/ai/pilotTick.js'
import type { AircraftSpec } from '../../../src/sim/flight/schema.js'
import { createWorldOf, type World } from '../../../src/sim/loop.js'
import { length, sub, v3 } from '../../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { headingChangeRad, level, pilotFor, runCanned, straight, withRepertoire } from './maneuverWorlds.js'

const self = (w: World<undefined>) => w.aircraft.find((a) => a.id === 'p')!
const threat = (w: World<undefined>) => w.aircraft.find((a) => a.id === 't')!
const SET = ['lead-pursuit', 'defensive-break', 'extend', 'immelmann'] as ManeuverName[]

/** The pilot is 600 m below and 1,300 m from a threat flying away: an energy
 *  deficit, so Extend (a veteran at +4,800 J/kg of speed and -5,884 of
 *  height), with the threat's nose away (no Break), and beyond
 *  SAFE_SEPARATION_M at or above corner speed, level, with the threat
 *  behind, which is the rejoin the Immelmann replaces. */
function world(spec: AircraftSpec, speed: number, skill = withRepertoire(VETERAN_SKILL, SET)) {
  return createWorldOf({
    aircraft: [
      level('p', spec, v3(0, 2400, 0), v3(speed, 0, 0), pilotFor('t', skill)),
      level('t', loadAircraftSpec('f6f-hellcat'), v3(-1300, 3000, 0), v3(-100, 0, 0)),
    ],
    player: 't',
  })
}

const f6f = loadAircraftSpec('f6f-hellcat')
const zero = loadAircraftSpec('a6m2-zero')
/** The Zero's airframe without its content exclusion (Task 14): what any
 *  airframe with the Zero's envelope and no `ai` block flies. The maneuver's
 *  own flight is still proven on it; the shipped Zero never enters it. */
const zeroUnexcluded: AircraftSpec = { ...zero }
delete zeroUnexcluded.ai

describe('Immelmann (7c spec §3.5)', () => {
  // Prototype, 2026-09-25 (lift vector toward a loop center fixed at entry):
  // F6F from 140 m/s: 174°, +552 m, exit 76 m/s. Zero from 110 m/s: 152°,
  // +429 m, exit 62 m/s.
  // Measured 2026-09-26 with the committed flight (phase 0 ends on the
  // heading reversed AND the climb under IMMELMANN_TOP_MAX_CLIMB), on this
  // one selection, entry to the tick the latch closes:
  //   F6F from 140 m/s: selected at the first rescore; 174.6°, +466 m, exit
  //     88.0 m/s (1.1 x stall = 48.2) at 9.93 s; peak 6.42 g; stall margin
  //     (load factor / (V / stall speed)^2) peaks at 0.892.
  //   Zero from 110 m/s: selected at the first rescore; 171.5°, +386 m, exit
  //     75.4 m/s (1.1 x stall = 38.4) at 10.45 s; peak 6.05 g; stall margin
  //     peaks at 0.686.
  // No §3.2 stall guard exists, so the stall margin is asserted here.
  it.each([['f6f-hellcat', f6f, 140], ['a6m2-zero without its content exclusion', zeroUnexcluded, 110]] as const)('%s from %d m/s: selected, reverses 150°+, gains height, exits at 1.1 x stall or faster', (_label, spec, speed) => {
    const m = {
      entry: null as null | { heading: number; y: number },
      exit: null as null | { heading: number; y: number; speed: number },
      stallMargin: 0, peakG: 0,
    }
    runCanned(world(spec, speed), { t: straight }, 25, (w) => {
      const s = self(w)
      const d = s.pilot!.decision
      if (d.named === 'immelmann' && d.latch !== null && m.entry === null) m.entry = { heading: d.latch.entryHeadingRad, y: d.latch.entryAltitudeM }
      if (m.entry !== null && m.exit === null && d.named === 'immelmann') {
        const g = w.combat.aircraft['p']!.stress.loadFactorG
        m.peakG = Math.max(m.peakG, g)
        m.stallMargin = Math.max(m.stallMargin, g / (length(s.state.velocity) / spec.reference.stallSpeedMps) ** 2)
      }
      if (m.entry !== null && m.exit === null && d.named !== 'immelmann') {
        m.exit = { heading: Math.atan2(s.state.velocity.z, s.state.velocity.x), y: s.state.position.y, speed: length(s.state.velocity) }
      }
    })
    expect(m.entry, 'Immelmann never selected').not.toBeNull()
    expect(m.exit, 'Immelmann never ended').not.toBeNull()
    expect(headingChangeRad(m.entry!.heading, m.exit!.heading)).toBeGreaterThanOrEqual(150 * Math.PI / 180)
    expect(m.exit!.y).toBeGreaterThan(m.entry!.y)
    expect(m.exit!.speed).toBeGreaterThanOrEqual(1.1 * spec.reference.stallSpeedMps)
    expect(m.peakG).toBeLessThanOrEqual(spec.limits.gLimit)
    expect(m.stallMargin).toBeLessThan(1)
  })

  // Measured 2026-09-26: after its Immelmann the Zero stays on Extend, now
  // pointing at the threat, and is back above its 92.26 m/s corner speed,
  // level, beyond SAFE_SEPARATION_M at 22.5 s. Without the threat-behind
  // term a second half loop started there and turned it away from the
  // threat. The count below is the non-vacuity check: those rescores exist.
  it('one Immelmann per rejoin: with the threat ahead it is not flown again, though every other condition holds', () => {
    const m = { selections: 0, prev: '' as string, exited: false, otherwiseQualifying: 0 }
    runCanned(world(zeroUnexcluded, 110), { t: straight }, 30, (w) => {
      const s = self(w)
      const d = s.pilot!.decision
      if (d.named === 'immelmann' && m.prev !== 'immelmann') m.selections++
      if (m.prev === 'immelmann' && d.named !== 'immelmann') m.exited = true
      m.prev = d.named
      const v = s.state.velocity
      const speed = length(v)
      if (m.exited && d.maneuver === 'extend' && length(sub(threat(w).state.position, s.state.position)) > SAFE_SEPARATION_M &&
          speed >= airframeEnvelope(zero, s.state).cornerSpeedMps && Math.asin(v.y / speed) >= IMMELMANN_MIN_PATH_RAD) m.otherwiseQualifying++
    })
    expect(m.selections).toBe(1)
    expect(m.otherwiseQualifying).toBeGreaterThan(0)
  })

  // Mark's ruling, 2026-09-26: "suppress the immelman for the zero
  // specifically but leave it available to other enemy plane AIs ... make it
  // model-specific". The Zero's content (a6m2-zero.json, `ai.excludedManeuvers`)
  // carries it, so no AI code names an airframe (spec §7). The unexcluded
  // Zero above selects it at the first rescore of this very world.
  it('the shipped Zero, flown as a full veteran in the same world, never selects the Immelmann', () => {
    const counts = { shipped: 0, unexcluded: 0 }
    runCanned(world(zero, 110, VETERAN_SKILL), { t: straight }, 25, (w) => { if (self(w).pilot!.decision.named === 'immelmann') counts.shipped++ })
    runCanned(world(zeroUnexcluded, 110, VETERAN_SKILL), { t: straight }, 25, (w) => { if (self(w).pilot!.decision.named === 'immelmann') counts.unexcluded++ })
    expect(counts.unexcluded).toBeGreaterThan(0)
    expect(counts.shipped).toBe(0)
  })

  it('pilotTick reads the exclusion from the pilot\'s own airframe: one rescore, every other condition holding', () => {
    const tickOnce = (spec: AircraftSpec) => {
      const w = world(spec, 110, VETERAN_SKILL)
      const p = self(w)
      return pilotTick(p, w.aircraft, { nowS: 0, terrain: null, decks: [], wind: null, combat: w.combat }).pilot!.decision.named
    }
    expect(tickOnce(zeroUnexcluded)).toBe('immelmann')
    expect(tickOnce(zero)).toBe('extend')
  })
})
