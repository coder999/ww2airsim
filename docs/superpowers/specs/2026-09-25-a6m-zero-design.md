# A6M Zero, the second airframe: design

**Status: design for Mark's review, 2026-09-25.** Nothing here is built yet.
When Mark approves it, the implementation plans come next: three sub-plans,
Z1 to Z3 (§11). Plan numbering is still owned by master spec §15. This
document asks for no number. When Z1 starts, the Z-plans get a row in that
table, the same way "F4F Wildcat" got one.

Mark's decisions on 2026-09-25, which this design takes as given:

- The next airframe is the **Mitsubishi A6M Zero**, as a hostile fighter
  (GAMEPLAY.md already lists it as "Hostile fighter").
- **The primary model is candidate #6**, SavinienBerault's "Mitsubishi A6M2
  ZERO - zeke" (Sketchfab uid `d701787b75fa4c979792b0c0c14221e2`, CC-BY 4.0).
- Candidate #1, Mamoru_Morimoto's A6M3 low-poly (uid
  `cb9fa84167ac4efa9d8aebcab133f7f3`, already staged), "looks quite good too".
  This design uses it as the distance LOD (§7.4).

## 1. What this adds, and what it does not

It adds:

1. `content/aircraft/a6m2-zero.json`: an A6M2 Model 21 flight model graded
   against a 1942 US Navy trial of a captured airframe (§4).
2. Two optional, data-driven flight-model terms, so that the Zero has the
   character that trial reported: controls that stiffen at high speed, and an
   engine that cuts out under negative g (§4.4). Both depend on Mark's
   decision in Open item 2.
3. Per-gun ballistics, so that two 20 mm cannon and two 7.7 mm machine guns
   are not averaged into one gun (§5). This depends on Open item 3.
4. A **manifest-driven model pipeline**, replacing the Wildcat-only
   `tools/models/build.ts`. Lane C's ships use this pipeline too (§6).
5. A shared runtime **model cache** and **per-aircraft model selection**. Today
   every aircraft renders as the Wildcat, and each instance holds its own copy
   of every texture (§7).
6. A Zero airframe module with a spinning propeller, retracting gear, flaps,
   and a distance LOD built from candidate #1 (§7).
7. One scenario that flies the Zero as a hostile (§9).

It does not add:

- **An A6M5.** The model on screen is an A6M2, so the Zero flies A6M2 numbers.
  The Leyte-period variant is Open item 1.
- **Real F4F-4 data in `f4f-wildcat.json`.** That file is still a placeholder
  that borrows the Hellcat's numbers, and it stays that way here. Fixing it is
  a sourcing job (a separate Patuxent F4F-4 trial) plus one test-card file.
  None of the Zero's code needs it. No scenario flies the F4F, so a fix would
  change nothing anyone can see. It is a cheap follow-up (one plan task) that
  can ride along later, but it would not save any work by coming along now.
- AI changes, formations or teams. Those belong to Lane A (§10).
- Any change to lighting, exposure or materials policy. Those belong to the
  photoreal render pass (§10).

## 2. Measured facts this design stands on (2026-09-25)

Each fact below says how it was checked. Re-check any of them before relying
on it.

| Fact | Value | How measured |
| --- | --- | --- |
| #6 metadata | 187,441 faces, 91,334 vertices, 5 materials, 15 textures, 0 animations, CC-BY 4.0, downloadable, published 2020-05-13, "Made on solidworks 2018" | `api.sketchfab.com/v3/models/d701787b75fa4c979792b0c0c14221e2` |
| #6 authorship | Uploader's 20 models are consistent SolidWorks/CAD work (helicopters, a rocket-engine *assembly animation*, a Yak-38). None shows rip or re-upload signs | `api.sketchfab.com/v3/models?user=SavinienBerault` |
| #6 appearance | Gear modeled **down**, belly drop tank fitted, framed canopy, weathered dark green with yellow wing leading edges | 1024 px API thumbnail, viewed |
| #6 raw file | **Downloaded** 2026-09-25T14:31Z by `tools/models/sketchfab-fetch.sh` (on `main` as `86d38e9`) to the main checkout's `content/models/candidates/a6m2-zeke.glb`: 16,138,556 bytes, with a sidecar | `ls -la`, sidecar JSON |
| #6 structure | 14 nodes, 6 meshes, 5 materials, **11** PNG textures (the API said 15), 0 animations, 187,441 triangles. Separate named nodes: `Rotor` (29,088 tris), `Verriere` (canopy, 34,253), `Corps` (body, 2 primitives: 84,340 and 16,048), `Leg d` and `Leg g` (right and left main legs, 11,856 each) | `glbinspect.py` on that file |
| #6 axes | After Sketchfab's root matrix: nose **+X**, up **+Y**, span along **Z**, right = **+Z** (`Leg d`, *droite*, sits at z ≈ +100). The prop's spin axis is exactly world X, so the thrust line is level and no pitch correction is needed. The root matrix also carries a 0.31° tilt, which `normalize` absorbs. Span is 632.3 units, so 12.0 m means 0.01898 m per unit | World-space vertex bounds per node |
| #6 pivots | **No part node is pivoted where it moves.** `Rotor`'s origin is the model origin (0, 0, 0), about 283 units behind the hub. `Leg d`, `Leg g`, `Corps` and `Verriere` all share one matrix (translation (0, 1.684, 0)). Measured hub axis: along world X through y ≈ 129.2, z ≈ -6.3. That is the mean of the spinner's front-most vertices. The prop's bounding-box center (y 146.4) is **wrong** for a three-blade disc. Leg hinge tops: (168.5, 87.8, +101.5) right and (168.5, 87.8, -113.1) left, symmetric about the fuselage centerline z ≈ -5.8. Wheel contact y = -1.71, so a leg is about 92 units (≈ 1.75 m) long | Vertex statistics per node |
| #6 islands | `Corps`'s main primitive is one 77,896-triangle shell holding the fuselage, wings, flaps, ailerons **and the belly drop tank**: the centerline dips to y ≈ 15 at x 50 to 125, against a belly around 40 to 55 elsewhere. There are also 8 small islands. One is the **tailwheel** (1,810 tris, x -180 to -155, y -2 to 19). Two others (290 and 272 tris) are fittings at the leg tops. **Flaps and control surfaces are not separable, even as islands** | Union-find over the welded index buffer |
| #1 structure | 1,162 triangles, **one mesh** (Sketchfab's `obj.cleaner.materialmerger` merged everything), 1 material, 1 JPEG texture (203,513 bytes), no animations, no separate prop or gear, and the gear is not modeled at all | `glbinspect.py` on `content/models/candidates/a6m3-zero-lowpoly.glb` (main checkout) |
| #1 axes | Nose at source **-X** (prop radius 0.278 at x = -0.49), span along **Z**, up **+Y**, fin tip (highest vertex) at x = +1.66 | Vertex slices through the same file |
| #1 proportions | Span / length 3.251 / 2.367 = **1.37**. The A6M2 is 12.0 m / 9.06 m = 1.32, and the clipped-tip A6M3 Model 32 is 11.0 / 9.06 = 1.21. **So #1 is not clipped-wing geometry.** Scaled to a 12.0 m span it is 8.72 m long, 3.8% short | Same |
| Wildcat budget | 100,886 triangles, 47 meshes, 26 textures, **all 1024²**, 5,573,316 bytes (3.78 MB geometry, 1.69 MB WebP) | `glbinspect.py` on `content/aircraft/wildcat.glb` |
| Per-instance duplication | `buildScenarioEntities` calls `loadWildcat()` once per aircraft, and each call runs a fresh `GLTFLoader.loadAsync`. So every aircraft uploads its own 26 textures, about **139 MiB of VRAM each** (26 × 1024² × 4 B × 4/3 for mips) | Read `scenarioEntities.ts` and `wildcat.ts`; arithmetic |
| Pipeline flags | `gltf-transform optimize` defaults `--flatten`, `--join` **and `--join-named`** to `true`. These merge named meshes, which would weld a static-mesh model's propeller into its fuselage. `--simplify` adds no required extension. Only `--compress meshopt` does | `npx @gltf-transform/cli@^4.5.0 optimize --help` |
| `node_modules` | `@gltf-transform/cli` is in `devDependencies` but **not installed** in the shared `node_modules`. Today's build works only because it runs `npx --yes` | `ls node_modules/@gltf-transform` |
| Candidate leak | Vite's `copyContent()` copies all of `content/` into `dist/`. The main checkout's gitignored `content/models/` holds 101,182,857 bytes of candidates, and its `dist/content/models/` already holds 129 MB. CI deploys from a fresh clone, so production is unaffected. Local builds and the dist test are affected | `du -sb`, `ls dist/content/models`, `vite.config.ts` |
| Rate law | `rateAuthority` is `min(1, sqrt(q / qRef))`. Above the reference speed, authority stays at 1 however fast the airplane goes, so nothing in the model can make controls heavy at high speed | `src/sim/flight/model.ts` |
| Gun model | One `roundsPerMinute`, `muzzleVelocityMps` and `roundDamage` per aircraft. A round hitting an aircraft costs the *target's* `damagePerHit`, whatever fired it | `src/sim/weapons/schema.ts`, `combat.ts`, `damage/model.ts` |
| Scoring | `AircraftSpec.role` is `'fighter' \| 'bomber'`. A kill is credited via `killsByType[role]`, and a fighter scores 500 (GAMEPLAY.md). **A Zero with `role: "fighter"` needs no scoring change** | `combat.ts` `creditAircraftDamage` |

