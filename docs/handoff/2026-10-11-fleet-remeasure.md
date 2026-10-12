# Fleet re-measure: five fighter duplicates and the M4 Sherman

Date: 2026-10-11 · Run unattended, one worktree per model, merged through `integrate-fleet-remeasure`.

This follows the B-17 and Val re-measure (`2026-10-11-b17-val-remeasure.md`). Mark asked for every other
plane the Blender duplicate effort had built to be redone, and for the tank to be re-rendered. The ships were
left alone.

## Decision for Mark

The duplicates now match their drawings. On four of the five fighters, they still stand on the flight spec's
gear, which was fitted to the downloads, not the real airplanes. The model keeps the spec stance, because the
duplicates are display-only until promoted; the mismatch shows in the Hangar as legs or tails that look off.

| Aircraft | Spec vs drawing |
| --- | --- |
| F4F Wildcat | mains 2 ft 1 in lower than drawn (visibly long legs); guns ~2 ft 4 in below the drawn wing |
| F4U Corsair | tailwheel 1 ft 2 in lower than drawn (10.3° stance vs drawn 12.5°); guns 1–3 ft outboard of the drawn ports |
| F6F Hellcat | tailwheel 9 in lower than drawn (9.5° vs 11.8°); guns 1–3 ft outboard of the drawn ports |
| A6M2 Zero | mains 9 in and tailwheel 1 ft 1 in aft of the drawn ones |
| Ki-43 | within 2 in |

Re-fitting a spec (`gear.heightM`, `thirdX`/`thirdHeightM`, gun positions, `view.eyePointM`) to the drawing is
the promotion step in `docs/blender-aircraft.md`. It changes how each plane sits, takes off and aims, so it waits
for Mark.

## What the first passes got wrong

Every model had misreadings beyond a cosmetic flaw. These are the largest; full tables are in each script's
header.

| Model | Largest first-pass errors |
| --- | --- |
| A6M2 Zero | top view's scale read 7% small, so the origin, widths and planform were off; fin and tailplane straight trapezoids (tailplane span 13 ft 2 in vs 15 ft 3 in); square wingtips |
| Ki-43 Oscar | origin 4 in off; swept leading edge where the drawing's is square; no wing-root fillet; tailplane span 11 ft 4 in vs 14 ft 4 in; trapezoid fin |
| F6F Hellcat | wing 2.5° flat where the drawing shows a flat center section and 7.5° outer panels (tips 16 in low); tail cone 1 ft 2 in too shallow; glass carried over the turtledeck; roof twice too wide |
| F4U Corsair | inner gull panel 6.5° vs 21.5° (wing nearly flat); fin 2–3 ft too far aft; rear belly over a foot too high |
| F4F Wildcat | built as a low wing, 2 ft 4 in below the drawn mid wing; canopy copied from the download; fin, tailplane, turtle deck and prop all simplified |
| M4 Sherman | built of boxes; hull roof 1 ft low; tracks outside the hull instead of under the sponsons; six even wheels instead of three VVSS bogies; no sprocket or idler |

All models now share these features:

- traced fins with rounded crowns and straight rudder hinges (`kit.fin_outline`);
- rounded wing and tailplane tips (`kit.wing_outline`);
- canopies at the drawn station and height.

The calibration of each was cross-checked before any table was read:

- one scale for every view;
- the span lands on the cited span;
- the origin is the 30%-semispan quarter chord;
- that origin puts the spec's tailwheel at the drawn one.

## The Sherman

The Sherman was rebuilt from the "Medium Tank, M4" three-view in FM 30-40 (War Department, 1943, public
domain). At one scale it reproduces the cited 9 ft height, 8 ft 7 in width, 83 in track centers and 17.5 in
belly clearance, each within about an inch. The rebuild includes:

- a 56° glacis, composite cast nose, and full-width sponsons;
- the cast turret with M34A1 mantlet and 75 mm M3;
- three VVSS bogies a side, with a front sprocket, rear idler and belt tracks.

The .50 cal is stowed aft on its rear pintle. Mounted upright it would stand about a foot above the cited
9 ft. The model is 10,136 triangles, 3 draws.

## Evidence

Shots are in `2026-10-11-fleet-remeasure-shots/`, per model: `*-drawing-overlay.jpg` (filled mesh over the
drawing), `*-side.jpg`, and `*-three-quarter.jpg` (before and after, same camera).

| Model | Bytes / triangles / draws (budget) |
| --- | --- |
| a6m2-zero-blender | 1,133,876 / 38,574 / 18 (3 MB / 60k / 47) |
| ki-43-oscar-blender | 1,445,820 / 54,204 / 17 (3 MB / 60k / 47) |
| f6f-hellcat-blender | 1,277,592 / 43,734 / 14 (3 MB / 60k / 47) |
| f4u-corsair-blender | 1,372,088 / 48,902 / 14 (3 MB / 60k / 47) |
| f4f-wildcat-blender | 1,176,440 / 41,314 / 17 (3 MB / 60k / 47) |
| m4-sherman | 490,624 / 10,136 / 3 (1 MB / 20k / 8) |

Each model gained a drawing-based geometry test. Each test was run against the pre-repair GLB and failed,
then the new GLB was restored and confirmed byte-identical. Per-model runs on ryzen all passed, and
`kit.py` is unchanged. The merged tree passed `npm run verify` on ryzen; the exact result is in the merge
commit message.

Rig changes:

- **F4F gear:** now swings aft along the fuselage side (`retracts: 'aft'`). With the spec's long legs, the old
  inboard fold crossed the centerline.
- **F6F flaps:** split at the wing fold (`surfaces(2)`).
- **F4U flaps:** cover only the straight inner panel, off the gull bend.
- **Sherman:** keeps `Turret1` and `Gun1` with re-measured pivots.

## Still estimates or open

- **Shape estimates:** transverse sections, fin and tail thicknesses, and flap spans.
- **Pilot eyes:** placed where the drawings show no seat.
- **Ki-43:** a Ki-43-I drawing with labeled IIb overrides (cowl, span, canopy). Its yellow leading-edge ID
  patch is still a short patch, not a strip.
- **Sherman:** composite-hull rounding, headlamps and track detail.
- **Not checked in a browser:** no model was viewed in the Hangar; the renders are flat Cycles previews.
