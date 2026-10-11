import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DT } from '../../../src/sim/flight/model.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { parseShipSpec } from '../../../src/sim/world/ships.js'
import { flyProjectile, type Projectile } from '../../../src/sim/weapons/combat.js'
import { aaOwnersOf } from '../../../src/sim/weapons/aaFire.js'
import { flyTo, knockOuts, namedMounts, SHELLS, shellDamage, shellDragPerM, solveElevation } from '../../../src/sim/weapons/mainBattery.js'
import { advance } from '../../../src/sim/loop.js'
import { duelWorld } from './duelHarness.js'
import { terrainOrSkip } from '../mission/fly.js'
import { loadScenarioBundle } from '../../../tools/content/load.js'
import { withoutMainBatteries, worldFromScenario } from '../../../src/sim/scenario.js'

const SHIPS = readdirSync(new URL('../../../content/ships/', import.meta.url)).filter((f) => f.endsWith('.json'))
  .map((f) => parseShipSpec(JSON.parse(readFileSync(new URL(`../../../content/ships/${f}`, import.meta.url), 'utf8'))))

describe('main-battery shells (M4)', () => {
  it('every turret kit a warship carries has a shell, and the list is the whole fleet', () => {
    const kits = new Set(SHIPS.flatMap((s) => s.armament?.turrets.map((t) => t.kit!) ?? []))
    expect(kits.size).toBe(10) // not a vacuous pass: 10 kits across the 11 warships (read 2026-10-10)
    for (const k of kits) expect(SHELLS[k], k).toBeDefined()
  })

  it('the fitted drag puts a 45-degree shot at the cited maximum range', () => {
    for (const [kit, s] of Object.entries(SHELLS)) {
      const r = flyTo(Math.PI / 4, s.muzzleMps, shellDragPerM(kit, DT), 0, DT)!.rangeM
      expect(Math.abs(r - s.maxRangeM) / s.maxRangeM, kit).toBeLessThan(0.001)
    }
  })

  it('a solved elevation lands where it aims when flown by the combat integrator', () => {
    for (const kit of ['mount-5in38-single', 'turret-14in-triple']) {
      const s = SHELLS[kit]!, drag = shellDragPerM(kit, DT)
      for (const range of [3000, 9000, 14_000]) {
        const sol = solveElevation(range, -10, s.muzzleMps, drag, DT)!
        let p: Projectile = { owner: 'x', id: 1, position: v3(0, 10, 0), previous: v3(0, 10, 0), velocity: v3(Math.cos(sol.elev) * s.muzzleMps, Math.sin(sol.elev) * s.muzzleMps, 0), lifeS: 200, tracer: false, kind: 'round', ageS: 0 }
        while (!(p.velocity.y < 0 && p.position.y <= 0)) p = flyProjectile(p, DT, null, drag)
        const k = (p.previous.y - 0) / (p.previous.y - p.position.y)
        const landed = p.previous.x + (p.position.x - p.previous.x) * k
        expect(Math.abs(landed - range), `${kit} ${range}`).toBeLessThan(2)
      }
    }
  })

  it('refuses a target beyond reach', () => {
    const s = SHELLS['mount-5in38-single']!
    expect(solveElevation(s.maxRangeM * 1.05, 0, s.muzzleMps, shellDragPerM('mount-5in38-single', DT), DT)).toBeNull()
  })

  it('a heavy shell bites: two 14-inch hits finish a destroyer; a battleship takes many', () => {
    const fourteen = shellDamage(SHELLS['turret-14in-triple']!), five = shellDamage(SHELLS['mount-5in38-single']!)
    const hull = (id: string): number => SHIPS.find((s) => s.id === id)!.hullHp
    expect(Math.ceil(hull('fletcher-dd') / fourteen)).toBe(2)
    expect(Math.ceil(hull('yamato-bb') / fourteen)).toBeGreaterThanOrEqual(10)
    expect(Math.ceil(hull('fletcher-dd') / five)).toBeGreaterThanOrEqual(8)
  })

  it('a burst on a mount knocks it out about as often as the tuning says, and never beyond the radius', () => {
    const fletcher = SHIPS.find((s) => s.id === 'fletcher-dd')!
    const t1 = namedMounts(fletcher.armament!)[0]!
    const on = v3(t1.z, t1.y, -t1.x) // heading 0: bow is -z, starboard +x
    let hits = 0
    for (let id = 1; id <= 400; id++) if (knockOuts(fletcher.armament!, v3(0, 0, 0), 0, on, 'turret-14in-triple', [], 7, id).includes('Turret1')) hits++
    expect(hits / 400).toBeGreaterThan(0.5)
    expect(hits / 400).toBeLessThan(0.7)
    const far = v3(on.x + 30, on.y, on.z)
    for (let id = 1; id <= 50; id++) expect(knockOuts(fletcher.armament!, v3(0, 0, 0), 0, far, 'mount-5in38-single', [], 7, id)).toEqual([])
  })

  it('a knocked-out AA mount leaves the guns the AA director fires', () => {
    const fletcher = SHIPS.find((s) => s.id === 'fletcher-dd')!
    const ship = { id: 'dd', spec: fletcher, state: { position: v3(0, 0, 0), headingRad: 0 }, previous: { position: v3(0, 0, 0) } }
    const [all] = aaOwnersOf([ship], [], { dd: 'axis' }, {}, () => false, () => false)
    const [less] = aaOwnersOf([ship], [], { dd: 'axis' }, {}, () => false, () => false, () => ['LightAA3', 'Turret1'])
    expect(less!.mounts.mounts.length).toBe(all!.mounts.mounts.length - 2)
    expect(less!.mounts.mounts.some((m) => m.name === 'LightAA3' || m.name === 'Turret1')).toBe(false)
  })
})

