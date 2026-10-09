# M1b handoff: visible AA mounts, drawn galleries, guns that elevate (2026-10-09)

Plan: `docs/superpowers/plans/2026-10-09-m1b-aa-mounts.md` (rulings B1–B4). Branch `m1b-aa-mounts`, merged to `main`. Run unattended. Checkpoint 1 (the new 40 mm quad) and the final captures are below, for when Mark is back.

## What ships

- **Elevation (B4).** Every kit is two parts: the mount trains, and its guns (`Kit_<kit>_Guns`) also rise about their trunnion, up to the kit's own maximum.
  - The maxima are in `MAX_ELEVATION_DEG` (`tools/models/stages/shipMounts.ts`). They are ESTIMATES from navweaps.com: 85–90° for the 20 mm to 5"/38 and 127 mm AA, 30° for Pennsylvania's 14", 45° for Yamato's 18".
  - `ShipMountView` gains `setElevation` and `maxElevationRad`.
  - The Hangar's Train mounts sweep now trains ±90° and elevates from level to full, and gets an `elevateMounts` hook.
- **Better light AA (B1, B3).** Every 40 mm and smaller kit is now generated (`stages/mountKits.ts`), on the Blender ships too, so the repo has one 40 mm quad, not two.
  - The 40 mm mounts have a tub, crew platform, carriage, splinter shields, seats and a sight. The guns are receivers and 0.15 m (6 in) barrels in `ship:gunmetal` (#3a3d40).
  - New kits: a shielded Oerlikon 20 mm single and a Type 96 25 mm single.
  - Every light AA kit is drawn 1.3x true size on purpose.
- **Galleries (B2).** Every former `kit: null` entry now has a kit. Where it has more than one barrel it also has a `run`, and the build draws one gun per barrel (`LightAA<k>_<i>`), spread over the run and set on the deck under each gun. The sim still has one fire position per entry.
  - The Blender scripts' static 20 mm loops are gone (Pennsylvania's deck-edge singles, Casablanca's catwalk singles), replaced by these.
- **Tests:**
  - `tests/render/ship.test.ts`: an elevated gun moves and its mount and the other mounts don't, clamping included. Seen red with the raise dropped.
  - `tests/tools/shipModels.test.ts`: one locator per gun and the instance count equals the barrel count; every gallery gun stands within 0.75 m of its gallery's height; every kit has its guns with a trunnion and its maximum. Seen red against M1's Fletcher.
  - Hangar E2E check 17: full elevation changes the side view and 0 restores it exactly. Seen red with `elevateMounts` a no-op, then green on nexus (680M).
  - Pins re-pinned: FLAT_SOUP for Cleveland, Essex, Mogami and Yamato (one commit per ship, with the reason). The skin test admits `ship:gunmetal`, and the pre-O1 entry pin lets ship draw budgets and Shiratsuyu's `remove` change.

## Per ship, before (M1, `main` at `e3578a60`) → after

"Drawn" counts every instance at its kit's triangles. Locators include gallery guns.

| Ship | Bytes | File triangles | Drawn triangles | Draws | Locators |
| --- | --- | --- | --- | --- | --- |
| casablanca-cve | 619,424 → 511,992 | 10,852 → 9,072 | 13,232 → 15,312 | 5 → 9 | 13 → 29 |
| cleveland-cl | 385,684 → 434,608 | 5,819 → 6,643 | 10,835 → 15,787 | 6 → 12 | 24 → 30 |
| essex-cv | 846,076 → 889,140 | 14,378 → 14,970 | 17,682 → 33,798 | 4 → 8 | 27 → 79 |
| fletcher-dd | 1,679,220 → 1,706,628 | 40,840 → 41,300 | 43,780 → 46,540 | 11 → 15 | 17 → 18 |
| kagero-dd | 726,780 → 722,484 | 11,692 → 11,648 | 13,360 → 13,140 | 3 → 5 | 7 → 7 |
| mogami-ca | 322,728 → 357,208 | 4,837 → 5,343 | 6,939 → 13,871 | 6 → 12 | 25 → 41 |
| pennsylvania-bb | 779,040 → 669,168 | 10,802 → 8,886 | 17,186 → 25,226 | 5 → 10 | 26 → 73 |
| shiratsuyu-dd | 3,451,312 → 2,661,520 | 63,960 → 51,166 | 65,051 → 54,149 | 14 → 16 | 9 → 14 |
| yamato-bb | 434,076 → 473,360 | 6,654 → 7,074 | 10,196 → 27,924 | 6 → 12 | 33 → 105 |

**Budget rises** (draw calls only; bytes and triangles stayed inside every budget). Each part of a kit is its own draw, so the guns parts add one draw per kit type (B4 accepts that cost).

- **Fletcher, 12 → 15.** Its carved 5" kit's guns, plus the 40 mm and 20 mm kits' mounts and guns.
- **Shiratsuyu, 14 → 16.**
- Cleveland, Mogami and Yamato now sit exactly at their 12.

## Rulings by default (2026-10-09; nothing in the plan or B1–B4 settled these)

1. **Welded carved kits are replaced.** Essex's open 5" (really Enterprise's), Mogami's and Yamato's 12.7 cm and Yamato's shielded 25 mm triples are each one welded shell, so their guns can't be told apart. Each is replaced by a generated kit: a new open Mk 24-type 5" single, the Type 89 twin, and a new shielded 25 mm triple.
2. **Trunnions and maxima live on the guns node, per kit,** not on each locator as the plan sketched. They are the same for every instance of a kit.
3. **Galleries spread fore and aft along x** (`run` is a length), and a multi-gun gallery faces outboard (bearing ±90°). Some galleries moved or got shorter so every gun stands on deck and clears its neighbors:
   - Pennsylvania's bow pair moved to x 63, z ±10.5 (inboard of the narrowing bow), run 20 m.
   - Essex's to x 62 and -32.
   - Mogami's to z ±7.5.
   - Yamato's bow pair got a 32 m run.
   - Fletcher's deckhouse pair centered at -25.0 with a 1.4 m run.
