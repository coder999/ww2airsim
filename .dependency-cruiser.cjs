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
        'Forbids RUNTIME import cycles only. loop.ts -> flight/model.ts (a value ' +
        'import, for step/DT) and model.ts -> loop.ts (`import type { SimContext }`) ' +
        'already form a graph cycle, but the back edge is type-only and is erased ' +
        'by the compiler, so nothing cycles at runtime. `viaOnly.dependencyTypesNot` ' +
        'restricts the match to cycles whose every edge is a real (non-type-only) ' +
        'dependency, so that existing cycle passes and a later task turning the ' +
        'back edge into a real import would not. Verified 2026-09-12: passes on ' +
        'the real tree; a scratch two-file value-import cycle trips it by name, ' +
        'then was removed.',
      severity: 'error',
      from: {},
      to: {
        circular: true,
        viaOnly: { dependencyTypesNot: ['type-only'] },
      },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
  },
}
