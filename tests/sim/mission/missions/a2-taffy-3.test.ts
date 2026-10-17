/**
 * A2 Taffy 3 (F10A, 2026-10-17), flown headless. Content: F3 section 4, A2. The engagement was MEASURED, not taken from the plan.
 *
 * Measured 2026-10-17 on the shipped file, the player passive 100 km away (a 780 s run, gen scratch):
 * - the plan's geometry (Japanese ships 8 km from the screen) killed both Fletchers by 120 s and Casablanca by 300 s with nobody in the
 *   air, and the friendly Fletchers' fire alone took Mogami from 420 to 183 hull points, which would have completed the damage objective
 *   for the player (the "no auto-complete" rule). So the Japanese group stands 17-24 km off, and the friendly screen is ordered onto
 *   Yamato (1,200 hull points; 540 of them to read below the threshold), which they cannot reach in time.
 * - passive, the screen goes down at 300-600 s, Casablanca is untouched until about 600 s and sinks at about 1,000 s, and no Japanese hull
 *   is below 100 percent: the primaries are the player's to earn.
 * - one Mk 13 (136 hull points, plus a flood of 0.6 of that over a minute: 217.6) leaves Mogami at 202 of 420, below the 0.55 threshold,
 *   without sinking her; Yamato needs three. Nothing but a torpedo class of hit reads (190 .50-cal hits is the strafing price).
 */
import { describe, expect, it } from 'vitest'
import { loadAircraftSpec, loadShipSpec } from '../../../../tools/content/load.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import { advance, playerAircraft, type World } from '../../../../src/sim/loop.js'
import { DT } from '../../../../src/sim/flight/model.js'
import { sideOf } from '../../../../src/sim/sides.js'
import { FLOOD_DAMAGE_FRACTION } from '../../../../src/sim/weapons/flooding.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { ticksFor } from '../../../../src/sim/mission/state.js'
import { CHAPTER_MISSIONS } from '../../../../src/campaign/chapterMissions.js'
import { windowsForChapter } from '../../../../src/campaign/worldStates.js'
import { skipScene } from '../../../../src/sim/scene/preroll.js'
import { progressOf } from '../fixture.js'
import { carrierApproach, destroyNow, fieldApproach, hold, levelAt, terrainOrSkip } from '../fly.js'
import { MILE_M, bearingDeg, bundleOf, hullAt, sceneOf, worldOf } from './f10aKit.js'

const ID = 'a2-taffy-3'
/** The engagement point (11.55 N 125.95 E) the mission-fit row named, the midpoint between the two forces. */
const ENGAGEMENT = { x: 70814, z: -83473 }
/** The join zone: its center and radius (objective `join`). */
const JOIN = { x: 67814, z: -86473, r: 4000 }
const ENEMY = ['yamato', 'mogami', 'kagero', 'shiratsuyu']
const SCREEN = ['dd-1', 'dd-2']
const mk13 = loadAircraftSpec('tbm-3-avenger').stores!.types.mk13!

