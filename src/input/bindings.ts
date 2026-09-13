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
  yawLeft: ['KeyQ'],
  yawRight: ['KeyE'],
  throttleUp: ['ShiftLeft', 'ShiftRight', 'Equal'],
  // Not Ctrl, which the design first named: Ctrl+W closes the tab in Chrome
  // and preventDefault cannot stop it, so "nose down while throttling back"
  // on WASD would quit the game. Ctrl+T and Ctrl+N are the same.
  throttleDown: ['KeyZ', 'Minus'],
  cycleCamera: ['KeyC'],
  lookUp: ['Numpad8'],
  lookDown: ['Numpad2'],
  lookLeft: ['Numpad4'],
  lookRight: ['Numpad6'],
  lookCentre: ['Numpad5'],
  lookBack: ['Numpad0'],
  // Plan 3 Task 5: one edge-triggered toggle per assist (`AssistSettings` in
  // src/assists/index.ts), all three on by default. Mnemonic letters -- L for
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
  toggleAltitudeHold: ['KeyH'],
} as const satisfies Record<string, readonly string[]>

export type BindingName = keyof typeof BINDINGS
