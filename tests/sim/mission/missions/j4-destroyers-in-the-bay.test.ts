/**
 * J4 Destroyers in the Bay (F10D D.3), flown headless. Chapter content: F3 section 4.
 *
 * The B5N2 starts 6.2 km from two Fletchers (the mission-fit row's invented start, kept, and linked to this scenario). A TBM flare ignites 3 s before the
 * mission clock starts and burns 150 s (F3: the B5N begins as the flare opens the window): the flare IS the attack window (the scenario's `release.window`; a test below holds the two equal). Measured 2026-10-17 with the
 * scripted run below (the player pinned and flown at 75 m/s, 60 m up, a lead solved at 1,300 m): the Type 91 runs 62 s to a Fletcher doing 5 m/s,
 * hits, and the hull floods from 51 hp to nothing in about 50 s more.
 * Ruling: the ships do NOT shoot at each other (`mainBatteries` is off), so no AI action can complete or fail a primary and the player cannot win by
 * the AI's own damage; the surface engagement is the opening scene's and the lights'. Recorded as a known gap in the F10D handoff.
 */
import { describe, expect, it } from 'vitest'
import chapters from '../../../../content/campaign/chapters.json'
import table from '../../../../content/campaign/mission-fit.json'
import { loadScenarioBundle } from '../../../../tools/content/load.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import { windowsForChapter } from '../../../../src/campaign/worldStates.js'
import { advance, playerAircraft, withAircraftState, withControls, type World } from '../../../../src/sim/loop.js'
import { DT } from '../../../../src/sim/flight/model.js'
import { createState } from '../../../../src/sim/flight/state.js'
import { v3 } from '../../../../src/sim/math/vec3.js'
import { applyDifficulty, type Difficulty } from '../../../../src/sim/difficulty.js'
import { sideOf } from '../../../../src/sim/sides.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { radioMessages, ticksFor } from '../../../../src/sim/mission/state.js'
import { fitOf, linkProblem, type FilledRow } from '../../../../tools/sites/missionFit.js'
import { loadSite } from '../../../../tools/content/load.js'
import { DITCH, headingAttitude } from '../fly.js'
import { qFromAxisAngle, qMul } from '../../../../src/sim/math/quat.js'
import { SEA_LEVEL_M } from '../../../../src/sim/world/terrain.js'
import { flatField, progressOf } from '../fixture.js'

const ID = 'j4-destroyers-in-the-bay'
const bundle = loadScenarioBundle(ID, windowsForChapter('J4'))
const scenario = bundle.scenario
/** Recruit: the Fletchers' flak takes the scripted straight run apart at Veteran and Ace within 5 s of the release (the FINDING test below), so every
 *  chapter test that needs the player alive flies at Recruit, where the same run survives with 65% structure. Measured 2026-10-17. */
const build = (terrain: ReturnType<typeof flatField> | null = null, difficulty: Difficulty = 'easy'): World<undefined> => applyDifficulty(worldFromScenario(bundle, terrain, 'torpedoes'), difficulty)
const FLARE = scenario.lights!.find((l) => l.id === 'flare-1')!
/** The flare burns from 3 s before the mission clock starts (the opening shows it ignite) for 150 s: the mission window is what is left of that from time 0. */
const WINDOW: readonly [number, number] = [Math.max(0, FLARE.schedule!.onAtS!), FLARE.schedule!.onAtS! + FLARE.schedule!.burnS!]

const vOf = (sh: World<undefined>['ships'][number]) => ({ x: Math.sin(sh.state.headingRad) * sh.state.speedMps, z: -Math.cos(sh.state.headingRad) * sh.state.speedMps })
const hdgTo = (from: { x: number; z: number }, to: { x: number; z: number }) => (Math.atan2(to.x - from.x, -(to.z - from.z)) * 180) / Math.PI
/** The scripted pilot is a kinematic stand-in that cannot jink, so unless a test says otherwise (the FINDING test) its airframe is restored to the launch state
 *  every tick: these tests are about the chapter's objectives, not about whether this straight run survives the flak. */
