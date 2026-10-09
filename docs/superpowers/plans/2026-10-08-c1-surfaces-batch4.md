# C1 batch 4: control surfaces on the D3A Val and the B-17

**Goal:** ailerons, elevators, rudder and flaps move on the D3A and the B-17, the last two of the
twelve airframes (`MASTER_PLAN.md` Track C1). Same rulings as batches 1-3: visual only, 0.3 s slew,
full travel, default angles, flaps from `flapFraction`, names and hinge orientation per
`docs/models.md` §5.

**Run:** in the worktree `../ww2airsim-c1-batch4` (branch `c1-surfaces-batch4`), unattended (Mark, 2026-10-08).
**Viewing checkpoint:** the end of the plan only, in the Hangar on `ww2airsim-2.windomlane.org`.
Captures go in the handoff.

## Rulings (Mark, 2026-10-08)

| # | Ruling |
| --- | --- |
| R1 | The B-17 makes room under its 100,000-triangle limit by simplifying hidden detail (interior, seats, radio gear and similar). The limit stays. |
| R2 | Dive brakes stay static (batch 1's scope: ailerons, elevators, rudder, flaps). The D3A's brakes are their own pieces and are not touched. |

## Measured (2026-10-08, against `006ab367`)

| Model | Draws | Triangles | Bytes |
| --- | --- | --- | --- |
| D3A | 7 of 47 | 55,144 of 60,000 | budget 3,000,000 |
| B-17 | 31 of 47 | 99,425 of 100,000 | budget 5,000,000 |

Both raws rebuild their committed glbs byte for byte (`sketchfabEntries.test.ts`).

**What the downloads already model**, from their connected components (source frame, forward -x):

| Surface | D3A | B-17 |
| --- | --- | --- |
| Ailerons | in the one-piece wing (1,493 tris a side): **cut** | own pieces in `Object_43` (146 tris, \|z\| 8.91-14.61): **kept** |
| Flaps | in the wing: **cut** | own split-flap plates in `Object_43` (24 tris, \|z\| 1.43-8.81): **kept** |
| Elevators | in the one-piece tailplane (1,688 tris, \|z\| ≤ 2.457): **cut** | in the tailplane piece (336 tris a side): **cut** |
| Rudder | own piece in `Object_47` (52 tris): **kept** | own piece in `Object_43` (182 tris): **kept** |

A kept piece is a `components` split, hinged on its leading edge. A cut is a `triangles` split with a `cut` plane, as batches 2-3 did.

## Tasks

1. **D3A:**
   - Hinges from true sections: 0.25 of the local chord from the TE for the ailerons and flaps, 0.40 for the elevators.
   - Spans are ESTIMATE: no source found gives the D3A's aileron or flap span.
   - The rudder piece is hinged along its own leading edge.
2. **B-17:** the kept pieces are hinged on their leading edges, and the elevators are cut at 0.40 chord. Their spans are the download's own.
3. **Budget:**
   - Every new node gets `perNode: 1`, or the 0.1 default would decimate it.
   - The B-17 trims hidden detail only as far as the surfaces need, plus a small margin (R1). Before/after captures of the outside prove nothing visible changed.
4. **Rigs:**
   - Add `surfaces` rows to both airframes in `airframeRigs.ts`.
   - Enroll both in `aircraftRigs.test.ts`'s pinned list: direction, leading edge, open edge, closed shell and budget checks.
   - See each new check fail once.
5. **Verify:**
   - `sketchfabEntries.test.ts` (every download-built model rebuilds byte for byte), full suite via `remote-run`.
   - `hangar.spec.ts`, and `flyableAll.spec.ts` for both.
   - Captures: flaps from the side and from below, roll from the front.
6. **Docs:** `MASTER_PLAN.md` C1 (complete if all twelve are), the handoff.

## Done means

All of the above pass, the handoff is in `docs/handoff/2026-10-08-c1-surfaces-batch4.md`, and the branch is pushed, not merged.
