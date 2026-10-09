// tools/models/blender/run.ts
/**
 * The one place Blender is spawned (model-roster spec §4.1). Three traps it exists for,
 * each measured on nexus 2026-09-26:
 *  - Blender exits 0 when a -P script raises, unless given --python-exit-code 1.
 *  - A run that writes nothing would leave a previous run's file looking fresh, so
 *    the output is deleted first and its absence afterwards is an error.
 *  - Another Blender is another glTF exporter, and the bytes change silently, so the
 *    version is pinned exactly.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { dirname } from 'node:path'

export const BLENDER_VERSION = '5.0.1'

/** The skin sidecar a skinned script writes beside its glb (DP0). */
export function skinSidecarPath(glb: string): string {
  if (!glb.endsWith('.glb')) throw new Error(`skinSidecarPath: ${glb} is not a .glb`)
  return `${glb.slice(0, -4)}.skin.json`
}

/** The control-surface hinges a script writes beside its glb (C1): `{ hinges: { node: { point, axis } } }`. */
export function hingesSidecarPath(glb: string): string {
  if (!glb.endsWith('.glb')) throw new Error(`hingesSidecarPath: ${glb} is not a .glb`)
  return `${glb.slice(0, -4)}.hinges.json`
}

/** The bake-only detail list a script writes beside its glb (M1c, kit.Model.detail): what a committed bake was baked from. */
export function detailSidecarPath(glb: string): string {
  if (!glb.endsWith('.glb')) throw new Error(`detailSidecarPath: ${glb} is not a .glb`)
  return `${glb.slice(0, -4)}.detail.json`
}

export function parseBlenderVersion(stdout: string): string | null {
  const m = /^Blender (\d+\.\d+\.\d+)/m.exec(stdout)
  return m ? m[1]! : null
}

export function installedBlenderVersion(bin = 'blender'): string | null {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8' })
  if (r.error || r.status !== 0) return null
  return parseBlenderVersion(r.stdout)
}

/** Only a missing executable is absent. A present Blender that is broken or of the
 *  wrong version must make the Blender suites run and fail, not skip. */
export function blenderPresent(bin = 'blender'): boolean {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8' })
  return (r.error as NodeJS.ErrnoException | undefined)?.code !== 'ENOENT'
}

export const HAVE_BLENDER = blenderPresent()

/** A hung Blender would block an unattended run forever: spawnSync cannot be interrupted
 *  by a test timeout. The hangar takes about a second; a Cycles preview a few. */
export const BLENDER_TIMEOUT_MS = 300_000

export function assertBlenderVersion(found: string | null): void {
  if (found === null) throw new Error(`blender not found on PATH or did not report a version; models need Blender ${BLENDER_VERSION}`)
  if (found !== BLENDER_VERSION) {
    throw new Error(`blender ${found} found; models need exactly ${BLENDER_VERSION} (another exporter version changes the bytes)`)
  }
}

const tail = (s: string): string => s.trim().split('\n').slice(-25).join('\n')

/** Runs `script` headless as `blender ... -P script -- out ...args`; throws unless it exits 0 AND writes `out`. */
export function runBlenderScript(script: string, out: string, args: readonly string[] = [], bin = 'blender', timeoutMs = BLENDER_TIMEOUT_MS): void {
  assertBlenderVersion(installedBlenderVersion(bin))
  mkdirSync(dirname(out), { recursive: true })
  rmSync(out, { force: true })
  // A stale sidecar would skin this run's glb with another run's atlas (DP0).
  if (out.endsWith('.glb')) {
    rmSync(skinSidecarPath(out), { force: true })
    rmSync(hingesSidecarPath(out), { force: true })
    rmSync(detailSidecarPath(out), { force: true })
  }
  // No __pycache__ beside kit.py (an untracked file in every checkout). Blender's bundled
  // Python ignores PYTHONDONTWRITEBYTECODE (measured 2026-09-26), so it is set in-process
  // before the script runs; Blender handles its arguments in order.
  const noBytecode = ['--python-expr', 'import sys; sys.dont_write_bytecode = True']
  const r = spawnSync(bin, ['-b', '--factory-startup', '--python-exit-code', '1', ...noBytecode, '-P', script, '--', out, ...args], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONHASHSEED: '0' },
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
  })
  if ((r.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT' || r.signal !== null) {
    throw new Error(`blender ${script} timed out after ${timeoutMs} ms (${r.signal ?? 'killed'})`)
  }
  if (r.error) throw r.error
  const log = `${r.stdout}\n${r.stderr}`
  if (r.status !== 0) throw new Error(`blender ${script} exited ${r.status}:\n${tail(log)}`)
  if (!existsSync(out) || statSync(out).size === 0) throw new Error(`blender ${script} exited 0 but wrote no ${out}:\n${tail(log)}`)
}