let mortal = false
const LAUNCH_DAMAGE = build().combat.aircraft['kate-1']!.damage
const healed = (w: World<undefined>): World<undefined> => mortal ? w : { ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, 'kate-1': { ...w.combat.aircraft['kate-1']!, damage: LAUNCH_DAMAGE } } } }
/** The player pinned at `at`, nose to `hdg`, and one production tick. The velocity set IS the motion (the tick integrates it): 0 holds, 75 flies. */
function place(w: World<undefined>, at: { x: number; z: number }, y: number, hdg: number, v: number, drop = false): World<undefined> {
  const h = (hdg * Math.PI) / 180
  const st = createState({ position: v3(at.x, y, at.z), velocity: v3(Math.sin(h) * v, 0, -Math.cos(h) * v), attitude: headingAttitude(hdg), gearFraction: 0, flapFraction: 0, bayDoorFraction: 1, tick: w.tick })
  const pinned = withAircraftState(w, w.player, st)
  return healed(advance(withControls(pinned, pinned.player, { pitch: 0, roll: 0, yaw: 0, throttle: 0.6, ...(drop ? { dropBomb: true } : {}) }), DT).world)
}
const here = (w: World<undefined>) => playerAircraft(w).state.position
const shipAt = (w: World<undefined>, id: string) => w.ships.find((s) => s.id === id)!.state.position
/** Fly at `targetId`, hold at `holdOutM` until `openS`, and stop once inside `releaseM` after it. */
function approach(w0: World<undefined>, targetId: string, holdOutM: number, releaseM: number, openS: number): World<undefined> {
  let w = w0
  for (let guard = 0; guard < 30000; guard++) {
    const f = shipAt(w, targetId), h = here(w)
    const d = Math.hypot(f.x - h.x, f.z - h.z), nowS = w.tick * DT
    if (d <= releaseM && nowS >= openS) return w
    w = place(w, h, Math.max(60, h.y - 0.6), hdgTo(h, f), d <= (nowS >= openS ? releaseM : holdOutM) ? 0 : 75)
  }
  throw new Error(`approach: never arrived at ${targetId}`)
}
/** The release: a lead solved for the Type 91's 21.6 m/s run on the ship's present course and speed. */
function release(w: World<undefined>, targetId: string, speed = 75, altM = 60): World<undefined> {
  const sh = w.ships.find((x) => x.id === targetId)!, vel = vOf(sh), h = here(w)
  let T = 50
  for (let k = 0; k < 10; k++) T = Math.hypot(sh.state.position.x + vel.x * T - h.x, sh.state.position.z + vel.z * T - h.z) / 21.6
  return place(w, h, altM, hdgTo(h, { x: sh.state.position.x + vel.x * T, z: sh.state.position.z + vel.z * T }), speed, true)
}
/** `stageDitch` (fly.ts) at the Kate's own speed: it arrives at 45 m/s, which is over 1.2 x the Kate's 34 m/s clean stall, and a water contact that fast reads as destroyed. */
const KATE_DITCH_MPS = 38
const stageKateDitch = (w: World<undefined>, at: { x: number; z: number }): World<undefined> => withAircraftState(w, w.player, createState({
  position: v3(at.x, SEA_LEVEL_M + DITCH.heightM, at.z), velocity: v3(0, -DITCH.sinkMps, -KATE_DITCH_MPS),
  attitude: qMul(headingAttitude(0), qFromAxisAngle(v3(0, 0, 1), (DITCH.pitchDeg * Math.PI) / 180)), tick: w.tick,
}))
/** After the release the player runs for the western gate (the way out the chapter asks for) and holds short of it, level at 150 m, for `s` seconds. */
const GATE = { x: -85800, z: -12900 }
const loiter = (w0: World<undefined>, s: number): World<undefined> => {
  let w = w0
  for (let i = 0; i < ticksFor(s); i++) {
    const h = here(w), d = Math.hypot(GATE.x - h.x, GATE.z - h.z)
    w = place(w, h, 150, hdgTo(h, GATE), d < 4000 ? 0 : 75)
  }
  return w
}
const attackFletcher = (): World<undefined> => release(approach(build(), 'fletcher-1', 2500, 1300, WINDOW[0] + 2), 'fletcher-1')
const atGate = (w: World<undefined>): World<undefined> => place(place(w, GATE, 300, 270, 75), GATE, 300, 270, 75)

