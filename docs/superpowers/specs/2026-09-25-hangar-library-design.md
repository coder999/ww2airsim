# The Hangar: object library and articulation test bench — design

Written 2026-09-25, from a brainstorm with Mark the same day. This is a
design only, with no code. The implementation plan comes after Mark approves
this spec. Plan numbering stays with master spec §15. This work takes a row
there, "Hangar", order "any", when its first sub-plan completes.

## 0. What Mark asked for, and what he chose

Mark wants a "hangar" or object display that shows every plane, ship and
structure that has hit points, both friendly and enemy. It serves two
purposes:

- **Testing, now.** Exercise landing-gear extension and retraction, propeller
  spin, flaps, and battleship turret traverse without flying anywhere. This
  part can be turned off at v1.0.
- **Gameplay, eventually.** A player-facing library of the game's objects,
  with each object's gameplay figures (hit points and so on) and a
  historical note on the real aircraft, ship or building.

It also becomes GAMEPLAY.md's "library" of objects. It comes with a written
procedure for finding and ingesting third-party models, which CLAUDE.md
points at.

Decisions Mark made in the brainstorm:

| Question | Chosen | Set aside |
| --- | --- | --- |
| Where it lives | A separate `hangar.html` page that reuses the game's render modules | A mode inside `main.ts`, and a parked-on-the-apron scenario |
| Sequencing against Lane B (A6M Zero) and Lane C (ship models) | **Build on Lane B's interfaces.** H1 starts now against today's builders, through a thin adapter. The articulation bench waits for Z1 | Defining a separate loader now, and waiting for Z1 and S1 before building anything |
| Turrets | **A generic part rig, with turrets as data.** A ship shows turret controls once its model entry splits turrets out. Until then the panel says "not modeled" | Splitting one battleship's turrets inside this work, and deferring turrets entirely |

## 1. What exists today (measured 2026-09-25 on `main` at `6df4a28`)

- **Aircraft.** `content/aircraft/` holds `f4f-wildcat.json`,
  `f6f-hellcat.json` and one model, `wildcat.glb`. The Wildcat model has
  separate propeller (`Helice`) and main-gear (`GRP_Rueda_Der`,
  `GRP_Rueda_Izq`) nodes and **no flap geometry** (`ASSETS.md`). Both specs
  render with the Wildcat model.
- **Ships.** `content/ships/` holds `essex-cv.json`, `fletcher-dd.json` and
  `type-b-maru.json`. Each one renders as procedural boxes from
  `createShipMesh(spec)` in `src/render/scene/ship.ts`. `hullHp` is on the
  spec. `role` is one of `carrier | cruiser | battleship | escort |
  merchant` (`src/sim/world/ships.ts`).
- **Buildings.** `content/bases/{tacloban,dulag}.json` list their `buildings`
  with `kind` (`hangar | tower | aaa`), footprint and `hp`. They are drawn by
  `drawBuilding` in `src/render/scene/buildings.ts`, which takes a
  `TerrainField` for ground height.
- **Points.** The per-target point table is `POINTS_BY_TARGET_TYPE` in
  `src/render/debrief.ts`. It is module-private today.
- **Rosters.** GAMEPLAY.md's aircraft, ship and building roster tables name 12
  aircraft, 9 ships and 7 candidate buildings, beyond the shipped ones.
- **In flight elsewhere, not merged:**
  - The A6M Zero spec (Lane B, worktree `a6m-zero-design`) defines
    `acquireModel` (§7.1), the `airframes.ts` registry and `view.model`
    (§7.2), `Airframe.update({gearFraction, flapFraction, throttle, …})`
    (§7.3), and the `tools/models/entries/*.json` build pipeline (§6).
  - The ship-models spec (Lane C, worktree `ship-models-design`) defines
    `content/ships/models.json`, keyed by ship spec id, with the procedural
    hulls as a loud fallback. It says nothing about turrets.

## 2. Architecture

