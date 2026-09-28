import { describe, expect, it } from 'vitest'
import { assertProbe, FX_BLENDER_DEFAULT, remoteScript, rsyncArgs, variantName, type BakeRun } from '../../tools/fx/remote.js'

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
})
