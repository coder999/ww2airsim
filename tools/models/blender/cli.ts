// tools/models/blender/cli.ts
/**
 * `npx tsx tools/models/blender/cli.ts <id> [--key value ...]` builds
 * tools/models/blender/<id>.py into the gitignored content/models/candidates/<id>.glb
 * and prints what it measured. For iterating on a candidate. A shipped model builds
 * through `npm run models:build` as a `blender` entry (R1, model-roster spec §4.1).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runBlenderScript } from './run.js'
import { modelIO } from '../document.js'
import { inspectDocument } from '../inspect.js'

const RESERVED = new Set(['kit', 'preview'])

export function blenderScriptFor(id: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`model id "${id}" must match [a-z0-9][a-z0-9-]*`)
  if (RESERVED.has(id)) throw new Error(`"${id}" is reserved: it is a kit module, not a model`)
  return `tools/models/blender/${id}.py`
}

export function candidateOutput(id: string): string {
  return `content/models/candidates/${id}.glb`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [id, ...args] = process.argv.slice(2)
  if (!id) {
    console.error('usage: npx tsx tools/models/blender/cli.ts <id> [--key value ...]')
    process.exit(2)
  }
  const out = candidateOutput(id)
  runBlenderScript(blenderScriptFor(id), out, args)
  const doc = await modelIO().readBinary(new Uint8Array(readFileSync(out)))
  console.log(inspectDocument(doc, out))
}
