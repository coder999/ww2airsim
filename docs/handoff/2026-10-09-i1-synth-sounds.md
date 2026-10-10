# I1 synthesized sounds — handoff

Done 2026-10-09 on branch `i1-synth-sounds`. Plan: `docs/superpowers/plans/2026-10-09-i1-synth-sounds.md`. The checkpoint is the final product: one listen in flight.

## What plays

| Layer | Comes in | Max gain (`mix.ts` `SYNTH_GAIN_MAX`) |
|---|---|---|
| wind | above 34 mph airspeed; full and brightest at 447 mph | 0.5 |
| rumble | wheels rolling on land or deck; full by 89 mph; the deck is brighter | 0.5 |
| buffet | under 1.15 × the stall speed at the current flaps, airborne | 0.6 |
| buzz (240 Hz buzzer) | under 1.07 × the stall speed, airborne | 0.12 |
| creak | over 0.9 × the spec's dive limit | 0.5 |
| static | while a radio transmission is on the air | 0.15 |

All are tuning values; Mark's ear decides.

## Verified

- **Deterministic tests:** the audio, render adapter, sounds and architecture tests pass.
  - **Gain curves** (`tests/audio/mix.test.ts`).
  - **Seam:** every synthesized clip is a seamless loop at its stated peak (`cues.test.ts`). It now also checks loudness across the wrap, which a noisy clip used to hide.
  - **Headroom:** every synthesized layer's headroom, enrolled from `LAYERS` (`assets.test.ts`).
  - **System:** the system drives wind and buffet, and static under a transmission (`system.test.ts`).
  - **Adapter:** the adapter reads airspeed, the stall speed at the current flaps and the dive limit (`audioInputs.test.ts`).
  - Each new test was seen failing against its fault.
- **Checks:** lint, depcruise and typecheck are clean.
- **E2E:** `tests/e2e/audio.spec.ts`, 6 of 6, against this worktree on nexus's GPU. An ad-hoc probe found the wind layer running at a 0.28 gain right after an airborne spawn.

## Open

- **Grass:** it shares land's rumble preset, because `ContactSurface` has no grass.
- **Stall cues:** changed 2026-10-09 at Mark's request.
  - They now read angle of attack, as lift in use over maximum lift, with the same 1.15× and 1.07× onsets at 1 g, so a hard pull buffets early.
  - Grass keeps the land rumble, and wind stays muffled in the cockpit, both his calls.
- **Wind** is on the ambient bus, so the cockpit preset's world lowpass dulls it. Whether it should be louder in the cockpit is for Mark's ear.
