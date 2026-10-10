import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { advance, aircraftById, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { bundleForScenario } from '../../../tools/content/load.js'
import type { AttackKind } from '../../../src/sim/ai/pilot.js'
import { initialAa } from '../../../src/sim/weapons/aaFire.js'
import { flatField } from '../mission/fixture.js'

/**
 * The attack calibration bed (E2): one raider flies a route to an anchored ship (or a strip) and
 * attacks it, on a flat sea, with the ship's AA stripped unless `aa` is set. A seed is the start
 * bearing, the raider's id (so its noise and its sight error) and the AA's luck. Used by the attack
 * tests and by `tools/ai/attackSweep.ts`; both run on ryzen.
 */
export const SHIP = { x: -27000, z: -48000 }

export type AttackOptions = {
  readonly kind: AttackKind
  readonly spec: string
  readonly skill: 'green' | 'veteran'
  readonly seed: number
  /** Ship (default 'fletcher-dd') or 'strip' for Tacloban's runway. */
  readonly target?: string
  readonly shipSpeedMps?: number
  readonly altitudeM?: number
  readonly speedMps?: number
  readonly startRangeM?: number
  readonly aa?: boolean
  readonly maxS?: number
  /** Which side the ship is on; the raider is axis. */
  readonly shipSide?: 'allied' | 'axis'
  /** The strip's side (default allied); the raider is axis. */
  readonly stripSide?: 'allied' | 'axis'
}

export function attackWorld(o: AttackOptions): World<undefined> {
  const ang = o.seed * 2.399963 // golden angle
  const startRange = o.startRangeM ?? 14000
  const alt = o.altitudeM ?? 3000
  const speed = o.speedMps ?? 120
  const wpRange = 7000
  const at = (r: number) => [SHIP.x + Math.cos(ang) * r, SHIP.z + Math.sin(ang) * r] as const
  const [sx, sz] = at(startRange)
  const [wx, wz] = at(wpRange)
  // compass heading toward the ship: 0 north (-z), 90 east (+x)
  const headingDeg = ((Math.atan2(SHIP.x - sx, -(SHIP.z - sz)) * 180) / Math.PI + 360) % 360
  const strip = o.target === 'strip'
  const raw = {
    id: 'attack-bed', player: 'f6f-1', airfields: ['tacloban'],
    ...(strip ? { airfieldSides: { tacloban: o.stripSide ?? 'allied' } } : {}),
    aircraft: [
      { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [60000, 3000, 60000], headingDeg: 90, speedMps: 120 } },
      {
        id: `atk-${o.seed}`, spec: o.spec, airborneAt: { position: [sx, alt, sz], headingDeg, speedMps: speed },
        pilot: {
          skill: o.skill,
          ingress: {
            route: [{ x: wx, z: wz, altitudeM: alt, speedMps: speed }],
            destination: strip ? { airfield: 'tacloban' } : { ship: 'dd-1' },
            attack: o.kind,
          },
        },
      },
    ],
    ships: strip ? [] : [{ id: 'dd-1', spec: o.target ?? 'fletcher-dd', side: o.shipSide ?? 'allied', waypoints: [[SHIP.x, SHIP.z], [SHIP.x + 20000, SHIP.z]], speedMps: o.shipSpeedMps ?? 0 }],
    weather: { windFromDeg: 0, windMps: 0 },
  }
  const bundle = bundleForScenario(parseScenario(raw))
  const specs = o.aa === true ? bundle.shipSpecs : Object.fromEntries(Object.entries(bundle.shipSpecs).map(([k, s]) => [k, { ...s, armament: undefined }]))
  // The airfield's own AA battery is off too (unless `aa`): it is the strip's, and it shoots at a raider.
  const airfields = o.aa === true ? bundle.airfields : Object.fromEntries(Object.entries(bundle.airfields).map(([k, f]) => [k, { ...f, buildings: f.buildings.filter((b) => b.kind !== 'aaa') }]))
  // A sea-level terrain field, not null: only a field makes the sea something an airplane can crash into.
  const w = worldFromScenario({ ...bundle, shipSpecs: specs, airfields }, flatField(0))
  return { ...w, combat: { ...w.combat, aa: initialAa(o.seed + 1) } }
}

