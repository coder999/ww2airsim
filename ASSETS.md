# Assets

Every bundled asset is recorded here **before** it is committed: source URL,
author, and license. The repo is public and AGPL-3.0, so unverifiable asset
provenance is the project's main legal exposure — free model sites are riddled
with license laundering, and a retroactive audit is far worse than the
discipline of adding a row.

Third-party code must be AGPL-compatible (MIT, BSD, Apache-2.0 are).

## 3D models

Original procedural airfield structures and instanced tree geometry in
`src/render/scene/airfield.ts` and `vegetation.ts`, authored for this project,
AGPL-3.0-or-later. The layout is period-inspired, not a surveyed 1944 reconstruction.

| Asset | Source | Author | License |
| --- | --- | --- | --- |
| `src/render/scene/ship.ts` | original procedural hulls, built from the class dimensions in `content/ships/` | authored for this project | AGPL-3.0-or-later |
| `content/aircraft/wildcat.glb` | https://sketchfab.com/3d-models/grumman-f4f-wildcat-airplane-ac26b8bf6be44ba7b903ca7fbdedf7e4 | rojatsu | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required |
| `content/aircraft/a6m2-zero.glb` | https://sketchfab.com/3d-models/mitsubishi-a6m2-zero-zeke-d701787b75fa4c979792b0c0c14221e2 | SavinienBerault | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required |
| `content/aircraft/f6f-hellcat.glb` | https://sketchfab.com/3d-models/f6f-d64f29e7f1c144e6a0712ea12d83a91e | manilov.ap | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required |
| `content/aircraft/f4u-corsair.glb` | https://sketchfab.com/3d-models/f4u-b042ee1ca0674810a7d05a7a568dd284 | manilov.ap | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required |
| `content/aircraft/ki-43-oscar.glb` | https://sketchfab.com/3d-models/ki43-abdc04cc7afb4aeba0eaac6c5079d6e6 | manilov.ap | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required |
| `content/aircraft/d3a-val.glb` | https://sketchfab.com/3d-models/aichi-d3a-val-6f47d38de28b4a879481850b68bca501 | helijah | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required |
| `content/aircraft/b-17-flying-fortress.glb` | https://sketchfab.com/3d-models/boeing-b-17-flying-fortress-927f07f6ddcf470ab0387ce5829024d5 | helijah | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required |
| `content/aircraft/ki-84-frank.glb` | authored in Blender by `tools/models/blender/ki-84-frank.py` from the cited dimensions in its header (English Wikipedia, Ki-84-Ia specifications); every estimate labeled there | authored for this project | AGPL-3.0-or-later |
| `content/aircraft/ki-21-sally.glb` | authored in Blender by `tools/models/blender/ki-21-sally.py` from the cited dimensions in its header (English Wikipedia, Ki-21-IIb specifications); every estimate labeled there | authored for this project | AGPL-3.0-or-later |
| `content/aircraft/g4m-betty.glb` | authored in Blender by `tools/models/blender/g4m-betty.py` from the cited dimensions in its header (English Wikipedia, G4M1 specifications); every estimate labeled there | authored for this project | AGPL-3.0-or-later |
| `content/aircraft/b-29-superfortress.glb` | authored in Blender by `tools/models/blender/b-29-superfortress.py` from the cited dimensions in its header (English Wikipedia, B-29 specifications); every estimate labeled there | authored for this project | AGPL-3.0-or-later |
| `content/aircraft/p-38-lightning.glb` | authored in Blender by `tools/models/blender/p-38-lightning.py` from the cited dimensions in its header (English Wikipedia, P-38L specifications); every estimate labeled there | authored for this project | AGPL-3.0-or-later |
| `content/ships/essex-cv.glb` | https://sketchfab.com/3d-models/uss-enterprise-model-for-small-scale-printing-bf79e093d4c94b0eb02097c178dd6e98 | KTKloss | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required; modified for this project (Track M, M1, 2026-10-08): gun mounts carved into instanced kits, missing AA kits added |
| `content/ships/fletcher-dd.glb` | https://sketchfab.com/3d-models/fletcher-5cddc3309139413e8c08462c8741b884 | JZHU (@hellomynameis.jeffz) | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required; modified for this project (Track M, M1, 2026-10-08): gun mounts carved into instanced kits, missing AA kits added |
| `content/ships/type-b-maru.glb` | https://sketchfab.com/3d-models/liberty-ship-a1db8e8414464c5d8b11383e202fcf26 | AlanTinka | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required |
| `content/ships/cleveland-cl.glb` | https://sketchfab.com/3d-models/uss-cleveland-model-fpr-14000-printing-da03808e0aa74ca89a237ce4da2ac29e | KTKloss | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required; modified for this project (Track M, M1, 2026-10-08): gun mounts carved into instanced kits, missing AA kits added |
| `content/ships/mogami-ca.glb` | https://sketchfab.com/3d-models/ijn-mogami-model-for-14000-printing-89ccafb8c0884b868d806d7654f0fa71 | KTKloss | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required; modified for this project (Track M, M1, 2026-10-08): gun mounts carved into instanced kits, missing AA kits added |
| `content/ships/yamato-bb.glb` | https://sketchfab.com/3d-models/ijn-musashi-model-for-small-scale-printing-698f9b6de9204609ae09aaa98f6f1e30 | KTKloss | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required; modified for this project (Track M, M1, 2026-10-08): gun mounts carved into instanced kits, missing AA kits added |
| `content/ships/shiratsuyu-dd.glb` | https://sketchfab.com/3d-models/samidare-destroyer-b37939147c854e61857f5b248f9efd29 | everlasting17th (@everlastinggrey) | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required; modified for this project (Track M, M1, 2026-10-08): gun mounts carved into instanced kits, missing AA kits added |
| `content/ships/pennsylvania-bb.glb` | original Blender model from the cited dimensions and U.S. Navy plan references in `tools/models/blender/pennsylvania-bb.py` | authored for this project | AGPL-3.0-or-later |
| `content/ships/kagero-dd.glb` | original Blender model from the cited dimensions and naval technical references in `tools/models/blender/kagero-dd.py` | authored for this project | AGPL-3.0-or-later |
| `content/ships/casablanca-cve.glb` | original Blender model from the cited dimensions and U.S. Navy photo references in `tools/models/blender/casablanca-cve.py` | authored for this project | AGPL-3.0-or-later |
| `tools/models/bakes/*/{ao,normal}.png` | M1c committed bakes: Cycles renders of each ship script's own geometry and its `detail()` list (`tools/models/blender/bake.py`); no outside texture | authored for this project | AGPL-3.0-or-later |
| `content/vehicles/type97-chi-ha.glb` | https://sketchfab.com/3d-models/type-97-chi-ha-d3568f32ec4440848e243e4b893a8ba6 | snrnsrk5 | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required |
| `content/vehicles/willys-mb-jeep.glb` | https://sketchfab.com/3d-models/willys-mb-jeep-red-orchestra-darkest-hour-3b005266a1514f7bb7370c86168aba98 | MattyNL | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required |
| `content/ordnance/an-m65.glb` | generated by `tools/models/generated/an-m65.ts` from the cited dimensions in its header (OP 1664, 1947; AWM C285409) | authored for this project | AGPL-3.0-or-later |
| `content/ordnance/hvar.glb` | generated by `tools/models/generated/hvar.ts` from the cited dimensions in its header (NASM A19820116000; OP 1664, 1947) | authored for this project | AGPL-3.0-or-later |
| `content/buildings/hangar.glb` | authored in Blender by `tools/models/blender/hangar.py` from the cited footprint in its header (content/bases/tacloban.json); estimates taken from src/render/scene/buildings.ts, each labeled in the script's header | authored for this project | AGPL-3.0-or-later |
| `content/buildings/tower.glb` | authored in Blender by `tools/models/blender/tower.py`; footprint from content/bases/tacloban.json (tacloban-tower), every other figure an ESTIMATE labeled in the script's header | authored for this project | AGPL-3.0-or-later |
| `content/buildings/aaa.glb` | authored in Blender by `tools/models/blender/aaa.py`; footprint from content/bases/tacloban.json (tacloban-aaa-1), barrel length from the Type 96 25 mm AT/AA gun article, every other figure an ESTIMATE labeled in the script's header | authored for this project | AGPL-3.0-or-later |
| `content/buildings/coastal-gun-battery.glb` | authored in Blender by `tools/models/blender/coastal-gun-battery.py`; barrel length from U.S. War Department TM-E 30-480 (1944), every other figure an ESTIMATE labeled in the script's header | authored for this project | AGPL-3.0-or-later |
| `content/buildings/fuel-tank-farm.glb` | authored in Blender by `tools/models/blender/fuel-tank-farm.py`; every figure is an ESTIMATE labeled in the script's header | authored for this project | AGPL-3.0-or-later |
| `content/buildings/ammunition-bunker.glb` | authored in Blender by `tools/models/blender/ammunition-bunker.py`; every figure is an ESTIMATE labeled in the script's header | authored for this project | AGPL-3.0-or-later |
| `content/buildings/barracks-and-huts.glb` | authored in Blender by `tools/models/blender/barracks-and-huts.py`; barracks footprint from src/render/scene/airfield.ts (AIRFIELD_HUTS), every other figure an ESTIMATE labeled in the script's header | authored for this project | AGPL-3.0-or-later |
| `content/buildings/pier-and-warehouses.glb` | authored in Blender by `tools/models/blender/pier-and-warehouses.py`; every figure is an ESTIMATE labeled in the script's header | authored for this project | AGPL-3.0-or-later |
| `content/buildings/radio-radar-station.glb` | authored in Blender by `tools/models/blender/radio-radar-station.py`; every figure is an ESTIMATE labeled in the script's header | authored for this project | AGPL-3.0-or-later |
| `content/buildings/revetment.glb` | authored in Blender by `tools/models/blender/revetment.py`; every figure is an ESTIMATE labeled in the script's header | authored for this project | AGPL-3.0-or-later |

