# DP1 Aircraft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the three first-generation Blender aircraft (Ki-21 Sally, P-38 Lightning, B-29 Superfortress) to the DP0 Ki-84 look: fine airfoil geometry, framed canopies, control surfaces, twisted propeller blades, exhausts, guns, and a baked 1024 px skin with cited markings.

**Architecture:** Each script is rewritten on the Ki-84's structure (`tools/models/blender/ki-84-frank.py` is the template), using `kit.Model(name, skin=1024)` so the skin stage bakes an atlas in TypeScript. Rig nodes, pivots, dimensions and the gameplay-facing names do not change. The flat-shaded allowlist shrinks from 12 to 9 entries. Marking colors for USAAF insignia are added to the skin stage because two of the three aircraft are American.

**Tech Stack:** Blender 5.0.1 headless (Python, `kit.py`), TypeScript skin stage (`tools/models/skin/`), `sharp`, vitest, Playwright (Hangar Tier 2 on the reference GPU).

**Spec:** `docs/superpowers/specs/2026-09-28-model-detail-pass-design.md` (row DP1 of its plan table). Read `docs/superpowers/plans/2026-09-28-dp2-ships.md` for the task style and `docs/handoff/2026-09-28-dp0-skin-pipeline.md` for the Ki-84 pilot's numbers.

## Decisions (Mark, 2026-09-28)

- **Scope:** DP1 only. The Pennsylvania is "good enough for now": its deck and bridge notes stay open in the DP2 handoff and are not in this plan.
- **Checkpoint:** final product only. **Unattended:** run to completion without stopping; collect captures in the handoff.
- **Where:** a new worktree off current `main` (`~/projects/ww2airsim-worktrees/dp1-aircraft`, branch `worktree-dp1-aircraft`). Branch pushes are allowed. **Never merge into `main`, push `main`, or deploy** without Mark.
- **Dev slot:** use `ww2airsim-3` (port 5174, `172.17.0.1`) only if no other session holds it; check with `ss -ltn | grep 5174` first. The `vite.config.ts` edit is scratch and never staged.

## Global Constraints

- Every model keeps its rig: nodes and pivots named in each entry's `keep` list (Ki-21: Prop1, Prop2, GearL, GearR, Turret1; P-38: Prop1, Prop2, GearL, GearR, GearNose; B-29: Prop1-4, GearL, GearR, GearNose, Turret1-5). `tests/tools/models/aircraftRigs.test.ts` and `src/render/scene/airframeRigs.ts` are the gate; retracted legs must stay inside the skin.
- Overall dimensions do not change: `tests/tools/models/aircraftDimensions.test.ts` passes untouched.
- Triangles land in 25-60% of the entry's budget (a reported check, not a failure). Budgets stay: Ki-21 and B-29 100,000 tris; P-38 60,000 tris; all 47 draws, 5,000,000 B (P-38 3,000,000 B). Raise a budget only with a dated ruling in the ledger.
- Every marking is CITED (source and date read) or labeled ESTIMATE in the script header. No invented unit codes.
- Additions embed at least 0.02 m into what they stand on (no coplanar faces); `EMBED_M = 0.02`.
- One `TEXCOORD_0`, no `TEXCOORD_1`. Atlas 1024 px, `"skin": true`, `"textures": {"maxSize": 1024, "format": "webp"}`.
- Skinned non-ship entries carry `metallicFactor 1` (`skins.test.ts`).
- Rebuilds are byte-identical (`tests/tools/models/blender` suites prove it).
- US spelling. Imperial units in any user-facing prose (docs, handoff tables); Blender code stays SI.
- Run only touched test files on nexus; `remote-run npm run verify` ends the plan. Capture `rc=$?` directly. Never gate on a grepped pipeline.
- Blender on nexus is a shim that runs one build at a time; do not run parallel builds there.

## Review Focus

