# Notice — land-cover data in this directory

`cover.bin.gz` is **derived** from ESA WorldCover 2021 v200 (10 m): the
fraction of each 195 m cell covered by tree cover, cropland, mangroves and
open ground, quantized to sixteenths. It is distributed publicly with the
game, so this notice ships with it. Full provenance is in
[`../../ASSETS.md`](../../ASSETS.md), which is authoritative; the strings
below are quoted from it.

## Attribution ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/))

> © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel
> data (2021) processed by ESA WorldCover consortium.

> Zanaga, D., Van De Kerchove, R., Daems, D., De Keersmaecker, W., Brockmann,
> C., Kirches, G., Wevers, J., Cartus, O., Santoro, M., Fritz, S., Lesiv, M.,
> Herold, M., Tsendbazar, N.E., Xu, P., Ramoino, F., Arino, O., 2022. ESA
> WorldCover 10 m 2021 v200. https://doi.org/10.5281/zenodo.7254221

## What was changed

Built-up pixels are counted as cropland (a deliberate 1944 correction, the
13b design spec §2); the eleven classes are collapsed to four land channels
and water; the 10 m pixels are averaged over 195 m cells. Nothing here is a
land-cover product; it is a game's paint guide.
