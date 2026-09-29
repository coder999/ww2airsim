# Sourcing dossier: Boeing B-29 Superfortress (`b-29-superfortress`)

Prepared 2026-09-29. Research only; no repo code touched, no tests run. The article names no variant.
The 3D model (`tools/models/blender/b-29-superfortress.py`) depicts a generic early B-29 with R-3350-23 engines.
The matching primary source is therefore the USAAF pilot's manual, not the postwar SACs.

Labels: SOURCED (printed in a document), DERIVED (arithmetic on sourced values, shown), ESTIMATE (no source).
Read date is 2026-09-29 for everything below unless a different date is stated.

Abbreviations:
- PFOI = "Pilot's Flight Operating Instructions for Army Model B-29 Airplane", AN 01-20EJ-1, restricted, estimates as of 7-1-44. PDF found through a docdroid link (see Sources). "PDF p." is the PDF page number.
- SAC = 1950 Standard Aircraft Characteristics sheet, computed, postwar engines (B-29 R-3350-57 class; not the wartime -23).
- WP = English Wikipedia "Boeing B-29 Superfortress", read 2026-09-27 (the date the repo test cites).

Conversions used: 1 ft = 0.3048 m; 1 lb = 0.45359237 kg; 1 mph = 0.44704 m/s; 1 ft/min = 0.00508 m/s; 1 sq ft = 0.092903 m2; 1 hp = 745.7 W.

## 1. Geometry

| value | unit | source | page | url | read date | label |
|---|---|---|---|---|---|---|
| 141 ft 3 in span = 141.25 ft x 0.3048 = 43.05 m | ft / m | PFOI text, "The wingspread is 141' 3\"" | PDF p.~20 (Section I para 1) | pfoi (docdroid, see Sources) | 2026-09-29 | SOURCED |
| 141 ft 3 in span (agrees) | ft | WP infobox | infobox | https://en.wikipedia.org/wiki/Boeing_B-29_Superfortress | 2026-09-27 | SOURCED |
| 99 ft 0 in length = 99 x 0.3048 = 30.18 m | ft / m | WP infobox | infobox | wikipedia above | 2026-09-27 | SOURCED |
| Wing area 1,738 sq ft = 1738 x 0.092903 = 161.5 m2 | sq ft / m2 | PFOI comparison page (B-29 column) | PDF p.~9 | pfoi | 2026-09-29 | SOURCED |
| Wing area 1,736 sq ft = 161.3 m2 (repo entry uses 161.3) | sq ft / m2 | WP infobox | infobox | wikipedia | 2026-09-27 | SOURCED |
| Wing area 1,720 sq ft = 159.8 m2 | sq ft / m2 | SAC (computed, postwar) | SAC sheet | cb12fc.html (see Sources) | 2026-09-29 | SOURCED |
| Height 27 ft 9 in = 27.75 x 0.3048 = 8.46 m | ft / m | WP infobox | infobox | wikipedia | 2026-09-27 | SOURCED |
| Dihedral 4 deg 29' 23" (4.49 deg) | deg | SAC | SAC sheet | cb12fc.html | 2026-09-29 | SOURCED (postwar sheet) |
| Leading-edge sweep 7 deg 1' 26" (7.02 deg) | deg | SAC | SAC sheet | cb12fc.html | 2026-09-29 | SOURCED (postwar sheet) |
| Propeller: 4-blade Hamilton full-feathering, diameter 16 ft 7 in (5.055 m) used by repo entry | ft / m | repo entry `tools/models/entries/b-29-superfortress.json`; PFOI names the Hamilton 4-blade propellers | entry | repo | 2026-09-29 | SOURCED for blade count; diameter not re-verified in a document this session, treat as ESTIMATE until a page is cited |
| Taper 0.35 | ratio | Blender script header | n/a | repo | 2026-09-29 | ESTIMATE |
| Aspect ratio = 43.05^2 / 161.5 = 11.5 | ratio | arithmetic on span and PFOI area | n/a | n/a | 2026-09-29 | DERIVED |

## 2. Mass