### Primary sources for the flight model

Retrieved 2026-09-25 from wwiiaircraftperformance.org's Japan page and read
page by page. Every one is a scan, and none has a text layer:

- **Informational Intelligence Summary No. 85**, USAAF Intelligence Service,
  December 1942, "Flight Characteristics of the Japanese Zero Fighter"
  (`/japan/intelsum85-dec42.pdf`). These are US Navy trials at San Diego of the
  "Type Zero Mark I, Carrier Fighter, Model 2" (the Akutan Zero). The
  performance table is "the calibrated results obtained by the Navy after a
  series of trials". It gives a gross weight of **5,555 lb** "with a full
  military load", indicated stall speeds, and qualitative handling notes.
- **AAF Materiel Command memo of 23 October 1942**, "Performance and
  Characteristics of the Japanese Zero-2, Model A6M2 Airplane"
  (`/japan/a6m2-oct2342.pdf`). It gives the same trials' *preliminary*,
  uncorrected figures, plus armament and fuel. It is used only as
  corroboration.
- **Memorandum Report ENG-47-1673-A**, Wright Field, 24 November 1943
  (`/japan/ENG-47-1673-A.pdf`). These are pilot comments on a Model II. It
  records the gear retracting "in about 10 seconds", a non-steerable
  tailwheel, and "above 300 M.P.H. all maneuvers become increasingly
  difficult".
- **23rd Fighter Group report on Zero P-5016**, 6 February 1943
  (`/japan/p5016.pdf`). It records "no armor, bullet proof glass, bullet proof
  fuel tanks", the tank capacities, and aileron and elevator areas that are
  "very small".

## 3. The model

### 3.1 Why #6 holds up

Mark has chosen it. These are the facts that support the choice:

- **Fidelity.** It is a real CAD build: framed canopy, modeled gear and
  wheels, drop tank, radio mast and wire, and five PBR material sets.
- **License.** CC-BY 4.0, read from the API rather than the page. The uploader
  has a consistent history of original SolidWorks work.
- **Budget.** At 187k faces it is 1.9× the Wildcat. The pipeline's simplify
  step brings it to Wildcat parity (§8). CAD tessellation is dense on flat
  panels and simplifies well, but that is a claim for Z3 Task 1 to measure,
  not an assumption.
- **Variant match.** It is an A6M2, the same variant as the best US primary
  trial data (§2).

The ShareAlike question about ivon852's A6M2/A6M5 (CC-BY-SA) is moot and is
not analyzed here.

### 3.2 Which parts are separate (inspected 2026-09-25)

**Amended 2026-09-25, after the download.** Before it, this section was a
ladder for an unknown file. The inspection in §2 has now settled each rung,
part by part:

| Part | Rung | What the build does |
| --- | --- | --- |
| Propeller | **1: named node** `Rotor` | Kept un-joined. **Re-pivoted** at build time onto the measured hub axis, because its node origin is not at the hub (§2) |
| Main gear legs | **1: named nodes** `Leg d` / `Leg g` | Kept un-joined. **Re-pivoted** onto each leg's top hinge. Wheel, strut and the strut-mounted cover plate come as one piece |
| Tailwheel | **2: separate island** inside `Corps` | `split` by component into `Tailwheel`, pivoted at its top |
| Canopy | Named node `Verriere` | Joined like any other part (no sliding canopy), but simplified on its own ratio: 34k triangles is far denser than it needs to be |
| Split flaps | **3: fused** into the main 77,896-triangle shell | **Static.** A triangle-level cut along the hinge would tear the lower wing skin |
| Ailerons, elevator, rudder | **3: fused** | **Static.** Out of scope, as rung 3 always said |
| Drop tank | **Fused** into the main shell | See below |

Whatever the rung, the build fails loudly if a listed part is missing, just
as `wildcat.ts`'s `required()` fails at runtime today.

**Pivots are now a pipeline requirement, not a detail.** A `keep` entry may
carry a `pivot` (a point and an axis in source units), and the build moves
that node's origin there without moving any vertex in world space. The
output test proves each pivot mechanically:

- **Propeller:** rotating `Rotor` by 120° about its pivot axis maps its vertex
  set onto itself within a tolerance (three-blade symmetry). A pivot off the
  hub fails this.
