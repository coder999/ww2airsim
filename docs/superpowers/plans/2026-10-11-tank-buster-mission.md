# Tank Buster mission

**Status (2026-10-11):** implementation complete and verified on branch `tank-buster-mission`; ready for the requested merge into `main`.
**Viewing checkpoint (Mark, 2026-10-11):** final product only.
**Run mode:** unattended.
**Heavy jobs:** focused tests may run on nexus; full verification and capture run through ryzen with `REMOTE_RUN_OVERFLOW=0 remote-run ...` and the console-session Playwright service.

## What was asked

Build a mission in which a US aircraft strafes and bombs Japanese tanks in the Philippines. Use the existing Type 97 Chi-Ha model as a stand-in, with a historically closer model deferred. Establish whether US tanks were active in the Philippines and whether tank-versus-tank combat occurred.

## Historical ruling

- US tanks did fight in the Philippines. M3 Stuarts of the Provisional Tank Group met Japanese Type 95 light tanks in the 1941–42 campaign. In the 1944–45 return, US M4 Shermans and M5 Stuarts fought Japanese armor, including the large January 1945 action at San Manuel, Luzon.
- This mission is a playable composite inspired by Japanese armor of the 7th Independent Tank Company operating along the Dulag–Burauen road during the Leyte campaign. It is not a reconstruction of one sortie.
- The current Type 97 Chi-Ha is authentic to the Philippines theater, especially Luzon, but the better documented Japanese tanks in the Leyte fighting were Type 89 mediums and Type 95 Ha-Go light tanks. Every player-facing historical note that mentions the model will call it a temporary stand-in. A Type 89 or Type 95 can replace it later without changing the mission or ground-target contract.

Primary sources and contemporary material:

- US Army, *The Fall of the Philippines* (Japanese tank regiments and 1941 campaign): `https://history.army.mil/portals/143/Images/Publications/catalog/5-2.pdf`
- US Army, *Leyte: The Return to the Philippines* (7th Independent Tank Company and Dulag–Burauen fighting): `https://www.govinfo.gov/content/pkg/GOVPUB-D114-PURL-gpo107815/pdf/GOVPUB-D114-PURL-gpo107815.pdf`
- US Army Forces Pacific Ocean Areas, *Intelligence Bulletin No. 11* (San Manuel tank action): `https://www.ibiblio.org/hyperwar/NHC/NewPDFs/USArmy/USAFPOA%20Intelligence%20Bulletin/USAFPOA%20Intelligence%20Bulletin%20No.%2011%201945-03-09.pdf`

## Verified starting facts

| Fact | Where | Consequence |
| --- | --- | --- |
| `content/vehicles/type97-chi-ha.glb` is committed, registered, rigged and covered by model tests. | `src/render/scene/staticModels.ts`, `src/render/scene/vehicleRig.ts` | The mission reuses the production model and rig; no placeholder geometry or new art is needed. |
| Scenario schemas include aircraft, ships and airfields, but no vehicles. | `src/sim/scenario.ts` | Add a narrow static-vehicle authoring contract rather than a moving armor simulation. |
| Destructible airfield objects already accept bullets, rockets, bombs, blast damage, mission-objective tags and side ownership. | `src/sim/weapons/structures.ts`, `src/sim/weapons/combat.ts`, `src/sim/mission/entities.ts` | Static tanks enroll in the same damage/objective pipeline. |
| Aircraft gun rounds do 4 HP, HVARs do 40 HP with an 8 m blast radius, and the AN-M65 bomb does 120 HP with a 30 m blast radius. | F6F content and weapon tests | A 48 HP tank needs 12 direct gun hits; one HVAR plus two gun hits; or a direct 1,000 lb bomb. Blast placement remains important. |
| `TargetType` drives kill scoring, pause/debrief tally, and career totals. | `src/sim/weapons/targetType.ts`, pause/debrief modules | Add `tank` as a first-class scored target instead of reporting armor as a building. |

## Design

### Static vehicle contract

