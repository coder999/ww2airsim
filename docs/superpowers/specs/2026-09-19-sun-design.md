# Plan 16c — the movable sun: design

2026-09-19. The third of the three cloud slices Mark chose for Plan 16
([16a design](2026-09-19-clouds-design.md); [16b design](2026-09-19-cloud-shadows-design.md),
landed the same day). 16b left the one thing 16c needs: `sunDirectionNode`
in `lighting.ts`, the single uniform every shader reads for the sun, with
the `DirectionalLight` pinned to it by test. Mark chose on 2026-09-19: time
of day as **scenario content**, the sun moving with the sim clock, with
**color following elevation**, through an **analytic keyframed palette**
rather than the master spec's scattering tables (§6 records that deviation).

## 1. What the pilot sees

Each scenario states a local time. The sun sits where it really would over
Leyte Gulf on 20 October 1944 and creeps with the sim clock at 15° an hour,
so a twenty-minute flight moves it 5°. Everything lit follows it: the sun's
color and strength, the sky's zenith and horizon, the haze the terrain and
the clouds fog into, the hemisphere fill, the clouds' sun and ambient terms,
and where the cloud shadows fall. A small sun disc with a halo sits in the
sky dome behind the clouds; it is the cue that makes the sun's position
readable. On the sea a specular glint appears where the wave normals reflect
the sun, the most visible effect of a low sun on the largest surface in the
scene.

`src/sim/` changes only in the scenario schema. The flight model, the
goldens, the landing snapshots and the soak never see the sun.

## 2. Content

`weather.timeOfDay` on the scenario: decimal hours in [0, 24), optional,
**12 when absent**. It is **apparent solar time**: 12.0 is the sun due south
at its highest. That removes the 1944 time-zone question (the occupied
Philippines ran on Tokyo time) and the equation of time; a scenario author
thinks "mid-afternoon" and writes 15.

| Scenario | timeOfDay | Why |
| --- | --- | --- |
| free-flight | 10 | the closest real hour to today's hard-coded sun (63° up, south-east) |
| deck-quals | 16.5 | long warm shadows across the deck |
| gunnery-range | 12 | the range stays as neutral as it is |

The date is a constant, `1944-10-20`, the day of the Leyte landings. A
per-scenario date is not content anyone has asked for; if one is, it is one
field and one argument.

## 3. Solar geometry, `src/render/sky/sun.ts`

Pure functions, no three:

- `solarDeclinationDeg(dayOfYear)`: the standard Spencer series (NOAA), day
  294 → −10.4°.
- `sunPosition(latDeg, timeOfDay, dayOfYear) → { elevationDeg, azimuthDeg }`:
  hour angle `H = 15 (t − 12)`, `sin el = sin φ sin δ + cos φ cos δ cos H`,
  azimuth from north clockwise via the standard atan2 form.
- `sunDirectionWorld(elevationDeg, azimuthDeg) → Vec3`: unit vector from the
  ground TOWARD the sun in the world frame, `x = cos el · sin az` (east),
  `y = sin el`, `z = −cos el · cos az` (north is −z since 29f5319).
- `sunClock(timeOfDay, simSeconds)`: `timeOfDay + simSeconds / 3600`, wrapped.

Pinned by test at Tacloban's latitude (11.24° N) on that date: noon elevation
**68.3° ± 0.5**, sunrise **06:08** and sunset **17:52** apparent solar time
(± 5 minutes), azimuth due south at noon (180°), east of south before it,
and the world vector's z POSITIVE (the sun is in the south, and +z is south)
at every daylight hour. The current constant `SUN_DIRECTION` (0.4, 1, 0.3)
is 63° up at azimuth 127°, which is no hour of that date; 10:00 is the
nearest, the same azimuth (125°) ten degrees lower (53°). 16:30 is 19.5° up
at 255°.

## 4. The analytic palette, `src/render/sky/palette.ts`

One pure function `paletteFor(elevationDeg) → SkyPalette` interpolating,
in linear RGB, between four keyframes by elevation:

| Key | Elevation | Sun color, intensity | Zenith | Horizon (haze) | Fill sky / ground |
| --- | --- | --- | --- | --- | --- |
| high | ≥ 30° | `fff2e0`, 2.5 | `29619f` | `9eb8cc` | `9eb8cc` / `18384f` |
| low | 10° | `ffdcae`, 2.1 | `2a5a94` | `c9bfa8` | `b7b0a0` / `18384f` |
| horizon | 0° | `ff8c4a`, 1.2 | `1f3e6e` | `f0a060` | `8f7f78` / `142a3c` |
| twilight | −6° and below | `000000`, 0 | `0d1b33` | `3a3a5a` | `2c3550` / `0b1520` |

The **high** row IS today's constants, so any scenario with the sun above
30° looks exactly as it does now apart from the direction. The values below
it are a starting look, tunable by eye; they are the only art in this plan
and Mark owns them. Interpolation is linear in elevation between adjacent
keys, held flat outside the ends: a 02:00 scenario is deep twilight, never
black, and nothing is rejected. `SkyPalette` also carries `sunTint`, the
sun color normalized so that the high key is (1, 1, 1): the terrain and the
clouds multiply their existing sun terms by it and are bit-identical at
noon.

Each frame `main.ts` evaluates `sunPosition` and `paletteFor` once on the
CPU and writes:

- `sunDirectionNode.value` (unnormalized, as today) and the
  `DirectionalLight`'s position, color and intensity;
