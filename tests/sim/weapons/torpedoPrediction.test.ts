// F6B Task 10: the torpedosight's prediction against the real sim. Truth is `stepCombat`: whether the dropped
// torpedo ENTERED the water and ran (impact outcome 'entered') or broke up, and the point where it met the water.
// Every torpedo store in content is enrolled (as torpedo.test.ts does), so a new torpedo plane is covered with no new test.
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { groundTruthTerrain } from '../../pilot/rangePass.js'
import { createState, type Controls } from '../../../src/sim/flight/state.js'
import { DT } from '../../../src/sim/flight/model.js'
import { bayDoorsShut } from '../../../src/sim/bayDoors.js'
import { length, sub, v3 } from '../../../src/sim/math/vec3.js'
import { createCombat, stepCombat, torpedoDropOk } from '../../../src/sim/weapons/combat.js'
import { predictTorpedoDrop, predictImpact } from '../../../src/sim/weapons/impactPrediction.js'
import { storesFromLoadout, type Loadout } from '../../../src/sim/weapons/stores.js'
import type { AircraftSpec, StoreType } from '../../../src/sim/flight/schema.js'
import type { TerrainField } from '../../../src/sim/world/terrain.js'

const ids = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
const carriers = new Map<string, { spec: AircraftSpec; loadout: Loadout }>()
for (const id of ids) {
  const spec = loadAircraftSpec(id)
  for (const [storeId, t] of Object.entries(spec.stores?.types ?? {})) if (t.kind === 'torpedo' && !carriers.has(storeId)) {
    const loadout: Loadout = spec.stores?.torpedoRacks?.some((r) => r.store === storeId) === true ? 'torpedoes' : 'bombs'
    carriers.set(storeId, { spec: loadout === 'torpedoes' ? { ...spec, stores: { ...spec.stores!, racks: spec.stores!.torpedoRacks! } } : spec, loadout })
  }
}
const ENROLLED = ['mk13', 'type91']
const terrain: TerrainField = groundTruthTerrain()
const dropPulse: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0, fire: false, dropBomb: true }

function realDrop(spec: AircraftSpec, loadout: Loadout, speed: number, height: number, doors: number, terr: TerrainField | null, at = v3(0, height, 0)) {
  const state = createState({ position: at, velocity: v3(speed, 0, 0), bayDoorFraction: doors })
  const a = { id: 'p', spec, state, previous: state, controls: dropPulse, impact: null }
  const stores = storesFromLoadout(spec, loadout)
  const predicted = predictTorpedoDrop(spec, state, stores, terr, null)
  let combat = createCombat([a], { p: stores })
  combat = stepCombat(combat, [a], [], [], terr, null, [], 1, DT)
  const idle = { ...a, controls: { ...dropPulse, dropBomb: false } }
  for (let t = 1; combat.projectiles.some((p) => p.kind === 'torpedo' && p.runM === undefined) && t < 60 * 60; ) combat = stepCombat(combat, [idle], [], [], terr, null, [], ++t, DT)
  return { predicted, combat }
}

it('enrolls every torpedo store in content (a filter that matched nothing must fail)', () => { expect([...carriers.keys()].sort()).toEqual(ENROLLED) })

describe.each(ENROLLED)('%s', (storeId) => {
  const { spec, loadout } = carriers.get(storeId)!
  const t = spec.stores!.types[storeId] as StoreType
  it('over open sea the verdict and the entry point match the real sim across speed and height', () => {
    let runs = 0, breaks = 0
    for (const sk of [0.5, 0.95, 1.05, 1.5]) for (const hk of [0.3, 0.95, 1.05]) {
      const { predicted, combat } = realDrop(spec, loadout, sk * t.maxDropSpeedMps!, hk * t.maxDropHeightM!, 1, null)
      const name = `${storeId} speed x${sk} height x${hk}`
      expect(predicted, name).not.toBeNull()
      const outcome = combat.impacts.find((i) => i.cause === 'torpedo')
      expect(outcome, name).toBeDefined()
      expect(predicted!.valid, name).toBe(outcome!.outcome === 'entered')
      expect(predicted!.valid, name).toBe(sk < 1 && hk < 1)
      expect(length(sub(predicted!.entry!, outcome!.point)), name).toBeLessThan(0.01)
      if (predicted!.valid) runs++; else { breaks++; expect(predicted!.reasons.length, name).toBeGreaterThan(0) }
    }
    expect([runs, breaks]).toEqual([4, 8]) // pinned: 2 speeds x 2 heights run, the other 8 break up
  })
  it('over land it says not-over-sea and the real torpedo breaks up on land', () => {
    const { predicted, combat } = realDrop(spec, loadout, 0.5 * t.maxDropSpeedMps!, 300, 1, terrain, v3(-30000, 1800, 25000))
    const outcome = combat.impacts.find((i) => i.cause === 'torpedo')!
    expect(outcome.outcome).toBe('broke-up')
    expect(predicted!.valid).toBe(false)
    expect(predicted!.reasons).toContain('not-over-sea')
  })
  it('doors shut: the sight says so exactly when the sim refuses to release', () => {
    const { predicted, combat } = realDrop(spec, loadout, 0.5 * t.maxDropSpeedMps!, 0.3 * t.maxDropHeightM!, 0, null)
    const shut = bayDoorsShut(spec, 0)
    expect(predicted!.reasons.includes('doors-shut')).toBe(shut)
    expect(combat.aircraft.p!.torpedoesDropped).toBe(shut ? 0 : 1)
  })
  it('the sight reads the SAME envelope function as the release (torpedoDropOk), at its edges', () => {
    expect(torpedoDropOk(t, t.maxDropSpeedMps!, t.maxDropHeightM!)).toBe(true)
    expect(torpedoDropOk(t, t.maxDropSpeedMps! + 0.01, 1)).toBe(false)
    expect(torpedoDropOk(t, 1, t.maxDropHeightM! + 0.01)).toBe(false)
  })
})

describe('what is not a torpedo', () => {
  const hellcat = loadAircraftSpec('f6f-hellcat')
  const state = createState({ position: v3(0, 1000, 0), velocity: v3(100, 0, 0) })
  it('a bomb load or an empty rack is null for the torpedosight, and a torpedo is null for the bombsight', () => {
    expect(predictTorpedoDrop(hellcat, state, { bombs: 2, rockets: 0 }, null, null)).toBeNull()
    const { spec, loadout } = carriers.get('mk13')!
    expect(predictTorpedoDrop(spec, state, { bombs: 0, rockets: 0 }, null, null)).toBeNull()
    expect(predictImpact(spec, createState({ position: v3(0, 300, 0), velocity: v3(80, 0, 0), bayDoorFraction: 1 }), storesFromLoadout(spec, loadout), null, null)).toBeNull()
  })
})
