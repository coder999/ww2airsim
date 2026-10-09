import { describe, it, expect } from 'vitest'
import { loadAirfield } from '../../../tools/content/load.js'
import { deckParkSpots, runwayParkSpots, PARK_TRAP_CLEARANCE_M } from '../../../src/sim/ai/parkSpots.js'
import { insideRect, localToWorld } from '../../../src/sim/world/airfields.js'
import { deckFor, span } from './parkSpotFixtures.js'

describe('deck park (7g spec §3)', () => {
  it.each(['essex-cv', 'casablanca-cve', 'zuikaku-cv'])('%s: every spot is on the deck, forward of the trap zone, and no two overlap', (shipId) => {
    const deck = deckFor(shipId)
    const spots = deckParkSpots(deck, span)
    expect(spots.length).toBeGreaterThanOrEqual(2)
    const trapForwardEdge = -deck.lengthM / 2 + deck.trapToSternM
    for (const s of spots) {
      expect(Math.abs(s.x) + span / 2).toBeLessThanOrEqual(deck.widthM / 2)
      expect(s.z).toBeLessThanOrEqual(deck.lengthM / 2 - span / 2)
      expect(s.z - span / 2).toBeGreaterThanOrEqual(trapForwardEdge + PARK_TRAP_CLEARANCE_M)
    }
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
      expect(Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.z - spots[j]!.z)).toBeGreaterThanOrEqual(span)
    }
  })
  it('fills from the bow: the first spot is the most forward', () => {
    const spots = deckParkSpots(deckFor('essex-cv'), span)
    expect(spots[0]!.z).toBe(Math.max(...spots.map((s) => s.z)))
  })
})

describe('runway park (7g spec §3, §7)', () => {
  it('Tacloban: every spot is off the runway, on the apron side, and outside every building', () => {
    const a = loadAirfield('tacloban')
    const spots = runwayParkSpots(a, span)
    expect(spots.length).toBeGreaterThanOrEqual(2)
    for (const s of spots) {
      expect(Math.abs(s.x) - span / 2).toBeGreaterThan(a.runway.widthM / 2)
      expect(Math.sign(s.x)).toBe(Math.sign(a.apron!.x))
      const w = localToWorld(a, s.x, s.z)
      for (const b of a.buildings) expect(insideRect(a, b, w.x, w.z), `spot in ${b.id}`).toBe(false)
    }
  })
  it('an airfield with no apron parks on local -x', () => {
    const a = { ...loadAirfield('dulag'), apron: null }
    for (const s of runwayParkSpots(a, span)) expect(s.x).toBeLessThan(0)
  })
})
