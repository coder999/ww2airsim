import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { loadShipSpec } from '../../../tools/content/load.js'

const roster = {
  'casablanca-cve': 'carrier',
  'cleveland-cl': 'cruiser',
  'essex-cv': 'carrier',
  'fletcher-dd': 'escort',
  'kagero-dd': 'escort',
  'mogami-ca': 'cruiser',
  'pennsylvania-bb': 'battleship',
  'shiratsuyu-dd': 'escort',
  'type-b-maru': 'merchant',
  'yamato-bb': 'battleship',
} as const

describe('the GAMEPLAY.md ship roster is strict content (R2)', () => {
  it('has exactly one parseable ShipSpec for every roster entry', () => {
    const ids = readdirSync('content/ships')
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace(/\.json$/, ''))
      .sort()
    expect(ids).toEqual(Object.keys(roster).sort())
    for (const id of ids) expect(loadShipSpec(id).id).toBe(id)
  })

  it('pins roles, own model ids, and carrier-only flight decks', () => {
    for (const [id, role] of Object.entries(roster)) {
      const spec = loadShipSpec(id)
      expect(spec.role, id).toBe(role)
      expect(spec.view?.model, id).toBe(id)
      expect(spec.lengthM, id).toBeGreaterThan(0)
      expect(spec.beamM, id).toBeGreaterThan(0)
      expect(spec.maxSpeedMps, id).toBeGreaterThan(0)
      expect(spec.hullHp, id).toBeGreaterThan(0)
      expect(spec.flightDeck !== undefined, id).toBe(role === 'carrier')
      if (spec.flightDeck) expect(spec.flightDeck.heightM, id).toBe(spec.deckHeightM)
    }
  })
})
