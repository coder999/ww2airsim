import { describe, expect, it } from 'vitest'
import { loadAircraftSpec, loadScenarioBundle } from '../../../tools/content/load.js'
import { createState } from '../../../src/sim/flight/state.js'
import { advance, createWorldOf, type AircraftEntity, type Stepper, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { add, v3, type Vec3 } from '../../../src/sim/math/vec3.js'
import type { Side } from '../../../src/sim/sides.js'
import { worldFromScenario } from '../../../src/sim/scenario.js'
import { SINK_SECONDS, createCombat, creditDownedAircraft, stepCombat, type CombatVehicle, type Projectile } from '../../../src/sim/weapons/combat.js'
import type { StructureEntity } from '../../../src/sim/weapons/structures.js'
import { TARGET_TYPES, zeroKillsByType, type TargetType } from '../../../src/sim/weapons/targetType.js'
import { SCORE_CLASSES, SCORE_POINTS } from '../../../src/campaign/schema.js'
import { friendlyDestroyedBy, friendlyFireOf, withDischarge } from '../../../src/render/discharge.js'
import { landingModel } from '../../../src/render/debrief.js'

/**
 * F5A Task 7(a): the damage-tag ledger. "Any actual player-caused durability damage tags an enemy
 * for full credit during that sortie. If it is later destroyed by the player, a friendly, a crash,
 * fire, or another cause, its full value is credited once. A target that survives earns nothing;
 * an untouched wingman kill earns nothing" (GAMEPLAY.md, Campaign scoring and conduct).
 */
const f6f = loadAircraftSpec('f6f-hellcat')
const plane = (id: string, position: Vec3, side?: Side, fire = false): AircraftEntity => {
  const state = createState({ position, velocity: v3(0, 0, 0) })
  return {
    id, spec: f6f, state, previous: state, controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0, fire }, assistMemory: undefined, impact: null, parked: false,
    ...(side === undefined ? {} : { side }),
  }
}
const still: Stepper = (_spec, state, _controls, ctx) => ({ ...state, tick: ctx.tick })
const credits = (w: World, id: string) => w.combat.aircraft[id]!.tagCredits
const total = (c: Readonly<Record<TargetType, number>>) => TARGET_TYPES.reduce((s, t) => s + c[t], 0)
const setFire = (w: World, id: string, fire: boolean): World => ({
  ...w, aircraft: w.aircraft.map((a) => (a.id === id ? { ...a, controls: { ...a.controls, fire } } : a)),
})
const step = (w: World, n: number): World => { for (let i = 0; i < n; i++) w = advance(w, DT, still).world; return w }

/** player 'me' (allied) 300 m behind 'bandit' (axis); 'wing' (allied) parked 300 m to the side, out of the line. */
function dogfight(): World {
  return createWorldOf({
    aircraft: [plane('me', v3(0, 1000, 0), 'allied'), plane('bandit', v3(300, 1000, 0), 'axis'), plane('wing', v3(0, 1000, -300), 'allied')],
    player: 'me',
  })
}
/** Swap the shooters' places: 'wing' takes the firing line, 'me' steps out of it. */
function wingTakesOver(w: World): World {
  const place = (a: AircraftEntity, z: number): AircraftEntity => {
    const state = { ...a.state, position: v3(a.state.position.x, 1000, z) }
    return { ...a, state, previous: state, controls: { ...a.controls, fire: false } }
  }
  return { ...w, aircraft: w.aircraft.map((a) => (a.id === 'wing' ? place(a, 0) : a.id === 'me' ? place(a, -300) : a)) }
}

