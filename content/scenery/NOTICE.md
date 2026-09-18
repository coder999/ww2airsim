# River centre lines

© OpenStreetMap contributors. Available under the [Open Database License
(ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
See [OpenStreetMap copyright](https://www.openstreetmap.org/copyright).
The ODbL applies to `rivers.json`, separately from this repository's code license.
This derivative database is distributed in editable JSON form with the game.

Retrieved 2026-09-18 UTC through the public Nominatim service:

- https://nominatim.openstreetmap.org/search?q=Binahaan%20River%20Leyte&format=jsonv2&polygon_geojson=1
- https://nominatim.openstreetmap.org/search?q=Daguitan%20River%20Leyte&format=jsonv2&polygon_geojson=1

Each section retains its source OSM URL and original longitude/latitude
coordinates. The extraction removes search metadata and assigns illustrative
widths of 38 m (Binahaan) and 46 m (Daguitan); these widths are not surveyed.
These are present-day centre lines, not a reconstruction of their 1944 course.
Coverage is limited to these two rivers and the sections returned by the queries.

To rebuild: save the responses as `tools/scenery/cache/binahaan.json` and
`daguitan.json`, then run `npx tsx tools/scenery/build.ts`. Respect the public
service's usage policy; this build never makes network requests at runtime.
Later OSM edits can change the upstream data. The committed JSON is the snapshot.
