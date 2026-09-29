# ww2airsim audio: Firefly prompt sheet (2026-09-29)

Sub-project 6 of the audio expansion (`docs/superpowers/specs/2026-09-29-audio-expansion-design.md` §6).
Generate in Firefly, drop the WAVs in `content/audio/` under the filenames below, and
tell me. I wire them, measure the peaks, and add the `NOTICE.md` provenance lines.

## Why the engine loops come first

Measured 2026-09-29: the current `propeller.wav` has 50% of its energy below 108 Hz and
90% below 163 Hz. Laptop and office speakers barely reproduce that, which is why the
cockpit and chase mixes sounded identical on the first two builds (the switch itself
was verified reaching the audio graph). New engine loops need most of their energy
between **200 Hz and 4 kHz**, with a clear blade-pass or exhaust throb, so a level or
tone change is audible on small speakers.

## Rules for every clip

- Format: WAV, 48 kHz, stereo, same as the existing files. If Firefly offers a shorter
  maximum length than asked for, take the longest it gives and tell me.
- **Loops:** steady, constant RPM or level, no fade in, no fade out, no intro or outro
  hit, no pitch drift, no reverb tail. Loop points are set in code.
- **One-shots:** start at the hit (no lead-in silence), natural decay to silence.
- Avoid: music, voices, dialogue, wind gusts that build and fade, random clanks or
  sputters inside a loop, anything that sounds like a modern jet or turbine.

## Sound effects (11)

Priority order. Names are exact.

| # | File | Type | Length | Prompt | Avoid |
| --- | --- | --- | --- | --- | --- |
| 1 | `engine_radial_small.wav` | loop | 10 to 15 s | Single-engine WWII fighter, small radial piston engine at steady cruise RPM, close cockpit perspective, throaty rhythmic exhaust rumble with clear propeller blade beat, mid-range rich, no wind | sputter, gear or flap noise, fades |
| 2 | `engine_radial_big.wav` | loop | 10 to 15 s | Large 2000 hp radial piston engine, WWII carrier fighter, steady cruise power, deep powerful exhaust with propeller blade-pass throb, mid-range heavy | sputter, jet whine |
| 3 | `engine_multi_heavy.wav` | loop | 10 to 15 s | Four large radial piston engines on a WWII heavy bomber, slightly out of sync so the drone beats and swells slowly, steady cruise, cabin perspective | sudden changes, single-engine sound |
| 4 | `engine_allison_v12.wav` | loop | 10 to 15 s | Liquid-cooled V12 piston engine, WWII twin-engine fighter, steady cruise, smoother and higher-pitched than a radial, crisp exhaust with propeller beat | radial rumble, turbine sound |
| 5 | `engine_sputter.wav` | one-shot | 3 to 5 s | WWII piston aircraft engine failing: coughing, sputtering, backfiring, RPM dropping, dying to silence | steady running, explosion |
| 6 | `hit_taken.wav` | one-shot | 1 to 2 s | Machine-gun bullets striking an aircraft's metal fuselage from inside the cockpit, sharp metallic impacts and tearing sheet metal | gunfire from our own guns, explosion |
| 7 | `sea_waves.wav` | loop | 10 to 15 s | Open-ocean waves and surf from low over the water, steady wash and hiss, no gulls, no wind gusts, no voices | boats, thunder, rhythmic crashes that dominate |
| 8 | `carrier_deck.wav` | loop | 10 to 15 s | Aircraft carrier flight deck ambience heard nearby: deep steady ship engine rumble, wind across the deck, distant metallic creaks, no voices | aircraft engines, alarms, speech |
| 9 | `wire_catch.wav` | one-shot | 2 to 3 s | Carrier tailhook catching an arresting wire: sharp metallic hook strike, cable zinging and straining, aircraft decelerating on the deck, then the wire rattling to a stop | engine noise, voices |
| 10 | `flak_distant.wav` | one-shot | 2 to 4 s | Distant anti-aircraft shell burst heard from far away in the open air, dull thump with a soft crackle, no echo | close explosion, bass boom, gunfire |
| 11 | `hook_clunk.wav` | one-shot | 0.5 to 1 s | Heavy metal latch clunk of a carrier aircraft's tailhook locking down, single hit, dry | rattle, motor whine |

Optional extras if you want more variety: a second variant of `hit_taken.wav` and of
`flak_distant.wav` (`_b`), so repeated hits do not sound identical.

## Voice lines for Firefly Generate Speech (16)

The Paddles voice (landing signal officer) is heard over a radio filter that I add in
code, so record the lines **clean and dry**. Voice: adult male American, calm and
clipped, naval radio delivery, no accent or humor. Wave-off lines urgent and louder.
Two or three takes per call so the game can rotate them.

| Cue | File | Line | Delivery |
| --- | --- | --- | --- |
| high | `paddles_high_1.wav` | "You're high." | calm |
| high | `paddles_high_2.wav` | "A little high. Easy." | calm |
| low | `paddles_low_1.wav` | "You're low." | firm |
| low | `paddles_low_2.wav` | "Power. You're low." | firm, quick |
| fast | `paddles_fast_1.wav` | "You're fast." | calm |
| fast | `paddles_fast_2.wav` | "Easy on the power. You're fast." | calm |
| slow | `paddles_slow_1.wav` | "You're slow." | firm |
| slow | `paddles_slow_2.wav` | "Add power. You're slow." | firm, quick |
| roger | `paddles_roger_1.wav` | "Roger ball." | calm, flat |
| roger | `paddles_roger_2.wav` | "Roger, ball. Looking good." | calm |
| cut | `paddles_cut_1.wav` | "Cut." | sharp, single word |
| cut | `paddles_cut_2.wav` | "Cut. Cut." | sharp |
| cut | `paddles_cut_3.wav` | "Cut, cut, cut." | sharp, rising |
| wave-off | `paddles_waveoff_1.wav` | "Wave off! Wave off!" | urgent, loud |
| wave-off | `paddles_waveoff_2.wav` | "Wave it off! Wave it off!" | urgent, loud |
| wave-off | `paddles_waveoff_3.wav` | "Wave off, wave off, wave off!" | urgent, loud |

Wingman and carrier-control chatter is a later, optional set: the mission
events that could trigger it are unverified, so I am not asking for those yet.

## What happens after you drop files in

1. I add each clip to `src/audio/assets.ts` with its measured peak and byte count.
2. I add a provenance line per file to `content/audio/NOTICE.md`.
3. Engine loops need the aircraft data key `engineSound` (sub-project 2); until then I
   can swap `engine_radial_small.wav` in for the current propeller so you can hear it
   right away.
