# Orbit camera: design

Dated 2026-09-27. Requirements are Mark's, given in a brainstorming session the same day. This is the first of two specs; the second, `2026-09-27-instant-replay-design.md`, depends on it and adds the replay-only cameras.

Today the chase camera is a pure function of the player's state (`cameraTransformFor`, `src/render/camera.ts`): fixed offset `CHASE_OFFSET_M`, heading and 92% of pitch followed, roll discarded, distance scaled with speed. Nothing in `src/` reads the mouse. This design lets the pilot swing and zoom that camera with the mouse, and restructures cameras so the replay spec can add more of them without touching this one.

## 1. Mark's requirements

| # | Requirement (Mark, 2026-09-27) | Where it is met |
| --- | --- | --- |
| 1 | The trailing camera can be manipulated with the mouse (drag) and scroll wheel to show the plane from a different angle and zoom. | §3, §4 |
| 2 | C cycles to cockpit; C again returns to the original default trailing view (the adjustment is reset). | §5 |
| 3 | Name: "3D camera, or a better name". Ruled **orbit camera**. | — |
| 4 | Orbit is the tethered camera: an angle you set stays fixed relative to the plane as it turns. | §3 |
| 5 | Its automatic circling ("spin") can be turned off. Spin is a replay feature (replay spec §5); in live flight it does not exist. | §3 |

## 2. Rulings

| ID | Ruling | Why | Cost if reversed |
| --- | --- | --- | --- |
| OC-1 | The orbit camera **replaces** chase rather than being a third mode. `CameraMode` stays `'chase' \| 'cockpit'`; chase gains an `OrbitOffset`. | Mark's C cycle is two stops, chase and cockpit. An unadjusted orbit must be exactly today's chase, so they are one mode. | A third mode means a three-stop C cycle Mark did not ask for. |
| OC-2 | Roll stays **discarded** in orbit, as in chase. | camera.ts: following roll through the golden trajectory's barrel rolls is nauseating. The orbit is measured in the same heading/pitch frame. | Re-litigates the chase ruling. |
| OC-3 | The orbit is clamped above the surface under the eye (terrain height, deck, or sea level, plus 2 m). | A drag below the plane would otherwise put the eye under water, where the ocean renders from beneath. | Allows underwater views, which render wrong. |
| OC-4 | Leaving chase (C to cockpit) resets the offset to zero. A restart, new game or return to title also resets it. | Mark's requirement 2. | — |
| OC-5 | No pointer lock. A left-button drag on the canvas orbits; the cursor stays visible. | Pointer lock needs a click to engage and Esc to release, and Esc is already the pause key. | Pointer lock would fight the pause binding. |

## 3. The orbit offset

```ts
type OrbitOffset = {
  readonly yawRad: number     // about world +Y in the chase frame; + = swing left
  readonly pitchRad: number   // + = above; clamped to [-80°, +80°]
  readonly zoom: number       // multiplies the chase distance; clamped [0.4, 4.0]
}
const ORBIT_ZERO: OrbitOffset = { yawRad: 0, pitchRad: 0, zoom: 1 }
```

The eye is placed in the chase attitude frame (heading plus 0.92 × pitch). Start from `CHASE_OFFSET_M` scaled by `chaseDistanceScale(speed) × zoom`, then rotate it about the frame's up axis by `yawRad` and its right axis by `pitchRad`. The eye's attitude is the chase attitude rotated by the **same** yaw and pitch. So the aircraft keeps today's framing, sitting slightly below screen center, from every angle, and an offset of 0 reproduces today's chase eye exactly. The look-around hat (`LookOffset`) still composes after, unchanged.

Because the offset is in the plane's heading frame, not the world frame, a quarter swing to the right wingtip stays on the right wingtip through a turn. That is Mark's "tethered".

`cameraTransformFor` gains an optional `orbit: OrbitOffset = ORBIT_ZERO` parameter and a surface-height callback for OC-3. All existing call sites keep working unchanged.

## 4. Mouse input

`src/input/mouse.ts`, the mouse counterpart of `keyboard.ts`: pointer events on the canvas are accumulated into a per-frame `MouseDelta { dxPx, dyPx, wheel }` that `nextFrameState` consumes. The frame state stays a pure function of its inputs, so every mapping below is unit-testable.

| Input | Effect |
| --- | --- |
| Left drag, horizontal | yaw, 0.3°/px |
| Left drag, vertical | pitch, 0.3°/px (drag down = eye goes up, as when dragging a globe) |
| Wheel | zoom × 1.1 per notch, out on scroll down |
| Double-click | reset to `ORBIT_ZERO` |

The mouse does nothing in cockpit view: the hat already covers looking around there. Input is ignored while the title, chart or debrief is up, the same guard those screens already apply to keys.

## 5. The C cycle

Unchanged `MODES` order. The only new behavior: the transition out of chase sets `orbit` to `ORBIT_ZERO` (OC-4). Cockpit → chase therefore always lands on the default view.

## 6. Designed for the replay spec

- **Target-agnostic.** The orbit (and every camera) takes the `RenderState` of whatever it follows, not "the player". Replay's Target camera and the future bomb cam are then new camera functions over any entity, not a rework.
- **Cloud temporal history.** `shouldResetHistory` resets on eye jumps. A fast drag moves the eye quickly but continuously, so it must not trip a reset every frame. A Tier 1 test drags at the maximum plausible rate (180°/s) and asserts no reset.

## 7. Testing

**Tier 1 (no browser):**
- `ORBIT_ZERO` gives a result bit-identical to today's `cameraTransformFor('chase', …)` across the golden trajectory. This guards "live flight looks the same until you touch the mouse".
- Tethering: with a fixed offset, the eye stays at the same heading-relative bearing from the aircraft through a 360° level turn.
- Framing: for any offset, the aircraft's direction relative to the eye's forward axis matches its direction at `ORBIT_ZERO` (within 0.1°). The plane never drifts out of frame as you orbit.
- Clamp: pitch −80° over the sea at 50 m altitude keeps the eye at or above 2 m.
- Pitch and zoom limits hold under extreme mouse deltas.
- C cycle: chase(offset) → cockpit → chase gives `ORBIT_ZERO`. Restart also gives `ORBIT_ZERO`.
- Mouse mapping: px and wheel notches → offset, per §4. Ignored in cockpit view and under the debrief/title/chart.
- Cloud history: the 180°/s drag does not trigger a history reset.

**Tier 2 (browser):** one screenshot each at `ORBIT_ZERO`, a quarter swing to the right, from below (clamped), and zoomed out ×3, at a fixed tick.

**Mark:** one look on `ww2airsim.windomlane.org`, confirmed up with `curl` before asking.

## 8. Out of scope

Replay and its cameras (the replay spec), spin, the Manual free camera, bomb cam, pointer lock, and touch input.

## 9. Amendments

- **2026-09-27, plan rulings.**
  - P-1: pitch is clamped to [−80°, +60°], not ±80° (§3), so the eye never passes overhead.
  - P-2: §6's cloud-history test runs at zoom 1. At zoom 4 a fast drag correctly resets history.
- **2026-09-27, final review.** OC-3's clamp raises the eye around its orbit (the steepest pitch that clears the floor) instead of lifting its height, so §7's framing holds at the surface. The floor is never below the surface under the airplane, so the eye never sits beside a carrier's hull below its deck. See the [handoff](../../handoff/2026-09-27-orbit-camera.md).
