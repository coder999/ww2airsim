/**
 * Every key the game reads, in one table, so rebinding is a data change.
 * Values are `KeyboardEvent.code` -- physical keys, so the map does not shift
 * under a non-QWERTY layout.
 */
export const BINDINGS = {
  fireGuns: ['Space'],
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
  // The keypad's + and - too (Mark, 2026-09-17): the same lever from either
  // side of the keyboard, where a keypad exists.
  throttleUp: ['Equal', 'NumpadAdd'],
  // Not Ctrl, which the design first named: Ctrl+W closes the tab in Chrome
  // and preventDefault cannot stop it, so "nose down while throttling back"
  // on WASD would quit the game. Ctrl+T and Ctrl+N are the same.
  throttleDown: ['Minus', 'NumpadSubtract'],
  // `M` chops the throttle to zero in one press (Mark, 2026-09-17: "kill the
  // engine -- ie immediately go to zero"). A one-shot on the ramped lever,
  // not an engine state: `=` ramps it back up from zero afterwards. Free
  // letter; plain key for the reason `throttleDown` documents.
  throttleCut: ['KeyM'],
  // Esc pauses (Mark, 2026-09-17). Esc is the one key browsers reserve for
  // leaving fullscreen and pointer lock, neither of which this game uses, so
  // it is free here; edge-triggered like every other toggle.
  pause: ['Escape'],
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
  // Plan 14. P for plot: it opens the navigation chart and is deliberately
  // page furniture, not a sim control. M already cuts the throttle and I
  // opens follow-view data, so this free key keeps map lookup discoverable
  // without a control conflict.
  toggleMissionMap: ['KeyP'],
  toggleFlightData: ['KeyI'],
  // Plan 11a Task 8. `G` for gear -- the mnemonic every flight sim before
  // this one has used, and free: not one of A, B, C, D, F, I, L, M, R, S, T,
  // W, X or Z. (Corrected 2026-09-18: this list used to name E, H and Q as
  // taken and omit B, F, M and X. Nothing bound E or H -- most likely a
  // leftover from the altitude-hold deletion on 2026-09-17 -- and reading it
  // would have ruled out `Q` for Plan 15's mute, which was in fact free.) Edge-triggered like the assist toggles, not held: a lever
  // that stays where it is left, not a switch you hold over.
  toggleGear: ['KeyG'],
  toggleFlaps: ['KeyF'],
  // Plan 8. `H` for hook; free as of 2026-09-18 (the corrected list above).
  toggleHook: ['KeyH'],
  // `B` for brakes -- also free, and a plain key for the reason
  // `throttleDown` documents: no modifier a browser can intercept. Unlike
  // the gear, this is a hold: brakes bite while the key is down and release
  // the moment it is not, the way a toe-brake pedal does.
  brakes: ['KeyB'],
  // Plan 15. `Q` for quiet. `M` is the obvious mute key everywhere else and
  // has been the THROTTLE CUT here since 2026-09-17, so it is not available.
  // A bare letter for the reason `throttleDown` documents: no modifier a
  // browser can intercept.
  toggleMute: ['KeyQ'],
} as const satisfies Record<string, readonly string[]>

export type BindingName = keyof typeof BINDINGS
