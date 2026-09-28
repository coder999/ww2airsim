// tests/tools/models/_drawnPoints.ts
// The ONE reader of a drawn model's mesh vertices in the sim body frame (W1 ruling B, 2026-09-28),
// so the fit tests (stance.test.ts, and the combat fit) cannot disagree about where the airplane is.
// Every model but the Wildcat is authored in the sim body frame, and is read from its glb as is.
// The Wildcat is read the way loadWildcat draws it parked: its glb graph, the main legs lengthened
// by the runtime's own rig at gear down (wildcatGearStretch, gearStretchM(1)), then
// wildcatCorrection(), whose matrix is wildcatToSimMatrix().
import { readFileSync } from 'node:fs'
import { Group, Matrix4, Mesh, Vector3 } from 'three'
import { modelIO } from '../../../tools/models/document.js'
import { worldPositions } from '../../../tools/models/rig.js'
import { gearStretchM, wildcatCorrection, wildcatGearStretch } from '../../../src/render/scene/wildcat.js'
import { wildcatGlbScene } from '../../render/_wildcatCache.js'

/**
 * @param exclude Skips a mesh node whose own name matches (e.g. the propeller: `Prop` on the
 *   R3 models, `Helice` on the Wildcat), so a combat fit measured against the drawn airframe is
 *   not fooled by a spinning blade sweeping outside the fuselage/wing bounds.
 */
export async function drawnPoints(model: string, exclude?: RegExp): Promise<[number, number, number][]> {
  if (model !== 'wildcat') {
    const doc = await modelIO().readBinary(new Uint8Array(readFileSync(`content/aircraft/${model}.glb`)))
    return doc.getRoot().listNodes().filter((n) => n.getMesh() && !(exclude && exclude.test(n.getName())))
      .flatMap((n) => worldPositions(n).map(([x, y, z]) => [x, y, z] as [number, number, number]))
  }
  const scene = await wildcatGlbScene()
  wildcatGearStretch(scene.getObjectByName('GRP_Rueda_Der')!, scene.getObjectByName('GRP_Rueda_Izq')!)(gearStretchM(1))
  const correction = wildcatCorrection()
  correction.add(scene)
  const body = new Group()
  body.add(correction)
  body.updateMatrixWorld(true)
  const out: [number, number, number][] = []
  const v = new Vector3()
  body.traverse((m) => {
    if (!(m instanceof Mesh)) return
    if (exclude && exclude.test(m.name)) return
    const mat = new Matrix4().copy(m.matrixWorld)
    const a = m.geometry.getAttribute('position')
    for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(mat); out.push([v.x, v.y, v.z]) }
  })
  return out
}
