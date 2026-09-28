# Handoff: parked stance (2026-09-28)

This was a bug fix, not a plan, in worktree `worktree-parked-stance`. Mark
reported two screenshots. The Hellcat was parked with its tailwheel in the air,
and the Wildcat spawned completely off the ground.

## What was wrong

The sim holds a parked airplane's **main wheels** `gear.heightM` below its body
origin, at a level attitude. It has no tailwheel contact. Each drawn model
therefore has to put its mains at `-gear.heightM`, and something has to put the
tail down. Only R3 models were checked for the first part
(`aircraftRigs.test.ts`), and nothing checked the second.

| Model | Before, measured in the sim body frame | Cause |
| --- | --- | --- |
| `f6f-hellcat` | mains on `gear.heightM`; tailwheel **1.102 m** off the ground | Its R3 model is drawn level, since sortie forms A4 (2026-09-27) |
| `wildcat` | mains **1.872 m** above where they should be | The glb's origin is its wheel plane, and it was never re-seated (the O1 handoff's open item) |
| `a6m2-zero` | fine: tailwheel 0.01 m below the main-wheel plane | Drawn sitting, thrust line level |

The sortie-forms handoff's "the wheels sit on the strip; nothing floats" was
true of the mains only.

## What changed

- **`src/render/scene/stance.ts`, new.** `MODEL_STANCE` gives each model its
  main-wheel x and the nose-up pitch that puts its tail on the ground (Hellcat
  9.49°, Wildcat 7.43°, Zero 0).
  - `stanceTiltRad` applies it only under `supportedContact`. It fades out
    between 75% and 100% of `tailUpSpeedMps`, and never pitches the airplane
    past the stance pitch.
  - `drawnPose` pitches the pose about the main-wheel contact.
  - It is **drawing only.** The sim state, the eye and the cockpit panel are
    unchanged. `main.ts` now poses the cockpit group from `current.render`, not
    from the airframe root.
- **`wildcatCorrection()`** now levels the glb's baked-in 7.33° datum and
  drops the model by `WILDCAT_OFFSET_Y_M` (-1.872 m). The Wildcat no longer
  flies nose-high. Its store pitch is therefore 0, and `datumPitchFor` is gone.
- **The Wildcat's rack and rail offsets were re-measured** with
  `npm run models:mounts`. They are about 2.1 m lower than before, on the wing.
  The strike and ordnance pins still pass.
- **`tests/tools/models/stance.test.ts`** holds every spec's model to both
  rules: mains on `gear.heightM`, and the tail on the ground at the stance
  pitch, each within 0.05 m.
  - Reverting either fix fails it with the screenshot numbers: `tail 1.102 m
    off the ground` and `mains 0.328 m below the origin, gear.heightM 2.2`.
  - A new spec whose model has no `MODEL_STANCE` entry fails by name.

## Verified

- `npm run verify`: typecheck, lint and depcruise clean. 3331 tests passed, and
  `skyLoad.test.ts` timed out at 128 s while `remote-run` had overflowed the run
  onto nexus. It passed alone in 69 s: the known sky-noise load timeout.
- Local WebGPU captures on nexus's 680M, quick launch at Tacloban: both
  airplanes stand on all three wheels, and the Wildcat's stores hang under its
  wing.

## Open

- **Both eye points sit about 2 m ahead of the drawn cockpits.** Each is
  `[1.2, 0.9, 0]`, while the canopies are near x = -0.5 to -1.5. The Hellcat's
  was already recorded as not re-measured (sortie forms §5). Cockpit view hides
  the airframe, so this fix does not change what either view shows.
- **The tailwheel is still not in the physics.** A sim-side stance (a nose-up
  rest attitude, and the alpha that changes on the take-off roll) would move
  the take-off card, the AI take-off and landing, and respot. It was offered
  to Mark as the larger option and not taken.
- **The drawn Wildcat's mains are 2.575 m ahead of the body origin.** The
  Hellcat's are 0.62 m ahead. The Wildcat model is scaled to the Hellcat's
  wingspan, so it is also too large. Neither was touched here.
