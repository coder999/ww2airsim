import { describe, expect, it } from 'vitest'
import type { Object3D } from 'three'
import { STATIC_MODELS } from '../../src/render/scene/staticModels.js'
import { staticModelPath } from '../../src/render/content.js'
import { EQUIPMENT_LAMPS, equipmentModelFor, setLamp } from '../../src/render/lights/equipment.js'
import { flicker, idPhase } from '../../src/render/lights/nightLights.js'
import { LIGHT_KINDS } from '../../src/sim/lights/lights.js'
import { glbScene } from './_wildcatCache.js'

const names = (root: Object3D): string[] => { const out: string[] = []; root.traverse((o) => { if (o.name !== '') out.push(o.name) }); return out }
const visibility = (root: Object3D): Record<string, boolean> => Object.fromEntries(names(root).map((n) => [n, root.getObjectByName(n)!.visible]))
/** A lamp node is any node whose name says it is a light state. */
const LAMP_NAME = /^(Lens)?(Un)?[Ll]it|Burning|^BeamMarker$/

describe('equipment lamps (F6A): lit and unlit are named nodes, not materials', () => {
  it('the table is enrolled over EVERY committed equipment glb that carries a lamp-state node, and names only nodes that exist', async () => {
    const withLamp: string[] = []
    for (const id of Object.keys(STATIC_MODELS.equipment)) {
      const root = await glbScene(staticModelPath('equipment', id))
      if (names(root).some((n) => LAMP_NAME.test(n))) {
        withLamp.push(id)
        const lamp = EQUIPMENT_LAMPS[id]
        expect(lamp, `${id} has a lamp-state node but no entry in EQUIPMENT_LAMPS`).toBeDefined()
        for (const n of [...lamp!.lit, ...lamp!.unlit, lamp!.emitter]) expect(root.getObjectByName(n), `${id}: node ${n}`).toBeDefined()
        // Every lamp-named node of the model is claimed by the table, so none is left to drift.
        const claimed = new Set([...lamp!.lit, ...lamp!.unlit])
        for (const n of names(root).filter((x) => LAMP_NAME.test(x))) expect(claimed.has(n), `${id}: ${n} is a lamp node the table does not claim`).toBe(true)
      }
    }
    // Pinned so a filter that matches nothing fails instead of passing empty.
    expect(withLamp.sort()).toEqual(['m1942-60in-searchlight', 'm24-aircraft-parachute-flare', 'panirugan-red-harbor-light', 'portable-runway-flare-pot', 'ranger-temporary-nav-light'])
    expect(Object.keys(EQUIPMENT_LAMPS).sort()).toEqual(withLamp.sort())
  })

  it('swapping lit/unlit toggles EXACTLY the named nodes and leaves every other node alone', async () => {
    for (const [id, lamp] of Object.entries(EQUIPMENT_LAMPS)) {
      const root = await glbScene(staticModelPath('equipment', id))
      const before = visibility(root)
      setLamp(root, id, true)
      const lit = visibility(root)
      setLamp(root, id, false)
      const dark = visibility(root)
      const named = new Set([...lamp.lit, ...lamp.unlit])
      for (const n of Object.keys(before)) {
        if (!named.has(n)) { expect(lit[n], `${id}/${n} untouched when lit`).toBe(before[n]); expect(dark[n], `${id}/${n} untouched when dark`).toBe(before[n]) }
      }
      for (const n of lamp.lit) { expect(lit[n], `${id}/${n} lit`).toBe(true); expect(dark[n], `${id}/${n} dark`).toBe(false) }
      for (const n of lamp.unlit) { expect(lit[n], `${id}/${n} lit`).toBe(false); expect(dark[n], `${id}/${n} dark`).toBe(true) }
      // The swap must actually change something for a model with both states (a no-op swap would pass the above).
      if (lamp.unlit.length > 0) expect(lit).not.toEqual(dark)
    }
  })

  it('a model missing its lamp node throws, naming the node', async () => {
    const root = await glbScene(staticModelPath('equipment', 'portable-runway-flare-pot'))
    root.getObjectByName('LitMarker')!.name = 'Renamed'
    expect(() => setLamp(root, 'portable-runway-flare-pot', true)).toThrow(/no node "LitMarker"/)
  })

  it('every light kind but nav (an aircraft\'s own) has an equipment model that is registered', () => {
    for (const k of LIGHT_KINDS) {
      const model = equipmentModelFor(k, 'white')
      if (k === 'nav') expect(model).toBeNull()
      else expect(Object.hasOwn(STATIC_MODELS.equipment, model!), `${k} -> ${model}`).toBe(true)
    }
    expect(equipmentModelFor('fixture', 'red')).toBe('panirugan-red-harbor-light')
  })
})

describe('flicker is render-only and deterministic', () => {
  it('depends on id and time alone, stays within 0.85 to 1.15, and differs between lights', () => {
    expect(flicker('pot-a', 'pot', 3.7)).toBe(flicker('pot-a', 'pot', 3.7))
    for (let t = 0; t < 20; t += 0.013) { const f = flicker('pot-a', 'pot', t); expect(f).toBeGreaterThan(0.85); expect(f).toBeLessThan(1.15) }
    expect(idPhase('pot-a')).not.toBe(idPhase('pot-b'))
    expect(flicker('pot-a', 'pot', 1)).not.toBe(flicker('pot-b', 'pot', 1))
    expect(flicker('beam', 'searchlight', 1)).toBe(1) // steady kinds do not flicker
  })
})
