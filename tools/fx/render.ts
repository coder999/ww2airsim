// tools/fx/render.ts
/**
 * `npm run fx:render -- [sheet ...]` bakes flipbook sheets on ryzen with the blender.org build
 * (plan E2 Ruling R1), one at a time, into tools/fx/renders/<sheet>/ (Ruling R10). It runs
 * probe.py first. FX_BAKE_HOST and FX_BLENDER override the host and binary; FX_BAKE_HOST=local runs
 * the same bake on the machine render.ts itself runs on (e.g. nexus, beside a ryzen bake), copying
 * scripts and frames to and from ~/fxbake-local/<checkout>/ with a local rsync instead of ssh+WSL.
 * FX_SIM_SCALE,
 * FX_FRAMES, FX_CELL and FX_SAMPLES shrink a trial run; a real bake leaves them unset.
 * FX_VARIANT=gas bakes each sheet's `<sheet>-gas.py` into tools/fx/renders/<sheet>-gas/ instead
 * (remote.ts's variantName); fx:pack never reads a variant, and refuses to run with FX_VARIANT set.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FX_SHEETS, type FxSheetName } from '../../src/render/fx/sheetManifest.js'
import {
  assertProbe, FX_BAKE_HOST_DEFAULT, FX_BAKE_HOST_LOCAL, FX_BLENDER_DEFAULT, remoteScript, rsyncArgs, localRsyncArgs,
  hostCommand, remoteDirFor, assertMetaSheet, variantName,
} from './remote.js'
import { LOOPING, LOOP_BLEND } from './pack.js'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SCRIPTS = join(ROOT, 'tools/fx/blender/')
const RENDERS = join(ROOT, 'tools/fx/renders/')
const HOST = process.env.FX_BAKE_HOST ?? FX_BAKE_HOST_DEFAULT
const LOCAL = HOST === FX_BAKE_HOST_LOCAL
const BLENDER = process.env.FX_BLENDER ?? FX_BLENDER_DEFAULT
const REMOTE = remoteDirFor(HOST, basename(ROOT.replace(/\/$/, '')))
const env = (k: string, d: number): number => (process.env[k] === undefined ? d : Number(process.env[k]))
const FRAMES = env('FX_FRAMES', 64), CELL = env('FX_CELL', 256), SAMPLES = env('FX_SAMPLES', 128), SIM_SCALE = env('FX_SIM_SCALE', 1)
/** Per sheet. Task 4 records the real times; three hours is a hang, not a slow bake. */
const TIMEOUT_S = 3 * 3600

function run(cmd: string, args: readonly string[], input?: string): string {
  const r = spawnSync(cmd, args, { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}:\n${r.stdout}\n${r.stderr}`)
  return r.stdout
}
const onHost = (script: string): string => { const c = hostCommand(HOST); return run(c.cmd, c.args, script) }
const lastJson = (out: string): unknown => JSON.parse(out.trim().split('\n').pop()!)

function main(): void {
  const asked = process.argv.slice(2)
  const sheets = (asked.length > 0 ? asked : [...FX_SHEETS]) as FxSheetName[]
  for (const s of sheets) if (!(FX_SHEETS as readonly string[]).includes(s)) throw new Error(`unknown sheet ${s}; one of ${FX_SHEETS.join(', ')}`)
  try { onHost('true\n') } catch (e) {
    const hint = LOCAL ? 'bash is not on PATH' : 'Wake it (serverconfig/ryzen.md, "Wake-on-LAN") and retry'
    throw new Error(`fx:render: ${HOST} is not answering. ${hint}.\n${String(e)}`)
  }
  run('rsync', LOCAL
    ? localRsyncArgs(SCRIPTS, join(homedir(), REMOTE, 'scripts') + '/', { delete: true, mkpath: true, exclude: ['__pycache__/'] })
    : rsyncArgs(SCRIPTS, `${HOST}:${REMOTE}/scripts/`, { delete: true, mkpath: true, exclude: ['__pycache__/'] }))
  const probe = lastJson(onHost(remoteScript({
    remoteDir: REMOTE, blender: BLENDER, script: 'probe.py', doneName: 'done-probe.json', cleanDir: 'probe', args: ['--out', 'probe'], timeoutS: 600,
  }))) as { coveredPx: number }
  assertProbe(probe.coveredPx)
  console.log(`fx:render: probe drew ${probe.coveredPx} px`)
  for (const sheet of sheets) {
    const frames = LOOPING.includes(sheet) ? FRAMES + LOOP_BLEND : FRAMES
    const args = ['--out', 'out', '--frames', String(frames), '--cell', String(CELL), '--samples', String(SAMPLES), '--sim-scale', String(SIM_SCALE)]
    // process.hrtime.bigint(), not Date.now(): eslint.config.js's tools/**/*.ts
    // no-restricted-properties bans the wall clock (same reason as tools/terrain/build.ts).
    const t = process.hrtime.bigint()
    // The script writes out/<name>/ (its own sheet name), so a variant's script must pass name as `sheet`.
    const name = variantName(sheet, process.env.FX_VARIANT)
    onHost(remoteScript({ remoteDir: REMOTE, blender: BLENDER, script: `${name}.py`, doneName: `done-${name}.json`, cleanDir: `out/${name}`, args, timeoutS: TIMEOUT_S }))
    mkdirSync(join(RENDERS, name), { recursive: true })
    run('rsync', LOCAL
      ? localRsyncArgs(join(homedir(), REMOTE, 'out', name) + '/', join(RENDERS, name) + '/', { delete: true, exclude: ['cache/'] })
      : rsyncArgs(`${HOST}:${REMOTE}/out/${name}/`, join(RENDERS, name) + '/', { delete: true, exclude: ['cache/'] }))
    const metaFile = join(RENDERS, name, 'meta.json')
    if (!existsSync(metaFile)) throw new Error(`fx:render: ${name} came back without meta.json`)
    const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as { sheet?: unknown; frames: number; bakeS: number; renderS: number }
    assertMetaSheet(meta, name)
    if (meta.frames !== frames) throw new Error(`fx:render: ${name} came back with ${meta.frames} frames, asked for ${frames}`)
    const wallS = Number(process.hrtime.bigint() - t) / 1e9
    console.log(`fx:render: ${name} bake ${meta.bakeS} s, render ${meta.renderS} s, ${Math.round(wallS)} s wall`)
  }
}
main()