| value | unit | source | page | url | read date | label |
|---|---|---|---|---|---|---|
| Basic weight 75,000 lb = 75,000 x 0.45359 = 34,019 kg | lb / kg | PFOI sample loading chart (Figure 36), "BASIC WEIGHT 75,000 LBS", refers reader to the Weight and Balance Handbook for the latest figure | PDF p.42 | pfoi | 2026-09-29 | SOURCED |
| Sample gross with crew, oil, racks and no fuel or bombs: 80,490 lb = 36,510 kg | lb / kg | same chart (basic 75,000 + racks 740 + 11 crew at 200 lb 2,200 + oil 340 gal 2,550 = 80,490) | PDF p.42 | pfoi | 2026-09-29 | SOURCED |
| Empty 74,500 lb = 33,793 kg | lb / kg | WP infobox | infobox | wikipedia | 2026-09-27 | SOURCED |
| Empty 71,500 lb = 32,432 kg | lb / kg | SAC (B-29) | SAC sheet | cb12fc.html | 2026-09-29 | SOURCED |
| Loading chart weight lines 100,000 / 120,000 / 140,000 lb | lb | PFOI Figure 36 | PDF p.42 | pfoi | 2026-09-29 | SOURCED |
| Performance chart weights: take-off and climb chart 110,000 lb; TAS sheet weight bands 120,000-110,000 and 100,000-90,000 lb (sheets 3 and 5) | lb | PFOI performance charts | PDF p.167, 170, 172 | pfoi | 2026-09-29 | SOURCED |
| Stall table weights 90,000 to 140,000 lb | lb | PFOI para 12 | PDF p.55 | pfoi | 2026-09-29 | SOURCED |
| Fuel tanks: outboard-engine group 1,361.0 US gal each, inboard-engine group 1,436.5 US gal each (per engine feed), plus center wing tanks (1,315 US gal on B-29, 1,100 on B-29A) and bomb bay tanks | US gal | PFOI fuel system diagram | PDF p.~70-74 | pfoi | 2026-09-29 | SOURCED (grouping as read from a diagram; re-check before using a total) |
| Fuel density 6 lb/US gal (3.03 kg/gal x ... = 0.719 kg/L) | lb/gal | standard aviation gasoline figure, not from these documents | n/a | n/a | 2026-09-29 | ESTIMATE |
| Wing-spar variants: chart notes "V center section wing spar B-29" and "straight center section B-29A" | n/a | PFOI Figure 36 | PDF p.42 | pfoi | 2026-09-29 | SOURCED |

## 3. Engines

| value | unit | source | page | url | read date | label |
|---|---|---|---|---|---|---|
| Four Wright R-3350 (-13, -21, -23, -23A), turbosupercharged, Hamilton full-feathering propellers | n/a | PFOI (chart headers, engine table) | PDF p.~48, 170 | pfoi | 2026-09-29 | SOURCED |
| Take-off power 2,200 hp at 2,800 rpm, 49 in. Hg, 5 min limit; four engines = 8,800 hp (matches PFOI comparison page "TAKE-OFF POWER 8800 H.P.") | hp | PFOI power table | PDF p.~48 (Section I para 2) | pfoi | 2026-09-29 | SOURCED |
| 8,800 hp x 745.7 = 6.56 MW | W | arithmetic | n/a | n/a | 2026-09-29 | DERIVED |
| Rated (climb and level continuous) 2,000 hp at 2,400 rpm, 43.5 in. Hg | hp | PFOI power table | PDF p.~48 | pfoi | 2026-09-29 | SOURCED |
| Cruise ratings 1,750 hp/2,300 rpm/39 in.; 1,450/2,200/35; 1,170/2,100/31; long-range 950/2,000/28 | hp/rpm/in. | PFOI power table | PDF p.~48 | pfoi | 2026-09-29 | SOURCED |
| Military power at 25,000 ft 2,200 hp at 2,600 rpm, 47.5 in. Hg (5 min); chart header confirms 2,600 rpm, 47.5 in., 1,130 gph total | hp | PFOI power table footnote and chart header | PDF p.~48, 170 | pfoi | 2026-09-29 | SOURCED |
| Fuel flow at take-off 290 gph per engine | US gal/h | PFOI power table | PDF p.~48 | pfoi | 2026-09-29 | SOURCED |
| Power vs altitude: military 2,200 hp holds to about 25,000 ft via turbos, so powerFractionByAltitudeM = 1.0 up to 7,620 m | fraction | interpretation of the footnote above | n/a | n/a | 2026-09-29 | DERIVED (the fall-off above 25,000 ft is not in any document read) |
| Propeller efficiency, cd0, thrust model | n/a | none | n/a | n/a | n/a | ESTIMATE |

## 4. Performance tables

Primary source is the PFOI charts. These are estimates printed for pilots, not flown test data (see Gaps).

