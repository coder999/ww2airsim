import { longForestEnabled } from '../scene/forestDistance.js'
import { forestCanopyMode } from '../scene/forestCanopy.js'
import { sunDirectionNode } from '../scene/lighting.js'
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RedFormat, RepeatWrapping, UnsignedByteType } from 'three'
import { cameraWorldMatrix, float, max, mix, normalize, positionView, smoothstep, texture, uniform, vec2, vec4 } from 'three/tsl'
import type { Node } from 'three/webgpu'
import { inflateIfGzipped } from '../gunzip.js'
import { CANOPY_HEIGHT_MAX_M, CANOPY_HEIGHT_MIN_M, CANOPY_TEXELS, CANOPY_TILE_M } from './canopyRelief.js'

/** Full-range DEV comparison; production uses only the accepted distant blend. */
export function canopyEnabled(): boolean {
  return !!import.meta.env?.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('canopy') === 'on'
}

let material: DataTexture | null = null
const ready = uniform(0)
let error: string | null = null
export const canopyStatus = () => ({ enabled: canopyEnabled() || longForestEnabled(), ready: ready.value === 1, error })

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

/** The relief channel (forest canopy rework, 2026-10-16): crown height as one R8 mipmapped texture, loaded only under
 *  `?forestCanopy=relief`. Until it arrives, or if it is invalid, the canopy is the flat material (`reliefReady` stays 0). */
const reliefReady = uniform(0)
let reliefError: string | null = null
let reliefTex: DataTexture | null = null
export const forestCanopyStatus = () => ({ mode: forestCanopyMode(), reliefReady: reliefReady.value === 1, reliefError })

function reliefTexture(): DataTexture {
  if (reliefTex) return reliefTex
  const bytes = new Uint8Array(CANOPY_TEXELS * CANOPY_TEXELS)
  const tex = new DataTexture(bytes, CANOPY_TEXELS, CANOPY_TEXELS, RedFormat, UnsignedByteType)
  tex.name = 'canopy-crown-height'
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.minFilter = LinearMipmapLinearFilter
  tex.magFilter = LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  reliefTex = tex
  void fetch(`${import.meta.env.BASE_URL}content/canopy/height.bin.gz`).then(async r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const data = await inflateIfGzipped(await r.arrayBuffer())
    if (data.length !== bytes.length) throw new Error('Invalid canopy height size')
    bytes.set(data)
    tex.needsUpdate = true
    reliefReady.value = 1
  }).catch((e: unknown) => { reliefError = String(e); console.warn(`Canopy relief: ${reliefError}`) })
  return tex
}

/** Metres of crown height at or above which a crown counts as raised; the parallax pivots here. */
const PARALLAX_PIVOT_M = 14
/** Where the sun-direction crown shadow looks for an occluder, metres, and how soft its edge is. */
const SHADOW_REACH_M = 7
const SHADOW_SOFT_M = 2.5
const RELIEF_TONE_PIVOT = 0.42
const RELIEF_TONE_GAIN = 1.5

export type CanopyNodes = { tone: Node<'float'>; slope: Node<'vec2'>; sky: Node<'float'>; ready: Node<'float'>
  /** 1 = lit, below 1 = in a crown's shadow; multiplies the direct sun only. Always 1 on the flat material. */
  shadow: Node<'float'> }

export function canopyNodes(xz: Node<'vec2'>, warp: Node<'vec2'>): CanopyNodes {
  const uv0 = xz.add(warp.sub(0.5).mul(8)).div(CANOPY_TILE_M)
  if (forestCanopyMode() !== 'relief') {
    const sample = texture(canopyTexture(), uv0)
    return { tone: sample.b, slope: sample.rg.sub(0.5).mul(3.2), sky: mix(float(1), sample.a, ready), ready, shadow: float(1) }
  }
  // Relief. Everything here is a plain texture read plus arithmetic: no If or Loop, so no shared node is first built inside
  // control flow (the D3D12 rule, docs/night.md). The detail fades out with eye distance: past a few miles a texel is
  // smaller than a pixel and the mipmaps already carry the average.
  const heights = reliefTexture()
  const metres = (uv: Node<'vec2'>) => float(CANOPY_HEIGHT_MIN_M).add(texture(heights, uv).r.mul(CANOPY_HEIGHT_MAX_M - CANOPY_HEIGHT_MIN_M))
  const eye = normalize(cameraWorldMatrix.mul(vec4(positionView, 0)).xyz) // eye to fragment, world axes
  const detail = float(1).sub(smoothstep(3000, 9000, positionView.length())).mul(reliefReady)
  // One-step parallax: the crown surface the eye sees at this fragment is displaced toward the eye by its height
  // over the floor, along the view ray's ground track (clamped so a grazing ray moves at most four times the height).
  const rise = max(eye.y.negate(), 0.25)
  const shift = eye.xz.div(rise).mul(metres(uv0).sub(PARALLAX_PIVOT_M)).mul(detail)
  const uv = uv0.sub(shift.div(CANOPY_TILE_M))
  const sample = texture(canopyTexture(), uv)
  // Crown shadow: an occluder SHADOW_REACH_M toward the sun that stands higher than the sun ray over it shades this point.
  const sun = normalize(sunDirectionNode)
  const along = max(vec2(sun.x, sun.z).length(), 1e-3)
  const toSun = vec2(sun.x, sun.z).div(along)
  const ray = float(SHADOW_REACH_M).mul(sun.y.div(along))
  const occluder = metres(uv.add(toSun.mul(SHADOW_REACH_M / CANOPY_TILE_M))).sub(metres(uv)).sub(ray)
  const shadow = float(1).sub(smoothstep(0, SHADOW_SOFT_M, occluder).mul(0.8).mul(detail))
  // Crown contrast: the baked tone sits in a narrow middle band, which a mile out reads as a smooth meadow. Stretch it about its
  // mean (relief only; the flat material is unchanged).
  const tone = sample.b.sub(RELIEF_TONE_PIVOT).mul(RELIEF_TONE_GAIN).add(RELIEF_TONE_PIVOT).clamp(0, 1)
  return { tone, slope: sample.rg.sub(0.5).mul(3.2), sky: mix(float(1), sample.a, ready), ready, shadow }
}

/** Crown relief survives the mesh transition; mipmaps remove subpixel detail. */
export function canopyNormalFade(distance: Node<'float'>): Node<'float'> {
  return float(1).sub(smoothstep(5000, 14000, distance))
}
