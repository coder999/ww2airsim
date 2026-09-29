import type { ClipId } from './assets.js'
import type { Bus } from './mix.js'
import { ENGINE_GLIDE_TAU_S, type EngineFamily, PROPELLER_SAMPLE_RATE, loopEndSeconds, loopStartSeconds } from './mix.js'

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

/** Loop points are searched with `npx tsx tools/audio/findloop.ts <clip>` and stated in frames of a
 *  48 kHz file (asserted in tests/audio/loopPoints.test.ts). */
const seconds = (frame: number): number => frame / PROPELLER_SAMPLE_RATE

/** Ambience glides slowly: it follows altitude and range, not a pilot's hand. */
const AMBIENT_GLIDE_TAU_S = 0.3

/** The engine layer each family drives; `system.update` drives the player's and fades any other
 *  that has been started (an aircraft change on restart). */
export const ENGINE_LAYER_FOR: Readonly<Record<EngineFamily, string>> = {
  radial: 'engine', multi_heavy: 'engine_multi_heavy', allison: 'engine_allison',
}

export const LAYERS = {
  engine: {
    clip: 'propeller',
    bus: 'engine',
    loopStartS: loopStartSeconds(),
    loopEndS: loopEndSeconds(),
    glideTauS: ENGINE_GLIDE_TAU_S,
  },
  engine_multi_heavy: {
    clip: 'engine_multi_heavy', bus: 'engine', loopStartS: seconds(4_929), loopEndS: seconds(361_296), glideTauS: ENGINE_GLIDE_TAU_S,
  },
  engine_allison: {
    clip: 'engine_allison_v12', bus: 'engine', loopStartS: seconds(13_649), loopEndS: seconds(350_672), glideTauS: ENGINE_GLIDE_TAU_S,
  },
  sea: {
    clip: 'sea_waves', bus: 'ambient', loopStartS: seconds(7_681), loopEndS: seconds(670_256), glideTauS: AMBIENT_GLIDE_TAU_S,
  },
  deck: {
    clip: 'carrier_deck', bus: 'ambient', loopStartS: seconds(45_409), loopEndS: seconds(679_536), glideTauS: AMBIENT_GLIDE_TAU_S,
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