describe('A2 content', () => {
  const bundle = bundleOf(ID, 'A2')
  const { scenario } = bundle

  it('is registered as chapter A2: the TBM-3, its own badge, coordinated false (F3 stages two F4F-4 stand-ins, which would trip the Commander gate)', () => {
    expect(CHAPTER_MISSIONS.A2).toMatchObject({ scenario: ID, badge: { id: 'taffy-3' }, start: 'airborne', aircraft: ['tbm-3-avenger'], coordinated: false, authoredBonus: 0 })
    expect(scenario.freezeOnSuccess).toBe(true)
    expect(scenario.weather.timeOfDay).toBe(7.5) // F3 section 3: 0730
    expect(scenario.weather.clouds!.reduce((m, c) => Math.max(m, c.coverage), 0)).toBeGreaterThanOrEqual(0.6) // broken cloud
    expect(scenario.sites).toEqual(['tacloban', 'dulag']) // the fields A2's success advances (Decision 10) and "any friendly base"
    expect(windowsForChapter('A2')).toMatchObject({ tacloban: 'buildup', dulag: 'buildup' })
  })

  it('holds F3\'s roster: player, two TBMs and two F4F stand-ins in the air; Casablanca and two Fletchers against Yamato, Mogami, Kagero and Shiratsuyu (five aircraft, seven ships)', () => {
    const w = worldFromScenario(bundle, null)
    expect(scenario.population).toEqual({ airborne: 5, ships: 7 })
    expect(w.aircraft.map((a) => a.spec.id).sort()).toEqual(['f4f-wildcat', 'f4f-wildcat', 'tbm-3-avenger', 'tbm-3-avenger', 'tbm-3-avenger'])
    expect(w.ships.map((s) => s.spec.id).sort()).toEqual(['casablanca-cve', 'fletcher-dd', 'fletcher-dd', 'kagero-dd', 'mogami-ca', 'shiratsuyu-dd', 'yamato-bb'])
    for (const id of ENEMY) expect(sideOf(w, w.ships.find((s) => s.id === id)!), id).toBe('axis')
    for (const id of ['casablanca', ...SCREEN]) expect(sideOf(w, w.ships.find((s) => s.id === id)!), id).toBe('allied')
  })

  it('starts the player airborne 8 miles southeast of the engagement (F3: 8-12), and the join zone is entered 2-3 minutes later at cruise', () => {
    const w = worldFromScenario(bundle, null)
    const p = playerAircraft(w).state.position
    const miles = Math.hypot(p.x - ENGAGEMENT.x, p.z - ENGAGEMENT.z) / MILE_M
    expect(miles).toBeGreaterThan(7.9)
    expect(miles).toBeLessThan(8.1)
    expect(Math.abs(bearingDeg(ENGAGEMENT, p) - 135)).toBeLessThan(1)
    const cruise = 85 // mission-fit row A2's cruise, about 0.7 of the Avenger's top speed
    const toZone = (Math.hypot(p.x - JOIN.x, p.z - JOIN.z) - JOIN.r) / cruise
    expect(toZone).toBeGreaterThan(120)
    expect(toZone).toBeLessThan(180)
    // F3: "surface engagement inside 12 mi" of the start
    for (const id of ENEMY) {
      const s = w.ships.find((x) => x.id === id)!.state.position
      expect(Math.hypot(s.x - p.x, s.z - p.z) / MILE_M, id).toBeLessThan(22)
    }
    const join = scenario.objectives!.find((o) => o.id === 'join')!
    expect(join).toMatchObject({ kind: 'reach', point: { x: JOIN.x, z: JOIN.z }, radiusM: JOIN.r })
  })

  it('weapon margin: the primary needs a torpedo-class hit and not a sinking (one Mk 13 reads on Mogami, three on Yamato; a hit does not sink Mogami)', () => {
    const objective = scenario.objectives!.find((o) => o.id === 'hit')!
    if (objective.kind !== 'damage') throw new Error('hit is not a damage objective')
    const perHit = mk13.damage * (1 + FLOOD_DAMAGE_FRACTION) // the hit, then the flood of 0.6 of it (flooding.ts)
    expect(perHit).toBeCloseTo(217.6, 6)
    const fractionLeft = (hull: number, hits: number): number => 1 - (hits * perHit) / hull
    const mogami = loadShipSpec('mogami-ca').hullHp
    const yamato = loadShipSpec('yamato-bb').hullHp
    expect(fractionLeft(mogami, 1)).toBeLessThan(objective.belowHpFraction)
    expect(fractionLeft(mogami, 1)).toBeGreaterThan(0) // not a sinking
    expect(fractionLeft(yamato, 1)).toBeGreaterThan(objective.belowHpFraction)
    expect(fractionLeft(yamato, 2)).toBeGreaterThan(objective.belowHpFraction)
    expect(fractionLeft(yamato, 3)).toBeLessThan(objective.belowHpFraction)
    expect(objective.belowHpFraction).toBe(0.55)
    // strafing alone: the .50 round's hull damage against what Mogami must lose
    const roundDamage = loadAircraftSpec('tbm-3-avenger').combat!.roundDamage
    expect(Math.ceil((mogami * (1 - objective.belowHpFraction)) / roundDamage)).toBeGreaterThan(40)
  })

  it('the Avenger is flown by eye: Ensign has no torpedosight (GAMEPLAY), and the briefing offers the torpedo loadout', () => {
    expect(scenario.briefing!.loadout).toBe('torpedoes')
    expect(scenario.history!.text).toMatch(/compressed/)
    expect(scenario.history!.text).toMatch(/FM-2/) // the F4F-4 art is a disclosed stand-in (F3 section 4)
  })
})

const terrain = terrainOrSkip()
const a2 = (): World<undefined> => worldOf(ID, 'A2', terrain)
/** Over the join zone, pinned: present, not firing. */
const JOINED = levelAt({ x: JOIN.x + 2000, z: JOIN.z + 2000 }, 600, 85, 315)
const pinned = (w: World<undefined>, s: number): World<undefined> => hold(w, JOINED, Math.max(0, ticksFor(s) - w.tick))