describe('aircraft tags', () => {
  it('a hit that damages tags; the record starts empty and a survivor earns nothing', () => {
    let w = dogfight()
    expect(w.combat.aircraft['me']!.tagged).toEqual([])
    expect(total(credits(w, 'me'))).toBe(0)
    w = setFire(w, 'me', true)
    for (let i = 0; i < 300 && w.combat.aircraft['me']!.tagged.length === 0; i++) w = step(w, 1)
    w = setFire(w, 'me', false)
    expect(w.combat.aircraft['me']!.tagged).toEqual(['bandit'])
    expect(w.combat.aircraft['bandit']!.damage.destroyedAt).toBeNull()
    expect(total(credits(w, 'me'))).toBe(0) // damaged but survives: nothing
  })

  it('tag-then-wingman-kills credits the tagger once, and the wingman who tagged too; last-blow killsByType still says wingman only', () => {
    let w = setFire(dogfight(), 'me', true)
    for (let i = 0; i < 300 && w.combat.aircraft['me']!.tagged.length === 0; i++) w = step(w, 1)
    w = setFire(wingTakesOver(w), 'wing', true)
    for (let i = 0; i < 1500 && w.combat.aircraft['bandit']!.damage.destroyedAt === null; i++) w = step(w, 1)
    expect(w.combat.aircraft['bandit']!.damage.attacker).toBe('wing')
    w = step(w, 2)
    expect(credits(w, 'me').fighter).toBe(1)
    expect(total(credits(w, 'me'))).toBe(1)
    expect(credits(w, 'wing').fighter).toBe(1)
    expect(w.combat.aircraft['me']!.killsByType.fighter).toBe(0) // the legacy rule is unchanged
    expect(w.combat.aircraft['wing']!.killsByType.fighter).toBe(1)
  })

  it('an untouched wingman kill credits nothing', () => {
    let w = setFire(wingTakesOver(dogfight()), 'wing', true)
    for (let i = 0; i < 1500 && w.combat.aircraft['bandit']!.damage.destroyedAt === null; i++) w = step(w, 1)
    expect(w.combat.aircraft['bandit']!.damage.destroyedAt).not.toBeNull()
    w = step(w, 10)
    expect(w.combat.aircraft['me']!.tagged).toEqual([])
    expect(total(credits(w, 'me'))).toBe(0)
    expect(credits(w, 'wing').fighter).toBe(1)
  })

  it('a hit without damage tags nothing: rounds into an already-destroyed wreck', () => {
    let w = setFire(wingTakesOver(dogfight()), 'wing', true)
    for (let i = 0; i < 1500 && w.combat.aircraft['bandit']!.damage.destroyedAt === null; i++) w = step(w, 1)
    w = setFire(wingTakesOver(w), 'wing', false)
    w = { ...w, aircraft: w.aircraft.map((a) => (a.id === 'me' ? { ...a, state: { ...a.state, position: v3(0, 1000, 0) }, previous: { ...a.state, position: v3(0, 1000, 0) } } : a.id === 'wing' ? { ...a, state: { ...a.state, position: v3(0, 1000, -300) }, previous: { ...a.state, position: v3(0, 1000, -300) } } : a)) }
    w = setFire(w, 'me', true)
    w = step(w, 120)
    expect(w.combat.aircraft['me']!.shots).toBeGreaterThan(0)
    expect(w.combat.aircraft['me']!.tagged).toEqual([])
    expect(total(credits(w, 'me'))).toBe(0)
  })

  it('double credit is impossible: the wreck falling and crashing later adds nothing', () => {
    let w = setFire(dogfight(), 'me', true)
    for (let i = 0; i < 1500 && w.combat.aircraft['bandit']!.damage.destroyedAt === null; i++) w = step(w, 1)
    w = setFire(w, 'me', false)
    w = step(w, 5)
    expect(credits(w, 'me').fighter).toBe(1)
    w = step(w, 900) // far longer than the wreck needs to hit the ground (no terrain: it keeps flying) or burn out
    expect(credits(w, 'me').fighter).toBe(1)
    expect(total(credits(w, 'me'))).toBe(1)
  })

  it('a tagged enemy that goes down without a killing hit (a crash after damage) is credited by the down-transition', () => {
    let w = dogfight()
    w = { ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, me: { ...w.combat.aircraft['me']!, tagged: ['bandit'] } } } }
    const crashed = w.aircraft.map((a) => (a.id === 'bandit' ? { ...a, impact: { tick: 1 } as unknown as AircraftEntity['impact'] } : a))
    const after = advanceCredit(w, crashed)
    expect(after.aircraft['me']!.tagCredits.fighter).toBe(1)
  })

  it('friendly aircraft are never tagged: shooting a wingman is friendly fire, not a tag', () => {
    let w = createWorldOf({ aircraft: [plane('me', v3(0, 1000, 0), 'allied', true), plane('ally', v3(300, 1000, 0), 'allied')], player: 'me' })
    for (let i = 0; i < 1500 && w.combat.aircraft['ally']!.damage.destroyedAt === null; i++) w = step(w, 1)
    w = step(w, 3)
    expect(w.combat.aircraft['me']!.tagged).toEqual([])
    expect(total(credits(w, 'me'))).toBe(0)
    expect(w.combat.aircraft['me']!.friendlyKills).toBe(1)
  })
})

