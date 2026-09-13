module.exports = {
  forbidden: [
    {
      name: 'sim-must-not-import-render',
      comment: 'Spec §3: sim/ never imports render/. This keeps ~90% of the logic testable in Node.',
      severity: 'error',
      from: { path: '^src/sim' },
      to: { path: '^src/render' },
    },
    {
      name: 'sim-must-not-import-render-libs',
      comment: 'Spec §3: no rendering libraries in the simulation, directly or transitively.',
      severity: 'error',
      from: { path: '^src/sim' },
      to: { path: 'node_modules/(three|@webgpu)' },
    },
    {
      name: 'sim-must-not-import-node-core',
      comment:
        'Finding I1: src/sim is the one tree that must also load in a browser, ' +
        'so a Node core import here (node:fs, node:path, ...) means a later ' +
        'bundler either fails or silently shims it. The Node-only content ' +
        'loader lives in tools/content/load.ts for exactly this reason. ' +
        'tests/architecture/boundary.test.ts proves this rule bites.',
      severity: 'error',
      from: { path: '^src/sim' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'no-circular',
      comment:
        'Forbids import cycles. With this config (no `tsPreCompilationDeps`, no ' +
        "`parser: 'tsc'`), a type-only import (e.g. model.ts's `import type { " +
        "SimContext } from '../loop.js'`) produces NO dependency edge at all -- " +
        'verified 2026-09-12: `model.ts` has zero edges to `loop.ts` in the real ' +
        'graph, and `loop.ts -> model.ts` reports circular: false. So this rule ' +
        'currently sees only runtime imports; a plain `to: { circular: true }` is ' +
        'correct and sufficient. If anyone later enables `tsPreCompilationDeps` or ' +
        "`parser: 'tsc'`, type-only edges start appearing in the graph and this " +
        "rule's behaviour changes -- revisit this comment then. Verified 2026-09-12: " +
        'passes on the real tree; a scratch two-file value-import cycle trips it by ' +
        'name, then was removed.',
      severity: 'error',
      from: {},
      to: {
        circular: true,
      },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
  },
}
