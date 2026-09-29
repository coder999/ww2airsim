# Sourcing dossier: Lockheed P-38L Lightning (`p-38-lightning`)

Prepared 2026-09-29 (all "read" dates are 2026-09-29). Research only; no repo code changed.
Format follows `docs/aircraft.md` Part B: every figure carries a source and one of SOURCED / DERIVED / ESTIMATE.

**Headline:** the performance tables are **primary but split across variants**. Full altitude tables
(speed, climb, stall) exist only for a **P-38J** (Wright Field memo Eng-47-1706-A, 16,597 lb). For a
**P-38L** (memo 44-25092, 11 Dec 1945) only six level-speed text points survive, plus a rate-of-climb
chart that is at **normal rated power, not war emergency**. The 1944 Pilot's Flight Operating
Instructions (AN 01-75-1, covers P-38H/J/L-1/L-5) is the primary source for engine ratings, stall
speeds by weight, and gear/flap limits. Geometry and mass are primary for span/length/height/tread
(manual, J report) and secondary (NASA SP-468 Table III, English Wikipedia) for empty/gross mass.
No source was found for take-off distance, roll rate, gear retract time, or propeller diameter.

Abbreviations:
- **POH** = "Pilot's Flight Operating Instructions, Army Models P-38H Series, P-38J Series, P-38L-1, L-5 and F-5B" (AN 01-75-1, 1944). Page = PDF page of a 57-page scan (OCR text present).
- **J-1706** = Flight Test Engineering Branch Memo Report Eng-47-1706-A, "Flight Tests of a P-38J Airplane" (AAF 42-67869), Wright Field, 4 Feb 1944.
- **J-1771** = Memo Report Eng-47-1771-A, P-38J-15 43-28392 using 44-1 fuel, 5 Jul 1944.
- **L-25092** = Memorandum Report on P-38L 44-25092, Wright Field/Miami Depot, 11 Dec 1945 (parts of the original are missing on the host page).
- **NASA** = NASA SP-468 "Quest for Performance", Appendix A Table III (Wayback capture of hq.nasa.gov/pao/History/SP-468/app-a2.htm).
- **EN-WP** = English Wikipedia "Lockheed P-38 Lightning" (raw wikitext, Specifications P-38L block).
- The wwiiaircraftperformance.org pages return 404 live; they were read through Wayback captures. The PDFs and chart images are scans; tables were read visually or from OCR text. Chart-read values are marked "graph read" and are about 5 percent, not exact.
- mph to m/s uses 0.44704; ft to m uses 0.3048; lb to kg uses 0.45359237; US gal to L uses 3.785412; hp to kW uses 0.7457.

## 1. Geometry

| Item | Value | Unit | Source | Page | URL | Read | Label |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Span | 52 ft 0 in = 624 in x 0.0254 = 15.850 m | m | POH Sec. I para 1, overall dimensions; J-1706 Sec. X | POH pdf 2 | see Sources read (1, 2) | 2026-09-29 | SOURCED (primary). Matches `aircraftDimensions.test.ts` 15.85 m |
| Length | 37 ft 10 in = 454 in x 0.0254 = 11.532 m | m | POH (same); J-1706 Sec. X | POH pdf 2 | (same) | 2026-09-29 | SOURCED (primary). Matches test 11.53 m |
| Height (top of prop radius) | 12 ft 10 in = 154 in x 0.0254 = 3.912 m | m | POH; J-1706 Sec. X | POH pdf 2 | (same) | 2026-09-29 | SOURCED (primary) |
| Tread (main gear track) | 16 ft 6 in = 198 in x 0.0254 = 5.029 m | m | J-1706 Sec. X "P-38J Dimensions" | last page of memo | (1) | 2026-09-29 | SOURCED (primary, J; L gear is unchanged as far as any source says, not verified). Repo model has this as ESTIMATE, so this can replace it |
| Wing area | 328 sq ft x 0.092903 = 30.47 m2 | m2 | J-1706 Sec. X | last page | (1) | 2026-09-29 | SOURCED (primary) |
| Wing area (alt.) | 327.5 sq ft x 0.092903 = 30.43 m2 | m2 | NASA Table III; EN-WP | Table III | (3) | 2026-09-29 | SOURCED (secondary), 0.5 sq ft below J-1706 |
| Aspect ratio | 8.26 printed; 52^2 / 327.5 = 8.256 | none | NASA Table III; check by arithmetic | Table III | (3) | 2026-09-29 | SOURCED, DERIVED check agrees |
| Mean chord | 30.43 / 15.85 = 1.92 m | m | 327.5 sq ft in m2 divided by span | n/a | n/a | 2026-09-29 | DERIVED (geometric mean chord; no root or tip chord found) |
| Root / tip airfoil | NACA 23016 root, NACA 4412 tip | none | EN-WP (cites Lednicer "Incomplete Guide to Airfoil Usage") | Specifications | (4) | 2026-09-29 | SOURCED (secondary) |
| Wing taper, dihedral | none found | | | | | | ESTIMATE (repo values 0.40 and 5.5 degrees are ESTIMATE; no source read confirms either) |
| Propeller diameter | none found | | | | | | ESTIMATE (repo 3.51 m; POH and reports read do not print it) |
| Propeller | Curtiss Electric, 3 blades, full feathering, counter-rotating (props turn opposite ways, outboard-up) | none | J-1706 Sec. III B (blade design 89303-18 left, 88996-18 right); POH Sec. II | J-1706; POH pdf 8 | (1, 2) | 2026-09-29 | SOURCED (primary) |
| Main tanks / reserve / outer wing / oil | 93 U.S. gal main (per side), 60 reserve, 55 outer wing, 13 oil | gal | POH fuel system legend | POH pdf 16 | (2) | 2026-09-29 | SOURCED (primary). 93 gal = 352 L; 60 = 227 L; 55 = 208 L; 13 = 49 L. Whether totals are per airplane or per boom is not stated in the legend text |
| Droppable tank | 165 U.S. gal, or 300 U.S. gal | gal | POH legend | POH pdf 16 | (2) | 2026-09-29 | SOURCED (primary). 165 gal = 624.6 L; 300 gal = 1,135.6 L |

