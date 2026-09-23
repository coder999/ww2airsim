import { describe, it, expect } from 'vitest'
import { createAirfield, AIRFIELD_HUTS } from '../../src/render/scene/airfield.js'
import { parseAirfield } from '../../src/sim/world/airfields.js'
import { loadAirfield } from '../../tools/content/load.js'
import { createTerrainField } from '../../src/sim/world/terrain.js'
import { FIRST_COMMITTED_LEVEL, loadTerrainHeader, loadTerrainLevel } from '../../tools/terrain/load.js'
import { healthyStructureDamage, type StructureDamage } from '../../src/sim/weapons/structures.js'

/** A minimal destroyed `StructureDamage`, the shape `combat.ts`'s
 *  `damageStructure` produces once hp reaches zero -- only `destroyedTick`
 *  matters to `airfield.ts`'s `sync`, but the other fields are filled in so
 *  the value type-checks as a real `StructureDamage`. */
const destroyedAt = (tick: number): StructureDamage => ({ hp: 0, destroyedTick: tick, attacker: 'test' })

const header = loadTerrainHeader()
const field = createTerrainField(header, FIRST_COMMITTED_LEVEL, loadTerrainLevel(FIRST_COMMITTED_LEVEL, header))

// The 7-entry table this repo shipped before Plan 6b, frozen here so the
// split (content buildings + AIRFIELD_HUTS) is provably the same set.
const OLD_TABLE = [
  { kind: 'hangar', x: -146, z: -150, width: 34, length: 42 },
  { kind: 'hangar', x: -146, z: -245, width: 34, length: 42 },
  { kind: 'hangar', x: -146, z: 100, width: 28, length: 36 },
  { kind: 'tower', x: -76, z: -55, width: 9, length: 9 },
  { kind: 'hut', x: -216, z: -60, width: 12, length: 28 },
  { kind: 'hut', x: -216, z: -15, width: 12, length: 28 },
  { kind: 'hut', x: -216, z: 30, width: 12, length: 28 },
] as const

describe('airfield buildings (Plan 6b: moved from a module constant into content)', () => {
  it("Tacloban's content buildings plus AIRFIELD_HUTS equal the old shipped table", () => {
    const tacloban = loadAirfield('tacloban')
    expect(tacloban.buildings).toHaveLength(4)
    const asOld = [
      ...tacloban.buildings.map((b) => ({ kind: b.kind, x: b.x, z: b.z, width: b.widthM, length: b.lengthM })),
      ...AIRFIELD_HUTS.map((h) => ({ kind: 'hut', x: h.x, z: h.z, width: h.width, length: h.length })),
    ]
    const sortKey = (r: { kind: string; x: number; z: number }) => `${r.kind}:${r.x}:${r.z}`
    expect(asOld.slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b))))
      .toEqual(OLD_TABLE.slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b))))
  })

  it('Dulag carries the same table for now, per its content note', () => {
    const dulag = loadAirfield('dulag')
    expect(dulag.buildings).toHaveLength(4)
    expect(dulag.reference.source).toMatch(/Plan 13d/)
  })

  it('rejects a building with an unknown kind or non-positive size', () => {
    const tacloban = loadAirfield('tacloban')
    const raw = JSON.parse(JSON.stringify(tacloban)) as Record<string, unknown>
    expect(() => parseAirfield({ ...raw, buildings: [{ id: 'x', kind: 'silo', x: 0, z: 0, widthM: 1, lengthM: 1, hp: 1 }] })).toThrow(/kind/)
    expect(() => parseAirfield({ ...raw, buildings: [{ id: 'x', kind: 'hangar', x: 0, z: 0, widthM: 0, lengthM: 1, hp: 1 }] })).toThrow(/widthM/)
  })

  it('opens Dulag\'s building/hut pass too, not just Tacloban\'s', () => {
    // Before Plan 6b, `createAirfield` gated its ENTIRE Tacloban-only block
    // (taxiways, buildings, stores, windsock) behind `airfield.id ===
    // 'tacloban'`, so Dulag drew an empty group (tests/render/scenery.test.ts
    // pinned that). This task narrows the gate to open only the
    // building/hut pass for every base -- Dulag's taxiways/stores/windsock
    // stay Tacloban-only, but its 4 content buildings plus the 3 huts now
    // draw, so the group is no longer empty.
    const dulag = loadAirfield('dulag')
    const { object } = createAirfield(field, dulag)
    expect(object.children.length).toBeGreaterThan(0)
  })
})

