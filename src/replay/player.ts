import { recordingEndS, recordingStartS, type Recording } from './recorder.js'

/** Instant replay spec §4 and §6; plan rulings R-8, R-11. Pure: `main.ts` owns the clock. */
export type ReplaySpeed = 0.5 | 1 | 3
/** 'finish': the end is done (the crash replay and Watch replay). 'hold': pause on the last frame (manual). */
export type ReplayEnd = 'finish' | 'hold'

export type ReplayPlayer = {
  readonly recording: Recording
  readonly startS: number
  readonly endS: number
  readonly tS: number
  readonly speed: ReplaySpeed
  readonly playing: boolean
  readonly end: ReplayEnd
  readonly done: boolean
  /** True for the one frame after `tS` jumped (a seek, a step, a restart): effects and sound rebuild. */
  readonly jumped: boolean
}

export type ReplayCommand =
  | { readonly kind: 'togglePlay' }
  | { readonly kind: 'step'; readonly seconds: number }
  | { readonly kind: 'speed'; readonly speed: ReplaySpeed }
  | { readonly kind: 'seek'; readonly tS: number }
  | { readonly kind: 'skip' }

export const AUTO_BEFORE_S = 8
export const AUTO_AFTER_S = 1.5
export const MANUAL_MIN_S = 3
export const STEP_S = 1

export const autoWindow = (r: Recording) => ({
  startS: Math.max(recordingStartS(r), recordingEndS(r) - AUTO_BEFORE_S),
  endS: recordingEndS(r) + AUTO_AFTER_S,
})
export const manualWindow = (r: Recording) => ({ startS: recordingStartS(r), endS: recordingEndS(r) })
export const manualReplayAvailable = (r: Recording | null): boolean =>
  r !== null && recordingEndS(r) - recordingStartS(r) >= MANUAL_MIN_S - 1e-9

export function startReplay(recording: Recording, window: { readonly startS: number; readonly endS: number }, end: ReplayEnd): ReplayPlayer {
  return { recording, startS: window.startS, endS: window.endS, tS: window.startS, speed: 1, playing: true, end, done: false, jumped: true }
}

const clampT = (p: ReplayPlayer, t: number): number => Math.min(p.endS, Math.max(p.startS, t))

export function stepReplay(p: ReplayPlayer, frameMs: number): ReplayPlayer {
  if (p.done) return p
  if (!p.playing) return p.jumped ? { ...p, jumped: false } : p
  const tS = clampT(p, p.tS + (Math.max(0, frameMs) / 1000) * p.speed)
  if (tS >= p.endS) return p.end === 'finish' ? { ...p, tS, done: true, jumped: false } : { ...p, tS, playing: false, jumped: false }
  return { ...p, tS, jumped: false }
}

export function applyReplayCommand(p: ReplayPlayer, c: ReplayCommand): ReplayPlayer {
  if (p.done) return p
  switch (c.kind) {
    case 'togglePlay':
      // R-8: Play at the end of a held replay starts it over.
      if (!p.playing && p.tS >= p.endS) return { ...p, tS: p.startS, playing: true, jumped: true }
      return { ...p, playing: !p.playing }
    case 'step':
      return { ...p, tS: clampT(p, p.tS + c.seconds), playing: false, jumped: true }
    case 'seek':
      return { ...p, tS: clampT(p, c.tS), jumped: true }
    case 'speed':
      return { ...p, speed: c.speed }
    case 'skip':
      return { ...p, done: true }
  }
}
