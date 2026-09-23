# Radar scope design

2026-09-23. Fills the cockpit panel's `radar` slot, reserved since Plan 6a
(2026-09-15) with a "RADAR / RESERVED" placeholder specifically pending
"weapons, radar contacts, AI" — Plan 6 and Plan 7, both now landed. Proposed
as **Plan 17** in master spec §15's numbering: ordered `any`, the same as the
13-series and Plan 15 (audio) — it depends on aircraft existing to show as
contacts, which Plan 12 already provides, and nothing later in the roadmap
depends on it.

## 1. Player-visible result

A rotating sweep, heading-up (the player's nose is always 12 o'clock), fills
the existing radar bezel. It completes one clockwise revolution every 2
seconds. Every other airborne aircraft in range appears as a dot at its
bearing and range from the player; a dot is brightest the instant the sweep
passes its bearing and fades continuously until the sweep comes back around.
`Tab` cycles the displayed range: 15 mi -> 5 mi -> 1 mi -> back to 15.

Motivated directly by Mark's own playtest of `pursuit-range` (2026-09-23): he
lost track of an AI contact after evading it and had no way to reacquire it
visually. This does not change the AI's behavior (that is Plan 7b/7c); it
gives the player the situational-awareness instrument every other WWII combat
sim of this genre has.

## 2. Data flow

A new pure module, `src/render/radar.ts` — `sim/` is untouched, since this is
read-only telemetry over already-simulated state, the same relationship
`combatReadout.ts` has to `World.combat`. It exports:

```ts
export type RadarContact = { readonly bearingRad: number; readonly rangeMi: number }
export const RADAR_RANGES_MI = [15, 5, 1] as const

export function radarContacts(
  player: AircraftEntity,
  others: readonly AircraftEntity[],
  rangeMi: number,
): readonly RadarContact[]
```

`bearingRad` is measured the same way `controlsForDesiredVelocity`'s heading
error is (`atan2(dot(relative, right), dot(relative, forward))`, the
player's own forward/right body axes) — **deliberately with no epsilon floor
on the forward component**. Plan 7a's whole-branch review found that exact
floor silently collapsing a behind-the-nose error to zero; a contact dead
astern is precisely the case this display most needs to get right, so the
fixed, floor-free form is the one to copy, not the original.

Both bearing and range are computed in the horizontal (x, z) plane only, same
as the bearing itself is inherently a horizontal azimuth — no altitude cueing
(see "Deliberate boundary"). `rangeMi` is **statute** miles (1609.344 m),
matching the panel's existing unit system — the airspeed dial already reads
mph (`gauges.ts`'s `fromSI: 1 / 0.44704`), not knots, and radar should not be
the one instrument on this panel in a different system. `others` is `world.aircraft` filtered to
`!parked` (spawned airborne, never transitions mid-flight — `loop.ts`'s own
doc comment on the field) and excluding the player's own id, then to
`rangeMi` of the selected ring. `radarContacts` returns at most 16
(`MAX_RADAR_CONTACTS`), nearest first, if a future scenario ever seeds more
than the shader has slots for.

`main.ts` calls this each frame from the same `frame.world.aircraft` the
`aircraft()` diagnostic already reads, and threads the result into
`updatePanel` as a new parameter alongside the existing `state`/`controls`/
`wind`. Selected range and the live sweep angle are UI state held in
`main.ts` at the same tier the mission-map toggle and mute already are — not
`FrameState`: neither affects the simulation, so neither is part of the
replay/golden-trajectory contract. The sweep angle is
`(elapsedS / 2) * 2*pi mod 2*pi`, frozen while paused like the rest of the
panel; `elapsedS` does not advance during a pause for the same reason no
gauge needle does.

## 3. Rendering

The existing `radarFace` mesh (`panel.ts`) gets a TSL node material instead
of its flat `MeshBasicMaterial`. Rather than shade that mesh live in the main
scene, the scope renders into its own small offscreen `RenderTarget` first —
the same shape `cloudShadow.ts` already uses (an orthographic camera and a
quad pass writing a texture, read back with
`renderer.readRenderTargetPixelsAsync`) — and that texture becomes the
mesh's map. This is a deliberate, precedented choice: the cloud-shadow
mirroring incident (2026-09-19) shipped a camera-relative map that read
backwards, and no screenshot caught it — only a direct pixel readback did.
Rendering the scope into its own world-independent target makes "did the
math paint the right pixel" testable head-on, the same lesson that incident's
handoff recorded.

One function drives the whole face:

```ts
brightness(angleRad) = fade(wrap(sweepAngle - angleRad))
```

`fade` decays from 1.0 at zero lag to near-zero over one full 2*pi of lag —
this is the sweep trail itself, painted for every angle on the face, not a
separately-drawn line. A contact dot is a small blob at its
`(bearingRad, rangeMi)` position, its own intensity multiplied by
`brightness(bearingRad)` — so a dot lights up exactly when the sweep passes
it and fades in lockstep with the trail behind it, both reading off the one
function. Contacts feed the shader as a `uniformArray` of
`(bearingRad, rangeMi)` pairs, unused slots sentinel-marked (`rangeMi = -1`,
skipped), the same technique `cloudField.ts` already uses for its layer data.

## 4. Input

`Tab` (`toggleRadarRange` in `BINDINGS`) cycles the range, edge-triggered
(`!e.repeat`) like every other panel toggle, with `e.preventDefault()` —
Tab's default is to shift page focus, and this app has no other focusable
element for it to usefully land on. It works through a pause, the same as
the legend and mute toggles: an instrument setting, not a simulation input.

## 5. Deliberate boundary

This slice does not add: range rings or tick marks on the face (sweep and
dots only, matching what was actually asked for); altitude-difference cueing
(range is horizontal-plane only); filtering by team or hostility (there is no
IFF in the sim yet — every airborne, non-player aircraft is a contact, which
today means `pursuer-1` in `pursuit-range` and nothing in scenarios with no
assigned pilot); or persistence of the selected range across a restart or
reload (defaults to 15 mi, like every other panel state). Team filtering is
an explicit, obvious hook for whenever Plan 7c lands: `radarContacts` gains
an optional predicate, nothing about the shader or the data flow changes.

## 6. Acceptance

### Tier 1

- `radarContacts`: bearing sign/magnitude for a target ahead, behind, left
  and right (including dead astern, unclamped); range in miles; the
  in-range filter at each of the three rings; the airborne-only filter
  (a parked aircraft never appears); the nearest-16 cap; the coincident-
  position fallback (bearing 0, range 0, not NaN).
- The brightness/fade function: monotonic decay from full intensity at zero
  lag, correct wraparound at the 0/2*pi boundary, and a non-zero floor (a
  contact never fully vanishes between sweeps).
- The range-cycle state machine: 15 -> 5 -> 1 -> wraps to 15.

### Tier 2

- A new `__ww2.radar()` diagnostics getter — `{ rangeMi, sweepRad, contacts:
  readonly RadarContact[] }` — the same pattern as `combat()`/`ships()`.
- `Tab` actually cycles `radar().rangeMi` through the shipped keyboard path.
- The offscreen-texture readback (`__ww2.radarPixelAt`-style hook, mirroring
  `cloudShadowAt`) shows a bright pixel at a known contact's expected
  position at the moment the sweep is computed to be passing it, and a
  faded one half a rotation later.
- Zero WebGPU validation errors and the existing 6.0 ms render-time budget,
  measured on `pursuit-range` with the sweep running continuously.
