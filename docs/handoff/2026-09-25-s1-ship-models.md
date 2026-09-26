# S1 handoff: ship models from licensed candidates (2026-09-25)

S1 replaces the procedural boxes of the three shipped ships with licensed
Sketchfab models: the CV-6 Enterprise model drawn as `essex-cv`, a Fletcher
as `fletcher-dd`, and a Liberty ship as `type-b-maru`. Each is fitted at
build time to its `content/ships/<id>.json`, so the sim stays authoritative.
The game and the Hangar both load them through Z1's shared model cache, and a
model that fails to load draws the boxes and reports it in `validationErrors`.
Branch `worktree-models-track`, commits `a379006`..`de49744` for Tasks 1 to 9
plus this handoff's commit, on top of the plan (`1bfe201`) and Mark's rulings
(`a30edfb`). The plan is
[`2026-09-25-s1-ship-models.md`](../superpowers/plans/2026-09-25-s1-ship-models.md);
the design is
[`2026-09-25-ship-models-design.md`](../superpowers/specs/2026-09-25-ship-models-design.md).

**The reference-GPU Tier 2 has not been run.** Its specs are written,
typechecked, linted and collected (Task 9 Steps 1 to 3). The run itself
(Steps 4 to 7) is pending, because both spare dev-server slots were held by
other sessions. See "Reference-GPU Tier 2" below for what to run and what
each check should show.

`content/aircraft/wildcat.glb` kept its bytes: sha256
`3f7a6ccf…58d6e`, checked after every task and at the end.

## Tier 1

Every task ended with typecheck, lint at zero warnings, depcruise and the
full suite at `rc=0`. Final count (Task 9): **1,999 passed, 14 skipped in 195
files**. Tasks 7 to 9 ran the suite on the Windows desktop's WSL through
`remote-run`, where the gitignored terrain tiles are absent. The two skips
beyond nexus's usual 12 are in `tests/render/terrainLod.test.ts`, which
passes in full on nexus (checked 2026-09-25).

## Measured results

Re-measured on the **committed** glbs against the live ShipSpecs on
2026-09-25 (`fitProblems` and the `asset.extras.shipFit` each build
records). Every number matches the plan's "Measured" table.

| | `essex-cv` (CV-6) | `fletcher-dd` | `type-b-maru` (Liberty) |
| --- | --- | --- | --- |
| Bytes / triangles / draws | 671,660 / 15,465 / 5 | 1,782,996 / 43,316 / 9 | 2,900,088 / 42,735 / 1 |
| Fit | deck: `rx` 1.0123, `ry` 0.9523, `sy/sx` 0.9407, `shiftX` +1.25 m | hull | hull |
| `kWaterline` / `kDeck` | 1.0802 / 1.2147 | 1.0893 | 1.1042 |
| Overall length vs `lengthM` | 269.08 m vs 265.8, +1.23% | 114.80 m, 0.00% | 112.00 m, 0.00% |
| Waterline beam | 28.32 m | 12.00 m | 15.80 m |
| Deck | plane 17.000 m; length 263.0 m; width 32.90 m | main deck 3.41 m | main deck 4.17 m |
| Base | skirt to −3 m | keel −3.885 m | keel **−5.348 m** |
| Bow | island mean z +14.64 m (starboard) | narrow end 0.210 | narrow end 0.938, pinned (±0.03) |