1. **Metallic luminance:** `naturalMetal` is `metallic: 1`; the B-29 and P-38 can fail Hangar check 15's 0.6x-1.5x band against their flat predecessors under the Hangar's lighting. Expected behavior: a bare-metal aircraft that still reads as bright aluminum. Owned by Task 4 (P-38) and Task 5 (B-29): measure ratio before committing the surfaces row.
2. **Retracted gear versus a finer skin:** finer nacelles and wing roots can poke through retracted legs. Expected: `aircraftRigs.test.ts` passes with no widened tolerance. Owned by Tasks 3-5.
3. **Prop symmetry:** the sim and `airframeRigs.ts` assume the kit's propellers are N-fold symmetric (Ki-21 and P-38 3-fold, B-29 4-fold). Twisted blades must keep the fold. Owned by Tasks 3-5 (test: `aircraftRigs.test.ts`).
4. **Marking on the wrong side or mirrored:** star-and-bar and hinomaru must read correctly on both wings and the fuselage. Expected: discs are placed per side with the border ring; verified by the Hangar shots. Owned by Task 2 (colors test) and Tasks 3-5.
5. **Byte-identical rebuilds:** any nondeterminism (set ordering, float formatting) breaks the rebuild suite. Owned by every script task; each ends by rebuilding twice and comparing hashes.

---

## File Structure

