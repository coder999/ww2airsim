# M1: Ship models with turrets, AA mounts and period paint

**Goal:** every warship gets a model whose main turrets and AA mounts are separate, positioned parts that M2-M4 can rotate and fire from. Our three Blender ships gain detail and camouflage. Track M in `MASTER_PLAN.md`.

**Run:** worktree `m1-ship-models` (Mark, 2026-10-08), merged to `main` at the end; unattended.
**Viewing checkpoints:** final product only. The handoff carries Hangar captures of all ten ships for when Mark is back.
**Blender work:** on Ryzen WSL via `remote-run` (Mark, 2026-10-08). Output stays byte-identical to nexus, so the pinned rebuild tests still hold (`serverconfig/ryzen.md`, "Compute offload").

## Rulings (Mark, 2026-10-08)

| # | Ruling |
| --- | --- |
| R1 | Split each download where its mesh allows; rebuild it as our own Blender model where it doesn't. |
| R2 | **Instanced mount kit.** A glb carries one shared mesh per mount type plus named empty locators, and the renderer instances them. Every mount can rotate, and the draw budget counts kit types, not mounts. |
| R3 | Essex: split the download (really Enterprise, CV-6) as it is. No rebuild. |
| R4 | Keep each hull's layout (Mogami's 5 turrets, the Musashi mesh standing in for Yamato). Give each the late-1944 AA fit. The 2026-09-25 "not 100% accurate" ruling stands. |
| R5 | Camouflage reopens. Period schemes (Measure 21/22/32 and IJN equivalents) where historically worn, with weathering and a finer atlas. This supersedes the DP2 ruling-out of Casablanca's dazzle. |
| R6 | Merchants (Type B Maru) get no mounts. |

## What exists (survey 2026-10-08)

- The pipeline is `tools/models/build.ts`, with the stage order at :85. It already has the stages this needs: `split` (`select: "components"`, `split.ts:300`), `keep` with `pivot`, `addShipMarkers` and `checkOutput` (bytes, triangles, draws, :159).
- Turret nodes exist only on Pennsylvania (`Turret1..4`) and Kagero (`Turret1..2`). Their origin is the ship's origin and they have no pivot, so they cannot rotate yet. No AA-mount name exists anywhere.
- Every download's gunhouses and barrels are separate mesh islands, so `split` carves them cleanly:

  | Ship | Source | Turret islands | Draws/budget | Method |
  | --- | --- | --- | --- | --- |
  | essex-cv | KTKloss Enterprise | 8 single 5" | 2/8 | split (R3) |
  | fletcher-dd | JZHU | 5 single 5" | 9/12 | split |
  | cleveland-cl | KTKloss | 4 triple 6" | 2/12 | split |
  | mogami-ca | KTKloss | 5 | 2/12 | split |
  | yamato-bb | KTKloss Musashi | 3 triple 18" | 2/12 | split |
  | shiratsuyu-dd | everlasting17th | 2 twin 127 mm (separate `maingun`/`antiaircraft` objects) | 12/12 | split |
  | pennsylvania-bb, kagero-dd, casablanca-cve | ours | 4, 2, 0 | 6, 3, 3 | detail pass |

- Our three scripts use 26-29% of their triangle budget. They are stacked tapered boxes on flat decks, with flat palette paint on one 1,024 px atlas.
- The DP2 handoff left four items open: Pennsylvania's "stacked trapezoid" bridge, the flat decks, invisible Essex planks (34 cm/px), and the dark-green funnel cap from the unmapped `dark` role.

## Design

### Mounts are data in the ship spec

Sim code never reads a glb, and M2 needs mount positions in the sim. The positions therefore live in `content/ships/<id>.json`, the one source:

```jsonc
"armament": {
  "turrets": [ { "x": 0, "y": 9.1, "z": 38.2, "kit": "turret-14in-triple", "aa": null } ],
  "heavyAA": [ { "x": 9.5, "y": 11.0, "z": 12.0, "kit": "mount-5in38-twin" } ],
  "lightAA": [ { "x": 8.0, "y": 12.4, "z": -4.0, "kit": "mount-40mm-quad", "barrels": 4 } ]
}
```