## 2. Mass

| Item | Value | Unit | Source | Page | URL | Read | Label |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Empty weight | 12,800 lb x 0.45359237 = 5,806 kg | kg | NASA Table III (P-38L, V-1710-111); EN-WP cites NASA | Table III | (3) | 2026-09-29 | SOURCED (secondary) |
| Gross weight | 17,500 lb x 0.45359237 = 7,938 kg | kg | NASA Table III; EN-WP | Table III | (3) | 2026-09-29 | SOURCED (secondary) |
| Max takeoff weight | 21,600 lb x 0.45359237 = 9,798 kg | kg | EN-WP Specifications (no page cited in the infobox) | Specifications | (4) | 2026-09-29 | SOURCED (secondary, weak: uncited) |
| Wing loading | 53.4 lb/sq ft printed; 17,500 / 327.5 = 53.4 | lb/sq ft | NASA Table III; check by arithmetic | Table III | (3) | 2026-09-29 | SOURCED and DERIVED check agrees (260.7 kg/m2) |
| Trial weight, L | 18,055 lb x 0.45359237 = 8,190 kg (take-off gross, climb charts) | kg | L-25092, Figs. 11 and 12 legends "T.O. Gr. Wt. 18,055 lbs", read from enlarged crops | chart images | (5) | 2026-09-29 | SOURCED (primary). Legend is a poor scan; the "18,055" read is clear on the time-to-climb crop and consistent on the rate-of-climb crop ("18055"). Earlier reading of 16,055 was wrong |
| Trial weight, J | 16,597 lb x 0.45359237 = 7,528 kg (take-off; "average P-38 combat weight") | kg | J-1706 Sec. II and III A | memo p. 1-2 | (1) | 2026-09-29 | SOURCED (primary). Includes 300 gal fuel, 26 gal oil, 457 lb ammunition ballast, 100 lb nose ballast, 200 lb pilot |
| Trial weight, J-15 (44-1 fuel) | 17,363 lb x 0.45359237 = 7,876 kg | kg | J-1771 Sec. III a | memo p. 1 | (6) | 2026-09-29 | SOURCED (primary) |
| Ammunition ballast | 457.5 lb x 0.45359237 = 207.5 kg (1200 rd .50 plus 150 rd 20 mm; 1500 rd .50 in J-1771) | kg | J-1706 Sec. III C; J-1771 Sec. III a | memo p. 2 | (1, 6) | 2026-09-29 | SOURCED (primary) |
| Empty weight of the model's variant | J-1706 does not give an empty weight | | | | | | GAP: 12,800 lb is NASA's number for the L; no weight-and-balance sheet was read |

## 3. Engines

The repo decision D6 (2026-09-28) puts summed power in one engine block. Per-engine ratings are below; the sums are DERIVED.

