import { describe, expect, it } from 'vitest'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { createState } from '../../src/sim/flight/state.js'
import { FIRE_AT_STRUCTURE } from '../../src/sim/damage/model.js'
import { DT } from '../../src/sim/flight/model.js'
import { qIdentity } from '../../src/sim/math/quat.js'
import { v3, ZERO, type Vec3 } from '../../src/sim/math/vec3.js'
import { createCombat, type CombatState } from '../../src/sim/weapons/combat.js'
import type { CombatImpact } from '../../src/sim/weapons/impacts.js'
import type { Impact } from '../../src/sim/loop.js'
import {
  COLLAPSE_SMOKE_S, crashRecipe, impactRecipe, KILL_TRAIL_S, NO_FX_MEMORY, nextFxEvents,
  ROCKET_BURN_S, ROCKET_NOZZLE_AFT_M, SMOKE_BLACK_FROM,
  type FxMemory, type FxWorldView,
} from '../../src/render/fx/events.js'
import { readFileSync } from 'node:fs'
import type { Projectile } from '../../src/sim/weapons/combat.js'
import { modelIO } from '../../tools/models/document.js'
import { measureDocument } from '../../tools/models/measure.js'

const spec = loadAircraftSpec('f6f-hellcat')
const craft = (id: string, position: Vec3) => {
  const state = createState({ position, velocity: v3(100, 0, 0) })
  return { id, spec, state, previous: state, controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0 }, impact: null as Impact | null }
}
const base = (): { combat: CombatState; aircraft: ReturnType<typeof craft>[] } => {
  const aircraft = [craft('a', v3(0, 1000, 0)), craft('b', v3(500, 1000, 0))]
  return { aircraft, combat: createCombat(aircraft, {}, [{ id: 'maru', hullHp: 100 }], [{ id: 'hangar', hp: 50 }]) }
}
const view = (tick: number, combat: CombatState, aircraft: ReturnType<typeof craft>[], extra: Partial<FxWorldView> = {}): FxWorldView => ({
  tick, combat, aircraft,
  poses: aircraft.map((a) => ({ position: a.state.position, attitude: qIdentity() })),
  shipSmokeOrigins: new Map([['maru', v3(9000, 20, 0)]]),
  structureAnchors: new Map([['hangar', v3(-500, 12, 40)]]),
  ...extra,
})
const hit = (tick: number, over: Partial<CombatImpact> = {}): CombatImpact =>
  ({ tick, cause: 'bomb', outcome: 'detonated', surface: 'land', point: v3(tick, 0, 0), ...over })
const withImpacts = (c: CombatState, impacts: CombatImpact[]): CombatState => ({ ...c, impacts })

