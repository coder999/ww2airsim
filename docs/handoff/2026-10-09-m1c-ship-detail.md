# M1c handoff: finer detail and baked textures on our three Blender ships (2026-10-09)

Plan: `docs/superpowers/plans/2026-10-09-m1c-ship-detail.md`. The run was unattended, in worktree
`m1c-ship-detail`.
Checkpoint: Pennsylvania, shown beside Cleveland (the best-looking download) at the same distances.

## What ships

- **A committed high-poly bake (C1).** Each script now declares bake-only surface detail with
  `m.detail(...)`: portholes, doors, hatches, louvers, ladders and deck-edge bars.
  - `npm run models:bake -- <id>` builds the raw glb on nexus. It then runs the same script in Windows
    Blender on Ryzen, where Cycles bakes AO and a tangent-space normal map selected-to-active onto
    the atlas, and copies the maps back.
  - The maps are committed to `tools/models/bakes/<id>/` with a manifest. The manifest pins the hashes
    of the raw glb and of the detail list, so a stale bake stops the build by name.
  - The build composes the maps but never re-bakes:
    - AO multiplies the paint (85%);
    - the baked normal is whiteout-blended over the painted one;
    - both apply only on the patches no other chart overlaps (the sidecar's `baked` list).
- **More real geometry (C2):**
  - **Pennsylvania:** rounded deckhouses (the first superstructure tier and the aft deckhouse) and
    deck-edge railings broken at every 40 mm tub, 20 mm gallery and set of bitts. Also a roof
    railing, rigging (shrouds, antenna wires, fore- and backstays) and Mk 4 radar antennas on both
    Mk 37 directors.
  - **Kagero:** an after deckhouse, deck-edge railings, a bridge-roof railing, and rigging.
  - **Casablanca:** catwalk guard rails broken at each 40 mm sponson (they replace the old
    stanchion stubs), an island-roof railing, and mast stays.
- **Paint (C3, C4):**
  - A new `planks` marking gives each board its own shade and roughness, with dark seams, on
    sky-facing faces. Pennsylvania has 0.16 m planks, Casablanca 0.15 m Douglas fir, and Kagero
    1.83 m linoleum sheets with dark edging.
  - Rust streaks under every third porthole.
  - Wear along Pennsylvania's deck walkways.
- **A denser Casablanca atlas.** The flight deck's top face is now laid out along the atlas, and the
  catwalks take their own charts. Shared, their faces had been merged into one 962 by 962 px square.
  Casablanca's texels go from 13.2 cm to 10.9 cm.
- **A Hangar `aim(eye, target)` hook** and fixed-range views in the capture tool
  (`tests/e2e/shipCaptures.spec.ts`, "ship views"): close, side-close, deck, about 1,500 ft (455 m),
  and the groove for carriers.

## Numbers

Bytes and file triangles of the committed glb; draws as `models:build` reports them. The budget
for each is 3 MB, 45k triangles and 12 draws, and none changed.

| Ship | Bytes | File triangles | Draws | Texel |
| --- | --- | --- | --- | --- |
| Pennsylvania | 669,168 → 1,044,104 | 8,886 → 12,134 | 10 → 10 | 9.1 → 9.4 cm |
| Kagero | 722,484 → 1,083,152 | 11,648 → 15,396 | 5 → 5 | 5.8 → 5.9 cm |
| Casablanca | 511,992 → 817,820 | 9,072 → 11,364 | 9 → 9 | 13.2 → 10.9 cm |

The bytes rise because the normal map now carries real detail, and normal maps compress poorly.
Pennsylvania's and Kagero's texel sizes coarsen slightly because their walls left the shared charts.
Their hull is the limit: at 2,048 px, the hull chart is already the full width of the atlas.

**Bake time at 2,048 px, AO at 128 samples and normal at 16:**

| Ship | Ryzen RX 6700 XT, HIP | Nexus CPU (Pennsylvania only) |
| --- | --- | --- |
| Pennsylvania | AO 3.4 s, normal 0.9 s (232 details) | AO 22.3 s, normal 1.4 s |
| Kagero | AO 2.8 s, normal 0.9 s (83 details) | |
| Casablanca | AO 3.0 s, normal 0.9 s (143 details) | |

The GPU is about 6.5 times faster on the AO. Each Ryzen round trip, including the copies, takes about 10 to 15 s.
Every detail found its surface: no detail missed in any of the three bakes.

## Captures (`2026-10-09-m1c-ship-detail-shots/`)

- **Checkpoint, Pennsylvania (top) against Cleveland (bottom)** at the same ranges:
  `cp-pennsylvania-vs-cleveland-{close,side-close,deck,1500ft}.jpg`.
  - The planks read on the deck view.
  - The railings, rounded deckhouse, rigging and porthole row show close up.
  - At 1,500 ft both ships reduce to silhouette and tone.
- **Kagero:** `kagero-dd-{close,side-close,deck,1500ft}.jpg`.
- **Casablanca:** `casablanca-cve-{close,side-close,deck,1500ft,groove}.jpg`.
  - From the groove (about 450 m astern, 30 m up), the deck is a thin sliver. The planks do not
    read at that range; the arresting wires barely do.

The captures were taken on nexus's 680M in the Hangar. Lighting is the Hangar's, not the game's.

## Rulings by default (2026-10-09; the plan and C1–C5 are silent on each)

1. **No deck camber.**
   - Every armament position in the specs is measured from the deck edge's height (`stand()`). A
     crowned deck would bury the centerline turrets and mounts, or force every spec `y` to be
     re-derived just before M2–M4 read them.
   - Sheer was already modeled.
   - This leaves camber, one of C2's items, undone.
2. **The atlas stays at 2,048 px.** At 4,096 px the texture bytes roughly quadruple. Pennsylvania's
   skin is about 1 MB at 2,048 px, so 4,096 would pass 3 MB (C5).
3. **AO goes into the base color only.** There is no glTF occlusion texture: the loader would apply
   it to indirect light as well, which would darken twice. This costs no extra bytes.
4. **Shared charts are not baked.** Charts made inside `shared_chart()` overlap, so a bake would paint
   them with each other's texels. That excludes turrets, gun kits, railings and small fittings. Each
   script's big walls (superstructure, island, hangar, funnels) were moved out of `shared_chart()`
   so that they bake.
5. **Railings are thin geometry,** 4-sided struts about 0.05 m across, because the build has no alpha
   path.
6. **Detail placement.** A detail's origin sits just off its surface, and the bake casts from that
   origin back along the axis, so a gun mount between the two can't capture it. Positions were
   chosen clear of the mounts, Carley floats and the hangar openings.
7. **The committed AO is stored as one gray channel.** The values are identical; the file goes from
   1.1 MB to 628 KB.

## Tests

- `tests/tools/models/skin/bake.test.ts` (new) covers:
  - the bake darkens and tilts only the listed patches;
  - a sidecar without a `baked` list ignores a bake;
  - `checkBake` refuses a moved raw glb, detail list, size or model, by name.

  Each was seen red against a disabled check.
- `tests/tools/models/skin/layers.test.ts` gains a planks test: boards differ, seams are darker, and
  a downward face is untouched. It was seen red with the branch disabled.
- The byte-identical rebuilds of all three Blender ships (`blenderEntries.test.ts`) pass from the
  committed bakes. So do `ships.test.ts`'s coplanar-face check (which caught a Kagero railing
  touching the bridge) and the skin, manifest and output suites.