- the `HemisphereLight`'s two colors;
- new uniforms exported beside `sunDirectionNode` from `lighting.ts`:
  `sunTintNode` (vec3), `skyZenithNode`, `skyHorizonNode` (vec3), and
  `sunElevationNode` (float, degrees).

Consumers change from constants to those uniforms and nothing else:

| Consumer | Today | 16c |
| --- | --- | --- |
| sky dome (`sky.ts`) | `SKY_HAZE`, `SKY_ZENITH` literals | the two uniforms, plus a sun disc: `smoothstep(0.9995, 0.9999, dot(dir, sun))` disc and a `pow(max(dot, 0), 64)` halo, both times `sunTint`, drawn only above the horizon |
| terrain (`terrain/mesh.ts`) | fog to `SKY_HAZE`; lambert × `(1 − AMBIENT)` | fog to `skyHorizonNode`; lambert term × `sunTintNode` |
| clouds (`clouds.ts`) | `sunColor` literal, ambient from `SKY_HAZE`, fog to `SKY_HAZE` | `sunTint`-scaled sun color, ambient and fog from `skyHorizonNode` |
| ocean (`ocean/mesh.ts`) | reflection color `9abacb` literal | reflection from `skyHorizonNode`; plus the glint: `pow(max(dot(reflect(−view, normal), sun), 0), 180) · sunTint · fresnel` |
| cloud shadows (`cloudShadow.ts`) | reads `sunDirectionNode` | unchanged, except the projection uses `max(sun.y, sin 5°)`: shadows lengthen toward dawn without the parallax going to infinity |
| lit meshes | `DirectionalLight` + `HemisphereLight` | the same lights, driven per frame |

The `SKY_HAZE` and `SKY_ZENITH` exports remain as the high-key constants;
`horizon.ts`'s comment naming `SKY_HAZE` as "the" haze is updated to name
the uniform.

## 5. DEV and diagnostics

`?timeOfDay=17.5` overrides the scenario's hour (DEV only, parsed like
`cloudTier`, rejects values outside [0, 24)). `__ww2.sun()` reports
`{ timeOfDay, elevationDeg, azimuthDeg, direction: { x, y, z } }` for the
current frame so a spec asserts the geometry without a screenshot.

## 6. Deviation from the master spec

§4 "Sky" promises "precomputed atmospheric scattering LUTs (Hillaire-style)".
This design defers them, dated 2026-09-19, to a possible 16d: every consumer
reads a uniform, so tables could replace `paletteFor` without touching a
consumer. §15's row 16 records 16c as landed with this note when it does.

## 7. Acceptance

**Tier 1** (`tests/render/sun.test.ts`, `tests/render/palette.test.ts`,
`tests/sim/scenario.test.ts`, `scene.test.ts`):

- §3's numbers; `sunDirectionWorld` is unit length and `z > 0` for every
  daylight hour; `sunClock` wraps at 24.
- `paletteFor` returns the high key exactly at 30° and 70°, is continuous
  (adjacent samples 0.1° apart differ by < 1 %), holds flat below −6°, and
  `sunTint` is (1, 1, 1) at the high key.
- The schema accepts 0 and 23.99, rejects 24 and −1 and a string; the three
  scenarios parse with their hours; absent means 12.
- `createLighting()` still positions the light from `sunDirectionNode`, and
  a new `applySun(lights, palette, direction)` sets position, color,
  intensity and the fill's colors; a test reads them back.
- The override parser accepts `17.5`, rejects `sunset`.

**Tier 2**, reference GPU at 1440p, every screenshot READ
(`tests/e2e/sun.spec.ts`):

- (a) the same fixed under-deck view at 06:30, 12:00 and 17:00: the sky
  strip's mean is bluest at 12:00 and warmest (red − blue largest) at the
  two ends; the ground strip is brightest at 12:00; `__ww2.sun()` reports the
  hour and an elevation that matches §3 within 1°.
- (b) the shadow map at five fixed world points (16b's readback) differs
  between 10:00 and 16:30: the projection moved.
- (c) 16b's world-anchoring case re-run under `?timeOfDay=16.5`: unchanged
  eye-independence at a low sun.
- (d) the budget view's on/off delta and the deck run re-measured: within
  noise of 16b's numbers; the sun disc and the glint cost nothing measurable.
- (e) zero validation errors; the clouds, terrain, deck-quals, gunnery,
  ocean and cloud-shadow specs re-run green, the deck-quals shadow case
  pinning its hour with the override if the new azimuth moves the cloud off
  the carrier.

`npm run verify` exits 0 and a dated handoff records every number, the
palette as shipped, and the images at the three hours.

## 8. Risks and contingencies

- **The deck-quals shadow case** relies on a cloud over the carrier at tick
  0; the new azimuth may move it. The case pins its hour with the override.
- **Glint sparkle** on a Beaufort 4 sea at grazing sun. The exponent and a
  `smoothstep` on elevation are the levers; the term is one line and can be
  dropped without touching anything else.
- **The clouds' single-scatter lighting at a low sun** may read flat or too
  bright on the undersides; the ambient scale is a uniform now, and the
  contingency is to key `LIGHT_EXTINCTION_SCALE` by elevation. Not planned
  unless the images show it.
- **A twilight scenario has no moon and no stars.** By design; the palette
  floor keeps the world readable.

## 9. Sources

- NOAA Global Monitoring Laboratory solar calculator equations (declination
  series, elevation and azimuth); values pinned in §3 were computed from
  them for 11.24° N, day 294.
- 16a and 16b designs and handoffs for the consumers touched; the TSL traps
  recorded there apply.
