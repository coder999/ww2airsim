import {
  HalfFloatType, LinearFilter, RGBAFormat, RenderTarget, Vector2, Vector3,
  type PerspectiveCamera,
} from 'three'
import {
  NodeMaterial, NodeUpdateType, QuadMesh, RendererUtils, TempNode,
  type Node, type NodeBuilder, type NodeFrame, type TextureNode, type WebGPURenderer,
} from 'three/webgpu'
import {
  Break, Fn, If, Loop, abs, bitcast, clamp, dot, exp, float, floor, int, ivec2,
  log2, max, min, mix, mrt, normalize, perspectiveDepthToViewZ, pow, reference, screenCoordinate,
  select, smoothstep, sqrt, struct, texture, texture3D, uint, uniform, vec2, vec3, vec4,
} from 'three/tsl'
import type { Vec3 } from '../../sim/math/vec3.js'
import type { ReprojectionResidual } from './cloudPass.js'
import type { TakramCloudPass } from './takramCloudPass.js'
import type { TakramTslAssets } from './takramTslAssets.js'

type F = Node<'float'>
type I = Node<'int'>
type U = Node<'uint'>
type V2 = Node<'vec2'>
type V3 = Node<'vec3'>
type V4 = Node<'vec4'>

type TimestampBackend = {
  get(value: object): { timestampUID?: string }
  timestampQueryPool?: { render?: { timestamps?: Map<string, number> } }
}

type TimingRenderer = WebGPURenderer & {
  _callDepth: number
  _renderContexts: { get(target: RenderTarget, mrt: unknown, callDepth: number): object }
}

const PI = Math.PI
const FAR_M = 200_000
const LAYER_LOW_M = 750
const LAYER_HIGH_M = 2_200
const PHASES: readonly (readonly [number, number])[] = [[0, 0], [1, 2], [0, 1], [1, 0], [0, 2], [1, 1]]
const CloudOutputs = struct({ cloudColor: 'vec4', cloudDepth: 'vec4' })

function remap(value: F, low: F | number, high: F | number): F {
  const lo = typeof low === 'number' ? float(low) : low
  const hi = typeof high === 'number' ? float(high) : high
  return clamp(value.sub(lo).div(max(hi.sub(lo), 1e-6)), 0, 1) as unknown as F
}

function hg(g: F, cosTheta: F): F {
  const g2 = g.mul(g)
  return float(1).sub(g2).div(max(float(4 * PI).mul(pow(float(1).add(g2).sub(g.mul(cosTheta).mul(2)), 1.5)), 1e-7)) as unknown as F
}

function phase(cosTheta: F, attenuation: F): F {
  return mix(hg(attenuation.mul(0.7) as unknown as F, cosTheta), hg(attenuation.mul(-0.2) as unknown as F, cosTheta), 0.5) as unknown as F
}

function multipleScattering(opticalDepth: F, cosTheta: F): F {
  const coefficients = vec3(1).toVar()
  const result = float(0).toVar()
  for (let i = 0; i < 8; i += 1) {
    result.addAssign(coefficients.x.mul(exp(opticalDepth.mul(coefficients.y).negate())).mul(phase(cosTheta, coefficients.z)))
    coefficients.mulAssign(0.5)
  }
  return result as unknown as F
}

