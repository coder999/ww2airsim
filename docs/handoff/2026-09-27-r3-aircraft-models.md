# R3 handoff: the aircraft roster (2026-09-27)

R3 puts a fitted, rigged model behind every aircraft in the Library, and it
carries out the model half of Z3. It places nothing in a scenario. The only
in-game change is that the Zero now flies its own model. The design is
[`2026-09-26-model-roster-design.md`](../superpowers/specs/2026-09-26-model-roster-design.md).
The plan is
[`2026-09-26-r3-aircraft-models.md`](../superpowers/plans/2026-09-26-r3-aircraft-models.md).

This work is **complete on branch `worktree-r3-aircraft`, not merged**:
`e3e9496`..HEAD, cut from `main` at `e7ebd31`. Merging is Mark's call. The
run was unattended, with the final product as its one checkpoint (the
captures below).

## What shipped

- **One generic rigged-airframe module**, `src/render/scene/pivotedAirframe.ts`,
  posed from the data table `src/render/scene/airframeRigs.ts` (P7). Each
  part (`Prop`/`PropN`, `GearL`/`GearR`/`GearNose`/`Tailwheel`, `TurretN`)
  turns about the pivot the build baked into the glb. The runtime refuses a
  part with no pivot, and it refuses a spec with stores pointed at a rigged
  model. `wildcat.ts` is unchanged.
- **Two opt-in pipeline stages**, `normalize.yawDeg` and `dedupMaterials`, plus
  `npm run models:rig` to measure parts (P8). Every existing glb is
  byte-identical.
