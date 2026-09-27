import { describe, expect, it } from 'vitest'
import { debriefModel, destructionModel, killsSince, landingModel, type DebriefModel } from '../../src/render/debrief.js'
import {
  DISCHARGE_HEADLINE, FRIENDLY_FIRE_RADIO, friendlyFireOf, friendlyFireRadio, friendlyTargetLabel, withDischarge,
} from '../../src/render/discharge.js'
import { advance, playerAircraft, type Impact, type Stepper, type World } from '../../src/sim/loop.js'
import type { LandingReport } from '../../src/sim/landing.js'
import { DT } from '../../src/sim/flight/model.js'
import { add, v3, type Vec3 } from '../../src/sim/math/vec3.js'
import type { Projectile } from '../../src/sim/weapons/combat.js'
import { zeroKillsByType } from '../../src/sim/weapons/targetType.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { loadScenarioBundle } from '../../tools/content/load.js'
import { initialFrameStateFor, nextFrameState } from '../../src/render/frame.js'

/**
 * Dishonorable discharge at every flight end that produces a debrief
 * (friendly-fire spec §5): a landing, an impact (killed or ditched) and a
 * destruction. Each is built by the SAME builder main.ts calls, wrapped in
 * the SAME `withDischarge`, from a world whose combat came out of production
 * `advance`.
 */
const still: Stepper = (_spec, state, _controls, ctx) => ({ ...state, tick: ctx.tick })

const round = (owner: string, at: Vec3): Projectile => ({
  owner, id: 1, position: at, previous: at, velocity: v3(0, -880, 0), lifeS: 3, tracer: false, kind: 'round', ageS: 0,
})
const bomb = (owner: string, at: Vec3): Projectile => ({
  owner, id: 1, position: at, previous: at, velocity: v3(0, -50, 0), lifeS: 60, tracer: false, kind: 'bomb', ageS: 1,
})
const fly = (w: World<undefined>, projectiles: Projectile[]): World<undefined> => {
  let out = w
  for (const p of projectiles) out = advance({ ...out, combat: { ...out.combat, projectiles: [p] } }, DT, still).world
  return out
}
const above = (w: World<undefined>, ship: string): Vec3 => {
  const s = w.ships.find((x) => x.id === ship)!
  return add(s.state.position, v3(0, s.spec.deckHeightM + 8, 0))
}
const at = (w: World<undefined>, structure: string): Vec3 => w.structures.find((s) => s.id === structure)!.position

const REPORT: LandingReport = { touchdownSinkMps: 1.2, touchdownSpeedMps: 38, rollOutM: 410, tick: 900, at: { kind: 'airfield', id: 'tacloban', name: 'Tacloban' } }
const IMPACT: Impact = { tick: 900, position: v3(0, 0, 0), verticalSpeedMps: -20, groundHeightM: 0, surface: 'water', kind: 'destroyed' }
const DITCH: Impact = { ...IMPACT, verticalSpeedMps: -1, kind: 'ditched' }

/** The three builders main.ts calls, each from this world. */
function allThree(w: World<undefined>): Record<string, DebriefModel> {
  const kills = killsSince(w.combat.aircraft[w.player]!.killsByType, zeroKillsByType())
  const state = playerAircraft(w).state
  const names = Object.fromEntries(w.ships.map((s) => [s.id, s.spec.name]))
  return {
    landed: withDischarge(landingModel(REPORT, kills, names), w),
    killed: withDischarge(debriefModel(IMPACT, state, kills), w),
    ditched: withDischarge(debriefModel(DITCH, state, kills), w),
    destroyed: withDischarge(destructionModel(state, 'bandit', kills), w),
  }
}

