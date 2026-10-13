# PBY-5A Catalina and water operations handoff

**Date:** 2026-10-12  
**Branch:** `pby-5a-water-ops`  
**Design:** [`2026-10-12-pby-5a-water-operations-design.md`](../superpowers/specs/2026-10-12-pby-5a-water-operations-design.md)  
**Plan:** [`2026-10-12-pby-5a-water-operations.md`](../superpowers/plans/2026-10-12-pby-5a-water-operations.md)

## Result

The Consolidated PBY-5A Catalina is a fifteenth flyable aircraft and the first
one that can operate from both runways and open water. It has an original,
procedurally built Blender model; retractable tricycle gear; separately rigged
wingtip floats; an American-bomber cockpit without a reflector sight; four
AN-M65 bomb stations; and an alternate pair of Mk 13 torpedo stations.

The shipped **Catalina Water Qualification** begins afloat in San Pedro Bay.
It teaches a straight displacement/planing run, water takeoff, circuit, gear-up
and floats-down landing configuration, open-water touchdown and stop. It is a
fictional qualification informed by the wartime handbook, not a reconstructed
combat sortie.

## Sources and historical scope

- *Pilot's Handbook of Flight Operating Instructions, Navy Model PBY-5A
  Airplanes*, AN 01-5MA-1, revised 20 January 1945: 63 ft 10 in length,
  104 ft span, R-1830-92 engines, 55-knot clean stall, 75–80-knot water
  takeoff and 76–83-knot water approach guidance.
- *Handbook of Erection and Maintenance Instructions, Navy Models PBY-5 and
  PBY-5A*, AN 01-5MA-2, 15 May 1945: Figure 1 and station geometry, hull,
  floats, gear, propellers, armament installations, bomb and torpedo loads.
- *Naval Aviation Squadron Histories, Volume 2*, VPB-33: PBY-5A assignment
  and the squadron's move to Leyte on 23 October 1944.

The United States government manuals are public domain. Their scans remain in
ignored scratch storage; source names, pages and measurements are recorded in
the model script, content records and `ASSETS.md`. The blue/gray scheme is
VPB-33-inspired but does not claim one exact bureau number.

## What changed

- `AircraftSpec.waterOperations` opts an airframe into hull support. Existing
  aircraft remain on the original terminal ditch/crash path.
- `src/sim/waterOperations.ts` owns safe arrival, displacement-to-planing
  drag, rest/planing attitude, low-speed rudder steering, float/gear gates and
  takeoff separation. It uses flat sea level; rendered waves do not move the
  physics plane.
- Scenarios can author `afloatAt`. World construction derives the hull height,
  rest pitch, zero velocity, gear-up and floats-down state from the spec.
- Landing reports use `{ kind: 'water', id: 'open-water', name: 'Open water' }`.
  Missions can require open-water takeoff and landing without confusing either
  with an airfield or carrier recovery.
- `torpedoRacks` gives one aircraft different bomb and torpedo station sets.
  `sortieBundle` swaps only the selected player's effective rack layout.
- `FloatL` and `FloatR` are independent airframe-rig parts. The current control
  compromise drives them through `flapFraction`; the PBY has no aerodynamic
  flap lift increment and the HUD/bench calls the control **FLOATS**.
- Defensive bow, blister and tunnel guns are static model detail. No
  `combat.gunners` entry claims that they aim or fire.
- The Range Test generator and every roster/catalog/ribbon/radio enrollment
  were refreshed so the new aircraft and mission cannot be silently omitted.

## Measured result

The committed GLB is 911,324 bytes, 28,408 model triangles and 17 model draw
calls (37,128 scene triangles and 21 scene calls with the displayed load).
The full Hangar test measured its lit/unlit response at 0.688× the Wildcat's,
inside the established 0.5–1.5× band. Gear, floats, propellers and stores all
changed the rendered frame, and WebGPU reported no validation errors.

At the handbook test point the deterministic card measured:

| Card | Model | Reference | Residual |
| --- | ---: | ---: | ---: |
| Top speed | 88.660 m/s | 87.610 m/s | +1.20% |
| Clean stall | 28.532 m/s | 28.294 m/s | +0.84% |
| Floats-down stall | 28.530 m/s | 28.294 m/s | +0.83% |
| Roll time | 18.000 s | 18.000 s | effectively zero |
| Climb | 5.963 m/s | 4.216 m/s | +41.44% |
| Runway takeoff roll | 500.8 m | 335.3 m | +49.36% |

The lift-curve slope is explicitly `FITTED` to the sourced 55-knot stall.
Climb and runway roll remain reported residuals of the simplified aggregate
flight model; no unrelated coefficient was distorted to conceal them. The
water integration test accelerates from displacement through planing and is
airborne above 10 m inside 60 simulated seconds.

## Reference-photo correction