function makeDensity(assets: TakramTslAssets) {
  const hash32 = Fn(([input]: [U]) => {
    const hash = uint(input).toVar()
    hash.assign(hash.bitXor(hash.shiftRight(uint(16))).mul(uint(0x7feb352d)))
    hash.assign(hash.bitXor(hash.shiftRight(uint(15))).mul(uint(0x846ca68b)))
    return hash.bitXor(hash.shiftRight(uint(16)))
  })
  hash32.setLayout({ name: 'takramHash32', type: 'uint', inputs: [{ name: 'input', type: 'uint' }] })

  const toEcef = (position: V3): V3 => {
    const origin = vec3(-5896194.33, 2146039.23, -1038753.12)
    const north = vec3(-0.1534762, 0.05586077, 0.98657216)
    const up = vec3(-0.92707458, 0.33742755, -0.16332596)
    const east = vec3(-0.34202014, -0.93969262, 0)
    return origin.add(north.mul(position.x)).add(up.mul(position.y)).add(east.mul(position.z)) as unknown as V3
  }

  const cubeSphereUv = (position: V3): V2 => {
    const n = normalize(position).toVar()
    const f = abs(n).toVar()
    const c = n.div(max(f.x, max(f.y, f.z))).toVar()
    const mapped = vec2(0).toVar()
    If(f.y.greaterThan(f.x).and(f.y.greaterThan(f.z)), () => {
      mapped.assign(select(c.y.greaterThan(0), vec2(n.x.negate(), n.z), n.xz))
    }).ElseIf(f.x.greaterThan(f.y).and(f.x.greaterThan(f.z)), () => {
      mapped.assign(select(c.x.greaterThan(0), n.yz, vec2(n.y.negate(), n.z)))
    }).Else(() => {
      mapped.assign(select(c.z.greaterThan(0), n.xy, vec2(n.x, n.y.negate())))
    })
    const m2 = mapped.mul(mapped).toVar()
    const q = dot(m2, vec2(-2, 2)).sub(3).toVar()
    const x = sqrt(max(float(1.5).add(m2.x).sub(m2.y).sub(sqrt(max(float(-24).mul(m2.x).add(q.mul(q)), 0)).mul(0.5)), 0))
      .mul(select(mapped.x.greaterThan(0), 1, -1)).toVar()
    const y = sqrt(max(float(6).div(float(3).sub(x.mul(x))), 0)).mul(mapped.y)
    return vec2(x, y).mul(0.5).add(0.5) as unknown as V2
  }

  const weatherUv = (position: V3): V2 => cubeSphereUv(toEcef(position)).mul(100) as unknown as V2

  const tileOffset = (tile: Node<'ivec2'>): V2 => {
    const offset = vec2(0).toVar()
    If(tile.x.equal(int(0)).and(tile.y.equal(int(0))), () => { offset.assign(vec2(0)) }).Else(() => {
      const tx = bitcast(tile.x, 'uint') as unknown as U
      const ty = bitcast(tile.y, 'uint') as unknown as U
      const seed = hash32(tx.mul(uint(0x9e3779b1)).bitXor(ty.mul(uint(0x85ebca77)))) as unknown as U
      offset.assign(vec2(
        float(hash32(seed.bitXor(uint(0x68bc21eb))).bitAnd(uint(0xffff))),
        float(hash32(seed.bitXor(uint(0x02e5be93))).bitAnd(uint(0xffff))),
      ).div(65536).mul(127))
    })
    return offset as unknown as V2
  }

  const weatherTile = (position: V3, tile: Node<'ivec2'>, mip: F): V4 =>
    texture(assets.weather, weatherUv(position).add(tileOffset(tile))).level(mip) as unknown as V4

  const continuousWeather = (position: V3, mip: F): V4 => {
    const coordinate = position.xz.div(100_000).toVar()
    const centre = ivec2(floor(coordinate.add(0.5))).toVar()
    const local = coordinate.sub(vec2(centre)).toVar()
    const low = ivec2(centre).toVar()
    const high = ivec2(centre).toVar()
    const weight = vec2(0).toVar()
    If(local.x.greaterThan(0.4), () => {
      high.x.addAssign(1); weight.x.assign(smoothstep(0.4, 0.5, local.x).mul(0.5))
    }).ElseIf(local.x.lessThan(-0.4), () => {
      low.x.subAssign(1); weight.x.assign(float(0.5).add(smoothstep(-0.5, -0.4, local.x).mul(0.5)))
    })
    If(local.y.greaterThan(0.4), () => {
      high.y.addAssign(1); weight.y.assign(smoothstep(0.4, 0.5, local.y).mul(0.5))
    }).ElseIf(local.y.lessThan(-0.4), () => {
      low.y.subAssign(1); weight.y.assign(float(0.5).add(smoothstep(-0.5, -0.4, local.y).mul(0.5)))
    })
    const result = weatherTile(position, low as unknown as Node<'ivec2'>, mip).toVar()
    // Every fetch has an explicit LOD, so unlike derivative-based sampling it
    // is valid inside non-uniform control flow. Match the native shader's hot
    // path: one sample in a tile interior, two on an edge and four at a corner.
    If(low.x.equal(high.x), () => {
      If(low.y.equal(high.y).not(), () => {
        result.assign(mix(result, weatherTile(position, ivec2(low.x, high.y), mip), weight.y))
      })
    }).ElseIf(low.y.equal(high.y), () => {
      result.assign(mix(result, weatherTile(position, ivec2(high.x, low.y), mip), weight.x))
    }).Else(() => {
      const highLow = weatherTile(position, ivec2(high.x, low.y), mip)
      const lowHigh = weatherTile(position, ivec2(low.x, high.y), mip)
      const highHigh = weatherTile(position, high as unknown as Node<'ivec2'>, mip)
      result.assign(mix(mix(result, highLow, weight.x), mix(lowHigh, highHigh, weight.x), weight.y))
    })
    return result as unknown as V4
  }

  const heightShape = (heightFraction: F): F => {
    const x = clamp(pow(heightFraction, 0.35).mul(2).sub(1), -1, 1)
    return float(1).sub(x.mul(x)) as unknown as F
  }

  const layerDensity = Fn(([position, layer, weatherMip, shapeMip, jitter, coverage, layerOffset]: [V3, I, F, F, F, F, F]) => {
    const modelPosition = vec3(position.z, position.y, position.x.negate()).toVar()
    const low = float(750).add(layerOffset).toVar()
    const high = float(1400).add(layerOffset).toVar()
    If(layer.equal(int(1)), () => { low.assign(float(1000).add(layerOffset)); high.assign(float(2200).add(layerOffset)) })
    const h = remap(position.y, low, high).toVar()
    const density = float(0).toVar()
    If(position.y.greaterThan(low).and(position.y.lessThan(high)), () => {
      const uv = weatherUv(modelPosition as unknown as V3).toVar()
      const weather = continuousWeather(modelPosition as unknown as V3, weatherMip).toVar()
      const localWeather = select(layer.equal(int(1)), weather.y, weather.x).toVar()
      const factor = float(1).sub(coverage.mul(heightShape(h as unknown as F))).toVar()
      density.assign(remap(mix(localWeather, 1, 0.6) as unknown as F, factor, factor.add(0.6) as unknown as F))
      If(density.greaterThan(0.00001), () => {
        const turbulenceStrength = remap(h as unknown as F, float(0.3), float(0)).mul(density).toVar()
        const turbulence = texture(assets.turbulence, uv.mul(20)).level(float(0)).xyz.mul(2).sub(1).mul(350).mul(turbulenceStrength).toVar()
        const ecef = toEcef(modelPosition as unknown as V3).toVar()
        const shape = texture3D(assets.shape, ecef.add(turbulence).mul(0.0003)).level(shapeMip).r
        density.assign(remap(density as unknown as F, float(1).sub(shape), float(1)))
        If(jitter.lessThan(0.94), () => {
          const detail = texture3D(assets.detail, ecef.add(turbulence).mul(0.006)).level(float(0)).r
          const modifier = mix(pow(detail, 6), float(1).sub(detail), remap(h as unknown as F, float(0.2), float(0.4))).toVar()
          density.assign(remap(density.mul(2) as unknown as F, modifier.mul(0.5) as unknown as F, float(1)))
        })
        density.assign(clamp(density.mul(0.2).mul(h.mul(0.75).add(0.25)), 0, 1))
      })
    })
    return density
  })
  layerDensity.setLayout({
    name: 'takramLayerDensity', type: 'float',
    inputs: [
      { name: 'position', type: 'vec3' }, { name: 'layer', type: 'int' },
      { name: 'weatherMip', type: 'float' }, { name: 'shapeMip', type: 'float' },
      { name: 'jitter', type: 'float' }, { name: 'coverage', type: 'float' },
      { name: 'layerOffset', type: 'float' },
    ],
  })

  return (position: V3, weatherMip: F, shapeMip: F, jitter: F, coverage: F, layerOffset: F): F =>
    layerDensity(position, int(0), weatherMip, shapeMip, jitter, coverage, layerOffset)
      .add(layerDensity(position, int(1), weatherMip, shapeMip, jitter, coverage, layerOffset)) as unknown as F
}

