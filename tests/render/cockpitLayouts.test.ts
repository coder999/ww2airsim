import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { COCKPIT_ENROLLMENT, COCKPIT_LAYOUTS, cockpitFor } from '../../src/render/scene/cockpitLayouts.js'
import { createPanel } from '../../src/render/scene/panel.js'
import { gaugesFor } from '../../src/render/gauges.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const ids = readdirSync('content/aircraft')
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.slice(0, -5))
  .sort()

describe('C3 cockpit catalog', () => {
  it('has exactly four layouts and explicitly enrolls every flyable aircraft', () => {
    expect(Object.keys(COCKPIT_LAYOUTS).sort()).toEqual([
      'american-bomber', 'american-fighter', 'japanese-bomber', 'japanese-fighter',
    ])
    expect(Object.keys(COCKPIT_ENROLLMENT).sort()).toEqual(ids)
    expect(new Set(Object.values(COCKPIT_LAYOUTS).map((layout) => layout.panelProfile)).size).toBe(4)
    expect(new Set(Object.values(COCKPIT_LAYOUTS).map((layout) => layout.clusterPattern)).size).toBe(4)
    for (const layout of Object.values(COCKPIT_LAYOUTS)) {
      expect(layout.auxiliaryScale).toBeGreaterThanOrEqual(0.8)
    }
  })

  it('derives conditional equipment from the actual aircraft spec', () => {
    const val = cockpitFor(loadAircraftSpec('d3a-val'))
    expect(val.gear).toBe(false)
    expect(val.hook).toBe(true)
    expect(val.bay).toBe(false)
    expect(val.sight).toBe(true)

    const b17 = cockpitFor(loadAircraftSpec('b-17-flying-fortress'))
    expect(b17.gear).toBe(true)
    expect(b17.hook).toBe(false)
    expect(b17.bay).toBe(true)
    expect(b17.sight).toBe(false)
    expect(b17.rpmNeedles).toBe(4)
  })

  it('uses metric Japanese faces without changing the imperial profile', () => {
    const metric = new Map(gaugesFor('metric-japanese').map((g) => [g.id, g]))
    const imperial = new Map(gaugesFor('imperial').map((g) => [g.id, g]))
    expect(metric.get('airspeed')).toMatchObject({ label: '速度', unit: 'km/h', fromSI: 3.6 })
    expect(metric.get('altimeter')).toMatchObject({ label: '高度', unit: 'm', fromSI: 1 })
    expect(metric.get('fuel')).toMatchObject({ label: '燃料', unit: 'L' })
    expect(metric.get('rpm')).toMatchObject({ label: '回転', unit: 'rpm' })
    expect(imperial.get('airspeed')).toMatchObject({ label: 'AIRSPEED', unit: 'mph' })
  })

  it('localizes the Japanese throttle and fuel columns, including empty/full', () => {
    const text: string[] = []
    createPanel(loadAircraftSpec('a6m2-zero'), (label) => { text.push(label); return null })
    expect(text).toEqual(expect.arrayContaining(['出力', '燃料', '空', '満']))
    expect(text).toEqual(expect.arrayContaining(['弾薬', '爆弾', '噴進', '魚雷']))
    expect(text).not.toEqual(expect.arrayContaining(['ENGINE', 'FUEL', 'EMPTY', 'FULL', 'AMMO']))
  })

  it('uses readable ENGINE and AMMO labels in the American equipment bank', () => {
    const text: string[] = []
    createPanel(loadAircraftSpec('f6f-hellcat'), (label) => { text.push(label); return null })
    expect(text).toEqual(expect.arrayContaining(['ENGINE', 'AMMO', 'BOMB', 'RKT', 'TORP']))
    expect(text).not.toContain('THR')
  })

  it('shows only the enrolled sight and real status equipment', () => {
    const b17 = createPanel(loadAircraftSpec('b-17-flying-fortress'), () => null)
    expect(b17.reticle.visible).toBe(false)
    expect(b17.lights.gear.visible).toBe(true)
    expect(b17.lights.hook.visible).toBe(false)
    expect(b17.lights.bay.visible).toBe(true)
    expect(b17.rpmNeedles).toHaveLength(4)
    expect(b17.rpmNeedles.map((needle) => needle.parent?.name)).toEqual([
      'rpm-engine:1', 'rpm-engine:2', 'rpm-engine:3', 'rpm-engine:4',
    ])
    expect(new Set(b17.rpmNeedles.map((needle) => needle.parent)).size).toBe(4)
    expect(b17.root.getObjectByName('rpm:multi-engine-plate')).toBeUndefined()
    for (let engine = 1; engine <= 4; engine++) {
      expect(b17.root.getObjectByName(`rpm-engine:${engine}:bezel`)).toBeDefined()
    }
    expect(b17.badge.name).toBe('cockpit:badge:usn')
    expect(b17.root.getObjectByName('cockpit:canopy-bow')).toBeUndefined()

    const val = createPanel(loadAircraftSpec('d3a-val'), () => null)
    expect(val.reticle.visible).toBe(true)
    expect(val.lights.gear.visible).toBe(false)
    expect(val.lights.hook.visible).toBe(true)
    expect(val.lights.bay.visible).toBe(false)
    expect(val.root.getObjectByName('rpm:multi-engine-plate')).toBeUndefined()
    expect(val.badge.name).toBe('cockpit:badge:ijn')
  })
})
