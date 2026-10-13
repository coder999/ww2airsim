# PBY-5A Catalina and water operations design

**Date:** 2026-10-12  
**Owner:** Mark  
**Run:** `pby-5a-water-ops` worktree on nexus  
**Viewing checkpoints:** final product only; unattended until the final capture and handoff

## Goal

Add a flyable Consolidated PBY-5A Catalina, built as original Blender geometry
from public-domain United States Navy drawings, with bombs and Mk 13 torpedoes.
Add the reusable amphibious-aircraft mechanics needed to taxi, take off, land,
and come to rest on open water without changing the existing terminal ditching
behavior of conventional airplanes.

The PBY-5A is the first implementation because its retractable tricycle gear
lets it use the existing runway onboarding and flight-card machinery before
the water path is exercised. The later PBY-5 can reuse the model and water
contract while omitting the wheel gear.

## Decisions

Mark approved the recommended PBY-5A plan in conversation on 2026-10-12 and
explicitly required torpedoes. The following table records those decisions in
the `docs/aircraft.md` D1-D14 format.

| D | Decision |
| --- | --- |
| D1 | **PBY-5A Catalina**, 1944 Leyte configuration. VPB-33 operated the PBY-5A and moved to Leyte on 23 October 1944. |
| D2 | Allied. |
| D3 | Not carrier-capable. |
| D4 | Original procedural Blender model from the public-domain Navy AN 01-5MA-2 three-view and station diagrams. The later Wikimedia drawing is comparison-only and is not an input because it is CC BY-SA and acknowledges incorrect propeller spinners. |
| D5 | Retractable tricycle landing gear, measured from the Navy drawing; retractable wingtip floats are separate rigged water equipment. |
| D6 | Two Pratt & Whitney R-1830-92 engines, summed in the existing aggregate-power model, with two propeller and two RPM channels. |
| D7 | Four external wing racks. The first game loadouts are clean, four 1,000 lb AN-M65 bombs, and two Mk 13 torpedoes on the inboard pair. |
| D8 | Reuse the fleet's AN-M65 and Mk 13 store definitions. No new weapon physics. |
| D9 | Rack offsets are measured from the committed model and held by the mount-fit suite. |
| D10 | Primary references: AN 01-5MA-1 dated 20 January 1945 for flight performance and procedures; AN 01-5MA-2 dated 15 May 1945 for geometry, systems, armament installations, and finishes. |
| D11 | Draw the bow, two waist-blister, and tunnel gun installations as static visual detail. They neither aim nor fire in this release. There are no pilot-fired guns and no reflector sight. |
| D12 | American bomber procedural cockpit, two RPM indicators, gear indication, no hook, no bay-door control, and no reflector sight. Eye point is measured inside the Navy drawing's pilot enclosure. |
| D13 | Exclude acrobatics, split-S, and Immelmann behavior: AN 01-5MA-1 page 54 prohibits all acrobatics and limits the airplane to normal-flight maneuvers. AI water operation is deferred; existing airborne AI may still fly the type only where content opts in. |
| D14 | Add a Library card and picker availability. Ship a player-facing water-qualification mission, but no historical combat mission. Acceptance includes runway takeoff/landing, water taxi/takeoff/landing, both store fits, Hangar inspection, and the auto-discovered all-flyables E2E. |

## Primary source dossier

Both manuals were published by the United States government and are public
domain. Research copies are kept only in the ignored worktree scratch area;
the repository records citations and original measurements, not redistributed
scans.

- **AN 01-5MA-1, Pilot's Handbook of Flight Operating Instructions, Navy
  Model PBY-5A Airplanes, revised 20 January 1945.** Page 1: 63 ft 10 in
  length, 104 ft span, two R-1830-92 engines. Page 49: water taxiing requires
  more power because of constant water drag. Pages 51-52: 75 kn land takeoff,
  75-80 kn water takeoff, 27,300 lb rough-water and 34,500 lb smooth-water
  takeoff limits. Page 54: 55 kn clean stall and 58 kn dirty stall at 27,000
  lb; all acrobatics prohibited. Pages 56-59: water landing procedure,
  76-83 kn approach from 200 ft, no hot landings, landing gear up, floats
  down, and the same rough/smooth weight limits. Figure 64: takeoff, climb,
  and landing performance. Figures 65-68: speed, cruise, and engine charts.
