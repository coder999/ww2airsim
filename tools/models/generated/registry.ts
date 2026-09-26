// tools/models/generated/registry.ts
import type { Document } from '@gltf-transform/core'
import { generateAnM65 } from './an-m65.js'

/** Builds one generated model's document (O1). Deterministic: the same code and pinned
 *  texture cache give the same bytes. */
export type Generator = () => Promise<Document>

/** Every generator, keyed by the path a manifest entry's `source.generator` names.
 *  tests/tools/models/generatedModels.test.ts checks the keys against the entries. */
export const GENERATORS: Readonly<Record<string, Generator>> = {
  'tools/models/generated/an-m65.ts': generateAnM65,
}
