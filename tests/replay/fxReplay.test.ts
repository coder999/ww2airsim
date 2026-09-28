import { describe, it, expect } from 'vitest'
import { FX_CATALOG } from '../../src/render/fx/catalog.js'
import { FX_SHEETS, type FxSheetLayout } from '../../src/render/fx/sheetManifest.js'
import { createFxSystem } from '../../src/render/fx/system.js'
import { initialFrameStateFor, nextFrameState } from '../../src/render/frame.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { loadScenarioBundle } from '../../tools/content/load.js'
import { createRecorder } from '../../src/replay/recorder.js'
import { replayPosesAt } from '../../src/replay/view.js'
import { rebuildReplayFx, stepReplayFx } from '../../src/replay/fxReplay.js'
import { DT } from '../../src/sim/flight/model.js'

const layout: FxSheetLayout = { frames: 16, cols: 3, rows: 2, motionScale: 0.02, cellOf: Object.fromEntries(FX_SHEETS.map((s, i) => [s, i])) as FxSheetLayout['cellOf'] }
const fxSys = () => createFxSystem({ capacity: 4096, seed: 1944, catalog: FX_CATALOG, layout })
const anchors = { shipSmokeOrigins: new Map(), structureAnchors: new Map() }

const furball = () => {
  let f = initialFrameStateFor(worldFromScenario(loadScenarioBundle('furball-range'), null))
  const rec = createRecorder()
  for (let i = 0; i < 600; i++) { f = nextFrameState(f, 1 / 60, new Set(['Space'])); rec.push(f.world) }
  return rec.snapshot()!
}

describe('replay effects re-run (spec §7, §8; plan R-3)', () => {
  it('jumping to t equals playing to t, world by world', () => {
    const rec = furball()
    const target = rec.worlds[Math.floor(rec.worlds.length * 0.8)]!
    const tS = target.tick * DT
    const jumped = fxSys()
    rebuildReplayFx(jumped, rec, tS, anchors)
    const played = fxSys()
    let memory = rebuildReplayFx(played, rec, rec.worlds[0]!.tick * DT, anchors)
    for (let i = 1; i < rec.worlds.length && rec.worlds[i]!.tick <= target.tick; i++) {
      const w = rec.worlds[i]!
      memory = stepReplayFx(played, memory, replayPosesAt(rec, w.tick * DT), (w.tick - rec.worlds[i - 1]!.tick) * DT, anchors)
    }
    expect(played.liveSerials()).toEqual(jumped.liveSerials())
  })

  it('a full re-run completes and the furball produced some effects', () => {
    const rec = furball()
    const fx = fxSys()
    rebuildReplayFx(fx, rec, rec.worlds.at(-1)!.tick * DT, anchors)
    expect(fx.live()).toBeGreaterThan(0)
  })
})
