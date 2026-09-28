# Model detail pass: bring every Blender model up to the downloads

Design, 2026-09-28. Written at Mark's request the same day, for his review
before any plan is written. **It starts after R4/R5 merge** (§7). Plan
numbering stays with the master spec's §15; this work adds one row there,
"Model detail pass (DP0-DP3)", when DP0 is planned.

## 1. Goal

Mark, 2026-09-28: "It wouldn't make sense to have half high quality aircraft
and half low poly." The model-roster spec §8 accepted a simpler Blender look
**for now** (amended the same day, commit `313e2b1`). This pass ends that
deferral. Every Blender model (aircraft, ships, buildings) reaches the level
of detail the downloads set, in both geometry and skin.

**Done is an assertion, not a sentence** (§6):
- Every Blender entry ships base-color, metallic-roughness and normal maps.
- It has UVs, and is inside its budget.
- It rebuilds byte-identically.
- A Tier 1 allowlist of entries still flat-shaded shrinks each plan, and DP3 deletes it.
- The look itself is an eye judgment that Mark makes once, on DP0's pilot models (§5).

Out of scope:
- flight models for Blender aircraft (the roster spec's out-of-scope list is unchanged);
- putting the Blender buildings into the airfields in game (roster spec §6.3, still a later decision; §8 Q4);
- turrets that turn (H3);
- re-authoring any download's geometry.

## 2. What exists (measured 2026-09-28 from the committed glbs)

Every Blender model has **0 textures and no UVs**. It uses 2 to 5 flat
materials from `PALETTE` in `tools/models/blender/kit.py`, in glTF
metallic-roughness form. The triangle counts are from the R3 handoff and
R0/R4 inspections.

| Family | Blender models | Triangles vs budget | Nearest download, for comparison |
| --- | --- | --- | --- |
| Aircraft (4) | Ki-84, Ki-21, B-29, P-38 | 1,184-2,952 of 60k-100k (2-3%) | A6M2 Zero: 91,968 tris, 11 images, base color + metallic-roughness + normal |
| Ships (3) | Pennsylvania, Kagero, Casablanca | 15-34 KB files, budget 45k tris | Shiratsuyu: 23 images, full PBR; Type B maru: full PBR |
| Buildings (9, a 10th in R4) | hangar, tower, AAA, coastal battery, bunker, barracks, fuel farm, pier, revetment | ~350-5,000 of 5,000 | none (no building is a download) |

The downloads are not uniform either:

| Download skin | Models |
| --- | --- |
| Full PBR (base color, metallic-roughness, normal) | Zero, Wildcat, Shiratsuyu, Type B maru |
| Base color only | Hellcat, Corsair, Oscar, Val, Betty, B-17, Fletcher |
| **No textures and no UVs** (models made for 3D printing) | Essex, Cleveland, Mogami, Yamato |

So the flat-shaded group is 16 Blender models plus 4 downloaded ships. §8 Q1
asks whether the 4 ships join this pass.

**Flat-shaded models are already visible in play.** Convoy Strike places
the Blender `kagero-dd`. The flat, untextured `essex-cv` download is the
player's carrier in five scenarios (Free Flight, Deck Quals, Deck Quals
mission, Combat Air Patrol, Friendly-Fire Range). The other Blender models
are seen only in the Hangar today.

**There is a precedent for skins that rebuild byte-identically.** O1's generated ordnance
(`tools/models/generated/paint.ts`) embeds three 512 px WebP maps built with
`sharp` from a CC0 Poly Haven scan pinned by MD5. The paint hue is per
vertex, and the scan contributes only wear, roughness and normals.
`tests/tools/models/generatedModels.test.ts` proves that the output rebuilds
byte-identically. This design extends that mechanism rather than inventing a
second one.

## 3. Geometry

The kit is what gets better, so every model built on a part improves with it.
Detail goes where a silhouette or a highlight shows it. Surface detail
(panel lines, rivets, corrugation, planking) goes in the normal map (§4), not
in triangles.

