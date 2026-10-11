import {
  Data3DTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RGBAFormat,
  RepeatWrapping, TextureLoader, UnsignedByteType, type Texture,
} from 'three'
import type { WebGPURenderer } from 'three/webgpu'

const CONTENT_ROOT = '/content/clouds/takram'

type NativeBackend = {
  device?: GPUDevice
  get(texture: Texture): { texture?: GPUTexture }
}

export type TakramTslAssets = {
  readonly weather: Texture
  readonly shape: Data3DTexture
  readonly detail: Data3DTexture
  readonly turbulence: Texture
  readonly stbn: Data3DTexture
  dispose(): void
}

type VolumeMip = { readonly level: number; readonly size: number; readonly offset: number; readonly length: number }

export function volumeMipLayout(baseSize: number): readonly VolumeMip[] {
  if (!Number.isInteger(baseSize) || baseSize < 1 || (baseSize & (baseSize - 1)) !== 0) {
    throw new Error(`Takram TSL volume size must be a positive power of two, got ${baseSize}`)
  }
  const levels: VolumeMip[] = []
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

async function fetchBytes(path: string): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

function rgbaFromRed(source: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(source.byteLength * 4)
  for (let i = 0; i < source.byteLength; i += 1) {
    const at = i * 4
    result[at] = source[i]!
    result[at + 3] = 255
  }
  return result
}

function volume(source: Uint8Array<ArrayBuffer>, size: readonly [number, number, number], name: string): Data3DTexture {
  const expected = size[0] * size[1] * size[2]
  if (source.byteLength !== expected) throw new Error(`${name}: expected ${expected} bytes, got ${source.byteLength}`)
  const texture = new Data3DTexture(rgbaFromRed(source), ...size)
  texture.name = name
  texture.format = RGBAFormat
  texture.type = UnsignedByteType
  texture.colorSpace = NoColorSpace
  texture.wrapS = texture.wrapT = texture.wrapR = RepeatWrapping
  texture.minFilter = texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  texture.unpackAlignment = 1
  texture.needsUpdate = true
  return texture
}

function paddedRgba(source: Uint8Array<ArrayBuffer>, size: number): { readonly data: Uint8Array<ArrayBuffer>; readonly bytesPerRow: number } {
  const rgba = rgbaFromRed(source)
  const rowBytes = size * 4
  const bytesPerRow = Math.ceil(rowBytes / 256) * 256
  if (bytesPerRow === rowBytes) return { data: rgba, bytesPerRow }
  const result = new Uint8Array(bytesPerRow * size * size)
  for (let z = 0; z < size; z += 1) {
    for (let y = 0; y < size; y += 1) {
      const sourceOffset = rowBytes * (y + size * z)
      result.set(rgba.subarray(sourceOffset, sourceOffset + rowBytes), bytesPerRow * (y + size * z))
    }
  }
  return { data: result, bytesPerRow }
}

function shapeTexture(renderer: WebGPURenderer, source: Uint8Array<ArrayBuffer>, baseSize: number): Data3DTexture {
  const layout = volumeMipLayout(baseSize)
  const expected = layout.at(-1)!.offset + 1
  if (source.byteLength !== expected) throw new Error(`Takram TSL shape mip chain expected ${expected} bytes, got ${source.byteLength}`)
  const base = source.subarray(0, layout[0]!.length)
  const texture = volume(base, [baseSize, baseSize, baseSize], 'Takram TSL averaged shape')
  texture.minFilter = LinearMipmapLinearFilter
  // Three r186 allocates a mip level for every entry, but does not upload a
  // Data3DTexture's custom mip array. Allocate through Three so TSL owns the
  // binding, then fill the accepted averaged levels through the same backend.
  texture.mipmaps = layout.map(mip => ({ data: new Uint8Array(4), width: mip.size, height: mip.size, depth: mip.size }))
  renderer.initTexture(texture)
  const backend = renderer.backend as unknown as NativeBackend
  const device = backend.device
  const native = backend.get(texture).texture
  if (device === undefined || native === undefined) throw new Error('Takram TSL shape texture requires the native WebGPU backend')
  for (const mip of layout) {
    const bytes = source.subarray(mip.offset, mip.offset + mip.length)
    const padded = paddedRgba(bytes, mip.size)
    device.queue.writeTexture(
      { texture: native, mipLevel: mip.level }, padded.data,
      { bytesPerRow: padded.bytesPerRow, rowsPerImage: mip.size },
      [mip.size, mip.size, mip.size],
    )
  }
  return texture
}

async function image(path: string): Promise<Texture> {
  const texture = await new TextureLoader().loadAsync(path)
  texture.name = path
  texture.colorSpace = NoColorSpace
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

export async function loadTakramTslAssets(renderer: WebGPURenderer): Promise<TakramTslAssets> {
  const [weather, shapeBytes, detailBytes, turbulence, stbnBytes] = await Promise.all([
    image(`${CONTENT_ROOT}/local_weather.png`),
    fetchBytes(`${CONTENT_ROOT}/shape-average-mips.bin`),
    fetchBytes(`${CONTENT_ROOT}/shape_detail.bin`),
    image(`${CONTENT_ROOT}/turbulence.png`),
    fetchBytes(`${CONTENT_ROOT}/stbn.bin`),
  ])
  const shape = shapeTexture(renderer, shapeBytes, 128)
  const detail = volume(detailBytes, [32, 32, 32], 'Takram TSL shape detail')
  const stbn = volume(stbnBytes, [128, 128, 64], 'Takram TSL STBN')
  return {
    weather, shape, detail, turbulence, stbn,
    dispose(): void { weather.dispose(); shape.dispose(); detail.dispose(); turbulence.dispose(); stbn.dispose() },
  }
}
