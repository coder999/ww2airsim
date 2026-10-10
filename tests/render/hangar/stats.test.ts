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
    expect(figure('f6f-hellcat', 'Structure')?.value).toBe('480 HP')
    expect(figure('f6f-hellcat', 'Top speed')?.value).toBe('391 mph at 23,100 ft')
    expect(figure('f6f-hellcat', 'Top speed')?.note).toBeUndefined()
    expect(figure('f6f-hellcat', 'Guns')?.value).toBe('6, 2,400 rounds')
    expect(figure('f6f-hellcat', 'Points when shot down')?.value).toBe(String(pointsForTargetType('fighter')))
  })

  it("the F4F is a real F4F-4 now, no PLACEHOLDER note; its HP is still a gameplay value", () => {
    expect(figure('f4f-wildcat', 'Top speed')?.note).toBeUndefined()
    expect(figure('f4f-wildcat', 'Load limit')?.note).toBeUndefined()
    expect(figure('f4f-wildcat', 'Structure')?.note).toMatch(/gameplay value/)
  })

  it('a ship: hull, dimensions, speed in knots and m/s; an escort scores as a destroyer', () => {
    expect(figure('essex-cv', 'Points when sunk')?.value).toBe(pointsForTargetType('carrier').toLocaleString('en-US'))
    expect(figure('fletcher-dd', 'Points when sunk')?.value).toBe(pointsForTargetType('destroyer').toLocaleString('en-US'))
    expect(figure('fletcher-dd', 'Top speed')?.value).toMatch(/^\d+\.\d kn$/)
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

describe('an ordnance card (Hangar spec §5)', () => {
  it('an ordnance card: weight, filler or warhead, blast radius and damage as gameplay values, and who carries it', () => {
    const catalog = buildCatalog(nodeHangarContent())
    const labels = (id: string) => figuresFor(catalog.find((e) => e.library.id === id)!).map((f) => f.label)
    expect(labels('an-m65')).toEqual(['Weight', 'Explosive filler', 'Blast radius', 'Damage', 'Carried by'])
    expect(labels('hvar')).toEqual(['Weight', 'Warhead', 'Blast radius', 'Damage', 'Carried by'])
    const blast = figuresFor(catalog.find((e) => e.library.id === 'hvar')!).find((f) => f.label === 'Blast radius')!
    expect(blast.note).toBe('gameplay value, not a historical figure')
  })
})

describe('units (CLAUDE.md: imperial in anything user-facing)', () => {
  it('no card shows a metric unit', () => {
    const metric = /\b(km\/h|m\/s|kg|km)\b|\d\s?m\b/
    for (const e of catalog) for (const f of figuresFor(e)) expect(`${f.label}: ${f.value}`, e.library.id).not.toMatch(metric)
  })
})

describe('the target-type mirror of src/sim/weapons/combat.ts', () => {
  it('ships: every role scores', () => {
    expect(['carrier', 'cruiser', 'battleship', 'escort', 'merchant'].map((r) => shipTargetType(r as never)))
      .toEqual(['carrier', 'cruiser', 'battleship', 'destroyer', 'transport'])
  })
  it("structures: 'aaa' scores as AAA, every other kind as Building", () => {
    expect(['hangar', 'tower', 'aaa'].map((k) => structureTargetType(k as never))).toEqual(['building', 'building', 'aaa'])
  })
})