describe('withDischarge (spec §5)', () => {
  // strike-range: bomb the enemy Dulag hangar (a real kill, 150 points), then
  // put one bomb on Allied Tacloban's tower.
  const strike = worldFromScenario(loadScenarioBundle('strike-range'), null)
  const enemyOnly = fly(strike, [bomb('f6f-1', at(strike, 'dulag-hangar-2'))])
  const discharged = fly(enemyOnly, [bomb('f6f-1', at(strike, 'tacloban-tower'))])

  it('the enemy-only flight is untouched: the same model object, scored as before', () => {
    expect(friendlyFireOf(enemyOnly)).toBeNull()
    expect(enemyOnly.combat.aircraft['f6f-1']!.killsByType.building).toBe(1)
    const kills = enemyOnly.combat.aircraft['f6f-1']!.killsByType
    for (const [what, model] of Object.entries({
      landed: landingModel(REPORT, kills), killed: debriefModel(IMPACT, playerAircraft(enemyOnly).state, kills),
      destroyed: destructionModel(playerAircraft(enemyOnly).state, null, kills),
    })) {
      expect(withDischarge(model, enemyOnly), what).toBe(model)
    }
    expect(landingModel(REPORT, kills).score.total).toBe(150)
    expect(allThree(enemyOnly).landed!.headline).toBe('LANDED')
    expect(allThree(enemyOnly).landed!.continueLabel).toBe('Continue')
  })

  it('discharges at landing, at death, at ditching and at destruction: zero score, no Continue, the physical outcome kept', () => {
    expect(friendlyFireOf(discharged)).toEqual({ tick: 2, kind: 'structure', target: 'tacloban-tower' })
    const models = allThree(discharged)
    const outcome = { landed: 'landed', killed: 'killed', ditched: 'ditched', destroyed: 'killed' } as const
    for (const [what, m] of Object.entries(models)) {
      expect(m.headline, what).toBe(DISCHARGE_HEADLINE)
      expect(m.score.total, what).toBe(0)
      expect(m.score.multiplier, what).toBe(0)
      expect(m.score.rows.every((r) => r.score === 0), what).toBe(true)
      // The Dulag hangar still shows as destroyed -- at 0 points.
      expect(m.score.rows.find((r) => r.target === 'Building')!.destroyed, what).toBe(1)
      expect(m.continueLabel, what).toBeUndefined()
      expect('continueLabel' in m, what).toBe(false)
      expect(m.outcome, what).toBe(outcome[what as keyof typeof outcome])
      expect(m.discharge, what).toEqual({ target: 'Control tower, Tacloban' })
      expect(m.figures[0], what).toEqual({ label: 'Friendly fire', value: 'Control tower, Tacloban' })
      expect(m.detail, what).toContain('You fired on your own side (Control tower, Tacloban)')
    }
  })

  it('discharges for a round into an allied ship, named by class and hull', () => {
    const ff = worldFromScenario(loadScenarioBundle('free-flight'), null)
    const hit = fly(ff, [round('f6f-1', above(ff, 'dd-1'))])
    expect(friendlyFireOf(hit)).toEqual({ tick: 1, kind: 'ship', target: 'dd-1' })
    expect(allThree(hit).killed!.headline).toBe(DISCHARGE_HEADLINE)
    expect(friendlyTargetLabel(hit, friendlyFireOf(hit)!)).toBe('Fletcher-class destroyer dd-1')
  })

  it('an AI hitting the player\'s side never discharges the player (ruling FF-9)', () => {
    const ff = worldFromScenario(loadScenarioBundle('free-flight'), null)
    const hit = fly(ff, [round('f6f-2', above(ff, 'dd-1'))]) // f6f-2 is axis by 7e's default
    expect(hit.combat.ships['dd-1']!.hp).toBeLessThan(ff.combat.ships['dd-1']!.hp)
    expect(friendlyFireOf(hit)).toBeNull()
  })

  it('friendlyFireRadio is the first hit, keyed by its tick', () => {
    expect(friendlyFireRadio(enemyOnly)).toBeNull()
    expect(friendlyFireRadio(discharged)).toEqual({ tick: 2, text: FRIENDLY_FIRE_RADIO })
  })
})

describe('friendly-fire-range (Task 6): Space hits the allied Hellcat ahead through production nextFrameState', () => {
  it('within 2 s the allied wingman takes a friendly hit, and the axis Hellcat is untouched', () => {
    const w0 = worldFromScenario(loadScenarioBundle('friendly-fire-range'), null)
    let f = initialFrameStateFor(w0)
    const space = new Set(['Space'])
    let ticks = 0
    for (; ticks < 120 && friendlyFireOf(f.world) === null; ticks++) f = nextFrameState(f, DT, space)
    const ff = friendlyFireOf(f.world)
    expect(ff, `no friendly fire after ${ticks} ticks`).not.toBeNull()
    expect(ff!.kind).toBe('aircraft')
    expect(ff!.target).toBe('ally-1')
    expect(f.world.combat.aircraft['ally-1']!.damage.structure).toBeLessThan(1)
    expect(f.world.combat.aircraft['bandit-1']!.damage.structure).toBe(1)
    expect(f.world.combat.aircraft['bandit-1']!.damage.attacker).toBeNull()
    expect(friendlyFireRadio(f.world)).toEqual({ tick: ff!.tick, text: FRIENDLY_FIRE_RADIO })
  })
})
