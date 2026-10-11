# K Clouds v3: Takram game integration handoff

Date: 2026-10-10

Branch: `clouds-v2-blender-lod`

Scope: plain cumulus only; opt-in DEV integration; no deployment

## Result

The accepted native Takram cloud port now renders inside the actual game. Use:

`https://ww2airsim-3.windomlane.org/?spawnX=289068&spawnY=1300&spawnZ=-55605&launch&cloudRenderer=takram&cloudTier=high`

This is a normal flyable free-flight launch at about 4,200 ft below the cloud
deck. `?cloudRenderer=takram` is DEV-only. Without that parameter the existing
renderer remains selected, and production builds always select the existing
renderer.

The new path is deliberately limited to plain cumulus. Thunderheads are
deferred at Mark's request, and the high Takram reference cirrus layer is not
part of this integration.

## What is integrated

- A native raw-WebGPU pass runs within the Three.js render graph: one-sixth
  resolution march, temporal reconstruction, then full-resolution composite.
- It consumes the game's scene/effects color and reversed depth, so terrain,
  aircraft and effects remain ordered correctly in front of clouds.
- Camera, sun, scenario coverage and cumulus base height are live game inputs.
- Camera cuts and scenario changes invalidate temporal history.
- Diagnostics report the selected renderer and the native Takram GPU time.
- The existing cloud-shadow pass remains in use for this checkpoint.
- Production copies of the five required data assets live under
  `content/clouds/takram/` with provenance in `ASSETS.md`.

## Visual ruling

Final unattended captures are in:

- `artifacts/clouds-takram-game/under.png` — below the deck
- `artifacts/clouds-takram-game/inside.png` — within the deck
- `artifacts/clouds-takram-game/above.png` — above the deck

Mark's final attended direction before integration was that the softened edges
look "way better" and the new clouds are substantially better than the old
renderer. The broad resolve filter that removed the objectionable hard,
flickering pixel boundary also makes the dense center look slightly out of
focus. That is recorded rather than tuned further. The thinnest moving wisps
can still show slight soft breakup; it is serviceable and should be judged in
normal flight before another visual pass.

## Performance reality check

The definitive run held the shared RX 6700 XT GPU lock and used 2560x1440,
High tier:

| Measure | GPU p95 |
| --- | ---: |
| Three frame, clouds off | 2.743 ms |
| Three frame with Takram selected (native pass excluded by Three's timer) | 3.886 ms |
| Native Takram pass, timestamped directly | 2.016 ms |
| Conservative total: off baseline + native Takram | 4.759 ms |

The native cloud cost clears the 4.0 ms cloud-only gate. The conservative total
clears the 8.33 ms 120 Hz whole-frame gate with substantial margin. The direct
native timestamp surrounds the march, temporal resolve and composite, so it is
the authoritative cloud cost.

## Verification

- `npm run verify` through `remote-run` — typecheck, lint, dependency cruise and
  full Vitest suite.
- `tests/render/clouds.test.ts` — 9 passed, including renderer query parsing.
- `tests/e2e/takramGame.spec.ts --grep "flies the opt-in"` — passed; flyable
  composition, camera-cut history reset, renderer diagnostic and zero WebGPU
  errors.
- Final below/in/above capture run at 2560x1440 — passed with zero WebGPU errors.
- Locked budget run — passed at 2.016 ms native-cloud GPU p95.
- `git diff --check` — clean.

## Next decision

Fly the link above in normal play. If motion and the accepted soft-core trade
hold up, the next step is a separate decision to promote this path beyond its
DEV opt-in. Do not begin thunderheads, world-scale weather tiling or replace the
default renderer as part of this checkpoint.
