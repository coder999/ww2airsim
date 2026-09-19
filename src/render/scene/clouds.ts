import { BackSide, Data3DTexture, LinearFilter, Mesh, RedFormat, RepeatWrapping, SphereGeometry, UnsignedByteType, Vector2, Vector3, Vector4, type Object3D } from 'three'
import { MeshBasicNodeMaterial, type Node } from 'three/webgpu'
import {
  Break, Fn, If, Loop, cameraFar, cameraNear, clamp, color, exp, float, fract, int, length, max, min, mix, normalize,
  positionView, positionWorld, screenCoordinate, smoothstep, texture3D, uniform, uniformArray, vec3, viewportLinearDepth,
} from 'three/tsl'
import { MAX_CLOUD_LAYERS, type CloudLayer } from '../../sim/scenario.js'
import type { Vec3 } from '../../sim/math/vec3.js'
import type { SkyNoise } from '../sky/load.js'
import { DETAIL_SIZE, SHAPE_SIZE } from '../sky/noise.js'
import { FOG_DISTANCE_M, fogWeightNode, horizonSinkNode } from '../horizon.js'
import { SKY_HAZE, SKY_RADIUS_M, SKY_ZENITH } from './sky.js'
import { SUN_DIRECTION } from './lighting.js'

/**
 * Volumetric cloud layers (design: docs/superpowers/specs/2026-09-19-clouds-design.md §4).
 *
 * One dome, drawn after everything else, whose fragment marches the view ray
 * through each layer's slab, occluded per pixel by the scene depth. The world
 * is camera-relative, so the eye is the origin and the dome vertex direction
 * is the ray; `eyeWorld` (a uniform) restores true world coordinates for the
 * noise so clouds stay put as the airplane flies through them.
 */
export const CLOUD_TIERS = {
  high: { cumulusSteps: 48, lightSteps: 4, cirrusSteps: 8 },
  medium: { cumulusSteps: 32, lightSteps: 3, cirrusSteps: 6 },
  low: { cumulusSteps: 20, lightSteps: 2, cirrusSteps: 4 },
} as const
export type CloudTierName = keyof typeof CLOUD_TIERS

/** DEV-only `?cloudTier=off|high|medium|low`, for measuring one scene with and without. */
export const CLOUD_TIER_PARAM = 'cloudTier'
export function cloudTierFromQuery(search: string): CloudTierName | 'off' | undefined {
  const raw = new URLSearchParams(search).get(CLOUD_TIER_PARAM)
  if (raw === null) return undefined
  if (raw === 'off' || raw in CLOUD_TIERS) return raw as CloudTierName | 'off'
  throw new Error(`${CLOUD_TIER_PARAM}: ${JSON.stringify(raw)} is not a cloud tier`)
}

/** Where the noise has drifted to: the ground wind times simulated seconds. */
export function cloudDriftM(wind: Vec3 | null, seconds: number): { x: number; z: number } {
  return wind === null ? { x: 0, z: 0 } : { x: wind.x * seconds, z: wind.z * seconds }
}

/** Metres per repeat of the shape volume and of the detail volume. Gameplay
 *  estimates (design §9): a 128-texel tile over 6 km is 47 m per texel. */
const SHAPE_TILE_M = 6000
const DETAIL_TILE_M = 400
/** Extinction per metre at full density; ~250 m to opaque for cumulus. */
const CUMULUS_SIGMA = 0.012
const CIRRUS_SIGMA = 0.0015
const KIND_CUMULUS = 0
const KIND_CIRRUS = 1

export type CloudsHandle = {
  readonly object: Object3D
  setTier(name: CloudTierName): void
  update(eyeWorld: Vec3, driftSeconds: number, wind: Vec3 | null): void
  dispose(): void
}

function volume(data: Uint8Array, size: number): Data3DTexture {
  const t = new Data3DTexture(data, size, size, size)
  t.format = RedFormat
  t.type = UnsignedByteType
  t.wrapS = t.wrapT = t.wrapR = RepeatWrapping
  t.minFilter = t.magFilter = LinearFilter
  t.unpackAlignment = 1
  t.needsUpdate = true
  return t
}

