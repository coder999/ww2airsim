# DP3 Buildings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the nine remaining flat-shaded Blender buildings (aaa, ammunition-bunker, barracks-and-huts, coastal-gun-battery, fuel-tank-farm, pier-and-warehouses, radio-radar-station, revetment, tower) to the DP0 hangar look: richer type-specific geometry and a baked 512 px skin. Then delete the flat-shaded allowlist, which ends the model detail pass.

**Architecture:** Each script is rewritten on `tools/models/blender/hangar.py`'s structure (tagged parts, `shared_chart` fittings, world-aligned `grid` markings, an ESTIMATE/CITED header) using `kit.Model(name, skin=512)`, so the skin stage bakes an atlas in TypeScript. Overall dimensions, node names and placement anchors do not change. Two palette roles the buildings already use, `earth` and `timber`, have no surface row, and `surfaceFor` throws on an unknown role, so Task 2 adds them. The join stage merges each skinned model into one draw plus its kept nodes.

**Tech Stack:** Blender 5.0.1 headless (Python, `kit.py`), TypeScript skin stage (`tools/models/skin/`), `sharp`, vitest, Playwright (Hangar Tier 2 on the reference GPU).

**Spec:** `docs/superpowers/specs/2026-09-28-model-detail-pass-design.md` (row DP3 of its plan table). Style references: `docs/superpowers/plans/2026-09-28-dp1-aircraft.md`, `docs/superpowers/plans/2026-09-28-dp2-ships.md`, and `docs/handoff/2026-09-28-dp0-skin-pipeline.md` for the hangar pilot's numbers.

## Decisions (Mark, 2026-09-29)

