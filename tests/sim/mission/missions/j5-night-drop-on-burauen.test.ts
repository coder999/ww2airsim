/**
 * J5 Night Drop on Burauen (F10D D.4), flown headless over the real terrain. Chapter content: F3 section 4.
 *
 * The player leads two Ki-57s (route-flown, so the AI drop can fire off its own order) with a Ki-43 and an A6M2 escort; four P-38s are held for 100 s.
 * The mission-fit row's invented start (23 km west of the San Pablo strip, over the ridge) is kept and linked. Measured 2026-10-17 with the scripted
 * player below (a kinematic route flown at 80 m/s, doors open inside 5.2 km of the zone, the stick released 150 m short of the strip's centre; the AI real):
 * the drop is at 284 s, the player's six men come down 40 to 230 m short of the centre and the AI's within 450 m, every rig inside the 900 m zone, all
 * three transports and 4 of 6 bundles count.
 * Ruling (recorded in the handoff): the AI Ki-57s fly their own route and drop on their own order; they cannot be slot wingmen of the player
 * (`leader` excludes `ingress` in the scenario schema). The AI's safety floor (300 m above the ground plus a buffer) puts every AI drop about 400 m up,
 * and the corridor is built around that (D.2).
 */
import { describe, expect, it } from 'vitest'
import chapters from '../../../../content/campaign/chapters.json'
import table from '../../../../content/campaign/mission-fit.json'
import { loadScenarioBundle, loadSite } from '../../../../tools/content/load.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import { windowsForChapter } from '../../../../src/campaign/worldStates.js'
import { advance, playerAircraft, requestDrop, withAircraftState, withControls, type World } from '../../../../src/sim/loop.js'
import { DT } from '../../../../src/sim/flight/model.js'
import { createState } from '../../../../src/sim/flight/state.js'
import { v3 } from '../../../../src/sim/math/vec3.js'
import { sideOf } from '../../../../src/sim/sides.js'
import { CARGO_DROP } from '../../../../src/sim/bailout.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { ticksFor } from '../../../../src/sim/mission/state.js'
import { fitOf, linkProblem, type FilledRow } from '../../../../tools/sites/missionFit.js'
import { MAX_BUNDLES, MAX_MEN } from '../../../../src/render/scene/parachutist.js'
import { destroyNow, headingAttitude, terrainOrSkip } from '../fly.js'
import { progressOf } from '../fixture.js'

const ID = 'j5-night-drop-on-burauen'
const terrain = terrainOrSkip()
const bundle = loadScenarioBundle(ID, windowsForChapter('J5'))
const scenario = bundle.scenario
const build = (): World<undefined> => worldFromScenario(bundle, terrain, 'clean')
const obj = (id: string) => scenario.objectives!.find((o) => o.id === id)!
const ZONE = (obj('drop-player') as { zone: { point: { x: number; z: number }; radiusM: number } }).zone
const GATE = (obj('gate') as { point: { x: number; z: number } }).point
const EGRESS = (obj('egress') as { point: { x: number; z: number } }).point
/** The track: San Pablo's strip heading, 80 degrees (the scenario is built along it). */
const U = { x: Math.sin((80 * Math.PI) / 180), z: -Math.cos((80 * Math.PI) / 180) }
const along = (m: number) => ({ x: ZONE.point.x + U.x * m, z: ZONE.point.z + U.z * m })
const LEGS = [{ ...GATE, alt: 900 }, { ...along(-700), alt: 500 }, { ...along(3000), alt: 500 }, { ...EGRESS, alt: 900 }]
const DROP_AT = along(-150)

const hdgTo = (f: { x: number; z: number }, t: { x: number; z: number }) => (Math.atan2(t.x - f.x, -(t.z - f.z)) * 180) / Math.PI
/** The scripted pilot, a kinematic stand-in (it cannot jink, so unless a test asks otherwise its airframe is restored every tick: these tests are about the
 *  chapter's objectives; the FINDING test flies it mortal). */
