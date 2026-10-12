# Handoff: C3 four-family cockpit dashboards (2026-10-11–12)

**Delivery:** the `c3-cockpits` worktree, cut from `main` at `ee3d73da`, was merged to `main`
as `77234878` on 2026-10-12; its worktree and local/remote branch were removed after verification.
**Plan:**
`docs/superpowers/plans/2026-10-11-c3-cockpit-families.md`. **Run:** unattended;
final-product checkpoint only. This work was not deployed.

## Product result

The former universal panel is now one builder driven by four explicit cockpit families:

| Family | Aircraft |
| --- | --- |
| American fighter | F4F, F6F, F4U, P-38 |
| American bomber | TBM-3, B-17, B-29 |
| Japanese fighter | A6M2, Ki-43, Ki-84 |
| Japanese bomber | D3A2, B5N2, G4M1, Ki-21 |

The enrollment table names all fourteen flyable ids and fails closed for an unknown aircraft. Each
family keeps a stable primary row, auxiliary row and status zone. Gear, hook and bay indications are
derived from the actual airframe capability, and the reflector sight appears only on explicitly
enrolled aircraft with pilot-fired forward guns. The common radar remains visually separate as the
same clip-on game aid used before C3.

Fighter and bomber families have different coaming crowns and proportions; American and Japanese
families have distinct, texture-backed fascia materials, fasteners, wear, service markings and
insignia. The approved art is the fixed dashboard while the live indicators remain deterministic
geometry on top. These are deliberately readable game cockpits, not literal interiors. Seats,
controls, sidewalls, clickable systems and fourteen modeled cockpits remain out of scope.

## Instruments and RPM

American faces retain mph, feet, feet/minute and US gallons. Japanese faces use km/h, metres, m/s
and litres, with Japanese labels throughout, including the throttle and fuel columns and their
empty/full marks. The glyph-limited Noto Sans JP SemiBold asset is loaded before canvas text is
rasterized, so the result does not depend on an operating-system CJK font. Its source, SIL OFL 1.1
license, 9,724-byte size and SHA-256 are recorded in `content/fonts/NOTICE.md` and `ASSETS.md`.

Every engine spec now supplies a count, idle RPM and rated RPM. `AircraftState.engineRpm` follows
throttle through a deterministic 0.45-second exponential lag and the existing per-engine damage
output channels. Negative-G cutout and a dead output wind a needle down. Single-engine aircraft use
the full-size RPM face. Dedicated multi-engine fascia variants omit that large face and bezel
entirely. One independent, numbered bezel per physical engine mounts directly to the surrounding
fascia: two larger bezels side-by-side for twins and a 2×2 bank of four for the B-17 and B-29. There
is no parent gauge and no rectangular cover plate. The P-38 has two physical
dials even though its aggregate damage output is repeated until its content gains separate engine
hit zones. This state is display-only: it has no path back into thrust, fuel, propeller efficiency,
control authority or any other flight term. The production fixed step reuses one precomputed blend
instead of evaluating the same exponential for every airplane on every tick.

The chase-view flight-data strip remains its compact pre-C3 set; slip and RPM are cockpit-only.

## Reference captures

These are the inspected 2560x1440 frames from headed Chromium on the Ryzen RX 6700 XT. The capture
suite launched every flyable aircraft, selected cockpit view, advanced throttle, asserted clean
WebGPU validation/console output and then built the contact sheet from those exact frames.

| View | Capture |
| --- | --- |
| American fighter, F6F | ![](captures/2026-10-11-c3-cockpit-families/american-fighter-f6f.png) |
| American bomber, B-17 | ![](captures/2026-10-11-c3-cockpit-families/american-bomber-b17.png) |
| Japanese fighter, A6M2 | ![](captures/2026-10-11-c3-cockpit-families/japanese-fighter-a6m2.png) |
| Japanese bomber, G4M | ![](captures/2026-10-11-c3-cockpit-families/japanese-bomber-g4m.png) |
| All 14 substitutions | ![](captures/2026-10-11-c3-cockpit-families/all-aircraft-contact-sheet.png) |