- **Scope:** DP3 only, all nine buildings. The in-game procedural airfield boxes are now the visual inconsistency (roster spec §6.3's follow-on; design spec open question 4). That is a decision for Mark, not a task here.
- **Checkpoint:** final product only. **Unattended:** run to completion without stopping; collect captures in the handoff.
- **Where:** the existing worktree `~/projects/ww2airsim-worktrees/dp3-buildings` (branch `worktree-dp3-buildings`, from main 2aa28ff). Branch pushes are allowed. **Never merge into `main`, push `main`, or deploy.**
- **Dev servers:** all three slots (5173, 5174, 5175) were held by other sessions on 2026-09-29. This plan runs its own vite on a free port and reaches the reference GPU by a reverse tunnel (`localhost` is a secure context on ryzen), and uses nexus's 680M for non-measurement iteration. `vite.config.ts` is never edited in the tree.

## Measured baseline (2026-09-29, from the committed flat glbs; `measureDocument`)

| Building | Bytes | Tris | Draws | Turret nodes kept |
| --- | --- | --- | --- | --- |
| aaa | 18,300 | 324 | 4 | Turret1 |
| ammunition-bunker | 6,132 | 60 | 3 | none |
| barracks-and-huts | 45,932 | 792 | 3 | none |
| coastal-gun-battery | 28,760 | 588 | 4 | Turret1, Turret2 |
| fuel-tank-farm | 45,856 | 852 | 4 | none |
| pier-and-warehouses | 30,476 | 496 | 4 | none |
| radio-radar-station | 59,348 | 1,044 | 3 | none |
| revetment | 4,628 | 48 | 2 | none |
| tower | 28,848 | 468 | 4 | none |
| hangar (the DP0 pilot) | 284,916 | 4,316 | 1 | none |

Findings that shape the plan:

- **Budget:** every entry's budget is 500,000 B, 5,000 tris, 4 draws, and the hangar pilot shows a skinned 4,316-tri building is 285 KB with three 512 px WebP maps. A finished building targets 1,500 to 3,500 tris (30-70% of budget); above 60% is a reported note, not a failure. Bytes stay under 500,000 with no raise; a raise needs a dated ruling in the ledger.
- **Draws:** a skinned model joins to one draw plus each kept node, so aaa (Turret1) and coastal-gun-battery (Turret1, Turret2) end at 2 and 3 draws, inside the 4-draw budget.
- **Missing surface rows:** `earth` (mounds, bunds, revetment walls, sandbag rings) and `timber` (tower, barracks, pier) have no `ROLE_SURFACE` row; `sidecar.test.ts:48` currently pins `surfaceFor('timber')` throwing, which Task 2 replaces deliberately.
- **Pins that change:** `buildingModels.test.ts:77` (`textures` toBe 0) becomes 3; `skins.test.ts` `FLAT_SHADED` (9 ids) and `CEILING` are deleted, keeping the skinned-entry tests and the "no entry says skin true while listed flat" logic in its inverse form (every non-generated entry is skinned).
- **Hangar checks:** 8 (wireframe) and 10 (budget as drawn, buildings already listed at hangar.spec.ts line 300) cover every entry with no edit. Check 15 iterates the keys of `flat-luminance.json`, so it needs nine new baselines, measured from the flat glbs BEFORE any rebuild (Task 1). Check 16 has an explicit id list that needs the nine ids (Task 7).
- **Not in play:** `src/sim`, scenarios, `content/bases/*.json`. Footprints the sim owns (tower, aaa) are pinned by `buildingModels.test.ts`.

## Global Constraints

- Every building keeps its overall footprint and height constants (`FOOTPRINT_X_M`, `FOOTPRINT_Z_M`, `HEIGHT_M`, `BASE_Y_M`), which `buildingModels.test.ts` measures against the committed glb (1%, 1%, 2%, exact base). Node names and placement anchors do not change; turrets stay `Turret1` (aaa) and `Turret1`, `Turret2` (coastal-gun-battery), numbered +x to -x then -z to +z, and each entry's `keep` list is unchanged.
- Nothing under `src/sim` changes; no scenario changes.
- Each entry gets `"skin": true`; `textures.maxSize` is already 512, format webp. One `TEXCOORD_0`, no `TEXCOORD_1`. Skinned non-ship entries carry `metallicFactor 1` (`skins.test.ts`).
- Additions embed at least 0.02 m into what they stand on (`EMBED_M = 0.02`); no coplanar faces.
- No use of `cylinder`, `tapered_box`, `turret` (inward-wound, R2); `buildingModels.test.ts` bans them.
- Every new figure and color is labeled ESTIMATE, or CITED with the source and the date read, in the script header (or `colors.ts` / `surfaces.ts` for skin values). No figure is called CITED that was not fetched and read.
- Rebuilds are byte-identical: each script task builds twice and compares `sha256sum`.
- US spelling. Imperial units in user-facing prose (handoff, docs tables); Blender code stays SI.
- Never assert a picture that was not viewed: every building is viewed in the Hangar (three-quarter, side, top, close-up) on the reference GPU and iterated until it reads as its type.
- Nexus runs only touched test files (`--maxWorkers=1`); the full suite goes through `remote-run`. Blender on nexus is a serializing shim; no parallel builds. Capture `rc=$?` directly; never gate on a grepped pipeline.
- Scratch specs live outside the tree and are never committed. Never run `git clean -fdx`.

## Review Focus

1. **Silhouette drift:** richer geometry can push a bounding box past the constants (a muzzle past the pit, a mast dipole past the pad). Expected: `buildingModels.test.ts` passes untouched. Owned by every script task (each ends by running it).
2. **Luminance of earth and timber:** a dark tint on the concrete or planks scan can fall under check 15's 0.6x floor against the flat build. Expected: earth reads as brown-tan soil, timber as weathered brown wood, both inside 0.6x-1.5x. Owned by Task 2 (rows) and re-measured by each building task.
3. **World-space timber on vertical faces:** `scanSpace: 'world-xz'` samples straight down, so a wall shows vertical streaks and its texture may smear on slopes. Expected: reads as board-and-batten, no visible seam or smear. Owned by Task 5 and Task 6 (barracks, pier, tower), judged by viewing.
4. **Byte determinism:** any set ordering or float formatting difference breaks the Blender rebuild suite. Owned by every script task.
5. **Coplanar and buried geometry:** partly buried parts (pit floors, footings, piles) can z-fight once one material paints everything. Expected: no shimmer in the Hangar at close range. Owned by each script's embed asserts and the close-up view.
6. **Turret ordering and rig:** the turret node bounds decide their number. Expected: `buildingModels.test.ts` turret test passes and the Hangar's turret gizmos exist. Owned by Tasks 3 and 4.

---

## File Structure

- `tools/models/skin/surfaces.ts`: add `earth` and `timber` rows (Task 2).
- `tools/models/skin/colors.ts`: add marking colors only if a building needs one (each ESTIMATE, dated).
- `tools/models/blender/{revetment,ammunition-bunker,aaa,coastal-gun-battery,fuel-tank-farm,tower,radio-radar-station,barracks-and-huts,pier-and-warehouses}.py`: rewritten (Tasks 3-6).
- `tools/models/entries/<id>.json` for the nine: add `"skin": true` (and update the `dimensions` text where a figure is now cited).
- `content/buildings/<id>.glb`: rebuilt (nine).
- `tests/tools/models/skin/sidecar.test.ts` (timber pin), `tests/tools/models/buildingModels.test.ts` (textures pin), `tests/tools/models/skins.test.ts` (allowlist), `tests/e2e/hangar.spec.ts` (check 16 list), `tests/e2e/fixtures/flat-luminance.json` (nine baselines).
- `docs/models.md` (Skins section), `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` §15 row, `README.md` paragraph, `docs/handoff/2026-09-29-dp3-buildings.md` and `docs/handoff/2026-09-29-dp3-shots/`.

---

### Task 1: Ledger and flat luminance baselines

**Files:**
- Create: `.superpowers/sdd/2026-09-29-dp3-buildings/progress.md` (gitignored)
- Modify: `tests/e2e/fixtures/flat-luminance.json`

**Interfaces:**
- Produces: nine `flat-luminance.json` keys (`aaa`, `ammunition-bunker`, `barracks-and-huts`, `coastal-gun-battery`, `fuel-tank-farm`, `pier-and-warehouses`, `radio-radar-station`, `revetment`, `tower`) measured from the flat glbs on main, with each glb's sha256 in the note.

- [ ] **Step 1: Write the ledger** with the decisions above, each flat glb's sha256 (`sha256sum content/buildings/<id>.glb`), bytes, tris and draws from the table.
- [ ] **Step 2: Get a reference-GPU route.** Start vite from the worktree on a free port, forward it to ryzen, and check the Playwright server:

```bash
ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &
(npx vite --port 5199 --host 127.0.0.1 &) ; ssh -N -R 5199:127.0.0.1:5199 ryzen &
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5199/hangar.html
```

Expected: `200`. The browser on ryzen reaches `http://localhost:5199` through the reverse tunnel, a secure context. If the reverse forward is refused, fall back to nexus's 680M (no `PW_REMOTE`) and record the fallback in the ledger and the fixture note.
- [ ] **Step 3: Measure.** A scratch spec outside the tree (`$SCRATCH/flatlum.spec.ts`) copies `hangar.spec.ts`'s `view` and `masks` helpers and prints `view(page, id, 'three-quarter')` mean luminance for each of the nine ids. Run it with `PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=http://localhost:5199 npx playwright test <scratch spec>`.
- [ ] **Step 4: Add the nine values** to `flat-luminance.json` and extend its `note` with the date, the machine and the nine glb hashes.
- [ ] **Step 5: Commit**

```bash
npx vitest run tests/render/hangar/catalog.test.ts; echo rc=$?
git add tests/e2e/fixtures/flat-luminance.json && git commit -m "DP3: flat luminance baselines for the nine flat-shaded buildings"
```

---

### Task 2: Earth and timber surfaces

**Files:**
- Modify: `tools/models/skin/surfaces.ts`, `tests/tools/models/skin/sidecar.test.ts:47-48`

**Interfaces:**
- Produces: `ROLE_SURFACE.earth` and `ROLE_SURFACE.timber`, used by every later task.

- [ ] **Step 1: Failing test.** In `sidecar.test.ts` replace the `surfaceFor('timber')` throws pin with a role that is still unknown (`'no-such-role'`), and add `'earth'` and `'timber'` to the list of roles that must have rows.
- [ ] **Step 2: Add the rows** (all ESTIMATE, 2026-09-29, tuned by eye in the Hangar on the first buildings):

```ts
  // Buildings (DP3). ESTIMATE, set by eye in the Hangar. Earth is packed soil over the concrete scan (worn, gritty);
  // timber is the pinned weathered planks, sampled in world (x, z) so boards run one way across a whole wall or deck.
  earth: { scan: 'concrete', roughness: 0.95, metallic: 0, fade: 0.02, chip: 0, rivets: false, scanNormal: 0.9 },
  timber: { scan: 'deck-planks', roughness: 0.85, metallic: 0, fade: 0.06, chip: 0, rivets: false, scanNormal: 0, scanSpace: 'world-xz' },
```

- [ ] **Step 3: Run and commit**

```bash
npx vitest run tests/tools/models/skin --maxWorkers=1; echo rc=$?
git add tools/models/skin/surfaces.ts tests/tools/models/skin/sidecar.test.ts && git commit -m "DP3: surface rows for the earth and timber roles"
```

---

### Task 3: Earthworks, revetment, ammunition bunker, AA gun pit

Each building follows the same loop: rewrite the script, set `"skin": true`, build, build again, compare hashes, run the building tests, view in the Hangar, iterate, commit.

**Files:**
- Modify: `tools/models/blender/{revetment,ammunition-bunker,aaa}.py`, `tools/models/entries/{revetment,ammunition-bunker,aaa}.json`, `content/buildings/{revetment,ammunition-bunker,aaa}.glb`

**Design (every figure an ESTIMATE unless its header cites a source read and dated):**
- **revetment:** keep the U of walls and the bay. Add sandbag-course chamfers on the wall tops (the top of each wall as a row of overlapping bag-shaped boxes, embedded 0.02 m), a ramp/lip at the open end, tie-down anchor rings on the concrete floor, a berm slump toe at each wall foot, and `grid` markings that read as bag courses on the walls.
- **ammunition-bunker:** keep mound, headwall, wing walls, doors. Add double steel door leaves with hinges and a lintel, a concrete apron and drainage gutter, two roof vent pipes with caps, a lightning-rod mast, a stepped blast traverse wall in front of the door, and earth-mound slump lines (`grid` on the mound).
- **aaa:** keep ring, pit floor, pedestal, cradle, twin barrels in `Turret1`. Add a sandbag-course grid on the ring, an ammunition-box stack with handles, a gun shield plate, the gunner's seat and handwheels (the ring's outline does not change), spent-brass patches as `wear` markings on the pit floor, and drum magazines on the cradle. Turret1 stays all of the mount.

