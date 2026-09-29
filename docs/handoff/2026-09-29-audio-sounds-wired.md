# Audio: generated sounds wired (2026-09-29)

Sub-project 2 of the audio expansion (`docs/superpowers/specs/2026-09-29-audio-expansion-design.md`
§5.1-5.4), done in place on `main`. Not pushed, not deployed. Master spec §15 row 15b.

## What is wired

- **Engine families** (`src/audio/mix.ts` `engineFamilyFor`, `src/audio/layers.ts`): single radials keep
  `propeller`; B-17, B-29, Betty and Sally use `engine_multi_heavy`; the P-38 uses `engine_allison_v12`.
  Switching aircraft fades the old family's layer to 0. `engine_radial_small/big` stay unused.
- **Damage**: `hit_taken` on structure loss (at most one per 30 ticks); `engine_sputter` when engine health
  crosses below 0.5 while running; the engine loop fades to silence as health falls from 0.5 to 0.
- **Carrier**: `hook_clunk` on the hook lever edge, `wire_catch` on the arrested edge, `carrier_deck` ambience
  fading in within about 1,300 ft of a deck edge.
- **Sea**: `sea_waves` ambience over water, fading in from about 490 ft down to about 33 ft above the water (150 m and 10 m in code).
- All cues are state-derived edges in `nextAudio`; no sim event queue, and `src/sim` is untouched.
- Loop points for the new loops were found by `tools/audio/findloop.ts` and are asserted by
  `tests/audio/loopPoints.test.ts`.

## Follow-up (2026-09-30): bomb blasts

Mark bombed his own carrier in a Zero and heard `hit_taken` (gunfire on the hull) instead of a bomb
explosion: nothing cued a bomb detonation, and the blast's damage to the player read as a hit. Now any bomb
or rocket detonation within 1,500 m (`BLAST_AUDIBLE_M`, read from `World.combat.impacts`) plays `explosion`
(`water_crash` over water), rate-limited to one per 10 ticks, and structure loss within 2 ticks of a
detonation no longer cues `hit_taken`. NOT positional: it plays at full level anywhere inside 1,500 m
(sub-project 5). Not yet heard.

## Not wired

`flak_distant` waits for spatial audio (sub-project 5). Paddles voice lines are not generated yet.

## Verification (2026-09-29)

tsc, eslint (zero warnings) and depcruise clean; Tier 1 on the touched files: 137 passed. Full `verify`
and Tier 2 were NOT run in this pass.

## Trap list

- **Every gain and distance constant is a reasoned guess, never heard.** `AMBIENT_GAIN_MAX` 0.50,
  `SEA_FADE_*`, `DECK_FADE_M` 400 m, `ENGINE_FAILING_HEALTH` 0.5, `HIT_CUE_INTERVAL_TICKS` 30.
- The sea fade uses `groundSurface === 'water'` plus wheel height, so it is silent over land coastlines.
- Ambient layers start lazily; a flight that never sees the sea never runs the layer.
- Engine family is chosen by aircraft id in `mix.ts`, not by JSON. A new bomber or twin needs an entry there.

## Mark's listening checkpoint (final product only)

Fly a P-38 and a B-17 (different engine tone from the Hellcat); take hits and run the engine down (thud,
sputter, fading engine); skim the sea; fly to the carrier, drop the hook and trap (clunk, deck rumble, wire).
