export const PANEL_AHEAD_M = 0.6
/** Sky left clear below the eye line, so the panel never hides the horizon. */
export const HORIZON_KEEP_DEG = 3

export const degreesBelowEye = (m: number): number =>
  (Math.atan2(m, PANEL_AHEAD_M) * 180) / Math.PI
export const metresBelowEye = (deg: number): number =>
  Math.tan((deg * Math.PI) / 180) * PANEL_AHEAD_M

export type Band = { readonly top: number; readonly bottom: number }

const UPPER_TOP = metresBelowEye(HORIZON_KEEP_DEG)   // 0.0314 m
const UPPER_H = 0.098                                 // tape strip + radar row
const GUTTER = 0.010
const LOWER_H = 0.172                                 // readout + dial + label

export const PANEL_BANDS: { readonly upper: Band; readonly lower: Band } = {
  upper: { top: UPPER_TOP, bottom: UPPER_TOP + UPPER_H },
  lower: { top: UPPER_TOP + UPPER_H + GUTTER, bottom: UPPER_TOP + UPPER_H + GUTTER + LOWER_H },
}