- **Legs:** at gear fraction 0, each leg's vertices lie above the wing's lower
  surface at that spanwise station, less a small margin. That proves the leg
  folds *into* the wing and does not swing out below it.

**The drop tank** is fused into the main shell, so neither `remove` (by node)
nor a component split can take it out. A Zero that is fighting has
jettisoned its tank, so the design tries one thing and falls back to
another:

1. **Try:** a triangle-level `cut`, a `split` with `select: "triangles"`
   rather than the default `"components"`. It removes the triangles inside a
   box under the belly (roughly x 40 to 160, y < 35, |z + 6| < 25 in source
   units; Z3 Task 1 fits the exact box).
2. **Accept it** if the belly behind the cut is intact: no open hole in a
   Tier 2 close-up of the underside, and a closed-manifold check on the
   remaining shell.
3. **Otherwise keep the tank** and record it as a known inaccuracy. A hole in
   the fuselage is worse than a tank that should not be there.

The pilot figure, if the model has one, is kept.

**Critique #7's gear and flaps:** the gear animates, and so do the prop and
the tailwheel. The flaps are the one part of that critique this model cannot
meet. That goes in Z3's handoff and is not hidden.

### 3.3 Candidate #1 as the distance LOD

Candidate #1 is 1,162 triangles with one texture. At distance the variant
difference barely matters: §2 measured #1's proportions as a 12 m-span
airframe, so the "clipped wingtips" worry does not apply. Its failure modes
are elsewhere:

- **Color and tone.** #1 is a lighter, cleaner green than #6's weathered dark
  green. This is the likeliest thing to make the swap pop.
- **No gear.** A gear-down Zero past the switch distance shows no gear.
- **Static propeller**, merged into the mesh.
- **Length** is 3.8% short when scaled to the same span.

How the swap is done and tested is in §7.4.

## 4. Flight model: `content/aircraft/a6m2-zero.json`

### 4.1 Variant and graded figures

The variant is the **A6M2 Model 21**, which matches both the mesh and the
trial. The trial loading is **5,555 lb = 2,519.71 kg** gross, so
`reference.testMassKg = 2519.71`. The F6F precedent (Ruling R31) applies:
every graded figure is weight-specific.

Graded figures, all from Summary 85's calibrated table unless marked:

| Figure | Source value | SI | Card |
| --- | --- | --- | --- |
| Top speed at critical altitude | 326 mph at 16,000 ft | 145.74 m/s at 4,876.8 m | `reference.topSpeedMps` / `topSpeedAltitudeM` |
| Speed at altitude | SL 270, 5k 287, 10k 305, 20k 321.5, 25k 315, 30k 306 mph | 120.70, 128.30, 136.35, 143.72, 140.82, 136.79 m/s | new optional `reference.topSpeedByAltitudeM` |
| Sea-level climb | 2,750 ft/min | 13.97 m/s | `reference.climbRateMps` |
| Climb at altitude | 15k 2,380, 20k 1,810, 30k 850 ft/min | 12.09, 9.19, 4.32 m/s | new optional `reference.climbRateByAltitudeM` |
| Clean stall, power off | 78 mph IAS | 34.87 m/s | `reference.stallSpeedMps` |
| Gear and flaps down stall, power off | 69 mph IAS | 30.85 m/s | `reference.stallSpeedFlapMps` |
| Gear travel | "retract in about 10 seconds" (ENG-47-1673-A) | 10 s | `gear.travelSeconds`, sourced, which the F6F's is not |

Two notes on the table:

- **The critical altitude is 16,000 ft, not 10,000 ft.** The table prints
  "10,000" twice, and the second row carries the asterisk marking critical
  altitude. The AAF memo's own table puts the critical altitude at 16,000 ft,
  and so does the Eglin conclusion ("maximum manifold pressure can be
  maintained from sea level to sixteen-thousand (16,000) feet"). The second
  row is a typo for 16,000, and the content file's `source` string must say
  so.
- **Stall speeds are indicated airspeed.** Measured at sea level, IAS and TAS
  differ only by instrument and position error, which the source does not
  give. Same treatment as the F6F.

The flap lift increment is **derived, not estimated**, exactly as the F6F's
was. The required CLmax ratio is (78/69)² = **1.2779**, and `clIncrement` is
whatever reaches it on the shipped lift curve.

The take-off distance has **no primary source**. Summary 85 says only that
"Take-off is very rapid." So `reference.takeoffDistanceM` becomes optional in
the schema, and the F6F keeps its value. Instead of a graded figure, the Zero
gets a direction card: its roll is shorter than the F6F's at their own
take-off speeds. The Zero's take-off speed is 75 mph IAS (33.53 m/s,
ENG-47-1673-A).

The roll rate is an **unsourced estimate**, as the F6F's is. No trial reports
a number, and the content `source` string says exactly that.

Airframe and engine figures come from secondary sources. The plan task
re-reads each one from a citable copy, the same way the F6F was
"cross-checked against the Wikipedia infobox", and records the retrieval
date:

- Span 12.0 m, wing area 22.44 m², empty weight 1,680 kg, maximum 2,796 kg.
- Nakajima Sakae 12 engine, about 940 hp (701 kW) for take-off. Summary 85
  itself says "estimated 900 H.P. at sixteen-thousand (16,000) feet".
- Internal fuel **145 US gal** (2 × 54 + 37; Summary 85), which is 548.9 L,
  or 395 kg at 0.72 kg/L. That is `mass.fuelCapacityKg`. The belly tank is
  not carried.
- `aero.cySlopePerRad` = **2.0**. This is Mark's arcade number on the F6F, and
  it is kept identical so the two airplanes feel alike under rudder. The
  source string says so, pointing at the F6F's history rather than repeating
  it.
- The tailwheel is "non-steerable" (Summary 85, ENG-47-1673-A). The schema
  requires `tailwheelYawRateDegPerSec` to be positive, so a small value stands
  in for brake steering, and the source string says that.
- `gear.heightM` and `view.eyePointM` are **measured from the built LOD0
  mesh** in Z3, not estimated: wheel contact point, thrust line and canopy
  position after normalization. Z2 ships an estimate, and Z3 replaces it in
  the same commit that re-measures the take-off card.

### 4.2 Measured feasibility probe (2026-09-25)

This probe was run to check whether this flight model can reach these figures
at all before designing the cards around them. A scratch copy of
`f6f-hellcat.json` was given the Zero's geometry, mass, 701 kW, a 9,400 N
static thrust (scaled from the F6F by power) and a power curve flat to
4,877 m and falling above it. It was graded with `tools/testcards/measure.ts`
at the trial mass. The probe file was deleted and nothing was committed.

