/**
 * Radio lines (I2): which recorded line answers which message, and when a
 * transmission starts, as a pure function. The clock is passed in (the audio
 * clock, in seconds), so the rules are testable without an audio device.
 * Plan: docs/superpowers/plans/2026-10-09-i2-voice-wiring.md.
 *
 * A transmission is squelch, voice, squelch on the radio bus (system.ts).
 * There is one at a time. Mission lines wait their turn, Paddles corrections
 * are dropped rather than played late, and a cut or wave-off cuts in.
 */

export type VoiceLanguage = 'us' | 'ja'
/** `PaddlesCue` (src/sim/paddles.ts), redeclared because `audio/` must not import `sim/`.
 *  render/main.ts passes one to the other, so the two drifting apart is a type error. */
export type PaddlesCall = 'high' | 'low' | 'fast' | 'slow' | 'roger' | 'cut' | 'wave-off'
/** `content/audio/voice/<stem>_<language>.wav`. */
export type VoiceId = `radio_${string}_${VoiceLanguage}`

/** Seconds from the opening squelch to the voice. Measured 2026-10-09:
 *  `radio_squelch.wav` is a 0.20 s noise burst, then silence, so the voice
 *  starts as the burst dies. */
export const SQUELCH_LEAD_S = 0.22
/** The closing squelch's burst, so the next transmission does not start on top of it. */
export const SQUELCH_TAIL_S = 0.22
/** At least this long between two Paddles corrections (a tuning value for Mark's ear). */
export const PADDLES_GAP_S = 2.5
/** A mission line waiting for the radio or for its file to decode is dropped after this long. */
export const MESSAGE_STALE_S = 6
/** The mission's wave-off message follows a missed pass that the LSO has
 *  usually just waved off by voice; within this long, it stays silent. */
export const WAVE_OFF_ECHO_S = 6

/**
 * Exact on-screen message text to the line that voices it. `null` marks a
 * message as deliberately silent. `tests/audio/radio.test.ts` fails on any
 * scenario message missing from this table, so editing a message's text in
 * content cannot silently lose its voice. A runtime message with no entry
 * (for example "Raid 1 of 2") is silent: no line was recorded for it.
 */
export const RADIO_LINES: Readonly<Record<string, string | null>> = {
  'Essex CIC: Hold CAP over the task group, angels ten. Raid expected from the northwest.': 'radio_tower_cap_station',
  'Essex CIC: Bogeys bearing three-three-eight, twenty miles, angels eleven, closing.': 'radio_tower_raid_bogeys_338',
  'Essex CIC: Second raid bearing three-three-six, twenty-two miles.': 'radio_tower_raid_second_wave_336',
  'Essex CIC: All raiders splashed. Bring it aboard.': 'radio_tower_raid_clear',
  'Base: convoy of three marus with one destroyer, heading for Ormoc Bay. Steer two-one-zero.': 'radio_tower_convoy_vector_210',
  'Strike lead: two down. Home to Bayug when you\'re dry.': 'radio_wingman_convoy_two_down',
  'Strike lead: Zeros over the convoy!': 'radio_wingman_convoy_zeros',
  'Paddles: Ready deck. Launch, then take the downwind leg to port.': 'radio_paddles_quals_launch',
  'Paddles: Abeam. Gear, flaps and hook down, and bring it aboard.': 'radio_paddles_quals_abeam',
  'Tacloban tower: cleared for takeoff. Dulag strip is nineteen miles south.': 'radio_tower_dulag_takeoff',
  'Strike lead: bandits scrambling off Dulag!': 'radio_wingman_dulag_bandits',
  'Strike lead: hangars are down. Head home to Tacloban.': 'radio_wingman_dulag_hangars_down',
  "Tacloban tower: single bandit, a Frank, five miles west, angels ten. He's yours.": 'radio_tower_single_bandit',
  'Tacloban tower: splash one Frank. Come on home.': 'radio_tower_splash_frank',
  'Tacloban tower: scramble! Bettys inbound from the northwest, thirty miles, angels ten.': 'radio_tower_scramble',
  "Tacloban tower: raid's broken up. Bring it home.": 'radio_tower_scramble_clear',
  // Runtime messages (src/sim/mission/step.ts, passes.ts, respot.ts; render/discharge.ts).
  'Trap 1 of 3': 'radio_paddles_trap_1_of_3',
  'Trap 2 of 3': 'radio_paddles_trap_2_of_3',
  'Trap 3 of 3': 'radio_paddles_trap_3_of_3',
  'Paddles: wave-off — go around.': 'radio_paddles_waveoff_1',
  'Flight deck: respotted for launch, hook up. Launch when ready.': 'radio_paddles_respot',
  'Keep the raid off: failed': 'radio_tower_raid_screen_breached',
  "Cease fire! Cease fire! You're hitting friendlies!": 'radio_wingman_friendly_fire',
  // Lands with the missed pass's own wave-off call; a second voice on top would sound wrong.
  'No wave-offs: failed': null,
  // The dev scenarios (dev-mission-ui.json) have no recorded lines.
  'Tower: cleared for takeoff.': null,
  'Tower: a friendly is passing overhead.': null,
}

