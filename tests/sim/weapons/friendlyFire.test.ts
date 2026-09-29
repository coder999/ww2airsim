import { describe, expect, it } from 'vitest'
import { loadAircraftSpec, loadScenarioBundle } from '../../../tools/content/load.js'
import { createState } from '../../../src/sim/flight/state.js'
import { advance, type AircraftEntity, type Stepper, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { add, v3, type Vec3 } from '../../../src/sim/math/vec3.js'
import {
  createCombat, stepCombat, type CombatAircraft, type CombatShip, type CombatState, type Projectile,
} from '../../../src/sim/weapons/combat.js'
import type { StructureEntity } from '../../../src/sim/weapons/structures.js'
import { ownSideTarget, withFriendlyFire, type TargetSides } from '../../../src/sim/weapons/friendlyFire.js'
import { worldFromScenario } from '../../../src/sim/scenario.js'
import { restPitchRad } from '../../../src/sim/gearContact.js'
import { qFromAxisAngle, qMul } from '../../../src/sim/math/quat.js'
import type { Side } from '../../../src/sim/sides.js'

/**
 * Friendly fire (spec 2026-09-26-friendly-fire-design.md §4): the first
 * damage an aircraft does to its own side is recorded on the shooter, and
 * nothing on its own side ever scores -- ships and structures now, as 7e
 * already did for aircraft.
 */
const f6f = loadAircraftSpec('f6f-hellcat')

/** `id` with the rest pitch taken back out of its parked attitude: level, same
 *  heading. `parkedAttitude` is yaw * pitch(rest), so this undoes the pitch. */
const levelled = <M>(w: World<M>, id: string): World<M> => ({
  ...w,
  aircraft: w.aircraft.map((a) => {
    if (a.id !== id) return a
    const state = { ...a.state, attitude: qMul(a.state.attitude, qFromAxisAngle(v3(0, 0, 1), -restPitchRad(a.spec.gear))) }
    return { ...a, state, previous: state }
  }),
})
const still: Stepper = (_spec, state, _controls, ctx) => ({ ...state, tick: ctx.tick })

const plane = (id: string, at: Vec3): CombatAircraft => {
  const state = createState({ position: at })
  return { id, spec: f6f, state, previous: state, controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0 }, impact: null }
}
const hull = (id: string, x: number, role: CombatShip['spec']['role'] = 'carrier'): CombatShip => ({
  id, spec: { lengthM: 100, beamM: 20, deckHeightM: 10, hullHp: 100, role },
  state: { position: v3(x, 0, 0), headingRad: 0 }, previous: { position: v3(x, 0, 0), headingRad: 0 },
})
const building = (id: string, x: number): StructureEntity => ({
  id, airfield: 'field', kind: 'hangar', position: v3(x, 5, 0), headingRad: 0, halfSize: { x: 5, y: 5, z: 5 }, hp: 50,
})
const round = (owner: string, at: Vec3): Projectile => ({
  owner, id: 1, position: at, previous: at, velocity: v3(0, -880, 0), lifeS: 3, tracer: false, kind: 'round', ageS: 0,
})
const bomb = (owner: string, at: Vec3): Projectile => ({
  owner, id: 1, position: at, previous: at, velocity: v3(0, -50, 0), lifeS: 60, tracer: false, kind: 'bomb', ageS: 1,
})

// p (the player) and ai are allied, e is axis. cv and hangar are allied;
// maru and bunker axis. Far apart, so no blast reaches a second target.
const SIDES: Readonly<Record<string, Side>> = { p: 'allied', ai: 'allied', e: 'axis' }
const TARGETS: TargetSides = { ships: { cv: 'allied', maru: 'axis' }, structures: { hangar: 'allied', bunker: 'axis' } }
const AIRCRAFT = [plane('p', v3(0, 3000, 0)), plane('ai', v3(0, 3000, 4000)), plane('e', v3(0, 3000, 8000))]
const SHIPS = [hull('cv', 0), hull('maru', 4000, 'battleship')]
const STRUCTURES = [building('hangar', 8000), building('bunker', 12000)]
const ENEMY = new Set(['hangar', 'bunker']) // even listed as enemy, an allied hangar never scores

const fresh = (): CombatState => createCombat(
  AIRCRAFT, {}, SHIPS.map((s) => ({ id: s.id, hullHp: s.spec.hullHp })), STRUCTURES.map((s) => ({ id: s.id, hp: s.hp })),
)
const step = (c: CombatState, projectiles: Projectile[], tick: number, targets: TargetSides | null = TARGETS, dt = DT): CombatState =>
  stepCombat({ ...c, projectiles }, AIRCRAFT, SHIPS, STRUCTURES, null, null, [], tick, dt, ENEMY, false, SIDES, targets)

