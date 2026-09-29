# Sourcing dossier: Mitsubishi Ki-21-IIb Sally (`ki-21-sally`)

Research only, read 2026-09-29. Nothing in the repo was edited. Kind line: twin-engine medium bomber, retractable taildragger, Japanese, internal bomb load, no combat block, no turrets, power summed over two engines.

**Key finding: one primary performance document exists.** USAAF Technical Air Intelligence Center (TAIC) Manual No. 1, "Japanese Aircraft Performance and Characteristics", data sheet **SALLY 2 (551A)**, dated **December 1944**. It gives a speed, climb, take-off and weight table at a single stated gross weight of 23,500 lb, plus engine ratings on the engine sheet (printed page 861). Nothing else primary was found: wwiiaircraftperformance.org carries no Ki-21 document (its Japan index lists only fighters and the Ki-45, Ki-61, Ki-84 and Ki-43; checked 2026-09-29), and no flight-test report of a captured Ki-21 turned up. Whether the TAIC figures are flown, computed or Japanese-supplied is not stated on the sheet; treat them as SOURCED but of unknown origin.

**Engine designation conflict with the brief.** The brief says "two Ha-102 engines". TAIC's Sally 2 engine sheet lists **Ha-101** ("Type 100 1450 HP", Ha 32 Model 11, a Kasei-family 14-cylinder radial), and English Wikipedia and historyofwar.org agree. The Ha-102 (Ha 31 Model 21, 1,065 hp take-off) appears on the sheet installed in DINAH 2 and NICK 1, not Sally. Use Ha-101 unless a better source says otherwise. The Ki-21-IIa/IIb "Sally 2/3" designations in TAIC: the sheet itself says the dorsal-turret Sally "has at times been designated SALLY 3. It is now determined that the proper designation is SALLY 2", so this one sheet covers both the IIa and IIb.

Unit conversions used throughout: 1 ft = 0.3048 m, 1 mph = 0.44704 m/s, 1 lb = 0.45359237 kg, 1 US gal = 3.78541 L, 1 hp = 745.7 W, 1 ft/min = 0.00508 m/s.

Labels: SOURCED = printed in the cited document. DERIVED = arithmetic on sourced figures (shown). ESTIMATE = no document; do not present as sourced.

Source keys:

- **[T]** TAIC Manual No. 1 (Dec 1944), archive.org item `japanese-aircraft-performance-characteristics-taic-manual`, PDF `p4013coll8_4531.pdf`. Sally 2 sheet 551A = PDF p. 177; engine sheet printed p. 861 = PDF p. 222; index pp. 4-5.
- **[W]** English Wikipedia "Mitsubishi Ki-21", Specifications (Ki-21-IIb), which cites Mondey, *The Concise Guide to Axis Aircraft of World War II* (1996), p. 208. Read 2026-09-29 (raw wikitext).
- **[H]** historyofwar.org "Mitsubishi Ki-21 'Sally'" (J. Rickard, 12 Feb 2010), Ki-21-IIb data block. Secondary. Read 2026-09-29.
- **[A]** all-aero.com "Mitsubishi Ki-21 / Type 97" (2025-02-19). Secondary. Read 2026-09-29.
- **[P]** pacificwrecks.com Ki-21 technical information. Secondary. Read 2026-09-29.

URLs are in "Sources read" at the end.

---

## 1. Geometry

