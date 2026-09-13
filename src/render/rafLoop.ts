/**
 * A frame loop that can actually be stopped.
 *
 * Exists because of whole-branch review finding I-3: `main.ts` scheduled
 * itself with a bare `requestAnimationFrame(frameFn)` and there was no
 * `cancelAnimationFrame` anywhere in `src/`. On device loss `showFailure`
 * detaches the canvas, but the chain kept going -- rendering to a dead GPU
 * and writing overlay text into a detached element for as long as the tab
 * stayed open, filling the diagnostics array with errors that arrive AFTER
 * the failure the operator is meant to be reading.
 *
 * The scheduler is injected so this is testable on a machine with no browser,
 * which is every machine this project is developed on. `main.ts` passes the
 * real pair.
 */
export interface RafLoop {
  /** Begin, unless `stop` has already been called. */
  start(): void
  /** Cancel the queued frame and refuse all further ones. Idempotent. */
  stop(): void
  readonly running: boolean
}

export function createRafLoop(
  frame: (now: number) => void,
  raf: (cb: (now: number) => void) => number = requestAnimationFrame,
  caf: (handle: number) => void = cancelAnimationFrame,
): RafLoop {
  let running = false
  // Once stopped, stopped for good. A device-lost failure screen is terminal;
  // a late resize or visibility event must not be able to revive the loop
  // onto a device that no longer exists.
  let stopped = false
  let handle: number | null = null

  const tick = (now: number): void => {
    handle = null
    if (!running) return
    // `frame` may stop the loop from inside itself: onDeviceLost fires during
    // a render call. Hence the re-check below rather than an unconditional
    // reschedule.
    // A throwing frame used to escape the rAF callback and leave the loop
    // silently dead while `running` still said true -- no reschedule, no
    // failure screen, no diagnostic, and `start()` refusing to help because it
    // short-circuits on `running`. That is I-3's own defect inverted: the loop
    // stops without saying so, instead of continuing without stopping. Found
    // by review 2026-09-13.
    try {
      frame(now)
    } catch (error) {
      running = false
      stopped = true
      throw error
    }
    if (running) handle = raf(tick)
  }

  return {
    start(): void {
      if (running || stopped) return
      running = true
      handle = raf(tick)
    },
    stop(): void {
      if (stopped) return
      stopped = true
      running = false
      // A flag alone is not a stop: it leaves one callback queued, so one more
      // frame runs after the failure screen is up.
      if (handle !== null) {
        caf(handle)
        handle = null
      }
    },
    get running(): boolean {
      return running
    },
  }
}
