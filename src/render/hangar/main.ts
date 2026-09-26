// src/render/hangar/main.ts
import { initRenderer, normalizeGpuError } from '../renderer.js'
import { showFailure, type FailureKind } from '../failure.js'
import { buildCatalog, type CatalogEntry } from './catalog.js'
import { loadHangarContent } from './contentIndex.js'
import { loadHangarModel, type HangarModel, type PartPose } from './models.js'
import { figuresFor } from './stats.js'
import { createStage } from './stage.js'
import { createPanel } from './panel.js'
import { mountBench } from './bench.js'
import { benchEnabled } from './benchFlag.js'
import { installHangarHooks, type HangarWindow } from './hooks.js'
import { loadRegisteredAirframe } from '../scenarioEntities.js'
import { makeShipViewLoader } from '../scene/shipModels.js'

/**
 * hangar.html's entry: the object library and articulation bench (Hangar
 * spec). Never imports the game's main.ts; loads no terrain, sky, clouds or
 * sim loop.
 */
const root = document.getElementById('app')!

async function boot(): Promise<void> {
  const validationErrors: string[] = []
  // A ship model that fails draws boxes and lands here, which Tier 2 check 1 asserts empty (ship-models spec §3.4).
  const loadShips = makeShipViewLoader((message) => { validationErrors.push(message) })
  let resolveReady!: () => void
  const ready = new Promise<void>((r) => { resolveReady = r })

  let catalog: CatalogEntry[]
  try {
    catalog = buildCatalog(loadHangarContent())
  } catch (e) {
    showFailure(root, 'bad-content', e instanceof Error ? e.message : String(e))
    return
  }

  // minmax(0, ...) on both tracks: a grid item's default min size is its
  // content, so the canvas's own pixel width would otherwise widen its column
  // past the window and the panel would grow to the list's full height
  // (measured 2026-09-25: canvas right edge at 1660 px in a 1280 px window).
  root.style.cssText = 'display:grid;grid-template-columns:380px minmax(0,1fr);grid-template-rows:minmax(0,1fr);height:100%'
  const canvas = document.createElement('canvas')
  canvas.id = 'hangar-canvas'
  canvas.style.cssText = 'width:100%;height:100%;display:block;min-width:0;min-height:0'
  const { renderer, adapterVerdict } = await initRenderer(canvas)
  // initRenderer sizes the canvas to the whole window, inline style included
  // (renderer.ts's setSize); here it fills its grid column instead, and fit()
  // below sizes the drawing buffer from that.
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  if (adapterVerdict.severity === 'fail') {
    showFailure(root, 'software-adapter', adapterVerdict.summary)
    return
  }
  renderer.onError = (info) => { validationErrors.push(normalizeGpuError(info)) }

  let model: HangarModel | null = null
  let selected: CatalogEntry | null = null
  let frozen = false
  const bench = benchEnabled(import.meta.env.DEV, location.search)
  const pose = (p: PartPose): void => { model?.pose(p) }

  const select = async (id: string): Promise<void> => {
    const entry = catalog.find((e) => e.library.id === id)
    if (!entry) throw new Error(`hangar: no library entry "${id}"`)
    const next = await loadHangarModel(entry, loadRegisteredAirframe, loadShips)
    model?.dispose()
    model = next
    selected = entry
    stage.show(model?.root ?? null, entry.subject === null ? null : entry.library.kind)
    panel.showCard(entry, figuresFor(entry), stage.modelSize())
    if (bench) mountBench(panel.benchSlot, model?.parts ?? [], pose)
  }

  const panel = createPanel(root, catalog, (id) => {
    select(id).catch((e: unknown) => validationErrors.push(e instanceof Error ? e.message : String(e)))
  })
  root.appendChild(canvas)
  const stage = createStage(renderer, canvas)
  const fit = (): void => stage.resize(canvas.clientWidth, canvas.clientHeight)
  window.addEventListener('resize', fit)
  fit()

  installHangarHooks(window as HangarWindow, {
    ready,
    entries: () => catalog.filter((e) => e.subject !== null).map((e) => e.library.id),
    select,
    pose,
    tick: (frameS) => model?.update(frameS),
    camera: (p) => stage.setPreset(p),
    freeze: () => { frozen = true; stage.freeze() },
    setModelVisible: (v) => stage.setModelVisible(v),
    current: () => (selected ? { id: selected.library.id, kind: selected.library.kind, parts: model?.parts ?? [] } : null),
    validationErrors,
  })

  const first = catalog.find((e) => e.subject !== null)
  if (first) await select(first.library.id)

  let last = performance.now()
  renderer.setAnimationLoop(() => {
    const now = performance.now()
    if (!frozen) model?.update((now - last) / 1000)
    last = now
    stage.render()
  })
  resolveReady()
}

void boot().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e)
  const kind: FailureKind = msg === 'no-webgpu' ? 'no-webgpu' : msg === 'no-adapter' ? 'no-adapter' : 'unknown'
  showFailure(root, kind, msg)
})
