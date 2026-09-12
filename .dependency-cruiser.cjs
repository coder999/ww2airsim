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
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
  },
}
