# Spatial audio (sub-project 5), 2026-09-30

Plan: `docs/superpowers/plans/2026-09-30-spatial-audio.md`. Spec §5.4. Paddles/radio (sub-project 4) deferred.

## What ships

The listener is the camera (chase and cockpit). `src/audio/spatial.ts` (`nextSpatial`, pure) turns listener pose, nearby AI aircraft, decks and new detonations into listener-relative loops and due one-shots. It owns distance attenuation, Doppler, air absorption and the 343 m/s delay; the panner only pans. `system.updateSpatial` applies it through `startSpatialLoop` and `playSpatial`; `render/audio.ts` `spatialInputsFrom` is the adapter; `main.ts` calls it live and in replay (prime on jump, hold silences).

- AI engines: nearest 6 within 3,000 m, Doppler, summed gain capped.
- Detonations (bombs, rockets): delayed by distance, lowpassed, `flak_distant` beyond 3,000 m. Replaces the flat 1,500 m `explosion` cue.
- AI gunfire: a positioned `machinegun` burst per 72 ticks while a gun's shot count rises.
- Carrier deck rumble: a positioned loop at the nearest deck (replaces the non-positional `deck` layer).

## Honest status

Every constant (gains, reference distances, 3,000 m and 8,000 m ranges, Doppler clamp, lowpass curve) is a reasoned guess. **Nothing was heard.** Doppler in particular may sound wrong. Tier 2 was not run.

## Known limits

- Spatial handles are never destroyed: one per AI aircraft ever audible, faded to 0 when not.
- AI throttle isn't exposed, so AI engine pitch/level follows engine health, not throttle.
- Blasts at the same tick beyond the nearest 4 are dropped.

## Viewing checkpoint

Final product only: fly on `ww2airsim.windomlane.org` (needs `npm run dev:lan`; assert 200 first). Things to listen for: engines pan to the correct side, a bomb on a distant target thumps seconds late, the deck rumble sits at the ship.
