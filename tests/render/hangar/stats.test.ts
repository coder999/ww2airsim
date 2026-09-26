// tests/render/hangar/stats.test.ts
import { describe, expect, it } from 'vitest'
import { buildCatalog } from '../../../src/render/hangar/catalog.js'
import { figuresFor, shipTargetType, structureTargetType } from '../../../src/render/hangar/stats.js'
import { pointsForTargetType } from '../../../src/render/debrief.js'
import { nodeHangarContent } from './content.js'

const catalog = buildCatalog(nodeHangarContent())
const byId = (id: string) => catalog.find((e) => e.library.id === id)!
const figure = (id: string, label: string) => figuresFor(byId(id)).find((f) => f.label === label)

describe('figuresFor (Hangar spec §5), against committed content', () => {
  it("the F6F: structure HP, top speed, guns and rounds, points, all read from f6f-hellcat.json", () => {
    expect(figure('f6f-hellcat', 'Structure')?.value).toBe('120 HP')
    expect(figure('f6f-hellcat', 'Top speed')?.value).toBe('629 km/h at 7,041 m')
    expect(figure('f6f-hellcat', 'Top speed')?.note).toBeUndefined()
    expect(figure('f6f-hellcat', 'Guns')?.value).toBe('6, 2,400 rounds')
    expect(figure('f6f-hellcat', 'Points when shot down')?.value).toBe(String(pointsForTargetType('fighter')))
  })

  it("the F4F's borrowed flight figures carry its own PLACEHOLDER text; its HP does not", () => {
    expect(figure('f4f-wildcat', 'Top speed')?.note).toBe('PLACEHOLDER, not F4F-4 data')
    expect(figure('f4f-wildcat', 'Load limit')?.note).toBe('PLACEHOLDER, not F4F-4 data')
    expect(figure('f4f-wildcat', 'Structure')?.note).toMatch(/gameplay value/)
  })

  it('a ship: hull, dimensions, speed in knots and m/s; an escort does not score', () => {
    expect(figure('essex-cv', 'Points when sunk')?.value).toBe(pointsForTargetType('carrier').toLocaleString('en-US'))
    expect(figure('fletcher-dd', 'Points when sunk')?.value).toBe('none')
    expect(figure('fletcher-dd', 'Top speed')?.value).toMatch(/^\d+\.\d kn \(\d+\.\d m\/s\)$/)
  })

  it('a building kind: HP range across placements and where it stands', () => {
    expect(figure('hangar', 'Hit points')?.value).toBe('50–120 HP')
    expect(figure('hangar', 'Where')?.value).toBe('Dulag ×2, Tacloban ×3')
    expect(figure('aaa', 'Points when destroyed')?.value).toBe(String(pointsForTargetType('aaa')))
  })

  it('"Not yet in service" has no figures', () => {
    const out = catalog.find((e) => e.subject === null)!
    expect(figuresFor(out)).toEqual([])
  })
})

describe('the target-type mirror of src/sim/weapons/combat.ts', () => {
  it('ships: only carrier, cruiser and battleship score', () => {
    expect(['carrier', 'cruiser', 'battleship', 'escort', 'merchant'].map((r) => shipTargetType(r as never)))
      .toEqual(['carrier', 'cruiser', 'battleship', null, null])
  })
  it("structures: 'aaa' scores as AAA, every other kind as Building", () => {
    expect(['hangar', 'tower', 'aaa'].map((k) => structureTargetType(k as never))).toEqual(['building', 'building', 'aaa'])
  })
})