The CV-6's deck grid (2,096 cells of 2 m): 96.46% of inner cells within
±0.15 m of the deck, 93.18% of all cells, 0 lane misses, 1.86% below the deck
(all in the tapered corners), and the tallest fitting outside the island
0.40 m. The trap lane that clears the island is 9.25 m half-width, 18.5 m
wide (Mark's ruling). The island's nearest inboard point is 7.45 m from the
centerline, at its forward end (the plan's 7.5 m, which Mark accepted as
drawn). The heaviest scenario (deck-quals and free-flight: one carrier and
two destroyers) draws 102,097 ship triangles.

## Reference-GPU Tier 2: PENDING

Not run. To run it, follow the plan's Task 9 Step 4: point this worktree's
`vite.config.ts` at `ww2airsim-2.windomlane.org` and port 5175 (local
scratch, never committed), start `WW2AIRSIM_TUNNEL=1 npx vite --port 5175`,
assert the host returns 200, then:

```sh
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-2.windomlane.org \
  npx playwright test tests/e2e/ships.spec.ts tests/e2e/deckQuals.spec.ts \
  tests/e2e/hangar.spec.ts tests/e2e/entities.spec.ts tests/e2e/strike.spec.ts
```

What each should show:

- `ships.spec.ts`: `__ww2.shipModels()` is `[essex-cv, fletcher-dd,
  fletcher-dd]` in free-flight and deck-quals and `[type-b-maru]` in
  strike-range, with `validationErrors` empty; three Hangar broadsides are
  written to `test-results/ships-<id>-side.png`; gpu p95 is under 6.0 ms at
  1440p in deck-quals (parked on the deck) and strike-range (1.5 km short of
  the freighter, 800 m up).
- `deckQuals.spec.ts`: the new deck probe reads within 0.2 m of the sim's
  `deck().heightM` at all five points (under the parked airplane and ±1.7 m
  to either side, the trap zone's center, and 5 m short of the bow). The
  existing tests hold, including photoreal Task 12's deck/runway luminance
  ratio inside [0.5, 1.5] (0.64 with the boxes). If only that ratio fails,
  the plan's Step 6 allows retuning `SHIP_PALETTES['usn-1944'].flightDeck`
  and rebuilding `essex-cv`; nothing else may be retuned.
- `hangar.spec.ts`: check 1 masks the three ship models at 2% to 80% of the
  frame, with no validation errors.
- `entities.spec.ts`: the task force sails, and its 1440p budget holds with
  the models.
- `strike.spec.ts`: unchanged, because the hit box did not move. It was
  recorded as uncollectable before S1. If it still is, run it on `main` too
  and record that as pre-existing.

Then read every PNG yourself (the broadsides, `ships-deck-quals.png`,
`ships-strike-range.png`, `deck-quals-parked.png`). Check that the bow points
toward +x, the island is to starboard, the waterline sits at the sea, no
hull is black or see-through, and the Fletcher's railings show as lattices.
Tick Task 9 Steps 4 to 7 in the plan, fill in this section and §15's row,
and remove "Tier 1 only" from both.

## The interface S2 and H3 consume

Tooling (`tools/models/`, Node only):

- The `ship` block: `ShipEntry`, with `otherMaterials`, `bow` (the
  narrow-end rule, or `{ pinnedNarrowEnd, evidence }`) and `keelM` (a full
  hull only). The schema and its cross-field rules are in
  `tools/models/manifest.ts`.
- `shipFitStage`, `addShipMarkers`, `documentSoup` and `SMOKE_REACH_M` are in
  `tools/models/stages/shipFit.ts`. `shipMaterials` and `roleMaterial` are in
  `tools/models/stages/shipMaterials.ts`.
- `fitProblems`, `residualProblems`, `trapLaneHalfWidth` and the rest of the
  pure fit are in `src/render/scene/shipFit.ts`.
- `SHIP_PALETTES` is in `src/render/scene/shipPalette.ts`. Only `usn-1944`
  exists; S2 adds `ijn`.

Runtime (`src/render/`):

- `SHIP_MODELS`, `makeShipViewLoader(reportError, acquire?)`,
  `loadRegisteredShipView` and `LoadShipView` are in
  `src/render/scene/shipModels.ts`.
- `ShipView` (`root`, `model`, `setDamage`, `dispose`),
  `createShipView(spec, modelId, instance)`, `createShipMesh` (the boxes)
  and `probeShipSurface` are in `src/render/scene/ship.ts`.
- `shipModelPath` and `shipModelUrl` are in `src/render/content.ts`.
- The glb nodes are `SmokeOrigin` (every ship) and `TrapBand` (carriers,
  with `extras.halfWidthM`).
- `buildScenarioEntities(scene, world, previous, loadAirframe, loadShip)`
  and `loadHangarModel(entry, loadAirframe, loadShip)`.
- `__ww2.shipModels()` and `__ww2.shipDeckProbe(shipId, points, space)` are
  available in DEV builds.

## What changed visibly

- The three shipped ships are real models, in the game and the Hangar.
- Ships list about the keel when damaged, not about their center.
- The boxes sink by their own hull top plus 2 m before hiding, so they go
  deeper: escort 23 m, carrier 33 m, merchant 19 m.
- The legend's credits gain a line: `Models: KTKloss, JZHU, AlanTinka,
  rojatsu (CC BY 4.0)`. Each author links to the model, and the license
  links to the deed. It is the Wildcat's first in-app credit too.

## Traps

- A ship glb is fitted to the spec's numbers at build time. If you change
  the dimensions in `content/ships/<id>.json`, Tier 1 fails until the glb is
  rebuilt with `npm run models:build -- <id>`.
- Never `disposeMeshTree` a `ShipView`'s root. Call `dispose()`, which
  releases the shared instance.
- The marker nodes are added after `prune`. A stage added between them and
  `prune` would lose them.
- The raw inputs are gitignored in `tools/models/cache/`. On a fresh clone,
  re-fetch them with `tools/models/sketchfab-fetch.sh`.
- The full suite on ryzen skips two more tests than on nexus, because the
  terrain tiles are absent there. Those are skips, not failures.

## Departures

The design-level departures are listed in the plan, under "Departures from
the spec's wording" (items 1 to 23). The execution departures:

1. **Tier 2 was not run** (above). §15's row says Tier 1 only, as Z1's does.
2. **The executor was killed mid-Task 7** when nexus restarted. The
   uncommitted Task 7 diff was intact and matched the plan's hunks exactly.
   The resumed session re-ran its named tests (87/87), ran the full suite
   and committed it. Nothing was redone.
3. **From Task 7 on, the full suite ran on ryzen through `remote-run`**, not
   under the plan's `flock` on nexus, after nexus was OOM-killed twice on
   2026-09-25.
4. **The rulings ledger lives at
   `.superpowers/sdd/2026-09-25-s1-ship-models/`**, not the plan's
   `.superpowers/sdd/s1-ship-models/`.