describe('J4 content (F3 section 4)', () => {
  it('a Navy B5N2 on the Japanese side with one torpedo; two allied Fletchers; the Japanese Kagero, Shiratsuyu and the Type B Maru', () => {
    const w = build()
    expect(playerAircraft(w).spec.id).toBe('b5n2-kate')
    expect(sideOf(w, playerAircraft(w))).toBe('axis')
    expect(w.ships.map((s) => [s.id, s.spec.id, s.side])).toEqual([
      ['fletcher-1', 'fletcher-dd', 'allied'], ['fletcher-2', 'fletcher-dd', 'allied'], ['kagero', 'kagero-dd', 'axis'], ['shiratsuyu', 'shiratsuyu-dd', 'axis'], ['maru-1', 'type-b-maru', 'axis'],
    ])
    expect(w.combat.aircraft[w.player]!.stores.bombs, 'one Type 91').toBe(1)
    expect(scenario.aircraft.map((a) => [a.id, a.spec, a.side])).toEqual([['kate-1', 'b5n2-kate', 'axis'], ['zero-cover', 'a6m2-zero', 'axis'], ['tbm-flare', 'tbm-3-avenger', 'allied']])
  })
  it('the badge graph is staging, a valid release, a hit, the transport kept through the window, then the western gate; the secondary sinks the damaged Fletcher', () => {
    expect(scenario.objectives!.map((o) => [o.id, o.kind, o.priority, o.after ?? null])).toEqual([
      ['staging', 'reach', 'primary', null], ['torpedo', 'release', 'primary', 'staging'], ['hit', 'damage', 'primary', 'torpedo'],
      ['maru', 'protect', 'primary', null], ['egress', 'reach', 'primary', 'maru'], ['sink', 'destroy', 'secondary', 'hit'],
    ])
    expect(scenario.recovery).toEqual({ kind: 'egress', objective: 'egress' })
    expect(scenario.population).toEqual({ airborne: 3, ships: 5 })
  })
  it('the attack window IS the flare (an assertion, not a sentence): the release window and the transport\'s protection both run exactly while it burns', () => {
    const o = scenario.objectives!
    expect(o.find((x) => x.id === 'torpedo')).toMatchObject({ withinM: expect.any(Number), window: [...WINDOW] })
    expect(o.find((x) => x.id === 'maru')).toMatchObject({ until: { at: WINDOW[1] } })
    expect(FLARE.schedule!.onAtS, 'ignites before the mission clock starts, so the opening can show it and a flight without one finds it burning').toBeLessThan(0)
    expect(scenario.triggers!.find((t) => t.id === 'flare-dying')!.when).toEqual({ at: WINDOW[1] })
    expect(scenario.lights!.filter((l) => l.kind === 'flare')).toHaveLength(1)
  })
  it('a valid release is inside the Type 91\'s own run range, and the Fletchers\' start is inside it of the player\'s start order of magnitude', () => {
    const torpedo = scenario.objectives!.find((x) => x.id === 'torpedo')
    const type = bundle.aircraftSpecs['b5n2-kate']!.stores!.types['type91']!
    expect(torpedo && 'withinM' in torpedo ? torpedo.withinM : 0).toBeLessThanOrEqual(type.runRangeM!)
  })
  it('a night mission at 2130 on the buildup window, with the port dark (F3 section 8), no torpedosight needed (Chui is below the rank gate)', () => {
    expect(scenario.weather.timeOfDay).toBe(21.5)
    expect(windowsForChapter('J4')).toMatchObject({ ormoc: 'buildup' })
    expect(scenario.lights!.map((l) => l.id), 'the flare is the only light: the Ormoc site adds none in buildup').toEqual(['flare-1'])
    expect(chapters.chapters.find((c) => c.id === 'J4')).toMatchObject({ aircraft: 'B5N2 Kate', minRank: 'Kaigun Chūi' })
  })
  it('is honest: historical composite, the Kate attack and the flare-layer invented, sources with a year or URL', () => {
    expect(scenario.history!.text).toMatch(/inspired by/)
    expect(scenario.history!.text).toMatch(/invented/)
    expect(scenario.briefing!.situation).toMatch(/no field to land at/)
  })
  it('its mission-fit row is linked to this scenario and starts where it does (the row\'s invented start is kept)', () => {
    const row = (table.rows as unknown as FilledRow[]).find((r) => r.id === 'J4')!
    expect(row.scenario).toBe(ID)
    const sites = { ormoc: loadSite('ormoc') }
    const p = here(build())
    expect(linkProblem(row, sites, { x: p.x, z: p.z })).toBeNull()
    expect(fitOf(row, sites).flightM).toBeGreaterThan(1000)
  })
})

