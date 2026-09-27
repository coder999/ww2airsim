# R3: The aircraft roster — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a rigged, licensed or original model behind all eleven aircraft in the Library (the A6M Zero first, carrying out Z3's model half), so the Hangar draws every aircraft with a spinning propeller and working gear, without changing what any shipped scenario draws.

**Architecture:** Eight vetted Sketchfab downloads go through the existing manifest pipeline (`tools/models/build.ts`), extended with two opt-in stages that the downloads need: a yaw that squares a showcase-posed file to the axes, and a material dedup. Three original Blender models (Ki-84, Ki-21, B-29) are built from new aircraft parts in the Blender kit. Every aircraft glb carries its articulated parts as pivoted nodes. One generic runtime module, `pivotedAirframe.ts`, poses them from a small data table, `airframeRigs.ts`, instead of one hand-written module per aircraft. Tier 1 proves every rig, dimension and budget from the committed bytes.

**Tech Stack:** TypeScript, glTF-Transform 4.5, Blender 5.0.1 headless (`tools/models/blender/run.ts`), three.js 0.186 (WebGPU), Zod 3, Vitest 5, and Playwright Tier 2 on the Windows desktop's RX 6700 XT.

**Spec:** `docs/superpowers/specs/2026-09-26-model-roster-design.md` (approved by Mark 2026-09-26). Read all of it, especially §3 (sources), §4.2 (the kit), §4.4 (budgets), §5, §6 and §7. Also read the A6M Zero design `docs/superpowers/specs/2026-09-25-a6m-zero-design.md` §2, §3.2, §6, §7.3, §8 and §11 (Z3), and `docs/models.md` (the Sketchfab runbook). The handoffs to read first: `docs/handoff/2026-09-26-r1-roster-pipeline.md` (its "two open decisions" are settled here, ruling P3) and `docs/handoff/2026-09-26-r2-ship-models.md` (on `main` once R2 merges).

## Depends on R2

**R3 may start only after R2 (`worktree-r2-ships`, tip `c4d7bad` on 2026-09-26) has been merged into `main` by Mark.** It then rebases on nothing: Task 0 cuts a fresh worktree from `main`. One executor at a time (roster design §5): R2, R3 and R4 all append to `ASSETS.md`, `tests/render/hangar/roster.test.ts`, `tests/render/modelCredits.test.ts` and the Blender kit.

Task 0 asserts each of these facts about `main` before any work. If one fails, **stop and report**; do not start R3 on the R2 branch and do not "fix" `main`:

1. `NOT_YET_DRAWN` in `tests/render/hangar/roster.test.ts` holds the 9 aircraft below plus 9 non-aircraft, and `CEILING = 18`.
2. `tools/models/blender/kit.py` has R2's `ship_hull(... deck_role ...)`, and **no** aircraft part (`fuselage`, `wing`, `fin`, `propeller`, `gear_leg`, `revolve`, `gun_turret`). R3 adds them. If another plan added any of them first, stop: the kit tests in Task 12 would collide.
3. `SHIP_MODELS` has all ten ships (R2 done).
4. `AIRFRAME_MODELS` in `src/render/scene/airframes.ts` has `wildcat` only, and `content/aircraft/` holds exactly one glb, `wildcat.glb`.
5. `content/aircraft/a6m2-zero.json` has `"model": "wildcat"`.
6. The credit pin in `tests/render/modelCredits.test.ts` reads `Models: KTKloss, KTKloss, JZHU, KTKloss, everlasting17th, AlanTinka, rojatsu, KTKloss (CC BY 4.0)`.
7. `blender --version` prints `Blender 5.0.1`.
8. The eight staged downloads in the main checkout's `content/models/candidates/` still hash to the prefixes in "Where R3 starts".

## Mark's decisions for this plan (from the roster design, 2026-09-26)

- **Where it runs:** its own worktree, `.claude/worktrees/r3-aircraft`, branch `worktree-r3-aircraft`, cut from `main` after R2 merges. Pushing the branch is fine. **Never merge into, commit on, or push `main`, and never deploy.**
- **Viewing checkpoint:** per family, the final product only. **Unattended**: run to completion without stopping. The handoff carries frozen-turntable Hangar captures of every new model, taken on the reference GPU, and is emailed to Mark as HTML.
- **Sources (design §3):** the eight staged Sketchfab picks, and Blender for the Ki-84, Ki-21 and B-29. **A pick that fails its build falls back to Blender, never to another stand-in**, recorded as a `Ruling:`.
- **The Hellcat is shown in the Hangar only** (design §6.2). The player's airplane stays drawn as a Wildcat.
- **No scenario `view.model` changes except `content/aircraft/a6m2-zero.json`** (design §4.3), which Z3 planned.
- **US spelling** in prose and identifiers.

## Where R3 starts (read 2026-09-26 from `worktree-r2-ships` at `c4d7bad` and the main checkout)

Every fact below was measured on 2026-09-26. Task 0 re-checks the ones that could move.

- **The kit has no aircraft parts.** `tools/models/blender/kit.py` (296 lines after R2's `6dd4920` and `796a89a`) has `box`, `barrel_vault`, `arch_gable` (R0), and `ship_hull` (with `deck_role`), `deck`, `tapered_box`, `cylinder` (vertical only) and ship `turret` (R2). The design's §4.2 table lists a lofted fuselage, tapered surfaces and a propeller as kit parts; R0's handoff deferred them to R3, and nothing has built or proven them. **Task 12 adds and proves them before any Blender aircraft.**
- **Each kit node has exactly one role (material)**, and every node is exported with an identity transform under a root named for the model. A part's pivot therefore comes from its manifest `keep` entry, as for a download.
- **The airframe registry** (`src/render/scene/airframes.ts`) maps a model id to a loader. The only real module is `wildcat.ts`, which poses its gear from a baked clip. `docs/models.md` §7 tells a new aircraft to write "a module like `wildcat.ts`". Eleven such modules would be eleven copies of the same plumbing, so R3 adds one generic module instead (ruling P7).
- **The pivot stage exists and is proven for downloads:** `tools/models/stages/pivot.ts` moves a kept or split node's origin onto its hinge and writes `pivotAxis` into the node's extras. `normalize` rotates that axis into the output frame and leaves every node with a translation only. GLTFLoader surfaces extras as `Object3D.userData.pivotAxis`. No runtime code reads it yet.
- **`normalize` is axis-aligned only.** `forward` and `up` are `±x/±y/±z`. It cannot turn a model posed at an angle.
- **The four manilov.ap downloads are posed at an angle.** Read from node bounds in the raw files: the Ki-43's fin (`kil`) centers near (3.41, −2.85) in x-z and its propeller (`Line17`) near (−2.68, 0.84), so its fuselage runs about 31° off the x axis. The F6F's and P-38's wing halves also run diagonally. So R3 adds an optional `normalize.yawDeg` (Task 2).
- **manilov.ap's files use one material per sub-object:** F6F 37 materials, F4U 65, Ki-43 68, P-38 20. Join groups by material, so these would draw 37 to 68 times. R3 adds an opt-in `dedupMaterials` (Task 2).
- **The F6F file contains a figure.** It has materials named `rCollar_01-FACES` and `neck_01-FACES`. Remove it by node in Task 5.

### The staged downloads (main checkout, `content/models/candidates/`)

| R3 id | File | Bytes | SHA-256 prefix | Triangles | Meshes / materials / textures | Raw world bounds (x; y; z) | Notes |
| --- | --- | ---: | --- | ---: | --- | --- | --- |
| `a6m2-zero` | `a6m2-zeke.glb` | 16,138,556 | `050cad164c8cee4f` | 187,441 | 6 / 5 / 11 | −217.45..284.21; −2.46..211.21; −322.30..310.04 | Zero design §2. At a 12.0 m span, length 501.66 × 0.018977 = **9.52 m, 5.1% over the cited 9.06 m** (see ruling P10) |
| `f6f-hellcat` | `f6f.glb` | 3,697,376 | `56ee830d688ec94c` | 36,605 | 276 / 37 / 22 | −5.21..6.01; 0.006..4.19; −7.17..5.67 | yawed; a figure; stands on y = 0 |
| `f4u-corsair` | `f4u.glb` | 2,157,840 | `6ce4c6985f285f90` | 29,533 | 65 / 65 / 6 | −5.53..4.24; −1.88..1.71; −3.97..5.40 | z extent 9.37 m is short of a 12.49 m span: yawed, or wings folded |
| `p-38-lightning` | `p38-lightning.glb` | 6,075,552 | `6ef3cbeac041e381` | 114,089 | 101 / 20 / 1 | −4.86..3.55; −1.22..1.42; −4.01..4.50 | x ≈ z extent: yawed. Port and starboard parts are prefixed `pt_` and `st_` |
| `ki-43-oscar` | `ki43.glb` | 2,049,520 | `57097d5daa7056ad` | 19,284 | 68 / 68 / 17 | −4.69..5.34; −1.83..1.51; −6.54..4.98 | yawed about 31°; canopy meshes `kabina`, `kabina01`, `kabina02` are coincident copies |
| `d3a-val` | `aichi_d3a_val.glb` | 13,939,572 | `c3e8869fb590daa8` | 293,440 | 47 / 21 / 21 | −5.08..5.07; −1.91..1.92; −7.17..7.17 | span/length 1.412 (cited 1.409): squared to the axes. FlightGear export merged by material; instrument textures (`*_asi.png`, `*_clock.png`, …) |
| `g4m-betty` | `mitsubishi_g4m.glb` | 265,760 | `8f0801c624063932` | 2,656 | 10 / 4 / 1 | −0.026..0.026; 0.001..0.014; −0.021..0.021 | tiny units; **span along x**, so forward is ±z. A `Bombs` group (`B1`…`B4`) |
| `b-17-flying-fortress` | `boeing_b-17_flying_fortress.glb` | 33,970,916 | `5ba6eaae156fdd6f` | 763,214 | 49 / 27 / 26 | −11.30..11.79; −3.13..4.81; −15.76..15.76 | length 23.09, span 31.52 (cited 22.66 / 31.62). 580k of the triangles are four repeated node triples (≈72.3k, 71.3k, 23.0k each), one per engine |

The B-29 candidate (`boeing_b-29_superfortress.glb`, Spark_Customs) is flagged suspect in `ASSETS.md` and is not used.

## Rulings this plan makes (record each in the ledger as `Ruling: P<n>`)

These settle questions the design and the code leave open. The handoff lists them for Mark.

- **P1. R3 carries out Z3's model half, not its scenario half.** R3 builds the Zero from `a6m2-zeke.glb` with its rig, registers it, and flips `a6m2-zero.json`'s `view.model` to `a6m2-zero`. It **defers** Z3's `zero-range` scenario and title entry, the distance LOD (`a6m2-zero-lod1`, `pickLod`, `forceAirframeLod`), `tests/e2e/zero.spec.ts`, and the re-measured gun mounts, hit zones and eye point. Reason: the roster design, approved later the same day, puts "putting any new object into a scenario" out of scope, and everything deferred serves only a scenario that flies the Zero. `gear.heightM` is **asserted** against the built mesh (±0.05 m), not rewritten; many AI tests load `a6m2-zero.json`. It changes only if the assertion fails, and then only with the sim suites re-run through `remote-run`.
- **P2. The allowlist shrinks by 9, not 11.** The Zero and the Hellcat already have specs, so they are already "drawn" (as the Wildcat) and are not on `NOT_YET_DRAWN`. R3 takes `CEILING` from 18 to 9.
- **P3. An aircraft Library entry with both a spec and its own `model` (the Hellcat): the model owns the drawing, the spec owns the card and the Cycle timing, and no stores are drawn.** This settles R1's open decision for aircraft. The display path stands the model by its own bounds and hangs nothing; the bench's stores row reads "not modeled".
- **P4. The Zero keeps the Zero design's budget** (≤ 5,600,000 bytes, 100,000 triangles, 12 draws; design §8), not the roster's fighter starting point. That design was approved for this exact model and measured against the Wildcat.
- **P5. Draw-call budgets.** The roster design gives no fighter or bomber draw-call figure. Every aircraft but the Zero starts at **47**, the Wildcat's measured count.
- **P6. Part names** (roster design §4.2 asks for "the names the bench already drives"; the bench drives parts through `Airframe`, not names): `Prop` for one engine, `Prop1`…`PropN` from port (−z) to starboard (+z); `GearL`, `GearR`, `GearNose`, `Tailwheel`; `Turret1`…`TurretN` numbered nose to tail, dorsal before ventral at one station. Every part is a `keep` or `split` node with a pivot.
- **P7. One generic airframe module.** `src/render/scene/pivotedAirframe.ts` plus a data table replaces per-aircraft modules. `wildcat.ts` stays as it is.
- **P8. Two opt-in pipeline stages:** `normalize.yawDeg` and `dedupMaterials`. Both are absent from every existing entry, so no committed glb changes by a byte. `TOY_SHA256_BEFORE_O1` still pins that.
- **P9. Propellers are never simplified.** Every prop node gets `perNode` ratio 1, so the N-fold symmetry test compares exact vertex orbits.
- **P10. Length tolerance for a download is 4%** after it is fitted to its cited span. That is enough to tell a wrong variant or a wrong model. The Zero's row carries 6%, with the measured 9.52 m against 9.06 m as its reason: Mark chose this model (Zero design §3.1), and the design missed the discrepancy.
- **P11. A fused part stays static, and it is not a fallback trigger.** This follows the Zero's flaps. The bench reads "not modeled" and the handoff names the part. Fallback to Blender triggers only on:
  - a license mismatch;
  - a length outside tolerance for every variant the Library entry could depict;
  - a model still over budget after simplification, with silhouette loss visible in its preview render;
  - a model whose parts are not in flying position (exploded or disassembled).
- **P12. Stores baked into a download are removed** where they are separable: the G4M's bombs, and the Zero's drop tank per Zero design §3.2.
- **P13. The Blender aircraft sit gear-down with the thrust line level,** like every airframe on the Hangar stand. A taildragger then stands on its mains with its tail clear of the pad.
- **P14. Turrets on a download are named only if they are separable** as nodes or as clean component islands. Otherwise they stay static and are recorded. The Blender bombers name theirs.
- **P15. Fixed gear (the Val) is not rigged.** The bench reads gear "not modeled".
- **P16. The Blender aircraft use flat palette roles and carry no insignia.** Each script's header says so.
- **P17. The game is unchanged.** `git diff main...HEAD -- content/scenarios src/sim` is empty. The only `content/aircraft/*.json` change is `a6m2-zero.json`: its `view.model` and two sentences of its `source` strings.

## Global Constraints

- **Worktree only:** `.claude/worktrees/r3-aircraft`, branch `worktree-r3-aircraft`. `git push -u origin worktree-r3-aircraft` is allowed. Never touch `main`.
- **Budgets (design §4.4):** fighters 3 MB (3,000,000 bytes) / 60,000 triangles; bombers 5 MB (5,000,000 bytes) / 100,000 triangles; draw calls 47 (P5); the Zero 5,600,000 / 100,000 / 12 (P4). A family comes from GAMEPLAY.md's roster role: "fighter" (including "Hostile fighter" for the Val, and the P-38) takes the fighter budget; "bomber" or "escort subject" takes the bomber budget. **A budget is raised only with a measured reason, recorded as a `Ruling:`.**
- **Blender models are original work, `AGPL-3.0-or-later`.** Each script cites its dimensions with a read date and labels every estimate `ESTIMATE` in its header, following `tools/models/blender/hangar.py`.
- **Blender is exactly `5.0.1`**, runs only on nexus, and runs **one at a time**. Never run two Blender builds or two Blender test files at once. Blender suites run with `--maxWorkers=1`.
- **Resource rule:** on nexus, run only the test files a task touches, with `--maxWorkers=2` (`--maxWorkers=1` for Blender files). The full suite and `npm run verify` run only through `remote-run` (Task 18). Capture `rc=$?` directly. Never gate on a piped `grep`.
- **Per-task checks,** at the end of every task that changes code:
  - `npx tsc --noEmit; echo "rc=$?"`
  - `npx eslint <touched .ts files> --max-warnings 0; echo "rc=$?"`
- **Byte identity.** No existing committed glb changes. `wildcat.glb` stays frozen. `TOY_SHA256_BEFORE_O1` holds. R2's three Blender ships and the hangar rebuild byte-identically (the `blenderEntries.test.ts` rebuild block, nexus).
- **Sketchfab rules (`docs/models.md` §3):** before an output is committed, re-read its license from `api.sketchfab.com/v3/models/<uid>`, and add its `ASSETS.md` row in the same commit as the glb. Move its row out of the "Candidate models" table.
- **The allowlist only shrinks:** `CEILING` always equals `NOT_YET_DRAWN.length` after each edit, and both only go down.
- **Never run `git clean -fdx`.** Never stop another worktree's dev server. The Tier 2 slot edit to `vite.config.ts` is never staged.
- **US spelling.** Escape `|` as `\|` inside markdown table cells.

## Review Focus

1. **A rigged part with no pivot.** An entry that keeps `Prop` but forgets its `pivot` would spin the propeller about the model origin. The runtime refuses: `loadPivotedAirframe` throws, naming the model and node, and releases the instance. Tier 1 fails first, on the committed glb. Pinned in Task 3 (runtime) and Tasks 4 onward (`aircraftRigs.test.ts`).
2. **A spec pointed at a rigged model that has stores.** Suppose someone later sets `f6f-hellcat.json`'s `view.model` to `f6f-hellcat`. The spec has racks and rails, but the rigged model has no measured mounts. The loader must fail loudly and name the fix. It must not fly a bare airplane. Pinned in Task 3.
3. **A display-only aircraft on the bench.** Its gear slider works, but it has no spec, so it has no gear travel and no Cycle button. Tier 2 check 7 must skip it, and must assert that the button is absent rather than click a button that does not exist. Pinned in Task 17. Tier 1 covers the loader in Task 3.
4. **A gear leg that folds the wrong way.** A sign error in `upAngleDeg` would swing a wheel down or outboard. For every leg, Tier 1 turns the committed leg to its up angle and checks that it rises and moves in its declared direction (`inboard`, `forward` or `aft`). Pinned in Task 3 (pure) and in `aircraftRigs.test.ts` from Task 4.
5. **The Hellcat, with a spec and a model.** It draws its own model through the display path, with no stores. Its card still shows Hellcat figures. The game still draws it as the Wildcat. Pinned in Task 5 (`models.test.ts`), and by Task 18's check that `git diff main...HEAD -- content/aircraft/f6f-hellcat.json` is empty.

---

## File structure

| File | Responsibility | Task |
| --- | --- | --- |
| `tools/models/rig.ts` (new) | Measures parts: world positions, hub and hinge estimates, N-fold symmetry, principal yaw. Also a CLI, `npm run models:rig` | 1 |
| `tools/models/stages/yaw.ts` (new) | Stage 0: turns a posed download about its up axis | 2 |
| `tools/models/stages/dedup.ts` (new) | Opt-in material and texture dedup before join | 2 |
| `tools/models/manifest.ts`, `build.ts`, `inspect.ts`, `package.json` | `normalize.yawDeg`, `dedupMaterials`, `inspect --yaw`, the `models:rig` script | 1–2 |
| `src/render/scene/airframeRigs.ts` (new) | Data: each rigged model's props, gear and turrets | 3, then one row per aircraft |
| `src/render/scene/pivotedAirframe.ts` (new) | The generic `Airframe` for a rigged glb | 3 |
| `src/render/scene/airframes.ts`, `src/render/content.ts` | Registers every rig; the aircraft model URL | 3 |
| `tests/tools/models/aircraftRigs.test.ts` (new) | Every rig against its committed glb | 4 |
| `tests/tools/models/aircraftDimensions.test.ts` (new) | Cited span and length for every aircraft model | 4 |
| `tools/models/entries/<id>.json` × 11, `content/aircraft/<id>.glb` × 11 | The models | 4–11, 13–16 |
| `tools/models/blender/kit.py` | Aircraft parts: `fuselage`, `wing`, `fin`, `revolve`, `propeller`, `gear_leg`, `gun_turret` | 12 |
| `tools/models/blender/{ki-84-frank,ki-21-sally,b-29-superfortress}.py` (new) | Three original models, each a family template | 13–15 |
| `content/library/*.json` | The `model` links, and the corrected Hellcat, Zero and Wildcat text | 4–16 |
| `tests/e2e/hangar.spec.ts` | Check 7's display-only case, check 10's list, new check 13 | 17 |

---

### Task 0: Preflight, worktree, data, ledger (no commit)

**Files:**
- Create: `.superpowers/sdd/r3/progress.md` (gitignored)

- [ ] **Step 1: Assert R2 is on `main`.** From `/home/mark/projects/ww2airsim`:
  ```bash
  git fetch -q origin
  git show main:tests/render/hangar/roster.test.ts | grep -c '^const CEILING = 18$'
  git show main:tools/models/blender/kit.py | grep -c 'deck_role'
  git show main:tools/models/blender/kit.py | grep -cE 'def (fuselage|wing|fin|propeller|gear_leg|revolve|gun_turret)\('
  git show main:src/render/scene/shipModels.ts | grep -c "'kagero-dd'"
  git show main:src/render/scene/airframes.ts | grep -c 'wildcat: (stores) => loadWildcat(stores)'
  git show main:content/aircraft/a6m2-zero.json | grep -c '"model": "wildcat"'
  git ls-tree --name-only main content/aircraft/ | grep '\.glb$'
  git show main:tests/render/modelCredits.test.ts | grep -c 'Models: KTKloss, KTKloss, JZHU, KTKloss, everlasting17th, AlanTinka, rojatsu, KTKloss (CC BY 4.0)'
  git show main:docs/handoff/2026-09-26-r2-ship-models.md | head -1
  blender --version | head -1
  ```
  Expected, in order: `1`, a number ≥ `1`, `0`, `1`, `1`, `1`, `content/aircraft/wildcat.glb` alone, `1`, the R2 handoff's title line, and `Blender 5.0.1`. **If any line differs, stop.** Write what differed into your report and do nothing else.

- [ ] **Step 2: Create the worktree.**
  ```bash
  git worktree add -b worktree-r3-aircraft .claude/worktrees/r3-aircraft main
  cd .claude/worktrees/r3-aircraft && npm ci
  ```
  All later paths are relative to this worktree.

- [ ] **Step 3: Gitignored data.** Link the main checkout's caches, read-only by convention (R1's recipe):
  ```bash
  ln -s /home/mark/projects/ww2airsim/content/terrain/tiles content/terrain/tiles
  mkdir -p tools/terrain tools/textures && ln -s /home/mark/projects/ww2airsim/tools/terrain/cache tools/terrain/cache
  ln -s /home/mark/projects/ww2airsim/tools/textures/cache tools/textures/cache
  mkdir -p tools/models/cache content/models/candidates
  C=/home/mark/projects/ww2airsim/content/models/candidates
  for f in a6m2-zeke f6f f4u p38-lightning ki43 aichi_d3a_val mitsubishi_g4m boeing_b-17_flying_fortress; do
    cp --reflink=auto "$C/$f.glb" "tools/models/cache/$f.glb"
    cp "$C/$f.sketchfab.json" content/models/candidates/
  done
  sha256sum tools/models/cache/*.glb | awk '{print substr($1,1,16), $2}'
  ```
  Expected prefixes: `050cad164c8cee4f` a6m2-zeke, `56ee830d688ec94c` f6f, `6ce4c6985f285f90` f4u, `6ef3cbeac041e381` p38-lightning, `57097d5daa7056ad` ki43, `c3e8869fb590daa8` aichi_d3a_val, `8f0801c624063932` mitsubishi_g4m, `5ba6eaae156fdd6f` boeing_b-17_flying_fortress. A different hash means the download changed after this plan measured it. In that case, re-run `models:inspect` on it before trusting any number in this plan, and record a `Ruling:`.

- [ ] **Step 4: The ledger.** Create `.superpowers/sdd/r3/progress.md`. Its header gives:
  - the plan path and branch;
  - `unattended, final-product checkpoint`;
  - `R3_DATE=$(date +%F)`, the date used in every file name below.

  Append one line per completed step with the measured values, and one `Ruling:` line per departure. Copy rulings P1–P17 in as `Ruling: P<n> (plan)`.

- [ ] **Step 5: Baseline.**
  ```bash
  npx vitest run tests/tools/models tests/render/hangar tests/render/airframes.test.ts tests/render/modelCredits.test.ts --exclude 'tests/tools/models/blender/**' --exclude tests/tools/models/blenderEntries.test.ts --maxWorkers=2; echo "rc=$?"
  npx vitest run tests/tools/models/blender tests/tools/models/blenderEntries.test.ts --maxWorkers=1; echo "rc=$?"
  ```
  Expected `rc=0` twice, the second with nothing skipped. Record both counts.

---

### Task 1: `tools/models/rig.ts`, the part-measurement library and CLI

