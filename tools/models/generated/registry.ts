// tools/models/generated/registry.ts
import type { Document } from '@gltf-transform/core'
import { generateAnM65 } from './an-m65.js'
import { generateHvar } from './hvar.js'
import { generateMk13 } from './mk13.js'
import { generateType91 } from './type91.js'
import { generateType98No25 } from './type98-no25.js'

/** Builds one generated model's document (O1). Deterministic: the same code and pinned
 *  texture cache give the same bytes. */
export type Generator = () => Promise<Document>

/** Every generator, keyed by the path a manifest entry's `source.generator` names.
 *  tests/tools/models/generatedModels.test.ts checks the keys against the entries. */
export const GENERATORS: Readonly<Record<string, Generator>> = {
  'tools/models/generated/an-m65.ts': generateAnM65,
  'tools/models/generated/hvar.ts': generateHvar,
  'tools/models/generated/mk13.ts': generateMk13,
  'tools/models/generated/type91.ts': generateType91,
  'tools/models/generated/type98-no25.ts': generateType98No25,
}
