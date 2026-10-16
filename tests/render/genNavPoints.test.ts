import { it } from 'vitest'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { glbScene } from './_wildcatCache.js'
import { extractNavPoints, worldTriangles } from './_meshSurface.js'

/**
 * A generator, not a test: with GEN_NAV_POINTS=<output path> it rewrites the AIRFRAME_LIGHT_POINTS table
 * from the committed airframe meshes (F6A Task 7, redone 2026-10-14 after Mark saw a light floating off a
 * wingtip: the first table was placed from bounding boxes). Run
 * `GEN_NAV_POINTS=/tmp/points.ts npx vitest run tests/render/genNavPoints.test.ts` and paste the output.
 * Skipped otherwise, with a reason the code can check.
 */
it.skipIf(process.env.GEN_NAV_POINTS === undefined)('generates the position-light table from the meshes', async () => {
  const ids = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
  const lines = ['export const AIRFRAME_LIGHT_POINTS: Readonly<Record<string, AirframeLights>> = {']
  for (const id of ids) {
    const spec = JSON.parse(readFileSync(`content/aircraft/${id}.json`, 'utf8')) as { view: { model: string } }
    const p = extractNavPoints(worldTriangles(await glbScene(`content/aircraft/${spec.view.model}.glb`)))
    lines.push(`  '${id}': { port: [${p.port.join(', ')}], starboard: [${p.starboard.join(', ')}], tail: [${p.tail.join(', ')}] },`)
  }
  lines.push('}', '')
  writeFileSync(process.env.GEN_NAV_POINTS!, lines.join('\n'))
})
