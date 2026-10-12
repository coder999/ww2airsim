# C3 four-family procedural cockpits: plan (2026-10-11)

> **As-built update, 2026-10-12:** the live systems, enrollment and four-family coordinate plan below
> remain in force, but the final visual layer is texture-backed. Mark approved one polished
> American-fighter checkpoint and rejected the flat procedural approximation; that approved art is
> now the literal powered-off fascia, with three aligned family derivatives. Code draws only the
> changing needles, bars, radar, attitude ball, heading tape, configuration lamps and armament totals.
> The radar occupies the common central game-aid well. Lamp colours describe state consistently:
> dark retracted, amber transit/partial, green deployed/locked, red reserved for a real fault.

MASTER_PLAN Track C3 replaces the universal cockpit with four readable procedural families while
keeping aircraft-specific equipment honest and adding a deterministic indicated-RPM signal.

## Header

- **Branch:** `c3-cockpits`, worktree `/home/mark/projects/ww2airsim-c3-cockpits`, cut from
  `main` at `ee3d73da`.
- **Viewing checkpoint:** final product only: matched 1440p captures of the four families plus a
  fourteen-aircraft substitution contact sheet.
- **Run:** unattended, to completion.
- **Heavy jobs:** focused deterministic tests may run locally; the complete gate runs on ryzen as
  `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify`. WebGPU captures run on ryzen.
- **Delivery:** commit and push this branch. Do not deploy or merge to `main`.

## Rulings (Mark, 2026-10-11)

- Build four game-readable cockpit families: American fighter, American bomber, Japanese fighter
  and Japanese bomber. Do not build fourteen literal interiors.
- Keep stable instrument zones within each family. Aircraft-specific gear, hook, bay, sight and RPM
  presentations substitute into reserved cells instead of rearranging the panel.
- Japanese faces use period-appropriate metric units and Japanese labels; American faces use the
  existing imperial conventions. Internal simulation stays SI.
- Fit the reflector sight only when the pilot fires fixed forward guns. Keep the radar as a clearly
  separate clip-on game aid rather than pretending it is historical panel equipment.
- Add RPM as deterministic indicated state with a short lag and engine-output/damage response. It
  does not feed back into thrust, fuel, propeller efficiency or any other flight behavior.
- Stage 2 modeled interiors remain dropped. C3 includes fascia, coaming, simple frame/canopy-bow
  geometry and instruments, not seats, controls, sidewalls or clickable systems.

## Enrollment

| Family | Aircraft |
| --- | --- |
| American fighter | F4F, F6F, F4U, P-38 |
| American bomber | TBM-3, B-17, B-29 |
| Japanese fighter | A6M2, Ki-43, Ki-84 |
| Japanese bomber | D3A2, B5N2, G4M1, Ki-21 |

The table is code data, not a runtime inference from side, role or model name. A flyable aircraft
added without an enrollment must fail a test. The P-38 presents two RPM needles but, until separate
P-38 engine hit zones exist, both follow its one aggregate damage/output signal.

## Architecture

`cockpitLayouts.ts` owns four immutable base layouts, their instrument zones, frame members, unit
profile and radar mount. A complete aircraft-id table attaches the small per-airframe patch: family,
fixed-gun sight, gear/hook/bay cells and engine-count presentation. `panel.ts` remains one builder and
one updater that consume this data; there are no family-specific copies of `createPanel`.

Gauge definitions separate the SI source value from face conversion, range, ticks and printed unit.
American and Japanese profiles can therefore drive the same backing state without changing flight
physics. Japanese glyphs use a bundled, license-recorded font asset (or a deterministic generated
atlas if that proves smaller); operating-system CJK fallback is not an acceptance path.

Engine content gains explicit `count`, `idleRpm` and `ratedRpm`. `AircraftState.engineRpm` is an
immutable vector sized by the active spec during stepping. Each value approaches a throttle-derived
target with one fixed time constant and is multiplied by the same deterministic per-engine output
that drives damage and sound; cutout/dead output therefore winds the needle down. The transient
per-engine output already calculated in `loop.ts` is carried through `damagedSpec` to `step`. Direct
`step` callers get healthy output. A shorter output vector is repeated only for explicitly aggregate
content such as the P-38. RPM is replay/interpolation-safe state but is excluded from the existing
position/speed flight golden, because it cannot affect that trajectory.

## Tasks

1. Save the approved design and this plan; email both as HTML with `tools/mail-doc.py` (record the
   host quota blocker if `msmtp` still cannot create its temporary file).
2. Add failing catalog tests that pin exactly four layouts, all fourteen aircraft enrollments and
   the gear/hook/bay/fixed-gun/RPM substitutions against content rather than duplicated assertions.
3. Add engine-schema and RPM behavior tests: valid count/ranges, deterministic lag, throttle
   response, independent multi-engine output, dead/cutout wind-down and aggregate P-38 fallback.
4. Add `count`, `idleRpm` and `ratedRpm` to the engine schema and all fourteen aircraft specs, with
   source notes for the chosen operating ranges; keep them display-only.
5. Thread per-engine output through the transient spec seam and implement finite deterministic RPM
   stepping in `AircraftState`, including initialization and replay/interpolation handling.
6. Introduce the four-layout catalog and complete aircraft enrollment table. Derive conditional
   cells from real spec capabilities and fixed pilot-gun data, failing closed for unknown ids.
7. Generalize gauges into imperial and metric face profiles; add RPM and restore turn/slip to the
   cockpit. Keep every working needle backed by live state and every inset in its face's unit.
8. Refactor the single panel builder/updater to consume the catalog: stable primary, engine, status
   and combat zones; one/two/four-needle RPM; conditional gear/hook/bay cells; conditional sight;
   common clip-on radar.
9. Add the four procedural silhouettes—fighter/bomber fascia, coaming, windscreen posts and canopy
   bow—and bundle/license the deterministic Japanese glyph asset. Preserve the 3:2 minimum viewport,
   eye points, sight line and existing radar controls.
10. Update `docs/aircraft.md`, asset/license records and `MASTER_PLAN.md` C3 with the four-family
    ruling, simplified RPM contract, completed roster and explicit deferrals.
11. Run focused catalog, schema, flight, replay, panel and WebGPU tests; then run
    `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify` on ryzen.
12. Capture matched 1440p examples of the four families and a fourteen-aircraft substitution sheet
    on ryzen. Inspect legibility, occlusion, units, glyphs and conditional equipment; fix defects.
13. Write and email the dated handoff with test/capture evidence, remaining risks and deferred scope.
    Commit coherent changes and push `c3-cockpits`; do not deploy or merge.

## Acceptance

- Exactly four base layouts serve all fourteen flyable specs, and a new flyable id cannot silently
  inherit a cockpit.
- Gear, hook, bay and reflector-sight cells agree with actual aircraft capability; the fixed-gear
  D3A has no gear indication and non-forward-gun bombers have no reflector sight.
- American gauges read imperial and Japanese gauges read metric with deterministic Japanese glyphs;
  representative conversions and printed units agree.
- RPM follows throttle with a deterministic lag, follows each available engine-output channel and
  cannot alter flight behavior. Replay reproduces the same needles.
- Radar behavior and range selection remain functional in a visibly separate clip-on housing.
- All useful instruments, frame members and the reticle remain readable at the 3:2 minimum viewport.
- Focused tests, the full ryzen gate and inspected four-family/all-aircraft captures pass.