| Item | Value | Unit as printed | Source | Page | Read | Label |
| --- | --- | --- | --- | --- | --- | --- |
| Span | 74' 6" (sheet reads "74.6'") = 22.71 m (74.5 x 0.3048 = 22.708) | ft | [T] | PDF p. 177, Dimensions box | 2026-09-29 | SOURCED |
| Span | 22.5 | m | [W] | Specifications | 2026-09-29 | SOURCED (secondary) |
| Span | 73 ft 10 in = 22.5 m | ft in | [A] (ranges 73 ft 9 in to 73 ft 10 in across [H], [A]) | text | 2026-09-29 | SOURCED (secondary) |
| Length | 53' = 16.15 m (53 x 0.3048 = 16.154) | ft | [T] | PDF p. 177 | 2026-09-29 | SOURCED |
| Length | 16 | m | [W], [A] (52 ft 6 in in [H]) | Specifications | 2026-09-29 | SOURCED (secondary) |
| Height | 4.85 | m | [W]; [H] prints 15 ft 11 in = 4.85 m | Specifications | 2026-09-29 | SOURCED (secondary) |
| Height (Ki-21-I / prototype) | 4.35 = 14 ft 3 in | m | [A] | text | 2026-09-29 | SOURCED, other variant; do not use |
| Wing area | 768 sq ft = 71.35 m2 (768 x 0.09290304) | sq ft | [T] | PDF p. 177 | 2026-09-29 | SOURCED |
| Wing area | 69.9 | m2 | [W] | Specifications | 2026-09-29 | SOURCED (secondary) |
| Wing area | 69.6 m2 = 749.17 sq ft | m2 | [A], and a WebSearch summary of another page | text | 2026-09-29 | SOURCED (secondary) |
| Mean chord (S / b) | 3.11 m from [W] (69.9 / 22.5); 3.14 m from [T] (71.35 / 22.71) | m | arithmetic | n/a | 2026-09-29 | DERIVED (a mean geometric chord, not a stated MAC or root chord) |
| Wing sweep, dihedral, root/tip chord | not found in any source | | | | | GAP (model script uses taper 0.51, dihedral 6 deg, both ESTIMATE) |
| Propeller diameter | 11.1' = 3.383 m (11.1 x 0.3048) | ft | [T] engine box, Sally 2 sheet | PDF p. 177 | 2026-09-29 | SOURCED |

Conflicts: wing area is 71.35 (TAIC) versus 69.9 (Wikipedia) versus 69.6 (all-aero); span is 22.71 versus 22.5 m. TAIC prints the same figures for both IIa and IIb. The repo cites Wikipedia (22.5 m, 16.0 m, 69.9 m2); TAIC's span and length are +0.9% each of those, inside the 1% model test tolerance either way.

## 2. Mass

