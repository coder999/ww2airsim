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
  'Instructor: Positive climb. Raise gear and flaps, hold 500 to 1,000 feet, and follow DOWNWIND.': null,
  'Instructor: Follow LINEUP astern. Slow toward the shown approach speed and hold the shown altitude until the turn to final.': null,
  'Tacloban tower: cleared for takeoff. Dulag strip is nineteen miles south.': 'radio_tower_dulag_takeoff',
  'Strike lead: bandits scrambling off Dulag!': 'radio_wingman_dulag_bandits',
  'Strike lead: hangars are down. Head home to Tacloban.': 'radio_wingman_dulag_hangars_down',
  "Tacloban tower: single bandit, a Frank, five miles west, angels ten. He's yours.": 'radio_tower_single_bandit',
  'Tacloban tower: splash one Frank. Come on home.': 'radio_tower_splash_frank',
  'Tacloban tower: scramble! Bettys inbound from the northwest, thirty miles, angels ten.': 'radio_tower_scramble',
  "Tacloban tower: raid's broken up. Bring it home.": 'radio_tower_scramble_clear',
  // Flattop Hunt has no recorded lines yet; keep both messages deliberately text-only.
  'Strike lead: flattop bearing two-two-five, twelve miles. Avengers take the carrier.': null,
  'Strike lead: Zuikaku is going down. Reform east and recover aboard Essex.': null,
  // Escort (2026-10-10): the bomber lead is text-only too, no recordings yet.
  'Bomber lead: little friend, glad to have you. Dulag strip, angels ten, seven minutes.': null,
  "Bomber lead: bandits, eleven o'clock high, fifteen miles. Four Zeros.": null,
  'Bomber lead: bombs away, hangars burning. Thanks for the ride, little friend.': null,
  "Bomber lead: we've lost two ships.": null,
  // Surigao Strait (2026-10-11): no recordings; the dawn-pursuit calls stay text-only.
  'Strike lead: Mogami is retiring south through the strait. Battle line has the rear guard; finish the cruiser.': null,
  'Oldendorf: rear guard is broken. Keep after Mogami.': null,
  'Strike lead: Mogami is finished. Turn north and recover aboard Essex.': null,
  // Tank Buster (2026-10-11) is text-only; no forward-air-control recordings yet.
  'Forward air control: Japanese armor is moving southwest of Dulag. Three pairs along the road.': null,
  'Forward air control: column broken. Return to Tacloban, or finish the remaining tanks.': null,
  // Field Patrol (F5A, 2026-10-14) is text-only; no recordings exist for a Japanese-side tower yet.
  'Dulag tower: Hold station over the field, angels ten. American carrier planes expected from the east.': null,
  'Dulag tower: Bogeys bearing zero-eight-two, fifteen miles, angels eleven, closing.': null,
  'Dulag tower: Second raid bearing zero-seven-nine, fifteen miles.': null,
  'Dulag tower: All raiders splashed. Come home.': null,
  // F10A begin (chapters A1-A3, 2026-10-17): text-only like every chapter radio line (Decision 7); one voice run per language later.
  'Essex CIC: Launch the CAP. Raid inbound on the transports from the southwest, bearing two-four-zero, twenty miles, angels ten.': null,
  'Essex CIC: Second raid behind the first. Dive-bombers, same bearing.': null,
  'Essex CIC: All bombers splashed. Clear the fighters off the transports.': null,
  'Essex CIC: Raid is clear of the transports. Bring it aboard.': null,
  "Essex CIC: We've lost too many transports.": null,
  'Taffy 3 to Avengers: Japanese heavy ships northwest of us, closing. Torpedoes on the cruiser or the battleship.': null,
  'Taffy 3: Good hit. Return to Casablanca.': null,
  'Taffy 3: Casablanca is lost.': null,
  'Strike lead: Ormoc search is a bust. A road column north of the valley, tanks and trucks. Go find it.': null,
  'Strike lead: Column in sight, nose to tail. Light flak by the road.': null,
  'Strike lead: tanks are burning.': null,
  'Strike lead: that is ten. Home to Tacloban.': null,
  // F10A end
  // Runtime messages (src/sim/mission/step.ts, passes.ts, respot.ts; render/discharge.ts).
  'Trap 1 of 3': 'radio_paddles_trap_1_of_3',
  'Trap 2 of 3': 'radio_paddles_trap_2_of_3',
  'Trap 3 of 3': 'radio_paddles_trap_3_of_3',
  'Paddles: wave-off — go around.': 'radio_paddles_waveoff_1',
  'Flight deck: respotted for launch, hook up. Launch when ready.': 'radio_paddles_respot',
  'Instructor: After launch, raise gear and flaps once you are climbing.': null,
  'Keep the raid off: failed': 'radio_tower_raid_screen_breached',
  "Cease fire! Cease fire! You're hitting friendlies!": 'radio_wingman_friendly_fire',
  // Lands with the missed pass's own wave-off call; a second voice on top would sound wrong.
  'No wave-offs: failed': null,
  // Torpedo Qualification is an instructor-led text lesson; no recordings yet.
  'Instructor: Torpedo qualification. Hold = for full throttle and take the Avenger off Tacloban.': null,
  'Instructor: Hold her straight with Z and X, then ease back with S at 85 miles an hour.': null,
  'Instructor: Airborne. Raise the gear with G.': null,
  'Instructor: Turn east for the marker. Crow is anchored two thousand yards beyond it. Be below two thousand feet for the run.': null,
  'Instructor: On the run. Open the bomb bay with B and steady the sight on Crow.': null,
  'Instructor: Bay open. Press V to launch the torpedo. A hit or a miss both complete this practice run.': null,
  'Instructor: Fish away. Crow is an unmanned range hulk and takes no damage. Close the bay with B, then return to Tacloban.': null,
  'Instructor: Bay secure. Follow the arrow to the final.': null,
  'Instructor: On the final. Gear down with G, flaps down with F, and slow below 120 miles an hour.': null,
  'Instructor: Configuration checks. Put her down on the strip.': null,
  // Catalina Water Qualification is text-only; the five calls teach the new hull/float path.
  'Instructor: Catalina water qualification. Wheels are up and wingtip floats are down. Set takeoff power and hold a straight step-taxi run.': null,
  'Instructor: Let the hull climb onto the step, then ease back near 76 knots. Keep the floats down until clear of the water.': null,
  'Instructor: Airborne. Retract the floats with F, climb through 500 feet, and fly south to the circuit marker.': null,
  'Instructor: Turn back over the bay. Wheels stay up; lower the floats with F and slow below 95 mph (83 knots).': null,
  'Instructor: Cleared to land anywhere on open water. Hold 0-10 degrees nose-up, wings nearly level, and keep the sink rate below 690 feet per minute.': null,
  // The tutorial's instructor (B4) is text-only, deliberately: no recordings, so an edit to a line costs nothing.
  "Instructor: Welcome to Tacloban. Hold = to bring the throttle to full, and keep your brakes off.": null,
  "Instructor: Rolling. Hold her straight with Z and X, ease back on the stick (S) at 85 miles an hour, and let her fly off.": null,
  "Instructor: Airborne. Raise the gear: G.": null,
  "Instructor: Gear's up. Climb above fifteen hundred feet.": null,
  "Instructor: Good. Follow the amber arrow to the marker over the bay, three miles northeast.": null,
  "Instructor: Now strafe the two parked Hellcats at the south end of the strip. Line up, close inside a thousand feet, and fire: Space.": null,
  "Instructor: Targets down. Bombs away on the cargo ship in the bay if you have them: U shows where a bomb will land, V drops one. Then join the final.": null,
  "Instructor: On the final. Gear down (G), flaps down (F), and slow to under 120 miles an hour.": null,
  "Instructor: Good. Line up on the runway and put her down.": null,
  // E4: the wingman's answers to the player's calls (src/render/frame.ts, WINGMAN_RADIO), text-only.
  'Wingman: Roger, engaging.': null,
  "Wingman: Roger, I'm on your tail.": null,
  'Wingman: Roger, rejoining.': null,
  // The dev scenarios (dev-mission-ui.json) have no recorded lines.
  'Tower: cleared for takeoff.': null,
  'Tower: a friendly is passing overhead.': null,
  // F10D (2026-10-17): J4 and J5, text only through F10 (Decision 7).
  "Strike lead: the flare is lit over the bay. Torpedo a Fletcher inside its light, keep clear of the transport, then clear the bay to the west.": null,
  "The flare is dying. Clear the bay to the west.": null,
  "Formation lead: three Topsies on the fires at San Pablo. Hold the corridor, open the doors, drop on the fires.": null,
  "Escort lead: Lightnings, five miles, high. Stay on course.": null,
  "Open the doors (O) and drop (Y) over the fires.": null,
  // F10C (2026-10-17): the Japanese chapters J1-J3, text only through F10 (Decision 7).
  "Buri tower: Scramble! Defend the fuel, radio, hangars, and dispersal. Get airborne now.": null,
  "Buri tower: Two Army fighters are joining from the west, five thousand feet.": null,
  "Buri tower: Hellcats, bearing zero-nine-zero, five and a half miles from the field, six thousand feet.": null,
  "Buri tower: Damaged Ki-21 inbound from the west, five miles, three thousand feet. Cover it to the threshold.": null,
  "Buri tower: Second strike, bearing zero-nine-zero, five and a half miles. Hellcats and Avengers, five to six thousand feet.": null,
  "Buri tower: The field holds. Recover at Buri; divert to Bayug only if Buri is unserviceable.": null,
  "Buri tower: Too many groups lost. The defense has failed. Bring your aircraft home.": null,
  "Observer: Strike the shipping. No fighter escort. Attack by eye.": null,
  "Observer: Through the fighters. Pick a transport or an escort.": null,
  "Observer: Good hit. Head west for the gate.": null,
  "Observer: Clear of the shipping. Strike complete.": null,
  "Buri control: Cover the road column. Bring at least eight vehicles, including two tanks, into the dispersal area, then land at Bayug. Save the command car and all four tanks if you can.": null,
  "Road observer: Two P-38s, bearing zero-four-five from the head of the column, about three miles, eight thousand two hundred feet. They are heading toward Buri.": null,
  "Road observer: Second pair of P-38s, bearing zero-four-five from the head of the column, about three miles, eight thousand two hundred feet. Cover the dispersal area.": null,
  "Buri control: The column is in the dispersal area. Recover at Bayug.": null,
}

/** The LSO's lines for each cue, rotated so a repeated call does not sound canned. */
export const PADDLES_LINES: Readonly<Record<PaddlesCall, readonly string[]>> = {
  high: ['radio_paddles_high_1', 'radio_paddles_high_2'],
  low: ['radio_paddles_low_1', 'radio_paddles_low_2'],
  // Airspeed alone cannot tell the pilot which control caused the error.
  // The second takes say “easy on the power” / “add power,” which is wrong
  // before the airplane is established and can make a low pilot still lower.
  fast: ['radio_paddles_fast_1'],
  slow: ['radio_paddles_slow_1'],
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
