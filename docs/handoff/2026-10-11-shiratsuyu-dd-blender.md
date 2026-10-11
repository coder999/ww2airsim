# Shiratsuyu-class destroyer original Blender rebuild — handoff (2026-10-11)

## Result

`shiratsuyu-dd` now ships an original, deterministic Blender model in place of the Samidare
Sketchfab download. The gameplay ID and every numeric ship/spec field are unchanged. The only edit
to `content/ships/shiratsuyu-dd.json` is the source note: it corrects the old description of 107.5 m
as overall length (it is the preserved gameplay/waterline length; Wikipedia gives 109.6 m overall)
and records which positions are fitted.

- Worktree: `/home/mark/projects/ww2airsim-shiratsuyu-blender`
- Branch: `blender-shiratsuyu-dd`
- Script: `tools/models/blender/shiratsuyu-dd.py`
- Output: `content/ships/shiratsuyu-dd.glb`
- Output SHA-256: `c0eff505cddc94687bed11fd429d20a725fa356e49942b0f847bf5623df66b2b`
- Output inspection: 1,189,004 bytes, 22,464 triangles, 5 draw calls, 20 nodes, 5 meshes,
  3 materials and 3 WebP textures; bounds `[-53.750,-3.500,-4.950]` to
  `[53.750,20.121,5.310]` m.
- Retired external output: 2,644,164 bytes, 50,758 triangles and 15 draw calls. Its author/license
  credit remains in `ASSETS.md` as a retired, reference-only row; none of that geometry or texture
  is incorporated in the new GLB.

## Sources and measurement

All sources were read 2026-10-11.

