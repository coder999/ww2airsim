import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadShipSpec } from '../../../tools/content/load.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import {
  AA_TUNING, aaOwnersOf, aaTargetsOf, flakBlastHp, initialAa, mountsOf, stepAa, takeDueBursts,
  type AaOwner, type AaTarget,
} from '../../../src/sim/weapons/aaFire.js'

/**
 * M2: the AA director on its own, without `stepCombat`. Calibration (how lethal it is) is
 * aaLethality.test.ts; the wiring into combat, credit and cost is aaCombat.test.ts.
 */
const SHIPS = readdirSync('content/ships').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()

describe('every shipped ship, flattened to AA mounts (enrolled from content/ships)', () => {
  it('covers all twelve classes (a filter matching nothing must fail, not pass empty)', () => {
    expect(SHIPS).toHaveLength(12)
  })
  it.each(SHIPS)('%s: a merchant has no armament, a warship has heavy or light mounts that match its armament', (id) => {
    const spec = loadShipSpec(id)
    if (spec.armament === undefined) {
      expect(spec.role).toBe('merchant')
      return
    }
    const { mounts, reachM } = mountsOf(spec.armament)
    const a = spec.armament
    expect(mounts.filter((m) => m.tier === 'light')).toHaveLength(a.lightAA.length)
    expect(mounts.filter((m) => m.tier === 'heavy')).toHaveLength(a.heavyAA.length + a.turrets.filter((t) => t.aa === 'heavy').length)
    expect(mounts.length).toBeGreaterThan(0)
    // The reach is the longest any mount has, so the early-out cannot skip a mount that could fire.
    const heavy = mounts.some((m) => m.tier === 'heavy')
    expect(reachM).toBe(heavy ? AA_TUNING.heavy.maxRangeM : Math.max(...mounts.map((m) => AA_TUNING.light[m.caliber].rangeM)))
    // A kit names its caliber; an unreadable one falls back, never to nothing.
    for (const m of mounts) expect(['20mm', '25mm', '40mm']).toContain(m.caliber)
  })
  it('reads the caliber off the kit: the Fletcher has 20 mm and 40 mm, the Kagero 25 mm', () => {
    const cal = (id: string): string[] => [...new Set(mountsOf(loadShipSpec(id).armament!).mounts.filter((m) => m.tier === 'light').map((m) => m.caliber))].sort()
    expect(cal('fletcher-dd')).toEqual(['20mm', '40mm'])
    expect(cal('kagero-dd')).toEqual(['25mm'])
  })
})

const owner = (side: 'allied' | 'axis', at = v3(0, 0, 0)): AaOwner => ({
  id: 'dd', side, mounts: mountsOf(loadShipSpec('fletcher-dd').armament!), position: at, previous: at, headingRad: 0,
})
const plane = (id: string, side: 'allied' | 'axis', at: ReturnType<typeof v3>, velocity = v3(100, 0, 0)): AaTarget =>
  ({ id, side, position: at, velocity, accel: v3(0, 0, 0) })
const DT = 1 / 60
/** Steps the director for `seconds` of an unmoving target and collects what it fired. */
function fire(o: AaOwner, targets: AaTarget[], seconds = 12) {
  let aa = initialAa(7), rounds = 0, bursts = 0
  for (let tick = 1; tick <= seconds * 60; tick++) {
    const out = stepAa(aa, [o], targets, tick, DT, 0)
    rounds += out.rounds.length
    aa = out.aa
    const taken = takeDueBursts(aa, tick)
    bursts += taken.due.length
    aa = taken.aa
  }
  return { aa, rounds, bursts }
}