| Item | Value | Unit | Source | Page | URL | Read | Label |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Engine model | Allison V-1710-111 (left) / -113 (right) on the L-1; L-5 gets -112/-113 in one EN-WP paragraph | none | EN-WP Specifications and Variants; POH title covers L-1 and L-5 | Specifications | (4, 2) | 2026-09-29 | SOURCED (secondary). The two EN-WP passages disagree on -111 versus -112; NASA also prints -111 |
| Take-off / military power | 1,425 hp at 54 in Hg, 3000 rpm, per engine. Sum 2 x 1,425 = 2,850 hp = 2,125 kW | hp | POH Sec. III engine flight chart, rows TAKE-OFF and MILITARY | POH pdf 39 | (2) | 2026-09-29 | SOURCED (primary); sum DERIVED. 54 in Hg = 183 kPa |
| War emergency power | 1,600 hp at 60 in Hg, 3000 rpm, 5 min limit, per engine. Sum 3,200 hp = 2,386 kW | hp | POH engine flight chart, row WAR EMERGENCY | POH pdf 39 | (2) | 2026-09-29 | SOURCED (primary); sum DERIVED. 60 in Hg = 203 kPa |
| Normal rated (max continuous) | 1,100 hp at 44 in Hg, 2600 rpm, per engine. Sum 2,200 hp = 1,641 kW | hp | POH engine flight chart, row NORMAL RATED | POH pdf 39 | (2) | 2026-09-29 | SOURCED (primary); sum DERIVED |
| Critical altitude of ratings | WEP 25,800 ft no ram (28,700 with ram); military 26,600 ft no ram (29,000 ram); normal rated 31,200 ft no ram (33,800 ram) | ft | POH engine chart (footnote marks are unclear in the scan) | POH pdf 39 | (2) | 2026-09-29 | SOURCED (primary). 25,800 ft = 7,864 m; 26,600 ft = 8,108 m; 31,200 ft = 9,510 m |
| Measured BHP on the L trial | 1,530 (WEP, sea level), 1,495 (WEP, 26,000 ft), 1,395 / 1,385 (military, SL / 26,200 ft), 1,110 / 1,138 (normal rated, SL / 32,200 ft), per engine | BHP | L-25092 level flight text, items a to f | web page | (5) | 2026-09-29 | SOURCED (primary). Trial power is below the 1,600 hp rating at SL |
| Measured BHP on the J trial (WEP) | 1,548 at SL, 1,558 at 5,000 ft, 1,567 at 10,000, 1,572 at 15,000, 1,564 at 20,000, 1,505 at 25,800 ft, 1,312 at 30,000, 1,136 at 35,000 | BHP | J-1706 Sec. VI B (engine power from Eng. Spec. 162 power curve) | memo p. 5 | (1) | 2026-09-29 | SOURCED (primary) |
| Turbosupercharger | one B-33 per engine, exhaust side on the boom tops; limiting turbo speed 26,400 rpm (J-1706), 26,300 (J-1771) | rpm | J-1706 Sec. III B, VI B; J-1771 | memo | (1, 6) | 2026-09-29 | SOURCED (primary) |
| Gear ratio | 2:1 (the P-38K used 2.36:1 and is not this variant) | none | EN-WP P-38K paragraph ("unlike the standard P-38 ratio of 2 to 1") | Variants | (4) | 2026-09-29 | SOURCED (secondary) |
| Propeller rpm | 3000 engine rpm; prop rpm = 3000 / 2 = 1,500 | rpm | POH 3000 rpm, EN-WP 2:1 | n/a | n/a | 2026-09-29 | DERIVED |
| Fuel flow | WEP 180 U.S. gal/hr, military 167 gal/hr, per engine at rating | gal/h | POH engine chart | POH pdf 39 | (2) | 2026-09-29 | SOURCED (primary). 180 gal = 681 L; 167 gal = 632 L |

## 4. Performance tables

Two datasets exist. Do not mix them without saying so.

### 4a. P-38J, WEP 60 in Hg / 3000 rpm, 16,597 lb (7,528 kg), clean, flaps up, gear up (J-1706, Sec. VI B and D, memo p. 5-6)

Speeds are true airspeed as printed. Read 2026-09-29. Label SOURCED (primary); m and m/s are DERIVED by the factors above.

| Altitude ft | Altitude m | True speed mph | True speed m/s | Climb ft/min | Climb m/s |
| --- | --- | --- | --- | --- | --- |
| 0 | 0 | 345.0 | 154.2 | 4,000 | 20.32 |
| 5,000 | 1,524 | 362.5 | 162.1 | 3,960 | 20.12 |
| 10,000 | 3,048 | 379.0 | 169.4 | 3,820 | 19.41 |
| 15,000 | 4,572 | 394.5 | 176.4 | 3,550 | 18.03 |
| 20,000 | 6,096 | 409.0 | 182.8 | 3,190 | 16.21 |
| 23,400 (climb critical) | 7,132 | n/a | n/a | 2,900 | 14.73 |
| 25,000 | 7,620 | n/a | n/a | 2,665 | 13.54 |
| 25,800 (level critical) | 7,864 | 421.5 | 188.4 | n/a | n/a |
| 30,000 | 9,144 | 413.5 | 184.9 | 1,830 | 9.30 |
| 35,000 | 10,668 | 400.0 | 178.8 | 985 | 5.00 |
| 40,000 | 12,192 | n/a | n/a | 100 | 0.51 |

