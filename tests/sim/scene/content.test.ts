import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RADIO_LINES } from '../../../src/audio/radio.js'
import { CHAPTER_IDS } from '../../../src/campaign/schema.js'
import { worldChecksum } from '../../../src/flightRecorder/checksum.js'
import { ticksFor } from '../../../src/sim/mission/state.js'
import { worldFromScenario } from '../../../src/sim/scenario.js'
import { skipScene } from '../../../src/sim/scene/preroll.js'
import { parseScene } from '../../../src/sim/scene/schema.js'
import { loadScenarioBundle } from '../../../tools/content/load.js'

const directory = new URL('../../../content/scenes/', import.meta.url)
const files = readdirSync(directory).filter((file) => file.endsWith('.json')).sort()
const openingSeconds = { A1: 18, A2: 15, A3: 12, A4: 18, A5: 12, A6: 20, J1: 18, J2: 12, J3: 12, J4: 15, J5: 18, J6: 20 }
const aiChapters = new Set(['A2', 'A3', 'A5', 'J2', 'J3', 'J4'])

describe('campaign scene content', () => {
  it('enrolls all twelve openings and both finales', () => {
    expect(files).toEqual([
      ...CHAPTER_IDS.map((chapter) => `${chapter.toLowerCase()}-opening.json`),
      'a6-victory.json', 'j6-victory.json',
    ].sort())
  })

  it.each(files)('%s loads its scenario and reaches a deterministic handoff', (file) => {
    const scene = parseScene(JSON.parse(readFileSync(new URL(file, directory), 'utf8')) as unknown)
    expect(file).toBe(`${scene.id}.json`)
    expect(scene.id).toBe(`${scene.chapter.toLowerCase()}-${scene.kind}`)
    if (scene.kind === 'opening') expect(scene.durationS).toBe(openingSeconds[scene.chapter])
    else {
      expect(['A6', 'J6']).toContain(scene.chapter)
      expect(scene.durationS).toBeGreaterThanOrEqual(45)
      expect(scene.durationS).toBeLessThanOrEqual(60)
    }
    expect(scene.handoff.player).toBe(aiChapters.has(scene.chapter) ? 'ai' : 'held')
    expect(scene.camera.length).toBeGreaterThan(1)
    expect(scene.camera[0]!.t).toBe(0)
    expect(scene.camera.at(-1)!.t).toBe(scene.durationS)
    expect(scene.cues.some(({ order }) => order.kind === 'message')).toBe(true)
    for (const cue of scene.cues) {
      // A cue at durationS would never be applied: pre-roll steps [0, N).
      expect(cue.t).toBeLessThan(scene.durationS)
      if (cue.order.kind === 'message') expect(Object.hasOwn(RADIO_LINES, cue.order.text)).toBe(true)
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