Models authored in Blender (`tools/models/blender/`, model-roster spec) are
original work, AGPL-3.0-or-later. Each gets its row here when it ships.

`content/aircraft/wildcat.glb` is a texture-recompressed derivative of the
Sketchfab download above, produced 2026-09-24 by the first `tools/models/build.ts`
via `@gltf-transform/cli`'s `optimize` command -- textures resized to
1024x1024 and re-encoded as WebP, every material forced opaque. That recipe
is `tools/models/legacy.ts`; its entry, `tools/models/entries/wildcat.json`, was
`frozen` from Z1 (2026-09-25) until C1 batch 2 (2026-10-08), when the recipe
was shown to rebuild the committed file byte for byte from the raw download, and
the entry took `legacyOptimize` instead. Retrieved
and verified rigged (separate, named landing-gear nodes with baked
retraction keyframes) 2026-09-24. Node names used by
`src/render/scene/wildcat.ts`: `Helice` (propeller), `GRP_Rueda_Der` /
`GRP_Rueda_Izq` (main gear, right/left). The model has no flap geometry.

**Modified in the build (C1 batch 2, 2026-10-08; CC-BY 4.0 permits modification
with the change indicated):** ailerons are cut out of the outer wing,
65.5% to 92.5% of the semispan with 22.8% of the chord behind the hinge (the
F4F-3's, NACA ACR, Kleckner, 1942), as nodes `AileronR` and `AileronL`. The cut
faces are capped. The model's own inboard `Aleron_*` pieces, which sit where the
real airplane's split flaps are, are drawn static; split-flap plates beneath
them are drawn in code (`src/render/scene/wildcat.ts`).

**Modified at draw time (W1, 2026-09-28; CC-BY 4.0 permits modification with
the change indicated):** the game lengthens both main landing-gear legs of this
model. `wildcatGearStretch` (`src/render/scene/wildcat.ts`) scales each main
strut (`polySurface272`, `polySurface277`) along its length about its top and
moves the wheel and axle bolt down with it, by up to 0.4445 m at full scale,
telescoping out over the last quarter of the gear's travel. The long legs park
the drawing at Grumman's static ground angle of 12°20′, where the model's own
legs give 7.43°. The glb file itself is unchanged.

The three ship glbs (S1, 2026-09-25) are built by `npm run models:build` from
`tools/models/entries/{essex-cv,fletcher-dd,type-b-maru}.json`. Each license
was read from `api.sketchfab.com/v3/models/<uid>` on the fetch date,
2026-09-25, and re-read at build time the same day: CC BY 4.0, downloadable, unpriced. The
build changed each download: it fitted it to its `content/ships/*.json`
(deck- or hull-fit, spec `docs/superpowers/specs/2026-09-25-ship-models-design.md`
§4), recolored it in palette roles with metalness 0, set lattice alpha to MASK,
dropped unused attributes, tangents and `KHR_materials_specular`, and
re-encoded textures as WebP. Two are stand-ins: USS Enterprise (CV-6),
Yorktown class, 15,339 triangles, rendered as the Essex-class `essex-cv`, with
a 3 m skirt below its waterline cut; and a Liberty ship, 42,735 triangles,
rendered as the Japanese Type B freighter `type-b-maru`. The Fletcher, 43,316
triangles, is its own class. `src/render/scene/ship.ts`'s procedural hulls stay
as the fallback for a ship with no model.

The seven R3 aircraft downloads (2026-09-27) are built by `npm run
models:build` from `tools/models/entries/<id>.json`. Each license was read
from `api.sketchfab.com/v3/models/<uid>` on 2026-09-27: CC BY 4.0,
downloadable. Each was fitted to its cited span, and every triangle count
below was measured from the cached download and the committed glb on
2026-09-27. The A6M2 Zero went from 187,441 to 91,968 triangles (simplify
0.45; prop never simplified). Nothing was removed, and its fused drop tank
stays. No yaw. Rigged: `Prop`, `GearL`, `GearR`, `Tailwheel`. The F6F
went from 36,605 to 26,399: the build removed the pilot figure, three
rockets per wing, two center-section bombs and the extended tail hook.
Yaw 151.84°. Rigged: `Prop`, `GearL`, `GearR`, `Tailwheel`, with the
spinner fused. The F4U went from 29,533 to 15,296: the build removed the
pilot and a duplicate canopy. Yaw 124.03°. Rigged: `Prop`, which is a
translucent blur disc with no blades, split with its spinner; also `GearL`,
`GearR`, `Tailwheel`. The Ki-43 went from 19,284 to 17,240: the build
removed two duplicate canopies and two drop tanks. Yaw 148.7°. Rigged:
`Prop` (a blur disc, with its spinner), `GearL`, `GearR`. Its tailwheel is
fixed on the real aircraft and not rigged. The D3A went from 293,440 to
55,144: the build removed the belly bomb, cockpit instrument faces and the
hidden rear cylinder row, and simplified the rest of the engine (0.15).
No yaw. Rigged: `Prop`. Its gear is fixed on the real aircraft and not
rigged. The G4M download was replaced on 2026-09-29 by an
original Blender model, `tools/models/blender/g4m-betty.py`, rigged
`Prop1`, `Prop2`, `GearL`, `GearR`, `Turret1`. The B-17
went from 763,214 to 98,683: the build removed the hidden engine
internals (377,168 triangles), cockpit instrument faces and screws, and
simplified the visible cylinder rings (0.1). No yaw. Rigged: `Prop1` to
`Prop4` (blades only; spinners fused), `GearL`, `GearR`, `Tailwheel` (tire
only; fork fused), `Turret1` to `Turret3` (chin, top, ball). The tail guns
are fused. `p38-lightning.glb` (manilov.ap) was not used: it is 5.2% long
at the cited span, so the P-38 is an original Blender model.

The two R5 vehicle downloads were measured and built on 2026-09-28. The
Type 97 Chi-Ha stayed at 3,969 triangles: the build removed nothing and
split its turret and gun into `Turret1`. The Willys MB download went from
19,099 to 9,432 triangles: the build removed the canvas-top jeep's 128
shells and 9,667 triangles, leaving the selected open jeep's 130 shells.
The retained jeep was squared by a -5.7° yaw and fitted from its measured
1.773-source-unit wheelbase to the cited 2.032 m wheelbase, producing a
3.377 m length fit.

### Candidate models (downloaded, not bundled)

Staged in `content/models/candidates/` (gitignored), each with a
`<name>.sketchfab.json` beside it holding the uid, author, license slug and
fetch time. The ships, props and low-poly models were fetched 2026-09-25
through the Sketchfab download API. The eight aircraft with underscore names
were downloaded by hand on 2026-09-24 from
`docs/handoff/2026-09-24-aircraft-model-candidates.md`; their source was
recovered 2026-09-25 from the attribution Sketchfab embeds in every glTF
export (`asset.extras`), then re-checked against the API. **None ships yet.** Promoting one
means building it through `tools/models/` and moving its row into the table
above.

Each license was read from `api.sketchfab.com/v3/models/<uid>`, not the page,
on the fetch date. That proves only what the uploader chose. Authorship was
judged separately, from the description and the uploader's other models, and
everything below showed no rip or re-upload signs. "Faces" is the
triangle count after glTF import.

| Candidate | Source | Author | License | Faces | Notes |
| --- | --- | --- | --- | --- | --- |
| `f6f-hellcat-lowpoly.glb` | https://sketchfab.com/3d-models/f6f-hellcat-5b0151482fa745d5ade945be7963262e | snrnsrk5 | CC-BY 4.0 | 2k | Low-poly, textured |
| `a6m3-zero-lowpoly.glb` | https://sketchfab.com/3d-models/mitsubishi-a6m3-zero-cb9fa84167ac4efa9d8aebcab133f7f3 | Mamoru_Morimoto | CC-BY 4.0 | 1k | Low-poly |
| `bomb-m64-500lb.glb` | https://sketchfab.com/3d-models/low-poly-wwii-style-500lb-bomb-c6f4e1adb6f940ae83d0386e79d5ca1c | Pippa (@Planetrix23) | CC-BY 4.0 | 1k | US M64 |
| `torpedo-bliss-leavitt-mk2.glb` | https://sketchfab.com/3d-models/torpedo-mk2-993688382c4a41489a11d26814c72178 | AlanTinka | CC-BY 4.0 | 121k | A 1904-era ship torpedo, not the aerial Mk 13 |
| `flag-rising-sun.glb` | https://sketchfab.com/3d-models/flag-of-the-rising-sun-japanese-flag-77ae0df787c445818849a787c0a0ca85 | Mamoru_Morimoto | CC-BY 4.0 | 8k | IJN naval ensign |
| `a6m_zero.glb` | https://sketchfab.com/3d-models/a6m-zero-dfc211d9a0684d90b3f0d09ec560e97f | zdw930 | CC-BY 4.0 | 5k | **Authorship uncertain:** no origin stated, and the account also posts a "Do-17z-7 Reskin". Prefer `a6m3-zero-lowpoly.glb` |
| `boeing_b-29_superfortress.glb` | https://sketchfab.com/3d-models/boeing-b-29-superfortress-5b051209bff445ff88eab3bd94fdfdfd | Spark_Customs | CC-BY 4.0 | 45k | **Suspect, do not ship as-is:** this account's Essex carrier says "Imported from Free3D" (a personal-use license), and its uploads span unrelated aircraft and cars with no tags |

All require author credit under CC-BY 4.0
(https://creativecommons.org/licenses/by/4.0/).

**Checked and rejected 2026-09-25**, so they are not re-found:

- Shinano-class "Kii": no license, not downloadable; the description says "taken from World of Warships".
- Akagi (ThomasBeerens), Type 97 Shinhoto Chi-Ha 120mm (AdamKozakGrafika), A6M Zero (NETRUNNER_pl): Sketchfab Standard license, sold, not downloadable.
- B-29 (Escou): not downloadable, sold on Fab.
- Everything by kriss50, KojfDiscord, lxyun_2 and oiopu: self-declared game rips or re-uploads.
- bsterling's USS Cleveland: relabeled CC-BY, but the original was CC-BY-NC.
- P-38 (manilov.ap, `p38-lightning.glb`, CC-BY 4.0), checked 2026-09-27: license and authorship fine, but fitted to the P-38L's cited 15.85 m span it is 12.13 m long, +5.2% over the cited 11.53 m (R3's 4% tolerance), and no variant matches. `content/aircraft/p-38-lightning.glb` is an original Blender model instead.

## Textures and audio

Original deterministic terrain and weathering textures generated by
`src/render/terrain/surface.ts`, AGPL-3.0-or-later. Bitmap assets are the
title art and the terrain textures below. Cloud noise volumes under `content/sky/` are generated by
`tools/sky/build.ts` and `tools/sky/cumulus.py`, original, AGPL-3.0-or-later (`content/sky/NOTICE.md`).

| Asset | Source | Author | License |
| --- | --- | --- | --- |
| `content/audio/rocket_whoosh.wav` | ElevenLabs sound generation (generative AI) | Mark Tuttle | ElevenLabs Terms of Service, commercial use granted on the paid plan; see `content/audio/NOTICE.md` |
| `content/audio/gear_cycle.wav` | ElevenLabs sound generation (generative AI) | Mark Tuttle | ElevenLabs Terms of Service, commercial use granted on the paid plan; see `content/audio/NOTICE.md` |
| `content/audio/voice/*.wav` (68 radio lines) | ElevenLabs text-to-speech (generative AI) | Mark Tuttle | ElevenLabs Terms of Service, commercial use granted on the paid plan; see `content/audio/NOTICE.md` |
| `content/audio/bombs_away.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/audio/explosion.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/audio/landing_squeak.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/audio/machinegun.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/audio/propeller.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/audio/water_crash.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/audio/engine_radial_small.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/audio/engine_radial_big.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/audio/engine_multi_heavy.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/audio/engine_allison_v12.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/audio/engine_sputter.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/audio/hit_taken.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/audio/sea_waves.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/audio/carrier_deck.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/audio/wire_catch.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/audio/flak_distant.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/audio/hook_clunk.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/art/title.png` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/art/NOTICE.md` |
| `content/textures/terrain-albedo.ktx2` + `terrain-normal.ktx2` layer 0 (sand), built by `tools/textures/build.ts` | https://polyhaven.com/a/aerial_beach_01 | Rob Tuytel | CC0 |
| layer 1 (grass) | https://polyhaven.com/a/leafy_grass | Charlotte Baglioni | CC0 |
| layer 2 (dirt) | https://polyhaven.com/a/dirt_aerial_02 | Rob Tuytel | CC0 |
| layer 3 (jungle floor) | https://polyhaven.com/a/forest_leaves_02 | Rob Tuytel | CC0 |
| layer 4 (rock) | https://polyhaven.com/a/aerial_rocks_02 | Rob Tuytel | CC0 |
| wear, normal and roughness maps inside `content/ordnance/*.glb`, built by `tools/models/generated/paint.ts`, and the painted-metal detail baked into Blender skins by `tools/models/skin/` | https://polyhaven.com/a/blue_metal_plate | Rob Tuytel | CC0 |
| corrugated-iron detail baked into Blender skins by `tools/models/skin/` | https://polyhaven.com/a/worn_corrugated_iron | Dimitrios Savva (photography), Jenelle van Heerden (processing) | CC0 |
| concrete detail baked into Blender skins by `tools/models/skin/` | https://polyhaven.com/a/concrete_floor_worn_001 | Dimitrios Savva (photography), Rico Cilliers (processing) | CC0 |
| deck-planking detail baked into ship skins by `tools/models/skin/` | https://polyhaven.com/a/weathered_brown_planks | Dimitrios Savva (photography), Rico Cilliers (processing) | CC0 |
| `content/fx/fx-light-a.ktx2`, `fx-light-b.ktx2`, `fx-motion.ktx2`, `sheets.json` (placeholder flipbooks, built by `tools/fx/build.ts`) | generated in code from seeded noise, no source material | authored for this project | AGPL-3.0-or-later |
| `content/vendor/basis/basis_transcoder.{js,wasm}` (copied from three r186 `examples/jsm/libs/basis/`) | https://github.com/BinomialLLC/basis_universal | Binomial LLC | Apache-2.0 |

## Fonts

Self-hosted for the Naval Communications design system
(`src/render/ui/naval-comms.css`), replacing the design prototype's runtime
`fonts.googleapis.com` fetch. Retrieved 2026-09-24 from Google Fonts' CDN;
license verified per-font against `google/fonts` GitHub metadata rather than
assumed — see `content/fonts/NOTICE.md` for the verification detail and why
the two fonts turned out to carry different licenses.

| Asset | Source | Author | License |
| --- | --- | --- | --- |
| `content/fonts/special-elite.woff2` | `https://fonts.gstatic.com/s/specialelite/v20/XLYgIZbkc4JPUL5CVArUVL0ntnAOSA.woff2` | Astigmatic (Brian J. Bonislawsky) | Apache-2.0; see `content/fonts/NOTICE.md` |
| `content/fonts/stardos-stencil.woff2` | `https://fonts.gstatic.com/s/stardosstencil/v15/X7n94bcuGPC8hrvEOHXOgaKCc2Th6F52.woff2` | Vernon Adams | SIL Open Font License 1.1; see `content/fonts/NOTICE.md` |

## Terrain source data

River centre lines in `content/scenery/rivers.json`: © OpenStreetMap
contributors, ODbL 1.0. Retrieved 2026-09-18 UTC through Nominatim for Binahaan
and Daguitan rivers. Source URLs and extraction steps are in
`content/scenery/NOTICE.md`; the notice and editable data ship with the build.
Visual widths are estimates. Modern courses are not certified as historical.

Not committed — terrain tiles are cached under `tools/terrain/cache/` (gitignored
via `/tools/**/cache/` and `*.tif`, both present in `.gitignore`, checked
2026-09-13) and measure 106,966,683 bytes over eight tiles (2026-09-14).
Attribution for the
source datasets:

| Dataset | Source | License / terms |
| --- | --- | --- |
| Copernicus DEM GLO-30 | ESA / Copernicus Programme | Recorded below, fetched 2026-09-13 |
| GEBCO_2026 bathymetry | GEBCO Bathymetric Compilation Group 2026 | Public domain with acknowledgement; derived game data, no official status or endorsement; not for navigation. See `content/ocean/NOTICE.md` and the provenance below. |
| ESA WorldCover 10 m 2021 v200 | ESA WorldCover consortium (VITO, Brockmann Consult, CS, GAMMA, IIASA, WUR) | CC BY 4.0; attribution in `content/landcover/NOTICE.md` and the in-app credits line. Fetched 2026-09-17. |

**The GEBCO row said "GEBCO 2024" until 2026-09-15.** GEBCO publishes annually
and the current release is **GEBCO_2026** (April 2026, DOI
`10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa`), confirmed against the dataset
itself on 2026-09-15 — a subset fetch over CEDA's OPeNDAP returned
`Int16 elevation[lat = 43200][lon = 86400]`, 15 arc-second global coverage. The
year in a dataset name is a fact with a shelf life, which is why this note is
dated and the row above is not a citation.

### Derived terrain committed to this repo — 2026-09-14 (Task 6)

The *source* tiles are still never committed. What is committed is the
pipeline's output, which is a derivative work of them:

- `content/terrain/header.json` plus `L4.bin`…`L12.bin` — 703,306 bytes, the
  offline fallback a fresh clone gets. Generated by `npm run terrain:build`
  (`tools/terrain/build.ts`) from the eight cached tiles below.
- `content/terrain/tiles/L0.bin`…`L3.bin` — 178 MB, gitignored via
  `.gitignore`'s `/content/terrain/tiles/`.
- `content/terrain/NOTICE.md` — the licence notice that must travel WITH the
  derived data; see Article 6(b)/6(c) below.
- The output is byte-reproducible from the same cache: the SHA-256 of every
  committed file, and of all eight source tiles, is pinned as a literal in
  `tests/tools/terrainBuild.test.ts` rather than recompared run-to-run.

### Copernicus DEM GLO-30 — recorded 2026-09-13 (Task 3, terrain fetch)

- **Source URL:** `https://copernicus-dem-30m.s3.amazonaws.com/` (AWS Open
  Data, public, unauthenticated — confirmed live 2026-09-13). Fetched via
  `tools/terrain/fetch.ts`, which builds each tile's URL from
  `tools/terrain/tiles.ts`'s `tileUrl()`.
