# Handoff: C1 batch 2, control surfaces on the F6F, F4U and F4F (2026-10-08)

Plan: [`docs/superpowers/plans/2026-10-08-c1-surfaces-batch2.md`](../superpowers/plans/2026-10-08-c1-surfaces-batch2.md).
Branch `c1-surfaces-batch2`, worktree `../ww2airsim-c1-batch2`. Run unattended. **Not merged:** Mark looks first.

## What works

All three US fighters move their ailerons, elevators, rudder and flaps on the bench and in flight, under batch 1's rulings:
- visual only, with the 0.3 s slew;
- full travel: aileron ±20°, elevator and rudder ±25°, flap 0-45°;
- flaps from `flapFraction`.

## Checkpoint (Mark, when back)

- **Live:** `https://ww2airsim-2.windomlane.org/hangar.html?bench`, served from this worktree. Pick the F6F, F4U or F4F. The "Control surfaces" row has roll, pitch and yaw; the flaps row drives the flaps.
- **Captures:** [`2026-10-08-c1-surfaces-batch2-shots/`](2026-10-08-c1-surfaces-batch2-shots/), three per airframe: roll right from the front, pitch up with yaw right in three-quarter, and flaps down from the side.
- **The F4F's ailerons are now on the outer wing** (Mark's ruling, below).

## How

### F6F and F4U: surfaces cut out of the download

- **The problem:** neither model separates a surface, and their wing and tail skins are long triangles running leading edge to trailing edge, with no edge at any hinge. A `split` box, which takes whole triangles, cannot isolate a surface (wireframes, 2026-10-08).
- **The `cut` (`tools/models/stages/split.ts`):** a `split` rule can carry a `cut`, a plane through its `pivot.point`. Triangles the box touches are sliced by the box's faces and by that plane, with every float attribute interpolated and crossing edges shared. Only the slices behind the plane are taken. So a surface and the panel it leaves meet exactly, with nothing ragged. A unit test slices a box whose faces are single quads: it keeps the area to 1e-9 and puts no vertex on the wrong side.
- **Vector hinge axis:** `pivot.axis` now takes a unit vector as well as `±x/y/z` (`manifest.ts`).
- **Hinges (ESTIMATE):** neither model draws one. Each was placed from true sections of the skin (triangles cut at a station, not vertices), at a fraction of the local chord from the trailing edge:
  - 0.25 for ailerons and flaps;
  - 0.40 for elevators;
  - 0.35 for rudders.

  The spanwise ends are rounded estimates of the real layout. The port side mirrors the starboard about the model's centerline.
- **F4U's gull wing:** a single straight hinge cannot follow its kink, so the flaps are two panels per side, `Flap1` from z 0.45 to 1.15 (inner) and `Flap2` from 1.3 to 2.35 (outer).
- **F6F flap root:** the flaps start at z 1.9, not 1.75. At 1.75 they took 15-16 fuselage-fillet triangles, and the extra primitive put the model at 48 draws.
- **Flap type:** all flaps here are plain flaps hinged in the skin. A real split flap is only the lower skin, which a shell model cannot separate.
- **Caps:** the cut closes what it opens. See "Review" below.

### F4F: the model's own surface nodes, and split flaps drawn in code

- **Turning in place:** `wildcat.glb` stays frozen (its bytes are pinned in `dist.test.ts`). `wildcat.ts` turns `Aleron_*`, `Timon_Der`/`Timon_Izq` (elevators) and `Timon_Prof` (rudder) about each piece's own leading edge, measured from its vertices at load. They use the same orientation rule and the same `surfaceAngleRad` and slew as the rigs.
- **Split flaps (ESTIMATE):** one plate under each aileron, from its leading edge to its trailing edge, hinged at the front. Both plates are one mesh posed on the CPU, which costs one draw call. It is hidden while the flaps are up, where it would lie flush. The color is a plain light gray, since the model's texture has no region for it.
- **Budget:** the model was at exactly 47 of 47 draws. At load the three static hinge pins under `Pasadores` (`Tensor_MAT`, 64 triangles each) are merged into one mesh, two draws back. So with the flaps down it draws at most 47. A unit test holds that.

## Measured

| Model | Draws before | Draws after | Budget | Triangles before | Triangles after |
| --- | --- | --- | --- | --- | --- |
| F6F | 39 | 46 | 47 | 26,399 | 32,243 |
| F4U | 22 | 34 | 47 | 15,296 | 23,500 |
| F4F | 47 | at most 47 drawn (49 stored, see below) | 47 drawn, 49 stored | 100,886 | 102,498 |