- **Blender kit aircraft parts**: fuselage, wing, fin, propeller, gear leg and
  gun turret. They are proven outward-wound per closed island (see "Found
  along the way").
- **Eleven aircraft models.** Seven are licensed CC BY 4.0 Sketchfab
  downloads. Each license was re-read from the API on 2026-09-27, and each has
  an `ASSETS.md` row. Four are original Blender models (AGPL): the Ki-84,
  Ki-21, B-29 and, as a fallback, the P-38.
- **The Zero flies its own model**: `a6m2-zero.json` sets
  `view.model: a6m2-zero`. The rig puts its wheels 2.484 m below the origin,
  against `gear.heightM` 2.48.
- **`NOT_YET_DRAWN` went from 18 to 9**, with `CEILING === 9`. Every aircraft
  in the Library is drawn.
- **Hangar Tier 2**:
  - new check 13: every rigged aircraft's gizmos are its props and legs;
  - check 7 skips display-only aircraft, and asserts they have no Cycle
    button;
  - check 10 covers every registered model;
  - check 5 was redesigned (see "Departures");
  - new check 14: the card's Model row and the Origin filter.
- **Where each model came from, in the Hangar** (Mark asked, 2026-09-27):
  - The card has a **Model** row, read from the entry's `source`: "Sketchfab
    download by <author> (CC BY 4.0)" with the author linked to the
    download, "Original Blender model", "Original model generated in code",
    or "Drawn in code (no model file)".
  - The list has a third filter, **Origin**: All origins, Internal (Blender,
    generated, or drawn in code) and External (downloads). Entries with
    nothing drawn yet show only under "All origins".
  - Verify after this change: rc=0, 2,890 passed, 1 skipped. Hangar Tier 2:
    19/19.

| id | source | bytes / tris / draws | budget | length vs cited | removed | rigged | fused / static |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `a6m2-zero` | SavinienBerault | 5,442,624 / 91,968 / 6 | 5.6 MB / 100k / 12 (P4) | 9.499 vs 9.06 m, +4.85% (6% row, P10) | nothing; simplify 0.45 | Prop, GearL, GearR, Tailwheel | drop tank (see Departures), flaps |
| `f6f-hellcat` | manilov.ap | 1,509,840 / 26,399 / 39 | 3 MB / 60k / 47 | 10.269 vs 10.24, +0.28% | pilot, 6 HVARs, 2 bombs, extended hook | Prop, GearL, GearR, Tailwheel | spinner |
| `f4u-corsair` | manilov.ap | 859,108 / 15,296 / 22 | 3 MB / 60k / 47 | 10.110 vs 10.26 (F4U-4), −1.46% | pilot, duplicate canopy | Prop (blur disc + spinner), GearL, GearR, Tailwheel | — |
| `ki-43-oscar` | manilov.ap | 937,396 / 17,240 / 34 | 3 MB / 60k / 47 | 8.812 vs 8.92, −1.2% | 2 duplicate canopies, 2 drop tanks | Prop (blur disc + spinner), GearL, GearR | tailwheel (fixed on the type) |
| `d3a-val` | helijah | 2,278,048 / 55,144 / 7 | 3 MB / 60k / 47 | 10.176 vs 10.195, −0.19% | belly bomb, instrument faces, hidden rear cylinder row; engine simplified 0.15 | Prop | gear (fixed, P15) |
| `g4m-betty` | Jec (@Jec_Games) | 97,900 / 1,792 / 5 | 5 MB / 100k / 47 | 19.748 vs 19.97, −1.11% | bombs | Prop1, Prop2, Turret1 (dorsal blister) | tail position; **no gear in the download** |
| `b-17-flying-fortress` | helijah | 3,913,376 / 98,683 / 29 | 5 MB / 100k / 47 | 23.163 vs 22.66, +2.22% | engine internals (377,168 tris), instrument faces, screws; cylinder rings simplified 0.1 | Prop1–4 (blades), GearL, GearR, Tailwheel (tire), Turret1–3 (chin, top, ball) | spinners, tail guns, tailwheel fork, upper drag links |
| `ki-84-frank` | Blender | 62,876 / 1,184 / 7 | 3 MB / 60k / 47 | 9.92 exact | — | Prop, GearL, GearR, Tailwheel | — |
| `ki-21-sally` | Blender | 97,976 / 1,856 / 9 | 5 MB / 100k / 47 | 16.0 exact | — | Prop1, Prop2, GearL, GearR, Turret1 | — |
| `b-29-superfortress` | Blender | 156,900 / 2,952 / 14 | 5 MB / 100k / 47 | 30.18 exact | — | Prop1–4, GearL, GearR, GearNose, Turret1–5 | — |
| `p-38-lightning` | Blender (fallback) | 90,480 / 1,728 / 7 | 3 MB / 60k / 47 | 11.53 exact | — | Prop1, Prop2, GearL, GearR, GearNose | — |

Downloads were fitted to their cited span and graded on length (P10). The
Blender models are built exactly to the cited length and span. `ASSETS.md`
carries each download's before-and-after triangle count, removals and yaw.

## Tier 1

- **`remote-run npm run verify`** (ryzen): **rc=0**, 260 files, **2,882 passed, 1 skipped**. The skip is `bathyBuild.test.ts`'s cache-backed case, which has no cache on either host. The first run that day was rc=1, with 9 Blender failures. Ryzen had gained Blender 5.0.1, so the suites no longer skipped there, but it lacked `python3-numpy`, and the glTF exporter died on `No module named 'numpy'`. Mark installed numpy, and the re-run was green, with ryzen's Blender rebuilds byte-identical too. Now documented in `serverconfig/ryzen.md`. The furball `beforeAll` flake that R1 and R2 hit did not occur.
- **Blender suites on nexus**
  (`npx vitest run tests/tools/models/blender tests/tools/models/blenderEntries.test.ts --maxWorkers=1`):
  **rc=0**, 5 files, **54 passed, none skipped**. This includes
  byte-identical rebuilds of R2's three ships, the hangar and all four R3
  Blender aircraft; `git status` shows no modified `content/` file afterwards.
- **Hangar unit tests** after the check 5 change: 11 files, 99/99, rc=0.
  Typecheck and lint also rc=0.
- Per-task focused runs, with every rc, are in the ledger
  `.superpowers/sdd/r3/progress.md` (gitignored).

**No game change (P17)**, checked 2026-09-27:
- `git diff main...HEAD -- content/scenarios src/sim` is empty.
- The only changed `content/aircraft/*.json` is `a6m2-zero.json`.
- The F6F and F4F specs are unchanged.
- No cache, candidate or scratch file is tracked, and `vite.config.ts` is
  unchanged.

## Tier 2

- **Setup:** slot `ww2airsim-3.windomlane.org` (port 5174), RX 6700 XT
  (the adapter guard passed), 2560×1440.
- **Run:** `adapter.spec.ts`, `hangar.spec.ts`, `wildcat.spec.ts` and
  `entities.spec.ts` (**rc=0, 22 passed** in 5.1 min), with zero validation
  errors.
- **Budgets:** every aircraft drew with `"over":false`. The draw counts match
  the table above.
- **Check 5, lighting response** (lit ÷ unlit luminance, relative to the
  Wildcat's):

  | Zero | F6F | F4U | Ki-43 | D3A | G4M | B-17 | Ki-84 | Ki-21 | B-29 | P-38 |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | 1.356 | 1.262 | 1.202 | 1.392 | 1.418 | 1.364 | 1.392 | 1.171 | 1.278 | 1.367 | 1.339 |

  Every model sits above the Wildcat, which is the low outlier. The highest,
  the D3A at 1.418, is 0.08 below the band edge.

## Mark's checkpoint

Twenty-two frozen Hangar captures, a three-quarter view and a side view per
aircraft, are in [`2026-09-27-r3-shots/`](2026-09-27-r3-shots/). Each is
linked twice, because `*.marktuttle.dev` is blocked on Mark's work network
and GitHub is not.

| aircraft | three-quarter | side |
| --- | --- | --- |
| A6M2 Zero | [local](2026-09-27-r3-shots/a6m-zero-three-quarter.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/a6m-zero-three-quarter.png) | [local](2026-09-27-r3-shots/a6m-zero-side.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/a6m-zero-side.png) |
| F6F Hellcat | [local](2026-09-27-r3-shots/f6f-hellcat-three-quarter.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/f6f-hellcat-three-quarter.png) | [local](2026-09-27-r3-shots/f6f-hellcat-side.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/f6f-hellcat-side.png) |
| F4U Corsair | [local](2026-09-27-r3-shots/f4u-corsair-three-quarter.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/f4u-corsair-three-quarter.png) | [local](2026-09-27-r3-shots/f4u-corsair-side.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/f4u-corsair-side.png) |
| Ki-43 Oscar | [local](2026-09-27-r3-shots/ki-43-oscar-three-quarter.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/ki-43-oscar-three-quarter.png) | [local](2026-09-27-r3-shots/ki-43-oscar-side.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/ki-43-oscar-side.png) |
| D3A Val | [local](2026-09-27-r3-shots/d3a-val-three-quarter.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/d3a-val-three-quarter.png) | [local](2026-09-27-r3-shots/d3a-val-side.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/d3a-val-side.png) |
| G4M Betty | [local](2026-09-27-r3-shots/g4m-betty-three-quarter.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/g4m-betty-three-quarter.png) | [local](2026-09-27-r3-shots/g4m-betty-side.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/g4m-betty-side.png) |
| B-17 Flying Fortress | [local](2026-09-27-r3-shots/b-17-flying-fortress-three-quarter.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/b-17-flying-fortress-three-quarter.png) | [local](2026-09-27-r3-shots/b-17-flying-fortress-side.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/b-17-flying-fortress-side.png) |
| Ki-84 Frank | [local](2026-09-27-r3-shots/ki-84-frank-three-quarter.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/ki-84-frank-three-quarter.png) | [local](2026-09-27-r3-shots/ki-84-frank-side.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/ki-84-frank-side.png) |
| Ki-21 Sally | [local](2026-09-27-r3-shots/ki-21-sally-three-quarter.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/ki-21-sally-three-quarter.png) | [local](2026-09-27-r3-shots/ki-21-sally-side.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/ki-21-sally-side.png) |
| B-29 Superfortress | [local](2026-09-27-r3-shots/b-29-superfortress-three-quarter.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/b-29-superfortress-three-quarter.png) | [local](2026-09-27-r3-shots/b-29-superfortress-side.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/b-29-superfortress-side.png) |
| P-38 Lightning | [local](2026-09-27-r3-shots/p-38-lightning-three-quarter.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/p-38-lightning-three-quarter.png) | [local](2026-09-27-r3-shots/p-38-lightning-side.png) · [GitHub](https://github.com/Coder999/ww2airsim/blob/worktree-r3-aircraft/docs/handoff/2026-09-27-r3-shots/p-38-lightning-side.png) |

The three-quarter views were read on 2026-09-27. Each shows the nose to +x,
the gear standing on the pad, the propellers on their hubs, and no holes or
transparent hull. The B-29 and P-38 were re-captured after natural metal
went back to aluminum (see "Departures").

To see them live, start this worktree's server on a free slot (CLAUDE.md,
"Two more dev-server slots"). A slot is up only while its server runs, so
first assert `curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim-3.windomlane.org/`
prints `200`. Then open `/hangar.html?bench`. The slot server was stopped at
the end of this run.

## Rulings

P1–P17 are the plan's
([§ Rulings](../superpowers/plans/2026-09-26-r3-aircraft-models.md)). In
short:

- P1 is Z3's model half only.
- P2 shrinks the allowlist by 9.
- P3: the Hellcat's model draws, its spec owns the card, and no stores are
  drawn.
- P4 gives the Zero's budget, and P5 sets 47 draws.
- P6 names the parts.
- P7 is one generic module, and P8 adds two opt-in stages.
- P9 never simplifies a prop.
- P10 sets the length tolerance: 4%, or 6% for the Zero.
- P11: a fused part stays static.
- P12 removes separable stores.
- P13 sets gear down with the thrust line level.
- P14 names only separable turrets.
- P15 leaves fixed gear unrigged.
- P16: flat palettes, no insignia.
- P17: the game is unchanged.

Execution rulings, each with its cost-if-wrong in the ledger:

- **Check 5 measures lighting, not paint** (Mark, 2026-09-27). See
  "Departures".
- **The P-38 falls back to Blender.** Fitted to the cited 15.85 m span, the
  download is 12.13 m long, +5.2% over 11.53 m. Fitted to length, its span
  is −5.0%. No variant matches.
- **Symmetry waivers.** `symmetryTolerance` 0.02 (the metric's cap) waives
  the N-fold orbit check for four props:
  - the Zero and the D3A, whose real blades sit off orbit;
  - the F4U and the Ki-43, which are textured blur discs.

  The guard for them is the new 5%-of-radius centroid check. At the
  committed hubs it reads Zero 1.15%, F4U 1.85%, Ki-43 2.28% and D3A 0.50%,
  and it reads 19.9% at a bounds-center hub.
- **The Zero keeps its drop tank.** The tank is fused into the fuselage, and
  every cut left torn fragments under the wing root.
- **Removals:**
  - The F6F loses its extended tail hook. With the hook it measures +7.7%
    long; without, +0.28%.
  - The B-17's 71k and 23k engine nodes are hidden internals. The 72k ring
    is visible and stays, simplified.
- **B-17 rig:**
  - three turrets, since the tail position is fused;
  - the props spin their blades only;
  - the tailwheel is the tire alone;
  - the main legs fold at 60° (not 90°), with the upper drag link left static.
- **The G4M has no landing gear** (a wheels-up flying model). Its dorsal
  blister is `Turret1`.
- **Dimensions:**
  - The F4U cites the only Specifications block, the F4U-4's. The model is an
    F4U-1A, and both variants fit inside 4%.
  - Cited figures replace plan estimates for the Ki-84 airfoil, the B-29
    props (4 × 5.055 m) and airfoil, and the P-38 blades and airfoil.
- **The Ki-84 wing is two panels a side**, so that the rig's skin check has
  airframe over the folded mains.
- **Tests:**
  - `dedupMaterials` also joins the primitives within each mesh (F6F 49 → 39
    draws).
  - Rotation equality is compared by component, never with `angleTo` below
    about 1e-6.
  - Tasks 1 and 2 share one commit, as the plan's own Task 1 Step 4 allows.

## Departures

- **Hangar check 5 was redesigned** (Mark's decision, 2026-09-27; it
  overrides the plan's "never widen the check").
  - **The old check** compared each aircraft's lit luminance with the blue
    Wildcat's (0.5–1.5×). A correctly lit bare-metal B-17 read 3.10× and the
    pale G4M 3.56×, so the check was measuring paint.
  - **The earlier workaround:** to pass it, the previous session darkened
    the kit's `naturalMetal` from `#B4B8BC` to gunmetal `#52565A`. The B-29
    and P-38 then read 1.14× and 1.10×, but they looked dark gray.
  - **Now:** `__hangar.setUnlit` draws the model in its own base color and
    texture with no lights. Check 5 divides the lit frame by that one and
    compares the result with the Wildcat's, in the same 0.5–1.5 band. Paint
    cancels out, so an emissive, black or inside-out material still fails.
  - `naturalMetal` is back to `#B4B8BC`, and the committed B-29 and P-38 bytes
    are the original ones.
- **Check 8 (wireframe) timeout raised to 180 s.** It makes three captures per
  Library entry, and the eleven new aircraft took it past 60 s (26 of 28
  entries).
- **The roster design's P-38 row** now notes the Blender fallback.

## Found along the way

- **The R2 kit's `tapered_box`, `cylinder` and `turret` are wound inside out.**
  Their signed volumes are negative: bridge −53.0, mast −2.26, turret −6.84.
  Double-sided materials hide it. The fix is not made, because it would move
  R2's committed ship glbs. `docs/models.md` warns against building aircraft
  parts on them.
- **A per-island signed-volume test** now guards every new kit part. A
  whole-node volume let one reversed blade hide behind the spinner.
- **`aircraftRigs.test.ts`'s skin check is one-sided.** It bounds the top of
  a folded leg, not its bottom. With the gear up, wheels hang below the
  lowest skin vertex over them by:

  | leg | below the skin |
  | --- | --- |
  | Ki-21 mains | 0.61 m |
  | B-29 mains | 0.59 m |
  | B-29 nose | 0.30 m |
  | P-38 mains / nose | 0.12 / 0.14 m |
  | Ki-84 mains / tail | 0.07 / 0.09 m |

  A two-sided check needs a ray/surface query, because vertex bounds are
  noise on downloads.
- **The F6F's legs fold 0.47 m proud of the wing.** The real gear swings and
  twists 90°, and one baked axis cannot express that. The leg is listed in
  `THROUGH_SKIN` with a shrink-only ceiling of 0.48 m. The fix is an oblique
  pivot axis, which needs a manifest change.
- **Semi-exposed parts with the gear up:**
  - the B-17's tailwheel still hangs about 0.46 m below the belly, because
    its fork is fused;
  - the Ki-21 and B-29 wheels sit half out of their nacelles.
- **Two models are blur discs at rest.** The F4U and Ki-43 props are textured
  discs, so neither shows blades on the stand. A kit propeller grafted onto
  them would be cheaper than a Blender remodel.
- **The Blender models are low-poly and generic.** The Ki-84 in particular
  reads more like a trainer than a Frank. This is by design (flat palette, no
  insignia, P16), but it is the first thing the eye catches next to the
  textured downloads.

## Open items

- **The rest of Z3 (P1):** the zero-range scenario and its title entry; the
  distance LOD; `zero.spec.ts`; the re-measured gun mounts, hit zones and
  eye point.
- **The Zero is +4.85% long** against its cited 9.06 m (P10's 6% row). The
  design missed it.
- **The Hellcat in game:** it still flies as the Wildcat (design §6.2). Its
  rigged model has no store mounts, so switching `view.model` fails loudly,
  by design.
- **Turrets for H3.** Named today: the Ki-21, B-29 and B-17 (three), and the
  G4M's blister. Fused: the B-17 and G4M tail positions.
- **No insignia on the Blender models** (P16).
- **The fixes listed above:** the F6F oblique gear axis, a two-sided
  retracted-leg check, and the R2 kit's inside-out primitives.
- **The B-29's outboard nacelles** ride about 0.17 m above the thinner outer
  wing and run past its trailing edge (the plan's geometry). The P-38's fins
  have no lower halves. Both are left for Mark's eye.
