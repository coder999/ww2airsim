# N2 Dev Flight Recorder — implementation plan

**Date:** 2026-10-14  
**Branch/worktree:** `n2-flight-recorder` / `/home/mark/projects/ww2airsim-n2-flight-recorder`  
**Run mode:** unattended  
**Viewing checkpoints:** final result only; final Dev reproduction/export captures and measured artifacts go in the handoff.

Design: `docs/superpowers/specs/2026-10-14-n2-dev-flight-recorder-design.md`.

## Tasks

1. Update `MASTER_PLAN.md` so N2 is explicitly parallel with F4 and preserve F4 as
   the hard gate for campaign systems and mission production, not recorder tooling.
2. Add the pure V1 record schema, canonical serializer/hash input, strict parser,
   gzip codec, build/content identity model, and actionable validation errors.
3. Define the deterministic world checksum and compact initial/final summaries.
   Prove object insertion order cannot change a hash while entity order still can.
4. Add an optional fixed-step observer to the simulation loop. It reports the exact
   controls consumed and post-tick world; with no observer the existing path remains
   bit-identical and allocation-free with respect to N2.
5. Implement the Dev recording session: automatic settled-world start, per-tick
   packets, discrete action/event evidence, one-second/final checksums, dropped-step
   invalidation, final summary and debrief attachment.
6. Implement headless exact verification and first-divergence reporting. Cover
   continuous guns, one-shot bombs/rockets, wingman orders, held/spawned groups,
   mission triggers, combat, landing/crash, pause, triple time and a frame hitch.
7. Add browser build identity and scenario-content hashing. Exact playback fails
   closed on mismatches; candidate-fix comparison is a separate explicit mode.
8. Add Dev-only lifecycle and UI: automatic recording, unexported-discard warning,
   Pause and Debrief export, `.ww2flight` download, and a Dev reproduction import
   surface with clear validation state.
9. Resimulate imported records in-game and adapt the resulting world stream to the
   existing replay bar and cameras. V1 seeks from the initial world; do not add
   periodic keyframes.
10. Add diagnostics and focused E2E correctness coverage. Confirm normal non-Dev
    play exposes no controls and creates no recorder session or packet buffer.
11. Measure representative takeoff/combat/mission/debrief recordings: compressed
    bytes per simulated minute, peak memory, export time, headless speed and Dev
    overhead. Record findings without turning machine timing into correctness tests.
12. Run focused deterministic tests as each seam lands, then `remote-run npm run
    verify` and focused reference-GPU E2E. Write and mail the handoff, reconcile
    tests/docs, merge current `main`, repeat affected gates, commit and push. Do not
    deploy.

## Stop conditions

- Do not serialize terrain grids, model binaries, textures or audio into a record.
- Do not accept a checksum mismatch by restoring a snapshot or widening the checked
  state; report the first divergence.
- Do not let raw render-frame key events become the reproduction input.
- Do not expose recorder allocation, UI, import or export in normal non-Dev play.
- If exact reconstruction requires a campaign-specific special case, stop and move
  that state behind a generic scenario/world serialization contract first.
