# Authoring an aircraft in Blender

The process for building an airframe model as a Blender script that fits this game's flight model, rig and Hangar,
whether it replaces a download or models a new type. It was worked out on the B-29, Ki-84 and TBM-3, then repeated
on Blender duplicates of downloaded fighters (2026-10-11): `f6f-hellcat-blender`, `f4u-corsair-blender`,
`f4f-wildcat-blender` and the drawing-measured `a6m2-zero-blender`. They are the worked examples. This page points at the files that own each fact;
it does not restate them. Onboarding an airframe as *flyable* (spec, card, flight fit) is
[`aircraft.md`](aircraft.md); getting a model into the pipeline is [`models.md`](models.md), "Authoring in Blender".

## What the model has to carry

Everything the download it may replace has, because the game draws a flyable aircraft through
`src/render/scene/airframeRigs.ts` and nothing else:

| Feature | Where it comes from | Checked by |
| --- | --- | --- |
| Moving landing gear | named nodes `GearL`, `GearR` (`GearNose`, `Tailwheel`), each with a baked hinge; a `gear` rig row says which way each folds | `aircraftRigs.test.ts`, Hangar checks 2, 7, 13 |
| Working propeller | node `Prop` (`Prop1..N`), exactly N-fold symmetric; `props` rig row | `aircraftRigs.test.ts`, Hangar check 13 |
| Control surfaces | `AileronL/R`, `Flap<n>L/R`, `ElevatorL/R`, `Rudder`, named in the script's `controls` | `aircraftRigs.test.ts` (hinge on the leading edge, correct sense) |
| Gun and bay parts (where the type has them) | `Turret<N>`, `Turret<N>Guns`, `BayDoor<n>L/R` | `aircraftRigs.test.ts`, `gunnerMounts.test.ts`, `internalBay.test.ts` |
| Bomb and rocket attachment | **not geometry.** The spec's `stores` racks and rails hang on the drawn wing at offsets `npm run models:mounts` measures; the model supplies a wing and nothing else (no rack or launcher is drawn on any model, O1) | `wildcatMounts.test.ts`; for a duplicate, `blenderDuplicates.test.ts` |
| The spec's stance, eye and guns | fitted to the numbers in `content/aircraft/<spec>.json` | `stance.test.ts`, `eyePoints.test.ts`, `combatFit.test.ts`, `centerPoint.test.ts`; for a duplicate, `blenderDuplicates.test.ts` |

## The steps

