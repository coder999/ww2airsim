# UI-realism handoff — quality settings, terrain assets, damage model and Naval Communications UI

2026-09-24. The implementation plan at
`docs/superpowers/plans/2026-09-24-plan-ui-realism.md` is complete on
`main`. The title screen now exposes persisted render, asset and damage-model
choices; L0/L1 terrain ships as selectable content; and the roster, settings
and debrief screens share the Naval Communications visual system.

## What landed

- `src/render/quality.ts`, `settings.ts` and `bootQuality.ts` separate the
  persisted model from the DOM. Simple Render Quality moves ocean, scenery
  and clouds together; Advanced can set them independently. Corrupt or
  unavailable `localStorage` falls back safely. The existing one-shot GPU
  probe now supplies a visible recommendation, persists it when the player
  has not made an explicit choice, and never overwrites an explicit pick.
- DEV `?oceanTier=` and `?cloudTier=` overrides still win over persisted
  settings. `?oceanTier=` continues to drive scenery as it did before this
  plan, preserving the meaning of existing GPU measurements.
- Rapid Ocean settings changes are latest-request-wins. The final review
  found that two asynchronous cascade rebuilds could complete out of order;
  request tokens now dispose stale results, including the case where the
  final click returns to the already-active tier.
- Asset Quality is a separate persisted axis. `low` fetches L1 terrain;
  `medium`, `high` and `ultra` fetch L0. `content/terrain/L1.bin`
  (33,570,818 bytes) is a normal Git object and `L0.bin` (134,250,498 bytes)
  is Git LFS content. Build/deploy checks distinguish the real L0 bytes from
  an unsmudged pointer.
- CI deliberately does not fetch LFS on every branch/PR run, avoiding roughly
  13% of GitHub's free monthly LFS bandwidth per run. L0-dependent tests use
  a real byte-size gate there. Deploy does fetch LFS and verifies the exact
  built and live asset.
- Damage Model persists as Realistic or Arcade. Arcade gates only
  `damageFromStructuralOverload`; `measureStructuralStress`, OVER-G/
  OVERSPEED HUD feedback, stalls and the rest of the flight model remain
  unchanged.
- `src/render/ui/naval-comms.css` and `navalComms.ts` provide the shared
  paper, letterhead, ballot, table, stamp and button system. Special Elite
  (Apache-2.0) and Stardos Stencil (OFL-1.1) are self-hosted and recorded in
  `ASSETS.md`/`content/fonts/NOTICE.md`; no runtime Google Fonts request was
  added.
- The roster and debrief were presentation-only rewrites: their existing
  pilot/scoring behavior and data contracts remain intact. The debrief still
  shows recovery multiplier, banked total, promotion and the complete target
  breakdown added by Plan 9.

## Findings fixed during review

- GitHub workflows initially checked out an LFS pointer instead of L0. The
  final arrangement makes deploy fetch LFS, makes ordinary CI skip only the
  real-L0-dependent assertions, and documents `git-lfs` as a clone
  prerequisite with the recognizable failure signature.
- The first Task 2 diagnosis blamed L0 for water on the Tacloban runway. That
  was false: the failing test used an east-facing identity attitude and flew
  204 m into San Pedro Bay; the real north-facing spawn takes off cleanly at
  L0/L1/L2. The fixture and durable explanation were corrected.
- Making L0 the mesh floor would allocate about 358 MB of height textures per
  mesh because all levels were allocated eagerly. The loader now has one
  finest-level source of truth, while the first-visit Asset Quality default
  deliberately remains `low` until texture allocation becomes on-demand.
- The first Settings implementation used mismatched SVG filter ids and a
  single-slot subscription. Filter injection is now shared/idempotent and
  subscriptions are additive with per-listener cleanup.
- The Task 9 review disproved the claim that Chromium hides a stamp when its
  SVG filter id is missing. It paints an ordinary, unroughened stamp with the
  same box, visibility and computed filter string. Tier 2 now asserts the
  actual `SVGFilterElement`, and the final review removed the false claim
  from code/tests.
- The DEV quality hook closed over a later `let`, recreating Plan 9's TDZ bug
  class. `qualityChecked` now exists before the hook can be installed.
- The final review fixed the out-of-order ocean rebuild race above and
  corrected stale terrain-scratch comments that claimed the build generated
  a nonexistent `L6-preview.png` debug artifact. That path remains only a
  deploy sentinel expected to return 404.

## Tier 1 evidence

Final command on commit `44492dd`:

```sh
npm run verify; rc=$?; echo rc=$rc
```

Result: `rc=0`; typecheck, ESLint at zero warnings and dependency-cruiser
clean; 141 test files, 1,507 passed, one pre-existing bathymetry-source skip.
The focused final-cleanup run also passed 7/7 tests in
`navalComms.test.ts` plus `dist.test.ts`.

## Reference-GPU evidence

Against the served nexus checkout through the Windows RX 6700 XT Playwright
server at 2560 × 1440:

```sh
PW_REMOTE=ws://localhost:39001/ \
PW_BASE_URL=https://ww2airsim.windomlane.org \
npx playwright test tests/e2e/settingsUi.spec.ts --reporter=list
```

Task 9 plus its review fix passed 8/8. The final run measured 1.988 ms GPU
p95 over 1,744 samples in the Arcade maneuver (budget: 6.0 ms), zero WebGPU
validation errors, 10.79 g and 218.39 m/s while structure remained 100%.
Screenshots were read directly: fresh/recommended/persisted settings, paired
High-vs-Low scenery at Tacloban, Arcade damage HUD, roster and killed debrief.

After the final race fix, the new focused reference-GPU case passed 1/1 in
14.4 s: rapid Low → Medium → High Ocean picks remained High after six seconds,
after older cascade builds had time to finish, with zero validation errors.

## Commits

Fourteen plan commits landed from `53bc6f2` through `44492dd`:

`53bc6f2`, `aeeea5e`, `60c8597`, `0a296f3`, `abb5363`, `5a7fa02`,
`8315a37`, `3419266`, `f34a629`, `ac801cb`, `a53f79c`, `1a05c79`,
`a14c348`, `44492dd`.

Other sessions committed aircraft/cloud/AI planning work and one merge to
`main` during this execution, so the continuous range from the plan document
also contains unrelated commits. The explicit list above is the plan's work.

## Deliberate boundaries and remaining work

- The first-visit Asset Quality default is still `low`, not the design
  addendum's eventual `medium`: eager L0 texture allocation measured about
  358 MB per terrain mesh. Make allocation lazy/on-demand before changing the
  default.
- `high` and `ultra` currently select the same L0 terrain as `medium`. Their
  larger download ceilings reserve room for the later real-texture/geometry
  work in visual-realism design §§2–3; that work was explicitly outside this
  plan.
- The 2026-09-20 vsynced-browser probe calibration incident remains open.
  This plan makes its recommendation visible, persistent and overridable; it
  deliberately does not change the measured thresholds, move the probe out
  of the title screen, or change Low scenery's zero-tree definition.
- Settings is a title-screen dialog, not an in-flight menu. No audio volume,
  joystick/mouse scheme, Save/Cancel flow, mobile UI, texture pipeline or new
  aircraft geometry was added.
- Git LFS remains a clone/deploy toolchain requirement and a bandwidth cost.
  README and the workflows record the exact arrangement; revisit it if normal
  CI must begin exercising L0 on every run.
- Not pushed and not deployed. Those remain separate user decisions.
