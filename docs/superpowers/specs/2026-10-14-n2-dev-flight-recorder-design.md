# N2 Dev Flight Recorder — design

**Date:** 2026-10-14  
**Status:** approved for implementation  
**Authority:** `MASTER_PLAN.md`, Track N2; campaign brainstorm §13  
**Run mode:** unattended  
**Viewing checkpoint:** final result only

## 1. Purpose

The Dev Flight Recorder reproduces simulation, mission, AI, collision, scoring,
and presentation bugs from a complete Dev sortie. It is development tooling, not
a save-game format, a normal-player feature, or a replacement for the ten-second
instant-replay ring.

N2 may run in parallel with F4's reusable asset production. The recorder refers
to stable content ids and verifies build/content hashes. A later asset therefore
adds content to the hashed manifest without changing the recorder machinery.
Records remain exact only against the build and content that produced them.

## 2. V1 record

`.ww2flight` is gzip-compressed UTF-8 JSON. The uncompressed envelope is strict,
versioned, and independently parseable:

- schema version and format name;
- exact Git/build identity, including a dirty-build marker;
- canonical SHA-256 content digest plus the scenario id;
- launch configuration: aircraft, loadout, time, weather, difficulty, assists,
  and deterministic Dev switches;
- diagnostic platform and graphics metadata;
- an initial-world descriptor after terrain settlement, including its checksum
  and entity/spec ids, while terrain and binary assets remain hash references;
- the final `Controls` packet actually consumed by each fixed tick;
- tick-stamped discrete actions and deterministic mission/combat event deltas;
- a canonical world checksum every 60 ticks and at the final tick;
- final state summary and debrief result.

Numbers must be finite. Object keys are canonicalized before hashing. Arrays keep
simulation order because entity order is part of the deterministic contract.

## 3. Capture seam

The fixed-step loop owns the truth. `advance` gains an optional observer invoked
once after each completed fixed tick with:

- the exact player control packet that tick consumed, before one-shot releases
  are spent;
- the post-tick world;
- deterministic event deltas derived from the pre/post world.

The observer is absent outside an active Dev recording. Ordinary non-Dev play
therefore allocates no recorder packets and performs no recorder hashing. Render
frames, raw key events, frame hitches, pause duration, and display frame rate do
not define the reproduced trajectory.

Pause and time-compression changes are retained as diagnostic actions. They do
not advance the headless simulation themselves. A frame hitch is represented by
the exact sequence of fixed-tick packets it caused; dropped fixed steps make the
record invalid with an actionable error instead of claiming exact reproduction.

## 4. Initial world and content identity

The recorder starts only after the selected scenario, sortie bundle, loadout,
weather, Dev switches, and terrain settlement are final. Playback rebuilds that
world from the current content loader, then checks the recorded initial checksum
before consuming tick packets. It does not embed terrain grids, GLBs, textures,
or audio.

The content digest covers the canonical scenario bundle and every simulation
content object reachable from it. Visual-only files are recorded through the
build identity and a separate diagnostic asset manifest when available; they do
not enter deterministic world checksums.

A dirty build may be recorded for local diagnosis, but exact import clearly says
that it cannot be recovered elsewhere from its commit id alone.

## 5. Checksums and events

The world checksum covers deterministic state that can affect later simulation:
world tick, ordered entity state and controls, combat, mission state, stores,
structures, wind, and relevant static ids. It excludes renderer state, object
identity, terrain payload bytes, and the accumulator remainder.

Events are diagnostic evidence, not a second simulation input. Mission-log,
combat, spawn, destruction, release, wingman-order, landing, and outcome deltas
are stored beside the packet stream so first-divergence reports can show what
happened around the failing tick. Playback never snaps to a checksum or event.

## 6. Reproduction

### Headless verification

Given a verified initial world, apply packets one tick at a time through the
ordinary simulation step. At each recorded checkpoint compare the canonical
checksum. The report names the first divergent tick, expected and actual hashes,
and nearby actions/events. A candidate-fix run may explicitly allow build/content
mismatch, but its first intentional divergence is still reported.

### In-game reproduction

The Dev reproduction surface imports a record, validates it, rebuilds the world,
and resimulates it. Reproduced worlds feed the existing replay cameras and replay
bar; N2 does not grow a second camera system. V1 seeks by restarting at the
initial world and replaying forward. Sparse keyframes remain deferred until file
size and seek measurements justify them.

## 7. UI and lifecycle

- Dev sorties start recording automatically after settlement.
- Only the current or most recently completed Dev flight is retained.
- Pause and Debrief expose **Export flight record** only when a record exists.
- Starting another Dev sortie warns before discarding an unexported record.
- A Dev-only reproduction surface owns file import and validation errors.
- Production and non-Dev sessions expose no recorder controls.

## 8. Failure contract

Import rejects, without partial playback:

- malformed gzip or JSON;
- an unknown schema version;
- non-finite or out-of-range packet data;
- missing scenario/content;
- build or content mismatch in exact mode;
- initial-world mismatch;
- a packet gap, duplicate tick, or out-of-order action;
- a recording marked invalid by dropped fixed steps.

Every rejection names the failed layer and the corrective action: use the matching
build, restore matching content, re-export, or choose explicit candidate-fix
comparison.

## 9. Verification and budgets

Deterministic tests prove canonical hashing, strict parsing, compression
round-trip, fixed-tick capture, one-shot releases, held guns, wingman actions,
pause/triple-time/frame-hitch independence, mission spawns, checksum divergence,
and all failure messages. Browser correctness tests prove Dev-only lifecycle,
Pause/Debrief export, import, and camera playback wiring.

Prototype measurements establish bytes per simulated minute, peak retained bytes,
export time, verification speed, and Dev frame/simulation overhead. These are
reported rather than guessed in advance. A non-Dev allocation guard is a
correctness test, not a timing budget.