export function createClouds(layers: readonly CloudLayer[], noise: SkyNoise): CloudsHandle {
  const sorted = [...layers].sort((a, b) => a.baseM - b.baseM)
  const shape = volume(noise.shape, SHAPE_SIZE)
  const detail = volume(noise.detail, DETAIL_SIZE)

  // Uniforms. Layers as [base, thickness, coverage, kind], padded to MAX.
  const layerData = uniformArray(
    Array.from({ length: MAX_CLOUD_LAYERS }, (_, i) => {
      const l = sorted[i]
      return l ? new Vector4(l.baseM, l.thicknessM, l.coverage, l.kind === 'cirrus' ? KIND_CIRRUS : KIND_CUMULUS) : new Vector4(0, 0, 0, 0)
    }),
    'vec4',
  )
  const layerCount = uniform(sorted.length, 'int')
  const eyeWorld = uniform(new Vector3())
  const drift = uniform(new Vector2())
  const cumulusSteps = uniform(CLOUD_TIERS.high.cumulusSteps, 'int')
  const cirrusSteps = uniform(CLOUD_TIERS.high.cirrusSteps, 'int')
  const lightSteps = uniform(CLOUD_TIERS.high.lightSteps, 'int')

  const sun = normalize(vec3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z))
  const sunColor = color(0xfff2e0)
  const ambientTop = color(SKY_ZENITH).mul(0.9)
  const ambientBottom = color(SKY_HAZE).mul(0.55)

  /** Density in [0, 1] at a world point for one layer; 0 outside the slab. */
  const density = Fn(([p, base, thickness, coverage, kind]: [Node<'vec3'>, Node<'float'>, Node<'float'>, Node<'float'>, Node<'float'>]) => {
    const h = p.y.sub(base).div(thickness)
    const inside = h.greaterThan(0).and(h.lessThan(1))
    const d = float(0).toVar()
    If(inside, () => {
      const drifted = vec3(p.x.add(drift.x), p.y, p.z.add(drift.y))
      const s = texture3D(shape, drifted.div(SHAPE_TILE_M)).r
      const isCirrus = kind.greaterThan(0.5).toFloat()
      // Height gradient: cumulus flat-bottomed and rounded on top; cirrus a thin band.
      const gradient = mix(
        smoothstep(0, 0.1, h).mul(smoothstep(1, 0.55, h)),
        smoothstep(0, 0.3, h).mul(smoothstep(1, 0.7, h)),
        isCirrus,
      )
      // Coverage thresholds the shape: what survives above 1 - coverage is cloud.
      const body = clamp(s.sub(float(1).sub(coverage)).div(max(coverage, 0.001)), 0, 1).mul(gradient)
      // Edge erosion by the detail volume, strongest near the base and the edge (Schneider 2015).
      const e = texture3D(detail, drifted.div(DETAIL_TILE_M)).r
      const erode = e.mul(float(1).sub(h)).mul(0.3)
      const eroded = clamp(body.sub(erode).div(max(float(1).sub(erode), 0.001)), 0, 1)
      d.assign(mix(eroded, body.mul(0.6), isCirrus))
    })
    return d
  })

  const material = new MeshBasicNodeMaterial({ side: BackSide, transparent: true, depthTest: false, depthWrite: false })
  const march = Fn(() => {
    const dir = normalize(positionWorld)
    // Scene depth as a ray length: orthographic linear depth is view-space Z,
    // and the dome fragment's own view position gives the ray's angle to it.
    const viewZ = cameraNear.add(viewportLinearDepth.mul(cameraFar.sub(cameraNear)))
    const cosView = positionView.z.negate().div(length(positionView))
    const sceneT = min(viewZ.div(max(cosView, 0.001)), float(FOG_DISTANCE_M))
    // Per-pixel start dither: interleaved gradient noise, hides step banding.
    const dither = fract(float(52.9829189).mul(fract(screenCoordinate.x.mul(0.06711056).add(screenCoordinate.y.mul(0.00583715)))))

    const transmittance = float(1).toVar()
    const scattered = vec3(0, 0, 0).toVar()
    const firstHitT = float(FOG_DISTANCE_M).toVar()
    const horizontal = length(dir.xz)

    Loop({ start: int(0), end: layerCount, type: 'int', condition: '<' }, ({ i }) => {
      // `uniformArray(..., 'vec4')` is typed `UniformArrayNode<string>` in
      // @types/three 0.186, so the element needs telling it is a vec4.
      const layer = layerData.element(i) as unknown as Node<'vec4'>
      const base = layer.x
      const thickness = layer.y
      const coverage = layer.z
      const kind = layer.w
      const top = base.add(thickness)
      // The Earth sinks the slab with distance (horizon.ts); widen the flat
      // slab by the sink at the ray's far bound so the march still covers it.
      const sinkFar = horizonSinkNode(sceneT.mul(horizontal))
      const y0 = eyeWorld.y
      const dy = dir.y
      const tA = base.sub(sinkFar).sub(y0).div(dy)
      const tB = top.sub(y0).div(dy)
      const tEnter = max(min(tA, tB), 0).toVar()
      const tExit = min(max(tA, tB), sceneT).toVar()
      If(dy.abs().lessThan(1e-4), () => {
        // Level ray: inside the slab or not at all.
        const within = y0.greaterThan(base.sub(sinkFar)).and(y0.lessThan(top))
        tEnter.assign(0)
        tExit.assign(within.select(sceneT, float(0)))
      })
      If(tExit.greaterThan(tEnter).and(transmittance.greaterThan(0.01)).and(coverage.greaterThan(0)), () => {
        const isCirrus = kind.greaterThan(0.5)
        const steps = isCirrus.select(cirrusSteps, cumulusSteps)
        const sigma = isCirrus.select(float(CIRRUS_SIGMA), float(CUMULUS_SIGMA))
        const span = tExit.sub(tEnter)
        const ds = max(span.div(steps.toFloat()), thickness.div(steps.toFloat()))
        const t = tEnter.add(ds.mul(dither)).toVar()
        Loop({ start: int(0), end: steps, type: 'int', condition: '<' }, () => {
          If(t.greaterThan(tExit).or(transmittance.lessThan(0.01)), () => {
            Break()
          })
          const p = eyeWorld.add(dir.mul(t))
          // Curvature: altitude above the sunk surface rises with distance.
          const pc = vec3(p.x, p.y.add(horizonSinkNode(t.mul(horizontal))), p.z)
          const dens = density(pc, base, thickness, coverage, kind)
          If(dens.greaterThan(0.001), () => {
            firstHitT.assign(min(firstHitT, t))
            // Light march toward the sun through this layer.
            const lightDs = thickness.div(lightSteps.toFloat()).mul(0.5)
            const shadow = float(0).toVar()
            Loop({ start: int(0), end: lightSteps, type: 'int', condition: '<' }, ({ i: j }) => {
              const lp = pc.add(sun.mul(lightDs.mul(j.toFloat().add(1))))
              shadow.addAssign(density(lp, base, thickness, coverage, kind).mul(lightDs))
            })
            const light = exp(shadow.mul(sigma).negate())
            const powder = float(1).sub(exp(dens.mul(sigma).mul(ds).mul(-2)))
            const h = clamp(pc.y.sub(base).div(thickness), 0, 1)
            const ambient = mix(ambientBottom, ambientTop, h)
            const lit = sunColor.mul(light).mul(mix(float(1), powder, 0.5)).mul(1.2).add(ambient)
            const stepT = exp(dens.mul(sigma).mul(ds).negate())
            scattered.addAssign(lit.mul(transmittance.mul(float(1).sub(stepT))))
            transmittance.mulAssign(stepT)
          })
          t.addAssign(ds)
        })
      })
    })
    const alpha = float(1).sub(transmittance)
    // Aerial perspective on the cloud, by the distance to its first sample.
    const fog = fogWeightNode(firstHitT)
    const rgb = mix(scattered.div(max(alpha, 0.0001)), color(SKY_HAZE), fog)
    return { rgb, alpha }
  })()
  material.colorNode = march.rgb
  material.opacityNode = march.alpha

  const mesh = new Mesh(new SphereGeometry(SKY_RADIUS_M * 0.9, 32, 16), material)
  mesh.renderOrder = 10
  mesh.frustumCulled = false
  mesh.visible = sorted.length > 0

  return {
    object: mesh,
    setTier(name: CloudTierName): void {
      const t = CLOUD_TIERS[name]
      cumulusSteps.value = t.cumulusSteps
      cirrusSteps.value = t.cirrusSteps
      lightSteps.value = t.lightSteps
    },
    update(eye: Vec3, driftSeconds: number, wind: Vec3 | null): void {
      // Centered on the eye: with the scene at -eye the dome's center is the camera.
      mesh.position.set(eye.x, eye.y, eye.z)
      eyeWorld.value.set(eye.x, eye.y, eye.z)
      const d = cloudDriftM(wind, driftSeconds)
      drift.value.set(d.x, d.z)
    },
    dispose(): void {
      shape.dispose()
      detail.dispose()
      mesh.geometry.dispose()
      material.dispose()
    },
  }
}
