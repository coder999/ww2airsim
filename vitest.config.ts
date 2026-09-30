import { availableParallelism } from 'node:os'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Vitest's default is one worker per thread less one (31 on ryzen). Measured 2026-09-29 on
    // ryzen: the full suite took 176-186 s with 31 or 16 workers and one different test timing out
    // at 30 s each run (tests that take 2-4 s alone ran 8-10x slower), but 155 s and all green
    // with 8. Past 8 the workers only fight over the machine, so more is slower and flakier.
    maxWorkers: Math.min(8, Math.max(1, availableParallelism() - 1)),
    testTimeout: 30_000,
    // Hooks get the same allowance: the furball soak runs in beforeAll and hit
    // the 10 s default under full-suite contention on ryzen (R1 and R2 handoffs;
    // 2.7 s alone), so a heavy setup is not held to a stricter bound than a test.
    hookTimeout: 30_000,
  },
})
