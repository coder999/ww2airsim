# ww2airsim

A WWII Pacific flight and combat sim. This file is the glossary only: one
canonical word per concept.

## Player aids

**Steering cue**:
The in-flight HUD arrow to the current objective (or chart selection), with range and relative altitude. Period-plausible, so always on.
_Avoid_: guide mode, objective arrow

**Assist**:
Any period-incorrect aid, such as the bomb impact marker. Off by default, behind the Assists toggle.
_Avoid_: guide mode, aid

**Impact marker**:
The Assist (`U`) that draws a ring where a bomb, or failing that the next rocket pair, released now would land; `predictImpact` computes it from the sim's own projectile step. Render and input only: it never changes the flight.
_Avoid_: CCIP, bomb sight, pipper (the pipper is the gun sight)

## Missions

**Plane-state test**:
A mission condition on the player's own airplane (gear, flaps, bay doors, air-relative speed, altitude band, throttle): the `state` objective and the `state` trigger. Used by the tutorial; read from the sim, never from an Assist or the render layer.
_Avoid_: control check, cockpit check

## Radio

**Radio line**:
A canned voiced clip that accompanies an on-screen message, spoken by one Voice.
_Avoid_: voice line, chatter, callout

**Voice**:
A radio role with one consistent generated speaker: Paddles (the LSO), Tower (shore or carrier control), and Wingman. Each role has a US English and a Japanese take, chosen by the player's side; on-screen text stays English.
_Avoid_: speaker, character

## Airframes

**Control surface**:
An aileron, elevator, rudder or flap drawn moving on an airframe. The motion shows what the pilot is doing and does not change how the aircraft flies. Full travel at any speed.
_Avoid_: moving part, control (alone)

**Bay doors**:
The doors over an internal bomb bay, opened and closed by the player (or the AI near its target). Bombs cannot be released while they are shut, and open doors add drag.
_Avoid_: bomb doors, bay (alone)

## Rendering

**Frame budget**:
The GPU frame time High promises at the gate resolution: one 120 Hz frame at 1440p. Other tiers and resolutions are measured, not promised. Tracks spend margin under it; they never raise it without Mark's ruling.
_Avoid_: perf budget, frame time (alone)

**Render scale**:
The fraction of the window's pixel size the scene is drawn at, independent of quality tier.
_Avoid_: resolution, DPR

## Attack AI

**Attack run**:
What a raider does on arrival when its ingress orders say `attack`, in place of the orbit: it works up to its weapon's release, presses the pickle, then pulls away. A dive-bomb, a torpedo or a level-bomb run; absent the order a raider orbits its destination as it always has. A green pilot sights worse and presses late, so he misses more than a veteran.
_Avoid_: bombing run (alone), strike

**Dive-bombing run**:
An attack run that rolls in from altitude on a steep line at the target, releases the bomb at a few hundred yards of height and pulls out over it. The Val's.
_Avoid_: dive attack, stuka run

**Torpedo run**:
An attack run that descends to a few dozen feet over the sea, holds a speed inside the drop envelope, and drops the torpedo a half mile or so from the ship, aimed at where the ship will be when the torpedo gets there.
_Avoid_: torpedo attack, fish run

## Ships

**Warship**:
Any ship with a combat role (carrier, cruiser, battleship, escort). Every warship carries AA; a merchant carries none.
_Avoid_: combatant, military ship

**Main battery**:
A warship's big guns, in turrets. They fire at ships and ground targets, never at aircraft.
_Avoid_: main guns, big guns

**AA mount**:
An anti-aircraft gun position on a warship or a shore battery. Heavy mounts fire flak bursts at altitude; light mounts fire tracers at close range.
_Avoid_: flak gun, AA gun, hardpoint

**Heavy AA**:
The flak-throwing guns of a warship or shore battery (the 5-inch and 12.7 cm dual-purpose mounts). They fire fuse-timed shells that go off at altitude, never rounds, out to about three miles, and cannot engage inside a few hundred yards.
_Avoid_: flak gun, big AA

**Light AA**:
The 20, 25 and 40 mm mounts. They fire tracer rounds through the ordinary ballistics, at close range (under a mile).
_Avoid_: small AA, pom-pom

**Flak burst**:
A heavy AA shell going off in the air. It hurts every hostile airplane inside its radius, less with distance, and leaves a black puff. It is a blast, not a hit: structure damage only, and no tracer flies to it.
_Avoid_: flak shell, air burst

**Ensign**:
The national flag a warship flies at sea: the 48-star flag on US ships, the Rising Sun naval ensign on IJN warships. A merchant flies none, so it can serve either side.
_Avoid_: flag (alone), colors

**Difficulty**:
The global player setting that scales AA accuracy, AI pilot skill and the damage the player's aircraft takes. A scenario's skill values are the baseline it shifts.
_Avoid_: skill level, challenge

**Collision** (air-to-ship):
An airplane's body origin inside a ship's hull or superstructure volume while not supported on that ship's flight deck. The airplane is destroyed like any kill (wreck, debris, KILLED) and the ship loses hull points that rise with the airplane's mass and speed (a Hellcat at 224 mph costs about one 500 lb bomb hit). A God-mode player bounces instead. Own-side ships count as friendly fire. A trap, a take-off roll and a parked airplane are never one.
_Avoid_: ramming, crash (a crash is the ground, the sea or a deck)

## Weapons

**Torpedo**:
An aerial torpedo: dropped from a rack like a bomb, it enters the sea and runs straight at a set depth and speed until it meets a hull, runs ashore or runs out of range. It damages only a ship.
_Avoid_: fish, tin fish

**Drop envelope**:
The fastest airspeed and the greatest height above the sea at which a torpedo can be released and still run. Outside it, the torpedo breaks up on the water.
_Avoid_: release limits, launch window

**Flood**:
Water a torpedo hit lets into a hull. It keeps taking hull points for a while after the hit, lists the ship toward the holed side and slows it; several floods add up. Bombs never flood.
_Avoid_: leak, progressive damage

**God mode**:
A Dev-only setting (a checkbox beside Dev): the player cannot be damaged, fuel, ammunition, bombs, torpedoes and rockets never run out, and any contact with the ground, sea or deck bounces the airplane back up instead of ending the flight. Other airplanes are unaffected.
_Avoid_: cheat, invincibility, infinite ammo

**Sitting duck**:
An AI airplane under the `passive` order: it never picks a target, so it never evades or fires, and it circles at a fixed radius and altitude. The Range Test's enemy airplanes are sitting ducks.
_Avoid_: dummy, drone

**Range Test**:
The Dev mission that spawns every enemy airplane as a sitting duck and every enemy ship at anchor near Tacloban, plus the cargo ship; which enemy follows the side of the airplane you picked.
_Avoid_: shooting gallery

**Neutral ship**:
In the Range Test, a ship that is always a legal target whichever side you fly: the cargo ship takes the side opposite the pilot. The sim has only two sides; a true neutral is not built.
_Avoid_: civilian