| Card | Reference | cd0 0.0195, η 0.75 | cd0 0.0175, η 0.70 |
| --- | --- | --- | --- |
| Top speed, 4,877 m | 145.74 | 144.85 (-0.6%) | 146.58 (+0.6%) |
| Top speed, SL | 120.70 | 123.47 (+2.3%) | 124.99 (+3.6%) |
| Top speed, 6,096 m | 143.72 | 143.64 (-0.1%) | 145.30 (+1.1%) |
| Top speed, 9,144 m | 136.79 | 136.30 (-0.4%) | 137.51 (+0.5%) |
| Climb, SL | 13.97 | 17.50 (+25.3%) | 16.66 (+19.3%) |
| Clean stall | 34.87 | 35.75 (+2.5%) | 35.77 (+2.6%) |
| Full-flap stall | 30.85 | 31.39 (+1.8%) | 31.39 (+1.7%) |

What the probe shows:

- **The whole speed-by-altitude profile fits within 3.6% on the first try.**
  The power curve used was [0, 1], [4877, 1], [6096, 0.87], [7620, 0.72],
  [9144, 0.58], [11700, 0.40].
- **Climb over-reads, as it does on the F6F.** The F6F is +16.77% at a 25%
  tolerance. This is the model's known bias and not a Zero problem. The plan
  tunes within it and does not widen the tolerance.
- **Stall and flap stall are already close.**

### 4.3 The cards: `tests/sim/testcards/a6m.test.ts`

These are modeled on `f6f.test.ts`, with its rule: tolerances start wide and
only ever tighten. The tolerances below are starting points. The plan sets
each one from its own measurement, with the measurement written into the card
the way `f6f.test.ts` does.

1. Top speed at critical altitude: 15%. The probe landed within 1%.
2. Speed-by-altitude profile at six altitudes: 5% each. The probe's worst was
   3.6%.
3. Sea-level climb: 25%, same as the F6F.
4. Climb at altitude: the three graded points at 30%, plus a monotonic
   direction check.
5. Clean and full-flap stall: 20% each, same as the F6F. The CLmax ratio is
   checked against 1.2779 to one decimal place.
6. Roll rate at the reference speed: grades the estimate against itself, as
   the F6F's card does.
7. **Matchup cards:** the data-driven promise of master spec §5 made into
   assertions. Measured on the two content files together:
   - The F6F is faster than the Zero at every altitude in the Zero's table.
   - The Zero stalls slower, clean and with flaps.
   - The Zero's take-off roll is shorter.
   - At 150 m/s EAS the F6F out-rolls the Zero, but at 90 m/s it does not.
     This card exists only if Open item 2 is accepted.
8. **The F6F's golden trajectory and every F6F card are bit-identical.** Every
   new field is optional, so the existing tests prove this unchanged.

### 4.4 The Zero's two tactical facts (Open item 2)

The 1942 Eglin conclusions are blunt. "In developing tactics against the Zero,
cognizance should be taken of two facts: 1. Slow rate of roll of the Zero at
high speeds. 2. Inability of the Zero engine to continue operating under
negative acceleration." Summary 85 adds that above 300 mph IAS "it is
virtually impossible to reverse a turn".

Today's model cannot express either fact:

- `rateAuthority` stays at 1 at any speed above the reference speed (§2).
- Thrust has no load-factor term.

Without them, a Zero is only a lighter, slower Hellcat, and the matchup §5
promises ("turnfighting versus boom-and-zoom") half-emerges at best. Both
terms are generic content fields with no per-aircraft code, and any aircraft
may set them:

- **`rates.controlFadeByEasMps`** (optional): piecewise-linear
  `[[easMps, fraction], ...]`, multiplying the pilot's commanded roll, pitch
  and yaw rates (not the weathercock term). EAS comes from the dynamic
  pressure that `ratesFromDynamicPressure` already has, so it is indicated
  airspeed in effect, which is what the sources quote. Starting anchors for
  the Zero:
  - fraction 1.0 up to 250 mph IAS (111.76 m/s). ENG-47-1673-A says "the rate
    of roll at speeds under 250 M.P.H. is quite rapid".
  - falling to about 0.35 at 300 mph (134.11 m/s), where both reports describe
    two-handed rolls and turns that cannot be reversed.
  - with a floor of about 0.2 beyond that.

  The anchors are sourced. The fractions are estimates, labeled as such in
  `source`.
- **`engine.negativeGCutout`** (optional, boolean): while the wing's lift is
  negative, thrust is zero. This is the float carburetor. It is stateless on
  purpose: no new `AircraftState` field, so no state migration and no
  golden-trajectory churn. The real engine sputtered and recovered over about
  a second. A timer would model that but needs state, and it can be added
  later if Mark feels the difference.

Absent fields leave the F6F bit-identical (§4.3 item 8). Lane A's AI flies
through the same `commandedBodyRates`, so an AI Zero is hampered at speed
exactly as a player would be, and no AI change is needed.

## 5. Armament and damage (Open item 3)

The A6M2 carries two synchronized Type 97 7.7 mm machine guns in the cowl
with **500 rounds each**, and two Type 99-1 20 mm cannon in the wings with
**60 rounds each** (AAF memo; Summary 85 agrees). Rates of fire and muzzle
velocities are secondary figures for the plan to source: about 900 rpm and
about 745 m/s for the 7.7 mm, about 490 rpm and about 600 m/s for the 20 mm.

The current schema has one gun type per aircraft, and a hit's damage comes
from the target (§2). So the Zero cannot be expressed honestly: averaging the
guns gives a Zero with either 1,000 cannon rounds or 120 rounds of
rifle-caliber fire.

**The design** keeps the F6F exactly as it is:

- Optional `combat.gunTypes: Record<id, { roundsPerMinute, muzzleVelocityMps,
  dragPerM, hitScale }>`, and an optional `guns[].type`. A mount with no type
  uses the top-level fields, so the F6F's content does not change.
- `hitScale` multiplies the **target's** `damagePerHit` for that round. A
  round carries its type's `hitScale` from firing to impact.
- Starting values, labeled as gameplay estimates: 7.7 mm about 0.4, and 20 mm
  about 3.0. The 20 mm figure means a Hellcat's 12 lethal .50 hits become
  about 4 cannon hits, which is the difference Mark should feel.
- The top-level `muzzleVelocityMps` stays as the aircraft's **primary**
  ballistic, which is what Lane A's `pursuit.ts` lead gate already reads. The
  Zero sets it to the 7.7 mm's. **So no AI file changes.**
- The ammunition readout sums rounds across guns and keeps working.

