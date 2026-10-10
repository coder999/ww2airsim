import { crowdedWorld } from '../../tests/sim/weapons/aaHarness.js'
import { advance, playerAircraft, withControls } from '../../src/sim/loop.js'
import { DT } from '../../src/sim/flight/model.js'
import { controlsForDesiredVelocity } from '../../src/sim/ai/controller.js'
import { healthyDamage } from '../../src/sim/damage/model.js'
import { v3 } from '../../src/sim/math/vec3.js'
let w = crowdedWorld()
const id = w.player
console.log('ships', w.ships.length, 'armed', w.ships.filter((s) => s.spec.armament !== undefined).length)
let maxLive = 0, maxBursts = 0
const t0 = performance.now()
const N = 60 * 60
for (let i = 0; i < N; i++) {
  const me = playerAircraft(w)
  const p = me.state.position
  const dx = p.x + 27916, dz = p.z + 48105
  const r = Math.hypot(dx, dz) || 1
  w = withControls(w, id, controlsForDesiredVelocity(me.state, me.spec, v3(-dz / r * 100, (91 - p.y) * 0.4, dx / r * 100)))
  w = advance(w, DT).world
  maxLive = Math.max(maxLive, w.combat.projectiles.filter((q) => q.aa !== undefined).length)
  maxBursts = Math.max(maxBursts, w.combat.aa.bursts.length)
  // Keep the Hellcat alive so the guns keep their target for the whole minute (the worst case).
  w = { ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, [id]: { ...w.combat.aircraft[id]!, damage: healthyDamage() } } } }
}
const ms = performance.now() - t0
console.log(`sim ${N / 60} s in ${ms.toFixed(0)} ms (${(ms / N).toFixed(2)} ms/tick), max live AA rounds ${maxLive}, max pending bursts ${maxBursts}`)