function makeTarget(name: string, count = 1): RenderTarget {
  const target = new RenderTarget(1, 1, { count, type: HalfFloatType, format: RGBAFormat, depthBuffer: false })
  for (let i = 0; i < target.textures.length; i += 1) {
    const textureValue = target.textures[i]!
    textureValue.name = count === 2 ? (i === 0 ? 'cloudColor' : 'cloudDepth') : name
    textureValue.minFilter = textureValue.magFilter = LinearFilter
  }
  return target
}

let rendererState: ReturnType<typeof RendererUtils.resetRendererState> | undefined
const drawingBuffer = new Vector2()

class TakramTslCloudPassNode extends TempNode<'vec4'> {
  private readonly low = makeTarget('Takram TSL low cloud', 2)
  private readonly history: readonly [RenderTarget, RenderTarget] = [makeTarget('Takram TSL history 0', 2), makeTarget('Takram TSL history 1', 2)]
  private readonly marchMaterial = new NodeMaterial()
  private readonly marchQuad = new QuadMesh(this.marchMaterial)
  private readonly temporalMaterial = new NodeMaterial()
  private readonly temporalQuad = new QuadMesh(this.temporalMaterial)
  private readonly lowColor = texture(this.low.textures[0]!) as unknown as TextureNode
  private readonly lowDepth = texture(this.low.textures[1]!) as unknown as TextureNode
  private readonly historyColor = texture(this.history[0].textures[0]!) as unknown as TextureNode
  private readonly historyDepth = texture(this.history[0].textures[1]!) as unknown as TextureNode
  private readonly resolvedColor = texture(this.history[1].textures[0]!) as unknown as TextureNode
  private readonly resolvedDepth = texture(this.history[1].textures[1]!) as unknown as TextureNode
  private readonly fullSize = uniform(new Vector2(1, 1))
  private readonly lowSize = uniform(new Vector2(1, 1))
  private readonly phaseOffset = uniform(new Vector2(0, 0))
  private readonly eyeNode = uniform(new Vector3())
  private readonly coverageNode = uniform(0.45)
  private readonly forwardNode = uniform(new Vector3(0, 0, -1))
  private readonly rightNode = uniform(new Vector3(1, 0, 0))
  private readonly upNode = uniform(new Vector3(0, 1, 0))
  private readonly fovNode = uniform(1)
  private readonly aspectNode = uniform(1)
  private readonly sunNode = uniform(new Vector3(0.42, 0.78, 0.46))
  private readonly layerOffsetNode = uniform(0)
  private readonly previousPosition = uniform(new Vector3())
  private readonly previousForward = uniform(new Vector3(0, 0, -1))
  private readonly previousRight = uniform(new Vector3(1, 0, 0))
  private readonly previousUp = uniform(new Vector3(0, 1, 0))
  private readonly historyValid = uniform(0)
  private current = 0
  private frameIndex = 0
  private resetPending = true
  private timingBackend: TimestampBackend | null = null
  private pendingTimestampUids: { readonly march: string; readonly temporal: string } | null = null
  private readonly marchGpuTimes: number[] = []
  private readonly temporalGpuTimes: number[] = []
  private eye: Vec3 = { x: 0, y: 0, z: 0 }
  private coverage = 0.45
  private layerOffsetM = 0
  private sun: Vec3 = { x: 0.42, y: 0.78, z: 0.46 }
  resets = 0