The final visual pass confirmed the family silhouette/palette differences, readable primary faces,
Japanese glyphs and units, conditional sight/status equipment, and one/two/four-engine RPM
presentation. The 2026-10-12 feedback pass replaced shared multi-needle RPM presentation with the
separate per-engine mini-dials described above. A subsequent visual re-evaluation found that the
first slot-based radar/horizon alignment check was self-referential and wrong. The final correction
measures each aperture across all four 1672×941 fascia assets and converts those literal pixel
centres/radii into panel coordinates, with a one/two-pixel lip overscan. Fresh full-size captures
confirm that both live faces now fill their painted openings. The final visual refinement moves the
horizon face down exactly one source-art pixel, with one additional pixel on the edited multi-engine
fascia variants, and replaces the preliminary clustered RPM treatment with the direct-mounted two-
or four-bezel arrangement described above.

## Test reconciliation

### Tests updated

- `cockpitLayouts.test.ts` enrolls all fourteen flyable aircraft, pins the four families and their
  imperial/metric labels, derives sight/gear/hook/bay equipment from each airframe, and asserts
  independent one/two/four-engine RPM bezels with no parent gauge or cover plate.
- `panel.test.ts`, `panelLayout.test.ts` and `cockpitFeedback.test.ts` replace the retired universal
  panel's three-dial, generic-band and procedural-bezel assumptions with the shipped five-instrument
  layout, visible-layer bounds, integrated configuration/armament bank, literal fascia-aperture
  registration and the final one-pixel multi-engine horizon offset.
- `gauges.test.ts` and `gaugeSamples.ts` enroll RPM and the Japanese metric profile. Schema, damage
  and `engineRpm.test.ts` cover engine count/ranges, independent damage output, deterministic lag,
  cutout wind-down and the display-only boundary.
- `cockpitFamiliesCapture.spec.ts` is an opt-in visual capture tool, not a screenshot oracle. It
  launches every flyable aircraft on the reference GPU, asserts clean WebGPU/console output and
  produces the four representative frames plus the fourteen-aircraft contact sheet above.

### Tests still valid

- The existing gunsight ballistics, gun-pipper, gunnery and impact-marker checks remain valid for
  enrolled forward-gun aircraft because C3 conditionally hides the sight but does not change its
  line, depression or ballistics.
- Approach and carrier checks still own the gear, flap and hook controls. C3 changes their cockpit
  presentation only; the simulation controls and transition state are unchanged.
- The chase-view flight-data assertions, including the compact `THR` label, remain intentionally
  valid because slip and RPM are cockpit-only and C3 does not change that strip.
- No `window.__ww2` diagnostic field, camera route or player control changed.

### Known gaps

- By repository policy there are no screenshot goldens. Automated tests pin geometry, enrollment,
  state and clean GPU execution; the committed full-resolution captures and Mark's approval are the
  evidence for texture finish, Japanese glyph appearance and perceptual alignment.
- The P-38 still repeats one aggregate damage-output channel across its two RPM instruments until
  separate engine hit zones are modeled. The two displays and their indicated lag are covered; the
  missing independent damage source is not disguised as a test skip.

## Verification

- `npm run typecheck` passes after the final implementation and capture-tool changes.
- Focused panel, layout, feedback, family enrollment and engine-RPM coverage passes 79/79 after the
  final multi-engine horizon registration and direct-mounted bezel changes.
- Nexus's real Radeon 680M preliminary capture passed 15/15 (fourteen aircraft plus contact sheet).
- The final, aperture-corrected and multi-engine-bezel headed Ryzen RX 6700 XT reference capture
  passed 15/15 in 1.8 minutes, with no WebGPU validation errors or captured page/console errors.
- The post-merge Ryzen RX 6700 XT reference-GPU capture passed the same 15/15 cases in 1.8 minutes
  from `main`.
- `git diff --check` passes.
- The required post-merge `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify` gate is fully green:
  typecheck, lint and dependency analysis pass; Vitest reports 430/430 files and 6,266 passed tests
  with 11 skipped. The two independent baseline assertions seen during the preliminary branch run
  had already been corrected on current `main`; no expectation was hidden, skipped or weakened for
  this merge.

## Delivery and remaining boundaries

The design, implementation plan and final handoff were delivered successfully through the
repository mail tool on 2026-10-12. All three documents are also committed in-repository as the
source of truth. The feature work is merged and pushed; the dedicated worktree and local/remote
branch are removed. Deployment remains a separate user decision.

Detailed historical face layouts, manifold/oil/temperature systems, propeller controls, clickable
switches and modeled interiors remain intentionally deferred. Japanese labels are functional,
period-flavoured game labels rather than a claim that every airframe carried these exact words,
fonts and placements.
