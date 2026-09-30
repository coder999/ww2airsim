# Plan: Gunnery Range as a strafing pass that ends in a landing

- **Status:** executing 2026-09-29 on branch `worktree-tier2-stale`
  (worktree `ww2airsim-worktrees/tier2-stale`, dev slot `ww2airsim-2`).
- **Mark's viewing checkpoints:** final product only (Mark, 2026-09-29).
  Unattended between checkpoints.
- **Decisions (Mark, 2026-09-29):**
  - The range starts airborne, on a strafing run-in.
  - The pass ends in a landing straight ahead.

## Why

Since `817fbd3` (T1, 2026-09-28), parked aircraft spawn at their rest pitch,
which is 9.45° nose-up for the Hellcat. From the Gunnery Range's parked start,
the guns point about 50 m over target-1, which is 300 m away. That holds for
the player as well as the tests. This broke:

- `gunnery:35`
- `meta-game:39`
- `meta-game-relaunch:148`
- the firing half of `friendly-fire:120`

The shared hop-and-land script (`hopClear` + `landAndStop`) is open-loop key
timing measured on 2026-09-24, before T1. Traced 2026-09-29, it porpoises and
hits the sea about 1.45 km downrange. This broke:

- `dossier:9`
- `mission-ui:159`
- the landing halves of `friendly-fire:120` and `relaunch:148`

## Measured constraints

- **Runway.** Tacloban's runway runs north-south (heading 0), is 1,500 m by
  45 m, and is centered at world (-29666, -47605). Local +z is south.
- **Terrain** (ground-truth level, 2026-09-29):
  - South of the south threshold (local z > +750) is 0.0–0.3 m, sea or
    shoreline.
  - North of the north threshold there is only about 250 m of 1.5–1.8 m land.
  - There is no dry field short of either end. The targets therefore sit on
    the runway's southern overrun, and the pass lands north past them.
- **Diagnostics.** They expose position, controls, airspeed
  (`combat().player.stress`) and ground contact, but no attitude. They are
  read-only by design: tests fly by keys (`diagnostics.ts`, `assists`).

## Tasks

1. **Attitude diagnostic.** Add a read-only `__ww2.attitude()` returning
   pitch, roll, heading and flight-path angle in radians. Unit test it where
   the diagnostics are unit-tested.
2. **In-page test pilot** (`tests/e2e/pilot.ts`). One `page.evaluate` runs a
   `requestAnimationFrame` loop that reads `__ww2` and dispatches the same
   `keydown`/`keyup` events a player's keyboard does, at frame rate rather
   than 300 ms polling round trips over the remote WebSocket. It has phases:
   - **aim:** hold the gun line on a target and fire inside a range window
   - **level:** pull out to a height
   - **glide:** flight-path angle to a touchdown point, gear down, idle
   - **flare**
   - **rollout:** brakes to a stop

   The pilot resolves with a trace, which the spec logs on failure.
   `landAndStop` and `hopClear` are rebuilt on it, and their callers keep
   their signatures.
3. **Scenario.**
   - `gunnery-range.json`: the player moves to `airborneAt`, south of
     Tacloban over the water, heading 0, lined up with the runway. Height,
     distance and speed are tuned in Tier 1 so the pilot's pass kills
     target-1 and then lands. The targets move onto the southern overrun.
   - The title description is updated.
   - `friendly-fire-field.json` gets the same layout, with `ally-1` as the
     target.
4. **Tier 1 pin.** A sim test flies the shipped start with the Tier 1 port of
   the pilot's aim phase and asserts target-1 is destroyed.
   `friendlyFire.test.ts`'s `levelled` workaround for the parked sortie is
   replaced by the real start.
5. **Specs.**
   - gunnery (its three tests)
   - meta-game
   - meta-game-relaunch
   - dossier
   - friendly-fire:120
   - mission-ui:159 (landing only)
   - scenarioPicker (entity list)
   - cloudShadow's range view. It needs a parked scenario, since a pixel
     comparison of a moving airplane is meaningless, so it moves to
     `free-flight`.
6. **Docs.**
   - `docs/testing.md` for the range's layout
   - `GAMEPLAY.md` for the range
   - a handoff
7. **Verify.**
   - `remote-run npm run verify`, `rc=0`
   - the affected Tier 2 specs run singly on ryzen
   - no full-suite run

## Out of scope

- The soak failure (ground penetration at seed 1337). That is the next
  investigation.
- ordnance:48 and takeoff:25, which are session-0 artifacts to confirm in the
  console session.
