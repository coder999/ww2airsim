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
4. **Shape the volume from the real airplane; use the download only as a review foil.** Calibrate the side, top and
   front views of the source drawing independently. The side view owns deck, belly, canopy and fin outlines; the top
   view owns half-widths, planform and tailplane; the front view or a primary cross-section owns section shape and
   canopy shoulder/roof width. Do not transfer a silhouette, canopy station, cross-section or attachment point from
   a downloaded model. Render that model beside the candidate only to expose a conspicuous interpretation error.
   At every side station, follow the outer silhouette rather than a nearby panel seam, wing-root line or hidden
   continuation; the first Ki-43 pass accidentally sampled those internal lines at four stations and produced a
   visible cowl dip and rear-cockpit hump. Pin corrected source-measured stations in a mesh-level regression.
   `tools/models/blender/preview.py` takes `--view front|rear|below|side|top`. Measure source pixels in meters and
   convert to station fractions with a short script rather than by hand. If no trustworthy front view or section
   exists, label the transverse section **ESTIMATE** and check it against photographs from several angles.
5. **Build and iterate.** `npx tsx tools/models/blender/cli.ts <id>` writes a candidate glb and prints its
   inspection in about two seconds; render the views. Only after the shape is right write the manifest entry.
   For an exact download/new-model comparison, render each through `preview.py` with the other as
   `--frame-glb`: that hidden second model contributes only to the union camera bounds, so reversing the two
   paths gives both renders the same camera. Without it, `preview.py` frames each model independently and the
   pictures are not a scale comparison. A three-view's side and top drawings may use different scales; derive
   each view's meters per pixel from that view's own spinner-tip-to-tail length.
   `silhouette-overlay.ts` fills the built model's projected triangles over that calibrated drawing (`top`
   for the plan view); pass the drawing's nose, tail and thrust-line pixels, the model origin's nose-relative
   station, the cited length and the crop bottom. Look at it at full size and read every edge: the first B-17 and
   D3A duplicates shipped with overlays (then vertex dots) showing a canopy and a fin well above the drawing's,
   called a fit. Keep the overlay with the handoff evidence; it is a review artifact, not a screenshot-golden test. A side overlay cannot detect a needle-thin tail, an over-wide canopy or a part
   floating above the skin. Before accepting a model, make equivalent top/front checks and inspect three-quarter
   renders. Canopy rails, turret bases, landing-gear roots and fairings must overlap the supporting surface in the
   generated mesh; a visually adjacent part is not attached.
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

## Keeping comparison duplicates

A comparison pass is additive. Keep the legacy Library card and GLB unchanged, and give the candidate one stable id with a
`-blender` suffix across its Blender script, manifest entry, generated GLB, rig row and Library card. The candidate card has
`model` but no `spec`, so the Hangar labels it display-only while missions continue to resolve the legacy id. Merge both ids to
`main`: do not overwrite the download merely to make the comparison convenient. This is the convention used by the seven-aircraft
fleet review in `docs/handoff/2026-10-11-fleet-blender-rebuild.md`.

The separate id is also the cleanup seam. After review, find every occurrence with `rg -n '<id>'` and remove only that candidate's
Library card, generated GLB, Blender script, manifest entry, rig/test enrollment and asset-ledger rows. Keep shared kit changes and
source-method documentation. Then rerun the duplicate, rig, catalog and roster checks. Promotion is different from removal and
follows the next section; it deliberately changes the flying spec.

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

- **Read the canopy off the real airplane, in numbers and in section.** The first pass put each canopy 0.7 to 1 m too
  far aft and built it as a long pointed lens, which met the deck as a triangle instead of reading as a bubble (Mark,
  2026-10-11). The second pass copied the downloads' glass and was still aft: the downloads are wrong (step 1, "Measure the real
  airplane"). Build the glass with explicit fuselage rail, shoulder, roof and crown points: straight panes between
  those points, a raked blunt windscreen, the crown over the eye, and an inset closure buried below the rails. Use
  `faired_canopy`'s eight-value stations when the compact four-value section is visibly too generic. The deck
  forward of the windscreen must sit at the drawing's height (the Hellcat's cowl top is about 0.85 m, so its
  canopy stands 0.4 m proud), or the glass looks sunk. Check the join from front and three-quarter views: no bulb
  perched on the centerline, no open side gap, and no rail hovering above the fuselage shoulder.
- **Smoothness is not permission to move the measured stations.** Catmull-Rom can overshoot noisy ordinates and turn
  a plausible table into a bumpy fuselage. Correct bad measurements first. For a measured station table that must
  remain inside each authored interval, use `fuselage(..., refinement='shape')` and use `kit._refine_shape` for any
  matching surface-height lookup in the model script. Judge the result in side, top and three-quarter views.
- **Trace the outer mold line, not the nearest continuous line.** Orthographic drawings also show longerons, panel
  seams, fairing edges and surfaces behind the fuselage. The first Zero duplicate followed an internal line as the
  belly and inner plan-view lines as width, reducing a roughly 3 ft-deep aft body to a strip. Mark candidate pixels
  across several stations, follow each line to a feature you can identify, and confirm the selected envelope against
  an oblique photograph before converting it to ordinates.