function advanceCredit(w: World, after: AircraftEntity[]) {
  return creditDownedAircraft(w.combat, w.combat, w.aircraft, after, { me: 'allied', bandit: 'axis', wing: 'allied' })
}

describe('structure and vehicle tags', () => {
  const shooter = plane('shooter', v3(-100, 1000, 0), 'allied')
  const hangar = (id: string, x: number, hp = 50): StructureEntity => ({ id, airfield: 'test', kind: 'hangar', position: v3(x, 5, 0), headingRad: 0, halfSize: { x: 5, y: 5, z: 5 }, hp })
  const bombAt = (owner: string, position: Vec3): Projectile => ({ owner, id: 1, position, previous: position, velocity: v3(0, -50, 0), lifeS: 60, tracer: false, kind: 'bomb', ageS: 1 })
  const roundAt = (owner: string, position: Vec3): Projectile => ({ owner, id: 1, position, previous: add(position, v3(0, 5, 0)), velocity: v3(0, -880, 0), lifeS: 3, tracer: false, kind: 'round', ageS: 0 })
  const SIDES = { shooter: 'allied' as const, wing: 'allied' as const }
  const TS = { ships: {}, structures: {}, vehicles: {} }

  it('a bomb that destroys an enemy hangar credits Building once (the structure is destroyed by the tagger)', () => {
    const h = hangar('h1', 2000)
    const s0 = createCombat([shooter], {}, [], [{ id: 'h1', hp: 50 }])
    const s1 = stepCombat({ ...s0, projectiles: [bombAt('shooter', h.position)] }, [shooter], [], [h], null, null, [], 1, DT, null, false, SIDES, TS)
    expect(s1.structures['h1']!.destroyedTick).toBe(1)
    expect(s1.aircraft['shooter']!.tagCredits.building).toBe(1)
    const s2 = stepCombat({ ...s1, projectiles: [bombAt('shooter', h.position)] }, [shooter], [], [h], null, null, [], 2, DT, null, false, SIDES, TS)
    expect(s2.aircraft['shooter']!.tagCredits.building).toBe(1) // rubble: no second credit
  })

  it('damage by the player then destruction by a wingman: the player is credited, the untouched shooter is not', () => {
    const wing = plane('wing', v3(-100, 1000, 40), 'allied')
    const h = hangar('h2', 2000, 50)
    const s0 = createCombat([shooter, wing], {}, [], [{ id: 'h2', hp: 50 }])
    // the player's round does 'roundDamage' (< 50 hp): tags, does not destroy
    const s1 = stepCombat({ ...s0, projectiles: [roundAt('shooter', h.position)] }, [shooter, wing], [], [h], null, null, [], 1, DT, null, false, SIDES, TS)
    expect(s1.structures['h2']!.destroyedTick).toBeNull()
    expect(s1.aircraft['shooter']!.tagged).toEqual(['h2'])
    expect(s1.aircraft['shooter']!.tagCredits.building).toBe(0) // damaged but survives
    const s2 = stepCombat({ ...s1, projectiles: [bombAt('wing', h.position)] }, [shooter, wing], [], [h], null, null, [], 2, DT, null, false, SIDES, TS)
    expect(s2.structures['h2']!.destroyedTick).toBe(2)
    expect(s2.aircraft['shooter']!.tagCredits.building).toBe(1)
    expect(s2.aircraft['wing']!.tagCredits.building).toBe(1) // the wingman's bomb tagged it too
  })

  it('a wingman\'s untouched kill of a structure credits the player nothing', () => {
    const wing = plane('wing', v3(-100, 1000, 40), 'allied')
    const h = hangar('h3', 2000)
    const s0 = createCombat([shooter, wing], {}, [], [{ id: 'h3', hp: 50 }])
    const s1 = stepCombat({ ...s0, projectiles: [bombAt('wing', h.position)] }, [shooter, wing], [], [h], null, null, [], 1, DT, null, false, SIDES, TS)
    expect(s1.structures['h3']!.destroyedTick).toBe(1)
    expect(s1.aircraft['shooter']!.tagged).toEqual([])
    expect(total(s1.aircraft['shooter']!.tagCredits)).toBe(0)
  })

  it('a neutral structure (not in enemyStructureIds) is not tagged and earns nothing', () => {
    const h = hangar('h4', 2000)
    const s0 = createCombat([shooter], {}, [], [{ id: 'h4', hp: 50 }])
    const s1 = stepCombat({ ...s0, projectiles: [bombAt('shooter', h.position)] }, [shooter], [], [h], null, null, [], 1, DT, new Set<string>(), false, SIDES, TS)
    expect(s1.structures['h4']!.destroyedTick).toBe(1)
    expect(s1.aircraft['shooter']!.tagged).toEqual([])
    expect(total(s1.aircraft['shooter']!.tagCredits)).toBe(0)
  })

  it.each([['light-vehicle', 'light-vehicle'], ['tank', 'tank'], ['landing-craft', 'landing-craft']] as const)('a destroyed %s vehicle credits its own class', (targetType, cls) => {
    const v: CombatVehicle = { id: 'v1', spec: { lengthM: 5, widthM: 2, heightM: 2, targetType }, state: { position: v3(1000, 0, 0), headingRad: 0 }, previous: { position: v3(1000, 0, 0), headingRad: 0 } }
    const c0 = createCombat([shooter], {}, [], [], 1944, [{ id: 'v1', hp: 20 }])
    const c1 = stepCombat({ ...c0, projectiles: [bombAt('shooter', v3(1000, 1, 0))] }, [shooter], [], [], null, null, [], 1, DT, null, false, SIDES, TS, [v])
    expect(c1.vehicles['v1']!.destroyedTick).toBe(1)
    expect(c1.aircraft['shooter']!.tagCredits[cls]).toBe(1)
    expect(total(c1.aircraft['shooter']!.tagCredits)).toBe(1)
  })

  it('a friendly vehicle destroyed is a friendly kill and credits nothing', () => {
    const v: CombatVehicle = { id: 'v2', spec: { lengthM: 5, widthM: 2, heightM: 2, targetType: 'light-vehicle' }, state: { position: v3(1000, 0, 0), headingRad: 0 }, previous: { position: v3(1000, 0, 0), headingRad: 0 } }
    const c0 = createCombat([shooter], {}, [], [], 1944, [{ id: 'v2', hp: 20 }])
    const c1 = stepCombat({ ...c0, projectiles: [bombAt('shooter', v3(1000, 1, 0))] }, [shooter], [], [], null, null, [], 1, DT, null, false, SIDES, { ships: {}, structures: {}, vehicles: { v2: 'allied' } }, [v])
    expect(c1.aircraft['shooter']!.friendlyKills).toBe(1)
    expect(c1.aircraft['shooter']!.tagged).toEqual([])
    expect(total(c1.aircraft['shooter']!.tagCredits)).toBe(0)
  })
})

