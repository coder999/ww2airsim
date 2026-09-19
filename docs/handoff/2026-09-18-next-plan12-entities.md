> **Superseded 2026-09-18.** Plan 12 is complete; read the final
> [Plan 12 handoff](2026-09-18-plan12-entities.md) for the implemented
> world shape, measurements, assumptions and remaining seams. This note is
> retained as the pre-implementation record.

# Handoff — start here for Plan 12 (entities, ships and airfields)

Written 2026-09-18 for the agent picking up next. Mark chose Plan 12 as the
next plan and asked for the most capable agent on it, because it is the one
that reshapes `World` itself and therefore touches the physics, the renderer
and the golden trajectory at the same time.

`main` is at `a60f4eb`, pushed, working tree clean, `npm run verify` rc=0
(1008 passed, 1 skipped).

## Read these, in this order, before writing anything

1. `~/projects/CLAUDE.md`, then this repo's own `CLAUDE.md`. The repo's wins.
2. `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` §15 — the roadmap
   table AND the three couplings written under it. Coupling 2 is Plan 12's
   entire mandate and is quoted nowhere else on purpose.
3. `docs/superpowers/plans/2026-09-12-plan1-rulings.md` — 43 dated decisions
   with what each costs if reversed. Check it before "fixing" anything that
   looks like an oversight.

## The one decision waiting for Mark

**Production is three features behind and he has not deployed.** Verified
2026-09-18:

```
curl -o /dev/null -w '%{http_code}' https://ww2airsim.marktuttle.dev/content/terrain/L2.bin      -> 404
curl -o /dev/null -w '%{http_code}' https://ww2airsim.marktuttle.dev/content/audio/propeller.wav -> 404
```

So the public site still has the blocky 391 m coastline Mark complained about,
and no sound. Pushing `main` does not deploy; deploys are
`gh workflow run deploy.yml --repo coder999/ww2airsim` and are **Mark's call,
not yours**. Ask; do not run it because it looks obviously good.

## What Plan 12 actually owns

Not "add ships". The mandate in §15 coupling 2: **generalise the single-entity
`World`**, and do it now rather than letting the combat plan do it, because a
shape derived from airplanes alone has to be bent afterwards to carry a moving
deck — which is a reference frame, not another airplane.

Today `World` (`src/sim/loop.ts`) holds exactly one aircraft: `spec`,
`aircraft`, `controls`, `terrain`, `impact`, `accumulatorSeconds`. Read those
fields' doc comments before designing the replacement — several say *why* they
live in `World` rather than in a caller's closure, and that argument constrains
what a multi-entity version may look like. `impact`'s comment in particular
(a world written to disk and read back must still remember it crashed) is a
serialisation constraint, not a style preference.

Plan 11 already owns one static runway, deliberately: a prepared strip does not
move, carries no AI, and needs nothing the entity system provides. Plan 12
keeps the full airfield content and the moving ships. **Take Tacloban's
coordinate from `tests/tools/terrainBuild.test.ts`, never re-derive it** — §15
explains why, with the error figure.

## Rules that are expensive to get wrong here

- **Work directly on `main` in this checkout. Do NOT use a git worktree.** The
  vite dev server serves this directory; a worktree is unreachable, and being
  able to stage and view the change is the whole point. (Repo `CLAUDE.md`.)
- **`git clean -fdx` destroys ~275 MB** of gitignored, expensive terrain data
  that exists nowhere else (`content/terrain/tiles/`, `tools/terrain/cache/`).
- **Never push or deploy unasked.** Both are Mark's call, separately.
- **US spelling** in new prose and identifiers.
- `npm run verify` is typecheck + lint (`--max-warnings 0`) + depcruise + test.
  Every task ends with it, and **capture the exit status directly** — do not
  gate a commit on a grepped pipeline, the exit code is grep's.

## Traps this session hit, which would have cost you hours

- **`FINEST_FETCHED_LEVEL` is now 2 (98 m), changed 2026-09-18.** It was 4
  (391 m) and that number *was* the blocky-coast bug. Any doc or comment still
  saying 390.6 m is stale.
