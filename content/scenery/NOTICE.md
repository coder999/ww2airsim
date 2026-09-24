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

# Towns, villages and the Maharlika Highway alignment

© OpenStreetMap contributors, same ODbL 1.0 terms as above, applying to
`places.json` separately from this repository's code license.
This derivative database is distributed in editable JSON form with the game.

Retrieved 2026-09-24 UTC through the public Overpass API
(`https://overpass-api.de/api/interpreter`, POST, `data=<url-encoded query>`):

```
[out:json][timeout:180];
(
  node["place"~"^(city|town|municipality)$"](9.889374027245568,124.3716407786166,11.707932830277537,126.22835922138339);
  way["highway"~"^(trunk|primary)$"](9.889374027245568,124.3716407786166,11.707932830277537,126.22835922138339);
);
out body;
>;
out skel qt;
```

The bounding box is `tools/landcover/fetch.ts`'s `COVER_BOX` (the same box
the ESA WorldCover tiles use), not a second hand-derived one. The response
(38,528 elements: 108 `place` nodes, 1,897 `highway` ways, the rest bare
geometry nodes) is saved verbatim as `tools/scenery/cache/places-overpass.json`.

**Towns.** Of the 108 `place=city|town|municipality` nodes, only Tacloban and
Ormoc are `'town'`; every other node is `'village'`. This is a two-name
allowlist from design §7's own words, not an OSM tag heuristic — in the real
data, OSM tags 103 of the other 106 settlements `place=town` too (standard
Philippine-municipality tagging practice), so a tag-based rule would
misclassify all of them as `'town'`. A node with no `name` tag throws rather
than emitting a blank or synthesized town name.

**Roads.** Of the 1,897 `highway=trunk|primary` ways, a road's `name` is
`tags.name`, falling back to `tags.ref` (its numbered-route reference, e.g.
`AH26`/Maharlika Highway segments tagged `noname=yes` still get the route
number `1`), falling back to a synthesized `Unnamed road ${id}` if both are
absent (54 of 1,897 real ways, 2.8%, have neither). None of these fallbacks
are surveyed or curated names; the field is cosmetic/debugging metadata only
and has no effect on the rendered alignment, which uses only `coordinates`.
`widthM` is a fixed illustrative 8 m (a two-lane unpaved 1944 provincial
road), not surveyed, matching the order of magnitude of design §7's own JSON
example. A way referencing a member node id absent from the response still
throws — that is a genuine gap in the returned geometry, not a naming gap.

To rebuild: save the raw response as
`tools/scenery/cache/places-overpass.json` (gitignored, not committed —
matches `binahaan.json`/`daguitan.json`'s existing precedent), then run
`npx tsx tools/scenery/build.ts`. Later OSM edits can change the upstream
data; the committed `places.json` is the snapshot.