describe.skipIf(terrain === null)('A2 tuning (F10A C4), measured 2026-10-17', () => {
  it('no auto-complete: with nobody attacking, no Japanese hull is hurt, the screen is bled first, Casablanca is untouched for nine minutes and the window closes on its own timer', () => {
    let w = a2()
    const hp0 = Object.fromEntries(w.ships.map((s) => [s.id, w.combat.ships[s.id]!.hp]))
    w = hold(w, levelAt({ x: 60000, z: 60000 }, 3000, 120, 90), ticksFor(570))
    for (const id of ENEMY) expect(w.combat.ships[id]!.hp, id).toBe(hp0[id])
    expect(w.combat.ships.casablanca!.hp).toBe(hp0.casablanca)
    expect(SCREEN.some((s) => w.combat.ships[s]!.hp < hp0[s]!)).toBe(true) // the fire is real: the screen takes it first
    expect(progressOf(w, 'hit').status).toBe('inactive')
    expect(progressOf(w, 'shield').status).toBe('complete') // closed by `until at 540`, with Casablanca afloat
  }, 120_000)
})

describe.skipIf(terrain === null)('A2 headless sortie (F10A C5)', () => {
  it('success: join, a Mogami at 202 of 420 (one Mk 13 and its flood), Casablanca afloat, a trap earns the badge and latches the script', () => {
    let w = pinned(a2(), 160)
    expect(progressOf(w, 'join').status).toBe('complete')
    expect(progressOf(w, 'hit').status).toBe('active')
    w = advance(hullAt(w, 'mogami', 420 - 217.6), DT).world
    expect(progressOf(w, 'hit').status).toBe('complete')
    expect(w.combat.ships.mogami!.hp).toBeGreaterThan(0)
    w = carrierApproach(w, 'casablanca')
    expect(playerAircraft(w).impact).toBeNull()
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'success', badge: { id: 'taffy-3', name: 'Taffy 3' }, reasons: [] })
    expect(w.mission!.latched).toBe(true) // Decision 13
  }, 180_000)

  it('the threshold: a Mogami at 250 (a near miss, strafing) does not read; Yamato reads only below 660 of 1,200', () => {
    let w = pinned(a2(), 160)
    w = advance(hullAt(w, 'mogami', 250), DT).world
    expect(progressOf(w, 'hit').status).toBe('active')
    w = advance(hullAt(w, 'yamato', 700), DT).world
    expect(progressOf(w, 'hit').status).toBe('active')
    w = advance(hullAt(w, 'yamato', 640), DT).world
    expect(progressOf(w, 'hit').status).toBe('complete')
  }, 120_000)

  it('success at a field instead: any friendly base counts, and Tacloban is serviceable in the window A2 is played in', () => {
    let w = pinned(a2(), 160)
    w = advance(hullAt(w, 'mogami', 100), DT).world
    expect(w.airfields.find((f) => f.id === 'tacloban')!.serviceable).not.toBe(false)
    w = fieldApproach(w, 'tacloban')
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'success', reasons: [] })
  }, 180_000)

  it('secondary: a destroyer below half hull reads, and sinking one reads too (a Mk 13 does 217 against Kagero\'s 180)', () => {
    let w = pinned(a2(), 160)
    expect(progressOf(w, 'destroyer').status).toBe('active')
    w = advance(hullAt(w, 'kagero', 89), DT).world
    expect(progressOf(w, 'destroyer').status).toBe('complete')
    let v = pinned(a2(), 160)
    v = advance(destroyNow(v, ['shiratsuyu']), DT).world
    expect(progressOf(v, 'destroyer').status).toBe('complete')
  }, 120_000)

  it('failure: Casablanca sunk fails the objective by name; a landing at Tacloban, with the hit made, still earns no badge', () => {
    let w = pinned(a2(), 160)
    w = advance(destroyNow(hullAt(w, 'mogami', 100), ['casablanca']), DT).world
    expect(progressOf(w, 'shield').status).toBe('failed')
    w = fieldApproach(w, 'tacloban')
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'no-badge', badge: null, reasons: ['Keep Casablanca afloat: failed'] })
    expect(w.mission!.latched).toBeUndefined()
  }, 180_000)

  it('edge: a trap before the hit earns nothing, and the script keeps running', () => {
    let w = pinned(a2(), 160)
    w = carrierApproach(w, 'casablanca')
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out.result).toBe('no-badge')
    expect(out.reasons).toEqual(['Damage Yamato or Mogami: incomplete', 'Land at any friendly base: incomplete'])
    expect(w.mission!.latched).toBeUndefined()
  }, 180_000)
})

describe('A2 opening scene (F10A C7)', () => {
  it('is 15 s (F3 section 6), on this scenario, and ends with the camera behind the player\'s Avenger formation', () => {
    const scene = sceneOf('a2-opening')
    expect(scene).toMatchObject({ chapter: 'A2', kind: 'opening', durationS: 15, world: { scenario: ID } })
    const w = skipScene(worldOf(ID, 'A2', null), scene)
    const p = playerAircraft(w).state.position
    const eye = scene.camera.at(-1)!
    expect(Math.hypot(eye.position[0] - p.x, eye.position[2] - p.z)).toBeLessThan(80)
    expect(scene.cues.filter((c) => c.order.kind === 'message').length).toBeGreaterThanOrEqual(2)
  })
})
