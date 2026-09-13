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
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
  },
}
