# Plan 8 final review recovery — 2026-09-19

Resumed the interrupted final review fix wave on nexus, in the served `main`
checkout at `246fc74`. The original implementation was complete; the remaining
work was the 14 items in the local final-findings ledger. All 14 are now
addressed in one follow-up commit. Nothing was pushed or deployed.

## Completed fixes

- Assists receive air-relative velocity, retaining the original state object
  in calm air. Coordinated flight in a 15 m/s crosswind no longer commands
  spurious rudder, while real sideslip still receives a correction.
- The cockpit airspeed readout, dial needle, and follow-view SPD all receive
  the scenario wind. Altitude and vertical speed stay in the ground frame.
- Deck crashes name the deck; deck touchdown can trigger the wheel cue.
  Audio reads the same `groundUnder` surface as the simulation. Carrier
  landing reports show the class and hull id, and credit a carrier only if
  touchdown and rest refer to the same ship.
- The real automated carrier approach observes paddles cues, including `cut`.
  The deck-run test and design now describe the climb-out they actually show.
- Ship content rejects inconsistent deck heights and inverted paddles ranges.
  The renderer rejects a carrier missing its flight deck, naming the spec id.
- Tightened the turning-deck drift gate to 0.5 m; routed the terrain soak's
  current/previous contact-height reads through `groundUnder`; added optional
  wind to `holdLevelFlight`; corrected ground-contact comments and reused a
  frozen empty deck array in the flight model.

## Additional defect found during recovery

The interrupted gauge fix threaded wind into the digital readout but missed
`needleAngleFor`. At 60 m/s ground speed into 15 m/s of headwind, the needle
still showed the 60 m/s angle while the digits showed 75 m/s. A panel-level
regression failed with an angle discrepancy of 0.316239 rad before the fix,
then passed after wind reached the needle. This was part of fixing the same
airspeed finding, not a new feature.

## Verification

- Final `npm run verify`: exit 0; typecheck, zero-warning lint, dependency
  boundaries, and **107 test files / 1,138 tests passed / 1 pre-existing skip**.
  No golden trajectories or ashore landing snapshots were changed.
- Reference Windows GPU browser run: `adapter.spec.ts`, `audio.spec.ts`, and
  `deckQuals.spec.ts`: **9 passed / 1 pre-existing skip / 0 failed**, exit 0,
  45.5 s. The skipped case concerns audio autoplay before a first gesture.
- Deck run at 2560 x 1440: GPU **p95 1.054 ms over 1,061 samples**, below the
  6.0 ms ceiling. The adapter assertion passed and validation errors were empty.
- The parked browser test now asserts visible **SPD 35 mph**: ship speed plus
  headwind, instead of the old 17 mph ground-speed reading.
- Both newly generated 1440p screenshots were inspected: parked on the deck,
  SPD 35 mph and ALT 63 ft; then climbing over water, SPD 124 mph, ALT 102 ft,
  V/S +1613 ft/min. These views do not show a landing or the cockpit needle;
  the needle/readout agreement is covered by the panel regression above.
- Carrier approach still touches down at 1.40 m/s sink and 21.7 m/s over the
  deck, stopping 102 m from the stern and 0.4 m off centerline. Recorded cues:
  fast 3386, low 513, wave-off 277, roger 109, cut 149. This proves the cut cue
  occurs on the approach; it does not claim the full approach is ideal.
- Development host returned HTTP 200 at `https://ww2airsim.windomlane.org/`.

The extra GPU run was warranted by the wind wiring and audio changes, not
by the renamed test. The full Tier 2 suite was not rerun; its previous result
remains in the original Plan 8 handoff. Logs and the preserved interrupted
diff are in `/tmp/ww2airsim-resume-20260919/` on nexus (temporary evidence).

## Remaining scope

The previously accepted limitation remains: a parked airplane follows a
turning deck's position but its attitude does not turn with it. The explicitly
deferred review cleanup remains deferred. Plan 6 (combat and damage) is next
per the [authoritative roadmap](../superpowers/specs/2026-09-12-ww2airsim-design.md#15-first-steps);
this recovery does not start it.
