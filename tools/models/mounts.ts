// tools/models/mounts.ts
/**
 * `npm run models:mounts`: where every rack and rail of a stores-carrying aircraft spec hangs on
 * the wing of the model it DRAWS (O1, ordnance spec §2.3; sortie forms A4 gave the Hellcat its
 * own R3 model). Prints the offsets to write into content/aircraft/<spec>.json;
 * tests/tools/models/wildcatMounts.test.ts fails while content disagrees. Lateral stations (z)
 * are content's own and are not moved.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { modelIO } from './document.js'
import { fitMount, sceneTriangles, wingSection, type MountFit, type WingSection } from './wingSection.js'
import type { MeshData } from './generated/mesh.js'
import { anM65Mesh } from './generated/an-m65.js'
import { hvarMesh } from './generated/hvar.js'
import { type98Mesh } from './generated/type98-no25.js'
import { wildcatToSimMatrix } from '../../src/render/scene/wildcatFrame.js'
import { loadAircraftSpec } from '../content/load.js'
import type { Stores } from '../../src/sim/flight/schema.js'

/** The drawn Wildcat, repo-relative. Its own constant because src/render/content.ts (which names
 *  it WILDCAT_MODEL_PATH) reads import.meta.env at load and cannot run under tsx;
 *  tests/tools/models/wildcatMounts.test.ts asserts the two agree. */
export const WILDCAT_GLB_PATH = 'content/aircraft/wildcat.glb'

/** ESTIMATE: a bomb's lug midpoint (its CG) at 40% chord, near the main spar. */
export const BOMB_CHORD_FRACTION = 0.4
/** ESTIMATE: a rocket's lug midpoint at 50% chord; its nose runs ahead of the leading edge, as on the real launchers. */
export const ROCKET_CHORD_FRACTION = 0.5
/** The least gap between any store vertex and the lower skin. There is no rack or launcher geometry (O1). */
export const MIN_CLEARANCE_M = 0.02
/** Wing forward of this, tail surfaces aft (measured 2026-09-26: trailing edge >= 0.07 m, tailplane <= -4.1 m). */
export const WING_MIN_X_M = -2

export const STORE_MESHES: Readonly<Record<string, () => MeshData>> = { 'an-m65': anM65Mesh, hvar: hvarMesh, 'type98-no25': type98Mesh }

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const

export function wildcatSectionAt(): Promise<(z: number) => WingSection> {
  return sectionAtFor('wildcat')
}

/** Wing sections of the model a spec draws: the Wildcat through its frame correction, any other
 *  (R3) model in its own glb frame, which is already the sim frame. Rejects an unknown model by name. */
export async function sectionAtFor(model: string, minX: number = WING_MIN_X_M): Promise<(z: number) => WingSection> {
  const path = model === 'wildcat' ? WILDCAT_GLB_PATH : `content/aircraft/${model}.glb`
  let bytes: Uint8Array
  try { bytes = new Uint8Array(readFileSync(path)) } catch { throw new Error(`mounts: no model glb for "${model}" at ${path}`) }
  const doc = await modelIO().readBinary(bytes)
  const tris = sceneTriangles(doc, model === 'wildcat' ? wildcatToSimMatrix() : [...IDENTITY])
  const cache = new Map<number, WingSection>()
  return (z) => {
    const k = Math.round(z * 1000) / 1000
    let s = cache.get(k)
    if (s === undefined) { s = wingSection(tris, k, minX); cache.set(k, s) }
    return s
  }
}

export function fitStores(sectionAt: (z: number) => WingSection, stores: Pick<Stores, 'racks' | 'rails'>, pitchRad: number = 0): { racks: MountFit[]; rails: MountFit[] } {
  const mesh = (id: string): MeshData => {
    const make = STORE_MESHES[id]
    if (!make) throw new Error(`mounts: no generated mesh for store "${id}" (have ${Object.keys(STORE_MESHES).join(', ')})`)
    return make()
  }
  const fit = (m: { offset: readonly [number, number, number]; store: string }, f: number): MountFit =>
    fitMount(sectionAt, m.offset[2], f, pitchRad, mesh(m.store), MIN_CLEARANCE_M)
  return { racks: stores.racks.map((m) => fit(m, BOMB_CHORD_FRACTION)), rails: stores.rails.map((m) => fit(m, ROCKET_CHORD_FRACTION)) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const id of ['f6f-hellcat', 'f4f-wildcat', 'f4u-corsair', 'a6m2-zero', 'p-38-lightning', 'ki-43-oscar', 'ki-84-frank']) {
    const spec = loadAircraftSpec(id)
    if (!spec.stores) continue
    const r = fitStores(await sectionAtFor(spec.view.model), spec.stores)
    console.log(`${id} (drawn as ${spec.view.model})`)
    spec.stores.racks.forEach((m, i) => console.log(`  ${m.id}: ${JSON.stringify(r.racks[i]!.offset)}  drop ${r.racks[i]!.dropM} m`))
    spec.stores.rails.forEach((m, i) => console.log(`  ${m.id}: ${JSON.stringify(r.rails[i]!.offset)}  drop ${r.rails[i]!.dropM} m`))
  }
}