  constructor(
    private readonly assets: TakramTslAssets,
    private readonly camera: PerspectiveCamera,
    private readonly sceneColor: Node<'vec4'>,
    private readonly sceneDepth: TextureNode,
    private readonly nearNode: F,
    private readonly farNode: F,
  ) {
    super('vec4')
    this.updateBeforeType = NodeUpdateType.FRAME
    const density = makeDensity(assets)
    const rayDirection = (pixel: V2, forward = this.forwardNode, right = this.rightNode, up = this.upNode): V3 => {
      const ndc = pixel.div(this.fullSize).mul(2).sub(1)
      return normalize(forward.add(right.mul(ndc.x).mul(this.aspectNode).mul(this.fovNode)).sub(up.mul(ndc.y).mul(this.fovNode))) as unknown as V3
    }
    const layerInterval = (originY: F, directionY: F, low: F, high: F): V2 => {
      const result = vec2(1, -1).toVar()
      If(abs(directionY).lessThan(1e-6), () => {
        result.assign(select(originY.greaterThanEqual(low).and(originY.lessThanEqual(high)), vec2(0, FAR_M), vec2(1, -1)))
      }).Else(() => {
        const a = low.sub(originY).div(directionY), b = high.sub(originY).div(directionY)
        result.assign(vec2(max(0, min(a, b)), min(FAR_M, max(a, b))))
      })
      return result as unknown as V2
    }
    const opticalDepthToSun = (position: V3, weatherMip: F, shapeMip: F, jitter: F): F => {
      const depth = float(0).toVar()
      const distance = float(100).mul(jitter).toVar()
      const step = float(100).toVar()
      for (let i = 0; i < 2; i += 1) {
        depth.addAssign(density(position.add(this.sunNode.mul(distance)) as unknown as V3, weatherMip, shapeMip, jitter, this.coverageNode as unknown as F, this.layerOffsetNode as unknown as F).mul(step))
        distance.addAssign(step); step.mulAssign(1.75)
      }
      return depth as unknown as F
    }

    const march = Fn(() => {
      const fullPixel = floor(screenCoordinate.xy).mul(vec2(2, 3)).add(this.phaseOffset).add(0.5).toVar()
      const direction = rayDirection(fullPixel as unknown as V2).toVar()
      const origin = this.eyeNode.sub(vec3(289000, 0, -56000)).toVar()
      const jitterPixel = ivec2(fullPixel).toVar()
      const jitterX = bitcast(jitterPixel.x, 'uint') as unknown as U
      const jitterY = bitcast(jitterPixel.y, 'uint') as unknown as U
      const hashed = jitterX.bitXor(jitterY.mul(uint(0x9e3779b1)))
      // Reuse the same avalanche as the weather tiling; the modulo 64 is a
      // mask because the accepted STBN volume has 64 slices.
      const hash = hashed.bitXor(hashed.shiftRight(uint(16))).mul(uint(0x7feb352d)).toVar()
      hash.assign(hash.bitXor(hash.shiftRight(uint(15))).mul(uint(0x846ca68b)))
      hash.assign(hash.bitXor(hash.shiftRight(uint(16))))
      const jitterSlice = hash.bitAnd(uint(63))
      const jitter = texture3D(assets.stbn, vec3(fullPixel.div(128), float(jitterSlice).div(64))).level(float(0)).r.toVar()
      const background = vec3(0).toVar()
      const transmittance = float(1).toVar()
      const radianceIntegral = vec3(0).toVar()
      const weightedDistance = float(0).toVar()
      const weightSum = float(0).toVar()
      const low = float(LAYER_LOW_M).add(this.layerOffsetNode).toVar()
      const high = float(LAYER_HIGH_M).add(this.layerOffsetNode).toVar()
      const interval = layerInterval(origin.y, direction.y, low as unknown as F, high as unknown as F).toVar()
      const nearDistance = interval.x.toVar()
      const farDistance = interval.y.toVar()
      If(farDistance.greaterThan(nearDistance), () => {
        const stepSize = float(50).add(nearDistance.mul(0.01)).toVar()
        const distance = nearDistance.add(stepSize.mul(jitter).mul(2)).toVar()
        const cosTheta = dot(direction, this.sunNode).toVar()
        Loop({ start: int(0), end: int(500), type: 'int', condition: '<', name: 'marchStep' } as unknown as I, () => {
          If(distance.greaterThan(farDistance).or(distance.greaterThan(FAR_M)).or(transmittance.lessThanEqual(0.01)), () => { Break() })
          const samplePosition = origin.add(direction.mul(distance)).toVar()
          If(samplePosition.y.lessThanEqual(low).or(samplePosition.y.greaterThanEqual(high)), () => {
            distance.addAssign(1000)
          }).Else(() => {
            const weatherMip = log2(max(1, distance.mul(1e-5))).toVar()
            const rayFootprint = distance.mul(6).mul(this.fovNode).div(this.fullSize.y).toVar()
            const filterWidth = max(rayFootprint, stepSize.mul(0.5)).toVar()
            const shapeMip = clamp(log2(max(1, filterWidth.div(26.0416667))), 0, 7).toVar()
            const sampleDensity = density(samplePosition as unknown as V3, weatherMip as unknown as F, shapeMip as unknown as F, jitter as unknown as F, this.coverageNode as unknown as F, this.layerOffsetNode as unknown as F)
              .mul(float(1).sub(smoothstep(150000, 198000, distance))).toVar()
            If(sampleDensity.lessThanEqual(0.00001), () => {
              stepSize.assign(min(1000, stepSize.mul(1.01))); distance.addAssign(stepSize)
            }).Else(() => {
              const opticalDepth = opticalDepthToSun(samplePosition as unknown as V3, weatherMip as unknown as F, shapeMip as unknown as F, jitter as unknown as F)
              const radiance = vec3(13.5, 12.8, 11.8).mul(multipleScattering(opticalDepth, cosTheta as unknown as F)).toVar()
              const h = remap(samplePosition.y as unknown as F, low as unknown as F, high as unknown as F).toVar()
              radiance.addAssign(vec3(2.2, 2.8, 4).mul(h.mul(0.5).add(0.5)).div(4 * PI))
              radiance.addAssign(vec3(0.24, 0.27, 0.30).mul(float(1).sub(h)))
              radiance.mulAssign(sampleDensity)
              radiance.mulAssign(float(1).sub(exp(sampleDensity.mul(-150)).mul(0.8)))
              const segmentT = exp(sampleDensity.mul(stepSize).negate()).toVar()
              const scattering = radiance.mul(float(1).sub(segmentT)).div(max(sampleDensity, 1e-7)).toVar()
              radianceIntegral.addAssign(scattering.mul(transmittance))
              transmittance.mulAssign(segmentT)
              weightedDistance.addAssign(distance.mul(transmittance))
              weightSum.addAssign(transmittance)
              stepSize.assign(min(1000, stepSize.mul(1.01))); distance.addAssign(stepSize)
            })
          })
        })
      })
      const frontDepth = select(weightSum.greaterThan(0), weightedDistance.div(max(weightSum, 1e-6)), float(FAR_M)).toVar()
      const opacity = float(1).sub(transmittance).toVar()
      return CloudOutputs(
        vec4(radianceIntegral.sub(background.mul(transmittance)), opacity),
        vec4(frontDepth.div(FAR_M), 0, 0, 1),
      )
    })()
    this.marchMaterial.fragmentNode = mrt({ cloudColor: march.get('cloudColor'), cloudDepth: march.get('cloudDepth') })
    this.marchMaterial.name = 'TakramTslMarch'
    this.marchQuad.name = 'TakramTslMarch'

    const temporal = Fn(() => {
      const position = screenCoordinate.xy.toVar()
      const pixel = ivec2(floor(position)).toVar()
      const phaseCentre = this.phaseOffset.add(0.5).toVar()
      const reconstructedUv = position.sub(phaseCentre).div(vec2(2, 3)).add(0.5).div(this.lowSize).toVar()
      const reconstructedColor = this.lowColor.sample(reconstructedUv).level(float(0)).toVar()
      const reconstructedDepth = this.lowDepth.sample(reconstructedUv).level(float(0)).r.toVar()
      const lowPixel = ivec2(floor(position.div(vec2(2, 3)))).toVar()
      const exactColor = this.lowColor.load(lowPixel).toVar()
      const exactDepth = this.lowDepth.load(lowPixel).r.toVar()
      const distance = reconstructedDepth.mul(FAR_M).toVar()
      const world = this.eyeNode.add(rayDirection(position as unknown as V2).mul(distance)).toVar()
      const relative = world.sub(this.previousPosition).toVar()
      const z = dot(relative, this.previousForward).toVar()
      const previousNdc = vec2(
        dot(relative, this.previousRight).div(max(1, z.mul(this.fovNode).mul(this.aspectNode))),
        dot(relative, this.previousUp).negate().div(max(1, z.mul(this.fovNode))),
      ).toVar()
      const previousUv = previousNdc.mul(0.5).add(0.5).toVar()
      const previousColor = this.historyColor.sample(previousUv).level(float(0)).toVar()
      const previousDepthValue = this.historyDepth.sample(previousUv).level(float(0)).r.toVar()
      const validUv = previousUv.x.greaterThan(0.002).and(previousUv.x.lessThan(0.998))
        .and(previousUv.y.greaterThan(0.002)).and(previousUv.y.lessThan(0.998)).and(z.greaterThan(0))
      const depthAgreement = abs(previousDepthValue.sub(reconstructedDepth)).lessThan(0.035)
      const valid = this.historyValid.greaterThan(0.5).and(validUv).and(depthAgreement)
      const phase = ivec2(this.phaseOffset).toVar()
      const isCurrent = pixel.x.mod(2).equal(phase.x).and(pixel.y.mod(3).equal(phase.y))
      const freshColor = select(isCurrent, exactColor, reconstructedColor).toVar()
      const freshDepth = select(isCurrent, exactDepth, reconstructedDepth).toVar()
      const historyWeight = mix(0.82, 0.93, smoothstep(0.20, 0.75, reconstructedDepth)).toVar()
      // Every pixel gets a small contribution from this frame's bilinear
      // reconstruction. Carrying the five non-current 2x3 phases unchanged
      // left their old values interleaved as a visible, flickering lattice in
      // thin wisps. Reuse the accepted near/far history weight for all six
      // phases so bilinear reconstruction and exact samples converge equally.
      const weight = select(valid, historyWeight, 0).toVar()
      return CloudOutputs(
        vec4(mix(freshColor, previousColor, weight)),
        vec4(mix(freshDepth, previousDepthValue, weight), 0, 0, 1),
      )
    })()
    this.temporalMaterial.fragmentNode = mrt({ cloudColor: temporal.get('cloudColor'), cloudDepth: temporal.get('cloudDepth') })
    this.temporalMaterial.name = 'TakramTslTemporal'
    this.temporalQuad.name = 'TakramTslTemporal'
  }