- Service ceiling 40,000 ft (12,192 m) per the J-1706 summary. The climb table's last row (marked A/C, 20,500 ft, rate 0) is unexplained in the transcription and is not used. J-1771 (17,363 lb, 44-1 fuel) gives service 39,000 ft and absolute 39,700 ft.
- Time to climb: 6.49 min to 23,400 ft; 3.89 min to 15,000; 9.32 min to 30,000; 12.99 min to 35,000.
- Two engine failures occurred during the trial; the memo says the reported speeds are from the original engines and the replacement combinations were 5 to 7 mph slower (Sec. VI G). That is a 1.2 to 1.7 percent uncertainty on speed.
- J-1771 (J-15, 44-1 fuel, 17,363 lb): 419 mph at 19,800 ft at 70 in Hg; 402.5 mph at 60 in Hg at 19,800 ft; 413 mph at 24,000 ft at 60 in Hg; sea-level climb 4,040 ft/min at 70 in Hg and 3,570 ft/min at 60 in Hg. 70 in Hg was not approved on the L, so J-1771 is context only.

### 4b. P-38L 44-25092 (L-25092)

| Item | Value | Unit | Source | Page | URL | Read | Label |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Level speed, WEP, sea level | 342 mph at 1,530 BHP, 3000 rpm = 152.9 m/s | mph | L-25092 item a | web page | (5) | 2026-09-29 | SOURCED (primary) |
| Level speed, WEP, critical altitude | 416 mph at 26,000 ft (7,925 m) = 186.0 m/s | mph | L-25092 item b | web page | (5) | 2026-09-29 | SOURCED (primary) |
| Level speed, military, sea level | 331 mph = 148.0 m/s | mph | L-25092 item c | web page | (5) | 2026-09-29 | SOURCED (primary) |
| Level speed, military, critical | 408 mph at 26,200 ft (7,986 m) = 182.4 m/s | mph | L-25092 item d | web page | (5) | 2026-09-29 | SOURCED (primary) |
| Level speed, normal rated, sea level | 302 mph at 2600 rpm = 135.0 m/s | mph | L-25092 item e | web page | (5) | 2026-09-29 | SOURCED (primary) |
| Level speed, normal rated, critical | 400 mph at 32,200 ft (9,815 m) = 178.8 m/s | mph | L-25092 item f | web page | (5) | 2026-09-29 | SOURCED (primary) |
| Weight for the speed figures | "corrected to weight at altitude as given in Figure 4" | | L-25092 | web page | (5) | 2026-09-29 | GAP: Figure 4 not obtained; speeds are not tied to a single mass |
| Climb chart, sea level | about 2,050 ft/min = 10.4 m/s | ft/min | L-25092 Fig. 11, **normal rated power (2600 rpm, 44 in Hg)**, T.O. gross 18,055 lb | chart page 16 | (5) | 2026-09-29 | SOURCED (primary), graph read to about 5 percent |
| Climb chart, peak | about 2,150 ft/min = 10.9 m/s around 8,000 to 12,000 ft (data-point labels on the chart read 2,110, 2,125 and 2,100) | ft/min | Fig. 11 | chart page 16 | (5) | 2026-09-29 | SOURCED, graph read |
| Time to climb chart | about 13 min to 26,000 ft (the point marked N.R.P.) and about 37 min to 40,000 ft | min | L-25092 Fig. 12 | chart page 17 | (5) | 2026-09-29 | SOURCED, graph read, low precision |
| L war emergency climb | none | | | | | | GAP: no WEP or military climb figure for an L was found |
| L speed-versus-altitude chart | image would not load from Wayback | | L-25092 | | (5) | 2026-09-29 | GAP |

### 4c. Stall speeds (indicated, power off), POH table, para 15a, POH pdf 32

Read 2026-09-29. SOURCED (primary), applies to P-38H/J/L. m/s DERIVED.

| Configuration | 15,000 lb | 17,000 lb | 19,000 lb |
| --- | --- | --- | --- |
| Flaps and gear up | 94 mph (42.0 m/s) | 100 mph (44.7 m/s) | 105 mph (46.9 m/s) |
| Flaps and gear down | 69 mph (30.8 m/s) | 74 mph (33.1 m/s) | 78 mph (34.9 m/s) |

- Interpolated to the L trial weight 18,055 lb: up 100 + (1,055/2,000) x 5 = 102.6 mph = 45.9 m/s; down 74 + (1,055/2,000) x 4 = 76.1 mph = 34.0 m/s. DERIVED.
- Interpolated to the J trial weight 16,597 lb: up 94 + (1,597/2,000) x 6 = 98.8 mph = 44.2 m/s; down 69 + (1,597/2,000) x 5 = 73.0 mph = 32.6 m/s. DERIVED.
- J-1706 Sec. VI F (16,597 lb) measured: flaps and gear up, power off, 99.0 mph indicated = 44.3 m/s (agrees with the POH interpolation of 98.8). Gear down flaps up 95.0 mph; gear down flaps down 78.0 mph = 34.9 m/s, which is 5 mph above the POH interpolation of 73.0. The memo's column headers ("Indicated airspeed / corrected for instrument error", power off and power on 74, 73, 53) are ambiguous in the transcription; the power-on values are 74, 73 and 53 mph.
- Indicated versus calibrated: J-1706 Fig. 1 installation error at the stall is small (calibrated is 6.5 mph above indicated at 150 mph indicated; error grows to 14 mph at 360 mph indicated). The flight-fit stall fields say "indicated", so no correction is needed at stall speed. POH pdf 37 has the same table for the L.
- Stall "power off" is the fit convention; the memo has no power-off value with flaps at the maneuver setting.

