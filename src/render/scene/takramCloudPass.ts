import { HalfFloatType, LinearFilter, RGBAFormat, RenderTarget, Vector2, Vector3, type PerspectiveCamera, type Texture } from 'three'
import { NodeUpdateType, TempNode, type Node, type NodeBuilder, type NodeFrame, type TextureNode, type WebGPURenderer } from 'three/webgpu'
import { convertToTexture, texture, vec4 } from 'three/tsl'
import type { Vec3 } from '../../sim/math/vec3.js'
import type { FxCloudLimit } from '../fx/fxPass.js'
import type { ReprojectionResidual } from './cloudPass.js'
import { shaderModuleSource, takramGameCloudsFragment, takramGameCompositeFragment, takramGameTemporalFragment } from './takramGameShaders.js'

export const CLOUD_RENDERER_PARAM = 'cloudRenderer'
export type CloudRendererName = 'legacy' | 'takram' | 'takram-tsl'

export function cloudRendererFromQuery(search: string): CloudRendererName | undefined {
  const raw = new URLSearchParams(search).get(CLOUD_RENDERER_PARAM)
  if (raw === null) return undefined
  if (raw === 'legacy' || raw === 'takram' || raw === 'takram-tsl') return raw
  throw new Error(`${CLOUD_RENDERER_PARAM}: ${JSON.stringify(raw)} is not a cloud renderer (legacy, takram, takram-tsl)`)
}

type NativeBackend = {
  device?: GPUDevice
  get(texture: Texture): { texture?: GPUTexture }
}

type PassTextureAccess = TextureNode & {
  value: Texture | null
  updateTexture?: () => void
  passNode?: { getTexture(name: string): Texture }
  textureName?: string
}

function passTexture(node: TextureNode, label: string): Texture {
  const access = node as PassTextureAccess
  access.updateTexture?.()
  const value = access.value ?? (access.passNode !== undefined && access.textureName !== undefined
    ? access.passNode.getTexture(access.textureName)
    : null)
  if (value === null) throw new Error(`Takram clouds could not resolve the Three ${label} texture`)
  return value
}

type TakramAssets = {
  readonly device: GPUDevice
  readonly weather: GPUTexture
  readonly shape: GPUTexture
  readonly detail: GPUTexture
  readonly turbulence: GPUTexture
  readonly stbn: GPUTexture
  dispose(): void
}

const CONTENT_ROOT = '/content/clouds/takram'

async function fetchBytes(path: string): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

async function imageTexture(device: GPUDevice, path: string): Promise<GPUTexture> {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none' })
  const mipLevelCount = Math.floor(Math.log2(Math.max(bitmap.width, bitmap.height))) + 1
  const result = device.createTexture({
    label: path, size: [bitmap.width, bitmap.height], mipLevelCount, format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  })
  for (let level = 0; level < mipLevelCount; level += 1) {
    const width = Math.max(1, bitmap.width >> level)
    const height = Math.max(1, bitmap.height >> level)
    const surface = new OffscreenCanvas(width, height)
    const drawing = surface.getContext('2d')
    if (drawing === null) throw new Error(`Could not build mip ${level} for ${path}`)
    drawing.drawImage(bitmap, 0, 0, width, height)
    device.queue.copyExternalImageToTexture({ source: surface, flipY: true }, { texture: result, mipLevel: level }, [width, height])
  }
  bitmap.close()
  return result
}

function padded3dData(source: Uint8Array<ArrayBuffer>, size: readonly [number, number, number]): Uint8Array<ArrayBuffer> {
  const [width, height, depth] = size
  if (source.byteLength !== width * height * depth) throw new Error(`3D texture expected ${width * height * depth} bytes, got ${source.byteLength}`)
  const bytesPerRow = Math.ceil(width / 256) * 256
  const result = new Uint8Array(bytesPerRow * height * depth)
  for (let z = 0; z < depth; z += 1) {
    for (let y = 0; y < height; y += 1) {
      const sourceOffset = width * (y + height * z)
      result.set(source.subarray(sourceOffset, sourceOffset + width), bytesPerRow * (y + height * z))
    }
  }
  return result
}