**Survivability**, from the same sources ("no armor, bullet proof glass,
bullet proof fuel tanks"):

- `structureHp` and `subsystemHp` below the F6F's, with a higher
  `fuelLeakKgPerS`.
- These are estimates, but their *direction* is sourced, and a card asserts
  it: an identical burst of .50 fire kills a Zero in fewer hits than an F6F.

**Mounts and hit zones** follow the F6F's layout, with every position taken
from the built LOD0 geometry: cowl-gun and wing-cannon positions, and zone
boxes scaled to the Zero's 12.0 m span. Both cowl guns map to the
`leftGuns`/`rightGuns` groups by side, because the subsystem enum has no
fuselage group and adding one is not worth it.

If Mark says no to gun types, the fallback is four mounts of the 7.7 mm
ballistic. The Zero is then too weak, and its content says so.

## 6. The model pipeline (the interface Lane C designs against)

### 6.1 Shape

There is **one JSON file per shipped model**, under `tools/models/entries/`.
Lanes then never edit the same file: Lane C's ships add files beside the
Zero's.

- A Zod schema, `ModelEntrySchema` in `tools/models/manifest.ts`, validates
  every entry.
- `npm run models:build -- <id>` builds one model.
- With no id it builds every entry whose raw input exists locally, and names
  every entry it skipped. Raw inputs are gitignored, so a fresh clone has
  none.
- `npm run models:inspect -- <file.glb>` prints the node tree with
  per-node triangle counts, materials, texture sizes, animations, and the
  bounding box **in source units**. Z3 Task 1 and Lane C's first task use it.

```jsonc
// tools/models/entries/a6m2-zero.json
{
  "id": "a6m2-zero",                                   // unique; the output basename
  "input": "tools/models/cache/a6m2-zeke.glb",         // raw download, gitignored by /tools/**/cache/
  "output": "content/aircraft/a6m2-zero.glb",          // committed; aircraft -> content/aircraft/, ships -> content/ships/
  "source": {                                          // must match an ASSETS.md row (a test checks this)
    "url": "https://sketchfab.com/3d-models/...-d701787b75fa4c979792b0c0c14221e2",
    "uid": "d701787b75fa4c979792b0c0c14221e2",
    "author": "SavinienBerault",
    "license": "CC-BY-4.0"
  },
  // ALL coordinates below are in the INPUT's own units and axes, i.e. what
  // models:inspect prints. One rule, so nobody converts by hand.
  "normalize": {                       // baked into the output; runtime applies no basis or scale fix
    "forward": "+x",                   // source axis at the nose or bow; becomes +X (sim body frame)
    "up": "+y",                        // becomes +Y; +Z (right) follows, right-handed
    "origin": [<cg x>, 129.2, -6.3],   // becomes (0,0,0): aircraft = CG on the thrust line, ships = waterline midships
    "fit": { "extent": "span", "meters": 12.0 }   // "span" = extent across (Z out), "length" = along X out
  },
  "keep": [                            // nodes that must exist and survive un-joined; optional re-pivot
    { "node": "Rotor", "as": "Prop",  "pivot": { "point": [283, 129.2, -6.3],  "axis": "+x" } },
    { "node": "Leg d", "as": "GearR", "pivot": { "point": [168.5, 87.8, 101.5],  "axis": "+x" } },
    { "node": "Leg g", "as": "GearL", "pivot": { "point": [168.5, 87.8, -113.1], "axis": "+x" } }
  ],
  "split": [                           // optional: carve geometry into a new named node
    { "name": "Tailwheel", "select": "components", "boxMin": [..], "boxMax": [..], "pivot": { "point": [..], "axis": "+z" } },
    { "name": "DropTank",  "select": "triangles",  "boxMin": [..], "boxMax": [..] }
  ],
  "remove": ["DropTank"],              // nodes or split names dropped from the output
  "simplify": { "ratio": 0.5, "error": 0.001,     // omitted = geometry untouched
                "perNode": { "Verriere": 0.2, "Rotor": 0.3 } },
  "textures": { "maxSize": 1024, "format": "webp" },
  "opaque": true,                      // default true: every material forced OPAQUE (the Wildcat hull fix)
  "budget": { "maxBytes": 5600000, "maxTriangles": 100000, "maxDrawCalls": 12 },
  "noseNode": "Prop"                   // optional: a test asserts this node's center is the max-X point
}
```

### 6.2 Stages, in order

Every stage is a function from a glTF-Transform `Document` to a `Document`,
unit-tested on small synthetic documents built in the test itself. No test
reads a gitignored raw file.

1. `remove`
2. `split`: `select: "components"` (the default) takes whole connected
   components after a weld, so CAD shells come out whole. `select:
   "triangles"` takes individual triangles inside the box, which is the
   drop-tank cut in §3.2
3. `pivot`: move each kept or split node's origin onto its stated pivot point
   and axis, compensating its children, so no vertex moves in world space
4. `normalize`: wrap the scene roots in a node carrying the translation,
   rotation and uniform scale, then flatten that one transform in, keeping
   inner node names
5. `join`: everything **except** `keep` and `split` nodes, grouped by
   material, so draw calls come to roughly materials + kept parts
6. `simplify`: meshoptimizer, geometry only, with optional per-node ratios
7. texture resize and WebP
8. `opaque`
9. write, then check the budget. **Over budget fails the build**, with the
   measured numbers in the message.

**Load-bearing constraint, carried over from `build.ts`'s header: no
`EXT_meshopt_compression`, and no Draco.** This project has no decoder wired
into `GLTFLoader`, and the Wildcat's first build was unloadable at runtime for
exactly this reason (`20bcaa4`). The pipeline never calls a compression stage,
and the output test asserts `extensionsRequired` holds nothing but
`EXT_texture_webp`.

It uses the **glTF-Transform scripting API** instead of the CLI, because
`optimize` cannot say "join everything except these nodes" (§2). The new
devDependencies are all tooling only, never shipped, and AGPL-compatible:

- `@gltf-transform/core`, `/functions` and `/extensions` (MIT)
- `meshoptimizer` (MIT)
- `sharp`, which the CLI already pulls in (Apache-2.0)

**Installing them touches the shared `node_modules`,** which is symlinked
into every worktree. Z1 Task 1 installs them from `main` in coordination with
whichever session is active there, and never from inside a worktree.

### 6.3 The Wildcat entry

`tools/models/entries/wildcat.json` records the Wildcat:

- no `normalize`, because `wildcat.ts` keeps its measured rotation and scale
  constants
- `keep` = `Helice`, `GRP_Rueda_Der`, `GRP_Rueda_Izq`
- the Wildcat's budget

**`wildcat.glb` is not rebuilt.** Its committed bytes stay the same, and the
dist test's 5,573,316-byte pin still guards them. The entry exists so that a
future rebuild goes through the same path. The per-entry output tests
(budget, keep nodes present, no meshopt, no BLEND, one animation for the
Wildcat) run against the committed file today. `buildWildcatModel`'s
hard-wired paths are deleted. `forceOpaqueMaterials` becomes the `opaque`
stage.

### 6.4 The candidate leak

`copyContent()` gains a filter for `content/models/`, and
`tests/build/dist.test.ts` asserts that `dist/content/models` does not
exist. Committed outputs go to `content/aircraft/` and `content/ships/`, as
the Wildcat's always has, so `.gitignore`'s `/content/models/` line stays
exactly as it is.

## 7. Runtime

### 7.1 Model cache: `src/render/models/modelCache.ts`

```ts
export interface ModelInstance {
  readonly root: Object3D                 // a per-instance clone; posing it is the caller's job
  node(name: string): Object3D            // throws, naming the model and node, if absent
  release(): void                         // idempotent; the last release of a URL disposes it on the GPU
}
export function acquireModel(url: string): Promise<ModelInstance>
```

- **One parse per URL.** Every instance clones the scene graph, and all
  instances share geometry, materials and textures. This ends §2's
  per-instance texture duplication.
- **Reference-counted disposal replaces `disposeMeshTree` for loaded
  models.** Procedural hulls keep `disposeMeshTree`. Without reference
  counting, disposing one Zero would free textures that the other Zeros are
  still drawing.
- **Rule: instances never mutate a shared material.** A test asserts that two
  instances' materials are `===`. Today nothing mutates them (`hitFlash.ts`
  uses its own quads).
