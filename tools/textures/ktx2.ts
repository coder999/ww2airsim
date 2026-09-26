/** The fields of a KTX2 header and its basic data format descriptor that the
 *  terrain textures' tests and build self-check assert on. KTX2 spec §3. */
export type Ktx2Header = {
  readonly vkFormat: number; readonly pixelWidth: number; readonly pixelHeight: number
  readonly layerCount: number; readonly faceCount: number; readonly levelCount: number
  readonly supercompressionScheme: number
  /** DFD colorModel: 163 ETC1S, 166 UASTC. */
  readonly colorModel: number
  /** DFD transferFunction: 1 linear, 2 sRGB. */
  readonly transferFunction: number
}

const IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]

export function readKtx2Header(b: Uint8Array): Ktx2Header {
  if (b.length < 80 || IDENTIFIER.some((v, i) => b[i] !== v)) throw new Error('not a KTX2 file')
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const u32 = (o: number): number => v.getUint32(o, true)
  const dfd = u32(48) // dataFormatDescriptor.byteOffset
  // DFD: uint32 dfdTotalSize, then the basic block: word0 vendor/type, word1
  // version/size, word2 = colorModel | primaries << 8 | transfer << 16 | flags << 24.
  return {
    vkFormat: u32(12), pixelWidth: u32(20), pixelHeight: u32(24),
    layerCount: u32(32), faceCount: u32(36), levelCount: u32(40), supercompressionScheme: u32(44),
    colorModel: b[dfd + 12]!, transferFunction: b[dfd + 14]!,
  }
}