### 4d. Other performance points

| Item | Value | Unit | Source | Page | URL | Read | Label |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Best single-engine climb speed | about 145 mph indicated; minimum control speed at rated power 110 mph indicated | mph | J-1706 Sec. IV | memo | (1) | 2026-09-29 | SOURCED (primary). 145 mph = 64.8 m/s; 110 mph = 49.2 m/s |
| Cruise (J) | 383.5 mph at 11,850 ft, 60.8 in Hg, 3000 rpm (1,612 BHP); 268.5 mph at 1,600 rpm | mph | J-1706 Sec. VI C | memo | (1) | 2026-09-29 | SOURCED (primary) |
| Range | none read | | | | | | GAP for the model (not needed for the flight fit). EN-WP has combat range 1,300 mi and ferry 3,300 mi, uncited |
| Rate of roll | qualitative only: "fair at medium speeds, slow at high speeds because of heavy aileron forces" (J); L has hydraulic aileron boost | | J-1706 Sec. II; POH Sec. I | memo; POH pdf 3 | (1, 2) | 2026-09-29 | GAP: no deg/s figure found |
| Take-off distance | none | | | | | | GAP. POH Appendix II take-off charts are figure pages that were not read as numbers |
| Landing approach | gear down, flaps at MANEUVER, 120 mph indicated; over the fence 110 mph; flare to about 80 mph | mph | POH Sec. II landing instructions | POH pdf 35 | (2) | 2026-09-29 | SOURCED (primary). 120 mph = 53.6 m/s; 110 = 49.2; 80 = 35.8 |
| EN-WP figures | max speed 414 mph at 25,000 ft on military power; climb 4,750 ft/min; ceiling 44,000 ft | | EN-WP Specifications | | (4) | 2026-09-29 | SOURCED (secondary, cites Crosby 2003). The 4,750 ft/min is not reproduced by any primary trial read and is not used |

## 5. Gear and flaps

| Item | Value | Unit | Source | Page | URL | Read | Label |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Gear type | tricycle, all three legs retract, hydraulic with emergency hand pump | none | POH Sec. I | POH pdf 4 to 6 | (2) | 2026-09-29 | SOURCED (primary) |
| Gear-extended limit | 175 mph indicated = 78.2 m/s | mph | POH Sec. II "Airspeed limitations" | POH pdf 24 | (2) | 2026-09-29 | SOURCED (primary) |
| Gear extension speed (procedure) | 160 mph indicated = 71.5 m/s | mph | POH Sec. II landing procedure | POH pdf 36 | (2) | 2026-09-29 | SOURCED (primary) |
| Flap type | Lockheed modified Fowler; positions UP, MANEUVER, DOWN | none | POH Sec. I | POH pdf 3 | (2) | 2026-09-29 | SOURCED (primary) |
| Flap limit, 100 percent | 150 mph indicated = 67.1 m/s | mph | POH airspeed limitations | POH pdf 24 | (2) | 2026-09-29 | SOURCED (primary) |
| Flap limit, 50 percent | 250 mph indicated = 111.8 m/s. The scan reads "250mph"; the two lines sit close together and 50 percent is the maneuver setting | mph | POH airspeed limitations | POH pdf 24 | (2) | 2026-09-29 | SOURCED (primary), OCR-legibility risk |
| Maneuver flap speed | extend flaps to MANEUVER at 140 mph indicated = 62.6 m/s | mph | POH landing procedure | POH pdf 36 | (2) | 2026-09-29 | SOURCED (primary) |
| Flap extension time | 15 to 20 s with both engines at 1,400 rpm; 25 s on one engine (ground hydraulic check) | s | POH Sec. II para 8a | POH pdf 29 | (2) | 2026-09-29 | SOURCED (primary). The text is about the flap check on the ground; it is the only timing found |
| Dive recovery flaps | L and late J; extend or retract within 2 s; dive limit is 15 to 20 mph over placard | s | POH Sec. I and II | POH pdf 3, 33 | (2) | 2026-09-29 | SOURCED (primary) |
| Gear retract or extend time | none | | | | | | GAP: ESTIMATE only |
| Dive placard | 360 mph indicated straight dive at 20,000 ft, 4.5 g pullout at 300 mph, buffeting and nose heaviness above | mph | POH para 18c | POH pdf 33 | (2) | 2026-09-29 | SOURCED (primary). 360 mph = 161 m/s |
| Landing light limit | 140 mph indicated | mph | POH | POH pdf 24 | (2) | 2026-09-29 | SOURCED (primary) |
| Drop tank limit | 250 mph indicated with 300 gal droppable tanks | mph | POH | POH pdf 24 | (2) | 2026-09-29 | SOURCED (primary). 250 mph = 111.8 m/s |