- **F6F:** each surface is one primitive (+7).
- **F4U:** its elevators and rudder each span two materials (+12).
- **F4F:** the flaps add 1 draw and the pin merge removes 2.
- **Slicing and caps:** these add the triangles. Slicing now also runs along each plane through the whole skin it crosses, so a split edge is split on both sides and leaves no crack. Each opening gets a cap on both sides.

## Tests

- `aircraftRigs.test.ts`: the F6F and F4U are enrolled in the pinned list. Every surface passes the leading-edge and direction checks.
  - Seen red: flipping the F6F `AileronR` axis in its entry fails "trailing edge along y". The restored entry rebuilds to the same 1,604,632 bytes.
- `wildcat.test.ts`, the F4F on its real node graph (`_wildcatCache.ts`):
  - all five surfaces, hinge and direction, in the sim frame;
  - the flaps: hidden when up, trailing edges below the hinge when down;
  - the draw count at or under 47 with the flaps down.

  The leading-edge tolerance is 3% of the chord: the ailerons' leading edges bow 2.35% forward of their end-to-end hinge (measured 2026-10-08). Seen red: inverting the orientation rule fails all six.
- `geometryStages.test.ts`: the cut. `manifest.test.ts`: a vector axis is accepted; a non-unit axis, a cut without a pivot and a cut on `components` are rejected.
- `hangar.spec.ts` check 9: the F4F's gizmo list now includes its five surfaces. 19/19 passed on nexus's 680M.

## Results

Typecheck, lint and depcruise are clean. The full suite on ryzen (`remote-run npm test`) passed: 361 files, 4,610 tests, 10 named skips. After the review fix it passed again with 4,672 tests and 10 named skips, and the Hangar E2E passed 19/19 on nexus both times.

## Review: Mark, 2026-10-08, "the F6F flaps have no texture and look like a flat rectangle"

**Cause:** the cut left every piece, and the slot it came out of, open. There were no faces on the hinge plane or at the spanwise ends. The material is single-sided, so with a flap lowered you looked into the hollow wing and through it to the ground (the pale strips in the "before" captures), and the flap read as a paper-thin plate. The open edge on each surface's hinge face measured 1.7 m to 8.2 m.

**Ruled out, by measurement:**
- **UVs:** every one of the flap's 218 vertices lies on an original wing triangle with zero UV error.
- **Normals:** all unit length, and none opposes its triangle's winding beyond the download's own.
- **The wrong piece:** it is the flap, one material, `krilo_14`.

The texture was there all along. A flap lowered 45° faces away from the bench's overhead light, which makes it read darker than the wing.

**Fix** (`tools/models/stages/split.ts`, so the F4U and every later cut get it):
- Every opening the cut makes on its planes is capped, on both the piece and the body it leaves.
- Each cap is a flat face in the skin's paint: one texel, from one of its edge vertices. The edge vertices' own UVs lie in different parts of the atlas, and interpolating between them streaked the cap.
- Caps are built across every node the box touches. The F4U's tail skins are separate nodes, one material each, and capping per primitive made two slivers instead of one face.
- Chains join only along the box face they share, so an overlay skin can't pull a cap diagonally across the span.

Two cut-stage bugs turned up on the way:
- A box between rib stations, holding no vertex, sliced nothing. It now tests whether the mesh's bounds overlap the box.
- Slicing only the triangles that touched the box left T-junction cracks. It now slices along each plane through the connected skin.

**After:**
- Open edge on the hinge face is 0 for every F6F surface, except `Flap1R` at 1.8 cm of sub-centimeter slivers.
- The F4U reads 0 to 1.5 mm, except its elevators: 0.34 m and 0.18 m, short gaps at their roots against the fuselage, where the source overlays a second skin.
- Draws are unchanged (46 and 34).

**Gates:**
- `aircraftRigs.test.ts` holds every rig surface to 2 cm of open edge on its hinge face, with the two elevators pinned at their measured values. On the uncapped glbs it fails 16 surfaces.
- `geometryStages.test.ts` holds a cut piece and its body as closed solids of the right volume, including a shell whose skins are two primitives. Both checks failed before the fix: 20 open edges without caps, 6 with per-primitive caps.

**Captures** (before on the left, after on the right, the same camera): [`2026-10-08-c1-surfaces-batch2-shots/review/`](2026-10-08-c1-surfaces-batch2-shots/review/), from behind and above, from the side and from low in three-quarter, for both airplanes. The standard captures in the parent folder are re-shot with the fix.

