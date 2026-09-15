import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'

const PROBE = 'src/sim/__boundary_probe__.ts'
const ASSISTS_PROBE = 'src/assists/__boundary_probe__.ts'
const CYCLE_A = 'src/sim/__cycle_a__.ts'
const CYCLE_B = 'src/sim/__cycle_b__.ts'

/** Every path this file writes a probe to, RELATIVE TO A CRUISE ROOT. One list,
 *  so the "nothing landed in the real tree" check, the git-ignore backstop and
 *  the probes themselves cannot disagree about what those paths are. (The
 *  `__lint_probe__` paths elsewhere in this file are not here on purpose: they
 *  are passed to `ESLint.lintText` as a virtual filename and never touch any
 *  disk at all.) */
const PROBE_FILES = [PROBE, ASSISTS_PROBE, CYCLE_A, CYCLE_B]

/** The repo, found from this file rather than from `process.cwd()`, so the temp
 *  root below is unambiguously OUTSIDE it whatever directory the runner was
 *  started in. */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** True when git would ignore `path`. `git check-ignore --quiet` exits 0 for
 *  ignored, 1 for not ignored (and 128 outside a work tree, which lands here as
 *  `false` -- a loud failure being the right outcome for a suite that cannot
 *  check the thing it claims). The path does not have to exist. */
function isGitIgnored(path: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '--quiet', path], { cwd: REPO_ROOT, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** `path`, relative to `REPO_ROOT`, read as UTF-8 -- the one place this file
 *  touches the real source tree by content rather than by cruising it. */
function readSource(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), 'utf8')
}

/**
 * Every `.ts` file under `relDir` (itself relative to `REPO_ROOT`), read once,
 * as `{ path, text }` with `path` POSIX-separated and relative to the repo
 * root regardless of platform -- so a test's regex or `===` against a literal
 * `'src/render/horizon.ts'` is not itself platform-dependent.
 *
 * Reads the REAL tree directly, unlike `cruiseWithProbes` above: the check
 * this feeds is a plain string search, not a dependency graph, so there is no
 * probe to race and nothing written for it to leave behind.
 */
function sourceFilesUnder(relDir: string): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
      const entryRelPath = join(dir, entry.name)
      if (entry.isDirectory()) walk(entryRelPath)
      else if (entry.name.endsWith('.ts')) out.push({ path: entryRelPath.split(sep).join('/'), text: readSource(entryRelPath) })
    }
  }
  walk(relDir)
  return out
}

/**
 * Every dependency-cruiser rule name this file pins, in one table.
 *
 * `sim-must-not-import-render` is a strict PREFIX of
 * `sim-must-not-import-render-libs`, so `expect(output).toContain(...)` for the
 * first is satisfied by a report that names only the second. It was not a false
 * pass as written -- the render probe imports `src/render/failure.js`, which can
 * only trip the path rule, and no `src/sim/` module imports `three` -- but it
 * goes live the instant one probe trips both rules, and this repository has
 * already paid for exactly this shape once: in `tests/build/dist.test.ts`,
 * Copernicus Article 6(a) is a literal suffix of 6(b), and deleting the entire
 * 6(a) block left that test green. Found by review 2026-09-14, M6.
 *
 * So every pin goes through `reportsRule` below, which matches a WHOLE rule
 * name, and this table exists so "no pinned name can be satisfied by a report
 * of another pinned name" is itself an assertion (the first test in the
 * describe) instead of something a reader must re-check by eye each time a
 * rule is added.
 *
 * Scoped to the depcruise rule names on purpose. The `toContain` calls further
 * down this file compare eslint rule IDs against an ARRAY -- element equality,
 * not substring -- so they are a different shape and are not in this table.
 */
const PINNED_RULE_NAMES = [
  'no-circular',
  'sim-must-not-import-render',
  'sim-must-not-import-render-libs',
  'sim-must-not-import-node-core',
  'sim-must-not-import-input',
  'sim-must-not-import-assists',
  'assists-must-not-import-render',
] as const

