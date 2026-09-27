import { describe, expect, it } from 'vitest'
import { missionDebrief } from '../../../src/render/mission/debriefMission.js'
import { deckOf, deckWorld } from '../../../src/sim/world/deck.js'
import type { Impact, World } from '../../../src/sim/loop.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import {
  destroyAircraft, destroyShip, landOnce, missionWorld, steps,
} from '../../sim/mission/fixture.js'

const RECOVER = { id: 'home', label: 'Recover', priority: 'primary', kind: 'land', at: 'cv-1' }
const CQ_BADGE = { id: 'cq', name: 'Carrier Qualified' }

/** Sets the player's `impact` directly, bypassing physics -- the same
 *  direct-mutation style `fixture.ts`'s own `destroyShip`/`destroyAircraft`
 *  use, for a pure test that only cares what `recoveryOf` reads off it. */
function withImpact<M>(w: World<M>, kind: 'ditched' | 'destroyed'): World<M> {
  const impact: Impact = { tick: w.tick, position: v3(0, 0, 0), verticalSpeedMps: -2, groundHeightM: 0, surface: 'water', kind }
  return { ...w, aircraft: w.aircraft.map((a) => (a.id === w.player ? { ...a, impact } : a)) }
}

/** Lands the player once, aboard `cv-1` -- same construction as
 *  `tests/sim/mission/objectives.test.ts`'s TRAPS case. */
function landOnCarrier<M>(w: World<M>): World<M> {
  const deck = deckOf(w.ships.find((s) => s.id === 'cv-1')!)!
  const p = deckWorld(deck, 0, 0)
  return landOnce(w, p.x, deck.center.y, p.z)
}

describe('missionDebrief (M2 R9)', () => {
  it('is null for a world without a mission', () => {
    const w = missionWorld({})
    expect(w.mission).toBeNull()
    expect(missionDebrief(w)).toBeNull()
  })

  it('success: every row stamped, BADGE AWARDED with the name, badge set', () => {
    let w = missionWorld({ objectives: [RECOVER], badge: CQ_BADGE })
    w = landOnCarrier(w)
    const d = missionDebrief(w)!
    expect(d.verdict).toBe('BADGE AWARDED: Carrier Qualified')
    expect(d.more).toEqual([])
    expect(d.badge).toEqual({ id: 'cq', name: 'Carrier Qualified' })
    expect(d.objectives).toEqual([{ label: 'Recover', priority: 'primary', final: 'complete' }])
  })

  it('success without a badge reads MISSION COMPLETE', () => {
    let w = missionWorld({ objectives: [RECOVER] })
    w = landOnCarrier(w)
    const d = missionDebrief(w)!
    expect(d.verdict).toBe('MISSION COMPLETE')
    expect(d.more).toEqual([])
    expect(d.badge).toBeNull()
  })

  it('ditched: "Ditched — no badge", then the incomplete primaries', () => {
    const w = withImpact(missionWorld({ objectives: [RECOVER] }), 'ditched')
    const d = missionDebrief(w)!
    expect(d.verdict).toBe('Ditched — no badge')
    expect(d.more).toEqual(['Recover: incomplete'])
    expect(d.badge).toBeNull()
  })

  it('killed in the air', () => {
    const w = steps(destroyAircraft(missionWorld({ objectives: [RECOVER] }), 'f6f-1'), 1)
    const d = missionDebrief(w)!
    expect(d.verdict).toBe('Killed — no badge')
  })

  it('a failed protect: "<label>: failed — no badge"', () => {
    const PROTECT = { id: 'convoy', label: 'Convoy', priority: 'primary', kind: 'protect', targets: ['convoy'], maxLost: 1 }
    let w = missionWorld({ objectives: [PROTECT, RECOVER] })
    w = steps(destroyShip(w, 'maru-1'), 1)
    w = steps(destroyShip(w, 'maru-2'), 1)
    w = landOnCarrier(w)
    const d = missionDebrief(w)!
    expect(d.verdict).toBe('Convoy: failed — no badge')
  })

  it('secondaries are listed and never gate the badge', () => {
    const SECONDARY = { id: 'range', label: 'Target', priority: 'secondary', kind: 'destroy', targets: ['convoy'] }
    let w = missionWorld({ objectives: [RECOVER, SECONDARY], badge: CQ_BADGE })
    w = landOnCarrier(w)
    const d = missionDebrief(w)!
    expect(d.verdict).toBe('BADGE AWARDED: Carrier Qualified')
    expect(d.objectives).toEqual([
      { label: 'Recover', priority: 'primary', final: 'complete' },
      { label: 'Target', priority: 'secondary', final: 'incomplete' },
    ])
  })
})
