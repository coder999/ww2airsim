# Ship and aircraft Blender comparisons: main integration handoff

Date: 2026-10-11

## Result

`main` now keeps every comparison candidate beside its external original. No gameplay specification or scenario was switched.

The three new ship candidates are:

- `fletcher-dd-blender`, borrowing `fletcher-dd` only for Hangar figures and armament;
- `shiratsuyu-dd-blender`, borrowing `shiratsuyu-dd`;
- `zuikaku-cv-blender`, borrowing `zuikaku-cv`.

Each Library card is explicitly `displayOnly: true`. The Hangar applies the candidate model override through the normal ship view, so its turret and AA locators still train and elevate. The external `fletcher-dd`, `shiratsuyu-dd`, and `zuikaku-cv` GLBs, manifests, raw-input hashes, specifications, and scenario references remain unchanged. The Type B Maru/Liberty ship was outside this comparison pass and remains external only.

The seven earlier aircraft candidates remain side by side under their existing stable ids: `f6f-hellcat-blender`, `f4u-corsair-blender`, `f4f-wildcat-blender`, `a6m2-zero-blender`, `b-17-flying-fortress-blender`, `d3a-val-blender`, and `ki-43-oscar-blender`.

## Hangar identification

When the title screen's Dev checkbox is checked, its Hangar link carries `?dev=1`. The right-side Figures table then shows the selected Library card's exact **Asset ID**. An ordinary Hangar link omits both the query flag and the row. This distinguishes an external original from its `-blender` comparison without changing the player-facing card.

## Integration commits

- `3fa457b0` — merge Shiratsuyu and the shared Hangar-only ship lifecycle;
- `26ebbcd2` — merge Fletcher while preserving the shared lifecycle and all aircraft comparisons;
- `b3aa00a2` — merge Zuikaku and enroll all three candidates in the combined ship checks.

The final Asset ID and documentation commit follows these merges. Nothing was pushed or deployed by this integration.

## Verification

- `npx tsc --noEmit` through `remote-run`: pass.
- Targeted ESLint through `remote-run`: pass. Its preliminary data sync reported a transient missing temporary raw-cache file, but lint itself completed with exit code 0 and does not consume model data.
- Combined model/Hangar/airframe/ship Vitest run through `remote-run`: 66 files, 1,826 tests passed.
- Targeted local Playwright against a one-off Vite server: six tests passed in 2.0 minutes. These covered every model's budget, provenance/origin, UV-checker restore, all canonical and comparison warship mount training/elevation, absence of Asset ID through the ordinary title link, and the exact `fletcher-dd-blender` ID through the checked-Dev link.

## Review and cleanup

The per-model handoffs retain the cited drawing measurements, estimates, known visual compromises, and emailed contact sheets. The candidate ids are the cleanup seam after visual review: remove or promote one candidate without touching its external original. Completed aircraft and ship worktrees were removed after this verification; their branches and commits remain recoverable.
