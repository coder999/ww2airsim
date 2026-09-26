// tests/tools/shipModels.test.ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadModelEntries } from '../../tools/models/manifest.js'
import { findNode, modelIO } from '../../tools/models/document.js'
import { documentSoup, SMOKE_REACH_M } from '../../tools/models/stages/shipFit.js'
import { bounds, fitProblems, residualProblems, surfaceBelow, trapLaneHalfWidth, type ShipFit } from '../../src/render/scene/shipFit.js'
import { loadShipSpec } from '../../tools/content/load.js'

/**
 * Tier 1 for every committed ship glb (ship-models spec §9, items 1-5), on a
 * fresh clone: the COMMITTED bytes, re-measured against the LIVE
 * content/ships/<id>.json. Budgets, extensions, BLEND, metalness, source,
 * license and the ASSETS.md row are tests/tools/models/outputs.test.ts's,
 * which runs on every entry, ships included. If Plan 8 moves the deck, this
 * fails naming the quantity. The fix: tools/models/sketchfab-fetch.sh to
 * re-acquire the gitignored raw input, then `npm run models:build -- <id>`.
 */
const ships = loadModelEntries().filter((e) => e.ship !== undefined)
const read = async (path: string) => modelIO().readBinary(new Uint8Array(readFileSync(path)))

describe('the committed ship models', () => {
  it('are the three S1 ships', () => {
    expect(ships.map((e) => e.id)).toEqual(['essex-cv', 'fletcher-dd', 'type-b-maru'])
  })
})

describe.each(ships.map((e) => [e.id, e] as const))('committed ship %s', (_id, entry) => {
  const ship = entry.ship!

  it('names the entry\'s author inside the file (§9 item 1)', async () => {
    const extras = (await read(entry.output)).getRoot().getAsset().extras as Record<string, unknown>
    expect(extras['author']).toBe(entry.source.author)
  })

  it('records a fit whose residuals lie inside §4.4\'s design ranges', async () => {
    const extras = (await read(entry.output)).getRoot().getAsset().extras as Record<string, unknown>
    const fit = extras['shipFit'] as ShipFit & { spec: string }
    expect(fit.spec).toBe(ship.spec)
    expect(residualProblems(fit, ship)).toEqual([])
  })

  it('still fits the live ShipSpec: every §4.4 tolerance, the bow and the waterline (§9 items 3-4)', async () => {
    expect(fitProblems(documentSoup(await read(entry.output)), loadShipSpec(ship.spec), ship).problems).toEqual([])
  })

  it('carries SmokeOrigin at the entry\'s point, within reach of the surface below it (§4.6)', async () => {
    const doc = await read(entry.output)
    const at = findNode(doc, 'SmokeOrigin').getTranslation()
    expect(at).toEqual(ship.smokeOrigin)
    const soup = documentSoup(doc)
    expect(at[1]).toBeLessThanOrEqual(bounds(soup).max[1] + SMOKE_REACH_M)
    const under = surfaceBelow(soup, at[0], at[2], at[1])
    expect(under).not.toBeNull()
    expect(at[1] - under!).toBeLessThanOrEqual(SMOKE_REACH_M)
  })
})

describe('essex-cv specifically', () => {
  const entry = ships.find((e) => e.id === 'essex-cv')!
  const cv = loadShipSpec('essex-cv')

  it('carries TrapBand at the trap zone\'s center on the deck, as wide as its own island leaves clear', async () => {
    const doc = await read(entry.output)
    const band = findNode(doc, 'TrapBand')
    const fd = cv.flightDeck!, tz = cv.trapZone!
    expect(band.getTranslation()[0]).toBeCloseTo(-fd.lengthM / 2 + (tz.fromSternM + tz.toSternM) / 2, 6)
    expect(band.getTranslation()[1]).toBe(fd.heightM)
    expect(band.getExtras()['halfWidthM']).toBeCloseTo(trapLaneHalfWidth(documentSoup(doc), cv), 9)
  })

  it('fails, naming the deck, if Plan 8 raises the deck to 18 m (the check bites)', async () => {
    const raised = { ...cv, deckHeightM: 18, flightDeck: { ...cv.flightDeck!, heightM: 18 } }
    const { problems } = fitProblems(documentSoup(await read(entry.output)), raised, entry.ship!)
    expect(problems.join('; ')).toMatch(/deck plane at 17\.0\d\d m vs flightDeck\.heightM 18/)
  })
})

describe('fletcher-dd specifically', () => {
  it('has its waterline on its own boot-top seam: the antifouling role tops out at y = 0 amidships (§4.2)', async () => {
    const doc = await read(ships.find((e) => e.id === 'fletcher-dd')!.output)
    let top = -Infinity
    for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) {
      if (p.getMaterial()?.getName() !== 'ship:antifouling') continue
      const a = p.getAttribute('POSITION')!.getArray()!
      for (let i = 0; i < a.length / 3; i++) if (Math.abs(a[3 * i]!) < 10) top = Math.max(top, a[3 * i + 1]!)
    }
    expect(Math.abs(top)).toBeLessThanOrEqual(0.05)
  })
})