- `tools/models/skin/colors.ts`: add USAAF marking colors (Task 2).
- `tools/models/blender/ki-21-sally.py`, `p-38-lightning.py`, `b-29-superfortress.py`: rewritten (Tasks 3-5).
- `tools/models/entries/{ki-21-sally,p-38-lightning,b-29-superfortress}.json`: `skin`, textures 1024, and `keep` unchanged.
- `tools/models/skin/surfaces.ts`: surfaces rows only if a role needs an aircraft-specific tweak (Tasks 4-5).
- `content/aircraft/*.glb` (the entries' `output`): rebuilt.
- `tests/tools/models/skins.test.ts`: allowlist 12 to 9 (Task 6).
- `tests/e2e/hangar.spec.ts` (check 16 list, ~line 386) and `tests/e2e/fixtures/flat-luminance.json`: add three aircraft (Tasks 1 and 6).
- `docs/models.md`, `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` §15 row, `README.md` paragraph, `docs/handoff/2026-09-28-dp1-aircraft.md` and its `-shots/` directory (Task 8).

---

### Task 1: Worktree, baseline and flat luminance

**Files:**
- Create: worktree `~/projects/ww2airsim-worktrees/dp1-aircraft`; `.superpowers/sdd/2026-09-28-dp1-aircraft/progress.md` (gitignored ledger)
- Modify: `tests/e2e/fixtures/flat-luminance.json`

**Interfaces:**
- Produces: `flat-luminance.json` entries `ki-21-sally`, `b-29-superfortress`, `p-38-lightning` measured from the flat glbs on `main`; flat triangle counts recorded in the ledger.

- [ ] **Step 1: Create the worktree**

```bash
cd ~/projects/ww2airsim && git status --short && git worktree add ../ww2airsim-worktrees/dp1-aircraft -b worktree-dp1-aircraft main
cd ../ww2airsim-worktrees/dp1-aircraft && ln -s ~/projects/ww2airsim/content/terrain/tiles content/terrain/tiles 2>/dev/null; ls content/terrain
```

Expected: worktree exists. If terrain data is missing, tests show named skips; that is fine. Never run `git clean -fdx`.

- [ ] **Step 2: Write the ledger**

Create `.superpowers/sdd/2026-09-28-dp1-aircraft/progress.md` with the decisions above and, per aircraft, flat triangle count and glb SHA-256 (`sha256sum content/aircraft/<id>.glb`). Read triangle counts with the repo's inspection helper used by `tests/tools/models/aircraftDimensions.test.ts` (grep it for the accessor) rather than writing a new one.

- [ ] **Step 3: Measure flat luminance**

Read how the existing entries in `tests/e2e/fixtures/flat-luminance.json` were produced (the header of `hangar.spec.ts` check 15 names the procedure; the DP0 handoff records it). Follow it for the three aircraft against the committed flat glbs, then add the three values.

- [ ] **Step 4: Check the fixture parses and commit**

```bash
npx vitest run tests/render/hangar/catalog.test.ts tests/render/hangar/provenance.test.ts; echo rc=$?
git add tests/e2e/fixtures/flat-luminance.json && git commit -m "DP1: flat luminance baselines for Ki-21, B-29 and P-38"
```

Expected: rc=0.

---

### Task 2: USAAF marking colors and sources

**Files:**
- Modify: `tools/models/skin/colors.ts`
- Test: `tests/tools/models/skin/shipColors.test.ts` is the ship analogue; extend the aircraft color test if one exists (`grep -rn MARKING_COLORS tests/`), otherwise add `tests/tools/models/skin/aircraftColors.test.ts`.
- Create: source notes in the ledger

**Interfaces:**
- Produces: `MARKING_COLORS` keys `usaaInsigniaBlue`, `usaaInsigniaWhite`, `usaaInsigniaRed`, `propTipYellow`. No paint role is added (roles come from the kit). Each carries a source comment or the word ESTIMATE.

- [ ] **Step 1: Research and record sources (read date 2026-09-28)**

For each aircraft record in the ledger, with a URL or document and the date read:
- Ki-21-II: IJAAF overall paint and the 1st or 60th Sentai marking style (tail band, hinomaru border), engine cowling color.
- P-38J/L: bare metal with olive drab anti-glare panel on the nose, national insignia size and position (1943-44 style: white bar with red border, blue surround), prop hub.
- B-29: bare metal, 1945 insignia positions, and which group's tail marking (a triangle-in-circle style was used; cite the group and letter or leave it out).

If a marking cannot be cited, leave it out or label it ESTIMATE in the script header. Do not guess unit codes.

- [ ] **Step 2: Write the failing test**

```ts
import { MARKING_COLORS } from '../../../tools/models/skin/colors'
import { describe, expect, it } from 'vitest'

describe('USAAF marking colors', () => {
  it.each(['usaaInsigniaBlue', 'usaaInsigniaWhite', 'usaaInsigniaRed', 'propTipYellow'] as const)('%s is a valid sRGB triple', (k) => {
    const c = MARKING_COLORS[k]
    expect(c).toHaveLength(3)
    for (const v of c) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(255)
  })
})
```

Run `npx vitest run <that file>`; expected FAIL (keys missing).

- [ ] **Step 3: Add the colors**

Add to `colors.ts` with citation-or-ESTIMATE comments in the file's existing style, e.g. `usaaInsigniaBlue: [0x1c, 0x2a, 0x4a], // ESTIMATE: Insignia Blue, weathered`. Replace an ESTIMATE only with a color read from a cited chip or standard, dated.

- [ ] **Step 4: Run, typecheck, commit**

```bash
npx vitest run tests/tools/models/skin; echo rc=$?; npx tsc --noEmit -p . ; echo rc=$?
git add tools/models/skin/colors.ts tests/tools/models/skin && git commit -m "DP1: USAAF insignia and propeller-tip marking colors"
```

Expected: rc=0 for both.

---

### Task 3: Ki-21 Sally

**Files:**
- Modify: `tools/models/blender/ki-21-sally.py`, `tools/models/entries/ki-21-sally.json`, the rebuilt glb named by the entry's `output`
- Test: `tests/tools/models/aircraftRigs.test.ts`, `aircraftDimensions.test.ts`, the Blender entry suites

**Interfaces:**
- Consumes: Task 2 colors (`hinomaruRed`, `insigniaWhite`, `idYellow`, `exhaustSoot`, `walkwayDark`, `lensClear` already exist); the Ki-84 script's techniques.
- Produces: same node names and pivots as today; constants SPAN 22.5, LENGTH 16.0, WING_AREA 69.9, PROP_DIAMETER 3.4 unchanged.

- [ ] **Step 1: Re-read the template and the current script**

Read `ki-84-frank.py` in full and `ki-21-sally.py`. Keep the Ki-21's constants and its `GearL/GearR` aft retraction, fixed tailwheel, dorsal `Turret1`. Note the Ki-21 has two engines (nacelle lofts) and a glazed nose.

- [ ] **Step 2: Rebuild the geometry on the Ki-84 pattern**

In this order, building and viewing after each group:
1. `kit.Model('ki-21-sally', skin=1024)`; `SEGMENTS`/`SUBDIVIDE` raised so the triangle count lands 25-60% of 100,000 (25,000-60,000).
2. Fuselage at high segment count with the fine airfoil station table; glazed nose and canopy through `m.canopy` with frames.
3. Wing panels broken at the gear station with `controls` (aileron, flap); root fillets; nacelle lofts with cowling lips; `Prop1/Prop2` as `blade_sections` twisted 3-blade props (3-fold symmetry preserved); exhaust stacks via `m.revolve`.
4. Fin and tailplane with `controls`; tailwheel with doors; gear legs with covers; pitot and antennas via `m.strut`; dorsal and other guns via `gun_barrel` on `Turret1`.
5. Markings: hinomaru discs with white border on the fuselage sides, upper and lower wings; tail markings only if cited; exhaust soot and walkway wear polygons; landing-light disc. Every disc placed per side with `m.marking('disc', ...)` and embedded at least `EMBED_M`.
6. Header lists CITED items with source and date read, and ESTIMATE items.

- [ ] **Step 3: Update the entry**

`"skin": true`, `"textures": {"maxSize": 1024, "format": "webp"}`; leave `keep` and budget unchanged.

- [ ] **Step 4: Build and run the gates**

```bash
cd ~/projects/ww2airsim-worktrees/dp1-aircraft
npx vitest run tests/tools/models/aircraftRigs.test.ts tests/tools/models/aircraftDimensions.test.ts --maxWorkers=1; echo rc=$?
```

Then build the entry the way the existing suites do (grep `tests/tools/models/blender` for the invocation, or run `npx tsx tools/models/build.ts ki-21-sally` if that is the repo's CLI; check `docs/models.md`). Rebuild twice and `sha256sum` both: identical. Record triangles, bytes, draws in the ledger; triangles must be 25-60% of budget.

- [ ] **Step 5: Look at it**

Screenshot in the Hangar locally on nexus's 680M (no `PW_REMOTE`; correctness only): three-quarter, side, top, front. Read the PNGs. If the airframe reads as a blob, tapered boxes, or the canopy frames are missing, fix before proceeding. Check the retracted gear inside the skin.

- [ ] **Step 6: Commit**

```bash
git add tools/models/blender/ki-21-sally.py tools/models/entries/ki-21-sally.json content/aircraft/ki-21-sally.glb tools/models/entries
git commit -m "DP1: Ki-21 Sally to the DP0 look"
```

(Adjust the glb path to the entry's `output` field.)

---

### Task 4: P-38 Lightning

**Files:**
- Modify: `tools/models/blender/p-38-lightning.py`, `tools/models/entries/p-38-lightning.json`, rebuilt glb; `tools/models/skin/surfaces.ts` only if needed
- Test: as Task 3

**Interfaces:**
- Consumes: Task 2 USAAF colors.
- Produces: nodes Prop1, Prop2, GearL, GearR, GearNose with pivots unchanged. Constants SPAN 15.85, LENGTH 11.53, WING_AREA 30.43, PROP_DIAMETER 3.51, BOOM_Z 0.16 of span unchanged.

- [ ] **Step 1: Rebuild on the Ki-84 pattern**

Central gondola with framed bubble canopy, two booms with turbochargers on top (the P-38's distinctive supercharger bulges: cite), fins and rudders with `controls`, tailplane with the overhang, wing panels with flaps and ailerons, fillets at boom and gondola roots, three-blade twisted counter-rotating props (3-fold), exhausts and gun ports in the nose (four .50 and one 20 mm: cite the P-38J/L nose armament), all three gear legs with doors and covers, pitot. Budget 60,000 tris: the 25-60% band is 15,000-36,000.
Markings: USAAF star-and-bar on the fuselage/gondola sides and wings in the cited style, anti-glare panel, prop hub. Bare metal (`naturalMetal`).

- [ ] **Step 2: Luminance check (Review Focus 1)**

Build, then run Hangar check 15 for this entry locally (`npx playwright test tests/e2e/hangar.spec.ts -g "luminance"` on nexus or via the Tier 2 setup in README). The ratio must be within 0.6x-1.5x. If below 0.6x because of metallic 1 with no environment, first check whether `surfaces.ts`'s `naturalMetal` row (roughness, albedo of the baked color) has a legitimate adjustment; record any change with a dated ruling and confirm Ki-84 and the ships' ratios are unaffected.

- [ ] **Step 3: Entry, gates, rebuild-twice, look, commit** as Task 3 Steps 3-6, commit message `DP1: P-38 Lightning to the DP0 look`.

---

### Task 5: B-29 Superfortress

**Files:**
- Modify: `tools/models/blender/b-29-superfortress.py`, `tools/models/entries/b-29-superfortress.json`, rebuilt glb
- Test: as Task 3

**Interfaces:**
- Produces: nodes Prop1-4, GearL, GearR, GearNose, Turret1-5 with pivots unchanged. Constants SPAN 43.05, LENGTH 30.18, WING_AREA 161.3, PROP_DIAMETER 5.055, 4 blades, ENGINES [0.1696, 0.3298], SWEEP 7, DIHEDRAL 4.5 unchanged.

- [ ] **Step 1: Rebuild on the Ki-84 pattern**

Greenhouse nose with a framed multi-pane glazing loft, the pressurized cabin fuselage, four nacelles with cowl flaps and turbo-supercharger intercooler details (cite the R-3350 installation), Fowler flaps and ailerons, tall fin and rudder, tailplane, four-blade twisted props (4-fold), tricycle gear with doors, five remote-controlled turrets (`Turret1..5`) built with `gun_turret`, tail gunner position, exhausts, pitot. Budget 100,000 tris: band 25,000-60,000.
Markings: cited star-and-bar positions; any unit tail marking must be cited or omitted. Bare metal.

- [ ] **Step 2: Luminance, entry, gates, rebuild-twice, look, commit** as Task 4 Steps 2-3, commit message `DP1: B-29 Superfortress to the DP0 look`.

---

### Task 6: Tests and allowlist

**Files:**
- Modify: `tests/tools/models/skins.test.ts`, `tests/e2e/hangar.spec.ts`

**Interfaces:**
- Consumes: Tasks 3-5 built and committed.

- [ ] **Step 1: Write the failing change**

In `skins.test.ts`, remove `'b-29-superfortress'`, `'ki-21-sally'`, `'p-38-lightning'` from `FLAT_SHADED` and set `CEILING = 9`.

```bash
npx vitest run tests/tools/models/skins.test.ts; echo rc=$?
```

Expected: rc=0 only if Tasks 3-5 set `"skin": true` on all three; it FAILs first if one entry was missed, which is the point.

- [ ] **Step 2: Hangar spec**

Add the three ids to the check 16 (UV checker) list at ~line 386 of `hangar.spec.ts`. Check 10's aircraft list (~line 286) should already include them; assert with grep.

- [ ] **Step 3: Commit**

```bash
git add tests/tools/models/skins.test.ts tests/e2e/hangar.spec.ts
git commit -m "DP1: three aircraft leave the flat-shaded allowlist (12 to 9)"
```

---

### Task 7: Tier 1 and Tier 2

**Files:** none modified unless a check fails.

- [ ] **Step 1: Blender and entry suites on nexus**

```bash
npx vitest run tests/tools/models/blender tests/tools/models/blenderEntries.test.ts tests/tools/models/aircraftRigs.test.ts tests/tools/models/aircraftDimensions.test.ts tests/tools/models/skins.test.ts --maxWorkers=1; echo rc=$?
```

Expected: rc=0.

- [ ] **Step 2: Full verify on ryzen**

```bash
remote-run npm run verify > /tmp/dp1-verify.log 2>&1; rc=$?; echo rc=$rc; tail -20 /tmp/dp1-verify.log
```

Known load-only failures from DP2: `boundary.test.ts` and `skyLoad.test.ts`. Re-run any failure alone on nexus before believing it; report, do not track (load timeouts are not open items).

- [ ] **Step 3: Hangar Tier 2 on the reference GPU**

Follow README "Tier 2: the GPU harness" (`PW_REMOTE` server, tunnel, run). Run `tests/e2e/hangar.spec.ts` at 1440p. Checks 10, 15 and 16 must pass for the three aircraft; record the check 15 ratios. If a budget check fails, re-run under `hwlock ryzen` before believing it.

- [ ] **Step 4: Sortie smoke**

Run the aircraft-facing e2e specs that load these models in flight (grep `tests/e2e` for `ki-21`, `b-29`, `p-38`) once and confirm they pass.

---

### Task 8: Captures, docs, handoff, email

**Files:**
- Create: `docs/handoff/2026-09-28-dp1-aircraft.md`, `docs/handoff/2026-09-28-dp1-shots/*.png`
- Modify: `docs/models.md` ("Skins (DP0, DP2)" section: the "12 entries on 2026-09-28" allowlist line becomes 9 with today's date; retitle to include DP1), `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` §15 row, `README.md` paragraph pointing at §15

- [ ] **Step 1: Captures**

For each aircraft, `<id>-three-quarter.png`, `<id>-side.png`, `<id>-front.png`, plus `<id>-three-quarter-checker.png`, and one in-flight frame if a harness helper exists. Include the Ki-84 as the reference. Read every PNG before writing about it.

- [ ] **Step 2: Handoff**

Copy the DP2 handoff's shape: what shipped, a table (bytes, triangles, % of tri budget, draws, check 15 ratio per aircraft, all read from the committed glbs on the date), Mark's checkpoint with relative links and the GitHub blob form (`https://github.com/Coder999/ww2airsim/blob/worktree-dp1-aircraft/docs/handoff/2026-09-28-dp1-shots/<file>`; his work network blocks marktuttle.dev), what the executor saw (including anything that reads wrong), sources per aircraft, Tier 1/2 results with rc, open items, and departures (the ledger's `Ruling:` lines). State that the branch is not merged and the Pennsylvania notes remain open in the DP2 handoff.

- [ ] **Step 3: Docs**

Update `docs/models.md`, the §15 row (status "DP1 complete <date>, on branch `worktree-dp1-aircraft` (not merged)"), and the README paragraph.

- [ ] **Step 4: Commit and push the branch**

```bash
git add docs README.md && git status --short
git commit -m "DP1: handoff, docs and captures"
git push -u origin worktree-dp1-aircraft
```

- [ ] **Step 5: Email Mark**

```bash
python3 tools/mail-doc.py docs/handoff/2026-09-28-dp1-aircraft.md "ww2airsim DP1 handoff: first-generation aircraft"
```

Exit 0 means sent. Never re-run with `--debug`.

- [ ] **Step 6: Housekeeping**

Stop only the dev server this session started. Do not merge, push `main`, or deploy.

---

## Self-Review

- **Spec coverage:** DP1 = Ki-21, B-29, P-38 to the DP0 look (Tasks 3-5); allowlist shrink and hangar checks (Task 6); reference-GPU Tier 2 and `verify` (Task 7); handoff, §15, README, models.md (Task 8); flat-luminance baselines (Task 1); cited markings and USAAF colors (Task 2). "The rest" of the first-generation list is not in scope: the three named aircraft only, per Mark.
- **Placeholders:** the build and screenshot commands defer to repo helpers named by grep because their exact CLI was not re-read in this plan; the executor resolves them in Task 3 Step 4 and records the exact invocation in the ledger for Tasks 4-5.
- **Consistency:** node names, budgets and constants match the current scripts and entries; `CEILING` 12 to 9 matches three removals.
