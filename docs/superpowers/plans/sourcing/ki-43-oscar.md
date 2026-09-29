# Sourcing dossier: Nakajima Ki-43-II Hayabusa (Oscar 2), `ki-43-oscar`

Research only, read 2026-09-29. Nothing here has been entered into `content/aircraft/`.
Labels: SOURCED (a document prints it), DERIVED (arithmetic on sourced figures, shown), ESTIMATE (no document), GAP (looked, not found).

## Headline findings

1. **The kind line and `docs/aircraft.md` D5 are wrong about the gear.** The Ki-43 has **retractable** main gear from the prototype on; only its predecessor, the Ki-27 Nate, had fixed gear. `docs/aircraft.md` line 91 ("A fixed gear (Val, Oscar) ...") should say Val only. Sources: Japanese Wikipedia "一式戦闘機", opening section ("[Ki-27] fixed gear ... 引込脚を採用", read 2026-09-29) and its spec-derived text ("脚が引込み式になったという外形的特徴"); English Wikipedia category "Aircraft with retractable conventional landing gear" (read 2026-09-29). The drawn `.glb` carries `GearL` and `GearR` nodes (pivots about +x), consistent with retracting main legs. Retract time is a GAP (section 5). The tailwheel is believed fixed, but no document I read says so. Label it ESTIMATE until read.
2. **No flight-test report exists on wwiiaircraftperformance.org for the Oscar.** Its only Oscar file is the TAIC sheet `Ki-43-152A.pdf` (an intelligence summary, not a trial). Two captured Ki-43-Ia were flown by the TAIU at Eagle Farm in March-April 1944 (Wikipedia "Technical Air Intelligence Unit"; silverhawkauthor.com), but I found no published figures from those flights.
3. **Stall speed (clean and flaps down), take-off speed, roll rate and g limit have no source.** Section 4.
4. **Sources disagree materially on top speed.** TAIC prints 347 mph at 20,000 ft (war emergency); Wikipedia/Francillon prints 330 mph at 13,000 ft for the same IIb. Both are kept below.
5. **The bomb load in the kind line ("2 small bombs") matches Wikipedia's 2 x 30 kg, but TAIC prints 2 x 100 kg maximum.** The repo's only bomb store is `an-m65` (453.6 kg), which is not a Ki-43 store.

## 1. Geometry

| Item | Value | Unit as printed | Metric / arithmetic | Source | Page | URL | Read | Label |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Span (short-wing Oscar 2) | 35.6 | ft | 35.6 x 0.3048 = 10.85 m | TAIC Sheet 152A-2, Oscar 2, Dec 1944 (`Ki-43-152A.pdf`) | p.2 of 3 (sheet 152A-2) | https://web.archive.org/web/2020/http://www.wwiiaircraftperformance.org/japan/Ki-43-152A.pdf | 2026-09-29 | SOURCED |
| Span (same) | 10.84 (10.837 in Japanese text) | m | matches `aircraftDimensions.test.ts` 10.84 | English Wikipedia "Nakajima Ki-43 Hayabusa", Specifications (Ki-43-IIb, Francillon 1979 pp.213-214); Japanese Wikipedia 諸元 (Ki-43-II 10.837 m) | spec box | https://en.wikipedia.org/wiki/Nakajima_Ki-43_Hayabusa ; https://ja.wikipedia.org/wiki/一式戦闘機 | 2026-09-29 | SOURCED (secondary) |
| Span, Ki-43-I and early Ki-43-II (long wing) | 11.437 (Ki-43-I) | m | not the modeled variant | Japanese Wikipedia 諸元 | table | https://ja.wikipedia.org/wiki/一式戦闘機 | 2026-09-29 | SOURCED (secondary), for exclusion |
| Length | 29.2 | ft | 29.2 x 0.3048 = 8.90 m | TAIC 152A-2 | p.2 of 3 | as above | 2026-09-29 | SOURCED |
| Length | 8.92 | m | test cites 8.92, tol. 0.04 | Wikipedia (Francillon) | spec box | en.wikipedia.org above | 2026-09-29 | SOURCED (secondary) |
| Height | 9 (Dec 1944 sheet); 11.7 (May 1945 manual); 3.27 m (Wikipedia) | ft ; ft ; m | 9 ft = 2.74 m; 11.7 ft = 3.57 m; the two TAIC sheets disagree with each other and with 3.27 m (10 ft 9 in) | TAIC 152A-2; TAIC Manual No. 1 sheet 152A-2 (PDF p.61); Wikipedia | as cited | archive.org URL in section list | 2026-09-29 | SOURCED, CONFLICT. Use 3.27 m (also Japanese Wikipedia, level attitude). Height is not a flight-fit field |
| Wing area | 232 (Dec 1944); 231 (May 1945) | sq ft | 232 x 0.092903 = 21.55 m2; 231 x 0.092903 = 21.46 m2 | TAIC 152A-2; TAIC Manual No. 1 | as cited | as cited | 2026-09-29 | SOURCED |
| Wing area | 21.4 (230 sq ft printed) | m2 | matches TAIC to 0.7% | Wikipedia (Francillon); Japanese Wikipedia (late Ki-43-II 21.4, early 22) | spec box | as above | 2026-09-29 | SOURCED (secondary). Recommend 21.4 |
| Mean chord | n/a | | 21.4 / 10.84 = 1.974 m (area / span) | | | | | DERIVED. No chord printed anywhere I read |
| Airfoil | root NN-12 mod. (18% thick), tip NN-12 mod. (8%) | | | Wikipedia spec box, citing Lednicer "Incomplete Guide to Airfoil Usage" | spec box | https://m-selig.ae.illinois.edu/ads/aircraft.html | 2026-09-29 | SOURCED (secondary, not re-read at Lednicer) |
| Wing sweep | none cited | | | | | | | GAP (planform is straight-tapered; no figure printed) |
| Dihedral | not found | | | | | | | GAP |

