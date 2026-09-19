import { describe, it, expect } from 'vitest'
import { GUN_CUE_INTERVAL_TICKS, NO_AUDIO_MEMORY, nextAudio, type AudioInputs } from '../../src/audio/cues.js'

const flying: AudioInputs = {
  throttle: 0.8, engineRunning: true, impact: null, onGround: false, groundSurface: 'land', tick: 100, shots: 0,
}
const hit = (surface: 'water' | 'land', kind: 'ditched' | 'destroyed', over: AudioInputs = flying): AudioInputs =>
  ({ ...over, engineRunning: false, throttle: 0, impact: { tick: 4102, kind, surface } })

describe('the audio cue reducer (design §6.2)', () => {
  it('does not squeak on a parked spawn, which is the DEFAULT spawn', () => {
    // The scenario's player starts parked (`content/scenarios/free-flight.json`'s
    // `parkedAt`, built into `AircraftEntity.parked: true` by `worldFromScenario`,
    // `src/sim/scenario.ts`): the airplane is parked on the Tacloban strip and
    // held at zero elapsed time until the heightfield arrives seconds later.
    // `onGround` is null until then. A transition needs two KNOWN values;
    // this is the assertion that says so.
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

  it('squeaks on a DECK, which carries wheels exactly as land does', () => {
    // `ContactSurface` has had three members since Plan 8, and a trap is a
    // landing: steel under the wheels is a hard surface wherever land is
    // (Plan 8 review, item 3). Only water is not.
    const m = nextAudio(NO_AUDIO_MEMORY, { ...flying, groundSurface: 'deck' }).memory
    const touch = nextAudio(m, { ...flying, groundSurface: 'deck', onGround: true })
    expect(touch.cues).toEqual(['landing_squeak'])
  })

  it('NEVER squeaks over water, however the airplane arrives there', () => {
    // Mark, 2026-09-18: ditching produced a touchdown squeak AND an explosion.
    // `heightAt` returns SEA_LEVEL_M over open sea (src/sim/world/terrain.ts),
    // so `onGround` goes true the moment the airplane reaches the surface --
    // one or more frames BEFORE `advance` registers the impact, which is why
    // suppressing the squeak on `impact !== null` alone did not catch it.
    // Wheels do not squeak on the sea whatever else is true.
    const m = nextAudio(NO_AUDIO_MEMORY, { ...flying, groundSurface: 'water' }).memory
    const touch = nextAudio(m, { ...flying, groundSurface: 'water', onGround: true })
    expect(touch.cues).toEqual([])
  })

  it('plays the water sound for ANY contact with water, ditched or destroyed', () => {
    // Keyed on `surface`, not `kind`. `contactOutcome` returns 'destroyed' for
    // a hard arrival on water as readily as on land (src/sim/contact.ts:69),
    // so keying on `kind` gave an EXPLOSION for a crash into the sea -- which
    // is exactly what Mark heard.
    for (const kind of ['ditched', 'destroyed'] as const) {
      const fired: string[] = []
      let m = NO_AUDIO_MEMORY
      for (let i = 0; i < 100; i++) {
        const f = nextAudio(m, hit('water', kind)); m = f.memory; fired.push(...f.cues)
      }
      expect(fired, kind).toEqual(['water_crash'])
    }
  })

  it('plays the explosion for a contact with land, once', () => {
    const fired: string[] = []
    let m = NO_AUDIO_MEMORY
    for (let i = 0; i < 100; i++) {
      const f = nextAudio(m, hit('land', 'destroyed')); m = f.memory; fired.push(...f.cues)
    }
    expect(fired).toEqual(['explosion'])
  })

  it('cuts the engine the moment the flight ends', () => {
    const wreck = nextAudio(NO_AUDIO_MEMORY, { ...flying, throttle: 1, engineRunning: false })
    expect(wreck.engine.gain).toBe(0)
  })

  it('does not squeak on a wreck settling onto the ground', () => {
    const m = nextAudio(NO_AUDIO_MEMORY, flying).memory
    const dead = nextAudio(m, { ...hit('land', 'destroyed'), onGround: true })
    expect(dead.cues).toEqual(['explosion'])
  })

  it('does not squeak when the flight RESTARTS onto the ground', () => {
    // Mark, 2026-09-18: re-spawning played the touchdown squeak. Restart
    // rebuilds the frame from `initialFrameState` with the boot aircraft
    // (main.ts's debrief callback), so the tick goes BACKWARDS while the
    // memory carries the previous flight's airborne state -- and a parked
    // spawn then reads as a false -> true transition. A tick that moves
    // backwards is a new flight, not a landing.
    // The wreck must be AIRBORNE for this to discriminate: the airplane stops
    // where it hit, and flying into a hillside leaves it off the ground. An
    // earlier version of this test settled the wreck onto the ground first,
    // so `wasOnGround` was already true, no transition existed and it passed
    // against the UNFIXED reducer -- guarding nothing.
    let m = nextAudio(NO_AUDIO_MEMORY, flying).memory                     // airborne, tick 100
    m = nextAudio(m, hit('land', 'destroyed')).memory                     // still airborne, frozen
    expect(m.wasOnGround).toBe(false)
    const respawn = nextAudio(m, { ...flying, onGround: true, tick: 0 })  // parked, tick reset
    expect(respawn.cues).toEqual([])
    // ...and it still squeaks on the first real landing of the NEW flight.
    const n = nextAudio(respawn.memory, { ...flying, onGround: false, tick: 1 }).memory
    const landed = nextAudio(n, { ...flying, onGround: true, tick: 2 })
    expect(landed.cues).toEqual(['landing_squeak'])
  })

  it('lets the new flight fire its own impact even at a tick the old one used', () => {
    // The fired-impact guard is a tick number, so a restart has to clear it or
    // the second flight's crash at the same tick would be silent.
    let m = nextAudio(NO_AUDIO_MEMORY, flying).memory
    m = nextAudio(m, hit('land', 'destroyed')).memory
    m = nextAudio(m, { ...flying, onGround: true, tick: 0 }).memory
    const again = nextAudio(m, hit('land', 'destroyed', { ...flying, tick: 4102 }))
    expect(again.cues).toEqual(['explosion'])
  })

  it('is pure -- the same memory and inputs give the same answer', () => {
    const a = nextAudio(NO_AUDIO_MEMORY, flying)
    const b = nextAudio(NO_AUDIO_MEMORY, flying)
    expect(b).toEqual(a)
  })
})

describe('gun audio follows the shot count (Plan 6)', () => {
  const flyingArmed: AudioInputs = { ...flying, tick: 100, shots: 0 }
  const firing = (tick: number, shots: number): AudioInputs => ({ ...flyingArmed, tick, shots })

  it('cues the burst when the count rises, and stays silent while it is flat', () => {
    // Holding Space over empty or shot-away guns emits no rounds, so the
    // count does not move and this hears nothing -- the design's "holding an
    // empty or disabled gun is silent" is this rule, not a trigger check.
    const quiet = nextAudio(NO_AUDIO_MEMORY, firing(101, 0))
    expect(quiet.cues).toEqual([])
    const first = nextAudio(quiet.memory, firing(102, 6))
    expect(first.cues).toEqual(['machinegun'])
    const flat = nextAudio(first.memory, firing(103, 6))
    expect(flat.cues).toEqual([])
  })

  it('re-cues once per clip interval while rounds keep leaving, not once per round', () => {
    let m = NO_AUDIO_MEMORY
    const fired: string[] = []
    // Six guns at 800 rpm: about 80 rounds a second, over three seconds.
    for (let tick = 1; tick <= 180; tick++) {
      const f = nextAudio(m, firing(tick, Math.floor(tick * 80 / 60)))
      m = f.memory
      fired.push(...f.cues)
    }
    expect(fired.every((c) => c === 'machinegun')).toBe(true)
    expect(fired.length).toBe(Math.ceil(180 / GUN_CUE_INTERVAL_TICKS))
  })

  it('replays nothing on a paused or repeated frame, and hears the new flight after a restart', () => {
    let m = nextAudio(NO_AUDIO_MEMORY, firing(50, 40)).memory
    // Paused: the same tick and the same count, sixty times.
    for (let i = 0; i < 60; i++) {
      const f = nextAudio(m, firing(50, 40))
      expect(f.cues).toEqual([])
      m = f.memory
    }
    // Restart: the tick goes backwards and the count is rebuilt at zero.
    const respawn = nextAudio(m, firing(0, 0))
    expect(respawn.cues).toEqual([])
    // ...and the first burst of the new flight fires even though the old
    // flight's interval had not elapsed at tick 50 + 72.
    expect(nextAudio(respawn.memory, firing(1, 6)).cues).toEqual(['machinegun'])
  })
})
