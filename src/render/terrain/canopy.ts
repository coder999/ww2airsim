import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping } from 'three'
import { float, mix, smoothstep, texture, uniform } from 'three/tsl'
import type { Node } from 'three/webgpu'
import { inflateIfGzipped } from '../gunzip.js'

/** Attended DEV prototype; production remains unchanged until accepted. */
export function canopyEnabled(): boolean {
  return !!import.meta.env?.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('canopy') === 'on'
}

let material: DataTexture | null = null
const ready = uniform(0)
let error: string | null = null
export const canopyStatus = () => ({ enabled: canopyEnabled(), ready: ready.value === 1, error })

function canopyTexture(): DataTexture {
  if (material) return material
  const bytes = new Uint8Array(1024 * 1024 * 4)
  const tex = new DataTexture(bytes, 1024, 1024)
  tex.name = 'canopy-slope-tone-enclosure'
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.minFilter = LinearMipmapLinearFilter
  tex.magFilter = LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  material = tex
  void fetch(`${import.meta.env.BASE_URL}content/canopy/material.bin.gz`).then(async r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const data = await inflateIfGzipped(await r.arrayBuffer())
    if (data.length !== bytes.length) throw new Error('Invalid canopy material size')
    bytes.set(data)
    tex.needsUpdate = true
    ready.value = 1
  }).catch((e: unknown) => { error = String(e); console.warn(`Canopy: ${error}`) })
  return tex
}

export function canopyNodes(xz: Node<'vec2'>, warp: Node<'vec2'>): { tone: Node<'float'>; slope: Node<'vec2'>; sky: Node<'float'>; ready: Node<'float'> } {
  const sample = texture(canopyTexture(), xz.add(warp.sub(0.5).mul(8)).div(512))
  return {
    tone: sample.b,
    slope: sample.rg.sub(0.5).mul(3.2),
    sky: mix(float(1), sample.a, ready),
    ready,
  }
}

/** Crown relief survives the mesh transition; mipmaps remove subpixel detail. */
export function canopyNormalFade(distance: Node<'float'>): Node<'float'> {
  return float(1).sub(smoothstep(5000, 14000, distance))
}
