import { DataArrayTexture, DataTexture, LinearFilter, RedFormat } from 'three'
import { atan, float, floor, fract, int, mix, mod, normalize, smoothstep, texture, uniform } from 'three/tsl'
import type { Node } from 'three/webgpu'
import { inflateIfGzipped } from '../gunzip.js'
import { sunDirectionNode } from '../scene/lighting.js'

export type TerrainLightingMode = 'off' | 'sky' | 'sun' | 'on'
export type TerrainOcclusion = {
  readonly mode: TerrainLightingMode
  readonly ready: boolean
  readonly error: string | null
  readonly bytes: number
  nodes(xz: Node<'vec2'>): { sun: Node<'float'>; sky: Node<'float'> }
}

/** Shelved after Mark's 2026-10-13 review: no perceived gain for its cost.
 * Explicit DEV modes retain the experiment for reproducible comparisons. */
export function terrainLightingMode(search: string): TerrainLightingMode {
  const value = new URLSearchParams(search).get('terrainLighting') ?? 'off'
  if (value === 'off' || value === 'sky' || value === 'sun' || value === 'on') return value
  throw new Error(`terrainLighting: ${JSON.stringify(value)} is not off, sky, sun or on`)
}

export function createTerrainOcclusion(halfExtentM: number): TerrainOcclusion {
  const mode = import.meta.env?.DEV && typeof location !== 'undefined' ? terrainLightingMode(location.search) : 'off'
  const samples = 1025, directions = 16, count = samples * samples
  const ready = uniform(0)
  let error: string | null = null
  // Tiny inert resources on the off path. No network, no shader sampling.
  const horizons = new DataArrayTexture(new Uint8Array(mode === 'off' ? 1 : count * directions), mode === 'off' ? 1 : samples, mode === 'off' ? 1 : samples, mode === 'off' ? 1 : directions)
  const sky = new DataTexture(new Uint8Array(mode === 'off' ? 1 : count).fill(255), mode === 'off' ? 1 : samples, mode === 'off' ? 1 : samples, RedFormat)
  for (const tex of [horizons, sky]) {
    tex.format = RedFormat
    tex.minFilter = tex.magFilter = LinearFilter
    tex.generateMipmaps = false
    tex.unpackAlignment = 1
    tex.needsUpdate = true
  }
  horizons.name = 'terrain-directional-horizons'
  sky.name = 'terrain-sky-visibility'
  if (mode !== 'off') {
    const base = `${import.meta.env.BASE_URL}content/terrain-lighting/`
    const read = async (name: string): Promise<Response> => {
      const r = await fetch(base + name)
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`)
      return r
    }
    void (async () => {
      const h = await (await read('header.json')).json() as { version: number; samples: number; directions: number; halfExtentM: number; encoding: string }
      if (h.version !== 1 || h.samples !== samples || h.directions !== directions || h.halfExtentM !== halfExtentM || h.encoding !== 'uint8-angle-half-pi') {
        throw new Error('Terrain lighting map does not match the world or encoding')
      }
      const [angles, visibility] = await Promise.all(['horizons', 'sky'].map(async name => inflateIfGzipped(await (await read(`${name}.bin.gz`)).arrayBuffer())))
      if (angles!.length !== count * directions || visibility!.length !== count) throw new Error('Terrain lighting map has incorrect byte length')
      ;(horizons.image.data as Uint8Array).set(angles!)
      ;(sky.image.data as Uint8Array).set(visibility!)
      horizons.needsUpdate = sky.needsUpdate = true
      ready.value = 1
    })().catch((e: unknown) => {
      error = e instanceof Error ? e.message : String(e)
      console.warn(`Terrain lighting: ${error}; retaining baseline lighting`)
    })
  }
  return {
    mode,
    get ready() { return ready.value === 1 },
    get error() { return error },
    bytes: mode === 'off' ? 0 : count * (directions + 1),
    nodes(xz) {
      if (mode === 'off') return { sun: float(1), sky: float(1) }
      // Node-centered mapping matches the DEM; row zero is north.
      const uv = xz.add(halfExtentM).div(halfExtentM * 2).mul(samples - 1).add(0.5).div(samples)
      const dir = normalize(sunDirectionNode)
      const azimuth = mod(atan(dir.z, dir.x).div(Math.PI * 2).add(1), 1).mul(directions)
      const lower = floor(azimuth)
      const a = texture(horizons, uv).depth(int(lower)).r
      const b = texture(horizons, uv).depth(int(mod(lower.add(1), directions))).r
      const angle = mix(a, b, fract(azimuth)).mul(Math.PI / 2)
      const elevation = atan(dir.y, dir.xz.length())
      // A reconstruction filter for the finite spatial/azimuth raster, not
      // an assertion that the sun has a three-degree angular diameter.
      const width = 1.5 * Math.PI / 180
      const sun = smoothstep(angle.sub(width), angle.add(width), elevation)
      return {
        sun: mode === 'sky' ? float(1) : mix(1, sun, ready),
        sky: mode === 'sun' ? float(1) : mix(1, texture(sky, uv).r, ready),
      }
    },
  }
}