describe('J4, headless: no auto-complete', () => {
  it('with the player held far to the west for the whole window and after, nothing but time moves: the transport\'s standing order closes with the window and opens the gate, and no other primary moves', () => {
    let w = build()
    const far = { x: -100000, z: -13000 }
    for (let i = 0; i < ticksFor(WINDOW[1] + 5); i++) w = place(w, i === 0 ? far : here(w), 600, 0, 0)
    expect(['staging', 'torpedo', 'hit', 'egress', 'sink'].map((id) => progressOf(w, id).status)).toEqual(['active', 'inactive', 'inactive', 'active', 'inactive'])
    expect(progressOf(w, 'maru').status).toBe('complete')
    w = place(w, far, 600, 0, 0)
    expect(recoveryOf(w)).toBeNull()
  })
  it('the AI shoots nothing: both Fletchers and the transport are untouched and the Zero and TBM only orbit', () => {
    let w = build()
    for (let i = 0; i < ticksFor(120); i++) w = place(w, i === 0 ? { x: -100000, z: -13000 } : here(w), 600, 0, 0)
    for (const s of w.ships) expect(w.combat.ships[s.id]!.hp, s.id).toBe(s.spec.hullHp)
    expect(w.combat.aircraft['kate-1']!.damage.destroyedAt).toBeNull()
  })
})

describe('J4, headless: the badge path', () => {
  it('success: staged outside the flare, a valid torpedo on a Fletcher inside the window, a hit, the transport kept, the western gate: badge', () => {
    let w = attackFletcher()
    expect(progressOf(w, 'torpedo').status).toBe('complete')
    expect(progressOf(w, 'staging').status).toBe('complete')
    w = loiter(w, 120)
    expect(progressOf(w, 'hit').status).toBe('complete')
    expect(progressOf(w, 'sink').status).toBe('complete')
    expect(progressOf(w, 'maru').status).toBe('complete')
    expect(progressOf(w, 'egress').status).toBe('active')
    w = atGate(w)
    expect(recoveryOf(w)).toEqual({ kind: 'egressed' })
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'success', badge: { id: 'destroyers-in-the-bay' }, reasons: [] })
    expect(radioMessages(w.mission!).map((m) => m.text)).toContain('The flare is dying. Clear the bay to the west.')
  }, 60_000)
  it('the gate before the window closes changes nothing: it opens only after the transport has been kept through the window', () => {
    const w = atGate(attackFletcher())
    expect(recoveryOf(w)).toBeNull()
    expect(progressOf(w, 'egress').status).toBe('inactive')
  }, 60_000)
})

