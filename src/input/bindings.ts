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
} as const satisfies Record<string, readonly string[]>

export type BindingName = keyof typeof BINDINGS