### 4a. True airspeed, max continuous (2,400 rpm, 43.5 in., auto rich), weight band 120,000-110,000 lb, PFOI TAS sheet 3

| altitude ft (m) | TAS mph | TAS m/s | source | page | read date | label |
|---|---|---|---|---|---|---|
| sea level (0) | 272 | 121.6 (272 x 0.44704) | PFOI sheet 3 | PDF p.170 | 2026-09-29 | SOURCED (estimate chart) |
| 5,000 (1,524) | 286 | 127.9 | same | same | 2026-09-29 | SOURCED |
| 10,000 (3,048) | 302 | 135.0 | same | same | 2026-09-29 | SOURCED |
| 15,000 (4,572) | 309 | 138.1 | same | same | 2026-09-29 | SOURCED |
| 20,000 (6,096) | 323 | 144.4 | same | same | 2026-09-29 | SOURCED |
| 25,000 (7,620) | 322 | 143.9 | same | same | 2026-09-29 | SOURCED (printed 322, slightly below 20,000 ft, as read) |

Sheet 3 values for other columns (2,300 rpm cruise: SL 254, 5,000 ft 267, 10,000 ft 283, 15,000 ft 292, 20,000 and 25,000 ft 308 mph) are readable in the same page. Speeds above 25,000 ft were not transcribed (the max-continuous column is blank there, so the PFOI gives no sourced value).
Sheet 5 (100,000-90,000 lb, PDF p.172) was read earlier; values not restated here. Sheets 2 and 6 were not read.

### 4b. Take-off and climb, 110,000 lb (PFOI PDF p.167)

| item | value | unit | source | page | read date | label |
|---|---|---|---|---|---|---|
| rate of climb, sea level | 850 (4.32 m/s = 850 x 0.00508) | ft/min | PFOI climb chart | PDF p.167 | 2026-09-29 | SOURCED (estimate chart) |
| 5,000 ft | 800 (4.06 m/s) | ft/min | same | same | 2026-09-29 | SOURCED |
| 10,000 ft | 740 (3.76 m/s) | ft/min | same | same | 2026-09-29 | SOURCED |
| 15,000 ft | 670 (3.40 m/s) | ft/min | same | same | 2026-09-29 | SOURCED |
| 25,000 ft | 480 (2.44 m/s) | ft/min | same | same | 2026-09-29 | SOURCED |
| ground run at 110,000 lb | 2,725 ft = 830.6 m (2,725 x 0.3048) | ft / m | same | same | 2026-09-29 | SOURCED (condition of wind, flaps and temperature per the chart header, not re-transcribed) |

### 4c. Secondary top speeds

| value | unit | source | url | read date | label |
|---|---|---|---|---|---|
| 357 mph max at 30,000 ft = 159.6 m/s | mph / m/s | WP infobox (weight not stated) | wikipedia | 2026-09-27 | SOURCED (secondary; conflicts with the PFOI chart, see Gaps) |
| SAC computed speeds for postwar engines | mph | SAC sheets cb12fc (B-29), b54750 (B-29A), nc (B-29B) | see Sources | 2026-09-29 | SOURCED but not applicable to the -23 model; test weight not printed (gap) |

## 5. Gear and flaps

| value | unit | source | page | url | read date | label |
|---|---|---|---|---|---|---|
| Retractable tricycle gear; main units fold into the inboard nacelles, nose gear forward of the bomb bays; tail skid | n/a | PFOI Section I | PDF p.17 | pfoi | 2026-09-29 | SOURCED |
| Max speed to lower gear 180 mph IAS | mph / m/s | PFOI restrictions | PDF p.~28 | pfoi | 2026-09-29 | SOURCED |
| Max speed to lower flaps fully 180 mph IAS | mph / m/s | PFOI restrictions | PDF p.~28 | pfoi | 2026-09-29 | SOURCED |
| 180 mph x 0.44704 = 80.5 m/s | m/s | arithmetic | n/a | n/a | 2026-09-29 | DERIVED |
| Take-off flap setting 25 deg (warning horn if not between 20 and 30 deg) | deg | PFOI before take-off checklist and flap text | PDF p.~30-36 | pfoi | 2026-09-29 | SOURCED |
| Flaps: electric, Fowler-type, full setting per stall table "Flaps Full" | n/a | PFOI | PDF p.~21 | pfoi | 2026-09-29 | SOURCED |
| Gear lowering about 40 s (normal) | s | airpages.ru B-29 description | https://www.airpages.ru (ap01-03.html) | 2026-09-29 | SOURCED (secondary) |
| Emergency motor: about 60 s up, 40 s down | s | PFOI / airpages.ru emergency system text | as above | 2026-09-29 | SOURCED (emergency only, not normal) |
| Normal gear retract time | s | none | n/a | n/a | ESTIMATE |
| Flap travel time | s | none | n/a | n/a | ESTIMATE |
| Retraction layout (main forward, nose aft) | n/a | Blender script header | n/a | repo | 2026-09-29 | ESTIMATE |

