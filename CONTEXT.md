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

**Ensign**:
The national flag a warship flies at sea: the 48-star flag on US ships, the Rising Sun naval ensign on IJN warships. A merchant flies none, so it can serve either side.
_Avoid_: flag (alone), colors

**Difficulty**:
The global player setting that scales AA accuracy, AI pilot skill and the damage the player's aircraft takes. A scenario's skill values are the baseline it shifts.
_Avoid_: skill level, challenge

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
