# D3: Torpedo flooding, torpedo sounds, and "Torpedo" in the loadout

**Goal:** finish the follow-ups from D1 (`docs/handoff/2026-10-09-d1-torpedo-planes.md`, "Not done"), and do Track D step 3 in `MASTER_PLAN.md`.

**Run:** worktree `d3-torpedo-flooding` on nexus, merged to `main` at the end.
- **Attended or not:** unattended. Not asked this time; it is the default Mark chose for every run on 2026-10-09.
- **Viewing checkpoints:** the final product only.

## Rulings (Mark, 2026-10-09)

| # | Ruling |
| --- | --- |
| T1 | **The loadout says "Torpedo", not "Bombs",** wherever the selected aircraft's racks carry a torpedo store: <br>- the loadout picker; <br>- the controls legend; <br>- the HUD and Form 4, if they name the store. <br>The label follows the airframe's store kind (Avenger, Kate, Betty), not a hand-kept list. The Hangar bench's "Bombs" checkbox follows the same rule. |
| T2 | **Hook up `torpedo_splash` and `torpedo_hit`** (Track I's I3 takes, already in content): <br>- the splash plays at water entry, positioned at the entry point; <br>- the hit plays at a hull hit. <br>A torpedo that breaks up on entry plays the splash. A release keeps `bombs_away`. |
| T3 | **Torpedo hits flood (Track D step 3):** <br>- an armed hit does its immediate damage as today, then starts a **flood**; <br>- a flood drains `hullHp` over time, at a rate and for a duration scaled by the warhead; <br>- floods from several hits add up; <br>- as hull points drain, the ship **lists** toward the hit side and **slows** (max speed scales down with the flood); <br>- a ship that reaches 0 sinks as today. <br>Rates, durations, the list angle and the speed loss are ESTIMATES, labeled, and tuned so one Mk 13 cripples a destroyer and two or three sink a cruiser, while a battleship survives several hits. Record the outcomes as a table in the handoff. |
| T4 | **Torpedoes only.** Bombs, including near misses, keep today's damage. |
| T5 | **The AI torpedo attack is out of scope** (Track E, later). So is placing the torpedo planes in missions. |

## Tasks

- [ ] 0. Worktree `../ww2airsim-d3` on branch `d3-torpedo-flooding`; link the model cache. For a preview, use slot 2 or 3 with an untracked config that sets its own `cacheDir` (AGENTS.md).
- [ ] 1. T1, the labels. Enroll them where `LOADOUT_OPTIONS` and the legend are pinned. See each fail once.
- [ ] 2. T2, the sounds. Enroll them in the audio event tests.
- [ ] 3. T3, flooding: the sim state per ship (active floods, list, speed factor); the render list; and the debrief or readout if the hull is shown. Sim tests:
  - an armed hit starts a flood;
  - a flood drains hull points over time;
  - two hits add up;
  - list and speed follow the flood;
  - a bomb starts no flood;
  - a dud starts no flood;
  - replay determinism holds.

  See each fail once.
- [ ] 4. Flown checks: an Avenger against a destroyer and against a cruiser. Record hull points over time and the list. Take captures of a listing ship.
- [ ] 5. Docs:
  - `CONTEXT.md` (Flood);
  - the handoff `docs/handoff/<date>-d3-torpedo-flooding.md`;
  - Track D in `MASTER_PLAN.md` (step 3 done).

  Then merge, run `npm run verify` on `main`, push, and email the handoff. Stop any preview server by its PID, then remove the worktree; keep the branch.

## Done means

- Torpedo carriers say "Torpedo" in the loadout.
- Splash and hit sounds play.
- A torpedo hit floods, lists and slows a ship over time, more than a bomb of equal weight.
- `npm run verify` passes on `main`.