## 6. Carrier suitability and AI limits

| Item | Value | Unit | Source | Page | URL | Read | Label |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Carrier capability | none: no tailhook, no folding wings. Lockheed's carrier Model 822 (folding wings, arresting hook, stronger undercarriage) never went past paper; the Navy judged the airplane too big and disliked liquid cooling | | EN-WP "Model 822" paragraph | Variants | (4) | 2026-09-29 | SOURCED (secondary). POH searched for "hook" and "carrier": no arresting-gear equipment (one hit is unrelated text) |
| Cocooned on escort-carrier decks for transport | P-38s were shipped on CVE decks; not flown off | | EN-WP photo caption | History | (4) | 2026-09-29 | SOURCED (secondary) |
| Navy use | four land-based F-5B as FO-1 | | EN-WP | Variants | (4) | 2026-09-29 | SOURCED (secondary) |
| Approach speed for AI | 120 mph gear down flaps maneuver; over the fence 110 mph = 49.2 m/s | mph | POH pdf 35 | | (2) | 2026-09-29 | SOURCED. Model the P-38L as land-only (`carrierCapable: false`) |
| Never-exceed for AI | no clean-airplane Vne printed; dive placard varies with altitude and g. Use 360 mph indicated (161 m/s) at 20,000 ft as the limit at altitude | mph | POH para 18c | POH pdf 33 | (2) | 2026-09-29 | SOURCED for that point; other altitudes ESTIMATE |
| Load factor | 4.5 g pullout at 300 mph, 20,000 ft is where buffeting starts (a compressibility cue, not a structural limit) | g | POH para 18c | POH pdf 33 | (2) | 2026-09-29 | SOURCED. Structural g limit not found: ESTIMATE |

## 7. Armament and payload

| Item | Value | Unit | Source | Page | URL | Read | Label |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Nose guns | four .50 in (12.7 mm) machine guns, 500 rounds per gun (2,000 total), one 20 mm cannon with 150 rounds, plus a gun camera | none | POH Sec. IX para a | POH pdf 51 | (2) | 2026-09-29 | SOURCED (primary). J-1706 tested with ballast for 1,200 rd .50 and 150 rd 20 mm |
| .50 rate of fire | about 850 rounds/min, muzzle velocity 2,900 ft/s = 884 m/s (Popular Science, Jan 1944, quoted in EN-WP); M2 Browning aircraft rate 750 to 850 rpm | rpm | EN-WP P-38 armament paragraph; EN-WP "M2 Browning machine gun" | Armament; Specifications | (4, 7) | 2026-09-29 | SOURCED (secondary) |
| 20 mm rate of fire | about 650 rounds/min, muzzle velocity 2,850 ft/s = 869 m/s, shell 130 g (0.29 lb) | rpm | EN-WP P-38 armament paragraph; HS.404 article lists 650 to 700 rpm | Armament | (4, 8) | 2026-09-29 | SOURCED (secondary) |
| Gun convergence | cannon inclined upward slightly more than the machine guns so paths meet between 350 and 400 yd (320 to 366 m) | yd | EN-WP citing AN 01-75-2 gunsight manual | Armament | (4) | 2026-09-29 | SOURCED (secondary) |
| Bombs and tanks (L, EN-WP infobox) | inner pylons: 2 x 2,000 lb (907 kg) bombs or tanks; or 2 x 1,000 lb (454 kg) plus 4 x 500 lb (227 kg) or 4 x 250 lb; or 6 x 500 lb or 6 x 250 lb; outer: 2 x 500 lb or 2 x 250 lb | lb | EN-WP Specifications | Specifications | (4) | 2026-09-29 | SOURCED (secondary). The infobox is a maximum-envelope and not a single loadout; the -H model list gives 3,200 lb (1,452 kg) of underwing bombs |
| Rockets | 10 x 5 in HVAR (5 per wing on tree racks; the first L had 7 per wing); rocket set adds 1,365 lb (619 kg) | none | EN-WP Variants; HVAR article lists 134 lb (60.8 kg) per round | Variants; HVAR | (4, 9) | 2026-09-29 | SOURCED (secondary). Note 10 x 134 = 1,340 lb vs 1,365 lb printed: different accounting (racks) |
| Drop tank | 165 U.S. gal or 300 U.S. gal, 250 mph indicated limit with 300-gal | gal | POH | POH pdf 16, 24 | (2) | 2026-09-29 | SOURCED (primary) |
| Repo store types | Hellcat file has `an-m65` (453.6 kg) and `hvar` (61 kg) types. Matching stores for the P-38: 500 lb bomb = 226.8 kg (nominal weight; the bomb model marking is not sourced); HVAR = 60.8 kg | kg | HVAR 134 lb x 0.45359237 = 60.8 | | (9) | 2026-09-29 | DERIVED |

