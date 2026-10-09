# M1c: Finer detail and better textures on our three Blender ships

**Goal:** Pennsylvania, Kagero and Casablanca read as detailed as the best downloads, close up and from the air. Track M in `MASTER_PLAN.md`; this follows M1 and M1b (`docs/handoff/2026-10-08-m1-ship-models.md`, `2026-10-09-m1b-aa-mounts.md`).

**Run:** worktree `m1c-ship-detail`, merged to `main` at the end. Unattended.
**Viewing checkpoints:** Pennsylvania done first, since it sets the bar. Its captures go in the handoff, and the run continues to Kagero and Casablanca without stopping.
**Machines:**
- Geometry builds: Blender on nexus or Ryzen WSL (byte-identical).
- Bakes: Windows Blender 5.0.1 with Cycles on the RX 6700 XT (HIP; `serverconfig/ryzen.md`, "Cycles on the GPU"). Bakes at 2,048 px and above are sample-bound, which is where the GPU pays off.

## Rulings (Mark, 2026-10-09)

| # | Ruling |
| --- | --- |
| C1 | **High-poly bake.** A dense detail model per ship gets plating seams, portholes, rivet and weld lines, hatches, doors, vents and deck fittings. Cycles bakes its tangent-space normal and its ambient occlusion onto the game mesh's UVs. |
| C2 | **More real geometry**, inside the existing triangle budget: <br>- deck sheer and camber; <br>- rounded superstructure corners and the conning tower; <br>- railings; <br>- boats and davits; <br>- rigging; <br>- director and radar detail; <br>- Pennsylvania's tripod platforms. |
| C3 | **Better paint:** <br>- sharper camouflage edges; <br>- wood decks whose planks read from the air (the Essex 34 cm/px open item, applied here to our ships); <br>- rust and salt streaks placed per panel, below scuppers, hawse pipes and portholes; <br>- waterline grime. |
| C4 | **Lighting response:** <br>- a roughness map that varies by material (painted steel, worn paint, wood, linoleum); <br>- `metallicFactor` stays 0 (Ruling S1); <br>- the AO multiplied into the base color, and also written to an occlusion channel if the renderer reads one (check `src/render`). |
| C5 | **Budgets stay put:** 45k triangles, 3 MB and 12 draws per ship. The atlas may go to 4,096 px only if the bytes still fit. |

## Determinism

The rebuild tests require byte-identical output, and a GPU bake is not reproducible across machines. So the baked maps are **committed source artifacts**, the way a download's raw is:

- They live at `tools/models/bakes/<id>/{normal,ao}.png`, with a manifest recording the source script hash, the sample count and the date.
- `npm run models:build` composes them into the skin. It never re-bakes.
- A test checks that the bake manifest's script hash matches the current high-poly script. A stale bake fails by name, with "re-bake on Ryzen".
- Re-baking is a separate command, `npm run models:bake -- <id>`, which runs only on Ryzen Windows. It is documented in `docs/models.md`.

The high-poly and the game mesh are built from the same parameterized script (`tools/models/blender/<id>.py` with a `--detail high` flag), so their silhouettes cannot drift apart.

## Tasks

- [ ] 0. Worktree `../ww2airsim-m1c` on branch `m1c-ship-detail`; link the model cache. Wake Ryzen and confirm that Windows Blender lists the HIP device (`--python-expr` printing the `cycles` device list).
- [ ] 1. Bake plumbing:
  - the `models:bake` command (it drives Windows Blender over ssh, copies the PNGs back, and writes the manifest);
  - the skin compose step that takes the baked normal (combined with the procedural one, or replacing it) and the AO;
  - the stale-bake test, seen red once.
- [ ] 2. **Pennsylvania (checkpoint).** The C2 geometry, then the `--detail high` script, the bake, and the C3 and C4 paint.
  - Captures: Hangar close-up 3/4, side, deck, and at 1,500 ft, each next to Cleveland (the best-looking download) at the same distances.
  - Record the triangles, bytes and draws before and after.
- [ ] 3. Kagero.
- [ ] 4. Casablanca. Its flight deck planks and markings must read from a landing approach, so add one capture from the groove.
- [ ] 5. Re-pin the byte-identical rebuild hashes, one commit per ship with the reason. Run the Hangar E2E checks, including check 15's luminance; re-baseline it deliberately, with the reason, if the paint changes it.
- [ ] 6. Docs:
  - `docs/models.md` (the bake workflow and the artifacts);
  - `ASSETS.md` (any new texture sources and their licenses; CC0 only, as with the deck planks);
  - the handoff `docs/handoff/<date>-m1c-ship-detail.md`, with all captures and the numbers;
  - Track M in `MASTER_PLAN.md`.
  - Then merge, run `npm run verify` on `main`, push, and email the handoff.

## Done means

- All three ships are inside their budgets, with baked detail and the new paint.
- The rebuild tests pass from the committed bakes.
- A stale bake fails by name.
- The handoff's side-by-side captures show the three ships holding up next to Cleveland.
