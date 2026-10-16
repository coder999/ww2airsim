# F6B night perception, blackout and rank-gated sights: handoff (2026-10-15)

Branch `plan-f6b-perception` (plan 10 of 22), merged with `main` at `aa098745` (F5B and the D3D12 lighting hotfix in). Not merged to main, not deployed. Plan: `docs/superpowers/plans/2026-10-15-f6b-night-perception-sights.md` (Mark's rulings, A1 to A2 and D1 to D16, are in its section 11 and 12). Standing reference: `docs/night.md` ("Perception", "Sights"). Mark reviewed CP1 (blackout, "fun"), CP2 and CP3 (sights, tutorial, "looks good").

## What shipped

- **Blackout is real.** One detection range per aircraft per tick (`src/sim/lights/perception.ts`) from its own position lights, the ambient night and local flare or searchlight light; the gate is the shared `isContact`, and anti-aircraft fire reads the same range. Lit about 3.7 mi, blacked out about half a mile at deep night. The lights switch (`N`) is applied to the world at a fixed tick and recorded; `verify.ts` replays it; recorder evidence `sighted`.
- **Sights.** The `U` marker is the bombsight and, for a torpedo, the torpedosight (entry ring with ENTRY label, red ring with X when invalid, run line, badge in words and imperial units). `predictTorpedoDrop` uses the real projectile step and the sim's own envelope (`torpedoDropOk`, shared with the release). **Rank gate:** Lieutenant Commander and above on scored and single-mission sorties; Dev and every Training Ground row (Basic Flying included) always. Wired through F5B (`pilotSights` in `launchRules.ts` to `CampaignSortie.sights` to `SortieChoice.sights`, `facts.sights`).
- **Arcade ruling (Mark 2026-10-15): torpedoes arm on water entry** (`armRunM` 0 in content for all four torpedo entries; the dud branch stays, unreachable).
- Enemy radar is a later plan (section 12a of the plan; staged bullet applied in MASTER_PLAN section 3).
- **Player-facing removal:** rookies lose the impact marker on scored and single-mission sorties (GAMEPLAY.md, ranks section).

## Tests updated

`tests/flightRecorder/recorder.test.ts` (the lights action test applies the flag, since it is sim state now; the one test F7A also edits), `tests/render/bootQuality.test.ts` (greps `buildWorld`'s return), `tests/render/impactMarker.test.ts` (BOMBSIGHT label), the three scenario-enrollment lists (night-patrol), `tests/sim/weapons/torpedo.test.ts` and `flooding.test.ts` (arming run tests replaced by "arms on water entry"), `tests/e2e/impactMarkerCapture.spec.ts` (label), `tests/e2e/torpedoCapture.spec.ts` (comment), legend label.

## Tests still valid

Golden trajectory, soak, furball and recovery suites (day worlds carry no night fact: asserted), `tests/sim/weapons/impactPrediction.test.ts` (bomb and rocket predictions to 1 cm), the AI attack tests, all of `src/campaign`.

## New

`tests/sim/lights/{sun,perception}.test.ts`, `tests/sim/ai/perception.test.ts`, `tests/sim/weapons/{aaPerception,torpedoPrediction}.test.ts`, `tests/sim/{nightFacts,sortieSights}.test.ts`, `tests/flightRecorder/lightsReplay.test.ts`, `tests/render/hq/sights.test.ts`, additions to `impactMarker.test.ts` and `overlay.test.ts`; E2E `nightPerception`, `sights`, `hqSights`, `hudLayout`, budget `sightsBudget`; captures `nightPerceptionCapture`, `nightSightsCapture`; `tools/perceptionBench.ts`. Mutation checks (each shown red) are listed in the CP reports and the plan.

## Gate results (2026-10-15, after merging main)

- `REMOTE_RUN_OVERFLOW=0 remote-run bash -c 'npm run verify'`: **exit 0**, 474 files passed, 1 skipped (typecheck, lint, depcruise, tests). Earlier runs hit the known `soak.test.ts` 30 s timeout under shared load; it passes alone.
- **ryzen RX 6700 XT, console-session Playwright server** (`PW_REMOTE=ws://localhost:39001/`, slot 5174): `hqSights` 3/3, `hudLayout` 3/3, `night` 8/8, `nightLights` 7/7 (the GPU lighting node agrees with its CPU twin after the hotfix), `nightPerception` 2/2, `overlaySelect` 1/1, `sights` 3/3 (after two robustness fixes in the spec found ON ryzen: wait for the sim to run before the first key, and one key at a time; the first run failed 2 of 3).
- **Budget gate (b), sight on minus off, alternating inside one page load, six pairs, medians, 1440p High, night-bay, `hwlock ryzen-budget`, three runs:** bombsight +0.121, -0.928, +0.014 ms (median +0.014); torpedosight +0.076, +0.184, +0.050 ms (median +0.076); gate 0.10. Absolute p95 was 11 to 13 ms (the slow mode). Run-to-run scatter (about 1 ms in the worst pair) is larger than the gate, so the spec's single-run 0.10 ms assertion is **not a reliable gate** (it failed once, passed twice per sight); read the median of several runs. The cost is within noise and at most a few hundredths to a tenth of a millisecond.
- Gate (a) (sim cost of perception, not the shared lighting node, so unaffected by the hotfix): +0.063 ms per tick against 0.15. Gate (c) (nine day views): structural only, not measured.

## Known gaps

- The Lieutenant Commander side of the rank gate is unit-tested (over the real picker rows) but not exercised through the UI: no UI path creates such a pilot without an import.
- Gate (b)'s single-run assertion flakes on ryzen's bimodal frame time (above); a median-of-N wrapper would be the fix.
- Night-view budget gates of F6A (a) and (b) are not re-measured here.
- Hulls and decks under the torpedosight's entry point are not modeled (green over a ship, the real torpedo breaks up).
- Detection ranges are estimates, no period sources found for position-light visibility or moonlit detection (`docs/night.md`).
- Merge note: F7A conflicts expected in `loop.ts`, `verify.ts`, `schema.ts`, `recorder.ts`, `main.ts`, `recorder.test.ts`; add F7A's parachutist condition to the sight's `live` flag.
