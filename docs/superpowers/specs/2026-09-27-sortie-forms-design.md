# Sortie forms: four-form new game with a Dev override — design

**Status:** design approved in conversation with Mark, 2026-09-27, and
amended the same day after the missions merge (A1-A6 below). The
implementation plan is written after he reviews this file.

**Depends on:** `worktree-missions-track` merging into `main`. **Met
2026-09-27:** M1-M4 are on `main` (`5134e9f`). This design builds on that
version of `src/render/titleScreen.ts`: Missions/Ranges headings, a briefing
panel, build-time gating of the `dev-` fixtures, and a recommended loadout
per mission (Mark, 2026-09-27).

## Amendments, 2026-09-27 (Mark, after the missions merge)

Each is written into the section it changes; this list is the index.

- **A1. Every test-bed scenario is Dev-only.** Furball (7e's AI-vs-AI test
  bed) and both Friendly Fire scenarios join the `dev-` fixtures: listed
  only while Dev is checked. Friendly-fire penalties stay in every mission;
  practicing them is not a production feature. → Form 2.
- **A2. `?scenario=` stays, and reaches Dev-only scenarios.** → URL.
- **A3. The recommended loadout (M2's ruling R10) moves to Form 4** under
  one preselection rule that also covers invalidation. → Form 4.
- **A4. The player is drawn with the chosen aircraft's model,** and
  `f6f-hellcat` points at its own R3 model instead of the Wildcat's.
  → Rendering.
- **A5. A sortie is Dev only if it needed Dev** (Mark chose option b over
  "any sortie launched with the box checked"). → Dev sorties.
- **A6. A URL quick launch for agents,** reversing "no new URL
  parameters". It is always a Dev sortie. → URL, Harness.

## Intent

Mark wants the new-game flow to serve two uses at once:

- **Normal play**, where every choice offered makes sense: a mission's
  aircraft can use its start, and an aircraft's armament fits its racks.
- **A sandbox**, where one Dev checkbox lifts every rule: dev missions,
  enemy aircraft, and any armament on any aircraft from any start.

Success means Mark can go from pilot to mission, aircraft and armament in
four short forms. Each form shows the description of what is selected. With
Dev off, nothing nonsensical is offered. With Dev on, nothing is withheld.

## Measured start (`main` at `48012d8`, 2026-09-27, after the missions merge)

- **Forms:** there are two, "Squadron Roster" and "Sortie Orders"
  (`TITLE_FORMS`, `titleScreen.ts`). Form 2 holds the mission radiogroup
  (Missions/Ranges headings), the Armament radiogroup and the mission
  briefing. `onNewGame(loadout, scenarioId, pilotId)` carries no aircraft.
- **Recommended loadout:** M2's R10 (`titleScreen.ts`, `loadoutTouched`)
  applies a briefing's `loadout` on selecting a mission unless the pilot
  has picked a loadout since selecting it; selecting a mission clears that.
- **Dev gating, two kinds:** the `dev-` fixtures (`DEV_SCENARIO_OPTIONS`)
  are offered only by a DEV build (`scenarioOptions(import.meta.env.DEV)`);
  Furball, Friendly Fire and Friendly Fire: Field are "(dev)"-labeled rows
  that ship in production (7e ruling W9: `?scenario=` accepted only picker
  ids).
- **URL:** `?scenario=` is honored in production, whitelisted by
  `isKnownScenarioId(id, import.meta.env.DEV)` (`main.ts`). It preselects
  the scenario; it does not skip the title. `?skill=` and the sea-state
  override are DEV-build only. Tier 2 reaches the game only through the
  title: `startGame` (`tests/e2e/harness.ts`, called directly and by
  `waitForTerrain`) clicks New game and Launch.
- **Recording:** `titleScreen.ts`'s `start()` calls `startSortie` and
  `saveRoster` at launch; `bankMissionResult` (`main.ts`, three debrief call
  sites) writes points, kills, the mission log, badges, discharge and
  K.I.A.
- **Player aircraft:** fixed per scenario. Every scenario names
  `f6f-hellcat`, whose spec's `view.model` is `wildcat`, so the player
  always renders as the Wildcat, although R3 shipped an `f6f-hellcat`
  model.
- **Flight specs:** `f6f-hellcat` (2 AN-M65 racks, 6 HVAR rails),
  `f4f-wildcat` (the same 2 racks and 6 rails) and `a6m2-zero` (no stores). The B-17 and the other
  R3 aircraft have models and Library entries but no flight spec.
- **Loadouts:** `clean | bombs | rockets | both`, derived from
  `spec.stores` by `storesFromLoadout`. There are no torpedo stores.
- **No rules exist to override.** Nothing ties an aircraft to a start
  (carrier, airfield, airborne) or a loadout to an aircraft. This design
  writes those rules; Dev bypasses them.

## The four forms

1. **Squadron Roster:** unchanged, plus a **Dev** checkbox beside New game,
   labeled "Dev — unlocks everything".
   - It exists in every build, production included.
   - It starts unchecked on each page load and survives return-to-title
     within the session.
   - It replaces the build-time (`import.meta.env.DEV`) gating of the
     `dev-` fixtures.
2. **Sortie Orders:** the mission list only, keeping `missions-track`'s
   Missions/Ranges headings.
   - Dev-only scenarios are listed only while Dev is checked (A1): the
     `dev-` fixtures, Furball, Friendly Fire and Friendly Fire: Field.
     Each scenario option carries a `dev` flag in place of today's
     `DEV_SCENARIO_OPTIONS` split and the "(dev)" labels.
   - The right side shows the selected mission's description. For a
     mission, that is its briefing (`briefing.situation`). For a range,
     which has no briefing, it is a one- or two-sentence description added
     beside its label in the scenario option table.
3. **Aircraft Assignment:** the aircraft list on the left.
   - The right side shows the Hangar Library `blurb` and the `figuresFor`
     stats: structure, top speed, stall, g limit, guns and rounds, racks and
     rails.
   - It preselects the mission's own aircraft.
   - Enemy aircraft appear only with Dev on and are labeled with their side,
     e.g. "A6M2 Zero (Japanese)".
4. **Ordnance Requisition:** the loadout list on the left.
   - The right side lists exactly what hangs on the aircraft, e.g.
     "2 × AN-M65 500 lb bombs, 6 × HVAR rockets".
   - Preselection (A3, carrying M2's R10 over from Form 2):
     - **Changing the mission** resets the loadout to that mission's
       recommended one if the aircraft allows it, otherwise the first
       allowed one. This is R10's existing behavior.
     - **Changing the aircraft** keeps the pilot's pick if the new aircraft
       allows it, otherwise resets to that same default.
     - **Back and forward with no change** keeps the pick.
     - The recommended row is marked "(recommended)", since the briefing is
       now two forms back.
   - With Dev on, an aircraft that has no stations for the chosen loadout is
     marked "dev layout: Hellcat stations".

**Navigation.** Every form has Back, Enter advances, and Launch is on
Form 4 only. The forms are labeled "Form N of 4". When an earlier choice
invalidates a later one, the later one resets to its default. Examples:
choosing a carrier mission after picking an aircraft that can't use a
carrier, or unchecking Dev after picking the Zero. Form 4's own reset rule
is A3's, above; it is this rule applied to the loadout.

## Rules and data

**Two new facts on every aircraft spec.** They are required fields in the
strict schema:

- `side`: `allied` or `japanese`.
- `carrierCapable`: boolean.

| spec | `side` | `carrierCapable` |
| --- | --- | --- |
| `f6f-hellcat` | allied | true |
| `f4f-wildcat` | allied | true |
| `a6m2-zero` | japanese | true |

A Tier 1 test asserts each spec's `side` equals its Library entry's `side`.

**Flyable** means having a spec in `content/aircraft/`. New flight specs
join every list automatically.

**Start kind** is read from the scenario's player entry:
`parkedAt.ship` is `carrier`, `parkedAt.airfield` is `airfield`, and
`airborneAt` is `airborne`.

**`src/sim/sortie.ts`** is pure, with no render imports:

- `eligibleAircraft(start, dev)`
  - With `dev`: every flyable spec.
  - Otherwise: specs with `side === 'allied'`, and for a `carrier` start,
    only those with `carrierCapable`.
- `eligibleLoadouts(spec, dev)`
  - With `dev`: all four.
  - Otherwise: `clean`, plus `bombs` if the spec has racks, `rockets` if it
    has rails, and `both` if it has both.
- `SortieChoice = { scenarioId, aircraftSpec, loadout, dev }`
- `validateSortie(choice)`: refuses a non-dev choice outside the rules,
  naming the rule broken.
- `DEV_STORES_LAYOUT`: the `f6f-hellcat` stores block. A dev sortie whose
  spec lacks the stations its loadout needs is given this layout, so the
  bombs drop and the rockets fire for real.

**Out of scope (YAGNI):** runway-length and weight rules. With no heavy
bomber flyable, they would reject nothing today. They belong to whichever
plan gives the B-17 a flight spec, and they slot into `eligibleAircraft`.

## Wiring

- **Handoff:** `onNewGame(choice: SortieChoice, pilotId)` replaces the three
  loose arguments. `main.ts` rebuilds the world when the scenario, aircraft
  or loadout changes.
- **Spec swap:** the loader fetches the chosen spec and puts it in the
  scenario's player slot in place of the scenario's own. It then runs
  `validateSortie`, and an illegal non-dev choice fails loudly by name.
- **Side:** the player keeps the scenario's player side whatever they fly.
  A Zero in a Hellcat mission is still the player, and AI enemies still
  engage it.
- **Rendering (A4):** the player is drawn with the chosen spec's
  `view.model`, whatever aircraft is picked. `f6f-hellcat.json`'s
  `view.model` becomes `f6f-hellcat` (R3's model), so every existing
  scenario now shows a Hellcat; `f4f-wildcat` keeps `wildcat`. The player's
  animations (gear, hook, flaps, prop) have only ever run on the Wildcat
  model; the plan proves them on every flyable spec's model. The cockpit
  panel stays the F6F's for every aircraft; per-aircraft cockpits are a
  separate plan.
- **Which sorties are Dev (A5):** a sortie is Dev if it **needed** Dev: a
  Dev-only scenario, or a choice `validateSortie` would refuse with
  `dev: false` (an enemy aircraft, a carrier start on a non-carrier
  aircraft, a loadout the aircraft has no stations for), or a URL quick
  launch (A6). A legal sortie flown with the box checked is recorded
  normally. `SortieChoice.dev` means "Dev rules were available";
  `isDevSortie(choice)` is the derived fact, and only it gates recording.
- **Dev sorties are not recorded.** Both recording points are skipped: the
  launch-time `startSortie`/`saveRoster`, and `bankMissionResult` at every
  debrief call site (points, kills, mission log, badge, discharge, K.I.A.).
  Everything else runs: the mission engine, objectives and outcome, the live
  score and the debrief, which shows what would have been earned under a
  "Dev sortie: not recorded" stamp. A Dev sortie therefore still tests a
  mission end to end.
- **URL (A2, A6):**
  - `?scenario=<id>` keeps working as today: it preselects the scenario on
    Form 2 and the flight uses the scenario's own aircraft and default
    loadout. Its whitelist becomes every known scenario, Dev-only ones
    included, so a link can reach a test bed; selecting one this way
    checks Dev.
  - **Quick launch:** `?scenario=<id>&launch`, with optional
    `&aircraft=<spec>&loadout=<loadout>`, skips the title and builds the
    same `SortieChoice` the forms build, with `dev: true`. It goes through
    the same `validateSortie` and the same `onNewGame` path. It is always a
    Dev sortie, so it needs no pilot and records nothing. It grants nothing
    the production Dev checkbox does not. An unknown id, spec or loadout
    fails loudly by name, like any bad `?scenario=`.
  - `?skill=` and the sea-state override stay DEV-build only.

## Testing

**Tier 1:**

- `sortie.ts`: every start kind × every flyable spec × dev on/off, and
  loadout eligibility per spec.
- Dev bombs on the Zero produce real stores from `DEV_STORES_LAYOUT`.
- `validateSortie` refuses by name.
- Each spec's `side` matches its Library entry.
- The title screen:
  - `TITLE_FORMS` has four entries.
  - Back and Enter work on each form.
  - Dev missions are hidden until Dev is checked.
  - Invalidated later choices reset.
- A dev sortie leaves the roster byte-identical, through every debrief
  path (landed, ditched, killed, friendly fire).
- `isDevSortie`: a legal choice with Dev checked is recorded; each kind of
  needed-Dev choice is not (A5).
- Form 4 preselection: each of A3's three cases.
- Quick launch: builds the same `SortieChoice` as the forms for the same
  picks; is always Dev; refuses unknown ids by name.
- Every flyable spec's model has the nodes the player's animations drive.

**Harness:**

- `startGame(page, { aircraft?, loadout?, dev? })` walks all four forms.
  With no options it accepts every default, so the specs that depend on it
  (directly or through `waitForTerrain`) fly the same Hellcat sortie as
  today.
- `quickLaunch(page, { scenario, aircraft?, loadout? })` (A6) opens the
  quick-launch URL. Specs about flight, rendering or AI may move to it;
  specs about the forms, scoring, badges or the roster must keep
  `startGame`, because a quick launch records nothing. Moving existing
  specs is opportunistic, not part of this plan's gate.

**Tier 2, on the reference GPU:**

- A dev Zero with bombs releases a real bomb.
- A non-dev carrier mission offers only carrier-capable allied aircraft.
- The player's model matches the chosen aircraft, including the default
  Hellcat no longer rendering as the Wildcat.
- A quick launch reaches flight without the title, and its debrief shows
  "Dev sortie: not recorded".
- One capture of each form goes in the handoff.

## Open questions for the plan

Mark answers these when the plan is written:

- Viewing checkpoints: intermediate tasks, final product only, or none.
- Whether the run is attended.
- Main or a worktree.