- The parse function is injectable, so Node tests use a synthetic `Group` and
  never run `GLTFLoader`, the same principle as `scenarioEntities.test.ts`'s
  `stubAirframe`.
- **Lane C uses `acquireModel` for ship glTFs.**

### 7.2 Per-aircraft model selection

The aircraft schema gets **`view.model: string`**, a render-only field in the
block that already exists for render-only data. It is required, and
`.strict()` keeps typos loud.

| Content file | `view.model` | Why |
| --- | --- | --- |
| `f6f-hellcat.json` | `"wildcat"` | This is today's behavior, stated honestly |
| `f4f-wildcat.json` | `"wildcat"` | |
| `a6m2-zero.json` | `"a6m2-zero"` | |

How selection works:

- `src/render/scene/airframes.ts` is the registry:
  `Record<modelId, () => Promise<Airframe>>`.
- `buildScenarioEntities` loads `airframeFor(spec.view.model)` per aircraft,
  and only for the models the scenario actually names. **Free-flight never
  fetches the Zero.**
- A test asserts that every `content/aircraft/*.json` names a registered
  model.

### 7.3 The `Airframe` interface and animated parts

```ts
export interface Airframe {
  readonly root: Object3D
  setStores(bombsLeft: number, rocketsLeft: number): void
  /** One call per frame, per aircraft (today only the player's prop turns). */
  update(u: {
    gearFraction: number; flapFraction: number; throttle: number
    controls: { roll: number; pitch: number; yaw: number }   // for control surfaces, where they exist
    frameS: number; cameraDistanceM: number                   // prop angle and LOD
  }): void
  dispose(): void                                             // releases its ModelInstances
}
```

`update` replaces `spinProp` and `setGear`, so `main.ts` changes in exactly
one place: the per-aircraft loop that already calls `setGear`. **Every**
aircraft's propeller now spins with its own throttle. The Wildcat implements
`update` with its existing gear poses and a no-op for flaps. Its visible
behavior is otherwise unchanged, except that AI Wildcats' propellers now
turn.

The Zero's parts:

| Part | Motion | Source |
| --- | --- | --- |
| Propeller (`Prop` ← `Rotor`) | Rotates about body +X through the re-pivoted hub, at a rate from throttle, like the player's today | Same rate constant `main.ts` uses today. Pivot measured (§2) |
| Main gear (`GearR` / `GearL` ← `Leg d` / `Leg g`) | Rotates **90° inboard** about a fore-aft (X) hinge at each leg's measured top: the right leg toward -Z, the left toward +Z | Summary 85: "retracts 90° inward to the line of flight". Hinges at (168.5, 87.8, +101.5) and (168.5, 87.8, -113.1) in source units |
| Leg-top fittings, wheel-well doors | **Static**, part of the body. The two small islands at the leg tops stay with `Corps` | Inspection: no separate door part exists |
| Tailwheel (split island) | Retracts forward and up, about a lateral (Z) axis at its top, into the tail cone | Summary 85: "fully retractable". The angle is an estimate, labeled as one |
| Split flaps | **Static**: fused into the wing shell (§3.2). `update` ignores `flapFraction` for this model, exactly as the Wildcat's does | — |
| Control surfaces | **Static**: fused (§3.2) | — |

Pure pose functions (`gearPose(fraction)`, `flapAngle(fraction)`,
`propAngle(prev, throttle, dt)`) carry the tests. The module is only
plumbing, as `wildcat.ts`'s `applyGearFraction` is today.

### 7.4 LOD: #6 near, #1 far

The Zero airframe acquires both `a6m2-zero.glb` and `a6m2-zero-lod1.glb`
through the cache and shows one of them at a time.

- **Switching** is a pure function `pickLod(distanceM, current, bands)` with
  hysteresis. It starts at LOD0→LOD1 at 600 m and LOD1→LOD0 at 500 m,
  because a camera sitting at the boundary must not flicker. The pure
  function is explicit and testable, where `THREE.LOD` is implicit. At
  1440p and a 60° vertical field of view, a 12 m span covers about 14,965/d
  pixels, so 600 m is about 25 px.
- **The switch distance is set by the swap test below, not by this
  paragraph:** the smallest distance at which the test passes.
- **LOD1 build.** Candidate #1 goes through the same pipeline with its own
  entry:
  - `normalize` with `forward: "-x"`, `up: "+y"`, `fit` span 12.0 m. These
    are the axes §2 measured.
  - 512² WebP textures.
  - Budget: 2,000 triangles, 1 draw call, 150 KB.
  - Its build test asserts that the normalized span is within 1% of LOD0's,
    and that the highest vertex (the fin tip) lies aft of center. That is a
    mechanical nose-orientation check for a model with no separate nodes.
  - A second `ASSETS.md` row credits Mamoru_Morimoto.
- **The swap test** is Tier 2, in `tests/e2e/zero.spec.ts`. A diagnostic hook
  `__ww2.forceAirframeLod(id, 0 | 1 | null)` renders the same Zero, at the
  same pose and at the switch distance, once per LOD. Against a frame with no
  aircraft, it measures the aircraft's pixel mask and asserts:
  - mask area within ±20% between the LODs (silhouette)
  - mean linear RGB inside the mask within a stated ΔE (tone)
- **If tone fails,** the fix is a per-entry `tint` multiplier on LOD1's base
  color, fitted once and recorded in its manifest entry. The fix is never to
  push the switch distance out until the difference disappears.
- **Tier 1** covers `pickLod`'s hysteresis and boundaries, and that a gear-down
  Zero past the band still selects LOD1. A LOD1 Zero shows no gear, and that
  is accepted (§3.3).
- **At Asset Quality `low`, LOD0 still loads** (Open item 5).

## 8. Budgets