**Files:**
- Create: `tools/models/rig.ts`
- Create: `tests/tools/models/rig.test.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces:
  - `type Vec3 = readonly [number, number, number]`
  - `worldPositions(node: Node): Vec3[]`: every vertex in `node`'s subtree, world frame
  - `boxPositions(nodes: readonly Node[], min: Vec3, max: Vec3): Vec3[]`
  - `centroid(points): Vec3`
  - `bounds(points): { min: Vec3; max: Vec3 }`
  - `rotateAbout(p, pivot, axis, rad): Vec3`
  - `radiusAbout(points, pivot, axis): number`
  - `symmetryError(points, pivot, axis, blades): number`: the 95th-percentile distance, capped at 2% of the radius
  - `legTop(points, band = 0.02): Vec3`
  - `principalYawDeg(points): number`, in (−90, 90]: the turn about +y that puts the points' long horizontal axis on ±x
- Consumes (Task 2 adds it; the CLI imports it lazily, so Task 1's tests do not need it): `yawScene`.

- [ ] **Step 1: Write the failing test** `tests/tools/models/rig.test.ts`:
  ```ts
  // tests/tools/models/rig.test.ts
  import { describe, expect, it } from 'vitest'
  import { bounds, boxPositions, centroid, legTop, principalYawDeg, radiusAbout, rotateAbout, symmetryError, worldPositions, type Vec3 } from '../../../tools/models/rig.js'
  import { meshNodes } from '../../../tools/models/document.js'
  import { addMeshNode, boxesPrimitive, newDocument } from './fixtures.js'

  const X: Vec3 = [1, 0, 0]
  /** A propeller-like star about the x axis through `hub`: `blades` rows of points out to r = 1.5. */
  function star(hub: Vec3, blades = 3): Vec3[] {
    const out: Vec3[] = []
    for (let b = 0; b < blades; b++) {
      const a = (2 * Math.PI * b) / blades
      for (let i = 2; i <= 15; i++) {
        const r = i / 10
        for (const w of [-0.05, 0.05]) out.push([hub[0] + w, hub[1] + r * Math.cos(a) - w * Math.sin(a), hub[2] + r * Math.sin(a) + w * Math.cos(a)])
      }
    }
    return out
  }
  const close = (a: readonly number[], b: readonly number[], eps = 1e-9): void => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, -Math.log10(eps)))

  describe('rig measurements (R3)', () => {
    it('rotateAbout: a right leg hanging down, turned +90 deg about +x, points inboard (-z)', () => {
      close(rotateAbout([0, -1, 0], [0, 0, 0], X, Math.PI / 2), [0, 0, -1])
      close(rotateAbout([1, -1, 2], [1, 0, 2], [0, 0, 1], Math.PI / 2), [2, 0, 2]) // +90 about +z: forward
    })

    it('a symmetric star: centroid on its hub, radius 1.5 to the blade corner, zero symmetry error there', () => {
      const hub: Vec3 = [10, 2, -3]
      const pts = star(hub)
      close(centroid(pts), hub, 1e-9)
      expect(radiusAbout(pts, hub, X)).toBeCloseTo(Math.hypot(1.5, 0.05), 9)
      expect(symmetryError(pts, hub, X, 3)).toBeLessThan(1e-9)
    })

    it('a pivot 0.1 m off the hub fails the 1% symmetry tolerance', () => {
      const hub: Vec3 = [0, 0, 0]
      const pts = star(hub)
      expect(symmetryError(pts, [0, 0.1, 0], X, 3)).toBeGreaterThan(0.01 * 1.5)
    })

    it('rejects a blade count below 2', () => {
      expect(() => symmetryError(star([0, 0, 0]), [0, 0, 0], X, 1)).toThrow(/blades must be an integer >= 2/)
    })

    it('legTop is the center of the top of a leg', () => {
      const doc = newDocument()
      const node = addMeshNode(doc, 'Leg', [boxesPrimitive(doc, [[[-0.1, -2, 1.9], [0.1, 0, 2.1]]])])
      close(legTop(worldPositions(node)), [0, 0, 2], 1e-6)
    })

    it('worldPositions applies the node transform; boxPositions keeps only what is inside the box', () => {
      const doc = newDocument()
      const node = addMeshNode(doc, 'Body', [boxesPrimitive(doc, [[[0, 0, 0], [1, 1, 1]], [[5, 0, 0], [6, 1, 1]]])])
      node.setTranslation([10, 0, 0])
      expect(bounds(worldPositions(node)).min[0]).toBeCloseTo(10, 9)
      const inside = boxPositions(meshNodes(doc), [14.5, -1, -1], [16.5, 2, 2])
      expect(inside).toHaveLength(8)
      expect(bounds(inside).min[0]).toBeCloseTo(15, 9)
    })

    it('principalYawDeg: points along 30 deg from +x toward +z read 30; along -x read 0', () => {
      const along = (deg: number): Vec3[] => Array.from({ length: 21 }, (_, i) => {
        const t = i - 10, a = (deg * Math.PI) / 180
        return [t * Math.cos(a), 0, t * Math.sin(a)] as Vec3
      })
      expect(principalYawDeg(along(30))).toBeCloseTo(30, 9)
      expect(principalYawDeg(along(180))).toBeCloseTo(0, 9)
      expect(principalYawDeg(along(-40))).toBeCloseTo(-40, 9)
    })
  })
  ```

- [ ] **Step 2: Run it to verify it fails.**
  `npx vitest run tests/tools/models/rig.test.ts --maxWorkers=2; echo "rc=$?"`. Expected: FAIL, `Cannot find module '../../../tools/models/rig.js'`.

- [ ] **Step 3: Implement** `tools/models/rig.ts`:
  ```ts
  // tools/models/rig.ts
  /**
   * Measures the parts an airframe articulates (R3): where a propeller's hub is, whether it is
   * N-fold symmetric about a pivot, where a gear leg's hinge is, and how a download is yawed.
   * tests/tools/models/aircraftRigs.test.ts proves every committed rig with these same
   * functions, so a pivot this CLI suggests is the pivot the test checks.
   *
   * `npm run models:rig -- <file.glb> <node | box:x0,y0,z0,x1,y1,z1> [--yaw DEG] [--blades N --axis +x]`
   * prints, in the file's source frame (first turned by --yaw about +y, as an entry's
   * normalize.yawDeg turns it): the part's bounds, centroid, top-hinge estimate and principal
   * yaw; with --blades, its radius and symmetry error about the centroid.
   */
  import { readFileSync } from 'node:fs'
  import { fileURLToPath } from 'node:url'
  import type { Node } from '@gltf-transform/core'
  import { findNode, meshNodes, modelIO, subtree } from './document.js'
  import { AXES, type Axis } from './manifest.js'
  import { axisVector } from './stages/axes.js'

  export type Vec3 = readonly [number, number, number]

  function transformed(node: Node): Vec3[] {
    const mesh = node.getMesh()
    if (!mesh) return []
    const m = node.getWorldMatrix()
    const out: Vec3[] = []
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      if (!pos) continue
      for (let i = 0; i < pos.getCount(); i++) {
        const [x, y, z] = pos.getElement(i, [0, 0, 0]) as [number, number, number]
        out.push([
          m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
          m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
          m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
        ])
      }
    }
    return out
  }

  /** Every vertex in `node`'s subtree, in the document's world frame. */
  export function worldPositions(node: Node): Vec3[] {
    return subtree(node).flatMap(transformed)
  }

  /** Every vertex of `nodes` (their own meshes) whose world position lies inside the box. */
  export function boxPositions(nodes: readonly Node[], min: Vec3, max: Vec3): Vec3[] {
    return nodes.flatMap(transformed).filter((p) => p.every((v, i) => v >= min[i]! && v <= max[i]!))
  }

  export function centroid(points: readonly Vec3[]): Vec3 {
    if (points.length === 0) throw new Error('centroid: no points')
    const s = [0, 0, 0]
    for (const p of points) for (let i = 0; i < 3; i++) s[i]! += p[i]!
    return [s[0]! / points.length, s[1]! / points.length, s[2]! / points.length]
  }

  export function bounds(points: readonly Vec3[]): { min: Vec3; max: Vec3 } {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    for (const p of points) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i]!, p[i]!); max[i] = Math.max(max[i]!, p[i]!) }
    return { min: min as unknown as Vec3, max: max as unknown as Vec3 }
  }

  /** `p` turned `rad` (right-handed) about the line through `pivot` along the unit `axis` (Rodrigues). */
  export function rotateAbout(p: Vec3, pivot: Vec3, axis: Vec3, rad: number): Vec3 {
    const v = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]] as const
    const c = Math.cos(rad), s = Math.sin(rad)
    const d = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2]
    const k = [axis[1] * v[2] - axis[2] * v[1], axis[2] * v[0] - axis[0] * v[2], axis[0] * v[1] - axis[1] * v[0]] as const
    return [0, 1, 2].map((i) => pivot[i]! + v[i]! * c + k[i]! * s + axis[i]! * d * (1 - c)) as unknown as Vec3
  }

  /** The largest distance of any point from the line through `pivot` along the unit `axis`. */
  export function radiusAbout(points: readonly Vec3[], pivot: Vec3, axis: Vec3): number {
    let r = 0
    for (const p of points) {
      const v = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]]
      const d = axis[0] * v[0]! + axis[1] * v[1]! + axis[2] * v[2]!
      r = Math.max(r, Math.hypot(v[0]! - axis[0] * d, v[1]! - axis[1] * d, v[2]! - axis[2] * d))
    }
    return r
  }

  /**
   * How far a part is from N-fold symmetry about a pivot: every point is turned by 2 pi / blades
   * and matched to its nearest original point. Returns the 95th-percentile distance, capped at 2%
   * of the radius (the search reaches one grid cell of that size). An exact propeller about its
   * hub reads 0. A pivot off the hub reads the cap.
   */
  export function symmetryError(points: readonly Vec3[], pivot: Vec3, axis: Vec3, blades: number): number {
    if (!Number.isInteger(blades) || blades < 2) throw new Error(`symmetryError: blades must be an integer >= 2, got ${blades}`)
    const radius = radiusAbout(points, pivot, axis)
    if (!(radius > 0)) throw new Error('symmetryError: the part has no extent about its axis')
    const cell = 0.02 * radius
    const key = (i: number, j: number, k: number): string => `${i},${j},${k}`
    const grid = new Map<string, Vec3[]>()
    for (const p of points) {
      const k = key(Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell))
      const list = grid.get(k)
      if (list) list.push(p)
      else grid.set(k, [p])
    }
    const turn = (2 * Math.PI) / blades
    const dists = points.map((p) => {
      const q = rotateAbout(p, pivot, axis, turn)
      const i = Math.floor(q[0] / cell), j = Math.floor(q[1] / cell), k = Math.floor(q[2] / cell)
      let best = cell
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) {
        for (const r of grid.get(key(i + di, j + dj, k + dk)) ?? []) best = Math.min(best, Math.hypot(q[0] - r[0], q[1] - r[1], q[2] - r[2]))
      }
      return best
    }).sort((a, b) => a - b)
    return dists[Math.floor(0.95 * (dists.length - 1))]!
  }

  /** A gear leg's hinge estimate: the centroid of the points within `band` of its height from its top. */
  export function legTop(points: readonly Vec3[], band = 0.02): Vec3 {
    const b = bounds(points)
    const cut = b.max[1] - band * (b.max[1] - b.min[1])
    return centroid(points.filter((p) => p[1] >= cut))
  }

  /** The turn about +y, in degrees in (-90, 90], that lays the points' long horizontal axis on
   *  x. Which end is the nose is the caller's call: add 180 if it lands on -x. */
  export function principalYawDeg(points: readonly Vec3[]): number {
    const c = centroid(points)
    let sxx = 0, szz = 0, sxz = 0
    for (const p of points) {
      const dx = p[0] - c[0], dz = p[2] - c[2]
      sxx += dx * dx; szz += dz * dz; sxz += dx * dz
    }
    const deg = (0.5 * Math.atan2(2 * sxz, sxx - szz) * 180) / Math.PI
    return deg <= -90 ? deg + 180 : deg
  }

  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2)
    const flag = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined }
    const [file, target] = args
    if (!file || !target) {
      console.error('usage: npm run models:rig -- <file.glb> <node | box:x0,y0,z0,x1,y1,z1> [--yaw DEG] [--blades N --axis +x]')
      process.exit(2)
    }
    const doc = await modelIO().readBinary(new Uint8Array(readFileSync(file)))
    const yaw = Number(flag('yaw') ?? 0)
    if (yaw !== 0) {
      const { yawScene } = await import('./stages/yaw.js')
      yawScene(doc, '+y', yaw)
    }
    let pts: Vec3[]
    if (target.startsWith('box:')) {
      const v = target.slice(4).split(',').map(Number)
      pts = boxPositions(meshNodes(doc), [v[0]!, v[1]!, v[2]!], [v[3]!, v[4]!, v[5]!])
    } else pts = worldPositions(findNode(doc, target))
    const f = (p: readonly number[]): string => `[${p.map((x) => x.toFixed(3)).join(', ')}]`
    const b = bounds(pts), c = centroid(pts)
    console.log(`${target}: ${pts.length} vertices, bounds min ${f(b.min)} max ${f(b.max)}`)
    console.log(`centroid ${f(c)}; top hinge estimate ${f(legTop(pts))}; principal yaw ${principalYawDeg(pts).toFixed(3)} deg about +y`)
    const blades = flag('blades')
    if (blades !== undefined) {
      const name = (flag('axis') ?? '+x') as Axis
      if (!AXES.includes(name)) { console.error(`--axis must be one of ${AXES.join(' ')}`); process.exit(2) }
      const axis = axisVector(name)
      console.log(`about the centroid along ${name}: radius ${radiusAbout(pts, c, axis).toFixed(3)}, ${blades}-fold symmetry error p95 ${symmetryError(pts, c, axis, Number(blades)).toFixed(4)}`)
    }
  }
  ```
  In `package.json` `scripts`, after `"models:mounts"`, add `"models:rig": "tsx tools/models/rig.ts",`.

- [ ] **Step 4: Run the test to verify it passes.**
  `npx vitest run tests/tools/models/rig.test.ts --maxWorkers=2; echo "rc=$?"`. Expected `rc=0`, 7 passed. Then `npx tsc --noEmit; echo "rc=$?"` and `npx eslint tools/models/rig.ts tests/tools/models/rig.test.ts --max-warnings 0; echo "rc=$?"`. `tsc` fails on `./stages/yaw.js` until Task 2. If it does, commit Tasks 1 and 2 together at the end of Task 2, and record the reason in the ledger.

- [ ] **Step 5: Commit** (or defer to Task 2's commit, per Step 4):
  ```bash
  git add tools/models/rig.ts tests/tools/models/rig.test.ts package.json
  git commit -m "R3: measure articulated parts (hub, hinge, symmetry, yaw) and a models:rig CLI"
  ```

---

### Task 2: Pipeline — `normalize.yawDeg` and `dedupMaterials`

**Files:**
- Create: `tools/models/stages/yaw.ts`
- Create: `tools/models/stages/dedup.ts`
- Modify: `tools/models/manifest.ts` (`normalize` object; one new top-level field)
- Modify: `tools/models/build.ts` (`runPipeline`: two lines)
- Modify: `tools/models/inspect.ts` (CLI block only)
- Test: `tests/tools/models/r3Stages.test.ts` (new)

**Interfaces:**
- Produces:
  - `yawScene(doc: Document, up: Axis, yawDeg: number): void`
  - `dedupMaterials(doc: Document): Promise<void>`
  - `ModelEntry['normalize']['yawDeg']?: number`, nonzero and in (−180, 180]
  - `ModelEntry['dedupMaterials']?: true`
- Consumes: Task 1's `principalYawDeg`, `worldPositions`.

- [ ] **Step 1: Write the failing test** `tests/tools/models/r3Stages.test.ts`:
  ```ts
  // tests/tools/models/r3Stages.test.ts
  import { describe, expect, it } from 'vitest'
  import { getBounds } from '@gltf-transform/functions'
  import { yawScene } from '../../../tools/models/stages/yaw.js'
  import { runPipeline } from '../../../tools/models/build.js'
  import { parseModelEntry } from '../../../tools/models/manifest.js'
  import { onlyScene } from '../../../tools/models/document.js'
  import { principalYawDeg, worldPositions } from '../../../tools/models/rig.js'
  import { addMeshNode, boxesPrimitive, newDocument } from './fixtures.js'

  const UID = '0123456789abcdef0123456789abcdef'
  const base = {
    id: 'toy',
    input: 'tools/models/cache/toy.glb',
    output: 'content/aircraft/toy.glb',
    source: { url: `https://sketchfab.com/3d-models/toy-${UID}`, uid: UID, author: 'a', license: 'CC-BY-4.0' },
    textures: { maxSize: 512, format: 'webp' },
    budget: { maxBytes: 1_000_000, maxTriangles: 10_000, maxDrawCalls: 10 },
  }

  /** A 10 x 1 x 2 box along x, turned `deg` about +y by its node, as a showcase pose would be. */
  function posed(deg: number) {
    const doc = newDocument()
    const node = addMeshNode(doc, 'Body', [boxesPrimitive(doc, [[[-5, 0, -1], [5, 1, 1]]])])
    const h = (deg * Math.PI) / 360
    node.setRotation([0, Math.sin(h), 0, Math.cos(h)])
    return { doc, node }
  }

  describe('normalize.yawDeg (R3)', () => {
    it('principalYawDeg reads the pose, and yawScene by that squares the model to the axes', () => {
      const { doc, node } = posed(30)
      const yaw = principalYawDeg(worldPositions(node))
      expect(yaw).toBeCloseTo(-30, 6)
      yawScene(doc, '+y', yaw)
      const b = getBounds(onlyScene(doc))
      ;[-5, 0, -1].forEach((v, i) => expect(b.min[i]).toBeCloseTo(v, 5))
      ;[5, 1, 1].forEach((v, i) => expect(b.max[i]).toBeCloseTo(v, 5))
    })

    it('runs first in the pipeline: a yawed entry fits its span on the squared model', async () => {
      const { doc } = posed(30)
      const entry = parseModelEntry({ ...base, normalize: { forward: '+x', up: '+y', origin: [0, 0, 0], yawDeg: -30, fit: { extent: 'span', meters: 2 } } })
      await runPipeline(doc, entry)
      const b = getBounds(onlyScene(doc))
      expect(b.max[0] - b.min[0]).toBeCloseTo(10, 4)
      expect(b.max[2] - b.min[2]).toBeCloseTo(2, 4)
    })

    it('the schema: nonzero, in (-180, 180], inside normalize only', () => {
      const n = { forward: '+x', up: '+y', origin: [0, 0, 0], fit: { extent: 'span', meters: 2 } }
      expect(() => parseModelEntry({ ...base, normalize: { ...n, yawDeg: 0 } })).toThrow(/nonzero and in \(-180, 180\]/)
      expect(() => parseModelEntry({ ...base, normalize: { ...n, yawDeg: -180 } })).toThrow(/nonzero and in \(-180, 180\]/)
      expect(parseModelEntry({ ...base, normalize: { ...n, yawDeg: 180 } }).normalize!.yawDeg).toBe(180)
      expect(() => parseModelEntry({ ...base, yawDeg: 30 })).toThrow()
    })
  })

  describe('dedupMaterials (R3)', () => {
    function twoLookalikes() {
      const doc = newDocument()
      const a = doc.createMaterial('part-FACES').setBaseColorFactor([0.5, 0.5, 0.5, 1])
      const b = doc.createMaterial('part-FACES_7').setBaseColorFactor([0.5, 0.5, 0.5, 1])
      addMeshNode(doc, 'A', [boxesPrimitive(doc, [[[0, 0, 0], [1, 1, 1]]], a)])
      addMeshNode(doc, 'B', [boxesPrimitive(doc, [[[2, 0, 0], [3, 1, 1]]], b)])
      return doc
    }
    const normalize = { forward: '+x', up: '+y', origin: [0, 0, 0], fit: { extent: 'length', meters: 3 } }

    it('merges identical materials whatever their names, so join makes one draw', async () => {
      const doc = twoLookalikes()
      await runPipeline(doc, parseModelEntry({ ...base, normalize, dedupMaterials: true }))
      expect(doc.getRoot().listMaterials()).toHaveLength(1)
      expect(doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())).toHaveLength(1)
    })

    it('is off by default: the same document keeps both', async () => {
      const doc = twoLookalikes()
      await runPipeline(doc, parseModelEntry({ ...base, normalize }))
      expect(doc.getRoot().listMaterials()).toHaveLength(2)
    })
  })
  ```

- [ ] **Step 2: Run it to verify it fails.**
  `npx vitest run tests/tools/models/r3Stages.test.ts --maxWorkers=2; echo "rc=$?"`. Expected: FAIL, the yaw module is missing.

- [ ] **Step 3: Implement.**
  `tools/models/stages/yaw.ts`:
  ```ts
  // tools/models/stages/yaw.ts
  import type { Document } from '@gltf-transform/core'
  import type { Axis } from '../manifest.js'
  import { onlyScene } from '../document.js'
  import { axisVector } from './axes.js'

  /**
   * Stage 0 (R3): turns the whole scene `yawDeg` (right-handed) about the source `up` axis
   * through the source origin, so a download posed at an angle faces an axis. manilov.ap's
   * files are showcase-posed about 31 deg off (measured 2026-09-26). Every later coordinate in
   * the entry (split boxes, pivots, origin) is in this turned frame, which
   * `npm run models:inspect -- <glb> --yaw <deg>` and `npm run models:rig -- ... --yaw <deg>`
   * print. It wraps the scene's roots in one node; collapse, split and normalize read world
   * matrices, and normalize's clean-up dissolves the wrapper.
   */
  export function yawScene(doc: Document, up: Axis, yawDeg: number): void {
    if (yawDeg === 0) return
    const scene = onlyScene(doc)
    const [ax, ay, az] = axisVector(up)
    const h = (yawDeg * Math.PI) / 360
    const s = Math.sin(h)
    const wrap = doc.createNode('__r3_yaw').setRotation([ax * s, ay * s, az * s, Math.cos(h)])
    for (const child of scene.listChildren()) {
      scene.removeChild(child)
      wrap.addChild(child)
    }
    scene.addChild(wrap)
  }
  ```
  `tools/models/stages/dedup.ts`:
  ```ts
  // tools/models/stages/dedup.ts
  import { PropertyType, type Document } from '@gltf-transform/core'
  import { dedup } from '@gltf-transform/functions'

  /**
   * Opt-in (R3, an entry's `dedupMaterials: true`): merges byte-identical textures, then identical
   * materials, names ignored, before join. manilov.ap's downloads carry one material per
   * sub-object (the F4U 65, the Ki-43 68, measured 2026-09-26), and join groups by material, so
   * without this each would draw once per part. Off by default: no existing output changes.
   */
  export async function dedupMaterials(doc: Document): Promise<void> {
    await doc.transform(dedup({ propertyTypes: [PropertyType.TEXTURE, PropertyType.MATERIAL] }))
  }
  ```
  In `tools/models/manifest.ts`, replace the `normalize:` object with:
  ```ts
    normalize: z.object({
      forward: axis,
      up: axis,
      origin: vec3,
      /** R3: turns the whole source about `up` by this many degrees first (a showcase pose), so
       *  every other coordinate in the entry is in the turned frame (`models:inspect -- <glb> --yaw <deg>`). */
      yawDeg: finite.refine((v) => v !== 0 && v > -180 && v <= 180, { message: 'must be nonzero and in (-180, 180]' }).optional(),
      fit: z.object({ extent: z.enum(['span', 'length']), meters: positive }).strict(),
    }).strict().optional(),
  ```
  After the `opaque` line, add:
  ```ts
    /** R3: merge identical textures and materials before join (a download with one material per part). */
    dedupMaterials: z.literal(true).optional(),
  ```
  In `tools/models/build.ts`, add `import { yawScene } from './stages/yaw.js'` and `import { dedupMaterials } from './stages/dedup.js'`. In `runPipeline`, directly after `doc.setLogger(...)`, add:
  ```ts
    // 0. yaw (R3): square a posed download to the axes before anything reads a coordinate
    if (entry.normalize?.yawDeg !== undefined) yawScene(doc, entry.normalize.up, entry.normalize.yawDeg)
  ```
  Directly before `// 5. join everything except the parts`, add:
  ```ts
    if (entry.dedupMaterials) await dedupMaterials(doc)
  ```
  In `tools/models/inspect.ts`, replace the `if (process.argv[1] === …)` block with:
  ```ts
  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const [file, ...rest] = process.argv.slice(2)
    if (!file) {
      console.error('usage: npm run models:inspect -- <file.glb> [--yaw <deg> [--up <axis>]]')
      process.exit(2)
    }
    const doc = await modelIO().readBinary(new Uint8Array(readFileSync(file)))
    const yawAt = rest.indexOf('--yaw'), upAt = rest.indexOf('--up')
    const up = (upAt >= 0 ? rest[upAt + 1] : '+y') as Axis
    if (!AXES.includes(up)) {
      console.error(`--up must be one of ${AXES.join(' ')}`)
      process.exit(2)
    }
    if (yawAt >= 0) yawScene(doc, up, Number(rest[yawAt + 1]))
    console.log(inspectDocument(doc, yawAt >= 0 ? `${file} (turned ${rest[yawAt + 1]} deg about ${up})` : file))
  }
  ```
  with `import { AXES, type Axis } from './manifest.js'` and `import { yawScene } from './stages/yaw.js'` at the top.

- [ ] **Step 4: Run the tests.**
  ```bash
  npx vitest run tests/tools/models/r3Stages.test.ts tests/tools/models/rig.test.ts tests/tools/models/build.test.ts tests/tools/models/manifest.test.ts tests/tools/models/geometryStages.test.ts tests/tools/models/outputs.test.ts --maxWorkers=2; echo "rc=$?"
  ```
  Expected `rc=0`. `build.test.ts`'s `TOY_SHA256_BEFORE_O1` must still pass: that proves P8. Then run `tsc` and `eslint` on the touched files.

