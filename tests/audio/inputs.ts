import type { AudioInputs } from '../../src/audio/cues.js'

/** The inputs added after the first six cues, at values that fire nothing: a whole aircraft, a
 *  radial, hook up, no carrier. Spread into a literal, then override the one under test. */
export const QUIET_DAMAGE = {
  engineFamily: 'radial', structure: 1, engineHealth: 1, arrested: false, hookDown: false, deckDistanceM: null, ordnanceBlast: null,
} as const satisfies Partial<AudioInputs>
