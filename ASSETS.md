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

`content/aircraft/wildcat.glb` is a texture-recompressed derivative of the
Sketchfab download above, produced 2026-09-24 by the first `tools/models/build.ts`
via `@gltf-transform/cli`'s `optimize` command -- textures resized to
1024x1024 and re-encoded as WebP, geometry untouched. That build is gone:
its entry, `tools/models/entries/wildcat.json`, is `frozen`, so today's
manifest-driven `npm run models:build` skips it rather than regenerate these
bytes (Z1, 2026-09-25). Retrieved
and verified rigged (separate, named landing-gear nodes with baked
retraction keyframes) 2026-09-24. Node names used by
`src/render/scene/wildcat.ts`: `Helice` (propeller), `GRP_Rueda_Der` /
`GRP_Rueda_Izq` (main gear, right/left). The model has no flap geometry.

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
| `fletcher-dd.glb` | https://sketchfab.com/3d-models/fletcher-5cddc3309139413e8c08462c8741b884 | JZHU (@hellomynameis.jeffz) | CC-BY 4.0 | 43k | Generic 1943–44 Fletcher, full hull, rigging |
| `cleveland-cl.glb` | https://sketchfab.com/3d-models/uss-cleveland-model-fpr-14000-printing-da03808e0aa74ca89a237ce4da2ac29e | KTKloss | CC-BY 4.0 | 9k | Printing model, untextured, waterline |
| `mogami-ca.glb` | https://sketchfab.com/3d-models/ijn-mogami-model-for-14000-printing-89ccafb8c0884b868d806d7654f0fa71 | KTKloss | CC-BY 4.0 | 6k | 8-inch heavy-cruiser fit, untextured |
| `musashi-bb.glb` | https://sketchfab.com/3d-models/ijn-musashi-model-for-small-scale-printing-698f9b6de9204609ae09aaa98f6f1e30 | KTKloss | CC-BY 4.0 | 10k | Yamato class, untextured |
| `shiratsuyu-dd-samidare.glb` | https://sketchfab.com/3d-models/samidare-destroyer-b37939147c854e61857f5b248f9efd29 | everlasting17th (@everlastinggrey) | CC-BY 4.0 | 140k | 23 textures; needs decimation |
| `f6f-hellcat-lowpoly.glb` | https://sketchfab.com/3d-models/f6f-hellcat-5b0151482fa745d5ade945be7963262e | snrnsrk5 | CC-BY 4.0 | 2k | Low-poly, textured |
| `a6m3-zero-lowpoly.glb` | https://sketchfab.com/3d-models/mitsubishi-a6m3-zero-cb9fa84167ac4efa9d8aebcab133f7f3 | Mamoru_Morimoto | CC-BY 4.0 | 1k | Low-poly |
| `p38-lightning.glb` | https://sketchfab.com/3d-models/p38-7eab500310604fd996b116f9cd7520a7 | manilov.ap | CC-BY 4.0 | 114k | Untextured |
| `bomb-m64-500lb.glb` | https://sketchfab.com/3d-models/low-poly-wwii-style-500lb-bomb-c6f4e1adb6f940ae83d0386e79d5ca1c | Pippa (@Planetrix23) | CC-BY 4.0 | 1k | US M64 |
| `torpedo-bliss-leavitt-mk2.glb` | https://sketchfab.com/3d-models/torpedo-mk2-993688382c4a41489a11d26814c72178 | AlanTinka | CC-BY 4.0 | 121k | A 1904-era ship torpedo, not the aerial Mk 13 |
| `flag-rising-sun.glb` | https://sketchfab.com/3d-models/flag-of-the-rising-sun-japanese-flag-77ae0df787c445818849a787c0a0ca85 | Mamoru_Morimoto | CC-BY 4.0 | 8k | IJN naval ensign |
| `type97-chi-ha.glb` | https://sketchfab.com/3d-models/type-97-chi-ha-d3568f32ec4440848e243e4b893a8ba6 | snrnsrk5 | CC-BY 4.0 | 4k | Low-poly, textured |
| `willys-mb-jeep.glb` | https://sketchfab.com/3d-models/willys-mb-jeep-red-orchestra-darkest-hour-3b005266a1514f7bb7370c86168aba98 | MattyNL | CC-BY 4.0 | 19k | Made by the uploader for the Darkest Hour mod, not ripped from it |
| `f4u.glb` | https://sketchfab.com/3d-models/f4u-b042ee1ca0674810a7d05a7a568dd284 | manilov.ap | CC-BY 4.0 | 30k | Same author and set as `f6f.glb`, `ki43.glb`, `p38-lightning.glb` |
| `f6f.glb` | https://sketchfab.com/3d-models/f6f-d64f29e7f1c144e6a0712ea12d83a91e | manilov.ap | CC-BY 4.0 | 37k | 276 separate meshes |
| `ki43.glb` | https://sketchfab.com/3d-models/ki43-abdc04cc7afb4aeba0eaac6c5079d6e6 | manilov.ap | CC-BY 4.0 | 19k | |
| `aichi_d3a_val.glb` | https://sketchfab.com/3d-models/aichi-d3a-val-6f47d38de28b4a879481850b68bca501 | helijah | CC-BY 4.0 | 293k | FlightGear modeler; needs decimation |
| `boeing_b-17_flying_fortress.glb` | https://sketchfab.com/3d-models/boeing-b-17-flying-fortress-927f07f6ddcf470ab0387ce5829024d5 | helijah | CC-BY 4.0 | 763k | FlightGear modeler; needs heavy decimation |
| `mitsubishi_g4m.glb` | https://sketchfab.com/3d-models/mitsubishi-g4m-f326a41bfa5f4a34a471e95c663c2368 | Jec (@Jec_Games) | CC-BY 4.0 | 3k | Low-poly game asset |
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

