import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['node_modules', 'dist'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // A leading underscore is a positive, greppable signal that a
      // parameter is deliberately unused -- e.g. one kept only to match a
      // sibling function's call shape (src/input/lookAround.ts's `_dt` and
      // `_previous`). Settled 2026-09-13 (Task 9 review) after three tasks
      // in a row independently invented a different workaround for the same
      // rule; unlike a scattered `eslint-disable`, this doesn't weaken
      // detection for any variable that isn't deliberately marked.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/sim/**/*.ts', 'src/assists/**/*.ts', 'tools/**/*.ts'],
    rules: {
      // Spec §3 + Global Constraints: determinism and no browser globals.
      // This denylist is the ONLY guard between sim/ and a browser global. tsc has
      // never been one: with no explicit `lib`, TypeScript's ES2022 default already
      // includes DOM, and a sim/ file using localStorage typechecked clean before
      // Plan 2 (verified 2026-09-12). Widened in Plan 2 from four names to the
      // storage, network and scheduling globals (Plan 1 review, finding M5).
      // Plan 3 Global Constraints: `src/assists/` is new and inherits this same
      // rule set -- it does deterministic arithmetic on the pilot's command,
      // exactly like `sim/`, so the same denylist applies for the same reason.
      'no-restricted-globals': ['error',
        { name: 'window', message: 'sim/ must not touch browser globals (spec §3).' },
        { name: 'document', message: 'sim/ must not touch browser globals (spec §3).' },
        { name: 'navigator', message: 'sim/ must not touch browser globals (spec §3).' },
        { name: 'performance', message: 'sim/ must not read wall-clock time (spec §3).' },
        { name: 'localStorage', message: 'sim/ must not touch browser globals (spec §3).' },
        { name: 'sessionStorage', message: 'sim/ must not touch browser globals (spec §3).' },
        { name: 'fetch', message: 'sim/ must not touch browser globals (spec §3).' },
        { name: 'self', message: 'sim/ must not touch browser globals (spec §3).' },
        { name: 'requestAnimationFrame', message: 'sim/ must not touch browser globals (spec §3).' },
        { name: 'crypto', message: 'Use the seeded PRNG from src/sim/rng.ts (spec §3).' },
        { name: 'XMLHttpRequest', message: 'sim/ must not touch browser globals (spec §3).' },
      ],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Use the seeded PRNG from src/sim/rng.ts (spec §3).' },
        { object: 'Date', property: 'now', message: 'sim/ must not read wall-clock time (spec §3).' },
      ],
    },
  },
)
