import type { ClipId } from './assets.js'
import type { Bus } from './mix.js'
import { ENGINE_GLIDE_TAU_S, loopEndSeconds, loopStartSeconds } from './mix.js'

/**
 * Every looping layer the audio system can drive, by name.
 *
 * Adding a sound that runs continuously (wind, sea, wheel rumble, a second
 * engine) is adding a row here and calling `driveLayer` with its id; no new
 * backend verb. Loop points are `null` for a clip that loops whole.
 */
export type LayerDef = {
  readonly clip: ClipId
  readonly bus: Bus
  readonly loopStartS: number | null
  readonly loopEndS: number | null
  /** Time constant for every parameter write on this layer. Must be > 0: a
   *  step on an AudioParam is an audible click. */
  readonly glideTauS: number
}

export type LayerTable = Readonly<Record<string, LayerDef>>

export const LAYERS = {
  engine: {
    clip: 'engine_radial_small',
    bus: 'engine',
    loopStartS: loopStartSeconds(),
    loopEndS: loopEndSeconds(),
    glideTauS: ENGINE_GLIDE_TAU_S,
  },
} as const satisfies LayerTable

export type LayerDrive = {
  readonly gain: number
  readonly rate: number
  /** Omit to leave the layer's lowpass where it is (initially fully open). */
  readonly cutoffHz?: number
}

/** `x` if finite, else `fallback`. A non-finite value reaching an AudioParam
 *  throws inside the render loop. */
export function finiteOr(x: number, fallback: number): number {
  return Number.isFinite(x) ? x : fallback
}
