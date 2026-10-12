# Carrier Qualification guidance handoff (2026-10-11)

Branch `carrier-quals-guidance`; isolated worktree `/home/mark/projects/ww2airsim-carrier-quals-guidance`. Unattended run.

## What changed

- After the first launch, the instructor now says to raise gear and flaps, hold 500-1,000 feet and follow DOWNWIND. The same cleanup reminder is emitted after each intermediate trap and respot, so the second and third launches are taught too.
- Completing DOWNWIND now adds an explicit instruction to follow LINEUP astern, slow toward the displayed approach speed and hold the displayed altitude until turning final.
- An active carrier landing objective no longer points at the carrier's chart center. Outside the groove, the in-world steering cue follows a moving point 2,250 m astern of the live trap zone (90% of Paddles' 2,500 m window) on the carrier's real 3.5-degree glideslope. For the F6F it reads `LINEUP · 97 MPH · 500 FT` plus range.
- Once the airplane is astern, inside Paddles' cone and range, and closing on the deck, the cue switches to the live trap-zone center and reads `FINAL · 97 MPH · GEAR FLAPS HOOK` plus range.
- The displayed speed is derived from the selected airframe's full-flap stall speed using the same 1.15 multiple as Paddles, rather than being a duplicated mission literal.
- Paddles' fast and slow voice pools now use only the factual “You're fast” / “You're slow” takes. The removed variants said “easy on the power” or “add power,” even though Paddles observes airspeed rather than throttle and therefore could not know whether that control advice was correct.

The guidance is presentation-only. It does not alter the carrier, flight model, pass window, landing score or objective rules.

## Verification

- Focused unit and mission run: 4 files, 33 tests passed.
- TypeScript typecheck, targeted ESLint and `git diff --check` passed after the browser addition.
- Nexus real-GPU browser regression passed: the production Carrier Qualification mission advanced from an airborne downwind spawn to `TRAP 0/3`, rendered `LINEUP · 97 MPH · 500 FT`, carried both new coaching messages through the mission log, and reported no validation errors.
- The full `npm run verify` was run on Ryzen: 423 of 426 files and 6,232 tests passed. Every changed carrier, mission, steering and audio test passed. Three failures were outside this patch: the entity soak exceeded its 30-second whole-suite timeout but passed alone in 13.3 seconds; the untouched ship-view test has a stale expected registry list that omits three registered Blender variants; and the untouched Escort easy-difficulty test gets one bomber loss where its assertion requires more than one. The latter two reproduced in isolation and remain base-branch issues.

## Review checkpoint

Automated checks prove the geometry, derived numbers, mission transitions and browser wiring. A human flight remains the useful final-product checkpoint: fly the mission normally and judge whether the DOWNWIND-to-LINEUP transition gives enough time and space to configure without chasing the cue. The 2,250 m entry is deliberately just inside Paddles' 2,500 m window; it can be moved farther astern later without changing Paddles or scoring.
