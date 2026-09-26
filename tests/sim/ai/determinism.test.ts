import { describe, expect, it } from 'vitest'
import { GREEN_SKILL, VETERAN_SKILL } from '../../../src/sim/ai/pilot.js'
import { advance, createWorldOf, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { level, pilotFor, runCanned, splitSWorld, straight } from './maneuverWorlds.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const zero = loadAircraftSpec('a6m2-zero')

describe('7c determinism (spec §3.6, §7)', () => {
  it('two runs of the same maneuvering world are bit-identical', () => {
    const run = () => runCanned(splitSWorld(), { t: straight }, 12, () => undefined)
    expect(run()).toEqual(run())
  })

  it('reversing the aircraft array changes nothing, with four aircraft and three pilots mid-fight', () => {
    const parts = () => [
      level('a', f6f, v3(0, 3000, 0), v3(120, 0, 0), pilotFor('b', VETERAN_SKILL)),
      level('b', zero, v3(1500, 3000, 200), v3(-110, 0, 0), pilotFor('a', GREEN_SKILL)),
      level('c', f6f, v3(0, 3500, 3000), v3(120, 0, 0)),
      level('d', f6f, v3(-600, 3600, 3000), v3(125, 0, 0), pilotFor('c', VETERAN_SKILL)),
    ]
    const run = (reversed: boolean) => {
      const list = parts()
      let w = createWorldOf({ aircraft: reversed ? list.reverse() : list, player: 'c' })
      for (let i = 0; i < 30 * 60; i++) w = advance(w, DT).world
      return w
    }
    const normal = run(false)
    const reversed = run(true)
    for (const id of ['a', 'b', 'c', 'd']) {
      const n = normal.aircraft.find((x) => x.id === id)!
      const r = reversed.aircraft.find((x) => x.id === id)!
      expect(r.state).toEqual(n.state)
      expect(r.controls).toEqual(n.controls)
      expect(r.pilot).toEqual(n.pilot)
    }
    expect(reversed.combat).toEqual(normal.combat)
  })

  it('a structuredClone taken mid split-S flies on bit-identically (Review Focus 5)', () => {
    let w: World<undefined> = splitSWorld()
    for (let i = 0; i < 20 * 60; i++) {
      w = runCanned(w, { t: straight }, 1 / 60, () => undefined)
      const d = w.aircraft.find((a) => a.id === 'p')!.pilot!.decision
      if (d.named === 'split-s' && d.latch?.phase === 1) break
    }
    const d = w.aircraft.find((a) => a.id === 'p')!.pilot!.decision
    expect(d.named).toBe('split-s')
    expect(d.latch?.phase).toBe(1)
    const cloned = structuredClone(w)
    expect(cloned).toEqual(w)
    const on = (x: World<undefined>) => runCanned(x, { t: straight }, 2, () => undefined)
    expect(on(cloned)).toEqual(on(w))
  })
})