async function volumeTexture(device: GPUDevice, path: string, size: readonly [number, number, number]): Promise<GPUTexture> {
  const source = await fetchBytes(path)
  const bytesPerRow = Math.ceil(size[0] / 256) * 256
  const result = device.createTexture({
    label: path, size, dimension: '3d', format: 'r8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  })
  device.queue.writeTexture({ texture: result }, padded3dData(source, size), { bytesPerRow, rowsPerImage: size[1] }, size)
  return result
}

function volumeMipLayout(baseSize: number): readonly { level: number; size: number; offset: number; length: number }[] {
  const levels: { level: number; size: number; offset: number; length: number }[] = []
  let size = baseSize
  let offset = 0
  for (let level = 0; ; level += 1) {
    const length = size ** 3
    levels.push({ level, size, offset, length })
    offset += length
    if (size === 1) return levels
    size /= 2
  }
}

async function volumeMipTexture(device: GPUDevice, path: string, baseSize: number): Promise<GPUTexture> {
  const source = await fetchBytes(path)
  const layout = volumeMipLayout(baseSize)
  const expected = layout.at(-1)!.offset + 1
  if (source.byteLength !== expected) throw new Error(`3D mip chain expected ${expected} bytes, got ${source.byteLength}`)
  const result = device.createTexture({
    label: path, size: [baseSize, baseSize, baseSize], dimension: '3d', mipLevelCount: layout.length,
    format: 'r8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  })
  for (const mip of layout) {
    const bytes = source.subarray(mip.offset, mip.offset + mip.length)
    const bytesPerRow = Math.ceil(mip.size / 256) * 256
    device.queue.writeTexture(
      { texture: result, mipLevel: mip.level }, padded3dData(bytes, [mip.size, mip.size, mip.size]),
      { bytesPerRow, rowsPerImage: mip.size }, [mip.size, mip.size, mip.size],
    )
  }
  return result
}

export async function loadTakramCloudAssets(renderer: WebGPURenderer): Promise<TakramAssets> {
  const backend = renderer.backend as unknown as NativeBackend
  const device = backend.device
  if (device === undefined) throw new Error('Takram clouds require the native WebGPU backend')
  const textures = await Promise.all([
    imageTexture(device, `${CONTENT_ROOT}/local_weather.png`),
    volumeMipTexture(device, `${CONTENT_ROOT}/shape-average-mips.bin`, 128),
    volumeTexture(device, `${CONTENT_ROOT}/shape_detail.bin`, [32, 32, 32]),
    imageTexture(device, `${CONTENT_ROOT}/turbulence.png`),
    volumeTexture(device, `${CONTENT_ROOT}/stbn.bin`, [128, 128, 64]),
  ])
  return {
    device, weather: textures[0]!, shape: textures[1]!, detail: textures[2]!, turbulence: textures[3]!, stbn: textures[4]!,
    dispose(): void { textures.forEach(value => value.destroy()) },
  }
}

/** Per-frame multipliers on the march's day radiance constants (`cloudLight` in sky/night.ts is the source). */
export type CloudLightScale = { readonly sun: readonly [number, number, number]; readonly ambient: number }

export type TakramCloudPass = {
  readonly composite: Node<'vec4'>
  setResolutionScale(scale: number): void
  setUpdatePeriod(frames: 1 | 8 | 16): void
  setEye(eye: Vec3): void
  /** `light` scales the march's day radiance at night (night.ts `cloudLight`); omitted, or all 1, is the day look. The raw-WebGPU twin ignores it (a DEV comparison path, day only). */
  setEnvironment(timeS: number, sun: Vec3, coverage: number, baseM: number, light?: CloudLightScale): void
  resetHistory(): void
  historyResets(): number
  gpuTimesMs(): readonly number[]
  gpuPassTimesMs(): { readonly march: readonly number[]; readonly temporal: readonly number[] }
  captureGpuTimes(): void
  measureReprojectionResidual(): Promise<ReprojectionResidual | null>
  dispose(): void
}

const drawingBuffer = new Vector2()

class TakramCloudPassNode extends TempNode<'vec4'> {
  private readonly output = new RenderTarget(1, 1, { type: HalfFloatType, format: RGBAFormat, depthBuffer: false })
  private lowColour: GPUTexture | null = null
  private lowDepth: GPUTexture | null = null
  private histories: readonly [readonly [GPUTexture, GPUTexture], readonly [GPUTexture, GPUTexture]] | null = null
  private nativeOutput: GPUTexture | null = null
  private cloudPipeline: GPURenderPipeline
  private temporalPipeline: GPURenderPipeline
  private compositePipeline: GPURenderPipeline
  private cloudGroup: GPUBindGroup | null = null
  private boundFxColour: GPUTexture | null = null
  private boundFxDense: GPUTexture | null = null
  private sceneColorNative: GPUTexture | null = null
  private sceneDepthNative: GPUTexture | null = null
  private temporalGroups: readonly [GPUBindGroup, GPUBindGroup] | null = null
  private compositeGroups: readonly [GPUBindGroup, GPUBindGroup] | null = null
  private readonly repeatSampler: GPUSampler
  private readonly linearSampler: GPUSampler
  private readonly uniforms: GPUBuffer
  private readonly compositeUniforms: GPUBuffer
  private readonly querySet: GPUQuerySet | null
  private readonly queryResolve: GPUBuffer | null
  private readonly queryRead: GPUBuffer | null
  private queryPending = false
  private readonly nativeGpuTimes: number[] = []
  private width = 0
  private height = 0
  private current = 0
  private frameIndex = 0
  private resetPending = true
  private eye: Vec3 = { x: 0, y: 0, z: 0 }
  private timeS = 0
  private sun: Vec3 = { x: 0.42, y: 0.78, z: 0.46 }
  private coverage = 0.45
  private layerOffsetM = 0
  private readonly previousPosition = new Vector3()
  private readonly previousForward = new Vector3(0, 0, -1)
  private readonly previousRight = new Vector3(1, 0, 0)
  private readonly previousUp = new Vector3(0, 1, 0)
  resets = 0

  constructor(
    private readonly assets: TakramAssets,
    private readonly camera: PerspectiveCamera,
    private readonly sceneColor: TextureNode,
    private readonly sceneDepth: TextureNode,
    private readonly fxLimit: FxCloudLimit | null,
  ) {
    super('vec4')
    this.updateBeforeType = NodeUpdateType.FRAME
    const { device } = assets
    this.repeatSampler = device.createSampler({
      addressModeU: 'repeat', addressModeV: 'repeat', addressModeW: 'repeat',
      magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear',
    })
    this.linearSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' })
    this.uniforms = device.createBuffer({ size: 40 * Float32Array.BYTES_PER_ELEMENT, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.compositeUniforms = device.createBuffer({ size: 16 * Float32Array.BYTES_PER_ELEMENT, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    const timestamps = device.features.has('timestamp-query')
    this.querySet = timestamps ? device.createQuerySet({ type: 'timestamp', count: 2 }) : null
    this.queryResolve = timestamps ? device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }) : null
    this.queryRead = timestamps ? device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }) : null
    const module = (label: string, fragment: string): GPUShaderModule => device.createShaderModule({ label, code: shaderModuleSource(fragment) })
    const cloudModule = module('Takram game cloud march', takramGameCloudsFragment(fxLimit !== null))
    const temporalModule = module('Takram game temporal reconstruction', takramGameTemporalFragment)
    const compositeModule = module('Takram game cloud composite', takramGameCompositeFragment(fxLimit !== null))
    this.cloudPipeline = device.createRenderPipeline({
      label: 'Takram game cloud march', layout: 'auto', vertex: { module: cloudModule, entryPoint: 'vertexMain' },
      fragment: { module: cloudModule, entryPoint: 'fragmentMain', targets: [{ format: 'rgba16float' }, { format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list' },
    })
    this.temporalPipeline = device.createRenderPipeline({
      label: 'Takram game temporal reconstruction', layout: 'auto', vertex: { module: temporalModule, entryPoint: 'vertexMain' },
      fragment: { module: temporalModule, entryPoint: 'fragmentMain', targets: [{ format: 'rgba16float' }, { format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list' },
    })
    this.compositePipeline = device.createRenderPipeline({
      label: 'Takram game cloud composite', layout: 'auto', vertex: { module: compositeModule, entryPoint: 'vertexMain' },
      fragment: { module: compositeModule, entryPoint: 'fragmentMain', targets: [{ format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list' },
    })
    this.output.texture.name = 'takramCloudComposite'
    this.output.texture.minFilter = this.output.texture.magFilter = LinearFilter
  }

  private destroySizedTextures(): void {
    this.lowColour?.destroy()
    this.lowDepth?.destroy()
    this.histories?.forEach(pair => pair.forEach(value => value.destroy()))
    this.lowColour = this.lowDepth = null
    this.histories = null
    this.temporalGroups = null
    this.compositeGroups = null
    this.cloudGroup = null
    this.boundFxColour = this.boundFxDense = null
    this.sceneColorNative = this.sceneDepthNative = null
    this.nativeOutput = null
  }

  private resize(renderer: WebGPURenderer, width: number, height: number): void {
    if (this.width === width && this.height === height && this.histories !== null) return
    this.destroySizedTextures()
    this.width = width
    this.height = height
    const lowSize: GPUExtent3D = [Math.ceil(width / 2), Math.ceil(height / 3)]
    const make = (label: string, size: GPUExtent3D): GPUTexture => this.assets.device.createTexture({
      label, size, format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
    this.lowColour = make('Takram 1/6 cloud colour', lowSize)
    this.lowDepth = make('Takram 1/6 cloud depth', lowSize)
    this.histories = [0, 1].map(index => [make(`Takram cloud history ${index}`, [width, height]), make(`Takram depth history ${index}`, [width, height])] as const) as unknown as typeof this.histories
    this.output.setSize(width, height)
    renderer.initRenderTarget(this.output)
    const backend = renderer.backend as unknown as NativeBackend
    this.nativeOutput = backend.get(this.output.texture).texture ?? null
    const sceneColor = backend.get(passTexture(this.sceneColor, 'scene color')).texture
    const sceneDepth = backend.get(passTexture(this.sceneDepth, 'scene depth')).texture
    if (this.nativeOutput === null || sceneColor === undefined || sceneDepth === undefined) throw new Error('Takram clouds could not access Three render targets')
    this.sceneColorNative = sceneColor
    this.sceneDepthNative = sceneDepth
    this.refreshCloudGroup(renderer)
    this.temporalGroups = [0, 1].map(index => this.assets.device.createBindGroup({
      layout: this.temporalPipeline.getBindGroupLayout(0), entries: [
        { binding: 0, resource: { buffer: this.uniforms } }, { binding: 1, resource: this.linearSampler },
        { binding: 2, resource: this.lowColour!.createView() }, { binding: 3, resource: this.lowDepth!.createView() },
        { binding: 4, resource: this.histories![index]![0].createView() }, { binding: 5, resource: this.histories![index]![1].createView() },
      ],
    })) as [GPUBindGroup, GPUBindGroup]
    this.refreshCompositeGroups()
    this.current = 0
    this.resetPending = true
  }

  /** The FX targets are resized lazily when particles first appear. Rebind
   *  only when Three replaces their native textures; otherwise an idle boot
   *  would retain the original 1x1 resources after the first explosion. */
  private refreshCloudGroup(renderer: WebGPURenderer): void {
    let fxColour: GPUTexture | null = null, fxDense: GPUTexture | null = null
    const backend = renderer.backend as unknown as NativeBackend
    if (this.fxLimit !== null) {
      renderer.initRenderTarget(this.fxLimit.colorTarget)
      renderer.initRenderTarget(this.fxLimit.denseTarget)
      fxColour = backend.get(passTexture(this.fxLimit.colorTexture, 'FX colour')).texture ?? null
      fxDense = backend.get(passTexture(this.fxLimit.denseTexture, 'FX dense depth')).texture ?? null
      if (fxColour === null || fxDense === null) throw new Error('Takram clouds could not access FX render targets')
    }
    if (this.cloudGroup !== null && fxColour === this.boundFxColour && fxDense === this.boundFxDense) return
    const cloudEntries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: this.uniforms } }, { binding: 1, resource: this.repeatSampler },
      { binding: 2, resource: this.assets.weather.createView() }, { binding: 3, resource: this.assets.shape.createView() },
      { binding: 4, resource: this.assets.detail.createView() }, { binding: 5, resource: this.assets.turbulence.createView() },
      { binding: 6, resource: this.assets.stbn.createView() },
    ]
    if (fxColour !== null && fxDense !== null) {
      cloudEntries.push({ binding: 7, resource: fxColour.createView() }, { binding: 8, resource: fxDense.createView() })
    }
    this.cloudGroup = this.assets.device.createBindGroup({ layout: this.cloudPipeline.getBindGroupLayout(0), entries: cloudEntries })
    this.boundFxColour = fxColour
    this.boundFxDense = fxDense
    this.refreshCompositeGroups()
  }

  private refreshCompositeGroups(): void {
    if (this.histories === null || this.sceneColorNative === null || this.sceneDepthNative === null) return
    this.compositeGroups = [0, 1].map(index => {
      const entries: GPUBindGroupEntry[] = [
        { binding: 0, resource: { buffer: this.compositeUniforms } }, { binding: 1, resource: this.linearSampler },
        { binding: 2, resource: this.histories![index]![0].createView() }, { binding: 3, resource: this.histories![index]![1].createView() },
        { binding: 4, resource: this.sceneColorNative!.createView() }, { binding: 5, resource: this.sceneDepthNative!.createView() },
      ]
      if (this.boundFxColour !== null && this.boundFxDense !== null) {
        entries.push({ binding: 6, resource: this.boundFxColour.createView() }, { binding: 7, resource: this.boundFxDense.createView() })
      }
      return this.assets.device.createBindGroup({ layout: this.compositePipeline.getBindGroupLayout(0), entries })
    }) as [GPUBindGroup, GPUBindGroup]
  }

  setEye(value: Vec3): void { this.eye = value }
  gpuTimesMs(): readonly number[] { return this.nativeGpuTimes }
  setEnvironment(timeS: number, sun: Vec3, coverage: number, baseM: number): void {
    this.timeS = timeS
    this.sun = sun
    this.coverage = Math.max(0, Math.min(1, coverage))
    this.layerOffsetM = Number.isFinite(baseM) ? baseM - 750 : 0
  }
  resetHistory(): void { this.resetPending = true }

  override updateBefore(frame: NodeFrame): undefined {
    const renderer = frame.renderer as unknown as WebGPURenderer
    const { x: width, y: height } = renderer.getDrawingBufferSize(drawingBuffer)
    this.resize(renderer, width, height)
    this.refreshCloudGroup(renderer)
    const cameraForward = new Vector3(0, 0, -1).transformDirection(this.camera.matrixWorld)
    const cameraRight = new Vector3(1, 0, 0).transformDirection(this.camera.matrixWorld)
    const cameraUp = new Vector3(0, 1, 0).transformDirection(this.camera.matrixWorld)
    const fov = Math.tan(this.camera.fov * Math.PI / 360)
    const values = new Float32Array(40)
    const set = (offset: number, value: Vec3, w: number): void => { values.set([value.x, value.y, value.z, w], offset) }
    values.set([width, height, this.frameIndex, this.timeS], 0)
    set(4, this.eye, this.coverage)
    set(8, cameraForward, fov)
    set(12, cameraRight, width / height)
    set(16, cameraUp, this.timeS)
    set(20, this.sun, this.layerOffsetM)
    set(24, this.previousPosition, this.resetPending ? 0 : 1)
    set(28, this.previousForward, fov)
    set(32, this.previousRight, width / height)
    set(36, this.previousUp, this.fxLimit?.active() === true ? this.fxLimit.span() : 0)
    this.assets.device.queue.writeBuffer(this.uniforms, 0, values)
    const compositeValues = new Float32Array(16)
    compositeValues.set([width, height, this.camera.near, this.camera.far], 0)
    compositeValues.set([cameraForward.x, cameraForward.y, cameraForward.z, fov], 4)
    compositeValues.set([cameraRight.x, cameraRight.y, cameraRight.z, width / height], 8)
    compositeValues.set([cameraUp.x, cameraUp.y, cameraUp.z, this.fxLimit?.active() === true ? this.fxLimit.span() : 0], 12)
    this.assets.device.queue.writeBuffer(this.compositeUniforms, 0, compositeValues)
    const next = 1 - this.current
    const encoder = this.assets.device.createCommandEncoder({ label: 'Takram game cloud frame' })
    const measure = this.querySet !== null && this.queryResolve !== null && this.queryRead !== null && !this.queryPending
    const cloud = encoder.beginRenderPass({ colorAttachments: [
      { view: this.lowColour!.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } },
      { view: this.lowDepth!.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 1, g: 0, b: 0, a: 1 } },
    ], ...(measure ? { timestampWrites: { querySet: this.querySet!, beginningOfPassWriteIndex: 0 } } : {}) })
    cloud.setPipeline(this.cloudPipeline); cloud.setBindGroup(0, this.cloudGroup!); cloud.draw(3); cloud.end()
    const temporal = encoder.beginRenderPass({ colorAttachments: [
      { view: this.histories![next]![0].createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } },
      { view: this.histories![next]![1].createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 1, g: 0, b: 0, a: 1 } },
    ] })
    temporal.setPipeline(this.temporalPipeline); temporal.setBindGroup(0, this.temporalGroups![this.current]!); temporal.draw(3); temporal.end()
    const composite = encoder.beginRenderPass({ colorAttachments: [
      { view: this.nativeOutput!.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } },
    ], ...(measure ? { timestampWrites: { querySet: this.querySet!, endOfPassWriteIndex: 1 } } : {}) })
    composite.setPipeline(this.compositePipeline); composite.setBindGroup(0, this.compositeGroups![next]!); composite.draw(3); composite.end()
    if (measure) {
      encoder.resolveQuerySet(this.querySet!, 0, 2, this.queryResolve!, 0)
      encoder.copyBufferToBuffer(this.queryResolve!, 0, this.queryRead!, 0, 16)
      this.queryPending = true
    }
    this.assets.device.queue.submit([encoder.finish()])
    if (measure) {
      void this.queryRead!.mapAsync(GPUMapMode.READ).then(() => {
        const times = new BigUint64Array(this.queryRead!.getMappedRange())
        this.nativeGpuTimes.push(Number(times[1]! - times[0]!) / 1e6)
        if (this.nativeGpuTimes.length > 4096) this.nativeGpuTimes.shift()
        this.queryRead!.unmap()
      }).finally(() => { this.queryPending = false })
    }
    if (this.resetPending) this.resets += 1
    this.previousPosition.set(this.eye.x, this.eye.y, this.eye.z)
    this.previousForward.copy(cameraForward)
    this.previousRight.copy(cameraRight)
    this.previousUp.copy(cameraUp)
    this.current = next
    this.frameIndex += 1
    this.resetPending = false
    return undefined
  }

  override setup(_builder: NodeBuilder): Node<'vec4'> {
    // The zero-valued dependency keeps the scene pass in the graph and makes
    // this sequential node run after it, even though native WGSL samples the
    // scene texture outside TSL's dependency analysis.
    return texture(this.output.texture).add(vec4(this.sceneColor).mul(0)) as unknown as Node<'vec4'>
  }

  override dispose(): void {
    super.dispose()
    this.destroySizedTextures()
    this.output.dispose()
    this.uniforms.destroy()
    this.compositeUniforms.destroy()
    this.querySet?.destroy()
    this.queryResolve?.destroy()
    this.queryRead?.destroy()
    this.assets.dispose()
  }
}

export function createTakramCloudPass(options: {
  renderer: WebGPURenderer
  assets: TakramAssets
  camera: PerspectiveCamera
  sceneColor: Node<'vec4'>
  sceneDepth: Node<'float'>
  fxLimit?: FxCloudLimit | null
}): TakramCloudPass {
  const node = new TakramCloudPassNode(
    options.assets, options.camera, convertToTexture(options.sceneColor) as unknown as TextureNode, options.sceneDepth as unknown as TextureNode,
    options.fxLimit ?? null,
  )
  return {
    composite: node as unknown as Node<'vec4'>,
    setResolutionScale() {},
    setUpdatePeriod() {},
    setEye(value) { node.setEye(value) },
    setEnvironment(timeS, sun, coverage, baseM) { node.setEnvironment(timeS, sun, coverage, baseM) },
    resetHistory() { node.resetHistory() },
    historyResets() { return node.resets },
    gpuTimesMs() { return node.gpuTimesMs() },
    gpuPassTimesMs() { return { march: [], temporal: [] } },
    captureGpuTimes() {},
    measureReprojectionResidual() { return Promise.resolve(null) },
    dispose() { node.dispose() },
  }
}