type Run = { w: World<undefined>; leg: number; dropped: boolean }
type Opts = { readonly mortal?: boolean; readonly dropNearZone?: boolean; readonly doorsOpen?: boolean; readonly altBiasM?: number; readonly stopAtTick?: number; readonly stop?: (w: World<undefined>) => boolean }
const LAUNCH_DAMAGE = build().combat.aircraft['topsy-1']!.damage
function fly(run: Run, o: Opts = {}): Run {
  let { w, leg, dropped } = run
  const end = o.stopAtTick ?? ticksFor(700)
  while (w.tick < end && !(o.stop?.(w) ?? false)) {
    const me = playerAircraft(w).state.position
    if (Math.hypot(LEGS[leg]!.x - me.x, LEGS[leg]!.z - me.z) < 400 && leg < LEGS.length - 1) leg++
    const t = LEGS[leg]!
    const hd = hdgTo(me, t), hr = (hd * Math.PI) / 180
    const alt = t.alt + (leg >= 1 && leg <= 2 ? o.altBiasM ?? 0 : 0)
    const vy = Math.max(-10, Math.min(10, 0.3 * (alt - me.y)))
    const vh = Math.sqrt(80 * 80 - vy * vy)
    const nearZone = Math.hypot(LEGS[2]!.x - me.x, LEGS[2]!.z - me.z) < 5200 && leg >= 1
    const st = createState({ position: v3(me.x, me.y, me.z), velocity: v3(Math.sin(hr) * vh, vy, -Math.cos(hr) * vh), attitude: headingAttitude(hd), gearFraction: 0, flapFraction: 0, bayDoorFraction: nearZone && o.doorsOpen !== false ? 1 : 0, tick: w.tick })
    w = withAircraftState(w, w.player, st)
    if (!dropped && o.dropNearZone !== false && leg >= 1 && Math.hypot(DROP_AT.x - me.x, DROP_AT.z - me.z) < 120) { const r = requestDrop(w, w.player); if (r.ok) { w = r.world; dropped = true } }
    w = advance(withControls(w, w.player, { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 }), DT).world
    if (o.mortal !== true) w = { ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, 'topsy-1': { ...w.combat.aircraft['topsy-1']!, damage: LAUNCH_DAMAGE } } } }
  }
  return { w, leg, dropped }
}
const start = (): Run => ({ w: build(), leg: 0, dropped: false })
const status = (w: World<undefined>, ids: readonly string[]) => ids.map((id) => progressOf(w, id).status)
const PRIMARIES = ['gate', 'corridor', 'drop-player', 'drop-ai', 'egress']

describe('J5 content (F3 section 4)', () => {
  it('three Ki-57-IIs (the player and two route-flown), a Ki-43 and an A6M2 escort on the player, four held P-38s: nine aircraft, no ships', () => {
    const w = build()
    expect(playerAircraft(w).spec.id).toBe('ki-57-ii-topsy')
    expect(sideOf(w, playerAircraft(w))).toBe('axis')
    expect(w.aircraft.map((a) => [a.id, a.spec.id])).toEqual([
      ['topsy-1', 'ki-57-ii-topsy'], ['topsy-2', 'ki-57-ii-topsy'], ['topsy-3', 'ki-57-ii-topsy'], ['oscar-1', 'ki-43-oscar'], ['zero-1', 'a6m2-zero'],
    ])
    const p38 = scenario.heldGroups!.find((g) => g.id === 'intercept')!.aircraft!
    expect(p38.map((a) => [a.spec, a.side])).toEqual(Array(4).fill(['p-38-lightning', 'allied']))
    expect(scenario.population).toEqual({ airborne: 9, ships: 0 })
    expect(w.ships).toHaveLength(0)
    for (const id of ['oscar-1', 'zero-1']) expect(w.aircraft.find((a) => a.id === id)!.pilot!.formation!.leader).toBe('topsy-1')
  })
  it('the badge graph: the gate, the corridor dwell, the player\'s drop, a second transport\'s drop, then the western gate; the secondaries are all three and the bundles', () => {
    expect(scenario.objectives!.map((o) => [o.id, o.kind, o.priority, o.after ?? null])).toEqual([
      ['gate', 'reach', 'primary', null], ['corridor', 'state', 'primary', 'gate'], ['drop-player', 'drop', 'primary', 'corridor'], ['drop-ai', 'drop', 'primary', 'drop-player'],
      ['egress', 'reach', 'primary', 'drop-ai'], ['all-drop', 'drop', 'secondary', null], ['bundles', 'bundles', 'secondary', null],
    ])
    expect(obj('corridor')).toMatchObject({ dwellS: 20, failOnExit: true })
    expect(obj('bundles')).toMatchObject({ min: 4 })
    expect(scenario.recovery).toEqual({ kind: 'egress', objective: 'egress' })
  })
  it('one corridor, written four times, is the same corridor: the dwell test, both primary drops and the secondary', () => {
    const c = obj('corridor') as unknown as { airspeedMps: unknown; altitudeM: unknown; headingDeg: unknown }
    const same = { airspeedMps: c.airspeedMps, altitudeM: c.altitudeM, headingDeg: c.headingDeg }
    for (const id of ['drop-player', 'drop-ai', 'all-drop']) expect((obj(id) as unknown as { corridor: unknown }).corridor, id).toEqual(same)
  })
  it('the AI transports fly the corridor: their drop altitude is inside it, their drop point is inside the zone, and they leave by the same western gate', () => {
    const corridor = obj('corridor') as unknown as { altitudeM: [number, number]; headingDeg: [number, number] }
    for (const id of ['topsy-2', 'topsy-3']) {
      const o = scenario.aircraft.find((a) => a.id === id)!.pilot!.ingress!
      const dropAlt = o.route[1]!.altitudeM
      expect(dropAlt, id).toBeGreaterThanOrEqual(corridor.altitudeM[0]); expect(dropAlt, id).toBeLessThanOrEqual(corridor.altitudeM[1])
      expect(Math.hypot(o.dropAt!.x - ZONE.point.x, o.dropAt!.z - ZONE.point.z), id).toBeLessThan(ZONE.radiusM)
      expect(o.attack).toBe('airdrop')
    }
    expect(80).toBeGreaterThanOrEqual(corridor.headingDeg[0]); expect(80).toBeLessThanOrEqual(corridor.headingDeg[1]) // the strip's heading
  })
  it('the three sticks fit the pooled view (18 rigs, 6 bundles against 24 and 8), as F3 section 4 says', () => {
    expect(3 * CARGO_DROP.men).toBe(18)
    expect(3 * CARGO_DROP.bundles).toBe(6)
    expect(3 * CARGO_DROP.men).toBeLessThanOrEqual(MAX_MEN)
    expect(3 * CARGO_DROP.bundles).toBeLessThanOrEqual(MAX_BUNDLES)
  })
  it('a night mission at 1830 in the endgame window, with the field\'s own ten signal pots as the marked area', () => {
    expect(scenario.weather.timeOfDay).toBe(18.5)
    expect(windowsForChapter('J5')).toMatchObject({ 'san-pablo': 'endgame' })
    expect(scenario.lights!.filter((l) => l.kind === 'pot').length).toBeGreaterThanOrEqual(10)
    expect(chapters.chapters.find((c) => c.id === 'J5')).toMatchObject({ aircraft: 'Mitsubishi Ki-57 “Topsy”', minRank: 'Kaigun Taii' })
  })
  it('is honest: a historical composite, the drop inspired by Operation Te-Go, each rig a squad, sources with a year or URL', () => {
    expect(scenario.history!.text).toMatch(/inspired by/)
    expect(scenario.history!.text).toMatch(/squad/)
    expect(scenario.briefing!.situation).toMatch(/no field to land at/)
  })
  it('its mission-fit row is linked to this scenario and starts where it does (the row\'s invented start is kept)', () => {
    const row = (table.rows as unknown as FilledRow[]).find((r) => r.id === 'J5')!
    expect(row.scenario).toBe(ID)
    const sites = { 'san-pablo': loadSite('san-pablo') }
    const p = playerAircraft(build()).state.position
    expect(linkProblem(row, sites, { x: p.x, z: p.z })).toBeNull()
    expect(fitOf(row, sites).flightM).toBeGreaterThan(1000)
  })
  it('refuses the drop until the doors are fully open, and a fighter has none (the key\'s refusals, on this world)', () => {
    const w = build()
    expect(requestDrop(w, 'topsy-1')).toMatchObject({ ok: false, reason: 'doors-shut' })
    expect(requestDrop(w, 'oscar-1')).toMatchObject({ ok: false, reason: 'no-cargo' })
  })
})

