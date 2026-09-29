# Sourcing dossier: Aichi D3A2 Model 22 Val (`d3a-val`)

Prepared 2026-09-29 (all "read" dates are 2026-09-29). Research only; no repo code changed.
Format follows `docs/aircraft.md` Part B: every figure carries a source and one of SOURCED / DERIVED / ESTIMATE.

**Headline:** the type has a real primary source: the TAIC Manual No. 1 sheet "VAL 22" (401A-2, Dec 1944) gives weight-tagged speed, climb, take-off, fuel, range and weights for exactly this model, and TAIC sheet 856 gives the Kinsei 54 ratings. It has **no stall speed, no flap data, no dive limit, no g limit, no roll rate**. Those are ESTIMATE. No wwiiaircraftperformance.org document exists for the Val (checked the index), so the Zero's Summary 85 does not apply here.

Abbreviations: TAIC = Technical Air Intelligence Center, "Japanese Aircraft Performance and Characteristics" (Manual No. 1, June 1945), https://archive.org/download/japanese-aircraft-performance-characteristics-taic-manual/p4013coll8_4531.pdf (PDF page numbers below are pages of that 296-page PDF). WP-en = English Wikipedia "Aichi D3A" (citing Francillon 1979), https://en.wikipedia.org/wiki/Aichi_D3A. WP-ja = Japanese Wikipedia (citing Sekai no Kessaku-ki No. 130). Skytamer = Jane's 1945-46 transcription.

Conversions used: 1 lb = 0.45359 kg; 1 ft = 0.3048 m; 1 mph = 0.44704 m/s; 1 ft/min = 0.00508 m/s; 1 kt = 0.51444 m/s; 1 hp = 745.7 W; 1 US gal = 3.78541 L; 1 sq ft = 0.092903 sq m.

## 1. Geometry

