/**
 * The title screen's loading strip, as a model (loading spec §A.2). Stages
 * run strictly in `BOOT_STAGES` order; the fraction moves only when a stage
 * ENDS, because a stage's own work is one blocking task the page cannot
 * paint through -- the strip's moving stripe (a compositor-driven CSS
 * transform, titleScreen.ts) is what shows it is still alive in between.
 *
 * Weights are proportional to each stage's measured duration after the
 * cloud-shader fix (spec §A.3): median of 8 cold-cache boots on the
 * reference GPU, 2026-09-26 -- renderer 305 ms, sky 439, surface 422,
 * shaders 1 165 (the handoff has every run). Terrain is deliberately absent:
 * it loads after the render loop starts and a ground spawn is held until it
 * lands (plan ruling, spec §A.2).
 */
export type BootStage = 'renderer' | 'sky' | 'surface' | 'shaders'

export const BOOT_STAGES: readonly { readonly stage: BootStage; readonly weight: number; readonly label: string }[] = [
  { stage: 'renderer', weight: 2, label: 'Starting the graphics device...' },
  { stage: 'sky', weight: 3, label: 'Loading the sky...' },
  { stage: 'surface', weight: 3, label: 'Loading the ocean and land...' },
  { stage: 'shaders', weight: 8, label: 'Compiling shaders...' },
]

const IDLE_LABEL = 'Preparing aircraft...'
const TOTAL_WEIGHT = BOOT_STAGES.reduce((sum, s) => sum + s.weight, 0)

export type BootProgress = {
  begin(stage: BootStage): void
  end(stage: BootStage): void
  readonly fraction: number
  readonly label: string
  readonly ready: boolean
  /** Returns the unsubscribe; `titleScreen.ts` subscribes once per `build()`. */
  onChange(listener: () => void): () => void
}

export function createBootProgress(): BootProgress {
  let next = 0                      // index of the stage expected to begin
  let running: BootStage | null = null
  let done = 0                      // summed weight of ended stages
  const listeners = new Set<() => void>()
  const notify = (): void => { for (const l of [...listeners]) l() }
  return {
    begin(stage) {
      const expected = BOOT_STAGES[next]
      if (running !== null || expected === undefined || expected.stage !== stage) {
        throw new Error(`boot stage "${stage}" began out of order (expected "${expected?.stage ?? 'none'}"${running ? `, "${running}" still running` : ''})`)
      }
      running = stage
      notify()
    },
    end(stage) {
      if (running !== stage) throw new Error(`boot stage "${stage}" ended without beginning`)
      done += BOOT_STAGES[next]!.weight
      running = null
      next++
      notify()
    },
    get fraction() { return next >= BOOT_STAGES.length ? 1 : done / TOTAL_WEIGHT },
    get label() {
      if (running === null) return IDLE_LABEL
      return BOOT_STAGES.find((s) => s.stage === running)!.label
    },
    get ready() { return next >= BOOT_STAGES.length },
    onChange(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

/** Already finished: what `createTitleScreen` uses when no boot is passed. */
export function readyBootProgress(): BootProgress {
  const p = createBootProgress()
  for (const { stage } of BOOT_STAGES) { p.begin(stage); p.end(stage) }
  return p
}
