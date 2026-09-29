# DP1 handoff: first-generation aircraft (2026-09-29)

DP1 is the fourth plan of the model detail pass. The Ki-21 Sally, P-38 Lightning
and B-29 Superfortress were the last flat-shaded Blender aircraft. Each is now
rebuilt to the Ki-84's level of geometry (fine airfoil sections, framed
canopies, control surfaces, twisted propeller blades, exhausts, guns, wing-root
fillets, leg covers) and carries a 1024 px baked skin. The design is
[`2026-09-28-model-detail-pass-design.md`](../superpowers/specs/2026-09-28-model-detail-pass-design.md)
and the plan is
[`2026-09-28-dp1-aircraft.md`](../superpowers/plans/2026-09-28-dp1-aircraft.md).

The work is complete on branch `worktree-dp1-aircraft` and is **not merged**;
merging is Mark's call. Mark's decisions for the run (2026-09-28): DP1 only (the
Pennsylvania is "good enough for now"), checkpoint on the final product only,
unattended. Nothing under `src/sim` changed and no scenario changed. Every rig
node, pivot and overall dimension is unchanged.

## What shipped

- **Three rebuilt aircraft** and their entries (`"skin": true`, atlas 1024 px,
  budgets unchanged).
- **USAAF marking colors** (`tools/models/skin/colors.ts`): insignia blue,
  white and red, propeller-tip yellow, and olive drab for the P-38's anti-glare
  panel. All are ESTIMATES.
- **The `naturalMetal` finish** is now `metallic 0.25`, roughness 0.4
  (`tools/models/skin/surfaces.ts`). At `metallic 1` the P-38 measured 0.089x
  its flat luminance in the Hangar (near-black: no environment to reflect).
  Nothing else skinned used `naturalMetal`. The Hangar is the only place this
  was measured; the game's own environment lighting was not compared.
- **The flat-shaded allowlist** drops from 12 to 9.
- **Hangar checks 8 and 16** now also count pixels whose color changed
  (`changed01` in `masks()`). The Ki-21's wireframe (silhouette change 4.76%
  against the 5% threshold) and the P-38 and B-29 checkers (bright metal, so
  the mean luminance barely moves) failed on the metric, not on the model. The
  new numbers: wireframe 24.8-34.0% of pixels, checker 94-99% of pixels.

## The three aircraft

Bytes, triangles and draws are read from the committed glbs on 2026-09-29.

| Aircraft | Bytes | Triangles | % of tri budget | Draws | Flat predecessor triangles | Check 15 |
| --- | --- | --- | --- | --- | --- | --- |
| ki-21-sally | 1,018,988 | 31,532 | 31.5 | 6 | 1,856 | 1.011x |
| p-38-lightning | 1,025,016 | 33,836 | 56.4 | 6 | 1,728 | 0.738x |
| b-29-superfortress | 1,813,000 | 56,788 | 56.8 | 13 | 2,952 | 0.738x |

Budgets: Ki-21 and B-29 100,000 triangles and 5,000,000 B, P-38 60,000
triangles and 3,000,000 B, all 47 draws. The B-29 is close to its ceiling: do
not add detail without lowering `SEGMENTS`. Each glb rebuilds byte-identically
(built twice per aircraft).

## Mark's checkpoint

Every capture is in [`2026-09-28-dp1-shots/`](2026-09-28-dp1-shots/), also at
`https://github.com/Coder999/ww2airsim/blob/worktree-dp1-aircraft/docs/handoff/2026-09-28-dp1-shots/<file>`
(his work network blocks `*.marktuttle.dev`). Each aircraft has
`<id>-three-quarter.png`, `-side.png`, `-front.png` and
`-three-quarter-checker.png`; the B-29 also has `-top.png`. Hangar captures on
the reference GPU, 2026-09-28. No in-flight frames were taken.

What the executor saw:

- All three read as their types in three-quarter and side views: the Ki-21's
  glazed nose and twin nacelles, the P-38's twin booms with turbo bulges and
  bubble canopy, the B-29's greenhouse nose and tall fin.
- **Ki-21:** the nose glazing is a blunt, striped blob rather than a shaped
  glass loft; the propellers read thin at Hangar zoom; the exhaust stubs are
  barely visible.
- **P-38:** the turbo bulges are modest at Hangar zoom. The dark wedge near the
  gondola in the side view was investigated and is not a defect: it is the near
  wing seen at a grazing angle, a lit top over a shaded underside with its
  roundel.