describe('J4, headless: the failures', () => {
  it('a torpedo dropped after the flare has died counts for nothing: the objective had already failed when the window closed, so nothing it does later revives it, and the sortie is no badge', () => {
    // Held in the staging ring (4.5 km from the flare's centre) until 5 s after the window closes, then in for a perfect-looking drop.
    let w = release(approach(build(), 'fletcher-1', 4500, 1300, WINDOW[1] + 5), 'fletcher-1')
    expect(w.tick * DT).toBeGreaterThan(WINDOW[1])
    expect(progressOf(w, 'torpedo').status).toBe('failed')
    w = loiter(w, 130)
    expect(progressOf(w, 'torpedo').status).toBe('failed')
    expect(progressOf(w, 'hit').status).toBe('inactive')
    w = atGate(w)
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'no-badge', badge: null })
  }, 60_000)
  it('a torpedo from outside the range counts for nothing', () => {
    const w = loiter(release(approach(build(), 'fletcher-1', 3600, 3600, WINDOW[0] + 2), 'fletcher-1'), 2)
    expect(progressOf(w, 'torpedo')).toMatchObject({ status: 'active', count: 0 })
  }, 60_000)
  it('a torpedo dropped too fast is a dud even inside the window and the range: not a valid release', () => {
    const w = loiter(release(approach(build(), 'fletcher-1', 2500, 1300, WINDOW[0] + 2), 'fletcher-1', 95), 2)
    expect(progressOf(w, 'torpedo')).toMatchObject({ status: 'active', count: 0 })
  }, 60_000)
  it('a valid release that misses (or never meets a hull) ends the hit objective at 290 s: no badge, announced', () => {
    let w = release(approach(build(), 'fletcher-1', 2500, 1300, WINDOW[0] + 2), 'fletcher-1')
    // A miss: take the torpedo out of the water.
    w = { ...w, combat: { ...w.combat, projectiles: w.combat.projectiles.filter((p) => p.kind !== 'torpedo') } }
    w = loiter(w, 290 - w.tick * DT + 2)
    expect(progressOf(w, 'torpedo').status).toBe('complete')
    expect(progressOf(w, 'hit').status).toBe('failed')
    expect(radioMessages(w.mission!).map((m) => m.text)).toContain('Hit a Fletcher: failed')
  }, 60_000)
  it('torpedoing the transport is friendly fire: it is hurt and the player is discharged; the window rule alone does not call a still-floating hull lost', () => {
    let w = release(approach(build(), 'maru-1', 2500, 1300, WINDOW[0] + 2), 'maru-1')
    w = loiter(w, 130)
    expect(w.combat.ships['maru-1']!.hp).toBeLessThan(bundle.shipSpecs['type-b-maru']!.hullHp)
    expect(w.combat.aircraft['kate-1']!.friendlyFire, 'the first own-side damage discharges the player (friendly-fire spec)').not.toBeNull()
    // Known limit, reported: `protect` reads DESTROYED, and a torpedoed hull floods for minutes, so it can still be afloat when the window closes.
    expect(progressOf(w, 'maru').status).toBe('complete')
  }, 60_000)
  it('a ditching near friendly ships is a normal debrief with no badge, even with every other primary done (the counter-test to the egress rule)', () => {
    const sea = flatField(0)
    let w = release(approach(build(sea), 'fletcher-1', 2500, 1300, WINDOW[0] + 2), 'fletcher-1')
    w = loiter(w, 120)
    expect(['torpedo', 'hit', 'maru'].map((id) => progressOf(w, id).status)).toEqual(['complete', 'complete', 'complete'])
    const kagero = shipAt(w, 'kagero')
    w = stageKateDitch(w, { x: kagero.x, z: kagero.z + 700 }) // 700 m off the Kagero: a hull under the wheels is a collision, not a ditching
    for (let i = 0; i < 600 && playerAircraft(w).impact === null; i++) w = healed(advance(withControls(w, w.player, { pitch: 0, roll: 0, yaw: 0, throttle: 0 }), DT).world)
    expect(playerAircraft(w).impact?.kind).toBe('ditched')
    expect(recoveryOf(w)).toEqual({ kind: 'ditched' })
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'no-badge', badge: null })
    expect(out.reasons).toContain('Ditched')
    expect(progressOf(w, 'egress').status).toBe('active')
  }, 60_000)
})

describe('J4, FINDING (reported, not tuned)', () => {
  it('the Fletchers\' flak at night, under the flare: the scripted straight run survives at Recruit and is shot down within 5 s of the release at Veteran and Ace', () => {
    mortal = true
    const outcome = (d: Difficulty): number | null => {
      let w = release(approach(build(null, d), 'fletcher-1', 2500, 1300, WINDOW[0] + 2), 'fletcher-1')
      w = loiter(w, 10)
      return w.combat.aircraft['kate-1']!.damage.destroyedAt
    }
    try {
      expect(outcome('easy')).toBeNull()
      expect(outcome('normal'), 'if this flips, the flak was retuned: update the F10D handoff').not.toBeNull()
      expect(outcome('hard')).not.toBeNull()
    } finally { mortal = false }
  }, 60_000)
})