export type AttackRun = {
  readonly hpLost: number
  readonly hit: boolean
  /** Ordnance that detonated ON the ship (a bomb that struck the hull, a torpedo that exploded on it); `hit` also counts blast. */
  readonly direct: number
  /** Per release: the time, the raider's height above the sea and speed, and (bombs) the impact's distance from the ship. */
  readonly releases: readonly { readonly s: number; readonly heightM: number; readonly speedMps: number; readonly rangeM: number; readonly doors: number }[]
  readonly impactMissM: readonly number[]
  readonly minHeightM: number
  readonly bombsLeft: number
  readonly torpedoesBrokeUp: number
  /** Torpedoes that entered the water and ran. */
  readonly torpedoesRan: number
  readonly lostS: number | null
  readonly endPhase: string
  readonly seconds: number
  readonly world: World<undefined>
}

export function runAttack(o: AttackOptions): AttackRun {
  let w = attackWorld(o)
  const id = `atk-${o.seed}`
  const maxTicks = Math.round((o.maxS ?? 260) / DT)
  const hp0 = w.combat.ships['dd-1']?.hp ?? 0
  const releases: { s: number; heightM: number; speedMps: number; rangeM: number; doors: number }[] = []
  const impactMiss: number[] = []
  let minH = Infinity
  let direct = 0
  let ran = 0
  let dropped = 0
  let lostS: number | null = null
  let t = 0
  for (; t < maxTicks; t++) {
    const before = aircraftById(w, id)!
    const rec0 = w.combat.aircraft[id]!
    w = advance(w, DT).world
    const a = aircraftById(w, id)!
    const rec = w.combat.aircraft[id]!
    if (rec.bombsDropped > dropped) {
      dropped = rec.bombsDropped
      const ship = w.ships.find((x) => x.id === 'dd-1')
      const c = ship?.state.position ?? w.airfields[0]!.runway.center
      releases.push({
        s: t * DT, heightM: before.state.position.y, speedMps: Math.hypot(before.state.velocity.x, before.state.velocity.y, before.state.velocity.z),
        rangeM: Math.hypot(c.x - before.state.position.x, c.z - before.state.position.z), doors: before.state.bayDoorFraction,
      })
    }
    for (const im of w.combat.impacts) {
      if (im.tick === w.tick && (im.cause === 'bomb') && im.outcome === 'detonated') {
        const s = w.ships.find((x) => x.id === 'dd-1')
        const c = w.airfields[0]!.runway.center
        const cx = s?.state.position.x ?? c.x, cz = s?.state.position.z ?? c.z
        impactMiss.push(Math.hypot(im.point.x - cx, im.point.z - cz))
      }
    }
    for (const im of w.combat.impacts) {
      if (im.tick === w.tick && im.cause === 'torpedo' && im.outcome === 'entered') ran++
      if (im.tick === w.tick && (im.cause === 'bomb' || im.cause === 'torpedo') && im.outcome === 'detonated' && im.surface === 'ship') direct++
    }
    if (rec0.damage.destroyedAt === null && rec.damage.destroyedAt !== null && lostS === null) lostS = t * DT
    if (a.pilot?.decision.mode === 'rtb') break
    minH = Math.min(minH, a.state.position.y)
    if (a.impact !== null) { lostS ??= t * DT; break }
    if (a.pilot?.decision.attack?.phase === 'done' && (w.combat.projectiles.length === 0)) break
  }
  const hp = w.combat.ships['dd-1']?.hp ?? hp0
  const a = aircraftById(w, id)!
  return {
    hpLost: hp0 - hp, hit: hp < hp0, direct, releases, impactMissM: impactMiss, minHeightM: minH,
    bombsLeft: w.combat.aircraft[id]!.stores.bombs, torpedoesBrokeUp: w.combat.aircraft[id]!.torpedoesBrokeUp, torpedoesRan: ran, lostS,
    endPhase: a.pilot?.decision.attack?.phase ?? 'none', seconds: t * DT, world: w,
  }
}