- **Dataset:** Copernicus DEM, instance **GLO-30 Public**
  (`COP-DEM-GLO-30-F`, "Global 30m Full, Free & Open"), a Digital Surface
  Model at 30 m / 1 arcsecond horizontal sampling. The nine 1°×1° tiles the
  200 km Leyte Gulf world needs are enumerated by `tilesCovering(100e3)`.
  Object `Last-Modified` on the bucket for the tiles actually fetched here is
  2022-05-09 (checked via `curl -I` against a fetched tile 2026-09-13); the
  bucket publishes no separate dataset version tag beyond that.
- **Producer:** Copernicus WorldDEM-30 is derived from TanDEM-X mission data
  produced by **Airbus Defence and Space GmbH**; distributed under the
  **Copernicus Programme** (European Union / ESA), building on **DLR e.V.**
  source data. AWS hosts this specific COG-converted copy as a Registry of
  Open Data listing.
- **License:** *"Licence for Copernicus DEM instance COP-DEM-GLO-30-F Global
  30m Full, Free & Open"* (the Copernicus WorldDEM-30 end-user licence), a
  free, worldwide, perpetual, non-exclusive licence to reproduce, distribute,
  communicate to the public, and adapt/modify/combine, with attribution and
  no-liability obligations. Retrieved and read in full 2026-09-13 from
  `https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/DEM/resources/license/License-COPDEM-30.pdf`
  (linked from the bucket's own `readme.html`, License section, which points
  to `https://spacedata.copernicus.eu/en/web/guest/collections/copernicus-digital-elevation-model/#Licencing`).
  This is a data licence, not source code, so the repo's AGPL-3.0
  code-compatibility rule above does not apply to it — it governs the raw
  DEM tiles cached locally, which are never committed (see `.gitignore`
  rules above) and are only ever the *input* to a pipeline that generates
  the terrain the game actually ships.
