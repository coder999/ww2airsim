# I1 synthesized sounds — plan

Mark, 2026-10-09: build MASTER_PLAN Track I's I1. Gear and flap motors and the squelch are already recorded and wired (I3, I2), so they are not part of this.

- **Branch:** `i1-synth-sounds`, worktree `../ww2airsim-i1`.
- **Viewing checkpoint:** the final product only, one listen in flight.
- **Run:** unattended.

## What plays, and when

Every sound is made in code at load, the way C2's door motor is (`synth.ts`, `loadSamples`). Each one loops through `LAYERS` with gliding gains. There are no new files and no new backend verbs.

| Layer | Clip (synthesized) | Driven by | Bus |
|---|---|---|---|
| `wind` | `noise`: 2 s of white noise | airspeed. Silent below 15 m/s (34 mph); gain and a lowpass both rise to 200 m/s (447 mph). | ambient |
| `rumble` | `noise` | wheels on the ground (`onGround` true, on land or deck), and ground speed: louder and higher as it rolls faster. Deck: a brighter lowpass than land. | sfx |
| `buffet` | `buffet`: low noise shaken at 9 to 13 Hz | airborne, airspeed under 1.15 × the stall speed at the current flaps (`effectiveStallSpeedMps`), full at the stall | sfx |
| `buzz` | `buzz`: a 240 Hz buzzer tone (the motor generator at another pitch) | airborne, under 1.07 × the stall speed | sfx |
| `creak` | `creak`: a slow structural groan with a rasp | airspeed over 0.9 × the spec's `limits.diveSpeedMps`, full at the dive limit | sfx |
| `static` | `noise` through the radio chain | while a radio transmission is on the air (squelch to squelch, `radio.ts`'s busy window) | radio |

- **Grass:** `ContactSurface` is only land, deck or water, so "runway" and "grass" cannot be told apart. Land gets one preset, and grass waits for a surface type that knows it.
- **Stall margin:** a speed ratio at 1 g, so a hard turn does not buffet early.
- **Replay and title:** the new layers obey `hold` like the engine and sea, so nothing plays behind the title or in a paused replay.

## Levels

Each layer has a max gain in `mix.ts`. Each one is a tuning value for Mark's ear.

`tests/audio/assets.test.ts` gains a case that is enrolled from `LAYERS`. Every synthesized layer's max gain × its clip's stated peak, on a full-throttle engine, must stay under full scale. That is the same arithmetic the recorded cues pass.

## Tests

- **Pure gain curves:** silent where they should be, and full at their limits.
- **Synth clips:** a seamless loop at their stated peak, like the motor test.
- **The system drives each layer from the reducer's frame:** fake backend.
- **The adapter reads airspeed, stall speed, dive limit and ground speed** off the player.

Each new test is seen failing once against its fault.