- [English Wikipedia, Shiratsuyu-class destroyer](https://en.wikipedia.org/wiki/Shiratsuyu-class_destroyer):
  **CITED** 103.5 m between perpendiculars, 107.5 m waterline, 109.6 m overall, 9.9 m beam,
  3.5 m draft, 34 kn original / 33.3 kn modified, two shafts, three boilers, 42,000 hp, original
  2 twin + 1 single Type 3 127 mm guns, two quadruple 610 mm banks, 16 torpedoes and 16 depth
  charges; wartime removal of the single X mount and eventual 13–21 25 mm guns. The article also
  supports the compact bridge, long flared forecastle, Type 22 foremast radar and Type 13 mainmast
  radar.
- [Wikimedia Commons, *Fig of IJN DD Samidare in 1944.gif*](https://commons.wikimedia.org/wiki/File:Fig_of_IJN_DD_Samidare_in_1944.gif):
  **MEASURED** July 1944 side and plan silhouettes, hull sheer and beam distribution, bridge,
  funnel, torpedo-bank, mast, gun and AA order. Its 50 m scale bar spans about 199 px. The ship
  silhouette spans about 441 px, or 110.8 m at that scale, consistent with the cited 109.6 m
  overall within the figure's thick lines and pixel resolution. The trace was normalized to the
  existing 107.5 m gameplay length rather than changing the hit box.
- [CombinedFleet, IJN Samidare TROM](https://www.combinedfleet.com/samida_t.htm): **CITED** the
  single X turret was probably removed and replaced with a triple 25 mm mount during the
  13–19 December 1943 Yokosuka refit.

The original 500 × 260 drawing and all temporary measurement/render files were deliberately kept
out of the commit. The two committed review sheets are derived renders, not incorporated source
artwork.

## Station record

The model frame is +x bow, +y up, +z starboard, waterline y=0. The hull is a full-hull loft pinned
to a -3.5 m keel. `deck y` and `deck half-beam` are the deck-edge trace; underwater fullness is an
estimate. Values are meters.

| x | aft of bow | waterline half-beam | draft | deck y | deck half-beam | basis |
|---:|---:|---:|---:|---:|---:|---|
| -53.75 | 107.50 | 0.18 | 2.20 | 2.48 | 0.45 | MEASURED/normalized |
| -49.00 | 102.75 | 2.35 | 3.00 | 2.55 | 2.75 | MEASURED/normalized |
| -40.00 | 93.75 | 3.90 | 3.40 | 2.80 | 4.10 | MEASURED/normalized |
| -30.00 | 83.75 | 4.75 | 3.50 | 2.95 | 4.85 | MEASURED/normalized |
| -17.00 | 70.75 | 4.95 | 3.50 | 3.18 | 4.95 | MEASURED/normalized |
| 0.00 | 53.75 | 4.95 | 3.50 | 3.60 | 4.95 | MEASURED/normalized |
| 18.00 | 35.75 | 4.78 | 3.50 | 3.92 | 4.88 | MEASURED/normalized |
| 31.00 | 22.75 | 4.45 | 3.40 | 4.25 | 4.65 | MEASURED/normalized |
| 39.00 | 14.75 | 3.85 | 3.20 | 4.42 | 4.20 | MEASURED/normalized |
| 47.00 | 6.75 | 2.35 | 2.80 | 5.65 | 3.15 | MEASURED/normalized |
| 52.00 | 1.75 | 0.90 | 2.30 | 6.55 | 1.45 | MEASURED/normalized |
| 53.75 | 0.00 | 0.10 | 1.80 | 6.85 | 0.28 | MEASURED/normalized |

Major stations and fittings:

| item | x / station | y / vertical | size or z | basis |
|---|---:|---:|---|---|
| lower bridge tier | 28.0 | traced deck to 6.59 | 9.0 × 6.9 m plan | MEASURED footprint; ESTIMATE height |
| middle / upper bridge | 27.0 / 26.2 | 6.57 / 8.80 | 5.2 × 5.0 / 3.7 × 3.7 m | MEASURED order; ESTIMATE dimensions |
| forward / after funnel | 18.0 / 7.0 | deck to 12.25 / 11.35 | oval casings | MEASURED positions; ESTIMATE casing |
| forward / after torpedo bank | 10.5 / -10.0 | local deck | 4 × 610 mm, static | CITED count; MEASURED positions |
| foremast / mainmast | 27.2 / -20.5 | tops 20.1 / 14.6 | tripod/lattice | MEASURED positions; ESTIMATE construction |
| Turret1 / Turret2 | 37.0 / -33.5 | 4.39 / 2.94 | z 0 / -0.2 | FITTED existing spec |
| forward / center / after AA surfaces | 29.8 / 1.5 / -29.0 | 6.59 / 6.85 / 4.77 | existing spec positions | FITTED existing spec |

The side and plan overlay sheet aligns model and drawing by bow/stern extent. It supports the
waterline length, sheer, beam, compact forward superstructure, two-funnel/torpedo-bank sequence and
major weapon order. It also makes the limits visible: the new superstructure and mast construction
are deliberately simpler than the drawing, the underwater body has no lines-plan source, and small
boats, directors, vents, davits, rails, depth-charge gear, radars and fittings are estimates.

## Motion, fit and rendering

- Both surviving 127 mm twins are `Turret1`/`Turret2` instances of
  `Kit_turret-127mm-twin`; their `_Guns` child elevates independently while the parent trains.
- Light AA stays generated by `shipMounts.ts`. Seven spec groups expand to 12 independently
  placed `LightAA...` locators with `Kit_mount-25mm-single` and `_Guns` children. Platforms/decks
  exist beneath the fitted locations. The numeric armament spec is unchanged.
- Torpedo banks and depth-charge racks are visual/static because they are not gun-fire positions
  in the current ship armament schema. `aa: null` on both 127 mm twins remains the existing honest
  low-angle gameplay choice.
- Full hull, -3.5 m keel, 107.5 m length, 9.9 m beam fit, bow identification, smoke origin and
  damage-list/sink behavior use the normal ship build/renderer path. The skin uses the IJN palette,
  a 2,048 px atlas and a committed Ryzen RX 6700 XT AO/normal bake. The bake records 51 details and
  two symmetric missed porthole rays; those small marks were omitted rather than falsely claiming a
  perfect bake.

## Verification

### Model and unit suites

- Broad remote run: 59 files / 1,453 tests; initially 1 Shiratsuyu overlap test and 4 tests tied to
  a concurrently overwritten shared Fletcher raw failed. The nine coplanar Shiratsuyu faces were
  removed. Fletcher's cache was restored to its pinned SHA by the Fletcher workstream.
- Focused final remote run:
  `npx vitest run tests/tools/models/blender/ships.test.ts tests/tools/models/blenderEntries.test.ts tests/render/shipGunLaying.test.ts tests/sim/weapons/gunLaying.test.ts`
  — **4 files, 109/109 passed**. This includes outward winding, no coplanar overlaps, deck inside
  hull, role palette, pinned Blender roster, and byte-identical rebuild of the committed GLB.
- Post-restore external runs:
  `tests/tools/models/shipEntries.test.ts` — **3/3 passed**;
  `tests/tools/models/sketchfabEntries.test.ts` — after pinning the correct new external count of
  12, **25/25 passed**. Fletcher's raw SHA and byte-identical rebuild both passed.
- Final direct build in the worktree after the remote validation produced the SHA and inspection
  recorded above. `blenderEntries.test.ts` independently reproduced those committed bytes.

### Browser and capture checks

Local Vite ran at `http://127.0.0.1:5196`.

- `tests/e2e/ships.spec.ts --workers=1`: 4/6 passed on the first run. The deck-quals 1440p case
  failed only at `Page.captureScreenshot` and passed alone on its required retry (GPU p95 16.133 ms,
  169 samples). The strike-range 1440p performance/capture case first collected only 42 samples,
  then failed two isolated retries in `waitForTerrain` / `startGame`; it never reached a model
  assertion. The scenario/model enumeration checks and side-Hangar capture test passed with no
  validation errors.
- `E2E_CAPTURE=1 E2E_SHIPS=shiratsuyu-dd tests/e2e/shipCaptures.spec.ts -g "ship views"`:
  **1/1 passed**, producing close, side-close, deck and 1,500 ft Shiratsuyu views.
- `E2E_CAPTURE=1 tests/e2e/shipCaptures.spec.ts -g "ship captures"`:
  **1/1 passed**, exercising every ship at rest and with mount training 60 degrees and gun
  elevation at 60 percent.
- `E2E_CAPTURE=1 tests/e2e/gunLayingCapture.spec.ts`: timed out twice waiting for an aircraft
  target. That capture targets `aa-range`'s **Fletcher**, not Shiratsuyu; the pure renderer and sim
  gun-laying suites above both passed.

## Review images

- `docs/handoff/2026-10-11-shiratsuyu-dd-blender-shots/shiratsuyu-dd-before-after.jpg`
  — retired external vs new original model, side and top, identical orthographic cameras.
- `docs/handoff/2026-10-11-shiratsuyu-dd-blender-shots/shiratsuyu-dd-drawing-overlay.jpg`
  — side and plan silhouette outlines over the July 1944 drawing.

Together they are 163,843 bytes, below the 0.5 MB attachment cap. They were emailed as ordinary
MIME attachments, not inline images.

## Documentation and follow-up

`docs/models.md` no longer says Shiratsuyu remains on the downloaded author's textures and now
lists it with the original Blender rebuilds. No aircraft-process edit was made: the model revealed
no missing aircraft step, and ship-specific measurement/provenance lives here.

Known limitations are intentional and labeled rather than hidden: low-resolution source drawing,
normalized gameplay length instead of 109.6 m overall, estimated underwater sections and small
fittings, generic kit gunhouses/25 mm mounts, static torpedo/depth-charge gear, and two missed baked
porthole marks. No push or merge was performed.
