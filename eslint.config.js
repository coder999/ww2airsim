import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['node_modules', 'dist'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/sim/**/*.ts', 'tools/**/*.ts'],
    rules: {
      // Spec §3 + Global Constraints: determinism and no browser globals.
      'no-restricted-globals': ['error',
        { name: 'window', message: 'sim/ must not touch browser globals (spec §3).' },
        { name: 'document', message: 'sim/ must not touch browser globals (spec §3).' },
        { name: 'navigator', message: 'sim/ must not touch browser globals (spec §3).' },
        { name: 'performance', message: 'sim/ must not read wall-clock time (spec §3).' },
      ],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Use the seeded PRNG from src/sim/rng.ts (spec §3).' },
        { object: 'Date', property: 'now', message: 'sim/ must not read wall-clock time (spec §3).' },
      ],
    },
  },
)