describe('ship tags: credit stays at sink-complete (ruling D15)', () => {
  const ship = (role: 'merchant' | 'escort') => ({
    id: 'maru', spec: { lengthM: 112, beamM: 15.8, deckHeightM: 6, hullHp: 240, role },
    state: { position: v3(0, 0, 0), headingRad: 0 }, previous: { position: v3(0, 0, 0), headingRad: 0 },
  })
  const shooter = plane('shooter', v3(-100, 1000, 0), 'allied')
  const bomb = (): Projectile => ({ owner: 'shooter', id: 1, position: v3(0, 3, 0), previous: v3(0, 3, 0), velocity: v3(0, -50, 0), lifeS: 60, tracer: false, kind: 'bomb', ageS: 1 })
  const SIDES = { shooter: 'allied' as const }

  /** Sink a hull with one bomb of enough damage: hullHp is tiny so the first bomb is the killing blow. */
  function sunk(side: Side) {
    const s = { ...ship('merchant') }
    const c0 = createCombat([shooter], {}, [{ id: 'maru', hullHp: 10 }])
    const c1 = stepCombat({ ...c0, projectiles: [bomb()] }, [shooter], [{ ...s, spec: { ...s.spec, hullHp: 10 } }], [], null, null, [], 1, DT, null, false, SIDES, { ships: { maru: side }, structures: {}, vehicles: {} })
    return { c1, s: { ...s, spec: { ...s.spec, hullHp: 10 } }, tick: 1 }
  }

  it('an enemy hull credits Transport only when it reaches the bottom 90 s later, once', () => {
    const { c1, s } = sunk('axis')
    expect(c1.ships['maru']!.destroyedTick).toBe(1)
    expect(c1.aircraft['shooter']!.tagged).toEqual(['maru'])
    expect(total(c1.aircraft['shooter']!.tagCredits)).toBe(0) // destroyed, still sinking: nothing yet
    // step the sinking: dt 1 s per call is the pass's own clock
    let c = c1
    for (let t = 2; t < 2 + SINK_SECONDS - 1; t++) c = stepCombat(c, [shooter], [s], [], null, null, [], t, 1, null, false, SIDES, { ships: { maru: 'axis' }, structures: {}, vehicles: {} })
    expect(c.ships['maru']!.sinkingFraction).toBeLessThan(1)
    expect(total(c.aircraft['shooter']!.tagCredits), 'a sortie ending inside the sinking window credits nothing (accepted limitation, D15)').toBe(0)
    for (let t = 200; t < 210; t++) c = stepCombat(c, [shooter], [s], [], null, null, [], t, 1, null, false, SIDES, { ships: { maru: 'axis' }, structures: {}, vehicles: {} })
    expect(c.ships['maru']!.sinkingFraction).toBe(1)
    expect(c.aircraft['shooter']!.tagCredits.transport).toBe(1)
    expect(total(c.aircraft['shooter']!.tagCredits)).toBe(1)
    for (let t = 300; t < 320; t++) c = stepCombat(c, [shooter], [s], [], null, null, [], t, 1, null, false, SIDES, { ships: { maru: 'axis' }, structures: {}, vehicles: {} })
    expect(c.aircraft['shooter']!.tagCredits.transport).toBe(1) // once
  })

  it('a friendly hull destroyed inside the window is not yet a friendly kill; at the bottom it is (ruling D15, tested limitation)', () => {
    const { c1, s } = sunk('allied')
    expect(c1.ships['maru']!.destroyedTick).toBe(1)
    expect(c1.aircraft['shooter']!.friendlyFire).toMatchObject({ kind: 'ship', target: 'maru' })
    expect(c1.aircraft['shooter']!.friendlyKills).toBe(0)
    expect(c1.aircraft['shooter']!.tagged).toEqual([])
    let c = c1
    for (let t = 2; t < 2 + SINK_SECONDS - 1; t++) c = stepCombat(c, [shooter], [s], [], null, null, [], t, 1, null, false, SIDES, { ships: { maru: 'allied' }, structures: {}, vehicles: {} })
    expect(c.aircraft['shooter']!.friendlyKills).toBe(0)
    for (let t = 200; t < 205; t++) c = stepCombat(c, [shooter], [s], [], null, null, [], t, 1, null, false, SIDES, { ships: { maru: 'allied' }, structures: {}, vehicles: {} })
    expect(c.aircraft['shooter']!.friendlyKills).toBe(1)
    expect(total(c.aircraft['shooter']!.tagCredits)).toBe(0)
  })

  it('a destroyer hull credits the Destroyer class (escort role)', () => {
    const s = { ...ship('escort'), spec: { ...ship('escort').spec, hullHp: 10 } }
    const c0 = createCombat([shooter], {}, [{ id: 'maru', hullHp: 10 }])
    let c = stepCombat({ ...c0, projectiles: [bomb()] }, [shooter], [s], [], null, null, [], 1, DT, null, false, SIDES, { ships: { maru: 'axis' }, structures: {}, vehicles: {} })
    for (let t = 2; t < 6; t++) c = stepCombat(c, [shooter], [s], [], null, null, [], t, 30, null, false, SIDES, { ships: { maru: 'axis' }, structures: {}, vehicles: {} })
    expect(c.aircraft['shooter']!.tagCredits.destroyer).toBe(1)
  })
})

