// tools/models/bake.ts
/**
 * `npm run models:bake -- <id>` (M1c): bakes a skinned Blender script's high-poly detail into a
 * committed AO and normal map (skin/bake.ts says why they are committed, not built).
 *  1. Builds the script's raw glb and detail sidecar here (Linux, byte-identical to every build),
 *     whose hashes the manifest pins.
 *  2. Copies the scripts (and a ship's spec) to Ryzen and runs the same script in Windows Blender
 *     with WW2_BAKE_DIR set, so kit.export hands off to bake.py: Cycles on the RX 6700 XT, HIP
 *     from session 0 (serverconfig/ryzen.md, "Cycles on the GPU").
 *  3. Copies ao.png, normal.png and bake.py's report back into tools/models/bakes/<id>/.
 * A box-skinned download whose entry declares `boxSkin.detail` (M1d) bakes the same way from the build's
 * bake input glb and detail list (build.ts's downloadBakeInputs) through bake_glb.py.
 * BAKE_HOST (default ryzen) and BAKE_BLENDER override the host and its Blender.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import sharp from 'sharp'
import { loadModelEntries } from './manifest.js'
import { blenderIntermediate, downloadBakeInputs } from './build.js'
import { detailSidecarPath, runBlenderScript, skinSidecarPath } from './blender/run.js'
import { bakeDir, sha256, type BakeManifest } from './skin/bake.js'
import { parseSidecar } from './skin/sidecar.js'

const HOST = process.env.BAKE_HOST ?? 'ryzen'
const BLENDER = process.env.BAKE_BLENDER ?? 'C:\\Users\\markt\\opt\\blender-5.0.1-windows-x64\\blender.exe'
const REMOTE = 'C:/Users/markt/ww2bake'

function run(cmd: string, args: readonly string[]): string {
  const r = spawnSync(cmd, ['-o', 'LogLevel=ERROR', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}:\n${r.stdout}\n${r.stderr}`)
  return r.stdout
}
const ps = (command: string): string => run('ssh', [HOST, command])

const id = process.argv[2]
const entry = loadModelEntries().find((e) => e.id === id)
const download = entry?.source.kind === 'sketchfab' && entry.boxSkin?.detail !== undefined
if (!entry || !(download || (entry.source.kind === 'blender' && entry.skin))) {
  console.error(`usage: npm run models:bake -- <id of a skinned blender entry, or a download whose boxSkin has detail>, got ${id ?? 'nothing'}`)
  process.exit(1)
}
// A Blender entry: its raw glb and detail sidecar, and the script that rebuilds them there. A download (M1d):
// the bake input glb and detail list the build hashes, and bake_glb.py to bake them.
let rawPath: string, detailPath: string, atlasPx: number, label: string
const files = ['tools/models/blender/bake.py']
if (download) {
  const got = await downloadBakeInputs(entry)
  rawPath = `tools/models/cache/${entry.id}.bakein.glb`
  detailPath = `tools/models/cache/${entry.id}.bakein.detail.json`
  writeFileSync(rawPath, got.input)
  writeFileSync(detailPath, got.detail)
  atlasPx = got.atlasPx
  label = 'bake_glb.py'
  files.push('tools/models/blender/bake_glb.py')
} else {
  const script = (entry.source as { script: string }).script
  rawPath = blenderIntermediate(entry.id)
  runBlenderScript(script, rawPath)
  detailPath = detailSidecarPath(rawPath)
  atlasPx = parseSidecar(readFileSync(skinSidecarPath(rawPath), 'utf8')).atlasPx
  label = basename(script)
  files.push('tools/models/blender/kit.py', 'tools/models/blender/naval.py', script)
  if (entry.ship) files.push(`content/ships/${entry.ship.spec}.json`)
}

const stage = `${REMOTE}/${entry.id}`
ps(`Remove-Item -Recurse -Force '${stage}' -ErrorAction SilentlyContinue; ` +
  [...new Set(files.map((f) => f.slice(0, f.lastIndexOf('/'))))].map((d) => `New-Item -ItemType Directory -Force '${stage}/repo/${d}' | Out-Null`).join('; ') +
  `; New-Item -ItemType Directory -Force '${stage}/out' | Out-Null`)
for (const f of files) run('scp', ['-q', f, `${HOST}:${stage}/repo/${f}`])
const started = process.hrtime.bigint()
const filter = `2>&1 | Select-String -Pattern 'BAKE|Error|Traceback' | ForEach-Object { $_.Line }`
let log: string
if (download) {
  run('scp', ['-q', rawPath, `${HOST}:${stage}/in.glb`])
  run('scp', ['-q', detailPath, `${HOST}:${stage}/in.detail.json`])
  log = ps(`& '${BLENDER}' -b --factory-startup --python-exit-code 1 -P '${stage}/repo/tools/models/blender/bake_glb.py' -- '${stage}/in.glb' '${stage}/in.detail.json' '${stage}/out' ${atlasPx} ${filter}`)
} else {
  const script = (entry.source as { script: string }).script
  log = ps(`$env:WW2_BAKE_DIR='${stage}/out'; & '${BLENDER}' -b --factory-startup --python-exit-code 1 -P '${stage}/repo/${script}' -- '${stage}/out/raw.glb' ${filter}`)
}
const line = log.split('\n').find((l) => l.startsWith('BAKE '))
if (!line) throw new Error(`no BAKE report from ${HOST}:\n${log}`)
const info = JSON.parse(line.slice(5)) as Record<string, unknown>
if (info.size !== atlasPx) throw new Error(`baked ${String(info.size)} px but the atlas is ${atlasPx} px (a WW2_BAKE_PX override on ${HOST}?)`)
const out = bakeDir(entry.id)
mkdirSync(out, { recursive: true })
for (const f of ['ao.png', 'normal.png']) run('scp', ['-q', `${HOST}:${stage}/out/${f}`, `${out}/${f}`])
// The AO is gray: one channel holds the same values in a third of the bytes (loadBake reads it back as RGB).
const ao = await sharp(`${out}/ao.png`).extractChannel(0).png({ compressionLevel: 9 }).toBuffer()
writeFileSync(`${out}/ao.png`, ao)
const manifest: BakeManifest = {
  version: 1, model: entry.id, rawSha256: sha256(readFileSync(rawPath)), detailSha256: sha256(readFileSync(detailPath)),
  size: atlasPx, info: { ...info, host: HOST, wallSeconds: Number((process.hrtime.bigint() - started) / 100_000_000n) / 10 },
  date: new Date().toISOString().slice(0, 10),
}
writeFileSync(`${out}/manifest.json`, `${JSON.stringify(manifest, null, 1)}\n`)
console.log(`baked ${entry.id} on ${HOST} (${String(info.device)}): ${JSON.stringify(info.seconds)} -> ${out}/ (${label})`)
