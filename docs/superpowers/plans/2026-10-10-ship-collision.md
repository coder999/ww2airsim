# Air-to-ship collision

**Status (2026-10-10):** in progress on branch `ship-collision` (cut from `main` `7704b8bf`). Master plan: a one-line rule under Track E item 2 (E2's kamikaze text is rewritten). Handoff (when done): `docs/handoff/2026-10-10-ship-collision.md`.
**Viewing checkpoint (Mark, 2026-10-10):** final product only.
**Run mode:** unattended.
**Location:** a worktree.
**Heavy jobs:** tests, typecheck, lint, `npm run verify` and calibration sweeps go to ryzen (`REMOTE_RUN_OVERFLOW=0 remote-run ...`), GPU captures to the ryzen console-session Playwright server.

## What was asked (Mark, 2026-10-10)

**An airplane that collides with a ship is destroyed, and the ship takes damage.** The design is mine, inside these limits:

- A legitimate deck landing, a take-off roll and a parked airplane are never collisions.
- Hull box minimum; a coarse superstructure allowance in a small named table.
- The airplane is destroyed by the mechanism every other kill uses (burning is skipped for an outright destruction, wreck, debris, debrief, HUD). God mode: the player bounces, as against the ground.
- The ship loses hull points from one named formula, calibrated to a 500 lb bomb hit for a Hellcat at 100+ m/s; heavier or faster costs more, with floor and cap. No flooding, no detonation of carried ordnance.
- Opposing-side collision is that side's damage to the ship, with kill credit. Own-side is physical too and goes through the friendly-fire rules.
- E2's kamikaze run ends in a real collision, recalibrated.
- Determinism: with no collision, results are bit-identical.

## What is in the code (read 2026-10-10)

| Fact | Where | Consequence |
| --- | --- | --- |
| `stepAircraftEntity` ends an airplane on the ground, the sea or a deck with an `Impact` (`surface` `'deck'` for a carrier) unless `supportedContact` holds; God mode bounces instead. | `src/sim/loop.ts` | A hard or fast arrival on a flight deck is already an unsupported `deck` impact, so the new rule sees it as a collision with that ship; a hull-box intrusion elsewhere is new. |
| A bomb hit is `store.damage` hull points (`AN-M65` 120, `Type 98 No. 25` 48, `Mk 13` torpedo see content), through `damageShip`. Sinking credit goes to `ShipDamage.attacker` 90 s later. | `src/sim/weapons/combat.ts`, `content/aircraft/f6f-hellcat.json` | A collision calls `damageShip` with the airplane as attacker: credit, fire, sinking come free. |
| `hullHit` is the hull box (length by beam, sea to `deckHeightM`) in the ship frame, from the ship's previous to current pose. | `combat.ts` | Same frame and the same `segmentBox`, now for an airplane's swept origin. |
| `destroyedAt` is the one "destroyed" mark: the wreck falls (`stepWreck`), `kill.air` and debris draw, the HUD says DESTROYED, the mission sees it. `withStructure(..., 0, ...)` sets it. | `src/sim/damage/model.ts`, `loop.ts`, `src/render/fx/events.ts` | An outright destruction uses `withStructure`, and the wreck stops against the hull and falls alongside. |
| Friendly fire: `ownSideTarget`, `withFriendlyFire`, `friendlyKills`; the sinking loop already scores an own-side sink as a friendly kill. | `src/sim/weapons/friendlyFire.ts`, `combat.ts` | The collision calls the same helpers. |
| E2's kamikaze lets its bomb go inside 150 m and ends in the sea (ruling R5). | `src/sim/ai/attack.ts`, `docs/handoff/2026-10-10-e2-attack-ai.md` | The run keeps its dive line and loses the release. |

## Design

**New `src/sim/shipCollision.ts`**, pure, called once per tick from `advance` after `stepCombat`:

- `COLLISION`: the one named config. `bodyRadiusM` (horizontal inflation of the airplane's origin), the damage formula (`refHullDamage` 120 = the 500 lb bomb, `refMassKg`, `refSpeedMps`, `floorFraction`, `capFraction`) and `SUPERSTRUCTURE`, a table by role (carrier island, battleship and cruiser bridge and funnels, destroyer deckhouse, merchant house): center and half size as fractions of length and beam, and top height above the deck.
- Damage in hull points = `clamp(refHullDamage * (mass / refMass) * (relSpeed / refSpeed)^2, floor, cap)`: kinetic-energy scaling, relative speed against the ship.
- Test: the airplane's origin swept from its start-of-tick position to its end-of-tick position, in the ship frame of the matching pose, against the hull box and the superstructure box (`segmentBox`). The origin must be below a volume's top (no vertical allowance, so a pass above is a pass). Cheap early-outs: height above the tallest volume, then squared horizontal distance to the ship against its bounding circle.
- Exempt: an airplane `supportedContact` on any flight deck (take-off roll, trap, parked).
- Outcome, an airplane that is not already destroyed or crashed: `destroyedAt` set with attacker `collision:<ship id>` (so the debrief says it hit the ship, not AA), the wreck's velocity set to the ship's and its position to the entry point. An airplane that arrives on a deck unsupported already has its `Impact`; it only costs the ship.
- Outcome for the ship: `damageShip(..., attacker = the airplane)`; if the ship is of the airplane's side, `withFriendlyFire`. No flooding and no ordnance detonation.
- God mode, the player only: `bounceState` above the volume top, no damage to either (the same non-event the ground is).
- Effects: the existing `kill.air` explosion and fire at the entry point and the ship's own fire from its hull points. No new asset.

**E2's kamikaze**: the dive stays; `dropBomb` goes; the line aims at the hull center (led for the ship's motion) and a pilot's sight error steers it as for the bombers. The order no longer arms the racks for a kamikaze. Recalibrated by a bounded multi-seed sweep, veteran against green.

## Tasks

1. **Plan** (this file), emailed.
2. **Collision geometry and config**: `shipCollision.ts` with `COLLISION`, volumes, `collisionOf`; unit tests (hull hit, above, alongside, deckhouse, each role in content enrolled).
3. **Hull-point formula**: `collisionDamage`; test against the Hellcat's bomb damage from content (within 15 percent), monotone in mass and speed, floor and cap.
4. **Wire into `advance`**: the airplane destroyed, the ship damaged, credit, friendly fire, God bounce; integration tests on `createWorldOf` with a destroyer.
5. **Never a collision**: clean carrier trap, parked deck airplane, take-off, low pass above the deck; the existing carrier suites run untouched.
6. **Determinism and cost**: no collision is bit-identical (existing goldens and digests); a 13-ship `range-test` steps at real time with the collision on (measure).
7. **E2 kamikaze**: real collision, remove the release, update `attack.ts`, scenario arming, tests.
8. **Re-run E2's calibration** (`tests/sim/ai/attack.test.ts`, `tools/ai/attackSweep.ts`); the kamikaze sweep veteran against green; anything re-pinned gets a reason.
9. **Debrief text** for a collision death.
10. **Docs**: `CONTEXT.md` ("Collision"), `docs/testing.md` if a capture spec is added, `MASTER_PLAN.md` E2 kamikaze text and one rule line.
11. **Full `npm run verify`** on ryzen, green.
12. **Capture spec** (`E2E_CAPTURE=1`): a kamikaze ending in a collision on `attack-range`, read through `__ww2.aircraft()` and `__ww2.ships()`; run on the ryzen GPU; JPEGs under `docs/handoff/`.
13. **Handoff** and email with the pictures inline.

## Rulings (conservative defaults, recorded as built)

Filled in at the end of the build in the handoff.