/**
 * Collapse geometry (Plan 6b Task 8; `sync` post-Task-8 fix). `createAirfield`
 * now returns a HANDLE, `{ object, sync, update }`, not the bare `Group` it
 * used to -- every content `buildings` entry (a strike target,
 * `World.structures`) gets its own named `structure:<id>` group with three
 * children: `intact` (the detailed building, merged per-building the way the
 * whole airfield used to merge everything), `collapsed` (a low broken box,
 * hidden until destroyed, sharing this file's own weathered material), and
 * `smoke` (a `createSmokeColumn` from `ordnance.ts`, reused rather than
 * reimplemented per Task 8's explicit instruction). `sync` replaced the
 * original one-way `setDestroyed(id)` latch: it is handed the CURRENT
 * `World.combat.structures` map every frame and sets every owned building's
 * visuals from that state each call, so a building can also revert to
 * intact -- the only way that happens is Restart rebuilding a fresh, healthy
 * `World.combat.structures`, which the original latch had no path to notice.
 */
describe('airfield collapse geometry (Plan 6b Task 8)', () => {
  it('every content building starts intact, with its collapsed variant and smoke column hidden', () => {
    const tacloban = loadAirfield('tacloban')
    const { object } = createAirfield(field, tacloban)
    for (const b of tacloban.buildings) {
      const group = object.getObjectByName(`structure:${b.id}`)
      expect(group).toBeDefined()
      expect(group!.getObjectByName('intact')!.visible).toBe(true)
      expect(group!.getObjectByName('collapsed')!.visible).toBe(false)
      expect(group!.getObjectByName('smoke')!.visible).toBe(false)
    }
  })

  it('sync swaps intact for the collapsed rubble box and starts its smoke column, leaving other buildings untouched', () => {
    const tacloban = loadAirfield('tacloban')
    const { object, sync } = createAirfield(field, tacloban)
    const [first, second] = tacloban.buildings
    sync({ [first!.id]: destroyedAt(1) })
    const hit = object.getObjectByName(`structure:${first!.id}`)!
    expect(hit.getObjectByName('intact')!.visible).toBe(false)
    expect(hit.getObjectByName('collapsed')!.visible).toBe(true)
    expect(hit.getObjectByName('smoke')!.visible).toBe(true)

    const spared = object.getObjectByName(`structure:${second!.id}`)!
    expect(spared.getObjectByName('intact')!.visible).toBe(true)
    expect(spared.getObjectByName('collapsed')!.visible).toBe(false)
  })

  it('an id with no matching building is a silent no-op', () => {
    const tacloban = loadAirfield('tacloban')
    const { sync } = createAirfield(field, tacloban)
    expect(() => sync({ 'no-such-building': destroyedAt(1) })).not.toThrow()
  })

  it("update() fades a destroyed building's smoke column to hidden once its lifetime elapses (spec §4: 60 s)", () => {
    const tacloban = loadAirfield('tacloban')
    const { object, sync, update } = createAirfield(field, tacloban)
    const id = tacloban.buildings[0]!.id
    sync({ [id]: destroyedAt(1) })
    const smoke = object.getObjectByName(`structure:${id}`)!.getObjectByName('smoke')!
    expect(smoke.visible).toBe(true)
    update(90) // past the 60 s collapse-smoke lifetime
    expect(smoke.visible).toBe(false)
  })

  it("opens Dulag's structures too, not just Tacloban's", () => {
    const dulag = loadAirfield('dulag')
    const { object, sync } = createAirfield(field, dulag)
    const id = dulag.buildings[0]!.id
    expect(object.getObjectByName(`structure:${id}`)).toBeDefined()
    expect(() => sync({ [id]: destroyedAt(1) })).not.toThrow()
  })

  it('a destroyed building reverts to intact when sync is called again with fresh, healthy structure state -- the Restart path', () => {
    // The regression test for the bug this fix closes: `main.ts` calls
    // `setDamage` on ships unconditionally every frame off CURRENT combat
    // state, so Restart's fresh world (healthyShipDamage, sinkingFraction 0)
    // naturally un-sinks a hull. Structures had no such path before this fix
    // -- `setDestroyed` was a one-way latch with no counterpart, so a
    // destroyed hangar stayed rubble forever even after Restart rebuilt a
    // healthy `World.combat.structures`. `sync` fixes that by re-deriving
    // every building's visuals from the CURRENT map on every call, exactly
    // as Restart's fresh, all-healthy structures map would drive it.
    const tacloban = loadAirfield('tacloban')
    const { object, sync } = createAirfield(field, tacloban)
    const id = tacloban.buildings[0]!.id
    const group = object.getObjectByName(`structure:${id}`)!

    sync({ [id]: destroyedAt(1) })
    expect(group.getObjectByName('intact')!.visible).toBe(false)
    expect(group.getObjectByName('collapsed')!.visible).toBe(true)
    expect(group.getObjectByName('smoke')!.visible).toBe(true)

    // Restart rebuilds `World.combat.structures` from scratch via
    // `healthyStructureDamage`, so every id maps back to `destroyedTick: null`.
    sync(Object.fromEntries(tacloban.buildings.map((b) => [b.id, healthyStructureDamage(b.hp)])))
    expect(group.getObjectByName('intact')!.visible).toBe(true)
    expect(group.getObjectByName('collapsed')!.visible).toBe(false)
    expect(group.getObjectByName('smoke')!.visible).toBe(false)
  })
})