- [ ] **Step 1:** For each building, rewrite the script per the design (header updated, `kit.Model(name, skin=512)`, tags for every group, `shared_chart` for small fittings, grid markings for courses and laps). Keep the constants and asserts.
- [ ] **Step 2:** Set `"skin": true` in each entry; build each with the repo's build CLI (`npx tsx tools/models/build.ts <id>`; resolve the exact CLI from `tools/models/blender/cli.ts` and record it in the ledger).
- [ ] **Step 3:** Rebuild each twice; `sha256sum content/buildings/<id>.glb` must match. Run the dimension and blender-entry tests for these ids:

```bash
npx vitest run tests/tools/models/buildingModels.test.ts tests/tools/models/blenderEntries.test.ts --maxWorkers=1; echo rc=$?
```

The textures pin fails until Task 7 changes it; that one assertion is expected until then and recorded in the ledger, everything else passes.
- [ ] **Step 4:** View each in the Hangar (three-quarter, side, top, close-up) on the reference GPU, read every PNG, and iterate on geometry and skin until each reads as its type. Record what was seen in the ledger.
- [ ] **Step 5: Commit** one commit per building: `DP3: <id> skinned and detailed`.

---

### Task 4: Coastal gun battery and fuel tank farm

Same loop as Task 3.

**Design:**
- **coastal-gun-battery:** keep two pits, shielded guns (Turret1 at -z, Turret2 at +z), the 5.3848 m CITED barrel and the magazine mound. Add a shield with an embrasure and rivet plates (`grid`), traversing rails on each pit floor, a ready-ammunition niche in each pit wall, a concrete access stair, a connecting trench, a magazine headwall with door, an observation post on the mound, and a range-finder pedestal (nothing that pushes the bounds).
- **fuel-tank-farm:** keep four tanks, ring foundations, bund, pipes. Add shell rings and weld seams (`grid`), a spiral stair or ladder per tank, roof hatches and vents, rim manway, a pipe manifold with valves and a pump house, pipe supports, and a bund entry ramp with a drain sump. 55-gallon drum stacks at the manifold are optional.

