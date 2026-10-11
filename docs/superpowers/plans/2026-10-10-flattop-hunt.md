# Flattop Hunt mission — executable plan

**Status:** approved by Mark on 2026-10-10.

**Run:** unattended.

**Viewing checkpoint:** final product only; do not stop for intermediate review.

**Workspace:** isolated worktree `/home/mark/projects/ww2airsim-flattop-hunt`, branch `flattop-hunt`.

**Exact base:** local `main` at `61297b23e10709288f9e19e264f1399494fb00ae` (`Checkpoint cloud rendering research`).

## Goal

Ship **Flattop Hunt**, the already-designed mission in `GAMEPLAY.md` and the
missions design: a U.S. carrier strike against *Zuikaku*, inspired by the
Battle off Cape Engaño on 25 October 1944 and staged inside the Leyte world.
Keep this a content-led Track F addition: one scenario, one picker row,
mission-specific deterministic tests, one reference-GPU product-flow check,
and the project ledger/player-facing documentation.

## Verified starting facts

| Claim | Evidence checked at the base commit | Consequence |
| --- | --- | --- |
| A shipped mission is normally one scenario JSON file plus one `SCENARIO_OPTIONS` row. | `MASTER_PLAN.md`, Track F; `content/scenarios/*.json`; `src/render/titleScreen.ts` | No new mission engine or objective kind. |
| *Zuikaku* is shipped and landable as `zuikaku-cv`, with 600 hull points. | `content/ships/zuikaku-cv.json`; M1e ledger entry | Use the existing hostile carrier as the primary target. |
| The TBM-3 Avenger is shipped, carrier-capable, and carries one Mk 13 torpedo. | `content/aircraft/tbm-3-avenger.json`; D1 ledger entry | Default the mission to the Avenger and the racks loadout. |
| Mk 13 hits flood ships, and three sink a 600-point carrier. | `tests/sim/weapons/flooding.test.ts`; D3 handoff outcome table | A player plus supporting Avengers can sink *Zuikaku* without changing global ship durability. |
| E2's opt-in `pilot.ingress.attack: "torpedo"` is merged; a veteran Avenger hit 13/16 slow merchants in calibration, and attackers receive full racks automatically. | `src/sim/scenario.ts`; `tests/sim/ai/attack.test.ts`; E2 handoff | The supporting strike can use existing attack AI; no E3, M3, or new AI behavior. |
| The official U.S. Navy account says Task Force 38 attacked Ozawa's force off northeastern Luzon and lost *Zuikaku* and three light carriers; an official photograph shows a TBM by listing *Zuikaku*. | NHHC Battle off Cape Engaño page and photo catalog (80-G-281769), checked 2026-10-10 | The history note can be specific while saying the gameplay is staged over Leyte, not a reconstruction. |

The dependency gate is therefore green: Japanese carrier, torpedoes,
flooding, and E2 attack AI are all present. E3 bombers/gunners and M3 gun
laying are not needed and remain outside this worktree.

## Content ruling (reversible)

The old design fixes the target and historical inspiration but not spawn
geometry or the strike package. No remaining choice changes project scope, so
this unattended run uses these conservative content assumptions:

- The player is airborne in a TBM-3 with a Mk 13, with three veteran TBM-3
  attackers offset as a loose strike package. Each AI airplane independently
  flies E2's torpedo run on *Zuikaku*; they are not an E3 bomber formation.
- *Zuikaku* steams with two Kagero-class escorts on a water-verified route.
  Sinking *Zuikaku* is primary; destroying an escort is secondary.
- The strike is staged at a practical distance inside the Leyte map. Recovery
  is aboard an Essex already steaming east of the strike; the player still
  starts airborne, avoiding new carrier-launch choreography and keeping the
  mission one sortie long. The history and briefing say where the real action
  occurred.
- A successful badge still requires landing, under the existing global rule.

If measured E2 behavior lets the AI sink the target too reliably without the
player, tune only attacker count/skill and geometry. Do not change torpedo,
AA, flooding, carrier HP, or difficulty constants in this mission plan.

## Tasks

1. **Scenario content** — add `content/scenarios/flattop-hunt.json` with the
   player, supporting torpedo attackers, hostile carrier group, weather,
   primary/secondary/recovery objectives, concise radio triggers, badge,
   briefing, and lookupable official-history sources.
2. **Registration** — add the non-Dev mission row to `SCENARIO_OPTIONS`, default
   it to `tbm-3-avenger` with the racks loadout, and update the exact picker
   enrollment assertions.
3. **Deterministic mission tests** — add a focused mission file that proves:
   roster/sides/orders; target distance and route geometry; water validity on
   the real terrain field; three-Mk-13 carrier arithmetic; success with the
   carrier sunk and a landing; and no badge when the carrier remains afloat.
   Enroll Flattop Hunt in existing content and title-screen expectations.
4. **Reference-GPU product flow** — extend `tests/e2e/missions.spec.ts` with a
   Flattop Hunt case that checks briefing, objective line, a radio message,
   and debrief state through diagnostics. Add a final-only capture tool only
   if the existing mission spec cannot leave useful screenshots.
5. **Documentation** — mark Flattop Hunt shipped in `MASTER_PLAN.md`, update
   the scenario roster/current shipped count in `GAMEPLAY.md`, add the capture
   command to `docs/testing.md` if a tool is added, and write the dated handoff
   with measurements, captures, limitations, and integration notes.
6. **Verification** — run touched deterministic tests first, then
   `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify` on Ryzen. Start an isolated
   dev server only for this worktree, reuse shared Playwright plumbing, run the
   non-budget mission E2E/capture on the reference GPU, and assert the chosen
   browser URL returns HTTP 200 before naming it. Prefer a routed HTTPS slot;
   if every slot is occupied, use an isolated loopback server plus a reverse
   tunnel so `http://localhost` remains a secure WebGPU context. Do not run
   heavy jobs on nexus and do not stop shared tunnels/servers.
7. **Delivery** — mail the handoff, commit intentional files, push
   `flattop-hunt` if permitted, and do not merge, deploy, or modify `main`.

## Acceptance gates

- Every scenario parses and `worldFromScenario` resolves all ids/tags.
- The player-visible option matches scenario start, default aircraft, badge,
  briefing, history, and recommended loadout.
- *Zuikaku* is a hostile moving target, every ship route is over water, and
  supporting attackers carry torpedoes and name it as their E2 destination.
- Sinking *Zuikaku* completes the primary objective; landing aboard Essex then
  awards the Flattop Hunt badge. Landing while it survives awards no badge.
- Full deterministic verification passes on Ryzen. On the reference GPU, the
  adapter guard and running mission pass with no WebGPU validation errors,
  and the briefing, chart and debrief captures are readable.