describe('fx events (effects design §3.2)', () => {
  it('maps every impact to its recipe; expiries to nothing (Rulings R1, R4)', () => {
    expect(impactRecipe({ cause: 'bomb', outcome: 'detonated', surface: 'water' })).toBe('bomb.water')
    expect(impactRecipe({ cause: 'bomb', outcome: 'detonated', surface: 'ship' })).toBe('bomb.land')
    expect(impactRecipe({ cause: 'rocket', outcome: 'detonated', surface: 'deck' })).toBe('rocket.land')
    expect(impactRecipe({ cause: 'round', outcome: 'detonated', surface: 'aircraft' })).toBe('round.aircraft')
    expect(impactRecipe({ cause: 'round', outcome: 'detonated', surface: 'structure' })).toBe('round.structure')
    expect(impactRecipe({ cause: 'rocket', outcome: 'expired', surface: 'air' })).toBeNull()
    expect(crashRecipe('deck')).toBe('crash.deck')
  })

  // M2: a flak burst goes off in the air, and is the one 'air' impact that is drawn.
  it('draws a flak burst once, where it went off (M2)', () => {
    expect(impactRecipe({ cause: 'flak', outcome: 'detonated', surface: 'air' })).toBe('flak.burst')
    expect(impactRecipe({ cause: 'bomb', outcome: 'expired', surface: 'air' })).toBeNull()
    const { combat, aircraft } = base()
    const c1 = withImpacts(combat, [hit(3, { cause: 'flak', surface: 'air', point: v3(7, 800, 9) })])
    const f1 = nextFxEvents(NO_FX_MEMORY, view(3, c1, aircraft))
    expect(f1.triggers).toEqual([{ recipe: 'flak.burst', position: v3(7, 800, 9), velocity: ZERO }])
    expect(nextFxEvents(f1.memory, view(4, c1, aircraft)).triggers).toEqual([])
  })

  it('emits each new impact once, and none twice across frames', () => {
    const { combat, aircraft } = base()
    const c1 = withImpacts(combat, [hit(3)])
    const f1 = nextFxEvents(NO_FX_MEMORY, view(3, c1, aircraft))
    expect(f1.triggers.map((t) => t.recipe)).toEqual(['bomb.land'])
    const f2 = nextFxEvents(f1.memory, view(4, c1, aircraft))
    expect(f2.triggers).toEqual([])
  })

  it('loses no trigger when one frame spans several ticks (MAX_STEPS_PER_FRAME)', () => {
    const { combat, aircraft } = base()
    let memory: FxMemory = nextFxEvents(NO_FX_MEMORY, view(10, withImpacts(combat, [hit(10)]), aircraft)).memory
    const five = [hit(10), hit(11), hit(12, { surface: 'water' }), hit(13, { cause: 'round' }), hit(13, { cause: 'round', surface: 'water' }), hit(15)]
    const f = nextFxEvents(memory, view(15, withImpacts(combat, five), aircraft))
    expect(f.triggers.map((t) => t.recipe)).toEqual(['bomb.land', 'bomb.water', 'round.land', 'round.water', 'bomb.land'])
    expect(f.triggers[0]!.position).toEqual(v3(11, 0, 0))
    memory = f.memory
    expect(memory.lastImpactTick).toBe(15)
  })

  it('a tick moving backwards is a new flight: old edges are forgotten, the fresh ring is read from the start', () => {
    const { combat, aircraft } = base()
    const late = nextFxEvents(NO_FX_MEMORY, view(900, withImpacts(combat, [hit(900)]), aircraft)).memory
    // Restart: the NEW world's ring holds only its own entries, at small ticks.
    const f = nextFxEvents(late, view(2, withImpacts(combat, [hit(1), hit(2)]), aircraft))
    expect(f.triggers).toHaveLength(2)
    expect(f.memory.lastTick).toBe(2)
    // And the restarted frame with an EMPTY ring triggers nothing.
    expect(nextFxEvents(late, view(1, combat, aircraft)).triggers).toEqual([])
  })

  it('fires a crash per aircraft, once, on its own surface (Ruling R5)', () => {
    const { combat, aircraft } = base()
    const impact: Impact = { tick: 40, position: v3(1, 2, 3), verticalSpeedMps: -30, groundHeightM: 0, surface: 'water', kind: 'ditched' }
    const crashed = [aircraft[0]!, { ...aircraft[1]!, impact }]
    const f1 = nextFxEvents(NO_FX_MEMORY, view(40, combat, crashed))
    expect(f1.triggers).toEqual([{ recipe: 'crash.water', position: v3(1, 2, 3), velocity: ZERO }])
    expect(nextFxEvents(f1.memory, view(41, combat, crashed)).triggers).toEqual([])
  })

  it('fires kill.air on the destroyedAt edge, then a fading trail for KILL_TRAIL_S (Ruling R6)', () => {
    const { combat, aircraft } = base()
    const rec = combat.aircraft['b']!
    const killed: CombatState = { ...combat, aircraft: { ...combat.aircraft, b: { ...rec, damage: { ...rec.damage, destroyedAt: 100 } } } }
    const f1 = nextFxEvents(NO_FX_MEMORY, view(100, killed, aircraft))
    expect(f1.triggers).toEqual([{ recipe: 'kill.air', position: v3(500, 1000, 0), velocity: ZERO }])
    expect(f1.sustained.find((s) => s.key === 'kill:b')).toMatchObject({ recipe: 'kill.air', intensity: 1 })
    const half = 100 + Math.round(KILL_TRAIL_S / 2 / DT)
    expect(nextFxEvents(f1.memory, view(half, killed, aircraft)).sustained.find((s) => s.key === 'kill:b')!.intensity).toBeCloseTo(0.5, 2)
    const over = 100 + Math.round(KILL_TRAIL_S / DT) + 1
    expect(nextFxEvents(f1.memory, view(over, killed, aircraft)).sustained.some((s) => s.key === 'kill:b')).toBe(false)
    // A destroyed airframe's engine no longer smokes on its own key.
    expect(f1.sustained.some((s) => s.key === 'engine:b')).toBe(false)
  })

  it('engine smoke follows engine health, from the nose in the body frame', () => {
    const { combat, aircraft } = base()
    const rec = combat.aircraft['a']!
    const hurt: CombatState = { ...combat, aircraft: { ...combat.aircraft, a: { ...rec, damage: { ...rec.damage, engine: 0.4 } } } }
    const s = nextFxEvents(NO_FX_MEMORY, view(5, hurt, aircraft)).sustained
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ key: 'engine:a', recipe: 'engine.smoke', intensity: 0.6, velocity: v3(100, 0, 0) })
    expect(s[0]!.position.x).toBeCloseTo(3.2, 9)
    expect(s[0]!.position.y).toBeCloseTo(1000.7, 9)
    expect(s[0]!.position.z).toBeCloseTo(0, 9)
    expect(nextFxEvents(NO_FX_MEMORY, view(5, combat, aircraft)).sustained).toEqual([])
  })

  it('smoke follows overall damage, light, then heavy, then black before the fire (round 2)', () => {
    const { combat, aircraft } = base()
    const rec = combat.aircraft['a']!
    const at = (structure: number) => nextFxEvents(NO_FX_MEMORY, view(5, { ...combat, aircraft: { ...combat.aircraft, a: { ...rec, damage: { ...rec.damage, structure } } } }, aircraft)).sustained
    // Structure alone smokes, scaled from whole (none) to the fire line (full); black joins past SMOKE_BLACK_FROM.
    const light = at(1 - 0.25 * (1 - FIRE_AT_STRUCTURE)), heavy = at(1 - 0.9 * (1 - FIRE_AT_STRUCTURE))
    expect(light.map((x) => x.recipe)).toEqual(['engine.smoke'])
    expect(light[0]!.intensity).toBeCloseTo(0.25, 9)
    expect(heavy.map((x) => x.recipe)).toEqual(['engine.smoke', 'smoke.black'])
    expect(heavy[0]!.intensity).toBeCloseTo(0.9, 9)
    expect(heavy[1]!.intensity).toBeCloseTo((0.9 - SMOKE_BLACK_FROM) / (1 - SMOKE_BLACK_FROM), 9)
  })

  it('a multi-engine airplane smokes from each hit engine at its own zone (round 2)', () => {
    const b17 = loadAircraftSpec('b-17-flying-fortress')
    const state = createState({ position: v3(0, 1000, 0), velocity: v3(100, 0, 0) })
    const bomber = { id: 'b', spec: b17, state, previous: state, controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0 }, impact: null as Impact | null }
    const combat = createCombat([bomber])
    const d = combat.aircraft['b']!.damage
    expect(d.engines).toEqual([1, 1, 1, 1])
    const hit: CombatState = { ...combat, aircraft: { b: { ...combat.aircraft['b']!, damage: { ...d, engines: [1, 1, 0.3, 1], engine: 0.825 } } } }
    const s = nextFxEvents(NO_FX_MEMORY, view(5, hit, [bomber])).sustained
    expect(s.map((x) => x.key)).toEqual(['engine:b#2'])
    const zone = b17.combat!.zones.find((z) => z.engine === 2)!
    expect(s[0]!.position.z).toBeCloseTo(zone.center[2], 9)
  })

  it('a burning airframe trails fire from the engine in place of smoke; the wreck burns down to the surface', () => {
    const { combat, aircraft } = base()
    const rec = combat.aircraft['a']!
    const lit: CombatState = { ...combat, aircraft: { ...combat.aircraft, a: { ...rec, damage: { ...rec.damage, engine: 0.25, burningSince: 4 } } } }
    const s = nextFxEvents(NO_FX_MEMORY, view(5, lit, aircraft)).sustained
    expect(s.map((x) => x.key)).toEqual(['fire:a'])
    expect(s[0]).toMatchObject({ recipe: 'aircraft.fire', intensity: 1, velocity: v3(100, 0, 0) })
    expect(s[0]!.position.x).toBeCloseTo(3.2, 9)
    const wreck: CombatState = { ...lit, aircraft: { ...lit.aircraft, a: { ...lit.aircraft['a']!, damage: { ...lit.aircraft['a']!.damage, destroyedAt: 5 } } } }
    expect(nextFxEvents(NO_FX_MEMORY, view(6, wreck, aircraft)).sustained.map((x) => x.key).sort()).toEqual(['fire:a', 'kill:a'])
    const down = aircraft.map((a) => a.id === 'a' ? { ...a, impact: { tick: 6, position: a.state.position, verticalSpeedMps: -70, groundHeightM: 0, surface: 'water' as const, kind: 'destroyed' as const } } : a)
    expect(nextFxEvents(NO_FX_MEMORY, view(7, wreck, down)).sustained).toEqual([])
  })

  it('ship fire scales with fire, stops once sunk, and needs a smoke origin', () => {
    const { combat, aircraft } = base()
    const burning = (fire: number, sinkingFraction: number): CombatState =>
      ({ ...combat, ships: { maru: { ...combat.ships['maru']!, fire, sinkingFraction } } })
    expect(nextFxEvents(NO_FX_MEMORY, view(5, burning(0.4, 0.2), aircraft)).sustained)
      .toEqual([{ key: 'ship:maru', recipe: 'ship.fire', intensity: 0.4, position: v3(9000, 20, 0), velocity: ZERO }])
    expect(nextFxEvents(NO_FX_MEMORY, view(5, burning(0.4, 1), aircraft)).sustained).toEqual([])
    expect(nextFxEvents(NO_FX_MEMORY, view(5, burning(0.4, 0.2), aircraft, { shipSmokeOrigins: new Map() })).sustained).toEqual([])
  })

  it('a collapse triggers once at its anchor and smokes for COLLAPSE_SMOKE_S, fading', () => {
    const { combat, aircraft } = base()
    const razed: CombatState = { ...combat, structures: { hangar: { hp: 0, destroyedTick: 60, attacker: 'a' } } }
    const f1 = nextFxEvents(NO_FX_MEMORY, view(60, razed, aircraft))
    expect(f1.triggers).toEqual([{ recipe: 'structure.collapse', position: v3(-500, 12, 40), velocity: ZERO }])
    expect(f1.sustained.find((s) => s.key === 'structure:hangar')!.intensity).toBe(1)
    const f2 = nextFxEvents(f1.memory, view(60 + Math.round(COLLAPSE_SMOKE_S / DT) + 1, razed, aircraft))
    expect(f2.triggers).toEqual([])
    expect(f2.sustained).toEqual([])
  })
})