describe('the helpers', () => {
  it('ownSideTarget is false for an unknown side or no table', () => {
    expect(ownSideTarget(SIDES, TARGETS.ships, 'p', 'cv')).toBe(true)
    expect(ownSideTarget(SIDES, TARGETS.ships, 'e', 'cv')).toBe(false)
    expect(ownSideTarget(SIDES, TARGETS.ships, 'p', 'nope')).toBe(false)
    expect(ownSideTarget(null, TARGETS.ships, 'p', 'cv')).toBe(false)
    expect(ownSideTarget(SIDES, undefined, 'p', 'cv')).toBe(false)
  })
  it('withFriendlyFire keeps the first', () => {
    const first = withFriendlyFire({ friendlyFire: null }, { tick: 3, kind: 'ship', target: 'cv' })
    expect(withFriendlyFire(first, { tick: 9, kind: 'aircraft', target: 'x' })).toBe(first)
  })
})

describe('recording friendly fire (spec §4)', () => {
  it('starts null for every aircraft', () => {
    for (const r of Object.values(fresh().aircraft)) expect(r.friendlyFire).toBeNull()
  })

  it('a round into an allied hull records the first hit, and a second hit does not overwrite it', () => {
    const c1 = step(fresh(), [round('p', v3(0, 12, 0))], 1)
    expect(c1.ships.cv!.hp).toBeLessThan(100) // still physical
    expect(c1.aircraft.p!.friendlyFire).toEqual({ tick: 1, kind: 'ship', target: 'cv' })
    const c2 = step(c1, [round('p', v3(0, 12, 0))], 2)
    expect(c2.aircraft.p!.friendlyFire).toEqual({ tick: 1, kind: 'ship', target: 'cv' })
  })

  it('a round into an axis hull records nothing', () => {
    const c = step(fresh(), [round('p', v3(4000, 12, 0))], 1)
    expect(c.ships.maru!.hp).toBeLessThan(100)
    expect(c.aircraft.p!.friendlyFire).toBeNull()
  })

  it('a bomb on an allied hangar razes it, scores nothing, and counts a friendly kill', () => {
    const c = step(fresh(), [bomb('p', STRUCTURES[0]!.position)], 1)
    expect(c.structures.hangar!.destroyedTick).toBe(1)
    const p = c.aircraft.p!
    expect(p.friendlyFire).toEqual({ tick: 1, kind: 'structure', target: 'hangar' })
    expect(p.structuresDestroyed).toBe(0)
    expect(p.killsByType.building).toBe(0)
    expect(p.friendlyKills).toBe(1)
  })

  it('the same bomb on the axis bunker scores as before', () => {
    const c = step(fresh(), [bomb('p', STRUCTURES[1]!.position)], 1)
    const p = c.aircraft.p!
    expect(p.friendlyFire).toBeNull()
    expect(p.structuresDestroyed).toBe(1)
    expect(p.killsByType.building).toBe(1)
    expect(p.friendlyKills).toBe(0)
  })

  it('blast collateral on an allied aircraft is friendly fire, though no round touched it', () => {
    // A bomb on the axis bunker with the allied `ai` parked 10 m beside it.
    const beside = plane('ai', add(STRUCTURES[1]!.position, v3(10, 0, 0)))
    const aircraft = [AIRCRAFT[0]!, beside, AIRCRAFT[2]!]
    const c = stepCombat({ ...fresh(), projectiles: [bomb('p', STRUCTURES[1]!.position)] }, aircraft, SHIPS, STRUCTURES, null, null, [], 1, DT, ENEMY, false, SIDES, TARGETS)
    expect(c.aircraft.ai!.damage.structure).toBeLessThan(1)
    expect(c.aircraft.p!.friendlyFire).toEqual({ tick: 1, kind: 'aircraft', target: 'ai' })
    expect(c.aircraft.p!.friendlyHits).toBe(0) // 7e's counter is rounds only
    expect(c.aircraft.p!.structuresDestroyed).toBe(1) // the bunker still scores
  })

  it('a round into an allied aircraft is friendly fire too (7e counted it, now it is also recorded)', () => {
    const target = AIRCRAFT[1]!.state.position
    const c = step(fresh(), [{ ...round('p', add(target, v3(0, 5, 0))), velocity: v3(0, -880, 0) }], 1)
    expect(c.aircraft.p!.friendlyHits).toBe(1)
    expect(c.aircraft.p!.friendlyFire).toEqual({ tick: 1, kind: 'aircraft', target: 'ai' })
  })

  it('your own bomb blast on your own airframe is not friendly fire (ruling FF-3)', () => {
    const low = plane('p', add(STRUCTURES[1]!.position, v3(10, 0, 0)))
    const aircraft = [low, AIRCRAFT[1]!, AIRCRAFT[2]!]
    const c = stepCombat({ ...fresh(), projectiles: [bomb('p', STRUCTURES[1]!.position)] }, aircraft, SHIPS, STRUCTURES, null, null, [], 1, DT, ENEMY, false, SIDES, TARGETS)
    expect(c.aircraft.p!.damage.structure).toBeLessThan(1)
    expect(c.aircraft.p!.friendlyFire).toBeNull()
  })

  it('rounds into wreckage already destroyed are not friendly fire (ruling FF-3)', () => {
    const c0 = fresh()
    const sunk = { ...c0, ships: { ...c0.ships, cv: { hp: 0, fire: 1, destroyedTick: 1, attacker: 'e', sinkingFraction: 0.5 } } }
    const c = step(sunk, [round('p', v3(0, 12, 0))], 2)
    expect(c.aircraft.p!.friendlyFire).toBeNull()
  })

  it('an AI firing on an allied ship marks the AI, never the player (ruling FF-9)', () => {
    const c = step(fresh(), [round('ai', v3(0, 12, 0))], 1)
    expect(c.aircraft.ai!.friendlyFire).toEqual({ tick: 1, kind: 'ship', target: 'cv' })
    expect(c.aircraft.p!.friendlyFire).toBeNull()
  })
})

