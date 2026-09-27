# The model roster: every Library object as a real model

Design, 2026-09-26. Approved in conversation by Mark the same day. This
document is for his review before any plan is written. Plan numbering stays
with the master spec's §15. This work adds one row there, "Model roster
(R0-R5)", when R0 is planned.

**Renamed 2026-09-26:** these plans were M0–M5 when this design was approved. They are R0–R5, because the missions track already has an M1 (the mission engine). R0's plan and handoff keep their M0 file names.

## 1. Goal

Every entry in `content/library/`, and the two vehicles this design adds,
shows a real 3D model in the Hangar (`hangar.html`), whether or not the
object is in the game yet (Mark, 2026-09-26: "Even if not in game yet, can
look at them as objects in the hangar/library").

**Done is an assertion, not a sentence.** A Tier 1 test asserts that no
Library entry resolves to "not yet in service". It carries an allowlist of
the entries still waiting, and each plan shrinks it. R5 deletes it.

Out of scope:
- putting any new object into a scenario;
- flight models for the aircraft that lack one;
- changing what the player's airplane looks like in the game (§6, item 2);
- turrets that turn (H3, still its own plan).

## 2. What exists (verified 2026-09-26 by reading the repo)

| Family | Library entries | Real model today | Missing |
| --- | --- | --- | --- |
| Aircraft | 12 | Wildcat (`content/aircraft/wildcat.glb`) | 11 |
| Ships | 10 | Essex, Fletcher, Type B maru (S1) | 7 |
| Buildings | 10 | none. Tacloban's and Dulag's hangar, tower and AAA are procedural boxes in `src/render/scene/airfield.ts` | 10 |
| Vehicles | 0 (GAMEPLAY.md lists 2) | none | 2 |

That is **30 models**.

- **The Hangar reaches a model only through a sim spec.** `src/render/hangar/catalog.ts` returns
  `null` ("not yet in service") for an entry with no `spec`, and
  `models.ts` loads the aircraft model from `spec.view.model`. An object with
  no sim content therefore cannot be shown today (§4).
- **The model pipeline is being extended now by O1.** The
  `worktree-o1-ordnance` branch had completed Tasks 1-3 of 10 on 2026-09-26.
  It adds a `generated` source kind to `tools/models/manifest.ts`, dispatches
  it in `tools/models/build.ts`, and in its Task 8 adds an `ordnance`
  category to `src/render/hangar/library.ts`. Those are the files this
  design also changes, so it is sequenced around O1 (§5).
- **Headless Blender works on nexus.** Blender 5.0.1 is at
  `/usr/bin/blender`. A `-b --factory-startup` script exported a glb, and two
  runs gave the same SHA-256 (probe, 2026-09-26). Byte stability for a real
  model with modifiers and UVs is still a claim for R0 to prove.
  Whether ryzen has Blender is unchecked.

## 3. Sources

Mark's rule (2026-09-26): **where no cleanly licensed model exists, author an
original one in Blender.** Stand-ins are not used to fill a gap.

A Sketchfab pick still goes through `docs/models.md` in full. That means
fetch, then vet the license from the API and the uploader's history, then
add an `ASSETS.md` row before commit. A pick already vetted in `ASSETS.md`'s
candidate table, or in the ship-models design's §2.2, is not re-searched.
Its license is re-read at build time.

A Blender model is original work, AGPL-3.0-or-later. Its script cites the
dimensions it is built from, with a read date, and labels every estimate in
its header, following `tools/models/generated/an-m65.ts` on the O1 branch.

| Object | Plan | Source |
| --- | --- | --- |
| Cleveland-class CL | R2 | Sketchfab `cleveland-cl.glb` (KTKloss), staged |
| Mogami-class CA | R2 | Sketchfab `mogami-ca.glb` (KTKloss), staged |
| Yamato-class BB | R2 | Sketchfab `musashi-bb.glb` (KTKloss), staged |
| Pennsylvania-class BB | R2 | **Blender**. Ship-models §2.2's USS Nevada has two triple and two twin turrets, where Pennsylvania has four triples, so it is a stand-in |
| Shiratsuyu-class DD | R2 | Sketchfab `shiratsuyu-dd-samidare.glb` (everlasting17th), staged; about 30% simplify, waterline to measure |
| Kagero-class DD | R2 | **Blender** (§6, item 1) |
| Casablanca-class CVE | R2 | **Blender**, replacing ship-models §2.2's Independence stand-in |
| A6M Zero | R3 | Sketchfab `a6m2-zeke.glb` (SavinienBerault), Z3's pick, per the A6M Zero design |
| F6F Hellcat | R3 | Sketchfab `f6f.glb` (manilov.ap), staged |
| F4U Corsair | R3 | Sketchfab `f4u.glb` (manilov.ap), staged |
| P-38 Lightning | R3 | Sketchfab `p38-lightning.glb` (manilov.ap), staged. **2026-09-27: became a Blender fallback** in R3: fitted to the P-38L's cited 15.85 m span the download is 12.13 m long, +5.2% over the cited 11.53 m and past R3's 4% tolerance ([R3 handoff](../../handoff/2026-09-27-r3-aircraft-models.md)) |
| Ki-43 Oscar | R3 | Sketchfab `ki43.glb` (manilov.ap), staged |
| D3A Val | R3 | Sketchfab `aichi_d3a_val.glb` (helijah), staged; 293k faces, decimate |
| G4M Betty | R3 | Sketchfab `mitsubishi_g4m.glb` (Jec), staged |
| B-17 Flying Fortress | R3 | Sketchfab `boeing_b-17_flying_fortress.glb` (helijah), staged; 763k faces, heavy decimate |
| Ki-84 Frank | R3 | **Blender**, no candidate exists |
| Ki-21 Sally | R3 | **Blender**, no candidate exists |
| B-29 Superfortress | R3 | **Blender**. The only candidate is flagged suspect in `ASSETS.md` |
| All 10 buildings | R4 | **Blender** |
| Type 97 Chi-Ha | R5 | Sketchfab `type97-chi-ha.glb` (snrnsrk5), staged |
| Willys MB jeep | R5 | Sketchfab `willys-mb-jeep.glb` (MattyNL), staged |

If a staged pick fails its build (budget, or a waterline or bow it cannot
prove), the fallback is Blender, not another stand-in. The plan records that
as a ruling.

## 4. Design

### 4.1 The `blender` source kind (R1)

It sits beside O1's `generated` kind, in the same discriminated union in
`tools/models/manifest.ts`:

```json
"source": {
  "kind": "blender",
  "script": "tools/models/blender/<id>.py",
  "dimensions": "<cited source, read date; estimates are labeled in the script>",
  "license": "AGPL-3.0-or-later"
}
```

- **Build.** `tools/models/build.ts` runs
  `blender -b --factory-startup -P <script> -- <out>` into
  `tools/models/cache/<id>.glb`. That raw glb then enters the stages every
  Sketchfab input goes through: normalize, keep/split, textures, the ship fit
  for a ship, and budget. Nothing downstream can tell the two sources apart.
- **Blender version.** The build checks the version (`5.0.1`) before running, and
  fails with the version it found. A different Blender is a different
  exporter and would break byte-identity silently.
- **Serial runs.** Blender runs are serial. Parallel heavy jobs have
  OOM-killed nexus twice.
- **Output folders.** Two new output folders, `content/buildings/` and
  `content/vehicles/`, are added to the `output` regex. O1's rule that
  `content/ordnance/` is generated-only is kept.

### 4.2 The Blender kit (R0)

`tools/models/blender/kit.py` is imported by each model script. A model
script is then mostly the cited numbers.

| Part | Built from | Used by |
| --- | --- | --- |
| Lofted fuselage or nacelle | station positions and cross-section ellipses or superellipses | aircraft |
| Tapered wing and tail surfaces | span, root and tip chord, sweep, dihedral, a thickness ratio | aircraft |
| Propeller | blade count, diameter, a spinner | aircraft, as its own named node |
| Hull | waterline length, beam, draft, and section and sheer tables | ships |
| Barrel roof, gable roof, box structure | footprint and height | buildings |
| Tank, sandbag ring, gun barrel, lattice mast | a few dimensions each | buildings |
| Flat materials in named palette roles | role names | everything |

Rules the kit enforces:
- It uses no randomness. Anything that must vary takes a fixed seed argument.
- Objects are named in a fixed order and modifiers are applied before export, so the glb's node order is stable.
- Names follow the existing conventions: the propeller and gear leg names the
  bench already drives (`docs/models.md` §4-5), and `Turret1`…`TurretN` bow
  to stern.
- **Scale and axes.** Units are meters, +x forward. Each model stands on y = 0, or is
  waterline-origin for a ship, so an entry's `normalize` is the identity.

R0 proves the kit on one model, the barrel-roof hangar. It is the simplest
object and the one with the most placements. R0 writes its output only to the
gitignored `candidates/` folder, so it touches none of O1's files.

### 4.3 The display-only Library path (R1)

- **The `model` field.** `content/library/<id>.json` gains an optional
  `model`: `{ "kind": "aircraft" | "ship" | "building" | "vehicle", "id": "<model id>" }`.
- **What the Hangar draws.** It draws `entry.model` when present, and otherwise the
  spec's `view.model`, as today.
  - An entry with a `model` and no `spec` shows the turntable, the bench's
    articulation, the credits and the budget line.
  - Its figures card is empty, and the list labels it "not in the game yet", not "not yet in
    service".
- **Registries.** Aircraft models register in `AIRFRAME_MODELS` and ship models in
  `SHIP_MODELS`, spec or not. Buildings and vehicles share one generic static-model
  loader.
- **Vehicles.** `vehicle` joins `LIBRARY_KINDS`. Two new Library entries (`type97-chi-ha`,
  `willys-mb-jeep`) are checked against GAMEPLAY.md's vehicle roster by the
  existing roster test.
- **Tier 1 checks.** Every `model` id resolves to a registered model with a manifest
  entry. A model id that exists nowhere fails Tier 1, the same as a bad
  `view.model` does today.
- **In-game rendering is unchanged.** No scenario's `view.model` changes in this work, except the
  Zero's `a6m2-zero.json` in R3, which Z3 already planned. The Zero is in
  no shipped scenario.

### 4.4 Budgets

Each plan sets budgets in its entries, starting from the measured ones on
`main` (2026-09-26):

| Existing entry | Bytes | Triangles | Draw calls |
| --- | --- | --- | --- |
| Wildcat | 5.6 MB | 101,000 | 47 |
| Essex | 1.5 MB | 60,000 | 8 |
| Fletcher | 3.0 MB | 45,000 | 12 |
| Type B maru | 4.0 MB | 45,000 | 4 |

Starting points for new entries:

| Family | Bytes | Triangles | Draw calls |
| --- | --- | --- | --- |
| Fighters | 3 MB | 60k | — |
| Bombers | 5 MB | 100k | — |
| Ships | 3 MB | 45k | — |
| Buildings | 0.5 MB | 5k | 4 |
| Vehicles | 1 MB | 20k | — |

A plan may raise a budget only with a measured reason, recorded in its ledger.

## 5. The plans and their order

One plan, one worktree and one executor at a time. The plans all append to the same
registries (`airframes.ts`, `shipModels.ts`, `content/library/`,
`ASSETS.md`, `tests/build/dist.test.ts`), so running them in parallel would
guarantee conflicts. Each rebases on `main` before it starts.

| Plan | Starts | Scope | Touches O1's files |
| --- | --- | --- | --- |
| **R0** Blender kit | now | `tools/models/blender/kit.py`, the hangar proof model, the byte-stability test | no |
| **R1** Pipeline and Library | after O1 merges to `main` | `blender` kind, new output folders, the Library `model` field, the `vehicle` kind, the generic loader, the done-allowlist test | yes, so it waits |
| **R2** Ships | after R1 | the 7 ships, with S2's content specs for each (`content/ships/<id>.json`, sourced dimensions, labeled estimates) | no |
| **R3** Aircraft | after R2 | the 11 aircraft, the Zero first (it is Z3) | no |
| **R4** Buildings | after R3 | the 10 buildings | no |
| **R5** Vehicles | after R4 | Chi-Ha, jeep; deletes the allowlist | no |

S2 and Z3 in master spec §15 are carried out as R2 and R3. Their rows point
here when R2 and R3 are planned. H3 (turrets) stays its own plan. Every turret this
work produces is named for it.

**Viewing checkpoints (Mark, 2026-09-26):** per family, unattended. Each
plan runs to completion without stopping, and its handoff carries Hangar
captures of every new model, taken on the reference GPU with the turntable
frozen. The handoff is emailed to Mark as HTML. Every plan header records
this.

## 6. Decisions (Mark, 2026-09-26, all as recommended)

1. **Kagero is authored in Blender.** The Samidare is a Shiratsuyu, and it
   ships as the Shiratsuyu. Ship-models §2.2 had it standing in for both.
2. **The Hellcat is shown in the Hangar only.** The player's airplane flies
   Hellcat numbers and is drawn as a Wildcat. Changing that moves the gear
   height, the store mounts and the cockpit eye point, which is its own plan.
3. **The airfields keep their procedural boxes in game.** R4's buildings are
   Library models. Swapping them into `airfield.ts` is a later decision.

## 7. Testing

- **Tier 1, pipeline.**
  - The `blender` kind is schema-valid.
  - Sketchfab and generated entries still build byte-identically, reusing O1's pinned fixture.
  - Each Blender entry rebuilds byte-identically. That test is a named skip
    where Blender is absent, so it cannot pass vacuously on ryzen. If ryzen
    lacks Blender, `.remote-run-data` cannot fix that, and the test is run on
    nexus by name.
- **Tier 1, content.**
  - A Blender output's measured dimensions fall within tolerance of its script's cited
    figures: span and length for aircraft, length, beam and draft for ships,
    footprint for buildings.
  - Every output is within budget.
  - Every `model` id resolves.
  - The allowlist shrinks and never grows.
- **Tier 2.** `tests/e2e/hangar.spec.ts` picks up every new entry: it
  renders, it is lit, its parts move, and it is inside its budget as drawn.
  It runs on the reference GPU at the end of each plan.
- **`npm run verify` through `remote-run`** ends every plan.

## 8. Risks

- **O1 slips or changes its `generated` kind.** R1 copies whatever shape
  merges. R0 does not depend on it.
- **Blender output drifts between runs** once real models use modifiers and
  UVs. R0's first job is to measure this. If it drifts, the fallback is to
  pin the export options and strip non-deterministic extras in a stage, and
  as a last resort to commit the raw glb and test its dimensions instead.
- **Heavy decimation (the B-17 at 763k, the Val at 293k) can wreck a silhouette.**
  The build checks the budget, and the handoff captures are the eye check.
- **Blender aircraft will read as simpler than the CAD downloads.** That is
  accepted, because Mark chose original over stand-ins. Each script's header states what it
  leaves out.
- **Library growth** makes `hangar.html`'s list longer. The list is
  already grouped by kind, so nothing new is needed.
