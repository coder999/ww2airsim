import { CAMERA_VFOV_DEG } from '../camera.js'

export const PANEL_AHEAD_M = 0.6
export const INSTRUMENT_SCALE = 2 / 3
export const degreesBelowEye = (m: number): number => Math.atan2(m, PANEL_AHEAD_M) * 180 / Math.PI
export const metresBelowEye = (deg: number): number => Math.tan(deg * Math.PI / 180) * PANEL_AHEAD_M

// Reduce the old visible panel height by one third, anchored to the screen
// bottom. Work in projected (tangent) space, not a fraction of the FOV angle.
const FRAME_BOTTOM = metresBelowEye(CAMERA_VFOV_DEG / 2)
const OLD_TOP = metresBelowEye(3)
const UPPER_TOP = FRAME_BOTTOM - (FRAME_BOTTOM - OLD_TOP) * INSTRUMENT_SCALE
export const HORIZON_KEEP_DEG = degreesBelowEye(UPPER_TOP)
export type Band = { readonly top: number; readonly bottom: number }
const LOWER_BOTTOM = OLD_TOP + 0.098 + 0.010 + 0.190
const LOWER_TOP = LOWER_BOTTOM - 0.190 * INSTRUMENT_SCALE
export const PANEL_BANDS: { readonly upper: Band; readonly lower: Band } = {
  upper: { top: UPPER_TOP, bottom: LOWER_TOP - 0.010 * INSTRUMENT_SCALE },
  lower: { top: LOWER_TOP, bottom: LOWER_BOTTOM },
}

export const DIAL_GAP = 0.165 * INSTRUMENT_SCALE
export const DIAL_RADIUS = 0.06 * INSTRUMENT_SCALE
export type Slot = { readonly id: string; readonly centreX: number; readonly widthM: number }
const dialWidth = DIAL_RADIUS * 2.18

// All slots use the lower band; heading alone occupies the upper band.
export const PANEL_SLOTS: readonly Slot[] = [
  { id: 'throttle', centreX: -0.39, widthM: 0.042 },
  { id: 'airspeed', centreX: -0.26, widthM: dialWidth },
  { id: 'altimeter', centreX: -0.15, widthM: dialWidth },
  { id: 'radar', centreX: 0, widthM: 0.14 },
  { id: 'attitude', centreX: 0.15, widthM: dialWidth },
  { id: 'verticalSpeed', centreX: 0.26, widthM: dialWidth },
  { id: 'fuel', centreX: 0.39, widthM: 0.05 },
]