## 8. Variant and 3D-model match

| Item | Value | Unit | Source | Page | URL | Read | Label |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Model | original Blender P-38L (`tools/models/blender/p-38-lightning.py`); keep list Prop1, Prop2, GearL, GearR, GearNose. Sketchfab P-38 rejected (ASSETS.md) | | repo | | | 2026-09-29 | SOURCED (repo) |
| Dimensions test | span 15.85 m, length 11.53 m, tolerance 0.01; source there is English Wikipedia read 2026-09-27 | m | `tests/tools/models/aircraftDimensions.test.ts` line 30 | | | 2026-09-29 | SOURCED. POH gives the same figures (52 ft 0 in, 37 ft 10 in) so the test source can be upgraded to primary |
| Armament shown | 4 x M2 plus 1 x Hispano 20 mm, 150 rounds | | POH agrees | | | 2026-09-29 | SOURCED |
| Variant feature: chin intercooler, dive recovery flaps, aileron boost | present on the L (POH pdf 3, 4); the J-1706 airplane lacked aileron boost and dive flaps | | POH; J-1706 | | | 2026-09-29 | SOURCED. Confirms the J tables are for a heavier-stick, no-boost airplane |
| Variant mismatch | the performance tables come from the J (V-1710-89/91, 60 in Hg after WEP later authorized). The L uses -111/-113 with 60 in Hg (WEP 1,600 hp). The trial L speeds are 3 mph below J at sea level and 5.5 mph below at altitude | | J-1706, L-25092 | | | 2026-09-29 | DERIVED: 342 vs 345 mph (0.991); 416 vs 421.5 mph (0.987) |
| Prop feature | counter-rotating (outboard-up): the rig should name Prop1 (left) and Prop2 (right) with opposite spin | | J-1706 Sec. III B "opposite rotating"; POH | | | 2026-09-29 | SOURCED. Sense of rotation as viewed is not stated in the sources read |

## Recommended reference block

Proposal only; the choices marked DECISION belong to Mark.

**DECISION 1: power rating for the fit.** The full altitude tables are at WEP (60 in Hg, 5 min limit), and the model's summed power must match. The L trial's only climb curve is at normal rated power, which is about half the WEP climb, so it cannot be used for a WEP fit. Recommendation: fit at WEP and label everything DERIVED where an L figure scales a J one.

**DECISION 2: test mass.** Two choices:
- J trial mass 7,528 kg (16,597 lb) matches the complete J tables and the J stall figures; use this for the altitude tables.
- L trial mass 8,190 kg (18,055 lb) matches only the L climb chart at normal rated power. Use it only if Mark wants a normal-rated dataset.

**Recommended reference (WEP, J mass, L-scaled speeds):**

| Field | Value | Label |
| --- | --- | --- |
| testMassKg | 7,528 (16,597 lb x 0.45359237; the J trial) | SOURCED (J-1706), variant mix flagged |
| topSpeedMps at topSpeedAltitudeM | 186.0 m/s at 7,925 m (416 mph at 26,000 ft; L trial WEP) | SOURCED (L-25092), mass unspecified |
| topSpeedByAltitudeM (J WEP, x 0.989 to reflect the L) | 0 m: 152.6; 1,524 m: 160.3; 3,048 m: 167.6; 4,572 m: 174.4; 6,096 m: 180.9; 7,864 m: 186.4; 9,144 m: 182.8; 10,668 m: 176.9 (m/s). Raw J values in table 4a. Scale 0.989 = mean of 342/345 and 416/421.5 | DERIVED |
| climbRateMps | 20.32 at sea level (J WEP 4,000 ft/min); by altitude per table 4a (19.41 at 3,048 m, 16.21 at 6,096 m, 13.54 at 7,620 m, 9.30 at 9,144 m, 5.00 at 10,668 m) | SOURCED (J-1706), variant flagged; scaling by mass to the L not applied |
| stallSpeedMps | 44.2 (98.8 mph indicated, gear and flaps up, power off, at 7,528 kg) | DERIVED from POH table by weight; J-1706 measured 99.0 mph = 44.3 m/s |
| stallSpeedFlapMps | 32.6 (73.0 mph indicated, gear and flaps down, at 7,528 kg) | DERIVED from POH table; J-1706 measured 78 mph (34.9 m/s), so treat 32.6 to 34.9 as the plausible range |
| rollRateDegPerSec | none | ESTIMATE (no source; L has aileron boost, qualitatively better than the J) |
| takeoffDistanceM | none | ESTIMATE |

**Flight-fit fields with no source that must be ESTIMATE:** rollRateDegPerSec, takeoffDistanceM, gear retract time, propeller diameter (3.51 m), wing taper and dihedral, structural g limit, clean-airplane Vne, and the mass of the airplane at the L's critical-altitude speed point.