- [ ] **Step 5: Commit.**
  ```bash
  git add tools/models/stages/yaw.ts tools/models/stages/dedup.ts tools/models/manifest.ts tools/models/build.ts tools/models/inspect.ts tests/tools/models/r3Stages.test.ts
  git commit -m "R3: opt-in normalize.yawDeg and dedupMaterials stages; inspect --yaw"
  ```

---

### Task 3: The generic rigged airframe

**Files:**
- Create: `src/render/scene/airframeRigs.ts`
- Create: `src/render/scene/pivotedAirframe.ts`
- Modify: `src/render/scene/airframes.ts`
- Modify: `src/render/content.ts` (two exports after `shipModelUrl`)
- Test: `tests/render/pivotedAirframe.test.ts` (new); `tests/render/airframes.test.ts` (one case changed, one added)

**Interfaces:**
- Produces:
  - `AIRFRAME_RIGS: Readonly<Record<string, AirframeRig>>`, plus the types `AirframeRig`, `PropRig`, `GearRig` and `Retracts = 'inboard' | 'forward' | 'aft'`, and `PART_NAME: RegExp`
  - `loadPivotedAirframe(modelId, url, rig, stores, acquire?): Promise<Airframe>`
  - `pivotAxisOf(node, modelId): Vector3`
  - `gearAngleRad(g, gearFraction): number`
  - `turnedAbout(rest, axis, angleRad): Quaternion`
  - `rigParts(rig): PartId[]`
  - `aircraftModelPath(id)` / `aircraftModelUrl(id)`
  - Every `AIRFRAME_RIGS` id is registered in `AIRFRAME_MODELS`.
- Consumes: `propAngle` and `Airframe` from `airframe.ts`; `ModelInstance` and `acquireModel` from `modelCache.ts`.

- [ ] **Step 1: Write the failing test** `tests/render/pivotedAirframe.test.ts`:
  ```ts
  // tests/render/pivotedAirframe.test.ts
  import { describe, expect, it } from 'vitest'
  import { Group, Object3D, Quaternion, Vector3 } from 'three'
  import type { ModelInstance } from '../../src/render/models/modelCache.js'
  import { gearAngleRad, loadPivotedAirframe, pivotAxisOf, rigParts, turnedAbout } from '../../src/render/scene/pivotedAirframe.js'
  import { AIRFRAME_RIGS, PART_NAME, type AirframeRig } from '../../src/render/scene/airframeRigs.js'
  import { propAngle } from '../../src/render/scene/airframe.js'

  const RIG: AirframeRig = {
    props: [{ node: 'Prop', blades: 3 }],
    gear: [
      { node: 'GearL', upAngleDeg: -90, retracts: 'inboard', source: 'test' },
      { node: 'GearR', upAngleDeg: 90, retracts: 'inboard', source: 'test' },
    ],
    turrets: [],
  }

  /** A synthetic instance: one Object3D per name, with the pivot axis the build would bake. */
  function fake(axes: Record<string, number[] | undefined>): { inst: ModelInstance; released: () => number } {
    const root = new Group()
    for (const [name, axis] of Object.entries(axes)) {
      const o = new Object3D()
      o.name = name
      if (axis) o.userData.pivotAxis = axis
      root.add(o)
    }
    let n = 0
    return {
      inst: { root, node: (name) => { const o = root.getObjectByName(name); if (!o) throw new Error(`no node "${name}"`); return o }, release: () => { n++ } },
      released: () => n,
    }
  }
  const zero = { flapFraction: 0, controls: { roll: 0, pitch: 0, yaw: 0 }, cameraDistanceM: 0 }

  describe('the pivoted airframe (R3)', () => {
    it('gearAngleRad: down (1) is 0, up (0) is the rig angle, and it clamps', () => {
      const g = RIG.gear[1]!
      expect(gearAngleRad(g, 1)).toBe(0)
      expect(gearAngleRad(g, 0)).toBeCloseTo(Math.PI / 2, 12)
      expect(gearAngleRad(g, -3)).toBeCloseTo(Math.PI / 2, 12)
      expect(gearAngleRad(g, 7)).toBe(0)
    })

    it('rigParts: props and gear only, never stores', () => {
      expect(rigParts(RIG)).toEqual(['prop', 'gear'])
      expect(rigParts({ props: [{ node: 'Prop', blades: 3 }], gear: [], turrets: ['Turret1'] })).toEqual(['prop'])
      expect(rigParts({ props: [], gear: [], turrets: [] })).toEqual([])
    })

    it('turns each leg about its own baked axis, from its rest pose, and spins the prop by propAngle', async () => {
      const { inst } = fake({ Prop: [1, 0, 0], GearL: [1, 0, 0], GearR: [1, 0, 0] })
      const rest = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.1)
      inst.node('GearR').quaternion.copy(rest)
      const a = await loadPivotedAirframe('toy', 'toy.glb', RIG, undefined, async () => inst)
      expect(a.parts).toEqual(['prop', 'gear'])
      a.update({ ...zero, gearFraction: 1, throttle: 0, frameS: 0 })
      expect(inst.node('GearR').quaternion.angleTo(rest)).toBeLessThan(1e-9)
      a.update({ ...zero, gearFraction: 0, throttle: 1, frameS: 0.05 })
      const want = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2).multiply(rest)
      expect(inst.node('GearR').quaternion.angleTo(want)).toBeLessThan(1e-9)
      const spun = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), propAngle(0, 1, 0.05))
      expect(inst.node('Prop').quaternion.angleTo(spun)).toBeLessThan(1e-9)
      a.update({ ...zero, gearFraction: 0, throttle: 0, frameS: 1 })
      expect(inst.node('Prop').quaternion.angleTo(spun)).toBeLessThan(1e-9) // throttle 0: the prop stops
    })

    it('a part with no baked pivot axis throws, naming the model and node, and releases the instance (Review Focus 1)', async () => {
      const { inst, released } = fake({ Prop: undefined, GearL: [1, 0, 0], GearR: [1, 0, 0] })
      await expect(loadPivotedAirframe('toy', 'toy.glb', RIG, undefined, async () => inst)).rejects.toThrow(/toy: node "Prop" has no pivotAxis/)
      expect(released()).toBe(1)
    })

    it('refuses stores before it fetches anything (Review Focus 2)', async () => {
      let fetched = 0
      const stores = { racks: [], rails: [] }
      await expect(loadPivotedAirframe('f6f-hellcat', 'x.glb', RIG, stores, async () => { fetched++; return fake({}).inst }))
        .rejects.toThrow(/f6f-hellcat: a rigged model hangs no stores/)
      expect(fetched).toBe(0)
    })

    it('pivotAxisOf rejects a non-unit axis; dispose releases once', async () => {
      const o = new Object3D()
      o.name = 'Prop'
      o.userData.pivotAxis = [2, 0, 0]
      expect(() => pivotAxisOf(o, 'toy')).toThrow(/not a unit vector/)
      const { inst, released } = fake({ Prop: [1, 0, 0], GearL: [1, 0, 0], GearR: [1, 0, 0] })
      const a = await loadPivotedAirframe('toy', 'toy.glb', RIG, undefined, async () => inst)
      a.dispose()
      a.dispose()
      expect(released()).toBe(1)
    })

    it('turnedAbout turns in the parent frame (premultiplies the rest pose)', () => {
      const rest = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.3)
      const q = turnedAbout(rest, new Vector3(1, 0, 0), 0.5)
      expect(q.angleTo(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.5).multiply(rest))).toBeLessThan(1e-12)
    })
  })

  describe('AIRFRAME_RIGS (R3)', () => {
    it('names parts by the convention, numbers props and turrets 1..N, and gives sane blade counts and angles', () => {
      for (const [id, rig] of Object.entries(AIRFRAME_RIGS)) {
        for (const n of [...rig.props.map((p) => p.node), ...rig.gear.map((g) => g.node), ...rig.turrets]) expect(n, id).toMatch(PART_NAME)
        expect(rig.turrets, id).toEqual(rig.turrets.map((_, i) => `Turret${i + 1}`))
        const props = rig.props.map((p) => p.node)
        expect(props, id).toEqual(props.length === 1 ? ['Prop'] : props.map((_, i) => `Prop${i + 1}`))
        for (const p of rig.props) expect(Number.isInteger(p.blades) && p.blades >= 2 && p.blades <= 6, `${id} ${p.node}`).toBe(true)
        for (const g of rig.gear) expect(Math.abs(g.upAngleDeg) > 0 && Math.abs(g.upAngleDeg) <= 180, `${id} ${g.node}`).toBe(true)
      }
    })
  })
  ```
  In `tests/render/airframes.test.ts`, replace the `'an unregistered id throws …'` case with:
  ```ts
    it('an unregistered id throws naming the id and the registered ones, including prototype keys', () => {
      expect(() => airframeFor('no-such-model')).toThrow(/"no-such-model".*registered: wildcat/)
      expect(() => airframeFor('constructor')).toThrow(/"constructor"/)
    })

    it('registers every rigged model (R3), and the Wildcat keeps its own module', () => {
      for (const id of Object.keys(AIRFRAME_RIGS)) expect(Object.hasOwn(AIRFRAME_MODELS, id), id).toBe(true)
      expect(Object.hasOwn(AIRFRAME_RIGS, 'wildcat')).toBe(false)
    })
  ```
  Also add `import { AIRFRAME_RIGS } from '../../src/render/scene/airframeRigs.js'` to that file.

- [ ] **Step 2: Run to verify failure.**
  `npx vitest run tests/render/pivotedAirframe.test.ts tests/render/airframes.test.ts --maxWorkers=2; echo "rc=$?"`. Expected: FAIL, modules missing.

- [ ] **Step 3: Implement.**
  `src/render/scene/airframeRigs.ts`:
  ```ts
  // src/render/scene/airframeRigs.ts
  /**
   * How each rigged aircraft model moves (R3). Pure data, no three.js, so Node tests and the
   * Playwright spec read it too. The glb already carries each part's hinge point and axis (the
   * build's pivot stage, tools/models/stages/pivot.ts); this adds only what a file cannot say.
   * Part names (docs/models.md §5): `Prop`, or `Prop1`...`PropN` from port (-z) to starboard;
   * `GearL`, `GearR`, `GearNose`, `Tailwheel`; `Turret1`...`TurretN` nose to tail, dorsal before
   * ventral at one station. Every id here is registered in AIRFRAME_MODELS (airframes.ts), and
   * tests/tools/models/aircraftRigs.test.ts proves each rig against its committed glb.
   */
  export type Retracts = 'inboard' | 'forward' | 'aft'

  export interface PropRig {
    readonly node: string
    readonly blades: number
    /** Allowed symmetry error as a fraction of the radius, when a source prop is not symmetric to 1% (a measured Ruling). */
    readonly symmetryTolerance?: number
  }

  export interface GearRig {
    readonly node: string
    /** Signed turn, right-handed about the node's baked pivot axis, from down (fraction 1) to up (0). */
    readonly upAngleDeg: number
    /** Which way the leg goes as it retracts; the committed-glb test checks upAngleDeg's sign against it. */
    readonly retracts: Retracts
    /** Where the motion comes from, or ESTIMATE. */
    readonly source: string
  }

  export interface AirframeRig {
    readonly props: readonly PropRig[]
    readonly gear: readonly GearRig[]
    /** Named for H3, static until then. */
    readonly turrets: readonly string[]
  }

  export const PART_NAME = /^(Prop\d*|GearL|GearR|GearNose|Tailwheel|Turret\d+)$/

  export const AIRFRAME_RIGS: Readonly<Record<string, AirframeRig>> = {
  }
  ```
  `src/render/scene/pivotedAirframe.ts`:
  ```ts
  // src/render/scene/pivotedAirframe.ts
  import { Group, Quaternion, Vector3, type Object3D } from 'three'
  import { propAngle, type Airframe, type PartId } from './airframe.js'
  import { acquireModel, type ModelInstance } from '../models/modelCache.js'
  import type { AirframeRig, GearRig } from './airframeRigs.js'
  import type { StoreMounts } from './stores.js'

  /**
   * One airframe from a rigged glb (R3): its articulated parts were pivoted by the build (each
   * node's origin on its hinge, its axis in userData.pivotAxis), and airframeRigs.ts says how far
   * each turns. One module for every rigged model, where a hand-written module per aircraft
   * would repeat this plumbing eleven times. wildcat.ts stays: its gear poses come from a baked clip.
   */

  /** The unit axis the build baked into `node`. Throws, naming the model and node, if absent. */
  export function pivotAxisOf(node: Object3D, modelId: string): Vector3 {
    const a: unknown = node.userData['pivotAxis']
    if (!Array.isArray(a) || a.length !== 3 || !a.every((v) => typeof v === 'number' && Number.isFinite(v))) {
      throw new Error(`${modelId}: node "${node.name}" has no pivotAxis; give its keep or split entry a pivot in tools/models/entries/${modelId}.json`)
    }
    const v = new Vector3(a[0] as number, a[1] as number, a[2] as number)
    if (Math.abs(v.length() - 1) > 1e-6) throw new Error(`${modelId}: node "${node.name}" pivotAxis is not a unit vector (${v.toArray().join(', ')})`)
    return v
  }

  /** Radians a leg is turned about its axis at `gearFraction`: 1 (down) is 0, 0 (up) is upAngleDeg. */
  export function gearAngleRad(g: GearRig, gearFraction: number): number {
    const f = Math.min(1, Math.max(0, gearFraction))
    return ((1 - f) * g.upAngleDeg * Math.PI) / 180
  }

  /** `rest` turned `angleRad` about `axis`, with the axis in the node's parent frame. */
  export function turnedAbout(rest: Quaternion, axis: Vector3, angleRad: number): Quaternion {
    return new Quaternion().setFromAxisAngle(axis, angleRad).multiply(rest)
  }

  /** The bench parts a rig drives. Never stores: a rigged model's mounts were never measured. */
  export function rigParts(rig: AirframeRig): PartId[] {
    const parts: PartId[] = []
    if (rig.props.length > 0) parts.push('prop')
    if (rig.gear.length > 0) parts.push('gear')
    return parts
  }

  interface Posed { readonly node: Object3D; readonly axis: Vector3; readonly rest: Quaternion }

  function bind(instance: ModelInstance, modelId: string, rig: AirframeRig): { props: Posed[]; gear: { posed: Posed; rig: GearRig }[] } {
    const pose = (name: string): Posed => {
      const node = instance.node(name)
      return { node, axis: pivotAxisOf(node, modelId), rest: node.quaternion.clone() }
    }
    return { props: rig.props.map((p) => pose(p.node)), gear: rig.gear.map((g) => ({ posed: pose(g.node), rig: g })) }
  }

  export async function loadPivotedAirframe(modelId: string, url: string, rig: AirframeRig, stores: StoreMounts | undefined, acquire: (url: string) => Promise<ModelInstance> = acquireModel): Promise<Airframe> {
    if (stores !== undefined) {
      throw new Error(`${modelId}: a rigged model hangs no stores (its racks and rails were never measured); draw this spec with view.model "wildcat", or measure mounts for ${modelId} first`)
    }
    const instance = await acquire(url)
    const bound = ((): ReturnType<typeof bind> => {
      try {
        return bind(instance, modelId, rig)
      } catch (e) {
        instance.release()
        throw e
      }
    })()
    const root = new Group()
    root.name = modelId
    root.add(instance.root)
    root.traverse((o) => { o.receiveShadow = true })
    let propRad = 0
    let disposed = false
    return {
      root,
      parts: rigParts(rig),
      setStores(): void {
        // A rigged model hangs no stores: loadPivotedAirframe refuses a spec that has them.
      },
      update(u): void {
        propRad = propAngle(propRad, u.throttle, u.frameS)
        for (const p of bound.props) p.node.quaternion.copy(turnedAbout(p.rest, p.axis, propRad))
        for (const g of bound.gear) g.posed.node.quaternion.copy(turnedAbout(g.posed.rest, g.posed.axis, gearAngleRad(g.rig, u.gearFraction)))
      },
      dispose(): void {
        if (disposed) return
        disposed = true
        instance.release()
      },
    }
  }
  ```
  In `src/render/content.ts`, after `shipModelUrl`, add:
  ```ts
  /** An aircraft's committed model (R3): content/aircraft/<id>.glb, built by tools/models/entries/<id>.json. */
  export const aircraftModelPath = (id: string): string => `content/aircraft/${id}.glb`
  export const aircraftModelUrl = (id: string): string => `${import.meta.env.BASE_URL}${aircraftModelPath(id)}`
  ```
  In `src/render/scene/airframes.ts`, add the imports and replace the `AIRFRAME_MODELS` literal:
  ```ts
  import { AIRFRAME_RIGS } from './airframeRigs.js'
  import { loadPivotedAirframe } from './pivotedAirframe.js'
  import { aircraftModelUrl } from '../content.js'
  ```
  ```ts
  export const AIRFRAME_MODELS: Readonly<Record<string, AirframeLoader>> = {
    wildcat: (stores) => loadWildcat(stores),
    // R3: every rigged model, through the one generic module (airframeRigs.ts says how each moves).
    ...Object.fromEntries(Object.entries(AIRFRAME_RIGS).map(([id, rig]) => [id, (stores: StoreMounts | undefined) => loadPivotedAirframe(id, aircraftModelUrl(id), rig, stores)])),
  }
  ```
  Update the doc comment above it: after "(A6M Zero spec §7.2)", add "Rigged models (R3) register from `airframeRigs.ts`."

- [ ] **Step 4: Run the tests.**
  ```bash
  npx vitest run tests/render/pivotedAirframe.test.ts tests/render/airframes.test.ts tests/render/hangar --maxWorkers=2; echo "rc=$?"
  npx depcruise src --config .dependency-cruiser.cjs; echo "rc=$?"
  ```
  Expected `rc=0` twice. Then run `tsc` and `eslint` on the touched files.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/render/scene/airframeRigs.ts src/render/scene/pivotedAirframe.ts src/render/scene/airframes.ts src/render/content.ts tests/render/pivotedAirframe.test.ts tests/render/airframes.test.ts
  git commit -m "R3: one generic airframe module for rigged models, posed from a data table"
  ```

---

### The Sketchfab procedure (Tasks 4–11 each run it with their own values)

This is shared reference, not a task. Each task below gives every value it needs; this section only fixes the order and the commands.

1. **License.** Replace `<uid>` with the task's uid:
   ```bash
   curl -sS "https://api.sketchfab.com/v3/models/<uid>" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['uid'], d['user']['username'], (d.get('license') or {}).get('slug'), d['viewerUrl'], d['isDownloadable'])"
   ```
   Expected: `<uid> <author> by <the task's URL> True`. Anything else is a license mismatch, and a fallback (P11).
2. **Inspect:** `npm run models:inspect -- tools/models/cache/<file> > .superpowers/sdd/r3/inspect-<id>.txt`. Read the whole file. Find:
   - the parts: propeller(s), gear legs, tailwheel, turrets;
   - anything that is not the airplane: figures, stands, bombs, tanks, cockpit instruments;
   - the forward and up axes.
3. **Yaw.** Run `npm run models:rig -- tools/models/cache/<file> <largest fuselage node>`. Take its `principal yaw`. Use that value, or that value + 180 (so the propeller ends up at +forward), as `normalize.yawDeg`. Then re-inspect with `--yaw <deg>` and confirm that the bounds are squared: their span-to-length ratio is within 4% of the cited span ÷ length. Skip this step when the task says the file is already squared.
4. **Pivots.** For each part:
   - a propeller: `npm run models:rig -- <file> <node> --yaw <deg> --blades <N> --axis <forward>`. Its centroid is the hub. Accept it only if the printed symmetry error is ≤ 1% of the printed radius.
   - a gear leg: `npm run models:rig -- <file> <node> --yaw <deg>`. Its `top hinge estimate` is the pivot.
   - a part inside a fused mesh: use `box:…` in place of a node name, to measure a `split` island.

   Record every printed line in the ledger.
5. **Entry.** Write `tools/models/entries/<id>.json` with the task's fixed fields and the measured values from 3–4. Name kept or split nodes per P6, give every one a `pivot`, set `perNode` ratio 1 on every propeller source node (P9), and set `noseNode` for a single-engine type.
6. **Build and look:**
   ```bash
   npm run models:build -- <id>; echo "rc=$?"
   blender -b --factory-startup --python-exit-code 1 -P tools/models/blender/preview.py -- .superpowers/sdd/r3/<id>-front.png --glb content/aircraft/<id>.glb --view front
   blender -b --factory-startup --python-exit-code 1 -P tools/models/blender/preview.py -- .superpowers/sdd/r3/<id>-below.png --glb content/aircraft/<id>.glb --view below
   ```
   **Read both PNGs.** Also render the raw download the same way, from `tools/models/cache/<file>`, and compare the silhouettes. If the build is over budget, lower `simplify.ratio` in steps of 0.05, or lower `textures.maxSize` to 512. Stop at the first setting that fits with no visible silhouette loss. A model that fits only with visible loss is a fallback (P11).
7. **Register and link:**
   - add the task's `AIRFRAME_RIGS` row, without any part the inspection found fused (P11, P14);
   - add `"model": { "kind": "aircraft", "id": "<id>" }` to `content/library/<library id>.json`, directly after its `"side"` line (not for the Zero);
   - remove the id from `NOT_YET_DRAWN`, and set `CEILING` to the new length;
   - add the task's `CITED` row to `tests/tools/models/aircraftDimensions.test.ts`;
   - set the credit pin in `tests/render/modelCredits.test.ts` to the task's string;
   - move the `ASSETS.md` row from "Candidate models" into the 3D-models table, in this form:
     ``| `content/aircraft/<id>.glb` | <url> | <author> | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required |``
8. **Test:**
   ```bash
   npx vitest run tests/tools/models/outputs.test.ts tests/tools/models/aircraftRigs.test.ts tests/tools/models/aircraftDimensions.test.ts tests/render/hangar tests/render/airframes.test.ts tests/render/pivotedAirframe.test.ts tests/render/modelCredits.test.ts --maxWorkers=2; echo "rc=$?"
   ```
   Expected `rc=0`. Then run `tsc` and `eslint` on the touched files.
9. **Commit** the entry, the glb, the rig row, the Library link, the allowlist, the credit pin, the dimensions row and `ASSETS.md` together.

**If a pick fails (P11):**
- leave its id on `NOT_YET_DRAWN`;
- record `Ruling: <id> falls back to Blender: <measured reason>`;
- delete its entry and output from the working tree;
- go on to the next task.

Task 16 authors every fallback.

---

### Task 4: The A6M2 Zero (carries out Z3's model half)

