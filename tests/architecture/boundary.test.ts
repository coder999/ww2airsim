import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { writeFileSync, rmSync, existsSync } from 'node:fs'
import { ESLint } from 'eslint'

const PROBE = 'src/sim/__boundary_probe__.ts'
const ASSISTS_PROBE = 'src/assists/__boundary_probe__.ts'

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
  if (existsSync(ASSISTS_PROBE)) rmSync(ASSISTS_PROBE)
})

describe('architecture boundary (spec §3)', () => {
  it('passes on the real source tree', () => {
    expect(runDepcruise().code).toBe(0)
  })

  it('fails when sim/ imports a render LIBRARY, not just render/', () => {
    // Review 2026-09-13: three of the five depcruise rules had a negative
    // probe and two did not. Both unprobed rules were confirmed to fire, so
    // this is a missing guard rather than a dead rule -- but by this file's
    // own standard, a rule never seen to fail is indistinguishable from one
    // that matches nothing.
    //
    // This is the rule that matters most of the five: `sim/` importing three
    // directly would put a renderer type in the physics and is exactly the
    // coupling the whole seam exists to prevent, and it would NOT be caught by
    // `sim-must-not-import-render`, which only watches the src/render path.
    writeFileSync(PROBE, "import { Vector3 } from 'three'\nexport const probe = Vector3\n")
    const { code, output } = runDepcruise()
    expect(code).not.toBe(0)
    expect(output).toContain('sim-must-not-import-render-libs')
  })

  it('fails on a circular import', () => {
    // The fifth rule, and the other one that had no probe. Two files that
    // import each other, both inside sim/, so the cycle is unambiguous.
    const A = 'src/sim/__cycle_a__.ts'
    const B = 'src/sim/__cycle_b__.ts'
    try {
      writeFileSync(A, "import { b } from './__cycle_b__.js'\nexport const a = b\n")
      writeFileSync(B, "import { a } from './__cycle_a__.js'\nexport const b = a\n")
      const { code, output } = runDepcruise()
      expect(code).not.toBe(0)
      expect(output).toContain('no-circular')
    } finally {
      for (const f of [A, B]) if (existsSync(f)) rmSync(f)
    }
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

  it('fails when assists/ imports render/', () => {
    // Plan 3: assists/ is injected into sim/loop.ts's `advance` rather than
    // imported by it (see `Assist` there), and has no legitimate reason to
    // reach into the renderer either. Same negative-test pattern as the sim/
    // render probe above, for the same reason -- a rule never seen to fail is
    // indistinguishable from one that matches nothing. This probe writes
    // under src/assists/, not src/sim/, so it also confirms the new rule's
    // `from` path actually matches that directory rather than being a dead
    // copy-paste of the sim/ rule.
    writeFileSync(ASSISTS_PROBE, "import { showFailure } from '../render/failure.js'\nexport const probe = showFailure\n")
    const { code, output } = runDepcruise()
    expect(code).not.toBe(0)
    expect(output).toContain('assists-must-not-import-render')
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
    const messages = results.flatMap((r) => r.messages)
    expect(messages.map((m) => m.ruleId)).toContain('no-restricted-globals')
    expect(messages.map((m) => m.ruleId)).toContain('no-restricted-properties')
    // SEVERITY, not just presence. Review 2026-09-13: downgrading these rules
    // from 'error' to 'warn' left the whole suite green AND `eslint src tests
    // tools` exiting 0, because nothing asserted the severity and the lint
    // script carries no --max-warnings. A rule that only warns is
    // indistinguishable from one that does not match, which is the failure
    // this file's own comment names two tests below.
    for (const m of messages) expect(m.severity, m.ruleId ?? '').toBe(2)
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
    const messages = results.flatMap((r) => r.messages)
    const flagged = messages.map((m) => m.message)
    for (const g of names) expect(flagged.some((m) => m.includes(g)), g).toBe(true)
    for (const m of messages) expect(m.severity, m.message).toBe(2)
  })
})