## Gaps and risks

1. **Variant mix.** Every full table is a P-38J with -89/-91 engines. The L differs by engines (-111/-113 at 1,600 hp WEP), aileron boost and dive flaps. The L level-speed points are 1 to 1.3 percent slower than the J.
2. **L speed chart and Figure 4 (weight schedule) not obtained.** Only six text speeds exist, with no fixed test weight. The L speed image failed to load from Wayback for every timestamp tried (file named 25095 on the page, redirects to 25092).
3. **L climb is normal rated, not WEP.** About 2,050 ft/min at SL (10.4 m/s) against the J's 4,000 ft/min at WEP. A fit against the wrong rating will be a factor of 2 out.
4. **Chart-read values are about 5 percent**, and the L trial weight legend is a poor scan (18,055 lb read from enlarged crops; an earlier read of 16,055 was wrong).
5. **J-1706 caveats.** Engine failures during the runs; the memo puts the replacement-engine combinations 5 to 7 mph slower. Power figures are from a power curve, not measured torque. The stall table headers are ambiguous.
6. **POH engine chart footnotes** (which critical altitude means "with ram") are hard to read in the scan; the 25,800 ft WEP no-ram figure matches the J trial's 25,800 ft critical altitude, so that one is well supported.
7. **Uncited secondary numbers** (max takeoff weight 21,600 lb, climb 4,750 ft/min, ceiling 44,000 ft, ranges) come from the Wikipedia infobox with no primary support here.
8. **Indicated versus calibrated.** The J installation error reaches 14 mph at 360 mph indicated. The stall figures are indicated, which is what the fit field wants; the speed tables are true airspeed as printed.
9. **Sources not stable.** wwiiaircraftperformance.org returns 404 live; the primary reports exist only through Wayback captures. The direct PDF URLs for the POH and the J-1656 and G reports were not recorded in the scratch folder (local copies were read from `/tmp/sp`, which is not durable).
10. **Model constants that came from estimates**: the Blender rig's propeller diameter, taper, dihedral, gear track. Gear tread (5.03 m) can now be SOURCED from J-1706.

## Sources read

Read date 2026-09-29 for all.

1. J-1706, "Flight Tests of a P-38J Airplane", Eng-47-1706-A, 4 Feb 1944. Wayback capture of http://www.wwiiaircraftperformance.org/p-38/p-38-67869.html (capture 2016-12-29). Full text read.
2. POH, "Pilot's Flight Operating Instructions, Army Models P-38H Series, P-38J Series, P-38L-1, L-5 and F-5B" (AN 01-75-1, 1944), 57-page scan with OCR text. Hosted on wwiiaircraftperformance.org via the P-38 index page; the direct PDF URL was not recorded (see Gaps item 9). Pages cited are PDF pages.
3. NASA SP-468 "Quest for Performance", Appendix A Table III: http://www.hq.nasa.gov/pao/History/SP-468/app-a2.htm (Wayback capture 2009-05-11).
4. English Wikipedia "Lockheed P-38 Lightning" (raw wikitext): https://en.wikipedia.org/wiki/Lockheed_P-38_Lightning
5. L-25092, "Memorandum Report on P-38L Airplane, AAF No. 44-25092", 11 Dec 1945, from the wwiiaircraftperformance.org P-38 index (Wayback capture, http://www.wwiiaircraftperformance.org/p-38/p-38.html). Text data points read; Figs. 11 and 12 read from the chart images `p-38l-25095-climb.jpg` and `p-38l-25095-timeclimb.jpg` (watermarked scans); speed chart missing.
6. J-1771, "Flight Tests on the Lockheed P-38J Airplane, AAF No. 43-28392, using 44-1 fuel", Eng-47-1771-A, 5 Jul 1944 (Wayback capture of the wwiiaircraftperformance.org page, `p-38-28392.html`). Full text read.
7. English Wikipedia "M2 Browning machine gun": https://en.wikipedia.org/wiki/M2_Browning
8. English Wikipedia "Hispano-Suiza HS.404": https://en.wikipedia.org/wiki/Hispano-Suiza_HS.404
9. English Wikipedia "High Velocity Aircraft Rocket": https://en.wikipedia.org/wiki/High_Velocity_Aircraft_Rocket
10. Repo files: `docs/aircraft.md`, `content/aircraft/f6f-hellcat.json`, `content/aircraft/a6m2-zero.json`, `tests/tools/models/aircraftDimensions.test.ts`, `tools/models/entries/p-38-lightning.json`, `tools/models/blender/p-38-lightning.py`, `ASSETS.md`.
11. Scanned and looked at, no figure taken from them: P-38G 42-12690 report FS-M-19-1492-A (stall pages), P-38J 43-13563 report Eng-47-1656-A (3 pages), P-38J performance 11 March 1944 summary. USAF Museum fact sheet returned Access Denied and was not read.