## 2. Mass

Test mass matches the TAIC table: **5,500 lb**.

| Item | Value | Unit as printed | Metric / arithmetic | Source | Page | URL | Read | Label |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Empty | 4,170 | lb | 4170 x 0.45359237 = 1,891.5 kg | TAIC 152A-2 (Dec 1944); same in Manual No. 1 | sheet 152A-2 | as cited | 2026-09-29 | SOURCED |
| Empty | 1,910 (4,211 lb); Japanese Wikipedia 1,975 | kg | Wikipedia is 18.5 kg (1%) above TAIC; Japanese source 83 kg above | Wikipedia (Francillon); Japanese Wikipedia 諸元 | spec box | as above | 2026-09-29 | SOURCED (secondary), CONFLICT |
| Gross (test mass) | 5,500 | lb | 5500 x 0.45359237 = 2,494.8 kg | TAIC 152A-2, every performance line is "@ 5500 lb" | sheet 152A-2 | as cited | 2026-09-29 | SOURCED. Recommended testMassKg = 2,494.76 |
| Gross, other sources | 2,590 (5,710 lb) | kg | 2590 / 2494.8 = 1.038, so 3.8% heavier than the TAIC test mass | Wikipedia; Japanese Wikipedia "常装備" 2,590 kg | spec box | as above | 2026-09-29 | SOURCED (secondary) |
| Overload | 6,240 | lb | 6240 x 0.45359237 = 2,830.5 kg | TAIC 152A-2 | sheet 152A-2 | as cited | 2026-09-29 | SOURCED |
| Max takeoff | 2,925 (Wikipedia); 2,945 "満載" (Japanese Wikipedia) | kg | Wikipedia 6,449 lb | as cited | spec box | as above | 2026-09-29 | SOURCED (secondary), CONFLICT (20 kg). Recommend 2,925 kg (Wikipedia) or 2,830.5 kg (TAIC overload); pick one and name it |
| Internal fuel, built-in | 149 US gal (123 imp gal) | gal | 149 x 3.78541 = 564.0 L; x 0.72 kg/L = 406.1 kg (0.72 is the repo's Zero convention) | TAIC 152A-2 | sheet 152A-2 | as cited | 2026-09-29 | SOURCED gal; DERIVED kg |
| Fuel load at 5,500 lb | 892 | lb | 892 x 0.45359237 = 404.6 kg | TAIC 152A-1 (chart key, March 1945) | sheet 152A-1 | as cited | 2026-09-29 | SOURCED; agrees with 406.1 kg to 0.4% |
| Fuel, other | 550 L (120 imp gal); Japanese Wikipedia wing tanks 125 x 2 + 147 x 2 = 544 L | L | 544 x 0.72 = 391.7 kg | Wikipedia; Japanese Wikipedia | spec box | as above | 2026-09-29 | SOURCED (secondary), differs 3.6% from TAIC |
| Drop tanks | 108 US gal (90 imp) pair; Wikipedia 2 x 200 L | gal | 108 x 3.78541 = 408.8 L; 2 x 200 = 400 L | TAIC; Wikipedia | as cited | as cited | 2026-09-29 | SOURCED, agree within 2% |
| Fuel at overload | 1,540 | lb | 1540 x 0.45359237 = 698.5 kg = 257 US gal max | TAIC 152A-1, 152A-2 | as cited | as cited | 2026-09-29 | SOURCED |
| Oil | not found | | | | | | | GAP |
| Ammunition | 250 rds/gun (TAIC); 270 rds/gun (Wikipedia, Japanese Wikipedia) | rounds | 2 guns | TAIC 152A-3 armament table; Wikipedia | sheet 152A-3 | as cited | 2026-09-29 | SOURCED, CONFLICT (8%). Recommend 270 (two secondary agree) or 250 (the primary) and name it |

Harness note (Ruling R31, as in the Zero's spec): fuelKg carries pilot, oil and ammunition, so internal fuel below `testMassKg - emptyKg` = 2,494.8 - 1,891.5 = 603.3 kg is expected. Fuel 404.6 kg is the sourced figure; 603.3 - 404.6 = 198.7 kg is the pilot, oil and ammunition allowance TAIC's 5,500 lb implies (DERIVED, not printed).

## 3. Engine and propeller

Engine: **Nakajima Ha-115 ("Type 2 1150 hp", Ha 35 Model 23)**, 14-cylinder two-row air-cooled radial, one engine, two-speed single-stage supercharger, 92-octane fuel.

| Item | Value | Unit as printed | Metric / arithmetic | Source | Page | URL | Read | Label |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Take-off | 1,105 hp at 2,800 rpm, 41.7 in Hg, sea level | hp | 1105 x 0.7457 = 824 kW | TAIC Manual No. 1, engine sheet "Type 2 1150 HP" (installed in Oscar 2), Dec 1944 | PDF p.213 | https://archive.org/details/japanese-aircraft-performance-characteristics-taic-manual | 2026-09-29 | SOURCED |
| War emergency (WEP) | 1,105 hp SL; 1,165 hp at 8,000 ft (low blower); 1,030 hp at 18,900 ft (high blower) | hp | 1165 x 0.7457 = 868.7 kW at 2,438 m (8000 x 0.3048); 1030 x 0.7457 = 768.1 kW at 5,761 m | TAIC engine sheet; Oscar 2 sheet 152A-2 prints 1,165 at 8,000 ft | PDF p.213; 152A-2 | as cited | 2026-09-29 | SOURCED. Limited duration (1 min for T.O. and WEP on Model 21; the Ha 115 duration is not printed) |
| Military | 995 hp SL; 1,085 hp at 9,200 ft; 965 hp at 19,700 ft (2,700 rpm, 37.8 in Hg) | hp | 995 = 742.0 kW; 1085 = 809.1 kW at 2,804 m; 965 = 719.6 kW at 6,005 m | TAIC engine sheet; 152A-2 | PDF p.213 | as cited | 2026-09-29 | SOURCED |
| Normal (per Oscar 2 sheet) | 925 hp; 800 hp | hp | altitudes on sheet read "9,350 ft" and "20,000 ft" from the scan | TAIC 152A-2 (scan read visually, no OCR) | sheet 152A-2 | as cited | 2026-09-29 | SOURCED, low read confidence |
| Take-off, other sources | 1,300 hp (970 kW) Wikipedia; 1,150 hp (Japanese Wikipedia); May 1945 sheet 1,065 hp | hp | | Wikipedia; Japanese Wikipedia; TAIC Manual sheet 152A-2 (PDF p.61) | as cited | as cited | 2026-09-29 | SOURCED, CONFLICT: 1,065 / 1,105 / 1,150 / 1,300 hp. Recommend TAIC 1,105 hp (matches the performance table's power). 1,300 hp is the Wikipedia/Francillon nominal figure and is not the rating the TAIC speeds used |
| Power at altitude, other sources | Wikipedia: 1,200 hp at 3,000 m (890 kW printed), 1,100 hp at 6,200 m (820 kW printed). Japanese Wikipedia: 940 hp at 5,600 m (Ki-43-II) | | | as cited | spec box | as above | 2026-09-29 | SOURCED (secondary), CONFLICT with TAIC (965 hp at 6,005 m) |
| Propeller | 3 blades, constant speed, 9 ft 2 in (Dec 1944 sheet prints "9.2'") | ft | 9.167 x 0.3048 = 2.794 m | TAIC 152A-2 | sheet 152A-2 | as cited | 2026-09-29 | SOURCED |
| Propeller, other | Hamilton Standard-type, 3 blades, 2.80 m (Ki-43-I: 2 blades, 2.90 m) | m | | Japanese Wikipedia 諸元; Wikipedia | table | as above | 2026-09-29 | SOURCED (secondary) |
| Reduction ratio | 0.6875 | ratio | | TAIC engine sheet | PDF p.213 | as cited | 2026-09-29 | SOURCED |
| Supercharger | two-speed, ratios 6.37 and "8.U" (scan) | | Model 21 shows 8.44; the Ha 115 column's OCR reads "8.U", almost certainly 8.44 | TAIC engine sheet | PDF p.213 | as cited | 2026-09-29 | SOURCED, low read confidence on the second ratio |
| Displacement, dry weight | 27.9 L (1,700 cu in); 600 kg (1,320 lb) | | | TAIC engine sheet | PDF p.213 | as cited | 2026-09-29 | SOURCED |
| Ram effect / manifold pressure by altitude | not printed | | | | | | | GAP. No ram-air term; the fit will absorb it as it did for the Zero |

**Power-by-altitude curve** for `powerFractionByAltitudeM` (DERIVED from the TAIC military rating, fractions of the 1,085 hp peak; the F6F/Zero blocks use the same shape). Blower change between 2,804 m and 6,005 m is not tabulated, so the interior is a straight-line ESTIMATE:

| Altitude m | Power hp | Fraction of 1,085 | Label |
| --- | --- | --- | --- |
| 0 | 995 | 0.917 | DERIVED (995 / 1085) |
| 2,804 (9,200 ft) | 1,085 | 1.000 | DERIVED |
| 6,005 (19,700 ft) | 965 | 0.889 | DERIVED (965 / 1085) |
| above 6,005 | none printed | | ESTIMATE, extrapolated by the fit; TAIC's ceiling and climb graph only bound it |

The Zero's fit dropped its curve earlier than the rating to match climb. Expect the same here: **the fit will likely need FITTED, not SOURCED, fractions**.

## 4. Performance

All TAIC figures are at **5,500 lb**, sheet 152A-2 (Oscar 2, short wing, Dec 1944) unless marked. The sheets are intelligence summaries; they do not state that any figure was flown. The Dec 1944 sheet's own text says "Recent reports indicate increased performance, possibly through water injection."

| Item | Value | Unit as printed | Metric / arithmetic | Source | Page | URL | Read | Label |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Max speed, sea level (war emergency) | 295 | mph | 295 x 0.44704 = 131.88 m/s | TAIC 152A-2 | sheet 152A-2 | https://web.archive.org/web/2020/http://www.wwiiaircraftperformance.org/japan/Ki-43-152A.pdf | 2026-09-29 | SOURCED |
| Max speed, 20,000 ft (war emergency) | 347 | mph | 347 x 0.44704 = 155.13 m/s at 6,096 m | TAIC 152A-2 | sheet 152A-2 | as above | 2026-09-29 | SOURCED. Recommended top-speed point |
| Cruising, 75% Vmax | 202 | mph | 90.3 m/s at 1,500 ft = 457 m | TAIC 152A-2 | sheet 152A-2 | as above | 2026-09-29 | SOURCED |
| Speed, mid altitudes | about 330 at 9,000 ft; about 325 at 14,500 ft; about 325 at 30,000 ft | mph | 147.5 m/s at 2,743 m; 145.3 m/s at 4,420 m and 9,144 m | TAIC 152A-1 "Speed vs. Altitude" graph (War Emerg curve), March 1945, read by eye from a 220 dpi render, +/-5 mph | sheet 152A-1 | as above | 2026-09-29 | ESTIMATE (graph read, not a printed table). The curve kinks where the blower shifts (about 9,000 ft and 14,500 ft) |
| Climb rate, sea level | 3,290 | ft/min | 3290 x 0.00508 = 16.71 m/s | TAIC 152A-2 | sheet 152A-2 | as above | 2026-09-29 | SOURCED |
| Climb rate, 17,500 ft | 2,850 | ft/min | 2850 x 0.00508 = 14.48 m/s at 5,334 m | TAIC 152A-2 ("Rate @ 17,500 ft") | sheet 152A-2 | as above | 2026-09-29 | SOURCED |
| Time to 10,000 ft / 20,000 ft | 3.0 / 6.5 | min | mean 3,333 ft/min and 3,077 ft/min (DERIVED, 10000/3.0 and 20000/6.5) | TAIC 152A-2 | sheet 152A-2 | as above | 2026-09-29 | SOURCED; means DERIVED |
| Service ceiling | 37,100 | ft | 37,100 x 0.3048 = 11,308 m | TAIC 152A-2 | sheet 152A-2 | as above | 2026-09-29 | SOURCED |
| Service ceiling, other | 36,750 ft (warbirdforum, Joe Baugher); 11,200 m (Wikipedia); 10,500-11,215 m (Japanese Wikipedia) | | | as cited | | https://www.warbirdforum.com/hayabusa.htm | 2026-09-29 | SOURCED (secondary) |
| Take-off run, calm | 450 | ft | 450 x 0.3048 = 137.2 m | TAIC 152A-2 | sheet 152A-2 | as above | 2026-09-29 | SOURCED. Runway surface, flap and power not stated |
| Take-off run, 25 kt wind | 175 | ft | 175 x 0.3048 = 53.3 m | TAIC 152A-2 | sheet 152A-2 | as above | 2026-09-29 | SOURCED |
| Take-off, May 1945 manual | 896 | ft | 896 x 0.3048 = 273.1 m | TAIC Manual No. 1 sheet 152A-2 | PDF p.61 | https://archive.org/details/japanese-aircraft-performance-characteristics-taic-manual | 2026-09-29 | SOURCED, CONFLICT: 450 ft vs 896 ft, a 2x gap between two TAIC sheets. No over-50-ft figure on either |
| Dive limit | 372 | mph | 372 x 0.44704 = 166.30 m/s = 598.7 km/h | TAIC 152A-3 "Tactical data": "OSCAR 2 has a diving speed restriction of 372 mph" | sheet 152A-3 | as above | 2026-09-29 | SOURCED. Same figure: Japanese Wikipedia 600 km/h citing the IJA handbook 「一式戦（二型）取扱法」 (secondary, handbook not read); Manual No. 1 says 370-400 mph from a captured handbook |
| Stall speed, clean, power off | not found | | | | | | | GAP |
| Stall speed, gear and flaps down | not found | | | | | | | GAP |
| Take-off / lift-off speed | not found | | | | | | | GAP |
| Landing speed | 118 km/h (a search-engine summary of a "historical document"; I did not open the document) | km/h | | none confirmed | | | 2026-09-29 | GAP (unverified pointer only; do not use) |
| Roll rate | no number. Japanese Wikipedia: controls very light, stall characteristics good ("離着陸時の操縦性・失速特性も良好"); TAIC: "highly maneuverable with a good rate of climb" | | | Japanese Wikipedia; TAIC 152A-2 | | | 2026-09-29 | GAP (number), qualitative only |
| g limit | not found | | | | | | | GAP |
| Max speed, Wikipedia (Ki-43-IIb) | 530 km/h (330 mph) at 4,000 m (13,000 ft) | km/h | 530 / 3.6 = 147.2 m/s | Wikipedia (Francillon) | spec box | https://en.wikipedia.org/wiki/Nakajima_Ki-43_Hayabusa | 2026-09-29 | SOURCED (secondary), CONFLICT with TAIC (347 mph at 20,000 ft is 17 mph faster and 7,000 ft higher). Warbirdforum: 329 mph at 13,125 ft, same family |
| Time to altitude, other | 5,000 m in 5 min 49 s (Wikipedia); Japanese Wikipedia Ki-43-II 4 min 48 s to 5,000 m, 11 min 9 s to 8,000 m | | 5,000 m / 349 s = 14.3 m/s mean | as cited | | as above | 2026-09-29 | SOURCED (secondary). TAIC 6.5 min to 6,096 m gives 15.6 m/s mean; agrees with 4:48 more than 5:49 |
| Ki-43-III (Oscar 3) | 303 mph SL, 358 mph at 21,900 ft; 3,430 ft/min; ceiling 37,400 ft, at 5,650 lb | | | TAIC Manual No. 1 sheet 152B-2 | PDF p.65 | archive.org above | 2026-09-29 | SOURCED, other variant, listed for scale only |

Speeds are in the tables above as **true** airspeed by TAIC convention (the sheets label the column "Speed (Vm) m.p.h."; whether indicated or true is not stated). The Zero fit treats its table the same way.

## 5. Gear and flaps

| Item | Value | Unit | Source | Page | URL | Read | Label |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Layout | conventional (taildragger) | | Wikipedia category | | https://en.wikipedia.org/wiki/Nakajima_Ki-43_Hayabusa | 2026-09-29 | SOURCED (secondary) |
| Main gear | retractable (引込脚), retracted inward into the wing | | Japanese Wikipedia; Wikipedia | | https://ja.wikipedia.org/wiki/一式戦闘機 | 2026-09-29 | SOURCED (secondary). The direction ("inward") is from my general knowledge and is not printed in a source I read: label ESTIMATE for the direction |
| Retract time | not found | s | | | | 2026-09-29 | GAP. Zero's 10 s is SOURCED to a different document; do not reuse without a label |
| Tailwheel | believed fixed, not steerable-verified | | none read | | | 2026-09-29 | GAP (ESTIMATE) |
| Wheel/leg geometry | not found | | | | | | GAP. Measure `heightM`, `mainX`, `thirdX`, `thirdHeightM` from the mesh (D5 step 3), not a source |
| Flap type | differential "butterfly" (蝶型) Fowler-type combat flaps, selectable in flight to tighten turns | | Wikipedia ("differential 'butterfly' maneuvering Fowler flaps"); Japanese Wikipedia (Ki-43遠戦仕様書 requirement "蝶型戦闘フラップの装備") | | as above | 2026-09-29 | SOURCED (secondary) |
| Flap travel time | not found | s | | | | | GAP |
| Flap speed limits | first notch 250 mph, second notch 200 mph (a search-engine summary of a forum post; not opened) | mph | none confirmed | | | 2026-09-29 | GAP (unverified pointer) |

## 6. Carrier suitability and AI-relevant limits

- **Carrier suitability:** not applicable. The Ki-43 was an Army Air Force fighter with no tailhook; `carrierCapable` = false is the historical answer. (Only D3A is in scope for the carrier question.) Label SOURCED (secondary): Wikipedia describes it as a "single-engine land-based tactical fighter"; the Ki-43 has no navalized variant in any source I read.
- **Dive limit** 372 mph (166.3 m/s): section 4. The Japanese source says its dive and pull-out are weak against later fighters (Japanese Wikipedia 降下性: "急降下時の突っ込み" worse than Ki-61/Ki-84 and Allied fighters). Direction for `ai.excludedManeuvers`: an ESTIMATE, not a stated limit.
- **Maneuver:** TAIC 152A-2: "highly maneuverable with a good rate of climb". Japanese Wikipedia: Allies found it dangerous to enter a turning fight below about 240-400 km/h because of its acceleration and low-speed handling ("低速飛行中の一式戦に不用意に接近するのは危険"). The `ai.excludedManeuvers` list has no sourced content; the Zero excluded `immelmann` on the same footing as an ESTIMATE.
- Armor: 12 mm plate behind the pilot (TAIC 152A-3), "13 mm head and back" (Wikipedia); fuel tanks rubber-covered "leak-proofing" (TAIC 152A-3) and a later self-sealing bladder (Wikipedia). No engine armor. Direction for `structureHp`/`fuelLeakKgPerS`: the same treatment as the Zero, ESTIMATE.

## 7. Armament and payload

| Item | Value | Unit | Source | Page | URL | Read | Label |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Guns | 2 x 12.7 mm, Type 1 fixed (Browning-type), synchronized, in the cowl | | TAIC 152A-3 armament table ("Forward 2, 12.7 mm, 250 rds/gun, Type 1 Fixed, synchronised"); Manual No. 1 sheet 152A-3: "Type 1 Fixed, (Browning), synchronised" | sheet 152A-3 | as cited | 2026-09-29 | SOURCED |
| Rounds per gun | 250 (TAIC); 270 (Wikipedia; Japanese Wikipedia) | rounds | as cited | | | 2026-09-29 | SOURCED, CONFLICT |
| Alternative armament | one 20 mm in place of the two 12.7 mm (printed "12.7 mm or 20 mm, 150 rds") | | TAIC 152A-3 (March 1945 sheet) | sheet 152A-3 | archive.org / web.archive.org URL | 2026-09-29 | SOURCED. Not the IIb standard fit in Wikipedia's description; ignore |
| Ho-103 rate of fire | 983 rpm free-firing (USSBS Report 12-b(2)); 900 rpm (Osprey/Rottman p.22); **400 rpm synchronized** (Rottman) | rpm | English Wikipedia "Ho-103 machine gun" | infobox and body | https://en.wikipedia.org/wiki/Ho-103_machine_gun | 2026-09-29 | SOURCED (secondary; the USSBS and Osprey documents themselves not read). Wikipedia notes Japanese sources dispute the sync penalty; the guns are cowl-mounted so use the synchronized figure, or name the choice |
| Ho-103 muzzle velocity | 780 | m/s | Wikipedia "Ho-103 machine gun" infobox | | as above | 2026-09-29 | SOURCED (secondary) |
| Ho-103 weight | 23 | kg | same | | as above | 2026-09-29 | SOURCED (secondary) |
| Projectile mass | not found | g | | | | | GAP (needed only for `dragPerM` scaling; the Zero's was an ESTIMATE scaled from the F6F .50) |
| Bombs | 2 x 100 kg max (440 lb total; TAIC 152A-2); Wikipedia: 2 x 30 kg or 2 x 250 kg; Ki-43-Ic: 2 x 30 kg; Ki-43-I: 2 x 15 kg | | TAIC 152A-2; Wikipedia Variants and spec box | | as above | 2026-09-29 | SOURCED, CONFLICT. Rack stations: outboard of the landing gear on later IIb (Wikipedia), inboard or centerline on earlier ones |
| Standard load, kind line "2 small bombs" | 2 x 30 kg is the Wikipedia "small" option; 2 x 50 kg is the Oscar 3 "normal" load (TAIC 152B-2, 221 lb) | | TAIC Manual No. 1 sheet 152B-2 (PDF p.65) | | archive.org above | 2026-09-29 | Recommend 2 x 30 kg (Wikipedia) as D7's "historically standard, not maximum" only with the conflict named. **The existing `an-m65` store is 453.6 kg and is wrong for this airframe: a new store needs mass, drag area, filler, damage, blast radius, each with a source** (D8). No source read gives a 30 kg or 100 kg bomb's filler or blast |

## 8. Variant differences and the drawn model

| Item | Finding | Source | Read | Label |
| --- | --- | --- | --- | --- |
| Which variant the tables describe | "Oscar 2" = Ki-43-II (all sub-types a and b). TAIC does not separate IIa from IIb; performance is one row. IIb differs by oil cooler, exhaust angling, drop-tank rack position (Wikipedia Variants) | TAIC 152A-2; Wikipedia | 2026-09-29 | SOURCED |
| Short vs long wing | TAIC 152A-2 says its figures are for the **short-wing** Oscar 2 ("2 ft. less span and blunter tips"; the printed span 35.6 ft = 10.85 m). Early Ki-43-II and the Ki-43-I had the longer wing: 11.437 m (Ki-43-I) | TAIC 152A-2; Japanese Wikipedia | 2026-09-29 | SOURCED |
| What the `.glb` depicts | **Cannot be confirmed.** The Sketchfab page (manilov.ap, CC-BY 4.0, 19.3k triangles, published 2017-01-14) names no variant. `tools/models/entries/ki-43-oscar.json` fits the span to 10.84 m and `tests/tools/models/aircraftDimensions.test.ts` cites 10.84 x 8.92 m (Ki-43-IIb, Wikipedia, read 2026-09-27, tolerance 0.04 m on length), so the model is *sized* as a short-wing Ki-43-II. Whether it is *drawn* as one (blunt wingtips, 3-blade prop, enlarged carb duct) was not checked. Check the tip planform and prop blade count on the mesh before treating it as a IIb | Sketchfab, read 2026-09-29; repo files | 2026-09-29 | GAP |
| Model nodes | `Prop`, `GearL`, `GearR` (rig nodes, from the built glb); body nodes `krilo-FACES` (wing), `kabina-FACES` (canopy, two), `rul_vis01-FACES` (rudder/fin), `eleron01-FACES` (aileron), `rul_napr-FACES`, `LineG02-FACES` x4, `Cylinder*`/`Torus*`/`Tube04` (cowl and engine). **No `Tailwheel` or `GearNose` node**: the T1 layout needs a `Tailwheel` node or it must be measured from a mesh point (Zero uses `drawnPoints` for `thirdX`) | built `content/aircraft/ki-43-oscar.glb`, read 2026-09-29 | 2026-09-29 | SOURCED (from the file) |
| Model rig | split entry: Prop pivot (2.9, 0.0075, 0.664) axis +x; GearL pivot (1.324, -0.305, -0.973) axis +x; GearR (1.322, -0.306, 2.297) axis +x; `yawDeg` 148.7 (a large imported yaw); no `pitchDeg` set, so the D4 nose-up check has not been done | `tools/models/entries/ki-43-oscar.json` | 2026-09-29 | SOURCED (from the file) |
| Prop ground blur | `docs/models.md` line 73 says the Ki-43 prop has blur discs and the orbit check is off | `docs/models.md` | 2026-09-29 | SOURCED (from the file) |

## Recommended reference block

**Reference document:** TAIC "Performance and Characteristics" sheet 152A-2, Oscar 2, Dec 1944, via `wwiiaircraftperformance.org/japan/Ki-43-152A.pdf` (retrieved 2026-09-29 from the Wayback capture, since the live site returns HTTP 403 to `curl` and WebFetch). It is an intelligence summary, not a flight test. Speed-versus-altitude and rate-of-climb graphs on sheet 152A-1 (March 1945) are its companion.

**testMassKg = 2,494.76** (5,500 lb x 0.45359237). Empty 1,891.5 kg (4,170 lb), fuel 404.6 kg (892 lb), max takeoff 2,830.5 kg (overload 6,240 lb) or 2,925 kg (Wikipedia); pick one.

| reference field | value | source label | Notes |
| --- | --- | --- | --- |
| topSpeedMps | 155.13 (347 mph) | SOURCED | at topSpeedAltitudeM 6,096 (20,000 ft), war emergency power |
| topSpeedByAltitudeM | [0, 131.88] (295 mph, SOURCED); [2743, ~147.5] (graph read ~330 mph, ESTIMATE); [4420, ~145.3] (~325 mph, ESTIMATE); [6096, 155.13] (SOURCED); [9144, ~145.3] (~325 mph, ESTIMATE) | mixed | Only two printed points. Prefer fitting to the two SOURCED points and reporting the graph-read points as a check, not a target |
| climbRateMps | 16.71 (3,290 ft/min at sea level) | SOURCED | |
| climbRateByAltitudeM | [5334, 14.48] (2,850 ft/min at 17,500 ft) | SOURCED | Also derived means: 10,000 ft in 3.0 min, 20,000 ft in 6.5 min. Cross-check only. Graph on 152A-1 shows a step at the blower change near 14,500 ft that a one-curve model cannot follow |
| serviceCeiling (not a fit field) | 11,308 m (37,100 ft) | SOURCED | |
| stallSpeedMps | none | **ESTIMATE** | Wing loading at test mass 2,494.8 / 21.4 = 116.6 kg/m2. Zero's stall 34.87 m/s at 112.3 kg/m2 (2,519.7 / 22.44) is the nearest analog; scaling by sqrt(116.6 / 112.3) = 1.019 gives 35.5 m/s, an ESTIMATE, not a source. Label in capitals |
| stallSpeedFlapMps | none | **ESTIMATE** | as above; no flap-down stall for any Ki-43 found |
| takeoffDistanceM | 137.2 m (450 ft, calm) or 273.1 m (896 ft, Manual No. 1) | SOURCED, CONFLICT | conditions unstated. Zero graded a direction card only; do the same, or cite 450 ft, with the 2x conflict named |
| rollRateDegPerSec | none | **ESTIMATE** | qualitative only |
| limits.diveSpeedMps | 166.30 (372 mph) | SOURCED | TAIC 152A-3; agrees with 600 km/h (Japanese Wikipedia, IJA handbook, secondary) |
| limits.gLimit | none | **ESTIMATE** | |
| gear.travelSeconds | none | **ESTIMATE** | |
| flap.travelSeconds | none | **ESTIMATE** | |
| wingAreaM2 / wingSpanM | 21.4 / 10.84 | SOURCED | TAIC 232 sq ft (21.55 m2) agrees within 0.7% |
| mass.emptyKg / fuelCapacityKg | 1,891.5 / 406.1 (149 US gal x 3.78541 x 0.72) | SOURCED / DERIVED | maxTakeoffKg see above |
| engine.maxPowerW | 741,000 (995 hp SL military, x 0.7457 = 742.0 kW) or 824,000 (1,105 hp take-off) | SOURCED | The Zero used its take-off rating; the fit should use the rating TAIC's speeds assume (war emergency 1,165 hp at 8,000 ft); state the choice |
| engine.propEfficiency, cd0, power curve | none | FITTED | measured by the Z2-style sweep |
| engine.staticThrustN | none | ESTIMATE | scale the F6F's 20,000 N by power, as the Zero did |
| gear.dragAreaM2, flap.dragAreaM2, flap.clIncrement | none | ESTIMATE / DERIVED | clIncrement DERIVED only if both stalls are sourced; they are not |
| combat rate/velocity | 400 rpm synchronized; 780 m/s (Ho-103) | SOURCED (secondary) | see section 7 |

**Fields with NO source that must be labeled ESTIMATE:** stallSpeedMps, stallSpeedFlapMps, rollRateDegPerSec, gLimit, gear.travelSeconds, flap.travelSeconds, gear geometry beyond the mesh, tailwheel steering fields, all `rates.*` other than the two stated, projectile mass and `dragPerM`, bomb store figures, `ai.excludedManeuvers`, and (as FITTED) cd0, propEfficiency and the power curve. takeoffDistanceM is sourced only as a conflicting pair with unstated conditions.

## Gaps and risks

1. **No flight-test report.** The primary source is a TAIC summary of unknown basis. The USAAF/TAIU flew rebuilt Ki-43-Ia (Eagle Farm, March-April 1944) and two were later shipped to the US for Anacostia; I found no published numbers. Worth one more pass in the NASM archives, the NARA TAIC reports and the ATAIU-SWPA reports (Ki-43-I only, not the II). Pilot's manual 「一式戦（二型）取扱法」 (the IJA handbook cited by Japanese Wikipedia) is the likeliest source of stall and flap-speed figures; I did not find it online.
2. **Stall speed, flaps-down stall, lift-off speed, roll rate, g limit, retract time, flap time**: none found. All become ESTIMATE, in capitals (D10 (c) needs Mark's approval to choose an ESTIMATE for a reference field).
3. **Two TAIC sheets disagree.** Dec 1944 152A-2: 295 mph SL, 347 mph at 20,000 ft, 3,290 ft/min, 450 ft take-off, ceiling 37,100 ft, height 9 ft, span/area 232 sq ft. May 1945 Manual No. 1 sheet 152A-2: 291 mph SL, 333 mph at 19,100 ft, 3,250 ft/min, 896 ft take-off, ceiling 35,900 ft, height 11.7 ft, area 231 sq ft, take-off engine 1,065 hp. I picked the Dec 1944 sheet because its engine ratings match the engine sheet (also Dec 1944) and it is the one the sourcing site hosts. The May 1945 sheet has lower figures and could be a different weight-power basis.
4. **Secondary sources disagree with TAIC by a wide margin** (330 mph at 13,000 ft vs 347 mph at 20,000 ft; 1,300 hp vs 1,105 hp). Wikipedia's IIb figures are Francillon's nominal figures; the TAIC figures appear to be an Allied estimate. Neither was flown by me or verifiably by a named trial; the fit should carry the TAIC pair with the conflict named in `source`.
5. **The scanned sheets were read visually (no OCR available).** Digits I could not read with confidence: the Ha 115 second supercharger ratio (8.44?), the "Normal" power altitudes on 152A-2 (9,350 / 20,000 ft), the March 1945 graph points. Re-check them against the PDF before citing to the last digit.
6. **Wikipedia's bomb load "2 x 250 kg" is at odds with the kind line's "small bombs"**; `an-m65` (500 lb) is wrong here either way. A new store type with sourced mass and filler is a prerequisite for D8.
7. **`docs/aircraft.md` line 91 ("A fixed gear (Val, Oscar)") is wrong for the Oscar** and should be corrected in the moment (per the repo's stale-doc rule). The model's rig also has no `Tailwheel` node.
8. **The `.glb` variant is unverified** (section 8) and `yawDeg` 148.7 with no `pitchDeg` suggests the D4 nose-up check has not been run for this model.
9. **One-curve power model.** The Ha 115's two-speed blower gives a stepped power curve (peaks near 2,800 m and 6,000 m); the Zero's fit found a curve flat to 3,000 m over-reads climb at 15-30k ft by 44-63%. Expect similar climb mismatch above the blower shift near 4,400 m (14,500 ft).
10. **wwiiaircraftperformance.org returns HTTP 403** to `curl` and WebFetch; every file from it here was read from the Wayback Machine capture of 2020. Use the Wayback URL in citations, or re-check whether the live URL resolves later.

## Sources read

Primary or near-primary (intelligence compilations):
- TAIC Performance and Characteristics sheets 152A-1, 152A-2, 152A-3, "Oscar 2" (Dec 1944 to March 1945), `Ki-43-152A.pdf`, 3 pages, image-only scan, "Archives of M. Williams". Read 2026-09-29 from https://web.archive.org/web/2020/http://www.wwiiaircraftperformance.org/japan/Ki-43-152A.pdf (original URL http://www.wwiiaircraftperformance.org/japan/Ki-43-152A.pdf, live site 403).
- Technical Air Intelligence Center, "Japanese Aircraft Performance and Characteristics, TAIC Manual No. 1" (1945). PDF p.61 (sheet 152A-2 Oscar 2, May 1945), p.65 (sheet 152B-2 Oscar 3), p.212 (Oscar 1 engine Ha 25), p.213 (Ha 115 engine), p.214 (Ha 115-II). Read 2026-09-29. https://archive.org/details/japanese-aircraft-performance-characteristics-taic-manual (files `p4013coll8_4531.pdf`, `_djvu.txt`).

Secondary:
- English Wikipedia "Nakajima Ki-43 Hayabusa" (raw wikitext and rendered), Specifications (Ki-43-IIb), citing Francillon 1979 pp.213-214 and Windrow/Francillon 1965. Read 2026-09-29. https://en.wikipedia.org/wiki/Nakajima_Ki-43_Hayabusa
- Japanese Wikipedia "一式戦闘機", 諸元 table and the sections on climb, stall, armament and gear. Read 2026-09-29. https://ja.wikipedia.org/wiki/一式戦闘機
- English Wikipedia "Ho-103 machine gun" (infobox, rate of fire). Read 2026-09-29. https://en.wikipedia.org/wiki/Ho-103_machine_gun
- Warbirdforum / Joe Baugher, Ki-43-II data. Read 2026-09-29 (summarized by a fetch tool, not read in full). https://www.warbirdforum.com/hayabusa.htm
- flugzeuginfo.net Ki-43 data (agrees with Wikipedia, no new figures). http://www.flugzeuginfo.net/acdata_php/acdata_nakajima_ki43_en.php
- Smithsonian NASM Ki-43-IIb record (dimensions and empty/gross weights only). https://airandspace.si.edu/collection-objects/nakajima-ki-43-iib-hayabusa-peregrine-falcon-oscar/nasm_A19600098000
- Sketchfab model page (manilov.ap). https://sketchfab.com/3d-models/ki43-abdc04cc7afb4aeba0eaac6c5079d6e6
- silverhawkauthor.com, "Warplanes of Japan: captured aircraft examined by ATAIU-SWPA" (confirms the Ki-43-Ia flights only, no figures). https://silverhawkauthor.com/aviation/warplanes-of-japan-captured-aircraft-examined-by-allied-technical-air-intelligence-units-ataiu-south-west-pacific-area-swpa/

Repo files read: `docs/aircraft.md` (Part A onward), `content/aircraft/a6m2-zero.json`, `content/aircraft/f6f-hellcat.json` (reference block), `tests/tools/models/aircraftDimensions.test.ts`, `tools/models/entries/ki-43-oscar.json`, `content/aircraft/ki-43-oscar.glb` (node list), `ASSETS.md`, `docs/models.md`, and on branch `worktree-b17-onboard` the B-17 handoff `docs/handoff/2026-09-29-b-17.md`.

Not opened: ww2aircraft.net threads (HTTP 403), the IJA handbook 「一式戦（二型）取扱法」, Profile Publications No. 46 (12 pages, image-only; not read), Francillon, Osprey/Rottman, USSBS Report 12-b(2).
