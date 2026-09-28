import { describe, expect, it } from 'vitest'
import {
  assertMetaSheet, assertPackHasNoVariant, assertProbe, FX_BAKE_HOST_DEFAULT, FX_BAKE_HOST_LOCAL, FX_BLENDER_DEFAULT,
  hostCommand, localRsyncArgs, remoteDirFor, remoteScript, rsyncArgs, variantName, type BakeRun,
} from '../../tools/fx/remote.js'

const run: BakeRun = {
  remoteDir: 'fxbake/e2-flipbooks', blender: FX_BLENDER_DEFAULT, script: 'smoke.py', doneName: 'done-smoke.json',
  cleanDir: 'out/smoke', args: ['--out', 'out', '--frames', '64'], timeoutS: 10800,
}

describe('fx bake transport (plan E2 Rulings R1, R10)', () => {
  it('runs the pinned build headless, fails on a Python error, and never trusts exit 0 alone', () => {
    const s = remoteScript(run)
    expect(s).toContain("grep -qx 'Blender 5.0.1'")
    expect(s).toContain('timeout 10800 blender -b --factory-startup --python-exit-code 1')
    expect(s).toContain('-P scripts/smoke.py -- done-smoke.json --out out --frames 64')
    expect(s).toContain('rm -rf out/smoke')
    expect(s).toContain('test -s done-smoke.json')
    expect(s).not.toContain('/tmp') // WSL wipes /tmp when the distro idles out (serverconfig/ryzen.md)
  })

  it('refuses any value it would have to quote', () => {
    expect(() => remoteScript({ ...run, args: ['--out', 'a b'] })).toThrow(/quote/)
    expect(() => remoteScript({ ...run, script: 'x;rm -rf ~.py' })).toThrow(/quote/)
  })

  it('rsyncs through WSL, relative to its home', () => {
    const a = rsyncArgs('tools/fx/blender/', 'ryzen:fxbake/x/scripts/', { delete: true, mkpath: true, exclude: ['__pycache__/'] })
    expect(a).toContain('--rsync-path=wsl --cd ~ -- rsync')
    expect(a).toEqual(expect.arrayContaining(['--delete', '--mkpath', '--exclude', '__pycache__/']))
    expect(a.slice(-2)).toEqual(['tools/fx/blender/', 'ryzen:fxbake/x/scripts/'])
  })

  it('a probe that drew nothing stops the bake and names the defect (Review Focus 1)', () => {
    expect(() => assertProbe(0)).toThrow(/NanoVDB/)
    expect(() => assertProbe(Number.NaN)).toThrow(/NanoVDB/)
    expect(() => assertProbe(4747)).not.toThrow()
  })

  it('FX_VARIANT names a sibling bake, and only with characters the bake script never quotes (plan E2 Task 6)', () => {
    expect(variantName('water-column', undefined)).toBe('water-column')
    expect(variantName('water-column', '')).toBe('water-column')
    expect(variantName('water-column', 'gas')).toBe('water-column-gas')
    const name = variantName('spray', 'gas')
    expect(remoteScript({ ...run, script: `${name}.py`, doneName: `done-${name}.json`, cleanDir: `out/${name}` })).toContain('-P scripts/spray-gas.py -- done-spray-gas.json')
    for (const bad of ['Gas', 'g as', 'gas;rm', '../x', '-gas']) expect(() => variantName('spray', bad)).toThrow(/FX_VARIANT/)
  })

  it('a bake whose meta.json names another sheet is refused (review round 1)', () => {
    expect(() => assertMetaSheet({ sheet: 'water-column-gas' }, 'water-column-gas')).not.toThrow()
    expect(() => assertMetaSheet({ sheet: 'water-column' }, 'water-column-gas')).toThrow(/asked for water-column-gas.*sheet "water-column"/)
    expect(() => assertMetaSheet({}, 'spray')).toThrow(/asked for spray/)
  })

  it('fx:pack refuses FX_VARIANT, which only --check reads (review round 1)', () => {
    expect(() => assertPackHasNoVariant(undefined)).not.toThrow()
    expect(() => assertPackHasNoVariant('')).not.toThrow()
    expect(() => assertPackHasNoVariant('gas')).toThrow(/FX_VARIANT=gas/)
  })

  it('FX_BAKE_HOST=local runs a bare bash locally instead of ssh+WSL (plan E2 Task 7 Step 0)', () => {
    expect(hostCommand(FX_BAKE_HOST_DEFAULT)).toEqual({ cmd: 'ssh', args: expect.arrayContaining(['ryzen', 'wsl -- bash -s; exit $LASTEXITCODE']) })
    expect(hostCommand('ryzen').args.join(' ')).toContain('wsl -- bash -s')
    expect(hostCommand(FX_BAKE_HOST_LOCAL)).toEqual({ cmd: 'bash', args: ['-s'] })
  })

  it('a local bake scratches under ~/fxbake-local/<checkout>/, outside the repo and never fxbake/ (Task 7 Step 0)', () => {
    expect(remoteDirFor(FX_BAKE_HOST_DEFAULT, 'e2-flipbooks')).toBe('fxbake/e2-flipbooks')
    expect(remoteDirFor('ryzen', 'e2-flipbooks')).toBe('fxbake/e2-flipbooks')
    expect(remoteDirFor(FX_BAKE_HOST_LOCAL, 'e2-flipbooks')).toBe('fxbake-local/e2-flipbooks')
  })

  it('local transfer is a plain rsync with no ssh/WSL transport (Task 7 Step 0)', () => {
    const a = localRsyncArgs('tools/fx/blender/', '~/fxbake-local/e2-flipbooks/scripts/', { delete: true, mkpath: true, exclude: ['__pycache__/'] })
    expect(a.join(' ')).not.toContain('ssh')
    expect(a.join(' ')).not.toContain('wsl')
    expect(a).toEqual(expect.arrayContaining(['--delete', '--mkpath', '--exclude', '__pycache__/']))
    expect(a.slice(-2)).toEqual(['tools/fx/blender/', '~/fxbake-local/e2-flipbooks/scripts/'])
  })
})
