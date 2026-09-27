# R2 handoff: the complete ship roster (2026-09-26)

R2 carries out S2. It puts a fitted model behind every ship in the Library
and adds the seven S2 `ShipSpec`s. It places nothing in a scenario and adds
no turret motion (that is H3). The design is
[`2026-09-26-model-roster-design.md`](../superpowers/specs/2026-09-26-model-roster-design.md)
§§3–7. The plan is
[`2026-09-26-r2-ship-models.md`](../superpowers/plans/2026-09-26-r2-ship-models.md).

This work is **complete on branch `worktree-r2-ships`**, and Mark had it
merged into `main` on 2026-09-26 (`fcaef87`). The branch's commits
`86774d3`..`c4d7bad` were cut from `main` at `a0005ff`.

## What shipped

- **Seven strict `ShipSpec`s** in `content/ships/<id>.json`. Length, beam and
  maximum speed are cited, and each file's `reference` names its source.
  Deck height is an `ESTIMATE`. Turn rate and hull HP are gameplay choices
  on Plan 6b's scale (Fletcher 160, merchant 240, Essex 600).
- **Four licensed models** through S1's existing fit pipeline. Sketchfab
  licenses were rechecked through the API (uid, author, `by`, viewer URL)
  before each entry was committed.
- **Three original Blender models** from an extended kit: a station-lofted
  `ship_hull`, deck, tapered box, cylinder, and named `TurretN` bow to stern
  (ordered for H3).
- **An `ijn` palette** next to `usn-1944`. Every palette carries every
  `SHIP_ROLES` key.
- **Complete registration**: all ten ship ids are in `SHIP_MODELS`, and every
  `kind: ship` Library entry names its spec. The spec's `view.model` is the
  one path the game and the Hangar both use. The Library entries carry no
  `model` field.
- **`NOT_YET_DRAWN` went from 25 to 18** in
  `tests/render/hangar/roster.test.ts`, with `CEILING === 18`.

| id | source | spec length × beam (m) | max speed | output bytes / tris / draws | budget |
| --- | --- | --- | --- | --- | --- |
| `cleveland-cl` | Sketchfab, KTKloss, CC BY | 185.95 × 20.22 | 32.5 kn | 437,764 / 9,487 / 3 | 3 MB / 45k / 12 |
| `mogami-ca` | Sketchfab, KTKloss, CC BY | 200.6 × 20.2 | 35 kn | 254,540 / 5,679 / 3 | 3 MB / 45k / 12 |
| `yamato-bb` | Sketchfab, KTKloss (Musashi), CC BY | 263.0 × 38.9 | 28 kn | 462,000 / 10,196 / 3 | 3 MB / 45k / 12 |
| `shiratsuyu-dd` | Sketchfab, everlasting17th (Samidare), CC BY | 107.5 × 9.9 | 34 kn | 3,460,604 / 64,047 / 12 | **4 MB / 70k / 12** |
| `pennsylvania-bb` | Blender, AGPL | 185.32 × 32.39 | 21 kn | 35,384 / 548 / 9 | 3 MB / 45k / 12 |
| `kagero-dd` | Blender, AGPL | 118.5 × 10.8 | 35 kn | 23,940 / 364 / 7 | 3 MB / 45k / 12 |
| `casablanca-cve` | Blender, AGPL | 156.13 × 19.86; flight deck 145.69 × 24.38 | 19.3 kn | 16,056 / 224 / 5 | 3 MB / 45k / 12 |

## Tier 1

`remote-run npm run verify`, final run (after the deck fix): **rc=0**, 254
files (253 passed, 1 skipped), **2,660 passed, 29 skipped**. An earlier
verify in this session was red on the furball flake (see below) and then on
nothing: rc=0, 2,658 passed, 28 skipped. The two extra passes are the new
deck-edge checks, which need no Blender. The one extra skip is the new kit
test, a named skip on ryzen, which has no Blender.

The nexus Blender-only run: `npx vitest run tests/tools/models/blender
tests/tools/models/blenderEntries.test.ts --maxWorkers=1`: **rc=0**, 4
files, **40 passed, none skipped**. This includes byte-identical rebuilds of
all three R2 Blender ships and the hangar.

Per-task focused runs are in the ledger. Typecheck, full lint and depcruise
(227 modules / 667 dependencies) were rc=0 at Task 6, and `verify` re-runs
all three.

**No game change**: `git diff main...HEAD -- content/scenarios src/sim` is
empty. The only file under `tests/sim` is the new
`tests/sim/world/shipRoster.test.ts`.

## Tier 2

Slot `ww2airsim-2.windomlane.org` (port 5175), RX 6700 XT, 2560×1440.

- **Hangar + ship suites: 20/20, zero validation errors**, run twice: once
  at Task 7 (2.9 min) and again after the deck fix below (2.8 min). Every
  new model drew with `"over":false` against its budget.
- **GPU p95 at 1440p** (Task 7): deck-quals 7.566 ms over 169 samples,
  strike-range 2.115 ms over 450 samples. Both are under the ship spec's
  8.33 ms ceiling. Deck-quals is above the 6.0 ms general budget, but R2
  places no ship in any scenario, so this measures S1's scene and not
  R2's models.

## Mark's checkpoint