The first post-merge visual review found two geometry errors: the bomb/torpedo
stations were too close to the hull, and the main-gear legs did not meet it.
The follow-up used the public-domain AN 01-5MA-2 maintenance manual alongside
the supplied PBY-5A torpedo photograph rather than preserving those estimates:

- pages 643-650 and Figure 291 describe two Mark 51-7 racks mounted fore/aft
  under each wing, slightly outboard of the wing-strut attachments. The model
  and spec now use one lateral station per wing with explicit 30%/62% chord
  stations instead of treating the four bombs as inner/outer pairs;
- Figures 296-298 place the alternate torpedo installation at wing Stations
  7-8. Both Mk 13 centerlines now share the outboard 6.75 m station, clear of
  the engines and outside the strut attachments;
- the parasol-strut upper attachments moved outboard to 6.20 m so the modeled
  order matches the manual: hull, engine, strut attachment, then store station;
- the cited 16 ft 9 in main-wheel tread is unchanged, but each main assembly is
  now a triangular yoke rooted in a hull-side trunnion/recess. Its 100-degree
  rigid animation is still an estimate, and passes both rise/inboard-motion and
  retracted-surface containment checks.

`StoreMountSchema.chordFraction` is the general content hook for genuinely
distinct fore/aft wing stations. `models:mounts` continues to fit the vertical
position and clearance against the generated GLB. A PBY-specific regression
pins the paired rack order and requires all six store positions to remain
outboard of the modeled strut attachments.

Follow-up verification: typecheck and targeted zero-warning lint passed; the
Blender entry rebuilt byte-identically; the complete shared mount/rig run passed
all 608 checks (including the 22 PBY rig and two PBY mount checks); and the full
four-view PBY capture checkpoint passed in 43.3 seconds with no validation or
console errors. The corrected GLB is 925,340 bytes, 28,648 triangles and 17
draw calls.

## Captures

- [Gear and floats down, four bombs](captures/2026-10-12-pby-5a/pby-5a-hangar-gear-floats-down-bombs.png)
- [Clean side profile](captures/2026-10-12-pby-5a/pby-5a-hangar-clean-side.png)
- [Afloat with two Mk 13 torpedoes](captures/2026-10-12-pby-5a/pby-5a-afloat-torpedoes.png)
- [Water takeoff with torpedoes](captures/2026-10-12-pby-5a/pby-5a-water-takeoff-torpedoes.png)

## Verification

- Focused deterministic water/scenario/sortie suites: 160 passed.
- Water takeoff integration: 7 passed.
- Shared wheel-ground conformance: 187 passed.
- Graded flight cards: 185 passed, 11 intentionally skipped.
- Stale-enrollment repair set (radio, ribbon, title/sortie rosters, Range Test,
  Hangar catalog, damage roster, mission schema and torpedoes): 199 passed.
- Browser, Nexus Radeon 680M correctness path:
  - Catalina water start/takeoff/float retraction: 1 passed (56.9 s);
  - Catalina runway takeoff and bomb release via `flyableAll`: 1 passed;
  - full Hangar: 26 passed (9.3 min);
  - final capture tool: 1 passed.
- Final post-merge `npm run verify`: 434 test files passed; 6,370 tests passed
  and 12 skipped.

No budget-titled browser spec was changed or run. The browser checks above are
correctness tests; the repository continues to require exclusive
`hwlock ryzen-budget` only for budget measurements, while `remote-run` takes a
shared claim so CPU work cannot overlap one.

### Tests updated

- Added canonical water contact/takeoff coverage and the live browser water
  path; enrolled the PBY in ground conformance, graded cards, rig/geometry,
  cockpit, stores and all-flyables coverage.
- Updated pinned aircraft/mission/catalog/damage rosters, ribbon art, radio
  silence declarations and the generated Range Test scenarios.
- Generalized the torpedo fixture to test the effective alternate rack set,
  instead of assuming every torpedo is carried by the ordinary `bombs` loadout.
- Replaced the ground harness's stale fixed 40 m/s pull threshold with a value
  derived from each aircraft's stall speed; no airframe exemption was added.
- The post-merge gate also removed an unused B-17 panel fixture and corrected
  stale Catalina library-roster and alphabetical flyable-order expectations.

### Tests still valid

- Conventional-aircraft ditching, ground/deck contact, carrier trapping,
  existing torpedo entry/run/flooding, bomb release, replay determinism and
  all existing model budgets run unchanged.
- The PBY's land path uses the same shared conformance and `flyableAll` suites;
  water operation did not create a parallel wheel-flight harness.

### Known gaps

- No wave forces, spray forces, porpoising, current, anchoring or beaching.
- No AI taxi, takeoff or landing on water.
- Floats share the flap input until a dedicated control is justified.
- Defensive gun installations neither aim nor fire.
- No historical Catalina combat mission or PBY-5 flying-boat variant yet.

