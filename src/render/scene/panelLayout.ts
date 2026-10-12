export const PANEL_AHEAD_M = 0.6
export const INSTRUMENT_SCALE = 2 / 3
export const degreesBelowEye = (m: number): number => Math.atan2(m, PANEL_AHEAD_M) * 180 / Math.PI
export const metresBelowEye = (deg: number): number => Math.tan(deg * Math.PI / 180) * PANEL_AHEAD_M

// The approved C3 cockpit reference has a real coaming rather than a shallow
// HUD strip: its crown begins three degrees below the eye line, the compass
// sits under that crown, and the main instruments occupy the middle/lower
// third of the view. Keep these in projected metres so the arrangement remains
// stable at every supported aspect ratio.
const UPPER_TOP = metresBelowEye(4)
export const HORIZON_KEEP_DEG = 4
export type Band = { readonly top: number; readonly bottom: number }
const LOWER_TOP = 0.185
const LOWER_BOTTOM = 0.312
export const PANEL_BANDS: { readonly upper: Band; readonly auxiliary: Band; readonly lower: Band } = {
  upper: { top: UPPER_TOP, bottom: 0.145 },
  // RPM and slip live in the upper-right shoulder, between the compass and
  // main row, as in the approved dashboard rather than on the bottom edge.
  auxiliary: { top: 0.106, bottom: 0.180 },
  lower: { top: LOWER_TOP, bottom: LOWER_BOTTOM },
}

export const DIAL_GAP = 0.165 * INSTRUMENT_SCALE
export const DIAL_RADIUS = 0.0675 * INSTRUMENT_SCALE
export type Slot = { readonly id: string; readonly centreX: number; readonly widthM: number; readonly band?: keyof typeof PANEL_BANDS }
const dialWidth = DIAL_RADIUS * 2.18

// All slots use the lower band; heading alone occupies the upper band.
export const PANEL_SLOTS: readonly Slot[] = [
  { id: 'throttle', centreX: -0.48, widthM: 0.050 },
  { id: 'airspeed', centreX: -0.34, widthM: dialWidth },
  { id: 'altimeter', centreX: -0.21, widthM: dialWidth },
  { id: 'radar', centreX: 0, widthM: 0.14 },
  // The approved fascia's attitude opening is larger than the numeric dials;
  // its live ball fills that opening instead of inheriting `dialWidth`.
  { id: 'attitude', centreX: 0.199, widthM: 0.116 },
  { id: 'verticalSpeed', centreX: 0.32, widthM: dialWidth },
  { id: 'fuel', centreX: 0.48, widthM: 0.050 },
  { id: 'slip', centreX: 0.32, widthM: dialWidth, band: 'auxiliary' },
  { id: 'rpm', centreX: 0.22, widthM: dialWidth, band: 'auxiliary' },
]