| Item | Value | Unit | Source | Page | URL | Read | Label |
|---|---|---|---|---|---|---|---|
| Span | 47.5 ft = 47.5 x 0.3048 = 14.478 m | ft / m | TAIC sheet 401A-2 | PDF p161 | TAIC URL | 2026-09-29 | SOURCED |
| Span | 14.365 m | m | WP-en Specifications (D3A2) | n/a | en.wikipedia.org/wiki/Aichi_D3A | 2026-09-29 | SOURCED (secondary); this is the value in `aircraftDimensions.test.ts` |
| Span | 14.360 m | m | WP-ja (Sekai no Kessaku-ki 130, p.21) | p.21 | ja.wikipedia.org (D3A) | 2026-09-29 | SOURCED (secondary) |
| Span | 47 ft 8 in = 47.667 x 0.3048 = 14.529 m | ft / m | Skytamer (Jane's 1945-46) | n/a | skytamer.com | 2026-09-29 | SOURCED (secondary) |
| Length | 35.4 ft = 35.4 x 0.3048 = 10.790 m | ft / m | TAIC sheet 401A-2 | PDF p161 | TAIC URL | 2026-09-29 | SOURCED |
| Length | 10.195 m (33.45 ft) | m | WP-en | n/a | en.wikipedia.org | 2026-09-29 | SOURCED (secondary); test value |
| Length | 10.231 m | m | WP-ja | p.21 | ja.wikipedia.org | 2026-09-29 | SOURCED (secondary) |
| Length | 34 ft 9 in = 34.75 x 0.3048 = 10.592 m | ft / m | Skytamer | n/a | skytamer.com | 2026-09-29 | SOURCED (secondary) |
| Height | 13 ft = 3.962 m | ft / m | TAIC sheet 401A-2 | PDF p161 | TAIC URL | 2026-09-29 | SOURCED |
| Height | 3.847 m (WP-en); 3.348 m (WP-ja) | m | WP-en, WP-ja | n/a | as above | 2026-09-29 | SOURCED (secondary), conflicting; WP-ja looks like a digit transposition of 3.843 |
| Wing area | 376 sq ft = 376 x 0.092903 = 34.93 sq m | sq ft / sq m | TAIC sheet 401A-2 | PDF p161 | TAIC URL | 2026-09-29 | SOURCED |
| Wing area | 34.9 sq m (WP-en); 34.97 sq m (WP-ja); 389 sq ft = 36.14 sq m (Skytamer) | sq m | WP-en, WP-ja, Skytamer | n/a | as above | 2026-09-29 | SOURCED (secondary); Skytamer outlier |
| Wing fold | outer panels fold up about 6 ft from each tip | ft | Skytamer | n/a | skytamer.com | 2026-09-29 | SOURCED (secondary); folded span not modeled |
| Propeller diameter | 10.5 ft = 3.200 m; 3 blades | ft / m | TAIC sheet 401A-2 | PDF p161 | TAIC URL | 2026-09-29 | SOURCED |

## 2. Mass

| Item | Value | Unit | Source | Page | URL | Read | Label |
|---|---|---|---|---|---|---|---|
| Empty weight | 5,670 lb x 0.45359 = 2,572 kg | lb / kg | TAIC 401A-2 | PDF p161 | TAIC URL | 2026-09-29 | SOURCED |
| Scout (test) weight | 7,830 lb x 0.45359 = 3,551.6 kg | lb / kg | TAIC 401A-2 (weight against which speed, climb, take-off are quoted) | PDF p161 | TAIC URL | 2026-09-29 | SOURCED |
| Bomber weight | 8,380 lb x 0.45359 = 3,801 kg | lb / kg | TAIC 401A-2 | PDF p161 | TAIC URL | 2026-09-29 | SOURCED |
| Overload weight | 9,042 lb x 0.45359 = 4,101 kg | lb / kg | TAIC 401A-2 | PDF p161 | TAIC URL | 2026-09-29 | SOURCED |
| Empty / gross (secondary) | 2,570 kg / 3,800 kg | kg | WP-en (Francillon) | n/a | en.wikipedia.org | 2026-09-29 | SOURCED (secondary); agrees with TAIC (2,572 / 3,801) |
| Empty (secondary, conflicting) | 2,750 kg | kg | WP-ja | p.21 | ja.wikipedia.org | 2026-09-29 | SOURCED (secondary); likely transposition of 2,570, disagrees with TAIC by 178 kg |
| Max take-off (secondary) | 9,100 lb = 9,100 x 0.45359 = 4,128 kg (Skytamer prints 4,122 kg); 8,378 lb = 3,800 kg (Planes of Fame) | lb / kg | Skytamer; Planes of Fame | n/a | skytamer.com; planesoffame.org | 2026-09-29 | SOURCED (secondary); 9,100 matches TAIC overload 9,042 within 0.6% |
| Fuel capacity | 286 US gal = 286 x 3.78541 = 1,082.6 L (237 Imp gal = 1,077 L, consistent) | gal / L | TAIC 401A-2 | PDF p161 | TAIC URL | 2026-09-29 | SOURCED |
| Fuel mass (`mass.fuelCapacityKg`) | 1,082.6 L x 0.72 kg/L = 779 kg | kg | derived from TAIC volume, density 0.72 kg/L assumed for 92-octane gasoline | n/a | n/a | n/a | DERIVED (density ESTIMATE) |
| Fuel, secondary | 900 L (240 US gal); Jane's 206 Imp gal = 936 L | L | WP-en; Skytamer | n/a | as above | 2026-09-29 | SOURCED (secondary), conflicts with TAIC 286 US gal (about 17% lower) |
| Wing loading at test weight | 3,551.6 kg / 34.93 sq m = 101.7 kg/sq m | kg/sq m | computed | n/a | n/a | n/a | DERIVED |
| Empty-weight breakdown (structure, crew, ordnance) | not found | n/a | none | n/a | n/a | n/a | gap |

## 3. Engine

One Mitsubishi/Nakajima-style radial per Japanese naming: Mitsubishi Kinsei 54 (Ha-33 Mod 54), 14-cylinder two-row radial, two-speed single-stage supercharger, 92 octane.

| Item | Value | Unit | Source | Page | URL | Read | Label |
|---|---|---|---|---|---|---|---|
| Take-off / WEP at sea level | 1,280 hp at 2,600 rpm, 42.9 in Hg = 1,280 x 745.7 = 954,500 W | hp / W | TAIC sheet 856 (Kinsei 51-54), and 401A-2 | PDF p217, p161 | TAIC URL | 2026-09-29 | SOURCED |
| War emergency (WEP) at altitude | 1,355 hp at 7,700 ft (2,347 m) = 1,010,400 W; 1,240 hp at 18,500 ft (5,639 m) = 924,700 W | hp / ft | TAIC sheet 856 | PDF p217 | TAIC URL | 2026-09-29 | SOURCED |
| Military, sea level | 1,075 hp at 2,500 rpm, 37.8 in Hg = 801,600 W | hp / W | TAIC sheet 856 | PDF p217 | TAIC URL | 2026-09-29 | SOURCED |
| Military at altitude | 1,185 hp at 9,850 ft (3,002 m) = 883,700 W; 1,085 hp at 20,300 ft (6,187 m) = 809,100 W | hp / ft | TAIC 856 and 401A-2 | PDF p217, p161 | TAIC URL | 2026-09-29 | SOURCED |
| Power fraction vs take-off 1,280 hp (military rating) | 1.00 at 0 m (use 1,075/1,280 = 0.84 if military is the sustained rating), 1,185/1,280 = 0.926 at 3,002 m, 1,085/1,280 = 0.848 at 6,187 m | ratio | computed from TAIC 856 | n/a | n/a | n/a | DERIVED |
| Compression ratio | 7.0 | ratio | TAIC 856 | PDF p217 | TAIC URL | 2026-09-29 | SOURCED |
| Propeller reduction gear | 0.633 | ratio | TAIC 856 | PDF p217 | TAIC URL | 2026-09-29 | SOURCED |
| Supercharger gear ratios / impeller | 7.0 and 9.118; impeller 290 mm (11.4 in) | ratio / mm | TAIC 856 | PDF p217 | TAIC URL | 2026-09-29 | SOURCED |
| Bore / stroke / displacement | 140 mm / 150 mm / 32.34 L (1,970 cu in) | mm / L | TAIC 856 | PDF p217 | TAIC URL | 2026-09-29 | SOURCED |
| Engine diameter / dry weight | 1,218 mm (48.0 in) / 609 kg (1,340 lb) | mm / kg | TAIC 856 | PDF p217 | TAIC URL | 2026-09-29 | SOURCED |
| Secondary ratings | 1,300 hp take-off, 1,200 hp at 3,000 m, 1,100 hp at 6,200 m | hp | WP-en | n/a | en.wikipedia.org | 2026-09-29 | SOURCED (secondary); rounded, roughly agrees with TAIC (1,280 / 1,185 / 1,085) |
| Propeller type | 3-blade; pitch mechanism (constant-speed) not stated on the sheet | n/a | TAIC 401A-2 | PDF p161 | TAIC URL | 2026-09-29 | SOURCED (blade count only); pitch type gap |

## 4. Performance tables

All rows at 7,830 lb (3,551.6 kg) unless noted. Source for every SOURCED row: TAIC Manual No. 1, sheet 401A-2 "VAL 22", dated December 1944, PDF p161, URL in header, read 2026-09-29. Values verified visually against the rendered page, not only OCR.

**Speed (level, TAIC)**

| Altitude | Speed as printed | Speed m/s (arithmetic) | Label |
|---|---|---|---|
| Sea level | 230 mph (200 kt) | 230 x 0.44704 = 102.8 | SOURCED |
| 9,850 ft = 3,002 m | 261 mph (226 kt) | 261 x 0.44704 = 116.7 | SOURCED |
| 20,300 ft = 6,187 m | 281 mph (244 kt) | 281 x 0.44704 = 125.6 | SOURCED |
| 1,500 ft = 457 m (cruise, 75% Vmax) | 168 mph (145 kt) | 168 x 0.44704 = 75.1 | SOURCED |

Speeds are TAIC's stated speeds; whether they are indicated or true is not printed on the sheet (assume true, as for other TAIC sheets; UNVERIFIED).

**Climb (TAIC)**

| Item | As printed | Metric | Label |
|---|---|---|---|
| Rate at sea level | 2,160 ft/min | 2,160 x 0.00508 = 10.97 m/s | SOURCED |
| Rate at 9,850 ft (3,002 m) | 2,330 ft/min | 2,330 x 0.00508 = 11.84 m/s | SOURCED |
| Time to 10,000 ft (3,048 m) | 4.5 min | 4.5 min | SOURCED |
| Time to 20,000 ft (6,096 m) | 9.5 min | 9.5 min | SOURCED |
| Service ceiling | 33,600 ft | 33,600 x 0.3048 = 10,241 m | SOURCED |

Check: 3,048 m in 4.5 min = 11.3 m/s mean, consistent with 10.97 and 11.84 m/s. Rate at 20,300 ft is not printed (gap; the time-to-20,000 ft gives a mean of 6,096 m / 570 s = 10.7 m/s, DERIVED).

**Take-off (TAIC)**: 516 ft calm = 157.3 m; 188 ft with 25 kt wind = 57.3 m; both at 7,830 lb, SOURCED. Surface, flap setting and obstacle not stated (gap).

**Range (TAIC)**: 1,580 statute miles at max fuel (2,543 km); 965 statute miles at normal fuel with the 550 lb bomb (1,553 km). SOURCED. Multiply mph/miles by 1.609344 for km.

**Secondary performance (conflicts)**

| Item | Value | Source | Label |
|---|---|---|---|
| Max speed | 430 km/h at 6,200 m (267 mph, 119.4 m/s) | WP-en (Francillon), also Planes of Fame 267 mph | SOURCED (secondary); 5% below TAIC 281 mph |
| Max speed | 427.8 km/h at 5,650 m | WP-ja | SOURCED (secondary) |
| Max speed | 281 mph at 20,300 ft | Skytamer (Jane's) | SOURCED (secondary); same as TAIC, probably derived from it |
| Climb | 3,000 m in 5 min 48 s (8.6 m/s mean) | WP-en | SOURCED (secondary); TAIC 3,048 m in 4.5 min is faster |
| Climb | 1,869 ft/min = 9.49 m/s | Skytamer, Planes of Fame | SOURCED (secondary); conditions unstated |
| Ceiling | 10,500 m (WP-en, WP-ja); 30,000 ft (Skytamer); 34,450 ft (Planes of Fame) | as listed | SOURCED (secondary); TAIC 33,600 ft |
| Cruise | 296 km/h at 3,000 m | WP-en | SOURCED (secondary) |

**Not sourced anywhere (must be ESTIMATE in the spec)**

| Item | Estimate | Basis | Label |
|---|---|---|---|
| Stall, power off, clean, 3,551.6 kg | about 33 m/s (Vs = sqrt(2 W / (rho S CLmax)) = sqrt(2 x 3,551.6 x 9.81 / (1.225 x 34.93 x 1.5)) = 32.9 m/s) | CLmax 1.5 assumed, no source | ESTIMATE |
| Stall, flaps down | about 29 m/s (same formula with CLmax 1.9 assumed = 29.3 m/s) | CLmax assumed | ESTIMATE |
| Climb rate at 6,187 m | not printed | interpolate or ESTIMATE | ESTIMATE |
| Roll rate | none found | fixed-wing dive bomber; no test | ESTIMATE |
| Level speed above 20,300 ft | none | ceiling 33,600 ft implies falling speed | ESTIMATE |

## 5. Gear and flap

| Item | Value | Unit | Source | Page | URL | Read | Label |
|---|---|---|---|---|---|---|---|
| Gear type | fixed single-leg cantilever main gear with spats, fixed tailwheel | n/a | Skytamer (Jane's) | n/a | skytamer.com | 2026-09-29 | SOURCED (secondary) |
| Gear retraction | none (`docs/aircraft.md` D5: fixed gear has `travelSeconds` but no retraction) | n/a | repo docs plus Skytamer | n/a | n/a | 2026-09-29 | SOURCED |
| `gear.travelSeconds` | no source (nothing to retract) | s | none | n/a | n/a | n/a | ESTIMATE, gap; value only drives any modeled animation |
| Flaps | fitted, type not stated (split or slotted unknown); deflection angle none found | n/a | Skytamer | n/a | skytamer.com | 2026-09-29 | SOURCED (existence only); angles and travel time are gaps |
| Dive brakes | slat-type, under the main spar; design speed 200 kn (WP-en), IJN request 240 kn | kn / m/s | Skytamer; WP-en | n/a | as above | 2026-09-29 | SOURCED (secondary); 200 kn = 102.9 m/s, 240 kn = 123.5 m/s, both below TAIC level speed, so these are dive-brake design points, not a dive limit |
| Arrester hook | forward of tailwheel | n/a | Skytamer | n/a | skytamer.com | 2026-09-29 | SOURCED (secondary) |

## 6. Carrier suitability and AI maneuver limits

| Item | Value | Unit | Source | Page | URL | Read | Label |
|---|---|---|---|---|---|---|---|
| Carrier capable | yes; carrier trials on Akagi and Kaga in 1940; Model 22 adopted 7 Jan 1943 | n/a | WP-en | n/a | en.wikipedia.org | 2026-09-29 | SOURCED (secondary) |
| Take-off run, wind over deck | 516 ft calm = 157.3 m; 188 ft in 25 kt wind = 57.3 m (7,830 lb) | ft / m | TAIC 401A-2 | PDF p161 | TAIC URL | 2026-09-29 | SOURCED; deck lengths are not in this dossier |
| Approach / stall speed | no source | m/s | none | n/a | n/a | n/a | ESTIMATE (see section 4 stall estimate) |
| Dive speed limit `limits.diveSpeedMps` | none found (WP-en 240 kn is the IJN dive-brake design request, not VNE) | m/s | none | n/a | n/a | n/a | ESTIMATE, gap |
| g limit `limits.gLimit` | none found | g | none | n/a | n/a | n/a | ESTIMATE, gap |
| Sustained turn rate, max roll rate | none found | deg/s | none | n/a | n/a | n/a | ESTIMATE, gap |

## 7. Armament and payload

| Item | Value | Unit | Source | Page | URL | Read | Label |
|---|---|---|---|---|---|---|---|
| Forward guns | 2 x 7.7 mm, fixed, 791 rounds per gun | n/a | TAIC sheet 401A-3 (armament table, verified on the page image) | PDF p162 | TAIC URL | 2026-09-29 | SOURCED |
| Top (rear cockpit) gun | 1 x 7.7 mm, flexible, 1,000 rounds per gun (not modeled) | n/a | TAIC 401A-3 | PDF p162 | TAIC URL | 2026-09-29 | SOURCED |
| Fuel tank protection / armor | none found "up to the present time" | n/a | TAIC 401A-3 tactical data | PDF p162 | TAIC URL | 2026-09-29 | SOURCED |
| Forward gun type | Type 97 Mod 3 (Vickers): 850 rounds/min, 2,450 ft/s = 746.8 m/s, 27 lb = 12.25 kg, effective range 600 yd = 549 m | rpm / ft/s | TAIC sheet 901 | PDF p250 | TAIC URL | 2026-09-29 | SOURCED (type identification from WP-en; sheet 401A-3 prints only caliber) |
| Rear gun type | Type 92 (Lewis): 600 rounds/min, 2,500 ft/s = 762 m/s, 18.5 lb = 8.39 kg | rpm / ft/s | TAIC sheet 901 | PDF p250 | TAIC URL | 2026-09-29 | SOURCED (type from WP-en) |
| Bullet weight | ball 13.1 g, AP 10.5 g, tracer 10.0 g (Type 89 family sheets; Type 97 ammunition is the Navy variant, so applicability is inferred) | g | TAIC Type 89 sheets | PDF p251-253 | TAIC URL | 2026-09-29 | SOURCED, applicability to Type 97 inferred |
| Bomb, centerline | 1 x 250 kg (TAIC prints 550 lb; 250 kg = 551 lb) on a trapeze that swings the bomb clear of the prop | kg | TAIC 401A-2; WP-en | PDF p161 | TAIC URL | 2026-09-29 | SOURCED |
| Bombs, wing racks | 2 x 60 kg, outboard of the dive brakes | kg | WP-en | n/a | en.wikipedia.org | 2026-09-29 | SOURCED (secondary); TAIC lists only the 250 kg; Eyre's D3A1 data says 2 x 30 kg per wing (D3A1, conflict) |
| Total bomb load | 250 + 2 x 60 = 370 kg | kg | computed | n/a | n/a | n/a | DERIVED |
| Bomber weight check | 8,380 - 7,830 = 550 lb, equals the 250 kg bomb | lb | computed from TAIC | PDF p161 | TAIC URL | 2026-09-29 | DERIVED |

## 8. Variant differences and whether the model matches

| Item | Finding | Source | Label |
|---|---|---|---|
| Variant covered | D3A2 Model 22: Kinsei 54 (1,280 hp), larger fuel capacity than D3A1, adopted 7 Jan 1943. TAIC "VAL 22" is exactly this model | WP-en; TAIC 401A-2 | SOURCED |
| D3A1 Model 11 | Kinsei 43/44 (about 1,000 to 1,075 hp); do not mix D3A1 data (e.g. Eyre's aeropedia numbers) into the Model 22 reference | WP-en, Eyre | SOURCED (secondary) |
| 3D model | Sketchfab "d3a-val" by helijah, CC-BY-4.0, uid 6f47d38de28b4a879481850b68bca501, forward -x, Prop split. Variant (Model 11 vs 22) not verified from the mesh | `tools/models/entries/d3a-val.json` | not checked against a drawing |
| Dimension test | test uses span 14.365 m, length 10.195 m, tolerance 0.04 (fraction, assumed). TAIC length 10.790 m is 5.8% longer, outside 4%; TAIC span 14.478 m is 0.8% wider. The test value is the WP-en number | `aircraftDimensions.test.ts` | flag |

## Recommended reference block

Use the TAIC sheet 401A-2 numbers as the flight-fit reference; all are one document at one weight.

| Field | Value | Label |
|---|---|---|
| `testMassKg` | 3,551.6 (7,830 lb x 0.45359) | SOURCED (TAIC 401A-2, PDF p161) |
| `topSpeedMps` | 125.6 (281 mph, 244 kt) | SOURCED |
| `topSpeedAltitudeM` | 6,187 (20,300 ft) | SOURCED |
| `topSpeedByAltitudeM` | { 0: 102.8, 3002: 116.7, 6187: 125.6 } | SOURCED |
| `climbRateMps` | 10.97 at sea level | SOURCED |
| `climbRateByAltitudeM` | { 0: 10.97, 3002: 11.84 } (next point at 6,187 m has no source) | SOURCED, second altitude gap |
| `takeoffDistanceM` (optional) | 157.3 calm (516 ft) | SOURCED |
| `stallSpeedMps`, `stallSpeedFlapMps` | about 33 and 29 (indicated, power off) | ESTIMATE (CLmax assumed 1.5 and 1.9); no source |
| `rollRateDegPerSec` | none | ESTIMATE |
| `engine.maxPowerW` | 954,500 (1,280 hp sea level take-off) | SOURCED |
| `engine.powerFractionByAltitudeM` | { 0: 1.00, 3002: 0.926, 6187: 0.848 } using military ratings over the take-off value; see engine table for the 0.84 alternative at sea level | DERIVED |
| `mass.fuelCapacityKg` | 779 | DERIVED (density ESTIMATE) |
| `limits.diveSpeedMps`, `limits.gLimit`, `gear.travelSeconds`, flap block angles and time | none | ESTIMATE |
| combat block | 2 x 7.7 mm forward, 791 rounds each; 250 kg + 2 x 60 kg bombs | SOURCED |

Fields with NO source that must be ESTIMATE: stall speeds (both), roll rate, dive speed limit, g limit, gear travel seconds, flap deflection and time, climb rate at 6,187 m, propeller pitch type.

## Gaps and risks

1. **Top speed conflict.** TAIC 281 mph (452 km/h) at 20,300 ft vs WP-en/Planes of Fame 267 mph (430 km/h) at 6,200 m. Unresolved. TAIC is a captured-aircraft or estimated sheet; Skytamer repeats 281 mph and probably derives from it. Recommend TAIC as primary and noting the 5% spread.
2. **Fuel conflict.** TAIC 286 US gal (1,083 L) vs WP-en 900 L (240 US gal) vs Jane's 206 Imp gal (936 L). Only affects `fuelCapacityKg` (779 vs about 648 kg at 0.72 kg/L).
3. **Length conflict.** TAIC 35.4 ft (10.79 m) vs 10.195 m in the dimension test, outside its tolerance if the tolerance is 4%. The Wikipedia figure (Francillon) is used by the test; decide which is authoritative before changing the model scale.
4. **Empty weight.** WP-ja 2,750 kg contradicts TAIC and WP-en (2,570 kg); probably a typo.
5. **Climb conflict.** TAIC 2,160 ft/min at sea level (10.97 m/s) vs 1,869 ft/min (9.49 m/s) and 3,000 m in 5 min 48 s from secondary sources with no stated weight.
6. **TAIC sheet limits.** No stall, flap, dive limit, g limit, roll rate. No wwiiaircraftperformance.org document for the Val; no NASM or US flight-test report found. Speeds' indicated/true basis is not printed.
7. **Wing bombs.** TAIC shows only the 250 kg centerline bomb; the 2 x 60 kg racks come from WP-en only.
8. **Model variant unverified.** Not compared against Model 11 vs 22 recognition features (Model 22 has a redesigned cowling, exhaust and larger tank).
9. **Blocked sources.** ww2aircraft.net and tracesofwar returned a Cloudflare challenge and were not read. technicalparameters.eu was discarded because it calls the Val a biplane.

## Sources read (all 2026-09-29)

- TAIC Manual No. 1, "Japanese Aircraft Performance and Characteristics", June 1945: https://archive.org/download/japanese-aircraft-performance-characteristics-taic-manual/p4013coll8_4531.pdf (pages used: PDF p161 sheet 401A-2 Val 22 performance; p162 sheet 401A-3 Val 22 armament; p217 sheet 856 Kinsei 51-54; p250 sheet 901 Type 92 and Type 97 guns; p251-253 Type 89 sheets)
- English Wikipedia "Aichi D3A": https://en.wikipedia.org/wiki/Aichi_D3A
- Japanese Wikipedia "九九式艦上爆撃機" (cites Sekai no Kessaku-ki No. 130): https://ja.wikipedia.org/wiki/九九式艦上爆撃機
- combinedfleet.com D3A page (Francillon scan): https://www.combinedfleet.com
- Skytamer (Jane's 1945-46 Val entry): https://www.skytamer.com
- Planes of Fame D3A page and warbirdsresourcegroup Val page: https://www.planesoffame.org, https://www.warbirdsresourcegroup.org
- Eyre / aeropedia (D3A1 data only, used to identify a conflict)
- Repo files: `content/aircraft/a6m2-zero.json`, `tests/tools/models/aircraftDimensions.test.ts`, `tools/models/entries/d3a-val.json`, `content/library/d3a-val.json`, `docs/aircraft.md`
- Index checked with no Val document: wwiiaircraftperformance.org