## 6. Carrier suitability and maneuver limits

Carrier suitability: N/A (D3A only).

| value | unit | source | page | url | read date | label |
|---|---|---|---|---|---|---|
| Stall speed, flaps up, power off, indicated, 110,000 lb: 129 mph = 57.7 m/s | mph / m/s | PFOI stall table | PDF p.55 (Section para 12) | pfoi | 2026-09-29 | SOURCED |
| Flaps 25 deg, 110,000 lb: 115 mph = 51.4 m/s | mph / m/s | same | same | pfoi | 2026-09-29 | SOURCED |
| Flaps full, 110,000 lb: 105 mph = 46.9 m/s | mph / m/s | same | same | pfoi | 2026-09-29 | SOURCED |
| Full stall table, flaps up / 25 / full (mph): 140,000 lb 145/131/119; 130,000 lb 140/126/114; 120,000 lb 135/121/110; 110,000 lb 129/115/105; 100,000 lb 123/110/100; 90,000 lb 117/104/95 | mph | same | same | pfoi | 2026-09-29 | SOURCED |
| Stall at other masses | m/s | V x sqrt(W/W0), from the 110,000 lb row when the model mass differs | n/a | n/a | 2026-09-29 | DERIVED |
| Stall character: normal, elevator lightening, buffet, no severe wing drop | n/a | PFOI para 12 | PDF p.55 | pfoi | 2026-09-29 | SOURCED |
| Never-exceed / red line 300 mph IAS (134.1 m/s) | mph | PFOI restrictions | PDF p.~28 | pfoi | 2026-09-29 | SOURCED |
| Dive speed beyond the red line | n/a | none | n/a | n/a | ESTIMATE |
| gLimit | g | none | n/a | n/a | ESTIMATE (heavy bomber; do not copy B-17 without saying so) |
| Roll rate | deg/s | none | n/a | n/a | ESTIMATE |
| Lift-off speed | mph | Not read as a number this session; chart at PDF p.167 has take-off speed lines (also PDF p.~36 "minimum take off speed, flaps up") | n/a | pfoi | 2026-09-29 | gap, ESTIMATE until transcribed |

## 7. Armament and payload

Kind line says no turrets and internal bombs only. The historical B-29 carried remote-controlled turrets; the repo model draws five turret nodes (Turret1-5). See section 8 for the conflict.

| value | unit | source | page | url | read date | label |
|---|---|---|---|---|---|---|
| Bomb racks weight 740 lb (336 kg) | lb / kg | PFOI Figure 36 | PDF p.42 | pfoi | 2026-09-29 | SOURCED |
| Loading chart bombs, cargo and equipment axis runs to 60,000 lb | lb | PFOI Figure 36 | PDF p.42 | pfoi | 2026-09-29 | SOURCED (chart axis, not a bomb-load limit) |
| Maximum bomb load 20,000 lb | lb | WP infobox (not verified in the PFOI this session) | infobox | wikipedia | 2026-09-27 | SOURCED (secondary; confirm before use) |
| Bomb bays: fore and aft, with auxiliary bomb-bay tank installation (2 tanks, 1,340 lb) | n/a | PFOI Figure 36 | PDF p.42 | pfoi | 2026-09-29 | SOURCED |

## 8. Variant differences and model match

| item | value | source | label |
|---|---|---|---|
| B-29 vs B-29A | B-29A has straight center wing section (1,100 gal center tanks) vs V center section (1,315 gal) on B-29 | PFOI Figure 36 and fuel diagram | SOURCED |
| Engines | PFOI covers R-3350-13, -21, -23, -23A; SAC covers postwar engines | PFOI chart headers; SACs | SOURCED |
| Model depicts | generic early B-29, R-3350-23, 4 remote turrets plus tail, 4-blade props, nose gear retracting aft | `tools/models/blender/b-29-superfortress.py` header | SOURCED (repo) |
| Match | Geometry and engine era match the PFOI; the turrets conflict with the kind line "no turrets" | derived | DERIVED |
| Original Blender build; cited numbers span 43.05 m, length 30.18 m | `tests/tools/models/aircraftDimensions.test.ts` line 22 | SOURCED |

