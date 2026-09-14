# Assets

Every bundled asset is recorded here **before** it is committed: source URL,
author, and license. The repo is public and AGPL-3.0, so unverifiable asset
provenance is the project's main legal exposure — free model sites are riddled
with license laundering, and a retroactive audit is far worse than the
discipline of adding a row.

Third-party code must be AGPL-compatible (MIT, BSD, Apache-2.0 are).

## 3D models

None yet.

| Asset | Source | Author | License |
| --- | --- | --- | --- |

## Textures and audio

None yet.

| Asset | Source | Author | License |
| --- | --- | --- | --- |

## Terrain source data

Not committed — terrain tiles are cached under `tools/terrain/cache/` (gitignored
via `/tools/**/cache/` and `*.tif`, both present in `.gitignore`, checked
2026-09-13) and are hundreds of megabytes (see spec §10). Attribution for the
source datasets:

| Dataset | Source | License / terms |
| --- | --- | --- |
| Copernicus DEM GLO-30 | ESA / Copernicus Programme | Recorded below, fetched 2026-09-13 |
| GEBCO 2024 bathymetry | GEBCO Compilation Group | To be recorded with the pipeline, before first use |
| ESA WorldCover 10 m | ESA WorldCover project | To be recorded with the pipeline, before first use |

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
  6(b)):** since Task 6+ will resample/reproject these tiles into the game's
  terrain mesh, this is the wording that will need to accompany the shipped
  game (in-game credits / README, not yet wired up as of this task):
  > produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus
  > Defence and Space GmbH 2014-2018 provided under COPERNICUS by the
  > European Union and ESA; all rights reserved.
- **Known dataset gap, not a bug:** GLO-30 Public does not publish tiles for
  1°×1° cells that are 100% open ocean — the bucket's `readme.html` states
  "ocean areas do not have tiles, there one can assume height values equal
  to zero." One of the nine tiles this world's bounding box touches
  (`N11_00_E126_00`, Philippine Sea) is such a cell: confirmed 404 plus an
  empty `ListObjectsV2` result for that prefix, 2026-09-13.
  `tools/terrain/fetch.ts`'s `ensureAllTiles` treats this specific case (HTTP
  404 only) as "no tile here", not a download failure, and caches the other
  eight (~107 MB total, 2026-09-13).
