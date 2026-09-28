// tests/tools/models/skin/fixture.ts
/**
 * A 64 px skin in two patches, built without Blender (DP0 Tasks 5-7):
 *   patch 0, tag "wing": a 1.6 x 1.6 m quad at y = 0 facing +y (x = u, z = v), role ijaGreen, rect [8, 8, 32, 32]
 *   patch 1, tag "wing": a 0.6 x 0.6 m quad at y = -0.1 facing -y, role underside, rect [48, 8, 12, 12]
 *   patch 2, tag "fuselage": a 0.3 x 0.3 m quad at x = 3 facing +x, role ijaGreen, rect [48, 28, 6, 6]
 * metersPerPx 0.05, padding 4. One panel line on patch 0 at v = 0.8 m.
 */
import { Document } from '@gltf-transform/core'
import { parseSidecar, type Sidecar } from '../../../../tools/models/skin/sidecar.js'
import { scanFromChannels, type Scan } from '../../../../tools/models/skin/scans.js'

export const FIXTURE_ATLAS = 64
export const FIXTURE_MPP = 0.05

export function fixtureSidecar(overrides: Record<string, unknown> = {}): Sidecar {
  return parseSidecar(JSON.stringify({
    version: 1, model: 'fx', atlasPx: 512, paddingPx: 4, metersPerPx: FIXTURE_MPP,
    roles: { ijaGreen: [0x4b / 255, 0x55 / 255, 0x35 / 255], underside: [0xa3 / 255, 0xa8 / 255, 0x9a / 255] },
    patches: [
      { id: 0, tag: 'wing', rect: [8, 8, 32, 32], originM: [0, 0] },
      { id: 1, tag: 'wing', rect: [48, 8, 12, 12], originM: [0, 0] },
      { id: 2, tag: 'fuselage', rect: [48, 28, 6, 6], originM: [0, 0] },
    ],
    lines: [{ patch: 0, axis: 'v', atM: 0.8, fromM: 0, toM: 1.6, kind: 'panel' }],
    markings: [],
    ...overrides,
  }))
}

type Quad = { role: string; patch: number; rect: [number, number]; corner: (u: number, v: number) => [number, number, number]; n: [number, number, number]; sizeM: number }
const QUADS: Quad[] = [
  { role: 'ijaGreen', patch: 0, rect: [8, 8], corner: (u, v) => [u, 0, v], n: [0, 1, 0], sizeM: 1.6 },
  { role: 'underside', patch: 1, rect: [48, 8], corner: (u, v) => [u, -0.1, v], n: [0, -1, 0], sizeM: 0.6 },
  { role: 'ijaGreen', patch: 2, rect: [48, 28], corner: (u, v) => [3, v, u], n: [1, 0, 0], sizeM: 0.3 },
]

/** The quads as the kit would export them, UVs in an `atlasPx` atlas. The unit tests use 64 (fast);
 *  the build test (Task 7) uses 512, the size the fixture sidecar declares. */
export function fixtureDoc(atlasPx: number = FIXTURE_ATLAS): Document {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const scene = doc.createScene('s')
  const mats = new Map<string, ReturnType<Document['createMaterial']>>()
  for (const q of QUADS) {
    const mat = mats.get(q.role) ?? doc.createMaterial(q.role)
    mats.set(q.role, mat)
    const pos: number[] = [], nrm: number[] = [], uv: number[] = []
    for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
      const u = a * q.sizeM, v = b * q.sizeM
      pos.push(...q.corner(u, v)); nrm.push(...q.n)
      uv.push((q.rect[0] + u / FIXTURE_MPP) / atlasPx, (q.rect[1] + v / FIXTURE_MPP) / atlasPx)
    }
    const acc = (type: 'VEC2' | 'VEC3' | 'SCALAR', a: Float32Array | Uint16Array) => doc.createAccessor().setType(type).setArray(a).setBuffer(buffer)
    const prim = doc.createPrimitive().setMaterial(mat)
      .setAttribute('POSITION', acc('VEC3', new Float32Array(pos)))
      .setAttribute('NORMAL', acc('VEC3', new Float32Array(nrm)))
      .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(uv)))
      .setIndices(acc('SCALAR', new Uint16Array([0, 1, 2, 0, 2, 3])))
    scene.addChild(doc.createNode(`fx_${q.patch}`).setMesh(doc.createMesh(`fx_${q.patch}`).addPrimitive(prim)))
  }
  return doc
}

export function flatScan(): Scan {
  const n = 4
  const nrm = new Float32Array(3 * n * n)
  for (let i = 0; i < n * n; i++) nrm[3 * i + 2] = 1
  return scanFromChannels(n, 1, new Float32Array(n * n).fill(0.5), new Float32Array(n * n).fill(0.5), nrm)
}
