import { describe, it, expect, vi } from 'vitest'
import { createRafLoop } from '../../src/render/rafLoop.js'

/** A controllable stand-in for the browser's frame scheduler. */
function fakeScheduler() {
  let next = 1
  const pending = new Map<number, (now: number) => void>()
  return {
    raf: (cb: (now: number) => void): number => {
      const id = next++
      pending.set(id, cb)
      return id
    },
    caf: vi.fn((id: number): void => {
      pending.delete(id)
    }),
    /** Run every callback currently queued, as one animation frame would. */
    tick(now = 0): void {
      const due = [...pending.entries()]
      pending.clear()
      for (const [, cb] of due) cb(now)
    },
    get queued(): number {
      return pending.size
    },
  }
}

describe('createRafLoop', () => {
  it('keeps rescheduling itself while running', () => {
    const s = fakeScheduler()
    const frame = vi.fn()
    createRafLoop(frame, s.raf, s.caf).start()
    s.tick()
    s.tick()
    s.tick()
    expect(frame).toHaveBeenCalledTimes(3)
    expect(s.queued).toBe(1)
  })

  it('runs nothing further once stopped, which is the whole point (I-3)', () => {
    // Whole-branch review, I-3: on device loss `showFailure` detached the
    // canvas and nothing cancelled the frame chain, so the loop went on
    // rendering to a dead GPU and writing an overlay into a detached element
    // for as long as the tab stayed open. Every validation error it provoked
    // landed in the diagnostics array after the failure the operator is
    // meant to be reading.
    const s = fakeScheduler()
    const frame = vi.fn()
    const loop = createRafLoop(frame, s.raf, s.caf)
    loop.start()
    s.tick()
    expect(frame).toHaveBeenCalledTimes(1)
    loop.stop()
    s.tick()
    s.tick()
    expect(frame).toHaveBeenCalledTimes(1)
    expect(s.queued).toBe(0)
  })

  it('cancels the frame already queued rather than only refusing the next one', () => {
    // Stopping by flag alone leaves one more callback scheduled, so exactly
    // one further frame runs after the failure screen is up. The guard inside
    // the callback has to be there too, but on its own it is not a stop.
    const s = fakeScheduler()
    const loop = createRafLoop(vi.fn(), s.raf, s.caf)
    loop.start()
    expect(s.queued).toBe(1)
    loop.stop()
    expect(s.caf).toHaveBeenCalledTimes(1)
    expect(s.queued).toBe(0)
  })

  it('does not schedule a successor for a frame that is running when stop lands', () => {
    // onDeviceLost can fire from inside a render call, i.e. from inside the
    // frame callback itself. The reschedule at the end of that same callback
    // must not resurrect the loop.
    const s = fakeScheduler()
    const loop: { stop: () => void } = { stop: () => {} }
    const real = createRafLoop(() => loop.stop(), s.raf, s.caf)
    loop.stop = () => real.stop()
    real.start()
    s.tick()
    expect(s.queued).toBe(0)
    expect(real.running).toBe(false)
  })

  it('is idempotent, so a stop during teardown cannot double-cancel', () => {
    const s = fakeScheduler()
    const loop = createRafLoop(vi.fn(), s.raf, s.caf)
    loop.start()
    loop.stop()
    loop.stop()
    expect(s.caf).toHaveBeenCalledTimes(1)
    expect(loop.running).toBe(false)
  })

  it('refuses to restart, so a late event cannot revive a dead device', () => {
    const s = fakeScheduler()
    const frame = vi.fn()
    const loop = createRafLoop(frame, s.raf, s.caf)
    loop.start()
    loop.stop()
    loop.start()
    s.tick()
    expect(frame).not.toHaveBeenCalled()
    expect(loop.running).toBe(false)
  })

  it('reports the timestamp the scheduler gave it, unmodified', () => {
    const s = fakeScheduler()
    const frame = vi.fn()
    createRafLoop(frame, s.raf, s.caf).start()
    s.tick(1234.5)
    expect(frame).toHaveBeenCalledWith(1234.5)
  })
})

describe('createRafLoop when a frame throws', () => {
  it('stops honestly rather than reporting itself as running', () => {
    // The throw escapes the rAF callback, so no reschedule happens and the
    // loop is dead. Before this it still answered `running === true`, which
    // main.ts's resize handler is gated on, and `start()` refused to revive it
    // because it short-circuits on that same flag. A loop that has stopped
    // must say so.
    const s = fakeScheduler()
    const boom = new Error('render exploded')
    const loop = createRafLoop(
      () => {
        throw boom
      },
      s.raf,
      s.caf,
    )
    loop.start()
    expect(() => s.tick()).toThrow(boom)
    expect(loop.running).toBe(false)
    expect(s.queued).toBe(0)
  })

  it('re-throws rather than swallowing, so the failure is visible', () => {
    const s = fakeScheduler()
    const loop = createRafLoop(
      () => {
        throw new Error('nope')
      },
      s.raf,
      s.caf,
    )
    loop.start()
    expect(() => s.tick()).toThrow('nope')
  })
})
