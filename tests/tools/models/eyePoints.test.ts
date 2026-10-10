// Every flyable spec's eye point, against the canopy of the model it draws (2026-09-28). Until
// then the Hellcat's and the Wildcat's eyes sat 2 m forward of their cockpits, over the cowling,
// and the Zero's 0.5 m above its canopy: nothing compared the number with the drawing.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { modelIO } from '../../../tools/models/document.js'
import { worldPositions } from '../../../tools/models/rig.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { wildcatToSimMatrix } from '../../../src/render/scene/wildcatFrame.js'
import { WILDCAT_MODEL_PATH } from '../../../src/render/content.js'

/** Each drawn model's canopy glazing node. The Wildcat's is its sliding hood. */
const CANOPY: Readonly<Record<string, string>> = {
  'f6f-hellcat': 'kabina-FACES',
  wildcat: 'Puerta_cabina_Cabina_MAT_0',
  'a6m2-zero': 'Verriere_Verriere_0',
  'f4u-corsair': 'kabina-FACES',
  // One transparent shell over the whole airframe (alpha 0.15); the eye sits under its top at the flight deck.
  'b-17-flying-fortress': 'Object_51',
  // The G4M's model has a single skinned material and no separate canopy node; g4m_dark is the whole airframe's skin, and the eye sits under the glasshouse crown (top y about 1.65 at x 3.4).
  'g4m-betty': 'g4m_dark',
  // A single-skin airframe like the G4M: b29_dark is the whole skin, and the eye sits under the glazed crown at x 9.0.
  'b-29-superfortress': 'b29_dark',
  // A single-skin airframe again: p38_dark is the whole skin; the canopy crown reads y 1.20 to 1.22 at x 0 to 0.5 (measured 2026-09-29), eye at x 0.6, y 0.95.
  'p-38-lightning': 'p38_dark',
  // The canopy glazing node kabina-FACES (x -1.88 to -0.15, top y 0.99, measured 2026-09-30); the eye sits 0.29 m under its crown.
  'ki-43-oscar': 'kabina-FACES',
  // The Val's canopy is the mesh node Object_20 (material "transparent", x -3.22 to 0.10, top y 1.009, measured 2026-09-30); the eye sits 0.26 m under its crown.
  'd3a-val': 'Object_20',
  // Whole-skin crown: the Ki-84 model is one skin node (ki84_dark) with no separate glazing node.
  'ki-84-frank': 'ki84_dark',
  'tbm-3-avenger': 'tbm3_dark',
  'b5n2-kate': 'b5n2_dark',
  // A single-skin airframe: ki21_dark is the whole skin; the glazed crown reads y 1.25 at x 2.6 to 3.4 (measured 2026-09-30), eye at x 3.0.
  'ki-21-sally': 'ki21_dark',
}
/** A seated pilot's eye sits this far below the canopy's top, metres. */
const [BELOW_TOP_MIN_M, BELOW_TOP_MAX_M] = [0.15, 0.45]

const specs = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => loadAircraftSpec(f.replace(/\.json$/, '')))

async function canopyPoints(model: string): Promise<[number, number, number][]> {
  const path = model === 'wildcat' ? WILDCAT_MODEL_PATH : `content/aircraft/${model}.glb`
  const m = model === 'wildcat' ? wildcatToSimMatrix() : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  const doc = await modelIO().readBinary(new Uint8Array(readFileSync(path)))
  const nodes = doc.getRoot().listNodes().filter((n) => n.getName() === CANOPY[model])
  expect(nodes.length, `${model}: no canopy node ${CANOPY[model]}`).toBeGreaterThan(0)
  return nodes.flatMap((n) => worldPositions(n)).map(([x, y, z]) =>
    [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!])
}

describe('every eye point is inside its drawn canopy', () => {
  it.each(specs.map((s) => [s.id, s] as const))('%s', async (_id, spec) => {
    expect(CANOPY[spec.view.model], `${spec.view.model} has no CANOPY entry`).toBeDefined()
    const pts = await canopyPoints(spec.view.model)
    const [ex, ey, ez] = spec.view.eyePointM
    const range = (i: 0 | 2) => [pts.reduce((a, p) => Math.min(a, p[i]), Infinity), pts.reduce((a, p) => Math.max(a, p[i]), -Infinity)] as const
    const [x0, x1] = range(0)
    const [z0, z1] = range(2)
    const xMsg = `${spec.id}: eye x ${ex} outside the canopy's ${x0.toFixed(2)}..${x1.toFixed(2)}`
    expect(ex, xMsg).toBeGreaterThanOrEqual(x0)
    expect(ex, xMsg).toBeLessThanOrEqual(x1)
    expect(ez).toBeGreaterThanOrEqual(z0)
    expect(ez).toBeLessThanOrEqual(z1)
    // The top of the canopy over the eye: the highest canopy point within 0.2 m fore and aft.
    const top = pts.filter((p) => Math.abs(p[0] - ex) <= 0.2).reduce((a, p) => Math.max(a, p[1]), -Infinity)
    const below = top - ey
    expect(below, `${spec.id}: eye ${below.toFixed(2)} m below the canopy top (${top.toFixed(2)})`).toBeGreaterThanOrEqual(BELOW_TOP_MIN_M)
    expect(below, `${spec.id}: eye ${below.toFixed(2)} m below the canopy top (${top.toFixed(2)})`).toBeLessThanOrEqual(BELOW_TOP_MAX_M)
  })
})
