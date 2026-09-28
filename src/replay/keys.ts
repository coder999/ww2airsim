import { DT } from '../sim/flight/model.js'
import type { ReplayCameraId } from './cameras.js'
import type { ReplayCommand, ReplaySpeed } from './player.js'
import { STEP_S } from './player.js'

/**
 * What one key press means while a replay is up (instant replay spec §6; plan
 * Global Constraints). Pure: `main.ts` routes EVERY keydown here while a
 * replay owns the keyboard, so a flight toggle (L stall limiter, R, Q mute,
 * P, Tab, I, /, T) can never reach the flight underneath (Review Focus 1).
 * WASD / Q / E are HELD Manual-camera movement, read from the replay's own
 * held set every frame, so they are not actions here and map to `null`.
 */
export type ReplayKeyAction =
  | { readonly kind: 'command'; readonly command: ReplayCommand }
  | { readonly kind: 'camera'; readonly id: ReplayCameraId }
  | { readonly kind: 'cycleCamera' }
  | { readonly kind: 'spin' }
  | { readonly kind: 'lock' }
  | { readonly kind: 'exit' }

/** 4-9, in `REPLAY_CAMERAS` (button) order. The bar prints these as its key hints. */
export const REPLAY_CAMERA_KEYS: Readonly<Record<ReplayCameraId, string>> = {
  auto: 'Digit4', orbit: 'Digit5', flyby: 'Digit6', target: 'Digit7', cockpit: 'Digit8', manual: 'Digit9',
}
const SPEED_KEYS: Readonly<Record<string, ReplaySpeed>> = { Digit1: 0.5, Digit2: 1, Digit3: 3 }
const CAMERA_BY_KEY = new Map(Object.entries(REPLAY_CAMERA_KEYS).map(([id, code]) => [code, id as ReplayCameraId] as const))

export function replayKeyAction(code: string, shift: boolean): ReplayKeyAction | null {
  const step = shift ? DT : STEP_S
  switch (code) {
    case 'Space': return { kind: 'command', command: { kind: 'togglePlay' } }
    case 'ArrowLeft': return { kind: 'command', command: { kind: 'step', seconds: -step } }
    case 'ArrowRight': return { kind: 'command', command: { kind: 'step', seconds: step } }
    case 'KeyC': return { kind: 'cycleCamera' }
    case 'KeyO': return { kind: 'spin' }
    case 'KeyL': return { kind: 'lock' }
    case 'Escape': return { kind: 'exit' }
  }
  const speed = SPEED_KEYS[code]
  if (speed !== undefined) return { kind: 'command', command: { kind: 'speed', speed } }
  const id = CAMERA_BY_KEY.get(code)
  return id === undefined ? null : { kind: 'camera', id }
}
