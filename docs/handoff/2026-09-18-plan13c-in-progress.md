# Plan 13c — in progress, status at 2026-09-18

Written mid-execution because the session was nearly out of budget. This is
the committed copy of the state; the working detail is in the gitignored
ledger at `.superpowers/sdd/2026-09-18-coast-rebuild/progress.md`, which a
`git clean -fdx` would destroy.

**Plan:** `docs/superpowers/plans/2026-09-18-coast-rebuild.md` (six tasks).
**Spec:** `docs/superpowers/specs/2026-09-18-land-cover-design.md` §6.

## Where it stands

| Task | State |
| --- | --- |
| 1 — Sea connectivity (`tools/landcover/sea.ts`) | **Complete**, `0463e11..4f341da`, two fix rounds |
| 2 — The coast rule (`tools/terrain/coast.ts`) | **Complete**, `4f341da..467c758`, one fix round |
| 3 — Wire into the build, rebuild, regenerate digests | Not started |
| 4 — Re-record renderer numbers | Not started |
| 5 — Re-run the flight cards | Not started |
| 6 — Tier 2, look at it, hand off | Not started |

**Resume at Task 3.** Tasks 1 and 2 are both closed with clean reviews.
Task 3 was held deliberately rather than started: it is a multi-minute
rebuild of nine committed terrain levels plus 171 MB of local tiles, and
beginning it without the budget to verify the landmarks, the tripwire and the
regenerated digests would leave the worst possible half-state.

## Nothing here is live yet

13c has so far added only `tools/` code and tests. No file under `src/`
changed, no committed content was regenerated, and production is unaffected —
prod is on `274a92f` and needs no deploy. The first task that changes shipped
data is Task 3.

## The one thing worth knowing before resuming Task 3

Task 3 rebuilds all nine committed terrain levels plus 171 MB of gitignored
local tiles, and regenerates `COMMITTED_SHA256`. It carries a tripwire: the
design spec predicts the Tacloban strip's ground height cannot move, because
the strip is land in both datasets. **If it moves at all, stop** — that means
the sea mask is wet where it should be dry, and it is a finding rather than a
number to re-record.

## What Task 1 turned up, because it generalizes

The plan's own `openSeaMask` **crashed on every real tile** and a fully green
suite could not see it: WorldCover's internal overviews carry no GeoKeys
(standard GDAL COG behavior), so `getOrigin()` on the overview IFD threw. The
tests covered only the pure `floodSeaFromBoundary` beside it. The implementer
found it while verifying, not through a test.

It is now pinned by a skip-guarded smoke test against the cached tiles, with
Leyte Gulf > 0.99 sea, Mt Nacolod < 0.01, and **Lake Danao (11.07111 N,
124.69389 E, 650 m — Wikipedia, read 2026-09-18) at exactly 0**, which is the
assertion that proves "water class" and "sea" are different things and is the
entire reason that module exists.

The general lesson, for 13d and after: a pure function beside an I/O function
gives a green suite that proves nothing about the I/O.

## Also agreed but not yet written: the audio subsystem

Designed in chat 2026-09-18, approved in outline, **no spec file yet**. Fixed
decisions, not to be re-litigated:

- Engine: `propeller.wav` looping, with gain **and** `playbackRate` both
  tracking `controls.throttle`, **silent at zero throttle** — Mark chose this
  over an idle floor.
- `water_crash.wav` on `impact.kind === 'ditched'`; `explosion.wav` on
  `impact.kind === 'destroyed'`; `landing_squeak.wav` on `onGround()` going
  false → true. `bombs_away.wav` and `machinegun.wav` stay unwired until
  combat exists.
- Loop points via `AudioBufferSourceNode.loopStart/loopEnd`, **not** by
  trimming the committed WAV — neither ffmpeg nor sox is installed here, and
  a loop point in code is reviewable in a way a re-cut binary is not.
- The WAVs must move from the repo root to `content/audio/` or they do not
  ship at all: `copyContent()` in `vite.config.ts` copies `content/` only.
- `AudioContext` resumes on first keypress. No play-screen UI (standing
  rule); mute lives in the `/` controls panel.

Open, deferred by Mark: whether to run audio serially after 13c or in
parallel. If parallel, it needs a **separate clone** — not a git worktree,
because the dev server serves this directory.
