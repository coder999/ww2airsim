# C3 — Four-family game cockpits: design

**Status:** implemented and visually approved, 2026-10-12  
**Worktree:** `/home/mark/projects/ww2airsim-c3-cockpits`, branch `c3-cockpits`  
**Viewing checkpoint:** final matched cockpit captures for all four layout families and the fourteen-aircraft contact sheet.  
**Run:** unattended, to completion.

## Goal

Replace the one universal procedural panel with four readable cockpit families—American fighter, American bomber, Japanese fighter and Japanese bomber—without expanding C3 into fourteen modeled interiors.

Each family owns one stable layout with named instrument zones. An aircraft selects that family and swaps conditional equipment into reserved slots. The master plan's count of twelve predates the TBM-3 Avenger and B5N2 Kate; the enrollment table covers the **fourteen** aircraft specs now in `content/aircraft/`.

## Fixed scope

- Stage 1 only. Stage 2 modeled cockpits remains dropped by the master-plan ruling.
- Four authored raster fascias at one shared live-instrument coordinate system, with procedural/live
  needles, bars, lamps, scope, attitude ball, heading tape and armament values.
- No exterior-model replacement, flight-model change, engine simulation, new weapon behavior or clickable cockpit.
- The four silhouettes and national styles are source-led, but this is a readable game panel rather than a museum-grade replica.
- Existing eye points, camera behavior, gunsight ballistics and the 3:2 minimum viewport remain contracts.

## What belongs in the cockpit

The cockpit is divided into three visibly different layers. This distinction is the design's central ruling.

### 1. Flying panel

These are period-style instruments placed in the same primary-flight zone in every family. The stable zone is more important than reproducing fourteen literal panels: switching aircraft should not make the player hunt for the altimeter.

| Instrument | Backing signal | C3 rule |
| --- | --- | --- |
| Airspeed | air-relative velocity | Every aircraft. Face scale follows the units ruling below. |
| Altimeter | world altitude | Every aircraft. |
| Rate of climb | vertical velocity | Every aircraft. |
| Compass / heading | attitude | Every aircraft; use a round compass or heading indicator styled for the family, not the current universal tape. |
| Turn-and-slip | attitude/velocity (`slip` already exists) | Every aircraft. The current cockpit hides a gauge the simulation already drives; C3 restores it. |
| Attitude indicator | attitude | Every aircraft. This is an explicit game simplification for cloud flying, not a claim that every source panel carried the same instrument. |
| Fuel quantity | fuel mass and spec capacity | Every aircraft, with the face/capacity appropriate to the unit family. |
| Engine RPM | throttle, engine output and new rated-RPM content | Every aircraft. One needle for a fighter; paired or four-needle presentation for a multi-engine bomber. See "RPM model" below. |

The existing digital readouts are a legibility aid, not period hardware. C3 keeps small inset values in the same unit as the analog face; the chase-view flight-data strip remains the common imperial accessibility view.

### 2. Aircraft controls and status

These are conditional. An airplane does not receive an indicator for equipment it does not have.

| Item | Condition | C3 representation |
| --- | --- | --- |
| Throttle | every aircraft | A full-height `ENGINE`/`出力` power column driven by `Controls.throttle`. |
| Landing gear | retractable gear only | Dark retracted, amber in transit, green down/locked. The fixed-gear D3A has no gear light. |
| Flaps | every current spec | Dark retracted, amber in transit/partial, green fully deployed, driven by `flapFraction`. |
| Arresting hook | carrier-capable aircraft | Dark up, green down/locked. Hook travel is instantaneous in the sim, so no invented amber phase. |
| Bomb-bay doors | `spec.bayDoors` | Dark shut, amber in transit/partial, green open, driven by `bayDoorFraction`. |
| Gunsight | pilot-fired fixed guns | Keep the existing ballistic reticle and sight line. Aircraft with no pilot-fired forward guns have no reflector sight. |
| Ammunition and stores | combat record available | Four fixed `AMMO/BOMB/RKT/TORP` (Japanese equivalents) cells show live totals; unsupported types show an em dash. |
| Other engine instruments | no honest backing signal | Do not fit working manifold-pressure, oil-pressure or temperature gauges. Empty screw holes, blank plates and placards may fill family-panel space; dead needles may not. |

Simple windscreen posts, canopy bow, coaming and panel side shoulders belong in C3 because they establish each cockpit's view and silhouette. Seats, pedals, sticks/yokes, sidewall systems, circuit breakers and full consoles do not: those cross into the dropped modeled-cockpit stage.

### 3. Game aids