| | LOD0 (#6) | LOD1 (#1) | Wildcat today |
| --- | --- | --- | --- |
| Triangles | ≤ 100,000 | ≤ 2,000 | 100,886 |
| Draw calls | ≤ 12 (measured: 6 meshes, 5 materials, plus tailwheel) | 1 | 47 |
| Textures | ≤ 11 at ≤ 1024² | 1 at ≤ 512² | 26 at 1024² |
| File | ≤ 5.6 MB | ≤ 150 KB | 5.57 MB |
| VRAM | ~80 MiB, **once** per page (shared) | < 2 MiB | ~139 MiB **per instance** today |

- **Download.** The Zero adds at most about 5.75 MB, fetched only by scenarios
  that name it. The title screen and free-flight fetch nothing new.
- **Many aircraft on screen.** Eight Zeros cost one set of textures. Their
  triangles cost at most 800k when all are inside 500 m, which is rare, and
  about 9k when all are far. Critique #8 measured a GPU p95 of 3.055 ms
  against a 16.67 ms frame, so the Tier 2 budget spec in Z3 checks the
  6.0 ms p95 with a LOD0 Zero in view rather than assuming it.
- **All budgets are build-time assertions** (§6.2 stage 9) and per-entry
  output tests, not prose.

## 9. Scenario: the Zero as a hostile (Open item 4)

The new scenario is `content/scenarios/zero-range.json`: `pursuit-range` with
the pursuer's `spec` set to `a6m2-zero`. Player and pursuer keep the same
spawn geometry and skill. It gets one new title-screen entry, "Air Combat:
Zero". `pursuit-range` ("Air Combat") is left as it is. The reasons:

- `pursuit-range` is Lane A's tuning fixture. `src/sim/ai/pilot.ts`'s skill
  constants were measured on it, and `ai-maneuver.spec.ts`, `radar.spec.ts`
  and `meta-game.spec.ts` all load it.
- A Zero out-turns a Hellcat at `veteran` skill, which changes the balance
  those measurements describe.
- Flipping it would re-open 7d's difficulty tuning inside a plan about
  airframes.

Other effects:

- **Scoring needs nothing.** `role: "fighter"` scores 500 per kill (§2).
- **"Hostile"** today means an AI pilot whose target is the player. When
  Lane A's team work lands, its schema migration adds a team to every
  scenario, this one included. This scenario does not invent a team field
  ahead of that.
- `tests/build/dist.test.ts`'s list of shipped scenarios gains
  `zero-range.json`.
- GAMEPLAY.md's "Shipped today" sentence gains the scenario.

## 10. Ownership and cross-lane dependencies

| Area | Owner | Notes |
| --- | --- | --- |
| `tools/models/**` (`build.ts`, `manifest.ts`, `inspect.ts`, the stages, `entries/wildcat.json`, `entries/a6m2-zero*.json`) | **this lane** | Lane C **adds** `entries/<ship>.json` files and edits nothing else here. A missing capability, such as a stage a ship needs, is requested from this lane or added in a Lane C task *after* Z1 merges, with this spec's interface unchanged |
| `src/render/models/**` (`modelCache.ts`, `lod.ts`) | **this lane** | Lane C consumes both |
| `src/render/scene/airframe.ts`, `airframes.ts`, `wildcat.ts`, `zero.ts`, `stores.ts` | this lane | |
| `src/render/scenarioEntities.ts` | **shared** | This lane changes the airframe half and the async/release pattern (Z1). Lane C changes the ship half **after Z1 merges** |
| `src/render/main.ts` | **shared, hot** | This lane touches only the per-aircraft loop (the `setGear` loop and the player `spinProp` line). Re-diff against `HEAD` before each commit |
| `src/sim/flight/schema.ts`, `model.ts`, and the thrust term in `step` | this lane (Z2) | Lane A may add fields, for example an `aiHint`. The additions are separate optional keys, so any conflict is textual |
| `src/sim/weapons/schema.ts`, `combat.ts`, `src/sim/damage/model.ts` | this lane (Z2, gun types) | Lane A's teams may touch kill credit in `combat.ts`. That is textual overlap only; the gun-type change is confined to firing and `damageFromHit` |
| `src/sim/ai/**`, `pursuit-range.json`, the scenario schema (teams, formations) | **Lane A** | This lane edits none of it. `pursuit.ts` keeps reading the top-level `muzzleVelocityMps` (§5) |
| `content/ships/*.glb`, ship render modules, the ship JSON model field | **Lane C** | Recommended pattern: the same `render/view.model` id-to-registry approach as §7.2 |
| Render pipeline, lighting, exposure, materials policy, clouds, sky, ocean, the quality probe | **photoreal session** | See the note below |
| `content/aircraft/a6m2-zero.*`, `content/scenarios/zero-range.json`, `tests/sim/testcards/a6m.test.ts`, `tests/e2e/zero.spec.ts`, `vite.config.ts`'s `copyContent` filter, the `ASSETS.md` rows | this lane | |

Dependencies:

- **Lane C depends on Z1** (the pipeline, `acquireModel`, the async
  `scenarioEntities`). Z1 is deliberately the first sub-plan and ships
  nothing Zero-specific, so Lane C is unblocked as soon as it merges.
- **Lane A benefits from Z2.** A graded `a6m2-zero.json` is exactly what a
  turnfight-versus-boom-and-zoom matchup harness needs. Z2 is headless and can
  run in parallel with Z1.
- **Photoreal Task 12** re-lights lit materials under the new exposure, and
  warns that "a metal material under a hemisphere light with no environment
  map renders near black". #6 is a PBR model with metal-roughness textures,
  so it is exposed to exactly that. `zero.ts` sets **no** material parameters
  of its own. If Task 12 introduces an aircraft material policy (for example
  a shared function the Wildcat's materials go through), `zero.ts` calls the
  same function. Z3's Tier 2 tasks run **after** photoreal's Phase D gate, or
  on the `ww2airsim-2` slot by arrangement, so that neither session skews the
  other's GPU timings. Z3 adds one luminance assertion: the Zero's
  mean in-mask luminance must fall within [0.5×, 1.5×] of the Wildcat's in the
  same frame. That is photoreal Task 12's deck check, applied to aircraft.

## 11. Decomposition: three sub-plans

Each sub-plan is executable by a subagent in its own worktree, ends with
`npm run verify` returning `rc=0` (captured directly, never through a grep),
and ends with a dated handoff, its §15 row and a README pointer.

**Inputs for Z3 (no gate):** #6 is already downloaded, and
`tools/models/sketchfab-fetch.sh <uid> <name>` (on `main` as `86d38e9`)
re-fetches it if needed. Z3 Task 1 copies it and #1 from
`content/models/candidates/` into `tools/models/cache/`, as
`a6m2-zeke.glb` and `a6m3-zero-lowpoly.glb`, the raw location the entries
name. The candidates folder stays a staging area, not a build input.

### Z1: model pipeline and runtime foundation (about 8 tasks, no new asset)

1. DevDependencies (§6.2, installed from `main`), `ModelEntrySchema`,
   `models:inspect` (tested on a synthetic document).
2. The stages (`remove`, `split`, `normalize`, `join`, `simplify`, textures,
   `opaque`), each unit-tested on synthetic documents, plus the budget check.
3. The `models:build` driver and `entries/wildcat.json`. Delete the
   hard-wired `buildWildcatModel`. Per-entry output tests run against the
   committed `wildcat.glb`, whose bytes are unchanged.
4. The `copyContent` filter and the dist-test assertion (§6.4).
5. `acquireModel` with reference-counted disposal and shared-material
   identity tests.
6. `wildcat.ts` onto `acquireModel`, and the `Airframe.update`/`dispose`
   interface (§7.3). The `main.ts` loop is changed once. AI propellers spin.
7. `view.model`: schema, content (`wildcat` on both existing files), the
   registry, per-spec selection in `scenarioEntities`, and the
   registry-coverage test.
8. Tier 2: re-run `wildcat.spec.ts` and `entities.spec.ts` on the reference
   GPU. Write the handoff, and name the Lane C interface in it.

### Z2: Zero flight model and armament (about 8 tasks, headless)

1. Optional schema fields: `reference.takeoffDistanceM` optional,
   `topSpeedByAltitudeM`, `climbRateByAltitudeM`. F6F unchanged.
2. `a6m2-zero.json` with a `source` string in the F6F's style, and the
   baseline from §4.2's probe. Cards 1 to 6 are graded and tuned, with
   measurements recorded in the cards. `view.model` is set to `"a6m2-zero"`,
   and Z1's registry task adds the entry. If Z2 merges first, it sets
   `"wildcat"` and Z3 flips it.
3. `rates.controlFadeByEasMps` in `ratesFromDynamicPressure` and its cards.
   The F6F golden trajectory is bit-identical. This task exists only if Open
   item 2 is accepted.
4. `engine.negativeGCutout` in the thrust term and its cards. Open item 2
   applies here too.
5. `combat.gunTypes`, `guns[].type`, per-round `hitScale`, and the F6F
   bit-identity check. Open item 3.
6. The Zero's `combat` block: armament, survivability, mounts and zones.
   Positions are estimates until Z3 measures them.
7. Matchup cards (§4.3 item 7).
8. Handoff.

### Z3: the Zero on screen (about 10 tasks, depends on Z1)

1. Copy the raw inputs (see above). Re-run `models:inspect` and confirm
   §2's 2026-09-25 numbers, since a re-fetch could differ. Fit the tailwheel
   and drop-tank boxes, and settle the CG `origin` x. Record everything in
   the plan's progress ledger.
2. `entries/a6m2-zero.json`: build, output tests (budget, parts present, prop
   at max X, prop 120° self-symmetry about its pivot, legs fold above the
   wing's lower surface, span 12.0 m ± 1 mm, no BLEND, no meshopt), the
   drop-tank cut accepted or reverted per §3.2, and the `ASSETS.md` row.
3. `entries/a6m2-zero-lod1.json`: #1 built the same way, its tests (§7.4),
   and the `ASSETS.md` row.
4. Measure `gear.heightM`, `view.eyePointM`, gun mounts and zones from LOD0.
   Update the content, and re-run the take-off and matchup cards in the same
   commit.
5. `zero.ts`: pure pose functions with their tests (prop, gear at 90°
   inboard about the measured hinges, tailwheel; flaps and control surfaces
   static), then the module plumbing.
6. `pickLod`, with Tier 1 tests.
7. `zero-range.json`, the title entry, and the dist list.
8. Diagnostics: `airframeInfo(id)` returning `{ model, lod, gearFraction }`,
   and `forceAirframeLod`.
9. Tier 2, `zero.spec.ts`:
   - the Zero loads and renders, LOD0 near and LOD1 far
   - the swap silhouette and tone assertions (§7.4)
   - the luminance check against the Wildcat (§10)
   - no page or console errors
   - GPU p95 under 6.0 ms at 1440p with LOD0 in view
10. Handoff, the §15 row, README, and GAMEPLAY.md's shipped list.

## 12. Risks

- **Static flaps.** Inspection settled this: the flaps are fused into the
  wing skin, so critique #7 is met for the gear but not for the flaps. It is
  recorded in the handoff, not hidden.
- **The drop-tank cut leaves a hole.** Then the tank stays (§3.2).
- **Simplify at 0.5 damages the CAD silhouette.** The budget allows 100k
  triangles, but the build can keep more. The budget is Wildcat parity, not a
  physical limit, and the stated fallback is to raise the budget with a
  measured Tier 2 p95, not to accept a damaged silhouette.
- **Climb stays well over the reference** because of the model's known bias.
  It passes at the same 25% as the F6F. If it does not, the plan reports the
  card red with numbers, as the F6F's history did, and does not widen the
  tolerance.
- **Merge overlap in `main.ts` and `scenarioEntities.ts`** with Lane C and the
  photoreal session. §10 bounds the region each lane may touch, and every
  commit on `main` re-diffs against `HEAD`.

## Open for Mark

1. **Which Zero flies: an A6M2 or an A6M5?** The mesh is an A6M2, and the best
   US primary data (the Akutan Zero, 1942) is for the A6M2. But by October
   1944 at Leyte the A6M5 was the front-line variant: faster, and with
   heavier armament. *Recommendation:* fly A6M2 numbers now, so that the
   airplane matches what is on screen. Add an A6M5 later as its own content
   file, since TAIC 38 and PTR-1111 exist on the same site, once there is an
   A6M5 mesh to match it.
2. **Amend master spec §5 with two data-driven terms:** controls that fade
   with airspeed, and an engine that cuts out under negative g (§4.4). They
   are the two "facts" the 1942 report tells pilots to fight the Zero by, and
   today's rate law cannot express them. Both are optional fields, so no
   existing airplane changes. *Recommendation:* yes. Without them the Zero is
   only a lighter, slower Hellcat, and the high-speed escape Hellcat pilots
   used does not exist.
3. **Per-gun ballistics:** two 20 mm cannon with 60 rounds each, and two
   7.7 mm guns with 500 rounds each, with a per-round damage scale (§5). The
   alternative is one averaged gun type. *Recommendation:* per-gun types.
   They are a contained sim change with the F6F bit-identical, and the 20 mm
   is the Zero's whole threat.
4. **Where the Zero first appears.** Option A: a new "Air Combat: Zero"
   scenario, leaving "Air Combat" (`pursuit-range`) as it is. Option B: flip
   "Air Combat"'s pursuer to a Zero. *Recommendation:* A now. B re-opens the
   7d difficulty tuning that Lane A measured on `pursuit-range`, and belongs
   after Lane A's 7c lands.
5. **Should Asset Quality `low` skip LOD0**, which would save 5.6 MB by
   showing #1 at every distance? *Recommendation:* no. `low` is the
   first-visit default until terrain textures load on demand, so skipping
   LOD0 would make the low-poly Zero what most people see up close, which
   defeats the reason #6 was chosen. #1 stays a distance LOD only.