| Family | Kit work | Per-model work |
| --- | --- | --- |
| Aircraft | More loft stations and ring segments; fillets at the wing root and tail; control surfaces as their own inset panels with a hinge gap; a real canopy (frame bars and glazing as separate materials); cowling lip and exhaust stacks; spinner and blades with twist | Cited features each script now leaves out (its header lists them): antennas, pitot, gun barrels, landing-light, the tailwheel doors |
| Ships | **Fix R2's inward-wound `cylinder`, `tapered_box` and `turret`**, open since R4. The only reason not to fix them was rebuilding R2's committed glbs, and this pass rebuilds them anyway. Add gun barrels with blast bags, director and AA mounts, funnel caps, boats, and a sheer and flare that follow the section tables more closely | Per-class fittings from the cited drawings |
| Buildings | Corrugated and planked panels as normal-map detail on the existing parts; eaves, doors and window reveals as geometry | The 4-draw-call budget stays. Raising the 5,000-triangle budget needs a measured reason in `RAISED`, which is the existing rule |

Target: each Blender aircraft and ship lands at **25-60% of its triangle
budget**, the band the downloads occupy after decimation. The floor is not a
test, because more triangles do not mean more detail. It is a check the
handoff reports, next to the side-by-side captures.

## 4. Skins

Two layers, so that no image has to be painted by hand and everything is
reproducible:

1. **Per-model atlas on `TEXCOORD_0` (unique UVs).** The kit writes UVs
   analytically, because it knows each part's parameterization. On a loft, u
   is the station and v is the angle around the ring. A wing's u is the
   chord and its v is the span. A box gets one face per atlas tile. Nothing
   calls Blender's `smart_project`, whose packing is not guaranteed stable.
   A TypeScript stage then draws the atlas with `sharp` from vector
   instructions the script exports alongside the glb:
   - camouflage color per part and the underside demarcation;
   - national markings (hinomaru, US star-and-bar) at cited positions and diameters;
   - hull numbers and tail codes;
   - panel lines and rivet rows along the kit's own station and spar positions;
   - exhaust staining and walkway wear.
   All of it is original drawing, AGPL-3.0-or-later, so no license work is needed.
2. **Shared detail on `TEXCOORD_1` (world-scaled, tiled).** This is O1's
   `PAINTED_METAL` approach, generalized to a small set of pinned CC0
   scans, one per surface: painted metal, weathered deck planking, concrete,
   corrugated iron and sandbag. It supplies micro-normal and roughness
   variation. Three.js (0.186 here) selects the UV channel per texture (`texture.channel`),
   and glTF carries it as `texCoord`. §8 Q5 covers the fallback if the
   runtime's material path does not honor it.

Map sizes: 1024 px atlases for aircraft and ships, 512 px for buildings, and
512 px for the shared detail, which is embedded once per model. The entries'
`textures.maxSize` rises from 512 where needed. Every family stays inside its
existing `maxBytes` budget. The Zero download, at 5.3 MB, is the ceiling for
reference, not the target.

**Why the images are drawn in TypeScript and not baked in Blender:** Blender's
job stays geometry plus UVs. R0 and R1 proved that part rebuilds
byte-identically on both machines (16 of 16 entries on 2026-09-27, per `CLAUDE.md`).
Baking would bring Cycles sampling into the output, which is the determinism
risk roster spec §8 named. The `sharp`/libwebp path is already proven byte-stable
by O1.

**The 4 untextured downloads** (if Q1 is yes) get UVs from a new pipeline
stage: box projection at world scale, applied after `normalize`. That stage
gives them the shared detail layer and a base-color atlas of their current
palette colors, but no markings, because their faces carry no semantic
parts to place them on.

## 5. The look is approved once, on pilots

DP0 builds two pilot models to the full bar: the **Ki-84** (one engine,
lofts, markings) and the **hangar** (the simplest building, and the most
placements). The handoff shows each pilot beside the Zero and the Hellcat in
Hangar captures, the same camera and lighting for all.

Mark approves the look, or asks for changes, on those captures. The approved
commit is tagged `model-detail-look-approved`, like the approved-look tag the
clouds use (`cloud-vdb-photo-2026-09-26`). DP1-DP3 match it and do not ask
again. This is the one step that needs Mark; everything else runs unattended.

## 6. Testing

- **Tier 1, pipeline.**
  - Every Blender entry, and every download the new UV stage touches, rebuilds byte-identically (the existing `blenderEntries.test.ts`, plus the stage fixture).
  - The atlas renderer is pinned by a golden-image hash.
