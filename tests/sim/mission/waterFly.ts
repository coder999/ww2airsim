/**
 * The headless water kit (F10B, 2026-10-17): the Catalina's water takeoff and landing flown through production `advance`, so a mission's own
 * trackers see every tick. `fly.ts`'s `deckRun` and `fieldApproach` cannot do this (they put the gear down and read ground height), so this is the
 * `waterApproach` the F10B plan allowed, kept in this batch's own files.
 *
 * Measured 2026-10-17 on `water-quals` (the PBY afloat in San Pedro Bay, real terrain): full throttle, floats down (`flapDown`), gear up, pitch 0.18,
 * lifts off at about 40 s and 43 m/s; a 3-degree-ish descent onto the water with the throttle closed touches down near 42 m/s at under 1 m/s of sink and
 * rolls out about 400 m to rest, about 10 s later (so a pilot aims the TOUCHDOWN at a raft and then taxis back to it).
 */
import { advance, playerAircraft, withAircraftState, withControls, type World } from '../../../src/sim/loop.js'
import { createState, DT } from '../../../src/sim/flight/model.js'
import { attitudeAngles } from '../../../src/sim/flight/attitude.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { ticksFor } from '../../../src/sim/mission/state.js'
import { waterSurfaceAt, waterSurfaceContext } from '../../../src/sim/waterSurface.js'
import { headingAttitude } from './fly.js'

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x))

function checkImpact(helper: string, w: World<undefined>): void {
  const impact = playerAircraft(w).impact
  if (impact !== null) {
    const dmg = w.combat.aircraft[w.player]?.damage
    const s = playerAircraft(w).state
    throw new Error(`${helper}: impact (${impact.kind}, ${impact.surface}) at tick ${impact.tick}; at ${s.position.x.toFixed(0)},${s.position.y.toFixed(1)},${s.position.z.toFixed(0)} v ${Math.hypot(s.velocity.x, s.velocity.z).toFixed(1)} vy ${s.velocity.y.toFixed(1)}; destroyedAt ${dmg?.destroyedAt ?? '-'} by ${dmg?.attacker ?? '-'}`)
  }
}

const landings = (w: World<undefined>): number => w.mission?.log.filter((e) => e.kind === 'landing').length ?? 0

/** The sea's height under (x, z) at this world's clock, from the same support sea the hull rides. */
export const seaHeightAt = (w: World<undefined>, x: number, z: number): number => waterSurfaceAt(waterSurfaceContext(w.tick * DT, w.wind), x, z).heightM

/**
 * A water takeoff and climb: full throttle, floats down (the flap lever), gear up, stick back 0.18, then, above 10 m, a level hold at `climbToM`
 * (default 150 m) with the throttle at 0.8 and the nose trimmed on the sink rate. Runs until the airplane is `climbToM` up or `maxS` (default 120)
 * passes; throws on an impact. The roll is the Catalina's own: nothing here steers it.
 */
export function waterTakeoff(w: World<undefined>, opts: { readonly climbToM?: number; readonly maxS?: number; readonly law?: 'fixed' | 'hold' } = {}): World<undefined> {
  const climbToM = opts.climbToM ?? 150
  let world = w
  for (let i = 0; i < ticksFor(opts.maxS ?? 120); i++) {
    const s = playerAircraft(world).state
    const high = s.position.y > 12
    const ground = Math.hypot(s.velocity.x, s.velocity.z)
    const want = ground < 30 ? 4 : ground < 38 ? 6 : 11
    const run = opts.law === 'hold' ? clamp((want - (attitudeAngles(s).pitchRad * 180) / Math.PI) * 0.08, -0.3, 0.3) : 0.18
    const pitch = high ? clamp((climbToM - s.position.y) * 0.004 - s.velocity.y * 0.02, -0.3, 0.2) : run
    world = advance(withControls(world, world.player, { pitch, roll: 0, yaw: 0, throttle: high ? 0.8 : 1, gearDown: false, flapDown: true }), DT).world
    checkImpact('waterTakeoff', world)
    if (playerAircraft(world).state.position.y >= climbToM - 5) return world
  }
  throw new Error(`waterTakeoff: not ${climbToM} m up after ${opts.maxS ?? 120} s at tick ${world.tick}`)
}

