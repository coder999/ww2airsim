# Sourcing dossier: Mitsubishi G4M1 Model 11 Betty (`g4m-betty`)

Prepared 2026-09-29 (all "read" dates are 2026-09-29). Research only; no repo code changed.
Format follows `docs/aircraft.md` Part B: every figure carries a source and one of SOURCED / DERIVED / ESTIMATE.

**Headline:** no flight-test report for a G4M1 Model 11 was found. The only primary US document
that covers the type is the TAIC Manual No. 1 (Dec 1944): it gives the **Kasei 11 and Kasei 15 engine
ratings** (good) and a full performance page for the **Betty 22**, which is a different airplane
(G4M2: laminar wing, 4-blade props, 27,570 lb). Every G4M1 airframe, weight and performance number is
**secondary** (English and Japanese Wikipedia, Pacific War Online Encyclopedia), with no test weight
attached to the speed figure.

Abbreviations: EN-WP = English Wikipedia "Mitsubishi G4M" (Specifications, G4M1 Model 11);
JA-WP = Japanese Wikipedia "一式陸上攻撃機" (諸元 table, Model 11 with Kasei 15); TAIC-1 = "Japanese Aircraft
Performance & Characteristics, TAIC Manual No. 1", Technical Air Intelligence Center, Anacostia, Dec 1944
(PDF page numbers below are archive.org PDF pages; printed page numbers in brackets); PWE = Pacific War
Online Encyclopedia.

## 1. Geometry