- **Tier 1, content.**
  - Each entry off the allowlist has `TEXCOORD_0`, base-color, metallic-roughness and normal maps, and `TEXCOORD_1` where it uses the detail layer.
  - Each such entry is within budget, and its measured dimensions are still within tolerance of its cited figures.
  - **The `textures).toBe(0)` pins in `tests/tools/models/blender/hangar.test.ts:70` and `tests/tools/models/buildingModels.test.ts:75` are replaced deliberately**, in the same commit that textures the model, never loosened ahead of it.
  - The flat-shaded allowlist shrinks and never grows.
- **Tier 2.** `tests/e2e/hangar.spec.ts` runs unchanged: every entry renders, is lit, moves, and is inside its budget as drawn. It adds one check: a skinned model's lit luminance is inside a band around its flat predecessor, so a missing or black texture fails. Convoy Strike's Tier 2 re-runs after DP2, because `kagero-dd` is in play. Both run on the reference GPU.
- **`npm run verify` through `remote-run`** ends every plan.

## 7. Plans and sequencing

| Plan | Contents | Waits for |
| --- | --- | --- |
| **DP0** Pipeline and pilots | Kit UV writer, vector-instruction export, TS atlas stage, shared detail scans (pinned), `TEXCOORD_1` in the runtime, allowlist; Ki-84 and hangar to the full bar; look approval (§5) | R4/R5 merged (they edit `kit.py` and the building scripts; working in parallel collides, as the 2026-09-02 and 2026-09-27 incidents showed) |
| **DP1** Aircraft | Ki-21, B-29, P-38 to the approved look | DP0 approved |
| **DP2** Ships | Winding fix, then Pennsylvania, Kagero, Casablanca; the box-projection stage and the 4 downloads if Q1 is yes | DP0 approved; independent of DP1 |
| **DP3** Buildings | The remaining 9 buildings; delete the allowlist | DP0 approved |

DP1-DP3 touch disjoint scripts but share `kit.py`. Run them one at a time,
or in worktrees with kit changes landing only in DP0.

## 8. Questions for Mark

Each has a recommendation, which the plans assume unless Mark rules otherwise.

1. **Do the 4 untextured downloaded ships (Essex, Cleveland, Mogami, Yamato) join this pass?** *Recommend yes.* Otherwise the flat-shaded set just moves from "Blender" to "some ships", which is the same inconsistency Mark ruled out. The Essex is the one the player sees most: it is the carrier in five scenarios.
2. **Finish: factory-fresh or Pacific-worn?** *Recommend worn:* chalking and fading on IJN green, exhaust and gun staining, deck wear. It is what period photographs show, and it hides the procedural origin better.
3. **Markings: a generic unit, or one specific cited airframe per type?** *Recommend one cited airframe each*, like the scripts' cited dimensions. A header names the unit and the photograph's source, or labels the markings ESTIMATE when no source is found.
4. **Swap the Blender buildings into the airfields in the same pass?** *Recommend no*, and keep roster spec §6.3's separate decision. Once DP3 lands, though, the in-game procedural boxes become the new inconsistency, so it should be the next decision after this pass.
5. **Fallback if a second UV set costs too much or misbehaves in the runtime path** (tier LOW, the photoreal pass). *Recommend* baking the detail layer into the atlas in the TS stage: one UV set, larger atlases, same determinism. DP0 measures the cost of both on the reference GPU and records the choice as a ruling.

## 9. Risks

- **The analytic UVs stretch at loft ends and wing tips.** The atlas renderer
  takes per-part texel density from the part's real size, and DP0's captures
  are the eye check. A checker-texture debug mode in the Hangar (`?bench`) is
  cheap and is part of DP0.
- **`sharp` or libwebp version drift breaks byte identity.** The risk is the same
  as O1's and so is the guard: `sharp` is pinned in the lockfile, and the golden hash names the version it was made with.
- **Scope creep toward download-level geometry.** The bar is parity at game
  and Hangar viewing distance, judged once on the pilots (§5). The Zero's
  92k triangles are a ceiling, not a goal.
- **The download aircraft are uneven too** (7 of 9 have base color only). Once
  the Blender aircraft have normal maps, they may out-detail the Hellcat. That
  is acceptable. If Mark wants the downloads lifted to full PBR afterwards,
  the shared detail layer (§4.2) applies to them with no new machinery.