## Recommended reference block

- testMassKg: 49,895 kg (110,000 lb x 0.45359237 = 49,895). DERIVED from the PFOI chart weight (climb, take-off, stall rows all exist at 110,000 lb). Note that 110,000 lb is the lower edge of TAS sheet 3 (120,000-110,000 lb).
- topSpeedByAltitudeM (max continuous, PFOI sheet 3): 0 m 121.6; 1,524 m 127.9; 3,048 m 135.0; 4,572 m 138.1; 6,096 m 144.4; 7,620 m 143.9 (m/s TAS). SOURCED values from an estimate chart. Use 2,000 hp per engine (not 2,200) as the power behind these speeds.
- climbRateByAltitudeM: 0 m 4.32; 1,524 m 4.06; 3,048 m 3.76; 4,572 m 3.40; 7,620 m 2.44 (m/s). SOURCED (estimate chart, 110,000 lb).
- stallSpeedMps (clean, power off, indicated): 57.7 (129 mph). SOURCED. stallSpeedFlapMps: 46.9 (105 mph, flaps full); 51.4 at 25 deg. SOURCED.
- Take-off ground run: 830.6 m at 110,000 lb. SOURCED. Lift-off speed: ESTIMATE (not transcribed).
- Power: 4 x 2,200 hp = 8,800 hp take-off; military 2,200 hp to 25,000 ft; continuous 2,000 hp. powerFractionByAltitudeM as fractions of 2,200 hp (1.0 to 7,620 m, DERIVED; above that ESTIMATE).
- flap clIncrement: DERIVED from stall ratio, clMax x ((129/105)^2 - 1) = clMax x 0.509 (arithmetic 129/105 = 1.229, squared 1.509).
- No source, must be ESTIMATE: rollRate, gLimit, dive speed above 300 mph IAS, gear travel time, flap travel time, propEfficiency, cd0, lift-off speed, propeller diameter (until cited), taper.

## Gaps and risks

- No flown test report found. wwiiaircraftperformance.org has no B-29 page (index fetch returned 93 bytes, home page lists none). The PFOI charts are printed estimates as of 7-1-44.
- Wing area: 1,738 (PFOI) vs 1,736 (WP) vs 1,720 sq ft (SAC). The repo uses 161.3 m2 (WP).
- Empty weight: 74,500 lb (WP) vs 71,500 lb (SAC) vs 75,000 lb basic (PFOI loading chart, refers to a handbook for the latest). Pick 75,000 lb only if test mass is built up from the PFOI.
- Height: 27 ft 9 in (WP) vs 27.8 ft (SAC) vs 29 ft 6.7 in (PFOI taxiing figure, different attitude).
- Max speed: 357 mph (WP) vs PFOI chart max-continuous 323 mph TAS at 20,000 ft. Different power settings and weights; the model must not mix them.
- Stall: WP 105 mph matches the PFOI flaps-full 110,000 lb row, not clean stall (129).
- TAS sheet 3 prints 322 mph at 25,000 ft but 323 at 20,000 ft, kept as read. Sheets 2 and 6 not read; sheet 5 not transcribed.
- SAC speeds have no printed test weight and use postwar engines.
- Turrets: model draws five turrets; kind line says none.
- Fuel tank totals are read from a diagram; do not use as a sum without re-checking.

## Sources read

- PFOI AN 01-20EJ-1, Pilot's Flight Operating Instructions, B-29, read via docdroid link found by web search (local copy pfoi.pdf in the session scratchpad), 2026-09-29. Pages cited: 17, 42, 55, 167, 168-173.
- SAC B-29 (cb12fc.html), B-29A (b54750.html), B-29B (nc.html), retrieved 2026-09-29 from the aerofiles-style SAC mirror found by search (URLs kept in the session scratchpad; not re-verified this pass).
- airpages.ru B-29 pages (ap01-03.html), 2026-09-29.
- https://en.wikipedia.org/wiki/Boeing_B-29_Superfortress, read 2026-09-27 and wikitext re-read 2026-09-29.
- Repo: tools/models/entries/b-29-superfortress.json, tools/models/blender/b-29-superfortress.py, tests/tools/models/aircraftDimensions.test.ts, content/aircraft/b-17-flying-fortress.json (style template), docs/handoff/2026-09-29-b-17.md.
- Not found: wwiiaircraftperformance.org B-29 report.