/**
 * A water landing flown by a plain descent: the airplane is put `startM` above the sea, `aheadM` short of (`x`, `z`) on `headingDeg` at `speedMps`
 * (floats down, gear up), and descends toward the point with a sink rate that falls from 2 m/s to a flare below 25 m, throttle closed below 25 m.
 * Stops at the first new `landing` in the mission log (the roll-out ends it), returns that world; throws on an impact or after `maxS` (default 240).
 * The TOUCHDOWN falls well past (x, z) when `aheadM` is short, because the airplane is still fast: use `touchdownNear` to aim it.
 */
export const waterApproach = (
  w: World<undefined>, x: number, z: number, headingDeg: number,
  opts: { readonly startM?: number; readonly aheadM?: number; readonly speedMps?: number; readonly maxS?: number } = {},
): World<undefined> => flyApproach(w, x, z, headingDeg, opts).world

type Touch = { readonly x: number; readonly z: number }

function flyApproach(
  w: World<undefined>, x: number, z: number, headingDeg: number,
  opts: { readonly startM?: number; readonly aheadM?: number; readonly speedMps?: number; readonly maxS?: number } = {},
): { readonly world: World<undefined>; readonly touchdown: Touch } {
  const startM = opts.startM ?? 150
  const aheadM = opts.aheadM ?? 3500
  const speed = opts.speedMps ?? 38 // an AIRSPEED: the Catalina's water-landing limit is 42.7 m/s and its stall 28.3
  const h = (headingDeg * Math.PI) / 180
  const dir = { x: Math.sin(h), z: -Math.cos(h) }
  let world = withAircraftState(w, w.player, createState({
    position: v3(x - dir.x * aheadM, startM, z - dir.z * aheadM),
    velocity: v3(dir.x * speed + (w.wind?.x ?? 0), 0, dir.z * speed + (w.wind?.z ?? 0)),
    attitude: headingAttitude(headingDeg),
    gearFraction: 0,
    flapFraction: 1,
    tick: w.tick,
  }))
  world = { ...world, aircraft: world.aircraft.map((a) => (a.id === world.player ? { ...a, parked: false } : a)) }
  const landed = landings(world)
  let touchdown: Touch | null = null
  for (let i = 0; i < ticksFor(opts.maxS ?? 240); i++) {
    const s = playerAircraft(world).state
    const height = s.position.y - seaHeightAt(world, s.position.x, s.position.z)
    const air = Math.hypot(s.velocity.x - (world.wind?.x ?? 0), s.velocity.z - (world.wind?.z ?? 0))
    const sinkWant = height > 25 ? 2 : Math.max(0.6, height * 0.08)
    const pitch = clamp((-s.velocity.y - sinkWant) * 0.12 + (height < 6 ? 0.05 : 0), -0.3, 0.3)
    const throttle = height > 25 ? clamp(0.25 - (air - speed) * 0.04, 0, 1) : 0
    world = advance(withControls(world, world.player, { pitch, roll: 0, yaw: 0, throttle, gearDown: false, flapDown: true }), DT).world
    checkImpact('waterApproach', world)
    // The tracker holds the touchdown from first contact until the report resets it, so the last one seen is where it came down.
    touchdown = world.mission?.recovery.touchdown ?? touchdown
    if (landings(world) > landed) return { world, touchdown: touchdown! }
  }
  throw new Error(`waterApproach: no landing within ${opts.maxS ?? 240} s at tick ${world.tick}`)
}

/**
 * The staged touchdown: the airplane latched airborne 60 m up over (x, z), then put on the water there at 35 m/s, floats down, and stepped until the
 * landing tracker has a touchdown; returns that world just before the roll-out ends. For a test that needs the touchdown AT a point (the real
 * `waterApproach` rolls on for 400 m). `rest` then puts it at rest, which is when the report fires.
 */