/** The LSO's lines for each cue, rotated so a repeated call does not sound canned. */
export const PADDLES_LINES: Readonly<Record<PaddlesCall, readonly string[]>> = {
  high: ['radio_paddles_high_1', 'radio_paddles_high_2'],
  low: ['radio_paddles_low_1', 'radio_paddles_low_2'],
  fast: ['radio_paddles_fast_1', 'radio_paddles_fast_2'],
  slow: ['radio_paddles_slow_1', 'radio_paddles_slow_2'],
  roger: ['radio_paddles_roger_1', 'radio_paddles_roger_2'],
  cut: ['radio_paddles_cut_1', 'radio_paddles_cut_2', 'radio_paddles_cut_3'],
  'wave-off': ['radio_paddles_waveoff_1', 'radio_paddles_waveoff_2', 'radio_paddles_waveoff_3'],
}

/** Calls that cut in over whatever is on the air. */
const URGENT: ReadonlySet<PaddlesCall> = new Set(['cut', 'wave-off'])

/** Every line either table can play: what `system.ts` loads for a language. */
export const VOICE_STEMS: readonly string[] = [...new Set([
  ...Object.values(RADIO_LINES).filter((s): s is string => s !== null),
  ...Object.values(PADDLES_LINES).flat(),
])]

/** CONTEXT.md, "Voice": the player's side picks the language; on-screen text stays English. */
export function voiceLanguageFor(side: 'allied' | 'axis'): VoiceLanguage {
  return side === 'axis' ? 'ja' : 'us'
}

export function voiceId(stem: string, language: VoiceLanguage): VoiceId {
  return `${stem}_${language}` as VoiceId
}

export type RadioMemory = {
  /** The HUD line last seen, so each new message is one edge. */
  readonly lastMessage: string | null
  readonly lastPaddles: PaddlesCall | null
  /** Mission lines waiting for the radio, oldest first. */
  readonly queued: readonly { readonly stem: string; readonly sinceS: number }[]
  /** Audio time the transmission on the air ends. */
  readonly busyUntilS: number
  readonly paddlesQuietUntilS: number
  /** When the LSO last called a wave-off (`WAVE_OFF_ECHO_S`). */
  readonly waveOffS: number | null
  /** How many times each cue has been called, for the rotation. */
  readonly turns: Readonly<Partial<Record<PaddlesCall, number>>>
}

export const NO_RADIO_MEMORY: RadioMemory = {
  lastMessage: null, lastPaddles: null, queued: [], busyUntilS: 0, paddlesQuietUntilS: 0, waveOffS: null, turns: {},
}

export type RadioInputs = {
  /** The audio clock, seconds. */
  readonly nowS: number
  /** The HUD radio line's text (`missionHud.text().radio`), null when none is showing. */
  readonly message: string | null
  readonly paddles: PaddlesCall | null
  /** A decoded line's length, seconds, or null while it has not decoded. */
  readonly durationS: (stem: string) => number | null
}

export type Transmission = {
  readonly stem: string
  /** Stop whatever is on the air first. */
  readonly preempt: boolean
  /** The voice's own length, seconds; the squelches sit either side of it. */
  readonly voiceS: number
}

export function nextRadio(prev: RadioMemory, inputs: RadioInputs): { memory: RadioMemory; start: Transmission | null } {
  const { nowS } = inputs
  let { queued, busyUntilS, paddlesQuietUntilS, waveOffS, turns } = prev
  let start: Transmission | null = null
  const begin = (stem: string, voiceS: number, preempt: boolean): void => {
    start = { stem, voiceS, preempt }
    busyUntilS = nowS + SQUELCH_LEAD_S + voiceS + SQUELCH_TAIL_S
  }

  if (inputs.message !== null && inputs.message !== prev.lastMessage) {
    const stem = RADIO_LINES[inputs.message]
    if (stem !== undefined && stem !== null) queued = [...queued, { stem, sinceS: nowS }]
  }

  const call = inputs.paddles
  if (call !== null && call !== prev.lastPaddles) {
    const lines = PADDLES_LINES[call]
    const turn = turns[call] ?? 0
    const stem = lines[turn % lines.length]!
    const voiceS = inputs.durationS(stem)
    const urgent = URGENT.has(call)
    if (voiceS !== null && (urgent || (nowS >= busyUntilS && nowS >= paddlesQuietUntilS))) {
      begin(stem, voiceS, urgent && nowS < busyUntilS)
      turns = { ...turns, [call]: turn + 1 }
      paddlesQuietUntilS = nowS + PADDLES_GAP_S
      if (call === 'wave-off') waveOffS = nowS
    }
  }

  // Stale lines go: a briefing heard ten seconds late is worse than none.
  queued = queued.filter((q) => nowS - q.sinceS <= MESSAGE_STALE_S)
  while (start === null && nowS >= busyUntilS && queued.length > 0) {
    const q = queued[0]!
    if (q.stem.startsWith('radio_paddles_waveoff') && waveOffS !== null && nowS - waveOffS <= WAVE_OFF_ECHO_S) {
      queued = queued.slice(1)
      continue
    }
    const voiceS = inputs.durationS(q.stem)
    // Not decoded yet: it waits (until stale), and so does everything behind it, to keep the order.
    if (voiceS === null) break
    begin(q.stem, voiceS, false)
    queued = queued.slice(1)
    break
  }

  return {
    memory: { lastMessage: inputs.message, lastPaddles: call, queued, busyUntilS, paddlesQuietUntilS, waveOffS, turns },
    start,
  }
}
