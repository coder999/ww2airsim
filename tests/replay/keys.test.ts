import { describe, it, expect } from 'vitest'
import { replayKeyAction } from '../../src/replay/keys.js'
import { REPLAY_CAMERAS } from '../../src/replay/cameras.js'
import { DT } from '../../src/sim/flight/model.js'

describe('replay keys (spec §6; plan Global Constraints)', () => {
  it('Space plays and pauses', () => {
    expect(replayKeyAction('Space', false)).toEqual({ kind: 'command', command: { kind: 'togglePlay' } })
  })
  it('the arrows step 1 s, or one tick with Shift', () => {
    expect(replayKeyAction('ArrowLeft', false)).toEqual({ kind: 'command', command: { kind: 'step', seconds: -1 } })
    expect(replayKeyAction('ArrowRight', false)).toEqual({ kind: 'command', command: { kind: 'step', seconds: 1 } })
    expect(replayKeyAction('ArrowLeft', true)).toEqual({ kind: 'command', command: { kind: 'step', seconds: -DT } })
    expect(replayKeyAction('ArrowRight', true)).toEqual({ kind: 'command', command: { kind: 'step', seconds: DT } })
  })
  it('1 / 2 / 3 are exactly 0.5x / 1x / 3x', () => {
    expect(replayKeyAction('Digit1', false)).toEqual({ kind: 'command', command: { kind: 'speed', speed: 0.5 } })
    expect(replayKeyAction('Digit2', false)).toEqual({ kind: 'command', command: { kind: 'speed', speed: 1 } })
    expect(replayKeyAction('Digit3', false)).toEqual({ kind: 'command', command: { kind: 'speed', speed: 3 } })
  })
  it('4-9 pick the six cameras in button order', () => {
    const got = ['Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'].map((c) => replayKeyAction(c, false))
    expect(got).toEqual(REPLAY_CAMERAS.map((id) => ({ kind: 'camera', id })))
    expect(REPLAY_CAMERAS).toEqual(['auto', 'orbit', 'flyby', 'target', 'cockpit', 'manual'])
  })
  it('C cycles, O spins, L locks, Esc exits', () => {
    expect(replayKeyAction('KeyC', false)).toEqual({ kind: 'cycleCamera' })
    expect(replayKeyAction('KeyO', false)).toEqual({ kind: 'spin' })
    expect(replayKeyAction('KeyL', false)).toEqual({ kind: 'lock' })
    expect(replayKeyAction('Escape', false)).toEqual({ kind: 'exit' })
  })
  it('Shift changes nothing but the step', () => {
    for (const code of ['Space', 'Digit1', 'Digit5', 'KeyC', 'KeyO', 'KeyL', 'Escape']) {
      expect(replayKeyAction(code, true)).toEqual(replayKeyAction(code, false))
    }
  })
  it('WASD / Q / E are held movement, not actions; unbound keys and flight toggles are null (Review Focus 1)', () => {
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyK', 'KeyR', 'KeyP', 'KeyT', 'KeyI', 'Slash', 'Tab', 'KeyG', 'Digit0', 'ArrowUp']) {
      expect(replayKeyAction(code, false), code).toBeNull()
    }
  })
})