  setEye(value: Vec3): void { this.eye = { ...value } }
  setEnvironment(_timeS: number, sun: Vec3, coverage: number, baseM: number): void {
    this.sun = { ...sun }; this.coverage = clampNumber(coverage, 0, 1); this.layerOffsetM = Number.isFinite(baseM) ? baseM - 750 : 0
  }
  resetHistory(): void { this.resetPending = true }

  gpuPassTimesMs(): { readonly march: readonly number[]; readonly temporal: readonly number[] } {
    return { march: this.marchGpuTimes, temporal: this.temporalGpuTimes }
  }

  captureGpuTimes(): void {
    const uids = this.pendingTimestampUids
    const timestamps = this.timingBackend?.timestampQueryPool?.render?.timestamps
    if (uids === null || timestamps === undefined) return
    const march = timestamps.get(uids.march)
    const temporal = timestamps.get(uids.temporal)
    if (march === undefined || temporal === undefined) return
    this.marchGpuTimes.push(march)
    this.temporalGpuTimes.push(temporal)
    if (this.marchGpuTimes.length > 4096) this.marchGpuTimes.shift()
    if (this.temporalGpuTimes.length > 4096) this.temporalGpuTimes.shift()
    this.pendingTimestampUids = null
  }

  private timestampUid(renderer: WebGPURenderer, target: RenderTarget, callDepth: number): string | undefined {
    const timingRenderer = renderer as unknown as TimingRenderer
    const backend = renderer.backend as unknown as TimestampBackend
    this.timingBackend = backend
    const context = timingRenderer._renderContexts.get(target, renderer.getMRT(), callDepth)
    return backend.get(context).timestampUID
  }

