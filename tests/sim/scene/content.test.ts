import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { worldChecksum } from '../../../src/flightRecorder/checksum.js'
import { ticksFor } from '../../../src/sim/mission/state.js'
import { worldFromScenario } from '../../../src/sim/scenario.js'
import { skipScene } from '../../../src/sim/scene/preroll.js'
import { parseScene } from '../../../src/sim/scene/schema.js'
import { loadScenarioBundle } from '../../../tools/content/load.js'

const directory = new URL('../../../content/scenes/', import.meta.url)
const files = readdirSync(directory).filter((file) => file.endsWith('.json')).sort()

describe('campaign scene content', () => {
  // Mark ruled 2026-10-17: the chapter missions do not exist yet (F10), so F9 ships two demo scenes on existing scenarios.
  it('enrolls the two demo scenes', () => {
    expect(files).toEqual(['demo-opening.json', 'demo-victory.json'])
  })

  it.each(files)('%s loads its scenario and reaches a deterministic handoff', (file) => {
    const scene = parseScene(JSON.parse(readFileSync(new URL(file, directory), 'utf8')) as unknown)
    expect(file).toBe(`${scene.id}.json`)
    if (scene.kind === 'opening') expect(scene.durationS).toBeLessThanOrEqual(20)
    else expect(scene.durationS).toBeGreaterThanOrEqual(45)
    expect(scene.camera.length).toBeGreaterThan(1)
    expect(scene.camera[0]!.t).toBe(0)
    expect(scene.camera.at(-1)!.t).toBe(scene.durationS)
    expect(scene.cues.some(({ order }) => order.kind === 'message')).toBe(true)
    for (const cue of scene.cues) {
      // A cue at durationS would never be applied: pre-roll steps [0, N).
      expect(cue.t).toBeLessThan(scene.durationS)
    }

    const bundle = loadScenarioBundle(scene.world.scenario)
    // Content/engine smoke coverage, deliberately independent of optional terrain files.
    // This cannot certify terrain clearance, the F3 mission-fit start, or visual approval.
    const build = () => worldFromScenario(bundle, null)
    const initial = build()
    const final = skipScene(initial, scene) // Includes checkScene's entity/group validation.
    expect(final.tick).toBe(initial.tick + ticksFor(scene.durationS))
    expect(final.player).toBe(initial.player)
    const player = final.aircraft.find((aircraft) => aircraft.id === final.player)!
    expect(player).toBeDefined()
    expect(Object.values(player.state.position).every(Number.isFinite)).toBe(true)
    if (initial.mission !== null) {
      expect(final.mission).not.toBeNull()
      expect(final.mission!.clockOriginTick).toBe(final.tick)
      expect(final.mission!.fired).toEqual(initial.mission.fired)
    }
    expect(worldChecksum(skipScene(build(), scene))).toBe(worldChecksum(final))
  })
})
