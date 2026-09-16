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
/**
 * Widened from 0.172, Ruling R11 (Task 6 fix round 2, 2026-09-15): 0.172 was
 * a bookkeeping error from Task 2 that understated what a dial plus its
 * readout and label actually occupy, caught once the per-slot containment
 * test (`tests/render/panel.test.ts`) asserted FULL containment for dials
 * instead of horizontal-only. Nothing was ever visually broken -- the worst
 * band-bottom figure below is still comfortably inside the 30-degree frame
 * edge -- this was purely the declared budget being smaller than the real
 * content.
 *
 * R11 named 0.188 as the fix, reasoned from a bottom-only measurement
 * (drawn bottom at 0.3254 m below eye against a declared 0.3114 m, "uniform
 * 14.0 mm"). Verifying it against the BUILT geometry (this fix) found it
 * still 5 mm short at the TOP: raising `LOWER_H` only pushes `band.bottom`
 * down (`band.top` does not depend on it at all), which re-centres the row
 * by HALF of that increase, not the full amount -- so the 0.016 m raise from
 * 0.172 to 0.188 bought only 8 mm of headroom at the top edge, where 13 mm
 * was owed. The readout above and the label below overshoot by close to the
 * same amount (13 mm top, 14 mm bottom), so both edges bind almost equally;
 * bottom is very slightly the tighter one once the halving is accounted for.
 *
 * Re-derived by measuring the built dial extent at several trial values of
 * this constant (band bottom, degrees below eye, against the still-passing
 * vertical budget assertion in `panelLayout.test.ts`; top/bottom margins are
 * the built dial's own clearance against the declared band, positive = spare
 * room):
 *   0.172 -> 27.43 deg   top margin -13.0 mm   bottom margin -14.0 mm
 *   0.188 -> 28.62 deg   top margin  -5.0 mm   bottom margin  -6.0 mm  (R11's own figure; still short both sides)
 *   0.200 -> 29.50 deg   top margin  +1.0 mm   bottom margin  ~0    mm  (exact fit, bottom-bound)
 *   0.202 -> 29.64 deg   top margin  +2.0 mm   bottom margin  +1.0 mm  (fix round 2's chosen value)
 *
 * Ruling R12 (Task 6 fix round 3, 2026-09-15) rejected 0.202's resulting
 * frame margin -- 30 - 29.64 = 0.36 degrees -- as the same knife-edge shape
 * ruling R4 already rejected on the HORIZONTAL axis (a 0.14-degree margin
 * there, required to be a full 1 degree). The reviewer traced the real slack
 * to the dial's own layout, not the frame: the readout/label sat 0.088 m
 * from the dial's centre against a bezel outer radius of only 0.0654 m (see
 * `DIAL_TEXT_OFFSET_M` in panel.ts), a 30 mm gap neither plate needs. That
 * constant narrowed to 0.08 m, which shrinks the dial's own vertical reach
 * enough to buy the margin back from `LOWER_H` instead of spending it on the
 * frame edge:
 *   0.202, DIAL_TEXT_OFFSET_M=0.088 -> 29.64 deg (0.36 deg margin)  top +2.0 mm   bottom +1.0 mm  (fix round 2)
 *   0.202, DIAL_TEXT_OFFSET_M=0.08  -> 29.64 deg (0.36 deg margin)  top +10.0 mm  bottom +9.0 mm  (offset narrowed; frame margin unchanged, so still not enough)
 *   0.190, DIAL_TEXT_OFFSET_M=0.08  -> 28.77 deg (1.23 deg margin)  top  +4.0 mm  bottom +3.0 mm  (chosen: clears R12's 1-degree minimum with the same kind of headroom R4 required, while every dial keeps a few mm of its own containment margin)
 */
const LOWER_H = 0.190                                 // readout + dial + label

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
 * Task 3 (2026-09-15) added a horizontal budget assertion in
 * `panelLayout.test.ts` measuring the outer edge of every layout slot,
 * including the throttle/armament edge blocks that task added, against the
 * 40.9-degree horizontal half-angle at `PANEL_MIN_ASPECT` (3:2). At 0.155
 * the worst slot (throttle/armament, at 40.75 degrees) cleared that edge by
 * only 0.14 degrees -- a margin that pinned nothing real, since neither
 * throttle (undrawn until Task 4) nor armament (reserved, never drawn) had
 * a bezel yet to breach it. Review ruling R4 required the assertion to
 * demand a full 1-degree margin, which 0.155 does not clear, so the row was
 * narrowed rather than `EDGE_W`: the row had 3.8 degrees of slack against
 * the dials' own scale-mark and numeral constraints, while shrinking
 * `EDGE_W` far enough (to about 0.036) would leave the throttle column too
 * narrow for its ticks and its "100" numeral.
 *
 * Narrowed to 0.145: the dial row now reaches 35.50 degrees, and the worst
 * slot (throttle/armament) reaches 39.07 degrees against the 40.9-degree
 * edge -- a 1.83-degree margin, comfortably past the required 1 degree.
 */
export const DIAL_GAP = 0.145
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