  override updateBefore(frame: NodeFrame): undefined {
    const renderer = frame.renderer as unknown as WebGPURenderer
    rendererState = RendererUtils.resetRendererState(renderer, rendererState as ReturnType<typeof RendererUtils.resetRendererState>)
    const { x: width, y: height } = renderer.getDrawingBufferSize(drawingBuffer)
    const lowWidth = Math.ceil(width / 2), lowHeight = Math.ceil(height / 3)
    if (this.low.width !== lowWidth || this.low.height !== lowHeight || this.history[0].width !== width || this.history[0].height !== height) this.resetPending = true
    this.low.setSize(lowWidth, lowHeight)
    for (const target of this.history) target.setSize(width, height)
    ;(this.fullSize as unknown as { value: Vector2 }).value.set(width, height)
    ;(this.lowSize as unknown as { value: Vector2 }).value.set(lowWidth, lowHeight)
    const [px, py] = PHASES[this.frameIndex % PHASES.length]!
    ;(this.phaseOffset as unknown as { value: Vector2 }).value.set(px, py)
    const forward = new Vector3(0, 0, -1).transformDirection(this.camera.matrixWorld)
    const right = new Vector3(1, 0, 0).transformDirection(this.camera.matrixWorld)
    const up = new Vector3(0, 1, 0).transformDirection(this.camera.matrixWorld)
    ;(this.eyeNode as unknown as { value: Vector3 }).value.set(this.eye.x, this.eye.y, this.eye.z)
    ;(this.coverageNode as unknown as { value: number }).value = this.coverage
    ;(this.forwardNode as unknown as { value: Vector3 }).value.copy(forward)
    ;(this.rightNode as unknown as { value: Vector3 }).value.copy(right)
    ;(this.upNode as unknown as { value: Vector3 }).value.copy(up)
    ;(this.fovNode as unknown as { value: number }).value = Math.tan(this.camera.fov * Math.PI / 360)
    ;(this.aspectNode as unknown as { value: number }).value = width / height
    ;(this.sunNode as unknown as { value: Vector3 }).value.set(this.sun.x, this.sun.y, this.sun.z)
    ;(this.layerOffsetNode as unknown as { value: number }).value = this.layerOffsetM
    ;(this.historyValid as unknown as { value: number }).value = this.resetPending ? 0 : 1
    this.historyColor.value = this.history[this.current]!.textures[0]!
    this.historyDepth.value = this.history[this.current]!.textures[1]!
    const callDepth = (renderer as unknown as TimingRenderer)._callDepth + 1
    renderer.setRenderTarget(this.low)
    this.marchQuad.render(renderer)
    const marchTimestampUid = this.timestampUid(renderer, this.low, callDepth)
    const next = 1 - this.current
    renderer.setRenderTarget(this.history[next]!)
    this.temporalQuad.render(renderer)
    const temporalTimestampUid = this.timestampUid(renderer, this.history[next]!, callDepth)
    if (marchTimestampUid !== undefined && temporalTimestampUid !== undefined) {
      this.pendingTimestampUids = { march: marchTimestampUid, temporal: temporalTimestampUid }
    }
    this.resolvedColor.value = this.history[next]!.textures[0]!
    this.resolvedDepth.value = this.history[next]!.textures[1]!
    if (this.resetPending) this.resets += 1
    ;(this.previousPosition as unknown as { value: Vector3 }).value.set(this.eye.x, this.eye.y, this.eye.z)
    ;(this.previousForward as unknown as { value: Vector3 }).value.copy(forward)
    ;(this.previousRight as unknown as { value: Vector3 }).value.copy(right)
    ;(this.previousUp as unknown as { value: Vector3 }).value.copy(up)
    this.current = next
    this.frameIndex += 1
    this.resetPending = false
    RendererUtils.restoreRendererState(renderer, rendererState)
    return undefined
  }