The radar is a deliberate gameplay aid added so a player can reacquire a lost contact. It is not historical equipment for most of the roster and must no longer masquerade as a native instrument in every panel.

C3 preserves radar behavior and `Tab` range selection as a **standard common combat scope** in the
same central game-aid well on all four fascias. Its live green sweep and dimensions are common across
aircraft and visually distinct from the period-styled flying instruments. This is the same kind of
declared abstraction as the Steering cue and Impact marker: useful, stable and not evidence about the
real airplane.

The impact marker and steering cue remain scene/HUD assists and do not gain panel controls. The combat readout remains overlay text. C3 does not invent switches for any of them.

## Four layout families

Every family uses the same zone grammar:

1. **Primary flight:** airspeed, attitude, altitude, compass, climb and turn/slip.
2. **Engine:** RPM, throttle and fuel.
3. **Airframe status:** a fixed group of interchangeable cells for gear, flap, hook and bay.
4. **Combat:** reflector sight when the pilot has fixed forward guns; the common central radar well remains a declared game aid rather than historical equipment.

| Family | Aircraft | Visual identity |
| --- | --- | --- |
| American fighter | F4F, F6F, F4U, P-38 | Black/grey fascia, English labels, imperial faces, compact centered flight group and fighter coaming. P-38 uses a multi-engine RPM face without becoming a fifth family. |
| American bomber | TBM-3, B-17, B-29 | Wider panel and windscreen frame, pilot-side primary group, grouped multi-engine RPM where needed, larger conditional-status area. The Avenger keeps this family even though it has pilot-fired guns. |
| Japanese fighter | A6M2, Ki-43, Ki-84 | Compact dark fascia, metric faces and Japanese labels, tight central flight group and fighter coaming. |
| Japanese bomber | D3A2, B5N2, G4M1, Ki-21 | Wider metric panel, Japanese labels, grouped multi-engine RPM where needed and larger attack/status area. The Val remains here by role even though it has pilot-fired guns. |

This is intentionally a game taxonomy, not a claim that Navy and Army cockpits or a P-38 and Hellcat were identical.

## Aircraft enrollment and slot substitutions

| Aircraft | Family | Sight | Gear cell | Hook cell | Bay cell | RPM presentation |
| --- | --- | ---: | --- | --- | --- | --- |
| F4F-4 Wildcat | American fighter | yes | active | active | blank | single |
| F6F-5 Hellcat | American fighter | yes | active | active | blank | single |
| F4U-1D Corsair | American fighter | yes | active | active | blank | single |
| P-38 Lightning | American fighter | yes | active | blank | blank | paired |
| TBM-3 Avenger | American bomber | yes | active | active | active | single |
| B-17G Flying Fortress | American bomber | no | active | blank | active | four-needle |
| B-29 Superfortress | American bomber | no | active | blank | active | four-needle |
| A6M2 Zero | Japanese fighter | yes | active | active | blank | single |
| Ki-43-II Oscar | Japanese fighter | yes | active | blank | blank | single |
| Ki-84-Ia Frank | Japanese fighter | yes | active | blank | blank | single |
| D3A2 Val | Japanese bomber | yes | omitted (fixed gear) | active | blank | single |
| B5N2 Kate | Japanese bomber | no | active | active | blank | single |
| G4M1 Betty | Japanese bomber | no | active | blank | active | paired |
| Ki-21-IIb Sally | Japanese bomber | no | active | blank | active | paired |

## Units and labels (Mark, 2026-10-11)

- American faces: mph, feet, ft/min, US gallons and RPM.
- Japanese faces: km/h, meters, m/s, liters and RPM.
- Japanese faces use Japanese characters for the principal labels, with the exact glyphs checked against sources where possible. Provisional functional labels such as `速度` (speed), `高度` (altitude), `昇降` (climb/descent), `燃料` (fuel) and `回転` (revolutions) are not treated as source claims until that check is complete.
- Numeric insets use the face's own unit. The existing chase-view flight-data strip remains imperial and is the accessibility fallback.
- Internal simulation remains SI and aircraft JSON keys do not change.

For consistent rendering, C3 should bundle a small, license-recorded Japanese font subset rather than depend on whichever CJK font happens to exist on the player's operating system.

## RPM model

RPM is a modest addition, not a new flight model. The simulation already has throttle, deterministic per-engine output, engine count, damage, sputter/cutout windows and engine death. C3 adds only the indicated speed of each engine:

- add sourced `idleRpm` and `ratedRpm` to each aircraft engine definition;
- derive a target RPM from throttle while that engine produces output;
- use one deterministic first-order lag so a needle moves rather than teleports;
- fall toward zero in the same cutout/dead-engine windows that remove thrust and sound;
- expose one value for a single-engine aircraft and one per engine for a twin or four-engine aircraft;
- do **not** feed RPM back into thrust, propeller efficiency or fuel burn in C3.

This is explicitly simplified. It provides a live tachometer and makes engine damage visible without claiming constant-speed-propeller, mixture, boost or governor fidelity. Its state must be deterministic and replay-safe; a renderer-local animation is rejected because pause, replay and tests could disagree with the flight.

## Source standard

Each of the four family layouts records at least one cockpit-panel or pilot-manual source. Per-aircraft sources are still required for rated RPM and any conditional equipment not established by the aircraft spec. A source proves grouping, silhouette and the presence of an instrument, not simulated precision it never provides.

Preferred order:

1. wartime pilot's handbook or flight-operating instructions;
2. wartime technical manual, captured-aircraft report or official cockpit photograph;
3. museum-restored panel, with restoration changes named;
4. published cockpit arrangement reference, marked secondary.

Useful starting records already located include the 1944/45 US manuals indexed by AirCorps Library; the public TBM-3 Pilot's Handbook `AN 01-190EB-1`; the B-17 AAF pilot training manual; the B-29 airplane-commanders' manual; and the Japanese Type 1 Fighter operating manual held by Japan's National Diet Library. Exact page/figure citations are an implementation task and are acceptance data, not an invitation to approximate from a model-kit box.

## Architecture

- Add four pure base `cockpitLayout` definitions and a complete aircraft-id enrollment table. No layout choice is inferred from model names or side at runtime.
- A base layout selects one powered-off fascia asset, unit family and shared live-overlay coordinates. A small aircraft patch selects conditional cells and sight/RPM presentation; it does not restate the layout.
- Generalize the gauge conversion/face table so the same SI signal can drive an imperial or metric face without changing `sim/`.
- Build one panel implementation from the selected base layout and patch. Do not fork four copies of `createPanel`, much less fourteen.
- Put deterministic RPM state in the simulation/replay contract and thread per-engine output to the panel.
- Keep the live radar render target separate and attach it to the common central scope face.
- Preserve ballistic gunsight tests by selecting the sight conditionally, not by changing harmonization.

## Acceptance

1. Exactly four base layouts exist, and every current aircraft id is enrolled in one; adding a flyable spec fails until it is enrolled.
2. Conditional equipment matches the spec: fixed gear, carrier capability, bay doors and pilot-fired guns.
3. Every drawn working gauge has a real backing signal and the face's printed unit agrees with its conversion.
4. Japanese metric faces and labels render from the bundled font subset and agree numerically at representative values.
5. The radar remains functional and is visibly a common game-aid scope rather than a claimed historical instrument.
6. All readable elements stay inside the 3:2 viewport contract; frame members do not obscure the reticle or center flight group.
7. RPM follows throttle with a deterministic lag; each engine's needle shares its thrust/sound cutout and dead-engine state; replay reproduces it.
8. Matched 1440p cockpit captures cover the four base layouts, plus a contact sheet of all fourteen aircraft with their substitutions.
9. `remote-run npm run verify` and the focused cockpit/WebGPU suite pass. Heavy and GPU work follows `AGENTS.md` and runs on Ryzen.

## Explicitly deferred

- Manifold pressure, oil/fuel pressure, cylinder-head temperature, mixture, boost, propeller governor controls and engine synchronization.
- Full side consoles, yokes/sticks, pedals, seats and interior shells.
- Clickable controls, mouse interaction and startup procedures.
- Per-gun selectors, individual gun counters and clickable stores controls. C3 shows only aggregate live totals.
- Bombsights, torpedo sights, navigation tables and crew stations.
- Damage to individual instruments, night lighting and gauge illumination.

## Design checkpoint

Mark's 2026-10-11 checkpoint ruling simplifies C3 to four base cockpit families with fixed zones and per-aircraft slot substitutions. The polished checkpoint approved on 2026-10-12 is the literal American-fighter fascia source; three aligned family derivatives replace the rejected flat procedural reconstruction. Japanese panels use metric faces and Japanese labels; reflector sights appear only with pilot-fired forward guns. RPM joins C3 as the one deliberately simplified live engine instrument. Radar remains a common gameplay scope rather than a native historical instrument. Configuration lamps use state semantics across systems: dark retracted, amber transit/partial, green deployed/locked, with red reserved for a real fault.

Implementation proceeds unattended to the final four-family/contact-sheet checkpoint.