Add optional `vehicles` to a scenario. Each entry has an id, registered model id, world position, heading, HP, side, and tags. At world construction/rebuild it becomes a destructible `StructureEntity` of kind `tank`, with terrain-adjusted height and a footprint derived from its authored dimensions. Vehicles are stationary in this iteration: no pathfinding, suspension physics, weapons or AI.

The existing structure collision and blast code remains the single damage authority. Destroyed tanks continue to exist as objective records and render as inert wrecks. Tank destruction increments `killsByType.tank` and does not inflate the building/structure tally.

### Rendering

Create a small vehicle view around the shared model cache and existing Type 97 rig. `ScenarioEntities` owns and disposes vehicle views alongside aircraft and ships. The render loop synchronizes position, heading and destroyed state; an intact tank remains upright, while a destroyed tank gets a deterministic wreck pose and visual darkening/smoke through the existing effects path where practical. Loading failure preserves the current scenario, matching aircraft/ship transaction semantics.

### Mission

Ship `tank-buster`, a Leyte-based F6F-5 strike:

- start airborne six miles north of the target, pointed down the attack run, with guns, HVARs and 1,000 lb bombs;
- attack a dispersed six-tank Japanese column near the Dulag–Burauen road;
- primary objective: destroy at least four tanks, then recover at Tacloban;
- secondary objective: destroy all six tanks;
- clearly label the Chi-Ha as a visual stand-in in the mission history/description;
- use a spacing that rewards deliberate strafing and rocket runs and permits a well-placed bomb to damage multiple tanks without clearing the whole column.

Tank score: 300 points, between AAA/buildings and transport shipping. This is a gameplay value, not a historical claim.

## Tasks

1. Add this plan and email it.
2. Add scenario vehicle schema, validation and representative schema tests (happy path, bad model/id/HP/side/footprint).
3. Build vehicle-backed destructible world entities, terrain-height rebuild, side/tag objective resolution and damage integration tests.
4. Add `tank` target type, 300-point value, tally/career labels and regression tests. Preserve the current `structuresDestroyed` meaning for non-vehicle structures.
5. Add cached vehicle rendering, lifecycle/disposal tests, pose sync and destroyed-state rendering.
6. Author `tank-buster.json`, ribbon/menu enrollment, historical copy, six targets, loadout, objectives and recovery.
7. Add focused mission tests: target count/spacing/side, 48 HP weapon arithmetic, primary threshold, secondary sweep and landing requirement.
8. Update `GAMEPLAY.md`, the vehicle library status, `MASTER_PLAN.md`, and `docs/testing.md` if a new capture flow is added.
9. Run focused unit/type/lint checks on nexus.
10. Run the full documented verification on ryzen.
11. Run an E2E mission capture on the ryzen GPU: launch the mission, deep-read the six tank entities, verify the model appears at the authored positions, destroy at least one with player ordnance, and capture the target area plus tally/objective result.
12. Write and email a handoff with inline evidence, commit, merge to `main`, push, and archive the worktree when Mark asks for integration.

## Acceptance gates

- The mission is selectable outside Dev mode and launches without validation errors.
- Six Japanese tanks are visible on land, targetable by guns/rockets/bombs, and represented by the Type 97 model.
- A tank needs 12 direct 4 HP gun hits; one 40 HP HVAR alone does not kill it; an AN-M65 direct hit does.
- Tank kills score exactly 300 points, appear as tanks in the live pause tally/debrief/career accounting, and do not count as buildings razed.
- Destroying four tanks alone does not complete the mission; safe recovery at Tacloban after four destroys does. Destroying all six awards the secondary objective.
- Mission/objective/map views identify the tank group and the player-facing copy states that the Chi-Ha is a stand-in for the Leyte armored force.
- Existing scenario, structure, mission, pause/debrief, model-cache and deterministic simulation suites remain green.
- Full `npm run verify` is green on ryzen, and the E2E capture verifies gameplay rather than only scene composition.

## Out of scope

- Tank movement, suspension physics, pathfinding, firing, crews or tank-versus-tank AI.
- A new Type 89 or Type 95 model.
- Reworking generic ground-object collision beyond the current destructible-target system.