describe('the rocket motor (plan E2 Ruling R8)', () => {
  const rocket = (id: number, ageS: number, kind: Projectile['kind'] = 'rocket'): Projectile =>
    ({ owner: 'a', id, position: v3(100, 500, 0), previous: v3(99, 500, 0), velocity: v3(300, 0, 0), lifeS: 10, tracer: false, kind, ageS })

  it('a burning rocket carries a motor emitter at its nozzle; a spent rocket and a bomb carry none', () => {
    const { combat, aircraft } = base()
    const c = { ...combat, projectiles: [rocket(1, 0.2), rocket(2, ROCKET_BURN_S), rocket(3, 0.2, 'bomb')] }
    const motors = nextFxEvents(NO_FX_MEMORY, view(1, c, aircraft)).sustained.filter((s) => s.recipe === 'rocket.motor')
    expect(motors.map((m) => m.key)).toEqual(['rocket:1'])
    expect(motors[0]!.position.x).toBeCloseTo(100 - ROCKET_NOZZLE_AFT_M, 6)
    expect(motors[0]!.velocity).toEqual(v3(300, 0, 0))
    expect(motors[0]!.intensity).toBe(1)
  })

  it('ROCKET_NOZZLE_AFT_M is the HVAR model\'s aft end, measured rather than remembered', async () => {
    const m = measureDocument(await modelIO().readBinary(new Uint8Array(readFileSync('content/ordnance/hvar.glb'))))
    expect(-m.bounds.min[0]!).toBeCloseTo(ROCKET_NOZZLE_AFT_M, 2)
  })
})