- **Required attribution string (Licence Article 6(a), used as distributed):**
  > © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018
  > provided under COPERNICUS by the European Union and ESA; all rights
  > reserved.
- **Required attribution string when adapted/modified (Licence Article
  6(b)):** Task 6 resampled these tiles into the game's world grid, so this is
  the wording that must accompany the shipped, derived data:
  > produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus
  > Defence and Space GmbH 2014-2018 provided under COPERNICUS by the
  > European Union and ESA; all rights reserved.
- **Required no-liability notice (Licence Article 6(c)):** triggers on the
  same act as 6(a)/6(b) — distributing or communicating the DEM (modified or
  not) to the general public. Task 6 commits *derived* terrain tiles into
  this public repository, which is that trigger:
  > The organisations in charge of the Copernicus programme by law or by
  > delegation do not incur any liability for any use of the Copernicus
  > WorldDEM-30.
  The licence text (Article 6(c) in full) additionally requires ensuring
  Subsequent Users understand that neither the Licensor nor other Copernicus
  programme entities may be held liable "with regard to any aspect of the
  Copernicus WorldDEM-30" — the quoted sentence above is what must literally
  appear in whatever notice accompanies the shipped, derived tiles.
  **Discharged 2026-09-14 (Task 6):** all three strings (6(a), 6(b), 6(c)) are
  quoted verbatim in `content/terrain/NOTICE.md`, which is committed into the
  same directory as the derived `L4.bin`…`L12.bin`, so a recipient of only
  those files still receives the notice.