- **AN 01-5MA-2, Handbook of Erection and Maintenance Instructions, Navy
  Models PBY-5 and PBY-5A, 15 May 1945.** Figure 1: primary three-view.
  Section I pages 1-4: 104 ft span, 63 ft 10 7/16 in overall length, 1,300 sq
  ft wing less ailerons, 100 sq ft ailerons, 30 ft 6 in stabilizer span,
  10 ft 2 1/2 in maximum hull width, 8 ft 4 in maximum hull height, NACA 21
  wing section, wing and tail settings, control travels, 16 ft 9 in main-gear
  tread, 89 ft 4 in float tread, 10 ft 3/8 in float length, two R-1830-92
  engines, 12 ft three-blade Hamilton-Standard propellers, and the hull/wing
  station diagrams. Section IV covers the gear, hull, floats, and systems;
  Section V pages 635-665 covers guns, bombs, torpedoes, and armor.
- **Naval Aviation Squadron histories, Volume 2, VPB-33:** PBY-5A received
  1 April 1942; squadron relocated to Leyte on 23 October 1944 under FAW-10.

All dimensions in the Blender script will be tagged `CITED`, `MEASURED`,
`DERIVED`, `FITTED`, or `ESTIMATE`. The script header will name the manual
page or figure for every cited station table.

## Water-capable content contract

`AircraftSpec` gains an optional strict `waterOperations` block. Its presence
means the airframe can be supported by its hull on water; its absence preserves
all existing behavior byte-for-byte.

The block stores only aircraft facts and explicit gameplay estimates:

- `hullDepthM`: body-origin-to-keel contact depth at the step;
- `floatHalfSpanM` and `floatDepthM`: stabilizing float contact geometry;
- `restPitchDeg`: displacement-rest attitude;
- `planingPitchDeg`: target pitch once on the step;
- `planingSpeedMps`: start of the displacement-to-planing blend;
- `takeoffSpeedMps`: sourced water liftoff target;
- `maxLandingSpeedMps` and `maxLandingSinkMps`: survivable water-arrival gates;
- `displacementDragCoeff`, `planingDragCoeff`, and
  `taxiYawRateDegPerSec`: measured/tuned game coefficients with `ESTIMATE`
  labels in the source string.

This block is deliberately optional rather than a new global airplane class.
The same ordinary PBY flight spec can therefore use wheels on land and its
hull on water. The pure PBY-5 later uses the same block and can add a no-wheel
gear representation in its own plan.

## Water support model

`src/sim/waterOperations.ts` owns the pure water-contact rules. It does not
sample terrain itself; callers pass the same `GroundUnder` classification used
by the wheel model.

1. **Arrival.** A water-capable aircraft with gear retracted is supportable
   when its keel is within contact tolerance, bank and pitch are safe, sink is
   below the content limit, and speed is below the content landing limit.
   Gear down on water is always unsupported. A conventional aircraft still
   reaches `contactOutcome` and records `ditched` or `destroyed` exactly as it
   does today.
2. **Buoyant rest.** A supported hull is projected to sea level plus its keel
   depth, using the same no-energy-gain posture as `restOnSurface`. Vertical
   sink becomes zero. The water is a still world-frame surface for this plan.
3. **Drag and planing.** Horizontal water drag opposes track. Its coefficient
   blends from the displacement value to the smaller planing value across the
   sourced planing region. It may null track in one step but never reverse it.
4. **Pitch and roll.** Below planing speed, pitch settles toward `restPitchDeg`;
   above it, pitch settles toward `planingPitchDeg`. Roll settles toward level;
   float geometry is represented by that restoring constraint, not a second
   rigid-body solver.
5. **Taxi steering.** Rudder input adds a bounded world-yaw rate at low speed,
   fading into ordinary aerodynamic authority as the airplane accelerates.
6. **Takeoff.** Support releases when the hull is separating vertically or
   the aircraft is above its water takeoff target with sufficient aerodynamic
   lift. No hidden launch impulse is applied.