describe('sinking your own ship scores nothing (spec §4, Mark 2026-09-26)', () => {
  const sinking = (ship: string, attacker = 'p'): CombatState => {
    const c0 = fresh()
    return { ...c0, ships: { ...c0.ships, [ship]: { hp: 0, fire: 1, destroyedTick: 1, attacker, sinkingFraction: 0 } } }
  }
  it('an allied carrier on the bottom: no shipsSunk, no carrier kill, one friendly kill', () => {
    const c = step(sinking('cv'), [], 2, TARGETS, 100) // dt 100 s > SINK_SECONDS: on the bottom this call
    expect(c.ships.cv!.sinkingFraction).toBe(1)
    expect(c.aircraft.p!.shipsSunk).toBe(0)
    expect(c.aircraft.p!.killsByType.carrier).toBe(0)
    expect(c.aircraft.p!.friendlyKills).toBe(1)
  })
  it('an axis battleship on the bottom still scores', () => {
    const c = step(sinking('maru'), [], 2, TARGETS, 100)
    expect(c.aircraft.p!.shipsSunk).toBe(1)
    expect(c.aircraft.p!.killsByType.battleship).toBe(1)
    expect(c.aircraft.p!.friendlyKills).toBe(0)
  })
  it('with no target sides (every pre-friendly-fire caller) credit is exactly as before', () => {
    const c = step(sinking('cv'), [], 2, null, 100)
    expect(c.aircraft.p!.shipsSunk).toBe(1)
    expect(c.aircraft.p!.killsByType.carrier).toBe(1)
    const r = step(fresh(), [round('p', v3(0, 12, 0))], 1, null)
    expect(r.aircraft.p!.friendlyFire).toBeNull()
  })
})