```
hangar.html ──▶ src/render/hangar/main.ts
                 ├─ catalog.ts      sim content + content/library ─▶ CatalogEntry[]   (pure, Tier 1)
                 ├─ stats.ts        CatalogEntry ─▶ displayed figures                  (pure, Tier 1)
                 ├─ models.ts       CatalogEntry ─▶ HangarModel   (the one adapter; H1 today's builders, H2 Lane B/C registries)
                 ├─ stage.ts        renderer, turntable camera, lighting, grid, water plane
                 ├─ panel.ts        DOM: list, filters, info card
                 ├─ bench.ts        DOM: part controls, gizmos, counts (behind the bench flag)
                 └─ hooks.ts        window.__hangar for Tier 2
```

- **No `main.ts` edits.** The game's `src/render/main.ts` is the most
  contended file in the repo. The hangar never imports it and never changes
  it.
- **No terrain, sky, clouds or sim loop are loaded.** The hangar imports the
  shared lighting and exposure modules (`scene/lighting.ts`, `exposure.ts`),
  so a model is lit the way it is in the game at a fixed midday sun. It
  reuses `renderer.ts`'s `initRenderer` and `adapterGuard.ts`'s `judgeAdapter`, so
  a device without WebGPU gets the same failure screen as the game.
- **`src/sim/` is not touched.** The sim boundary rules stay as they are.
  Library content is a render-side concern, like Lane C's `models.json`.

## 3. Entry and gating

- `vite.config.ts` gains a second `build.rollupOptions.input`,
  `hangar.html`, beside `index.html`. `tests/build/dist.test.ts` asserts that
  `dist/hangar.html` exists, and that `dist/content/library/` exists and
  holds one file per library entry.
- The title screen (`src/render/titleScreen.ts`) gains a **"Library"**
  `inkButton` on its first form. It is a plain link to `hangar.html`. The
  hangar has a "Back to title" link.
- **The bench flag.** The bench panel (§6) shows when
  `import.meta.env.DEV || new URLSearchParams(location.search).has('bench')`.
  This one expression lives in `src/render/hangar/benchFlag.ts`. At v1.0,
  deleting the query clause hides the bench in production builds. A Tier 1
  test pins the expression's truth table so the switch is deliberate.
- The library part (list, turntable, info card) is always on, in development
  and in production.

## 4. Library content

### 4.1 Files and schema

There is one file per object, `content/library/<id>.json`. A zod schema,
`LibraryEntrySchema` in `src/render/hangar/library.ts`, validates each file
with `.strict()`:

```jsonc
{
  "id": "fletcher-dd",                  // unique; equals the file basename
  "name": "Fletcher-class destroyer",   // display name; for a shipped spec, a test asserts it equals the spec's name
  "kind": "ship",                       // "aircraft" | "ship" | "building"
  "side": "allied",                     // "allied" | "japanese"
  "spec": "fletcher-dd",                // sim spec id; omitted = "not yet in service" (§4.3)
  "blurb": "…",                         // 1–2 sentences, what it is in this game
  "history": "…",                       // 1–3 short paragraphs, the real thing
  "sources": [                          // at least one; every history claim traces to one
    { "title": "Fletcher-class destroyer", "url": "https://en.wikipedia.org/wiki/Fletcher-class_destroyer", "read": "2026-09-25" }
  ]
}
```

- **`side` lives here, not in the sim.** The sim has no team field today, and
  Lane A owns adding one. When Lane A's field lands, a follow-up test asserts
  the two agree. Until then this file is the only statement of side.
- **Building entries are per `kind`, not per placed building.** There are
  three today: `hangar`, `tower` and `aaa`. `spec` is the `kind`. The
  catalog collects every placed building of that kind across
  `content/bases/*.json` for the stats (§5).

### 4.2 Numbers are never written into library files

Every figure on the info card is read from sim content at load: hit points,
speed, dimensions, armament and points. A library file carries prose only.
**A Tier 1 test rejects any digit sequence followed by a unit in `blurb`**:
`hp`, `HP`, `m/s`, `kn`, `knots`, `mph`, `km/h`, `m` or `ft` with a
preceding number. The history field may contain historical figures (for
example "commissioned 1942" or "18 inches"), because those are facts about
the real ship, not about the game. This is the "point, don't copy" rule
applied to content, so a gameplay rebalance can never leave the library
wrong.

