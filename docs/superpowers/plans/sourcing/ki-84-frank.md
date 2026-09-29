# Sourcing dossier: Nakajima Ki-84-Ia Hayate (Frank), id `ki-84-frank`

Research only. Nothing in `content/` or `src/` was edited and no tests were run. Read date for every source: **2026-09-29**.
Labels: SOURCED = printed in a document read; DERIVED = arithmetic on sourced numbers (shown); ESTIMATE = ours, no document.
Conversions: 1 ft = 0.3048 m, 1 lb = 0.45359237 kg, 1 mph = 0.44704 m/s, 1 hp = 745.7 W, 1 ft/min = 0.00508 m/s, 1 US gal = 3.785412 L, 1 sq ft = 0.09290304 m2.

## Source key

| Key | Document | Quality |
| --- | --- | --- |
| **[T2]** | HQ Air Materiel Command, Wright Field, Interim Report No. F-IM-1119C-ND, "T-2 Report on Frank-1 (Ki-84), T-2 Serial No. 302, Interim Report No. 3 (Project NAD 25)", Capt R. J. Groseclose, released November 1946. 19-page scan (image only; I read every page as an image). Report page numbers below are the printed ones. | PRIMARY for the flown handling data (stalls, take-off speed, gear time, landing speeds). Its "Factual Data" table (report p. 2-3) is NOT flown: the same report says "5. Performance: None obtained" (p. 11) and "no performance climbs were attempted" (p. 8). |
| **[156A]** | Technical Air Intelligence "Aircraft Performance and Characteristics" sheets 156A-1..4, "Frank 1", dated March 1945, from the Archives of M. Williams. 4-page image scan. | PRIMARY intelligence summary, but a CALCULATED/reported table, not a flight test. It predates the 1946 Wright Field flights by over a year and carries the same numbers as [T2] p. 2-3. |
| **[WP]** | English Wikipedia "Nakajima Ki-84 Hayate", Specifications (Ki-84-Ia), raw wikitext; plus "Ho-5 cannon", "Ho-103 machine gun", "Nakajima Homare". | SECONDARY. Its Ki-84-Ia infobox cites [156A] ("Report on Frank 1", TAIC 156A-1), so its weights and performance are the same table converted to metric. The span, length and height are NOT the same as [T2]/[156A] (see section 1). |

URLs: [T2] https://www.wwiiaircraftperformance.org/japan/T-2_Report_on_Frank_I_Ki-84.pdf ; [156A] https://wwiiaircraftperformance.org/japan/Ki-84-156A.pdf ; [WP] https://en.wikipedia.org/wiki/Nakajima_Ki-84_Hayate , https://en.wikipedia.org/wiki/Ho-5_cannon , https://en.wikipedia.org/wiki/Ho-103_machine_gun , https://en.wikipedia.org/wiki/Nakajima_Homare .

## 1. Geometry