/** Whether `output` reports rule `name` -- as a whole name, not as a prefix of
 *  a longer one. depcruise prints `  error <rule>: <from> -> <to>`, so the
 *  character following a real rule name is never `-` nor a word character.
 *  Interpolated into the pattern unescaped, which the test below checks is
 *  safe by asserting every pinned name is kebab-case and so contains no regex
 *  metacharacter. */
function reportsRule(output: string, name: string): boolean {
  return new RegExp(`${name}(?![\\w-])`).test(output)
}

/** One line of depcruise output, in its real format (captured 2026-09-14),
 *  reporting `name` and nothing else. Used only to ask whether the pin for one
 *  rule can be satisfied by a report of a different one. */
function reportLine(name: string): string {
  return `  error ${name}: src/sim/__boundary_probe__.ts → src/render/failure.ts\n`
}

/** `depcruise src --config .dependency-cruiser.cjs` -- `npm run depcruise`'s
 *  exact arguments -- run with `cruiseRoot` as the working directory. Every rule
 *  pattern in the config is relative (`^src/sim`, `node_modules/(three|@webgpu)`,
 *  ...), which is why the root can move without the config changing. The binary
 *  is addressed by absolute path rather than through `npx`, because `npx`
 *  resolves against the working directory and that is the thing being moved. */