### 4.3 Roster items with no spec yet

A GAMEPLAY.md roster row with no sim spec (Yamato, Ki-84, fuel tank farm and
so on) gets a library file with no `spec` field. It shows as a **"Not yet in
service"** card: name, side, history and sources, with no model and no
figures. The player-facing library therefore already covers the whole roster,
and each card fills in as its spec and model land.

### 4.4 Coverage is asserted, not promised

`tests/render/hangar/library.test.ts`:

1. Every file parses, and its `id` equals its basename.
2. Every `spec` resolves: an aircraft id in `content/aircraft/`, a ship id in
   `content/ships/`, or a building kind present in at least one
   `content/bases/*.json`.
3. **Every sim spec has exactly one library entry**, meaning every aircraft
   and ship JSON and every building kind in use. Adding
   `content/ships/yamato-bb.json` without a library entry fails the suite.
4. **Every row of GAMEPLAY.md's aircraft, ship and building roster tables has
   a library entry.** Aircraft and ship rows, and the candidate-building
   table, match by name. The shipped-building table matches on its `Kind`
   column, because its rows ("Large hangar", "Maintenance shed") are
   placements of one kind. The test parses those markdown tables. That turns the roster from a list of intentions into a checked
   index. A roster row renamed in GAMEPLAY.md fails until its library file
   follows.
5. No `blurb` carries a gameplay number (§4.2).

### 4.5 Writing the history

- Every `history` paragraph is written from, and cites, a source read on the
  date recorded: English Wikipedia, Naval History and Heritage Command
  (history.navy.mil), or a museum page. The rule is the same as the sim
  content's `reference.source`.