- **`mips.ts`'s `halve` is a `[1,2,1]` tent filter and does not preserve a
  binary land/sea boundary.** This killed Plan 13c: a shoreline written at 24 m
  washes out to nothing by the time it reaches the shipped level. If you ever
  plan to "fix it at the fine grid and let the pyramid carry it down", it does
  not work — measured, net -203 land cells at L4.
- **`heightAt` returns `SEA_LEVEL_M` over open water**, so `onGround` is true
  when the airplane touches the sea, one or more frames before `advance`
  registers an impact. Any rule of the form "on the ground ⇒ landed" is wrong.
- **`contactOutcome` returns `'destroyed'` for a hard arrival on water** as
  readily as on land. `'ditched'` means *survivable*, not *wet*. Use
  `Impact.surface` when you mean water-versus-land.
- **Restart rewinds the simulation tick.** `main.ts`'s debrief callback rebuilds
  the frame from `initialFrameState` with the boot aircraft, so any per-frame
  memory must treat a backwards tick as a new flight. Entity bookkeeping will
  hit this immediately.
- **Tier 2: `__ww2` is published early in `boot()` but the keydown listener is
  attached hundreds of lines later.** A key sent as soon as `__ww2` exists lands
  before anything is listening. Wait for `waitForTerrain` first. Two audio specs
  "failed" this way while the app was working perfectly.
- **A plan's own numbers are claims, not premises.** Plan 13c's verification
  script read the wrong pyramid level and named a file that does not exist;
  Plan 15's loop measurement quoted a baseline that does not reproduce. Run a
  plan's arithmetic against the repo before executing it.

## GPU and listening work

nexus is headless. Tier 2 and anything visual run against the Windows desktop:
`PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org npm run test:tier2`,
with `npm run dev:lan` serving this checkout and the tunnel up
(`ss -ltn | grep 39001`, else `ssh -N -L 39001:127.0.0.1:3000 ryzen &`). The
Playwright server must be running in Mark's interactive console session.

`ww2airsim.windomlane.org` serves the **dev server off this working copy**;
`ww2airsim.marktuttle.dev` serves the deployed build. They are different things.
`*.marktuttle.dev` is unreachable from Mark's work network — send him to a
windomlane host, and assert it is up first
(`curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim.windomlane.org/` → 200).

Frame-time budget to stay inside: **gpu p95 under 6.0 ms at 1440p**. Last
measured 2026-09-18 at p50 5.112 / p95 5.177 ms, carrying L2 terrain and audio.

## Inherited open items (none block Plan 12)

- **Audio has never been heard over a long flight.** If a click appears roughly
  every eight seconds, the loop points are not reaching
  `AudioBufferSourceNode` — a wiring bug in `webAudio.ts`, not a number to
  re-tune. Constants are pinned by `tests/audio/loopPoints.test.ts`.
- **First-visit autoplay is unverified.** The reference runner's browser
  already grants autoplay, so the Tier 2 case is a documented `test.skip`.
  Needs one manual check in a fresh profile. **Never** add
  `--autoplay-policy=no-user-gesture-required` to make it green.
- `bombs_away.wav` and `machinegun.wav` ship but are unwired until combat.
- **13c is abandoned, deliberately.** Its row in §15 says so and why.
  `tools/landcover/sea.ts` and `tools/terrain/coast.ts` are committed, reviewed
  and unwired. Do not rewire them without reading that row first.
- 13d (Dulag, villages, roads) has a design and Mark's answers already; it is
  the smaller alternative if Plan 12 is ever blocked.

## Where the rulings ledgers live

`.superpowers/sdd/<plan>/progress.md`, gitignored, so they are not in a clone.
They hold the decisions made on Mark's behalf mid-execution with what each
costs if wrong. Write one. The 13c ledger is worth reading as an example of
recording a plan that turned out to be wrong rather than quietly abandoning it.

## How Mark works

He is a technical playground owner: the engineering is the deliverable. He asks
to be kept out of the testing loop, so do not design in manual verification
steps. He flies the result and his ear and eye find things the suite cannot —
on 2026-09-18 he caught three audio defects and one entirely ineffective
terrain change that all had green tests. **When he says he cannot perceive a
difference, believe him and go measure at the level he is actually looking at.**
