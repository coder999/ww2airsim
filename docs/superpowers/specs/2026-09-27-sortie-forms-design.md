# Sortie forms: four-form new game with a Dev override — design

**Status:** design approved in conversation with Mark, 2026-09-27. The
implementation plan is written after he reviews this file.

**Depends on:** `worktree-missions-track` merging into `main`. That branch
rewrites Form 2: Missions/Ranges headings, a briefing panel, dev-build
gating of dev scenarios, and a recommended loadout per mission. This design
builds on that version of `src/render/titleScreen.ts`, not on `main`'s
(Mark, 2026-09-27). Implementation starts after that merge.

## Intent

Mark wants the new-game flow to serve two uses at once:

- **Normal play**, where every choice offered makes sense: a mission's
  aircraft can use its start, and an aircraft's armament fits its racks.
- **A sandbox**, where one Dev checkbox lifts every rule: dev missions,
  enemy aircraft, and any armament on any aircraft from any start.

Success means Mark can go from pilot to mission, aircraft and armament in
four short forms. Each form shows the description of what is selected. With
Dev off, nothing nonsensical is offered. With Dev on, nothing is withheld.

## Measured start (`main` at `19088be`, 2026-09-27)

- **Forms:** there are two, "Squadron Roster" and "Sortie Orders"
  (`TITLE_FORMS`, `titleScreen.ts`). Form 2 holds the mission and armament
  radiogroups. `onNewGame(loadout, scenarioId, pilotId)` carries no
  aircraft.
- **Player aircraft:** fixed per scenario. Every scenario names
  `f6f-hellcat`, and the rendered player mesh is always the Wildcat.
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
   - It replaces `missions-track`'s build-time (`import.meta.env.DEV`)
     gating of dev scenarios.
2. **Sortie Orders:** the mission list only, keeping `missions-track`'s
   Missions/Ranges headings.
   - Dev missions are listed only while Dev is checked.
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
   - It preselects the briefing's recommended loadout if allowed, otherwise
     the first allowed one.
   - With Dev on, an aircraft that has no stations for the chosen loadout is
     marked "dev layout: Hellcat stations".

**Navigation.** Every form has Back, Enter advances, and Launch is on
Form 4 only. The forms are labeled "Form N of 4". When an earlier choice
invalidates a later one, the later one resets to its default. Examples:
choosing a carrier mission after picking an aircraft that can't use a
carrier, or unchecking Dev after picking the Zero.

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
- **Rendering:** the player is drawn with the chosen spec's model, replacing
  the hard-wired Wildcat. The cockpit panel stays the F6F's for every
  aircraft; per-aircraft cockpits are a separate plan.
- **Dev sorties are not recorded.** No roster sortie, score, kills, mission
  badge, K.I.A. or discharge is written, and the debrief says "Dev sortie:
  not recorded".
- **URL:** `?scenario=` keeps working with the scenario's own aircraft and
  default loadout. No new URL parameters.

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
- A dev sortie leaves the roster byte-identical.

**Harness:** `startGame(page, { aircraft?, loadout?, dev? })` walks all
four forms. With no options it accepts every default, so the 34 specs that
depend on it fly the same Hellcat sortie as today.

**Tier 2, on the reference GPU:**

- A dev Zero with bombs releases a real bomb.
- A non-dev carrier mission offers only carrier-capable allied aircraft.
- The player's model matches the chosen aircraft.
- One capture of each form goes in the handoff.

## Open questions for the plan

Mark answers these when the plan is written:

- Viewing checkpoints: intermediate tasks, final product only, or none.
- Whether the run is attended.
- Main or a worktree.
