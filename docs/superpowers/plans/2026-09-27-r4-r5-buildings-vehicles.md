# R4 + R5: Building and vehicle models — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a model behind every building (R4) and both vehicles (R5) in the Library, so that nothing is left "not yet in service" and the roster allowlist is deleted.

**History:** written 2026-09-26 as the R4 plan (`2026-09-26-r4-building-models.md`); amended 2026-09-27 after R3 merged, and extended with R5 as one combined plan (Mark, 2026-09-27). Tasks 0-11 are R4, Tasks 12-14 are R5, and Tasks 15-16 run Tier 2 and the completion ritual once for both.

**R4 goal:** Put an original Blender model behind every building in the Library. That is the nine buildings the barrel-roof hangar (R1) left: `tower`, `aaa`, `ammunition-bunker`, `barracks-and-huts`, `coastal-gun-battery`, `fuel-tank-farm`, `pier-and-warehouses`, `radio-radar-station` and `revetment`. The not-yet-drawn allowlist then holds no building.

**Architecture:** One task adds the building parts the spec's §4.2 assigns to R4 to `tools/models/blender/kit.py`: gable roof, tank, sandbag ring, gun barrel and lattice mast, plus the frustum and strut they are built from. Each is wound outward and pinned by its own Blender probe test. After that, each building is one small script of cited or labeled figures. It becomes a `blender` manifest entry, is built by `npm run models:build`, is registered in `STATIC_MODELS`, and is named by its Library entry's `model`. Tier 1 measures every committed glb against its own script's literal figures, without Blender. The game is untouched: the airfields keep their procedural boxes (spec §6.3). R5 fits the two staged Sketchfab downloads, the Type 97 Chi-Ha and the Willys MB jeep, through the same pipeline R2 and R3 used, registers them in `STATIC_MODELS.vehicle`, and then deletes `NOT_YET_DRAWN` and `CEILING`: done becomes "every Library entry is drawn".