  override setup(_builder: NodeBuilder): Node<'vec4'> {
    return Fn(() => {
      const position = screenCoordinate.xy.toVar()
      const uv = position.div(this.fullSize).toVar()
      const texel = float(1).div(this.fullSize).toVar()
      const centre = this.resolvedColor.sample(uv).level(float(0)).toVar()
      const localNorth = this.resolvedColor.sample(uv.sub(vec2(float(0), texel.y))).level(float(0)).toVar()
      const localSouth = this.resolvedColor.sample(uv.add(vec2(float(0), texel.y))).level(float(0)).toVar()
      const localWest = this.resolvedColor.sample(uv.sub(vec2(texel.x, float(0)))).level(float(0)).toVar()
      const localEast = this.resolvedColor.sample(uv.add(vec2(texel.x, float(0)))).level(float(0)).toVar()
      const radius = texel.mul(3).toVar()
      const north = this.resolvedColor.sample(uv.sub(vec2(float(0), radius.y))).level(float(0)).toVar()
      const south = this.resolvedColor.sample(uv.add(vec2(float(0), radius.y))).level(float(0)).toVar()
      const west = this.resolvedColor.sample(uv.sub(vec2(radius.x, float(0)))).level(float(0)).toVar()
      const east = this.resolvedColor.sample(uv.add(vec2(radius.x, float(0)))).level(float(0)).toVar()
      const nw = this.resolvedColor.sample(uv.sub(radius)).level(float(0)).toVar()
      const ne = this.resolvedColor.sample(uv.add(vec2(radius.x, radius.y.negate()))).level(float(0)).toVar()
      const sw = this.resolvedColor.sample(uv.add(vec2(radius.x.negate(), radius.y))).level(float(0)).toVar()
      const se = this.resolvedColor.sample(uv.add(radius)).level(float(0)).toVar()
      const localMin = min(centre.a, min(min(localNorth.a, localSouth.a), min(localWest.a, localEast.a)))
      const localMax = max(centre.a, max(max(localNorth.a, localSouth.a), max(localWest.a, localEast.a)))
      const nearMin = min(localMin, min(min(north.a, south.a), min(west.a, east.a)))
      const nearMax = max(localMax, max(max(north.a, south.a), max(west.a, east.a)))
      const diagonalMin = min(min(nw.a, ne.a), min(sw.a, se.a))
      const diagonalMax = max(max(nw.a, ne.a), max(sw.a, se.a))
      const contrast = max(nearMax, diagonalMax).sub(min(nearMin, diagonalMin)).toVar()
      // Mix the six temporal phases only where their alpha disagreement is
      // visible. Dense interiors keep the accepted sharp centre; low-opacity
      // wisps get a one-pixel cross average before the broader edge feather.
      const phaseSoft = centre.mul(4).add(localNorth).add(localSouth).add(localWest).add(localEast).div(8)
      const phaseStrength = float(1).sub(smoothstep(0.18, 0.65, centre.a)).mul(smoothstep(0.004, 0.03, contrast))
      const base = mix(centre, phaseSoft, phaseStrength).toVar()
      const cloud = vec4(base).toVar()
      If(contrast.greaterThan(0.012), () => {
        const soft = base.mul(4).add(north.add(south).add(west).add(east).mul(2)).add(nw).add(ne).add(sw).add(se).div(16)
        const distance = this.resolvedDepth.sample(uv).level(float(0)).r
        const maxStrength = mix(0.90, 1, smoothstep(0.20, 0.75, distance))
        const strength = min(maxStrength, contrast.sub(0.012).div(max(contrast, 1e-4)).mul(1.35))
        cloud.assign(mix(base, soft, strength))
      })
      const depth = this.sceneDepth.load(ivec2(floor(position))).x
      const viewZ = perspectiveDepthToViewZ(depth, this.nearNode, this.farNode).negate().toVar()
      const ray = normalize(this.forwardNode.add(this.rightNode.mul(uv.x.mul(2).sub(1)).mul(this.aspectNode).mul(this.fovNode))
        .sub(this.upNode.mul(uv.y.mul(2).sub(1)).mul(this.fovNode))).toVar()
      const sceneDistance = viewZ.div(max(0.001, dot(ray, this.forwardNode))).toVar()
      const cloudDistance = this.resolvedDepth.sample(uv).level(float(0)).r.mul(FAR_M).toVar()
      const scene = vec4(this.sceneColor).toVar()
      return select(sceneDistance.add(2).lessThan(cloudDistance), scene, vec4(cloud.rgb.add(scene.rgb.mul(float(1).sub(cloud.a))), scene.a))
    })() as unknown as Node<'vec4'>
  }