export function stagedTouchdown(w: World<undefined>, x: number, z: number): World<undefined> {
  const hullM = playerAircraft(w).spec.waterOperations!.hullDepthM
  const pin = (y: number, speed: number, sink: number, tick: number) => createState({
    position: v3(x, y, z), velocity: v3(0, -sink, -speed), attitude: headingAttitude(0), gearFraction: 0, flapFraction: 1, tick,
  })
  let world = withAircraftState(w, w.player, pin(seaHeightAt(w, x, z) + hullM + 60, 45, 0, w.tick))
  world = { ...world, aircraft: world.aircraft.map((a) => (a.id === world.player ? { ...a, parked: false } : a)) }
  world = advance(world, DT).world
  // As `landOnce`: pinned once just above the water, then the physics brings it down; the tracker's touchdown is the first supported contact.
  world = withAircraftState(world, world.player, pin(seaHeightAt(world, x, z) + hullM + 0.3, 35, 1, world.tick))
  for (let i = 0; i < 240 && world.mission!.recovery.touchdown === null; i++) world = advance(world, DT).world
  if (world.mission!.recovery.touchdown === null) throw new Error(`stagedTouchdown: no touchdown within 240 ticks at tick ${world.tick}`)
  return world
}

/** The airplane's state at rest on the water at (x, z), heading east by default, riding the support sea. */
export function restState(w: World<undefined>, x: number, z: number, headingDeg = 90, speedMps = 0): ReturnType<typeof createState> {
  const ops = playerAircraft(w).spec.waterOperations!
  const h = (headingDeg * Math.PI) / 180
  return createState({
    position: v3(x, seaHeightAt(w, x, z) + ops.hullDepthM - ops.displacementDraftM, z),
    velocity: v3(Math.sin(h) * speedMps, 0, -Math.cos(h) * speedMps), attitude: headingAttitude(headingDeg), gearFraction: 0, flapFraction: 1, tick: w.tick,
  })
}

/** The airplane at rest on the water at (x, z): one tick, which is when the landing report fires after a touchdown. */
export function restAt(w: World<undefined>, x: number, z: number, headingDeg = 0): World<undefined> {
  return advance(withAircraftState(w, w.player, restState(w, x, z, headingDeg)), DT).world
}

/**
 * `waterApproach` with its starting distance searched for: the real descent is flown (`aheadM` short of the target is the only free number), the
 * touchdown read off the tracker, and `aheadM` corrected by the along-track error until the touchdown lies within `tolM` of (x, z). Returns the world
 * at the landing report, the touchdown and the `aheadM` that found it. Deterministic, so the search is repeatable; throws if it does not converge.
 * It is how a test says "he touched down 100 yd from the raft" with a flown landing rather than a staged one.
 */
export function approachTouching(
  w: World<undefined>, x: number, z: number, headingDeg: number,
  opts: { readonly tolM?: number; readonly aheadM?: number } = {},
): { readonly world: World<undefined>; readonly touchdown: Touch; readonly aheadM: number } {
  const tolM = opts.tolM ?? 40
  const h = (headingDeg * Math.PI) / 180
  const dir = { x: Math.sin(h), z: -Math.cos(h) }
  let ahead = opts.aheadM ?? 3600
  for (let i = 0; i < 6; i++) {
    const r = flyApproach(w, x, z, headingDeg, { aheadM: ahead })
    const along = (r.touchdown.x - x) * dir.x + (r.touchdown.z - z) * dir.z // positive: it touched past the target
    const across = (r.touchdown.x - x) * -dir.z + (r.touchdown.z - z) * dir.x
    if (Math.hypot(along, across) <= tolM) return { ...r, aheadM: ahead }
    ahead += along
  }
  throw new Error(`approachTouching: touchdown not within ${tolM} m of (${x}, ${z}) after 6 corrections`)
}