- Two roster rows already carry caveats in GAMEPLAY.md ("confirm against a
  primary source"). Their history text states that the in-game type is a
  stand-in where it is one, for example the F6F spec drawn with the Wildcat
  model, the F4F spec flying borrowed F6F numbers, and the Essex rendered from a Yorktown-class model (Lane C §13
  item 1). **A stand-in is always disclosed on the card, never hidden.**
- US spelling throughout (CLAUDE.md).

## 5. Displayed figures (`stats.ts`)

This is a pure function from a catalog entry to `{ label, value, unit,
note? }[]`, tested in Node against the committed content:

| Kind | Figures | From |
| --- | --- | --- |
| Aircraft | Structure HP, subsystem HP, top speed, stall speed, g limit, guns and rounds, stores, points when shot down | aircraft JSON `damage` / `aircraft` / `limits` / weapons blocks; points from the target-type table |
| Ship | Hull HP, length, beam, top speed (kn and m/s), points when sunk | ship JSON; points by role |
| Building | HP (a range across placements, if they differ), where it stands (for example "Tacloban ×3, Dulag ×1"), points when destroyed | `content/bases/*.json`; points from the target type |

- **Points** come from `debrief.ts`'s table. H1 exports a lookup from it,
  `pointsForTargetType(t)`, and the target-type mapping it already uses. It
  does not create a second copy. A test asserts that the hangar and the
  debrief agree for every target type.
- A figure whose content `reference.source` marks it `PLACEHOLDER` or
  `ESTIMATE` carries a `note`. The Wildcat's placeholder flight numbers show
  a "borrowed from the F6F" marker on the card instead of passing as F4F
  data. The test fixture is `f4f-wildcat.json`'s own PLACEHOLDER text.

## 6. The viewer (`stage.ts`)

- A turntable orbit camera: OrbitControls from `three/examples`, the same
  three.js the game ships. It auto-rotates slowly until the user drags, and
  frames the model from its bounding box.
- **Scale:** a meter grid on the ground plane with 10 m major lines, and the
  model's overall dimensions read from the loaded bounding box, next to the
  spec's stated dimensions. A model fitted at the wrong scale is visible at
  a glance.
- **Ships** stand on a flat water-colored plane at the waterline (y = 0,
  Lane C §4.2's origin). **Buildings** stand on a flat concrete pad and are
  drawn by `drawBuilding` against a flat `TerrainField` stub (height 0
  everywhere), the same function the airfield uses.
- Lighting: the shared `createLighting` / `applySun` at the default
  `SUN_DIRECTION`, and `exposureFor` at that elevation. The game's quality
  tier selection applies unchanged.

## 7. The model adapter (`models.ts`)

This is the only module that knows where geometry comes from:

```ts
export interface HangarModel {
  readonly root: Object3D
  readonly parts: readonly PartSpec[]      // what the bench can drive (§8); [] = nothing articulated
  pose(p: PartPose): void                  // gear/flap fractions, throttle, turret angles, stores
  update(frameS: number): void             // prop spin
  counts(): { triangles: number; drawCalls: number; budget?: { maxTriangles: number; maxDrawCalls: number } }
  dispose(): void
}
export function loadHangarModel(entry: CatalogEntry): Promise<HangarModel | null>  // null = not yet in service
```

- **H1:**
  - Aircraft load through today's `wildcat.ts` builder, the path every spec
    uses now. `parts` = `prop`, `gear`. The Wildcat's missing flaps show as
    a declared-absent part (§8).
  - Ships use `createShipMesh(spec)`, with `parts` = `[]`.
  - Buildings use `drawBuilding`, with `parts` = `[]`.
- **H2 (after Lane B's Z1 merges):**
  - Aircraft switch to `airframeFor(spec.view.model)` from `airframes.ts`,
    and `pose` / `update` map one-to-one onto `Airframe.update` and
    `setStores`.
  - Ships switch to Lane C's `shipModels` loader, with its procedural
    fallback, when S1 merges.
  - `models.ts` is the only file that changes. Nothing else in the hangar
    knows.
- **The request to Lane B:** an additive `readonly parts: readonly PartId[]`
  on `Airframe`, listing the parts the model actually has. The Zero's §7.3
  table already records which parts are separate and which are fused, so
  this exposes information the spec already holds. If Lane B declines, the
  hangar keeps a static per-model part table in `models.ts`, which is worse
  because it can drift. **Open for Mark, item 1.**

## 8. The bench (`bench.ts`), behind the flag in §3

`PartSpec` is `{ id, label, kind: 'fraction' | 'angle' | 'rate', range,
modeled: boolean }`. One control is rendered per part:

| Part | Control | Drives |
| --- | --- | --- |
| Landing gear | Slider 0–1, and a **Cycle** button that runs the full transit over the spec's own `gear.travelSeconds` (7 s for the F4F) | `gearFraction` |
| Flaps | Slider 0–1, and Cycle | `flapFraction` |
| Propeller | Throttle slider 0–1 | `throttle`; the prop angle advances each frame through Lane B's `propAngle` |
| Stores | Bombs and rockets toggles | `setStores` |
| Turret *n* | Traverse slider (°), elevation slider (°) | `setTurret(n, yaw, elev)` (§9) |

- A part with `modeled: false` shows its row greyed out, reading **"not
  modeled"**, for example the Wildcat's flaps. The bench reports missing
  geometry instead of hiding it.
- **Debug toggles:**
  - pivot gizmos: an axes helper at every articulated node's origin, so a
    wrong pivot shows as a gizmo in the wrong place
  - wireframe
  - freeze the turntable
- A counts readout: triangles and draw calls against the model's manifest
  `budget`, when the model has one (Lane B §6.1). It turns red when over
  budget.

## 9. The turret convention (proposed to Lane C)

- A ship model entry in Lane B's pipeline (`tools/models/entries/<ship>.json`)
  names turrets as `keep` or `split` nodes, `Turret1`…`TurretN`, numbered
  bow to stern:
  - each pivots on its ring center, on the ship's +Y (traverse)
  - optional `Gun1`…`GunN` children pivot on their trunnion, on the turret's
    local +Z (elevation)
- The ship view gains `setTurret(n, yawRad, elevRad)`, plus a
  `turrets: number` count that becomes the bench's `parts`.
- **Limits are data.** Each ship spec may carry an optional render-side
  `turretArcs` in `content/ships/models.json` (Lane C's manifest). If it is
  absent, traverse is ±180° and elevation is 0–45°. The sim does not model
  turret arcs, so this is presentation only.
- Nothing in H1 or H2 requires a turret to exist. H3 (§12) delivers the
  first one.

## 10. Test hooks and acceptance (Mark stays out of the loop)

`window.__hangar` (`hooks.ts`), present in every build, the same policy as
the game's `__ww2`:

```ts
{ ready: Promise<void>, entries(): string[], select(id): Promise<void>,
  pose(p: PartPose): void, camera(preset: 'side' | 'front' | 'top' | 'three-quarter'): void,
  freeze(): void, validationErrors: string[] }
```

**Tier 1 (Node):**

- the library coverage tests (§4.4)
- `stats.ts` against the committed content, including the PLACEHOLDER note
- the points agreement with `debrief.ts`
- the bench-flag truth table
- `PartSpec` derivation from a stub model

**Tier 2 (desktop GPU, `tests/e2e/hangar.spec.ts`)**, using the pixel-mask
method from Lane B §7.4. Each check below renders against an empty frame
with the camera frozen:

1. For every catalog entry with a spec, `select` resolves, the model's pixel
   mask is non-empty and covers between 2% and 80% of the frame, and
   `validationErrors` is empty.
2. For every aircraft with a modeled gear part, the gear-down and gear-up
   masks from the `front` preset differ by at least 1% of the model's mask
   area.
3. For every modeled propeller, two throttle-driven frames 1/60 s apart from
   the `front` preset have different masks.
4. From H3, for every turret, the masks at yaw 0° and yaw 90° from the
   `top` preset differ.
5. The luminance check from Lane B §10: every aircraft's mean in-mask
   luminance falls within [0.5×, 1.5×] of the Wildcat's in the same
   lighting.

The hangar then becomes the visual acceptance harness for any new model.
Lanes B and C, and every later model, get "renders, articulates and is lit
sanely" for free by adding a library entry.

## 11. Documentation

- **GAMEPLAY.md** gains a "Library" section. It describes the player-facing
  feature (what a card shows, and "Not yet in service"), states that the
  roster tables are checked against `content/library/` by a test (§4.4), and
  points at this spec. The roster tables themselves stay in GAMEPLAY.md
  because they own name and role.
- **`docs/models.md`, new: the one runbook for ingesting a third-party
  model.** It is written in H2, when the pipeline commands it names actually
  exist:
  1. *Find.* Sketchfab search with the downloadable and CC-BY / CC0 filters,
     a check of the author's other uploads for license laundering, and the
     rejected-list convention (Lane C §2.3).
  2. *Fetch.* `tools/models/sketchfab-fetch.sh <uid> <name>` into
     `content/models/candidates/`.
  3. *Vet.* An `ASSETS.md` row before anything is committed.
  4. *Inspect.* `npm run models:inspect`.
  5. *Entry.* `tools/models/entries/<id>.json`, including `keep` and `split`
     for articulated parts and the turret names from §9.
  6. *Build.* `npm run models:build -- <id>`.
  7. *Register.* `view.model` for aircraft, `content/ships/models.json` for
     ships.
  8. *Library entry.* §4.
  9. *Check.* `hangar.html?bench=1` for a look, and the Tier 2 hangar spec
     for the assertion.

  The runbook links to Lane B's spec and `tools/models/manifest.ts` for the
  entry fields rather than restating them.
- **CLAUDE.md**'s "Fetching third-party models" gains one line pointing at
  `docs/models.md`. Nothing else there changes.
- Each sub-plan ends with a dated `docs/handoff/` document, its §15 row, and
  a README paragraph that points at §15 (CLAUDE.md conventions).

## 12. Sub-plans

Each one runs in its own worktree, ends with `npm run verify` at `rc=0`
(captured directly), and ends with a handoff.

### H1: library, catalog, viewer (about 10 tasks; can start now)

1. The `LibraryEntrySchema`, the loader, and the coverage tests (§4.4), red
   at first.
2. Library files for every shipped spec: 2 aircraft, 3 ships, 3 building
   kinds.
3. Library files for every remaining roster row ("Not yet in service"). §4.4
   turns green.
4. Export `pointsForTargetType` from `debrief.ts`, and `stats.ts` with its
   tests.
5. `catalog.ts`.
6. `hangar.html`, the Vite input, and `dist.test.ts`.
7. `stage.ts`: renderer, lighting, turntable, grid, water and pad.
8. `models.ts` against today's builders, and a minimal `bench.ts` driving the
   Wildcat's gear and prop, which already exist.
9. `panel.ts` (list, filters, info card), the title-screen button, and the
   bench flag.
10. `hooks.ts`, Tier 2 checks 1–3 and 5, the GAMEPLAY.md "Library" section,
    and the handoff.

### H2: Lane B registries and the full bench (about 6 tasks; after Z1 merges)

1. `models.ts` switched to `airframes.ts` / `acquireModel`, with
   `Airframe.parts` (or the fallback table, per Open item 1).
2. Flap and stores controls, and Cycle.
3. Pivot gizmos, wireframe, and counts against the budget.
4. Ships through Lane C's loader, if S1 has merged. Otherwise this task moves
   to H3.
5. `docs/models.md` and the CLAUDE.md pointer.
6. Handoff.

### H3: turrets (about 5 tasks; after Lane C's S1 and one turret-split entry)

1. The turret convention in the ship view (`setTurret`, `turrets`).
2. `turretArcs` in the Lane C manifest schema.
3. A turret-split entry for one battleship or cruiser model.
   - A candidate battleship needs a license-vetted download first (Open item
     2).
   - A cruiser with visible turrets, such as the `cleveland-cl` or
     `mogami-ca` candidates already in `content/models/candidates/`, is the
     fallback.
4. Bench turret rows, and Tier 2 check 4.
5. Handoff.

## 13. File ownership and coordination

| Area | Owner | Notes |
| --- | --- | --- |
| `src/render/hangar/**`, `hangar.html`, `content/library/**`, `tests/render/hangar/**`, `tests/e2e/hangar.spec.ts`, `docs/models.md` | **this work** | |
| `src/render/titleScreen.ts` | shared | One button added. Re-diff against `HEAD` before the commit |
| `vite.config.ts`, `tests/build/dist.test.ts` | shared | One `input` entry and two assertions. Lane B also edits `copyContent` (§6.4 there), and any conflict is textual |
| `src/render/debrief.ts` | shared | Export only. No behavior change |
| `tools/models/**`, `src/render/models/**`, `airframes.ts`, `Airframe` | **Lane B** | This work requests `Airframe.parts` (Open item 1) and edits none of it |
| `content/ships/models.json` schema, ship render modules | **Lane C** | This work proposes the turret convention (§9). H3 adds `turretArcs` after S1 merges, with Lane C's agreement |
| `src/sim/**` | not touched | |
| GAMEPLAY.md, CLAUDE.md | shared docs | One section and one line |

**Tier 2 timing.** The hangar's GPU runs take the `ww2airsim-3` dev slot
(port 5174), so they never skew the photoreal session's or Lane B's timings
on the primary host. This work's checks are pass/fail on pixel masks, not
performance budgets, so they are insensitive to contention anyway.

## 14. Risks

- **Lane B's interfaces change before Z1 merges.** H1 depends on none of
  them. H2 is written against whatever Z1 actually ships, and this spec's §7
  is the adapter, not a contract.
- **Historical text errors.** Mitigated by required sources with read dates,
  and by the stand-in disclosure (§4.5). A factual correction is a one-file
  content change.
- **The roster-parsing test is brittle to table formatting.** It parses only
  the first column of three named tables. A format change fails loudly,
  which is the intent.
- **The bench gets ahead of the models.** Most parts will read "not modeled"
  for a while, and that is accurate. The bench's value grows as Lanes B and
  C land.

## Open for Mark

1. **`Airframe.parts`.** *Recommendation:* ask Lane B to add it as a one-line
   additive field in Z1. The fallback is a static part table in the hangar,
   which can drift from the model.
2. **A battleship model for H3.** No battleship candidate has been
   downloaded or license-checked. *Recommendation:* H3 starts with the
   Cleveland or Mogami candidate (turreted, already downloaded), and a
   Yamato or Pennsylvania search happens under Lane C's S2.
3. **The Library button in production before v1.0.** *Recommendation:* yes.
   The library part is harmless, and the bench stays behind `?bench=1`.
