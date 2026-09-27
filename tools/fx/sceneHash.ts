// tools/fx/sceneHash.ts
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = fileURLToPath(new URL('./blender/', import.meta.url))

/** sha256 over tools/fx/blender/*.py, by sorted name: what the committed sheets were baked
 *  from (plan E2 Ruling R2). fxSheets.test.ts compares it with sheets.json. */
export function fxSceneSha256(dir = DIR): string {
  const h = createHash('sha256')
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.py')).sort()) {
    h.update(f); h.update('\0'); h.update(readFileSync(join(dir, f))); h.update('\0')
  }
  return h.digest('hex')
}