- **Cross-check every calibration against a second one before reading tables.** One drawing, one scale: the
  top view's span must land on the cited span, the 30%-semispan quarter chord must put the spec's tailwheel x
  under the drawn tailwheel, and the propeller axis must be the spinner's center row. The first B-17 pass read
  the nose 2.5 m too far forward of the wing and the body 50% too wide; the first D3A pass read the side view
  about 1.35x too large (2026-10-11). Each check is one line of arithmetic.
- **Trace curved fins, fillets and rounded tips; do not reduce them to trapezoids.** `kit.fin_outline` and
  `kit.wing_outline` take traced (station, leading x, trailing x, thickness) rows and put a ring at every row;
  a control's hinge may be a straight line in absolute x, so a curved planform keeps a straight rudder or
  elevator hinge. A trapezoid B-17 fin read as a triangle at Hangar distance (Mark, 2026-10-11).
- **Seat attached parts on the actual local skin.** Compute a turret base, fixed strut root, spat brace or canopy rail
  from the same refined fuselage/wing stations that draw the supporting surface. Sink the join slightly into that
  surface. The B-17 upper turret and D3A fixed gear showed why a plausible world-space height is not enough.
- **A turret base and its gun trunnion solve different constraints.** Seat the lowest collar into the sampled skin,
  then put the trunnion high enough that `aircraftRigs.test.ts` can sweep every declared traverse/elevation without a
  barrel crossing the fuselage or cockpit. Lowering an old floating dome as one rigid primitive made the B-17's guns
  cut through its cockpit; a joined collar/dome kept the base attached while preserving the clear gun arc.
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
| `f6f-hellcat-blender` | `f6f-hellcat` (F6F-5) | span 13.06 m, length 10.24 m, area 31.0 m2, 3.99 m 3-blade prop | wheels 2.42 m below the origin at x 0.62, tail wheel x -6.0 | 1,277,592 / 43,734 / 14 |
| `f4u-corsair-blender` | `f4u-corsair` (F4U-1D) | span 12.50 m, length 10.26 m, area 29.17 m2, 4.06 m 3-blade prop, inverted gull wing | 2.418 m at x 0.418, tail wheel x -5.722 | 1,372,088 / 48,902 / 14 |
| `f4f-wildcat-blender` | `f4f-wildcat` (F4F-4) | span 11.58 m, length 8.76 m, area 24.15 m2, 3 blades, aileron span and hinge | 2.3952 m at x 0.413, tail wheel x -4.627 (fixed) | 1,176,440 / 41,314 / 17 |
| `a6m2-zero-blender` | `a6m2-zero` (A6M2 Model 21) | span 12.0 m, length 9.06 m, area 22.44 m2, 3 blades; prop diameter 2.90 m measured because the table is blank | 2.025 m at x 0.182, tail wheel x -6.532 | 1,133,876 / 38,574 / 18 |
| `b-17-flying-fortress-blender` | `b-17-flying-fortress` (B-17G) | span 31.62 m, length 22.66 m, area 131.92 m2, four 3-blade props | 2.548 m at x 0.852, tail wheel x -10.623 | 1,521,240 / 52,080 / 29 |
| `d3a-val-blender` | `d3a-val` (D3A2 Model 22) | span 14.365 m, length 10.195 m, area 34.9 m2, 3 blades; D3A1 drawing limitation recorded | fixed mains 1.850 m below at x 0.257, tail wheel x -6.577 | 1,413,112 / 48,746 / 19 |
| `ki-43-oscar-blender` | `ki-43-oscar` (Ki-43-IIb) | span 10.84 m, length 8.92 m, area 21.4 m2, 2.79 m 3-blade prop; Ki-43-I drawing limitation recorded | 1.843 m at x 0.348, tail wheel x -5.375 (fixed) | 1,445,820 / 54,204 / 17 |

All seven were re-measured from their drawings on 2026-10-11 after Mark's review (handoff `docs/handoff/2026-10-11-fleet-remeasure.md`); all seven now use a Commons three-view from Kaboldy's orthographic series as their common silhouette family. Published
dimensions and the project spec own scale and stance; the D3A2 and Ki-43-IIb headers keep their adjacent-variant caveats.
Each script records nose-relative stations and separately labels cited facts, drawing measurements, spec fits and estimates.
The SVGs are credited measurement references and are not bundled in the repository.

## Showing the result

A Hangar capture is small and portrait (the panel takes the width). For a review, render the download and the duplicate with
`preview.py` from the same camera (`--view front|side`), crop to the airplane, and send one contact sheet per aircraft as ordinary
attachments (`msmtp -t`, under 0.5 MB in all); do not inline images in an HTML body (see the handoff, "Review"). The gated
`tests/e2e/blenderDuplicatesCapture.spec.ts` shows gear down and up with the game's lighting.