**Files:**
- Create: `tools/models/entries/a6m2-zero.json`, `content/aircraft/a6m2-zero.glb`
- Create: `tests/tools/models/aircraftRigs.test.ts`, `tests/tools/models/aircraftDimensions.test.ts`
- Modify: `src/render/scene/airframeRigs.ts` (the Zero's row)
- Modify: `content/aircraft/a6m2-zero.json` (`view.model`; two sentences in the `source` strings)
- Modify: `content/library/a6m-zero.json` (blurb), `content/library/f4f-wildcat.json` (blurb)
- Modify: `tools/models/blender/preview.py` (a `below` view)
- Modify: `tests/build/dist.test.ts`, `tests/render/modelCredits.test.ts`, `ASSETS.md`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `AIRFRAME_RIGS['a6m2-zero']`;
  - the generic committed-glb tests every later model task adds a row to: `CITED` in `aircraftDimensions.test.ts`, and the rig loop in `aircraftRigs.test.ts`, which reads `AIRFRAME_RIGS`.

Fixed values: file `a6m2-zeke.glb`; uid `d701787b75fa4c979792b0c0c14221e2`; URL `https://sketchfab.com/3d-models/mitsubishi-a6m2-zero-zeke-d701787b75fa4c979792b0c0c14221e2`; author `SavinienBerault`. Already squared to the axes (no yaw); forward `+x`, up `+y`, right `+z` (Zero design §2).

- [ ] **Step 1: Write the two generic committed-glb tests** (failing: no Zero glb yet).
  `tests/tools/models/aircraftDimensions.test.ts`:
  ```ts
  // tests/tools/models/aircraftDimensions.test.ts
  import { describe, expect, it } from 'vitest'
  import { readFileSync } from 'node:fs'
  import { getBounds } from '@gltf-transform/functions'
  import { loadModelEntries } from '../../../tools/models/manifest.js'
  import { modelIO } from '../../../tools/models/document.js'

  interface Cited {
    /** Omitted only where the model is measured with its wings folded (a Ruling names it). */
    readonly spanM?: number
    readonly lengthM: number
    /** Length tolerance for a download fitted to its span (P10); a Blender model is held to 1%. */
    readonly tolerance: number
    readonly source: string
  }

  /** Cited overall span and length (model-roster spec §7). A download is fitted to its span, so its
   *  length proves it depicts this variant; a Blender model is built from both, so both hold to 1%. */
  const CITED: Readonly<Record<string, Cited>> = {
    'a6m2-zero': { spanM: 12.0, lengthM: 9.06, tolerance: 0.06, source: "English Wikipedia 'Mitsubishi A6M Zero', Specifications (A6M2 Type 0 Model 21), read 2026-09-25, as content/aircraft/a6m2-zero.json cites it. Tolerance 6%, not 4%: the chosen model measures 9.52 m at a 12.0 m span (R3 plan, P10)" },
  }

  const aircraft = loadModelEntries().filter((e) => e.output.startsWith('content/aircraft/') && e.id !== 'wildcat')

  describe('every aircraft model carries its cited span and length (R3)', () => {
    it('every aircraft entry but the frozen Wildcat has a cited row, and every row has an entry', () => {
      expect(aircraft.map((e) => e.id).sort()).toEqual(Object.keys(CITED).sort())
    })

    it('every row cites a source with a read date', () => {
      for (const [id, c] of Object.entries(CITED)) expect(c.source, id).toMatch(/read \d{4}-\d{2}-\d{2}/)
    })

    it.each(aircraft.map((e) => [e.id, e] as const))('%s', async (id, entry) => {
      const c = CITED[id]!
      const tol = entry.source.kind === 'blender' ? 0.01 : c.tolerance
      const doc = await modelIO().readBinary(new Uint8Array(readFileSync(entry.output)))
      const b = getBounds(doc.getRoot().listScenes()[0]!)
      const length = b.max[0] - b.min[0], span = b.max[2] - b.min[2]
      expect(Math.abs(length - c.lengthM) / c.lengthM, `${id}: length ${length.toFixed(3)} m, cited ${c.lengthM}`).toBeLessThanOrEqual(tol)
      if (c.spanM !== undefined) expect(Math.abs(span - c.spanM) / c.spanM, `${id}: span ${span.toFixed(3)} m, cited ${c.spanM}`).toBeLessThanOrEqual(0.01)
    })
  })
  ```
  `tests/tools/models/aircraftRigs.test.ts`:
  ```ts
  // tests/tools/models/aircraftRigs.test.ts
  import { beforeAll, describe, expect, it } from 'vitest'
  import { existsSync, readdirSync, readFileSync } from 'node:fs'
  import type { Document, Node } from '@gltf-transform/core'
  import { AIRFRAME_RIGS, type GearRig } from '../../../src/render/scene/airframeRigs.js'
  import { loadModelEntries } from '../../../tools/models/manifest.js'
  import { modelIO } from '../../../tools/models/document.js'
  import { bounds, centroid, radiusAbout, rotateAbout, symmetryError, worldPositions, type Vec3 } from '../../../tools/models/rig.js'
  import { loadAircraftSpec } from '../../../tools/content/load.js'

  const entries = loadModelEntries()
  const specIds = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
  const named = (doc: Document, name: string): Node[] => doc.getRoot().listNodes().filter((n) => n.getName() === name)
  const one = (doc: Document, name: string): Node => { const n = named(doc, name); expect(n, name).toHaveLength(1); return n[0]! }
  function pivotOf(n: Node): { point: Vec3; axis: Vec3 } {
    const axis = n.getExtras()['pivotAxis'] as number[] | undefined
    expect(axis, `${n.getName()} carries no pivotAxis`).toBeDefined()
    return { point: [...n.getWorldTranslation()] as unknown as Vec3, axis: axis as unknown as Vec3 }
  }
  const MAIN = new Set(['GearL', 'GearR'])

  /** Turning a leg to its up angle: how far its centroid rises, and how far it moves the declared way. */
  function retraction(points: readonly Vec3[], pivot: Vec3, axis: Vec3, g: GearRig): { up: number; along: number; height: number } {
    const b = bounds(points)
    const before = centroid(points)
    const after = centroid(points.map((p) => rotateAbout(p, pivot, axis, (g.upAngleDeg * Math.PI) / 180)))
    const along = g.retracts === 'inboard' ? Math.abs(before[2]) - Math.abs(after[2]) : g.retracts === 'forward' ? after[0] - before[0] : before[0] - after[0]
    return { up: after[1] - before[1], along, height: b.max[1] - b.min[1] }
  }

  describe.each(Object.entries(AIRFRAME_RIGS))('rig %s against its committed glb (R3)', (id, rig) => {
    let doc: Document
    beforeAll(async () => {
      doc = await modelIO().readBinary(new Uint8Array(readFileSync(`content/aircraft/${id}.glb`)))
    })

    it('has its manifest entry, writing a committed content/aircraft/<id>.glb', () => {
      expect(entries.find((e) => e.id === id)?.output).toBe(`content/aircraft/${id}.glb`)
      expect(existsSync(`content/aircraft/${id}.glb`)).toBe(true)
    })

    it('names every rigged part exactly once, each with a unit pivot axis', () => {
      for (const name of [...rig.props.map((p) => p.node), ...rig.gear.map((g) => g.node), ...rig.turrets]) {
        const { axis } = pivotOf(one(doc, name))
        expect(Math.hypot(...axis), `${name} axis length`).toBeCloseTo(1, 6)
      }
    })

    it('every propeller spins about body x and is N-fold symmetric about its pivot (Review Focus 1)', () => {
      for (const p of rig.props) {
        const { point, axis } = pivotOf(one(doc, p.node))
        expect(Math.abs(axis[0]), `${p.node} axis ${axis}`).toBeGreaterThan(0.999)
        const pts = worldPositions(one(doc, p.node))
        const radius = radiusAbout(pts, point, axis)
        expect(radius, `${p.node} radius`).toBeGreaterThan(0.5)
        const err = symmetryError(pts, point, axis, p.blades)
        expect(err / radius, `${p.node}: ${p.blades}-fold error ${err.toFixed(4)} m of radius ${radius.toFixed(3)}`).toBeLessThanOrEqual(p.symmetryTolerance ?? 0.01)
      }
    })

    it('every gear leg hinges at its top and retracts up and the declared way (Review Focus 4)', () => {
      for (const g of rig.gear) {
        const node = one(doc, g.node)
        const { point, axis } = pivotOf(node)
        const pts = worldPositions(node)
        const b = bounds(pts)
        expect(b.max[1] - point[1], `${g.node}: hinge ${point[1].toFixed(3)} vs top ${b.max[1].toFixed(3)}`).toBeLessThanOrEqual(0.2 * (b.max[1] - b.min[1]) + 0.05)
        const r = retraction(pts, point, axis, g)
        expect(r.up, `${g.node} rises`).toBeGreaterThan(0.25 * r.height)
        expect(r.along, `${g.node} moves ${g.retracts}`).toBeGreaterThan(0.25 * r.height)
      }
    })

    it('turrets run nose to tail, dorsal before ventral at one station, each on a vertical axis', () => {
      const centers = rig.turrets.map((t) => { const n = one(doc, t); expect(Math.abs(pivotOf(n).axis[1]), `${t} axis`).toBeGreaterThan(0.999); return centroid(worldPositions(n)) })
      for (let i = 0; i + 1 < centers.length; i++) {
        const [a, b] = [centers[i]!, centers[i + 1]!]
        expect(a[0] > b[0] + 0.5 || (Math.abs(a[0] - b[0]) <= 0.5 && a[1] > b[1]), `${rig.turrets[i]} before ${rig.turrets[i + 1]}`).toBe(true)
      }
    })

    it("stands on the gear height of every aircraft spec that draws it (Z3's gear.heightM, P1)", () => {
      const mains = rig.gear.filter((g) => MAIN.has(g.node))
      for (const spec of specIds.map((s) => loadAircraftSpec(s)).filter((s) => s.view.model === id)) {
        expect(mains.length, `${spec.id} draws ${id}, whose rig has no main gear`).toBeGreaterThan(0)
        const lowest = Math.min(...mains.flatMap((g) => worldPositions(one(doc, g.node)).map((p) => p[1])))
        expect(Math.abs(-lowest - spec.gear.heightM), `${spec.id}: wheels ${(-lowest).toFixed(3)} m below the origin, gear.heightM ${spec.gear.heightM}`).toBeLessThanOrEqual(0.05)
      }
    })
  })
  ```

- [ ] **Step 2: Measure the Zero** (Sketchfab procedure 1–4). Run the license check. Inspect. Then:
  ```bash
  npm run models:rig -- tools/models/cache/a6m2-zeke.glb Rotor --blades 3 --axis +x
  npm run models:rig -- tools/models/cache/a6m2-zeke.glb "Leg d"
  npm run models:rig -- tools/models/cache/a6m2-zeke.glb "Leg g"
  npm run models:rig -- tools/models/cache/a6m2-zeke.glb box:-182,-4,-25,-153,21,13
  ```
  Expected, from the Zero design's §2 values (2026-09-25):
  - the `Rotor` centroid's y and z near 129.2 and −6.3, with a symmetry error ≤ 1% of its radius. Use the centroid as the hub. The design notes that the bounding-box center (y ≈ 146.4) is wrong.
  - hinges near (168.5, 87.8, +101.5) for `Leg d` and (168.5, 87.8, −113.1) for `Leg g`.
  - the box: exactly the tailwheel island (≈ 1,810 triangles in x −180..−155, y −2..19). If the box also catches anything else, shrink it until it does not, and record the box.

  Then measure the CG origin. This is a scratch script, never committed. Write `.superpowers/sdd/r3/zero-origin.ts`:
  ```ts
  import { readFileSync } from 'node:fs'
  import { modelIO } from '../../../tools/models/document.js'
  import { sceneTriangles, wingSection } from '../../../tools/models/wingSection.js'
  const doc = await modelIO().readBinary(new Uint8Array(readFileSync('tools/models/cache/a6m2-zeke.glb')))
  const tris = sceneTriangles(doc, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
  // z = 81.7: 88 units (1.67 m) out from the centerline at z -6.3, clear of the rotor (z <= 69.3) and the legs (|z| >= 95).
  const s = wingSection(tris, 81.7, -100)
  console.log(JSON.stringify({ leadingX: s.leadingX, trailingX: s.trailingX, originX: s.leadingX - 0.25 * (s.leadingX - s.trailingX) }))
  ```
  Run `npx tsx .superpowers/sdd/r3/zero-origin.ts`. Its `originX` is the quarter chord at that station, which stands in for the CG. Record it as an ESTIMATE.

- [ ] **Step 3: Write the entry** `tools/models/entries/a6m2-zero.json`, with Step 2's measured values in the marked fields:
  ```json
  {
    "id": "a6m2-zero",
    "input": "tools/models/cache/a6m2-zeke.glb",
    "output": "content/aircraft/a6m2-zero.glb",
    "source": {
      "url": "https://sketchfab.com/3d-models/mitsubishi-a6m2-zero-zeke-d701787b75fa4c979792b0c0c14221e2",
      "uid": "d701787b75fa4c979792b0c0c14221e2",
      "author": "SavinienBerault",
      "license": "CC-BY-4.0"
    },
    "normalize": { "forward": "+x", "up": "+y", "origin": [ORIGIN_X, 129.2, -6.3], "fit": { "extent": "span", "meters": 12.0 } },
    "keep": [
      { "node": "Rotor", "as": "Prop", "pivot": { "point": [HUB_X, HUB_Y, HUB_Z], "axis": "+x" } },
      { "node": "Leg d", "as": "GearR", "pivot": { "point": [168.5, 87.8, 101.5], "axis": "+x" } },
      { "node": "Leg g", "as": "GearL", "pivot": { "point": [168.5, 87.8, -113.1], "axis": "+x" } }
    ],
    "split": [
      { "name": "Tailwheel", "select": "components", "boxMin": [-182, -4, -25], "boxMax": [-153, 21, 13], "pivot": { "point": [TW_X, TW_Y, TW_Z], "axis": "+z" } },
      { "name": "DropTank", "select": "triangles", "boxMin": [40, -10, -31], "boxMax": [160, 35, 19] }
    ],
    "remove": ["DropTank"],
    "simplify": { "ratio": 0.45, "error": 0.001, "perNode": { "Rotor": 1, "Verriere": 0.15, "Leg d": 0.5, "Leg g": 0.5 } },
    "textures": { "maxSize": 1024, "format": "webp" },
    "budget": { "maxBytes": 5600000, "maxTriangles": 100000, "maxDrawCalls": 12 },
    "noseNode": "Prop"
  }
  ```
  - `ORIGIN_X` is `zero-origin.ts`'s `originX`.
  - `HUB_X/Y/Z` is the `Rotor` centroid.
  - `TW_X/Y/Z` is the box's `top hinge estimate`.
  - Replace the two leg hinges with the measured ones if either differs from the design's by more than 0.5 units.

  Write the numbers themselves; the capitals mark where they go.

- [ ] **Step 4: Build, and settle the drop tank** (Zero design §3.2).
  - Build, then render `front` and `below` previews. First add the `below` view to `tools/models/blender/preview.py`:
    - make the view check `if view not in ('front', 'rear', 'below'):` with the message `--view must be front, rear or below`;
    - wrap the three `ground` lines in `if view != 'below':`;
    - replace the camera location line with:
    ```python
    if view == 'below':
        # Beneath and a little forward and aside, looking up at the belly (R3: the Zero's drop-tank cut).
        cam.location = center + Vector((radius * 1.2, -radius * 1.6, -radius * 3.0))
    else:
        cam.location = center + Vector((radius * 1.8, side * radius * 2.8, radius * 1.3))
    ```
  - **Read `a6m2-zero-below.png`.**
    - If the belly under the cut is closed, keep the cut.
    - If it shows a hole, remove the `DropTank` split and its `remove`, rebuild, and record `Ruling: the Zero keeps its drop tank; the cut opens the belly (Zero design §3.2 step 3)`.
  - If the build is over any budget, follow procedure step 6. The Zero design's stated fallback is to raise the budget with a measured Tier 2 p95, never to accept a damaged silhouette. Record any raise.

- [ ] **Step 5: The Zero's rig, its dimensions row, and the flip.**
  In `AIRFRAME_RIGS`:
  ```ts
    'a6m2-zero': {
      props: [{ node: 'Prop', blades: 3 }],
      gear: [
        { node: 'GearL', upAngleDeg: -90, retracts: 'inboard', source: "Summary 85: retracts 90 deg inward to the line of flight (A6M Zero spec §7.3)" },
        { node: 'GearR', upAngleDeg: 90, retracts: 'inboard', source: "Summary 85: retracts 90 deg inward to the line of flight (A6M Zero spec §7.3)" },
        { node: 'Tailwheel', upAngleDeg: 90, retracts: 'forward', source: 'ESTIMATE: Summary 85 says only "fully retractable" (A6M Zero spec §7.3)' },
      ],
      turrets: [],
    },
  ```
  In `content/aircraft/a6m2-zero.json`:
  - change `"model": "wildcat"` to `"model": "a6m2-zero"`;
  - in `reference.source`, replace `Z3 re-measures it from the built LOD0 mesh and re-runs the cards in the same commit. view.eyePointM = [-0.4, 0.85, 0] is an ESTIMATE, re-measured by Z3.` with `R3, which carried out Z3's model half, asserts it against the built mesh to 0.05 m (tests/tools/models/aircraftRigs.test.ts). view.eyePointM = [-0.4, 0.85, 0] is an ESTIMATE, to be re-measured when the Zero enters a scenario (deferred by the R3 plan).`;
  - in `combat.source`, replace `Z3 re-measures them from the built LOD0 mesh.` with `They are re-measured from the built mesh when the Zero enters a scenario (deferred by the R3 plan).`

  `content/library/a6m-zero.json` `blurb`: `The Imperial Navy's carrier fighter and the game's first hostile airframe, drawn with its own model. It flies in no shipped scenario yet.`

  `content/library/f4f-wildcat.json` `blurb`: `The rendered airframe of every aircraft in the shipped scenarios. It flies the Hellcat's placeholder numbers until it has its own trial data.`

  In `tests/build/dist.test.ts`, after the R1 Blender loop, add:
  ```ts
      // R3: every aircraft model reaches dist/ whole (the Wildcat's exact bytes are pinned above).
      for (const e of loadModelEntries().filter((x) => x.output.startsWith('content/aircraft/'))) {
        expect(statSync(join(outDir, e.output)).size, e.output).toBe(statSync(e.output).size)
      }
  ```
  Credit pin: `Models: SavinienBerault, KTKloss, KTKloss, JZHU, KTKloss, everlasting17th, AlanTinka, rojatsu, KTKloss (CC BY 4.0)`.

  ASSETS row: ``| `content/aircraft/a6m2-zero.glb` | https://sketchfab.com/3d-models/mitsubishi-a6m2-zero-zeke-d701787b75fa4c979792b0c0c14221e2 | SavinienBerault | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required |``

- [ ] **Step 6: Test** (procedure step 8). The rig test's gear-height case must pass: the wheels sit within 0.05 m of 2.48 m below the origin. If it fails:
  - set `gear.heightM` to the measured value, to 2 decimals;
  - run `remote-run npx vitest run tests/sim; echo "rc=$?"`;
  - record every test whose pinned numbers move, with the before and after values, as a `Ruling:`. Only then commit.

  Also run `npx vitest run tests/render/aiSafety.test.ts --maxWorkers=2`, because it loads the Zero spec.

- [ ] **Step 7: Commit.**
  ```bash
  git add tools/models/entries/a6m2-zero.json content/aircraft/a6m2-zero.glb content/aircraft/a6m2-zero.json content/library/a6m-zero.json content/library/f4f-wildcat.json src/render/scene/airframeRigs.ts tools/models/blender/preview.py tests/tools/models/aircraftRigs.test.ts tests/tools/models/aircraftDimensions.test.ts tests/build/dist.test.ts tests/render/modelCredits.test.ts ASSETS.md
  git commit -m "R3: the A6M2 Zero draws its own rigged model (Z3's model half)"
  ```

---

### Task 5: F6F Hellcat (Hangar only; settles R1's open decision for aircraft)

**Files:**
- Create: `tools/models/entries/f6f-hellcat.json`, `content/aircraft/f6f-hellcat.glb`
- Modify: `src/render/scene/airframeRigs.ts`, `content/library/f6f-hellcat.json`, `tests/render/hangar/models.test.ts`, `tests/tools/models/aircraftDimensions.test.ts`, `tests/render/modelCredits.test.ts`, `ASSETS.md`

Fixed values:
- file `f6f.glb`; uid `d64f29e7f1c144e6a0712ea12d83a91e`; URL `https://sketchfab.com/3d-models/f6f-d64f29e7f1c144e6a0712ea12d83a91e`; author `manilov.ap`;
- yawed: measure it (procedure 3); up `+y`;
- `dedupMaterials: true`;
- remove the figure's nodes (the ones using `rCollar_01-FACES` and `neck_01-FACES`, plus the rest of that figure's subtree, per the inspection);
- fighter budget: 3,000,000 / 60,000 / 47; textures 1024;
- `fit: span 13.06`.

