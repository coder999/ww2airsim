// tests/tools/shipModels.test.ts
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { loadModelEntries } from '../../tools/models/manifest.js'
import { downloadBakeInputs } from '../../tools/models/build.js'
import { findNode, modelIO } from '../../tools/models/document.js'
import { documentSoup, SMOKE_REACH_M } from '../../tools/models/stages/shipFit.js'
import { bounds, fitProblems, residualProblems, surfaceBelow, trapLaneHalfWidth, type ShipFit } from '../../src/render/scene/shipFit.js'
import { loadShipSpec } from '../../tools/content/load.js'
import { bearingQuat, GUNS_SUFFIX, KIT_PREFIX, MAX_ELEVATION_DEG, MOUNT_SLACK_M, namedMounts } from '../../tools/models/stages/shipMounts.js'

/**
 * Deterministic for every committed ship glb (ship-models spec §9, items 1-5), on a
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
  it('are S1\'s three, R2\'s seven and M1e\'s Zuikaku: the complete Library roster', () => {
    expect(ships.map((e) => e.id)).toEqual([
      'casablanca-cve', 'cleveland-cl', 'essex-cv', 'fletcher-dd', 'kagero-dd',
      'mogami-ca', 'pennsylvania-bb', 'shiratsuyu-dd', 'type-b-maru', 'yamato-bb', 'zuikaku-cv',
    ])
  })
})

describe.each(ships.map((e) => [e.id, e] as const))('committed ship %s', (_id, entry) => {
  const ship = entry.ship!

  it('names the entry\'s author, or its Blender script, inside the file (§9 item 1)', async () => {
    const extras = (await read(entry.output)).getRoot().getAsset().extras as Record<string, unknown>
    const source = entry.source
    if (source.kind === 'sketchfab') expect(extras['author']).toBe(source.author)
    else if (source.kind === 'blender') expect([extras['source'], extras['script']]).toEqual(['blender', source.script])
    else throw new Error(`${entry.id}: a ship entry is a Sketchfab download or a Blender script`)
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

// Track M, M1 (2026-10-08): the spec's armament is the one source of gun positions, and the model
// must carry it: a locator per entry, exactly at its point and bearing, naming its kit; one Kit_ mesh
// per kit in use, and none unused. A model rebuilt against a moved spec, or a spec edited without a
// rebuild, fails here naming the mount. M1b (2026-10-09): a gallery (`run`) is one locator per gun,
// `<name>_<i>`, spread evenly over its run bow to stern and standing within MOUNT_SLACK_M of its
// height (Ruling B2); every kit's guns are its `Kit_<kit>_Guns` child, with a trunnion and its top
// elevation (Ruling B4).
describe.each(ships.map((e) => [e.id, e] as const))('committed ship %s carries its armament', (_id, entry) => {
  it('a locator per drawn gun position at its spec point, and one Kit_ mesh per kit in use with its guns', async () => {
    const doc = await read(entry.output)
    const spec = loadShipSpec(entry.ship!.spec)
    const nodes = doc.getRoot().listNodes()
    const kits = nodes.filter((n) => n.getName().startsWith(KIT_PREFIX) && !n.getName().endsWith(GUNS_SUFFIX))
    if (!spec.armament) {
      expect(spec.role, entry.id).toBe('merchant')
      expect(kits.map((n) => n.getName())).toEqual([])
      expect(nodes.filter((n) => /^(Turret|HeavyAA|LightAA)\d+/.test(n.getName())).map((n) => n.getName())).toEqual([])
      return
    }
    const mounts = namedMounts(spec.armament)
    expect(mounts.length).toBeGreaterThan(0)
    let drawn = 0
    for (const { name, mount } of mounts) {
      const guns = mount.run === undefined
        ? [{ name, x: mount.x }]
        : Array.from({ length: mount.barrels }, (_, i) => ({ name: `${name}_${i + 1}`, x: mount.x + mount.run! / 2 - (i * mount.run!) / (mount.barrels - 1) }))
      for (const g of guns) {
        const found = nodes.filter((n) => n.getName() === g.name)
        expect(found.length, `${entry.id} ${g.name}`).toBe(1)
        const loc = found[0]!
        expect(loc.getMesh(), `${entry.id} ${g.name} is an empty locator`).toBeNull()
        const [x, y, z] = loc.getTranslation()
        expect([x, z].map((v) => +v.toFixed(3)), `${entry.id} ${g.name}`).toEqual([g.x, mount.z].map((v) => +v.toFixed(3)))
        if (mount.run === undefined) expect(+y.toFixed(4), `${entry.id} ${g.name}`).toBe(+mount.y.toFixed(4))
        else expect(Math.abs(y - mount.y), `${entry.id} ${g.name} stands near its gallery's height`).toBeLessThanOrEqual(MOUNT_SLACK_M)
        expect(loc.getRotation().map((v) => +v.toFixed(5)), `${entry.id} ${g.name} bearing`).toEqual(bearingQuat(mount.bearingDeg).map((v) => +v.toFixed(5)))
        expect(loc.getExtras()['kit'], `${entry.id} ${g.name}`).toBe(mount.kit)
        drawn++
      }
    }
    // Every barrel of a gallery is drawn: the instance count is the gallery's barrel count.
    const galleryBarrels = mounts.filter((m) => m.mount.run !== undefined).reduce((n, m) => n + m.mount.barrels, 0)
    expect(drawn, entry.id).toBe(mounts.filter((m) => m.mount.run === undefined).length + galleryBarrels)
    const used = [...new Set(mounts.flatMap((m) => (m.mount.kit === null ? [] : [m.mount.kit])))].sort()
    expect(kits.map((n) => n.getName().slice(KIT_PREFIX.length)).sort(), entry.id).toEqual(used)
    for (const k of kits) {
      expect(k.getMesh(), k.getName()).not.toBeNull()
      const guns = k.listChildren().filter((c) => c.getName() === `${k.getName()}${GUNS_SUFFIX}`)
      expect(guns.length, `${k.getName()} has its guns`).toBe(1)
      expect(guns[0]!.getMesh(), `${k.getName()} guns`).not.toBeNull()
      const kit = k.getName().slice(KIT_PREFIX.length)
      expect(guns[0]!.getExtras()['maxElevationRad'], kit).toBeCloseTo(MAX_ELEVATION_DEG[kit]! * Math.PI / 180, 9)
      expect((guns[0]!.getExtras()['trunnion'] as number[]).length, kit).toBe(3)
    }
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
  // M1d: the glb paints its roles into one skin, so read them where they are still materials: the bake input
  // (the skinned nodes after box projection, build.ts's bakeInput), from the raw.
  const fletcher = ships.find((e) => e.id === 'fletcher-dd')!
  it.skipIf(!existsSync(fletcher.input!))('has its waterline on its own boot-top seam: the antifouling role tops out at y = 0 amidships (§4.2)', async () => {
    const doc = await modelIO().readBinary((await downloadBakeInputs(fletcher)).input)
    let top = -Infinity
    for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) {
      if (p.getMaterial()?.getName() !== 'ship:antifouling') continue
      const a = p.getAttribute('POSITION')!.getArray()!
      for (let i = 0; i < a.length / 3; i++) if (Math.abs(a[3 * i]!) < 10) top = Math.max(top, a[3 * i + 1]!)
    }
    expect(Math.abs(top)).toBeLessThanOrEqual(0.05)
  })
})
