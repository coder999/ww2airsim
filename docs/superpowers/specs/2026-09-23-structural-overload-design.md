# Plan 6c — structural-overload damage

2026-09-23. This is the final currently implementable slice of Plan 6 (combat
and damage, master spec §5 “Damage” and §15 row 6). Guns and strike weapons are
complete. Torpedoes remain deferred until a second, historically appropriate
airframe exists; AI remains Plan 7.

## 1. Player-visible result

The aircraft now has structural consequences for exceeding the limits already
carried by its content spec:

- Sustained flight above `limits.gLimit` damages the airframe.
- Sustained flight above `limits.diveSpeedMps` damages the airframe.
- The existing combat readout shows `OVER-G` and `OVERSPEED` while a limit is
  exceeded, alongside the structure percentage that already reports damage.
- Enough overload destroys the aircraft through the existing destruction,
  hold and debrief path. It is self-inflicted damage: no attacker and no kill
  credit.

This slice adds consequences to the existing gameplay limits. It does not make
a new historical claim for their numerical values.

## 2. Load measurement

The fixed-tick simulation derives structural load from the aircraft's actual
motion after the flight step:

```
acceleration = (current velocity - previous velocity) / dt
proper acceleration = acceleration - gravity
load factor = length(proper acceleration) / g
airspeed = length(current velocity - wind)
```

Proper acceleration makes steady level flight read about 1 g and a ballistic
trajectory read about 0 g. Its magnitude includes vertical, lateral and
negative loading. The content model has one unsigned `gLimit`, not separate
positive, negative and lateral limits, so all structural load is compared with
that single value.

Overspeed uses air-relative velocity. A tailwind cannot damage the airplane by
inflating ground speed, and a headwind cannot hide a high aerodynamic speed.

The calculation uses consecutive fixed-tick states, not render frames, and is
therefore deterministic from a saved world clone. Crashed aircraft do not take
additional overload damage from the ground-contact correction.

## 3. Damage rule

For each live, uncrashed aircraft on every fixed tick:

```
g excess = max(0, load factor / g limit - 1)
speed excess = max(0, airspeed / dive-speed limit - 1)
structure damage per second = g excess + speed excess
```

The structure fraction falls by `damage per second * dt`, clamped to zero.
Exactly at either limit causes no damage. Exceeding one limit by 10 percent for
10 seconds consumes the full structure fraction; exceeding one by 100 percent
does so in one second. Simultaneous excesses add.

This deliberately has no random draw and no hidden fatigue accumulator. The
existing structure-health fraction is the accumulator and the only permanent
effect. That fits the master design's “sufficient for drama; no per-component
structural modelling” boundary and keeps the effect inspectable.

When the first overload tick reaches zero structure, `destroyedAt` is set to
that simulation tick and `attacker` is set to `null`. Overload is resolved at
the start of the combat step, before releases and gunfire, so an airframe that
fails on a tick cannot fire on that same tick.

## 4. State and diagnostics

Each aircraft combat record gains structural-stress telemetry:

- current load factor and airspeed;
- current `overG` and `overspeed` flags;
- peak load factor and peak airspeed since world creation or restart.

The telemetry is deterministic simulation state. It supports the readout,
automated acceptance and future debrief work without asking render code to
reconstruct physics. Restart builds a fresh combat record, resetting both
damage and peaks. Pause advances no fixed ticks and therefore changes neither.

## 5. Acceptance

### Tier 1

- Steady level acceleration resolves to 1 g; ballistic acceleration resolves
  to 0 g.
- Airspeed and overspeed use the wind-relative velocity.
- At and below each limit, structure is unchanged.
- Sustained overload applies the specified continuous rate, combines both
  excesses, and destroys exactly once with no attacker.
- The production combat step applies overload before weapons, skips crashed and
  already-destroyed aircraft, and is deterministic from a clone.
- The readout and diagnostics expose both warnings, current values and peaks.
- Existing flight, landing and replay goldens remain unchanged.

### Tier 2

On the reference GPU, fly the production scenario from a high spawn into a
dive and pull-out:

- overspeed and/or over-G becomes observable in production diagnostics;
- structure falls while the limit remains exceeded;
- pause freezes the value;
- restart restores full structure and clears the recorded peaks;
- the frame remains free of validation errors and within the existing render
  budget.

