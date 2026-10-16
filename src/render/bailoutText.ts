/** Every player-facing bailout string, built from the tuning so a tuning change cannot leave the text stale (F7A Task 2). Imperial. */
import { BAILOUT_TUNING, type BailoutTuning } from '../sim/bailoutTuning.js'
import type { BailoutRejection } from '../sim/bailout.js'

const FT_PER_M = 1 / 0.3048
/** Nearest 1 ft would imply a precision the estimates do not have; round to 1 ft only because the table values are exact conversions. */
export const feetText = (m: number): string => `${Math.round(m * FT_PER_M)} ft`
export const feetPerSecondText = (mps: number): string => `${Math.round(mps * FT_PER_M)} ft/s`

type Tuning = BailoutTuning

/** The one-line rule, for help text and the GAMEPLAY wording check. */
export const exitRuleText = (t: Tuning = BAILOUT_TUNING): string =>
  `about ${feetText(t.minExitAglM)} needed to jump, ${feetText(t.safeOpenAglM)} for a safe descent, ${feetPerSecondText(t.sinkMps)} under the canopy (all estimates)`

/** The on-screen message for a refused press. Only "too low" is a height refusal; the others are not a jump at all. */
export function refusalText(reason: BailoutRejection, t: Tuning = BAILOUT_TUNING): string {
  switch (reason) {
    case 'too-low': return `TOO LOW TO BAIL OUT · ABOUT ${feetText(t.minExitAglM).toUpperCase()} NEEDED`
    case 'not-airborne': return 'BAILOUT REQUIRES AIRBORNE FLIGHT'
    case 'aircraft-lost': return 'BAILOUT TOO LATE'
    case 'already-bailed': return 'PILOT ALREADY OUT'
    case 'ground-unavailable': return 'BAILOUT UNAVAILABLE'
  }
}

/** The pre-bailout prompt appended to the rescue cue: honest about a jump that is allowed but will not end well. */
export function jumpPrompt(aglM: number, t: Tuning = BAILOUT_TUNING): string {
  return aglM < t.safeOpenAglM ? `J BAIL OUT · BELOW ${feetText(t.safeOpenAglM).toUpperCase()} THE CANOPY MAY NOT OPEN IN TIME` : 'J BAIL OUT'
}
