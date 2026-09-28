// tools/fx/remote.ts
/**
 * Pure builders for the flipbook bake on ryzen (plan E2 Rulings R1, R10); render.ts runs them.
 * Transport is serverconfig/ryzen.md's WSL pattern: a bash script piped to
 * `ssh ryzen 'wsl -- bash -s'` (PowerShell re-parses a command string, never stdin), and rsync
 * through `--rsync-path='wsl --cd ~ -- rsync'`, as remote-run does.
 */
export const FX_BAKE_HOST_DEFAULT = 'ryzen'
/** `blender` on PATH: the blender.org build on both machines since 2026-09-27 (Ruling R1; serverconfig/ryzen.md). */
export const FX_BLENDER_DEFAULT = 'blender'
export const FX_BLENDER_VERSION = '5.0.1'
export const SSH_OPTS = ['-o', 'BatchMode=yes', '-o', 'LogLevel=ERROR', '-o', 'ConnectTimeout=10'] as const

export type BakeRun = {
  /** Relative to the WSL home: one directory per checkout, so two worktrees can bake at once. */
  readonly remoteDir: string
  readonly blender: string
  /** A file in tools/fx/blender/, which render.ts rsyncs to <remoteDir>/scripts/. */
  readonly script: string
  readonly doneName: string
  /** Emptied first, so a shorter rebake cannot leave a longer one's frames behind. */
  readonly cleanDir: string
  readonly args: readonly string[]
  readonly timeoutS: number
}

const SAFE = /^[A-Za-z0-9._/~-]+$/
function safe(value: string, what: string): string {
  if (!SAFE.test(value)) throw new Error(`${what} ${JSON.stringify(value)} has characters the bake script would have to quote`)
  return value
}

/** The bash the host runs. Non-zero, with the log's tail, unless Blender exits 0 AND writes the done file. */
export function remoteScript(r: BakeRun): string {
  const dir = safe(r.remoteDir, 'remoteDir'), done = safe(r.doneName, 'doneName'), blender = safe(r.blender, 'blender')
  const script = safe(r.script, 'script'), clean = safe(r.cleanDir, 'cleanDir'), args = r.args.map((a) => safe(a, 'argument')).join(' ')
  const log = `log-${done.replace(/\.json$/, '')}.txt`
  return [
    'set -uo pipefail',
    `cd ~/${dir}`,
    `rm -rf ${clean} ${done}`,
    `${blender} --version | head -1 | grep -qx 'Blender ${FX_BLENDER_VERSION}' || { echo "fx bake: ${blender} is not Blender ${FX_BLENDER_VERSION}"; exit 3; }`,
    `timeout ${Math.round(r.timeoutS)} ${blender} -b --factory-startup --python-exit-code 1 --python-expr 'import sys; sys.dont_write_bytecode = True' -P scripts/${script} -- ${done} ${args} > ${log} 2>&1`,
    'rc=$?',
    `if [ $rc -ne 0 ]; then tail -40 ${log}; echo "fx bake: ${script} exited $rc"; exit $rc; fi`,
    `test -s ${done} || { tail -40 ${log}; echo "fx bake: ${script} exited 0 but wrote no ${done}"; exit 4; }`,
    `cat ${done}`,
    '',
  ].join('\n')
}

const VARIANT = /^[a-z0-9]+$/
/** A sheet's variant name (plan E2 Task 6): FX_VARIANT=gas bakes `water-column-gas.py` into
 *  renders/water-column-gas/, so an alternative bake sits beside the shipped one. Unset or empty is
 *  the sheet itself. Lowercase letters and digits only, so every name built from it stays SAFE. */
export function variantName(sheet: string, variant: string | undefined): string {
  if (variant === undefined || variant === '') return sheet
  if (!VARIANT.test(variant)) throw new Error(`FX_VARIANT ${JSON.stringify(variant)} must be lowercase letters and digits`)
  return `${sheet}-${variant}`
}

/** `from` and `to` name the host themselves (`ryzen:fxbake/...`), exactly one side remote. */
export function rsyncArgs(
  from: string, to: string,
  opts: { readonly delete?: boolean; readonly mkpath?: boolean; readonly exclude?: readonly string[] } = {},
): string[] {
  return [
    '-a', ...(opts.delete ? ['--delete'] : []), ...(opts.mkpath ? ['--mkpath'] : []),
    ...(opts.exclude ?? []).flatMap((e) => ['--exclude', e]),
    '-e', `ssh ${SSH_OPTS.join(' ')}`, '--rsync-path=wsl --cd ~ -- rsync', from, to,
  ]
}

/** probe.py's measurement (Ruling R1): a grid volume that renders as nothing is the Ubuntu-package defect. */
export function assertProbe(coveredPx: number): void {
  if (!(coveredPx > 0)) {
    throw new Error(
      'fx bake: the probe rendered its smoke grid as nothing. This Blender cannot draw Mantaflow grid volumes in ' +
      "Cycles; Ubuntu's package has this defect (no NanoVDB). Use the blender.org build: serverconfig/ryzen.md, " +
      '"Blender: the blender.org build".',
    )
  }
}