- **B-29:** the tail-gunner canopy is hard to see at Hangar zoom.
- The bare-metal aircraft render as light gray, not shiny aluminum (`metallic
  0.25`, above).

## Sources and markings

The ledger (`.superpowers/sdd/2026-09-28-dp1-aircraft/progress.md`, gitignored)
holds the dated per-item record. What is CITED and what is not:

- **CITED:** P-38J/L armament (four M2 .50 and one 20 mm) and the turbo exhaust
  on the boom tops (English Wikipedia, read 2026-09-28); B-29 turret and tail
  armament and the R-3350-23 turbosupercharged engines (same).
- **ESTIMATE:** every USAAF color; the star-and-bar geometry (blue disc d, each
  white bar 0.5d by 0.33d, red outline from June 1943 and blue outline from
  August 1943, the AN-I-9 amendment of 14 August 1943 was read); all placement
  and proportions; the anti-glare panel; the propeller-tip yellow; the B-29's
  turbo, intercooler, cowl-flap and exhaust layouts; the Ki-21 hinomaru layout.
- **Omitted rather than guessed:** the Ki-21's tail stripe and unit codes; the
  B-29's tail group symbol, group letters and serials (the 1945 symbols read
  could not be tied to one group, and the stroke font has digits only); the
  P-38's fin lower halves and wing-root radiators.

## Tier 1 and Tier 2

- **Tier 1:** `remote-run npm run verify` returned rc=1 at its **lint** step:
  `tests/render/roster.test.ts:60` has two unused variables (`_d`, `_t`),
  introduced by `main`'s commit `0264d45` (Convoy Strike feedback), not by this
  branch (`git diff main` on that file is empty). Running the rest directly
  (`remote-run sh -c 'npm run typecheck && npm run depcruise && npm test'`):
  typecheck and depcruise passed; 343 of 345 files and 3,905 of 3,911 tests
  passed, 4 skipped. The two failures were
  `tests/architecture/boundary.test.ts` ("leaves no probe in the real source
  tree", timed out at 30 s after taking 35.7 s) and
  `tests/render/skyLoad.test.ts` (timed out at 120 s). Rerun alone on nexus,
  both pass (30 of 30). **This explains DP2's unexplained boundary failure:**
  the same test, the same timeout under ryzen load.
- **Tier 2 (Hangar, reference GPU, all 18 tests):** the first run failed checks
  8 and 16 on the metric artifacts above; after the fix both pass. Check 15
  ratios: ki-84 1.102, hangar 0.983, the ships as in DP2, ki-21-sally 1.011,
  p-38-lightning 0.738, b-29-superfortress 0.738.
- **Not run:** the flight-facing e2e specs that load these models (plan Task 7
  Step 4), and any budget4k run. The models draw 6, 6 and 13 calls, well under
  the 47-draw budget.

## Open

- **`main`'s lint is red** on `tests/render/roster.test.ts` (above). Fix it on
  `main`; it is not this branch's change.
- **DP3** (the remaining unskinned buildings and vehicles, and the allowlist's
  deletion) is not started.
- **The Pennsylvania's deck and bridge** notes (DP2 handoff) are open by Mark's
  ruling.
- **The Ki-21 nose glazing** could be shaped rather than a canopy scaled
  around the fuselage.
- **P-38 counter-rotation** is not modeled: both propellers have the same blade
  handedness. The sim's spin direction was not checked.
- **`naturalMetal` at `metallic 0.25`** was tuned in the Hangar only. If the
  in-game environment makes the bare-metal aircraft look dull, raise it and
  re-run check 15 on all three.

## Departures

The ledger's `Ruling:` lines, summarized:

- The Ki-21's `ki21_nose` node was dropped (nothing referenced it); its glazing
  is a canopy 1.06x the fuselage section because the old nose glazing sat
  inside the fuselage.
- The Ki-21's tailwheel stays fixed and un-noded.
- The P-38's first pass built 45,004 triangles (over the 25-60% band's top of
  36,000); segment counts were cut to 33,836.
- The B-29's fin root was lowered to 0.020 L because the old root floated above
  the tail cone.
- One role per node in the kit, so the B-29's gear nodes are all `dark` and its
  turret nodes all `naturalMetal`.
- Hangar checks 8 and 16 gained a changed-pixel measure (above); the thresholds
  are unchanged.
