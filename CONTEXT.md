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
