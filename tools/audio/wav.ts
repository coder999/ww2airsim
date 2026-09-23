import { readFileSync, writeFileSync } from 'node:fs'

/**
 * A minimal RIFF/WAVE reader for CHECKING committed files, not a general
 * decoder: it accepts uncompressed 16-bit PCM and throws on anything else.
 *
 * It walks the chunk list rather than assuming `data` begins at offset 36.
 * The six committed clips carry `LIST` and `XMP ` chunks (the Adobe C2PA
 * provenance manifest recorded in `content/audio/NOTICE.md` lives in the
 * latter), so a reader that trusted the canonical layout would hand back
 * metadata bytes as audio and every peak measured from it would be fiction.
 */
export type Wav = {
  readonly sampleRate: number
  readonly channels: number
  readonly frames: number
  /** Interleaved 16-bit PCM, channel-major within each frame. */
  readonly samples: Int16Array
}

export function readWav(path: string): Wav {
  const buf = readFileSync(path)
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${path}: not a RIFF/WAVE file`)
  }

  let sampleRate = 0
  let channels = 0
  let dataStart = -1
  let dataLength = 0

  // RIFF chunks are word-aligned: an odd-sized chunk is followed by a pad
  // byte that is NOT counted in its size field. Skipping that pad is what
  // keeps the walk in step once a metadata chunk has an odd length.
  let offset = 12
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4)
    const size = buf.readUInt32LE(offset + 4)
    const body = offset + 8
    if (id === 'fmt ') {
      const formatTag = buf.readUInt16LE(body)
      const bitsPerSample = buf.readUInt16LE(body + 14)
      if (formatTag !== 1) throw new Error(`${path}: format tag ${formatTag}, expected 1 (uncompressed PCM)`)
      if (bitsPerSample !== 16) throw new Error(`${path}: ${bitsPerSample}-bit, expected 16`)
      channels = buf.readUInt16LE(body + 2)
      sampleRate = buf.readUInt32LE(body + 4)
    } else if (id === 'data') {
      dataStart = body
      dataLength = Math.min(size, buf.length - body)
    }
    offset = body + size + (size % 2)
  }

  if (channels === 0 || sampleRate === 0) throw new Error(`${path}: no fmt chunk`)
  if (dataStart < 0) throw new Error(`${path}: no data chunk`)

  const samples = new Int16Array(Math.floor(dataLength / 2))
  for (let i = 0; i < samples.length; i++) samples[i] = buf.readInt16LE(dataStart + i * 2)
  return { sampleRate, channels, frames: Math.floor(samples.length / channels), samples }
}

/**
 * The write side of `readWav`, for CODE-GENERATED clips only (see
 * `tools/audio/synthesizeRocketWhoosh.ts`): a minimal 44-byte-header
 * RIFF/WAVE, uncompressed 16-bit PCM, `fmt ` then `data` and nothing else --
 * no `LIST`/`XMP ` chunks, because a synthesized file carries no Adobe C2PA
 * provenance manifest to store. `readWav`'s chunk walk does not assume that
 * layout, so it reads this format back exactly as it reads the six
 * Firefly-sourced files that DO carry those extra chunks.
 */
export function writeWav(path: string, samples: Int16Array, sampleRate: number, channels: number): void {
  const dataLength = samples.length * 2
  const buf = Buffer.alloc(44 + dataLength)
  buf.write('RIFF', 0, 'ascii')
  buf.writeUInt32LE(36 + dataLength, 4)
  buf.write('WAVE', 8, 'ascii')
  buf.write('fmt ', 12, 'ascii')
  buf.writeUInt32LE(16, 16) // fmt chunk size
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(channels, 22)
  buf.writeUInt32LE(sampleRate, 24)
  const blockAlign = channels * 2
  buf.writeUInt32LE(sampleRate * blockAlign, 28) // byte rate
  buf.writeUInt16LE(blockAlign, 32)
  buf.writeUInt16LE(16, 34) // bits per sample
  buf.write('data', 36, 'ascii')
  buf.writeUInt32LE(dataLength, 40)
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(samples[i]!, 44 + i * 2)
  writeFileSync(path, buf)
}
