/**
 * F8C C8 (2026-10-17): a recorded campaign flight launched from a STORED window reproduces. The window a launch draws each site in
 * comes from the stored `Campaign.world` (`launchWindows`); it is part of the expanded bundle, so it is part of the record's content
 * hash and initial world. This pins three things: the same stored world replays bit for bit; the chapter's own window (the fallback a
 * new campaign would use) is a different world and different content, so a record cannot be replayed against it; and a stored
 * window that differs from the chapter's own really changes the world that flies.
 */
import { describe, expect, it } from 'vitest'
import { launchWindows } from '../../src/campaign/worldStates.js'
import { worldChecksum } from '../../src/flightRecorder/checksum.js'
import { sha256 } from '../../src/flightRecorder/canonical.js'
import { decodeFlightRecord, encodeFlightRecord } from '../../src/flightRecorder/codec.js'
import { createDevFlightRecorder, type FlightRecordHeader } from '../../src/flightRecorder/recorder.js'
import { verifyFlightRecord } from '../../src/flightRecorder/verify.js'
import { DT } from '../../src/sim/flight/model.js'
import { advance, withControls, type World } from '../../src/sim/loop.js'
import { parseScenario, worldFromScenario, type ScenarioBundle } from '../../src/sim/scenario.js'
import { bundleForScenario } from '../../tools/content/load.js'
import { flatField } from '../sim/mission/fixture.js'

const RAW = {
  id: 'stored-window', player: 'f6f-1', airfields: ['tacloban'], ships: [], weather: { windFromDeg: 0, windMps: 0 }, sites: ['tacloban', 'jinamoc'],
  aircraft: [{ id: 'f6f-1', spec: 'f6f-hellcat', side: 'allied', airborneAt: { position: [-29400, 600, -47000], headingDeg: 0, speedMps: 90 } }],
  objectives: [{ id: 'home', label: 'Land', priority: 'primary', kind: 'land', at: 'tacloban' }],
}
const bundleFor = (stored: Record<string, string>, chapter = 'A3'): ScenarioBundle => bundleForScenario(parseScenario(RAW), launchWindows(stored, chapter))
const worldOf = (b: ScenarioBundle): World<undefined> => worldFromScenario(b, flatField(100), 'both')
const header = (sha: string): FlightRecordHeader => ({
  build: { id: 'test-build', dirty: false }, content: { scenarioId: 'stored-window', sha256: sha },
  launch: { aircraftSpec: 'f6f-hellcat', loadout: 'both', timeOfDay: 12, weather: {}, difficulty: 'veteran', assists: { stallLimiter: false, autoRudder: false }, arcadeDamage: false, dev: {} },
  environment: { browser: 'test', os: 'test', gpu: 'test', graphics: {} },
})

describe('a campaign flight launched from a stored window', () => {
  // The stored world says Tacloban has already been taken to the endgame and Jinamoc is in the alternate; A3's own window is buildup.
  const stored = { tacloban: 'endgame', jinamoc: 'j6-alternate' }
  const storedBundle = bundleFor(stored)
  const chapterBundle = bundleFor({})

  it('draws the stored windows, not the chapter\'s', () => {
    expect(storedBundle.airfields.tacloban!.serviceable).toBe(true) // endgame
    expect(chapterBundle.airfields.tacloban!.serviceable).toBe(true) // buildup
    const a = storedBundle.airfields.tacloban!.buildings.map((b) => `${b.id}:${b.state ?? 'intact'}`).join()
    const b = chapterBundle.airfields.tacloban!.buildings.map((x) => `${x.id}:${x.state ?? 'intact'}`).join()
    expect(a).not.toBe(b)
    expect(storedBundle.airfields.jinamoc!.serviceable).toBe(false) // j6-alternate: abandoned
    expect(chapterBundle.airfields.jinamoc!.serviceable).toBe(true) // buildup
    expect(worldChecksum(worldOf(storedBundle))).not.toBe(worldChecksum(worldOf(chapterBundle)))
  })

  it('records and replays bit for bit from the stored world, through a compress and decode, and is refused against the chapter\'s own window', async () => {
    const sha = await sha256(storedBundle)
    expect(sha).not.toBe(await sha256(chapterBundle))
    const initial = worldOf(storedBundle)
    const recorder = createDevFlightRecorder(header(sha), initial)
    let world = initial
    for (let i = 0; i < 12 / DT; i++) {
      world = advance(withControls(world, world.player, { pitch: 0.02 * Math.sin(i * DT), roll: 0.05 * Math.sin(i * DT * 0.5), yaw: 0, throttle: 0.8 }), DT, undefined, undefined, false, undefined, recorder.observe).world
    }
    const record = recorder.finish(world, { headline: 'STORED WINDOW' })
    expect(record.valid).toBe(true)
    expect(record.packets.length).toBeGreaterThan(300)
    const decoded = await decodeFlightRecord(await encodeFlightRecord(record))

    const replay = verifyFlightRecord(decoded, worldOf(bundleFor(stored)), { buildId: 'test-build', contentSha256: sha })
    expect(replay.ok).toBe(true)
    if (replay.ok) expect(worldChecksum(replay.world)).toBe(worldChecksum(world))

    // the same record against the world a chapter-window launch would build: content mismatch, and the initial world differs too
    const wrongContent = verifyFlightRecord(decoded, worldOf(chapterBundle), { buildId: 'test-build', contentSha256: await sha256(chapterBundle) })
    expect(wrongContent.ok).toBe(false)
    const wrongWorld = verifyFlightRecord(decoded, worldOf(chapterBundle), { buildId: 'test-build' })
    expect(wrongWorld.ok).toBe(false)
    if (!wrongWorld.ok) expect(wrongWorld.message).toMatch(/initial world mismatch/)
  })
})
