import { advance, playerAircraft, withControls } from '../../src/sim/loop.js'
import { DT } from '../../src/sim/flight/model.js'
import { controlsForDesiredVelocity } from '../../src/sim/ai/controller.js'
import { worldFor, wanted, type Profile } from '../../tests/sim/weapons/aaHarness.js'

/** Scratch tracer: every AA hit on the Hellcat, when, from how far, and what it did. */
const profile = (process.argv[2] ?? 'pass') as Profile
const seed = Number(process.argv[3] ?? 0)
let w = worldFor(profile, seed)
const id = w.player
let seen = 0
for (let i = 0; i < 100 * 60; i++) {
  const me = playerAircraft(w)
  w = withControls(w, id, controlsForDesiredVelocity(me.state, me.spec, wanted(profile, me.state.position)))
  w = advance(w, DT).world
  const me2 = playerAircraft(w).state.position
  for (const h of w.combat.impacts) {
    if (h.tick <= seen) continue
    const r = Math.hypot(me2.x + 27916, me2.z + 48605)
    const dd = Math.hypot(h.point.x - me2.x, h.point.y - me2.y, h.point.z - me2.z)
    console.log(`${(w.tick / 60).toFixed(1)} s  miss ${dd.toFixed(0)} m ${h.cause} ${h.surface}  hit at range ${r.toFixed(0)} m  alt ${me2.y.toFixed(0)}  structure ${w.combat.aircraft[id]!.damage.structure.toFixed(2)}`)
  }
  seen = w.tick
  if (w.combat.aircraft[id]!.damage.burningSince !== null) break
}
