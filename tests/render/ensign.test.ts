import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { Group, Mesh, Object3D } from 'three'
import { ENSIGN_ASPECT, ENSIGN_WAVE, ensignColor, ensignTexture, ensignWaveZ, createEnsign } from '../../src/render/scene/ensign.js'
import { createShipView } from '../../src/render/scene/ship.js'
import { createModelCache } from '../../src/render/models/modelCache.js'
import { loadShipSpec } from '../../tools/content/load.js'
import { loadModelEntries } from '../../tools/models/manifest.js'

/** Track M, M1f Ruling F2 (Mark, 2026-10-09): every warship flies its side's ensign, waving; a merchant none. */
const RED = 'red', WHITE = 'white', BLUE = 'blue'
const name = (c: readonly number[]): string => (c[0]! > 150 && c[1]! < 80 ? RED : c[0]! > 200 && c[1]! > 200 ? WHITE : c[2]! > c[0]! ? BLUE : '?')

describe('the ensigns drawn', () => {
  it('the 48-star ensign: a blue canton at the hoist top with white stars, red stripes at top and bottom, white between', () => {
    const fly = (x: number): number => x / ENSIGN_ASPECT.us48 // hoists to u
    expect(name(ensignColor('us48', fly(0.01), 0.01))).toBe(BLUE)
    expect(name(ensignColor('us48', fly(0.063), 0.054))).toBe(WHITE) // the first star's center
    expect(name(ensignColor('us48', fly(0.063 + 7 * 0.0906), 0.054 + 5 * 0.0864))).toBe(WHITE) // the 48th
    expect(name(ensignColor('us48', 0.99, 0.01))).toBe(RED)
    expect(name(ensignColor('us48', 0.99, 1.5 / 13))).toBe(WHITE)
    expect(name(ensignColor('us48', 0.2, 0.99))).toBe(RED)
  })

  it('the Rising Sun naval ensign: a red disc offset toward the hoist, rays alternating red and white', () => {
    const a = ENSIGN_ASPECT['ijn-rising-sun']
    const cx = (a / 2 - a / 36) / a
    expect(name(ensignColor('ijn-rising-sun', cx, 0.5))).toBe(RED)
    expect(name(ensignColor('ijn-rising-sun', 0.5, 0.5))).toBe(RED) // the disc covers the middle
    const around = Array.from({ length: 64 }, (_, k) => name(ensignColor('ijn-rising-sun', cx + 0.4 * Math.cos((k + 0.5) * Math.PI / 32) / a, 0.5 + 0.4 * Math.sin((k + 0.5) * Math.PI / 32))))
    expect(around.filter((c) => c === RED).length).toBe(32)
    expect(around.filter((c) => c === WHITE).length).toBe(32)
  })

  it('the texture puts the hoist on the plane\'s u = 1 edge, where createEnsign hangs it (the canton was at the fly once)', () => {
    const t = ensignTexture('us48'), { width: w, height: h } = t.image, d = t.image.data as Uint8Array
    const px = (i: number, row: number): number[] => Array.from(d.slice((row * w + i) * 4, (row * w + i) * 4 + 3))
    expect(name(px(w - 1, h - 1))).toBe(BLUE) // u = 1 (hoist), top row (DataTexture rows run bottom up)
    expect(name(px(0, h - 1))).toBe(RED) // the fly's top stripe
  })

  it('the wave is still at the hoist, moves at the fly, and changes with time', () => {
    for (const t of [0, 0.4, 3]) expect(ensignWaveZ(0, t)).toBe(0)
    const a = ensignWaveZ(1, 0), b = ensignWaveZ(1, 0.3)
    expect(Math.abs(a - b)).toBeGreaterThan(0.01)
    expect(Math.max(...Array.from({ length: 50 }, (_, k) => Math.abs(ensignWaveZ(1, k / 10))))).toBeLessThanOrEqual(ENSIGN_WAVE.amplitude)
  })
})

describe('every ship flies its side ensign', () => {
  const entries = new Map(loadModelEntries().filter((e) => e.ship).map((e) => [e.ship!.spec, e]))
  const ids = readdirSync('content/ships').filter((f) => f.endsWith('.json') && !f.endsWith('.skin.json') && f !== 'models.json').map((f) => f.slice(0, -5))

  it.each(ids)('%s', (id) => {
    const spec = loadShipSpec(id)
    if (spec.role === 'merchant') { expect(spec.view?.ensign).toBeUndefined(); return }
    // The model's palette names its navy, so the flag cannot drift from the paint.
    const navy = entries.get(id)!.ship!.palette.startsWith('ijn') ? 'ijn-rising-sun' : 'us48'
    expect(spec.view?.ensign?.flag).toBe(navy)
    const [x, y] = spec.view!.ensign!.at
    expect(Math.abs(x)).toBeLessThan(spec.lengthM / 2)
    expect(y).toBeGreaterThan(spec.deckHeightM)
  })

  it('a model view hangs the ensign in the hull group at the spec point, streaming aft, and frees it on dispose', async () => {
    const spec = loadShipSpec('fletcher-dd')
    const root = new Group(); const s = new Object3D(); s.name = 'SmokeOrigin'; root.add(s)
    const view = createShipView(spec, 'fletcher-dd', await createModelCache(async () => root).acquire('f.glb'))
    const flag = view.root.getObjectByName('ensign') as Mesh
    expect(flag.parent!.name).toBe('hull group')
    expect(flag.position.toArray()).toEqual(spec.view!.ensign!.at)
    flag.geometry.computeBoundingBox()
    const bb = flag.geometry.boundingBox!
    expect(bb.max.x).toBeCloseTo(0, 6) // the hoist, at the spec point
    expect(bb.min.x).toBeCloseTo(-spec.view!.ensign!.flyM, 6) // streaming aft
    expect(bb.max.y).toBeCloseTo(0, 6)
    let disposed = false
    flag.geometry.addEventListener('dispose', () => { disposed = true })
    view.dispose()
    expect(disposed).toBe(true)
    expect(createEnsign(loadShipSpec('type-b-maru'))).toBeNull()
  })
})
