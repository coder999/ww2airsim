export type JsonValue = null | boolean | number | string | JsonValue[] | { readonly [key: string]: JsonValue }

const canonicalValue = (value: unknown, inArray = false): JsonValue | undefined => {
  if (value === undefined) return inArray ? null : undefined
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('flight record contains a non-finite number')
    return Object.is(value, -0) ? 0 : value
  }
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
    throw new Error(`flight record contains unsupported ${typeof value}`)
  }
  if (Array.isArray(value)) return value.map((entry) => canonicalValue(entry, true) ?? null)
  if (value instanceof Set) {
    const entries = [...value].map((entry) => canonicalValue(entry, true) ?? null)
    return entries.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  }
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>)
  if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value))
  if (typeof value === 'object') {
    const output: Record<string, JsonValue> = {}
    for (const key of Object.keys(value as object).sort()) {
      const entry = canonicalValue((value as Record<string, unknown>)[key])
      if (entry !== undefined) output[key] = entry
    }
    return output
  }
  throw new Error(`flight record contains unsupported ${typeof value}`)
}

export function canonicalize(value: unknown): JsonValue {
  return canonicalValue(value) ?? null
}

export const canonicalStringify = (value: unknown): string => JSON.stringify(canonicalize(value))

/** A small synchronous diagnostic hash for once-per-second world checksums. */
export function fnv1a64(text: string): string {
  let hash = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte)
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, '0')
}

export async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalStringify(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

