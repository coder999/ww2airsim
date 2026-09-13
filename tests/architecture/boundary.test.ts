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
    writeFileSync(PROBE, "import { showFailure } from '../render/failure.js'\nexport const probe = showFailure\n")
    const { code, output } = runDepcruise()
    expect(code).not.toBe(0)
    expect(output).toContain('sim-must-not-import-render')
  })

  // Finding I1: `src/sim` must also load in a browser, so a Node core import
  // there means a later bundler either fails or silently shims it. The
  // docstring on the old `loadAircraftSpec` already asserted "Node-only
  // loader" -- a comment describing a constraint nothing enforced. Same
  // negative-test pattern as the render boundary above, for the same reason:
  // a lint or depcruise rule that is never seen to fail is indistinguishable
  // from one that does not match anything.
  it('fails when sim/ imports a Node core module', () => {
    writeFileSync(PROBE, "import { readFileSync } from 'node:fs'\nexport const probe = readFileSync\n")
    const { code, output } = runDepcruise()
    expect(code).not.toBe(0)
    expect(output).toContain('sim-must-not-import-node-core')
  })

  it('fails when sim/ imports input/', () => {
    // The probe imports a file that EXISTS. dependency-cruiser reports no
    // violation for an unresolvable import (verified 2026-09-12), so a probe
    // against a not-yet-written module passes for the wrong reason.
    writeFileSync(PROBE, "import { BINDINGS } from '../input/bindings.js'\nexport const probe = BINDINGS\n")
    const { code, output } = runDepcruise()
    expect(code).not.toBe(0)
    expect(output).toContain('sim-must-not-import-input')
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

  it('reports an error for the storage, network and scheduling globals', async () => {
    // tsc has always accepted these in sim/ (its default lib includes DOM),
    // so this denylist is the only guard. A rule never seen to fail is
    // indistinguishable from one that matches nothing.
    const names = ['localStorage', 'sessionStorage', 'fetch', 'self', 'requestAnimationFrame', 'crypto', 'XMLHttpRequest']
    const eslint = new ESLint({})
    const results = await eslint.lintText(
      `export const bad = [${names.join(', ')}]\n`,
      { filePath: 'src/sim/__lint_probe__.ts' },
    )
    const flagged = results.flatMap((r) => r.messages).map((m) => m.message)
    for (const g of names) expect(flagged.some((m) => m.includes(g)), g).toBe(true)
  })
})