- **Hangar E2E on the 680M:** 20 of 22 pass, including check 15's luminance (with no re-baseline
  needed) and check 17's mounts.
  - Checks 1 and 7 time out at 60 s.
  - `main` fails both the same way on the same machine (loopback server, measured 2026-10-09), so
    they are existing 680M timeouts, not regressions.
  - Run them on the reference GPU if in doubt.

## Open items

- **Casablanca's flight deck shows a large light patch** aft of the island in the Hangar
  (`casablanca-cve-deck.jpg`, `-1500ft.jpg`). It is already in the M1b capture
  (`2026-10-09-m1b-aa-mounts-shots/casablanca-cve-hangar-rest-and-swept.jpg`), so it is not from
  M1c. The cause is not found: the flight deck's base color is uniform in the atlas.
- **Deck camber** (ruling 1).
- **Pennsylvania's deck reads brownish wood rather than Deck Blue** in the Hangar. This is the existing
  deck-planks scan under the Measure 21 palette, unchanged here.
- **The kits are unbaked.** The turrets and gun kits are instanced, shared-chart parts with no AO or
  detail normal.
- **Re-bake after any change** to a ship script's geometry, UVs or `detail()` list:
  `npm run models:bake -- <id>` (Ryzen must be awake), then `npm run models:build -- <id>`.
