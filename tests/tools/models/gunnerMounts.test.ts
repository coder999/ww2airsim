// tests/tools/models/gunnerMounts.test.ts
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { AIRFRAME_RIGS } from '../../../src/render/scene/airframeRigs.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { modelIO } from '../../../tools/models/document.js'

/**
 * The seam between the sim's gunners and the drawn turrets (E3, 2026-10-10). The sim may not import the
 * renderer, so each bomber's `combat.gunners` (content) repeats what the rig and the GLB already say:
 * which turrets there are, their arcs (`AIRFRAME_RIGS.turretArcs`), where each pivots and where its guns
 * point at rest (the GLB's `Turret<N>` translation and `Turret<N>Guns` trunnion). This holds the copy to
 * the original, so a turret that is moved, re-arced or added in the model fails here, not in flight.
 */
const specs = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => loadAircraftSpec(f.slice(0, -5)))
const turreted = Object.entries(AIRFRAME_RIGS).filter(([, r]) => Object.keys(r.turretArcs ?? {}).length > 0).map(([id]) => id).sort()

describe('gunners match the drawn turrets', () => {
  it('every airframe with turret arcs has gunners, and only those (pinned)', () => {
    expect(turreted).toEqual(['b-17-flying-fortress', 'b-29-superfortress', 'b5n2-kate', 'g4m-betty', 'ki-21-sally', 'tbm-3-avenger'])
    expect(specs.filter((s) => (s.combat?.gunners ?? []).length > 0).map((s) => s.id).sort()).toEqual(turreted)
  })

  it.each(turreted)('%s: each gunner is its turret: arc, pivot and rest heading', async (id) => {
    const arcs = AIRFRAME_RIGS[id]!.turretArcs!
    const gunners = specs.find((s) => s.id === id)!.combat!.gunners!
    expect(gunners.map((g) => g.mount).sort()).toEqual(Object.keys(arcs).sort())
    const doc = await modelIO().read(`content/aircraft/${id}.glb`)
    const node = (name: string) => doc.getRoot().listNodes().find((n) => n.getName() === name)!
    for (const g of gunners) {
      const arc = arcs[g.mount]!
      expect(g.traverseDeg, g.mount).toBe(arc.traverseDeg)
      expect(g.elevationDeg, g.mount).toEqual(arc.elevationDeg)
      const p = node(g.mount).getWorldTranslation()
      for (let k = 0; k < 3; k++) expect(Math.abs(g.position[k]! - p[k]!), `${g.mount} position[${k}]`).toBeLessThan(0.02)
      // The rest heading is up x trunnion (turretAim in pivotedAirframe.ts): (gz, 0, -gx).
      const axis = node(`${g.mount}Guns`).getExtras()['pivotAxis'] as number[]
      const heading = (Math.atan2(-axis[0]!, axis[2]!) * 180) / Math.PI
      const off = Math.abs(((heading - g.restHeadingDeg + 540) % 360) - 180)
      expect(off, `${g.mount} rest heading`).toBeLessThan(1)
    }
  })
})