describe('the tag vocabulary is the campaign score table', () => {
  it('TargetType and SCORE_CLASSES list the same 13 classes, and zeroKillsByType has a row for each', () => {
    expect([...TARGET_TYPES].sort()).toEqual([...SCORE_CLASSES].sort())
    expect(Object.keys(zeroKillsByType()).sort()).toEqual([...SCORE_CLASSES].sort())
    expect(SCORE_CLASSES.every((k) => SCORE_POINTS[k] > 0)).toBe(true)
  })
})

describe('warning-only friendly damage, discharge on friendly destruction (Task 7c)', () => {
  const REPORT = { touchdownSinkMps: 1.2, touchdownSpeedMps: 38, rollOutM: 410, tick: 900, at: { kind: 'airfield' as const, id: 'tacloban', name: 'Tacloban' } }
  const strike = worldFromScenario(loadScenarioBundle('strike-range'), null)
  const tower = strike.structures.find((s) => s.id === 'tacloban-tower')!
  const bomb = (at: Vec3): Projectile => ({ owner: 'f6f-1', id: 1, position: at, previous: at, velocity: v3(0, -50, 0), lifeS: 60, tracer: false, kind: 'bomb', ageS: 1 })
  const drop = (w: World, at: Vec3): World => advance({ ...w, combat: { ...w.combat, projectiles: [bomb(at)] } }, DT, still).world
  const damaged = (() => {
    // a round, not a bomb: enough to hurt the tower, far from enough to destroy it
    const at = tower.position
    const p: Projectile = { owner: 'f6f-1', id: 1, position: at, previous: add(at, v3(0, 5, 0)), velocity: v3(0, -880, 0), lifeS: 3, tracer: false, kind: 'round', ageS: 0 }
    return advance({ ...strike, combat: { ...strike.combat, projectiles: [p] } }, DT, still).world
  })()

  it('damage alone warns: friendlyFire is set, nothing is destroyed, and the debrief is untouched', () => {
    expect(friendlyFireOf(damaged)).toMatchObject({ kind: 'structure', target: 'tacloban-tower' })
    expect(damaged.combat.structures['tacloban-tower']!.destroyedTick).toBeNull()
    expect(friendlyDestroyedBy(damaged)).toBe(false)
    const model = landingModel(REPORT, zeroKillsByType())
    expect(withDischarge(model, damaged)).toBe(model)
  })

  it('destroying the friendly structure discharges', () => {
    let w = damaged
    for (let i = 0; i < 8 && w.combat.structures['tacloban-tower']!.destroyedTick === null; i++) w = drop(w, tower.position)
    expect(w.combat.structures['tacloban-tower']!.destroyedTick).not.toBeNull()
    expect(friendlyDestroyedBy(w)).toBe(true)
    const model = landingModel(REPORT, zeroKillsByType())
    expect(withDischarge(model, w)).not.toBe(model)
    expect(withDischarge(model, w).discharge).toBeDefined()
  })

  it('an enemy destruction never discharges', () => {
    const hangar = strike.structures.find((s) => s.id === 'dulag-hangar-2')!
    const w = drop(strike, hangar.position)
    expect(w.combat.structures['dulag-hangar-2']!.destroyedTick).not.toBeNull()
    expect(friendlyDestroyedBy(w)).toBe(false)
    expect(w.combat.aircraft['f6f-1']!.tagCredits.building).toBe(1)
  })
})