1. **Source the figures, and label every one.** Span, length, wing area, airfoil, propeller blades and diameter,
   gun count: read a source (English Wikipedia's Specifications, or the primary one the spec already cites) and put the
   read date in the script header. Each figure is **CITED** with its source or **ESTIMATE**; the header is
   the audit trail (`f6f-hellcat-blender.py` is the model). A figure no source gives is an estimate, never silently
   a guess. Where a download is being duplicated, take the stance from the spec (step 3), not from the download.
   **Measure the real airplane, not the download.** The downloads this project started from put their canopies
   0.1 to 1.0 m aft of the real ones and 0.2 to 0.6 m low (the Wildcat's glass was 1.3 m aft and its crown 0.6 m low), and the
   specs' eye points were fitted to them (Mark noticed, 2026-10-11). Wikimedia Commons carries a 3-view line drawing
   of each type (`File:Grumman F6F Hellcat 3-view line drawing.svg`, `File:Vought F4U-1 Corsair 3-view.svg`,
   `File:Grumman F4F Wildcat 3-view line drawing.svg`; find others from the article's image list with
   `api.php?action=query&prop=images&titles=<article>`), fetched as a PNG with
   `https://commons.wikimedia.org/wiki/Special:FilePath/<name>?width=1600` and read with the Read tool. From the side view,
   take the nose-relative top and bottom lines, the windscreen front, the crown and the canopy rear; from the top view, the
   half-widths and the wing chord at 30 percent semispan (its quarter chord is where the origin sits, 3.03 m, 2.87 m and
   2.58 m aft of the spinner tip for the Hellcat, Corsair and Wildcat). Scale each drawing by its own spinner-tip-to-tail pixels over the cited length. Put
   the tables in the script as meters aft of the nose, with the drawing named in the header. Check by overlaying the
   model's centerline silhouette on the drawing: the three fighters' tops, canopies and bellies sit within a few cm of it.
   Before accepting those measurements, search public factory-drawing catalogs for master lines, loft ordinates and
   installation drawings. Record useful drawing numbers, titles and access status even when the sheets are gated, but
   never treat an index title as numerical validation or bypass membership controls. The B-17 pass found useful public
   AirCorps Library metadata for cockpit, inboard-wing, wing-rib, fin, rear-gun and stabilizer contour sets; the sheets
   themselves require sign-in, so they remain a recommended refinement rather than a source used by the model.
   A blank field in an otherwise cited specification is still an **ESTIMATE**: for example, the B-17G Wikipedia table
   names three-blade propellers but leaves diameter blank, so the script labels its drawing-measured diameter accordingly.
   If Commons offers only an adjacent variant's drawing, use it only when the cited dimensions agree, name the mismatch in
   the script and handoff, and keep variant-specific details labeled as estimates. Never silently present that drawing as
   the requested variant (the D3A2 duplicate had only a Commons D3A1 three-view available, 2026-10-11).
   Apply the same rule to the Ki-43-II: the article's only drawing is labeled Ki-43-I, so the II's shorter cited span,
   three-blade propeller, longer cowl and taller canopy override it. Any remaining cross-variant likeness is an estimate.
2. **Pick the nearest template and copy it.** Do not start from `kit.py`.
   - one engine, tractor, tail dragger: `f6f-hellcat-blender.py` (fighters; also `ki-84-frank.py`, `tbm-3-avenger.py`)
   - bent (gull) wing: `f4u-corsair-blender.py`
   - low or mid wing with the gear in the fuselage: `f4f-wildcat-blender.py`
   - internal bay, turrets, flexible guns: `tbm-3-avenger.py`
   - two engines: `ki-21-sally.py`, `p-38-lightning.py`; four: `b-29-superfortress.py`

   Stations are fractions of the cited `LENGTH` or `SPAN`, so a new type changes the CITED block and the station
   tables, not the code.
3. **Fit the stance to the spec when the model will replace a download.** The flight model reads `gear.heightM`,
   `mainX`, `thirdX`, `thirdHeightM`, the eye point and the gun positions. Build the wheel bottoms to those numbers
   and say so in the header ("FITTED to"). The tail wheel's bottom follows from the stance pitch in
   `src/render/scene/stance.ts`: with mains at x_m, height h and pitch p, the tail contact is
   y = -h + (x_m - x_t) sin(p) / cos(p) (checked: it reproduces `thirdHeightM` for all three fighters to 0.004 m).
   A new type with no download sets these from its own sources and writes the spec to match.
4. **Read the profile off the download before shaping the fuselage.** Render the download and the candidate from
   the same side view and compare silhouettes: `tools/models/blender/preview.py` takes
   `--view front|rear|below|side|top`. The first Hellcat pass (a TBM-like tube) looked wrong in profile; matching
   the download's deck line, belly line and tail depth fixed it. Measure from the picture, in meters, and convert to
   the station fractions with a short script rather than by hand.
5. **Build and iterate.** `npx tsx tools/models/blender/cli.ts <id>` writes a candidate glb and prints its
   inspection in about two seconds; render the views. Only after the shape is right write the manifest entry.
   For an exact download/new-model comparison, render each through `preview.py` with the other as
   `--frame-glb`: that hidden second model contributes only to the union camera bounds, so reversing the two
   paths gives both renders the same camera. Without it, `preview.py` frames each model independently and the
   pictures are not a scale comparison. A three-view's side and top drawings may use different scales; derive
   each view's meters per pixel from that view's own spinner-tip-to-tail length.
   `silhouette-overlay.ts` plots the built model's side-projected vertices over that calibrated drawing;
   pass the drawing's nose, tail and thrust-line pixels, the model origin's nose-relative station, the cited
   length and the side-view crop bottom. Keep the overlay with the handoff evidence; it is a review artifact,
   not a screenshot-golden test.
6. **Write the manifest entry** `tools/models/entries/<id>.json` (`source.kind: "blender"`, `normalize`, `keep`,
   `budget`; copy a sibling). Each `keep` row's `pivot.point` is the hinge the script placed: propeller hub
   `(NOSE_X - PROP.hub) * LENGTH`, gear hinge `(x, hinge_y, ±z)`, tail wheel hinge. The axis is `+x` for a leg that folds
   in or out and `+z` for one that swings aft (the sign table is in `airframeRigs.ts`). A part left out of `keep` is
   baked into the skin: the Wildcat's fixed tail wheel is done that way. `npm run models:build -- <id>` builds it.
7. **Register it.** The touchpoints, found by grepping an existing Blender airframe (the TBM-3's), are:
   - `src/render/scene/airframeRigs.ts`: the rig row. **Fold direction is the thing to get right**
     (see Traps).
   - `content/library/<id>.json`: the Hangar card. A duplicate has `model` and no `spec`, so it shows as
     display-only ("not in the game yet"); `tests/render/hangar/catalog.test.ts` pins that labeling.
   - `ASSETS.md`: a row (the manifest test requires one).
   - `tests/tools/models/aircraftDimensions.test.ts` (`CITED`), and `aircraftRigs.test.ts` (the pinned list of
     airframes with surfaces).
   - `tests/tools/models/blenderDuplicates.test.ts`: one row pairing the duplicate with the spec it copies.
   - A turreted Hangar-only duplicate also belongs in the pinned `turreted` list in
     `tests/tools/models/gunnerMounts.test.ts`; keep its no-spec id out of the flyable gunner/content comparison.
   - A Hangar-only duplicate with bay doors has no spec travel time and thus no Cycle button. In Hangar check 7b,
     drive its `bayDoorFraction` directly while keeping the timed Cycle assertion for flyable bay aircraft.
   - `tests/e2e/hangar.spec.ts`: the id in checks 10 and 16.
   - A new paint role needs a `PALETTE` entry in `kit.py` and a surface entry in `tools/models/skin/surfaces.ts`
     (the build fails by name without the second).
   - Fixed gear is baked into the skin and has no `GearL`/`GearR` row. A flexible gun on a Hangar-only duplicate may also
     remain static when there is no duplicate combat spec for `gunnerMounts.test.ts`; say so in the rig and handoff. Parts
     without a renderer input, such as the D3A's dive brakes, can be drawn static but must not invent a control-surface name.
8. **Run the model tests**: `remote-run npx vitest run tests/tools/models tests/render/hangar tests/render/airframes.test.ts`
   (about 3.5 minutes on ryzen; `-t "<id>"` narrows it to seconds while iterating).
9. **Look at it in the Hangar.** `npx vite --port <free port>` from the checkout, then
   `PW_BASE_URL=http://localhost:<port> npx playwright test tests/e2e/hangar.spec.ts --workers=1` (nexus's own
   WebGPU is enough for correctness; 23 tests, about 7 minutes). The capture tool beside it,
   `E2E_CAPTURE=1 E2E_CAPTURE_DIR=<dir> ... tests/e2e/blenderDuplicatesCapture.spec.ts`, writes each duplicate
   next to its download, gear down and up.

## Promoting a duplicate

A duplicate is shown, not flown. To fly it, replace the download in one change. **This list is derived from the
files each test reads and has not been exercised yet (2026-10-11); the first promotion should correct it.**

1. In `content/aircraft/<spec>.json` set `view.model` to the duplicate's id, and add the model to
   `MODEL_STANCE` in `src/render/scene/stance.ts` with the spec's own `mainX` and stance pitch.
2. Re-measure the stores: `npm run models:mounts`, and write the printed rack and rail offsets into the spec
   (`wildcatMounts.test.ts` then holds them). `blenderDuplicates.test.ts` already proves the wing takes them.
3. Add the model to `CANOPY` in `eyePoints.test.ts` (its whole-skin node, as the TBM's), and to the pinned lists in
   `wildcatMounts.test.ts`; delete its row in `blenderDuplicates.test.ts`.
4. Point the Library card at the spec (`spec`), and decide the old download's fate (`ASSETS.md` keeps its credit
   while its glb ships). The Wildcat is the special case: `view.model: "wildcat"` is loaded by `wildcat.ts`
   with its own leg stretch and code-drawn split flaps, none of which the duplicate needs; the swap goes through the
   generic rig, and the Wildcat-only tests and constants (`wildcatFrame.ts`, `wildcatGear.test.ts`) fall away with it.
5. Run the graded flight cards: `tests/sim/testcards/graded.test.ts` reads the spec, so a changed drawing must not
   change them; if it does, the stance fit was wrong.

## Traps found on the three fighters (2026-10-11)

- **Read the canopy off the real airplane, in numbers.** The first pass put each canopy 0.7 to 1 m too
  far aft and built it as a long pointed lens, which met the deck as a triangle instead of reading as a bubble (Mark,
  2026-10-11). The second pass copied the downloads' glass and was still aft: the downloads are wrong (step 1, "Measure the real
  airplane"). Build the glass as stations of (x, half-width, crown y) with a
  raked, blunt windscreen, the crown over the eye, and a long taper aft, its base sunk below the deck. The deck
  forward of the windscreen must sit at the drawing's height (the Hellcat's cowl top is about 0.85 m, so its
  canopy stands 0.4 m proud), or the glass looks sunk.
- **Canopy and fuselage station lists run tail to nose** (x increasing). A reversed list fails with
  "station x values must be strictly increasing", and only the canopy's order is easy to flip when copying from a
  nose-first source.
- **The build merges glass and paint into one whole-skin node** named `<NAME>_<role>` of the upper paint, so
  the eye-point check measures that node's crown within 0.2 m fore and aft of the eye. A crown more than
  0.45 m over the eye fails; lowering the canopy 0.03 m fixed the Hellcat's 0.451.
- **A flap that spans an anhedral panel can lean its front face past the 2 mm hinge tolerance** in
  `aircraftRigs.test.ts` (the Corsair's inner panel at 7.4 degrees failed by 0.06 mm; 6.5 passes). Reduce the bend or
  keep the surface off the bent panel.
- **A folded leg may not stand more than 0.08 m above the skin beneath it.** An upright wheel swung aft
  (the Hellcat) passes only because its hinge is set low in the wing (0.4 of the root thickness below the chord line);
  folded flat it is thin enough to hide in the wing (the Corsair, the Wildcat). The Wildcat's legs, hinged at the
  fuselage side, first failed by 0.129 m where the folded wheel sat behind a thin leading edge; lowering the hinge
  0.09 m passed it. A debug script that ray-casts the folded points names the offending point in a minute.
- **Real struts turn the wheel 90 degrees as they fold; one hinge cannot.** Every model here swings the leg and
  says so in the rig row's `source`. The download Hellcat is on `THROUGH_SKIN` for the same reason.
- **Preview renders are flat.** `preview.py` is Cycles with no skin; judge shape there and finish in the Hangar, whose
  lighting and skin are the game's.
- **A specifications table can leave a requested figure blank.** Record the blank explicitly rather than making
  the citation imply the value exists; derive it from the measured drawing or another named source and tag it
  `ESTIMATE`. The A6M2 table gives three propeller blades and the maker but no diameter (2026-10-11).

## What the duplicates are (2026-10-11)

| Duplicate | Copies | Cited | Stance fitted to the spec | Glb (bytes / triangles / draws) |
| --- | --- | --- | --- | --- |
| `f6f-hellcat-blender` | `f6f-hellcat` (F6F-5) | span 13.06 m, length 10.24 m, area 31.0 m2, 3.99 m 3-blade prop | wheels 2.42 m below the origin at x 0.62, tail wheel x -6.0 | 788,316 / 24,796 / 12 |
| `f4u-corsair-blender` | `f4u-corsair` (F4U-1D) | span 12.50 m, length 10.26 m, area 29.17 m2, 4.06 m 3-blade prop, inverted gull wing | 2.418 m at x 0.418, tail wheel x -5.722 | 868,724 / 27,320 / 14 |
| `f4f-wildcat-blender` | `f4f-wildcat` (F4F-4) | span 11.58 m, length 8.76 m, area 24.15 m2, 3 blades, aileron span and hinge | 2.3952 m at x 0.413, tail wheel x -4.627 (fixed) | 825,212 / 26,236 / 17 |
| `a6m2-zero-blender` | `a6m2-zero` (A6M2 Model 21) | span 12.0 m, length 9.06 m, area 22.44 m2, 3 blades; prop diameter 2.90 m measured because the table is blank | 2.025 m at x 0.182, tail wheel x -6.532 | 717,844 / 21,464 / 18 |
| `b-17-flying-fortress-blender` | `b-17-flying-fortress` (B-17G) | span 31.62 m, length 22.66 m, area 131.92 m2, four 3-blade props | 2.548 m at x 0.852, tail wheel x -10.623 | 1,163,684 / 36,408 / 29 |
| `d3a-val-blender` | `d3a-val` (D3A2 Model 22) | span 14.365 m, length 10.195 m, area 34.9 m2, 3 blades; D3A1 drawing limitation recorded | fixed mains 1.850 m below at x 0.257, tail wheel x -6.577 | 901,876 / 27,060 / 19 |
| `ki-43-oscar-blender` | `ki-43-oscar` (Ki-43-IIb) | span 10.84 m, length 8.92 m, area 21.4 m2, 2.79 m 3-blade prop; Ki-43-I drawing limitation recorded | 1.843 m at x 0.348, tail wheel x -5.375 (fixed) | 806,148 / 25,624 / 17 |

All seven now use a Commons three-view from Kaboldy's orthographic series as their common silhouette family. Published
dimensions and the project spec own scale and stance; the D3A2 and Ki-43-IIb headers keep their adjacent-variant caveats.
Each script records nose-relative stations and separately labels cited facts, drawing measurements, spec fits and estimates.
The SVGs are credited measurement references and are not bundled in the repository.

## Showing the result

A Hangar capture is small and portrait (the panel takes the width). For a review, render the download and the duplicate with
`preview.py` from the same camera (`--view front|side`), crop to the airplane, and send one contact sheet per aircraft as ordinary
attachments (`msmtp -t`, under 0.5 MB in all); do not inline images in an HTML body (see the handoff, "Review"). The gated
`tests/e2e/blenderDuplicatesCapture.spec.ts` shows gear down and up with the game's lighting.
