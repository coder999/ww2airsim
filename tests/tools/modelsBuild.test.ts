import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'

// Upper bound from the actual measured output size, rounded up -- catches a
// future re-run of models:build silently ballooning back toward the 73.9 MB
// raw input (e.g. a flag typo dropping --texture-compress). Raised from
// 3_000_000 (2026-09-24, Task 5 review fix): the original build silently
// applied @gltf-transform/cli's default meshopt geometry/animation
// compression, which shrank the file but left it undecodable at runtime
// (`EXT_meshopt_compression` had no matching decoder wired up anywhere in
// this project -- Three.js's GLTFLoader throws on a required extension it
// can't decode). tools/models/build.ts now passes `--compress false`
// explicitly, which disables that compression and measured 5,573,316 bytes
// (~5.57 MB, after `forceOpaqueMaterials` below trims two bogus alphaMode
// fields) -- texture recompression (webp, 1024px) is still fully applied
// and remains the dominant size reduction from the 73.9 MB raw input.
const MAX_BYTES = 6_300_000

describe('content/aircraft/wildcat.glb', () => {
  it('is committed and under the compressed size budget', () => {
    expect(existsSync('content/aircraft/wildcat.glb')).toBe(true)
    expect(statSync('content/aircraft/wildcat.glb').size).toBeLessThan(MAX_BYTES)
  })

  it('still has the named nodes and baked animation wildcat.ts depends on', () => {
    const buf = readFileSync('content/aircraft/wildcat.glb')
    const jsonLength = buf.readUInt32LE(12)
    const doc = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'))
    const names = new Set((doc.nodes ?? []).map((n: { name?: string }) => n.name ?? ''))
    for (const required of ['Helice', 'GRP_Rueda_Der', 'GRP_Rueda_Izq']) {
      expect(names.has(required)).toBe(true)
    }
    expect(doc.animations).toHaveLength(1)
  })

  it('does not require a glTF extension this project has no decoder for (2026-09-24 regression)', () => {
    // @gltf-transform/cli's `optimize` defaults --compress to "meshopt" when
    // the flag is omitted; Three.js's GLTFLoader throws at load time if a
    // required extension has no matching decoder registered, and this
    // project registers none (confirmed: no MeshoptDecoder/setMeshoptDecoder
    // anywhere in src/tests/tools). tools/models/build.ts must keep passing
    // `--compress false` so this list stays empty.
    const buf = readFileSync('content/aircraft/wildcat.glb')
    const jsonLength = buf.readUInt32LE(12)
    const doc = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'))
    expect(doc.extensionsRequired ?? []).not.toContain('EXT_meshopt_compression')
  })

  it('has no alpha-blended materials (2026-09-24 hull-transparency regression)', () => {
    // The raw Sketchfab download (confirmed by reading it directly, unmodified
    // by this project's build) sets alphaMode: BLEND on Chasis_MAT (the
    // wheel-well/hull cover) and Cabina_MAT (the canopy). Neither material's
    // own base-color texture has any fully- or mostly-transparent pixels --
    // alpha only dips to ~55% over a small fraction of each texture, the
    // signature of a baked AO/dirt mask left in the alpha channel by the
    // artist's tool, not intended transparency. Three.js's GLTFLoader turns
    // BLEND into `transparent: true, depthWrite: false` regardless of the
    // actual opacity values, which produces exactly the class of
    // camera-angle/background-dependent see-through artifact Mark reported
    // 2026-09-24: "part of the hull became transparent" crossing the horizon
    // in flight. tools/models/build.ts must force every material OPAQUE,
    // since this project has no aircraft with an intentionally transparent
    // surface today (hellcat.ts's canopy is the same opaque `dark` material
    // as the rest of that airframe).
    const buf = readFileSync('content/aircraft/wildcat.glb')
    const jsonLength = buf.readUInt32LE(12)
    const doc = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'))
    const blended = (doc.materials ?? []).filter((m: { alphaMode?: string }) => m.alphaMode === 'BLEND')
    expect(blended).toEqual([])
  })
})
