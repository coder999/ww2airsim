import { crc32, deflateSync } from 'node:zlib'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { read16 } from '../../tools/fx/png16.js'

/** A minimal, dependency-free 16-bit RGBA PNG encoder for test fixtures. sharp can only write
 *  16-bit PNGs through a colour-managed conversion that was measured (this session) to distort
 *  the sample values, so it cannot generate its own ground truth; this writer bypasses sharp and
 *  libvips entirely; there is nothing left to trust but the PNG spec (uncompressed scanlines with
 *  filter type 0, big-endian samples, deflated). */
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}
function writePng16(path: string, width: number, height: number, pixels: Uint16Array): void {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 16; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0 // 16-bit, RGBA, no interlace
  const stride = width * 4 * 2
  const raw = Buffer.alloc(height * (1 + stride))
  let o = 0
  for (let y = 0; y < height; y++) {
    raw[o++] = 0 // filter type: none
    for (let x = 0; x < width; x++) for (let c = 0; c < 4; c++) { raw.writeUInt16BE(pixels[(y * width + x) * 4 + c]!, o); o += 2 }
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  writeFileSync(path, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
}

const dir = mkdtempSync(join(tmpdir(), 'fx-png16-'))
afterAll(() => { /* gitignored tmp dir; leaving it costs nothing the OS doesn't already reclaim */ })

describe('png16.read16 (regression: sharp raw ushort silently returning 8-bit-scaled values)', () => {
  it('decodes every 16-bit channel at full precision, without resizing', async () => {
    const file = join(dir, 'exact.png')
    // pixel 0: alpha 0.5, a ~0.1 lum-weighted channel, and a value at the 16-bit low byte
    // (0x1234 = 4660) that an 8-bit-only read would round to 0x12** and get wrong.
    const px = new Uint16Array(2 * 2 * 4)
    px.set([6554, 6554, 6554, 32768], 0) // lum ~0.1 on every color channel, alpha 0.5
    px.set([4660, 0, 0, 65535], 4) // 0x1234: only distinguishable at full 16-bit depth
    px.set([6554, 6554, 6554, 32768], 8)
    px.set([4660, 0, 0, 65535], 12)
    writePng16(file, 2, 2, px)

    const { lum, alpha } = await read16(file, 2)
    expect(alpha[0]).toBeCloseTo(32768 / 65535, 3)
    expect(lum[0]).toBeCloseTo(6554 / 65535, 3) // R=G=B, so luminance equals the shared value
    expect(alpha[1]).toBeCloseTo(1, 3)
    expect(lum[1]).toBeCloseTo(0.2126 * (4660 / 65535), 4) // only the R channel is lit
    // the regression this test pins: a buggy reader divides an already-8-bit-scaled sample by
    // 65535, so every value collapses toward 0 -- nothing here would be anywhere close to 0.5 or 1.
    expect(alpha[0]).toBeGreaterThan(0.1)
    expect(alpha[1]).toBeGreaterThan(0.9)
  })

  it('preserves a flat field alpha and luminance through the resize path bake.ts uses', async () => {
    const file = join(dir, 'flat.png')
    const w = 8
    const px = new Uint16Array(w * w * 4)
    for (let i = 0; i < w * w; i++) px.set([6554, 32768, 45875, 32768], i * 4) // R 0.1, G 0.5, B 0.7, A 0.5
    writePng16(file, w, w, px)

    const { lum, alpha } = await read16(file, 4) // downsampled 8x8 -> 4x4
    const expectedLum = (0.2126 * 6554 + 0.7152 * 32768 + 0.0722 * 45875) / 65535
    for (let i = 0; i < lum.length; i++) {
      expect(alpha[i]).toBeCloseTo(0.5, 3)
      expect(lum[i]).toBeCloseTo(expectedLum, 3)
    }
  })
})