- [ ] **Step 1: Procedure 1–6.** Expected parts: one three-bladed propeller (the F6F-5's Hamilton Standard), two main legs, and a tailwheel. Record which of them are separable.
- [ ] **Step 2: The rig row.** Include only the separable parts:
  ```ts
    'f6f-hellcat': {
      props: [{ node: 'Prop', blades: 3 }],
      gear: [
        { node: 'GearL', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE of the motion: F6F main legs swing aft into the wing, turning 90 deg to lie flat; modeled as the swing alone' },
        { node: 'GearR', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE of the motion: as GearL' },
        { node: 'Tailwheel', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE' },
      ],
      turrets: [],
    },
  ```
  Leg pivots use axis `+z` in the entry. `-90` about +z swings a hanging leg aft.
- [ ] **Step 3: P3, as a test first.** In `tests/render/hangar/models.test.ts`:
  - replace every `byId('f6f-hellcat')` with `byId('f4f-wildcat')`, and `loadAircraftSpec('f6f-hellcat')` with `loadAircraftSpec('f4f-wildcat')`. The Wildcat has a spec, stores with the same eight mount ids, and `view.model: wildcat`, so those tests keep their meaning.
  - add, in `describe("an entry's own model (R1)")`:
  ```ts
    it("the Hellcat, with a spec and its own model, draws the model with no stores, and its card keeps the spec (R3, P3)", async () => {
      const hellcat = byId('f6f-hellcat')
      expect(hellcat.subject?.kind).toBe('aircraft')
      expect(hellcat.library.model).toEqual({ kind: 'aircraft', id: 'f6f-hellcat' })
      const asked: [string, unknown][] = []
      const m = await loadHangarModel(hellcat, async (id, stores) => { asked.push([id, stores]); return createHellcat() })
      expect(asked).toEqual([['f6f-hellcat', undefined]])
      expect(m!.mounts()).toEqual([])
      expect(loadAircraftSpec('f6f-hellcat').view.model).toBe('wildcat') // the game still draws the Wildcat
    })
  ```
  Run it before linking the Library entry. Expected: FAIL on `library.model`.
- [ ] **Step 4: The Library entry.** Add the `model` line (procedure 7).
  - Replace its `blurb` with: `The player's fighter, flown from the carrier and from Tacloban. The Hangar shows a Hellcat model; in flight the game still draws it with the Wildcat's, whose gear height, store mounts and eye point its numbers are fitted to.`
  - Replace the last sentence of its `history`, `In this game the Hellcat is drawn with the Wildcat's model.`, with `In the game the Hellcat is still drawn with the Wildcat's model; only the Hangar shows the Hellcat's own.`
- [ ] **Step 5: Dimensions row.** Before committing, open `https://en.wikipedia.org/wiki/Grumman_F6F_Hellcat`, confirm the F6F-5 span 42 ft 10 in (13.06 m) and length 33 ft 7 in (10.24 m), and use the date you read them:
  ```ts
    'f6f-hellcat': { spanM: 13.06, lengthM: 10.24, tolerance: 0.04, source: "English Wikipedia 'Grumman F6F Hellcat', Specifications (F6F-5), read <the date you read it>" },
  ```
  Credit pin: `Models: SavinienBerault, KTKloss, KTKloss, manilov.ap, JZHU, KTKloss, everlasting17th, AlanTinka, rojatsu, KTKloss (CC BY 4.0)`.
- [ ] **Step 6: Procedure 8, then commit** (`R3: the F6F Hellcat model, shown in the Hangar only (P3)`). **The allowlist does not change** (P2).

---

### Task 6: F4U Corsair

Fixed values:
- file `f4u.glb`; uid `b042ee1ca0674810a7d05a7a568dd284`; URL `https://sketchfab.com/3d-models/f4u-b042ee1ca0674810a7d05a7a568dd284`; author `manilov.ap`;
- `dedupMaterials: true`; fighter budget; textures 1024;
- measure the yaw;
- the prop is probably `VINT` ("vint" is the author's word for propeller; it sits at z 2.84..4.49 in the raw file).

- [ ] **Step 1: Procedure 1–6.** First decide whether the wings are folded.
  - After yaw, the z extent should be about 12.49 m × (units per meter). If it is short by about half the outer panels, the wings are modeled folded. Then:
    - fit `length` 10.17 instead of `span`;
    - omit `spanM` from the row;
    - record `Ruling: the Corsair is modeled with its wings folded; fitted by length`.
  - Expected parts: a three-bladed Hamilton Standard propeller (the F4U-1's; confirm the blade count from the islands), two main legs, and a tailwheel.
- [ ] **Step 2: Rig row:**
  ```ts
    'f4u-corsair': {
      props: [{ node: 'Prop', blades: 3 }],
      gear: [
        { node: 'GearL', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE of the motion: F4U main legs swing aft, turning 90 deg to lie flat in the wing; modeled as the swing alone' },
        { node: 'GearR', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE of the motion: as GearL' },
        { node: 'Tailwheel', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE' },
      ],
      turrets: [],
    },
  ```
- [ ] **Step 3: Row, pin, allowlist.**
  - Read `https://en.wikipedia.org/wiki/Vought_F4U_Corsair` and use the span and length of the variant the model shows. For the F4U-1 these are 40 ft 11.75 in (12.49 m) and 33 ft 4.5 in (10.17 m). Row: `'f4u-corsair': { spanM: 12.49, lengthM: 10.17, tolerance: 0.04, source: "... read <date>" }`, with the figures you read.
  - Credit pin: `Models: SavinienBerault, KTKloss, KTKloss, manilov.ap, manilov.ap, JZHU, KTKloss, everlasting17th, AlanTinka, rojatsu, KTKloss (CC BY 4.0)`.
  - Remove `f4u-corsair` from `NOT_YET_DRAWN`; `CEILING = 17`.
- [ ] **Step 4: Procedure 8, then commit** (`R3: the F4U Corsair model`).

---

### Task 7: Ki-43 Oscar

Fixed values:
- file `ki43.glb`; uid `abdc04cc7afb4aeba0eaac6c5079d6e6`; URL `https://sketchfab.com/3d-models/ki43-abdc04cc7afb4aeba0eaac6c5079d6e6`; author `manilov.ap`;
- `dedupMaterials: true`; fighter budget; textures 1024;
- yawed about 31° (measured above); confirm it with `models:rig -- … LineG02-FACES`, the largest fuselage node;
- remove the two coincident canopy copies (`kabina01*`, `kabina02*`) and keep `kabina`;
- the prop is probably `Line17`.

- [ ] **Step 1: Procedure 1–6.** Variant:
  - fit the Ki-43-IIb span of 10.84 m, and check the length against 8.92 m (both read 2026-09-26, English Wikipedia "Nakajima Ki-43 Hayabusa", Specifications (Ki-43-IIb));
  - if the length misses by more than 4%, read the Ki-43-I figures from a cited source and try those;
  - if neither fits, fall back (P11).
- [ ] **Step 2: Rig row.** The Ki-43's main legs retract inward. Its tailwheel was fixed, so it is not rigged:
  ```ts
    'ki-43-oscar': {
      props: [{ node: 'Prop', blades: 2 }],
      gear: [
        { node: 'GearL', upAngleDeg: -90, retracts: 'inboard', source: 'Ki-43 main gear retracts inward into the wing; the angle is an ESTIMATE' },
        { node: 'GearR', upAngleDeg: 90, retracts: 'inboard', source: 'as GearL' },
      ],
      turrets: [],
    },
  ```
  The Ki-43-I had a two-bladed propeller and the -II a three-bladed one. **Set `blades` to the count the inspection finds.**
- [ ] **Step 3: Row, pin, allowlist.**
  - Row: `'ki-43-oscar': { spanM: 10.84, lengthM: 8.92, tolerance: 0.04, source: "English Wikipedia 'Nakajima Ki-43 Hayabusa', Specifications (Ki-43-IIb), read 2026-09-26" }`, or the variant Step 1 settled.
  - Credit pin: `Models: SavinienBerault, KTKloss, KTKloss, manilov.ap, manilov.ap, JZHU, manilov.ap, KTKloss, everlasting17th, AlanTinka, rojatsu, KTKloss (CC BY 4.0)`.
  - `CEILING = 16`.
- [ ] **Step 4: Procedure 8, then commit** (`R3: the Ki-43 Oscar model`).

---

### Task 8: P-38 Lightning

Fixed values:
- file `p38-lightning.glb`; uid `7eab500310604fd996b116f9cd7520a7`; URL `https://sketchfab.com/3d-models/p38-7eab500310604fd996b116f9cd7520a7`; author `manilov.ap`;
- `dedupMaterials: true`; fighter budget (GAMEPLAY: player-flown fighter); textures 1024;
- yawed; 114,089 triangles, so simplify toward 0.5 with props at 1;
- node prefixes `pt_` (port) and `st_` (starboard).

**Fallback risk, measured:** the raw x and z extents are nearly equal (8.41 and 8.51). The outer wing panels are separate nodes (`st_wing_o`, `pt_wing_o`). Before anything else, render the raw file with `preview.py` and **read it**. If the parts are not in flying position, fall back at once (P11).

- [ ] **Step 1: Procedure 1–6.**
  - Props: `Prop1` from the `pt_` side, `Prop2` from the `st_` side. Three-bladed Curtiss Electric; confirm the count.
  - Tricycle gear: the nose leg retracts aft; the main legs retract aft into the booms.
- [ ] **Step 2: Rig row:**
  ```ts
    'p-38-lightning': {
      props: [{ node: 'Prop1', blades: 3 }, { node: 'Prop2', blades: 3 }],
      gear: [
        { node: 'GearL', upAngleDeg: -90, retracts: 'aft', source: 'P-38 main legs retract aft into the booms; the angle is an ESTIMATE' },
        { node: 'GearNose', upAngleDeg: -90, retracts: 'aft', source: 'P-38 nose leg retracts aft; the angle is an ESTIMATE' },
        { node: 'GearR', upAngleDeg: -90, retracts: 'aft', source: 'as GearL' },
      ],
      turrets: [],
    },
  ```
- [ ] **Step 3: Row, pin, allowlist.**
  - Read the P-38L span 52 ft 0 in (15.85 m) and length 37 ft 10 in (11.53 m) from `https://en.wikipedia.org/wiki/Lockheed_P-38_Lightning` (Specifications, P-38L). Row: `'p-38-lightning': { spanM: 15.85, lengthM: 11.53, tolerance: 0.04, source: "... read <date>" }`.
  - Credit pin: `Models: SavinienBerault, KTKloss, KTKloss, manilov.ap, manilov.ap, JZHU, manilov.ap, KTKloss, manilov.ap, everlasting17th, AlanTinka, rojatsu, KTKloss (CC BY 4.0)`.
  - `CEILING = 15`.
- [ ] **Step 4: Procedure 8, then commit** (`R3: the P-38 Lightning model`).

---

### Task 9: D3A Val

Fixed values:
- file `aichi_d3a_val.glb`; uid `6f47d38de28b4a879481850b68bca501`; URL `https://sketchfab.com/3d-models/aichi-d3a-val-6f47d38de28b4a879481850b68bca501`; author `helijah`;
- already square: span along z, span/length 1.412 against the cited 1.409, so no yaw;
- fighter budget (GAMEPLAY lists it as "Hostile fighter"); textures 1024.

- [ ] **Step 1: Procedure 1–6.**
  - The FlightGear export is merged by material, so each node is one material. Remove every node whose material is a cockpit instrument (`DefaultWhite_asi.png`, `_clock.png`, `_compass.png`, `_alt.png`, `_ai.png`, and similar). Check `a6m…`-style below and front renders to confirm that nothing visible went with them.
  - The seven 16,644-triangle nodes are probably engine cylinders. If the cowling hides them in the front render, remove them.
  - Simplify toward 60,000 triangles with the prop at 1.
  - If the propeller is fused into a merged node, carve it with a `split` of `components` in a box around the prop disc (measure the box with `models:rig … box:…`).
- [ ] **Step 2: Rig row.** The D3A had fixed, spatted gear, so the gear is not rigged (P15):
  ```ts
    'd3a-val': { props: [{ node: 'Prop', blades: 3 }], gear: [], turrets: [] },
  ```
- [ ] **Step 3: Row, pin, allowlist.**
  - Row: `'d3a-val': { spanM: 14.365, lengthM: 10.195, tolerance: 0.04, source: "English Wikipedia 'Aichi D3A', Specifications (D3A2 Model 22), read 2026-09-26" }`. If the model is a D3A1 and its length misses, read and cite the D3A1 figures.
  - Credit pin: `Models: SavinienBerault, KTKloss, helijah, KTKloss, manilov.ap, manilov.ap, JZHU, manilov.ap, KTKloss, manilov.ap, everlasting17th, AlanTinka, rojatsu, KTKloss (CC BY 4.0)`.
  - `CEILING = 14`.
- [ ] **Step 4: Procedure 8, then commit** (`R3: the D3A Val model`).

---

### Task 10: G4M Betty

Fixed values:
- file `mitsubishi_g4m.glb`; uid `f326a41bfa5f4a34a471e95c663c2368`; URL `https://sketchfab.com/3d-models/mitsubishi-g4m-f326a41bfa5f4a34a471e95c663c2368`; author `Jec_Games`;
- 2,656 triangles, one texture;
- the span lies along x (0.052 units) and the length along z (0.041), so forward is `+z` or `-z`: the end the engines face;
- remove `Bombs` (P12);
- bomber budget (5,000,000 / 100,000 / 47); textures 1024;
- no simplification.

- [ ] **Step 1: Procedure 1–6.**
  - `H` (`pCube15`, `pCube16`, 80 triangles each) and `A` (`polySurface*`) are the candidate propeller and gear parts. Name them per P6 if the inspection shows them separable.
  - The G4M1 flew four-bladed props on the Kasei; set `blades` to the count of islands in the part.
  - Turrets: name the dorsal blister and tail position `Turret1`/`Turret2` only if they are separable (P14).
- [ ] **Step 2: Rig row.** Only the parts the inspection found separable:
  ```ts
    'g4m-betty': {
      props: [{ node: 'Prop1', blades: 4 }, { node: 'Prop2', blades: 4 }],
      gear: [
        { node: 'GearL', upAngleDeg: 90, retracts: 'forward', source: 'ESTIMATE: G4M main legs fold into the nacelles; direction from the model, angle an ESTIMATE' },
        { node: 'GearR', upAngleDeg: 90, retracts: 'forward', source: 'as GearL' },
      ],
      turrets: [],
    },
  ```
  If the model's gear folds aft, use `-90` and `'aft'`. The Tier 1 direction test fails on a wrong sign.
- [ ] **Step 3: Row, pin, allowlist.**
  - Row: `'g4m-betty': { spanM: 24.89, lengthM: 19.97, tolerance: 0.04, source: "English Wikipedia 'Mitsubishi G4M', Specifications (G4M1 Model 11), read 2026-09-26" }`.
  - Credit pin: `Models: SavinienBerault, KTKloss, helijah, KTKloss, manilov.ap, manilov.ap, JZHU, Jec_Games, manilov.ap, KTKloss, manilov.ap, everlasting17th, AlanTinka, rojatsu, KTKloss (CC BY 4.0)`.
  - `CEILING = 13`.
  - ASSETS author column: `Jec (@Jec_Games)`.
- [ ] **Step 4: Procedure 8, then commit** (`R3: the G4M Betty model`).

---

### Task 11: B-17 Flying Fortress

Fixed values:
- file `boeing_b-17_flying_fortress.glb`; uid `927f07f6ddcf470ab0387ce5829024d5`; URL `https://sketchfab.com/3d-models/boeing-b-17-flying-fortress-927f07f6ddcf470ab0387ce5829024d5`; author `helijah`;
- already square: length along x, span along z;
- bomber budget; textures 1024.

- [ ] **Step 1: Procedure 1–6.**
  - 763,214 triangles. First find out what the four repeated triples are: per engine, a ≈72.3k and a ≈71.3k node and a ≈23.0k node (for example `Object_17`, `Object_18`, `Object_19`). Look at each triple's bounds and the front render.
  - Engine internals hidden by the cowling are removed. A propeller node is kept.
  - Simplify only the rest, toward 100,000 triangles.
  - Four three-bladed Hamilton Standard props: `Prop1`…`Prop4`, port to starboard.
  - Turrets, if separable (P14), named nose to tail: `Turret1` chin, `Turret2` top, `Turret3` ball, `Turret4` tail. The cheek guns are not turrets.
- [ ] **Step 2: Rig row.** B-17 main legs retract forward into the nacelles, and the tailwheel retracts forward:
  ```ts
    'b-17-flying-fortress': {
      props: [{ node: 'Prop1', blades: 3 }, { node: 'Prop2', blades: 3 }, { node: 'Prop3', blades: 3 }, { node: 'Prop4', blades: 3 }],
      gear: [
        { node: 'GearL', upAngleDeg: 90, retracts: 'forward', source: 'B-17 main legs retract forward into the inboard nacelles, wheels partly exposed; the angle is an ESTIMATE' },
        { node: 'GearR', upAngleDeg: 90, retracts: 'forward', source: 'as GearL' },
        { node: 'Tailwheel', upAngleDeg: 90, retracts: 'forward', source: 'ESTIMATE' },
      ],
      turrets: ['Turret1', 'Turret2', 'Turret3', 'Turret4'],
    },
  ```
  Drop any turret or leg that is not separable, and renumber the turrets so they stay 1..N.
- [ ] **Step 3: Future-proof the catalog test.** `tests/render/hangar/catalog.test.ts` uses the B-17 as its "not drawn" example. That fails once the B-17 is drawn. Give the test its own synthetic undrawn entry instead. In `describe('availability (R1 …)')`, replace the `withModel` line with:
  ```ts
    const undrawn = { ...corsair, id: 'test-undrawn', name: 'Test Undrawn' }
    delete (undrawn as { model?: unknown }).model
    const withModel = { ...c, library: [...c.library.filter((e) => e.id !== 'f4u-corsair'), { ...corsair, model: { kind: 'aircraft' as const, id: 'wildcat' } }, undrawn] }
  ```
  Then replace every `'b-17-flying-fortress'` in that `describe` with `'test-undrawn'`. The Corsair has no spec, so the copy has neither a spec nor a model.
- [ ] **Step 4: Row, pin, allowlist.**
  - Read the B-17G span 103 ft 9 in (31.62 m) and length 74 ft 4 in (22.66 m) from `https://en.wikipedia.org/wiki/Boeing_B-17_Flying_Fortress` (Specifications, B-17G). Row: `'b-17-flying-fortress': { spanM: 31.62, lengthM: 22.66, tolerance: 0.04, source: "... read <date>" }`.
  - Credit pin (final for the downloads): `Models: SavinienBerault, helijah, KTKloss, helijah, KTKloss, manilov.ap, manilov.ap, JZHU, Jec_Games, manilov.ap, KTKloss, manilov.ap, everlasting17th, AlanTinka, rojatsu, KTKloss (CC BY 4.0)`.
  - `CEILING = 12`.
- [ ] **Step 5: Procedure 8** (add `tests/render/hangar/catalog.test.ts` to the run), **then commit** (`R3: the B-17 Flying Fortress model`).

---

### Task 12: The Blender kit's aircraft parts

**Files:**
- Modify: `tools/models/blender/kit.py`: new palette roles, module helpers, and seven `Model` methods
- Create: `tests/tools/models/blender/fixtures/kit_aircraft_probe.py`, `tests/tools/models/blender/fixtures/kit_bad_aircraft.py`
- Test: `tests/tools/models/blender/kitAircraft.test.ts` (new)

**Interfaces:**
- Produces, on `kit.Model`:
  - `fuselage(role, stations, segments=16, center_z=0.0, node=None, lower_role=None, lower_node=None)`: stations are `(x, half_w, half_h, center_y[, exponent])`, tail to nose;
  - `wing(role, le_x, root_y, root_chord, tip_chord, span, sweep_deg=0.0, dihedral_deg=0.0, thickness=0.12, tip_thickness=None, root_z=0.0, mirror=True, node=None, lower_role=None, lower_node=None)`;
  - `fin(role, le_x, root_y, root_chord, tip_chord, height, sweep_deg=0.0, thickness=0.10, tip_thickness=None, center_z=0.0, node=None)`;
  - `revolve(role, origin, direction, profile, segments=12, node=None)`;
  - `propeller(role, hub, diameter, blades, chord, spinner_radius, spinner_length, pitch_deg=25.0, node='Prop')`;
  - `gear_leg(role, hinge, length, wheel_radius, wheel_width, strut_radius=None, node=None)`;
  - `gun_turret(role, index, center, radius, height, up=1, barrels=2, barrel_length=1.2, facing=1, node=None)`.
- Palette roles added: `ijaGreen`, `underside`, `naturalMetal`, `glazing`. Existing roles and methods do not change. R2's ships and the hangar must rebuild byte-identically (Step 5).

- [ ] **Step 1: The fixtures.**
  `tests/tools/models/blender/fixtures/kit_aircraft_probe.py`:
  ```python
  # tests/tools/models/blender/fixtures/kit_aircraft_probe.py -- exercises every aircraft part once (R3).
  import os, sys
  sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', '..', 'tools', 'models', 'blender'))
  import kit

  out, opts = kit.cli_args()
  m = kit.Model('airprobe')
  m.fuselage('ijaGreen', [(-4.0, 0.1, 0.1, 0.0), (0.0, 1.0, 0.8, 0.0), (4.0, 0.1, 0.1, 0.0)], segments=16,
             node='ap_fuse', lower_role='underside', lower_node='ap_fuse_lower')
  m.wing('naturalMetal', 21.0, 0.0, 2.0, 1.0, 10.0, dihedral_deg=5.0, thickness=0.12, node='ap_wing')
  m.fin('naturalMetal', 41.0, 0.0, 2.0, 1.0, 3.0, sweep_deg=10.0, node='ap_fin')
  m.propeller('dark', (60.0, 0.0, 0.0), 3.0, 3, 0.25, 0.3, 0.5, node='Prop')
  m.gear_leg('dark', (80.0, 0.0, 2.0), 2.0, 0.35, 0.2, node='GearR')
  m.gear_leg('dark', (80.0, 0.0, -2.0), 2.0, 0.35, 0.2, node='GearL')
  m.gun_turret('naturalMetal', 1, (96.0, 0.0, 0.0), 0.5, 0.5, up=1)
  m.gun_turret('naturalMetal', 2, (100.0, 0.0, 0.0), 0.5, 0.5, up=-1, facing=-1)
  m.fuselage('glazing', [(119.0, 0.05, 0.05, 0.5), (120.0, 0.4, 0.3, 0.5), (121.0, 0.05, 0.05, 0.5)], node='ap_canopy')
  m.export(out)
  ```
  `tests/tools/models/blender/fixtures/kit_bad_aircraft.py`:
  ```python
  # Exercises the aircraft parts' load-bearing guards. The selected case fails before export.
  import os, sys
  sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', '..', 'tools', 'models', 'blender'))
  import kit

  out, opts = kit.cli_args()
  case = opts.get('case', 'fuselage-order')
  kit._read.add('case')
  m = kit.Model('bad-aircraft')
  if case == 'fuselage-order':
      m.fuselage('ijaGreen', [(1.0, 0.5, 0.5, 0.0), (0.0, 0.5, 0.5, 0.0)])
  elif case == 'blades':
      m.propeller('dark', (0.0, 0.0, 0.0), 3.0, 1, 0.25, 0.3, 0.5)
  elif case == 'wing-chord':
      m.wing('ijaGreen', 0.0, 0.0, 0.0, 1.0, 10.0)
  else:
      m.gun_turret('naturalMetal', 0, (0.0, 0.0, 0.0), 0.5, 0.5)
  m.export(out)
  ```

- [ ] **Step 2: Write the failing test** `tests/tools/models/blender/kitAircraft.test.ts`:
  ```ts
  // tests/tools/models/blender/kitAircraft.test.ts
  import { beforeAll, describe, expect, it } from 'vitest'
  import { mkdtempSync, readFileSync } from 'node:fs'
  import { createHash } from 'node:crypto'
  import { tmpdir } from 'node:os'
  import { join } from 'node:path'
  import { getBounds } from '@gltf-transform/functions'
  import type { Document, Node } from '@gltf-transform/core'
  import { HAVE_BLENDER, runBlenderScript } from '../../../../tools/models/blender/run.js'
  import { findNode, modelIO, onlyScene } from '../../../../tools/models/document.js'
  import { measureDocument } from '../../../../tools/models/measure.js'
  import { radiusAbout, rotateAbout, worldPositions, type Vec3 } from '../../../../tools/models/rig.js'

  const PROBE = 'tests/tools/models/blender/fixtures/kit_aircraft_probe.py'
  const BAD = 'tests/tools/models/blender/fixtures/kit_bad_aircraft.py'
  const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')

  /** World-space triangles of one node. */
  function triangles(node: Node): number[][][] {
    const m = node.getWorldMatrix()
    const out: number[][][] = []
    for (const prim of node.getMesh()!.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')!
      const idx = prim.getIndices()!
      const v = (i: number): number[] => {
        const [x, y, z] = pos.getElement(idx.getScalar(i), [0, 0, 0]) as number[]
        return [0, 1, 2].map((r) => m[r]! * x! + m[4 + r]! * y! + m[8 + r]! * z! + m[12 + r]!)
      }
      for (let i = 0; i < idx.getCount(); i += 3) out.push([v(i), v(i + 1), v(i + 2)])
    }
    return out
  }
  const normal = ([p, q, r]: number[][]): number[] => {
    const u = [q![0]! - p![0]!, q![1]! - p![1]!, q![2]! - p![2]!], w = [r![0]! - p![0]!, r![1]! - p![1]!, r![2]! - p![2]!]
    return [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!]
  }
  const mid = ([p, q, r]: number[][]): number[] => [0, 1, 2].map((i) => (p![i]! + q![i]! + r![i]!) / 3)

  // Builds run in beforeAll, never in the describe body (kit.test.ts says why).
  describe.skipIf(!HAVE_BLENDER)("the Blender kit's aircraft parts (R3)", () => {
    const dir = mkdtempSync(join(tmpdir(), 'r3-kit-'))
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

    it('one node per named part or role, flat materials named by role, metalness 0', () => {
      const names = onlyScene(doc).listChildren()[0]!.listChildren().map((n) => n.getName()).sort()
      expect(names).toEqual(['GearL', 'GearR', 'Prop', 'Turret1', 'Turret2', 'ap_canopy', 'ap_fin', 'ap_fuse', 'ap_fuse_lower', 'ap_wing'].sort())
      const mats = doc.getRoot().listMaterials()
      expect(mats.map((m) => m.getName()).sort()).toEqual(['dark', 'glazing', 'ijaGreen', 'naturalMetal', 'underside'])
      for (const mat of mats) expect(mat.getMetallicFactor()).toBe(0)
      expect(measureDocument(doc).drawCalls).toBe(10)
    })

    it('fuselage: the stations set length, width and height; the lower half is its own node; every side faces out', () => {
      const up = findNode(doc, 'ap_fuse'), low = findNode(doc, 'ap_fuse_lower')
      const bu = getBounds(up), bl = getBounds(low)
      const min = [0, 1, 2].map((i) => Math.min(bu.min[i]!, bl.min[i]!)), max = [0, 1, 2].map((i) => Math.max(bu.max[i]!, bl.max[i]!))
      ;[-4, -0.8, -1].forEach((v, i) => expect(min[i]).toBeCloseTo(v, 5))
      ;[4, 0.8, 1].forEach((v, i) => expect(max[i]).toBeCloseTo(v, 5))
      expect(bl.max[1]).toBeLessThanOrEqual(1e-6)
      expect(bl.min[1]).toBeCloseTo(-0.8, 5)
      for (const node of [up, low]) for (const t of triangles(node)) {
        const c = mid(t)
        if (Math.abs(c[0]!) > 3.999) continue // end caps point along x
        const n = normal(t)
        expect(n[1]! * c[1]! + n[2]! * c[2]!, `fuselage face at ${c.map((x) => x.toFixed(2))}`).toBeGreaterThan(0)
      }
    })

    it('wing: span, chords and dihedral as given, mirrored, upper faces up and lower faces down', () => {
      const w = findNode(doc, 'ap_wing')
      const bb = getBounds(w)
      expect(bb.min[0]).toBeCloseTo(19, 5)
      expect(bb.max[0]).toBeCloseTo(21, 5)
      expect(bb.min[2]).toBeCloseTo(-5, 5)
      expect(bb.max[2]).toBeCloseTo(5, 5)
      const pts = worldPositions(w)
      const tipLe = pts.filter((p) => Math.abs(Math.abs(p[2]) - 5) < 1e-5 && Math.abs(p[0] - 21) < 1e-5)
      expect(tipLe.length).toBeGreaterThanOrEqual(2)
      for (const p of tipLe) expect(p[1]).toBeCloseTo(5 * Math.tan((5 * Math.PI) / 180), 5)
      const tipTe = pts.filter((p) => Math.abs(Math.abs(p[2]) - 5) < 1e-5).map((p) => p[0])
      expect(Math.min(...tipTe)).toBeCloseTo(20, 5) // tip chord 1, no sweep
      const tan5 = Math.tan((5 * Math.PI) / 180)
      for (const t of triangles(w)) {
        const c = mid(t)
        if (Math.abs(c[2]!) < 0.01 || Math.abs(c[2]!) > 4.99) continue // root and tip caps
        const side = c[1]! - Math.abs(c[2]!) * tan5
        expect(Math.sign(normal(t)[1]!), `wing face at ${c.map((x) => x.toFixed(3))}`).toBe(Math.sign(side))
      }
    })

    it('fin: stands height tall on its root, thickness along z, leading edge swept', () => {
      const f = findNode(doc, 'ap_fin')
      const bb = getBounds(f)
      expect(bb.min[1]).toBeCloseTo(0, 5)
      expect(bb.max[1]).toBeCloseTo(3, 5)
      expect(bb.max[0]).toBeCloseTo(41, 5)
      expect(bb.max[2]).toBeLessThanOrEqual(0.1 + 1e-4)
      expect(bb.max[2]).toBeGreaterThan(0.09)
      const tip = worldPositions(f).filter((p) => Math.abs(p[1] - 3) < 1e-5).map((p) => p[0])
      expect(Math.max(...tip)).toBeCloseTo(41 - 3 * Math.tan((10 * Math.PI) / 180), 5)
    })

    it('propeller: diameter as given to 1%, exactly 3-fold symmetric about the hub, spinner tip ahead', () => {
      const pts = worldPositions(findNode(doc, 'Prop'))
      const hub: Vec3 = [60, 0, 0], x: Vec3 = [1, 0, 0]
      const r = radiusAbout(pts, hub, x)
      expect(r).toBeGreaterThanOrEqual(1.5)
      expect(r).toBeLessThanOrEqual(1.5 * 1.01)
      for (const p of pts) {
        const q = rotateAbout(p, hub, x, (2 * Math.PI) / 3)
        const nearest = Math.min(...pts.map((s) => Math.hypot(q[0] - s[0], q[1] - s[1], q[2] - s[2])))
        expect(nearest, `turned ${p.map((v) => v.toFixed(3))}`).toBeLessThan(1e-4)
      }
      expect(Math.max(...pts.map((p) => p[0]))).toBeCloseTo(60.375, 5)
    })

    it('gear legs: hang exactly length below the hinge; the hinge is the top', () => {
      for (const [name, z] of [['GearR', 2], ['GearL', -2]] as const) {
        const bb = getBounds(findNode(doc, name))
        expect(bb.max[1]).toBeCloseTo(0, 5)
        expect(bb.min[1]).toBeCloseTo(-2, 5)
        expect((bb.min[2] + bb.max[2]) / 2).toBeCloseTo(z, 5)
      }
    })

    it('turrets: TurretN nodes, a dorsal dome above its base and a ventral one below, guns facing as asked', () => {
      const t1 = getBounds(findNode(doc, 'Turret1')), t2 = getBounds(findNode(doc, 'Turret2'))
      expect(t1.min[1]).toBeGreaterThanOrEqual(-1e-6)
      expect(t2.max[1]).toBeLessThanOrEqual(1e-6)
      expect(t1.max[0]).toBeCloseTo(97.5, 5)
      expect(t2.min[0]).toBeCloseTo(98.5, 5)
    })

    it('rejects bad input by name', () => {
      const bad = (c: string) => () => runBlenderScript(BAD, join(dir, `bad-${c}.glb`), ['--case', c])
      expect(bad('fuselage-order')).toThrow(/fuselage: station x values must be strictly increasing/)
      expect(bad('blades')).toThrow(/propeller: blades must be an integer from 2 to 6/)
      expect(bad('wing-chord')).toThrow(/wing: root and tip chords must be > 0/)
      expect(bad('turret')).toThrow(/gun_turret: index must be a positive integer/)
    })
  })
  ```
  Run: `npx vitest run tests/tools/models/blender/kitAircraft.test.ts --maxWorkers=1; echo "rc=$?"`. Expected: FAIL (`'Model' object has no attribute 'fuselage'`).

- [ ] **Step 3: Implement in `kit.py`.**
  - Append to `PALETTE`, after `'fitting'`:
  ```python
      # Aircraft (R3): flat period finishes, each an ESTIMATE named in the model script's header.
      'ijaGreen': (0x4B / 255, 0x55 / 255, 0x35 / 255),
      'underside': (0xA3 / 255, 0xA8 / 255, 0x9A / 255),
      'naturalMetal': (0xB4 / 255, 0xB8 / 255, 0xBC / 255),
      'glazing': (0x2E / 255, 0x3A / 255, 0x44 / 255),
  ```
  - After `_material`, add the module helpers:
  ```python
  # Chord stations of the NACA 4-digit symmetric section, leading edge (0) to trailing edge (1).
  AIRFOIL_STATIONS = (0.0, 0.05, 0.15, 0.3, 0.5, 0.75, 1.0)


  def _unit(v):
      n = math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)
      _require(n > 0 and math.isfinite(n), f'direction must be a nonzero finite vector, got {v}')
      return (v[0] / n, v[1] / n, v[2] / n)


  def _cross(a, b):
      return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


  def _loft(rings):
      """Side quads between consecutive rings, then both end caps, as (face, ring edge j) pairs
      (j is None for a cap). Every ring lists the same number of points, counterclockwise as seen
      from beyond the last ring looking back, so every face points outward."""
      count = len(rings[0])
      verts = [p for ring in rings for p in ring]
      faces = []
      for s in range(len(rings) - 1):
          a, b = s * count, (s + 1) * count
          for j in range(count):
              k = (j + 1) % count
              faces.append(((a + j, a + k, b + k, b + j), j))
      last = (len(rings) - 1) * count
      faces.append((tuple(reversed(range(count))), None))
      faces.append((tuple(last + j for j in range(count)), None))
      return verts, faces


  def _mirror_z(verts, faces):
      """The reflection in z = 0, windings reversed so faces still point outward."""
      return [(x, y, -z) for x, y, z in verts], [(tuple(reversed(f)), j) for f, j in faces]


  def _airfoil(chord, thickness):
      """(dx, dy) around a closed symmetric section: leading edge at 0, chord toward -x, upper
      surface first, so counterclockwise seen from +z. NACA 4-digit thickness with the closed
      trailing-edge coefficient: the leading and trailing edges are single points."""
      def half(f):
          return 5 * thickness * chord * (0.2969 * math.sqrt(f) - 0.1260 * f - 0.3516 * f ** 2 + 0.2843 * f ** 3 - 0.1036 * f ** 4)
      upper = [(-f * chord, half(f)) for f in AIRFOIL_STATIONS]
      lower = [(-f * chord, -half(f)) for f in reversed(AIRFOIL_STATIONS[1:-1])]
      return upper + lower
  ```
  - Add these methods to `Model`, after `arch_gable`:
  ```python
      # ---- aircraft parts (R3) ------------------------------------------------------------

      def _emit(self, role, verts, faces, node, lower_role=None, lower_node=None, is_lower=None):
          """Adds (face, j) pairs to ``node``; with ``lower_role``, faces whose ring edge
          ``is_lower`` go to ``lower_node`` in that role instead (caps stay with ``role``)."""
          groups = [(role, node, [f for f, j in faces if lower_role is None or j is None or not is_lower(j)])]
          if lower_role is not None:
              groups.append((lower_role, lower_node, [f for f, j in faces if j is not None and is_lower(j)]))
          for r, nd, fs in groups:
              used = sorted({i for f in fs for i in f})
              index = {old: new for new, old in enumerate(used)}
              self._part(r, [verts[i] for i in used], [tuple(index[i] for i in f) for f in fs], nd)

      def fuselage(self, role, stations, segments=16, center_z=0.0, node=None, lower_role=None, lower_node=None):
          """Loft a fuselage, nacelle, boom or canopy from stations in the glTF frame.

          Each station is ``(x, half_width, half_height, center_y[, exponent])``: a superellipse
          section (exponent 2 is an ellipse, larger is boxier; default 2.2) centered on
          (center_y, ``center_z``). Stations run tail to nose, x strictly increasing, and both
          ends are capped, so a pointed end is a tiny nonzero section. With ``lower_role``, the
          side faces below each section's center go to ``lower_node`` in that role.
          """
          _require(isinstance(segments, int) and segments >= 8 and segments % 4 == 0,
                   f'fuselage: segments must be a multiple of 4, at least 8, got {segments!r}')
          _require(len(stations) >= 2, f'fuselage: need at least 2 stations, got {len(stations)}')
          rings, xs = [], []
          for i, st in enumerate(stations):
              _require(len(st) in (4, 5), f'fuselage: station {i} needs 4 or 5 values, got {len(st)}')
              values = tuple(float(v) for v in st)
              _require(all(math.isfinite(v) for v in values), f'fuselage: station {i} has a non-finite value')
              x, half_w, half_h, center_y = values[:4]
              n = values[4] if len(values) == 5 else 2.2
              _require(half_w > 0 and half_h > 0 and n >= 1,
                       f'fuselage: station {i} half-width and half-height must be > 0 and exponent >= 1')
              xs.append(x)
              ring = []
              for j in range(segments):
                  t = 2 * math.pi * j / segments
                  c, s = math.cos(t), math.sin(t)
                  ring.append((x, center_y + half_h * math.copysign(abs(c) ** (2 / n), c),
                               center_z + half_w * math.copysign(abs(s) ** (2 / n), s)))
              rings.append(ring)
          _require(all(xs[i] < xs[i + 1] for i in range(len(xs) - 1)), 'fuselage: station x values must be strictly increasing')
          verts, faces = _loft(rings)
          quarter = segments // 4
          self._emit(role, verts, faces, node, lower_role, lower_node, lambda j: quarter <= j < 3 * quarter)

      def wing(self, role, le_x, root_y, root_chord, tip_chord, span, sweep_deg=0.0, dihedral_deg=0.0,
               thickness=0.12, tip_thickness=None, root_z=0.0, mirror=True, node=None, lower_role=None, lower_node=None):
          """A tapered lifting surface, both halves by default: a wing or a tailplane.

          The root section's leading edge is at (``le_x``, ``root_y``, ``root_z``); the panel runs
          to z = span/2, its leading edge swept back ``sweep_deg`` and raised ``dihedral_deg``.
          Sections are NACA 4-digit symmetric (``thickness`` is a fraction of chord) with a closed
          trailing edge. ``mirror`` adds the left half, reflected in z = 0. ``lower_role`` paints
          the lower surface, as ``fuselage`` does.
          """
          half = span / 2
          tip_t = thickness if tip_thickness is None else tip_thickness
          _require(root_chord > 0 and tip_chord > 0, f'wing: root and tip chords must be > 0, got {root_chord}, {tip_chord}')
          _require(0 <= root_z < half, f'wing: root_z must be >= 0 and inside span/2, got {root_z} for span {span}')
          _require(0 < thickness < 0.3 and 0 < tip_t < 0.3, f'wing: thickness ratios must be in (0, 0.3), got {thickness}, {tip_t}')
          _require(abs(sweep_deg) < 60 and abs(dihedral_deg) < 30, f'wing: |sweep| must be < 60 deg and |dihedral| < 30 deg, got {sweep_deg}, {dihedral_deg}')
          length = half - root_z
          tip_le = le_x - length * math.tan(math.radians(sweep_deg))
          tip_y = root_y + length * math.tan(math.radians(dihedral_deg))
          rings = [
              [(le_x + dx, root_y + dy, root_z) for dx, dy in _airfoil(root_chord, thickness)],
              [(tip_le + dx, tip_y + dy, half) for dx, dy in _airfoil(tip_chord, tip_t)],
          ]
          verts, faces = _loft(rings)
          lower = lambda j: j >= len(AIRFOIL_STATIONS) - 1  # noqa: E731
          self._emit(role, verts, faces, node, lower_role, lower_node, lower)
          if mirror:
              mverts, mfaces = _mirror_z(verts, faces)
              self._emit(role, mverts, mfaces, node, lower_role, lower_node, lower)

      def fin(self, role, le_x, root_y, root_chord, tip_chord, height, sweep_deg=0.0, thickness=0.10,
              tip_thickness=None, center_z=0.0, node=None):
          """A vertical tail surface standing on y = ``root_y`` in the plane z = ``center_z``."""
          tip_t = thickness if tip_thickness is None else tip_thickness
          _require(root_chord > 0 and tip_chord > 0 and height > 0,
                   f'fin: chords and height must be > 0, got {root_chord}, {tip_chord}, {height}')
          _require(0 < thickness < 0.3 and 0 < tip_t < 0.3, f'fin: thickness ratios must be in (0, 0.3), got {thickness}, {tip_t}')
          tip_le = le_x - height * math.tan(math.radians(sweep_deg))
          rings = [[(le_x + dx, dy, 0.0) for dx, dy in _airfoil(root_chord, thickness)],
                   [(tip_le + dx, dy, height) for dx, dy in _airfoil(tip_chord, tip_t)]]
          verts, faces = _loft(rings)
          # Stand the panel up: (x, y, z) -> (x, z, -y) is a rotation, so windings hold.
          verts = [(x, root_y + z, center_z - y) for x, y, z in verts]
          self._part(role, verts, [f for f, _ in faces], node)

      def revolve(self, role, origin, direction, profile, segments=12, node=None):
          """A closed solid of revolution about the line through ``origin`` along ``direction``:
          ``profile`` is [(t, radius)], t strictly increasing meters along the axis, every radius
          > 0. Struts, wheels, spinners and turret domes."""
          _require(isinstance(segments, int) and segments >= 3, f'revolve: segments must be an integer >= 3, got {segments!r}')
          _require(len(profile) >= 2, f'revolve: need at least 2 profile points, got {len(profile)}')
          d = _unit(direction)
          ts = [float(t) for t, _ in profile]
          rs = [float(r) for _, r in profile]
          _require(all(r > 0 for r in rs), f'revolve: every radius must be > 0, got {rs}')
          _require(all(ts[i] < ts[i + 1] for i in range(len(ts) - 1)), 'revolve: profile t values must be strictly increasing')
          helper = (0.0, 1.0, 0.0) if abs(d[1]) < 0.9 else (1.0, 0.0, 0.0)
          e1 = _unit(_cross(d, helper))
          e2 = _cross(d, e1)
          ox, oy, oz = origin
          rings = []
          for t, r in zip(ts, rs):
              cx, cy, cz = ox + d[0] * t, oy + d[1] * t, oz + d[2] * t
              ring = []
              for j in range(segments):
                  th = 2 * math.pi * j / segments
                  c, s = math.cos(th), math.sin(th)
                  ring.append((cx + r * (c * e1[0] + s * e2[0]), cy + r * (c * e1[1] + s * e2[1]), cz + r * (c * e1[2] + s * e2[2])))
              rings.append(ring)
          verts, faces = _loft(rings)
          self._part(role, verts, [f for f, _ in faces], node)

      def propeller(self, role, hub, diameter, blades, chord, spinner_radius, spinner_length, pitch_deg=25.0, node='Prop'):
          """A propeller on an axis along +x through ``hub``: flat blades, pitched ``pitch_deg``,
          from inside the spinner out to diameter/2 (tips tapered to 35% chord, so the tip corners
          stay within 0.1% of the radius), and a spinner ahead of the hub. One node, so the entry
          pivots it at the hub about +x. Exactly N-fold symmetric: the spinner's 24 segments divide
          by 2, 3, 4 and 6."""
          _require(isinstance(blades, int) and 2 <= blades <= 6, f'propeller: blades must be an integer from 2 to 6, got {blades!r}')
          radius = diameter / 2
          _require(chord > 0 and spinner_length > 0 and 0 < spinner_radius < radius,
                   f'propeller: need chord and spinner length > 0 and 0 < spinner radius < diameter/2, got chord {chord}, spinner {spinner_radius} x {spinner_length}, diameter {diameter}')
          hx, hy, hz = hub
          phi = math.radians(pitch_deg)
          thick = 0.12 * chord
          root_r = 0.8 * spinner_radius
          box_faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)]
          for i in range(blades):
              a = 2 * math.pi * i / blades
              ca, sa = math.cos(a), math.sin(a)
              verts = []
              for z_sign in (-1, 1):
                  for x_sign, r in ((-1, root_r), (1, root_r), (1, radius), (-1, radius)):
                      half_c = (chord if r == root_r else 0.35 * chord) / 2
                      lx, lz = x_sign * thick / 2, z_sign * half_c
                      px = lx * math.cos(phi) + lz * math.sin(phi)
                      pz = -lx * math.sin(phi) + lz * math.cos(phi)
                      verts.append((hx + px, hy + r * ca - pz * sa, hz + r * sa + pz * ca))
              self._part(role, verts, box_faces, node)
          self.revolve(role, (hx - 0.25 * spinner_length, hy, hz), (1.0, 0.0, 0.0),
                       [(0.0, spinner_radius), (0.35 * spinner_length, 0.97 * spinner_radius),
                        (0.7 * spinner_length, 0.7 * spinner_radius), (spinner_length, 0.06 * spinner_radius)], 24, node)

      def gear_leg(self, role, hinge, length, wheel_radius, wheel_width, strut_radius=None, node=None):
          """A landing-gear leg hanging straight down from ``hinge``: a strut to the axle and a
          wheel whose lowest point is exactly ``length`` below the hinge. One node, so the entry
          pivots it at the hinge."""
          _require(wheel_radius > 0 and wheel_width > 0 and length > 2 * wheel_radius,
                   f'gear_leg: need wheel radius and width > 0 and length > 2 x wheel radius, got {length}, {wheel_radius}, {wheel_width}')
          strut = 0.18 * wheel_radius if strut_radius is None else strut_radius
          _require(strut > 0, f'gear_leg: strut radius must be > 0, got {strut}')
          hx, hy, hz = hinge
          axle_y = hy - length + wheel_radius
          self.revolve(role, (hx, hy, hz), (0.0, -1.0, 0.0), [(0.0, strut), (hy - axle_y, strut)], 8, node)
          self.revolve(role, (hx, axle_y, hz - wheel_width / 2), (0.0, 0.0, 1.0), [(0.0, wheel_radius), (wheel_width, wheel_radius)], 16, node)

      def gun_turret(self, role, index, center, radius, height, up=1, barrels=2, barrel_length=1.2, facing=1, node=None):
          """A turret on the fuselage skin at ``center``: a dome ``height`` tall toward ``up`` (+1
          dorsal, -1 ventral) and ``barrels`` guns pointing ``facing`` along x, all in node
          ``TurretN`` for H3 (numbered nose to tail by the caller)."""
          _require(isinstance(index, int) and index > 0, f'gun_turret: index must be a positive integer, got {index!r}')
          _require(up in (-1, 1) and facing in (-1, 1), f'gun_turret: up and facing must be -1 or +1, got {up}, {facing}')
          _require(isinstance(barrels, int) and barrels > 0, f'gun_turret: barrels must be a positive integer, got {barrels!r}')
          _require(radius > 0 and height > 0 and barrel_length > 0, 'gun_turret: radius, height and barrel length must be > 0')
          key = node or f'Turret{index}'
          cx, cy, cz = center
          self.revolve(role, center, (0.0, float(up), 0.0), [(0.0, radius), (0.55 * height, 0.85 * radius), (height, 0.25 * radius)], 12, key)
          gauge = 0.16 * radius
          for b in range(barrels):
              zz = cz + (b - (barrels - 1) / 2) * radius * 0.35
              self.box(role, (cx + facing * (0.6 * radius + barrel_length / 2), cy + up * 0.45 * height - gauge / 2, zz),
                       (barrel_length, gauge, gauge), key)
  ```

- [ ] **Step 4: Run.**
  `npx vitest run tests/tools/models/blender/kitAircraft.test.ts --maxWorkers=1; echo "rc=$?"`. Expected `rc=0`, 9 passed.

  **Mutation check:** flip the fuselage quad to `(a + j, b + j, b + k, a + k)`. The fuselage-normals test must fail. Restore it and re-run green. Record both runs.

- [ ] **Step 5: Nothing old moved.**
  `npx vitest run tests/tools/models/blender tests/tools/models/blenderEntries.test.ts --maxWorkers=1; echo "rc=$?"`. Expected `rc=0`, with R2's three ships and the hangar byte-identical. Then commit:
  ```bash
  git add tools/models/blender/kit.py tests/tools/models/blender/kitAircraft.test.ts tests/tools/models/blender/fixtures/kit_aircraft_probe.py tests/tools/models/blender/fixtures/kit_bad_aircraft.py
  git commit -m "R3: aircraft parts in the Blender kit (fuselage, wing, fin, propeller, gear, turret), proven"
  ```

---

### Task 13: Ki-84 Frank (Blender; the single-engine template)

**Files:**
- Create: `tools/models/blender/ki-84-frank.py`, `tools/models/entries/ki-84-frank.json`, `content/aircraft/ki-84-frank.glb`
- Modify: `airframeRigs.ts`, `content/library/ki-84-frank.json`, `roster.test.ts`, `aircraftDimensions.test.ts`, `ASSETS.md`

- [ ] **Step 1: Re-read the source.** Open `https://en.wikipedia.org/wiki/Nakajima_Ki-84_Hayate`, Specifications (Ki-84-Ia). Confirm: length 9.92 m, wingspan 11.238 m, wing area 21 m², "4-bladed constant-speed metal propeller" (all read 2026-09-26 by this plan). If you read them on a later date, use that date in the header and the row.
- [ ] **Step 2: The script** `tools/models/blender/ki-84-frank.py`:
  ```python
  # tools/models/blender/ki-84-frank.py
  """Nakajima Ki-84-Ia Hayate ("Frank"). Original work, AGPL-3.0-or-later.

  The single-engine template (R3): every station is a fraction of the cited length or span, so
  another single-engine type is this file with its own CITED block (R3 plan, Task 16).

  Figures (read 2026-09-26, English Wikipedia "Nakajima Ki-84 Hayate", Specifications (Ki-84-Ia)):
    span 11.238 m, length 9.92 m, wing area 21 m2           CITED
    4-bladed propeller                                      CITED (blade count)
    propeller diameter 3.05 m                               ESTIMATE (the source is silent)
    taper 0.53, an unswept quarter chord, dihedral 6 deg,
      thickness 15% root / 10% tip                          ESTIMATE, period three-view proportions
    every section, canopy, tail surface, gear track and leg
      length below (fractions of length or span)            ESTIMATE
    main gear retracts inboard into the wing                ESTIMATE (the source is silent)
    tailwheel retracts forward                              ESTIMATE
    IJA dark green over grey-green undersides               ESTIMATE (palette roles ijaGreen, underside)
  Frame: glTF, +x forward, +y up, +z right, meters. Origin: the wing root's quarter chord on the
  thrust line, standing in for the CG (ESTIMATE). Pose: gear down, thrust line level (R3 P13).
  Leaves out: insignia, ID stripes, panel lines, exhausts, guns, antenna, cockpit, control-surface
  gaps, wheel-well doors.
  """
  import math
  import os
  import sys

  sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
  import kit  # noqa: E402

  NAME = 'ki84'
  # --- CITED
  SPAN = 11.238
  LENGTH = 9.92
  WING_AREA = 21.0
  BLADES = 4
  # --- ESTIMATE
  PROP_DIAMETER = 3.05
  TAPER = 0.53
  DIHEDRAL_DEG = 6.0
  ROOT_T, TIP_T = 0.15, 0.10
  GEAR_RETRACTS = 'inboard'     # 'inboard', 'aft', or None for fixed gear (not rigged)
  TAILWHEEL_RETRACTS = True
  UPPER, LOWER = 'ijaGreen', 'underside'
  NOSE_X = 0.359                # spinner tip ahead of the origin, of LENGTH
  WING_Y = -0.055               # wing root chord line below the thrust line, of LENGTH
  # (x aft of the spinner tip, half-width, half-height, center y, exponent), tail to nose; of LENGTH
  FUSELAGE = [
      (0.989, 0.006, 0.010, 0.025, 2.0),
      (0.863, 0.025, 0.038, 0.020, 2.2),
      (0.661, 0.042, 0.058, 0.010, 2.2),
      (0.480, 0.052, 0.073, 0.005, 2.2),
      (0.308, 0.058, 0.073, 0.000, 2.2),
      (0.157, 0.065, 0.067, 0.000, 2.0),
      (0.051, 0.060, 0.060, 0.000, 2.0),
      (0.046, 0.035, 0.035, 0.000, 2.0),
  ]
  CANOPY = [(0.560, 0.005, 0.005, 0.062), (0.490, 0.030, 0.030, 0.071), (0.400, 0.033, 0.036, 0.073), (0.345, 0.005, 0.005, 0.067)]
  TAILPLANE = dict(span=0.36, le=0.867, root=0.120, taper=0.55, y=0.015, sweep=8.0)  # span of SPAN; the rest of LENGTH
  FIN = dict(root=0.131, taper=0.54, height=0.136, y=0.030)                         # trailing edge at the tail
  PROP = dict(hub=0.036, chord=0.026, spinner_r=0.030, spinner_len=0.048)            # hub = 0.75 x spinner_len: tip at NOSE_X
  GEAR = dict(x=0.0, z=0.178, length=0.165, wheel_r=0.033, wheel_w=0.020)            # x, length, wheel of LENGTH; z of SPAN
  TAILWHEEL = dict(at=0.870, y=-0.015, length=0.045, wheel_r=0.012, wheel_w=0.008)

  L, S = LENGTH, SPAN


  def X(f):
      """A fraction of LENGTH aft of the spinner tip, as glTF x."""
      return (NOSE_X - f) * L


  out, _opts = kit.cli_args()
  m = kit.Model(NAME)
  m.fuselage(UPPER, [(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], segments=16, lower_role=LOWER)
  m.fuselage('glazing', [(X(f), w * L, h * L, y * L) for f, w, h, y in CANOPY], segments=16)
  root_chord = 2 * WING_AREA / (S * (1 + TAPER))
  tip_chord = TAPER * root_chord
  sweep = math.degrees(math.atan(0.25 * (root_chord - tip_chord) / (S / 2)))  # an unswept quarter chord
  m.wing(UPPER, 0.25 * root_chord, WING_Y * L, root_chord, tip_chord, S, sweep_deg=sweep,
         dihedral_deg=DIHEDRAL_DEG, thickness=ROOT_T, tip_thickness=TIP_T, lower_role=LOWER)
  tp = TAILPLANE
  m.wing(UPPER, X(tp['le']), tp['y'] * L, tp['root'] * L, tp['taper'] * tp['root'] * L, tp['span'] * S,
         sweep_deg=tp['sweep'], thickness=0.10, lower_role=LOWER)
  fin_root, fin_h = FIN['root'] * L, FIN['height'] * L
  fin_tip = FIN['taper'] * fin_root
  # The rudder's trailing edge is vertical at the tail, so the model's aftmost point is X(1).
  m.fin(UPPER, X(1.0) + fin_root, FIN['y'] * L, fin_root, fin_tip, fin_h,
        sweep_deg=math.degrees(math.atan((fin_root - fin_tip) / fin_h)))
  pr = PROP
  m.propeller('dark', (X(pr['hub']), 0.0, 0.0), PROP_DIAMETER, BLADES, pr['chord'] * L, pr['spinner_r'] * L, pr['spinner_len'] * L)
  g = GEAR
  hinge_y = WING_Y * L + g['z'] * S * math.tan(math.radians(DIHEDRAL_DEG)) - 0.3 * ROOT_T * root_chord
  for side, name in ((-1, 'GearL'), (1, 'GearR')):
      m.gear_leg('dark', (g['x'] * L, hinge_y, side * g['z'] * S), g['length'] * L, g['wheel_r'] * L, g['wheel_w'] * L,
                 node=name if GEAR_RETRACTS else None)
  tw = TAILWHEEL
  m.gear_leg('dark', (X(tw['at']), tw['y'] * L, 0.0), tw['length'] * L, tw['wheel_r'] * L, tw['wheel_w'] * L,
             node='Tailwheel' if TAILWHEEL_RETRACTS else None)
  m.export(out)
  ```
- [ ] **Step 3: Look before the entry.**
  - Run `npx tsx tools/models/blender/cli.ts ki-84-frank`. It prints the inspection of `content/models/candidates/ki-84-frank.glb`.
  - Render `front` and `below` with `preview.py` from that candidate, and **read them**.
  - Expected: bounds x −6.359..3.561 (9.92 m) and z ±5.619 (11.238 m); nodes `GearL`, `GearR`, `Prop`, `Tailwheel`, `ki84_glazing`, `ki84_ijaGreen`, `ki84_underside`. There is no `ki84_dark`: every dark part is a named node.
  - Fix geometry only for a failing measurement or a defect you can see, and record each fix.
- [ ] **Step 4: The entry** `tools/models/entries/ki-84-frank.json`. The pivots are the script's own arithmetic: hub (0.323 × 9.92, 0, 0); hinge y = −0.5456 + 2.000364 × tan 6° − 0.3 × 0.15 × 2.442693; tailwheel (−0.511 × 9.92, −0.1488, 0).
  ```json
  {
    "id": "ki-84-frank",
    "output": "content/aircraft/ki-84-frank.glb",
    "source": {
      "kind": "blender",
      "script": "tools/models/blender/ki-84-frank.py",
      "dimensions": "span 11.238 m, length 9.92 m, wing area 21 m2 and a 4-bladed propeller: English Wikipedia 'Nakajima Ki-84 Hayate', Specifications (Ki-84-Ia), read 2026-09-26; every other figure is an ESTIMATE labeled in the script's header",
      "license": "AGPL-3.0-or-later"
    },
    "normalize": { "forward": "+x", "up": "+y", "origin": [0, 0, 0], "fit": { "extent": "span", "meters": 11.238 } },
    "keep": [
      { "node": "Prop", "pivot": { "point": [3.20416, 0, 0], "axis": "+x" } },
      { "node": "GearL", "pivot": { "point": [0, -0.44527, -2.000364], "axis": "+x" } },
      { "node": "GearR", "pivot": { "point": [0, -0.44527, 2.000364], "axis": "+x" } },
      { "node": "Tailwheel", "pivot": { "point": [-5.06912, -0.1488, 0], "axis": "+z" } }
    ],
    "textures": { "maxSize": 512, "format": "webp" },
    "budget": { "maxBytes": 3000000, "maxTriangles": 60000, "maxDrawCalls": 47 },
    "noseNode": "Prop"
  }
  ```
- [ ] **Step 5: Rig, link, allowlist, rows.**
  ```ts
    'ki-84-frank': {
      props: [{ node: 'Prop', blades: 4 }],
      gear: [
        { node: 'GearL', upAngleDeg: -90, retracts: 'inboard', source: 'ESTIMATE (ki-84-frank.py header)' },
        { node: 'GearR', upAngleDeg: 90, retracts: 'inboard', source: 'ESTIMATE (ki-84-frank.py header)' },
        { node: 'Tailwheel', upAngleDeg: 90, retracts: 'forward', source: 'ESTIMATE (ki-84-frank.py header)' },
      ],
      turrets: [],
    },
  ```
  - Library `model` line; `CEILING = 11`.
  - Dimensions row: `'ki-84-frank': { spanM: 11.238, lengthM: 9.92, tolerance: 0.01, source: "English Wikipedia 'Nakajima Ki-84 Hayate', Specifications (Ki-84-Ia), read 2026-09-26" }`.
  - ASSETS row: ``| `content/aircraft/ki-84-frank.glb` | authored in Blender by `tools/models/blender/ki-84-frank.py` from the cited dimensions in its header (English Wikipedia, Ki-84-Ia specifications); every estimate labeled there | authored for this project | AGPL-3.0-or-later |``
  - No credit-pin change: an AGPL model has no CC-BY credit.
- [ ] **Step 6: Build and test on nexus, serially.**
  ```bash
  npm run models:build -- ki-84-frank; echo "rc=$?"
  npx vitest run tests/tools/models/blenderEntries.test.ts --maxWorkers=1 -t 'ki-84-frank'; echo "rc=$?"
  npx vitest run tests/tools/models/outputs.test.ts tests/tools/models/aircraftRigs.test.ts tests/tools/models/aircraftDimensions.test.ts tests/render/hangar tests/render/airframes.test.ts --maxWorkers=2; echo "rc=$?"
  ```
  Expected `rc=0` three times. The rebuild case is byte-identical. The rig test passes symmetry, hinge and direction. The dimensions test passes length and span at 1%. Then commit: `R3: the Ki-84 Frank, an original Blender model`.

---

### Task 14: Ki-21 Sally (Blender; the twin-engine template)

- [ ] **Step 1: Re-read the source.** `https://en.wikipedia.org/wiki/Mitsubishi_Ki-21`, Specifications (Ki-21-IIb): length 16 m, wingspan 22.5 m, wing area 69.9 m², "3-bladed variable-pitch propellers", a dorsal turret with one 12.7 mm Ho-103 (read 2026-09-26).
- [ ] **Step 2: The script** `tools/models/blender/ki-21-sally.py`:
  ```python
  # tools/models/blender/ki-21-sally.py
  """Mitsubishi Ki-21-IIb ("Sally"). Original work, AGPL-3.0-or-later.

  The twin-engine template (R3): stations are fractions of the cited length or span; another
  twin is this file with its own CITED block (R3 plan, Task 16).

  Figures (read 2026-09-26, English Wikipedia "Mitsubishi Ki-21", Specifications (Ki-21-IIb)):
    span 22.5 m, length 16 m, wing area 69.9 m2         CITED
    3-bladed propellers                                  CITED (blade count)
    one dorsal turret (12.7 mm Ho-103)                   CITED (Turret1, for H3)
    propeller diameter 3.4 m                             ESTIMATE
    taper 0.51, an unswept quarter chord, dihedral 6 deg,
      thickness 17% root / 10% tip                       ESTIMATE
    engine span stations, nacelles, sections, glazing,
      tail surfaces, gear                                ESTIMATE (fractions below)
    main gear retracts aft into the nacelles             ESTIMATE
    tailwheel fixed                                      ESTIMATE (static, not rigged)
    IJA dark green over grey-green undersides            ESTIMATE
  Frame: glTF, +x forward, +y up, +z right, meters; origin at the wing root's quarter chord on the
  fuselage datum (ESTIMATE). Pose: gear down (R3 P13).
  Leaves out: insignia, the nose, ventral, beam and tail guns (flexible mounts, not turrets),
  panel lines, exhausts, cockpit, bomb bay.
  """
  import math
  import os
  import sys

  sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
  import kit  # noqa: E402

  NAME = 'ki21'
  # --- CITED
  SPAN = 22.5
  LENGTH = 16.0
  WING_AREA = 69.9
  BLADES = 3
  # --- ESTIMATE
  PROP_DIAMETER = 3.4
  TAPER = 0.51
  DIHEDRAL_DEG = 6.0
  SWEEP_DEG = None              # None: an unswept quarter chord
  ROOT_T, TIP_T = 0.17, 0.10
  UPPER, LOWER = 'ijaGreen', 'underside'
  NOSE_X = 0.40
  WING_Y = -0.019
  FUSELAGE = [
      (0.981, 0.005, 0.006, 0.022, 2.0),
      (0.869, 0.022, 0.028, 0.016, 2.2),
      (0.681, 0.039, 0.053, 0.006, 2.2),
      (0.463, 0.047, 0.063, 0.000, 2.2),
      (0.244, 0.045, 0.059, 0.000, 2.2),
      (0.100, 0.038, 0.047, -0.003, 2.2),
      (0.025, 0.025, 0.028, -0.006, 2.0),
      (0.001, 0.004, 0.004, -0.0075, 2.0),
  ]
  NOSE_GLAZING = [(0.094, 0.036, 0.041, -0.003), (0.038, 0.030, 0.034, -0.005), (0.0, 0.003, 0.003, -0.0075)]
  CANOPY = [(0.288, 0.003, 0.003, 0.053), (0.238, 0.028, 0.019, 0.059), (0.175, 0.025, 0.018, 0.056), (0.131, 0.003, 0.003, 0.050)]
  TAILPLANE = dict(span=0.338, le=0.8375, root=0.1375, taper=0.55, y=0.019, sweep=10.0)
  FIN = dict(root=0.1625, taper=0.54, height=0.15, y=0.022)
  ENGINES = [0.16]              # nacelle z each side, of SPAN
  # (x ahead of the wing leading edge at that z, half-width), of LENGTH; half-height 1.05 x half-width
  NACELLE = dict(below=0.0206, stations=[(-0.20, 0.009), (-0.10, 0.034), (0.03, 0.044), (0.10, 0.044), (0.135, 0.039), (0.138, 0.019)])
  PROP = dict(ahead=0.146, chord=0.019, spinner_r=0.0175, spinner_len=0.034)
  GEAR = dict(ahead=-0.02, below=0.040, length=0.131, wheel_r=0.034, wheel_w=0.020, retracts='aft')
  TAILWHEEL = dict(at=0.90, y=-0.010, length=0.050, wheel_r=0.015, wheel_w=0.010, retracts=False)
  TURRETS = [dict(at=0.513, y=0.059, up=1, radius=0.034, height=0.0375, barrels=1, barrel=0.075, facing=-1)]

  L, S = LENGTH, SPAN


  def X(f):
      return (NOSE_X - f) * L


  out, _opts = kit.cli_args()
  m = kit.Model(NAME)
  m.fuselage(UPPER, [(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], segments=16, lower_role=LOWER)
  m.fuselage('glazing', [(X(f), w * L, h * L, y * L) for f, w, h, y in NOSE_GLAZING], segments=16, node=f'{NAME}_nose')
  if CANOPY:
      m.fuselage('glazing', [(X(f), w * L, h * L, y * L) for f, w, h, y in CANOPY], segments=16)
  root_chord = 2 * WING_AREA / (S * (1 + TAPER))
  tip_chord = TAPER * root_chord
  sweep = SWEEP_DEG if SWEEP_DEG is not None else math.degrees(math.atan(0.25 * (root_chord - tip_chord) / (S / 2)))
  le_x = 0.25 * root_chord
  m.wing(UPPER, le_x, WING_Y * L, root_chord, tip_chord, S, sweep_deg=sweep, dihedral_deg=DIHEDRAL_DEG,
         thickness=ROOT_T, tip_thickness=TIP_T, lower_role=LOWER)
  tp = TAILPLANE
  m.wing(UPPER, X(tp['le']), tp['y'] * L, tp['root'] * L, tp['taper'] * tp['root'] * L, tp['span'] * S,
         sweep_deg=tp['sweep'], thickness=0.10, lower_role=LOWER)
  fin_root, fin_h = FIN['root'] * L, FIN['height'] * L
  fin_tip = FIN['taper'] * fin_root
  m.fin(UPPER, X(1.0) + fin_root, FIN['y'] * L, fin_root, fin_tip, fin_h, sweep_deg=math.degrees(math.atan((fin_root - fin_tip) / fin_h)))


  def wing_le(z):
      return le_x - abs(z) * math.tan(math.radians(sweep))


  def nacelle_y(z):
      return WING_Y * L + abs(z) * math.tan(math.radians(DIHEDRAL_DEG)) - NACELLE['below'] * L


  props = sorted(side * f * S for f in ENGINES for side in (-1, 1))   # port to starboard
  for i, z in enumerate(props, start=1):
      le, ny = wing_le(z), nacelle_y(z)
      m.fuselage(UPPER, [(le + dx * L, w * L, 1.05 * w * L, ny) for dx, w in NACELLE['stations']], segments=16,
                 center_z=z, lower_role=LOWER)
      pr = PROP
      m.propeller('dark', (le + pr['ahead'] * L, ny, z), PROP_DIAMETER, BLADES, pr['chord'] * L, pr['spinner_r'] * L,
                  pr['spinner_len'] * L, node=f'Prop{i}')
  g = GEAR
  for side, name in ((-1, 'GearL'), (1, 'GearR')):
      z = side * ENGINES[0] * S
      m.gear_leg('dark', (wing_le(z) + g['ahead'] * L, nacelle_y(z) - g['below'] * L, z), g['length'] * L,
                 g['wheel_r'] * L, g['wheel_w'] * L, node=name if g['retracts'] else None)
  tw = TAILWHEEL
  m.gear_leg('dark', (X(tw['at']), tw['y'] * L, 0.0), tw['length'] * L, tw['wheel_r'] * L, tw['wheel_w'] * L,
             node='Tailwheel' if tw['retracts'] else None)
  for i, t in enumerate(TURRETS, start=1):
      m.gun_turret(UPPER, i, (X(t['at']), t['y'] * L, 0.0), t['radius'] * L, t['height'] * L, up=t['up'],
                   barrels=t['barrels'], barrel_length=t['barrel'] * L, facing=t['facing'])
  m.export(out)
  ```
- [ ] **Step 3: Look** (as in Task 13, Step 3). Expected: bounds x −9.6..6.4 and z ±11.25; nodes `GearL`, `GearR`, `Prop1`, `Prop2`, `Turret1`, `ki21_dark`, `ki21_glazing`, `ki21_ijaGreen`, `ki21_nose`, `ki21_underside`.
- [ ] **Step 4: The entry** `tools/models/entries/ki-21-sally.json`. Pivots from the script's arithmetic (computed 2026-09-26): wing LE at z = 3.6 is 0.867398; nacelle y is −0.25522.
  ```json
  {
    "id": "ki-21-sally",
    "output": "content/aircraft/ki-21-sally.glb",
    "source": {
      "kind": "blender",
      "script": "tools/models/blender/ki-21-sally.py",
      "dimensions": "span 22.5 m, length 16 m, wing area 69.9 m2, 3-bladed propellers and one dorsal turret: English Wikipedia 'Mitsubishi Ki-21', Specifications (Ki-21-IIb), read 2026-09-26; every other figure is an ESTIMATE labeled in the script's header",
      "license": "AGPL-3.0-or-later"
    },
    "normalize": { "forward": "+x", "up": "+y", "origin": [0, 0, 0], "fit": { "extent": "span", "meters": 22.5 } },
    "keep": [
      { "node": "Prop1", "pivot": { "point": [3.2034, -0.25522, -3.6], "axis": "+x" } },
      { "node": "Prop2", "pivot": { "point": [3.2034, -0.25522, 3.6], "axis": "+x" } },
      { "node": "GearL", "pivot": { "point": [0.5474, -0.89522, -3.6], "axis": "+z" } },
      { "node": "GearR", "pivot": { "point": [0.5474, -0.89522, 3.6], "axis": "+z" } },
      { "node": "Turret1", "pivot": { "point": [-1.808, 0.944, 0], "axis": "+y" } }
    ],
    "textures": { "maxSize": 512, "format": "webp" },
    "budget": { "maxBytes": 5000000, "maxTriangles": 100000, "maxDrawCalls": 47 }
  }
  ```
- [ ] **Step 5: Rig, link, allowlist, rows.**
  ```ts
    'ki-21-sally': {
      props: [{ node: 'Prop1', blades: 3 }, { node: 'Prop2', blades: 3 }],
      gear: [
        { node: 'GearL', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE (ki-21-sally.py header)' },
        { node: 'GearR', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE (ki-21-sally.py header)' },
      ],
      turrets: ['Turret1'],
    },
  ```
  - `CEILING = 10`.
  - Row: `'ki-21-sally': { spanM: 22.5, lengthM: 16.0, tolerance: 0.01, source: "English Wikipedia 'Mitsubishi Ki-21', Specifications (Ki-21-IIb), read 2026-09-26" }`.
  - AGPL ASSETS row, in the Ki-84 row's form.
- [ ] **Step 6: Build and test serially** (Task 13, Step 6, with `ki-21-sally`). Commit: `R3: the Ki-21 Sally, an original Blender model`.

---

### Task 15: B-29 Superfortress (Blender; the four-engine template)

- [ ] **Step 1: Re-read the source.** `https://en.wikipedia.org/wiki/Boeing_B-29_Superfortress`, Specifications (B-29): length 99 ft 0 in (30.18 m), wingspan 141 ft 3 in (43.05 m), wing area 1,736 sq ft (161.3 m²), four remotely controlled turrets and a tail position (read 2026-09-26). The fetch that day did not reach the propeller line. **Read the propeller's blade count and diameter.** If the source gives them, change `BLADES`/`PROP_DIAMETER` and move them to CITED. The plan's values are 4 blades and 5.05 m (16 ft 7 in), both ESTIMATE.
- [ ] **Step 2: The script** `tools/models/blender/b-29-superfortress.py`:
  ```python
  # tools/models/blender/b-29-superfortress.py
  """Boeing B-29 Superfortress. Original work, AGPL-3.0-or-later.

  The four-engine template (R3): stations are fractions of the cited length or span; TRICYCLE
  and TURRETS make another four-engine type this file with its own CITED block (R3 plan, Task 16).

  Figures (read 2026-09-26, English Wikipedia "Boeing B-29 Superfortress", Specifications (B-29)):
    span 43.05 m, length 30.18 m, wing area 161.3 m2         CITED
    four remote turrets and a manned tail position            CITED (Turret1..5 nose to tail, for H3)
    4-bladed propellers, 5.05 m                               ESTIMATE (the fetch did not reach them; see the plan)
    taper 0.35, leading-edge sweep 7 deg, dihedral 4.5 deg,
      thickness 20% root / 10% tip                            ESTIMATE
    engine stations, nacelles, sections, glazing, tail, gear  ESTIMATE (fractions below)
    main gear retracts forward into the inboard nacelles;
      nose gear retracts aft                                  ESTIMATE
    unpainted natural metal                                   ESTIMATE (role naturalMetal)
  Frame: glTF, +x forward, +y up, +z right, meters; origin at the wing root's quarter chord on the
  fuselage axis (ESTIMATE). Pose: gear down (R3 P13).
  Leaves out: insignia, sighting blisters, antennas, panel lines, exhausts, bomb bays, cockpit.
  """
  import math
  import os
  import sys

  sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
  import kit  # noqa: E402

  NAME = 'b29'
  # --- CITED
  SPAN = 43.05
  LENGTH = 30.18
  WING_AREA = 161.3
  # --- ESTIMATE
  BLADES = 4
  PROP_DIAMETER = 5.05
  TAPER = 0.35
  SWEEP_DEG = 7.0
  DIHEDRAL_DEG = 4.5
  ROOT_T, TIP_T = 0.20, 0.10
  UPPER = LOWER = 'naturalMetal'
  NOSE_X = 0.4175
  WING_Y = -0.013
  FUSELAGE = [
      (0.967, 0.008, 0.008, 0.012, 2.0),
      (0.881, 0.028, 0.031, 0.007, 2.0),
      (0.749, 0.046, 0.048, 0.000, 2.0),
      (0.136, 0.048, 0.048, 0.000, 2.0),
      (0.053, 0.045, 0.045, -0.002, 2.0),
      (0.013, 0.031, 0.031, -0.003, 2.0),
      (0.001, 0.005, 0.005, -0.005, 2.0),
  ]
  NOSE_GLAZING = [(0.066, 0.0465, 0.0465, -0.002), (0.027, 0.041, 0.041, -0.003), (0.0, 0.003, 0.003, -0.005)]
  TAILPLANE = dict(span=0.307, le=0.8352, root=0.139, taper=0.43, y=0.030, sweep=10.0)
  FIN = dict(root=0.199, taper=0.40, height=0.166, y=0.040)
  ENGINES = [0.1696, 0.3298]
  NACELLE = dict(below=0.015, stations=[(-0.166, 0.0066), (-0.083, 0.025), (0.0, 0.028), (0.080, 0.028), (0.106, 0.023), (0.108, 0.0116)])
  PROP = dict(ahead=0.1125, chord=0.015, spinner_r=0.0116, spinner_len=0.02)
  TRICYCLE = True
  GEAR = dict(ahead=-0.016, below=0.027, length=0.0994, wheel_r=0.022, wheel_w=0.016, retracts='forward')
  NOSE_GEAR = dict(at=0.103, y=-0.042, wheel_r=0.016, wheel_w=0.012, retracts='aft')
  TAILWHEEL = None              # dict(at=..., y=..., length=..., wheel_r=..., wheel_w=..., retracts=...) when not TRICYCLE
  # (x aft of the nose, center y, up, radius, height, barrels, barrel length, facing), all of LENGTH but up/barrels/facing
  TURRETS = [
      (0.1695, 0.046, 1, 0.0166, 0.015, 2, 0.040, 1),
      (0.186, -0.046, -1, 0.0166, 0.015, 2, 0.040, 1),
      (0.6495, 0.046, 1, 0.0166, 0.015, 2, 0.040, -1),
      (0.6826, -0.046, -1, 0.0166, 0.015, 2, 0.040, -1),
      (0.9542, 0.010, 1, 0.0116, 0.010, 2, 0.023, -1),
  ]

  L, S = LENGTH, SPAN


  def X(f):
      return (NOSE_X - f) * L


  out, _opts = kit.cli_args()
  m = kit.Model(NAME)
  m.fuselage(UPPER, [(X(f), w * L, h * L, y * L, n) for f, w, h, y, n in FUSELAGE], segments=16)
  m.fuselage('glazing', [(X(f), w * L, h * L, y * L) for f, w, h, y in NOSE_GLAZING], segments=16)
  root_chord = 2 * WING_AREA / (S * (1 + TAPER))
  tip_chord = TAPER * root_chord
  le_x = 0.25 * root_chord
  m.wing(UPPER, le_x, WING_Y * L, root_chord, tip_chord, S, sweep_deg=SWEEP_DEG, dihedral_deg=DIHEDRAL_DEG,
         thickness=ROOT_T, tip_thickness=TIP_T)
  tp = TAILPLANE
  m.wing(UPPER, X(tp['le']), tp['y'] * L, tp['root'] * L, tp['taper'] * tp['root'] * L, tp['span'] * S,
         sweep_deg=tp['sweep'], thickness=0.10)
  fin_root, fin_h = FIN['root'] * L, FIN['height'] * L
  fin_tip = FIN['taper'] * fin_root
  m.fin(UPPER, X(1.0) + fin_root, FIN['y'] * L, fin_root, fin_tip, fin_h, sweep_deg=math.degrees(math.atan((fin_root - fin_tip) / fin_h)))


  def wing_le(z):
      return le_x - abs(z) * math.tan(math.radians(SWEEP_DEG))


  def nacelle_y(z):
      return WING_Y * L + abs(z) * math.tan(math.radians(DIHEDRAL_DEG)) - NACELLE['below'] * L


  props = sorted(side * f * S for f in ENGINES for side in (-1, 1))
  for i, z in enumerate(props, start=1):
      le, ny = wing_le(z), nacelle_y(z)
      m.fuselage(UPPER, [(le + dx * L, w * L, 1.05 * w * L, ny) for dx, w in NACELLE['stations']], segments=16, center_z=z)
      pr = PROP
      m.propeller('dark', (le + pr['ahead'] * L, ny, z), PROP_DIAMETER, BLADES, pr['chord'] * L, pr['spinner_r'] * L,
                  pr['spinner_len'] * L, node=f'Prop{i}')
  g = GEAR
  main_hinge_y = nacelle_y(ENGINES[0] * S) - g['below'] * L
  ground_y = main_hinge_y - g['length'] * L
  for side, name in ((-1, 'GearL'), (1, 'GearR')):
      z = side * ENGINES[0] * S
      m.gear_leg('dark', (wing_le(z) + g['ahead'] * L, main_hinge_y, z), g['length'] * L, g['wheel_r'] * L, g['wheel_w'] * L,
                 node=name if g['retracts'] else None)
  if TRICYCLE:
      ng = NOSE_GEAR
      m.gear_leg('dark', (X(ng['at']), ng['y'] * L, 0.0), ng['y'] * L - ground_y, ng['wheel_r'] * L, ng['wheel_w'] * L,
                 node='GearNose' if ng['retracts'] else None)
  else:
      tw = TAILWHEEL
      m.gear_leg('dark', (X(tw['at']), tw['y'] * L, 0.0), tw['length'] * L, tw['wheel_r'] * L, tw['wheel_w'] * L,
                 node='Tailwheel' if tw['retracts'] else None)
  for i, (at, y, up, radius, height, barrels, barrel, facing) in enumerate(TURRETS, start=1):
      m.gun_turret(UPPER, i, (X(at), y * L, 0.0), radius * L, height * L, up=up, barrels=barrels,
                   barrel_length=barrel * L, facing=facing)
  m.export(out)
  ```
- [ ] **Step 3: Look.** Expected: bounds x −17.580..12.600 and z ±21.525; nodes `GearL`, `GearNose`, `GearR`, `Prop1`…`Prop4`, `Turret1`…`Turret5`, `b29_glazing`, `b29_naturalMetal`. There is no `b29_dark`: every dark part is a named node. Read both previews. Check that the four discs clear each other and the fuselage, and that the tail guns stay forward of the rudder.
- [ ] **Step 4: The entry** `tools/models/entries/b-29-superfortress.json`. Pivots computed 2026-09-26 from the script's arithmetic:
  ```json
  {
    "id": "b-29-superfortress",
    "output": "content/aircraft/b-29-superfortress.glb",
    "source": {
      "kind": "blender",
      "script": "tools/models/blender/b-29-superfortress.py",
      "dimensions": "span 43.05 m, length 30.18 m, wing area 161.3 m2 and the four-turret-plus-tail layout: English Wikipedia 'Boeing B-29 Superfortress', Specifications (B-29), read 2026-09-26; every other figure, the propellers included, is an ESTIMATE labeled in the script's header",
      "license": "AGPL-3.0-or-later"
    },
    "normalize": { "forward": "+x", "up": "+y", "origin": [0, 0, 0], "fit": { "extent": "span", "meters": 43.05 } },
    "keep": [
      { "node": "Prop1", "pivot": { "point": [3.03967, 0.27236, -14.19789], "axis": "+x" } },
      { "node": "Prop2", "pivot": { "point": [3.88647, -0.27042, -7.30128], "axis": "+x" } },
      { "node": "Prop3", "pivot": { "point": [3.88647, -0.27042, 7.30128], "axis": "+x" } },
      { "node": "Prop4", "pivot": { "point": [3.03967, 0.27236, 14.19789], "axis": "+x" } },
      { "node": "GearL", "pivot": { "point": [0.00834, -1.08528, -7.30128], "axis": "+z" } },
      { "node": "GearR", "pivot": { "point": [0.00834, -1.08528, 7.30128], "axis": "+z" } },
      { "node": "GearNose", "pivot": { "point": [9.49161, -1.26756, 0], "axis": "+z" } },
      { "node": "Turret1", "pivot": { "point": [7.48464, 1.38828, 0], "axis": "+y" } },
      { "node": "Turret2", "pivot": { "point": [6.98667, -1.38828, 0], "axis": "-y" } },
      { "node": "Turret3", "pivot": { "point": [-7.00176, 1.38828, 0], "axis": "+y" } },
      { "node": "Turret4", "pivot": { "point": [-8.00072, -1.38828, 0], "axis": "-y" } },
      { "node": "Turret5", "pivot": { "point": [-16.19761, 0.3018, 0], "axis": "+y" } }
    ],
    "textures": { "maxSize": 512, "format": "webp" },
    "budget": { "maxBytes": 5000000, "maxTriangles": 100000, "maxDrawCalls": 47 }
  }
  ```
  If Step 1 changes the propeller figures, the hub pivots are unchanged: they sit at LE + 0.1125 L, independent of the diameter.
- [ ] **Step 5: Rig, link, allowlist, rows.**
  ```ts
    'b-29-superfortress': {
      props: [{ node: 'Prop1', blades: 4 }, { node: 'Prop2', blades: 4 }, { node: 'Prop3', blades: 4 }, { node: 'Prop4', blades: 4 }],
      gear: [
        { node: 'GearL', upAngleDeg: 90, retracts: 'forward', source: 'ESTIMATE (b-29-superfortress.py header)' },
        { node: 'GearNose', upAngleDeg: -90, retracts: 'aft', source: 'ESTIMATE (b-29-superfortress.py header)' },
        { node: 'GearR', upAngleDeg: 90, retracts: 'forward', source: 'ESTIMATE (b-29-superfortress.py header)' },
      ],
      turrets: ['Turret1', 'Turret2', 'Turret3', 'Turret4', 'Turret5'],
    },
  ```
  - `CEILING = 9`.
  - Row: `'b-29-superfortress': { spanM: 43.05, lengthM: 30.18, tolerance: 0.01, source: "English Wikipedia 'Boeing B-29 Superfortress', Specifications (B-29), read 2026-09-26" }`.
  - AGPL ASSETS row. The suspect candidate row stays in "Candidate models", unchanged.
- [ ] **Step 6: Build and test serially.** Commit: `R3: the B-29 Superfortress, an original Blender model`.

---

### Task 16: Blender fallbacks (only if Tasks 5–11 recorded one)

Skip this task, and record that you did, if no pick fell back. Otherwise, for each fallen-back id, in the order Tasks 5–11 ran:

- [ ] **Step 1: Pick the template.**
  - A single-engine type (F6F, F4U, Ki-43, Val): copy `ki-84-frank.py`. For the Val, set `GEAR_RETRACTS = None` and `TAILWHEEL_RETRACTS = False`, which gives fixed gear, not rigged (P15). For the F6F and F4U, set `GEAR_RETRACTS = 'aft'`.
  - A twin (G4M): copy `ki-21-sally.py`.
  - A four-engine type (B-17): copy `b-29-superfortress.py`, with `TRICYCLE = False`, `TAILWHEEL = dict(at=0.95, y=0.0, length=0.10, wheel_r=0.012, wheel_w=0.008, retracts=True)`, and the B-17's turrets: chin, top, ball, tail.
  - The P-38: use the script in Step 4.
- [ ] **Step 2: Replace the CITED block.** Use the figures the task's dimensions row cites, and read the wing area from the same page. Replace `NAME`, the palette (USN blue-grey has no role: use `naturalMetal` for US types and record it as an ESTIMATE), and the header. Leave the fraction tables alone. Change a fraction only where a preview shows a defect a reader would call wrong for the type, and record each change.
- [ ] **Step 3: Compute the pivots** with the script's own formulas, the way Tasks 13–15 give them. Then follow those tasks' Steps 3–6 with the task's `blender` entry. Credit pin: the fallen-back author's name drops out (a Blender model has no CC-BY credit). Recompute the pin from the remaining CC-BY entries in file-name order, and record it.
- [ ] **Step 4: The P-38 fallback script** `tools/models/blender/p-38-lightning.py`. Read `https://en.wikipedia.org/wiki/Lockheed_P-38_Lightning`, Specifications (P-38L), first: span 15.85 m, length 11.53 m, wing area 30.43 m² (327.5 sq ft). Use your read date.
  ```python
  # tools/models/blender/p-38-lightning.py
  """Lockheed P-38L Lightning. Original work, AGPL-3.0-or-later (R3 fallback, Task 16).

  Figures (English Wikipedia "Lockheed P-38 Lightning", Specifications (P-38L), read on the date in
  tools/models/entries/p-38-lightning.json):
    span 15.85 m, length 11.53 m, wing area 30.43 m2          CITED
    two 3-bladed propellers, 3.51 m                           ESTIMATE (blade count from photographs)
    boom spacing, gondola and boom sections, tail, gear      ESTIMATE (fractions below)
    tricycle gear, all three legs retracting aft             ESTIMATE of the angles
    natural metal                                             ESTIMATE
  Frame: glTF, +x forward, +y up, +z right, meters; origin at the wing root's quarter chord.
  Leaves out: the fins' lower halves, turbosuperchargers, radiators, guns, insignia, cockpit.
  """
  import math
  import os
  import sys

  sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
  import kit  # noqa: E402

  NAME = 'p38'
  SPAN, LENGTH, WING_AREA = 15.85, 11.53, 30.43       # CITED
  BLADES, PROP_DIAMETER = 3, 3.51                     # ESTIMATE
  TAPER, DIHEDRAL_DEG, ROOT_T, TIP_T = 0.40, 5.5, 0.15, 0.10
  NOSE_X, WING_Y = 0.36, -0.004
  BOOM_Z = 0.16                                        # of SPAN
  GONDOLA = [(0.62, 0.006, 0.008, 0.010), (0.50, 0.045, 0.055, 0.015), (0.30, 0.055, 0.065, 0.010),
             (0.12, 0.050, 0.055, 0.000), (0.03, 0.030, 0.032, -0.005), (0.0, 0.004, 0.004, -0.008)]
  CANOPY = [(0.42, 0.004, 0.004, 0.060), (0.36, 0.035, 0.030, 0.070), (0.26, 0.034, 0.028, 0.068), (0.20, 0.004, 0.004, 0.060)]
  BOOM = [(0.985, 0.006, 0.008, 0.020), (0.85, 0.020, 0.026, 0.018), (0.55, 0.030, 0.038, 0.005),
          (0.35, 0.052, 0.060, -0.005), (0.20, 0.055, 0.058, 0.000), (0.085, 0.045, 0.045, 0.000), (0.078, 0.025, 0.025, 0.000)]
  PROP = dict(hub=0.068, chord=0.022, spinner_r=0.028, spinner_len=0.035)
  FIN = dict(root=0.12, taper=0.6, height=0.14, y=0.02)
  TAILPLANE = dict(le=0.86, root=0.10, taper=0.9, y=0.02, overhang=0.40)
  GEAR = dict(ahead=-0.01, below=0.045, length=0.15, wheel_r=0.030, wheel_w=0.018)
  NOSE_GEAR = dict(at=0.08, y=-0.045, wheel_r=0.022, wheel_w=0.014)

  L, S = LENGTH, SPAN


  def X(f):
      return (NOSE_X - f) * L


  out, _opts = kit.cli_args()
  m = kit.Model(NAME)
  bz = BOOM_Z * S
  m.fuselage('naturalMetal', [(X(f), w * L, h * L, y * L) for f, w, h, y in GONDOLA], segments=16)
  m.fuselage('glazing', [(X(f), w * L, h * L, y * L) for f, w, h, y in CANOPY], segments=16)
  root_chord = 2 * WING_AREA / (S * (1 + TAPER))
  tip_chord = TAPER * root_chord
  sweep = math.degrees(math.atan(0.25 * (root_chord - tip_chord) / (S / 2)))
  le_x = 0.25 * root_chord
  m.wing('naturalMetal', le_x, WING_Y * L, root_chord, tip_chord, S, sweep_deg=sweep, dihedral_deg=DIHEDRAL_DEG,
         thickness=ROOT_T, tip_thickness=TIP_T)
  fin_root, fin_h = FIN['root'] * L, FIN['height'] * L
  fin_tip = FIN['taper'] * fin_root
  for i, z in enumerate((-bz, bz), start=1):
      m.fuselage('naturalMetal', [(X(f), w * L, h * L, y * L) for f, w, h, y in BOOM], segments=16, center_z=z)
      m.fin('naturalMetal', X(1.0) + fin_root, FIN['y'] * L, fin_root, fin_tip, fin_h,
            sweep_deg=math.degrees(math.atan((fin_root - fin_tip) / fin_h)), center_z=z)
      pr = PROP
      m.propeller('dark', (X(pr['hub']), 0.0, z), PROP_DIAMETER, BLADES, pr['chord'] * L, pr['spinner_r'] * L,
                  pr['spinner_len'] * L, node=f'Prop{i}')
  tp = TAILPLANE
  m.wing('naturalMetal', X(tp['le']), tp['y'] * L, tp['root'] * L, tp['taper'] * tp['root'] * L, 2 * (bz + tp['overhang']),
         thickness=0.10)
  g = GEAR
  gy = -g['below'] * L
  ground_y = gy - g['length'] * L
  for side, name in ((-1, 'GearL'), (1, 'GearR')):
      z = side * bz
      m.gear_leg('dark', (le_x - bz * math.tan(math.radians(sweep)) + g['ahead'] * L, gy, z), g['length'] * L,
                 g['wheel_r'] * L, g['wheel_w'] * L, node=name)
  ng = NOSE_GEAR
  m.gear_leg('dark', (X(ng['at']), ng['y'] * L, 0.0), ng['y'] * L - ground_y, ng['wheel_r'] * L, ng['wheel_w'] * L, node='GearNose')
  m.export(out)
  ```
  Its entry: `normalize` identity, fit span 15.85. Pivots computed 2026-09-26 from this arithmetic:
  - `Prop1` [3.36676, 0, −2.536] and `Prop2` [3.36676, 0, 2.536], axis `+x`;
  - `GearL` [0.43872, −0.51885, −2.536] and `GearR` [0.43872, −0.51885, 2.536], axis `+z`;
  - `GearNose` [3.2284, −0.51885, 0], axis `+z`.

  Use the fighter budget. Rig row: Task 8's, with every leg `-90` aft.
- [ ] **Step 5: Commit each fallback separately** (`R3: the <type>, an original Blender model (fallback: <reason>)`).

---

### Task 17: Reference-GPU Tier 2 and the checkpoint captures

**Files:**
- Modify: `tests/e2e/hangar.spec.ts` (check 7, check 10, new check 13)
- Local scratch, **never committed:** `vite.config.ts` (the slot), `tests/e2e/r3-checkpoint.spec.ts`
- Create: `docs/handoff/$R3_DATE-r3-shots/`

- [ ] **Step 1: Extend the spec.**
  In check 7, after `if (!hasPart(await current(page), 'gear')) continue`, add:
  ```ts
        // A display-only aircraft (no spec) has no gear travel, so no Cycle button (R3 Review Focus 3).
        if (((await page.locator(`ul[aria-label="Objects"] button[data-id="${id}"]`).textContent()) ?? '').includes('(not in the game yet)')) {
          await expect(page.getByRole('button', { name: 'Cycle landing gear' })).toHaveCount(0)
          continue
        }
  ```
  In check 10:
  - replace the comment `// The registered models have budgets; the Zero draws as the Wildcat.` with `// The registered models have budgets (R3: every aircraft draws its own model).`;
  - replace the list with `['f4f-wildcat', 'a6m-zero', 'f6f-hellcat', 'f4u-corsair', 'p-38-lightning', 'ki-43-oscar', 'd3a-val', 'g4m-betty', 'b-17-flying-fortress', 'ki-84-frank', 'ki-21-sally', 'b-29-superfortress', 'essex-cv', 'fletcher-dd', 'type-b-maru', 'hangar']`;
  - after the hangar `modelUrl` assertion, add:
  ```ts
      // R3: the Zero and the Hellcat draw their own glbs in the Hangar, not the Wildcat's.
      for (const [id, glb] of [['a6m-zero', 'a6m2-zero'], ['f6f-hellcat', 'f6f-hellcat']] as const) {
        await select(page, id)
        expect((await page.evaluate(() => (window as HangarWindow).__hangar!.counts()))?.modelUrl ?? '', id).toMatch(new RegExp(`content/aircraft/${glb}\\.glb$`))
      }
  ```
  After check 11, add:
  ```ts
    test("13. every rigged aircraft's pivot gizmos are its named props and gear legs (R3)", async ({ page }) => {
      await setDebug(page, 'gizmos', true)
      for (const id of await entries(page)) {
        await select(page, id)
        const c = await current(page)
        if (c.kind !== 'aircraft' || id === 'f4f-wildcat') continue
        const nodes = await page.evaluate(() => (window as HangarWindow).__hangar!.gizmoNodes())
        for (const n of nodes) expect(n, id).toMatch(/^(Prop\d*|GearL|GearR|GearNose|Tailwheel)$/)
        expect(nodes.some((n) => n.startsWith('Prop')), `${id} prop gizmo`).toBe(hasPart(c, 'prop'))
        expect(nodes.some((n) => /^(Gear|Tailwheel)/.test(n)), `${id} gear gizmo`).toBe(hasPart(c, 'gear'))
      }
      await setDebug(page, 'gizmos', false)
      expect(await page.evaluate(() => (window as HangarWindow).__hangar!.validationErrors)).toEqual([])
    })
  ```
  Run `npx tsc --noEmit` and `npx eslint tests/e2e/hangar.spec.ts --max-warnings 0`.
- [ ] **Step 2: Serve on a free slot** (R1's recipe):
  ```bash
  for p in 5174 5175; do pid=$(ss -ltnp | grep ":$p " | grep -oP 'pid=\K[0-9]+' | head -1); echo "$p ${pid:+busy: $(readlink /proc/$pid/cwd)}"; done
  ```
  Pick a free slot: `ww2airsim-3` on 5174 or `ww2airsim-2` on 5175. Point this worktree's `vite.config.ts` at it (`TUNNEL_HOST`, `server.port`), **never staged**. Then run `WW2AIRSIM_TUNNEL=1 npx vite --port <port>` in the background. Assert that `curl -sS -o /dev/null -w '%{http_code}\n' https://<slot host>/hangar.html` prints `200`. If both slots are busy, wait and re-check; never stop another session's server.
- [ ] **Step 3: Run Tier 2 on the reference GPU.**
  ```bash
  ss -ltn | grep -q ':39001 ' || (ssh -N -L 39001:127.0.0.1:3000 ryzen &)
  PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://<slot host> npx playwright test tests/e2e/adapter.spec.ts tests/e2e/hangar.spec.ts tests/e2e/wildcat.spec.ts tests/e2e/entities.spec.ts; echo "rc=$?"
  ```
  Expected `rc=0`. The adapter guard proves the RX 6700 XT. `wildcat.spec.ts` and `entities.spec.ts` run because `airframes.ts` changed.
  - Copy every `console.log` line into the ledger: check 10's counts per aircraft, and the check 5 luminance ratios.
  - If check 5 fails for a Blender model (flat paint outside 0.5–1.5× the Wildcat's luminance), change that role's palette color toward the band. Record the measured ratio before and after as a `Ruling:`, rebuild every model using that role (serially), re-run Tier 1 for them, and re-run this step. **Never widen the check.**
  - If the Playwright server is not reachable, record `Ruling: Tier 2 not run — run-server down on the desktop`. Finish the plan, and say so first in the handoff.
- [ ] **Step 4: Checkpoint captures.** Write the throwaway `tests/e2e/r3-checkpoint.spec.ts` (**never committed**):
  ```ts
  import { test } from '@playwright/test'
  import type { HangarWindow } from '../../src/render/hangar/hooks.js'

  const IDS = ['a6m-zero', 'f6f-hellcat', 'f4u-corsair', 'p-38-lightning', 'ki-43-oscar', 'd3a-val', 'g4m-betty', 'b-17-flying-fortress', 'ki-84-frank', 'ki-21-sally', 'b-29-superfortress']
  test.use({ viewport: { width: 2560, height: 1440 } })
  test('R3 checkpoint: every new aircraft, turntable frozen', async ({ page }) => {
    test.setTimeout(600_000)
    const dir = process.env.R3_SHOTS!
    await page.goto('/hangar.html?bench')
    await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
    await page.evaluate(() => (window as HangarWindow).__hangar!.ready)
    await page.evaluate(() => (window as HangarWindow).__hangar!.freeze())
    const settle = () => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))))
    for (const id of IDS) {
      await page.evaluate((i) => (window as HangarWindow).__hangar!.select(i), id)
      for (const preset of ['three-quarter', 'side'] as const) {
        await page.evaluate((c) => (window as HangarWindow).__hangar!.camera(c), preset)
        await settle()
        await page.locator('#hangar-canvas').screenshot({ path: `${dir}/${id}-${preset}.png` })
      }
    }
  })
  ```
  Run it:
  ```bash
  mkdir -p "docs/handoff/$R3_DATE-r3-shots"
  R3_SHOTS="docs/handoff/$R3_DATE-r3-shots" PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://<slot host> npx playwright test tests/e2e/r3-checkpoint.spec.ts; echo "rc=$?"
  ```
  **Read every PNG.** For each aircraft check:
  - the nose faces +x;
  - the gear stands on the pad;
  - the propellers are on their hubs;
  - there are no holes and no transparent hull;
  - the silhouette matches the type (above all the decimated B-17 and Val, against their raw previews).

  A defect goes back to its model task with a failing Tier 1 measurement where one exists. Re-freeze after any fix. Keep each PNG under 1.5 MB, downscaling with `sharp` if needed.
- [ ] **Step 5: Restore and commit.**
  - `git checkout -- vite.config.ts`, delete `tests/e2e/r3-checkpoint.spec.ts`, and stop only this worktree's server.
  - `git status --short` must not list `vite.config.ts` or the checkpoint spec.
  ```bash
  git add tests/e2e/hangar.spec.ts "docs/handoff/$R3_DATE-r3-shots/"
  git commit -m "R3: Tier 2 check 13 (rigged gizmos), check 7 skips display-only aircraft, frozen captures of the eleven aircraft"
  ```

---

### Task 18: Verification, documentation, handoff, email

**Files:**
- Create: `docs/handoff/$R3_DATE-r3-aircraft-models.md`
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§15: the "A6M Zero (Z1-Z3)" and "Model roster" rows)
- Modify: `README.md` (the roster paragraph R2 left), `docs/models.md`, `ASSETS.md` (one paragraph)

- [ ] **Step 1: Full verification on ryzen.**
  ```bash
  remote-run npm run verify; rc=$?; echo "rc=$rc"
  ```
  Expected `rc=0`. R1 and R2 both hit `tests/sim/ai/furball.test.ts`'s 10 s `beforeAll` timeout under full-suite contention. If that is the only failure:
  - run it alone: `remote-run npx vitest run tests/sim/ai/furball.test.ts; echo "rc=$?"`;
  - re-run verify once, and record both runs.

  Any other red is a defect to fix before going on. Record the skip count: `blenderEntries.test.ts`'s rebuild block and the three Blender kit suites are named skips there.

  Then the Blender-only suites on nexus, by name:
  ```bash
  npx vitest run tests/tools/models/blender tests/tools/models/blenderEntries.test.ts --maxWorkers=1; echo "rc=$?"
  ```
  Expected `rc=0`, nothing skipped: every Blender model, the three R3 ones included, rebuilds byte-identically.
- [ ] **Step 2: The game is unchanged (P17).**
  ```bash
  git diff main...HEAD --stat -- content/scenarios src/sim
  git diff main...HEAD --name-only -- content/aircraft/*.json
  git diff main...HEAD -- content/aircraft/f6f-hellcat.json content/aircraft/f4f-wildcat.json | wc -l
  git ls-files tools/models/cache content/models/candidates vite.config.ts tests/e2e/r3-checkpoint.spec.ts | grep -v '^vite.config.ts$'
  git diff main...HEAD -- vite.config.ts | wc -l
  ```
  Expected, in order:
  - empty;
  - `content/aircraft/a6m2-zero.json` alone;
  - `0`;
  - empty;
  - `0`.
- [ ] **Step 3: `docs/models.md`.**
  - In §5, after the sentence ending "numbered bow to stern.", add: `Aircraft parts (R3): \`Prop\`, or \`Prop1\`…\`PropN\` from port to starboard; \`GearL\`, \`GearR\`, \`GearNose\`, \`Tailwheel\`; \`Turret1\`…\`TurretN\` nose to tail, dorsal before ventral at one station. Every one needs a \`pivot\`: the build moves its origin onto the hinge and records the axis the runtime turns it about. Never simplify a propeller (\`perNode\` ratio 1): \`tests/tools/models/aircraftRigs.test.ts\` checks its N-fold symmetry. A download posed at an angle takes \`normalize.yawDeg\` (measure it with \`npm run models:rig\`), and one with a material per part takes \`dedupMaterials: true\`.`
  - In §7, replace the **Aircraft** bullet with: `**Aircraft:** add a row for the id to \`AIRFRAME_RIGS\` in [\`src/render/scene/airframeRigs.ts\`](../src/render/scene/airframeRigs.ts), which registers it in \`AIRFRAME_MODELS\` through the one generic module, \`pivotedAirframe.ts\` (R3). Only a model whose parts move by a baked clip, as the Wildcat's do, needs its own module. For the Library, set the entry's \`model\` (§8). Set a spec's \`view.model\` only for an airframe the game should fly with it, and a rigged model hangs no stores.`
  - In §9's check list, add `every rigged aircraft's gizmos are its props and legs (check 13, R3)`.
  - In "Authoring in Blender", after "`hangar.py` is the worked example", add: `For aircraft, \`ki-84-frank.py\`, \`ki-21-sally.py\` and \`b-29-superfortress.py\` are one-, two- and four-engine templates whose geometry is fractions of the cited length and span (R3).`
- [ ] **Step 4: `ASSETS.md`.** Below the table, add one paragraph in the ships paragraph's style, with the measured numbers from the ledger. For each download, give:
  - the triangle count before and after;
  - what the build removed (the figure, the bombs, instruments, engine internals, the drop tank or not);
  - the yaw;
  - which parts are rigged and which stayed fused.

  Every sentence is a measured fact with the date.
- [ ] **Step 5: §15.**
  - In the **A6M Zero (Z1-Z3)** row, replace `It is drawn with the Wildcat stand-in (\`view.model: wildcat\`) and is in service in the Hangar. Z3 not started` with `Z3's model half carried out by R3 ($R3_DATE): the Zero draws its own rigged model (\`view.model: a6m2-zero\`), Hangar and game alike; the zero-range scenario, the distance LOD and re-measured guns, zones and eye point are deferred until the Zero enters a scenario (R3 plan, ruling P1)`.
  - In the **Model roster** row, replace `R2-R5 not started` (or whatever R2 left: `R3-R5 not started`) with a sentence that has the same shape as R2's, giving:
    - `R3 complete $R3_DATE on branch \`worktree-r3-aircraft\` (not merged)`;
    - the eleven aircraft, with sources (8 Sketchfab, 3 Blender, plus any fallback);
    - the allowlist at 9;
    - the Tier 2 result;
    - links to this plan and the handoff.
  - Point, do not restate.
- [ ] **Step 6: README.** Extend the one roster paragraph R2 left (`grep -n 'R2' README.md`) to name R3 and point back to §15. Add nothing else.
- [ ] **Step 7: The handoff** `docs/handoff/$R3_DATE-r3-aircraft-models.md`, in R2's shape:
  - what shipped;
  - per model: source, license, bytes, triangles, draws, what was removed, rigged parts, fused parts;
  - rulings P1–P17 and every execution `Ruling:`;
  - Tier 1 counts and rc for every run;
  - Tier 2: slot, adapter, counts, luminance ratios;
  - the 22 captures, each linked twice: relatively, and as `https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/$R3_DATE-r3-shots/<file>`, because `*.marktuttle.dev` is blocked on Mark's work network;
  - how to see it live (a slot is up only while a server runs, so check with `curl … → 200` first);
  - found along the way;
  - open items. At least: the Z3 remainder (P1); the Zero's +5% length (P10); the Hellcat's in-game model (design §6.2); turrets for H3 (only the Blender bombers, and any separable download turrets, are named); no insignia on the Blender models; the B-29 propeller figures, if still ESTIMATE.
- [ ] **Step 8: Final ledger entry and commit.** Record every rc, the named skips, and the commit range. Then:
  ```bash
  git add docs/handoff/"$R3_DATE"-r3-aircraft-models.md docs/superpowers/specs/2026-09-12-ww2airsim-design.md README.md docs/models.md ASSETS.md
  git commit -m "R3: handoff, §15 rows, README pointer and the aircraft runbook"
  git push -u origin worktree-r3-aircraft
  ```
- [ ] **Step 9: Email the handoff** (exits 0 and prints a byte count; **never re-run with `--debug`**):
  ```bash
  python3 tools/mail-doc.py "docs/handoff/$R3_DATE-r3-aircraft-models.md" "ww2airsim R3: the eleven aircraft models (handoff)"
  ```
  Do not merge, and do not push `main`.

## Acceptance

- Tier 1 on ryzen (`remote-run npm run verify`, rc 0) and the nexus Blender suites (rc 0, nothing skipped) are green.
- `NOT_YET_DRAWN` holds the 9 non-aircraft entries, and `CEILING = 9`.
- Every aircraft entry has a committed glb within its recorded budget, a cited span and length (4% for a download, 6% for the Zero, 1% for Blender), a rig proven against its bytes (symmetry, hinge, direction), and an `ASSETS.md` row.
- The Zero stands at its spec's gear height.
- Tier 2 on the RX 6700 XT draws every aircraft lit, articulated and under budget, with zero validation errors. 22 frozen captures are read and linked.
- No scenario, sim or in-game aircraft appearance changes except the Zero's `view.model`.
