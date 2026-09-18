import { describe, it, expect } from 'vitest'
import { NO_AUDIO_MEMORY, nextAudio, type AudioInputs } from '../../src/audio/cues.js'

const flying: AudioInputs = { throttle: 0.8, engineRunning: true, impact: null, onGround: false }

describe('the audio cue reducer (design §6.2)', () => {
  it('does not squeak on a parked spawn, which is the DEFAULT spawn', () => {
    // DEFAULT_SPAWN_IS_GROUND is true (src/render/spawn.ts): the airplane is
    // parked on the Tacloban strip and held at zero elapsed time until the
    // heightfield arrives seconds later. `onGround` is null until then. If
    // `null` were modelled as `false`, every flight would open with a landing
    // squeak before the pilot touched a key. A transition needs two KNOWN
    // values; this is the assertion that says so.
    const parked = { ...flying, onGround: null }
    const first = nextAudio(NO_AUDIO_MEMORY, parked)
    expect(first.cues).toEqual([])
    const second = nextAudio(first.memory, { ...flying, onGround: true })
    expect(second.cues).toEqual([])
  })

  it('squeaks exactly once on a real touchdown', () => {
    const airborne = nextAudio(NO_AUDIO_MEMORY, flying)
    const down = nextAudio(airborne.memory, { ...flying, onGround: true })
    expect(down.cues).toEqual(['landing_squeak'])
    const rolling = nextAudio(down.memory, { ...flying, onGround: true })
    expect(rolling.cues).toEqual([])
  })

  it('squeaks again on the second contact of a bounce, because that is what happened', () => {
    let m = nextAudio(NO_AUDIO_MEMORY, flying).memory
    const a = nextAudio(m, { ...flying, onGround: true }); m = a.memory
    const b = nextAudio(m, { ...flying, onGround: false }); m = b.memory
    const c = nextAudio(m, { ...flying, onGround: true })
    expect(a.cues).toEqual(['landing_squeak'])
    expect(c.cues).toEqual(['landing_squeak'])
  })

  it('plays water_crash for a ditching and explosion for a destruction, once each', () => {
    // `World.impact` is never overwritten once set (src/sim/loop.ts) and the
    // renderer keeps calling this 60+ times a second afterward -- the same
    // situation `shownImpactTick` guards in main.ts for the debrief modal.
    for (const [kind, clip] of [['ditched', 'water_crash'], ['destroyed', 'explosion']] as const) {
      const hit: AudioInputs = { throttle: 0, engineRunning: false, impact: { tick: 4102, kind }, onGround: false }
      let m = NO_AUDIO_MEMORY
      const fired: string[] = []
      for (let i = 0; i < 100; i++) { const f = nextAudio(m, hit); m = f.memory; fired.push(...f.cues) }
      expect(fired).toEqual([clip])
    }
  })

  it('cuts the engine the moment the flight ends', () => {
    // main.ts already gates the propeller MESH on `world.impact === null`,
    // with the reason at the call site: an ungated spin leaves the propeller
    // turning at full speed on a wreck in its own fireball. Same gate, same
    // reason, for the sound.
    const wreck = nextAudio(NO_AUDIO_MEMORY, { ...flying, throttle: 1, engineRunning: false })
    expect(wreck.engine.gain).toBe(0)
  })

  it('does not squeak on a wreck settling onto the ground', () => {
    const m = nextAudio(NO_AUDIO_MEMORY, flying).memory
    const dead = nextAudio(m, { ...flying, engineRunning: false, onGround: true, impact: { tick: 7, kind: 'destroyed' } })
    expect(dead.cues).toEqual(['explosion'])
  })

  it('is pure -- the same memory and inputs give the same answer', () => {
    const a = nextAudio(NO_AUDIO_MEMORY, flying)
    const b = nextAudio(NO_AUDIO_MEMORY, flying)
    expect(b).toEqual(a)
  })
})
