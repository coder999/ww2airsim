import { describe, it, expect } from 'vitest'
import { initialFrameStateFor, nextFrameState, type FrameState } from '../../../src/render/frame.js'
import { playerAircraft } from '../../../src/sim/loop.js'
import { BINDINGS } from '../../../src/input/bindings.js'
import { missionWorld } from '../../sim/mission/fixture.js'

/** Ruling F-C1 (final review, 2026-09-27): the respot spot is aft of the trap
 *  zone, and a trap never releases while the wheels are on the deck
 *  (model.ts, unchanged by Mark's call), so a respot with the hook left down
 *  re-arrests on the roll with no way out. The deck crew clears the wire:
 *  the frame raises the hook lever once per respot the mission logs. */
const ON_DECK = { id: 'f6f-1', spec: 'f6f-hellcat', parkedAt: { ship: 'cv-1', spot: { x: 0, z: -110 } }, chocked: false }
const TRAPS = { id: 'traps', label: 'Trap', priority: 'primary', kind: 'land', at: 'cv-1', count: 3, respot: true }
const deckFrame = (): FrameState => initialFrameStateFor(missionWorld({ aircraft: [ON_DECK], objectives: [TRAPS] }))

const H = new Set(BINDINGS.toggleHook)
const NONE = new Set<string>()
const DT = 1 / 60

/** The frame with a `respot` entry appended to its world's mission log: the
 *  entry `stepMission` writes when the deck crew respots the player. */
function withRespot(f: FrameState, tick: number): FrameState {
  const m = f.world.mission!
  return { ...f, world: { ...f.world, mission: { ...m, log: [...m.log, { tick, kind: 'respot' as const }] } } }
}

function hookDownFrame(): FrameState {
  let f = nextFrameState(deckFrame(), DT, H)
  f = nextFrameState(f, DT, NONE)
  expect(f.hookDown).toBe(true)
  return f
}

describe('respot raises the hook lever (ruling F-C1)', () => {
  it('a respot entry in the mission log clears hookDown once, and the command reaches the player', () => {
    let f = withRespot(hookDownFrame(), 500)
    f = nextFrameState(f, DT, NONE)
    expect(f.hookDown).toBe(false)
    expect(playerAircraft(f.world).controls.hookDown).toBe(false)
  })

  it('a later H press lowers it again, and the handled respot does not clear it a second time', () => {
    let f = nextFrameState(withRespot(hookDownFrame(), 500), DT, NONE)
    expect(f.hookDown).toBe(false)
    f = nextFrameState(f, DT, H)
    expect(f.hookDown).toBe(true)
    for (let i = 0; i < 10; i++) f = nextFrameState(f, DT, NONE)
    expect(f.hookDown).toBe(true)
    expect(playerAircraft(f.world).controls.hookDown).toBe(true)
  })

  it('a second, newer respot clears it again', () => {
    let f = nextFrameState(withRespot(hookDownFrame(), 500), DT, NONE)
    f = nextFrameState(nextFrameState(f, DT, H), DT, NONE)
    expect(f.hookDown).toBe(true)
    f = nextFrameState(withRespot(f, 900), DT, NONE)
    expect(f.hookDown).toBe(false)
  })

  it('Restart resets the handled tick: an earlier-ticked respot in the new flight still clears the hook', () => {
    const handled = nextFrameState(withRespot(hookDownFrame(), 500), DT, NONE)
    expect(handled.hookDown).toBe(false)
    expect(handled.respotHandledTick).toBe(500)
    expect(deckFrame().respotHandledTick).toBe(-1)
    // Restart is `initialFrameStateFor` on a freshly built world (main.ts);
    // the new flight's ticks start again from 0.
    let f = hookDownFrame()
    f = nextFrameState(withRespot(f, 10), DT, NONE)
    expect(f.hookDown).toBe(false)
  })
})