- [ ] **Step 1-5:** as Task 3. The barrel assert in `coastal-gun-battery.py` stays; commit `DP3: coastal-gun-battery skinned and detailed`, `DP3: fuel-tank-farm skinned and detailed`.

---

### Task 5: Tower and radio-radar station

Same loop as Task 3.

**Design:**
- **tower:** keep pad, legs, cross braces, platform, cab, window posts, roof, mast, stair. Add stair stringers, handrails and landings, a platform railing, glazing panes in the cab (`glazing`), a door, roof rafter ends, an antenna, a wind cone pole and a light gun, and timber board joints via the timber row.
- **radio-radar-station:** keep pad, hut, lattice mast, array. Add array dipole rows and a reflector frame on the yoke, a hut door with steps, hut windows, roof vents, a generator shed or set, a cable duct from hut to mast, a perimeter fence posts (inside the pad), and guy-wire anchors. The array top stays at `HEIGHT_M`.

- [ ] **Step 1-5:** as Task 3. Commits: `DP3: tower skinned and detailed`, `DP3: radio-radar-station skinned and detailed`.

---

### Task 6: Barracks and pier

Same loop as Task 3.

**Design:**
- **barracks-and-huts:** keep the raised timber barracks and two huts. Add corrugated roof ribs and ridge caps (`grid`), boarded walls, window shutters and sills, entrance steps and a veranda landing, a stove chimney, rain-tank stands, and hut doors. Footprint asserts stay.
- **pier-and-warehouses:** keep quay, pier, piles, two warehouses. Add deck plank seams (timber row), stringers and cross bracing under the pier, bollards, a fender rail, a quay edge coping, a wall crane or gantry stub inside the bounds, warehouse doors with tracks and roof vents, and loading platforms. y=0 remains the water surface.

