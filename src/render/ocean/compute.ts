import { FloatType, NearestFilter, type Texture } from 'three'
import { StorageTexture, type WebGPURenderer } from 'three/webgpu'
import { OCEAN_PHASE_SEED, stationarySpectrum, type ReferenceOptions } from './reference.js'
import { deriveKernelSource, evolveKernelSource, fftKernelSource } from './wgsl.js'

export type OceanComputeOptions = Omit<ReferenceOptions, 'timeS'>
export type OceanCompute = {
  readonly displacement: Texture
  readonly normal: Texture
  readonly foam: Texture
  readonly phaseSeed: number
  readonly options: OceanComputeOptions
  dispatch(timeS: number): void
  readDisplacement(component?: 'height' | 'x' | 'z'): Promise<{ timeS: number; values: Float32Array }>
  dispose(): void
}

/** Isolate the Three 0.186 native-device bridge here. Verified against its
 * WebGPUTextureUtils: initTexture allocates a StorageTexture and backend.get
 * exposes that SAME GPUTexture. Material reads and native compute writes
 * therefore share resources and queue order; no CPU texture copy per frame.
 *
 * The day-0 working fallback used createComputePipeline on this device, not
 * wgslFn. Full WGSL modules need binding and workgroup-scope declarations;
 * wgslFn is a function wrapper. This follows the measured raw-device path.
 */
export async function createOceanCompute(renderer: WebGPURenderer, options: OceanComputeOptions): Promise<OceanCompute> {
  const backend = renderer.backend as unknown as {
    device?: GPUDevice
    get(texture: Texture): { texture?: GPUTexture }
  }
  const device = backend.device
  if (!device) throw new Error('ocean compute requires the native WebGPU backend')
  const fftSource = fftKernelSource(options.n)
  const spectrum = stationarySpectrum({ ...options, timeS: 0 })
  const n = options.n
  const count = n*n
  const buffers: GPUBuffer[] = []
  const textures: StorageTexture[] = []
  const buffer = (size: number, usage: number): GPUBuffer => {
    const out = device.createBuffer({ size, usage })
    buffers.push(out)
    return out
  }
  const texture = (): { texture: StorageTexture; view: GPUTextureView; gpu: GPUTexture } => {
    const tex = new StorageTexture(n,n)
    tex.type = FloatType
    tex.minFilter = tex.magFilter = NearestFilter
    tex.generateMipmaps = false
    textures.push(tex)
    renderer.initTexture(tex)
    const gpu = backend.get(tex).texture
    if (!gpu) throw new Error('ocean: storage texture was not allocated')
    return { texture: tex, view: gpu.createView(), gpu }
  }
  const dispose = (): void => { buffers.forEach((b) => b.destroy()); textures.forEach((t) => t.dispose()) }
  try {
    const initial = buffer(count*16, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST)
    const data = new Float32Array(count*4)
    for (let i=0;i<count;i++) data.set([spectrum.re[i]!,spectrum.im[i]!,spectrum.kx[i]!,spectrum.kz[i]!],i*4)
    device.queue.writeBuffer(initial,0,data)
    const transformed = buffer(count*8*3, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC)
    const scratch = buffer(count*8*3, GPUBufferUsage.STORAGE)
    const history = buffer(count*4, GPUBufferUsage.STORAGE)
    const params = buffer(16,GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)
    const axes = [0,1].map((axis) => {
      const b = buffer(16,GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)
      device.queue.writeBuffer(b,0,new Uint32Array([axis,n,0,0]))
      return b
    })
    const displacement = texture(), normal = texture(), foam = texture()
    const pipeline = async (code: string): Promise<GPUComputePipeline> => device.createComputePipelineAsync({
      layout:'auto', compute:{ module: device.createShaderModule({code}), entryPoint:'main' },
    })
    const [evolve, fft, derive] = await Promise.all([pipeline(evolveKernelSource()),pipeline(fftSource),pipeline(deriveKernelSource())])
    const bindings = (p: GPUComputePipeline, resources: GPUBindingResource[]): GPUBindGroup => device.createBindGroup({
      layout:p.getBindGroupLayout(0), entries:resources.map((resource,binding)=>({binding,resource})),
    })
    const evolveBind = bindings(evolve,[{buffer:initial},{buffer:transformed},{buffer:params}])
    const rowBind = bindings(fft,[{buffer:transformed},{buffer:scratch},{buffer:axes[0]!}])
    const colBind = bindings(fft,[{buffer:scratch},{buffer:transformed},{buffer:axes[1]!}])
    const deriveBind = bindings(derive,[{buffer:transformed},displacement.view,normal.view,foam.view,{buffer:history},{buffer:params}])
    let lastTime: number | undefined
    return {
      options, phaseSeed: (OCEAN_PHASE_SEED ^ options.cascade) >>> 0,
      displacement:displacement.texture, normal:normal.texture, foam:foam.texture,
      dispatch(timeS): void {
        if (!Number.isFinite(timeS) || timeS < 0) throw new Error('ocean: time must be finite and nonnegative')
        const dt = lastTime === undefined ? 0 : Math.max(0,timeS-lastTime)
        const bytes = new ArrayBuffer(16), view = new DataView(bytes)
        view.setUint32(0,n,true);view.setFloat32(4,options.patchM,true)
        view.setFloat32(8,timeS,true);view.setFloat32(12,dt,true)
        device.queue.writeBuffer(params,0,bytes)
        const encoder = device.createCommandEncoder()
        const pass = encoder.beginComputePass()
        pass.setPipeline(evolve);pass.setBindGroup(0,evolveBind);pass.dispatchWorkgroups(Math.ceil(count/64))
        pass.setPipeline(fft);pass.setBindGroup(0,rowBind);pass.dispatchWorkgroups(n,3)
        pass.setBindGroup(0,colBind);pass.dispatchWorkgroups(n,3)
        pass.setPipeline(derive);pass.setBindGroup(0,deriveBind);pass.dispatchWorkgroups(Math.ceil(n/8),Math.ceil(n/8))
        pass.end();device.queue.submit([encoder.finish()])
        lastTime=timeS
      },
      async readDisplacement(component = 'height') {
        if (lastTime===undefined) throw new Error('ocean: dispatch before readback')
        const timeS=lastTime
        const rowBytes = Math.ceil(n * 16 / 256) * 256
        const read = device.createBuffer({size:rowBytes*n,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST})
        try {
          const encoder=device.createCommandEncoder()
          encoder.copyTextureToBuffer({texture:displacement.gpu},{buffer:read,bytesPerRow:rowBytes},{width:n,height:n})
          device.queue.submit([encoder.finish()])
          await read.mapAsync(GPUMapMode.READ)
          const pixels=new Float32Array(read.getMappedRange())
          const channel = component === 'height' ? 1 : component === 'x' ? 0 : 2
          const values=Float32Array.from({length:count},(_,i)=>pixels[Math.floor(i/n)*rowBytes/4+(i%n)*4+channel]!)
          read.unmap()
          return {timeS,values}
        } finally {read.destroy()}
      },
      dispose,
    }
  } catch (error) {dispose();throw error}
}
