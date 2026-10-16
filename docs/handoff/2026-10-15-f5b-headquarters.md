# F5B handoff: campaign headquarters, roster UI, progression screens (2026-10-15)

Branch `plan-f5b-hq` (plan 8 of 22), cut from `d477d854`, merged with `main` at `c66fec46`. Not merged,
not deployed. Plan: `docs/superpowers/plans/2026-10-15-f5b-headquarters.md`. Standing reference for the
shell: `docs/campaign-data.md`, "The shell". Player-facing rules: `GAMEPLAY.md`.

## What shipped

- Air Group Headquarters is the front door (Personnel Files, new campaign, roster, dossier, Operations
  grid); mission-first picker then Assign; the title overlay is only Forms 4 to 6 ("Step 3 to 5 of 5").
- Scored sorties launch and bank through `launchSortie` / `bankSortie` once; Abandon Sortie forfeits;
  the debrief shows a Campaign Ledger and only Return to Headquarters. Training, Single and any Dev
  override are unscored. Dev is a checkbox in the same screens, plus "Create dev campaign" (assumption A1).
- `roster.ts` and `dossier.ts` deleted, no migration; legacy roster key purged.
- Rank insignia by `rankDevice`; Japanese devices are labeled estimates.
- "Sunny" is now "Clear" in every player-facing label; the stored value id `'sunny'` is unchanged.
- Fixed: an in-place scenario swap to a ship-less scenario (Night Range/Field, Gunnery Range) crashed
  with `entityViews: no mesh for spawned entity "cv-1"`; `frameFn` now returns early while the swap is pending.

## Per-mission aircraft lists (`content/campaign/mission-aircraft.json`, one table)

| Mission | Aircraft offered |
| --- | --- |
| water-quals | pby-5a-catalina |
| airfield-strike, convoy-strike, surigao-strait | f6f-hellcat, f4u-corsair, tbm-3-avenger |
| tank-buster, escort | f6f-hellcat, f4u-corsair |
| combat-air-patrol, scramble, single-combat | f6f-hellcat, f4u-corsair, f4f-wildcat |
| flattop-hunt | tbm-3-avenger |
| field-patrol (Japanese) | a6m2-zero |

P-38 is deliberately on no list (entry-rank lifeline invariant). Widening a list so an entry-rank pilot is
refused turns `tests/render/hq/missionAircraft.test.ts` red.

## Tacloban landing crash investigation (not an F5B regression)

`supportedContact` (`src/sim/ground.ts`) refused support when sinking over 0.1 m/s and speed above 1.42x the
effective stall; with flaps down the stall used was 37.77 m/s, so the limit was 120 mph (139 mph flaps up).
Mark's touchdown (126 mph, 1 mph sink, gear down) was unsupported with flaps down. `src/sim` diff against
`origin/main` was empty; there is no aircraft-versus-structure collider; runway heights agree between L0 and
L1 within 0.2 m except the south end (0.55 m). Fixed separately on `main` (`c66fec46`, clean stall speed).

## Tests updated

Unit: `campaignSession`, `campaignBank`, `hq/{model,launchRules,missionAircraft}`, `titleScreen`, `insignia`,
`debrief`, `flightRecord`, `cloudiness`, `noDeadlock`; fixtures `campaign.ts`, `catalog.ts`.
E2E new: `hq`, `hqLaunch`, `campaignSortie`, and a flightRecorder case (Dev checked on a scored mission
records and offers export; the same mission without Dev does not). Harness: `openHeadquarters`,
`openDevCampaign`, `toConditions`, `startGame` (unscored rows), `startCampaignGame`.
Reconciled to the HQ front door: sortie, launchFlow, scenarioPicker, title, boot, mission-ui, missions,
settingsUi (Settings locators use the visible dialog), meta-game(-relaunch), dossier, friendly-fire,
nightTakeoff, hangar, titleSwap, terrainTextures, sun/cloudShadow/clouds.
Deleted: `tests/render/{roster,dossier,devSortie}.test.ts`; the AD-2 resurrection flow no longer exists;
badge and Dossier banking from Dev fixtures is now unscored, so those E2E steps assert "banks nothing".

## Tests still valid

All of `src/campaign` and `src/sim` tests (no source change there); `tests/e2e/flightRecorder.spec.ts`
passes through the HQ harness.

## Known gaps and honest caveats

- E2E ran on nexus (680M), not the ryzen reference GPU. Passing: sortie, launchFlow, scenarioPicker,
  title, titleSwap, boot, dossier, missions, settingsUi, nightTakeoff, terrainTextures, flightRecorder,
  mission-ui (2 of 3), hangar (all but two heavy image-diff cases that time out under load).
- Failing on nexus and not reproduced on ryzen: `meta-game` (gpu sample count 7, needs more than 120: the
  known nexus sample-count flake), `meta-game-relaunch` (target-1 not killed or pass ends in impact, varies
  run to run), `mission-ui` first test and `friendly-fire` landing case (pass ends in impact). These fly a
  real-time scripted pass and are frame-rate sensitive; they need a run on the ryzen GPU before merge.
- Japanese `field-patrol` lists only the Zero: the sortie rule treats other Japanese aircraft as enemy outside Dev.
- Risks: R1 the persisted interrupted sortie resumes as lost on reload (by design); R2 two Settings dialogs
  live in the DOM (title and HQ), so specs must scope to the visible one; R3 gunnery/landing E2E timing above.