- [ ] **Step 1-5:** as Task 3. Commits: `DP3: barracks-and-huts skinned and detailed`, `DP3: pier-and-warehouses skinned and detailed`.

---

### Task 7: Tests and allowlist

**Files:**
- Modify: `tests/tools/models/buildingModels.test.ts:77`, `tests/tools/models/skins.test.ts`, `tests/e2e/hangar.spec.ts`

- [ ] **Step 1: Textures pin.** In `buildingModels.test.ts` replace `expect(m.textures).toBe(0)` with `expect(m.textures).toBe(3)` and its reason (base color, metallic-roughness, normal; skinned by DP3).
- [ ] **Step 2: Delete the allowlist.** In `skins.test.ts` delete `FLAT_SHADED`, `CEILING`, and the `describe('the flat-shaded allowlist (DP0)')` block; `skinned` becomes every non-generated entry; replace the last `it` with one asserting every non-generated entry is skinned (`e.skin` or `e.boxSkin` truthy). Update the header comment (allowlist deleted 2026-09-29).
- [ ] **Step 3: Hangar spec.** Add the nine ids to the check 16 list; assert check 10's building list already contains them.
- [ ] **Step 4:**

```bash
npx vitest run tests/tools/models/skins.test.ts tests/tools/models/buildingModels.test.ts --maxWorkers=1; echo rc=$?
git add tests && git commit -m "DP3: the flat-shaded allowlist is deleted; every entry is skinned"
```