describe.skipIf(terrain === null)('J5, headless over the real terrain', () => {
  it('no auto-complete: with the player held far to the west the whole flight, the AI transports drop and the secondaries may move, but no primary does', () => {
    let w = build()
    const far = { x: -90000, z: -16000 }
    for (let i = 0; i < ticksFor(340); i++) {
      const st = createState({ position: v3(i === 0 ? far.x : playerAircraft(w).state.position.x, 1500, i === 0 ? far.z : playerAircraft(w).state.position.z), velocity: v3(0, 0, 0), attitude: headingAttitude(80), tick: w.tick })
      w = withAircraftState(w, w.player, st)
      w = advance(w, DT).world
      w = { ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, 'topsy-1': { ...w.combat.aircraft['topsy-1']!, damage: LAUNCH_DAMAGE } } } }
    }
    expect(status(w, PRIMARIES)).toEqual(['active', 'inactive', 'inactive', 'inactive', 'inactive'])
    expect((w.parachutists ?? []).filter((p) => p.sourceAircraft === 'topsy-2' && p.kind === 'trooper'), 'the AI really did drop').toHaveLength(CARGO_DROP.men)
    expect(recoveryOf(w)).toBeNull()
  }, 120_000)

  it('success: the gate, 20 s in the corridor, the player\'s drop and a second transport\'s, the western gate: badge; all three transports and the bundles count', () => {
    const r = fly(start(), { stop: (w) => progressOf(w, 'egress').status === 'complete' })
    const w = r.w
    expect(status(w, PRIMARIES)).toEqual(Array(5).fill('complete'))
    expect(recoveryOf(w)).toEqual({ kind: 'egressed' })
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'success', badge: { id: 'night-drop-on-burauen' }, reasons: [] })
    expect(status(w, ['all-drop', 'bundles'])).toEqual(['complete', 'complete'])
    const rigs = w.parachutists ?? []
    expect(rigs.filter((p) => p.kind === 'trooper')).toHaveLength(3 * CARGO_DROP.men)
    expect(rigs.filter((p) => p.kind === 'bundle')).toHaveLength(3 * CARGO_DROP.bundles)
    // The pooled view bound: no more than it can draw.
    expect(rigs.filter((p) => p.kind === 'trooper').length).toBeLessThanOrEqual(MAX_MEN)
    expect(rigs.filter((p) => p.kind === 'bundle').length).toBeLessThanOrEqual(MAX_BUNDLES)
    // Every rig the mission counted is inside the zone.
    for (const p of rigs.filter((q) => q.state.phase === 'down')) expect(Math.hypot(p.state.position.x - ZONE.point.x, p.state.position.z - ZONE.point.z)).toBeLessThan(ZONE.radiusM)
  }, 180_000)

  it('the corridor fails when a begun dwell breaks: climbing out of it kills the badge path, and the drop never wakes', () => {
    let r = fly(start(), { stop: (w) => progressOf(w, 'corridor').status === 'active' && progressOf(w, 'corridor').heldTicks > ticksFor(5) })
    expect(progressOf(r.w, 'corridor').status).toBe('active')
    r = fly(r, { altBiasM: 300, stopAtTick: r.w.tick + ticksFor(25), dropNearZone: false })
    expect(progressOf(r.w, 'corridor').status).toBe('failed')
    expect(status(r.w, ['drop-player', 'drop-ai', 'egress'])).toEqual(['inactive', 'inactive', 'inactive'])
  }, 180_000)

  it('a drop from above the corridor does not count, however well the men land: the objective stays active, no badge', () => {
    // In the corridor for the dwell (so the objective wakes), then 150 m higher for the release itself.
    let r = fly(start(), { stop: (w) => progressOf(w, 'corridor').status === 'complete' })
    r = fly(r, { altBiasM: 150, stopAtTick: r.w.tick + ticksFor(40) })
    expect(r.dropped).toBe(true)
    const men = (r.w.parachutists ?? []).filter((p) => p.sourceAircraft === 'topsy-1' && p.kind === 'trooper')
    expect(men[0]!.release!.altitudeM).toBeGreaterThan((obj('corridor') as unknown as { altitudeM: [number, number] }).altitudeM[1])
    r = fly(r, { altBiasM: 150, stopAtTick: r.w.tick + ticksFor(160), dropNearZone: false })
    expect(men.length).toBe(CARGO_DROP.men)
    expect(progressOf(r.w, 'drop-player').status).toBe('active')
    expect(progressOf(r.w, 'drop-player').count).toBe(0)
    expect(progressOf(r.w, 'egress').status).toBe('inactive')
  }, 180_000)

  it('no cargo doors, no drop: a pilot who never opens them has nothing to release, and the primary stays open', () => {
    const r = fly(start(), { doorsOpen: false, stopAtTick: ticksFor(330) })
    expect(r.dropped).toBe(false)
    expect((r.w.parachutists ?? []).filter((p) => p.sourceAircraft === 'topsy-1')).toHaveLength(0)
    expect(progressOf(r.w, 'drop-player').status).toBe('active')
  }, 180_000)

  it('drop, then death: the drop stays done (the men are on the ground), the death is the verdict: killed, no badge', () => {
    let r = fly(start(), { stop: (w) => progressOf(w, 'drop-player').status === 'complete' })
    expect(progressOf(r.w, 'drop-player').status).toBe('complete')
    const rigsBefore = (r.w.parachutists ?? []).length
    let w = destroyNow(r.w, ['topsy-1'], 'p38-0')
    for (let i = 0; i < 30; i++) w = advance(w, DT).world
    expect(progressOf(w, 'drop-player').status).toBe('complete')
    expect((w.parachutists ?? []).length).toBe(rigsBefore)
    expect(recoveryOf(w)).toEqual({ kind: 'killed' })
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'no-badge', badge: null })
    r = { ...r, w }
  }, 180_000)

  it('a second transport that is shot down before the zone does not count, and the player cannot finish the badge path without it', () => {
    let r = fly(start(), { stop: (w) => w.tick >= ticksFor(150) })
    r = { ...r, w: destroyNow(r.w, ['topsy-2', 'topsy-3'], 'p38-0') }
    r = fly(r, { stop: (w) => progressOf(w, 'drop-player').status === 'complete' })
    r = fly(r, { stopAtTick: r.w.tick + ticksFor(60) })
    expect(progressOf(r.w, 'drop-player').status).toBe('complete')
    expect(progressOf(r.w, 'drop-ai').status).toBe('active')
    expect(progressOf(r.w, 'egress').status).toBe('inactive')
  }, 180_000)
})
