import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { writeFileSync, rmSync, existsSync } from 'node:fs'
import { ESLint } from 'eslint'

const PROBE = 'src/sim/__boundary_probe__.ts'

function runDepcruise(): { code: number; output: string } {
  try {
    const output = execFileSync('npx', ['depcruise', 'src', '--config', '.dependency-cruiser.cjs'], {
      encoding: 'utf8',
    })
    return { code: 0, output }
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string }
    return { code: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

afterEach(() => {
  if (existsSync(PROBE)) rmSync(PROBE)
})

describe('architecture boundary (spec §3)', () => {
  it('passes on the real source tree', () => {
    expect(runDepcruise().code).toBe(0)
  })

  it('fails when sim/ imports render/', () => {
    writeFileSync(PROBE, "import { PLACEHOLDER } from '../render/placeholder.js'\nexport const probe = PLACEHOLDER\n")
    const { code, output } = runDepcruise()
    expect(code).not.toBe(0)
    expect(output).toContain('sim-must-not-import-render')
  })
})

describe('sim/ forbids browser globals and nondeterminism (spec §3)', () => {
  it('reports an error for navigator, Math.random and Date.now', async () => {
    const eslint = new ESLint({})
    const results = await eslint.lintText(
      'export const bad = [navigator.userAgent, Math.random(), Date.now()]\n',
      { filePath: 'src/sim/__lint_probe__.ts' },
    )
    const messages = results.flatMap((r) => r.messages).map((m) => m.ruleId)
    expect(messages).toContain('no-restricted-globals')
    expect(messages).toContain('no-restricted-properties')
  })
})
