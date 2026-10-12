# Main-menu and sortie-flow refresh handoff (2026-10-11)

Implemented in the isolated worktree `/home/mark/projects/ww2airsim-main-menu-sortie-ui` on branch `main-menu-sortie-ui`. The production and test implementation is feature commit `9ebdc3e3`; current `main` was merged into the feature branch before the documentation update and final integration.

## What changed

- Each pilot row now owns its **New game** action beside **Dossier**. The action selects that pilot and enters the flow, so the menu no longer has an unexplained disabled global button.
- The launch sequence is six forms: Squadron Roster, Flight Type, Sortie Orders, Flight Conditions, Aircraft Assignment and Ordnance Requisition.
- Flight Type separates operational Missions from the Training Grounds and recommends Basic Flying, Torpedo Qualification and Carrier Qualification to new pilots. An ordinary first sortie begins on Basic Flying; explicit scenario links and Dev selections keep their requested scenario.
- Sortie Orders lists only the selected kind and keeps Back and Next at the top-right, above the potentially long scenario list.
- Takeoff time and cloudiness moved into the dedicated Flight Conditions form.
- Briefing sources render the human citation as the hyperlink label; the raw URL is no longer visible.
- Aircraft figures say “Structure hit points” and “Each subsystem hit points,” and add the rounded total takeoff engine rating in horsepower.
- About credits Mark Tuttle, Copyright (C) 2026 Mark Tuttle, labels the GitHub link “Source repository,” and adds `marktuttle.dev`.

The row-scoped New game placement is deliberate: it makes the pilot/action relationship visible, keeps the start action next to the other per-pilot action, and removes the roster's previous select-then-enable interaction.

## Verification

- TypeScript typecheck, ESLint and dependency-cruiser passed.
- Focused deterministic coverage passed: 4 files, 72 tests.
- Focused real-browser coverage passed: 19 cases across the title, scenario picker, launch flow and sortie paths.
- After current `main` was merged into the worktree, TypeScript and targeted ESLint passed again; the combined menu, briefing, Hangar figures, Carrier Qualification mission and steering-cue regression set passed 5 files and 64 tests.
- The repository-wide deterministic run completed 422 of 426 files and 6,231 tests. All changed menu, briefing and Hangar figure tests passed. Four failures were outside this patch: two 30-second whole-suite timeouts (`soak.test.ts`, `aiLethality.test.ts`), the existing ship-view registry expectation omits three registered Blender variants, and Escort's easy unescorted run lost one bomber where the assertion requires more than one.

No deployment was performed.