describe('through production advance, on shipped content', () => {
  /** One tick of `advance` with `projectile` already in flight and every
   *  aircraft held where it is. */
  const oneTick = (w: World<undefined>, projectile: Projectile): World<undefined> =>
    advance({ ...w, combat: { ...w.combat, projectiles: [projectile] } }, DT, still).world
  /** 8 m above the deck, falling: a round that starts INSIDE a carrier's
   *  hull box below its flight deck meets the deck as ground first and does
   *  nothing (measured 2026-09-26), so every shot here comes from above. */
  const shipAt = (w: World<undefined>, id: string): Vec3 => {
    const ship = w.ships.find((s) => s.id === id)!
    return add(ship.state.position, v3(0, ship.spec.deckHeightM + 8, 0))
  }
  const structureAt = (w: World<undefined>, id: string): Vec3 => w.structures.find((s) => s.id === id)!.position

  it('free-flight: a player round into the allied cv-1 is friendly fire', () => {
    const w0 = worldFromScenario(loadScenarioBundle('free-flight'), null)
    const w = oneTick(w0, round('f6f-1', shipAt(w0, 'cv-1')))
    expect(w.combat.ships['cv-1']!.hp).toBeLessThan(w0.combat.ships['cv-1']!.hp)
    expect(w.combat.aircraft['f6f-1']!.friendlyFire).toEqual({ tick: 1, kind: 'ship', target: 'cv-1' })
  })

  it('strike-range: a player round into the axis maru-1 is not', () => {
    const w0 = worldFromScenario(loadScenarioBundle('strike-range'), null)
    const w = oneTick(w0, round('f6f-1', shipAt(w0, 'maru-1')))
    expect(w.combat.ships['maru-1']!.hp).toBeLessThan(w0.combat.ships['maru-1']!.hp)
    expect(w.combat.aircraft['f6f-1']!.friendlyFire).toBeNull()
  })

  it('strike-range: a bomb on Tacloban tower is friendly fire; on Dulag hangar it scores RAZED', () => {
    const w0 = worldFromScenario(loadScenarioBundle('strike-range'), null)
    const home = oneTick(w0, bomb('f6f-1', structureAt(w0, 'tacloban-tower')))
    expect(home.combat.structures['tacloban-tower']!.destroyedTick).not.toBeNull()
    expect(home.combat.aircraft['f6f-1']!.friendlyFire).toEqual({ tick: 1, kind: 'structure', target: 'tacloban-tower' })
    expect(home.combat.aircraft['f6f-1']!.structuresDestroyed).toBe(0)
    const enemy = oneTick(w0, bomb('f6f-1', structureAt(w0, 'dulag-hangar-2')))
    expect(enemy.combat.structures['dulag-hangar-2']!.destroyedTick).not.toBeNull()
    expect(enemy.combat.aircraft['f6f-1']!.friendlyFire).toBeNull()
    expect(enemy.combat.aircraft['f6f-1']!.structuresDestroyed).toBe(1)
  })

  it('free-flight: the allied cv-1 sunk by the player never reaches shipsSunk or killsByType', () => {
    const w0 = worldFromScenario(loadScenarioBundle('free-flight'), null)
    const doomed: World<undefined> = { ...w0, combat: { ...w0.combat, ships: { ...w0.combat.ships, 'cv-1': { hp: 0, fire: 1, destroyedTick: 0, attacker: 'f6f-1', sinkingFraction: 0.9999 } } } }
    let w: World<undefined> = doomed
    for (let i = 0; i < 3; i++) w = advance(w, DT, still).world
    expect(w.combat.ships['cv-1']!.sinkingFraction).toBe(1)
    const p = w.combat.aircraft['f6f-1']!
    expect(p.shipsSunk).toBe(0)
    expect(p.killsByType.carrier).toBe(0)
    expect(p.friendlyKills).toBe(1)
  })

  it('gunnery-range: the shipped sortie (Space from the parked spot until target-1 dies) never touches Tacloban (ruling FF-2)', () => {
    // T1 (2026-09-28): a parked airplane now sits at its derived rest
    // attitude, 9.45 deg nose-up for the F6F, and from there its guns fire
    // over target-1. This test is about where the rounds land (what dies, what
    // is never touched), not about aim, so the fixture levels the shooter to
    // the attitude it was parked at before T1 and leaves the sim alone.
    const w0 = levelled(worldFromScenario(loadScenarioBundle('gunnery-range'), null), 'f6f-1')
    const firing = (w: World<undefined>): World<undefined> => ({
      ...w, aircraft: w.aircraft.map((a): AircraftEntity<undefined> => (a.id === 'f6f-1' ? { ...a, controls: { ...a.controls, fire: true } } : a)),
    })
    let w = firing(w0)
    let ticks = 0
    while (w.combat.aircraft['target-1']!.damage.destroyedAt === null && ticks < 60 * 20) {
      w = firing(advance(w, DT, still).world)
      ticks++
    }
    // ...and on, until every round fired has come down or expired.
    for (let i = 0; i < 60 * 4; i++) w = advance(w, DT, still).world
    expect(w.combat.aircraft['target-1']!.damage.destroyedAt, 'target-1 never died').not.toBeNull()
    expect(w.combat.aircraft['f6f-1']!.friendlyFire).toBeNull()
    for (const s of w.structures) expect(w.combat.structures[s.id]!.hp, s.id).toBe(s.hp)
  })
})