- Ship-local meters, in the same frame as the hull (`+z` bow, as `ships.ts` uses).
- `ShipSpecObject` (`src/sim/world/ships.ts`) gains `armament`. It is `.strict()` and required for every non-merchant role; a merchant must omit it, or the schema refuses it.
- USN 5"/38s are dual-purpose: a destroyer's or carrier's 5" turret is in `turrets` with `"aa": "heavy"`, and M2 fires it as heavy AA. IJN destroyer 127 mm guns are low-angle (`"aa": null`).
- **Light AA granularity:** one entry per gun tub. A quad or twin 40 mm, or a triple 25 mm, is one entry. 20 mm singles go in one entry per gallery, with `barrels` holding the count. This keeps the fits honest while Yamato stays at about 40 entries, not 110.

### The glb carries locators and kit meshes

- **Locators:** empty nodes `Turret1..N` (bow to stern, the `docs/models.md:75` convention), `HeavyAA1..N` and `LightAA1..N`, written by the build from the spec. Each sits at its mount's training axis, so a rotation about local Y trains it, and `userData.kit` names its mesh.
- **Kits:** one hidden node per kit type, `Kit_<kit>`, with its origin on its own training axis. A download's kit is the first carved island of that type; the rest of the islands of that type are deleted, and the locators stand in for them. A Blender ship's kit is built once by `kit.py`.
- **Renderer** (`src/render/scene/shipModels.ts`): after load, for each `Kit_*` it makes one `InstancedMesh` with an instance per matching locator, and hides the source node. It exposes `mounts: { name, kind, setTraining(rad) }[]` on the `ShipView`. Nothing calls `setTraining` until M3; the Hangar uses it for the check below.
- **Budget:** `checkOutput` counts draws as hull meshes plus one per kit type. Typical budgets stay at 12 draws. Triangle budgets count the kit once, plus instances × kit triangles, against a new separate `mountTris` line, so a hull's detail is not starved by its guns.

### The Blender detail pass

Pennsylvania first, since it sets the bar, then Kagero, then Casablanca. Each goes from about 28% to 70-90% of its triangle budget:

- **Superstructure:**
  - Pennsylvania's tripod and its proper bridge levels with wings (the DP2 open item);
  - directors (Mk 37 on the USN ships, Type 94 on Kagero);
  - search radars (SK/SG; Type 22 on Kagero);
  - Casablanca's island, with its platforms and mast.
- **Hull:**
  - deck sheer and camber, so the decks are no longer flat;
  - a knuckle on Kagero;
  - a bilge keel line at the waterline cut.
- **Fittings:**
  - railings as an alpha-tested texture strip, not geometry;
  - boats and davits;
  - Pennsylvania's catapult and cranes;
  - Kagero's torpedo mounts;
  - Casablanca's catwalks and gun tubs.
- **Paint:**
  - a 2,048 px atlas;
  - the scheme per ship from a cited source (Pennsylvania: whichever Measure she wore in October 1944, verified in Task 6; Casablanca-class Ms 32/15A; Kagero overall IJN grey with a linoleum deck);
  - weathering (rust streaks below scuppers and hawse pipes, grime at the waterline) baked into the atlas by `tools/models/skin/`;
  - the `dark` role mapped, which closes the funnel-cap item.
- Byte budgets rise only as far as the 2,048 px atlas needs. Each rise is recorded in the entry, with its measured size.

## Tasks

- [ ] **0. Worktree and Ryzen.** `git worktree add ../ww2airsim-m1 -b m1-ship-models`, link the model cache per `docs/models.md`, wake Ryzen, and confirm `remote-run blender -b --version` reports 5.0.1.
- [ ] **1. Armament schema.**
  - Add `armament` to `ShipSpecObject`, with the merchant rule.
  - Enroll it in `tests/sim/world/ships.test.ts`: every non-merchant shipped spec has at least one turret and one AA entry, and Maru has none.
  - See it fail red on the current specs, then fill all nine fits from the table below. Positions come from the island survey for downloads and from the scripts for ours.
