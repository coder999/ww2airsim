# Plan 6 — playable gunnery milestone

2026-09-19. Mark selected "Build the playable gunnery slice". This milestone
adds six guns, finite ammo, time-of-flight projectiles, tracers, gun audio,
repeatable aircraft targets, and damage to structure and systems. Plan 6 stays
in progress: bombs, rockets, torpedoes, external-store mass/drag, ship damage,
and structural-overload damage remain later combat work. AI pilots are Plan 7.

## State and timing

`World.combat` owns projectile snapshots, per-aircraft ammo, cooldowns, health,
shot/hit/kill counters, and an explicit PRNG state. No combat state hides in a
closure. Ship movement precedes aircraft movement; damage from prior ticks
modifies the flight step; then guns emit and projectiles resolve. Identical
fixed-tick inputs and saved RNG state reproduce the same results. This does
not change the existing limitation of frame-rate-dependent keyboard ramps.

Each gun carries its own cooldown and ammo. Holding Space fires; release stops
new shots. Cadence keeps fractional ticks, with no burst bank while released.
Bullets inherit aircraft ground velocity; gravity and drag relative to scenario
wind act after launch. Tracer status is every fifth shot per gun. Swept segment
checks against moving aircraft prevent bullets skipping through thin targets.
Hit location selects a body-frame box and its subsystem; the nearest contact
wins, and a projectile stops at the first contact. No hitscan, penetration, or
ricochet. Ground/deck interception shares `groundUnder`; ship hulls stop rounds
but take no damage in this milestone. Lifetime and an explicit pool bound keep
memory finite; a saturated pool must not consume ammunition for an absent shot.

Destroyed aircraft stay in their existing entity slot: renderer meshes are
indexed by entity order. Their first destruction tick and attacker are stable;
a second hit cannot award another kill. Crashed aircraft cannot fire. Combat
and terrain impact remain distinct outcomes. Restart rebuilds ammo and damage.

## Damage

Health starts full. Each accepted hit reduces structural HP and one subsystem:
engine, roll/pitch/yaw controls, fuel, or one wing's gun group. Engine damage
reduces available power/thrust and progresses to seizure. Control damage
reduces the affected axis's maximum rate. Fuel damage leaks fuel; empty tanks
use the existing engine-out behavior. A destroyed gun group cannot emit shots.
Healthy aircraft take the original flight path, without rebuilding their spec.
HP, hitbox dimensions, leak/seizure rates, drag and dispersion are game-tuning
estimates, not historical measurements. Damage cannot increase power, control
authority, fuel, ammunition, or health.

## Content and visible behavior

Optional strict `combat` data on aircraft specs describes gun positions,
ammunition, cadence, muzzle velocity, convergence, dispersion, projectile
lifetime/drag, hit damage, health and hit zones. Existing unarmed fixtures keep
working. The Hellcat receives six wing guns. `gunnery-range` uses the existing
parked-scenario contract: player at Tacloban, designated parked Hellcat training
airframes downrange. These are training targets, not enemy fighter AI. The
player may fire on the ground or take off and strafe them.

A compact combat readout shows ammo, hits, destroyed targets, and damaged
systems in both camera modes. Tracers, hit flashes, and damaged-engine smoke
read simulation state. Rendering is pooled and camera-relative. Gun audio
follows actual shot-count changes; holding an empty or disabled gun is silent.
Pause, repeated render frames, and restart must not replay old gunfire.

## Initial data and sources

- Six fixed .50-inch guns: [National Naval Aviation Museum, F6F-5](https://www.history.navy.mil/content/history/museums/nnam/explore/collections/aircraft/f/f6f-5-hellcat.html).
- 800 rounds/minute is a midpoint choice within the 750–850 range; 883.92 m/s
  converts the manual's 2,900 ft/s: [US Navy Aircrewman's Gunnery Manual, This Is Your Gun](https://www.ibiblio.org/hyperwar/USN/ref/AirGunnery/GUNS.html).
- 400 rounds/gun: [Patriots Point Naval & Maritime Museum](https://patriotspoint.org/things-to-do/aircraft/f6f-hellcat).
- 300 m convergence, 0.12-degree dispersion half-angle, 3 s life, 0.00015/m
  quadratic drag, 10 damage/hit, 120 structural HP, 40 subsystem HP, 0.5 kg/s
  maximum fuel leak, and 0.05 health/s maximum engine decay are estimates or
  gameplay choices. Mounts and hit zones follow the existing procedural mesh,
  not an independently verified historical installation drawing.

At 800 rpm, six guns emit 80 rounds/s; 2,400 rounds yield about 30 seconds of
continuous fire. A 3 s lifetime bounds a single firing airplane near 240 live
rounds / 48 tracers. These are arithmetic bounds to test, not GPU measurements.
The 1944 Aircraft Armament transcription conflicts on cadence and velocity;
use the dedicated Aircrewman's manual above for this initial ammunition model,
not an average of incompatible figures. No penetration or lethality claim is
inferred from the historical source.

## Acceptance

Tier 1: strict malformed-content rejection; cadence and ammo depletion; fifth
round tracers; flight time/gravity/wind; moving and thin targets; nearest hit;
self exclusion; ground interception; no duplicate destruction; subsystem
physics effects; empty/disabled guns; restart and pause; deterministic clone
continuation and random soak; unchanged healthy-flight goldens and landing
snapshots. Test the production `advance` and `nextFrameState` paths.

Tier 2 on the reference GPU at 1440p: use Space in the real app, observe ammo
fall, tracer geometry, gun audio and target damage, then release/pause/restart.
Read generated screenshots. Check both camera modes, zero WebGPU errors, and
GPU p95 below 6 ms. Finish with `npm run verify`, capture its exit code directly,
and write measured results in a dated handoff. No human testing dependency.