4. **Shiratsuyu's download AA is removed** (`remove: ["Object001_antiaircraft_0"]`), so the generated 25 mm don't double it. That object also held two AA platforms, so those positions now stand on the deck below (y 4.77 and 6.59). Its turrets' kit is renamed `turret-127mm-twin`: Model B, +55°, not the Type 89's +90°.
5. **Fletcher's and Yamato's download 20 mm and 25 mm are not removed.** They are small islands at or near the new 1.3x guns' points, so a close look may show a doubled gun. Not checked gun by gun. Removing them needs per-gun `split` boxes and was left out.
6. **Captures.** Hangar captures come from the game renderer (nexus 680M). The close-ups and the 1,500 ft views are Blender renders of the shipped glbs with each kit instanced at its locators, as the game does (scratch script, not committed). They show the geometry, not the in-game lighting.

## Checkpoint 1: the new 40 mm quad (Pennsylvania)

- Close, at rest and mid-sweep: `2026-10-09-m1b-aa-mounts-shots/cp1-40mm-quad-close.jpg`, `cp1-40mm-quad-close-swept.jpg`
- About 1,500 ft: `cp1-pennsylvania-1500ft.jpg` (85 mm lens) and `pennsylvania-1500ft-35mm.jpg` (a pilot-like field of view)

## Final captures

- Hangar, every ship, at rest (left) and mid-sweep (right: trained 60°, guns at 60% of their maximum): `<ship>-hangar-rest-and-swept.jpg`
- Close, mid-sweep: `pennsylvania-close-swept.jpg`, `fletcher-close-swept.jpg`, `yamato-close-swept.jpg`, `essex-close-swept.jpg`
- About 1,500 ft: `fletcher-1500ft.jpg`, `fletcher-1500ft-35mm.jpg`

## Open

- **Mark's look:** do the 1.3x mounts and the galleries now read from the air? The factor is one constant (`LIGHT_AA_SCALE`).
- Draw budgets rose for two ships, and three now sit exactly at 12.
- The generated kits are plain boxes and octagonal barrels. A further pass could round the shields and add flash hiders.
- The download guns under the new kits on Fletcher and Yamato (ruling 5).
- No mid-sweep capture checks how turret guns clip against superstructure at full elevation and full training. The sweep is a Hangar check, not a gameplay pose, so M3's gun-laying should limit its arcs.
