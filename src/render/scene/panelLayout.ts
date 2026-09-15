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

/**
 * Dial spacing. Narrowed from 0.20 on 2026-09-13: at 0.20 the panel spanned
 * +/-0.593 m at 0.6 m ahead, subtending 45.0 degrees off boresight, so the
 * outer two dials left the frustum below an aspect ratio of 1.73 -- including
 * on a 3:2 Surface, the only machine that has ever displayed this panel.
 * That is I-7's defect on the other axis, and the horizontal assertion that
 * looked like it covered it compared against the VERTICAL half-angle times a
 * bare 4, giving 2.3x slack, so it could not have caught either.
 *
 * Left at 0.155 on 2026-09-15 (Task 3), which added the horizontal budget
 * assertion in `panelLayout.test.ts`: it measures the outer edge of every
 * layout slot, including the throttle/armament edge blocks that task added,
 * against 40.9 degrees (the horizontal half-angle at `PANEL_MIN_ASPECT`,
 * 3:2). At 0.155 the worst slot (throttle/armament) reaches 40.75 degrees --
 * inside the 40.9-degree edge, so the constant did not need to move.
 */
export const DIAL_GAP = 0.155
export const DIAL_RADIUS = 0.06
/** Throttle column / armament block half-width companion. */
const EDGE_W = 0.052

export type Slot = { readonly id: string; readonly centreX: number; readonly widthM: number }

/**
 * Six positions in the lower row: five dials and the attitude ball. The ball
 * sits fourth, where the round heading dial used to be, so the eye does not
 * have to relearn the row. Ruling R1: `attitude` is a SLOT only -- it has no
 * `GAUGES` entry.
 */
const ROW = ['airspeed', 'altimeter', 'verticalSpeed', 'attitude', 'fuel', 'slip'] as const
const dialX = (i: number): number => (i - (ROW.length - 1) / 2) * DIAL_GAP
const edgeX = (ROW.length * DIAL_GAP) / 2 + EDGE_W / 2

export const PANEL_SLOTS: readonly Slot[] = [
  { id: 'throttle', centreX: -edgeX, widthM: EDGE_W },
  ...ROW.map((id, i) => ({ id, centreX: dialX(i), widthM: DIAL_RADIUS * 2.18 })),
  { id: 'armament', centreX: edgeX, widthM: EDGE_W },
  { id: 'radar', centreX: 0, widthM: 0.16 },
]
