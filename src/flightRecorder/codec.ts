import { canonicalStringify } from './canonical.js'
import { parseFlightRecord, type FlightRecordV1 } from './schema.js'

type ByteTransform = {
  readonly writable: WritableStream<BufferSource>
  readonly readable: ReadableStream<Uint8Array>
}

const transformed = async (bytes: Uint8Array, stream: ByteTransform): Promise<Uint8Array> => {
  // Drain while writing. Waiting for writer.close() before touching readable
  // can deadlock once the transform's internal queue applies backpressure.
  const output = new Response(stream.readable).arrayBuffer()
  const writer = stream.writable.getWriter()
  // Node's CompressionStream rejects a bare ArrayBuffer while browsers accept
  // either BufferSource form; the bytes are a concrete Uint8Array at runtime.
  await writer.write(bytes as unknown as BufferSource)
  await writer.close()
  return new Uint8Array(await output)
}

export async function encodeFlightRecord(record: FlightRecordV1): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(canonicalStringify(parseFlightRecord(record)))
  return transformed(bytes, new CompressionStream('gzip'))
}

export async function decodeFlightRecord(bytes: Uint8Array): Promise<FlightRecordV1> {
  let inflated: Uint8Array
  try {
    inflated = await transformed(bytes, new DecompressionStream('gzip'))
  } catch (error) {
    throw new Error(`Invalid .ww2flight record: gzip decompression failed (${error instanceof Error ? error.message : String(error)})`)
  }
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(inflated))
  } catch (error) {
    throw new Error(`Invalid .ww2flight record: JSON decoding failed (${error instanceof Error ? error.message : String(error)})`)
  }
  return parseFlightRecord(value)
}