- **Known dataset gap, not a bug:** GLO-30 Public does not publish tiles for
  1°×1° cells that are 100% open ocean — the bucket's `readme.html` states
  "ocean areas do not have tiles, there one can assume height values equal
  to zero." One of the nine tiles this world's bounding box touches
  (`N11_00_E126_00`, Philippine Sea) is such a cell: confirmed 404 plus an
  empty `ListObjectsV2` result for that prefix, 2026-09-13.
  `tools/terrain/fetch.ts`'s `ensureAllTiles` treats this specific case (HTTP
  404 only) as "no tile here", not a download failure, and caches the other
  eight (~107 MB total, 2026-09-13).

## Ocean bathymetry provenance (retrieved 2026-09-15)

GEBCO Bathymetric Compilation Group 2026, **GEBCO_2026 Grid**, published by
NERC EDS British Oceanographic Data Centre NOC; DOI
[10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa](https://doi.org/10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa).
The CEDA ice-surface-elevation OPeNDAP subset is cached by `tools/bathy/fetch.ts`;
its latitude/longitude maps and shape are checked before use. The source is
15 arc-seconds, integer metres, WGS84 horizontal coordinates, assuming mean
sea level vertically (the provider notes mixed source datums near shore).

[Terms](https://www.gebco.net/data-products/gridded-bathymetry/terms-of-use):
public domain; copying, publishing, distribution, adaptation and commercial
use permitted with acknowledgement. No implied official status or GEBCO/IHO/IOC
endorsement, and no misrepresentation. Supplied as is without guaranteed
accuracy or completeness or responsibility for consequences. Not for navigation
or safety at sea. The derived binary is accompanied by `content/ocean/NOTICE.md`.

### ESA WorldCover 10 m 2021 v200 — recorded 2026-09-18 (Plan 13b, land cover)

- **Dataset:** ESA WorldCover 10 m 2021 v200, tiles `N09E123` and `N09E126`,
  from `https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/`
  (public bucket, anonymous access, fetched 2026-09-17).
- **Producer:** ESA WorldCover consortium, led by VITO.
- **License:** Creative Commons Attribution 4.0 International ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).
- **Attribution as required:**

  > © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium.

- **What ships:** `content/landcover/cover.bin.gz`, a 1025² four-channel
  coverage-fraction raster on the terrain grid, with the built-up class
  counted as cropland (master spec §4). The build is `npm run landcover:build`
  (`tools/landcover/`); the source tiles are cached under `tools/landcover/cache/`
  and are not committed.
