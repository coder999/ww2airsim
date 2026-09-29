import type { World } from '../sim/loop.js'
import { DT } from '../sim/flight/model.js'

/**
 * The last 10 s of the flight, as the immutable `World`s the frame loop
 * produced (instant replay spec §3, IR-1). One world per ADVANCED FRAME, not
 * per tick (plan ruling R-1): `advance` hands back only a frame's last world,
 * so at triple time the recorded worlds are ~3 ticks apart and replay lerps
 * across the gap. The span is counted in ticks, so it is 10 s of sim time
 * however many frames that took.
 */
export const REPLAY_SPAN_TICKS = 600
/** 1 records every advanced frame; 2 halves memory (spec §9's first step). Set by Task 1's measurement. */
export const REPLAY_MIN_TICK_GAP = 1

export type Recording = { readonly worlds: readonly World<undefined>[] }

export type Recorder = {
  push(world: World<undefined>): void
  snapshot(): Recording | null
  clear(): void
  size(): number
}

export function createRecorder(o: { readonly spanTicks?: number; readonly minTickGap?: number } = {}): Recorder {
  const span = o.spanTicks ?? REPLAY_SPAN_TICKS
  const gap = o.minTickGap ?? REPLAY_MIN_TICK_GAP
  let worlds: World<undefined>[] = []
  return {
    push(world) {
      const last = worlds[worlds.length - 1]
      if (last !== undefined) {
        // A tick that went backwards is a new flight (Restart, New game).
        if (world.tick < last.tick) worlds = []
        // Held frame (paused, impact hold, ground spawn): the same world again.
        else if (world.tick - last.tick < gap) return
      }
      worlds.push(world)
      const oldest = world.tick - span
      let drop = 0
      while (drop < worlds.length - 1 && worlds[drop]!.tick < oldest) drop++
      if (drop > 0) worlds = worlds.slice(drop)
    },
    snapshot: () => (worlds.length === 0 ? null : { worlds: worlds.slice() }),
    clear() { worlds = [] },
    size: () => worlds.length,
  }
}

export const recordingStartS = (r: Recording): number => r.worlds[0]!.tick * DT
export const recordingEndS = (r: Recording): number => r.worlds[r.worlds.length - 1]!.tick * DT
