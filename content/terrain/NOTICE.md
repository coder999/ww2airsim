# Notice — terrain data in this directory

The `.bin` files here are **derived** elevation data: the Copernicus DEM
GLO-30 Public dataset, resampled onto this game's world grid and stored as
int16 decimetres (see `header.json`). They are distributed to the public as
part of a public repository, which is what triggers the attribution and
no-liability obligations of the Copernicus DEM licence (Articles 6(a), 6(b)
and 6(c)). This file exists so that someone who receives **only** these tiles
still receives the notice.

Full provenance — source URL, dataset instance, producer, licence retrieval
date — is in [`../../ASSETS.md`](../../ASSETS.md), which is authoritative; the
strings below are quoted from it.

## Attribution (Licence Article 6(a), the data as distributed)

> © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018
> provided under COPERNICUS by the European Union and ESA; all rights
> reserved.

## Attribution (Licence Article 6(b), the data as adapted — this is what these files are)

> produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus
> Defence and Space GmbH 2014-2018 provided under COPERNICUS by the
> European Union and ESA; all rights reserved.

## No-liability notice (Licence Article 6(c))

> The organisations in charge of the Copernicus programme by law or by
> delegation do not incur any liability for any use of the Copernicus
> WorldDEM-30.

## Not a navigational product

This is a game. The heights here have been resampled, quantised to 0.1 m and
mip-filtered; they are not fit for any purpose requiring real elevation data.
