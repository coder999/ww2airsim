# Handoff: C1 batch 4, control surfaces on the D3A and B-17 (2026-10-08)

Plan: [`docs/superpowers/plans/2026-10-08-c1-surfaces-batch4.md`](../superpowers/plans/2026-10-08-c1-surfaces-batch4.md).
Branch `c1-surfaces-batch4`, worktree `../ww2airsim-c1-batch4`, unattended, not merged.

With this batch **C1 is complete**: all twelve airframes move their ailerons, elevators, rudders and flaps.

## Checkpoint (Mark)

- **Live:** `https://ww2airsim-2.windomlane.org/hangar.html?bench`, served from this worktree. Hard-refresh, pick the D3A or the B-17, and use the roll, pitch and yaw sliders and the flaps.
- **Captures** are in [`2026-10-08-c1-surfaces-batch4-shots/`](2026-10-08-c1-surfaces-batch4-shots/), for each airframe:
  - `*-rest-{3q,side,front}-before-after.jpg`: the outside at rest, before (main) on the left and after on the right. These prove the trims changed nothing you can see.
  - `*-close-roll-front.jpg`: full right roll.
  - `*-close-pitchyaw.jpg`: pitch up with yaw right.
  - `*-close-flaps-below.jpg` and `*-close-flaps-lowrear.jpg`: flaps down, from below and from low behind.

  I checked them myself and found no hollow or see-through piece.

## What landed

**D3A Val**
- **Cut:** the ailerons, flaps and elevators are cut from the download's one-piece wing (1,493 triangles a side) and tailplane (1,688). Hinges come from true sections, at 0.25 of the local chord from the trailing edge for the ailerons and flaps and 0.40 for the elevators.
- **Spans, ESTIMATE:** ailerons 55% to 92% of the semispan (source \|z\| 3.94 to 6.59); flaps \|z\| 0.95 to 3.80, outboard of the wing-root fillet; elevators \|z\| 0.2 to 2.4 of 2.457. No source gives the D3A's aileron or flap span. A search turned up only overall dimensions (14.37 m span, 34.9 m² wing).
- **Rudder:** the download's own 52-triangle piece, hinged along its leading edge.
- **Dive brakes:** their own pieces, untouched and static (C1 scope). Spatted gear and props are untouched too.

**B-17**
- **Kept pieces:** the download already models the ailerons (146 triangles each), split flaps (24-triangle plates under the wing) and rudder (182) as their own pieces. They are now `components` splits, each hinged on its own leading edge: the 10%/90% span line, slid forward so nothing stands ahead of it.
- **Cut:** the elevators are cut from the tailplane piece at 0.40 chord, from \|z\| 0.75, clear of the fuselage at 0.67, to 5.5. They stop short of the tip because the download's tip is a separate, unwelded panel at \|z\| ≈ 5.6. A cut across that seam leaves a 12 cm open edge, so the elevators end inboard of it.
- **Spans** are the download's own, except the elevators' outer end.
- **Bay doors:** unchanged and still working (`hangar.spec` 7b; `flyableAll` dropped its bombs).

**Hinge orientation:** both downloads face -x in source, so aft is +x, and normalize's 180° turn makes source -z the starboard (R) side. In source the axes need z > 0 on the horizontals and y > 0 on the rudder, which gives docs/models.md §5's rule in the output. The direction checks confirm it on the committed glbs.

## Trims (Mark's ruling: "Trim more hidden detail")

| Model | Trimmed | Why it's unseen | Change |
| --- | --- | --- | --- |
| B-17 | `Object_33` interior shell, 0.8 → 0.35 | inside the fuselage; seen only darkly through windows and the open bay, and it still fills the bay (no see-through) | about -2,900 triangles |
| B-17 | `Object_40` seat, 0.2 → 0.1 | inside the cockpit | about -370 |
| D3A | `Object_14` cockpit interior, 1 → 0.6 | inside the cockpit, under the canopy | about -1,000 |

The rest-pose before/after captures are indistinguishable. Left alone, because they are visible: the B-17's engines (53,755 triangles, their cylinders show through the cowl fronts), its guns and its glazing.

## Counts

| Model | Draws (limit) | Triangles (limit) | Bytes (limit) |
| --- | --- | --- | --- |
| D3A | 7 → 14 (47) | 55,144 → 59,371 (60,000) | 2,278,048 → 2,393,336 (3,000,000) |
| B-17 | 31 → 38 (47) | 99,425 → 99,762 (100,000) | 3,924,812 → 3,938,996 (5,000,000) |

The B-17's elevator cut cost about 1,700 triangles: slicing and capping the tailplane, plus a shifted simplification of the joined body. The kept pieces cost nothing. The B-17 now has 238 triangles to spare.

## Tests

- **Raws first:** both raws rebuilt their committed glbs byte for byte before any change (`sketchfabEntries.test.ts`). Both rebuild again now, and every other download does too.
- **`aircraftRigs.test.ts`:** both airframes are enrolled in the pinned surfaces list. All 14 new surfaces pass the direction, leading-edge, open-edge and closed-shell checks, and both are inside budget.
- **One pinned exception:** `b-17-flying-fortress/ElevatorL` at 0.40 m of open edge. That is no gap: it is one 0.2 m edge counted twice, reversed, under 0.1 mm apart. It's a zero-width spur where the hinge plane meets an internal spar face of the tailplane. Moving the hinge (0.41 chord) only moved the spurs (to 1.24 m), so I kept 0.40, which leaves ElevatorR fully closed.
- **Seen red:**
  - flipping the D3A's `AileronR` axis failed its direction check;
  - flipping the B-17's `Rudder` axis failed its direction check;
  - the elevator seam and the spurs failed the open-edge check until handled as above.
- **Full suite via remote-run:** 4,801 passed, 10 named skips.
- **`hangar.spec.ts`:** 20/20 on nexus.
- **`flyableAll.spec.ts`:** the D3A and the B-17 each launch loaded, take off and drop their bombs, 2/2.

## Unresolved

- **The B-17 is at 99,762 of 100,000 triangles.** Any further B-17 work needs more trimming or a higher limit.
- **The D3A's spans are estimates** (no source found).
- **Possible pale ends:** from directly below, the ends of the D3A's ailerons may catch light. Each cap is painted in one texel of the skin, as batches 2-3 did. Mark's eye decides.
- **Two kinds of flap:** the B-17's split flaps are the download's thin plates, while the D3A's flaps are cut from the full wing section.