function runDepcruise(cruiseRoot: string): { code: number; output: string } {
  const bin = join(REPO_ROOT, 'node_modules', '.bin', 'depcruise')
  try {
    const output = execFileSync(bin, ['src', '--config', '.dependency-cruiser.cjs'], {
      cwd: cruiseRoot,
      encoding: 'utf8',
    })
    return { code: 0, output }
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string }
    return { code: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

/**
 * Copy `src/` plus the two files the cruise needs into a fresh temp root OUTSIDE
 * the repo, write `probes` into it, cruise that, and delete it again.
 *
 * WHY (design open item 4, and a flake reproduced during Plan 3's execution).
 * This file used to write its four probes into the real `src/` tree and remove
 * them in an `afterEach`, while vitest runs test files in parallel workers. A
 * concurrent `depcruise` -- another worker's, a developer's `npm run depcruise`,
 * or a parallel CI job's -- could see another test's probe: observed as a
 * violation reported against 41 modules where the quiescent tree has 39. The
 * `.gitignore` entry removed the commit-a-probe hazard but not the race, because
 * the race is about the file EXISTING, not about it being tracked.
 *
 * REPRODUCED AND MEASURED 2026-09-13, on this machine, by looping
 * `depcruise src --config .dependency-cruiser.cjs` in a shell for as long as
 * this test file takes to run: with the probes written into the real tree, 9 of
 * 13 concurrent cruises failed -- seven reporting a violation against 40 or 41
 * modules where the quiescent tree has 39, and two dying with `ENOENT ...
 * __cycle_a__.ts` because the file was removed between being listed and being
 * read. With the temp root below, 0 of 12 failed and the suite itself stayed
 * green in both runs. So this is a real defect in the developer's and CI's
 * workflow, not a theoretical interleaving.
 *
 * A temp root removes the race by construction rather than by scheduling: there
 * is no shared mutable location left to race over, each call gets its own root
 * named by `mkdtemp`, and nothing has to be cleaned up for the NEXT test to be
 * correct (the `finally` is hygiene, not coordination). It also means no probe
 * can be left behind by a Ctrl-C, a CI timeout or an OOM, which no `afterEach`
 * could ever promise.
 *
 * `node_modules` is SYMLINKED, not copied: `sim-must-not-import-render-libs`
 * matches `node_modules/(three|@webgpu)` and needs `three` to actually resolve
 * (dependency-cruiser reports NO violation for an unresolvable import, verified
 * 2026-09-12 -- which is also why every probe here imports a module that
 * exists). The resolved path comes back as the symlink's target, which still
 * contains `node_modules/three`, so the unanchored pattern matches unchanged --
 * verified 2026-09-13 by watching that rule fire from a temp root. `rmSync` does
 * not follow the link (checked: the target's files survive a recursive remove of
 * the root), so deleting the root cannot touch the repo's dependencies.
 *
 * This root also has no `content/` (only `src/`, the two config files, and a
 * symlinked `node_modules` -- see the copy loop below), which makes
 * `src/render/terrain/lod.ts`'s `import ... from '../../../content/terrain/
 * header.json'` unresolvable inside it. That is harmless ONLY because
 * `.dependency-cruiser.cjs` has no `not-to-unresolvable` rule today (checked
 * 2026-09-14: none of its seven rules is) -- dependency-cruiser reports no
 * violation for an import it cannot resolve at all (see the `node_modules`
 * paragraph above for the same fact used the other way round). If the
 * standard recommended rule set is ever added, THIS is why a real,
 * intentional `content/` import would start failing here in a way that looks
 * unrelated to its actual cause: the failure is in this test's temp root
 * construction, not in `lod.ts`.
 */
function cruiseWithProbes(probes: Record<string, string>): { code: number; output: string } {
  const root = mkdtempSync(join(tmpdir(), 'ww2airsim-boundary-'))
  try {
    cpSync(join(REPO_ROOT, 'src'), join(root, 'src'), { recursive: true })
    for (const f of ['.dependency-cruiser.cjs', 'tsconfig.json']) {
      copyFileSync(join(REPO_ROOT, f), join(root, f))
    }
    symlinkSync(join(REPO_ROOT, 'node_modules'), join(root, 'node_modules'), 'dir')
    for (const [relPath, contents] of Object.entries(probes)) {
      writeFileSync(join(root, relPath), contents)
    }
    return runDepcruise(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('architecture boundary (spec §3)', () => {
  it('pins each rule name so that no OTHER pinned rule name can satisfy it', () => {
    // The permanent form of M6. The hazard is not "two rule names look alike",
    // it is "the assertion for rule A passes on a report that names only rule
    // B" -- so that is what is asserted, over every ordered pair, against real
    // depcruise output. Green with `reportsRule`; replacing it with
    // `output.includes(name)` fails on the render/render-libs pair, which is
    // the mutation that proves this is not decorative.
    //
    // Note what this does NOT say: it does not forbid one rule name being a
    // substring of another. That is `.dependency-cruiser.cjs`'s business. It
    // forbids the MATCHER from confusing them.
    for (const name of PINNED_RULE_NAMES) {
      // `reportsRule` interpolates the name into a RegExp without escaping it.
      // Asserted, not assumed: a rule named `sim.*` would otherwise match
      // anything at all and every pin in this file would go vacuously green.
      expect(/^[a-z][a-z0-9-]*$/.test(name), name).toBe(true)
      for (const other of PINNED_RULE_NAMES) {
        if (other === name) continue
        expect(reportsRule(reportLine(other), name), `'${name}' matched a report of '${other}'`).toBe(false)
      }
      // ...and each name still matches its OWN report, so the loop above
      // cannot be satisfied by a matcher that matches nothing at all.
      expect(reportsRule(reportLine(name), name), name).toBe(true)
    }
  })

  it('passes on the real source tree', () => {
    // The one case that must cruise the REAL tree, because it is the claim
    // `npm run depcruise` makes. It writes nothing, and nothing can race with it
    // now that no test in this file writes into `src/` at all.
    expect(runDepcruise(REPO_ROOT).code).toBe(0)
  })

  it('leaves no probe in the real source tree, which is the whole point of the temp root', () => {
    // Asserted rather than described in a comment: write all four probes,
    // confirm the cruise SAW them (it fails, by rule name), and confirm that not
    // one of the four paths exists in the repo afterward. An `afterEach` could
    // only ever have said "not any more".
    const { code, output } = cruiseWithProbes({
      [PROBE]: "import { readFileSync } from 'node:fs'\nexport const probe = readFileSync\n",
      [ASSISTS_PROBE]: "import { showFailure } from '../render/failure.js'\nexport const probe = showFailure\n",
      [CYCLE_A]: "import { b } from './__cycle_b__.js'\nexport const a = b\n",
      [CYCLE_B]: "import { a } from './__cycle_a__.js'\nexport const b = a\n",
    })
    expect(code).not.toBe(0)
    expect(reportsRule(output, 'sim-must-not-import-node-core'), output).toBe(true)
    for (const probe of PROBE_FILES) expect(existsSync(join(REPO_ROOT, probe)), probe).toBe(false)
    // And the real tree still cruises clean immediately afterward, which is the
    // property the flake broke.
    expect(runDepcruise(REPO_ROOT).code).toBe(0)
  })

  it.each(PROBE_FILES)('keeps %s git-ignored, as a backstop behind the temp root', (probe) => {
    // Final review, 2026-09-13: .gitignore covered ONE of the four paths this
    // file writes, with a comment explaining exactly why that one had to be
    // ignored -- the other three were added by later tasks that did not read
    // it. An interrupted run (Ctrl-C, CI timeout, OOM) leaves an untracked
    // `node:fs` or `three` import inside the tree that must stay
    // browser-loadable, which is the hazard the original entry exists to
    // prevent, and it is equally a hazard for a file called `__cycle_a__.ts`.
    //
    // Asserted rather than restated in a comment, because the rot here was a
    // comment describing a list that had moved: this fails the moment a fifth
    // probe path is written without a matching ignore rule. `git check-ignore`
    // exits 0 when the path is ignored and 1 when it is not; the path need not
    // exist, which is why this can run without writing anything.
    expect(isGitIgnored(probe)).toBe(true)
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
    const { code, output } = cruiseWithProbes({
      [PROBE]: "import { Vector3 } from 'three'\nexport const probe = Vector3\n",
    })
    expect(code).not.toBe(0)
    expect(reportsRule(output, 'sim-must-not-import-render-libs'), output).toBe(true)
  })

  it('fails on a circular import', () => {
    // The fifth rule, and the other one that had no probe. Two files that
    // import each other, both inside sim/, so the cycle is unambiguous.
    const { code, output } = cruiseWithProbes({
      [CYCLE_A]: "import { b } from './__cycle_b__.js'\nexport const a = b\n",
      [CYCLE_B]: "import { a } from './__cycle_a__.js'\nexport const b = a\n",
    })
    expect(code).not.toBe(0)
    expect(reportsRule(output, 'no-circular'), output).toBe(true)
  })

  it('fails when sim/ imports render/', () => {
    const { code, output } = cruiseWithProbes({ [PROBE]: "import { showFailure } from '../render/failure.js'\nexport const probe = showFailure\n" })
    expect(code).not.toBe(0)
    expect(reportsRule(output, 'sim-must-not-import-render'), output).toBe(true)
  })

  // Finding I1: `src/sim` must also load in a browser, so a Node core import
  // there means a later bundler either fails or silently shims it. The
  // docstring on the old `loadAircraftSpec` already asserted "Node-only
  // loader" -- a comment describing a constraint nothing enforced. Same
  // negative-test pattern as the render boundary above, for the same reason:
  // a lint or depcruise rule that is never seen to fail is indistinguishable
  // from one that does not match anything.
  it('fails when sim/ imports a Node core module', () => {
    const { code, output } = cruiseWithProbes({ [PROBE]: "import { readFileSync } from 'node:fs'\nexport const probe = readFileSync\n" })
    expect(code).not.toBe(0)
    expect(reportsRule(output, 'sim-must-not-import-node-core'), output).toBe(true)
  })

  it('fails when sim/ imports assists/', () => {
    // Plan 3 Task 2's review: the "sim/ must not import assists/" ruling was
    // enforced only as a side effect of `no-circular`, because assists/ imports
    // sim/ today and the pair therefore forms a cycle. That is real
    // enforcement, but it names the wrong thing in the failure output and it
    // disappears the day an assist stops importing sim/ -- so `no-circular`
    // is exactly the "rule that happens to cover it" this file exists to
    // replace with a named one. The assertion below is on the NAME, so a
    // cycle report alone would not satisfy it.
    //
    // The probe imports a VALUE, not a type: with this config a type-only
    // import produces no dependency edge at all (see `no-circular`'s comment
    // in .dependency-cruiser.cjs), so a `import type` probe would pass for the
    // wrong reason.
    const { code, output } = cruiseWithProbes({ [PROBE]: "import { applyAssists } from '../assists/index.js'\nexport const probe = applyAssists\n" })
    expect(code).not.toBe(0)
    expect(reportsRule(output, 'sim-must-not-import-assists'), output).toBe(true)
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
    const { code, output } = cruiseWithProbes({ [ASSISTS_PROBE]: "import { showFailure } from '../render/failure.js'\nexport const probe = showFailure\n" })
    expect(code).not.toBe(0)
    expect(reportsRule(output, 'assists-must-not-import-render'), output).toBe(true)
  })

  it('fails when sim/ imports input/', () => {
    // The probe imports a file that EXISTS. dependency-cruiser reports no
    // violation for an unresolvable import (verified 2026-09-12), so a probe
    // against a not-yet-written module passes for the wrong reason.
    const { code, output } = cruiseWithProbes({ [PROBE]: "import { BINDINGS } from '../input/bindings.js'\nexport const probe = BINDINGS\n" })
    expect(code).not.toBe(0)
    expect(reportsRule(output, 'sim-must-not-import-input'), output).toBe(true)
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

describe('assists/ forbids browser globals and nondeterminism, same as sim/ (Plan 3)', () => {
  // Task 1 extended eslint.config.js's `files` glob (`no-restricted-globals`
  // / `no-restricted-properties`) to cover `src/assists/**/*.ts`, on the
  // Global Constraints' instruction that assists/ does deterministic
  // arithmetic on the pilot's command exactly like sim/ does -- but that
  // task left it unprobed, unlike every rule above. Task 2 is the first task
  // writing real arithmetic in `src/assists/` (`autoRudder`'s sideslip
  // maths), so it is the one that can no longer defer closing this: an
  // unprobed rule is indistinguishable from one that matches nothing, per
  // this file's own standard applied to every other rule in it.
  it('reports a severity-2 error for Math.random() written in src/assists/', async () => {
    const eslint = new ESLint({})
    const results = await eslint.lintText(
      'export const bad = Math.random()\n',
      { filePath: 'src/assists/__lint_probe__.ts' },
    )
    const messages = results.flatMap((r) => r.messages)
    expect(messages.map((m) => m.ruleId)).toContain('no-restricted-properties')
    // SEVERITY, not just presence -- see the identical comment on the sim/
    // probe above for why (2026-09-13 review: a rule downgraded to 'warn'
    // left the whole suite, including `eslint src tests tools
    // --max-warnings 0`, green).
    for (const m of messages) expect(m.severity, m.ruleId ?? '').toBe(2)
  })
})

describe('the Earth-curvature sink has exactly one home (Plan 5 Task 1)', () => {
  // Source-level, in the style of this file's existing import rules, because
  // the failure it guards is not a type error or a runtime throw: it is one
  // surface sinking and another not, which renders as geography. Plan 4
  // shipped exactly that and it took a human at the controls to see it.
  it('no file outside src/render/horizon.ts computes the d^2/2R expression', () => {
    const offenders = sourceFilesUnder('src')
      .filter((f) => f.path !== 'src/render/horizon.ts')
      .filter((f) => /2\s*\*\s*EARTH_RADIUS_M/.test(f.text))
      .map((f) => f.path)
    expect(offenders).toEqual([])
  })

  it('every surface that is drawn to the horizon imports and calls the sink', () => {
    for (const path of ['src/render/terrain/mesh.ts', 'src/render/ocean/mesh.ts']) {
      const source = sourceFilesUnder('src').find((f) => f.path === path)!.text
      expect(source).toMatch(/import\s*\{[^}]*horizonSinkNode[^}]*\}\s*from/)
      expect(source).toMatch(/horizonSinkNode\(distanceM\)/)
      expect(source).toContain('material.positionNode =')
    }
  })
})
