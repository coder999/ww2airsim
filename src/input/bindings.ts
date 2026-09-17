/**
 * Every key the game reads, in one table, so rebinding is a data change.
 * Values are `KeyboardEvent.code` -- physical keys, so the map does not shift
 * under a non-QWERTY layout.
 */
export const BINDINGS = {
  pitchUp: ['ArrowDown', 'KeyS'],
  pitchDown: ['ArrowUp', 'KeyW'],
  rollLeft: ['ArrowLeft', 'KeyA'],
  rollRight: ['ArrowRight', 'KeyD'],
  // Z and X, Mark's layout 2026-09-17. Z had to be taken off `throttleDown`
  // for it, and he moved throttle to `=` and `-` exclusively at the same time.
  yawLeft: ['KeyZ'],
  yawRight: ['KeyX'],
  // `=` and `-` exclusively (Mark, 2026-09-17). Shift was throttle-up and is
  // now unbound -- every test and both Tier 2 specs drove the throttle with
  // `ShiftLeft` and were updated in the same commit. `keyLabel('ShiftLeft')`
  // stays in `legend.ts`: it is a label for any key code, not a claim that
  // Shift is bound.
  throttleUp: ['Equal'],
  // Not Ctrl, which the design first named: Ctrl+W closes the tab in Chrome
  // and preventDefault cannot stop it, so "nose down while throttling back"
  // on WASD would quit the game. Ctrl+T and Ctrl+N are the same.
  throttleDown: ['Minus'],
  cycleCamera: ['KeyC'],
  lookUp: ['Numpad8'],
  lookDown: ['Numpad2'],
  lookLeft: ['Numpad4'],
  lookRight: ['Numpad6'],
  lookCentre: ['Numpad5'],
  lookBack: ['Numpad0'],
  // Plan 3 Task 5: one edge-triggered toggle per assist (`AssistSettings` in
  // src/assists/index.ts). The two protective assists default on; altitude
  // hold defaults off since 2026-09-15, so `H` turns it ON rather than off --
  // see DEFAULT_ASSIST_SETTINGS. Mnemonic letters -- L for
  // limiter, R for rudder, H for hold -- on plain keys with no modifier, for
  // the reason `throttleDown` above documents: a Ctrl combination can be a
  // browser shortcut that `preventDefault` cannot stop.
  //
  // These are the free letters today, not reserved ones: a later plan wanting
  // L for landing gear or R for a radio has to move a toggle, and this table
  // is deliberately the only place that edit happens. There is no options UI
  // and no persistence -- see the design doc's OPEN (D): a keyboard toggle
  // plus the `window.__ww2` hook is the whole switching mechanism this plan
  // ships, and the meta-game that would own a settings screen is far out in
  // the master spec's ordering.
  toggleStallLimiter: ['KeyL'],
  toggleAutoRudder: ['KeyR'],
  // `T` for triple time, as the 1991 original bound it. A bare letter for the
  // reason `throttleDown` documents: Ctrl+T opens a browser tab and
  // `preventDefault` does not stop it.
  toggleTripleTime: ['KeyT'],
  // `/` because it is the conventional help key and, unlike F1, it is not a
  // browser command -- F1 opens the browser's own help in several and
  // `preventDefault` does not always stop it, which is the same trap
  // `throttleDown` above documents for Ctrl+W. Firefox's quick-find IS
  // preventable, and main.ts prevents it.
  toggleLegend: ['Slash'],
  toggleFlightData: ['KeyI'],
  // Plan 11a Task 8. `G` for gear -- the mnemonic every flight sim before
  // this one has used, and free: not one of A, C, D, E, H, I, L, Q, R, S, T,
  // W or Z above. Edge-triggered like the assist toggles, not held: a lever
  // that stays where it is left, not a switch you hold over.
  toggleGear: ['KeyG'],
  toggleFlaps: ['KeyF'],
  // `B` for brakes -- also free, and a plain key for the reason
  // `throttleDown` documents: no modifier a browser can intercept. Unlike
  // the gear, this is a hold: brakes bite while the key is down and release
  // the moment it is not, the way a toe-brake pedal does.
  brakes: ['KeyB'],
} as const satisfies Record<string, readonly string[]>

export type BindingName = keyof typeof BINDINGS