| Item | Value | Unit as printed | Source | Page | URL | Read | Label |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Span | 24.89 (81 ft 8 in) | m | EN-WP Specifications (Airreview, Francillon cited) | Specifications | https://en.wikipedia.org/wiki/Mitsubishi_G4M | 2026-09-29 | SOURCED (secondary). 81 ft 8 in = 980 in x 0.0254 = 24.892 m |
| Span (alt.) | 24.88 | m | JA-WP 諸元 table | 諸元 | https://ja.wikipedia.org/wiki/一式陸上攻撃機 | 2026-09-29 | SOURCED (secondary), 1 cm below EN-WP |
| Length | 19.97 (65 ft 6 in) | m | EN-WP; JA-WP agrees | Specifications | (same) | 2026-09-29 | SOURCED. 786 in x 0.0254 = 19.964 m |
| Height | 4.9 (16 ft 1 in), "in rigging position" | m | EN-WP | Specifications | (same) | 2026-09-29 | SOURCED. 193 in x 0.0254 = 4.902 m |
| Height, level | 4.506 | m | JA-WP 諸元 (G4M1 column) | 諸元 | (same) | 2026-09-29 | SOURCED (conflicts with 4.9 m; 4.9 is the tail-down figure) |
| Wing area | 78.125 (840.93 sq ft) | m2 | EN-WP; JA-WP identical | Specifications | (same) | 2026-09-29 | SOURCED. 78.125 / 0.092903 = 840.9 sq ft |
| Mean chord | 3.139 | m | 78.125 / 24.89 | n/a | n/a | 2026-09-29 | DERIVED (geometric mean chord, no cited root/tip chords) |
| Aspect ratio | 7.93 | none | 24.89^2 / 78.125 = 619.51 / 78.125 | n/a | n/a | 2026-09-29 | DERIVED |
| Airfoil | MAC118 mod, 12.5% root, 10% tip | none | EN-WP (cites Lednicer database) | Specifications | (same) | 2026-09-29 | SOURCED (secondary) |
| Wing incidence, washout | 2 deg 52 min (2.867 deg) both | deg | JA-WP footnote 1 (cites Sekai no Kessakuki No. 60 and the designer's testimony) | 注釈 1 | (same) | 2026-09-29 | SOURCED (secondary); 2 + 52/60 = 2.867 |
| Dihedral | not found | | | | | | GAP. The Blender script uses 5 deg, labeled ESTIMATE |
| Sweep | not found (straight tapered wing) | | | | | | GAP; script uses taper 0.40, ESTIMATE |
| Tailplane, fin, chords | not found | | | | | | GAP |
| Bomb bay | internal, under the wing center section; no doors when a torpedo is carried | text | PWE; Dwyer at aviation-history.com | text | http://pwencycl.kgbudge.com/G/4/G4M_Betty.htm | 2026-09-29 | SOURCED (secondary) |

## 2. Mass

| Item | Value | Unit as printed | Source | Page | URL | Read | Label |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Empty | 6,741 (14,861 lb) | kg | EN-WP; JA-WP 自重 6,741 | Specifications | https://en.wikipedia.org/wiki/Mitsubishi_G4M | 2026-09-29 | SOURCED (secondary). 6,741 x 2.20462 = 14,861 lb |
| "Gross" | 9,500 (20,944 lb) | kg | EN-WP | Specifications | (same) | 2026-09-29 | SOURCED (secondary), see risk below. 9,500 x 2.20462 = 20,944 lb |
| Maximum takeoff | 12,860 (28,351 lb) | kg | EN-WP | Specifications | (same) | 2026-09-29 | SOURCED (secondary). 12,860 x 2.20462 = 28,351 |
| Overload (Kasei 15 Model 11) | 12,895 | kg | JA-WP 過荷重重量 | 諸元 | https://ja.wikipedia.org/wiki/一式陸上攻撃機 | 2026-09-29 | SOURCED (secondary); 35 kg above EN-WP |
| Range of weights | 14,991-20,944 lb (6,800-9,500 kg) | lb / kg | PWE spec box | Specifications | http://pwencycl.kgbudge.com/G/4/G4M_Betty.htm | 2026-09-29 | SOURCED (secondary) |
| Internal fuel, low figure | 962 US gal (3,640 L) in the wings | gal / L | PWE; Dwyer (aviation-history.com) gives 960 gal / 3,640 L for the G6M1 | text | http://pwencycl.kgbudge.com/G/4/G4M_Betty.htm | 2026-09-29 | SOURCED (secondary). 962 x 3.78541 = 3,641 L. At 0.72 kg/L (the Zero's rule) = 2,621 kg (DERIVED) |
| Internal fuel, high figure | 4,900 L (G4M2: 6,490 L) | L | JA-WP 各型, G4M2 paragraph: "fuel tank increase 4,900 L to 6,490 L" | 各型 | https://ja.wikipedia.org/wiki/一式陸上攻撃機 | 2026-09-29 | SOURCED (secondary). 4,900 / 3.78541 = 1,294 US gal; x 0.72 = 3,528 kg (DERIVED). CONFLICTS with 3,640 L |
| G4M2 fuel, for scale | 1,715 US gal (1,428 imp gal) | gal | TAIC-1 Betty 22 page, Fuel box | PDF p.169 [502B-2] | https://archive.org/details/japanese-aircraft-performance-characteristics-taic-manual | 2026-09-29 | SOURCED (primary, wrong variant). 1,715 x 3.78541 = 6,492 L matches JA-WP's 6,490 |
| Crew | 7 | persons | EN-WP; JA-WP | | (same) | 2026-09-29 | SOURCED |
| Oil, ammunition | not found | | | | | | GAP. Tail 20 mm drum: 45 rounds, 16.5 kg (Pacific Wrecks) |

Risk: Dwyer (aviation-history.com) attaches "20,944 lb (9,500 kg)" to the **G6M1** escort fighter's takeoff weight, so
EN-WP's 9,500 kg "gross" may be a G6M1 number carried over. It is not tied to any performance figure.

## 3. Engine and propeller

Model 11 was built with the Kasei 11 (MK4A), and from the 241st airframe (Mar 1942, standard from the 406th, Aug 1942)
with the Kasei 15 (MK4E) (EN-WP, Variants). Both TAIC-1 pages list "BETTY 11" under "Installed in".

TAIC-1 Kasei 11 (Ha 32 Model 11, MK4A), PDF p.222 [861], dated December 1944, column 2, read from the page image.
Two-speed supercharger, ratios 7.4 and 9.118; 14 cylinders, bore/stroke 150/170 mm, 2,570 cu in; reduction ratio 0.684;
diameter 52.7 in; dry weight 725 kg / 1,595 lb; 92 octane. hp/rpm/manifold pressure/altitude as printed:

| Rating | hp / rpm / manifold / alt | Two engines (summed) | Altitude, m | Label |
| --- | --- | --- | --- | --- |
| Take-off | 1,505 / 2,450 / 39.8 in / SL | 3,010 hp = 2,244,557 W (x 745.7) | 0 | SOURCED (primary) |
| WEP | 1,505 / 2,450 / 39.8 in / SL | same | 0 | SOURCED |
| WEP | 1,580 / 2,450 / 39.8 in / 6,400 ft | 3,160 hp = 2,356,412 W | 1,951 (6,400 x 0.3048) | SOURCED |
| WEP | 1,470 / 2,450 / 39.8 in / 12,800 ft | 2,940 hp = 2,192,358 W | 3,901 | SOURCED |
| Military | 1,340 / 2,350 / 37.0 in / SL | 2,680 hp = 1,998,476 W | 0 | SOURCED |
| Military | 1,460 / 2,350 / 37.0 in / 7,200 ft | 2,920 hp = 2,177,444 W | 2,195 | SOURCED |
| Military | 1,360 / 2,350 / 37.0 in / 13,500 ft | 2,720 hp = 2,028,304 W | 4,115 | SOURCED |

TAIC-1 Kasei 15 (Ha 32 Model 15, MK4(C?)), PDF p.223 [862], Dec 1944 (same table style; the printed "(C?)" marks an
uncertain designation):

| Rating | hp / rpm / manifold / alt | Two engines | Altitude, m | Label |
| --- | --- | --- | --- | --- |
| Take-off / WEP | 1,440 / 2,450 / 39.8 in / SL | 2,880 hp = 2,147,616 W | 0 | SOURCED (primary) |
| WEP | 1,530 / 2,450 / 39.8 in / 7,800 ft | 3,060 hp = 2,281,842 W | 2,377 | SOURCED |
| WEP | 1,405 / 2,450 / 39.8 in / 19,000 ft | 2,810 hp = 2,095,317 W | 5,791 | SOURCED (odd next to the Kasei 11's 12,800 ft; printed as read) |
| Military | 1,290 / 2,350 / 37.0 in / SL | 2,580 hp = 1,923,906 W | 0 | SOURCED |
| Military | 1,400 / 2,350 / 37.0 in / 8,550 ft | 2,800 hp = 2,087,960 W | 2,606 | SOURCED |
| Military | 1,280 / 2,350 / 37.0 in / 19,700 ft | 2,560 hp = 1,908,992 W | 6,005 | SOURCED |

| Item | Value | Source | URL | Read | Label |
| --- | --- | --- | --- | --- | --- |
| "1,530 hp each for take-off", 1,410 hp at 2,000 m, 1,340 hp at 4,000 m | 1,140 kW / 1,050 kW / 1,000 kW | EN-WP Specifications | https://en.wikipedia.org/wiki/Mitsubishi_G4M | 2026-09-29 | SOURCED (secondary). CONFLICTS with TAIC-1: 1,530 is the Kasei 15's WEP-at-altitude figure, not a take-off rating. Prefer TAIC-1 |
| Kasei 15 take-off "1,460 hp" | JA-WP 諸元 | https://ja.wikipedia.org/wiki/一式陸上攻撃機 | 2026-09-29 | SOURCED (secondary); TAIC-1 says 1,440 |
| Propeller | 3 blades, Hamilton Standard licensed Sumitomo, constant speed | EN-WP Specifications | (same) | 2026-09-29 | SOURCED (secondary) |
| Propeller reduction | 0.684 (prop rpm at 2,450 = 1,676) | TAIC-1 p.222 | archive.org link above | 2026-09-29 | SOURCED / DERIVED (2,450 x 0.684) |
| Propeller diameter | not found | | | | GAP. Script uses 3.4 m ESTIMATE. (The G4M2's 4-blade prop is 11.16 ft = 3.40 m, TAIC-1 p.169; not this variant) |
| Supercharger | two-speed, ratios 7.4 and 9.118 (Kasei 11 and 15: 7.0 and 9.118) | TAIC-1 p.222-223 | archive.org link above | 2026-09-29 | SOURCED |
| Kasei 11 vs 15 | Kasei 15 has bigger supercharger for altitude; outside-cowl carburetor intake in later airframes | EN-WP; JA-WP 機体設計 | | 2026-09-29 | SOURCED (secondary) |

## 4. Performance tables

**No G4M1 test-weight-tagged table exists in anything found.** The rows below are printed figures with the gap named.

| Item | Value | Unit as printed | Source | Page | URL | Read | Label |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Max speed | 428 (266 mph, 231 kn) at 4,200 m (13,800 ft) | km/h | EN-WP | Specifications | https://en.wikipedia.org/wiki/Mitsubishi_G4M | 2026-09-29 | SOURCED (secondary; weight, power rating and Kasei 11 vs 15 not stated). 428 / 1.609344 = 265.9 mph |
| Max speed (same) | 266 mph at 13,780 ft; 428 km/h at 4,200 m | mph | PWE; Pacific Wrecks tech page | Specifications | http://pwencycl.kgbudge.com/G/4/G4M_Betty.htm | 2026-09-29 | SOURCED (secondary; same origin as EN-WP) |
| Max speed, Kasei 15 Model 11 | 453.7 at 4,200 m with underwing rubber; 463.0 without | km/h | JA-WP 諸元 and footnote | 諸元 | https://ja.wikipedia.org/wiki/一式陸上攻撃機 | 2026-09-29 | SOURCED (secondary). 453.7 km/h = 281.9 mph = 245 kt. CONFLICTS with 428 (different engine and intake) |
| Cruise | 315 (196 mph) at 3,000 m (9,800 ft) | km/h | EN-WP; PWE 196 mph at 9,845 ft | Specifications | (same) | 2026-09-29 | SOURCED (secondary) |
| Rate of climb | 9.17 (1,805 ft/min); altitude not stated | m/s | EN-WP | Specifications | (same) | 2026-09-29 | SOURCED (secondary). 9.17 x 196.85 = 1,805 |
| Rate of climb (conflict) | 21 ft/s = 6.4 m/s (1,260 ft/min); altitude not stated | ft/s | PWE | Specifications | http://pwencycl.kgbudge.com/G/4/G4M_Betty.htm | 2026-09-29 | SOURCED (secondary), CONFLICTS by 43% |
| Service ceiling | 30,000 ft (9,100 m) | ft | PWE | Specifications | (same) | 2026-09-29 | SOURCED (secondary) |
| Service ceiling (Kasei 15) | 9,660 m (31,693 ft) with rubber; footnote 7 gives 9,900 m for the Model 11 and 10,540 m for the provisional Model 13 | m | JA-WP 諸元, footnote 7 | 諸元 | https://ja.wikipedia.org/wiki/一式陸上攻撃機 | 2026-09-29 | SOURCED (secondary; the footnote's pairing is ambiguous) |
| Service ceiling (prototype) | almost 28,000 ft (8,534 m) | ft | Dwyer, aviation-history.com | text | http://www.aviation-history.com/mitsubishi/g4m.html | 2026-09-29 | SOURCED (secondary, 12-Shi prototype) |
| Stall speed | 120 (75 mph, 65 kn); no weight, flap state or IAS/TAS stated | km/h | EN-WP infobox (no citation shown) | Specifications | https://en.wikipedia.org/wiki/Mitsubishi_G4M | 2026-09-29 | SOURCED (weak). See sanity check below |
| Stall, clean, sanity check | 134 km/h (37.3 m/s) at 9,500 kg | | 2 x 9,500 x 9.81 / (1.225 x 78.125 x 1.4) = 186,390 / 133.98 = 1,391; sqrt = 37.3 m/s | n/a | n/a | 2026-09-29 | DERIVED, assumes CLmax 1.4 (the repo's shared clMax); not a source |
| Stall, implied CLmax at 120 km/h | 1.75 | | 186,390 / (1.225 x 33.33^2 x 78.125) = 186,390 / 106,335 | n/a | n/a | 2026-09-29 | DERIVED: 120 km/h implies flaps down |
| Range | 2,852 km (1,772 mi); ferry 5,040 km | km | EN-WP | Specifications | (same) | 2026-09-29 | SOURCED (secondary) |
| Range (JA-WP) | 2,176 km bomber / 5,882 km recon | km | JA-WP 諸元 | 諸元 | (same) | 2026-09-29 | SOURCED (secondary) |
| Takeoff run, lift-off speed | not found for G4M1 | | | | | | GAP |
| Dive limit (Vne) | not found | | | | | | GAP |
| Design g limit | not found | | | | | | GAP |
| Roll rate | not found | | | | | | GAP; JA-WP only says the type "has agile handling for a large twin" |

Betty 22 (G4M2), TAIC-1 PDF p.169 [502B-2], dated May 1945, printed values. **Different airplane** (laminar LB wing, 4-blade
11.16 ft props, Kasei 21, empty 17,420 lb). Use only as a scale check, never as the Model 11 reference:

| Item | Value as printed | Note |
| --- | --- | --- |
| Weights | Empty 17,420 lb; Gross 27,570 lb; Overload 33,090 lb (1 x 1000 kg bomb, 2,200 lb load) | 17,420 lb = 7,902 kg (x 0.45359); JA-WP says 8,050 kg for the G4M2 |
| Speed at 27,570 lb | Max 257 mph (221 kn) at S.L.; Max 283 mph (244 kn) at 13,800 ft; combat cruise 228 mph at 1,500 ft | 283 mph = 455.5 km/h; JA-WP: G4M2 437.1 km/h at 4,600 m |
| Climb at 27,570 lb | 1,770 ft/min at S.L.; 1,370 ft/min at 13,800 ft; 7.2 min to 10,000 ft; 17.4 min to 20,000 ft; service ceiling 30,400 ft | 1,770 ft/min = 8.99 m/s (x 0.00508) |
| Runway requirement | 3,420 ft at 34,380 lb (obstacle rows blank) | 3,420 x 0.3048 = 1,042 m |
| Engine (page's own box) | take-off 1,820 hp S.L.; normal 1,240 hp at 1,500 ft; military 1,655 hp at 6,800 ft; 1,415 hp at 15,200 ft; war emergency 1,880 hp at 4,400 ft, 1,620 hp at 13,800 ft | Kasei 21 |
| Span, length, height, area | 82 ft, 64.5 ft, 15 ft 7 in, 840 sq ft | wing area matches the G4M1's 840.93 sq ft |

TAIC-1 lists a "BETTY 11" airframe page (index entry 501A) but **that page is not in the archive.org scan**: the scan holds
only the Betty 22 page (PDF pp.169-171) and the Nell and Liz pages either side. The index and the Kasei pages name Betty 11.
A National Archives copy of page 501A, or the original Navy Betty 11 datasheet, would close the gap.

## 5. Gear and flaps

| Item | Value | Source | URL | Read | Label |
| --- | --- | --- | --- | --- | --- |
| Layout | retractable conventional (taildragger); main gear only in the repo's rig | EN-WP category "Aircraft with retractable conventional landing gear"; JA-WP | https://en.wikipedia.org/wiki/Mitsubishi_G4M | 2026-09-29 | SOURCED (secondary) |
| Main gear stowage | retracts fully into the engine nacelles (the G3M's wheels stayed half exposed) | JA-WP 機体設計 (cites Sekai no Kessakuki No. 60) | https://ja.wikipedia.org/wiki/一式陸上攻撃機 | 2026-09-29 | SOURCED (secondary). Direction (aft) is not stated; the script's "aft" is ESTIMATE |
| Gear and flap actuation | electric, not hydraulic (to avoid oil leaks) | JA-WP 機体設計 (cites Takahashi et al. 1985 pp.126-127) | (same) | 2026-09-29 | SOURCED (secondary) |
| Ground attitude | shallow three-point angle chosen for torpedo/bomb loading | JA-WP 機体設計 | (same) | 2026-09-29 | SOURCED (secondary) |
| Flap type | slotted flap on a triangular arm hinged below the wing (JA-WP footnote 10). The Blender script draws a split flap | JA-WP 注釈 10 | (same) | 2026-09-29 | SOURCED (secondary) |
| Retract time | not found | | | | GAP (use ESTIMATE; the Zero's 10 s is sourced to another type) |
| Flap travel time, clIncrement source | not found | | | | GAP; clIncrement can only be DERIVED from two stalls, and only one stall was found |
| Tailwheel | Blender script says "the real one retracted", not sourced anywhere read; steerability not found | script header | tools/models/blender/g4m-betty.py | 2026-09-29 | GAP; the model has no tailwheel node |
| Wheel size, leg length, track | not found. Script: 1.1 m wheel, 0.35 m wide, leg 2.1 m, ESTIMATE. Model gear pivot at x 1.569, y -0.397, z +/-4.480 (tools/models/entries/g4m-betty.json) | | | 2026-09-29 | ESTIMATE |

## 6. Carrier suitability and AI limits

| Item | Value | Source | Label |
| --- | --- | --- | --- |
| Carrier capable | No. Navy land-based attack plane ("rikujo kogeki ki", 陸上攻撃機). The type has no tailhook or fold data | EN-WP ("land-based medium bomber"); TAIC-1 index "Navy Bombers" | SOURCED, so `carrierCapable: false` |
| Single-engine flight | possible for a skilled pilot, with loads jettisoned (guns, ammo, radios, fuel, bombs via explosive-cut straps) | JA-WP 機体設計 (cites Takahashi 1985) | SOURCED (secondary); engine-out is not modeled (D6) |
| Maneuver limits for `excludedManeuvers` | none stated in any source read | | GAP, so recommend excluding nothing (Part A D13); AI bomber flying is deferred anyway |
| Vulnerability | no armor, unprotected wing tanks; rubber ply under tanks from the 663rd airframe (30 mm), which cut speed 9 km/h and range 315 km | EN-WP Variants | SOURCED (secondary) |

## 7. Armament and payload (kind line: no combat block, no turrets)

Recorded for the Library card and `source` text only.

| Item | Value | Source | URL | Read | Label |
| --- | --- | --- | --- | --- | --- |
| Guns, G4M1 | 4 x 7.7 mm Type 92 (nose 1, dorsal 1, waist 2) and 1 x 20 mm Type 99 Mk.1 (tail) | EN-WP Armament; PWE | https://en.wikipedia.org/wiki/Mitsubishi_G4M | 2026-09-29 | SOURCED (secondary). Not modeled (D11: no turrets) |
| 20 mm drum | 45 rounds, 16.5 kg; alternate 30-round drum | Pacific Wrecks | https://pacificwrecks.com/aircraft/g4m/tech.html | 2026-09-29 | SOURCED (secondary) |
| Standard load | 1 x 800 kg (1,764 lb) bomb, or 1 x aerial torpedo (EN-WP: 858 kg Type 91 Kai-3; PWE and Pacific Wrecks: 800 kg), or 4 x 250 kg (551 lb), or 12 x 60 kg (JA-WP), or 1 x 500 kg | EN-WP; JA-WP 爆装; PWE | (same) | 2026-09-29 | SOURCED (secondary); torpedo mass conflicts 800 vs 858 kg |
| Bay load, Betty 22 | 1 x 1,000 kg bomb printed as "Normal"; bay "would permit two 1,760 lb torpedoes although specifications call for one only" | TAIC-1 p.169 | archive.org link above | 2026-09-29 | SOURCED (primary, G4M2) |
| Ohka | 1 x 1,200 kg MXY-7 (later models) | EN-WP | (same) | 2026-09-29 | SOURCED (out of scope) |
| Store figures (drag area, filler, damage) for a 250 kg or 800 kg Japanese bomb | not found | | | | GAP. D7/D8: a new store needs its own sourced figures; the existing `an-m65` is a 500 lb US bomb and does not match |

## 8. Variant differences and the 3D model

- The repo model is **not a Sketchfab download any more**. `tools/models/entries/g4m-betty.json` and the header of
  `tools/models/blender/g4m-betty.py` state it was replaced on 2026-09-29 by an original Blender model of the
  **G4M1 Model 11**: 3-blade props, two Kasei 11, span 24.89 m, length 19.97 m, wing area 78.125 m2. `tests/tools/models/aircraftDimensions.test.ts`
  line 26 cites the same EN-WP figures (span 24.89, length 19.97, tolerance 1%). So the model and this dossier target the same variant.
- The script's own ESTIMATE list (no source found for any of these): prop diameter 3.4 m, dihedral 5 deg, taper 0.40, thickness
  18%/9%, wheel size, gear stowing aft, retracting tailwheel, split flaps.
- Model nodes kept (entries file): `Prop1`, `Prop2` (pivot x 3.364, y 0.037, z -/+4.480, axis +x), `GearL`, `GearR`
  (pivot x 1.569, y -0.397, z -/+4.480, axis +z), `Turret1` (pivot x -0.789, y 1.223, axis +y). No `Tailwheel` node.
- Variant traps for sourcing: Model 11 early (Kasei 11) vs Model 11 from the 241st/406th airframe (Kasei 15, often called
  "Model 12"/"provisional Model 13"); the 663rd airframe onward carries underwing rubber, -9 km/h; Model 22 (G4M2) has a
  different wing and 4 blades, and its TAIC page must not be used for the G4M1.

## Recommended reference block

**Test mass: 9,500 kg (20,944 lb)** = EN-WP "gross". Label it ESTIMATE-for-pairing: it is a secondary figure with a possible G6M1 origin,
and no source ties it to the speed. A fully loaded torpedo sortie would sit near
6,741 + 858 (torpedo) + 2,621 (962 gal fuel) + about 600 (7 crew, oil, ammo, ESTIMATE) = 10,820 kg (DERIVED sum), but no performance
figure is given for it. Use 9,500 kg unless Mark prefers 10,820.

| Field | Value | Label |
| --- | --- | --- |
| `topSpeedAltitudeM` | 4,200 | SOURCED (EN-WP, PWE) |
| `topSpeedMps` | 428 km/h / 3.6 = **118.9 m/s** | SOURCED (secondary), weight unknown |
| `topSpeedByAltitudeM` | only one point: [4200, 118.9]. Sea-level and other altitudes have no G4M1 source | GAP; the G4M2 TAIC page (SL 257 mph, 13,800 ft 283 mph, ratio 0.908) is not this airplane |
| `climbRateMps` / by altitude | 9.17 m/s (EN-WP; altitude unstated, assume sea level) vs 6.4 m/s (PWE) | SOURCED, in conflict; recommend 9.17 and flag it |
| `stallSpeedMps` (clean) | none sourced. EN-WP's 120 km/h = 33.3 m/s is best read as the flaps-down figure | GAP; a derived 37.3 m/s (CLmax 1.4) is available, ESTIMATE |
| `stallSpeedFlapMps` | 120 km/h / 3.6 = **33.3 m/s** | SOURCED (weak: unspecified weight and configuration) |
| `takeoffDistanceM` | none for G4M1 | GAP; leave absent and use a direction card, as the Zero does |
| `rollRateDegPerSec` | none | ESTIMATE |
| `limits.diveSpeedMps`, `gLimit` | none | ESTIMATE |
| `mass.emptyKg` | 6,741 | SOURCED (secondary) |
| `mass.maxTakeoffKg` | 12,860 (EN-WP) or 12,895 (JA-WP, Kasei 15) | SOURCED, in conflict |
| `mass.fuelCapacityKg` | 2,621 (962 gal) or 3,528 (4,900 L) at 0.72 kg/L | DERIVED, sources in conflict |
| `geometry` | span 24.89 m, wing area 78.125 m2 | SOURCED (secondary) |
| `engine.maxPowerW` (summed) | Kasei 11 Military at SL 2 x 1,340 hp = 1,998,476 W; take-off 2 x 1,505 hp = 2,244,557 W | SOURCED (TAIC-1, primary) |
| `powerFractionByAltitudeM` (Kasei 11 Military, summed, vs 2,680 hp at SL) | [0, 1.000], [2195, 1.090 (2,920 hp)], [4115, 1.015 (2,720 hp)]; nothing above 13,500 ft | DERIVED from three printed points. The model has no ram-air term, so fit the curve, do not copy it |
| Kasei 15 alternative (Military) | [0, 1.000 (2,580 hp)], [2606, 1.085 (2,800)], [6005, 0.992 (2,560)] | DERIVED. A Kasei 15 build peaks higher and holds power to 6,000 m |
| `gear.travelSeconds`, `flap.travelSeconds` | none | ESTIMATE |
| `gear.*` layout (heightM, mainX, thirdX, steering) | none sourced; measure from the drawn model | ESTIMATE / MEASURED (Part F) |
| `flap.clIncrement` | needs a clean and a flaps-down stall; only one found | ESTIMATE |
| `carrierCapable` | false | SOURCED |
| `combat` | omitted by the kind line | n/a |
| `rates`, `aero`, `cd0`, `propEfficiency`, `staticThrustN`, `windmillCd0` | fitted or borrowed | FITTED / ESTIMATE |

Fields with **no source at all**, which must be ESTIMATE: clean stall, takeoff distance and lift-off speed, roll rate, all rates.*
values, dive speed, g limit, gear and flap travel times, flap CL increment and drag area, gear drag area, tailwheel steering, prop diameter, sea-level and
multi-altitude speed points, multi-altitude climb points, oil and ammunition weights.

## Gaps and risks

1. **No G4M1 flight-test report** (no wwiiaircraftperformance.org Betty page exists: its Japan index lists no G4M file; the TAIC
   Betty 11 sheet is missing from the archive.org scan). Speed, climb and ceiling are compilation figures with no test weight.
2. **Betty 22 data is a trap.** The only primary performance table is for the G4M2 at 27,570 lb. Do not fit the G4M1 to it.
3. **Speed conflicts:** 428 km/h at 4,200 m (EN-WP, Kasei 11 era) against 453.7 km/h (JA-WP, Kasei 15 with rubber) and 463.0 km/h
   (Kasei 15 without rubber). Which engine the 428 figure belongs to is not stated. Recommend one of: (a) Kasei 11 with 428, matching
   the model's stated engine, or (b) ask Mark to choose the Kasei 15 build.
4. **Climb conflict:** 9.17 m/s vs 6.4 m/s; neither states altitude or weight.
5. **Stall speed** rests on one uncited infobox figure. The clean and flaps-down values cannot both be sourced.
6. **Fuel conflict:** 962 US gal (3,640 L) vs 4,900 L (1,294 gal). The 3,640 L figure is the G6M1's fuel per Dwyer, so 4,900 L is the
   more likely G4M1 number, but that inference is unproven.
7. **Weight conflict:** 9,500 kg "gross" may be the G6M1 weight; overload 12,860 vs 12,895 kg.
8. **Engine rating trap:** EN-WP's "1,530 hp for take-off" is not the Kasei 11's take-off rating (1,505 hp, TAIC-1). Do not use it as `maxPowerW`.
9. TAIC-1 was read from the archive.org OCR and the page images of pp.222-223 and 169. A few OCR digits on the engine page were garbled
   in text form and were re-read from the images; the Kasei 15 "19,000 ft" WEP point looks odd next to the Kasei 11's 12,800 ft but is what the page prints.
10. The model's dorsal turret exists but the kind line drops turrets; the sim will draw a static or rotating turret with no gun.
11. Dihedral, taper, tail geometry, wheel geometry, tailwheel retraction and flap type in the Blender script are ESTIMATE or contradict
    JA-WP (slotted flap, not split). The model's flap drawing and the source disagree; that is a finding, not something to tune.
12. A new Japanese bomb store (250 kg or 800 kg) needs mass, drag, filler and damage figures: none found.

## Sources read

- https://en.wikipedia.org/wiki/Mitsubishi_G4M (read 2026-09-29; Specifications G4M1 Model 11; cites Francillon 1979, Tagaya 2001, Airreview)
- https://ja.wikipedia.org/wiki/一式陸上攻撃機 (read 2026-09-29; 諸元 table and footnotes; cites Sekai no Kessakuki No. 60, Takahashi et al. 1985, Sato 2019)
- https://archive.org/details/japanese-aircraft-performance-characteristics-taic-manual (TAIC Manual No. 1, Dec 1944; PDF https://archive.org/download/japanese-aircraft-performance-characteristics-taic-manual/p4013coll8_4531.pdf, pp.169, 222, 223; Betty index pp.11-13; read 2026-09-29) PRIMARY
- http://pwencycl.kgbudge.com/G/4/G4M_Betty.htm (Pacific War Online Encyclopedia, read 2026-09-29)
- https://pacificwrecks.com/aircraft/g4m/tech.html (read 2026-09-29)
- http://www.aviation-history.com/mitsubishi/g4m.html (Larry Dwyer, read 2026-09-29)
- https://en.wikipedia.org/wiki/Mitsubishi_Kasei (read 2026-09-29; not used for figures)
- https://www.wwiiaircraftperformance.org/ (homepage Japan file list, read 2026-09-29: no Betty file; Zero, Ki-43, Ki-84 and others only)
- https://j-aircraft.com/captured/capturedfrom/TAIC/TAICSG4M/mitsubishi_g4m2_betty.htm (photos only, no data)
- Repo: docs/aircraft.md, content/aircraft/a6m2-zero.json, f6f-hellcat.json, `git show worktree-b17-onboard:docs/handoff/2026-09-29-b-17.md`,
  tools/models/entries/g4m-betty.json, tools/models/blender/g4m-betty.py, tests/tools/models/aircraftDimensions.test.ts
- Not reachable: si.edu G4M3 page (HTTP 403). Not fetched: ww2aircraft.net thread on TAIC summary reports (a Betty TAIC summary PDF is mentioned there; a lead worth chasing).