One frozen three-quarter Hangar view per new ship, in
[`2026-09-26-r2-shots/`](2026-09-26-r2-shots/):
[Cleveland](2026-09-26-r2-shots/cleveland-cl.png),
[Mogami](2026-09-26-r2-shots/mogami-ca.png),
[Yamato](2026-09-26-r2-shots/yamato-bb.png),
[Shiratsuyu](2026-09-26-r2-shots/shiratsuyu-dd.png),
[Pennsylvania](2026-09-26-r2-shots/pennsylvania-bb.png),
[Kagero](2026-09-26-r2-shots/kagero-dd.png),
[Casablanca](2026-09-26-r2-shots/casablanca-cve.png).

Each capture was checked for bow to +x, waterline on the platform,
Casablanca's island to starboard, opaque Shiratsuyu textures, distinct
silhouettes, and turret order.

To see them live: the slot server has been stopped. Start this worktree's
server on a free slot (CLAUDE.md, "Two more dev-server slots"), assert
`curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim-2.windomlane.org/`
prints `200`, then open `/hangar.html?bench`.

## Departures

Summarized from the ledger's `Ruling:` lines
(`.superpowers/sdd/2026-09-26-r2-ship-models/progress.md`, gitignored):

- **The seven ids were registered in Task 1, not Task 6.** A spec with
  `view.model` fails the existing registry test otherwise. None was
  reachable from a scenario or the Library before its glb landed.
- **Yamato's estimated deck height is 9 m, not the plan's 12 m.** The
  fitted source's dominant deck is 7.41 m. 9 m is inside S1's ±3 m fit
  gate; 12 m was not. No sourced dimension changed.
- **Shiratsuyu's budget is 4 MB / 70k / 12, up from 3 MB / 45k.**
  Simplification bottoms out at 64,047 triangles, even at ratio 0.10,
  because the source has many UV/material seams. Dropping all 23 textures
  from 512 to 256 px brought the file to 3.46 MB with no visible silhouette
  loss. The alternative was a destructive hand retopology of rigging and
  weapons.
- **Casablanca has no separate gallery slab.** Its 2,556 m² top made
  y = 7.5 m the dominant plane over the 3,551 m² flight deck, so the
  carrier fitter correctly refused it.
- **Two test adjustments.** The pre-O1 manifest regression now filters by
  its fixture ids. The ship-stage negative palette case uses
  `not-a-palette`, because `ijn` is now valid.
- **Stale pins found by the full suite.** Three S1-era tests were outside
  every focused per-task run: the committed-ship id list, a provenance
  check that assumed every ship is a Sketchfab download, the fallback
  message's registered-id list, and the credit line. Blender ships now
  assert `source: blender` plus their script; mutating the script name
  fails exactly those three. Commit `07c225a`.
- **Deck fix after reading the frozen captures.** Pennsylvania's and
  Kagero's rectangular `MainDeck` slabs stuck out past the tapered bow and
  stern. Measured from the committed bytes: Pennsylvania had |z| 14.52 m
  against a 5.16 m hull edge at x = +83, and Kagero 4.71 m against 1.50 m.
  The slab tops were also coplanar with the hull's closed top, which showed
  as sawtooth z-fighting amidships. `ship_hull` now takes
  `deck_role`/`deck_node` and emits its own top as the painted deck, so
  the deck follows plan and sheer and nothing is coplanar. A new Tier 1
  check measures the deck against the hull edge from committed bytes (red
  on the old glbs, green on the new). The kit test pins the split.
  Casablanca does not use the argument and its bytes are unchanged. Both
  ships were rebuilt, re-run through Tier 2 and refrozen. A control capture
  of the unchanged Cleveland matched its committed PNG pixel for pixel,
  which proves the refreeze used the same framing. Commits `796a89a` and
  `9c945b9`.

## Found along the way

- **The furball soak flake on `main`, again.** The second verify of this
  session went red on `tests/sim/ai/furball.test.ts`: its `beforeAll`
  hit the 10 s hook timeout under full-suite contention on ryzen. Run
  alone, it passed 8/8 in 2.7 s, and a rerun of verify was green. R1's
  handoff recorded the same flake. The cause is that `vitest.config.ts`
  raises `testTimeout` to 30 s but leaves `hookTimeout` at the 10 s
  default, and this soak runs in a hook. Fixed on `main` after the merge
  (2026-09-27): `hookTimeout: 30_000` in `vitest.config.ts`.
- **The dev server on port 5174** (`ww2airsim-3`, another session's) was
  gone by the end of this run. R2 only ever started and stopped its own
  5175 server, but whoever owns 5174 should know.

## Open items

- **The credit line now reads `Models: KTKloss, KTKloss, JZHU, KTKloss,
  everlasting17th, AlanTinka, rojatsu, KTKloss (CC BY 4.0)`.** That is by
  design: one credit per work, each author name linked to its own model,
  which is what CC BY §3(a) asks for. It reads oddly. One alternative is
  one name per author with several links ("KTKloss (4)"). That is a UI
  choice for Mark, so it is not changed here.
- **Casablanca reuses the Essex `trapZone` and paddles choices**, as the
  plan defaulted. The ledger records no departure, but nothing flies a CVE
  approach yet to test them.
- **Scenario placement and H3 turret motion** are later plans. The turrets
  are already named `Turret1...` bow to stern for H3.
- **R1's two open decisions still stand** (an entry with both a spec and
  its own `model`). R2 avoided the case by linking specs only.
