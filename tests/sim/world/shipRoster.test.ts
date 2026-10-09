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
  'zuikaku-cv': 'carrier',
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

  // Track M, M1 (2026-10-08): every warship's gun positions, as [turrets, heavyAA, lightAA]
  // entries; a light AA entry is one gun tub, or one gallery of 20 mm singles. Counts follow
  // the late-1944 fits cited in each spec's reference.source; the merchant carries none.
  const fits: Record<string, readonly [number, number, number] | null> = {
    'casablanca-cve': [1, 0, 12],
    'cleveland-cl': [4, 6, 14],
    'essex-cv': [8, 0, 4], // cut to four 40 mm quads for balance, not history (Mark, M1d)
    'fletcher-dd': [5, 0, 12],
    'kagero-dd': [2, 0, 5],
    'mogami-ca': [5, 4, 16],
    'pennsylvania-bb': [4, 8, 14],
    'shiratsuyu-dd': [2, 0, 7],
    'type-b-maru': null,
    'yamato-bb': [5, 6, 22],
    'zuikaku-cv': [8, 0, 4], // four 25 mm triples to match Essex, for balance, not history (Mark, M1e)
  }

  it('pins every warship\'s armament and gives the merchant none', () => {
    expect(Object.keys(fits).sort()).toEqual(Object.keys(roster).sort())
    for (const [id, fit] of Object.entries(fits)) {
      const a = loadShipSpec(id).armament
      expect(a ? [a.turrets.length, a.heavyAA.length, a.lightAA.length] : null, id).toEqual(fit)
    }
  })
})