**Tech Stack:** Python in Blender 5.0.1 headless (R0's `tools/models/blender/run.ts`), TypeScript, glTF-Transform 4, Vitest in Node, and Playwright Tier 2 on the Windows desktop's RX 6700 XT.

**Spec:** `docs/superpowers/specs/2026-09-26-model-roster-design.md`, especially §3, §4.2, §4.4, §5, §6.3 and §7. Also read before starting:
- the R1 handoff, `docs/handoff/2026-09-26-r1-roster-pipeline.md`
- the R2 handoff, `docs/handoff/2026-09-26-r2-ship-models.md` (its "Deck fix" departure is the z-fighting lesson Task 3 turns into a test)
- the R3 handoff, `docs/handoff/2026-09-27-r3-aircraft-models.md` (its "Found along the way" holds the kit winding finding this plan works around)
- `docs/models.md` §7, §8 and "Authoring in Blender"

## Mark's decisions for this plan (2026-09-26, recorded as given)

- **Precondition:** R3 (aircraft) is merged into `main`. R4 runs after R2 and R3, as spec §5 orders. Rebase on `main` before starting.
- **Where it runs:** its own worktree, `.claude/worktrees/r4-r5-roster`, on branch `worktree-r4-r5-roster`. **One executor at a time**, because R0-R5 all append to the same registries. The branch may be pushed. **Merging into `main` needs Mark's OK.** Never push `main`, merge into it, or deploy.
- **Attendance:** unattended. Run to completion without waiting for Mark.
- **Viewing checkpoint:** the final product only. The handoff carries reference-GPU Hangar captures of every new building, taken with the turntable frozen, and is emailed to Mark as HTML.
- **Sources:** every figure in a script is either CITED (source and read date) or labeled ESTIMATE. No citation is invented. A figure with no source found stays an ESTIMATE and is listed as open in the handoff.
- **US spelling.**
- **R5 joins this plan (2026-09-27).** Mark asked for R4 and R5 as one combined plan, run as one unattended job in one worktree. His R4 answers above carry over: unattended, one final-product checkpoint.
- **The jeep is the top-down one (2026-09-27).** The staged `willys-mb-jeep.glb` holds two jeeps side by side. Mark chose the open jeep (top down, windshield folded) over the canvas-top one; R5 removes the other.

## Where R4 starts (read on `main` at `a0005ff` and on `worktree-r2-ships` at `c4d7bad`, 2026-09-26)

Every claim below was read from code on 2026-09-26. Task 0 re-checks the ones R3 could have moved.

- **The Library has ten `kind: "building"` entries**, and they are not all in the same state:
  - `hangar` has `spec: "hangar"` and `model: { kind: "building", id: "hangar" }`. It already draws R1's Blender model: `content/buildings/hangar.glb`, 356 triangles and 3 draw calls.
  - `tower` and `aaa` have a `spec` and no `model`. The Hangar draws them today through `drawBuilding`'s procedural boxes (`src/render/hangar/models.ts`, the last branch of `loadHangarModel`), so they are **not** on the allowlist.
  - `ammunition-bunker`, `barracks-and-huts`, `coastal-gun-battery`, `fuel-tank-farm`, `pier-and-warehouses`, `radio-radar-station` and `revetment` have neither. They are 7 of `NOT_YET_DRAWN`'s entries in `tests/render/hangar/roster.test.ts`.
  - **So R4 authors 9 models, and the allowlist shrinks by exactly 7.** Spec §2's "Buildings: 10 missing" predates R1's hangar.
- **The allowlist after R2** (branch `worktree-r2-ships`) is 18 entries with `CEILING = 18`: 9 aircraft, the 7 buildings and 2 vehicles. If R3 draws all nine aircraft, R4 starts at 9 and `CEILING = 9`, and ends at `['type97-chi-ha', 'willys-mb-jeep']` with `CEILING = 2`. R5 deletes both.
- **The kit after R2** (`6dd4920` plus `796a89a`):
  - R0 built `box`, `barrel_vault` and `arch_gable`, and its test proves them wound outward.
  - R2 added `ship_hull`, `deck`, `tapered_box`, `cylinder` and `turret`.
  - PALETTE has the roles `steel`, `concrete`, `dark` and `timber` (the base colors of `src/render/scene/buildings.ts`), plus R2's seven ship roles.
  - **R2's `cylinder` and `tapered_box` wind every face inward, and so does `turret`, which is built from `tapered_box`.** Worked by hand from the vertex and face tables. For example, `cylinder` side face `(i, j, n+j, n+i)` at angle 0 has normal `(-r·h·sinθ, 0, r·h·(cosθ-1))`, which points toward the axis. R2's kit test checks normals only for R0's three parts and `ship_hull`. Blender's default material exports `doubleSided`, so the ships still render. **R4 does not call these three** (a Tier 1 guard in Task 4). It uses its own outward `tank` and `frustum`, and does not fix R2's parts, because fixing them would rebuild R2's committed ship glbs. It is recorded as open.
- **One draw call per node.** `Model.export` makes one Blender object per role, or per explicitly named node. The build keeps them: the hangar has 3 nodes and 3 draws, Kagero 7 and 7. The §4.4 building budget of **4 draw calls therefore means at most 4 nodes**, turrets included. Every design below fits.
- **The turret convention** (Hangar spec §9, `docs/models.md` §5) says `Turret1`…`TurretN`, "numbered bow to stern", on ships. A building has no bow. **R4 rules: a building's turrets are numbered +x to -x, then -z to +z.** R2's precedent is followed: the gun geometry lives in the `TurretN` node itself, with no `GunN` children and no pivot. The pivots are H3's.
- **Frame.** The kit's rule is +x forward and standing on y = 0. The hangar is the one exception: it opens toward +z, like `buildings.ts`. R4's buildings put their front on +x: the stair, the guns, the doors, a revetment's open end, the pier and the radar array.
- **Footprints the sim already owns.** They are in `content/bases/tacloban.json`: `tacloban-tower` is 9 × 9 m and `tacloban-aaa-1` is 6 × 6 m. That file's own reference note calls both round gameplay figures, not historical ones. `AIRFIELD_HUTS` in `src/render/scene/airfield.ts` is 12 × 28 m, and its comment calls it "a period-inspired scene, not a claim to reconstruct the exact 1944 building survey". **Nothing in the repo gives a dimension for the other six buildings.** Their Library entries cite only Wikipedia articles on the building *type*, and none of those articles was read for a dimension.
- **Tests R4 breaks by design, found by reading:**
  - `tests/render/hangar/models.test.ts:58` loads `byId('tower')` expecting `drawBuilding`. Once the tower names a model, that path reaches `GLTFLoader` in Node. Task 4 rebuilds the case from the tower entry with its `model` removed. It stays the only test of the `drawBuilding` branch.
  - `tests/render/staticModels.test.ts` pins the error text `(registered: hangar)`, which lists every registered id. Task 4 loosens it.
- **Tests that need no change:**
  - `tests/build/dist.test.ts` copies every `blender` entry's output generically.
  - `tests/tools/models/outputs.test.ts` checks every entry's budget, provenance and `ASSETS.md` row generically.
  - `blenderEntries.test.ts`'s rebuild block iterates every `blender` entry.
  - Tier 2 check 12 still holds through R4: `notDrawn > 0` stays true, because the 2 vehicles remain. R5's Task 14 turns it to `=== 0`.

## What R3 changed (re-read on `main` at `19088be`, 2026-09-27)

R3 merged into `main` on 2026-09-27 (`82f9e3e`) after this plan was first written. Everything above still holds, with these corrections:

- **`kit.py` already defines `_cross(a, b)` and `_unit(v)`** (R3's aircraft parts, `tools/models/blender/kit.py:106-113`). This plan's first draft added its own `_unit(v, what)`, which would have replaced R3's and broken every R3 Blender aircraft's rebuild with a `TypeError`. Task 2 now **reuses R3's two helpers** and calls `_unit(v)` with one argument.
- **R3's kit parts are wound outward** (`fuselage`, `wing`, `fin`, `revolve`, `propeller`, `gear_leg`, `gun_turret`), proven per closed shell by `kitAircraft.test.ts`. R4 needs none of them. The ban stays on R2's three inward parts only: `cylinder`, `tapered_box`, `turret`.
- **The allowlist is 9 with `CEILING = 9`**, as predicted: the seven buildings and the two vehicles.
- **The Hangar card has a Model row and the list has an Origin filter** (`47b7e94`). Hangar Tier 2 check 14 selects `tower` and expects `Drawn in code (no model file)`; Task 4 gives the tower a model, so Task 4 updates that line. After R4 no Library entry is drawn in code; `tests/render/hangar/provenance.test.ts` still covers the `'code'` case in Node.
- **Blender now runs on ryzen too** (Blender 5.0.1 plus `python3-numpy` in WSL, `serverconfig/ryzen.md`, 2026-09-27). `remote-run npm run verify` therefore **runs** the Blender suites and the byte-identical rebuilds; they are no longer named skips there. The nexus run by name stays, as a second check.
- **Model credits name each author once** (`718d0d4`), and `tests/render/modelCredits.test.ts` pins the line. R4 adds no CC BY model, so R4 leaves it alone; R5's two downloads change it (Tasks 12 and 13 give the exact strings).
- **Hangar check 5 measures lighting, not paint** (lit over unlit, aircraft only), and check 8 has a 180 s timeout. Neither affects buildings or vehicles.

## Global Constraints

- **Worktree.** Everything happens in `.claude/worktrees/r4-r5-roster` on branch `worktree-r4-r5-roster` (Task 0). `git push -u origin worktree-r4-r5-roster` is allowed. **Never** push, merge into or commit on `main`.
- **`<run date>`** in this plan means the ISO date (YYYY-MM-DD) on which the executor does that step. It appears in script headers, entry `dimensions` strings, the handoff's file name and commit-free prose.
- **Per-task checks.** Each task that commits ends with:
  - `npx vitest run <the task's test files> --maxWorkers=2; echo "rc=$?"`
  - `npx tsc --noEmit; echo "rc=$?"`
  - `npx eslint <touched .ts files> --max-warnings 0; echo "rc=$?"`
  - Capture each `rc` directly. Never gate on a test command piped into `grep`.
- **Full runs.** Run `npm run verify` only through `remote-run` (Task 16). Never run a full suite, `npm run verify` or Playwright on nexus: parallel suites have OOM-killed it.
- **Blender runs on nexus only, and one at a time.** Never start a Blender command while another runs, whether that is `cli.ts`, `models:build`, `preview.py` or a Blender test. Blender tests run by name with `--maxWorkers=1`. `run.ts` pins **Blender 5.0.1** and refuses any other version by name.
- **Byte identity.** No committed glb other than R4's nine new buildings and R5's two new vehicles changes by a byte. `git diff main...HEAD --stat -- content/aircraft content/ships content/ordnance content/buildings/hangar.glb` stays empty, and `content/vehicles` gains exactly `type97-chi-ha.glb` and `willys-mb-jeep.glb`. Adding kit methods and one palette role must not move the hangar's, R2's or R3's Blender outputs. The rebuild runs in Task 16 prove it.
- **No game change.** `src/sim/**`, `content/aircraft`, `content/ships`, `content/scenarios`, `content/bases`, `src/render/scene/airfield.ts` and `src/render/scene/buildings.ts` are untouched (spec §6.3).
- **Every building model is original work, AGPL-3.0-or-later**, with:
  - a script header in `hangar.py`'s shape: every figure CITED with its source and read date, or labeled ESTIMATE; the frame; what it leaves out
  - literal top-level `FOOTPRINT_X_M`, `FOOTPRINT_Z_M`, `HEIGHT_M` and `BASE_Y_M`, which Tier 1 reads
  - its entry's `source.dimensions` summarizing the header
  - an `ASSETS.md` 3D-models row in the same commit as its glb
- **The building entry and `ASSETS.md` row, once.** Every building's `tools/models/entries/<id>.json` is exactly this, with only `<id>` and `<dimensions>` substituted. `<dimensions>` is the string each task gives, or the Task 1 citation that replaces it:
  ```json
  {
    "id": "<id>",
    "output": "content/buildings/<id>.glb",
    "source": {
      "kind": "blender",
      "script": "tools/models/blender/<id>.py",
      "dimensions": "<dimensions>",
      "license": "AGPL-3.0-or-later"
    },
    "textures": { "maxSize": 512, "format": "webp" },
    "budget": { "maxBytes": 500000, "maxTriangles": 5000, "maxDrawCalls": 4 }
  }
  ```
  Its `ASSETS.md` row goes after the last `content/buildings/` row:
  ```
  | `content/buildings/<id>.glb` | authored in Blender by `tools/models/blender/<id>.py`; <provenance> | authored for this project | AGPL-3.0-or-later |
  ```
  `<provenance>` is "every figure CITED or labeled ESTIMATE in the script's header", unless the task gives other wording.
- **The vehicles are Sketchfab downloads (R5), not original work.** Before a vehicle's glb is committed, re-read its license from `api.sketchfab.com/v3/models/<uid>`, and in the same commit move its `ASSETS.md` row from "Candidate models" into the 3D-models table and update the credit pin (`docs/models.md` §3; Tasks 12-13 give the exact rows and strings). Budget: 1 MB, 20,000 triangles (spec §4.4) and 8 draw calls (ruling V1).
- **Budget: 0.5 MB, 5,000 triangles and 4 draw calls per building** (spec §4.4). Raising one needs a measured reason recorded in `RAISED` in `tests/tools/models/buildingModels.test.ts` and as a ledger `Ruling:`.
- **The allowlist only shrinks.** Each building or vehicle task that draws an allowlisted entry deletes that id from `NOT_YET_DRAWN` and lowers `CEILING` by exactly one. Nothing is ever added. Task 14 (R5) deletes the list.
- **Tier 2 slot.** Use a free slot, `ww2airsim-3.windomlane.org` (port 5174) or `ww2airsim-2.windomlane.org` (port 5175). Check it first. Never stop another worktree's server. The `vite.config.ts` edit is local scratch and never staged.
- **Commits** end with the `Co-Authored-By:` line of the model that wrote them (R1's ruling R-T5b).
- **Never run `git clean -fdx`** (CLAUDE.md). **Never re-run `tools/mail-doc.py` with `--debug`.**
- **US spelling** in prose and identifiers. Escape `|` as `\|` inside markdown table cells.

## Review Focus

1. **An entry with both a spec and a model, now the tower and the AAA as well as the hangar.** The Hangar must draw the Blender model. The card must keep the spec's figures (HP, placements, points). The game must still draw `drawBuilding`'s boxes at Tacloban. Pinned in Task 11: every Library building resolves through the display loader, while the tower and AAA keep their subject. Task 16's untouched-game diff covers the game side.
2. **A building spec with no model of its own.** No shipped entry is in this state after R4, but `loadHangarModel`'s `drawBuilding` branch is still the path for one, and it must still draw boxes, not throw. Pinned in Task 4, which rebuilds the case from the tower entry with its `model` deleted.
3. **Two differently painted faces in one plane**, for example a door flush with its wall. R2 shipped a deck like that, and it z-fought until its frozen captures were read. Pinned in Task 3: `coplanarOverlaps` runs over every committed R4 building, with a unit test and a mutation check in Task 8.
4. **A sourced figure that moves a building's extent.** Task 1 may replace an ESTIMATE with a cited number, and the footprint literal can then disagree with the geometry. The footprint test reads the script's own literals and fails by name. Each script also asserts its layout still fits, for example tanks inside the bund. Pinned in Tasks 4-10.
5. **A tall-thin or long-thin building at the Hangar's framing.** The radar mast is 22 m on a 16 × 12 m pad, and the pier is 100 × 40 m. Check 1's 2-80% mask share at the three-quarter preset could fail. Tier 2 check 1 covers it in Task 12. The ruling if it fails: change the model's composition, never the bounds, and record the share.

**R5 (added 2026-09-27):**

6. **The wrong jeep, or a piece of the other one.** The download holds two jeeps whose parts share three nodes. A split box a little too small leaves a fragment of the canvas-top jeep floating beside the kept one; one too large eats part of it. Pinned in Task 13: Step 4 counts the removed shells (exactly 128, 9,667 triangles) before building, Step 7 expects exactly 9,432 triangles, and Task 15's capture check names "no fragment of the other".
7. **A vehicle floating above or sunk into the Hangar's platform.** The Hangar stands a display model on its own origin, so an origin a few centimeters off shows as a hovering or buried tank. Pinned in Task 12's harness: `stands on y = 0, centered on its footprint`, for both vehicles.
8. **A vehicle facing backward.** Neither download's nose is at +x in its source, and the mapping is the entry's `forward`. Pinned in Task 12's `faces +x` (the Chi-Ha's muzzle, the jeep's rear-mounted spare), with a mutation check in each of Tasks 12 and 13.

---

### Task 0: Preconditions, worktree, ledger and baseline (setup, no commit)

**Files:**
- Create: `.superpowers/sdd/2026-09-27-r4-r5-roster/progress.md` (gitignored)

- [ ] **Step 1: R3 is merged.** From `/home/mark/projects/ww2airsim`:
  ```bash
  git log --oneline -1 main
  grep -n "Model roster" docs/superpowers/specs/2026-09-12-ww2airsim-design.md | grep -o "R3 complete[^.]*"
  node -e "const s=require('fs').readFileSync('tests/render/hangar/roster.test.ts','utf8');const m=/const NOT_YET_DRAWN = \[([\s\S]*?)\]/.exec(s);console.log((m[1].match(/'[^']+'/g)||[]).join(' '));console.log('CEILING',/const CEILING = (\d+)/.exec(s)[1])"
  ```
  Expected:
  - §15's row says R3 is complete and merged.
  - The list is exactly `'ammunition-bunker' 'barracks-and-huts' 'coastal-gun-battery' 'fuel-tank-farm' 'pier-and-warehouses' 'radio-radar-station' 'revetment' 'type97-chi-ha' 'willys-mb-jeep'`, in any order, with `CEILING 9`.

  If §15 does not say R3 is merged, **stop**. R4 must not start before R3 (spec §5), so write the reason in the ledger and end the run. If R3 left extra ids on the list, continue: R4 still removes only its 7. Record a `Ruling:` and, in every later step, read "lower `CEILING` by one" from the actual start value.

- [ ] **Step 2: Create the worktree and link the gitignored data.**
  ```bash
  git worktree add -b worktree-r4-r5-roster .claude/worktrees/r4-r5-roster main
  cd .claude/worktrees/r4-r5-roster && npm ci
  ln -s /home/mark/projects/ww2airsim/content/terrain/tiles content/terrain/tiles
  mkdir -p tools/terrain && ln -s /home/mark/projects/ww2airsim/tools/terrain/cache tools/terrain/cache
  mkdir -p tools/textures && ln -s /home/mark/projects/ww2airsim/tools/textures/cache tools/textures/cache
  head -c 60 content/terrain/L0.bin | grep -q "git-lfs" && echo "L0.bin is an LFS pointer: run git lfs pull" || echo "L0.bin ok"
  blender --version | head -1
  ```
  Expected: `L0.bin ok` and `Blender 5.0.1`. Every later path is relative to the worktree.

- [ ] **Step 3: Survey the tests that name R4's buildings.** R3 may have used one of the seven as a "not drawn" example in a test, where R1 used `b-17-flying-fortress`:
  ```bash
  grep -rn "ammunition-bunker\|barracks-and-huts\|coastal-gun-battery\|fuel-tank-farm\|pier-and-warehouses\|radio-radar-station\|revetment\|byId('tower')\|byId('aaa')" tests src --include=*.ts
  ```
  Record every hit in the ledger. A hit that uses one of the seven as "not drawn" or "not yet in service" gets switched to `willys-mb-jeep` in the task that draws that building. `willys-mb-jeep` is a vehicle with no model until R5.

- [ ] **Step 4: The ledger.** Create `.superpowers/sdd/2026-09-27-r4-r5-roster/progress.md`. Its header names this plan, the branch, the base commit (`git rev-parse --short HEAD`) and "unattended, final-product checkpoint, frozen Hangar captures". Append one line per completed task, every measured number, and a `Ruling:` line for every departure from this plan.

- [ ] **Step 5: Baseline.**
  ```bash
  npx vitest run tests/tools/models/outputs.test.ts tests/tools/models/manifest.test.ts tests/render/staticModels.test.ts tests/render/hangar --maxWorkers=2; echo "rc=$?"
  npx vitest run tests/tools/models/blender/kit.test.ts tests/tools/models/blenderEntries.test.ts --maxWorkers=1; echo "rc=$?"
  ```
  Expected: both `rc=0`, and the second run must not skip, because Blender is present on nexus. Record the counts.

---

### Task 1: Sources for every building (research, ledger only, no commit)

**Files:**
- Modify: `.superpowers/sdd/2026-09-27-r4-r5-roster/progress.md` (a "Sources" table)

The plan's figures below are labeled ESTIMATEs unless the repo already owns them. This task looks for citable figures **once**, up front, so every building task starts from a settled table. It invents nothing. A figure is CITED only if the executor actually read it in the source, and the citation records the title, the section, page or table, the URL if there is one, and the read date.

- [ ] **Step 1: Search, at most 20 minutes per building.** For each building, look for its principal dimensions in period primary material first. These are the kinds of source to try. **The plan's author has not read any of them, and none is cited here.**
  - U.S. War Department, *Handbook on Japanese Military Forces* (TM-E 30-480, 1944): field fortifications, AA and coast artillery.
  - U.S. Naval Technical Mission to Japan reports on ordnance and radar. R2 cited this series for ship classes.
  - JICPOA and USSBS target and airfield studies of Japanese installations.
  - Bureau of Yards and Docks, *Building the Navy's Bases in World War II* (1947): piers, tank farms and huts, although U.S.-built.
  - A secondary source may be cited for a principal dimension if the ledger says it is secondary, as R2 did for class particulars.
  - What each building needs:
    - `tower`, `aaa`: nothing new. Their footprints are the sim's. Optionally a period gun's barrel length for the AAA's twin light mount, which is a generic 25 mm class weapon.
    - `coastal-gun-battery`: a Japanese coast-defense gun's barrel length and pit size. The plan uses a 12 cm/45 class: 45 × 0.12 m = 5.4 m bore.
    - `fuel-tank-farm`: tank diameter and shell height, and bund size.
    - `ammunition-bunker`: an earth-covered magazine's plan and height.
    - `barracks-and-huts`: a hut's plan, and a barracks' wall and roof heights.
    - `revetment`: a single-fighter revetment's bay and wall section.
    - `pier-and-warehouses`: pier length and width, deck height, and warehouse plan.
    - `radio-radar-station`: a Japanese early-warning set's mast or array size.

- [ ] **Step 2: Write the Sources table** in the ledger. It has one row per figure named in the building's script header below:

  | building | figure | plan value | status | source (title, section/page, URL) | read |
  | --- | --- | --- | --- | --- | --- |

  `status` is `CITED`, `CITED (secondary)` or `ESTIMATE`. For every CITED figure that differs from the plan value, add a `Ruling:` line naming the new value and the constants it moves. The building task applies it, and its footprint test (Task 4) will fail by name until `FOOTPRINT_*`, `HEIGHT_M` and the geometry agree. **A building with no CITED figure is an open item for the handoff, not a blocker.**

---

### Task 2: The kit's building parts

**Files:**
- Modify: `tools/models/blender/kit.py` (one palette role; seven `Model` methods; reuses R3's `_cross` and `_unit`)
- Create: `tests/tools/models/blender/fixtures/kit_building_probe.py`
- Create: `tests/tools/models/blender/fixtures/kit_bad_building.py`
- Create: `tests/tools/models/buildingGeometry.ts` (`worldTriangles`, `unitNormal`, `Vec3`, `Tri`; Task 3 adds more)
- Test: `tests/tools/models/blender/kitBuildings.test.ts`

The probe and its test are separate files from `kit_probe.py` and `kit.test.ts`, whose node lists R2 and R3 own. That way R4 never edits their expected lists.

**Interfaces:**
- Produces (in `kit.py`, all coordinates in the glTF frame, meters; every part wound outward):
  - `PALETTE['earth']`
  - `Model.frustum(role, base, lower, upper, height, node=None)`: `base` is `(x, y, z)`, and `lower` and `upper` are `(x_size, z_size)` with `upper <= lower`.
  - `Model.gable_roof(role, base, width, length, rise, overhang=0.0, node=None)`: eaves at `base` y, width across x, ridge along z.
  - `Model.tank(role, base, radius, height, roof_rise=0.0, segments=24, node=None)`: a closed vertical cylinder with a cone roof, or a flat top when `roof_rise == 0`.
  - `Model.sandbag_ring(role, center, inner_radius, thickness, height, batter=0.0, segments=16, node=None)`
  - `Model.strut(role, p0, p1, radius, end_radius=None, sides=4, node=None)`
  - `Model.gun_barrel(role, breech, azimuth_deg, elevation_deg, length, radius, muzzle_radius=None, sides=8, node=None)`: azimuth 0 is +x, and positive turns toward -z, counterclockwise seen from above. Elevation must be in [-5, 85].
  - `Model.lattice_mast(role, base, base_width, top_width, height, panels, member, node=None)`
- Produces (in `tests/tools/models/buildingGeometry.ts`): `type Vec3 = [number, number, number]`, `type Tri = [Vec3, Vec3, Vec3]`, `worldTriangles(node: Node): Tri[]` and `unitNormal(t: Tri): Vec3 | null`.

- [ ] **Step 1: The geometry helper.** Create `tests/tools/models/buildingGeometry.ts`:
  ```ts
  // tests/tools/models/buildingGeometry.ts
  /** Geometry helpers for measuring committed and probe glbs in Node, no Blender (R4). */
  import type { Node } from '@gltf-transform/core'

  export type Vec3 = [number, number, number]
  export type Tri = [Vec3, Vec3, Vec3]

  export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  export const centroid = (t: Tri): Vec3 => [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3]

  /** A mesh node's triangles in world space, in their stored winding. */
  export function worldTriangles(node: Node): Tri[] {
    const m = node.getWorldMatrix()
    const out: Tri[] = []
    for (const prim of node.getMesh()?.listPrimitives() ?? []) {
      const pos = prim.getAttribute('POSITION')!
      const idx = prim.getIndices()!
      const v = (i: number): Vec3 => {
        const [x, y, z] = pos.getElement(idx.getScalar(i), [0, 0, 0]) as Vec3
        return [0, 1, 2].map((r) => m[r]! * x + m[4 + r]! * y + m[8 + r]! * z + m[12 + r]!) as Vec3
      }
      for (let i = 0; i < idx.getCount(); i += 3) out.push([v(i), v(i + 1), v(i + 2)])
    }
    return out
  }

  /** The unit normal by winding (counterclockwise seen from the side it faces), or null for a sliver. */
  export function unitNormal(t: Tri): Vec3 | null {
    const n = cross(sub(t[1], t[0]), sub(t[2], t[0]))
    const l = Math.hypot(n[0], n[1], n[2])
    return l < 1e-9 ? null : [n[0] / l, n[1] / l, n[2] / l]
  }
  ```

- [ ] **Step 2: The probe fixtures.** Create `tests/tools/models/blender/fixtures/kit_building_probe.py`:
  ```python
  # tests/tools/models/blender/fixtures/kit_building_probe.py -- exercises every R4 building part once,
  # each in its own node, spaced 10 m apart along x so a test can take them one at a time.
  import os, sys
  sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', '..', 'tools', 'models', 'blender'))
  import kit

  out, opts = kit.cli_args()
  m = kit.Model('bprobe')
  m.frustum('earth', (0.0, 0.0, 0.0), (6.0, 4.0), (2.0, 1.0), 2.0, node='bprobe_frustum')
  m.gable_roof('steel', (10.0, 3.0, 0.0), 4.0, 6.0, 1.5, 0.5, node='bprobe_roof')
  m.tank('steel', (20.0, 0.0, 0.0), 2.0, 3.0, 0.5, 16, node='bprobe_tank')
  m.tank('concrete', (30.0, 0.0, 0.0), 2.0, 0.5, 0.0, 16, node='bprobe_disc')
  m.sandbag_ring('earth', (40.0, 0.0, 0.0), 2.0, 0.8, 1.2, 0.3, 16, node='bprobe_ring')
  m.strut('dark', (50.0, 0.0, -2.0), (52.0, 3.0, 2.0), 0.2, 0.1, 6, node='bprobe_strut')
  m.gun_barrel('steel', (60.0, 1.0, 0.0), 30.0, 20.0, 4.0, 0.1, sides=8, node='bprobe_barrel')
  m.lattice_mast('steel', (70.0, 0.0, 0.0), 3.0, 1.0, 12.0, 4, 0.1, node='bprobe_mast')
  m.export(out)
  ```
  Create `tests/tools/models/blender/fixtures/kit_bad_building.py`:
  ```python
  # Exercises the R4 building parts' argument guards. The selected case fails before export,
  # so the fixture never writes a model.
  import os, sys
  sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', '..', 'tools', 'models', 'blender'))
  import kit

  out, opts = kit.cli_args()
  case = opts.get('case', '')
  kit._read.add('case')
  m = kit.Model('bad-building')
  cases = {
      'frustum-upper': lambda: m.frustum('earth', (0.0, 0.0, 0.0), (2.0, 2.0), (3.0, 1.0), 1.0),
      'roof-rise': lambda: m.gable_roof('steel', (0.0, 0.0, 0.0), 4.0, 6.0, 0.0),
      'tank-segments': lambda: m.tank('steel', (0.0, 0.0, 0.0), 1.0, 1.0, 0.0, 2),
      'ring-batter': lambda: m.sandbag_ring('earth', (0.0, 0.0, 0.0), 2.0, 0.5, 1.0, 0.5),
      'strut-zero': lambda: m.strut('dark', (1.0, 1.0, 1.0), (1.0, 1.0, 1.0), 0.1),
      'barrel-elevation': lambda: m.gun_barrel('steel', (0.0, 0.0, 0.0), 0.0, 90.0, 2.0, 0.05),
      'mast-top': lambda: m.lattice_mast('steel', (0.0, 0.0, 0.0), 1.0, 2.0, 5.0, 2, 0.05),
  }
  if case not in cases:
      raise ValueError(f'--case must be one of {sorted(cases)}, got {case!r}')
  cases[case]()
  m.export(out)
  ```

- [ ] **Step 3: Write the failing test.** Create `tests/tools/models/blender/kitBuildings.test.ts`:
  ```ts
  // tests/tools/models/blender/kitBuildings.test.ts
  import { beforeAll, describe, expect, it } from 'vitest'
  import { createHash } from 'node:crypto'
  import { mkdtempSync, readFileSync } from 'node:fs'
  import { tmpdir } from 'node:os'
  import { join } from 'node:path'
  import { getBounds } from '@gltf-transform/functions'
  import type { Document } from '@gltf-transform/core'
  import { HAVE_BLENDER, runBlenderScript } from '../../../../tools/models/blender/run.js'
  import { findNode, modelIO, onlyScene } from '../../../../tools/models/document.js'
  import { measureDocument } from '../../../../tools/models/measure.js'
  import { centroid, cross, dot, sub, unitNormal, worldTriangles, type Vec3 } from '../buildingGeometry.js'

  const PROBE = 'tests/tools/models/blender/fixtures/kit_building_probe.py'
  const BAD = 'tests/tools/models/blender/fixtures/kit_bad_building.py'
  const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')
  const rad = (deg: number): number => (deg * Math.PI) / 180

  /** Every face of a convex part points away from a point inside it. */
  function expectOutward(doc: Document, node: string, inside: Vec3): void {
    for (const t of worldTriangles(findNode(doc, node))) {
      const n = unitNormal(t)
      if (n === null) continue
      expect(dot(n, sub(centroid(t), inside)), `${node} face at ${centroid(t).map((v) => v.toFixed(2)).join(', ')}`).toBeGreaterThan(0)
    }
  }

  /** Every vertex's distance along the axis from `a` (unit `d`), and its distance from the axis. */
  function alongAxis(doc: Document, node: string, a: Vec3, d: Vec3): { along: number[]; off: number[] } {
    const vs = worldTriangles(findNode(doc, node)).flat()
    const along = vs.map((v) => dot(sub(v, a), d))
    const off = vs.map((v) => { const c = cross(sub(v, a), d); return Math.hypot(c[0], c[1], c[2]) })
    return { along, off }
  }

  // Builds run in beforeAll, never in the describe body: vitest runs a skipped suite's body to
  // collect it, so a build there would error on ryzen instead of skipping by name.
  describe.skipIf(!HAVE_BLENDER)("the kit's building parts (model-roster spec §4.2, R4)", () => {
    const dir = mkdtempSync(join(tmpdir(), 'r4-kit-'))
    const a = join(dir, 'a.glb'), b = join(dir, 'b.glb')
    let doc: Document
    beforeAll(async () => {
      runBlenderScript(PROBE, a)
      runBlenderScript(PROBE, b)
      doc = await modelIO().readBinary(new Uint8Array(readFileSync(a)))
    }, 120_000)

    it('rebuilds byte-identically', () => {
      expect(sha(b)).toBe(sha(a))
    })

    it('one node per part, sorted, one draw each, flat materials by role including earth', () => {
      expect(onlyScene(doc).listChildren()[0]!.listChildren().map((n) => n.getName())).toEqual([
        'bprobe_barrel', 'bprobe_disc', 'bprobe_frustum', 'bprobe_mast', 'bprobe_ring', 'bprobe_roof', 'bprobe_strut', 'bprobe_tank',
      ])
      expect(measureDocument(doc).drawCalls).toBe(8)
      expect(doc.getRoot().listMaterials().map((m) => m.getName()).sort()).toEqual(['concrete', 'dark', 'earth', 'steel'])
      for (const m of doc.getRoot().listMaterials()) expect(m.getMetallicFactor()).toBe(0)
    })

    it.each([
      ['bprobe_frustum', [-3, 0, -2], [3, 2, 2]],
      ['bprobe_roof', [7.5, 3, -3.5], [12.5, 4.5, 3.5]],
      ['bprobe_tank', [18, 0, -2], [22, 3.5, 2]],
      ['bprobe_disc', [28, 0, -2], [32, 0.5, 2]],
      ['bprobe_ring', [37.2, 0, -2.8], [42.8, 1.2, 2.8]],
    ] as const)('%s spans exactly what it was asked for', (node, min, max) => {
      const bb = getBounds(findNode(doc, node))
      min.forEach((v, i) => expect(bb.min[i], `${node} min[${i}]`).toBeCloseTo(v, 4))
      max.forEach((v, i) => expect(bb.max[i], `${node} max[${i}]`).toBeCloseTo(v, 4))
    })

    it('convex parts are wound outward', () => {
      expectOutward(doc, 'bprobe_frustum', [0, 1, 0])
      expectOutward(doc, 'bprobe_roof', [10, 3.5, 0])
      expectOutward(doc, 'bprobe_tank', [20, 1.5, 0])
      expectOutward(doc, 'bprobe_disc', [30, 0.25, 0])
      expectOutward(doc, 'bprobe_strut', [51, 1.5, 0])
      const d: Vec3 = [Math.cos(rad(20)) * Math.cos(rad(30)), Math.sin(rad(20)), -Math.cos(rad(20)) * Math.sin(rad(30))]
      expectOutward(doc, 'bprobe_barrel', [60 + 2 * d[0], 1 + 2 * d[1], 2 * d[2]])
    })

    it('the ring: outer face away from the axis, inner face toward it, top up, foot down', () => {
      for (const t of worldTriangles(findNode(doc, 'bprobe_ring'))) {
        const n = unitNormal(t)
        if (n === null) continue
        const c = centroid(t)
        const r = Math.hypot(c[0] - 40, c[2])
        if (Math.abs(n[1]) > 0.99) expect(Math.sign(n[1]), `ring cap at y=${c[1].toFixed(2)}`).toBe(c[1] > 0.6 ? 1 : -1)
        else {
          const radial = (n[0] * (c[0] - 40) + n[2] * c[2]) / r
          expect(radial * (r < 2.05 ? -1 : 1), `ring wall at r=${r.toFixed(2)}`).toBeGreaterThan(0)
        }
      }
    })

    it('a strut runs from p0 to p1 with its two radii; a barrel from its breech along azimuth and elevation', () => {
      const strutD: Vec3 = [2 / Math.sqrt(29), 3 / Math.sqrt(29), 4 / Math.sqrt(29)]
      const s = alongAxis(doc, 'bprobe_strut', [50, 0, -2], strutD)
      expect(Math.min(...s.along)).toBeCloseTo(0, 4)
      expect(Math.max(...s.along)).toBeCloseTo(Math.sqrt(29), 4)
      expect(Math.max(...s.off)).toBeCloseTo(0.2, 4)
      // Azimuth 30 turns from +x toward -z; elevation 20 lifts it.
      const d: Vec3 = [Math.cos(rad(20)) * Math.cos(rad(30)), Math.sin(rad(20)), -Math.cos(rad(20)) * Math.sin(rad(30))]
      const g = alongAxis(doc, 'bprobe_barrel', [60, 1, 0], d)
      expect(Math.min(...g.along)).toBeCloseTo(0, 4)
      expect(Math.max(...g.along)).toBeCloseTo(4, 4)
      expect(Math.max(...g.off)).toBeCloseTo(0.1, 4)
    })

    it('the mast: 4 legs, 5 rings of 4, an X on each face of 4 panels, 12 triangles per member, 12 m tall', () => {
      expect(worldTriangles(findNode(doc, 'bprobe_mast'))).toHaveLength(12 * (4 + 4 * 5 + 8 * 4))
      const bb = getBounds(findNode(doc, 'bprobe_mast'))
      expect(bb.max[1]).toBeGreaterThan(12)
      expect(bb.max[1]).toBeLessThan(12.1) // a member's half-diagonal above the top ring
      expect(bb.min[1]).toBeGreaterThan(-0.1)
      expect(bb.max[0] - bb.min[0]).toBeGreaterThan(3)
      expect(bb.max[0] - bb.min[0]).toBeLessThan(3.3)
    })

    it.each([
      ['frustum-upper', /frustum: upper .* must not exceed lower/],
      ['roof-rise', /gable_roof: width, length and rise must be > 0/],
      ['tank-segments', /tank: segments must be an integer >= 3/],
      ['ring-batter', /sandbag_ring: batter 0.5 must be >= 0 and < thickness 0.5/],
      ['strut-zero', /strut: p0 and p1 must differ/],
      ['barrel-elevation', /gun_barrel: elevation must be in \[-5, 85\] degrees, got 90/],
      ['mast-top', /lattice_mast: top_width must be > 0 and <= base_width/],
    ])('refuses %s by name', (c, message) => {
      expect(() => runBlenderScript(BAD, join(dir, `bad-${c}.glb`), ['--case', c])).toThrow(message)
    })
  })
  ```

- [ ] **Step 4: Run it and see it fail.**
  ```bash
  npx vitest run tests/tools/models/blender/kitBuildings.test.ts --maxWorkers=1; echo "rc=$?"
  ```
  Expected: FAIL in `beforeAll`, with Blender's traceback naming `AttributeError: 'Model' object has no attribute 'frustum'`.

- [ ] **Step 5: Implement.** In `tools/models/blender/kit.py`:
  - Add to `PALETTE`, after `'timber'`:
    ```python
        # Buildings (R4). Packed earth and sandbags; no counterpart in buildings.ts, so a
        # modeling choice, not the game's own color.
        'earth': (0x7A / 255, 0x6A / 255, 0x4C / 255),
    ```
  - **Do not add `_cross` or `_unit`.** R3 already defines both at module level (`kit.py:106-113`): `_unit(v)` takes one argument and refuses a zero or non-finite vector by name, and `_cross(a, b)` is the right-handed cross product. A second definition would silently replace R3's and break its aircraft (amended 2026-09-27). Confirm before editing:
    ```bash
    grep -n -E '^def (_cross|_unit)\(' tools/models/blender/kit.py
    ```
    Expected: exactly `def _unit(v):` and `def _cross(a, b):`.
  - Add these methods to `Model`, immediately before `export`:
    ```python
        # --- Building parts (R4). Every one is wound outward: kitBuildings.test.ts checks it. ---

        def frustum(self, role, base, lower, upper, height, node=None):
            """A closed truncated rectangular pyramid standing on base (x, y, z): `lower` (x size,
            z size) at y, `upper` at y + height, both centered. A mound, a berm or a blast wall;
            upper == lower is a box."""
            _require(height > 0 and min(*lower, *upper) > 0, f'frustum: height and every width must be > 0, got {height}, {lower}, {upper}')
            _require(upper[0] <= lower[0] and upper[1] <= lower[1], f'frustum: upper {upper} must not exceed lower {lower}')
            x, y, z = base
            lx, lz, ux, uz = lower[0] / 2, lower[1] / 2, upper[0] / 2, upper[1] / 2
            v = [(x - lx, y, z - lz), (x + lx, y, z - lz), (x + lx, y, z + lz), (x - lx, y, z + lz),
                 (x - ux, y + height, z - uz), (x + ux, y + height, z - uz),
                 (x + ux, y + height, z + uz), (x - ux, y + height, z + uz)]
            f = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
            self._part(role, v, f, node)

        def gable_roof(self, role, base, width, length, rise, overhang=0.0, node=None):
            """A closed triangular prism: eaves at base y, the ridge `rise` above it along z, over a
            width (x) by length (z) plan grown by `overhang` on every side."""
            _require(width > 0 and length > 0 and rise > 0 and overhang >= 0,
                     f'gable_roof: width, length and rise must be > 0 and overhang >= 0, got {width}, {length}, {rise}, {overhang}')
            x, y, z = base
            hw, hl = width / 2 + overhang, length / 2 + overhang
            v = [(x - hw, y, z - hl), (x + hw, y, z - hl), (x, y + rise, z - hl),
                 (x - hw, y, z + hl), (x + hw, y, z + hl), (x, y + rise, z + hl)]
            f = [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)]
            self._part(role, v, f, node)

        def tank(self, role, base, radius, height, roof_rise=0.0, segments=24, node=None):
            """A vertical cylinder standing on base (x, y, z), closed below, with a cone roof rising
            `roof_rise` to its apex, or a flat top at 0. A fuel tank, a pedestal, a floor disc.
            A multiple of 4 segments puts vertices on both axes, so the extents are exact."""
            _require(radius > 0 and height > 0 and roof_rise >= 0, f'tank: radius and height must be > 0 and roof_rise >= 0, got {radius}, {height}, {roof_rise}')
            _require(isinstance(segments, int) and segments >= 3, f'tank: segments must be an integer >= 3, got {segments}')
            x, y, z = base
            n = segments
            ring = lambda yy: [(x + math.cos(2 * math.pi * i / n) * radius, yy, z + math.sin(2 * math.pi * i / n) * radius) for i in range(n)]
            v = ring(y) + ring(y + height)
            f = [tuple(range(n))]                                    # floor, faces -y
            for i in range(n):
                j = (i + 1) % n
                f.append((i, n + i, n + j, j))                       # wall, faces out
            if roof_rise == 0:
                f.append(tuple(reversed(range(n, 2 * n))))           # flat top, faces +y
            else:
                v.append((x, y + height + roof_rise, z))
                for i in range(n):
                    f.append((n + i, 2 * n, n + (i + 1) % n))        # cone, faces out and up
            self._part(role, v, f, node)

        def sandbag_ring(self, role, center, inner_radius, thickness, height, batter=0.0, segments=16, node=None):
            """A closed annular parapet on center (x, y, z): `thickness` across at its foot, its outer
            face leaning in by `batter` at the top. A gun pit's sandbags or a concrete emplacement."""
            _require(inner_radius > 0 and thickness > 0 and height > 0,
                     f'sandbag_ring: inner_radius, thickness and height must be > 0, got {inner_radius}, {thickness}, {height}')
            _require(0 <= batter < thickness, f'sandbag_ring: batter {batter:g} must be >= 0 and < thickness {thickness:g}')
            _require(isinstance(segments, int) and segments >= 3, f'sandbag_ring: segments must be an integer >= 3, got {segments}')
            x, y, z = center
            n = segments
            ring = lambda r, yy: [(x + math.cos(2 * math.pi * i / n) * r, yy, z + math.sin(2 * math.pi * i / n) * r) for i in range(n)]
            ro, rt = inner_radius + thickness, inner_radius + thickness - batter
            v = ring(inner_radius, y) + ring(ro, y) + ring(rt, y + height) + ring(inner_radius, y + height)
            A, B, C, D = 0, n, 2 * n, 3 * n   # inner foot, outer foot, outer top, inner top
            f = []
            for i in range(n):
                j = (i + 1) % n
                f.append((B + i, C + i, C + j, B + j))   # outer face, away from the axis
                f.append((D + i, D + j, C + j, C + i))   # top, faces +y
                f.append((A + i, A + j, D + j, D + i))   # inner face, toward the axis
                f.append((A + i, B + i, B + j, A + j))   # foot, faces -y
            self._part(role, v, f, node)

        def strut(self, role, p0, p1, radius, end_radius=None, sides=4, node=None):
            """A closed prism from p0 to p1 with `sides` faces, circumradius `radius` at p0 and
            `end_radius` (default: the same) at p1. A brace, a pipe, a mast member, a gun tube."""
            end_radius = radius if end_radius is None else end_radius
            _require(radius > 0 and end_radius > 0, f'strut: radii must be > 0, got {radius}, {end_radius}')
            _require(isinstance(sides, int) and sides >= 3, f'strut: sides must be an integer >= 3, got {sides}')
            _require(any(abs(b - a) > 1e-9 for a, b in zip(p0, p1)), f'strut: p0 and p1 must differ, got {p0}, {p1}')
            d = _unit(tuple(b - a for a, b in zip(p0, p1)))
            helper = (1.0, 0.0, 0.0) if abs(d[1]) > 0.9 else (0.0, 1.0, 0.0)
            u = _unit(_cross(helper, d))
            w = _cross(d, u)   # (u, w, d) right-handed: rings run counterclockwise about d
            v = []
            for p, r in ((p0, radius), (p1, end_radius)):
                for k in range(sides):
                    c, s = math.cos(2 * math.pi * k / sides) * r, math.sin(2 * math.pi * k / sides) * r
                    v.append(tuple(p[i] + c * u[i] + s * w[i] for i in range(3)))
            n = sides
            f = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]   # p0 cap faces -d, p1 cap +d
            for k in range(n):
                j = (k + 1) % n
                f.append((k, j, n + j, n + k))
            self._part(role, v, f, node)

        def gun_barrel(self, role, breech, azimuth_deg, elevation_deg, length, radius, muzzle_radius=None, sides=8, node=None):
            """A gun tube from its breech: azimuth 0 is +x, positive turns toward -z (counterclockwise
            seen from above); elevation lifts it. With sides a multiple of 4 and elevation <= 64 deg,
            its top is exactly muzzle y + muzzle radius x cos(elevation)."""
            _require(-5 <= elevation_deg <= 85, f'gun_barrel: elevation must be in [-5, 85] degrees, got {elevation_deg:g}')
            _require(length > 0, f'gun_barrel: length must be > 0, got {length}')
            az, el = math.radians(azimuth_deg), math.radians(elevation_deg)
            d = (math.cos(el) * math.cos(az), math.sin(el), -math.cos(el) * math.sin(az))
            muzzle = tuple(b + length * c for b, c in zip(breech, d))
            self.strut(role, breech, muzzle, radius, radius if muzzle_radius is None else muzzle_radius, sides, node)

        def lattice_mast(self, role, base, base_width, top_width, height, panels, member, node=None):
            """A square, tapered lattice tower on base (x, y, z): four corner legs, a horizontal ring at
            the foot, at every panel joint and at the top, and an X of braces on each face of each panel.
            Every member is a square strut `member` across its flats."""
            _require(0 < top_width <= base_width, f'lattice_mast: top_width must be > 0 and <= base_width, got {top_width}, {base_width}')
            _require(height > 0, f'lattice_mast: height must be > 0, got {height}')
            _require(isinstance(panels, int) and panels >= 1, f'lattice_mast: panels must be an integer >= 1, got {panels}')
            _require(0 < member < top_width / 2, f'lattice_mast: member must be > 0 and < top_width / 2, got {member}')
            x, y, z = base
            r = member / math.sqrt(2)   # a 4-sided strut's circumradius for `member` across the flats

            def corner(k, level):
                t = level / panels
                h = (base_width + (top_width - base_width) * t) / 2
                sx, sz = ((-1, -1), (1, -1), (1, 1), (-1, 1))[k]
                return (x + sx * h, y + height * t, z + sz * h)

            for k in range(4):
                self.strut(role, corner(k, 0), corner(k, panels), r, r, 4, node)
            for level in range(panels + 1):
                for k in range(4):
                    self.strut(role, corner(k, level), corner((k + 1) % 4, level), r, r, 4, node)
            for level in range(panels):
                for k in range(4):
                    j = (k + 1) % 4
                    self.strut(role, corner(k, level), corner(j, level + 1), r, r, 4, node)
                    self.strut(role, corner(j, level), corner(k, level + 1), r, r, 4, node)
    ```
  - Extend the module docstring's last paragraph with one sentence: "The building parts (R4) are wound outward and checked by `tests/tools/models/blender/kitBuildings.test.ts`; R2's `cylinder`, `tapered_box` and `turret` wind inward (open item, R4 handoff) and no building calls them."

- [ ] **Step 6: Run it and see it pass.**
  ```bash
  npx vitest run tests/tools/models/blender/kitBuildings.test.ts --maxWorkers=1; echo "rc=$?"
  ```
  Expected: `rc=0`, 18 passed, none skipped. If a winding assertion fails, fix the face table in `kit.py`, not the test. The test's expectations are geometric facts.

- [ ] **Step 7: Mutation check.** Temporarily swap `tank`'s wall face to `(i, j, n + j, n + i)`. Rerun: `convex parts are wound outward` must fail, naming `bprobe_tank`. Revert and rerun to green. Record both runs in the ledger.

- [ ] **Step 8: Nothing already committed moved.** The new role and methods must not change any existing Blender output:
  ```bash
  npx vitest run tests/tools/models/blender/kit.test.ts tests/tools/models/blenderEntries.test.ts --maxWorkers=1; echo "rc=$?"
  ```
  Expected: `rc=0`, and every rebuild (hangar, R2's ships, R3's Blender aircraft) is byte-identical.

- [ ] **Step 9: Checks and commit.**
  ```bash
  npx tsc --noEmit; echo "rc=$?"
  npx eslint tests/tools/models/buildingGeometry.ts tests/tools/models/blender/kitBuildings.test.ts --max-warnings 0; echo "rc=$?"
  git add tools/models/blender/kit.py tests/tools/models/buildingGeometry.ts tests/tools/models/blender/kitBuildings.test.ts tests/tools/models/blender/fixtures/kit_building_probe.py tests/tools/models/blender/fixtures/kit_bad_building.py
  git commit -m "R4: the kit's building parts (frustum, gable roof, tank, sandbag ring, strut, gun barrel, lattice mast), wound outward"
  ```

---

### Task 3: The z-fighting check and the script-figure reader

**Files:**
- Modify: `tests/tools/models/buildingGeometry.ts` (add `scriptConstant`, `coplanarOverlaps`, `Labeled`)
- Test: `tests/tools/models/buildingGeometry.test.ts`

**Interfaces:**
- Consumes: `Vec3`, `Tri`, `sub`, `cross`, `dot`, `centroid` and `unitNormal` (Task 2).
- Produces:
  - `scriptConstant(source: string, name: string): number`: a top-level literal `NAME = <number>`. Throws, naming `name`, otherwise.
  - `interface Labeled { label: string; where: string; tri: Tri }`
  - `coplanarOverlaps(tris: readonly Labeled[], eps?: number): string[]`

- [ ] **Step 1: Write the failing test.** Create `tests/tools/models/buildingGeometry.test.ts`:
  ```ts
  // tests/tools/models/buildingGeometry.test.ts
  import { describe, expect, it } from 'vitest'
  import { coplanarOverlaps, scriptConstant, type Tri } from './buildingGeometry.js'

  describe('scriptConstant (R4)', () => {
    const src = 'FOOTPRINT_X_M = 10.0\nBASE_Y_M = -0.3  # pad\n    HEIGHT_M = 4.0\nDEPTH_M = 2 * 5\n'
    it('reads a top-level literal, with or without a trailing comment', () => {
      expect(scriptConstant(src, 'FOOTPRINT_X_M')).toBe(10)
      expect(scriptConstant(src, 'BASE_Y_M')).toBe(-0.3)
    })
    it('refuses an indented line, an expression, and a missing name, naming it', () => {
      expect(() => scriptConstant(src, 'HEIGHT_M')).toThrow(/HEIGHT_M/)
      expect(() => scriptConstant(src, 'DEPTH_M')).toThrow(/DEPTH_M/)
      expect(() => scriptConstant(src, 'NOPE_M')).toThrow(/NOPE_M/)
    })
  })

  describe('coplanarOverlaps (R4, R2 deck lesson)', () => {
    const wall: Tri = [[0, 0, 0], [4, 0, 0], [0, 4, 0]]           // faces +z
    const door: Tri = [[0.5, 0.5, 0], [1.5, 0.5, 0], [0.5, 1.5, 0]] // faces +z, inside the wall
    const at = (t: Tri, dx: number, dz: number): Tri => t.map(([x, y, z]) => [x + dx, y, z + dz]) as Tri
    const flip = (t: Tri): Tri => [t[0], t[2], t[1]]
    const run = (a: Tri, b: Tri, la = 'concrete', lb = 'dark') => coplanarOverlaps([{ label: la, where: 'wall', tri: a }, { label: lb, where: 'door', tri: b }])

    it('flags a differently painted face lying on another, facing the same way', () => {
      expect(run(wall, door)).toEqual(['wall (concrete) / door (dark) at 0.83, 0.83, 0.00'])
    })
    it('passes the same paint, a face resting against another (opposite facing), a 1 cm offset and a disjoint face', () => {
      expect(run(wall, door, 'concrete', 'concrete')).toEqual([])
      expect(run(wall, flip(door))).toEqual([])
      expect(run(wall, at(door, 0, 0.01))).toEqual([])
      expect(run(wall, at(door, 10, 0))).toEqual([])
    })
  })
  ```

- [ ] **Step 2: Run it and see it fail.**
  ```bash
  npx vitest run tests/tools/models/buildingGeometry.test.ts --maxWorkers=2; echo "rc=$?"
  ```
  Expected: FAIL, with `scriptConstant` and `coplanarOverlaps` not exported.

- [ ] **Step 3: Implement.** Append to `tests/tools/models/buildingGeometry.ts`:
  ```ts
  /** A model script's top-level `NAME = <number>` literal: the figure its header cites or labels an ESTIMATE. */
  export function scriptConstant(source: string, name: string): number {
    const m = new RegExp(`^${name} = (-?\\d+(?:\\.\\d+)?)[ \\t]*(?:#.*)?$`, 'm').exec(source)
    if (m === null) throw new Error(`no top-level literal "${name} = <number>" in the script`)
    return Number(m[1])
  }

  export interface Labeled { readonly label: string; readonly where: string; readonly tri: Tri }

  /** p, already in t's plane, lies strictly inside t (not on an edge). */
  function inside(p: Vec3, t: Tri, n: Vec3): boolean {
    for (let i = 0; i < 3; i++) {
      const a = t[i]!, b = t[(i + 1) % 3]!
      if (dot(cross(sub(b, a), sub(p, a)), n) <= 1e-9) return false
    }
    return true
  }

  /**
   * Pairs of triangles with different labels (materials) that lie in one plane, face the same way
   * and overlap, judged by either centroid lying strictly inside the other: two paints z-fighting,
   * as R2's deck slabs did. Opposite-facing coincident faces are one solid resting on another and
   * pass; so does the same paint, which z-fights invisibly. A heuristic: it catches a small face
   * on a large one, which is the case that has happened.
   */
  export function coplanarOverlaps(tris: readonly Labeled[], eps = 1e-4): string[] {
    const faces = tris.flatMap((t) => {
      const n = unitNormal(t.tri)
      return n === null ? [] : [{ ...t, n, d: dot(n, t.tri[0]), c: centroid(t.tri) }]
    })
    const out = new Set<string>()
    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) {
        const a = faces[i]!, b = faces[j]!
        if (a.label === b.label || dot(a.n, b.n) < 1 - 1e-6 || Math.abs(a.d - b.d) > eps) continue
        if (!inside(b.c, a.tri, a.n) && !inside(a.c, b.tri, b.n)) continue
        const c = inside(b.c, a.tri, a.n) ? b.c : a.c
        out.add(`${a.where} (${a.label}) / ${b.where} (${b.label}) at ${c.map((v) => v.toFixed(2)).join(', ')}`)
      }
    }
    return [...out]
  }
  ```

- [ ] **Step 4: Run it and see it pass.**
  ```bash
  npx vitest run tests/tools/models/buildingGeometry.test.ts --maxWorkers=2; echo "rc=$?"
  ```
  Expected: `rc=0`, 4 passed.

- [ ] **Step 5: Checks and commit.**
  ```bash
  npx tsc --noEmit; echo "rc=$?"
  npx eslint tests/tools/models/buildingGeometry.ts tests/tools/models/buildingGeometry.test.ts --max-warnings 0; echo "rc=$?"
  git add tests/tools/models/buildingGeometry.ts tests/tools/models/buildingGeometry.test.ts
  git commit -m "R4: a coplanar-paint check and a script-figure reader for building tests"
  ```

---

### Task 4: The control tower, and the per-building Tier 1 harness

**Files:**
- Create: `tools/models/blender/tower.py`
- Create: `tools/models/entries/tower.json`
- Create: `content/buildings/tower.glb` (built)
- Create: `tests/tools/models/buildingModels.test.ts`
- Modify: `src/render/scene/staticModels.ts` (register `tower`)
- Modify: `content/library/tower.json` (`model`)
- Modify: `ASSETS.md` (one 3D-models row)
- Modify: `tests/render/staticModels.test.ts` (the registered-list regex)
- Modify: `tests/render/hangar/models.test.ts:57-65` (the `drawBuilding` case keeps its own entry)
- Modify: `tests/e2e/hangar.spec.ts` (check 14's tower line; amended 2026-09-27)
- Modify: `tests/render/hangar/catalog.test.ts` (one comment)

**Interfaces:**
- Consumes: `kit.Model.box`, `kit.Model.strut` (Task 2); `scriptConstant`, `coplanarOverlaps`, `worldTriangles` (Tasks 2-3).
- Produces: in `buildingModels.test.ts`, the tables that later tasks extend:
  - `R4_BUILDINGS: string[]`
  - `TURRETS: Record<string, string[]>`
  - `SIM_FOOTPRINTS: Record<string, { building: string; padM: number }>`
  - `RAISED: Record<string, string>`

- [ ] **Step 1: Write the failing harness.** Create `tests/tools/models/buildingModels.test.ts`:
  ```ts
  // tests/tools/models/buildingModels.test.ts
  /**
   * R4's buildings, measured from their committed glbs against their own scripts' literal figures
   * (model-roster spec §7), with no Blender: this runs on ryzen too. The byte-identical rebuild is
   * blenderEntries.test.ts's, run on nexus by name.
   */
  import { describe, expect, it } from 'vitest'
  import { readFileSync, statSync } from 'node:fs'
  import { getBounds } from '@gltf-transform/functions'
  import type { Document } from '@gltf-transform/core'
  import { loadModelEntries, type ModelEntry } from '../../../tools/models/manifest.js'
  import { findNode, meshNodes, modelIO, onlyScene } from '../../../tools/models/document.js'
  import { measureDocument } from '../../../tools/models/measure.js'
  import { coplanarOverlaps, scriptConstant, worldTriangles } from './buildingGeometry.js'

  /** Spec §4.4. An entry may budget above it only with a measured reason, here and in the ledger. */
  const BUILDING_BUDGET = { maxBytes: 500_000, maxTriangles: 5000, maxDrawCalls: 4 } as const
  const RAISED: Readonly<Record<string, string>> = {}

  /** Every building R4 authored. Each task appends its own. */
  const R4_BUILDINGS: readonly string[] = ['tower']

  /** H3's turret names (Hangar spec §9). A building's are numbered +x to -x, then -z to +z (R4 ruling). */
  const TURRETS: Readonly<Record<string, readonly string[]>> = {}

  /** Footprints the sim owns: the script's figure must be content/bases/tacloban.json's plus its pad. */
  const SIM_FOOTPRINTS: Readonly<Record<string, { readonly building: string; readonly padM: number }>> = {
    tower: { building: 'tacloban-tower', padM: 1 },
  }

  const entries = loadModelEntries()
  const entryOf = (id: string): ModelEntry => {
    const e = entries.find((x) => x.id === id)
    if (e === undefined) throw new Error(`no tools/models/entries/${id}.json`)
    return e
  }
  const scriptOf = (id: string): string => {
    const s = entryOf(id).source
    if (s.kind !== 'blender') throw new Error(`${id} is not a blender entry`)
    return readFileSync(s.script, 'utf8')
  }
  const read = async (id: string): Promise<Document> => modelIO().readBinary(new Uint8Array(readFileSync(entryOf(id).output)))
  const tacloban = JSON.parse(readFileSync('content/bases/tacloban.json', 'utf8')) as { buildings: { id: string; widthM: number; lengthM: number }[] }

  describe.each(R4_BUILDINGS.map((id) => [id]))('building %s (R4)', (id) => {
    it("its committed output measures its script's footprint (1%), base, and height (2%)", async () => {
      const src = scriptOf(id)
      const bb = getBounds(onlyScene(await read(id)))
      const within = (got: number, want: number, tol: number, label: string): void => {
        expect(Math.abs(got - want) / want, `${id} ${label}: measured ${got.toFixed(3)}, script ${want}`).toBeLessThanOrEqual(tol)
      }
      within(bb.max[0] - bb.min[0], scriptConstant(src, 'FOOTPRINT_X_M'), 0.01, 'footprint x')
      within(bb.max[2] - bb.min[2], scriptConstant(src, 'FOOTPRINT_Z_M'), 0.01, 'footprint z')
      within(bb.max[1], scriptConstant(src, 'HEIGHT_M'), 0.02, 'height')
      expect(bb.min[1], `${id} base`).toBeCloseTo(scriptConstant(src, 'BASE_Y_M'), 3)
    })

    it('is inside the building budget, measured (spec §4.4), and its entry does not budget above it', async () => {
      const doc = await read(id)
      const m = measureDocument(doc)
      const e = entryOf(id)
      if (RAISED[id] === undefined) {
        expect(e.budget.maxBytes, id).toBeLessThanOrEqual(BUILDING_BUDGET.maxBytes)
        expect(e.budget.maxTriangles, id).toBeLessThanOrEqual(BUILDING_BUDGET.maxTriangles)
        expect(e.budget.maxDrawCalls, id).toBeLessThanOrEqual(BUILDING_BUDGET.maxDrawCalls)
      }
      expect(statSync(e.output).size).toBeLessThanOrEqual(e.budget.maxBytes)
      expect(m.triangles).toBeLessThanOrEqual(e.budget.maxTriangles)
      expect(m.drawCalls).toBeLessThanOrEqual(e.budget.maxDrawCalls)
      expect(m.textures).toBe(0)
    })

    it("names exactly its turrets, H3's way, numbered +x to -x then -z to +z", async () => {
      const doc = await read(id)
      const want = TURRETS[id] ?? []
      expect(meshNodes(doc).map((n) => n.getName()).filter((n) => /^Turret\d+$/.test(n)).sort()).toEqual([...want].sort())
      const at = want.map((n) => { const bb = getBounds(findNode(doc, n)); return { n, x: (bb.min[0] + bb.max[0]) / 2, z: (bb.min[2] + bb.max[2]) / 2 } })
      const ordered = [...at].sort((a, b) => (Math.abs(a.x - b.x) > 1e-3 ? b.x - a.x : a.z - b.z)).map((t) => t.n)
      expect(ordered).toEqual(want)
    })

    it('no two differently painted faces z-fight', async () => {
      const doc = await read(id)
      const tris = meshNodes(doc).flatMap((n) => {
        const label = n.getMesh()!.listPrimitives()[0]!.getMaterial()?.getName() ?? n.getName()
        return worldTriangles(n).map((tri) => ({ label, where: n.getName(), tri }))
      })
      expect(coplanarOverlaps(tris)).toEqual([])
    })

    it("uses none of R2's inward-wound parts (cylinder, tapered_box, turret)", () => {
      expect(scriptOf(id)).not.toMatch(/\.(cylinder|tapered_box|turret)\(/)
    })
  })

  describe("footprints the sim owns (content/bases, the sim is authoritative)", () => {
    it.each(Object.entries(SIM_FOOTPRINTS))("%s: the script's footprint is the placement's plus its pad", (id, { building, padM }) => {
      const b = tacloban.buildings.find((x) => x.id === building)
      expect(b, building).toBeDefined()
      const src = scriptOf(id)
      expect(scriptConstant(src, 'FOOTPRINT_X_M')).toBe(b!.widthM + padM)
      expect(scriptConstant(src, 'FOOTPRINT_Z_M')).toBe(b!.lengthM + padM)
    })
  })
  ```

- [ ] **Step 2: Run it and see it fail.**
  ```bash
  npx vitest run tests/tools/models/buildingModels.test.ts --maxWorkers=2; echo "rc=$?"
  ```
  Expected: FAIL with `no tools/models/entries/tower.json`.

- [ ] **Step 3: Write the script.** Create `tools/models/blender/tower.py`. If Task 1 cited any figure, change its header label to `CITED <source>, read <run date>` and its constant. Otherwise write exactly:
  ```python
  # tools/models/blender/tower.py
  """Timber airfield control tower. Original work, AGPL-3.0-or-later.

  Figures (read <run date>):
    footprint 9 x 9 m   content/bases/tacloban.json, tacloban-tower (the sim is authoritative; that
                        file's reference note calls it a round gameplay figure, not a survey)
    pad footprint+1 m square, 0.3 m deep, top at y=0   ESTIMATE: the game's own, src/render/scene/buildings.ts
    legs 0.45 m square at +-3.5 m, 10 m tall             ESTIMATE: buildings.ts
    platform 8.5 m square, 1.1 m deep, at 8 m            ESTIMATE: buildings.ts
    cab 7.5 m square, 2.4 m tall, on the platform        ESTIMATE: buildings.ts
    window posts 0.22 m; roof 10 m square, 0.4 m deep, at 11.7 m; mast 0.12 m x 4 m   ESTIMATE: buildings.ts
    16 treads: 0.5 m rise, 0.55 m going                  ESTIMATE: buildings.ts, moved 0.6 m inboard to stay on the pad
    cross braces 0.16 m across, two per face, 0.5 m to 7.5 m   ESTIMATE: new here
  Frame: the stair is on +x, +y up, meters; the pad top is y=0.
  Leaves out: railings, glazing bars, ladders, the interior, the wind sock.
  """
  import os
  import sys

  sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
  import kit  # noqa: E402

  FOOTPRINT_X_M = 10.0
  FOOTPRINT_Z_M = 10.0
  HEIGHT_M = 16.1
  BASE_Y_M = -0.3

  LEG = 3.5

  out, opts = kit.cli_args()
  m = kit.Model('tower')
  m.box('concrete', (0.0, BASE_Y_M, 0.0), (FOOTPRINT_X_M, -BASE_Y_M, FOOTPRINT_Z_M))
  for dx in (-LEG, LEG):
      for dz in (-LEG, LEG):
          m.box('timber', (dx, 0.0, dz), (0.45, 10.0, 0.45))
  corners = [(-LEG, -LEG), (LEG, -LEG), (LEG, LEG), (-LEG, LEG)]
  for k in range(4):
      (ax, az), (bx, bz) = corners[k], corners[(k + 1) % 4]
      m.strut('timber', (ax, 0.5, az), (bx, 7.5, bz), 0.08)
      m.strut('timber', (bx, 0.5, bz), (ax, 7.5, az), 0.08)
  m.box('timber', (0.0, 8.0, 0.0), (8.5, 1.1, 8.5))
  m.box('dark', (0.0, 9.1, 0.0), (7.5, 2.4, 7.5))
  for dx in (-3.8, 0.0, 3.8):
      for dz in (-3.8, 3.8):
          m.box('timber', (dx, 9.1, dz), (0.22, 2.7, 0.22))
  m.box('steel', (0.0, 11.7, 0.0), (10.0, 0.4, 10.0))
  m.box('steel', (0.0, 12.1, 0.0), (0.12, HEIGHT_M - 12.1, 0.12))
  for i in range(16):
      m.box('timber', (4.4, i * 0.5, 4.0 - i * 0.55), (1.2, 0.16, 0.6))
  assert 4.4 + 0.6 <= FOOTPRINT_X_M / 2 and 4.0 - 15 * 0.55 - 0.3 >= -FOOTPRINT_Z_M / 2, 'the stair must stay on the pad'
  m.export(out)
  ```
  Write `<run date>` as the actual ISO date.

- [ ] **Step 4: Build a candidate, inspect it, look at it.** One Blender command at a time:
  ```bash
  npx tsx tools/models/blender/cli.ts tower
  blender -b --factory-startup --python-exit-code 1 -P tools/models/blender/preview.py -- /tmp/r4-tower-front.png --glb content/models/candidates/tower.glb --view front
  ```
  Expected in the inspection: 4 mesh nodes, `Turret`-free, about 470 triangles, 4 materials. **Read `/tmp/r4-tower-front.png`** and check that the legs, braces, cab, roof, mast and stair are all present, with nothing floating off the pad. Record the counts.

- [ ] **Step 5: The manifest entry.** Create `tools/models/entries/tower.json`:
  ```json
  {
    "id": "tower",
    "output": "content/buildings/tower.glb",
    "source": {
      "kind": "blender",
      "script": "tools/models/blender/tower.py",
      "dimensions": "footprint 9 x 9 m from content/bases/tacloban.json, tacloban-tower (read <run date>); every other figure is an ESTIMATE from src/render/scene/buildings.ts or new, each labeled in the script's header",
      "license": "AGPL-3.0-or-later"
    },
    "textures": { "maxSize": 512, "format": "webp" },
    "budget": { "maxBytes": 500000, "maxTriangles": 5000, "maxDrawCalls": 4 }
  }
  ```

- [ ] **Step 6: Build it into `content/`.**
  ```bash
  npm run models:build -- tower; echo "rc=$?"
  ```
  Expected: `rc=0` and a line `built tower -> content/buildings/tower.glb: <bytes> bytes, <triangles> triangles, 4 draw calls`. Copy that line into the ledger.

- [ ] **Step 7: Register, name, credit.**
  - `src/render/scene/staticModels.ts`: in `STATIC_MODELS.building`, add after `hangar`:
    ```ts
        tower: { url: staticModelUrl('building', 'tower') },
    ```
  - `content/library/tower.json`: after the line `"spec": "tower",` add:
    ```json
      "model": { "kind": "building", "id": "tower" },
    ```
  - `ASSETS.md`: directly after the `content/buildings/hangar.glb` row, add:
    ```
    | `content/buildings/tower.glb` | authored in Blender by `tools/models/blender/tower.py`; footprint from content/bases/tacloban.json (tacloban-tower), every other figure an ESTIMATE labeled in the script's header | authored for this project | AGPL-3.0-or-later |
    ```
  - `tests/render/staticModels.test.ts`: the `nope` assertion lists every registered id, so match the hangar anywhere in the list:
    ```ts
      expect(() => staticModelUrlFor('building', 'nope')).toThrow(/no building model "nope" \(registered: [a-z0-9, -]*\bhangar\b[a-z0-9, -]*\)/)
    ```
  - `tests/render/hangar/models.test.ts`: replace the test `'a ship and a building load with no articulated parts and a non-zero triangle count'` with:
    ```ts
      it('a ship and a building load with no articulated parts and a non-zero triangle count', async () => {
        // A building spec with no model of its own draws drawBuilding's boxes. Every Library building
        // names its model since R4, so the case is the tower entry with its model removed.
        const c = nodeHangarContent()
        const bare = { ...c.library.find((e) => e.id === 'tower')! }
        delete bare.model
        const boxes = buildCatalog({ ...c, library: [bare] })[0]!
        for (const [id, entry] of [['essex-cv', byId('essex-cv')], ['tower without its model', boxes]] as const) {
          // The ship loader is the game's (S1); a stub keeps GLTFLoader out of Node.
          const m = await loadHangarModel(entry, undefined, async (spec) => createShipMesh(spec))
          expect(m!.parts, id).toEqual([])
          expect(m!.counts().triangles, id).toBeGreaterThan(0)
          m!.dispose()
        }
      })
    ```

  - `tests/e2e/hangar.spec.ts`, check 14 (added 2026-09-27 with the card's Model row): the tower now has a model, so replace
    ```ts
        await select(page, 'tower')
        await expect(row).toContainText('Drawn in code (no model file)')
    ```
    with
    ```ts
        // Since R4 no Library entry is drawn in code; provenance.test.ts covers that case in Node.
        await select(page, 'tower')
        await expect(row).toContainText('Original Blender model (AGPL-3.0-or-later)')
    ```
    Tier 2 runs this in Task 15.
  - `tests/render/hangar/catalog.test.ts`: in `origin: internal (ours) or external …`, the comment `// Ours: Blender (Ki-84, Kagero, the hangar), generated ordnance (HVAR), drawn in code (tower).` becomes `// Ours: Blender (Ki-84, Kagero, the hangar, the tower since R4), generated ordnance (HVAR).` The assertion itself does not change: the tower stays `internal`.

- [ ] **Step 8: Run the Tier 1 checks.**
  ```bash
  npx vitest run tests/tools/models/buildingModels.test.ts tests/tools/models/outputs.test.ts tests/tools/models/manifest.test.ts tests/render/staticModels.test.ts tests/render/hangar --maxWorkers=2; echo "rc=$?"
  npx vitest run tests/tools/models/blenderEntries.test.ts -t "committed output tower$" --maxWorkers=1; echo "rc=$?"
  ```
  Expected: both `rc=0`. The second run is the byte-identical rebuild of `tower`, on nexus, and must report 1 passed. If `roster.test.ts`'s "exactly the allowlisted entries" fails, a test pinned the tower as procedural. Fix that test, not the allowlist; the tower was never on the list.

- [ ] **Step 9: Checks and commit.**
  ```bash
  npx tsc --noEmit; echo "rc=$?"
  npx eslint tests/tools/models/buildingModels.test.ts tests/render/staticModels.test.ts tests/render/hangar/models.test.ts tests/render/hangar/catalog.test.ts tests/e2e/hangar.spec.ts src/render/scene/staticModels.ts --max-warnings 0; echo "rc=$?"
  git add tools/models/blender/tower.py tools/models/entries/tower.json content/buildings/tower.glb src/render/scene/staticModels.ts content/library/tower.json ASSETS.md tests/tools/models/buildingModels.test.ts tests/render/staticModels.test.ts tests/render/hangar/models.test.ts tests/render/hangar/catalog.test.ts tests/e2e/hangar.spec.ts
  git commit -m "R4: the control tower as a Blender model, and the per-building Tier 1 harness"
  ```

---

### Task 5: The anti-aircraft battery

**Files:**
- Create: `tools/models/blender/aaa.py`
- Create: `tools/models/entries/aaa.json`
- Create: `content/buildings/aaa.glb` (built)
- Modify: `src/render/scene/staticModels.ts`, `content/library/aaa.json`, `ASSETS.md`, `tests/tools/models/buildingModels.test.ts`

**Interfaces:**
- Consumes: `sandbag_ring`, `tank`, `box` and `gun_barrel` (Task 2); the Task 4 harness tables.
- Produces: the first building `Turret1`, which H3 will drive.

- [ ] **Step 1: Extend the harness (failing).** In `tests/tools/models/buildingModels.test.ts`:
  ```ts
  const R4_BUILDINGS: readonly string[] = ['tower', 'aaa']
  const TURRETS: Readonly<Record<string, readonly string[]>> = {
    aaa: ['Turret1'],
  }
  const SIM_FOOTPRINTS: Readonly<Record<string, { readonly building: string; readonly padM: number }>> = {
    tower: { building: 'tacloban-tower', padM: 1 },
    aaa: { building: 'tacloban-aaa-1', padM: 0 },
  }
  ```
  Run `npx vitest run tests/tools/models/buildingModels.test.ts --maxWorkers=2; echo "rc=$?"`. Expected: FAIL with `no tools/models/entries/aaa.json`.

- [ ] **Step 2: Write the script.** Create `tools/models/blender/aaa.py`, applying any Task 1 citation as in Task 4 Step 3:
  ```python
  # tools/models/blender/aaa.py
  """Light anti-aircraft gun pit: a twin automatic-cannon mount in a sandbag ring. Original work, AGPL-3.0-or-later.

  Figures (read <run date>):
    footprint 6 x 6 m   content/bases/tacloban.json, tacloban-aaa-1 (the sim is authoritative; that file's
                        reference note calls it a round gameplay figure): the ring's outer diameter
    ring 0.8 m thick at the foot, 1.2 m high, leaning in 0.3 m     ESTIMATE
    pit floor 0.2 m deep, tucked 0.1 m under the ring               ESTIMATE
    pedestal 0.35 m radius, 1.0 m; cradle 1.0 x 0.5 x 0.9 m         ESTIMATE
    two barrels 1.8 m from the breech, 0.06 m radius, 0.4 m apart, at 30 deg   ESTIMATE: a generic twin 25 mm class mount
    two ready-ammunition boxes 0.8 x 0.5 x 0.4 m                    ESTIMATE
  Frame: the guns point +x at rest, +y up, meters; the ground is y=0.
  Turret1 is the whole mount, named for H3 (Hangar spec §9). A building's turrets are numbered +x to -x,
  then -z to +z (R4). The barrels are part of Turret1: no Gun children, no pivot (H3's).
  Leaves out: sights, seats, magazines, a shield, the sandbags' texture.
  """
  import os
  import sys

  sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
  import kit  # noqa: E402

  FOOTPRINT_X_M = 6.0
  FOOTPRINT_Z_M = 6.0
  HEIGHT_M = 2.25
  BASE_Y_M = -0.2

  RING_T = 0.8
  INNER = FOOTPRINT_X_M / 2 - RING_T

  out, opts = kit.cli_args()
  m = kit.Model('aaa')
  m.sandbag_ring('earth', (0.0, 0.0, 0.0), INNER, RING_T, 1.2, 0.3, 16)
  m.tank('concrete', (0.0, BASE_Y_M, 0.0), INNER + 0.1, -BASE_Y_M, 0.0, 16)
  m.tank('steel', (0.0, 0.0, 0.0), 0.35, 1.0, 0.0, 12, node='Turret1')
  m.box('steel', (0.0, 1.0, 0.0), (1.0, 0.5, 0.9), node='Turret1')
  for dz in (-0.2, 0.2):
      m.gun_barrel('steel', (-0.3, 1.3, dz), 0.0, 30.0, 1.8, 0.06, node='Turret1')
  for dz in (-1.2, 1.2):
      m.box('dark', (-1.2, 0.0, dz), (0.8, 0.5, 0.4))
  # The boxes' outer corners (x -1.6, |z| 1.4) must clear the ring's inner face.
  assert (1.6 ** 2 + 1.4 ** 2) ** 0.5 < INNER, 'the ammunition boxes must stand inside the pit'
  m.export(out)
  ```
  `HEIGHT_M` is the muzzle's top: 1.3 + 1.8 sin 30° + 0.06 cos 30° = 2.252 m.

- [ ] **Step 3: Candidate, inspection, preview.**
  ```bash
  npx tsx tools/models/blender/cli.ts aaa
  blender -b --factory-startup --python-exit-code 1 -P tools/models/blender/preview.py -- /tmp/r4-aaa-front.png --glb content/models/candidates/aaa.glb --view front
  ```
  Expected: 4 nodes (`Turret1`, `aaa_concrete`, `aaa_dark`, `aaa_earth`) and about 330 triangles. Read the PNG. The ring should be closed, and the barrels should rise toward +x above the ring.

- [ ] **Step 4: Entry and build.** Create `tools/models/entries/aaa.json`:
  ```json
  {
    "id": "aaa",
    "output": "content/buildings/aaa.glb",
    "source": {
      "kind": "blender",
      "script": "tools/models/blender/aaa.py",
      "dimensions": "footprint 6 x 6 m from content/bases/tacloban.json, tacloban-aaa-1 (read <run date>); the mount is a generic twin 25 mm class gun and every other figure is an ESTIMATE labeled in the script's header",
      "license": "AGPL-3.0-or-later"
    },
    "textures": { "maxSize": 512, "format": "webp" },
    "budget": { "maxBytes": 500000, "maxTriangles": 5000, "maxDrawCalls": 4 }
  }
  ```
  ```bash
  npm run models:build -- aaa; echo "rc=$?"
  ```
  Record the `built aaa -> ...` line.

- [ ] **Step 5: Register, name, credit.**
  - `staticModels.ts`: add `aaa: { url: staticModelUrl('building', 'aaa') },` as the first line of `STATIC_MODELS.building`.
  - `content/library/aaa.json`: after `"spec": "aaa",` add `"model": { "kind": "building", "id": "aaa" },`.
  - `ASSETS.md`: after the tower row, add:
    ```
    | `content/buildings/aaa.glb` | authored in Blender by `tools/models/blender/aaa.py`; footprint from content/bases/tacloban.json (tacloban-aaa-1), every other figure an ESTIMATE labeled in the script's header | authored for this project | AGPL-3.0-or-later |
    ```

- [ ] **Step 6: Run the Tier 1 checks.**
  ```bash
  npx vitest run tests/tools/models/buildingModels.test.ts tests/tools/models/outputs.test.ts tests/render/staticModels.test.ts tests/render/hangar --maxWorkers=2; echo "rc=$?"
  npx vitest run tests/tools/models/blenderEntries.test.ts -t "committed output aaa$" --maxWorkers=1; echo "rc=$?"
  ```
  Expected: both `rc=0`.

- [ ] **Step 7: Checks and commit.**
  ```bash
  npx tsc --noEmit; echo "rc=$?"
  npx eslint tests/tools/models/buildingModels.test.ts src/render/scene/staticModels.ts --max-warnings 0; echo "rc=$?"
  git add tools/models/blender/aaa.py tools/models/entries/aaa.json content/buildings/aaa.glb src/render/scene/staticModels.ts content/library/aaa.json ASSETS.md tests/tools/models/buildingModels.test.ts
  git commit -m "R4: the anti-aircraft battery as a Blender model, its mount named Turret1"
  ```

---

### Task 6: The coastal gun battery

**Files:**
- Create: `tools/models/blender/coastal-gun-battery.py`, `tools/models/entries/coastal-gun-battery.json`, `content/buildings/coastal-gun-battery.glb`
- Modify: `src/render/scene/staticModels.ts`, `content/library/coastal-gun-battery.json`, `ASSETS.md`, `tests/tools/models/buildingModels.test.ts`, `tests/render/hangar/roster.test.ts`

**Interfaces:**
- Consumes: `sandbag_ring`, `tank`, `frustum` and `gun_barrel` (Task 2); the harness tables.
- Produces: two turrets, `Turret1` at -z and `Turret2` at +z.

- [ ] **Step 1: Extend the harness (failing).**
  ```ts
  const R4_BUILDINGS: readonly string[] = ['tower', 'aaa', 'coastal-gun-battery']
  const TURRETS: Readonly<Record<string, readonly string[]>> = {
    aaa: ['Turret1'],
    'coastal-gun-battery': ['Turret1', 'Turret2'],
  }
  ```
  Run the file. Expected: FAIL, no entry.

- [ ] **Step 2: Write the script.** Create `tools/models/blender/coastal-gun-battery.py`, applying Task 1's citations:
  ```python
  # tools/models/blender/coastal-gun-battery.py
  """Coast-defense battery: two shielded guns in open concrete pits, an earth-covered magazine behind. Original work, AGPL-3.0-or-later.

  Figures (read <run date>):
    two guns 24 m apart, 4 m seaward of center                     ESTIMATE
    pit 4.0 m inner radius, 1.0 m wall, 1.5 m high, leaning in 0.2 m; floor 0.3 m deep   ESTIMATE
    pedestal 1.2 m radius x 0.8 m; shield 4.0 x 3.2 m at the foot, 3.0 x 2.8 m at the top, 2.4 m tall   ESTIMATE
    barrel 5.4 m from the breech, 0.1 m radius, at 3 deg            ESTIMATE: a 12 cm/45 class naval gun (45 x 0.12 m = 5.4 m bore)
    magazine mound 8 x 10 m at the foot, 4 x 6 m at the top, 3 m high   ESTIMATE
  Frame: the guns point +x (seaward) at rest, +y up, meters; the ground is y=0.
  Turret1 (-z) and Turret2 (+z) are the whole guns, named for H3 (Hangar spec §9); a building's turrets
  are numbered +x to -x, then -z to +z (R4). No Gun children, no pivots (H3's).
  Leaves out: the rangefinder, the fire-control post, shell hoists, camouflage.
  """
  import os
  import sys

  sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
  import kit  # noqa: E402

  FOOTPRINT_X_M = 18.0
  FOOTPRINT_Z_M = 34.0
  HEIGHT_M = 3.2
  BASE_Y_M = -0.3

  PIT_X, PIT_Z, PIT_IN, PIT_T = 4.0, 12.0, 4.0, 1.0
  BARREL_M, ELEVATION = 5.4, 3.0

  out, opts = kit.cli_args()
  m = kit.Model('coastal-gun-battery')
  for index, side in ((1, -1), (2, 1)):
      zc = side * PIT_Z
      turret = f'Turret{index}'
      m.sandbag_ring('concrete', (PIT_X, 0.0, zc), PIT_IN, PIT_T, 1.5, 0.2, 16)
      m.tank('concrete', (PIT_X, BASE_Y_M, zc), PIT_IN + 0.1, -BASE_Y_M, 0.0, 16)
      m.tank('steel', (PIT_X, 0.0, zc), 1.2, 0.8, 0.0, 16, node=turret)
      m.frustum('steel', (PIT_X, 0.8, zc), (4.0, 3.2), (3.0, 2.8), 2.4, node=turret)
      m.gun_barrel('steel', (PIT_X - 0.5, 1.9, zc), 0.0, ELEVATION, BARREL_M, 0.1, node=turret)
  m.frustum('earth', (-5.0, 0.0, 0.0), (8.0, 10.0), (4.0, 6.0), 3.0)
  # The muzzle must stay inside the pit's outer edge, or the footprint moves.
  assert PIT_X - 0.5 + BARREL_M * 0.99863 + 0.1 * 0.05234 < PIT_X + PIT_IN + PIT_T, 'the muzzle overhangs the pit'
  m.export(out)
  ```
  The assertion's constants are cos 3° and sin 3°. If Task 1 cites a different barrel or elevation, recompute them.

- [ ] **Step 3: Candidate, inspection, preview.**
  ```bash
  npx tsx tools/models/blender/cli.ts coastal-gun-battery
  blender -b --factory-startup --python-exit-code 1 -P tools/models/blender/preview.py -- /tmp/r4-coastal-front.png --glb content/models/candidates/coastal-gun-battery.glb --view front
  ```
  Expected: 4 nodes (`Turret1`, `Turret2`, `coastal-gun-battery_concrete`, `coastal-gun-battery_earth`) and about 600 triangles. Read the PNG.

- [ ] **Step 4: Entry and build.** Create `tools/models/entries/coastal-gun-battery.json` from the Global Constraints template, with `<id>` = `coastal-gun-battery` and `<dimensions>` = "a generic two-gun battery of 12 cm/45 class naval guns; every figure is an ESTIMATE labeled in the script's header (no primary source found, searched <run date>)". If Task 1 cited a figure, name that source and its read date instead. Then:
  ```bash
  npm run models:build -- coastal-gun-battery; echo "rc=$?"
  ```

- [ ] **Step 5: Register, name, credit, shrink the allowlist.**
  - `staticModels.ts`: add `'coastal-gun-battery': { url: staticModelUrl('building', 'coastal-gun-battery') },`, in alphabetical order.
  - `content/library/coastal-gun-battery.json`: after `"side": "japanese",` add `"model": { "kind": "building", "id": "coastal-gun-battery" },`.
  - `ASSETS.md`: add after the aaa row:
    ```
    | `content/buildings/coastal-gun-battery.glb` | authored in Blender by `tools/models/blender/coastal-gun-battery.py`; every figure CITED or labeled ESTIMATE in the script's header | authored for this project | AGPL-3.0-or-later |
    ```
  - `tests/render/hangar/roster.test.ts`: delete `'coastal-gun-battery'` from `NOT_YET_DRAWN`, and lower `CEILING` by one (9 → 8 from the expected start).
  - If Task 0 Step 3 found a test using `coastal-gun-battery` as "not drawn", switch it to `willys-mb-jeep`.

- [ ] **Step 6: Run the Tier 1 checks.**
  ```bash
  npx vitest run tests/tools/models/buildingModels.test.ts tests/tools/models/outputs.test.ts tests/render/staticModels.test.ts tests/render/hangar --maxWorkers=2; echo "rc=$?"
  npx vitest run tests/tools/models/blenderEntries.test.ts -t "committed output coastal-gun-battery$" --maxWorkers=1; echo "rc=$?"
  ```

- [ ] **Step 7: Checks and commit.**
  ```bash
  npx tsc --noEmit; echo "rc=$?"
  npx eslint tests/tools/models/buildingModels.test.ts tests/render/hangar/roster.test.ts src/render/scene/staticModels.ts --max-warnings 0; echo "rc=$?"
  git add tools/models/blender/coastal-gun-battery.py tools/models/entries/coastal-gun-battery.json content/buildings/coastal-gun-battery.glb src/render/scene/staticModels.ts content/library/coastal-gun-battery.json ASSETS.md tests/tools/models/buildingModels.test.ts tests/render/hangar/roster.test.ts
  git commit -m "R4: the coastal gun battery as a Blender model, Turret1 and Turret2; off the allowlist"
  ```

---

### Task 7: The fuel tank farm

**Files:**
- Create: `tools/models/blender/fuel-tank-farm.py`, `tools/models/entries/fuel-tank-farm.json`, `content/buildings/fuel-tank-farm.glb`
- Modify: `src/render/scene/staticModels.ts`, `content/library/fuel-tank-farm.json`, `ASSETS.md`, `tests/tools/models/buildingModels.test.ts`, `tests/render/hangar/roster.test.ts`

**Interfaces:**
- Consumes: `tank`, `frustum` and `strut` (Task 2); the harness tables.
- Produces: nothing new.

- [ ] **Step 1: Extend the harness (failing).** Append `'fuel-tank-farm'` to `R4_BUILDINGS`. Run the file and expect FAIL.

- [ ] **Step 2: Write the script.** Create `tools/models/blender/fuel-tank-farm.py`:
  ```python
  # tools/models/blender/fuel-tank-farm.py
  """Fuel tank farm: four vertical steel tanks on ring foundations inside an earth fire bund, piped to a manifold.
  Original work, AGPL-3.0-or-later.

  Figures (read <run date>):
    four tanks 12 m in diameter, 8 m shell, 1 m cone roof, 28 m apart   ESTIMATE
    ring foundations 13 m in diameter, 0.3 m deep                        ESTIMATE
    bund 55 m square at its outer toe; 3 m wide at the foot, 1 m at the top, 1.5 m high   ESTIMATE
    pipes 0.4 m across, 0.6 m above the ground                           ESTIMATE
  Frame: the manifold runs out to +x, +y up, meters; the ground is y=0.
  Leaves out: ladders, vents, pumps, the tank-truck stand. The bund's four walls overlap at the corners
  in one paint (same material, so the overlap cannot be seen).
  """
  import os
  import sys

  sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
  import kit  # noqa: E402

  FOOTPRINT_X_M = 55.0
  FOOTPRINT_Z_M = 55.0
  HEIGHT_M = 9.0
  BASE_Y_M = -0.3

  TANK_R, SHELL, ROOF, PITCH = 6.0, 8.0, 1.0, 28.0
  BUND_FOOT, BUND_TOP, BUND_H = 3.0, 1.0, 1.5
  PIPE_Y, PIPE_R = 0.6, 0.2

  out, opts = kit.cli_args()
  m = kit.Model('fuel-tank-farm')
  for sx in (-1, 1):
      for sz in (-1, 1):
          cx, cz = sx * PITCH / 2, sz * PITCH / 2
          m.tank('steel', (cx, 0.0, cz), TANK_R, SHELL, ROOF, 24)
          m.tank('concrete', (cx, BASE_Y_M, cz), TANK_R + 0.5, -BASE_Y_M, 0.0, 24)
  side = FOOTPRINT_X_M - BUND_FOOT     # the bund's centerline square
  run = BUND_FOOT - BUND_TOP           # both slopes of a wall together, also used at its ends
  for s in (-1, 1):
      m.frustum('earth', (s * side / 2, 0.0, 0.0), (BUND_FOOT, FOOTPRINT_Z_M), (BUND_TOP, FOOTPRINT_Z_M - run), BUND_H)
      m.frustum('earth', (0.0, 0.0, s * side / 2), (FOOTPRINT_X_M, BUND_FOOT), (FOOTPRINT_X_M - run, BUND_TOP), BUND_H)
  for sx in (-1, 1):
      m.strut('dark', (sx * PITCH / 2, PIPE_Y, -PITCH / 2), (sx * PITCH / 2, PIPE_Y, PITCH / 2), PIPE_R, sides=6)
  inner_toe = FOOTPRINT_X_M / 2 - BUND_FOOT
  m.strut('dark', (-PITCH / 2, PIPE_Y, 0.0), (inner_toe - 0.5, PIPE_Y, 0.0), PIPE_R, sides=6)
  assert PITCH / 2 + TANK_R + 0.5 < inner_toe, 'the tanks and their foundations must stand inside the bund'
  assert SHELL + ROOF == HEIGHT_M, 'HEIGHT_M is the apex of a tank roof'
  m.export(out)
  ```

- [ ] **Step 3: Candidate, inspection, preview.**
  ```bash
  npx tsx tools/models/blender/cli.ts fuel-tank-farm
  blender -b --factory-startup --python-exit-code 1 -P tools/models/blender/preview.py -- /tmp/r4-fuel-front.png --glb content/models/candidates/fuel-tank-farm.glb --view front
  ```
  Expected: 4 nodes (`_concrete`, `_dark`, `_earth`, `_steel`) and about 850 triangles. Read the PNG.

- [ ] **Step 4: Entry and build.** Create `tools/models/entries/fuel-tank-farm.json` from the Global Constraints template, with `<dimensions>` = "a generic four-tank farm; every figure is an ESTIMATE labeled in the script's header (no primary source found, searched <run date>)". Use Task 1's citation if there is one. Then `npm run models:build -- fuel-tank-farm; echo "rc=$?"`.

- [ ] **Step 5: Register, name, credit, shrink the allowlist.**
  - `staticModels.ts`: `'fuel-tank-farm': { url: staticModelUrl('building', 'fuel-tank-farm') },`, alphabetical.
  - `content/library/fuel-tank-farm.json`: after `"side": "japanese",` add `"model": { "kind": "building", "id": "fuel-tank-farm" },`.
  - The `ASSETS.md` row from the Global Constraints template.
  - `roster.test.ts`: delete `'fuel-tank-farm'` from `NOT_YET_DRAWN`, and lower `CEILING` by one.
  - Switch any Task 0 Step 3 hit on `fuel-tank-farm` to `willys-mb-jeep`.

- [ ] **Step 6: Run the Tier 1 checks.**
  ```bash
  npx vitest run tests/tools/models/buildingModels.test.ts tests/tools/models/outputs.test.ts tests/render/staticModels.test.ts tests/render/hangar --maxWorkers=2; echo "rc=$?"
  npx vitest run tests/tools/models/blenderEntries.test.ts -t "committed output fuel-tank-farm$" --maxWorkers=1; echo "rc=$?"
  ```

- [ ] **Step 7: Checks and commit.**
  ```bash
  npx tsc --noEmit; echo "rc=$?"
  npx eslint tests/tools/models/buildingModels.test.ts tests/render/hangar/roster.test.ts src/render/scene/staticModels.ts --max-warnings 0; echo "rc=$?"
  git add tools/models/blender/fuel-tank-farm.py tools/models/entries/fuel-tank-farm.json content/buildings/fuel-tank-farm.glb src/render/scene/staticModels.ts content/library/fuel-tank-farm.json ASSETS.md tests/tools/models/buildingModels.test.ts tests/render/hangar/roster.test.ts
  git commit -m "R4: the fuel tank farm as a Blender model; off the allowlist"
  ```

---

### Task 8: The earthworks: ammunition bunker and revetment

Grouped because both are earth frustums around a small concrete element, and neither has a turret. They get two builds and two commits.

**Files:**
- Create: `tools/models/blender/ammunition-bunker.py`, `tools/models/entries/ammunition-bunker.json`, `content/buildings/ammunition-bunker.glb`
- Create: `tools/models/blender/revetment.py`, `tools/models/entries/revetment.json`, `content/buildings/revetment.glb`
- Modify: `src/render/scene/staticModels.ts`, `content/library/ammunition-bunker.json`, `content/library/revetment.json`, `ASSETS.md`, `tests/tools/models/buildingModels.test.ts`, `tests/render/hangar/roster.test.ts`

**Interfaces:**
- Consumes: `frustum` and `box` (Task 2); the harness; `coplanarOverlaps` (Task 3), mutation-checked here.

- [ ] **Step 1: The bunker, failing.** Append `'ammunition-bunker'` to `R4_BUILDINGS` and run the file. Expected: FAIL.

- [ ] **Step 2: The bunker script.** Create `tools/models/blender/ammunition-bunker.py`:
  ```python
  # tools/models/blender/ammunition-bunker.py
  """Earth-covered ammunition magazine: a mound over the store, a concrete headwall with wing walls, steel doors.
  Original work, AGPL-3.0-or-later.

  Figures (read <run date>):
    mound 14 x 12 m at the foot, 8 x 6 m at the top, 3.5 m high         ESTIMATE
    headwall 1.0 m thick, 3.2 m high, 5.0 m wide; its face on the mound's foot line   ESTIMATE
    wing walls 2.0 m long, 0.4 m thick, 1.6 m high                      ESTIMATE
    doors 2.0 x 2.2 m, standing 0.1 m proud of the headwall             ESTIMATE
  Frame: the doors face +x, +y up, meters; the ground is y=0.
  Leaves out: vents, lightning rods, the blast traverse, the access track.
  """
  import os
  import sys

  sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
  import kit  # noqa: E402

  FOOTPRINT_X_M = 16.0
  FOOTPRINT_Z_M = 12.0
  HEIGHT_M = 3.5
  BASE_Y_M = 0.0

  MOUND_X, FACE_X = 14.0, 6.0          # the mound's foot length, and the headwall's face line
  WING_L = 2.0

  out, opts = kit.cli_args()
  m = kit.Model('ammunition-bunker')
  m.frustum('earth', (FACE_X - MOUND_X / 2, 0.0, 0.0), (MOUND_X, FOOTPRINT_Z_M), (8.0, 6.0), HEIGHT_M)
  m.box('concrete', (FACE_X - 0.5, 0.0, 0.0), (1.0, 3.2, 5.0))
  for s in (-1, 1):
      m.box('concrete', (FACE_X + WING_L / 2, 0.0, s * 2.7), (WING_L, 1.6, 0.4))
  m.box('dark', (FACE_X + 0.05, 0.0, 0.0), (0.1, 2.2, 2.0))
  assert FACE_X + WING_L - (FACE_X - MOUND_X) == FOOTPRINT_X_M, 'FOOTPRINT_X_M runs from the mound\'s back toe to the wing walls\' ends'
  m.export(out)
  ```

- [ ] **Step 3: Candidate, preview, entry, build.**
  ```bash
  npx tsx tools/models/blender/cli.ts ammunition-bunker
  blender -b --factory-startup --python-exit-code 1 -P tools/models/blender/preview.py -- /tmp/r4-bunker-front.png --glb content/models/candidates/ammunition-bunker.glb --view front
  ```
  Expected: 3 nodes and about 60 triangles. Read the PNG. Create `tools/models/entries/ammunition-bunker.json` from the Global Constraints template, with `<dimensions>` = "a generic earth-covered magazine; every figure is an ESTIMATE labeled in the script's header (no primary source found, searched <run date>)", or Task 1's citation. Then `npm run models:build -- ammunition-bunker; echo "rc=$?"`.

- [ ] **Step 4: Mutation-check the z-fighting test on real bytes.**
  - Edit the door line to `m.box('dark', (FACE_X - 0.05, 0.0, 0.0), (0.1, 2.2, 2.0))`. The door's front face now lies on the headwall's face, facing the same way.
  - Run `npm run models:build -- ammunition-bunker`.
  - Run `npx vitest run tests/tools/models/buildingModels.test.ts -t "ammunition-bunker" --maxWorkers=2`. Expected: `no two differently painted faces z-fight` FAILS, naming both `ammunition-bunker_concrete (concrete)` and `ammunition-bunker_dark (dark)`, in either order.
  - The script is not committed yet, so restore the door line by hand to `FACE_X + 0.05`. Rebuild, and rerun to green. Step 6's byte-identity run then proves the committed glb is the reverted one.
  - Record both runs in the ledger.

- [ ] **Step 5: Register, name, credit, shrink.**
  - `staticModels.ts`: `'ammunition-bunker': { url: staticModelUrl('building', 'ammunition-bunker') },`.
  - Library: `"model": { "kind": "building", "id": "ammunition-bunker" },` after `"side"`.
  - The `ASSETS.md` row from the Global Constraints template.
  - Delete `'ammunition-bunker'` from `NOT_YET_DRAWN` and lower `CEILING` by one.
  - Switch any Task 0 Step 3 hit on `ammunition-bunker` to `willys-mb-jeep`.

- [ ] **Step 6: Run the Tier 1 checks and commit.**
  ```bash
  npx vitest run tests/tools/models/buildingModels.test.ts tests/tools/models/outputs.test.ts tests/render/staticModels.test.ts tests/render/hangar --maxWorkers=2; echo "rc=$?"
  npx vitest run tests/tools/models/blenderEntries.test.ts -t "committed output ammunition-bunker$" --maxWorkers=1; echo "rc=$?"
  npx tsc --noEmit; echo "rc=$?"
  npx eslint tests/tools/models/buildingModels.test.ts tests/render/hangar/roster.test.ts src/render/scene/staticModels.ts --max-warnings 0; echo "rc=$?"
  git add tools/models/blender/ammunition-bunker.py tools/models/entries/ammunition-bunker.json content/buildings/ammunition-bunker.glb src/render/scene/staticModels.ts content/library/ammunition-bunker.json ASSETS.md tests/tools/models/buildingModels.test.ts tests/render/hangar/roster.test.ts
  git commit -m "R4: the ammunition bunker as a Blender model; off the allowlist"
  ```

- [ ] **Step 7: The revetment, failing.** Append `'revetment'` to `R4_BUILDINGS` and run the file. Expected: FAIL.

- [ ] **Step 8: The revetment script.** Create `tools/models/blender/revetment.py`:
  ```python
  # tools/models/blender/revetment.py
  """Aircraft revetment: a U of earth blast walls around one fighter's bay, open to +x. Original work, AGPL-3.0-or-later.

  Figures (read <run date>):
    bay 14 m deep (x) by 18 m wide (z), open at +x   ESTIMATE, sized to clear a single-engine fighter of about 12 m span
    walls 3 m high, 6 m at the foot, 1.5 m at the top   ESTIMATE
    bay floor 0.2 m deep                             ESTIMATE
  Frame: the open end faces +x, +y up, meters; the bay floor's top is y=0.
  Leaves out: the taxiway spur, tie-downs, camouflage netting. The back and side walls overlap at the
  corners in one paint (same material, so the overlap cannot be seen).
  """
  import os
  import sys

  sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
  import kit  # noqa: E402

  FOOTPRINT_X_M = 20.0
  FOOTPRINT_Z_M = 30.0
  HEIGHT_M = 3.0
  BASE_Y_M = -0.2

  BAY_X, BAY_Z = 14.0, 18.0
  FOOT, TOP = 6.0, 1.5
  RUN = FOOT - TOP                     # both slopes of a wall together, also used at its ends

  out, opts = kit.cli_args()
  m = kit.Model('revetment')
  m.frustum('earth', (-BAY_X / 2 - FOOT / 2, 0.0, 0.0), (FOOT, FOOTPRINT_Z_M), (TOP, FOOTPRINT_Z_M - RUN), HEIGHT_M)
  side_len = BAY_X + FOOT              # from the back wall's outer toe to the open end
  side_cx = -BAY_X / 2 - FOOT + side_len / 2
  for s in (-1, 1):
      m.frustum('earth', (side_cx, 0.0, s * (BAY_Z / 2 + FOOT / 2)), (side_len, FOOT), (side_len - RUN, TOP), HEIGHT_M)
  m.box('concrete', (0.0, BASE_Y_M, 0.0), (BAY_X, -BASE_Y_M, BAY_Z))
  assert side_len == FOOTPRINT_X_M and BAY_Z + 2 * FOOT == FOOTPRINT_Z_M, 'the footprint is the walls\' outer toes'
  m.export(out)
  ```

- [ ] **Step 9: Candidate, preview, entry, build.**
  ```bash
  npx tsx tools/models/blender/cli.ts revetment
  blender -b --factory-startup --python-exit-code 1 -P tools/models/blender/preview.py -- /tmp/r4-revetment-front.png --glb content/models/candidates/revetment.glb --view front
  ```
  Expected: 2 nodes and about 50 triangles. Read the PNG: the open end faces the camera. Create `tools/models/entries/revetment.json` from the Global Constraints template, with `<dimensions>` = "a generic single-fighter revetment; every figure is an ESTIMATE labeled in the script's header (no primary source found, searched <run date>)", or Task 1's citation. Then `npm run models:build -- revetment; echo "rc=$?"`.

- [ ] **Step 10: Register, name, credit, shrink, check, commit.**
  - Add `revetment: { url: staticModelUrl('building', 'revetment') },` to `staticModels.ts`.
  - Add the Library `model` line after `"side"`, and the `ASSETS.md` row.
  - Delete `'revetment'` from `NOT_YET_DRAWN` and lower `CEILING` by one.
  - Switch any Task 0 hit on `revetment`.
  - Run the same two vitest commands as Step 6 with `revetment`, then tsc and eslint.
  ```bash
  git add tools/models/blender/revetment.py tools/models/entries/revetment.json content/buildings/revetment.glb src/render/scene/staticModels.ts content/library/revetment.json ASSETS.md tests/tools/models/buildingModels.test.ts tests/render/hangar/roster.test.ts
  git commit -m "R4: the revetment as a Blender model; off the allowlist"
  ```

---

### Task 9: The timber buildings: barracks and huts, pier and warehouses

Grouped because both are timber walls under `gable_roof`s with dark openings. They get two builds and two commits.

**Files:**
- Create: `tools/models/blender/barracks-and-huts.py`, `tools/models/entries/barracks-and-huts.json`, `content/buildings/barracks-and-huts.glb`
- Create: `tools/models/blender/pier-and-warehouses.py`, `tools/models/entries/pier-and-warehouses.json`, `content/buildings/pier-and-warehouses.glb`
- Modify: `src/render/scene/staticModels.ts`, both Library entries, `ASSETS.md`, `tests/tools/models/buildingModels.test.ts`, `tests/render/hangar/roster.test.ts`

**Interfaces:**
- Consumes: `box` and `gable_roof` (Task 2); `AIRFIELD_HUTS` from `src/render/scene/airfield.ts` (read only; the file is untouched).

- [ ] **Step 1: The barracks, failing.** Append `'barracks-and-huts'` to `R4_BUILDINGS`. Add the import `import { AIRFIELD_HUTS } from '../../../src/render/scene/airfield.js'` at the top of `buildingModels.test.ts`, and inside the `footprints the sim owns` describe add:
  ```ts
    it("barracks-and-huts: the barracks is the game's own decorative hut, AIRFIELD_HUTS (the scenery is authoritative)", () => {
      const [hut] = AIRFIELD_HUTS
      expect(AIRFIELD_HUTS.every((h) => h.width === hut.width && h.length === hut.length)).toBe(true)
      const src = scriptOf('barracks-and-huts')
      expect(scriptConstant(src, 'BARRACKS_WIDTH_M')).toBe(hut.width)
      expect(scriptConstant(src, 'BARRACKS_LENGTH_M')).toBe(hut.length)
    })
  ```
  Run the file. Expected: FAIL, no entry.

- [ ] **Step 2: The barracks script.** Create `tools/models/blender/barracks-and-huts.py`:
  ```python
  # tools/models/blender/barracks-and-huts.py
  """Barracks and huts: one raised timber barracks and two small huts. Original work, AGPL-3.0-or-later.

  Figures (read <run date>):
    barracks 12 x 28 m   the game's own decorative hut, src/render/scene/airfield.ts AIRFIELD_HUTS
                         (its comment: a period-inspired scene, not a survey; the game draws three at Tacloban)
    barracks: floor 0.8 m up on 0.25 m posts, walls 2.8 m, roof rise 2.4 m, 0.6 m eaves   ESTIMATE
    huts 6 x 8 m: floor 0.5 m up, walls 2.4 m, roof rise 1.6 m, 0.4 m eaves              ESTIMATE
    windows 1.2 x 0.9 m, doors 1.0 x 2.0 m, both 0.05 m proud of the wall                ESTIMATE
  Frame: ridges run along z, the huts stand to +x of the barracks, +y up, meters; the ground is y=0.
  Leaves out: steps, verandas, shutters, the roofs' corrugation or thatch.
  """
  import os
  import sys

  sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
  import kit  # noqa: E402

  FOOTPRINT_X_M = 24.0
  FOOTPRINT_Z_M = 29.2
  HEIGHT_M = 6.0
  BASE_Y_M = 0.0

  BARRACKS_WIDTH_M = 12.0
  BARRACKS_LENGTH_M = 28.0

  out, opts = kit.cli_args()
  m = kit.Model('barracks-and-huts')


  def building(cx, cz, width, length, floor, wall, rise, eave, posts, windows):
      px, pz = posts
      for i in range(px):
          for k in range(pz):
              x = cx - width / 2 + 0.3 + (width - 0.6) * i / (px - 1)
              z = cz - length / 2 + 0.3 + (length - 0.6) * k / (pz - 1)
              m.box('timber', (x, 0.0, z), (0.25, floor, 0.25))
      m.box('timber', (cx, floor, cz), (width, wall, length))
      m.gable_roof('steel', (cx, floor + wall, cz), width, length, rise, eave)
      for k in range(windows):
          wz = cz - length / 2 + length * (k + 0.5) / windows
          for s in (-1, 1):
              m.box('dark', (cx + s * (width / 2 + 0.025), floor + 0.9, wz), (0.05, 0.9, 1.2))
      m.box('dark', (cx, floor, cz + length / 2 + 0.025), (1.0, 2.0, 0.05))


  building(-6.0, 0.0, BARRACKS_WIDTH_M, BARRACKS_LENGTH_M, 0.8, 2.8, 2.4, 0.6, (3, 8), 7)
  for cz in (-7.0, 7.0):
      building(8.0, cz, 6.0, 8.0, 0.5, 2.4, 1.6, 0.4, (2, 3), 2)
  assert 0.8 + 2.8 + 2.4 == HEIGHT_M, 'HEIGHT_M is the barracks ridge'
  assert BARRACKS_LENGTH_M + 2 * 0.6 == FOOTPRINT_Z_M, 'FOOTPRINT_Z_M is the barracks roof with its eaves'
  m.export(out)
  ```
  The x extent runs from -12.6 (the barracks eave) to 11.4 (a hut's eave), which is 24.0.

- [ ] **Step 3: Candidate, preview, entry, build.**
  ```bash
  npx tsx tools/models/blender/cli.ts barracks-and-huts
  blender -b --factory-startup --python-exit-code 1 -P tools/models/blender/preview.py -- /tmp/r4-barracks-front.png --glb content/models/candidates/barracks-and-huts.glb --view front
  ```
  Expected: 3 nodes and about 800 triangles. Read the PNG. Create the entry from the Global Constraints template, with `<dimensions>` = "barracks footprint 12 x 28 m from src/render/scene/airfield.ts AIRFIELD_HUTS, the game's own scenery (read <run date>); every other figure is an ESTIMATE labeled in the script's header", then build it.

- [ ] **Step 4: Register, name, credit, shrink, check, commit.**
  - Add `'barracks-and-huts': { url: staticModelUrl('building', 'barracks-and-huts') },` to `staticModels.ts`.
  - Add the Library `model` line and the `ASSETS.md` row. The row says: "barracks footprint from src/render/scene/airfield.ts (AIRFIELD_HUTS), every other figure an ESTIMATE labeled in the script's header".
  - Delete `'barracks-and-huts'` from `NOT_YET_DRAWN`, lower `CEILING` by one, and switch any Task 0 hit.
  - Run:
  ```bash
  npx vitest run tests/tools/models/buildingModels.test.ts tests/tools/models/outputs.test.ts tests/render/staticModels.test.ts tests/render/hangar --maxWorkers=2; echo "rc=$?"
  npx vitest run tests/tools/models/blenderEntries.test.ts -t "committed output barracks-and-huts$" --maxWorkers=1; echo "rc=$?"
  npx tsc --noEmit; echo "rc=$?"
  npx eslint tests/tools/models/buildingModels.test.ts tests/render/hangar/roster.test.ts src/render/scene/staticModels.ts --max-warnings 0; echo "rc=$?"
  git add tools/models/blender/barracks-and-huts.py tools/models/entries/barracks-and-huts.json content/buildings/barracks-and-huts.glb src/render/scene/staticModels.ts content/library/barracks-and-huts.json ASSETS.md tests/tools/models/buildingModels.test.ts tests/render/hangar/roster.test.ts
  git commit -m "R4: barracks and huts as a Blender model, the barracks sized from AIRFIELD_HUTS; off the allowlist"
  ```

- [ ] **Step 5: The pier, failing.** Append `'pier-and-warehouses'` to `R4_BUILDINGS` and run the file. Expected: FAIL.

- [ ] **Step 6: The pier script.** Create `tools/models/blender/pier-and-warehouses.py`:
  ```python
  # tools/models/blender/pier-and-warehouses.py
  """Pier and warehouses: a timber pier on piles off a concrete quay, two gable-roofed warehouses on the quay.
  Original work, AGPL-3.0-or-later.

  Figures (read <run date>):
    quay 40 x 40 m, its top 2.0 m above the water                 ESTIMATE
    pier 60 m long, 10 m wide, 0.3 m deck, its top level with the quay   ESTIMATE
    piles 0.4 m square, three across, every 6 m                    ESTIMATE
    warehouses 14 x 30 m, 6 m walls, 3 m roof rise, 0.5 m eaves; three 5 x 4 m doors on the seaward side   ESTIMATE
  Frame: the pier runs out to +x, +y up, meters; y=0 is the water surface (a ship's waterline, R2), not the ground.
  Leaves out: cranes, rails, bollards, fenders, the harbor floor.
  """
  import os
  import sys

  sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
  import kit  # noqa: E402

  FOOTPRINT_X_M = 100.0
  FOOTPRINT_Z_M = 40.0
  HEIGHT_M = 11.0
  BASE_Y_M = 0.0

  QUAY_X, QUAY_H = 40.0, 2.0
  PIER_X, PIER_Z, DECK_T = 60.0, 10.0, 0.3
  WALL, RISE = 6.0, 3.0

  out, opts = kit.cli_args()
  m = kit.Model('pier-and-warehouses')
  m.box('concrete', (-QUAY_X / 2, 0.0, 0.0), (QUAY_X, QUAY_H, FOOTPRINT_Z_M))
  m.box('timber', (PIER_X / 2, QUAY_H - DECK_T, 0.0), (PIER_X, DECK_T, PIER_Z))
  for i in range(10):
      for pz in (-4.5, 0.0, 4.5):
          m.box('timber', (4.0 + 6.0 * i, 0.0, pz), (0.4, QUAY_H - DECK_T, 0.4))
  for cx in (-30.0, -12.0):
      m.box('timber', (cx, QUAY_H, 0.0), (14.0, WALL, 30.0))
      m.gable_roof('steel', (cx, QUAY_H + WALL, 0.0), 14.0, 30.0, RISE, 0.5)
      for dz in (-8.0, 0.0, 8.0):
          m.box('dark', (cx + 7.05, QUAY_H, dz), (0.1, 4.0, 5.0))
  assert QUAY_X + PIER_X == FOOTPRINT_X_M and QUAY_H + WALL + RISE == HEIGHT_M, 'footprint and height'
  m.export(out)
  ```

- [ ] **Step 7: Candidate, preview, entry, build, register, check, commit.**
  ```bash
  npx tsx tools/models/blender/cli.ts pier-and-warehouses
  blender -b --factory-startup --python-exit-code 1 -P tools/models/blender/preview.py -- /tmp/r4-pier-front.png --glb content/models/candidates/pier-and-warehouses.glb --view front
  ```
  Expected: 4 nodes and about 500 triangles. Read the PNG.
  - Create the entry from the Global Constraints template, with `<dimensions>` = "a generic port pier and two warehouses; every figure is an ESTIMATE labeled in the script's header (no primary source found, searched <run date>)", or Task 1's citation. Build it.
  - Add `'pier-and-warehouses': { url: staticModelUrl('building', 'pier-and-warehouses') },`, the Library `model` line and the `ASSETS.md` row.
  - Delete `'pier-and-warehouses'` from `NOT_YET_DRAWN`, lower `CEILING` by one, and switch any Task 0 hit.
  - Run Step 4's two vitest commands with `pier-and-warehouses`, then tsc and eslint.
  ```bash
  git add tools/models/blender/pier-and-warehouses.py tools/models/entries/pier-and-warehouses.json content/buildings/pier-and-warehouses.glb src/render/scene/staticModels.ts content/library/pier-and-warehouses.json ASSETS.md tests/tools/models/buildingModels.test.ts tests/render/hangar/roster.test.ts
  git commit -m "R4: the pier and warehouses as a Blender model; off the allowlist"
  ```

---

### Task 10: The radio / radar station

**Files:**
- Create: `tools/models/blender/radio-radar-station.py`, `tools/models/entries/radio-radar-station.json`, `content/buildings/radio-radar-station.glb`
- Modify: `src/render/scene/staticModels.ts`, `content/library/radio-radar-station.json`, `ASSETS.md`, `tests/tools/models/buildingModels.test.ts`, `tests/render/hangar/roster.test.ts`

**Interfaces:**
- Consumes: `box`, `lattice_mast` and `strut` (Task 2).

- [ ] **Step 1: Failing.** Append `'radio-radar-station'` to `R4_BUILDINGS`, run the file, and expect FAIL.

- [ ] **Step 2: The script.** Create `tools/models/blender/radio-radar-station.py`:
  ```python
  # tools/models/blender/radio-radar-station.py
  """Radio / radar station: an equipment hut and a tapered lattice mast carrying a fixed antenna array.
  Original work, AGPL-3.0-or-later.

  Figures (read <run date>):
    pad 16 x 12 m, 0.3 m deep                                    ESTIMATE
    hut 6 x 8 m, 3.0 m walls, a 0.3 m roof slab with 0.3 m eaves  ESTIMATE
    mast 18 m: 3.0 m square at the foot, 1.0 m at the top, six panels, 0.12 m members   ESTIMATE
    array 6.0 m wide, 4.0 m tall, 0.3 m deep, facing +x, on a 0.5 m yoke   ESTIMATE: a generic fixed early-warning array
  Frame: the array faces +x, +y up, meters; the pad top is y=0.
  Leaves out: guy wires, the generator, the fence, the array's dipoles (one dark panel stands for them).
  """
  import os
  import sys

  sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
  import kit  # noqa: E402

  FOOTPRINT_X_M = 16.0
  FOOTPRINT_Z_M = 12.0
  HEIGHT_M = 22.0
  BASE_Y_M = -0.3

  MAST_X, MAST_H = 3.0, 18.0
  ARRAY_H = 4.0

  out, opts = kit.cli_args()
  m = kit.Model('radio-radar-station')
  m.box('concrete', (0.0, BASE_Y_M, 0.0), (FOOTPRINT_X_M, -BASE_Y_M, FOOTPRINT_Z_M))
  m.box('concrete', (-4.0, 0.0, 0.0), (6.0, 3.0, 8.0))
  m.box('concrete', (-4.0, 3.0, 0.0), (6.6, 0.3, 8.6))
  m.box('dark', (-0.975, 0.0, 0.0), (0.05, 2.0, 1.0))
  m.lattice_mast('steel', (MAST_X, 0.0, 0.0), 3.0, 1.0, MAST_H, 6, 0.12)
  m.box('steel', (MAST_X, MAST_H - 0.5, 0.0), (0.3, 0.5, 6.4))
  m.box('dark', (MAST_X, MAST_H, 0.0), (0.3, ARRAY_H, 6.0))
  m.strut('dark', (-1.0, 2.5, 0.0), (MAST_X - 1.4, 2.5, 0.0), 0.05)
  assert MAST_H + ARRAY_H == HEIGHT_M, 'HEIGHT_M is the array top'
  m.export(out)
  ```

- [ ] **Step 3: Candidate, preview, entry, build.**
  ```bash
  npx tsx tools/models/blender/cli.ts radio-radar-station
  blender -b --factory-startup --python-exit-code 1 -P tools/models/blender/preview.py -- /tmp/r4-radar-front.png --glb content/models/candidates/radio-radar-station.glb --view front
  ```
  Expected: 3 nodes and about 1,050 triangles. Read the PNG. The mast must read as a lattice, and the array must face the camera. Create the entry from the Global Constraints template, with `<dimensions>` = "a generic early-warning station; every figure is an ESTIMATE labeled in the script's header (no primary source found, searched <run date>)", or Task 1's citation. Then `npm run models:build -- radio-radar-station; echo "rc=$?"`.

- [ ] **Step 4: Register, name, credit, shrink, check, commit.**
  - Add `'radio-radar-station': { url: staticModelUrl('building', 'radio-radar-station') },`, the Library `model` line and the `ASSETS.md` row.
  - Delete `'radio-radar-station'` from `NOT_YET_DRAWN`, lower `CEILING` by one, and switch any Task 0 hit.
  ```bash
  npx vitest run tests/tools/models/buildingModels.test.ts tests/tools/models/outputs.test.ts tests/render/staticModels.test.ts tests/render/hangar --maxWorkers=2; echo "rc=$?"
  npx vitest run tests/tools/models/blenderEntries.test.ts -t "committed output radio-radar-station$" --maxWorkers=1; echo "rc=$?"
  npx tsc --noEmit; echo "rc=$?"
  npx eslint tests/tools/models/buildingModels.test.ts tests/render/hangar/roster.test.ts src/render/scene/staticModels.ts --max-warnings 0; echo "rc=$?"
  git add tools/models/blender/radio-radar-station.py tools/models/entries/radio-radar-station.json content/buildings/radio-radar-station.glb src/render/scene/staticModels.ts content/library/radio-radar-station.json ASSETS.md tests/tools/models/buildingModels.test.ts tests/render/hangar/roster.test.ts
  git commit -m "R4: the radio / radar station as a Blender model; off the allowlist"
  ```

---

### Task 11: The building roster is complete, as an assertion

**Files:**
- Modify: `tests/tools/models/buildingModels.test.ts` (one describe)
- Modify: `tests/render/hangar/roster.test.ts` (one test; the final list)
- Modify: `tests/render/hangar/models.test.ts` (one test)
- Modify: `docs/models.md` (§5's turret sentence; "Authoring in Blender")

**Interfaces:**
- Consumes: everything from Tasks 4-10.

- [ ] **Step 1: Write the assertions.**
  - `buildingModels.test.ts`: add the import `import { STATIC_MODELS } from '../../../src/render/scene/staticModels.js'` and `import { nodeHangarContent } from '../../render/hangar/content.js'`, then append:
    ```ts
    describe('the building roster is complete (R4)', () => {
      const library = nodeHangarContent().library.filter((e) => e.kind === 'building')
      it('every Library building names its own building model, and every registered building model is one', () => {
        for (const e of library) expect(e.model, e.id).toEqual({ kind: 'building', id: e.id })
        expect(Object.keys(STATIC_MODELS.building).sort()).toEqual(library.map((e) => e.id).sort())
      })
      it('R4 measured all of them but the hangar, which R1 measures', () => {
        expect([...R4_BUILDINGS].sort()).toEqual(library.map((e) => e.id).filter((id) => id !== 'hangar').sort())
      })
    })
    ```
  - `roster.test.ts`: inside the first describe, append:
    ```ts
      it('no Library building is left on it (R4)', () => {
        const kind = new Map(content.library.map((e) => [e.id, e.kind]))
        expect(NOT_YET_DRAWN.filter((id) => kind.get(id) === 'building')).toEqual([])
      })
    ```
    The list should now read `const NOT_YET_DRAWN = ['type97-chi-ha', 'willys-mb-jeep']` with `const CEILING = 2`. If Task 0 recorded a different start, it is that start minus the seven. Update the doc comment's last sentence to "R4 took the buildings off; R5 deletes both."
  - `models.test.ts`: in `describe("an entry's own model (R1)", …)`, after the hangar test, add:
    ```ts
      it('every Library building draws its own model through the display loader, and one with a spec keeps its figures (R4)', async () => {
        const buildings = buildCatalog(nodeHangarContent()).filter((e) => e.library.kind === 'building')
        expect(buildings).toHaveLength(10)
        for (const entry of buildings) {
          const seen: unknown[] = []
          await loadHangarModel(entry, undefined, undefined, undefined, async (ref) => { seen.push(ref); return instance().inst })
          expect(seen, entry.library.id).toEqual([{ kind: 'building', id: entry.library.id }])
        }
        for (const id of ['hangar', 'tower', 'aaa']) expect(byId(id).subject?.kind, id).toBe('building')
      })
    ```

- [ ] **Step 2: Run them.** They should pass, because Tasks 4-10 did the work. This step is the assertion that the work is done.
  ```bash
  npx vitest run tests/tools/models/buildingModels.test.ts tests/render/hangar --maxWorkers=2; echo "rc=$?"
  ```
  Expected: `rc=0`. Then mutation-check it: temporarily delete the `"model"` line from `content/library/revetment.json`. Both `every Library building names its own building model` and `exactly the allowlisted entries` must fail. Restore the line.

- [ ] **Step 3: `docs/models.md`.**
  - §5: replace "Turrets follow the Hangar spec's §9 convention, `Turret1`…`TurretN`, numbered bow to stern." with "Turrets follow the Hangar spec's §9 convention, `Turret1`…`TurretN`, numbered bow to stern; a building has no bow, so its turrets are numbered +x to -x, then -z to +z (R4)."
  - "Authoring in Blender": append:
    ```markdown
    A building (R4) takes its parts from the kit: `frustum`, `gable_roof`, `tank`, `sandbag_ring`, `strut`,
    `gun_barrel` and `lattice_mast`, all wound outward and checked by
    `tests/tools/models/blender/kitBuildings.test.ts`. One kit node is one draw call, so the building
    budget's 4 draw calls means at most four roles or named nodes, turrets included. A building script
    sets literal `FOOTPRINT_X_M`, `FOOTPRINT_Z_M`, `HEIGHT_M` and `BASE_Y_M`, which
    `tests/tools/models/buildingModels.test.ts` measures against the committed glb without Blender,
    along with its budget, its turret names and a check that no two paints z-fight. Its front faces +x;
    the hangar, which opens toward +z as the game's does, is the exception.
    ```

- [ ] **Step 4: Checks and commit.**
  ```bash
  npx tsc --noEmit; echo "rc=$?"
  npx eslint tests/tools/models/buildingModels.test.ts tests/render/hangar/roster.test.ts tests/render/hangar/models.test.ts --max-warnings 0; echo "rc=$?"
  git add tests/tools/models/buildingModels.test.ts tests/render/hangar/roster.test.ts tests/render/hangar/models.test.ts docs/models.md
  git commit -m "R4: done is an assertion: every Library building draws its own model, none left on the allowlist"
  ```

---

### Task 12: The Type 97 Chi-Ha, and the per-vehicle Tier 1 harness (R5)

**Files:**
- Create: `tools/models/entries/type97-chi-ha.json`
- Create: `content/vehicles/type97-chi-ha.glb` (built)
- Create: `tests/tools/models/vehicleModels.test.ts`
- Modify: `src/render/scene/staticModels.ts` (register the vehicle)
- Modify: `content/library/type97-chi-ha.json` (`model`)
- Modify: `tests/render/staticModels.test.ts` (the vehicle registered-list regex)
- Modify: `tests/render/hangar/roster.test.ts` (`NOT_YET_DRAWN`, `CEILING`)
- Modify: `tests/render/modelCredits.test.ts` (the pinned credit line)
- Modify: `ASSETS.md` (move the candidate row into the 3D-models table)

**Interfaces:**
- Consumes: `worldTriangles`, `Tri`, `Vec3` (Task 2, `tests/tools/models/buildingGeometry.ts`); `findNode`, `meshNodes`, `modelIO`, `onlyScene` (`tools/models/document.js`); `measureDocument` (`tools/models/measure.js`).
- Produces, in `vehicleModels.test.ts`, the tables Task 13 extends:
  - `CITED: Record<string, { lengthM: number; widthM: number; heightM: number; heightTol: number; source: string }>`
  - `TURRETS: Record<string, string[]>`
  - `FORWARD: Record<string, (doc: Document) => { ok: boolean; detail: string }>`

**What was measured when this plan was written (2026-09-27, from the staged file):** `type97-chi-ha.glb`, sha256 `def357b816124c21…`, 3,969 triangles, 4 draw calls, 2 materials (`Type_97`, `Track`), four 1024-px PNG textures. It is already in meters and upright (+y). Bounds x −1.157..1.157, y 0.000..2.384, z −2.812..2.708: length 5.520 along z, width 2.314, height 2.384. Nodes: `Type 97 Hull_1_3` (3,169), `Type 97 Turret_1_4` (258), `Type 97 Barrel_1_5` (94), `Type 97 Track_1_6` (448). The barrel runs z −1.814..−1.043, ahead of the turret's z center (−0.167), so **the nose is −z**. The turret is offset to +x, which is the right-hand side for a −z forward, as on the real Chi-Ha. A `components` box `[-0.45, 1.56, -1.85]..[0.99, 2.40, 0.86]` takes exactly the turret's and barrel's 10 shells, 352 triangles, and nothing of the hull.

**Cited (English Wikipedia, "Type 97 Chi-Ha medium tank", infobox citing Tomczyk 2007 p. 19, raw wikitext read 2026-09-27):** length 5.50 m, width 2.33 m, height 2.21 m. Fitted to 5.50 m the download is 2.306 m wide (−1.0%) and 2.375 m tall (+7.5%). Ruling V2 below explains the height tolerance.

**Rulings this task makes** (record each in the ledger as `Ruling: V<n>`):
- **V1. Vehicle draw-call budget 8.** Spec §4.4 gives vehicles 1 MB and 20k triangles and no draw-call figure. Both downloads measure 3 draws after the build; 8 leaves room for a split part without inviting a per-part mesh.
- **V2. Width 6%; length and height per row.** A vehicle fitted by its length holds length to 1%. Width checks the variant and the fit axis. Height is the loosest: the Chi-Ha measures 2.375 m at the cited length against 2.21 m (+7.5%), and all of the excess is in the turret node's top (the turret's max y, 2.384 in source units, is the model's). 8% still reads as the same vehicle; a wrong up axis would read 20% or more off.
- **V3. A vehicle stands on y = 0 and is centered on its footprint**, like a building (spec §4.2's frame), because the Hangar stands a display model on its own origin (`src/render/hangar/models.ts`, `displayModel`). Its turret, if separable, is `Turret1`, with the gun in the turret node and no pivot, as R2 and R4 did; the pivots are H3's.

- [ ] **Step 1: Write the failing harness.** Create `tests/tools/models/vehicleModels.test.ts`:
  ```ts
  // tests/tools/models/vehicleModels.test.ts
  /**
   * Every vehicle model (R5) measured against its cited size, its budget and its frame, from the
   * committed glb with no Blender. The two are Sketchfab downloads fitted by the model pipeline;
   * the sim has no vehicle, so the citation, not a spec, is authoritative (model-roster spec §7).
   */
  import { describe, expect, it } from 'vitest'
  import { readFileSync, statSync } from 'node:fs'
  import { getBounds } from '@gltf-transform/functions'
  import type { Document } from '@gltf-transform/core'
  import { loadModelEntries, type ModelEntry } from '../../../tools/models/manifest.js'
  import { findNode, meshNodes, modelIO, onlyScene } from '../../../tools/models/document.js'
  import { measureDocument } from '../../../tools/models/measure.js'
  import { worldTriangles, type Vec3 } from './buildingGeometry.js'

  /** Spec §4.4, plus ruling V1's draw calls. Raised only with a measured reason, here and in the ledger. */
  const VEHICLE_BUDGET = { maxBytes: 1_000_000, maxTriangles: 20_000, maxDrawCalls: 8 } as const

  interface Cited { readonly lengthM: number; readonly lengthTol: number; readonly widthM: number; readonly heightM: number; readonly heightTol: number; readonly source: string }
  /** Rulings V2 and V4: length per row (1% where the fit sets it), width 6%, height per row. */
  const CITED: Readonly<Record<string, Cited>> = {
    'type97-chi-ha': { lengthM: 5.5, lengthTol: 0.01, widthM: 2.33, heightM: 2.21, heightTol: 0.08, source: "English Wikipedia 'Type 97 Chi-Ha medium tank', infobox (Tomczyk 2007, p. 19): length 5.50 m, width 2.33 m, height 2.21 m, read 2026-09-27. The download measures +7.5% tall at the cited length, all of it in the turret node's top (R5 plan, V2)" },
  }

  /** H3's turret names (Hangar spec §9); a vehicle's are numbered like a building's, +x to -x (R4 ruling). */
  const TURRETS: Readonly<Record<string, readonly string[]>> = { 'type97-chi-ha': ['Turret1'] }

  const horizontal = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2])
  const vertices = (doc: Document, node: string): Vec3[] => worldTriangles(findNode(doc, node)).flat()
  const centroid = (vs: readonly Vec3[]): Vec3 => {
    const c: Vec3 = [0, 0, 0]
    for (const v of vs) for (let i = 0; i < 3; i++) c[i] += v[i]! / vs.length
    return c
  }

  /** Each vehicle's own proof that its nose is at +x; a model turned 180° fails it. */
  const FORWARD: Readonly<Record<string, (doc: Document) => { ok: boolean; detail: string }>> = {
    // The gun: the Turret1 vertex farthest from the turret's own vertical axis is the muzzle.
    'type97-chi-ha': (doc) => {
      const vs = vertices(doc, 'Turret1')
      const c = centroid(vs)
      const muzzle = vs.reduce((m, v) => (horizontal(v, c) > horizontal(m, c) ? v : m))
      return { ok: muzzle[0] > c[0] + 0.5, detail: `muzzle x ${muzzle[0].toFixed(3)}, turret centroid x ${c[0].toFixed(3)}` }
    },
  }

  const entries = loadModelEntries()
  const vehicles = entries.filter((e) => e.output.startsWith('content/vehicles/'))
  const read = async (e: ModelEntry): Promise<Document> => modelIO().readBinary(new Uint8Array(readFileSync(e.output)))

  describe('the vehicle rows', () => {
    it('every vehicle entry has a cited row and a forward proof, and every row has an entry', () => {
      expect(vehicles.map((e) => e.id).sort()).toEqual(Object.keys(CITED).sort())
      expect(Object.keys(FORWARD).sort()).toEqual(Object.keys(CITED).sort())
    })
    it('every row cites a source with a read date', () => {
      for (const [id, c] of Object.entries(CITED)) expect(c.source, id).toMatch(/read \d{4}-\d{2}-\d{2}/)
    })
  })

  describe.each(vehicles.map((e) => [e.id, e] as const))('vehicle %s (R5)', (id, e) => {
    it('measures its cited length and height (its row) and width (6%), nose along x', async () => {
      const c = CITED[id]!
      const b = getBounds(onlyScene(await read(e)))
      const check = (got: number, want: number, tol: number, label: string): void => {
        expect(Math.abs(got - want) / want, `${id} ${label}: measured ${got.toFixed(3)} m, cited ${want}`).toBeLessThanOrEqual(tol)
      }
      check(b.max[0] - b.min[0], c.lengthM, c.lengthTol, 'length')
      check(b.max[2] - b.min[2], c.widthM, 0.06, 'width')
      check(b.max[1] - b.min[1], c.heightM, c.heightTol, 'height')
    })

    it('stands on y = 0, centered on its footprint (V3)', async () => {
      const b = getBounds(onlyScene(await read(e)))
      expect(b.min[1], `${id} ground`).toBeCloseTo(0, 2)
      expect(Math.abs(b.min[0] + b.max[0]) / 2, `${id} center x`).toBeLessThanOrEqual(0.05 * (b.max[0] - b.min[0]))
      expect(Math.abs(b.min[2] + b.max[2]) / 2, `${id} center z`).toBeLessThanOrEqual(0.05 * (b.max[2] - b.min[2]))
    })

    it('faces +x', async () => {
      const r = FORWARD[id]!(await read(e))
      expect(r.ok, `${id}: ${r.detail}`).toBe(true)
    })

    it('is inside the vehicle budget, measured, and its entry does not budget above it', async () => {
      const m = measureDocument(await read(e))
      expect(e.budget.maxBytes, id).toBeLessThanOrEqual(VEHICLE_BUDGET.maxBytes)
      expect(e.budget.maxTriangles, id).toBeLessThanOrEqual(VEHICLE_BUDGET.maxTriangles)
      expect(e.budget.maxDrawCalls, id).toBeLessThanOrEqual(VEHICLE_BUDGET.maxDrawCalls)
      expect(statSync(e.output).size).toBeLessThanOrEqual(e.budget.maxBytes)
      expect(m.triangles).toBeLessThanOrEqual(e.budget.maxTriangles)
      expect(m.drawCalls).toBeLessThanOrEqual(e.budget.maxDrawCalls)
    })

    it('names exactly its turrets', async () => {
      const names = meshNodes(await read(e)).map((n) => n.getName()).filter((n) => /^Turret\d+$/.test(n))
      expect(names.sort()).toEqual([...(TURRETS[id] ?? [])].sort())
    })
  })
  ```
  Check the helper names against Task 2's `buildingGeometry.ts` and `tools/models/document.ts` before running (`grep -n "export" tests/tools/models/buildingGeometry.ts tools/models/document.ts`). If one is named differently, use the real name and record it.

- [ ] **Step 2: Run it and see it fail.**
  ```bash
  npx vitest run tests/tools/models/vehicleModels.test.ts --maxWorkers=2; echo "rc=$?"
  ```
  Expected: FAIL on `every vehicle entry has a cited row`: `[]` does not equal `['type97-chi-ha']`.

- [ ] **Step 3: Stage the download and check its license.**
  ```bash
  mkdir -p tools/models/cache
  cp /home/mark/projects/ww2airsim/content/models/candidates/type97-chi-ha.glb tools/models/cache/type97-chi-ha.glb
  sha256sum tools/models/cache/type97-chi-ha.glb | cut -c1-16
  curl -sS "https://api.sketchfab.com/v3/models/d3568f32ec4440848e243e4b893a8ba6" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['uid'], d['user']['username'], (d.get('license') or {}).get('slug'), d['viewerUrl'], d['isDownloadable'])"
  ```
  Expected: `def357b816124c21`, then `d3568f32ec4440848e243e4b893a8ba6 snrnsrk5 by https://sketchfab.com/3d-models/type-97-chi-ha-d3568f32ec4440848e243e4b893a8ba6 True`. A different hash means the candidate changed: re-measure everything in this task's "measured" paragraph before going on. A different license is a stop: record it, leave the id on the allowlist, and skip to Task 13.

- [ ] **Step 4: Re-measure.** `npm run models:inspect -- tools/models/cache/type97-chi-ha.glb > .superpowers/sdd/2026-09-27-r4-r5-roster/inspect-type97-chi-ha.txt`. Read it. Confirm the bounds and the four nodes above. If any differ, recompute the origin (the bounds' x and z centers, y 0) and the turret box, and record the new values.

- [ ] **Step 5: The entry.** Create `tools/models/entries/type97-chi-ha.json`. Every coordinate is in the source frame:
  ```json
  {
    "id": "type97-chi-ha",
    "input": "tools/models/cache/type97-chi-ha.glb",
    "output": "content/vehicles/type97-chi-ha.glb",
    "source": {
      "url": "https://sketchfab.com/3d-models/type-97-chi-ha-d3568f32ec4440848e243e4b893a8ba6",
      "uid": "d3568f32ec4440848e243e4b893a8ba6",
      "author": "snrnsrk5",
      "license": "CC-BY-4.0"
    },
    "normalize": { "forward": "-z", "up": "+y", "origin": [0, 0, -0.052], "fit": { "extent": "length", "meters": 5.5 } },
    "split": [
      { "name": "Turret1", "select": "components", "boxMin": [-0.45, 1.56, -1.85], "boxMax": [0.99, 2.40, 0.86] }
    ],
    "textures": { "maxSize": 1024, "format": "webp" },
    "budget": { "maxBytes": 1000000, "maxTriangles": 20000, "maxDrawCalls": 8 }
  }
  ```

- [ ] **Step 6: Build, and look at it.**
  ```bash
  npm run models:build -- type97-chi-ha; echo "rc=$?"
  blender -b --factory-startup --python-exit-code 1 -P tools/models/blender/preview.py -- .superpowers/sdd/2026-09-27-r4-r5-roster/type97-chi-ha-front.png --glb content/vehicles/type97-chi-ha.glb --view front
  blender -b --factory-startup --python-exit-code 1 -P tools/models/blender/preview.py -- .superpowers/sdd/2026-09-27-r4-r5-roster/type97-chi-ha-raw-front.png --glb tools/models/cache/type97-chi-ha.glb --view front
  ```
  One Blender command at a time. Record the `built …` line: bytes, triangles (expected 3,969: nothing removed), draw calls (expected 3: hull, track, `Turret1`). **Read both PNGs.** The gun must face the camera in the built front view, the tracks must touch the ground plane, and the silhouette must match the raw render. If the build is over 1,000,000 bytes, set `textures.maxSize` to 512, rebuild, and record `Ruling:` with both byte counts.

- [ ] **Step 7: Register, link, credit.**
  - `src/render/scene/staticModels.ts`: in `STATIC_MODELS.vehicle`, replace `{}` with:
    ```ts
      vehicle: {
        'type97-chi-ha': { url: staticModelUrl('vehicle', 'type97-chi-ha') },
      },
    ```
  - `content/library/type97-chi-ha.json`: after the line `"side": "japanese",` add:
    ```json
      "model": { "kind": "vehicle", "id": "type97-chi-ha" },
    ```
  - `tests/render/staticModels.test.ts`: the vehicle registry is no longer empty. Replace
    ```ts
        expect(() => staticModelUrlFor('vehicle', 'constructor')).toThrow(/no vehicle model "constructor" \(registered: none\)/)
    ```
    with
    ```ts
        expect(() => staticModelUrlFor('vehicle', 'constructor')).toThrow(/no vehicle model "constructor" \(registered: [a-z0-9, -]*\btype97-chi-ha\b[a-z0-9, -]*\)/)
    ```
  - `tests/render/hangar/roster.test.ts`: delete `'type97-chi-ha'` from `NOT_YET_DRAWN`, and set `CEILING` to 1 (Task 0's start value minus the seven buildings minus one).
  - `tests/render/modelCredits.test.ts`: in the test `reads, after R3, with each author named once …`, rename it `reads, after R5's Chi-Ha, …` and pin:
    ```ts
        expect(modelCreditsText(MODEL_CREDITS)).toBe('Models: SavinienBerault, helijah (1 2), KTKloss (1 2 3 4), manilov.ap (1 2 3), JZHU, Jec_Games, everlasting17th, AlanTinka, snrnsrk5, rojatsu (CC BY 4.0)')
    ```
    `snrnsrk5` lands between AlanTinka and rojatsu because `type97-chi-ha.json` sorts after `type-b-maru.json` (`-` sorts before `9`) and before `wildcat.json`. The plan computed this string with the real `modelCredits` on 2026-09-27; if the test prints a different one, the entry-file order changed: read the printed string, confirm it is the order `modelCredits` defines, and record it.
  - `ASSETS.md`: delete the `type97-chi-ha.glb` row from "Candidate models", and add to the 3D-models table, after the last `content/ships/` row:
    ```
    | `content/vehicles/type97-chi-ha.glb` | https://sketchfab.com/3d-models/type-97-chi-ha-d3568f32ec4440848e243e4b893a8ba6 | snrnsrk5 | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required |
    ```

- [ ] **Step 8: Run the Tier 1 checks.**
  ```bash
  npx vitest run tests/tools/models/vehicleModels.test.ts tests/tools/models/outputs.test.ts tests/tools/models/manifest.test.ts tests/render/staticModels.test.ts tests/render/modelCredits.test.ts tests/render/hangar tests/build/dist.test.ts --maxWorkers=2; echo "rc=$?"
  ```
  Expected: `rc=0`. Then **mutation-check the forward proof**: set `"forward": "+z"` in the entry, rebuild, and run `vehicleModels.test.ts`; `faces +x` must fail. Restore `"-z"`, rebuild, and confirm `git status --short content/vehicles` shows the same glb as before the mutation (`sha256sum` matches the Step 6 build).

- [ ] **Step 9: Checks and commit.**
  ```bash
  npx tsc --noEmit; echo "rc=$?"
  npx eslint tests/tools/models/vehicleModels.test.ts tests/render/staticModels.test.ts tests/render/modelCredits.test.ts tests/render/hangar/roster.test.ts src/render/scene/staticModels.ts --max-warnings 0; echo "rc=$?"
  git add tools/models/entries/type97-chi-ha.json content/vehicles/type97-chi-ha.glb tests/tools/models/vehicleModels.test.ts src/render/scene/staticModels.ts content/library/type97-chi-ha.json tests/render/staticModels.test.ts tests/render/hangar/roster.test.ts tests/render/modelCredits.test.ts ASSETS.md
  git commit -m "R5: the Type 97 Chi-Ha, and the per-vehicle Tier 1 harness"
  ```

---

### Task 13: The Willys MB jeep, the top-down one of the two in the download (R5)

**Files:**
- Create: `tools/models/entries/willys-mb-jeep.json`
- Create: `content/vehicles/willys-mb-jeep.glb` (built)
- Modify: `tests/tools/models/vehicleModels.test.ts` (`CITED`, `FORWARD`)
- Modify: `src/render/scene/staticModels.ts`, `content/library/willys-mb-jeep.json`, `tests/render/hangar/roster.test.ts`, `tests/render/modelCredits.test.ts`, `ASSETS.md`

**Interfaces:**
- Consumes: Task 12's harness tables.
- Produces: nothing new; the vehicle roster is complete.

**What was measured when this plan was written (2026-09-27, from the staged file).** `willys-mb-jeep.glb`, sha256 `79ad5e0037ce2598…`, 19,099 triangles, 3 draw calls, 3 materials (`1.Jeep`, `Tires`, `Roof_and_Gear`), one mesh node per material. **The file holds two jeeps**, each of whose parts are spread across those three shared nodes:
- They stand side by side along **x**, and each jeep's length runs along **z**. Every connected shell lies on one side of a clear gap from x −0.171 to x 0.332; no shell crosses it (the shell probe below).
- **x < 0 is the top-down jeep** (Mark's choice): 130 shells, 9,432 triangles, bounds x −1.770..−0.171, y 0.043..1.260, z −1.452..1.531. Its highest point, 1.260, is the spare tire's top.
- x > 0 is the canvas-top jeep: 128 shells, 9,667 triangles, up to y 1.508 (the canvas top).
- The top-down jeep's spare tire (a 464-triangle `Tires` shell centered at z −1.345, axle along z) is at **−z, so its nose is +z**.
- It is **turned about +y by roughly 5.7°**. Its road wheels' centers (x, z): rear (−0.460, −0.811) and (−1.602, −0.698); front (−0.323, 0.956) and (−1.380, 1.062). Both axle lines lean 5.65° and 5.73° from x.
- Its **wheelbase is 1.773 source units** (rear-axle midpoint to front-axle midpoint), and its wheels are 0.63 across. The cited wheelbase is 80 in (2.032 m): scale 1.146, which makes the wheels 0.72 m, a 6.00-16 tire. Overall length in the download's own units is not a safe fit: the source is in no known unit, and a length fit would count whatever sticks out at either end.

**Cited (English Wikipedia, "Willys MB", raw wikitext read 2026-09-27):** infobox length 132 in (3.35 m), width 62 in (1.57 m), height "overall, top up: 69¾ in … reducible to 52 in" (1.32 m, the top-down figure used here); the article body gives the 80 in wheelbase (the Ford GP paragraph: "a car with a wheelbase of 80 in").

**Rulings this task makes:**
- **V4. The jeep is fitted by its wheelbase, and its length is checked to 4%**, the one dimension the download fixes unambiguously (axle centers), converted to the `length` fit the manifest supports: `meters = L × 2.032 / W`, where `L` is the squared model's length along the forward axis and `W` its measured wheelbase, both in source units after the yaw. The Tier 1 row still checks length, width and height against the citation, so a wrong wheelbase fails there.
- **V5. The canvas-top jeep is removed with one `components` split named `CanvasJeep`, then `remove`d** (the build's split-then-remove order, `tools/models/build.ts:73-80`). The split must take all 128 of its shells, 9,667 triangles, and none of the top-down jeep's.

- [ ] **Step 1: Stage the download and check its license.**
  ```bash
  mkdir -p tools/models/cache
  cp /home/mark/projects/ww2airsim/content/models/candidates/willys-mb-jeep.glb tools/models/cache/willys-mb-jeep.glb
  sha256sum tools/models/cache/willys-mb-jeep.glb | cut -c1-16
  curl -sS "https://api.sketchfab.com/v3/models/3b005266a1514f7bb7370c86168aba98" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['uid'], d['user']['username'], (d.get('license') or {}).get('slug'), d['viewerUrl'], d['isDownloadable'])"
  ```
  Expected: `79ad5e0037ce2598`, then `3b005266a1514f7bb7370c86168aba98 MattyNL by https://sketchfab.com/3d-models/willys-mb-jeep-red-orchestra-darkest-hour-3b005266a1514f7bb7370c86168aba98 True`. A different license is a stop: record it, leave the id on the allowlist, and go to Task 14, which then keeps the list at one entry instead of deleting it (and says so in the handoff).

- [ ] **Step 2: The shell probe** (scratch, never committed). Create `.superpowers/sdd/2026-09-27-r4-r5-roster/shells.mts`:
  ```ts
  // Every connected shell (triangles sharing a bit-identical POSITION, the way split.ts's
  // `components` joins them) with its material, triangle count and world bounds.
  import { NodeIO } from '@gltf-transform/core'
  const doc = await new NodeIO().read(process.argv[2]!)
  const yaw = (Number(process.argv[3] ?? 0) * Math.PI) / 180
  const turn = (x: number, z: number): [number, number] => [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)]
  const rows: { mat: string; tris: number; min: number[]; max: number[] }[] = []
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue
    const m = node.getWorldMatrix()
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION')!, idx = p.getIndices()!
      const parent: number[] = [], key = new Map<string, number>()
      const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]! } return i }
      const id = (v: number): number => { const k = pos.getElement(v, [0, 0, 0]).join(','); let i = key.get(k); if (i === undefined) { i = parent.length; parent.push(i); key.set(k, i) } return i }
      const tris = idx.getCount() / 3
      for (let t = 0; t < tris; t++) { const a = find(id(idx.getScalar(3 * t))); for (const k of [1, 2]) { const b = find(id(idx.getScalar(3 * t + k))); if (a !== b) parent[b] = a } }
      const shells = new Map<number, { tris: number; min: number[]; max: number[] }>()
      for (let t = 0; t < tris; t++) {
        const root = find(id(idx.getScalar(3 * t)))
        const s = shells.get(root) ?? { tris: 0, min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] }; shells.set(root, s); s.tris++
        for (const k of [0, 1, 2]) {
          const v = pos.getElement(idx.getScalar(3 * t + k), [0, 0, 0])
          const w = [0, 1, 2].map((a) => m[a]! * v[0]! + m[4 + a]! * v[1]! + m[8 + a]! * v[2]! + m[12 + a]!)
          const [x, z] = turn(w[0]!, w[2]!)
          for (const [a, val] of [[0, x], [1, w[1]!], [2, z]] as const) { s.min[a] = Math.min(s.min[a]!, val); s.max[a] = Math.max(s.max[a]!, val) }
        }
      }
      for (const s of shells.values()) rows.push({ mat: p.getMaterial()?.getName() ?? '?', ...s })
    }
  }
  const f = (v: number[]): string => v.map((x) => x.toFixed(3)).join(',')
  for (const r of rows) console.log(r.mat.padEnd(14), String(r.tris).padStart(5), 'min', f(r.min), 'max', f(r.max))
  console.log('shells', rows.length)
  ```
  Run it unturned: `npx tsx .superpowers/sdd/2026-09-27-r4-r5-roster/shells.mts tools/models/cache/willys-mb-jeep.glb > .superpowers/sdd/2026-09-27-r4-r5-roster/jeep-shells.txt`. Confirm 258 shells, and that none spans x −0.171..0.332. Record both jeeps' shell counts and triangle totals.

  The sign convention of `turn` must match `normalize.yawDeg`'s. Check it once against `npm run models:inspect -- tools/models/cache/willys-mb-jeep.glb --yaw 10`: the whole-model bounds the probe prints with argument `10` (take the min and max over all rows) must equal inspect's to 3 decimals. If they match with `-10` instead, flip `yaw`'s sign in the probe and record it.

- [ ] **Step 3: The yaw.** Find the `normalize.yawDeg` that squares the top-down jeep: the two rear road-wheel centers get equal z-extent midlines along the new x axis, which means equal **forward** coordinates after the turn. Road wheels are the four 412-triangle `Tires` shells with x < 0. Run the probe with candidate yaws (start from ±5.7) until the two rear wheels' z centers agree within 0.01 and the two front wheels' agree within 0.01. Record the yaw, and the four wheel centers at that yaw. The source's nose is +z, so `normalize.forward` is `"+z"`; the yaw only squares it.

  Also confirm the gap survives the turn: at the chosen yaw, find the x value that separates every top-down shell from every canvas-top shell. A shell is top-down if its unturned bounds had max x ≤ −0.171. If no single separating value exists at that yaw, the split box in Step 4 is built from the canvas-top shells' own union bounds instead of a half-space, and every top-down shell must still fall outside it. Record which.

- [ ] **Step 4: The fit, the origin and the split, in the turned frame** (the entry's coordinates are in the frame after `yawDeg`, `tools/models/manifest.ts:133-134`):
  - `W`: the distance between the rear-axle midpoint and the front-axle midpoint, from Step 3's four centers.
  - `L`: the top-down jeep's extent along z in the turned frame (min over its shells to max).
  - `fit.meters` = `L × 2.032 / W`, to 3 decimals. Record `W`, `L` and the result. Expected near 3.4: a result outside 3.1..3.7 means a shell set is wrong, so stop and re-read Step 2.
  - `origin`: the top-down jeep's turned bounds centers in x and z, with y 0.043 (its tire bottoms), so it stands on y = 0 after normalize.
  - The `CanvasJeep` split box: x from the separating value to 2.0, y from −1 to 3, z from −2.0 to 2.0 (a half-space in practice), or Step 3's union box. **Verify it before building**: run the probe at the chosen yaw and count the shells whose whole bounds lie inside the box. It must be exactly the canvas-top jeep's 128 shells and 9,667 triangles.

- [ ] **Step 5: The Tier 1 row.** In `tests/tools/models/vehicleModels.test.ts`, add to `CITED`:
  ```ts
    'willys-mb-jeep': { lengthM: 3.35, lengthTol: 0.04, widthM: 1.57, heightM: 1.32, heightTol: 0.08, source: "English Wikipedia 'Willys MB', infobox: length 132 in (3.35 m), width 62 in (1.57 m), height reducible to 52 in (1.32 m, top down); the article's 80 in (2.032 m) wheelbase is the fit (R5 plan, V4), read 2026-09-27" },
  ```
  and to `FORWARD`:
  ```ts
    // The spare tire rides on the rear panel, higher than any road wheel: the highest Tires vertex is aft.
    'willys-mb-jeep': (doc) => {
      const tires = meshNodes(doc).filter((n) => n.getMesh()!.listPrimitives().some((p) => p.getMaterial()?.getName() === 'Tires'))
      const top = tires.flatMap((n) => worldTriangles(n).flat()).reduce((m, v) => (v[1] > m[1] ? v : m))
      return { ok: top[0] < 0, detail: `highest tire vertex at x ${top[0].toFixed(3)}, y ${top[1].toFixed(3)}` }
    },
  ```
  The jeep's length is held to 4%, not 1%, because the fit is its wheelbase (V4): length is then a check of the download's proportions, as R3's P10 used length for its span-fitted aircraft. The plan's own estimate is 3.38 m (+0.9%). Past 4% is a finding, not a tolerance to widen: record the measured length and the wheelbase, and stop the jeep there (Step 1's stop path) rather than ship a misproportioned model.

  Run `npx vitest run tests/tools/models/vehicleModels.test.ts --maxWorkers=2; echo "rc=$?"`. Expected: FAIL, `every vehicle entry has a cited row` (no jeep entry yet).

- [ ] **Step 6: The entry.** Create `tools/models/entries/willys-mb-jeep.json` with Steps 3-4's values in the marked fields:
  ```json
  {
    "id": "willys-mb-jeep",
    "input": "tools/models/cache/willys-mb-jeep.glb",
    "output": "content/vehicles/willys-mb-jeep.glb",
    "source": {
      "url": "https://sketchfab.com/3d-models/willys-mb-jeep-red-orchestra-darkest-hour-3b005266a1514f7bb7370c86168aba98",
      "uid": "3b005266a1514f7bb7370c86168aba98",
      "author": "MattyNL",
      "license": "CC-BY-4.0"
    },
    "normalize": { "forward": "+z", "up": "+y", "yawDeg": <Step 3>, "origin": [<Step 4 x>, 0.043, <Step 4 z>], "fit": { "extent": "length", "meters": <Step 4> } },
    "split": [
      { "name": "CanvasJeep", "select": "components", "boxMin": [<Step 4>], "boxMax": [<Step 4>] }
    ],
    "remove": ["CanvasJeep"],
    "textures": { "maxSize": 1024, "format": "webp" },
    "budget": { "maxBytes": 1000000, "maxTriangles": 20000, "maxDrawCalls": 8 }
  }
  ```

- [ ] **Step 7: Build, and look at it.**
  ```bash
  npm run models:build -- willys-mb-jeep; echo "rc=$?"
  blender -b --factory-startup --python-exit-code 1 -P tools/models/blender/preview.py -- .superpowers/sdd/2026-09-27-r4-r5-roster/willys-mb-jeep-front.png --glb content/vehicles/willys-mb-jeep.glb --view front
  blender -b --factory-startup --python-exit-code 1 -P tools/models/blender/preview.py -- .superpowers/sdd/2026-09-27-r4-r5-roster/willys-mb-jeep-below.png --glb content/vehicles/willys-mb-jeep.glb --view below
  ```
  One Blender command at a time. Record the `built …` line. Expected: 9,432 triangles (the top-down jeep, nothing else) and 3 draw calls. **Read both PNGs**: one jeep, grille toward the camera in the front view, the windshield folded, no canvas top, no floating part of the other jeep, and four wheels square to the view in the below view. Over 1,000,000 bytes: `textures.maxSize` 512, rebuild, `Ruling:` with both counts.

- [ ] **Step 8: Register, link, credit.**
  - `src/render/scene/staticModels.ts`, in `STATIC_MODELS.vehicle`, after the Chi-Ha:
    ```ts
        'willys-mb-jeep': { url: staticModelUrl('vehicle', 'willys-mb-jeep') },
    ```
  - `content/library/willys-mb-jeep.json`: after `"side": "allied",` add `"model": { "kind": "vehicle", "id": "willys-mb-jeep" },`.
  - `tests/render/hangar/roster.test.ts`: delete `'willys-mb-jeep'`; `NOT_YET_DRAWN` is now `[]` and `CEILING` is `0`. Task 14 deletes both.
  - `tests/render/modelCredits.test.ts`: rename the pinned test `reads, after R5, …` and pin:
    ```ts
        expect(modelCreditsText(MODEL_CREDITS)).toBe('Models: SavinienBerault, helijah (1 2), KTKloss (1 2 3 4), manilov.ap (1 2 3), JZHU, Jec_Games, everlasting17th, AlanTinka, snrnsrk5, rojatsu, MattyNL (CC BY 4.0)')
    ```
    (computed with the real `modelCredits` on 2026-09-27: `willys-mb-jeep.json` sorts after `wildcat.json`).
  - `ASSETS.md`: delete the jeep's "Candidate models" row, and add after the Chi-Ha's row:
    ```
    | `content/vehicles/willys-mb-jeep.glb` | https://sketchfab.com/3d-models/willys-mb-jeep-red-orchestra-darkest-hour-3b005266a1514f7bb7370c86168aba98 | MattyNL | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required |
    ```
  - `ASSETS.md`, below the 3D-models table after R3's aircraft paragraph: one paragraph for both vehicles in R3's style. Every sentence is a measured fact with the date: each download's triangles before and after (3,969 → the build's count; 19,099 → 9,432), what the build removed (the Chi-Ha: nothing; the jeep: the canvas-top jeep, 9,667 triangles), the jeep's yaw and wheelbase fit, and the Chi-Ha's `Turret1`.

- [ ] **Step 9: Test, mutation-check, commit.**
  ```bash
  npx vitest run tests/tools/models/vehicleModels.test.ts tests/tools/models/outputs.test.ts tests/render/staticModels.test.ts tests/render/modelCredits.test.ts tests/render/hangar tests/build/dist.test.ts --maxWorkers=2; echo "rc=$?"
  ```
  Expected: `rc=0`. Mutation-check the jeep's forward proof: set `"forward": "-z"`, rebuild, and `faces +x` must fail; restore `"+z"`, rebuild, and confirm the glb's `sha256sum` equals Step 7's. Then:
  ```bash
  npx tsc --noEmit; echo "rc=$?"
  npx eslint tests/tools/models/vehicleModels.test.ts tests/render/modelCredits.test.ts tests/render/hangar/roster.test.ts src/render/scene/staticModels.ts --max-warnings 0; echo "rc=$?"
  git add tools/models/entries/willys-mb-jeep.json content/vehicles/willys-mb-jeep.glb tests/tools/models/vehicleModels.test.ts src/render/scene/staticModels.ts content/library/willys-mb-jeep.json tests/render/hangar/roster.test.ts tests/render/modelCredits.test.ts ASSETS.md
  git commit -m "R5: the Willys MB jeep (the top-down one; the canvas-top jeep removed), fitted by its wheelbase"
  ```

---

### Task 14: The roster is done, as an assertion; the allowlist is deleted (R5)

**Files:**
- Modify: `tests/render/hangar/roster.test.ts` (delete the list; assert none remain)
- Modify: `tests/render/hangar/models.test.ts` (`"Not yet in service" loads nothing` needs its own entry)
- Modify: `tests/e2e/hangar.spec.ts` (check 12)
- Modify: `docs/models.md` (§7 vehicles, §9's check list)

**Interfaces:**
- Consumes: Tasks 4-13.

- [ ] **Step 1: The assertion.** In `tests/render/hangar/roster.test.ts`:
  - Delete `NOT_YET_DRAWN`, `CEILING` and their doc comment.
  - Replace the describe `the roster is done when this list is empty (model-roster spec §1)` and its two tests (and R4's `no Library building is left on it` test) with:
    ```ts
    describe('the roster is done: every Library entry is drawn (model-roster spec §1, R5)', () => {
      it('the Hangar can draw every entry in the Library', () => {
        expect(catalog.filter((e) => !drawable(e)).map((e) => e.library.id)).toEqual([])
      })

      it('every building and vehicle names its own model', () => {
        for (const e of content.library.filter((x) => x.kind === 'building' || x.kind === 'vehicle')) {
          expect(e.model, e.id).toEqual({ kind: e.kind, id: e.id })
        }
      })
    })
    ```
  - Update the file's top comment: the list was deleted by R5 on `<run date>`; the test now asserts that nothing is undrawn, so a new Library entry must arrive with its model.

- [ ] **Step 2: `models.test.ts`'s "Not yet in service" case.** It picks the first catalog entry with no spec and no model; after Task 13 there is none, so `find` returns `undefined` and the test throws. Give it its own entry, as `catalog.test.ts` already does with `test-undrawn`. Replace the test with:
  ```ts
    it('"Not yet in service" loads nothing', async () => {
      // No shipped entry is undrawn since R5, so the case is a copy of the jeep with its model removed.
      const c = nodeHangarContent()
      const bare = { ...c.library.find((e) => e.id === 'willys-mb-jeep')!, id: 'test-undrawn' }
      delete (bare as { model?: unknown }).model
      const entry = buildCatalog({ ...c, library: [bare] })[0]!
      expect(entry.subject).toBeNull()
      expect(await loadHangarModel(entry)).toBeNull()
    })
  ```
  Keep whatever imports the file already has; add `buildCatalog` and `nodeHangarContent` if missing.

- [ ] **Step 3: Tier 2 check 12.** In `tests/e2e/hangar.spec.ts`, replace `expect(notDrawn).toBeGreaterThan(0)` with:
  ```ts
      // R5: nothing in the Library is undrawn.
      expect(notDrawn).toBe(0)
  ```
  Tier 2 runs it in Task 15.

- [ ] **Step 4: Run, and mutation-check.**
  ```bash
  npx vitest run tests/render/hangar tests/tools/models/vehicleModels.test.ts tests/tools/models/buildingModels.test.ts --maxWorkers=2; echo "rc=$?"
  ```
  Expected `rc=0`. Then delete the `"model"` line from `content/library/willys-mb-jeep.json`: both `the Hangar can draw every entry` and `every building and vehicle names its own model` must fail. Restore the line.

- [ ] **Step 5: `docs/models.md`.**
  - §7 ("Register"): add a **Vehicles** bullet after the ships one: "**Vehicles:** add the id to `STATIC_MODELS.vehicle` in [`src/render/scene/staticModels.ts`](../src/render/scene/staticModels.ts) and name it in the Library entry's `model`. A vehicle stands on y = 0, centered on its footprint, nose to +x; `tests/tools/models/vehicleModels.test.ts` measures it against its cited length, width and height (R5)."
  - §9's check list: after the check 14 line, add `every Library entry is drawn: there is no allowlist (check 12, R5)`.

- [ ] **Step 6: Checks and commit.**
  ```bash
  npx tsc --noEmit; echo "rc=$?"
  npx eslint tests/render/hangar/roster.test.ts tests/render/hangar/models.test.ts tests/e2e/hangar.spec.ts --max-warnings 0; echo "rc=$?"
  git add tests/render/hangar/roster.test.ts tests/render/hangar/models.test.ts tests/e2e/hangar.spec.ts docs/models.md
  git commit -m "R5: done is an assertion: every Library entry is drawn, and the allowlist is gone"
  ```

---

### Task 15: Tier 2 on the reference GPU, and the checkpoint captures (R4 and R5)

**Files:**
- Modify: `tests/e2e/hangar.spec.ts` (check 10)
- Local scratch, **never committed:** `vite.config.ts` (the slot), `tests/e2e/roster-checkpoint.spec.ts`
- Create: `docs/handoff/<run date>-r4-r5-shots/` (eleven PNGs)

- [ ] **Step 1: Extend check 10.** In `tests/e2e/hangar.spec.ts`, replace the two lines under `// R1: the hangar is drawn from its Blender model, not drawBuilding's boxes.` with:
  ```ts
      // R1-R5: every Library building and vehicle is drawn from its own model, with its manifest budget.
      for (const [id, folder] of [...['aaa', 'ammunition-bunker', 'barracks-and-huts', 'coastal-gun-battery', 'fuel-tank-farm', 'hangar', 'pier-and-warehouses', 'radio-radar-station', 'revetment', 'tower'].map((b) => [b, 'buildings'] as const), ['type97-chi-ha', 'vehicles'] as const, ['willys-mb-jeep', 'vehicles'] as const]) {
        await select(page, id)
        const r = await page.evaluate(() => (window as HangarWindow).__hangar!.counts())
        expect(r?.budget, id).not.toBeNull()
        expect(r?.modelUrl ?? '', id).toMatch(new RegExp(`content/${folder}/${id}\\.glb$`))
      }
  ```
  Remove `'hangar'` from the registered-ids array just above it; the loop covers it.

- [ ] **Step 2: Serve the worktree on a free slot.**
  ```bash
  for p in 5174 5175; do pid=$(ss -ltnp | grep ":$p " | grep -oP 'pid=\K[0-9]+' | head -1); echo "$p ${pid:+busy: $(readlink /proc/$pid/cwd)}"; done
  ```
  - Pick a free slot: `ww2airsim-3` for 5174, or `ww2airsim-2` for 5175.
  - Set `TUNNEL_HOST` and `server.port` in `vite.config.ts` to match. **Never stage this file.**
  - Start the server in the background: `WW2AIRSIM_TUNNEL=1 npx vite --port <port>`.
  - Assert it: `curl -sS -o /dev/null -w '%{http_code}\n' https://<host>/hangar.html` must print `200`.
  - If both slots are busy, poll every five minutes for up to an hour. If neither frees, record a `Ruling:`, go to Task 16, and mark Tier 2 NOT RUN in the handoff.

- [ ] **Step 3: Run Tier 2.** `playwright run-server` must be up in Mark's console session on the desktop.
  ```bash
  ss -ltn | grep -q ':39001 ' || (ssh -N -L 39001:127.0.0.1:3000 ryzen &)
  PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://<host> npx playwright test tests/e2e/adapter.spec.ts tests/e2e/hangar.spec.ts; echo "rc=$?"
  ```
  Expected: `rc=0`, including check 12's `notDrawn === 0` and check 14's tower line. Copy into the ledger, for all eleven new ids: check 1's mask share, check 8's wireframe share and check 10's `counts`. A check-1 share outside 2-80% is a composition finding (Review Focus 5). Fix the model, never the bounds, and record a `Ruling:` with the measured share. R4 and R5 change no scenario, so the in-game gpu-p95 run is not required; record that as a `Ruling:`.

- [ ] **Step 4: The frozen captures.** Write the throwaway `tests/e2e/roster-checkpoint.spec.ts`, **never committed**:
  ```ts
  // tests/e2e/roster-checkpoint.spec.ts -- throwaway (R4+R5 Task 15), never committed.
  import { test } from '@playwright/test'
  import type { HangarWindow } from '../../src/render/hangar/hooks.js'

  const IDS = ['aaa', 'ammunition-bunker', 'barracks-and-huts', 'coastal-gun-battery', 'fuel-tank-farm', 'pier-and-warehouses', 'radio-radar-station', 'revetment', 'tower', 'type97-chi-ha', 'willys-mb-jeep']
  const OUT = process.env['ROSTER_SHOTS'] ?? 'docs/handoff/r4-r5-shots'

  test.use({ viewport: { width: 2560, height: 1440 } })
  test('R4+R5 checkpoint captures, turntable frozen', async ({ page }) => {
    test.setTimeout(300_000)
    await page.goto('/hangar.html?bench')
    await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
    await page.evaluate(() => (window as HangarWindow).__hangar!.ready)
    await page.evaluate(() => (window as HangarWindow).__hangar!.freeze())
    for (const id of IDS) {
      await page.evaluate((i) => (window as HangarWindow).__hangar!.select(i), id)
      await page.evaluate(() => (window as HangarWindow).__hangar!.camera('three-quarter'))
      await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))))
      await page.locator('#hangar-canvas').screenshot({ path: `${OUT}/${id}.png` })
    }
  })
  ```
  ```bash
  mkdir -p docs/handoff/<run date>-r4-r5-shots
  ROSTER_SHOTS=docs/handoff/<run date>-r4-r5-shots PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://<host> npx playwright test tests/e2e/roster-checkpoint.spec.ts; echo "rc=$?"
  ```
  **Read every PNG** before the handoff describes it. For each, check:
  - the front faces the three-quarter camera's +x side (the Chi-Ha's gun, the jeep's grille)
  - it stands on the platform, neither floating nor sunk
  - AAA and coastal barrels are above their parapets
  - no face flickers or shows a dark seam
  - the silhouette is distinct from the others
  - the jeep is one jeep, top down, with no fragment of the other

  Correct geometry only behind a failing measurement or a capture you have read. After a correction, rebuild, rerun Tier 2 and refreeze. Keep each PNG under 1.5 MB, downscaling with `sharp` if needed.

- [ ] **Step 5: Clean up and commit.** Delete the throwaway spec. Restore `vite.config.ts` with `git checkout -- vite.config.ts`. Stop only this worktree's server.
  ```bash
  git diff --cached --stat
  git add tests/e2e/hangar.spec.ts docs/handoff/*-r4-r5-shots/
  git commit -m "R4+R5: Tier 2 check 10 covers every building's and vehicle's own model; frozen checkpoint captures"
  ```
  `git diff --cached --stat` must list neither `vite.config.ts` nor `roster-checkpoint.spec.ts`.

---

### Task 16: Full verification and the completion ritual (R4 and R5)

**Files:**
- Create: `docs/handoff/<run date>-r4-r5-roster.md`
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§15, "Model roster" row)
- Modify: `README.md` (one paragraph)
- Modify: `.superpowers/sdd/2026-09-27-r4-r5-roster/progress.md` (final entry)

- [ ] **Step 1: Full verification on ryzen.** From the worktree root:
  ```bash
  remote-run npm run verify; rc=$?; echo "rc=$rc"
  ```
  Expected: `rc=0`.
  - Since 2026-09-27 ryzen has Blender 5.0.1 and numpy, so the Blender suites and every byte-identical rebuild **run** there. Its skip count should stay at R3's final one (1, the bathymetry cache case). A higher count means a suite skipped: name it and find out why before going on.
  - If `No module named 'numpy'` appears, ryzen lost numpy: record it, do not install anything, and rely on Step 1's nexus run for the Blender suites; say so in the handoff.
  - If a known flake appears (the `furball.test.ts` `beforeAll` timeout recorded by R1 and R2), rerun it alone. Record both results; do not call a flake a pass without the rerun.

  Then the Blender suites on nexus, serially, by name:
  ```bash
  npx vitest run tests/tools/models/blender tests/tools/models/blenderEntries.test.ts --maxWorkers=1; echo "rc=$?"
  ```
  Expected: `rc=0` with nothing skipped. Every Blender entry (the hangar, R2's ships, R3's four Blender aircraft and R4's nine) rebuilds byte-identically.

- [ ] **Step 2: Nothing else moved.**
  ```bash
  git diff main...HEAD --stat -- src/sim content/aircraft content/ships content/scenarios content/bases content/ordnance content/buildings/hangar.glb src/render/scene/airfield.ts src/render/scene/buildings.ts
  git diff main...HEAD --name-only -- content/vehicles
  ```
  Expected: the first is empty; the second lists exactly `content/vehicles/type97-chi-ha.glb` and `content/vehicles/willys-mb-jeep.glb`. Read the whole branch diff (`git diff main...HEAD --stat`). Confirm no candidate, cache, preview PNG, probe script, `vite.config.ts` edit or throwaway spec is tracked.

- [ ] **Step 3: The handoff** `docs/handoff/<run date>-r4-r5-roster.md`, in R3's shape:
  - **What shipped, R4:**
    - the kit's building parts, and why R2's three inward parts stay unused
    - the nine buildings, in a table: id, bytes / triangles / draw calls from each `built …` log line, footprint × height, turrets, sources status
    - the building turret-order rule
    - the harness (`buildingModels.test.ts`: footprint, budget, turrets, coplanar paint)
  - **What shipped, R5:**
    - the two vehicles, in a table: id, source and license, bytes / triangles / draw calls, fitted length / width / height against the citation, what was removed, `Turret1`
    - the jeep: two in the download, which one was kept and why (Mark's choice), the yaw, and the wheelbase fit with `W`, `L` and the result
    - the harness (`vehicleModels.test.ts`: citation, ground and center, forward proof, budget, turrets)
    - the allowlist is deleted: done is "every Library entry is drawn"
    - rulings V1-V5
  - **Sources:** Task 1's table, summarized, plus the two vehicle citations. Every figure still an ESTIMATE, by building, is an open item.
  - **Tier 1:** the `remote-run` rc and counts, and the nexus Blender run's.
  - **Tier 2:** checks 1, 8 and 10 for each new id, check 12's `0`, and the rc.
  - **Mark's checkpoint:** the eleven captures, each linked twice: relatively, and as `https://github.com/Coder999/ww2airsim/blob/worktree-r4-r5-roster/docs/handoff/<run date>-r4-r5-shots/<file>`, because `*.marktuttle.dev` is blocked on Mark's work network. Say how to see them live: the slot server is stopped unless left running, and give the `curl` that must print `200`.
  - **Open:**
    - R2's `cylinder`, `tapered_box` and `turret` wind inward. Fixing them rebuilds R2's committed ship glbs, so it is Mark's call.
    - H3 will need pivots for the AAA's, the coastal battery's and the Chi-Ha's `Turret1`. Today they are flat nodes with no `GunN` children.
    - Every ESTIMATE-only building.
    - Swapping the Blender tower, AAA and hangar into `airfield.ts`, and placing either vehicle in a scenario, stay later decisions (spec §6.3).
  - **Departures:** the ledger's `Ruling:` lines, summarized.

- [ ] **Step 4: §15 and README.**
  - In the master spec's §15 "Model roster (R0-R5 …)" row, keep the text through R3, and replace "R4-R5 not started" with: "R4 and R5 complete <run date>, one combined plan, on branch `worktree-r4-r5-roster` (not merged; merging is Mark's call): the nine remaining Library buildings are original Blender models, the Type 97 Chi-Ha and the Willys MB jeep are fitted CC BY downloads, and every Library entry is drawn, so the not-yet-drawn allowlist is deleted. [plan](../plans/2026-09-27-r4-r5-buildings-vehicles.md), [handoff](../../handoff/<run date>-r4-r5-roster.md)."
  - README: after the R3 paragraph, add: "**R4 and R5 landed <run date> on a branch awaiting merge:** every Library building and vehicle now has a model in the Hangar, and nothing in the Library is left undrawn; the airfields in the game keep their procedural boxes. The [handoff](docs/handoff/<run date>-r4-r5-roster.md) records what was measured; master spec §15 holds the status."

- [ ] **Step 5: The ledger.** Append the final entry: every rc, the named skips, the eleven build lines, the Tier 2 rc, the commit range (`git log --oneline main..HEAD`), and "handoff written".

- [ ] **Step 6: Commit, push the branch, email.**
  ```bash
  git diff HEAD --stat
  git add docs/handoff/<run date>-r4-r5-roster.md docs/superpowers/specs/2026-09-12-ww2airsim-design.md README.md
  git commit -m "R4+R5: handoff, §15 row, README pointer"
  git push -u origin worktree-r4-r5-roster
  python3 tools/mail-doc.py docs/handoff/<run date>-r4-r5-roster.md "ww2airsim: R4+R5 buildings and vehicles handoff (branch, not merged)"
  ```
  The mail script prints a byte count and exits 0. **Do not re-run it with `--debug`.** Do not merge, and do not touch `main`.