---

### Task 8: Tier 1 and Tier 2

- [ ] **Step 1: Blender and entry suites on nexus**

```bash
npx vitest run tests/tools/models/blender tests/tools/models/blenderEntries.test.ts tests/tools/models/buildingModels.test.ts tests/tools/models/skins.test.ts tests/tools/models/skin --maxWorkers=1; echo rc=$?
```

- [ ] **Step 2: Full verify on ryzen**

```bash
remote-run sh -c 'npm run typecheck && npm run depcruise && npm run lint && npm test' > $SCRATCH/dp3-verify.log 2>&1; rc=$?; echo rc=$rc; tail -30 $SCRATCH/dp3-verify.log
```

`tests/sim/soak.test.ts` fails on clean main (pre-existing, unrelated: report it). `boundary.test.ts` and `skyLoad.test.ts` load timeouts: rerun alone on nexus, report, do not track.
- [ ] **Step 3: Hangar Tier 2** on the reference GPU: `hangar.spec.ts` in full (checks 8, 10, 15, 16), recording each building's check 15 ratio. A budget failure is re-run under `hwlock ryzen` before it is believed.
- [ ] **Step 4:** Fix any failure at its root, commit as `DP3: <what>`, rerun.

---

### Task 9: Captures, docs, handoff, push

**Files:**
- Create: `docs/handoff/2026-09-29-dp3-buildings.md`, `docs/handoff/2026-09-29-dp3-shots/*.png`
- Modify: `docs/models.md`, `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` §15 row, `README.md`

- [ ] **Step 1: Captures.** For each of the nine: `<id>-three-quarter.png`, `-side.png`, `-top.png`, `-close.png`; plus the hangar as reference. Read every PNG before describing it.
- [ ] **Step 2: Handoff.** What shipped; a per-building table (bytes, triangles, draws, check 15 ratio, all read from the committed glbs on the date); CITED versus ESTIMATE per building; capture links in the `https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/<file>` form; verified versus not run; open items; and a note that roster spec §6.3's follow-on (the in-game procedural airfield boxes are now the inconsistency; design spec open question 4) is a decision for Mark, not something done here.
- [ ] **Step 3: Docs.** `docs/models.md` Skins section: allowlist deleted 2026-09-29, retitle to include DP3. §15 "Model detail pass" row: DP3 complete, on branch `worktree-dp3-buildings` (not merged); the pass is finished. A README paragraph that points at §15.
- [ ] **Step 4: Commit and push the branch**

```bash
git add docs README.md && git status --short
git commit -m "DP3: handoff, docs and captures"
git push -u origin worktree-dp3-buildings
```

- [ ] **Step 5: Housekeeping.** Stop the vite and tunnels this session started. Do not merge, push `main`, or deploy.

---

## Self-Review

- **Spec coverage:** nine buildings skinned and enriched (Tasks 3-6); new surface rows (Task 2); flat baselines before any rebuild (Task 1); allowlist deletion and pins (Task 7); verification and Tier 2 (Task 8); captures, handoff, docs, §15 row, README (Task 9).
- **Placeholders:** the per-building lists name the parts to add, not their coordinates, because each is tuned by viewing in the Hangar; the build CLI is resolved from `tools/models/blender/cli.ts` in Task 3 and recorded in the ledger.
- **Consistency:** node names, constants and budgets match the committed scripts and entries; the baseline table was measured from the committed glbs on 2026-09-29.