## Ruling: Mark, 2026-10-08, the F4F's ailerons move outboard

**Unfreezing.** `wildcat.json` was `frozen` (Z1, 2026-09-25) because `wildcat.ts` poses the gear groups in the file's own node space, and the pipeline's join would have flattened that hierarchy. The file came from a pre-manifest recipe, `@gltf-transform/cli optimize` and then every material forced opaque (commits f4770d47, 20bcaa4e, d2a629de).
- **The check, before changing anything:** I re-ran that recipe at CLI 4.5.0 on the raw download (`tools/models/cache/grumman_f4f_wildcat_airplane.glb`, 74,074,336 bytes). The binary chunk (all geometry and textures) and the JSON came out identical except `asset.generator`, because the CLI now resolves core 4.5.1.
- **Through the build:** with no cut, the output is the committed file byte for byte. The re-encode writes with the repo's core 4.5.0, so even the generator matches.
- **The change:** the recipe is `tools/models/legacy.ts`. The entry swaps `frozen` for `legacyOptimize: true`, which runs the recipe into the cache and then `split` only, so every node stays where `wildcat.ts` expects it. The reason is in the entry's `note` and in `ASSETS.md`.

**The ailerons.** NACA ACR, Kleckner, "Flight Measurements of the Aileron Characteristics of a Grumman F4F-3 Airplane" (1942, NTRS 20090019131), gives:
- inboard end: 65.5% of the wing semispan;
- outboard end: 92.5%;
- chord behind the hinge: about 22.8% of the wing chord.

That is the F4F-3. The F4F-4's folding outer panel is taken to keep the same layout: **ESTIMATE**. The build cuts `AileronR` and `AileronL` from the wing skin there (semispan 7.829 model units, so x ±5.128 to ±7.242), hinged at 22.8% of the chord forward of the trailing edge, from true sections. The cut is capped, and both pieces are closed shells.

**The inboard pieces become static.** The model's `Aleron_*` run from the fuselage to about 62% of the semispan, which is where the F4F's split flaps were. A split flap is the lower skin only: the upper skin and the trailing edge stay put. So these full-thickness pieces are wing, not flap. They are drawn static, and the split-flap plates `wildcat.ts` draws beneath them are the flap system. Their span is the model's: **ESTIMATE**, against the real flaps.

**Draw calls.** The glb stores 49: the old 47 plus the two ailerons. `wildcat.ts` draws at most 47:
- the three hinge pins merged: −2;
- the two static inboard pieces merged: −1;
- the split flaps, one mesh: +1.

That makes 46 with the flaps up and 47 with them down, and `wildcat.test.ts` holds it. The entry's own budget is the stored figure, 49 draws, 103,000 triangles and 5.7 MB: the slices and caps add 1,612 triangles and 64 KB.

**Behavior kept:** the gear clip poses, the W1 leg stretch and the stores are untouched. `wildcatGear`, `wildcatMounts`, `outputs` and `wildcat.test` pass. `dist.test.ts` now compares the shipped Wildcat with the committed file instead of the old literal 5,573,316.

**Tests:**
- `wildcat.test.ts` enrolls `AileronR`/`AileronL` in place of `Aleron_*` for the hinge and direction checks, plus a new check that both cut ailerons are closed shells.
- Seen red:
  - inverting the orientation rule fails both ailerons' direction checks;
  - a trailing-edge hinge fails their leading-edge check, at 74% of the chord;
  - a build without caps fails the closed-shell check, with 61 and 59 open edges.

  The restored build is byte-identical.
- `hangar.spec` check 9 lists the new nodes.
- E2E on nexus: `hangar.spec` 19/19 and `wildcat.spec` pass. In `sortie.spec`, the two AD-2 tests fail on main too. "Drawn as the chosen aircraft" failed twice on its 120 s dive timeout under load and then passed three times, with no console errors.
- Full suite on ryzen: 4,674 tests, 10 named skips.

**Captures** (before on the left, after on the right): `2026-10-08-c1-surfaces-batch2-shots/review/f4f-wildcat-{top-roll,front-roll,rear-roll-flaps}-before-after.jpg`. From the top with right roll, the moving surface goes from the inboard trailing edge to the outer wing.

## Not done, and why

- **Batches 3 (A6M2, Ki-43) and 4 (D3A, B-17).** They go by the same `split` + `cut` route.