## Textures and audio

Original deterministic terrain and weathering textures generated by
`src/render/terrain/surface.ts`, AGPL-3.0-or-later. Bitmap assets are the
title art and the terrain textures below. Cloud noise volumes under `content/sky/` are generated by
`tools/sky/build.ts`, original, AGPL-3.0-or-later (`content/sky/NOTICE.md`).
`content/audio/rocket_whoosh.wav` is the same category of asset: a synthesized
placeholder generated by `tools/audio/synthesizeRocketWhoosh.ts`, authored for
this project, AGPL-3.0-or-later — pending Mark's real Firefly-recorded rocket
whoosh (Plan 6b Task 10; see `content/audio/NOTICE.md`).

| Asset | Source | Author | License |
| --- | --- | --- | --- |
| `content/audio/rocket_whoosh.wav` | synthesized placeholder, generated by `tools/audio/synthesizeRocketWhoosh.ts` | authored for this project | AGPL-3.0-or-later |
| `content/audio/bombs_away.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/audio/explosion.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/audio/landing_squeak.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/audio/machinegun.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/audio/propeller.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/audio/water_crash.wav` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/audio/NOTICE.md` |
| `content/art/title.png` | Adobe Firefly (generative AI) | Mark Tuttle | Adobe Terms of Use, commercial use granted to the generating user; see `content/art/NOTICE.md` |
| `content/textures/terrain-albedo.ktx2` + `terrain-normal.ktx2` layer 0 (sand), built by `tools/textures/build.ts` | https://polyhaven.com/a/aerial_beach_01 | Rob Tuytel | CC0 |
| layer 1 (grass) | https://polyhaven.com/a/leafy_grass | Charlotte Baglioni | CC0 |
| layer 2 (dirt) | https://polyhaven.com/a/dirt_aerial_02 | Rob Tuytel | CC0 |
| layer 3 (jungle floor) | https://polyhaven.com/a/forest_leaves_02 | Rob Tuytel | CC0 |
| layer 4 (rock) | https://polyhaven.com/a/aerial_rocks_02 | Rob Tuytel | CC0 |
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