describe('main batteries in the world (M4)', () => {
  const run = (on: boolean, seconds: number): ReturnType<typeof duelWorld> => {
    let w = duelWorld('fletcher-dd', 'kagero-dd', 6000, 3)
    if (!on) w = withoutMainBatteries(w)
    for (let i = 0; i < Math.round(seconds / DT); i++) w = advance(w, DT).world
    return w
  }

  it('off (no scenario flag), hostile ships in reach lay their guns but never fire', () => {
    const w = run(false, 40)
    expect(w.combat.impacts.some((i) => i.cause === 'shell')).toBe(false)
    expect(w.combat.projectiles.some((p) => p.shell !== undefined)).toBe(false)
    expect(w.combat.aa.laying['a']?.some((p) => p.targetId === 'b')).toBe(true) // M3 still lays
  }, 60_000)

  it('on, two destroyers fire, hit and replay identically', () => {
    const w1 = run(true, 60), w2 = run(true, 60)
    const fired = w1.combat.impacts.filter((i) => i.cause === 'shell' && i.outcome === 'fired')
    expect(new Set(fired.map((i) => i.mount!.ship))).toEqual(new Set(['a', 'b']))
    expect(w1.combat.ships['a']!.hp + w1.combat.ships['b']!.hp).toBeLessThan(160 + 180)
    expect(w1.combat).toEqual(w2.combat)
  }, 60_000)
})

const terrain = terrainOrSkip()
describe.skipIf(terrain === null)('the Gunnery Duel test range (M4, Track M item 6)', () => {
  it('builds over real terrain, and the cruiser destroys the battery while the destroyers fight', () => {
    let w = worldFromScenario(loadScenarioBundle('gunnery-duel'), terrain)
    expect(w.combat.mainBattery).toBeDefined()
    const salvos = new Set<string>()
    let seen = 0
    for (let i = 0; i < Math.round(150 / DT); i++) {
      w = advance(w, DT).world
      for (const h of w.combat.impacts) if (h.tick > seen && h.outcome === 'fired') salvos.add(h.mount!.ship)
      seen = w.tick
    }
    expect([...salvos].sort()).toEqual(['cl-shore', 'dd-allied', 'dd-axis'])
    expect(w.combat.structures['tacloban-aaa-1']!.destroyedTick).not.toBeNull()
    expect(w.combat.structures['tacloban-aaa-1']!.attacker).toBe('cl-shore')
  }, 120_000)
})
