// src/render/hangar/main.ts
import { initRenderer, normalizeGpuError } from '../renderer.js'
import { showFailure, type FailureKind } from '../failure.js'
import { buildCatalog, drawable, type CatalogEntry } from './catalog.js'
import { loadHangarContent } from './contentIndex.js'
import { loadHangarModel, type HangarModel, type PartPose } from './models.js'
import { createBenchController } from './benchController.js'
import { countsReport } from './budgets.js'
import { modelSource } from './provenance.js'
import { figuresFor } from './stats.js'
import { createStage } from './stage.js'
import { createPanel } from './panel.js'
import { mountBench, type BenchHandle, type DebugToggle } from './bench.js'
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
  // A ship model that fails draws boxes and lands here, which E2E check 1 asserts empty (ship-models spec §3.4).
  const loadShips = makeShipViewLoader((message) => { validationErrors.push(message) })
  let resolveReady!: () => void
  const ready = new Promise<void>((r) => { resolveReady = r })

  let catalog: CatalogEntry[]
  let content: ReturnType<typeof loadHangarContent>
  try {
    content = loadHangarContent()
    catalog = buildCatalog(content)
  } catch (e) {
    showFailure(root, 'bad-content', e instanceof Error ? e.message : String(e))
    return
  }

  // minmax(0, ...) on both tracks: a grid item's default min size is its
  // content, so the canvas's own pixel width would otherwise widen its column
  // past the window and the panel would grow to the list's full height
  // (measured 2026-09-25: canvas right edge at 1660 px in a 1280 px window).
  // The third track is the details panel (panel.ts): empty until the first pick, then its own width.
  root.style.cssText = 'display:grid;grid-template-columns:380px minmax(0,1fr) auto;grid-template-rows:minmax(0,1fr);height:100%'
  const canvas = document.createElement('canvas')
  canvas.id = 'hangar-canvas'
  // Placed explicitly: the empty-bay prompt shares this cell, and auto-placement would move one aside.
  canvas.style.cssText = 'grid-area:1/2;width:100%;height:100%;display:block;min-width:0;min-height:0'
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
  let controller = createBenchController(null)
  let benchUi: BenchHandle | null = null
  const debug: Record<DebugToggle, boolean> = { wireframe: false, gizmos: false, turntable: true, checker: false, mounts: false }
  // Track M, M1: the bench's Train mounts sweeps every gun mount +-90 deg about its own axis, so a
  // look shows each one turning alone, on its own pivot; M1b raises the guns from level to each kit's
  // top elevation in the same sweep. Off, they rest at their spec bearing, level.
  let sweepS = 0
  const trainMounts = (rad: number): void => { for (const m of model?.gunMounts ?? []) m.setTraining(rad) }
  /** `frac` of each mount's own top elevation (0 level, 1 its maximum). */
  const elevateMounts = (frac: number): void => { for (const m of model?.gunMounts ?? []) m.setElevation(frac * m.maxElevationRad) }
  const refreshCounts = (): void => { if (model) benchUi?.setCounts(countsReport(model.root, content.budgets)) }
  const pose = (p: PartPose): void => {
    model?.pose(controller.set(p))
    benchUi?.sync(controller.state())
    refreshCounts()
  }
  const onDebug = (which: DebugToggle, on: boolean): void => {
    debug[which] = on
    if (which === 'wireframe') stage.setWireframe(on)
    else if (which === 'checker') stage.setChecker(on)
    else if (which === 'gizmos') stage.setGizmos(on ? model?.articulated ?? [] : null)
    else if (which === 'mounts') { sweepS = 0; trainMounts(0); elevateMounts(0) }
    else stage.setAutoRotate(on)
  }
  // One frame of the bench: a running Cycle, then the model's own clock.
  const step = (frameS: number): void => {
    const p = controller.advance(frameS)
    if (p) {
      model?.pose(p)
      benchUi?.sync(controller.state())
    }
    model?.update(frameS)
    if (debug.mounts) { sweepS += frameS; trainMounts(Math.sin(sweepS * 0.8) * Math.PI / 2); elevateMounts(0.5 - 0.5 * Math.cos(sweepS * 0.6)) }
  }

  const select = async (id: string): Promise<void> => {
    const entry = catalog.find((e) => e.library.id === id)
    if (!entry) throw new Error(`hangar: no library entry "${id}"`)
    emptyBay.remove()
    const next = await loadHangarModel(entry, loadRegisteredAirframe, loadShips)
    model?.dispose()
    model = next
    selected = entry
    stage.show(model?.root ?? null, drawable(entry) ? entry.library.kind : null)
    panel.showCard(entry, figuresFor(entry), stage.modelSize(), model ? modelSource(model.root, content.provenance) : null)
    // A fresh controller per model: a new model starts at rest, never mid-cycle.
    controller = createBenchController(entry.subject?.kind === 'aircraft' ? entry.subject.spec : null)
    if (debug.gizmos) stage.setGizmos(model?.articulated ?? [])
    if (bench) {
      benchUi = mountBench(panel.benchSlot, model?.parts ?? [], entry.subject?.kind === 'aircraft', debug, {
        onPose: pose,
        onCycle: (part) => controller.startCycle(part),
        onDebug,
      })
      refreshCounts()
    }
  }

  const panel = createPanel(root, catalog, (id) => {
    select(id).catch((e: unknown) => validationErrors.push(e instanceof Error ? e.message : String(e)))
  })
  // Over the empty bay until the first pick: the canvas's own cell, so it never takes a column.
  const emptyBay = document.createElement('div')
  emptyBay.className = 'hangar-empty'
  emptyBay.textContent = 'Pick an item'
  emptyBay.style.cssText = 'grid-area:1/2;place-self:center;pointer-events:none;color:var(--paper);opacity:.7;font-family:var(--font-display);font-size:22px;letter-spacing:.15em;text-transform:uppercase'
  root.append(canvas, emptyBay, panel.detail)
  const stage = createStage(renderer, canvas, () => {
    debug.turntable = false
    benchUi?.setDebug('turntable', false)
  })
  const fit = (): void => stage.resize(canvas.clientWidth, canvas.clientHeight)
  // The canvas resizes with the window, and when the details panel appears or collapses.
  new ResizeObserver(fit).observe(canvas)
  fit()

  installHangarHooks(window as HangarWindow, {
    ready,
    entries: () => catalog.filter(drawable).map((e) => e.library.id),
    select,
    pose,
    tick: step,
    camera: (p) => stage.setPreset(p),
    aim: (eye, target) => stage.aim(eye, target),
    freeze: () => { frozen = true; debug.turntable = false; benchUi?.setDebug('turntable', false); stage.freeze() },
    setModelVisible: (v) => stage.setModelVisible(v),
    setUnlit: (on) => stage.setUnlit(on),
    current: () => (selected ? { id: selected.library.id, kind: selected.library.kind, parts: model?.parts ?? [] } : null),
    cycle: (part) => controller.startCycle(part),
    bench: () => controller.state(),
    setDebug: onDebug,
    gizmoNodes: () => (debug.gizmos ? (model?.articulated ?? []).map((o) => o.name) : []),
    counts: () => (model ? countsReport(model.root, content.budgets) : null),
    storeMounts: () => (model ? model.mounts().map((m) => ({ id: m.id, ndc: stage.project(m.world) })) : []),
    gunMounts: () => (model?.gunMounts ?? []).map((m) => m.name),
    trainMounts,
    elevateMounts,
    vehicle: () => model?.vehicle?.state() ?? null,
    validationErrors,
  })

  // Nothing is picked on load: the bay stands empty and the details panel stays away until a
  // pick (Mark, 2026-10-08).

  let last = performance.now()
  renderer.setAnimationLoop(() => {
    const now = performance.now()
    if (!frozen) step((now - last) / 1000)
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