| Item | Value as printed | Metric | Source | Page | URL | Read | Label |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Span | 37.1 ft | 37.1 x 0.3048 = 11.308 m | [T2] Factual Data / Dimensions; [156A] 156A-2 Dimensions ("Span 37.1'"); 156A-4 drawing "(37'-1)" | T2 p. 2; 156A-2 | see key | 2026-09-29 | SOURCED |
| Span (the model's figure) | 11.238 m (36.87 ft) | as printed | [WP] Specifications (Ki-84-Ia) | infobox | en.wikipedia.org/wiki/Nakajima_Ki-84_Hayate | 2026-09-29 | SOURCED (secondary; conflicts with T2, below) |
| Length | 32.22 ft | 32.22 x 0.3048 = 9.821 m | [T2]; [156A-2] "Length 32.32'" (see conflict) | T2 p. 2; 156A-2 | see key | 2026-09-29 | SOURCED |
| Length (the model's figure) | 9.92 m (32.55 ft) | as printed | [WP] | infobox | as above | 2026-09-29 | SOURCED (secondary) |
| Height | 11.17 ft | 11.17 x 0.3048 = 3.405 m | [T2]; [156A-2] "Height 11.17'" | T2 p. 2; 156A-2 | see key | 2026-09-29 | SOURCED |
| Height ([WP]) | 3.385 m (11.11 ft) | as printed | [WP] | infobox | as above | 2026-09-29 | SOURCED (secondary) |
| Wing area | 226 sq ft | 226 x 0.09290304 = 20.996 m2 (rounds to 21.0) | [T2]; [156A-2] "Wing area 226 sq. ft."; [WP] 21 m2 agrees | T2 p. 2; 156A-2 | see key | 2026-09-29 | SOURCED |
| Mean chord | not printed | 20.996 / 11.308 = 1.857 m (with the T2 span); 21 / 11.238 = 1.869 m (model span) | arithmetic | n/a | n/a | 2026-09-29 | DERIVED |
| Tailplane span | "(14'-8 1/2\")" on the 3-view; the scan is small, verify before use | 14.71 ft = 4.48 m | [156A-4] top view | 156A-4 | see key | 2026-09-29 | SOURCED (low confidence read) |
| Wing airfoil | NN-21, 16.5% root, 8% tip | | [WP] infobox | infobox | as above | 2026-09-29 | SOURCED (secondary) |
| Wing sweep / dihedral | not cited by any source read | | none | n/a | n/a | 2026-09-29 | GAP. The Blender script uses taper 0.53, unswept quarter chord, 6 deg dihedral, all ESTIMATE. |

Conflicts, both values kept:
- Span 11.308 m ([T2]) vs 11.238 m ([WP], and `tests/tools/models/aircraftDimensions.test.ts`): +0.071 m, +0.62%.
- Length 9.821 m ([T2]) vs 9.92 m ([WP], the test): the T2 figure is 0.099 m, 1.00% shorter. The [156A-2] sheet prints "32.32'" in the Dimensions box (9.851 m) while the same sheet's side view and [T2] give 32.22 ft. The typed digit in 156A-2 could be a typo; I could not tell which. Three numbers for length: 32.22 ft, 32.32 ft, 9.92 m (32.55 ft).
- Height 3.405 m vs 3.385 m.
- The repo test cites [WP] at 1% tolerance (`aircraftDimensions.test.ts` line 29, read 2026-09-29). The model matches [WP], not the wartime intelligence reports. Wikipedia's metric numbers look like the Japanese design figures (11.238 m); I found no document in this pass that says so, so that is an ESTIMATE of provenance, not a finding.

## 2. Mass

| Item | Value as printed | Metric | Source | Page | Read | Label |
| --- | --- | --- | --- | --- | --- | --- |
| Normal fighter weight (the performance table's weight) | 7,940 lb | 7,940 x 0.45359237 = 3,601.5 kg | [T2] Weight; [156A-1], [156A-2] "@ 7940 lb" | T2 p. 2 | 2026-09-29 | SOURCED |
| Fuel load at normal weight | 1,110 lb | 503.5 kg | [T2]; [156A-1] | T2 p. 2 | 2026-09-29 | SOURCED |
| Overload fighter weight | 9,194 lb | 4,170.3 kg ([WP] prints 4,170 as max takeoff) | [T2]; [156A-1] | T2 p. 2 | 2026-09-29 | SOURCED |
| Fuel load at overload | 2,088 lb | 947.1 kg | [T2]; [156A-1] | T2 p. 2 | 2026-09-29 | SOURCED. Check: 359 gal x 6.0 lb/gal = 2,154 lb, 66 lb more than printed; unexplained. |
| Empty weight | NOT printed in [T2]; the [156A-2] Weights box has "Empty" blank | [WP] 2,660 kg = 5,864 lb | [WP] infobox only | n/a | 2026-09-29 | SECONDARY. GAP in primary. |
| Weight at the stall tests | 7,900 lb take-off gross, CG 84.6 in. aft of the rear of the propeller spinner | 3,583.4 kg | [T2] "Weight and CG Information" | T2 p. 5 | 2026-09-29 | SOURCED |
| Max takeoff | 9,194 lb "overload fighter" is the largest weight printed | 4,170.3 kg | [T2]/[156A] | T2 p. 2 | 2026-09-29 | SOURCED (label it overload, not certified MTOW) |
| Internal fuel | 185 US gal (154 imp gal), 92 octane | 185 x 3.785412 = 700.3 L; 700.3 x 0.72 kg/L = 504.2 kg (the report's own 1,110 lb / 185 gal = 6.00 lb/gal, so 503.5 kg) | [T2] Fuel; [156A-2] Fuel | T2 p. 3 | 2026-09-29 | SOURCED gal; kg DERIVED |
| External drop tanks | 174 US gal (144 imp) | 658.7 L | [T2]; [156A-2] | T2 p. 3 | 2026-09-29 | SOURCED |
| Total fuel capacity | 359 US gal (298 imp) | 1,359 L | [T2]; [156A-2] | T2 p. 3 | 2026-09-29 | SOURCED |
| Water-methanol tank | 42.2 gal | 159.7 L | [T2] | T2 p. 3 | 2026-09-29 | SOURCED |
| Ammunition | 350 rounds per 12.7 mm gun, 150 per 20 mm gun (see 7) | | [T2], [156A-3] | T2 p. 3 | 2026-09-29 | SOURCED |
| Armor | 13 mm plate behind pilot; windshield bulletproof glass 65 mm (documents "state") | | [156A-3] Vulnerability, Tactical Data | 156A-3 | 2026-09-29 | SOURCED (intel claim, not measured) |
| Oil | not printed anywhere read | | none | n/a | 2026-09-29 | GAP |

Sanity: the test mass 3,601.5 kg minus fuel 503.5 kg leaves 3,098 kg for airframe, pilot, ammunition and oil, well above [WP]'s 2,660 kg empty, so about 438 kg of payload (pilot, guns' ammunition, oil, water-methanol) is implied. DERIVED, unverified because the empty weight is secondary.

## 3. Engine and propeller

Engine: Nakajima Ha-45 Model 21 ("Homare 21"), 18-cylinder two-row air-cooled radial, 92-octane fuel plus 50/50 water-methanol injection ([T2] p. 1 and p. 5; [156A-2]: "Supercharger 2 Speed", Fuel 92). One engine.

| Rating | hp as printed | Altitude | W (x 745.7) | Fraction of 1,970 hp | Source | Page | Read | Label |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Take-off | 1,970 hp (brake hp, 3,000 rpm, 49.6 in. Hg) | sea level | 1,469,029 W | 1.0000 | [T2] Engine, and pilot section "developing 1970 brake horsepower at sea level with 3,000 rpm and 49.6 in. Hg" | T2 p. 3, p. 5 | 2026-09-29 | SOURCED |
| Normal | 1,150 hp | 8,000 ft (2,438 m) | 857,555 W | 0.5838 | [T2] | T2 p. 3 | 2026-09-29 | SOURCED |
| Normal | 1,000 hp | 22,000 ft (6,706 m) | 745,700 W | 0.5076 | [T2] | T2 p. 3 | 2026-09-29 | SOURCED |
| Military | 1,875 hp | 5,900 ft (1,798 m) | 1,398,188 W | 0.9518 | [T2] | T2 p. 3 | 2026-09-29 | SOURCED |
| Military | 1,695 hp | 20,000 ft (6,096 m) | 1,263,962 W | 0.8604 | [T2] | T2 p. 3 | 2026-09-29 | SOURCED |
| War emergency (WEP) | 2,050 hp | 2,500 ft (762 m) | 1,528,685 W | 1.0406 | [T2] | T2 p. 3 | 2026-09-29 | SOURCED |
| War emergency | 1,850 hp | 17,900 ft (5,456 m) | 1,379,545 W | 0.9391 | [T2] | T2 p. 3 | 2026-09-29 | SOURCED |

Cross-checks and conflicts:
- [156A-2] Engines box prints the ratings jumbled in the scan: take-off 1,970 at SL, 2,040 at 3,000 ft, normal 1,850 at 17,900 ft, military 1,765 at SL, 1,875 at 5,900 ft, 1,695 at 20,000 ft, war emergency 1,850 at 17,900 ft. So [156A] says WEP 2,040 hp at 3,000 ft where [T2] says 2,050 hp at 2,500 ft. The read is low confidence (small type, brackets). The military 1,765 hp at sea level appears ONLY in [156A-2]; it is the one sea-level military point available.
- [WP] Homare page: "Homare 21 - 1,990 hp (1,460 kW)"; [WP] infobox: 1,522 kW at sea level and 1,360 kW at 17,900 ft. 1,522 kW = 2,041 hp, which matches [156A]'s 2,040, not [T2]'s 2,050. The 1,990 vs 1,970 difference is plausibly a PS versus hp unit: 2,000 PS x 0.98632 = 1,972.6 hp. That is my inference (ESTIMATE), not something a document states.
- Gap: no power point between sea level and 5,900 ft for military power, and none above 20,000 ft. The speed table runs to 35,000 ft, so power above 20,000 ft must be FITTED to speed, not sourced. The report never names a critical altitude explicitly; the military-power peaks are the 5,900 ft (first supercharger speed) and 20,000 ft (second speed) points.
- Take-off power is the one number that fits the flight model's single `maxPowerW`. Recommend `maxPowerW` = 1,469,029 W, SOURCED, take-off rating; the Zero and B-17 blocks use the take-off rating the same way.

Propeller:

| Item | Value | Metric | Source | Page | Label |
| --- | --- | --- | --- | --- | --- |
| Blades | 4 | | [T2], [156A-2] | T2 p. 3 | SOURCED |
| Diameter | 10.2 ft ([T2]); 10.16 ft ([156A-2] "Diam. 10.16'"; the 3-view says "(10'-2\")" = 10.17 ft) | 10.2 x 0.3048 = 3.109 m; 10.16 ft = 3.097 m | [T2] Propeller; [156A-2], [156A-4] | T2 p. 3 | SOURCED (two values within 0.4%). The Blender script's 3.05 m is an ESTIMATE that these sources replace. |
| Type | constant-speed, electric (Curtiss-Electric type), non-feathering, automatic or manual | | [T2] pp. 3, 5 | | SOURCED |
| Behavior | governor held speed well except that it "would overspeed excessively" on power application after a prolonged dive | | [T2] p. 11 | | SOURCED remark |

## 4. Performance tables

All rows: [T2] p. 2 "Factual Data", identical to [156A-1] graphs and [156A-2] box (March 1945). Weight 7,940 lb (3,601.5 kg) normal fighter. **These are calculated intelligence figures, not flight-test results.** Power labels: "Military" = military power, "WEP" = war emergency with water-methanol.

Top speed, normal fighter (7,940 lb). Columns were read row by row against the printed row labels at high zoom; the overload column is Military only and lines up with SL, 10,000, 20,000, 23,000, 30,000, 35,000 ft.

| Altitude | m | Military mph | m/s | WEP mph | m/s | Overload fighter (9,194 lb) Military mph | m/s | Source | Label |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SL | 0 | 350 | 156.46 | 363 | 162.28 | 312 | 139.48 | T2 p. 2 | SOURCED |
| 10,000 ft | 3,048 | 389 | 173.90 | 390 | 174.35 | 347 | 155.12 | T2 p. 2 | SOURCED (WEP only 1 mph above Military, suspicious; see gaps) |
| 20,000 ft | 6,096 | 412 | 184.18 | 427 | 190.89 | 370 | 165.40 | T2 p. 2 | SOURCED |
| 23,000 ft | 7,010 | 426 | 190.44 | 419 | 187.31 | 382 | 170.77 | T2 p. 2 | SOURCED (Military above WEP; consistent with WEP critical altitude 17,900 ft) |
| 30,000 ft | 9,144 | 400 | 178.82 | 393 | 175.69 | 357 | 159.59 | T2 p. 2 | SOURCED |
| 35,000 ft | 10,668 | 370 | 165.40 | 360 | 160.93 | 317 | 141.71 | T2 p. 2 | SOURCED |

- Highest speed in the table: 427 mph WEP at 20,000 ft and 426 mph Military at 23,000 ft (190.9 and 190.4 m/s). [156A-2] Speed box prints "Maximum 350 @ S.L.; W.E.P. 363 @ S.L.; Maximum 426 @ 23,000'; W.E.P. 427 @ 20,000'; Cruising 75% 254 @ 1,500'".
- [WP] infobox: 687 km/h at 7,000 m = 426.9 mph, consistent with the 426 to 427 mph row.

Climb, normal fighter (7,940 lb):

| Item | Value as printed | Metric | Source | Label |
| --- | --- | --- | --- | --- |
| Time to 10,000 ft | 2.6 min | | T2 p. 2; 156A-2 | SOURCED |
| Time to 20,000 ft | 5.8 min | | T2 p. 2 | SOURCED |
| Time to 30,000 ft | 10.0 min | | T2 p. 2 | SOURCED |
| Rate of climb, SL, Military | 3,790 ft/min | 19.25 m/s | T2 p. 2 | SOURCED |
| Rate of climb, SL, WEP | 4,275 ft/min | 21.72 m/s | T2 p. 2 | SOURCED |
| Rate of climb, 20,900 ft (6,370 m), Military | 3,195 ft/min | 16.23 m/s | T2 p. 2 | SOURCED |
| Rate of climb, 17,900 ft (5,456 m), WEP | 3,615 ft/min | 18.36 m/s | T2 p. 2 | SOURCED |
| Time to altitude, overload fighter | 3.3 min to 10,000; 7.3 to 20,000; 12.7 to 30,000 | | T2 p. 2 | SOURCED |
| Service ceiling | 38,800 ft | 11,826 m | T2 p. 2; 156A-2 | SOURCED |

Climb cross-check (DERIVED): 10,000 ft in 2.6 min averages 3,846 ft/min, consistent with 3,790 ft/min at SL (Military); 10,000 to 20,000 ft takes 3.2 min = 3,125 ft/min average, consistent with 3,195 ft/min at 20,900 ft. So the two tables agree internally. Only two rate-of-climb altitudes per power setting are printed; a fit at 4,572, 6,096 and 9,144 m (as the Zero block) would need the curve read off the [156A-1] graph or interpolated from time-to-altitude (DERIVED). [WP] infobox prints 21.84 m/s at sea level and 18.29 m/s at 3,050 m; 21.84 m/s = 4,299 ft/min and 18.29 m/s = 3,600 ft/min, which do not match [T2]'s 4,275 and 3,615 (a small conflict; [WP] apparently used a different rounding or the graph).

Stalls, FLOWN ([T2] Pilot's Comments, section g, printed p. 9, cowl flaps and canopy closed; weight 7,900 lb at take-off, weight at the test not stated):

| Configuration | Warning | Stall | Metric (stall) | Conditions | Label |
| --- | --- | --- | --- | --- | --- |
| Power off, wheels and flaps up | 108 mph IAS (shudder, elevator buffet) | 102 mph | 45.60 m/s | 8,000 ft pressure altitude, 2,200 rpm, throttle closed, straight stall; "clean, stable, negligible tendency to drop a wing" | SOURCED, flown |
| Power off, wheels and flaps down | 92 mph IAS (canopy buffet) | 90 mph IAS | 40.23 m/s | 8,500 ft PA, 2,200 rpm, throttle closed, oil-cooler shutters open; "nose drops straight through" | SOURCED, flown |
| Power on, wheels and flaps down, 20 mm Hg manifold | does not stall; rudder inadequate below 81 mph IAS, aileron inadequate below 74 mph IAS, left yaw and roll below 74 mph | (no stall) | | 8,000 ft PA, 2,200 rpm | SOURCED remark, not a stall speed |
| Power on, wheels and flaps down, manifold reduced to 20 mm Hg | warning 81 mph | 79 mph IAS (left wing drops) | 35.32 m/s | as above ("20 mm Hg" is as printed; it is the second use of that figure, likely a typo for a different manifold value) | SOURCED, flown; do not use, power-on |
| Power on, wheels and flaps up, 60 deg bank, 3 g estimated | elevator buffet below 160 mph IAS | turn discontinued at 130 mph | | | SOURCED remark |

The report does not say the airspeeds are IAS for the two power-off stalls except that the warning speeds are "IAS" and the second stall states "IAS"; treat all as indicated (the same treatment as the Zero and F6F blocks). Flap setting for "flaps down" is not stated (presumably full). Neither figure is corrected to the 7,940 lb table weight. Stall weight is not stated, only the 7,900 lb take-off weight; with fuel burned the weight was lower. Correcting to 7,940 lb by the square-root of weight ratio: 102 x sqrt(7940/7900) = 102.3 mph, +0.3 mph, immaterial (DERIVED).

Take-off and landing:

| Item | Value | Metric | Source | Page | Label |
| --- | --- | --- | --- | --- | --- |
| Take-off run, normal weight | 1,460 ft "of runway is required" at 7,940 lb (156A-2: "Runway Requirements 7940 lb, 1460 ft"; "T.O. over 50' obstacle" blank) | 1,460 x 0.3048 = 445.0 m | [T2] p. 3; [156A-2] | T2 p. 3 | SOURCED, but a table figure from [156A]; wind, surface, power and flap setting are not stated. No 50 ft obstacle figure. |
| Recommended three-point take-off speed | 95 mph IAS "with normal rated power or above" | 42.47 m/s | [T2] p. 7, flown | p. 7 | SOURCED. This is a safe speed the pilots used, not a measured lift-off speed; there is no measured lift-off speed. |
| Landing approach | 120 mph over the fence, 110 mph just off the runway, touchdown 92 mph, elevator trim for zero stick force | 53.64, 49.17, 41.13 m/s | [T2] p. 10, flown | p. 10 | SOURCED |
| Gear extension speed | below 160 mph | 71.53 m/s | [T2] p. 10 | p. 10 | SOURCED |
| Flap extension speed | full flaps at 130 mph | 58.12 m/s | [T2] p. 10 | p. 10 | SOURCED |
| Gear retraction speed used | at 150 mph IAS | 67.06 m/s | [T2] p. 8 | p. 8 | SOURCED |
| Speed range with no flat spots or control reversal | 74 to 350 mph IAS | 33.1 to 156.5 m/s | [T2] p. 8 | p. 8 | SOURCED |
| Dive limit / never-exceed | NOT PRINTED | | [T2] concludes only that P-51H and P-47N "have a higher diving speed" | p. 12 conclusions | GAP |
| Structural g limit | NOT PRINTED. [T2] p. 1: "unusually strong ... heavy main spar built up to extruded aluminum angle pieces one-half in. thick"; no number | | | | GAP |
| Roll rate | NOT PRINTED. Flown remark: "rate of roll and radius of turn slightly inferior to those of the Zeke-52" (the A6M5); aileron and rudder forces light; elevator forces heavier; rudder "extremely sensitive at 300 mph IAS" | | [T2] pp. 8-9 | | GAP for a number; SOURCED remark |
| Range (context) | 1,815 mi at 173 mph max fuel; 1,410 mi at 241 mph; 1,025 mi at 178 mph normal fuel; 780 mi at 254 mph | 1,815 mi = 2,921 km | [T2] p. 3 | | SOURCED, not needed |

## 5. Gear and flaps

| Item | Value | Source | Page | Label |
| --- | --- | --- | --- | --- |
| Layout | conventional taildragger; low-wing; main gear "hydraulically operated and retracts upward and inward near the leading edge of the wing"; tail wheel "fully retractable" | [T2] p. 1 Description | p. 1 | SOURCED |
| Fixed or retractable | retractable (main and tail) | [T2] pp. 1, 5 | | SOURCED |
| Retract time | "an estimated four seconds is required for gear retraction" at 150 mph IAS; very little trim change | [T2] p. 8 | p. 8 | SOURCED as a pilot's estimate, ESTIMATE-grade. Note: the flown airplane also had gear that failed to fully retract or lock on two occasions ([T2] p. 11). |
| Tailwheel | "tailwheel lock with its slight swivel is a definite aid in cross-wind taxiing"; the pilot used brakes to "S" for forward vision; brake action "inadequate", rudder bar and toe brake assembly poor | [T2] p. 7 | p. 7 | SOURCED remark. The lock plus slight swivel maps most closely to `casterLock`; the swivel range is not printed (GAP). |
| Wheel size, track, leg length, height of gear | NOT PRINTED | | | GAP. The repo model measures these from the drawn (procedural) `.glb`; the Blender script marks gear track, leg length and gear retraction direction ESTIMATE. |
| Take-off torque | "negligible torque effect if rated power is applied gradually. If power is blasted on, full right rudder and some brake is necessary to counteract the pull to the left" | [T2] p. 7 | p. 7 | SOURCED remark |
| Flap type | Fowler, hydraulically actuated | [T2] p. 1 | p. 1 | SOURCED |
| Flap travel time | NOT PRINTED. Emergency hand pump: "approximately 100 strokes of the pump are required to retract or extend the flaps" | [T2] p. 11 | | GAP for seconds; ESTIMATE it |
| Flap area, deflection, clIncrement | NOT PRINTED | | | GAP |
| Trim | elevator flight-adjustable only; no aileron or rudder trim in flight | [T2] pp. 6, 8 | | SOURCED |
| Canopy | bubble/greenhouse sliding, hand crank, no jettison | [T2] pp. 1, 5 | | SOURCED |

## 6. Carrier suitability and AI-relevant limits

- Carrier suitability: not applicable. The Ki-84 was an Army fighter; no source read claims carrier operation. `carrierCapable: false` (D3, historical answer). No document read was needed to support it beyond the absence of any tailhook, wing-fold or catapult mention in [T2] and [156A].
- AI-relevant limits stated in sources:
  - No flat spots or control reversal from 74 to 350 mph IAS ([T2] p. 8); stall is normal and clean with warning early enough to prevent it ([T2] p. 8). Nothing there justifies excluding a maneuver.
  - The propeller overspeeds when power is applied after a prolonged dive "unless great care was taken" ([T2] p. 11). No maneuver exclusion follows from it.
  - P-51H and P-47N have a higher diving speed than the Frank ([T2] p. 12). No number.
  - The Frank turns inside the P-51H and P-47N and climbs "a little more quickly" ([T2] p. 12).
  - Recommendation for D13 `excludedManeuvers`: none, because no source forbids a maneuver.
- Other remarks for the Library card (not flight-model inputs): built as strong airframe with self-sealing tanks and armor but "not so well constructed as contemporary AAF fighters" in wear and maintenance ([T2] pp. 1, 12); exhaust stacks repeatedly failed during the 11.5 flying hours ([T2] p. 5); poor forward vision on the ground ([T2] p. 10).

## 7. Armament and payload

| Item | Value | Metric or rate | Source | Page | Label |
| --- | --- | --- | --- | --- | --- |
| Nose guns | 2 x 12.7 mm, fixed, engine-synchronized, "in the fuselage on either side forward of the cockpit"; approx 350 rounds per gun | | [T2] pp. 1, 3; [156A-3] "Forward Cowl 2, 12.7 mm, 350, Fixed" | T2 p. 3 | SOURCED |
| Wing guns | 2 x 20 mm, free-firing, "one in each wing just outboard of the landing gear assembly"; approx 150 rounds per gun | | [T2] pp. 1, 3; [156A-3] "Wing 2, 20 mm, 150, Fixed" | T2 p. 3 | SOURCED |
| Gun types | Ho-103 (12.7 mm) and Ho-5 (20 mm) | | [WP] infobox Armament (secondary); the primary reports do not name the models | | SOURCED (secondary) |
| Ho-103 rate | 983 rpm free ([WP] cites USSBS Catalog of Enemy Ordnance Material Report 12-b(2)); 400 rpm synchronized | 983 rpm; 400 rpm | [WP] Ho-103 page | | SOURCED (secondary; the 400 rpm is attributed there to Rottman, Osprey) |
| Ho-103 muzzle velocity | 780 m/s | | [WP] Ho-103 page | | SOURCED (secondary) |
| Ho-5 rate | early 820 rpm; later 700 to 750 rpm; 500 rpm synchronized; the prose says 750 rpm | 750 rpm (wing guns, the free-firing later version) | [WP] Ho-5 page | | SOURCED (secondary; the page is internally inconsistent) |
| Ho-5 muzzle velocity | infobox 735 m/s; prose 750 m/s | | [WP] Ho-5 page | | SOURCED (secondary; conflicting, both kept) |
| Bombs | **2 x 30 kg (132 lb total) or 2 x 100 kg (440 lb total)**, "carried externally in place of droppable gas tanks" | 2 x 30 kg; 2 x 100 kg | [T2] p. 3; [156A-2] Bombs-Cargo: "Maximum 2 x 30 kg, 132 lb" | T2 p. 3 | SOURCED |
| Bombs, alternate | 2 x 250 kg | | [WP] infobox Armament only (secondary), also the kind line given to this task | | SOURCED (secondary only) |
| Drop tanks | 2 x 200 L | | [WP] infobox; [T2] gives 174 US gal total (87 gal each = 329 L each, if split evenly) | | CONFLICT, see gaps |

Important: **neither primary source supports the 2 x 250 kg rack load in the kind line.** Both wartime documents print 30 kg or 100 kg as the bomb load. The 250 kg comes only from Wikipedia. The docs/aircraft.md D7 recommends "the historically standard load" and a sourced store: an existing store (`an-m65`, a 500 lb US bomb, and others) would not match a 250 kg Japanese bomb, so a new store would need a mass, drag area, filler, damage and blast figure each with a source (D8). None of those was found in this pass. Decision for Mark: (a) 2 x 250 kg with a secondary source and a named gap, or (b) 2 x 100 kg from [T2] (primary).

## 8. Variant and model

- Report subject: Frank-1 (Ki-84), the Ki-84-I family with Ha-45 Model 21 (Homare 21), 2 x 12.7 mm + 2 x 20 mm, T-2 serial 302. The repo model is the Ki-84-Ia ([WP] "most widely produced version": 2 x 12.7 mm nose plus 2 x 20 mm wings). They match by gun fit and engine. The report never says "Ia"; Ia is [WP]'s designation for this armament. Otsu (Ki-84-Ib in [WP] as 4 x 20 mm) and Hei (Ki-84-Ic, 2 x 20 mm + 2 x 30 mm) are different fits and are not this model.
- Later variants that would break the sourcing: Ki-84-II (wood parts), Ki-84-III, Ha-45-44 two-stage engines ([WP]). None applies.
- Model: `content/aircraft/ki-84-frank.glb` is authored procedurally by `tools/models/blender/ki-84-frank.py` (entry `tools/models/entries/ki-84-frank.json`, read 2026-09-29), not a downloaded Sketchfab mesh. Its header cites [WP] for span 11.238 m, length 9.92 m, wing area 21 m2, a 4-blade propeller and the airfoil thickness, and labels everything else ESTIMATE. It depicts a Ki-84-Ia (s/n 1446, 11th Hiko Sentai, per its header). Nodes kept by the entry: `Prop`, `GearL`, `GearR`, `Tailwheel` (pivots as in the entry). No `GearNose` (taildragger, correct).
- Where the model and the wartime reports differ: span 11.238 m vs 11.308 m (+0.62%), length 9.92 m vs 9.821 m (1.00%), propeller 3.05 m (ESTIMATE) vs 3.11 m (sourced). The dimension test holds the model to [WP] at 1%. Decision for Mark: keep [WP]'s 11.238 m and 9.92 m as the drawing figures (secondary), or re-cite to [T2]. A reference block fitted to `wingAreaM2` 21.0 is equal in both.

## Recommended reference block

Test mass: **3,601.5 kg** (7,940 lb, the normal-fighter weight all of [T2]/[156A] tabulates; fuel 1,110 lb = 503.5 kg). Stall figures were flown at 7,900 lb, 0.5% lighter.

The flight fit's power setting question: [T2] tabulates Military and War Emergency separately. Recommend fitting to **Military power** (does not depend on water-methanol injection, and every altitude from SL to 35,000 ft has a value) and ask Mark whether WEP is wanted as a second graded case. `engine.maxPowerW` = 1,469,029 W (1,970 hp take-off, SOURCED).

| Reference field | Suggested value | Source and arithmetic | Label |
| --- | --- | --- | --- |
| `testMassKg` | 3,601.5 | 7,940 lb x 0.45359237 | SOURCED / DERIVED conversion |
| `topSpeedMps`, `topSpeedAltitudeM` | 190.44 m/s at 7,010 m | 426 mph at 23,000 ft, Military, T2 p. 2 | SOURCED |
| `topSpeedByAltitudeM` (Military) | [0, 156.46], [3048, 173.90], [6096, 184.18], [7010, 190.44], [9144, 178.82], [10668, 165.40] | 350, 389, 412, 426, 400, 370 mph, T2 p. 2, x 0.44704 | SOURCED |
| WEP variant (optional) | [0, 162.28], [3048, 174.35], [6096, 190.89], [7010, 187.31], [9144, 175.69], [10668, 160.93] | 363, 390, 427, 419, 393, 360 mph | SOURCED (WEP 390 at 10,000 ft is suspect) |
| `climbRateMps` (SL) | 19.25 | 3,790 ft/min Military x 0.00508 | SOURCED |
| `climbRateByAltitudeM` | [6370, 16.23] Military, 20,900 ft; [5456, 18.36] WEP, 17,900 ft | 3,195 and 3,615 ft/min | SOURCED, only two points. Points at 4,572, 9,144 m: none printed. |
| Time to altitude (cross-check, not a field) | 10,000 ft 2.6 min; 20,000 ft 5.8 min; 30,000 ft 10.0 min | T2 p. 2 | SOURCED |
| `stallSpeedMps` (clean, power off, IAS) | 45.60 | 102 mph, T2 p. 9, flown, 8,000 ft PA | SOURCED |
| `stallSpeedFlapMps` (gear and flaps down, power off, IAS) | 40.23 | 90 mph, T2 p. 9, flown, 8,500 ft PA | SOURCED |
| `takeoffDistanceM` | 445.0 | 1,460 ft x 0.3048, 7,940 lb, T2 p. 3 | SOURCED (table figure, conditions unstated) |
| Take-off speed | 42.47 m/s (95 mph IAS) | T2 p. 7 | SOURCED as a safe three-point speed, not a measured lift-off |
| `rollRateDegPerSec` | none | | ESTIMATE (only "slightly inferior to Zeke-52", T2 pp. 8-9). The repo's Zero value is itself an ESTIMATE of 80; a Frank at "slightly inferior" is a direction card, not a number. |
| `limits.diveSpeedMps` | none | | ESTIMATE (no never-exceed printed) |
| `limits.gLimit` | none | | ESTIMATE |
| `gear.travelSeconds` | 4 | T2 p. 8 "estimated four seconds" at 150 mph IAS | SOURCED as an estimate by the pilots |
| `flap.travelSeconds` | none | | ESTIMATE |
| `flap.clIncrement`, `flap.dragAreaM2`, `gear.dragAreaM2`, `cd0`, `propEfficiency`, `staticThrustN`, `clMax` etc. | none | fitted by the sweep (docs/aircraft.md Part C) | FITTED |
| Power curve `powerFractionByAltitudeM` seed | [0, 1.0], [1798, 0.952], [6096, 0.860] Military, plus WEP and normal points above | 1,875/1,970 and 1,695/1,970 | SOURCED points; the curve between them and above 6,096 m to 10,668 m is FITTED to the speed table |
| Geometry | `wingAreaM2` 21.0 (226 sq ft = 20.996), `wingSpanM` 11.308 (T2) or 11.238 (WP, the model) | section 1 | SOURCED, choice needed |
| Mass | `emptyKg` 2,660 (WP only), `maxTakeoffKg` 4,170 (9,194 lb overload), `fuelCapacityKg` 504 (185 gal x 6.0 lb/gal x 0.4536 = 503.5) | section 2 | empty: SECONDARY; others SOURCED / DERIVED |

Fields of the flight fit that have **no source and must be ESTIMATE**: roll rate, dive speed, g limit, flap travel time, flap lift increment, all drag areas, gear leg and wheel geometry, tail-lift and steering rates, propeller-wash speed, pitch and yaw rate limits, lift-off speed (only a recommended speed), empty weight in the primary (secondary only), oil weight, wing sweep and dihedral.

## Gaps and risks

1. **The speed and climb tables are calculated, not flown.** [T2] itself reports "Performance: None obtained" and no performance climbs; [156A] carries the same numbers in March 1945, before Wright Field ever flew the airplane. The fit target is therefore an intelligence estimate. A secondary web result (search summary, 2026-09-29, not fetched) says the same about Wright Field; I confirmed it from the documents themselves.
2. **Bomb load conflict:** primaries print 2 x 30 kg or 2 x 100 kg; the kind line and Wikipedia say 2 x 250 kg. No 250 kg store exists in the repo and no mass, drag or blast figure for one was found.
3. **Geometry conflicts:** span, length and height differ between the wartime reports and the metric figures the model and its test use (section 1). [156A-2] also prints a third length (32.32 ft) that disagrees with [T2] (32.22 ft).
4. **WEP at 10,000 ft (390 mph) is barely above Military (389 mph)** while at 20,000 ft it is 15 mph higher; either a real feature of the ratings (WEP critical 2,500 ft, Military critical 5,900 ft) or a printing error. Fit to Military to avoid it.
5. **Power ratings differ across sources:** 2,050 hp at 2,500 ft ([T2]) vs 2,040 hp at 3,000 ft ([156A-2], low-confidence scan read) vs 1,522 kW at SL ([WP]); Homare 21 at 1,990 hp ([WP] Homare page) vs 1,970 hp brake ([T2]). Military at sea level (1,765 hp) is in [156A-2] only.
6. **No dive limit, g limit, roll-rate number, flap travel time, oil weight, gear geometry or wing sweep/dihedral in any source read.**
7. **Stall test conditions:** weight not stated at the test, flap angle not stated, "20 mm Hg" printed twice with different meaning in the power-on stalls; use only the two power-off stalls. Both were flown at altitude (8,000 and 8,500 ft PA), not sea level.
8. **Take-off:** only a table run (1,460 ft, conditions unstated) and a recommended 95 mph IAS three-point speed; no measured lift-off speed or 50 ft distance.
9. **Empty weight** (2,660 kg) is secondary ([WP]); the primary weight boxes leave it blank. The test-mass-minus-fuel remainder of 3,098 kg is only roughly consistent with it (payload about 438 kg, DERIVED).
10. **Overload fuel check fails by 66 lb** (2,088 lb printed, 359 gal x 6 = 2,154 lb). Immaterial to the normal-weight fit.
11. **Not read:** the Pilot's Handbook F-IM-1119B-ND (cited by [T2], not found online in this pass); USSBS Nakajima report (HathiTrust, cited by [WP]); the "Ki-84 Ia Technical Manual" on Scribd (cited by [WP]; behind a login wall, not attempted); the Ki-84 forum threads. These may hold dive speed, flap speeds and engine-limit data.
12. wwiiaircraftperformance.org index pages returned 403/404 for directory URLs; documents were reached through search results, not by browsing the site's Ki-84 page, so a better Ki-84 document (for example Japanese-source performance graphs) may exist there.

## Sources read

- https://www.wwiiaircraftperformance.org/japan/T-2_Report_on_Frank_I_Ki-84.pdf : [T2], 19 pages, every page viewed as an image (no text layer, no OCR tool on nexus), 2026-09-29.
- https://wwiiaircraftperformance.org/japan/Ki-84-156A.pdf : [156A], 4 pages, viewed as images, 2026-09-29.
- https://en.wikipedia.org/wiki/Nakajima_Ki-84_Hayate (raw wikitext, Specifications (Ki-84-Ia), variants), 2026-09-29.
- https://en.wikipedia.org/wiki/Ho-5_cannon and https://en.wikipedia.org/wiki/Ho-103_machine_gun (raw wikitext), 2026-09-29.
- https://en.wikipedia.org/wiki/Nakajima_Homare (raw wikitext, only the Homare 21 line), 2026-09-29.
- Repo files read: `content/aircraft/a6m2-zero.json` (reference block, mass, geometry, engine, gear, flap, rates, limits, combat), `git show worktree-b17-onboard:content/aircraft/b-17-flying-fortress.json` (head), `docs/aircraft.md` Parts A to C, `tests/tools/models/aircraftDimensions.test.ts` (line 29), `tools/models/entries/ki-84-frank.json`, `tools/models/blender/ki-84-frank.py` (header), `ASSETS.md`, `GAMEPLAY.md`. The B-17 handoff document was not read in full.
- Search results only, not fetched: https://worldwarwings.com/captured-ki-84-tested/ , https://warhistory.org/article/nakajima-ki-84-hayate-frank-part-ii , https://ww2aircraft.net/forum/threads/ki-84-the-real-maximum-speed/ , https://ww2aircraft.net/forum/threads/ki-84-homare-in-the-u-s.12795/ .
