// tests/tools/models/blender/run.test.ts
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BLENDER_VERSION, HAVE_BLENDER, assertBlenderVersion, parseBlenderVersion, runBlenderScript } from '../../../../tools/models/blender/run.js'

describe('Blender version pinning (model-roster spec §4.1)', () => {
  it('parses the version line Blender prints', () => {
    expect(parseBlenderVersion('Blender 5.0.1\n\tbuild date: 2025-12-01\n')).toBe('5.0.1')
    expect(parseBlenderVersion('Color management: ...\nBlender 4.2.3 LTS\n')).toBe('4.2.3')
    expect(parseBlenderVersion('bash: blender: command not found')).toBeNull()
  })
  it('accepts only the pinned version, and names what it found', () => {
    expect(BLENDER_VERSION).toBe('5.0.1')
    expect(() => assertBlenderVersion('5.0.1')).not.toThrow()
    expect(() => assertBlenderVersion('5.0.2')).toThrow(/5\.0\.2 found; models need exactly 5\.0\.1/)
    expect(() => assertBlenderVersion(null)).toThrow(/not found on PATH/)
  })
})

// A named skip, not a vanishing one: ryzen has no Blender (checked 2026-09-26), so there
// these print as skipped and must be run on nexus by name (spec §7).
describe.skipIf(!HAVE_BLENDER)('runBlenderScript against the real Blender', () => {
  const dir = mkdtempSync(join(tmpdir(), 'm0-run-'))
  const script = (name: string, body: string): string => {
    const p = join(dir, name)
    writeFileSync(p, body)
    return p
  }

  it('passes the output path and extra args after --, and succeeds when the file is written', () => {
    const s = script('ok.py', [
      'import sys',
      'argv = sys.argv[sys.argv.index("--") + 1:]',
      'assert argv[1:] == ["--width", "3"], argv',
      'open(argv[0], "wb").write(b"glTF")',
    ].join('\n'))
    const out = join(dir, 'ok.glb')
    runBlenderScript(s, out, ['--width', '3'])
    expect(existsSync(out)).toBe(true)
  }, 60_000)

  it('a raising script fails, with the traceback in the message', () => {
    const s = script('boom.py', 'raise RuntimeError("kit-boom-7")\n')
    expect(() => runBlenderScript(s, join(dir, 'boom.glb'))).toThrow(/kit-boom-7/)
  }, 60_000)

  it('no output is an error even if a stale file existed', () => {
    const out = join(dir, 'stale.glb')
    writeFileSync(out, 'old bytes')
    const s = script('silent.py', 'pass\n')
    expect(() => runBlenderScript(s, out)).toThrow(/wrote no/)
    expect(existsSync(out)).toBe(false)
  }, 60_000)

  it('leaves no __pycache__ beside the kit: a model script importing kit must not dirty the tree', () => {
    rmSync('tools/models/blender/__pycache__', { recursive: true, force: true })
    runBlenderScript('tests/tools/models/blender/fixtures/kit_probe.py', join(dir, 'probe.glb'))
    expect(existsSync('tools/models/blender/__pycache__')).toBe(false)
  }, 60_000)
})