| Item | Value | Unit as printed | Source | Page | Read | Label |
| --- | --- | --- | --- | --- | --- | --- |
| Gross, "Normal Bomber" (performance table weight) | 23,500 lb = 10,659.4 kg (23,500 x 0.45359237) | lb | [T] | PDF p. 177, Weights box; also heads the Speed, Climb and Take-off boxes | 2026-09-29 | SOURCED |
| Empty | blank on the TAIC sheet | | [T] | PDF p. 177 | 2026-09-29 | GAP in [T] |
| Empty | 6,070 kg | kg | [W] | Specifications | 2026-09-29 | SOURCED (secondary) |
| Empty | 13,382 lb = 6,070 kg (13,382 x 0.45359237 = 6,069.97) | lb | [H] | Ki-21-IIb block | 2026-09-29 | SOURCED (secondary; agrees with [W]) |
| Gross / loaded | 10,600 kg = 23,369 lb | kg | [W] "gross weight" | Specifications | 2026-09-29 | SOURCED (secondary); within 0.6% of TAIC 10,659 kg |
| Loaded | 21,407 lb = 9,710 kg | lb | [H] | Ki-21-IIb block | 2026-09-29 | SOURCED (secondary; lower than the others) |
| Maximum | 23,391 lb = 10,610 kg (23,391 x 0.45359237 = 10,610.0) | lb | [H] | Ki-21-IIb block | 2026-09-29 | SOURCED (secondary) |
| Maximum takeoff, [W] | blank | | [W] | | | GAP in [W] |
| Overload | blank on the TAIC sheet | | [T] | | | GAP |
| Internal fuel, built-in | 691 US gal (573 Imp) | US gal | [T] | PDF p. 177, Fuel box | 2026-09-29 | SOURCED |
| Internal fuel, removable (bomb-bay tank) | 131 US gal (109 Imp) | US gal | [T] | same | 2026-09-29 | SOURCED |
| Maximum fuel (total) | 822 US gal (682 Imp); sheet notes "an internal tank is carried in the bomb bay and four x 50 kg bombs are carried externally" | US gal | [T] | same, General Data | 2026-09-29 | SOURCED |
| Fuel in kg at 0.72 kg/L | 691 gal: 691 x 3.78541 = 2,615.7 L x 0.72 = **1,883 kg**. 822 gal: 3,111.6 L x 0.72 = **2,240 kg** (the repo's Zero used 0.72 kg/L) | kg | arithmetic | n/a | 2026-09-29 | DERIVED (density is an ESTIMATE; 92-octane, TAIC engine sheet gives grade only) |
| Oil, ammunition | not found | | | | | GAP |

Choice of test mass: **23,500 lb = 10,659.4 kg**, because every TAIC performance figure is stated at that weight. It is 4,589 kg above the [W] empty weight (10,659.4 - 6,070), which is more than the 1,883 kg internal fuel; crew (4 to 7), oil and bombs fill the rest, carried through `fuelKg` as R31 does for the B-17. Whether TAIC's 23,500 lb includes a bomb load is not stated ("Normal Bomber"); the sheet's normal bombload is 1,760 lb (below), so 23,500 lb is a normal-bomber gross.

## 3. Engines

Ki-21-IIb: two Mitsubishi **Ha-101** (Type 100, 1,450 hp; Ha 32 Model 11 in the Kasei family), 14-cylinder air-cooled radial, two-speed supercharger, 92-octane. Not Ha-102 (see key finding).

| Item | Value | Unit as printed | Source | Page | Read | Label |
| --- | --- | --- | --- | --- | --- | --- |
| Engine count, model | 2 x Type 100 1450 HP (Ha 32 Model 11, "Ha 101") | | [T] | PDF p. 177 and p. 222 (printed 861), installed in "SALLY 2" | 2026-09-29 | SOURCED |
| Take-off | 1,490 hp at 2,450 rpm, 39.4" Hg, sea level | hp | [T] | PDF p. 222 (printed 861), col. 1; p. 177 agrees | 2026-09-29 | SOURCED |
| War emergency (WEP) | 1,490 hp SL (39.4"); 1,580 hp at 7,500 ft; 1,470 hp at 14,100 ft (all 2,450 rpm, 39.4") | hp | [T] | p. 222 | 2026-09-29 | SOURCED |
| Military | 1,310 hp SL (2,350 rpm, 36.4"); 1,445 hp at 8,550 ft; 1,360 hp at 15,100 ft | hp | [T] | p. 222; p. 177 repeats 1,445 at 8,550 and 1,360 at 15,100 | 2026-09-29 | SOURCED |
| Nominal | 1,450 hp | hp | [T] "Type 100, 1450 h.p."; [A] "1450 hp / 1119kW" | p. 177; text | 2026-09-29 | SOURCED |
| Rating per [W] | 1,500 hp (1,118 kW, [W] main text) | hp | [W] | Specifications, eng1 hp | 2026-09-29 | SOURCED (secondary); [H]: 1,500 hp take-off, 1,340 hp at 15,090 ft |
| Propeller | 3 blades, constant speed, 11.1 ft (3.383 m) | | [T] | p. 177 Engines box | 2026-09-29 | SOURCED |
| Propeller reduction ratio | 0.684 | | [T] | p. 222 | 2026-09-29 | SOURCED |
| Supercharger | 2 speed; ratios 7.4 and 9.118; impeller 280 mm (11.0") | | [T] | p. 222 | 2026-09-29 | SOURCED |
| Displacement, compression, bore/stroke | 42.1 L (2,570 cu in), 6.5:1, 150/170 mm | | [T] | p. 222 | 2026-09-29 | SOURCED |
| Dry weight | 1,595 lb (726 kg by 1,595 x 0.45359) | lb | [T] | p. 222 (the sheet's Kasei Model 11 column prints 725 kg / 1,595 lb) | 2026-09-29 | SOURCED |
| Remark | "May be equipped with ADI" | | [T] | p. 222 | 2026-09-29 | SOURCED |

Summed take-off power, DERIVED: 2 x 1,490 hp x 745.7 = **2,222,186 W** (1,111,093 W per engine). Alternative if a nominal rating is preferred: 2 x 1,450 hp = 2,162,530 W. [W]'s 1,500 hp gives 2,237,100 W.

Power curve for `powerFractionByAltitudeM` (DERIVED: hp / 1,490; altitude ft x 0.3048):

| Altitude ft (m) | Military hp | Fraction of 1,490 | WEP hp | Fraction of 1,490 |
| --- | --- | --- | --- | --- |
| 0 (0) | 1,310 | 0.879 | 1,490 | 1.000 |
| 7,500 (2,286) | n/a | | 1,580 | 1.060 |
| 8,550 (2,606) | 1,445 | 0.970 | n/a | |
| 14,100 (4,298) | n/a | | 1,470 | 0.987 |
| 15,100 (4,602) | 1,360 | 0.913 | n/a | |
| above 15,100 ft | no source | | no source | GAP (the model's last point would be ESTIMATE) |

The sheet does not say the ratings are the pilot's ram-corrected values. Which rating drives the speed table is also not stated: the "Maximum" rows at 246 mph SL and 291 mph at 16,400 ft line up with the military ratings, and the "War Emerg." rows (258 mph SL, 294 mph at 15,400 ft) with WEP. That mapping is an inference, not printed (ESTIMATE of the reading).

## 4. Performance

All at 23,500 lb [T] (PDF p. 177), sea-level test conditions not stated.

| Item | Value | Unit as printed | Metric | Source | Page | Read | Label |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Speed, "Maximum" | 246 mph (213 kt) at S.L. | mph | 109.97 m/s (246 x 0.44704) | [T] | p. 177 Speed box | 2026-09-29 | SOURCED |
| Speed, "War Emerg." | 258 mph (223 kt) at S.L. | mph | 115.34 m/s | [T] | p. 177 | 2026-09-29 | SOURCED |
| Speed, "Maximum" | 291 mph (252 kt) at 16,400 ft | mph | 130.09 m/s at 4,999 m (16,400 x 0.3048) | [T] | p. 177 | 2026-09-29 | SOURCED |
| Speed, "War Emerg." | 294 mph (255 kt) at 15,400 ft | mph | 131.43 m/s at 4,694 m | [T] | p. 177 | 2026-09-29 | SOURCED |
| Cruise at 75% Vmax | 176 mph (153 kt) at 1,500 ft | mph | 78.68 m/s | [T] | p. 177 (the same speed/altitude appears in the Range box) | 2026-09-29 | SOURCED (the "Economical" row is blank) |
| Speeds at other altitudes (5k, 10k, 20k, 25k ft) | not printed | | | | | | GAP: only SL and 15,400-16,400 ft |
| Climb, sea level | 1,665 ft/min | ft/min | 8.458 m/s (x 0.00508) | [T] | p. 177 Climb box | 2026-09-29 | SOURCED |
| Climb at 8,550 ft | 1,800 ft/min | ft/min | 9.144 m/s | [T] | p. 177 | 2026-09-29 | SOURCED |
| Time to 10,000 ft | 5.8 min | min | avg 1,724 ft/min (10,000 / 5.8) = 8.76 m/s | [T] | p. 177 | 2026-09-29 | SOURCED; the average is DERIVED |
| Time to 20,000 ft | 12.6 min | min | avg over 10-20k ft = 10,000 / 6.8 = 1,471 ft/min = 7.47 m/s | [T] | p. 177 | 2026-09-29 | SOURCED; the average is DERIVED |
| Service ceiling | 30,500 ft | ft | 9,296 m | [T] | p. 177 | 2026-09-29 | SOURCED |
| Service ceiling, [W] | 10,000 m (32,808 ft); [H] 32,810 ft | m | | [W], [H] | | 2026-09-29 | SOURCED (secondary), 7.6% above TAIC |
| Top speed, [W] | 485 km/h (301 mph, altitude not given); note field for max speed is blank | km/h | | [W] | Specifications | 2026-09-29 | SOURCED (secondary) |
| Top speed, [H] / [P] | 302 mph at 19,685 ft ([H]) or at 15,485 ft ([P]) | mph | 135.0 m/s | [H], [P] | text | 2026-09-29 | SOURCED (secondary); the two pages disagree on altitude; 302 is 3.7% above TAIC 291 |
| Time to 6,000 m, [W] | 13 min 13 s | | | [W] | Specifications | 2026-09-29 | SOURCED (secondary); TAIC's 12.6 min to 20,000 ft (6,096 m) is compatible |
| Cruise, [W] | 380 km/h | km/h | 105.6 m/s | [W] | Specifications | 2026-09-29 | SOURCED (secondary) |
| Range, [W] | 2,700 km | km | | [W] | Specifications | 2026-09-29 | SOURCED (secondary) |
| Range, [T] | 1,945 mi at 132 mph, 1,500 ft, 822 US gal, 440 lb bombs (max fuel); 1,635 mi at 133 mph, 691 US gal, 2,200 lb bombs | mi | | [T] | p. 177 Range box | 2026-09-29 | SOURCED |
| **Stall speed, clean** | **not found in any source** | | | | | | **GAP** |
| **Stall speed, gear and flaps down** | **not found** | | | | | | **GAP** |
| Take-off run, calm | 900 ft at 23,500 lb | ft | 274.3 m (900 x 0.3048) | [T] | p. 177 Take-off box | 2026-09-29 | SOURCED (surface, flap setting, power not stated) |
| Take-off run, 25 kt wind | 388 ft at 23,500 lb | ft | 118.3 m | [T] | p. 177 | 2026-09-29 | SOURCED |
| Take-off over 50 ft, landing over 50 ft | blank | | | [T] | p. 177 | | GAP |
| Lift-off speed | not found | | | | | | GAP |
| Original IJA spec (1936): take-off under 948 ft | 948 ft = 289 m | ft | | [H] | text | 2026-09-29 | SOURCED (secondary), a requirement, not a measurement |
| Dive limit, never-exceed speed | not found | | | | | | GAP |
| g limit | not found | | | | | | GAP |
| Roll rate | not found | | | | | | GAP |

Reading note: the TAIC Speed box is a dense scan. The rows and their columns were read from the page image on 2026-09-29 (not from OCR alone); the "Maximum" and "War Emerg." labels alternate, and the OCR merges them. Rows 3 and 4 have the two speeds only 3 mph apart at altitudes 1,000 ft apart, which fits a critical altitude near 15,000-16,000 ft.

Sanity check, ESTIMATE only, not a source: with the fleet's shared clMax of 1.4, S = 71.35 m2 and 10,659.4 kg, the stall is sqrt(2 x 10,659.4 x 9.80665 / (1.225 x 71.35 x 1.4)) = sqrt(1,708.5) = 41.3 m/s (92.5 mph, true airspeed at sea level). Do not enter it as a reference.

## 5. Gear and flaps

| Item | Value | Source | Read | Label |
| --- | --- | --- | --- | --- |
| Layout | Retractable main gear, tailwheel; mid-wing monoplane | [W] "retractable landing gear"; [H] "fully retractable undercarriage" (Ki-21-II) | 2026-09-29 | SOURCED (secondary) |
| Main-gear retraction direction | "main under-carriage legs retracted forward into the two engine nacelles" | [A] | 2026-09-29 | SOURCED (secondary, one source) |
| Nacelle stowage of the Model II | [A]: the larger Ha-101 nacelles "completely enclosed the retracted landing wheels in the earlier machines, the wheels were left partly exposed"; [H]: the bigger engine "allowed Mitsubishi to give the aircraft a fully retractable undercarriage". These two contradict each other | [A], [H] | 2026-09-29 | CONFLICT (see risks) |
| Main wheels enlarged on Ki-21-Ic | to absorb more weight | [W], [H] | 2026-09-29 | SOURCED (secondary), a different variant |
| Retract time | not found | | | GAP (ESTIMATE if used) |
| Wheel/leg dimensions, track, tailwheel geometry, whether the tailwheel retracts or steers | not found | | | GAP |
| Flap type and travel time | not found; larger flaps came with the Ki-21-Ib ([W]) | [W] | 2026-09-29 | GAP |

## 6. Carrier suitability and AI limits

The Ki-21 is an Army heavy bomber with no carrier role: `carrierCapable: false`. No source read states a carrier suitability; this is historical knowledge, not a document (label the D3 answer as Mark's ruling, as the B-17 did). No source states an AI-relevant maneuver limit; recommend `excludedManeuvers` stay empty (D13: nothing without a source). The Ki-21 was flown as a level bomber in every source read.

## 7. Armament and payload

Guns and turrets are out of scope for the spec (no combat block, no turrets). For the record, [W]: 5 x 7.7 mm Type 89 flexible (nose, ventral, beam and tail) and 1 x 12.7 mm Ho-103 in the pedal-operated dorsal turret. [A] adds that the IIb tail gun was a remotely controlled stinger, and [H] says two beam guns; the gun-position count differs between pages. Nothing in this dossier needs a gun figure.

| Item | Value | Unit as printed | Source | Page | Read | Label |
| --- | --- | --- | --- | --- | --- | --- |
| TAIC bomb loads | Normal 16 x 50 kg (1,760 lb); or 9 x 100 kg (1,980 lb); or 4 x 250 kg (2,200 lb); or 2 x 500 kg (2,200 lb) (row labels "Normal" and "Maximum" are misaligned in the scan; the two upper rows show one 2 x 500 kg entry each) | kg, lb | [T] | PDF p. 177 Bombs-Cargo box | 2026-09-29 | SOURCED |
| Bomb load, normal / maximum | 750 kg (1,653 lb) / 1,000 kg (2,205 lb) | kg | [A] | text | 2026-09-29 | SOURCED (secondary) |
| Bomb load, [W] | 1,000 kg | kg | [W] | Specifications | 2026-09-29 | SOURCED (secondary) |
| External racks | four 50 kg bombs (with the bomb-bay fuel tank) | kg | [T] General Data; [W] on the Ki-21-Ic | p. 177 | 2026-09-29 | SOURCED |
| Bay | ventral bomb bay under the wing center section | [H] | 2026-09-29 | SOURCED (secondary) |

For D7 (bay-carried bombs, up to 8 racks): a recommended normal load per [T] is 16 x 50 kg or 4 x 250 kg; a 250 kg store would be new (the repo has `an-m65`, 453.6 kg, only), so the store choice needs Mark's decision. The load is internal; say so in the source line.

## 8. Variant and model

- Recommended variant: **Ki-21-IIb** (Army Type 97 Heavy Bomber Model 2B, 688 built, Allied "Sally 3", briefly "Gwen"): Ha-101, larger horizontal tail, pedal-operated dorsal turret in place of the IIa's dorsal greenhouse ([W], [H]).
- The TAIC sheet covers "SALLY 2" and says the turret version was wrongly called Sally 3, so its figures apply to the IIa and IIb alike. The two have the same engine; the IIb's changes were a canopy, a turret and more fuel ([W]), so differences in mass and speed between them are not sourced.
- Ki-21-I (Ha-5, 850 hp) figures on [H]/[A] pages are a different variant: do not mix (empty 10,342 lb, 268 mph at 13,125 ft, and a 4.35 m height belong to the Ki-21-I).
- **The model is not a Sketchfab download.** `content/aircraft/ki-21-sally.glb` is an original Blender model, `tools/models/blender/ki-21-sally.py`, entry `tools/models/entries/ki-21-sally.json` (license AGPL-3.0-or-later per ASSETS.md). Its header cites Wikipedia's Ki-21-IIb column: span 22.5 m, length 16 m, wing area 69.9 m2, 3-bladed props, one dorsal turret (Turret1). It depicts the IIb. `tests/tools/models/aircraftDimensions.test.ts` cites 22.5 x 16.0 m at 1% tolerance, read 2026-09-27, from the same Wikipedia page.
- Model nodes (from the entry's `keep` list): `Prop1`, `Prop2` (pivots at z -3.6 and +3.6, axis +x), `GearL`, `GearR` (axis +z), `Turret1` (axis +y). The tailwheel is static and not rigged. The script's ESTIMATE for the gear says the main gear retracts **aft** into the nacelles, which [A] contradicts (forward).
- Model prop diameter is 3.4 m (ESTIMATE in the script header); [T] prints 11.1 ft = 3.383 m, so the script's number can now be labeled SOURCED to within 0.5%.

---

## Recommended reference block

Source string to give it: "TAIC Manual No. 1, Sally 2 sheet 551A, December 1944, archive.org item japanese-aircraft-performance-characteristics-taic-manual, read 2026-09-29".

**testMassKg = 10,659.4** (23,500 lb, [T] gross "Normal Bomber", DERIVED conversion; the weight every figure below was tabulated at).

| Field | Value | Basis | Label |
| --- | --- | --- | --- |
| `topSpeedByAltitudeM` (military "Maximum" rows) | [0, 109.97], [4999, 130.09] | 246 mph SL; 291 mph at 16,400 ft | SOURCED (reading as military rating is an inference) |
| `topSpeedByAltitudeM` (WEP rows, alternative) | [0, 115.34], [4694, 131.43] | 258 mph SL; 294 mph at 15,400 ft | SOURCED |
| `topSpeedMps`, `topSpeedAltitudeM` | 130.09, 4999 (military) | 291 mph at 16,400 ft | SOURCED |
| `climbRateMps` (SL) | 8.458 | 1,665 ft/min | SOURCED |
| `climbRateByAltitudeM` | [2606, 9.144] | 1,800 ft/min at 8,550 ft | SOURCED |
| Climb-time cross-checks | 5.8 min to 10,000 ft (3,048 m); 12.6 min to 20,000 ft (6,096 m) | avg 8.76 and 7.47 m/s | SOURCED, averages DERIVED |
| `takeoffDistanceM` | 274.3 | 900 ft calm, 23,500 lb; conditions unstated | SOURCED, low confidence (no surface, flaps, power) |
| `stallSpeedMps`, `stallSpeedFlapMps` | none | | **NO SOURCE: ESTIMATE, or omit and grade by direction card** |
| `rollRateDegPerSec` | none | | **NO SOURCE: ESTIMATE** |
| `limits.diveSpeedMps`, `gLimit` | none | | **NO SOURCE: ESTIMATE** |
| `engine.maxPowerW` | 2,222,186 | 2 x 1,490 hp x 745.7 | DERIVED, power is a sum |
| `powerFractionByAltitudeM` | [0, 0.879], [2606, 0.970], [4602, 0.913] (military, / 1,490); WEP [0, 1.0], [2286, 1.060], [4298, 0.987] | Section 3 | DERIVED; above 4,602 m ESTIMATE (an ESTIMATE last point near the 9,296 m ceiling) |
| `geometry.wingAreaM2`, `wingSpanM` | 71.35, 22.71 (TAIC) or 69.9, 22.5 (Wikipedia; the model and its test use these) | Section 1 | SOURCED; pick one and name it |
| `mass.emptyKg` | 6,070 | [W] | SOURCED (secondary) |
| `mass.maxTakeoffKg` | 10,610 (23,391 lb, [H]) | | SOURCED (secondary); TAIC has none |
| `mass.fuelCapacityKg` | 1,883 (691 gal internal) or 2,240 (822 gal with bay tank) | 0.72 kg/L | DERIVED; density ESTIMATE |
| `gear.travelSeconds`, `flap.travelSeconds` | none | | **NO SOURCE: ESTIMATE** |
| `flap.clIncrement` | needs both stalls | | **NO SOURCE: ESTIMATE** (cannot be derived by the Zero's method) |
| Gear geometry, tailwheel steering, `tailLiftSpeedMps` | none for the real aircraft | | measured from the drawn model or ESTIMATE, as in D5 |
| Lift curve, rates, weathercock, autoRudder, stallLimiter, cySlope, oswaldE | none | | fleet ESTIMATES |

Fields of the flight fit that have NO source and must be ESTIMATE: stall speed clean, stall speed with gear and flaps, lift-off speed, roll rate, dive limit, g limit, gear and flap travel times, flap lift increment, power above 15,100 ft, top speed and climb at more than one altitude band above 16,400 ft, and any speeds or climbs at 5,000, 10,000, 20,000 or 25,000 ft.

## Gaps and risks

1. **No stall speed of any kind.** The flap increment, `stallSpeedMps` and the ground unstick check have nothing to grade against. A direction card (as the Zero's take-off) is the only honest option. A first-principles estimate (about 92 mph TAS, clMax 1.4) is ours, not a source.
2. **Only two speed altitudes** (sea level and about 16,000 ft) in the one primary table, and one climb rate per altitude at two altitudes. The mid-altitude shape of the fit is unconstrained by data.
3. **Provenance of the TAIC numbers is unstated** (flown, computed or supplied by Japanese sources), and the table's "Maximum" versus "War Emerg." mapping to military versus WEP power is inferred. The sheet also carries an error (Designation "Ki 57" on a Ki-21 sheet; Ki-57 is the transport development).
4. **Ha-102 versus Ha-101:** the brief is wrong on the engine; TAIC, Wikipedia and historyofwar say Ha-101. Rating disagrees between sources: 1,490 hp (TAIC), 1,450 hp (TAIC nominal, all-aero), 1,500 hp (Wikipedia, historyofwar). Pick 1,490 hp take-off for a documented figure, and say so.
5. **Conflicting top speeds:** TAIC 291 mph (military) and 294 mph (WEP) versus 302 mph and 485 km/h in Wikipedia, historyofwar and pacificwrecks (altitude given as 15,485 ft by one and 19,685 ft by another). TAIC wins as the only document with a stated weight.
6. **Conflicting service ceiling:** 30,500 ft (TAIC) versus 10,000 m / 32,810 ft.
7. **Conflicting gross weight:** 23,500 lb (TAIC, 10,659 kg), 10,600 kg (Wikipedia), 21,407 lb loaded and 23,391 lb maximum (historyofwar). TAIC's empty weight is blank, so `emptyKg` (6,070) comes from a secondary source at a different loading.
8. **Take-off run has no stated conditions** (surface, flaps, power, sea level or not); do not grade it to a percent, treat as direction only. No lift-off speed exists.
9. **Gear retraction direction and nacelle stowage:** all-aero says forward and partly exposed wheels; the model script says aft; historyofwar says fully retractable. One secondary source each; the drawn model may need a check before the T1 gear block is measured.
10. **No sweep, dihedral, chord, retract times, flap data, dive limit, g limit, roll rate.**
11. **Variant mixing risk:** historyofwar and all-aero pages carry Ki-21-I data beside Ki-21-II data (Ha-5 versus Ha-101 engines, 4.35 versus 4.85 m height). The TAIC sheet is IIa/IIb only.
12. **Site access:** wwiiaircraftperformance.org index pages under /japan/ return 403 to curl (2026-09-29); its home page lists no Ki-21 document, so no primary source was missed by this, but a subpage could exist unlinked.
13. Repo-side: the model script and dimensions test cite Wikipedia's 69.9 m2 and the ESTIMATE 3.4 m propeller; TAIC's 768 sq ft (71.35 m2, +2.1%) and 11.1 ft prop can replace them if Mark prefers a primary source, at the cost of changing the tested dimensions.

## Sources read (all 2026-09-29)

- USAAF Technical Air Intelligence Center, "Japanese Aircraft Performance and Characteristics", TAIC Manual No. 1 (data sheets dated December 1944): https://archive.org/details/japanese-aircraft-performance-characteristics-taic-manual (PDF https://archive.org/download/japanese-aircraft-performance-characteristics-taic-manual/p4013coll8_4531.pdf, OCR https://archive.org/download/japanese-aircraft-performance-characteristics-taic-manual/p4013coll8_4531_djvu.txt). Read: PDF pp. 4-5 (index), 16, 19, 177 (Sally 2 sheet, from the page image), 179 (three-view), 216 and 222 (engine sheets), 271.
- English Wikipedia, "Mitsubishi Ki-21", raw wikitext: https://en.wikipedia.org/wiki/Mitsubishi_Ki-21 (via https://en.wikipedia.org/w/index.php?title=Mitsubishi_Ki-21&action=raw).
- historyofwar.org, "Mitsubishi Ki-21 'Sally'": https://www.historyofwar.org/articles/weapons_mitsubishi_ki-21.html
- All Aero, "Mitsubishi Ki-21 / Type 97": https://all-aero.com/2025/02/19/mitsubishi-ki-21-type-97/
- Pacific Wrecks, technical information: https://pacificwrecks.com/aircraft/ki-21/tech.html
- wwiiaircraftperformance.org home page (index only, no Ki-21 document): https://www.wwiiaircraftperformance.org/
- Search results (WebSearch summaries only, not opened as pages, used only where marked): migflug.com/aircraft/ki-21-sally, militaryfactory.com aircraft 558.
- Repo files: `docs/aircraft.md`, `content/aircraft/a6m2-zero.json`, `content/aircraft/f6f-hellcat.json` (not opened; the Zero's format followed), `git show worktree-b17-onboard:content/aircraft/b-17-flying-fortress.json`, `tests/tools/models/aircraftDimensions.test.ts`, `tools/models/entries/ki-21-sally.json`, `tools/models/blender/ki-21-sally.py`, `content/library/ki-21-sally.json`, `ASSETS.md`.
- Not found or not readable: Japanese Wikipedia (raw fetch returned a Wikimedia error page), any USAAF or US Navy flight-test report on a captured Ki-21, any Pilot's Flight Operating Instructions.
