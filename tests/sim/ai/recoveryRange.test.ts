import { describe, expect, it } from 'vitest'
import { aircraftById, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { worldFromScenario } from '../../../src/sim/scenario.js'
import { deckLocal, decksOf } from '../../../src/sim/world/deck.js'
import { loadScenarioBundle } from '../../../tools/content/load.js'
import { terrainOrSkip } from '../mission/fly.js'
import { crashed, fly } from './recoveryWorlds.js'

const terrain = terrainOrSkip()

const MAX_S = 20 * 60
const WATCH_AFTER_RESPOT_S = 5
const ON_SPOT_M = 0.5
const IDS = ['ai-cv', 'ai-tac'] as const

function offSpotM(w: World<undefined>, id: string): number {
  const a = aircraftById(w, id)!
  const h = a.pilot!.home!
  if (h.kind === 'ship') {
    const l = deckLocal(decksOf(w.ships).find((d) => d.shipId === h.id)!, a.state.position.x, a.state.position.z)
    return Math.hypot(l.x - h.parkSpot.x, l.z - h.parkSpot.z)
  }
  return Math.hypot(a.state.position.x - h.parkWorld.x, a.state.position.z - h.parkWorld.z)
}

describe.skipIf(terrain === null)('recovery-range (7g spec §7)', () => {
  it('both AI land at their homes and stand on their own park spots, with no impact, inside 20 minutes', () => {
    const w0 = worldFromScenario(loadScenarioBundle('recovery-range'), terrain)
    const landedS: Record<string, number> = {}
    const respotTick: Record<string, number> = {}
    const didCrash: Record<string, boolean> = {}
    const worstOffSpotM: Record<string, number> = {}
    const world = fly(w0, MAX_S, (x) => {
      for (const id of IDS) {
        const a = aircraftById(x, id)!
        didCrash[id] ||= crashed(x, id)
        if (landedS[id] === undefined && a.pilot!.decision.mode === 'landed') landedS[id] = x.tick * DT
        if (respotTick[id] === undefined && a.pilot!.decision.recovery?.respotted === true) respotTick[id] = x.tick
        if (respotTick[id] !== undefined) worstOffSpotM[id] = Math.max(worstOffSpotM[id] ?? 0, offSpotM(x, id))
      }
      return IDS.every((id) => respotTick[id] !== undefined && x.tick - respotTick[id]! >= WATCH_AFTER_RESPOT_S / DT)
    })
    for (const id of IDS) {
      expect(landedS[id], `${id} never landed`).toBeDefined()
      expect(respotTick[id], `${id} never respotted`).toBeDefined()
      expect(didCrash[id], `${id} crashed`).toBe(false)
      expect(aircraftById(world, id)!.impact).toBeNull()
      expect(worstOffSpotM[id]!, `${id} off its spot`).toBeLessThan(ON_SPOT_M)
    }
    expect(aircraftById(world, 'ai-cv')!.pilot!.home!.kind).toBe('ship')
    expect(aircraftById(world, 'ai-tac')!.pilot!.home!.kind).toBe('runway')
  })
})