  override dispose(): void {
    super.dispose()
    this.low.dispose(); this.history.forEach(target => target.dispose())
    this.marchMaterial.dispose(); this.temporalMaterial.dispose(); this.assets.dispose()
  }
}

function clampNumber(value: number, low: number, high: number): number { return Math.max(low, Math.min(high, value)) }

export function createTakramTslCloudPass(options: {
  assets: TakramTslAssets
  camera: PerspectiveCamera
  sceneColor: Node<'vec4'>
  sceneDepth: Node<'float'>
}): TakramCloudPass {
  const node = new TakramTslCloudPassNode(
    options.assets, options.camera, options.sceneColor, options.sceneDepth as unknown as TextureNode,
    reference('near', 'float', options.camera) as unknown as F,
    reference('far', 'float', options.camera) as unknown as F,
  )
  return {
    composite: node as unknown as Node<'vec4'>,
    setResolutionScale() {}, setUpdatePeriod() {},
    setEye(value) { node.setEye(value) },
    setEnvironment(timeS, sun, coverage, baseM) { node.setEnvironment(timeS, sun, coverage, baseM) },
    resetHistory() { node.resetHistory() }, historyResets() { return node.resets },
    gpuTimesMs() { return [] },
    gpuPassTimesMs() { return node.gpuPassTimesMs() },
    captureGpuTimes() { node.captureGpuTimes() },
    measureReprojectionResidual(): Promise<ReprojectionResidual | null> { return Promise.resolve(null) },
    dispose() { node.dispose() },
  }
}