- [ ] **2. Locators and kits in the pipeline.**
  - A build stage writes locators from the spec.
  - The `split` entries carve islands into `Kit_*` nodes and drop duplicates.
  - `checkOutput` counts kit draws and `mountTris`.
  - Enroll it in `tests/tools/shipModels.test.ts`: every locator matches its spec entry within 0.5 m, every locator's `kit` exists, and there are no orphan kits.
  - Re-pin the `FLAT_SOUP` hashes in `shipEntries.test.ts` deliberately, one commit per ship, with the reason in the message.
- [ ] **3. Renderer instancing.**
  - `shipModels.ts` builds one `InstancedMesh` per kit and exposes `mounts`.
  - The existing fallback stays: a missing kit reports and boxes the ship.
  - Unit test: draw count equals hull meshes plus kit types, and `setTraining` rotates only its own instance.
- [ ] **4. Downloads.** Split in this order, easiest first:
  1. Shiratsuyu
  2. Cleveland
  3. Fletcher
  4. Mogami
  5. Yamato
  6. Essex

  Then add the AA kits each lacks: heavy and light kits from `kit.py`, instanced at the spec positions.
- [ ] **5. Blender detail pass:**
  - Pennsylvania (with pivots on its existing `Turret1..4`), then Kagero, then Casablanca (which gains a `Turret1` for its stern 5").
  - Use `preview.py` renders on Ryzen to compare with the downloads at the same scale.
- [ ] **6. Camouflage and weathering.**
  - Scheme sources are cited in each entry's `reference`.
  - Re-check every byte budget and record each rise.
- [ ] **7. Hangar check.**
  - The Hangar turntable gets a "train mounts" toggle that sweeps every `setTraining` ±90°. It shows each mount moving on its own and the pivots in the right place.
  - Capture all ten ships, still and mid-sweep, on nexus.
- [ ] **8. Docs and close.**
  - `docs/models.md`: the locator and kit convention, replacing the "static until H3" note for ships.
  - `ASSETS.md`: rows for modified downloads (still CC-BY, "modified" noted).
  - `GAMEPLAY.md` ship roster.
  - Handoff `docs/handoff/<date>-m1-ship-models.md` with the captures.
  - `MASTER_PLAN.md` Track M row.
  - Merge to `main`, `npm run verify`, and email the handoff.

## Target fits, late 1944

From the survey. Every count is an ESTIMATE until it is checked against the cited source in Task 1, and the entry's `reference` records the source.

| Class | Main turrets | Heavy AA | Light AA tubs | Source |
| --- | --- | --- | --- | --- |
| Pennsylvania | 4 triple 14" | 8 twin 5"/38 | 10 quad 40 mm; 20 mm by gallery | Wikipedia, USS Pennsylvania (BB-38) |
| Kagero | 2 twin 127 mm (low-angle; X mount removed 1943-44, matching the model) | none | 2-3 triple, 1 twin 25 mm | combinedfleet TROM |
| Casablanca | 1 single 5"/38 (dual-purpose) | none | 8 twin 40 mm; 20 mm by gallery | Wikipedia |
| Essex (Enterprise mesh) | 8 single 5" (dual-purpose) | none | quad 40 mm per the mesh's tubs; 20 mm by gallery | Wikipedia; Friedman |
| Fletcher | 5 single 5"/38 (dual-purpose) | none | 5 twin 40 mm; 20 mm by gallery | Wikipedia |
| Cleveland | 4 triple 6" | 6 twin 5"/38 | 4 quad + 6 twin 40 mm; 20 mm by gallery | Wikipedia |
| Mogami (5-turret mesh) | 5 twin 8" (1939 refit) | 4 twin 127 mm | 25 mm triples, about 50-60 barrels | Wikipedia; TROM |
| Yamato (Musashi mesh) | 3 triple 18.1" | 6 twin 127 mm | 25 mm triples, about 98-130 barrels | Wikipedia; Skulski |
| Shiratsuyu | 2 twin 127 mm (low-angle) | none | 25 mm, 13-21 barrels | TROM |

## Done means

- The new and re-pinned tests are green, and `npm run verify` passes on `main` after the merge.
- Every warship's Hangar sweep shows each mount training independently.
- The ship draw budget is unchanged at 12, or each rise is recorded and justified.
- The handoff has all ten captures, and Mark judges them at his next look.