The model intentionally omits individual waves, spray forces, porpoising,
crosswind weathervaning on the water, beaching, anchors, current, and damage
from a gear-down water landing beyond the existing crash result. Rendered
waves remain visual; flat sea level is the physics surface.

## Landing and mission semantics

`LandingAt` gains `{ kind: 'water', id: 'open-water', name: 'Open water' }`.
Landing tracking uses the hull contact point for a water-capable aircraft and
records rollout distance in the world frame. A complete water landing is a
safe supported touchdown followed by speed below the existing landed-speed
threshold. It can satisfy a mission destination `open-water` only; existing
`airfield` and `carrier` objectives remain unchanged.

The shipped `water-quals` mission starts the PBY-5A afloat in San Pedro Bay with
gear up and floats down. Its qualification is player-facing practice, not a
historical combat sortie. The flight can taxi, take off, circle, land, and
come to rest. Torpedoes remain selectable for this and other compatible
sorties; the qualification itself stays focused on the new water path.

## Aircraft and model

The Blender script uses the primary Figure 1 plan, elevation, and front view
for the silhouette. The station diagrams own hull and wing locations. Model
features required in the first release are:

- stepped boat hull, chines, bow, tail boom, high parasol wing, four struts;
- two nacelles and 12 ft three-blade propellers;
- tricycle landing gear and doors;
- retractable wingtip floats, rigged as `FloatL` and `FloatR`;
- ailerons, elevators, and rudder;
- bow, port/starboard waist-blister, and ventral tunnel gun installations as
  static visual detail;
- four underwing racks with two-torpedo and four-bomb loadouts;
- 1944 VPB-33-inspired blue/gray finish and U.S. national markings, with no
  claim that one exact bureau number is reproduced.

The model remains within an explicit triangle, draw-call, texture-size, and
byte budget. The external source drawing is never bundled. Comparison renders
include side, top, front, and three-quarter views plus silhouette overlays.

## Testing contract

New behavior is enrolled in existing suites rather than copied into a parallel
PBY-only harness.

- Schema rejection for incomplete/non-finite `waterOperations` content.
- Pure unit tests for safe and unsafe water arrivals, gear-down rejection,
  displacement drag, planing drag, taxi yaw, pitch/roll settling, rest, and
  separation.
- Regression proving an ordinary aircraft still ditches terminally and never
  gains water support.
- Landing tracking for open water plus recovery agreement with the mission
  engine.
- Flight-card enrollment using the 1945 Navy chart at 27,000 or 28,000 lb;
  deviations are reported and tolerances only reflect measured model error.
- Ground conformance, stance, center, eye point, combat fit, rig, float, and
  store-mount tests for the new model.
- Deterministic water qualification: afloat start, taxi turn, planing run,
  takeoff near 75-80 kn, stable circuit, 76-83 kn water touchdown, stop.
- Existing torpedo tests plus a PBY Mk 13 loadout/drop assertion; bombs remain
  covered by the all-flyables path.
- E2E Hangar and flyable-all runs, then a PBY water qualification run with
  final captures.
- Full `npm run verify`; budget-titled specs, if any, run only under the
  exclusive `ryzen-budget` lock. Correctness runs use the normal shared
  `remote-run` path.

Each added assertion must be seen failing for the intended reason before its
implementation. At closeout, reconcile every touched behavior with
`docs/testing.md`, remove superseded one-off tests, and update the standing
testing documentation rather than leaving the plan as the only test map.

## Definition of done

- The PBY-5A is selectable, documented, and visibly its own original model.
- It takes off and lands on both runway and water.
- It taxis and comes to rest on water with gear retracted; gear-down water
  contact crashes.
- Conventional aircraft retain terminal ditching and cannot taxi on water.
- The PBY carries and releases four AN-M65 bombs or two Mk 13 torpedoes.
- Its defensive gun installations are static and do not fire.
- Deterministic, model, and E2E suites pass; final captures are reviewed.
- Plan, source ledger, aircraft/model/testing docs, master ledger, and handoff
  match the merged behavior.