describe('stepAa: who shoots at what', () => {
  const near = plane('p', 'allied', v3(600, 150, 0))
  it('an axis ship fires light rounds and flak at an allied airplane in range', () => {
    const r = fire(owner('axis'), [near])
    expect(r.rounds).toBeGreaterThan(50)
    expect(r.bursts).toBeGreaterThan(0)
  })
  it('never fires at its own side', () => {
    const r = fire(owner('axis'), [plane('mate', 'axis', v3(600, 150, 0))])
    expect(r.rounds + r.bursts).toBe(0)
  })
  it('a quiet world returns the very same state object (bit-identical, nothing allocated)', () => {
    const aa = initialAa(7)
    expect(stepAa(aa, [owner('axis')], [], 1, DT, 0).aa).toBe(aa)
    expect(stepAa(aa, [], [near], 1, DT, 0).aa).toBe(aa)
    // Out of every mount's reach.
    expect(stepAa(aa, [owner('axis')], [plane('far', 'allied', v3(20_000, 150, 0))], 1, DT, 0).aa).toBe(aa)
  })
  it('light guns reach less far than heavy: at 3 km only flak, at 800 m both', () => {
    const far = fire(owner('axis'), [plane('p', 'allied', v3(3000, 600, 0))])
    expect(far.rounds).toBe(0)
    expect(far.bursts).toBeGreaterThan(0)
    expect(fire(owner('axis'), [near]).rounds).toBeGreaterThan(0)
  })
  it('heavy guns have a minimum range: an airplane 300 m away draws only light fire', () => {
    const close = fire(owner('axis'), [plane('p', 'allied', v3(300, 100, 0))])
    expect(close.rounds).toBeGreaterThan(0)
    expect(close.bursts).toBe(0)
  })
  it('is deterministic, and the seed changes the luck', () => {
    const a = fire(owner('axis'), [near]), b = fire(owner('axis'), [near])
    expect(b.aa).toEqual(a.aa)
    let other = initialAa(8)
    const first = stepAa(initialAa(7), [owner('axis')], [near], 1, DT, 0)
    other = stepAa(other, [owner('axis')], [near], 1, DT, 0).aa
    expect(other.seed).not.toBe(first.aa.seed)
  })
  it('stops at the live-round cap', () => {
    let aa = initialAa(7), rounds = 0
    for (let tick = 1; tick <= 600; tick++) {
      const out = stepAa(aa, [owner('axis')], [near], tick, DT, AA_TUNING.maxLiveRounds)
      rounds += out.rounds.length
      aa = out.aa
    }
    expect(rounds).toBe(0)
  })
  it('a light round leaves the muzzle aimed at the airplane, led and raised for drop', () => {
    // A target crossing at 100 m/s, 600 m away: the first rounds point ahead of where it is now.
    let aa = initialAa(7)
    const rounds = []
    for (let tick = 1; tick <= 200 && rounds.length < 4; tick++) {
      const out = stepAa(aa, [owner('axis')], [plane('p', 'allied', v3(0, 120, -600), v3(100, 0, 0))], tick, DT, 0)
      rounds.push(...out.rounds)
      aa = out.aa
    }
    expect(rounds.length).toBeGreaterThan(0)
    // Ranging is wide (aim error), but on average the rounds are led toward +x (the target flies +x).
    const mean = rounds.reduce((s, r) => s + r.velocity.x, 0) / rounds.length
    expect(mean).toBeGreaterThan(0)
  })
})

describe('which airplanes can be shot at', () => {
  const at = { position: v3(0, 100, 0) }
  const craft = (id: string, speed: number, impact: unknown = null) => ({
    id, impact, state: { ...at, velocity: v3(speed, 0, 0) }, previous: { velocity: v3(speed, 0, 0) },
  })
  it('only airborne (fast), unburnt, uncrashed ones, with a side', () => {
    const sides = { fast: 'allied', slow: 'allied', hit: 'allied', doomed: 'allied' } as const
    const t = aaTargetsOf([craft('fast', 100), craft('slow', 5), craft('hit', 100, {}), craft('doomed', 100), craft('nobody', 100)], DT, sides, (id) => id === 'doomed')
    expect(t.map((x) => x.id)).toEqual(['fast'])
  })
  it('a ship or battery needs a side, a gun and to be standing', () => {
    const ship = (id: string, armed: boolean) => ({ id, spec: { armament: armed ? loadShipSpec('fletcher-dd').armament! : undefined }, state: { position: v3(0, 0, 0), headingRad: 0 }, previous: { position: v3(0, 0, 0) } })
    const structures = [{ id: 'aaa-1', kind: 'aaa', position: v3(0, 5, 0) }, { id: 'hangar-1', kind: 'hangar', position: v3(0, 5, 0) }, { id: 'aaa-dead', kind: 'aaa', position: v3(0, 5, 0) }]
    const owners = aaOwnersOf(
      [ship('dd', true), ship('maru', false), ship('sunk', true), ship('stateless', true)], structures,
      { dd: 'axis', maru: 'axis', sunk: 'axis' }, { 'aaa-1': 'axis', 'hangar-1': 'axis', 'aaa-dead': 'axis' },
      (id) => id === 'sunk', (id) => id === 'aaa-dead',
    )
    expect(owners.map((o) => o.id)).toEqual(['dd', 'aaa-1'])
  })
})

describe('flak damage falls off with distance from the burst', () => {
  it('is the peak at the centre, zero at the radius, and nothing beyond', () => {
    expect(flakBlastHp(0)).toBe(AA_TUNING.heavy.burstPeakHp)
    expect(flakBlastHp(AA_TUNING.heavy.burstRadiusM / 2)).toBeCloseTo(AA_TUNING.heavy.burstPeakHp / 2, 9)
    expect(flakBlastHp(AA_TUNING.heavy.burstRadiusM)).toBeNull()
    expect(flakBlastHp(1e6)).toBeNull()
  })
})
