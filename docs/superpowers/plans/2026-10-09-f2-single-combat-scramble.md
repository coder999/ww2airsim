# F2: Single Combat and Scramble — plan

The two missions MASTER_PLAN Track F calls buildable now: Single Combat (no dependency) and Scramble (unblocked by E1's gunnery, merged 2026-10-09). GAMEPLAY.md lists them as "1v1 against a veteran Ki-84" and "intercept inbound G4M formation".

- **Branch:** `f-single-combat-scramble`, worktree `../ww2airsim-f2`, merged to `main` at the end.
- **Viewing checkpoint:** the final product only (Mark, 2026-10-09).
- **Run:** unattended. A parallel worktree is doing I1 (`src/audio/`), so this one edits `src/audio/radio.ts` only to add line entries.

## Missions

Each mission is one `content/scenarios/<id>.json` plus one `SCENARIO_OPTIONS` row. It uses existing objective kinds and pilots, and carries a badge, briefing and cited history (missions spec §6.3). The numbers below are starting values: the headless tests measure the timing and pin it with a dated comment, as Combat Air Patrol's test does.

### Single Combat (`single-combat`)

- **Start:** airborne in a Hellcat, 3,000 m over Leyte Gulf, east of Tacloban, heading west.
- **Opponent:** one Ki-84 (`ki-84-frank`) about 5 miles (8 km) west, heading east. Its pilot is `veteran` and targets the player.
- **Objectives:**
  - `destroy` the Frank (primary);
  - then `land` at Tacloban (primary).
- **Radio:**
  - at 1 s: "Tacloban tower: single bandit, a Frank, five miles west, angels ten. He's yours."
  - when it is destroyed: "Tacloban tower: splash one Frank. Come on home."
- **History:** the Ki-84 first saw combat in numbers in the air battle over Leyte, late 1944 (Pacific Wrecks, Ki-84 technical page), when the 4th Air Army committed every unit it had from 21 October (Cannon, *Leyte: The Return to the Philippines*, 1954, ch. VI). The text says the mission is inspired by those events, not a reconstruction.

### Scramble (`scramble`)

- **Start:** parked on Tacloban's runway, as in Airfield Strike.
- **Raid:** four G4M Bettys at about 3,000 m spawn about 30 miles (50 km) northwest of Tacloban, with two Zeros escorting.
  - All six fly 7e's ingress pilot to `{ airfield: tacloban }`.
  - All six are `green`; the Zeros engage on their own.
- **Objectives:**
  - `takeoff` from Tacloban;
  - `destroy` the Bettys (tag `raid`);
  - `deny` the Bettys within 5 km of the runway, labeled **"Keep the raid off"** so that its failure message reuses the existing voiced line "They broke through the screen!";
  - then `land` at Tacloban.
  - All are primary. The escorts are not an objective.
- **Radio:**
  - at 1 s: "Tacloban tower: scramble! Bettys inbound from the northwest, thirty miles, angels ten."
  - when the raid is destroyed: "Tacloban tower: raid's broken up. Bring it home."
- **History:** on 24 October 1944 an estimated 150 to 200 Japanese planes, mostly twin-engined bombers, came at northern Leyte. Sixty-six were shot down, and the Tacloban airstrip and the shipping off it were the principal targets (Cannon, ch. VI). The Bettys stand in for the mixed bombers of the real raids.

## Voice

There are four new lines, each in US English and Japanese:

- `radio_tower_single_bandit`
- `radio_tower_splash_frank`
- `radio_tower_scramble`
- `radio_tower_scramble_clear`

They are added to `docs/audio/firefly-prompt-sheet.md`, recorded as before (US in Clyde with `[American accent]`, Japanese in Adam), and staged on `sounds.html`. `RADIO_LINES` gains the four texts. The pins in `radio.test.ts` (34 stems) and `voice.test.ts` (68 files) rise to 38 and 76.

## Tests

Enrolled where a table exists:

- `content.test.ts`: the mission list.
- `titleScreen.test.ts`: the picker rows and the mission badges.
- `radio.test.ts` and `voice.test.ts` (above).

Headless verdict tests, one file per mission as the four existing missions have. Each covers:

- a measured timing pin: when the Frank closes, and when the raid breaches 5 km with a passive player;
- success: destroy, recover, badge;
- failure: Scramble's breach, then recovery, gives no badge.

One table-driven E2E case covers both missions: briefing, opening objective, the opening radio call, and the chart. It runs on a local vite.

## Docs

- MASTER_PLAN Track F: both missions done.
- A handoff in `docs/handoff/` with the E2E captures.
