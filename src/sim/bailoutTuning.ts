/**
 * Every number the bailout and the rescue resolver tune on, in one place (plan F7A Task 2).
 *
 * SI inside, imperial at display (`src/render/bailoutText.ts`). **Every value here is an ESTIMATE**: checked
 * 2026-10-15, no repo source cites a descent rate, a deployment time or an exit height (ASSETS.md cites TM 1-440
 * only for the 28 ft canopy size, and the F4R rig is an 8.0 m bell). Round personnel canopies of this class are
 * usually quoted nearer 20-25 ft/s than 18, so the sink rate is on the gentle side; Mark accepted it (2026-10-15).
 * `tests/sim/bailoutTuning.test.ts` ties the safe-descent rule to the model, so a change here that makes them
 * disagree fails there.
 */
type Xyz = { readonly x: number; readonly y: number; readonly z: number }
export type BailoutTuning = {
  readonly minExitAglM: number; readonly safeOpenAglM: number; readonly deploySeconds: number; readonly separationSeconds: number
  readonly sinkMps: number; readonly canopyHorizontalRate: number; readonly canopyVerticalRate: number
  readonly survivableContactMps: number; readonly airborneAglM: number
  readonly exitOffsetM: Xyz; readonly exitImpulseMps: Xyz
}
export type RecoveryTuning = { readonly [K in keyof typeof RECOVERY_VALUES]: number }

export const BAILOUT_TUNING: BailoutTuning = Object.freeze({
  /** ESTIMATE. Below this the jump is refused with a message (about 49 ft). The only refusal by height or speed. */
  minExitAglM: 15,
  /** ESTIMATE. Below this a jump cannot complete a safe descent (about 246 ft): the canopy is not full in time. */
  safeOpenAglM: 75,
  /** ESTIMATE. Exit to a full canopy, in seconds. */
  deploySeconds: 2,
  /** ESTIMATE. Of that, the part spent clearing the airframe before the canopy starts to open. */
  separationSeconds: 0.75,
  /** ESTIMATE. Steady descent under a full canopy (about 18 ft/s). */
  sinkMps: 5.5,
  /** ESTIMATE. First-order settle rates (1/s) of the canopy toward the wind and the sink rate. */
  canopyHorizontalRate: 0.9,
  canopyVerticalRate: 2.2,
  /** ESTIMATE. Touchdown faster than this (about 30 ft/s) kills. */
  survivableContactMps: 9,
  /** Not "airborne" at or below this height above the ground (about 10 ft), so a jump on the ground is refused. */
  airborneAglM: 3,
  /** Exit impulse relative to the airframe, body frame (aft and up), and the pilot's offset from the origin. */
  exitOffsetM: Object.freeze({ x: -2.2, y: 1.2, z: 0 }),
  exitImpulseMps: Object.freeze({ x: -4, y: 1.5, z: 0 }),
})

/** Seconds of the deployment spent opening the canopy once clear of the airframe. */
export const openingSeconds = (t: BailoutTuning = BAILOUT_TUNING): number => t.deploySeconds - t.separationSeconds

/** ESTIMATE. How the rescue resolver weighs what is nearby. Distances are metres. */
const RECOVERY_VALUES = {
  /** A friendly ship within this range puts rescue coverage on the water (about 15.5 mi). */
  rescueCoverageM: 25_000,
  /** A base or ship this close is "in control" of the spot (about 9.3 mi), if clearly closer than the other side. */
  controlM: 15_000,
  /** Control needs the nearer side to be this much closer than the other. */
  controlRatio: 1.25,
  /** An enemy ship or aircraft this close is "enemy presence" (about 6.2 mi). */
  enemyPresenceM: 10_000,
  baseProbability: 0.5,
  /** Support: up to this much for the nearest friendly (and against, the enemy), fading to zero over `supportFadeM`. */
  supportMax: 0.2,
  supportFadeM: 100_000,
  daylightWeight: 0.16,
  visibilityWeight: 0.2,
  weatherWeight: 0.12,
  waterBase: 0.12,
  seaStateWeight: 0.12,
  enemyPresencePenalty: 0.18,
  rescueLikelyAtLeast: 0.67,
  captureLikelyAtMost: 0.33,
}
export const RECOVERY_TUNING: RecoveryTuning = Object.freeze(RECOVERY_VALUES)
