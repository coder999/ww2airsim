// tools/fx/png16.ts
/**
 * Reads a 16-bit-per-channel RGBA PNG (what Blender's Cycles writes) into per-texel
 * luminance and straight alpha, resized to cellPx with sharp/libvips.
 *
 * Trap (found in this session, tests/tools/fxPng16.test.ts pins it): sharp's
 * `.raw({ depth: 'ushort' })` alone does NOT widen a 16-bit source to its full 0..65535
 * range on this machine — it silently returns values scaled as if the source were 8-bit
 * (max ~255), so `/ 65535` collapses every alpha near 0 and nothing reads as covered.
 * `.toColourspace('rgb16')` before the read forces libvips to keep (not re-quantize) the
 * 16-bit samples; verified byte-exact against a hand-decoded PNG (no ICC/gamma shift).
 */
import sharp from 'sharp'

// The explicit <ArrayBuffer> matters: through Promise/Awaited, a bare `Float32Array` return
// type loses its default type argument and widens to Float32Array<ArrayBufferLike>, which a
// `let x = new Float32Array(n)` elsewhere (concretely <ArrayBuffer>) then refuses to accept.
export async function read16(file: string, cellPx: number): Promise<{ lum: Float32Array<ArrayBuffer>; alpha: Float32Array<ArrayBuffer> }> {
  // sharp premultiplies around the resize, so straight alpha stays straight.
  const { data } = await sharp(file)
    .toColourspace('rgb16')
    .resize(cellPx, cellPx, { kernel: 'lanczos3' })
    .ensureAlpha()
    .raw({ depth: 'ushort' })
    .toBuffer({ resolveWithObject: true })
  // Buffer.readUInt16LE handles any offset/alignment directly, so there is no need to
  // alias data.buffer as a Uint16Array (which is also where a stray SharedArrayBuffer
  // or misaligned offset would bite).
  const n = cellPx * cellPx, lum = new Float32Array(n), alpha = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const r = data.readUInt16LE(i * 8), g = data.readUInt16LE(i * 8 + 2), b = data.readUInt16LE(i * 8 + 4), a = data.readUInt16LE(i * 8 + 6)
    lum[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 65535
    alpha[i] = a / 65535
  }
  return { lum, alpha }
}
